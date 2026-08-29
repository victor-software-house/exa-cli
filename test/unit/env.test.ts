import { describe, expect, test } from 'bun:test';
import { parseEnv } from '@cli/env';

describe('parseEnv', () => {
	test('treats blank EXA_API_KEY as unset', () => {
		expect(parseEnv({ EXA_API_KEY: '  ' }).EXA_API_KEY).toBeUndefined();
	});

	test('keeps NO_COLOR when set to an empty string', () => {
		expect(parseEnv({ NO_COLOR: '' }).NO_COLOR).toBe('');
	});
});
