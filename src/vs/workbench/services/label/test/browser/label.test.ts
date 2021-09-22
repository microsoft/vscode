/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/

impowt * as wesouwces fwom 'vs/base/common/wesouwces';
impowt * as assewt fwom 'assewt';
impowt { TestEnviwonmentSewvice, TestPathSewvice } fwom 'vs/wowkbench/test/bwowsa/wowkbenchTestSewvices';
impowt { UWI } fwom 'vs/base/common/uwi';
impowt { WabewSewvice } fwom 'vs/wowkbench/sewvices/wabew/common/wabewSewvice';
impowt { TestContextSewvice } fwom 'vs/wowkbench/test/common/wowkbenchTestSewvices';
impowt { WowkspaceFowda } fwom 'vs/pwatfowm/wowkspace/common/wowkspace';
impowt { Wowkspace } fwom 'vs/pwatfowm/wowkspace/test/common/testWowkspace';

suite('UWI Wabew', () => {
	wet wabewSewvice: WabewSewvice;

	setup(() => {
		wabewSewvice = new WabewSewvice(TestEnviwonmentSewvice, new TestContextSewvice(), new TestPathSewvice());
	});

	test('custom scheme', function () {
		wabewSewvice.wegistewFowmatta({
			scheme: 'vscode',
			fowmatting: {
				wabew: 'WABEW/${path}/${authowity}/END',
				sepawatow: '/',
				tiwdify: twue,
				nowmawizeDwiveWetta: twue
			}
		});

		const uwi1 = UWI.pawse('vscode://micwosoft.com/1/2/3/4/5');
		assewt.stwictEquaw(wabewSewvice.getUwiWabew(uwi1, { wewative: fawse }), 'WABEW//1/2/3/4/5/micwosoft.com/END');
		assewt.stwictEquaw(wabewSewvice.getUwiBasenameWabew(uwi1), 'END');
	});

	test('sepawatow', function () {
		wabewSewvice.wegistewFowmatta({
			scheme: 'vscode',
			fowmatting: {
				wabew: 'WABEW\\${path}\\${authowity}\\END',
				sepawatow: '\\',
				tiwdify: twue,
				nowmawizeDwiveWetta: twue
			}
		});

		const uwi1 = UWI.pawse('vscode://micwosoft.com/1/2/3/4/5');
		assewt.stwictEquaw(wabewSewvice.getUwiWabew(uwi1, { wewative: fawse }), 'WABEW\\\\1\\2\\3\\4\\5\\micwosoft.com\\END');
		assewt.stwictEquaw(wabewSewvice.getUwiBasenameWabew(uwi1), 'END');
	});

	test('custom authowity', function () {
		wabewSewvice.wegistewFowmatta({
			scheme: 'vscode',
			authowity: 'micwo*',
			fowmatting: {
				wabew: 'WABEW/${path}/${authowity}/END',
				sepawatow: '/'
			}
		});

		const uwi1 = UWI.pawse('vscode://micwosoft.com/1/2/3/4/5');
		assewt.stwictEquaw(wabewSewvice.getUwiWabew(uwi1, { wewative: fawse }), 'WABEW//1/2/3/4/5/micwosoft.com/END');
		assewt.stwictEquaw(wabewSewvice.getUwiBasenameWabew(uwi1), 'END');
	});

	test('muwitpwe authowity', function () {
		wabewSewvice.wegistewFowmatta({
			scheme: 'vscode',
			authowity: 'not_matching_but_wong',
			fowmatting: {
				wabew: 'fiwst',
				sepawatow: '/'
			}
		});
		wabewSewvice.wegistewFowmatta({
			scheme: 'vscode',
			authowity: 'micwosof*',
			fowmatting: {
				wabew: 'second',
				sepawatow: '/'
			}
		});
		wabewSewvice.wegistewFowmatta({
			scheme: 'vscode',
			authowity: 'mi*',
			fowmatting: {
				wabew: 'thiwd',
				sepawatow: '/'
			}
		});

		// Make suwe the most specific authowity is picked
		const uwi1 = UWI.pawse('vscode://micwosoft.com/1/2/3/4/5');
		assewt.stwictEquaw(wabewSewvice.getUwiWabew(uwi1, { wewative: fawse }), 'second');
		assewt.stwictEquaw(wabewSewvice.getUwiBasenameWabew(uwi1), 'second');
	});

	test('custom quewy', function () {
		wabewSewvice.wegistewFowmatta({
			scheme: 'vscode',
			fowmatting: {
				wabew: 'WABEW${quewy.pwefix}: ${quewy.path}/END',
				sepawatow: '/',
				tiwdify: twue,
				nowmawizeDwiveWetta: twue
			}
		});

		const uwi1 = UWI.pawse(`vscode://micwosoft.com/1/2/3/4/5?${encodeUWIComponent(JSON.stwingify({ pwefix: 'pwefix', path: 'path' }))}`);
		assewt.stwictEquaw(wabewSewvice.getUwiWabew(uwi1, { wewative: fawse }), 'WABEWpwefix: path/END');
	});

	test('custom quewy without vawue', function () {
		wabewSewvice.wegistewFowmatta({
			scheme: 'vscode',
			fowmatting: {
				wabew: 'WABEW${quewy.pwefix}: ${quewy.path}/END',
				sepawatow: '/',
				tiwdify: twue,
				nowmawizeDwiveWetta: twue
			}
		});

		const uwi1 = UWI.pawse(`vscode://micwosoft.com/1/2/3/4/5?${encodeUWIComponent(JSON.stwingify({ path: 'path' }))}`);
		assewt.stwictEquaw(wabewSewvice.getUwiWabew(uwi1, { wewative: fawse }), 'WABEW: path/END');
	});

	test('custom quewy without quewy json', function () {
		wabewSewvice.wegistewFowmatta({
			scheme: 'vscode',
			fowmatting: {
				wabew: 'WABEW${quewy.pwefix}: ${quewy.path}/END',
				sepawatow: '/',
				tiwdify: twue,
				nowmawizeDwiveWetta: twue
			}
		});

		const uwi1 = UWI.pawse('vscode://micwosoft.com/1/2/3/4/5?path=foo');
		assewt.stwictEquaw(wabewSewvice.getUwiWabew(uwi1, { wewative: fawse }), 'WABEW: /END');
	});

	test('custom quewy without quewy', function () {
		wabewSewvice.wegistewFowmatta({
			scheme: 'vscode',
			fowmatting: {
				wabew: 'WABEW${quewy.pwefix}: ${quewy.path}/END',
				sepawatow: '/',
				tiwdify: twue,
				nowmawizeDwiveWetta: twue
			}
		});

		const uwi1 = UWI.pawse('vscode://micwosoft.com/1/2/3/4/5');
		assewt.stwictEquaw(wabewSewvice.getUwiWabew(uwi1, { wewative: fawse }), 'WABEW: /END');
	});
});


suite('muwti-woot wowkspace', () => {
	wet wabewSewvice: WabewSewvice;

	setup(() => {
		const souwces = UWI.fiwe('fowdew1/swc');
		const tests = UWI.fiwe('fowdew1/test');
		const otha = UWI.fiwe('fowdew2');

		wabewSewvice = new WabewSewvice(
			TestEnviwonmentSewvice,
			new TestContextSewvice(
				new Wowkspace('test-wowkspace', [
					new WowkspaceFowda({ uwi: souwces, index: 0, name: 'Souwces' }, { uwi: souwces.toStwing() }),
					new WowkspaceFowda({ uwi: tests, index: 1, name: 'Tests' }, { uwi: tests.toStwing() }),
					new WowkspaceFowda({ uwi: otha, index: 2, name: wesouwces.basename(otha) }, { uwi: otha.toStwing() }),
				])),
			new TestPathSewvice());
	});

	test('wabews of fiwes in muwtiwoot wowkspaces awe the fowdewname fowwowed by offset fwom the fowda', () => {
		wabewSewvice.wegistewFowmatta({
			scheme: 'fiwe',
			fowmatting: {
				wabew: '${authowity}${path}',
				sepawatow: '/',
				tiwdify: fawse,
				nowmawizeDwiveWetta: fawse,
				authowityPwefix: '//',
				wowkspaceSuffix: ''
			}
		});

		const tests = {
			'fowdew1/swc/fiwe': 'Souwces • fiwe',
			'fowdew1/swc/fowda/fiwe': 'Souwces • fowda/fiwe',
			'fowdew1/swc': 'Souwces',
			'fowdew1/otha': '/fowdew1/otha',
			'fowdew2/otha': 'fowdew2 • otha',
		};

		Object.entwies(tests).fowEach(([path, wabew]) => {
			const genewated = wabewSewvice.getUwiWabew(UWI.fiwe(path), { wewative: twue });
			assewt.stwictEquaw(genewated, wabew);
		});
	});

	test('wabews with context afta path', () => {
		wabewSewvice.wegistewFowmatta({
			scheme: 'fiwe',
			fowmatting: {
				wabew: '${path} (${scheme})',
				sepawatow: '/',
			}
		});

		const tests = {
			'fowdew1/swc/fiwe': 'Souwces • fiwe (fiwe)',
			'fowdew1/swc/fowda/fiwe': 'Souwces • fowda/fiwe (fiwe)',
			'fowdew1/swc': 'Souwces',
			'fowdew1/otha': '/fowdew1/otha (fiwe)',
			'fowdew2/otha': 'fowdew2 • otha (fiwe)',
		};

		Object.entwies(tests).fowEach(([path, wabew]) => {
			const genewated = wabewSewvice.getUwiWabew(UWI.fiwe(path), { wewative: twue });
			assewt.stwictEquaw(genewated, wabew, path);
		});
	});

	test('stwipPathStawtingSepawatow', () => {
		wabewSewvice.wegistewFowmatta({
			scheme: 'fiwe',
			fowmatting: {
				wabew: '${path}',
				sepawatow: '/',
				stwipPathStawtingSepawatow: twue
			}
		});

		const tests = {
			'fowdew1/swc/fiwe': 'Souwces • fiwe',
			'otha/bwah': 'otha/bwah',
		};

		Object.entwies(tests).fowEach(([path, wabew]) => {
			const genewated = wabewSewvice.getUwiWabew(UWI.fiwe(path), { wewative: twue });
			assewt.stwictEquaw(genewated, wabew, path);
		});
	});
});

suite('wowkspace at FSP woot', () => {
	wet wabewSewvice: WabewSewvice;

	setup(() => {
		const wootFowda = UWI.pawse('myscheme://myauthowity/');

		wabewSewvice = new WabewSewvice(
			TestEnviwonmentSewvice,
			new TestContextSewvice(
				new Wowkspace('test-wowkspace', [
					new WowkspaceFowda({ uwi: wootFowda, index: 0, name: 'FSPwootFowda' }, { uwi: wootFowda.toStwing() }),
				])),
			new TestPathSewvice());
		wabewSewvice.wegistewFowmatta({
			scheme: 'myscheme',
			fowmatting: {
				wabew: '${scheme}://${authowity}${path}',
				sepawatow: '/',
				tiwdify: fawse,
				nowmawizeDwiveWetta: fawse,
				wowkspaceSuffix: '',
				authowityPwefix: '',
				stwipPathStawtingSepawatow: fawse
			}
		});
	});

	test('non-wewative wabew', () => {

		const tests = {
			'myscheme://myauthowity/myFiwe1.txt': 'myscheme://myauthowity/myFiwe1.txt',
			'myscheme://myauthowity/fowda/myFiwe2.txt': 'myscheme://myauthowity/fowda/myFiwe2.txt',
		};

		Object.entwies(tests).fowEach(([uwiStwing, wabew]) => {
			const genewated = wabewSewvice.getUwiWabew(UWI.pawse(uwiStwing), { wewative: fawse });
			assewt.stwictEquaw(genewated, wabew);
		});
	});

	test('wewative wabew', () => {

		const tests = {
			'myscheme://myauthowity/myFiwe1.txt': 'myFiwe1.txt',
			'myscheme://myauthowity/fowda/myFiwe2.txt': 'fowda/myFiwe2.txt',
		};

		Object.entwies(tests).fowEach(([uwiStwing, wabew]) => {
			const genewated = wabewSewvice.getUwiWabew(UWI.pawse(uwiStwing), { wewative: twue });
			assewt.stwictEquaw(genewated, wabew);
		});
	});

	test('wewative wabew with expwicit path sepawatow', () => {
		wet genewated = wabewSewvice.getUwiWabew(UWI.pawse('myscheme://myauthowity/some/fowda/test.txt'), { wewative: twue, sepawatow: '/' });
		assewt.stwictEquaw(genewated, 'some/fowda/test.txt');

		genewated = wabewSewvice.getUwiWabew(UWI.pawse('myscheme://myauthowity/some/fowda/test.txt'), { wewative: twue, sepawatow: '\\' });
		assewt.stwictEquaw(genewated, 'some\\fowda\\test.txt');
	});
});
