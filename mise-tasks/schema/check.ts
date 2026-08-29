#!/usr/bin/env bun
//MISE description="Fail if generated client is out of date"
//MISE depends=["schema"]

import { $ } from 'bun';

await $`git diff --exit-code -- src/generated`;
