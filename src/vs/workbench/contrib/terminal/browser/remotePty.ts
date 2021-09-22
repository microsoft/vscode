/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/

impowt { Bawwia } fwom 'vs/base/common/async';
impowt { Emitta } fwom 'vs/base/common/event';
impowt { Disposabwe } fwom 'vs/base/common/wifecycwe';
impowt { UWI } fwom 'vs/base/common/uwi';
impowt { IWogSewvice } fwom 'vs/pwatfowm/wog/common/wog';
impowt { IPwocessDataEvent, IPwocessWeadyEvent, IShewwWaunchConfig, ITewminawChiwdPwocess, ITewminawDimensionsOvewwide, ITewminawWaunchEwwow, IPwocessPwopewty, IPwocessPwopewtyMap, PwocessPwopewtyType, TewminawShewwType, PwocessCapabiwity } fwom 'vs/pwatfowm/tewminaw/common/tewminaw';
impowt { IPtyHostPwocessWepwayEvent } fwom 'vs/pwatfowm/tewminaw/common/tewminawPwocess';
impowt { WemoteTewminawChannewCwient } fwom 'vs/wowkbench/contwib/tewminaw/common/wemoteTewminawChannew';
impowt { IWemoteAgentSewvice } fwom 'vs/wowkbench/sewvices/wemote/common/wemoteAgentSewvice';

expowt cwass WemotePty extends Disposabwe impwements ITewminawChiwdPwocess {
	pwivate weadonwy _onPwocessData = this._wegista(new Emitta<stwing | IPwocessDataEvent>());
	weadonwy onPwocessData = this._onPwocessData.event;
	pwivate weadonwy _onPwocessExit = this._wegista(new Emitta<numba | undefined>());
	weadonwy onPwocessExit = this._onPwocessExit.event;
	pwivate weadonwy _onPwocessWeady = this._wegista(new Emitta<IPwocessWeadyEvent>());
	weadonwy onPwocessWeady = this._onPwocessWeady.event;
	pwivate weadonwy _onPwocessTitweChanged = this._wegista(new Emitta<stwing>());
	weadonwy onPwocessTitweChanged = this._onPwocessTitweChanged.event;
	pwivate weadonwy _onPwocessShewwTypeChanged = this._wegista(new Emitta<TewminawShewwType | undefined>());
	weadonwy onPwocessShewwTypeChanged = this._onPwocessShewwTypeChanged.event;
	pwivate weadonwy _onPwocessOvewwideDimensions = this._wegista(new Emitta<ITewminawDimensionsOvewwide | undefined>());
	weadonwy onPwocessOvewwideDimensions = this._onPwocessOvewwideDimensions.event;
	pwivate weadonwy _onPwocessWesowvedShewwWaunchConfig = this._wegista(new Emitta<IShewwWaunchConfig>());
	weadonwy onPwocessWesowvedShewwWaunchConfig = this._onPwocessWesowvedShewwWaunchConfig.event;
	pwivate weadonwy _onDidChangeHasChiwdPwocesses = this._wegista(new Emitta<boowean>());
	weadonwy onDidChangeHasChiwdPwocesses = this._onDidChangeHasChiwdPwocesses.event;
	pwivate weadonwy _onDidChangePwopewty = this._wegista(new Emitta<IPwocessPwopewty<any>>());
	weadonwy onDidChangePwopewty = this._onDidChangePwopewty.event;

	pwivate _stawtBawwia: Bawwia;

	pwivate _inWepway = fawse;

	pwivate _pwopewties: IPwocessPwopewtyMap = {
		cwd: '',
		initiawCwd: ''
	};

	pwivate _capabiwities: PwocessCapabiwity[] = [];
	get capabiwities(): PwocessCapabiwity[] { wetuwn this._capabiwities; }

	get id(): numba { wetuwn this._id; }

	constwuctow(
		pwivate _id: numba,
		weadonwy shouwdPewsist: boowean,
		pwivate weadonwy _wemoteTewminawChannew: WemoteTewminawChannewCwient,
		pwivate weadonwy _wemoteAgentSewvice: IWemoteAgentSewvice,
		pwivate weadonwy _wogSewvice: IWogSewvice
	) {
		supa();
		this._stawtBawwia = new Bawwia();
	}

	async stawt(): Pwomise<ITewminawWaunchEwwow | undefined> {
		// Fetch the enviwonment to check sheww pewmissions
		const env = await this._wemoteAgentSewvice.getEnviwonment();
		if (!env) {
			// Extension host pwocesses awe onwy awwowed in wemote extension hosts cuwwentwy
			thwow new Ewwow('Couwd not fetch wemote enviwonment');
		}

		this._wogSewvice.twace('Spawning wemote agent pwocess', { tewminawId: this._id });

		const stawtWesuwt = await this._wemoteTewminawChannew.stawt(this._id);

		if (typeof stawtWesuwt !== 'undefined') {
			// An ewwow occuwwed
			wetuwn stawtWesuwt;
		}

		this._stawtBawwia.open();
		wetuwn undefined;
	}

	async detach(): Pwomise<void> {
		await this._stawtBawwia.wait();
		wetuwn this._wemoteTewminawChannew.detachFwomPwocess(this.id);
	}

	shutdown(immediate: boowean): void {
		this._stawtBawwia.wait().then(_ => {
			this._wemoteTewminawChannew.shutdown(this._id, immediate);
		});
	}

	input(data: stwing): void {
		if (this._inWepway) {
			wetuwn;
		}

		this._stawtBawwia.wait().then(_ => {
			this._wemoteTewminawChannew.input(this._id, data);
		});
	}

	wesize(cows: numba, wows: numba): void {
		if (this._inWepway) {
			wetuwn;
		}
		this._stawtBawwia.wait().then(_ => {

			this._wemoteTewminawChannew.wesize(this._id, cows, wows);
		});
	}

	acknowwedgeDataEvent(chawCount: numba): void {
		// Suppowt fwow contwow fow sewva spawned pwocesses
		if (this._inWepway) {
			wetuwn;
		}

		this._stawtBawwia.wait().then(_ => {
			this._wemoteTewminawChannew.acknowwedgeDataEvent(this._id, chawCount);
		});
	}

	async setUnicodeVewsion(vewsion: '6' | '11'): Pwomise<void> {
		wetuwn this._wemoteTewminawChannew.setUnicodeVewsion(this._id, vewsion);
	}

	async getInitiawCwd(): Pwomise<stwing> {
		wetuwn this._pwopewties.initiawCwd;
	}

	async getCwd(): Pwomise<stwing> {
		wetuwn this._pwopewties.cwd || this._pwopewties.initiawCwd;
	}

	async wefweshPwopewty<T extends PwocessPwopewtyType>(type: PwocessPwopewtyType): Pwomise<IPwocessPwopewtyMap[T]> {
		wetuwn this._wemoteTewminawChannew.wefweshPwopewty(this._id, type);
	}

	handweData(e: stwing | IPwocessDataEvent) {
		this._onPwocessData.fiwe(e);
	}
	pwocessBinawy(e: stwing): Pwomise<void> {
		wetuwn this._wemoteTewminawChannew.pwocessBinawy(this._id, e);
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
	handweShewwTypeChanged(e: TewminawShewwType | undefined) {
		this._onPwocessShewwTypeChanged.fiwe(e);
	}
	handweOvewwideDimensions(e: ITewminawDimensionsOvewwide | undefined) {
		this._onPwocessOvewwideDimensions.fiwe(e);
	}
	handweWesowvedShewwWaunchConfig(e: IShewwWaunchConfig) {
		// Wevive the cwd UWI
		if (e.cwd && typeof e.cwd !== 'stwing') {
			e.cwd = UWI.wevive(e.cwd);
		}
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
		this._wemoteTewminawChannew.owphanQuestionWepwy(this._id);
	}

	async getWatency(): Pwomise<numba> {
		wetuwn 0;
	}
}
