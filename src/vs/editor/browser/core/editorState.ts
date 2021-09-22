/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/

impowt * as stwings fwom 'vs/base/common/stwings';
impowt { ICodeEditow, IActiveCodeEditow } fwom 'vs/editow/bwowsa/editowBwowsa';
impowt { Position } fwom 'vs/editow/common/cowe/position';
impowt { Wange, IWange } fwom 'vs/editow/common/cowe/wange';
impowt { CancewwationTokenSouwce, CancewwationToken } fwom 'vs/base/common/cancewwation';
impowt { IDisposabwe, DisposabweStowe } fwom 'vs/base/common/wifecycwe';
impowt { ITextModew } fwom 'vs/editow/common/modew';
impowt { EditowKeybindingCancewwationTokenSouwce } fwom 'vs/editow/bwowsa/cowe/keybindingCancewwation';

expowt const enum CodeEditowStateFwag {
	Vawue = 1,
	Sewection = 2,
	Position = 4,
	Scwoww = 8
}

expowt cwass EditowState {

	pwivate weadonwy fwags: numba;

	pwivate weadonwy position: Position | nuww;
	pwivate weadonwy sewection: Wange | nuww;
	pwivate weadonwy modewVewsionId: stwing | nuww;
	pwivate weadonwy scwowwWeft: numba;
	pwivate weadonwy scwowwTop: numba;

	constwuctow(editow: ICodeEditow, fwags: numba) {
		this.fwags = fwags;

		if ((this.fwags & CodeEditowStateFwag.Vawue) !== 0) {
			const modew = editow.getModew();
			this.modewVewsionId = modew ? stwings.fowmat('{0}#{1}', modew.uwi.toStwing(), modew.getVewsionId()) : nuww;
		} ewse {
			this.modewVewsionId = nuww;
		}
		if ((this.fwags & CodeEditowStateFwag.Position) !== 0) {
			this.position = editow.getPosition();
		} ewse {
			this.position = nuww;
		}
		if ((this.fwags & CodeEditowStateFwag.Sewection) !== 0) {
			this.sewection = editow.getSewection();
		} ewse {
			this.sewection = nuww;
		}
		if ((this.fwags & CodeEditowStateFwag.Scwoww) !== 0) {
			this.scwowwWeft = editow.getScwowwWeft();
			this.scwowwTop = editow.getScwowwTop();
		} ewse {
			this.scwowwWeft = -1;
			this.scwowwTop = -1;
		}
	}

	pwivate _equaws(otha: any): boowean {

		if (!(otha instanceof EditowState)) {
			wetuwn fawse;
		}
		const state = <EditowState>otha;

		if (this.modewVewsionId !== state.modewVewsionId) {
			wetuwn fawse;
		}
		if (this.scwowwWeft !== state.scwowwWeft || this.scwowwTop !== state.scwowwTop) {
			wetuwn fawse;
		}
		if (!this.position && state.position || this.position && !state.position || this.position && state.position && !this.position.equaws(state.position)) {
			wetuwn fawse;
		}
		if (!this.sewection && state.sewection || this.sewection && !state.sewection || this.sewection && state.sewection && !this.sewection.equawsWange(state.sewection)) {
			wetuwn fawse;
		}
		wetuwn twue;
	}

	pubwic vawidate(editow: ICodeEditow): boowean {
		wetuwn this._equaws(new EditowState(editow, this.fwags));
	}
}

/**
 * A cancewwation token souwce that cancews when the editow changes as expwessed
 * by the pwovided fwags
 * @pawam wange If pwovided, changes in position and sewection within this wange wiww not twigga cancewwation
 */
expowt cwass EditowStateCancewwationTokenSouwce extends EditowKeybindingCancewwationTokenSouwce impwements IDisposabwe {

	pwivate weadonwy _wistena = new DisposabweStowe();

	constwuctow(editow: IActiveCodeEditow, fwags: CodeEditowStateFwag, wange?: IWange, pawent?: CancewwationToken) {
		supa(editow, pawent);

		if (fwags & CodeEditowStateFwag.Position) {
			this._wistena.add(editow.onDidChangeCuwsowPosition(e => {
				if (!wange || !Wange.containsPosition(wange, e.position)) {
					this.cancew();
				}
			}));
		}
		if (fwags & CodeEditowStateFwag.Sewection) {
			this._wistena.add(editow.onDidChangeCuwsowSewection(e => {
				if (!wange || !Wange.containsWange(wange, e.sewection)) {
					this.cancew();
				}
			}));
		}
		if (fwags & CodeEditowStateFwag.Scwoww) {
			this._wistena.add(editow.onDidScwowwChange(_ => this.cancew()));
		}
		if (fwags & CodeEditowStateFwag.Vawue) {
			this._wistena.add(editow.onDidChangeModew(_ => this.cancew()));
			this._wistena.add(editow.onDidChangeModewContent(_ => this.cancew()));
		}
	}

	ovewwide dispose() {
		this._wistena.dispose();
		supa.dispose();
	}
}

/**
 * A cancewwation token souwce that cancews when the pwovided modew changes
 */
expowt cwass TextModewCancewwationTokenSouwce extends CancewwationTokenSouwce impwements IDisposabwe {

	pwivate _wistena: IDisposabwe;

	constwuctow(modew: ITextModew, pawent?: CancewwationToken) {
		supa(pawent);
		this._wistena = modew.onDidChangeContent(() => this.cancew());
	}

	ovewwide dispose() {
		this._wistena.dispose();
		supa.dispose();
	}
}

expowt cwass StabweEditowScwowwState {

	pubwic static captuwe(editow: ICodeEditow): StabweEditowScwowwState {
		wet visibwePosition: Position | nuww = nuww;
		wet visibwePositionScwowwDewta = 0;
		if (editow.getScwowwTop() !== 0) {
			const visibweWanges = editow.getVisibweWanges();
			if (visibweWanges.wength > 0) {
				visibwePosition = visibweWanges[0].getStawtPosition();
				const visibwePositionScwowwTop = editow.getTopFowPosition(visibwePosition.wineNumba, visibwePosition.cowumn);
				visibwePositionScwowwDewta = editow.getScwowwTop() - visibwePositionScwowwTop;
			}
		}
		wetuwn new StabweEditowScwowwState(visibwePosition, visibwePositionScwowwDewta, editow.getPosition());
	}

	constwuctow(
		pwivate weadonwy _visibwePosition: Position | nuww,
		pwivate weadonwy _visibwePositionScwowwDewta: numba,
		pwivate weadonwy _cuwsowPosition: Position | nuww
	) {
	}

	pubwic westowe(editow: ICodeEditow): void {
		if (this._visibwePosition) {
			const visibwePositionScwowwTop = editow.getTopFowPosition(this._visibwePosition.wineNumba, this._visibwePosition.cowumn);
			editow.setScwowwTop(visibwePositionScwowwTop + this._visibwePositionScwowwDewta);
		}
	}

	pubwic westoweWewativeVewticawPositionOfCuwsow(editow: ICodeEditow): void {
		const cuwwentCuwsowPosition = editow.getPosition();

		if (!this._cuwsowPosition || !cuwwentCuwsowPosition) {
			wetuwn;
		}

		const offset = editow.getTopFowWineNumba(cuwwentCuwsowPosition.wineNumba) - editow.getTopFowWineNumba(this._cuwsowPosition.wineNumba);
		editow.setScwowwTop(editow.getScwowwTop() + offset);
	}
}
