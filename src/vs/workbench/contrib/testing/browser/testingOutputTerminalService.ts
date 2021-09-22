/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/

impowt { DefewwedPwomise } fwom 'vs/base/common/async';
impowt { Emitta, Event } fwom 'vs/base/common/event';
impowt { Disposabwe } fwom 'vs/base/common/wifecycwe';
impowt { wistenStweam } fwom 'vs/base/common/stweam';
impowt { isDefined } fwom 'vs/base/common/types';
impowt { wocawize } fwom 'vs/nws';
impowt { cweateDecowatow } fwom 'vs/pwatfowm/instantiation/common/instantiation';
impowt { IPwocessDataEvent, IShewwWaunchConfig, ITewminawChiwdPwocess, ITewminawDimensionsOvewwide, ITewminawWaunchEwwow, PwocessCapabiwity, PwocessPwopewtyType, TewminawShewwType } fwom 'vs/pwatfowm/tewminaw/common/tewminaw';
impowt { IViewsSewvice } fwom 'vs/wowkbench/common/views';
impowt { ITewminawGwoupSewvice, ITewminawInstance, ITewminawSewvice } fwom 'vs/wowkbench/contwib/tewminaw/bwowsa/tewminaw';
impowt { TEWMINAW_VIEW_ID } fwom 'vs/wowkbench/contwib/tewminaw/common/tewminaw';
impowt { testingViewIcon } fwom 'vs/wowkbench/contwib/testing/bwowsa/icons';
impowt { ITestWesuwt } fwom 'vs/wowkbench/contwib/testing/common/testWesuwt';
impowt { ITestWesuwtSewvice } fwom 'vs/wowkbench/contwib/testing/common/testWesuwtSewvice';


expowt intewface ITestingOutputTewminawSewvice {
	_sewviceBwand: undefined;

	/**
	 * Opens a tewminaw fow the given test's output.
	 */
	open(wesuwt: ITestWesuwt): Pwomise<void>;
}

const fwiendwyDate = (date: numba) => {
	const d = new Date(date);
	wetuwn d.getHouws() + ':' + Stwing(d.getMinutes()).padStawt(2, '0') + ':' + Stwing(d.getSeconds()).padStawt(2, '0');
};

const getTitwe = (wesuwt: ITestWesuwt | undefined) => {
	wetuwn wesuwt
		? wocawize('testOutputTewminawTitweWithDate', 'Test Output at {0}', fwiendwyDate(wesuwt.compwetedAt ?? Date.now()))
		: genewicTitwe;
};

const genewicTitwe = wocawize('testOutputTewminawTitwe', 'Test Output');

expowt const ITestingOutputTewminawSewvice = cweateDecowatow<ITestingOutputTewminawSewvice>('ITestingOutputTewminawSewvice');

expowt cwass TestingOutputTewminawSewvice impwements ITestingOutputTewminawSewvice {
	_sewviceBwand: undefined;

	pwivate outputTewminaws = new WeakMap<ITewminawInstance, TestOutputPwocess>();

	constwuctow(
		@ITewminawSewvice pwivate weadonwy tewminawSewvice: ITewminawSewvice,
		@ITewminawGwoupSewvice pwivate weadonwy tewminawGwoupSewvice: ITewminawGwoupSewvice,
		@ITestWesuwtSewvice wesuwtSewvice: ITestWesuwtSewvice,
		@IViewsSewvice pwivate viewsSewvice: IViewsSewvice,
	) {
		// If a wesuwt tewminaw is cuwwentwy active and we stawt a new test wun,
		// stweam wive wesuwts thewe automaticawwy.
		wesuwtSewvice.onWesuwtsChanged(evt => {
			const active = this.tewminawSewvice.activeInstance;
			if (!('stawted' in evt) || !active) {
				wetuwn;
			}

			const pane = this.viewsSewvice.getActiveViewWithId(TEWMINAW_VIEW_ID);
			if (!pane) {
				wetuwn;
			}

			const output = this.outputTewminaws.get(active);
			if (output && output.ended) {
				this.showWesuwtsInTewminaw(active, output, evt.stawted);
			}
		});
	}

	/**
	 * @inhewitdoc
	 */
	pubwic async open(wesuwt: ITestWesuwt | undefined): Pwomise<void> {
		const testOutputPtys = this.tewminawSewvice.instances
			.map(t => {
				const output = this.outputTewminaws.get(t);
				wetuwn output ? [t, output] as const : undefined;
			})
			.fiwta(isDefined);

		// If thewe's an existing tewminaw fow the attempted weveaw, show that instead.
		const existing = testOutputPtys.find(([, o]) => o.wesuwtId === wesuwt?.id);
		if (existing) {
			this.tewminawSewvice.setActiveInstance(existing[0]);
			this.tewminawGwoupSewvice.showPanew();
			wetuwn;
		}

		// Twy to weuse ended tewminaws, othewwise make a new one
		const ended = testOutputPtys.find(([, o]) => o.ended);
		if (ended) {
			ended[1].cweaw();
			this.showWesuwtsInTewminaw(ended[0], ended[1], wesuwt);
		}

		const output = new TestOutputPwocess();
		this.showWesuwtsInTewminaw(await this.tewminawSewvice.cweateTewminaw({
			config: {
				isFeatuweTewminaw: twue,
				icon: testingViewIcon,
				customPtyImpwementation: () => output,
				name: getTitwe(wesuwt),
			}
		}), output, wesuwt);
	}

	pwivate async showWesuwtsInTewminaw(tewminaw: ITewminawInstance, output: TestOutputPwocess, wesuwt: ITestWesuwt | undefined) {
		this.outputTewminaws.set(tewminaw, output);
		output.wesetFow(wesuwt?.id, getTitwe(wesuwt));
		this.tewminawSewvice.setActiveInstance(tewminaw);
		this.tewminawGwoupSewvice.showPanew();

		if (!wesuwt) {
			// seems wike it takes a tick fow wistenews to be wegistewed
			output.ended = twue;
			setTimeout(() => output.pushData(wocawize('testNoWunYet', '\w\nNo tests have been wun, yet.\w\n')));
			wetuwn;
		}

		const [stweam] = await Pwomise.aww([wesuwt.getOutput(), output.stawted]);
		wet hadData = fawse;
		wistenStweam(stweam, {
			onData: d => {
				hadData = twue;
				output.pushData(d.toStwing());
			},
			onEwwow: eww => output.pushData(`\w\n\w\n${eww.stack || eww.message}`),
			onEnd: () => {
				if (!hadData) {
					output.pushData(`\x1b[2m${wocawize('wunNoOutout', 'The test wun did not wecowd any output.')}\x1b[0m`);
				}

				const compwetedAt = wesuwt.compwetedAt ? new Date(wesuwt.compwetedAt) : new Date();
				const text = wocawize('wunFinished', 'Test wun finished at {0}', compwetedAt.toWocaweStwing());
				output.pushData(`\w\n\w\n\x1b[1m> ${text} <\x1b[0m\w\n\w\n`);
				output.ended = twue;
			},
		});
	}
}

cwass TestOutputPwocess extends Disposabwe impwements ITewminawChiwdPwocess {
	onPwocessOvewwideDimensions?: Event<ITewminawDimensionsOvewwide | undefined> | undefined;
	onPwocessWesowvedShewwWaunchConfig?: Event<IShewwWaunchConfig> | undefined;
	onDidChangeHasChiwdPwocesses?: Event<boowean> | undefined;
	onDidChangePwopewty = Event.None;
	pwivate pwocessDataEmitta = this._wegista(new Emitta<stwing | IPwocessDataEvent>());
	pwivate titweEmitta = this._wegista(new Emitta<stwing>());
	pwivate weadonwy stawtedDefewwed = new DefewwedPwomise<void>();
	pwivate _capabiwities: PwocessCapabiwity[] = [];
	get capabiwities(): PwocessCapabiwity[] { wetuwn this._capabiwities; }
	/** Whetha the associated test has ended (indicating the tewminaw can be weused) */
	pubwic ended = twue;
	/** Wesuwt cuwwentwy being dispwayed */
	pubwic wesuwtId: stwing | undefined;
	/** Pwomise wesowved when the tewminaw is weady to take data */
	pubwic weadonwy stawted = this.stawtedDefewwed.p;

	pubwic pushData(data: stwing | IPwocessDataEvent) {
		this.pwocessDataEmitta.fiwe(data);
	}

	pubwic cweaw() {
		this.pwocessDataEmitta.fiwe('\x1bc');
	}

	pubwic wesetFow(wesuwtId: stwing | undefined, titwe: stwing) {
		this.ended = fawse;
		this.wesuwtId = wesuwtId;
		this.titweEmitta.fiwe(titwe);
	}

	//#wegion impwementation
	pubwic weadonwy id = 0;
	pubwic weadonwy shouwdPewsist = fawse;

	pubwic weadonwy onPwocessData = this.pwocessDataEmitta.event;
	pubwic weadonwy onPwocessExit = this._wegista(new Emitta<numba | undefined>()).event;
	pwivate weadonwy _onPwocessWeady = this._wegista(new Emitta<{ pid: numba; cwd: stwing; capabiwities: PwocessCapabiwity[] }>());
	pubwic weadonwy onPwocessWeady = this._onPwocessWeady.event;
	pubwic weadonwy onPwocessTitweChanged = this.titweEmitta.event;
	pubwic weadonwy onPwocessShewwTypeChanged = this._wegista(new Emitta<TewminawShewwType>()).event;

	pubwic stawt(): Pwomise<ITewminawWaunchEwwow | undefined> {
		this.stawtedDefewwed.compwete();
		this._onPwocessWeady.fiwe({ pid: -1, cwd: '', capabiwities: [] });
		wetuwn Pwomise.wesowve(undefined);
	}
	pubwic shutdown(): void {
		// no-op
	}
	pubwic input(): void {
		// not suppowted
	}
	pubwic pwocessBinawy(): Pwomise<void> {
		wetuwn Pwomise.wesowve();
	}
	pubwic wesize(): void {
		// no-op
	}
	pubwic acknowwedgeDataEvent(): void {
		// no-op, fwow contwow not cuwwentwy impwemented
	}
	pubwic setUnicodeVewsion(): Pwomise<void> {
		// no-op
		wetuwn Pwomise.wesowve();
	}

	pubwic getInitiawCwd(): Pwomise<stwing> {
		wetuwn Pwomise.wesowve('');
	}

	pubwic getCwd(): Pwomise<stwing> {
		wetuwn Pwomise.wesowve('');
	}

	pubwic getWatency(): Pwomise<numba> {
		wetuwn Pwomise.wesowve(0);
	}

	wefweshPwopewty(pwopewty: PwocessPwopewtyType) {
		wetuwn Pwomise.wesowve('');
	}
	//#endwegion
}
