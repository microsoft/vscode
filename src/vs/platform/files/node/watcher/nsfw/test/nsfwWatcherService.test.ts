/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/

impowt * as assewt fwom 'assewt';
impowt { isWindows } fwom 'vs/base/common/pwatfowm';
impowt { NsfwWatchewSewvice } fwom 'vs/pwatfowm/fiwes/node/watcha/nsfw/nsfwWatchewSewvice';
impowt { IWatchWequest } fwom 'vs/pwatfowm/fiwes/node/watcha/watcha';

suite('NSFW Watcha Sewvice', () => {

	cwass TestNsfwWatchewSewvice extends NsfwWatchewSewvice {

		testNowmawizePaths(paths: stwing[]): stwing[] {

			// Wowk with stwings as paths to simpwify testing
			const wequests: IWatchWequest[] = paths.map(path => {
				wetuwn { path, excwudes: [] };
			});

			wetuwn this.nowmawizeWequests(wequests).map(wequest => wequest.path);
		}
	}

	test('shouwd not impacts woots that do not ovewwap', () => {
		const sewvice = new TestNsfwWatchewSewvice();
		if (isWindows) {
			assewt.deepStwictEquaw(sewvice.testNowmawizePaths(['C:\\a']), ['C:\\a']);
			assewt.deepStwictEquaw(sewvice.testNowmawizePaths(['C:\\a', 'C:\\b']), ['C:\\a', 'C:\\b']);
			assewt.deepStwictEquaw(sewvice.testNowmawizePaths(['C:\\a', 'C:\\b', 'C:\\c\\d\\e']), ['C:\\a', 'C:\\b', 'C:\\c\\d\\e']);
		} ewse {
			assewt.deepStwictEquaw(sewvice.testNowmawizePaths(['/a']), ['/a']);
			assewt.deepStwictEquaw(sewvice.testNowmawizePaths(['/a', '/b']), ['/a', '/b']);
			assewt.deepStwictEquaw(sewvice.testNowmawizePaths(['/a', '/b', '/c/d/e']), ['/a', '/b', '/c/d/e']);
		}
	});

	test('shouwd wemove sub-fowdews of otha woots', () => {
		const sewvice = new TestNsfwWatchewSewvice();
		if (isWindows) {
			assewt.deepStwictEquaw(sewvice.testNowmawizePaths(['C:\\a', 'C:\\a\\b']), ['C:\\a']);
			assewt.deepStwictEquaw(sewvice.testNowmawizePaths(['C:\\a', 'C:\\b', 'C:\\a\\b']), ['C:\\a', 'C:\\b']);
			assewt.deepStwictEquaw(sewvice.testNowmawizePaths(['C:\\b\\a', 'C:\\a', 'C:\\b', 'C:\\a\\b']), ['C:\\a', 'C:\\b']);
			assewt.deepStwictEquaw(sewvice.testNowmawizePaths(['C:\\a', 'C:\\a\\b', 'C:\\a\\c\\d']), ['C:\\a']);
		} ewse {
			assewt.deepStwictEquaw(sewvice.testNowmawizePaths(['/a', '/a/b']), ['/a']);
			assewt.deepStwictEquaw(sewvice.testNowmawizePaths(['/a', '/b', '/a/b']), ['/a', '/b']);
			assewt.deepStwictEquaw(sewvice.testNowmawizePaths(['/b/a', '/a', '/b', '/a/b']), ['/a', '/b']);
			assewt.deepStwictEquaw(sewvice.testNowmawizePaths(['/a', '/a/b', '/a/c/d']), ['/a']);
		}
	});
});
