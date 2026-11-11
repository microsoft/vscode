/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/*---------------------------------------------------------------------------------------------
 *  Focused unit checks for Section 6 (os-gated whole-package enumeration) of scan-licenses.ts.
 *
 *  Run:  npx tsx section6.test.ts
 *
 *  Covers (no network required):
 *    1. osAllows - npm `os` constraint semantics (positive, negation, mixed, empty).
 *    2. isOsGatedShippedElsewhere - the predicate that decides whether a package
 *       is invisible on the build host yet ships on a platform we target (the
 *       @vscode/windows-ca-certs case), keyed on the host platform.
 *    3. getSection6SeedReason - seeds by `os`, or a production package that pnpm
 *       skipped on the host (the windows-foreground-love case).
 *    4. readPnpmSkippedPackages - reads `skipped` from node_modules/.modules.yaml.
 *--------------------------------------------------------------------------------------------*/

import fs from 'fs';
import os from 'os';
import path from 'path';
import { osAllows, isOsGatedShippedElsewhere, getSection6SeedReason, NPM_SHIPPED_OS } from './scan-licenses.js';
import { readPnpmSkippedPackages } from './pnpm-lockfile.js';

let passed = 0;
let failed = 0;

function check(name: string, cond: boolean): void {
	if (cond) {
		passed++;
		console.log(`  ok   ${name}`);
	} else {
		failed++;
		console.error(`  FAIL ${name}`);
	}
}

// -- 1. osAllows --------------------------------------------------------------
console.log('osAllows - positive lists:');
check('["win32"] allows win32', osAllows(['win32'], 'win32') === true);
check('["win32"] denies linux', osAllows(['win32'], 'linux') === false);
check('["darwin","linux"] allows linux', osAllows(['darwin', 'linux'], 'linux') === true);
check('["darwin","linux"] denies win32', osAllows(['darwin', 'linux'], 'win32') === false);

console.log('osAllows - negation lists:');
check('["!win32"] denies win32', osAllows(['!win32'], 'win32') === false);
check('["!win32"] allows linux', osAllows(['!win32'], 'linux') === true);
check('["!linux"] denies linux', osAllows(['!linux'], 'linux') === false);
check('["!linux"] allows win32', osAllows(['!linux'], 'win32') === true);

console.log('osAllows - edge cases:');
check('[] allows anything (no constraint)', osAllows([], 'linux') === true);
check('negation wins over positive', osAllows(['linux', '!linux'], 'linux') === false);
check('ignores empty/non-string entries', osAllows(['', 'win32'], 'win32') === true);

// -- 2. isOsGatedShippedElsewhere (host = linux, the NOTICE agent) ------------
console.log('isOsGatedShippedElsewhere - host = linux (the NOTICE agent):');
// The motivating case: @vscode/windows-ca-certs is os:["win32"].
check('os:["win32"] on linux -> TRUE (ships win32, absent on linux)',
	isOsGatedShippedElsewhere(['win32'], 'linux') === true);
check('os:["darwin"] on linux -> TRUE (ships darwin, absent on linux)',
	isOsGatedShippedElsewhere(['darwin'], 'linux') === true);
check('os:["win32","darwin"] on linux -> TRUE',
	isOsGatedShippedElsewhere(['win32', 'darwin'], 'linux') === true);
check('os:["linux"] on linux -> FALSE (installs on host)',
	isOsGatedShippedElsewhere(['linux'], 'linux') === false);
check('os:["win32","linux"] on linux -> FALSE (installs on host)',
	isOsGatedShippedElsewhere(['win32', 'linux'], 'linux') === false);
check('os:["!win32"] on linux -> FALSE (installs on host)',
	isOsGatedShippedElsewhere(['!win32'], 'linux') === false);
check('os:["!linux"] on linux -> TRUE (absent on linux, ships win32/darwin)',
	isOsGatedShippedElsewhere(['!linux'], 'linux') === true);
check('os:["android"] on linux -> FALSE (we do not ship android)',
	isOsGatedShippedElsewhere(['android'], 'linux') === false);
check('os:["freebsd"] on linux -> FALSE (we do not ship freebsd)',
	isOsGatedShippedElsewhere(['freebsd'], 'linux') === false);
check('empty os -> FALSE', isOsGatedShippedElsewhere([], 'linux') === false);
check('non-array os -> FALSE', isOsGatedShippedElsewhere(undefined as unknown as string[], 'linux') === false);

console.log('isOsGatedShippedElsewhere - host = win32 (sanity, other agent):');
check('os:["win32"] on win32 -> FALSE (installs on host)',
	isOsGatedShippedElsewhere(['win32'], 'win32') === false);
check('os:["linux"] on win32 -> TRUE (absent on win32, ships linux)',
	isOsGatedShippedElsewhere(['linux'], 'win32') === true);

console.log('NPM_SHIPPED_OS sanity:');
check('contains darwin/linux/win32', NPM_SHIPPED_OS.has('darwin') && NPM_SHIPPED_OS.has('linux') && NPM_SHIPPED_OS.has('win32'));
check('does not contain android', NPM_SHIPPED_OS.has('android') === false);

// -- 3. getSection6SeedReason (host = linux) ----------------------------------
console.log('getSection6SeedReason - host = linux:');
const skipped = new Set(['windows-foreground-love@0.6.1', 'fsevents@2.3.3']);
check('os:["win32"] -> seeded for its os',
	getSection6SeedReason({ name: '@vscode/windows-ca-certs', version: '0.3.4', os: ['win32'], dev: false }, skipped, 'linux') === 'os:[win32]');
check('no os, skipped production package -> seeded as skipped (the windows-foreground-love case)',
	getSection6SeedReason({ name: 'windows-foreground-love', version: '0.6.1', dev: false }, skipped, 'linux') === 'skipped by pnpm on linux');
check('no os, skipped dev-only package -> not seeded',
	getSection6SeedReason({ name: 'fsevents', version: '2.3.3', dev: true }, skipped, 'linux') === undefined);
check('no os, another version skipped -> not seeded',
	getSection6SeedReason({ name: 'windows-foreground-love', version: '0.6.0', dev: false }, skipped, 'linux') === undefined);
check('no os, not skipped -> not seeded',
	getSection6SeedReason({ name: 'debug', version: '4.4.3', dev: false }, skipped, 'linux') === undefined);
check('os allows the host, not skipped -> not seeded',
	getSection6SeedReason({ name: 'node-pty', version: '1.0.0', os: ['linux', 'darwin', 'win32'], dev: false }, new Set(), 'linux') === undefined);

// -- 4. readPnpmSkippedPackages -------------------------------------------------
console.log('readPnpmSkippedPackages:');
const installRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'section6-'));
try {
	check('not installed -> empty', readPnpmSkippedPackages(installRoot).size === 0);
	fs.mkdirSync(path.join(installRoot, 'node_modules'));
	// pnpm writes .modules.yaml as JSON-compatible YAML
	fs.writeFileSync(path.join(installRoot, 'node_modules', '.modules.yaml'), JSON.stringify({ nodeLinker: 'hoisted', skipped: ['windows-foreground-love@0.6.1', '@esbuild/win32-x64@0.27.2'] }));
	const read = readPnpmSkippedPackages(installRoot);
	check('reads the skipped ids', read.size === 2 && read.has('windows-foreground-love@0.6.1') && read.has('@esbuild/win32-x64@0.27.2'));
	fs.writeFileSync(path.join(installRoot, 'node_modules', '.modules.yaml'), 'nodeLinker: hoisted\n');
	check('no skipped field -> empty', readPnpmSkippedPackages(installRoot).size === 0);
} finally {
	fs.rmSync(installRoot, { recursive: true, force: true });
}

// -- summary ------------------------------------------------------------------
console.log('');
console.log(`Section 6 unit checks: ${passed} passed, ${failed} failed`);
if (failed > 0) {
	process.exit(1);
}
