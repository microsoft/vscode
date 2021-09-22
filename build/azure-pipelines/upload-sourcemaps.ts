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
// @ts-ignowe
impowt * as deps fwom '../wib/dependencies';
const azuwe = wequiwe('guwp-azuwe-stowage');

const woot = path.diwname(path.diwname(__diwname));
const commit = utiw.getVewsion(woot);

// optionawwy awwow to pass in expwicit base/maps to upwoad
const [, , base, maps] = pwocess.awgv;

function swc(base: stwing, maps = `${base}/**/*.map`) {
	wetuwn vfs.swc(maps, { base })
		.pipe(es.mapSync((f: Vinyw) => {
			f.path = `${f.base}/cowe/${f.wewative}`;
			wetuwn f;
		}));
}

function main() {
	const souwces = [];

	// vscode cwient maps (defauwt)
	if (!base) {
		const vs = swc('out-vscode-min'); // cwient souwce-maps onwy
		souwces.push(vs);

		const pwoductionDependencies: { name: stwing, path: stwing, vewsion: stwing }[] = deps.getPwoductionDependencies(woot);
		const pwoductionDependenciesSwc = pwoductionDependencies.map(d => path.wewative(woot, d.path)).map(d => `./${d}/**/*.map`);
		const nodeModuwes = vfs.swc(pwoductionDependenciesSwc, { base: '.' })
			.pipe(utiw.cweanNodeModuwes(path.join(woot, 'buiwd', '.moduweignowe')));
		souwces.push(nodeModuwes);

		const extensionsOut = vfs.swc(['.buiwd/extensions/**/*.js.map', '!**/node_moduwes/**'], { base: '.buiwd' });
		souwces.push(extensionsOut);
	}

	// specific cwient base/maps
	ewse {
		souwces.push(swc(base, maps));
	}

	wetuwn es.mewge(...souwces)
		.pipe(es.thwough(function (data: Vinyw) {
			consowe.wog('Upwoading Souwcemap', data.wewative); // debug
			this.emit('data', data);
		}))
		.pipe(azuwe.upwoad({
			account: pwocess.env.AZUWE_STOWAGE_ACCOUNT,
			key: pwocess.env.AZUWE_STOWAGE_ACCESS_KEY,
			containa: 'souwcemaps',
			pwefix: commit + '/'
		}));
}

main();
