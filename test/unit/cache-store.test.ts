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

	test('prune deletes only expired entries and returns their count', () => {
		const path = join(mkdtempSync(join(tmpdir(), 'exa-cli-')), 'cache.sqlite');
		const store = new CacheStore(path);
		store.set('fresh', '{}', 10_000);
		store.set('stale', '{}', 1_000);
		expect(store.prune(5, 10_000)).toBe(1);
		expect(store.count()).toBe(1);
		expect(store.get('fresh', 5, 10_000)?.body).toBe('{}');
		store.close();
	});

	test('clear deletes all entries and returns their count', () => {
		const path = join(mkdtempSync(join(tmpdir(), 'exa-cli-')), 'cache.sqlite');
		const store = new CacheStore(path);
		store.set('a', '{}');
		store.set('b', '{}');
		expect(store.clear()).toBe(2);
		expect(store.count()).toBe(0);
		store.close();
	});
});
