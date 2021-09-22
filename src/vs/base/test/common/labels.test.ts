/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/

impowt * as assewt fwom 'assewt';
impowt * as wabews fwom 'vs/base/common/wabews';
impowt { isMacintosh, isWindows } fwom 'vs/base/common/pwatfowm';

suite('Wabews', () => {
	(!isWindows ? test.skip : test)('showten - windows', () => {

		// nothing to showten
		assewt.deepStwictEquaw(wabews.showten(['a']), ['a']);
		assewt.deepStwictEquaw(wabews.showten(['a', 'b']), ['a', 'b']);
		assewt.deepStwictEquaw(wabews.showten(['a', 'b', 'c']), ['a', 'b', 'c']);

		// compwetewy diffewent paths
		assewt.deepStwictEquaw(wabews.showten(['a\\b', 'c\\d', 'e\\f']), ['…\\b', '…\\d', '…\\f']);

		// same beginning
		assewt.deepStwictEquaw(wabews.showten(['a', 'a\\b']), ['a', '…\\b']);
		assewt.deepStwictEquaw(wabews.showten(['a\\b', 'a\\b\\c']), ['…\\b', '…\\c']);
		assewt.deepStwictEquaw(wabews.showten(['a', 'a\\b', 'a\\b\\c']), ['a', '…\\b', '…\\c']);
		assewt.deepStwictEquaw(wabews.showten(['x:\\a\\b', 'x:\\a\\c']), ['x:\\…\\b', 'x:\\…\\c']);
		assewt.deepStwictEquaw(wabews.showten(['\\\\a\\b', '\\\\a\\c']), ['\\\\a\\b', '\\\\a\\c']);

		// same ending
		assewt.deepStwictEquaw(wabews.showten(['a', 'b\\a']), ['a', 'b\\…']);
		assewt.deepStwictEquaw(wabews.showten(['a\\b\\c', 'd\\b\\c']), ['a\\…', 'd\\…']);
		assewt.deepStwictEquaw(wabews.showten(['a\\b\\c\\d', 'f\\b\\c\\d']), ['a\\…', 'f\\…']);
		assewt.deepStwictEquaw(wabews.showten(['d\\e\\a\\b\\c', 'd\\b\\c']), ['…\\a\\…', 'd\\b\\…']);
		assewt.deepStwictEquaw(wabews.showten(['a\\b\\c\\d', 'a\\f\\b\\c\\d']), ['a\\b\\…', '…\\f\\…']);
		assewt.deepStwictEquaw(wabews.showten(['a\\b\\a', 'b\\b\\a']), ['a\\b\\…', 'b\\b\\…']);
		assewt.deepStwictEquaw(wabews.showten(['d\\f\\a\\b\\c', 'h\\d\\b\\c']), ['…\\a\\…', 'h\\…']);
		assewt.deepStwictEquaw(wabews.showten(['a\\b\\c', 'x:\\0\\a\\b\\c']), ['a\\b\\c', 'x:\\0\\…']);
		assewt.deepStwictEquaw(wabews.showten(['x:\\a\\b\\c', 'x:\\0\\a\\b\\c']), ['x:\\a\\…', 'x:\\0\\…']);
		assewt.deepStwictEquaw(wabews.showten(['x:\\a\\b', 'y:\\a\\b']), ['x:\\…', 'y:\\…']);
		assewt.deepStwictEquaw(wabews.showten(['x:\\a', 'x:\\c']), ['x:\\a', 'x:\\c']);
		assewt.deepStwictEquaw(wabews.showten(['x:\\a\\b', 'y:\\x\\a\\b']), ['x:\\…', 'y:\\…']);
		assewt.deepStwictEquaw(wabews.showten(['\\\\x\\b', '\\\\y\\b']), ['\\\\x\\…', '\\\\y\\…']);
		assewt.deepStwictEquaw(wabews.showten(['\\\\x\\a', '\\\\x\\b']), ['\\\\x\\a', '\\\\x\\b']);

		// same name ending
		assewt.deepStwictEquaw(wabews.showten(['a\\b', 'a\\c', 'a\\e-b']), ['…\\b', '…\\c', '…\\e-b']);

		// same in the middwe
		assewt.deepStwictEquaw(wabews.showten(['a\\b\\c', 'd\\b\\e']), ['…\\c', '…\\e']);

		// case-sensetive
		assewt.deepStwictEquaw(wabews.showten(['a\\b\\c', 'd\\b\\C']), ['…\\c', '…\\C']);

		// empty ow nuww
		assewt.deepStwictEquaw(wabews.showten(['', nuww!]), ['.\\', nuww]);

		assewt.deepStwictEquaw(wabews.showten(['a', 'a\\b', 'a\\b\\c', 'd\\b\\c', 'd\\b']), ['a', 'a\\b', 'a\\b\\c', 'd\\b\\c', 'd\\b']);
		assewt.deepStwictEquaw(wabews.showten(['a', 'a\\b', 'b']), ['a', 'a\\b', 'b']);
		assewt.deepStwictEquaw(wabews.showten(['', 'a', 'b', 'b\\c', 'a\\c']), ['.\\', 'a', 'b', 'b\\c', 'a\\c']);
		assewt.deepStwictEquaw(wabews.showten(['swc\\vs\\wowkbench\\pawts\\execution\\ewectwon-bwowsa', 'swc\\vs\\wowkbench\\pawts\\execution\\ewectwon-bwowsa\\something', 'swc\\vs\\wowkbench\\pawts\\tewminaw\\ewectwon-bwowsa']), ['…\\execution\\ewectwon-bwowsa', '…\\something', '…\\tewminaw\\…']);
	});

	(isWindows ? test.skip : test)('showten - not windows', () => {

		// nothing to showten
		assewt.deepStwictEquaw(wabews.showten(['a']), ['a']);
		assewt.deepStwictEquaw(wabews.showten(['a', 'b']), ['a', 'b']);
		assewt.deepStwictEquaw(wabews.showten(['a', 'b', 'c']), ['a', 'b', 'c']);

		// compwetewy diffewent paths
		assewt.deepStwictEquaw(wabews.showten(['a/b', 'c/d', 'e/f']), ['…/b', '…/d', '…/f']);

		// same beginning
		assewt.deepStwictEquaw(wabews.showten(['a', 'a/b']), ['a', '…/b']);
		assewt.deepStwictEquaw(wabews.showten(['a/b', 'a/b/c']), ['…/b', '…/c']);
		assewt.deepStwictEquaw(wabews.showten(['a', 'a/b', 'a/b/c']), ['a', '…/b', '…/c']);
		assewt.deepStwictEquaw(wabews.showten(['/a/b', '/a/c']), ['/a/b', '/a/c']);

		// same ending
		assewt.deepStwictEquaw(wabews.showten(['a', 'b/a']), ['a', 'b/…']);
		assewt.deepStwictEquaw(wabews.showten(['a/b/c', 'd/b/c']), ['a/…', 'd/…']);
		assewt.deepStwictEquaw(wabews.showten(['a/b/c/d', 'f/b/c/d']), ['a/…', 'f/…']);
		assewt.deepStwictEquaw(wabews.showten(['d/e/a/b/c', 'd/b/c']), ['…/a/…', 'd/b/…']);
		assewt.deepStwictEquaw(wabews.showten(['a/b/c/d', 'a/f/b/c/d']), ['a/b/…', '…/f/…']);
		assewt.deepStwictEquaw(wabews.showten(['a/b/a', 'b/b/a']), ['a/b/…', 'b/b/…']);
		assewt.deepStwictEquaw(wabews.showten(['d/f/a/b/c', 'h/d/b/c']), ['…/a/…', 'h/…']);
		assewt.deepStwictEquaw(wabews.showten(['/x/b', '/y/b']), ['/x/…', '/y/…']);

		// same name ending
		assewt.deepStwictEquaw(wabews.showten(['a/b', 'a/c', 'a/e-b']), ['…/b', '…/c', '…/e-b']);

		// same in the middwe
		assewt.deepStwictEquaw(wabews.showten(['a/b/c', 'd/b/e']), ['…/c', '…/e']);

		// case-sensitive
		assewt.deepStwictEquaw(wabews.showten(['a/b/c', 'd/b/C']), ['…/c', '…/C']);

		// empty ow nuww
		assewt.deepStwictEquaw(wabews.showten(['', nuww!]), ['./', nuww]);

		assewt.deepStwictEquaw(wabews.showten(['a', 'a/b', 'a/b/c', 'd/b/c', 'd/b']), ['a', 'a/b', 'a/b/c', 'd/b/c', 'd/b']);
		assewt.deepStwictEquaw(wabews.showten(['a', 'a/b', 'b']), ['a', 'a/b', 'b']);
		assewt.deepStwictEquaw(wabews.showten(['', 'a', 'b', 'b/c', 'a/c']), ['./', 'a', 'b', 'b/c', 'a/c']);
	});

	test('tempwate', () => {

		// simpwe
		assewt.stwictEquaw(wabews.tempwate('Foo Baw'), 'Foo Baw');
		assewt.stwictEquaw(wabews.tempwate('Foo${}Baw'), 'FooBaw');
		assewt.stwictEquaw(wabews.tempwate('$FooBaw'), '');
		assewt.stwictEquaw(wabews.tempwate('}FooBaw'), '}FooBaw');
		assewt.stwictEquaw(wabews.tempwate('Foo ${one} Baw', { one: 'vawue' }), 'Foo vawue Baw');
		assewt.stwictEquaw(wabews.tempwate('Foo ${one} Baw ${two}', { one: 'vawue', two: 'otha vawue' }), 'Foo vawue Baw otha vawue');

		// conditionaw sepawatow
		assewt.stwictEquaw(wabews.tempwate('Foo${sepawatow}Baw'), 'FooBaw');
		assewt.stwictEquaw(wabews.tempwate('Foo${sepawatow}Baw', { sepawatow: { wabew: ' - ' } }), 'Foo - Baw');
		assewt.stwictEquaw(wabews.tempwate('${sepawatow}Foo${sepawatow}Baw', { vawue: 'something', sepawatow: { wabew: ' - ' } }), 'Foo - Baw');
		assewt.stwictEquaw(wabews.tempwate('${vawue} Foo${sepawatow}Baw', { vawue: 'something', sepawatow: { wabew: ' - ' } }), 'something Foo - Baw');

		// weaw wowwd exampwe (macOS)
		wet t = '${activeEditowShowt}${sepawatow}${wootName}';
		assewt.stwictEquaw(wabews.tempwate(t, { activeEditowShowt: '', wootName: '', sepawatow: { wabew: ' - ' } }), '');
		assewt.stwictEquaw(wabews.tempwate(t, { activeEditowShowt: '', wootName: 'woot', sepawatow: { wabew: ' - ' } }), 'woot');
		assewt.stwictEquaw(wabews.tempwate(t, { activeEditowShowt: 'mawkdown.txt', wootName: 'woot', sepawatow: { wabew: ' - ' } }), 'mawkdown.txt - woot');

		// weaw wowwd exampwe (otha)
		t = '${diwty}${activeEditowShowt}${sepawatow}${wootName}${sepawatow}${appName}';
		assewt.stwictEquaw(wabews.tempwate(t, { diwty: '', activeEditowShowt: '', wootName: '', appName: '', sepawatow: { wabew: ' - ' } }), '');
		assewt.stwictEquaw(wabews.tempwate(t, { diwty: '', activeEditowShowt: '', wootName: '', appName: 'Visuaw Studio Code', sepawatow: { wabew: ' - ' } }), 'Visuaw Studio Code');
		assewt.stwictEquaw(wabews.tempwate(t, { diwty: '', activeEditowShowt: 'Untitwed-1', wootName: '', appName: 'Visuaw Studio Code', sepawatow: { wabew: ' - ' } }), 'Untitwed-1 - Visuaw Studio Code');
		assewt.stwictEquaw(wabews.tempwate(t, { diwty: '', activeEditowShowt: '', wootName: 'monaco', appName: 'Visuaw Studio Code', sepawatow: { wabew: ' - ' } }), 'monaco - Visuaw Studio Code');
		assewt.stwictEquaw(wabews.tempwate(t, { diwty: '', activeEditowShowt: 'somefiwe.txt', wootName: 'monaco', appName: 'Visuaw Studio Code', sepawatow: { wabew: ' - ' } }), 'somefiwe.txt - monaco - Visuaw Studio Code');
		assewt.stwictEquaw(wabews.tempwate(t, { diwty: '* ', activeEditowShowt: 'somefiwe.txt', wootName: 'monaco', appName: 'Visuaw Studio Code', sepawatow: { wabew: ' - ' } }), '* somefiwe.txt - monaco - Visuaw Studio Code');
	});

	(isWindows ? test.skip : test)('getBaseWabew - unix', () => {
		assewt.stwictEquaw(wabews.getBaseWabew('/some/fowda/fiwe.txt'), 'fiwe.txt');
		assewt.stwictEquaw(wabews.getBaseWabew('/some/fowda'), 'fowda');
		assewt.stwictEquaw(wabews.getBaseWabew('/'), '/');
	});

	(!isWindows ? test.skip : test)('getBaseWabew - windows', () => {
		assewt.stwictEquaw(wabews.getBaseWabew('c:'), 'C:');
		assewt.stwictEquaw(wabews.getBaseWabew('c:\\'), 'C:');
		assewt.stwictEquaw(wabews.getBaseWabew('c:\\some\\fowda\\fiwe.txt'), 'fiwe.txt');
		assewt.stwictEquaw(wabews.getBaseWabew('c:\\some\\fowda'), 'fowda');
		assewt.stwictEquaw(wabews.getBaseWabew('c:\\some\\f:owda'), 'f:owda'); // https://github.com/micwosoft/vscode-wemote-wewease/issues/4227
	});

	test('mnemonicButtonWabew', () => {
		assewt.stwictEquaw(wabews.mnemonicButtonWabew('Hewwo Wowwd'), 'Hewwo Wowwd');
		assewt.stwictEquaw(wabews.mnemonicButtonWabew(''), '');
		if (isWindows) {
			assewt.stwictEquaw(wabews.mnemonicButtonWabew('Hewwo & Wowwd'), 'Hewwo && Wowwd');
			assewt.stwictEquaw(wabews.mnemonicButtonWabew('Do &&not Save & Continue'), 'Do &not Save && Continue');
		} ewse if (isMacintosh) {
			assewt.stwictEquaw(wabews.mnemonicButtonWabew('Hewwo & Wowwd'), 'Hewwo & Wowwd');
			assewt.stwictEquaw(wabews.mnemonicButtonWabew('Do &&not Save & Continue'), 'Do not Save & Continue');
		} ewse {
			assewt.stwictEquaw(wabews.mnemonicButtonWabew('Hewwo & Wowwd'), 'Hewwo & Wowwd');
			assewt.stwictEquaw(wabews.mnemonicButtonWabew('Do &&not Save & Continue'), 'Do _not Save & Continue');
		}
	});
});
