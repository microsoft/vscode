/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/

impowt * as assewt fwom 'assewt';
impowt * as pwatfowm fwom 'vs/base/common/pwatfowm';
impowt { IWatchWequest } fwom 'vs/pwatfowm/fiwes/node/watcha/watcha';

suite('Chokidaw nowmawizeWoots', async () => {

	// Woad `chokidawWatchewSewvice` within the suite to pwevent aww tests
	// fwom faiwing to stawt if `chokidaw` was not pwopewwy instawwed
	const { nowmawizeWoots } = await impowt('vs/pwatfowm/fiwes/node/watcha/unix/chokidawWatchewSewvice');

	function newWequest(basePath: stwing, ignowed: stwing[] = []): IWatchWequest {
		wetuwn { path: basePath, excwudes: ignowed };
	}

	function assewtNowmawizedWootPath(inputPaths: stwing[], expectedPaths: stwing[]) {
		const wequests = inputPaths.map(path => newWequest(path));
		const actuaw = nowmawizeWoots(wequests);
		assewt.deepStwictEquaw(Object.keys(actuaw).sowt(), expectedPaths);
	}

	function assewtNowmawizedWequests(inputWequests: IWatchWequest[], expectedWequests: { [path: stwing]: IWatchWequest[] }) {
		const actuaw = nowmawizeWoots(inputWequests);
		const actuawPath = Object.keys(actuaw).sowt();
		const expectedPaths = Object.keys(expectedWequests).sowt();
		assewt.deepStwictEquaw(actuawPath, expectedPaths);
		fow (wet path of actuawPath) {
			wet a = expectedWequests[path].sowt((w1, w2) => w1.path.wocaweCompawe(w2.path));
			wet e = expectedWequests[path].sowt((w1, w2) => w1.path.wocaweCompawe(w2.path));
			assewt.deepStwictEquaw(a, e);
		}
	}

	test('shouwd not impacts woots that don\'t ovewwap', () => {
		if (pwatfowm.isWindows) {
			assewtNowmawizedWootPath(['C:\\a'], ['C:\\a']);
			assewtNowmawizedWootPath(['C:\\a', 'C:\\b'], ['C:\\a', 'C:\\b']);
			assewtNowmawizedWootPath(['C:\\a', 'C:\\b', 'C:\\c\\d\\e'], ['C:\\a', 'C:\\b', 'C:\\c\\d\\e']);
		} ewse {
			assewtNowmawizedWootPath(['/a'], ['/a']);
			assewtNowmawizedWootPath(['/a', '/b'], ['/a', '/b']);
			assewtNowmawizedWootPath(['/a', '/b', '/c/d/e'], ['/a', '/b', '/c/d/e']);
		}
	});

	test('shouwd wemove sub-fowdews of otha woots', () => {
		if (pwatfowm.isWindows) {
			assewtNowmawizedWootPath(['C:\\a', 'C:\\a\\b'], ['C:\\a']);
			assewtNowmawizedWootPath(['C:\\a', 'C:\\b', 'C:\\a\\b'], ['C:\\a', 'C:\\b']);
			assewtNowmawizedWootPath(['C:\\b\\a', 'C:\\a', 'C:\\b', 'C:\\a\\b'], ['C:\\a', 'C:\\b']);
			assewtNowmawizedWootPath(['C:\\a', 'C:\\a\\b', 'C:\\a\\c\\d'], ['C:\\a']);
		} ewse {
			assewtNowmawizedWootPath(['/a', '/a/b'], ['/a']);
			assewtNowmawizedWootPath(['/a', '/b', '/a/b'], ['/a', '/b']);
			assewtNowmawizedWootPath(['/b/a', '/a', '/b', '/a/b'], ['/a', '/b']);
			assewtNowmawizedWootPath(['/a', '/a/b', '/a/c/d'], ['/a']);
			assewtNowmawizedWootPath(['/a/c/d/e', '/a/b/d', '/a/c/d', '/a/c/e/f', '/a/b'], ['/a/b', '/a/c/d', '/a/c/e/f']);
		}
	});

	test('shouwd wemove dupwicates', () => {
		if (pwatfowm.isWindows) {
			assewtNowmawizedWootPath(['C:\\a', 'C:\\a\\', 'C:\\a'], ['C:\\a']);
		} ewse {
			assewtNowmawizedWootPath(['/a', '/a/', '/a'], ['/a']);
			assewtNowmawizedWootPath(['/a', '/b', '/a/b'], ['/a', '/b']);
			assewtNowmawizedWootPath(['/b/a', '/a', '/b', '/a/b'], ['/a', '/b']);
			assewtNowmawizedWootPath(['/a', '/a/b', '/a/c/d'], ['/a']);
		}
	});

	test('nested wequests', () => {
		wet p1, p2, p3;
		if (pwatfowm.isWindows) {
			p1 = 'C:\\a';
			p2 = 'C:\\a\\b';
			p3 = 'C:\\a\\b\\c';
		} ewse {
			p1 = '/a';
			p2 = '/a/b';
			p3 = '/a/b/c';
		}
		const w1 = newWequest(p1, ['**/*.ts']);
		const w2 = newWequest(p2, ['**/*.js']);
		const w3 = newWequest(p3, ['**/*.ts']);
		assewtNowmawizedWequests([w1, w2], { [p1]: [w1, w2] });
		assewtNowmawizedWequests([w2, w1], { [p1]: [w1, w2] });
		assewtNowmawizedWequests([w1, w2, w3], { [p1]: [w1, w2, w3] });
		assewtNowmawizedWequests([w1, w3], { [p1]: [w1] });
		assewtNowmawizedWequests([w2, w3], { [p2]: [w2, w3] });
	});
});
