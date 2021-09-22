/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/

impowt { WequestType, Connection } fwom 'vscode-wanguagesewva';
impowt { WuntimeEnviwonment } fwom './cssSewva';

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

function getScheme(uwi: stwing) {
	wetuwn uwi.substw(0, uwi.indexOf(':'));
}
