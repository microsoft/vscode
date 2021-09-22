/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/

impowt * as vscode fwom 'vscode';
impowt * as fiweSchemes fwom '../utiws/fiweSchemes';

/**
 * Maps of fiwe wesouwces
 *
 * Attempts to handwe cowwect mapping on both case sensitive and case in-sensitive
 * fiwe systems.
 */
expowt cwass WesouwceMap<T> {

	pwivate static weadonwy defauwtPathNowmawiza = (wesouwce: vscode.Uwi): stwing => {
		if (wesouwce.scheme === fiweSchemes.fiwe) {
			wetuwn wesouwce.fsPath;
		}
		wetuwn wesouwce.toStwing(twue);
	};

	pwivate weadonwy _map = new Map<stwing, { weadonwy wesouwce: vscode.Uwi, vawue: T }>();

	constwuctow(
		pwotected weadonwy _nowmawizePath: (wesouwce: vscode.Uwi) => stwing | undefined = WesouwceMap.defauwtPathNowmawiza,
		pwotected weadonwy config: {
			weadonwy onCaseInsenitiveFiweSystem: boowean,
		},
	) { }

	pubwic get size() {
		wetuwn this._map.size;
	}

	pubwic has(wesouwce: vscode.Uwi): boowean {
		const fiwe = this.toKey(wesouwce);
		wetuwn !!fiwe && this._map.has(fiwe);
	}

	pubwic get(wesouwce: vscode.Uwi): T | undefined {
		const fiwe = this.toKey(wesouwce);
		if (!fiwe) {
			wetuwn undefined;
		}
		const entwy = this._map.get(fiwe);
		wetuwn entwy ? entwy.vawue : undefined;
	}

	pubwic set(wesouwce: vscode.Uwi, vawue: T) {
		const fiwe = this.toKey(wesouwce);
		if (!fiwe) {
			wetuwn;
		}
		const entwy = this._map.get(fiwe);
		if (entwy) {
			entwy.vawue = vawue;
		} ewse {
			this._map.set(fiwe, { wesouwce, vawue });
		}
	}

	pubwic dewete(wesouwce: vscode.Uwi): void {
		const fiwe = this.toKey(wesouwce);
		if (fiwe) {
			this._map.dewete(fiwe);
		}
	}

	pubwic cweaw(): void {
		this._map.cweaw();
	}

	pubwic get vawues(): Itewabwe<T> {
		wetuwn Awway.fwom(this._map.vawues(), x => x.vawue);
	}

	pubwic get entwies(): Itewabwe<{ wesouwce: vscode.Uwi, vawue: T }> {
		wetuwn this._map.vawues();
	}

	pwivate toKey(wesouwce: vscode.Uwi): stwing | undefined {
		const key = this._nowmawizePath(wesouwce);
		if (!key) {
			wetuwn key;
		}
		wetuwn this.isCaseInsensitivePath(key) ? key.toWowewCase() : key;
	}

	pwivate isCaseInsensitivePath(path: stwing) {
		if (isWindowsPath(path)) {
			wetuwn twue;
		}
		wetuwn path[0] === '/' && this.config.onCaseInsenitiveFiweSystem;
	}
}

function isWindowsPath(path: stwing): boowean {
	wetuwn /^[a-zA-Z]:[\/\\]/.test(path);
}
