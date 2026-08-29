import { env } from '@cli/env';
import type { JsonObject, JsonValue } from '@cli/json';
import { isJsonObject } from '@cli/json';
import { createColors } from 'picocolors';
import { match } from 'ts-pattern';
import * as z from 'zod';

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
	return match(options)
		.returnType<OutputMode>()
		.when(
			(value) => value.json || value.output?.endsWith('.json') === true || !value.stdoutIsTTY,
			() => 'json',
		)
		.when(
			(value) => value.pretty,
			() => 'pretty',
		)
		.otherwise(() => 'text');
}

export function colorEnabled(options: PresenterOptions): boolean {
	if (options.noColor || env.NO_COLOR !== undefined) {
		return false;
	}
	if (options.forceColor || env.FORCE_COLOR !== undefined) {
		return true;
	}
	return options.stdoutIsTTY;
}

export function formatPayload(payload: JsonValue, mode: OutputMode, color: boolean): string {
	return match(mode)
		.with('json', () => `${JSON.stringify(payload)}\n`)
		.with('pretty', () => `${JSON.stringify(payload, null, 2)}\n`)
		.with('text', () => `${formatText(payload, color)}\n`)
		.exhaustive();
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

function formatText(payload: JsonValue, color: boolean): string {
	const pc = createColors(color);
	if (!isJsonObject(payload)) {
		return JSON.stringify(payload, null, 2);
	}
	return match(payload)
		.when(
			(value) => isStringField(value['answer']) || Array.isArray(value['citations']),
			(value) => formatAnswer(value, pc),
		)
		.when(
			(value) => Array.isArray(value['results']),
			(value) => formatResults(asJsonArray(value['results']), pc),
		)
		.otherwise((value) => JSON.stringify(value, null, 2));
}

function formatResults(results: JsonValue[], pc: ReturnType<typeof createColors>): string {
	const lines: string[] = [];
	for (const result of results) {
		if (!isJsonObject(result)) {
			continue;
		}
		const url = result['url'];
		if (isStringField(url)) {
			lines.push(pc.underline(url));
		}
		const title = result['title'];
		if (isStringField(title)) {
			lines.push(`  ${pc.bold(title)}`);
		}
	}
	return lines.join('\n');
}

function formatAnswer(payload: JsonObject, pc: ReturnType<typeof createColors>): string {
	const lines: string[] = [];
	const answer = payload['answer'];
	if (isStringField(answer)) {
		lines.push(answer);
	} else if (answer !== undefined && answer !== null) {
		lines.push(JSON.stringify(answer, null, 2));
	}
	const citations = payload['citations'];
	if (Array.isArray(citations)) {
		for (const citation of citations) {
			if (!isJsonObject(citation)) {
				continue;
			}
			const url = citation['url'];
			if (isStringField(url)) {
				lines.push(pc.underline(url));
			}
		}
	}
	return lines.join('\n');
}

function isStringField(value: JsonValue | undefined): value is string {
	return z.string().trim().safeParse(value).success;
}

function asJsonArray(value: JsonValue | undefined): JsonValue[] {
	return Array.isArray(value) ? value : [];
}
