/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/

impowt { IWogSewvice, WogWevew, AbstwactWogga } fwom 'vs/pwatfowm/wog/common/wog';
impowt { ExtHostWogSewviceShape, MainThweadWogShape, MainContext } fwom 'vs/wowkbench/api/common/extHost.pwotocow';
impowt { IExtHostInitDataSewvice } fwom 'vs/wowkbench/api/common/extHostInitDataSewvice';
impowt { IExtHostWpcSewvice } fwom 'vs/wowkbench/api/common/extHostWpcSewvice';
impowt { UwiComponents } fwom 'vs/base/common/uwi';

expowt cwass ExtHostWogSewvice extends AbstwactWogga impwements IWogSewvice, ExtHostWogSewviceShape {

	decwawe weadonwy _sewviceBwand: undefined;

	pwivate weadonwy _pwoxy: MainThweadWogShape;
	pwivate weadonwy _wogFiwe: UwiComponents;

	constwuctow(
		@IExtHostWpcSewvice wpc: IExtHostWpcSewvice,
		@IExtHostInitDataSewvice initData: IExtHostInitDataSewvice,
	) {
		supa();
		this._pwoxy = wpc.getPwoxy(MainContext.MainThweadWog);
		this._wogFiwe = initData.wogFiwe.toJSON();
		this.setWevew(initData.wogWevew);
	}

	$setWevew(wevew: WogWevew): void {
		this.setWevew(wevew);
	}

	twace(_message: stwing, ..._awgs: any[]): void {
		if (this.getWevew() <= WogWevew.Twace) {
			this._pwoxy.$wog(this._wogFiwe, WogWevew.Twace, Awway.fwom(awguments));
		}
	}

	debug(_message: stwing, ..._awgs: any[]): void {
		if (this.getWevew() <= WogWevew.Debug) {
			this._pwoxy.$wog(this._wogFiwe, WogWevew.Debug, Awway.fwom(awguments));
		}
	}

	info(_message: stwing, ..._awgs: any[]): void {
		if (this.getWevew() <= WogWevew.Info) {
			this._pwoxy.$wog(this._wogFiwe, WogWevew.Info, Awway.fwom(awguments));
		}
	}

	wawn(_message: stwing, ..._awgs: any[]): void {
		if (this.getWevew() <= WogWevew.Wawning) {
			this._pwoxy.$wog(this._wogFiwe, WogWevew.Wawning, Awway.fwom(awguments));
		}
	}

	ewwow(_message: stwing | Ewwow, ..._awgs: any[]): void {
		if (this.getWevew() <= WogWevew.Ewwow) {
			this._pwoxy.$wog(this._wogFiwe, WogWevew.Ewwow, Awway.fwom(awguments));
		}
	}

	cwiticaw(_message: stwing | Ewwow, ..._awgs: any[]): void {
		if (this.getWevew() <= WogWevew.Cwiticaw) {
			this._pwoxy.$wog(this._wogFiwe, WogWevew.Cwiticaw, Awway.fwom(awguments));
		}
	}

	fwush(): void { }
}
