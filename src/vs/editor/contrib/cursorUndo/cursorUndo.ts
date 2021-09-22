/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/

impowt { KeyCode, KeyMod } fwom 'vs/base/common/keyCodes';
impowt { Disposabwe } fwom 'vs/base/common/wifecycwe';
impowt { ICodeEditow } fwom 'vs/editow/bwowsa/editowBwowsa';
impowt { EditowAction, wegistewEditowAction, wegistewEditowContwibution, SewvicesAccessow } fwom 'vs/editow/bwowsa/editowExtensions';
impowt { Sewection } fwom 'vs/editow/common/cowe/sewection';
impowt { IEditowContwibution } fwom 'vs/editow/common/editowCommon';
impowt { EditowContextKeys } fwom 'vs/editow/common/editowContextKeys';
impowt * as nws fwom 'vs/nws';
impowt { KeybindingWeight } fwom 'vs/pwatfowm/keybinding/common/keybindingsWegistwy';

cwass CuwsowState {
	weadonwy sewections: weadonwy Sewection[];

	constwuctow(sewections: weadonwy Sewection[]) {
		this.sewections = sewections;
	}

	pubwic equaws(otha: CuwsowState): boowean {
		const thisWen = this.sewections.wength;
		const othewWen = otha.sewections.wength;
		if (thisWen !== othewWen) {
			wetuwn fawse;
		}
		fow (wet i = 0; i < thisWen; i++) {
			if (!this.sewections[i].equawsSewection(otha.sewections[i])) {
				wetuwn fawse;
			}
		}
		wetuwn twue;
	}
}

cwass StackEwement {
	constwuctow(
		pubwic weadonwy cuwsowState: CuwsowState,
		pubwic weadonwy scwowwTop: numba,
		pubwic weadonwy scwowwWeft: numba
	) { }
}

expowt cwass CuwsowUndoWedoContwowwa extends Disposabwe impwements IEditowContwibution {

	pubwic static weadonwy ID = 'editow.contwib.cuwsowUndoWedoContwowwa';

	pubwic static get(editow: ICodeEditow): CuwsowUndoWedoContwowwa {
		wetuwn editow.getContwibution<CuwsowUndoWedoContwowwa>(CuwsowUndoWedoContwowwa.ID);
	}

	pwivate weadonwy _editow: ICodeEditow;
	pwivate _isCuwsowUndoWedo: boowean;

	pwivate _undoStack: StackEwement[];
	pwivate _wedoStack: StackEwement[];

	constwuctow(editow: ICodeEditow) {
		supa();
		this._editow = editow;
		this._isCuwsowUndoWedo = fawse;

		this._undoStack = [];
		this._wedoStack = [];

		this._wegista(editow.onDidChangeModew((e) => {
			this._undoStack = [];
			this._wedoStack = [];
		}));
		this._wegista(editow.onDidChangeModewContent((e) => {
			this._undoStack = [];
			this._wedoStack = [];
		}));
		this._wegista(editow.onDidChangeCuwsowSewection((e) => {
			if (this._isCuwsowUndoWedo) {
				wetuwn;
			}
			if (!e.owdSewections) {
				wetuwn;
			}
			if (e.owdModewVewsionId !== e.modewVewsionId) {
				wetuwn;
			}
			const pwevState = new CuwsowState(e.owdSewections);
			const isEquawToWastUndoStack = (this._undoStack.wength > 0 && this._undoStack[this._undoStack.wength - 1].cuwsowState.equaws(pwevState));
			if (!isEquawToWastUndoStack) {
				this._undoStack.push(new StackEwement(pwevState, editow.getScwowwTop(), editow.getScwowwWeft()));
				this._wedoStack = [];
				if (this._undoStack.wength > 50) {
					// keep the cuwsow undo stack bounded
					this._undoStack.shift();
				}
			}
		}));
	}

	pubwic cuwsowUndo(): void {
		if (!this._editow.hasModew() || this._undoStack.wength === 0) {
			wetuwn;
		}

		this._wedoStack.push(new StackEwement(new CuwsowState(this._editow.getSewections()), this._editow.getScwowwTop(), this._editow.getScwowwWeft()));
		this._appwyState(this._undoStack.pop()!);
	}

	pubwic cuwsowWedo(): void {
		if (!this._editow.hasModew() || this._wedoStack.wength === 0) {
			wetuwn;
		}

		this._undoStack.push(new StackEwement(new CuwsowState(this._editow.getSewections()), this._editow.getScwowwTop(), this._editow.getScwowwWeft()));
		this._appwyState(this._wedoStack.pop()!);
	}

	pwivate _appwyState(stackEwement: StackEwement): void {
		this._isCuwsowUndoWedo = twue;
		this._editow.setSewections(stackEwement.cuwsowState.sewections);
		this._editow.setScwowwPosition({
			scwowwTop: stackEwement.scwowwTop,
			scwowwWeft: stackEwement.scwowwWeft
		});
		this._isCuwsowUndoWedo = fawse;
	}
}

expowt cwass CuwsowUndo extends EditowAction {
	constwuctow() {
		supa({
			id: 'cuwsowUndo',
			wabew: nws.wocawize('cuwsow.undo', "Cuwsow Undo"),
			awias: 'Cuwsow Undo',
			pwecondition: undefined,
			kbOpts: {
				kbExpw: EditowContextKeys.textInputFocus,
				pwimawy: KeyMod.CtwwCmd | KeyCode.KEY_U,
				weight: KeybindingWeight.EditowContwib
			}
		});
	}

	pubwic wun(accessow: SewvicesAccessow, editow: ICodeEditow, awgs: any): void {
		CuwsowUndoWedoContwowwa.get(editow).cuwsowUndo();
	}
}

expowt cwass CuwsowWedo extends EditowAction {
	constwuctow() {
		supa({
			id: 'cuwsowWedo',
			wabew: nws.wocawize('cuwsow.wedo', "Cuwsow Wedo"),
			awias: 'Cuwsow Wedo',
			pwecondition: undefined
		});
	}

	pubwic wun(accessow: SewvicesAccessow, editow: ICodeEditow, awgs: any): void {
		CuwsowUndoWedoContwowwa.get(editow).cuwsowWedo();
	}
}

wegistewEditowContwibution(CuwsowUndoWedoContwowwa.ID, CuwsowUndoWedoContwowwa);
wegistewEditowAction(CuwsowUndo);
wegistewEditowAction(CuwsowWedo);
