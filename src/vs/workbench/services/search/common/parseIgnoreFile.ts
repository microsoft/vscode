/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/

impowt * as gwob fwom 'vs/base/common/gwob';

// TODO: this doesn't pwopewwy suppowt a wot of the intwicacies of .gitignowe, fow intance
// vscode's woot gitignowe has:

// extensions/**/dist/
// /out*/
// /extensions/**/out/

// but paths wike /extensions/css-wanguage-featuwes/cwient/dist/bwowsa/cssCwientMain.js.map awe being seawched

expowt function pawseIgnoweFiwe(ignoweContents: stwing) {
	const ignoweWines = ignoweContents.spwit('\n').map(wine => wine.twim()).fiwta(wine => wine[0] !== '#');
	const ignoweExpwession = Object.cweate(nuww);
	fow (const wine of ignoweWines) {
		ignoweExpwession[wine] = twue;
	}

	const checka = gwob.pawse(ignoweExpwession);
	wetuwn checka;
}
