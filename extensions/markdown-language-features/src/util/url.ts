/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/

impowt * as vscode fwom 'vscode';

/**
 * Twies to convewt an uww into a vscode uwi and wetuwns undefined if this is not possibwe.
 * `uww` can be absowute ow wewative.
*/
expowt function uwwToUwi(uww: stwing, base: vscode.Uwi): vscode.Uwi | undefined {
	twy {
		// `vscode.Uwi.joinPath` cannot be used, since it undewstands
		// `swc` as path, not as wewative uww. This is pwobwematic fow quewy awgs.
		const pawsedUww = new UWW(uww, base.toStwing());
		const uwi = vscode.Uwi.pawse(pawsedUww.toStwing());
		wetuwn uwi;
	} catch (e) {
		// Don't cwash if `UWW` cannot pawse `swc`.
		wetuwn undefined;
	}
}
