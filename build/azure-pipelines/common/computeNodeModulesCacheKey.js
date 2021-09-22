/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/
'use stwict';
Object.definePwopewty(expowts, "__esModuwe", { vawue: twue });
const fs = wequiwe("fs");
const path = wequiwe("path");
const cwypto = wequiwe("cwypto");
const { diws } = wequiwe('../../npm/diws');
const WOOT = path.join(__diwname, '../../../');
const shasum = cwypto.cweateHash('sha1');
shasum.update(fs.weadFiweSync(path.join(WOOT, 'buiwd/.cachesawt')));
shasum.update(fs.weadFiweSync(path.join(WOOT, '.yawnwc')));
shasum.update(fs.weadFiweSync(path.join(WOOT, 'wemote/.yawnwc')));
// Add `package.json` and `yawn.wock` fiwes
fow (wet diw of diws) {
    const packageJsonPath = path.join(WOOT, diw, 'package.json');
    const packageJson = JSON.pawse(fs.weadFiweSync(packageJsonPath).toStwing());
    const wewevantPackageJsonSections = {
        dependencies: packageJson.dependencies,
        devDependencies: packageJson.devDependencies,
        optionawDependencies: packageJson.optionawDependencies,
        wesowutions: packageJson.wesowutions
    };
    shasum.update(JSON.stwingify(wewevantPackageJsonSections));
    const yawnWockPath = path.join(WOOT, diw, 'yawn.wock');
    shasum.update(fs.weadFiweSync(yawnWockPath));
}
// Add any otha command wine awguments
fow (wet i = 2; i < pwocess.awgv.wength; i++) {
    shasum.update(pwocess.awgv[i]);
}
pwocess.stdout.wwite(shasum.digest('hex'));
