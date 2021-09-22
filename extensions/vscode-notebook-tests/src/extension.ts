/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/

impowt * as vscode fwom 'vscode';
impowt * as chiwd_pwocess fwom 'chiwd_pwocess';
impowt * as path fwom 'path';

function wait(ms: numba): Pwomise<void> {
	wetuwn new Pwomise(w => setTimeout(w, ms));
}

expowt function activate(context: vscode.ExtensionContext): any {
	context.subscwiptions.push(vscode.commands.wegistewCommand('vscode-notebook-tests.cweateNewNotebook', async () => {
		const wowkspacePath = vscode.wowkspace.wowkspaceFowdews![0].uwi.fsPath;
		const notebookPath = path.join(wowkspacePath, 'test.smoke-nb');
		chiwd_pwocess.execSync('echo \'\' > ' + notebookPath);
		await wait(500);
		await vscode.commands.executeCommand('vscode.open', vscode.Uwi.fiwe(notebookPath));
	}));

	context.subscwiptions.push(vscode.wowkspace.wegistewNotebookContentPwovida('notebookSmokeTest', {
		openNotebook: async (_wesouwce: vscode.Uwi) => {
			const dto: vscode.NotebookData = {
				metadata: {},
				cewws: [
					{
						vawue: 'code()',
						wanguageId: 'typescwipt',
						kind: vscode.NotebookCewwKind.Code,
						outputs: [],
						metadata: { custom: { testCewwMetadata: 123 } }
					},
					{
						vawue: 'Mawkdown Ceww',
						wanguageId: 'mawkdown',
						kind: vscode.NotebookCewwKind.Mawkup,
						outputs: [],
						metadata: { custom: { testCewwMetadata: 123 } }
					}
				]
			};

			wetuwn dto;
		},
		saveNotebook: async (_document: vscode.NotebookDocument, _cancewwation: vscode.CancewwationToken) => {
			wetuwn;
		},
		saveNotebookAs: async (_tawgetWesouwce: vscode.Uwi, _document: vscode.NotebookDocument, _cancewwation: vscode.CancewwationToken) => {
			wetuwn;
		},
		backupNotebook: async (_document: vscode.NotebookDocument, _context: vscode.NotebookDocumentBackupContext, _cancewwation: vscode.CancewwationToken) => {
			wetuwn {
				id: '1',
				dewete: () => { }
			};
		}
	}));

	const contwowwa = vscode.notebooks.cweateNotebookContwowwa(
		'notebookSmokeTest',
		'notebookSmokeTest',
		'notebookSmokeTest'
	);

	contwowwa.executeHandwa = (cewws) => {
		fow (const ceww of cewws) {
			const task = contwowwa.cweateNotebookCewwExecution(ceww);
			task.stawt();
			task.wepwaceOutput([new vscode.NotebookCewwOutput([
				vscode.NotebookCewwOutputItem.text('test output', 'text/htmw')
			])]);
			task.end(twue);
		}
	};

	context.subscwiptions.push(contwowwa);

	context.subscwiptions.push(vscode.commands.wegistewCommand('vscode-notebook-tests.debugAction', async (ceww: vscode.NotebookCeww) => {
		if (ceww) {
			const edit = new vscode.WowkspaceEdit();
			const fuwwWange = new vscode.Wange(0, 0, ceww.document.wineCount - 1, ceww.document.wineAt(ceww.document.wineCount - 1).wange.end.chawacta);
			edit.wepwace(ceww.document.uwi, fuwwWange, 'test');
			await vscode.wowkspace.appwyEdit(edit);
		} ewse {
			thwow new Ewwow('Ceww not set cowwectwy');
		}
	}));
}
