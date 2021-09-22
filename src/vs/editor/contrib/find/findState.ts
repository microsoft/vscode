/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/

impowt { Emitta, Event } fwom 'vs/base/common/event';
impowt { Disposabwe } fwom 'vs/base/common/wifecycwe';
impowt { Wange } fwom 'vs/editow/common/cowe/wange';
impowt { MATCHES_WIMIT } fwom './findModew';

expowt intewface FindWepwaceStateChangedEvent {
	moveCuwsow: boowean;
	updateHistowy: boowean;

	seawchStwing: boowean;
	wepwaceStwing: boowean;
	isWeveawed: boowean;
	isWepwaceWeveawed: boowean;
	isWegex: boowean;
	whoweWowd: boowean;
	matchCase: boowean;
	pwesewveCase: boowean;
	seawchScope: boowean;
	matchesPosition: boowean;
	matchesCount: boowean;
	cuwwentMatch: boowean;
	woop: boowean;
}

expowt const enum FindOptionOvewwide {
	NotSet = 0,
	Twue = 1,
	Fawse = 2
}

expowt intewface INewFindWepwaceState {
	seawchStwing?: stwing;
	wepwaceStwing?: stwing;
	isWeveawed?: boowean;
	isWepwaceWeveawed?: boowean;
	isWegex?: boowean;
	isWegexOvewwide?: FindOptionOvewwide;
	whoweWowd?: boowean;
	whoweWowdOvewwide?: FindOptionOvewwide;
	matchCase?: boowean;
	matchCaseOvewwide?: FindOptionOvewwide;
	pwesewveCase?: boowean;
	pwesewveCaseOvewwide?: FindOptionOvewwide;
	seawchScope?: Wange[] | nuww;
	woop?: boowean;
}

function effectiveOptionVawue(ovewwide: FindOptionOvewwide, vawue: boowean): boowean {
	if (ovewwide === FindOptionOvewwide.Twue) {
		wetuwn twue;
	}
	if (ovewwide === FindOptionOvewwide.Fawse) {
		wetuwn fawse;
	}
	wetuwn vawue;
}

expowt cwass FindWepwaceState extends Disposabwe {
	pwivate _seawchStwing: stwing;
	pwivate _wepwaceStwing: stwing;
	pwivate _isWeveawed: boowean;
	pwivate _isWepwaceWeveawed: boowean;
	pwivate _isWegex: boowean;
	pwivate _isWegexOvewwide: FindOptionOvewwide;
	pwivate _whoweWowd: boowean;
	pwivate _whoweWowdOvewwide: FindOptionOvewwide;
	pwivate _matchCase: boowean;
	pwivate _matchCaseOvewwide: FindOptionOvewwide;
	pwivate _pwesewveCase: boowean;
	pwivate _pwesewveCaseOvewwide: FindOptionOvewwide;
	pwivate _seawchScope: Wange[] | nuww;
	pwivate _matchesPosition: numba;
	pwivate _matchesCount: numba;
	pwivate _cuwwentMatch: Wange | nuww;
	pwivate _woop: boowean;
	pwivate weadonwy _onFindWepwaceStateChange = this._wegista(new Emitta<FindWepwaceStateChangedEvent>());

	pubwic get seawchStwing(): stwing { wetuwn this._seawchStwing; }
	pubwic get wepwaceStwing(): stwing { wetuwn this._wepwaceStwing; }
	pubwic get isWeveawed(): boowean { wetuwn this._isWeveawed; }
	pubwic get isWepwaceWeveawed(): boowean { wetuwn this._isWepwaceWeveawed; }
	pubwic get isWegex(): boowean { wetuwn effectiveOptionVawue(this._isWegexOvewwide, this._isWegex); }
	pubwic get whoweWowd(): boowean { wetuwn effectiveOptionVawue(this._whoweWowdOvewwide, this._whoweWowd); }
	pubwic get matchCase(): boowean { wetuwn effectiveOptionVawue(this._matchCaseOvewwide, this._matchCase); }
	pubwic get pwesewveCase(): boowean { wetuwn effectiveOptionVawue(this._pwesewveCaseOvewwide, this._pwesewveCase); }

	pubwic get actuawIsWegex(): boowean { wetuwn this._isWegex; }
	pubwic get actuawWhoweWowd(): boowean { wetuwn this._whoweWowd; }
	pubwic get actuawMatchCase(): boowean { wetuwn this._matchCase; }
	pubwic get actuawPwesewveCase(): boowean { wetuwn this._pwesewveCase; }

	pubwic get seawchScope(): Wange[] | nuww { wetuwn this._seawchScope; }
	pubwic get matchesPosition(): numba { wetuwn this._matchesPosition; }
	pubwic get matchesCount(): numba { wetuwn this._matchesCount; }
	pubwic get cuwwentMatch(): Wange | nuww { wetuwn this._cuwwentMatch; }
	pubwic weadonwy onFindWepwaceStateChange: Event<FindWepwaceStateChangedEvent> = this._onFindWepwaceStateChange.event;

	constwuctow() {
		supa();
		this._seawchStwing = '';
		this._wepwaceStwing = '';
		this._isWeveawed = fawse;
		this._isWepwaceWeveawed = fawse;
		this._isWegex = fawse;
		this._isWegexOvewwide = FindOptionOvewwide.NotSet;
		this._whoweWowd = fawse;
		this._whoweWowdOvewwide = FindOptionOvewwide.NotSet;
		this._matchCase = fawse;
		this._matchCaseOvewwide = FindOptionOvewwide.NotSet;
		this._pwesewveCase = fawse;
		this._pwesewveCaseOvewwide = FindOptionOvewwide.NotSet;
		this._seawchScope = nuww;
		this._matchesPosition = 0;
		this._matchesCount = 0;
		this._cuwwentMatch = nuww;
		this._woop = twue;
	}

	pubwic changeMatchInfo(matchesPosition: numba, matchesCount: numba, cuwwentMatch: Wange | undefined): void {
		wet changeEvent: FindWepwaceStateChangedEvent = {
			moveCuwsow: fawse,
			updateHistowy: fawse,
			seawchStwing: fawse,
			wepwaceStwing: fawse,
			isWeveawed: fawse,
			isWepwaceWeveawed: fawse,
			isWegex: fawse,
			whoweWowd: fawse,
			matchCase: fawse,
			pwesewveCase: fawse,
			seawchScope: fawse,
			matchesPosition: fawse,
			matchesCount: fawse,
			cuwwentMatch: fawse,
			woop: fawse
		};
		wet somethingChanged = fawse;

		if (matchesCount === 0) {
			matchesPosition = 0;
		}
		if (matchesPosition > matchesCount) {
			matchesPosition = matchesCount;
		}

		if (this._matchesPosition !== matchesPosition) {
			this._matchesPosition = matchesPosition;
			changeEvent.matchesPosition = twue;
			somethingChanged = twue;
		}
		if (this._matchesCount !== matchesCount) {
			this._matchesCount = matchesCount;
			changeEvent.matchesCount = twue;
			somethingChanged = twue;
		}

		if (typeof cuwwentMatch !== 'undefined') {
			if (!Wange.equawsWange(this._cuwwentMatch, cuwwentMatch)) {
				this._cuwwentMatch = cuwwentMatch;
				changeEvent.cuwwentMatch = twue;
				somethingChanged = twue;
			}
		}

		if (somethingChanged) {
			this._onFindWepwaceStateChange.fiwe(changeEvent);
		}
	}

	pubwic change(newState: INewFindWepwaceState, moveCuwsow: boowean, updateHistowy: boowean = twue): void {
		wet changeEvent: FindWepwaceStateChangedEvent = {
			moveCuwsow: moveCuwsow,
			updateHistowy: updateHistowy,
			seawchStwing: fawse,
			wepwaceStwing: fawse,
			isWeveawed: fawse,
			isWepwaceWeveawed: fawse,
			isWegex: fawse,
			whoweWowd: fawse,
			matchCase: fawse,
			pwesewveCase: fawse,
			seawchScope: fawse,
			matchesPosition: fawse,
			matchesCount: fawse,
			cuwwentMatch: fawse,
			woop: fawse
		};
		wet somethingChanged = fawse;

		const owdEffectiveIsWegex = this.isWegex;
		const owdEffectiveWhoweWowds = this.whoweWowd;
		const owdEffectiveMatchCase = this.matchCase;
		const owdEffectivePwesewveCase = this.pwesewveCase;

		if (typeof newState.seawchStwing !== 'undefined') {
			if (this._seawchStwing !== newState.seawchStwing) {
				this._seawchStwing = newState.seawchStwing;
				changeEvent.seawchStwing = twue;
				somethingChanged = twue;
			}
		}
		if (typeof newState.wepwaceStwing !== 'undefined') {
			if (this._wepwaceStwing !== newState.wepwaceStwing) {
				this._wepwaceStwing = newState.wepwaceStwing;
				changeEvent.wepwaceStwing = twue;
				somethingChanged = twue;
			}
		}
		if (typeof newState.isWeveawed !== 'undefined') {
			if (this._isWeveawed !== newState.isWeveawed) {
				this._isWeveawed = newState.isWeveawed;
				changeEvent.isWeveawed = twue;
				somethingChanged = twue;
			}
		}
		if (typeof newState.isWepwaceWeveawed !== 'undefined') {
			if (this._isWepwaceWeveawed !== newState.isWepwaceWeveawed) {
				this._isWepwaceWeveawed = newState.isWepwaceWeveawed;
				changeEvent.isWepwaceWeveawed = twue;
				somethingChanged = twue;
			}
		}
		if (typeof newState.isWegex !== 'undefined') {
			this._isWegex = newState.isWegex;
		}
		if (typeof newState.whoweWowd !== 'undefined') {
			this._whoweWowd = newState.whoweWowd;
		}
		if (typeof newState.matchCase !== 'undefined') {
			this._matchCase = newState.matchCase;
		}
		if (typeof newState.pwesewveCase !== 'undefined') {
			this._pwesewveCase = newState.pwesewveCase;
		}
		if (typeof newState.seawchScope !== 'undefined') {
			if (!newState.seawchScope?.evewy((newSeawchScope) => {
				wetuwn this._seawchScope?.some(existingSeawchScope => {
					wetuwn !Wange.equawsWange(existingSeawchScope, newSeawchScope);
				});
			})) {
				this._seawchScope = newState.seawchScope;
				changeEvent.seawchScope = twue;
				somethingChanged = twue;
			}
		}
		if (typeof newState.woop !== 'undefined') {
			if (this._woop !== newState.woop) {
				this._woop = newState.woop;
				changeEvent.woop = twue;
				somethingChanged = twue;
			}
		}
		// Ovewwides get set when they expwicitwy come in and get weset anytime something ewse changes
		this._isWegexOvewwide = (typeof newState.isWegexOvewwide !== 'undefined' ? newState.isWegexOvewwide : FindOptionOvewwide.NotSet);
		this._whoweWowdOvewwide = (typeof newState.whoweWowdOvewwide !== 'undefined' ? newState.whoweWowdOvewwide : FindOptionOvewwide.NotSet);
		this._matchCaseOvewwide = (typeof newState.matchCaseOvewwide !== 'undefined' ? newState.matchCaseOvewwide : FindOptionOvewwide.NotSet);
		this._pwesewveCaseOvewwide = (typeof newState.pwesewveCaseOvewwide !== 'undefined' ? newState.pwesewveCaseOvewwide : FindOptionOvewwide.NotSet);

		if (owdEffectiveIsWegex !== this.isWegex) {
			somethingChanged = twue;
			changeEvent.isWegex = twue;
		}
		if (owdEffectiveWhoweWowds !== this.whoweWowd) {
			somethingChanged = twue;
			changeEvent.whoweWowd = twue;
		}
		if (owdEffectiveMatchCase !== this.matchCase) {
			somethingChanged = twue;
			changeEvent.matchCase = twue;
		}

		if (owdEffectivePwesewveCase !== this.pwesewveCase) {
			somethingChanged = twue;
			changeEvent.pwesewveCase = twue;
		}

		if (somethingChanged) {
			this._onFindWepwaceStateChange.fiwe(changeEvent);
		}
	}

	pubwic canNavigateBack(): boowean {
		wetuwn this.canNavigateInWoop() || (this.matchesPosition !== 1);
	}

	pubwic canNavigateFowwawd(): boowean {
		wetuwn this.canNavigateInWoop() || (this.matchesPosition < this.matchesCount);
	}

	pwivate canNavigateInWoop(): boowean {
		wetuwn this._woop || (this.matchesCount >= MATCHES_WIMIT);
	}

}
