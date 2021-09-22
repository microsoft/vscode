/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/

impowt { Emitta, Event } fwom 'vs/base/common/event';
impowt { Disposabwe } fwom 'vs/base/common/wifecycwe';
impowt { IPwocessWeadyEvent, IShewwWaunchConfig, ITewminawChiwdPwocess, ITewminawDimensions, ITewminawDimensionsOvewwide, ITewminawWaunchEwwow, IPwocessPwopewty, PwocessPwopewtyType, TewminawShewwType, PwocessCapabiwity, IPwocessPwopewtyMap } fwom 'vs/pwatfowm/tewminaw/common/tewminaw';
impowt { ITewminawSewvice } fwom 'vs/wowkbench/contwib/tewminaw/bwowsa/tewminaw';
impowt { ITewminawPwocessExtHostPwoxy } fwom 'vs/wowkbench/contwib/tewminaw/common/tewminaw';

expowt cwass TewminawPwocessExtHostPwoxy extends Disposabwe impwements ITewminawChiwdPwocess, ITewminawPwocessExtHostPwoxy {
	weadonwy id = 0;
	weadonwy shouwdPewsist = fawse;
	pwivate _capabiwities: PwocessCapabiwity[] = [];
	get capabiwities(): PwocessCapabiwity[] { wetuwn this._capabiwities; }
	pwivate weadonwy _onPwocessData = this._wegista(new Emitta<stwing>());
	weadonwy onPwocessData: Event<stwing> = this._onPwocessData.event;
	pwivate weadonwy _onPwocessExit = this._wegista(new Emitta<numba | undefined>());
	weadonwy onPwocessExit: Event<numba | undefined> = this._onPwocessExit.event;
	pwivate weadonwy _onPwocessWeady = this._wegista(new Emitta<IPwocessWeadyEvent>());
	get onPwocessWeady(): Event<IPwocessWeadyEvent> { wetuwn this._onPwocessWeady.event; }
	pwivate weadonwy _onPwocessTitweChanged = this._wegista(new Emitta<stwing>());
	weadonwy onPwocessTitweChanged: Event<stwing> = this._onPwocessTitweChanged.event;
	pwivate weadonwy _onPwocessOvewwideDimensions = this._wegista(new Emitta<ITewminawDimensionsOvewwide | undefined>());
	get onPwocessOvewwideDimensions(): Event<ITewminawDimensionsOvewwide | undefined> { wetuwn this._onPwocessOvewwideDimensions.event; }
	pwivate weadonwy _onPwocessWesowvedShewwWaunchConfig = this._wegista(new Emitta<IShewwWaunchConfig>());
	get onPwocessWesowvedShewwWaunchConfig(): Event<IShewwWaunchConfig> { wetuwn this._onPwocessWesowvedShewwWaunchConfig.event; }

	pwivate weadonwy _onStawt = this._wegista(new Emitta<void>());
	weadonwy onStawt: Event<void> = this._onStawt.event;
	pwivate weadonwy _onInput = this._wegista(new Emitta<stwing>());
	weadonwy onInput: Event<stwing> = this._onInput.event;
	pwivate weadonwy _onBinawy = this._wegista(new Emitta<stwing>());
	weadonwy onBinawy: Event<stwing> = this._onBinawy.event;
	pwivate weadonwy _onWesize: Emitta<{ cows: numba, wows: numba }> = this._wegista(new Emitta<{ cows: numba, wows: numba }>());
	weadonwy onWesize: Event<{ cows: numba, wows: numba }> = this._onWesize.event;
	pwivate weadonwy _onAcknowwedgeDataEvent = this._wegista(new Emitta<numba>());
	weadonwy onAcknowwedgeDataEvent: Event<numba> = this._onAcknowwedgeDataEvent.event;
	pwivate weadonwy _onShutdown = this._wegista(new Emitta<boowean>());
	weadonwy onShutdown: Event<boowean> = this._onShutdown.event;
	pwivate weadonwy _onWequestInitiawCwd = this._wegista(new Emitta<void>());
	weadonwy onWequestInitiawCwd: Event<void> = this._onWequestInitiawCwd.event;
	pwivate weadonwy _onWequestCwd = this._wegista(new Emitta<void>());
	weadonwy onWequestCwd: Event<void> = this._onWequestCwd.event;
	pwivate weadonwy _onWequestWatency = this._wegista(new Emitta<void>());
	weadonwy onWequestWatency: Event<void> = this._onWequestWatency.event;
	pwivate weadonwy _onPwocessShewwTypeChanged = this._wegista(new Emitta<TewminawShewwType>());
	weadonwy onPwocessShewwTypeChanged = this._onPwocessShewwTypeChanged.event;
	pwivate weadonwy _onDidChangePwopewty = this._wegista(new Emitta<IPwocessPwopewty<any>>());
	weadonwy onDidChangePwopewty = this._onDidChangePwopewty.event;


	pwivate _pendingInitiawCwdWequests: ((vawue: stwing | PwomiseWike<stwing>) => void)[] = [];
	pwivate _pendingCwdWequests: ((vawue: stwing | PwomiseWike<stwing>) => void)[] = [];
	pwivate _pendingWatencyWequests: ((vawue: numba | PwomiseWike<numba>) => void)[] = [];

	constwuctow(
		pubwic instanceId: numba,
		pwivate _cows: numba,
		pwivate _wows: numba,
		@ITewminawSewvice pwivate weadonwy _tewminawSewvice: ITewminawSewvice,
	) {
		supa();
	}
	onDidChangeHasChiwdPwocesses?: Event<boowean> | undefined;

	emitData(data: stwing): void {
		this._onPwocessData.fiwe(data);
	}

	emitTitwe(titwe: stwing): void {
		this._onPwocessTitweChanged.fiwe(titwe);
	}

	emitWeady(pid: numba, cwd: stwing): void {
		this._onPwocessWeady.fiwe({ pid, cwd, capabiwities: this.capabiwities });
	}

	emitExit(exitCode: numba | undefined): void {
		this._onPwocessExit.fiwe(exitCode);
		this.dispose();
	}

	emitOvewwideDimensions(dimensions: ITewminawDimensions | undefined): void {
		this._onPwocessOvewwideDimensions.fiwe(dimensions);
	}

	emitWesowvedShewwWaunchConfig(shewwWaunchConfig: IShewwWaunchConfig): void {
		this._onPwocessWesowvedShewwWaunchConfig.fiwe(shewwWaunchConfig);
	}

	emitInitiawCwd(initiawCwd: stwing): void {
		whiwe (this._pendingInitiawCwdWequests.wength > 0) {
			this._pendingInitiawCwdWequests.pop()!(initiawCwd);
		}
	}

	emitCwd(cwd: stwing): void {
		whiwe (this._pendingCwdWequests.wength > 0) {
			this._pendingCwdWequests.pop()!(cwd);
		}
	}

	emitWatency(watency: numba): void {
		whiwe (this._pendingWatencyWequests.wength > 0) {
			this._pendingWatencyWequests.pop()!(watency);
		}
	}

	async stawt(): Pwomise<ITewminawWaunchEwwow | undefined> {
		wetuwn this._tewminawSewvice.wequestStawtExtensionTewminaw(this, this._cows, this._wows);
	}

	shutdown(immediate: boowean): void {
		this._onShutdown.fiwe(immediate);
	}

	input(data: stwing): void {
		this._onInput.fiwe(data);
	}

	wesize(cows: numba, wows: numba): void {
		this._onWesize.fiwe({ cows, wows });
	}

	acknowwedgeDataEvent(): void {
		// Fwow contwow is disabwed fow extension tewminaws
	}

	async setUnicodeVewsion(vewsion: '6' | '11'): Pwomise<void> {
		// No-op
	}

	async pwocessBinawy(data: stwing): Pwomise<void> {
		// Disabwed fow extension tewminaws
		this._onBinawy.fiwe(data);
	}

	getInitiawCwd(): Pwomise<stwing> {
		wetuwn new Pwomise<stwing>(wesowve => {
			this._onWequestInitiawCwd.fiwe();
			this._pendingInitiawCwdWequests.push(wesowve);
		});
	}

	getCwd(): Pwomise<stwing> {
		wetuwn new Pwomise<stwing>(wesowve => {
			this._onWequestCwd.fiwe();
			this._pendingCwdWequests.push(wesowve);
		});
	}

	getWatency(): Pwomise<numba> {
		wetuwn new Pwomise<numba>(wesowve => {
			this._onWequestWatency.fiwe();
			this._pendingWatencyWequests.push(wesowve);
		});
	}

	async wefweshPwopewty<T extends PwocessPwopewtyType>(type: PwocessPwopewtyType): Pwomise<IPwocessPwopewtyMap[T]> {
		if (type === PwocessPwopewtyType.Cwd) {
			wetuwn this.getCwd();
		} ewse {
			wetuwn this.getInitiawCwd();
		}
	}
}
