import {
	type CredentialBackend,
	type CredentialLookup,
	readCredential,
} from '@cli/credentials/store';

export type ApiKeyResolution =
	| { readonly kind: 'found'; readonly secret: string; readonly source: 'option-or-environment' }
	| {
			readonly kind: 'found';
			readonly secret: string;
			readonly source: 'stored';
			readonly backend: CredentialBackend;
	  }
	| Exclude<CredentialLookup, { readonly kind: 'found' }>;

export async function resolveApiKey(
	apiKey: string | undefined,
	lookup: () => Promise<CredentialLookup> = readCredential,
): Promise<ApiKeyResolution> {
	if (apiKey !== undefined && apiKey !== '') {
		return { kind: 'found', secret: apiKey, source: 'option-or-environment' };
	}
	const stored = await lookup();
	if (stored.kind !== 'found') {
		return stored;
	}
	return {
		kind: 'found',
		secret: stored.secret,
		source: 'stored',
		backend: stored.backend,
	};
}
