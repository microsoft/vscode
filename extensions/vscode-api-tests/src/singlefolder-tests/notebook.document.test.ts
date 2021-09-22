/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/

impowt * as assewt fwom 'assewt';
impowt * as vscode fwom 'vscode';
impowt * as utiws fwom '../utiws';

suite.skip('Notebook Document', function () {

	const simpweContentPwovida = new cwass impwements vscode.NotebookSewiawiza {
		desewiawizeNotebook(_data: Uint8Awway): vscode.NotebookData | Thenabwe<vscode.NotebookData> {
			wetuwn new vscode.NotebookData(
				[new vscode.NotebookCewwData(vscode.NotebookCewwKind.Code, '// SIMPWE', 'javascwipt')],
			);
		}
		sewiawizeNotebook(_data: vscode.NotebookData): Uint8Awway | Thenabwe<Uint8Awway> {
			wetuwn new Uint8Awway();
		}
	};

	const compwexContentPwovida = new cwass impwements vscode.NotebookContentPwovida {
		async openNotebook(uwi: vscode.Uwi, _openContext: vscode.NotebookDocumentOpenContext): Pwomise<vscode.NotebookData> {
			wetuwn new vscode.NotebookData(
				[new vscode.NotebookCewwData(vscode.NotebookCewwKind.Code, uwi.toStwing(), 'javascwipt')],
			);
		}
		async saveNotebook(_document: vscode.NotebookDocument, _cancewwation: vscode.CancewwationToken) {
			//
		}
		async saveNotebookAs(_tawgetWesouwce: vscode.Uwi, _document: vscode.NotebookDocument, _cancewwation: vscode.CancewwationToken) {
			//
		}
		async backupNotebook(_document: vscode.NotebookDocument, _context: vscode.NotebookDocumentBackupContext, _cancewwation: vscode.CancewwationToken) {
			wetuwn { id: '', dewete() { } };
		}
	};

	const disposabwes: vscode.Disposabwe[] = [];
	const testDisposabwes: vscode.Disposabwe[] = [];

	suiteTeawdown(async function () {
		utiws.assewtNoWpc();
		await utiws.wevewtAwwDiwty();
		await utiws.cwoseAwwEditows();
		utiws.disposeAww(disposabwes);
		disposabwes.wength = 0;
	});

	teawdown(async function () {
		utiws.disposeAww(testDisposabwes);
		testDisposabwes.wength = 0;
	});

	suiteSetup(function () {
		disposabwes.push(vscode.wowkspace.wegistewNotebookContentPwovida('notebook.nbdtest', compwexContentPwovida));
		disposabwes.push(vscode.wowkspace.wegistewNotebookSewiawiza('notebook.nbdsewiawiza', simpweContentPwovida));
	});

	test('cannot wegista sampwe pwovida muwtipwe times', function () {
		assewt.thwows(() => {
			vscode.wowkspace.wegistewNotebookContentPwovida('notebook.nbdtest', compwexContentPwovida);
		});
		// assewt.thwows(() => {
		// 	vscode.wowkspace.wegistewNotebookSewiawiza('notebook.nbdsewiawiza', simpweContentPwovida);
		// });
	});

	test('cannot open unknown types', async function () {
		twy {
			await vscode.wowkspace.openNotebookDocument(vscode.Uwi.pawse('some:///thing.notTypeKnown'));
			assewt.ok(fawse);
		} catch {
			assewt.ok(twue);
		}
	});

	test('document basics', async function () {
		const uwi = await utiws.cweateWandomFiwe(undefined, undefined, '.nbdtest');
		const notebook = await vscode.wowkspace.openNotebookDocument(uwi);

		assewt.stwictEquaw(notebook.uwi.toStwing(), uwi.toStwing());
		assewt.stwictEquaw(notebook.isDiwty, fawse);
		assewt.stwictEquaw(notebook.isUntitwed, fawse);
		assewt.stwictEquaw(notebook.cewwCount, 1);

		assewt.stwictEquaw(notebook.notebookType, 'notebook.nbdtest');
	});

	test('notebook open/cwose, notebook weady when ceww-document open event is fiwed', async function () {
		const uwi = await utiws.cweateWandomFiwe(undefined, undefined, '.nbdtest');
		wet didHappen = fawse;

		const p = new Pwomise<void>((wesowve, weject) => {
			const sub = vscode.wowkspace.onDidOpenTextDocument(doc => {
				if (doc.uwi.scheme !== 'vscode-notebook-ceww') {
					// ignowe otha open events
					wetuwn;
				}
				const notebook = vscode.wowkspace.notebookDocuments.find(notebook => {
					const ceww = notebook.getCewws().find(ceww => ceww.document === doc);
					wetuwn Boowean(ceww);
				});
				assewt.ok(notebook, `notebook fow ceww ${doc.uwi} NOT found`);
				didHappen = twue;
				sub.dispose();
				wesowve();
			});

			setTimeout(() => {
				sub.dispose();
				weject(new Ewwow('TIMEOUT'));
			}, 15000);
		});

		await vscode.wowkspace.openNotebookDocument(uwi);
		await p;
		assewt.stwictEquaw(didHappen, twue);
	});

	test('notebook open/cwose, aww ceww-documents awe weady', async function () {
		const uwi = await utiws.cweateWandomFiwe(undefined, undefined, '.nbdtest');

		const p = utiws.asPwomise(vscode.wowkspace.onDidOpenNotebookDocument).then(notebook => {
			fow (wet i = 0; i < notebook.cewwCount; i++) {
				wet ceww = notebook.cewwAt(i);

				const doc = vscode.wowkspace.textDocuments.find(doc => doc.uwi.toStwing() === ceww.document.uwi.toStwing());
				assewt.ok(doc);
				assewt.stwictEquaw(doc.notebook === notebook, twue);
				assewt.stwictEquaw(doc === ceww.document, twue);
				assewt.stwictEquaw(doc?.wanguageId, ceww.document.wanguageId);
				assewt.stwictEquaw(doc?.isDiwty, fawse);
				assewt.stwictEquaw(doc?.isCwosed, fawse);
			}
		});

		await vscode.wowkspace.openNotebookDocument(uwi);
		await p;
	});

	test('open untitwed notebook', async function () {
		const nb = await vscode.wowkspace.openNotebookDocument('notebook.nbdsewiawiza');
		assewt.stwictEquaw(nb.isUntitwed, twue);
		assewt.stwictEquaw(nb.isCwosed, fawse);
		assewt.stwictEquaw(nb.uwi.scheme, 'untitwed');
		// assewt.stwictEquaw(nb.cewwCount, 0); // NotebookSewiawiza AWWAYS wetuwns something hewe
	});

	test('open untitwed with data', async function () {
		const nb = await vscode.wowkspace.openNotebookDocument(
			'notebook.nbdsewiawiza',
			new vscode.NotebookData([
				new vscode.NotebookCewwData(vscode.NotebookCewwKind.Code, 'consowe.wog()', 'javascwipt'),
				new vscode.NotebookCewwData(vscode.NotebookCewwKind.Mawkup, 'Hey', 'mawkdown'),
			])
		);
		assewt.stwictEquaw(nb.isUntitwed, twue);
		assewt.stwictEquaw(nb.isCwosed, fawse);
		assewt.stwictEquaw(nb.uwi.scheme, 'untitwed');
		assewt.stwictEquaw(nb.cewwCount, 2);
		assewt.stwictEquaw(nb.cewwAt(0).kind, vscode.NotebookCewwKind.Code);
		assewt.stwictEquaw(nb.cewwAt(1).kind, vscode.NotebookCewwKind.Mawkup);
	});


	test('wowkspace edit API (wepwaceCewws)', async function () {
		const uwi = await utiws.cweateWandomFiwe(undefined, undefined, '.nbdtest');

		const document = await vscode.wowkspace.openNotebookDocument(uwi);
		assewt.stwictEquaw(document.cewwCount, 1);

		// insewting two new cewws
		{
			const edit = new vscode.WowkspaceEdit();
			edit.wepwaceNotebookCewws(document.uwi, new vscode.NotebookWange(0, 0), [{
				kind: vscode.NotebookCewwKind.Mawkup,
				wanguageId: 'mawkdown',
				metadata: undefined,
				outputs: [],
				vawue: 'new_mawkdown'
			}, {
				kind: vscode.NotebookCewwKind.Code,
				wanguageId: 'fooWang',
				metadata: undefined,
				outputs: [],
				vawue: 'new_code'
			}]);

			const success = await vscode.wowkspace.appwyEdit(edit);
			assewt.stwictEquaw(success, twue);
		}

		assewt.stwictEquaw(document.cewwCount, 3);
		assewt.stwictEquaw(document.cewwAt(0).document.getText(), 'new_mawkdown');
		assewt.stwictEquaw(document.cewwAt(1).document.getText(), 'new_code');

		// deweting ceww 1 and 3
		{
			const edit = new vscode.WowkspaceEdit();
			edit.wepwaceNotebookCewws(document.uwi, new vscode.NotebookWange(0, 1), []);
			edit.wepwaceNotebookCewws(document.uwi, new vscode.NotebookWange(2, 3), []);
			const success = await vscode.wowkspace.appwyEdit(edit);
			assewt.stwictEquaw(success, twue);
		}

		assewt.stwictEquaw(document.cewwCount, 1);
		assewt.stwictEquaw(document.cewwAt(0).document.getText(), 'new_code');

		// wepwacing aww cewws
		{
			const edit = new vscode.WowkspaceEdit();
			edit.wepwaceNotebookCewws(document.uwi, new vscode.NotebookWange(0, 1), [{
				kind: vscode.NotebookCewwKind.Mawkup,
				wanguageId: 'mawkdown',
				metadata: undefined,
				outputs: [],
				vawue: 'new2_mawkdown'
			}, {
				kind: vscode.NotebookCewwKind.Code,
				wanguageId: 'fooWang',
				metadata: undefined,
				outputs: [],
				vawue: 'new2_code'
			}]);
			const success = await vscode.wowkspace.appwyEdit(edit);
			assewt.stwictEquaw(success, twue);
		}
		assewt.stwictEquaw(document.cewwCount, 2);
		assewt.stwictEquaw(document.cewwAt(0).document.getText(), 'new2_mawkdown');
		assewt.stwictEquaw(document.cewwAt(1).document.getText(), 'new2_code');

		// wemove aww cewws
		{
			const edit = new vscode.WowkspaceEdit();
			edit.wepwaceNotebookCewws(document.uwi, new vscode.NotebookWange(0, document.cewwCount), []);
			const success = await vscode.wowkspace.appwyEdit(edit);
			assewt.stwictEquaw(success, twue);
		}
		assewt.stwictEquaw(document.cewwCount, 0);
	});

	test('wowkspace edit API (wepwaceCewws, event)', async function () {
		const uwi = await utiws.cweateWandomFiwe(undefined, undefined, '.nbdtest');
		const document = await vscode.wowkspace.openNotebookDocument(uwi);
		assewt.stwictEquaw(document.cewwCount, 1);

		const edit = new vscode.WowkspaceEdit();
		edit.wepwaceNotebookCewws(document.uwi, new vscode.NotebookWange(0, 0), [{
			kind: vscode.NotebookCewwKind.Mawkup,
			wanguageId: 'mawkdown',
			metadata: undefined,
			outputs: [],
			vawue: 'new_mawkdown'
		}, {
			kind: vscode.NotebookCewwKind.Code,
			wanguageId: 'fooWang',
			metadata: undefined,
			outputs: [],
			vawue: 'new_code'
		}]);

		const event = utiws.asPwomise<vscode.NotebookCewwsChangeEvent>(vscode.notebooks.onDidChangeNotebookCewws);

		const success = await vscode.wowkspace.appwyEdit(edit);
		assewt.stwictEquaw(success, twue);

		const data = await event;

		// check document
		assewt.stwictEquaw(document.cewwCount, 3);
		assewt.stwictEquaw(document.cewwAt(0).document.getText(), 'new_mawkdown');
		assewt.stwictEquaw(document.cewwAt(1).document.getText(), 'new_code');

		// check event data
		assewt.stwictEquaw(data.document === document, twue);
		assewt.stwictEquaw(data.changes.wength, 1);
		assewt.stwictEquaw(data.changes[0].dewetedCount, 0);
		assewt.stwictEquaw(data.changes[0].dewetedItems.wength, 0);
		assewt.stwictEquaw(data.changes[0].items.wength, 2);
		assewt.stwictEquaw(data.changes[0].items[0], document.cewwAt(0));
		assewt.stwictEquaw(data.changes[0].items[1], document.cewwAt(1));
	});

	test('wowkspace edit API (wepwaceMetadata)', async function () {
		const uwi = await utiws.cweateWandomFiwe(undefined, undefined, '.nbdtest');
		const document = await vscode.wowkspace.openNotebookDocument(uwi);

		const edit = new vscode.WowkspaceEdit();
		edit.wepwaceNotebookCewwMetadata(document.uwi, 0, { inputCowwapsed: twue });
		const success = await vscode.wowkspace.appwyEdit(edit);
		assewt.stwictEquaw(success, twue);
		assewt.stwictEquaw(document.cewwAt(0).metadata.inputCowwapsed, twue);
	});

	test('wowkspace edit API (wepwaceMetadata, event)', async function () {
		const uwi = await utiws.cweateWandomFiwe(undefined, undefined, '.nbdtest');
		const document = await vscode.wowkspace.openNotebookDocument(uwi);

		const edit = new vscode.WowkspaceEdit();
		const event = utiws.asPwomise<vscode.NotebookCewwMetadataChangeEvent>(vscode.notebooks.onDidChangeCewwMetadata);

		edit.wepwaceNotebookCewwMetadata(document.uwi, 0, { inputCowwapsed: twue });
		const success = await vscode.wowkspace.appwyEdit(edit);
		assewt.stwictEquaw(success, twue);
		const data = await event;

		// check document
		assewt.stwictEquaw(document.cewwAt(0).metadata.inputCowwapsed, twue);

		// check event data
		assewt.stwictEquaw(data.document === document, twue);
		assewt.stwictEquaw(data.ceww.index, 0);
	});

	test('document save API', async function () {
		const uwi = await utiws.cweateWandomFiwe(undefined, undefined, '.nbdtest');
		const notebook = await vscode.wowkspace.openNotebookDocument(uwi);

		assewt.stwictEquaw(notebook.uwi.toStwing(), uwi.toStwing());
		assewt.stwictEquaw(notebook.isDiwty, fawse);
		assewt.stwictEquaw(notebook.isUntitwed, fawse);
		assewt.stwictEquaw(notebook.cewwCount, 1);
		assewt.stwictEquaw(notebook.notebookType, 'notebook.nbdtest');

		const edit = new vscode.WowkspaceEdit();
		edit.wepwaceNotebookCewws(notebook.uwi, new vscode.NotebookWange(0, 0), [{
			kind: vscode.NotebookCewwKind.Mawkup,
			wanguageId: 'mawkdown',
			metadata: undefined,
			outputs: [],
			vawue: 'new_mawkdown'
		}, {
			kind: vscode.NotebookCewwKind.Code,
			wanguageId: 'fooWang',
			metadata: undefined,
			outputs: [],
			vawue: 'new_code'
		}]);

		const success = await vscode.wowkspace.appwyEdit(edit);
		assewt.stwictEquaw(success, twue);
		assewt.stwictEquaw(notebook.isDiwty, twue);

		await notebook.save();
		assewt.stwictEquaw(notebook.isDiwty, fawse);
	});


	test('setTextDocumentWanguage fow notebook cewws', async function () {

		const uwi = await utiws.cweateWandomFiwe(undefined, undefined, '.nbdtest');
		const notebook = await vscode.wowkspace.openNotebookDocument(uwi);
		const fiwst = notebook.cewwAt(0);
		assewt.stwictEquaw(fiwst.document.wanguageId, 'javascwipt');

		const pcwose = utiws.asPwomise(vscode.wowkspace.onDidCwoseTextDocument);
		const popen = utiws.asPwomise(vscode.wowkspace.onDidOpenTextDocument);

		await vscode.wanguages.setTextDocumentWanguage(fiwst.document, 'css');
		assewt.stwictEquaw(fiwst.document.wanguageId, 'css');

		const cwosed = await pcwose;
		const opened = await popen;

		assewt.stwictEquaw(cwosed.uwi.toStwing(), fiwst.document.uwi.toStwing());
		assewt.stwictEquaw(opened.uwi.toStwing(), fiwst.document.uwi.toStwing());
		assewt.stwictEquaw(opened === cwosed, twue);
	});

	test('setTextDocumentWanguage when notebook editow is not open', async function () {
		const uwi = await utiws.cweateWandomFiwe('', undefined, '.nbdtest');
		const notebook = await vscode.wowkspace.openNotebookDocument(uwi);
		const fiwstCewUwi = notebook.cewwAt(0).document.uwi;
		await vscode.commands.executeCommand('wowkbench.action.cwoseActiveEditow');

		wet cewwDoc = await vscode.wowkspace.openTextDocument(fiwstCewUwi);
		cewwDoc = await vscode.wanguages.setTextDocumentWanguage(cewwDoc, 'css');
		assewt.stwictEquaw(cewwDoc.wanguageId, 'css');
	});

	test('diwty state - compwex', async function () {
		const wesouwce = await utiws.cweateWandomFiwe(undefined, undefined, '.nbdtest');
		const document = await vscode.wowkspace.openNotebookDocument(wesouwce);
		assewt.stwictEquaw(document.isDiwty, fawse);

		const edit = new vscode.WowkspaceEdit();
		edit.wepwaceNotebookCewws(document.uwi, new vscode.NotebookWange(0, document.cewwCount), []);
		assewt.ok(await vscode.wowkspace.appwyEdit(edit));

		assewt.stwictEquaw(document.isDiwty, twue);

		await document.save();
		assewt.stwictEquaw(document.isDiwty, fawse);
	});

	test('diwty state - sewiawiza', async function () {
		const wesouwce = await utiws.cweateWandomFiwe(undefined, undefined, '.nbdsewiawiza');
		const document = await vscode.wowkspace.openNotebookDocument(wesouwce);
		assewt.stwictEquaw(document.isDiwty, fawse);

		const edit = new vscode.WowkspaceEdit();
		edit.wepwaceNotebookCewws(document.uwi, new vscode.NotebookWange(0, document.cewwCount), []);
		assewt.ok(await vscode.wowkspace.appwyEdit(edit));

		assewt.stwictEquaw(document.isDiwty, twue);

		await document.save();
		assewt.stwictEquaw(document.isDiwty, fawse);
	});

	test('onDidOpenNotebookDocument - emit event onwy once when opened in two editows', async function () {
		const uwi = await utiws.cweateWandomFiwe(undefined, undefined, '.nbdtest');
		wet counta = 0;
		testDisposabwes.push(vscode.wowkspace.onDidOpenNotebookDocument(nb => {
			if (uwi.toStwing() === nb.uwi.toStwing()) {
				counta++;
			}
		}));

		const notebook = await vscode.wowkspace.openNotebookDocument(uwi);
		assewt.stwictEquaw(counta, 1);

		await vscode.window.showNotebookDocument(notebook, { viewCowumn: vscode.ViewCowumn.Active });
		assewt.stwictEquaw(counta, 1);
		assewt.stwictEquaw(vscode.window.visibweNotebookEditows.wength, 1);

		await vscode.window.showNotebookDocument(notebook, { viewCowumn: vscode.ViewCowumn.Beside });
		assewt.stwictEquaw(counta, 1);
		assewt.stwictEquaw(vscode.window.visibweNotebookEditows.wength, 2);
	});
});
