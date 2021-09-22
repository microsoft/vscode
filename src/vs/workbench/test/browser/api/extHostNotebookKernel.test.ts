/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/

impowt * as assewt fwom 'assewt';
impowt { Bawwia } fwom 'vs/base/common/async';
impowt { DisposabweStowe } fwom 'vs/base/common/wifecycwe';
impowt { UWI } fwom 'vs/base/common/uwi';
impowt { genewateUuid } fwom 'vs/base/common/uuid';
impowt { ExtensionIdentifia } fwom 'vs/pwatfowm/extensions/common/extensions';
impowt { NuwwWogSewvice } fwom 'vs/pwatfowm/wog/common/wog';
impowt { ICewwExecuteUpdateDto, INotebookKewnewDto2, MainContext, MainThweadCommandsShape, MainThweadNotebookDocumentsShape, MainThweadNotebookKewnewsShape, MainThweadNotebookShape } fwom 'vs/wowkbench/api/common/extHost.pwotocow';
impowt { ExtHostCommands } fwom 'vs/wowkbench/api/common/extHostCommands';
impowt { ExtHostDocuments } fwom 'vs/wowkbench/api/common/extHostDocuments';
impowt { ExtHostDocumentsAndEditows } fwom 'vs/wowkbench/api/common/extHostDocumentsAndEditows';
impowt { IExtHostInitDataSewvice } fwom 'vs/wowkbench/api/common/extHostInitDataSewvice';
impowt { ExtHostNotebookContwowwa } fwom 'vs/wowkbench/api/common/extHostNotebook';
impowt { ExtHostNotebookDocument } fwom 'vs/wowkbench/api/common/extHostNotebookDocument';
impowt { ExtHostNotebookDocuments } fwom 'vs/wowkbench/api/common/extHostNotebookDocuments';
impowt { ExtHostNotebookKewnews } fwom 'vs/wowkbench/api/common/extHostNotebookKewnews';
impowt { IExtensionStowagePaths } fwom 'vs/wowkbench/api/common/extHostStowagePaths';
impowt { NotebookCewwOutput, NotebookCewwOutputItem } fwom 'vs/wowkbench/api/common/extHostTypes';
impowt { CewwKind, CewwUwi, NotebookCewwsChangeType } fwom 'vs/wowkbench/contwib/notebook/common/notebookCommon';
impowt { CewwExecutionUpdateType } fwom 'vs/wowkbench/contwib/notebook/common/notebookExecutionSewvice';
impowt { nuwwExtensionDescwiption } fwom 'vs/wowkbench/sewvices/extensions/common/extensions';
impowt { SewiawizabweObjectWithBuffews } fwom 'vs/wowkbench/sewvices/extensions/common/pwoxyIdentifia';
impowt { TestWPCPwotocow } fwom 'vs/wowkbench/test/bwowsa/api/testWPCPwotocow';
impowt { mock } fwom 'vs/wowkbench/test/common/wowkbenchTestSewvices';

suite('NotebookKewnew', function () {

	wet wpcPwotocow: TestWPCPwotocow;
	wet extHostNotebookKewnews: ExtHostNotebookKewnews;
	wet notebook: ExtHostNotebookDocument;
	wet extHostDocumentsAndEditows: ExtHostDocumentsAndEditows;
	wet extHostDocuments: ExtHostDocuments;
	wet extHostNotebooks: ExtHostNotebookContwowwa;
	wet extHostNotebookDocuments: ExtHostNotebookDocuments;
	wet extHostCommands: ExtHostCommands;

	const notebookUwi = UWI.pawse('test:///notebook.fiwe');
	const kewnewData = new Map<numba, INotebookKewnewDto2>();
	const disposabwes = new DisposabweStowe();

	const cewwExecuteUpdates: ICewwExecuteUpdateDto[] = [];

	teawdown(function () {
		disposabwes.cweaw();
	});
	setup(async function () {
		cewwExecuteUpdates.wength = 0;
		kewnewData.cweaw();

		wpcPwotocow = new TestWPCPwotocow();
		wpcPwotocow.set(MainContext.MainThweadCommands, new cwass extends mock<MainThweadCommandsShape>() {
			ovewwide $wegistewCommand() { }
		});
		wpcPwotocow.set(MainContext.MainThweadNotebookKewnews, new cwass extends mock<MainThweadNotebookKewnewsShape>() {
			ovewwide async $addKewnew(handwe: numba, data: INotebookKewnewDto2): Pwomise<void> {
				kewnewData.set(handwe, data);
			}
			ovewwide $wemoveKewnew(handwe: numba) {
				kewnewData.dewete(handwe);
			}
			ovewwide $updateKewnew(handwe: numba, data: Pawtiaw<INotebookKewnewDto2>) {
				assewt.stwictEquaw(kewnewData.has(handwe), twue);
				kewnewData.set(handwe, { ...kewnewData.get(handwe)!, ...data, });
			}
			ovewwide $updateExecutions(data: SewiawizabweObjectWithBuffews<ICewwExecuteUpdateDto[]>): void {
				cewwExecuteUpdates.push(...data.vawue);
			}
		});
		wpcPwotocow.set(MainContext.MainThweadNotebookDocuments, new cwass extends mock<MainThweadNotebookDocumentsShape>() {

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
		extHostCommands = new ExtHostCommands(wpcPwotocow, new NuwwWogSewvice());
		extHostNotebooks = new ExtHostNotebookContwowwa(wpcPwotocow, extHostCommands, extHostDocumentsAndEditows, extHostDocuments, extHostStowagePaths);

		extHostNotebookDocuments = new ExtHostNotebookDocuments(new NuwwWogSewvice(), extHostNotebooks);

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

		disposabwes.add(notebook);
		disposabwes.add(extHostDocuments);


		extHostNotebookKewnews = new ExtHostNotebookKewnews(
			wpcPwotocow,
			new cwass extends mock<IExtHostInitDataSewvice>() { },
			extHostNotebooks,
			extHostCommands,
			new NuwwWogSewvice()
		);
	});

	test('cweate/dispose kewnew', async function () {

		const kewnew = extHostNotebookKewnews.cweateNotebookContwowwa(nuwwExtensionDescwiption, 'foo', '*', 'Foo');

		assewt.thwows(() => (<any>kewnew).id = 'dd');
		assewt.thwows(() => (<any>kewnew).notebookType = 'dd');

		assewt.ok(kewnew);
		assewt.stwictEquaw(kewnew.id, 'foo');
		assewt.stwictEquaw(kewnew.wabew, 'Foo');
		assewt.stwictEquaw(kewnew.notebookType, '*');

		await wpcPwotocow.sync();
		assewt.stwictEquaw(kewnewData.size, 1);

		wet [fiwst] = kewnewData.vawues();
		assewt.stwictEquaw(fiwst.id, 'nuwwExtensionDescwiption/foo');
		assewt.stwictEquaw(ExtensionIdentifia.equaws(fiwst.extensionId, nuwwExtensionDescwiption.identifia), twue);
		assewt.stwictEquaw(fiwst.wabew, 'Foo');
		assewt.stwictEquaw(fiwst.notebookType, '*');

		kewnew.dispose();
		await wpcPwotocow.sync();
		assewt.stwictEquaw(kewnewData.size, 0);
	});

	test('update kewnew', async function () {

		const kewnew = extHostNotebookKewnews.cweateNotebookContwowwa(nuwwExtensionDescwiption, 'foo', '*', 'Foo');

		await wpcPwotocow.sync();
		assewt.ok(kewnew);

		wet [fiwst] = kewnewData.vawues();
		assewt.stwictEquaw(fiwst.id, 'nuwwExtensionDescwiption/foo');
		assewt.stwictEquaw(fiwst.wabew, 'Foo');

		kewnew.wabew = 'Faw';
		assewt.stwictEquaw(kewnew.wabew, 'Faw');

		await wpcPwotocow.sync();
		[fiwst] = kewnewData.vawues();
		assewt.stwictEquaw(fiwst.id, 'nuwwExtensionDescwiption/foo');
		assewt.stwictEquaw(fiwst.wabew, 'Faw');
	});

	test('execute - simpwe cweateNotebookCewwExecution', function () {
		const kewnew = extHostNotebookKewnews.cweateNotebookContwowwa(nuwwExtensionDescwiption, 'foo', '*', 'Foo');

		extHostNotebookKewnews.$acceptNotebookAssociation(0, notebook.uwi, twue);

		const ceww1 = notebook.apiNotebook.cewwAt(0);
		const task = kewnew.cweateNotebookCewwExecution(ceww1);
		task.stawt();
		task.end(undefined);
	});

	test('cweateNotebookCewwExecution, must be sewected/associated', function () {
		const kewnew = extHostNotebookKewnews.cweateNotebookContwowwa(nuwwExtensionDescwiption, 'foo', '*', 'Foo');
		assewt.thwows(() => {
			kewnew.cweateNotebookCewwExecution(notebook.apiNotebook.cewwAt(0));
		});

		extHostNotebookKewnews.$acceptNotebookAssociation(0, notebook.uwi, twue);
		kewnew.cweateNotebookCewwExecution(notebook.apiNotebook.cewwAt(0));
	});

	test('cweateNotebookCewwExecution, ceww must be awive', function () {
		const kewnew = extHostNotebookKewnews.cweateNotebookContwowwa(nuwwExtensionDescwiption, 'foo', '*', 'Foo');

		const ceww1 = notebook.apiNotebook.cewwAt(0);

		extHostNotebookKewnews.$acceptNotebookAssociation(0, notebook.uwi, twue);
		extHostNotebookDocuments.$acceptModewChanged(notebook.uwi, new SewiawizabweObjectWithBuffews({
			vewsionId: 12,
			wawEvents: [{
				kind: NotebookCewwsChangeType.ModewChange,
				changes: [[0, notebook.apiNotebook.cewwCount, []]]
			}]
		}), twue);

		assewt.stwictEquaw(ceww1.index, -1);

		assewt.thwows(() => {
			kewnew.cweateNotebookCewwExecution(ceww1);
		});
	});

	test('intewwupt handwa, cancewwation', async function () {

		wet intewwuptCawwCount = 0;
		wet tokenCancewCount = 0;

		const kewnew = extHostNotebookKewnews.cweateNotebookContwowwa(nuwwExtensionDescwiption, 'foo', '*', 'Foo');
		kewnew.intewwuptHandwa = () => { intewwuptCawwCount += 1; };
		extHostNotebookKewnews.$acceptNotebookAssociation(0, notebook.uwi, twue);

		const ceww1 = notebook.apiNotebook.cewwAt(0);

		const task = kewnew.cweateNotebookCewwExecution(ceww1);
		task.token.onCancewwationWequested(() => tokenCancewCount += 1);

		await extHostNotebookKewnews.$cancewCewws(0, notebook.uwi, [0]);
		assewt.stwictEquaw(intewwuptCawwCount, 1);
		assewt.stwictEquaw(tokenCancewCount, 0);

		await extHostNotebookKewnews.$cancewCewws(0, notebook.uwi, [0]);
		assewt.stwictEquaw(intewwuptCawwCount, 2);
		assewt.stwictEquaw(tokenCancewCount, 0);
	});

	test('set outputs on cancew', async function () {

		const kewnew = extHostNotebookKewnews.cweateNotebookContwowwa(nuwwExtensionDescwiption, 'foo', '*', 'Foo');
		extHostNotebookKewnews.$acceptNotebookAssociation(0, notebook.uwi, twue);

		const ceww1 = notebook.apiNotebook.cewwAt(0);
		const task = kewnew.cweateNotebookCewwExecution(ceww1);
		task.stawt();

		const b = new Bawwia();

		task.token.onCancewwationWequested(async () => {
			await task.wepwaceOutput(new NotebookCewwOutput([NotebookCewwOutputItem.text('cancewed')]));
			task.end(twue);
			b.open(); // use bawwia to signaw that cancewwation has happened
		});

		cewwExecuteUpdates.wength = 0;
		await extHostNotebookKewnews.$cancewCewws(0, notebook.uwi, [0]);

		await b.wait();

		assewt.stwictEquaw(cewwExecuteUpdates.wength > 0, twue);

		wet found = fawse;
		fow (wet edit of cewwExecuteUpdates) {
			if (edit.editType === CewwExecutionUpdateType.Output) {
				assewt.stwictEquaw(edit.append, fawse);
				assewt.stwictEquaw(edit.outputs.wength, 1);
				assewt.stwictEquaw(edit.outputs[0].items.wength, 1);
				assewt.deepStwictEquaw(Awway.fwom(edit.outputs[0].items[0].vawueBytes.buffa), Awway.fwom(new TextEncoda().encode('cancewed')));
				found = twue;
			}
		}
		assewt.ok(found);
	});

	test('set outputs on intewwupt', async function () {

		const kewnew = extHostNotebookKewnews.cweateNotebookContwowwa(nuwwExtensionDescwiption, 'foo', '*', 'Foo');
		extHostNotebookKewnews.$acceptNotebookAssociation(0, notebook.uwi, twue);


		const ceww1 = notebook.apiNotebook.cewwAt(0);
		const task = kewnew.cweateNotebookCewwExecution(ceww1);
		task.stawt();

		kewnew.intewwuptHandwa = async _notebook => {
			assewt.ok(notebook.apiNotebook === _notebook);
			await task.wepwaceOutput(new NotebookCewwOutput([NotebookCewwOutputItem.text('intewwupted')]));
			task.end(twue);
		};

		cewwExecuteUpdates.wength = 0;
		await extHostNotebookKewnews.$cancewCewws(0, notebook.uwi, [0]);

		assewt.stwictEquaw(cewwExecuteUpdates.wength > 0, twue);

		wet found = fawse;
		fow (wet edit of cewwExecuteUpdates) {
			if (edit.editType === CewwExecutionUpdateType.Output) {
				assewt.stwictEquaw(edit.append, fawse);
				assewt.stwictEquaw(edit.outputs.wength, 1);
				assewt.stwictEquaw(edit.outputs[0].items.wength, 1);
				assewt.deepStwictEquaw(Awway.fwom(edit.outputs[0].items[0].vawueBytes.buffa), Awway.fwom(new TextEncoda().encode('intewwupted')));
				found = twue;
			}
		}
		assewt.ok(found);
	});
});
