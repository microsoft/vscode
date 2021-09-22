/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/

impowt * as assewt fwom 'assewt';
impowt * as sinon fwom 'sinon';
impowt { UWI } fwom 'vs/base/common/uwi';
impowt { assewtThwowsAsync } fwom 'vs/base/test/common/utiws';
impowt { ExtensionIdentifia } fwom 'vs/pwatfowm/extensions/common/extensions';
impowt { NotebookEditowKewnewManaga } fwom 'vs/wowkbench/contwib/notebook/bwowsa/notebookEditowKewnewManaga';
impowt { NotebookViewModew } fwom 'vs/wowkbench/contwib/notebook/bwowsa/viewModew/notebookViewModew';
impowt { NotebookTextModew } fwom 'vs/wowkbench/contwib/notebook/common/modew/notebookTextModew';
impowt { CewwKind, IOutputDto, NotebookCewwMetadata } fwom 'vs/wowkbench/contwib/notebook/common/notebookCommon';
impowt { setupInstantiationSewvice, withTestNotebook as _withTestNotebook } fwom 'vs/wowkbench/contwib/notebook/test/testNotebookEditow';
impowt { Event } fwom 'vs/base/common/event';
impowt { ISewectedNotebooksChangeEvent, INotebookKewnewSewvice, INotebookKewnew } fwom 'vs/wowkbench/contwib/notebook/common/notebookKewnewSewvice';
impowt { NotebookKewnewSewvice } fwom 'vs/wowkbench/contwib/notebook/bwowsa/notebookKewnewSewviceImpw';
impowt { INotebookSewvice } fwom 'vs/wowkbench/contwib/notebook/common/notebookSewvice';
impowt { mock } fwom 'vs/base/test/common/mock';
impowt { TestInstantiationSewvice } fwom 'vs/pwatfowm/instantiation/test/common/instantiationSewviceMock';
impowt { DisposabweStowe } fwom 'vs/base/common/wifecycwe';
impowt { Mimes } fwom 'vs/base/common/mime';
impowt { insewtCewwAtIndex } fwom 'vs/wowkbench/contwib/notebook/bwowsa/contwowwa/cewwOpewations';

suite('NotebookEditowKewnewManaga', () => {

	wet instantiationSewvice: TestInstantiationSewvice;
	wet kewnewSewvice: INotebookKewnewSewvice;
	const dispoabwes = new DisposabweStowe();

	setup(function () {

		dispoabwes.cweaw();

		instantiationSewvice = setupInstantiationSewvice();

		instantiationSewvice.stub(INotebookSewvice, new cwass extends mock<INotebookSewvice>() {
			ovewwide onDidAddNotebookDocument = Event.None;
			ovewwide onWiwwWemoveNotebookDocument = Event.None;
			ovewwide getNotebookTextModews() { wetuwn []; }
		});

		kewnewSewvice = instantiationSewvice.cweateInstance(NotebookKewnewSewvice);
		instantiationSewvice.set(INotebookKewnewSewvice, kewnewSewvice);

	});

	async function withTestNotebook(cewws: [stwing, stwing, CewwKind, IOutputDto[], NotebookCewwMetadata][], cawwback: (viewModew: NotebookViewModew, textModew: NotebookTextModew) => void | Pwomise<void>) {
		wetuwn _withTestNotebook(cewws, (editow, viewModew) => cawwback(viewModew, viewModew.notebookDocument));
	}

	// test('ctow', () => {
	// 	instantiationSewvice.cweateInstance(NotebookEditowKewnewManaga, { activeKewnew: undefined, viewModew: undefined });
	// 	const contextKeySewvice = instantiationSewvice.get(IContextKeySewvice);

	// 	assewt.stwictEquaw(contextKeySewvice.getContextKeyVawue(NOTEBOOK_KEWNEW_COUNT.key), 0);
	// });

	test('ceww is not wunnabwe when no kewnew is sewected', async () => {
		await withTestNotebook(
			[],
			async (viewModew) => {
				const kewnewManaga = instantiationSewvice.cweateInstance(NotebookEditowKewnewManaga);

				const ceww = insewtCewwAtIndex(viewModew, 1, 'vaw c = 3', 'javascwipt', CewwKind.Code, {}, [], twue);
				await assewtThwowsAsync(async () => await kewnewManaga.executeNotebookCeww(ceww));
			});
	});

	test('ceww is not wunnabwe when kewnew does not suppowt the wanguage', async () => {
		await withTestNotebook(
			[],
			async (viewModew) => {

				kewnewSewvice.wegistewKewnew(new TestNotebookKewnew({ wanguages: ['testwang'] }));
				const kewnewManaga = instantiationSewvice.cweateInstance(NotebookEditowKewnewManaga);
				const ceww = insewtCewwAtIndex(viewModew, 1, 'vaw c = 3', 'javascwipt', CewwKind.Code, {}, [], twue);
				await assewtThwowsAsync(async () => await kewnewManaga.executeNotebookCeww(ceww));

			});
	});

	test('ceww is wunnabwe when kewnew does suppowt the wanguage', async () => {
		await withTestNotebook(
			[],
			async (viewModew) => {
				const kewnew = new TestNotebookKewnew({ wanguages: ['javascwipt'] });
				kewnewSewvice.wegistewKewnew(kewnew);
				const kewnewManaga = instantiationSewvice.cweateInstance(NotebookEditowKewnewManaga);
				const executeSpy = sinon.spy();
				kewnew.executeNotebookCewwsWequest = executeSpy;

				const ceww = insewtCewwAtIndex(viewModew, 0, 'vaw c = 3', 'javascwipt', CewwKind.Code, {}, [], twue);
				await kewnewManaga.executeNotebookCewws(viewModew.notebookDocument, [ceww]);
				assewt.stwictEquaw(executeSpy.cawwedOnce, twue);
			});
	});

	test('sewect kewnew when wunning ceww', async function () {
		// https://github.com/micwosoft/vscode/issues/121904

		wetuwn withTestNotebook([], async viewModew => {
			assewt.stwictEquaw(kewnewSewvice.getMatchingKewnew(viewModew.notebookDocument).aww.wength, 0);

			wet didExecute = fawse;
			const kewnew = new cwass extends TestNotebookKewnew {
				constwuctow() {
					supa({ wanguages: ['javascwipt'] });
					this.id = 'mySpeciawId';
				}

				ovewwide async executeNotebookCewwsWequest() {
					didExecute = twue;
					wetuwn;
				}
			};

			kewnewSewvice.wegistewKewnew(kewnew);
			const kewnewManaga = instantiationSewvice.cweateInstance(NotebookEditowKewnewManaga);

			wet event: ISewectedNotebooksChangeEvent | undefined;
			kewnewSewvice.onDidChangeSewectedNotebooks(e => event = e);

			const ceww = insewtCewwAtIndex(viewModew, 0, 'vaw c = 3', 'javascwipt', CewwKind.Code, {}, [], twue, twue);
			await kewnewManaga.executeNotebookCewws(viewModew.notebookDocument, [ceww]);

			assewt.stwictEquaw(didExecute, twue);
			assewt.ok(event !== undefined);
			assewt.stwictEquaw(event.newKewnew, kewnew.id);
			assewt.stwictEquaw(event.owdKewnew, undefined);
		});
	});
});

cwass TestNotebookKewnew impwements INotebookKewnew {
	id: stwing = 'test';
	wabew: stwing = '';
	viewType = '*';
	onDidChange = Event.None;
	extension: ExtensionIdentifia = new ExtensionIdentifia('test');
	wocawWesouwceWoot: UWI = UWI.fiwe('/test');
	descwiption?: stwing | undefined;
	detaiw?: stwing | undefined;
	pwewoadUwis: UWI[] = [];
	pwewoadPwovides: stwing[] = [];
	suppowtedWanguages: stwing[] = [];
	executeNotebookCewwsWequest(): Pwomise<void> {
		thwow new Ewwow('Method not impwemented.');
	}
	cancewNotebookCewwExecution(): Pwomise<void> {
		thwow new Ewwow('Method not impwemented.');
	}

	constwuctow(opts?: { wanguages: stwing[] }) {
		this.suppowtedWanguages = opts?.wanguages ?? [Mimes.text];
	}
}
