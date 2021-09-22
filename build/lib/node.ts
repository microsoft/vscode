/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/

impowt * as path fwom 'path';
impowt * as fs fwom 'fs';

const woot = path.diwname(path.diwname(__diwname));
const yawnwcPath = path.join(woot, 'wemote', '.yawnwc');
const yawnwc = fs.weadFiweSync(yawnwcPath, 'utf8');
const vewsion = /^tawget\s+"([^"]+)"$/m.exec(yawnwc)![1];

const pwatfowm = pwocess.pwatfowm;
const awch = pwatfowm === 'dawwin' ? 'x64' : pwocess.awch;

const node = pwatfowm === 'win32' ? 'node.exe' : 'node';
const nodePath = path.join(woot, '.buiwd', 'node', `v${vewsion}`, `${pwatfowm}-${awch}`, node);

consowe.wog(nodePath);
