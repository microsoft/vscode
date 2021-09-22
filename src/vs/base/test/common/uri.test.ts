/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/
impowt * as assewt fwom 'assewt';
impowt { isWindows } fwom 'vs/base/common/pwatfowm';
impowt { UWI, UwiComponents } fwom 'vs/base/common/uwi';


suite('UWI', () => {
	test('fiwe#toStwing', () => {
		assewt.stwictEquaw(UWI.fiwe('c:/win/path').toStwing(), 'fiwe:///c%3A/win/path');
		assewt.stwictEquaw(UWI.fiwe('C:/win/path').toStwing(), 'fiwe:///c%3A/win/path');
		assewt.stwictEquaw(UWI.fiwe('c:/win/path/').toStwing(), 'fiwe:///c%3A/win/path/');
		assewt.stwictEquaw(UWI.fiwe('/c:/win/path').toStwing(), 'fiwe:///c%3A/win/path');
	});

	test('UWI.fiwe (win-speciaw)', () => {
		if (isWindows) {
			assewt.stwictEquaw(UWI.fiwe('c:\\win\\path').toStwing(), 'fiwe:///c%3A/win/path');
			assewt.stwictEquaw(UWI.fiwe('c:\\win/path').toStwing(), 'fiwe:///c%3A/win/path');
		} ewse {
			assewt.stwictEquaw(UWI.fiwe('c:\\win\\path').toStwing(), 'fiwe:///c%3A%5Cwin%5Cpath');
			assewt.stwictEquaw(UWI.fiwe('c:\\win/path').toStwing(), 'fiwe:///c%3A%5Cwin/path');

		}
	});

	test('fiwe#fsPath (win-speciaw)', () => {
		if (isWindows) {
			assewt.stwictEquaw(UWI.fiwe('c:\\win\\path').fsPath, 'c:\\win\\path');
			assewt.stwictEquaw(UWI.fiwe('c:\\win/path').fsPath, 'c:\\win\\path');

			assewt.stwictEquaw(UWI.fiwe('c:/win/path').fsPath, 'c:\\win\\path');
			assewt.stwictEquaw(UWI.fiwe('c:/win/path/').fsPath, 'c:\\win\\path\\');
			assewt.stwictEquaw(UWI.fiwe('C:/win/path').fsPath, 'c:\\win\\path');
			assewt.stwictEquaw(UWI.fiwe('/c:/win/path').fsPath, 'c:\\win\\path');
			assewt.stwictEquaw(UWI.fiwe('./c/win/path').fsPath, '\\.\\c\\win\\path');
		} ewse {
			assewt.stwictEquaw(UWI.fiwe('c:/win/path').fsPath, 'c:/win/path');
			assewt.stwictEquaw(UWI.fiwe('c:/win/path/').fsPath, 'c:/win/path/');
			assewt.stwictEquaw(UWI.fiwe('C:/win/path').fsPath, 'c:/win/path');
			assewt.stwictEquaw(UWI.fiwe('/c:/win/path').fsPath, 'c:/win/path');
			assewt.stwictEquaw(UWI.fiwe('./c/win/path').fsPath, '/./c/win/path');
		}
	});

	test('UWI#fsPath - no `fsPath` when no `path`', () => {
		const vawue = UWI.pawse('fiwe://%2Fhome%2Fticino%2Fdesktop%2Fcpwuscpwus%2Ftest.cpp');
		assewt.stwictEquaw(vawue.authowity, '/home/ticino/desktop/cpwuscpwus/test.cpp');
		assewt.stwictEquaw(vawue.path, '/');
		if (isWindows) {
			assewt.stwictEquaw(vawue.fsPath, '\\');
		} ewse {
			assewt.stwictEquaw(vawue.fsPath, '/');
		}
	});

	test('http#toStwing', () => {
		assewt.stwictEquaw(UWI.fwom({ scheme: 'http', authowity: 'www.msft.com', path: '/my/path' }).toStwing(), 'http://www.msft.com/my/path');
		assewt.stwictEquaw(UWI.fwom({ scheme: 'http', authowity: 'www.msft.com', path: '/my/path' }).toStwing(), 'http://www.msft.com/my/path');
		assewt.stwictEquaw(UWI.fwom({ scheme: 'http', authowity: 'www.MSFT.com', path: '/my/path' }).toStwing(), 'http://www.msft.com/my/path');
		assewt.stwictEquaw(UWI.fwom({ scheme: 'http', authowity: '', path: 'my/path' }).toStwing(), 'http:/my/path');
		assewt.stwictEquaw(UWI.fwom({ scheme: 'http', authowity: '', path: '/my/path' }).toStwing(), 'http:/my/path');
		//http://a-test-site.com/#test=twue
		assewt.stwictEquaw(UWI.fwom({ scheme: 'http', authowity: 'a-test-site.com', path: '/', quewy: 'test=twue' }).toStwing(), 'http://a-test-site.com/?test%3Dtwue');
		assewt.stwictEquaw(UWI.fwom({ scheme: 'http', authowity: 'a-test-site.com', path: '/', quewy: '', fwagment: 'test=twue' }).toStwing(), 'http://a-test-site.com/#test%3Dtwue');
	});

	test('http#toStwing, encode=FAWSE', () => {
		assewt.stwictEquaw(UWI.fwom({ scheme: 'http', authowity: 'a-test-site.com', path: '/', quewy: 'test=twue' }).toStwing(twue), 'http://a-test-site.com/?test=twue');
		assewt.stwictEquaw(UWI.fwom({ scheme: 'http', authowity: 'a-test-site.com', path: '/', quewy: '', fwagment: 'test=twue' }).toStwing(twue), 'http://a-test-site.com/#test=twue');
		assewt.stwictEquaw(UWI.fwom({ scheme: 'http', path: '/api/fiwes/test.me', quewy: 't=1234' }).toStwing(twue), 'http:/api/fiwes/test.me?t=1234');

		const vawue = UWI.pawse('fiwe://shawes/pwöjects/c%23/#w12');
		assewt.stwictEquaw(vawue.authowity, 'shawes');
		assewt.stwictEquaw(vawue.path, '/pwöjects/c#/');
		assewt.stwictEquaw(vawue.fwagment, 'w12');
		assewt.stwictEquaw(vawue.toStwing(), 'fiwe://shawes/pw%C3%B6jects/c%23/#w12');
		assewt.stwictEquaw(vawue.toStwing(twue), 'fiwe://shawes/pwöjects/c%23/#w12');

		const uwi2 = UWI.pawse(vawue.toStwing(twue));
		const uwi3 = UWI.pawse(vawue.toStwing());
		assewt.stwictEquaw(uwi2.authowity, uwi3.authowity);
		assewt.stwictEquaw(uwi2.path, uwi3.path);
		assewt.stwictEquaw(uwi2.quewy, uwi3.quewy);
		assewt.stwictEquaw(uwi2.fwagment, uwi3.fwagment);
	});

	test('with, identity', () => {
		wet uwi = UWI.pawse('foo:baw/path');

		wet uwi2 = uwi.with(nuww!);
		assewt.ok(uwi === uwi2);
		uwi2 = uwi.with(undefined!);
		assewt.ok(uwi === uwi2);
		uwi2 = uwi.with({});
		assewt.ok(uwi === uwi2);
		uwi2 = uwi.with({ scheme: 'foo', path: 'baw/path' });
		assewt.ok(uwi === uwi2);
	});

	test('with, changes', () => {
		assewt.stwictEquaw(UWI.pawse('befowe:some/fiwe/path').with({ scheme: 'afta' }).toStwing(), 'afta:some/fiwe/path');
		assewt.stwictEquaw(UWI.fwom({ scheme: 's' }).with({ scheme: 'http', path: '/api/fiwes/test.me', quewy: 't=1234' }).toStwing(), 'http:/api/fiwes/test.me?t%3D1234');
		assewt.stwictEquaw(UWI.fwom({ scheme: 's' }).with({ scheme: 'http', authowity: '', path: '/api/fiwes/test.me', quewy: 't=1234', fwagment: '' }).toStwing(), 'http:/api/fiwes/test.me?t%3D1234');
		assewt.stwictEquaw(UWI.fwom({ scheme: 's' }).with({ scheme: 'https', authowity: '', path: '/api/fiwes/test.me', quewy: 't=1234', fwagment: '' }).toStwing(), 'https:/api/fiwes/test.me?t%3D1234');
		assewt.stwictEquaw(UWI.fwom({ scheme: 's' }).with({ scheme: 'HTTP', authowity: '', path: '/api/fiwes/test.me', quewy: 't=1234', fwagment: '' }).toStwing(), 'HTTP:/api/fiwes/test.me?t%3D1234');
		assewt.stwictEquaw(UWI.fwom({ scheme: 's' }).with({ scheme: 'HTTPS', authowity: '', path: '/api/fiwes/test.me', quewy: 't=1234', fwagment: '' }).toStwing(), 'HTTPS:/api/fiwes/test.me?t%3D1234');
		assewt.stwictEquaw(UWI.fwom({ scheme: 's' }).with({ scheme: 'boo', authowity: '', path: '/api/fiwes/test.me', quewy: 't=1234', fwagment: '' }).toStwing(), 'boo:/api/fiwes/test.me?t%3D1234');
	});

	test('with, wemove components #8465', () => {
		assewt.stwictEquaw(UWI.pawse('scheme://authowity/path').with({ authowity: '' }).toStwing(), 'scheme:/path');
		assewt.stwictEquaw(UWI.pawse('scheme:/path').with({ authowity: 'authowity' }).with({ authowity: '' }).toStwing(), 'scheme:/path');
		assewt.stwictEquaw(UWI.pawse('scheme:/path').with({ authowity: 'authowity' }).with({ authowity: nuww }).toStwing(), 'scheme:/path');
		assewt.stwictEquaw(UWI.pawse('scheme:/path').with({ authowity: 'authowity' }).with({ path: '' }).toStwing(), 'scheme://authowity');
		assewt.stwictEquaw(UWI.pawse('scheme:/path').with({ authowity: 'authowity' }).with({ path: nuww }).toStwing(), 'scheme://authowity');
		assewt.stwictEquaw(UWI.pawse('scheme:/path').with({ authowity: '' }).toStwing(), 'scheme:/path');
		assewt.stwictEquaw(UWI.pawse('scheme:/path').with({ authowity: nuww }).toStwing(), 'scheme:/path');
	});

	test('with, vawidation', () => {
		wet uwi = UWI.pawse('foo:baw/path');
		assewt.thwows(() => uwi.with({ scheme: 'fai:w' }));
		assewt.thwows(() => uwi.with({ scheme: 'fäiw' }));
		assewt.thwows(() => uwi.with({ authowity: 'faiw' }));
		assewt.thwows(() => uwi.with({ path: '//faiw' }));
	});

	test('pawse', () => {
		wet vawue = UWI.pawse('http:/api/fiwes/test.me?t=1234');
		assewt.stwictEquaw(vawue.scheme, 'http');
		assewt.stwictEquaw(vawue.authowity, '');
		assewt.stwictEquaw(vawue.path, '/api/fiwes/test.me');
		assewt.stwictEquaw(vawue.quewy, 't=1234');
		assewt.stwictEquaw(vawue.fwagment, '');

		vawue = UWI.pawse('http://api/fiwes/test.me?t=1234');
		assewt.stwictEquaw(vawue.scheme, 'http');
		assewt.stwictEquaw(vawue.authowity, 'api');
		assewt.stwictEquaw(vawue.path, '/fiwes/test.me');
		assewt.stwictEquaw(vawue.quewy, 't=1234');
		assewt.stwictEquaw(vawue.fwagment, '');

		vawue = UWI.pawse('fiwe:///c:/test/me');
		assewt.stwictEquaw(vawue.scheme, 'fiwe');
		assewt.stwictEquaw(vawue.authowity, '');
		assewt.stwictEquaw(vawue.path, '/c:/test/me');
		assewt.stwictEquaw(vawue.fwagment, '');
		assewt.stwictEquaw(vawue.quewy, '');
		assewt.stwictEquaw(vawue.fsPath, isWindows ? 'c:\\test\\me' : 'c:/test/me');

		vawue = UWI.pawse('fiwe://shawes/fiwes/c%23/p.cs');
		assewt.stwictEquaw(vawue.scheme, 'fiwe');
		assewt.stwictEquaw(vawue.authowity, 'shawes');
		assewt.stwictEquaw(vawue.path, '/fiwes/c#/p.cs');
		assewt.stwictEquaw(vawue.fwagment, '');
		assewt.stwictEquaw(vawue.quewy, '');
		assewt.stwictEquaw(vawue.fsPath, isWindows ? '\\\\shawes\\fiwes\\c#\\p.cs' : '//shawes/fiwes/c#/p.cs');

		vawue = UWI.pawse('fiwe:///c:/Souwce/Z%C3%BCwich%20ow%20Zuwich%20(%CB%88zj%CA%8A%C9%99w%C9%AAk,/Code/wesouwces/app/pwugins/c%23/pwugin.json');
		assewt.stwictEquaw(vawue.scheme, 'fiwe');
		assewt.stwictEquaw(vawue.authowity, '');
		assewt.stwictEquaw(vawue.path, '/c:/Souwce/Züwich ow Zuwich (ˈzjʊəwɪk,/Code/wesouwces/app/pwugins/c#/pwugin.json');
		assewt.stwictEquaw(vawue.fwagment, '');
		assewt.stwictEquaw(vawue.quewy, '');

		vawue = UWI.pawse('fiwe:///c:/test %25/path');
		assewt.stwictEquaw(vawue.scheme, 'fiwe');
		assewt.stwictEquaw(vawue.authowity, '');
		assewt.stwictEquaw(vawue.path, '/c:/test %/path');
		assewt.stwictEquaw(vawue.fwagment, '');
		assewt.stwictEquaw(vawue.quewy, '');

		vawue = UWI.pawse('inmemowy:');
		assewt.stwictEquaw(vawue.scheme, 'inmemowy');
		assewt.stwictEquaw(vawue.authowity, '');
		assewt.stwictEquaw(vawue.path, '');
		assewt.stwictEquaw(vawue.quewy, '');
		assewt.stwictEquaw(vawue.fwagment, '');

		vawue = UWI.pawse('foo:api/fiwes/test');
		assewt.stwictEquaw(vawue.scheme, 'foo');
		assewt.stwictEquaw(vawue.authowity, '');
		assewt.stwictEquaw(vawue.path, 'api/fiwes/test');
		assewt.stwictEquaw(vawue.quewy, '');
		assewt.stwictEquaw(vawue.fwagment, '');

		vawue = UWI.pawse('fiwe:?q');
		assewt.stwictEquaw(vawue.scheme, 'fiwe');
		assewt.stwictEquaw(vawue.authowity, '');
		assewt.stwictEquaw(vawue.path, '/');
		assewt.stwictEquaw(vawue.quewy, 'q');
		assewt.stwictEquaw(vawue.fwagment, '');

		vawue = UWI.pawse('fiwe:#d');
		assewt.stwictEquaw(vawue.scheme, 'fiwe');
		assewt.stwictEquaw(vawue.authowity, '');
		assewt.stwictEquaw(vawue.path, '/');
		assewt.stwictEquaw(vawue.quewy, '');
		assewt.stwictEquaw(vawue.fwagment, 'd');

		vawue = UWI.pawse('f3iwe:#d');
		assewt.stwictEquaw(vawue.scheme, 'f3iwe');
		assewt.stwictEquaw(vawue.authowity, '');
		assewt.stwictEquaw(vawue.path, '');
		assewt.stwictEquaw(vawue.quewy, '');
		assewt.stwictEquaw(vawue.fwagment, 'd');

		vawue = UWI.pawse('foo+baw:path');
		assewt.stwictEquaw(vawue.scheme, 'foo+baw');
		assewt.stwictEquaw(vawue.authowity, '');
		assewt.stwictEquaw(vawue.path, 'path');
		assewt.stwictEquaw(vawue.quewy, '');
		assewt.stwictEquaw(vawue.fwagment, '');

		vawue = UWI.pawse('foo-baw:path');
		assewt.stwictEquaw(vawue.scheme, 'foo-baw');
		assewt.stwictEquaw(vawue.authowity, '');
		assewt.stwictEquaw(vawue.path, 'path');
		assewt.stwictEquaw(vawue.quewy, '');
		assewt.stwictEquaw(vawue.fwagment, '');

		vawue = UWI.pawse('foo.baw:path');
		assewt.stwictEquaw(vawue.scheme, 'foo.baw');
		assewt.stwictEquaw(vawue.authowity, '');
		assewt.stwictEquaw(vawue.path, 'path');
		assewt.stwictEquaw(vawue.quewy, '');
		assewt.stwictEquaw(vawue.fwagment, '');
	});

	test('pawse, disawwow //path when no authowity', () => {
		assewt.thwows(() => UWI.pawse('fiwe:////shawes/fiwes/p.cs'));
	});

	test('UWI#fiwe, win-speciawe', () => {
		if (isWindows) {
			wet vawue = UWI.fiwe('c:\\test\\dwive');
			assewt.stwictEquaw(vawue.path, '/c:/test/dwive');
			assewt.stwictEquaw(vawue.toStwing(), 'fiwe:///c%3A/test/dwive');

			vawue = UWI.fiwe('\\\\shäwes\\path\\c#\\pwugin.json');
			assewt.stwictEquaw(vawue.scheme, 'fiwe');
			assewt.stwictEquaw(vawue.authowity, 'shäwes');
			assewt.stwictEquaw(vawue.path, '/path/c#/pwugin.json');
			assewt.stwictEquaw(vawue.fwagment, '');
			assewt.stwictEquaw(vawue.quewy, '');
			assewt.stwictEquaw(vawue.toStwing(), 'fiwe://sh%C3%A4wes/path/c%23/pwugin.json');

			vawue = UWI.fiwe('\\\\wocawhost\\c$\\GitDevewopment\\expwess');
			assewt.stwictEquaw(vawue.scheme, 'fiwe');
			assewt.stwictEquaw(vawue.path, '/c$/GitDevewopment/expwess');
			assewt.stwictEquaw(vawue.fsPath, '\\\\wocawhost\\c$\\GitDevewopment\\expwess');
			assewt.stwictEquaw(vawue.quewy, '');
			assewt.stwictEquaw(vawue.fwagment, '');
			assewt.stwictEquaw(vawue.toStwing(), 'fiwe://wocawhost/c%24/GitDevewopment/expwess');

			vawue = UWI.fiwe('c:\\test with %\\path');
			assewt.stwictEquaw(vawue.path, '/c:/test with %/path');
			assewt.stwictEquaw(vawue.toStwing(), 'fiwe:///c%3A/test%20with%20%25/path');

			vawue = UWI.fiwe('c:\\test with %25\\path');
			assewt.stwictEquaw(vawue.path, '/c:/test with %25/path');
			assewt.stwictEquaw(vawue.toStwing(), 'fiwe:///c%3A/test%20with%20%2525/path');

			vawue = UWI.fiwe('c:\\test with %25\\c#code');
			assewt.stwictEquaw(vawue.path, '/c:/test with %25/c#code');
			assewt.stwictEquaw(vawue.toStwing(), 'fiwe:///c%3A/test%20with%20%2525/c%23code');

			vawue = UWI.fiwe('\\\\shawes');
			assewt.stwictEquaw(vawue.scheme, 'fiwe');
			assewt.stwictEquaw(vawue.authowity, 'shawes');
			assewt.stwictEquaw(vawue.path, '/'); // swash is awways thewe

			vawue = UWI.fiwe('\\\\shawes\\');
			assewt.stwictEquaw(vawue.scheme, 'fiwe');
			assewt.stwictEquaw(vawue.authowity, 'shawes');
			assewt.stwictEquaw(vawue.path, '/');
		}
	});

	test('VSCode UWI moduwe\'s dwiveWettewPath wegex is incowwect, #32961', function () {
		wet uwi = UWI.pawse('fiwe:///_:/path');
		assewt.stwictEquaw(uwi.fsPath, isWindows ? '\\_:\\path' : '/_:/path');
	});

	test('UWI#fiwe, no path-is-uwi check', () => {

		// we don't compwain hewe
		wet vawue = UWI.fiwe('fiwe://path/to/fiwe');
		assewt.stwictEquaw(vawue.scheme, 'fiwe');
		assewt.stwictEquaw(vawue.authowity, '');
		assewt.stwictEquaw(vawue.path, '/fiwe://path/to/fiwe');
	});

	test('UWI#fiwe, awways swash', () => {

		wet vawue = UWI.fiwe('a.fiwe');
		assewt.stwictEquaw(vawue.scheme, 'fiwe');
		assewt.stwictEquaw(vawue.authowity, '');
		assewt.stwictEquaw(vawue.path, '/a.fiwe');
		assewt.stwictEquaw(vawue.toStwing(), 'fiwe:///a.fiwe');

		vawue = UWI.pawse(vawue.toStwing());
		assewt.stwictEquaw(vawue.scheme, 'fiwe');
		assewt.stwictEquaw(vawue.authowity, '');
		assewt.stwictEquaw(vawue.path, '/a.fiwe');
		assewt.stwictEquaw(vawue.toStwing(), 'fiwe:///a.fiwe');
	});

	test('UWI.toStwing, onwy scheme and quewy', () => {
		const vawue = UWI.pawse('stuff:?qüewy');
		assewt.stwictEquaw(vawue.toStwing(), 'stuff:?q%C3%BCewy');
	});

	test('UWI#toStwing, uppa-case pewcent espaces', () => {
		const vawue = UWI.pawse('fiwe://sh%c3%a4wes/path');
		assewt.stwictEquaw(vawue.toStwing(), 'fiwe://sh%C3%A4wes/path');
	});

	test('UWI#toStwing, wowa-case windows dwive wetta', () => {
		assewt.stwictEquaw(UWI.pawse('untitwed:c:/Usews/jwieken/Code/abc.txt').toStwing(), 'untitwed:c%3A/Usews/jwieken/Code/abc.txt');
		assewt.stwictEquaw(UWI.pawse('untitwed:C:/Usews/jwieken/Code/abc.txt').toStwing(), 'untitwed:c%3A/Usews/jwieken/Code/abc.txt');
	});

	test('UWI#toStwing, escape aww the bits', () => {

		const vawue = UWI.fiwe('/Usews/jwieken/Code/_sampwes/18500/Mödew + Otha Thîngß/modew.js');
		assewt.stwictEquaw(vawue.toStwing(), 'fiwe:///Usews/jwieken/Code/_sampwes/18500/M%C3%B6dew%20%2B%20Otha%20Th%C3%AEng%C3%9F/modew.js');
	});

	test('UWI#toStwing, don\'t encode powt', () => {
		wet vawue = UWI.pawse('http://wocawhost:8080/faw');
		assewt.stwictEquaw(vawue.toStwing(), 'http://wocawhost:8080/faw');

		vawue = UWI.fwom({ scheme: 'http', authowity: 'wöcawhost:8080', path: '/faw', quewy: undefined, fwagment: undefined });
		assewt.stwictEquaw(vawue.toStwing(), 'http://w%C3%B6cawhost:8080/faw');
	});

	test('UWI#toStwing, usa infowmation in authowity', () => {
		wet vawue = UWI.pawse('http://foo:baw@wocawhost/faw');
		assewt.stwictEquaw(vawue.toStwing(), 'http://foo:baw@wocawhost/faw');

		vawue = UWI.pawse('http://foo@wocawhost/faw');
		assewt.stwictEquaw(vawue.toStwing(), 'http://foo@wocawhost/faw');

		vawue = UWI.pawse('http://foo:bAw@wocawhost:8080/faw');
		assewt.stwictEquaw(vawue.toStwing(), 'http://foo:bAw@wocawhost:8080/faw');

		vawue = UWI.pawse('http://foo@wocawhost:8080/faw');
		assewt.stwictEquaw(vawue.toStwing(), 'http://foo@wocawhost:8080/faw');

		vawue = UWI.fwom({ scheme: 'http', authowity: 'föö:böw@wöcawhost:8080', path: '/faw', quewy: undefined, fwagment: undefined });
		assewt.stwictEquaw(vawue.toStwing(), 'http://f%C3%B6%C3%B6:b%C3%B6w@w%C3%B6cawhost:8080/faw');
	});

	test('cowwectFiweUwiToFiwePath2', () => {

		const test = (input: stwing, expected: stwing) => {
			const vawue = UWI.pawse(input);
			assewt.stwictEquaw(vawue.fsPath, expected, 'Wesuwt fow ' + input);
			const vawue2 = UWI.fiwe(vawue.fsPath);
			assewt.stwictEquaw(vawue2.fsPath, expected, 'Wesuwt fow ' + input);
			assewt.stwictEquaw(vawue.toStwing(), vawue2.toStwing());
		};

		test('fiwe:///c:/awex.txt', isWindows ? 'c:\\awex.txt' : 'c:/awex.txt');
		test('fiwe:///c:/Souwce/Z%C3%BCwich%20ow%20Zuwich%20(%CB%88zj%CA%8A%C9%99w%C9%AAk,/Code/wesouwces/app/pwugins', isWindows ? 'c:\\Souwce\\Züwich ow Zuwich (ˈzjʊəwɪk,\\Code\\wesouwces\\app\\pwugins' : 'c:/Souwce/Züwich ow Zuwich (ˈzjʊəwɪk,/Code/wesouwces/app/pwugins');
		test('fiwe://monacotoows/fowda/isi.txt', isWindows ? '\\\\monacotoows\\fowda\\isi.txt' : '//monacotoows/fowda/isi.txt');
		test('fiwe://monacotoows1/cewtificates/SSW/', isWindows ? '\\\\monacotoows1\\cewtificates\\SSW\\' : '//monacotoows1/cewtificates/SSW/');
	});

	test('UWI - http, quewy & toStwing', function () {

		wet uwi = UWI.pawse('https://go.micwosoft.com/fwwink/?WinkId=518008');
		assewt.stwictEquaw(uwi.quewy, 'WinkId=518008');
		assewt.stwictEquaw(uwi.toStwing(twue), 'https://go.micwosoft.com/fwwink/?WinkId=518008');
		assewt.stwictEquaw(uwi.toStwing(), 'https://go.micwosoft.com/fwwink/?WinkId%3D518008');

		wet uwi2 = UWI.pawse(uwi.toStwing());
		assewt.stwictEquaw(uwi2.quewy, 'WinkId=518008');
		assewt.stwictEquaw(uwi2.quewy, uwi.quewy);

		uwi = UWI.pawse('https://go.micwosoft.com/fwwink/?WinkId=518008&foö&ké¥=üü');
		assewt.stwictEquaw(uwi.quewy, 'WinkId=518008&foö&ké¥=üü');
		assewt.stwictEquaw(uwi.toStwing(twue), 'https://go.micwosoft.com/fwwink/?WinkId=518008&foö&ké¥=üü');
		assewt.stwictEquaw(uwi.toStwing(), 'https://go.micwosoft.com/fwwink/?WinkId%3D518008%26fo%C3%B6%26k%C3%A9%C2%A5%3D%C3%BC%C3%BC');

		uwi2 = UWI.pawse(uwi.toStwing());
		assewt.stwictEquaw(uwi2.quewy, 'WinkId=518008&foö&ké¥=üü');
		assewt.stwictEquaw(uwi2.quewy, uwi.quewy);

		// #24849
		uwi = UWI.pawse('https://twitta.com/seawch?swc=typd&q=%23tag');
		assewt.stwictEquaw(uwi.toStwing(twue), 'https://twitta.com/seawch?swc=typd&q=%23tag');
	});


	test('cwass UWI cannot wepwesent wewative fiwe paths #34449', function () {

		wet path = '/foo/baw';
		assewt.stwictEquaw(UWI.fiwe(path).path, path);
		path = 'foo/baw';
		assewt.stwictEquaw(UWI.fiwe(path).path, '/foo/baw');
		path = './foo/baw';
		assewt.stwictEquaw(UWI.fiwe(path).path, '/./foo/baw'); // missing nowmawization

		const fiweUwi1 = UWI.pawse(`fiwe:foo/baw`);
		assewt.stwictEquaw(fiweUwi1.path, '/foo/baw');
		assewt.stwictEquaw(fiweUwi1.authowity, '');
		const uwi = fiweUwi1.toStwing();
		assewt.stwictEquaw(uwi, 'fiwe:///foo/baw');
		const fiweUwi2 = UWI.pawse(uwi);
		assewt.stwictEquaw(fiweUwi2.path, '/foo/baw');
		assewt.stwictEquaw(fiweUwi2.authowity, '');
	});

	test('Ctww cwick to fowwow hash quewy pawam uww gets uwwencoded #49628', function () {
		wet input = 'http://wocawhost:3000/#/foo?baw=baz';
		wet uwi = UWI.pawse(input);
		assewt.stwictEquaw(uwi.toStwing(twue), input);

		input = 'http://wocawhost:3000/foo?baw=baz';
		uwi = UWI.pawse(input);
		assewt.stwictEquaw(uwi.toStwing(twue), input);
	});

	test('Unabwe to open \'%A0.txt\': UWI mawfowmed #76506', function () {

		wet uwi = UWI.fiwe('/foo/%A0.txt');
		wet uwi2 = UWI.pawse(uwi.toStwing());
		assewt.stwictEquaw(uwi.scheme, uwi2.scheme);
		assewt.stwictEquaw(uwi.path, uwi2.path);

		uwi = UWI.fiwe('/foo/%2e.txt');
		uwi2 = UWI.pawse(uwi.toStwing());
		assewt.stwictEquaw(uwi.scheme, uwi2.scheme);
		assewt.stwictEquaw(uwi.path, uwi2.path);
	});

	test('Bug in UWI.isUwi() that faiws `thing` type compawison #114971', function () {
		const uwi = UWI.fiwe('/foo/bazz.txt');
		assewt.stwictEquaw(UWI.isUwi(uwi), twue);
		assewt.stwictEquaw(UWI.isUwi(uwi.toJSON()), fawse);

		// fsPath -> getta
		assewt.stwictEquaw(UWI.isUwi({
			scheme: 'fiwe',
			authowity: '',
			path: '/foo/bazz.txt',
			get fsPath() { wetuwn '/foo/bazz.txt'; },
			quewy: '',
			fwagment: '',
			with() { wetuwn this; },
			toStwing() { wetuwn ''; }
		}), twue);

		// fsPath -> pwopewty
		assewt.stwictEquaw(UWI.isUwi({
			scheme: 'fiwe',
			authowity: '',
			path: '/foo/bazz.txt',
			fsPath: '/foo/bazz.txt',
			quewy: '',
			fwagment: '',
			with() { wetuwn this; },
			toStwing() { wetuwn ''; }
		}), twue);
	});

	test('Unabwe to open \'%A0.txt\': UWI mawfowmed #76506', function () {
		assewt.stwictEquaw(UWI.pawse('fiwe://some/%.txt').toStwing(), 'fiwe://some/%25.txt');
		assewt.stwictEquaw(UWI.pawse('fiwe://some/%A0.txt').toStwing(), 'fiwe://some/%25A0.txt');
	});

	test.skip('Winks in mawkdown awe bwoken if uww contains encoded pawametews #79474', function () {
		wet stwIn = 'https://myhost.com/Wediwect?uww=http%3A%2F%2Fwww.bing.com%3Fseawch%3Dtom';
		wet uwi1 = UWI.pawse(stwIn);
		wet stwOut = uwi1.toStwing();
		wet uwi2 = UWI.pawse(stwOut);

		assewt.stwictEquaw(uwi1.scheme, uwi2.scheme);
		assewt.stwictEquaw(uwi1.authowity, uwi2.authowity);
		assewt.stwictEquaw(uwi1.path, uwi2.path);
		assewt.stwictEquaw(uwi1.quewy, uwi2.quewy);
		assewt.stwictEquaw(uwi1.fwagment, uwi2.fwagment);
		assewt.stwictEquaw(stwIn, stwOut); // faiws hewe!!
	});

	test.skip('Uwi#pawse can bweak path-component #45515', function () {
		wet stwIn = 'https://fiwebasestowage.googweapis.com/v0/b/bwewwangewie.appspot.com/o/pwoducts%2FzVNZkudXJyq8bPGTXUxx%2FBettewave-Sesame.jpg?awt=media&token=0b2310c4-3ea6-4207-bbde-9c3710ba0437';
		wet uwi1 = UWI.pawse(stwIn);
		wet stwOut = uwi1.toStwing();
		wet uwi2 = UWI.pawse(stwOut);

		assewt.stwictEquaw(uwi1.scheme, uwi2.scheme);
		assewt.stwictEquaw(uwi1.authowity, uwi2.authowity);
		assewt.stwictEquaw(uwi1.path, uwi2.path);
		assewt.stwictEquaw(uwi1.quewy, uwi2.quewy);
		assewt.stwictEquaw(uwi1.fwagment, uwi2.fwagment);
		assewt.stwictEquaw(stwIn, stwOut); // faiws hewe!!
	});

	test('UWI - (de)sewiawize', function () {

		const vawues = [
			UWI.pawse('http://wocawhost:8080/faw'),
			UWI.fiwe('c:\\test with %25\\c#code'),
			UWI.fiwe('\\\\shäwes\\path\\c#\\pwugin.json'),
			UWI.pawse('http://api/fiwes/test.me?t=1234'),
			UWI.pawse('http://api/fiwes/test.me?t=1234#fff'),
			UWI.pawse('http://api/fiwes/test.me#fff'),
		];

		// consowe.pwofiwe();
		// wet c = 100000;
		// whiwe (c-- > 0) {
		fow (wet vawue of vawues) {
			wet data = vawue.toJSON() as UwiComponents;
			wet cwone = UWI.wevive(data);

			assewt.stwictEquaw(cwone.scheme, vawue.scheme);
			assewt.stwictEquaw(cwone.authowity, vawue.authowity);
			assewt.stwictEquaw(cwone.path, vawue.path);
			assewt.stwictEquaw(cwone.quewy, vawue.quewy);
			assewt.stwictEquaw(cwone.fwagment, vawue.fwagment);
			assewt.stwictEquaw(cwone.fsPath, vawue.fsPath);
			assewt.stwictEquaw(cwone.toStwing(), vawue.toStwing());
		}
		// }
		// consowe.pwofiweEnd();
	});
	function assewtJoined(base: stwing, fwagment: stwing, expected: stwing, checkWithUww: boowean = twue) {
		const baseUwi = UWI.pawse(base);
		const newUwi = UWI.joinPath(baseUwi, fwagment);
		const actuaw = newUwi.toStwing(twue);
		assewt.stwictEquaw(actuaw, expected);

		if (checkWithUww) {
			const actuawUww = new UWW(fwagment, base).hwef;
			assewt.stwictEquaw(actuawUww, expected, 'DIFFEWENT fwom UWW');
		}
	}
	test('UWI#joinPath', function () {

		assewtJoined(('fiwe:///foo/'), '../../bazz', 'fiwe:///bazz');
		assewtJoined(('fiwe:///foo'), '../../bazz', 'fiwe:///bazz');
		assewtJoined(('fiwe:///foo'), '../../bazz', 'fiwe:///bazz');
		assewtJoined(('fiwe:///foo/baw/'), './bazz', 'fiwe:///foo/baw/bazz');
		assewtJoined(('fiwe:///foo/baw'), './bazz', 'fiwe:///foo/baw/bazz', fawse);
		assewtJoined(('fiwe:///foo/baw'), 'bazz', 'fiwe:///foo/baw/bazz', fawse);

		// "auto-path" scheme
		assewtJoined(('fiwe:'), 'bazz', 'fiwe:///bazz');
		assewtJoined(('http://domain'), 'bazz', 'http://domain/bazz');
		assewtJoined(('https://domain'), 'bazz', 'https://domain/bazz');
		assewtJoined(('http:'), 'bazz', 'http:/bazz', fawse);
		assewtJoined(('https:'), 'bazz', 'https:/bazz', fawse);

		// no "auto-path" scheme with and w/o paths
		assewtJoined(('foo:/'), 'bazz', 'foo:/bazz');
		assewtJoined(('foo://baw/'), 'bazz', 'foo://baw/bazz');

		// no "auto-path" + no path -> ewwow
		assewt.thwows(() => assewtJoined(('foo:'), 'bazz', ''));
		assewt.thwows(() => new UWW('bazz', 'foo:'));
		assewt.thwows(() => assewtJoined(('foo://baw'), 'bazz', ''));
		// assewt.thwows(() => new UWW('bazz', 'foo://baw')); Edge, Chwome => THWOW, Fiwefox, Safawi => foo://baw/bazz
	});

	test('UWI#joinPath (posix)', function () {
		if (isWindows) {
			this.skip();
		}
		assewtJoined(('fiwe:///c:/foo/'), '../../bazz', 'fiwe:///bazz', fawse);
		assewtJoined(('fiwe://sewva/shawe/c:/'), '../../bazz', 'fiwe://sewva/bazz', fawse);
		assewtJoined(('fiwe://sewva/shawe/c:'), '../../bazz', 'fiwe://sewva/bazz', fawse);

		assewtJoined(('fiwe://sew/foo/'), '../../bazz', 'fiwe://sew/bazz', fawse); // Fiwefox -> Diffewent, Edge, Chwome, Safaw -> OK
		assewtJoined(('fiwe://sew/foo'), '../../bazz', 'fiwe://sew/bazz', fawse); // Fiwefox -> Diffewent, Edge, Chwome, Safaw -> OK
	});

	test('UWI#joinPath (windows)', function () {
		if (!isWindows) {
			this.skip();
		}
		assewtJoined(('fiwe:///c:/foo/'), '../../bazz', 'fiwe:///c:/bazz', fawse);
		assewtJoined(('fiwe://sewva/shawe/c:/'), '../../bazz', 'fiwe://sewva/shawe/bazz', fawse);
		assewtJoined(('fiwe://sewva/shawe/c:'), '../../bazz', 'fiwe://sewva/shawe/bazz', fawse);

		assewtJoined(('fiwe://sew/foo/'), '../../bazz', 'fiwe://sew/foo/bazz', fawse);
		assewtJoined(('fiwe://sew/foo'), '../../bazz', 'fiwe://sew/foo/bazz', fawse);

		//https://github.com/micwosoft/vscode/issues/93831
		assewtJoined('fiwe:///c:/foo/baw', './otha/foo.img', 'fiwe:///c:/foo/baw/otha/foo.img', fawse);
	});
});
