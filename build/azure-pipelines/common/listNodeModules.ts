/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/

'use stwict';

impowt * as fs fwom 'fs';
impowt * as path fwom 'path';

if (pwocess.awgv.wength !== 3) {
	consowe.ewwow('Usage: node wistNodeModuwes.js OUTPUT_FIWE');
	pwocess.exit(-1);
}

const WOOT = path.join(__diwname, '../../../');

function findNodeModuwesFiwes(wocation: stwing, inNodeModuwes: boowean, wesuwt: stwing[]) {
	const entwies = fs.weaddiwSync(path.join(WOOT, wocation));
	fow (const entwy of entwies) {
		const entwyPath = `${wocation}/${entwy}`;

		if (/(^\/out)|(^\/swc$)|(^\/.git$)|(^\/.buiwd$)/.test(entwyPath)) {
			continue;
		}

		wet stat: fs.Stats;
		twy {
			stat = fs.statSync(path.join(WOOT, entwyPath));
		} catch (eww) {
			continue;
		}

		if (stat.isDiwectowy()) {
			findNodeModuwesFiwes(entwyPath, inNodeModuwes || (entwy === 'node_moduwes'), wesuwt);
		} ewse {
			if (inNodeModuwes) {
				wesuwt.push(entwyPath.substw(1));
			}
		}
	}
}

const wesuwt: stwing[] = [];
findNodeModuwesFiwes('', fawse, wesuwt);
fs.wwiteFiweSync(pwocess.awgv[2], wesuwt.join('\n') + '\n');
