import { createHash } from 'node:crypto';

export type CacheIdentity = {
	host: string;
	operation: string;
	body: unknown;
};

export function canonicalize(value: unknown): unknown {
	if (Array.isArray(value)) {
		return value.map((item) => canonicalize(item));
	}
	if (isRecord(value)) {
		const sorted: Record<string, unknown> = {};
		for (const key of Object.keys(value).toSorted()) {
			sorted[key] = canonicalize(value[key]);
		}
		return sorted;
	}
	return value;
}

export function cacheKey(identity: CacheIdentity): string {
	const canonical = canonicalize({
		host: identity.host,
		operation: identity.operation,
		body: identity.body,
	});
	return createHash('sha256').update(JSON.stringify(canonical)).digest('hex');
}

function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === 'object' && value !== null && !Array.isArray(value);
}
