#!/usr/bin/env bun
//MISE description="Compile the standalone binary for the host platform into dist/binaries/raw"
//MISE dir="{{ config_root }}"

import { existsSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { argv, stdout } from 'node:process';
import { $ } from 'bun';

export const targets = [
	{ bunTarget: 'bun-darwin-arm64', platform: 'darwin-arm64', kind: 'tar' },
	{ bunTarget: 'bun-darwin-x64', platform: 'darwin-x64', kind: 'tar' },
	{ bunTarget: 'bun-linux-x64', platform: 'linux-x64', kind: 'tar' },
	{ bunTarget: 'bun-linux-arm64', platform: 'linux-arm64', kind: 'tar' },
	{ bunTarget: 'bun-linux-x64-musl', platform: 'linux-x64-musl', kind: 'tar' },
	{ bunTarget: 'bun-windows-x64', platform: 'windows-x64', kind: 'zip' },
] as const;

export type Target = (typeof targets)[number];

export const archiveNames = [
	'exa-darwin-arm64.tar.gz',
	'exa-darwin-x64.tar.gz',
	'exa-linux-x64.tar.gz',
	'exa-linux-arm64.tar.gz',
	'exa-linux-x64-musl.tar.gz',
	'exa-windows-x64.exe.zip',
	'SHA256SUMS',
] as const;

export const outDir = 'dist/binaries';

export function binaryName(target: Target): string {
	return target.kind === 'zip' ? 'exa.exe' : 'exa';
}

export function rawBinaryPath(target: Target): string {
	return join(outDir, 'raw', target.platform, binaryName(target));
}

/**
 * `bun build --compile` only embeds the native credential addon when the build
 * host matches the target, so every platform is built on its own runner.
 */
export function hostPlatform(): Target['platform'] {
	const { platform, arch } = process;
	if (platform === 'darwin') {
		return arch === 'arm64' ? 'darwin-arm64' : 'darwin-x64';
	}
	if (platform === 'win32') {
		return 'windows-x64';
	}
	if (platform === 'linux') {
		if (arch === 'arm64') {
			return 'linux-arm64';
		}
		return isMusl() ? 'linux-x64-musl' : 'linux-x64';
	}
	throw new Error(`No release target for ${platform}-${arch}.`);
}

function isMusl(): boolean {
	return (
		existsSync('/lib/ld-musl-x86_64.so.1') ||
		existsSync('/lib/ld-musl-aarch64.so.1') ||
		existsSync('/etc/alpine-release')
	);
}

export function targetFor(platform: string): Target {
	const target = targets.find((candidate) => candidate.platform === platform);
	if (target === undefined) {
		throw new Error(
			`Unknown platform ${platform}. Expected one of ${targets.map((t) => t.platform).join(', ')}.`,
		);
	}
	return target;
}

export async function compileBinary(platform: string = hostPlatform()): Promise<Target> {
	const target = targetFor(platform);
	const host = hostPlatform();
	if (target.platform !== host) {
		throw new Error(
			`Refusing to cross-compile ${target.platform} on ${host}. ` +
				'The native credential addon is only embedded for the build host, so a ' +
				'cross-compiled binary fails at startup. Build this target on its own runner.',
		);
	}

	const destination = rawBinaryPath(target);
	mkdirSync(join(outDir, 'raw', target.platform), { recursive: true });
	await $`bun build --compile --target=${target.bunTarget} --outfile=${destination} src/cli.ts`;
	return target;
}

if (import.meta.main) {
	const requested = argv[2];
	const target = await compileBinary(requested);
	stdout.write(`compiled ${target.platform} → ${rawBinaryPath(target)}\n`);
}
