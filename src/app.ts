import { writeFileSync } from 'node:fs';
import { CacheStore, DEFAULT_TTL_SECONDS, defaultCachePath } from '@cli/cache/store';
import { answer, getContents, search } from '@cli/generated/sdk.gen';
import type { AnswerData, GetContentsData, SearchData } from '@cli/generated/types.gen';
import { zAnswerBody, zGetContentsBody, zSearchBody } from '@cli/generated/zod.gen';
import { createExaClient } from '@cli/http/client';
import { cacheMode, executeCached } from '@cli/http/execute';
import {
	colorEnabled,
	formatCacheHit,
	formatPayload,
	formatTiming,
	formatWrote,
	resolveMode,
} from '@cli/output/presenter';
import { envContext, parser } from '@cli/parser';
import { readJsonBody } from '@cli/request-file';
import { version } from '@cli/version';
import { message } from '@optique/core/message';
import { run } from '@optique/run';

type Parsed = Awaited<ReturnType<typeof runAppParse>>;

async function runAppParse(args?: readonly string[]) {
	return await run(parser, {
		programName: 'exa',
		brief: message`CLI for Exa search, contents, and answer.`,
		help: 'both',
		version,
		completion: 'both',
		contexts: [envContext],
		...(args === undefined ? {} : { args }),
	});
}

export async function runApp(args?: readonly string[]): Promise<void> {
	const parsed = await runAppParse(args);
	await dispatch(parsed);
}

async function dispatch(parsed: Parsed): Promise<void> {
	switch (parsed.command) {
		case 'doctor':
			runDoctor(parsed);
			return;
		case 'search':
			await runSearch(parsed);
			return;
		case 'contents':
			await runContents(parsed);
			return;
		case 'answer':
			await runAnswer(parsed);
			return;
	}
}

function runDoctor(parsed: Extract<Parsed, { command: 'doctor' }>): void {
	const cache = new CacheStore(defaultCachePath());
	const lines = [
		`api-key: ${parsed.apiKey === undefined || parsed.apiKey === '' ? 'missing' : 'set'}`,
		`api-url: ${parsed.apiUrl ?? 'https://api.exa.ai'}`,
		`cache: ${cache.path}`,
		`entries: ${String(cache.count())}`,
	];
	cache.close();
	process.stdout.write(`${lines.join('\n')}\n`);
}

async function runSearch(parsed: Extract<Parsed, { command: 'search' }>): Promise<void> {
	const started = Date.now();
	const body = searchBody(parsed);
	await runOperation({
		parsed,
		operation: 'search',
		body,
		started,
		fetchBody: async (client) => {
			const result = await search({ client, body });
			return unwrap(result, 'search');
		},
	});
}

async function runContents(parsed: Extract<Parsed, { command: 'contents' }>): Promise<void> {
	const started = Date.now();
	const body = contentsBody(parsed);
	await runOperation({
		parsed,
		operation: 'contents',
		body,
		started,
		fetchBody: async (client) => {
			const result = await getContents({ client, body });
			return unwrap(result, 'contents');
		},
	});
}

async function runAnswer(parsed: Extract<Parsed, { command: 'answer' }>): Promise<void> {
	const started = Date.now();
	const body = answerBody(parsed);
	await runOperation({
		parsed,
		operation: 'answer',
		body,
		started,
		fetchBody: async (client) => {
			const result = await answer({ client, body });
			return unwrap(result, 'answer');
		},
	});
}

type Globals = {
	apiKey: string | undefined;
	apiUrl: string | undefined;
	json: boolean;
	pretty: boolean;
	output: string | undefined;
	timing: boolean;
	refresh: boolean;
	noCache: boolean;
	ttl: number | undefined;
	envelope: boolean;
	color: boolean | undefined;
};

async function runOperation(options: {
	parsed: Globals;
	operation: string;
	body: unknown;
	started: number;
	fetchBody: (client: ReturnType<typeof createExaClient>) => Promise<unknown>;
}): Promise<void> {
	const apiKey = requireApiKey(options.parsed.apiKey);
	const apiUrl = options.parsed.apiUrl ?? 'https://api.exa.ai';
	const host = new URL(apiUrl).host;
	const ttlSeconds = options.parsed.ttl ?? DEFAULT_TTL_SECONDS;
	const mode = cacheMode({ refresh: options.parsed.refresh, noCache: options.parsed.noCache });
	const cache = mode === 'off' ? undefined : new CacheStore(defaultCachePath());
	const client = createExaClient({ apiKey, apiUrl });
	try {
		const executed = await executeCached({
			host,
			operation: options.operation,
			body: options.body,
			cache,
			mode,
			ttlSeconds,
			fetchBody: () => options.fetchBody(client),
		});
		writeOutput(
			options.parsed,
			executed.payload,
			executed.cacheHit,
			executed.ageMs,
			options.started,
		);
	} finally {
		cache?.close();
	}
}

function writeOutput(
	parsed: Globals,
	payload: unknown,
	cacheHit: boolean,
	ageMs: number | undefined,
	started: number,
): void {
	const stdoutIsTTY = process.stdout.isTTY ?? false;
	const noColor = parsed.color === false;
	const forceColor = parsed.color === true;
	const mode = resolveMode({
		json: parsed.json,
		pretty: parsed.pretty,
		output: parsed.output,
		stdoutIsTTY,
		noColor,
		forceColor,
	});
	const color = colorEnabled({
		json: parsed.json,
		pretty: parsed.pretty,
		output: parsed.output,
		stdoutIsTTY,
		noColor,
		forceColor,
	});
	const renderedPayload =
		parsed.envelope && (mode === 'json' || mode === 'pretty')
			? { data: payload, cache: { hit: cacheHit, ageMs } }
			: payload;
	const text = formatPayload(
		renderedPayload,
		mode === 'text' ? 'text' : mode,
		color && mode === 'text',
	);
	if (parsed.output !== undefined) {
		writeFileSync(parsed.output, text);
		process.stderr.write(formatWrote(parsed.output));
	} else {
		process.stdout.write(text);
	}
	if (cacheHit && ageMs !== undefined && !parsed.envelope) {
		process.stderr.write(formatCacheHit(ageMs));
	}
	if (parsed.timing) {
		process.stderr.write(formatTiming(Date.now() - started));
	}
}

function searchBody(parsed: Extract<Parsed, { command: 'search' }>): SearchData['body'] {
	if (parsed.request !== undefined) {
		return parseSearchBody(readJsonBody(parsed.request));
	}
	if (parsed.query === undefined) {
		fail('search requires a query or --request.');
	}
	const body: SearchData['body'] = {
		query: parsed.query,
		contents: { highlights: true },
	};
	if (parsed.numResults !== undefined) {
		body.numResults = parsed.numResults;
	}
	if (parsed.type !== undefined && isSearchType(parsed.type)) {
		body.type = parsed.type;
	}
	if (parsed.includeDomain.length > 0) {
		body.includeDomains = [...parsed.includeDomain];
	}
	return body;
}

function contentsBody(parsed: Extract<Parsed, { command: 'contents' }>): GetContentsData['body'] {
	if (parsed.request !== undefined) {
		return parseContentsBody(readJsonBody(parsed.request));
	}
	if (parsed.urls.length === 0) {
		fail('contents requires at least one URL or --request.');
	}
	const body: GetContentsData['body'] = {
		urls: [...parsed.urls],
		highlights: true,
	};
	if (parsed.maxAgeHours !== undefined) {
		body.maxAgeHours = parsed.maxAgeHours;
	}
	return body;
}

function answerBody(parsed: Extract<Parsed, { command: 'answer' }>): AnswerData['body'] {
	if (parsed.request !== undefined) {
		return parseAnswerBody(readJsonBody(parsed.request));
	}
	if (parsed.query === undefined) {
		fail('answer requires a query or --request.');
	}
	return {
		query: parsed.query,
		text: parsed.text,
	};
}

function isSearchType(value: string): value is NonNullable<SearchData['body']['type']> {
	return (
		value === 'neural' ||
		value === 'fast' ||
		value === 'auto' ||
		value === 'deep' ||
		value === 'deep-reasoning' ||
		value === 'instant'
	);
}

function parseSearchBody(value: unknown): SearchData['body'] {
	const parsed = zSearchBody.safeParse(value);
	if (!parsed.success) {
		fail(`search --request is invalid: ${parsed.error.message}`);
	}
	const data: unknown = parsed.data;
	if (!isSearchBody(data)) {
		fail('search --request failed validation.');
	}
	return data;
}

function parseContentsBody(value: unknown): GetContentsData['body'] {
	const parsed = zGetContentsBody.safeParse(value);
	if (!parsed.success) {
		fail(`contents --request is invalid: ${parsed.error.message}`);
	}
	const data: unknown = parsed.data;
	if (!isContentsBody(data)) {
		fail('contents --request failed validation.');
	}
	return data;
}

function parseAnswerBody(value: unknown): AnswerData['body'] {
	const parsed = zAnswerBody.safeParse(value);
	if (!parsed.success) {
		fail(`answer --request is invalid: ${parsed.error.message}`);
	}
	const data: unknown = parsed.data;
	if (!isAnswerBody(data)) {
		fail('answer --request failed validation.');
	}
	return data;
}

function isSearchBody(value: unknown): value is SearchData['body'] {
	return zSearchBody.safeParse(value).success;
}

function isContentsBody(value: unknown): value is GetContentsData['body'] {
	return zGetContentsBody.safeParse(value).success;
}

function isAnswerBody(value: unknown): value is AnswerData['body'] {
	return zAnswerBody.safeParse(value).success;
}

function requireApiKey(apiKey: string | undefined): string {
	if (apiKey === undefined || apiKey === '') {
		fail('Missing API key. Set EXA_API_KEY or pass --api-key.');
	}
	return apiKey;
}

function unwrap(result: { data: unknown; error: unknown }, operation: string): unknown {
	if (result.error !== undefined) {
		fail(`${operation} failed: ${formatError(result.error)}`);
	}
	if (result.data === undefined) {
		fail(`${operation} returned an empty body.`);
	}
	return result.data;
}

function formatError(error: unknown): string {
	if (typeof error === 'string') {
		return error;
	}
	if (error instanceof Error) {
		return error.message;
	}
	return JSON.stringify(error);
}

function fail(messageText: string): never {
	process.stderr.write(`${messageText}\n`);
	process.exit(1);
}
