import {
	zAnswerBody,
	zCreateAgentRunBody,
	zFindSimilarBody,
	zGetContentsBody,
	zGetContextBody,
	zSearchBody,
} from '@cli/generated/zod.gen';
import { parseJson } from '@cli/json';
import { object, or } from '@optique/core/constructs';
import { message } from '@optique/core/message';
import { multiple, optional, withDefault } from '@optique/core/modifiers';
import { argument, command, constant, flag, negatableFlag, option } from '@optique/core/primitives';
import { choice } from '@optique/core/valueparser';
import { bindEnv, createEnvContext } from '@optique/env';
import { path } from '@optique/run/valueparser';
import { zod } from '@optique/zod';
import * as z from 'zod';

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

function globalFields() {
	return {
		apiKey: apiKeyParser,
		apiUrl: apiUrlParser,
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
		ttl: optional(
			option('--ttl', zod(countSchema, { placeholder: 86400 }), {
				description: message`Cache TTL in seconds. Default 86400.`,
			}),
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

const searchCommand = command(
	'search',
	object({
		command: constant('search'),
		...globalFields(),
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
);

const contentsCommand = command(
	'contents',
	object({
		command: constant('contents'),
		...globalFields(),
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
);

const answerCommand = command(
	'answer',
	object({
		command: constant('answer'),
		...globalFields(),
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
);

const similarCommand = command(
	'similar',
	object({
		command: constant('similar'),
		...globalFields(),
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
);

const contextCommand = command(
	'context',
	object({
		command: constant('context'),
		...globalFields(),
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
				description: message`Token budget, or dynamic.`,
			}),
		),
	}),
);

const agentCreateCommand = command(
	'agent-create',
	object({
		command: constant('agent-create'),
		...globalFields(),
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
	}),
);

const agentGetCommand = command(
	'agent-get',
	object({
		command: constant('agent-get'),
		...globalFields(),
		id: argument(zod(querySchema, { placeholder: 'agent_run_…' }), {
			description: message`Agent run ID.`,
		}),
	}),
);

const agentCancelCommand = command(
	'agent-cancel',
	object({
		command: constant('agent-cancel'),
		...globalFields(),
		id: argument(zod(querySchema, { placeholder: 'agent_run_…' }), {
			description: message`Agent run ID.`,
		}),
	}),
);

const agentWaitCommand = command(
	'agent-wait',
	object({
		command: constant('agent-wait'),
		...globalFields(),
		id: argument(zod(querySchema, { placeholder: 'agent_run_…' }), {
			description: message`Agent run ID.`,
		}),
		timeout: optional(
			option('--timeout', zod(countSchema, { placeholder: 3600 }), {
				description: message`Wait timeout in seconds. Default 3600.`,
			}),
		),
	}),
);

const doctorCommand = command(
	'doctor',
	object({
		command: constant('doctor'),
		...globalFields(),
	}),
);

const cacheActionCommand = command(
	'cache',
	object({
		command: constant('cache'),
		...globalFields(),
		action: argument(choice(['path', 'clear', 'prune']), {
			description: message`Cache action: show the path, delete all entries, or delete expired entries.`,
		}),
	}),
);

export const parser = or(
	searchCommand,
	contentsCommand,
	answerCommand,
	similarCommand,
	contextCommand,
	agentCreateCommand,
	agentGetCommand,
	agentWaitCommand,
	agentCancelCommand,
	doctorCommand,
	cacheActionCommand,
);
