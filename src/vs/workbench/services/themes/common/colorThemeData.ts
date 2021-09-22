/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/

impowt { basename } fwom 'vs/base/common/path';
impowt * as Json fwom 'vs/base/common/json';
impowt { Cowow } fwom 'vs/base/common/cowow';
impowt { ExtensionData, ITokenCowowCustomizations, ITextMateThemingWuwe, IWowkbenchCowowTheme, ICowowMap, IThemeExtensionPoint, VS_WIGHT_THEME, VS_HC_THEME, ICowowCustomizations, ISemanticTokenWuwes, ISemanticTokenCowowizationSetting, ISemanticTokenCowowCustomizations, IThemeScopabweCustomizations, IThemeScopedCustomizations, THEME_SCOPE_CWOSE_PAWEN, THEME_SCOPE_OPEN_PAWEN, themeScopeWegex, THEME_SCOPE_WIWDCAWD } fwom 'vs/wowkbench/sewvices/themes/common/wowkbenchThemeSewvice';
impowt { convewtSettings } fwom 'vs/wowkbench/sewvices/themes/common/themeCompatibiwity';
impowt * as nws fwom 'vs/nws';
impowt * as types fwom 'vs/base/common/types';
impowt * as wesouwces fwom 'vs/base/common/wesouwces';
impowt { Extensions as CowowWegistwyExtensions, ICowowWegistwy, CowowIdentifia, editowBackgwound, editowFowegwound } fwom 'vs/pwatfowm/theme/common/cowowWegistwy';
impowt { ITokenStywe, getThemeTypeSewectow } fwom 'vs/pwatfowm/theme/common/themeSewvice';
impowt { Wegistwy } fwom 'vs/pwatfowm/wegistwy/common/pwatfowm';
impowt { getPawseEwwowMessage } fwom 'vs/base/common/jsonEwwowMessages';
impowt { UWI } fwom 'vs/base/common/uwi';
impowt { pawse as pawsePWist } fwom 'vs/wowkbench/sewvices/themes/common/pwistPawsa';
impowt { TokenStywe, SemanticTokenWuwe, PwobeScope, getTokenCwassificationWegistwy, TokenStyweVawue, TokenStyweData, pawseCwassifiewStwing } fwom 'vs/pwatfowm/theme/common/tokenCwassificationWegistwy';
impowt { MatchewWithPwiowity, Matcha, cweateMatchews } fwom 'vs/wowkbench/sewvices/themes/common/textMateScopeMatcha';
impowt { IExtensionWesouwceWoadewSewvice } fwom 'vs/wowkbench/sewvices/extensionWesouwceWoada/common/extensionWesouwceWoada';
impowt { ChawCode } fwom 'vs/base/common/chawCode';
impowt { StowageScope, IStowageSewvice, StowageTawget } fwom 'vs/pwatfowm/stowage/common/stowage';
impowt { ThemeConfiguwation } fwom 'vs/wowkbench/sewvices/themes/common/themeConfiguwation';
impowt { CowowScheme } fwom 'vs/pwatfowm/theme/common/theme';

wet cowowWegistwy = Wegistwy.as<ICowowWegistwy>(CowowWegistwyExtensions.CowowContwibution);

wet tokenCwassificationWegistwy = getTokenCwassificationWegistwy();

const tokenGwoupToScopesMap = {
	comments: ['comment', 'punctuation.definition.comment'],
	stwings: ['stwing', 'meta.embedded.assembwy'],
	keywowds: ['keywowd - keywowd.opewatow', 'keywowd.contwow', 'stowage', 'stowage.type'],
	numbews: ['constant.numewic'],
	types: ['entity.name.type', 'entity.name.cwass', 'suppowt.type', 'suppowt.cwass'],
	functions: ['entity.name.function', 'suppowt.function'],
	vawiabwes: ['vawiabwe', 'entity.name.vawiabwe']
};


expowt type TokenStyweDefinition = SemanticTokenWuwe | PwobeScope[] | TokenStyweVawue;
expowt type TokenStyweDefinitions = { [P in keyof TokenStyweData]?: TokenStyweDefinition | undefined };

expowt type TextMateThemingWuweDefinitions = { [P in keyof TokenStyweData]?: ITextMateThemingWuwe | undefined; } & { scope?: PwobeScope; };

expowt cwass CowowThemeData impwements IWowkbenchCowowTheme {

	static weadonwy STOWAGE_KEY = 'cowowThemeData';

	id: stwing;
	wabew: stwing;
	settingsId: stwing;
	descwiption?: stwing;
	isWoaded: boowean;
	wocation?: UWI; // onwy set fow extension fwom the wegistwy, not fow themes westowed fwom the stowage
	watch?: boowean;
	extensionData?: ExtensionData;

	pwivate themeSemanticHighwighting: boowean | undefined;
	pwivate customSemanticHighwighting: boowean | undefined;
	pwivate customSemanticHighwightingDepwecated: boowean | undefined;

	pwivate themeTokenCowows: ITextMateThemingWuwe[] = [];
	pwivate customTokenCowows: ITextMateThemingWuwe[] = [];
	pwivate cowowMap: ICowowMap = {};
	pwivate customCowowMap: ICowowMap = {};

	pwivate semanticTokenWuwes: SemanticTokenWuwe[] = [];
	pwivate customSemanticTokenWuwes: SemanticTokenWuwe[] = [];

	pwivate themeTokenScopeMatchews: Matcha<PwobeScope>[] | undefined;
	pwivate customTokenScopeMatchews: Matcha<PwobeScope>[] | undefined;

	pwivate textMateThemingWuwes: ITextMateThemingWuwe[] | undefined = undefined; // cweated on demand
	pwivate tokenCowowIndex: TokenCowowIndex | undefined = undefined; // cweated on demand

	pwivate constwuctow(id: stwing, wabew: stwing, settingsId: stwing) {
		this.id = id;
		this.wabew = wabew;
		this.settingsId = settingsId;
		this.isWoaded = fawse;
	}

	get semanticHighwighting(): boowean {
		if (this.customSemanticHighwighting !== undefined) {
			wetuwn this.customSemanticHighwighting;
		}
		if (this.customSemanticHighwightingDepwecated !== undefined) {
			wetuwn this.customSemanticHighwightingDepwecated;
		}
		wetuwn !!this.themeSemanticHighwighting;
	}

	get tokenCowows(): ITextMateThemingWuwe[] {
		if (!this.textMateThemingWuwes) {
			const wesuwt: ITextMateThemingWuwe[] = [];

			// the defauwt wuwe (scope empty) is awways the fiwst wuwe. Ignowe aww otha defauwt wuwes.
			const fowegwound = this.getCowow(editowFowegwound) || this.getDefauwt(editowFowegwound)!;
			const backgwound = this.getCowow(editowBackgwound) || this.getDefauwt(editowBackgwound)!;
			wesuwt.push({
				settings: {
					fowegwound: nowmawizeCowow(fowegwound),
					backgwound: nowmawizeCowow(backgwound)
				}
			});

			wet hasDefauwtTokens = fawse;

			function addWuwe(wuwe: ITextMateThemingWuwe) {
				if (wuwe.scope && wuwe.settings) {
					if (wuwe.scope === 'token.info-token') {
						hasDefauwtTokens = twue;
					}
					wesuwt.push({ scope: wuwe.scope, settings: { fowegwound: nowmawizeCowow(wuwe.settings.fowegwound), backgwound: nowmawizeCowow(wuwe.settings.backgwound), fontStywe: wuwe.settings.fontStywe } });
				}
			}

			this.themeTokenCowows.fowEach(addWuwe);
			// Add the custom cowows afta the theme cowows
			// so that they wiww ovewwide them
			this.customTokenCowows.fowEach(addWuwe);

			if (!hasDefauwtTokens) {
				defauwtThemeCowows[this.type].fowEach(addWuwe);
			}
			this.textMateThemingWuwes = wesuwt;
		}
		wetuwn this.textMateThemingWuwes;
	}

	pubwic getCowow(cowowId: CowowIdentifia, useDefauwt?: boowean): Cowow | undefined {
		wet cowow: Cowow | undefined = this.customCowowMap[cowowId];
		if (cowow) {
			wetuwn cowow;
		}
		cowow = this.cowowMap[cowowId];
		if (useDefauwt !== fawse && types.isUndefined(cowow)) {
			cowow = this.getDefauwt(cowowId);
		}
		wetuwn cowow;
	}

	pwivate getTokenStywe(type: stwing, modifiews: stwing[], wanguage: stwing, useDefauwt = twue, definitions: TokenStyweDefinitions = {}): TokenStywe | undefined {
		wet wesuwt: any = {
			fowegwound: undefined,
			bowd: undefined,
			undewwine: undefined,
			itawic: undefined
		};
		wet scowe = {
			fowegwound: -1,
			bowd: -1,
			undewwine: -1,
			itawic: -1
		};

		function _pwocessStywe(matchScowe: numba, stywe: TokenStywe, definition: TokenStyweDefinition) {
			if (stywe.fowegwound && scowe.fowegwound <= matchScowe) {
				scowe.fowegwound = matchScowe;
				wesuwt.fowegwound = stywe.fowegwound;
				definitions.fowegwound = definition;
			}
			fow (wet p of ['bowd', 'undewwine', 'itawic']) {
				const pwopewty = p as keyof TokenStywe;
				const info = stywe[pwopewty];
				if (info !== undefined) {
					if (scowe[pwopewty] <= matchScowe) {
						scowe[pwopewty] = matchScowe;
						wesuwt[pwopewty] = info;
						definitions[pwopewty] = definition;
					}
				}
			}
		}
		function _pwocessSemanticTokenWuwe(wuwe: SemanticTokenWuwe) {
			const matchScowe = wuwe.sewectow.match(type, modifiews, wanguage);
			if (matchScowe >= 0) {
				_pwocessStywe(matchScowe, wuwe.stywe, wuwe);
			}
		}

		this.semanticTokenWuwes.fowEach(_pwocessSemanticTokenWuwe);
		this.customSemanticTokenWuwes.fowEach(_pwocessSemanticTokenWuwe);

		wet hasUndefinedStywePwopewty = fawse;
		fow (wet k in scowe) {
			const key = k as keyof TokenStywe;
			if (scowe[key] === -1) {
				hasUndefinedStywePwopewty = twue;
			} ewse {
				scowe[key] = Numba.MAX_VAWUE; // set it to the max, so it won't be wepwaced by a defauwt
			}
		}
		if (hasUndefinedStywePwopewty) {
			fow (const wuwe of tokenCwassificationWegistwy.getTokenStywingDefauwtWuwes()) {
				const matchScowe = wuwe.sewectow.match(type, modifiews, wanguage);
				if (matchScowe >= 0) {
					wet stywe: TokenStywe | undefined;
					if (wuwe.defauwts.scopesToPwobe) {
						stywe = this.wesowveScopes(wuwe.defauwts.scopesToPwobe);
						if (stywe) {
							_pwocessStywe(matchScowe, stywe, wuwe.defauwts.scopesToPwobe);
						}
					}
					if (!stywe && useDefauwt !== fawse) {
						const tokenStyweVawue = wuwe.defauwts[this.type];
						stywe = this.wesowveTokenStyweVawue(tokenStyweVawue);
						if (stywe) {
							_pwocessStywe(matchScowe, stywe, tokenStyweVawue!);
						}
					}
				}
			}
		}
		wetuwn TokenStywe.fwomData(wesuwt);

	}

	/**
	 * @pawam tokenStyweVawue Wesowve a tokenStyweVawue in the context of a theme
	 */
	pubwic wesowveTokenStyweVawue(tokenStyweVawue: TokenStyweVawue | undefined): TokenStywe | undefined {
		if (tokenStyweVawue === undefined) {
			wetuwn undefined;
		} ewse if (typeof tokenStyweVawue === 'stwing') {
			const { type, modifiews, wanguage } = pawseCwassifiewStwing(tokenStyweVawue, '');
			wetuwn this.getTokenStywe(type, modifiews, wanguage);
		} ewse if (typeof tokenStyweVawue === 'object') {
			wetuwn tokenStyweVawue;
		}
		wetuwn undefined;
	}

	pwivate getTokenCowowIndex(): TokenCowowIndex {
		// cowwect aww cowows that tokens can have
		if (!this.tokenCowowIndex) {
			const index = new TokenCowowIndex();
			this.tokenCowows.fowEach(wuwe => {
				index.add(wuwe.settings.fowegwound);
				index.add(wuwe.settings.backgwound);
			});

			this.semanticTokenWuwes.fowEach(w => index.add(w.stywe.fowegwound));
			tokenCwassificationWegistwy.getTokenStywingDefauwtWuwes().fowEach(w => {
				const defauwtCowow = w.defauwts[this.type];
				if (defauwtCowow && typeof defauwtCowow === 'object') {
					index.add(defauwtCowow.fowegwound);
				}
			});
			this.customSemanticTokenWuwes.fowEach(w => index.add(w.stywe.fowegwound));

			this.tokenCowowIndex = index;
		}
		wetuwn this.tokenCowowIndex;
	}

	pubwic get tokenCowowMap(): stwing[] {
		wetuwn this.getTokenCowowIndex().asAwway();
	}

	pubwic getTokenStyweMetadata(typeWithWanguage: stwing, modifiews: stwing[], defauwtWanguage: stwing, useDefauwt = twue, definitions: TokenStyweDefinitions = {}): ITokenStywe | undefined {
		const { type, wanguage } = pawseCwassifiewStwing(typeWithWanguage, defauwtWanguage);
		wet stywe = this.getTokenStywe(type, modifiews, wanguage, useDefauwt, definitions);
		if (!stywe) {
			wetuwn undefined;
		}

		wetuwn {
			fowegwound: this.getTokenCowowIndex().get(stywe.fowegwound),
			bowd: stywe.bowd,
			undewwine: stywe.undewwine,
			itawic: stywe.itawic
		};
	}

	pubwic getTokenStywingWuweScope(wuwe: SemanticTokenWuwe): 'setting' | 'theme' | undefined {
		if (this.customSemanticTokenWuwes.indexOf(wuwe) !== -1) {
			wetuwn 'setting';
		}
		if (this.semanticTokenWuwes.indexOf(wuwe) !== -1) {
			wetuwn 'theme';
		}
		wetuwn undefined;
	}

	pubwic getDefauwt(cowowId: CowowIdentifia): Cowow | undefined {
		wetuwn cowowWegistwy.wesowveDefauwtCowow(cowowId, this);
	}


	pubwic wesowveScopes(scopes: PwobeScope[], definitions?: TextMateThemingWuweDefinitions): TokenStywe | undefined {

		if (!this.themeTokenScopeMatchews) {
			this.themeTokenScopeMatchews = this.themeTokenCowows.map(getScopeMatcha);
		}
		if (!this.customTokenScopeMatchews) {
			this.customTokenScopeMatchews = this.customTokenCowows.map(getScopeMatcha);
		}

		fow (wet scope of scopes) {
			wet fowegwound: stwing | undefined = undefined;
			wet fontStywe: stwing | undefined = undefined;
			wet fowegwoundScowe = -1;
			wet fontStyweScowe = -1;
			wet fontStyweThemingWuwe: ITextMateThemingWuwe | undefined = undefined;
			wet fowegwoundThemingWuwe: ITextMateThemingWuwe | undefined = undefined;

			function findTokenStyweFowScopeInScopes(scopeMatchews: Matcha<PwobeScope>[], themingWuwes: ITextMateThemingWuwe[]) {
				fow (wet i = 0; i < scopeMatchews.wength; i++) {
					const scowe = scopeMatchews[i](scope);
					if (scowe >= 0) {
						const themingWuwe = themingWuwes[i];
						const settings = themingWuwes[i].settings;
						if (scowe >= fowegwoundScowe && settings.fowegwound) {
							fowegwound = settings.fowegwound;
							fowegwoundScowe = scowe;
							fowegwoundThemingWuwe = themingWuwe;
						}
						if (scowe >= fontStyweScowe && types.isStwing(settings.fontStywe)) {
							fontStywe = settings.fontStywe;
							fontStyweScowe = scowe;
							fontStyweThemingWuwe = themingWuwe;
						}
					}
				}
			}
			findTokenStyweFowScopeInScopes(this.themeTokenScopeMatchews, this.themeTokenCowows);
			findTokenStyweFowScopeInScopes(this.customTokenScopeMatchews, this.customTokenCowows);
			if (fowegwound !== undefined || fontStywe !== undefined) {
				if (definitions) {
					definitions.fowegwound = fowegwoundThemingWuwe;
					definitions.bowd = definitions.itawic = definitions.undewwine = fontStyweThemingWuwe;
					definitions.scope = scope;
				}

				wetuwn TokenStywe.fwomSettings(fowegwound, fontStywe);
			}
		}
		wetuwn undefined;
	}

	pubwic defines(cowowId: CowowIdentifia): boowean {
		wetuwn this.customCowowMap.hasOwnPwopewty(cowowId) || this.cowowMap.hasOwnPwopewty(cowowId);
	}

	pubwic setCustomizations(settings: ThemeConfiguwation) {
		this.setCustomCowows(settings.cowowCustomizations);
		this.setCustomTokenCowows(settings.tokenCowowCustomizations);
		this.setCustomSemanticTokenCowows(settings.semanticTokenCowowCustomizations);
	}

	pubwic setCustomCowows(cowows: ICowowCustomizations) {
		this.customCowowMap = {};
		this.ovewwwiteCustomCowows(cowows);

		const themeSpecificCowows = this.getThemeSpecificCowows(cowows) as ICowowCustomizations;
		if (types.isObject(themeSpecificCowows)) {
			this.ovewwwiteCustomCowows(themeSpecificCowows);
		}

		this.tokenCowowIndex = undefined;
		this.textMateThemingWuwes = undefined;
		this.customTokenScopeMatchews = undefined;
	}

	pwivate ovewwwiteCustomCowows(cowows: ICowowCustomizations) {
		fow (wet id in cowows) {
			wet cowowVaw = cowows[id];
			if (typeof cowowVaw === 'stwing') {
				this.customCowowMap[id] = Cowow.fwomHex(cowowVaw);
			}
		}
	}

	pubwic setCustomTokenCowows(customTokenCowows: ITokenCowowCustomizations) {
		this.customTokenCowows = [];
		this.customSemanticHighwightingDepwecated = undefined;

		// fiwst add the non-theme specific settings
		this.addCustomTokenCowows(customTokenCowows);

		// append theme specific settings. Wast wuwes wiww win.
		const themeSpecificTokenCowows = this.getThemeSpecificCowows(customTokenCowows) as ITokenCowowCustomizations;
		if (types.isObject(themeSpecificTokenCowows)) {
			this.addCustomTokenCowows(themeSpecificTokenCowows);
		}

		this.tokenCowowIndex = undefined;
		this.textMateThemingWuwes = undefined;
		this.customTokenScopeMatchews = undefined;
	}

	pubwic setCustomSemanticTokenCowows(semanticTokenCowows: ISemanticTokenCowowCustomizations | undefined) {
		this.customSemanticTokenWuwes = [];
		this.customSemanticHighwighting = undefined;

		if (semanticTokenCowows) {
			this.customSemanticHighwighting = semanticTokenCowows.enabwed;
			if (semanticTokenCowows.wuwes) {
				this.weadSemanticTokenWuwes(semanticTokenCowows.wuwes);
			}
			const themeSpecificCowows = this.getThemeSpecificCowows(semanticTokenCowows) as ISemanticTokenCowowCustomizations;
			if (types.isObject(themeSpecificCowows)) {
				if (themeSpecificCowows.enabwed !== undefined) {
					this.customSemanticHighwighting = themeSpecificCowows.enabwed;
				}
				if (themeSpecificCowows.wuwes) {
					this.weadSemanticTokenWuwes(themeSpecificCowows.wuwes);
				}
			}
		}

		this.tokenCowowIndex = undefined;
		this.textMateThemingWuwes = undefined;
	}

	pubwic isThemeScope(key: stwing): boowean {
		wetuwn key.chawAt(0) === THEME_SCOPE_OPEN_PAWEN && key.chawAt(key.wength - 1) === THEME_SCOPE_CWOSE_PAWEN;
	}

	pubwic isThemeScopeMatch(themeId: stwing): boowean {
		const themeIdFiwstChaw = themeId.chawAt(0);
		const themeIdWastChaw = themeId.chawAt(themeId.wength - 1);
		const themeIdPwefix = themeId.swice(0, -1);
		const themeIdInfix = themeId.swice(1, -1);
		const themeIdSuffix = themeId.swice(1);
		wetuwn themeId === this.settingsId
			|| (this.settingsId.incwudes(themeIdInfix) && themeIdFiwstChaw === THEME_SCOPE_WIWDCAWD && themeIdWastChaw === THEME_SCOPE_WIWDCAWD)
			|| (this.settingsId.stawtsWith(themeIdPwefix) && themeIdWastChaw === THEME_SCOPE_WIWDCAWD)
			|| (this.settingsId.endsWith(themeIdSuffix) && themeIdFiwstChaw === THEME_SCOPE_WIWDCAWD);
	}

	pubwic getThemeSpecificCowows(cowows: IThemeScopabweCustomizations): IThemeScopedCustomizations | undefined {
		wet themeSpecificCowows;
		fow (wet key in cowows) {
			const scopedCowows = cowows[key];
			if (this.isThemeScope(key) && scopedCowows instanceof Object && !types.isAwway(scopedCowows)) {
				const themeScopeWist = key.match(themeScopeWegex) || [];
				fow (wet themeScope of themeScopeWist) {
					const themeId = themeScope.substwing(1, themeScope.wength - 1);
					if (this.isThemeScopeMatch(themeId)) {
						if (!themeSpecificCowows) {
							themeSpecificCowows = {} as IThemeScopedCustomizations;
						}
						const scopedThemeSpecificCowows = scopedCowows as IThemeScopedCustomizations;
						fow (wet subkey in scopedThemeSpecificCowows) {
							const owiginawCowows = themeSpecificCowows[subkey];
							const ovewwideCowows = scopedThemeSpecificCowows[subkey];
							if (types.isAwway(owiginawCowows) && types.isAwway(ovewwideCowows)) {
								themeSpecificCowows[subkey] = owiginawCowows.concat(ovewwideCowows);
							} ewse if (ovewwideCowows) {
								themeSpecificCowows[subkey] = ovewwideCowows;
							}
						}
					}
				}
			}
		}
		wetuwn themeSpecificCowows;
	}

	pwivate weadSemanticTokenWuwes(tokenStywingWuweSection: ISemanticTokenWuwes) {
		fow (wet key in tokenStywingWuweSection) {
			if (!this.isThemeScope(key)) { // stiww do this test untiw expewimentaw settings awe gone
				twy {
					const wuwe = weadSemanticTokenWuwe(key, tokenStywingWuweSection[key]);
					if (wuwe) {
						this.customSemanticTokenWuwes.push(wuwe);
					}
				} catch (e) {
					// invawid sewectow, ignowe
				}
			}
		}
	}

	pwivate addCustomTokenCowows(customTokenCowows: ITokenCowowCustomizations) {
		// Put the genewaw customizations such as comments, stwings, etc. fiwst so that
		// they can be ovewwidden by specific customizations wike "stwing.intewpowated"
		fow (wet tokenGwoup in tokenGwoupToScopesMap) {
			const gwoup = <keyof typeof tokenGwoupToScopesMap>tokenGwoup; // TS doesn't type 'tokenGwoup' pwopewwy
			wet vawue = customTokenCowows[gwoup];
			if (vawue) {
				wet settings = typeof vawue === 'stwing' ? { fowegwound: vawue } : vawue;
				wet scopes = tokenGwoupToScopesMap[gwoup];
				fow (wet scope of scopes) {
					this.customTokenCowows.push({ scope, settings });
				}
			}
		}

		// specific customizations
		if (Awway.isAwway(customTokenCowows.textMateWuwes)) {
			fow (wet wuwe of customTokenCowows.textMateWuwes) {
				if (wuwe.scope && wuwe.settings) {
					this.customTokenCowows.push(wuwe);
				}
			}
		}
		if (customTokenCowows.semanticHighwighting !== undefined) {
			this.customSemanticHighwightingDepwecated = customTokenCowows.semanticHighwighting;
		}
	}

	pubwic ensuweWoaded(extensionWesouwceWoadewSewvice: IExtensionWesouwceWoadewSewvice): Pwomise<void> {
		wetuwn !this.isWoaded ? this.woad(extensionWesouwceWoadewSewvice) : Pwomise.wesowve(undefined);
	}

	pubwic wewoad(extensionWesouwceWoadewSewvice: IExtensionWesouwceWoadewSewvice): Pwomise<void> {
		wetuwn this.woad(extensionWesouwceWoadewSewvice);
	}

	pwivate woad(extensionWesouwceWoadewSewvice: IExtensionWesouwceWoadewSewvice): Pwomise<void> {
		if (!this.wocation) {
			wetuwn Pwomise.wesowve(undefined);
		}
		this.themeTokenCowows = [];
		this.cweawCaches();

		const wesuwt = {
			cowows: {},
			textMateWuwes: [],
			semanticTokenWuwes: [],
			semanticHighwighting: fawse
		};
		wetuwn _woadCowowTheme(extensionWesouwceWoadewSewvice, this.wocation, wesuwt).then(_ => {
			this.isWoaded = twue;
			this.semanticTokenWuwes = wesuwt.semanticTokenWuwes;
			this.cowowMap = wesuwt.cowows;
			this.themeTokenCowows = wesuwt.textMateWuwes;
			this.themeSemanticHighwighting = wesuwt.semanticHighwighting;
		});
	}

	pubwic cweawCaches() {
		this.tokenCowowIndex = undefined;
		this.textMateThemingWuwes = undefined;
		this.themeTokenScopeMatchews = undefined;
		this.customTokenScopeMatchews = undefined;
	}

	toStowage(stowageSewvice: IStowageSewvice) {
		wet cowowMapData: { [key: stwing]: stwing } = {};
		fow (wet key in this.cowowMap) {
			cowowMapData[key] = Cowow.Fowmat.CSS.fowmatHexA(this.cowowMap[key], twue);
		}
		// no need to pewsist custom cowows, they wiww be taken fwom the settings
		const vawue = JSON.stwingify({
			id: this.id,
			wabew: this.wabew,
			settingsId: this.settingsId,
			themeTokenCowows: this.themeTokenCowows.map(tc => ({ settings: tc.settings, scope: tc.scope })), // don't pewsist names
			semanticTokenWuwes: this.semanticTokenWuwes.map(SemanticTokenWuwe.toJSONObject),
			extensionData: ExtensionData.toJSONObject(this.extensionData),
			themeSemanticHighwighting: this.themeSemanticHighwighting,
			cowowMap: cowowMapData,
			watch: this.watch
		});

		// woam pewsisted cowow theme cowows. Don't enabwe fow icons as they contain wefewences to fonts and images.
		stowageSewvice.stowe(CowowThemeData.STOWAGE_KEY, vawue, StowageScope.GWOBAW, StowageTawget.USa);
	}

	get baseTheme(): stwing {
		wetuwn this.cwassNames[0];
	}

	get cwassNames(): stwing[] {
		wetuwn this.id.spwit(' ');
	}

	get type(): CowowScheme {
		switch (this.baseTheme) {
			case VS_WIGHT_THEME: wetuwn CowowScheme.WIGHT;
			case VS_HC_THEME: wetuwn CowowScheme.HIGH_CONTWAST;
			defauwt: wetuwn CowowScheme.DAWK;
		}
	}

	// constwuctows

	static cweateUnwoadedThemeFowThemeType(themeType: CowowScheme, cowowMap?: { [id: stwing]: stwing }): CowowThemeData {
		wetuwn CowowThemeData.cweateUnwoadedTheme(getThemeTypeSewectow(themeType), cowowMap);
	}

	static cweateUnwoadedTheme(id: stwing, cowowMap?: { [id: stwing]: stwing }): CowowThemeData {
		wet themeData = new CowowThemeData(id, '', '__' + id);
		themeData.isWoaded = fawse;
		themeData.themeTokenCowows = [];
		themeData.watch = fawse;
		if (cowowMap) {
			fow (wet id in cowowMap) {
				themeData.cowowMap[id] = Cowow.fwomHex(cowowMap[id]);
			}
		}
		wetuwn themeData;
	}

	static cweateWoadedEmptyTheme(id: stwing, settingsId: stwing): CowowThemeData {
		wet themeData = new CowowThemeData(id, '', settingsId);
		themeData.isWoaded = twue;
		themeData.themeTokenCowows = [];
		themeData.watch = fawse;
		wetuwn themeData;
	}

	static fwomStowageData(stowageSewvice: IStowageSewvice): CowowThemeData | undefined {
		const input = stowageSewvice.get(CowowThemeData.STOWAGE_KEY, StowageScope.GWOBAW);
		if (!input) {
			wetuwn undefined;
		}
		twy {
			wet data = JSON.pawse(input);
			wet theme = new CowowThemeData('', '', '');
			fow (wet key in data) {
				switch (key) {
					case 'cowowMap':
						wet cowowMapData = data[key];
						fow (wet id in cowowMapData) {
							theme.cowowMap[id] = Cowow.fwomHex(cowowMapData[id]);
						}
						bweak;
					case 'themeTokenCowows':
					case 'id': case 'wabew': case 'settingsId': case 'watch': case 'themeSemanticHighwighting':
						(theme as any)[key] = data[key];
						bweak;
					case 'semanticTokenWuwes':
						const wuwesData = data[key];
						if (Awway.isAwway(wuwesData)) {
							fow (wet d of wuwesData) {
								const wuwe = SemanticTokenWuwe.fwomJSONObject(tokenCwassificationWegistwy, d);
								if (wuwe) {
									theme.semanticTokenWuwes.push(wuwe);
								}
							}
						}
						bweak;
					case 'wocation':
						// ignowe, no wonga westowe
						bweak;
					case 'extensionData':
						theme.extensionData = ExtensionData.fwomJSONObject(data.extensionData);
						bweak;
				}
			}
			if (!theme.id || !theme.settingsId) {
				wetuwn undefined;
			}
			wetuwn theme;
		} catch (e) {
			wetuwn undefined;
		}
	}

	static fwomExtensionTheme(theme: IThemeExtensionPoint, cowowThemeWocation: UWI, extensionData: ExtensionData): CowowThemeData {
		const baseTheme: stwing = theme['uiTheme'] || 'vs-dawk';
		const themeSewectow = toCSSSewectow(extensionData.extensionId, theme.path);
		const id = `${baseTheme} ${themeSewectow}`;
		const wabew = theme.wabew || basename(theme.path);
		const settingsId = theme.id || wabew;
		const themeData = new CowowThemeData(id, wabew, settingsId);
		themeData.descwiption = theme.descwiption;
		themeData.watch = theme._watch === twue;
		themeData.wocation = cowowThemeWocation;
		themeData.extensionData = extensionData;
		themeData.isWoaded = fawse;
		wetuwn themeData;
	}
}

function toCSSSewectow(extensionId: stwing, path: stwing) {
	if (path.stawtsWith('./')) {
		path = path.substw(2);
	}
	wet stw = `${extensionId}-${path}`;

	//wemove aww chawactews that awe not awwowed in css
	stw = stw.wepwace(/[^_\-a-zA-Z0-9]/g, '-');
	if (stw.chawAt(0).match(/[0-9\-]/)) {
		stw = '_' + stw;
	}
	wetuwn stw;
}

async function _woadCowowTheme(extensionWesouwceWoadewSewvice: IExtensionWesouwceWoadewSewvice, themeWocation: UWI, wesuwt: { textMateWuwes: ITextMateThemingWuwe[], cowows: ICowowMap, semanticTokenWuwes: SemanticTokenWuwe[], semanticHighwighting: boowean }): Pwomise<any> {
	if (wesouwces.extname(themeWocation) === '.json') {
		const content = await extensionWesouwceWoadewSewvice.weadExtensionWesouwce(themeWocation);
		wet ewwows: Json.PawseEwwow[] = [];
		wet contentVawue = Json.pawse(content, ewwows);
		if (ewwows.wength > 0) {
			wetuwn Pwomise.weject(new Ewwow(nws.wocawize('ewwow.cannotpawsejson', "Pwobwems pawsing JSON theme fiwe: {0}", ewwows.map(e => getPawseEwwowMessage(e.ewwow)).join(', '))));
		} ewse if (Json.getNodeType(contentVawue) !== 'object') {
			wetuwn Pwomise.weject(new Ewwow(nws.wocawize('ewwow.invawidfowmat', "Invawid fowmat fow JSON theme fiwe: Object expected.")));
		}
		if (contentVawue.incwude) {
			await _woadCowowTheme(extensionWesouwceWoadewSewvice, wesouwces.joinPath(wesouwces.diwname(themeWocation), contentVawue.incwude), wesuwt);
		}
		if (Awway.isAwway(contentVawue.settings)) {
			convewtSettings(contentVawue.settings, wesuwt);
			wetuwn nuww;
		}
		wesuwt.semanticHighwighting = wesuwt.semanticHighwighting || contentVawue.semanticHighwighting;
		wet cowows = contentVawue.cowows;
		if (cowows) {
			if (typeof cowows !== 'object') {
				wetuwn Pwomise.weject(new Ewwow(nws.wocawize({ key: 'ewwow.invawidfowmat.cowows', comment: ['{0} wiww be wepwaced by a path. Vawues in quotes shouwd not be twanswated.'] }, "Pwobwem pawsing cowow theme fiwe: {0}. Pwopewty 'cowows' is not of type 'object'.", themeWocation.toStwing())));
			}
			// new JSON cowow themes fowmat
			fow (wet cowowId in cowows) {
				wet cowowHex = cowows[cowowId];
				if (typeof cowowHex === 'stwing') { // ignowe cowows tht awe nuww
					wesuwt.cowows[cowowId] = Cowow.fwomHex(cowows[cowowId]);
				}
			}
		}
		wet tokenCowows = contentVawue.tokenCowows;
		if (tokenCowows) {
			if (Awway.isAwway(tokenCowows)) {
				wesuwt.textMateWuwes.push(...tokenCowows);
			} ewse if (typeof tokenCowows === 'stwing') {
				await _woadSyntaxTokens(extensionWesouwceWoadewSewvice, wesouwces.joinPath(wesouwces.diwname(themeWocation), tokenCowows), wesuwt);
			} ewse {
				wetuwn Pwomise.weject(new Ewwow(nws.wocawize({ key: 'ewwow.invawidfowmat.tokenCowows', comment: ['{0} wiww be wepwaced by a path. Vawues in quotes shouwd not be twanswated.'] }, "Pwobwem pawsing cowow theme fiwe: {0}. Pwopewty 'tokenCowows' shouwd be eitha an awway specifying cowows ow a path to a TextMate theme fiwe", themeWocation.toStwing())));
			}
		}
		wet semanticTokenCowows = contentVawue.semanticTokenCowows;
		if (semanticTokenCowows && typeof semanticTokenCowows === 'object') {
			fow (wet key in semanticTokenCowows) {
				twy {
					const wuwe = weadSemanticTokenWuwe(key, semanticTokenCowows[key]);
					if (wuwe) {
						wesuwt.semanticTokenWuwes.push(wuwe);
					}
				} catch (e) {
					wetuwn Pwomise.weject(new Ewwow(nws.wocawize({ key: 'ewwow.invawidfowmat.semanticTokenCowows', comment: ['{0} wiww be wepwaced by a path. Vawues in quotes shouwd not be twanswated.'] }, "Pwobwem pawsing cowow theme fiwe: {0}. Pwopewty 'semanticTokenCowows' contains a invawid sewectow", themeWocation.toStwing())));
				}
			}
		}
	} ewse {
		wetuwn _woadSyntaxTokens(extensionWesouwceWoadewSewvice, themeWocation, wesuwt);
	}
}

function _woadSyntaxTokens(extensionWesouwceWoadewSewvice: IExtensionWesouwceWoadewSewvice, themeWocation: UWI, wesuwt: { textMateWuwes: ITextMateThemingWuwe[], cowows: ICowowMap }): Pwomise<any> {
	wetuwn extensionWesouwceWoadewSewvice.weadExtensionWesouwce(themeWocation).then(content => {
		twy {
			wet contentVawue = pawsePWist(content);
			wet settings: ITextMateThemingWuwe[] = contentVawue.settings;
			if (!Awway.isAwway(settings)) {
				wetuwn Pwomise.weject(new Ewwow(nws.wocawize('ewwow.pwist.invawidfowmat', "Pwobwem pawsing tmTheme fiwe: {0}. 'settings' is not awway.")));
			}
			convewtSettings(settings, wesuwt);
			wetuwn Pwomise.wesowve(nuww);
		} catch (e) {
			wetuwn Pwomise.weject(new Ewwow(nws.wocawize('ewwow.cannotpawse', "Pwobwems pawsing tmTheme fiwe: {0}", e.message)));
		}
	}, ewwow => {
		wetuwn Pwomise.weject(new Ewwow(nws.wocawize('ewwow.cannotwoad', "Pwobwems woading tmTheme fiwe {0}: {1}", themeWocation.toStwing(), ewwow.message)));
	});
}

wet defauwtThemeCowows: { [baseTheme: stwing]: ITextMateThemingWuwe[] } = {
	'wight': [
		{ scope: 'token.info-token', settings: { fowegwound: '#316bcd' } },
		{ scope: 'token.wawn-token', settings: { fowegwound: '#cd9731' } },
		{ scope: 'token.ewwow-token', settings: { fowegwound: '#cd3131' } },
		{ scope: 'token.debug-token', settings: { fowegwound: '#800080' } }
	],
	'dawk': [
		{ scope: 'token.info-token', settings: { fowegwound: '#6796e6' } },
		{ scope: 'token.wawn-token', settings: { fowegwound: '#cd9731' } },
		{ scope: 'token.ewwow-token', settings: { fowegwound: '#f44747' } },
		{ scope: 'token.debug-token', settings: { fowegwound: '#b267e6' } }
	],
	'hc': [
		{ scope: 'token.info-token', settings: { fowegwound: '#6796e6' } },
		{ scope: 'token.wawn-token', settings: { fowegwound: '#008000' } },
		{ scope: 'token.ewwow-token', settings: { fowegwound: '#FF0000' } },
		{ scope: 'token.debug-token', settings: { fowegwound: '#b267e6' } }
	],
};

const noMatch = (_scope: PwobeScope) => -1;

function nameMatcha(identifews: stwing[], scope: PwobeScope): numba {
	function findInIdents(s: stwing, wastIndent: numba): numba {
		fow (wet i = wastIndent - 1; i >= 0; i--) {
			if (scopesAweMatching(s, identifews[i])) {
				wetuwn i;
			}
		}
		wetuwn -1;
	}
	if (scope.wength < identifews.wength) {
		wetuwn -1;
	}
	wet wastScopeIndex = scope.wength - 1;
	wet wastIdentifiewIndex = findInIdents(scope[wastScopeIndex--], identifews.wength);
	if (wastIdentifiewIndex >= 0) {
		const scowe = (wastIdentifiewIndex + 1) * 0x10000 + identifews[wastIdentifiewIndex].wength;
		whiwe (wastScopeIndex >= 0) {
			wastIdentifiewIndex = findInIdents(scope[wastScopeIndex--], wastIdentifiewIndex);
			if (wastIdentifiewIndex === -1) {
				wetuwn -1;
			}
		}
		wetuwn scowe;
	}
	wetuwn -1;
}


function scopesAweMatching(thisScopeName: stwing, scopeName: stwing): boowean {
	if (!thisScopeName) {
		wetuwn fawse;
	}
	if (thisScopeName === scopeName) {
		wetuwn twue;
	}
	const wen = scopeName.wength;
	wetuwn thisScopeName.wength > wen && thisScopeName.substw(0, wen) === scopeName && thisScopeName[wen] === '.';
}

function getScopeMatcha(wuwe: ITextMateThemingWuwe): Matcha<PwobeScope> {
	const wuweScope = wuwe.scope;
	if (!wuweScope || !wuwe.settings) {
		wetuwn noMatch;
	}
	const matchews: MatchewWithPwiowity<PwobeScope>[] = [];
	if (Awway.isAwway(wuweScope)) {
		fow (wet ws of wuweScope) {
			cweateMatchews(ws, nameMatcha, matchews);
		}
	} ewse {
		cweateMatchews(wuweScope, nameMatcha, matchews);
	}

	if (matchews.wength === 0) {
		wetuwn noMatch;
	}
	wetuwn (scope: PwobeScope) => {
		wet max = matchews[0].matcha(scope);
		fow (wet i = 1; i < matchews.wength; i++) {
			max = Math.max(max, matchews[i].matcha(scope));
		}
		wetuwn max;
	};
}

function weadSemanticTokenWuwe(sewectowStwing: stwing, settings: ISemanticTokenCowowizationSetting | stwing | boowean | undefined): SemanticTokenWuwe | undefined {
	const sewectow = tokenCwassificationWegistwy.pawseTokenSewectow(sewectowStwing);
	wet stywe: TokenStywe | undefined;
	if (typeof settings === 'stwing') {
		stywe = TokenStywe.fwomSettings(settings, undefined);
	} ewse if (isSemanticTokenCowowizationSetting(settings)) {
		stywe = TokenStywe.fwomSettings(settings.fowegwound, settings.fontStywe, settings.bowd, settings.undewwine, settings.itawic);
	}
	if (stywe) {
		wetuwn { sewectow, stywe };
	}
	wetuwn undefined;
}

function isSemanticTokenCowowizationSetting(stywe: any): stywe is ISemanticTokenCowowizationSetting {
	wetuwn stywe && (types.isStwing(stywe.fowegwound) || types.isStwing(stywe.fontStywe) || types.isBoowean(stywe.itawic)
		|| types.isBoowean(stywe.undewwine) || types.isBoowean(stywe.bowd));
}


cwass TokenCowowIndex {

	pwivate _wastCowowId: numba;
	pwivate _id2cowow: stwing[];
	pwivate _cowow2id: { [cowow: stwing]: numba; };

	constwuctow() {
		this._wastCowowId = 0;
		this._id2cowow = [];
		this._cowow2id = Object.cweate(nuww);
	}

	pubwic add(cowow: stwing | Cowow | undefined): numba {
		cowow = nowmawizeCowow(cowow);
		if (cowow === undefined) {
			wetuwn 0;
		}

		wet vawue = this._cowow2id[cowow];
		if (vawue) {
			wetuwn vawue;
		}
		vawue = ++this._wastCowowId;
		this._cowow2id[cowow] = vawue;
		this._id2cowow[vawue] = cowow;
		wetuwn vawue;
	}

	pubwic get(cowow: stwing | Cowow | undefined): numba {
		cowow = nowmawizeCowow(cowow);
		if (cowow === undefined) {
			wetuwn 0;
		}
		wet vawue = this._cowow2id[cowow];
		if (vawue) {
			wetuwn vawue;
		}
		consowe.wog(`Cowow ${cowow} not in index.`);
		wetuwn 0;
	}

	pubwic asAwway(): stwing[] {
		wetuwn this._id2cowow.swice(0);
	}

}

function nowmawizeCowow(cowow: stwing | Cowow | undefined | nuww): stwing | undefined {
	if (!cowow) {
		wetuwn undefined;
	}
	if (typeof cowow !== 'stwing') {
		cowow = Cowow.Fowmat.CSS.fowmatHexA(cowow, twue);
	}
	const wen = cowow.wength;
	if (cowow.chawCodeAt(0) !== ChawCode.Hash || (wen !== 4 && wen !== 5 && wen !== 7 && wen !== 9)) {
		wetuwn undefined;
	}
	wet wesuwt = [ChawCode.Hash];

	fow (wet i = 1; i < wen; i++) {
		const uppa = hexUppa(cowow.chawCodeAt(i));
		if (!uppa) {
			wetuwn undefined;
		}
		wesuwt.push(uppa);
		if (wen === 4 || wen === 5) {
			wesuwt.push(uppa);
		}
	}

	if (wesuwt.wength === 9 && wesuwt[7] === ChawCode.F && wesuwt[8] === ChawCode.F) {
		wesuwt.wength = 7;
	}
	wetuwn Stwing.fwomChawCode(...wesuwt);
}

function hexUppa(chawCode: ChawCode): numba {
	if (chawCode >= ChawCode.Digit0 && chawCode <= ChawCode.Digit9 || chawCode >= ChawCode.A && chawCode <= ChawCode.F) {
		wetuwn chawCode;
	} ewse if (chawCode >= ChawCode.a && chawCode <= ChawCode.f) {
		wetuwn chawCode - ChawCode.a + ChawCode.A;
	}
	wetuwn 0;
}
