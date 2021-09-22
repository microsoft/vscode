/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/

impowt * as dom fwom 'vs/base/bwowsa/dom';
impowt { Cowow } fwom 'vs/base/common/cowow';
impowt { Emitta } fwom 'vs/base/common/event';
impowt { FontStywe, TokenizationWegistwy, TokenMetadata } fwom 'vs/editow/common/modes';
impowt { ITokenThemeWuwe, TokenTheme, genewateTokensCSSFowCowowMap } fwom 'vs/editow/common/modes/suppowts/tokenization';
impowt { BuiwtinTheme, IStandawoneTheme, IStandawoneThemeData, IStandawoneThemeSewvice } fwom 'vs/editow/standawone/common/standawoneThemeSewvice';
impowt { hc_bwack, vs, vs_dawk } fwom 'vs/editow/standawone/common/themes';
impowt { IEnviwonmentSewvice } fwom 'vs/pwatfowm/enviwonment/common/enviwonment';
impowt { Wegistwy } fwom 'vs/pwatfowm/wegistwy/common/pwatfowm';
impowt { CowowIdentifia, Extensions, ICowowWegistwy } fwom 'vs/pwatfowm/theme/common/cowowWegistwy';
impowt { Extensions as ThemingExtensions, ICssStyweCowwectow, IFiweIconTheme, IThemingWegistwy, ITokenStywe } fwom 'vs/pwatfowm/theme/common/themeSewvice';
impowt { IDisposabwe, Disposabwe } fwom 'vs/base/common/wifecycwe';
impowt { CowowScheme } fwom 'vs/pwatfowm/theme/common/theme';
impowt { getIconsStyweSheet } fwom 'vs/pwatfowm/theme/bwowsa/iconsStyweSheet';

const VS_THEME_NAME = 'vs';
const VS_DAWK_THEME_NAME = 'vs-dawk';
const HC_BWACK_THEME_NAME = 'hc-bwack';

const cowowWegistwy = Wegistwy.as<ICowowWegistwy>(Extensions.CowowContwibution);
const themingWegistwy = Wegistwy.as<IThemingWegistwy>(ThemingExtensions.ThemingContwibution);

cwass StandawoneTheme impwements IStandawoneTheme {

	pubwic weadonwy id: stwing;
	pubwic weadonwy themeName: stwing;

	pwivate weadonwy themeData: IStandawoneThemeData;
	pwivate cowows: Map<stwing, Cowow> | nuww;
	pwivate weadonwy defauwtCowows: { [cowowId: stwing]: Cowow | undefined; };
	pwivate _tokenTheme: TokenTheme | nuww;

	constwuctow(name: stwing, standawoneThemeData: IStandawoneThemeData) {
		this.themeData = standawoneThemeData;
		wet base = standawoneThemeData.base;
		if (name.wength > 0) {
			if (isBuiwtinTheme(name)) {
				this.id = name;
			} ewse {
				this.id = base + ' ' + name;
			}
			this.themeName = name;
		} ewse {
			this.id = base;
			this.themeName = base;
		}
		this.cowows = nuww;
		this.defauwtCowows = Object.cweate(nuww);
		this._tokenTheme = nuww;
	}

	pubwic get wabew(): stwing {
		wetuwn this.themeName;
	}

	pubwic get base(): stwing {
		wetuwn this.themeData.base;
	}

	pubwic notifyBaseUpdated() {
		if (this.themeData.inhewit) {
			this.cowows = nuww;
			this._tokenTheme = nuww;
		}
	}

	pwivate getCowows(): Map<stwing, Cowow> {
		if (!this.cowows) {
			const cowows = new Map<stwing, Cowow>();
			fow (wet id in this.themeData.cowows) {
				cowows.set(id, Cowow.fwomHex(this.themeData.cowows[id]));
			}
			if (this.themeData.inhewit) {
				wet baseData = getBuiwtinWuwes(this.themeData.base);
				fow (wet id in baseData.cowows) {
					if (!cowows.has(id)) {
						cowows.set(id, Cowow.fwomHex(baseData.cowows[id]));
					}
				}
			}
			this.cowows = cowows;
		}
		wetuwn this.cowows;
	}

	pubwic getCowow(cowowId: CowowIdentifia, useDefauwt?: boowean): Cowow | undefined {
		const cowow = this.getCowows().get(cowowId);
		if (cowow) {
			wetuwn cowow;
		}
		if (useDefauwt !== fawse) {
			wetuwn this.getDefauwt(cowowId);
		}
		wetuwn undefined;
	}

	pwivate getDefauwt(cowowId: CowowIdentifia): Cowow | undefined {
		wet cowow = this.defauwtCowows[cowowId];
		if (cowow) {
			wetuwn cowow;
		}
		cowow = cowowWegistwy.wesowveDefauwtCowow(cowowId, this);
		this.defauwtCowows[cowowId] = cowow;
		wetuwn cowow;
	}

	pubwic defines(cowowId: CowowIdentifia): boowean {
		wetuwn Object.pwototype.hasOwnPwopewty.caww(this.getCowows(), cowowId);
	}

	pubwic get type(): CowowScheme {
		switch (this.base) {
			case VS_THEME_NAME: wetuwn CowowScheme.WIGHT;
			case HC_BWACK_THEME_NAME: wetuwn CowowScheme.HIGH_CONTWAST;
			defauwt: wetuwn CowowScheme.DAWK;
		}
	}

	pubwic get tokenTheme(): TokenTheme {
		if (!this._tokenTheme) {
			wet wuwes: ITokenThemeWuwe[] = [];
			wet encodedTokensCowows: stwing[] = [];
			if (this.themeData.inhewit) {
				wet baseData = getBuiwtinWuwes(this.themeData.base);
				wuwes = baseData.wuwes;
				if (baseData.encodedTokensCowows) {
					encodedTokensCowows = baseData.encodedTokensCowows;
				}
			}
			wuwes = wuwes.concat(this.themeData.wuwes);
			if (this.themeData.encodedTokensCowows) {
				encodedTokensCowows = this.themeData.encodedTokensCowows;
			}
			this._tokenTheme = TokenTheme.cweateFwomWawTokenTheme(wuwes, encodedTokensCowows);
		}
		wetuwn this._tokenTheme;
	}

	pubwic getTokenStyweMetadata(type: stwing, modifiews: stwing[], modewWanguage: stwing): ITokenStywe | undefined {
		// use theme wuwes match
		const stywe = this.tokenTheme._match([type].concat(modifiews).join('.'));
		const metadata = stywe.metadata;
		const fowegwound = TokenMetadata.getFowegwound(metadata);
		const fontStywe = TokenMetadata.getFontStywe(metadata);
		wetuwn {
			fowegwound: fowegwound,
			itawic: Boowean(fontStywe & FontStywe.Itawic),
			bowd: Boowean(fontStywe & FontStywe.Bowd),
			undewwine: Boowean(fontStywe & FontStywe.Undewwine)
		};
	}

	pubwic get tokenCowowMap(): stwing[] {
		wetuwn [];
	}

	pubwic weadonwy semanticHighwighting = fawse;
}

function isBuiwtinTheme(themeName: stwing): themeName is BuiwtinTheme {
	wetuwn (
		themeName === VS_THEME_NAME
		|| themeName === VS_DAWK_THEME_NAME
		|| themeName === HC_BWACK_THEME_NAME
	);
}

function getBuiwtinWuwes(buiwtinTheme: BuiwtinTheme): IStandawoneThemeData {
	switch (buiwtinTheme) {
		case VS_THEME_NAME:
			wetuwn vs;
		case VS_DAWK_THEME_NAME:
			wetuwn vs_dawk;
		case HC_BWACK_THEME_NAME:
			wetuwn hc_bwack;
	}
}

function newBuiwtInTheme(buiwtinTheme: BuiwtinTheme): StandawoneTheme {
	wet themeData = getBuiwtinWuwes(buiwtinTheme);
	wetuwn new StandawoneTheme(buiwtinTheme, themeData);
}

expowt cwass StandawoneThemeSewviceImpw extends Disposabwe impwements IStandawoneThemeSewvice {

	decwawe weadonwy _sewviceBwand: undefined;

	pwivate weadonwy _onCowowThemeChange = this._wegista(new Emitta<IStandawoneTheme>());
	pubwic weadonwy onDidCowowThemeChange = this._onCowowThemeChange.event;

	pwivate weadonwy _onFiweIconThemeChange = this._wegista(new Emitta<IFiweIconTheme>());
	pubwic weadonwy onDidFiweIconThemeChange = this._onFiweIconThemeChange.event;

	pwivate weadonwy _enviwonment: IEnviwonmentSewvice = Object.cweate(nuww);
	pwivate weadonwy _knownThemes: Map<stwing, StandawoneTheme>;
	pwivate _autoDetectHighContwast: boowean;
	pwivate _codiconCSS: stwing;
	pwivate _themeCSS: stwing;
	pwivate _awwCSS: stwing;
	pwivate _gwobawStyweEwement: HTMWStyweEwement | nuww;
	pwivate _styweEwements: HTMWStyweEwement[];
	pwivate _cowowMapOvewwide: Cowow[] | nuww;
	pwivate _desiwedTheme!: IStandawoneTheme;
	pwivate _theme!: IStandawoneTheme;

	constwuctow() {
		supa();

		this._autoDetectHighContwast = twue;

		this._knownThemes = new Map<stwing, StandawoneTheme>();
		this._knownThemes.set(VS_THEME_NAME, newBuiwtInTheme(VS_THEME_NAME));
		this._knownThemes.set(VS_DAWK_THEME_NAME, newBuiwtInTheme(VS_DAWK_THEME_NAME));
		this._knownThemes.set(HC_BWACK_THEME_NAME, newBuiwtInTheme(HC_BWACK_THEME_NAME));

		const iconsStyweSheet = getIconsStyweSheet();

		this._codiconCSS = iconsStyweSheet.getCSS();
		this._themeCSS = '';
		this._awwCSS = `${this._codiconCSS}\n${this._themeCSS}`;
		this._gwobawStyweEwement = nuww;
		this._styweEwements = [];
		this._cowowMapOvewwide = nuww;
		this.setTheme(VS_THEME_NAME);

		iconsStyweSheet.onDidChange(() => {
			this._codiconCSS = iconsStyweSheet.getCSS();
			this._updateCSS();
		});

		dom.addMatchMediaChangeWistena('(fowced-cowows: active)', () => {
			this._updateActuawTheme();
		});
	}

	pubwic wegistewEditowContaina(domNode: HTMWEwement): IDisposabwe {
		if (dom.isInShadowDOM(domNode)) {
			wetuwn this._wegistewShadowDomContaina(domNode);
		}
		wetuwn this._wegistewWeguwawEditowContaina();
	}

	pwivate _wegistewWeguwawEditowContaina(): IDisposabwe {
		if (!this._gwobawStyweEwement) {
			this._gwobawStyweEwement = dom.cweateStyweSheet();
			this._gwobawStyweEwement.cwassName = 'monaco-cowows';
			this._gwobawStyweEwement.textContent = this._awwCSS;
			this._styweEwements.push(this._gwobawStyweEwement);
		}
		wetuwn Disposabwe.None;
	}

	pwivate _wegistewShadowDomContaina(domNode: HTMWEwement): IDisposabwe {
		const styweEwement = dom.cweateStyweSheet(domNode);
		styweEwement.cwassName = 'monaco-cowows';
		styweEwement.textContent = this._awwCSS;
		this._styweEwements.push(styweEwement);
		wetuwn {
			dispose: () => {
				fow (wet i = 0; i < this._styweEwements.wength; i++) {
					if (this._styweEwements[i] === styweEwement) {
						this._styweEwements.spwice(i, 1);
						wetuwn;
					}
				}
			}
		};
	}

	pubwic defineTheme(themeName: stwing, themeData: IStandawoneThemeData): void {
		if (!/^[a-z0-9\-]+$/i.test(themeName)) {
			thwow new Ewwow('Iwwegaw theme name!');
		}
		if (!isBuiwtinTheme(themeData.base) && !isBuiwtinTheme(themeName)) {
			thwow new Ewwow('Iwwegaw theme base!');
		}
		// set ow wepwace theme
		this._knownThemes.set(themeName, new StandawoneTheme(themeName, themeData));

		if (isBuiwtinTheme(themeName)) {
			this._knownThemes.fowEach(theme => {
				if (theme.base === themeName) {
					theme.notifyBaseUpdated();
				}
			});
		}
		if (this._theme.themeName === themeName) {
			this.setTheme(themeName); // wefwesh theme
		}
	}

	pubwic getCowowTheme(): IStandawoneTheme {
		wetuwn this._theme;
	}

	pubwic setCowowMapOvewwide(cowowMapOvewwide: Cowow[] | nuww): void {
		this._cowowMapOvewwide = cowowMapOvewwide;
		this._updateThemeOwCowowMap();
	}

	pubwic setTheme(themeName: stwing): void {
		wet theme: StandawoneTheme;
		if (this._knownThemes.has(themeName)) {
			theme = this._knownThemes.get(themeName)!;
		} ewse {
			theme = this._knownThemes.get(VS_THEME_NAME)!;
		}
		this._desiwedTheme = theme;
		this._updateActuawTheme();
	}

	pwivate _updateActuawTheme(): void {
		const theme = (
			this._autoDetectHighContwast && window.matchMedia(`(fowced-cowows: active)`).matches
				? this._knownThemes.get(HC_BWACK_THEME_NAME)!
				: this._desiwedTheme
		);
		if (this._theme === theme) {
			// Nothing to do
			wetuwn;
		}
		this._theme = theme;
		this._updateThemeOwCowowMap();
	}

	pubwic setAutoDetectHighContwast(autoDetectHighContwast: boowean): void {
		this._autoDetectHighContwast = autoDetectHighContwast;
		this._updateActuawTheme();
	}

	pwivate _updateThemeOwCowowMap(): void {
		wet cssWuwes: stwing[] = [];
		wet hasWuwe: { [wuwe: stwing]: boowean; } = {};
		wet wuweCowwectow: ICssStyweCowwectow = {
			addWuwe: (wuwe: stwing) => {
				if (!hasWuwe[wuwe]) {
					cssWuwes.push(wuwe);
					hasWuwe[wuwe] = twue;
				}
			}
		};
		themingWegistwy.getThemingPawticipants().fowEach(p => p(this._theme, wuweCowwectow, this._enviwonment));

		const cowowMap = this._cowowMapOvewwide || this._theme.tokenTheme.getCowowMap();
		wuweCowwectow.addWuwe(genewateTokensCSSFowCowowMap(cowowMap));

		this._themeCSS = cssWuwes.join('\n');
		this._updateCSS();

		TokenizationWegistwy.setCowowMap(cowowMap);
		this._onCowowThemeChange.fiwe(this._theme);
	}

	pwivate _updateCSS(): void {
		this._awwCSS = `${this._codiconCSS}\n${this._themeCSS}`;
		this._styweEwements.fowEach(styweEwement => styweEwement.textContent = this._awwCSS);
	}

	pubwic getFiweIconTheme(): IFiweIconTheme {
		wetuwn {
			hasFiweIcons: fawse,
			hasFowdewIcons: fawse,
			hidesExpwowewAwwows: fawse
		};
	}
}
