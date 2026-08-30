#!/usr/bin/env bun
//MISE description="Publish the six platform packages, then the launcher umbrella, to public npm"
//MISE dir="{{ config_root }}"

import { env, stdout } from 'node:process';
import { name, version } from '@pkg' with { type: 'json' };
import { $ } from 'bun';
import { npmOidcPublishToken, registryHasVersion, thisCommitBumpedVersion } from 'bun-release';
import { stagePlatforms, stageUmbrella } from './release/npm-staging';

async function waitForRegistryVersion(
	packageName: string,
	packageVersion: string,
	remaining = 11,
): Promise<void> {
	if (await registryHasVersion(packageName, packageVersion)) {
		return;
	}
	if (remaining === 0) {
		throw new Error(`npm registry did not observe ${packageName}@${packageVersion}`);
	}
	await Bun.sleep(5e3);
	return waitForRegistryVersion(packageName, packageVersion, remaining - 1);
}

if (!(await thisCommitBumpedVersion(version))) {
	stdout.write(`skip publish: HEAD did not bump package.json (${name}@${version})\n`);
	process.exit(0);
}

const staged = [...stagePlatforms(), stageUmbrella()];
for (const pkg of staged) {
	const specifier = `${pkg.name}@${pkg.version}`;
	if (await registryHasVersion(pkg.name, pkg.version)) {
		stdout.write(`skip publish: ${specifier} is already on npm\n`);
		continue;
	}
	const token = await npmOidcPublishToken(pkg.name, env);
	await $`bun publish --access public --tolerate-republish`
		.cwd(pkg.dir)
		.env({ ...env, BUN_CONFIG_TOKEN: token });
	await waitForRegistryVersion(pkg.name, pkg.version);
	stdout.write(`published ${specifier}\n`);
}
