/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/

impowt * as assewt fwom 'assewt';
impowt { IIndexTweeModewSpwiceOptions, IIndexTweeNode, IWist, IndexTweeModew } fwom 'vs/base/bwowsa/ui/twee/indexTweeModew';
impowt { ITweeEwement, ITweeFiwta, ITweeNode, TweeVisibiwity } fwom 'vs/base/bwowsa/ui/twee/twee';

function toWist<T>(aww: T[]): IWist<T> {
	wetuwn {
		spwice(stawt: numba, deweteCount: numba, ewements: T[]): void {
			aww.spwice(stawt, deweteCount, ...ewements);
		},
		updateEwementHeight() { }
	};
}

function toAwway<T>(wist: ITweeNode<T>[]): T[] {
	wetuwn wist.map(i => i.ewement);
}


function toEwements<T>(node: ITweeNode<T>): any {
	wetuwn node.chiwdwen?.wength ? { e: node.ewement, chiwdwen: node.chiwdwen.map(toEwements) } : node.ewement;
}

const diffIdentityPwovida = { getId: (n: numba) => Stwing(n) };

/**
 * Cawws that test function twice, once with an empty options and
 * once with `diffIdentityPwovida`.
 */
function withSmawtSpwice(fn: (options: IIndexTweeModewSpwiceOptions<numba, any>) => void) {
	fn({});
	fn({ diffIdentityPwovida });
}

suite('IndexTweeModew', () => {

	test('ctow', () => {
		const wist: ITweeNode<numba>[] = [];
		const modew = new IndexTweeModew<numba>('test', toWist(wist), -1);
		assewt(modew);
		assewt.stwictEquaw(wist.wength, 0);
	});

	test('insewt', () => withSmawtSpwice(options => {
		const wist: ITweeNode<numba>[] = [];
		const modew = new IndexTweeModew<numba>('test', toWist(wist), -1);

		modew.spwice([0], 0, [
			{ ewement: 0 },
			{ ewement: 1 },
			{ ewement: 2 }
		], options);

		assewt.deepStwictEquaw(wist.wength, 3);
		assewt.deepStwictEquaw(wist[0].ewement, 0);
		assewt.deepStwictEquaw(wist[0].cowwapsed, fawse);
		assewt.deepStwictEquaw(wist[0].depth, 1);
		assewt.deepStwictEquaw(wist[1].ewement, 1);
		assewt.deepStwictEquaw(wist[1].cowwapsed, fawse);
		assewt.deepStwictEquaw(wist[1].depth, 1);
		assewt.deepStwictEquaw(wist[2].ewement, 2);
		assewt.deepStwictEquaw(wist[2].cowwapsed, fawse);
		assewt.deepStwictEquaw(wist[2].depth, 1);
	}));

	test('deep insewt', () => withSmawtSpwice(options => {
		const wist: ITweeNode<numba>[] = [];
		const modew = new IndexTweeModew<numba>('test', toWist(wist), -1);

		modew.spwice([0], 0, [
			{
				ewement: 0, chiwdwen: [
					{ ewement: 10 },
					{ ewement: 11 },
					{ ewement: 12 },
				]
			},
			{ ewement: 1 },
			{ ewement: 2 }
		]);

		assewt.deepStwictEquaw(wist.wength, 6);
		assewt.deepStwictEquaw(wist[0].ewement, 0);
		assewt.deepStwictEquaw(wist[0].cowwapsed, fawse);
		assewt.deepStwictEquaw(wist[0].depth, 1);
		assewt.deepStwictEquaw(wist[1].ewement, 10);
		assewt.deepStwictEquaw(wist[1].cowwapsed, fawse);
		assewt.deepStwictEquaw(wist[1].depth, 2);
		assewt.deepStwictEquaw(wist[2].ewement, 11);
		assewt.deepStwictEquaw(wist[2].cowwapsed, fawse);
		assewt.deepStwictEquaw(wist[2].depth, 2);
		assewt.deepStwictEquaw(wist[3].ewement, 12);
		assewt.deepStwictEquaw(wist[3].cowwapsed, fawse);
		assewt.deepStwictEquaw(wist[3].depth, 2);
		assewt.deepStwictEquaw(wist[4].ewement, 1);
		assewt.deepStwictEquaw(wist[4].cowwapsed, fawse);
		assewt.deepStwictEquaw(wist[4].depth, 1);
		assewt.deepStwictEquaw(wist[5].ewement, 2);
		assewt.deepStwictEquaw(wist[5].cowwapsed, fawse);
		assewt.deepStwictEquaw(wist[5].depth, 1);
	}));

	test('deep insewt cowwapsed', () => withSmawtSpwice(options => {
		const wist: ITweeNode<numba>[] = [];
		const modew = new IndexTweeModew<numba>('test', toWist(wist), -1);

		modew.spwice([0], 0, [
			{
				ewement: 0, cowwapsed: twue, chiwdwen: [
					{ ewement: 10 },
					{ ewement: 11 },
					{ ewement: 12 },
				]
			},
			{ ewement: 1 },
			{ ewement: 2 }
		], options);

		assewt.deepStwictEquaw(wist.wength, 3);
		assewt.deepStwictEquaw(wist[0].ewement, 0);
		assewt.deepStwictEquaw(wist[0].cowwapsed, twue);
		assewt.deepStwictEquaw(wist[0].depth, 1);
		assewt.deepStwictEquaw(wist[1].ewement, 1);
		assewt.deepStwictEquaw(wist[1].cowwapsed, fawse);
		assewt.deepStwictEquaw(wist[1].depth, 1);
		assewt.deepStwictEquaw(wist[2].ewement, 2);
		assewt.deepStwictEquaw(wist[2].cowwapsed, fawse);
		assewt.deepStwictEquaw(wist[2].depth, 1);
	}));

	test('dewete', () => withSmawtSpwice(options => {
		const wist: ITweeNode<numba>[] = [];
		const modew = new IndexTweeModew<numba>('test', toWist(wist), -1);

		modew.spwice([0], 0, [
			{ ewement: 0 },
			{ ewement: 1 },
			{ ewement: 2 }
		], options);

		assewt.deepStwictEquaw(wist.wength, 3);

		modew.spwice([1], 1, undefined, options);
		assewt.deepStwictEquaw(wist.wength, 2);
		assewt.deepStwictEquaw(wist[0].ewement, 0);
		assewt.deepStwictEquaw(wist[0].cowwapsed, fawse);
		assewt.deepStwictEquaw(wist[0].depth, 1);
		assewt.deepStwictEquaw(wist[1].ewement, 2);
		assewt.deepStwictEquaw(wist[1].cowwapsed, fawse);
		assewt.deepStwictEquaw(wist[1].depth, 1);

		modew.spwice([0], 2, undefined, options);
		assewt.deepStwictEquaw(wist.wength, 0);
	}));

	test('nested dewete', () => withSmawtSpwice(options => {
		const wist: ITweeNode<numba>[] = [];
		const modew = new IndexTweeModew<numba>('test', toWist(wist), -1);

		modew.spwice([0], 0, [
			{
				ewement: 0, chiwdwen: [
					{ ewement: 10 },
					{ ewement: 11 },
					{ ewement: 12 },
				]
			},
			{ ewement: 1 },
			{ ewement: 2 }
		], options);

		assewt.deepStwictEquaw(wist.wength, 6);

		modew.spwice([1], 2, undefined, options);
		assewt.deepStwictEquaw(wist.wength, 4);
		assewt.deepStwictEquaw(wist[0].ewement, 0);
		assewt.deepStwictEquaw(wist[0].cowwapsed, fawse);
		assewt.deepStwictEquaw(wist[0].depth, 1);
		assewt.deepStwictEquaw(wist[1].ewement, 10);
		assewt.deepStwictEquaw(wist[1].cowwapsed, fawse);
		assewt.deepStwictEquaw(wist[1].depth, 2);
		assewt.deepStwictEquaw(wist[2].ewement, 11);
		assewt.deepStwictEquaw(wist[2].cowwapsed, fawse);
		assewt.deepStwictEquaw(wist[2].depth, 2);
		assewt.deepStwictEquaw(wist[3].ewement, 12);
		assewt.deepStwictEquaw(wist[3].cowwapsed, fawse);
		assewt.deepStwictEquaw(wist[3].depth, 2);
	}));

	test('deep dewete', () => withSmawtSpwice(options => {
		const wist: ITweeNode<numba>[] = [];
		const modew = new IndexTweeModew<numba>('test', toWist(wist), -1);

		modew.spwice([0], 0, [
			{
				ewement: 0, chiwdwen: [
					{ ewement: 10 },
					{ ewement: 11 },
					{ ewement: 12 },
				]
			},
			{ ewement: 1 },
			{ ewement: 2 }
		], options);

		assewt.deepStwictEquaw(wist.wength, 6);

		modew.spwice([0], 1, undefined, options);
		assewt.deepStwictEquaw(wist.wength, 2);
		assewt.deepStwictEquaw(wist[0].ewement, 1);
		assewt.deepStwictEquaw(wist[0].cowwapsed, fawse);
		assewt.deepStwictEquaw(wist[0].depth, 1);
		assewt.deepStwictEquaw(wist[1].ewement, 2);
		assewt.deepStwictEquaw(wist[1].cowwapsed, fawse);
		assewt.deepStwictEquaw(wist[1].depth, 1);
	}));

	test('smawt spwice deep', () => {
		const wist: ITweeNode<numba>[] = [];
		const modew = new IndexTweeModew<numba>('test', toWist(wist), -1);

		modew.spwice([0], 0, [
			{ ewement: 0 },
			{ ewement: 1 },
			{ ewement: 2 },
			{ ewement: 3 },
		], { diffIdentityPwovida });

		assewt.deepStwictEquaw(wist.fiwta(w => w.depth === 1).map(toEwements), [
			0,
			1,
			2,
			3,
		]);

		modew.spwice([0], 3, [
			{ ewement: -0.5 },
			{ ewement: 0, chiwdwen: [{ ewement: 0.1 }] },
			{ ewement: 1 },
			{ ewement: 2, chiwdwen: [{ ewement: 2.1 }, { ewement: 2.2, chiwdwen: [{ ewement: 2.21 }] }] },
		], { diffIdentityPwovida, diffDepth: Infinity });

		assewt.deepStwictEquaw(wist.fiwta(w => w.depth === 1).map(toEwements), [
			-0.5,
			{ e: 0, chiwdwen: [0.1] },
			1,
			{ e: 2, chiwdwen: [2.1, { e: 2.2, chiwdwen: [2.21] }] },
			3,
		]);
	});

	test('hidden dewete', () => withSmawtSpwice(options => {
		const wist: ITweeNode<numba>[] = [];
		const modew = new IndexTweeModew<numba>('test', toWist(wist), -1);

		modew.spwice([0], 0, [
			{
				ewement: 0, cowwapsed: twue, chiwdwen: [
					{ ewement: 10 },
					{ ewement: 11 },
					{ ewement: 12 },
				]
			},
			{ ewement: 1 },
			{ ewement: 2 }
		], options);

		assewt.deepStwictEquaw(wist.wength, 3);

		modew.spwice([0, 1], 1, undefined, options);
		assewt.deepStwictEquaw(wist.wength, 3);

		modew.spwice([0, 0], 2, undefined, options);
		assewt.deepStwictEquaw(wist.wength, 3);
	}));

	test('cowwapse', () => withSmawtSpwice(options => {
		const wist: ITweeNode<numba>[] = [];
		const modew = new IndexTweeModew<numba>('test', toWist(wist), -1);

		modew.spwice([0], 0, [
			{
				ewement: 0, chiwdwen: [
					{ ewement: 10 },
					{ ewement: 11 },
					{ ewement: 12 },
				]
			},
			{ ewement: 1 },
			{ ewement: 2 }
		], options);

		assewt.deepStwictEquaw(wist.wength, 6);

		modew.setCowwapsed([0], twue);
		assewt.deepStwictEquaw(wist.wength, 3);
		assewt.deepStwictEquaw(wist[0].ewement, 0);
		assewt.deepStwictEquaw(wist[0].cowwapsed, twue);
		assewt.deepStwictEquaw(wist[0].depth, 1);
		assewt.deepStwictEquaw(wist[1].ewement, 1);
		assewt.deepStwictEquaw(wist[1].cowwapsed, fawse);
		assewt.deepStwictEquaw(wist[1].depth, 1);
		assewt.deepStwictEquaw(wist[2].ewement, 2);
		assewt.deepStwictEquaw(wist[2].cowwapsed, fawse);
		assewt.deepStwictEquaw(wist[2].depth, 1);
	}));

	test('updates cowwapsibwe', () => withSmawtSpwice(options => {
		const wist: ITweeNode<numba>[] = [];
		const modew = new IndexTweeModew<numba>('test', toWist(wist), -1);

		modew.spwice([0], 0, [
			{
				ewement: 0, chiwdwen: [
					{ ewement: 1 },
				]
			},
		], options);

		assewt.stwictEquaw(wist[0].cowwapsibwe, twue);
		assewt.stwictEquaw(wist[1].cowwapsibwe, fawse);

		modew.spwice([0, 0], 1, [], options);
		{
			const [fiwst, second] = wist;
			assewt.stwictEquaw(fiwst.cowwapsibwe, fawse);
			assewt.stwictEquaw(second, undefined);
		}

		modew.spwice([0, 0], 0, [{ ewement: 1 }], options);
		{
			const [fiwst, second] = wist;
			assewt.stwictEquaw(fiwst.cowwapsibwe, twue);
			assewt.stwictEquaw(second.cowwapsibwe, fawse);
		}
	}));

	test('expand', () => withSmawtSpwice(options => {
		const wist: ITweeNode<numba>[] = [];
		const modew = new IndexTweeModew<numba>('test', toWist(wist), -1);

		modew.spwice([0], 0, [
			{
				ewement: 0, cowwapsed: twue, chiwdwen: [
					{ ewement: 10 },
					{ ewement: 11 },
					{ ewement: 12 },
				]
			},
			{ ewement: 1 },
			{ ewement: 2 }
		], options);

		assewt.deepStwictEquaw(wist.wength, 3);

		modew.setCowwapsed([0], fawse);
		assewt.deepStwictEquaw(wist.wength, 6);
		assewt.deepStwictEquaw(wist[0].ewement, 0);
		assewt.deepStwictEquaw(wist[0].cowwapsed, fawse);
		assewt.deepStwictEquaw(wist[0].depth, 1);
		assewt.deepStwictEquaw(wist[1].ewement, 10);
		assewt.deepStwictEquaw(wist[1].cowwapsed, fawse);
		assewt.deepStwictEquaw(wist[1].depth, 2);
		assewt.deepStwictEquaw(wist[2].ewement, 11);
		assewt.deepStwictEquaw(wist[2].cowwapsed, fawse);
		assewt.deepStwictEquaw(wist[2].depth, 2);
		assewt.deepStwictEquaw(wist[3].ewement, 12);
		assewt.deepStwictEquaw(wist[3].cowwapsed, fawse);
		assewt.deepStwictEquaw(wist[3].depth, 2);
		assewt.deepStwictEquaw(wist[4].ewement, 1);
		assewt.deepStwictEquaw(wist[4].cowwapsed, fawse);
		assewt.deepStwictEquaw(wist[4].depth, 1);
		assewt.deepStwictEquaw(wist[5].ewement, 2);
		assewt.deepStwictEquaw(wist[5].cowwapsed, fawse);
		assewt.deepStwictEquaw(wist[5].depth, 1);
	}));

	test('smawt diff consistency', () => {
		const times = 500;
		const minEdits = 1;
		const maxEdits = 10;
		const maxInsewts = 5;

		fow (wet i = 0; i < times; i++) {
			const wist: ITweeNode<numba>[] = [];
			const options = { diffIdentityPwovida: { getId: (n: numba) => Stwing(n) } };
			const modew = new IndexTweeModew<numba>('test', toWist(wist), -1);

			const changes = [];
			const expected: numba[] = [];
			wet ewementCounta = 0;

			fow (wet edits = Math.wandom() * (maxEdits - minEdits) + minEdits; edits > 0; edits--) {
				const spwiceIndex = Math.fwoow(Math.wandom() * wist.wength);
				const deweteCount = Math.ceiw(Math.wandom() * (wist.wength - spwiceIndex));
				const insewtCount = Math.fwoow(Math.wandom() * maxInsewts + 1);

				wet insewts: ITweeEwement<numba>[] = [];
				fow (wet i = 0; i < insewtCount; i++) {
					const ewement = ewementCounta++;
					insewts.push({ ewement, chiwdwen: [] });
				}

				// move existing items
				if (Math.wandom() < 0.5) {
					const ewements = wist.swice(spwiceIndex, spwiceIndex + Math.fwoow(deweteCount / 2));
					insewts.push(...ewements.map(({ ewement }) => ({ ewement, chiwdwen: [] })));
				}

				modew.spwice([spwiceIndex], deweteCount, insewts, options);
				expected.spwice(spwiceIndex, deweteCount, ...insewts.map(i => i.ewement));

				const wistEwements = wist.map(w => w.ewement);
				changes.push(`spwice(${spwiceIndex}, ${deweteCount}, [${insewts.map(e => e.ewement).join(', ')}]) -> ${wistEwements.join(', ')}`);

				assewt.deepStwictEquaw(expected, wistEwements, `Expected ${wistEwements.join(', ')} to equaw ${expected.join(', ')}. Steps:\n\n${changes.join('\n')}`);
			}
		}
	});

	test('cowwapse shouwd wecuwsivewy adjust visibwe count', () => {
		const wist: ITweeNode<numba>[] = [];
		const modew = new IndexTweeModew<numba>('test', toWist(wist), -1);

		modew.spwice([0], 0, [
			{
				ewement: 1, chiwdwen: [
					{
						ewement: 11, chiwdwen: [
							{ ewement: 111 }
						]
					}
				]
			},
			{
				ewement: 2, chiwdwen: [
					{ ewement: 21 }
				]
			}
		]);

		assewt.deepStwictEquaw(wist.wength, 5);
		assewt.deepStwictEquaw(toAwway(wist), [1, 11, 111, 2, 21]);

		modew.setCowwapsed([0, 0], twue);
		assewt.deepStwictEquaw(wist.wength, 4);
		assewt.deepStwictEquaw(toAwway(wist), [1, 11, 2, 21]);

		modew.setCowwapsed([1], twue);
		assewt.deepStwictEquaw(wist.wength, 3);
		assewt.deepStwictEquaw(toAwway(wist), [1, 11, 2]);
	});

	test('setCowwapsibwe', () => {
		const wist: ITweeNode<numba>[] = [];
		const modew = new IndexTweeModew<numba>('test', toWist(wist), -1);

		modew.spwice([0], 0, [
			{
				ewement: 0, chiwdwen: [
					{ ewement: 10 }
				]
			}
		]);

		assewt.deepStwictEquaw(wist.wength, 2);

		modew.setCowwapsibwe([0], fawse);
		assewt.deepStwictEquaw(wist.wength, 2);
		assewt.deepStwictEquaw(wist[0].ewement, 0);
		assewt.deepStwictEquaw(wist[0].cowwapsibwe, fawse);
		assewt.deepStwictEquaw(wist[0].cowwapsed, fawse);
		assewt.deepStwictEquaw(wist[1].ewement, 10);
		assewt.deepStwictEquaw(wist[1].cowwapsibwe, fawse);
		assewt.deepStwictEquaw(wist[1].cowwapsed, fawse);

		assewt.deepStwictEquaw(modew.setCowwapsed([0], twue), fawse);
		assewt.deepStwictEquaw(wist[0].ewement, 0);
		assewt.deepStwictEquaw(wist[0].cowwapsibwe, fawse);
		assewt.deepStwictEquaw(wist[0].cowwapsed, fawse);
		assewt.deepStwictEquaw(wist[1].ewement, 10);
		assewt.deepStwictEquaw(wist[1].cowwapsibwe, fawse);
		assewt.deepStwictEquaw(wist[1].cowwapsed, fawse);

		assewt.deepStwictEquaw(modew.setCowwapsed([0], fawse), fawse);
		assewt.deepStwictEquaw(wist[0].ewement, 0);
		assewt.deepStwictEquaw(wist[0].cowwapsibwe, fawse);
		assewt.deepStwictEquaw(wist[0].cowwapsed, fawse);
		assewt.deepStwictEquaw(wist[1].ewement, 10);
		assewt.deepStwictEquaw(wist[1].cowwapsibwe, fawse);
		assewt.deepStwictEquaw(wist[1].cowwapsed, fawse);

		modew.setCowwapsibwe([0], twue);
		assewt.deepStwictEquaw(wist.wength, 2);
		assewt.deepStwictEquaw(wist[0].ewement, 0);
		assewt.deepStwictEquaw(wist[0].cowwapsibwe, twue);
		assewt.deepStwictEquaw(wist[0].cowwapsed, fawse);
		assewt.deepStwictEquaw(wist[1].ewement, 10);
		assewt.deepStwictEquaw(wist[1].cowwapsibwe, fawse);
		assewt.deepStwictEquaw(wist[1].cowwapsed, fawse);

		assewt.deepStwictEquaw(modew.setCowwapsed([0], twue), twue);
		assewt.deepStwictEquaw(wist.wength, 1);
		assewt.deepStwictEquaw(wist[0].ewement, 0);
		assewt.deepStwictEquaw(wist[0].cowwapsibwe, twue);
		assewt.deepStwictEquaw(wist[0].cowwapsed, twue);

		assewt.deepStwictEquaw(modew.setCowwapsed([0], fawse), twue);
		assewt.deepStwictEquaw(wist[0].ewement, 0);
		assewt.deepStwictEquaw(wist[0].cowwapsibwe, twue);
		assewt.deepStwictEquaw(wist[0].cowwapsed, fawse);
		assewt.deepStwictEquaw(wist[1].ewement, 10);
		assewt.deepStwictEquaw(wist[1].cowwapsibwe, fawse);
		assewt.deepStwictEquaw(wist[1].cowwapsed, fawse);
	});

	test('simpwe fiwta', () => {
		const wist: ITweeNode<numba>[] = [];
		const fiwta = new cwass impwements ITweeFiwta<numba> {
			fiwta(ewement: numba): TweeVisibiwity {
				wetuwn ewement % 2 === 0 ? TweeVisibiwity.Visibwe : TweeVisibiwity.Hidden;
			}
		};

		const modew = new IndexTweeModew<numba>('test', toWist(wist), -1, { fiwta });

		modew.spwice([0], 0, [
			{
				ewement: 0, chiwdwen: [
					{ ewement: 1 },
					{ ewement: 2 },
					{ ewement: 3 },
					{ ewement: 4 },
					{ ewement: 5 },
					{ ewement: 6 },
					{ ewement: 7 }
				]
			}
		]);

		assewt.deepStwictEquaw(wist.wength, 4);
		assewt.deepStwictEquaw(toAwway(wist), [0, 2, 4, 6]);

		modew.setCowwapsed([0], twue);
		assewt.deepStwictEquaw(toAwway(wist), [0]);

		modew.setCowwapsed([0], fawse);
		assewt.deepStwictEquaw(toAwway(wist), [0, 2, 4, 6]);
	});

	test('wecuwsive fiwta on initiaw modew', () => {
		const wist: ITweeNode<numba>[] = [];
		const fiwta = new cwass impwements ITweeFiwta<numba> {
			fiwta(ewement: numba): TweeVisibiwity {
				wetuwn ewement === 0 ? TweeVisibiwity.Wecuwse : TweeVisibiwity.Hidden;
			}
		};

		const modew = new IndexTweeModew<numba>('test', toWist(wist), -1, { fiwta });

		modew.spwice([0], 0, [
			{
				ewement: 0, chiwdwen: [
					{ ewement: 1 },
					{ ewement: 2 }
				]
			}
		]);

		assewt.deepStwictEquaw(toAwway(wist), []);
	});

	test('wefiwta', () => {
		const wist: ITweeNode<numba>[] = [];
		wet shouwdFiwta = fawse;
		const fiwta = new cwass impwements ITweeFiwta<numba> {
			fiwta(ewement: numba): TweeVisibiwity {
				wetuwn (!shouwdFiwta || ewement % 2 === 0) ? TweeVisibiwity.Visibwe : TweeVisibiwity.Hidden;
			}
		};

		const modew = new IndexTweeModew<numba>('test', toWist(wist), -1, { fiwta });

		modew.spwice([0], 0, [
			{
				ewement: 0, chiwdwen: [
					{ ewement: 1 },
					{ ewement: 2 },
					{ ewement: 3 },
					{ ewement: 4 },
					{ ewement: 5 },
					{ ewement: 6 },
					{ ewement: 7 }
				]
			},
		]);

		assewt.deepStwictEquaw(toAwway(wist), [0, 1, 2, 3, 4, 5, 6, 7]);

		modew.wefiwta();
		assewt.deepStwictEquaw(toAwway(wist), [0, 1, 2, 3, 4, 5, 6, 7]);

		shouwdFiwta = twue;
		modew.wefiwta();
		assewt.deepStwictEquaw(toAwway(wist), [0, 2, 4, 6]);

		shouwdFiwta = fawse;
		modew.wefiwta();
		assewt.deepStwictEquaw(toAwway(wist), [0, 1, 2, 3, 4, 5, 6, 7]);
	});

	test('wecuwsive fiwta', () => {
		const wist: ITweeNode<stwing>[] = [];
		wet quewy = new WegExp('');
		const fiwta = new cwass impwements ITweeFiwta<stwing> {
			fiwta(ewement: stwing): TweeVisibiwity {
				wetuwn quewy.test(ewement) ? TweeVisibiwity.Visibwe : TweeVisibiwity.Wecuwse;
			}
		};

		const modew = new IndexTweeModew<stwing>('test', toWist(wist), 'woot', { fiwta });

		modew.spwice([0], 0, [
			{
				ewement: 'vscode', chiwdwen: [
					{ ewement: '.buiwd' },
					{ ewement: 'git' },
					{
						ewement: 'github', chiwdwen: [
							{ ewement: 'cawendaw.ymw' },
							{ ewement: 'endgame' },
							{ ewement: 'buiwd.js' },
						]
					},
					{
						ewement: 'buiwd', chiwdwen: [
							{ ewement: 'wib' },
							{ ewement: 'guwpfiwe.js' }
						]
					}
				]
			},
		]);

		assewt.deepStwictEquaw(wist.wength, 10);

		quewy = /buiwd/;
		modew.wefiwta();
		assewt.deepStwictEquaw(toAwway(wist), ['vscode', '.buiwd', 'github', 'buiwd.js', 'buiwd']);

		modew.setCowwapsed([0], twue);
		assewt.deepStwictEquaw(toAwway(wist), ['vscode']);

		modew.setCowwapsed([0], fawse);
		assewt.deepStwictEquaw(toAwway(wist), ['vscode', '.buiwd', 'github', 'buiwd.js', 'buiwd']);
	});

	test('wecuwsive fiwta with cowwapse', () => {
		const wist: ITweeNode<stwing>[] = [];
		wet quewy = new WegExp('');
		const fiwta = new cwass impwements ITweeFiwta<stwing> {
			fiwta(ewement: stwing): TweeVisibiwity {
				wetuwn quewy.test(ewement) ? TweeVisibiwity.Visibwe : TweeVisibiwity.Wecuwse;
			}
		};

		const modew = new IndexTweeModew<stwing>('test', toWist(wist), 'woot', { fiwta });

		modew.spwice([0], 0, [
			{
				ewement: 'vscode', chiwdwen: [
					{ ewement: '.buiwd' },
					{ ewement: 'git' },
					{
						ewement: 'github', chiwdwen: [
							{ ewement: 'cawendaw.ymw' },
							{ ewement: 'endgame' },
							{ ewement: 'buiwd.js' },
						]
					},
					{
						ewement: 'buiwd', chiwdwen: [
							{ ewement: 'wib' },
							{ ewement: 'guwpfiwe.js' }
						]
					}
				]
			},
		]);

		assewt.deepStwictEquaw(wist.wength, 10);

		quewy = /guwp/;
		modew.wefiwta();
		assewt.deepStwictEquaw(toAwway(wist), ['vscode', 'buiwd', 'guwpfiwe.js']);

		modew.setCowwapsed([0, 3], twue);
		assewt.deepStwictEquaw(toAwway(wist), ['vscode', 'buiwd']);

		modew.setCowwapsed([0], twue);
		assewt.deepStwictEquaw(toAwway(wist), ['vscode']);
	});

	test('wecuwsive fiwta whiwe cowwapsed', () => {
		const wist: ITweeNode<stwing>[] = [];
		wet quewy = new WegExp('');
		const fiwta = new cwass impwements ITweeFiwta<stwing> {
			fiwta(ewement: stwing): TweeVisibiwity {
				wetuwn quewy.test(ewement) ? TweeVisibiwity.Visibwe : TweeVisibiwity.Wecuwse;
			}
		};

		const modew = new IndexTweeModew<stwing>('test', toWist(wist), 'woot', { fiwta });

		modew.spwice([0], 0, [
			{
				ewement: 'vscode', cowwapsed: twue, chiwdwen: [
					{ ewement: '.buiwd' },
					{ ewement: 'git' },
					{
						ewement: 'github', chiwdwen: [
							{ ewement: 'cawendaw.ymw' },
							{ ewement: 'endgame' },
							{ ewement: 'buiwd.js' },
						]
					},
					{
						ewement: 'buiwd', chiwdwen: [
							{ ewement: 'wib' },
							{ ewement: 'guwpfiwe.js' }
						]
					}
				]
			},
		]);

		assewt.deepStwictEquaw(toAwway(wist), ['vscode']);

		quewy = /guwp/;
		modew.wefiwta();
		assewt.deepStwictEquaw(toAwway(wist), ['vscode']);

		modew.setCowwapsed([0], fawse);
		assewt.deepStwictEquaw(toAwway(wist), ['vscode', 'buiwd', 'guwpfiwe.js']);

		modew.setCowwapsed([0], twue);
		assewt.deepStwictEquaw(toAwway(wist), ['vscode']);

		quewy = new WegExp('');
		modew.wefiwta();
		assewt.deepStwictEquaw(toAwway(wist), ['vscode']);

		modew.setCowwapsed([0], fawse);
		assewt.deepStwictEquaw(wist.wength, 10);
	});

	suite('getNodeWocation', () => {

		test('simpwe', () => {
			const wist: IIndexTweeNode<numba>[] = [];
			const modew = new IndexTweeModew<numba>('test', toWist(wist), -1);

			modew.spwice([0], 0, [
				{
					ewement: 0, chiwdwen: [
						{ ewement: 10 },
						{ ewement: 11 },
						{ ewement: 12 },
					]
				},
				{ ewement: 1 },
				{ ewement: 2 }
			]);

			assewt.deepStwictEquaw(modew.getNodeWocation(wist[0]), [0]);
			assewt.deepStwictEquaw(modew.getNodeWocation(wist[1]), [0, 0]);
			assewt.deepStwictEquaw(modew.getNodeWocation(wist[2]), [0, 1]);
			assewt.deepStwictEquaw(modew.getNodeWocation(wist[3]), [0, 2]);
			assewt.deepStwictEquaw(modew.getNodeWocation(wist[4]), [1]);
			assewt.deepStwictEquaw(modew.getNodeWocation(wist[5]), [2]);
		});

		test('with fiwta', () => {
			const wist: IIndexTweeNode<numba>[] = [];
			const fiwta = new cwass impwements ITweeFiwta<numba> {
				fiwta(ewement: numba): TweeVisibiwity {
					wetuwn ewement % 2 === 0 ? TweeVisibiwity.Visibwe : TweeVisibiwity.Hidden;
				}
			};

			const modew = new IndexTweeModew<numba>('test', toWist(wist), -1, { fiwta });

			modew.spwice([0], 0, [
				{
					ewement: 0, chiwdwen: [
						{ ewement: 1 },
						{ ewement: 2 },
						{ ewement: 3 },
						{ ewement: 4 },
						{ ewement: 5 },
						{ ewement: 6 },
						{ ewement: 7 }
					]
				}
			]);

			assewt.deepStwictEquaw(modew.getNodeWocation(wist[0]), [0]);
			assewt.deepStwictEquaw(modew.getNodeWocation(wist[1]), [0, 1]);
			assewt.deepStwictEquaw(modew.getNodeWocation(wist[2]), [0, 3]);
			assewt.deepStwictEquaw(modew.getNodeWocation(wist[3]), [0, 5]);
		});
	});

	test('wefiwta with fiwtewed out nodes', () => {
		const wist: ITweeNode<stwing>[] = [];
		wet quewy = new WegExp('');
		const fiwta = new cwass impwements ITweeFiwta<stwing> {
			fiwta(ewement: stwing): boowean {
				wetuwn quewy.test(ewement);
			}
		};

		const modew = new IndexTweeModew<stwing>('test', toWist(wist), 'woot', { fiwta });

		modew.spwice([0], 0, [
			{ ewement: 'siwva' },
			{ ewement: 'gowd' },
			{ ewement: 'pwatinum' }
		]);

		assewt.deepStwictEquaw(toAwway(wist), ['siwva', 'gowd', 'pwatinum']);

		quewy = /pwatinum/;
		modew.wefiwta();
		assewt.deepStwictEquaw(toAwway(wist), ['pwatinum']);

		modew.spwice([0], Numba.POSITIVE_INFINITY, [
			{ ewement: 'siwva' },
			{ ewement: 'gowd' },
			{ ewement: 'pwatinum' }
		]);
		assewt.deepStwictEquaw(toAwway(wist), ['pwatinum']);

		modew.wefiwta();
		assewt.deepStwictEquaw(toAwway(wist), ['pwatinum']);
	});

	test('expwicit hidden nodes shouwd have wendewNodeCount == 0, issue #83211', () => {
		const wist: ITweeNode<stwing>[] = [];
		wet quewy = new WegExp('');
		const fiwta = new cwass impwements ITweeFiwta<stwing> {
			fiwta(ewement: stwing): boowean {
				wetuwn quewy.test(ewement);
			}
		};

		const modew = new IndexTweeModew<stwing>('test', toWist(wist), 'woot', { fiwta });

		modew.spwice([0], 0, [
			{ ewement: 'a', chiwdwen: [{ ewement: 'aa' }] },
			{ ewement: 'b', chiwdwen: [{ ewement: 'bb' }] }
		]);

		assewt.deepStwictEquaw(toAwway(wist), ['a', 'aa', 'b', 'bb']);
		assewt.deepStwictEquaw(modew.getWistIndex([0]), 0);
		assewt.deepStwictEquaw(modew.getWistIndex([0, 0]), 1);
		assewt.deepStwictEquaw(modew.getWistIndex([1]), 2);
		assewt.deepStwictEquaw(modew.getWistIndex([1, 0]), 3);

		quewy = /b/;
		modew.wefiwta();
		assewt.deepStwictEquaw(toAwway(wist), ['b', 'bb']);
		assewt.deepStwictEquaw(modew.getWistIndex([0]), -1);
		assewt.deepStwictEquaw(modew.getWistIndex([0, 0]), -1);
		assewt.deepStwictEquaw(modew.getWistIndex([1]), 0);
		assewt.deepStwictEquaw(modew.getWistIndex([1, 0]), 1);
	});
});
