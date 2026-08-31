export async function readApiKeyInput(
	input: NodeJS.ReadStream = process.stdin,
	output: NodeJS.WriteStream = process.stderr,
): Promise<string> {
	if (!input.isTTY) {
		let value = '';
		input.setEncoding('utf8');
		for await (const chunk of input) {
			value += chunk;
		}
		return value.trim();
	}

	output.write('API key: ');
	input.setRawMode(true);
	input.resume();

	return await new Promise<string>((resolve, reject) => {
		let value = '';
		const finish = (result: string | Error): void => {
			input.removeListener('data', onData);
			input.setRawMode(false);
			input.pause();
			output.write('\n');
			if (result instanceof Error) {
				reject(result);
			} else {
				resolve(result.trim());
			}
		};
		const onData = (chunk: Buffer | string): void => {
			const text = chunk.toString();
			for (const character of text) {
				if (character === '\u0003') {
					finish(new Error('Login cancelled.'));
					return;
				}
				if (character === '\r' || character === '\n') {
					finish(value);
					return;
				}
				if (character === '\u007f' || character === '\b') {
					value = value.slice(0, -1);
					continue;
				}
				value += character;
			}
		};
		input.on('data', onData);
	});
}
