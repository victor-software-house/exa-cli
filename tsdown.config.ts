import { rmSync } from 'node:fs';
import { defineConfig } from 'tsdown';

export default defineConfig({
	entry: {
		cli: 'src/cli.ts',
	},
	format: 'esm',
	platform: 'node',
	target: 'node26',
	deps: {
		neverBundle: [/^bun:/],
	},
	sourcemap: true,
	clean: false,
	hash: false,
	dts: {
		tsconfig: 'tsconfig.build.json',
	},
	hooks: {
		'build:prepare': () => {
			rmSync('dist/cli.mjs', { force: true });
			rmSync('dist/cli.mjs.map', { force: true });
			rmSync('dist/cli.d.mts', { force: true });
		},
	},
});
