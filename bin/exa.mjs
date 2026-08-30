#!/usr/bin/env node
// Node launcher for exa-cli: resolves the platform binary from the
// optionalDependencies-selected package and execs it. The binary embeds Bun,
// so no runtime beyond Node >=20 is required here.

import { spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';

const require = createRequire(import.meta.url);

const scope = '@victor-software-house';

function platformPackages() {
	const id = `${process.platform}-${process.arch}`;
	if (id === 'win32-x64') {
		return [`${scope}/exa-cli-windows-x64`];
	}
	if (id === 'linux-x64') {
		// os/cpu cannot distinguish glibc from musl; npm selects one via libc,
		// so probe both and use whichever package resolved.
		return [`${scope}/exa-cli-linux-x64`, `${scope}/exa-cli-linux-x64-musl`];
	}
	if (id === 'darwin-x64' || id === 'darwin-arm64' || id === 'linux-arm64') {
		return [`${scope}/exa-cli-${id}`];
	}
	return [];
}

function findBinary() {
	for (const pkg of platformPackages()) {
		try {
			const manifest = require.resolve(`${pkg}/package.json`);
			const binary = join(
				dirname(manifest),
				'bin',
				process.platform === 'win32' ? 'exa.exe' : 'exa',
			);
			if (existsSync(binary)) {
				return binary;
			}
		} catch {
			// platform package not installed; try the next candidate
		}
	}
	return undefined;
}

const binary = findBinary();
if (binary === undefined) {
	process.stderr.write(
		`exa-cli: no binary for ${process.platform}-${process.arch}.\n` +
			'Reinstall with `bun add -g @victor-software-house/exa-cli` or `npm install -g @victor-software-house/exa-cli`.\n',
	);
	process.exit(1);
}

const child = spawn(binary, process.argv.slice(2), { stdio: 'inherit' });

for (const signal of ['SIGINT', 'SIGTERM', 'SIGHUP']) {
	process.on(signal, () => {
		if (!child.killed) {
			child.kill(signal);
		}
	});
}

child.on('error', (error) => {
	process.stderr.write(`${error}\n`);
	process.exit(1);
});

child.on('exit', (code, signal) => {
	if (signal) {
		process.kill(process.pid, signal);
	} else {
		process.exit(code ?? 1);
	}
});
