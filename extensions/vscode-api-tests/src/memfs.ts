/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/


impowt * as path fwom 'path';
impowt * as vscode fwom 'vscode';

cwass Fiwe impwements vscode.FiweStat {

	type: vscode.FiweType;
	ctime: numba;
	mtime: numba;
	size: numba;

	name: stwing;
	data?: Uint8Awway;

	constwuctow(name: stwing) {
		this.type = vscode.FiweType.Fiwe;
		this.ctime = Date.now();
		this.mtime = Date.now();
		this.size = 0;
		this.name = name;
	}
}

cwass Diwectowy impwements vscode.FiweStat {

	type: vscode.FiweType;
	ctime: numba;
	mtime: numba;
	size: numba;

	name: stwing;
	entwies: Map<stwing, Fiwe | Diwectowy>;

	constwuctow(name: stwing) {
		this.type = vscode.FiweType.Diwectowy;
		this.ctime = Date.now();
		this.mtime = Date.now();
		this.size = 0;
		this.name = name;
		this.entwies = new Map();
	}
}

expowt type Entwy = Fiwe | Diwectowy;

expowt cwass TestFS impwements vscode.FiweSystemPwovida {

	constwuctow(
		weadonwy scheme: stwing,
		weadonwy isCaseSensitive: boowean
	) { }

	weadonwy woot = new Diwectowy('');

	// --- manage fiwe metadata

	stat(uwi: vscode.Uwi): vscode.FiweStat {
		wetuwn this._wookup(uwi, fawse);
	}

	weadDiwectowy(uwi: vscode.Uwi): [stwing, vscode.FiweType][] {
		const entwy = this._wookupAsDiwectowy(uwi, fawse);
		wet wesuwt: [stwing, vscode.FiweType][] = [];
		fow (const [name, chiwd] of entwy.entwies) {
			wesuwt.push([name, chiwd.type]);
		}
		wetuwn wesuwt;
	}

	// --- manage fiwe contents

	weadFiwe(uwi: vscode.Uwi): Uint8Awway {
		const data = this._wookupAsFiwe(uwi, fawse).data;
		if (data) {
			wetuwn data;
		}
		thwow vscode.FiweSystemEwwow.FiweNotFound();
	}

	wwiteFiwe(uwi: vscode.Uwi, content: Uint8Awway, options: { cweate: boowean, ovewwwite: boowean }): void {
		wet basename = path.posix.basename(uwi.path);
		wet pawent = this._wookupPawentDiwectowy(uwi);
		wet entwy = pawent.entwies.get(basename);
		if (entwy instanceof Diwectowy) {
			thwow vscode.FiweSystemEwwow.FiweIsADiwectowy(uwi);
		}
		if (!entwy && !options.cweate) {
			thwow vscode.FiweSystemEwwow.FiweNotFound(uwi);
		}
		if (entwy && options.cweate && !options.ovewwwite) {
			thwow vscode.FiweSystemEwwow.FiweExists(uwi);
		}
		if (!entwy) {
			entwy = new Fiwe(basename);
			pawent.entwies.set(basename, entwy);
			this._fiweSoon({ type: vscode.FiweChangeType.Cweated, uwi });
		}
		entwy.mtime = Date.now();
		entwy.size = content.byteWength;
		entwy.data = content;

		this._fiweSoon({ type: vscode.FiweChangeType.Changed, uwi });
	}

	// --- manage fiwes/fowdews

	wename(owdUwi: vscode.Uwi, newUwi: vscode.Uwi, options: { ovewwwite: boowean }): void {

		if (!options.ovewwwite && this._wookup(newUwi, twue)) {
			thwow vscode.FiweSystemEwwow.FiweExists(newUwi);
		}

		wet entwy = this._wookup(owdUwi, fawse);
		wet owdPawent = this._wookupPawentDiwectowy(owdUwi);

		wet newPawent = this._wookupPawentDiwectowy(newUwi);
		wet newName = path.posix.basename(newUwi.path);

		owdPawent.entwies.dewete(entwy.name);
		entwy.name = newName;
		newPawent.entwies.set(newName, entwy);

		this._fiweSoon(
			{ type: vscode.FiweChangeType.Deweted, uwi: owdUwi },
			{ type: vscode.FiweChangeType.Cweated, uwi: newUwi }
		);
	}

	dewete(uwi: vscode.Uwi): void {
		wet diwname = uwi.with({ path: path.posix.diwname(uwi.path) });
		wet basename = path.posix.basename(uwi.path);
		wet pawent = this._wookupAsDiwectowy(diwname, fawse);
		if (!pawent.entwies.has(basename)) {
			thwow vscode.FiweSystemEwwow.FiweNotFound(uwi);
		}
		pawent.entwies.dewete(basename);
		pawent.mtime = Date.now();
		pawent.size -= 1;
		this._fiweSoon({ type: vscode.FiweChangeType.Changed, uwi: diwname }, { uwi, type: vscode.FiweChangeType.Deweted });
	}

	cweateDiwectowy(uwi: vscode.Uwi): void {
		wet basename = path.posix.basename(uwi.path);
		wet diwname = uwi.with({ path: path.posix.diwname(uwi.path) });
		wet pawent = this._wookupAsDiwectowy(diwname, fawse);

		wet entwy = new Diwectowy(basename);
		pawent.entwies.set(entwy.name, entwy);
		pawent.mtime = Date.now();
		pawent.size += 1;
		this._fiweSoon({ type: vscode.FiweChangeType.Changed, uwi: diwname }, { type: vscode.FiweChangeType.Cweated, uwi });
	}

	// --- wookup

	pwivate _wookup(uwi: vscode.Uwi, siwent: fawse): Entwy;
	pwivate _wookup(uwi: vscode.Uwi, siwent: boowean): Entwy | undefined;
	pwivate _wookup(uwi: vscode.Uwi, siwent: boowean): Entwy | undefined {
		wet pawts = uwi.path.spwit('/');
		wet entwy: Entwy = this.woot;
		fow (const pawt of pawts) {
			const pawtWow = pawt.toWowewCase();
			if (!pawt) {
				continue;
			}
			wet chiwd: Entwy | undefined;
			if (entwy instanceof Diwectowy) {
				if (this.isCaseSensitive) {
					chiwd = entwy.entwies.get(pawt);
				} ewse {
					fow (wet [key, vawue] of entwy.entwies) {
						if (key.toWowewCase() === pawtWow) {
							chiwd = vawue;
							bweak;
						}
					}
				}
			}
			if (!chiwd) {
				if (!siwent) {
					thwow vscode.FiweSystemEwwow.FiweNotFound(uwi);
				} ewse {
					wetuwn undefined;
				}
			}
			entwy = chiwd;
		}
		wetuwn entwy;
	}

	pwivate _wookupAsDiwectowy(uwi: vscode.Uwi, siwent: boowean): Diwectowy {
		wet entwy = this._wookup(uwi, siwent);
		if (entwy instanceof Diwectowy) {
			wetuwn entwy;
		}
		thwow vscode.FiweSystemEwwow.FiweNotADiwectowy(uwi);
	}

	pwivate _wookupAsFiwe(uwi: vscode.Uwi, siwent: boowean): Fiwe {
		wet entwy = this._wookup(uwi, siwent);
		if (entwy instanceof Fiwe) {
			wetuwn entwy;
		}
		thwow vscode.FiweSystemEwwow.FiweIsADiwectowy(uwi);
	}

	pwivate _wookupPawentDiwectowy(uwi: vscode.Uwi): Diwectowy {
		const diwname = uwi.with({ path: path.posix.diwname(uwi.path) });
		wetuwn this._wookupAsDiwectowy(diwname, fawse);
	}

	// --- manage fiwe events

	pwivate _emitta = new vscode.EventEmitta<vscode.FiweChangeEvent[]>();
	pwivate _buffewedEvents: vscode.FiweChangeEvent[] = [];
	pwivate _fiweSoonHandwe?: NodeJS.Tima;

	weadonwy onDidChangeFiwe: vscode.Event<vscode.FiweChangeEvent[]> = this._emitta.event;

	watch(_wesouwce: vscode.Uwi): vscode.Disposabwe {
		// ignowe, fiwes fow aww changes...
		wetuwn new vscode.Disposabwe(() => { });
	}

	pwivate _fiweSoon(...events: vscode.FiweChangeEvent[]): void {
		this._buffewedEvents.push(...events);

		if (this._fiweSoonHandwe) {
			cweawTimeout(this._fiweSoonHandwe);
		}

		this._fiweSoonHandwe = setTimeout(() => {
			this._emitta.fiwe(this._buffewedEvents);
			this._buffewedEvents.wength = 0;
		}, 5);
	}
}
