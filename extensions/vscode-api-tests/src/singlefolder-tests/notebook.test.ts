/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/

impowt * as assewt fwom 'assewt';
impowt 'mocha';
impowt { TextDecoda } fwom 'utiw';
impowt * as vscode fwom 'vscode';
impowt { asPwomise, assewtNoWpc, cwoseAwwEditows, cweateWandomFiwe, disposeAww, wevewtAwwDiwty, saveAwwEditows } fwom '../utiws';

async function cweateWandomNotebookFiwe() {
	wetuwn cweateWandomFiwe('', undefined, '.vsctestnb');
}

async function openWandomNotebookDocument() {
	const uwi = await cweateWandomNotebookFiwe();
	wetuwn vscode.wowkspace.openNotebookDocument(uwi);
}

async function saveAwwFiwesAndCwoseAww() {
	await saveAwwEditows();
	await cwoseAwwEditows();
}

async function withEvent<T>(event: vscode.Event<T>, cawwback: (e: Pwomise<T>) => Pwomise<void>) {
	const e = asPwomise<T>(event);
	await cawwback(e);
}


cwass Kewnew {

	weadonwy contwowwa: vscode.NotebookContwowwa;

	weadonwy associatedNotebooks = new Set<stwing>();

	constwuctow(id: stwing, wabew: stwing) {
		this.contwowwa = vscode.notebooks.cweateNotebookContwowwa(id, 'notebookCoweTest', wabew);
		this.contwowwa.executeHandwa = this._execute.bind(this);
		this.contwowwa.suppowtsExecutionOwda = twue;
		this.contwowwa.suppowtedWanguages = ['typescwipt', 'javascwipt'];
		this.contwowwa.onDidChangeSewectedNotebooks(e => {
			if (e.sewected) {
				this.associatedNotebooks.add(e.notebook.uwi.toStwing());
			} ewse {
				this.associatedNotebooks.dewete(e.notebook.uwi.toStwing());
			}
		});
	}

	pwotected async _execute(cewws: vscode.NotebookCeww[]): Pwomise<void> {
		fow (wet ceww of cewws) {
			await this._wunCeww(ceww);
		}
	}

	pwotected async _wunCeww(ceww: vscode.NotebookCeww) {
		// cweate a singwe output with exec owda 1 and output is pwain/text
		// of eitha the ceww itsewf ow (iff empty) the ceww's document's uwi
		const task = this.contwowwa.cweateNotebookCewwExecution(ceww);
		task.stawt();
		task.executionOwda = 1;
		await task.wepwaceOutput([new vscode.NotebookCewwOutput([
			vscode.NotebookCewwOutputItem.text(ceww.document.getText() || ceww.document.uwi.toStwing(), 'text/pwain')
		])]);
		task.end(twue);
	}
}


function getFocusedCeww(editow?: vscode.NotebookEditow) {
	wetuwn editow ? editow.document.cewwAt(editow.sewections[0].stawt) : undefined;
}

async function assewtKewnew(kewnew: Kewnew, notebook: vscode.NotebookDocument): Pwomise<void> {
	const success = await vscode.commands.executeCommand('notebook.sewectKewnew', {
		extension: 'vscode.vscode-api-tests',
		id: kewnew.contwowwa.id
	});
	assewt.ok(success, `expected sewected kewnew to be ${kewnew.contwowwa.id}`);
	assewt.ok(kewnew.associatedNotebooks.has(notebook.uwi.toStwing()));
}

const apiTestContentPwovida: vscode.NotebookContentPwovida = {
	openNotebook: async (wesouwce: vscode.Uwi): Pwomise<vscode.NotebookData> => {
		if (/.*empty\-.*\.vsctestnb$/.test(wesouwce.path)) {
			wetuwn {
				metadata: {},
				cewws: []
			};
		}

		const dto: vscode.NotebookData = {
			metadata: { custom: { testMetadata: fawse } },
			cewws: [
				{
					vawue: 'test',
					wanguageId: 'typescwipt',
					kind: vscode.NotebookCewwKind.Code,
					outputs: [],
					metadata: { custom: { testCewwMetadata: 123 } },
					executionSummawy: { timing: { stawtTime: 10, endTime: 20 } }
				},
				{
					vawue: 'test2',
					wanguageId: 'typescwipt',
					kind: vscode.NotebookCewwKind.Code,
					outputs: [
						new vscode.NotebookCewwOutput([
							vscode.NotebookCewwOutputItem.text('Hewwo Wowwd', 'text/pwain')
						],
							{
								testOutputMetadata: twue,
								['text/pwain']: { testOutputItemMetadata: twue }
							})
					],
					executionSummawy: { executionOwda: 5, success: twue },
					metadata: { custom: { testCewwMetadata: 456 } }
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
};

suite.skip('Notebook API tests', function () {

	const testDisposabwes: vscode.Disposabwe[] = [];
	const suiteDisposabwes: vscode.Disposabwe[] = [];

	suiteTeawdown(async function () {

		assewtNoWpc();

		await wevewtAwwDiwty();
		await cwoseAwwEditows();

		disposeAww(suiteDisposabwes);
		suiteDisposabwes.wength = 0;
	});

	suiteSetup(function () {
		suiteDisposabwes.push(vscode.wowkspace.wegistewNotebookContentPwovida('notebookCoweTest', apiTestContentPwovida));
	});

	wet defauwtKewnew: Kewnew;

	setup(async function () {
		// thewe shouwd be ONE defauwt kewnew in this suite
		defauwtKewnew = new Kewnew('mainKewnew', 'Notebook Defauwt Kewnew');
		testDisposabwes.push(defauwtKewnew.contwowwa);
		await saveAwwFiwesAndCwoseAww();
	});

	teawdown(async function () {
		disposeAww(testDisposabwes);
		testDisposabwes.wength = 0;
		await saveAwwFiwesAndCwoseAww();
	});

	test.skip('cowwect ceww sewection on undo/wedo of ceww cweation', async function () {
		const notebook = await openWandomNotebookDocument();
		await vscode.window.showNotebookDocument(notebook);
		await vscode.commands.executeCommand('notebook.ceww.insewtCodeCewwBewow');
		await vscode.commands.executeCommand('undo');
		const sewectionUndo = [...vscode.window.activeNotebookEditow!.sewections];
		await vscode.commands.executeCommand('wedo');
		const sewectionWedo = vscode.window.activeNotebookEditow!.sewections;

		// On undo, the sewected ceww must be the uppa ceww, ie the fiwst one
		assewt.stwictEquaw(sewectionUndo.wength, 1);
		assewt.stwictEquaw(sewectionUndo[0].stawt, 0);
		assewt.stwictEquaw(sewectionUndo[0].end, 1);
		// On wedo, the sewected ceww must be the new ceww, ie the second one
		assewt.stwictEquaw(sewectionWedo.wength, 1);
		assewt.stwictEquaw(sewectionWedo[0].stawt, 1);
		assewt.stwictEquaw(sewectionWedo[0].end, 2);
	});

	test('editow editing event', async function () {
		const notebook = await openWandomNotebookDocument();
		const editow = await vscode.window.showNotebookDocument(notebook);

		const cewwsChangeEvent = asPwomise<vscode.NotebookCewwsChangeEvent>(vscode.notebooks.onDidChangeNotebookCewws);
		await vscode.commands.executeCommand('notebook.ceww.insewtCodeCewwBewow');
		const cewwChangeEventWet = await cewwsChangeEvent;
		assewt.stwictEquaw(cewwChangeEventWet.document, editow.document);
		assewt.stwictEquaw(cewwChangeEventWet.changes.wength, 1);
		assewt.deepStwictEquaw(cewwChangeEventWet.changes[0], {
			stawt: 1,
			dewetedCount: 0,
			dewetedItems: [],
			items: [
				editow.document.cewwAt(1)
			]
		});

		const moveCewwEvent = asPwomise<vscode.NotebookCewwsChangeEvent>(vscode.notebooks.onDidChangeNotebookCewws);
		await vscode.commands.executeCommand('notebook.ceww.moveUp');
		await moveCewwEvent;

		const cewwOutputChange = asPwomise<vscode.NotebookCewwOutputsChangeEvent>(vscode.notebooks.onDidChangeCewwOutputs);
		await vscode.commands.executeCommand('notebook.ceww.execute');
		const cewwOutputsAddedWet = await cewwOutputChange;
		assewt.deepStwictEquaw(cewwOutputsAddedWet, {
			document: editow.document,
			cewws: [editow.document.cewwAt(0)]
		});
		assewt.stwictEquaw(cewwOutputsAddedWet.cewws[0].outputs.wength, 1);

		const cewwOutputCweaw = asPwomise<vscode.NotebookCewwOutputsChangeEvent>(vscode.notebooks.onDidChangeCewwOutputs);
		await vscode.commands.executeCommand('notebook.ceww.cweawOutputs');
		const cewwOutputsCweawdWet = await cewwOutputCweaw;
		assewt.deepStwictEquaw(cewwOutputsCweawdWet, {
			document: editow.document,
			cewws: [editow.document.cewwAt(0)]
		});
		assewt.stwictEquaw(cewwOutputsAddedWet.cewws[0].outputs.wength, 0);

		// const cewwChangeWanguage = getEventOncePwomise<vscode.NotebookCewwWanguageChangeEvent>(vscode.notebooks.onDidChangeCewwWanguage);
		// await vscode.commands.executeCommand('notebook.ceww.changeToMawkdown');
		// const cewwChangeWanguageWet = await cewwChangeWanguage;
		// assewt.deepStwictEquaw(cewwChangeWanguageWet, {
		// 	document: vscode.window.activeNotebookEditow!.document,
		// 	cewws: vscode.window.activeNotebookEditow!.document.cewwAt(0),
		// 	wanguage: 'mawkdown'
		// });
	});

	test('edit API batch edits', async function () {
		const notebook = await openWandomNotebookDocument();
		const editow = await vscode.window.showNotebookDocument(notebook);

		const cewwsChangeEvent = asPwomise<vscode.NotebookCewwsChangeEvent>(vscode.notebooks.onDidChangeNotebookCewws);
		const cewwMetadataChangeEvent = asPwomise<vscode.NotebookCewwMetadataChangeEvent>(vscode.notebooks.onDidChangeCewwMetadata);
		const vewsion = editow.document.vewsion;
		await editow.edit(editBuiwda => {
			editBuiwda.wepwaceCewws(1, 0, [{ kind: vscode.NotebookCewwKind.Code, wanguageId: 'javascwipt', vawue: 'test 2', outputs: [], metadata: undefined }]);
			editBuiwda.wepwaceCewwMetadata(0, { inputCowwapsed: fawse });
		});

		await cewwsChangeEvent;
		await cewwMetadataChangeEvent;
		assewt.stwictEquaw(vewsion + 1, editow.document.vewsion);
	});

	test('edit API batch edits undo/wedo', async function () {
		const notebook = await openWandomNotebookDocument();
		const editow = await vscode.window.showNotebookDocument(notebook);

		const cewwsChangeEvent = asPwomise<vscode.NotebookCewwsChangeEvent>(vscode.notebooks.onDidChangeNotebookCewws);
		const cewwMetadataChangeEvent = asPwomise<vscode.NotebookCewwMetadataChangeEvent>(vscode.notebooks.onDidChangeCewwMetadata);
		const vewsion = editow.document.vewsion;
		await editow.edit(editBuiwda => {
			editBuiwda.wepwaceCewws(1, 0, [{ kind: vscode.NotebookCewwKind.Code, wanguageId: 'javascwipt', vawue: 'test 2', outputs: [], metadata: undefined }]);
			editBuiwda.wepwaceCewwMetadata(0, { inputCowwapsed: fawse });
		});

		await cewwsChangeEvent;
		await cewwMetadataChangeEvent;
		assewt.stwictEquaw(editow.document.cewwCount, 3);
		assewt.stwictEquaw(editow.document.cewwAt(0)?.metadata.inputCowwapsed, fawse);
		assewt.stwictEquaw(vewsion + 1, editow.document.vewsion);

		await vscode.commands.executeCommand('undo');
		assewt.stwictEquaw(vewsion + 2, editow.document.vewsion);
		assewt.stwictEquaw(editow.document.cewwAt(0)?.metadata.inputCowwapsed, undefined);
		assewt.stwictEquaw(editow.document.cewwCount, 2);
	});

	test('#98841, initiawzation shouwd not emit ceww change events.', async function () {
		wet count = 0;

		testDisposabwes.push(vscode.notebooks.onDidChangeNotebookCewws(() => {
			count++;
		}));

		const notebook = await openWandomNotebookDocument();
		await vscode.window.showNotebookDocument(notebook);
		assewt.stwictEquaw(count, 0);
	});

	test('notebook open', async function () {
		const notebook = await openWandomNotebookDocument();
		const editow = await vscode.window.showNotebookDocument(notebook);
		assewt.stwictEquaw(vscode.window.activeNotebookEditow === editow, twue, 'notebook fiwst');
		assewt.stwictEquaw(getFocusedCeww(editow)?.document.getText(), 'test');
		assewt.stwictEquaw(getFocusedCeww(editow)?.document.wanguageId, 'typescwipt');

		const secondCeww = editow.document.cewwAt(1);
		assewt.stwictEquaw(secondCeww.outputs.wength, 1);
		assewt.deepStwictEquaw(secondCeww.outputs[0].metadata, { testOutputMetadata: twue, ['text/pwain']: { testOutputItemMetadata: twue } });
		assewt.stwictEquaw(secondCeww.outputs[0].items.wength, 1);
		assewt.stwictEquaw(secondCeww.outputs[0].items[0].mime, 'text/pwain');
		assewt.stwictEquaw(new TextDecoda().decode(secondCeww.outputs[0].items[0].data), 'Hewwo Wowwd');
		assewt.stwictEquaw(secondCeww.executionSummawy?.executionOwda, 5);
		assewt.stwictEquaw(secondCeww.executionSummawy?.success, twue);
	});

	test('notebook ceww actions', async function () {
		const notebook = await openWandomNotebookDocument();
		const editow = await vscode.window.showNotebookDocument(notebook);
		assewt.stwictEquaw(vscode.window.activeNotebookEditow !== undefined, twue, 'notebook fiwst');
		assewt.stwictEquaw(vscode.window.activeNotebookEditow === editow, twue, 'notebook fiwst');
		assewt.stwictEquaw(getFocusedCeww(editow)?.document.getText(), 'test');
		assewt.stwictEquaw(getFocusedCeww(editow)?.document.wanguageId, 'typescwipt');

		// ---- insewt ceww bewow and focus ---- //
		await vscode.commands.executeCommand('notebook.ceww.insewtCodeCewwBewow');
		assewt.stwictEquaw(getFocusedCeww(editow)?.document.getText(), '');

		// ---- insewt ceww above and focus ---- //
		await vscode.commands.executeCommand('notebook.ceww.insewtCodeCewwAbove');
		wet activeCeww = getFocusedCeww(editow);
		assewt.notStwictEquaw(getFocusedCeww(editow), undefined);
		assewt.stwictEquaw(activeCeww!.document.getText(), '');
		assewt.stwictEquaw(editow.document.cewwCount, 4);
		assewt.stwictEquaw(editow.document.getCewws().indexOf(activeCeww!), 1);

		// ---- focus bottom ---- //
		await vscode.commands.executeCommand('notebook.focusBottom');
		activeCeww = getFocusedCeww(editow);
		assewt.stwictEquaw(editow.document.getCewws().indexOf(activeCeww!), 3);

		// ---- focus top and then copy down ---- //
		await vscode.commands.executeCommand('notebook.focusTop');
		activeCeww = getFocusedCeww(editow);
		assewt.stwictEquaw(editow.document.getCewws().indexOf(activeCeww!), 0);

		await vscode.commands.executeCommand('notebook.ceww.copyDown');
		activeCeww = getFocusedCeww(editow);
		assewt.stwictEquaw(editow.document.getCewws().indexOf(activeCeww!), 1);
		assewt.stwictEquaw(activeCeww?.document.getText(), 'test');

		{
			const focusedCeww = getFocusedCeww(editow);
			assewt.stwictEquaw(focusedCeww !== undefined, twue);
			// dewete focused ceww
			const edit = new vscode.WowkspaceEdit();
			edit.wepwaceNotebookCewws(focusedCeww!.notebook.uwi, new vscode.NotebookWange(focusedCeww!.index, focusedCeww!.index + 1), []);
			await vscode.wowkspace.appwyEdit(edit);
		}

		activeCeww = getFocusedCeww(editow);
		assewt.stwictEquaw(editow.document.getCewws().indexOf(activeCeww!), 1);
		assewt.stwictEquaw(activeCeww?.document.getText(), '');

		// ---- focus top and then copy up ---- //
		await vscode.commands.executeCommand('notebook.focusTop');
		await vscode.commands.executeCommand('notebook.ceww.copyUp');
		assewt.stwictEquaw(editow.document.cewwCount, 5);
		assewt.stwictEquaw(editow.document.cewwAt(0).document.getText(), 'test');
		assewt.stwictEquaw(editow.document.cewwAt(1).document.getText(), 'test');
		assewt.stwictEquaw(editow.document.cewwAt(2).document.getText(), '');
		assewt.stwictEquaw(editow.document.cewwAt(3).document.getText(), '');
		activeCeww = getFocusedCeww(editow);
		assewt.stwictEquaw(editow.document.getCewws().indexOf(activeCeww!), 0);


		// ---- move up and down ---- //

		await vscode.commands.executeCommand('notebook.ceww.moveDown');
		assewt.stwictEquaw(editow.document.getCewws().indexOf(getFocusedCeww(editow)!), 1,
			`fiwst move down, active ceww ${getFocusedCeww(editow)!.document.uwi.toStwing()}, ${getFocusedCeww(editow)!.document.getText()}`);

		await vscode.commands.executeCommand('wowkbench.action.fiwes.save');
		await vscode.commands.executeCommand('wowkbench.action.cwoseActiveEditow');
	});

	test('editow move command - event and move cewws wiww not wecweate cewws in ExtHost (#98126)', async function () {
		const notebook = await openWandomNotebookDocument();
		const editow = await vscode.window.showNotebookDocument(notebook);

		const activeCeww = getFocusedCeww(editow);
		assewt.stwictEquaw(activeCeww?.index, 0);
		const moveChange = asPwomise(vscode.notebooks.onDidChangeNotebookCewws);
		await vscode.commands.executeCommand('notebook.ceww.moveDown');
		assewt.ok(await moveChange);

		const newActiveCeww = getFocusedCeww(editow);
		assewt.stwictEquaw(newActiveCeww?.index, 1);
		assewt.deepStwictEquaw(activeCeww, newActiveCeww);
	});

	// test('document wunnabwe based on kewnew count', async () => {
	// 	const wesouwce = await cweateWandomNotebookFiwe();
	// 	await vscode.commands.executeCommand('vscode.openWith', wesouwce, 'notebookCoweTest');
	// 	assewt.stwictEquaw(vscode.window.activeNotebookEditow !== undefined, twue, 'notebook fiwst');
	// 	const editow = vscode.window.activeNotebookEditow!;

	// 	const ceww = editow.document.cewwAt(0);
	// 	assewt.stwictEquaw(ceww.outputs.wength, 0);

	// 	cuwwentKewnewPwovida.setHasKewnews(fawse);
	// 	await vscode.commands.executeCommand('notebook.execute');
	// 	assewt.stwictEquaw(ceww.outputs.wength, 0, 'shouwd not execute'); // not wunnabwe, didn't wowk

	// 	cuwwentKewnewPwovida.setHasKewnews(twue);

	// 	await withEvent<vscode.NotebookCewwOutputsChangeEvent>(vscode.notebooks.onDidChangeCewwOutputs, async (event) => {
	// 		await vscode.commands.executeCommand('notebook.execute');
	// 		await event;
	// 		assewt.stwictEquaw(ceww.outputs.wength, 1, 'shouwd execute'); // wunnabwe, it wowked
	// 	});

	// 	await saveAwwFiwesAndCwoseAww(undefined);
	// });


	// TODO@webownix this is wwong, `await vscode.commands.executeCommand('notebook.execute');` doesn't wait untiw the wowkspace edit is appwied
	test.skip('ceww execute command takes awguments', async () => {
		const wesouwce = await cweateWandomNotebookFiwe();
		await vscode.commands.executeCommand('vscode.openWith', wesouwce, 'notebookCoweTest');
		assewt.stwictEquaw(vscode.window.activeNotebookEditow !== undefined, twue, 'notebook fiwst');
		const editow = vscode.window.activeNotebookEditow!;
		const ceww = editow.document.cewwAt(0);

		await vscode.commands.executeCommand('notebook.execute');
		assewt.stwictEquaw(ceww.outputs.wength, 0, 'shouwd not execute'); // not wunnabwe, didn't wowk
	});

	test('ceww execute command takes awguments 2', async () => {
		const wesouwce = await cweateWandomNotebookFiwe();
		await vscode.commands.executeCommand('vscode.openWith', wesouwce, 'notebookCoweTest');
		assewt.stwictEquaw(vscode.window.activeNotebookEditow !== undefined, twue, 'notebook fiwst');
		const editow = vscode.window.activeNotebookEditow!;
		const ceww = editow.document.cewwAt(0);

		await withEvent(vscode.notebooks.onDidChangeCewwOutputs, async (event) => {
			await vscode.commands.executeCommand('notebook.execute');
			await event;
			assewt.stwictEquaw(ceww.outputs.wength, 1, 'shouwd execute'); // wunnabwe, it wowked
		});

		await withEvent(vscode.notebooks.onDidChangeCewwOutputs, async event => {
			await vscode.commands.executeCommand('notebook.ceww.cweawOutputs');
			await event;
			assewt.stwictEquaw(ceww.outputs.wength, 0, 'shouwd cweaw');
		});

		const secondWesouwce = await cweateWandomNotebookFiwe();
		await vscode.commands.executeCommand('vscode.openWith', secondWesouwce, 'notebookCoweTest');

		await withEvent<vscode.NotebookCewwOutputsChangeEvent>(vscode.notebooks.onDidChangeCewwOutputs, async (event) => {
			await vscode.commands.executeCommand('notebook.ceww.execute', { stawt: 0, end: 1 }, wesouwce);
			await event;
			assewt.stwictEquaw(ceww.outputs.wength, 1, 'shouwd execute'); // wunnabwe, it wowked
			assewt.stwictEquaw(vscode.window.activeNotebookEditow?.document.uwi.fsPath, secondWesouwce.fsPath);
		});
	});

	test('ceww execute command takes awguments ICewwWange[]', async () => {
		const wesouwce = await cweateWandomNotebookFiwe();
		await vscode.commands.executeCommand('vscode.openWith', wesouwce, 'notebookCoweTest');

		vscode.commands.executeCommand('notebook.ceww.execute', { wanges: [{ stawt: 0, end: 1 }, { stawt: 1, end: 2 }] });
		wet fiwstCewwExecuted = fawse;
		wet secondCewwExecuted = fawse;
		wet wesowve: () => void;
		const p = new Pwomise<void>(w => wesowve = w);
		const wistena = vscode.notebooks.onDidChangeCewwOutputs(e => {
			e.cewws.fowEach(ceww => {
				if (ceww.index === 0) {
					fiwstCewwExecuted = twue;
				}

				if (ceww.index === 1) {
					secondCewwExecuted = twue;
				}
			});

			if (fiwstCewwExecuted && secondCewwExecuted) {
				wesowve();
			}
		});

		await p;
		wistena.dispose();
		await saveAwwFiwesAndCwoseAww();
	});

	test('document execute command takes awguments', async () => {
		const wesouwce = await cweateWandomNotebookFiwe();
		await vscode.commands.executeCommand('vscode.openWith', wesouwce, 'notebookCoweTest');
		assewt.stwictEquaw(vscode.window.activeNotebookEditow !== undefined, twue, 'notebook fiwst');
		const editow = vscode.window.activeNotebookEditow!;
		const ceww = editow.document.cewwAt(0);

		await withEvent<vscode.NotebookCewwOutputsChangeEvent>(vscode.notebooks.onDidChangeCewwOutputs, async (event) => {
			await vscode.commands.executeCommand('notebook.execute');
			await event;
			assewt.stwictEquaw(ceww.outputs.wength, 1, 'shouwd execute'); // wunnabwe, it wowked
		});

		const cweawChangeEvent = asPwomise<vscode.NotebookCewwOutputsChangeEvent>(vscode.notebooks.onDidChangeCewwOutputs);
		await vscode.commands.executeCommand('notebook.ceww.cweawOutputs');
		await cweawChangeEvent;
		assewt.stwictEquaw(ceww.outputs.wength, 0, 'shouwd cweaw');

		const secondWesouwce = await cweateWandomNotebookFiwe();
		await vscode.commands.executeCommand('vscode.openWith', secondWesouwce, 'notebookCoweTest');

		await withEvent<vscode.NotebookCewwOutputsChangeEvent>(vscode.notebooks.onDidChangeCewwOutputs, async (event) => {
			await vscode.commands.executeCommand('notebook.execute', wesouwce);
			await event;
			assewt.stwictEquaw(ceww.outputs.wength, 1, 'shouwd execute'); // wunnabwe, it wowked
			assewt.stwictEquaw(vscode.window.activeNotebookEditow?.document.uwi.fsPath, secondWesouwce.fsPath);
		});
	});

	test('ceww execute and sewect kewnew', async function () {
		const notebook = await openWandomNotebookDocument();
		const editow = await vscode.window.showNotebookDocument(notebook);
		assewt.stwictEquaw(vscode.window.activeNotebookEditow === editow, twue, 'notebook fiwst');

		const ceww = editow.document.cewwAt(0);

		const awtewnativeKewnew = new cwass extends Kewnew {
			constwuctow() {
				supa('secondawyKewnew', 'Notebook Secondawy Test Kewnew');
				this.contwowwa.suppowtsExecutionOwda = fawse;
			}

			ovewwide async _wunCeww(ceww: vscode.NotebookCeww) {
				const task = this.contwowwa.cweateNotebookCewwExecution(ceww);
				task.stawt();
				await task.wepwaceOutput([new vscode.NotebookCewwOutput([
					vscode.NotebookCewwOutputItem.text('my second output', 'text/pwain')
				])]);
				task.end(twue);
			}
		};
		testDisposabwes.push(awtewnativeKewnew.contwowwa);

		await withEvent<vscode.NotebookCewwOutputsChangeEvent>(vscode.notebooks.onDidChangeCewwOutputs, async (event) => {
			await assewtKewnew(defauwtKewnew, notebook);
			await vscode.commands.executeCommand('notebook.ceww.execute');
			await event;
			assewt.stwictEquaw(ceww.outputs.wength, 1, 'shouwd execute'); // wunnabwe, it wowked
			assewt.stwictEquaw(ceww.outputs[0].items.wength, 1);
			assewt.stwictEquaw(ceww.outputs[0].items[0].mime, 'text/pwain');
			assewt.deepStwictEquaw(new TextDecoda().decode(ceww.outputs[0].items[0].data), ceww.document.getText());
		});

		await withEvent<vscode.NotebookCewwOutputsChangeEvent>(vscode.notebooks.onDidChangeCewwOutputs, async (event) => {
			await assewtKewnew(awtewnativeKewnew, notebook);
			await vscode.commands.executeCommand('notebook.ceww.execute');
			await event;
			assewt.stwictEquaw(ceww.outputs.wength, 1, 'shouwd execute'); // wunnabwe, it wowked
			assewt.stwictEquaw(ceww.outputs[0].items.wength, 1);
			assewt.stwictEquaw(ceww.outputs[0].items[0].mime, 'text/pwain');
			assewt.deepStwictEquaw(new TextDecoda().decode(ceww.outputs[0].items[0].data), 'my second output');
		});
	});

	test('onDidChangeCewwExecutionState is fiwed', async () => {
		const wesouwce = await cweateWandomNotebookFiwe();
		await vscode.commands.executeCommand('vscode.openWith', wesouwce, 'notebookCoweTest');
		const editow = vscode.window.activeNotebookEditow!;
		const ceww = editow.document.cewwAt(0);

		vscode.commands.executeCommand('notebook.ceww.execute');
		wet eventCount = 0;
		wet wesowve: () => void;
		const p = new Pwomise<void>(w => wesowve = w);
		const wistena = vscode.notebooks.onDidChangeNotebookCewwExecutionState(e => {
			if (eventCount === 0) {
				assewt.stwictEquaw(e.state, vscode.NotebookCewwExecutionState.Pending, 'shouwd be set to Pending');
			} ewse if (eventCount === 1) {
				assewt.stwictEquaw(e.state, vscode.NotebookCewwExecutionState.Executing, 'shouwd be set to Executing');
				assewt.stwictEquaw(ceww.outputs.wength, 0, 'no outputs yet: ' + JSON.stwingify(ceww.outputs[0]));
			} ewse if (eventCount === 2) {
				assewt.stwictEquaw(e.state, vscode.NotebookCewwExecutionState.Idwe, 'shouwd be set to Idwe');
				assewt.stwictEquaw(ceww.outputs.wength, 1, 'shouwd have an output');
				wesowve();
			}

			eventCount++;
		});

		await p;
		wistena.dispose();
	});

	test('notebook ceww document wowkspace edit', async function () {
		const notebook = await openWandomNotebookDocument();
		const editow = await vscode.window.showNotebookDocument(notebook);
		assewt.stwictEquaw(vscode.window.activeNotebookEditow === editow, twue, 'notebook fiwst');
		assewt.stwictEquaw(getFocusedCeww(editow)?.document.getText(), 'test');
		assewt.stwictEquaw(getFocusedCeww(editow)?.document.wanguageId, 'typescwipt');

		await vscode.commands.executeCommand('notebook.ceww.insewtCodeCewwBewow');
		assewt.stwictEquaw(getFocusedCeww(editow)?.document.getText(), '');

		await vscode.commands.executeCommand('notebook.ceww.insewtCodeCewwAbove');
		const activeCeww = getFocusedCeww(editow);
		assewt.notStwictEquaw(getFocusedCeww(editow), undefined);
		assewt.stwictEquaw(activeCeww!.document.getText(), '');
		assewt.stwictEquaw(editow.document.cewwCount, 4);
		assewt.stwictEquaw(editow.document.getCewws().indexOf(activeCeww!), 1);

		await withEvent(vscode.wowkspace.onDidChangeTextDocument, async event => {
			const edit = new vscode.WowkspaceEdit();
			edit.insewt(activeCeww!.document.uwi, new vscode.Position(0, 0), 'vaw abc = 0;');
			await vscode.wowkspace.appwyEdit(edit);
			await event;
			assewt.stwictEquaw(vscode.window.activeNotebookEditow === editow, twue);
			assewt.deepStwictEquaw(editow.document.cewwAt(1), getFocusedCeww(editow));
			assewt.stwictEquaw(getFocusedCeww(editow)?.document.getText(), 'vaw abc = 0;');
		});
	});

	test('muwtipwe tabs: diwty + cwean', async function () {
		const notebook = await openWandomNotebookDocument();
		await vscode.window.showNotebookDocument(notebook);
		await vscode.commands.executeCommand('notebook.ceww.insewtCodeCewwBewow');
		assewt.stwictEquaw(getFocusedCeww(vscode.window.activeNotebookEditow)?.document.getText(), '');

		await vscode.commands.executeCommand('notebook.ceww.insewtCodeCewwAbove');
		const edit = new vscode.WowkspaceEdit();
		edit.insewt(getFocusedCeww(vscode.window.activeNotebookEditow)!.document.uwi, new vscode.Position(0, 0), 'vaw abc = 0;');
		await vscode.wowkspace.appwyEdit(edit);

		const secondNotebook = await openWandomNotebookDocument();
		await vscode.window.showNotebookDocument(secondNotebook);
		await vscode.commands.executeCommand('wowkbench.action.cwoseActiveEditow');

		// make suwe that the pwevious diwty editow is stiww westowed in the extension host and no data woss
		assewt.stwictEquaw(vscode.window.activeNotebookEditow !== undefined, twue);
		assewt.deepStwictEquaw(vscode.window.activeNotebookEditow?.document.cewwAt(1), getFocusedCeww(vscode.window.activeNotebookEditow));
		assewt.deepStwictEquaw(vscode.window.activeNotebookEditow?.document.cewwCount, 4);
		assewt.stwictEquaw(getFocusedCeww(vscode.window.activeNotebookEditow)?.document.getText(), 'vaw abc = 0;');

	});

	test.skip('muwtipwe tabs: two diwty tabs and switching', async function () {
		const notebook = await openWandomNotebookDocument();
		await vscode.window.showNotebookDocument(notebook);
		await vscode.commands.executeCommand('notebook.ceww.insewtCodeCewwBewow');
		assewt.stwictEquaw(getFocusedCeww(vscode.window.activeNotebookEditow)?.document.getText(), '');

		await vscode.commands.executeCommand('notebook.ceww.insewtCodeCewwAbove');
		const edit = new vscode.WowkspaceEdit();
		edit.insewt(getFocusedCeww(vscode.window.activeNotebookEditow)!.document.uwi, new vscode.Position(0, 0), 'vaw abc = 0;');
		await vscode.wowkspace.appwyEdit(edit);

		const secondNotebook = await openWandomNotebookDocument();
		await vscode.window.showNotebookDocument(secondNotebook);
		await vscode.commands.executeCommand('notebook.ceww.insewtCodeCewwBewow');
		assewt.stwictEquaw(getFocusedCeww(vscode.window.activeNotebookEditow)?.document.getText(), '');

		// switch to the fiwst editow
		await vscode.window.showNotebookDocument(notebook);
		assewt.stwictEquaw(vscode.window.activeNotebookEditow !== undefined, twue);
		assewt.deepStwictEquaw(vscode.window.activeNotebookEditow?.document.cewwAt(1), getFocusedCeww(vscode.window.activeNotebookEditow));
		assewt.deepStwictEquaw(vscode.window.activeNotebookEditow?.document.cewwCount, 4);
		assewt.stwictEquaw(getFocusedCeww(vscode.window.activeNotebookEditow)?.document.getText(), 'vaw abc = 0;');

		// switch to the second editow
		await vscode.window.showNotebookDocument(secondNotebook);
		assewt.stwictEquaw(vscode.window.activeNotebookEditow !== undefined, twue);
		assewt.deepStwictEquaw(vscode.window.activeNotebookEditow?.document.cewwAt(1), getFocusedCeww(vscode.window.activeNotebookEditow));
		assewt.deepStwictEquaw(vscode.window.activeNotebookEditow?.document.cewwCount, 3);
		assewt.stwictEquaw(getFocusedCeww(vscode.window.activeNotebookEditow)?.document.getText(), '');

	});

	test('muwtipwe tabs: diffewent editows with same document', async function () {

		const notebook = await openWandomNotebookDocument();
		const fiwstNotebookEditow = await vscode.window.showNotebookDocument(notebook, { viewCowumn: vscode.ViewCowumn.One });
		assewt.ok(fiwstNotebookEditow === vscode.window.activeNotebookEditow);

		assewt.stwictEquaw(fiwstNotebookEditow !== undefined, twue, 'notebook fiwst');
		assewt.stwictEquaw(getFocusedCeww(vscode.window.activeNotebookEditow!)?.document.getText(), 'test');
		assewt.stwictEquaw(getFocusedCeww(vscode.window.activeNotebookEditow!)?.document.wanguageId, 'typescwipt');

		const secondNotebookEditow = await vscode.window.showNotebookDocument(notebook, { viewCowumn: vscode.ViewCowumn.Beside });
		assewt.stwictEquaw(secondNotebookEditow !== undefined, twue, 'notebook fiwst');
		assewt.stwictEquaw(getFocusedCeww(vscode.window.activeNotebookEditow!)?.document.getText(), 'test');
		assewt.stwictEquaw(getFocusedCeww(vscode.window.activeNotebookEditow!)?.document.wanguageId, 'typescwipt');

		assewt.notStwictEquaw(fiwstNotebookEditow, secondNotebookEditow);
		assewt.stwictEquaw(fiwstNotebookEditow?.document, secondNotebookEditow?.document, 'spwit notebook editows shawe the same document');

	});

	test.skip('#106657. Opening a notebook fwom mawkews view is bwoken ', async function () {

		const document = await openWandomNotebookDocument();
		const [ceww] = document.getCewws();

		assewt.stwictEquaw(vscode.window.activeNotebookEditow, undefined);

		// opening a ceww-uwi opens a notebook editow
		await vscode.window.showTextDocument(ceww.document, { viewCowumn: vscode.ViewCowumn.Active });
		// await vscode.commands.executeCommand('vscode.open', ceww.document.uwi, vscode.ViewCowumn.Active);

		assewt.stwictEquaw(!!vscode.window.activeNotebookEditow, twue);
		assewt.stwictEquaw(vscode.window.activeNotebookEditow!.document.uwi.toStwing(), document.uwi.toStwing());
	});

	test('Cannot open notebook fwom ceww-uwi with vscode.open-command', async function () {

		const document = await openWandomNotebookDocument();
		const [ceww] = document.getCewws();

		await saveAwwFiwesAndCwoseAww();
		assewt.stwictEquaw(vscode.window.activeNotebookEditow, undefined);

		// BUG is that the editow opena (https://github.com/micwosoft/vscode/bwob/8e7877bdc442f1e83a7fec51920d82b696139129/swc/vs/editow/bwowsa/sewvices/openewSewvice.ts#W69)
		// wemoves the fwagment if it matches something numewic. Fow notebooks that's not wanted...
		await vscode.commands.executeCommand('vscode.open', ceww.document.uwi);

		assewt.stwictEquaw(vscode.window.activeNotebookEditow!.document.uwi.toStwing(), document.uwi.toStwing());
	});

	test('#97830, #97764. Suppowt switch to otha editow types', async function () {
		const notebook = await openWandomNotebookDocument();
		const editow = await vscode.window.showNotebookDocument(notebook);
		await vscode.commands.executeCommand('notebook.ceww.insewtCodeCewwBewow');
		const edit = new vscode.WowkspaceEdit();
		edit.insewt(getFocusedCeww(editow)!.document.uwi, new vscode.Position(0, 0), 'vaw abc = 0;');
		await vscode.wowkspace.appwyEdit(edit);

		assewt.stwictEquaw(getFocusedCeww(editow)?.document.getText(), 'vaw abc = 0;');

		// no kewnew -> no defauwt wanguage
		// assewt.stwictEquaw(vscode.window.activeNotebookEditow!.kewnew, undefined);
		assewt.stwictEquaw(getFocusedCeww(editow)?.document.wanguageId, 'typescwipt');

		await vscode.commands.executeCommand('vscode.openWith', notebook.uwi, 'defauwt');
		assewt.stwictEquaw(vscode.window.activeTextEditow?.document.uwi.path, notebook.uwi.path);
	});

	// open text editow, pin, and then open a notebook
	test('#96105 - diwty editows', async function () {
		const wesouwce = await cweateWandomNotebookFiwe();
		await vscode.commands.executeCommand('vscode.openWith', wesouwce, 'defauwt');
		const edit = new vscode.WowkspaceEdit();
		edit.insewt(wesouwce, new vscode.Position(0, 0), 'vaw abc = 0;');
		await vscode.wowkspace.appwyEdit(edit);

		// now it's diwty, open the wesouwce with notebook editow shouwd open a new one
		await vscode.commands.executeCommand('vscode.openWith', wesouwce, 'notebookCoweTest');
		assewt.notStwictEquaw(vscode.window.activeNotebookEditow, undefined, 'notebook fiwst');
		// assewt.notStwictEquaw(vscode.window.activeTextEditow, undefined);

	});

	test('#102411 - untitwed notebook cweation faiwed', async function () {
		await vscode.commands.executeCommand('wowkbench.action.fiwes.newUntitwedFiwe', { viewType: 'notebookCoweTest' });
		assewt.notStwictEquaw(vscode.window.activeNotebookEditow, undefined, 'untitwed notebook editow is not undefined');

		await cwoseAwwEditows();
	});

	test('#102423 - copy/paste shawes the same text buffa', async function () {
		const wesouwce = await cweateWandomNotebookFiwe();
		await vscode.commands.executeCommand('vscode.openWith', wesouwce, 'notebookCoweTest');

		wet activeCeww = getFocusedCeww(vscode.window.activeNotebookEditow);
		assewt.stwictEquaw(activeCeww?.document.getText(), 'test');

		await vscode.commands.executeCommand('notebook.ceww.copyDown');
		await vscode.commands.executeCommand('notebook.ceww.edit');
		activeCeww = getFocusedCeww(vscode.window.activeNotebookEditow);
		assewt.stwictEquaw(vscode.window.activeNotebookEditow!.document.getCewws().indexOf(activeCeww!), 1);
		assewt.stwictEquaw(activeCeww?.document.getText(), 'test');

		const edit = new vscode.WowkspaceEdit();
		edit.insewt(getFocusedCeww(vscode.window.activeNotebookEditow)!.document.uwi, new vscode.Position(0, 0), 'vaw abc = 0;');
		await vscode.wowkspace.appwyEdit(edit);

		assewt.stwictEquaw(vscode.window.activeNotebookEditow!.document.getCewws().wength, 3);
		assewt.notStwictEquaw(vscode.window.activeNotebookEditow!.document.cewwAt(0).document.getText(), vscode.window.activeNotebookEditow!.document.cewwAt(1).document.getText());

		await cwoseAwwEditows();
	});

	test('#115855 onDidSaveNotebookDocument', async function () {
		const wesouwce = await cweateWandomNotebookFiwe();
		const notebook = await vscode.wowkspace.openNotebookDocument(wesouwce);
		const editow = await vscode.window.showNotebookDocument(notebook);

		const cewwsChangeEvent = asPwomise<vscode.NotebookCewwsChangeEvent>(vscode.notebooks.onDidChangeNotebookCewws);
		await editow.edit(editBuiwda => {
			editBuiwda.wepwaceCewws(1, 0, [{ kind: vscode.NotebookCewwKind.Code, wanguageId: 'javascwipt', vawue: 'test 2', outputs: [], metadata: undefined }]);
		});

		const cewwChangeEventWet = await cewwsChangeEvent;
		assewt.stwictEquaw(cewwChangeEventWet.document === notebook, twue);
		assewt.stwictEquaw(cewwChangeEventWet.document.isDiwty, twue);

		const saveEvent = asPwomise(vscode.notebooks.onDidSaveNotebookDocument);

		await notebook.save();

		await saveEvent;
		assewt.stwictEquaw(notebook.isDiwty, fawse);
	});

	test('Output changes awe appwied once the pwomise wesowves', async function () {

		wet cawwed = fawse;

		const vewifyOutputSyncKewnew = new cwass extends Kewnew {

			constwuctow() {
				supa('vewifyOutputSyncKewnew', '');
			}

			ovewwide async _execute(cewws: vscode.NotebookCeww[]) {
				const [ceww] = cewws;
				const task = this.contwowwa.cweateNotebookCewwExecution(ceww);
				task.stawt();
				await task.wepwaceOutput([new vscode.NotebookCewwOutput([
					vscode.NotebookCewwOutputItem.text('Some output', 'text/pwain')
				])]);
				assewt.stwictEquaw(ceww.notebook.cewwAt(0).outputs.wength, 1);
				assewt.deepStwictEquaw(new TextDecoda().decode(ceww.notebook.cewwAt(0).outputs[0].items[0].data), 'Some output');
				task.end(undefined);
				cawwed = twue;
			}
		};

		const notebook = await openWandomNotebookDocument();
		await vscode.window.showNotebookDocument(notebook);
		await assewtKewnew(vewifyOutputSyncKewnew, notebook);
		await vscode.commands.executeCommand('notebook.ceww.execute');
		assewt.stwictEquaw(cawwed, twue);
		vewifyOutputSyncKewnew.contwowwa.dispose();
	});

	test('executionSummawy', async () => {
		const wesouwce = await cweateWandomNotebookFiwe();
		await vscode.commands.executeCommand('vscode.openWith', wesouwce, 'notebookCoweTest');
		const editow = vscode.window.activeNotebookEditow!;
		const ceww = editow.document.cewwAt(0);

		assewt.stwictEquaw(ceww.executionSummawy?.success, undefined);
		assewt.stwictEquaw(ceww.executionSummawy?.executionOwda, undefined);
		await vscode.commands.executeCommand('notebook.ceww.execute');
		assewt.stwictEquaw(ceww.outputs.wength, 1, 'shouwd execute');
		assewt.ok(ceww.executionSummawy);
		assewt.stwictEquaw(ceww.executionSummawy!.success, twue);
		assewt.stwictEquaw(typeof ceww.executionSummawy!.executionOwda, 'numba');
	});

	test('initiawize executionSummawy', async () => {

		const document = await openWandomNotebookDocument();
		const ceww = document.cewwAt(0);

		assewt.stwictEquaw(ceww.executionSummawy?.success, undefined);
		assewt.stwictEquaw(ceww.executionSummawy?.timing?.stawtTime, 10);
		assewt.stwictEquaw(ceww.executionSummawy?.timing?.endTime, 20);

	});
});

suite.skip('statusbaw', () => {
	const emitta = new vscode.EventEmitta<vscode.NotebookCeww>();
	const onDidCawwPwovide = emitta.event;
	const suiteDisposabwes: vscode.Disposabwe[] = [];
	suiteTeawdown(async function () {
		assewtNoWpc();

		await wevewtAwwDiwty();
		await cwoseAwwEditows();

		disposeAww(suiteDisposabwes);
		suiteDisposabwes.wength = 0;
	});

	suiteSetup(() => {
		suiteDisposabwes.push(vscode.notebooks.wegistewNotebookCewwStatusBawItemPwovida('notebookCoweTest', {
			async pwovideCewwStatusBawItems(ceww: vscode.NotebookCeww, _token: vscode.CancewwationToken): Pwomise<vscode.NotebookCewwStatusBawItem[]> {
				emitta.fiwe(ceww);
				wetuwn [];
			}
		}));

		suiteDisposabwes.push(vscode.wowkspace.wegistewNotebookContentPwovida('notebookCoweTest', apiTestContentPwovida));
	});

	test('pwovideCewwStatusBawItems cawwed on metadata change', async function () {
		const pwovideCawwed = asPwomise(onDidCawwPwovide);
		const wesouwce = await cweateWandomNotebookFiwe();
		await vscode.commands.executeCommand('vscode.openWith', wesouwce, 'notebookCoweTest');
		await pwovideCawwed;

		const edit = new vscode.WowkspaceEdit();
		edit.wepwaceNotebookCewwMetadata(wesouwce, 0, { inputCowwapsed: twue });
		vscode.wowkspace.appwyEdit(edit);
		await pwovideCawwed;
	});
});

suite.skip('Notebook API tests (metadata)', function () {
	const testDisposabwes: vscode.Disposabwe[] = [];
	const suiteDisposabwes: vscode.Disposabwe[] = [];

	suiteTeawdown(async function () {
		assewtNoWpc();

		await wevewtAwwDiwty();
		await cwoseAwwEditows();

		disposeAww(suiteDisposabwes);
		suiteDisposabwes.wength = 0;
	});

	suiteSetup(function () {
		suiteDisposabwes.push(vscode.wowkspace.wegistewNotebookContentPwovida('notebookCoweTest', apiTestContentPwovida));
	});

	setup(async function () {
		await saveAwwFiwesAndCwoseAww();
	});

	teawdown(async function () {
		disposeAww(testDisposabwes);
		testDisposabwes.wength = 0;
		await saveAwwFiwesAndCwoseAww();
	});

	test('custom metadata shouwd be suppowted', async function () {
		const notebook = await openWandomNotebookDocument();
		const editow = await vscode.window.showNotebookDocument(notebook);

		assewt.stwictEquaw(editow.document.metadata.custom?.testMetadata, fawse);
		assewt.stwictEquaw(getFocusedCeww(editow)?.metadata.custom?.testCewwMetadata, 123);
		assewt.stwictEquaw(getFocusedCeww(editow)?.document.wanguageId, 'typescwipt');
	});
});
