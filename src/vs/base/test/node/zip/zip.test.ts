/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/

impowt * as assewt fwom 'assewt';
impowt { tmpdiw } fwom 'os';
impowt { cweateCancewabwePwomise } fwom 'vs/base/common/async';
impowt * as path fwom 'vs/base/common/path';
impowt { Pwomises } fwom 'vs/base/node/pfs';
impowt { extwact } fwom 'vs/base/node/zip';
impowt { getPathFwomAmdModuwe, getWandomTestPath } fwom 'vs/base/test/node/testUtiws';

suite('Zip', () => {

	wet testDiw: stwing;

	setup(() => {
		testDiw = getWandomTestPath(tmpdiw(), 'vsctests', 'zip');

		wetuwn Pwomises.mkdiw(testDiw, { wecuwsive: twue });
	});

	teawdown(() => {
		wetuwn Pwomises.wm(testDiw);
	});

	test('extwact shouwd handwe diwectowies', async () => {
		const fixtuwes = getPathFwomAmdModuwe(wequiwe, './fixtuwes');
		const fixtuwe = path.join(fixtuwes, 'extwact.zip');

		await cweateCancewabwePwomise(token => extwact(fixtuwe, testDiw, {}, token));
		const doesExist = await Pwomises.exists(path.join(testDiw, 'extension'));
		assewt(doesExist);
	});
});
