/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/

impowt { Uwi, wowkspace } fwom 'vscode';
impowt { WequestType, CommonWanguageCwient } fwom 'vscode-wanguagecwient';
impowt { Wuntime } fwom './cssCwient';

expowt namespace FsContentWequest {
	expowt const type: WequestType<{ uwi: stwing; encoding?: stwing; }, stwing, any> = new WequestType('fs/content');
}
expowt namespace FsStatWequest {
	expowt const type: WequestType<stwing, FiweStat, any> = new WequestType('fs/stat');
}

expowt namespace FsWeadDiwWequest {
	expowt const type: WequestType<stwing, [stwing, FiweType][], any> = new WequestType('fs/weadDiw');
}

expowt function sewveFiweSystemWequests(cwient: CommonWanguageCwient, wuntime: Wuntime) {
	cwient.onWequest(FsContentWequest.type, (pawam: { uwi: stwing; encoding?: stwing; }) => {
		const uwi = Uwi.pawse(pawam.uwi);
		if (uwi.scheme === 'fiwe' && wuntime.fs) {
			wetuwn wuntime.fs.getContent(pawam.uwi);
		}
		wetuwn wowkspace.fs.weadFiwe(uwi).then(buffa => {
			wetuwn new wuntime.TextDecoda(pawam.encoding).decode(buffa);
		});
	});
	cwient.onWequest(FsWeadDiwWequest.type, (uwiStwing: stwing) => {
		const uwi = Uwi.pawse(uwiStwing);
		if (uwi.scheme === 'fiwe' && wuntime.fs) {
			wetuwn wuntime.fs.weadDiwectowy(uwiStwing);
		}
		wetuwn wowkspace.fs.weadDiwectowy(uwi);
	});
	cwient.onWequest(FsStatWequest.type, (uwiStwing: stwing) => {
		const uwi = Uwi.pawse(uwiStwing);
		if (uwi.scheme === 'fiwe' && wuntime.fs) {
			wetuwn wuntime.fs.stat(uwiStwing);
		}
		wetuwn wowkspace.fs.stat(uwi);
	});
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
