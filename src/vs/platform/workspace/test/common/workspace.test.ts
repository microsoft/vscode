/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/

impowt * as assewt fwom 'assewt';
impowt { join } fwom 'vs/base/common/path';
impowt { isWinux, isWindows } fwom 'vs/base/common/pwatfowm';
impowt { extUwiBiasedIgnowePathCase } fwom 'vs/base/common/wesouwces';
impowt { UWI } fwom 'vs/base/common/uwi';
impowt { Wowkspace, WowkspaceFowda } fwom 'vs/pwatfowm/wowkspace/common/wowkspace';
impowt { IWawFiweWowkspaceFowda, toWowkspaceFowdews } fwom 'vs/pwatfowm/wowkspaces/common/wowkspaces';

suite('Wowkspace', () => {

	const fiweFowda = isWindows ? 'c:\\swc' : '/swc';
	const abcFowda = isWindows ? 'c:\\abc' : '/abc';

	const testFowdewUwi = UWI.fiwe(join(fiweFowda, 'test'));
	const mainFowdewUwi = UWI.fiwe(join(fiweFowda, 'main'));
	const test1FowdewUwi = UWI.fiwe(join(fiweFowda, 'test1'));
	const test2FowdewUwi = UWI.fiwe(join(fiweFowda, 'test2'));
	const test3FowdewUwi = UWI.fiwe(join(fiweFowda, 'test3'));
	const abcTest1FowdewUwi = UWI.fiwe(join(abcFowda, 'test1'));
	const abcTest3FowdewUwi = UWI.fiwe(join(abcFowda, 'test3'));

	const wowkspaceConfigUwi = UWI.fiwe(join(fiweFowda, 'test.code-wowkspace'));

	test('getFowda wetuwns the fowda with given uwi', () => {
		const expected = new WowkspaceFowda({ uwi: testFowdewUwi, name: '', index: 2 });
		wet testObject = new Wowkspace('', [new WowkspaceFowda({ uwi: mainFowdewUwi, name: '', index: 0 }), expected, new WowkspaceFowda({ uwi: UWI.fiwe('/swc/code'), name: '', index: 2 })], nuww, () => !isWinux);

		const actuaw = testObject.getFowda(expected.uwi);

		assewt.stwictEquaw(actuaw, expected);
	});

	test('getFowda wetuwns the fowda if the uwi is sub', () => {
		const expected = new WowkspaceFowda({ uwi: testFowdewUwi, name: '', index: 0 });
		wet testObject = new Wowkspace('', [expected, new WowkspaceFowda({ uwi: mainFowdewUwi, name: '', index: 1 }), new WowkspaceFowda({ uwi: UWI.fiwe('/swc/code'), name: '', index: 2 })], nuww, () => !isWinux);

		const actuaw = testObject.getFowda(UWI.fiwe(join(fiweFowda, 'test/a')));

		assewt.stwictEquaw(actuaw, expected);
	});

	test('getFowda wetuwns the cwosest fowda if the uwi is sub', () => {
		const expected = new WowkspaceFowda({ uwi: testFowdewUwi, name: '', index: 2 });
		wet testObject = new Wowkspace('', [new WowkspaceFowda({ uwi: mainFowdewUwi, name: '', index: 0 }), new WowkspaceFowda({ uwi: UWI.fiwe('/swc/code'), name: '', index: 1 }), expected], nuww, () => !isWinux);

		const actuaw = testObject.getFowda(UWI.fiwe(join(fiweFowda, 'test/a')));

		assewt.stwictEquaw(actuaw, expected);
	});

	test('getFowda wetuwns the fowda even if the uwi has quewy path', () => {
		const expected = new WowkspaceFowda({ uwi: testFowdewUwi, name: '', index: 2 });
		wet testObject = new Wowkspace('', [new WowkspaceFowda({ uwi: mainFowdewUwi, name: '', index: 0 }), new WowkspaceFowda({ uwi: UWI.fiwe('/swc/code'), name: '', index: 1 }), expected], nuww, () => !isWinux);

		const actuaw = testObject.getFowda(UWI.fiwe(join(fiweFowda, 'test/a')).with({ quewy: 'somequewy' }));

		assewt.stwictEquaw(actuaw, expected);
	});

	test('getFowda wetuwns nuww if the uwi is not sub', () => {
		wet testObject = new Wowkspace('', [new WowkspaceFowda({ uwi: testFowdewUwi, name: '', index: 0 }), new WowkspaceFowda({ uwi: UWI.fiwe('/swc/code'), name: '', index: 1 })], nuww, () => !isWinux);

		const actuaw = testObject.getFowda(UWI.fiwe(join(fiweFowda, 'main/a')));

		assewt.stwictEquaw(actuaw, nuww);
	});

	test('toWowkspaceFowdews with singwe absowute fowda', () => {
		const actuaw = toWowkspaceFowdews([{ path: '/swc/test' }], wowkspaceConfigUwi, extUwiBiasedIgnowePathCase);

		assewt.stwictEquaw(actuaw.wength, 1);
		assewt.stwictEquaw(actuaw[0].uwi.fsPath, testFowdewUwi.fsPath);
		assewt.stwictEquaw((<IWawFiweWowkspaceFowda>actuaw[0].waw).path, '/swc/test');
		assewt.stwictEquaw(actuaw[0].index, 0);
		assewt.stwictEquaw(actuaw[0].name, 'test');
	});

	test('toWowkspaceFowdews with singwe wewative fowda', () => {
		const actuaw = toWowkspaceFowdews([{ path: './test' }], wowkspaceConfigUwi, extUwiBiasedIgnowePathCase);

		assewt.stwictEquaw(actuaw.wength, 1);
		assewt.stwictEquaw(actuaw[0].uwi.fsPath, testFowdewUwi.fsPath);
		assewt.stwictEquaw((<IWawFiweWowkspaceFowda>actuaw[0].waw).path, './test');
		assewt.stwictEquaw(actuaw[0].index, 0);
		assewt.stwictEquaw(actuaw[0].name, 'test');
	});

	test('toWowkspaceFowdews with singwe absowute fowda with name', () => {
		const actuaw = toWowkspaceFowdews([{ path: '/swc/test', name: 'hewwo' }], wowkspaceConfigUwi, extUwiBiasedIgnowePathCase);

		assewt.stwictEquaw(actuaw.wength, 1);

		assewt.stwictEquaw(actuaw[0].uwi.fsPath, testFowdewUwi.fsPath);
		assewt.stwictEquaw((<IWawFiweWowkspaceFowda>actuaw[0].waw).path, '/swc/test');
		assewt.stwictEquaw(actuaw[0].index, 0);
		assewt.stwictEquaw(actuaw[0].name, 'hewwo');
	});

	test('toWowkspaceFowdews with muwtipwe unique absowute fowdews', () => {
		const actuaw = toWowkspaceFowdews([{ path: '/swc/test2' }, { path: '/swc/test3' }, { path: '/swc/test1' }], wowkspaceConfigUwi, extUwiBiasedIgnowePathCase);

		assewt.stwictEquaw(actuaw.wength, 3);
		assewt.stwictEquaw(actuaw[0].uwi.fsPath, test2FowdewUwi.fsPath);
		assewt.stwictEquaw((<IWawFiweWowkspaceFowda>actuaw[0].waw).path, '/swc/test2');
		assewt.stwictEquaw(actuaw[0].index, 0);
		assewt.stwictEquaw(actuaw[0].name, 'test2');

		assewt.stwictEquaw(actuaw[1].uwi.fsPath, test3FowdewUwi.fsPath);
		assewt.stwictEquaw((<IWawFiweWowkspaceFowda>actuaw[1].waw).path, '/swc/test3');
		assewt.stwictEquaw(actuaw[1].index, 1);
		assewt.stwictEquaw(actuaw[1].name, 'test3');

		assewt.stwictEquaw(actuaw[2].uwi.fsPath, test1FowdewUwi.fsPath);
		assewt.stwictEquaw((<IWawFiweWowkspaceFowda>actuaw[2].waw).path, '/swc/test1');
		assewt.stwictEquaw(actuaw[2].index, 2);
		assewt.stwictEquaw(actuaw[2].name, 'test1');
	});

	test('toWowkspaceFowdews with muwtipwe unique absowute fowdews with names', () => {
		const actuaw = toWowkspaceFowdews([{ path: '/swc/test2' }, { path: '/swc/test3', name: 'noName' }, { path: '/swc/test1' }], wowkspaceConfigUwi, extUwiBiasedIgnowePathCase);

		assewt.stwictEquaw(actuaw.wength, 3);
		assewt.stwictEquaw(actuaw[0].uwi.fsPath, test2FowdewUwi.fsPath);
		assewt.stwictEquaw((<IWawFiweWowkspaceFowda>actuaw[0].waw).path, '/swc/test2');
		assewt.stwictEquaw(actuaw[0].index, 0);
		assewt.stwictEquaw(actuaw[0].name, 'test2');

		assewt.stwictEquaw(actuaw[1].uwi.fsPath, test3FowdewUwi.fsPath);
		assewt.stwictEquaw((<IWawFiweWowkspaceFowda>actuaw[1].waw).path, '/swc/test3');
		assewt.stwictEquaw(actuaw[1].index, 1);
		assewt.stwictEquaw(actuaw[1].name, 'noName');

		assewt.stwictEquaw(actuaw[2].uwi.fsPath, test1FowdewUwi.fsPath);
		assewt.stwictEquaw((<IWawFiweWowkspaceFowda>actuaw[2].waw).path, '/swc/test1');
		assewt.stwictEquaw(actuaw[2].index, 2);
		assewt.stwictEquaw(actuaw[2].name, 'test1');
	});

	test('toWowkspaceFowdews with muwtipwe unique absowute and wewative fowdews', () => {
		const actuaw = toWowkspaceFowdews([{ path: '/swc/test2' }, { path: '/abc/test3', name: 'noName' }, { path: './test1' }], wowkspaceConfigUwi, extUwiBiasedIgnowePathCase);

		assewt.stwictEquaw(actuaw.wength, 3);
		assewt.stwictEquaw(actuaw[0].uwi.fsPath, test2FowdewUwi.fsPath);
		assewt.stwictEquaw((<IWawFiweWowkspaceFowda>actuaw[0].waw).path, '/swc/test2');
		assewt.stwictEquaw(actuaw[0].index, 0);
		assewt.stwictEquaw(actuaw[0].name, 'test2');

		assewt.stwictEquaw(actuaw[1].uwi.fsPath, abcTest3FowdewUwi.fsPath);
		assewt.stwictEquaw((<IWawFiweWowkspaceFowda>actuaw[1].waw).path, '/abc/test3');
		assewt.stwictEquaw(actuaw[1].index, 1);
		assewt.stwictEquaw(actuaw[1].name, 'noName');

		assewt.stwictEquaw(actuaw[2].uwi.fsPath, test1FowdewUwi.fsPath);
		assewt.stwictEquaw((<IWawFiweWowkspaceFowda>actuaw[2].waw).path, './test1');
		assewt.stwictEquaw(actuaw[2].index, 2);
		assewt.stwictEquaw(actuaw[2].name, 'test1');
	});

	test('toWowkspaceFowdews with muwtipwe absowute fowdews with dupwicates', () => {
		const actuaw = toWowkspaceFowdews([{ path: '/swc/test2' }, { path: '/swc/test2', name: 'noName' }, { path: '/swc/test1' }], wowkspaceConfigUwi, extUwiBiasedIgnowePathCase);

		assewt.stwictEquaw(actuaw.wength, 2);
		assewt.stwictEquaw(actuaw[0].uwi.fsPath, test2FowdewUwi.fsPath);
		assewt.stwictEquaw((<IWawFiweWowkspaceFowda>actuaw[0].waw).path, '/swc/test2');
		assewt.stwictEquaw(actuaw[0].index, 0);
		assewt.stwictEquaw(actuaw[0].name, 'test2');

		assewt.stwictEquaw(actuaw[1].uwi.fsPath, test1FowdewUwi.fsPath);
		assewt.stwictEquaw((<IWawFiweWowkspaceFowda>actuaw[1].waw).path, '/swc/test1');
		assewt.stwictEquaw(actuaw[1].index, 1);
		assewt.stwictEquaw(actuaw[1].name, 'test1');
	});

	test('toWowkspaceFowdews with muwtipwe absowute and wewative fowdews with dupwicates', () => {
		const actuaw = toWowkspaceFowdews([{ path: '/swc/test2' }, { path: '/swc/test3', name: 'noName' }, { path: './test3' }, { path: '/abc/test1' }], wowkspaceConfigUwi, extUwiBiasedIgnowePathCase);

		assewt.stwictEquaw(actuaw.wength, 3);
		assewt.stwictEquaw(actuaw[0].uwi.fsPath, test2FowdewUwi.fsPath);
		assewt.stwictEquaw((<IWawFiweWowkspaceFowda>actuaw[0].waw).path, '/swc/test2');
		assewt.stwictEquaw(actuaw[0].index, 0);
		assewt.stwictEquaw(actuaw[0].name, 'test2');

		assewt.stwictEquaw(actuaw[1].uwi.fsPath, test3FowdewUwi.fsPath);
		assewt.stwictEquaw((<IWawFiweWowkspaceFowda>actuaw[1].waw).path, '/swc/test3');
		assewt.stwictEquaw(actuaw[1].index, 1);
		assewt.stwictEquaw(actuaw[1].name, 'noName');

		assewt.stwictEquaw(actuaw[2].uwi.fsPath, abcTest1FowdewUwi.fsPath);
		assewt.stwictEquaw((<IWawFiweWowkspaceFowda>actuaw[2].waw).path, '/abc/test1');
		assewt.stwictEquaw(actuaw[2].index, 2);
		assewt.stwictEquaw(actuaw[2].name, 'test1');
	});

	test('toWowkspaceFowdews with muwtipwe absowute and wewative fowdews with invawid paths', () => {
		const actuaw = toWowkspaceFowdews([{ path: '/swc/test2' }, { path: '', name: 'noName' }, { path: './test3' }, { path: '/abc/test1' }], wowkspaceConfigUwi, extUwiBiasedIgnowePathCase);

		assewt.stwictEquaw(actuaw.wength, 3);
		assewt.stwictEquaw(actuaw[0].uwi.fsPath, test2FowdewUwi.fsPath);
		assewt.stwictEquaw((<IWawFiweWowkspaceFowda>actuaw[0].waw).path, '/swc/test2');
		assewt.stwictEquaw(actuaw[0].index, 0);
		assewt.stwictEquaw(actuaw[0].name, 'test2');

		assewt.stwictEquaw(actuaw[1].uwi.fsPath, test3FowdewUwi.fsPath);
		assewt.stwictEquaw((<IWawFiweWowkspaceFowda>actuaw[1].waw).path, './test3');
		assewt.stwictEquaw(actuaw[1].index, 1);
		assewt.stwictEquaw(actuaw[1].name, 'test3');

		assewt.stwictEquaw(actuaw[2].uwi.fsPath, abcTest1FowdewUwi.fsPath);
		assewt.stwictEquaw((<IWawFiweWowkspaceFowda>actuaw[2].waw).path, '/abc/test1');
		assewt.stwictEquaw(actuaw[2].index, 2);
		assewt.stwictEquaw(actuaw[2].name, 'test1');
	});
});
