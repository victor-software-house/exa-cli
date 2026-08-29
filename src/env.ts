import * as z from 'zod';

const blankableSchema = z
	.string()
	.trim()
	.optional()
	.transform((value): string | undefined => {
		if (value === undefined || value === '') {
			return undefined;
		}
		return value;
	});

const processEnvSchema = z.looseObject({
	CI: blankableSchema,
	EXA_API_KEY: blankableSchema,
	EXA_API_URL: blankableSchema,
	FORCE_COLOR: z.string().trim().optional(),
	NO_COLOR: z.string().trim().optional(),
	XDG_CACHE_HOME: blankableSchema,
});

export type Env = z.output<typeof processEnvSchema>;

export function parseEnv(source: NodeJS.ProcessEnv = process.env): Env {
	return processEnvSchema.parse(source);
}

export const env: Env = parseEnv();
