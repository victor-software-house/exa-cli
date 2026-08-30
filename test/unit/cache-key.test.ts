import { describe, expect, test } from 'bun:test';
import { apiKeyDigest, cacheKey, canonicalize } from '@cli/cache/key';

describe('canonicalize', () => {
	test('sorts object keys recursively', () => {
		expect(canonicalize({ b: 1, a: { d: 2, c: 3 } })).toEqual({
			a: { c: 3, d: 2 },
			b: 1,
		});
	});
});

describe('cacheKey', () => {
	test('is stable across key order', () => {
		const left = cacheKey({
			host: 'api.exa.ai',
			operation: 'search',
			keyDigest: apiKeyDigest('key-a'),
			body: { query: 'exa', numResults: 5 },
		});
		const right = cacheKey({
			host: 'api.exa.ai',
			operation: 'search',
			keyDigest: apiKeyDigest('key-a'),
			body: { numResults: 5, query: 'exa' },
		});
		expect(left).toBe(right);
	});

	test('changes when the body changes', () => {
		const digest = apiKeyDigest('key-a');
		const left = cacheKey({
			host: 'api.exa.ai',
			operation: 'search',
			keyDigest: digest,
			body: { query: 'a' },
		});
		const right = cacheKey({
			host: 'api.exa.ai',
			operation: 'search',
			keyDigest: digest,
			body: { query: 'b' },
		});
		expect(left).not.toBe(right);
	});

	test('isolates identical requests between API keys', () => {
		const left = cacheKey({
			host: 'api.exa.ai',
			operation: 'search',
			keyDigest: apiKeyDigest('key-a'),
			body: { query: 'a' },
		});
		const right = cacheKey({
			host: 'api.exa.ai',
			operation: 'search',
			keyDigest: apiKeyDigest('key-b'),
			body: { query: 'a' },
		});
		expect(left).not.toBe(right);
	});

	test('digest is a 16-char hex fingerprint', () => {
		expect(apiKeyDigest('key-a')).toMatch(/^[0-9a-f]{16}$/);
		expect(apiKeyDigest('key-a')).toBe(apiKeyDigest('key-a'));
	});
});
