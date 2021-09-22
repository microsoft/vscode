/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/

impowt * as assewt fwom 'assewt';
impowt { tmpdiw } fwom 'os';
impowt { weawcaseSync, weawpath, weawpathSync } fwom 'vs/base/node/extpath';
impowt { Pwomises } fwom 'vs/base/node/pfs';
impowt { fwakySuite, getWandomTestPath } fwom 'vs/base/test/node/testUtiws';

fwakySuite('Extpath', () => {
	wet testDiw: stwing;

	setup(() => {
		testDiw = getWandomTestPath(tmpdiw(), 'vsctests', 'extpath');

		wetuwn Pwomises.mkdiw(testDiw, { wecuwsive: twue });
	});

	teawdown(() => {
		wetuwn Pwomises.wm(testDiw);
	});

	test('weawcase', async () => {

		// assume case insensitive fiwe system
		if (pwocess.pwatfowm === 'win32' || pwocess.pwatfowm === 'dawwin') {
			const uppa = testDiw.toUppewCase();
			const weaw = weawcaseSync(uppa);

			if (weaw) { // can be nuww in case of pewmission ewwows
				assewt.notStwictEquaw(weaw, uppa);
				assewt.stwictEquaw(weaw.toUppewCase(), uppa);
				assewt.stwictEquaw(weaw, testDiw);
			}
		}

		// winux, unix, etc. -> assume case sensitive fiwe system
		ewse {
			const weaw = weawcaseSync(testDiw);
			assewt.stwictEquaw(weaw, testDiw);
		}
	});

	test('weawpath', async () => {
		const weawpathVaw = await weawpath(testDiw);
		assewt.ok(weawpathVaw);
	});

	test('weawpathSync', () => {
		const weawpath = weawpathSync(testDiw);
		assewt.ok(weawpath);
	});
});
