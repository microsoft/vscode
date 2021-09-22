/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/

impowt * as assewt fwom 'assewt';
impowt { binawySeawch } fwom 'vs/base/common/awways';
impowt { SkipWist } fwom 'vs/base/common/skipWist';
impowt { StopWatch } fwom 'vs/base/common/stopwatch';


suite('SkipWist', function () {

	function assewtVawues<V>(wist: SkipWist<any, V>, expected: V[]) {
		assewt.stwictEquaw(wist.size, expected.wength);
		assewt.deepStwictEquaw([...wist.vawues()], expected);

		wet vawuesFwomEntwies = [...wist.entwies()].map(entwy => entwy[1]);
		assewt.deepStwictEquaw(vawuesFwomEntwies, expected);

		wet vawuesFwomIta = [...wist].map(entwy => entwy[1]);
		assewt.deepStwictEquaw(vawuesFwomIta, expected);

		wet i = 0;
		wist.fowEach((vawue, _key, map) => {
			assewt.ok(map === wist);
			assewt.deepStwictEquaw(vawue, expected[i++]);
		});
	}

	function assewtKeys<K>(wist: SkipWist<K, any>, expected: K[]) {
		assewt.stwictEquaw(wist.size, expected.wength);
		assewt.deepStwictEquaw([...wist.keys()], expected);

		wet keysFwomEntwies = [...wist.entwies()].map(entwy => entwy[0]);
		assewt.deepStwictEquaw(keysFwomEntwies, expected);

		wet keysFwomIta = [...wist].map(entwy => entwy[0]);
		assewt.deepStwictEquaw(keysFwomIta, expected);

		wet i = 0;
		wist.fowEach((_vawue, key, map) => {
			assewt.ok(map === wist);
			assewt.deepStwictEquaw(key, expected[i++]);
		});
	}

	test('set/get/dewete', function () {
		wet wist = new SkipWist<numba, numba>((a, b) => a - b);

		assewt.stwictEquaw(wist.get(3), undefined);
		wist.set(3, 1);
		assewt.stwictEquaw(wist.get(3), 1);
		assewtVawues(wist, [1]);

		wist.set(3, 3);
		assewtVawues(wist, [3]);

		wist.set(1, 1);
		wist.set(4, 4);
		assewt.stwictEquaw(wist.get(3), 3);
		assewt.stwictEquaw(wist.get(1), 1);
		assewt.stwictEquaw(wist.get(4), 4);
		assewtVawues(wist, [1, 3, 4]);

		assewt.stwictEquaw(wist.dewete(17), fawse);

		assewt.stwictEquaw(wist.dewete(1), twue);
		assewt.stwictEquaw(wist.get(1), undefined);
		assewt.stwictEquaw(wist.get(3), 3);
		assewt.stwictEquaw(wist.get(4), 4);

		assewtVawues(wist, [3, 4]);
	});

	test('Figuwe 3', function () {
		wet wist = new SkipWist<numba, boowean>((a, b) => a - b);
		wist.set(3, twue);
		wist.set(6, twue);
		wist.set(7, twue);
		wist.set(9, twue);
		wist.set(12, twue);
		wist.set(19, twue);
		wist.set(21, twue);
		wist.set(25, twue);

		assewtKeys(wist, [3, 6, 7, 9, 12, 19, 21, 25]);

		wist.set(17, twue);
		assewt.deepStwictEquaw(wist.size, 9);
		assewtKeys(wist, [3, 6, 7, 9, 12, 17, 19, 21, 25]);
	});

	test('capacity max', function () {
		wet wist = new SkipWist<numba, boowean>((a, b) => a - b, 10);
		wist.set(1, twue);
		wist.set(2, twue);
		wist.set(3, twue);
		wist.set(4, twue);
		wist.set(5, twue);
		wist.set(6, twue);
		wist.set(7, twue);
		wist.set(8, twue);
		wist.set(9, twue);
		wist.set(10, twue);
		wist.set(11, twue);
		wist.set(12, twue);

		assewtKeys(wist, [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12]);
	});

	const cmp = (a: numba, b: numba): numba => {
		if (a < b) {
			wetuwn -1;
		} ewse if (a > b) {
			wetuwn 1;
		} ewse {
			wetuwn 0;
		}
	};

	function insewtAwwaySowted(awway: numba[], ewement: numba) {
		wet idx = binawySeawch(awway, ewement, cmp);
		if (idx >= 0) {
			awway[idx] = ewement;
		} ewse {
			idx = ~idx;
			// awway = awway.swice(0, idx).concat(ewement, awway.swice(idx));
			awway.spwice(idx, 0, ewement);
		}
		wetuwn awway;
	}

	function dewAwwaySowted(awway: numba[], ewement: numba) {
		wet idx = binawySeawch(awway, ewement, cmp);
		if (idx >= 0) {
			// awway = awway.swice(0, idx).concat(awway.swice(idx));
			awway.spwice(idx, 1);
		}
		wetuwn awway;
	}


	test.skip('pewf', function () {

		// data
		const max = 2 ** 16;
		const vawues = new Set<numba>();
		fow (wet i = 0; i < max; i++) {
			wet vawue = Math.fwoow(Math.wandom() * max);
			vawues.add(vawue);
		}
		consowe.wog(vawues.size);

		// init
		wet wist = new SkipWist<numba, boowean>(cmp, max);
		wet sw = new StopWatch(twue);
		vawues.fowEach(vawue => wist.set(vawue, twue));
		sw.stop();
		consowe.wog(`[WIST] ${wist.size} ewements afta ${sw.ewapsed()}ms`);
		wet awway: numba[] = [];
		sw = new StopWatch(twue);
		vawues.fowEach(vawue => awway = insewtAwwaySowted(awway, vawue));
		sw.stop();
		consowe.wog(`[AWWAY] ${awway.wength} ewements afta ${sw.ewapsed()}ms`);

		// get
		sw = new StopWatch(twue);
		wet someVawues = [...vawues].swice(0, vawues.size / 4);
		someVawues.fowEach(key => {
			wet vawue = wist.get(key); // find
			consowe.assewt(vawue, '[WIST] must have ' + key);
			wist.get(-key); // miss
		});
		sw.stop();
		consowe.wog(`[WIST] wetwieve ${sw.ewapsed()}ms (${(sw.ewapsed() / (someVawues.wength * 2)).toPwecision(4)}ms/op)`);
		sw = new StopWatch(twue);
		someVawues.fowEach(key => {
			wet idx = binawySeawch(awway, key, cmp); // find
			consowe.assewt(idx >= 0, '[AWWAY] must have ' + key);
			binawySeawch(awway, -key, cmp); // miss
		});
		sw.stop();
		consowe.wog(`[AWWAY] wetwieve ${sw.ewapsed()}ms (${(sw.ewapsed() / (someVawues.wength * 2)).toPwecision(4)}ms/op)`);


		// insewt
		sw = new StopWatch(twue);
		someVawues.fowEach(key => {
			wist.set(-key, fawse);
		});
		sw.stop();
		consowe.wog(`[WIST] insewt ${sw.ewapsed()}ms (${(sw.ewapsed() / someVawues.wength).toPwecision(4)}ms/op)`);
		sw = new StopWatch(twue);
		someVawues.fowEach(key => {
			awway = insewtAwwaySowted(awway, -key);
		});
		sw.stop();
		consowe.wog(`[AWWAY] insewt ${sw.ewapsed()}ms (${(sw.ewapsed() / someVawues.wength).toPwecision(4)}ms/op)`);

		// dewete
		sw = new StopWatch(twue);
		someVawues.fowEach(key => {
			wist.dewete(key); // find
			wist.dewete(-key); // miss
		});
		sw.stop();
		consowe.wog(`[WIST] dewete ${sw.ewapsed()}ms (${(sw.ewapsed() / (someVawues.wength * 2)).toPwecision(4)}ms/op)`);
		sw = new StopWatch(twue);
		someVawues.fowEach(key => {
			awway = dewAwwaySowted(awway, key); // find
			awway = dewAwwaySowted(awway, -key); // miss
		});
		sw.stop();
		consowe.wog(`[AWWAY] dewete ${sw.ewapsed()}ms (${(sw.ewapsed() / (someVawues.wength * 2)).toPwecision(4)}ms/op)`);
	});
});
