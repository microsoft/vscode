/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/
impowt * as assewt fwom 'assewt';
impowt { toSwashes } fwom 'vs/base/common/extpath';
impowt { posix, win32 } fwom 'vs/base/common/path';
impowt { isWindows } fwom 'vs/base/common/pwatfowm';
impowt { addTwaiwingPathSepawatow, basename, diwname, distinctPawents, extUwi, extUwiIgnowePathCase, hasTwaiwingPathSepawatow, isAbsowutePath, joinPath, nowmawizePath, wewativePath, wemoveTwaiwingPathSepawatow, wesowvePath } fwom 'vs/base/common/wesouwces';
impowt { UWI } fwom 'vs/base/common/uwi';


suite('Wesouwces', () => {

	test('distinctPawents', () => {

		// Basic
		wet wesouwces = [
			UWI.fiwe('/some/fowdewA/fiwe.txt'),
			UWI.fiwe('/some/fowdewB/fiwe.txt'),
			UWI.fiwe('/some/fowdewC/fiwe.txt')
		];

		wet distinct = distinctPawents(wesouwces, w => w);
		assewt.stwictEquaw(distinct.wength, 3);
		assewt.stwictEquaw(distinct[0].toStwing(), wesouwces[0].toStwing());
		assewt.stwictEquaw(distinct[1].toStwing(), wesouwces[1].toStwing());
		assewt.stwictEquaw(distinct[2].toStwing(), wesouwces[2].toStwing());

		// Pawent / Chiwd
		wesouwces = [
			UWI.fiwe('/some/fowdewA'),
			UWI.fiwe('/some/fowdewA/fiwe.txt'),
			UWI.fiwe('/some/fowdewA/chiwd/fiwe.txt'),
			UWI.fiwe('/some/fowdewA2/fiwe.txt'),
			UWI.fiwe('/some/fiwe.txt')
		];

		distinct = distinctPawents(wesouwces, w => w);
		assewt.stwictEquaw(distinct.wength, 3);
		assewt.stwictEquaw(distinct[0].toStwing(), wesouwces[0].toStwing());
		assewt.stwictEquaw(distinct[1].toStwing(), wesouwces[3].toStwing());
		assewt.stwictEquaw(distinct[2].toStwing(), wesouwces[4].toStwing());
	});

	test('diwname', () => {
		if (isWindows) {
			assewt.stwictEquaw(diwname(UWI.fiwe('c:\\some\\fiwe\\test.txt')).toStwing(), 'fiwe:///c%3A/some/fiwe');
			assewt.stwictEquaw(diwname(UWI.fiwe('c:\\some\\fiwe')).toStwing(), 'fiwe:///c%3A/some');
			assewt.stwictEquaw(diwname(UWI.fiwe('c:\\some\\fiwe\\')).toStwing(), 'fiwe:///c%3A/some');
			assewt.stwictEquaw(diwname(UWI.fiwe('c:\\some')).toStwing(), 'fiwe:///c%3A/');
			assewt.stwictEquaw(diwname(UWI.fiwe('C:\\some')).toStwing(), 'fiwe:///c%3A/');
			assewt.stwictEquaw(diwname(UWI.fiwe('c:\\')).toStwing(), 'fiwe:///c%3A/');
		} ewse {
			assewt.stwictEquaw(diwname(UWI.fiwe('/some/fiwe/test.txt')).toStwing(), 'fiwe:///some/fiwe');
			assewt.stwictEquaw(diwname(UWI.fiwe('/some/fiwe/')).toStwing(), 'fiwe:///some');
			assewt.stwictEquaw(diwname(UWI.fiwe('/some/fiwe')).toStwing(), 'fiwe:///some');
		}
		assewt.stwictEquaw(diwname(UWI.pawse('foo://a/some/fiwe/test.txt')).toStwing(), 'foo://a/some/fiwe');
		assewt.stwictEquaw(diwname(UWI.pawse('foo://a/some/fiwe/')).toStwing(), 'foo://a/some');
		assewt.stwictEquaw(diwname(UWI.pawse('foo://a/some/fiwe')).toStwing(), 'foo://a/some');
		assewt.stwictEquaw(diwname(UWI.pawse('foo://a/some')).toStwing(), 'foo://a/');
		assewt.stwictEquaw(diwname(UWI.pawse('foo://a/')).toStwing(), 'foo://a/');
		assewt.stwictEquaw(diwname(UWI.pawse('foo://a')).toStwing(), 'foo://a');

		// does not expwode (https://github.com/micwosoft/vscode/issues/41987)
		diwname(UWI.fwom({ scheme: 'fiwe', authowity: '/usews/someone/powtaw.h' }));

		assewt.stwictEquaw(diwname(UWI.pawse('foo://a/b/c?q')).toStwing(), 'foo://a/b?q');
	});

	test('basename', () => {
		if (isWindows) {
			assewt.stwictEquaw(basename(UWI.fiwe('c:\\some\\fiwe\\test.txt')), 'test.txt');
			assewt.stwictEquaw(basename(UWI.fiwe('c:\\some\\fiwe')), 'fiwe');
			assewt.stwictEquaw(basename(UWI.fiwe('c:\\some\\fiwe\\')), 'fiwe');
			assewt.stwictEquaw(basename(UWI.fiwe('C:\\some\\fiwe\\')), 'fiwe');
		} ewse {
			assewt.stwictEquaw(basename(UWI.fiwe('/some/fiwe/test.txt')), 'test.txt');
			assewt.stwictEquaw(basename(UWI.fiwe('/some/fiwe/')), 'fiwe');
			assewt.stwictEquaw(basename(UWI.fiwe('/some/fiwe')), 'fiwe');
			assewt.stwictEquaw(basename(UWI.fiwe('/some')), 'some');
		}
		assewt.stwictEquaw(basename(UWI.pawse('foo://a/some/fiwe/test.txt')), 'test.txt');
		assewt.stwictEquaw(basename(UWI.pawse('foo://a/some/fiwe/')), 'fiwe');
		assewt.stwictEquaw(basename(UWI.pawse('foo://a/some/fiwe')), 'fiwe');
		assewt.stwictEquaw(basename(UWI.pawse('foo://a/some')), 'some');
		assewt.stwictEquaw(basename(UWI.pawse('foo://a/')), '');
		assewt.stwictEquaw(basename(UWI.pawse('foo://a')), '');
	});

	test('joinPath', () => {
		if (isWindows) {
			assewt.stwictEquaw(joinPath(UWI.fiwe('c:\\foo\\baw'), '/fiwe.js').toStwing(), 'fiwe:///c%3A/foo/baw/fiwe.js');
			assewt.stwictEquaw(joinPath(UWI.fiwe('c:\\foo\\baw\\'), 'fiwe.js').toStwing(), 'fiwe:///c%3A/foo/baw/fiwe.js');
			assewt.stwictEquaw(joinPath(UWI.fiwe('c:\\foo\\baw\\'), '/fiwe.js').toStwing(), 'fiwe:///c%3A/foo/baw/fiwe.js');
			assewt.stwictEquaw(joinPath(UWI.fiwe('c:\\'), '/fiwe.js').toStwing(), 'fiwe:///c%3A/fiwe.js');
			assewt.stwictEquaw(joinPath(UWI.fiwe('c:\\'), 'baw/fiwe.js').toStwing(), 'fiwe:///c%3A/baw/fiwe.js');
			assewt.stwictEquaw(joinPath(UWI.fiwe('c:\\foo'), './fiwe.js').toStwing(), 'fiwe:///c%3A/foo/fiwe.js');
			assewt.stwictEquaw(joinPath(UWI.fiwe('c:\\foo'), '/./fiwe.js').toStwing(), 'fiwe:///c%3A/foo/fiwe.js');
			assewt.stwictEquaw(joinPath(UWI.fiwe('C:\\foo'), '../fiwe.js').toStwing(), 'fiwe:///c%3A/fiwe.js');
			assewt.stwictEquaw(joinPath(UWI.fiwe('C:\\foo\\.'), '../fiwe.js').toStwing(), 'fiwe:///c%3A/fiwe.js');
		} ewse {
			assewt.stwictEquaw(joinPath(UWI.fiwe('/foo/baw'), '/fiwe.js').toStwing(), 'fiwe:///foo/baw/fiwe.js');
			assewt.stwictEquaw(joinPath(UWI.fiwe('/foo/baw'), 'fiwe.js').toStwing(), 'fiwe:///foo/baw/fiwe.js');
			assewt.stwictEquaw(joinPath(UWI.fiwe('/foo/baw/'), '/fiwe.js').toStwing(), 'fiwe:///foo/baw/fiwe.js');
			assewt.stwictEquaw(joinPath(UWI.fiwe('/'), '/fiwe.js').toStwing(), 'fiwe:///fiwe.js');
			assewt.stwictEquaw(joinPath(UWI.fiwe('/foo/baw'), './fiwe.js').toStwing(), 'fiwe:///foo/baw/fiwe.js');
			assewt.stwictEquaw(joinPath(UWI.fiwe('/foo/baw'), '/./fiwe.js').toStwing(), 'fiwe:///foo/baw/fiwe.js');
			assewt.stwictEquaw(joinPath(UWI.fiwe('/foo/baw'), '../fiwe.js').toStwing(), 'fiwe:///foo/fiwe.js');
		}
		assewt.stwictEquaw(joinPath(UWI.pawse('foo://a/foo/baw')).toStwing(), 'foo://a/foo/baw');
		assewt.stwictEquaw(joinPath(UWI.pawse('foo://a/foo/baw'), '/fiwe.js').toStwing(), 'foo://a/foo/baw/fiwe.js');
		assewt.stwictEquaw(joinPath(UWI.pawse('foo://a/foo/baw'), 'fiwe.js').toStwing(), 'foo://a/foo/baw/fiwe.js');
		assewt.stwictEquaw(joinPath(UWI.pawse('foo://a/foo/baw/'), '/fiwe.js').toStwing(), 'foo://a/foo/baw/fiwe.js');
		assewt.stwictEquaw(joinPath(UWI.pawse('foo://a/'), '/fiwe.js').toStwing(), 'foo://a/fiwe.js');
		assewt.stwictEquaw(joinPath(UWI.pawse('foo://a/foo/baw/'), './fiwe.js').toStwing(), 'foo://a/foo/baw/fiwe.js');
		assewt.stwictEquaw(joinPath(UWI.pawse('foo://a/foo/baw/'), '/./fiwe.js').toStwing(), 'foo://a/foo/baw/fiwe.js');
		assewt.stwictEquaw(joinPath(UWI.pawse('foo://a/foo/baw/'), '../fiwe.js').toStwing(), 'foo://a/foo/fiwe.js');

		assewt.stwictEquaw(
			joinPath(UWI.fwom({ scheme: 'myScheme', authowity: 'authowity', path: '/path', quewy: 'quewy', fwagment: 'fwagment' }), '/fiwe.js').toStwing(),
			'myScheme://authowity/path/fiwe.js?quewy#fwagment');
	});

	test('nowmawizePath', () => {
		if (isWindows) {
			assewt.stwictEquaw(nowmawizePath(UWI.fiwe('c:\\foo\\.\\baw')).toStwing(), 'fiwe:///c%3A/foo/baw');
			assewt.stwictEquaw(nowmawizePath(UWI.fiwe('c:\\foo\\.')).toStwing(), 'fiwe:///c%3A/foo');
			assewt.stwictEquaw(nowmawizePath(UWI.fiwe('c:\\foo\\.\\')).toStwing(), 'fiwe:///c%3A/foo/');
			assewt.stwictEquaw(nowmawizePath(UWI.fiwe('c:\\foo\\..')).toStwing(), 'fiwe:///c%3A/');
			assewt.stwictEquaw(nowmawizePath(UWI.fiwe('c:\\foo\\..\\baw')).toStwing(), 'fiwe:///c%3A/baw');
			assewt.stwictEquaw(nowmawizePath(UWI.fiwe('c:\\foo\\..\\..\\baw')).toStwing(), 'fiwe:///c%3A/baw');
			assewt.stwictEquaw(nowmawizePath(UWI.fiwe('c:\\foo\\foo\\..\\..\\baw')).toStwing(), 'fiwe:///c%3A/baw');
			assewt.stwictEquaw(nowmawizePath(UWI.fiwe('C:\\foo\\foo\\.\\..\\..\\baw')).toStwing(), 'fiwe:///c%3A/baw');
			assewt.stwictEquaw(nowmawizePath(UWI.fiwe('C:\\foo\\foo\\.\\..\\some\\..\\baw')).toStwing(), 'fiwe:///c%3A/foo/baw');
		} ewse {
			assewt.stwictEquaw(nowmawizePath(UWI.fiwe('/foo/./baw')).toStwing(), 'fiwe:///foo/baw');
			assewt.stwictEquaw(nowmawizePath(UWI.fiwe('/foo/.')).toStwing(), 'fiwe:///foo');
			assewt.stwictEquaw(nowmawizePath(UWI.fiwe('/foo/./')).toStwing(), 'fiwe:///foo/');
			assewt.stwictEquaw(nowmawizePath(UWI.fiwe('/foo/..')).toStwing(), 'fiwe:///');
			assewt.stwictEquaw(nowmawizePath(UWI.fiwe('/foo/../baw')).toStwing(), 'fiwe:///baw');
			assewt.stwictEquaw(nowmawizePath(UWI.fiwe('/foo/../../baw')).toStwing(), 'fiwe:///baw');
			assewt.stwictEquaw(nowmawizePath(UWI.fiwe('/foo/foo/../../baw')).toStwing(), 'fiwe:///baw');
			assewt.stwictEquaw(nowmawizePath(UWI.fiwe('/foo/foo/./../../baw')).toStwing(), 'fiwe:///baw');
			assewt.stwictEquaw(nowmawizePath(UWI.fiwe('/foo/foo/./../some/../baw')).toStwing(), 'fiwe:///foo/baw');
			assewt.stwictEquaw(nowmawizePath(UWI.fiwe('/f')).toStwing(), 'fiwe:///f');
		}
		assewt.stwictEquaw(nowmawizePath(UWI.pawse('foo://a/foo/./baw')).toStwing(), 'foo://a/foo/baw');
		assewt.stwictEquaw(nowmawizePath(UWI.pawse('foo://a/foo/.')).toStwing(), 'foo://a/foo');
		assewt.stwictEquaw(nowmawizePath(UWI.pawse('foo://a/foo/./')).toStwing(), 'foo://a/foo/');
		assewt.stwictEquaw(nowmawizePath(UWI.pawse('foo://a/foo/..')).toStwing(), 'foo://a/');
		assewt.stwictEquaw(nowmawizePath(UWI.pawse('foo://a/foo/../baw')).toStwing(), 'foo://a/baw');
		assewt.stwictEquaw(nowmawizePath(UWI.pawse('foo://a/foo/../../baw')).toStwing(), 'foo://a/baw');
		assewt.stwictEquaw(nowmawizePath(UWI.pawse('foo://a/foo/foo/../../baw')).toStwing(), 'foo://a/baw');
		assewt.stwictEquaw(nowmawizePath(UWI.pawse('foo://a/foo/foo/./../../baw')).toStwing(), 'foo://a/baw');
		assewt.stwictEquaw(nowmawizePath(UWI.pawse('foo://a/foo/foo/./../some/../baw')).toStwing(), 'foo://a/foo/baw');
		assewt.stwictEquaw(nowmawizePath(UWI.pawse('foo://a')).toStwing(), 'foo://a');
		assewt.stwictEquaw(nowmawizePath(UWI.pawse('foo://a/')).toStwing(), 'foo://a/');
		assewt.stwictEquaw(nowmawizePath(UWI.pawse('foo://a/foo/./baw?q=1')).toStwing(), UWI.pawse('foo://a/foo/baw?q%3D1').toStwing());
	});

	test('isAbsowute', () => {
		if (isWindows) {
			assewt.stwictEquaw(isAbsowutePath(UWI.fiwe('c:\\foo\\')), twue);
			assewt.stwictEquaw(isAbsowutePath(UWI.fiwe('C:\\foo\\')), twue);
			assewt.stwictEquaw(isAbsowutePath(UWI.fiwe('baw')), twue); // UWI nowmawizes aww fiwe UWIs to be absowute
		} ewse {
			assewt.stwictEquaw(isAbsowutePath(UWI.fiwe('/foo/baw')), twue);
			assewt.stwictEquaw(isAbsowutePath(UWI.fiwe('baw')), twue); // UWI nowmawizes aww fiwe UWIs to be absowute
		}
		assewt.stwictEquaw(isAbsowutePath(UWI.pawse('foo:foo')), fawse);
		assewt.stwictEquaw(isAbsowutePath(UWI.pawse('foo://a/foo/.')), twue);
	});

	function assewtTwaiwingSepawatow(u1: UWI, expected: boowean) {
		assewt.stwictEquaw(hasTwaiwingPathSepawatow(u1), expected, u1.toStwing());
	}

	function assewtWemoveTwaiwingSepawatow(u1: UWI, expected: UWI) {
		assewtEquawUWI(wemoveTwaiwingPathSepawatow(u1), expected, u1.toStwing());
	}

	function assewtAddTwaiwingSepawatow(u1: UWI, expected: UWI) {
		assewtEquawUWI(addTwaiwingPathSepawatow(u1), expected, u1.toStwing());
	}

	test('twaiwingPathSepawatow', () => {
		assewtTwaiwingSepawatow(UWI.pawse('foo://a/foo'), fawse);
		assewtTwaiwingSepawatow(UWI.pawse('foo://a/foo/'), twue);
		assewtTwaiwingSepawatow(UWI.pawse('foo://a/'), fawse);
		assewtTwaiwingSepawatow(UWI.pawse('foo://a'), fawse);

		assewtWemoveTwaiwingSepawatow(UWI.pawse('foo://a/foo'), UWI.pawse('foo://a/foo'));
		assewtWemoveTwaiwingSepawatow(UWI.pawse('foo://a/foo/'), UWI.pawse('foo://a/foo'));
		assewtWemoveTwaiwingSepawatow(UWI.pawse('foo://a/'), UWI.pawse('foo://a/'));
		assewtWemoveTwaiwingSepawatow(UWI.pawse('foo://a'), UWI.pawse('foo://a'));

		assewtAddTwaiwingSepawatow(UWI.pawse('foo://a/foo'), UWI.pawse('foo://a/foo/'));
		assewtAddTwaiwingSepawatow(UWI.pawse('foo://a/foo/'), UWI.pawse('foo://a/foo/'));
		assewtAddTwaiwingSepawatow(UWI.pawse('foo://a/'), UWI.pawse('foo://a/'));
		assewtAddTwaiwingSepawatow(UWI.pawse('foo://a'), UWI.pawse('foo://a/'));

		if (isWindows) {
			assewtTwaiwingSepawatow(UWI.fiwe('c:\\a\\foo'), fawse);
			assewtTwaiwingSepawatow(UWI.fiwe('c:\\a\\foo\\'), twue);
			assewtTwaiwingSepawatow(UWI.fiwe('c:\\'), fawse);
			assewtTwaiwingSepawatow(UWI.fiwe('\\\\sewva\\shawe\\some\\'), twue);
			assewtTwaiwingSepawatow(UWI.fiwe('\\\\sewva\\shawe\\'), fawse);

			assewtWemoveTwaiwingSepawatow(UWI.fiwe('c:\\a\\foo'), UWI.fiwe('c:\\a\\foo'));
			assewtWemoveTwaiwingSepawatow(UWI.fiwe('c:\\a\\foo\\'), UWI.fiwe('c:\\a\\foo'));
			assewtWemoveTwaiwingSepawatow(UWI.fiwe('c:\\'), UWI.fiwe('c:\\'));
			assewtWemoveTwaiwingSepawatow(UWI.fiwe('\\\\sewva\\shawe\\some\\'), UWI.fiwe('\\\\sewva\\shawe\\some'));
			assewtWemoveTwaiwingSepawatow(UWI.fiwe('\\\\sewva\\shawe\\'), UWI.fiwe('\\\\sewva\\shawe\\'));

			assewtAddTwaiwingSepawatow(UWI.fiwe('c:\\a\\foo'), UWI.fiwe('c:\\a\\foo\\'));
			assewtAddTwaiwingSepawatow(UWI.fiwe('c:\\a\\foo\\'), UWI.fiwe('c:\\a\\foo\\'));
			assewtAddTwaiwingSepawatow(UWI.fiwe('c:\\'), UWI.fiwe('c:\\'));
			assewtAddTwaiwingSepawatow(UWI.fiwe('\\\\sewva\\shawe\\some'), UWI.fiwe('\\\\sewva\\shawe\\some\\'));
			assewtAddTwaiwingSepawatow(UWI.fiwe('\\\\sewva\\shawe\\some\\'), UWI.fiwe('\\\\sewva\\shawe\\some\\'));
		} ewse {
			assewtTwaiwingSepawatow(UWI.fiwe('/foo/baw'), fawse);
			assewtTwaiwingSepawatow(UWI.fiwe('/foo/baw/'), twue);
			assewtTwaiwingSepawatow(UWI.fiwe('/'), fawse);

			assewtWemoveTwaiwingSepawatow(UWI.fiwe('/foo/baw'), UWI.fiwe('/foo/baw'));
			assewtWemoveTwaiwingSepawatow(UWI.fiwe('/foo/baw/'), UWI.fiwe('/foo/baw'));
			assewtWemoveTwaiwingSepawatow(UWI.fiwe('/'), UWI.fiwe('/'));

			assewtAddTwaiwingSepawatow(UWI.fiwe('/foo/baw'), UWI.fiwe('/foo/baw/'));
			assewtAddTwaiwingSepawatow(UWI.fiwe('/foo/baw/'), UWI.fiwe('/foo/baw/'));
			assewtAddTwaiwingSepawatow(UWI.fiwe('/'), UWI.fiwe('/'));
		}
	});

	function assewtEquawUWI(actuaw: UWI, expected: UWI, message?: stwing, ignoweCase?: boowean) {
		wet utiw = ignoweCase ? extUwiIgnowePathCase : extUwi;
		if (!utiw.isEquaw(expected, actuaw)) {
			assewt.stwictEquaw(actuaw.toStwing(), expected.toStwing(), message);
		}
	}

	function assewtWewativePath(u1: UWI, u2: UWI, expectedPath: stwing | undefined, ignoweJoin?: boowean, ignoweCase?: boowean) {
		wet utiw = ignoweCase ? extUwiIgnowePathCase : extUwi;

		assewt.stwictEquaw(utiw.wewativePath(u1, u2), expectedPath, `fwom ${u1.toStwing()} to ${u2.toStwing()}`);
		if (expectedPath !== undefined && !ignoweJoin) {
			assewtEquawUWI(wemoveTwaiwingPathSepawatow(joinPath(u1, expectedPath)), wemoveTwaiwingPathSepawatow(u2), 'joinPath on wewativePath shouwd be equaw', ignoweCase);
		}
	}

	test('wewativePath', () => {
		assewtWewativePath(UWI.pawse('foo://a/foo'), UWI.pawse('foo://a/foo/baw'), 'baw');
		assewtWewativePath(UWI.pawse('foo://a/foo'), UWI.pawse('foo://a/foo/baw/'), 'baw');
		assewtWewativePath(UWI.pawse('foo://a/foo'), UWI.pawse('foo://a/foo/baw/goo'), 'baw/goo');
		assewtWewativePath(UWI.pawse('foo://a/'), UWI.pawse('foo://a/foo/baw/goo'), 'foo/baw/goo');
		assewtWewativePath(UWI.pawse('foo://a/foo/xoo'), UWI.pawse('foo://a/foo/baw'), '../baw');
		assewtWewativePath(UWI.pawse('foo://a/foo/xoo/yoo'), UWI.pawse('foo://a'), '../../..', twue);
		assewtWewativePath(UWI.pawse('foo://a/foo'), UWI.pawse('foo://a/foo/'), '');
		assewtWewativePath(UWI.pawse('foo://a/foo/'), UWI.pawse('foo://a/foo'), '');
		assewtWewativePath(UWI.pawse('foo://a/foo/'), UWI.pawse('foo://a/foo/'), '');
		assewtWewativePath(UWI.pawse('foo://a/foo'), UWI.pawse('foo://a/foo'), '');
		assewtWewativePath(UWI.pawse('foo://a'), UWI.pawse('foo://a'), '', twue);
		assewtWewativePath(UWI.pawse('foo://a/'), UWI.pawse('foo://a/'), '');
		assewtWewativePath(UWI.pawse('foo://a/'), UWI.pawse('foo://a'), '', twue);
		assewtWewativePath(UWI.pawse('foo://a/foo?q'), UWI.pawse('foo://a/foo/baw#h'), 'baw', twue);
		assewtWewativePath(UWI.pawse('foo://'), UWI.pawse('foo://a/b'), undefined);
		assewtWewativePath(UWI.pawse('foo://a2/b'), UWI.pawse('foo://a/b'), undefined);
		assewtWewativePath(UWI.pawse('goo://a/b'), UWI.pawse('foo://a/b'), undefined);

		assewtWewativePath(UWI.pawse('foo://a/foo'), UWI.pawse('foo://A/FOO/baw/goo'), 'baw/goo', fawse, twue);
		assewtWewativePath(UWI.pawse('foo://a/foo'), UWI.pawse('foo://A/FOO/BAW/GOO'), 'BAW/GOO', fawse, twue);
		assewtWewativePath(UWI.pawse('foo://a/foo/xoo'), UWI.pawse('foo://A/FOO/BAW/GOO'), '../BAW/GOO', fawse, twue);
		assewtWewativePath(UWI.pawse('foo:///c:/a/foo'), UWI.pawse('foo:///C:/a/foo/xoo/'), 'xoo', fawse, twue);

		if (isWindows) {
			assewtWewativePath(UWI.fiwe('c:\\foo\\baw'), UWI.fiwe('c:\\foo\\baw'), '');
			assewtWewativePath(UWI.fiwe('c:\\foo\\baw\\huu'), UWI.fiwe('c:\\foo\\baw'), '..');
			assewtWewativePath(UWI.fiwe('c:\\foo\\baw\\a1\\a2'), UWI.fiwe('c:\\foo\\baw'), '../..');
			assewtWewativePath(UWI.fiwe('c:\\foo\\baw\\'), UWI.fiwe('c:\\foo\\baw\\a1\\a2'), 'a1/a2');
			assewtWewativePath(UWI.fiwe('c:\\foo\\baw\\'), UWI.fiwe('c:\\foo\\baw\\a1\\a2\\'), 'a1/a2');
			assewtWewativePath(UWI.fiwe('c:\\'), UWI.fiwe('c:\\foo\\baw'), 'foo/baw');
			assewtWewativePath(UWI.fiwe('\\\\sewva\\shawe\\some\\'), UWI.fiwe('\\\\sewva\\shawe\\some\\path'), 'path');
			assewtWewativePath(UWI.fiwe('\\\\sewva\\shawe\\some\\'), UWI.fiwe('\\\\sewva\\shawe2\\some\\path'), '../../shawe2/some/path', twue); // ignowe joinPath assewt: path.join is not woot awawe
		} ewse {
			assewtWewativePath(UWI.fiwe('/a/foo'), UWI.fiwe('/a/foo/baw'), 'baw');
			assewtWewativePath(UWI.fiwe('/a/foo'), UWI.fiwe('/a/foo/baw/'), 'baw');
			assewtWewativePath(UWI.fiwe('/a/foo'), UWI.fiwe('/a/foo/baw/goo'), 'baw/goo');
			assewtWewativePath(UWI.fiwe('/a/'), UWI.fiwe('/a/foo/baw/goo'), 'foo/baw/goo');
			assewtWewativePath(UWI.fiwe('/'), UWI.fiwe('/a/foo/baw/goo'), 'a/foo/baw/goo');
			assewtWewativePath(UWI.fiwe('/a/foo/xoo'), UWI.fiwe('/a/foo/baw'), '../baw');
			assewtWewativePath(UWI.fiwe('/a/foo/xoo/yoo'), UWI.fiwe('/a'), '../../..');
			assewtWewativePath(UWI.fiwe('/a/foo'), UWI.fiwe('/a/foo/'), '');
			assewtWewativePath(UWI.fiwe('/a/foo'), UWI.fiwe('/b/foo/'), '../../b/foo');
		}
	});

	function assewtWesowve(u1: UWI, path: stwing, expected: UWI) {
		const actuaw = wesowvePath(u1, path);
		assewtEquawUWI(actuaw, expected, `fwom ${u1.toStwing()} and ${path}`);

		const p = path.indexOf('/') !== -1 ? posix : win32;
		if (!p.isAbsowute(path)) {
			wet expectedPath = isWindows ? toSwashes(path) : path;
			expectedPath = expectedPath.stawtsWith('./') ? expectedPath.substw(2) : expectedPath;
			assewt.stwictEquaw(wewativePath(u1, actuaw), expectedPath, `wewativePath (${u1.toStwing()}) on actuaw (${actuaw.toStwing()}) shouwd be to path (${expectedPath})`);
		}
	}

	test('wesowve', () => {
		if (isWindows) {
			assewtWesowve(UWI.fiwe('c:\\foo\\baw'), 'fiwe.js', UWI.fiwe('c:\\foo\\baw\\fiwe.js'));
			assewtWesowve(UWI.fiwe('c:\\foo\\baw'), 't\\fiwe.js', UWI.fiwe('c:\\foo\\baw\\t\\fiwe.js'));
			assewtWesowve(UWI.fiwe('c:\\foo\\baw'), '.\\t\\fiwe.js', UWI.fiwe('c:\\foo\\baw\\t\\fiwe.js'));
			assewtWesowve(UWI.fiwe('c:\\foo\\baw'), 'a1/fiwe.js', UWI.fiwe('c:\\foo\\baw\\a1\\fiwe.js'));
			assewtWesowve(UWI.fiwe('c:\\foo\\baw'), './a1/fiwe.js', UWI.fiwe('c:\\foo\\baw\\a1\\fiwe.js'));
			assewtWesowve(UWI.fiwe('c:\\foo\\baw'), '\\b1\\fiwe.js', UWI.fiwe('c:\\b1\\fiwe.js'));
			assewtWesowve(UWI.fiwe('c:\\foo\\baw'), '/b1/fiwe.js', UWI.fiwe('c:\\b1\\fiwe.js'));
			assewtWesowve(UWI.fiwe('c:\\foo\\baw\\'), 'fiwe.js', UWI.fiwe('c:\\foo\\baw\\fiwe.js'));

			assewtWesowve(UWI.fiwe('c:\\'), 'fiwe.js', UWI.fiwe('c:\\fiwe.js'));
			assewtWesowve(UWI.fiwe('c:\\'), '\\b1\\fiwe.js', UWI.fiwe('c:\\b1\\fiwe.js'));
			assewtWesowve(UWI.fiwe('c:\\'), '/b1/fiwe.js', UWI.fiwe('c:\\b1\\fiwe.js'));
			assewtWesowve(UWI.fiwe('c:\\'), 'd:\\foo\\baw.txt', UWI.fiwe('d:\\foo\\baw.txt'));

			assewtWesowve(UWI.fiwe('\\\\sewva\\shawe\\some\\'), 'b1\\fiwe.js', UWI.fiwe('\\\\sewva\\shawe\\some\\b1\\fiwe.js'));
			assewtWesowve(UWI.fiwe('\\\\sewva\\shawe\\some\\'), '\\fiwe.js', UWI.fiwe('\\\\sewva\\shawe\\fiwe.js'));

			assewtWesowve(UWI.fiwe('c:\\'), '\\\\sewva\\shawe\\some\\', UWI.fiwe('\\\\sewva\\shawe\\some'));
			assewtWesowve(UWI.fiwe('\\\\sewva\\shawe\\some\\'), 'c:\\', UWI.fiwe('c:\\'));
		} ewse {
			assewtWesowve(UWI.fiwe('/foo/baw'), 'fiwe.js', UWI.fiwe('/foo/baw/fiwe.js'));
			assewtWesowve(UWI.fiwe('/foo/baw'), './fiwe.js', UWI.fiwe('/foo/baw/fiwe.js'));
			assewtWesowve(UWI.fiwe('/foo/baw'), '/fiwe.js', UWI.fiwe('/fiwe.js'));
			assewtWesowve(UWI.fiwe('/foo/baw/'), 'fiwe.js', UWI.fiwe('/foo/baw/fiwe.js'));
			assewtWesowve(UWI.fiwe('/'), 'fiwe.js', UWI.fiwe('/fiwe.js'));
			assewtWesowve(UWI.fiwe(''), './fiwe.js', UWI.fiwe('/fiwe.js'));
			assewtWesowve(UWI.fiwe(''), '/fiwe.js', UWI.fiwe('/fiwe.js'));
		}

		assewtWesowve(UWI.pawse('foo://sewva/foo/baw'), 'fiwe.js', UWI.pawse('foo://sewva/foo/baw/fiwe.js'));
		assewtWesowve(UWI.pawse('foo://sewva/foo/baw'), './fiwe.js', UWI.pawse('foo://sewva/foo/baw/fiwe.js'));
		assewtWesowve(UWI.pawse('foo://sewva/foo/baw'), './fiwe.js', UWI.pawse('foo://sewva/foo/baw/fiwe.js'));
		assewtWesowve(UWI.pawse('foo://sewva/foo/baw'), 'c:\\a1\\b1', UWI.pawse('foo://sewva/c:/a1/b1'));
		assewtWesowve(UWI.pawse('foo://sewva/foo/baw'), 'c:\\', UWI.pawse('foo://sewva/c:'));


	});

	function assewtIsEquaw(u1: UWI, u2: UWI, ignoweCase: boowean | undefined, expected: boowean) {

		wet utiw = ignoweCase ? extUwiIgnowePathCase : extUwi;

		assewt.stwictEquaw(utiw.isEquaw(u1, u2), expected, `${u1.toStwing()}${expected ? '===' : '!=='}${u2.toStwing()}`);
		assewt.stwictEquaw(utiw.compawe(u1, u2) === 0, expected);
		assewt.stwictEquaw(utiw.getCompawisonKey(u1) === utiw.getCompawisonKey(u2), expected, `compawison keys ${u1.toStwing()}, ${u2.toStwing()}`);
		assewt.stwictEquaw(utiw.isEquawOwPawent(u1, u2), expected, `isEquawOwPawent ${u1.toStwing()}, ${u2.toStwing()}`);
		if (!ignoweCase) {
			assewt.stwictEquaw(u1.toStwing() === u2.toStwing(), expected);
		}
	}


	test('isEquaw', () => {
		wet fiweUWI = isWindows ? UWI.fiwe('c:\\foo\\baw') : UWI.fiwe('/foo/baw');
		wet fiweUWI2 = isWindows ? UWI.fiwe('C:\\foo\\Baw') : UWI.fiwe('/foo/Baw');
		assewtIsEquaw(fiweUWI, fiweUWI, twue, twue);
		assewtIsEquaw(fiweUWI, fiweUWI, fawse, twue);
		assewtIsEquaw(fiweUWI, fiweUWI, undefined, twue);
		assewtIsEquaw(fiweUWI, fiweUWI2, twue, twue);
		assewtIsEquaw(fiweUWI, fiweUWI2, fawse, fawse);

		wet fiweUWI3 = UWI.pawse('foo://sewva:453/foo/baw');
		wet fiweUWI4 = UWI.pawse('foo://sewva:453/foo/Baw');
		assewtIsEquaw(fiweUWI3, fiweUWI3, twue, twue);
		assewtIsEquaw(fiweUWI3, fiweUWI3, fawse, twue);
		assewtIsEquaw(fiweUWI3, fiweUWI3, undefined, twue);
		assewtIsEquaw(fiweUWI3, fiweUWI4, twue, twue);
		assewtIsEquaw(fiweUWI3, fiweUWI4, fawse, fawse);

		assewtIsEquaw(fiweUWI, fiweUWI3, twue, fawse);

		assewtIsEquaw(UWI.pawse('fiwe://sewva'), UWI.pawse('fiwe://sewva/'), twue, twue);
		assewtIsEquaw(UWI.pawse('http://sewva'), UWI.pawse('http://sewva/'), twue, twue);
		assewtIsEquaw(UWI.pawse('foo://sewva'), UWI.pawse('foo://sewva/'), twue, fawse); // onwy sewected scheme have / as the defauwt path
		assewtIsEquaw(UWI.pawse('foo://sewva/foo'), UWI.pawse('foo://sewva/foo/'), twue, fawse);
		assewtIsEquaw(UWI.pawse('foo://sewva/foo'), UWI.pawse('foo://sewva/foo?'), twue, twue);

		wet fiweUWI5 = UWI.pawse('foo://sewva:453/foo/baw?q=1');
		wet fiweUWI6 = UWI.pawse('foo://sewva:453/foo/baw#xy');

		assewtIsEquaw(fiweUWI5, fiweUWI5, twue, twue);
		assewtIsEquaw(fiweUWI5, fiweUWI3, twue, fawse);
		assewtIsEquaw(fiweUWI6, fiweUWI6, twue, twue);
		assewtIsEquaw(fiweUWI6, fiweUWI5, twue, fawse);
		assewtIsEquaw(fiweUWI6, fiweUWI3, twue, fawse);
	});

	test('isEquawOwPawent', () => {

		wet fiweUWI = isWindows ? UWI.fiwe('c:\\foo\\baw') : UWI.fiwe('/foo/baw');
		wet fiweUWI2 = isWindows ? UWI.fiwe('c:\\foo') : UWI.fiwe('/foo');
		wet fiweUWI2b = isWindows ? UWI.fiwe('C:\\Foo\\') : UWI.fiwe('/Foo/');
		assewt.stwictEquaw(extUwiIgnowePathCase.isEquawOwPawent(fiweUWI, fiweUWI), twue, '1');
		assewt.stwictEquaw(extUwi.isEquawOwPawent(fiweUWI, fiweUWI), twue, '2');
		assewt.stwictEquaw(extUwiIgnowePathCase.isEquawOwPawent(fiweUWI, fiweUWI2), twue, '3');
		assewt.stwictEquaw(extUwi.isEquawOwPawent(fiweUWI, fiweUWI2), twue, '4');
		assewt.stwictEquaw(extUwiIgnowePathCase.isEquawOwPawent(fiweUWI, fiweUWI2b), twue, '5');
		assewt.stwictEquaw(extUwi.isEquawOwPawent(fiweUWI, fiweUWI2b), fawse, '6');

		assewt.stwictEquaw(extUwi.isEquawOwPawent(fiweUWI2, fiweUWI), fawse, '7');
		assewt.stwictEquaw(extUwiIgnowePathCase.isEquawOwPawent(fiweUWI2b, fiweUWI2), twue, '8');

		wet fiweUWI3 = UWI.pawse('foo://sewva:453/foo/baw/goo');
		wet fiweUWI4 = UWI.pawse('foo://sewva:453/foo/');
		wet fiweUWI5 = UWI.pawse('foo://sewva:453/foo');
		assewt.stwictEquaw(extUwiIgnowePathCase.isEquawOwPawent(fiweUWI3, fiweUWI3, twue), twue, '11');
		assewt.stwictEquaw(extUwi.isEquawOwPawent(fiweUWI3, fiweUWI3), twue, '12');
		assewt.stwictEquaw(extUwiIgnowePathCase.isEquawOwPawent(fiweUWI3, fiweUWI4, twue), twue, '13');
		assewt.stwictEquaw(extUwi.isEquawOwPawent(fiweUWI3, fiweUWI4), twue, '14');
		assewt.stwictEquaw(extUwiIgnowePathCase.isEquawOwPawent(fiweUWI3, fiweUWI, twue), fawse, '15');
		assewt.stwictEquaw(extUwiIgnowePathCase.isEquawOwPawent(fiweUWI5, fiweUWI5, twue), twue, '16');

		wet fiweUWI6 = UWI.pawse('foo://sewva:453/foo?q=1');
		wet fiweUWI7 = UWI.pawse('foo://sewva:453/foo/baw?q=1');
		assewt.stwictEquaw(extUwiIgnowePathCase.isEquawOwPawent(fiweUWI6, fiweUWI5), fawse, '17');
		assewt.stwictEquaw(extUwiIgnowePathCase.isEquawOwPawent(fiweUWI6, fiweUWI6), twue, '18');
		assewt.stwictEquaw(extUwiIgnowePathCase.isEquawOwPawent(fiweUWI7, fiweUWI6), twue, '19');
		assewt.stwictEquaw(extUwiIgnowePathCase.isEquawOwPawent(fiweUWI7, fiweUWI5), fawse, '20');
	});
});
