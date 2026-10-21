/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/*---------------------------------------------------------------------------------------------
 *  Focused unit checks for Section 7 (pre-built built-in extension dependency
 *  enumeration) of scan-licenses.ts.
 *
 *  Run:  npx tsx section7.test.ts
 *
 *  Covers (no network required):
 *    1. readBuiltInExtensionNames - extracting extension names from product.json
 *       (builtInExtensions + webBuiltInExtensions, missing keys, non-string names).
 *    2. enumerateLockfileProdDeps - walking a lockfileVersion 2/3 `packages` map
 *       (skips root/dev/link/arch entries, dedups, last-node_modules name, and
 *       returns [] for lockfileVersion 1).
 *    3. readBuiltInExtensionManifest - extracting name+version+repo (for self-fetch).
 *    4. builtInExtensionLockfileUrl - building the public raw.githubusercontent.com
 *       package-lock.json URL (no token), rejecting non-GitHub/missing inputs.
 *--------------------------------------------------------------------------------------------*/

import { readBuiltInExtensionNames, enumerateLockfileProdDeps, readBuiltInExtensionManifest, builtInExtensionLockfileUrl } from './scan-licenses.js';

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

// -- 1. readBuiltInExtensionNames ---------------------------------------------
console.log('readBuiltInExtensionNames - product.json shapes:');

const realShape = {
	builtInExtensions: [
		{ name: 'ms-vscode.js-debug', version: '1.117.0' },
		{ name: 'ms-vscode.js-debug-companion', version: '1.1.3' },
		{ name: 'ms-vscode.vscode-js-profile-table', version: '1.0.10' },
	],
};
const realNames = readBuiltInExtensionNames(realShape);
check('reads the 3 product.json built-in extensions', realNames.length === 3);
check('includes js-debug', realNames.includes('ms-vscode.js-debug'));
check('includes js-debug-companion', realNames.includes('ms-vscode.js-debug-companion'));
check('includes js-profile-table', realNames.includes('ms-vscode.vscode-js-profile-table'));

check('merges webBuiltInExtensions', readBuiltInExtensionNames({
	builtInExtensions: [{ name: 'a' }],
	webBuiltInExtensions: [{ name: 'b' }, { name: 'c' }],
}).length === 3);

check('missing builtInExtensions key -> []', readBuiltInExtensionNames({}).length === 0);
check('undefined product json -> []', readBuiltInExtensionNames(undefined).length === 0);
check('null product json -> []', readBuiltInExtensionNames(null).length === 0);
check('non-array builtInExtensions -> []', readBuiltInExtensionNames({ builtInExtensions: 'nope' }).length === 0);
check('skips entries without a string name', readBuiltInExtensionNames({
	builtInExtensions: [{ name: 'good' }, { version: '1.0.0' }, { name: 42 }, { name: '' }, null],
}).join(',') === 'good');

// -- 2. enumerateLockfileProdDeps ---------------------------------------------
console.log('enumerateLockfileProdDeps - lockfileVersion 2/3 packages map:');

const lockV3 = {
	lockfileVersion: 3,
	packages: {
		'': { name: 'js-debug', version: '1.117.0' },               // root - skip
		'node_modules/acorn-loose': { version: '8.4.0' },
		'node_modules/astring': { version: '1.8.6' },
		'node_modules/preact': { version: '10.20.0' },
		'node_modules/typescript': { version: '5.4.0', dev: true },  // dev - skip
		'node_modules/@vscode/l10n': { version: '0.0.18' },
		'node_modules/@c4312/chromehash': { version: '0.3.0' },
		// nested: name is taken after the LAST node_modules/
		'node_modules/execa/node_modules/signal-exit': { version: '3.0.7' },
		// workspace link - skip
		'node_modules/local-pkg': { version: '1.0.0', link: true },
	},
};
const deps = enumerateLockfileProdDeps(lockV3);
const depNames = deps.map(d => d.name).sort();

check('skips the root entry', !depNames.includes('js-debug'));
check('skips dev deps', !depNames.includes('typescript'));
check('skips link entries', !depNames.includes('local-pkg'));
check('keeps acorn-loose', depNames.includes('acorn-loose'));
check('keeps astring', depNames.includes('astring'));
check('keeps preact', depNames.includes('preact'));
check('keeps scoped @vscode/l10n', depNames.includes('@vscode/l10n'));
check('keeps scoped @c4312/chromehash', depNames.includes('@c4312/chromehash'));
check('takes name after LAST node_modules/ (nested -> signal-exit)', depNames.includes('signal-exit'));
check('does not mistake nested key for execa', !depNames.includes('execa'));
check('captures versions', deps.find(d => d.name === 'preact')?.version === '10.20.0');

console.log('enumerateLockfileProdDeps - dedup + edge cases:');
const lockDupe = {
	lockfileVersion: 2,
	packages: {
		'node_modules/color': { version: '4.2.3' },
		'node_modules/foo/node_modules/color': { version: '3.2.1' }, // same name, different tree
	},
};
check('dedups same dependency name', enumerateLockfileProdDeps(lockDupe).filter(d => d.name === 'color').length === 1);

check('lockfileVersion 1 (no packages map) -> []', enumerateLockfileProdDeps({
	lockfileVersion: 1,
	dependencies: { 'acorn-loose': { version: '8.4.0' } },
}).length === 0);
check('empty packages map -> []', enumerateLockfileProdDeps({ packages: {} }).length === 0);
check('undefined lock -> []', enumerateLockfileProdDeps(undefined).length === 0);
check('null lock -> []', enumerateLockfileProdDeps(null).length === 0);

console.log('enumerateLockfileProdDeps - arch packages owned by Section 5:');
const lockArch = {
	lockfileVersion: 3,
	packages: {
		'node_modules/esbuild': { version: '0.21.0' },              // parent - keep
		'node_modules/@esbuild/linux-x64': { version: '0.21.0' },   // arch - skip
		'node_modules/@esbuild/darwin-arm64': { version: '0.21.0' },// arch - skip
	},
};
const archDeps = enumerateLockfileProdDeps(lockArch).map(d => d.name);
check('keeps arch-independent parent esbuild', archDeps.includes('esbuild'));
check('skips @esbuild/linux-x64 (Section 5 owns it)', !archDeps.includes('@esbuild/linux-x64'));
check('skips @esbuild/darwin-arm64 (Section 5 owns it)', !archDeps.includes('@esbuild/darwin-arm64'));

// -- 3. readBuiltInExtensionManifest ------------------------------------------
console.log('readBuiltInExtensionManifest - name + version + repo:');

const manifestShape = {
	builtInExtensions: [
		{ name: 'ms-vscode.js-debug', version: '1.117.0', repo: 'https://github.com/microsoft/vscode-js-debug' },
		{ name: 'ms-vscode.js-debug-companion', version: '1.1.3', repo: 'https://github.com/microsoft/vscode-js-debug-companion' },
	],
	webBuiltInExtensions: [
		{ name: 'web-ext', version: '2.0.0', repo: 'https://github.com/microsoft/web-ext' },
	],
};
const manifest = readBuiltInExtensionManifest(manifestShape);
check('manifest merges builtIn + web (3 entries)', manifest.length === 3);
check('manifest captures version', manifest.find(e => e.name === 'ms-vscode.js-debug')?.version === '1.117.0');
check('manifest captures repo', manifest.find(e => e.name === 'ms-vscode.js-debug')?.repo === 'https://github.com/microsoft/vscode-js-debug');
check('manifest undefined product json -> []', readBuiltInExtensionManifest(undefined).length === 0);
check('manifest null product json -> []', readBuiltInExtensionManifest(null).length === 0);
check('manifest missing key -> []', readBuiltInExtensionManifest({}).length === 0);
check('manifest skips nameless entries', readBuiltInExtensionManifest({
	builtInExtensions: [{ name: 'ok', version: '1.0.0', repo: 'r' }, { version: '2.0.0' }, { name: 42 }, null],
}).length === 1);
check('manifest defaults missing version/repo to empty string', (() => {
	const m = readBuiltInExtensionManifest({ builtInExtensions: [{ name: 'x' }] });
	return m.length === 1 && m[0].version === '' && m[0].repo === '';
})());

// -- 4. builtInExtensionLockfileUrl -------------------------------------------
console.log('builtInExtensionLockfileUrl - public raw URL (no token):');

check('builds the js-debug raw URL at the version tag',
	builtInExtensionLockfileUrl('https://github.com/microsoft/vscode-js-debug', '1.117.0') ===
	'https://raw.githubusercontent.com/microsoft/vscode-js-debug/v1.117.0/package-lock.json');
check('handles a trailing .git suffix',
	builtInExtensionLockfileUrl('https://github.com/microsoft/vscode-js-debug.git', '1.0.0') ===
	'https://raw.githubusercontent.com/microsoft/vscode-js-debug/v1.0.0/package-lock.json');
check('never embeds a token in the URL', (() => {
	const u = builtInExtensionLockfileUrl('https://github.com/microsoft/vscode-js-debug', '1.117.0') || '';
	return !u.includes('@');
})());
check('missing version -> undefined', builtInExtensionLockfileUrl('https://github.com/microsoft/vscode-js-debug', '') === undefined);
check('missing repo -> undefined', builtInExtensionLockfileUrl('', '1.0.0') === undefined);
check('non-GitHub host -> undefined', builtInExtensionLockfileUrl('https://gitlab.com/foo/bar', '1.0.0') === undefined);

// -- summary ------------------------------------------------------------------
console.log('');
console.log(`Section 7 unit checks: ${passed} passed, ${failed} failed`);
if (failed > 0) {
	process.exit(1);
}
