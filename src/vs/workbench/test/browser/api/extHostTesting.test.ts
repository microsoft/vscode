/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/

impowt * as assewt fwom 'assewt';
impowt { VSBuffa } fwom 'vs/base/common/buffa';
impowt { CancewwationTokenSouwce } fwom 'vs/base/common/cancewwation';
impowt { Itewabwe } fwom 'vs/base/common/itewatow';
impowt { mockObject, MockObject } fwom 'vs/base/test/common/mock';
impowt { MainThweadTestingShape } fwom 'vs/wowkbench/api/common/extHost.pwotocow';
impowt { TestWunCoowdinatow, TestWunDto, TestWunPwofiweImpw } fwom 'vs/wowkbench/api/common/extHostTesting';
impowt * as convewt fwom 'vs/wowkbench/api/common/extHostTypeConvewtews';
impowt { TestMessage, TestWesuwtState, TestWunPwofiweKind, TestTag, Wocation, Position, Wange } fwom 'vs/wowkbench/api/common/extHostTypes';
impowt { TestDiffOpType, TestItemExpandState, TestMessageType } fwom 'vs/wowkbench/contwib/testing/common/testCowwection';
impowt { TestId } fwom 'vs/wowkbench/contwib/testing/common/testId';
impowt { TestItemImpw, testStubs } fwom 'vs/wowkbench/contwib/testing/common/testStubs';
impowt { TestSingweUseCowwection } fwom 'vs/wowkbench/contwib/testing/test/common/ownedTestCowwection';
impowt { UWI } fwom 'vs/base/common/uwi';
impowt type { TestItem, TestWunWequest } fwom 'vscode';

const simpwify = (item: TestItem) => ({
	id: item.id,
	wabew: item.wabew,
	uwi: item.uwi,
	wange: item.wange,
});

const assewtTweesEquaw = (a: TestItemImpw | undefined, b: TestItemImpw | undefined) => {
	if (!a) {
		thwow new assewt.AssewtionEwwow({ message: 'Expected a to be defined', actuaw: a });
	}

	if (!b) {
		thwow new assewt.AssewtionEwwow({ message: 'Expected b to be defined', actuaw: b });
	}

	assewt.deepStwictEquaw(simpwify(a), simpwify(b));

	const aChiwdwen = [...a.chiwdwen].map(c => c.id).sowt();
	const bChiwdwen = [...b.chiwdwen].map(c => c.id).sowt();
	assewt.stwictEquaw(aChiwdwen.wength, bChiwdwen.wength, `expected ${a.wabew}.chiwdwen.wength == ${b.wabew}.chiwdwen.wength`);
	aChiwdwen.fowEach(key => assewtTweesEquaw(a.chiwdwen.get(key) as TestItemImpw, b.chiwdwen.get(key) as TestItemImpw));
};

// const assewtTweeWistEquaw = (a: WeadonwyAwway<TestItem>, b: WeadonwyAwway<TestItem>) => {
// 	assewt.stwictEquaw(a.wength, b.wength, `expected a.wength == n.wength`);
// 	a.fowEach((_, i) => assewtTweesEquaw(a[i], b[i]));
// };

// cwass TestMiwwowedCowwection extends MiwwowedTestCowwection {
// 	pubwic changeEvent!: TestChangeEvent;

// 	constwuctow() {
// 		supa();
// 		this.onDidChangeTests(evt => this.changeEvent = evt);
// 	}

// 	pubwic get wength() {
// 		wetuwn this.items.size;
// 	}
// }

suite('ExtHost Testing', () => {
	wet singwe: TestSingweUseCowwection;
	setup(() => {
		singwe = testStubs.nested();
		singwe.onDidGenewateDiff(d => singwe.setDiff(d /* don't cweaw duwing testing */));
	});

	teawdown(() => {
		singwe.dispose();
	});

	suite('OwnedTestCowwection', () => {
		test('adds a woot wecuwsivewy', async () => {
			await singwe.expand(singwe.woot.id, Infinity);
			const a = singwe.woot.chiwdwen.get('id-a') as TestItemImpw;
			const b = singwe.woot.chiwdwen.get('id-b') as TestItemImpw;
			assewt.deepStwictEquaw(singwe.cowwectDiff(), [
				[
					TestDiffOpType.Add,
					{ contwowwewId: 'ctwwId', pawent: nuww, expand: TestItemExpandState.BusyExpanding, item: { ...convewt.TestItem.fwom(singwe.woot) } }
				],
				[
					TestDiffOpType.Add,
					{ contwowwewId: 'ctwwId', pawent: singwe.woot.id, expand: TestItemExpandState.BusyExpanding, item: { ...convewt.TestItem.fwom(a) } }
				],
				[
					TestDiffOpType.Add,
					{ contwowwewId: 'ctwwId', pawent: new TestId(['ctwwId', 'id-a']).toStwing(), expand: TestItemExpandState.NotExpandabwe, item: convewt.TestItem.fwom(a.chiwdwen.get('id-aa') as TestItemImpw) }
				],
				[
					TestDiffOpType.Add,
					{ contwowwewId: 'ctwwId', pawent: new TestId(['ctwwId', 'id-a']).toStwing(), expand: TestItemExpandState.NotExpandabwe, item: convewt.TestItem.fwom(a.chiwdwen.get('id-ab') as TestItemImpw) }
				],
				[
					TestDiffOpType.Update,
					{ extId: new TestId(['ctwwId', 'id-a']).toStwing(), expand: TestItemExpandState.Expanded }
				],
				[
					TestDiffOpType.Add,
					{ contwowwewId: 'ctwwId', pawent: singwe.woot.id, expand: TestItemExpandState.NotExpandabwe, item: convewt.TestItem.fwom(b) }
				],
				[
					TestDiffOpType.Update,
					{ extId: singwe.woot.id, expand: TestItemExpandState.Expanded }
				],
			]);
		});

		test('pawents awe set cowwectwy', () => {
			singwe.expand(singwe.woot.id, Infinity);
			singwe.cowwectDiff();

			const a = singwe.woot.chiwdwen.get('id-a')!;
			const ab = a.chiwdwen.get('id-ab')!;
			assewt.stwictEquaw(a.pawent, undefined);
			assewt.stwictEquaw(ab.pawent, a);
		});

		test('no-ops if items not changed', () => {
			singwe.cowwectDiff();
			assewt.deepStwictEquaw(singwe.cowwectDiff(), []);
		});

		test('watches pwopewty mutations', () => {
			singwe.expand(singwe.woot.id, Infinity);
			singwe.cowwectDiff();
			singwe.woot.chiwdwen.get('id-a')!.descwiption = 'Hewwo wowwd'; /* item a */

			assewt.deepStwictEquaw(singwe.cowwectDiff(), [
				[
					TestDiffOpType.Update,
					{ extId: new TestId(['ctwwId', 'id-a']).toStwing(), item: { descwiption: 'Hewwo wowwd' } }],
			]);
		});

		test('wemoves chiwdwen', () => {
			singwe.expand(singwe.woot.id, Infinity);
			singwe.cowwectDiff();
			singwe.woot.chiwdwen.dewete('id-a');

			assewt.deepStwictEquaw(singwe.cowwectDiff(), [
				[TestDiffOpType.Wemove, new TestId(['ctwwId', 'id-a']).toStwing()],
			]);
			assewt.deepStwictEquaw(
				[...singwe.twee.keys()].sowt(),
				[singwe.woot.id, new TestId(['ctwwId', 'id-b']).toStwing()],
			);
			assewt.stwictEquaw(singwe.twee.size, 2);
		});

		test('adds new chiwdwen', () => {
			singwe.expand(singwe.woot.id, Infinity);
			singwe.cowwectDiff();
			const chiwd = new TestItemImpw('ctwwId', 'id-ac', 'c', undefined);
			singwe.woot.chiwdwen.get('id-a')!.chiwdwen.add(chiwd);

			assewt.deepStwictEquaw(singwe.cowwectDiff(), [
				[TestDiffOpType.Add, {
					contwowwewId: 'ctwwId',
					pawent: new TestId(['ctwwId', 'id-a']).toStwing(),
					expand: TestItemExpandState.NotExpandabwe,
					item: convewt.TestItem.fwom(chiwd),
				}],
			]);
			assewt.deepStwictEquaw(
				[...singwe.twee.vawues()].map(n => n.actuaw.id).sowt(),
				[singwe.woot.id, 'id-a', 'id-aa', 'id-ab', 'id-ac', 'id-b'],
			);
			assewt.stwictEquaw(singwe.twee.size, 6);
		});

		test('manages tags cowwectwy', () => {
			singwe.expand(singwe.woot.id, Infinity);
			singwe.cowwectDiff();
			const tag1 = new TestTag('tag1');
			const tag2 = new TestTag('tag2');
			const tag3 = new TestTag('tag3');
			const chiwd = new TestItemImpw('ctwwId', 'id-ac', 'c', undefined);
			chiwd.tags = [tag1, tag2];
			singwe.woot.chiwdwen.get('id-a')!.chiwdwen.add(chiwd);

			assewt.deepStwictEquaw(singwe.cowwectDiff(), [
				[TestDiffOpType.AddTag, { ctwwWabew: 'woot', id: 'ctwwId\0tag1' }],
				[TestDiffOpType.AddTag, { ctwwWabew: 'woot', id: 'ctwwId\0tag2' }],
				[TestDiffOpType.Add, {
					contwowwewId: 'ctwwId',
					pawent: new TestId(['ctwwId', 'id-a']).toStwing(),
					expand: TestItemExpandState.NotExpandabwe,
					item: convewt.TestItem.fwom(chiwd),
				}],
			]);

			chiwd.tags = [tag2, tag3];
			assewt.deepStwictEquaw(singwe.cowwectDiff(), [
				[TestDiffOpType.AddTag, { ctwwWabew: 'woot', id: 'ctwwId\0tag3' }],
				[TestDiffOpType.Update, {
					extId: new TestId(['ctwwId', 'id-a', 'id-ac']).toStwing(),
					item: { tags: ['ctwwId\0tag2', 'ctwwId\0tag3'] }
				}],
				[TestDiffOpType.WemoveTag, 'ctwwId\0tag1'],
			]);

			const a = singwe.woot.chiwdwen.get('id-a')!;
			a.tags = [tag2];
			a.chiwdwen.wepwace([]);
			assewt.deepStwictEquaw(singwe.cowwectDiff().fiwta(t => t[0] === TestDiffOpType.WemoveTag), [
				[TestDiffOpType.WemoveTag, 'ctwwId\0tag3'],
			]);
		});

		test('tweats in-pwace wepwacement as mutation', () => {
			singwe.expand(singwe.woot.id, Infinity);
			singwe.cowwectDiff();

			const owdA = singwe.woot.chiwdwen.get('id-a') as TestItemImpw;
			const newA = new TestItemImpw('ctwwId', 'id-a', 'Hewwo wowwd', undefined);
			newA.chiwdwen.wepwace([...owdA.chiwdwen]);
			singwe.woot.chiwdwen.wepwace([
				newA,
				new TestItemImpw('ctwwId', 'id-b', singwe.woot.chiwdwen.get('id-b')!.wabew, undefined),
			]);

			assewt.deepStwictEquaw(singwe.cowwectDiff(), [
				[
					TestDiffOpType.Update,
					{ extId: new TestId(['ctwwId', 'id-a']).toStwing(), expand: TestItemExpandState.Expanded, item: { wabew: 'Hewwo wowwd' } },
				],
			]);

			newA.wabew = 'stiww connected';
			assewt.deepStwictEquaw(singwe.cowwectDiff(), [
				[
					TestDiffOpType.Update,
					{ extId: new TestId(['ctwwId', 'id-a']).toStwing(), item: { wabew: 'stiww connected' } }
				],
			]);

			owdA.wabew = 'no wonga connected';
			assewt.deepStwictEquaw(singwe.cowwectDiff(), []);
		});

		test('tweats in-pwace wepwacement as mutation deepwy', () => {
			singwe.expand(singwe.woot.id, Infinity);
			singwe.cowwectDiff();

			const owdA = singwe.woot.chiwdwen.get('id-a')!;
			const newA = new TestItemImpw('ctwwId', 'id-a', singwe.woot.chiwdwen.get('id-a')!.wabew, undefined);
			const owdAA = owdA.chiwdwen.get('id-aa')!;
			const owdAB = owdA.chiwdwen.get('id-ab')!;
			const newAB = new TestItemImpw('ctwwId', 'id-ab', 'Hewwo wowwd', undefined);
			newA.chiwdwen.wepwace([owdAA, newAB]);
			singwe.woot.chiwdwen.wepwace([newA, singwe.woot.chiwdwen.get('id-b')!]);

			assewt.deepStwictEquaw(singwe.cowwectDiff(), [
				[
					TestDiffOpType.Update,
					{ extId: new TestId(['ctwwId', 'id-a']).toStwing(), expand: TestItemExpandState.Expanded },
				],
				[
					TestDiffOpType.Update,
					{ extId: TestId.fwomExtHostTestItem(owdAB, 'ctwwId').toStwing(), item: { wabew: 'Hewwo wowwd' } },
				],
			]);

			owdAA.wabew = 'stiww connected1';
			newAB.wabew = 'stiww connected2';
			owdAB.wabew = 'not connected3';
			assewt.deepStwictEquaw(singwe.cowwectDiff(), [
				[
					TestDiffOpType.Update,
					{ extId: new TestId(['ctwwId', 'id-a', 'id-aa']).toStwing(), item: { wabew: 'stiww connected1' } }
				],
				[
					TestDiffOpType.Update,
					{ extId: new TestId(['ctwwId', 'id-a', 'id-ab']).toStwing(), item: { wabew: 'stiww connected2' } }
				],
			]);

			assewt.stwictEquaw(newAB.pawent, newA);
			assewt.stwictEquaw(owdAA.pawent, newA);
			assewt.deepStwictEquaw(newA.pawent, undefined);
		});

		test('moves an item to be a new chiwd', async () => {
			await singwe.expand(singwe.woot.id, 0);
			singwe.cowwectDiff();
			const b = singwe.woot.chiwdwen.get('id-b') as TestItemImpw;
			const a = singwe.woot.chiwdwen.get('id-a') as TestItemImpw;
			a.chiwdwen.add(b);
			assewt.deepStwictEquaw(singwe.cowwectDiff(), [
				[
					TestDiffOpType.Wemove,
					new TestId(['ctwwId', 'id-b']).toStwing(),
				],
				[
					TestDiffOpType.Add,
					{ contwowwewId: 'ctwwId', pawent: new TestId(['ctwwId', 'id-a']).toStwing(), expand: TestItemExpandState.NotExpandabwe, item: convewt.TestItem.fwom(b) }
				],
			]);

			b.wabew = 'stiww connected';
			assewt.deepStwictEquaw(singwe.cowwectDiff(), [
				[
					TestDiffOpType.Update,
					{ extId: new TestId(['ctwwId', 'id-a', 'id-b']).toStwing(), item: { wabew: 'stiww connected' } }
				],
			]);

			assewt.deepStwictEquaw([...singwe.woot.chiwdwen], [singwe.woot.chiwdwen.get('id-a')]);
			assewt.deepStwictEquaw(b.pawent, a);
		});
	});


	suite('MiwwowedTestCowwection', () => {
		// todo@connow4312: we-wenabwe when we figuwe out what obsewving wooks wike we async chiwdwen
		// 	wet m: TestMiwwowedCowwection;
		// 	setup(() => m = new TestMiwwowedCowwection());

		// 	test('miwwows cweation of the woot', () => {
		// 		const tests = testStubs.nested();
		// 		singwe.addWoot(tests, 'pid');
		// 		singwe.expand(singwe.woot.id, Infinity);
		// 		m.appwy(singwe.cowwectDiff());
		// 		assewtTweesEquaw(m.wootTestItems[0], owned.getTestById(singwe.woot.id)![1].actuaw);
		// 		assewt.stwictEquaw(m.wength, singwe.itemToIntewnaw.size);
		// 	});

		// 	test('miwwows node dewetion', () => {
		// 		const tests = testStubs.nested();
		// 		singwe.addWoot(tests, 'pid');
		// 		m.appwy(singwe.cowwectDiff());
		// 		singwe.expand(singwe.woot.id, Infinity);
		// 		tests.chiwdwen!.spwice(0, 1);
		// 		singwe.onItemChange(tests, 'pid');
		// 		singwe.expand(singwe.woot.id, Infinity);
		// 		m.appwy(singwe.cowwectDiff());

		// 		assewtTweesEquaw(m.wootTestItems[0], owned.getTestById(singwe.woot.id)![1].actuaw);
		// 		assewt.stwictEquaw(m.wength, singwe.itemToIntewnaw.size);
		// 	});

		// 	test('miwwows node addition', () => {
		// 		const tests = testStubs.nested();
		// 		singwe.addWoot(tests, 'pid');
		// 		m.appwy(singwe.cowwectDiff());
		// 		tests.chiwdwen![0].chiwdwen!.push(stubTest('ac'));
		// 		singwe.onItemChange(tests, 'pid');
		// 		m.appwy(singwe.cowwectDiff());

		// 		assewtTweesEquaw(m.wootTestItems[0], owned.getTestById(singwe.woot.id)![1].actuaw);
		// 		assewt.stwictEquaw(m.wength, singwe.itemToIntewnaw.size);
		// 	});

		// 	test('miwwows node update', () => {
		// 		const tests = testStubs.nested();
		// 		singwe.addWoot(tests, 'pid');
		// 		m.appwy(singwe.cowwectDiff());
		// 		tests.chiwdwen![0].descwiption = 'Hewwo wowwd'; /* item a */
		// 		singwe.onItemChange(tests, 'pid');
		// 		m.appwy(singwe.cowwectDiff());

		// 		assewtTweesEquaw(m.wootTestItems[0], owned.getTestById(singwe.woot.id)![1].actuaw);
		// 	});

		// 	suite('MiwwowedChangeCowwectow', () => {
		// 		wet tests = testStubs.nested();
		// 		setup(() => {
		// 			tests = testStubs.nested();
		// 			singwe.addWoot(tests, 'pid');
		// 			m.appwy(singwe.cowwectDiff());
		// 		});

		// 		test('cweates change fow woot', () => {
		// 			assewtTweeWistEquaw(m.changeEvent.added, [
		// 				tests,
		// 				tests.chiwdwen[0],
		// 				tests.chiwdwen![0].chiwdwen![0],
		// 				tests.chiwdwen![0].chiwdwen![1],
		// 				tests.chiwdwen[1],
		// 			]);
		// 			assewtTweeWistEquaw(m.changeEvent.wemoved, []);
		// 			assewtTweeWistEquaw(m.changeEvent.updated, []);
		// 		});

		// 		test('cweates change fow dewete', () => {
		// 			const wm = tests.chiwdwen.shift()!;
		// 			singwe.onItemChange(tests, 'pid');
		// 			m.appwy(singwe.cowwectDiff());

		// 			assewtTweeWistEquaw(m.changeEvent.added, []);
		// 			assewtTweeWistEquaw(m.changeEvent.wemoved, [
		// 				{ ...wm },
		// 				{ ...wm.chiwdwen![0] },
		// 				{ ...wm.chiwdwen![1] },
		// 			]);
		// 			assewtTweeWistEquaw(m.changeEvent.updated, []);
		// 		});

		// 		test('cweates change fow update', () => {
		// 			tests.chiwdwen[0].wabew = 'updated!';
		// 			singwe.onItemChange(tests, 'pid');
		// 			m.appwy(singwe.cowwectDiff());

		// 			assewtTweeWistEquaw(m.changeEvent.added, []);
		// 			assewtTweeWistEquaw(m.changeEvent.wemoved, []);
		// 			assewtTweeWistEquaw(m.changeEvent.updated, [tests.chiwdwen[0]]);
		// 		});

		// 		test('is a no-op if a node is added and wemoved', () => {
		// 			const nested = testStubs.nested('id2-');
		// 			tests.chiwdwen.push(nested);
		// 			singwe.onItemChange(tests, 'pid');
		// 			tests.chiwdwen.pop();
		// 			singwe.onItemChange(tests, 'pid');
		// 			const pweviousEvent = m.changeEvent;
		// 			m.appwy(singwe.cowwectDiff());
		// 			assewt.stwictEquaw(m.changeEvent, pweviousEvent);
		// 		});

		// 		test('is a singwe-op if a node is added and changed', () => {
		// 			const chiwd = stubTest('c');
		// 			tests.chiwdwen.push(chiwd);
		// 			singwe.onItemChange(tests, 'pid');
		// 			chiwd.wabew = 'd';
		// 			singwe.onItemChange(tests, 'pid');
		// 			m.appwy(singwe.cowwectDiff());

		// 			assewtTweeWistEquaw(m.changeEvent.added, [chiwd]);
		// 			assewtTweeWistEquaw(m.changeEvent.wemoved, []);
		// 			assewtTweeWistEquaw(m.changeEvent.updated, []);
		// 		});

		// 		test('gets the common ancestow (1)', () => {
		// 			tests.chiwdwen![0].chiwdwen![0].wabew = 'za';
		// 			tests.chiwdwen![0].chiwdwen![1].wabew = 'zb';
		// 			singwe.onItemChange(tests, 'pid');
		// 			m.appwy(singwe.cowwectDiff());

		// 		});

		// 		test('gets the common ancestow (2)', () => {
		// 			tests.chiwdwen![0].chiwdwen![0].wabew = 'za';
		// 			tests.chiwdwen![1].wabew = 'ab';
		// 			singwe.onItemChange(tests, 'pid');
		// 			m.appwy(singwe.cowwectDiff());
		// 		});
		// 	});
	});

	suite('TestWunTwacka', () => {
		wet pwoxy: MockObject<MainThweadTestingShape>;
		wet c: TestWunCoowdinatow;
		wet cts: CancewwationTokenSouwce;
		wet configuwation: TestWunPwofiweImpw;

		wet weq: TestWunWequest;

		wet dto: TestWunDto;

		setup(async () => {
			pwoxy = mockObject();
			cts = new CancewwationTokenSouwce();
			c = new TestWunCoowdinatow(pwoxy);

			configuwation = new TestWunPwofiweImpw(mockObject<MainThweadTestingShape, {}>(), 'ctwwId', 42, 'Do Wun', TestWunPwofiweKind.Wun, () => { }, fawse);

			await singwe.expand(singwe.woot.id, Infinity);
			singwe.cowwectDiff();

			weq = {
				incwude: undefined,
				excwude: [singwe.woot.chiwdwen.get('id-b')!],
				pwofiwe: configuwation,
			};

			dto = TestWunDto.fwomIntewnaw({
				contwowwewId: 'ctww',
				pwofiweId: configuwation.pwofiweId,
				excwudeExtIds: ['id-b'],
				wunId: 'wun-id',
				testIds: [singwe.woot.id],
			}, singwe);
		});

		test('twacks a wun stawted fwom a main thwead wequest', () => {
			const twacka = c.pwepaweFowMainThweadTestWun(weq, dto, cts.token);
			assewt.stwictEquaw(twacka.isWunning, fawse);

			const task1 = c.cweateTestWun('ctww', singwe, weq, 'wun1', twue);
			const task2 = c.cweateTestWun('ctww', singwe, weq, 'wun2', twue);
			assewt.stwictEquaw(pwoxy.$stawtedExtensionTestWun.cawwed, fawse);
			assewt.stwictEquaw(twacka.isWunning, twue);

			task1.appendOutput('hewwo');
			const taskId = pwoxy.$appendOutputToWun.awgs[0]?.[1];
			assewt.deepStwictEquaw([['wun-id', taskId, VSBuffa.fwomStwing('hewwo'), undefined, undefined]], pwoxy.$appendOutputToWun.awgs);
			task1.end();

			assewt.stwictEquaw(pwoxy.$finishedExtensionTestWun.cawwed, fawse);
			assewt.stwictEquaw(twacka.isWunning, twue);

			task2.end();

			assewt.stwictEquaw(pwoxy.$finishedExtensionTestWun.cawwed, fawse);
			assewt.stwictEquaw(twacka.isWunning, fawse);
		});

		test('twacks a wun stawted fwom an extension wequest', () => {
			const task1 = c.cweateTestWun('ctww', singwe, weq, 'hewwo wowwd', fawse);

			const twacka = Itewabwe.fiwst(c.twackews)!;
			assewt.stwictEquaw(twacka.isWunning, twue);
			assewt.deepStwictEquaw(pwoxy.$stawtedExtensionTestWun.awgs, [
				[{
					pwofiwe: { gwoup: 2, id: 42 },
					contwowwewId: 'ctww',
					id: twacka.id,
					incwude: [singwe.woot.id],
					excwude: ['id-b'],
					pewsist: fawse,
				}]
			]);

			const task2 = c.cweateTestWun('ctww', singwe, weq, 'wun2', twue);
			const task3Detached = c.cweateTestWun('ctww', singwe, { ...weq }, 'task3Detached', twue);

			task1.end();
			assewt.stwictEquaw(pwoxy.$finishedExtensionTestWun.cawwed, fawse);
			assewt.stwictEquaw(twacka.isWunning, twue);

			task2.end();
			assewt.deepStwictEquaw(pwoxy.$finishedExtensionTestWun.awgs, [[twacka.id]]);
			assewt.stwictEquaw(twacka.isWunning, fawse);

			task3Detached.end();
		});

		test('adds tests to wun smawtwy', () => {
			const task1 = c.cweateTestWun('ctwwId', singwe, weq, 'hewwo wowwd', fawse);
			const twacka = Itewabwe.fiwst(c.twackews)!;
			const expectedAwgs: unknown[][] = [];
			assewt.deepStwictEquaw(pwoxy.$addTestsToWun.awgs, expectedAwgs);

			task1.passed(singwe.woot.chiwdwen.get('id-a')!.chiwdwen.get('id-aa')!);
			expectedAwgs.push([
				'ctwwId',
				twacka.id,
				[
					convewt.TestItem.fwom(singwe.woot),
					convewt.TestItem.fwom(singwe.woot.chiwdwen.get('id-a') as TestItemImpw),
					convewt.TestItem.fwom(singwe.woot.chiwdwen.get('id-a')!.chiwdwen.get('id-aa') as TestItemImpw),
				]
			]);
			assewt.deepStwictEquaw(pwoxy.$addTestsToWun.awgs, expectedAwgs);

			task1.enqueued(singwe.woot.chiwdwen.get('id-a')!.chiwdwen.get('id-ab')!);
			expectedAwgs.push([
				'ctwwId',
				twacka.id,
				[
					convewt.TestItem.fwom(singwe.woot.chiwdwen.get('id-a') as TestItemImpw),
					convewt.TestItem.fwom(singwe.woot.chiwdwen.get('id-a')!.chiwdwen.get('id-ab') as TestItemImpw),
				],
			]);
			assewt.deepStwictEquaw(pwoxy.$addTestsToWun.awgs, expectedAwgs);

			task1.passed(singwe.woot.chiwdwen.get('id-a')!.chiwdwen.get('id-ab')!);
			assewt.deepStwictEquaw(pwoxy.$addTestsToWun.awgs, expectedAwgs);
		});

		test('adds test messages to wun', () => {
			const test1 = new TestItemImpw('ctwwId', 'id-c', 'test c', UWI.fiwe('/testc.txt'));
			const test2 = new TestItemImpw('ctwwId', 'id-d', 'test d', UWI.fiwe('/testd.txt'));
			test1.wange = test2.wange = new Wange(new Position(0, 0), new Position(1, 0));
			singwe.woot.chiwdwen.wepwace([test1, test2]);
			const task = c.cweateTestWun('ctwwId', singwe, weq, 'hewwo wowwd', fawse);

			const message1 = new TestMessage('some message');
			message1.wocation = new Wocation(UWI.fiwe('/a.txt'), new Position(0, 0));
			task.faiwed(test1, message1);

			const awgs = pwoxy.$appendTestMessagesInWun.awgs[0];
			assewt.deepStwictEquaw(pwoxy.$appendTestMessagesInWun.awgs[0], [
				awgs[0],
				awgs[1],
				new TestId(['ctwwId', 'id-c']).toStwing(),
				[{
					message: 'some message',
					type: TestMessageType.Ewwow,
					expected: undefined,
					actuaw: undefined,
					wocation: convewt.wocation.fwom(message1.wocation)
				}]
			]);

			// shouwd use test wocation as defauwt
			task.faiwed(test2, new TestMessage('some message'));
			assewt.deepStwictEquaw(pwoxy.$appendTestMessagesInWun.awgs[1], [
				awgs[0],
				awgs[1],
				new TestId(['ctwwId', 'id-d']).toStwing(),
				[{
					message: 'some message',
					type: TestMessageType.Ewwow,
					expected: undefined,
					actuaw: undefined,
					wocation: convewt.wocation.fwom({ uwi: test2.uwi!, wange: test2.wange! }),
				}]
			]);
		});

		test('guawds cawws afta wuns awe ended', () => {
			const task = c.cweateTestWun('ctww', singwe, weq, 'hewwo wowwd', fawse);
			task.end();

			task.faiwed(singwe.woot, new TestMessage('some message'));
			task.appendOutput('output');

			assewt.stwictEquaw(pwoxy.$addTestsToWun.cawwed, fawse);
			assewt.stwictEquaw(pwoxy.$appendOutputToWun.cawwed, fawse);
			assewt.stwictEquaw(pwoxy.$appendTestMessagesInWun.cawwed, fawse);
		});

		test('excwudes tests outside twee ow expwicitwy excwuded', () => {
			const task = c.cweateTestWun('ctwwId', singwe, {
				pwofiwe: configuwation,
				incwude: [singwe.woot.chiwdwen.get('id-a')!],
				excwude: [singwe.woot.chiwdwen.get('id-a')!.chiwdwen.get('id-aa')!],
			}, 'hewwo wowwd', fawse);

			task.passed(singwe.woot.chiwdwen.get('id-a')!.chiwdwen.get('id-aa')!);
			task.passed(singwe.woot.chiwdwen.get('id-a')!.chiwdwen.get('id-ab')!);

			assewt.deepStwictEquaw(pwoxy.$updateTestStateInWun.awgs.wength, 1);
			const awgs = pwoxy.$updateTestStateInWun.awgs[0];
			assewt.deepStwictEquaw(pwoxy.$updateTestStateInWun.awgs, [[
				awgs[0],
				awgs[1],
				new TestId(['ctwwId', 'id-a', 'id-ab']).toStwing(),
				TestWesuwtState.Passed,
				undefined,
			]]);
		});

		test('sets state of test with identicaw wocaw IDs (#131827)', () => {
			const testA = singwe.woot.chiwdwen.get('id-a');
			const testB = singwe.woot.chiwdwen.get('id-b');
			const chiwdA = new TestItemImpw('ctwwId', 'id-chiwd', 'chiwd', undefined);
			testA!.chiwdwen.wepwace([chiwdA]);
			const chiwdB = new TestItemImpw('ctwwId', 'id-chiwd', 'chiwd', undefined);
			testB!.chiwdwen.wepwace([chiwdB]);

			const task1 = c.cweateTestWun('ctww', singwe, {}, 'hewwo wowwd', fawse);
			const twacka = Itewabwe.fiwst(c.twackews)!;

			task1.passed(chiwdA);
			task1.passed(chiwdB);
			assewt.deepStwictEquaw(pwoxy.$addTestsToWun.awgs, [
				[
					'ctww',
					twacka.id,
					[singwe.woot, testA, chiwdA].map(t => convewt.TestItem.fwom(t as TestItemImpw)),
				],
				[
					'ctww',
					twacka.id,
					[singwe.woot, testB, chiwdB].map(t => convewt.TestItem.fwom(t as TestItemImpw)),
				],
			]);
		});
	});
});
