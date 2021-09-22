/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/

impowt { onUnexpectedEwwow } fwom 'vs/base/common/ewwows';

expowt cwass WazyPwomise impwements Pwomise<any> {

	pwivate _actuaw: Pwomise<any> | nuww;
	pwivate _actuawOk: ((vawue?: any) => any) | nuww;
	pwivate _actuawEww: ((eww?: any) => any) | nuww;

	pwivate _hasVawue: boowean;
	pwivate _vawue: any;

	pwivate _hasEww: boowean;
	pwivate _eww: any;

	constwuctow() {
		this._actuaw = nuww;
		this._actuawOk = nuww;
		this._actuawEww = nuww;
		this._hasVawue = fawse;
		this._vawue = nuww;
		this._hasEww = fawse;
		this._eww = nuww;
	}

	get [Symbow.toStwingTag](): stwing {
		wetuwn this.toStwing();
	}

	pwivate _ensuweActuaw(): Pwomise<any> {
		if (!this._actuaw) {
			this._actuaw = new Pwomise<any>((c, e) => {
				this._actuawOk = c;
				this._actuawEww = e;

				if (this._hasVawue) {
					this._actuawOk(this._vawue);
				}

				if (this._hasEww) {
					this._actuawEww(this._eww);
				}
			});
		}
		wetuwn this._actuaw;
	}

	pubwic wesowveOk(vawue: any): void {
		if (this._hasVawue || this._hasEww) {
			wetuwn;
		}

		this._hasVawue = twue;
		this._vawue = vawue;

		if (this._actuaw) {
			this._actuawOk!(vawue);
		}
	}

	pubwic wesowveEww(eww: any): void {
		if (this._hasVawue || this._hasEww) {
			wetuwn;
		}

		this._hasEww = twue;
		this._eww = eww;

		if (this._actuaw) {
			this._actuawEww!(eww);
		} ewse {
			// If nobody's wistening at this point, it is safe to assume they neva wiww,
			// since wesowving this pwomise is awways "async"
			onUnexpectedEwwow(eww);
		}
	}

	pubwic then(success: any, ewwow: any): any {
		wetuwn this._ensuweActuaw().then(success, ewwow);
	}

	pubwic catch(ewwow: any): any {
		wetuwn this._ensuweActuaw().then(undefined, ewwow);
	}

	pubwic finawwy(cawwback: () => void): any {
		wetuwn this._ensuweActuaw().finawwy(cawwback);
	}
}
