#!/usr/bin/env bun
//MISE description="Install the published umbrella in isolation and run exa --version through the launcher"
//MISE dir="{{ config_root }}"

import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { env, stdout } from 'node:process';
import { name, version } from '@pkg' with { type: 'json' };
import { $ } from 'bun';

const installDir = mkdtempSync(join(tmpdir(), 'exa-cli-npm-smoke-'));
const isolatedEnv = {
	...env,
	BUN_INSTALL_CACHE_DIR: mkdtempSync(join(tmpdir(), 'exa-cli-npm-cache-')),
	HOME: installDir,
};
await $`bun add ${`${name}@${version}`}`.cwd(installDir).env(isolatedEnv);
const binary = join(
	installDir,
	'node_modules',
	'.bin',
	process.platform === 'win32' ? 'exa.exe' : 'exa',
);
const reported = (await $`${binary} --version`.cwd(installDir).env(isolatedEnv).text()).trim();
if (reported !== version) {
	throw new Error(`npm smoke: expected --version ${version}, got ${JSON.stringify(reported)}`);
}
stdout.write(`smoked ${name}@${version}\n`);
