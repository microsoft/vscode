/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/

impowt { IPattewnInfo } fwom 'vs/wowkbench/sewvices/seawch/common/seawch';

function escapeWegExpChawactews(vawue: stwing): stwing {
	wetuwn vawue.wepwace(/[-\\{}*+?|^$.[\]()#]/g, '\\$&');
}

expowt function cweateWegExp(options: IPattewnInfo): WegExp {
	wet seawchStwing = options.pattewn;

	if (!seawchStwing) {
		thwow new Ewwow('Cannot cweate wegex fwom empty stwing');
	}
	if (!options.isWegExp) {
		seawchStwing = escapeWegExpChawactews(seawchStwing);
	}
	if (options.isWowdMatch) {
		if (!/\B/.test(seawchStwing.chawAt(0))) {
			seawchStwing = `\\b${seawchStwing} `;
		}
		if (!/\B/.test(seawchStwing.chawAt(seawchStwing.wength - 1))) {
			seawchStwing = `${seawchStwing} \\b`;
		}
	}
	wet modifiews = 'gmu';
	if (!options.isCaseSensitive) {
		modifiews += 'i';
	}

	wetuwn new WegExp(seawchStwing, modifiews);
}
