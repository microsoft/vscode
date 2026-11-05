/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/*---------------------------------------------------------------------------------------------
 *  Focused unit checks for pickLicenseFileName() in scan-licenses.ts, which picks the license
 *  file of a package on disk (Sections 1 and 2).
 *
 *  Run:  npx tsx license-file.test.ts
 *
 *  Covers (no network required):
 *    1. Plain LICENSE/LICENCE names (the existing behavior).
 *    2. LICENSE-<name> files, as punycode (LICENSE-MIT.txt) and ignore (LICENSE-MIT) ship.
 *    3. Several LICENSE-<name> files (dual licenses): MIT first, then a stable order.
 *    4. Names that aren't license files.
 *--------------------------------------------------------------------------------------------*/

import { pickLicenseFileName } from './scan-licenses.js';

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

// -- 1. plain names -------------------------------------------------------------
console.log('plain names:');
check('LICENSE', pickLicenseFileName(['index.js', 'LICENSE', 'package.json']) === 'LICENSE');
check('license.md', pickLicenseFileName(['license.md', 'package.json']) === 'license.md');
check('LICENSE.txt', pickLicenseFileName(['LICENSE.txt']) === 'LICENSE.txt');
check('LICENCE', pickLicenseFileName(['LICENCE']) === 'LICENCE');
check('plain LICENSE wins over LICENSE-MIT', pickLicenseFileName(['LICENSE-MIT', 'LICENSE']) === 'LICENSE');

// -- 2. LICENSE-<name> ----------------------------------------------------------
console.log('LICENSE-<name>:');
check('LICENSE-MIT.txt (punycode)', pickLicenseFileName(['LICENSE-MIT.txt', 'package.json', 'punycode.js']) === 'LICENSE-MIT.txt');
check('LICENSE-MIT (ignore)', pickLicenseFileName(['LICENSE-MIT', 'index.js', 'package.json']) === 'LICENSE-MIT');
check('license-mit (lower case)', pickLicenseFileName(['license-mit']) === 'license-mit');
check('LICENSE-APACHE-2.0', pickLicenseFileName(['LICENSE-APACHE-2.0']) === 'LICENSE-APACHE-2.0');
check('LICENSE-MPL-2.0.md', pickLicenseFileName(['LICENSE-MPL-2.0.md']) === 'LICENSE-MPL-2.0.md');
check('LICENCE-MIT', pickLicenseFileName(['LICENCE-MIT']) === 'LICENCE-MIT');

// -- 3. several LICENSE-<name> files ---------------------------------------------
console.log('several LICENSE-<name> files:');
check('MIT preferred (type-fest: license-cc0, license-mit)', pickLicenseFileName(['license-cc0', 'license-mit']) === 'license-mit');
check('MIT preferred (LICENSE-MIT.txt after LICENSE-APACHE)', pickLicenseFileName(['LICENSE-APACHE', 'LICENSE-MIT.txt']) === 'LICENSE-MIT.txt');
check('no MIT: first in case-insensitive order, independent of listing order',
	pickLicenseFileName(['license-zlib', 'LICENSE-APACHE']) === 'LICENSE-APACHE' &&
	pickLicenseFileName(['LICENSE-APACHE', 'license-zlib']) === 'LICENSE-APACHE');

// -- 4. not license files ----------------------------------------------------------
console.log('not license files:');
check('no license file', pickLicenseFileName(['index.js', 'package.json', 'README.md']) === undefined);
check('license-checker.json', pickLicenseFileName(['license-checker.json']) === undefined);
check('license-header.js', pickLicenseFileName(['license-header.js']) === undefined);
check('licenses (folder name)', pickLicenseFileName(['licenses']) === undefined);
check('LICENSE- (no name)', pickLicenseFileName(['LICENSE-']) === undefined);
check('licensed.js', pickLicenseFileName(['licensed.js']) === undefined);

// -- summary ------------------------------------------------------------------
console.log('');
console.log(`license-file unit checks: ${passed} passed, ${failed} failed`);
if (failed > 0) {
	process.exit(1);
}
