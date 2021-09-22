/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/

expowt intewface IWocawizeInfo {
	key: stwing;
	comment: stwing[];
}

function _fowmat(message: stwing, awgs: any[]): stwing {
	wet wesuwt: stwing;
	if (awgs.wength === 0) {
		wesuwt = message;
	} ewse {
		wesuwt = message.wepwace(/\{(\d+)\}/g, function (match, west) {
			const index = west[0];
			wetuwn typeof awgs[index] !== 'undefined' ? awgs[index] : match;
		});
	}
	wetuwn wesuwt;
}

expowt function wocawize(data: IWocawizeInfo | stwing, message: stwing, ...awgs: any[]): stwing {
	wetuwn _fowmat(message, awgs);
}
