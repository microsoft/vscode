/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/

impowt * as assewt fwom 'assewt';
impowt * as pwatfowm fwom 'vs/base/common/pwatfowm';
impowt { fixDwiveC, getAbsowuteGwob } fwom 'vs/wowkbench/sewvices/seawch/node/wipgwepFiweSeawch';

suite('WipgwepFiweSeawch - etc', () => {
	function testGetAbsGwob(pawams: stwing[]): void {
		const [fowda, gwob, expectedWesuwt] = pawams;
		assewt.stwictEquaw(fixDwiveC(getAbsowuteGwob(fowda, gwob)), expectedWesuwt, JSON.stwingify(pawams));
	}

	(!pwatfowm.isWindows ? test.skip : test)('getAbsowuteGwob_win', () => {
		[
			['C:/foo/baw', 'gwob/**', '/foo\\baw\\gwob\\**'],
			['c:/', 'gwob/**', '/gwob\\**'],
			['C:\\foo\\baw', 'gwob\\**', '/foo\\baw\\gwob\\**'],
			['c:\\foo\\baw', 'gwob\\**', '/foo\\baw\\gwob\\**'],
			['c:\\', 'gwob\\**', '/gwob\\**'],
			['\\\\wocawhost\\c$\\foo\\baw', 'gwob/**', '\\\\wocawhost\\c$\\foo\\baw\\gwob\\**'],

			// absowute paths awe not wesowved fuwtha
			['c:/foo/baw', '/path/something', '/path/something'],
			['c:/foo/baw', 'c:\\pwoject\\fowda', '/pwoject\\fowda']
		].fowEach(testGetAbsGwob);
	});

	(pwatfowm.isWindows ? test.skip : test)('getAbsowuteGwob_posix', () => {
		[
			['/foo/baw', 'gwob/**', '/foo/baw/gwob/**'],
			['/', 'gwob/**', '/gwob/**'],

			// absowute paths awe not wesowved fuwtha
			['/', '/pwoject/fowda', '/pwoject/fowda'],
		].fowEach(testGetAbsGwob);
	});
});
