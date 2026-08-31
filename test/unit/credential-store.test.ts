import { afterEach, describe, expect, test } from 'bun:test';
import { mkdtempSync, readFileSync, rmSync, statSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
	type CommandOptions,
	type CommandOutcome,
	type CommandRunner,
	runCommand,
} from '@cli/credentials/command';
import { deleteCredential, readCredential, writeCredential } from '@cli/credentials/store';

type Call = {
	command: readonly string[];
	options: CommandOptions | undefined;
};

const tempDirs: string[] = [];

afterEach(() => {
	for (const directory of tempDirs.splice(0)) {
		rmSync(directory, { recursive: true, force: true });
	}
});

function queuedRunner(...outcomes: CommandOutcome[]) {
	const calls: Call[] = [];
	const run: CommandRunner = (command, options) => {
		calls.push({ command, options });
		const outcome = outcomes.shift();
		if (outcome === undefined) {
			throw new Error('No queued command outcome.');
		}
		return Promise.resolve(outcome);
	};
	return { run, calls };
}

function tempPath(): string {
	const directory = mkdtempSync(join(tmpdir(), 'exa-credential-test-'));
	tempDirs.push(directory);
	return join(directory, 'credentials.json');
}

describe('credential store', () => {
	test('does not mistake a normal nonzero exit for a timeout', async () => {
		expect(await runCommand([process.execPath, '-e', 'process.exit(44)'])).toEqual({
			kind: 'exited',
			exitCode: 44,
			stdout: '',
		});
	});

	test('writes a macOS key without exposing it in argv', async () => {
		const secret = `test "double" 'single' \\ slash`;
		const { run, calls } = queuedRunner({ kind: 'exited', exitCode: 0, stdout: '' });

		const result = await writeCredential(secret, { platform: 'darwin', run });

		expect(result).toEqual({ kind: 'ok', backend: 'keychain' });
		expect(calls).toHaveLength(1);
		expect(calls[0]?.command).toEqual(['/usr/bin/security', '-i']);
		expect(calls[0]?.command.join(' ')).not.toContain(secret);
		expect(calls[0]?.options?.stdin).toContain(Buffer.from(secret).toString('hex').toUpperCase());
		expect(calls[0]?.options?.stdin).not.toContain(secret);
	});

	test('reads the macOS key and identifies its backend', async () => {
		const { run } = queuedRunner({ kind: 'exited', exitCode: 0, stdout: 'stored-key\n' });

		expect(await readCredential({ platform: 'darwin', run, filePath: tempPath() })).toEqual({
			kind: 'found',
			secret: 'stored-key',
			backend: 'keychain',
		});
	});

	test('sends a Linux key through stdin', async () => {
		const { run, calls } = queuedRunner({ kind: 'exited', exitCode: 0, stdout: '' });

		expect(await writeCredential('linux-key', { platform: 'linux', run })).toEqual({
			kind: 'ok',
			backend: 'secret-service',
		});
		expect(calls[0]?.command.join(' ')).not.toContain('linux-key');
		expect(calls[0]?.options?.stdin).toBe('linux-key');
	});

	test('sends a Windows key through stdin to a constant encoded script', async () => {
		const { run, calls } = queuedRunner({ kind: 'exited', exitCode: 0, stdout: '' });

		expect(
			await writeCredential('windows-key', {
				platform: 'win32',
				run,
				dpapiPath: 'C:\\credentials\\exa.dpapi',
			}),
		).toEqual({ kind: 'ok', backend: 'dpapi' });
		expect(calls[0]?.command.join(' ')).not.toContain('windows-key');
		expect(calls[0]?.options?.stdin).toBe('windows-key');
		expect(calls[0]?.options?.env?.['EXA_CREDENTIAL_PATH']).toBe('C:\\credentials\\exa.dpapi');
	});

	test('fails closed unless plaintext storage is explicitly allowed', async () => {
		const path = tempPath();
		const unavailable: CommandOutcome = { kind: 'missing' };
		const first = queuedRunner(unavailable);
		const second = queuedRunner(unavailable);

		expect(
			await writeCredential('file-key', { platform: 'linux', run: first.run, filePath: path }),
		).toEqual({
			kind: 'unavailable',
			reason: 'secret-tool is unavailable.',
		});
		expect(() => readFileSync(path)).toThrow();

		expect(
			await writeCredential('file-key', {
				platform: 'linux',
				run: second.run,
				filePath: path,
				allowFile: true,
			}),
		).toEqual({ kind: 'ok', backend: 'file' });
		expect(statSync(path).mode & 0o777).toBe(0o600);
	});

	test('reads and deletes the explicit file fallback', async () => {
		const path = tempPath();
		const write = queuedRunner({ kind: 'missing' });
		await writeCredential('file-key', {
			platform: 'linux',
			run: write.run,
			filePath: path,
			allowFile: true,
		});
		const read = queuedRunner({ kind: 'missing' });

		expect(await readCredential({ platform: 'linux', run: read.run, filePath: path })).toEqual({
			kind: 'found',
			secret: 'file-key',
			backend: 'file',
		});

		const remove = queuedRunner({ kind: 'missing' });
		expect(await deleteCredential({ platform: 'linux', run: remove.run, filePath: path })).toEqual({
			kind: 'ok',
		});
		expect(() => readFileSync(path)).toThrow();
	});

	test('distinguishes absence from a helper timeout', async () => {
		const absent = queuedRunner({ kind: 'exited', exitCode: 44, stdout: '' });
		const timeout = queuedRunner({ kind: 'timeout' });

		expect(
			await readCredential({ platform: 'darwin', run: absent.run, filePath: tempPath() }),
		).toEqual({ kind: 'absent' });
		expect(
			await readCredential({ platform: 'darwin', run: timeout.run, filePath: tempPath() }),
		).toEqual({
			kind: 'unavailable',
			reason: 'The keychain did not respond.',
		});
	});

	test('rejects malformed keys before invoking a helper', async () => {
		const { run, calls } = queuedRunner();

		expect(await writeCredential('line one\nline two', { platform: 'darwin', run })).toEqual({
			kind: 'unavailable',
			reason: 'The API key must not contain newlines or null bytes.',
		});
		expect(calls).toHaveLength(0);
	});
});
