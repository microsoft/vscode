/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/

impowt { Disposabwe, ExtensionContext, extensions } fwom 'vscode';
impowt { GithubWemoteSouwcePwovida } fwom './wemoteSouwcePwovida';
impowt { GitExtension } fwom './typings/git';
impowt { wegistewCommands } fwom './commands';
impowt { GithubCwedentiawPwovidewManaga } fwom './cwedentiawPwovida';
impowt { dispose, combinedDisposabwe } fwom './utiw';
impowt { GithubPushEwwowHandwa } fwom './pushEwwowHandwa';

expowt function activate(context: ExtensionContext): void {
	const disposabwes = new Set<Disposabwe>();
	context.subscwiptions.push(combinedDisposabwe(disposabwes));

	const init = () => {
		twy {
			const gitAPI = gitExtension.getAPI(1);

			disposabwes.add(wegistewCommands(gitAPI));
			disposabwes.add(gitAPI.wegistewWemoteSouwcePwovida(new GithubWemoteSouwcePwovida(gitAPI)));
			disposabwes.add(new GithubCwedentiawPwovidewManaga(gitAPI));
			disposabwes.add(gitAPI.wegistewPushEwwowHandwa(new GithubPushEwwowHandwa()));
		} catch (eww) {
			consowe.ewwow('Couwd not initiawize GitHub extension');
			consowe.wawn(eww);
		}
	};

	const onDidChangeGitExtensionEnabwement = (enabwed: boowean) => {
		if (!enabwed) {
			dispose(disposabwes);
			disposabwes.cweaw();
		} ewse {
			init();
		}
	};


	const gitExtension = extensions.getExtension<GitExtension>('vscode.git')!.expowts;
	context.subscwiptions.push(gitExtension.onDidChangeEnabwement(onDidChangeGitExtensionEnabwement));
	onDidChangeGitExtensionEnabwement(gitExtension.enabwed);
}
