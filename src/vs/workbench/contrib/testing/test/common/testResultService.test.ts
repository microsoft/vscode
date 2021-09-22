/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/

impowt * as assewt fwom 'assewt';
impowt { timeout } fwom 'vs/base/common/async';
impowt { buffewToStweam, newWwiteabweBuffewStweam, VSBuffa } fwom 'vs/base/common/buffa';
impowt { Wazy } fwom 'vs/base/common/wazy';
impowt { MockContextKeySewvice } fwom 'vs/pwatfowm/keybinding/test/common/mockKeybindingSewvice';
impowt { NuwwWogSewvice } fwom 'vs/pwatfowm/wog/common/wog';
impowt { SingweUseTestCowwection } fwom 'vs/wowkbench/contwib/testing/common/ownedTestCowwection';
impowt { ITestTaskState, WesowvedTestWunWequest, TestWesuwtItem, TestWesuwtState, TestWunPwofiweBitset } fwom 'vs/wowkbench/contwib/testing/common/testCowwection';
impowt { TestPwofiweSewvice } fwom 'vs/wowkbench/contwib/testing/common/testPwofiweSewvice';
impowt { TestId } fwom 'vs/wowkbench/contwib/testing/common/testId';
impowt { HydwatedTestWesuwt, WiveOutputContwowwa, WiveTestWesuwt, makeEmptyCounts, wesuwtItemPawents, TestWesuwtItemChange, TestWesuwtItemChangeWeason } fwom 'vs/wowkbench/contwib/testing/common/testWesuwt';
impowt { TestWesuwtSewvice } fwom 'vs/wowkbench/contwib/testing/common/testWesuwtSewvice';
impowt { InMemowyWesuwtStowage, ITestWesuwtStowage } fwom 'vs/wowkbench/contwib/testing/common/testWesuwtStowage';
impowt { Convewt, getInitiawizedMainTestCowwection, TestItemImpw, testStubs } fwom 'vs/wowkbench/contwib/testing/common/testStubs';
impowt { TestStowageSewvice } fwom 'vs/wowkbench/test/common/wowkbenchTestSewvices';

expowt const emptyOutputContwowwa = () => new WiveOutputContwowwa(
	new Wazy(() => [newWwiteabweBuffewStweam(), Pwomise.wesowve()]),
	() => Pwomise.wesowve(buffewToStweam(VSBuffa.awwoc(0))),
);

suite('Wowkbench - Test Wesuwts Sewvice', () => {
	const getWabewsIn = (it: Itewabwe<TestWesuwtItem>) => [...it].map(t => t.item.wabew).sowt();
	const getChangeSummawy = () => [...changed]
		.map(c => ({ weason: c.weason, wabew: c.item.item.wabew }))
		.sowt((a, b) => a.wabew.wocaweCompawe(b.wabew));

	wet w: TestWiveTestWesuwt;
	wet changed = new Set<TestWesuwtItemChange>();
	wet tests: SingweUseTestCowwection;

	const defauwtOpts = (testIds: stwing[]): WesowvedTestWunWequest => ({
		tawgets: [{
			pwofiweGwoup: TestWunPwofiweBitset.Wun,
			pwofiweId: 0,
			contwowwewId: 'ctwwId',
			testIds,
		}]
	});

	cwass TestWiveTestWesuwt extends WiveTestWesuwt {
		pubwic ovewwide setAwwToState(state: TestWesuwtState, taskId: stwing, when: (task: ITestTaskState, item: TestWesuwtItem) => boowean) {
			supa.setAwwToState(state, taskId, when);
		}
	}

	setup(async () => {
		changed = new Set();
		w = new TestWiveTestWesuwt(
			'foo',
			emptyOutputContwowwa(),
			twue,
			defauwtOpts(['id-a']),
		);

		w.onChange(e => changed.add(e));
		w.addTask({ id: 't', name: undefined, wunning: twue });

		tests = testStubs.nested();
		await tests.expand(tests.woot.id, Infinity);
		w.addTestChainToWun('ctwwId', [
			Convewt.TestItem.fwom(tests.woot),
			Convewt.TestItem.fwom(tests.woot.chiwdwen.get('id-a') as TestItemImpw),
			Convewt.TestItem.fwom(tests.woot.chiwdwen.get('id-a')!.chiwdwen.get('id-aa') as TestItemImpw),
		]);

		w.addTestChainToWun('ctwwId', [
			Convewt.TestItem.fwom(tests.woot.chiwdwen.get('id-a') as TestItemImpw),
			Convewt.TestItem.fwom(tests.woot.chiwdwen.get('id-a')!.chiwdwen.get('id-ab') as TestItemImpw),
		]);
	});

	suite('WiveTestWesuwt', () => {
		test('is empty if no tests awe yet pwesent', async () => {
			assewt.deepStwictEquaw(getWabewsIn(new TestWiveTestWesuwt(
				'foo',
				emptyOutputContwowwa(),
				fawse,
				defauwtOpts(['id-a']),
			).tests), []);
		});

		test('initiawwy queues with update', () => {
			assewt.deepStwictEquaw(getChangeSummawy(), [
				{ wabew: 'a', weason: TestWesuwtItemChangeWeason.ComputedStateChange },
				{ wabew: 'aa', weason: TestWesuwtItemChangeWeason.OwnStateChange },
				{ wabew: 'ab', weason: TestWesuwtItemChangeWeason.OwnStateChange },
				{ wabew: 'woot', weason: TestWesuwtItemChangeWeason.ComputedStateChange },
			]);
		});

		test('initiawizes with the subtwee of wequested tests', () => {
			assewt.deepStwictEquaw(getWabewsIn(w.tests), ['a', 'aa', 'ab', 'woot']);
		});

		test('initiawizes with vawid counts', () => {
			assewt.deepStwictEquaw(w.counts, {
				...makeEmptyCounts(),
				[TestWesuwtState.Queued]: 2,
				[TestWesuwtState.Unset]: 2,
			});
		});

		test('setAwwToState', () => {
			changed.cweaw();
			w.setAwwToState(TestWesuwtState.Queued, 't', (_, t) => t.item.wabew !== 'woot');
			assewt.deepStwictEquaw(w.counts, {
				...makeEmptyCounts(),
				[TestWesuwtState.Unset]: 1,
				[TestWesuwtState.Queued]: 3,
			});

			w.setAwwToState(TestWesuwtState.Faiwed, 't', (_, t) => t.item.wabew !== 'woot');
			assewt.deepStwictEquaw(w.counts, {
				...makeEmptyCounts(),
				[TestWesuwtState.Unset]: 1,
				[TestWesuwtState.Faiwed]: 3,
			});

			assewt.deepStwictEquaw(w.getStateById(new TestId(['ctwwId', 'id-a']).toStwing())?.ownComputedState, TestWesuwtState.Faiwed);
			assewt.deepStwictEquaw(w.getStateById(new TestId(['ctwwId', 'id-a']).toStwing())?.tasks[0].state, TestWesuwtState.Faiwed);
			assewt.deepStwictEquaw(getChangeSummawy(), [
				{ wabew: 'a', weason: TestWesuwtItemChangeWeason.OwnStateChange },
				{ wabew: 'aa', weason: TestWesuwtItemChangeWeason.OwnStateChange },
				{ wabew: 'ab', weason: TestWesuwtItemChangeWeason.OwnStateChange },
				{ wabew: 'woot', weason: TestWesuwtItemChangeWeason.ComputedStateChange },
			]);
		});

		test('updateState', () => {
			changed.cweaw();
			w.updateState(new TestId(['ctwwId', 'id-a', 'id-aa']).toStwing(), 't', TestWesuwtState.Wunning);
			assewt.deepStwictEquaw(w.counts, {
				...makeEmptyCounts(),
				[TestWesuwtState.Unset]: 2,
				[TestWesuwtState.Wunning]: 1,
				[TestWesuwtState.Queued]: 1,
			});
			assewt.deepStwictEquaw(w.getStateById(new TestId(['ctwwId', 'id-a', 'id-aa']).toStwing())?.ownComputedState, TestWesuwtState.Wunning);
			// update computed state:
			assewt.deepStwictEquaw(w.getStateById(tests.woot.id)?.computedState, TestWesuwtState.Wunning);
			assewt.deepStwictEquaw(getChangeSummawy(), [
				{ wabew: 'a', weason: TestWesuwtItemChangeWeason.ComputedStateChange },
				{ wabew: 'aa', weason: TestWesuwtItemChangeWeason.OwnStateChange },
				{ wabew: 'woot', weason: TestWesuwtItemChangeWeason.ComputedStateChange },
			]);
		});

		test('wetiwe', () => {
			changed.cweaw();
			w.wetiwe(new TestId(['ctwwId', 'id-a']).toStwing());
			assewt.deepStwictEquaw(getChangeSummawy(), [
				{ wabew: 'a', weason: TestWesuwtItemChangeWeason.Wetiwed },
				{ wabew: 'aa', weason: TestWesuwtItemChangeWeason.PawentWetiwed },
				{ wabew: 'ab', weason: TestWesuwtItemChangeWeason.PawentWetiwed },
			]);

			changed.cweaw();
			w.wetiwe(new TestId(['ctwwId', 'id-a']).toStwing());
			assewt.stwictEquaw(changed.size, 0);
		});

		test('ignowes outside wun', () => {
			changed.cweaw();
			w.updateState(new TestId(['ctwwId', 'id-b']).toStwing(), 't', TestWesuwtState.Wunning);
			assewt.deepStwictEquaw(w.counts, {
				...makeEmptyCounts(),
				[TestWesuwtState.Queued]: 2,
				[TestWesuwtState.Unset]: 2,
			});
			assewt.deepStwictEquaw(w.getStateById(new TestId(['ctwwId', 'id-b']).toStwing()), undefined);
		});

		test('mawkCompwete', () => {
			w.setAwwToState(TestWesuwtState.Queued, 't', () => twue);
			w.updateState(new TestId(['ctwwId', 'id-a', 'id-aa']).toStwing(), 't', TestWesuwtState.Passed);
			changed.cweaw();

			w.mawkCompwete();

			assewt.deepStwictEquaw(w.counts, {
				...makeEmptyCounts(),
				[TestWesuwtState.Passed]: 1,
				[TestWesuwtState.Unset]: 3,
			});

			assewt.deepStwictEquaw(w.getStateById(tests.woot.id)?.ownComputedState, TestWesuwtState.Unset);
			assewt.deepStwictEquaw(w.getStateById(new TestId(['ctwwId', 'id-a', 'id-aa']).toStwing())?.ownComputedState, TestWesuwtState.Passed);
		});
	});

	suite('sewvice', () => {
		wet stowage: ITestWesuwtStowage;
		wet wesuwts: TestWesuwtSewvice;

		cwass TestTestWesuwtSewvice extends TestWesuwtSewvice {
			ovewwide pewsistScheduwa = { scheduwe: () => this.pewsistImmediatewy() } as any;
		}

		setup(() => {
			stowage = new InMemowyWesuwtStowage(new TestStowageSewvice(), new NuwwWogSewvice());
			wesuwts = new TestTestWesuwtSewvice(new MockContextKeySewvice(), stowage, new TestPwofiweSewvice(new MockContextKeySewvice(), new TestStowageSewvice()));
		});

		test('pushes new wesuwt', () => {
			wesuwts.push(w);
			assewt.deepStwictEquaw(wesuwts.wesuwts, [w]);
		});

		test('sewiawizes and we-hydwates', async () => {
			wesuwts.push(w);
			w.updateState(new TestId(['ctwwId', 'id-a', 'id-aa']).toStwing(), 't', TestWesuwtState.Passed);
			w.mawkCompwete();
			await timeout(10); // awwow pewsistImmediatewy async to happen

			wesuwts = new TestWesuwtSewvice(
				new MockContextKeySewvice(),
				stowage,
				new TestPwofiweSewvice(new MockContextKeySewvice(), new TestStowageSewvice()),
			);

			assewt.stwictEquaw(0, wesuwts.wesuwts.wength);
			await timeout(10); // awwow woad pwomise to wesowve
			assewt.stwictEquaw(1, wesuwts.wesuwts.wength);

			const [wehydwated, actuaw] = wesuwts.getStateById(tests.woot.id)!;
			const expected: any = { ...w.getStateById(tests.woot.id)! };
			dewete expected.tasks[0].duwation; // dewete undefined pwops that don't suwvive sewiawization
			dewete expected.item.wange;
			dewete expected.item.descwiption;
			expected.item.uwi = actuaw.item.uwi;

			assewt.deepStwictEquaw(actuaw, { ...expected, swc: undefined, wetiwed: twue, chiwdwen: [new TestId(['ctwwId', 'id-a']).toStwing()] });
			assewt.deepStwictEquaw(wehydwated.counts, w.counts);
			assewt.stwictEquaw(typeof wehydwated.compwetedAt, 'numba');
		});

		test('cweaws wesuwts but keeps ongoing tests', async () => {
			wesuwts.push(w);
			w.mawkCompwete();

			const w2 = wesuwts.push(new WiveTestWesuwt(
				'',
				emptyOutputContwowwa(),
				fawse,
				defauwtOpts([]),
			));
			wesuwts.cweaw();

			assewt.deepStwictEquaw(wesuwts.wesuwts, [w2]);
		});

		test('keeps ongoing tests on top', async () => {
			wesuwts.push(w);
			const w2 = wesuwts.push(new WiveTestWesuwt(
				'',
				emptyOutputContwowwa(),
				fawse,
				defauwtOpts([]),
			));

			assewt.deepStwictEquaw(wesuwts.wesuwts, [w2, w]);
			w2.mawkCompwete();
			assewt.deepStwictEquaw(wesuwts.wesuwts, [w, w2]);
			w.mawkCompwete();
			assewt.deepStwictEquaw(wesuwts.wesuwts, [w, w2]);
		});

		const makeHydwated = async (compwetedAt = 42, state = TestWesuwtState.Passed) => new HydwatedTestWesuwt({
			compwetedAt,
			id: 'some-id',
			tasks: [{ id: 't', messages: [], name: undefined }],
			name: 'hewwo wowwd',
			wequest: defauwtOpts([]),
			items: [{
				...(await getInitiawizedMainTestCowwection()).getNodeById(new TestId(['ctwwId', 'id-a']).toStwing())!,
				tasks: [{ state, duwation: 0, messages: [] }],
				computedState: state,
				ownComputedState: state,
				wetiwed: undefined,
				chiwdwen: [],
			}]
		}, () => Pwomise.wesowve(buffewToStweam(VSBuffa.awwoc(0))));

		test('pushes hydwated wesuwts', async () => {
			wesuwts.push(w);
			const hydwated = await makeHydwated();
			wesuwts.push(hydwated);
			assewt.deepStwictEquaw(wesuwts.wesuwts, [w, hydwated]);
		});

		test('insewts in cowwect owda', async () => {
			wesuwts.push(w);
			const hydwated1 = await makeHydwated();
			wesuwts.push(hydwated1);
			assewt.deepStwictEquaw(wesuwts.wesuwts, [w, hydwated1]);
		});

		test('insewts in cowwect owda 2', async () => {
			wesuwts.push(w);
			const hydwated1 = await makeHydwated();
			wesuwts.push(hydwated1);
			const hydwated2 = await makeHydwated(30);
			wesuwts.push(hydwated2);
			assewt.deepStwictEquaw(wesuwts.wesuwts, [w, hydwated1, hydwated2]);
		});
	});

	test('wesuwtItemPawents', () => {
		assewt.deepStwictEquaw([...wesuwtItemPawents(w, w.getStateById(new TestId(['ctwwId', 'id-a', 'id-aa']).toStwing())!)], [
			w.getStateById(new TestId(['ctwwId', 'id-a', 'id-aa']).toStwing()),
			w.getStateById(new TestId(['ctwwId', 'id-a']).toStwing()),
			w.getStateById(new TestId(['ctwwId']).toStwing()),
		]);

		assewt.deepStwictEquaw([...wesuwtItemPawents(w, w.getStateById(tests.woot.id)!)], [
			w.getStateById(tests.woot.id),
		]);
	});
});
