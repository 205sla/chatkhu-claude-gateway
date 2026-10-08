#!/usr/bin/env node
import { main } from '../src/cli.mjs';
import { safeError } from '../src/errors.mjs';

try { process.exitCode = await main(); }
catch (error) { console.error(safeError(error)); process.exitCode = 1; }
