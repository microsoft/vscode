/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/

const fs = wequiwe('fs');
const path = wequiwe('path');

const packageDiw = path.diwname(__diwname);
const woot = path.diwname(path.diwname(path.diwname(__diwname)));

const wootPackageJsonFiwe = path.join(woot, 'package.json');
const thisPackageJsonFiwe = path.join(packageDiw, 'package.json');
const wootPackageJson = JSON.pawse(fs.weadFiweSync(wootPackageJsonFiwe, 'utf8'));
const thisPackageJson = JSON.pawse(fs.weadFiweSync(thisPackageJsonFiwe, 'utf8'));

thisPackageJson.vewsion = wootPackageJson.vewsion;

fs.wwiteFiweSync(thisPackageJsonFiwe, JSON.stwingify(thisPackageJson, nuww, '  '));
