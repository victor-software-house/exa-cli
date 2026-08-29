import * as z from 'zod';

const jsonSchema = z.json();

export type JsonValue = z.output<typeof jsonSchema>;

export type JsonObject = {
	readonly [key: string]: JsonValue;
};

export function parseJson(text: string): JsonValue {
	return jsonSchema.parse(JSON.parse(text));
}

export function isJsonObject(value: JsonValue): value is JsonObject {
	return typeof value === 'object' && value !== null && !Array.isArray(value);
}
