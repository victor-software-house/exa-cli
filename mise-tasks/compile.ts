#!/usr/bin/env bun
//MISE description="Cross-compile standalone binaries"

import { createHash } from 'node:crypto';
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { $ } from 'bun';

const targets = [
	'bun-darwin-arm64',
	'bun-darwin-x64',
	'bun-linux-x64',
	'bun-linux-arm64',
	'bun-linux-x64-musl',
	'bun-windows-x64',
] as const;

const outDir = 'dist/binaries';
mkdirSync(outDir, { recursive: true });

const checksums: string[] = [];

for (const target of targets) {
	const ext = target.includes('windows') ? '.exe' : '';
	const outfile = join(outDir, `exa-${target}${ext}`);
	await $`bun build --compile --target=${target} --outfile=${outfile} src/cli.ts`;
	const bytes = await Bun.file(outfile).arrayBuffer();
	const digest = createHash('sha256').update(Buffer.from(bytes)).digest('hex');
	checksums.push(`${digest}  ${outfile.replace(`${outDir}/`, '')}`);
}

writeFileSync(join(outDir, 'SHA256SUMS'), `${checksums.join('\n')}\n`);
