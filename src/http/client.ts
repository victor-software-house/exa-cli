import { createClient, createConfig } from '@cli/generated/client';

export type ExaClient = ReturnType<typeof createClient>;

export function createExaClient(options: { apiKey: string; apiUrl: string }): ExaClient {
	return createClient(
		createConfig({
			baseUrl: options.apiUrl,
			headers: {
				'x-api-key': options.apiKey,
			},
		}),
	);
}
