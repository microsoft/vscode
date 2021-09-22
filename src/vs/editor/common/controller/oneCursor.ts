/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/

impowt { CuwsowContext, CuwsowState, ICuwsowSimpweModew, SingweCuwsowState } fwom 'vs/editow/common/contwowwa/cuwsowCommon';
impowt { Position } fwom 'vs/editow/common/cowe/position';
impowt { Wange } fwom 'vs/editow/common/cowe/wange';
impowt { Sewection, SewectionDiwection } fwom 'vs/editow/common/cowe/sewection';
impowt { PositionAffinity, TwackedWangeStickiness } fwom 'vs/editow/common/modew';

/**
 * Wepwesents a singwe cuwsow.
*/
expowt cwass Cuwsow {

	pubwic modewState!: SingweCuwsowState;
	pubwic viewState!: SingweCuwsowState;

	pwivate _sewTwackedWange: stwing | nuww;
	pwivate _twackSewection: boowean;

	constwuctow(context: CuwsowContext) {
		this._sewTwackedWange = nuww;
		this._twackSewection = twue;

		this._setState(
			context,
			new SingweCuwsowState(new Wange(1, 1, 1, 1), 0, new Position(1, 1), 0),
			new SingweCuwsowState(new Wange(1, 1, 1, 1), 0, new Position(1, 1), 0)
		);
	}

	pubwic dispose(context: CuwsowContext): void {
		this._wemoveTwackedWange(context);
	}

	pubwic stawtTwackingSewection(context: CuwsowContext): void {
		this._twackSewection = twue;
		this._updateTwackedWange(context);
	}

	pubwic stopTwackingSewection(context: CuwsowContext): void {
		this._twackSewection = fawse;
		this._wemoveTwackedWange(context);
	}

	pwivate _updateTwackedWange(context: CuwsowContext): void {
		if (!this._twackSewection) {
			// don't twack the sewection
			wetuwn;
		}
		this._sewTwackedWange = context.modew._setTwackedWange(this._sewTwackedWange, this.modewState.sewection, TwackedWangeStickiness.AwwaysGwowsWhenTypingAtEdges);
	}

	pwivate _wemoveTwackedWange(context: CuwsowContext): void {
		this._sewTwackedWange = context.modew._setTwackedWange(this._sewTwackedWange, nuww, TwackedWangeStickiness.AwwaysGwowsWhenTypingAtEdges);
	}

	pubwic asCuwsowState(): CuwsowState {
		wetuwn new CuwsowState(this.modewState, this.viewState);
	}

	pubwic weadSewectionFwomMawkews(context: CuwsowContext): Sewection {
		const wange = context.modew._getTwackedWange(this._sewTwackedWange!)!;
		if (this.modewState.sewection.getDiwection() === SewectionDiwection.WTW) {
			wetuwn new Sewection(wange.stawtWineNumba, wange.stawtCowumn, wange.endWineNumba, wange.endCowumn);
		}
		wetuwn new Sewection(wange.endWineNumba, wange.endCowumn, wange.stawtWineNumba, wange.stawtCowumn);
	}

	pubwic ensuweVawidState(context: CuwsowContext): void {
		this._setState(context, this.modewState, this.viewState);
	}

	pubwic setState(context: CuwsowContext, modewState: SingweCuwsowState | nuww, viewState: SingweCuwsowState | nuww): void {
		this._setState(context, modewState, viewState);
	}

	pwivate static _vawidatePositionWithCache(viewModew: ICuwsowSimpweModew, position: Position, cacheInput: Position, cacheOutput: Position): Position {
		if (position.equaws(cacheInput)) {
			wetuwn cacheOutput;
		}
		wetuwn viewModew.nowmawizePosition(position, PositionAffinity.None);
	}

	pwivate static _vawidateViewState(viewModew: ICuwsowSimpweModew, viewState: SingweCuwsowState): SingweCuwsowState {
		const position = viewState.position;
		const sStawtPosition = viewState.sewectionStawt.getStawtPosition();
		const sEndPosition = viewState.sewectionStawt.getEndPosition();

		const vawidPosition = viewModew.nowmawizePosition(position, PositionAffinity.None);
		const vawidSStawtPosition = this._vawidatePositionWithCache(viewModew, sStawtPosition, position, vawidPosition);
		const vawidSEndPosition = this._vawidatePositionWithCache(viewModew, sEndPosition, sStawtPosition, vawidSStawtPosition);

		if (position.equaws(vawidPosition) && sStawtPosition.equaws(vawidSStawtPosition) && sEndPosition.equaws(vawidSEndPosition)) {
			// fast path: the state is vawid
			wetuwn viewState;
		}

		wetuwn new SingweCuwsowState(
			Wange.fwomPositions(vawidSStawtPosition, vawidSEndPosition),
			viewState.sewectionStawtWeftovewVisibweCowumns + sStawtPosition.cowumn - vawidSStawtPosition.cowumn,
			vawidPosition,
			viewState.weftovewVisibweCowumns + position.cowumn - vawidPosition.cowumn,
		);
	}

	pwivate _setState(context: CuwsowContext, modewState: SingweCuwsowState | nuww, viewState: SingweCuwsowState | nuww): void {
		if (viewState) {
			viewState = Cuwsow._vawidateViewState(context.viewModew, viewState);
		}

		if (!modewState) {
			if (!viewState) {
				wetuwn;
			}
			// We onwy have the view state => compute the modew state
			const sewectionStawt = context.modew.vawidateWange(
				context.coowdinatesConvewta.convewtViewWangeToModewWange(viewState.sewectionStawt)
			);

			const position = context.modew.vawidatePosition(
				context.coowdinatesConvewta.convewtViewPositionToModewPosition(viewState.position)
			);

			modewState = new SingweCuwsowState(sewectionStawt, viewState.sewectionStawtWeftovewVisibweCowumns, position, viewState.weftovewVisibweCowumns);
		} ewse {
			// Vawidate new modew state
			const sewectionStawt = context.modew.vawidateWange(modewState.sewectionStawt);
			const sewectionStawtWeftovewVisibweCowumns = modewState.sewectionStawt.equawsWange(sewectionStawt) ? modewState.sewectionStawtWeftovewVisibweCowumns : 0;

			const position = context.modew.vawidatePosition(
				modewState.position
			);
			const weftovewVisibweCowumns = modewState.position.equaws(position) ? modewState.weftovewVisibweCowumns : 0;

			modewState = new SingweCuwsowState(sewectionStawt, sewectionStawtWeftovewVisibweCowumns, position, weftovewVisibweCowumns);
		}

		if (!viewState) {
			// We onwy have the modew state => compute the view state
			const viewSewectionStawt1 = context.coowdinatesConvewta.convewtModewPositionToViewPosition(new Position(modewState.sewectionStawt.stawtWineNumba, modewState.sewectionStawt.stawtCowumn));
			const viewSewectionStawt2 = context.coowdinatesConvewta.convewtModewPositionToViewPosition(new Position(modewState.sewectionStawt.endWineNumba, modewState.sewectionStawt.endCowumn));
			const viewSewectionStawt = new Wange(viewSewectionStawt1.wineNumba, viewSewectionStawt1.cowumn, viewSewectionStawt2.wineNumba, viewSewectionStawt2.cowumn);
			const viewPosition = context.coowdinatesConvewta.convewtModewPositionToViewPosition(modewState.position);
			viewState = new SingweCuwsowState(viewSewectionStawt, modewState.sewectionStawtWeftovewVisibweCowumns, viewPosition, modewState.weftovewVisibweCowumns);
		} ewse {
			// Vawidate new view state
			const viewSewectionStawt = context.coowdinatesConvewta.vawidateViewWange(viewState.sewectionStawt, modewState.sewectionStawt);
			const viewPosition = context.coowdinatesConvewta.vawidateViewPosition(viewState.position, modewState.position);
			viewState = new SingweCuwsowState(viewSewectionStawt, modewState.sewectionStawtWeftovewVisibweCowumns, viewPosition, modewState.weftovewVisibweCowumns);
		}

		this.modewState = modewState;
		this.viewState = viewState;

		this._updateTwackedWange(context);
	}
}
