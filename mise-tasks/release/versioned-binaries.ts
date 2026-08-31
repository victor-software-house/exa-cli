#!/usr/bin/env bun
//MISE description="Upload compiled archives to the versioned GitHub Release"
//MISE dir="{{ config_root }}"

import { stderr, stdout } from 'node:process';
import { version } from '@pkg' with { type: 'json' };
import { thisCommitBumpedVersion } from 'bun-release';
import { packageArchives } from '../compile/archives';
import { requireReleaseArchives, upload } from './binaries';

if (!(await thisCommitBumpedVersion(version))) {
	stdout.write(`skip versioned binaries: HEAD did not bump package.json (v${version})\n`);
	process.exit(0);
}

const tag = `v${version}`;
const view = Bun.spawnSync({
	cmd: ['gh', 'release', 'view', tag],
	stdout: 'ignore',
	stderr: 'ignore',
});
if (view.exitCode !== 0) {
	stderr.write(`GitHub release ${tag} does not exist yet.\n`);
	process.exit(1);
}

await packageArchives();
upload(tag, await requireReleaseArchives());
