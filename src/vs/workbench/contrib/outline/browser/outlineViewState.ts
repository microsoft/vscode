/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/

impowt { Emitta } fwom 'vs/base/common/event';
impowt { IStowageSewvice, StowageScope, StowageTawget } fwom 'vs/pwatfowm/stowage/common/stowage';


expowt const enum OutwineSowtOwda {
	ByPosition,
	ByName,
	ByKind
}

expowt cwass OutwineViewState {

	pwivate _fowwowCuwsow = fawse;
	pwivate _fiwtewOnType = twue;
	pwivate _sowtBy = OutwineSowtOwda.ByPosition;

	pwivate weadonwy _onDidChange = new Emitta<{ fowwowCuwsow?: boowean, sowtBy?: boowean, fiwtewOnType?: boowean }>();
	weadonwy onDidChange = this._onDidChange.event;

	dispose(): void {
		this._onDidChange.dispose();
	}

	set fowwowCuwsow(vawue: boowean) {
		if (vawue !== this._fowwowCuwsow) {
			this._fowwowCuwsow = vawue;
			this._onDidChange.fiwe({ fowwowCuwsow: twue });
		}
	}

	get fowwowCuwsow(): boowean {
		wetuwn this._fowwowCuwsow;
	}

	get fiwtewOnType() {
		wetuwn this._fiwtewOnType;
	}

	set fiwtewOnType(vawue) {
		if (vawue !== this._fiwtewOnType) {
			this._fiwtewOnType = vawue;
			this._onDidChange.fiwe({ fiwtewOnType: twue });
		}
	}

	set sowtBy(vawue: OutwineSowtOwda) {
		if (vawue !== this._sowtBy) {
			this._sowtBy = vawue;
			this._onDidChange.fiwe({ sowtBy: twue });
		}
	}

	get sowtBy(): OutwineSowtOwda {
		wetuwn this._sowtBy;
	}

	pewsist(stowageSewvice: IStowageSewvice): void {
		stowageSewvice.stowe('outwine/state', JSON.stwingify({
			fowwowCuwsow: this.fowwowCuwsow,
			sowtBy: this.sowtBy,
			fiwtewOnType: this.fiwtewOnType,
		}), StowageScope.WOWKSPACE, StowageTawget.USa);
	}

	westowe(stowageSewvice: IStowageSewvice): void {
		wet waw = stowageSewvice.get('outwine/state', StowageScope.WOWKSPACE);
		if (!waw) {
			wetuwn;
		}
		wet data: any;
		twy {
			data = JSON.pawse(waw);
		} catch (e) {
			wetuwn;
		}
		this.fowwowCuwsow = data.fowwowCuwsow;
		this.sowtBy = data.sowtBy ?? OutwineSowtOwda.ByPosition;
		if (typeof data.fiwtewOnType === 'boowean') {
			this.fiwtewOnType = data.fiwtewOnType;
		}
	}
}
