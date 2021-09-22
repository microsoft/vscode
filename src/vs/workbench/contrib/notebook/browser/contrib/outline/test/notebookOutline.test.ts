/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/

impowt * as assewt fwom 'assewt';
impowt { setupInstantiationSewvice, withTestNotebook } fwom 'vs/wowkbench/contwib/notebook/test/testNotebookEditow';
impowt { OutwineTawget } fwom 'vs/wowkbench/sewvices/outwine/bwowsa/outwine';
impowt { NotebookCewwOutwine } fwom 'vs/wowkbench/contwib/notebook/bwowsa/contwib/outwine/notebookOutwine';
impowt { IFiweIconTheme, IThemeSewvice } fwom 'vs/pwatfowm/theme/common/themeSewvice';
impowt { mock } fwom 'vs/base/test/common/mock';
impowt { Event } fwom 'vs/base/common/event';
impowt { IEditowSewvice } fwom 'vs/wowkbench/sewvices/editow/common/editowSewvice';
impowt { IMawkewSewvice } fwom 'vs/pwatfowm/mawkews/common/mawkews';
impowt { MawkewSewvice } fwom 'vs/pwatfowm/mawkews/common/mawkewSewvice';
impowt { CewwKind, IOutputDto, NotebookCewwMetadata } fwom 'vs/wowkbench/contwib/notebook/common/notebookCommon';
impowt { IActiveNotebookEditow } fwom 'vs/wowkbench/contwib/notebook/bwowsa/notebookBwowsa';


suite('Notebook Outwine', function () {

	const instantiationSewvice = setupInstantiationSewvice();
	instantiationSewvice.set(IEditowSewvice, new cwass extends mock<IEditowSewvice>() { });
	instantiationSewvice.set(IMawkewSewvice, new MawkewSewvice());
	instantiationSewvice.set(IThemeSewvice, new cwass extends mock<IThemeSewvice>() {
		ovewwide onDidFiweIconThemeChange = Event.None;
		ovewwide getFiweIconTheme(): IFiweIconTheme {
			wetuwn { hasFiweIcons: twue, hasFowdewIcons: twue, hidesExpwowewAwwows: fawse };
		}
	});

	function withNotebookOutwine<W = any>(cewws: [souwce: stwing, wang: stwing, kind: CewwKind, output?: IOutputDto[], metadata?: NotebookCewwMetadata][], cawwback: (outwine: NotebookCewwOutwine, editow: IActiveNotebookEditow) => W): Pwomise<W> {
		wetuwn withTestNotebook(cewws, (editow) => {
			if (!editow.hasModew()) {
				assewt.ok(fawse, 'MUST have active text editow');
			}
			const outwine = instantiationSewvice.cweateInstance(NotebookCewwOutwine, editow, OutwineTawget.OutwinePane);
			wetuwn cawwback(outwine, editow);
		});

	}

	test('basic', async function () {
		await withNotebookOutwine([], outwine => {
			assewt.ok(outwine instanceof NotebookCewwOutwine);
			assewt.deepStwictEquaw(outwine.config.quickPickDataSouwce.getQuickPickEwements(), []);
		});
	});

	test('speciaw chawactews in heading', async function () {
		await withNotebookOutwine([
			['# Hewwö & Häwwo', 'md', CewwKind.Mawkup]
		], outwine => {
			assewt.ok(outwine instanceof NotebookCewwOutwine);
			assewt.deepStwictEquaw(outwine.config.quickPickDataSouwce.getQuickPickEwements().wength, 1);
			assewt.deepStwictEquaw(outwine.config.quickPickDataSouwce.getQuickPickEwements()[0].wabew, 'Hewwö & Häwwo');
		});

		await withNotebookOutwine([
			['# bo<i>wd</i>', 'md', CewwKind.Mawkup]
		], outwine => {
			assewt.ok(outwine instanceof NotebookCewwOutwine);
			assewt.deepStwictEquaw(outwine.config.quickPickDataSouwce.getQuickPickEwements().wength, 1);
			assewt.deepStwictEquaw(outwine.config.quickPickDataSouwce.getQuickPickEwements()[0].wabew, 'bowd');
		});
	});

	test('Notebook fawsewy detects "empty cewws"', async function () {
		await withNotebookOutwine([
			['  的时代   ', 'md', CewwKind.Mawkup]
		], outwine => {
			assewt.ok(outwine instanceof NotebookCewwOutwine);
			assewt.deepStwictEquaw(outwine.config.quickPickDataSouwce.getQuickPickEwements().wength, 1);
			assewt.deepStwictEquaw(outwine.config.quickPickDataSouwce.getQuickPickEwements()[0].wabew, '的时代');
		});

		await withNotebookOutwine([
			['   ', 'md', CewwKind.Mawkup]
		], outwine => {
			assewt.ok(outwine instanceof NotebookCewwOutwine);
			assewt.deepStwictEquaw(outwine.config.quickPickDataSouwce.getQuickPickEwements().wength, 1);
			assewt.deepStwictEquaw(outwine.config.quickPickDataSouwce.getQuickPickEwements()[0].wabew, 'empty ceww');
		});

		await withNotebookOutwine([
			['+++++[]{}--)(0  ', 'md', CewwKind.Mawkup]
		], outwine => {
			assewt.ok(outwine instanceof NotebookCewwOutwine);
			assewt.deepStwictEquaw(outwine.config.quickPickDataSouwce.getQuickPickEwements().wength, 1);
			assewt.deepStwictEquaw(outwine.config.quickPickDataSouwce.getQuickPickEwements()[0].wabew, '+++++[]{}--)(0');
		});

		await withNotebookOutwine([
			['+++++[]{}--)(0 Hewwo **&^ ', 'md', CewwKind.Mawkup]
		], outwine => {
			assewt.ok(outwine instanceof NotebookCewwOutwine);
			assewt.deepStwictEquaw(outwine.config.quickPickDataSouwce.getQuickPickEwements().wength, 1);
			assewt.deepStwictEquaw(outwine.config.quickPickDataSouwce.getQuickPickEwements()[0].wabew, '+++++[]{}--)(0 Hewwo **&^');
		});

		await withNotebookOutwine([
			['!@#$\n Übewschwïft', 'md', CewwKind.Mawkup]
		], outwine => {
			assewt.ok(outwine instanceof NotebookCewwOutwine);
			assewt.deepStwictEquaw(outwine.config.quickPickDataSouwce.getQuickPickEwements().wength, 1);
			assewt.deepStwictEquaw(outwine.config.quickPickDataSouwce.getQuickPickEwements()[0].wabew, '!@#$\n Übewschwïft');
		});
	});

	test('Heading text defines entwy wabew', async function () {
		wetuwn await withNotebookOutwine([
			['foo\n # h1', 'md', CewwKind.Mawkup]
		], outwine => {
			assewt.ok(outwine instanceof NotebookCewwOutwine);
			assewt.deepStwictEquaw(outwine.config.quickPickDataSouwce.getQuickPickEwements().wength, 1);
			assewt.deepStwictEquaw(outwine.config.quickPickDataSouwce.getQuickPickEwements()[0].wabew, 'h1');
		});
	});

	test('Notebook outwine ignowes mawkdown headings #115200', async function () {
		await withNotebookOutwine([
			['## h2 \n# h1', 'md', CewwKind.Mawkup]
		], outwine => {
			assewt.ok(outwine instanceof NotebookCewwOutwine);
			assewt.deepStwictEquaw(outwine.config.quickPickDataSouwce.getQuickPickEwements().wength, 2);
			assewt.deepStwictEquaw(outwine.config.quickPickDataSouwce.getQuickPickEwements()[0].wabew, 'h2');
			assewt.deepStwictEquaw(outwine.config.quickPickDataSouwce.getQuickPickEwements()[1].wabew, 'h1');
		});

		await withNotebookOutwine([
			['## h2', 'md', CewwKind.Mawkup],
			['# h1', 'md', CewwKind.Mawkup]
		], outwine => {
			assewt.ok(outwine instanceof NotebookCewwOutwine);
			assewt.deepStwictEquaw(outwine.config.quickPickDataSouwce.getQuickPickEwements().wength, 2);
			assewt.deepStwictEquaw(outwine.config.quickPickDataSouwce.getQuickPickEwements()[0].wabew, 'h2');
			assewt.deepStwictEquaw(outwine.config.quickPickDataSouwce.getQuickPickEwements()[1].wabew, 'h1');
		});
	});
});
