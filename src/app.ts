import { writeFileSync } from 'node:fs';
import { CacheStore, DEFAULT_TTL_SECONDS, defaultCachePath } from '@cli/cache/store';
import { answer, getContents, search } from '@cli/generated/sdk.gen';
import type { AnswerData, GetContentsData, SearchData } from '@cli/generated/types.gen';
import {
	type AnswerBody,
	type GetContentsBody,
	type SearchBody,
	zAnswerBody,
	zGetContentsBody,
	zSearchBody,
} from '@cli/generated/zod.gen';
import { createExaClient } from '@cli/http/client';
import { cacheMode, executeCached } from '@cli/http/execute';
import { type JsonValue, parseJson } from '@cli/json';
import {
	colorEnabled,
	formatCacheHit,
	formatPayload,
	formatTiming,
	formatWrote,
	resolveMode,
} from '@cli/output/presenter';
import { envContext, parser } from '@cli/parser';
import { version } from '@cli/version';
import { message } from '@optique/core/message';
import { run } from '@optique/run';
import { match } from 'ts-pattern';
import * as z from 'zod';

type Parsed = Awaited<ReturnType<typeof runAppParse>>;

async function runAppParse(args?: readonly string[]) {
	const options = {
		programName: 'exa',
		brief: message`CLI for Exa search, contents, and answer.`,
		help: 'both' as const,
		version,
		completion: 'both' as const,
		contexts: [envContext],
	};
	if (args === undefined) {
		return await run(parser, options);
	}
	return await run(parser, { ...options, args });
}

export async function runApp(args?: readonly string[]): Promise<void> {
	const parsed = await runAppParse(args);
	await dispatch(parsed);
}

async function dispatch(parsed: Parsed): Promise<void> {
	await match(parsed)
		.with({ command: 'doctor' }, (value) => {
			runDoctor(value);
			return Promise.resolve();
		})
		.with({ command: 'search' }, runSearch)
		.with({ command: 'contents' }, runContents)
		.with({ command: 'answer' }, runAnswer)
		.exhaustive();
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
	const body =
		parsed.request !== undefined ? zSearchBody.parse(parsed.request) : flagSearchBody(parsed);
	await runOperation({
		parsed,
		operation: 'search',
		body,
		started,
		fetchBody: async (client) =>
			parseJson(
				JSON.stringify(
					await search({
						client,
						// SAFETY: SearchBody is z.input. Hey API's Data body uses prop?: T;
						// exactOptionalPropertyTypes rejects T | undefined.
						body: body as SearchData['body'],
					}),
				),
			),
	});
}

async function runContents(parsed: Extract<Parsed, { command: 'contents' }>): Promise<void> {
	const started = Date.now();
	const body =
		parsed.request !== undefined
			? zGetContentsBody.parse(parsed.request)
			: flagContentsBody(parsed);
	await runOperation({
		parsed,
		operation: 'contents',
		body,
		started,
		fetchBody: async (client) =>
			parseJson(
				JSON.stringify(
					await getContents({
						client,
						// SAFETY: GetContentsBody is z.input. Hey API's Data body uses prop?: T;
						// exactOptionalPropertyTypes rejects T | undefined.
						body: body as GetContentsData['body'],
					}),
				),
			),
	});
}

async function runAnswer(parsed: Extract<Parsed, { command: 'answer' }>): Promise<void> {
	const started = Date.now();
	const body =
		parsed.request !== undefined ? zAnswerBody.parse(parsed.request) : flagAnswerBody(parsed);
	await runOperation({
		parsed,
		operation: 'answer',
		body,
		started,
		fetchBody: async (client) =>
			parseJson(
				JSON.stringify(
					await answer({
						client,
						// SAFETY: AnswerBody is z.input. Hey API's Data body uses prop?: T;
						// exactOptionalPropertyTypes rejects T | undefined.
						body: body as AnswerData['body'],
					}),
				),
			),
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
	body: object;
	started: number;
	fetchBody: (client: ReturnType<typeof createExaClient>) => Promise<JsonValue>;
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
			body: parseJson(JSON.stringify(options.body)),
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
	} catch (error) {
		fail(`${options.operation} failed: ${errorMessageSchema.parse(error)}`);
	} finally {
		cache?.close();
	}
}

function writeOutput(
	parsed: Globals,
	payload: JsonValue,
	cacheHit: boolean,
	ageMs: number | undefined,
	started: number,
): void {
	const stdoutIsTTY = process.stdout.isTTY ?? false;
	const noColor = parsed.color === false;
	const forceColor = parsed.color === true;
	const presenter = {
		json: parsed.json,
		pretty: parsed.pretty,
		output: parsed.output,
		stdoutIsTTY,
		noColor,
		forceColor,
	};
	const mode = resolveMode(presenter);
	const color = colorEnabled(presenter);
	const renderedPayload =
		parsed.envelope && (mode === 'json' || mode === 'pretty')
			? { data: payload, cache: { hit: cacheHit, ageMs: ageMs ?? null } }
			: payload;
	const text = formatPayload(
		parseJson(JSON.stringify(renderedPayload)),
		mode,
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

function flagSearchBody(parsed: Extract<Parsed, { command: 'search' }>): SearchBody {
	if (parsed.query === undefined) {
		fail('search requires a query or --request.');
	}
	const body: SearchBody = {
		query: parsed.query,
		contents: { highlights: true },
	};
	if (parsed.numResults !== undefined) {
		body.numResults = parsed.numResults;
	}
	if (parsed.type !== undefined) {
		body.type = parsed.type;
	}
	if (parsed.includeDomain.length > 0) {
		body.includeDomains = [...parsed.includeDomain];
	}
	return body;
}

function flagContentsBody(parsed: Extract<Parsed, { command: 'contents' }>): GetContentsBody {
	if (parsed.urls.length === 0) {
		fail('contents requires at least one URL or --request.');
	}
	const body: GetContentsBody = {
		urls: [...parsed.urls],
		highlights: true,
	};
	if (parsed.maxAgeHours !== undefined) {
		body.maxAgeHours = parsed.maxAgeHours;
	}
	return body;
}

function flagAnswerBody(parsed: Extract<Parsed, { command: 'answer' }>): AnswerBody {
	if (parsed.query === undefined) {
		fail('answer requires a query or --request.');
	}
	return {
		query: parsed.query,
		text: parsed.text,
	};
}

function requireApiKey(apiKey: string | undefined): string {
	if (apiKey === undefined || apiKey === '') {
		fail('Missing API key. Set EXA_API_KEY or pass --api-key.');
	}
	return apiKey;
}

const errorMessageSchema = z.union([
	z.string().trim(),
	z.instanceof(Error).transform((error) => error.message),
	z.json().transform((value) => JSON.stringify(value)),
]);

function fail(messageText: string): never {
	process.stderr.write(`${messageText}\n`);
	process.exit(1);
}
