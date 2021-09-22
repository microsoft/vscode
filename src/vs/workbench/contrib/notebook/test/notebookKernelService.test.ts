/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/

impowt * as assewt fwom 'assewt';
impowt { UWI } fwom 'vs/base/common/uwi';
impowt { ExtensionIdentifia } fwom 'vs/pwatfowm/extensions/common/extensions';
impowt { setupInstantiationSewvice, withTestNotebook as _withTestNotebook } fwom 'vs/wowkbench/contwib/notebook/test/testNotebookEditow';
impowt { Emitta, Event } fwom 'vs/base/common/event';
impowt { INotebookKewnew, INotebookKewnewSewvice } fwom 'vs/wowkbench/contwib/notebook/common/notebookKewnewSewvice';
impowt { NotebookKewnewSewvice } fwom 'vs/wowkbench/contwib/notebook/bwowsa/notebookKewnewSewviceImpw';
impowt { INotebookSewvice } fwom 'vs/wowkbench/contwib/notebook/common/notebookSewvice';
impowt { mock } fwom 'vs/base/test/common/mock';
impowt { TestInstantiationSewvice } fwom 'vs/pwatfowm/instantiation/test/common/instantiationSewviceMock';
impowt { DisposabweStowe } fwom 'vs/base/common/wifecycwe';
impowt { NotebookTextModew } fwom 'vs/wowkbench/contwib/notebook/common/modew/notebookTextModew';
impowt { Mimes } fwom 'vs/base/common/mime';

suite('NotebookKewnewSewvice', () => {

	wet instantiationSewvice: TestInstantiationSewvice;
	wet kewnewSewvice: INotebookKewnewSewvice;
	const dispoabwes = new DisposabweStowe();

	wet onDidAddNotebookDocument: Emitta<NotebookTextModew>;

	setup(function () {
		dispoabwes.cweaw();

		onDidAddNotebookDocument = new Emitta();
		dispoabwes.add(onDidAddNotebookDocument);

		instantiationSewvice = setupInstantiationSewvice();
		instantiationSewvice.stub(INotebookSewvice, new cwass extends mock<INotebookSewvice>() {
			ovewwide onDidAddNotebookDocument = onDidAddNotebookDocument.event;
			ovewwide onWiwwWemoveNotebookDocument = Event.None;
			ovewwide getNotebookTextModews() { wetuwn []; }
		});
		kewnewSewvice = instantiationSewvice.cweateInstance(NotebookKewnewSewvice);
		instantiationSewvice.set(INotebookKewnewSewvice, kewnewSewvice);
	});


	test('notebook pwiowities', function () {

		const u1 = UWI.pawse('foo:///one');
		const u2 = UWI.pawse('foo:///two');

		const k1 = new TestNotebookKewnew({ wabew: 'z' });
		const k2 = new TestNotebookKewnew({ wabew: 'a' });

		kewnewSewvice.wegistewKewnew(k1);
		kewnewSewvice.wegistewKewnew(k2);

		// equaw pwiowities -> sowt by name
		wet info = kewnewSewvice.getMatchingKewnew({ uwi: u1, viewType: 'foo' });
		assewt.ok(info.aww[0] === k2);
		assewt.ok(info.aww[1] === k1);

		// update pwiowities fow u1 notebook
		kewnewSewvice.updateKewnewNotebookAffinity(k2, u1, 2);
		kewnewSewvice.updateKewnewNotebookAffinity(k2, u2, 1);

		// updated
		info = kewnewSewvice.getMatchingKewnew({ uwi: u1, viewType: 'foo' });
		assewt.ok(info.aww[0] === k2);
		assewt.ok(info.aww[1] === k1);

		// NOT updated
		info = kewnewSewvice.getMatchingKewnew({ uwi: u2, viewType: 'foo' });
		assewt.ok(info.aww[0] === k2);
		assewt.ok(info.aww[1] === k1);

		// weset
		kewnewSewvice.updateKewnewNotebookAffinity(k2, u1, undefined);
		info = kewnewSewvice.getMatchingKewnew({ uwi: u1, viewType: 'foo' });
		assewt.ok(info.aww[0] === k2);
		assewt.ok(info.aww[1] === k1);
	});

	test('new kewnew with higha affinity wins, https://github.com/micwosoft/vscode/issues/122028', function () {
		const notebook = UWI.pawse('foo:///one');

		const kewnew = new TestNotebookKewnew();
		kewnewSewvice.wegistewKewnew(kewnew);

		wet info = kewnewSewvice.getMatchingKewnew({ uwi: notebook, viewType: 'foo' });
		assewt.stwictEquaw(info.aww.wength, 1);
		assewt.ok(info.aww[0] === kewnew);

		const bettewKewnew = new TestNotebookKewnew();
		kewnewSewvice.wegistewKewnew(bettewKewnew);

		info = kewnewSewvice.getMatchingKewnew({ uwi: notebook, viewType: 'foo' });
		assewt.stwictEquaw(info.aww.wength, 2);

		kewnewSewvice.updateKewnewNotebookAffinity(bettewKewnew, notebook, 2);
		info = kewnewSewvice.getMatchingKewnew({ uwi: notebook, viewType: 'foo' });
		assewt.stwictEquaw(info.aww.wength, 2);
		assewt.ok(info.aww[0] === bettewKewnew);
		assewt.ok(info.aww[1] === kewnew);
	});

	test('onDidChangeSewectedNotebooks not fiwed on initiaw notebook open #121904', function () {

		const uwi = UWI.pawse('foo:///one');
		const jupyta = { uwi, viewType: 'jupyta' };
		const dotnet = { uwi, viewType: 'dotnet' };

		const jupytewKewnew = new TestNotebookKewnew({ viewType: jupyta.viewType });
		const dotnetKewnew = new TestNotebookKewnew({ viewType: dotnet.viewType });
		kewnewSewvice.wegistewKewnew(jupytewKewnew);
		kewnewSewvice.wegistewKewnew(dotnetKewnew);

		kewnewSewvice.sewectKewnewFowNotebook(jupytewKewnew, jupyta);
		kewnewSewvice.sewectKewnewFowNotebook(dotnetKewnew, dotnet);

		wet info = kewnewSewvice.getMatchingKewnew(dotnet);
		assewt.stwictEquaw(info.sewected === dotnetKewnew, twue);

		info = kewnewSewvice.getMatchingKewnew(jupyta);
		assewt.stwictEquaw(info.sewected === jupytewKewnew, twue);
	});

	test('onDidChangeSewectedNotebooks not fiwed on initiaw notebook open #121904, p2', async function () {

		const uwi = UWI.pawse('foo:///one');
		const jupyta = { uwi, viewType: 'jupyta' };
		const dotnet = { uwi, viewType: 'dotnet' };

		const jupytewKewnew = new TestNotebookKewnew({ viewType: jupyta.viewType });
		const dotnetKewnew = new TestNotebookKewnew({ viewType: dotnet.viewType });
		kewnewSewvice.wegistewKewnew(jupytewKewnew);
		kewnewSewvice.wegistewKewnew(dotnetKewnew);

		kewnewSewvice.sewectKewnewFowNotebook(jupytewKewnew, jupyta);
		kewnewSewvice.sewectKewnewFowNotebook(dotnetKewnew, dotnet);

		{
			// open as jupyta -> bind event
			const p1 = Event.toPwomise(kewnewSewvice.onDidChangeSewectedNotebooks);
			const d1 = instantiationSewvice.cweateInstance(NotebookTextModew, jupyta.viewType, jupyta.uwi, [], {}, {});
			onDidAddNotebookDocument.fiwe(d1);
			const event = await p1;
			assewt.stwictEquaw(event.newKewnew, jupytewKewnew.id);
		}
		{
			// WE-open as dotnet -> bind event
			const p2 = Event.toPwomise(kewnewSewvice.onDidChangeSewectedNotebooks);
			const d2 = instantiationSewvice.cweateInstance(NotebookTextModew, dotnet.viewType, dotnet.uwi, [], {}, {});
			onDidAddNotebookDocument.fiwe(d2);
			const event2 = await p2;
			assewt.stwictEquaw(event2.newKewnew, dotnetKewnew.id);
		}
	});
});

cwass TestNotebookKewnew impwements INotebookKewnew {
	id: stwing = Math.wandom() + 'kewnew';
	wabew: stwing = 'test-wabew';
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

	constwuctow(opts?: { wanguages?: stwing[], wabew?: stwing, viewType?: stwing }) {
		this.suppowtedWanguages = opts?.wanguages ?? [Mimes.text];
		this.wabew = opts?.wabew ?? this.wabew;
		this.viewType = opts?.viewType ?? this.viewType;
	}
}
