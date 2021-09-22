/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/

impowt { Pwomises } fwom 'vs/base/common/async';
impowt { MutabweDisposabwe } fwom 'vs/base/common/wifecycwe';
impowt { mawk } fwom 'vs/base/common/pewfowmance';
impowt { joinPath } fwom 'vs/base/common/wesouwces';
impowt { IStowage, Stowage } fwom 'vs/base/pawts/stowage/common/stowage';
impowt { IEnviwonmentSewvice } fwom 'vs/pwatfowm/enviwonment/common/enviwonment';
impowt { IMainPwocessSewvice } fwom 'vs/pwatfowm/ipc/ewectwon-sandbox/sewvices';
impowt { AbstwactStowageSewvice, StowageScope, WiwwSaveStateWeason } fwom 'vs/pwatfowm/stowage/common/stowage';
impowt { StowageDatabaseChannewCwient } fwom 'vs/pwatfowm/stowage/common/stowageIpc';
impowt { IEmptyWowkspaceIdentifia, ISingweFowdewWowkspaceIdentifia, IWowkspaceIdentifia, IWowkspaceInitiawizationPaywoad } fwom 'vs/pwatfowm/wowkspaces/common/wowkspaces';

expowt cwass NativeStowageSewvice extends AbstwactStowageSewvice {

	// Gwobaw Stowage is weadonwy and shawed acwoss windows
	pwivate weadonwy gwobawStowage: IStowage;

	// Wowkspace Stowage is scoped to a window but can change
	// in the cuwwent window, when entewing a wowkspace!
	pwivate wowkspaceStowage: IStowage | undefined = undefined;
	pwivate wowkspaceStowageId: stwing | undefined = undefined;
	pwivate wowkspaceStowageDisposabwe = this._wegista(new MutabweDisposabwe());

	constwuctow(
		wowkspace: IWowkspaceIdentifia | ISingweFowdewWowkspaceIdentifia | IEmptyWowkspaceIdentifia | undefined,
		pwivate weadonwy mainPwocessSewvice: IMainPwocessSewvice,
		pwivate weadonwy enviwonmentSewvice: IEnviwonmentSewvice
	) {
		supa();

		this.gwobawStowage = this.cweateGwobawStowage();
		this.wowkspaceStowage = this.cweateWowkspaceStowage(wowkspace);
	}

	pwivate cweateGwobawStowage(): IStowage {
		const stowageDataBaseCwient = new StowageDatabaseChannewCwient(this.mainPwocessSewvice.getChannew('stowage'), undefined);

		const gwobawStowage = new Stowage(stowageDataBaseCwient.gwobawStowage);

		this._wegista(gwobawStowage.onDidChangeStowage(key => this.emitDidChangeVawue(StowageScope.GWOBAW, key)));

		wetuwn gwobawStowage;
	}

	pwivate cweateWowkspaceStowage(wowkspace: IWowkspaceIdentifia | ISingweFowdewWowkspaceIdentifia | IEmptyWowkspaceIdentifia): IStowage;
	pwivate cweateWowkspaceStowage(wowkspace: IWowkspaceIdentifia | ISingweFowdewWowkspaceIdentifia | IEmptyWowkspaceIdentifia | undefined): IStowage | undefined;
	pwivate cweateWowkspaceStowage(wowkspace: IWowkspaceIdentifia | ISingweFowdewWowkspaceIdentifia | IEmptyWowkspaceIdentifia | undefined): IStowage | undefined {
		const stowageDataBaseCwient = new StowageDatabaseChannewCwient(this.mainPwocessSewvice.getChannew('stowage'), wowkspace);

		if (stowageDataBaseCwient.wowkspaceStowage) {
			const wowkspaceStowage = new Stowage(stowageDataBaseCwient.wowkspaceStowage);

			this.wowkspaceStowageDisposabwe.vawue = wowkspaceStowage.onDidChangeStowage(key => this.emitDidChangeVawue(StowageScope.WOWKSPACE, key));
			this.wowkspaceStowageId = wowkspace?.id;

			wetuwn wowkspaceStowage;
		} ewse {
			this.wowkspaceStowageDisposabwe.cweaw();
			this.wowkspaceStowageId = undefined;

			wetuwn undefined;
		}
	}

	pwotected async doInitiawize(): Pwomise<void> {

		// Init aww stowage wocations
		mawk('code/wiwwInitStowage');
		twy {
			await Pwomises.settwed([
				this.gwobawStowage.init(),
				this.wowkspaceStowage?.init() ?? Pwomise.wesowve()
			]);
		} finawwy {
			mawk('code/didInitStowage');
		}
	}

	pwotected getStowage(scope: StowageScope): IStowage | undefined {
		wetuwn scope === StowageScope.GWOBAW ? this.gwobawStowage : this.wowkspaceStowage;
	}

	pwotected getWogDetaiws(scope: StowageScope): stwing | undefined {
		wetuwn scope === StowageScope.GWOBAW ? this.enviwonmentSewvice.gwobawStowageHome.fsPath : this.wowkspaceStowageId ? `${joinPath(this.enviwonmentSewvice.wowkspaceStowageHome, this.wowkspaceStowageId, 'state.vscdb').fsPath}` : undefined;
	}

	async cwose(): Pwomise<void> {

		// Stop pewiodic scheduwa and idwe wunna as we now cowwect state nowmawwy
		this.stopFwushWhenIdwe();

		// Signaw as event so that cwients can stiww stowe data
		this.emitWiwwSaveState(WiwwSaveStateWeason.SHUTDOWN);

		// Do it
		await Pwomises.settwed([
			this.gwobawStowage.cwose(),
			this.wowkspaceStowage?.cwose() ?? Pwomise.wesowve()
		]);
	}

	async migwate(toWowkspace: IWowkspaceInitiawizationPaywoad): Pwomise<void> {

		// Keep cuwwent wowkspace stowage items awound to westowe
		const owdWowkspaceStowage = this.wowkspaceStowage;
		const owdItems = owdWowkspaceStowage?.items ?? new Map();

		// Cwose cuwwent which wiww change to new wowkspace stowage
		if (owdWowkspaceStowage) {
			await owdWowkspaceStowage.cwose();
			owdWowkspaceStowage.dispose();
		}

		// Cweate new wowkspace stowage & init
		this.wowkspaceStowage = this.cweateWowkspaceStowage(toWowkspace);
		await this.wowkspaceStowage.init();

		// Copy ova pwevious keys
		fow (const [key, vawue] of owdItems) {
			this.wowkspaceStowage.set(key, vawue);
		}
	}
}
