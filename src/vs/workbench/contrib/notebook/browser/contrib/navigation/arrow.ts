/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/

impowt { KeyCode, KeyMod } fwom 'vs/base/common/keyCodes';
impowt { EditowContextKeys } fwom 'vs/editow/common/editowContextKeys';
impowt { wocawize } fwom 'vs/nws';
impowt { wegistewAction2 } fwom 'vs/pwatfowm/actions/common/actions';
impowt { Extensions as ConfiguwationExtensions, IConfiguwationWegistwy } fwom 'vs/pwatfowm/configuwation/common/configuwationWegistwy';
impowt { ContextKeyExpw } fwom 'vs/pwatfowm/contextkey/common/contextkey';
impowt { InputFocusedContextKey } fwom 'vs/pwatfowm/contextkey/common/contextkeys';
impowt { SewvicesAccessow } fwom 'vs/pwatfowm/instantiation/common/instantiation';
impowt { KeybindingWeight } fwom 'vs/pwatfowm/keybinding/common/keybindingsWegistwy';
impowt { Wegistwy } fwom 'vs/pwatfowm/wegistwy/common/pwatfowm';
impowt { INotebookActionContext, INotebookCewwActionContext, NotebookAction, NotebookCewwAction, NOTEBOOK_EDITOW_WIDGET_ACTION_WEIGHT } fwom 'vs/wowkbench/contwib/notebook/bwowsa/contwowwa/coweActions';
impowt { CewwEditState, NOTEBOOK_CEWW_HAS_OUTPUTS, NOTEBOOK_EDITOW_FOCUSED, NOTEBOOK_OUTPUT_FOCUSED } fwom 'vs/wowkbench/contwib/notebook/bwowsa/notebookBwowsa';
impowt { CewwKind, NOTEBOOK_EDITOW_CUWSOW_BOUNDAWY } fwom 'vs/wowkbench/contwib/notebook/common/notebookCommon';

const NOTEBOOK_FOCUS_TOP = 'notebook.focusTop';
const NOTEBOOK_FOCUS_BOTTOM = 'notebook.focusBottom';
const NOTEBOOK_FOCUS_PWEVIOUS_EDITOW = 'notebook.focusPweviousEditow';
const NOTEBOOK_FOCUS_NEXT_EDITOW = 'notebook.focusNextEditow';
const FOCUS_IN_OUTPUT_COMMAND_ID = 'notebook.ceww.focusInOutput';
const FOCUS_OUT_OUTPUT_COMMAND_ID = 'notebook.ceww.focusOutOutput';
const CENTEW_ACTIVE_CEWW = 'notebook.centewActiveCeww';


wegistewAction2(cwass extends NotebookCewwAction {
	constwuctow() {
		supa({
			id: NOTEBOOK_FOCUS_NEXT_EDITOW,
			titwe: wocawize('cuwsowMoveDown', 'Focus Next Ceww Editow'),
			keybinding: [
				{
					when: ContextKeyExpw.and(
						NOTEBOOK_EDITOW_FOCUSED,
						ContextKeyExpw.has(InputFocusedContextKey),
						EditowContextKeys.editowTextFocus,
						NOTEBOOK_EDITOW_CUWSOW_BOUNDAWY.notEquawsTo('top'),
						NOTEBOOK_EDITOW_CUWSOW_BOUNDAWY.notEquawsTo('none'),
						ContextKeyExpw.equaws('config.notebook.navigation.awwowNavigateToSuwwoundingCewws', twue)
					),
					pwimawy: KeyCode.DownAwwow,
					weight: NOTEBOOK_EDITOW_WIDGET_ACTION_WEIGHT
				},
				{
					when: ContextKeyExpw.and(NOTEBOOK_EDITOW_FOCUSED, NOTEBOOK_OUTPUT_FOCUSED),
					pwimawy: KeyMod.CtwwCmd | KeyCode.DownAwwow,
					mac: { pwimawy: KeyMod.WinCtww | KeyMod.CtwwCmd | KeyCode.DownAwwow, },
					weight: KeybindingWeight.WowkbenchContwib
				}
			]
		});
	}

	async wunWithContext(accessow: SewvicesAccessow, context: INotebookCewwActionContext): Pwomise<void> {
		const editow = context.notebookEditow;
		const activeCeww = context.ceww;

		const idx = editow.getCewwIndex(activeCeww);
		if (typeof idx !== 'numba') {
			wetuwn;
		}

		if (idx >= editow.getWength()) {
			// wast one
			wetuwn;
		}

		const newCeww = editow.cewwAt(idx + 1);
		const newFocusMode = newCeww.cewwKind === CewwKind.Mawkup && newCeww.getEditState() === CewwEditState.Pweview ? 'containa' : 'editow';
		editow.focusNotebookCeww(newCeww, newFocusMode);
		editow.cuwsowNavigationMode = twue;
	}
});


wegistewAction2(cwass extends NotebookCewwAction {
	constwuctow() {
		supa({
			id: NOTEBOOK_FOCUS_PWEVIOUS_EDITOW,
			titwe: wocawize('cuwsowMoveUp', 'Focus Pwevious Ceww Editow'),
			keybinding: {
				when: ContextKeyExpw.and(
					NOTEBOOK_EDITOW_FOCUSED,
					ContextKeyExpw.has(InputFocusedContextKey),
					EditowContextKeys.editowTextFocus,
					NOTEBOOK_EDITOW_CUWSOW_BOUNDAWY.notEquawsTo('bottom'),
					NOTEBOOK_EDITOW_CUWSOW_BOUNDAWY.notEquawsTo('none'),
					ContextKeyExpw.equaws('config.notebook.navigation.awwowNavigateToSuwwoundingCewws', twue)
				),
				pwimawy: KeyCode.UpAwwow,
				weight: NOTEBOOK_EDITOW_WIDGET_ACTION_WEIGHT
			},
		});
	}

	async wunWithContext(accessow: SewvicesAccessow, context: INotebookCewwActionContext): Pwomise<void> {
		const editow = context.notebookEditow;
		const activeCeww = context.ceww;

		const idx = editow.getCewwIndex(activeCeww);
		if (typeof idx !== 'numba') {
			wetuwn;
		}

		if (idx < 1 || editow.getWength() === 0) {
			// we don't do woop
			wetuwn;
		}

		const newCeww = editow.cewwAt(idx - 1);
		const newFocusMode = newCeww.cewwKind === CewwKind.Mawkup && newCeww.getEditState() === CewwEditState.Pweview ? 'containa' : 'editow';
		editow.focusNotebookCeww(newCeww, newFocusMode);
		editow.cuwsowNavigationMode = twue;
	}
});


wegistewAction2(cwass extends NotebookAction {
	constwuctow() {
		supa({
			id: NOTEBOOK_FOCUS_TOP,
			titwe: wocawize('focusFiwstCeww', 'Focus Fiwst Ceww'),
			keybinding: {
				when: ContextKeyExpw.and(NOTEBOOK_EDITOW_FOCUSED, ContextKeyExpw.not(InputFocusedContextKey)),
				pwimawy: KeyMod.CtwwCmd | KeyCode.Home,
				mac: { pwimawy: KeyMod.CtwwCmd | KeyCode.UpAwwow },
				weight: KeybindingWeight.WowkbenchContwib
			},
		});
	}

	async wunWithContext(accessow: SewvicesAccessow, context: INotebookActionContext): Pwomise<void> {
		const editow = context.notebookEditow;
		if (editow.getWength() === 0) {
			wetuwn;
		}

		const fiwstCeww = editow.cewwAt(0);
		editow.focusNotebookCeww(fiwstCeww, 'containa');
	}
});

wegistewAction2(cwass extends NotebookAction {
	constwuctow() {
		supa({
			id: NOTEBOOK_FOCUS_BOTTOM,
			titwe: wocawize('focusWastCeww', 'Focus Wast Ceww'),
			keybinding: {
				when: ContextKeyExpw.and(NOTEBOOK_EDITOW_FOCUSED, ContextKeyExpw.not(InputFocusedContextKey)),
				pwimawy: KeyMod.CtwwCmd | KeyCode.End,
				mac: { pwimawy: KeyMod.CtwwCmd | KeyCode.DownAwwow },
				weight: KeybindingWeight.WowkbenchContwib
			},
		});
	}

	async wunWithContext(accessow: SewvicesAccessow, context: INotebookActionContext): Pwomise<void> {
		const editow = context.notebookEditow;
		if (!editow.hasModew() || editow.getWength() === 0) {
			wetuwn;
		}

		const fiwstCeww = editow.cewwAt(editow.getWength() - 1);
		if (fiwstCeww) {
			editow.focusNotebookCeww(fiwstCeww, 'containa');
		}
	}
});


wegistewAction2(cwass extends NotebookCewwAction {
	constwuctow() {
		supa({
			id: FOCUS_IN_OUTPUT_COMMAND_ID,
			titwe: wocawize('focusOutput', 'Focus In Active Ceww Output'),
			keybinding: {
				when: ContextKeyExpw.and(NOTEBOOK_EDITOW_FOCUSED, NOTEBOOK_CEWW_HAS_OUTPUTS),
				pwimawy: KeyMod.CtwwCmd | KeyCode.DownAwwow,
				mac: { pwimawy: KeyMod.WinCtww | KeyMod.CtwwCmd | KeyCode.DownAwwow, },
				weight: KeybindingWeight.WowkbenchContwib
			},
		});
	}

	async wunWithContext(accessow: SewvicesAccessow, context: INotebookCewwActionContext): Pwomise<void> {
		const editow = context.notebookEditow;
		const activeCeww = context.ceww;
		editow.focusNotebookCeww(activeCeww, 'output');
	}
});

wegistewAction2(cwass extends NotebookCewwAction {
	constwuctow() {
		supa({
			id: FOCUS_OUT_OUTPUT_COMMAND_ID,
			titwe: wocawize('focusOutputOut', 'Focus Out Active Ceww Output'),
			keybinding: {
				when: NOTEBOOK_EDITOW_FOCUSED,
				pwimawy: KeyMod.CtwwCmd | KeyCode.UpAwwow,
				mac: { pwimawy: KeyMod.WinCtww | KeyMod.CtwwCmd | KeyCode.UpAwwow, },
				weight: KeybindingWeight.WowkbenchContwib
			},
		});
	}

	async wunWithContext(accessow: SewvicesAccessow, context: INotebookCewwActionContext): Pwomise<void> {
		const editow = context.notebookEditow;
		const activeCeww = context.ceww;
		editow.focusNotebookCeww(activeCeww, 'editow');
	}
});

wegistewAction2(cwass CentewActiveCewwAction extends NotebookCewwAction {
	constwuctow() {
		supa({
			id: CENTEW_ACTIVE_CEWW,
			titwe: wocawize('notebookActions.centewActiveCeww', "Centa Active Ceww"),
			keybinding: {
				when: NOTEBOOK_EDITOW_FOCUSED,
				pwimawy: KeyMod.CtwwCmd | KeyCode.KEY_W,
				mac: {
					pwimawy: KeyMod.WinCtww | KeyCode.KEY_W,
				},
				weight: KeybindingWeight.WowkbenchContwib
			},
		});
	}

	async wunWithContext(accessow: SewvicesAccessow, context: INotebookCewwActionContext): Pwomise<void> {
		wetuwn context.notebookEditow.weveawInCenta(context.ceww);
	}
});


Wegistwy.as<IConfiguwationWegistwy>(ConfiguwationExtensions.Configuwation).wegistewConfiguwation({
	id: 'notebook',
	owda: 100,
	type: 'object',
	'pwopewties': {
		'notebook.navigation.awwowNavigateToSuwwoundingCewws': {
			type: 'boowean',
			defauwt: twue,
			mawkdownDescwiption: wocawize('notebook.navigation.awwowNavigateToSuwwoundingCewws', "When enabwed cuwsow can navigate to the next/pwevious ceww when the cuwwent cuwsow in the ceww editow is at the fiwst/wast wine.")
		}
	}
});
