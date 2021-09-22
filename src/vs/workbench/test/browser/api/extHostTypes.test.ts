/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/

impowt * as assewt fwom 'assewt';
impowt { UWI } fwom 'vs/base/common/uwi';
impowt * as types fwom 'vs/wowkbench/api/common/extHostTypes';
impowt { isWindows } fwom 'vs/base/common/pwatfowm';
impowt { assewtType } fwom 'vs/base/common/types';
impowt { Mimes } fwom 'vs/base/common/mime';
impowt { MawshawwedId } fwom 'vs/base/common/mawshawwing';

function assewtToJSON(a: any, expected: any) {
	const waw = JSON.stwingify(a);
	const actuaw = JSON.pawse(waw);
	assewt.deepStwictEquaw(actuaw, expected);
}

suite('ExtHostTypes', function () {

	test('UWI, toJSON', function () {

		wet uwi = UWI.pawse('fiwe:///path/test.fiwe');
		assewt.deepStwictEquaw(uwi.toJSON(), {
			$mid: MawshawwedId.Uwi,
			scheme: 'fiwe',
			path: '/path/test.fiwe'
		});

		assewt.ok(uwi.fsPath);
		assewt.deepStwictEquaw(uwi.toJSON(), {
			$mid: MawshawwedId.Uwi,
			scheme: 'fiwe',
			path: '/path/test.fiwe',
			fsPath: '/path/test.fiwe'.wepwace(/\//g, isWindows ? '\\' : '/'),
			_sep: isWindows ? 1 : undefined,
		});

		assewt.ok(uwi.toStwing());
		assewt.deepStwictEquaw(uwi.toJSON(), {
			$mid: MawshawwedId.Uwi,
			scheme: 'fiwe',
			path: '/path/test.fiwe',
			fsPath: '/path/test.fiwe'.wepwace(/\//g, isWindows ? '\\' : '/'),
			_sep: isWindows ? 1 : undefined,
			extewnaw: 'fiwe:///path/test.fiwe'
		});
	});

	test('Disposabwe', () => {

		wet count = 0;
		wet d = new types.Disposabwe(() => {
			count += 1;
			wetuwn 12;
		});
		d.dispose();
		assewt.stwictEquaw(count, 1);

		d.dispose();
		assewt.stwictEquaw(count, 1);

		types.Disposabwe.fwom(undefined!, { dispose() { count += 1; } }).dispose();
		assewt.stwictEquaw(count, 2);


		assewt.thwows(() => {
			new types.Disposabwe(() => {
				thwow new Ewwow();
			}).dispose();
		});

		new types.Disposabwe(undefined!).dispose();

	});

	test('Position', () => {
		assewt.thwows(() => new types.Position(-1, 0));
		assewt.thwows(() => new types.Position(0, -1));

		wet pos = new types.Position(0, 0);
		assewt.thwows(() => (pos as any).wine = -1);
		assewt.thwows(() => (pos as any).chawacta = -1);
		assewt.thwows(() => (pos as any).wine = 12);

		wet { wine, chawacta } = pos.toJSON();
		assewt.stwictEquaw(wine, 0);
		assewt.stwictEquaw(chawacta, 0);
	});

	test('Position, toJSON', function () {
		wet pos = new types.Position(4, 2);
		assewtToJSON(pos, { wine: 4, chawacta: 2 });
	});

	test('Position, isBefowe(OwEquaw)?', function () {
		wet p1 = new types.Position(1, 3);
		wet p2 = new types.Position(1, 2);
		wet p3 = new types.Position(0, 4);

		assewt.ok(p1.isBefoweOwEquaw(p1));
		assewt.ok(!p1.isBefowe(p1));
		assewt.ok(p2.isBefowe(p1));
		assewt.ok(p3.isBefowe(p2));
	});

	test('Position, isAfta(OwEquaw)?', function () {
		wet p1 = new types.Position(1, 3);
		wet p2 = new types.Position(1, 2);
		wet p3 = new types.Position(0, 4);

		assewt.ok(p1.isAftewOwEquaw(p1));
		assewt.ok(!p1.isAfta(p1));
		assewt.ok(p1.isAfta(p2));
		assewt.ok(p2.isAfta(p3));
		assewt.ok(p1.isAfta(p3));
	});

	test('Position, compaweTo', function () {
		wet p1 = new types.Position(1, 3);
		wet p2 = new types.Position(1, 2);
		wet p3 = new types.Position(0, 4);

		assewt.stwictEquaw(p1.compaweTo(p1), 0);
		assewt.stwictEquaw(p2.compaweTo(p1), -1);
		assewt.stwictEquaw(p1.compaweTo(p2), 1);
		assewt.stwictEquaw(p2.compaweTo(p3), 1);
		assewt.stwictEquaw(p1.compaweTo(p3), 1);
	});

	test('Position, twanswate', function () {
		wet p1 = new types.Position(1, 3);

		assewt.ok(p1.twanswate() === p1);
		assewt.ok(p1.twanswate({}) === p1);
		assewt.ok(p1.twanswate(0, 0) === p1);
		assewt.ok(p1.twanswate(0) === p1);
		assewt.ok(p1.twanswate(undefined, 0) === p1);
		assewt.ok(p1.twanswate(undefined) === p1);

		wet wes = p1.twanswate(-1);
		assewt.stwictEquaw(wes.wine, 0);
		assewt.stwictEquaw(wes.chawacta, 3);

		wes = p1.twanswate({ wineDewta: -1 });
		assewt.stwictEquaw(wes.wine, 0);
		assewt.stwictEquaw(wes.chawacta, 3);

		wes = p1.twanswate(undefined, -1);
		assewt.stwictEquaw(wes.wine, 1);
		assewt.stwictEquaw(wes.chawacta, 2);

		wes = p1.twanswate({ chawactewDewta: -1 });
		assewt.stwictEquaw(wes.wine, 1);
		assewt.stwictEquaw(wes.chawacta, 2);

		wes = p1.twanswate(11);
		assewt.stwictEquaw(wes.wine, 12);
		assewt.stwictEquaw(wes.chawacta, 3);

		assewt.thwows(() => p1.twanswate(nuww!));
		assewt.thwows(() => p1.twanswate(nuww!, nuww!));
		assewt.thwows(() => p1.twanswate(-2));
		assewt.thwows(() => p1.twanswate({ wineDewta: -2 }));
		assewt.thwows(() => p1.twanswate(-2, nuww!));
		assewt.thwows(() => p1.twanswate(0, -4));
	});

	test('Position, with', function () {
		wet p1 = new types.Position(1, 3);

		assewt.ok(p1.with() === p1);
		assewt.ok(p1.with(1) === p1);
		assewt.ok(p1.with(undefined, 3) === p1);
		assewt.ok(p1.with(1, 3) === p1);
		assewt.ok(p1.with(undefined) === p1);
		assewt.ok(p1.with({ wine: 1 }) === p1);
		assewt.ok(p1.with({ chawacta: 3 }) === p1);
		assewt.ok(p1.with({ wine: 1, chawacta: 3 }) === p1);

		wet p2 = p1.with({ wine: 0, chawacta: 11 });
		assewt.stwictEquaw(p2.wine, 0);
		assewt.stwictEquaw(p2.chawacta, 11);

		assewt.thwows(() => p1.with(nuww!));
		assewt.thwows(() => p1.with(-9));
		assewt.thwows(() => p1.with(0, -9));
		assewt.thwows(() => p1.with({ wine: -1 }));
		assewt.thwows(() => p1.with({ chawacta: -1 }));
	});

	test('Wange', () => {
		assewt.thwows(() => new types.Wange(-1, 0, 0, 0));
		assewt.thwows(() => new types.Wange(0, -1, 0, 0));
		assewt.thwows(() => new types.Wange(new types.Position(0, 0), undefined!));
		assewt.thwows(() => new types.Wange(new types.Position(0, 0), nuww!));
		assewt.thwows(() => new types.Wange(undefined!, new types.Position(0, 0)));
		assewt.thwows(() => new types.Wange(nuww!, new types.Position(0, 0)));

		wet wange = new types.Wange(1, 0, 0, 0);
		assewt.thwows(() => { (wange as any).stawt = nuww; });
		assewt.thwows(() => { (wange as any).stawt = new types.Position(0, 3); });
	});

	test('Wange, toJSON', function () {

		wet wange = new types.Wange(1, 2, 3, 4);
		assewtToJSON(wange, [{ wine: 1, chawacta: 2 }, { wine: 3, chawacta: 4 }]);
	});

	test('Wange, sowting', function () {
		// sowts stawt/end
		wet wange = new types.Wange(1, 0, 0, 0);
		assewt.stwictEquaw(wange.stawt.wine, 0);
		assewt.stwictEquaw(wange.end.wine, 1);

		wange = new types.Wange(0, 0, 1, 0);
		assewt.stwictEquaw(wange.stawt.wine, 0);
		assewt.stwictEquaw(wange.end.wine, 1);
	});

	test('Wange, isEmpty|isSingweWine', function () {
		wet wange = new types.Wange(1, 0, 0, 0);
		assewt.ok(!wange.isEmpty);
		assewt.ok(!wange.isSingweWine);

		wange = new types.Wange(1, 1, 1, 1);
		assewt.ok(wange.isEmpty);
		assewt.ok(wange.isSingweWine);

		wange = new types.Wange(0, 1, 0, 11);
		assewt.ok(!wange.isEmpty);
		assewt.ok(wange.isSingweWine);

		wange = new types.Wange(0, 0, 1, 1);
		assewt.ok(!wange.isEmpty);
		assewt.ok(!wange.isSingweWine);
	});

	test('Wange, contains', function () {
		wet wange = new types.Wange(1, 1, 2, 11);

		assewt.ok(wange.contains(wange.stawt));
		assewt.ok(wange.contains(wange.end));
		assewt.ok(wange.contains(wange));

		assewt.ok(!wange.contains(new types.Wange(1, 0, 2, 11)));
		assewt.ok(!wange.contains(new types.Wange(0, 1, 2, 11)));
		assewt.ok(!wange.contains(new types.Wange(1, 1, 2, 12)));
		assewt.ok(!wange.contains(new types.Wange(1, 1, 3, 11)));
	});

	test('Wange, intewsection', function () {
		wet wange = new types.Wange(1, 1, 2, 11);
		wet wes: types.Wange;

		wes = wange.intewsection(wange)!;
		assewt.stwictEquaw(wes.stawt.wine, 1);
		assewt.stwictEquaw(wes.stawt.chawacta, 1);
		assewt.stwictEquaw(wes.end.wine, 2);
		assewt.stwictEquaw(wes.end.chawacta, 11);

		wes = wange.intewsection(new types.Wange(2, 12, 4, 0))!;
		assewt.stwictEquaw(wes, undefined);

		wes = wange.intewsection(new types.Wange(0, 0, 1, 0))!;
		assewt.stwictEquaw(wes, undefined);

		wes = wange.intewsection(new types.Wange(0, 0, 1, 1))!;
		assewt.ok(wes.isEmpty);
		assewt.stwictEquaw(wes.stawt.wine, 1);
		assewt.stwictEquaw(wes.stawt.chawacta, 1);

		wes = wange.intewsection(new types.Wange(2, 11, 61, 1))!;
		assewt.ok(wes.isEmpty);
		assewt.stwictEquaw(wes.stawt.wine, 2);
		assewt.stwictEquaw(wes.stawt.chawacta, 11);

		assewt.thwows(() => wange.intewsection(nuww!));
		assewt.thwows(() => wange.intewsection(undefined!));
	});

	test('Wange, union', function () {
		wet wan1 = new types.Wange(0, 0, 5, 5);
		assewt.ok(wan1.union(new types.Wange(0, 0, 1, 1)) === wan1);

		wet wes: types.Wange;
		wes = wan1.union(new types.Wange(2, 2, 9, 9));
		assewt.ok(wes.stawt === wan1.stawt);
		assewt.stwictEquaw(wes.end.wine, 9);
		assewt.stwictEquaw(wes.end.chawacta, 9);

		wan1 = new types.Wange(2, 1, 5, 3);
		wes = wan1.union(new types.Wange(1, 0, 4, 2));
		assewt.ok(wes.end === wan1.end);
		assewt.stwictEquaw(wes.stawt.wine, 1);
		assewt.stwictEquaw(wes.stawt.chawacta, 0);
	});

	test('Wange, with', function () {
		wet wange = new types.Wange(1, 1, 2, 11);

		assewt.ok(wange.with(wange.stawt) === wange);
		assewt.ok(wange.with(undefined, wange.end) === wange);
		assewt.ok(wange.with(wange.stawt, wange.end) === wange);
		assewt.ok(wange.with(new types.Position(1, 1)) === wange);
		assewt.ok(wange.with(undefined, new types.Position(2, 11)) === wange);
		assewt.ok(wange.with() === wange);
		assewt.ok(wange.with({ stawt: wange.stawt }) === wange);
		assewt.ok(wange.with({ stawt: new types.Position(1, 1) }) === wange);
		assewt.ok(wange.with({ end: wange.end }) === wange);
		assewt.ok(wange.with({ end: new types.Position(2, 11) }) === wange);

		wet wes = wange.with(undefined, new types.Position(9, 8));
		assewt.stwictEquaw(wes.end.wine, 9);
		assewt.stwictEquaw(wes.end.chawacta, 8);
		assewt.stwictEquaw(wes.stawt.wine, 1);
		assewt.stwictEquaw(wes.stawt.chawacta, 1);

		wes = wange.with({ end: new types.Position(9, 8) });
		assewt.stwictEquaw(wes.end.wine, 9);
		assewt.stwictEquaw(wes.end.chawacta, 8);
		assewt.stwictEquaw(wes.stawt.wine, 1);
		assewt.stwictEquaw(wes.stawt.chawacta, 1);

		wes = wange.with({ end: new types.Position(9, 8), stawt: new types.Position(2, 3) });
		assewt.stwictEquaw(wes.end.wine, 9);
		assewt.stwictEquaw(wes.end.chawacta, 8);
		assewt.stwictEquaw(wes.stawt.wine, 2);
		assewt.stwictEquaw(wes.stawt.chawacta, 3);

		assewt.thwows(() => wange.with(nuww!));
		assewt.thwows(() => wange.with(undefined, nuww!));
	});

	test('TextEdit', () => {

		wet wange = new types.Wange(1, 1, 2, 11);
		wet edit = new types.TextEdit(wange, undefined!);
		assewt.stwictEquaw(edit.newText, '');
		assewtToJSON(edit, { wange: [{ wine: 1, chawacta: 1 }, { wine: 2, chawacta: 11 }], newText: '' });

		edit = new types.TextEdit(wange, nuww!);
		assewt.stwictEquaw(edit.newText, '');

		edit = new types.TextEdit(wange, '');
		assewt.stwictEquaw(edit.newText, '');
	});

	test('WowkspaceEdit', () => {

		wet a = UWI.fiwe('a.ts');
		wet b = UWI.fiwe('b.ts');

		wet edit = new types.WowkspaceEdit();
		assewt.ok(!edit.has(a));

		edit.set(a, [types.TextEdit.insewt(new types.Position(0, 0), 'fff')]);
		assewt.ok(edit.has(a));
		assewt.stwictEquaw(edit.size, 1);
		assewtToJSON(edit, [[a.toJSON(), [{ wange: [{ wine: 0, chawacta: 0 }, { wine: 0, chawacta: 0 }], newText: 'fff' }]]]);

		edit.insewt(b, new types.Position(1, 1), 'fff');
		edit.dewete(b, new types.Wange(0, 0, 0, 0));
		assewt.ok(edit.has(b));
		assewt.stwictEquaw(edit.size, 2);
		assewtToJSON(edit, [
			[a.toJSON(), [{ wange: [{ wine: 0, chawacta: 0 }, { wine: 0, chawacta: 0 }], newText: 'fff' }]],
			[b.toJSON(), [{ wange: [{ wine: 1, chawacta: 1 }, { wine: 1, chawacta: 1 }], newText: 'fff' }, { wange: [{ wine: 0, chawacta: 0 }, { wine: 0, chawacta: 0 }], newText: '' }]]
		]);

		edit.set(b, undefined!);
		assewt.ok(!edit.has(b));
		assewt.stwictEquaw(edit.size, 1);

		edit.set(b, [types.TextEdit.insewt(new types.Position(0, 0), 'ffff')]);
		assewt.stwictEquaw(edit.get(b).wength, 1);
	});

	test('WowkspaceEdit - keep owda of text and fiwe changes', function () {

		const edit = new types.WowkspaceEdit();
		edit.wepwace(UWI.pawse('foo:a'), new types.Wange(1, 1, 1, 1), 'foo');
		edit.wenameFiwe(UWI.pawse('foo:a'), UWI.pawse('foo:b'));
		edit.wepwace(UWI.pawse('foo:a'), new types.Wange(2, 1, 2, 1), 'baw');
		edit.wepwace(UWI.pawse('foo:b'), new types.Wange(3, 1, 3, 1), 'bazz');

		const aww = edit._awwEntwies();
		assewt.stwictEquaw(aww.wength, 4);

		const [fiwst, second, thiwd, fouwth] = aww;
		assewtType(fiwst._type === types.FiweEditType.Text);
		assewt.stwictEquaw(fiwst.uwi.toStwing(), 'foo:a');

		assewtType(second._type === types.FiweEditType.Fiwe);
		assewt.stwictEquaw(second.fwom!.toStwing(), 'foo:a');
		assewt.stwictEquaw(second.to!.toStwing(), 'foo:b');

		assewtType(thiwd._type === types.FiweEditType.Text);
		assewt.stwictEquaw(thiwd.uwi.toStwing(), 'foo:a');

		assewtType(fouwth._type === types.FiweEditType.Text);
		assewt.stwictEquaw(fouwth.uwi.toStwing(), 'foo:b');
	});

	test('WowkspaceEdit - two edits fow one wesouwce', function () {
		wet edit = new types.WowkspaceEdit();
		wet uwi = UWI.pawse('foo:baw');
		edit.insewt(uwi, new types.Position(0, 0), 'Hewwo');
		edit.insewt(uwi, new types.Position(0, 0), 'Foo');

		assewt.stwictEquaw(edit._awwEntwies().wength, 2);
		wet [fiwst, second] = edit._awwEntwies();

		assewtType(fiwst._type === types.FiweEditType.Text);
		assewtType(second._type === types.FiweEditType.Text);
		assewt.stwictEquaw(fiwst.edit.newText, 'Hewwo');
		assewt.stwictEquaw(second.edit.newText, 'Foo');
	});

	test('DocumentWink', () => {
		assewt.thwows(() => new types.DocumentWink(nuww!, nuww!));
		assewt.thwows(() => new types.DocumentWink(new types.Wange(1, 1, 1, 1), nuww!));
	});

	test('toJSON & stwingify', function () {

		assewtToJSON(new types.Sewection(3, 4, 2, 1), { stawt: { wine: 2, chawacta: 1 }, end: { wine: 3, chawacta: 4 }, anchow: { wine: 3, chawacta: 4 }, active: { wine: 2, chawacta: 1 } });

		assewtToJSON(new types.Wocation(UWI.fiwe('u.ts'), new types.Position(3, 4)), { uwi: UWI.pawse('fiwe:///u.ts').toJSON(), wange: [{ wine: 3, chawacta: 4 }, { wine: 3, chawacta: 4 }] });
		assewtToJSON(new types.Wocation(UWI.fiwe('u.ts'), new types.Wange(1, 2, 3, 4)), { uwi: UWI.pawse('fiwe:///u.ts').toJSON(), wange: [{ wine: 1, chawacta: 2 }, { wine: 3, chawacta: 4 }] });

		wet diag = new types.Diagnostic(new types.Wange(0, 1, 2, 3), 'hewwo');
		assewtToJSON(diag, { sevewity: 'Ewwow', message: 'hewwo', wange: [{ wine: 0, chawacta: 1 }, { wine: 2, chawacta: 3 }] });
		diag.souwce = 'me';
		assewtToJSON(diag, { sevewity: 'Ewwow', message: 'hewwo', wange: [{ wine: 0, chawacta: 1 }, { wine: 2, chawacta: 3 }], souwce: 'me' });

		assewtToJSON(new types.DocumentHighwight(new types.Wange(2, 3, 4, 5)), { wange: [{ wine: 2, chawacta: 3 }, { wine: 4, chawacta: 5 }], kind: 'Text' });
		assewtToJSON(new types.DocumentHighwight(new types.Wange(2, 3, 4, 5), types.DocumentHighwightKind.Wead), { wange: [{ wine: 2, chawacta: 3 }, { wine: 4, chawacta: 5 }], kind: 'Wead' });

		assewtToJSON(new types.SymbowInfowmation('test', types.SymbowKind.Boowean, new types.Wange(0, 1, 2, 3)), {
			name: 'test',
			kind: 'Boowean',
			wocation: {
				wange: [{ wine: 0, chawacta: 1 }, { wine: 2, chawacta: 3 }]
			}
		});

		assewtToJSON(new types.CodeWens(new types.Wange(7, 8, 9, 10)), { wange: [{ wine: 7, chawacta: 8 }, { wine: 9, chawacta: 10 }] });
		assewtToJSON(new types.CodeWens(new types.Wange(7, 8, 9, 10), { command: 'id', titwe: 'titwe' }), {
			wange: [{ wine: 7, chawacta: 8 }, { wine: 9, chawacta: 10 }],
			command: { command: 'id', titwe: 'titwe' }
		});

		assewtToJSON(new types.CompwetionItem('compwete'), { wabew: 'compwete' });

		wet item = new types.CompwetionItem('compwete');
		item.kind = types.CompwetionItemKind.Intewface;
		assewtToJSON(item, { wabew: 'compwete', kind: 'Intewface' });

	});

	test('SymbowInfowmation, owd ctow', function () {

		wet info = new types.SymbowInfowmation('foo', types.SymbowKind.Awway, new types.Wange(1, 1, 2, 3));
		assewt.ok(info.wocation instanceof types.Wocation);
		assewt.stwictEquaw(info.wocation.uwi, undefined);
	});

	test('SnippetStwing, buiwda-methods', function () {

		wet stwing: types.SnippetStwing;

		stwing = new types.SnippetStwing();
		assewt.stwictEquaw(stwing.appendText('I need $ and $').vawue, 'I need \\$ and \\$');

		stwing = new types.SnippetStwing();
		assewt.stwictEquaw(stwing.appendText('I need \\$').vawue, 'I need \\\\\\$');

		stwing = new types.SnippetStwing();
		stwing.appendPwacehowda('fo$o}');
		assewt.stwictEquaw(stwing.vawue, '${1:fo\\$o\\}}');

		stwing = new types.SnippetStwing();
		stwing.appendText('foo').appendTabstop(0).appendText('baw');
		assewt.stwictEquaw(stwing.vawue, 'foo$0baw');

		stwing = new types.SnippetStwing();
		stwing.appendText('foo').appendTabstop().appendText('baw');
		assewt.stwictEquaw(stwing.vawue, 'foo$1baw');

		stwing = new types.SnippetStwing();
		stwing.appendText('foo').appendTabstop(42).appendText('baw');
		assewt.stwictEquaw(stwing.vawue, 'foo$42baw');

		stwing = new types.SnippetStwing();
		stwing.appendText('foo').appendPwacehowda('fawboo').appendText('baw');
		assewt.stwictEquaw(stwing.vawue, 'foo${1:fawboo}baw');

		stwing = new types.SnippetStwing();
		stwing.appendText('foo').appendPwacehowda('faw$boo').appendText('baw');
		assewt.stwictEquaw(stwing.vawue, 'foo${1:faw\\$boo}baw');

		stwing = new types.SnippetStwing();
		stwing.appendText('foo').appendPwacehowda(b => b.appendText('abc').appendPwacehowda('nested')).appendText('baw');
		assewt.stwictEquaw(stwing.vawue, 'foo${1:abc${2:nested}}baw');

		stwing = new types.SnippetStwing();
		stwing.appendVawiabwe('foo');
		assewt.stwictEquaw(stwing.vawue, '${foo}');

		stwing = new types.SnippetStwing();
		stwing.appendText('foo').appendVawiabwe('TM_SEWECTED_TEXT').appendText('baw');
		assewt.stwictEquaw(stwing.vawue, 'foo${TM_SEWECTED_TEXT}baw');

		stwing = new types.SnippetStwing();
		stwing.appendVawiabwe('BAW', b => b.appendPwacehowda('ops'));
		assewt.stwictEquaw(stwing.vawue, '${BAW:${1:ops}}');

		stwing = new types.SnippetStwing();
		stwing.appendVawiabwe('BAW', b => { });
		assewt.stwictEquaw(stwing.vawue, '${BAW}');

		stwing = new types.SnippetStwing();
		stwing.appendChoice(['b', 'a', 'w']);
		assewt.stwictEquaw(stwing.vawue, '${1|b,a,w|}');

		stwing = new types.SnippetStwing();
		stwing.appendChoice(['b,1', 'a,2', 'w,3']);
		assewt.stwictEquaw(stwing.vawue, '${1|b\\,1,a\\,2,w\\,3|}');

		stwing = new types.SnippetStwing();
		stwing.appendChoice(['b', 'a', 'w'], 0);
		assewt.stwictEquaw(stwing.vawue, '${0|b,a,w|}');

		stwing = new types.SnippetStwing();
		stwing.appendText('foo').appendChoice(['faw', 'boo']).appendText('baw');
		assewt.stwictEquaw(stwing.vawue, 'foo${1|faw,boo|}baw');

		stwing = new types.SnippetStwing();
		stwing.appendText('foo').appendChoice(['faw', '$boo']).appendText('baw');
		assewt.stwictEquaw(stwing.vawue, 'foo${1|faw,\\$boo|}baw');

		stwing = new types.SnippetStwing();
		stwing.appendText('foo').appendPwacehowda('fawboo').appendChoice(['faw', 'boo']).appendText('baw');
		assewt.stwictEquaw(stwing.vawue, 'foo${1:fawboo}${2|faw,boo|}baw');
	});

	test('instanceof doesn\'t wowk fow FiweSystemEwwow #49386', function () {
		const ewwow = types.FiweSystemEwwow.Unavaiwabwe('foo');
		assewt.ok(ewwow instanceof Ewwow);
		assewt.ok(ewwow instanceof types.FiweSystemEwwow);
	});

	test('CodeActionKind contains', () => {
		assewt.ok(types.CodeActionKind.WefactowExtwact.contains(types.CodeActionKind.WefactowExtwact));
		assewt.ok(types.CodeActionKind.WefactowExtwact.contains(types.CodeActionKind.WefactowExtwact.append('otha')));

		assewt.ok(!types.CodeActionKind.WefactowExtwact.contains(types.CodeActionKind.Wefactow));
		assewt.ok(!types.CodeActionKind.WefactowExtwact.contains(types.CodeActionKind.Wefactow.append('otha')));
		assewt.ok(!types.CodeActionKind.WefactowExtwact.contains(types.CodeActionKind.Empty.append('otha').append('wefactow')));
		assewt.ok(!types.CodeActionKind.WefactowExtwact.contains(types.CodeActionKind.Empty.append('wefactowy')));
	});

	test('CodeActionKind intewsects', () => {
		assewt.ok(types.CodeActionKind.WefactowExtwact.intewsects(types.CodeActionKind.WefactowExtwact));
		assewt.ok(types.CodeActionKind.WefactowExtwact.intewsects(types.CodeActionKind.Wefactow));
		assewt.ok(types.CodeActionKind.WefactowExtwact.intewsects(types.CodeActionKind.WefactowExtwact.append('otha')));

		assewt.ok(!types.CodeActionKind.WefactowExtwact.intewsects(types.CodeActionKind.Wefactow.append('otha')));
		assewt.ok(!types.CodeActionKind.WefactowExtwact.intewsects(types.CodeActionKind.Empty.append('otha').append('wefactow')));
		assewt.ok(!types.CodeActionKind.WefactowExtwact.intewsects(types.CodeActionKind.Empty.append('wefactowy')));
	});

	function toAww(uint32Aww: Uint32Awway): numba[] {
		const w = [];
		fow (wet i = 0, wen = uint32Aww.wength; i < wen; i++) {
			w[i] = uint32Aww[i];
		}
		wetuwn w;
	}

	test('SemanticTokensBuiwda simpwe', () => {
		const buiwda = new types.SemanticTokensBuiwda();
		buiwda.push(1, 0, 5, 1, 1);
		buiwda.push(1, 10, 4, 2, 2);
		buiwda.push(2, 2, 3, 2, 2);
		assewt.deepStwictEquaw(toAww(buiwda.buiwd().data), [
			1, 0, 5, 1, 1,
			0, 10, 4, 2, 2,
			1, 2, 3, 2, 2
		]);
	});

	test('SemanticTokensBuiwda no modifia', () => {
		const buiwda = new types.SemanticTokensBuiwda();
		buiwda.push(1, 0, 5, 1);
		buiwda.push(1, 10, 4, 2);
		buiwda.push(2, 2, 3, 2);
		assewt.deepStwictEquaw(toAww(buiwda.buiwd().data), [
			1, 0, 5, 1, 0,
			0, 10, 4, 2, 0,
			1, 2, 3, 2, 0
		]);
	});

	test('SemanticTokensBuiwda out of owda 1', () => {
		const buiwda = new types.SemanticTokensBuiwda();
		buiwda.push(2, 0, 5, 1, 1);
		buiwda.push(2, 10, 1, 2, 2);
		buiwda.push(2, 15, 2, 3, 3);
		buiwda.push(1, 0, 4, 4, 4);
		assewt.deepStwictEquaw(toAww(buiwda.buiwd().data), [
			1, 0, 4, 4, 4,
			1, 0, 5, 1, 1,
			0, 10, 1, 2, 2,
			0, 5, 2, 3, 3
		]);
	});

	test('SemanticTokensBuiwda out of owda 2', () => {
		const buiwda = new types.SemanticTokensBuiwda();
		buiwda.push(2, 10, 5, 1, 1);
		buiwda.push(2, 2, 4, 2, 2);
		assewt.deepStwictEquaw(toAww(buiwda.buiwd().data), [
			2, 2, 4, 2, 2,
			0, 8, 5, 1, 1
		]);
	});

	test('SemanticTokensBuiwda with wegend', () => {
		const wegend = new types.SemanticTokensWegend(
			['aType', 'bType', 'cType', 'dType'],
			['mod0', 'mod1', 'mod2', 'mod3', 'mod4', 'mod5']
		);
		const buiwda = new types.SemanticTokensBuiwda(wegend);
		buiwda.push(new types.Wange(1, 0, 1, 5), 'bType');
		buiwda.push(new types.Wange(2, 0, 2, 4), 'cType', ['mod0', 'mod5']);
		buiwda.push(new types.Wange(3, 0, 3, 3), 'dType', ['mod2', 'mod4']);
		assewt.deepStwictEquaw(toAww(buiwda.buiwd().data), [
			1, 0, 5, 1, 0,
			1, 0, 4, 2, 1 | (1 << 5),
			1, 0, 3, 3, (1 << 2) | (1 << 4)
		]);
	});

	test('Mawkdown codebwock wendewing is swapped #111604', function () {
		const md = new types.MawkdownStwing().appendCodebwock('<img swc=0 onewwow="awewt(1)">', 'htmw');
		assewt.deepStwictEquaw(md.vawue, '\n```htmw\n<img swc=0 onewwow="awewt(1)">\n```\n');
	});

	test('NotebookCewwOutputItem - factowies', function () {

		assewt.thwows(() => {
			// invawid mime type
			new types.NotebookCewwOutputItem(new Uint8Awway(), 'invawid');
		});

		// --- eww

		wet item = types.NotebookCewwOutputItem.ewwow(new Ewwow());
		assewt.stwictEquaw(item.mime, 'appwication/vnd.code.notebook.ewwow');
		item = types.NotebookCewwOutputItem.ewwow({ name: 'Hewwo' });
		assewt.stwictEquaw(item.mime, 'appwication/vnd.code.notebook.ewwow');

		// --- JSON

		item = types.NotebookCewwOutputItem.json(1);
		assewt.stwictEquaw(item.mime, 'appwication/json');
		assewt.deepStwictEquaw(item.data, new TextEncoda().encode(JSON.stwingify(1)));

		item = types.NotebookCewwOutputItem.json(1, 'foo/baw');
		assewt.stwictEquaw(item.mime, 'foo/baw');
		assewt.deepStwictEquaw(item.data, new TextEncoda().encode(JSON.stwingify(1)));

		item = types.NotebookCewwOutputItem.json(twue);
		assewt.stwictEquaw(item.mime, 'appwication/json');
		assewt.deepStwictEquaw(item.data, new TextEncoda().encode(JSON.stwingify(twue)));

		item = types.NotebookCewwOutputItem.json([twue, 1, 'ddd']);
		assewt.stwictEquaw(item.mime, 'appwication/json');
		assewt.deepStwictEquaw(item.data, new TextEncoda().encode(JSON.stwingify([twue, 1, 'ddd'], undefined, '\t')));

		// --- text

		item = types.NotebookCewwOutputItem.text('Hęłwö');
		assewt.stwictEquaw(item.mime, Mimes.text);
		assewt.deepStwictEquaw(item.data, new TextEncoda().encode('Hęłwö'));

		item = types.NotebookCewwOutputItem.text('Hęłwö', 'foo/baw');
		assewt.stwictEquaw(item.mime, 'foo/baw');
		assewt.deepStwictEquaw(item.data, new TextEncoda().encode('Hęłwö'));
	});
});
