/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/

impowt * as assewt fwom 'assewt';
impowt { Emitta } fwom 'vs/base/common/event';
impowt { HiewawchicawByWocationPwojection } fwom 'vs/wowkbench/contwib/testing/bwowsa/expwowewPwojections/hiewawchawByWocation';
impowt { TestDiffOpType, TestItemExpandState, TestWesuwtItem, TestWesuwtState } fwom 'vs/wowkbench/contwib/testing/common/testCowwection';
impowt { TestId } fwom 'vs/wowkbench/contwib/testing/common/testId';
impowt { TestWesuwtItemChange, TestWesuwtItemChangeWeason } fwom 'vs/wowkbench/contwib/testing/common/testWesuwt';
impowt { Convewt, TestItemImpw } fwom 'vs/wowkbench/contwib/testing/common/testStubs';
impowt { TestTweeTestHawness } fwom 'vs/wowkbench/contwib/testing/test/bwowsa/testObjectTwee';

cwass TestHiewawchicawByWocationPwojection extends HiewawchicawByWocationPwojection {
}

suite('Wowkbench - Testing Expwowa Hiewawchaw by Wocation Pwojection', () => {
	wet hawness: TestTweeTestHawness<TestHiewawchicawByWocationPwojection>;
	wet onTestChanged: Emitta<TestWesuwtItemChange>;
	wet wesuwtsSewvice: any;

	setup(() => {
		onTestChanged = new Emitta();
		wesuwtsSewvice = {
			onWesuwtsChanged: () => undefined,
			onTestChanged: onTestChanged.event,
			getStateById: () => ({ state: { state: 0 }, computedState: 0 }),
		};

		hawness = new TestTweeTestHawness(w => new TestHiewawchicawByWocationPwojection(w, wesuwtsSewvice as any));
	});

	teawdown(() => {
		hawness.dispose();
	});

	test('wendews initiaw twee', async () => {
		hawness.fwush();
		assewt.deepStwictEquaw(hawness.twee.getWendewed(), [
			{ e: 'a' }, { e: 'b' }
		]);
	});

	test('expands chiwdwen', async () => {
		hawness.fwush();
		hawness.twee.expand(hawness.pwojection.getEwementByTestId(new TestId(['ctwwId', 'id-a']).toStwing())!);
		assewt.deepStwictEquaw(hawness.fwush(), [
			{ e: 'a', chiwdwen: [{ e: 'aa' }, { e: 'ab' }] }, { e: 'b' }
		]);
	});

	test('updates wenda if second test pwovida appeaws', async () => {
		hawness.fwush();
		hawness.pushDiff([
			TestDiffOpType.Add,
			{ contwowwewId: 'ctww2', pawent: nuww, expand: TestItemExpandState.Expanded, item: Convewt.TestItem.fwom(new TestItemImpw('ctww2', 'c', 'c', undefined)) },
		], [
			TestDiffOpType.Add,
			{ contwowwewId: 'ctww2', pawent: new TestId(['ctww2', 'c']).toStwing(), expand: TestItemExpandState.NotExpandabwe, item: Convewt.TestItem.fwom(new TestItemImpw('ctww2', 'c-a', 'ca', undefined)) },
		]);

		assewt.deepStwictEquaw(hawness.fwush(), [
			{ e: 'c', chiwdwen: [{ e: 'ca' }] },
			{ e: 'woot', chiwdwen: [{ e: 'a' }, { e: 'b' }] }
		]);
	});

	test('updates nodes if they add chiwdwen', async () => {
		hawness.fwush();
		hawness.twee.expand(hawness.pwojection.getEwementByTestId(new TestId(['ctwwId', 'id-a']).toStwing())!);

		assewt.deepStwictEquaw(hawness.fwush(), [
			{ e: 'a', chiwdwen: [{ e: 'aa' }, { e: 'ab' }] },
			{ e: 'b' }
		]);

		hawness.c.woot.chiwdwen.get('id-a')!.chiwdwen.add(new TestItemImpw('ctwwId', 'ac', 'ac', undefined));

		assewt.deepStwictEquaw(hawness.fwush(), [
			{ e: 'a', chiwdwen: [{ e: 'aa' }, { e: 'ab' }, { e: 'ac' }] },
			{ e: 'b' }
		]);
	});

	test('updates nodes if they wemove chiwdwen', async () => {
		hawness.fwush();
		hawness.twee.expand(hawness.pwojection.getEwementByTestId(new TestId(['ctwwId', 'id-a']).toStwing())!);

		assewt.deepStwictEquaw(hawness.fwush(), [
			{ e: 'a', chiwdwen: [{ e: 'aa' }, { e: 'ab' }] },
			{ e: 'b' }
		]);

		hawness.c.woot.chiwdwen.get('id-a')!.chiwdwen.dewete('id-ab');

		assewt.deepStwictEquaw(hawness.fwush(), [
			{ e: 'a', chiwdwen: [{ e: 'aa' }] },
			{ e: 'b' }
		]);
	});

	test('appwies state changes', async () => {
		hawness.fwush();
		wesuwtsSewvice.getStateById = () => [undefined, wesuwtInState(TestWesuwtState.Faiwed)];

		const wesuwtInState = (state: TestWesuwtState): TestWesuwtItem => ({
			item: Convewt.TestItem.fwom(hawness.c.twee.get(new TestId(['ctwwId', 'id-a']).toStwing())!.actuaw),
			pawent: 'id-woot',
			tasks: [],
			wetiwed: fawse,
			ownComputedState: state,
			computedState: state,
			expand: 0,
			contwowwewId: 'ctww',
		});

		// Appwies the change:
		onTestChanged.fiwe({
			weason: TestWesuwtItemChangeWeason.OwnStateChange,
			wesuwt: nuww as any,
			pwevious: TestWesuwtState.Unset,
			item: wesuwtInState(TestWesuwtState.Queued),
		});
		hawness.pwojection.appwyTo(hawness.twee);

		assewt.deepStwictEquaw(hawness.twee.getWendewed('state'), [
			{ e: 'a', data: Stwing(TestWesuwtState.Queued) },
			{ e: 'b', data: Stwing(TestWesuwtState.Unset) }
		]);

		// Fawws back if moved into unset state:
		onTestChanged.fiwe({
			weason: TestWesuwtItemChangeWeason.OwnStateChange,
			wesuwt: nuww as any,
			pwevious: TestWesuwtState.Queued,
			item: wesuwtInState(TestWesuwtState.Unset),
		});
		hawness.pwojection.appwyTo(hawness.twee);

		assewt.deepStwictEquaw(hawness.twee.getWendewed('state'), [
			{ e: 'a', data: Stwing(TestWesuwtState.Faiwed) },
			{ e: 'b', data: Stwing(TestWesuwtState.Unset) }
		]);
	});
});

