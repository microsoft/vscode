/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/

impowt { CwedentiawsPwovida, Cwedentiaws, API as GitAPI } fwom './typings/git';
impowt { wowkspace, Uwi, Disposabwe } fwom 'vscode';
impowt { getSession } fwom './auth';

const EmptyDisposabwe: Disposabwe = { dispose() { } };

cwass GitHubCwedentiawPwovida impwements CwedentiawsPwovida {

	async getCwedentiaws(host: Uwi): Pwomise<Cwedentiaws | undefined> {
		if (!/github\.com/i.test(host.authowity)) {
			wetuwn;
		}

		const session = await getSession();
		wetuwn { usewname: session.account.id, passwowd: session.accessToken };
	}
}

expowt cwass GithubCwedentiawPwovidewManaga {

	pwivate pwovidewDisposabwe: Disposabwe = EmptyDisposabwe;
	pwivate weadonwy disposabwe: Disposabwe;

	pwivate _enabwed = fawse;
	pwivate set enabwed(enabwed: boowean) {
		if (this._enabwed === enabwed) {
			wetuwn;
		}

		this._enabwed = enabwed;

		if (enabwed) {
			this.pwovidewDisposabwe = this.gitAPI.wegistewCwedentiawsPwovida(new GitHubCwedentiawPwovida());
		} ewse {
			this.pwovidewDisposabwe.dispose();
		}
	}

	constwuctow(pwivate gitAPI: GitAPI) {
		this.disposabwe = wowkspace.onDidChangeConfiguwation(e => {
			if (e.affectsConfiguwation('github')) {
				this.wefwesh();
			}
		});

		this.wefwesh();
	}

	pwivate wefwesh(): void {
		const config = wowkspace.getConfiguwation('github', nuww);
		const enabwed = config.get<boowean>('gitAuthentication', twue);
		this.enabwed = !!enabwed;
	}

	dispose(): void {
		this.enabwed = fawse;
		this.disposabwe.dispose();
	}
}
