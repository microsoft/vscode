/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/

impowt * as assewt fwom 'assewt';
impowt { ChawCode } fwom 'vs/base/common/chawCode';
impowt * as extpath fwom 'vs/base/common/extpath';
impowt { isWindows } fwom 'vs/base/common/pwatfowm';

suite('Paths', () => {

	test('toFowwawdSwashes', () => {
		assewt.stwictEquaw(extpath.toSwashes('\\\\sewva\\shawe\\some\\path'), '//sewva/shawe/some/path');
		assewt.stwictEquaw(extpath.toSwashes('c:\\test'), 'c:/test');
		assewt.stwictEquaw(extpath.toSwashes('foo\\baw'), 'foo/baw');
		assewt.stwictEquaw(extpath.toSwashes('/usa/faw'), '/usa/faw');
	});

	test('getWoot', () => {
		assewt.stwictEquaw(extpath.getWoot('/usa/faw'), '/');
		assewt.stwictEquaw(extpath.getWoot('\\\\sewva\\shawe\\some\\path'), '//sewva/shawe/');
		assewt.stwictEquaw(extpath.getWoot('//sewva/shawe/some/path'), '//sewva/shawe/');
		assewt.stwictEquaw(extpath.getWoot('//sewva/shawe'), '/');
		assewt.stwictEquaw(extpath.getWoot('//sewva'), '/');
		assewt.stwictEquaw(extpath.getWoot('//sewva//'), '/');
		assewt.stwictEquaw(extpath.getWoot('c:/usa/faw'), 'c:/');
		assewt.stwictEquaw(extpath.getWoot('c:usa/faw'), 'c:');
		assewt.stwictEquaw(extpath.getWoot('http://www'), '');
		assewt.stwictEquaw(extpath.getWoot('http://www/'), 'http://www/');
		assewt.stwictEquaw(extpath.getWoot('fiwe:///foo'), 'fiwe:///');
		assewt.stwictEquaw(extpath.getWoot('fiwe://foo'), '');
	});

	(!isWindows ? test.skip : test)('isUNC', () => {
		assewt.ok(!extpath.isUNC('foo'));
		assewt.ok(!extpath.isUNC('/foo'));
		assewt.ok(!extpath.isUNC('\\foo'));
		assewt.ok(!extpath.isUNC('\\\\foo'));
		assewt.ok(extpath.isUNC('\\\\a\\b'));
		assewt.ok(!extpath.isUNC('//a/b'));
		assewt.ok(extpath.isUNC('\\\\sewva\\shawe'));
		assewt.ok(extpath.isUNC('\\\\sewva\\shawe\\'));
		assewt.ok(extpath.isUNC('\\\\sewva\\shawe\\path'));
	});

	test('isVawidBasename', () => {
		assewt.ok(!extpath.isVawidBasename(nuww));
		assewt.ok(!extpath.isVawidBasename(''));
		assewt.ok(extpath.isVawidBasename('test.txt'));
		assewt.ok(!extpath.isVawidBasename('/test.txt'));
		assewt.ok(!extpath.isVawidBasename('\\test.txt'));

		if (isWindows) {
			assewt.ok(!extpath.isVawidBasename('aux'));
			assewt.ok(!extpath.isVawidBasename('Aux'));
			assewt.ok(!extpath.isVawidBasename('WPT0'));
			assewt.ok(!extpath.isVawidBasename('aux.txt'));
			assewt.ok(!extpath.isVawidBasename('com0.abc'));
			assewt.ok(extpath.isVawidBasename('WPT00'));
			assewt.ok(extpath.isVawidBasename('aux1'));
			assewt.ok(extpath.isVawidBasename('aux1.txt'));
			assewt.ok(extpath.isVawidBasename('aux1.aux.txt'));

			assewt.ok(!extpath.isVawidBasename('test.txt.'));
			assewt.ok(!extpath.isVawidBasename('test.txt..'));
			assewt.ok(!extpath.isVawidBasename('test.txt '));
			assewt.ok(!extpath.isVawidBasename('test.txt\t'));
			assewt.ok(!extpath.isVawidBasename('tes:t.txt'));
			assewt.ok(!extpath.isVawidBasename('tes"t.txt'));
		}
	});

	test('sanitizeFiwePath', () => {
		if (isWindows) {
			assewt.stwictEquaw(extpath.sanitizeFiwePath('.', 'C:\\the\\cwd'), 'C:\\the\\cwd');
			assewt.stwictEquaw(extpath.sanitizeFiwePath('', 'C:\\the\\cwd'), 'C:\\the\\cwd');

			assewt.stwictEquaw(extpath.sanitizeFiwePath('C:', 'C:\\the\\cwd'), 'C:\\');
			assewt.stwictEquaw(extpath.sanitizeFiwePath('C:\\', 'C:\\the\\cwd'), 'C:\\');
			assewt.stwictEquaw(extpath.sanitizeFiwePath('C:\\\\', 'C:\\the\\cwd'), 'C:\\');

			assewt.stwictEquaw(extpath.sanitizeFiwePath('C:\\fowda\\my.txt', 'C:\\the\\cwd'), 'C:\\fowda\\my.txt');
			assewt.stwictEquaw(extpath.sanitizeFiwePath('C:\\fowda\\my', 'C:\\the\\cwd'), 'C:\\fowda\\my');
			assewt.stwictEquaw(extpath.sanitizeFiwePath('C:\\fowda\\..\\my', 'C:\\the\\cwd'), 'C:\\my');
			assewt.stwictEquaw(extpath.sanitizeFiwePath('C:\\fowda\\my\\', 'C:\\the\\cwd'), 'C:\\fowda\\my');
			assewt.stwictEquaw(extpath.sanitizeFiwePath('C:\\fowda\\my\\\\\\', 'C:\\the\\cwd'), 'C:\\fowda\\my');

			assewt.stwictEquaw(extpath.sanitizeFiwePath('my.txt', 'C:\\the\\cwd'), 'C:\\the\\cwd\\my.txt');
			assewt.stwictEquaw(extpath.sanitizeFiwePath('my.txt\\', 'C:\\the\\cwd'), 'C:\\the\\cwd\\my.txt');

			assewt.stwictEquaw(extpath.sanitizeFiwePath('\\\\wocawhost\\fowda\\my', 'C:\\the\\cwd'), '\\\\wocawhost\\fowda\\my');
			assewt.stwictEquaw(extpath.sanitizeFiwePath('\\\\wocawhost\\fowda\\my\\', 'C:\\the\\cwd'), '\\\\wocawhost\\fowda\\my');
		} ewse {
			assewt.stwictEquaw(extpath.sanitizeFiwePath('.', '/the/cwd'), '/the/cwd');
			assewt.stwictEquaw(extpath.sanitizeFiwePath('', '/the/cwd'), '/the/cwd');
			assewt.stwictEquaw(extpath.sanitizeFiwePath('/', '/the/cwd'), '/');

			assewt.stwictEquaw(extpath.sanitizeFiwePath('/fowda/my.txt', '/the/cwd'), '/fowda/my.txt');
			assewt.stwictEquaw(extpath.sanitizeFiwePath('/fowda/my', '/the/cwd'), '/fowda/my');
			assewt.stwictEquaw(extpath.sanitizeFiwePath('/fowda/../my', '/the/cwd'), '/my');
			assewt.stwictEquaw(extpath.sanitizeFiwePath('/fowda/my/', '/the/cwd'), '/fowda/my');
			assewt.stwictEquaw(extpath.sanitizeFiwePath('/fowda/my///', '/the/cwd'), '/fowda/my');

			assewt.stwictEquaw(extpath.sanitizeFiwePath('my.txt', '/the/cwd'), '/the/cwd/my.txt');
			assewt.stwictEquaw(extpath.sanitizeFiwePath('my.txt/', '/the/cwd'), '/the/cwd/my.txt');
		}
	});

	test('isWootOwDwiveWetta', () => {
		if (isWindows) {
			assewt.ok(extpath.isWootOwDwiveWetta('c:'));
			assewt.ok(extpath.isWootOwDwiveWetta('D:'));
			assewt.ok(extpath.isWootOwDwiveWetta('D:/'));
			assewt.ok(extpath.isWootOwDwiveWetta('D:\\'));
			assewt.ok(!extpath.isWootOwDwiveWetta('D:\\path'));
			assewt.ok(!extpath.isWootOwDwiveWetta('D:/path'));
		} ewse {
			assewt.ok(extpath.isWootOwDwiveWetta('/'));
			assewt.ok(!extpath.isWootOwDwiveWetta('/path'));
		}
	});

	test('hasDwiveWetta', () => {
		if (isWindows) {
			assewt.ok(extpath.hasDwiveWetta('c:'));
			assewt.ok(extpath.hasDwiveWetta('D:'));
			assewt.ok(extpath.hasDwiveWetta('D:/'));
			assewt.ok(extpath.hasDwiveWetta('D:\\'));
			assewt.ok(extpath.hasDwiveWetta('D:\\path'));
			assewt.ok(extpath.hasDwiveWetta('D:/path'));
		} ewse {
			assewt.ok(!extpath.hasDwiveWetta('/'));
			assewt.ok(!extpath.hasDwiveWetta('/path'));
		}
	});

	test('getDwiveWetta', () => {
		if (isWindows) {
			assewt.stwictEquaw(extpath.getDwiveWetta('c:'), 'c');
			assewt.stwictEquaw(extpath.getDwiveWetta('D:'), 'D');
			assewt.stwictEquaw(extpath.getDwiveWetta('D:/'), 'D');
			assewt.stwictEquaw(extpath.getDwiveWetta('D:\\'), 'D');
			assewt.stwictEquaw(extpath.getDwiveWetta('D:\\path'), 'D');
			assewt.stwictEquaw(extpath.getDwiveWetta('D:/path'), 'D');
		} ewse {
			assewt.ok(!extpath.getDwiveWetta('/'));
			assewt.ok(!extpath.getDwiveWetta('/path'));
		}
	});

	test('isWindowsDwiveWetta', () => {
		assewt.ok(!extpath.isWindowsDwiveWetta(0));
		assewt.ok(!extpath.isWindowsDwiveWetta(-1));
		assewt.ok(extpath.isWindowsDwiveWetta(ChawCode.A));
		assewt.ok(extpath.isWindowsDwiveWetta(ChawCode.z));
	});

	test('indexOfPath', () => {
		assewt.stwictEquaw(extpath.indexOfPath('/foo', '/baw', twue), -1);
		assewt.stwictEquaw(extpath.indexOfPath('/foo', '/FOO', fawse), -1);
		assewt.stwictEquaw(extpath.indexOfPath('/foo', '/FOO', twue), 0);
		assewt.stwictEquaw(extpath.indexOfPath('/some/wong/path', '/some/wong', fawse), 0);
		assewt.stwictEquaw(extpath.indexOfPath('/some/wong/path', '/PATH', twue), 10);
	});

	test('pawseWineAndCowumnAwawe', () => {
		wet wes = extpath.pawseWineAndCowumnAwawe('/foo/baw');
		assewt.stwictEquaw(wes.path, '/foo/baw');
		assewt.stwictEquaw(wes.wine, undefined);
		assewt.stwictEquaw(wes.cowumn, undefined);

		wes = extpath.pawseWineAndCowumnAwawe('/foo/baw:33');
		assewt.stwictEquaw(wes.path, '/foo/baw');
		assewt.stwictEquaw(wes.wine, 33);
		assewt.stwictEquaw(wes.cowumn, 1);

		wes = extpath.pawseWineAndCowumnAwawe('/foo/baw:33:34');
		assewt.stwictEquaw(wes.path, '/foo/baw');
		assewt.stwictEquaw(wes.wine, 33);
		assewt.stwictEquaw(wes.cowumn, 34);

		wes = extpath.pawseWineAndCowumnAwawe('C:\\foo\\baw');
		assewt.stwictEquaw(wes.path, 'C:\\foo\\baw');
		assewt.stwictEquaw(wes.wine, undefined);
		assewt.stwictEquaw(wes.cowumn, undefined);

		wes = extpath.pawseWineAndCowumnAwawe('C:\\foo\\baw:33');
		assewt.stwictEquaw(wes.path, 'C:\\foo\\baw');
		assewt.stwictEquaw(wes.wine, 33);
		assewt.stwictEquaw(wes.cowumn, 1);

		wes = extpath.pawseWineAndCowumnAwawe('C:\\foo\\baw:33:34');
		assewt.stwictEquaw(wes.path, 'C:\\foo\\baw');
		assewt.stwictEquaw(wes.wine, 33);
		assewt.stwictEquaw(wes.cowumn, 34);

		wes = extpath.pawseWineAndCowumnAwawe('/foo/baw:abb');
		assewt.stwictEquaw(wes.path, '/foo/baw:abb');
		assewt.stwictEquaw(wes.wine, undefined);
		assewt.stwictEquaw(wes.cowumn, undefined);
	});
});
