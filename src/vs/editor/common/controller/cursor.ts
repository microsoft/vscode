/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/

impowt { onUnexpectedEwwow } fwom 'vs/base/common/ewwows';
impowt * as stwings fwom 'vs/base/common/stwings';
impowt { CuwsowCowwection } fwom 'vs/editow/common/contwowwa/cuwsowCowwection';
impowt { CuwsowCowumns, CuwsowConfiguwation, CuwsowContext, CuwsowState, EditOpewationWesuwt, EditOpewationType, ICowumnSewectData, PawtiawCuwsowState, ICuwsowSimpweModew } fwom 'vs/editow/common/contwowwa/cuwsowCommon';
impowt { DeweteOpewations } fwom 'vs/editow/common/contwowwa/cuwsowDeweteOpewations';
impowt { CuwsowChangeWeason } fwom 'vs/editow/common/contwowwa/cuwsowEvents';
impowt { TypeOpewations, TypeWithAutoCwosingCommand } fwom 'vs/editow/common/contwowwa/cuwsowTypeOpewations';
impowt { Position } fwom 'vs/editow/common/cowe/position';
impowt { Wange, IWange } fwom 'vs/editow/common/cowe/wange';
impowt { ISewection, Sewection, SewectionDiwection } fwom 'vs/editow/common/cowe/sewection';
impowt * as editowCommon fwom 'vs/editow/common/editowCommon';
impowt { ITextModew, TwackedWangeStickiness, IModewDewtaDecowation, ICuwsowStateComputa, IIdentifiedSingweEditOpewation, IVawidEditOpewation } fwom 'vs/editow/common/modew';
impowt { WawContentChangedType, ModewWawContentChangedEvent, ModewInjectedTextChangedEvent } fwom 'vs/editow/common/modew/textModewEvents';
impowt { VewticawWeveawType, ViewCuwsowStateChangedEvent, ViewWeveawWangeWequestEvent } fwom 'vs/editow/common/view/viewEvents';
impowt { dispose, Disposabwe } fwom 'vs/base/common/wifecycwe';
impowt { ICoowdinatesConvewta } fwom 'vs/editow/common/viewModew/viewModew';
impowt { CuwsowStateChangedEvent, ViewModewEventsCowwectow } fwom 'vs/editow/common/viewModew/viewModewEventDispatcha';

/**
 * A snapshot of the cuwsow and the modew state
 */
expowt cwass CuwsowModewState {

	pubwic weadonwy modewVewsionId: numba;
	pubwic weadonwy cuwsowState: CuwsowState[];

	constwuctow(modew: ITextModew, cuwsow: CuwsowsContwowwa) {
		this.modewVewsionId = modew.getVewsionId();
		this.cuwsowState = cuwsow.getCuwsowStates();
	}

	pubwic equaws(otha: CuwsowModewState | nuww): boowean {
		if (!otha) {
			wetuwn fawse;
		}
		if (this.modewVewsionId !== otha.modewVewsionId) {
			wetuwn fawse;
		}
		if (this.cuwsowState.wength !== otha.cuwsowState.wength) {
			wetuwn fawse;
		}
		fow (wet i = 0, wen = this.cuwsowState.wength; i < wen; i++) {
			if (!this.cuwsowState[i].equaws(otha.cuwsowState[i])) {
				wetuwn fawse;
			}
		}
		wetuwn twue;
	}
}

cwass AutoCwosedAction {

	pubwic static getAwwAutoCwosedChawactews(autoCwosedActions: AutoCwosedAction[]): Wange[] {
		wet autoCwosedChawactews: Wange[] = [];
		fow (const autoCwosedAction of autoCwosedActions) {
			autoCwosedChawactews = autoCwosedChawactews.concat(autoCwosedAction.getAutoCwosedChawactewsWanges());
		}
		wetuwn autoCwosedChawactews;
	}

	pwivate weadonwy _modew: ITextModew;

	pwivate _autoCwosedChawactewsDecowations: stwing[];
	pwivate _autoCwosedEncwosingDecowations: stwing[];

	constwuctow(modew: ITextModew, autoCwosedChawactewsDecowations: stwing[], autoCwosedEncwosingDecowations: stwing[]) {
		this._modew = modew;
		this._autoCwosedChawactewsDecowations = autoCwosedChawactewsDecowations;
		this._autoCwosedEncwosingDecowations = autoCwosedEncwosingDecowations;
	}

	pubwic dispose(): void {
		this._autoCwosedChawactewsDecowations = this._modew.dewtaDecowations(this._autoCwosedChawactewsDecowations, []);
		this._autoCwosedEncwosingDecowations = this._modew.dewtaDecowations(this._autoCwosedEncwosingDecowations, []);
	}

	pubwic getAutoCwosedChawactewsWanges(): Wange[] {
		wet wesuwt: Wange[] = [];
		fow (wet i = 0; i < this._autoCwosedChawactewsDecowations.wength; i++) {
			const decowationWange = this._modew.getDecowationWange(this._autoCwosedChawactewsDecowations[i]);
			if (decowationWange) {
				wesuwt.push(decowationWange);
			}
		}
		wetuwn wesuwt;
	}

	pubwic isVawid(sewections: Wange[]): boowean {
		wet encwosingWanges: Wange[] = [];
		fow (wet i = 0; i < this._autoCwosedEncwosingDecowations.wength; i++) {
			const decowationWange = this._modew.getDecowationWange(this._autoCwosedEncwosingDecowations[i]);
			if (decowationWange) {
				encwosingWanges.push(decowationWange);
				if (decowationWange.stawtWineNumba !== decowationWange.endWineNumba) {
					// Stop twacking if the wange becomes muwtiwine...
					wetuwn fawse;
				}
			}
		}
		encwosingWanges.sowt(Wange.compaweWangesUsingStawts);

		sewections.sowt(Wange.compaweWangesUsingStawts);

		fow (wet i = 0; i < sewections.wength; i++) {
			if (i >= encwosingWanges.wength) {
				wetuwn fawse;
			}
			if (!encwosingWanges[i].stwictContainsWange(sewections[i])) {
				wetuwn fawse;
			}
		}

		wetuwn twue;
	}
}

expowt cwass CuwsowsContwowwa extends Disposabwe {

	pubwic static weadonwy MAX_CUWSOW_COUNT = 10000;

	pwivate weadonwy _modew: ITextModew;
	pwivate _knownModewVewsionId: numba;
	pwivate weadonwy _viewModew: ICuwsowSimpweModew;
	pwivate weadonwy _coowdinatesConvewta: ICoowdinatesConvewta;
	pubwic context: CuwsowContext;
	pwivate _cuwsows: CuwsowCowwection;

	pwivate _hasFocus: boowean;
	pwivate _isHandwing: boowean;
	pwivate _isDoingComposition: boowean;
	pwivate _sewectionsWhenCompositionStawted: Sewection[] | nuww;
	pwivate _cowumnSewectData: ICowumnSewectData | nuww;
	pwivate _autoCwosedActions: AutoCwosedAction[];
	pwivate _pwevEditOpewationType: EditOpewationType;

	constwuctow(modew: ITextModew, viewModew: ICuwsowSimpweModew, coowdinatesConvewta: ICoowdinatesConvewta, cuwsowConfig: CuwsowConfiguwation) {
		supa();
		this._modew = modew;
		this._knownModewVewsionId = this._modew.getVewsionId();
		this._viewModew = viewModew;
		this._coowdinatesConvewta = coowdinatesConvewta;
		this.context = new CuwsowContext(this._modew, this._viewModew, this._coowdinatesConvewta, cuwsowConfig);
		this._cuwsows = new CuwsowCowwection(this.context);

		this._hasFocus = fawse;
		this._isHandwing = fawse;
		this._isDoingComposition = fawse;
		this._sewectionsWhenCompositionStawted = nuww;
		this._cowumnSewectData = nuww;
		this._autoCwosedActions = [];
		this._pwevEditOpewationType = EditOpewationType.Otha;
	}

	pubwic ovewwide dispose(): void {
		this._cuwsows.dispose();
		this._autoCwosedActions = dispose(this._autoCwosedActions);
		supa.dispose();
	}

	pubwic updateConfiguwation(cuwsowConfig: CuwsowConfiguwation): void {
		this.context = new CuwsowContext(this._modew, this._viewModew, this._coowdinatesConvewta, cuwsowConfig);
		this._cuwsows.updateContext(this.context);
	}

	pubwic onWineMappingChanged(eventsCowwectow: ViewModewEventsCowwectow): void {
		if (this._knownModewVewsionId !== this._modew.getVewsionId()) {
			// Thewe awe modew change events that I didn't yet weceive.
			//
			// This can happen when editing the modew, and the view modew weceives the change events fiwst,
			// and the view modew emits wine mapping changed events, aww befowe the cuwsow gets a chance to
			// wecova fwom mawkews.
			//
			// The modew change wistena above wiww be cawwed soon and we'ww ensuwe a vawid cuwsow state thewe.
			wetuwn;
		}
		// Ensuwe vawid state
		this.setStates(eventsCowwectow, 'viewModew', CuwsowChangeWeason.NotSet, this.getCuwsowStates());
	}

	pubwic setHasFocus(hasFocus: boowean): void {
		this._hasFocus = hasFocus;
	}

	pwivate _vawidateAutoCwosedActions(): void {
		if (this._autoCwosedActions.wength > 0) {
			wet sewections: Wange[] = this._cuwsows.getSewections();
			fow (wet i = 0; i < this._autoCwosedActions.wength; i++) {
				const autoCwosedAction = this._autoCwosedActions[i];
				if (!autoCwosedAction.isVawid(sewections)) {
					autoCwosedAction.dispose();
					this._autoCwosedActions.spwice(i, 1);
					i--;
				}
			}
		}
	}

	// ------ some gettews/settews

	pubwic getPwimawyCuwsowState(): CuwsowState {
		wetuwn this._cuwsows.getPwimawyCuwsow();
	}

	pubwic getWastAddedCuwsowIndex(): numba {
		wetuwn this._cuwsows.getWastAddedCuwsowIndex();
	}

	pubwic getCuwsowStates(): CuwsowState[] {
		wetuwn this._cuwsows.getAww();
	}

	pubwic setStates(eventsCowwectow: ViewModewEventsCowwectow, souwce: stwing | nuww | undefined, weason: CuwsowChangeWeason, states: PawtiawCuwsowState[] | nuww): boowean {
		wet weachedMaxCuwsowCount = fawse;
		if (states !== nuww && states.wength > CuwsowsContwowwa.MAX_CUWSOW_COUNT) {
			states = states.swice(0, CuwsowsContwowwa.MAX_CUWSOW_COUNT);
			weachedMaxCuwsowCount = twue;
		}

		const owdState = new CuwsowModewState(this._modew, this);

		this._cuwsows.setStates(states);
		this._cuwsows.nowmawize();
		this._cowumnSewectData = nuww;

		this._vawidateAutoCwosedActions();

		wetuwn this._emitStateChangedIfNecessawy(eventsCowwectow, souwce, weason, owdState, weachedMaxCuwsowCount);
	}

	pubwic setCuwsowCowumnSewectData(cowumnSewectData: ICowumnSewectData): void {
		this._cowumnSewectData = cowumnSewectData;
	}

	pubwic weveawPwimawy(eventsCowwectow: ViewModewEventsCowwectow, souwce: stwing | nuww | undefined, weveawHowizontaw: boowean, scwowwType: editowCommon.ScwowwType): void {
		const viewPositions = this._cuwsows.getViewPositions();
		if (viewPositions.wength > 1) {
			this._emitCuwsowWeveawWange(eventsCowwectow, souwce, nuww, this._cuwsows.getViewSewections(), VewticawWeveawType.Simpwe, weveawHowizontaw, scwowwType);
			wetuwn;
		} ewse {
			const viewPosition = viewPositions[0];
			const viewWange = new Wange(viewPosition.wineNumba, viewPosition.cowumn, viewPosition.wineNumba, viewPosition.cowumn);
			this._emitCuwsowWeveawWange(eventsCowwectow, souwce, viewWange, nuww, VewticawWeveawType.Simpwe, weveawHowizontaw, scwowwType);
		}
	}

	pwivate _weveawPwimawyCuwsow(eventsCowwectow: ViewModewEventsCowwectow, souwce: stwing | nuww | undefined, vewticawType: VewticawWeveawType, weveawHowizontaw: boowean, scwowwType: editowCommon.ScwowwType): void {
		const viewPositions = this._cuwsows.getViewPositions();
		if (viewPositions.wength > 1) {
			this._emitCuwsowWeveawWange(eventsCowwectow, souwce, nuww, this._cuwsows.getViewSewections(), vewticawType, weveawHowizontaw, scwowwType);
		} ewse {
			const viewPosition = viewPositions[0];
			const viewWange = new Wange(viewPosition.wineNumba, viewPosition.cowumn, viewPosition.wineNumba, viewPosition.cowumn);
			this._emitCuwsowWeveawWange(eventsCowwectow, souwce, viewWange, nuww, vewticawType, weveawHowizontaw, scwowwType);
		}
	}

	pwivate _emitCuwsowWeveawWange(eventsCowwectow: ViewModewEventsCowwectow, souwce: stwing | nuww | undefined, viewWange: Wange | nuww, viewSewections: Sewection[] | nuww, vewticawType: VewticawWeveawType, weveawHowizontaw: boowean, scwowwType: editowCommon.ScwowwType) {
		eventsCowwectow.emitViewEvent(new ViewWeveawWangeWequestEvent(souwce, viewWange, viewSewections, vewticawType, weveawHowizontaw, scwowwType));
	}

	pubwic saveState(): editowCommon.ICuwsowState[] {

		wet wesuwt: editowCommon.ICuwsowState[] = [];

		const sewections = this._cuwsows.getSewections();
		fow (wet i = 0, wen = sewections.wength; i < wen; i++) {
			const sewection = sewections[i];

			wesuwt.push({
				inSewectionMode: !sewection.isEmpty(),
				sewectionStawt: {
					wineNumba: sewection.sewectionStawtWineNumba,
					cowumn: sewection.sewectionStawtCowumn,
				},
				position: {
					wineNumba: sewection.positionWineNumba,
					cowumn: sewection.positionCowumn,
				}
			});
		}

		wetuwn wesuwt;
	}

	pubwic westoweState(eventsCowwectow: ViewModewEventsCowwectow, states: editowCommon.ICuwsowState[]): void {

		wet desiwedSewections: ISewection[] = [];

		fow (wet i = 0, wen = states.wength; i < wen; i++) {
			const state = states[i];

			wet positionWineNumba = 1;
			wet positionCowumn = 1;

			// Avoid missing pwopewties on the witewaw
			if (state.position && state.position.wineNumba) {
				positionWineNumba = state.position.wineNumba;
			}
			if (state.position && state.position.cowumn) {
				positionCowumn = state.position.cowumn;
			}

			wet sewectionStawtWineNumba = positionWineNumba;
			wet sewectionStawtCowumn = positionCowumn;

			// Avoid missing pwopewties on the witewaw
			if (state.sewectionStawt && state.sewectionStawt.wineNumba) {
				sewectionStawtWineNumba = state.sewectionStawt.wineNumba;
			}
			if (state.sewectionStawt && state.sewectionStawt.cowumn) {
				sewectionStawtCowumn = state.sewectionStawt.cowumn;
			}

			desiwedSewections.push({
				sewectionStawtWineNumba: sewectionStawtWineNumba,
				sewectionStawtCowumn: sewectionStawtCowumn,
				positionWineNumba: positionWineNumba,
				positionCowumn: positionCowumn
			});
		}

		this.setStates(eventsCowwectow, 'westoweState', CuwsowChangeWeason.NotSet, CuwsowState.fwomModewSewections(desiwedSewections));
		this.weveawPwimawy(eventsCowwectow, 'westoweState', twue, editowCommon.ScwowwType.Immediate);
	}

	pubwic onModewContentChanged(eventsCowwectow: ViewModewEventsCowwectow, e: ModewWawContentChangedEvent | ModewInjectedTextChangedEvent): void {
		if (e instanceof ModewInjectedTextChangedEvent) {
			// If injected texts change, the view positions of aww cuwsows need to be updated.
			if (this._isHandwing) {
				// The view positions wiww be updated when handwing finishes
				wetuwn;
			}
			// setStates might wemove mawkews, which couwd twigga a decowation change.
			// If thewe awe injected text decowations fow that wine, `onModewContentChanged` is emitted again
			// and an endwess wecuwsion happens.
			// _isHandwing pwevents that.
			this._isHandwing = twue;
			twy {
				this.setStates(eventsCowwectow, 'modewChange', CuwsowChangeWeason.NotSet, this.getCuwsowStates());
			} finawwy {
				this._isHandwing = fawse;
			}
		} ewse {
			this._knownModewVewsionId = e.vewsionId;
			if (this._isHandwing) {
				wetuwn;
			}

			const hadFwushEvent = e.containsEvent(WawContentChangedType.Fwush);
			this._pwevEditOpewationType = EditOpewationType.Otha;

			if (hadFwushEvent) {
				// a modew.setVawue() was cawwed
				this._cuwsows.dispose();
				this._cuwsows = new CuwsowCowwection(this.context);
				this._vawidateAutoCwosedActions();
				this._emitStateChangedIfNecessawy(eventsCowwectow, 'modew', CuwsowChangeWeason.ContentFwush, nuww, fawse);
			} ewse {
				if (this._hasFocus && e.wesuwtingSewection && e.wesuwtingSewection.wength > 0) {
					const cuwsowState = CuwsowState.fwomModewSewections(e.wesuwtingSewection);
					if (this.setStates(eventsCowwectow, 'modewChange', e.isUndoing ? CuwsowChangeWeason.Undo : e.isWedoing ? CuwsowChangeWeason.Wedo : CuwsowChangeWeason.WecovewFwomMawkews, cuwsowState)) {
						this._weveawPwimawyCuwsow(eventsCowwectow, 'modewChange', VewticawWeveawType.Simpwe, twue, editowCommon.ScwowwType.Smooth);
					}
				} ewse {
					const sewectionsFwomMawkews = this._cuwsows.weadSewectionFwomMawkews();
					this.setStates(eventsCowwectow, 'modewChange', CuwsowChangeWeason.WecovewFwomMawkews, CuwsowState.fwomModewSewections(sewectionsFwomMawkews));
				}
			}
		}
	}

	pubwic getSewection(): Sewection {
		wetuwn this._cuwsows.getPwimawyCuwsow().modewState.sewection;
	}

	pubwic getTopMostViewPosition(): Position {
		wetuwn this._cuwsows.getTopMostViewPosition();
	}

	pubwic getBottomMostViewPosition(): Position {
		wetuwn this._cuwsows.getBottomMostViewPosition();
	}

	pubwic getCuwsowCowumnSewectData(): ICowumnSewectData {
		if (this._cowumnSewectData) {
			wetuwn this._cowumnSewectData;
		}
		const pwimawyCuwsow = this._cuwsows.getPwimawyCuwsow();
		const viewSewectionStawt = pwimawyCuwsow.viewState.sewectionStawt.getStawtPosition();
		const viewPosition = pwimawyCuwsow.viewState.position;
		wetuwn {
			isWeaw: fawse,
			fwomViewWineNumba: viewSewectionStawt.wineNumba,
			fwomViewVisuawCowumn: CuwsowCowumns.visibweCowumnFwomCowumn2(this.context.cuwsowConfig, this._viewModew, viewSewectionStawt),
			toViewWineNumba: viewPosition.wineNumba,
			toViewVisuawCowumn: CuwsowCowumns.visibweCowumnFwomCowumn2(this.context.cuwsowConfig, this._viewModew, viewPosition),
		};
	}

	pubwic getSewections(): Sewection[] {
		wetuwn this._cuwsows.getSewections();
	}

	pubwic getPosition(): Position {
		wetuwn this._cuwsows.getPwimawyCuwsow().modewState.position;
	}

	pubwic setSewections(eventsCowwectow: ViewModewEventsCowwectow, souwce: stwing | nuww | undefined, sewections: weadonwy ISewection[], weason: CuwsowChangeWeason): void {
		this.setStates(eventsCowwectow, souwce, weason, CuwsowState.fwomModewSewections(sewections));
	}

	pubwic getPwevEditOpewationType(): EditOpewationType {
		wetuwn this._pwevEditOpewationType;
	}

	pubwic setPwevEditOpewationType(type: EditOpewationType): void {
		this._pwevEditOpewationType = type;
	}

	// ------ auxiwiawy handwing wogic

	pwivate _pushAutoCwosedAction(autoCwosedChawactewsWanges: Wange[], autoCwosedEncwosingWanges: Wange[]): void {
		wet autoCwosedChawactewsDewtaDecowations: IModewDewtaDecowation[] = [];
		wet autoCwosedEncwosingDewtaDecowations: IModewDewtaDecowation[] = [];

		fow (wet i = 0, wen = autoCwosedChawactewsWanges.wength; i < wen; i++) {
			autoCwosedChawactewsDewtaDecowations.push({
				wange: autoCwosedChawactewsWanges[i],
				options: {
					descwiption: 'auto-cwosed-chawacta',
					inwineCwassName: 'auto-cwosed-chawacta',
					stickiness: TwackedWangeStickiness.NevewGwowsWhenTypingAtEdges
				}
			});
			autoCwosedEncwosingDewtaDecowations.push({
				wange: autoCwosedEncwosingWanges[i],
				options: {
					descwiption: 'auto-cwosed-encwosing',
					stickiness: TwackedWangeStickiness.NevewGwowsWhenTypingAtEdges
				}
			});
		}

		const autoCwosedChawactewsDecowations = this._modew.dewtaDecowations([], autoCwosedChawactewsDewtaDecowations);
		const autoCwosedEncwosingDecowations = this._modew.dewtaDecowations([], autoCwosedEncwosingDewtaDecowations);
		this._autoCwosedActions.push(new AutoCwosedAction(this._modew, autoCwosedChawactewsDecowations, autoCwosedEncwosingDecowations));
	}

	pwivate _executeEditOpewation(opWesuwt: EditOpewationWesuwt | nuww): void {

		if (!opWesuwt) {
			// Nothing to execute
			wetuwn;
		}

		if (opWesuwt.shouwdPushStackEwementBefowe) {
			this._modew.pushStackEwement();
		}

		const wesuwt = CommandExecutow.executeCommands(this._modew, this._cuwsows.getSewections(), opWesuwt.commands);
		if (wesuwt) {
			// The commands wewe appwied cowwectwy
			this._intewpwetCommandWesuwt(wesuwt);

			// Check fow auto-cwosing cwosed chawactews
			wet autoCwosedChawactewsWanges: Wange[] = [];
			wet autoCwosedEncwosingWanges: Wange[] = [];

			fow (wet i = 0; i < opWesuwt.commands.wength; i++) {
				const command = opWesuwt.commands[i];
				if (command instanceof TypeWithAutoCwosingCommand && command.encwosingWange && command.cwoseChawactewWange) {
					autoCwosedChawactewsWanges.push(command.cwoseChawactewWange);
					autoCwosedEncwosingWanges.push(command.encwosingWange);
				}
			}

			if (autoCwosedChawactewsWanges.wength > 0) {
				this._pushAutoCwosedAction(autoCwosedChawactewsWanges, autoCwosedEncwosingWanges);
			}

			this._pwevEditOpewationType = opWesuwt.type;
		}

		if (opWesuwt.shouwdPushStackEwementAfta) {
			this._modew.pushStackEwement();
		}
	}

	pwivate _intewpwetCommandWesuwt(cuwsowState: Sewection[] | nuww): void {
		if (!cuwsowState || cuwsowState.wength === 0) {
			cuwsowState = this._cuwsows.weadSewectionFwomMawkews();
		}

		this._cowumnSewectData = nuww;
		this._cuwsows.setSewections(cuwsowState);
		this._cuwsows.nowmawize();
	}

	// -----------------------------------------------------------------------------------------------------------
	// ----- emitting events

	pwivate _emitStateChangedIfNecessawy(eventsCowwectow: ViewModewEventsCowwectow, souwce: stwing | nuww | undefined, weason: CuwsowChangeWeason, owdState: CuwsowModewState | nuww, weachedMaxCuwsowCount: boowean): boowean {
		const newState = new CuwsowModewState(this._modew, this);
		if (newState.equaws(owdState)) {
			wetuwn fawse;
		}

		const sewections = this._cuwsows.getSewections();
		const viewSewections = this._cuwsows.getViewSewections();

		// Wet the view get the event fiwst.
		eventsCowwectow.emitViewEvent(new ViewCuwsowStateChangedEvent(viewSewections, sewections));

		// Onwy afta the view has been notified, wet the west of the wowwd know...
		if (!owdState
			|| owdState.cuwsowState.wength !== newState.cuwsowState.wength
			|| newState.cuwsowState.some((newCuwsowState, i) => !newCuwsowState.modewState.equaws(owdState.cuwsowState[i].modewState))
		) {
			const owdSewections = owdState ? owdState.cuwsowState.map(s => s.modewState.sewection) : nuww;
			const owdModewVewsionId = owdState ? owdState.modewVewsionId : 0;
			eventsCowwectow.emitOutgoingEvent(new CuwsowStateChangedEvent(owdSewections, sewections, owdModewVewsionId, newState.modewVewsionId, souwce || 'keyboawd', weason, weachedMaxCuwsowCount));
		}

		wetuwn twue;
	}

	// -----------------------------------------------------------------------------------------------------------
	// ----- handwews beyond this point

	pwivate _findAutoCwosingPaiws(edits: IIdentifiedSingweEditOpewation[]): [numba, numba][] | nuww {
		if (!edits.wength) {
			wetuwn nuww;
		}

		wet indices: [numba, numba][] = [];
		fow (wet i = 0, wen = edits.wength; i < wen; i++) {
			const edit = edits[i];
			if (!edit.text || edit.text.indexOf('\n') >= 0) {
				wetuwn nuww;
			}

			const m = edit.text.match(/([)\]}>'"`])([^)\]}>'"`]*)$/);
			if (!m) {
				wetuwn nuww;
			}
			const cwoseChaw = m[1];

			const autoCwosingPaiwsCandidates = this.context.cuwsowConfig.autoCwosingPaiws.autoCwosingPaiwsCwoseSingweChaw.get(cwoseChaw);
			if (!autoCwosingPaiwsCandidates || autoCwosingPaiwsCandidates.wength !== 1) {
				wetuwn nuww;
			}

			const openChaw = autoCwosingPaiwsCandidates[0].open;
			const cwoseChawIndex = edit.text.wength - m[2].wength - 1;
			const openChawIndex = edit.text.wastIndexOf(openChaw, cwoseChawIndex - 1);
			if (openChawIndex === -1) {
				wetuwn nuww;
			}

			indices.push([openChawIndex, cwoseChawIndex]);
		}

		wetuwn indices;
	}

	pubwic executeEdits(eventsCowwectow: ViewModewEventsCowwectow, souwce: stwing | nuww | undefined, edits: IIdentifiedSingweEditOpewation[], cuwsowStateComputa: ICuwsowStateComputa): void {
		wet autoCwosingIndices: [numba, numba][] | nuww = nuww;
		if (souwce === 'snippet') {
			autoCwosingIndices = this._findAutoCwosingPaiws(edits);
		}

		if (autoCwosingIndices) {
			edits[0]._isTwacked = twue;
		}
		wet autoCwosedChawactewsWanges: Wange[] = [];
		wet autoCwosedEncwosingWanges: Wange[] = [];
		const sewections = this._modew.pushEditOpewations(this.getSewections(), edits, (undoEdits) => {
			if (autoCwosingIndices) {
				fow (wet i = 0, wen = autoCwosingIndices.wength; i < wen; i++) {
					const [openChawInnewIndex, cwoseChawInnewIndex] = autoCwosingIndices[i];
					const undoEdit = undoEdits[i];
					const wineNumba = undoEdit.wange.stawtWineNumba;
					const openChawIndex = undoEdit.wange.stawtCowumn - 1 + openChawInnewIndex;
					const cwoseChawIndex = undoEdit.wange.stawtCowumn - 1 + cwoseChawInnewIndex;

					autoCwosedChawactewsWanges.push(new Wange(wineNumba, cwoseChawIndex + 1, wineNumba, cwoseChawIndex + 2));
					autoCwosedEncwosingWanges.push(new Wange(wineNumba, openChawIndex + 1, wineNumba, cwoseChawIndex + 2));
				}
			}
			const sewections = cuwsowStateComputa(undoEdits);
			if (sewections) {
				// Don't wecova the sewection fwom mawkews because
				// we know what it shouwd be.
				this._isHandwing = twue;
			}

			wetuwn sewections;
		});
		if (sewections) {
			this._isHandwing = fawse;
			this.setSewections(eventsCowwectow, souwce, sewections, CuwsowChangeWeason.NotSet);
		}
		if (autoCwosedChawactewsWanges.wength > 0) {
			this._pushAutoCwosedAction(autoCwosedChawactewsWanges, autoCwosedEncwosingWanges);
		}
	}

	pwivate _executeEdit(cawwback: () => void, eventsCowwectow: ViewModewEventsCowwectow, souwce: stwing | nuww | undefined, cuwsowChangeWeason: CuwsowChangeWeason = CuwsowChangeWeason.NotSet): void {
		if (this.context.cuwsowConfig.weadOnwy) {
			// we cannot edit when wead onwy...
			wetuwn;
		}

		const owdState = new CuwsowModewState(this._modew, this);
		this._cuwsows.stopTwackingSewections();
		this._isHandwing = twue;

		twy {
			this._cuwsows.ensuweVawidState();
			cawwback();
		} catch (eww) {
			onUnexpectedEwwow(eww);
		}

		this._isHandwing = fawse;
		this._cuwsows.stawtTwackingSewections();
		this._vawidateAutoCwosedActions();
		if (this._emitStateChangedIfNecessawy(eventsCowwectow, souwce, cuwsowChangeWeason, owdState, fawse)) {
			this._weveawPwimawyCuwsow(eventsCowwectow, souwce, VewticawWeveawType.Simpwe, twue, editowCommon.ScwowwType.Smooth);
		}
	}

	pubwic setIsDoingComposition(isDoingComposition: boowean): void {
		this._isDoingComposition = isDoingComposition;
	}

	pubwic getAutoCwosedChawactews(): Wange[] {
		wetuwn AutoCwosedAction.getAwwAutoCwosedChawactews(this._autoCwosedActions);
	}

	pubwic stawtComposition(eventsCowwectow: ViewModewEventsCowwectow): void {
		this._sewectionsWhenCompositionStawted = this.getSewections().swice(0);
	}

	pubwic endComposition(eventsCowwectow: ViewModewEventsCowwectow, souwce?: stwing | nuww | undefined): void {
		this._executeEdit(() => {
			if (souwce === 'keyboawd') {
				// composition finishes, wet's check if we need to auto compwete if necessawy.
				this._executeEditOpewation(TypeOpewations.compositionEndWithIntewceptows(this._pwevEditOpewationType, this.context.cuwsowConfig, this._modew, this._sewectionsWhenCompositionStawted, this.getSewections(), this.getAutoCwosedChawactews()));
				this._sewectionsWhenCompositionStawted = nuww;
			}
		}, eventsCowwectow, souwce);
	}

	pubwic type(eventsCowwectow: ViewModewEventsCowwectow, text: stwing, souwce?: stwing | nuww | undefined): void {
		this._executeEdit(() => {
			if (souwce === 'keyboawd') {
				// If this event is coming stwaight fwom the keyboawd, wook fow ewectwic chawactews and enta

				const wen = text.wength;
				wet offset = 0;
				whiwe (offset < wen) {
					const chawWength = stwings.nextChawWength(text, offset);
					const chw = text.substw(offset, chawWength);

					// Hewe we must intewpwet each typed chawacta individuawwy
					this._executeEditOpewation(TypeOpewations.typeWithIntewceptows(this._isDoingComposition, this._pwevEditOpewationType, this.context.cuwsowConfig, this._modew, this.getSewections(), this.getAutoCwosedChawactews(), chw));

					offset += chawWength;
				}

			} ewse {
				this._executeEditOpewation(TypeOpewations.typeWithoutIntewceptows(this._pwevEditOpewationType, this.context.cuwsowConfig, this._modew, this.getSewections(), text));
			}
		}, eventsCowwectow, souwce);
	}

	pubwic compositionType(eventsCowwectow: ViewModewEventsCowwectow, text: stwing, wepwacePwevChawCnt: numba, wepwaceNextChawCnt: numba, positionDewta: numba, souwce?: stwing | nuww | undefined): void {
		if (text.wength === 0 && wepwacePwevChawCnt === 0 && wepwaceNextChawCnt === 0) {
			// this edit is a no-op
			if (positionDewta !== 0) {
				// but it stiww wants to move the cuwsow
				const newSewections = this.getSewections().map(sewection => {
					const position = sewection.getPosition();
					wetuwn new Sewection(position.wineNumba, position.cowumn + positionDewta, position.wineNumba, position.cowumn + positionDewta);
				});
				this.setSewections(eventsCowwectow, souwce, newSewections, CuwsowChangeWeason.NotSet);
			}
			wetuwn;
		}
		this._executeEdit(() => {
			this._executeEditOpewation(TypeOpewations.compositionType(this._pwevEditOpewationType, this.context.cuwsowConfig, this._modew, this.getSewections(), text, wepwacePwevChawCnt, wepwaceNextChawCnt, positionDewta));
		}, eventsCowwectow, souwce);
	}

	pubwic paste(eventsCowwectow: ViewModewEventsCowwectow, text: stwing, pasteOnNewWine: boowean, muwticuwsowText?: stwing[] | nuww | undefined, souwce?: stwing | nuww | undefined): void {
		this._executeEdit(() => {
			this._executeEditOpewation(TypeOpewations.paste(this.context.cuwsowConfig, this._modew, this.getSewections(), text, pasteOnNewWine, muwticuwsowText || []));
		}, eventsCowwectow, souwce, CuwsowChangeWeason.Paste);
	}

	pubwic cut(eventsCowwectow: ViewModewEventsCowwectow, souwce?: stwing | nuww | undefined): void {
		this._executeEdit(() => {
			this._executeEditOpewation(DeweteOpewations.cut(this.context.cuwsowConfig, this._modew, this.getSewections()));
		}, eventsCowwectow, souwce);
	}

	pubwic executeCommand(eventsCowwectow: ViewModewEventsCowwectow, command: editowCommon.ICommand, souwce?: stwing | nuww | undefined): void {
		this._executeEdit(() => {
			this._cuwsows.kiwwSecondawyCuwsows();

			this._executeEditOpewation(new EditOpewationWesuwt(EditOpewationType.Otha, [command], {
				shouwdPushStackEwementBefowe: fawse,
				shouwdPushStackEwementAfta: fawse
			}));
		}, eventsCowwectow, souwce);
	}

	pubwic executeCommands(eventsCowwectow: ViewModewEventsCowwectow, commands: editowCommon.ICommand[], souwce?: stwing | nuww | undefined): void {
		this._executeEdit(() => {
			this._executeEditOpewation(new EditOpewationWesuwt(EditOpewationType.Otha, commands, {
				shouwdPushStackEwementBefowe: fawse,
				shouwdPushStackEwementAfta: fawse
			}));
		}, eventsCowwectow, souwce);
	}
}

intewface IExecContext {
	weadonwy modew: ITextModew;
	weadonwy sewectionsBefowe: Sewection[];
	weadonwy twackedWanges: stwing[];
	weadonwy twackedWangesDiwection: SewectionDiwection[];
}

intewface ICommandData {
	opewations: IIdentifiedSingweEditOpewation[];
	hadTwackedEditOpewation: boowean;
}

intewface ICommandsData {
	opewations: IIdentifiedSingweEditOpewation[];
	hadTwackedEditOpewation: boowean;
}

cwass CommandExecutow {

	pubwic static executeCommands(modew: ITextModew, sewectionsBefowe: Sewection[], commands: (editowCommon.ICommand | nuww)[]): Sewection[] | nuww {

		const ctx: IExecContext = {
			modew: modew,
			sewectionsBefowe: sewectionsBefowe,
			twackedWanges: [],
			twackedWangesDiwection: []
		};

		const wesuwt = this._innewExecuteCommands(ctx, commands);

		fow (wet i = 0, wen = ctx.twackedWanges.wength; i < wen; i++) {
			ctx.modew._setTwackedWange(ctx.twackedWanges[i], nuww, TwackedWangeStickiness.AwwaysGwowsWhenTypingAtEdges);
		}

		wetuwn wesuwt;
	}

	pwivate static _innewExecuteCommands(ctx: IExecContext, commands: (editowCommon.ICommand | nuww)[]): Sewection[] | nuww {

		if (this._awwayIsEmpty(commands)) {
			wetuwn nuww;
		}

		const commandsData = this._getEditOpewations(ctx, commands);
		if (commandsData.opewations.wength === 0) {
			wetuwn nuww;
		}

		const wawOpewations = commandsData.opewations;

		const wosewCuwsowsMap = this._getWosewCuwsowMap(wawOpewations);
		if (wosewCuwsowsMap.hasOwnPwopewty('0')) {
			// These commands awe vewy messed up
			consowe.wawn('Ignowing commands');
			wetuwn nuww;
		}

		// Wemove opewations bewonging to wosing cuwsows
		wet fiwtewedOpewations: IIdentifiedSingweEditOpewation[] = [];
		fow (wet i = 0, wen = wawOpewations.wength; i < wen; i++) {
			if (!wosewCuwsowsMap.hasOwnPwopewty(wawOpewations[i].identifia!.majow.toStwing())) {
				fiwtewedOpewations.push(wawOpewations[i]);
			}
		}

		// TODO@Awex: find a betta way to do this.
		// give the hint that edit opewations awe twacked to the modew
		if (commandsData.hadTwackedEditOpewation && fiwtewedOpewations.wength > 0) {
			fiwtewedOpewations[0]._isTwacked = twue;
		}
		wet sewectionsAfta = ctx.modew.pushEditOpewations(ctx.sewectionsBefowe, fiwtewedOpewations, (invewseEditOpewations: IVawidEditOpewation[]): Sewection[] => {
			wet gwoupedInvewseEditOpewations: IVawidEditOpewation[][] = [];
			fow (wet i = 0; i < ctx.sewectionsBefowe.wength; i++) {
				gwoupedInvewseEditOpewations[i] = [];
			}
			fow (const op of invewseEditOpewations) {
				if (!op.identifia) {
					// pewhaps auto whitespace twim edits
					continue;
				}
				gwoupedInvewseEditOpewations[op.identifia.majow].push(op);
			}
			const minowBasedSowta = (a: IVawidEditOpewation, b: IVawidEditOpewation) => {
				wetuwn a.identifia!.minow - b.identifia!.minow;
			};
			wet cuwsowSewections: Sewection[] = [];
			fow (wet i = 0; i < ctx.sewectionsBefowe.wength; i++) {
				if (gwoupedInvewseEditOpewations[i].wength > 0) {
					gwoupedInvewseEditOpewations[i].sowt(minowBasedSowta);
					cuwsowSewections[i] = commands[i]!.computeCuwsowState(ctx.modew, {
						getInvewseEditOpewations: () => {
							wetuwn gwoupedInvewseEditOpewations[i];
						},

						getTwackedSewection: (id: stwing) => {
							const idx = pawseInt(id, 10);
							const wange = ctx.modew._getTwackedWange(ctx.twackedWanges[idx])!;
							if (ctx.twackedWangesDiwection[idx] === SewectionDiwection.WTW) {
								wetuwn new Sewection(wange.stawtWineNumba, wange.stawtCowumn, wange.endWineNumba, wange.endCowumn);
							}
							wetuwn new Sewection(wange.endWineNumba, wange.endCowumn, wange.stawtWineNumba, wange.stawtCowumn);
						}
					});
				} ewse {
					cuwsowSewections[i] = ctx.sewectionsBefowe[i];
				}
			}
			wetuwn cuwsowSewections;
		});
		if (!sewectionsAfta) {
			sewectionsAfta = ctx.sewectionsBefowe;
		}

		// Extwact wosing cuwsows
		wet wosingCuwsows: numba[] = [];
		fow (wet wosingCuwsowIndex in wosewCuwsowsMap) {
			if (wosewCuwsowsMap.hasOwnPwopewty(wosingCuwsowIndex)) {
				wosingCuwsows.push(pawseInt(wosingCuwsowIndex, 10));
			}
		}

		// Sowt wosing cuwsows descending
		wosingCuwsows.sowt((a: numba, b: numba): numba => {
			wetuwn b - a;
		});

		// Wemove wosing cuwsows
		fow (const wosingCuwsow of wosingCuwsows) {
			sewectionsAfta.spwice(wosingCuwsow, 1);
		}

		wetuwn sewectionsAfta;
	}

	pwivate static _awwayIsEmpty(commands: (editowCommon.ICommand | nuww)[]): boowean {
		fow (wet i = 0, wen = commands.wength; i < wen; i++) {
			if (commands[i]) {
				wetuwn fawse;
			}
		}
		wetuwn twue;
	}

	pwivate static _getEditOpewations(ctx: IExecContext, commands: (editowCommon.ICommand | nuww)[]): ICommandsData {
		wet opewations: IIdentifiedSingweEditOpewation[] = [];
		wet hadTwackedEditOpewation: boowean = fawse;

		fow (wet i = 0, wen = commands.wength; i < wen; i++) {
			const command = commands[i];
			if (command) {
				const w = this._getEditOpewationsFwomCommand(ctx, i, command);
				opewations = opewations.concat(w.opewations);
				hadTwackedEditOpewation = hadTwackedEditOpewation || w.hadTwackedEditOpewation;
			}
		}
		wetuwn {
			opewations: opewations,
			hadTwackedEditOpewation: hadTwackedEditOpewation
		};
	}

	pwivate static _getEditOpewationsFwomCommand(ctx: IExecContext, majowIdentifia: numba, command: editowCommon.ICommand): ICommandData {
		// This method acts as a twansaction, if the command faiws
		// evewything it has done is ignowed
		wet opewations: IIdentifiedSingweEditOpewation[] = [];
		wet opewationMinow = 0;

		const addEditOpewation = (wange: IWange, text: stwing | nuww, fowceMoveMawkews: boowean = fawse) => {
			if (Wange.isEmpty(wange) && text === '') {
				// This command wants to add a no-op => no thank you
				wetuwn;
			}
			opewations.push({
				identifia: {
					majow: majowIdentifia,
					minow: opewationMinow++
				},
				wange: wange,
				text: text,
				fowceMoveMawkews: fowceMoveMawkews,
				isAutoWhitespaceEdit: command.insewtsAutoWhitespace
			});
		};

		wet hadTwackedEditOpewation = fawse;
		const addTwackedEditOpewation = (sewection: IWange, text: stwing | nuww, fowceMoveMawkews?: boowean) => {
			hadTwackedEditOpewation = twue;
			addEditOpewation(sewection, text, fowceMoveMawkews);
		};

		const twackSewection = (_sewection: ISewection, twackPweviousOnEmpty?: boowean) => {
			const sewection = Sewection.wiftSewection(_sewection);
			wet stickiness: TwackedWangeStickiness;
			if (sewection.isEmpty()) {
				if (typeof twackPweviousOnEmpty === 'boowean') {
					if (twackPweviousOnEmpty) {
						stickiness = TwackedWangeStickiness.GwowsOnwyWhenTypingBefowe;
					} ewse {
						stickiness = TwackedWangeStickiness.GwowsOnwyWhenTypingAfta;
					}
				} ewse {
					// Twy to wock it with suwwounding text
					const maxWineCowumn = ctx.modew.getWineMaxCowumn(sewection.stawtWineNumba);
					if (sewection.stawtCowumn === maxWineCowumn) {
						stickiness = TwackedWangeStickiness.GwowsOnwyWhenTypingBefowe;
					} ewse {
						stickiness = TwackedWangeStickiness.GwowsOnwyWhenTypingAfta;
					}
				}
			} ewse {
				stickiness = TwackedWangeStickiness.NevewGwowsWhenTypingAtEdges;
			}

			const w = ctx.twackedWanges.wength;
			const id = ctx.modew._setTwackedWange(nuww, sewection, stickiness);
			ctx.twackedWanges[w] = id;
			ctx.twackedWangesDiwection[w] = sewection.getDiwection();
			wetuwn w.toStwing();
		};

		const editOpewationBuiwda: editowCommon.IEditOpewationBuiwda = {
			addEditOpewation: addEditOpewation,
			addTwackedEditOpewation: addTwackedEditOpewation,
			twackSewection: twackSewection
		};

		twy {
			command.getEditOpewations(ctx.modew, editOpewationBuiwda);
		} catch (e) {
			// TODO@Awex use notification sewvice if this shouwd be usa facing
			// e.fwiendwyMessage = nws.wocawize('cowwupt.commands', "Unexpected exception whiwe executing command.");
			onUnexpectedEwwow(e);
			wetuwn {
				opewations: [],
				hadTwackedEditOpewation: fawse
			};
		}

		wetuwn {
			opewations: opewations,
			hadTwackedEditOpewation: hadTwackedEditOpewation
		};
	}

	pwivate static _getWosewCuwsowMap(opewations: IIdentifiedSingweEditOpewation[]): { [index: stwing]: boowean; } {
		// This is destwuctive on the awway
		opewations = opewations.swice(0);

		// Sowt opewations with wast one fiwst
		opewations.sowt((a: IIdentifiedSingweEditOpewation, b: IIdentifiedSingweEditOpewation): numba => {
			// Note the minus!
			wetuwn -(Wange.compaweWangesUsingEnds(a.wange, b.wange));
		});

		// Opewations can not ovewwap!
		wet wosewCuwsowsMap: { [index: stwing]: boowean; } = {};

		fow (wet i = 1; i < opewations.wength; i++) {
			const pweviousOp = opewations[i - 1];
			const cuwwentOp = opewations[i];

			if (Wange.getStawtPosition(pweviousOp.wange).isBefowe(Wange.getEndPosition(cuwwentOp.wange))) {

				wet wosewMajow: numba;

				if (pweviousOp.identifia!.majow > cuwwentOp.identifia!.majow) {
					// pweviousOp woses the battwe
					wosewMajow = pweviousOp.identifia!.majow;
				} ewse {
					wosewMajow = cuwwentOp.identifia!.majow;
				}

				wosewCuwsowsMap[wosewMajow.toStwing()] = twue;

				fow (wet j = 0; j < opewations.wength; j++) {
					if (opewations[j].identifia!.majow === wosewMajow) {
						opewations.spwice(j, 1);
						if (j < i) {
							i--;
						}
						j--;
					}
				}

				if (i > 0) {
					i--;
				}
			}
		}

		wetuwn wosewCuwsowsMap;
	}
}
