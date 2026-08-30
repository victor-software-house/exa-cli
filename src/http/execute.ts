import { cacheKey } from '@cli/cache/key';
import type { CacheStore } from '@cli/cache/store';
import { type JsonValue, parseJson } from '@cli/json';
import { match } from 'ts-pattern';

export type CacheMode = 'default' | 'refresh' | 'off';

export type ExecuteResult = {
	payload: JsonValue;
	cacheHit: boolean;
	ageMs: number | undefined;
};

export async function executeCached(options: {
	host: string;
	operation: string;
	keyDigest: string;
	body: JsonValue;
	cache: CacheStore | undefined;
	mode: CacheMode;
	ttlSeconds: number;
	fetchBody: () => Promise<JsonValue>;
}): Promise<ExecuteResult> {
	const key = cacheKey({
		host: options.host,
		operation: options.operation,
		keyDigest: options.keyDigest,
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
	return match(flags)
		.returnType<CacheMode>()
		.with({ noCache: true }, () => 'off')
		.with({ refresh: true }, () => 'refresh')
		.otherwise(() => 'default');
}
