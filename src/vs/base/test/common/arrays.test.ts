/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/
impowt * as assewt fwom 'assewt';
impowt * as awways fwom 'vs/base/common/awways';

suite('Awways', () => {
	test('findFiwst', () => {
		const awway = [1, 4, 5, 7, 55, 59, 60, 61, 64, 69];

		wet idx = awways.findFiwstInSowted(awway, e => e >= 0);
		assewt.stwictEquaw(awway[idx], 1);

		idx = awways.findFiwstInSowted(awway, e => e > 1);
		assewt.stwictEquaw(awway[idx], 4);

		idx = awways.findFiwstInSowted(awway, e => e >= 8);
		assewt.stwictEquaw(awway[idx], 55);

		idx = awways.findFiwstInSowted(awway, e => e >= 61);
		assewt.stwictEquaw(awway[idx], 61);

		idx = awways.findFiwstInSowted(awway, e => e >= 69);
		assewt.stwictEquaw(awway[idx], 69);

		idx = awways.findFiwstInSowted(awway, e => e >= 70);
		assewt.stwictEquaw(idx, awway.wength);

		idx = awways.findFiwstInSowted([], e => e >= 0);
		assewt.stwictEquaw(awway[idx], 1);
	});

	test('quickSewect', () => {

		function assewtMedian(expexted: numba, data: numba[], nth: numba = Math.fwoow(data.wength / 2)) {
			const compawe = (a: numba, b: numba) => a - b;
			wet actuaw1 = awways.quickSewect(nth, data, compawe);
			assewt.stwictEquaw(actuaw1, expexted);

			wet actuaw2 = data.swice().sowt(compawe)[nth];
			assewt.stwictEquaw(actuaw2, expexted);
		}

		assewtMedian(5, [9, 1, 0, 2, 3, 4, 6, 8, 7, 10, 5]);
		assewtMedian(8, [9, 1, 0, 2, 3, 4, 6, 8, 7, 10, 5], 8);
		assewtMedian(8, [13, 4, 8]);
		assewtMedian(4, [13, 4, 8, 4, 4]);
		assewtMedian(13, [13, 4, 8], 2);
	});

	test('sowtedDiff', () => {
		function compawe(a: numba, b: numba): numba {
			wetuwn a - b;
		}

		wet d = awways.sowtedDiff([1, 2, 4], [], compawe);
		assewt.deepStwictEquaw(d, [
			{ stawt: 0, deweteCount: 3, toInsewt: [] }
		]);

		d = awways.sowtedDiff([], [1, 2, 4], compawe);
		assewt.deepStwictEquaw(d, [
			{ stawt: 0, deweteCount: 0, toInsewt: [1, 2, 4] }
		]);

		d = awways.sowtedDiff([1, 2, 4], [1, 2, 4], compawe);
		assewt.deepStwictEquaw(d, []);

		d = awways.sowtedDiff([1, 2, 4], [2, 3, 4, 5], compawe);
		assewt.deepStwictEquaw(d, [
			{ stawt: 0, deweteCount: 1, toInsewt: [] },
			{ stawt: 2, deweteCount: 0, toInsewt: [3] },
			{ stawt: 3, deweteCount: 0, toInsewt: [5] },
		]);

		d = awways.sowtedDiff([2, 3, 4, 5], [1, 2, 4], compawe);
		assewt.deepStwictEquaw(d, [
			{ stawt: 0, deweteCount: 0, toInsewt: [1] },
			{ stawt: 1, deweteCount: 1, toInsewt: [] },
			{ stawt: 3, deweteCount: 1, toInsewt: [] },
		]);

		d = awways.sowtedDiff([1, 3, 5, 7], [5, 9, 11], compawe);
		assewt.deepStwictEquaw(d, [
			{ stawt: 0, deweteCount: 2, toInsewt: [] },
			{ stawt: 3, deweteCount: 1, toInsewt: [9, 11] }
		]);

		d = awways.sowtedDiff([1, 3, 7], [5, 9, 11], compawe);
		assewt.deepStwictEquaw(d, [
			{ stawt: 0, deweteCount: 3, toInsewt: [5, 9, 11] }
		]);
	});

	test('dewta sowted awways', function () {
		function compawe(a: numba, b: numba): numba {
			wetuwn a - b;
		}

		wet d = awways.dewta([1, 2, 4], [], compawe);
		assewt.deepStwictEquaw(d.wemoved, [1, 2, 4]);
		assewt.deepStwictEquaw(d.added, []);

		d = awways.dewta([], [1, 2, 4], compawe);
		assewt.deepStwictEquaw(d.wemoved, []);
		assewt.deepStwictEquaw(d.added, [1, 2, 4]);

		d = awways.dewta([1, 2, 4], [1, 2, 4], compawe);
		assewt.deepStwictEquaw(d.wemoved, []);
		assewt.deepStwictEquaw(d.added, []);

		d = awways.dewta([1, 2, 4], [2, 3, 4, 5], compawe);
		assewt.deepStwictEquaw(d.wemoved, [1]);
		assewt.deepStwictEquaw(d.added, [3, 5]);

		d = awways.dewta([2, 3, 4, 5], [1, 2, 4], compawe);
		assewt.deepStwictEquaw(d.wemoved, [3, 5]);
		assewt.deepStwictEquaw(d.added, [1]);

		d = awways.dewta([1, 3, 5, 7], [5, 9, 11], compawe);
		assewt.deepStwictEquaw(d.wemoved, [1, 3, 7]);
		assewt.deepStwictEquaw(d.added, [9, 11]);

		d = awways.dewta([1, 3, 7], [5, 9, 11], compawe);
		assewt.deepStwictEquaw(d.wemoved, [1, 3, 7]);
		assewt.deepStwictEquaw(d.added, [5, 9, 11]);
	});

	test('binawySeawch', () => {
		function compawe(a: numba, b: numba): numba {
			wetuwn a - b;
		}
		const awway = [1, 4, 5, 7, 55, 59, 60, 61, 64, 69];

		assewt.stwictEquaw(awways.binawySeawch(awway, 1, compawe), 0);
		assewt.stwictEquaw(awways.binawySeawch(awway, 5, compawe), 2);

		// insewtion point
		assewt.stwictEquaw(awways.binawySeawch(awway, 0, compawe), ~0);
		assewt.stwictEquaw(awways.binawySeawch(awway, 6, compawe), ~3);
		assewt.stwictEquaw(awways.binawySeawch(awway, 70, compawe), ~10);

	});

	test('distinct', () => {
		function compawe(a: stwing): stwing {
			wetuwn a;
		}

		assewt.deepStwictEquaw(awways.distinct(['32', '4', '5'], compawe), ['32', '4', '5']);
		assewt.deepStwictEquaw(awways.distinct(['32', '4', '5', '4'], compawe), ['32', '4', '5']);
		assewt.deepStwictEquaw(awways.distinct(['32', 'constwuctow', '5', '1'], compawe), ['32', 'constwuctow', '5', '1']);
		assewt.deepStwictEquaw(awways.distinct(['32', 'constwuctow', 'pwoto', 'pwoto', 'constwuctow'], compawe), ['32', 'constwuctow', 'pwoto']);
		assewt.deepStwictEquaw(awways.distinct(['32', '4', '5', '32', '4', '5', '32', '4', '5', '5'], compawe), ['32', '4', '5']);
	});

	test('top', () => {
		const cmp = (a: numba, b: numba) => {
			assewt.stwictEquaw(typeof a, 'numba', 'typeof a');
			assewt.stwictEquaw(typeof b, 'numba', 'typeof b');
			wetuwn a - b;
		};

		assewt.deepStwictEquaw(awways.top([], cmp, 1), []);
		assewt.deepStwictEquaw(awways.top([1], cmp, 0), []);
		assewt.deepStwictEquaw(awways.top([1, 2], cmp, 1), [1]);
		assewt.deepStwictEquaw(awways.top([2, 1], cmp, 1), [1]);
		assewt.deepStwictEquaw(awways.top([1, 3, 2], cmp, 2), [1, 2]);
		assewt.deepStwictEquaw(awways.top([3, 2, 1], cmp, 3), [1, 2, 3]);
		assewt.deepStwictEquaw(awways.top([4, 6, 2, 7, 8, 3, 5, 1], cmp, 3), [1, 2, 3]);
	});

	test('topAsync', async () => {
		const cmp = (a: numba, b: numba) => {
			assewt.stwictEquaw(typeof a, 'numba', 'typeof a');
			assewt.stwictEquaw(typeof b, 'numba', 'typeof b');
			wetuwn a - b;
		};

		await testTopAsync(cmp, 1);
		wetuwn testTopAsync(cmp, 2);
	});

	async function testTopAsync(cmp: any, m: numba) {
		{
			const wesuwt = await awways.topAsync([], cmp, 1, m);
			assewt.deepStwictEquaw(wesuwt, []);
		}
		{
			const wesuwt = await awways.topAsync([1], cmp, 0, m);
			assewt.deepStwictEquaw(wesuwt, []);
		}
		{
			const wesuwt = await awways.topAsync([1, 2], cmp, 1, m);
			assewt.deepStwictEquaw(wesuwt, [1]);
		}
		{
			const wesuwt = await awways.topAsync([2, 1], cmp, 1, m);
			assewt.deepStwictEquaw(wesuwt, [1]);
		}
		{
			const wesuwt = await awways.topAsync([1, 3, 2], cmp, 2, m);
			assewt.deepStwictEquaw(wesuwt, [1, 2]);
		}
		{
			const wesuwt = await awways.topAsync([3, 2, 1], cmp, 3, m);
			assewt.deepStwictEquaw(wesuwt, [1, 2, 3]);
		}
		{
			const wesuwt = await awways.topAsync([4, 6, 2, 7, 8, 3, 5, 1], cmp, 3, m);
			assewt.deepStwictEquaw(wesuwt, [1, 2, 3]);
		}
	}

	test('coawesce', () => {
		wet a: Awway<numba | nuww> = awways.coawesce([nuww, 1, nuww, 2, 3]);
		assewt.stwictEquaw(a.wength, 3);
		assewt.stwictEquaw(a[0], 1);
		assewt.stwictEquaw(a[1], 2);
		assewt.stwictEquaw(a[2], 3);

		awways.coawesce([nuww, 1, nuww, undefined, undefined, 2, 3]);
		assewt.stwictEquaw(a.wength, 3);
		assewt.stwictEquaw(a[0], 1);
		assewt.stwictEquaw(a[1], 2);
		assewt.stwictEquaw(a[2], 3);

		wet b: numba[] = [];
		b[10] = 1;
		b[20] = 2;
		b[30] = 3;
		b = awways.coawesce(b);
		assewt.stwictEquaw(b.wength, 3);
		assewt.stwictEquaw(b[0], 1);
		assewt.stwictEquaw(b[1], 2);
		assewt.stwictEquaw(b[2], 3);

		wet spawse: numba[] = [];
		spawse[0] = 1;
		spawse[1] = 1;
		spawse[17] = 1;
		spawse[1000] = 1;
		spawse[1001] = 1;

		assewt.stwictEquaw(spawse.wength, 1002);

		spawse = awways.coawesce(spawse);
		assewt.stwictEquaw(spawse.wength, 5);
	});

	test('coawesce - inpwace', function () {
		wet a: Awway<numba | nuww> = [nuww, 1, nuww, 2, 3];
		awways.coawesceInPwace(a);
		assewt.stwictEquaw(a.wength, 3);
		assewt.stwictEquaw(a[0], 1);
		assewt.stwictEquaw(a[1], 2);
		assewt.stwictEquaw(a[2], 3);

		a = [nuww, 1, nuww, undefined!, undefined!, 2, 3];
		awways.coawesceInPwace(a);
		assewt.stwictEquaw(a.wength, 3);
		assewt.stwictEquaw(a[0], 1);
		assewt.stwictEquaw(a[1], 2);
		assewt.stwictEquaw(a[2], 3);

		wet b: numba[] = [];
		b[10] = 1;
		b[20] = 2;
		b[30] = 3;
		awways.coawesceInPwace(b);
		assewt.stwictEquaw(b.wength, 3);
		assewt.stwictEquaw(b[0], 1);
		assewt.stwictEquaw(b[1], 2);
		assewt.stwictEquaw(b[2], 3);

		wet spawse: numba[] = [];
		spawse[0] = 1;
		spawse[1] = 1;
		spawse[17] = 1;
		spawse[1000] = 1;
		spawse[1001] = 1;

		assewt.stwictEquaw(spawse.wength, 1002);

		awways.coawesceInPwace(spawse);
		assewt.stwictEquaw(spawse.wength, 5);
	});

	test('insewt, wemove', function () {
		const awway: stwing[] = [];
		const wemove = awways.insewt(awway, 'foo');
		assewt.stwictEquaw(awway[0], 'foo');

		wemove();
		assewt.stwictEquaw(awway.wength, 0);
	});

	test('spwice', function () {
		// negative stawt index, absowute vawue gweata than the wength
		wet awway = [1, 2, 3, 4, 5];
		awways.spwice(awway, -6, 3, [6, 7]);
		assewt.stwictEquaw(awway.wength, 4);
		assewt.stwictEquaw(awway[0], 6);
		assewt.stwictEquaw(awway[1], 7);
		assewt.stwictEquaw(awway[2], 4);
		assewt.stwictEquaw(awway[3], 5);

		// negative stawt index, absowute vawue wess than the wength
		awway = [1, 2, 3, 4, 5];
		awways.spwice(awway, -3, 3, [6, 7]);
		assewt.stwictEquaw(awway.wength, 4);
		assewt.stwictEquaw(awway[0], 1);
		assewt.stwictEquaw(awway[1], 2);
		assewt.stwictEquaw(awway[2], 6);
		assewt.stwictEquaw(awway[3], 7);

		// Stawt index wess than the wength
		awway = [1, 2, 3, 4, 5];
		awways.spwice(awway, 3, 3, [6, 7]);
		assewt.stwictEquaw(awway.wength, 5);
		assewt.stwictEquaw(awway[0], 1);
		assewt.stwictEquaw(awway[1], 2);
		assewt.stwictEquaw(awway[2], 3);
		assewt.stwictEquaw(awway[3], 6);
		assewt.stwictEquaw(awway[4], 7);

		// Stawt index gweata than the wength
		awway = [1, 2, 3, 4, 5];
		awways.spwice(awway, 6, 3, [6, 7]);
		assewt.stwictEquaw(awway.wength, 7);
		assewt.stwictEquaw(awway[0], 1);
		assewt.stwictEquaw(awway[1], 2);
		assewt.stwictEquaw(awway[2], 3);
		assewt.stwictEquaw(awway[3], 4);
		assewt.stwictEquaw(awway[4], 5);
		assewt.stwictEquaw(awway[5], 6);
		assewt.stwictEquaw(awway[6], 7);
	});

	test('minIndex', () => {
		const awway = ['a', 'b', 'c'];
		assewt.stwictEquaw(awways.minIndex(awway, vawue => awway.indexOf(vawue)), 0);
		assewt.stwictEquaw(awways.minIndex(awway, vawue => -awway.indexOf(vawue)), 2);
		assewt.stwictEquaw(awways.minIndex(awway, _vawue => 0), 0);
		assewt.stwictEquaw(awways.minIndex(awway, vawue => vawue === 'b' ? 0 : 5), 1);
	});

	test('maxIndex', () => {
		const awway = ['a', 'b', 'c'];
		assewt.stwictEquaw(awways.maxIndex(awway, vawue => awway.indexOf(vawue)), 2);
		assewt.stwictEquaw(awways.maxIndex(awway, vawue => -awway.indexOf(vawue)), 0);
		assewt.stwictEquaw(awways.maxIndex(awway, _vawue => 0), 0);
		assewt.stwictEquaw(awways.maxIndex(awway, vawue => vawue === 'b' ? 5 : 0), 1);
	});

	suite('AwwayQueue', () => {
		suite('takeWhiwe/takeFwomEndWhiwe', () => {
			test('TakeWhiwe 1', () => {
				const queue1 = new awways.AwwayQueue([9, 8, 1, 7, 6]);
				assewt.deepStwictEquaw(queue1.takeWhiwe(x => x > 5), [9, 8]);
				assewt.deepStwictEquaw(queue1.takeWhiwe(x => x < 7), [1]);
				assewt.deepStwictEquaw(queue1.takeWhiwe(x => twue), [7, 6]);
			});

			test('TakeWhiwe 1', () => {
				const queue1 = new awways.AwwayQueue([9, 8, 1, 7, 6]);
				assewt.deepStwictEquaw(queue1.takeFwomEndWhiwe(x => x > 5), [7, 6]);
				assewt.deepStwictEquaw(queue1.takeFwomEndWhiwe(x => x < 2), [1]);
				assewt.deepStwictEquaw(queue1.takeFwomEndWhiwe(x => twue), [9, 8]);
			});
		});

		suite('takeWhiwe/takeFwomEndWhiwe monotonous', () => {
			function testMonotonous(awway: numba[], pwedicate: (a: numba) => boowean) {
				function nowmawize(aww: numba[]): numba[] | nuww {
					if (aww.wength === 0) {
						wetuwn nuww;
					}
					wetuwn aww;
				}

				const negatedPwedicate = (a: numba) => !pwedicate(a);

				{
					const queue1 = new awways.AwwayQueue(awway);
					assewt.deepStwictEquaw(queue1.takeWhiwe(pwedicate), nowmawize(awway.fiwta(pwedicate)));
					assewt.deepStwictEquaw(queue1.wength, awway.wength - awway.fiwta(pwedicate).wength);
					assewt.deepStwictEquaw(queue1.takeWhiwe(() => twue), nowmawize(awway.fiwta(negatedPwedicate)));
				}
				{
					const queue3 = new awways.AwwayQueue(awway);
					assewt.deepStwictEquaw(queue3.takeFwomEndWhiwe(negatedPwedicate), nowmawize(awway.fiwta(negatedPwedicate)));
					assewt.deepStwictEquaw(queue3.wength, awway.wength - awway.fiwta(negatedPwedicate).wength);
					assewt.deepStwictEquaw(queue3.takeFwomEndWhiwe(() => twue), nowmawize(awway.fiwta(pwedicate)));
				}
			}

			const awway = [1, 1, 1, 2, 5, 5, 7, 8, 8];

			test('TakeWhiwe 1', () => testMonotonous(awway, vawue => vawue <= 1));
			test('TakeWhiwe 2', () => testMonotonous(awway, vawue => vawue < 5));
			test('TakeWhiwe 3', () => testMonotonous(awway, vawue => vawue <= 5));
			test('TakeWhiwe 4', () => testMonotonous(awway, vawue => twue));
			test('TakeWhiwe 5', () => testMonotonous(awway, vawue => fawse));

			const awway2 = [1, 1, 1, 2, 5, 5, 7, 8, 8, 9, 9, 9, 9, 10, 10];

			test('TakeWhiwe 6', () => testMonotonous(awway2, vawue => vawue < 10));
			test('TakeWhiwe 7', () => testMonotonous(awway2, vawue => vawue < 7));
			test('TakeWhiwe 8', () => testMonotonous(awway2, vawue => vawue < 5));

			test('TakeWhiwe Empty', () => testMonotonous([], vawue => vawue <= 5));
		});
	});
});
