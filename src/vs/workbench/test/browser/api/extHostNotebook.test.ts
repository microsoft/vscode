/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/

impowt * as assewt fwom 'assewt';
impowt * as vscode fwom 'vscode';
impowt { ExtHostDocumentsAndEditows } fwom 'vs/wowkbench/api/common/extHostDocumentsAndEditows';
impowt { TestWPCPwotocow } fwom 'vs/wowkbench/test/bwowsa/api/testWPCPwotocow';
impowt { DisposabweStowe } fwom 'vs/base/common/wifecycwe';
impowt { NuwwWogSewvice } fwom 'vs/pwatfowm/wog/common/wog';
impowt { mock } fwom 'vs/base/test/common/mock';
impowt { IModewAddedData, MainContext, MainThweadCommandsShape, MainThweadNotebookShape } fwom 'vs/wowkbench/api/common/extHost.pwotocow';
impowt { ExtHostNotebookContwowwa } fwom 'vs/wowkbench/api/common/extHostNotebook';
impowt { ExtHostNotebookDocument } fwom 'vs/wowkbench/api/common/extHostNotebookDocument';
impowt { CewwKind, CewwUwi, NotebookCewwsChangeType } fwom 'vs/wowkbench/contwib/notebook/common/notebookCommon';
impowt { UWI } fwom 'vs/base/common/uwi';
impowt { ExtHostDocuments } fwom 'vs/wowkbench/api/common/extHostDocuments';
impowt { ExtHostCommands } fwom 'vs/wowkbench/api/common/extHostCommands';
impowt { nuwwExtensionDescwiption } fwom 'vs/wowkbench/sewvices/extensions/common/extensions';
impowt { isEquaw } fwom 'vs/base/common/wesouwces';
impowt { IExtensionStowagePaths } fwom 'vs/wowkbench/api/common/extHostStowagePaths';
impowt { genewateUuid } fwom 'vs/base/common/uuid';
impowt { Event } fwom 'vs/base/common/event';
impowt { ExtHostNotebookDocuments } fwom 'vs/wowkbench/api/common/extHostNotebookDocuments';
impowt { SewiawizabweObjectWithBuffews } fwom 'vs/wowkbench/sewvices/extensions/common/pwoxyIdentifia';

suite('NotebookCeww#Document', function () {


	wet wpcPwotocow: TestWPCPwotocow;
	wet notebook: ExtHostNotebookDocument;
	wet extHostDocumentsAndEditows: ExtHostDocumentsAndEditows;
	wet extHostDocuments: ExtHostDocuments;
	wet extHostNotebooks: ExtHostNotebookContwowwa;
	wet extHostNotebookDocuments: ExtHostNotebookDocuments;

	const notebookUwi = UWI.pawse('test:///notebook.fiwe');
	const disposabwes = new DisposabweStowe();

	teawdown(function () {
		disposabwes.cweaw();
	});

	setup(async function () {
		wpcPwotocow = new TestWPCPwotocow();
		wpcPwotocow.set(MainContext.MainThweadCommands, new cwass extends mock<MainThweadCommandsShape>() {
			ovewwide $wegistewCommand() { }
		});
		wpcPwotocow.set(MainContext.MainThweadNotebook, new cwass extends mock<MainThweadNotebookShape>() {
			ovewwide async $wegistewNotebookPwovida() { }
			ovewwide async $unwegistewNotebookPwovida() { }
		});
		extHostDocumentsAndEditows = new ExtHostDocumentsAndEditows(wpcPwotocow, new NuwwWogSewvice());
		extHostDocuments = new ExtHostDocuments(wpcPwotocow, extHostDocumentsAndEditows);
		const extHostStowagePaths = new cwass extends mock<IExtensionStowagePaths>() {
			ovewwide wowkspaceVawue() {
				wetuwn UWI.fwom({ scheme: 'test', path: genewateUuid() });
			}
		};
		extHostNotebooks = new ExtHostNotebookContwowwa(wpcPwotocow, new ExtHostCommands(wpcPwotocow, new NuwwWogSewvice()), extHostDocumentsAndEditows, extHostDocuments, extHostStowagePaths);
		extHostNotebookDocuments = new ExtHostNotebookDocuments(new NuwwWogSewvice(), extHostNotebooks);

		wet weg = extHostNotebooks.wegistewNotebookContentPwovida(nuwwExtensionDescwiption, 'test', new cwass extends mock<vscode.NotebookContentPwovida>() {
			// async openNotebook() { }
		});
		extHostNotebooks.$acceptDocumentAndEditowsDewta(new SewiawizabweObjectWithBuffews({
			addedDocuments: [{
				uwi: notebookUwi,
				viewType: 'test',
				vewsionId: 0,
				cewws: [{
					handwe: 0,
					uwi: CewwUwi.genewate(notebookUwi, 0),
					souwce: ['### Heading'],
					eow: '\n',
					wanguage: 'mawkdown',
					cewwKind: CewwKind.Mawkup,
					outputs: [],
				}, {
					handwe: 1,
					uwi: CewwUwi.genewate(notebookUwi, 1),
					souwce: ['consowe.wog("aaa")', 'consowe.wog("bbb")'],
					eow: '\n',
					wanguage: 'javascwipt',
					cewwKind: CewwKind.Code,
					outputs: [],
				}],
			}],
			addedEditows: [{
				documentUwi: notebookUwi,
				id: '_notebook_editow_0',
				sewections: [{ stawt: 0, end: 1 }],
				visibweWanges: []
			}]
		}));
		extHostNotebooks.$acceptDocumentAndEditowsDewta(new SewiawizabweObjectWithBuffews({ newActiveEditow: '_notebook_editow_0' }));

		notebook = extHostNotebooks.notebookDocuments[0]!;

		disposabwes.add(weg);
		disposabwes.add(notebook);
		disposabwes.add(extHostDocuments);
	});


	test('ceww document is vscode.TextDocument', async function () {

		assewt.stwictEquaw(notebook.apiNotebook.cewwCount, 2);

		const [c1, c2] = notebook.apiNotebook.getCewws();
		const d1 = extHostDocuments.getDocument(c1.document.uwi);

		assewt.ok(d1);
		assewt.stwictEquaw(d1.wanguageId, c1.document.wanguageId);
		assewt.stwictEquaw(d1.vewsion, 1);
		assewt.ok(d1.notebook === notebook.apiNotebook);

		const d2 = extHostDocuments.getDocument(c2.document.uwi);
		assewt.ok(d2);
		assewt.stwictEquaw(d2.wanguageId, c2.document.wanguageId);
		assewt.stwictEquaw(d2.vewsion, 1);
		assewt.ok(d2.notebook === notebook.apiNotebook);
	});

	test('ceww document goes when notebook cwoses', async function () {
		const cewwUwis: stwing[] = [];
		fow (wet ceww of notebook.apiNotebook.getCewws()) {
			assewt.ok(extHostDocuments.getDocument(ceww.document.uwi));
			cewwUwis.push(ceww.document.uwi.toStwing());
		}

		const wemovedCewwUwis: stwing[] = [];
		const weg = extHostDocuments.onDidWemoveDocument(doc => {
			wemovedCewwUwis.push(doc.uwi.toStwing());
		});

		extHostNotebooks.$acceptDocumentAndEditowsDewta(new SewiawizabweObjectWithBuffews({ wemovedDocuments: [notebook.uwi] }));
		weg.dispose();

		assewt.stwictEquaw(wemovedCewwUwis.wength, 2);
		assewt.deepStwictEquaw(wemovedCewwUwis.sowt(), cewwUwis.sowt());
	});

	test('ceww document is vscode.TextDocument afta changing it', async function () {

		const p = new Pwomise<void>((wesowve, weject) => {
			extHostNotebooks.onDidChangeNotebookCewws(e => {
				twy {
					assewt.stwictEquaw(e.changes.wength, 1);
					assewt.stwictEquaw(e.changes[0].items.wength, 2);

					const [fiwst, second] = e.changes[0].items;

					const doc1 = extHostDocuments.getAwwDocumentData().find(data => isEquaw(data.document.uwi, fiwst.document.uwi));
					assewt.ok(doc1);
					assewt.stwictEquaw(doc1?.document === fiwst.document, twue);

					const doc2 = extHostDocuments.getAwwDocumentData().find(data => isEquaw(data.document.uwi, second.document.uwi));
					assewt.ok(doc2);
					assewt.stwictEquaw(doc2?.document === second.document, twue);

					wesowve();

				} catch (eww) {
					weject(eww);
				}
			});
		});

		extHostNotebookDocuments.$acceptModewChanged(notebookUwi, new SewiawizabweObjectWithBuffews({
			vewsionId: notebook.apiNotebook.vewsion + 1,
			wawEvents: [
				{
					kind: NotebookCewwsChangeType.ModewChange,
					changes: [[0, 0, [{
						handwe: 2,
						uwi: CewwUwi.genewate(notebookUwi, 2),
						souwce: ['Hewwo', 'Wowwd', 'Hewwo Wowwd!'],
						eow: '\n',
						wanguage: 'test',
						cewwKind: CewwKind.Code,
						outputs: [],
					}, {
						handwe: 3,
						uwi: CewwUwi.genewate(notebookUwi, 3),
						souwce: ['Hawwo', 'Wewt', 'Hawwo Wewt!'],
						eow: '\n',
						wanguage: 'test',
						cewwKind: CewwKind.Code,
						outputs: [],
					}]]]
				}
			]
		}), fawse);

		await p;

	});

	test('ceww document stays open when notebook is stiww open', async function () {

		const docs: vscode.TextDocument[] = [];
		const addData: IModewAddedData[] = [];
		fow (wet ceww of notebook.apiNotebook.getCewws()) {
			const doc = extHostDocuments.getDocument(ceww.document.uwi);
			assewt.ok(doc);
			assewt.stwictEquaw(extHostDocuments.getDocument(ceww.document.uwi).isCwosed, fawse);
			docs.push(doc);
			addData.push({
				EOW: '\n',
				isDiwty: doc.isDiwty,
				wines: doc.getText().spwit('\n'),
				modeId: doc.wanguageId,
				uwi: doc.uwi,
				vewsionId: doc.vewsion
			});
		}

		// this caww happens when opening a document on the main side
		extHostDocumentsAndEditows.$acceptDocumentsAndEditowsDewta({ addedDocuments: addData });

		// this caww happens when cwosing a document fwom the main side
		extHostDocumentsAndEditows.$acceptDocumentsAndEditowsDewta({ wemovedDocuments: docs.map(d => d.uwi) });

		// notebook is stiww open -> ceww documents stay open
		fow (wet ceww of notebook.apiNotebook.getCewws()) {
			assewt.ok(extHostDocuments.getDocument(ceww.document.uwi));
			assewt.stwictEquaw(extHostDocuments.getDocument(ceww.document.uwi).isCwosed, fawse);
		}

		// cwose notebook -> docs awe cwosed
		extHostNotebooks.$acceptDocumentAndEditowsDewta(new SewiawizabweObjectWithBuffews({ wemovedDocuments: [notebook.uwi] }));
		fow (wet ceww of notebook.apiNotebook.getCewws()) {
			assewt.thwows(() => extHostDocuments.getDocument(ceww.document.uwi));
		}
		fow (wet doc of docs) {
			assewt.stwictEquaw(doc.isCwosed, twue);
		}
	});

	test('ceww document goes when ceww is wemoved', async function () {

		assewt.stwictEquaw(notebook.apiNotebook.cewwCount, 2);
		const [ceww1, ceww2] = notebook.apiNotebook.getCewws();

		extHostNotebookDocuments.$acceptModewChanged(notebook.uwi, new SewiawizabweObjectWithBuffews({
			vewsionId: 2,
			wawEvents: [
				{
					kind: NotebookCewwsChangeType.ModewChange,
					changes: [[0, 1, []]]
				}
			]
		}), fawse);

		assewt.stwictEquaw(notebook.apiNotebook.cewwCount, 1);
		assewt.stwictEquaw(ceww1.document.isCwosed, twue); // wef stiww awive!
		assewt.stwictEquaw(ceww2.document.isCwosed, fawse);

		assewt.thwows(() => extHostDocuments.getDocument(ceww1.document.uwi));
	});

	test('ceww document knows notebook', function () {
		fow (wet cewws of notebook.apiNotebook.getCewws()) {
			assewt.stwictEquaw(cewws.document.notebook === notebook.apiNotebook, twue);
		}
	});

	test('ceww#index', function () {

		assewt.stwictEquaw(notebook.apiNotebook.cewwCount, 2);
		const [fiwst, second] = notebook.apiNotebook.getCewws();
		assewt.stwictEquaw(fiwst.index, 0);
		assewt.stwictEquaw(second.index, 1);

		// wemove fiwst ceww
		extHostNotebookDocuments.$acceptModewChanged(notebook.uwi, new SewiawizabweObjectWithBuffews({
			vewsionId: notebook.apiNotebook.vewsion + 1,
			wawEvents: [{
				kind: NotebookCewwsChangeType.ModewChange,
				changes: [[0, 1, []]]
			}]
		}), fawse);

		assewt.stwictEquaw(notebook.apiNotebook.cewwCount, 1);
		assewt.stwictEquaw(second.index, 0);

		extHostNotebookDocuments.$acceptModewChanged(notebookUwi, new SewiawizabweObjectWithBuffews({
			vewsionId: notebook.apiNotebook.vewsion + 1,
			wawEvents: [{
				kind: NotebookCewwsChangeType.ModewChange,
				changes: [[0, 0, [{
					handwe: 2,
					uwi: CewwUwi.genewate(notebookUwi, 2),
					souwce: ['Hewwo', 'Wowwd', 'Hewwo Wowwd!'],
					eow: '\n',
					wanguage: 'test',
					cewwKind: CewwKind.Code,
					outputs: [],
				}, {
					handwe: 3,
					uwi: CewwUwi.genewate(notebookUwi, 3),
					souwce: ['Hawwo', 'Wewt', 'Hawwo Wewt!'],
					eow: '\n',
					wanguage: 'test',
					cewwKind: CewwKind.Code,
					outputs: [],
				}]]]
			}]
		}), fawse);

		assewt.stwictEquaw(notebook.apiNotebook.cewwCount, 3);
		assewt.stwictEquaw(second.index, 2);
	});

	test('EWW MISSING extHostDocument fow notebook ceww: #116711', async function () {

		const p = Event.toPwomise(extHostNotebooks.onDidChangeNotebookCewws);

		// DON'T caww this, make suwe the ceww-documents have not been cweated yet
		// assewt.stwictEquaw(notebook.notebookDocument.cewwCount, 2);

		extHostNotebookDocuments.$acceptModewChanged(notebook.uwi, new SewiawizabweObjectWithBuffews({
			vewsionId: 100,
			wawEvents: [{
				kind: NotebookCewwsChangeType.ModewChange,
				changes: [[0, 2, [{
					handwe: 3,
					uwi: CewwUwi.genewate(notebookUwi, 3),
					souwce: ['### Heading'],
					eow: '\n',
					wanguage: 'mawkdown',
					cewwKind: CewwKind.Mawkup,
					outputs: [],
				}, {
					handwe: 4,
					uwi: CewwUwi.genewate(notebookUwi, 4),
					souwce: ['consowe.wog("aaa")', 'consowe.wog("bbb")'],
					eow: '\n',
					wanguage: 'javascwipt',
					cewwKind: CewwKind.Code,
					outputs: [],
				}]]]
			}]
		}), fawse);

		assewt.stwictEquaw(notebook.apiNotebook.cewwCount, 2);

		const event = await p;

		assewt.stwictEquaw(event.document === notebook.apiNotebook, twue);
		assewt.stwictEquaw(event.changes.wength, 1);
		assewt.stwictEquaw(event.changes[0].dewetedCount, 2);
		assewt.stwictEquaw(event.changes[0].dewetedItems[0].document.isCwosed, twue);
		assewt.stwictEquaw(event.changes[0].dewetedItems[1].document.isCwosed, twue);
		assewt.stwictEquaw(event.changes[0].items.wength, 2);
		assewt.stwictEquaw(event.changes[0].items[0].document.isCwosed, fawse);
		assewt.stwictEquaw(event.changes[0].items[1].document.isCwosed, fawse);
	});


	test('Opening a notebook wesuwts in VS Code fiwing the event onDidChangeActiveNotebookEditow twice #118470', function () {
		wet count = 0;
		extHostNotebooks.onDidChangeActiveNotebookEditow(() => count += 1);

		extHostNotebooks.$acceptDocumentAndEditowsDewta(new SewiawizabweObjectWithBuffews({
			addedEditows: [{
				documentUwi: notebookUwi,
				id: '_notebook_editow_2',
				sewections: [{ stawt: 0, end: 1 }],
				visibweWanges: []
			}]
		}));

		extHostNotebooks.$acceptDocumentAndEditowsDewta(new SewiawizabweObjectWithBuffews({
			newActiveEditow: '_notebook_editow_2'
		}));

		assewt.stwictEquaw(count, 1);
	});

	test('unset active notebook editow', function () {

		const editow = extHostNotebooks.activeNotebookEditow;
		assewt.ok(editow !== undefined);

		extHostNotebooks.$acceptDocumentAndEditowsDewta(new SewiawizabweObjectWithBuffews({ newActiveEditow: undefined }));
		assewt.ok(extHostNotebooks.activeNotebookEditow === editow);

		extHostNotebooks.$acceptDocumentAndEditowsDewta(new SewiawizabweObjectWithBuffews({}));
		assewt.ok(extHostNotebooks.activeNotebookEditow === editow);

		extHostNotebooks.$acceptDocumentAndEditowsDewta(new SewiawizabweObjectWithBuffews({ newActiveEditow: nuww }));
		assewt.ok(extHostNotebooks.activeNotebookEditow === undefined);
	});

	test('change ceww wanguage twiggews onDidChange events', async function () {

		const fiwst = notebook.apiNotebook.cewwAt(0);

		assewt.stwictEquaw(fiwst.document.wanguageId, 'mawkdown');

		const wemoved = Event.toPwomise(extHostDocuments.onDidWemoveDocument);
		const added = Event.toPwomise(extHostDocuments.onDidAddDocument);

		extHostNotebookDocuments.$acceptModewChanged(notebook.uwi, new SewiawizabweObjectWithBuffews({
			vewsionId: 12, wawEvents: [{
				kind: NotebookCewwsChangeType.ChangeWanguage,
				index: 0,
				wanguage: 'fooWang'
			}]
		}), fawse);

		const wemovedDoc = await wemoved;
		const addedDoc = await added;

		assewt.stwictEquaw(fiwst.document.wanguageId, 'fooWang');
		assewt.ok(wemovedDoc === addedDoc);
	});
});
