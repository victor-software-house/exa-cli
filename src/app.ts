import { writeFileSync } from 'node:fs';
import {
	AgentWaitTimeoutError,
	DEFAULT_AGENT_WAIT_SECONDS,
	jsonStringField,
	waitForAgentRun,
} from '@cli/agent/wait';
import { apiKeyDigest } from '@cli/cache/key';
import { CacheStore, DEFAULT_TTL_SECONDS, defaultCachePath } from '@cli/cache/store';
import {
	answer,
	cancelAgentRun,
	createAgentRun,
	findSimilar,
	getAgentRun,
	getContents,
	getContext,
	search,
} from '@cli/generated/sdk.gen';
import type {
	AnswerData,
	CreateAgentRunData,
	FindSimilarData,
	GetContentsData,
	GetContextData,
	SearchData,
} from '@cli/generated/types.gen';
import {
	type AnswerBody,
	type CreateAgentRunBody,
	type FindSimilarBody,
	type GetContentsBody,
	type GetContextBody,
	type SearchBody,
	zAnswerBody,
	zCreateAgentRunBody,
	zFindSimilarBody,
	zGetContentsBody,
	zGetContextBody,
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
import { commandLine, lineBreak, message } from '@optique/core/message';
import { run } from '@optique/run';
import { match } from 'ts-pattern';
import * as z from 'zod';

type Parsed = Awaited<ReturnType<typeof runAppParse>>;

async function runAppParse(args?: readonly string[]) {
	const options = {
		programName: 'exa',
		brief: message`Search, retrieve, and research the web with Exa.`,
		description: message`A fast, scriptable Exa client with human-readable output, structured JSON, and a local response cache.`,
		examples: message`${commandLine('exa search "latest TypeScript release"')}${lineBreak()}${commandLine('exa contents https://exa.ai/docs')}${lineBreak()}${commandLine('exa answer "What changed in TypeScript 7?"')}${lineBreak()}${commandLine('exa agent create "Research current database trends" --wait')}`,
		footer: message`Run exa <command> --help for command-specific options and examples.`,
		help: 'both' as const,
		version,
		completion: 'command' as const,
		showUsage: false,
		commandList: 'top-level' as const,
		showChoices: true,
		aboveError: 'none' as const,
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
		.with({ command: 'cache' }, (value) => {
			runCache(value);
			return Promise.resolve();
		})
		.with({ command: 'search' }, runSearch)
		.with({ command: 'contents' }, runContents)
		.with({ command: 'answer' }, runAnswer)
		.with({ command: 'similar' }, runSimilar)
		.with({ command: 'context' }, runContext)
		.with({ command: 'agent-create' }, runAgentCreate)
		.with({ command: 'agent-get' }, runAgentGet)
		.with({ command: 'agent-wait' }, runAgentWait)
		.with({ command: 'agent-cancel' }, runAgentCancel)
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

function runCache(parsed: Extract<Parsed, { command: 'cache' }>): void {
	const cache = new CacheStore(defaultCachePath());
	try {
		match(parsed.action)
			.with('path', () => process.stdout.write(`${cache.path}\n`))
			.with('clear', () => process.stdout.write(`cleared ${cache.clear()}\n`))
			.with('prune', () => {
				const ttlSeconds = parsed.ttl ?? DEFAULT_TTL_SECONDS;
				process.stdout.write(`pruned ${cache.prune(ttlSeconds)}\n`);
			})
			.exhaustive();
	} finally {
		cache.close();
	}
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

async function runSimilar(parsed: Extract<Parsed, { command: 'similar' }>): Promise<void> {
	const started = Date.now();
	const body =
		parsed.request !== undefined ? zFindSimilarBody.parse(parsed.request) : flagSimilarBody(parsed);
	await runOperation({
		parsed,
		operation: 'findSimilar',
		body,
		started,
		fetchBody: async (client) =>
			parseJson(
				JSON.stringify(
					await findSimilar({
						client,
						// SAFETY: FindSimilarBody is z.input. Hey API's Data body uses prop?: T;
						// exactOptionalPropertyTypes rejects T | undefined.
						body: body as FindSimilarData['body'],
					}),
				),
			),
	});
}

async function runContext(parsed: Extract<Parsed, { command: 'context' }>): Promise<void> {
	const started = Date.now();
	const parsedBody =
		parsed.request !== undefined ? zGetContextBody.parse(parsed.request) : flagContextBody(parsed);
	const body: GetContextBody =
		parsedBody.tokensNum === undefined ? { ...parsedBody, tokensNum: 'dynamic' } : parsedBody;
	await runOperation({
		parsed,
		operation: 'context',
		body,
		started,
		fetchBody: async (client) =>
			parseJson(
				JSON.stringify(
					await getContext({
						client,
						// SAFETY: GetContextBody is z.input. Hey API's Data body uses prop?: T;
						// exactOptionalPropertyTypes rejects T | undefined.
						body: body as GetContextData['body'],
					}),
				),
			),
	});
}

async function runAgentCreate(parsed: Extract<Parsed, { command: 'agent-create' }>): Promise<void> {
	const started = Date.now();
	const body =
		parsed.request !== undefined
			? zCreateAgentRunBody.parse(parsed.request)
			: flagAgentCreateBody(parsed);
	const shouldWait = parsed.wait || parsed.timeout !== undefined;
	if (!shouldWait) {
		await runOperation({
			parsed,
			operation: 'agent create',
			body,
			started,
			disableCache: true,
			fetchBody: async (client) =>
				parseJson(
					JSON.stringify(
						await createAgentRun({
							client,
							// SAFETY: CreateAgentRunBody is z.input. Hey API's Data body uses prop?: T;
							// exactOptionalPropertyTypes rejects T | undefined.
							body: body as CreateAgentRunData['body'],
						}),
					),
				),
		});
		return;
	}
	const apiKey = requireApiKey(parsed.apiKey);
	const apiUrl = parsed.apiUrl ?? 'https://api.exa.ai';
	const client = createExaClient({ apiKey, apiUrl });
	await runWaitAndWrite(parsed, started, 'agent create', async () => {
		const created = parseJson(
			JSON.stringify(
				await createAgentRun({
					client,
					// SAFETY: CreateAgentRunBody is z.input. Hey API's Data body uses prop?: T;
					// exactOptionalPropertyTypes rejects T | undefined.
					body: body as CreateAgentRunData['body'],
				}),
			),
		);
		const id = jsonStringField(created, 'id');
		if (id === undefined) {
			fail('agent create did not return an id.');
		}
		return await pollAgentRun(client, id, parsed.timeout);
	});
}

async function runAgentGet(parsed: Extract<Parsed, { command: 'agent-get' }>): Promise<void> {
	const started = Date.now();
	await runOperation({
		parsed,
		operation: 'agent get',
		body: { id: parsed.id },
		started,
		disableCache: true,
		fetchBody: async (client) =>
			parseJson(
				JSON.stringify(
					await getAgentRun({
						client,
						path: { id: parsed.id },
					}),
				),
			),
	});
}

async function runAgentWait(parsed: Extract<Parsed, { command: 'agent-wait' }>): Promise<void> {
	const started = Date.now();
	const apiKey = requireApiKey(parsed.apiKey);
	const apiUrl = parsed.apiUrl ?? 'https://api.exa.ai';
	const client = createExaClient({ apiKey, apiUrl });
	await runWaitAndWrite(parsed, started, 'agent wait', () =>
		pollAgentRun(client, parsed.id, parsed.timeout),
	);
}

async function pollAgentRun(
	client: ReturnType<typeof createExaClient>,
	id: string,
	timeoutSeconds: number | undefined,
): Promise<JsonValue> {
	return await waitForAgentRun({
		id,
		timeoutMs: (timeoutSeconds ?? DEFAULT_AGENT_WAIT_SECONDS) * 1000,
		getRun: async (runId) =>
			parseJson(
				JSON.stringify(
					await getAgentRun({
						client,
						path: { id: runId },
					}),
				),
			),
		onStatus: (status) => {
			process.stderr.write(`agent wait: ${status}\n`);
		},
	});
}

async function runWaitAndWrite(
	parsed: Globals,
	started: number,
	operation: string,
	fetchPayload: () => Promise<JsonValue>,
): Promise<void> {
	try {
		writeOutput(parsed, await fetchPayload(), false, undefined, started);
	} catch (error) {
		if (error instanceof AgentWaitTimeoutError) {
			writeOutput(parsed, error.lastPayload, false, undefined, started);
			fail(error.message);
		}
		fail(`${operation} failed: ${errorMessageSchema.parse(error)}`);
	}
}

async function runAgentCancel(parsed: Extract<Parsed, { command: 'agent-cancel' }>): Promise<void> {
	const started = Date.now();
	await runOperation({
		parsed,
		operation: 'agent cancel',
		body: { id: parsed.id },
		started,
		disableCache: true,
		fetchBody: async (client) =>
			parseJson(
				JSON.stringify(
					await cancelAgentRun({
						client,
						path: { id: parsed.id },
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
	disableCache?: boolean;
	fetchBody: (client: ReturnType<typeof createExaClient>) => Promise<JsonValue>;
}): Promise<void> {
	const apiKey = requireApiKey(options.parsed.apiKey);
	const apiUrl = options.parsed.apiUrl ?? 'https://api.exa.ai';
	const host = new URL(apiUrl).host;
	const ttlSeconds = options.parsed.ttl ?? DEFAULT_TTL_SECONDS;
	const mode =
		options.disableCache === true
			? 'off'
			: cacheMode({ refresh: options.parsed.refresh, noCache: options.parsed.noCache });
	const cache = mode === 'off' ? undefined : new CacheStore(defaultCachePath());
	const client = createExaClient({ apiKey, apiUrl });
	try {
		const executed = await executeCached({
			host,
			operation: options.operation,
			keyDigest: apiKeyDigest(apiKey),
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

function flagSimilarBody(parsed: Extract<Parsed, { command: 'similar' }>): FindSimilarBody {
	if (parsed.url === undefined) {
		fail('similar requires a URL or --request.');
	}
	return {
		url: parsed.url,
		contents: { highlights: true },
	};
}

function flagContextBody(parsed: Extract<Parsed, { command: 'context' }>): GetContextBody {
	if (parsed.query === undefined) {
		fail('context requires a query or --request.');
	}
	const body: GetContextBody = { query: parsed.query };
	if (parsed.tokensNum !== undefined) {
		body.tokensNum = parsed.tokensNum;
	}
	return body;
}

function flagAgentCreateBody(
	parsed: Extract<Parsed, { command: 'agent-create' }>,
): CreateAgentRunBody {
	if (parsed.query === undefined) {
		fail('agent create requires a query or --request.');
	}
	const body: CreateAgentRunBody = { query: parsed.query };
	if (parsed.effort !== undefined) {
		body.effort = parsed.effort;
	}
	return body;
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
