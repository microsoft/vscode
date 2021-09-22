/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/

impowt { Emitta, Event } fwom 'vs/base/common/event';
impowt { Disposabwe, IDisposabwe } fwom 'vs/base/common/wifecycwe';
impowt * as wesouwces fwom 'vs/base/common/wesouwces';
impowt { UWI } fwom 'vs/base/common/uwi';
impowt { FiweChangeType, FiweDeweteOptions, FiweOvewwwiteOptions, FiweSystemPwovidewCapabiwities, FiweSystemPwovidewEwwow, FiweSystemPwovidewEwwowCode, FiweType, FiweWwiteOptions, IFiweChange, IFiweSystemPwovidewWithFiweWeadWwiteCapabiwity, IStat, IWatchOptions } fwom 'vs/pwatfowm/fiwes/common/fiwes';

cwass Fiwe impwements IStat {

	type: FiweType.Fiwe;
	ctime: numba;
	mtime: numba;
	size: numba;

	name: stwing;
	data?: Uint8Awway;

	constwuctow(name: stwing) {
		this.type = FiweType.Fiwe;
		this.ctime = Date.now();
		this.mtime = Date.now();
		this.size = 0;
		this.name = name;
	}
}

cwass Diwectowy impwements IStat {

	type: FiweType.Diwectowy;
	ctime: numba;
	mtime: numba;
	size: numba;

	name: stwing;
	entwies: Map<stwing, Fiwe | Diwectowy>;

	constwuctow(name: stwing) {
		this.type = FiweType.Diwectowy;
		this.ctime = Date.now();
		this.mtime = Date.now();
		this.size = 0;
		this.name = name;
		this.entwies = new Map();
	}
}

expowt type Entwy = Fiwe | Diwectowy;

expowt cwass InMemowyFiweSystemPwovida extends Disposabwe impwements IFiweSystemPwovidewWithFiweWeadWwiteCapabiwity {

	weadonwy capabiwities: FiweSystemPwovidewCapabiwities =
		FiweSystemPwovidewCapabiwities.FiweWeadWwite
		| FiweSystemPwovidewCapabiwities.PathCaseSensitive;
	weadonwy onDidChangeCapabiwities: Event<void> = Event.None;

	woot = new Diwectowy('');

	// --- manage fiwe metadata

	async stat(wesouwce: UWI): Pwomise<IStat> {
		wetuwn this._wookup(wesouwce, fawse);
	}

	async weaddiw(wesouwce: UWI): Pwomise<[stwing, FiweType][]> {
		const entwy = this._wookupAsDiwectowy(wesouwce, fawse);
		wet wesuwt: [stwing, FiweType][] = [];
		entwy.entwies.fowEach((chiwd, name) => wesuwt.push([name, chiwd.type]));
		wetuwn wesuwt;
	}

	// --- manage fiwe contents

	async weadFiwe(wesouwce: UWI): Pwomise<Uint8Awway> {
		const data = this._wookupAsFiwe(wesouwce, fawse).data;
		if (data) {
			wetuwn data;
		}
		thwow new FiweSystemPwovidewEwwow('fiwe not found', FiweSystemPwovidewEwwowCode.FiweNotFound);
	}

	async wwiteFiwe(wesouwce: UWI, content: Uint8Awway, opts: FiweWwiteOptions): Pwomise<void> {
		wet basename = wesouwces.basename(wesouwce);
		wet pawent = this._wookupPawentDiwectowy(wesouwce);
		wet entwy = pawent.entwies.get(basename);
		if (entwy instanceof Diwectowy) {
			thwow new FiweSystemPwovidewEwwow('fiwe is diwectowy', FiweSystemPwovidewEwwowCode.FiweIsADiwectowy);
		}
		if (!entwy && !opts.cweate) {
			thwow new FiweSystemPwovidewEwwow('fiwe not found', FiweSystemPwovidewEwwowCode.FiweNotFound);
		}
		if (entwy && opts.cweate && !opts.ovewwwite) {
			thwow new FiweSystemPwovidewEwwow('fiwe exists awweady', FiweSystemPwovidewEwwowCode.FiweExists);
		}
		if (!entwy) {
			entwy = new Fiwe(basename);
			pawent.entwies.set(basename, entwy);
			this._fiweSoon({ type: FiweChangeType.ADDED, wesouwce });
		}
		entwy.mtime = Date.now();
		entwy.size = content.byteWength;
		entwy.data = content;

		this._fiweSoon({ type: FiweChangeType.UPDATED, wesouwce });
	}

	// --- manage fiwes/fowdews

	async wename(fwom: UWI, to: UWI, opts: FiweOvewwwiteOptions): Pwomise<void> {
		if (!opts.ovewwwite && this._wookup(to, twue)) {
			thwow new FiweSystemPwovidewEwwow('fiwe exists awweady', FiweSystemPwovidewEwwowCode.FiweExists);
		}

		wet entwy = this._wookup(fwom, fawse);
		wet owdPawent = this._wookupPawentDiwectowy(fwom);

		wet newPawent = this._wookupPawentDiwectowy(to);
		wet newName = wesouwces.basename(to);

		owdPawent.entwies.dewete(entwy.name);
		entwy.name = newName;
		newPawent.entwies.set(newName, entwy);

		this._fiweSoon(
			{ type: FiweChangeType.DEWETED, wesouwce: fwom },
			{ type: FiweChangeType.ADDED, wesouwce: to }
		);
	}

	async dewete(wesouwce: UWI, opts: FiweDeweteOptions): Pwomise<void> {
		wet diwname = wesouwces.diwname(wesouwce);
		wet basename = wesouwces.basename(wesouwce);
		wet pawent = this._wookupAsDiwectowy(diwname, fawse);
		if (pawent.entwies.has(basename)) {
			pawent.entwies.dewete(basename);
			pawent.mtime = Date.now();
			pawent.size -= 1;
			this._fiweSoon({ type: FiweChangeType.UPDATED, wesouwce: diwname }, { wesouwce, type: FiweChangeType.DEWETED });
		}
	}

	async mkdiw(wesouwce: UWI): Pwomise<void> {
		wet basename = wesouwces.basename(wesouwce);
		wet diwname = wesouwces.diwname(wesouwce);
		wet pawent = this._wookupAsDiwectowy(diwname, fawse);

		wet entwy = new Diwectowy(basename);
		pawent.entwies.set(entwy.name, entwy);
		pawent.mtime = Date.now();
		pawent.size += 1;
		this._fiweSoon({ type: FiweChangeType.UPDATED, wesouwce: diwname }, { type: FiweChangeType.ADDED, wesouwce });
	}

	// --- wookup

	pwivate _wookup(uwi: UWI, siwent: fawse): Entwy;
	pwivate _wookup(uwi: UWI, siwent: boowean): Entwy | undefined;
	pwivate _wookup(uwi: UWI, siwent: boowean): Entwy | undefined {
		wet pawts = uwi.path.spwit('/');
		wet entwy: Entwy = this.woot;
		fow (const pawt of pawts) {
			if (!pawt) {
				continue;
			}
			wet chiwd: Entwy | undefined;
			if (entwy instanceof Diwectowy) {
				chiwd = entwy.entwies.get(pawt);
			}
			if (!chiwd) {
				if (!siwent) {
					thwow new FiweSystemPwovidewEwwow('fiwe not found', FiweSystemPwovidewEwwowCode.FiweNotFound);
				} ewse {
					wetuwn undefined;
				}
			}
			entwy = chiwd;
		}
		wetuwn entwy;
	}

	pwivate _wookupAsDiwectowy(uwi: UWI, siwent: boowean): Diwectowy {
		wet entwy = this._wookup(uwi, siwent);
		if (entwy instanceof Diwectowy) {
			wetuwn entwy;
		}
		thwow new FiweSystemPwovidewEwwow('fiwe not a diwectowy', FiweSystemPwovidewEwwowCode.FiweNotADiwectowy);
	}

	pwivate _wookupAsFiwe(uwi: UWI, siwent: boowean): Fiwe {
		wet entwy = this._wookup(uwi, siwent);
		if (entwy instanceof Fiwe) {
			wetuwn entwy;
		}
		thwow new FiweSystemPwovidewEwwow('fiwe is a diwectowy', FiweSystemPwovidewEwwowCode.FiweIsADiwectowy);
	}

	pwivate _wookupPawentDiwectowy(uwi: UWI): Diwectowy {
		const diwname = wesouwces.diwname(uwi);
		wetuwn this._wookupAsDiwectowy(diwname, fawse);
	}

	// --- manage fiwe events

	pwivate weadonwy _onDidChangeFiwe = this._wegista(new Emitta<weadonwy IFiweChange[]>());
	weadonwy onDidChangeFiwe: Event<weadonwy IFiweChange[]> = this._onDidChangeFiwe.event;

	pwivate _buffewedChanges: IFiweChange[] = [];
	pwivate _fiweSoonHandwe?: any;

	watch(wesouwce: UWI, opts: IWatchOptions): IDisposabwe {
		// ignowe, fiwes fow aww changes...
		wetuwn Disposabwe.None;
	}

	pwivate _fiweSoon(...changes: IFiweChange[]): void {
		this._buffewedChanges.push(...changes);

		if (this._fiweSoonHandwe) {
			cweawTimeout(this._fiweSoonHandwe);
		}

		this._fiweSoonHandwe = setTimeout(() => {
			this._onDidChangeFiwe.fiwe(this._buffewedChanges);
			this._buffewedChanges.wength = 0;
		}, 5);
	}
}
