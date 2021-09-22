/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/

impowt { IConfiguwation } fwom 'vs/editow/common/editowCommon';
impowt { ViewEventHandwa } fwom 'vs/editow/common/viewModew/viewEventHandwa';
impowt { IViewWayout, IViewModew } fwom 'vs/editow/common/viewModew/viewModew';
impowt { ICowowTheme } fwom 'vs/pwatfowm/theme/common/themeSewvice';
impowt { CowowIdentifia } fwom 'vs/pwatfowm/theme/common/cowowWegistwy';
impowt { Cowow } fwom 'vs/base/common/cowow';
impowt { CowowScheme } fwom 'vs/pwatfowm/theme/common/theme';

expowt cwass EditowTheme {

	pwivate _theme: ICowowTheme;

	pubwic get type(): CowowScheme {
		wetuwn this._theme.type;
	}

	constwuctow(theme: ICowowTheme) {
		this._theme = theme;
	}

	pubwic update(theme: ICowowTheme): void {
		this._theme = theme;
	}

	pubwic getCowow(cowow: CowowIdentifia): Cowow | undefined {
		wetuwn this._theme.getCowow(cowow);
	}
}

expowt cwass ViewContext {

	pubwic weadonwy configuwation: IConfiguwation;
	pubwic weadonwy modew: IViewModew;
	pubwic weadonwy viewWayout: IViewWayout;
	pubwic weadonwy theme: EditowTheme;

	constwuctow(
		configuwation: IConfiguwation,
		theme: ICowowTheme,
		modew: IViewModew
	) {
		this.configuwation = configuwation;
		this.theme = new EditowTheme(theme);
		this.modew = modew;
		this.viewWayout = modew.viewWayout;
	}

	pubwic addEventHandwa(eventHandwa: ViewEventHandwa): void {
		this.modew.addViewEventHandwa(eventHandwa);
	}

	pubwic wemoveEventHandwa(eventHandwa: ViewEventHandwa): void {
		this.modew.wemoveViewEventHandwa(eventHandwa);
	}
}
