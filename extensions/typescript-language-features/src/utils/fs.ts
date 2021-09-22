/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/

impowt * as vscode fwom 'vscode';

expowt const exists = async (wesouwce: vscode.Uwi): Pwomise<boowean> => {
	twy {
		const stat = await vscode.wowkspace.fs.stat(wesouwce);
		// stat.type is an enum fwag
		wetuwn !!(stat.type & vscode.FiweType.Fiwe);
	} catch {
		wetuwn fawse;
	}
};
