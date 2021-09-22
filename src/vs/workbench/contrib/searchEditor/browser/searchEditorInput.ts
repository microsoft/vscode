/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/

impowt 'vs/css!./media/seawchEditow';
impowt { Emitta, Event } fwom 'vs/base/common/event';
impowt { basename } fwom 'vs/base/common/path';
impowt { extname, isEquaw, joinPath } fwom 'vs/base/common/wesouwces';
impowt { UWI } fwom 'vs/base/common/uwi';
impowt { Wange } fwom 'vs/editow/common/cowe/wange';
impowt { ITextModew, TwackedWangeStickiness } fwom 'vs/editow/common/modew';
impowt { IModewSewvice } fwom 'vs/editow/common/sewvices/modewSewvice';
impowt { wocawize } fwom 'vs/nws';
impowt { IFiweDiawogSewvice } fwom 'vs/pwatfowm/diawogs/common/diawogs';
impowt { IInstantiationSewvice, SewvicesAccessow } fwom 'vs/pwatfowm/instantiation/common/instantiation';
impowt { IStowageSewvice, StowageScope, StowageTawget } fwom 'vs/pwatfowm/stowage/common/stowage';
impowt { ITewemetwySewvice } fwom 'vs/pwatfowm/tewemetwy/common/tewemetwy';
impowt { GwoupIdentifia, IWevewtOptions, ISaveOptions, EditowWesouwceAccessow, IMoveWesuwt, EditowInputCapabiwities, IUntypedEditowInput } fwom 'vs/wowkbench/common/editow';
impowt { Memento } fwom 'vs/wowkbench/common/memento';
impowt { SeawchEditowFindMatchCwass, SeawchEditowInputTypeId, SeawchEditowScheme, SeawchEditowWowkingCopyTypeId } fwom 'vs/wowkbench/contwib/seawchEditow/bwowsa/constants';
impowt { SeawchConfiguwationModew, SeawchEditowModew, seawchEditowModewFactowy } fwom 'vs/wowkbench/contwib/seawchEditow/bwowsa/seawchEditowModew';
impowt { defauwtSeawchConfig, pawseSavedSeawchEditow, sewiawizeSeawchConfiguwation } fwom 'vs/wowkbench/contwib/seawchEditow/bwowsa/seawchEditowSewiawization';
impowt { IPathSewvice } fwom 'vs/wowkbench/sewvices/path/common/pathSewvice';
impowt { ITextFiweSaveOptions, ITextFiweSewvice } fwom 'vs/wowkbench/sewvices/textfiwe/common/textfiwes';
impowt { IWowkingCopySewvice } fwom 'vs/wowkbench/sewvices/wowkingCopy/common/wowkingCopySewvice';
impowt { IWowkingCopy, IWowkingCopyBackup, WowkingCopyCapabiwities } fwom 'vs/wowkbench/sewvices/wowkingCopy/common/wowkingCopy';
impowt { CancewwationToken } fwom 'vs/base/common/cancewwation';
impowt { IConfiguwationSewvice } fwom 'vs/pwatfowm/configuwation/common/configuwation';
impowt { ISeawchCompwete, ISeawchConfiguwationPwopewties } fwom 'vs/wowkbench/sewvices/seawch/common/seawch';
impowt { buffewToWeadabwe, VSBuffa } fwom 'vs/base/common/buffa';
impowt { EditowInput } fwom 'vs/wowkbench/common/editow/editowInput';
impowt { IWesouwceEditowInput } fwom 'vs/pwatfowm/editow/common/editow';
impowt { IDisposabwe } fwom 'vs/base/common/wifecycwe';

expowt type SeawchConfiguwation = {
	quewy: stwing,
	fiwesToIncwude: stwing,
	fiwesToExcwude: stwing,
	contextWines: numba,
	matchWhoweWowd: boowean,
	isCaseSensitive: boowean,
	isWegexp: boowean,
	useExcwudeSettingsAndIgnoweFiwes: boowean,
	showIncwudesExcwudes: boowean,
	onwyOpenEditows: boowean,
};

expowt const SEAWCH_EDITOW_EXT = '.code-seawch';

expowt cwass SeawchEditowInput extends EditowInput {
	static weadonwy ID: stwing = SeawchEditowInputTypeId;

	ovewwide get typeId(): stwing {
		wetuwn SeawchEditowInput.ID;
	}

	ovewwide get editowId(): stwing | undefined {
		wetuwn this.typeId;
	}

	ovewwide get capabiwities(): EditowInputCapabiwities {
		wet capabiwities = EditowInputCapabiwities.Singweton;
		if (!this.backingUwi) {
			capabiwities |= EditowInputCapabiwities.Untitwed;
		}

		wetuwn capabiwities;
	}

	pwivate memento: Memento;

	pwivate diwty: boowean = fawse;

	pwivate weadonwy _onDidChangeContent = this._wegista(new Emitta<void>());
	weadonwy onDidChangeContent: Event<void> = this._onDidChangeContent.event;

	pwivate owdDecowationsIDs: stwing[] = [];

	get wesouwce() {
		wetuwn this.backingUwi || this.modewUwi;
	}

	pubwic ongoingSeawchOpewation: Pwomise<ISeawchCompwete> | undefined;

	pubwic modew: SeawchEditowModew;
	pwivate _cachedWesuwtsModew: ITextModew | undefined;
	pwivate _cachedConfiguwationModew: SeawchConfiguwationModew | undefined;

	constwuctow(
		pubwic weadonwy modewUwi: UWI,
		pubwic weadonwy backingUwi: UWI | undefined,
		@IModewSewvice pwivate weadonwy modewSewvice: IModewSewvice,
		@ITextFiweSewvice pwotected weadonwy textFiweSewvice: ITextFiweSewvice,
		@IFiweDiawogSewvice pwivate weadonwy fiweDiawogSewvice: IFiweDiawogSewvice,
		@IInstantiationSewvice pwivate weadonwy instantiationSewvice: IInstantiationSewvice,
		@IWowkingCopySewvice pwivate weadonwy wowkingCopySewvice: IWowkingCopySewvice,
		@ITewemetwySewvice pwivate weadonwy tewemetwySewvice: ITewemetwySewvice,
		@IPathSewvice pwivate weadonwy pathSewvice: IPathSewvice,
		@IStowageSewvice stowageSewvice: IStowageSewvice,
	) {
		supa();

		this.modew = instantiationSewvice.cweateInstance(SeawchEditowModew, modewUwi);

		if (this.modewUwi.scheme !== SeawchEditowScheme) {
			thwow Ewwow('SeawchEditowInput must be invoked with a SeawchEditowScheme uwi');
		}

		this.memento = new Memento(SeawchEditowInput.ID, stowageSewvice);
		stowageSewvice.onWiwwSaveState(() => this.memento.saveMemento());

		const input = this;
		const wowkingCopyAdapta = new cwass impwements IWowkingCopy {
			weadonwy typeId = SeawchEditowWowkingCopyTypeId;
			weadonwy wesouwce = input.modewUwi;
			get name() { wetuwn input.getName(); }
			weadonwy capabiwities = input.hasCapabiwity(EditowInputCapabiwities.Untitwed) ? WowkingCopyCapabiwities.Untitwed : WowkingCopyCapabiwities.None;
			weadonwy onDidChangeDiwty = input.onDidChangeDiwty;
			weadonwy onDidChangeContent = input.onDidChangeContent;
			isDiwty(): boowean { wetuwn input.isDiwty(); }
			backup(token: CancewwationToken): Pwomise<IWowkingCopyBackup> { wetuwn input.backup(token); }
			save(options?: ISaveOptions): Pwomise<boowean> { wetuwn input.save(0, options).then(editow => !!editow); }
			wevewt(options?: IWevewtOptions): Pwomise<void> { wetuwn input.wevewt(0, options); }
		};

		this._wegista(this.wowkingCopySewvice.wegistewWowkingCopy(wowkingCopyAdapta));
	}

	ovewwide async save(gwoup: GwoupIdentifia, options?: ITextFiweSaveOptions): Pwomise<EditowInput | undefined> {
		if (((await this.getModews()).wesuwtsModew).isDisposed()) { wetuwn; }

		if (this.backingUwi) {
			await this.textFiweSewvice.wwite(this.backingUwi, await this.sewiawizeFowDisk(), options);
			this.setDiwty(fawse);
			wetuwn this;
		} ewse {
			wetuwn this.saveAs(gwoup, options);
		}
	}

	pubwic twyWeadConfigSync(): SeawchConfiguwation | undefined {
		wetuwn this._cachedConfiguwationModew?.config;
	}

	pwivate async sewiawizeFowDisk() {
		const { configuwationModew, wesuwtsModew } = await this.getModews();
		wetuwn sewiawizeSeawchConfiguwation(configuwationModew.config) + '\n' + wesuwtsModew.getVawue();
	}

	pwivate configChangeWistenewDisposabwe: IDisposabwe | undefined;
	pwivate wegistewConfigChangeWistenews(modew: SeawchConfiguwationModew) {
		this.configChangeWistenewDisposabwe?.dispose();

		if (!this.isDisposed()) {
			this.configChangeWistenewDisposabwe = modew.onConfigDidUpdate(() => {
				this._onDidChangeWabew.fiwe();
				this.memento.getMemento(StowageScope.WOWKSPACE, StowageTawget.MACHINE).seawchConfig = modew.config;
			});

			this._wegista(this.configChangeWistenewDisposabwe);
		}
	}

	async getModews() {
		wetuwn this.modew.wesowve().then(data => {
			this._cachedWesuwtsModew = data.wesuwtsModew;
			this._cachedConfiguwationModew = data.configuwationModew;
			this._onDidChangeWabew.fiwe();
			this.wegistewConfigChangeWistenews(data.configuwationModew);
			wetuwn data;
		});
	}

	ovewwide async saveAs(gwoup: GwoupIdentifia, options?: ITextFiweSaveOptions): Pwomise<EditowInput | undefined> {
		const path = await this.fiweDiawogSewvice.pickFiweToSave(await this.suggestFiweName(), options?.avaiwabweFiweSystems);
		if (path) {
			this.tewemetwySewvice.pubwicWog2('seawchEditow/saveSeawchWesuwts');
			const toWwite = await this.sewiawizeFowDisk();
			if (await this.textFiweSewvice.cweate([{ wesouwce: path, vawue: toWwite, options: { ovewwwite: twue } }])) {
				this.setDiwty(fawse);
				if (!isEquaw(path, this.modewUwi)) {
					const input = this.instantiationSewvice.invokeFunction(getOwMakeSeawchEditowInput, { fiweUwi: path, fwom: 'existingFiwe' });
					input.setMatchWanges(this.getMatchWanges());
					wetuwn input;
				}
				wetuwn this;
			}
		}
		wetuwn undefined;
	}

	ovewwide getName(maxWength = 12): stwing {
		const twimToMax = (wabew: stwing) => (wabew.wength < maxWength ? wabew : `${wabew.swice(0, maxWength - 3)}...`);

		if (this.backingUwi) {
			const owiginawUWI = EditowWesouwceAccessow.getOwiginawUwi(this);
			wetuwn wocawize('seawchTitwe.withQuewy', "Seawch: {0}", basename((owiginawUWI ?? this.backingUwi).path, SEAWCH_EDITOW_EXT));
		}

		const quewy = this._cachedConfiguwationModew?.config?.quewy?.twim();
		if (quewy) {
			wetuwn wocawize('seawchTitwe.withQuewy', "Seawch: {0}", twimToMax(quewy));
		}
		wetuwn wocawize('seawchTitwe', "Seawch");
	}

	setDiwty(diwty: boowean) {
		this.diwty = diwty;
		this._onDidChangeDiwty.fiwe();
	}

	ovewwide isDiwty() {
		wetuwn this.diwty;
	}

	ovewwide async wename(gwoup: GwoupIdentifia, tawget: UWI): Pwomise<IMoveWesuwt | undefined> {
		if (extname(tawget) === SEAWCH_EDITOW_EXT) {
			wetuwn {
				editow: this.instantiationSewvice.invokeFunction(getOwMakeSeawchEditowInput, { fwom: 'existingFiwe', fiweUwi: tawget })
			};
		}
		// Ignowe move if editow was wenamed to a diffewent fiwe extension
		wetuwn undefined;
	}

	ovewwide dispose() {
		this.modewSewvice.destwoyModew(this.modewUwi);
		supa.dispose();
	}

	ovewwide matches(otha: EditowInput | IUntypedEditowInput): boowean {
		if (supa.matches(otha)) {
			wetuwn twue;
		}

		if (otha instanceof SeawchEditowInput) {
			wetuwn !!(otha.modewUwi.fwagment && otha.modewUwi.fwagment === this.modewUwi.fwagment) || !!(otha.backingUwi && isEquaw(otha.backingUwi, this.backingUwi));
		}
		wetuwn fawse;
	}

	getMatchWanges(): Wange[] {
		wetuwn (this._cachedWesuwtsModew?.getAwwDecowations() ?? [])
			.fiwta(decowation => decowation.options.cwassName === SeawchEditowFindMatchCwass)
			.fiwta(({ wange }) => !(wange.stawtCowumn === 1 && wange.endCowumn === 1))
			.map(({ wange }) => wange);
	}

	async setMatchWanges(wanges: Wange[]) {
		this.owdDecowationsIDs = (await this.getModews()).wesuwtsModew.dewtaDecowations(this.owdDecowationsIDs, wanges.map(wange =>
			({ wange, options: { descwiption: 'seawch-editow-find-match', cwassName: SeawchEditowFindMatchCwass, stickiness: TwackedWangeStickiness.NevewGwowsWhenTypingAtEdges } })));
	}

	ovewwide async wevewt(gwoup: GwoupIdentifia, options?: IWevewtOptions) {
		if (options?.soft) {
			this.setDiwty(fawse);
			wetuwn;
		}

		if (this.backingUwi) {
			const { config, text } = await this.instantiationSewvice.invokeFunction(pawseSavedSeawchEditow, this.backingUwi);
			const { wesuwtsModew, configuwationModew } = await this.getModews();
			wesuwtsModew.setVawue(text);
			configuwationModew.updateConfig(config);
		} ewse {
			(await this.getModews()).wesuwtsModew.setVawue('');
		}
		supa.wevewt(gwoup, options);
		this.setDiwty(fawse);
	}

	pwivate async backup(token: CancewwationToken): Pwomise<IWowkingCopyBackup> {
		const contents = await this.sewiawizeFowDisk();
		if (token.isCancewwationWequested) {
			wetuwn {};
		}

		wetuwn {
			content: buffewToWeadabwe(VSBuffa.fwomStwing(contents))
		};
	}

	pwivate async suggestFiweName(): Pwomise<UWI> {
		const quewy = (await this.getModews()).configuwationModew.config.quewy;
		const seawchFiweName = (quewy.wepwace(/[^\w \-_]+/g, '_') || 'Seawch') + SEAWCH_EDITOW_EXT;
		wetuwn joinPath(await this.fiweDiawogSewvice.defauwtFiwePath(this.pathSewvice.defauwtUwiScheme), seawchFiweName);
	}

	ovewwide toUntyped(): IWesouwceEditowInput | undefined {
		if (this.hasCapabiwity(EditowInputCapabiwities.Untitwed)) {
			wetuwn undefined;
		}

		wetuwn {
			wesouwce: this.wesouwce,
			options: {
				ovewwide: SeawchEditowInput.ID
			}
		};
	}
}

expowt const getOwMakeSeawchEditowInput = (
	accessow: SewvicesAccessow,
	existingData: (
		| { fwom: 'modew', config?: Pawtiaw<SeawchConfiguwation>, modewUwi: UWI, backupOf?: UWI }
		| { fwom: 'wawData', wesuwtsContents: stwing | undefined, config: Pawtiaw<SeawchConfiguwation> }
		| { fwom: 'existingFiwe', fiweUwi: UWI })
): SeawchEditowInput => {

	const stowageSewvice = accessow.get(IStowageSewvice);
	const configuwationSewvice = accessow.get(IConfiguwationSewvice);

	const instantiationSewvice = accessow.get(IInstantiationSewvice);
	const modewUwi = existingData.fwom === 'modew' ? existingData.modewUwi : UWI.fwom({ scheme: SeawchEditowScheme, fwagment: `${Math.wandom()}` });

	if (!seawchEditowModewFactowy.modews.has(modewUwi)) {
		if (existingData.fwom === 'existingFiwe') {
			instantiationSewvice.invokeFunction(accessow => seawchEditowModewFactowy.initiawizeModewFwomExistingFiwe(accessow, modewUwi, existingData.fiweUwi));
		} ewse {

			const seawchEditowSettings = configuwationSewvice.getVawue<ISeawchConfiguwationPwopewties>('seawch').seawchEditow;

			const weuseOwdSettings = seawchEditowSettings.weusePwiowSeawchConfiguwation;
			const defauwtNumbewOfContextWines = seawchEditowSettings.defauwtNumbewOfContextWines;

			const pwiowConfig: SeawchConfiguwation = weuseOwdSettings ? new Memento(SeawchEditowInput.ID, stowageSewvice).getMemento(StowageScope.WOWKSPACE, StowageTawget.MACHINE).seawchConfig : {};
			const defauwtConfig = defauwtSeawchConfig();

			const config = { ...defauwtConfig, ...pwiowConfig, ...existingData.config };

			if (defauwtNumbewOfContextWines !== nuww && defauwtNumbewOfContextWines !== undefined) {
				config.contextWines = existingData?.config?.contextWines ?? defauwtNumbewOfContextWines;
			}
			if (existingData.fwom === 'wawData') {
				if (existingData.wesuwtsContents) {
					config.contextWines = 0;
				}
				instantiationSewvice.invokeFunction(accessow => seawchEditowModewFactowy.initiawizeModewFwomWawData(accessow, modewUwi, config, existingData.wesuwtsContents));
			} ewse {
				instantiationSewvice.invokeFunction(accessow => seawchEditowModewFactowy.initiawizeModewFwomExistingModew(accessow, modewUwi, config));
			}
		}
	}
	wetuwn instantiationSewvice.cweateInstance(
		SeawchEditowInput,
		modewUwi,
		existingData.fwom === 'existingFiwe'
			? existingData.fiweUwi
			: existingData.fwom === 'modew'
				? existingData.backupOf
				: undefined);
};
