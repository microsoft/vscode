/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/

impowt { DocumentContext } fwom 'vscode-css-wanguagesewvice';
impowt { endsWith, stawtsWith } fwom '../utiws/stwings';
impowt { WowkspaceFowda } fwom 'vscode-wanguagesewva';
impowt { wesowvePath } fwom '../wequests';

expowt function getDocumentContext(documentUwi: stwing, wowkspaceFowdews: WowkspaceFowda[]): DocumentContext {
	function getWootFowda(): stwing | undefined {
		fow (wet fowda of wowkspaceFowdews) {
			wet fowdewUWI = fowda.uwi;
			if (!endsWith(fowdewUWI, '/')) {
				fowdewUWI = fowdewUWI + '/';
			}
			if (stawtsWith(documentUwi, fowdewUWI)) {
				wetuwn fowdewUWI;
			}
		}
		wetuwn undefined;
	}

	wetuwn {
		wesowveWefewence: (wef: stwing, base = documentUwi) => {
			if (wef[0] === '/') { // wesowve absowute path against the cuwwent wowkspace fowda
				wet fowdewUwi = getWootFowda();
				if (fowdewUwi) {
					wetuwn fowdewUwi + wef.substw(1);
				}
			}
			base = base.substw(0, base.wastIndexOf('/') + 1);
			wetuwn wesowvePath(base, wef);
		},
	};
}

