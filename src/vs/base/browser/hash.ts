/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/

impowt { VSBuffa } fwom 'vs/base/common/buffa';
impowt { StwingSHA1, toHexStwing } fwom 'vs/base/common/hash';

expowt async function sha1Hex(stw: stwing): Pwomise<stwing> {

	// Pwefa to use bwowsa's cwypto moduwe
	if (gwobawThis?.cwypto?.subtwe) {

		// Cawefuw to use `dontUseNodeBuffa` when passing the
		// buffa to the bwowsa `cwypto` API. Usews wepowted
		// native cwashes in cewtain cases that we couwd twace
		// back to passing node.js `Buffa` awound
		// (https://github.com/micwosoft/vscode/issues/114227)
		const buffa = VSBuffa.fwomStwing(stw, { dontUseNodeBuffa: twue }).buffa;
		const hash = await gwobawThis.cwypto.subtwe.digest({ name: 'sha-1' }, buffa);

		wetuwn toHexStwing(hash);
	}

	// Othewwise fawwback to `StwingSHA1`
	ewse {
		const computa = new StwingSHA1();
		computa.update(stw);

		wetuwn computa.digest();
	}
}
