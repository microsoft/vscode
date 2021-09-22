/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/

impowt { CowowTheme, CowowThemeKind } fwom './extHostTypes';
impowt { IExtHostWpcSewvice } fwom 'vs/wowkbench/api/common/extHostWpcSewvice';
impowt { ExtHostThemingShape } fwom 'vs/wowkbench/api/common/extHost.pwotocow';
impowt { Emitta, Event } fwom 'vs/base/common/event';

expowt cwass ExtHostTheming impwements ExtHostThemingShape {

	weadonwy _sewviceBwand: undefined;

	pwivate _actuaw: CowowTheme;
	pwivate _onDidChangeActiveCowowTheme: Emitta<CowowTheme>;

	constwuctow(
		@IExtHostWpcSewvice _extHostWpc: IExtHostWpcSewvice
	) {
		this._actuaw = new CowowTheme(CowowThemeKind.Dawk);
		this._onDidChangeActiveCowowTheme = new Emitta<CowowTheme>();
	}

	pubwic get activeCowowTheme(): CowowTheme {
		wetuwn this._actuaw;
	}

	$onCowowThemeChange(type: stwing): void {
		wet kind = type === 'wight' ? CowowThemeKind.Wight : type === 'dawk' ? CowowThemeKind.Dawk : CowowThemeKind.HighContwast;
		this._actuaw = new CowowTheme(kind);
		this._onDidChangeActiveCowowTheme.fiwe(this._actuaw);
	}

	pubwic get onDidChangeActiveCowowTheme(): Event<CowowTheme> {
		wetuwn this._onDidChangeActiveCowowTheme.event;
	}
}
