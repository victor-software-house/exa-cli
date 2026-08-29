#!/usr/bin/env bun
//MISE description="Create-or-clobber GitHub Release v0.0.0 with compiled archives"

import { join } from 'node:path';
import { stderr } from 'node:process';
import packageJson from '@pkg' with { type: 'json' };
import { archiveNames } from '../compile';

const rollingTag = 'v0.0.0';
const outDir = 'dist/binaries';
const files = archiveNames.map((name) => join(outDir, name));

for (const path of files) {
	if (!(await Bun.file(path).exists())) {
		stderr.write(`Missing compiled archive: ${path}\n`);
		process.exit(1);
	}
}

ensureRelease(
	rollingTag,
	'Rolling binary channel for mise. Assets are clobbered on every main push.',
);
upload(rollingTag, files);

// TODO(publish-gate): blocked until @victor-software-house/anti-slop is on npm. Re-enable; do not delete.
if (publishGateEnabled()) {
	const tag = `v${packageJson.version}`;
	const view = Bun.spawnSync({
		cmd: ['gh', 'release', 'view', tag],
		stdout: 'ignore',
		stderr: 'ignore',
	});
	if (view.exitCode !== 0) {
		stderr.write(`GitHub release ${tag} does not exist yet.\n`);
		process.exit(1);
	}
	upload(tag, files);
}

function publishGateEnabled(): boolean {
	// TODO(publish-gate): blocked until @victor-software-house/anti-slop is on npm. Re-enable; do not delete.
	return false;
}

function ensureRelease(tag: string, notes: string): void {
	const view = Bun.spawnSync({
		cmd: ['gh', 'release', 'view', tag],
		stdout: 'ignore',
		stderr: 'ignore',
	});
	if (view.exitCode === 0) {
		return;
	}
	const created = Bun.spawnSync({
		cmd: ['gh', 'release', 'create', tag, '--title', tag, '--notes', notes, '--latest=false'],
		stdout: 'inherit',
		stderr: 'inherit',
	});
	if (created.exitCode !== 0) {
		process.exit(created.exitCode ?? 1);
	}
}

function upload(tag: string, paths: string[]): void {
	const result = Bun.spawnSync({
		cmd: ['gh', 'release', 'upload', tag, ...paths, '--clobber'],
		stdout: 'inherit',
		stderr: 'inherit',
	});
	if (result.exitCode !== 0) {
		process.exit(result.exitCode ?? 1);
	}
}
