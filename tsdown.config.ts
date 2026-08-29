import { defineConfig } from 'tsdown';

export default defineConfig({
	entry: {
		cli: 'src/cli.ts',
	},
	format: 'esm',
	platform: 'node',
	target: 'node24',
	sourcemap: true,
	clean: true,
	hash: false,
	dts: true,
});
