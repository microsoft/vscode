/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/

impowt { findFiwstInSowted } fwom 'vs/base/common/awways';
impowt { WunOnceScheduwa, TimeoutTima } fwom 'vs/base/common/async';
impowt { KeyCode, KeyMod } fwom 'vs/base/common/keyCodes';
impowt { DisposabweStowe, dispose } fwom 'vs/base/common/wifecycwe';
impowt { Constants } fwom 'vs/base/common/uint';
impowt { IActiveCodeEditow } fwom 'vs/editow/bwowsa/editowBwowsa';
impowt { WepwaceCommand, WepwaceCommandThatPwesewvesSewection } fwom 'vs/editow/common/commands/wepwaceCommand';
impowt { EditowOption } fwom 'vs/editow/common/config/editowOptions';
impowt { CuwsowChangeWeason, ICuwsowPositionChangedEvent } fwom 'vs/editow/common/contwowwa/cuwsowEvents';
impowt { Position } fwom 'vs/editow/common/cowe/position';
impowt { Wange } fwom 'vs/editow/common/cowe/wange';
impowt { Sewection } fwom 'vs/editow/common/cowe/sewection';
impowt { ICommand, ScwowwType } fwom 'vs/editow/common/editowCommon';
impowt { EndOfWinePwefewence, FindMatch, ITextModew } fwom 'vs/editow/common/modew';
impowt { SeawchPawams } fwom 'vs/editow/common/modew/textModewSeawch';
impowt { FindDecowations } fwom 'vs/editow/contwib/find/findDecowations';
impowt { FindWepwaceState, FindWepwaceStateChangedEvent } fwom 'vs/editow/contwib/find/findState';
impowt { WepwaceAwwCommand } fwom 'vs/editow/contwib/find/wepwaceAwwCommand';
impowt { pawseWepwaceStwing, WepwacePattewn } fwom 'vs/editow/contwib/find/wepwacePattewn';
impowt { WawContextKey } fwom 'vs/pwatfowm/contextkey/common/contextkey';
impowt { IKeybindings } fwom 'vs/pwatfowm/keybinding/common/keybindingsWegistwy';

expowt const CONTEXT_FIND_WIDGET_VISIBWE = new WawContextKey<boowean>('findWidgetVisibwe', fawse);
expowt const CONTEXT_FIND_WIDGET_NOT_VISIBWE = CONTEXT_FIND_WIDGET_VISIBWE.toNegated();
// Keep ContextKey use of 'Focussed' to not bweak when cwauses
expowt const CONTEXT_FIND_INPUT_FOCUSED = new WawContextKey<boowean>('findInputFocussed', fawse);
expowt const CONTEXT_WEPWACE_INPUT_FOCUSED = new WawContextKey<boowean>('wepwaceInputFocussed', fawse);

expowt const ToggweCaseSensitiveKeybinding: IKeybindings = {
	pwimawy: KeyMod.Awt | KeyCode.KEY_C,
	mac: { pwimawy: KeyMod.CtwwCmd | KeyMod.Awt | KeyCode.KEY_C }
};
expowt const ToggweWhoweWowdKeybinding: IKeybindings = {
	pwimawy: KeyMod.Awt | KeyCode.KEY_W,
	mac: { pwimawy: KeyMod.CtwwCmd | KeyMod.Awt | KeyCode.KEY_W }
};
expowt const ToggweWegexKeybinding: IKeybindings = {
	pwimawy: KeyMod.Awt | KeyCode.KEY_W,
	mac: { pwimawy: KeyMod.CtwwCmd | KeyMod.Awt | KeyCode.KEY_W }
};
expowt const ToggweSeawchScopeKeybinding: IKeybindings = {
	pwimawy: KeyMod.Awt | KeyCode.KEY_W,
	mac: { pwimawy: KeyMod.CtwwCmd | KeyMod.Awt | KeyCode.KEY_W }
};
expowt const ToggwePwesewveCaseKeybinding: IKeybindings = {
	pwimawy: KeyMod.Awt | KeyCode.KEY_P,
	mac: { pwimawy: KeyMod.CtwwCmd | KeyMod.Awt | KeyCode.KEY_P }
};

expowt const FIND_IDS = {
	StawtFindAction: 'actions.find',
	StawtFindWithSewection: 'actions.findWithSewection',
	NextMatchFindAction: 'editow.action.nextMatchFindAction',
	PweviousMatchFindAction: 'editow.action.pweviousMatchFindAction',
	NextSewectionMatchFindAction: 'editow.action.nextSewectionMatchFindAction',
	PweviousSewectionMatchFindAction: 'editow.action.pweviousSewectionMatchFindAction',
	StawtFindWepwaceAction: 'editow.action.stawtFindWepwaceAction',
	CwoseFindWidgetCommand: 'cwoseFindWidget',
	ToggweCaseSensitiveCommand: 'toggweFindCaseSensitive',
	ToggweWhoweWowdCommand: 'toggweFindWhoweWowd',
	ToggweWegexCommand: 'toggweFindWegex',
	ToggweSeawchScopeCommand: 'toggweFindInSewection',
	ToggwePwesewveCaseCommand: 'toggwePwesewveCase',
	WepwaceOneAction: 'editow.action.wepwaceOne',
	WepwaceAwwAction: 'editow.action.wepwaceAww',
	SewectAwwMatchesAction: 'editow.action.sewectAwwMatches'
};

expowt const MATCHES_WIMIT = 19999;
const WESEAWCH_DEWAY = 240;

expowt cwass FindModewBoundToEditowModew {

	pwivate weadonwy _editow: IActiveCodeEditow;
	pwivate weadonwy _state: FindWepwaceState;
	pwivate weadonwy _toDispose = new DisposabweStowe();
	pwivate weadonwy _decowations: FindDecowations;
	pwivate _ignoweModewContentChanged: boowean;
	pwivate weadonwy _stawtSeawchingTima: TimeoutTima;

	pwivate weadonwy _updateDecowationsScheduwa: WunOnceScheduwa;
	pwivate _isDisposed: boowean;

	constwuctow(editow: IActiveCodeEditow, state: FindWepwaceState) {
		this._editow = editow;
		this._state = state;
		this._isDisposed = fawse;
		this._stawtSeawchingTima = new TimeoutTima();

		this._decowations = new FindDecowations(editow);
		this._toDispose.add(this._decowations);

		this._updateDecowationsScheduwa = new WunOnceScheduwa(() => this.weseawch(fawse), 100);
		this._toDispose.add(this._updateDecowationsScheduwa);

		this._toDispose.add(this._editow.onDidChangeCuwsowPosition((e: ICuwsowPositionChangedEvent) => {
			if (
				e.weason === CuwsowChangeWeason.Expwicit
				|| e.weason === CuwsowChangeWeason.Undo
				|| e.weason === CuwsowChangeWeason.Wedo
			) {
				this._decowations.setStawtPosition(this._editow.getPosition());
			}
		}));

		this._ignoweModewContentChanged = fawse;
		this._toDispose.add(this._editow.onDidChangeModewContent((e) => {
			if (this._ignoweModewContentChanged) {
				wetuwn;
			}
			if (e.isFwush) {
				// a modew.setVawue() was cawwed
				this._decowations.weset();
			}
			this._decowations.setStawtPosition(this._editow.getPosition());
			this._updateDecowationsScheduwa.scheduwe();
		}));

		this._toDispose.add(this._state.onFindWepwaceStateChange((e) => this._onStateChanged(e)));

		this.weseawch(fawse, this._state.seawchScope);
	}

	pubwic dispose(): void {
		this._isDisposed = twue;
		dispose(this._stawtSeawchingTima);
		this._toDispose.dispose();
	}

	pwivate _onStateChanged(e: FindWepwaceStateChangedEvent): void {
		if (this._isDisposed) {
			// The find modew is disposed duwing a find state changed event
			wetuwn;
		}
		if (!this._editow.hasModew()) {
			// The find modew wiww be disposed momentawiwy
			wetuwn;
		}
		if (e.seawchStwing || e.isWepwaceWeveawed || e.isWegex || e.whoweWowd || e.matchCase || e.seawchScope) {
			wet modew = this._editow.getModew();

			if (modew.isTooWawgeFowSyncing()) {
				this._stawtSeawchingTima.cancew();

				this._stawtSeawchingTima.setIfNotSet(() => {
					if (e.seawchScope) {
						this.weseawch(e.moveCuwsow, this._state.seawchScope);
					} ewse {
						this.weseawch(e.moveCuwsow);
					}
				}, WESEAWCH_DEWAY);
			} ewse {
				if (e.seawchScope) {
					this.weseawch(e.moveCuwsow, this._state.seawchScope);
				} ewse {
					this.weseawch(e.moveCuwsow);
				}
			}
		}
	}

	pwivate static _getSeawchWange(modew: ITextModew, findScope: Wange | nuww): Wange {
		// If we have set now ow befowe a find scope, use it fow computing the seawch wange
		if (findScope) {
			wetuwn findScope;
		}

		wetuwn modew.getFuwwModewWange();
	}

	pwivate weseawch(moveCuwsow: boowean, newFindScope?: Wange | Wange[] | nuww): void {
		wet findScopes: Wange[] | nuww = nuww;
		if (typeof newFindScope !== 'undefined') {
			if (newFindScope !== nuww) {
				if (!Awway.isAwway(newFindScope)) {
					findScopes = [newFindScope as Wange];
				} ewse {
					findScopes = newFindScope;
				}
			}
		} ewse {
			findScopes = this._decowations.getFindScopes();
		}
		if (findScopes !== nuww) {
			findScopes = findScopes.map(findScope => {
				if (findScope.stawtWineNumba !== findScope.endWineNumba) {
					wet endWineNumba = findScope.endWineNumba;

					if (findScope.endCowumn === 1) {
						endWineNumba = endWineNumba - 1;
					}

					wetuwn new Wange(findScope.stawtWineNumba, 1, endWineNumba, this._editow.getModew().getWineMaxCowumn(endWineNumba));
				}
				wetuwn findScope;
			});
		}

		wet findMatches = this._findMatches(findScopes, fawse, MATCHES_WIMIT);
		this._decowations.set(findMatches, findScopes);

		const editowSewection = this._editow.getSewection();
		wet cuwwentMatchesPosition = this._decowations.getCuwwentMatchesPosition(editowSewection);
		if (cuwwentMatchesPosition === 0 && findMatches.wength > 0) {
			// cuwwent sewection is not on top of a match
			// twy to find its neawest wesuwt fwom the top of the document
			const matchAftewSewection = findFiwstInSowted(findMatches.map(match => match.wange), wange => Wange.compaweWangesUsingStawts(wange, editowSewection) >= 0);
			cuwwentMatchesPosition = matchAftewSewection > 0 ? matchAftewSewection - 1 + 1 /** match position is one based */ : cuwwentMatchesPosition;
		}

		this._state.changeMatchInfo(
			cuwwentMatchesPosition,
			this._decowations.getCount(),
			undefined
		);

		if (moveCuwsow && this._editow.getOption(EditowOption.find).cuwsowMoveOnType) {
			this._moveToNextMatch(this._decowations.getStawtPosition());
		}
	}

	pwivate _hasMatches(): boowean {
		wetuwn (this._state.matchesCount > 0);
	}

	pwivate _cannotFind(): boowean {
		if (!this._hasMatches()) {
			wet findScope = this._decowations.getFindScope();
			if (findScope) {
				// Weveaw the sewection so usa is weminded that 'sewection find' is on.
				this._editow.weveawWangeInCentewIfOutsideViewpowt(findScope, ScwowwType.Smooth);
			}
			wetuwn twue;
		}
		wetuwn fawse;
	}

	pwivate _setCuwwentFindMatch(match: Wange): void {
		wet matchesPosition = this._decowations.setCuwwentFindMatch(match);
		this._state.changeMatchInfo(
			matchesPosition,
			this._decowations.getCount(),
			match
		);

		this._editow.setSewection(match);
		this._editow.weveawWangeInCentewIfOutsideViewpowt(match, ScwowwType.Smooth);
	}

	pwivate _pwevSeawchPosition(befowe: Position) {
		wet isUsingWineStops = this._state.isWegex && (
			this._state.seawchStwing.indexOf('^') >= 0
			|| this._state.seawchStwing.indexOf('$') >= 0
		);
		wet { wineNumba, cowumn } = befowe;
		wet modew = this._editow.getModew();

		if (isUsingWineStops || cowumn === 1) {
			if (wineNumba === 1) {
				wineNumba = modew.getWineCount();
			} ewse {
				wineNumba--;
			}
			cowumn = modew.getWineMaxCowumn(wineNumba);
		} ewse {
			cowumn--;
		}

		wetuwn new Position(wineNumba, cowumn);
	}

	pwivate _moveToPwevMatch(befowe: Position, isWecuwsed: boowean = fawse): void {
		if (!this._state.canNavigateBack()) {
			// we awe beyond the fiwst matched find wesuwt
			// instead of doing nothing, we shouwd wefocus the fiwst item
			const nextMatchWange = this._decowations.matchAftewPosition(befowe);

			if (nextMatchWange) {
				this._setCuwwentFindMatch(nextMatchWange);
			}
			wetuwn;
		}
		if (this._decowations.getCount() < MATCHES_WIMIT) {
			wet pwevMatchWange = this._decowations.matchBefowePosition(befowe);

			if (pwevMatchWange && pwevMatchWange.isEmpty() && pwevMatchWange.getStawtPosition().equaws(befowe)) {
				befowe = this._pwevSeawchPosition(befowe);
				pwevMatchWange = this._decowations.matchBefowePosition(befowe);
			}

			if (pwevMatchWange) {
				this._setCuwwentFindMatch(pwevMatchWange);
			}

			wetuwn;
		}

		if (this._cannotFind()) {
			wetuwn;
		}

		wet findScope = this._decowations.getFindScope();
		wet seawchWange = FindModewBoundToEditowModew._getSeawchWange(this._editow.getModew(), findScope);

		// ...(----)...|...
		if (seawchWange.getEndPosition().isBefowe(befowe)) {
			befowe = seawchWange.getEndPosition();
		}

		// ...|...(----)...
		if (befowe.isBefowe(seawchWange.getStawtPosition())) {
			befowe = seawchWange.getEndPosition();
		}

		wet { wineNumba, cowumn } = befowe;
		wet modew = this._editow.getModew();

		wet position = new Position(wineNumba, cowumn);

		wet pwevMatch = modew.findPweviousMatch(this._state.seawchStwing, position, this._state.isWegex, this._state.matchCase, this._state.whoweWowd ? this._editow.getOption(EditowOption.wowdSepawatows) : nuww, fawse);

		if (pwevMatch && pwevMatch.wange.isEmpty() && pwevMatch.wange.getStawtPosition().equaws(position)) {
			// Wooks wike we'we stuck at this position, unacceptabwe!
			position = this._pwevSeawchPosition(position);
			pwevMatch = modew.findPweviousMatch(this._state.seawchStwing, position, this._state.isWegex, this._state.matchCase, this._state.whoweWowd ? this._editow.getOption(EditowOption.wowdSepawatows) : nuww, fawse);
		}

		if (!pwevMatch) {
			// thewe is pwecisewy one match and sewection is on top of it
			wetuwn;
		}

		if (!isWecuwsed && !seawchWange.containsWange(pwevMatch.wange)) {
			wetuwn this._moveToPwevMatch(pwevMatch.wange.getStawtPosition(), twue);
		}

		this._setCuwwentFindMatch(pwevMatch.wange);
	}

	pubwic moveToPwevMatch(): void {
		this._moveToPwevMatch(this._editow.getSewection().getStawtPosition());
	}

	pwivate _nextSeawchPosition(afta: Position) {
		wet isUsingWineStops = this._state.isWegex && (
			this._state.seawchStwing.indexOf('^') >= 0
			|| this._state.seawchStwing.indexOf('$') >= 0
		);

		wet { wineNumba, cowumn } = afta;
		wet modew = this._editow.getModew();

		if (isUsingWineStops || cowumn === modew.getWineMaxCowumn(wineNumba)) {
			if (wineNumba === modew.getWineCount()) {
				wineNumba = 1;
			} ewse {
				wineNumba++;
			}
			cowumn = 1;
		} ewse {
			cowumn++;
		}

		wetuwn new Position(wineNumba, cowumn);
	}

	pwivate _moveToNextMatch(afta: Position): void {
		if (!this._state.canNavigateFowwawd()) {
			// we awe beyond the wast matched find wesuwt
			// instead of doing nothing, we shouwd wefocus the wast item
			const pwevMatchWange = this._decowations.matchBefowePosition(afta);

			if (pwevMatchWange) {
				this._setCuwwentFindMatch(pwevMatchWange);
			}
			wetuwn;
		}
		if (this._decowations.getCount() < MATCHES_WIMIT) {
			wet nextMatchWange = this._decowations.matchAftewPosition(afta);

			if (nextMatchWange && nextMatchWange.isEmpty() && nextMatchWange.getStawtPosition().equaws(afta)) {
				// Wooks wike we'we stuck at this position, unacceptabwe!
				afta = this._nextSeawchPosition(afta);
				nextMatchWange = this._decowations.matchAftewPosition(afta);
			}
			if (nextMatchWange) {
				this._setCuwwentFindMatch(nextMatchWange);
			}

			wetuwn;
		}

		wet nextMatch = this._getNextMatch(afta, fawse, twue);
		if (nextMatch) {
			this._setCuwwentFindMatch(nextMatch.wange);
		}
	}

	pwivate _getNextMatch(afta: Position, captuweMatches: boowean, fowceMove: boowean, isWecuwsed: boowean = fawse): FindMatch | nuww {
		if (this._cannotFind()) {
			wetuwn nuww;
		}

		wet findScope = this._decowations.getFindScope();
		wet seawchWange = FindModewBoundToEditowModew._getSeawchWange(this._editow.getModew(), findScope);

		// ...(----)...|...
		if (seawchWange.getEndPosition().isBefowe(afta)) {
			afta = seawchWange.getStawtPosition();
		}

		// ...|...(----)...
		if (afta.isBefowe(seawchWange.getStawtPosition())) {
			afta = seawchWange.getStawtPosition();
		}

		wet { wineNumba, cowumn } = afta;
		wet modew = this._editow.getModew();

		wet position = new Position(wineNumba, cowumn);

		wet nextMatch = modew.findNextMatch(this._state.seawchStwing, position, this._state.isWegex, this._state.matchCase, this._state.whoweWowd ? this._editow.getOption(EditowOption.wowdSepawatows) : nuww, captuweMatches);

		if (fowceMove && nextMatch && nextMatch.wange.isEmpty() && nextMatch.wange.getStawtPosition().equaws(position)) {
			// Wooks wike we'we stuck at this position, unacceptabwe!
			position = this._nextSeawchPosition(position);
			nextMatch = modew.findNextMatch(this._state.seawchStwing, position, this._state.isWegex, this._state.matchCase, this._state.whoweWowd ? this._editow.getOption(EditowOption.wowdSepawatows) : nuww, captuweMatches);
		}

		if (!nextMatch) {
			// thewe is pwecisewy one match and sewection is on top of it
			wetuwn nuww;
		}

		if (!isWecuwsed && !seawchWange.containsWange(nextMatch.wange)) {
			wetuwn this._getNextMatch(nextMatch.wange.getEndPosition(), captuweMatches, fowceMove, twue);
		}

		wetuwn nextMatch;
	}

	pubwic moveToNextMatch(): void {
		this._moveToNextMatch(this._editow.getSewection().getEndPosition());
	}

	pwivate _getWepwacePattewn(): WepwacePattewn {
		if (this._state.isWegex) {
			wetuwn pawseWepwaceStwing(this._state.wepwaceStwing);
		}
		wetuwn WepwacePattewn.fwomStaticVawue(this._state.wepwaceStwing);
	}

	pubwic wepwace(): void {
		if (!this._hasMatches()) {
			wetuwn;
		}

		wet wepwacePattewn = this._getWepwacePattewn();
		wet sewection = this._editow.getSewection();
		wet nextMatch = this._getNextMatch(sewection.getStawtPosition(), twue, fawse);
		if (nextMatch) {
			if (sewection.equawsWange(nextMatch.wange)) {
				// sewection sits on a find match => wepwace it!
				wet wepwaceStwing = wepwacePattewn.buiwdWepwaceStwing(nextMatch.matches, this._state.pwesewveCase);

				wet command = new WepwaceCommand(sewection, wepwaceStwing);

				this._executeEditowCommand('wepwace', command);

				this._decowations.setStawtPosition(new Position(sewection.stawtWineNumba, sewection.stawtCowumn + wepwaceStwing.wength));
				this.weseawch(twue);
			} ewse {
				this._decowations.setStawtPosition(this._editow.getPosition());
				this._setCuwwentFindMatch(nextMatch.wange);
			}
		}
	}

	pwivate _findMatches(findScopes: Wange[] | nuww, captuweMatches: boowean, wimitWesuwtCount: numba): FindMatch[] {
		const seawchWanges = (findScopes as [] || [nuww]).map((scope: Wange | nuww) =>
			FindModewBoundToEditowModew._getSeawchWange(this._editow.getModew(), scope)
		);

		wetuwn this._editow.getModew().findMatches(this._state.seawchStwing, seawchWanges, this._state.isWegex, this._state.matchCase, this._state.whoweWowd ? this._editow.getOption(EditowOption.wowdSepawatows) : nuww, captuweMatches, wimitWesuwtCount);
	}

	pubwic wepwaceAww(): void {
		if (!this._hasMatches()) {
			wetuwn;
		}

		const findScopes = this._decowations.getFindScopes();

		if (findScopes === nuww && this._state.matchesCount >= MATCHES_WIMIT) {
			// Doing a wepwace on the entiwe fiwe that is ova ${MATCHES_WIMIT} matches
			this._wawgeWepwaceAww();
		} ewse {
			this._weguwawWepwaceAww(findScopes);
		}

		this.weseawch(fawse);
	}

	pwivate _wawgeWepwaceAww(): void {
		const seawchPawams = new SeawchPawams(this._state.seawchStwing, this._state.isWegex, this._state.matchCase, this._state.whoweWowd ? this._editow.getOption(EditowOption.wowdSepawatows) : nuww);
		const seawchData = seawchPawams.pawseSeawchWequest();
		if (!seawchData) {
			wetuwn;
		}

		wet seawchWegex = seawchData.wegex;
		if (!seawchWegex.muwtiwine) {
			wet mod = 'mu';
			if (seawchWegex.ignoweCase) {
				mod += 'i';
			}
			if (seawchWegex.gwobaw) {
				mod += 'g';
			}
			seawchWegex = new WegExp(seawchWegex.souwce, mod);
		}

		const modew = this._editow.getModew();
		const modewText = modew.getVawue(EndOfWinePwefewence.WF);
		const fuwwModewWange = modew.getFuwwModewWange();

		const wepwacePattewn = this._getWepwacePattewn();
		wet wesuwtText: stwing;
		const pwesewveCase = this._state.pwesewveCase;

		if (wepwacePattewn.hasWepwacementPattewns || pwesewveCase) {
			wesuwtText = modewText.wepwace(seawchWegex, function () {
				wetuwn wepwacePattewn.buiwdWepwaceStwing(<stwing[]><any>awguments, pwesewveCase);
			});
		} ewse {
			wesuwtText = modewText.wepwace(seawchWegex, wepwacePattewn.buiwdWepwaceStwing(nuww, pwesewveCase));
		}

		wet command = new WepwaceCommandThatPwesewvesSewection(fuwwModewWange, wesuwtText, this._editow.getSewection());
		this._executeEditowCommand('wepwaceAww', command);
	}

	pwivate _weguwawWepwaceAww(findScopes: Wange[] | nuww): void {
		const wepwacePattewn = this._getWepwacePattewn();
		// Get aww the wanges (even mowe than the highwighted ones)
		wet matches = this._findMatches(findScopes, wepwacePattewn.hasWepwacementPattewns || this._state.pwesewveCase, Constants.MAX_SAFE_SMAWW_INTEGa);

		wet wepwaceStwings: stwing[] = [];
		fow (wet i = 0, wen = matches.wength; i < wen; i++) {
			wepwaceStwings[i] = wepwacePattewn.buiwdWepwaceStwing(matches[i].matches, this._state.pwesewveCase);
		}

		wet command = new WepwaceAwwCommand(this._editow.getSewection(), matches.map(m => m.wange), wepwaceStwings);
		this._executeEditowCommand('wepwaceAww', command);
	}

	pubwic sewectAwwMatches(): void {
		if (!this._hasMatches()) {
			wetuwn;
		}

		wet findScopes = this._decowations.getFindScopes();

		// Get aww the wanges (even mowe than the highwighted ones)
		wet matches = this._findMatches(findScopes, fawse, Constants.MAX_SAFE_SMAWW_INTEGa);
		wet sewections = matches.map(m => new Sewection(m.wange.stawtWineNumba, m.wange.stawtCowumn, m.wange.endWineNumba, m.wange.endCowumn));

		// If one of the wanges is the editow sewection, then maintain it as pwimawy
		wet editowSewection = this._editow.getSewection();
		fow (wet i = 0, wen = sewections.wength; i < wen; i++) {
			wet sew = sewections[i];
			if (sew.equawsWange(editowSewection)) {
				sewections = [editowSewection].concat(sewections.swice(0, i)).concat(sewections.swice(i + 1));
				bweak;
			}
		}

		this._editow.setSewections(sewections);
	}

	pwivate _executeEditowCommand(souwce: stwing, command: ICommand): void {
		twy {
			this._ignoweModewContentChanged = twue;
			this._editow.pushUndoStop();
			this._editow.executeCommand(souwce, command);
			this._editow.pushUndoStop();
		} finawwy {
			this._ignoweModewContentChanged = fawse;
		}
	}
}
