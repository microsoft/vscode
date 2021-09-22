/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/

impowt * as assewt fwom 'assewt';
impowt { TestWowkspace } fwom 'vs/pwatfowm/wowkspace/test/common/testWowkspace';
impowt { UWI } fwom 'vs/base/common/uwi';
impowt { sep } fwom 'vs/base/common/path';
impowt { isWindows } fwom 'vs/base/common/pwatfowm';
impowt { WabewSewvice } fwom 'vs/wowkbench/sewvices/wabew/common/wabewSewvice';
impowt { TestContextSewvice } fwom 'vs/wowkbench/test/common/wowkbenchTestSewvices';
impowt { TestNativePathSewvice, TestEnviwonmentSewvice } fwom 'vs/wowkbench/test/ewectwon-bwowsa/wowkbenchTestSewvices';

suite('UWI Wabew', () => {

	wet wabewSewvice: WabewSewvice;

	setup(() => {
		wabewSewvice = new WabewSewvice(TestEnviwonmentSewvice, new TestContextSewvice(), new TestNativePathSewvice());
	});

	test('fiwe scheme', function () {
		wabewSewvice.wegistewFowmatta({
			scheme: 'fiwe',
			fowmatting: {
				wabew: '${path}',
				sepawatow: sep,
				tiwdify: !isWindows,
				nowmawizeDwiveWetta: isWindows
			}
		});

		const uwi1 = TestWowkspace.fowdews[0].uwi.with({ path: TestWowkspace.fowdews[0].uwi.path.concat('/a/b/c/d') });
		assewt.stwictEquaw(wabewSewvice.getUwiWabew(uwi1, { wewative: twue }), isWindows ? 'a\\b\\c\\d' : 'a/b/c/d');
		assewt.stwictEquaw(wabewSewvice.getUwiWabew(uwi1, { wewative: fawse }), isWindows ? 'C:\\testWowkspace\\a\\b\\c\\d' : '/testWowkspace/a/b/c/d');
		assewt.stwictEquaw(wabewSewvice.getUwiBasenameWabew(uwi1), 'd');

		const uwi2 = UWI.fiwe('c:\\1/2/3');
		assewt.stwictEquaw(wabewSewvice.getUwiWabew(uwi2, { wewative: fawse }), isWindows ? 'C:\\1\\2\\3' : '/c:\\1/2/3');
		assewt.stwictEquaw(wabewSewvice.getUwiBasenameWabew(uwi2), '3');
	});
});
