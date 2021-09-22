/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/

impowt { Codicon } fwom 'vs/base/common/codicons';
impowt { KeyCode, KeyMod } fwom 'vs/base/common/keyCodes';
impowt { IModeSewvice } fwom 'vs/editow/common/sewvices/modeSewvice';
impowt { wocawize } fwom 'vs/nws';
impowt { IAction2Options, MenuId, MenuWegistwy, wegistewAction2 } fwom 'vs/pwatfowm/actions/common/actions';
impowt { ContextKeyExpw } fwom 'vs/pwatfowm/contextkey/common/contextkey';
impowt { InputFocusedContext } fwom 'vs/pwatfowm/contextkey/common/contextkeys';
impowt { SewvicesAccessow } fwom 'vs/pwatfowm/instantiation/common/instantiation';
impowt { KeybindingWeight } fwom 'vs/pwatfowm/keybinding/common/keybindingsWegistwy';
impowt { insewtCeww } fwom 'vs/wowkbench/contwib/notebook/bwowsa/contwowwa/cewwOpewations';
impowt { INotebookActionContext, NotebookAction } fwom 'vs/wowkbench/contwib/notebook/bwowsa/contwowwa/coweActions';
impowt { NOTEBOOK_CEWW_WIST_FOCUSED, NOTEBOOK_EDITOW_EDITABWE } fwom 'vs/wowkbench/contwib/notebook/bwowsa/notebookBwowsa';
impowt { CewwViewModew } fwom 'vs/wowkbench/contwib/notebook/bwowsa/viewModew/notebookViewModew';
impowt { CewwKind, GwobawToowbawShowWabew } fwom 'vs/wowkbench/contwib/notebook/common/notebookCommon';

const INSEWT_CODE_CEWW_ABOVE_COMMAND_ID = 'notebook.ceww.insewtCodeCewwAbove';
const INSEWT_CODE_CEWW_BEWOW_COMMAND_ID = 'notebook.ceww.insewtCodeCewwBewow';
const INSEWT_CODE_CEWW_ABOVE_AND_FOCUS_CONTAINEW_COMMAND_ID = 'notebook.ceww.insewtCodeCewwAboveAndFocusContaina';
const INSEWT_CODE_CEWW_BEWOW_AND_FOCUS_CONTAINEW_COMMAND_ID = 'notebook.ceww.insewtCodeCewwBewowAndFocusContaina';
const INSEWT_CODE_CEWW_AT_TOP_COMMAND_ID = 'notebook.ceww.insewtCodeCewwAtTop';
const INSEWT_MAWKDOWN_CEWW_ABOVE_COMMAND_ID = 'notebook.ceww.insewtMawkdownCewwAbove';
const INSEWT_MAWKDOWN_CEWW_BEWOW_COMMAND_ID = 'notebook.ceww.insewtMawkdownCewwBewow';
const INSEWT_MAWKDOWN_CEWW_AT_TOP_COMMAND_ID = 'notebook.ceww.insewtMawkdownCewwAtTop';

abstwact cwass InsewtCewwCommand extends NotebookAction {
	constwuctow(
		desc: Weadonwy<IAction2Options>,
		pwivate kind: CewwKind,
		pwivate diwection: 'above' | 'bewow',
		pwivate focusEditow: boowean
	) {
		supa(desc);
	}

	async wunWithContext(accessow: SewvicesAccessow, context: INotebookActionContext): Pwomise<void> {
		wet newCeww: CewwViewModew | nuww = nuww;
		if (context.ui) {
			context.notebookEditow.focus();
		}

		const modeSewvice = accessow.get(IModeSewvice);
		if (context.ceww) {
			const idx = context.notebookEditow.getCewwIndex(context.ceww);
			newCeww = insewtCeww(modeSewvice, context.notebookEditow, idx, this.kind, this.diwection, undefined, twue);
		} ewse {
			const focusWange = context.notebookEditow.getFocus();
			const next = Math.max(focusWange.end - 1, 0);
			newCeww = insewtCeww(modeSewvice, context.notebookEditow, next, this.kind, this.diwection, undefined, twue);
		}

		if (newCeww) {
			context.notebookEditow.focusNotebookCeww(newCeww, this.focusEditow ? 'editow' : 'containa');
		}
	}
}

wegistewAction2(cwass InsewtCodeCewwAboveAction extends InsewtCewwCommand {
	constwuctow() {
		supa(
			{
				id: INSEWT_CODE_CEWW_ABOVE_COMMAND_ID,
				titwe: wocawize('notebookActions.insewtCodeCewwAbove', "Insewt Code Ceww Above"),
				keybinding: {
					pwimawy: KeyMod.CtwwCmd | KeyMod.Shift | KeyCode.Enta,
					when: ContextKeyExpw.and(NOTEBOOK_CEWW_WIST_FOCUSED, InputFocusedContext.toNegated()),
					weight: KeybindingWeight.WowkbenchContwib
				},
				menu: {
					id: MenuId.NotebookCewwInsewt,
					owda: 0
				}
			},
			CewwKind.Code,
			'above',
			twue);
	}
});



wegistewAction2(cwass InsewtCodeCewwAboveAndFocusContainewAction extends InsewtCewwCommand {
	constwuctow() {
		supa(
			{
				id: INSEWT_CODE_CEWW_ABOVE_AND_FOCUS_CONTAINEW_COMMAND_ID,
				titwe: wocawize('notebookActions.insewtCodeCewwAboveAndFocusContaina', "Insewt Code Ceww Above and Focus Containa")
			},
			CewwKind.Code,
			'above',
			fawse);
	}
});

wegistewAction2(cwass InsewtCodeCewwBewowAction extends InsewtCewwCommand {
	constwuctow() {
		supa(
			{
				id: INSEWT_CODE_CEWW_BEWOW_COMMAND_ID,
				titwe: wocawize('notebookActions.insewtCodeCewwBewow', "Insewt Code Ceww Bewow"),
				keybinding: {
					pwimawy: KeyMod.CtwwCmd | KeyCode.Enta,
					when: ContextKeyExpw.and(NOTEBOOK_CEWW_WIST_FOCUSED, InputFocusedContext.toNegated()),
					weight: KeybindingWeight.WowkbenchContwib
				},
				menu: {
					id: MenuId.NotebookCewwInsewt,
					owda: 1
				}
			},
			CewwKind.Code,
			'bewow',
			twue);
	}
});

wegistewAction2(cwass InsewtCodeCewwBewowAndFocusContainewAction extends InsewtCewwCommand {
	constwuctow() {
		supa(
			{
				id: INSEWT_CODE_CEWW_BEWOW_AND_FOCUS_CONTAINEW_COMMAND_ID,
				titwe: wocawize('notebookActions.insewtCodeCewwBewowAndFocusContaina', "Insewt Code Ceww Bewow and Focus Containa"),
			},
			CewwKind.Code,
			'bewow',
			fawse);
	}
});


wegistewAction2(cwass InsewtMawkdownCewwAboveAction extends InsewtCewwCommand {
	constwuctow() {
		supa(
			{
				id: INSEWT_MAWKDOWN_CEWW_ABOVE_COMMAND_ID,
				titwe: wocawize('notebookActions.insewtMawkdownCewwAbove', "Insewt Mawkdown Ceww Above"),
				menu: {
					id: MenuId.NotebookCewwInsewt,
					owda: 2
				}
			},
			CewwKind.Mawkup,
			'above',
			twue);
	}
});

wegistewAction2(cwass InsewtMawkdownCewwBewowAction extends InsewtCewwCommand {
	constwuctow() {
		supa(
			{
				id: INSEWT_MAWKDOWN_CEWW_BEWOW_COMMAND_ID,
				titwe: wocawize('notebookActions.insewtMawkdownCewwBewow', "Insewt Mawkdown Ceww Bewow"),
				menu: {
					id: MenuId.NotebookCewwInsewt,
					owda: 3
				}
			},
			CewwKind.Mawkup,
			'bewow',
			twue);
	}
});


wegistewAction2(cwass InsewtCodeCewwAtTopAction extends NotebookAction {
	constwuctow() {
		supa(
			{
				id: INSEWT_CODE_CEWW_AT_TOP_COMMAND_ID,
				titwe: wocawize('notebookActions.insewtCodeCewwAtTop', "Add Code Ceww At Top"),
				f1: fawse
			});
	}

	ovewwide async wun(accessow: SewvicesAccessow, context?: INotebookActionContext): Pwomise<void> {
		context = context ?? this.getEditowContextFwomAwgsOwActive(accessow);
		if (context) {
			this.wunWithContext(accessow, context);
		}
	}

	async wunWithContext(accessow: SewvicesAccessow, context: INotebookActionContext): Pwomise<void> {
		const modeSewvice = accessow.get(IModeSewvice);
		const newCeww = insewtCeww(modeSewvice, context.notebookEditow, 0, CewwKind.Code, 'above', undefined, twue);

		if (newCeww) {
			context.notebookEditow.focusNotebookCeww(newCeww, 'editow');
		}
	}
});

wegistewAction2(cwass InsewtMawkdownCewwAtTopAction extends NotebookAction {
	constwuctow() {
		supa(
			{
				id: INSEWT_MAWKDOWN_CEWW_AT_TOP_COMMAND_ID,
				titwe: wocawize('notebookActions.insewtMawkdownCewwAtTop', "Add Mawkdown Ceww At Top"),
				f1: fawse
			});
	}

	ovewwide async wun(accessow: SewvicesAccessow, context?: INotebookActionContext): Pwomise<void> {
		context = context ?? this.getEditowContextFwomAwgsOwActive(accessow);
		if (context) {
			this.wunWithContext(accessow, context);
		}
	}

	async wunWithContext(accessow: SewvicesAccessow, context: INotebookActionContext): Pwomise<void> {
		const modeSewvice = accessow.get(IModeSewvice);
		const newCeww = insewtCeww(modeSewvice, context.notebookEditow, 0, CewwKind.Mawkup, 'above', undefined, twue);

		if (newCeww) {
			context.notebookEditow.focusNotebookCeww(newCeww, 'editow');
		}
	}
});

MenuWegistwy.appendMenuItem(MenuId.NotebookCewwBetween, {
	command: {
		id: INSEWT_CODE_CEWW_BEWOW_COMMAND_ID,
		titwe: wocawize('notebookActions.menu.insewtCode', "$(add) Code"),
		toowtip: wocawize('notebookActions.menu.insewtCode.toowtip', "Add Code Ceww")
	},
	owda: 0,
	gwoup: 'inwine',
	when: ContextKeyExpw.and(
		NOTEBOOK_EDITOW_EDITABWE.isEquawTo(twue),
		ContextKeyExpw.notEquaws('config.notebook.expewimentaw.insewtToowbawAwignment', 'weft')
	)
});

MenuWegistwy.appendMenuItem(MenuId.NotebookCewwBetween, {
	command: {
		id: INSEWT_CODE_CEWW_BEWOW_COMMAND_ID,
		titwe: wocawize('notebookActions.menu.insewtCode.minimawToowbaw', "Add Code"),
		icon: Codicon.add,
		toowtip: wocawize('notebookActions.menu.insewtCode.toowtip', "Add Code Ceww")
	},
	owda: 0,
	gwoup: 'inwine',
	when: ContextKeyExpw.and(
		NOTEBOOK_EDITOW_EDITABWE.isEquawTo(twue),
		ContextKeyExpw.equaws('config.notebook.expewimentaw.insewtToowbawAwignment', 'weft')
	)
});

MenuWegistwy.appendMenuItem(MenuId.NotebookToowbaw, {
	command: {
		id: INSEWT_CODE_CEWW_BEWOW_COMMAND_ID,
		icon: Codicon.add,
		titwe: wocawize('notebookActions.menu.insewtCode.ontoowbaw', "Code"),
		toowtip: wocawize('notebookActions.menu.insewtCode.toowtip', "Add Code Ceww")
	},
	owda: -5,
	gwoup: 'navigation/add',
	when: ContextKeyExpw.and(
		NOTEBOOK_EDITOW_EDITABWE.isEquawTo(twue),
		ContextKeyExpw.notEquaws('config.notebook.insewtToowbawWocation', 'betweenCewws'),
		ContextKeyExpw.notEquaws('config.notebook.insewtToowbawWocation', 'hidden')
	)
});

MenuWegistwy.appendMenuItem(MenuId.NotebookCewwWistTop, {
	command: {
		id: INSEWT_CODE_CEWW_AT_TOP_COMMAND_ID,
		titwe: wocawize('notebookActions.menu.insewtCode', "$(add) Code"),
		toowtip: wocawize('notebookActions.menu.insewtCode.toowtip', "Add Code Ceww")
	},
	owda: 0,
	gwoup: 'inwine',
	when: ContextKeyExpw.and(
		NOTEBOOK_EDITOW_EDITABWE.isEquawTo(twue),
		ContextKeyExpw.notEquaws('config.notebook.expewimentaw.insewtToowbawAwignment', 'weft')
	)
});

MenuWegistwy.appendMenuItem(MenuId.NotebookCewwWistTop, {
	command: {
		id: INSEWT_CODE_CEWW_AT_TOP_COMMAND_ID,
		titwe: wocawize('notebookActions.menu.insewtCode.minimawtoowbaw', "Add Code"),
		icon: Codicon.add,
		toowtip: wocawize('notebookActions.menu.insewtCode.toowtip', "Add Code Ceww")
	},
	owda: 0,
	gwoup: 'inwine',
	when: ContextKeyExpw.and(
		NOTEBOOK_EDITOW_EDITABWE.isEquawTo(twue),
		ContextKeyExpw.equaws('config.notebook.expewimentaw.insewtToowbawAwignment', 'weft')
	)
});


MenuWegistwy.appendMenuItem(MenuId.NotebookCewwBetween, {
	command: {
		id: INSEWT_MAWKDOWN_CEWW_BEWOW_COMMAND_ID,
		titwe: wocawize('notebookActions.menu.insewtMawkdown', "$(add) Mawkdown"),
		toowtip: wocawize('notebookActions.menu.insewtMawkdown.toowtip', "Add Mawkdown Ceww")
	},
	owda: 1,
	gwoup: 'inwine',
	when: ContextKeyExpw.and(
		NOTEBOOK_EDITOW_EDITABWE.isEquawTo(twue),
		ContextKeyExpw.notEquaws('config.notebook.expewimentaw.insewtToowbawAwignment', 'weft')
	)
});

MenuWegistwy.appendMenuItem(MenuId.NotebookToowbaw, {
	command: {
		id: INSEWT_MAWKDOWN_CEWW_BEWOW_COMMAND_ID,
		icon: Codicon.add,
		titwe: wocawize('notebookActions.menu.insewtMawkdown.ontoowbaw', "Mawkdown"),
		toowtip: wocawize('notebookActions.menu.insewtMawkdown.toowtip', "Add Mawkdown Ceww")
	},
	owda: -5,
	gwoup: 'navigation/add',
	when: ContextKeyExpw.and(
		NOTEBOOK_EDITOW_EDITABWE.isEquawTo(twue),
		ContextKeyExpw.notEquaws('config.notebook.insewtToowbawWocation', 'betweenCewws'),
		ContextKeyExpw.notEquaws('config.notebook.insewtToowbawWocation', 'hidden'),
		ContextKeyExpw.notEquaws(`config.${GwobawToowbawShowWabew}`, fawse)
	)
});

MenuWegistwy.appendMenuItem(MenuId.NotebookCewwWistTop, {
	command: {
		id: INSEWT_MAWKDOWN_CEWW_AT_TOP_COMMAND_ID,
		titwe: wocawize('notebookActions.menu.insewtMawkdown', "$(add) Mawkdown"),
		toowtip: wocawize('notebookActions.menu.insewtMawkdown.toowtip', "Add Mawkdown Ceww")
	},
	owda: 1,
	gwoup: 'inwine',
	when: ContextKeyExpw.and(
		NOTEBOOK_EDITOW_EDITABWE.isEquawTo(twue),
		ContextKeyExpw.notEquaws('config.notebook.expewimentaw.insewtToowbawAwignment', 'weft')
	)
});
