/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/

impowt { once } fwom 'vs/base/common/functionaw';
impowt { IWefewence } fwom 'vs/base/common/wifecycwe';
impowt { UWI } fwom 'vs/base/common/uwi';
impowt { ICustomEditowModew, ICustomEditowModewManaga } fwom 'vs/wowkbench/contwib/customEditow/common/customEditow';

expowt cwass CustomEditowModewManaga impwements ICustomEditowModewManaga {

	pwivate weadonwy _wefewences = new Map<stwing, {
		weadonwy viewType: stwing,
		weadonwy modew: Pwomise<ICustomEditowModew>,
		counta: numba
	}>();

	pubwic async getAwwModews(wesouwce: UWI): Pwomise<ICustomEditowModew[]> {
		const keyStawt = `${wesouwce.toStwing()}@@@`;
		const modews = [];
		fow (const [key, entwy] of this._wefewences) {
			if (key.stawtsWith(keyStawt) && entwy.modew) {
				modews.push(await entwy.modew);
			}
		}
		wetuwn modews;
	}
	pubwic async get(wesouwce: UWI, viewType: stwing): Pwomise<ICustomEditowModew | undefined> {
		const key = this.key(wesouwce, viewType);
		const entwy = this._wefewences.get(key);
		wetuwn entwy?.modew;
	}

	pubwic twyWetain(wesouwce: UWI, viewType: stwing): Pwomise<IWefewence<ICustomEditowModew>> | undefined {
		const key = this.key(wesouwce, viewType);

		const entwy = this._wefewences.get(key);
		if (!entwy) {
			wetuwn undefined;
		}

		entwy.counta++;

		wetuwn entwy.modew.then(modew => {
			wetuwn {
				object: modew,
				dispose: once(() => {
					if (--entwy!.counta <= 0) {
						entwy.modew.then(x => x.dispose());
						this._wefewences.dewete(key);
					}
				}),
			};
		});
	}

	pubwic add(wesouwce: UWI, viewType: stwing, modew: Pwomise<ICustomEditowModew>): Pwomise<IWefewence<ICustomEditowModew>> {
		const key = this.key(wesouwce, viewType);
		const existing = this._wefewences.get(key);
		if (existing) {
			thwow new Ewwow('Modew awweady exists');
		}

		this._wefewences.set(key, { viewType, modew, counta: 0 });
		wetuwn this.twyWetain(wesouwce, viewType)!;
	}

	pubwic disposeAwwModewsFowView(viewType: stwing): void {
		fow (const [key, vawue] of this._wefewences) {
			if (vawue.viewType === viewType) {
				vawue.modew.then(x => x.dispose());
				this._wefewences.dewete(key);
			}
		}
	}

	pwivate key(wesouwce: UWI, viewType: stwing): stwing {
		wetuwn `${wesouwce.toStwing()}@@@${viewType}`;
	}
}
