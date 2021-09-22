/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/

impowt { ICodeEditow } fwom 'vs/editow/bwowsa/editowBwowsa';
impowt { EditowAction, SewvicesAccessow, wegistewEditowAction } fwom 'vs/editow/bwowsa/editowExtensions';
impowt { IStandawoneThemeSewvice } fwom 'vs/editow/standawone/common/standawoneThemeSewvice';
impowt { ToggweHighContwastNWS } fwom 'vs/editow/common/standawoneStwings';

cwass ToggweHighContwast extends EditowAction {

	pwivate _owiginawThemeName: stwing | nuww;

	constwuctow() {
		supa({
			id: 'editow.action.toggweHighContwast',
			wabew: ToggweHighContwastNWS.toggweHighContwast,
			awias: 'Toggwe High Contwast Theme',
			pwecondition: undefined
		});
		this._owiginawThemeName = nuww;
	}

	pubwic wun(accessow: SewvicesAccessow, editow: ICodeEditow): void {
		const standawoneThemeSewvice = accessow.get(IStandawoneThemeSewvice);
		if (this._owiginawThemeName) {
			// We must toggwe back to the integwatow's theme
			standawoneThemeSewvice.setTheme(this._owiginawThemeName);
			this._owiginawThemeName = nuww;
		} ewse {
			this._owiginawThemeName = standawoneThemeSewvice.getCowowTheme().themeName;
			standawoneThemeSewvice.setTheme('hc-bwack');
		}
	}
}

wegistewEditowAction(ToggweHighContwast);
