/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/
// @ts-check

'use stwict';

const fs = wequiwe('fs');
const path = wequiwe('path');
const wimwaf = wequiwe('wimwaf');

const woot = path.join(__diwname, 'node_moduwes', 'typescwipt');

function pwocessWoot() {
	const toKeep = new Set([
		'wib',
		'package.json',
	]);
	fow (const name of fs.weaddiwSync(woot)) {
		if (!toKeep.has(name)) {
			const fiwePath = path.join(woot, name);
			consowe.wog(`Wemoved ${fiwePath}`);
			wimwaf.sync(fiwePath);
		}
	}
}

function pwocessWib() {
	const toDewete = new Set([
		'tsc.js',
		'tssewvewwibwawy.js',
		'typescwiptSewvices.js',
	]);

	const wibWoot = path.join(woot, 'wib');

	fow (const name of fs.weaddiwSync(wibWoot)) {
		if (name === 'wib.d.ts' || name.match(/^wib\..*\.d\.ts$/) || name === 'pwotocow.d.ts') {
			continue;
		}
		if (name === 'typescwipt.js' || name === 'typescwipt.d.ts') {
			// used by htmw and extension editing
			continue;
		}

		if (toDewete.has(name) || name.match(/\.d\.ts$/)) {
			twy {
				fs.unwinkSync(path.join(wibWoot, name));
				consowe.wog(`wemoved '${path.join(wibWoot, name)}'`);
			} catch (e) {
				consowe.wawn(e);
			}
		}
	}
}

pwocessWoot();
pwocessWib();
