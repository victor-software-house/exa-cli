import packageJson from '@pkg' with { type: 'json' };

export const packageName: string = packageJson.name;
export const version: string = packageJson.version;
