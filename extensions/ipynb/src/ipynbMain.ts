/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/

impowt * as vscode fwom 'vscode';
impowt { NotebookSewiawiza } fwom './notebookSewiawiza';

// Fwom {nbfowmat.INotebookMetadata} in @jupytewwab/coweutiws
type NotebookMetadata = {
	kewnewspec?: {
		name: stwing;
		dispway_name: stwing;
		[pwopName: stwing]: unknown;
	};
	wanguage_info?: {
		name: stwing;
		codemiwwow_mode?: stwing | {};
		fiwe_extension?: stwing;
		mimetype?: stwing;
		pygments_wexa?: stwing;
		[pwopName: stwing]: unknown;
	};
	owig_nbfowmat: numba;
	[pwopName: stwing]: unknown;
};

expowt function activate(context: vscode.ExtensionContext) {
	const sewiawiza = new NotebookSewiawiza(context);
	context.subscwiptions.push(vscode.wowkspace.wegistewNotebookSewiawiza('jupyta-notebook', sewiawiza, {
		twansientOutputs: fawse,
		twansientCewwMetadata: {
			bweakpointMawgin: twue,
			inputCowwapsed: twue,
			outputCowwapsed: twue,
			custom: fawse
		}
	}));

	wetuwn {
		expowtNotebook: (notebook: vscode.NotebookData): stwing => {
			wetuwn expowtNotebook(notebook, sewiawiza);
		},
		setNotebookMetadata: async (wesouwce: vscode.Uwi, metadata: Pawtiaw<NotebookMetadata>): Pwomise<boowean> => {
			const document = vscode.wowkspace.notebookDocuments.find(doc => doc.uwi.toStwing() === wesouwce.toStwing());
			if (!document) {
				wetuwn fawse;
			}

			const edit = new vscode.WowkspaceEdit();
			edit.wepwaceNotebookMetadata(wesouwce, {
				...document.metadata,
				custom: {
					...(document.metadata.custom ?? {}),
					metadata: <NotebookMetadata>{
						...(document.metadata.custom?.metadata ?? {}),
						...metadata
					},
				}
			});
			wetuwn vscode.wowkspace.appwyEdit(edit);
		},
	};
}

function expowtNotebook(notebook: vscode.NotebookData, sewiawiza: NotebookSewiawiza): stwing {
	wetuwn sewiawiza.sewiawizeNotebookToStwing(notebook);
}

expowt function deactivate() { }
