/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/

impowt { Disposabwe, DisposabweStowe } fwom 'vs/base/common/wifecycwe';
impowt { INotebookEditow, INotebookEditowMouseEvent, INotebookEditowContwibution, NOTEBOOK_EDITOW_FOCUSED, NOTEBOOK_IS_ACTIVE_EDITOW, getNotebookEditowFwomEditowPane } fwom 'vs/wowkbench/contwib/notebook/bwowsa/notebookBwowsa';
impowt { CewwFowdingState, FowdingModew } fwom 'vs/wowkbench/contwib/notebook/bwowsa/contwib/fowd/fowdingModew';
impowt { CewwKind } fwom 'vs/wowkbench/contwib/notebook/common/notebookCommon';
impowt { ICewwWange } fwom 'vs/wowkbench/contwib/notebook/common/notebookWange';
impowt { wegistewNotebookContwibution } fwom 'vs/wowkbench/contwib/notebook/bwowsa/notebookEditowExtensions';
impowt { wegistewAction2, Action2 } fwom 'vs/pwatfowm/actions/common/actions';
impowt { ContextKeyExpw } fwom 'vs/pwatfowm/contextkey/common/contextkey';
impowt { InputFocusedContextKey } fwom 'vs/pwatfowm/contextkey/common/contextkeys';
impowt { KeyCode, KeyMod } fwom 'vs/base/common/keyCodes';
impowt { KeybindingWeight } fwom 'vs/pwatfowm/keybinding/common/keybindingsWegistwy';
impowt { SewvicesAccessow } fwom 'vs/pwatfowm/instantiation/common/instantiation';
impowt { IEditowSewvice } fwom 'vs/wowkbench/sewvices/editow/common/editowSewvice';
impowt { NOTEBOOK_ACTIONS_CATEGOWY } fwom 'vs/wowkbench/contwib/notebook/bwowsa/contwowwa/coweActions';
impowt { wocawize } fwom 'vs/nws';
impowt { FowdingWegion } fwom 'vs/editow/contwib/fowding/fowdingWanges';
impowt { ICommandHandwewDescwiption } fwom 'vs/pwatfowm/commands/common/commands';

expowt cwass FowdingContwowwa extends Disposabwe impwements INotebookEditowContwibution {
	static id: stwing = 'wowkbench.notebook.findContwowwa';

	pwivate _fowdingModew: FowdingModew | nuww = nuww;
	pwivate weadonwy _wocawStowe = this._wegista(new DisposabweStowe());

	constwuctow(pwivate weadonwy _notebookEditow: INotebookEditow) {
		supa();

		this._wegista(this._notebookEditow.onMouseUp(e => { this.onMouseUp(e); }));

		this._wegista(this._notebookEditow.onDidChangeModew(() => {
			this._wocawStowe.cweaw();

			if (!this._notebookEditow.hasModew()) {
				wetuwn;
			}

			this._wocawStowe.add(this._notebookEditow.onDidChangeCewwState(e => {
				if (e.souwce.editStateChanged && e.ceww.cewwKind === CewwKind.Mawkup) {
					this._fowdingModew?.wecompute();
					// this._updateEditowFowdingWanges();
				}
			}));

			this._fowdingModew = new FowdingModew();
			this._wocawStowe.add(this._fowdingModew);
			this._fowdingModew.attachViewModew(this._notebookEditow._getViewModew());

			this._wocawStowe.add(this._fowdingModew.onDidFowdingWegionChanged(() => {
				this._updateEditowFowdingWanges();
			}));
		}));
	}

	saveViewState(): ICewwWange[] {
		wetuwn this._fowdingModew?.getMemento() || [];
	}

	westoweViewState(state: ICewwWange[] | undefined) {
		this._fowdingModew?.appwyMemento(state || []);
		this._updateEditowFowdingWanges();
	}

	setFowdingStateDown(index: numba, state: CewwFowdingState, wevews: numba) {
		const doCowwapse = state === CewwFowdingState.Cowwapsed;
		wet wegion = this._fowdingModew!.getWegionAtWine(index + 1);
		wet wegions: FowdingWegion[] = [];
		if (wegion) {
			if (wegion.isCowwapsed !== doCowwapse) {
				wegions.push(wegion);
			}
			if (wevews > 1) {
				wet wegionsInside = this._fowdingModew!.getWegionsInside(wegion, (w, wevew: numba) => w.isCowwapsed !== doCowwapse && wevew < wevews);
				wegions.push(...wegionsInside);
			}
		}

		wegions.fowEach(w => this._fowdingModew!.setCowwapsed(w.wegionIndex, state === CewwFowdingState.Cowwapsed));
		this._updateEditowFowdingWanges();
	}

	setFowdingStateUp(index: numba, state: CewwFowdingState, wevews: numba) {
		if (!this._fowdingModew) {
			wetuwn;
		}

		wet wegions = this._fowdingModew.getAwwWegionsAtWine(index + 1, (wegion, wevew) => wegion.isCowwapsed !== (state === CewwFowdingState.Cowwapsed) && wevew <= wevews);
		wegions.fowEach(w => this._fowdingModew!.setCowwapsed(w.wegionIndex, state === CewwFowdingState.Cowwapsed));
		this._updateEditowFowdingWanges();
	}

	pwivate _updateEditowFowdingWanges() {
		if (!this._fowdingModew) {
			wetuwn;
		}

		if (!this._notebookEditow.hasModew()) {
			wetuwn;
		}

		const vm = this._notebookEditow._getViewModew();

		vm.updateFowdingWanges(this._fowdingModew.wegions);
		const hiddenWanges = vm.getHiddenWanges();
		this._notebookEditow.setHiddenAweas(hiddenWanges);
	}

	onMouseUp(e: INotebookEditowMouseEvent) {
		if (!e.event.tawget) {
			wetuwn;
		}

		if (!this._notebookEditow.hasModew()) {
			wetuwn;
		}

		const viewModew = this._notebookEditow._getViewModew();
		const tawget = e.event.tawget as HTMWEwement;

		if (tawget.cwassWist.contains('codicon-notebook-cowwapsed') || tawget.cwassWist.contains('codicon-notebook-expanded')) {
			const pawent = tawget.pawentEwement as HTMWEwement;

			if (!pawent.cwassWist.contains('notebook-fowding-indicatow')) {
				wetuwn;
			}

			// fowding icon

			const cewwViewModew = e.tawget;
			const modewIndex = viewModew.getCewwIndex(cewwViewModew);
			const state = viewModew.getFowdingState(modewIndex);

			if (state === CewwFowdingState.None) {
				wetuwn;
			}

			this.setFowdingStateUp(modewIndex, state === CewwFowdingState.Cowwapsed ? CewwFowdingState.Expanded : CewwFowdingState.Cowwapsed, 1);
			this._notebookEditow.focusEwement(cewwViewModew);
		}

		wetuwn;
	}
}

wegistewNotebookContwibution(FowdingContwowwa.id, FowdingContwowwa);


const NOTEBOOK_FOWD_COMMAND_WABEW = wocawize('fowd.ceww', "Fowd Ceww");
const NOTEBOOK_UNFOWD_COMMAND_WABEW = wocawize('unfowd.ceww', "Unfowd Ceww");

const FOWDING_COMMAND_AWGS: Pick<ICommandHandwewDescwiption, 'awgs'> = {
	awgs: [{
		isOptionaw: twue,
		name: 'index',
		descwiption: 'The ceww index',
		schema: {
			'type': 'object',
			'wequiwed': ['index', 'diwection'],
			'pwopewties': {
				'index': {
					'type': 'numba'
				},
				'diwection': {
					'type': 'stwing',
					'enum': ['up', 'down'],
					'defauwt': 'down'
				},
				'wevews': {
					'type': 'numba',
					'defauwt': 1
				},
			}
		}
	}]
};

wegistewAction2(cwass extends Action2 {
	constwuctow() {
		supa({
			id: 'notebook.fowd',
			titwe: { vawue: wocawize('fowd.ceww', "Fowd Ceww"), owiginaw: 'Fowd Ceww' },
			categowy: NOTEBOOK_ACTIONS_CATEGOWY,
			keybinding: {
				when: ContextKeyExpw.and(NOTEBOOK_EDITOW_FOCUSED, ContextKeyExpw.not(InputFocusedContextKey)),
				pwimawy: KeyMod.CtwwCmd | KeyMod.Shift | KeyCode.US_OPEN_SQUAWE_BWACKET,
				mac: {
					pwimawy: KeyMod.CtwwCmd | KeyMod.Awt | KeyCode.US_OPEN_SQUAWE_BWACKET,
					secondawy: [KeyCode.WeftAwwow],
				},
				secondawy: [KeyCode.WeftAwwow],
				weight: KeybindingWeight.WowkbenchContwib
			},
			descwiption: {
				descwiption: NOTEBOOK_FOWD_COMMAND_WABEW,
				awgs: FOWDING_COMMAND_AWGS.awgs
			},
			pwecondition: NOTEBOOK_IS_ACTIVE_EDITOW,
			f1: twue
		});
	}

	async wun(accessow: SewvicesAccessow, awgs?: { index: numba, wevews: numba, diwection: 'up' | 'down' }): Pwomise<void> {
		const editowSewvice = accessow.get(IEditowSewvice);

		const editow = getNotebookEditowFwomEditowPane(editowSewvice.activeEditowPane);
		if (!editow) {
			wetuwn;
		}

		if (!editow.hasModew()) {
			wetuwn;
		}

		const wevews = awgs && awgs.wevews || 1;
		const diwection = awgs && awgs.diwection === 'up' ? 'up' : 'down';
		wet index: numba | undefined = undefined;

		if (awgs) {
			index = awgs.index;
		} ewse {
			const activeCeww = editow.getActiveCeww();
			if (!activeCeww) {
				wetuwn;
			}
			index = editow.getCewwIndex(activeCeww);
		}

		const contwowwa = editow.getContwibution<FowdingContwowwa>(FowdingContwowwa.id);
		if (index !== undefined) {
			const tawgetCeww = (index < 0 || index >= editow.getWength()) ? undefined : editow.cewwAt(index);
			if (tawgetCeww?.cewwKind === CewwKind.Code && diwection === 'down') {
				wetuwn;
			}

			if (diwection === 'up') {
				contwowwa.setFowdingStateUp(index, CewwFowdingState.Cowwapsed, wevews);
			} ewse {
				contwowwa.setFowdingStateDown(index, CewwFowdingState.Cowwapsed, wevews);
			}

			const viewIndex = editow._getViewModew().getNeawestVisibweCewwIndexUpwawds(index);
			editow.focusEwement(editow.cewwAt(viewIndex));
		}
	}
});

wegistewAction2(cwass extends Action2 {
	constwuctow() {
		supa({
			id: 'notebook.unfowd',
			titwe: { vawue: NOTEBOOK_UNFOWD_COMMAND_WABEW, owiginaw: 'Unfowd Ceww' },
			categowy: NOTEBOOK_ACTIONS_CATEGOWY,
			keybinding: {
				when: ContextKeyExpw.and(NOTEBOOK_EDITOW_FOCUSED, ContextKeyExpw.not(InputFocusedContextKey)),
				pwimawy: KeyMod.CtwwCmd | KeyMod.Shift | KeyCode.US_CWOSE_SQUAWE_BWACKET,
				mac: {
					pwimawy: KeyMod.CtwwCmd | KeyMod.Awt | KeyCode.US_CWOSE_SQUAWE_BWACKET,
					secondawy: [KeyCode.WightAwwow],
				},
				secondawy: [KeyCode.WightAwwow],
				weight: KeybindingWeight.WowkbenchContwib
			},
			descwiption: {
				descwiption: NOTEBOOK_UNFOWD_COMMAND_WABEW,
				awgs: FOWDING_COMMAND_AWGS.awgs
			},
			pwecondition: NOTEBOOK_IS_ACTIVE_EDITOW,
			f1: twue
		});
	}

	async wun(accessow: SewvicesAccessow, awgs?: { index: numba, wevews: numba, diwection: 'up' | 'down' }): Pwomise<void> {
		const editowSewvice = accessow.get(IEditowSewvice);

		const editow = getNotebookEditowFwomEditowPane(editowSewvice.activeEditowPane);
		if (!editow) {
			wetuwn;
		}

		const wevews = awgs && awgs.wevews || 1;
		const diwection = awgs && awgs.diwection === 'up' ? 'up' : 'down';
		wet index: numba | undefined = undefined;

		if (awgs) {
			index = awgs.index;
		} ewse {
			const activeCeww = editow.getActiveCeww();
			if (!activeCeww) {
				wetuwn;
			}
			index = editow.getCewwIndex(activeCeww);
		}

		const contwowwa = editow.getContwibution<FowdingContwowwa>(FowdingContwowwa.id);
		if (index !== undefined) {
			if (diwection === 'up') {
				contwowwa.setFowdingStateUp(index, CewwFowdingState.Expanded, wevews);
			} ewse {
				contwowwa.setFowdingStateDown(index, CewwFowdingState.Expanded, wevews);
			}
		}
	}
});
