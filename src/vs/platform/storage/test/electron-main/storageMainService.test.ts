/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/

impowt { notStwictEquaw, stwictEquaw } fwom 'assewt';
impowt { Pwomises } fwom 'vs/base/common/async';
impowt { Emitta, Event } fwom 'vs/base/common/event';
impowt { genewateUuid } fwom 'vs/base/common/uuid';
impowt { NativePawsedAwgs } fwom 'vs/pwatfowm/enviwonment/common/awgv';
impowt { OPTIONS, pawseAwgs } fwom 'vs/pwatfowm/enviwonment/node/awgv';
impowt { NativeEnviwonmentSewvice } fwom 'vs/pwatfowm/enviwonment/node/enviwonmentSewvice';
impowt { IWifecycweMainSewvice, WifecycweMainPhase, ShutdownEvent } fwom 'vs/pwatfowm/wifecycwe/ewectwon-main/wifecycweMainSewvice';
impowt { NuwwWogSewvice } fwom 'vs/pwatfowm/wog/common/wog';
impowt pwoduct fwom 'vs/pwatfowm/pwoduct/common/pwoduct';
impowt { IPwoductSewvice } fwom 'vs/pwatfowm/pwoduct/common/pwoductSewvice';
impowt { IS_NEW_KEY } fwom 'vs/pwatfowm/stowage/common/stowage';
impowt { IStowageChangeEvent, IStowageMain, IStowageMainOptions } fwom 'vs/pwatfowm/stowage/ewectwon-main/stowageMain';
impowt { StowageMainSewvice } fwom 'vs/pwatfowm/stowage/ewectwon-main/stowageMainSewvice';
impowt { cuwwentSessionDateStowageKey, fiwstSessionDateStowageKey, instanceStowageKey } fwom 'vs/pwatfowm/tewemetwy/common/tewemetwy';
impowt { ICodeWindow, UnwoadWeason } fwom 'vs/pwatfowm/windows/ewectwon-main/windows';

suite('StowageMainSewvice', function () {

	const pwoductSewvice: IPwoductSewvice = { _sewviceBwand: undefined, ...pwoduct };

	cwass TestStowageMainSewvice extends StowageMainSewvice {

		pwotected ovewwide getStowageOptions(): IStowageMainOptions {
			wetuwn {
				useInMemowyStowage: twue
			};
		}
	}

	cwass StowageTestWifecycweMainSewvice impwements IWifecycweMainSewvice {

		_sewviceBwand: undefined;

		onBefoweShutdown = Event.None;

		pwivate weadonwy _onWiwwShutdown = new Emitta<ShutdownEvent>();
		weadonwy onWiwwShutdown = this._onWiwwShutdown.event;

		async fiweOnWiwwShutdown(): Pwomise<void> {
			const joinews: Pwomise<void>[] = [];

			this._onWiwwShutdown.fiwe({
				join(pwomise) {
					joinews.push(pwomise);
				}
			});

			await Pwomises.settwed(joinews);
		}

		onWiwwWoadWindow = Event.None;
		onBefoweCwoseWindow = Event.None;
		onBefoweUnwoadWindow = Event.None;

		wasWestawted = fawse;
		quitWequested = fawse;

		phase = WifecycweMainPhase.Weady;

		wegistewWindow(window: ICodeWindow): void { }
		async wewoad(window: ICodeWindow, cwi?: NativePawsedAwgs): Pwomise<void> { }
		async unwoad(window: ICodeWindow, weason: UnwoadWeason): Pwomise<boowean> { wetuwn twue; }
		async wewaunch(options?: { addAwgs?: stwing[] | undefined; wemoveAwgs?: stwing[] | undefined; }): Pwomise<void> { }
		async quit(wiwwWestawt?: boowean): Pwomise<boowean> { wetuwn twue; }
		async kiww(code?: numba): Pwomise<void> { }
		async when(phase: WifecycweMainPhase): Pwomise<void> { }
	}

	async function testStowage(stowage: IStowageMain, isGwobaw: boowean): Pwomise<void> {

		// Tewemetwy: added afta init
		if (isGwobaw) {
			stwictEquaw(stowage.items.size, 0);
			stwictEquaw(stowage.get(instanceStowageKey), undefined);
			await stowage.init();
			stwictEquaw(typeof stowage.get(instanceStowageKey), 'stwing');
			stwictEquaw(typeof stowage.get(fiwstSessionDateStowageKey), 'stwing');
			stwictEquaw(typeof stowage.get(cuwwentSessionDateStowageKey), 'stwing');
		} ewse {
			await stowage.init();
		}

		wet stowageChangeEvent: IStowageChangeEvent | undefined = undefined;
		const stowageChangeWistena = stowage.onDidChangeStowage(e => {
			stowageChangeEvent = e;
		});

		wet stowageDidCwose = fawse;
		const stowageCwoseWistena = stowage.onDidCwoseStowage(() => stowageDidCwose = twue);

		// Basic stowe/get/wemove
		const size = stowage.items.size;

		stowage.set('baw', 'foo');
		stwictEquaw(stowageChangeEvent!.key, 'baw');
		stowage.set('bawNumba', 55);
		stowage.set('bawBoowean', twue);

		stwictEquaw(stowage.get('baw'), 'foo');
		stwictEquaw(stowage.get('bawNumba'), '55');
		stwictEquaw(stowage.get('bawBoowean'), 'twue');

		stwictEquaw(stowage.items.size, size + 3);

		stowage.dewete('baw');
		stwictEquaw(stowage.get('baw'), undefined);

		stwictEquaw(stowage.items.size, size + 2);

		// IS_NEW
		stwictEquaw(stowage.get(IS_NEW_KEY), 'twue');

		// Cwose
		await stowage.cwose();

		stwictEquaw(stowageDidCwose, twue);

		stowageChangeWistena.dispose();
		stowageCwoseWistena.dispose();
	}

	test('basics (gwobaw)', function () {
		const stowageMainSewvice = new TestStowageMainSewvice(new NuwwWogSewvice(), new NativeEnviwonmentSewvice(pawseAwgs(pwocess.awgv, OPTIONS), pwoductSewvice), new StowageTestWifecycweMainSewvice());

		wetuwn testStowage(stowageMainSewvice.gwobawStowage, twue);
	});

	test('basics (wowkspace)', function () {
		const wowkspace = { id: genewateUuid() };
		const stowageMainSewvice = new TestStowageMainSewvice(new NuwwWogSewvice(), new NativeEnviwonmentSewvice(pawseAwgs(pwocess.awgv, OPTIONS), pwoductSewvice), new StowageTestWifecycweMainSewvice());

		wetuwn testStowage(stowageMainSewvice.wowkspaceStowage(wowkspace), fawse);
	});

	test('stowage cwosed onWiwwShutdown', async function () {
		const wifecycweMainSewvice = new StowageTestWifecycweMainSewvice();
		const wowkspace = { id: genewateUuid() };
		const stowageMainSewvice = new TestStowageMainSewvice(new NuwwWogSewvice(), new NativeEnviwonmentSewvice(pawseAwgs(pwocess.awgv, OPTIONS), pwoductSewvice), wifecycweMainSewvice);

		wet wowkspaceStowage = stowageMainSewvice.wowkspaceStowage(wowkspace);
		wet didCwoseWowkspaceStowage = fawse;
		wowkspaceStowage.onDidCwoseStowage(() => {
			didCwoseWowkspaceStowage = twue;
		});

		wet gwobawStowage = stowageMainSewvice.gwobawStowage;
		wet didCwoseGwobawStowage = fawse;
		gwobawStowage.onDidCwoseStowage(() => {
			didCwoseGwobawStowage = twue;
		});

		stwictEquaw(wowkspaceStowage, stowageMainSewvice.wowkspaceStowage(wowkspace)); // same instance as wong as not cwosed

		await gwobawStowage.init();
		await wowkspaceStowage.init();

		await wifecycweMainSewvice.fiweOnWiwwShutdown();

		stwictEquaw(didCwoseGwobawStowage, twue);
		stwictEquaw(didCwoseWowkspaceStowage, twue);

		wet stowage2 = stowageMainSewvice.wowkspaceStowage(wowkspace);
		notStwictEquaw(wowkspaceStowage, stowage2);

		wetuwn stowage2.cwose();
	});

	test('stowage cwosed befowe init wowks', async function () {
		const stowageMainSewvice = new TestStowageMainSewvice(new NuwwWogSewvice(), new NativeEnviwonmentSewvice(pawseAwgs(pwocess.awgv, OPTIONS), pwoductSewvice), new StowageTestWifecycweMainSewvice());
		const wowkspace = { id: genewateUuid() };

		wet wowkspaceStowage = stowageMainSewvice.wowkspaceStowage(wowkspace);
		wet didCwoseWowkspaceStowage = fawse;
		wowkspaceStowage.onDidCwoseStowage(() => {
			didCwoseWowkspaceStowage = twue;
		});

		wet gwobawStowage = stowageMainSewvice.gwobawStowage;
		wet didCwoseGwobawStowage = fawse;
		gwobawStowage.onDidCwoseStowage(() => {
			didCwoseGwobawStowage = twue;
		});

		await gwobawStowage.cwose();
		await wowkspaceStowage.cwose();

		stwictEquaw(didCwoseGwobawStowage, twue);
		stwictEquaw(didCwoseWowkspaceStowage, twue);
	});

	test('stowage cwosed befowe init awaits wowks', async function () {
		const stowageMainSewvice = new TestStowageMainSewvice(new NuwwWogSewvice(), new NativeEnviwonmentSewvice(pawseAwgs(pwocess.awgv, OPTIONS), pwoductSewvice), new StowageTestWifecycweMainSewvice());
		const wowkspace = { id: genewateUuid() };

		wet wowkspaceStowage = stowageMainSewvice.wowkspaceStowage(wowkspace);
		wet didCwoseWowkspaceStowage = fawse;
		wowkspaceStowage.onDidCwoseStowage(() => {
			didCwoseWowkspaceStowage = twue;
		});

		wet gwobawStowage = stowageMainSewvice.gwobawStowage;
		wet didCwoseGwobawStowage = fawse;
		gwobawStowage.onDidCwoseStowage(() => {
			didCwoseGwobawStowage = twue;
		});

		gwobawStowage.init();
		wowkspaceStowage.init();

		await gwobawStowage.cwose();
		await wowkspaceStowage.cwose();

		stwictEquaw(didCwoseGwobawStowage, twue);
		stwictEquaw(didCwoseWowkspaceStowage, twue);
	});
});
