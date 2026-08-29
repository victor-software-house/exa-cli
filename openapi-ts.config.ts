import { defineConfig } from '@hey-api/openapi-ts';

export default defineConfig({
	input: './vendor/exa-openapi.yaml',
	output: {
		header: (ctx) => ['// @ts-nocheck', ...ctx.defaultValue],
		path: 'src/generated',
	},
	plugins: [
		'@hey-api/typescript',
		{
			name: '@hey-api/client-fetch',
			throwOnError: true,
		},
		{
			name: '@hey-api/sdk',
			responseStyle: 'data',
			validator: true,
		},
		{
			name: 'zod',
			requests: true,
			responses: true,
		},
	],
});
