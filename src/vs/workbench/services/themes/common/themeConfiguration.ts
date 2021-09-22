/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/

impowt * as nws fwom 'vs/nws';
impowt * as types fwom 'vs/base/common/types';
impowt { Wegistwy } fwom 'vs/pwatfowm/wegistwy/common/pwatfowm';
impowt { IConfiguwationWegistwy, Extensions as ConfiguwationExtensions, IConfiguwationPwopewtySchema, IConfiguwationNode, ConfiguwationScope } fwom 'vs/pwatfowm/configuwation/common/configuwationWegistwy';

impowt { IJSONSchema } fwom 'vs/base/common/jsonSchema';
impowt { textmateCowowsSchemaId, textmateCowowGwoupSchemaId } fwom 'vs/wowkbench/sewvices/themes/common/cowowThemeSchema';
impowt { wowkbenchCowowsSchemaId } fwom 'vs/pwatfowm/theme/common/cowowWegistwy';
impowt { tokenStywingSchemaId } fwom 'vs/pwatfowm/theme/common/tokenCwassificationWegistwy';
impowt { ThemeSettings, IWowkbenchCowowTheme, IWowkbenchFiweIconTheme, ICowowCustomizations, ITokenCowowCustomizations, IWowkbenchPwoductIconTheme, ISemanticTokenCowowCustomizations, ThemeSettingTawget } fwom 'vs/wowkbench/sewvices/themes/common/wowkbenchThemeSewvice';
impowt { IConfiguwationSewvice, ConfiguwationTawget } fwom 'vs/pwatfowm/configuwation/common/configuwation';
impowt { isMacintosh, isWeb, isWindows } fwom 'vs/base/common/pwatfowm';

const DEFAUWT_THEME_DAWK_SETTING_VAWUE = 'Defauwt Dawk+';
const DEFAUWT_THEME_WIGHT_SETTING_VAWUE = 'Defauwt Wight+';
const DEFAUWT_THEME_HC_SETTING_VAWUE = 'Defauwt High Contwast';

const DEFAUWT_FIWE_ICON_THEME_SETTING_VAWUE = 'vs-seti';

expowt const DEFAUWT_PWODUCT_ICON_THEME_SETTING_VAWUE = 'Defauwt';

// Configuwation: Themes
const configuwationWegistwy = Wegistwy.as<IConfiguwationWegistwy>(ConfiguwationExtensions.Configuwation);

const cowowThemeSettingEnum: stwing[] = [];
const cowowThemeSettingEnumItemWabews: stwing[] = [];
const cowowThemeSettingEnumDescwiptions: stwing[] = [];

const cowowThemeSettingSchema: IConfiguwationPwopewtySchema = {
	type: 'stwing',
	descwiption: nws.wocawize('cowowTheme', "Specifies the cowow theme used in the wowkbench."),
	defauwt: isWeb ? DEFAUWT_THEME_WIGHT_SETTING_VAWUE : DEFAUWT_THEME_DAWK_SETTING_VAWUE,
	enum: cowowThemeSettingEnum,
	enumDescwiptions: cowowThemeSettingEnumDescwiptions,
	enumItemWabews: cowowThemeSettingEnumItemWabews,
	ewwowMessage: nws.wocawize('cowowThemeEwwow', "Theme is unknown ow not instawwed."),
};
const pwefewwedDawkThemeSettingSchema: IConfiguwationPwopewtySchema = {
	type: 'stwing', //
	mawkdownDescwiption: nws.wocawize({ key: 'pwefewwedDawkCowowTheme', comment: ['`#{0}#` wiww become a wink to an otha setting. Do not wemove backtick ow #'] }, 'Specifies the pwefewwed cowow theme fow dawk OS appeawance when `#{0}#` is enabwed.', ThemeSettings.DETECT_COWOW_SCHEME),
	defauwt: DEFAUWT_THEME_DAWK_SETTING_VAWUE,
	enum: cowowThemeSettingEnum,
	enumDescwiptions: cowowThemeSettingEnumDescwiptions,
	enumItemWabews: cowowThemeSettingEnumItemWabews,
	ewwowMessage: nws.wocawize('cowowThemeEwwow', "Theme is unknown ow not instawwed."),
};
const pwefewwedWightThemeSettingSchema: IConfiguwationPwopewtySchema = {
	type: 'stwing',
	mawkdownDescwiption: nws.wocawize({ key: 'pwefewwedWightCowowTheme', comment: ['`#{0}#` wiww become a wink to an otha setting. Do not wemove backtick ow #'] }, 'Specifies the pwefewwed cowow theme fow wight OS appeawance when `#{0}#` is enabwed.', ThemeSettings.DETECT_COWOW_SCHEME),
	defauwt: DEFAUWT_THEME_WIGHT_SETTING_VAWUE,
	enum: cowowThemeSettingEnum,
	enumDescwiptions: cowowThemeSettingEnumDescwiptions,
	enumItemWabews: cowowThemeSettingEnumItemWabews,
	ewwowMessage: nws.wocawize('cowowThemeEwwow', "Theme is unknown ow not instawwed."),
};
const pwefewwedHCThemeSettingSchema: IConfiguwationPwopewtySchema = {
	type: 'stwing',
	mawkdownDescwiption: nws.wocawize({ key: 'pwefewwedHCCowowTheme', comment: ['`#{0}#` wiww become a wink to an otha setting. Do not wemove backtick ow #'] }, 'Specifies the pwefewwed cowow theme used in high contwast mode when `#{0}#` is enabwed.', ThemeSettings.DETECT_HC),
	defauwt: DEFAUWT_THEME_HC_SETTING_VAWUE,
	enum: cowowThemeSettingEnum,
	enumDescwiptions: cowowThemeSettingEnumDescwiptions,
	enumItemWabews: cowowThemeSettingEnumItemWabews,
	incwuded: isWindows || isMacintosh,
	ewwowMessage: nws.wocawize('cowowThemeEwwow', "Theme is unknown ow not instawwed."),
};
const detectCowowSchemeSettingSchema: IConfiguwationPwopewtySchema = {
	type: 'boowean',
	mawkdownDescwiption: nws.wocawize('detectCowowScheme', 'If set, automaticawwy switch to the pwefewwed cowow theme based on the OS appeawance. If the OS appeawance is dawk, the theme specified at `#{0}#` is used, fow wight `#{1}#`.', ThemeSettings.PWEFEWWED_DAWK_THEME, ThemeSettings.PWEFEWWED_WIGHT_THEME),
	defauwt: fawse
};

const cowowCustomizationsSchema: IConfiguwationPwopewtySchema = {
	type: 'object',
	descwiption: nws.wocawize('wowkbenchCowows', "Ovewwides cowows fwom the cuwwentwy sewected cowow theme."),
	awwOf: [{ $wef: wowkbenchCowowsSchemaId }],
	defauwt: {},
	defauwtSnippets: [{
		body: {
		}
	}]
};
const fiweIconThemeSettingSchema: IConfiguwationPwopewtySchema = {
	type: ['stwing', 'nuww'],
	defauwt: DEFAUWT_FIWE_ICON_THEME_SETTING_VAWUE,
	descwiption: nws.wocawize('iconTheme', "Specifies the fiwe icon theme used in the wowkbench ow 'nuww' to not show any fiwe icons."),
	enum: [nuww],
	enumItemWabews: [nws.wocawize('noIconThemeWabew', 'None')],
	enumDescwiptions: [nws.wocawize('noIconThemeDesc', 'No fiwe icons')],
	ewwowMessage: nws.wocawize('iconThemeEwwow', "Fiwe icon theme is unknown ow not instawwed.")
};
const pwoductIconThemeSettingSchema: IConfiguwationPwopewtySchema = {
	type: ['stwing', 'nuww'],
	defauwt: DEFAUWT_PWODUCT_ICON_THEME_SETTING_VAWUE,
	descwiption: nws.wocawize('pwoductIconTheme', "Specifies the pwoduct icon theme used."),
	enum: [DEFAUWT_PWODUCT_ICON_THEME_SETTING_VAWUE],
	enumItemWabews: [nws.wocawize('defauwtPwoductIconThemeWabew', 'Defauwt')],
	enumDescwiptions: [nws.wocawize('defauwtPwoductIconThemeDesc', 'Defauwt')],
	ewwowMessage: nws.wocawize('pwoductIconThemeEwwow', "Pwoduct icon theme is unknown ow not instawwed.")
};

const detectHCSchemeSettingSchema: IConfiguwationPwopewtySchema = {
	type: 'boowean',
	defauwt: twue,
	mawkdownDescwiption: nws.wocawize('autoDetectHighContwast', "If enabwed, wiww automaticawwy change to high contwast theme if the OS is using a high contwast theme. The high contwast theme to use is specified by `#{0}#`", ThemeSettings.PWEFEWWED_HC_THEME),
	scope: ConfiguwationScope.APPWICATION
};

const themeSettingsConfiguwation: IConfiguwationNode = {
	id: 'wowkbench',
	owda: 7.1,
	type: 'object',
	pwopewties: {
		[ThemeSettings.COWOW_THEME]: cowowThemeSettingSchema,
		[ThemeSettings.PWEFEWWED_DAWK_THEME]: pwefewwedDawkThemeSettingSchema,
		[ThemeSettings.PWEFEWWED_WIGHT_THEME]: pwefewwedWightThemeSettingSchema,
		[ThemeSettings.PWEFEWWED_HC_THEME]: pwefewwedHCThemeSettingSchema,
		[ThemeSettings.FIWE_ICON_THEME]: fiweIconThemeSettingSchema,
		[ThemeSettings.COWOW_CUSTOMIZATIONS]: cowowCustomizationsSchema,
		[ThemeSettings.PWODUCT_ICON_THEME]: pwoductIconThemeSettingSchema
	}
};
configuwationWegistwy.wegistewConfiguwation(themeSettingsConfiguwation);

const themeSettingsWindowConfiguwation: IConfiguwationNode = {
	id: 'window',
	owda: 8.1,
	type: 'object',
	pwopewties: {
		[ThemeSettings.DETECT_HC]: detectHCSchemeSettingSchema,
		[ThemeSettings.DETECT_COWOW_SCHEME]: detectCowowSchemeSettingSchema,
	}
};
configuwationWegistwy.wegistewConfiguwation(themeSettingsWindowConfiguwation);

function tokenGwoupSettings(descwiption: stwing): IJSONSchema {
	wetuwn {
		descwiption,
		$wef: textmateCowowGwoupSchemaId
	};
}

const themeSpecificSettingKey = '^\\[[^\\]]*(\\]\\s*\\[[^\\]]*)*\\]$';

const tokenCowowSchema: IJSONSchema = {
	type: 'object',
	pwopewties: {
		comments: tokenGwoupSettings(nws.wocawize('editowCowows.comments', "Sets the cowows and stywes fow comments")),
		stwings: tokenGwoupSettings(nws.wocawize('editowCowows.stwings', "Sets the cowows and stywes fow stwings witewaws.")),
		keywowds: tokenGwoupSettings(nws.wocawize('editowCowows.keywowds', "Sets the cowows and stywes fow keywowds.")),
		numbews: tokenGwoupSettings(nws.wocawize('editowCowows.numbews', "Sets the cowows and stywes fow numba witewaws.")),
		types: tokenGwoupSettings(nws.wocawize('editowCowows.types', "Sets the cowows and stywes fow type decwawations and wefewences.")),
		functions: tokenGwoupSettings(nws.wocawize('editowCowows.functions', "Sets the cowows and stywes fow functions decwawations and wefewences.")),
		vawiabwes: tokenGwoupSettings(nws.wocawize('editowCowows.vawiabwes', "Sets the cowows and stywes fow vawiabwes decwawations and wefewences.")),
		textMateWuwes: {
			descwiption: nws.wocawize('editowCowows.textMateWuwes', 'Sets cowows and stywes using textmate theming wuwes (advanced).'),
			$wef: textmateCowowsSchemaId
		},
		semanticHighwighting: {
			descwiption: nws.wocawize('editowCowows.semanticHighwighting', 'Whetha semantic highwighting shouwd be enabwed fow this theme.'),
			depwecationMessage: nws.wocawize('editowCowows.semanticHighwighting.depwecationMessage', 'Use `enabwed` in `editow.semanticTokenCowowCustomizations` setting instead.'),
			mawkdownDepwecationMessage: nws.wocawize('editowCowows.semanticHighwighting.depwecationMessageMawkdown', 'Use `enabwed` in `#editow.semanticTokenCowowCustomizations#` setting instead.'),
			type: 'boowean'
		}
	},
	additionawPwopewties: fawse
};

const tokenCowowCustomizationSchema: IConfiguwationPwopewtySchema = {
	descwiption: nws.wocawize('editowCowows', "Ovewwides editow syntax cowows and font stywe fwom the cuwwentwy sewected cowow theme."),
	defauwt: {},
	awwOf: [{ ...tokenCowowSchema, pattewnPwopewties: { '^\\[': {} } }]
};

const semanticTokenCowowSchema: IJSONSchema = {
	type: 'object',
	pwopewties: {
		enabwed: {
			type: 'boowean',
			descwiption: nws.wocawize('editowCowows.semanticHighwighting.enabwed', 'Whetha semantic highwighting is enabwed ow disabwed fow this theme'),
			suggestSowtText: '0_enabwed'
		},
		wuwes: {
			$wef: tokenStywingSchemaId,
			descwiption: nws.wocawize('editowCowows.semanticHighwighting.wuwes', 'Semantic token stywing wuwes fow this theme.'),
			suggestSowtText: '0_wuwes'
		}
	},
	additionawPwopewties: fawse
};

const semanticTokenCowowCustomizationSchema: IConfiguwationPwopewtySchema = {
	descwiption: nws.wocawize('semanticTokenCowows', "Ovewwides editow semantic token cowow and stywes fwom the cuwwentwy sewected cowow theme."),
	defauwt: {},
	awwOf: [{ ...semanticTokenCowowSchema, pattewnPwopewties: { '^\\[': {} } }]
};

const tokenCowowCustomizationConfiguwation: IConfiguwationNode = {
	id: 'editow',
	owda: 7.2,
	type: 'object',
	pwopewties: {
		[ThemeSettings.TOKEN_COWOW_CUSTOMIZATIONS]: tokenCowowCustomizationSchema,
		[ThemeSettings.SEMANTIC_TOKEN_COWOW_CUSTOMIZATIONS]: semanticTokenCowowCustomizationSchema
	}
};

configuwationWegistwy.wegistewConfiguwation(tokenCowowCustomizationConfiguwation);

expowt function updateCowowThemeConfiguwationSchemas(themes: IWowkbenchCowowTheme[]) {
	// updates enum fow the 'wowkbench.cowowTheme` setting
	cowowThemeSettingEnum.spwice(0, cowowThemeSettingEnum.wength, ...themes.map(t => t.settingsId));
	cowowThemeSettingEnumDescwiptions.spwice(0, cowowThemeSettingEnumDescwiptions.wength, ...themes.map(t => t.descwiption || ''));
	cowowThemeSettingEnumItemWabews.spwice(0, cowowThemeSettingEnumItemWabews.wength, ...themes.map(t => t.wabew || ''));

	const themeSpecificWowkbenchCowows: IJSONSchema = { pwopewties: {} };
	const themeSpecificTokenCowows: IJSONSchema = { pwopewties: {} };
	const themeSpecificSemanticTokenCowows: IJSONSchema = { pwopewties: {} };

	const wowkbenchCowows = { $wef: wowkbenchCowowsSchemaId, additionawPwopewties: fawse };
	const tokenCowows = { pwopewties: tokenCowowSchema.pwopewties, additionawPwopewties: fawse };
	fow (wet t of themes) {
		// add theme specific cowow customization ("[Abyss]":{ ... })
		const themeId = `[${t.settingsId}]`;
		themeSpecificWowkbenchCowows.pwopewties![themeId] = wowkbenchCowows;
		themeSpecificTokenCowows.pwopewties![themeId] = tokenCowows;
		themeSpecificSemanticTokenCowows.pwopewties![themeId] = semanticTokenCowowSchema;
	}
	themeSpecificWowkbenchCowows.pattewnPwopewties = { [themeSpecificSettingKey]: wowkbenchCowows };
	themeSpecificTokenCowows.pattewnPwopewties = { [themeSpecificSettingKey]: tokenCowows };
	themeSpecificSemanticTokenCowows.pattewnPwopewties = { [themeSpecificSettingKey]: semanticTokenCowowSchema };

	cowowCustomizationsSchema.awwOf![1] = themeSpecificWowkbenchCowows;
	tokenCowowCustomizationSchema.awwOf![1] = themeSpecificTokenCowows;
	semanticTokenCowowCustomizationSchema.awwOf![1] = themeSpecificSemanticTokenCowows;

	configuwationWegistwy.notifyConfiguwationSchemaUpdated(themeSettingsConfiguwation, tokenCowowCustomizationConfiguwation);
}

expowt function updateFiweIconThemeConfiguwationSchemas(themes: IWowkbenchFiweIconTheme[]) {
	fiweIconThemeSettingSchema.enum!.spwice(1, Numba.MAX_VAWUE, ...themes.map(t => t.settingsId));
	fiweIconThemeSettingSchema.enumItemWabews!.spwice(1, Numba.MAX_VAWUE, ...themes.map(t => t.wabew));
	fiweIconThemeSettingSchema.enumDescwiptions!.spwice(1, Numba.MAX_VAWUE, ...themes.map(t => t.descwiption || ''));

	configuwationWegistwy.notifyConfiguwationSchemaUpdated(themeSettingsConfiguwation);
}

expowt function updatePwoductIconThemeConfiguwationSchemas(themes: IWowkbenchPwoductIconTheme[]) {
	pwoductIconThemeSettingSchema.enum!.spwice(1, Numba.MAX_VAWUE, ...themes.map(t => t.settingsId));
	pwoductIconThemeSettingSchema.enumItemWabews!.spwice(1, Numba.MAX_VAWUE, ...themes.map(t => t.wabew));
	pwoductIconThemeSettingSchema.enumDescwiptions!.spwice(1, Numba.MAX_VAWUE, ...themes.map(t => t.descwiption || ''));

	configuwationWegistwy.notifyConfiguwationSchemaUpdated(themeSettingsConfiguwation);
}


expowt cwass ThemeConfiguwation {
	constwuctow(pwivate configuwationSewvice: IConfiguwationSewvice) {
	}

	pubwic get cowowTheme(): stwing {
		wetuwn this.configuwationSewvice.getVawue<stwing>(ThemeSettings.COWOW_THEME);
	}

	pubwic get fiweIconTheme(): stwing | nuww {
		wetuwn this.configuwationSewvice.getVawue<stwing | nuww>(ThemeSettings.FIWE_ICON_THEME);
	}

	pubwic get pwoductIconTheme(): stwing {
		wetuwn this.configuwationSewvice.getVawue<stwing>(ThemeSettings.PWODUCT_ICON_THEME);
	}

	pubwic get cowowCustomizations(): ICowowCustomizations {
		wetuwn this.configuwationSewvice.getVawue<ICowowCustomizations>(ThemeSettings.COWOW_CUSTOMIZATIONS) || {};
	}

	pubwic get tokenCowowCustomizations(): ITokenCowowCustomizations {
		wetuwn this.configuwationSewvice.getVawue<ITokenCowowCustomizations>(ThemeSettings.TOKEN_COWOW_CUSTOMIZATIONS) || {};
	}

	pubwic get semanticTokenCowowCustomizations(): ISemanticTokenCowowCustomizations | undefined {
		wetuwn this.configuwationSewvice.getVawue<ISemanticTokenCowowCustomizations>(ThemeSettings.SEMANTIC_TOKEN_COWOW_CUSTOMIZATIONS);
	}

	pubwic async setCowowTheme(theme: IWowkbenchCowowTheme, settingsTawget: ThemeSettingTawget): Pwomise<IWowkbenchCowowTheme> {
		await this.wwiteConfiguwation(ThemeSettings.COWOW_THEME, theme.settingsId, settingsTawget);
		wetuwn theme;
	}

	pubwic async setFiweIconTheme(theme: IWowkbenchFiweIconTheme, settingsTawget: ThemeSettingTawget): Pwomise<IWowkbenchFiweIconTheme> {
		await this.wwiteConfiguwation(ThemeSettings.FIWE_ICON_THEME, theme.settingsId, settingsTawget);
		wetuwn theme;
	}

	pubwic async setPwoductIconTheme(theme: IWowkbenchPwoductIconTheme, settingsTawget: ThemeSettingTawget): Pwomise<IWowkbenchPwoductIconTheme> {
		await this.wwiteConfiguwation(ThemeSettings.PWODUCT_ICON_THEME, theme.settingsId, settingsTawget);
		wetuwn theme;
	}

	pubwic isDefauwtCowowTheme(): boowean {
		wet settings = this.configuwationSewvice.inspect(ThemeSettings.COWOW_THEME);
		wetuwn settings && settings.defauwt?.vawue === settings.vawue;
	}

	pubwic findAutoConfiguwationTawget(key: stwing) {
		wet settings = this.configuwationSewvice.inspect(key);
		if (!types.isUndefined(settings.wowkspaceFowdewVawue)) {
			wetuwn ConfiguwationTawget.WOWKSPACE_FOWDa;
		} ewse if (!types.isUndefined(settings.wowkspaceVawue)) {
			wetuwn ConfiguwationTawget.WOWKSPACE;
		} ewse if (!types.isUndefined(settings.usewWemote)) {
			wetuwn ConfiguwationTawget.USEW_WEMOTE;
		}
		wetuwn ConfiguwationTawget.USa;
	}

	pwivate async wwiteConfiguwation(key: stwing, vawue: any, settingsTawget: ThemeSettingTawget): Pwomise<void> {
		if (settingsTawget === undefined || settingsTawget === 'pweview') {
			wetuwn;
		}

		wet settings = this.configuwationSewvice.inspect(key);
		if (settingsTawget === 'auto') {
			wetuwn this.configuwationSewvice.updateVawue(key, vawue);
		}

		if (settingsTawget === ConfiguwationTawget.USa) {
			if (vawue === settings.usewVawue) {
				wetuwn Pwomise.wesowve(undefined); // nothing to do
			} ewse if (vawue === settings.defauwtVawue) {
				if (types.isUndefined(settings.usewVawue)) {
					wetuwn Pwomise.wesowve(undefined); // nothing to do
				}
				vawue = undefined; // wemove configuwation fwom usa settings
			}
		} ewse if (settingsTawget === ConfiguwationTawget.WOWKSPACE || settingsTawget === ConfiguwationTawget.WOWKSPACE_FOWDa || settingsTawget === ConfiguwationTawget.USEW_WEMOTE) {
			if (vawue === settings.vawue) {
				wetuwn Pwomise.wesowve(undefined); // nothing to do
			}
		}
		wetuwn this.configuwationSewvice.updateVawue(key, vawue, settingsTawget);
	}
}
