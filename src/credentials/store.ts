import { chmodSync, mkdirSync, readFileSync, renameSync, rmSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { dirname, join } from 'node:path';
import { env } from '@cli/env';
import { parseJson } from '@cli/json';
import { match } from 'ts-pattern';
import * as z from 'zod';

const credentialFileSchema = z.object({
	apiKey: z.string().trim().min(1),
});

const SERVICE = 'exa-cli';
const ACCOUNT = 'default';

export type CredentialBackend =
	| 'keychain'
	| 'secret-service'
	| 'credential-manager'
	| 'file'
	| 'none';

export type CredentialLookup =
	| { readonly kind: 'found'; readonly secret: string; readonly backend: CredentialBackend }
	| { readonly kind: 'absent' }
	| { readonly kind: 'unavailable'; readonly reason: string };

export type CredentialChange =
	| { readonly kind: 'ok'; readonly backend?: CredentialBackend }
	| { readonly kind: 'absent' }
	| { readonly kind: 'unavailable'; readonly reason: string };

/**
 * The subset of `@napi-rs/keyring`'s Entry that we use. Declaring it here keeps
 * the tests off the real credential store.
 */
export type CredentialEntry = {
	getPassword(): string | null;
	setPassword(secret: string): void;
	deletePassword(): boolean;
};

export type CredentialEntryFactory = (service: string, account: string) => CredentialEntry;

export type StoreOptions = {
	readonly platform?: NodeJS.Platform;
	readonly entry?: CredentialEntryFactory;
	readonly allowFile?: boolean;
	readonly filePath?: string;
};

/**
 * A key that survives a round trip but still carries a stray newline is nearly
 * always a bad paste. Reject it here so the failure names the cause instead of
 * surfacing later as an opaque 401.
 */
export function invalidSecretReason(secret: string): string | undefined {
	if (secret === '') {
		return 'The API key is empty.';
	}
	if (/[\n\r\0]/.test(secret)) {
		return 'The API key must not contain newlines or null bytes.';
	}
	return undefined;
}

export function backendFor(platform: NodeJS.Platform = process.platform): CredentialBackend {
	return match(platform)
		.returnType<CredentialBackend>()
		.with('darwin', () => 'keychain')
		.with('linux', () => 'secret-service')
		.with('win32', () => 'credential-manager')
		.otherwise(() => 'none');
}

export function describeBackend(backend: CredentialBackend): string {
	return match(backend)
		.with('keychain', () => 'macOS Keychain')
		.with('secret-service', () => 'Secret Service')
		.with('credential-manager', () => 'Windows Credential Manager')
		.with('file', () => 'plaintext file')
		.with('none', () => 'unsupported platform')
		.exhaustive();
}

export function credentialFilePath(): string {
	if (env.APPDATA !== undefined) {
		return join(env.APPDATA, 'exa-cli', 'credentials.json');
	}
	if (env.XDG_CONFIG_HOME !== undefined) {
		return join(env.XDG_CONFIG_HOME, 'exa-cli', 'credentials.json');
	}
	return join(homedir(), '.config', 'exa-cli', 'credentials.json');
}

/**
 * The addon is embedded per target by `bun build --compile`, so a load failure
 * means the binary was built for the wrong platform. Degrade to a reason string
 * rather than taking down commands that never touch stored credentials.
 */
async function loadEntryFactory(): Promise<CredentialEntryFactory | undefined> {
	try {
		const { Entry } = await import('@napi-rs/keyring');
		return (service, account) => new Entry(service, account);
	} catch {
		return undefined;
	}
}

async function openEntry(
	options: StoreOptions,
): Promise<{ readonly entry: CredentialEntry } | { readonly reason: string }> {
	const backend = backendFor(options.platform);
	if (backend === 'none') {
		return { reason: `No credential store for platform ${options.platform ?? process.platform}.` };
	}
	const factory = options.entry ?? (await loadEntryFactory());
	if (factory === undefined) {
		return { reason: 'The credential store addon is unavailable in this build.' };
	}
	// Constructing an Entry already opens platform storage, so it throws on a
	// headless Linux box long before any read or write.
	const opened = attempt(backend, () => factory(SERVICE, ACCOUNT));
	return 'reason' in opened ? { reason: opened.reason } : { entry: opened.ok };
}

/**
 * The addon reports a Rust error chain across several lines. Reasons are shown
 * inline in one-line messages, and the chain here only repeats the first line.
 */
function firstLine(message: string): string {
	const line = message.split('\n')[0]?.trim() ?? '';
	return line === '' ? message.replace(/\s+/g, ' ').trim() : line;
}

/**
 * The addon throws for every backend failure — a locked keychain, a missing
 * D-Bus session — so this is the one place those become reason strings.
 */
function attempt<T>(
	backend: CredentialBackend,
	action: () => T,
): { readonly ok: T } | { readonly reason: string } {
	try {
		return { ok: action() };
	} catch (error) {
		const detail = firstLine(error instanceof Error ? error.message : String(error));
		const hint = match(backend)
			.with('keychain', () => 'The keychain may be locked.')
			.with('secret-service', () => 'No D-Bus session, or the keyring is locked.')
			.with('credential-manager', () => 'Credential Manager rejected the request.')
			.otherwise(() => '');
		return { reason: hint === '' ? detail : `${detail} ${hint}` };
	}
}

export async function readCredential(options: StoreOptions = {}): Promise<CredentialLookup> {
	const backend = backendFor(options.platform);
	const opened = await openEntry(options);
	const native: CredentialLookup =
		'reason' in opened
			? { kind: 'unavailable', reason: opened.reason }
			: readEntry(opened.entry, backend);
	if (native.kind === 'found') {
		return native;
	}
	const file = readFile(options.filePath);
	if (file.kind === 'found') {
		return file;
	}
	return native;
}

function readEntry(entry: CredentialEntry, backend: CredentialBackend): CredentialLookup {
	const outcome = attempt(backend, () => entry.getPassword());
	if ('reason' in outcome) {
		return { kind: 'unavailable', reason: outcome.reason };
	}
	if (outcome.ok === null || outcome.ok === '') {
		return { kind: 'absent' };
	}
	return { kind: 'found', secret: outcome.ok, backend };
}

export async function writeCredential(
	secret: string,
	options: StoreOptions = {},
): Promise<CredentialChange> {
	const reason = invalidSecretReason(secret);
	if (reason !== undefined) {
		return { kind: 'unavailable', reason };
	}
	const backend = backendFor(options.platform);
	const opened = await openEntry(options);
	const native: CredentialChange =
		'reason' in opened
			? { kind: 'unavailable', reason: opened.reason }
			: writeEntry(opened.entry, secret, backend);
	if (native.kind === 'ok') {
		return { kind: 'ok', backend };
	}
	if (options.allowFile !== true) {
		return native;
	}
	const file = writeFile(secret, options.filePath);
	return file.kind === 'ok' ? { kind: 'ok', backend: 'file' } : file;
}

function writeEntry(
	entry: CredentialEntry,
	secret: string,
	backend: CredentialBackend,
): CredentialChange {
	const outcome = attempt(backend, () => {
		entry.setPassword(secret);
	});
	return 'reason' in outcome ? { kind: 'unavailable', reason: outcome.reason } : { kind: 'ok' };
}

export async function deleteCredential(options: StoreOptions = {}): Promise<CredentialChange> {
	const backend = backendFor(options.platform);
	const opened = await openEntry(options);
	const native: CredentialChange =
		'reason' in opened
			? { kind: 'unavailable', reason: opened.reason }
			: deleteEntry(opened.entry, backend);
	const file = deleteFile(options.filePath);
	if (native.kind === 'ok' || file.kind === 'ok') {
		return { kind: 'ok' };
	}
	return native;
}

function deleteEntry(entry: CredentialEntry, backend: CredentialBackend): CredentialChange {
	const outcome = attempt(backend, () => entry.deletePassword());
	if ('reason' in outcome) {
		return { kind: 'unavailable', reason: outcome.reason };
	}
	return outcome.ok ? { kind: 'ok' } : { kind: 'absent' };
}

function readFile(path = credentialFilePath()): CredentialLookup {
	try {
		const parsed = credentialFileSchema.safeParse(parseJson(readFileSync(path, 'utf8')));
		if (!parsed.success) {
			return { kind: 'absent' };
		}
		return { kind: 'found', secret: parsed.data.apiKey, backend: 'file' };
	} catch {
		return { kind: 'absent' };
	}
}

/**
 * Creates the temp file at 0600 before writing, then renames, so the secret is
 * never briefly readable under a permissive umask.
 */
function writeFile(secret: string, path = credentialFilePath()): CredentialChange {
	const temp = `${path}.${String(process.pid)}.tmp`;
	try {
		const directory = dirname(path);
		mkdirSync(directory, { recursive: true, mode: 0o700 });
		chmodSync(directory, 0o700);
		writeFileSync(temp, `${JSON.stringify({ apiKey: secret }, null, 2)}\n`, {
			mode: 0o600,
			flag: 'wx',
		});
		renameSync(temp, path);
		return { kind: 'ok' };
	} catch (error) {
		rmSync(temp, { force: true });
		return {
			kind: 'unavailable',
			reason: error instanceof Error ? error.message : 'Could not write the credential file.',
		};
	}
}

function deleteFile(path = credentialFilePath()): CredentialChange {
	try {
		rmSync(path);
		return { kind: 'ok' };
	} catch {
		return { kind: 'absent' };
	}
}
