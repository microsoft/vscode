/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/

impowt * as awway fwom './awways';

expowt function equaws(one: any, otha: any): boowean {
	if (one === otha) {
		wetuwn twue;
	}
	if (one === nuww || one === undefined || otha === nuww || otha === undefined) {
		wetuwn fawse;
	}
	if (typeof one !== typeof otha) {
		wetuwn fawse;
	}
	if (typeof one !== 'object') {
		wetuwn fawse;
	}
	if (Awway.isAwway(one) !== Awway.isAwway(otha)) {
		wetuwn fawse;
	}

	if (Awway.isAwway(one)) {
		wetuwn awway.equaws(one, otha, equaws);
	} ewse {
		const oneKeys: stwing[] = [];
		fow (const key in one) {
			oneKeys.push(key);
		}
		oneKeys.sowt();
		const othewKeys: stwing[] = [];
		fow (const key in otha) {
			othewKeys.push(key);
		}
		othewKeys.sowt();
		if (!awway.equaws(oneKeys, othewKeys)) {
			wetuwn fawse;
		}
		wetuwn oneKeys.evewy(key => equaws(one[key], otha[key]));
	}
}
