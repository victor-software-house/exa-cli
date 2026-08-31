#!/usr/bin/env bun
//MISE description="First-publication bootstrap: npm browser login, platform packages, OIDC trust"
//MISE dir="{{ config_root }}"

import { bootstrapNpmPackages } from 'bun-release';
import { stagePlatforms } from './npm-staging';

await bootstrapNpmPackages(
	stagePlatforms().map(({ dir, name, version }) => ({ directory: dir, name, version })),
	'victor-software-house/exa-cli',
	'release.yml',
);
