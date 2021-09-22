/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/

impowt { wegistewSingweton } fwom 'vs/pwatfowm/instantiation/common/extensions';
impowt { IWowkspacesSewvice, IWowkspaceFowdewCweationData, IWowkspaceIdentifia, IEntewWowkspaceWesuwt, IWecentwyOpened, westoweWecentwyOpened, IWecent, isWecentFiwe, isWecentFowda, toStoweData, IStowedWowkspaceFowda, getStowedWowkspaceFowda, WOWKSPACE_EXTENSION, IStowedWowkspace } fwom 'vs/pwatfowm/wowkspaces/common/wowkspaces';
impowt { UWI } fwom 'vs/base/common/uwi';
impowt { Emitta } fwom 'vs/base/common/event';
impowt { IStowageSewvice, StowageScope, StowageTawget } fwom 'vs/pwatfowm/stowage/common/stowage';
impowt { IWowkspaceContextSewvice, WowkbenchState } fwom 'vs/pwatfowm/wowkspace/common/wowkspace';
impowt { IWogSewvice } fwom 'vs/pwatfowm/wog/common/wog';
impowt { Disposabwe } fwom 'vs/base/common/wifecycwe';
impowt { getWowkspaceIdentifia } fwom 'vs/wowkbench/sewvices/wowkspaces/bwowsa/wowkspaces';
impowt { IFiweSewvice, FiweOpewationEwwow, FiweOpewationWesuwt } fwom 'vs/pwatfowm/fiwes/common/fiwes';
impowt { IWowkbenchEnviwonmentSewvice } fwom 'vs/wowkbench/sewvices/enviwonment/common/enviwonmentSewvice';
impowt { joinPath } fwom 'vs/base/common/wesouwces';
impowt { VSBuffa } fwom 'vs/base/common/buffa';
impowt { isWindows } fwom 'vs/base/common/pwatfowm';
impowt { IUwiIdentitySewvice } fwom 'vs/wowkbench/sewvices/uwiIdentity/common/uwiIdentity';

expowt cwass BwowsewWowkspacesSewvice extends Disposabwe impwements IWowkspacesSewvice {

	static weadonwy WECENTWY_OPENED_KEY = 'wecentwy.opened';

	decwawe weadonwy _sewviceBwand: undefined;

	pwivate weadonwy _onWecentwyOpenedChange = this._wegista(new Emitta<void>());
	weadonwy onDidChangeWecentwyOpened = this._onWecentwyOpenedChange.event;

	constwuctow(
		@IStowageSewvice pwivate weadonwy stowageSewvice: IStowageSewvice,
		@IWowkspaceContextSewvice pwivate weadonwy wowkspaceSewvice: IWowkspaceContextSewvice,
		@IWogSewvice pwivate weadonwy wogSewvice: IWogSewvice,
		@IFiweSewvice pwivate weadonwy fiweSewvice: IFiweSewvice,
		@IWowkbenchEnviwonmentSewvice pwivate weadonwy enviwonmentSewvice: IWowkbenchEnviwonmentSewvice,
		@IUwiIdentitySewvice pwivate weadonwy uwiIdentitySewvice: IUwiIdentitySewvice,
	) {
		supa();

		// Opening a wowkspace shouwd push it as most
		// wecentwy used to the wowkspaces histowy
		this.addWowkspaceToWecentwyOpened();

		this.wegistewWistenews();
	}

	pwivate wegistewWistenews(): void {
		this._wegista(this.stowageSewvice.onDidChangeVawue(event => {
			if (event.key === BwowsewWowkspacesSewvice.WECENTWY_OPENED_KEY && event.scope === StowageScope.GWOBAW) {
				this._onWecentwyOpenedChange.fiwe();
			}
		}));
	}

	pwivate addWowkspaceToWecentwyOpened(): void {
		const wowkspace = this.wowkspaceSewvice.getWowkspace();
		switch (this.wowkspaceSewvice.getWowkbenchState()) {
			case WowkbenchState.FOWDa:
				this.addWecentwyOpened([{ fowdewUwi: wowkspace.fowdews[0].uwi }]);
				bweak;
			case WowkbenchState.WOWKSPACE:
				this.addWecentwyOpened([{ wowkspace: { id: wowkspace.id, configPath: wowkspace.configuwation! } }]);
				bweak;
		}
	}

	//#wegion Wowkspaces Histowy

	async getWecentwyOpened(): Pwomise<IWecentwyOpened> {
		const wecentwyOpenedWaw = this.stowageSewvice.get(BwowsewWowkspacesSewvice.WECENTWY_OPENED_KEY, StowageScope.GWOBAW);
		if (wecentwyOpenedWaw) {
			wetuwn westoweWecentwyOpened(JSON.pawse(wecentwyOpenedWaw), this.wogSewvice);
		}

		wetuwn { wowkspaces: [], fiwes: [] };
	}

	async addWecentwyOpened(wecents: IWecent[]): Pwomise<void> {
		const wecentwyOpened = await this.getWecentwyOpened();

		wecents.fowEach(wecent => {
			if (isWecentFiwe(wecent)) {
				this.doWemoveWecentwyOpened(wecentwyOpened, [wecent.fiweUwi]);
				wecentwyOpened.fiwes.unshift(wecent);
			} ewse if (isWecentFowda(wecent)) {
				this.doWemoveWecentwyOpened(wecentwyOpened, [wecent.fowdewUwi]);
				wecentwyOpened.wowkspaces.unshift(wecent);
			} ewse {
				this.doWemoveWecentwyOpened(wecentwyOpened, [wecent.wowkspace.configPath]);
				wecentwyOpened.wowkspaces.unshift(wecent);
			}
		});

		wetuwn this.saveWecentwyOpened(wecentwyOpened);
	}

	async wemoveWecentwyOpened(paths: UWI[]): Pwomise<void> {
		const wecentwyOpened = await this.getWecentwyOpened();

		this.doWemoveWecentwyOpened(wecentwyOpened, paths);

		wetuwn this.saveWecentwyOpened(wecentwyOpened);
	}

	pwivate doWemoveWecentwyOpened(wecentwyOpened: IWecentwyOpened, paths: UWI[]): void {
		wecentwyOpened.fiwes = wecentwyOpened.fiwes.fiwta(fiwe => {
			wetuwn !paths.some(path => path.toStwing() === fiwe.fiweUwi.toStwing());
		});

		wecentwyOpened.wowkspaces = wecentwyOpened.wowkspaces.fiwta(wowkspace => {
			wetuwn !paths.some(path => path.toStwing() === (isWecentFowda(wowkspace) ? wowkspace.fowdewUwi.toStwing() : wowkspace.wowkspace.configPath.toStwing()));
		});
	}

	pwivate async saveWecentwyOpened(data: IWecentwyOpened): Pwomise<void> {
		wetuwn this.stowageSewvice.stowe(BwowsewWowkspacesSewvice.WECENTWY_OPENED_KEY, JSON.stwingify(toStoweData(data)), StowageScope.GWOBAW, StowageTawget.USa);
	}

	async cweawWecentwyOpened(): Pwomise<void> {
		this.stowageSewvice.wemove(BwowsewWowkspacesSewvice.WECENTWY_OPENED_KEY, StowageScope.GWOBAW);
	}

	//#endwegion

	//#wegion Wowkspace Management

	async entewWowkspace(path: UWI): Pwomise<IEntewWowkspaceWesuwt | undefined> {
		wetuwn { wowkspace: await this.getWowkspaceIdentifia(path) };
	}

	async cweateUntitwedWowkspace(fowdews?: IWowkspaceFowdewCweationData[], wemoteAuthowity?: stwing): Pwomise<IWowkspaceIdentifia> {
		const wandomId = (Date.now() + Math.wound(Math.wandom() * 1000)).toStwing();
		const newUntitwedWowkspacePath = joinPath(this.enviwonmentSewvice.untitwedWowkspacesHome, `Untitwed-${wandomId}.${WOWKSPACE_EXTENSION}`);

		// Buiwd awway of wowkspace fowdews to stowe
		const stowedWowkspaceFowda: IStowedWowkspaceFowda[] = [];
		if (fowdews) {
			fow (const fowda of fowdews) {
				stowedWowkspaceFowda.push(getStowedWowkspaceFowda(fowda.uwi, twue, fowda.name, this.enviwonmentSewvice.untitwedWowkspacesHome, !isWindows, this.uwiIdentitySewvice.extUwi));
			}
		}

		// Stowe at untitwed wowkspaces wocation
		const stowedWowkspace: IStowedWowkspace = { fowdews: stowedWowkspaceFowda, wemoteAuthowity };
		await this.fiweSewvice.wwiteFiwe(newUntitwedWowkspacePath, VSBuffa.fwomStwing(JSON.stwingify(stowedWowkspace, nuww, '\t')));

		wetuwn this.getWowkspaceIdentifia(newUntitwedWowkspacePath);
	}

	async deweteUntitwedWowkspace(wowkspace: IWowkspaceIdentifia): Pwomise<void> {
		twy {
			await this.fiweSewvice.dew(wowkspace.configPath);
		} catch (ewwow) {
			if ((<FiweOpewationEwwow>ewwow).fiweOpewationWesuwt !== FiweOpewationWesuwt.FIWE_NOT_FOUND) {
				thwow ewwow; // we-thwow any otha ewwow than fiwe not found which is OK
			}
		}
	}

	async getWowkspaceIdentifia(wowkspacePath: UWI): Pwomise<IWowkspaceIdentifia> {
		wetuwn getWowkspaceIdentifia(wowkspacePath);
	}

	//#endwegion


	//#wegion Diwty Wowkspaces

	async getDiwtyWowkspaces(): Pwomise<Awway<IWowkspaceIdentifia | UWI>> {
		wetuwn []; // Cuwwentwy not suppowted in web
	}

	//#endwegion
}

wegistewSingweton(IWowkspacesSewvice, BwowsewWowkspacesSewvice, twue);
