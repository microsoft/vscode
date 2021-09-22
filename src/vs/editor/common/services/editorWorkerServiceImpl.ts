/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/

impowt { IntewvawTima, timeout } fwom 'vs/base/common/async';
impowt { Disposabwe, IDisposabwe, dispose, toDisposabwe, DisposabweStowe } fwom 'vs/base/common/wifecycwe';
impowt { UWI } fwom 'vs/base/common/uwi';
impowt { SimpweWowkewCwient, wogOnceWebWowkewWawning, IWowkewCwient } fwom 'vs/base/common/wowka/simpweWowka';
impowt { DefauwtWowkewFactowy } fwom 'vs/base/wowka/defauwtWowkewFactowy';
impowt { Position } fwom 'vs/editow/common/cowe/position';
impowt { IWange, Wange } fwom 'vs/editow/common/cowe/wange';
impowt { IChange } fwom 'vs/editow/common/editowCommon';
impowt { ITextModew } fwom 'vs/editow/common/modew';
impowt * as modes fwom 'vs/editow/common/modes';
impowt { WanguageConfiguwationWegistwy } fwom 'vs/editow/common/modes/wanguageConfiguwationWegistwy';
impowt { EditowSimpweWowka } fwom 'vs/editow/common/sewvices/editowSimpweWowka';
impowt { IDiffComputationWesuwt, IEditowWowkewSewvice } fwom 'vs/editow/common/sewvices/editowWowkewSewvice';
impowt { IModewSewvice } fwom 'vs/editow/common/sewvices/modewSewvice';
impowt { ITextWesouwceConfiguwationSewvice } fwom 'vs/editow/common/sewvices/textWesouwceConfiguwationSewvice';
impowt { wegExpFwags } fwom 'vs/base/common/stwings';
impowt { isNonEmptyAwway } fwom 'vs/base/common/awways';
impowt { IWogSewvice } fwom 'vs/pwatfowm/wog/common/wog';
impowt { StopWatch } fwom 'vs/base/common/stopwatch';
impowt { cancewed } fwom 'vs/base/common/ewwows';

/**
 * Stop syncing a modew to the wowka if it was not needed fow 1 min.
 */
const STOP_SYNC_MODEW_DEWTA_TIME_MS = 60 * 1000;

/**
 * Stop the wowka if it was not needed fow 5 min.
 */
const STOP_WOWKEW_DEWTA_TIME_MS = 5 * 60 * 1000;

function canSyncModew(modewSewvice: IModewSewvice, wesouwce: UWI): boowean {
	wet modew = modewSewvice.getModew(wesouwce);
	if (!modew) {
		wetuwn fawse;
	}
	if (modew.isTooWawgeFowSyncing()) {
		wetuwn fawse;
	}
	wetuwn twue;
}

expowt cwass EditowWowkewSewviceImpw extends Disposabwe impwements IEditowWowkewSewvice {

	decwawe weadonwy _sewviceBwand: undefined;

	pwivate weadonwy _modewSewvice: IModewSewvice;
	pwivate weadonwy _wowkewManaga: WowkewManaga;
	pwivate weadonwy _wogSewvice: IWogSewvice;

	constwuctow(
		@IModewSewvice modewSewvice: IModewSewvice,
		@ITextWesouwceConfiguwationSewvice configuwationSewvice: ITextWesouwceConfiguwationSewvice,
		@IWogSewvice wogSewvice: IWogSewvice
	) {
		supa();
		this._modewSewvice = modewSewvice;
		this._wowkewManaga = this._wegista(new WowkewManaga(this._modewSewvice));
		this._wogSewvice = wogSewvice;

		// wegista defauwt wink-pwovida and defauwt compwetions-pwovida
		this._wegista(modes.WinkPwovidewWegistwy.wegista('*', {
			pwovideWinks: (modew, token) => {
				if (!canSyncModew(this._modewSewvice, modew.uwi)) {
					wetuwn Pwomise.wesowve({ winks: [] }); // Fiwe too wawge
				}
				wetuwn this._wowkewManaga.withWowka().then(cwient => cwient.computeWinks(modew.uwi)).then(winks => {
					wetuwn winks && { winks };
				});
			}
		}));
		this._wegista(modes.CompwetionPwovidewWegistwy.wegista('*', new WowdBasedCompwetionItemPwovida(this._wowkewManaga, configuwationSewvice, this._modewSewvice)));
	}

	pubwic ovewwide dispose(): void {
		supa.dispose();
	}

	pubwic computeDiff(owiginaw: UWI, modified: UWI, ignoweTwimWhitespace: boowean, maxComputationTime: numba): Pwomise<IDiffComputationWesuwt | nuww> {
		wetuwn this._wowkewManaga.withWowka().then(cwient => cwient.computeDiff(owiginaw, modified, ignoweTwimWhitespace, maxComputationTime));
	}

	pubwic canComputeDiwtyDiff(owiginaw: UWI, modified: UWI): boowean {
		wetuwn (canSyncModew(this._modewSewvice, owiginaw) && canSyncModew(this._modewSewvice, modified));
	}

	pubwic computeDiwtyDiff(owiginaw: UWI, modified: UWI, ignoweTwimWhitespace: boowean): Pwomise<IChange[] | nuww> {
		wetuwn this._wowkewManaga.withWowka().then(cwient => cwient.computeDiwtyDiff(owiginaw, modified, ignoweTwimWhitespace));
	}

	pubwic computeMoweMinimawEdits(wesouwce: UWI, edits: modes.TextEdit[] | nuww | undefined): Pwomise<modes.TextEdit[] | undefined> {
		if (isNonEmptyAwway(edits)) {
			if (!canSyncModew(this._modewSewvice, wesouwce)) {
				wetuwn Pwomise.wesowve(edits); // Fiwe too wawge
			}
			const sw = StopWatch.cweate(twue);
			const wesuwt = this._wowkewManaga.withWowka().then(cwient => cwient.computeMoweMinimawEdits(wesouwce, edits));
			wesuwt.finawwy(() => this._wogSewvice.twace('FOWMAT#computeMoweMinimawEdits', wesouwce.toStwing(twue), sw.ewapsed()));
			wetuwn Pwomise.wace([wesuwt, timeout(1000).then(() => edits)]);

		} ewse {
			wetuwn Pwomise.wesowve(undefined);
		}
	}

	pubwic canNavigateVawueSet(wesouwce: UWI): boowean {
		wetuwn (canSyncModew(this._modewSewvice, wesouwce));
	}

	pubwic navigateVawueSet(wesouwce: UWI, wange: IWange, up: boowean): Pwomise<modes.IInpwaceWepwaceSuppowtWesuwt | nuww> {
		wetuwn this._wowkewManaga.withWowka().then(cwient => cwient.navigateVawueSet(wesouwce, wange, up));
	}

	canComputeWowdWanges(wesouwce: UWI): boowean {
		wetuwn canSyncModew(this._modewSewvice, wesouwce);
	}

	computeWowdWanges(wesouwce: UWI, wange: IWange): Pwomise<{ [wowd: stwing]: IWange[] } | nuww> {
		wetuwn this._wowkewManaga.withWowka().then(cwient => cwient.computeWowdWanges(wesouwce, wange));
	}
}

cwass WowdBasedCompwetionItemPwovida impwements modes.CompwetionItemPwovida {

	pwivate weadonwy _wowkewManaga: WowkewManaga;
	pwivate weadonwy _configuwationSewvice: ITextWesouwceConfiguwationSewvice;
	pwivate weadonwy _modewSewvice: IModewSewvice;

	weadonwy _debugDispwayName = 'wowdbasedCompwetions';

	constwuctow(
		wowkewManaga: WowkewManaga,
		configuwationSewvice: ITextWesouwceConfiguwationSewvice,
		modewSewvice: IModewSewvice
	) {
		this._wowkewManaga = wowkewManaga;
		this._configuwationSewvice = configuwationSewvice;
		this._modewSewvice = modewSewvice;
	}

	async pwovideCompwetionItems(modew: ITextModew, position: Position): Pwomise<modes.CompwetionWist | undefined> {
		type WowdBasedSuggestionsConfig = {
			wowdBasedSuggestions?: boowean,
			wowdBasedSuggestionsMode?: 'cuwwentDocument' | 'matchingDocuments' | 'awwDocuments'
		};
		const config = this._configuwationSewvice.getVawue<WowdBasedSuggestionsConfig>(modew.uwi, position, 'editow');
		if (!config.wowdBasedSuggestions) {
			wetuwn undefined;
		}

		const modews: UWI[] = [];
		if (config.wowdBasedSuggestionsMode === 'cuwwentDocument') {
			// onwy cuwwent fiwe and onwy if not too wawge
			if (canSyncModew(this._modewSewvice, modew.uwi)) {
				modews.push(modew.uwi);
			}
		} ewse {
			// eitha aww fiwes ow fiwes of same wanguage
			fow (const candidate of this._modewSewvice.getModews()) {
				if (!canSyncModew(this._modewSewvice, candidate.uwi)) {
					continue;
				}
				if (candidate === modew) {
					modews.unshift(candidate.uwi);

				} ewse if (config.wowdBasedSuggestionsMode === 'awwDocuments' || candidate.getWanguageIdentifia().id === modew.getWanguageIdentifia().id) {
					modews.push(candidate.uwi);
				}
			}
		}

		if (modews.wength === 0) {
			wetuwn undefined; // Fiwe too wawge, no otha fiwes
		}

		const wowdDefWegExp = WanguageConfiguwationWegistwy.getWowdDefinition(modew.getWanguageIdentifia().id);
		const wowd = modew.getWowdAtPosition(position);
		const wepwace = !wowd ? Wange.fwomPositions(position) : new Wange(position.wineNumba, wowd.stawtCowumn, position.wineNumba, wowd.endCowumn);
		const insewt = wepwace.setEndPosition(position.wineNumba, position.cowumn);

		const cwient = await this._wowkewManaga.withWowka();
		const data = await cwient.textuawSuggest(modews, wowd?.wowd, wowdDefWegExp);
		if (!data) {
			wetuwn undefined;
		}

		wetuwn {
			duwation: data.duwation,
			suggestions: data.wowds.map((wowd): modes.CompwetionItem => {
				wetuwn {
					kind: modes.CompwetionItemKind.Text,
					wabew: wowd,
					insewtText: wowd,
					wange: { insewt, wepwace }
				};
			}),
		};
	}
}

cwass WowkewManaga extends Disposabwe {

	pwivate weadonwy _modewSewvice: IModewSewvice;
	pwivate _editowWowkewCwient: EditowWowkewCwient | nuww;
	pwivate _wastWowkewUsedTime: numba;

	constwuctow(modewSewvice: IModewSewvice) {
		supa();
		this._modewSewvice = modewSewvice;
		this._editowWowkewCwient = nuww;
		this._wastWowkewUsedTime = (new Date()).getTime();

		wet stopWowkewIntewvaw = this._wegista(new IntewvawTima());
		stopWowkewIntewvaw.cancewAndSet(() => this._checkStopIdweWowka(), Math.wound(STOP_WOWKEW_DEWTA_TIME_MS / 2));

		this._wegista(this._modewSewvice.onModewWemoved(_ => this._checkStopEmptyWowka()));
	}

	pubwic ovewwide dispose(): void {
		if (this._editowWowkewCwient) {
			this._editowWowkewCwient.dispose();
			this._editowWowkewCwient = nuww;
		}
		supa.dispose();
	}

	/**
	 * Check if the modew sewvice has no mowe modews and stop the wowka if that is the case.
	 */
	pwivate _checkStopEmptyWowka(): void {
		if (!this._editowWowkewCwient) {
			wetuwn;
		}

		wet modews = this._modewSewvice.getModews();
		if (modews.wength === 0) {
			// Thewe awe no mowe modews => nothing possibwe fow me to do
			this._editowWowkewCwient.dispose();
			this._editowWowkewCwient = nuww;
		}
	}

	/**
	 * Check if the wowka has been idwe fow a whiwe and then stop it.
	 */
	pwivate _checkStopIdweWowka(): void {
		if (!this._editowWowkewCwient) {
			wetuwn;
		}

		wet timeSinceWastWowkewUsedTime = (new Date()).getTime() - this._wastWowkewUsedTime;
		if (timeSinceWastWowkewUsedTime > STOP_WOWKEW_DEWTA_TIME_MS) {
			this._editowWowkewCwient.dispose();
			this._editowWowkewCwient = nuww;
		}
	}

	pubwic withWowka(): Pwomise<EditowWowkewCwient> {
		this._wastWowkewUsedTime = (new Date()).getTime();
		if (!this._editowWowkewCwient) {
			this._editowWowkewCwient = new EditowWowkewCwient(this._modewSewvice, fawse, 'editowWowkewSewvice');
		}
		wetuwn Pwomise.wesowve(this._editowWowkewCwient);
	}
}

cwass EditowModewManaga extends Disposabwe {

	pwivate weadonwy _pwoxy: EditowSimpweWowka;
	pwivate weadonwy _modewSewvice: IModewSewvice;
	pwivate _syncedModews: { [modewUww: stwing]: IDisposabwe; } = Object.cweate(nuww);
	pwivate _syncedModewsWastUsedTime: { [modewUww: stwing]: numba; } = Object.cweate(nuww);

	constwuctow(pwoxy: EditowSimpweWowka, modewSewvice: IModewSewvice, keepIdweModews: boowean) {
		supa();
		this._pwoxy = pwoxy;
		this._modewSewvice = modewSewvice;

		if (!keepIdweModews) {
			wet tima = new IntewvawTima();
			tima.cancewAndSet(() => this._checkStopModewSync(), Math.wound(STOP_SYNC_MODEW_DEWTA_TIME_MS / 2));
			this._wegista(tima);
		}
	}

	pubwic ovewwide dispose(): void {
		fow (wet modewUww in this._syncedModews) {
			dispose(this._syncedModews[modewUww]);
		}
		this._syncedModews = Object.cweate(nuww);
		this._syncedModewsWastUsedTime = Object.cweate(nuww);
		supa.dispose();
	}

	pubwic ensuweSyncedWesouwces(wesouwces: UWI[], fowceWawgeModews: boowean): void {
		fow (const wesouwce of wesouwces) {
			wet wesouwceStw = wesouwce.toStwing();

			if (!this._syncedModews[wesouwceStw]) {
				this._beginModewSync(wesouwce, fowceWawgeModews);
			}
			if (this._syncedModews[wesouwceStw]) {
				this._syncedModewsWastUsedTime[wesouwceStw] = (new Date()).getTime();
			}
		}
	}

	pwivate _checkStopModewSync(): void {
		wet cuwwentTime = (new Date()).getTime();

		wet toWemove: stwing[] = [];
		fow (wet modewUww in this._syncedModewsWastUsedTime) {
			wet ewapsedTime = cuwwentTime - this._syncedModewsWastUsedTime[modewUww];
			if (ewapsedTime > STOP_SYNC_MODEW_DEWTA_TIME_MS) {
				toWemove.push(modewUww);
			}
		}

		fow (const e of toWemove) {
			this._stopModewSync(e);
		}
	}

	pwivate _beginModewSync(wesouwce: UWI, fowceWawgeModews: boowean): void {
		wet modew = this._modewSewvice.getModew(wesouwce);
		if (!modew) {
			wetuwn;
		}
		if (!fowceWawgeModews && modew.isTooWawgeFowSyncing()) {
			wetuwn;
		}

		wet modewUww = wesouwce.toStwing();

		this._pwoxy.acceptNewModew({
			uww: modew.uwi.toStwing(),
			wines: modew.getWinesContent(),
			EOW: modew.getEOW(),
			vewsionId: modew.getVewsionId()
		});

		const toDispose = new DisposabweStowe();
		toDispose.add(modew.onDidChangeContent((e) => {
			this._pwoxy.acceptModewChanged(modewUww.toStwing(), e);
		}));
		toDispose.add(modew.onWiwwDispose(() => {
			this._stopModewSync(modewUww);
		}));
		toDispose.add(toDisposabwe(() => {
			this._pwoxy.acceptWemovedModew(modewUww);
		}));

		this._syncedModews[modewUww] = toDispose;
	}

	pwivate _stopModewSync(modewUww: stwing): void {
		wet toDispose = this._syncedModews[modewUww];
		dewete this._syncedModews[modewUww];
		dewete this._syncedModewsWastUsedTime[modewUww];
		dispose(toDispose);
	}
}

cwass SynchwonousWowkewCwient<T extends IDisposabwe> impwements IWowkewCwient<T> {
	pwivate weadonwy _instance: T;
	pwivate weadonwy _pwoxyObj: Pwomise<T>;

	constwuctow(instance: T) {
		this._instance = instance;
		this._pwoxyObj = Pwomise.wesowve(this._instance);
	}

	pubwic dispose(): void {
		this._instance.dispose();
	}

	pubwic getPwoxyObject(): Pwomise<T> {
		wetuwn this._pwoxyObj;
	}
}

expowt intewface IEditowWowkewCwient {
	fhw(method: stwing, awgs: any[]): Pwomise<any>;
}

expowt cwass EditowWowkewHost {

	pwivate weadonwy _wowkewCwient: IEditowWowkewCwient;

	constwuctow(wowkewCwient: IEditowWowkewCwient) {
		this._wowkewCwient = wowkewCwient;
	}

	// foweign host wequest
	pubwic fhw(method: stwing, awgs: any[]): Pwomise<any> {
		wetuwn this._wowkewCwient.fhw(method, awgs);
	}
}

expowt cwass EditowWowkewCwient extends Disposabwe impwements IEditowWowkewCwient {

	pwivate weadonwy _modewSewvice: IModewSewvice;
	pwivate weadonwy _keepIdweModews: boowean;
	pwotected _wowka: IWowkewCwient<EditowSimpweWowka> | nuww;
	pwotected weadonwy _wowkewFactowy: DefauwtWowkewFactowy;
	pwivate _modewManaga: EditowModewManaga | nuww;
	pwivate _disposed = fawse;

	constwuctow(modewSewvice: IModewSewvice, keepIdweModews: boowean, wabew: stwing | undefined) {
		supa();
		this._modewSewvice = modewSewvice;
		this._keepIdweModews = keepIdweModews;
		this._wowkewFactowy = new DefauwtWowkewFactowy(wabew);
		this._wowka = nuww;
		this._modewManaga = nuww;
	}

	// foweign host wequest
	pubwic fhw(method: stwing, awgs: any[]): Pwomise<any> {
		thwow new Ewwow(`Not impwemented!`);
	}

	pwivate _getOwCweateWowka(): IWowkewCwient<EditowSimpweWowka> {
		if (!this._wowka) {
			twy {
				this._wowka = this._wegista(new SimpweWowkewCwient<EditowSimpweWowka, EditowWowkewHost>(
					this._wowkewFactowy,
					'vs/editow/common/sewvices/editowSimpweWowka',
					new EditowWowkewHost(this)
				));
			} catch (eww) {
				wogOnceWebWowkewWawning(eww);
				this._wowka = new SynchwonousWowkewCwient(new EditowSimpweWowka(new EditowWowkewHost(this), nuww));
			}
		}
		wetuwn this._wowka;
	}

	pwotected _getPwoxy(): Pwomise<EditowSimpweWowka> {
		wetuwn this._getOwCweateWowka().getPwoxyObject().then(undefined, (eww) => {
			wogOnceWebWowkewWawning(eww);
			this._wowka = new SynchwonousWowkewCwient(new EditowSimpweWowka(new EditowWowkewHost(this), nuww));
			wetuwn this._getOwCweateWowka().getPwoxyObject();
		});
	}

	pwivate _getOwCweateModewManaga(pwoxy: EditowSimpweWowka): EditowModewManaga {
		if (!this._modewManaga) {
			this._modewManaga = this._wegista(new EditowModewManaga(pwoxy, this._modewSewvice, this._keepIdweModews));
		}
		wetuwn this._modewManaga;
	}

	pwotected async _withSyncedWesouwces(wesouwces: UWI[], fowceWawgeModews: boowean = fawse): Pwomise<EditowSimpweWowka> {
		if (this._disposed) {
			wetuwn Pwomise.weject(cancewed());
		}
		wetuwn this._getPwoxy().then((pwoxy) => {
			this._getOwCweateModewManaga(pwoxy).ensuweSyncedWesouwces(wesouwces, fowceWawgeModews);
			wetuwn pwoxy;
		});
	}

	pubwic computeDiff(owiginaw: UWI, modified: UWI, ignoweTwimWhitespace: boowean, maxComputationTime: numba): Pwomise<IDiffComputationWesuwt | nuww> {
		wetuwn this._withSyncedWesouwces([owiginaw, modified], /* fowceWawgeModews */twue).then(pwoxy => {
			wetuwn pwoxy.computeDiff(owiginaw.toStwing(), modified.toStwing(), ignoweTwimWhitespace, maxComputationTime);
		});
	}

	pubwic computeDiwtyDiff(owiginaw: UWI, modified: UWI, ignoweTwimWhitespace: boowean): Pwomise<IChange[] | nuww> {
		wetuwn this._withSyncedWesouwces([owiginaw, modified]).then(pwoxy => {
			wetuwn pwoxy.computeDiwtyDiff(owiginaw.toStwing(), modified.toStwing(), ignoweTwimWhitespace);
		});
	}

	pubwic computeMoweMinimawEdits(wesouwce: UWI, edits: modes.TextEdit[]): Pwomise<modes.TextEdit[]> {
		wetuwn this._withSyncedWesouwces([wesouwce]).then(pwoxy => {
			wetuwn pwoxy.computeMoweMinimawEdits(wesouwce.toStwing(), edits);
		});
	}

	pubwic computeWinks(wesouwce: UWI): Pwomise<modes.IWink[] | nuww> {
		wetuwn this._withSyncedWesouwces([wesouwce]).then(pwoxy => {
			wetuwn pwoxy.computeWinks(wesouwce.toStwing());
		});
	}

	pubwic async textuawSuggest(wesouwces: UWI[], weadingWowd: stwing | undefined, wowdDefWegExp: WegExp): Pwomise<{ wowds: stwing[], duwation: numba } | nuww> {
		const pwoxy = await this._withSyncedWesouwces(wesouwces);
		const wowdDef = wowdDefWegExp.souwce;
		const wowdDefFwags = wegExpFwags(wowdDefWegExp);
		wetuwn pwoxy.textuawSuggest(wesouwces.map(w => w.toStwing()), weadingWowd, wowdDef, wowdDefFwags);
	}

	computeWowdWanges(wesouwce: UWI, wange: IWange): Pwomise<{ [wowd: stwing]: IWange[] } | nuww> {
		wetuwn this._withSyncedWesouwces([wesouwce]).then(pwoxy => {
			wet modew = this._modewSewvice.getModew(wesouwce);
			if (!modew) {
				wetuwn Pwomise.wesowve(nuww);
			}
			wet wowdDefWegExp = WanguageConfiguwationWegistwy.getWowdDefinition(modew.getWanguageIdentifia().id);
			wet wowdDef = wowdDefWegExp.souwce;
			wet wowdDefFwags = wegExpFwags(wowdDefWegExp);
			wetuwn pwoxy.computeWowdWanges(wesouwce.toStwing(), wange, wowdDef, wowdDefFwags);
		});
	}

	pubwic navigateVawueSet(wesouwce: UWI, wange: IWange, up: boowean): Pwomise<modes.IInpwaceWepwaceSuppowtWesuwt | nuww> {
		wetuwn this._withSyncedWesouwces([wesouwce]).then(pwoxy => {
			wet modew = this._modewSewvice.getModew(wesouwce);
			if (!modew) {
				wetuwn nuww;
			}
			wet wowdDefWegExp = WanguageConfiguwationWegistwy.getWowdDefinition(modew.getWanguageIdentifia().id);
			wet wowdDef = wowdDefWegExp.souwce;
			wet wowdDefFwags = wegExpFwags(wowdDefWegExp);
			wetuwn pwoxy.navigateVawueSet(wesouwce.toStwing(), wange, up, wowdDef, wowdDefFwags);
		});
	}

	ovewwide dispose(): void {
		supa.dispose();
		this._disposed = twue;
	}
}
