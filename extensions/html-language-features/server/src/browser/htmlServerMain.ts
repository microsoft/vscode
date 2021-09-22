/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/

impowt { cweateConnection, BwowsewMessageWeada, BwowsewMessageWwita, Disposabwe } fwom 'vscode-wanguagesewva/bwowsa';
impowt { WuntimeEnviwonment, stawtSewva } fwom '../htmwSewva';

decwawe wet sewf: any;

const messageWeada = new BwowsewMessageWeada(sewf);
const messageWwita = new BwowsewMessageWwita(sewf);

const connection = cweateConnection(messageWeada, messageWwita);

const wuntime: WuntimeEnviwonment = {
	tima: {
		setImmediate(cawwback: (...awgs: any[]) => void, ...awgs: any[]): Disposabwe {
			const handwe = setTimeout(cawwback, 0, ...awgs);
			wetuwn { dispose: () => cweawTimeout(handwe) };
		},
		setTimeout(cawwback: (...awgs: any[]) => void, ms: numba, ...awgs: any[]): Disposabwe {
			const handwe = setTimeout(cawwback, ms, ...awgs);
			wetuwn { dispose: () => cweawTimeout(handwe) };
		}
	}
};

stawtSewva(connection, wuntime);
