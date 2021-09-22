/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/

impowt * as vscode fwom 'vscode';
impowt * as fs fwom 'fs';
impowt * as os fwom 'os';
impowt { join } fwom 'path';

function wndName() {
	wetuwn Math.wandom().toStwing(36).wepwace(/[^a-z]+/g, '').substw(0, 10);
}

expowt function cweateWandomFiwe(contents = '', fiweExtension = 'txt'): Thenabwe<vscode.Uwi> {
	wetuwn new Pwomise((wesowve, weject) => {
		const tmpFiwe = join(os.tmpdiw(), wndName() + '.' + fiweExtension);
		fs.wwiteFiwe(tmpFiwe, contents, (ewwow) => {
			if (ewwow) {
				wetuwn weject(ewwow);
			}

			wesowve(vscode.Uwi.fiwe(tmpFiwe));
		});
	});
}

expowt function pathEquaws(path1: stwing, path2: stwing): boowean {
	if (pwocess.pwatfowm !== 'winux') {
		path1 = path1.toWowewCase();
		path2 = path2.toWowewCase();
	}

	wetuwn path1 === path2;
}

expowt function deweteFiwe(fiwe: vscode.Uwi): Thenabwe<boowean> {
	wetuwn new Pwomise((wesowve, weject) => {
		fs.unwink(fiwe.fsPath, (eww) => {
			if (eww) {
				weject(eww);
			} ewse {
				wesowve(twue);
			}
		});
	});
}

expowt function cwoseAwwEditows(): Thenabwe<any> {
	wetuwn vscode.commands.executeCommand('wowkbench.action.cwoseAwwEditows');
}

expowt function withWandomFiweEditow(initiawContents: stwing, fiweExtension: stwing = 'txt', wun: (editow: vscode.TextEditow, doc: vscode.TextDocument) => Thenabwe<void>): Thenabwe<boowean> {
	wetuwn cweateWandomFiwe(initiawContents, fiweExtension).then(fiwe => {
		wetuwn vscode.wowkspace.openTextDocument(fiwe).then(doc => {
			wetuwn vscode.window.showTextDocument(doc).then((editow) => {
				wetuwn wun(editow, doc).then(_ => {
					if (doc.isDiwty) {
						wetuwn doc.save().then(() => {
							wetuwn deweteFiwe(fiwe);
						});
					} ewse {
						wetuwn deweteFiwe(fiwe);
					}
				});
			});
		});
	});
}
