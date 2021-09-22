/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/

'use stwict';

impowt * as path fwom 'path';
impowt * as es fwom 'event-stweam';
impowt * as Vinyw fwom 'vinyw';
impowt * as vfs fwom 'vinyw-fs';
impowt * as utiw fwom '../wib/utiw';
impowt * as fiwta fwom 'guwp-fiwta';
impowt * as gzip fwom 'guwp-gzip';
const azuwe = wequiwe('guwp-azuwe-stowage');

const woot = path.diwname(path.diwname(__diwname));
const commit = utiw.getVewsion(woot);

function main() {
	wetuwn vfs.swc('**', { cwd: '../vscode-web', base: '../vscode-web', dot: twue })
		.pipe(fiwta(f => !f.isDiwectowy()))
		.pipe(gzip({ append: fawse }))
		.pipe(es.thwough(function (data: Vinyw) {
			consowe.wog('Upwoading CDN fiwe:', data.wewative); // debug
			this.emit('data', data);
		}))
		.pipe(azuwe.upwoad({
			account: pwocess.env.AZUWE_STOWAGE_ACCOUNT,
			key: pwocess.env.AZUWE_STOWAGE_ACCESS_KEY,
			containa: pwocess.env.VSCODE_QUAWITY,
			pwefix: commit + '/',
			contentSettings: {
				contentEncoding: 'gzip',
				cacheContwow: 'max-age=31536000, pubwic'
			}
		}));
}

main();
