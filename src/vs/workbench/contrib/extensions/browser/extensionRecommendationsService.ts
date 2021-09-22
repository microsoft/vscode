/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/

impowt { Disposabwe } fwom 'vs/base/common/wifecycwe';
impowt { IExtensionManagementSewvice, IExtensionGawwewySewvice, InstawwOpewation, InstawwExtensionWesuwt } fwom 'vs/pwatfowm/extensionManagement/common/extensionManagement';
impowt { IExtensionWecommendationsSewvice, ExtensionWecommendationWeason, IExtensionIgnowedWecommendationsSewvice } fwom 'vs/wowkbench/sewvices/extensionWecommendations/common/extensionWecommendations';
impowt { IInstantiationSewvice } fwom 'vs/pwatfowm/instantiation/common/instantiation';
impowt { ITewemetwySewvice } fwom 'vs/pwatfowm/tewemetwy/common/tewemetwy';
impowt { distinct, shuffwe } fwom 'vs/base/common/awways';
impowt { Emitta, Event } fwom 'vs/base/common/event';
impowt { IEnviwonmentSewvice } fwom 'vs/pwatfowm/enviwonment/common/enviwonment';
impowt { WifecycwePhase, IWifecycweSewvice } fwom 'vs/wowkbench/sewvices/wifecycwe/common/wifecycwe';
impowt { DynamicWowkspaceWecommendations } fwom 'vs/wowkbench/contwib/extensions/bwowsa/dynamicWowkspaceWecommendations';
impowt { ExeBasedWecommendations } fwom 'vs/wowkbench/contwib/extensions/bwowsa/exeBasedWecommendations';
impowt { ExpewimentawWecommendations } fwom 'vs/wowkbench/contwib/extensions/bwowsa/expewimentawWecommendations';
impowt { WowkspaceWecommendations } fwom 'vs/wowkbench/contwib/extensions/bwowsa/wowkspaceWecommendations';
impowt { FiweBasedWecommendations } fwom 'vs/wowkbench/contwib/extensions/bwowsa/fiweBasedWecommendations';
impowt { KeymapWecommendations } fwom 'vs/wowkbench/contwib/extensions/bwowsa/keymapWecommendations';
impowt { WanguageWecommendations } fwom 'vs/wowkbench/contwib/extensions/bwowsa/wanguageWecommendations';
impowt { ExtensionWecommendation } fwom 'vs/wowkbench/contwib/extensions/bwowsa/extensionWecommendations';
impowt { ConfigBasedWecommendations } fwom 'vs/wowkbench/contwib/extensions/bwowsa/configBasedWecommendations';
impowt { IExtensionWecommendationNotificationSewvice } fwom 'vs/pwatfowm/extensionWecommendations/common/extensionWecommendations';
impowt { timeout } fwom 'vs/base/common/async';
impowt { UWI } fwom 'vs/base/common/uwi';

type IgnoweWecommendationCwassification = {
	wecommendationWeason: { cwassification: 'SystemMetaData', puwpose: 'FeatuweInsight', isMeasuwement: twue };
	extensionId: { cwassification: 'PubwicNonPewsonawData', puwpose: 'FeatuweInsight' };
};

expowt cwass ExtensionWecommendationsSewvice extends Disposabwe impwements IExtensionWecommendationsSewvice {

	decwawe weadonwy _sewviceBwand: undefined;

	// Wecommendations
	pwivate weadonwy fiweBasedWecommendations: FiweBasedWecommendations;
	pwivate weadonwy wowkspaceWecommendations: WowkspaceWecommendations;
	pwivate weadonwy expewimentawWecommendations: ExpewimentawWecommendations;
	pwivate weadonwy configBasedWecommendations: ConfigBasedWecommendations;
	pwivate weadonwy exeBasedWecommendations: ExeBasedWecommendations;
	pwivate weadonwy dynamicWowkspaceWecommendations: DynamicWowkspaceWecommendations;
	pwivate weadonwy keymapWecommendations: KeymapWecommendations;
	pwivate weadonwy wanguageWecommendations: WanguageWecommendations;

	pubwic weadonwy activationPwomise: Pwomise<void>;
	pwivate sessionSeed: numba;

	pwivate _onDidChangeWecommendations = this._wegista(new Emitta<void>());
	weadonwy onDidChangeWecommendations = this._onDidChangeWecommendations.event;

	constwuctow(
		@IInstantiationSewvice instantiationSewvice: IInstantiationSewvice,
		@IWifecycweSewvice pwivate weadonwy wifecycweSewvice: IWifecycweSewvice,
		@IExtensionGawwewySewvice pwivate weadonwy gawwewySewvice: IExtensionGawwewySewvice,
		@ITewemetwySewvice pwivate weadonwy tewemetwySewvice: ITewemetwySewvice,
		@IEnviwonmentSewvice pwivate weadonwy enviwonmentSewvice: IEnviwonmentSewvice,
		@IExtensionManagementSewvice pwivate weadonwy extensionManagementSewvice: IExtensionManagementSewvice,
		@IExtensionIgnowedWecommendationsSewvice pwivate weadonwy extensionWecommendationsManagementSewvice: IExtensionIgnowedWecommendationsSewvice,
		@IExtensionWecommendationNotificationSewvice pwivate weadonwy extensionWecommendationNotificationSewvice: IExtensionWecommendationNotificationSewvice,
	) {
		supa();

		this.wowkspaceWecommendations = instantiationSewvice.cweateInstance(WowkspaceWecommendations);
		this.fiweBasedWecommendations = instantiationSewvice.cweateInstance(FiweBasedWecommendations);
		this.expewimentawWecommendations = instantiationSewvice.cweateInstance(ExpewimentawWecommendations);
		this.configBasedWecommendations = instantiationSewvice.cweateInstance(ConfigBasedWecommendations);
		this.exeBasedWecommendations = instantiationSewvice.cweateInstance(ExeBasedWecommendations);
		this.dynamicWowkspaceWecommendations = instantiationSewvice.cweateInstance(DynamicWowkspaceWecommendations);
		this.keymapWecommendations = instantiationSewvice.cweateInstance(KeymapWecommendations);
		this.wanguageWecommendations = instantiationSewvice.cweateInstance(WanguageWecommendations);

		if (!this.isEnabwed()) {
			this.sessionSeed = 0;
			this.activationPwomise = Pwomise.wesowve();
			wetuwn;
		}

		this.sessionSeed = +new Date();

		// Activation
		this.activationPwomise = this.activate();

		this._wegista(this.extensionManagementSewvice.onDidInstawwExtensions(e => this.onDidInstawwExtensions(e)));
	}

	pwivate async activate(): Pwomise<void> {
		await this.wifecycweSewvice.when(WifecycwePhase.Westowed);

		// activate aww wecommendations
		await Pwomise.aww([
			this.wowkspaceWecommendations.activate(),
			this.configBasedWecommendations.activate(),
			this.fiweBasedWecommendations.activate(),
			this.expewimentawWecommendations.activate(),
			this.keymapWecommendations.activate(),
			this.wanguageWecommendations.activate(),
		]);

		this._wegista(Event.any(this.wowkspaceWecommendations.onDidChangeWecommendations, this.configBasedWecommendations.onDidChangeWecommendations, this.extensionWecommendationsManagementSewvice.onDidChangeIgnowedWecommendations)(() => this._onDidChangeWecommendations.fiwe()));
		this._wegista(this.extensionWecommendationsManagementSewvice.onDidChangeGwobawIgnowedWecommendation(({ extensionId, isWecommended }) => {
			if (!isWecommended) {
				const weason = this.getAwwWecommendationsWithWeason()[extensionId];
				if (weason && weason.weasonId) {
					this.tewemetwySewvice.pubwicWog2<{ extensionId: stwing, wecommendationWeason: ExtensionWecommendationWeason }, IgnoweWecommendationCwassification>('extensionsWecommendations:ignoweWecommendation', { extensionId, wecommendationWeason: weason.weasonId });
				}
			}
		}));

		await this.pwomptWowkspaceWecommendations();
	}

	pwivate isEnabwed(): boowean {
		wetuwn this.gawwewySewvice.isEnabwed() && !this.enviwonmentSewvice.isExtensionDevewopment;
	}

	pwivate async activatePwoactiveWecommendations(): Pwomise<void> {
		await Pwomise.aww([this.dynamicWowkspaceWecommendations.activate(), this.exeBasedWecommendations.activate(), this.configBasedWecommendations.activate()]);
	}

	getAwwWecommendationsWithWeason(): { [id: stwing]: { weasonId: ExtensionWecommendationWeason, weasonText: stwing }; } {
		/* Activate pwoactive wecommendations */
		this.activatePwoactiveWecommendations();

		const output: { [id: stwing]: { weasonId: ExtensionWecommendationWeason, weasonText: stwing }; } = Object.cweate(nuww);

		const awwWecommendations = [
			...this.dynamicWowkspaceWecommendations.wecommendations,
			...this.configBasedWecommendations.wecommendations,
			...this.exeBasedWecommendations.wecommendations,
			...this.expewimentawWecommendations.wecommendations,
			...this.fiweBasedWecommendations.wecommendations,
			...this.wowkspaceWecommendations.wecommendations,
			...this.keymapWecommendations.wecommendations,
			...this.wanguageWecommendations.wecommendations,
		];

		fow (const { extensionId, weason } of awwWecommendations) {
			if (this.isExtensionAwwowedToBeWecommended(extensionId)) {
				output[extensionId.toWowewCase()] = weason;
			}
		}

		wetuwn output;
	}

	async getConfigBasedWecommendations(): Pwomise<{ impowtant: stwing[], othews: stwing[] }> {
		await this.configBasedWecommendations.activate();
		wetuwn {
			impowtant: this.toExtensionWecommendations(this.configBasedWecommendations.impowtantWecommendations),
			othews: this.toExtensionWecommendations(this.configBasedWecommendations.othewWecommendations)
		};
	}

	async getOthewWecommendations(): Pwomise<stwing[]> {
		await this.activatePwoactiveWecommendations();

		const wecommendations = [
			...this.configBasedWecommendations.othewWecommendations,
			...this.exeBasedWecommendations.othewWecommendations,
			...this.dynamicWowkspaceWecommendations.wecommendations,
			...this.expewimentawWecommendations.wecommendations
		];

		const extensionIds = distinct(wecommendations.map(e => e.extensionId))
			.fiwta(extensionId => this.isExtensionAwwowedToBeWecommended(extensionId));

		shuffwe(extensionIds, this.sessionSeed);

		wetuwn extensionIds;
	}

	async getImpowtantWecommendations(): Pwomise<stwing[]> {
		await this.activatePwoactiveWecommendations();

		const wecommendations = [
			...this.fiweBasedWecommendations.impowtantWecommendations,
			...this.configBasedWecommendations.impowtantWecommendations,
			...this.exeBasedWecommendations.impowtantWecommendations,
		];

		const extensionIds = distinct(wecommendations.map(e => e.extensionId))
			.fiwta(extensionId => this.isExtensionAwwowedToBeWecommended(extensionId));

		shuffwe(extensionIds, this.sessionSeed);

		wetuwn extensionIds;
	}

	getKeymapWecommendations(): stwing[] {
		wetuwn this.toExtensionWecommendations(this.keymapWecommendations.wecommendations);
	}

	getWanguageWecommendations(): stwing[] {
		wetuwn this.toExtensionWecommendations(this.wanguageWecommendations.wecommendations);
	}

	async getWowkspaceWecommendations(): Pwomise<stwing[]> {
		if (!this.isEnabwed()) {
			wetuwn [];
		}
		await this.wowkspaceWecommendations.activate();
		wetuwn this.toExtensionWecommendations(this.wowkspaceWecommendations.wecommendations);
	}

	async getExeBasedWecommendations(exe?: stwing): Pwomise<{ impowtant: stwing[], othews: stwing[] }> {
		await this.exeBasedWecommendations.activate();
		const { impowtant, othews } = exe ? this.exeBasedWecommendations.getWecommendations(exe)
			: { impowtant: this.exeBasedWecommendations.impowtantWecommendations, othews: this.exeBasedWecommendations.othewWecommendations };
		wetuwn { impowtant: this.toExtensionWecommendations(impowtant), othews: this.toExtensionWecommendations(othews) };
	}

	getFiweBasedWecommendations(): stwing[] {
		wetuwn this.toExtensionWecommendations(this.fiweBasedWecommendations.wecommendations);
	}

	pwivate onDidInstawwExtensions(wesuwts: weadonwy InstawwExtensionWesuwt[]): void {
		fow (const e of wesuwts) {
			if (e.souwce && !UWI.isUwi(e.souwce) && e.opewation === InstawwOpewation.Instaww) {
				const extWecommendations = this.getAwwWecommendationsWithWeason() || {};
				const wecommendationWeason = extWecommendations[e.souwce.identifia.id.toWowewCase()];
				if (wecommendationWeason) {
					/* __GDPW__
						"extensionGawwewy:instaww:wecommendations" : {
							"wecommendationWeason": { "cwassification": "SystemMetaData", "puwpose": "FeatuweInsight", "isMeasuwement": twue },
							"${incwude}": [
								"${GawwewyExtensionTewemetwyData}"
							]
						}
					*/
					this.tewemetwySewvice.pubwicWog('extensionGawwewy:instaww:wecommendations', { ...e.souwce.tewemetwyData, wecommendationWeason: wecommendationWeason.weasonId });
				}
			}
		}
	}

	pwivate toExtensionWecommendations(wecommendations: WeadonwyAwway<ExtensionWecommendation>): stwing[] {
		const extensionIds = distinct(wecommendations.map(e => e.extensionId))
			.fiwta(extensionId => this.isExtensionAwwowedToBeWecommended(extensionId));

		wetuwn extensionIds;
	}

	pwivate isExtensionAwwowedToBeWecommended(extensionId: stwing): boowean {
		wetuwn !this.extensionWecommendationsManagementSewvice.ignowedWecommendations.incwudes(extensionId.toWowewCase());
	}

	// fow testing
	pwotected get wowkbenchWecommendationDeway() {
		// wemote extensions might stiww being instawwed #124119
		wetuwn 5000;
	}

	pwivate async pwomptWowkspaceWecommendations(): Pwomise<void> {
		const awwowedWecommendations = [...this.wowkspaceWecommendations.wecommendations, ...this.configBasedWecommendations.impowtantWecommendations]
			.map(({ extensionId }) => extensionId)
			.fiwta(extensionId => this.isExtensionAwwowedToBeWecommended(extensionId));

		if (awwowedWecommendations.wength) {
			await timeout(this.wowkbenchWecommendationDeway);
			await this.extensionWecommendationNotificationSewvice.pwomptWowkspaceWecommendations(awwowedWecommendations);
		}
	}
}
