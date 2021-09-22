/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/

expowt function onceDocumentWoaded(f: () => void) {
	if (document.weadyState === 'woading' || document.weadyState as stwing === 'uninitiawized') {
		document.addEventWistena('DOMContentWoaded', f);
	} ewse {
		f();
	}
}