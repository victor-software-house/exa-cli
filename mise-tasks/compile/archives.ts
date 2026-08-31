#!/usr/bin/env bun
//MISE description="Package the per-platform raw binaries into mise-autodetectable archives"
//MISE dir="{{ config_root }}"

import { createHash } from 'node:crypto';
import { chmodSync, copyFileSync, existsSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { $ } from 'bun';
import { archiveNames, binaryName, outDir, rawBinaryPath, targets } from './binary';

export async function packageArchives(): Promise<void> {
	const missing = targets.filter((target) => !existsSync(rawBinaryPath(target)));
	if (missing.length > 0) {
		throw new Error(
			`Missing raw binaries for ${missing.map((t) => t.platform).join(', ')}. ` +
				'Each platform is compiled on its own runner by mise run compile:binary; ' +
				'download those artifacts into dist/binaries/raw before packaging.',
		);
	}

	const checksums: string[] = [];
	for (const target of targets) {
		const workDir = join(outDir, `.work-${target.platform}`);
		rmSync(workDir, { recursive: true, force: true });
		mkdirSync(workDir, { recursive: true });
		const staged = join(workDir, binaryName(target));
		copyFileSync(rawBinaryPath(target), staged);
		// CI artifacts travel as zip, which drops the executable bit.
		chmodSync(staged, 0o755);

		const archiveName =
			target.kind === 'zip' ? `exa-${target.platform}.exe.zip` : `exa-${target.platform}.tar.gz`;
		const archivePath = join(outDir, archiveName);
		rmSync(archivePath, { force: true });
		if (target.kind === 'zip') {
			await $`zip -j -q ${archivePath} ${staged}`;
		} else {
			await $`tar -C ${workDir} -czf ${archivePath} ${binaryName(target)}`;
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
		if (!existsSync(path)) {
			throw new Error(`packaging did not produce ${path}`);
		}
	}
}

if (import.meta.main) {
	await packageArchives();
}
