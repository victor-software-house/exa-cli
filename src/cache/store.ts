import { Database } from 'bun:sqlite';
import { mkdirSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { env } from '@cli/env';

export const DEFAULT_TTL_SECONDS = 24 * 60 * 60;

export type CacheEntry = {
	key: string;
	body: string;
	createdAt: number;
};

export function defaultCacheDir(): string {
	if (env.XDG_CACHE_HOME !== undefined) {
		return join(env.XDG_CACHE_HOME, 'exa-cli');
	}
	return join(homedir(), '.cache', 'exa-cli');
}

export function defaultCachePath(): string {
	return join(defaultCacheDir(), 'cache.sqlite');
}

export class CacheStore {
	readonly path: string;
	readonly #db: Database;

	constructor(path: string) {
		mkdirSync(join(path, '..'), { recursive: true });
		this.path = path;
		this.#db = new Database(path);
		this.#db.run('PRAGMA journal_mode = WAL');
		this.#db.run(`
			CREATE TABLE IF NOT EXISTS entries (
				key TEXT PRIMARY KEY NOT NULL,
				body TEXT NOT NULL,
				created_at INTEGER NOT NULL
			)
		`);
	}

	get(key: string, ttlSeconds: number, now = Date.now()): CacheEntry | undefined {
		const row = this.#db
			.query<CacheEntryRow, [string]>('SELECT key, body, created_at FROM entries WHERE key = ?')
			.get(key);
		if (row === null) {
			return undefined;
		}
		if (now - row.created_at > ttlSeconds * 1000) {
			this.#db.query('DELETE FROM entries WHERE key = ?').run(key);
			return undefined;
		}
		return {
			key: row.key,
			body: row.body,
			createdAt: row.created_at,
		};
	}

	set(key: string, body: string, now = Date.now()): void {
		this.#db
			.query(
				`INSERT INTO entries (key, body, created_at)
				 VALUES (?, ?, ?)
				 ON CONFLICT(key) DO UPDATE SET body = excluded.body, created_at = excluded.created_at`,
			)
			.run(key, body, now);
	}

	count(): number {
		const row = this.#db.query<{ n: number }, []>('SELECT COUNT(*) AS n FROM entries').get();
		if (row === null) {
			return 0;
		}
		return row.n;
	}

	prune(ttlSeconds: number, now = Date.now()): number {
		return this.#db
			.query<null, [number, number]>('DELETE FROM entries WHERE ? - created_at > ?')
			.run(now, ttlSeconds * 1000).changes;
	}

	clear(): number {
		return this.#db.query<null, []>('DELETE FROM entries').run().changes;
	}

	close(): void {
		this.#db.close();
	}
}

type CacheEntryRow = {
	key: string;
	body: string;
	created_at: number;
};
