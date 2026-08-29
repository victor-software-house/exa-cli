import { createColors } from 'picocolors';

export type OutputMode = 'json' | 'pretty' | 'text';

export type PresenterOptions = {
	json: boolean;
	pretty: boolean;
	output: string | undefined;
	stdoutIsTTY: boolean;
	noColor: boolean;
	forceColor: boolean;
};

export function resolveMode(options: PresenterOptions): OutputMode {
	if (options.json || options.output?.endsWith('.json') === true || !options.stdoutIsTTY) {
		return 'json';
	}
	if (options.pretty) {
		return 'pretty';
	}
	return 'text';
}

export function colorEnabled(options: PresenterOptions): boolean {
	if (options.noColor || process.env['NO_COLOR'] !== undefined) {
		return false;
	}
	if (options.forceColor || process.env['FORCE_COLOR'] !== undefined) {
		return true;
	}
	return options.stdoutIsTTY;
}

export function formatPayload(payload: unknown, mode: OutputMode, color: boolean): string {
	if (mode === 'json') {
		return `${JSON.stringify(payload)}\n`;
	}
	if (mode === 'pretty') {
		return `${JSON.stringify(payload, null, 2)}\n`;
	}
	return `${formatText(payload, color)}\n`;
}

export function formatCacheHit(ageMs: number): string {
	return `cache hit age=${formatAge(ageMs)}\n`;
}

export function formatWrote(path: string): string {
	return `wrote ${path}\n`;
}

export function formatTiming(elapsedMs: number): string {
	return `timing total=${Math.round(elapsedMs)}ms\n`;
}

function formatAge(ageMs: number): string {
	const seconds = Math.max(0, Math.round(ageMs / 1000));
	if (seconds < 60) {
		return `${seconds}s`;
	}
	const minutes = Math.round(seconds / 60);
	if (minutes < 60) {
		return `${minutes}m`;
	}
	const hours = Math.round(minutes / 60);
	return `${hours}h`;
}

function formatText(payload: unknown, color: boolean): string {
	const pc = createColors(color);
	if (!isRecord(payload)) {
		return JSON.stringify(payload, null, 2);
	}
	if (typeof payload['answer'] === 'string' || Array.isArray(payload['citations'])) {
		return formatAnswer(payload, pc);
	}
	if (Array.isArray(payload['results'])) {
		return formatResults(payload['results'], pc);
	}
	return JSON.stringify(payload, null, 2);
}

function formatResults(results: unknown[], pc: ReturnType<typeof createColors>): string {
	const lines: string[] = [];
	for (const result of results) {
		if (!isRecord(result)) {
			continue;
		}
		const url = typeof result['url'] === 'string' ? result['url'] : undefined;
		const title = typeof result['title'] === 'string' ? result['title'] : undefined;
		if (url !== undefined) {
			lines.push(pc.underline(url));
		}
		if (title !== undefined) {
			lines.push(`  ${pc.bold(title)}`);
		}
	}
	return lines.join('\n');
}

function formatAnswer(
	payload: Record<string, unknown>,
	pc: ReturnType<typeof createColors>,
): string {
	const lines: string[] = [];
	const answer = payload['answer'];
	if (typeof answer === 'string') {
		lines.push(answer);
	} else if (answer !== undefined) {
		lines.push(JSON.stringify(answer, null, 2));
	}
	if (Array.isArray(payload['citations'])) {
		for (const citation of payload['citations']) {
			if (isRecord(citation) && typeof citation['url'] === 'string') {
				lines.push(pc.underline(citation['url']));
			}
		}
	}
	return lines.join('\n');
}

function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === 'object' && value !== null && !Array.isArray(value);
}
