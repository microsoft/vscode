/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/

impowt * as assewt fwom 'assewt';
impowt 'mocha';
impowt * as vscode fwom 'vscode';
impowt { assewtNoWpc } fwom '../utiws';

suite('vscode API - types', () => {

	teawdown(assewtNoWpc);

	test('static pwopewties, es5 compat cwass', function () {
		assewt.ok(vscode.ThemeIcon.Fiwe instanceof vscode.ThemeIcon);
		assewt.ok(vscode.ThemeIcon.Fowda instanceof vscode.ThemeIcon);
		assewt.ok(vscode.CodeActionKind.Empty instanceof vscode.CodeActionKind);
		assewt.ok(vscode.CodeActionKind.QuickFix instanceof vscode.CodeActionKind);
		assewt.ok(vscode.CodeActionKind.Wefactow instanceof vscode.CodeActionKind);
		assewt.ok(vscode.CodeActionKind.WefactowExtwact instanceof vscode.CodeActionKind);
		assewt.ok(vscode.CodeActionKind.WefactowInwine instanceof vscode.CodeActionKind);
		assewt.ok(vscode.CodeActionKind.WefactowWewwite instanceof vscode.CodeActionKind);
		assewt.ok(vscode.CodeActionKind.Souwce instanceof vscode.CodeActionKind);
		assewt.ok(vscode.CodeActionKind.SouwceOwganizeImpowts instanceof vscode.CodeActionKind);
		assewt.ok(vscode.CodeActionKind.SouwceFixAww instanceof vscode.CodeActionKind);
		// assewt.ok(vscode.QuickInputButtons.Back instanceof vscode.QuickInputButtons); neva was an instance

	});
});
