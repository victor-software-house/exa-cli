import { defineConfig } from '@hey-api/openapi-ts';

export default defineConfig({
	input: './vendor/exa-openapi.yaml',
	output: {
		path: 'src/generated',
	},
	plugins: [
		'@hey-api/typescript',
		'@hey-api/client-fetch',
		{
			name: '@hey-api/sdk',
			validator: true,
		},
		{
			name: 'zod',
			requests: true,
			responses: true,
		},
	],
});
