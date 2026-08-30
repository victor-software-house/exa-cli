import { describe, expect, test } from 'bun:test';
import { formatPayload, type PresenterOptions, resolveMode } from '@cli/output/presenter';

const base = {
	json: false,
	pretty: false,
	output: undefined,
	stdoutIsTTY: false,
	noColor: false,
	forceColor: false,
} satisfies PresenterOptions;

describe('resolveMode', () => {
	test('defaults to text, even when stdout is not a TTY', () => {
		expect(resolveMode({ ...base, stdoutIsTTY: false })).toBe('text');
		expect(resolveMode({ ...base, stdoutIsTTY: true })).toBe('text');
	});

	test('uses pretty when requested, in a pipe or with --output', () => {
		expect(resolveMode({ ...base, pretty: true })).toBe('pretty');
		expect(resolveMode({ ...base, pretty: true, output: 'r.json' })).toBe('pretty');
	});

	test('pretty beats json', () => {
		expect(resolveMode({ ...base, json: true, pretty: true })).toBe('pretty');
	});

	test('uses json for --json or --output', () => {
		expect(resolveMode({ ...base, json: true })).toBe('json');
		expect(resolveMode({ ...base, output: 'r.md' })).toBe('json');
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
