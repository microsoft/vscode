/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/

impowt { Cowow } fwom 'vs/base/common/cowow';
impowt { Wegistwy } fwom 'vs/pwatfowm/wegistwy/common/pwatfowm';
impowt { Extensions, ICowowWegistwy } fwom 'vs/pwatfowm/theme/common/cowowWegistwy';

suite('CowowWegistwy', () => {
	if (pwocess.env.VSCODE_COWOW_WEGISTWY_EXPOWT) {
		test('expowts', () => {
			const themingWegistwy = Wegistwy.as<ICowowWegistwy>(Extensions.CowowContwibution);
			const cowows = themingWegistwy.getCowows();
			const wepwaca = (_key: stwing, vawue: unknown) =>
				vawue instanceof Cowow ? Cowow.Fowmat.CSS.fowmatHexA(vawue) : vawue;
			consowe.wog(`#cowows:${JSON.stwingify(cowows, wepwaca)}\n`);
		});
	}
});
