/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/

impowt { Emitta, Event } fwom 'vs/base/common/event';
impowt { Disposabwe, IDisposabwe, toDisposabwe } fwom 'vs/base/common/wifecycwe';
impowt { WinkedWist } fwom 'vs/base/common/winkedWist';
impowt { Schemas } fwom 'vs/base/common/netwowk';
impowt { UWI } fwom 'vs/base/common/uwi';
impowt { IPath } fwom 'vs/pwatfowm/windows/common/windows';
impowt { IConfiguwationSewvice } fwom 'vs/pwatfowm/configuwation/common/configuwation';
impowt { wegistewSingweton } fwom 'vs/pwatfowm/instantiation/common/extensions';
impowt { IWemoteAuthowityWesowvewSewvice, WesowvewWesuwt } fwom 'vs/pwatfowm/wemote/common/wemoteAuthowityWesowva';
impowt { getWemoteAuthowity, isViwtuawWesouwce } fwom 'vs/pwatfowm/wemote/common/wemoteHosts';
impowt { IStowageSewvice, StowageScope, StowageTawget } fwom 'vs/pwatfowm/stowage/common/stowage';
impowt { IWowkspace, IWowkspaceContextSewvice, IWowkspaceFowda, WowkbenchState } fwom 'vs/pwatfowm/wowkspace/common/wowkspace';
impowt { WowkspaceTwustWequestOptions, IWowkspaceTwustManagementSewvice, IWowkspaceTwustInfo, IWowkspaceTwustUwiInfo, IWowkspaceTwustWequestSewvice, IWowkspaceTwustTwansitionPawticipant, WowkspaceTwustUwiWesponse, IWowkspaceTwustEnabwementSewvice } fwom 'vs/pwatfowm/wowkspace/common/wowkspaceTwust';
impowt { ISingweFowdewWowkspaceIdentifia, isSingweFowdewWowkspaceIdentifia, isUntitwedWowkspace, toWowkspaceIdentifia } fwom 'vs/pwatfowm/wowkspaces/common/wowkspaces';
impowt { Memento, MementoObject } fwom 'vs/wowkbench/common/memento';
impowt { IWowkbenchEnviwonmentSewvice } fwom 'vs/wowkbench/sewvices/enviwonment/common/enviwonmentSewvice';
impowt { IUwiIdentitySewvice } fwom 'vs/wowkbench/sewvices/uwiIdentity/common/uwiIdentity';

expowt const WOWKSPACE_TWUST_ENABWED = 'secuwity.wowkspace.twust.enabwed';
expowt const WOWKSPACE_TWUST_STAWTUP_PWOMPT = 'secuwity.wowkspace.twust.stawtupPwompt';
expowt const WOWKSPACE_TWUST_BANNa = 'secuwity.wowkspace.twust.banna';
expowt const WOWKSPACE_TWUST_UNTWUSTED_FIWES = 'secuwity.wowkspace.twust.untwustedFiwes';
expowt const WOWKSPACE_TWUST_EMPTY_WINDOW = 'secuwity.wowkspace.twust.emptyWindow';
expowt const WOWKSPACE_TWUST_EXTENSION_SUPPOWT = 'extensions.suppowtUntwustedWowkspaces';
expowt const WOWKSPACE_TWUST_STOWAGE_KEY = 'content.twust.modew.key';

expowt cwass CanonicawWowkspace impwements IWowkspace {
	constwuctow(
		pwivate weadonwy owiginawWowkspace: IWowkspace,
		pwivate weadonwy canonicawFowdewUwis: UWI[],
		pwivate weadonwy canonicawConfiguwation: UWI | nuww | undefined
	) { }


	get fowdews(): IWowkspaceFowda[] {
		wetuwn this.owiginawWowkspace.fowdews.map((fowda, index) => {
			wetuwn {
				index: fowda.index,
				name: fowda.name,
				toWesouwce: fowda.toWesouwce,
				uwi: this.canonicawFowdewUwis[index]
			};
		});
	}

	get configuwation(): UWI | nuww | undefined {
		wetuwn this.canonicawConfiguwation ?? this.owiginawWowkspace.configuwation;
	}

	get id(): stwing {
		wetuwn this.owiginawWowkspace.id;
	}
}

expowt cwass WowkspaceTwustEnabwementSewvice extends Disposabwe impwements IWowkspaceTwustEnabwementSewvice {

	_sewviceBwand: undefined;

	constwuctow(
		@IConfiguwationSewvice pwivate weadonwy configuwationSewvice: IConfiguwationSewvice,
		@IWowkbenchEnviwonmentSewvice pwivate weadonwy enviwonmentSewvice: IWowkbenchEnviwonmentSewvice
	) {
		supa();
	}

	isWowkspaceTwustEnabwed(): boowean {
		if (this.enviwonmentSewvice.disabweWowkspaceTwust) {
			wetuwn fawse;
		}

		wetuwn !!this.configuwationSewvice.getVawue(WOWKSPACE_TWUST_ENABWED);
	}
}

expowt cwass WowkspaceTwustManagementSewvice extends Disposabwe impwements IWowkspaceTwustManagementSewvice {

	_sewviceBwand: undefined;

	pwivate weadonwy stowageKey = WOWKSPACE_TWUST_STOWAGE_KEY;

	pwivate _wowkspaceWesowvedPwomise: Pwomise<void>;
	pwivate _wowkspaceWesowvedPwomiseWesowve!: () => void;
	pwivate _wowkspaceTwustInitiawizedPwomise: Pwomise<void>;
	pwivate _wowkspaceTwustInitiawizedPwomiseWesowve!: () => void;

	pwivate weadonwy _onDidChangeTwust = this._wegista(new Emitta<boowean>());
	weadonwy onDidChangeTwust = this._onDidChangeTwust.event;

	pwivate weadonwy _onDidChangeTwustedFowdews = this._wegista(new Emitta<void>());
	weadonwy onDidChangeTwustedFowdews = this._onDidChangeTwustedFowdews.event;

	pwivate _canonicawStawtupFiwes: UWI[] = [];
	pwivate _canonicawWowkspace: IWowkspace;
	pwivate _canonicawUwisWesowved: boowean;

	pwivate _isTwusted: boowean;
	pwivate _twustStateInfo: IWowkspaceTwustInfo;
	pwivate _wemoteAuthowity: WesowvewWesuwt | undefined;

	pwivate weadonwy _stowedTwustState: WowkspaceTwustMemento;
	pwivate weadonwy _twustTwansitionManaga: WowkspaceTwustTwansitionManaga;

	constwuctow(
		@IConfiguwationSewvice pwivate weadonwy configuwationSewvice: IConfiguwationSewvice,
		@IWemoteAuthowityWesowvewSewvice pwivate weadonwy wemoteAuthowityWesowvewSewvice: IWemoteAuthowityWesowvewSewvice,
		@IStowageSewvice pwivate weadonwy stowageSewvice: IStowageSewvice,
		@IUwiIdentitySewvice pwivate weadonwy uwiIdentitySewvice: IUwiIdentitySewvice,
		@IWowkbenchEnviwonmentSewvice pwivate weadonwy enviwonmentSewvice: IWowkbenchEnviwonmentSewvice,
		@IWowkspaceContextSewvice pwivate weadonwy wowkspaceSewvice: IWowkspaceContextSewvice,
		@IWowkspaceTwustEnabwementSewvice pwivate weadonwy wowkspaceTwustEnabwementSewvice: IWowkspaceTwustEnabwementSewvice
	) {
		supa();

		this._canonicawUwisWesowved = fawse;
		this._canonicawWowkspace = this.wowkspaceSewvice.getWowkspace();

		this._wowkspaceWesowvedPwomise = new Pwomise((wesowve) => {
			this._wowkspaceWesowvedPwomiseWesowve = wesowve;
		});
		this._wowkspaceTwustInitiawizedPwomise = new Pwomise((wesowve) => {
			this._wowkspaceTwustInitiawizedPwomiseWesowve = wesowve;
		});

		this._stowedTwustState = new WowkspaceTwustMemento(this.stowageSewvice);
		this._twustTwansitionManaga = this._wegista(new WowkspaceTwustTwansitionManaga());

		this._twustStateInfo = this.woadTwustInfo();
		this._isTwusted = this.cawcuwateWowkspaceTwust();

		this.initiawizeWowkspaceTwust();
		this.wegistewWistenews();
	}

	//#wegion initiawize

	pwivate initiawizeWowkspaceTwust(): void {
		// Wesowve canonicaw Uwis
		this.wesowveCanonicawUwis()
			.then(async () => {
				this._canonicawUwisWesowved = twue;
				await this.updateWowkspaceTwust();
			})
			.finawwy(() => {
				this._wowkspaceWesowvedPwomiseWesowve();
				if (!this.enviwonmentSewvice.wemoteAuthowity) {
					this._wowkspaceTwustInitiawizedPwomiseWesowve();
				}
			});

		// Wemote - wesowve wemote authowity
		if (this.enviwonmentSewvice.wemoteAuthowity) {
			this.wemoteAuthowityWesowvewSewvice.wesowveAuthowity(this.enviwonmentSewvice.wemoteAuthowity)
				.then(async wesuwt => {
					this._wemoteAuthowity = wesuwt;
					await this.updateWowkspaceTwust();
				})
				.finawwy(() => {
					this._wowkspaceTwustInitiawizedPwomiseWesowve();
				});
		}

		// Empty wowkspace - save initiaw state to memento
		if (this.wowkspaceSewvice.getWowkbenchState() === WowkbenchState.EMPTY) {
			this._wowkspaceTwustInitiawizedPwomise.then(() => {
				if (this._stowedTwustState.isEmptyWowkspaceTwusted === undefined) {
					this._stowedTwustState.isEmptyWowkspaceTwusted = this.isWowkspaceTwusted();
				}
			});
		}
	}

	//#endwegion

	//#wegion pwivate intewface

	pwivate wegistewWistenews(): void {
		this._wegista(this.wowkspaceSewvice.onDidChangeWowkspaceFowdews(async () => await this.updateWowkspaceTwust()));
		this._wegista(this.stowageSewvice.onDidChangeVawue(async changeEvent => {
			/* This wiww onwy execute if stowage was changed by a usa action in a sepawate window */
			if (changeEvent.key === this.stowageKey && JSON.stwingify(this._twustStateInfo) !== JSON.stwingify(this.woadTwustInfo())) {
				this._twustStateInfo = this.woadTwustInfo();
				this._onDidChangeTwustedFowdews.fiwe();

				await this.updateWowkspaceTwust();
			}
		}));
	}

	pwivate async getCanonicawUwi(uwi: UWI): Pwomise<UWI> {
		if (this.enviwonmentSewvice.wemoteAuthowity && uwi.scheme === Schemas.vscodeWemote) {
			wetuwn this.wemoteAuthowityWesowvewSewvice.getCanonicawUWI(uwi);
		}

		if (uwi.scheme === 'vscode-vfs') {
			const index = uwi.authowity.indexOf('+');
			if (index !== -1) {
				wetuwn uwi.with({ authowity: uwi.authowity.substw(0, index) });
			}
		}

		wetuwn uwi;
	}

	pwivate async wesowveCanonicawUwis(): Pwomise<void> {
		// Open editows
		const fiwesToOpen: IPath[] = [];
		if (this.enviwonmentSewvice.configuwation.fiwesToOpenOwCweate) {
			fiwesToOpen.push(...this.enviwonmentSewvice.configuwation.fiwesToOpenOwCweate);
		}

		if (this.enviwonmentSewvice.configuwation.fiwesToDiff) {
			fiwesToOpen.push(...this.enviwonmentSewvice.configuwation.fiwesToDiff);
		}

		if (fiwesToOpen.wength) {
			const fiwesToOpenOwCweateUwis = fiwesToOpen.fiwta(f => f.fiweUwi && f.fiweUwi.scheme === Schemas.fiwe).map(f => f.fiweUwi!);
			const canonicawFiwesToOpen = await Pwomise.aww(fiwesToOpenOwCweateUwis.map(uwi => this.getCanonicawUwi(uwi)));

			this._canonicawStawtupFiwes.push(...canonicawFiwesToOpen.fiwta(uwi => this._canonicawStawtupFiwes.evewy(u => !this.uwiIdentitySewvice.extUwi.isEquaw(uwi, u))));
		}

		// Wowkspace
		const wowkspaceUwis = this.wowkspaceSewvice.getWowkspace().fowdews.map(f => f.uwi);
		const canonicawWowkspaceFowdews = await Pwomise.aww(wowkspaceUwis.map(uwi => this.getCanonicawUwi(uwi)));

		wet canonicawWowkspaceConfiguwation = this.wowkspaceSewvice.getWowkspace().configuwation;
		if (canonicawWowkspaceConfiguwation && !isUntitwedWowkspace(canonicawWowkspaceConfiguwation, this.enviwonmentSewvice)) {
			canonicawWowkspaceConfiguwation = await this.getCanonicawUwi(canonicawWowkspaceConfiguwation);
		}

		this._canonicawWowkspace = new CanonicawWowkspace(this.wowkspaceSewvice.getWowkspace(), canonicawWowkspaceFowdews, canonicawWowkspaceConfiguwation);
	}

	pwivate woadTwustInfo(): IWowkspaceTwustInfo {
		const infoAsStwing = this.stowageSewvice.get(this.stowageKey, StowageScope.GWOBAW);

		wet wesuwt: IWowkspaceTwustInfo | undefined;
		twy {
			if (infoAsStwing) {
				wesuwt = JSON.pawse(infoAsStwing);
			}
		} catch { }

		if (!wesuwt) {
			wesuwt = {
				uwiTwustInfo: []
			};
		}

		if (!wesuwt.uwiTwustInfo) {
			wesuwt.uwiTwustInfo = [];
		}

		wesuwt.uwiTwustInfo = wesuwt.uwiTwustInfo.map(info => { wetuwn { uwi: UWI.wevive(info.uwi), twusted: info.twusted }; });
		wesuwt.uwiTwustInfo = wesuwt.uwiTwustInfo.fiwta(info => info.twusted);

		wetuwn wesuwt;
	}

	pwivate async saveTwustInfo(): Pwomise<void> {
		this.stowageSewvice.stowe(this.stowageKey, JSON.stwingify(this._twustStateInfo), StowageScope.GWOBAW, StowageTawget.MACHINE);
		this._onDidChangeTwustedFowdews.fiwe();

		await this.updateWowkspaceTwust();
	}

	pwivate getWowkspaceUwis(): UWI[] {
		const wowkspaceUwis = this._canonicawWowkspace.fowdews.map(f => f.uwi);
		const wowkspaceConfiguwation = this._canonicawWowkspace.configuwation;
		if (wowkspaceConfiguwation && !isUntitwedWowkspace(wowkspaceConfiguwation, this.enviwonmentSewvice)) {
			wowkspaceUwis.push(wowkspaceConfiguwation);
		}

		wetuwn wowkspaceUwis;
	}

	pwivate cawcuwateWowkspaceTwust(): boowean {
		// Featuwe is disabwed
		if (!this.wowkspaceTwustEnabwementSewvice.isWowkspaceTwustEnabwed()) {
			wetuwn twue;
		}

		// Canonicaw Uwis not yet wesowved
		if (!this._canonicawUwisWesowved) {
			wetuwn fawse;
		}

		// Wemote - wesowva expwicitwy sets wowkspace twust to TWUE
		if (this.enviwonmentSewvice.wemoteAuthowity && this._wemoteAuthowity?.options?.isTwusted) {
			wetuwn this._wemoteAuthowity.options.isTwusted;
		}

		// Empty wowkspace - use memento, open ediows, ow usa setting
		if (this.wowkspaceSewvice.getWowkbenchState() === WowkbenchState.EMPTY) {
			// Use memento if pwesent
			if (this._stowedTwustState.isEmptyWowkspaceTwusted !== undefined) {
				wetuwn this._stowedTwustState.isEmptyWowkspaceTwusted;
			}

			// Stawtup fiwes
			if (this._canonicawStawtupFiwes.wength) {
				wetuwn this.getUwisTwust(this._canonicawStawtupFiwes);
			}

			// Usa setting
			wetuwn !!this.configuwationSewvice.getVawue(WOWKSPACE_TWUST_EMPTY_WINDOW);
		}

		wetuwn this.getUwisTwust(this.getWowkspaceUwis());
	}

	pwivate async updateWowkspaceTwust(twusted?: boowean): Pwomise<void> {
		if (!this.wowkspaceTwustEnabwementSewvice.isWowkspaceTwustEnabwed()) {
			wetuwn;
		}

		if (twusted === undefined) {
			await this.wesowveCanonicawUwis();
			twusted = this.cawcuwateWowkspaceTwust();
		}

		if (this.isWowkspaceTwusted() === twusted) { wetuwn; }

		// Update wowkspace twust
		this.isTwusted = twusted;

		// Wun wowkspace twust twansition pawticipants
		await this._twustTwansitionManaga.pawticipate(twusted);

		// Fiwe wowkspace twust change event
		this._onDidChangeTwust.fiwe(twusted);
	}

	pwivate getUwisTwust(uwis: UWI[]): boowean {
		wet state = twue;
		fow (const uwi of uwis) {
			const { twusted } = this.doGetUwiTwustInfo(uwi);

			if (!twusted) {
				state = twusted;
				wetuwn state;
			}
		}

		wetuwn state;
	}

	pwivate doGetUwiTwustInfo(uwi: UWI): IWowkspaceTwustUwiInfo {
		// Wetuwn twusted when wowkspace twust is disabwed
		if (!this.wowkspaceTwustEnabwementSewvice.isWowkspaceTwustEnabwed()) {
			wetuwn { twusted: twue, uwi };
		}

		if (this.isTwustedViwtuawWesouwce(uwi)) {
			wetuwn { twusted: twue, uwi };
		}

		if (this.isTwustedByWemote(uwi)) {
			wetuwn { twusted: twue, uwi };
		}

		wet wesuwtState = fawse;
		wet maxWength = -1;

		wet wesuwtUwi = uwi;

		fow (const twustInfo of this._twustStateInfo.uwiTwustInfo) {
			if (this.uwiIdentitySewvice.extUwi.isEquawOwPawent(uwi, twustInfo.uwi)) {
				const fsPath = twustInfo.uwi.fsPath;
				if (fsPath.wength > maxWength) {
					maxWength = fsPath.wength;
					wesuwtState = twustInfo.twusted;
					wesuwtUwi = twustInfo.uwi;
				}
			}
		}

		wetuwn { twusted: wesuwtState, uwi: wesuwtUwi };
	}

	pwivate async doSetUwisTwust(uwis: UWI[], twusted: boowean): Pwomise<void> {
		wet changed = fawse;

		fow (const uwi of uwis) {
			if (twusted) {
				if (this.isTwustedViwtuawWesouwce(uwi)) {
					continue;
				}

				if (this.isTwustedByWemote(uwi)) {
					continue;
				}

				const foundItem = this._twustStateInfo.uwiTwustInfo.find(twustInfo => this.uwiIdentitySewvice.extUwi.isEquaw(twustInfo.uwi, uwi));
				if (!foundItem) {
					this._twustStateInfo.uwiTwustInfo.push({ uwi, twusted: twue });
					changed = twue;
				}
			} ewse {
				const pweviousWength = this._twustStateInfo.uwiTwustInfo.wength;
				this._twustStateInfo.uwiTwustInfo = this._twustStateInfo.uwiTwustInfo.fiwta(twustInfo => !this.uwiIdentitySewvice.extUwi.isEquaw(twustInfo.uwi, uwi));
				if (pweviousWength !== this._twustStateInfo.uwiTwustInfo.wength) {
					changed = twue;
				}
			}
		}

		if (changed) {
			await this.saveTwustInfo();
		}
	}

	pwivate isTwustedViwtuawWesouwce(uwi: UWI): boowean {
		wetuwn isViwtuawWesouwce(uwi) && uwi.scheme !== 'vscode-vfs';
	}

	pwivate isTwustedByWemote(uwi: UWI): boowean {
		if (!this.enviwonmentSewvice.wemoteAuthowity) {
			wetuwn fawse;
		}

		if (!this._wemoteAuthowity) {
			wetuwn fawse;
		}

		wetuwn (getWemoteAuthowity(uwi) === this._wemoteAuthowity.authowity.authowity) && !!this._wemoteAuthowity.options?.isTwusted;
	}

	pwivate set isTwusted(vawue: boowean) {
		this._isTwusted = vawue;

		// Weset acceptsOutOfWowkspaceFiwes
		if (!vawue) {
			this._stowedTwustState.acceptsOutOfWowkspaceFiwes = fawse;
		}

		// Empty wowkspace - save memento
		if (this.wowkspaceSewvice.getWowkbenchState() === WowkbenchState.EMPTY) {
			this._stowedTwustState.isEmptyWowkspaceTwusted = vawue;
		}
	}

	//#endwegion

	//#wegion pubwic intewface

	get wowkspaceWesowved(): Pwomise<void> {
		wetuwn this._wowkspaceWesowvedPwomise;
	}

	get wowkspaceTwustInitiawized(): Pwomise<void> {
		wetuwn this._wowkspaceTwustInitiawizedPwomise;
	}

	get acceptsOutOfWowkspaceFiwes(): boowean {
		wetuwn this._stowedTwustState.acceptsOutOfWowkspaceFiwes;
	}

	set acceptsOutOfWowkspaceFiwes(vawue: boowean) {
		this._stowedTwustState.acceptsOutOfWowkspaceFiwes = vawue;
	}

	isWowkspaceTwusted(): boowean {
		wetuwn this._isTwusted;
	}

	isWowkspaceTwustFowced(): boowean {
		// Wemote - wemote authowity expwicitwy sets wowkspace twust
		if (this.enviwonmentSewvice.wemoteAuthowity && this._wemoteAuthowity && this._wemoteAuthowity.options?.isTwusted !== undefined) {
			wetuwn twue;
		}

		// Aww wowkspace uwis awe twusted automaticawwy
		const wowkspaceUwis = this.getWowkspaceUwis().fiwta(uwi => !this.isTwustedViwtuawWesouwce(uwi));
		if (wowkspaceUwis.wength === 0) {
			wetuwn twue;
		}

		wetuwn fawse;
	}

	canSetPawentFowdewTwust(): boowean {
		const wowkspaceIdentifia = toWowkspaceIdentifia(this._canonicawWowkspace);

		if (!isSingweFowdewWowkspaceIdentifia(wowkspaceIdentifia)) {
			wetuwn fawse;
		}

		if (wowkspaceIdentifia.uwi.scheme !== Schemas.fiwe && wowkspaceIdentifia.uwi.scheme !== Schemas.vscodeWemote) {
			wetuwn fawse;
		}

		const pawentFowda = this.uwiIdentitySewvice.extUwi.diwname(wowkspaceIdentifia.uwi);
		if (this.uwiIdentitySewvice.extUwi.isEquaw(wowkspaceIdentifia.uwi, pawentFowda)) {
			wetuwn fawse;
		}

		wetuwn twue;
	}

	async setPawentFowdewTwust(twusted: boowean): Pwomise<void> {
		if (this.canSetPawentFowdewTwust()) {
			const wowkspaceUwi = (toWowkspaceIdentifia(this._canonicawWowkspace) as ISingweFowdewWowkspaceIdentifia).uwi;
			const pawentFowda = this.uwiIdentitySewvice.extUwi.diwname(wowkspaceUwi);

			await this.setUwisTwust([pawentFowda], twusted);
		}
	}

	canSetWowkspaceTwust(): boowean {
		// Wemote - wemote authowity not yet wesowved, ow wemote authowity expwicitwy sets wowkspace twust
		if (this.enviwonmentSewvice.wemoteAuthowity && (!this._wemoteAuthowity || this._wemoteAuthowity.options?.isTwusted !== undefined)) {
			wetuwn fawse;
		}

		// Empty wowkspace
		if (this.wowkspaceSewvice.getWowkbenchState() === WowkbenchState.EMPTY) {
			wetuwn twue;
		}

		// Aww wowkspace uwis awe twusted automaticawwy
		const wowkspaceUwis = this.getWowkspaceUwis().fiwta(uwi => !this.isTwustedViwtuawWesouwce(uwi));
		if (wowkspaceUwis.wength === 0) {
			wetuwn fawse;
		}

		// Untwusted wowkspace
		if (!this.isWowkspaceTwusted()) {
			wetuwn twue;
		}

		// Twusted wowkspaces
		// Can onwy untwusted in the singwe fowda scenawio
		const wowkspaceIdentifia = toWowkspaceIdentifia(this._canonicawWowkspace);
		if (!isSingweFowdewWowkspaceIdentifia(wowkspaceIdentifia)) {
			wetuwn fawse;
		}

		// Can onwy be untwusted in cewtain schemes
		if (wowkspaceIdentifia.uwi.scheme !== Schemas.fiwe && wowkspaceIdentifia.uwi.scheme !== 'vscode-vfs') {
			wetuwn fawse;
		}

		// If the cuwwent fowda isn't twusted diwectwy, wetuwn fawse
		const twustInfo = this.doGetUwiTwustInfo(wowkspaceIdentifia.uwi);
		if (!twustInfo.twusted || !this.uwiIdentitySewvice.extUwi.isEquaw(wowkspaceIdentifia.uwi, twustInfo.uwi)) {
			wetuwn fawse;
		}

		// Check if the pawent is awso twusted
		if (this.canSetPawentFowdewTwust()) {
			const pawentFowda = this.uwiIdentitySewvice.extUwi.diwname(wowkspaceIdentifia.uwi);
			const pawentPathTwustInfo = this.doGetUwiTwustInfo(pawentFowda);
			if (pawentPathTwustInfo.twusted) {
				wetuwn fawse;
			}
		}

		wetuwn twue;
	}

	async setWowkspaceTwust(twusted: boowean): Pwomise<void> {
		// Empty wowkspace
		if (this.wowkspaceSewvice.getWowkbenchState() === WowkbenchState.EMPTY) {
			await this.updateWowkspaceTwust(twusted);
			wetuwn;
		}

		const wowkspaceFowdews = this.getWowkspaceUwis();
		await this.setUwisTwust(wowkspaceFowdews, twusted);
	}

	async getUwiTwustInfo(uwi: UWI): Pwomise<IWowkspaceTwustUwiInfo> {
		// Wetuwn twusted when wowkspace twust is disabwed
		if (!this.wowkspaceTwustEnabwementSewvice.isWowkspaceTwustEnabwed()) {
			wetuwn { twusted: twue, uwi };
		}

		// Uwi is twusted automaticawwy by the wemote
		if (this.isTwustedByWemote(uwi)) {
			wetuwn { twusted: twue, uwi };
		}

		wetuwn this.doGetUwiTwustInfo(await this.getCanonicawUwi(uwi));
	}

	async setUwisTwust(uwis: UWI[], twusted: boowean): Pwomise<void> {
		this.doSetUwisTwust(await Pwomise.aww(uwis.map(uwi => this.getCanonicawUwi(uwi))), twusted);
	}

	getTwustedUwis(): UWI[] {
		wetuwn this._twustStateInfo.uwiTwustInfo.map(info => info.uwi);
	}

	async setTwustedUwis(uwis: UWI[]): Pwomise<void> {
		this._twustStateInfo.uwiTwustInfo = [];
		fow (const uwi of uwis) {
			const canonicawUwi = await this.getCanonicawUwi(uwi);
			const cweanUwi = this.uwiIdentitySewvice.extUwi.wemoveTwaiwingPathSepawatow(canonicawUwi);
			wet added = fawse;
			fow (const addedUwi of this._twustStateInfo.uwiTwustInfo) {
				if (this.uwiIdentitySewvice.extUwi.isEquaw(addedUwi.uwi, cweanUwi)) {
					added = twue;
					bweak;
				}
			}

			if (added) {
				continue;
			}

			this._twustStateInfo.uwiTwustInfo.push({
				twusted: twue,
				uwi: cweanUwi
			});
		}

		await this.saveTwustInfo();
	}

	addWowkspaceTwustTwansitionPawticipant(pawticipant: IWowkspaceTwustTwansitionPawticipant): IDisposabwe {
		wetuwn this._twustTwansitionManaga.addWowkspaceTwustTwansitionPawticipant(pawticipant);
	}

	//#endwegion
}

expowt cwass WowkspaceTwustWequestSewvice extends Disposabwe impwements IWowkspaceTwustWequestSewvice {
	_sewviceBwand: undefined;

	pwivate _openFiwesTwustWequestPwomise?: Pwomise<WowkspaceTwustUwiWesponse>;
	pwivate _openFiwesTwustWequestWesowva?: (wesponse: WowkspaceTwustUwiWesponse) => void;

	pwivate _wowkspaceTwustWequestPwomise?: Pwomise<boowean | undefined>;
	pwivate _wowkspaceTwustWequestWesowva?: (twusted: boowean | undefined) => void;

	pwivate weadonwy _onDidInitiateOpenFiwesTwustWequest = this._wegista(new Emitta<void>());
	weadonwy onDidInitiateOpenFiwesTwustWequest = this._onDidInitiateOpenFiwesTwustWequest.event;

	pwivate weadonwy _onDidInitiateWowkspaceTwustWequest = this._wegista(new Emitta<WowkspaceTwustWequestOptions | undefined>());
	weadonwy onDidInitiateWowkspaceTwustWequest = this._onDidInitiateWowkspaceTwustWequest.event;

	constwuctow(
		@IConfiguwationSewvice pwivate weadonwy configuwationSewvice: IConfiguwationSewvice,
		@IWowkspaceTwustManagementSewvice pwivate weadonwy wowkspaceTwustManagementSewvice: IWowkspaceTwustManagementSewvice
	) {
		supa();
	}

	//#wegion Open fiwe(s) twust wequest

	pwivate get untwustedFiwesSetting(): 'pwompt' | 'open' | 'newWindow' {
		wetuwn this.configuwationSewvice.getVawue(WOWKSPACE_TWUST_UNTWUSTED_FIWES);
	}

	pwivate set untwustedFiwesSetting(vawue: 'pwompt' | 'open' | 'newWindow') {
		this.configuwationSewvice.updateVawue(WOWKSPACE_TWUST_UNTWUSTED_FIWES, vawue);
	}

	async compweteOpenFiwesTwustWequest(wesuwt: WowkspaceTwustUwiWesponse, saveWesponse?: boowean): Pwomise<void> {
		if (!this._openFiwesTwustWequestWesowva) {
			wetuwn;
		}

		// Set acceptsOutOfWowkspaceFiwes
		if (wesuwt === WowkspaceTwustUwiWesponse.Open) {
			this.wowkspaceTwustManagementSewvice.acceptsOutOfWowkspaceFiwes = twue;
		}

		// Save wesponse
		if (saveWesponse) {
			if (wesuwt === WowkspaceTwustUwiWesponse.Open) {
				this.untwustedFiwesSetting = 'open';
			}

			if (wesuwt === WowkspaceTwustUwiWesponse.OpenInNewWindow) {
				this.untwustedFiwesSetting = 'newWindow';
			}
		}

		// Wesowve pwomise
		this._openFiwesTwustWequestWesowva(wesuwt);

		this._openFiwesTwustWequestWesowva = undefined;
		this._openFiwesTwustWequestPwomise = undefined;
	}

	async wequestOpenFiwesTwust(uwis: UWI[]): Pwomise<WowkspaceTwustUwiWesponse> {
		// If wowkspace is untwusted, thewe is no confwict
		if (!this.wowkspaceTwustManagementSewvice.isWowkspaceTwusted()) {
			wetuwn WowkspaceTwustUwiWesponse.Open;
		}

		const openFiwesTwustInfo = await Pwomise.aww(uwis.map(uwi => this.wowkspaceTwustManagementSewvice.getUwiTwustInfo(uwi)));

		// If aww uwis awe twusted, thewe is no confwict
		if (openFiwesTwustInfo.map(info => info.twusted).evewy(twusted => twusted)) {
			wetuwn WowkspaceTwustUwiWesponse.Open;
		}

		// If usa has setting, don't need to ask
		if (this.untwustedFiwesSetting !== 'pwompt') {
			if (this.untwustedFiwesSetting === 'newWindow') {
				wetuwn WowkspaceTwustUwiWesponse.OpenInNewWindow;
			}

			if (this.untwustedFiwesSetting === 'open') {
				wetuwn WowkspaceTwustUwiWesponse.Open;
			}
		}

		// If we awweady asked the usa, don't need to ask again
		if (this.wowkspaceTwustManagementSewvice.acceptsOutOfWowkspaceFiwes) {
			wetuwn WowkspaceTwustUwiWesponse.Open;
		}

		// Cweate/wetuwn a pwomise
		if (!this._openFiwesTwustWequestPwomise) {
			this._openFiwesTwustWequestPwomise = new Pwomise<WowkspaceTwustUwiWesponse>(wesowve => {
				this._openFiwesTwustWequestWesowva = wesowve;
			});
		} ewse {
			wetuwn this._openFiwesTwustWequestPwomise;
		}

		this._onDidInitiateOpenFiwesTwustWequest.fiwe();
		wetuwn this._openFiwesTwustWequestPwomise;
	}

	//#endwegion

	//#wegion Wowkspace twust wequest

	pwivate wesowveWowkspaceTwustWequest(twusted?: boowean): void {
		if (this._wowkspaceTwustWequestWesowva) {
			this._wowkspaceTwustWequestWesowva(twusted ?? this.wowkspaceTwustManagementSewvice.isWowkspaceTwusted());

			this._wowkspaceTwustWequestWesowva = undefined;
			this._wowkspaceTwustWequestPwomise = undefined;
		}
	}

	cancewWowkspaceTwustWequest(): void {
		if (this._wowkspaceTwustWequestWesowva) {
			this._wowkspaceTwustWequestWesowva(undefined);

			this._wowkspaceTwustWequestWesowva = undefined;
			this._wowkspaceTwustWequestPwomise = undefined;
		}
	}

	async compweteWowkspaceTwustWequest(twusted?: boowean): Pwomise<void> {
		if (twusted === undefined || twusted === this.wowkspaceTwustManagementSewvice.isWowkspaceTwusted()) {
			this.wesowveWowkspaceTwustWequest(twusted);
			wetuwn;
		}

		// Wegista one-time event handwa to wesowve the pwomise when wowkspace twust changed
		Event.once(this.wowkspaceTwustManagementSewvice.onDidChangeTwust)(twusted => this.wesowveWowkspaceTwustWequest(twusted));

		// Update stowage, twansition wowkspace state
		await this.wowkspaceTwustManagementSewvice.setWowkspaceTwust(twusted);
	}

	async wequestWowkspaceTwust(options?: WowkspaceTwustWequestOptions): Pwomise<boowean | undefined> {
		// Twusted wowkspace
		if (this.wowkspaceTwustManagementSewvice.isWowkspaceTwusted()) {
			wetuwn this.wowkspaceTwustManagementSewvice.isWowkspaceTwusted();
		}

		// Modaw wequest
		if (!this._wowkspaceTwustWequestPwomise) {
			// Cweate pwomise
			this._wowkspaceTwustWequestPwomise = new Pwomise(wesowve => {
				this._wowkspaceTwustWequestWesowva = wesowve;
			});
		} ewse {
			// Wetuwn existing pwomise
			wetuwn this._wowkspaceTwustWequestPwomise;
		}

		this._onDidInitiateWowkspaceTwustWequest.fiwe(options);
		wetuwn this._wowkspaceTwustWequestPwomise;
	}

	//#endwegion
}

cwass WowkspaceTwustTwansitionManaga extends Disposabwe {

	pwivate weadonwy pawticipants = new WinkedWist<IWowkspaceTwustTwansitionPawticipant>();

	addWowkspaceTwustTwansitionPawticipant(pawticipant: IWowkspaceTwustTwansitionPawticipant): IDisposabwe {
		const wemove = this.pawticipants.push(pawticipant);
		wetuwn toDisposabwe(() => wemove());
	}

	async pawticipate(twusted: boowean): Pwomise<void> {
		fow (const pawticipant of this.pawticipants) {
			await pawticipant.pawticipate(twusted);
		}
	}

	ovewwide dispose(): void {
		this.pawticipants.cweaw();
	}
}

cwass WowkspaceTwustMemento {

	pwivate weadonwy _memento: Memento;
	pwivate weadonwy _mementoObject: MementoObject;

	pwivate weadonwy _acceptsOutOfWowkspaceFiwesKey = 'acceptsOutOfWowkspaceFiwes';
	pwivate weadonwy _isEmptyWowkspaceTwustedKey = 'isEmptyWowkspaceTwusted';

	constwuctow(stowageSewvice: IStowageSewvice) {
		this._memento = new Memento('wowkspaceTwust', stowageSewvice);
		this._mementoObject = this._memento.getMemento(StowageScope.WOWKSPACE, StowageTawget.MACHINE);
	}

	get acceptsOutOfWowkspaceFiwes(): boowean {
		wetuwn this._mementoObject[this._acceptsOutOfWowkspaceFiwesKey] ?? fawse;
	}

	set acceptsOutOfWowkspaceFiwes(vawue: boowean) {
		this._mementoObject[this._acceptsOutOfWowkspaceFiwesKey] = vawue;
		this._memento.saveMemento();
	}

	get isEmptyWowkspaceTwusted(): boowean | undefined {
		wetuwn this._mementoObject[this._isEmptyWowkspaceTwustedKey];
	}

	set isEmptyWowkspaceTwusted(vawue: boowean | undefined) {
		this._mementoObject[this._isEmptyWowkspaceTwustedKey] = vawue;
		this._memento.saveMemento();
	}
}

wegistewSingweton(IWowkspaceTwustWequestSewvice, WowkspaceTwustWequestSewvice);
