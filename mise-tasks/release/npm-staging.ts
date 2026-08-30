#!/usr/bin/env bun
//MISE description="Stage npm packages: six per-platform binaries plus the launcher umbrella"
//MISE dir="{{ config_root }}"

import {
	chmodSync,
	copyFileSync,
	cpSync,
	existsSync,
	mkdirSync,
	rmSync,
	writeFileSync,
} from 'node:fs';
import { join } from 'node:path';
import { stdout } from 'node:process';
import manifest from '@pkg' with { type: 'json' };

export const packageName = '@victor-software-house/exa-cli';

export const platforms = [
	{ platform: 'darwin-arm64', os: 'darwin', cpu: 'arm64' },
	{ platform: 'darwin-x64', os: 'darwin', cpu: 'x64' },
	{ platform: 'linux-x64', os: 'linux', cpu: 'x64', libc: 'glibc' },
	{ platform: 'linux-arm64', os: 'linux', cpu: 'arm64' },
	{ platform: 'linux-x64-musl', os: 'linux', cpu: 'x64', libc: 'musl' },
	{ platform: 'windows-x64', os: 'win32', cpu: 'x64' },
] as const;

export function platformPackageName(platform: string): string {
	return `${packageName}-${platform}`;
}

export type StagedPackage = {
	dir: string;
	name: string;
	version: string;
};

type NpmManifest = Record<string, string | string[] | Record<string, string>>;

function writeManifest(dir: string, staged: NpmManifest): void {
	writeFileSync(join(dir, 'package.json'), `${JSON.stringify(staged, null, '\t')}\n`);
}

export function stagePlatforms(outDir = 'dist/npm', rawDir = 'dist/binaries/raw'): StagedPackage[] {
	const staged: StagedPackage[] = [];
	for (const target of platforms) {
		const binaryName = target.os === 'win32' ? 'exa.exe' : 'exa';
		const source = join(rawDir, target.platform, binaryName);
		if (!existsSync(source)) {
			throw new Error(`missing compiled binary: ${source} (run mise run compile first)`);
		}
		const dir = join(outDir, target.platform);
		rmSync(dir, { recursive: true, force: true });
		mkdirSync(join(dir, 'bin'), { recursive: true });
		const stagedBinary = join(dir, 'bin', binaryName);
		copyFileSync(source, stagedBinary);
		chmodSync(stagedBinary, 0o755);
		const base = {
			name: platformPackageName(target.platform),
			version: manifest.version,
			description: `exa-cli compiled binary for ${target.platform}`,
			license: manifest.license,
			repository: manifest.repository,
			os: [target.os],
			cpu: [target.cpu],
			files: ['bin'],
		};
		writeManifest(dir, 'libc' in target ? { ...base, libc: [target.libc] } : base);
		staged.push({ dir, name: base.name, version: base.version });
	}
	return staged;
}

export function stageUmbrella(outDir = 'dist/npm/umbrella'): StagedPackage {
	rmSync(outDir, { recursive: true, force: true });
	mkdirSync(join(outDir, 'bin'), { recursive: true });
	copyFileSync('bin/exa.mjs', join(outDir, 'bin', 'exa.mjs'));
	for (const entry of ['skills', 'README.md', 'CHANGELOG.md', 'LICENSE']) {
		cpSync(entry, join(outDir, entry), { recursive: true });
	}
	writeManifest(outDir, {
		name: manifest.name,
		version: manifest.version,
		description: manifest.description,
		license: manifest.license,
		author: manifest.author,
		type: 'module',
		bin: { exa: './bin/exa.mjs' },
		files: ['bin', 'skills', 'README.md', 'CHANGELOG.md', 'LICENSE'],
		engines: { node: '>=20' },
		publishConfig: manifest.publishConfig,
		repository: manifest.repository,
		homepage: manifest.homepage,
		bugs: manifest.bugs,
		keywords: manifest.keywords,
		optionalDependencies: Object.fromEntries(
			platforms.map((target) => [platformPackageName(target.platform), manifest.version]),
		),
	});
	return { dir: outDir, name: manifest.name, version: manifest.version };
}

if (import.meta.main) {
	const umbrellaOnly = process.argv.includes('--umbrella-only');
	if (!umbrellaOnly) {
		stagePlatforms();
	}
	stageUmbrella();
	stdout.write(`staged npm packages under dist/npm${umbrellaOnly ? ' (umbrella only)' : ''}\n`);
}
