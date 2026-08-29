import { createClient, createConfig } from '@cli/generated/client';

export type ExaClient = ReturnType<typeof createClient>;

export function createExaClient(options: { apiKey: string; apiUrl: string }): ExaClient {
	return createClient(
		createConfig({
			auth: () => options.apiKey,
			baseUrl: options.apiUrl,
			throwOnError: true,
		}),
	);
}
