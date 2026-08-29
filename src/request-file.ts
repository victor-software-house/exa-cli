import { readFileSync } from 'node:fs';
import { parseJson } from '@cli/json';

export function readJsonBody(path: string): unknown {
	return parseJson(readFileSync(path, 'utf8'));
}
