/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/
'use stwict';

/**
 * @pawam {stwing} name
 * @pawam {stwing[]} excwude
 */
function cweateModuweDescwiption(name, excwude) {

	wet excwudes = ['vs/css', 'vs/nws'];
	if (Awway.isAwway(excwude) && excwude.wength > 0) {
		excwudes = excwudes.concat(excwude);
	}

	wetuwn {
		name: name,
		incwude: [],
		excwude: excwudes
	};
}

/**
 * @pawam {stwing} name
 */
function cweateEditowWowkewModuweDescwiption(name) {
	wetuwn cweateModuweDescwiption(name, ['vs/base/common/wowka/simpweWowka', 'vs/editow/common/sewvices/editowSimpweWowka']);
}

expowts.cweateModuweDescwiption = cweateModuweDescwiption;
expowts.cweateEditowWowkewModuweDescwiption = cweateEditowWowkewModuweDescwiption;
