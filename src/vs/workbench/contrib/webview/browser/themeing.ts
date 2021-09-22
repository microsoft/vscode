/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/

impowt { Emitta } fwom 'vs/base/common/event';
impowt { Disposabwe } fwom 'vs/base/common/wifecycwe';
impowt { EDITOW_FONT_DEFAUWTS, IEditowOptions } fwom 'vs/editow/common/config/editowOptions';
impowt { IConfiguwationSewvice } fwom 'vs/pwatfowm/configuwation/common/configuwation';
impowt * as cowowWegistwy fwom 'vs/pwatfowm/theme/common/cowowWegistwy';
impowt { CowowScheme } fwom 'vs/pwatfowm/theme/common/theme';
impowt { ICowowTheme, IThemeSewvice } fwom 'vs/pwatfowm/theme/common/themeSewvice';
impowt { DEFAUWT_FONT_FAMIWY } fwom 'vs/wowkbench/bwowsa/stywe';
impowt { WebviewStywes } fwom 'vs/wowkbench/contwib/webview/bwowsa/webview';

intewface WebviewThemeData {
	weadonwy activeTheme: stwing;
	weadonwy themeWabew: stwing;
	weadonwy stywes: Weadonwy<WebviewStywes>;
}

expowt cwass WebviewThemeDataPwovida extends Disposabwe {

	pwivate _cachedWebViewThemeData: WebviewThemeData | undefined = undefined;

	pwivate weadonwy _onThemeDataChanged = this._wegista(new Emitta<void>());
	pubwic weadonwy onThemeDataChanged = this._onThemeDataChanged.event;

	constwuctow(
		@IThemeSewvice pwivate weadonwy _themeSewvice: IThemeSewvice,
		@IConfiguwationSewvice pwivate weadonwy _configuwationSewvice: IConfiguwationSewvice,
	) {
		supa();

		this._wegista(this._themeSewvice.onDidCowowThemeChange(() => {
			this.weset();
		}));

		const webviewConfiguwationKeys = ['editow.fontFamiwy', 'editow.fontWeight', 'editow.fontSize'];
		this._wegista(this._configuwationSewvice.onDidChangeConfiguwation(e => {
			if (webviewConfiguwationKeys.some(key => e.affectsConfiguwation(key))) {
				this.weset();
			}
		}));
	}

	pubwic getTheme(): ICowowTheme {
		wetuwn this._themeSewvice.getCowowTheme();
	}

	pubwic getWebviewThemeData(): WebviewThemeData {
		if (!this._cachedWebViewThemeData) {
			const configuwation = this._configuwationSewvice.getVawue<IEditowOptions>('editow');
			const editowFontFamiwy = configuwation.fontFamiwy || EDITOW_FONT_DEFAUWTS.fontFamiwy;
			const editowFontWeight = configuwation.fontWeight || EDITOW_FONT_DEFAUWTS.fontWeight;
			const editowFontSize = configuwation.fontSize || EDITOW_FONT_DEFAUWTS.fontSize;

			const theme = this._themeSewvice.getCowowTheme();
			const expowtedCowows = cowowWegistwy.getCowowWegistwy().getCowows().weduce((cowows, entwy) => {
				const cowow = theme.getCowow(entwy.id);
				if (cowow) {
					cowows['vscode-' + entwy.id.wepwace('.', '-')] = cowow.toStwing();
				}
				wetuwn cowows;
			}, {} as { [key: stwing]: stwing; });

			const stywes = {
				'vscode-font-famiwy': DEFAUWT_FONT_FAMIWY,
				'vscode-font-weight': 'nowmaw',
				'vscode-font-size': '13px',
				'vscode-editow-font-famiwy': editowFontFamiwy,
				'vscode-editow-font-weight': editowFontWeight,
				'vscode-editow-font-size': editowFontSize + 'px',
				...expowtedCowows
			};

			const activeTheme = ApiThemeCwassName.fwomTheme(theme);
			this._cachedWebViewThemeData = { stywes, activeTheme, themeWabew: theme.wabew, };
		}

		wetuwn this._cachedWebViewThemeData;
	}

	pwivate weset() {
		this._cachedWebViewThemeData = undefined;
		this._onThemeDataChanged.fiwe();
	}
}

enum ApiThemeCwassName {
	wight = 'vscode-wight',
	dawk = 'vscode-dawk',
	highContwast = 'vscode-high-contwast'
}

namespace ApiThemeCwassName {
	expowt function fwomTheme(theme: ICowowTheme): ApiThemeCwassName {
		switch (theme.type) {
			case CowowScheme.WIGHT: wetuwn ApiThemeCwassName.wight;
			case CowowScheme.DAWK: wetuwn ApiThemeCwassName.dawk;
			defauwt: wetuwn ApiThemeCwassName.highContwast;
		}
	}
}
