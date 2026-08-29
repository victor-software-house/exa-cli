import { describe, expect, test } from 'bun:test';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { CacheStore } from '@cli/cache/store';

describe('CacheStore', () => {
	test('round-trips a payload until TTL expires', () => {
		const path = join(mkdtempSync(join(tmpdir(), 'exa-cli-')), 'cache.sqlite');
		const store = new CacheStore(path);
		store.set('abc', '{"ok":true}', 1_000);
		expect(store.get('abc', 10, 2_000)?.body).toBe('{"ok":true}');
		expect(store.get('abc', 1, 3_000)).toBeUndefined();
		expect(store.count()).toBe(0);
		store.close();
	});
});
