#!/usr/bin/env bun
//MISE description="Regenerate src/generated from the pinned Exa OpenAPI spec"

import { $ } from 'bun';

await $`openapi-ts`;

const banner = '// @ts-nocheck\n';
const glob = new Bun.Glob('src/generated/**/*.ts');

for await (const file of glob.scan('.')) {
	const text = await Bun.file(file).text();
	if (text.startsWith('// @ts-nocheck')) {
		continue;
	}
	await Bun.write(file, `${banner}${text}`);
}
