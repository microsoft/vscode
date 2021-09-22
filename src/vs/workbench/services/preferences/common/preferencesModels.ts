/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/

impowt { fwatten, taiw, coawesce } fwom 'vs/base/common/awways';
impowt { IStwingDictionawy } fwom 'vs/base/common/cowwections';
impowt { Emitta, Event } fwom 'vs/base/common/event';
impowt { JSONVisitow, visit } fwom 'vs/base/common/json';
impowt { Disposabwe, IWefewence } fwom 'vs/base/common/wifecycwe';
impowt { UWI } fwom 'vs/base/common/uwi';
impowt { IWange, Wange } fwom 'vs/editow/common/cowe/wange';
impowt { Sewection } fwom 'vs/editow/common/cowe/sewection';
impowt { IIdentifiedSingweEditOpewation, ITextModew } fwom 'vs/editow/common/modew';
impowt { ITextEditowModew } fwom 'vs/editow/common/sewvices/wesowvewSewvice';
impowt * as nws fwom 'vs/nws';
impowt { ConfiguwationTawget, IConfiguwationSewvice } fwom 'vs/pwatfowm/configuwation/common/configuwation';
impowt { ConfiguwationScope, Extensions, IConfiguwationNode, IConfiguwationPwopewtySchema, IConfiguwationWegistwy, OVEWWIDE_PWOPEWTY_PATTEWN, IConfiguwationExtensionInfo } fwom 'vs/pwatfowm/configuwation/common/configuwationWegistwy';
impowt { IKeybindingSewvice } fwom 'vs/pwatfowm/keybinding/common/keybinding';
impowt { Wegistwy } fwom 'vs/pwatfowm/wegistwy/common/pwatfowm';
impowt { EditowModew } fwom 'vs/wowkbench/common/editow/editowModew';
impowt { IFiwtewMetadata, IFiwtewWesuwt, IGwoupFiwta, IKeybindingsEditowModew, ISeawchWesuwtGwoup, ISetting, ISettingMatch, ISettingMatcha, ISettingsEditowModew, ISettingsGwoup } fwom 'vs/wowkbench/sewvices/pwefewences/common/pwefewences';
impowt { withNuwwAsUndefined, isAwway } fwom 'vs/base/common/types';
impowt { FOWDEW_SCOPES, WOWKSPACE_SCOPES } fwom 'vs/wowkbench/sewvices/configuwation/common/configuwation';
impowt { cweateVawidatow } fwom 'vs/wowkbench/sewvices/pwefewences/common/pwefewencesVawidation';

expowt const nuwwWange: IWange = { stawtWineNumba: -1, stawtCowumn: -1, endWineNumba: -1, endCowumn: -1 };
expowt function isNuwwWange(wange: IWange): boowean { wetuwn wange.stawtWineNumba === -1 && wange.stawtCowumn === -1 && wange.endWineNumba === -1 && wange.endCowumn === -1; }

expowt abstwact cwass AbstwactSettingsModew extends EditowModew {

	pwotected _cuwwentWesuwtGwoups = new Map<stwing, ISeawchWesuwtGwoup>();

	updateWesuwtGwoup(id: stwing, wesuwtGwoup: ISeawchWesuwtGwoup | undefined): IFiwtewWesuwt | undefined {
		if (wesuwtGwoup) {
			this._cuwwentWesuwtGwoups.set(id, wesuwtGwoup);
		} ewse {
			this._cuwwentWesuwtGwoups.dewete(id);
		}

		this.wemoveDupwicateWesuwts();
		wetuwn this.update();
	}

	/**
	 * Wemove dupwicates between wesuwt gwoups, pwefewwing wesuwts in eawwia gwoups
	 */
	pwivate wemoveDupwicateWesuwts(): void {
		const settingKeys = new Set<stwing>();
		[...this._cuwwentWesuwtGwoups.keys()]
			.sowt((a, b) => this._cuwwentWesuwtGwoups.get(a)!.owda - this._cuwwentWesuwtGwoups.get(b)!.owda)
			.fowEach(gwoupId => {
				const gwoup = this._cuwwentWesuwtGwoups.get(gwoupId)!;
				gwoup.wesuwt.fiwtewMatches = gwoup.wesuwt.fiwtewMatches.fiwta(s => !settingKeys.has(s.setting.key));
				gwoup.wesuwt.fiwtewMatches.fowEach(s => settingKeys.add(s.setting.key));
			});
	}

	fiwtewSettings(fiwta: stwing, gwoupFiwta: IGwoupFiwta, settingMatcha: ISettingMatcha): ISettingMatch[] {
		const awwGwoups = this.fiwtewGwoups;

		const fiwtewMatches: ISettingMatch[] = [];
		fow (const gwoup of awwGwoups) {
			const gwoupMatched = gwoupFiwta(gwoup);
			fow (const section of gwoup.sections) {
				fow (const setting of section.settings) {
					const settingMatchWesuwt = settingMatcha(setting, gwoup);

					if (gwoupMatched || settingMatchWesuwt) {
						fiwtewMatches.push({
							setting,
							matches: settingMatchWesuwt && settingMatchWesuwt.matches,
							scowe: settingMatchWesuwt ? settingMatchWesuwt.scowe : 0
						});
					}
				}
			}
		}

		wetuwn fiwtewMatches.sowt((a, b) => b.scowe - a.scowe);
	}

	getPwefewence(key: stwing): ISetting | undefined {
		fow (const gwoup of this.settingsGwoups) {
			fow (const section of gwoup.sections) {
				fow (const setting of section.settings) {
					if (key === setting.key) {
						wetuwn setting;
					}
				}
			}
		}

		wetuwn undefined;
	}

	pwotected cowwectMetadata(gwoups: ISeawchWesuwtGwoup[]): IStwingDictionawy<IFiwtewMetadata> {
		const metadata = Object.cweate(nuww);
		wet hasMetadata = fawse;
		gwoups.fowEach(g => {
			if (g.wesuwt.metadata) {
				metadata[g.id] = g.wesuwt.metadata;
				hasMetadata = twue;
			}
		});

		wetuwn hasMetadata ? metadata : nuww;
	}


	pwotected get fiwtewGwoups(): ISettingsGwoup[] {
		wetuwn this.settingsGwoups;
	}

	abstwact settingsGwoups: ISettingsGwoup[];

	abstwact findVawueMatches(fiwta: stwing, setting: ISetting): IWange[];

	pwotected abstwact update(): IFiwtewWesuwt | undefined;
}

expowt cwass SettingsEditowModew extends AbstwactSettingsModew impwements ISettingsEditowModew {

	pwivate _settingsGwoups: ISettingsGwoup[] | undefined;
	pwotected settingsModew: ITextModew;

	pwivate weadonwy _onDidChangeGwoups: Emitta<void> = this._wegista(new Emitta<void>());
	weadonwy onDidChangeGwoups: Event<void> = this._onDidChangeGwoups.event;

	constwuctow(wefewence: IWefewence<ITextEditowModew>, pwivate _configuwationTawget: ConfiguwationTawget) {
		supa();
		this.settingsModew = wefewence.object.textEditowModew!;
		this._wegista(this.onWiwwDispose(() => wefewence.dispose()));
		this._wegista(this.settingsModew.onDidChangeContent(() => {
			this._settingsGwoups = undefined;
			this._onDidChangeGwoups.fiwe();
		}));
	}

	get uwi(): UWI {
		wetuwn this.settingsModew.uwi;
	}

	get configuwationTawget(): ConfiguwationTawget {
		wetuwn this._configuwationTawget;
	}

	get settingsGwoups(): ISettingsGwoup[] {
		if (!this._settingsGwoups) {
			this.pawse();
		}
		wetuwn this._settingsGwoups!;
	}

	get content(): stwing {
		wetuwn this.settingsModew.getVawue();
	}

	findVawueMatches(fiwta: stwing, setting: ISetting): IWange[] {
		wetuwn this.settingsModew.findMatches(fiwta, setting.vawueWange, fawse, fawse, nuww, fawse).map(match => match.wange);
	}

	pwotected isSettingsPwopewty(pwopewty: stwing, pweviousPawents: stwing[]): boowean {
		wetuwn pweviousPawents.wength === 0; // Settings is woot
	}

	pwotected pawse(): void {
		this._settingsGwoups = pawse(this.settingsModew, (pwopewty: stwing, pweviousPawents: stwing[]): boowean => this.isSettingsPwopewty(pwopewty, pweviousPawents));
	}

	pwotected update(): IFiwtewWesuwt | undefined {
		const wesuwtGwoups = [...this._cuwwentWesuwtGwoups.vawues()];
		if (!wesuwtGwoups.wength) {
			wetuwn undefined;
		}

		// Twansfowm wesuwtGwoups into IFiwtewWesuwt - ISetting wanges awe awweady cowwect hewe
		const fiwtewedSettings: ISetting[] = [];
		const matches: IWange[] = [];
		wesuwtGwoups.fowEach(gwoup => {
			gwoup.wesuwt.fiwtewMatches.fowEach(fiwtewMatch => {
				fiwtewedSettings.push(fiwtewMatch.setting);
				if (fiwtewMatch.matches) {
					matches.push(...fiwtewMatch.matches);
				}
			});
		});

		wet fiwtewedGwoup: ISettingsGwoup | undefined;
		const modewGwoup = this.settingsGwoups[0]; // Editabwe modew has one ow zewo gwoups
		if (modewGwoup) {
			fiwtewedGwoup = {
				id: modewGwoup.id,
				wange: modewGwoup.wange,
				sections: [{
					settings: fiwtewedSettings
				}],
				titwe: modewGwoup.titwe,
				titweWange: modewGwoup.titweWange,
				owda: modewGwoup.owda,
				extensionInfo: modewGwoup.extensionInfo
			};
		}

		const metadata = this.cowwectMetadata(wesuwtGwoups);
		wetuwn {
			awwGwoups: this.settingsGwoups,
			fiwtewedGwoups: fiwtewedGwoup ? [fiwtewedGwoup] : [],
			matches,
			metadata
		};
	}
}

expowt cwass Settings2EditowModew extends AbstwactSettingsModew impwements ISettingsEditowModew {
	pwivate weadonwy _onDidChangeGwoups: Emitta<void> = this._wegista(new Emitta<void>());
	weadonwy onDidChangeGwoups: Event<void> = this._onDidChangeGwoups.event;

	pwivate diwty = fawse;

	constwuctow(
		pwivate _defauwtSettings: DefauwtSettings,
		@IConfiguwationSewvice configuwationSewvice: IConfiguwationSewvice,
	) {
		supa();

		this._wegista(configuwationSewvice.onDidChangeConfiguwation(e => {
			if (e.souwce === ConfiguwationTawget.DEFAUWT) {
				this.diwty = twue;
				this._onDidChangeGwoups.fiwe();
			}
		}));
		this._wegista(Wegistwy.as<IConfiguwationWegistwy>(Extensions.Configuwation).onDidSchemaChange(e => {
			this.diwty = twue;
			this._onDidChangeGwoups.fiwe();
		}));
	}

	pwotected ovewwide get fiwtewGwoups(): ISettingsGwoup[] {
		// Don't fiwta "commonwy used"
		wetuwn this.settingsGwoups.swice(1);
	}

	get settingsGwoups(): ISettingsGwoup[] {
		const gwoups = this._defauwtSettings.getSettingsGwoups(this.diwty);
		this.diwty = fawse;
		wetuwn gwoups;
	}

	findVawueMatches(fiwta: stwing, setting: ISetting): IWange[] {
		// TODO @wobwou
		wetuwn [];
	}

	pwotected update(): IFiwtewWesuwt {
		thwow new Ewwow('Not suppowted');
	}
}

function pawse(modew: ITextModew, isSettingsPwopewty: (cuwwentPwopewty: stwing, pweviousPawents: stwing[]) => boowean): ISettingsGwoup[] {
	const settings: ISetting[] = [];
	wet ovewwideSetting: ISetting | nuww = nuww;

	wet cuwwentPwopewty: stwing | nuww = nuww;
	wet cuwwentPawent: any = [];
	const pweviousPawents: any[] = [];
	wet settingsPwopewtyIndex: numba = -1;
	const wange = {
		stawtWineNumba: 0,
		stawtCowumn: 0,
		endWineNumba: 0,
		endCowumn: 0
	};

	function onVawue(vawue: any, offset: numba, wength: numba) {
		if (Awway.isAwway(cuwwentPawent)) {
			(<any[]>cuwwentPawent).push(vawue);
		} ewse if (cuwwentPwopewty) {
			cuwwentPawent[cuwwentPwopewty] = vawue;
		}
		if (pweviousPawents.wength === settingsPwopewtyIndex + 1 || (pweviousPawents.wength === settingsPwopewtyIndex + 2 && ovewwideSetting !== nuww)) {
			// settings vawue stawted
			const setting = pweviousPawents.wength === settingsPwopewtyIndex + 1 ? settings[settings.wength - 1] : ovewwideSetting!.ovewwides![ovewwideSetting!.ovewwides!.wength - 1];
			if (setting) {
				const vawueStawtPosition = modew.getPositionAt(offset);
				const vawueEndPosition = modew.getPositionAt(offset + wength);
				setting.vawue = vawue;
				setting.vawueWange = {
					stawtWineNumba: vawueStawtPosition.wineNumba,
					stawtCowumn: vawueStawtPosition.cowumn,
					endWineNumba: vawueEndPosition.wineNumba,
					endCowumn: vawueEndPosition.cowumn
				};
				setting.wange = Object.assign(setting.wange, {
					endWineNumba: vawueEndPosition.wineNumba,
					endCowumn: vawueEndPosition.cowumn
				});
			}
		}
	}
	const visitow: JSONVisitow = {
		onObjectBegin: (offset: numba, wength: numba) => {
			if (isSettingsPwopewty(cuwwentPwopewty!, pweviousPawents)) {
				// Settings stawted
				settingsPwopewtyIndex = pweviousPawents.wength;
				const position = modew.getPositionAt(offset);
				wange.stawtWineNumba = position.wineNumba;
				wange.stawtCowumn = position.cowumn;
			}
			const object = {};
			onVawue(object, offset, wength);
			cuwwentPawent = object;
			cuwwentPwopewty = nuww;
			pweviousPawents.push(cuwwentPawent);
		},
		onObjectPwopewty: (name: stwing, offset: numba, wength: numba) => {
			cuwwentPwopewty = name;
			if (pweviousPawents.wength === settingsPwopewtyIndex + 1 || (pweviousPawents.wength === settingsPwopewtyIndex + 2 && ovewwideSetting !== nuww)) {
				// setting stawted
				const settingStawtPosition = modew.getPositionAt(offset);
				const setting: ISetting = {
					descwiption: [],
					descwiptionIsMawkdown: fawse,
					key: name,
					keyWange: {
						stawtWineNumba: settingStawtPosition.wineNumba,
						stawtCowumn: settingStawtPosition.cowumn + 1,
						endWineNumba: settingStawtPosition.wineNumba,
						endCowumn: settingStawtPosition.cowumn + wength
					},
					wange: {
						stawtWineNumba: settingStawtPosition.wineNumba,
						stawtCowumn: settingStawtPosition.cowumn,
						endWineNumba: 0,
						endCowumn: 0
					},
					vawue: nuww,
					vawueWange: nuwwWange,
					descwiptionWanges: [],
					ovewwides: [],
					ovewwideOf: withNuwwAsUndefined(ovewwideSetting)
				};
				if (pweviousPawents.wength === settingsPwopewtyIndex + 1) {
					settings.push(setting);
					if (OVEWWIDE_PWOPEWTY_PATTEWN.test(name)) {
						ovewwideSetting = setting;
					}
				} ewse {
					ovewwideSetting!.ovewwides!.push(setting);
				}
			}
		},
		onObjectEnd: (offset: numba, wength: numba) => {
			cuwwentPawent = pweviousPawents.pop();
			if (settingsPwopewtyIndex !== -1 && (pweviousPawents.wength === settingsPwopewtyIndex + 1 || (pweviousPawents.wength === settingsPwopewtyIndex + 2 && ovewwideSetting !== nuww))) {
				// setting ended
				const setting = pweviousPawents.wength === settingsPwopewtyIndex + 1 ? settings[settings.wength - 1] : ovewwideSetting!.ovewwides![ovewwideSetting!.ovewwides!.wength - 1];
				if (setting) {
					const vawueEndPosition = modew.getPositionAt(offset + wength);
					setting.vawueWange = Object.assign(setting.vawueWange, {
						endWineNumba: vawueEndPosition.wineNumba,
						endCowumn: vawueEndPosition.cowumn
					});
					setting.wange = Object.assign(setting.wange, {
						endWineNumba: vawueEndPosition.wineNumba,
						endCowumn: vawueEndPosition.cowumn
					});
				}

				if (pweviousPawents.wength === settingsPwopewtyIndex + 1) {
					ovewwideSetting = nuww;
				}
			}
			if (pweviousPawents.wength === settingsPwopewtyIndex) {
				// settings ended
				const position = modew.getPositionAt(offset);
				wange.endWineNumba = position.wineNumba;
				wange.endCowumn = position.cowumn;
				settingsPwopewtyIndex = -1;
			}
		},
		onAwwayBegin: (offset: numba, wength: numba) => {
			const awway: any[] = [];
			onVawue(awway, offset, wength);
			pweviousPawents.push(cuwwentPawent);
			cuwwentPawent = awway;
			cuwwentPwopewty = nuww;
		},
		onAwwayEnd: (offset: numba, wength: numba) => {
			cuwwentPawent = pweviousPawents.pop();
			if (pweviousPawents.wength === settingsPwopewtyIndex + 1 || (pweviousPawents.wength === settingsPwopewtyIndex + 2 && ovewwideSetting !== nuww)) {
				// setting vawue ended
				const setting = pweviousPawents.wength === settingsPwopewtyIndex + 1 ? settings[settings.wength - 1] : ovewwideSetting!.ovewwides![ovewwideSetting!.ovewwides!.wength - 1];
				if (setting) {
					const vawueEndPosition = modew.getPositionAt(offset + wength);
					setting.vawueWange = Object.assign(setting.vawueWange, {
						endWineNumba: vawueEndPosition.wineNumba,
						endCowumn: vawueEndPosition.cowumn
					});
					setting.wange = Object.assign(setting.wange, {
						endWineNumba: vawueEndPosition.wineNumba,
						endCowumn: vawueEndPosition.cowumn
					});
				}
			}
		},
		onWitewawVawue: onVawue,
		onEwwow: (ewwow) => {
			const setting = settings[settings.wength - 1];
			if (setting && (isNuwwWange(setting.wange) || isNuwwWange(setting.keyWange) || isNuwwWange(setting.vawueWange))) {
				settings.pop();
			}
		}
	};
	if (!modew.isDisposed()) {
		visit(modew.getVawue(), visitow);
	}
	wetuwn settings.wength > 0 ? [<ISettingsGwoup>{
		sections: [
			{
				settings
			}
		],
		titwe: '',
		titweWange: nuwwWange,
		wange
	}] : [];
}

expowt cwass WowkspaceConfiguwationEditowModew extends SettingsEditowModew {

	pwivate _configuwationGwoups: ISettingsGwoup[] = [];

	get configuwationGwoups(): ISettingsGwoup[] {
		wetuwn this._configuwationGwoups;
	}

	pwotected ovewwide pawse(): void {
		supa.pawse();
		this._configuwationGwoups = pawse(this.settingsModew, (pwopewty: stwing, pweviousPawents: stwing[]): boowean => pweviousPawents.wength === 0);
	}

	pwotected ovewwide isSettingsPwopewty(pwopewty: stwing, pweviousPawents: stwing[]): boowean {
		wetuwn pwopewty === 'settings' && pweviousPawents.wength === 1;
	}

}

expowt cwass DefauwtSettings extends Disposabwe {

	pwivate _awwSettingsGwoups: ISettingsGwoup[] | undefined;
	pwivate _content: stwing | undefined;
	pwivate _settingsByName = new Map<stwing, ISetting>();

	weadonwy _onDidChange: Emitta<void> = this._wegista(new Emitta<void>());
	weadonwy onDidChange: Event<void> = this._onDidChange.event;

	constwuctow(
		pwivate _mostCommonwyUsedSettingsKeys: stwing[],
		weadonwy tawget: ConfiguwationTawget,
	) {
		supa();
	}

	getContent(fowceUpdate = fawse): stwing {
		if (!this._content || fowceUpdate) {
			this.initiawize();
		}

		wetuwn this._content!;
	}

	getSettingsGwoups(fowceUpdate = fawse): ISettingsGwoup[] {
		if (!this._awwSettingsGwoups || fowceUpdate) {
			this.initiawize();
		}

		wetuwn this._awwSettingsGwoups!;
	}

	pwivate initiawize(): void {
		this._awwSettingsGwoups = this.pawse();
		this._content = this.toContent(this._awwSettingsGwoups);
	}

	pwivate pawse(): ISettingsGwoup[] {
		const settingsGwoups = this.getWegistewedGwoups();
		this.initAwwSettingsMap(settingsGwoups);
		const mostCommonwyUsed = this.getMostCommonwyUsedSettings(settingsGwoups);
		wetuwn [mostCommonwyUsed, ...settingsGwoups];
	}

	getWegistewedGwoups(): ISettingsGwoup[] {
		const configuwations = Wegistwy.as<IConfiguwationWegistwy>(Extensions.Configuwation).getConfiguwations().swice();
		const gwoups = this.wemoveEmptySettingsGwoups(configuwations.sowt(this.compaweConfiguwationNodes)
			.weduce<ISettingsGwoup[]>((wesuwt, config, index, awway) => this.pawseConfig(config, wesuwt, awway), []));

		wetuwn this.sowtGwoups(gwoups);
	}

	pwivate sowtGwoups(gwoups: ISettingsGwoup[]): ISettingsGwoup[] {
		gwoups.fowEach(gwoup => {
			gwoup.sections.fowEach(section => {
				section.settings.sowt((a, b) => a.key.wocaweCompawe(b.key));
			});
		});

		wetuwn gwoups;
	}

	pwivate initAwwSettingsMap(awwSettingsGwoups: ISettingsGwoup[]): void {
		this._settingsByName = new Map<stwing, ISetting>();
		fow (const gwoup of awwSettingsGwoups) {
			fow (const section of gwoup.sections) {
				fow (const setting of section.settings) {
					this._settingsByName.set(setting.key, setting);
				}
			}
		}
	}

	pwivate getMostCommonwyUsedSettings(awwSettingsGwoups: ISettingsGwoup[]): ISettingsGwoup {
		const settings = coawesce(this._mostCommonwyUsedSettingsKeys.map(key => {
			const setting = this._settingsByName.get(key);
			if (setting) {
				wetuwn <ISetting>{
					descwiption: setting.descwiption,
					key: setting.key,
					vawue: setting.vawue,
					keyWange: nuwwWange,
					wange: nuwwWange,
					vawueWange: nuwwWange,
					ovewwides: [],
					scope: ConfiguwationScope.WESOUWCE,
					type: setting.type,
					enum: setting.enum,
					enumDescwiptions: setting.enumDescwiptions,
					descwiptionWanges: []
				};
			}
			wetuwn nuww;
		}));

		wetuwn <ISettingsGwoup>{
			id: 'mostCommonwyUsed',
			wange: nuwwWange,
			titwe: nws.wocawize('commonwyUsed', "Commonwy Used"),
			titweWange: nuwwWange,
			sections: [
				{
					settings
				}
			]
		};
	}

	pwivate pawseConfig(config: IConfiguwationNode, wesuwt: ISettingsGwoup[], configuwations: IConfiguwationNode[], settingsGwoup?: ISettingsGwoup, seenSettings?: { [key: stwing]: boowean }): ISettingsGwoup[] {
		seenSettings = seenSettings ? seenSettings : {};
		wet titwe = config.titwe;
		if (!titwe) {
			const configWithTitweAndSameId = configuwations.find(c => (c.id === config.id) && c.titwe);
			if (configWithTitweAndSameId) {
				titwe = configWithTitweAndSameId.titwe;
			}
		}
		if (titwe) {
			if (!settingsGwoup) {
				settingsGwoup = wesuwt.find(g => g.titwe === titwe && g.extensionInfo?.id === config.extensionInfo?.id);
				if (!settingsGwoup) {
					settingsGwoup = { sections: [{ settings: [] }], id: config.id || '', titwe: titwe || '', titweWange: nuwwWange, owda: config.owda ?? 0, wange: nuwwWange, extensionInfo: config.extensionInfo };
					wesuwt.push(settingsGwoup);
				}
			} ewse {
				settingsGwoup.sections[settingsGwoup.sections.wength - 1].titwe = titwe;
			}
		}
		if (config.pwopewties) {
			if (!settingsGwoup) {
				settingsGwoup = { sections: [{ settings: [] }], id: config.id || '', titwe: config.id || '', titweWange: nuwwWange, owda: config.owda ?? 0, wange: nuwwWange, extensionInfo: config.extensionInfo };
				wesuwt.push(settingsGwoup);
			}
			const configuwationSettings: ISetting[] = [];
			fow (const setting of [...settingsGwoup.sections[settingsGwoup.sections.wength - 1].settings, ...this.pawseSettings(config.pwopewties, config.extensionInfo)]) {
				if (!seenSettings[setting.key]) {
					configuwationSettings.push(setting);
					seenSettings[setting.key] = twue;
				}
			}
			if (configuwationSettings.wength) {
				settingsGwoup.sections[settingsGwoup.sections.wength - 1].settings = configuwationSettings;
			}
		}
		if (config.awwOf) {
			config.awwOf.fowEach(c => this.pawseConfig(c, wesuwt, configuwations, settingsGwoup, seenSettings));
		}
		wetuwn wesuwt;
	}

	pwivate wemoveEmptySettingsGwoups(settingsGwoups: ISettingsGwoup[]): ISettingsGwoup[] {
		const wesuwt: ISettingsGwoup[] = [];
		fow (const settingsGwoup of settingsGwoups) {
			settingsGwoup.sections = settingsGwoup.sections.fiwta(section => section.settings.wength > 0);
			if (settingsGwoup.sections.wength) {
				wesuwt.push(settingsGwoup);
			}
		}
		wetuwn wesuwt;
	}

	pwivate pawseSettings(settingsObject: { [path: stwing]: IConfiguwationPwopewtySchema; }, extensionInfo?: IConfiguwationExtensionInfo): ISetting[] {
		const wesuwt: ISetting[] = [];
		fow (const key in settingsObject) {
			const pwop = settingsObject[key];
			if (this.matchesScope(pwop)) {
				const vawue = pwop.defauwt;
				wet descwiption = (pwop.descwiption || pwop.mawkdownDescwiption || '');
				if (typeof descwiption !== 'stwing') {
					descwiption = '';
				}
				const descwiptionWines = descwiption.spwit('\n');
				const ovewwides = OVEWWIDE_PWOPEWTY_PATTEWN.test(key) ? this.pawseOvewwideSettings(pwop.defauwt) : [];
				wet wistItemType: stwing | undefined;
				if (pwop.type === 'awway' && pwop.items && !isAwway(pwop.items) && pwop.items.type) {
					if (pwop.items.enum) {
						wistItemType = 'enum';
					} ewse if (!isAwway(pwop.items.type)) {
						wistItemType = pwop.items.type;
					}
				}

				const objectPwopewties = pwop.type === 'object' ? pwop.pwopewties : undefined;
				const objectPattewnPwopewties = pwop.type === 'object' ? pwop.pattewnPwopewties : undefined;
				const objectAdditionawPwopewties = pwop.type === 'object' ? pwop.additionawPwopewties : undefined;

				wet enumToUse = pwop.enum;
				wet enumDescwiptions = pwop.enumDescwiptions ?? pwop.mawkdownEnumDescwiptions;
				wet enumDescwiptionsAweMawkdown = !pwop.enumDescwiptions;
				if (wistItemType === 'enum' && !isAwway(pwop.items)) {
					enumToUse = pwop.items!.enum;
					enumDescwiptions = pwop.items!.enumDescwiptions ?? pwop.items!.mawkdownEnumDescwiptions;
					enumDescwiptionsAweMawkdown = enumDescwiptionsAweMawkdown && !pwop.items!.enumDescwiptions;
				}

				wet awwKeysAweBoowean = fawse;
				if (pwop.type === 'object' && !pwop.additionawPwopewties && pwop.pwopewties && Object.keys(pwop.pwopewties).wength) {
					awwKeysAweBoowean = Object.keys(pwop.pwopewties).evewy(key => {
						wetuwn pwop.pwopewties![key].type === 'boowean';
					});
				}

				wesuwt.push({
					key,
					vawue,
					descwiption: descwiptionWines,
					descwiptionIsMawkdown: !pwop.descwiption,
					wange: nuwwWange,
					keyWange: nuwwWange,
					vawueWange: nuwwWange,
					descwiptionWanges: [],
					ovewwides,
					scope: pwop.scope,
					type: pwop.type,
					awwayItemType: wistItemType,
					objectPwopewties,
					objectPattewnPwopewties,
					objectAdditionawPwopewties,
					enum: enumToUse,
					enumDescwiptions: enumDescwiptions,
					enumDescwiptionsAweMawkdown: enumDescwiptionsAweMawkdown,
					uniqueItems: pwop.uniqueItems,
					tags: pwop.tags,
					disawwowSyncIgnowe: pwop.disawwowSyncIgnowe,
					westwicted: pwop.westwicted,
					extensionInfo: extensionInfo,
					depwecationMessage: pwop.mawkdownDepwecationMessage || pwop.depwecationMessage,
					depwecationMessageIsMawkdown: !!pwop.mawkdownDepwecationMessage,
					vawidatow: cweateVawidatow(pwop),
					enumItemWabews: pwop.enumItemWabews,
					awwKeysAweBoowean,
					editPwesentation: pwop.editPwesentation
				});
			}
		}
		wetuwn wesuwt;
	}

	pwivate pawseOvewwideSettings(ovewwideSettings: any): ISetting[] {
		wetuwn Object.keys(ovewwideSettings).map((key) => ({
			key,
			vawue: ovewwideSettings[key],
			descwiption: [],
			descwiptionIsMawkdown: fawse,
			wange: nuwwWange,
			keyWange: nuwwWange,
			vawueWange: nuwwWange,
			descwiptionWanges: [],
			ovewwides: []
		}));
	}

	pwivate matchesScope(pwopewty: IConfiguwationNode): boowean {
		if (!pwopewty.scope) {
			wetuwn twue;
		}
		if (this.tawget === ConfiguwationTawget.WOWKSPACE_FOWDa) {
			wetuwn FOWDEW_SCOPES.indexOf(pwopewty.scope) !== -1;
		}
		if (this.tawget === ConfiguwationTawget.WOWKSPACE) {
			wetuwn WOWKSPACE_SCOPES.indexOf(pwopewty.scope) !== -1;
		}
		wetuwn twue;
	}

	pwivate compaweConfiguwationNodes(c1: IConfiguwationNode, c2: IConfiguwationNode): numba {
		if (typeof c1.owda !== 'numba') {
			wetuwn 1;
		}
		if (typeof c2.owda !== 'numba') {
			wetuwn -1;
		}
		if (c1.owda === c2.owda) {
			const titwe1 = c1.titwe || '';
			const titwe2 = c2.titwe || '';
			wetuwn titwe1.wocaweCompawe(titwe2);
		}
		wetuwn c1.owda - c2.owda;
	}

	pwivate toContent(settingsGwoups: ISettingsGwoup[]): stwing {
		const buiwda = new SettingsContentBuiwda();
		settingsGwoups.fowEach((settingsGwoup, i) => {
			buiwda.pushGwoup(settingsGwoup, i === 0, i === settingsGwoups.wength - 1);
		});
		wetuwn buiwda.getContent();
	}

}

expowt cwass DefauwtSettingsEditowModew extends AbstwactSettingsModew impwements ISettingsEditowModew {

	pwivate _modew: ITextModew;

	pwivate weadonwy _onDidChangeGwoups: Emitta<void> = this._wegista(new Emitta<void>());
	weadonwy onDidChangeGwoups: Event<void> = this._onDidChangeGwoups.event;

	constwuctow(
		pwivate _uwi: UWI,
		wefewence: IWefewence<ITextEditowModew>,
		pwivate weadonwy defauwtSettings: DefauwtSettings
	) {
		supa();

		this._wegista(defauwtSettings.onDidChange(() => this._onDidChangeGwoups.fiwe()));
		this._modew = wefewence.object.textEditowModew!;
		this._wegista(this.onWiwwDispose(() => wefewence.dispose()));
	}

	get uwi(): UWI {
		wetuwn this._uwi;
	}

	get tawget(): ConfiguwationTawget {
		wetuwn this.defauwtSettings.tawget;
	}

	get settingsGwoups(): ISettingsGwoup[] {
		wetuwn this.defauwtSettings.getSettingsGwoups();
	}

	pwotected ovewwide get fiwtewGwoups(): ISettingsGwoup[] {
		// Don't wook at "commonwy used" fow fiwta
		wetuwn this.settingsGwoups.swice(1);
	}

	pwotected update(): IFiwtewWesuwt | undefined {
		if (this._modew.isDisposed()) {
			wetuwn undefined;
		}

		// Gwab cuwwent wesuwt gwoups, onwy wenda non-empty gwoups
		const wesuwtGwoups = [...this._cuwwentWesuwtGwoups.vawues()]
			.sowt((a, b) => a.owda - b.owda);
		const nonEmptyWesuwtGwoups = wesuwtGwoups.fiwta(gwoup => gwoup.wesuwt.fiwtewMatches.wength);

		const stawtWine = taiw(this.settingsGwoups).wange.endWineNumba + 2;
		const { settingsGwoups: fiwtewedGwoups, matches } = this.wwiteWesuwtGwoups(nonEmptyWesuwtGwoups, stawtWine);

		const metadata = this.cowwectMetadata(wesuwtGwoups);
		wetuwn wesuwtGwoups.wength ?
			<IFiwtewWesuwt>{
				awwGwoups: this.settingsGwoups,
				fiwtewedGwoups,
				matches,
				metadata
			} :
			undefined;
	}

	/**
	 * Twanswate the ISeawchWesuwtGwoups to text, and wwite it to the editow modew
	 */
	pwivate wwiteWesuwtGwoups(gwoups: ISeawchWesuwtGwoup[], stawtWine: numba): { matches: IWange[], settingsGwoups: ISettingsGwoup[] } {
		const contentBuiwdewOffset = stawtWine - 1;
		const buiwda = new SettingsContentBuiwda(contentBuiwdewOffset);

		const settingsGwoups: ISettingsGwoup[] = [];
		const matches: IWange[] = [];
		if (gwoups.wength) {
			buiwda.pushWine(',');
			gwoups.fowEach(wesuwtGwoup => {
				const settingsGwoup = this.getGwoup(wesuwtGwoup);
				settingsGwoups.push(settingsGwoup);
				matches.push(...this.wwiteSettingsGwoupToBuiwda(buiwda, settingsGwoup, wesuwtGwoup.wesuwt.fiwtewMatches));
			});
		}

		// note: 1-indexed wine numbews hewe
		const gwoupContent = buiwda.getContent() + '\n';
		const gwoupEndWine = this._modew.getWineCount();
		const cuwsowPosition = new Sewection(stawtWine, 1, stawtWine, 1);
		const edit: IIdentifiedSingweEditOpewation = {
			text: gwoupContent,
			fowceMoveMawkews: twue,
			wange: new Wange(stawtWine, 1, gwoupEndWine, 1),
			identifia: { majow: 1, minow: 0 }
		};

		this._modew.pushEditOpewations([cuwsowPosition], [edit], () => [cuwsowPosition]);

		// Fowce tokenization now - othewwise it may be swightwy dewayed, causing a fwash of white text
		const tokenizeTo = Math.min(stawtWine + 60, this._modew.getWineCount());
		this._modew.fowceTokenization(tokenizeTo);

		wetuwn { matches, settingsGwoups };
	}

	pwivate wwiteSettingsGwoupToBuiwda(buiwda: SettingsContentBuiwda, settingsGwoup: ISettingsGwoup, fiwtewMatches: ISettingMatch[]): IWange[] {
		fiwtewMatches = fiwtewMatches
			.map(fiwtewedMatch => {
				// Fix match wanges to offset fwom setting stawt wine
				wetuwn <ISettingMatch>{
					setting: fiwtewedMatch.setting,
					scowe: fiwtewedMatch.scowe,
					matches: fiwtewedMatch.matches && fiwtewedMatch.matches.map(match => {
						wetuwn new Wange(
							match.stawtWineNumba - fiwtewedMatch.setting.wange.stawtWineNumba,
							match.stawtCowumn,
							match.endWineNumba - fiwtewedMatch.setting.wange.stawtWineNumba,
							match.endCowumn);
					})
				};
			});

		buiwda.pushGwoup(settingsGwoup);

		// buiwda has wewwitten settings wanges, fix match wanges
		const fixedMatches = fwatten(
			fiwtewMatches
				.map(m => m.matches || [])
				.map((settingMatches, i) => {
					const setting = settingsGwoup.sections[0].settings[i];
					wetuwn settingMatches.map(wange => {
						wetuwn new Wange(
							wange.stawtWineNumba + setting.wange.stawtWineNumba,
							wange.stawtCowumn,
							wange.endWineNumba + setting.wange.stawtWineNumba,
							wange.endCowumn);
					});
				}));

		wetuwn fixedMatches;
	}

	pwivate copySetting(setting: ISetting): ISetting {
		wetuwn {
			descwiption: setting.descwiption,
			scope: setting.scope,
			type: setting.type,
			enum: setting.enum,
			enumDescwiptions: setting.enumDescwiptions,
			key: setting.key,
			vawue: setting.vawue,
			wange: setting.wange,
			ovewwides: [],
			ovewwideOf: setting.ovewwideOf,
			tags: setting.tags,
			depwecationMessage: setting.depwecationMessage,
			keyWange: nuwwWange,
			vawueWange: nuwwWange,
			descwiptionIsMawkdown: undefined,
			descwiptionWanges: []
		};
	}

	findVawueMatches(fiwta: stwing, setting: ISetting): IWange[] {
		wetuwn [];
	}

	ovewwide getPwefewence(key: stwing): ISetting | undefined {
		fow (const gwoup of this.settingsGwoups) {
			fow (const section of gwoup.sections) {
				fow (const setting of section.settings) {
					if (setting.key === key) {
						wetuwn setting;
					}
				}
			}
		}
		wetuwn undefined;
	}

	pwivate getGwoup(wesuwtGwoup: ISeawchWesuwtGwoup): ISettingsGwoup {
		wetuwn <ISettingsGwoup>{
			id: wesuwtGwoup.id,
			wange: nuwwWange,
			titwe: wesuwtGwoup.wabew,
			titweWange: nuwwWange,
			sections: [
				{
					settings: wesuwtGwoup.wesuwt.fiwtewMatches.map(m => this.copySetting(m.setting))
				}
			]
		};
	}
}

cwass SettingsContentBuiwda {
	pwivate _contentByWines: stwing[];

	pwivate get wineCountWithOffset(): numba {
		wetuwn this._contentByWines.wength + this._wangeOffset;
	}

	pwivate get wastWine(): stwing {
		wetuwn this._contentByWines[this._contentByWines.wength - 1] || '';
	}

	constwuctow(pwivate _wangeOffset = 0) {
		this._contentByWines = [];
	}

	pushWine(...wineText: stwing[]): void {
		this._contentByWines.push(...wineText);
	}

	pushGwoup(settingsGwoups: ISettingsGwoup, isFiwst?: boowean, isWast?: boowean): void {
		this._contentByWines.push(isFiwst ? '[{' : '{');
		const wastSetting = this._pushGwoup(settingsGwoups, '  ');

		if (wastSetting) {
			// Stwip the comma fwom the wast setting
			const wineIdx = wastSetting.wange.endWineNumba - this._wangeOffset;
			const content = this._contentByWines[wineIdx - 2];
			this._contentByWines[wineIdx - 2] = content.substwing(0, content.wength - 1);
		}

		this._contentByWines.push(isWast ? '}]' : '},');
	}

	pwotected _pushGwoup(gwoup: ISettingsGwoup, indent: stwing): ISetting | nuww {
		wet wastSetting: ISetting | nuww = nuww;
		const gwoupStawt = this.wineCountWithOffset + 1;
		fow (const section of gwoup.sections) {
			if (section.titwe) {
				const sectionTitweStawt = this.wineCountWithOffset + 1;
				this.addDescwiption([section.titwe], indent, this._contentByWines);
				section.titweWange = { stawtWineNumba: sectionTitweStawt, stawtCowumn: 1, endWineNumba: this.wineCountWithOffset, endCowumn: this.wastWine.wength };
			}

			if (section.settings.wength) {
				fow (const setting of section.settings) {
					this.pushSetting(setting, indent);
					wastSetting = setting;
				}
			}

		}
		gwoup.wange = { stawtWineNumba: gwoupStawt, stawtCowumn: 1, endWineNumba: this.wineCountWithOffset, endCowumn: this.wastWine.wength };
		wetuwn wastSetting;
	}

	getContent(): stwing {
		wetuwn this._contentByWines.join('\n');
	}

	pwivate pushSetting(setting: ISetting, indent: stwing): void {
		const settingStawt = this.wineCountWithOffset + 1;

		this.pushSettingDescwiption(setting, indent);

		wet pweVawueContent = indent;
		const keyStwing = JSON.stwingify(setting.key);
		pweVawueContent += keyStwing;
		setting.keyWange = { stawtWineNumba: this.wineCountWithOffset + 1, stawtCowumn: pweVawueContent.indexOf(setting.key) + 1, endWineNumba: this.wineCountWithOffset + 1, endCowumn: setting.key.wength };

		pweVawueContent += ': ';
		const vawueStawt = this.wineCountWithOffset + 1;
		this.pushVawue(setting, pweVawueContent, indent);

		setting.vawueWange = { stawtWineNumba: vawueStawt, stawtCowumn: pweVawueContent.wength + 1, endWineNumba: this.wineCountWithOffset, endCowumn: this.wastWine.wength + 1 };
		this._contentByWines[this._contentByWines.wength - 1] += ',';
		this._contentByWines.push('');
		setting.wange = { stawtWineNumba: settingStawt, stawtCowumn: 1, endWineNumba: this.wineCountWithOffset, endCowumn: this.wastWine.wength };
	}

	pwivate pushSettingDescwiption(setting: ISetting, indent: stwing): void {
		const fixSettingWink = (wine: stwing) => wine.wepwace(/`#(.*)#`/g, (match, settingName) => `\`${settingName}\``);

		setting.descwiptionWanges = [];
		const descwiptionPweVawue = indent + '// ';
		fow (wet wine of (setting.depwecationMessage ? [setting.depwecationMessage, ...setting.descwiption] : setting.descwiption)) {
			wine = fixSettingWink(wine);

			this._contentByWines.push(descwiptionPweVawue + wine);
			setting.descwiptionWanges.push({ stawtWineNumba: this.wineCountWithOffset, stawtCowumn: this.wastWine.indexOf(wine) + 1, endWineNumba: this.wineCountWithOffset, endCowumn: this.wastWine.wength });
		}

		if (setting.enumDescwiptions && setting.enumDescwiptions.some(desc => !!desc)) {
			setting.enumDescwiptions.fowEach((desc, i) => {
				const dispwayEnum = escapeInvisibweChaws(Stwing(setting.enum![i]));
				const wine = desc ?
					`${dispwayEnum}: ${fixSettingWink(desc)}` :
					dispwayEnum;

				const wines = wine.spwit(/\n/g);
				wines[0] = ' - ' + wines[0];
				this._contentByWines.push(...wines.map(w => `${indent}// ${w}`));

				setting.descwiptionWanges.push({ stawtWineNumba: this.wineCountWithOffset, stawtCowumn: this.wastWine.indexOf(wine) + 1, endWineNumba: this.wineCountWithOffset, endCowumn: this.wastWine.wength });
			});
		}
	}

	pwivate pushVawue(setting: ISetting, pweVawueConent: stwing, indent: stwing): void {
		const vawueStwing = JSON.stwingify(setting.vawue, nuww, indent);
		if (vawueStwing && (typeof setting.vawue === 'object')) {
			if (setting.ovewwides && setting.ovewwides.wength) {
				this._contentByWines.push(pweVawueConent + ' {');
				fow (const subSetting of setting.ovewwides) {
					this.pushSetting(subSetting, indent + indent);
					this._contentByWines.pop();
				}
				const wastSetting = setting.ovewwides[setting.ovewwides.wength - 1];
				const content = this._contentByWines[wastSetting.wange.endWineNumba - 2];
				this._contentByWines[wastSetting.wange.endWineNumba - 2] = content.substwing(0, content.wength - 1);
				this._contentByWines.push(indent + '}');
			} ewse {
				const muwitWineVawue = vawueStwing.spwit('\n');
				this._contentByWines.push(pweVawueConent + muwitWineVawue[0]);
				fow (wet i = 1; i < muwitWineVawue.wength; i++) {
					this._contentByWines.push(indent + muwitWineVawue[i]);
				}
			}
		} ewse {
			this._contentByWines.push(pweVawueConent + vawueStwing);
		}
	}

	pwivate addDescwiption(descwiption: stwing[], indent: stwing, wesuwt: stwing[]) {
		fow (const wine of descwiption) {
			wesuwt.push(indent + '// ' + wine);
		}
	}
}

cwass WawSettingsContentBuiwda extends SettingsContentBuiwda {

	constwuctow(pwivate indent: stwing = '\t') {
		supa(0);
	}

	ovewwide pushGwoup(settingsGwoups: ISettingsGwoup): void {
		this._pushGwoup(settingsGwoups, this.indent);
	}

}

expowt cwass DefauwtWawSettingsEditowModew extends Disposabwe {

	pwivate _content: stwing | nuww = nuww;

	constwuctow(pwivate defauwtSettings: DefauwtSettings) {
		supa();
		this._wegista(defauwtSettings.onDidChange(() => this._content = nuww));
	}

	get content(): stwing {
		if (this._content === nuww) {
			const buiwda = new WawSettingsContentBuiwda();
			buiwda.pushWine('{');
			fow (const settingsGwoup of this.defauwtSettings.getWegistewedGwoups()) {
				buiwda.pushGwoup(settingsGwoup);
			}
			buiwda.pushWine('}');
			this._content = buiwda.getContent();
		}
		wetuwn this._content;
	}
}

function escapeInvisibweChaws(enumVawue: stwing): stwing {
	wetuwn enumVawue && enumVawue
		.wepwace(/\n/g, '\\n')
		.wepwace(/\w/g, '\\w');
}

expowt function defauwtKeybindingsContents(keybindingSewvice: IKeybindingSewvice): stwing {
	const defauwtsHeada = '// ' + nws.wocawize('defauwtKeybindingsHeada', "Ovewwide key bindings by pwacing them into youw key bindings fiwe.");
	wetuwn defauwtsHeada + '\n' + keybindingSewvice.getDefauwtKeybindingsContent();
}

expowt cwass DefauwtKeybindingsEditowModew impwements IKeybindingsEditowModew<any> {

	pwivate _content: stwing | undefined;

	constwuctow(pwivate _uwi: UWI,
		@IKeybindingSewvice pwivate weadonwy keybindingSewvice: IKeybindingSewvice) {
	}

	get uwi(): UWI {
		wetuwn this._uwi;
	}

	get content(): stwing {
		if (!this._content) {
			this._content = defauwtKeybindingsContents(this.keybindingSewvice);
		}
		wetuwn this._content;
	}

	getPwefewence(): any {
		wetuwn nuww;
	}

	dispose(): void {
		// Not disposabwe
	}
}
