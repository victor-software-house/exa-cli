import { chmodSync, mkdirSync, readFileSync, renameSync, rmSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { dirname, join } from 'node:path';
import { type CommandRunner, runCommand } from '@cli/credentials/command';
import { env } from '@cli/env';
import { parseJson } from '@cli/json';
import { match } from 'ts-pattern';
import * as z from 'zod';

const credentialFileSchema = z.object({
	apiKey: z.string().trim().min(1),
});

const SERVICE = 'exa-cli';
const ACCOUNT = 'default';
const LABEL = 'Exa CLI API key';
const MACOS_SECURITY = '/usr/bin/security';

/** `security` and our PowerShell scripts both use 44 for "no such item". */
const NOT_FOUND_EXIT = 44;

export type CredentialBackend = 'keychain' | 'secret-service' | 'dpapi' | 'file' | 'none';

export type CredentialLookup =
	| { readonly kind: 'found'; readonly secret: string; readonly backend: CredentialBackend }
	| { readonly kind: 'absent' }
	| { readonly kind: 'unavailable'; readonly reason: string };

export type CredentialChange =
	| { readonly kind: 'ok'; readonly backend?: CredentialBackend }
	| { readonly kind: 'absent' }
	| { readonly kind: 'unavailable'; readonly reason: string };

export type StoreOptions = {
	readonly platform?: NodeJS.Platform;
	readonly run?: CommandRunner;
	readonly allowFile?: boolean;
	readonly filePath?: string;
	readonly dpapiPath?: string;
};

/**
 * A newline would be indistinguishable from the record separator that
 * `secret-tool` and `git credential` use, and would be silently absorbed by
 * `security find-generic-password -w`. Reject it at the boundary instead of
 * storing something we cannot read back byte-for-byte.
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
		.with('win32', () => 'dpapi')
		.otherwise(() => 'none');
}

export function describeBackend(backend: CredentialBackend): string {
	return match(backend)
		.with('keychain', () => 'macOS Keychain')
		.with('secret-service', () => 'Secret Service (secret-tool)')
		.with('dpapi', () => 'Windows DPAPI encrypted file')
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

function dpapiPath(): string {
	if (env.APPDATA !== undefined) {
		return join(env.APPDATA, 'exa-cli', 'credential.dpapi');
	}
	return join(homedir(), '.config', 'exa-cli', 'credential.dpapi');
}

/**
 * PowerShell scripts are constant text passed through -EncodedCommand, so no
 * caller value is ever interpolated into a script. The target path arrives as
 * an environment variable and the secret arrives on stdin.
 */
const DPAPI_READ = `
$ErrorActionPreference = 'Stop'
if (-not (Test-Path -LiteralPath $env:EXA_CREDENTIAL_PATH)) { exit ${NOT_FOUND_EXIT} }
$secure = Get-Content -Raw -LiteralPath $env:EXA_CREDENTIAL_PATH | ConvertTo-SecureString
$bstr = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($secure)
try { [Console]::Out.Write([Runtime.InteropServices.Marshal]::PtrToStringBSTR($bstr)) }
finally { [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($bstr) }
`;

const DPAPI_WRITE = `
$ErrorActionPreference = 'Stop'
$plain = [Console]::In.ReadToEnd()
$secure = ConvertTo-SecureString $plain -AsPlainText -Force
$dir = Split-Path -Parent $env:EXA_CREDENTIAL_PATH
New-Item -ItemType Directory -Force -Path $dir | Out-Null
ConvertFrom-SecureString $secure |
  Set-Content -NoNewline -Encoding ascii -LiteralPath $env:EXA_CREDENTIAL_PATH
`;

const DPAPI_DELETE = `
$ErrorActionPreference = 'Stop'
if (-not (Test-Path -LiteralPath $env:EXA_CREDENTIAL_PATH)) { exit ${NOT_FOUND_EXIT} }
Remove-Item -LiteralPath $env:EXA_CREDENTIAL_PATH -Force
`;

function powershell(script: string): readonly string[] {
	const encoded = Buffer.from(script, 'utf16le').toString('base64');
	return ['powershell', '-NoProfile', '-NonInteractive', '-EncodedCommand', encoded];
}

export async function readCredential(options: StoreOptions = {}): Promise<CredentialLookup> {
	const backend = backendFor(options.platform);
	const run = options.run ?? runCommand;
	const native = await match(backend)
		.returnType<Promise<CredentialLookup>>()
		.with('keychain', () => readKeychain(run))
		.with('secret-service', () => readSecretService(run))
		.with('dpapi', () => readDpapi(run, options.dpapiPath))
		.otherwise(() =>
			Promise.resolve<CredentialLookup>({
				kind: 'unavailable',
				reason: `No credential store for platform ${options.platform ?? process.platform}.`,
			}),
		);
	if (native.kind === 'found') {
		return native;
	}
	const file = readFile(options.filePath);
	if (file.kind === 'found') {
		return file;
	}
	return native;
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
	const run = options.run ?? runCommand;
	const native = await match(backend)
		.returnType<Promise<CredentialChange>>()
		.with('keychain', () => writeKeychain(run, secret))
		.with('secret-service', () => writeSecretService(run, secret))
		.with('dpapi', () => writeDpapi(run, secret, options.dpapiPath))
		.otherwise(() =>
			Promise.resolve<CredentialChange>({
				kind: 'unavailable',
				reason: `No credential store for platform ${options.platform ?? process.platform}.`,
			}),
		);
	if (native.kind === 'ok') {
		return { kind: 'ok', backend };
	}
	if (options.allowFile !== true) {
		return native;
	}
	const file = writeFile(secret, options.filePath);
	return file.kind === 'ok' ? { kind: 'ok', backend: 'file' } : file;
}

export async function deleteCredential(options: StoreOptions = {}): Promise<CredentialChange> {
	const backend = backendFor(options.platform);
	const run = options.run ?? runCommand;
	const native = await match(backend)
		.returnType<Promise<CredentialChange>>()
		.with('keychain', () => deleteKeychain(run))
		.with('secret-service', () => deleteSecretService(run))
		.with('dpapi', () => deleteDpapi(run, options.dpapiPath))
		.otherwise(() => Promise.resolve<CredentialChange>({ kind: 'absent' }));
	const file = deleteFile(options.filePath);
	if (native.kind === 'ok' || file.kind === 'ok') {
		return { kind: 'ok' };
	}
	return native;
}

async function readKeychain(run: CommandRunner): Promise<CredentialLookup> {
	const outcome = await run([
		MACOS_SECURITY,
		'find-generic-password',
		'-s',
		SERVICE,
		'-a',
		ACCOUNT,
		'-w',
	]);
	return match(outcome)
		.returnType<CredentialLookup>()
		.with({ kind: 'missing' }, () => ({
			kind: 'unavailable',
			reason: 'The security command is unavailable.',
		}))
		.with({ kind: 'timeout' }, () => ({
			kind: 'unavailable',
			reason: 'The keychain did not respond.',
		}))
		.with({ kind: 'failed' }, ({ reason }) => ({ kind: 'unavailable', reason }))
		.with({ kind: 'exited', exitCode: 0 }, ({ stdout }) => ({
			kind: 'found',
			secret: stdout.replace(/\n$/, ''),
			backend: 'keychain',
		}))
		.with({ kind: 'exited', exitCode: NOT_FOUND_EXIT }, () => ({ kind: 'absent' }))
		.otherwise(({ exitCode }) => ({
			kind: 'unavailable',
			reason: `security exited with ${String(exitCode)}. The keychain may be locked.`,
		}));
}

/**
 * Writes through `security -i` so the payload never appears in argv, and as a
 * hex blob via -X so no shell-style quoting of the secret is required.
 */
async function writeKeychain(run: CommandRunner, secret: string): Promise<CredentialChange> {
	const hex = Buffer.from(secret, 'utf8').toString('hex').toUpperCase();
	const outcome = await run([MACOS_SECURITY, '-i'], {
		stdin: `add-generic-password -U -s ${SERVICE} -a ${ACCOUNT} -l "${LABEL}" -X ${hex}\n`,
	});
	return changeFrom(outcome, 'security', 'The keychain may be locked.');
}

async function deleteKeychain(run: CommandRunner): Promise<CredentialChange> {
	const outcome = await run([
		MACOS_SECURITY,
		'delete-generic-password',
		'-s',
		SERVICE,
		'-a',
		ACCOUNT,
	]);
	return changeFrom(outcome, 'security', 'The keychain may be locked.');
}

async function readSecretService(run: CommandRunner): Promise<CredentialLookup> {
	const outcome = await run(['secret-tool', 'lookup', 'service', SERVICE, 'account', ACCOUNT]);
	return match(outcome)
		.returnType<CredentialLookup>()
		.with({ kind: 'missing' }, () => ({
			kind: 'unavailable',
			reason: 'secret-tool is not installed. On Debian or Ubuntu, install libsecret-tools.',
		}))
		.with({ kind: 'timeout' }, () => ({
			kind: 'unavailable',
			reason: 'The Secret Service did not respond. No D-Bus session or the keyring is locked.',
		}))
		.with({ kind: 'failed' }, ({ reason }) => ({ kind: 'unavailable', reason }))
		.with({ kind: 'exited', exitCode: 0 }, ({ stdout }) =>
			stdout === ''
				? { kind: 'absent' }
				: {
						kind: 'found',
						secret: stdout.replace(/\n$/, ''),
						backend: 'secret-service',
					},
		)
		.with({ kind: 'exited', exitCode: 1 }, () => ({ kind: 'absent' }))
		.otherwise(({ exitCode }) => ({
			kind: 'unavailable',
			reason: `secret-tool exited with ${String(exitCode)}.`,
		}));
}

/** `secret-tool store` reads the secret from stdin until EOF, newlines included. */
async function writeSecretService(run: CommandRunner, secret: string): Promise<CredentialChange> {
	const outcome = await run(
		['secret-tool', 'store', '--label', LABEL, 'service', SERVICE, 'account', ACCOUNT],
		{ stdin: secret },
	);
	return changeFrom(outcome, 'secret-tool', 'No D-Bus session or the keyring is locked.');
}

async function deleteSecretService(run: CommandRunner): Promise<CredentialChange> {
	const outcome = await run(['secret-tool', 'clear', 'service', SERVICE, 'account', ACCOUNT]);
	if (outcome.kind === 'exited' && outcome.exitCode === 1) {
		return { kind: 'absent' };
	}
	return changeFrom(outcome, 'secret-tool', 'No D-Bus session or the keyring is locked.');
}

async function readDpapi(
	run: CommandRunner,
	credentialPath = dpapiPath(),
): Promise<CredentialLookup> {
	const outcome = await run(powershell(DPAPI_READ), {
		env: { EXA_CREDENTIAL_PATH: credentialPath },
	});
	return match(outcome)
		.returnType<CredentialLookup>()
		.with({ kind: 'missing' }, () => ({
			kind: 'unavailable',
			reason: 'powershell is unavailable.',
		}))
		.with({ kind: 'timeout' }, () => ({ kind: 'unavailable', reason: 'powershell timed out.' }))
		.with({ kind: 'failed' }, ({ reason }) => ({ kind: 'unavailable', reason }))
		.with({ kind: 'exited', exitCode: 0 }, ({ stdout }) => ({
			kind: 'found',
			secret: stdout,
			backend: 'dpapi',
		}))
		.with({ kind: 'exited', exitCode: NOT_FOUND_EXIT }, () => ({ kind: 'absent' }))
		.otherwise(({ exitCode }) => ({
			kind: 'unavailable',
			reason: `powershell exited with ${String(exitCode)}. The DPAPI blob may belong to another user.`,
		}));
}

async function writeDpapi(
	run: CommandRunner,
	secret: string,
	credentialPath = dpapiPath(),
): Promise<CredentialChange> {
	const outcome = await run(powershell(DPAPI_WRITE), {
		stdin: secret,
		env: { EXA_CREDENTIAL_PATH: credentialPath },
	});
	return changeFrom(outcome, 'powershell', 'DPAPI encryption failed.');
}

async function deleteDpapi(
	run: CommandRunner,
	credentialPath = dpapiPath(),
): Promise<CredentialChange> {
	const outcome = await run(powershell(DPAPI_DELETE), {
		env: { EXA_CREDENTIAL_PATH: credentialPath },
	});
	return changeFrom(outcome, 'powershell', 'DPAPI deletion failed.');
}

function changeFrom(
	outcome: Awaited<ReturnType<CommandRunner>>,
	tool: string,
	lockedHint: string,
): CredentialChange {
	return match(outcome)
		.returnType<CredentialChange>()
		.with({ kind: 'missing' }, () => ({
			kind: 'unavailable',
			reason: `${tool} is unavailable.`,
		}))
		.with({ kind: 'timeout' }, () => ({
			kind: 'unavailable',
			reason: `${tool} did not respond. ${lockedHint}`,
		}))
		.with({ kind: 'failed' }, ({ reason }) => ({ kind: 'unavailable', reason }))
		.with({ kind: 'exited', exitCode: 0 }, () => ({ kind: 'ok' }))
		.with({ kind: 'exited', exitCode: NOT_FOUND_EXIT }, () => ({ kind: 'absent' }))
		.otherwise(({ exitCode }) => ({
			kind: 'unavailable',
			reason: `${tool} exited with ${String(exitCode)}. ${lockedHint}`,
		}));
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
