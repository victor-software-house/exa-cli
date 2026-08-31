import {
	zAnswerBody,
	zCreateAgentRunBody,
	zFindSimilarBody,
	zGetContentsBody,
	zGetContextBody,
	zSearchBody,
} from '@cli/generated/zod.gen';
import { parseJson } from '@cli/json';
import { merge, object, or } from '@optique/core/constructs';
import type { Message } from '@optique/core/message';
import { commandLine, lineBreak, message } from '@optique/core/message';
import { multiple, optional, withDefault } from '@optique/core/modifiers';
import { argument, command, constant, flag, negatableFlag, option } from '@optique/core/primitives';
import { choice } from '@optique/core/valueparser';
import { bindEnv, createEnvContext } from '@optique/env';
import { path } from '@optique/run/valueparser';
import { zod } from '@optique/zod';
import * as z from 'zod';

function exampleLines(...commands: string[]): Message {
	return commands.flatMap((example, index) =>
		index === 0 ? [commandLine(example)] : [lineBreak(), commandLine(example)],
	);
}

function commandExamples(...commands: string[]): Message {
	return message`Examples:${lineBreak()}${exampleLines(...commands)}`;
}

const querySchema = z
	.string()
	.trim()
	.min(1, { error: 'Query must not be empty.' })
	.meta({ description: 'Exa query' });

const countSchema = z.coerce
	.number()
	.positive({ error: 'Expected a positive number.' })
	.meta({ description: 'Positive count' });

const tokensNumSchema = z
	.union([
		z.literal('dynamic'),
		z.coerce.number().int().gte(50, { error: 'tokensNum must be >= 50 or dynamic.' }),
	])
	.meta({ description: 'Context token budget' });

function jsonBody(schema: z.ZodType) {
	return z
		.string()
		.trim()
		.transform((raw, ctx) => {
			try {
				return schema.parse(parseJson(raw));
			} catch {
				ctx.addIssue({ code: 'custom', message: 'Expected JSON.' });
				return z.NEVER;
			}
		});
}

export const envContext = createEnvContext();

const apiKeyParser = bindEnv(
	optional(
		option('-k', '--api-key', zod(querySchema, { placeholder: 'key' }), {
			description: message`Exa API key. Falls back to EXA_API_KEY.`,
		}),
	),
	{
		context: envContext,
		key: 'EXA_API_KEY',
		parser: zod(querySchema, { placeholder: 'key' }),
	},
);

const apiUrlParser = bindEnv(
	optional(
		option('--api-url', zod(querySchema, { placeholder: 'https://api.exa.ai' }), {
			description: message`Exa API base URL.`,
		}),
	),
	{
		context: envContext,
		key: 'EXA_API_URL',
		parser: zod(querySchema, { placeholder: 'https://api.exa.ai' }),
		default: 'https://api.exa.ai',
	},
);

const ttlParser = optional(
	option('--ttl', zod(countSchema, { placeholder: 86400 }), {
		description: message`Cache TTL in seconds. Default 86400.`,
	}),
);

function outputFields() {
	return {
		json: withDefault(
			flag('--json', { description: message`Write compact JSON to stdout.` }),
			false,
		),
		pretty: withDefault(
			flag('--pretty', { description: message`Write indented JSON. Implies --json.` }),
			false,
		),
		output: optional(
			option('-o', '--output', path({ allowCreate: true, metavar: 'FILE' }), {
				description: message`Write the payload as JSON to a file instead of stdout.`,
			}),
		),
		timing: withDefault(
			flag('--timing', { description: message`Print elapsed time on stderr.` }),
			false,
		),
		envelope: withDefault(
			flag('--envelope', { description: message`Wrap JSON output with cache metadata.` }),
			false,
		),
		color: optional(
			negatableFlag(
				{ positive: '--color', negative: '--no-color' },
				{ description: message`Force or disable color.` },
			),
		),
	};
}

function apiFields() {
	return {
		apiKey: apiKeyParser,
		apiUrl: apiUrlParser,
		...outputFields(),
		refresh: constant(false),
		noCache: constant(true),
		ttl: constant(undefined),
	};
}

function cachedFields() {
	return {
		...apiFields(),
		refresh: withDefault(
			flag('--refresh', {
				description: message`Ignore cache reads and overwrite the stored response.`,
			}),
			false,
		),
		noCache: withDefault(
			flag('--no-cache', { description: message`Skip cache reads and writes.` }),
			false,
		),
		ttl: ttlParser,
	};
}

const searchCommand = command(
	'search',
	object({
		command: constant('search'),
		...cachedFields(),
		query: optional(
			argument(zod(querySchema, { placeholder: 'query' }), {
				description: message`Search query. Omit when using --request.`,
			}),
		),
		request: optional(
			option(
				'--request',
				zod(jsonBody(zSearchBody), {
					metavar: 'JSON',
					placeholder: zSearchBody.parse({ query: 'query' }),
				}),
				{
					description: message`JSON search body for /search.`,
				},
			),
		),
		numResults: optional(
			option('-n', '--num-results', zod(countSchema, { placeholder: 10 }), {
				description: message`Number of results.`,
			}),
		),
		type: optional(
			option('--type', choice(['neural', 'fast', 'auto', 'deep', 'deep-reasoning', 'instant']), {
				description: message`Search type.`,
			}),
		),
		includeDomain: multiple(
			option('--include-domain', zod(querySchema, { placeholder: 'exa.ai' }), {
				description: message`Restrict results to this domain. Repeatable.`,
			}),
		),
	}),
	{
		brief: message`Search the web with Exa.`,
		description: message`Find relevant pages and optionally retrieve focused highlights.`,
		footer: commandExamples(
			'exa search "latest TypeScript release"',
			'exa search "AI research" --include-domain arxiv.org',
			`exa search --request '{"query":"recent AI news","numResults":5}' --pretty`,
		),
	},
);

const contentsCommand = command(
	'contents',
	object({
		command: constant('contents'),
		...cachedFields(),
		urls: multiple(
			argument(zod(querySchema, { placeholder: 'URL' }), {
				description: message`Page URL. Repeatable. Omit when using --request.`,
			}),
		),
		request: optional(
			option(
				'--request',
				zod(jsonBody(zGetContentsBody), {
					metavar: 'JSON',
					placeholder: zGetContentsBody.parse({ urls: ['https://exa.ai'] }),
				}),
				{
					description: message`JSON contents body for /contents.`,
				},
			),
		),
		maxAgeHours: optional(
			option('--max-age-hours', zod(countSchema, { placeholder: 24 }), {
				description: message`Provider contents freshness window.`,
			}),
		),
	}),
	{
		brief: message`Retrieve clean content from URLs.`,
		description: message`Fetch page contents for one or more URLs.`,
		footer: commandExamples('exa contents https://exa.ai/docs --max-age-hours 24'),
	},
);

const answerCommand = command(
	'answer',
	object({
		command: constant('answer'),
		...cachedFields(),
		query: optional(
			argument(zod(querySchema, { placeholder: 'query' }), {
				description: message`Question to answer. Omit when using --request.`,
			}),
		),
		request: optional(
			option(
				'--request',
				zod(jsonBody(zAnswerBody), {
					metavar: 'JSON',
					placeholder: zAnswerBody.parse({ query: 'query' }),
				}),
				{
					description: message`JSON answer body for /answer.`,
				},
			),
		),
		text: withDefault(
			flag('--text', { description: message`Include full text on citations.` }),
			false,
		),
	}),
	{
		brief: message`Generate a cited answer.`,
		description: message`Answer a question using Exa search with supporting citations.`,
		footer: commandExamples('exa answer "What changed in TypeScript 7?" --pretty'),
	},
);

const similarCommand = command(
	'similar',
	object({
		command: constant('similar'),
		...cachedFields(),
		url: optional(
			argument(zod(querySchema, { placeholder: 'URL' }), {
				description: message`Source URL. Omit when using --request.`,
			}),
		),
		request: optional(
			option(
				'--request',
				zod(jsonBody(zFindSimilarBody), {
					metavar: 'JSON',
					placeholder: zFindSimilarBody.parse({ url: 'https://exa.ai' }),
				}),
				{
					description: message`JSON body for /findSimilar.`,
				},
			),
		),
	}),
	{
		brief: message`Find pages similar to a URL.`,
		description: message`Discover related pages based on a source URL.`,
		footer: commandExamples('exa similar https://exa.ai/docs'),
	},
);

const contextCommand = command(
	'context',
	object({
		command: constant('context'),
		...cachedFields(),
		query: optional(
			argument(zod(querySchema, { placeholder: 'query' }), {
				description: message`Coding query. Omit when using --request.`,
			}),
		),
		request: optional(
			option(
				'--request',
				zod(jsonBody(zGetContextBody), {
					metavar: 'JSON',
					placeholder: zGetContextBody.parse({ query: 'query' }),
				}),
				{
					description: message`JSON body for /context.`,
				},
			),
		),
		tokensNum: optional(
			option('--tokens-num', zod(tokensNumSchema, { placeholder: 'dynamic' }), {
				description: message`Token budget. Defaults to dynamic.`,
			}),
		),
	}),
	{
		brief: message`Get code and documentation context.`,
		description: message`Retrieve compact context tailored for coding tasks and agents.`,
		footer: commandExamples('exa context "React useEffect cleanup examples" --tokens-num 4000'),
	},
);

const agentCreateParser = object({
	command: constant('agent-create'),
	query: optional(
		argument(zod(querySchema, { placeholder: 'query' }), {
			description: message`Agent instructions. Omit when using --request.`,
		}),
	),
	request: optional(
		option(
			'--request',
			zod(jsonBody(zCreateAgentRunBody), {
				metavar: 'JSON',
				placeholder: zCreateAgentRunBody.parse({ query: 'query' }),
			}),
			{
				description: message`JSON body for POST /agent/runs.`,
			},
		),
	),
	effort: optional(
		option('--effort', choice(['minimal', 'low', 'medium', 'high', 'xhigh', 'auto', 'max']), {
			description: message`Agent effort.`,
		}),
	),
	wait: withDefault(
		flag('--wait', {
			description: message`Poll until the run is completed, failed, or cancelled.`,
		}),
		false,
	),
	timeout: optional(
		option('--timeout', zod(countSchema, { placeholder: 3600 }), {
			description: message`Wait timeout in seconds. Default 3600. Implies --wait.`,
		}),
	),
});

const agentGetParser = object({
	command: constant('agent-get'),
	id: argument(zod(querySchema, { placeholder: 'agent_run_…' }), {
		description: message`Agent run ID.`,
	}),
});

const agentCancelParser = object({
	command: constant('agent-cancel'),
	id: argument(zod(querySchema, { placeholder: 'agent_run_…' }), {
		description: message`Agent run ID.`,
	}),
});

const agentWaitParser = object({
	command: constant('agent-wait'),
	id: argument(zod(querySchema, { placeholder: 'agent_run_…' }), {
		description: message`Agent run ID.`,
	}),
	timeout: optional(
		option('--timeout', zod(countSchema, { placeholder: 3600 }), {
			description: message`Wait timeout in seconds. Default 3600.`,
		}),
	),
});

const agentOptions = {
	brief: message`Run and manage research agents.`,
	description: message`Create, inspect, wait for, and cancel Exa research agent runs.`,
	footer: commandExamples(
		'exa agent create "Research current database trends" --wait',
		'exa agent get agent_run_…',
		'exa agent wait agent_run_…',
	),
};

const agentCreateCommand = command('create', agentCreateParser, {
	brief: message`Start a research agent run.`,
	description: message`Create an asynchronous Exa research agent run, optionally waiting for completion.`,
	footer: commandExamples(
		'exa agent create "Compare current TypeScript runtimes" --effort medium --wait',
	),
});

const agentGetCommand = command('get', agentGetParser, {
	brief: message`Get an agent run.`,
	description: message`Read the current state and result of an agent run.`,
	footer: commandExamples('exa agent get agent_run_… --pretty'),
});

const agentWaitCommand = command('wait', agentWaitParser, {
	brief: message`Wait for an agent run.`,
	description: message`Poll an agent run until it completes, fails, is cancelled, or times out.`,
	footer: commandExamples('exa agent wait agent_run_… --timeout 1800'),
});

const agentCancelCommand = command('cancel', agentCancelParser, {
	brief: message`Cancel an agent run.`,
	description: message`Request cancellation of an active agent run.`,
	footer: commandExamples('exa agent cancel agent_run_…'),
});

const agentCommand = command(
	'agent',
	merge(
		object(apiFields()),
		or(agentCreateCommand, agentGetCommand, agentWaitCommand, agentCancelCommand),
	),
	agentOptions,
);

const doctorCommand = command(
	'doctor',
	object({
		command: constant('doctor'),
		apiKey: apiKeyParser,
		apiUrl: apiUrlParser,
	}),
	{
		brief: message`Inspect configuration and cache health.`,
		description: message`Show API configuration, cache location, and cached entry count.`,
	},
);

const cacheActionCommand = command(
	'cache',
	object({
		command: constant('cache'),
		ttl: ttlParser,
		action: argument(
			choice(['path', 'clear', 'prune'], { metavar: 'ACTION', suggest: 'nearest' }),
			{
				description: message`Cache action: show the path, delete all entries, or delete expired entries.`,
			},
		),
	}),
	{
		brief: message`Manage the local response cache.`,
		description: message`Show the cache path, clear all entries, or prune expired entries.`,
		footer: commandExamples('exa cache path', 'exa cache prune --ttl 86400', 'exa cache clear'),
	},
);

export const parser = or(
	searchCommand,
	contentsCommand,
	answerCommand,
	similarCommand,
	contextCommand,
	agentCommand,
	doctorCommand,
	cacheActionCommand,
);
