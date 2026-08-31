const DEFAULT_TIMEOUT_MS = 3000;

export type CommandOutcome =
	| { readonly kind: 'exited'; readonly exitCode: number; readonly stdout: string }
	| { readonly kind: 'missing' }
	| { readonly kind: 'timeout' }
	| { readonly kind: 'failed'; readonly reason: string };

export type CommandOptions = {
	readonly stdin?: string;
	readonly env?: Record<string, string>;
};

export type CommandRunner = (
	command: readonly string[],
	options?: CommandOptions,
) => Promise<CommandOutcome>;

/**
 * Runs a credential helper, keeping secrets out of the argument list.
 *
 * Secrets travel through stdin or a hex payload, never argv, because the
 * process list is world-readable.
 */
export const runCommand: CommandRunner = async (command, options = {}) => {
	const [file, ...args] = command;
	if (file === undefined) {
		throw new TypeError('runCommand requires a command.');
	}
	let proc: Bun.Subprocess<Bun.Spawn.Writable, 'pipe', 'ignore'>;
	try {
		proc = Bun.spawn([file, ...args], {
			stdin: options.stdin === undefined ? 'ignore' : new TextEncoder().encode(options.stdin),
			stdout: 'pipe',
			stderr: 'ignore',
			timeout: DEFAULT_TIMEOUT_MS,
			killSignal: 'SIGKILL',
			env: options.env === undefined ? process.env : { ...process.env, ...options.env },
		});
	} catch (error) {
		if (error instanceof Error && 'code' in error && error.code === 'ENOENT') {
			return { kind: 'missing' };
		}
		return { kind: 'failed', reason: error instanceof Error ? error.message : 'spawn failed' };
	}
	const [stdout, exitCode] = await Promise.all([new Response(proc.stdout).text(), proc.exited]);
	// `killed` is true even for a clean exit, so the signal is the only reliable
	// indicator that the timeout fired.
	if (proc.signalCode !== null) {
		return { kind: 'timeout' };
	}
	return { kind: 'exited', exitCode, stdout };
};
