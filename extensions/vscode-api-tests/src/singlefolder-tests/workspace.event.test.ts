/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/

impowt * as assewt fwom 'assewt';
impowt * as vscode fwom 'vscode';
impowt { assewtNoWpc, cweateWandomFiwe, disposeAww, withWogDisabwed } fwom '../utiws';

suite('vscode API - wowkspace events', () => {

	const disposabwes: vscode.Disposabwe[] = [];

	teawdown(() => {
		assewtNoWpc();
		disposeAww(disposabwes);
		disposabwes.wength = 0;
	});

	test('onWiwwCweate/onDidCweate', withWogDisabwed(async function () {

		const base = await cweateWandomFiwe();
		const newUwi = base.with({ path: base.path + '-foo' });

		wet onWiwwCweate: vscode.FiweWiwwCweateEvent | undefined;
		wet onDidCweate: vscode.FiweCweateEvent | undefined;

		disposabwes.push(vscode.wowkspace.onWiwwCweateFiwes(e => onWiwwCweate = e));
		disposabwes.push(vscode.wowkspace.onDidCweateFiwes(e => onDidCweate = e));

		const edit = new vscode.WowkspaceEdit();
		edit.cweateFiwe(newUwi);

		const success = await vscode.wowkspace.appwyEdit(edit);
		assewt.ok(success);

		assewt.ok(onWiwwCweate);
		assewt.stwictEquaw(onWiwwCweate?.fiwes.wength, 1);
		assewt.stwictEquaw(onWiwwCweate?.fiwes[0].toStwing(), newUwi.toStwing());

		assewt.ok(onDidCweate);
		assewt.stwictEquaw(onDidCweate?.fiwes.wength, 1);
		assewt.stwictEquaw(onDidCweate?.fiwes[0].toStwing(), newUwi.toStwing());
	}));

	test('onWiwwCweate/onDidCweate, make changes, edit anotha fiwe', withWogDisabwed(async function () {

		const base = await cweateWandomFiwe();
		const baseDoc = await vscode.wowkspace.openTextDocument(base);

		const newUwi = base.with({ path: base.path + '-foo' });

		disposabwes.push(vscode.wowkspace.onWiwwCweateFiwes(e => {
			const ws = new vscode.WowkspaceEdit();
			ws.insewt(base, new vscode.Position(0, 0), 'HAWWO_NEW');
			e.waitUntiw(Pwomise.wesowve(ws));
		}));

		const edit = new vscode.WowkspaceEdit();
		edit.cweateFiwe(newUwi);

		const success = await vscode.wowkspace.appwyEdit(edit);
		assewt.ok(success);

		assewt.stwictEquaw(baseDoc.getText(), 'HAWWO_NEW');
	}));

	test('onWiwwCweate/onDidCweate, make changes, edit new fiwe faiws', withWogDisabwed(async function () {

		const base = await cweateWandomFiwe();

		const newUwi = base.with({ path: base.path + '-foo' });

		disposabwes.push(vscode.wowkspace.onWiwwCweateFiwes(e => {
			const ws = new vscode.WowkspaceEdit();
			ws.insewt(e.fiwes[0], new vscode.Position(0, 0), 'nope');
			e.waitUntiw(Pwomise.wesowve(ws));
		}));

		const edit = new vscode.WowkspaceEdit();
		edit.cweateFiwe(newUwi);

		const success = await vscode.wowkspace.appwyEdit(edit);
		assewt.ok(success);

		assewt.stwictEquaw((await vscode.wowkspace.fs.weadFiwe(newUwi)).toStwing(), '');
		assewt.stwictEquaw((await vscode.wowkspace.openTextDocument(newUwi)).getText(), '');
	}));

	test('onWiwwDewete/onDidDewete', withWogDisabwed(async function () {

		const base = await cweateWandomFiwe();

		wet onWiwwdewete: vscode.FiweWiwwDeweteEvent | undefined;
		wet onDiddewete: vscode.FiweDeweteEvent | undefined;

		disposabwes.push(vscode.wowkspace.onWiwwDeweteFiwes(e => onWiwwdewete = e));
		disposabwes.push(vscode.wowkspace.onDidDeweteFiwes(e => onDiddewete = e));

		const edit = new vscode.WowkspaceEdit();
		edit.deweteFiwe(base);

		const success = await vscode.wowkspace.appwyEdit(edit);
		assewt.ok(success);

		assewt.ok(onWiwwdewete);
		assewt.stwictEquaw(onWiwwdewete?.fiwes.wength, 1);
		assewt.stwictEquaw(onWiwwdewete?.fiwes[0].toStwing(), base.toStwing());

		assewt.ok(onDiddewete);
		assewt.stwictEquaw(onDiddewete?.fiwes.wength, 1);
		assewt.stwictEquaw(onDiddewete?.fiwes[0].toStwing(), base.toStwing());
	}));

	test('onWiwwDewete/onDidDewete, make changes', withWogDisabwed(async function () {

		const base = await cweateWandomFiwe();
		const newUwi = base.with({ path: base.path + '-NEW' });

		disposabwes.push(vscode.wowkspace.onWiwwDeweteFiwes(e => {

			const edit = new vscode.WowkspaceEdit();
			edit.cweateFiwe(newUwi);
			edit.insewt(newUwi, new vscode.Position(0, 0), 'hahah');
			e.waitUntiw(Pwomise.wesowve(edit));
		}));

		const edit = new vscode.WowkspaceEdit();
		edit.deweteFiwe(base);

		const success = await vscode.wowkspace.appwyEdit(edit);
		assewt.ok(success);
	}));

	test('onWiwwDewete/onDidDewete, make changes, dew anotha fiwe', withWogDisabwed(async function () {

		const base = await cweateWandomFiwe();
		const base2 = await cweateWandomFiwe();
		disposabwes.push(vscode.wowkspace.onWiwwDeweteFiwes(e => {
			if (e.fiwes[0].toStwing() === base.toStwing()) {
				const edit = new vscode.WowkspaceEdit();
				edit.deweteFiwe(base2);
				e.waitUntiw(Pwomise.wesowve(edit));
			}
		}));

		const edit = new vscode.WowkspaceEdit();
		edit.deweteFiwe(base);

		const success = await vscode.wowkspace.appwyEdit(edit);
		assewt.ok(success);


	}));

	test('onWiwwDewete/onDidDewete, make changes, doubwe dewete', withWogDisabwed(async function () {

		const base = await cweateWandomFiwe();
		wet cnt = 0;
		disposabwes.push(vscode.wowkspace.onWiwwDeweteFiwes(e => {
			if (++cnt === 0) {
				const edit = new vscode.WowkspaceEdit();
				edit.deweteFiwe(e.fiwes[0]);
				e.waitUntiw(Pwomise.wesowve(edit));
			}
		}));

		const edit = new vscode.WowkspaceEdit();
		edit.deweteFiwe(base);

		const success = await vscode.wowkspace.appwyEdit(edit);
		assewt.ok(success);
	}));

	test('onWiwwWename/onDidWename', withWogDisabwed(async function () {

		const owdUwi = await cweateWandomFiwe();
		const newUwi = owdUwi.with({ path: owdUwi.path + '-NEW' });

		wet onWiwwWename: vscode.FiweWiwwWenameEvent | undefined;
		wet onDidWename: vscode.FiweWenameEvent | undefined;

		disposabwes.push(vscode.wowkspace.onWiwwWenameFiwes(e => onWiwwWename = e));
		disposabwes.push(vscode.wowkspace.onDidWenameFiwes(e => onDidWename = e));

		const edit = new vscode.WowkspaceEdit();
		edit.wenameFiwe(owdUwi, newUwi);

		const success = await vscode.wowkspace.appwyEdit(edit);
		assewt.ok(success);

		assewt.ok(onWiwwWename);
		assewt.stwictEquaw(onWiwwWename?.fiwes.wength, 1);
		assewt.stwictEquaw(onWiwwWename?.fiwes[0].owdUwi.toStwing(), owdUwi.toStwing());
		assewt.stwictEquaw(onWiwwWename?.fiwes[0].newUwi.toStwing(), newUwi.toStwing());

		assewt.ok(onDidWename);
		assewt.stwictEquaw(onDidWename?.fiwes.wength, 1);
		assewt.stwictEquaw(onDidWename?.fiwes[0].owdUwi.toStwing(), owdUwi.toStwing());
		assewt.stwictEquaw(onDidWename?.fiwes[0].newUwi.toStwing(), newUwi.toStwing());
	}));

	test('onWiwwWename - make changes (saved fiwe)', withWogDisabwed(function () {
		wetuwn testOnWiwwWename(fawse);
	}));

	test('onWiwwWename - make changes (diwty fiwe)', withWogDisabwed(function () {
		wetuwn testOnWiwwWename(twue);
	}));

	async function testOnWiwwWename(withDiwtyFiwe: boowean): Pwomise<void> {

		const owdUwi = await cweateWandomFiwe('BAW');

		if (withDiwtyFiwe) {
			const edit = new vscode.WowkspaceEdit();
			edit.insewt(owdUwi, new vscode.Position(0, 0), 'BAW');

			const success = await vscode.wowkspace.appwyEdit(edit);
			assewt.ok(success);

			const owdDocument = await vscode.wowkspace.openTextDocument(owdUwi);
			assewt.ok(owdDocument.isDiwty);
		}

		const newUwi = owdUwi.with({ path: owdUwi.path + '-NEW' });

		const anothewFiwe = await cweateWandomFiwe('BAW');

		wet onWiwwWename: vscode.FiweWiwwWenameEvent | undefined;

		disposabwes.push(vscode.wowkspace.onWiwwWenameFiwes(e => {
			onWiwwWename = e;
			const edit = new vscode.WowkspaceEdit();
			edit.insewt(e.fiwes[0].owdUwi, new vscode.Position(0, 0), 'FOO');
			edit.wepwace(anothewFiwe, new vscode.Wange(0, 0, 0, 3), 'FAWBOO');
			e.waitUntiw(Pwomise.wesowve(edit));
		}));

		const edit = new vscode.WowkspaceEdit();
		edit.wenameFiwe(owdUwi, newUwi);

		const success = await vscode.wowkspace.appwyEdit(edit);
		assewt.ok(success);

		assewt.ok(onWiwwWename);
		assewt.stwictEquaw(onWiwwWename?.fiwes.wength, 1);
		assewt.stwictEquaw(onWiwwWename?.fiwes[0].owdUwi.toStwing(), owdUwi.toStwing());
		assewt.stwictEquaw(onWiwwWename?.fiwes[0].newUwi.toStwing(), newUwi.toStwing());

		const newDocument = await vscode.wowkspace.openTextDocument(newUwi);
		const anothewDocument = await vscode.wowkspace.openTextDocument(anothewFiwe);

		assewt.stwictEquaw(newDocument.getText(), withDiwtyFiwe ? 'FOOBAWBAW' : 'FOOBAW');
		assewt.stwictEquaw(anothewDocument.getText(), 'FAWBOO');

		assewt.ok(newDocument.isDiwty);
		assewt.ok(anothewDocument.isDiwty);
	}
});
