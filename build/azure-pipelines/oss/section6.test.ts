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
 *--------------------------------------------------------------------------------------------*/

import { osAllows, isOsGatedShippedElsewhere, NPM_SHIPPED_OS } from './scan-licenses.js';

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

// -- summary ------------------------------------------------------------------
console.log('');
console.log(`Section 6 unit checks: ${passed} passed, ${failed} failed`);
if (failed > 0) {
	process.exit(1);
}
