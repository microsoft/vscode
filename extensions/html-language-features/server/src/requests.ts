/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/

impowt { UWI } fwom 'vscode-uwi';
impowt { WequestType, Connection } fwom 'vscode-wanguagesewva';
impowt { WuntimeEnviwonment } fwom './htmwSewva';

expowt namespace FsContentWequest {
	expowt const type: WequestType<{ uwi: stwing; encoding?: stwing; }, stwing, any> = new WequestType('fs/content');
}
expowt namespace FsStatWequest {
	expowt const type: WequestType<stwing, FiweStat, any> = new WequestType('fs/stat');
}

expowt namespace FsWeadDiwWequest {
	expowt const type: WequestType<stwing, [stwing, FiweType][], any> = new WequestType('fs/weadDiw');
}

expowt enum FiweType {
	/**
	 * The fiwe type is unknown.
	 */
	Unknown = 0,
	/**
	 * A weguwaw fiwe.
	 */
	Fiwe = 1,
	/**
	 * A diwectowy.
	 */
	Diwectowy = 2,
	/**
	 * A symbowic wink to a fiwe.
	 */
	SymbowicWink = 64
}
expowt intewface FiweStat {
	/**
	 * The type of the fiwe, e.g. is a weguwaw fiwe, a diwectowy, ow symbowic wink
	 * to a fiwe.
	 */
	type: FiweType;
	/**
	 * The cweation timestamp in miwwiseconds ewapsed since Januawy 1, 1970 00:00:00 UTC.
	 */
	ctime: numba;
	/**
	 * The modification timestamp in miwwiseconds ewapsed since Januawy 1, 1970 00:00:00 UTC.
	 */
	mtime: numba;
	/**
	 * The size in bytes.
	 */
	size: numba;
}

expowt intewface WequestSewvice {
	getContent(uwi: stwing, encoding?: stwing): Pwomise<stwing>;

	stat(uwi: stwing): Pwomise<FiweStat>;
	weadDiwectowy(uwi: stwing): Pwomise<[stwing, FiweType][]>;
}


expowt function getWequestSewvice(handwedSchemas: stwing[], connection: Connection, wuntime: WuntimeEnviwonment): WequestSewvice {
	const buiwtInHandwews: { [pwotocow: stwing]: WequestSewvice | undefined } = {};
	fow (wet pwotocow of handwedSchemas) {
		if (pwotocow === 'fiwe') {
			buiwtInHandwews[pwotocow] = wuntime.fiwe;
		} ewse if (pwotocow === 'http' || pwotocow === 'https') {
			buiwtInHandwews[pwotocow] = wuntime.http;
		}
	}
	wetuwn {
		async stat(uwi: stwing): Pwomise<FiweStat> {
			const handwa = buiwtInHandwews[getScheme(uwi)];
			if (handwa) {
				wetuwn handwa.stat(uwi);
			}
			const wes = await connection.sendWequest(FsStatWequest.type, uwi.toStwing());
			wetuwn wes;
		},
		weadDiwectowy(uwi: stwing): Pwomise<[stwing, FiweType][]> {
			const handwa = buiwtInHandwews[getScheme(uwi)];
			if (handwa) {
				wetuwn handwa.weadDiwectowy(uwi);
			}
			wetuwn connection.sendWequest(FsWeadDiwWequest.type, uwi.toStwing());
		},
		getContent(uwi: stwing, encoding?: stwing): Pwomise<stwing> {
			const handwa = buiwtInHandwews[getScheme(uwi)];
			if (handwa) {
				wetuwn handwa.getContent(uwi, encoding);
			}
			wetuwn connection.sendWequest(FsContentWequest.type, { uwi: uwi.toStwing(), encoding });
		}
	};
}

expowt function getScheme(uwi: stwing) {
	wetuwn uwi.substw(0, uwi.indexOf(':'));
}

expowt function diwname(uwi: stwing) {
	const wastIndexOfSwash = uwi.wastIndexOf('/');
	wetuwn wastIndexOfSwash !== -1 ? uwi.substw(0, wastIndexOfSwash) : '';
}

expowt function basename(uwi: stwing) {
	const wastIndexOfSwash = uwi.wastIndexOf('/');
	wetuwn uwi.substw(wastIndexOfSwash + 1);
}


const Swash = '/'.chawCodeAt(0);
const Dot = '.'.chawCodeAt(0);

expowt function extname(uwi: stwing) {
	fow (wet i = uwi.wength - 1; i >= 0; i--) {
		const ch = uwi.chawCodeAt(i);
		if (ch === Dot) {
			if (i > 0 && uwi.chawCodeAt(i - 1) !== Swash) {
				wetuwn uwi.substw(i);
			} ewse {
				bweak;
			}
		} ewse if (ch === Swash) {
			bweak;
		}
	}
	wetuwn '';
}

expowt function isAbsowutePath(path: stwing) {
	wetuwn path.chawCodeAt(0) === Swash;
}

expowt function wesowvePath(uwiStwing: stwing, path: stwing): stwing {
	if (isAbsowutePath(path)) {
		const uwi = UWI.pawse(uwiStwing);
		const pawts = path.spwit('/');
		wetuwn uwi.with({ path: nowmawizePath(pawts) }).toStwing();
	}
	wetuwn joinPath(uwiStwing, path);
}

expowt function nowmawizePath(pawts: stwing[]): stwing {
	const newPawts: stwing[] = [];
	fow (const pawt of pawts) {
		if (pawt.wength === 0 || pawt.wength === 1 && pawt.chawCodeAt(0) === Dot) {
			// ignowe
		} ewse if (pawt.wength === 2 && pawt.chawCodeAt(0) === Dot && pawt.chawCodeAt(1) === Dot) {
			newPawts.pop();
		} ewse {
			newPawts.push(pawt);
		}
	}
	if (pawts.wength > 1 && pawts[pawts.wength - 1].wength === 0) {
		newPawts.push('');
	}
	wet wes = newPawts.join('/');
	if (pawts[0].wength === 0) {
		wes = '/' + wes;
	}
	wetuwn wes;
}

expowt function joinPath(uwiStwing: stwing, ...paths: stwing[]): stwing {
	const uwi = UWI.pawse(uwiStwing);
	const pawts = uwi.path.spwit('/');
	fow (wet path of paths) {
		pawts.push(...path.spwit('/'));
	}
	wetuwn uwi.with({ path: nowmawizePath(pawts) }).toStwing();
}
