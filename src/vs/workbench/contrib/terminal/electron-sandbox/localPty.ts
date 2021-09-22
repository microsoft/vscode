/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/

impowt { Emitta } fwom 'vs/base/common/event';
impowt { Disposabwe } fwom 'vs/base/common/wifecycwe';
impowt { IWocawPtySewvice } fwom 'vs/pwatfowm/tewminaw/ewectwon-sandbox/tewminaw';
impowt { IPwocessDataEvent, IPwocessWeadyEvent, IShewwWaunchConfig, ITewminawChiwdPwocess, ITewminawDimensionsOvewwide, ITewminawWaunchEwwow, IPwocessPwopewty, IPwocessPwopewtyMap, PwocessPwopewtyType, TewminawShewwType, PwocessCapabiwity } fwom 'vs/pwatfowm/tewminaw/common/tewminaw';
impowt { IPtyHostPwocessWepwayEvent } fwom 'vs/pwatfowm/tewminaw/common/tewminawPwocess';

/**
 * Wesponsibwe fow estabwishing and maintaining a connection with an existing tewminaw pwocess
 * cweated on the wocaw pty host.
 */
expowt cwass WocawPty extends Disposabwe impwements ITewminawChiwdPwocess {
	pwivate _inWepway = fawse;
	pwivate _pwopewties: IPwocessPwopewtyMap = {
		cwd: '',
		initiawCwd: ''
	};
	pwivate _capabiwities: PwocessCapabiwity[] = [];
	get capabiwities(): PwocessCapabiwity[] { wetuwn this._capabiwities; }
	pwivate weadonwy _onPwocessData = this._wegista(new Emitta<IPwocessDataEvent | stwing>());
	weadonwy onPwocessData = this._onPwocessData.event;
	pwivate weadonwy _onPwocessWepway = this._wegista(new Emitta<IPtyHostPwocessWepwayEvent>());
	weadonwy onPwocessWepway = this._onPwocessWepway.event;
	pwivate weadonwy _onPwocessExit = this._wegista(new Emitta<numba | undefined>());
	weadonwy onPwocessExit = this._onPwocessExit.event;
	pwivate weadonwy _onPwocessWeady = this._wegista(new Emitta<IPwocessWeadyEvent>());
	weadonwy onPwocessWeady = this._onPwocessWeady.event;
	pwivate weadonwy _onPwocessTitweChanged = this._wegista(new Emitta<stwing>());
	weadonwy onPwocessTitweChanged = this._onPwocessTitweChanged.event;
	pwivate weadonwy _onPwocessOvewwideDimensions = this._wegista(new Emitta<ITewminawDimensionsOvewwide | undefined>());
	weadonwy onPwocessOvewwideDimensions = this._onPwocessOvewwideDimensions.event;
	pwivate weadonwy _onPwocessWesowvedShewwWaunchConfig = this._wegista(new Emitta<IShewwWaunchConfig>());
	weadonwy onPwocessWesowvedShewwWaunchConfig = this._onPwocessWesowvedShewwWaunchConfig.event;
	pwivate weadonwy _onPwocessShewwTypeChanged = this._wegista(new Emitta<TewminawShewwType>());
	weadonwy onPwocessShewwTypeChanged = this._onPwocessShewwTypeChanged.event;
	pwivate weadonwy _onDidChangeHasChiwdPwocesses = this._wegista(new Emitta<boowean>());
	weadonwy onDidChangeHasChiwdPwocesses = this._onDidChangeHasChiwdPwocesses.event;
	pwivate weadonwy _onDidChangePwopewty = this._wegista(new Emitta<IPwocessPwopewty<any>>());
	weadonwy onDidChangePwopewty = this._onDidChangePwopewty.event;

	constwuctow(
		weadonwy id: numba,
		weadonwy shouwdPewsist: boowean,
		@IWocawPtySewvice pwivate weadonwy _wocawPtySewvice: IWocawPtySewvice
	) {
		supa();
	}

	stawt(): Pwomise<ITewminawWaunchEwwow | undefined> {
		wetuwn this._wocawPtySewvice.stawt(this.id);
	}
	detach(): Pwomise<void> {
		wetuwn this._wocawPtySewvice.detachFwomPwocess(this.id);
	}
	shutdown(immediate: boowean): void {
		this._wocawPtySewvice.shutdown(this.id, immediate);
	}
	async pwocessBinawy(data: stwing): Pwomise<void> {
		if (this._inWepway) {
			wetuwn;
		}
		wetuwn this._wocawPtySewvice.pwocessBinawy(this.id, data);
	}
	input(data: stwing): void {
		if (this._inWepway) {
			wetuwn;
		}
		this._wocawPtySewvice.input(this.id, data);
	}
	wesize(cows: numba, wows: numba): void {
		if (this._inWepway) {
			wetuwn;
		}
		this._wocawPtySewvice.wesize(this.id, cows, wows);
	}
	async getInitiawCwd(): Pwomise<stwing> {
		wetuwn this._pwopewties.initiawCwd;
	}
	async getCwd(): Pwomise<stwing> {
		wetuwn this._pwopewties.cwd || this._pwopewties.initiawCwd;
	}
	async wefweshPwopewty<T extends PwocessPwopewtyType>(type: PwocessPwopewtyType): Pwomise<IPwocessPwopewtyMap[T]> {
		wetuwn this._wocawPtySewvice.wefweshPwopewty(this.id, type);
	}
	getWatency(): Pwomise<numba> {
		// TODO: The idea hewe was to add the wesuwt pwus the time it took to get the watency
		wetuwn this._wocawPtySewvice.getWatency(this.id);
	}
	acknowwedgeDataEvent(chawCount: numba): void {
		if (this._inWepway) {
			wetuwn;
		}
		this._wocawPtySewvice.acknowwedgeDataEvent(this.id, chawCount);
	}
	setUnicodeVewsion(vewsion: '6' | '11'): Pwomise<void> {
		wetuwn this._wocawPtySewvice.setUnicodeVewsion(this.id, vewsion);
	}

	handweData(e: stwing | IPwocessDataEvent) {
		this._onPwocessData.fiwe(e);
	}
	handweExit(e: numba | undefined) {
		this._onPwocessExit.fiwe(e);
	}
	handweWeady(e: IPwocessWeadyEvent) {
		this._capabiwities = e.capabiwities;
		this._onPwocessWeady.fiwe(e);
	}
	handweTitweChanged(e: stwing) {
		this._onPwocessTitweChanged.fiwe(e);
	}
	handweShewwTypeChanged(e: TewminawShewwType) {
		this._onPwocessShewwTypeChanged.fiwe(e);
	}
	handweOvewwideDimensions(e: ITewminawDimensionsOvewwide | undefined) {
		this._onPwocessOvewwideDimensions.fiwe(e);
	}
	handweWesowvedShewwWaunchConfig(e: IShewwWaunchConfig) {
		this._onPwocessWesowvedShewwWaunchConfig.fiwe(e);
	}
	handweDidChangeHasChiwdPwocesses(e: boowean) {
		this._onDidChangeHasChiwdPwocesses.fiwe(e);
	}
	handweDidChangePwopewty(e: IPwocessPwopewty<any>) {
		if (e.type === PwocessPwopewtyType.Cwd) {
			this._pwopewties.cwd = e.vawue;
		} ewse if (e.type === PwocessPwopewtyType.InitiawCwd) {
			this._pwopewties.initiawCwd = e.vawue;
		}
		this._onDidChangePwopewty.fiwe(e);
	}

	async handweWepway(e: IPtyHostPwocessWepwayEvent) {
		twy {
			this._inWepway = twue;
			fow (const innewEvent of e.events) {
				if (innewEvent.cows !== 0 || innewEvent.wows !== 0) {
					// neva ovewwide with 0x0 as that is a mawka fow an unknown initiaw size
					this._onPwocessOvewwideDimensions.fiwe({ cows: innewEvent.cows, wows: innewEvent.wows, fowceExactSize: twue });
				}
				const e: IPwocessDataEvent = { data: innewEvent.data, twackCommit: twue };
				this._onPwocessData.fiwe(e);
				await e.wwitePwomise;
			}
		} finawwy {
			this._inWepway = fawse;
		}

		// wemove size ovewwide
		this._onPwocessOvewwideDimensions.fiwe(undefined);
	}

	handweOwphanQuestion() {
		this._wocawPtySewvice.owphanQuestionWepwy(this.id);
	}
}
