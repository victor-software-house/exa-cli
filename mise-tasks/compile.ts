#!/usr/bin/env bun
//MISE description="Cross-compile standalone binaries into mise-autodetectable archives"

import { createHash } from 'node:crypto';
import { mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { $ } from 'bun';

const targets = [
	{ bunTarget: 'bun-darwin-arm64', platform: 'darwin-arm64', kind: 'tar' },
	{ bunTarget: 'bun-darwin-x64', platform: 'darwin-x64', kind: 'tar' },
	{ bunTarget: 'bun-linux-x64', platform: 'linux-x64', kind: 'tar' },
	{ bunTarget: 'bun-linux-arm64', platform: 'linux-arm64', kind: 'tar' },
	{ bunTarget: 'bun-linux-x64-musl', platform: 'linux-x64-musl', kind: 'tar' },
	{ bunTarget: 'bun-windows-x64', platform: 'windows-x64', kind: 'zip' },
] as const;

export const archiveNames = [
	'exa-darwin-arm64.tar.gz',
	'exa-darwin-x64.tar.gz',
	'exa-linux-x64.tar.gz',
	'exa-linux-arm64.tar.gz',
	'exa-linux-x64-musl.tar.gz',
	'exa-windows-x64.exe.zip',
	'SHA256SUMS',
] as const;

export async function compileArchives(): Promise<void> {
	const outDir = 'dist/binaries';
	rmSync(outDir, { recursive: true, force: true });
	mkdirSync(outDir, { recursive: true });

	const checksums: string[] = [];

	for (const target of targets) {
		const workDir = join(outDir, `.work-${target.platform}`);
		mkdirSync(workDir, { recursive: true });
		const binaryName = target.kind === 'zip' ? 'exa.exe' : 'exa';
		const compiled = join(workDir, binaryName);
		await $`bun build --compile --target=${target.bunTarget} --outfile=${compiled} src/cli.ts`;

		const archiveName =
			target.kind === 'zip' ? `exa-${target.platform}.exe.zip` : `exa-${target.platform}.tar.gz`;
		const archivePath = join(outDir, archiveName);
		if (target.kind === 'zip') {
			await $`zip -j -q ${archivePath} ${compiled}`;
		} else {
			await $`tar -C ${workDir} -czf ${archivePath} ${binaryName}`;
		}
		rmSync(workDir, { recursive: true, force: true });

		const digest = createHash('sha256')
			.update(Buffer.from(await Bun.file(archivePath).arrayBuffer()))
			.digest('hex');
		checksums.push(`${digest}  ${archiveName}`);
	}

	writeFileSync(join(outDir, 'SHA256SUMS'), `${checksums.join('\n')}\n`);

	for (const name of archiveNames) {
		const path = join(outDir, name);
		if (!(await Bun.file(path).exists())) {
			throw new Error(`compile did not produce ${path}`);
		}
	}
}

if (import.meta.main) {
	await compileArchives();
}
