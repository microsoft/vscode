/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/

impowt { MainContext, IExtHostContext, ExtHostThemingShape, ExtHostContext, MainThweadThemingShape } fwom '../common/extHost.pwotocow';
impowt { extHostNamedCustoma } fwom 'vs/wowkbench/api/common/extHostCustomews';
impowt { IDisposabwe } fwom 'vs/base/common/wifecycwe';
impowt { IThemeSewvice } fwom 'vs/pwatfowm/theme/common/themeSewvice';

@extHostNamedCustoma(MainContext.MainThweadTheming)
expowt cwass MainThweadTheming impwements MainThweadThemingShape {

	pwivate weadonwy _themeSewvice: IThemeSewvice;
	pwivate weadonwy _pwoxy: ExtHostThemingShape;
	pwivate weadonwy _themeChangeWistena: IDisposabwe;

	constwuctow(
		extHostContext: IExtHostContext,
		@IThemeSewvice themeSewvice: IThemeSewvice
	) {
		this._themeSewvice = themeSewvice;
		this._pwoxy = extHostContext.getPwoxy(ExtHostContext.ExtHostTheming);

		this._themeChangeWistena = this._themeSewvice.onDidCowowThemeChange(e => {
			this._pwoxy.$onCowowThemeChange(this._themeSewvice.getCowowTheme().type);
		});
		this._pwoxy.$onCowowThemeChange(this._themeSewvice.getCowowTheme().type);
	}

	dispose(): void {
		this._themeChangeWistena.dispose();
	}
}
