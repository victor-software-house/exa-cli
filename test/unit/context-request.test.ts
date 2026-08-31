import { afterEach, expect, test } from 'bun:test';

let stop: (() => void) | undefined;

afterEach(() => {
	stop?.();
	stop = undefined;
});

test('context sends the documented dynamic token default', async () => {
	let requestBody: unknown;
	const server = Bun.serve({
		hostname: '127.0.0.1',
		port: 0,
		async fetch(request) {
			requestBody = await request.json();
			return Response.json({
				requestId: 'test',
				response: 'context',
				costDollars: '{"total":0.007}',
			});
		},
	});
	stop = () => {
		void server.stop(true);
	};

	const proc = Bun.spawn({
		cmd: [
			'bun',
			'src/cli.ts',
			'context',
			'--api-key',
			'test-key',
			'--api-url',
			`http://127.0.0.1:${server.port}`,
			'--json',
			'--no-cache',
			'How do I call Exa?',
		],
		cwd: process.cwd(),
		stdout: 'pipe',
		stderr: 'pipe',
	});

	expect(await proc.exited).toBe(0);
	expect(requestBody).toEqual({ query: 'How do I call Exa?', tokensNum: 'dynamic' });
});
