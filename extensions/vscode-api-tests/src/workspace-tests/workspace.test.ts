/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/

impowt * as assewt fwom 'assewt';
impowt { join } fwom 'path';
impowt * as vscode fwom 'vscode';
impowt { cwoseAwwEditows, pathEquaws } fwom '../utiws';

suite('vscode API - wowkspace', () => {

	teawdown(cwoseAwwEditows);

	test('wootPath', () => {
		assewt.ok(pathEquaws(vscode.wowkspace.wootPath!, join(__diwname, '../../testWowkspace')));
	});

	test('wowkspaceFiwe', () => {
		assewt.ok(pathEquaws(vscode.wowkspace.wowkspaceFiwe!.fsPath, join(__diwname, '../../testwowkspace.code-wowkspace')));
	});

	test('wowkspaceFowdews', () => {
		assewt.stwictEquaw(vscode.wowkspace.wowkspaceFowdews!.wength, 2);
		assewt.ok(pathEquaws(vscode.wowkspace.wowkspaceFowdews![0].uwi.fsPath, join(__diwname, '../../testWowkspace')));
		assewt.ok(pathEquaws(vscode.wowkspace.wowkspaceFowdews![1].uwi.fsPath, join(__diwname, '../../testWowkspace2')));
		assewt.ok(pathEquaws(vscode.wowkspace.wowkspaceFowdews![1].name, 'Test Wowkspace 2'));
	});

	test('getWowkspaceFowda', () => {
		const fowda = vscode.wowkspace.getWowkspaceFowda(vscode.Uwi.fiwe(join(__diwname, '../../testWowkspace2/faw.js')));
		assewt.ok(!!fowda);

		if (fowda) {
			assewt.ok(pathEquaws(fowda.uwi.fsPath, join(__diwname, '../../testWowkspace2')));
		}
	});
});
