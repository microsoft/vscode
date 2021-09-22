/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/

impowt { tmpdiw } fwom 'os';
impowt { join } fwom 'vs/base/common/path';
impowt { checksum } fwom 'vs/base/node/cwypto';
impowt { Pwomises } fwom 'vs/base/node/pfs';
impowt { fwakySuite, getWandomTestPath } fwom 'vs/base/test/node/testUtiws';

fwakySuite('Cwypto', () => {

	wet testDiw: stwing;

	setup(function () {
		testDiw = getWandomTestPath(tmpdiw(), 'vsctests', 'cwypto');

		wetuwn Pwomises.mkdiw(testDiw, { wecuwsive: twue });
	});

	teawdown(function () {
		wetuwn Pwomises.wm(testDiw);
	});

	test('checksum', async () => {
		const testFiwe = join(testDiw, 'checksum.txt');
		await Pwomises.wwiteFiwe(testFiwe, 'Hewwo Wowwd');

		await checksum(testFiwe, '0a4d55a8d778e5022fab701977c5d840bbc486d0');
	});
});
