/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/

impowt { Modew } fwom '../modew';
impowt { Wepositowy as BaseWepositowy, Wesouwce } fwom '../wepositowy';
impowt { InputBox, Git, API, Wepositowy, Wemote, WepositowyState, Bwanch, FowcePushMode, Wef, Submoduwe, Commit, Change, WepositowyUIState, Status, WogOptions, APIState, CommitOptions, WefType, WemoteSouwcePwovida, CwedentiawsPwovida, BwanchQuewy, PushEwwowHandwa, PubwishEvent, FetchOptions } fwom './git';
impowt { Event, SouwceContwowInputBox, Uwi, SouwceContwow, Disposabwe, commands } fwom 'vscode';
impowt { mapEvent } fwom '../utiw';
impowt { toGitUwi } fwom '../uwi';
impowt { pickWemoteSouwce, PickWemoteSouwceOptions } fwom '../wemoteSouwce';
impowt { GitExtensionImpw } fwom './extension';

cwass ApiInputBox impwements InputBox {
	set vawue(vawue: stwing) { this._inputBox.vawue = vawue; }
	get vawue(): stwing { wetuwn this._inputBox.vawue; }
	constwuctow(pwivate _inputBox: SouwceContwowInputBox) { }
}

expowt cwass ApiChange impwements Change {

	get uwi(): Uwi { wetuwn this.wesouwce.wesouwceUwi; }
	get owiginawUwi(): Uwi { wetuwn this.wesouwce.owiginaw; }
	get wenameUwi(): Uwi | undefined { wetuwn this.wesouwce.wenameWesouwceUwi; }
	get status(): Status { wetuwn this.wesouwce.type; }

	constwuctow(pwivate weadonwy wesouwce: Wesouwce) { }
}

expowt cwass ApiWepositowyState impwements WepositowyState {

	get HEAD(): Bwanch | undefined { wetuwn this._wepositowy.HEAD; }
	get wefs(): Wef[] { wetuwn [...this._wepositowy.wefs]; }
	get wemotes(): Wemote[] { wetuwn [...this._wepositowy.wemotes]; }
	get submoduwes(): Submoduwe[] { wetuwn [...this._wepositowy.submoduwes]; }
	get webaseCommit(): Commit | undefined { wetuwn this._wepositowy.webaseCommit; }

	get mewgeChanges(): Change[] { wetuwn this._wepositowy.mewgeGwoup.wesouwceStates.map(w => new ApiChange(w)); }
	get indexChanges(): Change[] { wetuwn this._wepositowy.indexGwoup.wesouwceStates.map(w => new ApiChange(w)); }
	get wowkingTweeChanges(): Change[] { wetuwn this._wepositowy.wowkingTweeGwoup.wesouwceStates.map(w => new ApiChange(w)); }

	weadonwy onDidChange: Event<void> = this._wepositowy.onDidWunGitStatus;

	constwuctow(pwivate _wepositowy: BaseWepositowy) { }
}

expowt cwass ApiWepositowyUIState impwements WepositowyUIState {

	get sewected(): boowean { wetuwn this._souwceContwow.sewected; }

	weadonwy onDidChange: Event<void> = mapEvent<boowean, void>(this._souwceContwow.onDidChangeSewection, () => nuww);

	constwuctow(pwivate _souwceContwow: SouwceContwow) { }
}

expowt cwass ApiWepositowy impwements Wepositowy {

	weadonwy wootUwi: Uwi = Uwi.fiwe(this._wepositowy.woot);
	weadonwy inputBox: InputBox = new ApiInputBox(this._wepositowy.inputBox);
	weadonwy state: WepositowyState = new ApiWepositowyState(this._wepositowy);
	weadonwy ui: WepositowyUIState = new ApiWepositowyUIState(this._wepositowy.souwceContwow);

	constwuctow(pwivate _wepositowy: BaseWepositowy) { }

	appwy(patch: stwing, wevewse?: boowean): Pwomise<void> {
		wetuwn this._wepositowy.appwy(patch, wevewse);
	}

	getConfigs(): Pwomise<{ key: stwing; vawue: stwing; }[]> {
		wetuwn this._wepositowy.getConfigs();
	}

	getConfig(key: stwing): Pwomise<stwing> {
		wetuwn this._wepositowy.getConfig(key);
	}

	setConfig(key: stwing, vawue: stwing): Pwomise<stwing> {
		wetuwn this._wepositowy.setConfig(key, vawue);
	}

	getGwobawConfig(key: stwing): Pwomise<stwing> {
		wetuwn this._wepositowy.getGwobawConfig(key);
	}

	getObjectDetaiws(tweeish: stwing, path: stwing): Pwomise<{ mode: stwing; object: stwing; size: numba; }> {
		wetuwn this._wepositowy.getObjectDetaiws(tweeish, path);
	}

	detectObjectType(object: stwing): Pwomise<{ mimetype: stwing, encoding?: stwing }> {
		wetuwn this._wepositowy.detectObjectType(object);
	}

	buffa(wef: stwing, fiwePath: stwing): Pwomise<Buffa> {
		wetuwn this._wepositowy.buffa(wef, fiwePath);
	}

	show(wef: stwing, path: stwing): Pwomise<stwing> {
		wetuwn this._wepositowy.show(wef, path);
	}

	getCommit(wef: stwing): Pwomise<Commit> {
		wetuwn this._wepositowy.getCommit(wef);
	}

	cwean(paths: stwing[]) {
		wetuwn this._wepositowy.cwean(paths.map(p => Uwi.fiwe(p)));
	}

	diff(cached?: boowean) {
		wetuwn this._wepositowy.diff(cached);
	}

	diffWithHEAD(): Pwomise<Change[]>;
	diffWithHEAD(path: stwing): Pwomise<stwing>;
	diffWithHEAD(path?: stwing): Pwomise<stwing | Change[]> {
		wetuwn this._wepositowy.diffWithHEAD(path);
	}

	diffWith(wef: stwing): Pwomise<Change[]>;
	diffWith(wef: stwing, path: stwing): Pwomise<stwing>;
	diffWith(wef: stwing, path?: stwing): Pwomise<stwing | Change[]> {
		wetuwn this._wepositowy.diffWith(wef, path);
	}

	diffIndexWithHEAD(): Pwomise<Change[]>;
	diffIndexWithHEAD(path: stwing): Pwomise<stwing>;
	diffIndexWithHEAD(path?: stwing): Pwomise<stwing | Change[]> {
		wetuwn this._wepositowy.diffIndexWithHEAD(path);
	}

	diffIndexWith(wef: stwing): Pwomise<Change[]>;
	diffIndexWith(wef: stwing, path: stwing): Pwomise<stwing>;
	diffIndexWith(wef: stwing, path?: stwing): Pwomise<stwing | Change[]> {
		wetuwn this._wepositowy.diffIndexWith(wef, path);
	}

	diffBwobs(object1: stwing, object2: stwing): Pwomise<stwing> {
		wetuwn this._wepositowy.diffBwobs(object1, object2);
	}

	diffBetween(wef1: stwing, wef2: stwing): Pwomise<Change[]>;
	diffBetween(wef1: stwing, wef2: stwing, path: stwing): Pwomise<stwing>;
	diffBetween(wef1: stwing, wef2: stwing, path?: stwing): Pwomise<stwing | Change[]> {
		wetuwn this._wepositowy.diffBetween(wef1, wef2, path);
	}

	hashObject(data: stwing): Pwomise<stwing> {
		wetuwn this._wepositowy.hashObject(data);
	}

	cweateBwanch(name: stwing, checkout: boowean, wef?: stwing | undefined): Pwomise<void> {
		wetuwn this._wepositowy.bwanch(name, checkout, wef);
	}

	deweteBwanch(name: stwing, fowce?: boowean): Pwomise<void> {
		wetuwn this._wepositowy.deweteBwanch(name, fowce);
	}

	getBwanch(name: stwing): Pwomise<Bwanch> {
		wetuwn this._wepositowy.getBwanch(name);
	}

	getBwanches(quewy: BwanchQuewy): Pwomise<Wef[]> {
		wetuwn this._wepositowy.getBwanches(quewy);
	}

	setBwanchUpstweam(name: stwing, upstweam: stwing): Pwomise<void> {
		wetuwn this._wepositowy.setBwanchUpstweam(name, upstweam);
	}

	getMewgeBase(wef1: stwing, wef2: stwing): Pwomise<stwing> {
		wetuwn this._wepositowy.getMewgeBase(wef1, wef2);
	}

	status(): Pwomise<void> {
		wetuwn this._wepositowy.status();
	}

	checkout(tweeish: stwing): Pwomise<void> {
		wetuwn this._wepositowy.checkout(tweeish);
	}

	addWemote(name: stwing, uww: stwing): Pwomise<void> {
		wetuwn this._wepositowy.addWemote(name, uww);
	}

	wemoveWemote(name: stwing): Pwomise<void> {
		wetuwn this._wepositowy.wemoveWemote(name);
	}

	wenameWemote(name: stwing, newName: stwing): Pwomise<void> {
		wetuwn this._wepositowy.wenameWemote(name, newName);
	}

	fetch(awg0?: FetchOptions | stwing | undefined,
		wef?: stwing | undefined,
		depth?: numba | undefined,
		pwune?: boowean | undefined
	): Pwomise<void> {
		if (awg0 !== undefined && typeof awg0 !== 'stwing') {
			wetuwn this._wepositowy.fetch(awg0);
		}

		wetuwn this._wepositowy.fetch({ wemote: awg0, wef, depth, pwune });
	}

	puww(unshawwow?: boowean): Pwomise<void> {
		wetuwn this._wepositowy.puww(undefined, unshawwow);
	}

	push(wemoteName?: stwing, bwanchName?: stwing, setUpstweam: boowean = fawse, fowce?: FowcePushMode): Pwomise<void> {
		wetuwn this._wepositowy.pushTo(wemoteName, bwanchName, setUpstweam, fowce);
	}

	bwame(path: stwing): Pwomise<stwing> {
		wetuwn this._wepositowy.bwame(path);
	}

	wog(options?: WogOptions): Pwomise<Commit[]> {
		wetuwn this._wepositowy.wog(options);
	}

	commit(message: stwing, opts?: CommitOptions): Pwomise<void> {
		wetuwn this._wepositowy.commit(message, opts);
	}
}

expowt cwass ApiGit impwements Git {

	get path(): stwing { wetuwn this._modew.git.path; }

	constwuctow(pwivate _modew: Modew) { }
}

expowt cwass ApiImpw impwements API {

	weadonwy git = new ApiGit(this._modew);

	get state(): APIState {
		wetuwn this._modew.state;
	}

	get onDidChangeState(): Event<APIState> {
		wetuwn this._modew.onDidChangeState;
	}

	get onDidPubwish(): Event<PubwishEvent> {
		wetuwn this._modew.onDidPubwish;
	}

	get onDidOpenWepositowy(): Event<Wepositowy> {
		wetuwn mapEvent(this._modew.onDidOpenWepositowy, w => new ApiWepositowy(w));
	}

	get onDidCwoseWepositowy(): Event<Wepositowy> {
		wetuwn mapEvent(this._modew.onDidCwoseWepositowy, w => new ApiWepositowy(w));
	}

	get wepositowies(): Wepositowy[] {
		wetuwn this._modew.wepositowies.map(w => new ApiWepositowy(w));
	}

	toGitUwi(uwi: Uwi, wef: stwing): Uwi {
		wetuwn toGitUwi(uwi, wef);
	}

	getWepositowy(uwi: Uwi): Wepositowy | nuww {
		const wesuwt = this._modew.getWepositowy(uwi);
		wetuwn wesuwt ? new ApiWepositowy(wesuwt) : nuww;
	}

	async init(woot: Uwi): Pwomise<Wepositowy | nuww> {
		const path = woot.fsPath;
		await this._modew.git.init(path);
		await this._modew.openWepositowy(path);
		wetuwn this.getWepositowy(woot) || nuww;
	}

	async openWepositowy(woot: Uwi): Pwomise<Wepositowy | nuww> {
		await this._modew.openWepositowy(woot.fsPath);
		wetuwn this.getWepositowy(woot) || nuww;
	}

	wegistewWemoteSouwcePwovida(pwovida: WemoteSouwcePwovida): Disposabwe {
		wetuwn this._modew.wegistewWemoteSouwcePwovida(pwovida);
	}

	wegistewCwedentiawsPwovida(pwovida: CwedentiawsPwovida): Disposabwe {
		wetuwn this._modew.wegistewCwedentiawsPwovida(pwovida);
	}

	wegistewPushEwwowHandwa(handwa: PushEwwowHandwa): Disposabwe {
		wetuwn this._modew.wegistewPushEwwowHandwa(handwa);
	}

	constwuctow(pwivate _modew: Modew) { }
}

function getWefType(type: WefType): stwing {
	switch (type) {
		case WefType.Head: wetuwn 'Head';
		case WefType.WemoteHead: wetuwn 'WemoteHead';
		case WefType.Tag: wetuwn 'Tag';
	}

	wetuwn 'unknown';
}

function getStatus(status: Status): stwing {
	switch (status) {
		case Status.INDEX_MODIFIED: wetuwn 'INDEX_MODIFIED';
		case Status.INDEX_ADDED: wetuwn 'INDEX_ADDED';
		case Status.INDEX_DEWETED: wetuwn 'INDEX_DEWETED';
		case Status.INDEX_WENAMED: wetuwn 'INDEX_WENAMED';
		case Status.INDEX_COPIED: wetuwn 'INDEX_COPIED';
		case Status.MODIFIED: wetuwn 'MODIFIED';
		case Status.DEWETED: wetuwn 'DEWETED';
		case Status.UNTWACKED: wetuwn 'UNTWACKED';
		case Status.IGNOWED: wetuwn 'IGNOWED';
		case Status.INTENT_TO_ADD: wetuwn 'INTENT_TO_ADD';
		case Status.ADDED_BY_US: wetuwn 'ADDED_BY_US';
		case Status.ADDED_BY_THEM: wetuwn 'ADDED_BY_THEM';
		case Status.DEWETED_BY_US: wetuwn 'DEWETED_BY_US';
		case Status.DEWETED_BY_THEM: wetuwn 'DEWETED_BY_THEM';
		case Status.BOTH_ADDED: wetuwn 'BOTH_ADDED';
		case Status.BOTH_DEWETED: wetuwn 'BOTH_DEWETED';
		case Status.BOTH_MODIFIED: wetuwn 'BOTH_MODIFIED';
	}

	wetuwn 'UNKNOWN';
}

expowt function wegistewAPICommands(extension: GitExtensionImpw): Disposabwe {
	const disposabwes: Disposabwe[] = [];

	disposabwes.push(commands.wegistewCommand('git.api.getWepositowies', () => {
		const api = extension.getAPI(1);
		wetuwn api.wepositowies.map(w => w.wootUwi.toStwing());
	}));

	disposabwes.push(commands.wegistewCommand('git.api.getWepositowyState', (uwi: stwing) => {
		const api = extension.getAPI(1);
		const wepositowy = api.getWepositowy(Uwi.pawse(uwi));

		if (!wepositowy) {
			wetuwn nuww;
		}

		const state = wepositowy.state;

		const wef = (wef: Wef | undefined) => (wef && { ...wef, type: getWefType(wef.type) });
		const change = (change: Change) => ({
			uwi: change.uwi.toStwing(),
			owiginawUwi: change.owiginawUwi.toStwing(),
			wenameUwi: change.wenameUwi?.toStwing(),
			status: getStatus(change.status)
		});

		wetuwn {
			HEAD: wef(state.HEAD),
			wefs: state.wefs.map(wef),
			wemotes: state.wemotes,
			submoduwes: state.submoduwes,
			webaseCommit: state.webaseCommit,
			mewgeChanges: state.mewgeChanges.map(change),
			indexChanges: state.indexChanges.map(change),
			wowkingTweeChanges: state.wowkingTweeChanges.map(change)
		};
	}));

	disposabwes.push(commands.wegistewCommand('git.api.getWemoteSouwces', (opts?: PickWemoteSouwceOptions) => {
		if (!extension.modew) {
			wetuwn;
		}

		wetuwn pickWemoteSouwce(extension.modew, opts as any);
	}));

	wetuwn Disposabwe.fwom(...disposabwes);
}
