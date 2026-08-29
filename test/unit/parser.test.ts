import { describe, expect, test } from 'bun:test';
import { zSearchBody } from '@cli/generated/zod.gen';
import { parser } from '@cli/parser';
import { parse } from '@optique/core/parser';

describe('parser', () => {
	test('parses search with a query and API key', () => {
		const result = parse(parser, ['search', '--api-key', 'test-key', 'latest exa docs']);
		expect(result.success).toBe(true);
		if (result.success) {
			expect(result.value.command).toBe('search');
			if (result.value.command === 'search') {
				expect(result.value.query).toBe('latest exa docs');
				expect(result.value.apiKey).toBe('test-key');
			}
		}
	});

	test('parses search --request JSON through the generated body schema', () => {
		const result = parse(parser, [
			'search',
			'--api-key',
			'test-key',
			'--request',
			'{"query":"latest exa docs","numResults":1}',
		]);
		expect(result.success).toBe(true);
		if (result.success && result.value.command === 'search') {
			expect(zSearchBody.parse(result.value.request).query).toBe('latest exa docs');
		}
	});
});
