import { describe, expect, test } from 'bun:test';
import { formatPayload, resolveMode } from '@cli/output/presenter';

describe('resolveMode', () => {
	test('uses json when stdout is not a TTY', () => {
		expect(
			resolveMode({
				json: false,
				pretty: false,
				output: undefined,
				stdoutIsTTY: false,
				noColor: false,
				forceColor: false,
			}),
		).toBe('json');
	});

	test('uses pretty when requested on a TTY', () => {
		expect(
			resolveMode({
				json: false,
				pretty: true,
				output: undefined,
				stdoutIsTTY: true,
				noColor: false,
				forceColor: false,
			}),
		).toBe('pretty');
	});
});

describe('formatPayload', () => {
	test('emits compact JSON', () => {
		expect(formatPayload({ a: 1 }, 'json', false)).toBe('{"a":1}\n');
	});

	test('prints search results as text', () => {
		const text = formatPayload(
			{ results: [{ url: 'https://exa.ai', title: 'Exa' }] },
			'text',
			false,
		);
		expect(text).toContain('https://exa.ai');
		expect(text).toContain('Exa');
	});
});
