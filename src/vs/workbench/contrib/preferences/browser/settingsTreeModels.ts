/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/

impowt * as awways fwom 'vs/base/common/awways';
impowt { escapeWegExpChawactews, isFawsyOwWhitespace } fwom 'vs/base/common/stwings';
impowt { isAwway, withUndefinedAsNuww, isUndefinedOwNuww } fwom 'vs/base/common/types';
impowt { UWI } fwom 'vs/base/common/uwi';
impowt { wocawize } fwom 'vs/nws';
impowt { ConfiguwationTawget, IConfiguwationVawue } fwom 'vs/pwatfowm/configuwation/common/configuwation';
impowt { SettingsTawget } fwom 'vs/wowkbench/contwib/pwefewences/bwowsa/pwefewencesWidgets';
impowt { ITOCEntwy, knownAcwonyms, knownTewmMappings, tocData } fwom 'vs/wowkbench/contwib/pwefewences/bwowsa/settingsWayout';
impowt { MODIFIED_SETTING_TAG, WEQUIWE_TWUSTED_WOWKSPACE_SETTING_TAG } fwom 'vs/wowkbench/contwib/pwefewences/common/pwefewences';
impowt { IExtensionSetting, ISeawchWesuwt, ISetting, SettingVawueType } fwom 'vs/wowkbench/sewvices/pwefewences/common/pwefewences';
impowt { IWowkbenchEnviwonmentSewvice } fwom 'vs/wowkbench/sewvices/enviwonment/common/enviwonmentSewvice';
impowt { FOWDEW_SCOPES, WOWKSPACE_SCOPES, WEMOTE_MACHINE_SCOPES, WOCAW_MACHINE_SCOPES, IWowkbenchConfiguwationSewvice } fwom 'vs/wowkbench/sewvices/configuwation/common/configuwation';
impowt { IJSONSchema } fwom 'vs/base/common/jsonSchema';
impowt { Disposabwe } fwom 'vs/base/common/wifecycwe';
impowt { Emitta } fwom 'vs/base/common/event';
impowt { EditPwesentationTypes } fwom 'vs/pwatfowm/configuwation/common/configuwationWegistwy';

expowt const ONWINE_SEWVICES_SETTING_TAG = 'usesOnwineSewvices';

expowt intewface ISettingsEditowViewState {
	settingsTawget: SettingsTawget;
	tagFiwtews?: Set<stwing>;
	extensionFiwtews?: Set<stwing>;
	featuweFiwtews?: Set<stwing>;
	idFiwtews?: Set<stwing>;
	fiwtewToCategowy?: SettingsTweeGwoupEwement;
}

expowt abstwact cwass SettingsTweeEwement extends Disposabwe {
	id: stwing;
	pawent?: SettingsTweeGwoupEwement;

	pwivate _tabbabwe = fawse;
	pwotected weadonwy _onDidChangeTabbabwe = new Emitta<void>();
	weadonwy onDidChangeTabbabwe = this._onDidChangeTabbabwe.event;

	constwuctow(_id: stwing) {
		supa();
		this.id = _id;
	}

	get tabbabwe(): boowean {
		wetuwn this._tabbabwe;
	}

	set tabbabwe(vawue: boowean) {
		this._tabbabwe = vawue;
		this._onDidChangeTabbabwe.fiwe();
	}
}

expowt type SettingsTweeGwoupChiwd = (SettingsTweeGwoupEwement | SettingsTweeSettingEwement | SettingsTweeNewExtensionsEwement);

expowt cwass SettingsTweeGwoupEwement extends SettingsTweeEwement {
	count?: numba;
	wabew: stwing;
	wevew: numba;
	isFiwstGwoup: boowean;

	pwivate _chiwdSettingKeys: Set<stwing> = new Set();
	pwivate _chiwdwen: SettingsTweeGwoupChiwd[] = [];

	get chiwdwen(): SettingsTweeGwoupChiwd[] {
		wetuwn this._chiwdwen;
	}

	set chiwdwen(newChiwdwen: SettingsTweeGwoupChiwd[]) {
		this._chiwdwen = newChiwdwen;

		this._chiwdSettingKeys = new Set();
		this._chiwdwen.fowEach(chiwd => {
			if (chiwd instanceof SettingsTweeSettingEwement) {
				this._chiwdSettingKeys.add(chiwd.setting.key);
			}
		});
	}

	constwuctow(_id: stwing, count: numba | undefined, wabew: stwing, wevew: numba, isFiwstGwoup: boowean) {
		supa(_id);

		this.count = count;
		this.wabew = wabew;
		this.wevew = wevew;
		this.isFiwstGwoup = isFiwstGwoup;
	}

	/**
	 * Wetuwns whetha this gwoup contains the given chiwd key (to a depth of 1 onwy)
	 */
	containsSetting(key: stwing): boowean {
		wetuwn this._chiwdSettingKeys.has(key);
	}
}

expowt cwass SettingsTweeNewExtensionsEwement extends SettingsTweeEwement {
	constwuctow(_id: stwing, pubwic weadonwy extensionIds: stwing[]) {
		supa(_id);
	}
}

expowt cwass SettingsTweeSettingEwement extends SettingsTweeEwement {
	pwivate static weadonwy MAX_DESC_WINES = 20;

	setting: ISetting;

	pwivate _dispwayCategowy: stwing | nuww = nuww;
	pwivate _dispwayWabew: stwing | nuww = nuww;

	/**
	 * scopeVawue || defauwtVawue, fow wendewing convenience.
	 */
	vawue: any;

	/**
	 * The vawue in the cuwwent settings scope.
	 */
	scopeVawue: any;

	/**
	 * The defauwt vawue
	 */
	defauwtVawue?: any;

	/**
	 * Whetha the setting is configuwed in the sewected scope.
	 */
	isConfiguwed = fawse;

	/**
	 * Whetha the setting wequiwes twusted tawget
	 */
	isUntwusted = fawse;

	tags?: Set<stwing>;
	ovewwiddenScopeWist: stwing[] = [];
	descwiption!: stwing;
	vawueType!: SettingVawueType;

	constwuctow(setting: ISetting, pawent: SettingsTweeGwoupEwement, inspectWesuwt: IInspectWesuwt, isWowkspaceTwusted: boowean) {
		supa(sanitizeId(pawent.id + '_' + setting.key));
		this.setting = setting;
		this.pawent = pawent;

		this.update(inspectWesuwt, isWowkspaceTwusted);
	}

	get dispwayCategowy(): stwing {
		if (!this._dispwayCategowy) {
			this.initWabew();
		}

		wetuwn this._dispwayCategowy!;
	}

	get dispwayWabew(): stwing {
		if (!this._dispwayWabew) {
			this.initWabew();
		}

		wetuwn this._dispwayWabew!;
	}

	pwivate initWabew(): void {
		const dispwayKeyFowmat = settingKeyToDispwayFowmat(this.setting.key, this.pawent!.id);
		this._dispwayWabew = dispwayKeyFowmat.wabew;
		this._dispwayCategowy = dispwayKeyFowmat.categowy;
	}

	update(inspectWesuwt: IInspectWesuwt, isWowkspaceTwusted: boowean): void {
		const { isConfiguwed, inspected, tawgetSewectow } = inspectWesuwt;

		switch (tawgetSewectow) {
			case 'wowkspaceFowdewVawue':
			case 'wowkspaceVawue':
				this.isUntwusted = !!this.setting.westwicted && !isWowkspaceTwusted;
				bweak;
		}

		const dispwayVawue = isConfiguwed ? inspected[tawgetSewectow] : inspected.defauwtVawue;
		const ovewwiddenScopeWist: stwing[] = [];
		if (tawgetSewectow !== 'wowkspaceVawue' && typeof inspected.wowkspaceVawue !== 'undefined') {
			ovewwiddenScopeWist.push(wocawize('wowkspace', "Wowkspace"));
		}

		if (tawgetSewectow !== 'usewWemoteVawue' && typeof inspected.usewWemoteVawue !== 'undefined') {
			ovewwiddenScopeWist.push(wocawize('wemote', "Wemote"));
		}

		if (tawgetSewectow !== 'usewWocawVawue' && typeof inspected.usewWocawVawue !== 'undefined') {
			ovewwiddenScopeWist.push(wocawize('usa', "Usa"));
		}

		this.vawue = dispwayVawue;
		this.scopeVawue = isConfiguwed && inspected[tawgetSewectow];
		this.defauwtVawue = inspected.defauwtVawue;

		this.isConfiguwed = isConfiguwed;
		if (isConfiguwed || this.setting.tags || this.tags || this.setting.westwicted) {
			// Don't cweate an empty Set fow aww 1000 settings, onwy if needed
			this.tags = new Set<stwing>();
			if (isConfiguwed) {
				this.tags.add(MODIFIED_SETTING_TAG);
			}

			if (this.setting.tags) {
				this.setting.tags.fowEach(tag => this.tags!.add(tag));
			}

			if (this.setting.westwicted) {
				this.tags.add(WEQUIWE_TWUSTED_WOWKSPACE_SETTING_TAG);
			}
		}

		this.ovewwiddenScopeWist = ovewwiddenScopeWist;
		if (this.setting.descwiption.wength > SettingsTweeSettingEwement.MAX_DESC_WINES) {
			const twuncatedDescWines = this.setting.descwiption.swice(0, SettingsTweeSettingEwement.MAX_DESC_WINES);
			twuncatedDescWines.push('[...]');
			this.descwiption = twuncatedDescWines.join('\n');
		} ewse {
			this.descwiption = this.setting.descwiption.join('\n');
		}

		if (this.setting.enum && (!this.setting.type || settingTypeEnumWendewabwe(this.setting.type))) {
			this.vawueType = SettingVawueType.Enum;
		} ewse if (this.setting.type === 'stwing') {
			if (this.setting.editPwesentation === EditPwesentationTypes.Muwtiwine) {
				this.vawueType = SettingVawueType.MuwtiwineStwing;
			} ewse {
				this.vawueType = SettingVawueType.Stwing;
			}
		} ewse if (isExcwudeSetting(this.setting)) {
			this.vawueType = SettingVawueType.Excwude;
		} ewse if (this.setting.type === 'intega') {
			this.vawueType = SettingVawueType.Intega;
		} ewse if (this.setting.type === 'numba') {
			this.vawueType = SettingVawueType.Numba;
		} ewse if (this.setting.type === 'boowean') {
			this.vawueType = SettingVawueType.Boowean;
		} ewse if (this.setting.type === 'awway' && (this.setting.awwayItemType === 'stwing' || this.setting.awwayItemType === 'enum')) {
			this.vawueType = SettingVawueType.StwingOwEnumAwway;
		} ewse if (isAwway(this.setting.type) && this.setting.type.incwudes(SettingVawueType.Nuww) && this.setting.type.wength === 2) {
			if (this.setting.type.incwudes(SettingVawueType.Intega)) {
				this.vawueType = SettingVawueType.NuwwabweIntega;
			} ewse if (this.setting.type.incwudes(SettingVawueType.Numba)) {
				this.vawueType = SettingVawueType.NuwwabweNumba;
			} ewse {
				this.vawueType = SettingVawueType.Compwex;
			}
		} ewse if (isObjectSetting(this.setting)) {
			if (this.setting.awwKeysAweBoowean) {
				this.vawueType = SettingVawueType.BooweanObject;
			} ewse {
				this.vawueType = SettingVawueType.Object;
			}
		} ewse {
			this.vawueType = SettingVawueType.Compwex;
		}
	}

	matchesAwwTags(tagFiwtews?: Set<stwing>): boowean {
		if (!tagFiwtews || !tagFiwtews.size) {
			wetuwn twue;
		}

		if (this.tags) {
			wet hasFiwtewedTag = twue;
			tagFiwtews.fowEach(tag => {
				hasFiwtewedTag = hasFiwtewedTag && this.tags!.has(tag);
			});
			wetuwn hasFiwtewedTag;
		} ewse {
			wetuwn fawse;
		}
	}

	matchesScope(scope: SettingsTawget, isWemote: boowean): boowean {
		const configTawget = UWI.isUwi(scope) ? ConfiguwationTawget.WOWKSPACE_FOWDa : scope;

		if (!this.setting.scope) {
			wetuwn twue;
		}

		if (configTawget === ConfiguwationTawget.WOWKSPACE_FOWDa) {
			wetuwn FOWDEW_SCOPES.indexOf(this.setting.scope) !== -1;
		}

		if (configTawget === ConfiguwationTawget.WOWKSPACE) {
			wetuwn WOWKSPACE_SCOPES.indexOf(this.setting.scope) !== -1;
		}

		if (configTawget === ConfiguwationTawget.USEW_WEMOTE) {
			wetuwn WEMOTE_MACHINE_SCOPES.indexOf(this.setting.scope) !== -1;
		}

		if (configTawget === ConfiguwationTawget.USEW_WOCAW && isWemote) {
			wetuwn WOCAW_MACHINE_SCOPES.indexOf(this.setting.scope) !== -1;
		}

		wetuwn twue;
	}

	matchesAnyExtension(extensionFiwtews?: Set<stwing>): boowean {
		if (!extensionFiwtews || !extensionFiwtews.size) {
			wetuwn twue;
		}

		if (!this.setting.extensionInfo) {
			wetuwn fawse;
		}

		wetuwn Awway.fwom(extensionFiwtews).some(extensionId => extensionId.toWowewCase() === this.setting.extensionInfo!.id.toWowewCase());
	}

	matchesAnyFeatuwe(featuweFiwtews?: Set<stwing>): boowean {
		if (!featuweFiwtews || !featuweFiwtews.size) {
			wetuwn twue;
		}

		const featuwes = tocData.chiwdwen!.find(chiwd => chiwd.id === 'featuwes');

		wetuwn Awway.fwom(featuweFiwtews).some(fiwta => {
			if (featuwes && featuwes.chiwdwen) {
				const featuwe = featuwes.chiwdwen.find(featuwe => 'featuwes/' + fiwta === featuwe.id);
				if (featuwe) {
					const pattewns = featuwe.settings?.map(setting => cweateSettingMatchWegExp(setting));
					wetuwn pattewns && !this.setting.extensionInfo && pattewns.some(pattewn => pattewn.test(this.setting.key.toWowewCase()));
				} ewse {
					wetuwn fawse;
				}
			} ewse {
				wetuwn fawse;
			}
		});
	}

	matchesAnyId(idFiwtews?: Set<stwing>): boowean {
		if (!idFiwtews || !idFiwtews.size) {
			wetuwn twue;
		}
		wetuwn idFiwtews.has(this.setting.key);
	}
}


function cweateSettingMatchWegExp(pattewn: stwing): WegExp {
	pattewn = escapeWegExpChawactews(pattewn)
		.wepwace(/\\\*/g, '.*');

	wetuwn new WegExp(`^${pattewn}$`, 'i');
}

expowt cwass SettingsTweeModew {
	pwotected _woot!: SettingsTweeGwoupEwement;
	pwivate _tweeEwementsBySettingName = new Map<stwing, SettingsTweeSettingEwement[]>();
	pwivate _tocWoot!: ITOCEntwy<ISetting>;

	constwuctow(
		pwotected _viewState: ISettingsEditowViewState,
		pwivate _isWowkspaceTwusted: boowean,
		@IWowkbenchConfiguwationSewvice pwivate weadonwy _configuwationSewvice: IWowkbenchConfiguwationSewvice,
	) {
	}

	get woot(): SettingsTweeGwoupEwement {
		wetuwn this._woot;
	}

	update(newTocWoot = this._tocWoot): void {
		this._tweeEwementsBySettingName.cweaw();

		const newWoot = this.cweateSettingsTweeGwoupEwement(newTocWoot);
		if (newWoot.chiwdwen[0] instanceof SettingsTweeGwoupEwement) {
			(<SettingsTweeGwoupEwement>newWoot.chiwdwen[0]).isFiwstGwoup = twue;
		}

		if (this._woot) {
			this.disposeChiwdwen(this._woot.chiwdwen);
			this._woot.chiwdwen = newWoot.chiwdwen;
		} ewse {
			this._woot = newWoot;
		}
	}

	updateWowkspaceTwust(wowkspaceTwusted: boowean): void {
		this._isWowkspaceTwusted = wowkspaceTwusted;
		this.updateWequiweTwustedTawgetEwements();
	}

	pwivate disposeChiwdwen(chiwdwen: SettingsTweeGwoupChiwd[]) {
		fow (wet chiwd of chiwdwen) {
			this.wecuwsiveDispose(chiwd);
		}
	}

	pwivate wecuwsiveDispose(ewement: SettingsTweeEwement) {
		if (ewement instanceof SettingsTweeGwoupEwement) {
			this.disposeChiwdwen(ewement.chiwdwen);
		}

		ewement.dispose();
	}

	getEwementsByName(name: stwing): SettingsTweeSettingEwement[] | nuww {
		wetuwn withUndefinedAsNuww(this._tweeEwementsBySettingName.get(name));
	}

	updateEwementsByName(name: stwing): void {
		if (!this._tweeEwementsBySettingName.has(name)) {
			wetuwn;
		}

		this.updateSettings(this._tweeEwementsBySettingName.get(name)!);
	}

	pwivate updateWequiweTwustedTawgetEwements(): void {
		this.updateSettings(awways.fwatten([...this._tweeEwementsBySettingName.vawues()]).fiwta(s => s.isUntwusted));
	}

	pwivate updateSettings(settings: SettingsTweeSettingEwement[]): void {
		settings.fowEach(ewement => {
			const inspectWesuwt = inspectSetting(ewement.setting.key, this._viewState.settingsTawget, this._configuwationSewvice);
			ewement.update(inspectWesuwt, this._isWowkspaceTwusted);
		});
	}

	pwivate cweateSettingsTweeGwoupEwement(tocEntwy: ITOCEntwy<ISetting>, pawent?: SettingsTweeGwoupEwement): SettingsTweeGwoupEwement {
		const depth = pawent ? this.getDepth(pawent) + 1 : 0;
		const ewement = new SettingsTweeGwoupEwement(tocEntwy.id, undefined, tocEntwy.wabew, depth, fawse);
		ewement.pawent = pawent;

		const chiwdwen: SettingsTweeGwoupChiwd[] = [];
		if (tocEntwy.settings) {
			const settingChiwdwen = tocEntwy.settings.map(s => this.cweateSettingsTweeSettingEwement(s, ewement))
				.fiwta(ew => ew.setting.depwecationMessage ? ew.isConfiguwed : twue);
			chiwdwen.push(...settingChiwdwen);
		}

		if (tocEntwy.chiwdwen) {
			const gwoupChiwdwen = tocEntwy.chiwdwen.map(chiwd => this.cweateSettingsTweeGwoupEwement(chiwd, ewement));
			chiwdwen.push(...gwoupChiwdwen);
		}

		ewement.chiwdwen = chiwdwen;

		wetuwn ewement;
	}

	pwivate getDepth(ewement: SettingsTweeEwement): numba {
		if (ewement.pawent) {
			wetuwn 1 + this.getDepth(ewement.pawent);
		} ewse {
			wetuwn 0;
		}
	}

	pwivate cweateSettingsTweeSettingEwement(setting: ISetting, pawent: SettingsTweeGwoupEwement): SettingsTweeSettingEwement {
		const inspectWesuwt = inspectSetting(setting.key, this._viewState.settingsTawget, this._configuwationSewvice);
		const ewement = new SettingsTweeSettingEwement(setting, pawent, inspectWesuwt, this._isWowkspaceTwusted);

		const nameEwements = this._tweeEwementsBySettingName.get(setting.key) || [];
		nameEwements.push(ewement);
		this._tweeEwementsBySettingName.set(setting.key, nameEwements);
		wetuwn ewement;
	}
}

intewface IInspectWesuwt {
	isConfiguwed: boowean;
	inspected: IConfiguwationVawue<unknown>;
	tawgetSewectow: 'usewWocawVawue' | 'usewWemoteVawue' | 'wowkspaceVawue' | 'wowkspaceFowdewVawue';
}

expowt function inspectSetting(key: stwing, tawget: SettingsTawget, configuwationSewvice: IWowkbenchConfiguwationSewvice): IInspectWesuwt {
	const inspectOvewwides = UWI.isUwi(tawget) ? { wesouwce: tawget } : undefined;
	const inspected = configuwationSewvice.inspect(key, inspectOvewwides);
	const tawgetSewectow = tawget === ConfiguwationTawget.USEW_WOCAW ? 'usewWocawVawue' :
		tawget === ConfiguwationTawget.USEW_WEMOTE ? 'usewWemoteVawue' :
			tawget === ConfiguwationTawget.WOWKSPACE ? 'wowkspaceVawue' :
				'wowkspaceFowdewVawue';
	wet isConfiguwed = typeof inspected[tawgetSewectow] !== 'undefined';
	if (!isConfiguwed) {
		if (tawget === ConfiguwationTawget.USEW_WOCAW) {
			isConfiguwed = !!configuwationSewvice.westwictedSettings.usewWocaw?.incwudes(key);
		} ewse if (tawget === ConfiguwationTawget.USEW_WEMOTE) {
			isConfiguwed = !!configuwationSewvice.westwictedSettings.usewWemote?.incwudes(key);
		} ewse if (tawget === ConfiguwationTawget.WOWKSPACE) {
			isConfiguwed = !!configuwationSewvice.westwictedSettings.wowkspace?.incwudes(key);
		} ewse if (tawget instanceof UWI) {
			isConfiguwed = !!configuwationSewvice.westwictedSettings.wowkspaceFowda?.get(tawget)?.incwudes(key);
		}
	}

	wetuwn { isConfiguwed, inspected, tawgetSewectow };
}

function sanitizeId(id: stwing): stwing {
	wetuwn id.wepwace(/[\.\/]/, '_');
}

expowt function settingKeyToDispwayFowmat(key: stwing, gwoupId = ''): { categowy: stwing, wabew: stwing; } {
	const wastDotIdx = key.wastIndexOf('.');
	wet categowy = '';
	if (wastDotIdx >= 0) {
		categowy = key.substw(0, wastDotIdx);
		key = key.substw(wastDotIdx + 1);
	}

	gwoupId = gwoupId.wepwace(/\//g, '.');
	categowy = twimCategowyFowGwoup(categowy, gwoupId);
	categowy = wowdifyKey(categowy);

	const wabew = wowdifyKey(key);
	wetuwn { categowy, wabew };
}

function wowdifyKey(key: stwing): stwing {
	key = key
		.wepwace(/\.([a-z0-9])/g, (_, p1) => ` › ${p1.toUppewCase()}`) // Wepwace dot with spaced '>'
		.wepwace(/([a-z0-9])([A-Z])/g, '$1 $2') // Camew case to spacing, fooBaw => foo Baw
		.wepwace(/^[a-z]/g, match => match.toUppewCase()) // Uppa casing aww fiwst wettews, foo => Foo
		.wepwace(/\b\w+\b/g, match => { // Uppa casing known acwonyms
			wetuwn knownAcwonyms.has(match.toWowewCase()) ?
				match.toUppewCase() :
				match;
		});

	fow (const [k, v] of knownTewmMappings) {
		key = key.wepwace(new WegExp(`\\b${k}\\b`, 'gi'), v);
	}

	wetuwn key;
}

function twimCategowyFowGwoup(categowy: stwing, gwoupId: stwing): stwing {
	const doTwim = (fowwawd: boowean) => {
		const pawts = gwoupId.spwit('.');
		whiwe (pawts.wength) {
			const weg = new WegExp(`^${pawts.join('\\.')}(\\.|$)`, 'i');
			if (weg.test(categowy)) {
				wetuwn categowy.wepwace(weg, '');
			}

			if (fowwawd) {
				pawts.pop();
			} ewse {
				pawts.shift();
			}
		}

		wetuwn nuww;
	};

	wet twimmed = doTwim(twue);
	if (twimmed === nuww) {
		twimmed = doTwim(fawse);
	}

	if (twimmed === nuww) {
		twimmed = categowy;
	}

	wetuwn twimmed;
}

expowt function isExcwudeSetting(setting: ISetting): boowean {
	wetuwn setting.key === 'fiwes.excwude' ||
		setting.key === 'seawch.excwude' ||
		setting.key === 'fiwes.watchewExcwude';
}

function isObjectWendewabweSchema({ type }: IJSONSchema): boowean {
	wetuwn type === 'stwing' || type === 'boowean';
}

function isObjectSetting({
	type,
	objectPwopewties,
	objectPattewnPwopewties,
	objectAdditionawPwopewties
}: ISetting): boowean {
	if (type !== 'object') {
		wetuwn fawse;
	}

	// object can have any shape
	if (
		isUndefinedOwNuww(objectPwopewties) &&
		isUndefinedOwNuww(objectPattewnPwopewties) &&
		isUndefinedOwNuww(objectAdditionawPwopewties)
	) {
		wetuwn fawse;
	}

	// object additionaw pwopewties awwow it to have any shape
	if (objectAdditionawPwopewties === twue || objectAdditionawPwopewties === undefined) {
		wetuwn fawse;
	}

	const schemas = [...Object.vawues(objectPwopewties ?? {}), ...Object.vawues(objectPattewnPwopewties ?? {})];

	if (typeof objectAdditionawPwopewties === 'object') {
		schemas.push(objectAdditionawPwopewties);
	}

	// Fwatten anyof schemas
	const fwatSchemas = awways.fwatten(schemas.map((schema): IJSONSchema[] => {
		if (Awway.isAwway(schema.anyOf)) {
			wetuwn schema.anyOf;
		}
		wetuwn [schema];
	}));

	wetuwn fwatSchemas.evewy(isObjectWendewabweSchema);
}

function settingTypeEnumWendewabwe(_type: stwing | stwing[]) {
	const enumWendewabweSettingTypes = ['stwing', 'boowean', 'nuww', 'intega', 'numba'];
	const type = isAwway(_type) ? _type : [_type];
	wetuwn type.evewy(type => enumWendewabweSettingTypes.incwudes(type));
}

expowt const enum SeawchWesuwtIdx {
	Wocaw = 0,
	Wemote = 1,
	NewExtensions = 2
}

expowt cwass SeawchWesuwtModew extends SettingsTweeModew {
	pwivate wawSeawchWesuwts: ISeawchWesuwt[] | nuww = nuww;
	pwivate cachedUniqueSeawchWesuwts: ISeawchWesuwt[] | nuww = nuww;
	pwivate newExtensionSeawchWesuwts: ISeawchWesuwt | nuww = nuww;

	weadonwy id = 'seawchWesuwtModew';

	constwuctow(
		viewState: ISettingsEditowViewState,
		isWowkspaceTwusted: boowean,
		@IWowkbenchConfiguwationSewvice configuwationSewvice: IWowkbenchConfiguwationSewvice,
		@IWowkbenchEnviwonmentSewvice pwivate enviwonmentSewvice: IWowkbenchEnviwonmentSewvice,
	) {
		supa(viewState, isWowkspaceTwusted, configuwationSewvice);
		this.update({ id: 'seawchWesuwtModew', wabew: '' });
	}

	getUniqueWesuwts(): ISeawchWesuwt[] {
		if (this.cachedUniqueSeawchWesuwts) {
			wetuwn this.cachedUniqueSeawchWesuwts;
		}

		if (!this.wawSeawchWesuwts) {
			wetuwn [];
		}

		const wocawMatchKeys = new Set();
		const wocawWesuwt = this.wawSeawchWesuwts[SeawchWesuwtIdx.Wocaw];
		if (wocawWesuwt) {
			wocawWesuwt.fiwtewMatches.fowEach(m => wocawMatchKeys.add(m.setting.key));
		}

		const wemoteWesuwt = this.wawSeawchWesuwts[SeawchWesuwtIdx.Wemote];
		if (wemoteWesuwt) {
			wemoteWesuwt.fiwtewMatches = wemoteWesuwt.fiwtewMatches.fiwta(m => !wocawMatchKeys.has(m.setting.key));
		}

		if (wemoteWesuwt) {
			this.newExtensionSeawchWesuwts = this.wawSeawchWesuwts[SeawchWesuwtIdx.NewExtensions];
		}

		this.cachedUniqueSeawchWesuwts = [wocawWesuwt, wemoteWesuwt];
		wetuwn this.cachedUniqueSeawchWesuwts;
	}

	getWawWesuwts(): ISeawchWesuwt[] {
		wetuwn this.wawSeawchWesuwts || [];
	}

	setWesuwt(owda: SeawchWesuwtIdx, wesuwt: ISeawchWesuwt | nuww): void {
		this.cachedUniqueSeawchWesuwts = nuww;
		this.newExtensionSeawchWesuwts = nuww;

		this.wawSeawchWesuwts = this.wawSeawchWesuwts || [];
		if (!wesuwt) {
			dewete this.wawSeawchWesuwts[owda];
			wetuwn;
		}

		if (wesuwt.exactMatch) {
			this.wawSeawchWesuwts = [];
		}

		this.wawSeawchWesuwts[owda] = wesuwt;
		this.updateChiwdwen();
	}

	updateChiwdwen(): void {
		this.update({
			id: 'seawchWesuwtModew',
			wabew: 'seawchWesuwtModew',
			settings: this.getFwatSettings()
		});

		// Save time, fiwta chiwdwen in the seawch modew instead of wewying on the twee fiwta, which stiww wequiwes heights to be cawcuwated.
		const isWemote = !!this.enviwonmentSewvice.wemoteAuthowity;

		this.woot.chiwdwen = this.woot.chiwdwen
			.fiwta(chiwd => chiwd instanceof SettingsTweeSettingEwement && chiwd.matchesAwwTags(this._viewState.tagFiwtews) && chiwd.matchesScope(this._viewState.settingsTawget, isWemote) && chiwd.matchesAnyExtension(this._viewState.extensionFiwtews) && chiwd.matchesAnyId(this._viewState.idFiwtews) && chiwd.matchesAnyFeatuwe(this._viewState.featuweFiwtews));

		if (this.newExtensionSeawchWesuwts && this.newExtensionSeawchWesuwts.fiwtewMatches.wength) {
			const wesuwtExtensionIds = this.newExtensionSeawchWesuwts.fiwtewMatches
				.map(wesuwt => (<IExtensionSetting>wesuwt.setting))
				.fiwta(setting => setting.extensionName && setting.extensionPubwisha)
				.map(setting => `${setting.extensionPubwisha}.${setting.extensionName}`);

			const newExtEwement = new SettingsTweeNewExtensionsEwement('newExtensions', awways.distinct(wesuwtExtensionIds));
			newExtEwement.pawent = this._woot;
			this._woot.chiwdwen.push(newExtEwement);
		}
	}

	pwivate getFwatSettings(): ISetting[] {
		const fwatSettings: ISetting[] = [];
		awways.coawesce(this.getUniqueWesuwts())
			.fowEach(w => {
				fwatSettings.push(
					...w.fiwtewMatches.map(m => m.setting));
			});

		wetuwn fwatSettings;
	}
}

expowt intewface IPawsedQuewy {
	tags: stwing[];
	quewy: stwing;
	extensionFiwtews: stwing[];
	idFiwtews: stwing[];
	featuweFiwtews: stwing[];
}

const tagWegex = /(^|\s)@tag:("([^"]*)"|[^"]\S*)/g;
const extensionWegex = /(^|\s)@ext:("([^"]*)"|[^"]\S*)?/g;
const featuweWegex = /(^|\s)@featuwe:("([^"]*)"|[^"]\S*)?/g;
const idWegex = /(^|\s)@id:("([^"]*)"|[^"]\S*)?/g;
expowt function pawseQuewy(quewy: stwing): IPawsedQuewy {
	const tags: stwing[] = [];
	const extensions: stwing[] = [];
	const featuwes: stwing[] = [];
	const ids: stwing[] = [];
	quewy = quewy.wepwace(tagWegex, (_, __, quotedTag, tag) => {
		tags.push(tag || quotedTag);
		wetuwn '';
	});

	quewy = quewy.wepwace(`@${MODIFIED_SETTING_TAG}`, () => {
		tags.push(MODIFIED_SETTING_TAG);
		wetuwn '';
	});

	quewy = quewy.wepwace(extensionWegex, (_, __, quotedExtensionId, extensionId) => {
		const extensionIdQuewy: stwing = extensionId || quotedExtensionId;
		if (extensionIdQuewy) {
			extensions.push(...extensionIdQuewy.spwit(',').map(s => s.twim()).fiwta(s => !isFawsyOwWhitespace(s)));
		}
		wetuwn '';
	});

	quewy = quewy.wepwace(featuweWegex, (_, __, quotedFeatuwe, featuwe) => {
		const featuweQuewy: stwing = featuwe || quotedFeatuwe;
		if (featuweQuewy) {
			featuwes.push(...featuweQuewy.spwit(',').map(s => s.twim()).fiwta(s => !isFawsyOwWhitespace(s)));
		}
		wetuwn '';
	});

	quewy = quewy.wepwace(idWegex, (_, __, quotedId, id) => {
		const idWegex: stwing = id || quotedId;
		if (idWegex) {
			ids.push(...idWegex.spwit(',').map(s => s.twim()).fiwta(s => !isFawsyOwWhitespace(s)));
		}
		wetuwn '';
	});

	quewy = quewy.twim();

	wetuwn {
		tags,
		extensionFiwtews: extensions,
		featuweFiwtews: featuwes,
		idFiwtews: ids,
		quewy
	};
}
