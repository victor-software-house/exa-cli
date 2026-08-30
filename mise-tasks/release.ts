#!/usr/bin/env bun
//MISE description="Publish to public npm with bun"
//MISE dir="{{ config_root }}"

import { name, version } from '@pkg' with { type: 'json' };
import { publishIfNeeded } from 'bun-release';

await publishIfNeeded(name, version);
