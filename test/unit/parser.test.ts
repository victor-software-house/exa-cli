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

	test('parses context with a query', () => {
		const result = parse(parser, [
			'context',
			'--api-key',
			'test-key',
			'React hooks useState examples',
		]);
		expect(result.success).toBe(true);
		if (result.success && result.value.command === 'context') {
			expect(result.value.query).toBe('React hooks useState examples');
		}
	});

	test('parses cache with an action', () => {
		const result = parse(parser, ['cache', 'prune', '--ttl', '60']);
		expect(result.success).toBe(true);
		if (result.success && result.value.command === 'cache') {
			expect(result.value.action).toBe('prune');
			expect(result.value.ttl).toBe(60);
		}
	});

	test('parses nested agent get with a run id', () => {
		const result = parse(parser, [
			'agent',
			'get',
			'--api-key',
			'test-key',
			'agent_run_01j7x9v0m2n4p6q8r0s2t4v6w8',
		]);
		expect(result.success).toBe(true);
		if (result.success && result.value.command === 'agent-get') {
			expect(result.value.id).toBe('agent_run_01j7x9v0m2n4p6q8r0s2t4v6w8');
		}
	});

	test('rejects the removed hyphenated agent command', () => {
		expect(parse(parser, ['agent-get', 'agent_run_01j7x9v0m2n4p6q8r0s2t4v6w8']).success).toBe(
			false,
		);
	});

	test('parses auth login with explicit plaintext fallback consent', () => {
		const result = parse(parser, ['auth', 'login', '--insecure-storage']);
		expect(result.success).toBe(true);
		if (result.success && result.value.command === 'auth-login') {
			expect(result.value.insecureStorage).toBe(true);
		}
	});
});
