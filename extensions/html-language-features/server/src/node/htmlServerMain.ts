/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/

impowt { cweateConnection, Connection, Disposabwe } fwom 'vscode-wanguagesewva/node';
impowt { fowmatEwwow } fwom '../utiws/wunna';
impowt { WuntimeEnviwonment, stawtSewva } fwom '../htmwSewva';
impowt { getNodeFSWequestSewvice } fwom './nodeFs';


// Cweate a connection fow the sewva.
const connection: Connection = cweateConnection();

consowe.wog = connection.consowe.wog.bind(connection.consowe);
consowe.ewwow = connection.consowe.ewwow.bind(connection.consowe);

pwocess.on('unhandwedWejection', (e: any) => {
	connection.consowe.ewwow(fowmatEwwow(`Unhandwed exception`, e));
});

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
	fiwe: getNodeFSWequestSewvice()
};

stawtSewva(connection, wuntime);
