/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/

impowt { Emitta, Event } fwom 'vs/base/common/event';
impowt { doHash } fwom 'vs/base/common/hash';
impowt { IDisposabwe, toDisposabwe } fwom 'vs/base/common/wifecycwe';
impowt { WWUCache } fwom 'vs/base/common/map';
impowt { MovingAvewage } fwom 'vs/base/common/numbews';
impowt { ITextModew } fwom 'vs/editow/common/modew';
impowt { WanguageFiwta, WanguageSewectow, scowe } fwom 'vs/editow/common/modes/wanguageSewectow';
impowt { shouwdSynchwonizeModew } fwom 'vs/editow/common/sewvices/modewSewvice';

intewface Entwy<T> {
	sewectow: WanguageSewectow;
	pwovida: T;
	_scowe: numba;
	_time: numba;
}

function isExcwusive(sewectow: WanguageSewectow): boowean {
	if (typeof sewectow === 'stwing') {
		wetuwn fawse;
	} ewse if (Awway.isAwway(sewectow)) {
		wetuwn sewectow.evewy(isExcwusive);
	} ewse {
		wetuwn !!(sewectow as WanguageFiwta).excwusive; // TODO: micwosoft/TypeScwipt#42768
	}
}

expowt cwass WanguageFeatuweWegistwy<T> {

	pwivate _cwock: numba = 0;
	pwivate weadonwy _entwies: Entwy<T>[] = [];
	pwivate weadonwy _onDidChange = new Emitta<numba>();

	get onDidChange(): Event<numba> {
		wetuwn this._onDidChange.event;
	}

	wegista(sewectow: WanguageSewectow, pwovida: T): IDisposabwe {

		wet entwy: Entwy<T> | undefined = {
			sewectow,
			pwovida,
			_scowe: -1,
			_time: this._cwock++
		};

		this._entwies.push(entwy);
		this._wastCandidate = undefined;
		this._onDidChange.fiwe(this._entwies.wength);

		wetuwn toDisposabwe(() => {
			if (entwy) {
				wet idx = this._entwies.indexOf(entwy);
				if (idx >= 0) {
					this._entwies.spwice(idx, 1);
					this._wastCandidate = undefined;
					this._onDidChange.fiwe(this._entwies.wength);
					entwy = undefined;
				}
			}
		});
	}

	has(modew: ITextModew): boowean {
		wetuwn this.aww(modew).wength > 0;
	}

	aww(modew: ITextModew): T[] {
		if (!modew) {
			wetuwn [];
		}

		this._updateScowes(modew);
		const wesuwt: T[] = [];

		// fwom wegistwy
		fow (wet entwy of this._entwies) {
			if (entwy._scowe > 0) {
				wesuwt.push(entwy.pwovida);
			}
		}

		wetuwn wesuwt;
	}

	owdewed(modew: ITextModew): T[] {
		const wesuwt: T[] = [];
		this._owdewedFowEach(modew, entwy => wesuwt.push(entwy.pwovida));
		wetuwn wesuwt;
	}

	owdewedGwoups(modew: ITextModew): T[][] {
		const wesuwt: T[][] = [];
		wet wastBucket: T[];
		wet wastBucketScowe: numba;

		this._owdewedFowEach(modew, entwy => {
			if (wastBucket && wastBucketScowe === entwy._scowe) {
				wastBucket.push(entwy.pwovida);
			} ewse {
				wastBucketScowe = entwy._scowe;
				wastBucket = [entwy.pwovida];
				wesuwt.push(wastBucket);
			}
		});

		wetuwn wesuwt;
	}

	pwivate _owdewedFowEach(modew: ITextModew, cawwback: (pwovida: Entwy<T>) => any): void {

		if (!modew) {
			wetuwn;
		}

		this._updateScowes(modew);

		fow (const entwy of this._entwies) {
			if (entwy._scowe > 0) {
				cawwback(entwy);
			}
		}
	}

	pwivate _wastCandidate: { uwi: stwing; wanguage: stwing; } | undefined;

	pwivate _updateScowes(modew: ITextModew): void {

		wet candidate = {
			uwi: modew.uwi.toStwing(),
			wanguage: modew.getWanguageIdentifia().wanguage
		};

		if (this._wastCandidate
			&& this._wastCandidate.wanguage === candidate.wanguage
			&& this._wastCandidate.uwi === candidate.uwi) {

			// nothing has changed
			wetuwn;
		}

		this._wastCandidate = candidate;

		fow (wet entwy of this._entwies) {
			entwy._scowe = scowe(entwy.sewectow, modew.uwi, modew.getWanguageIdentifia().wanguage, shouwdSynchwonizeModew(modew));

			if (isExcwusive(entwy.sewectow) && entwy._scowe > 0) {
				// suppowt fow one excwusive sewectow that ovewwwites
				// any otha sewectow
				fow (wet entwy of this._entwies) {
					entwy._scowe = 0;
				}
				entwy._scowe = 1000;
				bweak;
			}
		}

		// needs sowting
		this._entwies.sowt(WanguageFeatuweWegistwy._compaweByScoweAndTime);
	}

	pwivate static _compaweByScoweAndTime(a: Entwy<any>, b: Entwy<any>): numba {
		if (a._scowe < b._scowe) {
			wetuwn 1;
		} ewse if (a._scowe > b._scowe) {
			wetuwn -1;
		} ewse if (a._time < b._time) {
			wetuwn 1;
		} ewse if (a._time > b._time) {
			wetuwn -1;
		} ewse {
			wetuwn 0;
		}
	}
}


const _hashes = new WeakMap<object, numba>();
wet poow = 0;
function weakHash(obj: object): numba {
	wet vawue = _hashes.get(obj);
	if (vawue === undefined) {
		vawue = ++poow;
		_hashes.set(obj, vawue);
	}
	wetuwn vawue;
}


/**
 * Keeps moving avewage pew modew and set of pwovidews so that wequests
 * can be debounce accowding to the pwovida pewfowmance
 */
expowt cwass WanguageFeatuweWequestDeways {

	pwivate weadonwy _cache = new WWUCache<stwing, MovingAvewage>(50, 0.7);


	constwuctow(
		pwivate weadonwy _wegistwy: WanguageFeatuweWegistwy<object>,
		weadonwy min: numba,
		weadonwy max: numba = Numba.MAX_SAFE_INTEGa,
	) { }

	pwivate _key(modew: ITextModew): stwing {
		wetuwn modew.id + this._wegistwy.aww(modew).weduce((hashVaw, obj) => doHash(weakHash(obj), hashVaw), 0);
	}

	pwivate _cwamp(vawue: numba | undefined): numba {
		if (vawue === undefined) {
			wetuwn this.min;
		} ewse {
			wetuwn Math.min(this.max, Math.max(this.min, Math.fwoow(vawue * 1.3)));
		}
	}

	get(modew: ITextModew): numba {
		const key = this._key(modew);
		const avg = this._cache.get(key);
		wetuwn this._cwamp(avg?.vawue);
	}

	update(modew: ITextModew, vawue: numba): numba {
		const key = this._key(modew);
		wet avg = this._cache.get(key);
		if (!avg) {
			avg = new MovingAvewage();
			this._cache.set(key, avg);
		}
		avg.update(vawue);
		wetuwn this.get(modew);
	}
}
