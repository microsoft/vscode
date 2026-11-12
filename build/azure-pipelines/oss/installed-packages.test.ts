/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/*---------------------------------------------------------------------------------------------
 *  Focused unit checks for collectInstalledPackages() in scan-licenses.ts, which lists the
 *  packages of a node_modules folder for Sections 1, 2 and 5.
 *
 *  Run:  npx tsx installed-packages.test.ts
 *
 *  Covers (no network required):
 *    1. pnpm's hoisted layout: the top-level packages (`.pnpm` holds only lock.yaml).
 *    2. pnpm's isolated layout: the top-level links, then the store's hoisting folder, then the
 *       package folders of the store, without the links to their dependencies.
 *    3. A member of a pnpm workspace with the isolated layout: the top-level links, then the
 *       packages that they reach in the store of the workspace root, nearest first.
 *--------------------------------------------------------------------------------------------*/

import fs from 'fs';
import os from 'os';
import path from 'path';
import { collectInstalledPackages } from './scan-licenses.js';

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

function writePackage(dir: string, name: string, version: string): void {
	fs.mkdirSync(dir, { recursive: true });
	fs.writeFileSync(path.join(dir, 'package.json'), JSON.stringify({ name, version }));
}

function link(target: string, linkPath: string): void {
	fs.mkdirSync(path.dirname(linkPath), { recursive: true });
	fs.symlinkSync(target, linkPath, 'junction');
}

/** The packages of `nmDir`, as `<name> <folder relative to nmDir>`. */
function listed(nmDir: string): string[] {
	return collectInstalledPackages(nmDir).map(({ name, dir }) => `${name} ${path.relative(nmDir, dir).split(path.sep).join('/')}`);
}

const tmp = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'installed-packages-')));
try {
	// -- 1. hoisted layout --------------------------------------------------------
	console.log('hoisted layout:');
	const hoisted = path.join(tmp, 'hoisted', 'node_modules');
	writePackage(path.join(hoisted, 'a'), 'a', '1.0.0');
	writePackage(path.join(hoisted, '@s', 'c'), '@s/c', '3.0.0');
	writePackage(path.join(hoisted, 'a', 'node_modules', 'b'), 'b', '1.0.0');
	fs.mkdirSync(path.join(hoisted, '.pnpm'));
	fs.writeFileSync(path.join(hoisted, '.pnpm', 'lock.yaml'), '');
	check('lists the top-level packages only', JSON.stringify(listed(hoisted).sort()) === JSON.stringify(['@s/c @s/c', 'a a']));

	// -- 2. isolated layout -------------------------------------------------------
	console.log('isolated layout:');
	const isolated = path.join(tmp, 'isolated', 'node_modules');
	const store = path.join(isolated, '.pnpm');
	writePackage(path.join(store, 'a@1.0.0', 'node_modules', 'a'), 'a', '1.0.0');
	writePackage(path.join(store, 'b@1.0.0', 'node_modules', 'b'), 'b', '1.0.0');
	writePackage(path.join(store, 'b@2.0.0', 'node_modules', 'b'), 'b', '2.0.0');
	writePackage(path.join(store, '@s+c@3.0.0', 'node_modules', '@s', 'c'), '@s/c', '3.0.0');
	fs.writeFileSync(path.join(store, 'lock.yaml'), '');
	// A direct dependency of the install root, a dependency of `a`, and the store's hoisting folder.
	link(path.join(store, 'a@1.0.0', 'node_modules', 'a'), path.join(isolated, 'a'));
	link(path.join(store, 'b@2.0.0', 'node_modules', 'b'), path.join(store, 'a@1.0.0', 'node_modules', 'b'));
	link(path.join(store, 'b@2.0.0', 'node_modules', 'b'), path.join(store, 'node_modules', 'b'));
	check('lists the top level, the hoisting folder, then the store packages', JSON.stringify(listed(isolated)) === JSON.stringify([
		'a a',
		'b .pnpm/node_modules/b',
		'@s/c .pnpm/@s+c@3.0.0/node_modules/@s/c',
		'a .pnpm/a@1.0.0/node_modules/a',
		'b .pnpm/b@1.0.0/node_modules/b',
		'b .pnpm/b@2.0.0/node_modules/b',
	]));

	// -- 3. member of an isolated workspace ------------------------------------------
	console.log('member of an isolated workspace:');
	// The member depends on `a` and on the workspace project `p`. `a` depends on `b@2.0.0`, which
	// depends on `@s/c`. `b@1.0.0` is another project's.
	const member = path.join(tmp, 'isolated', 'member', 'node_modules');
	writePackage(path.join(tmp, 'isolated', 'p'), 'p', '1.0.0');
	link(path.join(store, 'a@1.0.0', 'node_modules', 'a'), path.join(member, 'a'));
	link(path.join(tmp, 'isolated', 'p'), path.join(member, 'p'));
	link(path.join(store, '@s+c@3.0.0', 'node_modules', '@s', 'c'), path.join(store, 'b@2.0.0', 'node_modules', '@s', 'c'));
	check('lists the top level, then the store packages that it reaches', JSON.stringify(listed(member)) === JSON.stringify([
		'a a',
		'p p',
		'b ../../node_modules/.pnpm/b@2.0.0/node_modules/b',
		'@s/c ../../node_modules/.pnpm/@s+c@3.0.0/node_modules/@s/c',
	]));
} finally {
	fs.rmSync(tmp, { recursive: true, force: true });
}

// -- summary ------------------------------------------------------------------
console.log('');
console.log(`installed-packages unit checks: ${passed} passed, ${failed} failed`);
if (failed > 0) {
	process.exit(1);
}
