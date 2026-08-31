#!/usr/bin/env bun
//MISE description="Create the git tag and GitHub Release for the current version"
//MISE dir="{{ config_root }}"

import { version } from '@pkg' with { type: 'json' };
import { tagAndGithubRelease } from 'bun-release';

await tagAndGithubRelease(version);
