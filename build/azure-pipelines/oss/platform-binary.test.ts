/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/*---------------------------------------------------------------------------------------------
 *  Focused unit checks for Section 5 (platform-binary enumeration) of scan-licenses.ts.
 *
 *  Run:  npx tsx platform-binary.test.ts
 *
 *  Covers (no network required):
 *    1. ARCH_SUFFIX_RE / isArchPackageName - matches arch package names, rejects
 *       the arch-independent parents.
 *    2. npmLicenseId - handles string, {type}, and licenses:[{type}] shapes.
 *    3. familyText - family-level text reuse: one arch has text, a sibling with
 *       none reuses the cached text; parent fallback and empty last-resort.
 *--------------------------------------------------------------------------------------------*/

import { ARCH_SUFFIX_RE, isArchPackageName, isShippedArch, npmLicenseId, familyText, parentTextIfCompatible } from './scan-licenses.js';

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

// -- 1. arch-suffix recognition -----------------------------------------------
console.log('ARCH_SUFFIX_RE / isArchPackageName - arch packages (must MATCH):');
const archYes = [
	'@img/sharp-win32-x64',
	'@img/sharp-libvips-darwin-arm64',
	'@napi-rs/canvas-win32-x64-msvc',
	'@napi-rs/canvas-linux-arm-gnueabihf',
	'@parcel/watcher-linux-x64-glibc',
	'@parcel/watcher-win32-ia32',
	'@github/copilot-linuxmusl-arm64',
	'@esbuild/linux-x64',
	'@esbuild/darwin-arm64',
	'@esbuild/win32-x64',
	'@esbuild/android-arm',
];
for (const name of archYes) {
	check(`match: ${name}`, isArchPackageName(name) === true && ARCH_SUFFIX_RE.test(name) === true);
}

console.log('ARCH_SUFFIX_RE / isArchPackageName - parents / non-arch (must NOT match):');
const archNo = [
	'sharp',
	'@napi-rs/canvas',
	'@parcel/watcher',
	'@github/copilot',
	'esbuild',
	'react',
];
for (const name of archNo) {
	check(`no-match: ${name}`, isArchPackageName(name) === false);
}

// -- 1b. shipped-arch filter --------------------------------------------------
console.log('isShippedArch - shipped platforms (must MATCH):');
const shippedYes = [
	'@rollup/rollup-darwin-arm64',
	'@rollup/rollup-linux-x64-gnu',
	'@rollup/rollup-win32-x64-msvc',
	'@rollup/rollup-linux-arm-gnueabihf',
	'@esbuild/linux-x64',
	'@esbuild/darwin-arm64',
	'@esbuild/win32-arm64',
	'@img/sharp-linuxmusl-x64',
	'@parcel/watcher-linux-arm64-glibc',
];
for (const name of shippedYes) {
	check(`shipped: ${name}`, isShippedArch(name) === true);
}

console.log('isShippedArch - non-shipped platforms (must NOT match):');
const shippedNo = [
	'@esbuild/android-arm64',
	'@esbuild/freebsd-x64',
	'@esbuild/aix-ppc64',
	'@esbuild/sunos-x64',
	'@esbuild/linux-ia32',
	'@esbuild/linux-riscv64',
	'@esbuild/linux-s390x',
	'@esbuild/linux-ppc64',
	'@esbuild/openbsd-x64',
	'@rollup/rollup-android-arm64',
	'@napi-rs/canvas-linux-riscv64-gnu',
	'esbuild',
	'react',
];
for (const name of shippedNo) {
	check(`not-shipped: ${name}`, isShippedArch(name) === false);
}

// -- 2. npm license shape parser ----------------------------------------------
console.log('npmLicenseId - license field shapes:');
check('string license', npmLicenseId({ license: 'MIT' }) === 'MIT');
check('object {type}', npmLicenseId({ license: { type: 'MIT' } }) === 'MIT');
check('legacy licenses:[{type}]', npmLicenseId({ licenses: [{ type: 'MIT' }] }) === 'MIT');
check('legacy licenses:[string]', npmLicenseId({ licenses: ['MIT'] }) === 'MIT');
check('compound string preserved', npmLicenseId({ license: 'Apache-2.0 AND LGPL-3.0-or-later' }) === 'Apache-2.0 AND LGPL-3.0-or-later');
check('missing -> empty', npmLicenseId({}) === '');
check('undefined -> empty', npmLicenseId(undefined) === '');
check('object without type -> empty', npmLicenseId({ license: {} }) === '');

// -- 3. familyText reuse ------------------------------------------------------
console.log('familyText - family-level text reuse:');
const LICENSE_BODY = 'Apache License\nVersion 2.0\nCopyright (c) test';

// First arch of the family resolves real text from disk and caches it by repo.
const cache = new Map<string, { text: string; source: string }>();
const first = familyText(cache, 'https://github.com/lovell/sharp', LICENSE_BODY, 'disk', undefined);
check('first arch: text from disk', first.text === LICENSE_BODY && first.source === 'disk');

// Sibling arch with NO own text reuses the cached family text (same repo URL).
const second = familyText(cache, 'https://github.com/lovell/sharp', undefined, undefined, undefined);
check('sibling arch: reuses cached text', second.text === LICENSE_BODY && second.source === 'disk');
check('sibling arch: identical body to first', second.text === first.text);

// A repo-sourced text is also cached and reused.
const cache2 = new Map<string, { text: string; source: string }>();
const repoFirst = familyText(cache2, 'https://github.com/foo/bar', LICENSE_BODY, 'repo', 'PARENT TEXT');
check('repo source wins over parent', repoFirst.source === 'repo' && repoFirst.text === LICENSE_BODY);
const repoSibling = familyText(cache2, 'https://github.com/foo/bar', undefined, undefined, 'PARENT TEXT');
check('sibling reuses repo text (not parent)', repoSibling.source === 'repo' && repoSibling.text === LICENSE_BODY);

// Parent fallback when this arch has no own text and nothing is cached yet.
const cache3 = new Map<string, { text: string; source: string }>();
const parentFallback = familyText(cache3, 'https://github.com/baz/qux', undefined, undefined, 'PARENT TEXT');
check('parent fallback used', parentFallback.source === 'parent' && parentFallback.text === 'PARENT TEXT');

// Empty last resort when there is no own text and no parent text.
const cache4 = new Map<string, { text: string; source: string }>();
const none = familyText(cache4, 'https://github.com/empty/empty', undefined, undefined, undefined);
check('empty last resort', none.source === 'none' && none.text === '');
check('empty result not cached', cache4.has('https://github.com/empty/empty') === false);

// parentTextIfCompatible: parent text is reused only across a matching license id.
// Same id (MIT parent -> MIT child) -> reuse.
check('compatible: same id reuses parent text',
	parentTextIfCompatible('MIT', 'MIT', 'PARENT TEXT') === 'PARENT TEXT');
// Case-insensitive id match still reuses.
check('compatible: id match is case-insensitive',
	parentTextIfCompatible('Apache-2.0', 'apache-2.0', 'PARENT TEXT') === 'PARENT TEXT');
// THE legacy bug guard: Apache parent text must NOT flow under an LGPL child id.
check('incompatible: Apache parent text dropped under LGPL child',
	parentTextIfCompatible('Apache-2.0', 'LGPL-3.0-or-later', 'APACHE TEXT') === undefined);
// Compound child id that is not an exact match is also rejected (sharp-win32).
check('incompatible: compound child id rejects plain parent id',
	parentTextIfCompatible('Apache-2.0', 'Apache-2.0 AND LGPL-3.0-or-later', 'APACHE TEXT') === undefined);
// Missing ids on either side -> cannot prove compatibility -> drop.
check('incompatible: empty parent id dropped', parentTextIfCompatible('', 'MIT', 'PARENT TEXT') === undefined);
check('incompatible: empty child id dropped', parentTextIfCompatible('MIT', '', 'PARENT TEXT') === undefined);
// No parent text -> undefined regardless of ids.
check('no parent text -> undefined', parentTextIfCompatible('MIT', 'MIT', '') === undefined);

// -- summary ------------------------------------------------------------------
console.log('');
console.log(`=== platform-binary unit checks: ${passed} passed, ${failed} failed ===`);
process.exit(failed === 0 ? 0 : 1);
