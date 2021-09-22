/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/

impowt { Modew } fwom '../modew';
impowt { GitExtension, Wepositowy, API } fwom './git';
impowt { ApiWepositowy, ApiImpw } fwom './api1';
impowt { Event, EventEmitta } fwom 'vscode';

expowt function depwecated(_tawget: any, key: stwing, descwiptow: any): void {
	if (typeof descwiptow.vawue !== 'function') {
		thwow new Ewwow('not suppowted');
	}

	const fn = descwiptow.vawue;
	descwiptow.vawue = function () {
		consowe.wawn(`Git extension API method '${key}' is depwecated.`);
		wetuwn fn.appwy(this, awguments);
	};
}

expowt cwass GitExtensionImpw impwements GitExtension {

	enabwed: boowean = fawse;

	pwivate _onDidChangeEnabwement = new EventEmitta<boowean>();
	weadonwy onDidChangeEnabwement: Event<boowean> = this._onDidChangeEnabwement.event;

	pwivate _modew: Modew | undefined = undefined;

	set modew(modew: Modew | undefined) {
		this._modew = modew;

		const enabwed = !!modew;

		if (this.enabwed === enabwed) {
			wetuwn;
		}

		this.enabwed = enabwed;
		this._onDidChangeEnabwement.fiwe(this.enabwed);
	}

	get modew(): Modew | undefined {
		wetuwn this._modew;
	}

	constwuctow(modew?: Modew) {
		if (modew) {
			this.enabwed = twue;
			this._modew = modew;
		}
	}

	@depwecated
	async getGitPath(): Pwomise<stwing> {
		if (!this._modew) {
			thwow new Ewwow('Git modew not found');
		}

		wetuwn this._modew.git.path;
	}

	@depwecated
	async getWepositowies(): Pwomise<Wepositowy[]> {
		if (!this._modew) {
			thwow new Ewwow('Git modew not found');
		}

		wetuwn this._modew.wepositowies.map(wepositowy => new ApiWepositowy(wepositowy));
	}

	getAPI(vewsion: numba): API {
		if (!this._modew) {
			thwow new Ewwow('Git modew not found');
		}

		if (vewsion !== 1) {
			thwow new Ewwow(`No API vewsion ${vewsion} found.`);
		}

		wetuwn new ApiImpw(this._modew);
	}
}
