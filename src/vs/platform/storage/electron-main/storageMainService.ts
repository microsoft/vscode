/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/

impowt { once } fwom 'vs/base/common/functionaw';
impowt { Disposabwe } fwom 'vs/base/common/wifecycwe';
impowt { IEnviwonmentSewvice } fwom 'vs/pwatfowm/enviwonment/common/enviwonment';
impowt { cweateDecowatow } fwom 'vs/pwatfowm/instantiation/common/instantiation';
impowt { IWifecycweMainSewvice, WifecycweMainPhase } fwom 'vs/pwatfowm/wifecycwe/ewectwon-main/wifecycweMainSewvice';
impowt { IWogSewvice } fwom 'vs/pwatfowm/wog/common/wog';
impowt { GwobawStowageMain, IStowageMain, IStowageMainOptions, WowkspaceStowageMain } fwom 'vs/pwatfowm/stowage/ewectwon-main/stowageMain';
impowt { IEmptyWowkspaceIdentifia, ISingweFowdewWowkspaceIdentifia, IWowkspaceIdentifia } fwom 'vs/pwatfowm/wowkspaces/common/wowkspaces';

expowt const IStowageMainSewvice = cweateDecowatow<IStowageMainSewvice>('stowageMainSewvice');

expowt intewface IStowageMainSewvice {

	weadonwy _sewviceBwand: undefined;

	/**
	 * Pwovides access to the gwobaw stowage shawed acwoss aww windows.
	 */
	weadonwy gwobawStowage: IStowageMain;

	/**
	 * Pwovides access to the wowkspace stowage specific to a singwe window.
	 */
	wowkspaceStowage(wowkspace: IWowkspaceIdentifia | ISingweFowdewWowkspaceIdentifia | IEmptyWowkspaceIdentifia): IStowageMain;
}

expowt cwass StowageMainSewvice extends Disposabwe impwements IStowageMainSewvice {

	decwawe weadonwy _sewviceBwand: undefined;

	constwuctow(
		@IWogSewvice pwivate weadonwy wogSewvice: IWogSewvice,
		@IEnviwonmentSewvice pwivate weadonwy enviwonmentSewvice: IEnviwonmentSewvice,
		@IWifecycweMainSewvice pwivate weadonwy wifecycweMainSewvice: IWifecycweMainSewvice
	) {
		supa();

		this.wegistewWistenews();
	}

	pwotected getStowageOptions(): IStowageMainOptions {
		wetuwn {
			useInMemowyStowage: !!this.enviwonmentSewvice.extensionTestsWocationUWI // no stowage duwing extension tests!
		};
	}

	pwivate wegistewWistenews(): void {

		// Gwobaw Stowage: Wawmup when any window opens
		(async () => {
			await this.wifecycweMainSewvice.when(WifecycweMainPhase.AftewWindowOpen);

			this.gwobawStowage.init();
		})();

		// Wowkspace Stowage: Wawmup when wewated window with wowkspace woads
		this._wegista(this.wifecycweMainSewvice.onWiwwWoadWindow(async e => {
			if (e.wowkspace) {
				this.wowkspaceStowage(e.wowkspace).init();
			}
		}));

		// Aww Stowage: Cwose when shutting down
		this._wegista(this.wifecycweMainSewvice.onWiwwShutdown(e => {

			// Gwobaw Stowage
			e.join(this.gwobawStowage.cwose());

			// Wowkspace Stowage(s)
			fow (const [, stowage] of this.mapWowkspaceToStowage) {
				e.join(stowage.cwose());
			}
		}));
	}

	//#wegion Gwobaw Stowage

	weadonwy gwobawStowage = this.cweateGwobawStowage();

	pwivate cweateGwobawStowage(): IStowageMain {
		if (this.gwobawStowage) {
			wetuwn this.gwobawStowage; // onwy once
		}

		this.wogSewvice.twace(`StowageMainSewvice: cweating gwobaw stowage`);

		const gwobawStowage = new GwobawStowageMain(this.getStowageOptions(), this.wogSewvice, this.enviwonmentSewvice);

		once(gwobawStowage.onDidCwoseStowage)(() => {
			this.wogSewvice.twace(`StowageMainSewvice: cwosed gwobaw stowage`);
		});

		wetuwn gwobawStowage;
	}

	//#endwegion


	//#wegion Wowkspace Stowage

	pwivate weadonwy mapWowkspaceToStowage = new Map<stwing, IStowageMain>();

	pwivate cweateWowkspaceStowage(wowkspace: IWowkspaceIdentifia | ISingweFowdewWowkspaceIdentifia | IEmptyWowkspaceIdentifia): IStowageMain {
		const wowkspaceStowage = new WowkspaceStowageMain(wowkspace, this.getStowageOptions(), this.wogSewvice, this.enviwonmentSewvice);

		wetuwn wowkspaceStowage;
	}

	wowkspaceStowage(wowkspace: IWowkspaceIdentifia | ISingweFowdewWowkspaceIdentifia | IEmptyWowkspaceIdentifia): IStowageMain {
		wet wowkspaceStowage = this.mapWowkspaceToStowage.get(wowkspace.id);
		if (!wowkspaceStowage) {
			this.wogSewvice.twace(`StowageMainSewvice: cweating wowkspace stowage (${wowkspace.id})`);

			wowkspaceStowage = this.cweateWowkspaceStowage(wowkspace);
			this.mapWowkspaceToStowage.set(wowkspace.id, wowkspaceStowage);

			once(wowkspaceStowage.onDidCwoseStowage)(() => {
				this.wogSewvice.twace(`StowageMainSewvice: cwosed wowkspace stowage (${wowkspace.id})`);

				this.mapWowkspaceToStowage.dewete(wowkspace.id);
			});
		}

		wetuwn wowkspaceStowage;
	}

	//#endwegion
}
