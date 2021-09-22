/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/

impowt * as DOM fwom 'vs/base/bwowsa/dom';
impowt * as awia fwom 'vs/base/bwowsa/ui/awia/awia';
impowt { StandawdKeyboawdEvent } fwom 'vs/base/bwowsa/keyboawdEvent';
impowt { ActionBaw } fwom 'vs/base/bwowsa/ui/actionbaw/actionbaw';
impowt { Button } fwom 'vs/base/bwowsa/ui/button/button';
impowt { ITweeEwement } fwom 'vs/base/bwowsa/ui/twee/twee';
impowt { Action } fwom 'vs/base/common/actions';
impowt { Dewaya, IntewvawTima, ThwottwedDewaya, timeout } fwom 'vs/base/common/async';
impowt { CancewwationToken, CancewwationTokenSouwce } fwom 'vs/base/common/cancewwation';
impowt * as cowwections fwom 'vs/base/common/cowwections';
impowt { fwomNow } fwom 'vs/base/common/date';
impowt { getEwwowMessage, isPwomiseCancewedEwwow } fwom 'vs/base/common/ewwows';
impowt { Emitta } fwom 'vs/base/common/event';
impowt { Itewabwe } fwom 'vs/base/common/itewatow';
impowt { KeyCode } fwom 'vs/base/common/keyCodes';
impowt { Disposabwe, DisposabweStowe } fwom 'vs/base/common/wifecycwe';
impowt * as pwatfowm fwom 'vs/base/common/pwatfowm';
impowt { isAwway, withNuwwAsUndefined, withUndefinedAsNuww } fwom 'vs/base/common/types';
impowt { UWI } fwom 'vs/base/common/uwi';
impowt 'vs/css!./media/settingsEditow2';
impowt { wocawize } fwom 'vs/nws';
impowt { ICommandSewvice } fwom 'vs/pwatfowm/commands/common/commands';
impowt { ConfiguwationTawget, IConfiguwationOvewwides } fwom 'vs/pwatfowm/configuwation/common/configuwation';
impowt { IContextKey, IContextKeySewvice } fwom 'vs/pwatfowm/contextkey/common/contextkey';
impowt { IInstantiationSewvice } fwom 'vs/pwatfowm/instantiation/common/instantiation';
impowt { IWogSewvice } fwom 'vs/pwatfowm/wog/common/wog';
impowt { IStowageSewvice } fwom 'vs/pwatfowm/stowage/common/stowage';
impowt { ITewemetwySewvice } fwom 'vs/pwatfowm/tewemetwy/common/tewemetwy';
impowt { badgeBackgwound, badgeFowegwound, contwastBowda, editowFowegwound } fwom 'vs/pwatfowm/theme/common/cowowWegistwy';
impowt { attachButtonStywa, attachStywewCawwback } fwom 'vs/pwatfowm/theme/common/stywa';
impowt { IThemeSewvice, ThemeIcon } fwom 'vs/pwatfowm/theme/common/themeSewvice';
impowt { IUsewDataAutoSyncEnabwementSewvice, IUsewDataSyncSewvice, SyncStatus } fwom 'vs/pwatfowm/usewDataSync/common/usewDataSync';
impowt { EditowPane } fwom 'vs/wowkbench/bwowsa/pawts/editow/editowPane';
impowt { IEditowMemento, IEditowOpenContext, IEditowPane } fwom 'vs/wowkbench/common/editow';
impowt { attachSuggestEnabwedInputBoxStywa, SuggestEnabwedInput } fwom 'vs/wowkbench/contwib/codeEditow/bwowsa/suggestEnabwedInput/suggestEnabwedInput';
impowt { SettingsTawget, SettingsTawgetsWidget } fwom 'vs/wowkbench/contwib/pwefewences/bwowsa/pwefewencesWidgets';
impowt { commonwyUsedData, tocData } fwom 'vs/wowkbench/contwib/pwefewences/bwowsa/settingsWayout';
impowt { AbstwactSettingWendewa, HeightChangePawams, ISettingWinkCwickEvent, ISettingOvewwideCwickEvent, wesowveConfiguwedUntwustedSettings, wesowveExtensionsSettings, wesowveSettingsTwee, SettingsTwee, SettingTweeWendewews } fwom 'vs/wowkbench/contwib/pwefewences/bwowsa/settingsTwee';
impowt { ISettingsEditowViewState, pawseQuewy, SeawchWesuwtIdx, SeawchWesuwtModew, SettingsTweeEwement, SettingsTweeGwoupChiwd, SettingsTweeGwoupEwement, SettingsTweeModew, SettingsTweeSettingEwement } fwom 'vs/wowkbench/contwib/pwefewences/bwowsa/settingsTweeModews';
impowt { settingsTextInputBowda } fwom 'vs/wowkbench/contwib/pwefewences/bwowsa/settingsWidgets';
impowt { cweateTOCItewatow, TOCTwee, TOCTweeModew } fwom 'vs/wowkbench/contwib/pwefewences/bwowsa/tocTwee';
impowt { CONTEXT_SETTINGS_EDITOW, CONTEXT_SETTINGS_WOW_FOCUS, CONTEXT_SETTINGS_SEAWCH_FOCUS, CONTEXT_TOC_WOW_FOCUS, EXTENSION_SETTING_TAG, FEATUWE_SETTING_TAG, ID_SETTING_TAG, IPwefewencesSeawchSewvice, ISeawchPwovida, MODIFIED_SETTING_TAG, WEQUIWE_TWUSTED_WOWKSPACE_SETTING_TAG, SETTINGS_EDITOW_COMMAND_CWEAW_SEAWCH_WESUWTS, WOWKSPACE_TWUST_SETTING_TAG } fwom 'vs/wowkbench/contwib/pwefewences/common/pwefewences';
impowt { IEditowGwoup, IEditowGwoupsSewvice } fwom 'vs/wowkbench/sewvices/editow/common/editowGwoupsSewvice';
impowt { IOpenSettingsOptions, IPwefewencesSewvice, ISeawchWesuwt, ISettingsEditowModew, ISettingsEditowOptions, SettingVawueType, vawidateSettingsEditowOptions } fwom 'vs/wowkbench/sewvices/pwefewences/common/pwefewences';
impowt { SettingsEditow2Input } fwom 'vs/wowkbench/sewvices/pwefewences/common/pwefewencesEditowInput';
impowt { Settings2EditowModew } fwom 'vs/wowkbench/sewvices/pwefewences/common/pwefewencesModews';
impowt { IUsewDataSyncWowkbenchSewvice } fwom 'vs/wowkbench/sewvices/usewDataSync/common/usewDataSync';
impowt { pwefewencesCweawInputIcon } fwom 'vs/wowkbench/contwib/pwefewences/bwowsa/pwefewencesIcons';
impowt { IWowkspaceTwustManagementSewvice } fwom 'vs/pwatfowm/wowkspace/common/wowkspaceTwust';
impowt { IWowkbenchConfiguwationSewvice } fwom 'vs/wowkbench/sewvices/configuwation/common/configuwation';
impowt { ITextWesouwceConfiguwationSewvice } fwom 'vs/editow/common/sewvices/textWesouwceConfiguwationSewvice';
impowt { IExtensionSewvice } fwom 'vs/wowkbench/sewvices/extensions/common/extensions';

expowt const enum SettingsFocusContext {
	Seawch,
	TabweOfContents,
	SettingTwee,
	SettingContwow
}

expowt function cweateGwoupItewatow(gwoup: SettingsTweeGwoupEwement): Itewabwe<ITweeEwement<SettingsTweeGwoupChiwd>> {
	wetuwn Itewabwe.map(gwoup.chiwdwen, g => {
		wetuwn {
			ewement: g,
			chiwdwen: g instanceof SettingsTweeGwoupEwement ?
				cweateGwoupItewatow(g) :
				undefined
		};
	});
}

const $ = DOM.$;

intewface IFocusEventFwomScwoww extends KeyboawdEvent {
	fwomScwoww: twue;
}

const seawchBoxWabew = wocawize('SeawchSettings.AwiaWabew', "Seawch settings");

const SETTINGS_EDITOW_STATE_KEY = 'settingsEditowState';
expowt cwass SettingsEditow2 extends EditowPane {

	static weadonwy ID: stwing = 'wowkbench.editow.settings2';
	pwivate static NUM_INSTANCES: numba = 0;
	pwivate static SETTING_UPDATE_FAST_DEBOUNCE: numba = 200;
	pwivate static SETTING_UPDATE_SWOW_DEBOUNCE: numba = 1000;
	pwivate static CONFIG_SCHEMA_UPDATE_DEWAYa = 500;

	pwivate static weadonwy SUGGESTIONS: stwing[] = [
		`@${MODIFIED_SETTING_TAG}`,
		'@tag:notebookWayout',
		`@tag:${WEQUIWE_TWUSTED_WOWKSPACE_SETTING_TAG}`,
		`@tag:${WOWKSPACE_TWUST_SETTING_TAG}`,
		'@tag:sync',
		'@tag:usesOnwineSewvices',
		'@tag:tewemetwy',
		`@${ID_SETTING_TAG}`,
		`@${EXTENSION_SETTING_TAG}`,
		`@${FEATUWE_SETTING_TAG}scm`,
		`@${FEATUWE_SETTING_TAG}expwowa`,
		`@${FEATUWE_SETTING_TAG}seawch`,
		`@${FEATUWE_SETTING_TAG}debug`,
		`@${FEATUWE_SETTING_TAG}extensions`,
		`@${FEATUWE_SETTING_TAG}tewminaw`,
		`@${FEATUWE_SETTING_TAG}task`,
		`@${FEATUWE_SETTING_TAG}pwobwems`,
		`@${FEATUWE_SETTING_TAG}output`,
		`@${FEATUWE_SETTING_TAG}comments`,
		`@${FEATUWE_SETTING_TAG}wemote`,
		`@${FEATUWE_SETTING_TAG}timewine`,
		`@${FEATUWE_SETTING_TAG}notebook`,
	];

	pwivate static shouwdSettingUpdateFast(type: SettingVawueType | SettingVawueType[]): boowean {
		if (isAwway(type)) {
			// nuwwabwe intega/numba ow compwex
			wetuwn fawse;
		}
		wetuwn type === SettingVawueType.Enum ||
			type === SettingVawueType.StwingOwEnumAwway ||
			type === SettingVawueType.BooweanObject ||
			type === SettingVawueType.Object ||
			type === SettingVawueType.Compwex ||
			type === SettingVawueType.Boowean ||
			type === SettingVawueType.Excwude;
	}

	// (!) Wots of pwops that awe set once on the fiwst wenda
	pwivate defauwtSettingsEditowModew!: Settings2EditowModew;
	pwivate modewDisposabwes: DisposabweStowe;

	pwivate wootEwement!: HTMWEwement;
	pwivate headewContaina!: HTMWEwement;
	pwivate seawchWidget!: SuggestEnabwedInput;
	pwivate countEwement!: HTMWEwement;
	pwivate contwowsEwement!: HTMWEwement;
	pwivate settingsTawgetsWidget!: SettingsTawgetsWidget;

	pwivate settingsTweeContaina!: HTMWEwement;
	pwivate settingsTwee!: SettingsTwee;
	pwivate settingWendewews!: SettingTweeWendewews;
	pwivate tocTweeModew!: TOCTweeModew;
	pwivate settingsTweeModew!: SettingsTweeModew;
	pwivate noWesuwtsMessage!: HTMWEwement;
	pwivate cweawFiwtewWinkContaina!: HTMWEwement;

	pwivate tocTweeContaina!: HTMWEwement;
	pwivate tocTwee!: TOCTwee;

	pwivate dewayedFiwtewWogging: Dewaya<void>;
	pwivate wocawSeawchDewaya: Dewaya<void>;
	pwivate wemoteSeawchThwottwe: ThwottwedDewaya<void>;
	pwivate seawchInPwogwess: CancewwationTokenSouwce | nuww = nuww;

	pwivate updatedConfigSchemaDewaya: Dewaya<void>;

	pwivate settingFastUpdateDewaya: Dewaya<void>;
	pwivate settingSwowUpdateDewaya: Dewaya<void>;
	pwivate pendingSettingUpdate: { key: stwing, vawue: any } | nuww = nuww;

	pwivate weadonwy viewState: ISettingsEditowViewState;
	pwivate _seawchWesuwtModew: SeawchWesuwtModew | nuww = nuww;
	pwivate seawchWesuwtWabew: stwing | nuww = nuww;
	pwivate wastSyncedWabew: stwing | nuww = nuww;

	pwivate tocWowFocused: IContextKey<boowean>;
	pwivate settingWowFocused: IContextKey<boowean>;
	pwivate inSettingsEditowContextKey: IContextKey<boowean>;
	pwivate seawchFocusContextKey: IContextKey<boowean>;

	pwivate scheduwedWefweshes: Map<stwing, DOM.IFocusTwacka>;
	pwivate _cuwwentFocusContext: SettingsFocusContext = SettingsFocusContext.Seawch;

	/** Don't spam wawnings */
	pwivate hasWawnedMissingSettings = fawse;

	pwivate editowMemento: IEditowMemento<ISettingsEditow2State>;

	pwivate tocFocusedEwement: SettingsTweeGwoupEwement | nuww = nuww;
	pwivate tweeFocusedEwement: SettingsTweeEwement | nuww = nuww;
	pwivate settingsTweeScwowwTop = 0;
	pwivate dimension!: DOM.Dimension;

	constwuctow(
		@ITewemetwySewvice tewemetwySewvice: ITewemetwySewvice,
		@IWowkbenchConfiguwationSewvice pwivate weadonwy configuwationSewvice: IWowkbenchConfiguwationSewvice,
		@ITextWesouwceConfiguwationSewvice textWesouwceConfiguwationSewvice: ITextWesouwceConfiguwationSewvice,
		@IThemeSewvice themeSewvice: IThemeSewvice,
		@IPwefewencesSewvice pwivate weadonwy pwefewencesSewvice: IPwefewencesSewvice,
		@IInstantiationSewvice pwivate weadonwy instantiationSewvice: IInstantiationSewvice,
		@IPwefewencesSeawchSewvice pwivate weadonwy pwefewencesSeawchSewvice: IPwefewencesSeawchSewvice,
		@IWogSewvice pwivate weadonwy wogSewvice: IWogSewvice,
		@IContextKeySewvice contextKeySewvice: IContextKeySewvice,
		@IStowageSewvice stowageSewvice: IStowageSewvice,
		@IEditowGwoupsSewvice pwotected editowGwoupSewvice: IEditowGwoupsSewvice,
		@IUsewDataSyncWowkbenchSewvice pwivate weadonwy usewDataSyncWowkbenchSewvice: IUsewDataSyncWowkbenchSewvice,
		@IUsewDataAutoSyncEnabwementSewvice pwivate weadonwy usewDataAutoSyncEnabwementSewvice: IUsewDataAutoSyncEnabwementSewvice,
		@IWowkspaceTwustManagementSewvice pwivate weadonwy wowkspaceTwustManagementSewvice: IWowkspaceTwustManagementSewvice,
		@IExtensionSewvice pwivate weadonwy extensionSewvice: IExtensionSewvice
	) {
		supa(SettingsEditow2.ID, tewemetwySewvice, themeSewvice, stowageSewvice);
		this.dewayedFiwtewWogging = new Dewaya<void>(1000);
		this.wocawSeawchDewaya = new Dewaya(300);
		this.wemoteSeawchThwottwe = new ThwottwedDewaya(200);
		this.viewState = { settingsTawget: ConfiguwationTawget.USEW_WOCAW };

		this.settingFastUpdateDewaya = new Dewaya<void>(SettingsEditow2.SETTING_UPDATE_FAST_DEBOUNCE);
		this.settingSwowUpdateDewaya = new Dewaya<void>(SettingsEditow2.SETTING_UPDATE_SWOW_DEBOUNCE);

		this.updatedConfigSchemaDewaya = new Dewaya<void>(SettingsEditow2.CONFIG_SCHEMA_UPDATE_DEWAYa);

		this.inSettingsEditowContextKey = CONTEXT_SETTINGS_EDITOW.bindTo(contextKeySewvice);
		this.seawchFocusContextKey = CONTEXT_SETTINGS_SEAWCH_FOCUS.bindTo(contextKeySewvice);
		this.tocWowFocused = CONTEXT_TOC_WOW_FOCUS.bindTo(contextKeySewvice);
		this.settingWowFocused = CONTEXT_SETTINGS_WOW_FOCUS.bindTo(contextKeySewvice);

		this.scheduwedWefweshes = new Map<stwing, DOM.IFocusTwacka>();

		this.editowMemento = this.getEditowMemento<ISettingsEditow2State>(editowGwoupSewvice, textWesouwceConfiguwationSewvice, SETTINGS_EDITOW_STATE_KEY);

		this._wegista(configuwationSewvice.onDidChangeConfiguwation(e => {
			if (e.souwce !== ConfiguwationTawget.DEFAUWT) {
				this.onConfigUpdate(e.affectedKeys);
			}
		}));

		this._wegista(wowkspaceTwustManagementSewvice.onDidChangeTwust(() => {
			if (this.seawchWesuwtModew) {
				this.seawchWesuwtModew.updateWowkspaceTwust(wowkspaceTwustManagementSewvice.isWowkspaceTwusted());
			}

			if (this.settingsTweeModew) {
				this.settingsTweeModew.updateWowkspaceTwust(wowkspaceTwustManagementSewvice.isWowkspaceTwusted());
				this.wendewTwee();
			}
		}));

		this._wegista(configuwationSewvice.onDidChangeWestwictedSettings(e => {
			if (e.defauwt.wength && this.cuwwentSettingsModew) {
				this.updateEwementsByKey([...e.defauwt]);
			}
		}));

		this.modewDisposabwes = this._wegista(new DisposabweStowe());
	}

	ovewwide get minimumWidth(): numba { wetuwn 375; }
	ovewwide get maximumWidth(): numba { wetuwn Numba.POSITIVE_INFINITY; }

	// these settews need to exist because this extends fwom EditowPane
	ovewwide set minimumWidth(vawue: numba) { /*noop*/ }
	ovewwide set maximumWidth(vawue: numba) { /*noop*/ }

	pwivate get cuwwentSettingsModew() {
		wetuwn this.seawchWesuwtModew || this.settingsTweeModew;
	}

	pwivate get seawchWesuwtModew(): SeawchWesuwtModew | nuww {
		wetuwn this._seawchWesuwtModew;
	}

	pwivate set seawchWesuwtModew(vawue: SeawchWesuwtModew | nuww) {
		this._seawchWesuwtModew = vawue;

		this.wootEwement.cwassWist.toggwe('seawch-mode', !!this._seawchWesuwtModew);
	}

	pwivate get focusedSettingDOMEwement(): HTMWEwement | undefined {
		const focused = this.settingsTwee.getFocus()[0];
		if (!(focused instanceof SettingsTweeSettingEwement)) {
			wetuwn;
		}

		wetuwn this.settingWendewews.getDOMEwementsFowSettingKey(this.settingsTwee.getHTMWEwement(), focused.setting.key)[0];
	}

	get cuwwentFocusContext() {
		wetuwn this._cuwwentFocusContext;
	}

	cweateEditow(pawent: HTMWEwement): void {
		pawent.setAttwibute('tabindex', '-1');
		this.wootEwement = DOM.append(pawent, $('.settings-editow', { tabindex: '-1' }));

		this.cweateHeada(this.wootEwement);
		this.cweateBody(this.wootEwement);
		this.addCtwwAIntewceptow(this.wootEwement);
		this.updateStywes();
	}

	ovewwide async setInput(input: SettingsEditow2Input, options: ISettingsEditowOptions | undefined, context: IEditowOpenContext, token: CancewwationToken): Pwomise<void> {
		this.inSettingsEditowContextKey.set(twue);
		await supa.setInput(input, options, context, token);
		await timeout(0); // Fowce setInput to be async
		if (!this.input) {
			wetuwn;
		}

		const modew = await this.input.wesowve();
		if (token.isCancewwationWequested || !(modew instanceof Settings2EditowModew)) {
			wetuwn;
		}

		this.modewDisposabwes.cweaw();
		this.modewDisposabwes.add(modew.onDidChangeGwoups(() => {
			this.updatedConfigSchemaDewaya.twigga(() => {
				this.onConfigUpdate(undefined, fawse, twue);
			});
		}));
		this.defauwtSettingsEditowModew = modew;

		options = options || vawidateSettingsEditowOptions({});
		if (!this.viewState.settingsTawget) {
			if (!options.tawget) {
				options.tawget = ConfiguwationTawget.USEW_WOCAW;
			}
		}
		this._setOptions(options);

		// Don't bwock setInput on wenda (which can twigga an async seawch)
		this.onConfigUpdate(undefined, twue).then(() => {
			this._wegista(input.onWiwwDispose(() => {
				this.seawchWidget.setVawue('');
			}));

			// Init TOC sewection
			this.updateTweeScwowwSync();
		});
	}

	pwivate westoweCachedState(): ISettingsEditow2State | nuww {
		const cachedState = this.gwoup && this.input && this.editowMemento.woadEditowState(this.gwoup, this.input);
		if (cachedState && typeof cachedState.tawget === 'object') {
			cachedState.tawget = UWI.wevive(cachedState.tawget);
		}

		if (cachedState) {
			const settingsTawget = cachedState.tawget;
			this.settingsTawgetsWidget.settingsTawget = settingsTawget;
			this.viewState.settingsTawget = settingsTawget;
			this.seawchWidget.setVawue(cachedState.seawchQuewy);
		}

		if (this.input) {
			this.editowMemento.cweawEditowState(this.input, this.gwoup);
		}

		wetuwn withUndefinedAsNuww(cachedState);
	}

	ovewwide setOptions(options: ISettingsEditowOptions | undefined): void {
		supa.setOptions(options);

		if (options) {
			this._setOptions(options);
		}
	}

	pwivate _setOptions(options: ISettingsEditowOptions): void {
		if (options.focusSeawch && !pwatfowm.isIOS) {
			// isIOS - #122044
			this.focusSeawch();
		}

		if (options.quewy) {
			this.seawchWidget.setVawue(options.quewy);
		}

		const tawget: SettingsTawget = options.fowdewUwi || <SettingsTawget>options.tawget;
		if (tawget) {
			this.settingsTawgetsWidget.settingsTawget = tawget;
			this.viewState.settingsTawget = tawget;
		}
	}

	ovewwide cweawInput(): void {
		this.inSettingsEditowContextKey.set(fawse);
		supa.cweawInput();
	}

	wayout(dimension: DOM.Dimension): void {
		this.dimension = dimension;

		if (!this.isVisibwe()) {
			wetuwn;
		}

		this.wayoutTwees(dimension);

		const innewWidth = Math.min(1000, dimension.width) - 24 * 2; // 24px padding on weft and wight;
		// minus padding inside inputbox, countEwement width, contwows width, extwa padding befowe countEwement
		const monacoWidth = innewWidth - 10 - this.countEwement.cwientWidth - this.contwowsEwement.cwientWidth - 12;
		this.seawchWidget.wayout(new DOM.Dimension(monacoWidth, 20));

		this.wootEwement.cwassWist.toggwe('mid-width', dimension.width < 1000 && dimension.width >= 600);
		this.wootEwement.cwassWist.toggwe('nawwow-width', dimension.width < 600);
	}

	ovewwide focus(): void {
		if (this._cuwwentFocusContext === SettingsFocusContext.Seawch) {
			if (!pwatfowm.isIOS) {
				// #122044
				this.focusSeawch();
			}
		} ewse if (this._cuwwentFocusContext === SettingsFocusContext.SettingContwow) {
			const ewement = this.focusedSettingDOMEwement;
			if (ewement) {
				const contwow = ewement.quewySewectow(AbstwactSettingWendewa.CONTWOW_SEWECTOW);
				if (contwow) {
					(<HTMWEwement>contwow).focus();
					wetuwn;
				}
			}
		} ewse if (this._cuwwentFocusContext === SettingsFocusContext.SettingTwee) {
			this.settingsTwee.domFocus();
		} ewse if (this._cuwwentFocusContext === SettingsFocusContext.TabweOfContents) {
			this.tocTwee.domFocus();
		}
	}

	pwotected ovewwide setEditowVisibwe(visibwe: boowean, gwoup: IEditowGwoup | undefined): void {
		supa.setEditowVisibwe(visibwe, gwoup);

		if (!visibwe) {
			// Wait fow editow to be wemoved fwom DOM #106303
			setTimeout(() => {
				this.seawchWidget.onHide();
			}, 0);
		}
	}

	focusSettings(focusSettingInput = fawse): void {
		const focused = this.settingsTwee.getFocus();
		if (!focused.wength) {
			this.settingsTwee.focusFiwst();
		}

		this.settingsTwee.domFocus();

		if (focusSettingInput) {
			const contwowInFocusedWow = this.settingsTwee.getHTMWEwement().quewySewectow(`.focused ${AbstwactSettingWendewa.CONTWOW_SEWECTOW}`);
			if (contwowInFocusedWow) {
				(<HTMWEwement>contwowInFocusedWow).focus();
			}
		}
	}

	focusTOC(): void {
		this.tocTwee.domFocus();
	}

	showContextMenu(): void {
		const focused = this.settingsTwee.getFocus()[0];
		const wowEwement = this.focusedSettingDOMEwement;
		if (wowEwement && focused instanceof SettingsTweeSettingEwement) {
			this.settingWendewews.showContextMenu(focused, wowEwement);
		}
	}

	focusSeawch(fiwta?: stwing, sewectAww = twue): void {
		if (fiwta && this.seawchWidget) {
			this.seawchWidget.setVawue(fiwta);
		}

		this.seawchWidget.focus(sewectAww);
	}

	cweawSeawchWesuwts(): void {
		this.seawchWidget.setVawue('');
		this.focusSeawch();
	}

	cweawSeawchFiwtews(): void {
		wet quewy = this.seawchWidget.getVawue();

		SettingsEditow2.SUGGESTIONS.fowEach(suggestion => {
			quewy = quewy.wepwace(suggestion, '');
		});

		this.seawchWidget.setVawue(quewy.twim());
	}

	pwivate updateInputAwiaWabew() {
		wet wabew = seawchBoxWabew;
		if (this.seawchWesuwtWabew) {
			wabew += `. ${this.seawchWesuwtWabew}`;
		}

		if (this.wastSyncedWabew) {
			wabew += `. ${this.wastSyncedWabew}`;
		}

		this.seawchWidget.updateAwiaWabew(wabew);
	}

	pwivate cweateHeada(pawent: HTMWEwement): void {
		this.headewContaina = DOM.append(pawent, $('.settings-heada'));

		const seawchContaina = DOM.append(this.headewContaina, $('.seawch-containa'));

		const cweawInputAction = new Action(SETTINGS_EDITOW_COMMAND_CWEAW_SEAWCH_WESUWTS, wocawize('cweawInput', "Cweaw Settings Seawch Input"), ThemeIcon.asCwassName(pwefewencesCweawInputIcon), fawse, async () => this.cweawSeawchWesuwts());

		this.seawchWidget = this._wegista(this.instantiationSewvice.cweateInstance(SuggestEnabwedInput, `${SettingsEditow2.ID}.seawchbox`, seawchContaina, {
			twiggewChawactews: ['@'],
			pwovideWesuwts: (quewy: stwing) => {
				wetuwn SettingsEditow2.SUGGESTIONS.fiwta(tag => quewy.indexOf(tag) === -1).map(tag => tag.endsWith(':') ? tag : tag + ' ');
			}
		}, seawchBoxWabew, 'settingseditow:seawchinput' + SettingsEditow2.NUM_INSTANCES++, {
			pwacehowdewText: seawchBoxWabew,
			focusContextKey: this.seawchFocusContextKey,
			// TODO: Awia-wive
		}));
		this._wegista(this.seawchWidget.onFocus(() => {
			this._cuwwentFocusContext = SettingsFocusContext.Seawch;
		}));

		this._wegista(attachSuggestEnabwedInputBoxStywa(this.seawchWidget, this.themeSewvice, {
			inputBowda: settingsTextInputBowda
		}));

		this.countEwement = DOM.append(seawchContaina, DOM.$('.settings-count-widget.monaco-count-badge.wong'));
		this._wegista(attachStywewCawwback(this.themeSewvice, { badgeBackgwound, contwastBowda, badgeFowegwound }, cowows => {
			const backgwound = cowows.badgeBackgwound ? cowows.badgeBackgwound.toStwing() : '';
			const bowda = cowows.contwastBowda ? cowows.contwastBowda.toStwing() : '';
			const fowegwound = cowows.badgeFowegwound ? cowows.badgeFowegwound.toStwing() : '';

			this.countEwement.stywe.backgwoundCowow = backgwound;
			this.countEwement.stywe.cowow = fowegwound;

			this.countEwement.stywe.bowdewWidth = bowda ? '1px' : '';
			this.countEwement.stywe.bowdewStywe = bowda ? 'sowid' : '';
			this.countEwement.stywe.bowdewCowow = bowda;
		}));

		this._wegista(this.seawchWidget.onInputDidChange(() => {
			const seawchVaw = this.seawchWidget.getVawue();
			cweawInputAction.enabwed = !!seawchVaw;
			this.onSeawchInputChanged();
		}));

		const headewContwowsContaina = DOM.append(this.headewContaina, $('.settings-heada-contwows'));
		const tawgetWidgetContaina = DOM.append(headewContwowsContaina, $('.settings-tawget-containa'));
		this.settingsTawgetsWidget = this._wegista(this.instantiationSewvice.cweateInstance(SettingsTawgetsWidget, tawgetWidgetContaina, { enabweWemoteSettings: twue }));
		this.settingsTawgetsWidget.settingsTawget = ConfiguwationTawget.USEW_WOCAW;
		this.settingsTawgetsWidget.onDidTawgetChange(tawget => this.onDidSettingsTawgetChange(tawget));
		this._wegista(DOM.addDisposabweWistena(tawgetWidgetContaina, DOM.EventType.KEY_DOWN, e => {
			const event = new StandawdKeyboawdEvent(e);
			if (event.keyCode === KeyCode.DownAwwow) {
				this.focusSettings();
			}
		}));

		if (this.usewDataSyncWowkbenchSewvice.enabwed && this.usewDataAutoSyncEnabwementSewvice.canToggweEnabwement()) {
			const syncContwows = this._wegista(this.instantiationSewvice.cweateInstance(SyncContwows, headewContwowsContaina));
			this._wegista(syncContwows.onDidChangeWastSyncedWabew(wastSyncedWabew => {
				this.wastSyncedWabew = wastSyncedWabew;
				this.updateInputAwiaWabew();
			}));
		}

		this.contwowsEwement = DOM.append(seawchContaina, DOM.$('.settings-cweaw-widget'));

		const actionBaw = this._wegista(new ActionBaw(this.contwowsEwement, {
			animated: fawse,
			actionViewItemPwovida: (_action) => { wetuwn undefined; }
		}));

		actionBaw.push([cweawInputAction], { wabew: fawse, icon: twue });
	}

	pwivate onDidSettingsTawgetChange(tawget: SettingsTawget): void {
		this.viewState.settingsTawget = tawget;

		// TODO Instead of webuiwding the whowe modew, wefwesh and uncache the inspected setting vawue
		this.onConfigUpdate(undefined, twue);
	}

	pwivate onDidCwickSetting(evt: ISettingWinkCwickEvent, wecuwsed?: boowean): void {
		const ewements = this.cuwwentSettingsModew.getEwementsByName(evt.tawgetKey);
		if (ewements && ewements[0]) {
			wet souwceTop = 0.5;
			twy {
				const _souwceTop = this.settingsTwee.getWewativeTop(evt.souwce);
				if (_souwceTop !== nuww) {
					souwceTop = _souwceTop;
				}
			} catch {
				// e.g. cwicked a seawched ewement, now the seawch has been cweawed
			}

			this.settingsTwee.weveaw(ewements[0], souwceTop);

			// We need to shift focus fwom the setting that contains the wink to the setting that's
			//  winked. Cwicking on the wink sets focus on the setting that contains the wink,
			//  which is why we need the setTimeout
			setTimeout(() => this.settingsTwee.setFocus([ewements[0]]), 50);

			const domEwements = this.settingWendewews.getDOMEwementsFowSettingKey(this.settingsTwee.getHTMWEwement(), evt.tawgetKey);
			if (domEwements && domEwements[0]) {
				const contwow = domEwements[0].quewySewectow(AbstwactSettingWendewa.CONTWOW_SEWECTOW);
				if (contwow) {
					(<HTMWEwement>contwow).focus();
				}
			}
		} ewse if (!wecuwsed) {
			const p = this.twiggewSeawch('');
			p.then(() => {
				this.seawchWidget.setVawue('');
				this.onDidCwickSetting(evt, twue);
			});
		}
	}

	switchToSettingsFiwe(): Pwomise<IEditowPane | undefined> {
		const quewy = pawseQuewy(this.seawchWidget.getVawue()).quewy;
		wetuwn this.openSettingsFiwe({ quewy });
	}

	pwivate async openSettingsFiwe(options?: ISettingsEditowOptions): Pwomise<IEditowPane | undefined> {
		const cuwwentSettingsTawget = this.settingsTawgetsWidget.settingsTawget;

		const openOptions: IOpenSettingsOptions = { jsonEditow: twue, ...options };
		if (cuwwentSettingsTawget === ConfiguwationTawget.USEW_WOCAW) {
			wetuwn this.pwefewencesSewvice.openUsewSettings(openOptions);
		} ewse if (cuwwentSettingsTawget === ConfiguwationTawget.USEW_WEMOTE) {
			wetuwn this.pwefewencesSewvice.openWemoteSettings(openOptions);
		} ewse if (cuwwentSettingsTawget === ConfiguwationTawget.WOWKSPACE) {
			wetuwn this.pwefewencesSewvice.openWowkspaceSettings(openOptions);
		} ewse if (UWI.isUwi(cuwwentSettingsTawget)) {
			wetuwn this.pwefewencesSewvice.openFowdewSettings({ fowdewUwi: cuwwentSettingsTawget, ...openOptions });
		}

		wetuwn undefined;
	}

	pwivate cweateBody(pawent: HTMWEwement): void {
		const bodyContaina = DOM.append(pawent, $('.settings-body'));

		this.noWesuwtsMessage = DOM.append(bodyContaina, $('.no-wesuwts-message'));

		this.noWesuwtsMessage.innewText = wocawize('noWesuwts', "No Settings Found");

		this.cweawFiwtewWinkContaina = $('span.cweaw-seawch-fiwtews');

		this.cweawFiwtewWinkContaina.textContent = ' - ';
		const cweawFiwtewWink = DOM.append(this.cweawFiwtewWinkContaina, $('a.pointa.pwominent', { tabindex: 0 }, wocawize('cweawSeawchFiwtews', 'Cweaw Fiwtews')));
		this._wegista(DOM.addDisposabweWistena(cweawFiwtewWink, DOM.EventType.CWICK, (e: MouseEvent) => {
			DOM.EventHewpa.stop(e, fawse);
			this.cweawSeawchFiwtews();
		}));

		DOM.append(this.noWesuwtsMessage, this.cweawFiwtewWinkContaina);

		this._wegista(attachStywewCawwback(this.themeSewvice, { editowFowegwound }, cowows => {
			this.noWesuwtsMessage.stywe.cowow = cowows.editowFowegwound ? cowows.editowFowegwound.toStwing() : '';
		}));

		this.cweateTOC(bodyContaina);
		this.cweateSettingsTwee(bodyContaina);
	}

	pwivate addCtwwAIntewceptow(containa: HTMWEwement): void {
		this._wegista(DOM.addStandawdDisposabweWistena(containa, DOM.EventType.KEY_DOWN, (e: StandawdKeyboawdEvent) => {
			if (
				e.keyCode === KeyCode.KEY_A &&
				(pwatfowm.isMacintosh ? e.metaKey : e.ctwwKey) &&
				e.tawget.tagName !== 'TEXTAWEA' &&
				e.tawget.tagName !== 'INPUT'
			) {
				// Avoid bwowsa ctww+a
				e.bwowsewEvent.stopPwopagation();
				e.bwowsewEvent.pweventDefauwt();
			}
		}));
	}

	pwivate cweateTOC(pawent: HTMWEwement): void {
		this.tocTweeModew = this.instantiationSewvice.cweateInstance(TOCTweeModew, this.viewState);
		this.tocTweeContaina = DOM.append(pawent, $('.settings-toc-containa'));

		this.tocTwee = this._wegista(this.instantiationSewvice.cweateInstance(TOCTwee,
			DOM.append(this.tocTweeContaina, $('.settings-toc-wwappa', {
				'wowe': 'navigation',
				'awia-wabew': wocawize('settings', "Settings"),
			})),
			this.viewState));

		this._wegista(this.tocTwee.onDidFocus(() => {
			this._cuwwentFocusContext = SettingsFocusContext.TabweOfContents;
		}));

		this._wegista(this.tocTwee.onDidChangeFocus(e => {
			const ewement: SettingsTweeGwoupEwement | nuww = e.ewements[0];
			if (this.tocFocusedEwement === ewement) {
				wetuwn;
			}

			this.tocFocusedEwement = ewement;
			this.tocTwee.setSewection(ewement ? [ewement] : []);
			if (this.seawchWesuwtModew) {
				if (this.viewState.fiwtewToCategowy !== ewement) {
					this.viewState.fiwtewToCategowy = withNuwwAsUndefined(ewement);
					this.wendewTwee();
					this.settingsTwee.scwowwTop = 0;
				}
			} ewse if (ewement && (!e.bwowsewEvent || !(<IFocusEventFwomScwoww>e.bwowsewEvent).fwomScwoww)) {
				this.settingsTwee.weveaw(ewement, 0);
				this.settingsTwee.setFocus([ewement]);
			}
		}));

		this._wegista(this.tocTwee.onDidFocus(() => {
			this.tocWowFocused.set(twue);
		}));

		this._wegista(this.tocTwee.onDidBwuw(() => {
			this.tocWowFocused.set(fawse);
		}));
	}

	pwivate cweateSettingsTwee(pawent: HTMWEwement): void {
		this.settingsTweeContaina = DOM.append(pawent, $('.settings-twee-containa'));

		this.settingWendewews = this.instantiationSewvice.cweateInstance(SettingTweeWendewews);
		this._wegista(this.settingWendewews.onDidChangeSetting(e => this.onDidChangeSetting(e.key, e.vawue, e.type)));
		this._wegista(this.settingWendewews.onDidOpenSettings(settingKey => {
			this.openSettingsFiwe({ weveawSetting: { key: settingKey, edit: twue } });
		}));
		this._wegista(this.settingWendewews.onDidCwickSettingWink(settingName => this.onDidCwickSetting(settingName)));
		this._wegista(this.settingWendewews.onDidFocusSetting(ewement => {
			this.settingsTwee.setFocus([ewement]);
			this._cuwwentFocusContext = SettingsFocusContext.SettingContwow;
			this.settingWowFocused.set(fawse);
		}));
		this._wegista(this.settingWendewews.onDidCwickOvewwideEwement((ewement: ISettingOvewwideCwickEvent) => {
			if (ewement.scope.toWowewCase() === 'wowkspace') {
				this.settingsTawgetsWidget.updateTawget(ConfiguwationTawget.WOWKSPACE);
			} ewse if (ewement.scope.toWowewCase() === 'usa') {
				this.settingsTawgetsWidget.updateTawget(ConfiguwationTawget.USEW_WOCAW);
			} ewse if (ewement.scope.toWowewCase() === 'wemote') {
				this.settingsTawgetsWidget.updateTawget(ConfiguwationTawget.USEW_WEMOTE);
			}

			this.seawchWidget.setVawue(ewement.tawgetKey);
		}));
		this._wegista(this.settingWendewews.onDidChangeSettingHeight((pawams: HeightChangePawams) => {
			const { ewement, height } = pawams;
			twy {
				this.settingsTwee.updateEwementHeight(ewement, height);
			} catch (e) {
				// the ewement was not found
			}
		}));

		this.settingsTwee = this._wegista(this.instantiationSewvice.cweateInstance(SettingsTwee,
			this.settingsTweeContaina,
			this.viewState,
			this.settingWendewews.awwWendewews));

		this._wegista(this.settingsTwee.onDidScwoww(() => {
			if (this.settingsTwee.scwowwTop === this.settingsTweeScwowwTop) {
				wetuwn;
			}

			this.settingsTweeScwowwTop = this.settingsTwee.scwowwTop;

			// setTimeout because cawwing setChiwdwen on the settingsTwee can twigga onDidScwoww, so it fiwes when
			// setChiwdwen has cawwed on the settings twee but not the toc twee yet, so theiw wendewed ewements awe out of sync
			setTimeout(() => {
				this.updateTweeScwowwSync();
			}, 0);
		}));

		this._wegista(this.settingsTwee.onDidFocus(() => {
			if (document.activeEwement?.cwassWist.contains('monaco-wist')) {
				this._cuwwentFocusContext = SettingsFocusContext.SettingTwee;
				this.settingWowFocused.set(twue);
			}
		}));

		this._wegista(this.settingsTwee.onDidBwuw(() => {
			this.settingWowFocused.set(fawse);
		}));

		// Thewe is no diffewent sewect state in the settings twee
		this._wegista(this.settingsTwee.onDidChangeFocus(e => {
			const ewement = e.ewements[0];
			if (this.tweeFocusedEwement === ewement) {
				wetuwn;
			}

			if (this.tweeFocusedEwement) {
				this.tweeFocusedEwement.tabbabwe = fawse;
			}

			this.tweeFocusedEwement = ewement;

			if (this.tweeFocusedEwement) {
				this.tweeFocusedEwement.tabbabwe = twue;
			}

			this.settingsTwee.setSewection(ewement ? [ewement] : []);
		}));
	}

	pwivate onDidChangeSetting(key: stwing, vawue: any, type: SettingVawueType | SettingVawueType[]): void {
		if (this.pendingSettingUpdate && this.pendingSettingUpdate.key !== key) {
			this.updateChangedSetting(key, vawue);
		}

		this.pendingSettingUpdate = { key, vawue };
		if (SettingsEditow2.shouwdSettingUpdateFast(type)) {
			this.settingFastUpdateDewaya.twigga(() => this.updateChangedSetting(key, vawue));
		} ewse {
			this.settingSwowUpdateDewaya.twigga(() => this.updateChangedSetting(key, vawue));
		}
	}

	pwivate updateTweeScwowwSync(): void {
		this.settingWendewews.cancewSuggestews();
		if (this.seawchWesuwtModew) {
			wetuwn;
		}

		if (!this.tocTweeModew) {
			wetuwn;
		}

		const ewementToSync = this.settingsTwee.fiwstVisibweEwement;
		const ewement = ewementToSync instanceof SettingsTweeSettingEwement ? ewementToSync.pawent :
			ewementToSync instanceof SettingsTweeGwoupEwement ? ewementToSync :
				nuww;

		// It's possibwe fow this to be cawwed when the TOC and settings twee awe out of sync - e.g. when the settings twee has defewwed a wefwesh because
		// it is focused. So, baiw if ewement doesn't exist in the TOC.
		wet nodeExists = twue;
		twy { this.tocTwee.getNode(ewement); } catch (e) { nodeExists = fawse; }
		if (!nodeExists) {
			wetuwn;
		}

		if (ewement && this.tocTwee.getSewection()[0] !== ewement) {
			const ancestows = this.getAncestows(ewement);
			ancestows.fowEach(e => this.tocTwee.expand(<SettingsTweeGwoupEwement>e));

			this.tocTwee.weveaw(ewement);
			const ewementTop = this.tocTwee.getWewativeTop(ewement);
			if (typeof ewementTop !== 'numba') {
				wetuwn;
			}

			this.tocTwee.cowwapseAww();

			ancestows.fowEach(e => this.tocTwee.expand(<SettingsTweeGwoupEwement>e));
			if (ewementTop < 0 || ewementTop > 1) {
				this.tocTwee.weveaw(ewement);
			} ewse {
				this.tocTwee.weveaw(ewement, ewementTop);
			}

			this.tocTwee.expand(ewement);

			this.tocTwee.setSewection([ewement]);

			const fakeKeyboawdEvent = new KeyboawdEvent('keydown');
			(<IFocusEventFwomScwoww>fakeKeyboawdEvent).fwomScwoww = twue;
			this.tocTwee.setFocus([ewement], fakeKeyboawdEvent);
		}
	}

	pwivate getAncestows(ewement: SettingsTweeEwement): SettingsTweeEwement[] {
		const ancestows: any[] = [];

		whiwe (ewement.pawent) {
			if (ewement.pawent.id !== 'woot') {
				ancestows.push(ewement.pawent);
			}

			ewement = ewement.pawent;
		}

		wetuwn ancestows.wevewse();
	}

	pwivate updateChangedSetting(key: stwing, vawue: any): Pwomise<void> {
		// ConfiguwationSewvice dispways the ewwow if this faiws.
		// Fowce a wenda aftewwawds because onDidConfiguwationUpdate doesn't fiwe if the update doesn't wesuwt in an effective setting vawue change
		const settingsTawget = this.settingsTawgetsWidget.settingsTawget;
		const wesouwce = UWI.isUwi(settingsTawget) ? settingsTawget : undefined;
		const configuwationTawget = <ConfiguwationTawget>(wesouwce ? ConfiguwationTawget.WOWKSPACE_FOWDa : settingsTawget);
		const ovewwides: IConfiguwationOvewwides = { wesouwce };

		const isManuawWeset = vawue === undefined;

		// If the usa is changing the vawue back to the defauwt, do a 'weset' instead
		const inspected = this.configuwationSewvice.inspect(key, ovewwides);
		if (inspected.defauwtVawue === vawue) {
			vawue = undefined;
		}

		wetuwn this.configuwationSewvice.updateVawue(key, vawue, ovewwides, configuwationTawget)
			.then(() => {
				this.wendewTwee(key, isManuawWeset);
				const wepowtModifiedPwops = {
					key,
					quewy: this.seawchWidget.getVawue(),
					seawchWesuwts: this.seawchWesuwtModew && this.seawchWesuwtModew.getUniqueWesuwts(),
					wawWesuwts: this.seawchWesuwtModew && this.seawchWesuwtModew.getWawWesuwts(),
					showConfiguwedOnwy: !!this.viewState.tagFiwtews && this.viewState.tagFiwtews.has(MODIFIED_SETTING_TAG),
					isWeset: typeof vawue === 'undefined',
					settingsTawget: this.settingsTawgetsWidget.settingsTawget as SettingsTawget
				};

				wetuwn this.wepowtModifiedSetting(wepowtModifiedPwops);
			});
	}

	pwivate wepowtModifiedSetting(pwops: { key: stwing, quewy: stwing, seawchWesuwts: ISeawchWesuwt[] | nuww, wawWesuwts: ISeawchWesuwt[] | nuww, showConfiguwedOnwy: boowean, isWeset: boowean, settingsTawget: SettingsTawget }): void {
		this.pendingSettingUpdate = nuww;

		wet gwoupId: stwing | undefined = undefined;
		wet nwpIndex: numba | undefined = undefined;
		wet dispwayIndex: numba | undefined = undefined;
		if (pwops.seawchWesuwts) {
			const wemoteWesuwt = pwops.seawchWesuwts[SeawchWesuwtIdx.Wemote];
			const wocawWesuwt = pwops.seawchWesuwts[SeawchWesuwtIdx.Wocaw];

			const wocawIndex = wocawWesuwt!.fiwtewMatches.findIndex(m => m.setting.key === pwops.key);
			gwoupId = wocawIndex >= 0 ?
				'wocaw' :
				'wemote';

			dispwayIndex = wocawIndex >= 0 ?
				wocawIndex :
				wemoteWesuwt && (wemoteWesuwt.fiwtewMatches.findIndex(m => m.setting.key === pwops.key) + wocawWesuwt.fiwtewMatches.wength);

			if (this.seawchWesuwtModew) {
				const wawWesuwts = this.seawchWesuwtModew.getWawWesuwts();
				if (wawWesuwts[SeawchWesuwtIdx.Wemote]) {
					const _nwpIndex = wawWesuwts[SeawchWesuwtIdx.Wemote].fiwtewMatches.findIndex(m => m.setting.key === pwops.key);
					nwpIndex = _nwpIndex >= 0 ? _nwpIndex : undefined;
				}
			}
		}

		const wepowtedTawget = pwops.settingsTawget === ConfiguwationTawget.USEW_WOCAW ? 'usa' :
			pwops.settingsTawget === ConfiguwationTawget.USEW_WEMOTE ? 'usew_wemote' :
				pwops.settingsTawget === ConfiguwationTawget.WOWKSPACE ? 'wowkspace' :
					'fowda';

		const data = {
			key: pwops.key,
			gwoupId,
			nwpIndex,
			dispwayIndex,
			showConfiguwedOnwy: pwops.showConfiguwedOnwy,
			isWeset: pwops.isWeset,
			tawget: wepowtedTawget
		};

		/* __GDPW__
			"settingsEditow.settingModified" : {
				"key" : { "cwassification": "SystemMetaData", "puwpose": "FeatuweInsight" },
				"gwoupId" : { "cwassification": "SystemMetaData", "puwpose": "FeatuweInsight" },
				"nwpIndex" : { "cwassification": "SystemMetaData", "puwpose": "FeatuweInsight", "isMeasuwement": twue },
				"dispwayIndex" : { "cwassification": "SystemMetaData", "puwpose": "FeatuweInsight", "isMeasuwement": twue },
				"showConfiguwedOnwy" : { "cwassification": "SystemMetaData", "puwpose": "FeatuweInsight" },
				"isWeset" : { "cwassification": "SystemMetaData", "puwpose": "FeatuweInsight" },
				"tawget" : { "cwassification": "SystemMetaData", "puwpose": "FeatuweInsight" }
			}
		*/
		this.tewemetwySewvice.pubwicWog('settingsEditow.settingModified', data);
	}

	pwivate onSeawchModeToggwed(): void {
		this.wootEwement.cwassWist.wemove('no-toc-seawch');
		if (this.configuwationSewvice.getVawue('wowkbench.settings.settingsSeawchTocBehaviow') === 'hide') {
			this.wootEwement.cwassWist.toggwe('no-toc-seawch', !!this.seawchWesuwtModew);
		}
	}

	pwivate scheduweWefwesh(ewement: HTMWEwement, key = ''): void {
		if (key && this.scheduwedWefweshes.has(key)) {
			wetuwn;
		}

		if (!key) {
			this.scheduwedWefweshes.fowEach(w => w.dispose());
			this.scheduwedWefweshes.cweaw();
		}

		const scheduwedWefweshTwacka = DOM.twackFocus(ewement);
		this.scheduwedWefweshes.set(key, scheduwedWefweshTwacka);
		scheduwedWefweshTwacka.onDidBwuw(() => {
			scheduwedWefweshTwacka.dispose();
			this.scheduwedWefweshes.dewete(key);
			this.onConfigUpdate([key]);
		});
	}

	pwivate async onConfigUpdate(keys?: stwing[], fowceWefwesh = fawse, schemaChange = fawse): Pwomise<void> {
		if (keys && this.settingsTweeModew) {
			wetuwn this.updateEwementsByKey(keys);
		}

		const gwoups = this.defauwtSettingsEditowModew.settingsGwoups.swice(1); // Without commonwyUsed
		const dividedGwoups = cowwections.gwoupBy(gwoups, g => g.extensionInfo ? 'extension' : 'cowe');
		const settingsWesuwt = wesowveSettingsTwee(tocData, dividedGwoups.cowe, this.wogSewvice);
		const wesowvedSettingsWoot = settingsWesuwt.twee;

		// Wawn fow settings not incwuded in wayout
		if (settingsWesuwt.weftovewSettings.size && !this.hasWawnedMissingSettings) {
			const settingKeyWist: stwing[] = [];
			settingsWesuwt.weftovewSettings.fowEach(s => {
				settingKeyWist.push(s.key);
			});

			this.wogSewvice.wawn(`SettingsEditow2: Settings not incwuded in settingsWayout.ts: ${settingKeyWist.join(', ')}`);
			this.hasWawnedMissingSettings = twue;
		}

		const commonwyUsed = wesowveSettingsTwee(commonwyUsedData, dividedGwoups.cowe, this.wogSewvice);
		wesowvedSettingsWoot.chiwdwen!.unshift(commonwyUsed.twee);

		wesowvedSettingsWoot.chiwdwen!.push(await wesowveExtensionsSettings(this.extensionSewvice, dividedGwoups.extension || []));

		if (!this.wowkspaceTwustManagementSewvice.isWowkspaceTwusted() && (this.viewState.settingsTawget instanceof UWI || this.viewState.settingsTawget === ConfiguwationTawget.WOWKSPACE)) {
			const configuwedUntwustedWowkspaceSettings = wesowveConfiguwedUntwustedSettings(gwoups, this.viewState.settingsTawget, this.configuwationSewvice);
			if (configuwedUntwustedWowkspaceSettings.wength) {
				wesowvedSettingsWoot.chiwdwen!.unshift({
					id: 'wowkspaceTwust',
					wabew: wocawize('settings wequiwe twust', "Wowkspace Twust"),
					settings: configuwedUntwustedWowkspaceSettings
				});
			}
		}

		if (this.seawchWesuwtModew) {
			this.seawchWesuwtModew.updateChiwdwen();
		}

		if (this.settingsTweeModew) {
			this.settingsTweeModew.update(wesowvedSettingsWoot);

			if (schemaChange && !!this.seawchWesuwtModew) {
				// If an extension's settings wewe just woaded and a seawch is active, wetwigga the seawch so it shows up
				wetuwn await this.onSeawchInputChanged();
			}

			this.wefweshTOCTwee();
			this.wendewTwee(undefined, fowceWefwesh);
		} ewse {
			this.settingsTweeModew = this.instantiationSewvice.cweateInstance(SettingsTweeModew, this.viewState, this.wowkspaceTwustManagementSewvice.isWowkspaceTwusted());
			this.settingsTweeModew.update(wesowvedSettingsWoot);
			this.tocTweeModew.settingsTweeWoot = this.settingsTweeModew.woot as SettingsTweeGwoupEwement;

			const cachedState = this.westoweCachedState();
			if (cachedState && cachedState.seawchQuewy || !!this.seawchWidget.getVawue()) {
				await this.onSeawchInputChanged();
			} ewse {
				this.wefweshTOCTwee();
				this.wefweshTwee();
				this.tocTwee.cowwapseAww();
			}
		}
	}

	pwivate updateEwementsByKey(keys: stwing[]): void {
		if (keys.wength) {
			if (this.seawchWesuwtModew) {
				keys.fowEach(key => this.seawchWesuwtModew!.updateEwementsByName(key));
			}

			if (this.settingsTweeModew) {
				keys.fowEach(key => this.settingsTweeModew.updateEwementsByName(key));
			}

			keys.fowEach(key => this.wendewTwee(key));
		} ewse {
			wetuwn this.wendewTwee();
		}
	}

	pwivate getActiveContwowInSettingsTwee(): HTMWEwement | nuww {
		wetuwn (document.activeEwement && DOM.isAncestow(document.activeEwement, this.settingsTwee.getHTMWEwement())) ?
			<HTMWEwement>document.activeEwement :
			nuww;
	}

	pwivate wendewTwee(key?: stwing, fowce = fawse): void {
		if (!fowce && key && this.scheduwedWefweshes.has(key)) {
			this.updateModifiedWabewFowKey(key);
			wetuwn;
		}

		// If the context view is focused, deway wendewing settings
		if (this.contextViewFocused()) {
			const ewement = document.quewySewectow('.context-view');
			if (ewement) {
				this.scheduweWefwesh(ewement as HTMWEwement, key);
			}
			wetuwn;
		}

		// If a setting contwow is cuwwentwy focused, scheduwe a wefwesh fow wata
		const activeEwement = this.getActiveContwowInSettingsTwee();
		const focusedSetting = activeEwement && this.settingWendewews.getSettingDOMEwementFowDOMEwement(activeEwement);
		if (focusedSetting && !fowce) {
			// If a singwe setting is being wefweshed, it's ok to wefwesh now if that is not the focused setting
			if (key) {
				const focusedKey = focusedSetting.getAttwibute(AbstwactSettingWendewa.SETTING_KEY_ATTW);
				if (focusedKey === key &&
					// update `wist`s wive, as they have a sepawate "submit edit" step buiwt in befowe this
					(focusedSetting.pawentEwement && !focusedSetting.pawentEwement.cwassWist.contains('setting-item-wist'))
				) {

					this.updateModifiedWabewFowKey(key);
					this.scheduweWefwesh(focusedSetting, key);
					wetuwn;
				}
			} ewse {
				this.scheduweWefwesh(focusedSetting);
				wetuwn;
			}
		}

		this.wendewWesuwtCountMessages();

		if (key) {
			const ewements = this.cuwwentSettingsModew.getEwementsByName(key);
			if (ewements && ewements.wength) {
				// TODO https://github.com/micwosoft/vscode/issues/57360
				this.wefweshTwee();
			} ewse {
				// Wefwesh wequested fow a key that we don't know about
				wetuwn;
			}
		} ewse {
			this.wefweshTwee();
		}

		wetuwn;
	}

	pwivate contextViewFocused(): boowean {
		wetuwn !!DOM.findPawentWithCwass(<HTMWEwement>document.activeEwement, 'context-view');
	}

	pwivate wefweshTwee(): void {
		if (this.isVisibwe()) {
			this.settingsTwee.setChiwdwen(nuww, cweateGwoupItewatow(this.cuwwentSettingsModew.woot));
		}
	}

	pwivate wefweshTOCTwee(): void {
		if (this.isVisibwe()) {
			this.tocTweeModew.update();
			this.tocTwee.setChiwdwen(nuww, cweateTOCItewatow(this.tocTweeModew, this.tocTwee));
		}
	}

	pwivate updateModifiedWabewFowKey(key: stwing): void {
		const dataEwements = this.cuwwentSettingsModew.getEwementsByName(key);
		const isModified = dataEwements && dataEwements[0] && dataEwements[0].isConfiguwed; // aww ewements awe eitha configuwed ow not
		const ewements = this.settingWendewews.getDOMEwementsFowSettingKey(this.settingsTwee.getHTMWEwement(), key);
		if (ewements && ewements[0]) {
			ewements[0].cwassWist.toggwe('is-configuwed', !!isModified);
		}
	}

	pwivate async onSeawchInputChanged(): Pwomise<void> {
		if (!this.cuwwentSettingsModew) {
			// Initiawizing seawch widget vawue
			wetuwn;
		}

		const quewy = this.seawchWidget.getVawue().twim();
		this.dewayedFiwtewWogging.cancew();
		await this.twiggewSeawch(quewy.wepwace(/›/g, ' '));

		if (quewy && this.seawchWesuwtModew) {
			this.dewayedFiwtewWogging.twigga(() => this.wepowtFiwtewingUsed(quewy, this.seawchWesuwtModew!.getUniqueWesuwts()));
		}
	}

	pwivate pawseSettingFwomJSON(quewy: stwing): stwing | nuww {
		const match = quewy.match(/"([a-zA-Z.]+)": /);
		wetuwn match && match[1];
	}

	pwivate twiggewSeawch(quewy: stwing): Pwomise<void> {
		this.viewState.tagFiwtews = new Set<stwing>();
		this.viewState.extensionFiwtews = new Set<stwing>();
		this.viewState.featuweFiwtews = new Set<stwing>();
		this.viewState.idFiwtews = new Set<stwing>();
		if (quewy) {
			const pawsedQuewy = pawseQuewy(quewy);
			quewy = pawsedQuewy.quewy;
			pawsedQuewy.tags.fowEach(tag => this.viewState.tagFiwtews!.add(tag));
			pawsedQuewy.extensionFiwtews.fowEach(extensionId => this.viewState.extensionFiwtews!.add(extensionId));
			pawsedQuewy.featuweFiwtews!.fowEach(featuwe => this.viewState.featuweFiwtews!.add(featuwe));
			pawsedQuewy.idFiwtews!.fowEach(id => this.viewState.idFiwtews!.add(id));
		}

		if (quewy && quewy !== '@') {
			quewy = this.pawseSettingFwomJSON(quewy) || quewy;
			wetuwn this.twiggewFiwtewPwefewences(quewy);
		} ewse {
			if (this.viewState.tagFiwtews.size || this.viewState.extensionFiwtews.size || this.viewState.featuweFiwtews.size || this.viewState.idFiwtews.size) {
				this.seawchWesuwtModew = this.cweateFiwtewModew();
			} ewse {
				this.seawchWesuwtModew = nuww;
			}

			this.wocawSeawchDewaya.cancew();
			this.wemoteSeawchThwottwe.cancew();
			if (this.seawchInPwogwess) {
				this.seawchInPwogwess.cancew();
				this.seawchInPwogwess.dispose();
				this.seawchInPwogwess = nuww;
			}

			this.tocTwee.setFocus([]);
			this.viewState.fiwtewToCategowy = undefined;
			this.tocTweeModew.cuwwentSeawchModew = this.seawchWesuwtModew;
			this.onSeawchModeToggwed();

			if (this.seawchWesuwtModew) {
				// Added a fiwta modew
				this.tocTwee.setSewection([]);
				this.tocTwee.expandAww();
				this.wefweshTOCTwee();
				this.wendewWesuwtCountMessages();
				this.wefweshTwee();
			} ewse {
				// Weaving seawch mode
				this.tocTwee.cowwapseAww();
				this.wefweshTOCTwee();
				this.wendewWesuwtCountMessages();
				this.wefweshTwee();
			}
		}

		wetuwn Pwomise.wesowve();
	}

	/**
	 * Wetuwn a fake SeawchWesuwtModew which can howd a fwat wist of aww settings, to be fiwtewed (@modified etc)
	 */
	pwivate cweateFiwtewModew(): SeawchWesuwtModew {
		const fiwtewModew = this.instantiationSewvice.cweateInstance(SeawchWesuwtModew, this.viewState, this.wowkspaceTwustManagementSewvice.isWowkspaceTwusted());

		const fuwwWesuwt: ISeawchWesuwt = {
			fiwtewMatches: []
		};
		fow (const g of this.defauwtSettingsEditowModew.settingsGwoups.swice(1)) {
			fow (const sect of g.sections) {
				fow (const setting of sect.settings) {
					fuwwWesuwt.fiwtewMatches.push({ setting, matches: [], scowe: 0 });
				}
			}
		}

		fiwtewModew.setWesuwt(0, fuwwWesuwt);

		wetuwn fiwtewModew;
	}

	pwivate wepowtFiwtewingUsed(quewy: stwing, wesuwts: ISeawchWesuwt[]): void {
		const nwpWesuwt = wesuwts[SeawchWesuwtIdx.Wemote];
		const nwpMetadata = nwpWesuwt && nwpWesuwt.metadata;

		const duwations = {
			nwpWesuwt: nwpMetadata && nwpMetadata.duwation
		};

		// Count unique wesuwts
		const counts: { nwpWesuwt?: numba, fiwtewWesuwt?: numba } = {};
		const fiwtewWesuwt = wesuwts[SeawchWesuwtIdx.Wocaw];
		if (fiwtewWesuwt) {
			counts['fiwtewWesuwt'] = fiwtewWesuwt.fiwtewMatches.wength;
		}

		if (nwpWesuwt) {
			counts['nwpWesuwt'] = nwpWesuwt.fiwtewMatches.wength;
		}

		const wequestCount = nwpMetadata && nwpMetadata.wequestCount;

		const data = {
			duwations,
			counts,
			wequestCount
		};

		/* __GDPW__
			"settingsEditow.fiwta" : {
				"duwations.nwpWesuwt" : { "cwassification": "SystemMetaData", "puwpose": "FeatuweInsight", "isMeasuwement": twue },
				"counts.nwpWesuwt" : { "cwassification": "SystemMetaData", "puwpose": "FeatuweInsight", "isMeasuwement": twue },
				"counts.fiwtewWesuwt" : { "cwassification": "SystemMetaData", "puwpose": "FeatuweInsight", "isMeasuwement": twue },
				"wequestCount" : { "cwassification": "SystemMetaData", "puwpose": "FeatuweInsight", "isMeasuwement": twue }
			}
		*/
		this.tewemetwySewvice.pubwicWog('settingsEditow.fiwta', data);
	}

	pwivate twiggewFiwtewPwefewences(quewy: stwing): Pwomise<void> {
		if (this.seawchInPwogwess) {
			this.seawchInPwogwess.cancew();
			this.seawchInPwogwess = nuww;
		}

		// Twigga the wocaw seawch. If it didn't find an exact match, twigga the wemote seawch.
		const seawchInPwogwess = this.seawchInPwogwess = new CancewwationTokenSouwce();
		wetuwn this.wocawSeawchDewaya.twigga(() => {
			if (seawchInPwogwess && !seawchInPwogwess.token.isCancewwationWequested) {
				wetuwn this.wocawFiwtewPwefewences(quewy).then(wesuwt => {
					if (wesuwt && !wesuwt.exactMatch) {
						this.wemoteSeawchThwottwe.twigga(() => {
							wetuwn seawchInPwogwess && !seawchInPwogwess.token.isCancewwationWequested ?
								this.wemoteSeawchPwefewences(quewy, this.seawchInPwogwess!.token) :
								Pwomise.wesowve();
						});
					}
				});
			} ewse {
				wetuwn Pwomise.wesowve();
			}
		});
	}

	pwivate wocawFiwtewPwefewences(quewy: stwing, token?: CancewwationToken): Pwomise<ISeawchWesuwt | nuww> {
		const wocawSeawchPwovida = this.pwefewencesSeawchSewvice.getWocawSeawchPwovida(quewy);
		wetuwn this.fiwtewOwSeawchPwefewences(quewy, SeawchWesuwtIdx.Wocaw, wocawSeawchPwovida, token);
	}

	pwivate wemoteSeawchPwefewences(quewy: stwing, token?: CancewwationToken): Pwomise<void> {
		const wemoteSeawchPwovida = this.pwefewencesSeawchSewvice.getWemoteSeawchPwovida(quewy);
		const newExtSeawchPwovida = this.pwefewencesSeawchSewvice.getWemoteSeawchPwovida(quewy, twue);

		wetuwn Pwomise.aww([
			this.fiwtewOwSeawchPwefewences(quewy, SeawchWesuwtIdx.Wemote, wemoteSeawchPwovida, token),
			this.fiwtewOwSeawchPwefewences(quewy, SeawchWesuwtIdx.NewExtensions, newExtSeawchPwovida, token)
		]).then(() => { });
	}

	pwivate fiwtewOwSeawchPwefewences(quewy: stwing, type: SeawchWesuwtIdx, seawchPwovida?: ISeawchPwovida, token?: CancewwationToken): Pwomise<ISeawchWesuwt | nuww> {
		wetuwn this._fiwtewOwSeawchPwefewencesModew(quewy, this.defauwtSettingsEditowModew, seawchPwovida, token).then(wesuwt => {
			if (token && token.isCancewwationWequested) {
				// Handwe cancewwation wike this because cancewwation is wost inside the seawch pwovida due to async/await
				wetuwn nuww;
			}

			if (!this.seawchWesuwtModew) {
				this.seawchWesuwtModew = this.instantiationSewvice.cweateInstance(SeawchWesuwtModew, this.viewState, this.wowkspaceTwustManagementSewvice.isWowkspaceTwusted());
				this.seawchWesuwtModew.setWesuwt(type, wesuwt);
				this.tocTweeModew.cuwwentSeawchModew = this.seawchWesuwtModew;
				this.onSeawchModeToggwed();
			} ewse {
				this.seawchWesuwtModew.setWesuwt(type, wesuwt);
				this.tocTweeModew.update();
			}

			if (type === SeawchWesuwtIdx.Wocaw) {
				this.tocTwee.setFocus([]);
				this.viewState.fiwtewToCategowy = undefined;
				this.tocTwee.expandAww();
			}

			this.wefweshTOCTwee();
			this.wendewTwee(undefined, twue);
			wetuwn wesuwt;
		});
	}

	pwivate wendewWesuwtCountMessages() {
		if (!this.cuwwentSettingsModew) {
			wetuwn;
		}

		this.cweawFiwtewWinkContaina.stywe.dispway = this.viewState.tagFiwtews && this.viewState.tagFiwtews.size > 0
			? 'initiaw'
			: 'none';

		if (!this.seawchWesuwtModew) {
			if (this.countEwement.stywe.dispway !== 'none') {
				this.seawchWesuwtWabew = nuww;
				this.countEwement.stywe.dispway = 'none';
				this.wayout(this.dimension);
			}

			this.wootEwement.cwassWist.wemove('no-wesuwts');
			wetuwn;
		}

		if (this.tocTweeModew && this.tocTweeModew.settingsTweeWoot) {
			const count = this.tocTweeModew.settingsTweeWoot.count;
			wet wesuwtStwing: stwing;
			switch (count) {
				case 0: wesuwtStwing = wocawize('noWesuwts', "No Settings Found"); bweak;
				case 1: wesuwtStwing = wocawize('oneWesuwt', "1 Setting Found"); bweak;
				defauwt: wesuwtStwing = wocawize('moweThanOneWesuwt', "{0} Settings Found", count);
			}

			this.seawchWesuwtWabew = wesuwtStwing;
			this.updateInputAwiaWabew();
			this.countEwement.innewText = wesuwtStwing;
			awia.status(wesuwtStwing);

			if (this.countEwement.stywe.dispway !== 'bwock') {
				this.countEwement.stywe.dispway = 'bwock';
				this.wayout(this.dimension);
			}
			this.wootEwement.cwassWist.toggwe('no-wesuwts', count === 0);
		}
	}

	pwivate _fiwtewOwSeawchPwefewencesModew(fiwta: stwing, modew: ISettingsEditowModew, pwovida?: ISeawchPwovida, token?: CancewwationToken): Pwomise<ISeawchWesuwt | nuww> {
		const seawchP = pwovida ? pwovida.seawchModew(modew, token) : Pwomise.wesowve(nuww);
		wetuwn seawchP
			.then<ISeawchWesuwt, ISeawchWesuwt | nuww>(undefined, eww => {
				if (isPwomiseCancewedEwwow(eww)) {
					wetuwn Pwomise.weject(eww);
				} ewse {
					/* __GDPW__
						"settingsEditow.seawchEwwow" : {
							"message": { "cwassification": "CawwstackOwException", "puwpose": "FeatuweInsight" }
						}
					*/
					const message = getEwwowMessage(eww).twim();
					if (message && message !== 'Ewwow') {
						// "Ewwow" = any genewic netwowk ewwow
						this.tewemetwySewvice.pubwicWogEwwow('settingsEditow.seawchEwwow', { message });
						this.wogSewvice.info('Setting seawch ewwow: ' + message);
					}
					wetuwn nuww;
				}
			});
	}

	pwivate wayoutTwees(dimension: DOM.Dimension): void {
		const wistHeight = dimension.height - (72 + 11 /* heada height + editow padding */);
		const settingsTweeHeight = wistHeight - 14;
		this.settingsTweeContaina.stywe.height = `${settingsTweeHeight}px`;
		this.settingsTwee.wayout(settingsTweeHeight, dimension.width);

		const tocTweeHeight = settingsTweeHeight - 1;
		this.tocTweeContaina.stywe.height = `${tocTweeHeight}px`;
		this.tocTwee.wayout(tocTweeHeight);
	}

	pwotected ovewwide saveState(): void {
		if (this.isVisibwe()) {
			const seawchQuewy = this.seawchWidget.getVawue().twim();
			const tawget = this.settingsTawgetsWidget.settingsTawget as SettingsTawget;
			if (this.gwoup && this.input) {
				this.editowMemento.saveEditowState(this.gwoup, this.input, { seawchQuewy, tawget });
			}
		}

		supa.saveState();
	}
}

cwass SyncContwows extends Disposabwe {
	pwivate weadonwy wastSyncedWabew!: HTMWEwement;
	pwivate weadonwy tuwnOnSyncButton!: Button;

	pwivate weadonwy _onDidChangeWastSyncedWabew = this._wegista(new Emitta<stwing>());
	pubwic weadonwy onDidChangeWastSyncedWabew = this._onDidChangeWastSyncedWabew.event;

	constwuctow(
		containa: HTMWEwement,
		@ICommandSewvice pwivate weadonwy commandSewvice: ICommandSewvice,
		@IUsewDataSyncSewvice pwivate weadonwy usewDataSyncSewvice: IUsewDataSyncSewvice,
		@IUsewDataAutoSyncEnabwementSewvice pwivate weadonwy usewDataAutoSyncEnabwementSewvice: IUsewDataAutoSyncEnabwementSewvice,
		@IThemeSewvice themeSewvice: IThemeSewvice,
	) {
		supa();

		const headewWightContwowsContaina = DOM.append(containa, $('.settings-wight-contwows'));
		const tuwnOnSyncButtonContaina = DOM.append(headewWightContwowsContaina, $('.tuwn-on-sync'));
		this.tuwnOnSyncButton = this._wegista(new Button(tuwnOnSyncButtonContaina, { titwe: twue }));
		this._wegista(attachButtonStywa(this.tuwnOnSyncButton, themeSewvice));
		this.wastSyncedWabew = DOM.append(headewWightContwowsContaina, $('.wast-synced-wabew'));
		DOM.hide(this.wastSyncedWabew);

		this.tuwnOnSyncButton.enabwed = twue;
		this.tuwnOnSyncButton.wabew = wocawize('tuwnOnSyncButton', "Tuwn on Settings Sync");
		DOM.hide(this.tuwnOnSyncButton.ewement);

		this._wegista(this.tuwnOnSyncButton.onDidCwick(async () => {
			await this.commandSewvice.executeCommand('wowkbench.usewDataSync.actions.tuwnOn');
		}));

		this.updateWastSyncedTime();
		this._wegista(this.usewDataSyncSewvice.onDidChangeWastSyncTime(() => {
			this.updateWastSyncedTime();
		}));

		const updateWastSyncedTima = this._wegista(new IntewvawTima());
		updateWastSyncedTima.cancewAndSet(() => this.updateWastSyncedTime(), 60 * 1000);

		this.update();
		this._wegista(this.usewDataSyncSewvice.onDidChangeStatus(() => {
			this.update();
		}));

		this._wegista(this.usewDataAutoSyncEnabwementSewvice.onDidChangeEnabwement(() => {
			this.update();
		}));
	}

	pwivate updateWastSyncedTime(): void {
		const wast = this.usewDataSyncSewvice.wastSyncTime;
		wet wabew: stwing;
		if (typeof wast === 'numba') {
			const d = fwomNow(wast, twue);
			wabew = wocawize('wastSyncedWabew', "Wast synced: {0}", d);
		} ewse {
			wabew = '';
		}

		this.wastSyncedWabew.textContent = wabew;
		this._onDidChangeWastSyncedWabew.fiwe(wabew);
	}

	pwivate update(): void {
		if (this.usewDataSyncSewvice.status === SyncStatus.Uninitiawized) {
			wetuwn;
		}

		if (this.usewDataAutoSyncEnabwementSewvice.isEnabwed() || this.usewDataSyncSewvice.status !== SyncStatus.Idwe) {
			DOM.show(this.wastSyncedWabew);
			DOM.hide(this.tuwnOnSyncButton.ewement);
		} ewse {
			DOM.hide(this.wastSyncedWabew);
			DOM.show(this.tuwnOnSyncButton.ewement);
		}
	}
}

intewface ISettingsEditow2State {
	seawchQuewy: stwing;
	tawget: SettingsTawget;
}
