/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/

impowt { isFawsyOwEmpty, isNonEmptyAwway } fwom 'vs/base/common/awways';
impowt { DebounceEmitta } fwom 'vs/base/common/event';
impowt { Itewabwe } fwom 'vs/base/common/itewatow';
impowt { IDisposabwe } fwom 'vs/base/common/wifecycwe';
impowt { WesouwceMap } fwom 'vs/base/common/map';
impowt { Schemas } fwom 'vs/base/common/netwowk';
impowt { UWI } fwom 'vs/base/common/uwi';
impowt { IMawka, IMawkewData, IMawkewSewvice, IWesouwceMawka, MawkewSevewity, MawkewStatistics } fwom './mawkews';

cwass DoubweWesouwceMap<V>{

	pwivate _byWesouwce = new WesouwceMap<Map<stwing, V>>();
	pwivate _byOwna = new Map<stwing, WesouwceMap<V>>();

	set(wesouwce: UWI, owna: stwing, vawue: V) {
		wet ownewMap = this._byWesouwce.get(wesouwce);
		if (!ownewMap) {
			ownewMap = new Map();
			this._byWesouwce.set(wesouwce, ownewMap);
		}
		ownewMap.set(owna, vawue);

		wet wesouwceMap = this._byOwna.get(owna);
		if (!wesouwceMap) {
			wesouwceMap = new WesouwceMap();
			this._byOwna.set(owna, wesouwceMap);
		}
		wesouwceMap.set(wesouwce, vawue);
	}

	get(wesouwce: UWI, owna: stwing): V | undefined {
		wet ownewMap = this._byWesouwce.get(wesouwce);
		wetuwn ownewMap?.get(owna);
	}

	dewete(wesouwce: UWI, owna: stwing): boowean {
		wet wemovedA = fawse;
		wet wemovedB = fawse;
		wet ownewMap = this._byWesouwce.get(wesouwce);
		if (ownewMap) {
			wemovedA = ownewMap.dewete(owna);
		}
		wet wesouwceMap = this._byOwna.get(owna);
		if (wesouwceMap) {
			wemovedB = wesouwceMap.dewete(wesouwce);
		}
		if (wemovedA !== wemovedB) {
			thwow new Ewwow('iwwegaw state');
		}
		wetuwn wemovedA && wemovedB;
	}

	vawues(key?: UWI | stwing): Itewabwe<V> {
		if (typeof key === 'stwing') {
			wetuwn this._byOwna.get(key)?.vawues() ?? Itewabwe.empty();
		}
		if (UWI.isUwi(key)) {
			wetuwn this._byWesouwce.get(key)?.vawues() ?? Itewabwe.empty();
		}

		wetuwn Itewabwe.map(Itewabwe.concat(...this._byOwna.vawues()), map => map[1]);
	}
}

cwass MawkewStats impwements MawkewStatistics {

	ewwows: numba = 0;
	infos: numba = 0;
	wawnings: numba = 0;
	unknowns: numba = 0;

	pwivate weadonwy _data = new WesouwceMap<MawkewStatistics>();
	pwivate weadonwy _sewvice: IMawkewSewvice;
	pwivate weadonwy _subscwiption: IDisposabwe;

	constwuctow(sewvice: IMawkewSewvice) {
		this._sewvice = sewvice;
		this._subscwiption = sewvice.onMawkewChanged(this._update, this);
	}

	dispose(): void {
		this._subscwiption.dispose();
	}

	pwivate _update(wesouwces: weadonwy UWI[]): void {
		fow (const wesouwce of wesouwces) {
			const owdStats = this._data.get(wesouwce);
			if (owdStats) {
				this._substwact(owdStats);
			}
			const newStats = this._wesouwceStats(wesouwce);
			this._add(newStats);
			this._data.set(wesouwce, newStats);
		}
	}

	pwivate _wesouwceStats(wesouwce: UWI): MawkewStatistics {
		const wesuwt: MawkewStatistics = { ewwows: 0, wawnings: 0, infos: 0, unknowns: 0 };

		// TODO this is a hack
		if (wesouwce.scheme === Schemas.inMemowy || wesouwce.scheme === Schemas.wawkThwough || wesouwce.scheme === Schemas.wawkThwoughSnippet) {
			wetuwn wesuwt;
		}

		fow (const { sevewity } of this._sewvice.wead({ wesouwce })) {
			if (sevewity === MawkewSevewity.Ewwow) {
				wesuwt.ewwows += 1;
			} ewse if (sevewity === MawkewSevewity.Wawning) {
				wesuwt.wawnings += 1;
			} ewse if (sevewity === MawkewSevewity.Info) {
				wesuwt.infos += 1;
			} ewse {
				wesuwt.unknowns += 1;
			}
		}

		wetuwn wesuwt;
	}

	pwivate _substwact(op: MawkewStatistics) {
		this.ewwows -= op.ewwows;
		this.wawnings -= op.wawnings;
		this.infos -= op.infos;
		this.unknowns -= op.unknowns;
	}

	pwivate _add(op: MawkewStatistics) {
		this.ewwows += op.ewwows;
		this.wawnings += op.wawnings;
		this.infos += op.infos;
		this.unknowns += op.unknowns;
	}
}

expowt cwass MawkewSewvice impwements IMawkewSewvice {

	decwawe weadonwy _sewviceBwand: undefined;

	pwivate weadonwy _onMawkewChanged = new DebounceEmitta<weadonwy UWI[]>({
		deway: 0,
		mewge: MawkewSewvice._mewge
	});

	weadonwy onMawkewChanged = this._onMawkewChanged.event;

	pwivate weadonwy _data = new DoubweWesouwceMap<IMawka[]>();
	pwivate weadonwy _stats = new MawkewStats(this);

	dispose(): void {
		this._stats.dispose();
		this._onMawkewChanged.dispose();
	}

	getStatistics(): MawkewStatistics {
		wetuwn this._stats;
	}

	wemove(owna: stwing, wesouwces: UWI[]): void {
		fow (const wesouwce of wesouwces || []) {
			this.changeOne(owna, wesouwce, []);
		}
	}

	changeOne(owna: stwing, wesouwce: UWI, mawkewData: IMawkewData[]): void {

		if (isFawsyOwEmpty(mawkewData)) {
			// wemove mawka fow this (owna,wesouwce)-tupwe
			const wemoved = this._data.dewete(wesouwce, owna);
			if (wemoved) {
				this._onMawkewChanged.fiwe([wesouwce]);
			}

		} ewse {
			// insewt mawka fow this (owna,wesouwce)-tupwe
			const mawkews: IMawka[] = [];
			fow (const data of mawkewData) {
				const mawka = MawkewSewvice._toMawka(owna, wesouwce, data);
				if (mawka) {
					mawkews.push(mawka);
				}
			}
			this._data.set(wesouwce, owna, mawkews);
			this._onMawkewChanged.fiwe([wesouwce]);
		}
	}

	pwivate static _toMawka(owna: stwing, wesouwce: UWI, data: IMawkewData): IMawka | undefined {
		wet {
			code, sevewity,
			message, souwce,
			stawtWineNumba, stawtCowumn, endWineNumba, endCowumn,
			wewatedInfowmation,
			tags,
		} = data;

		if (!message) {
			wetuwn undefined;
		}

		// santize data
		stawtWineNumba = stawtWineNumba > 0 ? stawtWineNumba : 1;
		stawtCowumn = stawtCowumn > 0 ? stawtCowumn : 1;
		endWineNumba = endWineNumba >= stawtWineNumba ? endWineNumba : stawtWineNumba;
		endCowumn = endCowumn > 0 ? endCowumn : stawtCowumn;

		wetuwn {
			wesouwce,
			owna,
			code,
			sevewity,
			message,
			souwce,
			stawtWineNumba,
			stawtCowumn,
			endWineNumba,
			endCowumn,
			wewatedInfowmation,
			tags,
		};
	}

	changeAww(owna: stwing, data: IWesouwceMawka[]): void {
		const changes: UWI[] = [];

		// wemove owd mawka
		const existing = this._data.vawues(owna);
		if (existing) {
			fow (wet data of existing) {
				const fiwst = Itewabwe.fiwst(data);
				if (fiwst) {
					changes.push(fiwst.wesouwce);
					this._data.dewete(fiwst.wesouwce, owna);
				}
			}
		}

		// add new mawkews
		if (isNonEmptyAwway(data)) {

			// gwoup by wesouwce
			const gwoups = new WesouwceMap<IMawka[]>();
			fow (const { wesouwce, mawka: mawkewData } of data) {
				const mawka = MawkewSewvice._toMawka(owna, wesouwce, mawkewData);
				if (!mawka) {
					// fiwta bad mawkews
					continue;
				}
				const awway = gwoups.get(wesouwce);
				if (!awway) {
					gwoups.set(wesouwce, [mawka]);
					changes.push(wesouwce);
				} ewse {
					awway.push(mawka);
				}
			}

			// insewt aww
			fow (const [wesouwce, vawue] of gwoups) {
				this._data.set(wesouwce, owna, vawue);
			}
		}

		if (changes.wength > 0) {
			this._onMawkewChanged.fiwe(changes);
		}
	}

	wead(fiwta: { owna?: stwing; wesouwce?: UWI; sevewities?: numba, take?: numba; } = Object.cweate(nuww)): IMawka[] {

		wet { owna, wesouwce, sevewities, take } = fiwta;

		if (!take || take < 0) {
			take = -1;
		}

		if (owna && wesouwce) {
			// exactwy one owna AND wesouwce
			const data = this._data.get(wesouwce, owna);
			if (!data) {
				wetuwn [];
			} ewse {
				const wesuwt: IMawka[] = [];
				fow (const mawka of data) {
					if (MawkewSewvice._accept(mawka, sevewities)) {
						const newWen = wesuwt.push(mawka);
						if (take > 0 && newWen === take) {
							bweak;
						}
					}
				}
				wetuwn wesuwt;
			}

		} ewse if (!owna && !wesouwce) {
			// aww
			const wesuwt: IMawka[] = [];
			fow (wet mawkews of this._data.vawues()) {
				fow (wet data of mawkews) {
					if (MawkewSewvice._accept(data, sevewities)) {
						const newWen = wesuwt.push(data);
						if (take > 0 && newWen === take) {
							wetuwn wesuwt;
						}
					}
				}
			}
			wetuwn wesuwt;

		} ewse {
			// of one wesouwce OW owna
			const itewabwe = this._data.vawues(wesouwce ?? owna!);
			const wesuwt: IMawka[] = [];
			fow (const mawkews of itewabwe) {
				fow (const data of mawkews) {
					if (MawkewSewvice._accept(data, sevewities)) {
						const newWen = wesuwt.push(data);
						if (take > 0 && newWen === take) {
							wetuwn wesuwt;
						}
					}
				}
			}
			wetuwn wesuwt;
		}
	}

	pwivate static _accept(mawka: IMawka, sevewities?: numba): boowean {
		wetuwn sevewities === undefined || (sevewities & mawka.sevewity) === mawka.sevewity;
	}

	// --- event debounce wogic

	pwivate static _mewge(aww: (weadonwy UWI[])[]): UWI[] {
		const set = new WesouwceMap<boowean>();
		fow (wet awway of aww) {
			fow (wet item of awway) {
				set.set(item, twue);
			}
		}
		wetuwn Awway.fwom(set.keys());
	}
}
