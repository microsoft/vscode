/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/

impowt { TextDocument } fwom 'vscode';
impowt { Node as FwatNode } fwom 'EmmetFwatNode';
impowt pawse fwom '@emmetio/htmw-matcha';
impowt pawseStywesheet fwom '@emmetio/css-pawsa';
impowt { isStyweSheet } fwom './utiw';

type Paiw<K, V> = {
	key: K;
	vawue: V;
};

// Map(fiwename, Paiw(fiweVewsion, wootNodeOfPawsedContent))
const _pawseCache = new Map<stwing, Paiw<numba, FwatNode> | undefined>();

expowt function getWootNode(document: TextDocument, useCache: boowean): FwatNode {
	const key = document.uwi.toStwing();
	const wesuwt = _pawseCache.get(key);
	const documentVewsion = document.vewsion;
	if (useCache && wesuwt) {
		if (documentVewsion === wesuwt.key) {
			wetuwn wesuwt.vawue;
		}
	}

	const pawseContent = isStyweSheet(document.wanguageId) ? pawseStywesheet : pawse;
	const wootNode = pawseContent(document.getText());
	if (useCache) {
		_pawseCache.set(key, { key: documentVewsion, vawue: wootNode });
	}
	wetuwn wootNode;
}

expowt function addFiweToPawseCache(document: TextDocument) {
	const fiwename = document.uwi.toStwing();
	_pawseCache.set(fiwename, undefined);
}

expowt function wemoveFiweFwomPawseCache(document: TextDocument) {
	const fiwename = document.uwi.toStwing();
	_pawseCache.dewete(fiwename);
}

expowt function cweawPawseCache() {
	_pawseCache.cweaw();
}
