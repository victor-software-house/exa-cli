#!/usr/bin/env bun
//MISE description="Stage npm packages: six per-platform binaries plus the launcher umbrella"
//MISE dir="{{ config_root }}"

import {
	chmodSync,
	copyFileSync,
	cpSync,
	existsSync,
	mkdirSync,
	readFileSync,
	rmSync,
	writeFileSync,
} from 'node:fs';
import { join } from 'node:path';
import { stdout } from 'node:process';
import { fileURLToPath } from 'node:url';
import manifest from '@pkg' with { type: 'json' };
import { Liquid } from 'liquidjs';
import { match, P } from 'ts-pattern';

type PlatformTarget = {
	platform: string;
	os: 'darwin' | 'linux' | 'win32';
	cpu: 'arm64' | 'x64';
	libc?: 'glibc' | 'musl';
};

export const platforms: readonly PlatformTarget[] = [
	{ platform: 'darwin-arm64', os: 'darwin', cpu: 'arm64' },
	{ platform: 'darwin-x64', os: 'darwin', cpu: 'x64' },
	{ platform: 'linux-x64', os: 'linux', cpu: 'x64', libc: 'glibc' },
	{ platform: 'linux-arm64', os: 'linux', cpu: 'arm64' },
	{ platform: 'linux-x64-musl', os: 'linux', cpu: 'x64', libc: 'musl' },
	{ platform: 'windows-x64', os: 'win32', cpu: 'x64' },
];

type RepoManifest = typeof manifest;

// liquidjs strictVariables rejects absent properties and Liquid treats empty
// strings as truthy; TemplateTarget carries libc as '' when the target has
// none and the template guards on `target.libc != ''`.
type TemplateTarget = {
	platform: string;
	os: PlatformTarget['os'];
	cpu: PlatformTarget['cpu'];
	libc: string;
};

function templateTarget(target: PlatformTarget): TemplateTarget {
	return { ...target, libc: target.libc ?? '' };
}

export type StagedPackage = {
	dir: string;
	name: string;
	version: string;
};

const templateDir = fileURLToPath(new URL('./npm', import.meta.url));
const liquid = new Liquid({ cache: true, strictFilters: true, strictVariables: true });
const platformTemplate = liquid.parse(
	readFileSync(join(templateDir, 'platform.package.json.liquid'), 'utf8'),
);
const umbrellaTemplate = liquid.parse(
	readFileSync(join(templateDir, 'umbrella.package.json.liquid'), 'utf8'),
);

type PlatformTemplateData = { manifest: RepoManifest; target: TemplateTarget };
type UmbrellaTemplateData = { manifest: RepoManifest; platforms: readonly PlatformTarget[] };

function render(
	template: ReturnType<typeof liquid.parse>,
	data: PlatformTemplateData | UmbrellaTemplateData,
): string {
	return match(liquid.renderSync(template, data))
		.with(P.string, (text) => text)
		.otherwise(() => {
			throw new Error('liquid render did not return a string');
		});
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
		writeFileSync(
			join(dir, 'package.json'),
			render(platformTemplate, { manifest, target: templateTarget(target) }),
		);
		staged.push({ dir, name: `${manifest.name}-${target.platform}`, version: manifest.version });
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
	writeFileSync(join(outDir, 'package.json'), render(umbrellaTemplate, { manifest, platforms }));
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
