#!/usr/bin/env bun
//MISE description="Upload compiled binaries to the GitHub release for this version"

import packageJson from '@pkg' with { type: 'json' };

const version = packageJson.version;
const tag = `v${version}`;
const glob = new Bun.Glob('dist/binaries/*');
const files = [...glob.scanSync('.')];
if (files.length === 0) {
	console.error('No compiled binaries found under dist/binaries/.');
	process.exit(1);
}

const view = Bun.spawnSync({
	cmd: ['gh', 'release', 'view', tag],
	stdout: 'ignore',
	stderr: 'ignore',
});
if (view.exitCode !== 0) {
	console.error(`GitHub release ${tag} does not exist yet.`);
	process.exit(1);
}

const upload = Bun.spawnSync({
	cmd: ['gh', 'release', 'upload', tag, ...files, '--clobber'],
	stdout: 'inherit',
	stderr: 'inherit',
});
process.exit(upload.exitCode ?? 1);
