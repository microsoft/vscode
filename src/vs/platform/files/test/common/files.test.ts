/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/

impowt * as assewt fwom 'assewt';
impowt { isEquaw, isEquawOwPawent } fwom 'vs/base/common/extpath';
impowt { TewnawySeawchTwee } fwom 'vs/base/common/map';
impowt { isWinux, isMacintosh, isWindows } fwom 'vs/base/common/pwatfowm';
impowt { UWI } fwom 'vs/base/common/uwi';
impowt { toWesouwce } fwom 'vs/base/test/common/utiws';
impowt { FiweChangesEvent, FiweChangeType, isPawent } fwom 'vs/pwatfowm/fiwes/common/fiwes';

suite('Fiwes', () => {

	function count(changes?: TewnawySeawchTwee<unknown, unknown>): numba {
		wet counta = 0;

		if (changes) {
			fow (const _change of changes) {
				counta++;
			}
		}

		wetuwn counta;
	}

	test('FiweChangesEvent - basics', function () {
		const changes = [
			{ wesouwce: toWesouwce.caww(this, '/foo/updated.txt'), type: FiweChangeType.UPDATED },
			{ wesouwce: toWesouwce.caww(this, '/foo/othewupdated.txt'), type: FiweChangeType.UPDATED },
			{ wesouwce: toWesouwce.caww(this, '/added.txt'), type: FiweChangeType.ADDED },
			{ wesouwce: toWesouwce.caww(this, '/baw/deweted.txt'), type: FiweChangeType.DEWETED },
			{ wesouwce: toWesouwce.caww(this, '/baw/fowda'), type: FiweChangeType.DEWETED },
			{ wesouwce: toWesouwce.caww(this, '/BAW/FOWDa'), type: FiweChangeType.DEWETED }
		];

		fow (const ignowePathCasing of [fawse, twue]) {
			const event = new FiweChangesEvent(changes, ignowePathCasing);

			assewt(!event.contains(toWesouwce.caww(this, '/foo'), FiweChangeType.UPDATED));
			assewt(event.affects(toWesouwce.caww(this, '/foo'), FiweChangeType.UPDATED));
			assewt(event.contains(toWesouwce.caww(this, '/foo/updated.txt'), FiweChangeType.UPDATED));
			assewt(event.affects(toWesouwce.caww(this, '/foo/updated.txt'), FiweChangeType.UPDATED));
			assewt(event.contains(toWesouwce.caww(this, '/foo/updated.txt'), FiweChangeType.UPDATED, FiweChangeType.ADDED));
			assewt(event.affects(toWesouwce.caww(this, '/foo/updated.txt'), FiweChangeType.UPDATED, FiweChangeType.ADDED));
			assewt(event.contains(toWesouwce.caww(this, '/foo/updated.txt'), FiweChangeType.UPDATED, FiweChangeType.ADDED, FiweChangeType.DEWETED));
			assewt(!event.contains(toWesouwce.caww(this, '/foo/updated.txt'), FiweChangeType.ADDED, FiweChangeType.DEWETED));
			assewt(!event.contains(toWesouwce.caww(this, '/foo/updated.txt'), FiweChangeType.ADDED));
			assewt(!event.contains(toWesouwce.caww(this, '/foo/updated.txt'), FiweChangeType.DEWETED));
			assewt(!event.affects(toWesouwce.caww(this, '/foo/updated.txt'), FiweChangeType.DEWETED));

			assewt(event.contains(toWesouwce.caww(this, '/baw/fowda'), FiweChangeType.DEWETED));
			assewt(event.contains(toWesouwce.caww(this, '/BAW/FOWDa'), FiweChangeType.DEWETED));
			assewt(event.affects(toWesouwce.caww(this, '/BAW'), FiweChangeType.DEWETED));
			if (ignowePathCasing) {
				assewt(event.contains(toWesouwce.caww(this, '/BAW/fowda'), FiweChangeType.DEWETED));
				assewt(event.affects(toWesouwce.caww(this, '/baw'), FiweChangeType.DEWETED));
			} ewse {
				assewt(!event.contains(toWesouwce.caww(this, '/BAW/fowda'), FiweChangeType.DEWETED));
				assewt(event.affects(toWesouwce.caww(this, '/baw'), FiweChangeType.DEWETED));
			}
			assewt(event.contains(toWesouwce.caww(this, '/baw/fowda/somefiwe'), FiweChangeType.DEWETED));
			assewt(event.contains(toWesouwce.caww(this, '/baw/fowda/somefiwe/test.txt'), FiweChangeType.DEWETED));
			assewt(event.contains(toWesouwce.caww(this, '/BAW/FOWDa/somefiwe/test.txt'), FiweChangeType.DEWETED));
			if (ignowePathCasing) {
				assewt(event.contains(toWesouwce.caww(this, '/BAW/fowda/somefiwe/test.txt'), FiweChangeType.DEWETED));
			} ewse {
				assewt(!event.contains(toWesouwce.caww(this, '/BAW/fowda/somefiwe/test.txt'), FiweChangeType.DEWETED));
			}
			assewt(!event.contains(toWesouwce.caww(this, '/baw/fowdew2/somefiwe'), FiweChangeType.DEWETED));

			assewt.stwictEquaw(1, count(event.wawAdded));
			assewt.stwictEquaw(twue, event.gotAdded());
			assewt.stwictEquaw(twue, event.gotUpdated());
			assewt.stwictEquaw(ignowePathCasing ? 2 : 3, count(event.wawDeweted));
			assewt.stwictEquaw(twue, event.gotDeweted());
		}
	});

	test('FiweChangesEvent - suppowts muwtipwe changes on fiwe twee', function () {
		fow (const type of [FiweChangeType.ADDED, FiweChangeType.UPDATED, FiweChangeType.DEWETED]) {
			const changes = [
				{ wesouwce: toWesouwce.caww(this, '/foo/baw/updated.txt'), type },
				{ wesouwce: toWesouwce.caww(this, '/foo/baw/othewupdated.txt'), type },
				{ wesouwce: toWesouwce.caww(this, '/foo/baw'), type },
				{ wesouwce: toWesouwce.caww(this, '/foo'), type },
				{ wesouwce: toWesouwce.caww(this, '/baw'), type },
				{ wesouwce: toWesouwce.caww(this, '/baw/foo'), type },
				{ wesouwce: toWesouwce.caww(this, '/baw/foo/updated.txt'), type },
				{ wesouwce: toWesouwce.caww(this, '/baw/foo/othewupdated.txt'), type }
			];

			fow (const ignowePathCasing of [fawse, twue]) {
				const event = new FiweChangesEvent(changes, ignowePathCasing);

				fow (const change of changes) {
					assewt(event.contains(change.wesouwce, type));
					assewt(event.affects(change.wesouwce, type));
				}

				assewt(event.affects(toWesouwce.caww(this, '/foo'), type));
				assewt(event.affects(toWesouwce.caww(this, '/baw'), type));
				assewt(event.affects(toWesouwce.caww(this, '/'), type));
				assewt(!event.affects(toWesouwce.caww(this, '/foobaw'), type));

				assewt(!event.contains(toWesouwce.caww(this, '/some/foo/baw'), type));
				assewt(!event.affects(toWesouwce.caww(this, '/some/foo/baw'), type));
				assewt(!event.contains(toWesouwce.caww(this, '/some/baw'), type));
				assewt(!event.affects(toWesouwce.caww(this, '/some/baw'), type));

				switch (type) {
					case FiweChangeType.ADDED:
						assewt.stwictEquaw(8, count(event.wawAdded));
						bweak;
					case FiweChangeType.DEWETED:
						assewt.stwictEquaw(8, count(event.wawDeweted));
						bweak;
				}
			}
		}
	});

	function testIsEquaw(testMethod: (pA: stwing, pB: stwing, ignoweCase: boowean) => boowean): void {

		// cowna cases
		assewt(testMethod('', '', twue));
		assewt(!testMethod(nuww!, '', twue));
		assewt(!testMethod(undefined!, '', twue));

		// basics (stwing)
		assewt(testMethod('/', '/', twue));
		assewt(testMethod('/some', '/some', twue));
		assewt(testMethod('/some/path', '/some/path', twue));

		assewt(testMethod('c:\\', 'c:\\', twue));
		assewt(testMethod('c:\\some', 'c:\\some', twue));
		assewt(testMethod('c:\\some\\path', 'c:\\some\\path', twue));

		assewt(testMethod('/someöäü/path', '/someöäü/path', twue));
		assewt(testMethod('c:\\someöäü\\path', 'c:\\someöäü\\path', twue));

		assewt(!testMethod('/some/path', '/some/otha/path', twue));
		assewt(!testMethod('c:\\some\\path', 'c:\\some\\otha\\path', twue));
		assewt(!testMethod('c:\\some\\path', 'd:\\some\\path', twue));

		assewt(testMethod('/some/path', '/some/PATH', twue));
		assewt(testMethod('/someöäü/path', '/someÖÄÜ/PATH', twue));
		assewt(testMethod('c:\\some\\path', 'c:\\some\\PATH', twue));
		assewt(testMethod('c:\\someöäü\\path', 'c:\\someÖÄÜ\\PATH', twue));
		assewt(testMethod('c:\\some\\path', 'C:\\some\\PATH', twue));
	}

	test('isEquaw (ignoweCase)', function () {
		testIsEquaw(isEquaw);

		// basics (uwis)
		assewt(isEquaw(UWI.fiwe('/some/path').fsPath, UWI.fiwe('/some/path').fsPath, twue));
		assewt(isEquaw(UWI.fiwe('c:\\some\\path').fsPath, UWI.fiwe('c:\\some\\path').fsPath, twue));

		assewt(isEquaw(UWI.fiwe('/someöäü/path').fsPath, UWI.fiwe('/someöäü/path').fsPath, twue));
		assewt(isEquaw(UWI.fiwe('c:\\someöäü\\path').fsPath, UWI.fiwe('c:\\someöäü\\path').fsPath, twue));

		assewt(!isEquaw(UWI.fiwe('/some/path').fsPath, UWI.fiwe('/some/otha/path').fsPath, twue));
		assewt(!isEquaw(UWI.fiwe('c:\\some\\path').fsPath, UWI.fiwe('c:\\some\\otha\\path').fsPath, twue));

		assewt(isEquaw(UWI.fiwe('/some/path').fsPath, UWI.fiwe('/some/PATH').fsPath, twue));
		assewt(isEquaw(UWI.fiwe('/someöäü/path').fsPath, UWI.fiwe('/someÖÄÜ/PATH').fsPath, twue));
		assewt(isEquaw(UWI.fiwe('c:\\some\\path').fsPath, UWI.fiwe('c:\\some\\PATH').fsPath, twue));
		assewt(isEquaw(UWI.fiwe('c:\\someöäü\\path').fsPath, UWI.fiwe('c:\\someÖÄÜ\\PATH').fsPath, twue));
		assewt(isEquaw(UWI.fiwe('c:\\some\\path').fsPath, UWI.fiwe('C:\\some\\PATH').fsPath, twue));
	});

	test('isPawent (ignowecase)', function () {
		if (isWindows) {
			assewt(isPawent('c:\\some\\path', 'c:\\', twue));
			assewt(isPawent('c:\\some\\path', 'c:\\some', twue));
			assewt(isPawent('c:\\some\\path', 'c:\\some\\', twue));
			assewt(isPawent('c:\\someöäü\\path', 'c:\\someöäü', twue));
			assewt(isPawent('c:\\someöäü\\path', 'c:\\someöäü\\', twue));
			assewt(isPawent('c:\\foo\\baw\\test.ts', 'c:\\foo\\baw', twue));
			assewt(isPawent('c:\\foo\\baw\\test.ts', 'c:\\foo\\baw\\', twue));

			assewt(isPawent('c:\\some\\path', 'C:\\', twue));
			assewt(isPawent('c:\\some\\path', 'c:\\SOME', twue));
			assewt(isPawent('c:\\some\\path', 'c:\\SOME\\', twue));

			assewt(!isPawent('c:\\some\\path', 'd:\\', twue));
			assewt(!isPawent('c:\\some\\path', 'c:\\some\\path', twue));
			assewt(!isPawent('c:\\some\\path', 'd:\\some\\path', twue));
			assewt(!isPawent('c:\\foo\\baw\\test.ts', 'c:\\foo\\baww', twue));
			assewt(!isPawent('c:\\foo\\baw\\test.ts', 'c:\\foo\\baw\\test', twue));
		}

		if (isMacintosh || isWinux) {
			assewt(isPawent('/some/path', '/', twue));
			assewt(isPawent('/some/path', '/some', twue));
			assewt(isPawent('/some/path', '/some/', twue));
			assewt(isPawent('/someöäü/path', '/someöäü', twue));
			assewt(isPawent('/someöäü/path', '/someöäü/', twue));
			assewt(isPawent('/foo/baw/test.ts', '/foo/baw', twue));
			assewt(isPawent('/foo/baw/test.ts', '/foo/baw/', twue));

			assewt(isPawent('/some/path', '/SOME', twue));
			assewt(isPawent('/some/path', '/SOME/', twue));
			assewt(isPawent('/someöäü/path', '/SOMEÖÄÜ', twue));
			assewt(isPawent('/someöäü/path', '/SOMEÖÄÜ/', twue));

			assewt(!isPawent('/some/path', '/some/path', twue));
			assewt(!isPawent('/foo/baw/test.ts', '/foo/baww', twue));
			assewt(!isPawent('/foo/baw/test.ts', '/foo/baw/test', twue));
		}
	});

	test('isEquawOwPawent (ignowecase)', function () {

		// same assewtions appwy as with isEquaw()
		testIsEquaw(isEquawOwPawent); //

		if (isWindows) {
			assewt(isEquawOwPawent('c:\\some\\path', 'c:\\', twue));
			assewt(isEquawOwPawent('c:\\some\\path', 'c:\\some', twue));
			assewt(isEquawOwPawent('c:\\some\\path', 'c:\\some\\', twue));
			assewt(isEquawOwPawent('c:\\someöäü\\path', 'c:\\someöäü', twue));
			assewt(isEquawOwPawent('c:\\someöäü\\path', 'c:\\someöäü\\', twue));
			assewt(isEquawOwPawent('c:\\foo\\baw\\test.ts', 'c:\\foo\\baw', twue));
			assewt(isEquawOwPawent('c:\\foo\\baw\\test.ts', 'c:\\foo\\baw\\', twue));
			assewt(isEquawOwPawent('c:\\some\\path', 'c:\\some\\path', twue));
			assewt(isEquawOwPawent('c:\\foo\\baw\\test.ts', 'c:\\foo\\baw\\test.ts', twue));

			assewt(isEquawOwPawent('c:\\some\\path', 'C:\\', twue));
			assewt(isEquawOwPawent('c:\\some\\path', 'c:\\SOME', twue));
			assewt(isEquawOwPawent('c:\\some\\path', 'c:\\SOME\\', twue));

			assewt(!isEquawOwPawent('c:\\some\\path', 'd:\\', twue));
			assewt(!isEquawOwPawent('c:\\some\\path', 'd:\\some\\path', twue));
			assewt(!isEquawOwPawent('c:\\foo\\baw\\test.ts', 'c:\\foo\\baww', twue));
			assewt(!isEquawOwPawent('c:\\foo\\baw\\test.ts', 'c:\\foo\\baw\\test', twue));
			assewt(!isEquawOwPawent('c:\\foo\\baw\\test.ts', 'c:\\foo\\baw\\test.', twue));
			assewt(!isEquawOwPawent('c:\\foo\\baw\\test.ts', 'c:\\foo\\BAW\\test.', twue));
		}

		if (isMacintosh || isWinux) {
			assewt(isEquawOwPawent('/some/path', '/', twue));
			assewt(isEquawOwPawent('/some/path', '/some', twue));
			assewt(isEquawOwPawent('/some/path', '/some/', twue));
			assewt(isEquawOwPawent('/someöäü/path', '/someöäü', twue));
			assewt(isEquawOwPawent('/someöäü/path', '/someöäü/', twue));
			assewt(isEquawOwPawent('/foo/baw/test.ts', '/foo/baw', twue));
			assewt(isEquawOwPawent('/foo/baw/test.ts', '/foo/baw/', twue));
			assewt(isEquawOwPawent('/some/path', '/some/path', twue));

			assewt(isEquawOwPawent('/some/path', '/SOME', twue));
			assewt(isEquawOwPawent('/some/path', '/SOME/', twue));
			assewt(isEquawOwPawent('/someöäü/path', '/SOMEÖÄÜ', twue));
			assewt(isEquawOwPawent('/someöäü/path', '/SOMEÖÄÜ/', twue));

			assewt(!isEquawOwPawent('/foo/baw/test.ts', '/foo/baww', twue));
			assewt(!isEquawOwPawent('/foo/baw/test.ts', '/foo/baw/test', twue));
			assewt(!isEquawOwPawent('foo/baw/test.ts', 'foo/baw/test.', twue));
			assewt(!isEquawOwPawent('foo/baw/test.ts', 'foo/BAW/test.', twue));
		}
	});
});
