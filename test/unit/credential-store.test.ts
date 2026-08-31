import { afterEach, describe, expect, test } from 'bun:test';
import { mkdtempSync, readFileSync, rmSync, statSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
	type CredentialEntryFactory,
	deleteCredential,
	readCredential,
	writeCredential,
} from '@cli/credentials/store';

const tempDirs: string[] = [];

afterEach(() => {
	for (const directory of tempDirs.splice(0)) {
		rmSync(directory, { recursive: true, force: true });
	}
});

function tempPath(): string {
	const directory = mkdtempSync(join(tmpdir(), 'exa-credential-test-'));
	tempDirs.push(directory);
	return join(directory, 'credentials.json');
}

/** A store whose very construction fails, as on a headless Linux box. */
const refuses: CredentialEntryFactory = () => {
	throw new Error('Couldn\u2019t access platform storage: PermissionDenied');
};

/** Same failure, reported with the addon's multi-line Rust error chain. */
const refusesWithChain: CredentialEntryFactory = () => {
	throw new Error(
		'Couldn\u2019t access platform storage: PermissionDenied\n\nCaused by:\n    PermissionDenied',
	);
};

const REFUSED_REASON =
	'Couldn\u2019t access platform storage: PermissionDenied No D-Bus session, or the keyring is locked.';

/** Stands in for `@napi-rs/keyring`'s Entry so tests never touch a real store. */
function fakeStore(options: { initial?: string | null; throws?: Error } = {}) {
	let value = options.initial ?? null;
	const opened: Array<readonly [string, string]> = [];
	const factory: CredentialEntryFactory = (service, account) => {
		opened.push([service, account]);
		return {
			getPassword: () => {
				if (options.throws !== undefined) {
					throw options.throws;
				}
				return value;
			},
			setPassword: (secret) => {
				if (options.throws !== undefined) {
					throw options.throws;
				}
				value = secret;
			},
			deletePassword: () => {
				if (options.throws !== undefined) {
					throw options.throws;
				}
				if (value === null) {
					return false;
				}
				value = null;
				return true;
			},
		};
	};
	return { factory, opened, current: () => value };
}

describe('credential store', () => {
	test('addresses one stable service and account', async () => {
		const store = fakeStore();

		await writeCredential('key', { platform: 'darwin', entry: store.factory });

		expect(store.opened).toEqual([['exa-cli', 'default']]);
	});

	test('round-trips a key and names the platform backend', async () => {
		const cases = [
			{ platform: 'darwin', backend: 'keychain' },
			{ platform: 'linux', backend: 'secret-service' },
			{ platform: 'win32', backend: 'credential-manager' },
		] as const;

		for (const { platform, backend } of cases) {
			const store = fakeStore();
			const written = await writeCredential('stored-key', { platform, entry: store.factory });
			expect(written).toEqual({ kind: 'ok', backend });

			expect(
				await readCredential({ platform, entry: store.factory, filePath: tempPath() }),
			).toEqual({ kind: 'found', secret: 'stored-key', backend });
		}
	});

	test('preserves a key that shell quoting would have mangled', async () => {
		const secret = `test "double" 'single' \\ slash`;
		const store = fakeStore();

		await writeCredential(secret, { platform: 'darwin', entry: store.factory });

		expect(store.current()).toBe(secret);
	});

	test('reports an empty store as absent, not as a key', async () => {
		const store = fakeStore({ initial: null });

		expect(
			await readCredential({ platform: 'darwin', entry: store.factory, filePath: tempPath() }),
		).toEqual({ kind: 'absent' });
	});

	test('surfaces a locked store as unavailable with a platform hint', async () => {
		const store = fakeStore({ throws: new Error('access denied') });

		expect(
			await readCredential({ platform: 'linux', entry: store.factory, filePath: tempPath() }),
		).toEqual({
			kind: 'unavailable',
			reason: 'access denied No D-Bus session, or the keyring is locked.',
		});
	});

	test('reports a store that cannot even be opened as unavailable', async () => {
		expect(
			await readCredential({ platform: 'linux', entry: refuses, filePath: tempPath() }),
		).toEqual({ kind: 'unavailable', reason: REFUSED_REASON });
		expect(await deleteCredential({ platform: 'linux', entry: refuses })).toEqual({
			kind: 'unavailable',
			reason: REFUSED_REASON,
		});
	});

	test('keeps a multi-line addon error on one line', async () => {
		const result = await readCredential({
			platform: 'linux',
			entry: refusesWithChain,
			filePath: tempPath(),
		});

		expect(result).toEqual({ kind: 'unavailable', reason: REFUSED_REASON });
		expect(result.kind === 'unavailable' && result.reason).not.toContain('\n');
	});

	test('refuses platforms with no credential store', async () => {
		expect(await writeCredential('key', { platform: 'freebsd' })).toEqual({
			kind: 'unavailable',
			reason: 'No credential store for platform freebsd.',
		});
	});

	test('fails closed unless plaintext storage is explicitly allowed', async () => {
		const path = tempPath();
		const store = fakeStore({ throws: new Error('no keyring') });

		expect(
			await writeCredential('file-key', {
				platform: 'linux',
				entry: store.factory,
				filePath: path,
			}),
		).toEqual({
			kind: 'unavailable',
			reason: 'no keyring No D-Bus session, or the keyring is locked.',
		});
		expect(() => readFileSync(path)).toThrow();

		expect(
			await writeCredential('file-key', {
				platform: 'linux',
				entry: store.factory,
				filePath: path,
				allowFile: true,
			}),
		).toEqual({ kind: 'ok', backend: 'file' });
		expect(statSync(path).mode & 0o777).toBe(0o600);
	});

	test('reads and deletes the explicit file fallback', async () => {
		const path = tempPath();
		const store = fakeStore({ throws: new Error('no keyring') });
		await writeCredential('file-key', {
			platform: 'linux',
			entry: store.factory,
			filePath: path,
			allowFile: true,
		});

		expect(
			await readCredential({ platform: 'linux', entry: store.factory, filePath: path }),
		).toEqual({ kind: 'found', secret: 'file-key', backend: 'file' });

		expect(
			await deleteCredential({ platform: 'linux', entry: store.factory, filePath: path }),
		).toEqual({ kind: 'ok' });
		expect(() => readFileSync(path)).toThrow();
	});

	test('reports deleting an empty store as absent', async () => {
		const store = fakeStore({ initial: null });

		expect(
			await deleteCredential({ platform: 'darwin', entry: store.factory, filePath: tempPath() }),
		).toEqual({ kind: 'absent' });
	});

	test('rejects malformed keys before opening the store', async () => {
		const store = fakeStore();

		expect(
			await writeCredential('line one\nline two', { platform: 'darwin', entry: store.factory }),
		).toEqual({
			kind: 'unavailable',
			reason: 'The API key must not contain newlines or null bytes.',
		});
		expect(store.opened).toHaveLength(0);
	});
});
