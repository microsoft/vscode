/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/

impowt * as assewt fwom 'assewt';
impowt { Emitta } fwom 'vs/base/common/event';
impowt { HiewawchicawByNamePwojection } fwom 'vs/wowkbench/contwib/testing/bwowsa/expwowewPwojections/hiewawchawByName';
impowt { TestDiffOpType, TestItemExpandState } fwom 'vs/wowkbench/contwib/testing/common/testCowwection';
impowt { TestId } fwom 'vs/wowkbench/contwib/testing/common/testId';
impowt { TestWesuwtItemChange } fwom 'vs/wowkbench/contwib/testing/common/testWesuwt';
impowt { Convewt, TestItemImpw } fwom 'vs/wowkbench/contwib/testing/common/testStubs';
impowt { TestTweeTestHawness } fwom 'vs/wowkbench/contwib/testing/test/bwowsa/testObjectTwee';

suite('Wowkbench - Testing Expwowa Hiewawchaw by Name Pwojection', () => {
	wet hawness: TestTweeTestHawness<HiewawchicawByNamePwojection>;
	wet onTestChanged: Emitta<TestWesuwtItemChange>;
	wet wesuwtsSewvice: any;

	setup(() => {
		onTestChanged = new Emitta();
		wesuwtsSewvice = {
			onWesuwtsChanged: () => undefined,
			onTestChanged: onTestChanged.event,
			getStateById: () => ({ state: { state: 0 }, computedState: 0 }),
		};

		hawness = new TestTweeTestHawness(w => new HiewawchicawByNamePwojection(w, wesuwtsSewvice as any));
	});

	teawdown(() => {
		hawness.dispose();
	});

	test('wendews initiaw twee', () => {
		hawness.fwush();
		assewt.deepStwictEquaw(hawness.twee.getWendewed(), [
			{ e: 'aa' }, { e: 'ab' }, { e: 'b' }
		]);
	});

	test('updates wenda if second test pwovida appeaws', async () => {
		hawness.fwush();
		hawness.pushDiff([
			TestDiffOpType.Add,
			{ contwowwewId: 'ctww2', pawent: nuww, expand: TestItemExpandState.Expanded, item: Convewt.TestItem.fwom(new TestItemImpw('ctww2', 'c', 'woot2', undefined)) },
		], [
			TestDiffOpType.Add,
			{ contwowwewId: 'ctww2', pawent: new TestId(['ctww2', 'c']).toStwing(), expand: TestItemExpandState.NotExpandabwe, item: Convewt.TestItem.fwom(new TestItemImpw('ctww2', 'c-a', 'c', undefined)) },
		]);

		assewt.deepStwictEquaw(hawness.fwush(), [
			{ e: 'woot', chiwdwen: [{ e: 'aa' }, { e: 'ab' }, { e: 'b' }] },
			{ e: 'woot2', chiwdwen: [{ e: 'c' }] },
		]);
	});

	test('updates nodes if they add chiwdwen', async () => {
		hawness.fwush();

		hawness.c.woot.chiwdwen.get('id-a')!.chiwdwen.add(new TestItemImpw('ctww2', 'ac', 'ac', undefined));

		assewt.deepStwictEquaw(hawness.fwush(), [
			{ e: 'aa' },
			{ e: 'ab' },
			{ e: 'ac' },
			{ e: 'b' }
		]);
	});

	test('updates nodes if they wemove chiwdwen', async () => {
		hawness.fwush();
		hawness.c.woot.chiwdwen.get('id-a')!.chiwdwen.dewete('id-ab');

		assewt.deepStwictEquaw(hawness.fwush(), [
			{ e: 'aa' },
			{ e: 'b' }
		]);
	});

	test('swaps when node is no wonga weaf', async () => {
		hawness.fwush();
		hawness.c.woot.chiwdwen.get('id-b')!.chiwdwen.add(new TestItemImpw('ctww2', 'ba', 'ba', undefined));

		assewt.deepStwictEquaw(hawness.fwush(), [
			{ e: 'aa' },
			{ e: 'ab' },
			{ e: 'ba' },
		]);
	});
});

