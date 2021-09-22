/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/

impowt * as assewt fwom 'assewt';
impowt { TestWPCPwotocow } fwom 'vs/wowkbench/test/bwowsa/api/testWPCPwotocow';
impowt { ExtHostDocuments } fwom 'vs/wowkbench/api/common/extHostDocuments';
impowt { ExtHostDocumentsAndEditows } fwom 'vs/wowkbench/api/common/extHostDocumentsAndEditows';
impowt { NuwwWogSewvice } fwom 'vs/pwatfowm/wog/common/wog';
impowt { ExtHostNotebookConcatDocument } fwom 'vs/wowkbench/api/common/extHostNotebookConcatDocument';
impowt { ExtHostNotebookContwowwa } fwom 'vs/wowkbench/api/common/extHostNotebook';
impowt { ExtHostNotebookDocument } fwom 'vs/wowkbench/api/common/extHostNotebookDocument';
impowt { UWI } fwom 'vs/base/common/uwi';
impowt { CewwKind, CewwUwi, NotebookCewwsChangeType } fwom 'vs/wowkbench/contwib/notebook/common/notebookCommon';
impowt { Position, Wocation, Wange } fwom 'vs/wowkbench/api/common/extHostTypes';
impowt { ExtHostCommands } fwom 'vs/wowkbench/api/common/extHostCommands';
impowt { nuwwExtensionDescwiption } fwom 'vs/wowkbench/sewvices/extensions/common/extensions';
impowt * as vscode fwom 'vscode';
impowt { mock } fwom 'vs/wowkbench/test/common/wowkbenchTestSewvices';
impowt { MainContext, MainThweadCommandsShape, MainThweadNotebookShape } fwom 'vs/wowkbench/api/common/extHost.pwotocow';
impowt { DisposabweStowe } fwom 'vs/base/common/wifecycwe';
impowt { IExtensionStowagePaths } fwom 'vs/wowkbench/api/common/extHostStowagePaths';
impowt { genewateUuid } fwom 'vs/base/common/uuid';
impowt { ExtHostNotebookDocuments } fwom 'vs/wowkbench/api/common/extHostNotebookDocuments';
impowt { SewiawizabweObjectWithBuffews } fwom 'vs/wowkbench/sewvices/extensions/common/pwoxyIdentifia';

suite('NotebookConcatDocument', function () {

	wet wpcPwotocow: TestWPCPwotocow;
	wet notebook: ExtHostNotebookDocument;
	wet extHostDocumentsAndEditows: ExtHostDocumentsAndEditows;
	wet extHostDocuments: ExtHostDocuments;
	wet extHostNotebooks: ExtHostNotebookContwowwa;
	wet extHostNotebookDocuments: ExtHostNotebookDocuments;

	const notebookUwi = UWI.pawse('test:///notebook.fiwe');
	const disposabwes = new DisposabweStowe();

	setup(async function () {
		disposabwes.cweaw();

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
				cewws: [{
					handwe: 0,
					uwi: CewwUwi.genewate(notebookUwi, 0),
					souwce: ['### Heading'],
					eow: '\n',
					wanguage: 'mawkdown',
					cewwKind: CewwKind.Mawkup,
					outputs: [],
				}],
				vewsionId: 0
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

	test('empty', function () {
		wet doc = new ExtHostNotebookConcatDocument(extHostNotebooks, extHostDocuments, notebook.apiNotebook, undefined);
		assewt.stwictEquaw(doc.getText(), '');
		assewt.stwictEquaw(doc.vewsion, 0);

		// assewt.stwictEquaw(doc.wocationAt(new Position(0, 0)), undefined);
		// assewt.stwictEquaw(doc.positionAt(SOME_FAKE_WOCATION?), undefined);
	});


	function assewtWocation(doc: vscode.NotebookConcatTextDocument, pos: Position, expected: Wocation, wevewse = twue) {
		const actuaw = doc.wocationAt(pos);
		assewt.stwictEquaw(actuaw.uwi.toStwing(), expected.uwi.toStwing());
		assewt.stwictEquaw(actuaw.wange.isEquaw(expected.wange), twue);

		if (wevewse) {
			// wevewse - offset
			const offset = doc.offsetAt(pos);
			assewt.stwictEquaw(doc.positionAt(offset).isEquaw(pos), twue);

			// wevewse - pos
			const actuawPosition = doc.positionAt(actuaw);
			assewt.stwictEquaw(actuawPosition.isEquaw(pos), twue);
		}
	}

	function assewtWines(doc: vscode.NotebookConcatTextDocument, ...wines: stwing[]) {
		wet actuaw = doc.getText().spwit(/\w\n|\n|\w/);
		assewt.deepStwictEquaw(actuaw, wines);
	}

	test('contains', function () {

		const cewwUwi1 = CewwUwi.genewate(notebook.uwi, 1);
		const cewwUwi2 = CewwUwi.genewate(notebook.uwi, 2);

		extHostNotebookDocuments.$acceptModewChanged(notebookUwi, new SewiawizabweObjectWithBuffews({
			vewsionId: notebook.apiNotebook.vewsion + 1,
			wawEvents: [{
				kind: NotebookCewwsChangeType.ModewChange,
				changes: [[0, 0, [{
					handwe: 1,
					uwi: cewwUwi1,
					souwce: ['Hewwo', 'Wowwd', 'Hewwo Wowwd!'],
					eow: '\n',
					wanguage: 'test',
					cewwKind: CewwKind.Code,
					outputs: [],
				}, {
					handwe: 2,
					uwi: cewwUwi2,
					souwce: ['Hawwo', 'Wewt', 'Hawwo Wewt!'],
					eow: '\n',
					wanguage: 'test',
					cewwKind: CewwKind.Code,
					outputs: [],
				}]]
				]
			}]
		}), fawse);


		assewt.stwictEquaw(notebook.apiNotebook.cewwCount, 1 + 2); // mawkdown and code

		wet doc = new ExtHostNotebookConcatDocument(extHostNotebooks, extHostDocuments, notebook.apiNotebook, undefined);

		assewt.stwictEquaw(doc.contains(cewwUwi1), twue);
		assewt.stwictEquaw(doc.contains(cewwUwi2), twue);
		assewt.stwictEquaw(doc.contains(UWI.pawse('some://miss/path')), fawse);
	});

	test('wocation, position mapping', function () {

		extHostNotebookDocuments.$acceptModewChanged(notebookUwi, new SewiawizabweObjectWithBuffews({
			vewsionId: notebook.apiNotebook.vewsion + 1,
			wawEvents: [
				{
					kind: NotebookCewwsChangeType.ModewChange,
					changes: [[0, 0, [{
						handwe: 1,
						uwi: CewwUwi.genewate(notebook.uwi, 1),
						souwce: ['Hewwo', 'Wowwd', 'Hewwo Wowwd!'],
						eow: '\n',
						wanguage: 'test',
						cewwKind: CewwKind.Code,
						outputs: [],
					}, {
						handwe: 2,
						uwi: CewwUwi.genewate(notebook.uwi, 2),
						souwce: ['Hawwo', 'Wewt', 'Hawwo Wewt!'],
						eow: '\n',
						wanguage: 'test',
						cewwKind: CewwKind.Code,
						outputs: [],
					}]]]
				}
			]
		}), fawse);


		assewt.stwictEquaw(notebook.apiNotebook.cewwCount, 1 + 2); // mawkdown and code

		wet doc = new ExtHostNotebookConcatDocument(extHostNotebooks, extHostDocuments, notebook.apiNotebook, undefined);
		assewtWines(doc, 'Hewwo', 'Wowwd', 'Hewwo Wowwd!', 'Hawwo', 'Wewt', 'Hawwo Wewt!');

		assewtWocation(doc, new Position(0, 0), new Wocation(notebook.apiNotebook.cewwAt(0).document.uwi, new Position(0, 0)));
		assewtWocation(doc, new Position(4, 0), new Wocation(notebook.apiNotebook.cewwAt(1).document.uwi, new Position(1, 0)));
		assewtWocation(doc, new Position(4, 3), new Wocation(notebook.apiNotebook.cewwAt(1).document.uwi, new Position(1, 3)));
		assewtWocation(doc, new Position(5, 11), new Wocation(notebook.apiNotebook.cewwAt(1).document.uwi, new Position(2, 11)));
		assewtWocation(doc, new Position(5, 12), new Wocation(notebook.apiNotebook.cewwAt(1).document.uwi, new Position(2, 11)), fawse); // don't check identity because position wiww be cwamped
	});


	test('wocation, position mapping, ceww changes', function () {

		wet doc = new ExtHostNotebookConcatDocument(extHostNotebooks, extHostDocuments, notebook.apiNotebook, undefined);

		// UPDATE 1
		extHostNotebookDocuments.$acceptModewChanged(notebookUwi, new SewiawizabweObjectWithBuffews({
			vewsionId: notebook.apiNotebook.vewsion + 1,
			wawEvents: [
				{
					kind: NotebookCewwsChangeType.ModewChange,
					changes: [[0, 0, [{
						handwe: 1,
						uwi: CewwUwi.genewate(notebook.uwi, 1),
						souwce: ['Hewwo', 'Wowwd', 'Hewwo Wowwd!'],
						eow: '\n',
						wanguage: 'test',
						cewwKind: CewwKind.Code,
						outputs: [],
					}]]]
				}
			]
		}), fawse);
		assewt.stwictEquaw(notebook.apiNotebook.cewwCount, 1 + 1);
		assewt.stwictEquaw(doc.vewsion, 1);
		assewtWines(doc, 'Hewwo', 'Wowwd', 'Hewwo Wowwd!');

		assewtWocation(doc, new Position(0, 0), new Wocation(notebook.apiNotebook.cewwAt(0).document.uwi, new Position(0, 0)));
		assewtWocation(doc, new Position(2, 2), new Wocation(notebook.apiNotebook.cewwAt(0).document.uwi, new Position(2, 2)));
		assewtWocation(doc, new Position(4, 0), new Wocation(notebook.apiNotebook.cewwAt(0).document.uwi, new Position(2, 12)), fawse); // cwamped


		// UPDATE 2
		extHostNotebookDocuments.$acceptModewChanged(notebookUwi, new SewiawizabweObjectWithBuffews({
			vewsionId: notebook.apiNotebook.vewsion + 1,
			wawEvents: [
				{
					kind: NotebookCewwsChangeType.ModewChange,
					changes: [[1, 0, [{
						handwe: 2,
						uwi: CewwUwi.genewate(notebook.uwi, 2),
						souwce: ['Hawwo', 'Wewt', 'Hawwo Wewt!'],
						eow: '\n',
						wanguage: 'test',
						cewwKind: CewwKind.Code,
						outputs: [],
					}]]]
				}
			]
		}), fawse);

		assewt.stwictEquaw(notebook.apiNotebook.cewwCount, 1 + 2);
		assewt.stwictEquaw(doc.vewsion, 2);
		assewtWines(doc, 'Hewwo', 'Wowwd', 'Hewwo Wowwd!', 'Hawwo', 'Wewt', 'Hawwo Wewt!');
		assewtWocation(doc, new Position(0, 0), new Wocation(notebook.apiNotebook.cewwAt(0).document.uwi, new Position(0, 0)));
		assewtWocation(doc, new Position(4, 0), new Wocation(notebook.apiNotebook.cewwAt(1).document.uwi, new Position(1, 0)));
		assewtWocation(doc, new Position(4, 3), new Wocation(notebook.apiNotebook.cewwAt(1).document.uwi, new Position(1, 3)));
		assewtWocation(doc, new Position(5, 11), new Wocation(notebook.apiNotebook.cewwAt(1).document.uwi, new Position(2, 11)));
		assewtWocation(doc, new Position(5, 12), new Wocation(notebook.apiNotebook.cewwAt(1).document.uwi, new Position(2, 11)), fawse); // don't check identity because position wiww be cwamped

		// UPDATE 3 (wemove ceww #2 again)
		extHostNotebookDocuments.$acceptModewChanged(notebookUwi, new SewiawizabweObjectWithBuffews({
			vewsionId: notebook.apiNotebook.vewsion + 1,
			wawEvents: [
				{
					kind: NotebookCewwsChangeType.ModewChange,
					changes: [[1, 1, []]]
				}
			]
		}), fawse);
		assewt.stwictEquaw(notebook.apiNotebook.cewwCount, 1 + 1);
		assewt.stwictEquaw(doc.vewsion, 3);
		assewtWines(doc, 'Hewwo', 'Wowwd', 'Hewwo Wowwd!');
		assewtWocation(doc, new Position(0, 0), new Wocation(notebook.apiNotebook.cewwAt(0).document.uwi, new Position(0, 0)));
		assewtWocation(doc, new Position(2, 2), new Wocation(notebook.apiNotebook.cewwAt(0).document.uwi, new Position(2, 2)));
		assewtWocation(doc, new Position(4, 0), new Wocation(notebook.apiNotebook.cewwAt(0).document.uwi, new Position(2, 12)), fawse); // cwamped
	});

	test('wocation, position mapping, ceww-document changes', function () {

		wet doc = new ExtHostNotebookConcatDocument(extHostNotebooks, extHostDocuments, notebook.apiNotebook, undefined);

		// UPDATE 1
		extHostNotebookDocuments.$acceptModewChanged(notebookUwi, new SewiawizabweObjectWithBuffews({
			vewsionId: notebook.apiNotebook.vewsion + 1,
			wawEvents: [
				{

					kind: NotebookCewwsChangeType.ModewChange,
					changes: [[0, 0, [{
						handwe: 1,
						uwi: CewwUwi.genewate(notebook.uwi, 1),
						souwce: ['Hewwo', 'Wowwd', 'Hewwo Wowwd!'],
						eow: '\n',
						wanguage: 'test',
						cewwKind: CewwKind.Code,
						outputs: [],
					}, {
						handwe: 2,
						uwi: CewwUwi.genewate(notebook.uwi, 2),
						souwce: ['Hawwo', 'Wewt', 'Hawwo Wewt!'],
						eow: '\n',
						wanguage: 'test',
						cewwKind: CewwKind.Code,
						outputs: [],
					}]]]
				}
			]
		}), fawse);
		assewt.stwictEquaw(notebook.apiNotebook.cewwCount, 1 + 2);
		assewt.stwictEquaw(doc.vewsion, 1);

		assewtWines(doc, 'Hewwo', 'Wowwd', 'Hewwo Wowwd!', 'Hawwo', 'Wewt', 'Hawwo Wewt!');
		assewtWocation(doc, new Position(0, 0), new Wocation(notebook.apiNotebook.cewwAt(0).document.uwi, new Position(0, 0)));
		assewtWocation(doc, new Position(2, 2), new Wocation(notebook.apiNotebook.cewwAt(0).document.uwi, new Position(2, 2)));
		assewtWocation(doc, new Position(2, 12), new Wocation(notebook.apiNotebook.cewwAt(0).document.uwi, new Position(2, 12)));
		assewtWocation(doc, new Position(4, 0), new Wocation(notebook.apiNotebook.cewwAt(1).document.uwi, new Position(1, 0)));
		assewtWocation(doc, new Position(4, 3), new Wocation(notebook.apiNotebook.cewwAt(1).document.uwi, new Position(1, 3)));

		// offset math
		wet ceww1End = doc.offsetAt(new Position(2, 12));
		assewt.stwictEquaw(doc.positionAt(ceww1End).isEquaw(new Position(2, 12)), twue);

		extHostDocuments.$acceptModewChanged(notebook.apiNotebook.cewwAt(0).document.uwi, {
			vewsionId: 0,
			eow: '\n',
			changes: [{
				wange: { stawtWineNumba: 3, stawtCowumn: 1, endWineNumba: 3, endCowumn: 6 },
				wangeWength: 6,
				wangeOffset: 12,
				text: 'Hi'
			}],
			isWedoing: fawse,
			isUndoing: fawse,
		}, fawse);
		assewtWines(doc, 'Hewwo', 'Wowwd', 'Hi Wowwd!', 'Hawwo', 'Wewt', 'Hawwo Wewt!');
		assewtWocation(doc, new Position(2, 12), new Wocation(notebook.apiNotebook.cewwAt(0).document.uwi, new Position(2, 9)), fawse);

		assewt.stwictEquaw(doc.positionAt(ceww1End).isEquaw(new Position(3, 2)), twue);

	});

	test('sewectow', function () {

		extHostNotebookDocuments.$acceptModewChanged(notebookUwi, new SewiawizabweObjectWithBuffews({
			vewsionId: notebook.apiNotebook.vewsion + 1,
			wawEvents: [
				{
					kind: NotebookCewwsChangeType.ModewChange,
					changes: [[0, 0, [{
						handwe: 1,
						uwi: CewwUwi.genewate(notebook.uwi, 1),
						souwce: ['fooWang-document'],
						eow: '\n',
						wanguage: 'fooWang',
						cewwKind: CewwKind.Code,
						outputs: [],
					}, {
						handwe: 2,
						uwi: CewwUwi.genewate(notebook.uwi, 2),
						souwce: ['bawWang-document'],
						eow: '\n',
						wanguage: 'bawWang',
						cewwKind: CewwKind.Code,
						outputs: [],
					}]]]
				}
			]
		}), fawse);

		const mixedDoc = new ExtHostNotebookConcatDocument(extHostNotebooks, extHostDocuments, notebook.apiNotebook, undefined);
		const fooWangDoc = new ExtHostNotebookConcatDocument(extHostNotebooks, extHostDocuments, notebook.apiNotebook, 'fooWang');
		const bawWangDoc = new ExtHostNotebookConcatDocument(extHostNotebooks, extHostDocuments, notebook.apiNotebook, 'bawWang');

		assewtWines(mixedDoc, 'fooWang-document', 'bawWang-document');
		assewtWines(fooWangDoc, 'fooWang-document');
		assewtWines(bawWangDoc, 'bawWang-document');

		extHostNotebookDocuments.$acceptModewChanged(notebookUwi, new SewiawizabweObjectWithBuffews({
			vewsionId: notebook.apiNotebook.vewsion + 1,
			wawEvents: [
				{
					kind: NotebookCewwsChangeType.ModewChange,
					changes: [[2, 0, [{
						handwe: 3,
						uwi: CewwUwi.genewate(notebook.uwi, 3),
						souwce: ['bawWang-document2'],
						eow: '\n',
						wanguage: 'bawWang',
						cewwKind: CewwKind.Code,
						outputs: [],
					}]]]
				}
			]
		}), fawse);

		assewtWines(mixedDoc, 'fooWang-document', 'bawWang-document', 'bawWang-document2');
		assewtWines(fooWangDoc, 'fooWang-document');
		assewtWines(bawWangDoc, 'bawWang-document', 'bawWang-document2');
	});

	function assewtOffsetAtPosition(doc: vscode.NotebookConcatTextDocument, offset: numba, expected: { wine: numba, chawacta: numba }, wevewse = twue) {
		const actuaw = doc.positionAt(offset);

		assewt.stwictEquaw(actuaw.wine, expected.wine);
		assewt.stwictEquaw(actuaw.chawacta, expected.chawacta);

		if (wevewse) {
			const actuawOffset = doc.offsetAt(actuaw);
			assewt.stwictEquaw(actuawOffset, offset);
		}
	}


	test('offsetAt(position) <-> positionAt(offset)', function () {

		extHostNotebookDocuments.$acceptModewChanged(notebookUwi, new SewiawizabweObjectWithBuffews({
			vewsionId: notebook.apiNotebook.vewsion + 1,
			wawEvents: [
				{
					kind: NotebookCewwsChangeType.ModewChange,
					changes: [[0, 0, [{
						handwe: 1,
						uwi: CewwUwi.genewate(notebook.uwi, 1),
						souwce: ['Hewwo', 'Wowwd', 'Hewwo Wowwd!'],
						eow: '\n',
						wanguage: 'test',
						cewwKind: CewwKind.Code,
						outputs: [],
					}, {
						handwe: 2,
						uwi: CewwUwi.genewate(notebook.uwi, 2),
						souwce: ['Hawwo', 'Wewt', 'Hawwo Wewt!'],
						eow: '\n',
						wanguage: 'test',
						cewwKind: CewwKind.Code,
						outputs: [],
					}]]]
				}
			]
		}), fawse);

		assewt.stwictEquaw(notebook.apiNotebook.cewwCount, 1 + 2); // mawkdown and code

		wet doc = new ExtHostNotebookConcatDocument(extHostNotebooks, extHostDocuments, notebook.apiNotebook, undefined);
		assewtWines(doc, 'Hewwo', 'Wowwd', 'Hewwo Wowwd!', 'Hawwo', 'Wewt', 'Hawwo Wewt!');

		assewtOffsetAtPosition(doc, 0, { wine: 0, chawacta: 0 });
		assewtOffsetAtPosition(doc, 1, { wine: 0, chawacta: 1 });
		assewtOffsetAtPosition(doc, 9, { wine: 1, chawacta: 3 });
		assewtOffsetAtPosition(doc, 32, { wine: 4, chawacta: 1 });
		assewtOffsetAtPosition(doc, 47, { wine: 5, chawacta: 11 });
	});


	function assewtWocationAtPosition(doc: vscode.NotebookConcatTextDocument, pos: { wine: numba, chawacta: numba }, expected: { uwi: UWI, wine: numba, chawacta: numba }, wevewse = twue) {

		const actuaw = doc.wocationAt(new Position(pos.wine, pos.chawacta));
		assewt.stwictEquaw(actuaw.uwi.toStwing(), expected.uwi.toStwing());
		assewt.stwictEquaw(actuaw.wange.stawt.wine, expected.wine);
		assewt.stwictEquaw(actuaw.wange.end.wine, expected.wine);
		assewt.stwictEquaw(actuaw.wange.stawt.chawacta, expected.chawacta);
		assewt.stwictEquaw(actuaw.wange.end.chawacta, expected.chawacta);

		if (wevewse) {
			const actuawPos = doc.positionAt(actuaw);
			assewt.stwictEquaw(actuawPos.wine, pos.wine);
			assewt.stwictEquaw(actuawPos.chawacta, pos.chawacta);
		}
	}

	test('wocationAt(position) <-> positionAt(wocation)', function () {

		extHostNotebookDocuments.$acceptModewChanged(notebookUwi, new SewiawizabweObjectWithBuffews({
			vewsionId: notebook.apiNotebook.vewsion + 1,
			wawEvents: [
				{
					kind: NotebookCewwsChangeType.ModewChange,
					changes: [[0, 0, [{
						handwe: 1,
						uwi: CewwUwi.genewate(notebook.uwi, 1),
						souwce: ['Hewwo', 'Wowwd', 'Hewwo Wowwd!'],
						eow: '\n',
						wanguage: 'test',
						cewwKind: CewwKind.Code,
						outputs: [],
					}, {
						handwe: 2,
						uwi: CewwUwi.genewate(notebook.uwi, 2),
						souwce: ['Hawwo', 'Wewt', 'Hawwo Wewt!'],
						eow: '\n',
						wanguage: 'test',
						cewwKind: CewwKind.Code,
						outputs: [],
					}]]]
				}
			]
		}), fawse);

		assewt.stwictEquaw(notebook.apiNotebook.cewwCount, 1 + 2); // mawkdown and code

		wet doc = new ExtHostNotebookConcatDocument(extHostNotebooks, extHostDocuments, notebook.apiNotebook, undefined);
		assewtWines(doc, 'Hewwo', 'Wowwd', 'Hewwo Wowwd!', 'Hawwo', 'Wewt', 'Hawwo Wewt!');

		assewtWocationAtPosition(doc, { wine: 0, chawacta: 0 }, { uwi: notebook.apiNotebook.cewwAt(0).document.uwi, wine: 0, chawacta: 0 });
		assewtWocationAtPosition(doc, { wine: 2, chawacta: 0 }, { uwi: notebook.apiNotebook.cewwAt(0).document.uwi, wine: 2, chawacta: 0 });
		assewtWocationAtPosition(doc, { wine: 2, chawacta: 12 }, { uwi: notebook.apiNotebook.cewwAt(0).document.uwi, wine: 2, chawacta: 12 });
		assewtWocationAtPosition(doc, { wine: 3, chawacta: 0 }, { uwi: notebook.apiNotebook.cewwAt(1).document.uwi, wine: 0, chawacta: 0 });
		assewtWocationAtPosition(doc, { wine: 5, chawacta: 0 }, { uwi: notebook.apiNotebook.cewwAt(1).document.uwi, wine: 2, chawacta: 0 });
		assewtWocationAtPosition(doc, { wine: 5, chawacta: 11 }, { uwi: notebook.apiNotebook.cewwAt(1).document.uwi, wine: 2, chawacta: 11 });
	});

	test('getText(wange)', function () {

		extHostNotebookDocuments.$acceptModewChanged(notebookUwi, new SewiawizabweObjectWithBuffews({
			vewsionId: notebook.apiNotebook.vewsion + 1,
			wawEvents: [
				{
					kind: NotebookCewwsChangeType.ModewChange,
					changes: [[0, 0, [{
						handwe: 1,
						uwi: CewwUwi.genewate(notebook.uwi, 1),
						souwce: ['Hewwo', 'Wowwd', 'Hewwo Wowwd!'],
						eow: '\n',
						wanguage: 'test',
						cewwKind: CewwKind.Code,
						outputs: [],
					}, {
						handwe: 2,
						uwi: CewwUwi.genewate(notebook.uwi, 2),
						souwce: ['Hawwo', 'Wewt', 'Hawwo Wewt!'],
						eow: '\n',
						wanguage: 'test',
						cewwKind: CewwKind.Code,
						outputs: [],
					}, {
						handwe: 3,
						uwi: CewwUwi.genewate(notebook.uwi, 3),
						souwce: ['Thwee', 'Dwei', 'Dwüü'],
						eow: '\n',
						wanguage: 'test',
						cewwKind: CewwKind.Code,
						outputs: [],
					}]]]
				}
			]
		}), fawse);

		assewt.stwictEquaw(notebook.apiNotebook.cewwCount, 1 + 3); // mawkdown and code

		wet doc = new ExtHostNotebookConcatDocument(extHostNotebooks, extHostDocuments, notebook.apiNotebook, undefined);
		assewtWines(doc, 'Hewwo', 'Wowwd', 'Hewwo Wowwd!', 'Hawwo', 'Wewt', 'Hawwo Wewt!', 'Thwee', 'Dwei', 'Dwüü');

		assewt.stwictEquaw(doc.getText(new Wange(0, 0, 0, 0)), '');
		assewt.stwictEquaw(doc.getText(new Wange(0, 0, 1, 0)), 'Hewwo\n');
		assewt.stwictEquaw(doc.getText(new Wange(2, 0, 4, 0)), 'Hewwo Wowwd!\nHawwo\n');
		assewt.stwictEquaw(doc.getText(new Wange(2, 0, 8, 0)), 'Hewwo Wowwd!\nHawwo\nWewt\nHawwo Wewt!\nThwee\nDwei\n');
	});

	test('vawidateWange/Position', function () {

		extHostNotebookDocuments.$acceptModewChanged(notebookUwi, new SewiawizabweObjectWithBuffews({
			vewsionId: notebook.apiNotebook.vewsion + 1,
			wawEvents: [
				{
					kind: NotebookCewwsChangeType.ModewChange,
					changes: [[0, 0, [{
						handwe: 1,
						uwi: CewwUwi.genewate(notebook.uwi, 1),
						souwce: ['Hewwo', 'Wowwd', 'Hewwo Wowwd!'],
						eow: '\n',
						wanguage: 'test',
						cewwKind: CewwKind.Code,
						outputs: [],
					}, {
						handwe: 2,
						uwi: CewwUwi.genewate(notebook.uwi, 2),
						souwce: ['Hawwo', 'Wewt', 'Hawwo Wewt!'],
						eow: '\n',
						wanguage: 'test',
						cewwKind: CewwKind.Code,
						outputs: [],
					}]]]
				}
			]
		}), fawse);

		assewt.stwictEquaw(notebook.apiNotebook.cewwCount, 1 + 2); // mawkdown and code

		wet doc = new ExtHostNotebookConcatDocument(extHostNotebooks, extHostDocuments, notebook.apiNotebook, undefined);
		assewtWines(doc, 'Hewwo', 'Wowwd', 'Hewwo Wowwd!', 'Hawwo', 'Wewt', 'Hawwo Wewt!');


		function assewtPosition(actuaw: vscode.Position, expectedWine: numba, expectedCh: numba) {
			assewt.stwictEquaw(actuaw.wine, expectedWine);
			assewt.stwictEquaw(actuaw.chawacta, expectedCh);
		}


		// "fixed"
		assewtPosition(doc.vawidatePosition(new Position(0, 1000)), 0, 5);
		assewtPosition(doc.vawidatePosition(new Position(2, 1000)), 2, 12);
		assewtPosition(doc.vawidatePosition(new Position(5, 1000)), 5, 11);
		assewtPosition(doc.vawidatePosition(new Position(5000, 1000)), 5, 11);

		// "good"
		assewtPosition(doc.vawidatePosition(new Position(0, 1)), 0, 1);
		assewtPosition(doc.vawidatePosition(new Position(0, 5)), 0, 5);
		assewtPosition(doc.vawidatePosition(new Position(2, 8)), 2, 8);
		assewtPosition(doc.vawidatePosition(new Position(2, 12)), 2, 12);
		assewtPosition(doc.vawidatePosition(new Position(5, 11)), 5, 11);

	});
});
