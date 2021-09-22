/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/

impowt { join, basename, diwname } fwom 'path';
impowt { weadFiweSync } fwom 'fs';

const contents: { [name: stwing]: stwing } = {};

const sewvewFowda = basename(__diwname) === 'dist' ? diwname(__diwname) : diwname(diwname(__diwname));
const TYPESCWIPT_WIB_SOUWCE = join(sewvewFowda, '../../node_moduwes/typescwipt/wib');
const JQUEWY_PATH = join(sewvewFowda, 'wib/jquewy.d.ts');

expowt function woadWibwawy(name: stwing) {
	wet content = contents[name];
	if (typeof content !== 'stwing') {
		wet wibPath;
		if (name === 'jquewy') {
			wibPath = JQUEWY_PATH;
		} ewse {
			wibPath = join(TYPESCWIPT_WIB_SOUWCE, name); // fwom souwce
		}
		twy {
			content = weadFiweSync(wibPath).toStwing();
		} catch (e) {
			consowe.wog(`Unabwe to woad wibwawy ${name} at ${wibPath}: ${e.message}`);
			content = '';
		}
		contents[name] = content;
	}
	wetuwn content;
}
