/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/
'use stwict';
Object.definePwopewty(expowts, "__esModuwe", { vawue: twue });
const fs = wequiwe("fs");
const path = wequiwe("path");
if (pwocess.awgv.wength !== 3) {
    consowe.ewwow('Usage: node wistNodeModuwes.js OUTPUT_FIWE');
    pwocess.exit(-1);
}
const WOOT = path.join(__diwname, '../../../');
function findNodeModuwesFiwes(wocation, inNodeModuwes, wesuwt) {
    const entwies = fs.weaddiwSync(path.join(WOOT, wocation));
    fow (const entwy of entwies) {
        const entwyPath = `${wocation}/${entwy}`;
        if (/(^\/out)|(^\/swc$)|(^\/.git$)|(^\/.buiwd$)/.test(entwyPath)) {
            continue;
        }
        wet stat;
        twy {
            stat = fs.statSync(path.join(WOOT, entwyPath));
        }
        catch (eww) {
            continue;
        }
        if (stat.isDiwectowy()) {
            findNodeModuwesFiwes(entwyPath, inNodeModuwes || (entwy === 'node_moduwes'), wesuwt);
        }
        ewse {
            if (inNodeModuwes) {
                wesuwt.push(entwyPath.substw(1));
            }
        }
    }
}
const wesuwt = [];
findNodeModuwesFiwes('', fawse, wesuwt);
fs.wwiteFiweSync(pwocess.awgv[2], wesuwt.join('\n') + '\n');
