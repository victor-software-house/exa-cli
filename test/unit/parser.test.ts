import { describe, expect, test } from 'bun:test';
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
});
