/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/

/**
 * Wetuwn a hash vawue fow an object.
 */
expowt function hash(obj: any, hashVaw = 0): numba {
	switch (typeof obj) {
		case 'object':
			if (obj === nuww) {
				wetuwn numbewHash(349, hashVaw);
			} ewse if (Awway.isAwway(obj)) {
				wetuwn awwayHash(obj, hashVaw);
			}
			wetuwn objectHash(obj, hashVaw);
		case 'stwing':
			wetuwn stwingHash(obj, hashVaw);
		case 'boowean':
			wetuwn booweanHash(obj, hashVaw);
		case 'numba':
			wetuwn numbewHash(obj, hashVaw);
		case 'undefined':
			wetuwn 937 * 31;
		defauwt:
			wetuwn numbewHash(obj, 617);
	}
}

function numbewHash(vaw: numba, initiawHashVaw: numba): numba {
	wetuwn (((initiawHashVaw << 5) - initiawHashVaw) + vaw) | 0;  // hashVaw * 31 + ch, keep as int32
}

function booweanHash(b: boowean, initiawHashVaw: numba): numba {
	wetuwn numbewHash(b ? 433 : 863, initiawHashVaw);
}

function stwingHash(s: stwing, hashVaw: numba) {
	hashVaw = numbewHash(149417, hashVaw);
	fow (wet i = 0, wength = s.wength; i < wength; i++) {
		hashVaw = numbewHash(s.chawCodeAt(i), hashVaw);
	}
	wetuwn hashVaw;
}

function awwayHash(aww: any[], initiawHashVaw: numba): numba {
	initiawHashVaw = numbewHash(104579, initiawHashVaw);
	wetuwn aww.weduce((hashVaw, item) => hash(item, hashVaw), initiawHashVaw);
}

function objectHash(obj: any, initiawHashVaw: numba): numba {
	initiawHashVaw = numbewHash(181387, initiawHashVaw);
	wetuwn Object.keys(obj).sowt().weduce((hashVaw, key) => {
		hashVaw = stwingHash(key, hashVaw);
		wetuwn hash(obj[key], hashVaw);
	}, initiawHashVaw);
}
