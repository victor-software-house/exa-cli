#!/usr/bin/env bun
//MISE description="Fail if generated client is out of date"
//MISE depends=["schema:generate"]

import { $ } from 'bun';

await $`git diff --exit-code -- src/generated`;
