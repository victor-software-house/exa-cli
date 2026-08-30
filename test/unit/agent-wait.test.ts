import { describe, expect, test } from 'bun:test';
import { AgentWaitTimeoutError, waitForAgentRun } from '@cli/agent/wait';
import type { JsonValue } from '@cli/json';

describe('waitForAgentRun', () => {
	test('returns the first terminal payload without sleeping', async () => {
		const sleeps: number[] = [];
		const payload = await waitForAgentRun({
			id: 'agent_run_1',
			timeoutMs: 3600_000,
			getRun: async () => ({ id: 'agent_run_1', status: 'completed' }),
			sleep: async (ms) => {
				sleeps.push(ms);
			},
		});
		expect(payload).toEqual({ id: 'agent_run_1', status: 'completed' });
		expect(sleeps).toEqual([]);
	});

	test('polls until a terminal status', async () => {
		const statuses = ['queued', 'running', 'completed'];
		const seen: string[] = [];
		const payload = await waitForAgentRun({
			id: 'agent_run_1',
			timeoutMs: 3600_000,
			getRun: async () => {
				const status = statuses.shift() ?? 'completed';
				return { id: 'agent_run_1', status };
			},
			sleep: async () => undefined,
			onStatus: (status) => {
				seen.push(status);
			},
		});
		expect(payload).toEqual({ id: 'agent_run_1', status: 'completed' });
		expect(seen).toEqual(['queued', 'running', 'completed']);
	});

	test('throws with the last payload when the deadline is reached', async () => {
		let nowMs = 0;
		const last: JsonValue = { id: 'agent_run_1', status: 'running' };
		try {
			await waitForAgentRun({
				id: 'agent_run_1',
				timeoutMs: 1000,
				getRun: async () => last,
				now: () => nowMs,
				sleep: async (ms) => {
					nowMs += ms;
				},
			});
			throw new Error('expected timeout');
		} catch (error) {
			expect(error).toBeInstanceOf(AgentWaitTimeoutError);
			if (error instanceof AgentWaitTimeoutError) {
				expect(error.id).toBe('agent_run_1');
				expect(error.status).toBe('running');
				expect(error.lastPayload).toEqual(last);
			}
		}
	});
});
