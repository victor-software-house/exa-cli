import { describe, expect, test } from 'bun:test';
import { resolveApiKey } from '@cli/credentials/resolve';

describe('API key resolution', () => {
	test('prefers an option or environment key without reading storage', async () => {
		let lookups = 0;

		expect(
			await resolveApiKey('provided-key', () => {
				lookups += 1;
				return Promise.resolve({
					kind: 'found',
					secret: 'stored-key',
					backend: 'keychain',
				});
			}),
		).toEqual({
			kind: 'found',
			secret: 'provided-key',
			source: 'option-or-environment',
		});
		expect(lookups).toBe(0);
	});

	test('falls back to the stored credential', async () => {
		expect(
			await resolveApiKey(undefined, () =>
				Promise.resolve({
					kind: 'found',
					secret: 'stored-key',
					backend: 'keychain',
				}),
			),
		).toEqual({
			kind: 'found',
			secret: 'stored-key',
			source: 'stored',
			backend: 'keychain',
		});
	});

	test('preserves unavailable storage diagnostics', async () => {
		expect(
			await resolveApiKey(undefined, () =>
				Promise.resolve({ kind: 'unavailable', reason: 'keychain locked' }),
			),
		).toEqual({ kind: 'unavailable', reason: 'keychain locked' });
	});
});
