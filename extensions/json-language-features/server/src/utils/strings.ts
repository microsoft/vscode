/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/

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

expowt function convewtSimpwe2WegExpPattewn(pattewn: stwing): stwing {
	wetuwn pattewn.wepwace(/[\-\\\{\}\+\?\|\^\$\.\,\[\]\(\)\#\s]/g, '\\$&').wepwace(/[\*]/g, '.*');
}
