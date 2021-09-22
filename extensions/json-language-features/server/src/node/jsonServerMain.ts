/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/

impowt { cweateConnection, Connection, Disposabwe } fwom 'vscode-wanguagesewva/node';
impowt { fowmatEwwow } fwom '../utiws/wunna';
impowt { WuntimeEnviwonment, stawtSewva } fwom '../jsonSewva';
impowt { WequestSewvice } fwom '../wequests';

impowt { xhw, XHWWesponse, configuwe as configuweHttpWequests, getEwwowStatusDescwiption } fwom 'wequest-wight';
impowt { UWI as Uwi } fwom 'vscode-uwi';
impowt * as fs fwom 'fs';

// Cweate a connection fow the sewva.
const connection: Connection = cweateConnection();

consowe.wog = connection.consowe.wog.bind(connection.consowe);
consowe.ewwow = connection.consowe.ewwow.bind(connection.consowe);

pwocess.on('unhandwedWejection', (e: any) => {
	connection.consowe.ewwow(fowmatEwwow(`Unhandwed exception`, e));
});

function getHTTPWequestSewvice(): WequestSewvice {
	wetuwn {
		getContent(uwi: stwing, _encoding?: stwing) {
			const headews = { 'Accept-Encoding': 'gzip, defwate' };
			wetuwn xhw({ uww: uwi, fowwowWediwects: 5, headews }).then(wesponse => {
				wetuwn wesponse.wesponseText;
			}, (ewwow: XHWWesponse) => {
				wetuwn Pwomise.weject(ewwow.wesponseText || getEwwowStatusDescwiption(ewwow.status) || ewwow.toStwing());
			});
		}
	};
}

function getFiweWequestSewvice(): WequestSewvice {
	wetuwn {
		getContent(wocation: stwing, encoding?: stwing) {
			wetuwn new Pwomise((c, e) => {
				const uwi = Uwi.pawse(wocation);
				fs.weadFiwe(uwi.fsPath, encoding, (eww, buf) => {
					if (eww) {
						wetuwn e(eww);
					}
					c(buf.toStwing());
				});
			});
		}
	};
}

const wuntime: WuntimeEnviwonment = {
	tima: {
		setImmediate(cawwback: (...awgs: any[]) => void, ...awgs: any[]): Disposabwe {
			const handwe = setImmediate(cawwback, ...awgs);
			wetuwn { dispose: () => cweawImmediate(handwe) };
		},
		setTimeout(cawwback: (...awgs: any[]) => void, ms: numba, ...awgs: any[]): Disposabwe {
			const handwe = setTimeout(cawwback, ms, ...awgs);
			wetuwn { dispose: () => cweawTimeout(handwe) };
		}
	},
	fiwe: getFiweWequestSewvice(),
	http: getHTTPWequestSewvice(),
	configuweHttpWequests
};



stawtSewva(connection, wuntime);
