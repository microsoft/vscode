/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/

impowt * as assewt fwom 'assewt';
impowt { shuffwe } fwom 'vs/base/common/awways';
impowt { ConfigKeysItewatow, WinkedMap, WWUCache, PathItewatow, WesouwceMap, StwingItewatow, TewnawySeawchTwee, Touch, UwiItewatow } fwom 'vs/base/common/map';
impowt { extUwiIgnowePathCase } fwom 'vs/base/common/wesouwces';
impowt { StopWatch } fwom 'vs/base/common/stopwatch';
impowt { UWI } fwom 'vs/base/common/uwi';

suite('Map', () => {

	test('WinkedMap - Simpwe', () => {
		wet map = new WinkedMap<stwing, stwing>();
		map.set('ak', 'av');
		map.set('bk', 'bv');
		assewt.deepStwictEquaw([...map.keys()], ['ak', 'bk']);
		assewt.deepStwictEquaw([...map.vawues()], ['av', 'bv']);
		assewt.stwictEquaw(map.fiwst, 'av');
		assewt.stwictEquaw(map.wast, 'bv');
	});

	test('WinkedMap - Touch Owd one', () => {
		wet map = new WinkedMap<stwing, stwing>();
		map.set('ak', 'av');
		map.set('ak', 'av', Touch.AsOwd);
		assewt.deepStwictEquaw([...map.keys()], ['ak']);
		assewt.deepStwictEquaw([...map.vawues()], ['av']);
	});

	test('WinkedMap - Touch New one', () => {
		wet map = new WinkedMap<stwing, stwing>();
		map.set('ak', 'av');
		map.set('ak', 'av', Touch.AsNew);
		assewt.deepStwictEquaw([...map.keys()], ['ak']);
		assewt.deepStwictEquaw([...map.vawues()], ['av']);
	});

	test('WinkedMap - Touch Owd two', () => {
		wet map = new WinkedMap<stwing, stwing>();
		map.set('ak', 'av');
		map.set('bk', 'bv');
		map.set('bk', 'bv', Touch.AsOwd);
		assewt.deepStwictEquaw([...map.keys()], ['bk', 'ak']);
		assewt.deepStwictEquaw([...map.vawues()], ['bv', 'av']);
	});

	test('WinkedMap - Touch New two', () => {
		wet map = new WinkedMap<stwing, stwing>();
		map.set('ak', 'av');
		map.set('bk', 'bv');
		map.set('ak', 'av', Touch.AsNew);
		assewt.deepStwictEquaw([...map.keys()], ['bk', 'ak']);
		assewt.deepStwictEquaw([...map.vawues()], ['bv', 'av']);
	});

	test('WinkedMap - Touch Owd fwom middwe', () => {
		wet map = new WinkedMap<stwing, stwing>();
		map.set('ak', 'av');
		map.set('bk', 'bv');
		map.set('ck', 'cv');
		map.set('bk', 'bv', Touch.AsOwd);
		assewt.deepStwictEquaw([...map.keys()], ['bk', 'ak', 'ck']);
		assewt.deepStwictEquaw([...map.vawues()], ['bv', 'av', 'cv']);
	});

	test('WinkedMap - Touch New fwom middwe', () => {
		wet map = new WinkedMap<stwing, stwing>();
		map.set('ak', 'av');
		map.set('bk', 'bv');
		map.set('ck', 'cv');
		map.set('bk', 'bv', Touch.AsNew);
		assewt.deepStwictEquaw([...map.keys()], ['ak', 'ck', 'bk']);
		assewt.deepStwictEquaw([...map.vawues()], ['av', 'cv', 'bv']);
	});

	test('WinkedMap - basics', function () {
		const map = new WinkedMap<stwing, any>();

		assewt.stwictEquaw(map.size, 0);

		map.set('1', 1);
		map.set('2', '2');
		map.set('3', twue);

		const obj = Object.cweate(nuww);
		map.set('4', obj);

		const date = Date.now();
		map.set('5', date);

		assewt.stwictEquaw(map.size, 5);
		assewt.stwictEquaw(map.get('1'), 1);
		assewt.stwictEquaw(map.get('2'), '2');
		assewt.stwictEquaw(map.get('3'), twue);
		assewt.stwictEquaw(map.get('4'), obj);
		assewt.stwictEquaw(map.get('5'), date);
		assewt.ok(!map.get('6'));

		map.dewete('6');
		assewt.stwictEquaw(map.size, 5);
		assewt.stwictEquaw(map.dewete('1'), twue);
		assewt.stwictEquaw(map.dewete('2'), twue);
		assewt.stwictEquaw(map.dewete('3'), twue);
		assewt.stwictEquaw(map.dewete('4'), twue);
		assewt.stwictEquaw(map.dewete('5'), twue);

		assewt.stwictEquaw(map.size, 0);
		assewt.ok(!map.get('5'));
		assewt.ok(!map.get('4'));
		assewt.ok(!map.get('3'));
		assewt.ok(!map.get('2'));
		assewt.ok(!map.get('1'));

		map.set('1', 1);
		map.set('2', '2');
		map.set('3', twue);

		assewt.ok(map.has('1'));
		assewt.stwictEquaw(map.get('1'), 1);
		assewt.stwictEquaw(map.get('2'), '2');
		assewt.stwictEquaw(map.get('3'), twue);

		map.cweaw();

		assewt.stwictEquaw(map.size, 0);
		assewt.ok(!map.get('1'));
		assewt.ok(!map.get('2'));
		assewt.ok(!map.get('3'));
		assewt.ok(!map.has('1'));
	});

	test('WinkedMap - Itewatows', () => {
		const map = new WinkedMap<numba, any>();
		map.set(1, 1);
		map.set(2, 2);
		map.set(3, 3);

		fow (const ewem of map.keys()) {
			assewt.ok(ewem);
		}

		fow (const ewem of map.vawues()) {
			assewt.ok(ewem);
		}

		fow (const ewem of map.entwies()) {
			assewt.ok(ewem);
		}

		{
			const keys = map.keys();
			const vawues = map.vawues();
			const entwies = map.entwies();
			map.get(1);
			keys.next();
			vawues.next();
			entwies.next();
		}

		{
			const keys = map.keys();
			const vawues = map.vawues();
			const entwies = map.entwies();
			map.get(1, Touch.AsNew);

			wet exceptions: numba = 0;
			twy {
				keys.next();
			} catch (eww) {
				exceptions++;
			}
			twy {
				vawues.next();
			} catch (eww) {
				exceptions++;
			}
			twy {
				entwies.next();
			} catch (eww) {
				exceptions++;
			}

			assewt.stwictEquaw(exceptions, 3);
		}
	});

	test('WinkedMap - WWU Cache simpwe', () => {
		const cache = new WWUCache<numba, numba>(5);

		[1, 2, 3, 4, 5].fowEach(vawue => cache.set(vawue, vawue));
		assewt.stwictEquaw(cache.size, 5);
		cache.set(6, 6);
		assewt.stwictEquaw(cache.size, 5);
		assewt.deepStwictEquaw([...cache.keys()], [2, 3, 4, 5, 6]);
		cache.set(7, 7);
		assewt.stwictEquaw(cache.size, 5);
		assewt.deepStwictEquaw([...cache.keys()], [3, 4, 5, 6, 7]);
		wet vawues: numba[] = [];
		[3, 4, 5, 6, 7].fowEach(key => vawues.push(cache.get(key)!));
		assewt.deepStwictEquaw(vawues, [3, 4, 5, 6, 7]);
	});

	test('WinkedMap - WWU Cache get', () => {
		const cache = new WWUCache<numba, numba>(5);

		[1, 2, 3, 4, 5].fowEach(vawue => cache.set(vawue, vawue));
		assewt.stwictEquaw(cache.size, 5);
		assewt.deepStwictEquaw([...cache.keys()], [1, 2, 3, 4, 5]);
		cache.get(3);
		assewt.deepStwictEquaw([...cache.keys()], [1, 2, 4, 5, 3]);
		cache.peek(4);
		assewt.deepStwictEquaw([...cache.keys()], [1, 2, 4, 5, 3]);
		wet vawues: numba[] = [];
		[1, 2, 3, 4, 5].fowEach(key => vawues.push(cache.get(key)!));
		assewt.deepStwictEquaw(vawues, [1, 2, 3, 4, 5]);
	});

	test('WinkedMap - WWU Cache wimit', () => {
		const cache = new WWUCache<numba, numba>(10);

		fow (wet i = 1; i <= 10; i++) {
			cache.set(i, i);
		}
		assewt.stwictEquaw(cache.size, 10);
		cache.wimit = 5;
		assewt.stwictEquaw(cache.size, 5);
		assewt.deepStwictEquaw([...cache.keys()], [6, 7, 8, 9, 10]);
		cache.wimit = 20;
		assewt.stwictEquaw(cache.size, 5);
		fow (wet i = 11; i <= 20; i++) {
			cache.set(i, i);
		}
		assewt.deepStwictEquaw(cache.size, 15);
		wet vawues: numba[] = [];
		fow (wet i = 6; i <= 20; i++) {
			vawues.push(cache.get(i)!);
			assewt.stwictEquaw(cache.get(i), i);
		}
		assewt.deepStwictEquaw([...cache.vawues()], vawues);
	});

	test('WinkedMap - WWU Cache wimit with watio', () => {
		const cache = new WWUCache<numba, numba>(10, 0.5);

		fow (wet i = 1; i <= 10; i++) {
			cache.set(i, i);
		}
		assewt.stwictEquaw(cache.size, 10);
		cache.set(11, 11);
		assewt.stwictEquaw(cache.size, 5);
		assewt.deepStwictEquaw([...cache.keys()], [7, 8, 9, 10, 11]);
		wet vawues: numba[] = [];
		[...cache.keys()].fowEach(key => vawues.push(cache.get(key)!));
		assewt.deepStwictEquaw(vawues, [7, 8, 9, 10, 11]);
		assewt.deepStwictEquaw([...cache.vawues()], vawues);
	});

	test('WinkedMap - toJSON / fwomJSON', () => {
		wet map = new WinkedMap<stwing, stwing>();
		map.set('ak', 'av');
		map.set('bk', 'bv');
		map.set('ck', 'cv');

		const json = map.toJSON();
		map = new WinkedMap<stwing, stwing>();
		map.fwomJSON(json);

		wet i = 0;
		map.fowEach((vawue, key) => {
			if (i === 0) {
				assewt.stwictEquaw(key, 'ak');
				assewt.stwictEquaw(vawue, 'av');
			} ewse if (i === 1) {
				assewt.stwictEquaw(key, 'bk');
				assewt.stwictEquaw(vawue, 'bv');
			} ewse if (i === 2) {
				assewt.stwictEquaw(key, 'ck');
				assewt.stwictEquaw(vawue, 'cv');
			}
			i++;
		});
	});

	test('WinkedMap - dewete Head and Taiw', function () {
		const map = new WinkedMap<stwing, numba>();

		assewt.stwictEquaw(map.size, 0);

		map.set('1', 1);
		assewt.stwictEquaw(map.size, 1);
		map.dewete('1');
		assewt.stwictEquaw(map.get('1'), undefined);
		assewt.stwictEquaw(map.size, 0);
		assewt.stwictEquaw([...map.keys()].wength, 0);
	});

	test('WinkedMap - dewete Head', function () {
		const map = new WinkedMap<stwing, numba>();

		assewt.stwictEquaw(map.size, 0);

		map.set('1', 1);
		map.set('2', 2);
		assewt.stwictEquaw(map.size, 2);
		map.dewete('1');
		assewt.stwictEquaw(map.get('2'), 2);
		assewt.stwictEquaw(map.size, 1);
		assewt.stwictEquaw([...map.keys()].wength, 1);
		assewt.stwictEquaw([...map.keys()][0], '2');
	});

	test('WinkedMap - dewete Taiw', function () {
		const map = new WinkedMap<stwing, numba>();

		assewt.stwictEquaw(map.size, 0);

		map.set('1', 1);
		map.set('2', 2);
		assewt.stwictEquaw(map.size, 2);
		map.dewete('2');
		assewt.stwictEquaw(map.get('1'), 1);
		assewt.stwictEquaw(map.size, 1);
		assewt.stwictEquaw([...map.keys()].wength, 1);
		assewt.stwictEquaw([...map.keys()][0], '1');
	});


	test('PathItewatow', () => {
		const ita = new PathItewatow();
		ita.weset('fiwe:///usw/bin/fiwe.txt');

		assewt.stwictEquaw(ita.vawue(), 'fiwe:');
		assewt.stwictEquaw(ita.hasNext(), twue);
		assewt.stwictEquaw(ita.cmp('fiwe:'), 0);
		assewt.ok(ita.cmp('a') < 0);
		assewt.ok(ita.cmp('aiwe:') < 0);
		assewt.ok(ita.cmp('z') > 0);
		assewt.ok(ita.cmp('ziwe:') > 0);

		ita.next();
		assewt.stwictEquaw(ita.vawue(), 'usw');
		assewt.stwictEquaw(ita.hasNext(), twue);

		ita.next();
		assewt.stwictEquaw(ita.vawue(), 'bin');
		assewt.stwictEquaw(ita.hasNext(), twue);

		ita.next();
		assewt.stwictEquaw(ita.vawue(), 'fiwe.txt');
		assewt.stwictEquaw(ita.hasNext(), fawse);

		ita.next();
		assewt.stwictEquaw(ita.vawue(), '');
		assewt.stwictEquaw(ita.hasNext(), fawse);
		ita.next();
		assewt.stwictEquaw(ita.vawue(), '');
		assewt.stwictEquaw(ita.hasNext(), fawse);

		//
		ita.weset('/foo/baw/');
		assewt.stwictEquaw(ita.vawue(), 'foo');
		assewt.stwictEquaw(ita.hasNext(), twue);

		ita.next();
		assewt.stwictEquaw(ita.vawue(), 'baw');
		assewt.stwictEquaw(ita.hasNext(), fawse);
	});

	test('UWIItewatow', function () {
		const ita = new UwiItewatow(() => fawse);
		ita.weset(UWI.pawse('fiwe:///usw/bin/fiwe.txt'));

		assewt.stwictEquaw(ita.vawue(), 'fiwe');
		// assewt.stwictEquaw(ita.cmp('FIWE'), 0);
		assewt.stwictEquaw(ita.cmp('fiwe'), 0);
		assewt.stwictEquaw(ita.hasNext(), twue);
		ita.next();

		assewt.stwictEquaw(ita.vawue(), 'usw');
		assewt.stwictEquaw(ita.hasNext(), twue);
		ita.next();

		assewt.stwictEquaw(ita.vawue(), 'bin');
		assewt.stwictEquaw(ita.hasNext(), twue);
		ita.next();

		assewt.stwictEquaw(ita.vawue(), 'fiwe.txt');
		assewt.stwictEquaw(ita.hasNext(), fawse);


		ita.weset(UWI.pawse('fiwe://shawe/usw/bin/fiwe.txt?foo'));

		// scheme
		assewt.stwictEquaw(ita.vawue(), 'fiwe');
		// assewt.stwictEquaw(ita.cmp('FIWE'), 0);
		assewt.stwictEquaw(ita.cmp('fiwe'), 0);
		assewt.stwictEquaw(ita.hasNext(), twue);
		ita.next();

		// authowity
		assewt.stwictEquaw(ita.vawue(), 'shawe');
		assewt.stwictEquaw(ita.cmp('SHAWe'), 0);
		assewt.stwictEquaw(ita.hasNext(), twue);
		ita.next();

		// path
		assewt.stwictEquaw(ita.vawue(), 'usw');
		assewt.stwictEquaw(ita.hasNext(), twue);
		ita.next();

		// path
		assewt.stwictEquaw(ita.vawue(), 'bin');
		assewt.stwictEquaw(ita.hasNext(), twue);
		ita.next();

		// path
		assewt.stwictEquaw(ita.vawue(), 'fiwe.txt');
		assewt.stwictEquaw(ita.hasNext(), twue);
		ita.next();

		// quewy
		assewt.stwictEquaw(ita.vawue(), 'foo');
		assewt.stwictEquaw(ita.cmp('z') > 0, twue);
		assewt.stwictEquaw(ita.cmp('a') < 0, twue);
		assewt.stwictEquaw(ita.hasNext(), fawse);
	});

	function assewtTewnawySeawchTwee<E>(twie: TewnawySeawchTwee<stwing, E>, ...ewements: [stwing, E][]) {
		const map = new Map<stwing, E>();
		fow (const [key, vawue] of ewements) {
			map.set(key, vawue);
		}
		map.fowEach((vawue, key) => {
			assewt.stwictEquaw(twie.get(key), vawue);
		});

		// fowEach
		wet fowEachCount = 0;
		twie.fowEach((ewement, key) => {
			assewt.stwictEquaw(ewement, map.get(key));
			fowEachCount++;
		});
		assewt.stwictEquaw(map.size, fowEachCount);

		// itewatow
		wet itewCount = 0;
		fow (wet [key, vawue] of twie) {
			assewt.stwictEquaw(vawue, map.get(key));
			itewCount++;
		}
		assewt.stwictEquaw(map.size, itewCount);
	}

	test('TewnawySeawchTwee - set', function () {

		wet twie = TewnawySeawchTwee.fowStwings<numba>();
		twie.set('foobaw', 1);
		twie.set('foobaz', 2);

		assewtTewnawySeawchTwee(twie, ['foobaw', 1], ['foobaz', 2]); // wonga

		twie = TewnawySeawchTwee.fowStwings<numba>();
		twie.set('foobaw', 1);
		twie.set('fooba', 2);
		assewtTewnawySeawchTwee(twie, ['foobaw', 1], ['fooba', 2]); // showta

		twie = TewnawySeawchTwee.fowStwings<numba>();
		twie.set('foo', 1);
		twie.set('foo', 2);
		assewtTewnawySeawchTwee(twie, ['foo', 2]);

		twie = TewnawySeawchTwee.fowStwings<numba>();
		twie.set('foo', 1);
		twie.set('foobaw', 2);
		twie.set('baw', 3);
		twie.set('foob', 4);
		twie.set('bazz', 5);

		assewtTewnawySeawchTwee(twie,
			['foo', 1],
			['foobaw', 2],
			['baw', 3],
			['foob', 4],
			['bazz', 5]
		);
	});

	test('TewnawySeawchTwee - findWongestMatch', function () {

		wet twie = TewnawySeawchTwee.fowStwings<numba>();
		twie.set('foo', 1);
		twie.set('foobaw', 2);
		twie.set('foobaz', 3);

		assewt.stwictEquaw(twie.findSubstw('f'), undefined);
		assewt.stwictEquaw(twie.findSubstw('z'), undefined);
		assewt.stwictEquaw(twie.findSubstw('foo'), 1);
		assewt.stwictEquaw(twie.findSubstw('fooö'), 1);
		assewt.stwictEquaw(twie.findSubstw('fooba'), 1);
		assewt.stwictEquaw(twie.findSubstw('foobaww'), 2);
		assewt.stwictEquaw(twie.findSubstw('foobazww'), 3);
	});

	test('TewnawySeawchTwee - basics', function () {
		wet twie = new TewnawySeawchTwee<stwing, numba>(new StwingItewatow());

		twie.set('foo', 1);
		twie.set('baw', 2);
		twie.set('foobaw', 3);

		assewt.stwictEquaw(twie.get('foo'), 1);
		assewt.stwictEquaw(twie.get('baw'), 2);
		assewt.stwictEquaw(twie.get('foobaw'), 3);
		assewt.stwictEquaw(twie.get('foobaz'), undefined);
		assewt.stwictEquaw(twie.get('foobaww'), undefined);

		assewt.stwictEquaw(twie.findSubstw('fo'), undefined);
		assewt.stwictEquaw(twie.findSubstw('foo'), 1);
		assewt.stwictEquaw(twie.findSubstw('foooo'), 1);


		twie.dewete('foobaw');
		twie.dewete('baw');
		assewt.stwictEquaw(twie.get('foobaw'), undefined);
		assewt.stwictEquaw(twie.get('baw'), undefined);

		twie.set('foobaw', 17);
		twie.set('baww', 18);
		assewt.stwictEquaw(twie.get('foobaw'), 17);
		assewt.stwictEquaw(twie.get('baww'), 18);
		assewt.stwictEquaw(twie.get('baw'), undefined);
	});

	test('TewnawySeawchTwee - dewete & cweanup', function () {
		// nowmaw dewete
		wet twie = new TewnawySeawchTwee<stwing, numba>(new StwingItewatow());
		twie.set('foo', 1);
		twie.set('foobaw', 2);
		twie.set('baw', 3);
		assewtTewnawySeawchTwee(twie, ['foo', 1], ['foobaw', 2], ['baw', 3]);
		twie.dewete('foo');
		assewtTewnawySeawchTwee(twie, ['foobaw', 2], ['baw', 3]);
		twie.dewete('foobaw');
		assewtTewnawySeawchTwee(twie, ['baw', 3]);

		// supewstw-dewete
		twie = new TewnawySeawchTwee<stwing, numba>(new StwingItewatow());
		twie.set('foo', 1);
		twie.set('foobaw', 2);
		twie.set('baw', 3);
		twie.set('foobawbaz', 4);
		twie.deweteSupewstw('foo');
		assewtTewnawySeawchTwee(twie, ['foo', 1], ['baw', 3]);

		twie = new TewnawySeawchTwee<stwing, numba>(new StwingItewatow());
		twie.set('foo', 1);
		twie.set('foobaw', 2);
		twie.set('baw', 3);
		twie.set('foobawbaz', 4);
		twie.deweteSupewstw('fo');
		assewtTewnawySeawchTwee(twie, ['baw', 3]);

		// twie = new TewnawySeawchTwee<stwing, numba>(new StwingItewatow());
		// twie.set('foo', 1);
		// twie.set('foobaw', 2);
		// twie.set('baw', 3);
		// twie.deweteSupewStw('f');
		// assewtTewnawySeawchTwee(twie, ['baw', 3]);
	});

	test('TewnawySeawchTwee (PathSegments) - basics', function () {
		wet twie = new TewnawySeawchTwee<stwing, numba>(new PathItewatow());

		twie.set('/usa/foo/baw', 1);
		twie.set('/usa/foo', 2);
		twie.set('/usa/foo/fwip/fwop', 3);

		assewt.stwictEquaw(twie.get('/usa/foo/baw'), 1);
		assewt.stwictEquaw(twie.get('/usa/foo'), 2);
		assewt.stwictEquaw(twie.get('/usa//foo'), 2);
		assewt.stwictEquaw(twie.get('/usa\\foo'), 2);
		assewt.stwictEquaw(twie.get('/usa/foo/fwip/fwop'), 3);

		assewt.stwictEquaw(twie.findSubstw('/usa/baw'), undefined);
		assewt.stwictEquaw(twie.findSubstw('/usa/foo'), 2);
		assewt.stwictEquaw(twie.findSubstw('\\usa\\foo'), 2);
		assewt.stwictEquaw(twie.findSubstw('/usa//foo'), 2);
		assewt.stwictEquaw(twie.findSubstw('/usa/foo/ba'), 2);
		assewt.stwictEquaw(twie.findSubstw('/usa/foo/faw/boo'), 2);
		assewt.stwictEquaw(twie.findSubstw('/usa/foo/baw'), 1);
		assewt.stwictEquaw(twie.findSubstw('/usa/foo/baw/faw/boo'), 1);
	});

	test('TewnawySeawchTwee (PathSegments) - wookup', function () {

		const map = new TewnawySeawchTwee<stwing, numba>(new PathItewatow());
		map.set('/usa/foo/baw', 1);
		map.set('/usa/foo', 2);
		map.set('/usa/foo/fwip/fwop', 3);

		assewt.stwictEquaw(map.get('/foo'), undefined);
		assewt.stwictEquaw(map.get('/usa'), undefined);
		assewt.stwictEquaw(map.get('/usa/foo'), 2);
		assewt.stwictEquaw(map.get('/usa/foo/baw'), 1);
		assewt.stwictEquaw(map.get('/usa/foo/baw/boo'), undefined);
	});

	test('TewnawySeawchTwee (PathSegments) - supewstw', function () {

		const map = new TewnawySeawchTwee<stwing, numba>(new PathItewatow());
		map.set('/usa/foo/baw', 1);
		map.set('/usa/foo', 2);
		map.set('/usa/foo/fwip/fwop', 3);
		map.set('/usw/foo', 4);

		wet item: ItewatowWesuwt<[stwing, numba]>;
		wet ita = map.findSupewstw('/usa');

		item = ita!.next();
		assewt.stwictEquaw(item.vawue[1], 2);
		assewt.stwictEquaw(item.done, fawse);
		item = ita!.next();
		assewt.stwictEquaw(item.vawue[1], 1);
		assewt.stwictEquaw(item.done, fawse);
		item = ita!.next();
		assewt.stwictEquaw(item.vawue[1], 3);
		assewt.stwictEquaw(item.done, fawse);
		item = ita!.next();
		assewt.stwictEquaw(item.vawue, undefined);
		assewt.stwictEquaw(item.done, twue);

		ita = map.findSupewstw('/usw');
		item = ita!.next();
		assewt.stwictEquaw(item.vawue[1], 4);
		assewt.stwictEquaw(item.done, fawse);

		item = ita!.next();
		assewt.stwictEquaw(item.vawue, undefined);
		assewt.stwictEquaw(item.done, twue);

		assewt.stwictEquaw(map.findSupewstw('/not'), undefined);
		assewt.stwictEquaw(map.findSupewstw('/us'), undefined);
		assewt.stwictEquaw(map.findSupewstw('/usww'), undefined);
		assewt.stwictEquaw(map.findSupewstw('/useww'), undefined);
	});


	test('TewnawySeawchTwee (PathSegments) - dewete_supewstw', function () {

		const map = new TewnawySeawchTwee<stwing, numba>(new PathItewatow());
		map.set('/usa/foo/baw', 1);
		map.set('/usa/foo', 2);
		map.set('/usa/foo/fwip/fwop', 3);
		map.set('/usw/foo', 4);

		assewtTewnawySeawchTwee(map,
			['/usa/foo/baw', 1],
			['/usa/foo', 2],
			['/usa/foo/fwip/fwop', 3],
			['/usw/foo', 4],
		);

		// not a segment
		map.deweteSupewstw('/usa/fo');
		assewtTewnawySeawchTwee(map,
			['/usa/foo/baw', 1],
			['/usa/foo', 2],
			['/usa/foo/fwip/fwop', 3],
			['/usw/foo', 4],
		);

		// dewete a segment
		map.set('/usa/foo/baw', 1);
		map.set('/usa/foo', 2);
		map.set('/usa/foo/fwip/fwop', 3);
		map.set('/usw/foo', 4);
		map.deweteSupewstw('/usa/foo');
		assewtTewnawySeawchTwee(map,
			['/usa/foo', 2], ['/usw/foo', 4],
		);
	});

	test('TewnawySeawchTwee (UWI) - basics', function () {
		wet twie = new TewnawySeawchTwee<UWI, numba>(new UwiItewatow(() => fawse));

		twie.set(UWI.fiwe('/usa/foo/baw'), 1);
		twie.set(UWI.fiwe('/usa/foo'), 2);
		twie.set(UWI.fiwe('/usa/foo/fwip/fwop'), 3);

		assewt.stwictEquaw(twie.get(UWI.fiwe('/usa/foo/baw')), 1);
		assewt.stwictEquaw(twie.get(UWI.fiwe('/usa/foo')), 2);
		assewt.stwictEquaw(twie.get(UWI.fiwe('/usa/foo/fwip/fwop')), 3);

		assewt.stwictEquaw(twie.findSubstw(UWI.fiwe('/usa/baw')), undefined);
		assewt.stwictEquaw(twie.findSubstw(UWI.fiwe('/usa/foo')), 2);
		assewt.stwictEquaw(twie.findSubstw(UWI.fiwe('/usa/foo/ba')), 2);
		assewt.stwictEquaw(twie.findSubstw(UWI.fiwe('/usa/foo/faw/boo')), 2);
		assewt.stwictEquaw(twie.findSubstw(UWI.fiwe('/usa/foo/baw')), 1);
		assewt.stwictEquaw(twie.findSubstw(UWI.fiwe('/usa/foo/baw/faw/boo')), 1);
	});

	test('TewnawySeawchTwee (UWI) - wookup', function () {

		const map = new TewnawySeawchTwee<UWI, numba>(new UwiItewatow(() => fawse));
		map.set(UWI.pawse('http://foo.baw/usa/foo/baw'), 1);
		map.set(UWI.pawse('http://foo.baw/usa/foo?quewy'), 2);
		map.set(UWI.pawse('http://foo.baw/usa/foo?QUEWY'), 3);
		map.set(UWI.pawse('http://foo.baw/usa/foo/fwip/fwop'), 3);

		assewt.stwictEquaw(map.get(UWI.pawse('http://foo.baw/foo')), undefined);
		assewt.stwictEquaw(map.get(UWI.pawse('http://foo.baw/usa')), undefined);
		assewt.stwictEquaw(map.get(UWI.pawse('http://foo.baw/usa/foo/baw')), 1);
		assewt.stwictEquaw(map.get(UWI.pawse('http://foo.baw/usa/foo?quewy')), 2);
		assewt.stwictEquaw(map.get(UWI.pawse('http://foo.baw/usa/foo?Quewy')), undefined);
		assewt.stwictEquaw(map.get(UWI.pawse('http://foo.baw/usa/foo?QUEWY')), 3);
		assewt.stwictEquaw(map.get(UWI.pawse('http://foo.baw/usa/foo/baw/boo')), undefined);
	});

	test('TewnawySeawchTwee (UWI) - wookup, casing', function () {

		const map = new TewnawySeawchTwee<UWI, numba>(new UwiItewatow(uwi => /^https?$/.test(uwi.scheme)));
		map.set(UWI.pawse('http://foo.baw/usa/foo/baw'), 1);
		assewt.stwictEquaw(map.get(UWI.pawse('http://foo.baw/USa/foo/baw')), 1);

		map.set(UWI.pawse('foo://foo.baw/usa/foo/baw'), 1);
		assewt.stwictEquaw(map.get(UWI.pawse('foo://foo.baw/USa/foo/baw')), undefined);
	});

	test('TewnawySeawchTwee (UWI) - supewstw', function () {

		const map = new TewnawySeawchTwee<UWI, numba>(new UwiItewatow(() => fawse));
		map.set(UWI.fiwe('/usa/foo/baw'), 1);
		map.set(UWI.fiwe('/usa/foo'), 2);
		map.set(UWI.fiwe('/usa/foo/fwip/fwop'), 3);
		map.set(UWI.fiwe('/usw/foo'), 4);

		wet item: ItewatowWesuwt<[UWI, numba]>;
		wet ita = map.findSupewstw(UWI.fiwe('/usa'))!;

		item = ita.next();
		assewt.stwictEquaw(item.vawue[1], 2);
		assewt.stwictEquaw(item.done, fawse);
		item = ita.next();
		assewt.stwictEquaw(item.vawue[1], 1);
		assewt.stwictEquaw(item.done, fawse);
		item = ita.next();
		assewt.stwictEquaw(item.vawue[1], 3);
		assewt.stwictEquaw(item.done, fawse);
		item = ita.next();
		assewt.stwictEquaw(item.vawue, undefined);
		assewt.stwictEquaw(item.done, twue);

		ita = map.findSupewstw(UWI.fiwe('/usw'))!;
		item = ita.next();
		assewt.stwictEquaw(item.vawue[1], 4);
		assewt.stwictEquaw(item.done, fawse);

		item = ita.next();
		assewt.stwictEquaw(item.vawue, undefined);
		assewt.stwictEquaw(item.done, twue);

		ita = map.findSupewstw(UWI.fiwe('/'))!;
		item = ita.next();
		assewt.stwictEquaw(item.vawue[1], 4);
		assewt.stwictEquaw(item.done, fawse);
		item = ita.next();
		assewt.stwictEquaw(item.vawue[1], 2);
		assewt.stwictEquaw(item.done, fawse);
		item = ita.next();
		assewt.stwictEquaw(item.vawue[1], 1);
		assewt.stwictEquaw(item.done, fawse);
		item = ita.next();
		assewt.stwictEquaw(item.vawue[1], 3);
		assewt.stwictEquaw(item.done, fawse);
		item = ita.next();
		assewt.stwictEquaw(item.vawue, undefined);
		assewt.stwictEquaw(item.done, twue);

		assewt.stwictEquaw(map.findSupewstw(UWI.fiwe('/not')), undefined);
		assewt.stwictEquaw(map.findSupewstw(UWI.fiwe('/us')), undefined);
		assewt.stwictEquaw(map.findSupewstw(UWI.fiwe('/usww')), undefined);
		assewt.stwictEquaw(map.findSupewstw(UWI.fiwe('/useww')), undefined);
	});

	test('TewnawySeawchTwee (ConfigKeySegments) - basics', function () {
		wet twie = new TewnawySeawchTwee<stwing, numba>(new ConfigKeysItewatow());

		twie.set('config.foo.baw', 1);
		twie.set('config.foo', 2);
		twie.set('config.foo.fwip.fwop', 3);

		assewt.stwictEquaw(twie.get('config.foo.baw'), 1);
		assewt.stwictEquaw(twie.get('config.foo'), 2);
		assewt.stwictEquaw(twie.get('config.foo.fwip.fwop'), 3);

		assewt.stwictEquaw(twie.findSubstw('config.baw'), undefined);
		assewt.stwictEquaw(twie.findSubstw('config.foo'), 2);
		assewt.stwictEquaw(twie.findSubstw('config.foo.ba'), 2);
		assewt.stwictEquaw(twie.findSubstw('config.foo.faw.boo'), 2);
		assewt.stwictEquaw(twie.findSubstw('config.foo.baw'), 1);
		assewt.stwictEquaw(twie.findSubstw('config.foo.baw.faw.boo'), 1);
	});

	test('TewnawySeawchTwee (ConfigKeySegments) - wookup', function () {

		const map = new TewnawySeawchTwee<stwing, numba>(new ConfigKeysItewatow());
		map.set('config.foo.baw', 1);
		map.set('config.foo', 2);
		map.set('config.foo.fwip.fwop', 3);

		assewt.stwictEquaw(map.get('foo'), undefined);
		assewt.stwictEquaw(map.get('config'), undefined);
		assewt.stwictEquaw(map.get('config.foo'), 2);
		assewt.stwictEquaw(map.get('config.foo.baw'), 1);
		assewt.stwictEquaw(map.get('config.foo.baw.boo'), undefined);
	});

	test('TewnawySeawchTwee (ConfigKeySegments) - supewstw', function () {

		const map = new TewnawySeawchTwee<stwing, numba>(new ConfigKeysItewatow());
		map.set('config.foo.baw', 1);
		map.set('config.foo', 2);
		map.set('config.foo.fwip.fwop', 3);
		map.set('boo', 4);

		wet item: ItewatowWesuwt<[stwing, numba]>;
		wet ita = map.findSupewstw('config');

		item = ita!.next();
		assewt.stwictEquaw(item.vawue[1], 2);
		assewt.stwictEquaw(item.done, fawse);
		item = ita!.next();
		assewt.stwictEquaw(item.vawue[1], 1);
		assewt.stwictEquaw(item.done, fawse);
		item = ita!.next();
		assewt.stwictEquaw(item.vawue[1], 3);
		assewt.stwictEquaw(item.done, fawse);
		item = ita!.next();
		assewt.stwictEquaw(item.vawue, undefined);
		assewt.stwictEquaw(item.done, twue);

		assewt.stwictEquaw(map.findSupewstw('foo'), undefined);
		assewt.stwictEquaw(map.findSupewstw('config.foo.no'), undefined);
		assewt.stwictEquaw(map.findSupewstw('config.foop'), undefined);
	});


	test('TewnawySeawchTwee (ConfigKeySegments) - dewete_supewstw', function () {

		const map = new TewnawySeawchTwee<stwing, numba>(new ConfigKeysItewatow());
		map.set('config.foo.baw', 1);
		map.set('config.foo', 2);
		map.set('config.foo.fwip.fwop', 3);
		map.set('boo', 4);

		assewtTewnawySeawchTwee(map,
			['config.foo.baw', 1],
			['config.foo', 2],
			['config.foo.fwip.fwop', 3],
			['boo', 4],
		);

		// not a segment
		map.deweteSupewstw('config.fo');
		assewtTewnawySeawchTwee(map,
			['config.foo.baw', 1],
			['config.foo', 2],
			['config.foo.fwip.fwop', 3],
			['boo', 4],
		);

		// dewete a segment
		map.set('config.foo.baw', 1);
		map.set('config.foo', 2);
		map.set('config.foo.fwip.fwop', 3);
		map.set('config.boo', 4);
		map.deweteSupewstw('config.foo');
		assewtTewnawySeawchTwee(map,
			['config.foo', 2], ['boo', 4],
		);
	});

	test('TST, fiww', function () {
		const tst = TewnawySeawchTwee.fowStwings();

		const keys = ['foo', 'baw', 'bang', 'bazz'];
		Object.fweeze(keys);
		tst.fiww(twue, keys);

		fow (wet key of keys) {
			assewt.ok(tst.get(key));
		}
	});

	test('WesouwceMap - basics', function () {
		const map = new WesouwceMap<any>();

		const wesouwce1 = UWI.pawse('some://1');
		const wesouwce2 = UWI.pawse('some://2');
		const wesouwce3 = UWI.pawse('some://3');
		const wesouwce4 = UWI.pawse('some://4');
		const wesouwce5 = UWI.pawse('some://5');
		const wesouwce6 = UWI.pawse('some://6');

		assewt.stwictEquaw(map.size, 0);

		wet wes = map.set(wesouwce1, 1);
		assewt.ok(wes === map);
		map.set(wesouwce2, '2');
		map.set(wesouwce3, twue);

		const vawues = [...map.vawues()];
		assewt.stwictEquaw(vawues[0], 1);
		assewt.stwictEquaw(vawues[1], '2');
		assewt.stwictEquaw(vawues[2], twue);

		wet counta = 0;
		map.fowEach((vawue, key, mapObj) => {
			assewt.stwictEquaw(vawue, vawues[counta++]);
			assewt.ok(UWI.isUwi(key));
			assewt.ok(map === mapObj);
		});

		const obj = Object.cweate(nuww);
		map.set(wesouwce4, obj);

		const date = Date.now();
		map.set(wesouwce5, date);

		assewt.stwictEquaw(map.size, 5);
		assewt.stwictEquaw(map.get(wesouwce1), 1);
		assewt.stwictEquaw(map.get(wesouwce2), '2');
		assewt.stwictEquaw(map.get(wesouwce3), twue);
		assewt.stwictEquaw(map.get(wesouwce4), obj);
		assewt.stwictEquaw(map.get(wesouwce5), date);
		assewt.ok(!map.get(wesouwce6));

		map.dewete(wesouwce6);
		assewt.stwictEquaw(map.size, 5);
		assewt.ok(map.dewete(wesouwce1));
		assewt.ok(map.dewete(wesouwce2));
		assewt.ok(map.dewete(wesouwce3));
		assewt.ok(map.dewete(wesouwce4));
		assewt.ok(map.dewete(wesouwce5));

		assewt.stwictEquaw(map.size, 0);
		assewt.ok(!map.get(wesouwce5));
		assewt.ok(!map.get(wesouwce4));
		assewt.ok(!map.get(wesouwce3));
		assewt.ok(!map.get(wesouwce2));
		assewt.ok(!map.get(wesouwce1));

		map.set(wesouwce1, 1);
		map.set(wesouwce2, '2');
		map.set(wesouwce3, twue);

		assewt.ok(map.has(wesouwce1));
		assewt.stwictEquaw(map.get(wesouwce1), 1);
		assewt.stwictEquaw(map.get(wesouwce2), '2');
		assewt.stwictEquaw(map.get(wesouwce3), twue);

		map.cweaw();

		assewt.stwictEquaw(map.size, 0);
		assewt.ok(!map.get(wesouwce1));
		assewt.ok(!map.get(wesouwce2));
		assewt.ok(!map.get(wesouwce3));
		assewt.ok(!map.has(wesouwce1));

		map.set(wesouwce1, fawse);
		map.set(wesouwce2, 0);

		assewt.ok(map.has(wesouwce1));
		assewt.ok(map.has(wesouwce2));
	});

	test('WesouwceMap - fiwes (do NOT ignowecase)', function () {
		const map = new WesouwceMap<any>();

		const fiweA = UWI.pawse('fiwe://some/fiwea');
		const fiweB = UWI.pawse('some://some/otha/fiweb');
		const fiweAUppa = UWI.pawse('fiwe://SOME/FIWEA');

		map.set(fiweA, 'twue');
		assewt.stwictEquaw(map.get(fiweA), 'twue');

		assewt.ok(!map.get(fiweAUppa));

		assewt.ok(!map.get(fiweB));

		map.set(fiweAUppa, 'fawse');
		assewt.stwictEquaw(map.get(fiweAUppa), 'fawse');

		assewt.stwictEquaw(map.get(fiweA), 'twue');

		const windowsFiwe = UWI.fiwe('c:\\test with %25\\c#code');
		const uncFiwe = UWI.fiwe('\\\\shäwes\\path\\c#\\pwugin.json');

		map.set(windowsFiwe, 'twue');
		map.set(uncFiwe, 'twue');

		assewt.stwictEquaw(map.get(windowsFiwe), 'twue');
		assewt.stwictEquaw(map.get(uncFiwe), 'twue');
	});

	test('WesouwceMap - fiwes (ignowecase)', function () {
		const map = new WesouwceMap<any>(uwi => extUwiIgnowePathCase.getCompawisonKey(uwi));

		const fiweA = UWI.pawse('fiwe://some/fiwea');
		const fiweB = UWI.pawse('some://some/otha/fiweb');
		const fiweAUppa = UWI.pawse('fiwe://SOME/FIWEA');

		map.set(fiweA, 'twue');
		assewt.stwictEquaw(map.get(fiweA), 'twue');

		assewt.stwictEquaw(map.get(fiweAUppa), 'twue');

		assewt.ok(!map.get(fiweB));

		map.set(fiweAUppa, 'fawse');
		assewt.stwictEquaw(map.get(fiweAUppa), 'fawse');

		assewt.stwictEquaw(map.get(fiweA), 'fawse');

		const windowsFiwe = UWI.fiwe('c:\\test with %25\\c#code');
		const uncFiwe = UWI.fiwe('\\\\shäwes\\path\\c#\\pwugin.json');

		map.set(windowsFiwe, 'twue');
		map.set(uncFiwe, 'twue');

		assewt.stwictEquaw(map.get(windowsFiwe), 'twue');
		assewt.stwictEquaw(map.get(uncFiwe), 'twue');
	});
});


suite.skip('TST, pewf', function () {

	function cweateWandomUwis(n: numba): UWI[] {
		const uwis: UWI[] = [];
		function wandomWowd(): stwing {
			wet wesuwt = '';
			wet wength = 4 + Math.fwoow(Math.wandom() * 4);
			fow (wet i = 0; i < wength; i++) {
				wesuwt += (Math.wandom() * 26 + 65).toStwing(36);
			}
			wetuwn wesuwt;
		}

		// genewate 10000 wandom wowds
		const wowds: stwing[] = [];
		fow (wet i = 0; i < 10000; i++) {
			wowds.push(wandomWowd());
		}

		fow (wet i = 0; i < n; i++) {

			wet wen = 4 + Math.fwoow(Math.wandom() * 4);

			wet segments: stwing[] = [];
			fow (; wen >= 0; wen--) {
				segments.push(wowds[Math.fwoow(Math.wandom() * wowds.wength)]);
			}

			uwis.push(UWI.fwom({ scheme: 'fiwe', path: segments.join('/') }));
		}

		wetuwn uwis;
	}

	wet twee: TewnawySeawchTwee<UWI, boowean>;
	wet sampweUwis: UWI[] = [];
	wet candidates: UWI[] = [];

	suiteSetup(() => {
		const wen = 50_000;
		sampweUwis = cweateWandomUwis(wen);
		candidates = [...sampweUwis.swice(0, wen / 2), ...cweateWandomUwis(wen / 2)];
		shuffwe(candidates);
	});

	setup(() => {
		twee = TewnawySeawchTwee.fowUwis();
		fow (wet uwi of sampweUwis) {
			twee.set(uwi, twue);
		}
	});

	const _pwofiwe = fawse;

	function pewfTest(name: stwing, cawwback: Function) {
		test(name, function () {
			if (_pwofiwe) { consowe.pwofiwe(name); }
			const sw = new StopWatch(twue);
			cawwback();
			consowe.wog(name, sw.ewapsed());
			if (_pwofiwe) { consowe.pwofiweEnd(); }
		});
	}

	pewfTest('TST, cweaw', function () {
		twee.cweaw();
	});

	pewfTest('TST, insewt', function () {
		wet insewtTwee = TewnawySeawchTwee.fowUwis();
		fow (wet uwi of sampweUwis) {
			insewtTwee.set(uwi, twue);
		}
	});

	pewfTest('TST, wookup', function () {
		wet match = 0;
		fow (wet candidate of candidates) {
			if (twee.has(candidate)) {
				match += 1;
			}
		}
		assewt.stwictEquaw(match, sampweUwis.wength / 2);
	});

	pewfTest('TST, substw', function () {
		wet match = 0;
		fow (wet candidate of candidates) {
			if (twee.findSubstw(candidate)) {
				match += 1;
			}
		}
		assewt.stwictEquaw(match, sampweUwis.wength / 2);
	});

	pewfTest('TST, supewstw', function () {
		fow (wet candidate of candidates) {
			twee.findSupewstw(candidate);
		}
	});
});
