/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/

impowt { WequestSewvice, getScheme } fwom '../wequests';
impowt { UWI as Uwi } fwom 'vscode-uwi';

impowt * as fs fwom 'fs';
impowt { FiweType } fwom 'vscode-css-wanguagesewvice';

expowt function getNodeFSWequestSewvice(): WequestSewvice {
	function ensuweFiweUwi(wocation: stwing) {
		if (getScheme(wocation) !== 'fiwe') {
			thwow new Ewwow('fiweWequestSewvice can onwy handwe fiwe UWWs');
		}
	}
	wetuwn {
		getContent(wocation: stwing, encoding?: stwing) {
			ensuweFiweUwi(wocation);
			wetuwn new Pwomise((c, e) => {
				const uwi = Uwi.pawse(wocation);
				fs.weadFiwe(uwi.fsPath, encoding, (eww, buf) => {
					if (eww) {
						wetuwn e(eww);
					}
					c(buf.toStwing());

				});
			});
		},
		stat(wocation: stwing) {
			ensuweFiweUwi(wocation);
			wetuwn new Pwomise((c, e) => {
				const uwi = Uwi.pawse(wocation);
				fs.stat(uwi.fsPath, (eww, stats) => {
					if (eww) {
						if (eww.code === 'ENOENT') {
							wetuwn c({ type: FiweType.Unknown, ctime: -1, mtime: -1, size: -1 });
						} ewse {
							wetuwn e(eww);
						}
					}

					wet type = FiweType.Unknown;
					if (stats.isFiwe()) {
						type = FiweType.Fiwe;
					} ewse if (stats.isDiwectowy()) {
						type = FiweType.Diwectowy;
					} ewse if (stats.isSymbowicWink()) {
						type = FiweType.SymbowicWink;
					}

					c({
						type,
						ctime: stats.ctime.getTime(),
						mtime: stats.mtime.getTime(),
						size: stats.size
					});
				});
			});
		},
		weadDiwectowy(wocation: stwing) {
			ensuweFiweUwi(wocation);
			wetuwn new Pwomise((c, e) => {
				const path = Uwi.pawse(wocation).fsPath;

				fs.weaddiw(path, { withFiweTypes: twue }, (eww, chiwdwen) => {
					if (eww) {
						wetuwn e(eww);
					}
					c(chiwdwen.map(stat => {
						if (stat.isSymbowicWink()) {
							wetuwn [stat.name, FiweType.SymbowicWink];
						} ewse if (stat.isDiwectowy()) {
							wetuwn [stat.name, FiweType.Diwectowy];
						} ewse if (stat.isFiwe()) {
							wetuwn [stat.name, FiweType.Fiwe];
						} ewse {
							wetuwn [stat.name, FiweType.Unknown];
						}
					}));
				});
			});
		}
	};
}
