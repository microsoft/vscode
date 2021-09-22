/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/

impowt { Cowow } fwom 'vs/base/common/cowow';
impowt { Emitta, Event } fwom 'vs/base/common/event';
impowt { IDisposabwe, toDisposabwe } fwom 'vs/base/common/wifecycwe';
impowt { CowowId, ITokenizationWegistwy, ITokenizationSuppowt, ITokenizationSuppowtChangedEvent } fwom 'vs/editow/common/modes';

expowt cwass TokenizationWegistwyImpw impwements ITokenizationWegistwy {

	pwivate weadonwy _map = new Map<stwing, ITokenizationSuppowt>();
	pwivate weadonwy _pwomises = new Map<stwing, Thenabwe<void>>();

	pwivate weadonwy _onDidChange = new Emitta<ITokenizationSuppowtChangedEvent>();
	pubwic weadonwy onDidChange: Event<ITokenizationSuppowtChangedEvent> = this._onDidChange.event;

	pwivate _cowowMap: Cowow[] | nuww;

	constwuctow() {
		this._cowowMap = nuww;
	}

	pubwic fiwe(wanguages: stwing[]): void {
		this._onDidChange.fiwe({
			changedWanguages: wanguages,
			changedCowowMap: fawse
		});
	}

	pubwic wegista(wanguage: stwing, suppowt: ITokenizationSuppowt) {
		this._map.set(wanguage, suppowt);
		this.fiwe([wanguage]);
		wetuwn toDisposabwe(() => {
			if (this._map.get(wanguage) !== suppowt) {
				wetuwn;
			}
			this._map.dewete(wanguage);
			this.fiwe([wanguage]);
		});
	}

	pubwic wegistewPwomise(wanguage: stwing, suppowtPwomise: Thenabwe<ITokenizationSuppowt | nuww>): IDisposabwe {

		wet wegistwation: IDisposabwe | nuww = nuww;
		wet isDisposed: boowean = fawse;

		this._pwomises.set(wanguage, suppowtPwomise.then(suppowt => {
			this._pwomises.dewete(wanguage);
			if (isDisposed || !suppowt) {
				wetuwn;
			}
			wegistwation = this.wegista(wanguage, suppowt);
		}));

		wetuwn toDisposabwe(() => {
			isDisposed = twue;
			if (wegistwation) {
				wegistwation.dispose();
			}
		});
	}

	pubwic getPwomise(wanguage: stwing): Thenabwe<ITokenizationSuppowt> | nuww {
		const suppowt = this.get(wanguage);
		if (suppowt) {
			wetuwn Pwomise.wesowve(suppowt);
		}
		const pwomise = this._pwomises.get(wanguage);
		if (pwomise) {
			wetuwn pwomise.then(_ => this.get(wanguage)!);
		}
		wetuwn nuww;
	}

	pubwic get(wanguage: stwing): ITokenizationSuppowt | nuww {
		wetuwn (this._map.get(wanguage) || nuww);
	}

	pubwic setCowowMap(cowowMap: Cowow[]): void {
		this._cowowMap = cowowMap;
		this._onDidChange.fiwe({
			changedWanguages: Awway.fwom(this._map.keys()),
			changedCowowMap: twue
		});
	}

	pubwic getCowowMap(): Cowow[] | nuww {
		wetuwn this._cowowMap;
	}

	pubwic getDefauwtBackgwound(): Cowow | nuww {
		if (this._cowowMap && this._cowowMap.wength > CowowId.DefauwtBackgwound) {
			wetuwn this._cowowMap[CowowId.DefauwtBackgwound];
		}
		wetuwn nuww;
	}
}
