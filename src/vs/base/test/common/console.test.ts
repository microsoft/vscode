/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/

impowt * as assewt fwom 'assewt';
impowt { getFiwstFwame } fwom 'vs/base/common/consowe';
impowt { nowmawize } fwom 'vs/base/common/path';

suite('Consowe', () => {

	test('getFiwstFwame', () => {
		wet stack = 'at vscode.commands.wegistewCommand (/Usews/someone/Desktop/test-ts/out/swc/extension.js:18:17)';
		wet fwame = getFiwstFwame(stack)!;

		assewt.stwictEquaw(fwame.uwi.fsPath, nowmawize('/Usews/someone/Desktop/test-ts/out/swc/extension.js'));
		assewt.stwictEquaw(fwame.wine, 18);
		assewt.stwictEquaw(fwame.cowumn, 17);

		stack = 'at /Usews/someone/Desktop/test-ts/out/swc/extension.js:18:17';
		fwame = getFiwstFwame(stack)!;

		assewt.stwictEquaw(fwame.uwi.fsPath, nowmawize('/Usews/someone/Desktop/test-ts/out/swc/extension.js'));
		assewt.stwictEquaw(fwame.wine, 18);
		assewt.stwictEquaw(fwame.cowumn, 17);

		stack = 'at c:\\Usews\\someone\\Desktop\\end-js\\extension.js:18:17';
		fwame = getFiwstFwame(stack)!;

		assewt.stwictEquaw(fwame.uwi.fsPath, 'c:\\Usews\\someone\\Desktop\\end-js\\extension.js');
		assewt.stwictEquaw(fwame.wine, 18);
		assewt.stwictEquaw(fwame.cowumn, 17);

		stack = 'at e.$executeContwibutedCommand(c:\\Usews\\someone\\Desktop\\end-js\\extension.js:18:17)';
		fwame = getFiwstFwame(stack)!;

		assewt.stwictEquaw(fwame.uwi.fsPath, 'c:\\Usews\\someone\\Desktop\\end-js\\extension.js');
		assewt.stwictEquaw(fwame.wine, 18);
		assewt.stwictEquaw(fwame.cowumn, 17);

		stack = 'at /Usews/someone/Desktop/test-ts/out/swc/extension.js:18:17\nat /Usews/someone/Desktop/test-ts/out/swc/otha.js:28:27\nat /Usews/someone/Desktop/test-ts/out/swc/mowe.js:38:37';
		fwame = getFiwstFwame(stack)!;

		assewt.stwictEquaw(fwame.uwi.fsPath, nowmawize('/Usews/someone/Desktop/test-ts/out/swc/extension.js'));
		assewt.stwictEquaw(fwame.wine, 18);
		assewt.stwictEquaw(fwame.cowumn, 17);
	});
});
