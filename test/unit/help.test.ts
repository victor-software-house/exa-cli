import { describe, expect, test } from 'bun:test';

function runCli(...args: string[]) {
	return Bun.spawnSync({
		cmd: ['bun', 'src/cli.ts', ...args],
		cwd: process.cwd(),
		env: { ...process.env, NO_COLOR: '1' },
	});
}

describe('CLI help', () => {
	test('shows a compact described top-level command menu', () => {
		const result = runCli('--help');
		const output = result.stdout.toString();

		expect(result.exitCode).toBe(0);
		expect(output).toContain('Search the web with Exa.');
		expect(output).toContain('Run and manage research agents.');
		expect(output).toContain('Manage API credentials.');
		expect(output).not.toContain('Usage: exa search');
		expect(output).not.toContain('agent-create');
		expect(output).not.toContain('--completion');
		expect(output).not.toContain('Command line arguments for completion suggestions');
	});

	test('shows focused errors without dumping every command usage', () => {
		const result = runCli('definitely-not-a-command');
		const error = result.stderr.toString();

		expect(result.exitCode).toBe(1);
		expect(error).toContain('Unexpected option or subcommand');
		expect(error).not.toContain('Usage:');
	});

	test('shows actionable search examples', () => {
		const result = runCli('search', '--help');
		const output = result.stdout.toString();

		expect(result.exitCode).toBe(0);
		expect(output).toContain('exa search "latest TypeScript release"');
		expect(output).toContain('exa search "AI research" --include-domain arxiv.org');
	});

	test('shows nested agent commands without crashing', () => {
		const result = runCli('agent', '--help');
		const output = result.stdout.toString();

		expect(result.exitCode).toBe(0);
		expect(result.stderr.toString()).toBe('');
		expect(output).toContain('create');
		expect(output).toContain('Start a research agent run.');
		expect(output).toContain('cancel');
	});

	test('shows nested auth commands and safe login guidance', () => {
		const auth = runCli('auth', '--help');
		const login = runCli('auth', 'login', '--help');
		const authOutput = auth.stdout.toString();
		const loginOutput = login.stdout.toString();

		expect(auth.exitCode).toBe(0);
		expect(auth.stderr.toString()).toBe('');
		expect(authOutput).toContain('login');
		expect(authOutput).toContain('logout');
		expect(authOutput).toContain('status');
		expect(login.exitCode).toBe(0);
		expect(loginOutput).toContain('hidden prompt or stdin');
		expect(loginOutput).toContain('--insecure-storage');
		expect(loginOutput).not.toContain('--api-key');
	});

	test('does not advertise ignored options', () => {
		const cache = runCli('cache', '--help').stdout.toString();
		const agent = runCli('agent', 'get', '--help').stdout.toString();
		const doctor = runCli('doctor', '--help').stdout.toString();

		expect(cache).toContain('--ttl');
		expect(cache).not.toContain('--api-key');
		expect(cache).not.toContain('--json');
		expect(agent).not.toContain('--refresh');
		expect(agent).not.toContain('--ttl');
		expect(agent).toContain('Get an agent run.');
		expect(agent).not.toContain('Create, inspect, wait for, and cancel');
		expect(doctor).not.toContain('--output');
	});
});
