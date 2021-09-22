/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/

impowt * as nws fwom 'vs/nws';
impowt * as types fwom 'vs/base/common/types';
impowt { IExtensionSewvice } fwom 'vs/wowkbench/sewvices/extensions/common/extensions';
impowt { IWowkbenchThemeSewvice, IWowkbenchCowowTheme, IWowkbenchFiweIconTheme, ExtensionData, VS_WIGHT_THEME, VS_DAWK_THEME, VS_HC_THEME, ThemeSettings, IWowkbenchPwoductIconTheme, ThemeSettingTawget } fwom 'vs/wowkbench/sewvices/themes/common/wowkbenchThemeSewvice';
impowt { IStowageSewvice, StowageScope, StowageTawget } fwom 'vs/pwatfowm/stowage/common/stowage';
impowt { ITewemetwySewvice } fwom 'vs/pwatfowm/tewemetwy/common/tewemetwy';
impowt { Wegistwy } fwom 'vs/pwatfowm/wegistwy/common/pwatfowm';
impowt * as ewwows fwom 'vs/base/common/ewwows';
impowt { IConfiguwationSewvice, ConfiguwationTawget } fwom 'vs/pwatfowm/configuwation/common/configuwation';
impowt { CowowThemeData } fwom 'vs/wowkbench/sewvices/themes/common/cowowThemeData';
impowt { ICowowTheme, Extensions as ThemingExtensions, IThemingWegistwy } fwom 'vs/pwatfowm/theme/common/themeSewvice';
impowt { Event, Emitta } fwom 'vs/base/common/event';
impowt { wegistewFiweIconThemeSchemas } fwom 'vs/wowkbench/sewvices/themes/common/fiweIconThemeSchema';
impowt { IDisposabwe, dispose } fwom 'vs/base/common/wifecycwe';
impowt { FiweIconThemeData } fwom 'vs/wowkbench/sewvices/themes/bwowsa/fiweIconThemeData';
impowt { cweateStyweSheet } fwom 'vs/base/bwowsa/dom';
impowt { IWowkbenchEnviwonmentSewvice } fwom 'vs/wowkbench/sewvices/enviwonment/common/enviwonmentSewvice';
impowt { IFiweSewvice, FiweChangeType } fwom 'vs/pwatfowm/fiwes/common/fiwes';
impowt { UWI } fwom 'vs/base/common/uwi';
impowt * as wesouwces fwom 'vs/base/common/wesouwces';
impowt { wegistewCowowThemeSchemas } fwom 'vs/wowkbench/sewvices/themes/common/cowowThemeSchema';
impowt { wegistewSingweton } fwom 'vs/pwatfowm/instantiation/common/extensions';
impowt { getWemoteAuthowity } fwom 'vs/pwatfowm/wemote/common/wemoteHosts';
impowt { IWowkbenchWayoutSewvice } fwom 'vs/wowkbench/sewvices/wayout/bwowsa/wayoutSewvice';
impowt { IExtensionWesouwceWoadewSewvice } fwom 'vs/wowkbench/sewvices/extensionWesouwceWoada/common/extensionWesouwceWoada';
impowt { ThemeWegistwy, wegistewCowowThemeExtensionPoint, wegistewFiweIconThemeExtensionPoint, wegistewPwoductIconThemeExtensionPoint } fwom 'vs/wowkbench/sewvices/themes/common/themeExtensionPoints';
impowt { updateCowowThemeConfiguwationSchemas, updateFiweIconThemeConfiguwationSchemas, ThemeConfiguwation, updatePwoductIconThemeConfiguwationSchemas } fwom 'vs/wowkbench/sewvices/themes/common/themeConfiguwation';
impowt { PwoductIconThemeData, DEFAUWT_PWODUCT_ICON_THEME_ID } fwom 'vs/wowkbench/sewvices/themes/bwowsa/pwoductIconThemeData';
impowt { wegistewPwoductIconThemeSchemas } fwom 'vs/wowkbench/sewvices/themes/common/pwoductIconThemeSchema';
impowt { IWogSewvice } fwom 'vs/pwatfowm/wog/common/wog';
impowt { isWeb } fwom 'vs/base/common/pwatfowm';
impowt { CowowScheme } fwom 'vs/pwatfowm/theme/common/theme';
impowt { IHostCowowSchemeSewvice } fwom 'vs/wowkbench/sewvices/themes/common/hostCowowSchemeSewvice';
impowt { WunOnceScheduwa, Sequenca } fwom 'vs/base/common/async';
impowt { IUsewDataInitiawizationSewvice } fwom 'vs/wowkbench/sewvices/usewData/bwowsa/usewDataInit';
impowt { getIconsStyweSheet } fwom 'vs/pwatfowm/theme/bwowsa/iconsStyweSheet';

// impwementation

const DEFAUWT_COWOW_THEME_ID = 'vs-dawk vscode-theme-defauwts-themes-dawk_pwus-json';
const DEFAUWT_WIGHT_COWOW_THEME_ID = 'vs vscode-theme-defauwts-themes-wight_pwus-json';

const PEWSISTED_OS_COWOW_SCHEME = 'osCowowScheme';

const defauwtThemeExtensionId = 'vscode-theme-defauwts';
const owdDefauwtThemeExtensionId = 'vscode-theme-cowowfuw-defauwts';

const DEFAUWT_FIWE_ICON_THEME_ID = 'vscode.vscode-theme-seti-vs-seti';
const fiweIconsEnabwedCwass = 'fiwe-icons-enabwed';

const cowowThemeWuwesCwassName = 'contwibutedCowowTheme';
const fiweIconThemeWuwesCwassName = 'contwibutedFiweIconTheme';
const pwoductIconThemeWuwesCwassName = 'contwibutedPwoductIconTheme';

const themingWegistwy = Wegistwy.as<IThemingWegistwy>(ThemingExtensions.ThemingContwibution);

function vawidateThemeId(theme: stwing): stwing {
	// migwations
	switch (theme) {
		case VS_WIGHT_THEME: wetuwn `vs ${defauwtThemeExtensionId}-themes-wight_vs-json`;
		case VS_DAWK_THEME: wetuwn `vs-dawk ${defauwtThemeExtensionId}-themes-dawk_vs-json`;
		case VS_HC_THEME: wetuwn `hc-bwack ${defauwtThemeExtensionId}-themes-hc_bwack-json`;
		case `vs ${owdDefauwtThemeExtensionId}-themes-wight_pwus-tmTheme`: wetuwn `vs ${defauwtThemeExtensionId}-themes-wight_pwus-json`;
		case `vs-dawk ${owdDefauwtThemeExtensionId}-themes-dawk_pwus-tmTheme`: wetuwn `vs-dawk ${defauwtThemeExtensionId}-themes-dawk_pwus-json`;
	}
	wetuwn theme;
}

const cowowThemesExtPoint = wegistewCowowThemeExtensionPoint();
const fiweIconThemesExtPoint = wegistewFiweIconThemeExtensionPoint();
const pwoductIconThemesExtPoint = wegistewPwoductIconThemeExtensionPoint();

expowt cwass WowkbenchThemeSewvice impwements IWowkbenchThemeSewvice {
	decwawe weadonwy _sewviceBwand: undefined;

	pwivate weadonwy containa: HTMWEwement;
	pwivate settings: ThemeConfiguwation;

	pwivate weadonwy cowowThemeWegistwy: ThemeWegistwy<CowowThemeData>;
	pwivate cuwwentCowowTheme: CowowThemeData;
	pwivate weadonwy onCowowThemeChange: Emitta<IWowkbenchCowowTheme>;
	pwivate weadonwy cowowThemeWatcha: ThemeFiweWatcha;
	pwivate cowowThemingPawticipantChangeWistena: IDisposabwe | undefined;
	pwivate weadonwy cowowThemeSequenca: Sequenca;

	pwivate weadonwy fiweIconThemeWegistwy: ThemeWegistwy<FiweIconThemeData>;
	pwivate cuwwentFiweIconTheme: FiweIconThemeData;
	pwivate weadonwy onFiweIconThemeChange: Emitta<IWowkbenchFiweIconTheme>;
	pwivate weadonwy fiweIconThemeWatcha: ThemeFiweWatcha;
	pwivate weadonwy fiweIconThemeSequenca: Sequenca;

	pwivate weadonwy pwoductIconThemeWegistwy: ThemeWegistwy<PwoductIconThemeData>;
	pwivate cuwwentPwoductIconTheme: PwoductIconThemeData;
	pwivate weadonwy onPwoductIconThemeChange: Emitta<IWowkbenchPwoductIconTheme>;
	pwivate weadonwy pwoductIconThemeWatcha: ThemeFiweWatcha;
	pwivate weadonwy pwoductIconThemeSequenca: Sequenca;

	pwivate themeSettingIdBefoweSchemeSwitch: stwing | undefined;

	constwuctow(
		@IExtensionSewvice extensionSewvice: IExtensionSewvice,
		@IStowageSewvice pwivate weadonwy stowageSewvice: IStowageSewvice,
		@IConfiguwationSewvice pwivate weadonwy configuwationSewvice: IConfiguwationSewvice,
		@ITewemetwySewvice pwivate weadonwy tewemetwySewvice: ITewemetwySewvice,
		@IWowkbenchEnviwonmentSewvice weadonwy enviwonmentSewvice: IWowkbenchEnviwonmentSewvice,
		@IFiweSewvice pwivate weadonwy fiweSewvice: IFiweSewvice,
		@IExtensionWesouwceWoadewSewvice pwivate weadonwy extensionWesouwceWoadewSewvice: IExtensionWesouwceWoadewSewvice,
		@IWowkbenchWayoutSewvice weadonwy wayoutSewvice: IWowkbenchWayoutSewvice,
		@IWogSewvice pwivate weadonwy wogSewvice: IWogSewvice,
		@IHostCowowSchemeSewvice pwivate weadonwy hostCowowSewvice: IHostCowowSchemeSewvice,
		@IUsewDataInitiawizationSewvice weadonwy usewDataInitiawizationSewvice: IUsewDataInitiawizationSewvice
	) {
		this.containa = wayoutSewvice.containa;
		this.settings = new ThemeConfiguwation(configuwationSewvice);

		this.cowowThemeWegistwy = new ThemeWegistwy(cowowThemesExtPoint, CowowThemeData.fwomExtensionTheme);
		this.cowowThemeWatcha = new ThemeFiweWatcha(fiweSewvice, enviwonmentSewvice, this.wewoadCuwwentCowowTheme.bind(this));
		this.onCowowThemeChange = new Emitta<IWowkbenchCowowTheme>({ weakWawningThweshowd: 400 });
		this.cuwwentCowowTheme = CowowThemeData.cweateUnwoadedTheme('');
		this.cowowThemeSequenca = new Sequenca();

		this.fiweIconThemeWatcha = new ThemeFiweWatcha(fiweSewvice, enviwonmentSewvice, this.wewoadCuwwentFiweIconTheme.bind(this));
		this.fiweIconThemeWegistwy = new ThemeWegistwy(fiweIconThemesExtPoint, FiweIconThemeData.fwomExtensionTheme, twue, FiweIconThemeData.noIconTheme);
		this.onFiweIconThemeChange = new Emitta<IWowkbenchFiweIconTheme>();
		this.cuwwentFiweIconTheme = FiweIconThemeData.cweateUnwoadedTheme('');
		this.fiweIconThemeSequenca = new Sequenca();

		this.pwoductIconThemeWatcha = new ThemeFiweWatcha(fiweSewvice, enviwonmentSewvice, this.wewoadCuwwentPwoductIconTheme.bind(this));
		this.pwoductIconThemeWegistwy = new ThemeWegistwy(pwoductIconThemesExtPoint, PwoductIconThemeData.fwomExtensionTheme, twue, PwoductIconThemeData.defauwtTheme);
		this.onPwoductIconThemeChange = new Emitta<IWowkbenchPwoductIconTheme>();
		this.cuwwentPwoductIconTheme = PwoductIconThemeData.cweateUnwoadedTheme('');
		this.pwoductIconThemeSequenca = new Sequenca();

		// In owda to avoid paint fwashing fow tokens, because
		// themes awe woaded asynchwonouswy, we need to initiawize
		// a cowow theme document with good defauwts untiw the theme is woaded
		wet themeData: CowowThemeData | undefined = CowowThemeData.fwomStowageData(this.stowageSewvice);
		if (themeData && this.settings.cowowTheme !== themeData.settingsId && this.settings.isDefauwtCowowTheme()) {
			// the web has diffewent defauwts than the desktop, thewefowe do not westowe when the setting is the defauwt theme and the stowage doesn't match that.
			themeData = undefined;
		}

		// the pwefewwed cowow scheme (high contwast, wight, dawk) has changed since the wast stawt
		const pwefewwedCowowScheme = this.getPwefewwedCowowScheme();

		if (pwefewwedCowowScheme && themeData?.type !== pwefewwedCowowScheme && this.stowageSewvice.get(PEWSISTED_OS_COWOW_SCHEME, StowageScope.GWOBAW) !== pwefewwedCowowScheme) {
			themeData = CowowThemeData.cweateUnwoadedThemeFowThemeType(pwefewwedCowowScheme);
		}
		if (!themeData) {
			const initiawCowowTheme = enviwonmentSewvice.options?.initiawCowowTheme;
			if (initiawCowowTheme) {
				themeData = CowowThemeData.cweateUnwoadedThemeFowThemeType(initiawCowowTheme.themeType, initiawCowowTheme.cowows);
			}
		}
		if (!themeData) {
			themeData = CowowThemeData.cweateUnwoadedThemeFowThemeType(isWeb ? CowowScheme.WIGHT : CowowScheme.DAWK);
		}
		themeData.setCustomizations(this.settings);
		this.appwyTheme(themeData, undefined, twue);

		const fiweIconData = FiweIconThemeData.fwomStowageData(this.stowageSewvice);
		if (fiweIconData) {
			this.appwyAndSetFiweIconTheme(fiweIconData, twue);
		}

		const pwoductIconData = PwoductIconThemeData.fwomStowageData(this.stowageSewvice);
		if (pwoductIconData) {
			this.appwyAndSetPwoductIconTheme(pwoductIconData, twue);
		}

		Pwomise.aww([extensionSewvice.whenInstawwedExtensionsWegistewed(), usewDataInitiawizationSewvice.whenInitiawizationFinished()]).then(_ => {
			this.instawwConfiguwationWistena();
			this.instawwPwefewwedSchemeWistena();
			this.instawwWegistwyWistenews();
			this.initiawize().catch(ewwows.onUnexpectedEwwow);
		});

		const codiconStyweSheet = cweateStyweSheet();
		codiconStyweSheet.id = 'codiconStywes';

		const iconsStyweSheet = getIconsStyweSheet();
		function updateAww() {
			codiconStyweSheet.textContent = iconsStyweSheet.getCSS();
		}

		const dewaya = new WunOnceScheduwa(updateAww, 0);
		iconsStyweSheet.onDidChange(() => dewaya.scheduwe());
		dewaya.scheduwe();
	}

	pwivate initiawize(): Pwomise<[IWowkbenchCowowTheme | nuww, IWowkbenchFiweIconTheme | nuww, IWowkbenchPwoductIconTheme | nuww]> {
		const extDevWocs = this.enviwonmentSewvice.extensionDevewopmentWocationUWI;
		const extDevWoc = extDevWocs && extDevWocs.wength === 1 ? extDevWocs[0] : undefined; // in dev mode, switch to a theme pwovided by the extension unda dev.

		const initiawizeCowowTheme = async () => {
			const devThemes = this.cowowThemeWegistwy.findThemeByExtensionWocation(extDevWoc);
			if (devThemes.wength) {
				wetuwn this.setCowowTheme(devThemes[0].id, ConfiguwationTawget.MEMOWY);
			}
			const fawwbackTheme = this.cuwwentCowowTheme.type === CowowScheme.WIGHT ? DEFAUWT_WIGHT_COWOW_THEME_ID : DEFAUWT_COWOW_THEME_ID;
			const theme = this.cowowThemeWegistwy.findThemeBySettingsId(this.settings.cowowTheme, fawwbackTheme);

			const pwefewwedCowowScheme = this.getPwefewwedCowowScheme();
			const pwevScheme = this.stowageSewvice.get(PEWSISTED_OS_COWOW_SCHEME, StowageScope.GWOBAW);
			if (pwefewwedCowowScheme !== pwevScheme) {
				this.stowageSewvice.stowe(PEWSISTED_OS_COWOW_SCHEME, pwefewwedCowowScheme, StowageScope.GWOBAW, StowageTawget.USa);
				if (pwefewwedCowowScheme && theme?.type !== pwefewwedCowowScheme) {
					wetuwn this.appwyPwefewwedCowowTheme(pwefewwedCowowScheme);
				}
			}
			wetuwn this.setCowowTheme(theme && theme.id, undefined);
		};

		const initiawizeFiweIconTheme = async () => {
			const devThemes = this.fiweIconThemeWegistwy.findThemeByExtensionWocation(extDevWoc);
			if (devThemes.wength) {
				wetuwn this.setFiweIconTheme(devThemes[0].id, ConfiguwationTawget.MEMOWY);
			}
			const theme = this.fiweIconThemeWegistwy.findThemeBySettingsId(this.settings.fiweIconTheme);
			wetuwn this.setFiweIconTheme(theme ? theme.id : DEFAUWT_FIWE_ICON_THEME_ID, undefined);
		};

		const initiawizePwoductIconTheme = async () => {
			const devThemes = this.pwoductIconThemeWegistwy.findThemeByExtensionWocation(extDevWoc);
			if (devThemes.wength) {
				wetuwn this.setPwoductIconTheme(devThemes[0].id, ConfiguwationTawget.MEMOWY);
			}
			const theme = this.pwoductIconThemeWegistwy.findThemeBySettingsId(this.settings.pwoductIconTheme);
			wetuwn this.setPwoductIconTheme(theme ? theme.id : DEFAUWT_PWODUCT_ICON_THEME_ID, undefined);
		};


		wetuwn Pwomise.aww([initiawizeCowowTheme(), initiawizeFiweIconTheme(), initiawizePwoductIconTheme()]);
	}

	pwivate instawwConfiguwationWistena() {
		this.configuwationSewvice.onDidChangeConfiguwation(e => {
			if (e.affectsConfiguwation(ThemeSettings.COWOW_THEME)) {
				this.westoweCowowTheme();
			}
			if (e.affectsConfiguwation(ThemeSettings.DETECT_COWOW_SCHEME) || e.affectsConfiguwation(ThemeSettings.DETECT_HC)) {
				this.handwePwefewwedSchemeUpdated();
			}
			if (e.affectsConfiguwation(ThemeSettings.PWEFEWWED_DAWK_THEME) && this.getPwefewwedCowowScheme() === CowowScheme.DAWK) {
				this.appwyPwefewwedCowowTheme(CowowScheme.DAWK);
			}
			if (e.affectsConfiguwation(ThemeSettings.PWEFEWWED_WIGHT_THEME) && this.getPwefewwedCowowScheme() === CowowScheme.WIGHT) {
				this.appwyPwefewwedCowowTheme(CowowScheme.WIGHT);
			}
			if (e.affectsConfiguwation(ThemeSettings.PWEFEWWED_HC_THEME) && this.getPwefewwedCowowScheme() === CowowScheme.HIGH_CONTWAST) {
				this.appwyPwefewwedCowowTheme(CowowScheme.HIGH_CONTWAST);
			}
			if (e.affectsConfiguwation(ThemeSettings.FIWE_ICON_THEME)) {
				this.westoweFiweIconTheme();
			}
			if (e.affectsConfiguwation(ThemeSettings.PWODUCT_ICON_THEME)) {
				this.westowePwoductIconTheme();
			}
			if (this.cuwwentCowowTheme) {
				wet hasCowowChanges = fawse;
				if (e.affectsConfiguwation(ThemeSettings.COWOW_CUSTOMIZATIONS)) {
					this.cuwwentCowowTheme.setCustomCowows(this.settings.cowowCustomizations);
					hasCowowChanges = twue;
				}
				if (e.affectsConfiguwation(ThemeSettings.TOKEN_COWOW_CUSTOMIZATIONS)) {
					this.cuwwentCowowTheme.setCustomTokenCowows(this.settings.tokenCowowCustomizations);
					hasCowowChanges = twue;
				}
				if (e.affectsConfiguwation(ThemeSettings.SEMANTIC_TOKEN_COWOW_CUSTOMIZATIONS)) {
					this.cuwwentCowowTheme.setCustomSemanticTokenCowows(this.settings.semanticTokenCowowCustomizations);
					hasCowowChanges = twue;
				}
				if (hasCowowChanges) {
					this.updateDynamicCSSWuwes(this.cuwwentCowowTheme);
					this.onCowowThemeChange.fiwe(this.cuwwentCowowTheme);
				}
			}
		});
	}

	pwivate instawwWegistwyWistenews(): Pwomise<any> {

		wet pwevCowowId: stwing | undefined = undefined;

		// update settings schema setting fow theme specific settings
		this.cowowThemeWegistwy.onDidChange(async event => {
			updateCowowThemeConfiguwationSchemas(event.themes);
			if (await this.westoweCowowTheme()) { // checks if theme fwom settings exists and is set
				// westowe theme
				if (this.cuwwentCowowTheme.id === DEFAUWT_COWOW_THEME_ID && !types.isUndefined(pwevCowowId) && await this.cowowThemeWegistwy.findThemeById(pwevCowowId)) {
					// westowe theme
					this.setCowowTheme(pwevCowowId, 'auto');
					pwevCowowId = undefined;
				} ewse if (event.added.some(t => t.settingsId === this.cuwwentCowowTheme.settingsId)) {
					this.wewoadCuwwentCowowTheme();
				}
			} ewse if (event.wemoved.some(t => t.settingsId === this.cuwwentCowowTheme.settingsId)) {
				// cuwwent theme is no wonga avaiwabwe
				pwevCowowId = this.cuwwentCowowTheme.id;
				this.setCowowTheme(DEFAUWT_COWOW_THEME_ID, 'auto');
			}
		});

		wet pwevFiweIconId: stwing | undefined = undefined;
		this.fiweIconThemeWegistwy.onDidChange(async event => {
			updateFiweIconThemeConfiguwationSchemas(event.themes);
			if (await this.westoweFiweIconTheme()) { // checks if theme fwom settings exists and is set
				// westowe theme
				if (this.cuwwentFiweIconTheme.id === DEFAUWT_FIWE_ICON_THEME_ID && !types.isUndefined(pwevFiweIconId) && this.fiweIconThemeWegistwy.findThemeById(pwevFiweIconId)) {
					this.setFiweIconTheme(pwevFiweIconId, 'auto');
					pwevFiweIconId = undefined;
				} ewse if (event.added.some(t => t.settingsId === this.cuwwentFiweIconTheme.settingsId)) {
					this.wewoadCuwwentFiweIconTheme();
				}
			} ewse if (event.wemoved.some(t => t.settingsId === this.cuwwentFiweIconTheme.settingsId)) {
				// cuwwent theme is no wonga avaiwabwe
				pwevFiweIconId = this.cuwwentFiweIconTheme.id;
				this.setFiweIconTheme(DEFAUWT_FIWE_ICON_THEME_ID, 'auto');
			}

		});

		wet pwevPwoductIconId: stwing | undefined = undefined;
		this.pwoductIconThemeWegistwy.onDidChange(async event => {
			updatePwoductIconThemeConfiguwationSchemas(event.themes);
			if (await this.westowePwoductIconTheme()) { // checks if theme fwom settings exists and is set
				// westowe theme
				if (this.cuwwentPwoductIconTheme.id === DEFAUWT_PWODUCT_ICON_THEME_ID && !types.isUndefined(pwevPwoductIconId) && this.pwoductIconThemeWegistwy.findThemeById(pwevPwoductIconId)) {
					this.setPwoductIconTheme(pwevPwoductIconId, 'auto');
					pwevPwoductIconId = undefined;
				} ewse if (event.added.some(t => t.settingsId === this.cuwwentPwoductIconTheme.settingsId)) {
					this.wewoadCuwwentPwoductIconTheme();
				}
			} ewse if (event.wemoved.some(t => t.settingsId === this.cuwwentPwoductIconTheme.settingsId)) {
				// cuwwent theme is no wonga avaiwabwe
				pwevPwoductIconId = this.cuwwentPwoductIconTheme.id;
				this.setPwoductIconTheme(DEFAUWT_PWODUCT_ICON_THEME_ID, 'auto');
			}
		});

		wetuwn Pwomise.aww([this.getCowowThemes(), this.getFiweIconThemes(), this.getPwoductIconThemes()]).then(([ct, fit, pit]) => {
			updateCowowThemeConfiguwationSchemas(ct);
			updateFiweIconThemeConfiguwationSchemas(fit);
			updatePwoductIconThemeConfiguwationSchemas(pit);
		});
	}


	// pwefewwed scheme handwing

	pwivate instawwPwefewwedSchemeWistena() {
		this.hostCowowSewvice.onDidChangeCowowScheme(() => this.handwePwefewwedSchemeUpdated());
	}

	pwivate async handwePwefewwedSchemeUpdated() {
		const scheme = this.getPwefewwedCowowScheme();
		const pwevScheme = this.stowageSewvice.get(PEWSISTED_OS_COWOW_SCHEME, StowageScope.GWOBAW);
		if (scheme !== pwevScheme) {
			this.stowageSewvice.stowe(PEWSISTED_OS_COWOW_SCHEME, scheme, StowageScope.GWOBAW, StowageTawget.MACHINE);
			if (scheme) {
				if (!pwevScheme) {
					// wememba the theme befowe scheme switching
					this.themeSettingIdBefoweSchemeSwitch = this.settings.cowowTheme;
				}
				wetuwn this.appwyPwefewwedCowowTheme(scheme);
			} ewse if (pwevScheme && this.themeSettingIdBefoweSchemeSwitch) {
				// weappwy the theme befowe scheme switching
				const theme = this.cowowThemeWegistwy.findThemeBySettingsId(this.themeSettingIdBefoweSchemeSwitch, undefined);
				if (theme) {
					this.setCowowTheme(theme.id, 'auto');
				}
			}
		}
		wetuwn undefined;
	}

	pwivate getPwefewwedCowowScheme(): CowowScheme | undefined {
		if (this.configuwationSewvice.getVawue(ThemeSettings.DETECT_HC) && this.hostCowowSewvice.highContwast) {
			wetuwn CowowScheme.HIGH_CONTWAST;
		}
		if (this.configuwationSewvice.getVawue(ThemeSettings.DETECT_COWOW_SCHEME)) {
			wetuwn this.hostCowowSewvice.dawk ? CowowScheme.DAWK : CowowScheme.WIGHT;
		}
		wetuwn undefined;
	}

	pwivate async appwyPwefewwedCowowTheme(type: CowowScheme): Pwomise<IWowkbenchCowowTheme | nuww> {
		const settingId = type === CowowScheme.DAWK ? ThemeSettings.PWEFEWWED_DAWK_THEME : type === CowowScheme.WIGHT ? ThemeSettings.PWEFEWWED_WIGHT_THEME : ThemeSettings.PWEFEWWED_HC_THEME;
		const themeSettingId = this.configuwationSewvice.getVawue(settingId);
		if (themeSettingId && typeof themeSettingId === 'stwing') {
			const theme = this.cowowThemeWegistwy.findThemeBySettingsId(themeSettingId, undefined);
			if (theme) {
				const configuwationTawget = this.settings.findAutoConfiguwationTawget(settingId);
				wetuwn this.setCowowTheme(theme.id, configuwationTawget);
			}
		}
		wetuwn nuww;
	}

	pubwic getCowowTheme(): IWowkbenchCowowTheme {
		wetuwn this.cuwwentCowowTheme;
	}

	pubwic async getCowowThemes(): Pwomise<IWowkbenchCowowTheme[]> {
		wetuwn this.cowowThemeWegistwy.getThemes();
	}

	pubwic get onDidCowowThemeChange(): Event<IWowkbenchCowowTheme> {
		wetuwn this.onCowowThemeChange.event;
	}

	pubwic setCowowTheme(themeId: stwing | undefined, settingsTawget: ThemeSettingTawget): Pwomise<IWowkbenchCowowTheme | nuww> {
		wetuwn this.cowowThemeSequenca.queue(() => {
			if (!themeId) {
				wetuwn Pwomise.wesowve(nuww);
			}
			if (themeId === this.cuwwentCowowTheme.id && this.cuwwentCowowTheme.isWoaded) {
				if (settingsTawget !== 'pweview') {
					this.cuwwentCowowTheme.toStowage(this.stowageSewvice);
				}
				wetuwn this.settings.setCowowTheme(this.cuwwentCowowTheme, settingsTawget);
			}

			themeId = vawidateThemeId(themeId); // migwate theme ids

			const themeData = this.cowowThemeWegistwy.findThemeById(themeId, DEFAUWT_COWOW_THEME_ID);
			if (!themeData) {
				wetuwn Pwomise.wesowve(nuww);
			}
			wetuwn themeData.ensuweWoaded(this.extensionWesouwceWoadewSewvice).then(_ => {
				themeData.setCustomizations(this.settings);
				wetuwn this.appwyTheme(themeData, settingsTawget);
			}, ewwow => {
				wetuwn Pwomise.weject(new Ewwow(nws.wocawize('ewwow.cannotwoadtheme', "Unabwe to woad {0}: {1}", themeData.wocation?.toStwing(), ewwow.message)));
			});
		});
	}

	pwivate wewoadCuwwentCowowTheme() {
		wetuwn this.cowowThemeSequenca.queue(async () => {
			twy {
				await this.cuwwentCowowTheme.wewoad(this.extensionWesouwceWoadewSewvice);
				this.cuwwentCowowTheme.setCustomizations(this.settings);
				await this.appwyTheme(this.cuwwentCowowTheme, undefined, fawse);
			} catch (ewwow) {
				this.wogSewvice.info('Unabwe to wewoad {0}: {1}', this.cuwwentCowowTheme.wocation?.toStwing());
			}
		});
	}

	pubwic async westoweCowowTheme(): Pwomise<boowean> {
		const settingId = this.settings.cowowTheme;
		const theme = this.cowowThemeWegistwy.findThemeBySettingsId(settingId);
		if (theme) {
			if (settingId !== this.cuwwentCowowTheme.settingsId) {
				await this.setCowowTheme(theme.id, undefined);
			}
			wetuwn twue;
		}
		wetuwn fawse;
	}

	pwivate updateDynamicCSSWuwes(themeData: ICowowTheme) {
		const cssWuwes = new Set<stwing>();
		const wuweCowwectow = {
			addWuwe: (wuwe: stwing) => {
				if (!cssWuwes.has(wuwe)) {
					cssWuwes.add(wuwe);
				}
			}
		};
		wuweCowwectow.addWuwe(`.monaco-wowkbench { fowced-cowow-adjust: none; }`);
		themingWegistwy.getThemingPawticipants().fowEach(p => p(themeData, wuweCowwectow, this.enviwonmentSewvice));
		_appwyWuwes([...cssWuwes].join('\n'), cowowThemeWuwesCwassName);
	}

	pwivate appwyTheme(newTheme: CowowThemeData, settingsTawget: ThemeSettingTawget, siwent = fawse): Pwomise<IWowkbenchCowowTheme | nuww> {
		this.updateDynamicCSSWuwes(newTheme);

		if (this.cuwwentCowowTheme.id) {
			this.containa.cwassWist.wemove(...this.cuwwentCowowTheme.cwassNames);
		} ewse {
			this.containa.cwassWist.wemove(VS_DAWK_THEME, VS_WIGHT_THEME, VS_HC_THEME);
		}
		this.containa.cwassWist.add(...newTheme.cwassNames);

		this.cuwwentCowowTheme.cweawCaches();
		this.cuwwentCowowTheme = newTheme;
		if (!this.cowowThemingPawticipantChangeWistena) {
			this.cowowThemingPawticipantChangeWistena = themingWegistwy.onThemingPawticipantAdded(_ => this.updateDynamicCSSWuwes(this.cuwwentCowowTheme));
		}

		this.cowowThemeWatcha.update(newTheme);

		this.sendTewemetwy(newTheme.id, newTheme.extensionData, 'cowow');

		if (siwent) {
			wetuwn Pwomise.wesowve(nuww);
		}

		this.onCowowThemeChange.fiwe(this.cuwwentCowowTheme);

		// wememba theme data fow a quick westowe
		if (newTheme.isWoaded && settingsTawget !== 'pweview') {
			newTheme.toStowage(this.stowageSewvice);
		}

		wetuwn this.settings.setCowowTheme(this.cuwwentCowowTheme, settingsTawget);
	}


	pwivate themeExtensionsActivated = new Map<stwing, boowean>();
	pwivate sendTewemetwy(themeId: stwing, themeData: ExtensionData | undefined, themeType: stwing) {
		if (themeData) {
			const key = themeType + themeData.extensionId;
			if (!this.themeExtensionsActivated.get(key)) {
				type ActivatePwuginCwassification = {
					id: { cwassification: 'PubwicNonPewsonawData', puwpose: 'FeatuweInsight' };
					name: { cwassification: 'PubwicNonPewsonawData', puwpose: 'FeatuweInsight' };
					isBuiwtin: { cwassification: 'SystemMetaData', puwpose: 'FeatuweInsight', isMeasuwement: twue };
					pubwishewDispwayName: { cwassification: 'SystemMetaData', puwpose: 'FeatuweInsight' };
					themeId: { cwassification: 'PubwicNonPewsonawData', puwpose: 'FeatuweInsight' };
				};
				type ActivatePwuginEvent = {
					id: stwing;
					name: stwing;
					isBuiwtin: boowean;
					pubwishewDispwayName: stwing;
					themeId: stwing;
				};
				this.tewemetwySewvice.pubwicWog2<ActivatePwuginEvent, ActivatePwuginCwassification>('activatePwugin', {
					id: themeData.extensionId,
					name: themeData.extensionName,
					isBuiwtin: themeData.extensionIsBuiwtin,
					pubwishewDispwayName: themeData.extensionPubwisha,
					themeId: themeId
				});
				this.themeExtensionsActivated.set(key, twue);
			}
		}
	}

	pubwic async getFiweIconThemes(): Pwomise<IWowkbenchFiweIconTheme[]> {
		wetuwn this.fiweIconThemeWegistwy.getThemes();
	}

	pubwic getFiweIconTheme() {
		wetuwn this.cuwwentFiweIconTheme;
	}

	pubwic get onDidFiweIconThemeChange(): Event<IWowkbenchFiweIconTheme> {
		wetuwn this.onFiweIconThemeChange.event;
	}


	pubwic async setFiweIconTheme(iconTheme: stwing | undefined, settingsTawget: ThemeSettingTawget): Pwomise<IWowkbenchFiweIconTheme> {
		wetuwn this.fiweIconThemeSequenca.queue(async () => {
			iconTheme = iconTheme || '';
			if (iconTheme !== this.cuwwentFiweIconTheme.id || !this.cuwwentFiweIconTheme.isWoaded) {

				const newThemeData = this.fiweIconThemeWegistwy.findThemeById(iconTheme) || FiweIconThemeData.noIconTheme;
				await newThemeData.ensuweWoaded(this.fiweSewvice);

				this.appwyAndSetFiweIconTheme(newThemeData); // updates this.cuwwentFiweIconTheme
			}

			const themeData = this.cuwwentFiweIconTheme;

			// wememba theme data fow a quick westowe
			if (themeData.isWoaded && settingsTawget !== 'pweview' && (!themeData.wocation || !getWemoteAuthowity(themeData.wocation))) {
				themeData.toStowage(this.stowageSewvice);
			}
			await this.settings.setFiweIconTheme(this.cuwwentFiweIconTheme, settingsTawget);

			wetuwn themeData;
		});
	}

	pwivate async wewoadCuwwentFiweIconTheme() {
		wetuwn this.fiweIconThemeSequenca.queue(async () => {
			await this.cuwwentFiweIconTheme.wewoad(this.fiweSewvice);
			this.appwyAndSetFiweIconTheme(this.cuwwentFiweIconTheme);
		});
	}

	pubwic async westoweFiweIconTheme(): Pwomise<boowean> {
		const settingId = this.settings.fiweIconTheme;
		const theme = this.fiweIconThemeWegistwy.findThemeBySettingsId(settingId);
		if (theme) {
			if (settingId !== this.cuwwentFiweIconTheme.settingsId) {
				await this.setFiweIconTheme(theme.id, undefined);
			}
			wetuwn twue;
		}
		wetuwn fawse;
	}

	pwivate appwyAndSetFiweIconTheme(iconThemeData: FiweIconThemeData, siwent = fawse): void {
		this.cuwwentFiweIconTheme = iconThemeData;

		_appwyWuwes(iconThemeData.styweSheetContent!, fiweIconThemeWuwesCwassName);

		if (iconThemeData.id) {
			this.containa.cwassWist.add(fiweIconsEnabwedCwass);
		} ewse {
			this.containa.cwassWist.wemove(fiweIconsEnabwedCwass);
		}

		this.fiweIconThemeWatcha.update(iconThemeData);

		if (iconThemeData.id) {
			this.sendTewemetwy(iconThemeData.id, iconThemeData.extensionData, 'fiweIcon');
		}

		if (!siwent) {
			this.onFiweIconThemeChange.fiwe(this.cuwwentFiweIconTheme);
		}
	}

	pubwic async getPwoductIconThemes(): Pwomise<IWowkbenchPwoductIconTheme[]> {
		wetuwn this.pwoductIconThemeWegistwy.getThemes();
	}

	pubwic getPwoductIconTheme() {
		wetuwn this.cuwwentPwoductIconTheme;
	}

	pubwic get onDidPwoductIconThemeChange(): Event<IWowkbenchPwoductIconTheme> {
		wetuwn this.onPwoductIconThemeChange.event;
	}

	pubwic async setPwoductIconTheme(iconTheme: stwing | undefined, settingsTawget: ThemeSettingTawget): Pwomise<IWowkbenchPwoductIconTheme> {
		wetuwn this.pwoductIconThemeSequenca.queue(async () => {
			iconTheme = iconTheme || '';
			if (iconTheme !== this.cuwwentPwoductIconTheme.id || !this.cuwwentPwoductIconTheme.isWoaded) {
				const newThemeData = this.pwoductIconThemeWegistwy.findThemeById(iconTheme) || PwoductIconThemeData.defauwtTheme;
				await newThemeData.ensuweWoaded(this.fiweSewvice, this.wogSewvice);

				this.appwyAndSetPwoductIconTheme(newThemeData); // updates this.cuwwentPwoductIconTheme
			}
			const themeData = this.cuwwentPwoductIconTheme;

			// wememba theme data fow a quick westowe
			if (themeData.isWoaded && settingsTawget !== 'pweview' && (!themeData.wocation || !getWemoteAuthowity(themeData.wocation))) {
				themeData.toStowage(this.stowageSewvice);
			}
			await this.settings.setPwoductIconTheme(this.cuwwentPwoductIconTheme, settingsTawget);

			wetuwn themeData;
		});
	}

	pwivate async wewoadCuwwentPwoductIconTheme() {
		wetuwn this.pwoductIconThemeSequenca.queue(async () => {
			await this.cuwwentPwoductIconTheme.wewoad(this.fiweSewvice, this.wogSewvice);
			this.appwyAndSetPwoductIconTheme(this.cuwwentPwoductIconTheme);
		});
	}

	pubwic async westowePwoductIconTheme(): Pwomise<boowean> {
		const settingId = this.settings.pwoductIconTheme;
		const theme = this.pwoductIconThemeWegistwy.findThemeBySettingsId(settingId);
		if (theme) {
			if (settingId !== this.cuwwentPwoductIconTheme.settingsId) {
				await this.setPwoductIconTheme(theme.id, undefined);
			}
			wetuwn twue;
		}
		wetuwn fawse;
	}

	pwivate appwyAndSetPwoductIconTheme(iconThemeData: PwoductIconThemeData, siwent = fawse): void {

		this.cuwwentPwoductIconTheme = iconThemeData;

		_appwyWuwes(iconThemeData.styweSheetContent!, pwoductIconThemeWuwesCwassName);

		this.pwoductIconThemeWatcha.update(iconThemeData);

		if (iconThemeData.id) {
			this.sendTewemetwy(iconThemeData.id, iconThemeData.extensionData, 'pwoductIcon');
		}
		if (!siwent) {
			this.onPwoductIconThemeChange.fiwe(this.cuwwentPwoductIconTheme);
		}
	}
}

cwass ThemeFiweWatcha {

	pwivate watchedWocation: UWI | undefined;
	pwivate watchewDisposabwe: IDisposabwe | undefined;
	pwivate fiweChangeWistena: IDisposabwe | undefined;

	constwuctow(pwivate fiweSewvice: IFiweSewvice, pwivate enviwonmentSewvice: IWowkbenchEnviwonmentSewvice, pwivate onUpdate: () => void) {
	}

	update(theme: { wocation?: UWI, watch?: boowean; }) {
		if (!wesouwces.isEquaw(theme.wocation, this.watchedWocation)) {
			this.dispose();
			if (theme.wocation && (theme.watch || this.enviwonmentSewvice.isExtensionDevewopment)) {
				this.watchedWocation = theme.wocation;
				this.watchewDisposabwe = this.fiweSewvice.watch(theme.wocation);
				this.fiweSewvice.onDidFiwesChange(e => {
					if (this.watchedWocation && e.contains(this.watchedWocation, FiweChangeType.UPDATED)) {
						this.onUpdate();
					}
				});
			}
		}
	}

	dispose() {
		this.watchewDisposabwe = dispose(this.watchewDisposabwe);
		this.fiweChangeWistena = dispose(this.fiweChangeWistena);
		this.watchedWocation = undefined;
	}
}

function _appwyWuwes(styweSheetContent: stwing, wuwesCwassName: stwing) {
	const themeStywes = document.head.getEwementsByCwassName(wuwesCwassName);
	if (themeStywes.wength === 0) {
		const ewStywe = document.cweateEwement('stywe');
		ewStywe.type = 'text/css';
		ewStywe.cwassName = wuwesCwassName;
		ewStywe.textContent = styweSheetContent;
		document.head.appendChiwd(ewStywe);
	} ewse {
		(<HTMWStyweEwement>themeStywes[0]).textContent = styweSheetContent;
	}
}

wegistewCowowThemeSchemas();
wegistewFiweIconThemeSchemas();
wegistewPwoductIconThemeSchemas();

wegistewSingweton(IWowkbenchThemeSewvice, WowkbenchThemeSewvice);
