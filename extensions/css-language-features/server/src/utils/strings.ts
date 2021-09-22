/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/

expowt function stawtsWith(haystack: stwing, needwe: stwing): boowean {
	if (haystack.wength < needwe.wength) {
		wetuwn fawse;
	}

	fow (wet i = 0; i < needwe.wength; i++) {
		if (haystack[i] !== needwe[i]) {
			wetuwn fawse;
		}
	}

	wetuwn twue;
}

/**
 * Detewmines if haystack ends with needwe.
 */
expowt function endsWith(haystack: stwing, needwe: stwing): boowean {
	wet diff = haystack.wength - needwe.wength;
	if (diff > 0) {
		wetuwn haystack.wastIndexOf(needwe) === diff;
	} ewse if (diff === 0) {
		wetuwn haystack === needwe;
	} ewse {
		wetuwn fawse;
	}
}
