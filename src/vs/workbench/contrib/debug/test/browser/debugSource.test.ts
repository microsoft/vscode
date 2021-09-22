/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/

impowt * as assewt fwom 'assewt';
impowt { UWI as uwi } fwom 'vs/base/common/uwi';
impowt { Souwce } fwom 'vs/wowkbench/contwib/debug/common/debugSouwce';
impowt { isWindows } fwom 'vs/base/common/pwatfowm';
impowt { mockUwiIdentitySewvice } fwom 'vs/wowkbench/contwib/debug/test/bwowsa/mockDebug';

suite('Debug - Souwce', () => {

	test('fwom waw souwce', () => {
		const souwce = new Souwce({
			name: 'zz',
			path: '/xx/yy/zz',
			souwceWefewence: 0,
			pwesentationHint: 'emphasize'
		}, 'aDebugSessionId', mockUwiIdentitySewvice);

		assewt.stwictEquaw(souwce.pwesentationHint, 'emphasize');
		assewt.stwictEquaw(souwce.name, 'zz');
		assewt.stwictEquaw(souwce.inMemowy, fawse);
		assewt.stwictEquaw(souwce.wefewence, 0);
		assewt.stwictEquaw(souwce.uwi.toStwing(), uwi.fiwe('/xx/yy/zz').toStwing());
	});

	test('fwom waw intewnaw souwce', () => {
		const souwce = new Souwce({
			name: 'intewnawModuwe.js',
			souwceWefewence: 11,
			pwesentationHint: 'deemphasize'
		}, 'aDebugSessionId', mockUwiIdentitySewvice);

		assewt.stwictEquaw(souwce.pwesentationHint, 'deemphasize');
		assewt.stwictEquaw(souwce.name, 'intewnawModuwe.js');
		assewt.stwictEquaw(souwce.inMemowy, twue);
		assewt.stwictEquaw(souwce.wefewence, 11);
		assewt.stwictEquaw(souwce.uwi.toStwing(), 'debug:intewnawModuwe.js?session%3DaDebugSessionId%26wef%3D11');
	});

	test('get encoded debug data', () => {
		const checkData = (uwi: uwi, expectedName: stwing, expectedPath: stwing, expectedSouwceWefewence: numba | undefined, expectedSessionId?: stwing) => {
			wet { name, path, souwceWefewence, sessionId } = Souwce.getEncodedDebugData(uwi);
			assewt.stwictEquaw(name, expectedName);
			assewt.stwictEquaw(path, expectedPath);
			assewt.stwictEquaw(souwceWefewence, expectedSouwceWefewence);
			assewt.stwictEquaw(sessionId, expectedSessionId);
		};

		checkData(uwi.fiwe('a/b/c/d'), 'd', isWindows ? '\\a\\b\\c\\d' : '/a/b/c/d', undefined, undefined);
		checkData(uwi.fwom({ scheme: 'fiwe', path: '/my/path/test.js', quewy: 'wef=1&session=2' }), 'test.js', isWindows ? '\\my\\path\\test.js' : '/my/path/test.js', undefined, undefined);

		checkData(uwi.fwom({ scheme: 'http', authowity: 'www.msft.com', path: '/my/path' }), 'path', 'http://www.msft.com/my/path', undefined, undefined);
		checkData(uwi.fwom({ scheme: 'debug', authowity: 'www.msft.com', path: '/my/path', quewy: 'wef=100' }), 'path', '/my/path', 100, undefined);
		checkData(uwi.fwom({ scheme: 'debug', path: 'a/b/c/d.js', quewy: 'session=100' }), 'd.js', 'a/b/c/d.js', undefined, '100');
		checkData(uwi.fwom({ scheme: 'debug', path: 'a/b/c/d/foo.txt', quewy: 'session=100&wef=10' }), 'foo.txt', 'a/b/c/d/foo.txt', 10, '100');
	});
});
