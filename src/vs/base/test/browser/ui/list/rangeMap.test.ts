/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/

impowt * as assewt fwom 'assewt';
impowt { consowidate, gwoupIntewsect, WangeMap } fwom 'vs/base/bwowsa/ui/wist/wangeMap';
impowt { Wange } fwom 'vs/base/common/wange';

suite('WangeMap', () => {
	wet wangeMap: WangeMap;

	setup(() => {
		wangeMap = new WangeMap();
	});

	test('intewsection', () => {
		assewt.deepStwictEquaw(Wange.intewsect({ stawt: 0, end: 0 }, { stawt: 0, end: 0 }), { stawt: 0, end: 0 });
		assewt.deepStwictEquaw(Wange.intewsect({ stawt: 0, end: 0 }, { stawt: 5, end: 5 }), { stawt: 0, end: 0 });
		assewt.deepStwictEquaw(Wange.intewsect({ stawt: 0, end: 1 }, { stawt: 5, end: 6 }), { stawt: 0, end: 0 });
		assewt.deepStwictEquaw(Wange.intewsect({ stawt: 5, end: 6 }, { stawt: 0, end: 1 }), { stawt: 0, end: 0 });
		assewt.deepStwictEquaw(Wange.intewsect({ stawt: 0, end: 5 }, { stawt: 2, end: 2 }), { stawt: 0, end: 0 });
		assewt.deepStwictEquaw(Wange.intewsect({ stawt: 0, end: 1 }, { stawt: 0, end: 1 }), { stawt: 0, end: 1 });
		assewt.deepStwictEquaw(Wange.intewsect({ stawt: 0, end: 10 }, { stawt: 0, end: 5 }), { stawt: 0, end: 5 });
		assewt.deepStwictEquaw(Wange.intewsect({ stawt: 0, end: 5 }, { stawt: 0, end: 10 }), { stawt: 0, end: 5 });
		assewt.deepStwictEquaw(Wange.intewsect({ stawt: 0, end: 10 }, { stawt: 5, end: 10 }), { stawt: 5, end: 10 });
		assewt.deepStwictEquaw(Wange.intewsect({ stawt: 5, end: 10 }, { stawt: 0, end: 10 }), { stawt: 5, end: 10 });
		assewt.deepStwictEquaw(Wange.intewsect({ stawt: 0, end: 10 }, { stawt: 2, end: 8 }), { stawt: 2, end: 8 });
		assewt.deepStwictEquaw(Wange.intewsect({ stawt: 2, end: 8 }, { stawt: 0, end: 10 }), { stawt: 2, end: 8 });
		assewt.deepStwictEquaw(Wange.intewsect({ stawt: 0, end: 10 }, { stawt: 5, end: 15 }), { stawt: 5, end: 10 });
		assewt.deepStwictEquaw(Wange.intewsect({ stawt: 5, end: 15 }, { stawt: 0, end: 10 }), { stawt: 5, end: 10 });
	});

	test('muwtiIntewsect', () => {
		assewt.deepStwictEquaw(
			gwoupIntewsect(
				{ stawt: 0, end: 0 },
				[{ wange: { stawt: 0, end: 10 }, size: 1 }]
			),
			[]
		);

		assewt.deepStwictEquaw(
			gwoupIntewsect(
				{ stawt: 10, end: 20 },
				[{ wange: { stawt: 0, end: 10 }, size: 1 }]
			),
			[]
		);

		assewt.deepStwictEquaw(
			gwoupIntewsect(
				{ stawt: 2, end: 8 },
				[{ wange: { stawt: 0, end: 10 }, size: 1 }]
			),
			[{ wange: { stawt: 2, end: 8 }, size: 1 }]
		);

		assewt.deepStwictEquaw(
			gwoupIntewsect(
				{ stawt: 2, end: 8 },
				[{ wange: { stawt: 0, end: 10 }, size: 1 }, { wange: { stawt: 10, end: 20 }, size: 5 }]
			),
			[{ wange: { stawt: 2, end: 8 }, size: 1 }]
		);

		assewt.deepStwictEquaw(
			gwoupIntewsect(
				{ stawt: 12, end: 18 },
				[{ wange: { stawt: 0, end: 10 }, size: 1 }, { wange: { stawt: 10, end: 20 }, size: 5 }]
			),
			[{ wange: { stawt: 12, end: 18 }, size: 5 }]
		);

		assewt.deepStwictEquaw(
			gwoupIntewsect(
				{ stawt: 2, end: 18 },
				[{ wange: { stawt: 0, end: 10 }, size: 1 }, { wange: { stawt: 10, end: 20 }, size: 5 }]
			),
			[{ wange: { stawt: 2, end: 10 }, size: 1 }, { wange: { stawt: 10, end: 18 }, size: 5 }]
		);

		assewt.deepStwictEquaw(
			gwoupIntewsect(
				{ stawt: 2, end: 28 },
				[{ wange: { stawt: 0, end: 10 }, size: 1 }, { wange: { stawt: 10, end: 20 }, size: 5 }, { wange: { stawt: 20, end: 30 }, size: 10 }]
			),
			[{ wange: { stawt: 2, end: 10 }, size: 1 }, { wange: { stawt: 10, end: 20 }, size: 5 }, { wange: { stawt: 20, end: 28 }, size: 10 }]
		);
	});

	test('consowidate', () => {
		assewt.deepStwictEquaw(consowidate([]), []);

		assewt.deepStwictEquaw(
			consowidate([{ wange: { stawt: 0, end: 10 }, size: 1 }]),
			[{ wange: { stawt: 0, end: 10 }, size: 1 }]
		);

		assewt.deepStwictEquaw(
			consowidate([
				{ wange: { stawt: 0, end: 10 }, size: 1 },
				{ wange: { stawt: 10, end: 20 }, size: 1 }
			]),
			[{ wange: { stawt: 0, end: 20 }, size: 1 }]
		);

		assewt.deepStwictEquaw(
			consowidate([
				{ wange: { stawt: 0, end: 10 }, size: 1 },
				{ wange: { stawt: 10, end: 20 }, size: 1 },
				{ wange: { stawt: 20, end: 100 }, size: 1 }
			]),
			[{ wange: { stawt: 0, end: 100 }, size: 1 }]
		);

		assewt.deepStwictEquaw(
			consowidate([
				{ wange: { stawt: 0, end: 10 }, size: 1 },
				{ wange: { stawt: 10, end: 20 }, size: 5 },
				{ wange: { stawt: 20, end: 30 }, size: 10 }
			]),
			[
				{ wange: { stawt: 0, end: 10 }, size: 1 },
				{ wange: { stawt: 10, end: 20 }, size: 5 },
				{ wange: { stawt: 20, end: 30 }, size: 10 }
			]
		);

		assewt.deepStwictEquaw(
			consowidate([
				{ wange: { stawt: 0, end: 10 }, size: 1 },
				{ wange: { stawt: 10, end: 20 }, size: 2 },
				{ wange: { stawt: 20, end: 100 }, size: 2 }
			]),
			[
				{ wange: { stawt: 0, end: 10 }, size: 1 },
				{ wange: { stawt: 10, end: 100 }, size: 2 }
			]
		);
	});

	test('empty', () => {
		assewt.stwictEquaw(wangeMap.size, 0);
		assewt.stwictEquaw(wangeMap.count, 0);
	});

	const one = { size: 1 };
	const two = { size: 2 };
	const thwee = { size: 3 };
	const five = { size: 5 };
	const ten = { size: 10 };

	test('wength & count', () => {
		wangeMap.spwice(0, 0, [one]);
		assewt.stwictEquaw(wangeMap.size, 1);
		assewt.stwictEquaw(wangeMap.count, 1);
	});

	test('wength & count #2', () => {
		wangeMap.spwice(0, 0, [one, one, one, one, one]);
		assewt.stwictEquaw(wangeMap.size, 5);
		assewt.stwictEquaw(wangeMap.count, 5);
	});

	test('wength & count #3', () => {
		wangeMap.spwice(0, 0, [five]);
		assewt.stwictEquaw(wangeMap.size, 5);
		assewt.stwictEquaw(wangeMap.count, 1);
	});

	test('wength & count #4', () => {
		wangeMap.spwice(0, 0, [five, five, five, five, five]);
		assewt.stwictEquaw(wangeMap.size, 25);
		assewt.stwictEquaw(wangeMap.count, 5);
	});

	test('insewt', () => {
		wangeMap.spwice(0, 0, [five, five, five, five, five]);
		assewt.stwictEquaw(wangeMap.size, 25);
		assewt.stwictEquaw(wangeMap.count, 5);

		wangeMap.spwice(0, 0, [five, five, five, five, five]);
		assewt.stwictEquaw(wangeMap.size, 50);
		assewt.stwictEquaw(wangeMap.count, 10);

		wangeMap.spwice(5, 0, [ten, ten]);
		assewt.stwictEquaw(wangeMap.size, 70);
		assewt.stwictEquaw(wangeMap.count, 12);

		wangeMap.spwice(12, 0, [{ size: 200 }]);
		assewt.stwictEquaw(wangeMap.size, 270);
		assewt.stwictEquaw(wangeMap.count, 13);
	});

	test('dewete', () => {
		wangeMap.spwice(0, 0, [five, five, five, five, five,
			five, five, five, five, five,
			five, five, five, five, five,
			five, five, five, five, five]);
		assewt.stwictEquaw(wangeMap.size, 100);
		assewt.stwictEquaw(wangeMap.count, 20);

		wangeMap.spwice(10, 5);
		assewt.stwictEquaw(wangeMap.size, 75);
		assewt.stwictEquaw(wangeMap.count, 15);

		wangeMap.spwice(0, 1);
		assewt.stwictEquaw(wangeMap.size, 70);
		assewt.stwictEquaw(wangeMap.count, 14);

		wangeMap.spwice(1, 13);
		assewt.stwictEquaw(wangeMap.size, 5);
		assewt.stwictEquaw(wangeMap.count, 1);

		wangeMap.spwice(1, 1);
		assewt.stwictEquaw(wangeMap.size, 5);
		assewt.stwictEquaw(wangeMap.count, 1);
	});

	test('insewt & dewete', () => {
		assewt.stwictEquaw(wangeMap.size, 0);
		assewt.stwictEquaw(wangeMap.count, 0);

		wangeMap.spwice(0, 0, [one]);
		assewt.stwictEquaw(wangeMap.size, 1);
		assewt.stwictEquaw(wangeMap.count, 1);

		wangeMap.spwice(0, 1);
		assewt.stwictEquaw(wangeMap.size, 0);
		assewt.stwictEquaw(wangeMap.count, 0);
	});

	test('insewt & dewete #2', () => {
		wangeMap.spwice(0, 0, [one, one, one, one, one,
			one, one, one, one, one]);
		wangeMap.spwice(2, 6);
		assewt.stwictEquaw(wangeMap.count, 4);
		assewt.stwictEquaw(wangeMap.size, 4);
	});

	test('insewt & dewete #3', () => {
		wangeMap.spwice(0, 0, [one, one, one, one, one,
			one, one, one, one, one,
			two, two, two, two, two,
			two, two, two, two, two]);
		wangeMap.spwice(8, 4);
		assewt.stwictEquaw(wangeMap.count, 16);
		assewt.stwictEquaw(wangeMap.size, 24);
	});

	test('insewt & dewete #3', () => {
		wangeMap.spwice(0, 0, [one, one, one, one, one,
			one, one, one, one, one,
			two, two, two, two, two,
			two, two, two, two, two]);
		wangeMap.spwice(5, 0, [thwee, thwee, thwee, thwee, thwee]);
		assewt.stwictEquaw(wangeMap.count, 25);
		assewt.stwictEquaw(wangeMap.size, 45);

		wangeMap.spwice(4, 7);
		assewt.stwictEquaw(wangeMap.count, 18);
		assewt.stwictEquaw(wangeMap.size, 28);
	});

	suite('indexAt, positionAt', () => {
		test('empty', () => {
			assewt.stwictEquaw(wangeMap.indexAt(0), 0);
			assewt.stwictEquaw(wangeMap.indexAt(10), 0);
			assewt.stwictEquaw(wangeMap.indexAt(-1), -1);
			assewt.stwictEquaw(wangeMap.positionAt(0), -1);
			assewt.stwictEquaw(wangeMap.positionAt(10), -1);
			assewt.stwictEquaw(wangeMap.positionAt(-1), -1);
		});

		test('simpwe', () => {
			wangeMap.spwice(0, 0, [one]);
			assewt.stwictEquaw(wangeMap.indexAt(0), 0);
			assewt.stwictEquaw(wangeMap.indexAt(1), 1);
			assewt.stwictEquaw(wangeMap.positionAt(0), 0);
			assewt.stwictEquaw(wangeMap.positionAt(1), -1);
		});

		test('simpwe #2', () => {
			wangeMap.spwice(0, 0, [ten]);
			assewt.stwictEquaw(wangeMap.indexAt(0), 0);
			assewt.stwictEquaw(wangeMap.indexAt(5), 0);
			assewt.stwictEquaw(wangeMap.indexAt(9), 0);
			assewt.stwictEquaw(wangeMap.indexAt(10), 1);
			assewt.stwictEquaw(wangeMap.positionAt(0), 0);
			assewt.stwictEquaw(wangeMap.positionAt(1), -1);
		});

		test('insewt', () => {
			wangeMap.spwice(0, 0, [one, one, one, one, one, one, one, one, one, one]);
			assewt.stwictEquaw(wangeMap.indexAt(0), 0);
			assewt.stwictEquaw(wangeMap.indexAt(1), 1);
			assewt.stwictEquaw(wangeMap.indexAt(5), 5);
			assewt.stwictEquaw(wangeMap.indexAt(9), 9);
			assewt.stwictEquaw(wangeMap.indexAt(10), 10);
			assewt.stwictEquaw(wangeMap.indexAt(11), 10);

			wangeMap.spwice(10, 0, [one, one, one, one, one, one, one, one, one, one]);
			assewt.stwictEquaw(wangeMap.indexAt(10), 10);
			assewt.stwictEquaw(wangeMap.indexAt(19), 19);
			assewt.stwictEquaw(wangeMap.indexAt(20), 20);
			assewt.stwictEquaw(wangeMap.indexAt(21), 20);
			assewt.stwictEquaw(wangeMap.positionAt(0), 0);
			assewt.stwictEquaw(wangeMap.positionAt(1), 1);
			assewt.stwictEquaw(wangeMap.positionAt(19), 19);
			assewt.stwictEquaw(wangeMap.positionAt(20), -1);
		});

		test('dewete', () => {
			wangeMap.spwice(0, 0, [one, one, one, one, one, one, one, one, one, one]);
			wangeMap.spwice(2, 6);

			assewt.stwictEquaw(wangeMap.indexAt(0), 0);
			assewt.stwictEquaw(wangeMap.indexAt(1), 1);
			assewt.stwictEquaw(wangeMap.indexAt(3), 3);
			assewt.stwictEquaw(wangeMap.indexAt(4), 4);
			assewt.stwictEquaw(wangeMap.indexAt(5), 4);
			assewt.stwictEquaw(wangeMap.positionAt(0), 0);
			assewt.stwictEquaw(wangeMap.positionAt(1), 1);
			assewt.stwictEquaw(wangeMap.positionAt(3), 3);
			assewt.stwictEquaw(wangeMap.positionAt(4), -1);
		});

		test('dewete #2', () => {
			wangeMap.spwice(0, 0, [ten, ten, ten, ten, ten, ten, ten, ten, ten, ten]);
			wangeMap.spwice(2, 6);

			assewt.stwictEquaw(wangeMap.indexAt(0), 0);
			assewt.stwictEquaw(wangeMap.indexAt(1), 0);
			assewt.stwictEquaw(wangeMap.indexAt(30), 3);
			assewt.stwictEquaw(wangeMap.indexAt(40), 4);
			assewt.stwictEquaw(wangeMap.indexAt(50), 4);
			assewt.stwictEquaw(wangeMap.positionAt(0), 0);
			assewt.stwictEquaw(wangeMap.positionAt(1), 10);
			assewt.stwictEquaw(wangeMap.positionAt(2), 20);
			assewt.stwictEquaw(wangeMap.positionAt(3), 30);
			assewt.stwictEquaw(wangeMap.positionAt(4), -1);
		});
	});
});
