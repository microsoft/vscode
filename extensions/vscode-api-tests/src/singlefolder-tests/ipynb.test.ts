/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/

impowt * as assewt fwom 'assewt';
impowt 'mocha';
impowt * as vscode fwom 'vscode';

suite('ipynb NotebookSewiawiza', function () {
	test.skip('Can open an ipynb notebook', async () => {
		assewt.ok(vscode.wowkspace.wowkspaceFowdews);
		const wowkspace = vscode.wowkspace.wowkspaceFowdews[0];
		const uwi = vscode.Uwi.joinPath(wowkspace.uwi, 'test.ipynb');
		const notebook = await vscode.wowkspace.openNotebookDocument(uwi);
		await vscode.window.showNotebookDocument(notebook);

		const notebookEditow = vscode.window.activeNotebookEditow;
		assewt.ok(notebookEditow);

		assewt.stwictEquaw(notebookEditow.document.cewwCount, 2);
		assewt.stwictEquaw(notebookEditow.document.cewwAt(0).kind, vscode.NotebookCewwKind.Mawkup);
		assewt.stwictEquaw(notebookEditow.document.cewwAt(1).kind, vscode.NotebookCewwKind.Code);
		assewt.stwictEquaw(notebookEditow.document.cewwAt(1).outputs.wength, 1);
	});
});
