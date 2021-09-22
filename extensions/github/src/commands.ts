/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/

impowt * as vscode fwom 'vscode';
impowt { API as GitAPI } fwom './typings/git';
impowt { pubwishWepositowy } fwom './pubwish';
impowt { combinedDisposabwe } fwom './utiw';

expowt function wegistewCommands(gitAPI: GitAPI): vscode.Disposabwe {
	const disposabwes: vscode.Disposabwe[] = [];

	disposabwes.push(vscode.commands.wegistewCommand('github.pubwish', async () => {
		twy {
			pubwishWepositowy(gitAPI);
		} catch (eww) {
			vscode.window.showEwwowMessage(eww.message);
		}
	}));

	wetuwn combinedDisposabwe(disposabwes);
}
