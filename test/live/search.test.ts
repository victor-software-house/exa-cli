import { describe, expect, test } from 'bun:test';
import { zSearchResponse } from '@cli/generated/zod.gen';
import { parseJson } from '@cli/json';

const skip = process.env['EXA_API_KEY'] === undefined || process.env['EXA_API_KEY'] === '';

describe.skipIf(skip)('live Exa search', () => {
	test('search returns results', () => {
		const proc = Bun.spawnSync({
			cmd: [
				'bun',
				'src/cli.ts',
				'search',
				'--json',
				'--no-cache',
				'Exa official search API documentation',
				'--include-domain',
				'exa.ai',
				'-n',
				'1',
			],
			stdout: 'pipe',
			stderr: 'pipe',
		});
		expect(proc.exitCode).toBe(0);
		const parsed = zSearchResponse.safeParse(parseJson(proc.stdout.toString()));
		expect(parsed.success).toBe(true);
		if (!parsed.success) {
			return;
		}
		expect(parsed.data.results ?? []).not.toHaveLength(0);
	});
});
