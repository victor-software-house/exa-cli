import { createHash } from 'node:crypto';
import { isJsonObject, type JsonValue } from '@cli/json';

export type CacheIdentity = {
	host: string;
	operation: string;
	keyDigest: string;
	body: JsonValue;
};

export function apiKeyDigest(apiKey: string): string {
	return createHash('sha256').update(apiKey).digest('hex').slice(0, 16);
}

export function canonicalize(value: JsonValue): JsonValue {
	if (Array.isArray(value)) {
		return value.map((item) => canonicalize(item));
	}
	if (isJsonObject(value)) {
		const sorted = Object.fromEntries(
			Object.keys(value)
				.toSorted()
				.flatMap((key) => {
					const item = value[key];
					return item === undefined ? [] : [[key, canonicalize(item)]];
				}),
		);
		return sorted;
	}
	return value;
}

export function cacheKey(identity: CacheIdentity): string {
	const canonical = canonicalize({
		host: identity.host,
		operation: identity.operation,
		keyDigest: identity.keyDigest,
		body: identity.body,
	});
	return createHash('sha256').update(JSON.stringify(canonical)).digest('hex');
}
