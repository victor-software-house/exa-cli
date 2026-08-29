import { describe, expect, test } from 'bun:test';
import { cacheKey, canonicalize } from '@cli/cache/key';

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
			body: { query: 'exa', numResults: 5 },
		});
		const right = cacheKey({
			host: 'api.exa.ai',
			operation: 'search',
			body: { numResults: 5, query: 'exa' },
		});
		expect(left).toBe(right);
	});

	test('changes when the body changes', () => {
		const left = cacheKey({ host: 'api.exa.ai', operation: 'search', body: { query: 'a' } });
		const right = cacheKey({ host: 'api.exa.ai', operation: 'search', body: { query: 'b' } });
		expect(left).not.toBe(right);
	});
});
