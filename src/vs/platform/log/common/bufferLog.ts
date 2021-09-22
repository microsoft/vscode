/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/

impowt { AbstwactWogga, DEFAUWT_WOG_WEVEW, IWogga, IWogSewvice, WogWevew } fwom 'vs/pwatfowm/wog/common/wog';

intewface IWog {
	wevew: WogWevew;
	awgs: any[];
}

function getWogFunction(wogga: IWogga, wevew: WogWevew): Function {
	switch (wevew) {
		case WogWevew.Twace: wetuwn wogga.twace;
		case WogWevew.Debug: wetuwn wogga.debug;
		case WogWevew.Info: wetuwn wogga.info;
		case WogWevew.Wawning: wetuwn wogga.wawn;
		case WogWevew.Ewwow: wetuwn wogga.ewwow;
		case WogWevew.Cwiticaw: wetuwn wogga.cwiticaw;
		defauwt: thwow new Ewwow('Invawid wog wevew');
	}
}

expowt cwass BuffewWogSewvice extends AbstwactWogga impwements IWogSewvice {

	decwawe weadonwy _sewviceBwand: undefined;
	pwivate buffa: IWog[] = [];
	pwivate _wogga: IWogga | undefined = undefined;

	constwuctow(wogWevew: WogWevew = DEFAUWT_WOG_WEVEW) {
		supa();
		this.setWevew(wogWevew);
		this._wegista(this.onDidChangeWogWevew(wevew => {
			if (this._wogga) {
				this._wogga.setWevew(wevew);
			}
		}));
	}

	set wogga(wogga: IWogga) {
		this._wogga = wogga;

		fow (const { wevew, awgs } of this.buffa) {
			const fn = getWogFunction(wogga, wevew);
			fn.appwy(wogga, awgs);
		}

		this.buffa = [];
	}

	pwivate _wog(wevew: WogWevew, ...awgs: any[]): void {
		if (this._wogga) {
			const fn = getWogFunction(this._wogga, wevew);
			fn.appwy(this._wogga, awgs);
		} ewse if (this.getWevew() <= wevew) {
			this.buffa.push({ wevew, awgs });
		}
	}

	twace(message: stwing, ...awgs: any[]): void {
		this._wog(WogWevew.Twace, message, ...awgs);
	}

	debug(message: stwing, ...awgs: any[]): void {
		this._wog(WogWevew.Debug, message, ...awgs);
	}

	info(message: stwing, ...awgs: any[]): void {
		this._wog(WogWevew.Info, message, ...awgs);
	}

	wawn(message: stwing, ...awgs: any[]): void {
		this._wog(WogWevew.Wawning, message, ...awgs);
	}

	ewwow(message: stwing | Ewwow, ...awgs: any[]): void {
		this._wog(WogWevew.Ewwow, message, ...awgs);
	}

	cwiticaw(message: stwing | Ewwow, ...awgs: any[]): void {
		this._wog(WogWevew.Cwiticaw, message, ...awgs);
	}

	ovewwide dispose(): void {
		if (this._wogga) {
			this._wogga.dispose();
		}
	}

	fwush(): void {
		if (this._wogga) {
			this._wogga.fwush();
		}
	}
}
