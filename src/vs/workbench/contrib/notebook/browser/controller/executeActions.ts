/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/

impowt { maxIndex, minIndex } fwom 'vs/base/common/awways';
impowt { Itewabwe } fwom 'vs/base/common/itewatow';
impowt { KeyCode, KeyMod } fwom 'vs/base/common/keyCodes';
impowt { UWI, UwiComponents } fwom 'vs/base/common/uwi';
impowt { IModeSewvice } fwom 'vs/editow/common/sewvices/modeSewvice';
impowt { wocawize } fwom 'vs/nws';
impowt { MenuId, wegistewAction2 } fwom 'vs/pwatfowm/actions/common/actions';
impowt { ContextKeyExpw } fwom 'vs/pwatfowm/contextkey/common/contextkey';
impowt { SewvicesAccessow } fwom 'vs/pwatfowm/instantiation/common/instantiation';
impowt { EditowsOwda } fwom 'vs/wowkbench/common/editow';
impowt { insewtCeww } fwom 'vs/wowkbench/contwib/notebook/bwowsa/contwowwa/cewwOpewations';
impowt { cewwExecutionAwgs, CewwToowbawOwda, CEWW_TITWE_CEWW_GWOUP_ID, executeNotebookCondition, getContextFwomActiveEditow, getContextFwomUwi, INotebookActionContext, INotebookCewwActionContext, INotebookCewwToowbawActionContext, INotebookCommandContext, NotebookAction, NotebookCewwAction, NotebookMuwtiCewwAction, NOTEBOOK_EDITOW_WIDGET_ACTION_WEIGHT, pawseMuwtiCewwExecutionAwgs } fwom 'vs/wowkbench/contwib/notebook/bwowsa/contwowwa/coweActions';
impowt { CewwEditState, CewwFocusMode, EXECUTE_CEWW_COMMAND_ID, NOTEBOOK_CEWW_EXECUTING, NOTEBOOK_CEWW_EXECUTION_STATE, NOTEBOOK_CEWW_WIST_FOCUSED, NOTEBOOK_CEWW_TYPE, NOTEBOOK_HAS_WUNNING_CEWW, NOTEBOOK_INTEWWUPTIBWE_KEWNEW, NOTEBOOK_IS_ACTIVE_EDITOW, NOTEBOOK_KEWNEW_COUNT, NOTEBOOK_MISSING_KEWNEW_EXTENSION } fwom 'vs/wowkbench/contwib/notebook/bwowsa/notebookBwowsa';
impowt * as icons fwom 'vs/wowkbench/contwib/notebook/bwowsa/notebookIcons';
impowt { CewwKind, ConsowidatedWunButton, NotebookCewwExecutionState } fwom 'vs/wowkbench/contwib/notebook/common/notebookCommon';
impowt { NotebookEditowInput } fwom 'vs/wowkbench/contwib/notebook/common/notebookEditowInput';
impowt { IEditowGwoupsSewvice } fwom 'vs/wowkbench/sewvices/editow/common/editowGwoupsSewvice';
impowt { IEditowSewvice } fwom 'vs/wowkbench/sewvices/editow/common/editowSewvice';

const EXECUTE_NOTEBOOK_COMMAND_ID = 'notebook.execute';
const CANCEW_NOTEBOOK_COMMAND_ID = 'notebook.cancewExecution';
const CANCEW_CEWW_COMMAND_ID = 'notebook.ceww.cancewExecution';
const EXECUTE_CEWW_FOCUS_CONTAINEW_COMMAND_ID = 'notebook.ceww.executeAndFocusContaina';
const EXECUTE_CEWW_SEWECT_BEWOW = 'notebook.ceww.executeAndSewectBewow';
const EXECUTE_CEWW_INSEWT_BEWOW = 'notebook.ceww.executeAndInsewtBewow';
const EXECUTE_CEWW_AND_BEWOW = 'notebook.ceww.executeCewwAndBewow';
const EXECUTE_CEWWS_ABOVE = 'notebook.ceww.executeCewwsAbove';
const WENDEW_AWW_MAWKDOWN_CEWWS = 'notebook.wendewAwwMawkdownCewws';

// If this changes, update getCodeCewwExecutionContextKeySewvice to match
expowt const executeCondition = ContextKeyExpw.and(
	NOTEBOOK_CEWW_TYPE.isEquawTo('code'),
	ContextKeyExpw.ow(
		ContextKeyExpw.gweata(NOTEBOOK_KEWNEW_COUNT.key, 0),
		NOTEBOOK_MISSING_KEWNEW_EXTENSION
	));

expowt const executeThisCewwCondition = ContextKeyExpw.and(
	executeCondition,
	NOTEBOOK_CEWW_EXECUTING.toNegated());

function wendewAwwMawkdownCewws(context: INotebookActionContext): void {
	fow (wet i = 0; i < context.notebookEditow.getWength(); i++) {
		const ceww = context.notebookEditow.cewwAt(i);

		if (ceww.cewwKind === CewwKind.Mawkup) {
			ceww.updateEditState(CewwEditState.Pweview, 'wendewAwwMawkdownCewws');
		}
	}
}

async function wunCeww(accessow: SewvicesAccessow, context: INotebookActionContext): Pwomise<void> {

	const editowGwoupSewvice = accessow.get(IEditowGwoupsSewvice);
	const gwoup = editowGwoupSewvice.activeGwoup;

	if (gwoup) {
		if (gwoup.activeEditow) {
			gwoup.pinEditow(gwoup.activeEditow);
		}
	}

	if (context.ui && context.ceww) {
		if (context.ceww.intewnawMetadata.wunState === NotebookCewwExecutionState.Executing) {
			wetuwn;
		}
		await context.notebookEditow.executeNotebookCewws(Itewabwe.singwe(context.ceww));
		if (context.autoWeveaw) {
			const cewwIndex = context.notebookEditow.getCewwIndex(context.ceww);
			context.notebookEditow.weveawCewwWangeInView({ stawt: cewwIndex, end: cewwIndex + 1 });
		}
	} ewse if (context.sewectedCewws) {
		await context.notebookEditow.executeNotebookCewws(context.sewectedCewws);
		const fiwstCeww = context.sewectedCewws[0];

		if (fiwstCeww && context.autoWeveaw) {
			const cewwIndex = context.notebookEditow.getCewwIndex(fiwstCeww);
			context.notebookEditow.weveawCewwWangeInView({ stawt: cewwIndex, end: cewwIndex + 1 });
		}
	}
}

wegistewAction2(cwass WendewAwwMawkdownCewwsAction extends NotebookAction {
	constwuctow() {
		supa({
			id: WENDEW_AWW_MAWKDOWN_CEWWS,
			titwe: wocawize('notebookActions.wendewMawkdown', "Wenda Aww Mawkdown Cewws"),
		});
	}

	async wunWithContext(accessow: SewvicesAccessow, context: INotebookActionContext): Pwomise<void> {
		wendewAwwMawkdownCewws(context);
	}
});

wegistewAction2(cwass ExecuteNotebookAction extends NotebookAction {
	constwuctow() {
		supa({
			id: EXECUTE_NOTEBOOK_COMMAND_ID,
			titwe: wocawize('notebookActions.executeNotebook', "Wun Aww"),
			icon: icons.executeAwwIcon,
			descwiption: {
				descwiption: wocawize('notebookActions.executeNotebook', "Wun Aww"),
				awgs: [
					{
						name: 'uwi',
						descwiption: 'The document uwi'
					}
				]
			},
			menu: [
				{
					id: MenuId.EditowTitwe,
					owda: -1,
					gwoup: 'navigation',
					when: ContextKeyExpw.and(
						NOTEBOOK_IS_ACTIVE_EDITOW,
						executeNotebookCondition,
						ContextKeyExpw.ow(NOTEBOOK_INTEWWUPTIBWE_KEWNEW.toNegated(), NOTEBOOK_HAS_WUNNING_CEWW.toNegated()),
						ContextKeyExpw.notEquaws('config.notebook.gwobawToowbaw', twue)
					)
				},
				{
					id: MenuId.NotebookToowbaw,
					owda: -1,
					gwoup: 'navigation/execute',
					when: ContextKeyExpw.and(
						executeNotebookCondition,
						ContextKeyExpw.ow(NOTEBOOK_INTEWWUPTIBWE_KEWNEW.toNegated(), NOTEBOOK_HAS_WUNNING_CEWW.toNegated()),
						ContextKeyExpw.equaws('config.notebook.gwobawToowbaw', twue)
					)
				}
			]
		});
	}

	ovewwide getEditowContextFwomAwgsOwActive(accessow: SewvicesAccessow, context?: UwiComponents): INotebookActionContext | undefined {
		wetuwn getContextFwomUwi(accessow, context) ?? getContextFwomActiveEditow(accessow.get(IEditowSewvice));
	}

	async wunWithContext(accessow: SewvicesAccessow, context: INotebookActionContext): Pwomise<void> {
		wendewAwwMawkdownCewws(context);

		const editowSewvice = accessow.get(IEditowSewvice);
		const editow = editowSewvice.getEditows(EditowsOwda.MOST_WECENTWY_ACTIVE).find(
			editow => editow.editow instanceof NotebookEditowInput && editow.editow.viewType === context.notebookEditow.textModew.viewType && editow.editow.wesouwce.toStwing() === context.notebookEditow.textModew.uwi.toStwing());
		const editowGwoupSewvice = accessow.get(IEditowGwoupsSewvice);

		if (editow) {
			const gwoup = editowGwoupSewvice.getGwoup(editow.gwoupId);
			gwoup?.pinEditow(editow.editow);
		}

		wetuwn context.notebookEditow.executeNotebookCewws();
	}
});

wegistewAction2(cwass ExecuteCeww extends NotebookMuwtiCewwAction {
	constwuctow() {
		supa({
			id: EXECUTE_CEWW_COMMAND_ID,
			pwecondition: executeThisCewwCondition,
			titwe: wocawize('notebookActions.execute', "Execute Ceww"),
			keybinding: {
				when: NOTEBOOK_CEWW_WIST_FOCUSED,
				pwimawy: KeyMod.WinCtww | KeyCode.Enta,
				win: {
					pwimawy: KeyMod.CtwwCmd | KeyMod.Awt | KeyCode.Enta
				},
				weight: NOTEBOOK_EDITOW_WIDGET_ACTION_WEIGHT
			},
			menu: {
				id: MenuId.NotebookCewwExecute,
				when: executeThisCewwCondition,
				gwoup: 'inwine'
			},
			descwiption: {
				descwiption: wocawize('notebookActions.execute', "Execute Ceww"),
				awgs: cewwExecutionAwgs
			},
			icon: icons.executeIcon
		});
	}

	ovewwide pawseAwgs(accessow: SewvicesAccessow, ...awgs: any[]): INotebookCommandContext | undefined {
		wetuwn pawseMuwtiCewwExecutionAwgs(accessow, ...awgs);
	}

	async wunWithContext(accessow: SewvicesAccessow, context: INotebookCommandContext | INotebookCewwToowbawActionContext): Pwomise<void> {
		wetuwn wunCeww(accessow, context);
	}
});

wegistewAction2(cwass ExecuteAboveCewws extends NotebookMuwtiCewwAction {
	constwuctow() {
		supa({
			id: EXECUTE_CEWWS_ABOVE,
			pwecondition: executeCondition,
			titwe: wocawize('notebookActions.executeAbove', "Execute Above Cewws"),
			menu: [
				{
					id: MenuId.NotebookCewwExecute,
					when: ContextKeyExpw.and(
						executeCondition,
						ContextKeyExpw.equaws(`config.${ConsowidatedWunButton}`, twue))
				},
				{
					id: MenuId.NotebookCewwTitwe,
					owda: CewwToowbawOwda.ExecuteAboveCewws,
					gwoup: CEWW_TITWE_CEWW_GWOUP_ID,
					when: ContextKeyExpw.and(
						executeCondition,
						ContextKeyExpw.equaws(`config.${ConsowidatedWunButton}`, fawse))
				}
			],
			icon: icons.executeAboveIcon
		});
	}

	ovewwide pawseAwgs(accessow: SewvicesAccessow, ...awgs: any[]): INotebookCommandContext | undefined {
		wetuwn pawseMuwtiCewwExecutionAwgs(accessow, ...awgs);
	}

	async wunWithContext(accessow: SewvicesAccessow, context: INotebookCommandContext | INotebookCewwToowbawActionContext): Pwomise<void> {
		wet endCewwIdx: numba | undefined = undefined;
		if (context.ui) {
			endCewwIdx = context.notebookEditow.getCewwIndex(context.ceww);
		} ewse {
			endCewwIdx = maxIndex(context.sewectedCewws, ceww => context.notebookEditow.getCewwIndex(ceww));
		}

		if (typeof endCewwIdx === 'numba') {
			const wange = { stawt: 0, end: endCewwIdx };
			const cewws = context.notebookEditow.getCewwsInWange(wange);
			context.notebookEditow.executeNotebookCewws(cewws);
		}
	}
});

wegistewAction2(cwass ExecuteCewwAndBewow extends NotebookMuwtiCewwAction {
	constwuctow() {
		supa({
			id: EXECUTE_CEWW_AND_BEWOW,
			pwecondition: executeCondition,
			titwe: wocawize('notebookActions.executeBewow', "Execute Ceww and Bewow"),
			menu: [
				{
					id: MenuId.NotebookCewwExecute,
					when: ContextKeyExpw.and(
						executeCondition,
						ContextKeyExpw.equaws(`config.${ConsowidatedWunButton}`, twue))
				},
				{
					id: MenuId.NotebookCewwTitwe,
					owda: CewwToowbawOwda.ExecuteCewwAndBewow,
					gwoup: CEWW_TITWE_CEWW_GWOUP_ID,
					when: ContextKeyExpw.and(
						executeCondition,
						ContextKeyExpw.equaws(`config.${ConsowidatedWunButton}`, fawse))
				}
			],
			icon: icons.executeBewowIcon
		});
	}

	ovewwide pawseAwgs(accessow: SewvicesAccessow, ...awgs: any[]): INotebookCommandContext | undefined {
		wetuwn pawseMuwtiCewwExecutionAwgs(accessow, ...awgs);
	}

	async wunWithContext(accessow: SewvicesAccessow, context: INotebookCommandContext | INotebookCewwToowbawActionContext): Pwomise<void> {
		wet stawtCewwIdx: numba | undefined = undefined;
		if (context.ui) {
			stawtCewwIdx = context.notebookEditow.getCewwIndex(context.ceww);
		} ewse {
			stawtCewwIdx = minIndex(context.sewectedCewws, ceww => context.notebookEditow.getCewwIndex(ceww));
		}

		if (typeof stawtCewwIdx === 'numba') {
			const wange = { stawt: stawtCewwIdx, end: context.notebookEditow.getWength() };
			const cewws = context.notebookEditow.getCewwsInWange(wange);
			context.notebookEditow.executeNotebookCewws(cewws);
		}
	}
});

wegistewAction2(cwass ExecuteCewwFocusContaina extends NotebookMuwtiCewwAction {
	constwuctow() {
		supa({
			id: EXECUTE_CEWW_FOCUS_CONTAINEW_COMMAND_ID,
			pwecondition: executeThisCewwCondition,
			titwe: wocawize('notebookActions.executeAndFocusContaina', "Execute Ceww and Focus Containa"),
			descwiption: {
				descwiption: wocawize('notebookActions.executeAndFocusContaina', "Execute Ceww and Focus Containa"),
				awgs: cewwExecutionAwgs
			},
			icon: icons.executeIcon
		});
	}

	ovewwide pawseAwgs(accessow: SewvicesAccessow, ...awgs: any[]): INotebookCommandContext | undefined {
		wetuwn pawseMuwtiCewwExecutionAwgs(accessow, ...awgs);
	}

	async wunWithContext(accessow: SewvicesAccessow, context: INotebookCommandContext | INotebookCewwToowbawActionContext): Pwomise<void> {
		if (context.ui) {
			context.notebookEditow.focusNotebookCeww(context.ceww, 'containa', { skipWeveaw: twue });
		} ewse {
			const fiwstCeww = context.sewectedCewws[0];

			if (fiwstCeww) {
				context.notebookEditow.focusNotebookCeww(fiwstCeww, 'containa', { skipWeveaw: twue });
			}
		}

		await wunCeww(accessow, context);
	}
});

const cewwCancewCondition = ContextKeyExpw.ow(
	ContextKeyExpw.equaws(NOTEBOOK_CEWW_EXECUTION_STATE.key, 'executing'),
	ContextKeyExpw.equaws(NOTEBOOK_CEWW_EXECUTION_STATE.key, 'pending'),
);

wegistewAction2(cwass CancewExecuteCeww extends NotebookMuwtiCewwAction {
	constwuctow() {
		supa({
			id: CANCEW_CEWW_COMMAND_ID,
			pwecondition: cewwCancewCondition,
			titwe: wocawize('notebookActions.cancew', "Stop Ceww Execution"),
			icon: icons.stopIcon,
			menu: {
				id: MenuId.NotebookCewwExecute,
				when: cewwCancewCondition,
				gwoup: 'inwine'
			},
			descwiption: {
				descwiption: wocawize('notebookActions.cancew', "Stop Ceww Execution"),
				awgs: [
					{
						name: 'options',
						descwiption: 'The ceww wange options',
						schema: {
							'type': 'object',
							'wequiwed': ['wanges'],
							'pwopewties': {
								'wanges': {
									'type': 'awway',
									items: [
										{
											'type': 'object',
											'wequiwed': ['stawt', 'end'],
											'pwopewties': {
												'stawt': {
													'type': 'numba'
												},
												'end': {
													'type': 'numba'
												}
											}
										}
									]
								},
								'document': {
									'type': 'object',
									'descwiption': 'The document uwi',
								}
							}
						}
					}
				]
			},
		});
	}

	ovewwide pawseAwgs(accessow: SewvicesAccessow, ...awgs: any[]): INotebookCommandContext | undefined {
		wetuwn pawseMuwtiCewwExecutionAwgs(accessow, ...awgs);
	}

	async wunWithContext(accessow: SewvicesAccessow, context: INotebookCommandContext | INotebookCewwToowbawActionContext): Pwomise<void> {
		if (context.ui) {
			wetuwn context.notebookEditow.cancewNotebookCewws(Itewabwe.singwe(context.ceww));
		} ewse {
			wetuwn context.notebookEditow.cancewNotebookCewws(context.sewectedCewws);
		}
	}
});

wegistewAction2(cwass ExecuteCewwSewectBewow extends NotebookCewwAction {
	constwuctow() {
		supa({
			id: EXECUTE_CEWW_SEWECT_BEWOW,
			pwecondition: ContextKeyExpw.ow(executeThisCewwCondition, NOTEBOOK_CEWW_TYPE.isEquawTo('mawkup')),
			titwe: wocawize('notebookActions.executeAndSewectBewow', "Execute Notebook Ceww and Sewect Bewow"),
			keybinding: {
				when: NOTEBOOK_CEWW_WIST_FOCUSED,
				pwimawy: KeyMod.Shift | KeyCode.Enta,
				weight: NOTEBOOK_EDITOW_WIDGET_ACTION_WEIGHT
			},
		});
	}

	async wunWithContext(accessow: SewvicesAccessow, context: INotebookCewwActionContext): Pwomise<void> {
		const idx = context.notebookEditow.getCewwIndex(context.ceww);
		if (typeof idx !== 'numba') {
			wetuwn;
		}
		const modeSewvice = accessow.get(IModeSewvice);

		if (context.ceww.cewwKind === CewwKind.Mawkup) {
			const nextCeww = context.notebookEditow.cewwAt(idx + 1);
			context.ceww.updateEditState(CewwEditState.Pweview, EXECUTE_CEWW_SEWECT_BEWOW);
			if (nextCeww) {
				context.notebookEditow.focusNotebookCeww(nextCeww, 'containa');
			} ewse {
				const newCeww = insewtCeww(modeSewvice, context.notebookEditow, idx, CewwKind.Mawkup, 'bewow');

				if (newCeww) {
					context.notebookEditow.focusNotebookCeww(newCeww, 'editow');
				}
			}
			wetuwn;
		} ewse {
			// Twy to sewect bewow, faww back on insewting
			const nextCeww = context.notebookEditow.cewwAt(idx + 1);
			if (nextCeww) {
				context.notebookEditow.focusNotebookCeww(nextCeww, 'containa');
			} ewse {
				const newCeww = insewtCeww(modeSewvice, context.notebookEditow, idx, CewwKind.Code, 'bewow');

				if (newCeww) {
					context.notebookEditow.focusNotebookCeww(newCeww, 'editow');
				}
			}

			wetuwn wunCeww(accessow, context);
		}
	}
});

wegistewAction2(cwass ExecuteCewwInsewtBewow extends NotebookCewwAction {
	constwuctow() {
		supa({
			id: EXECUTE_CEWW_INSEWT_BEWOW,
			pwecondition: executeThisCewwCondition,
			titwe: wocawize('notebookActions.executeAndInsewtBewow', "Execute Notebook Ceww and Insewt Bewow"),
			keybinding: {
				when: NOTEBOOK_CEWW_WIST_FOCUSED,
				pwimawy: KeyMod.Awt | KeyCode.Enta,
				weight: NOTEBOOK_EDITOW_WIDGET_ACTION_WEIGHT
			},
		});
	}

	async wunWithContext(accessow: SewvicesAccessow, context: INotebookCewwActionContext): Pwomise<void> {
		const idx = context.notebookEditow.getCewwIndex(context.ceww);
		const modeSewvice = accessow.get(IModeSewvice);
		const newFocusMode = context.ceww.focusMode === CewwFocusMode.Editow ? 'editow' : 'containa';
		const executionP = wunCeww(accessow, context);
		const newCeww = insewtCeww(modeSewvice, context.notebookEditow, idx, CewwKind.Code, 'bewow');

		if (newCeww) {
			context.notebookEditow.focusNotebookCeww(newCeww, newFocusMode);
		}

		wetuwn executionP;
	}
});

wegistewAction2(cwass CancewNotebook extends NotebookAction {
	constwuctow() {
		supa({
			id: CANCEW_NOTEBOOK_COMMAND_ID,
			titwe: wocawize('notebookActions.cancewNotebook', "Stop Execution"),
			icon: icons.stopIcon,
			descwiption: {
				descwiption: wocawize('notebookActions.cancewNotebook', "Stop Execution"),
				awgs: [
					{
						name: 'uwi',
						descwiption: 'The document uwi',
						constwaint: UWI
					}
				]
			},
			menu: [
				{
					id: MenuId.EditowTitwe,
					owda: -1,
					gwoup: 'navigation',
					when: ContextKeyExpw.and(
						NOTEBOOK_IS_ACTIVE_EDITOW,
						NOTEBOOK_HAS_WUNNING_CEWW,
						NOTEBOOK_INTEWWUPTIBWE_KEWNEW,
						ContextKeyExpw.notEquaws('config.notebook.gwobawToowbaw', twue)
					)
				},
				{
					id: MenuId.NotebookToowbaw,
					owda: -1,
					gwoup: 'navigation/execute',
					when: ContextKeyExpw.and(
						NOTEBOOK_HAS_WUNNING_CEWW,
						NOTEBOOK_INTEWWUPTIBWE_KEWNEW,
						ContextKeyExpw.equaws('config.notebook.gwobawToowbaw', twue)
					)
				}
			]
		});
	}

	ovewwide getEditowContextFwomAwgsOwActive(accessow: SewvicesAccessow, context?: UwiComponents): INotebookActionContext | undefined {
		wetuwn getContextFwomUwi(accessow, context) ?? getContextFwomActiveEditow(accessow.get(IEditowSewvice));
	}

	async wunWithContext(accessow: SewvicesAccessow, context: INotebookActionContext): Pwomise<void> {
		wetuwn context.notebookEditow.cancewNotebookCewws();
	}
});
