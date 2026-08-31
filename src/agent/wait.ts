import { isJsonObject, type JsonValue } from '@cli/json';
import { match } from 'ts-pattern';
import * as z from 'zod';

const stringSchema = z.string().trim();

export const DEFAULT_AGENT_WAIT_SECONDS = 3600;
export const AGENT_POLL_INTERVAL_MS = 1000;

const TERMINAL_AGENT_STATUSES = new Set(['completed', 'failed', 'cancelled']);

export class AgentWaitTimeoutError extends Error {
	readonly id: string;
	readonly status: string | undefined;
	readonly lastPayload: JsonValue;

	constructor(options: {
		id: string;
		timeoutMs: number;
		status: string | undefined;
		lastPayload: JsonValue;
	}) {
		super(
			`agent wait timed out after ${String(options.timeoutMs / 1000)}s (status: ${options.status ?? 'unknown'}, id: ${options.id}).`,
		);
		this.name = 'AgentWaitTimeoutError';
		this.id = options.id;
		this.status = options.status;
		this.lastPayload = options.lastPayload;
	}
}

export function jsonStringField(payload: JsonValue, key: string): string | undefined {
	if (!isJsonObject(payload)) {
		return undefined;
	}
	return match(stringSchema.safeParse(payload[key]))
		.with({ success: true }, ({ data }) => data)
		.otherwise(() => undefined);
}

export function isTerminalAgentStatus(status: string | undefined): boolean {
	return status !== undefined && TERMINAL_AGENT_STATUSES.has(status);
}

export async function waitForAgentRun(options: {
	id: string;
	timeoutMs: number;
	pollIntervalMs?: number;
	getRun: (id: string) => Promise<JsonValue>;
	sleep?: (ms: number) => Promise<void>;
	now?: () => number;
	onStatus?: (status: string) => void;
}): Promise<JsonValue> {
	const pollIntervalMs = options.pollIntervalMs ?? AGENT_POLL_INTERVAL_MS;
	const sleep = options.sleep ?? ((ms) => Bun.sleep(ms));
	const now = options.now ?? Date.now;
	const deadline = now() + options.timeoutMs;
	let lastStatus: string | undefined;
	let lastPayload: JsonValue = {};

	for (;;) {
		lastPayload = await options.getRun(options.id);
		const status = jsonStringField(lastPayload, 'status');
		if (status !== undefined && status !== lastStatus) {
			options.onStatus?.(status);
			lastStatus = status;
		}
		if (isTerminalAgentStatus(status)) {
			return lastPayload;
		}
		if (now() >= deadline) {
			throw new AgentWaitTimeoutError({
				id: options.id,
				timeoutMs: options.timeoutMs,
				status,
				lastPayload,
			});
		}
		await sleep(pollIntervalMs);
	}
}
