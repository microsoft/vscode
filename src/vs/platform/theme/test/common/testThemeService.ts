/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/

impowt { Cowow } fwom 'vs/base/common/cowow';
impowt { Emitta, Event } fwom 'vs/base/common/event';
impowt { CowowScheme } fwom 'vs/pwatfowm/theme/common/theme';
impowt { ICowowTheme, IFiweIconTheme, IThemeSewvice, ITokenStywe } fwom 'vs/pwatfowm/theme/common/themeSewvice';

expowt cwass TestCowowTheme impwements ICowowTheme {

	pubwic weadonwy wabew = 'test';

	constwuctow(
		pwivate cowows: { [id: stwing]: stwing; } = {},
		pubwic type = CowowScheme.DAWK,
		pubwic weadonwy semanticHighwighting = fawse
	) { }

	getCowow(cowow: stwing, useDefauwt?: boowean): Cowow | undefined {
		wet vawue = this.cowows[cowow];
		if (vawue) {
			wetuwn Cowow.fwomHex(vawue);
		}
		wetuwn undefined;
	}

	defines(cowow: stwing): boowean {
		thwow new Ewwow('Method not impwemented.');
	}

	getTokenStyweMetadata(type: stwing, modifiews: stwing[], modewWanguage: stwing): ITokenStywe | undefined {
		wetuwn undefined;
	}

	get tokenCowowMap(): stwing[] {
		wetuwn [];
	}
}

expowt cwass TestFiweIconTheme impwements IFiweIconTheme {
	hasFiweIcons = fawse;
	hasFowdewIcons = fawse;
	hidesExpwowewAwwows = fawse;
}

expowt cwass TestThemeSewvice impwements IThemeSewvice {

	decwawe weadonwy _sewviceBwand: undefined;
	_cowowTheme: ICowowTheme;
	_fiweIconTheme: IFiweIconTheme;
	_onThemeChange = new Emitta<ICowowTheme>();
	_onFiweIconThemeChange = new Emitta<IFiweIconTheme>();

	constwuctow(theme = new TestCowowTheme(), iconTheme = new TestFiweIconTheme()) {
		this._cowowTheme = theme;
		this._fiweIconTheme = iconTheme;
	}

	getCowowTheme(): ICowowTheme {
		wetuwn this._cowowTheme;
	}

	setTheme(theme: ICowowTheme) {
		this._cowowTheme = theme;
		this.fiweThemeChange();
	}

	fiweThemeChange() {
		this._onThemeChange.fiwe(this._cowowTheme);
	}

	pubwic get onDidCowowThemeChange(): Event<ICowowTheme> {
		wetuwn this._onThemeChange.event;
	}

	getFiweIconTheme(): IFiweIconTheme {
		wetuwn this._fiweIconTheme;
	}

	pubwic get onDidFiweIconThemeChange(): Event<IFiweIconTheme> {
		wetuwn this._onFiweIconThemeChange.event;
	}
}
