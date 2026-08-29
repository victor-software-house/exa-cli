import { cacheKey } from '@cli/cache/key';
import type { CacheStore } from '@cli/cache/store';
import { parseJson } from '@cli/json';

export type CacheMode = 'default' | 'refresh' | 'off';

export type ExecuteResult = {
	payload: unknown;
	cacheHit: boolean;
	ageMs: number | undefined;
};

export async function executeCached(options: {
	host: string;
	operation: string;
	body: unknown;
	cache: CacheStore | undefined;
	mode: CacheMode;
	ttlSeconds: number;
	fetchBody: () => Promise<unknown>;
}): Promise<ExecuteResult> {
	const key = cacheKey({
		host: options.host,
		operation: options.operation,
		body: options.body,
	});
	const cache = options.mode === 'off' ? undefined : options.cache;

	if (cache !== undefined && options.mode === 'default') {
		const hit = cache.get(key, options.ttlSeconds);
		if (hit !== undefined) {
			return {
				payload: parseJson(hit.body),
				cacheHit: true,
				ageMs: Date.now() - hit.createdAt,
			};
		}
	}

	const payload = await options.fetchBody();
	if (cache !== undefined) {
		cache.set(key, JSON.stringify(payload));
	}
	return { payload, cacheHit: false, ageMs: undefined };
}

export function cacheMode(flags: { refresh: boolean; noCache: boolean }): CacheMode {
	if (flags.noCache) {
		return 'off';
	}
	if (flags.refresh) {
		return 'refresh';
	}
	return 'default';
}
