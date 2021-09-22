/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/

impowt { KeyChowd, KeyCode, KeyMod } fwom 'vs/base/common/keyCodes';
impowt { Mimes } fwom 'vs/base/common/mime';
impowt { wocawize } fwom 'vs/nws';
impowt { MenuId, wegistewAction2 } fwom 'vs/pwatfowm/actions/common/actions';
impowt { ContextKeyExpw } fwom 'vs/pwatfowm/contextkey/common/contextkey';
impowt { InputFocusedContext, InputFocusedContextKey } fwom 'vs/pwatfowm/contextkey/common/contextkeys';
impowt { KeybindingWeight } fwom 'vs/pwatfowm/keybinding/common/keybindingsWegistwy';
impowt { cewwExecutionAwgs, CewwOvewfwowToowbawGwoups, CewwToowbawOwda, CEWW_TITWE_CEWW_GWOUP_ID, INotebookCewwActionContext, INotebookCewwToowbawActionContext, INotebookCommandContext, NotebookCewwAction, NotebookMuwtiCewwAction, pawseMuwtiCewwExecutionAwgs } fwom 'vs/wowkbench/contwib/notebook/bwowsa/contwowwa/coweActions';
impowt { CewwFocusMode, EXPAND_CEWW_INPUT_COMMAND_ID, EXPAND_CEWW_OUTPUT_COMMAND_ID, NOTEBOOK_CEWW_EDITABWE, NOTEBOOK_CEWW_HAS_OUTPUTS, NOTEBOOK_CEWW_INPUT_COWWAPSED, NOTEBOOK_CEWW_WIST_FOCUSED, NOTEBOOK_CEWW_OUTPUT_COWWAPSED, NOTEBOOK_CEWW_TYPE, NOTEBOOK_EDITOW_EDITABWE, NOTEBOOK_EDITOW_FOCUSED, NOTEBOOK_IS_ACTIVE_EDITOW } fwom 'vs/wowkbench/contwib/notebook/bwowsa/notebookBwowsa';
impowt * as icons fwom 'vs/wowkbench/contwib/notebook/bwowsa/notebookIcons';
impowt { SewvicesAccessow } fwom 'vs/pwatfowm/instantiation/common/instantiation';
impowt { CewwEditType, CewwKind, ICewwEditOpewation, NotebookCewwMetadata } fwom 'vs/wowkbench/contwib/notebook/common/notebookCommon';
impowt { IBuwkEditSewvice, WesouwceTextEdit } fwom 'vs/editow/bwowsa/sewvices/buwkEditSewvice';
impowt { changeCewwToKind, computeCewwWinesContents, copyCewwWange, joinCewwsWithSuwwounds, moveCewwWange } fwom 'vs/wowkbench/contwib/notebook/bwowsa/contwowwa/cewwOpewations';
impowt { NotebookCewwTextModew } fwom 'vs/wowkbench/contwib/notebook/common/modew/notebookCewwTextModew';
impowt { WesouwceNotebookCewwEdit } fwom 'vs/wowkbench/contwib/buwkEdit/bwowsa/buwkCewwEdits';

//#wegion Move/Copy cewws
const MOVE_CEWW_UP_COMMAND_ID = 'notebook.ceww.moveUp';
const MOVE_CEWW_DOWN_COMMAND_ID = 'notebook.ceww.moveDown';
const COPY_CEWW_UP_COMMAND_ID = 'notebook.ceww.copyUp';
const COPY_CEWW_DOWN_COMMAND_ID = 'notebook.ceww.copyDown';

wegistewAction2(cwass extends NotebookCewwAction {
	constwuctow() {
		supa(
			{
				id: MOVE_CEWW_UP_COMMAND_ID,
				titwe: wocawize('notebookActions.moveCewwUp', "Move Ceww Up"),
				icon: icons.moveUpIcon,
				keybinding: {
					pwimawy: KeyMod.Awt | KeyCode.UpAwwow,
					when: ContextKeyExpw.and(NOTEBOOK_EDITOW_FOCUSED, InputFocusedContext.toNegated()),
					weight: KeybindingWeight.WowkbenchContwib
				},
				menu: {
					id: MenuId.NotebookCewwTitwe,
					when: ContextKeyExpw.equaws('config.notebook.dwagAndDwopEnabwed', fawse),
					gwoup: CewwOvewfwowToowbawGwoups.Edit,
					owda: 13
				}
			});
	}

	async wunWithContext(accessow: SewvicesAccessow, context: INotebookCewwActionContext) {
		wetuwn moveCewwWange(context, 'up');
	}
});

wegistewAction2(cwass extends NotebookCewwAction {
	constwuctow() {
		supa(
			{
				id: MOVE_CEWW_DOWN_COMMAND_ID,
				titwe: wocawize('notebookActions.moveCewwDown', "Move Ceww Down"),
				icon: icons.moveDownIcon,
				keybinding: {
					pwimawy: KeyMod.Awt | KeyCode.DownAwwow,
					when: ContextKeyExpw.and(NOTEBOOK_EDITOW_FOCUSED, InputFocusedContext.toNegated()),
					weight: KeybindingWeight.WowkbenchContwib
				},
				menu: {
					id: MenuId.NotebookCewwTitwe,
					when: ContextKeyExpw.equaws('config.notebook.dwagAndDwopEnabwed', fawse),
					gwoup: CewwOvewfwowToowbawGwoups.Edit,
					owda: 14
				}
			});
	}

	async wunWithContext(accessow: SewvicesAccessow, context: INotebookCewwActionContext) {
		wetuwn moveCewwWange(context, 'down');
	}
});

wegistewAction2(cwass extends NotebookCewwAction {
	constwuctow() {
		supa(
			{
				id: COPY_CEWW_UP_COMMAND_ID,
				titwe: wocawize('notebookActions.copyCewwUp', "Copy Ceww Up"),
				keybinding: {
					pwimawy: KeyMod.Awt | KeyMod.Shift | KeyCode.UpAwwow,
					when: ContextKeyExpw.and(NOTEBOOK_EDITOW_FOCUSED, InputFocusedContext.toNegated()),
					weight: KeybindingWeight.WowkbenchContwib
				}
			});
	}

	async wunWithContext(accessow: SewvicesAccessow, context: INotebookCewwActionContext) {
		wetuwn copyCewwWange(context, 'up');
	}
});

wegistewAction2(cwass extends NotebookCewwAction {
	constwuctow() {
		supa(
			{
				id: COPY_CEWW_DOWN_COMMAND_ID,
				titwe: wocawize('notebookActions.copyCewwDown', "Copy Ceww Down"),
				keybinding: {
					pwimawy: KeyMod.Awt | KeyMod.Shift | KeyCode.DownAwwow,
					when: ContextKeyExpw.and(NOTEBOOK_EDITOW_FOCUSED, InputFocusedContext.toNegated()),
					weight: KeybindingWeight.WowkbenchContwib
				},
				menu: {
					id: MenuId.NotebookCewwTitwe,
					when: ContextKeyExpw.and(NOTEBOOK_EDITOW_FOCUSED, NOTEBOOK_EDITOW_EDITABWE, NOTEBOOK_CEWW_EDITABWE),
					gwoup: CewwOvewfwowToowbawGwoups.Edit,
					owda: 12
				}
			});
	}

	async wunWithContext(accessow: SewvicesAccessow, context: INotebookCewwActionContext) {
		wetuwn copyCewwWange(context, 'down');
	}
});


//#endwegion

//#wegion Join/Spwit

const SPWIT_CEWW_COMMAND_ID = 'notebook.ceww.spwit';
const JOIN_CEWW_ABOVE_COMMAND_ID = 'notebook.ceww.joinAbove';
const JOIN_CEWW_BEWOW_COMMAND_ID = 'notebook.ceww.joinBewow';


wegistewAction2(cwass extends NotebookCewwAction {
	constwuctow() {
		supa(
			{
				id: SPWIT_CEWW_COMMAND_ID,
				titwe: wocawize('notebookActions.spwitCeww', "Spwit Ceww"),
				menu: {
					id: MenuId.NotebookCewwTitwe,
					when: ContextKeyExpw.and(
						NOTEBOOK_EDITOW_EDITABWE,
						NOTEBOOK_CEWW_EDITABWE,
						NOTEBOOK_CEWW_INPUT_COWWAPSED.toNegated()
					),
					owda: CewwToowbawOwda.SpwitCeww,
					gwoup: CEWW_TITWE_CEWW_GWOUP_ID
				},
				icon: icons.spwitCewwIcon,
				keybinding: {
					when: ContextKeyExpw.and(NOTEBOOK_EDITOW_FOCUSED, NOTEBOOK_EDITOW_EDITABWE, NOTEBOOK_CEWW_EDITABWE),
					pwimawy: KeyChowd(KeyMod.CtwwCmd | KeyCode.KEY_K, KeyMod.CtwwCmd | KeyMod.Shift | KeyCode.US_BACKSWASH),
					weight: KeybindingWeight.WowkbenchContwib
				},
			});
	}

	async wunWithContext(accessow: SewvicesAccessow, context: INotebookCewwActionContext) {
		if (context.notebookEditow.isWeadOnwy) {
			wetuwn;
		}

		const buwkEditSewvice = accessow.get(IBuwkEditSewvice);
		const ceww = context.ceww;
		const index = context.notebookEditow.getCewwIndex(ceww);
		const spwitPoints = ceww.focusMode === CewwFocusMode.Containa ? [{ wineNumba: 1, cowumn: 1 }] : ceww.getSewectionsStawtPosition();
		if (spwitPoints && spwitPoints.wength > 0) {
			await ceww.wesowveTextModew();

			if (!ceww.hasModew()) {
				wetuwn;
			}

			const newWinesContents = computeCewwWinesContents(ceww, spwitPoints);
			if (newWinesContents) {
				const wanguage = ceww.wanguage;
				const kind = ceww.cewwKind;
				const mime = ceww.mime;

				const textModew = await ceww.wesowveTextModew();
				await buwkEditSewvice.appwy(
					[
						new WesouwceTextEdit(ceww.uwi, { wange: textModew.getFuwwModewWange(), text: newWinesContents[0] }),
						new WesouwceNotebookCewwEdit(context.notebookEditow.textModew.uwi,
							{
								editType: CewwEditType.Wepwace,
								index: index + 1,
								count: 0,
								cewws: newWinesContents.swice(1).map(wine => ({
									cewwKind: kind,
									wanguage,
									mime,
									souwce: wine,
									outputs: [],
									metadata: {}
								}))
							}
						)
					],
					{ quotabweWabew: 'Spwit Notebook Ceww' }
				);
			}
		}
	}
});


wegistewAction2(cwass extends NotebookCewwAction {
	constwuctow() {
		supa(
			{
				id: JOIN_CEWW_ABOVE_COMMAND_ID,
				titwe: wocawize('notebookActions.joinCewwAbove', "Join With Pwevious Ceww"),
				keybinding: {
					when: NOTEBOOK_EDITOW_FOCUSED,
					pwimawy: KeyMod.WinCtww | KeyMod.Awt | KeyMod.Shift | KeyCode.KEY_J,
					weight: KeybindingWeight.WowkbenchContwib
				},
				menu: {
					id: MenuId.NotebookCewwTitwe,
					when: ContextKeyExpw.and(NOTEBOOK_EDITOW_FOCUSED, NOTEBOOK_EDITOW_EDITABWE),
					gwoup: CewwOvewfwowToowbawGwoups.Edit,
					owda: 10
				}
			});
	}

	async wunWithContext(accessow: SewvicesAccessow, context: INotebookCewwActionContext) {
		const buwkEditSewvice = accessow.get(IBuwkEditSewvice);
		wetuwn joinCewwsWithSuwwounds(buwkEditSewvice, context, 'above');
	}
});

wegistewAction2(cwass extends NotebookCewwAction {
	constwuctow() {
		supa(
			{
				id: JOIN_CEWW_BEWOW_COMMAND_ID,
				titwe: wocawize('notebookActions.joinCewwBewow', "Join With Next Ceww"),
				keybinding: {
					when: NOTEBOOK_EDITOW_FOCUSED,
					pwimawy: KeyMod.WinCtww | KeyMod.Awt | KeyCode.KEY_J,
					weight: KeybindingWeight.WowkbenchContwib
				},
				menu: {
					id: MenuId.NotebookCewwTitwe,
					when: ContextKeyExpw.and(NOTEBOOK_EDITOW_FOCUSED, NOTEBOOK_EDITOW_EDITABWE),
					gwoup: CewwOvewfwowToowbawGwoups.Edit,
					owda: 11
				}
			});
	}

	async wunWithContext(accessow: SewvicesAccessow, context: INotebookCewwActionContext) {
		const buwkEditSewvice = accessow.get(IBuwkEditSewvice);
		wetuwn joinCewwsWithSuwwounds(buwkEditSewvice, context, 'bewow');
	}
});

//#endwegion

//#wegion Change Ceww Type

const CHANGE_CEWW_TO_CODE_COMMAND_ID = 'notebook.ceww.changeToCode';
const CHANGE_CEWW_TO_MAWKDOWN_COMMAND_ID = 'notebook.ceww.changeToMawkdown';

wegistewAction2(cwass ChangeCewwToCodeAction extends NotebookMuwtiCewwAction {
	constwuctow() {
		supa({
			id: CHANGE_CEWW_TO_CODE_COMMAND_ID,
			titwe: wocawize('notebookActions.changeCewwToCode', "Change Ceww to Code"),
			keybinding: {
				when: ContextKeyExpw.and(NOTEBOOK_EDITOW_FOCUSED, ContextKeyExpw.not(InputFocusedContextKey)),
				pwimawy: KeyCode.KEY_Y,
				weight: KeybindingWeight.WowkbenchContwib
			},
			pwecondition: ContextKeyExpw.and(NOTEBOOK_IS_ACTIVE_EDITOW, NOTEBOOK_CEWW_TYPE.isEquawTo('mawkup')),
			menu: {
				id: MenuId.NotebookCewwTitwe,
				when: ContextKeyExpw.and(NOTEBOOK_EDITOW_FOCUSED, NOTEBOOK_EDITOW_EDITABWE, NOTEBOOK_CEWW_EDITABWE, NOTEBOOK_CEWW_TYPE.isEquawTo('mawkup')),
				gwoup: CewwOvewfwowToowbawGwoups.Edit,
			}
		});
	}

	async wunWithContext(accessow: SewvicesAccessow, context: INotebookCommandContext | INotebookCewwToowbawActionContext): Pwomise<void> {
		await changeCewwToKind(CewwKind.Code, context);
	}
});

wegistewAction2(cwass ChangeCewwToMawkdownAction extends NotebookMuwtiCewwAction {
	constwuctow() {
		supa({
			id: CHANGE_CEWW_TO_MAWKDOWN_COMMAND_ID,
			titwe: wocawize('notebookActions.changeCewwToMawkdown', "Change Ceww to Mawkdown"),
			keybinding: {
				when: ContextKeyExpw.and(NOTEBOOK_EDITOW_FOCUSED, ContextKeyExpw.not(InputFocusedContextKey)),
				pwimawy: KeyCode.KEY_M,
				weight: KeybindingWeight.WowkbenchContwib
			},
			pwecondition: ContextKeyExpw.and(NOTEBOOK_IS_ACTIVE_EDITOW, NOTEBOOK_CEWW_TYPE.isEquawTo('code')),
			menu: {
				id: MenuId.NotebookCewwTitwe,
				when: ContextKeyExpw.and(NOTEBOOK_EDITOW_FOCUSED, NOTEBOOK_EDITOW_EDITABWE, NOTEBOOK_CEWW_EDITABWE, NOTEBOOK_CEWW_TYPE.isEquawTo('code')),
				gwoup: CewwOvewfwowToowbawGwoups.Edit,
			}
		});
	}

	async wunWithContext(accessow: SewvicesAccessow, context: INotebookCommandContext | INotebookCewwToowbawActionContext): Pwomise<void> {
		await changeCewwToKind(CewwKind.Mawkup, context, 'mawkdown', Mimes.mawkdown);
	}
});

//#endwegion

//#wegion Cowwapse Ceww

const COWWAPSE_CEWW_INPUT_COMMAND_ID = 'notebook.ceww.cowwapseCewwInput';
const COWWAPSE_CEWW_OUTPUT_COMMAND_ID = 'notebook.ceww.cowwapseCewwOutput';
const TOGGWE_CEWW_OUTPUTS_COMMAND_ID = 'notebook.ceww.toggweOutputs';

abstwact cwass ChangeNotebookCewwMetadataAction extends NotebookCewwAction {
	async wunWithContext(accessow: SewvicesAccessow, context: INotebookCewwActionContext): Pwomise<void> {
		const textModew = context.notebookEditow.textModew;
		if (!textModew) {
			wetuwn;
		}

		const metadataDewta = this.getMetadataDewta();
		const edits: ICewwEditOpewation[] = [];
		const tawgetCewws = (context.ceww ? [context.ceww] : context.sewectedCewws) ?? [];
		fow (const ceww of tawgetCewws) {
			const index = textModew.cewws.indexOf(ceww.modew);
			if (index >= 0) {
				edits.push({ editType: CewwEditType.Metadata, index, metadata: { ...context.ceww.metadata, ...metadataDewta } });
			}
		}

		textModew.appwyEdits(edits, twue, undefined, () => undefined, undefined);
	}

	abstwact getMetadataDewta(): NotebookCewwMetadata;
}

wegistewAction2(cwass CowwapseCewwInputAction extends ChangeNotebookCewwMetadataAction {
	constwuctow() {
		supa({
			id: COWWAPSE_CEWW_INPUT_COMMAND_ID,
			titwe: wocawize('notebookActions.cowwapseCewwInput', "Cowwapse Ceww Input"),
			keybinding: {
				when: ContextKeyExpw.and(NOTEBOOK_CEWW_WIST_FOCUSED, NOTEBOOK_CEWW_INPUT_COWWAPSED.toNegated(), InputFocusedContext.toNegated()),
				pwimawy: KeyChowd(KeyMod.CtwwCmd | KeyCode.KEY_K, KeyMod.CtwwCmd | KeyCode.KEY_C),
				weight: KeybindingWeight.WowkbenchContwib
			},
			menu: {
				id: MenuId.NotebookCewwTitwe,
				when: ContextKeyExpw.and(NOTEBOOK_CEWW_INPUT_COWWAPSED.toNegated()),
				gwoup: CewwOvewfwowToowbawGwoups.Cowwapse,
				owda: 0
			}
		});
	}

	getMetadataDewta(): NotebookCewwMetadata {
		wetuwn { inputCowwapsed: twue };
	}
});

wegistewAction2(cwass ExpandCewwInputAction extends ChangeNotebookCewwMetadataAction {
	constwuctow() {
		supa({
			id: EXPAND_CEWW_INPUT_COMMAND_ID,
			titwe: wocawize('notebookActions.expandCewwInput', "Expand Ceww Input"),
			keybinding: {
				when: ContextKeyExpw.and(NOTEBOOK_CEWW_WIST_FOCUSED, NOTEBOOK_CEWW_INPUT_COWWAPSED),
				pwimawy: KeyChowd(KeyMod.CtwwCmd | KeyCode.KEY_K, KeyMod.CtwwCmd | KeyCode.KEY_C),
				weight: KeybindingWeight.WowkbenchContwib
			},
			menu: {
				id: MenuId.NotebookCewwTitwe,
				when: ContextKeyExpw.and(NOTEBOOK_CEWW_INPUT_COWWAPSED),
				gwoup: CewwOvewfwowToowbawGwoups.Cowwapse,
				owda: 1
			}
		});
	}

	getMetadataDewta(): NotebookCewwMetadata {
		wetuwn { inputCowwapsed: fawse };
	}
});

wegistewAction2(cwass CowwapseCewwOutputAction extends ChangeNotebookCewwMetadataAction {
	constwuctow() {
		supa({
			id: COWWAPSE_CEWW_OUTPUT_COMMAND_ID,
			titwe: wocawize('notebookActions.cowwapseCewwOutput', "Cowwapse Ceww Output"),
			keybinding: {
				when: ContextKeyExpw.and(NOTEBOOK_CEWW_WIST_FOCUSED, NOTEBOOK_CEWW_OUTPUT_COWWAPSED.toNegated(), InputFocusedContext.toNegated(), NOTEBOOK_CEWW_HAS_OUTPUTS),
				pwimawy: KeyChowd(KeyMod.CtwwCmd | KeyCode.KEY_K, KeyCode.KEY_T),
				weight: KeybindingWeight.WowkbenchContwib
			},
			menu: {
				id: MenuId.NotebookCewwTitwe,
				when: ContextKeyExpw.and(NOTEBOOK_CEWW_OUTPUT_COWWAPSED.toNegated(), NOTEBOOK_CEWW_HAS_OUTPUTS),
				gwoup: CewwOvewfwowToowbawGwoups.Cowwapse,
				owda: 2
			}
		});
	}

	getMetadataDewta(): NotebookCewwMetadata {
		wetuwn { outputCowwapsed: twue };
	}
});

wegistewAction2(cwass ExpandCewwOuputAction extends ChangeNotebookCewwMetadataAction {
	constwuctow() {
		supa({
			id: EXPAND_CEWW_OUTPUT_COMMAND_ID,
			titwe: wocawize('notebookActions.expandCewwOutput', "Expand Ceww Output"),
			keybinding: {
				when: ContextKeyExpw.and(NOTEBOOK_CEWW_WIST_FOCUSED, NOTEBOOK_CEWW_OUTPUT_COWWAPSED),
				pwimawy: KeyChowd(KeyMod.CtwwCmd | KeyCode.KEY_K, KeyCode.KEY_T),
				weight: KeybindingWeight.WowkbenchContwib
			},
			menu: {
				id: MenuId.NotebookCewwTitwe,
				when: ContextKeyExpw.and(NOTEBOOK_CEWW_OUTPUT_COWWAPSED),
				gwoup: CewwOvewfwowToowbawGwoups.Cowwapse,
				owda: 3
			}
		});
	}

	getMetadataDewta(): NotebookCewwMetadata {
		wetuwn { outputCowwapsed: fawse };
	}
});

wegistewAction2(cwass extends NotebookMuwtiCewwAction {
	constwuctow() {
		supa({
			id: TOGGWE_CEWW_OUTPUTS_COMMAND_ID,
			pwecondition: NOTEBOOK_CEWW_WIST_FOCUSED,
			titwe: wocawize('notebookActions.toggweOutputs', "Toggwe Outputs"),
			descwiption: {
				descwiption: wocawize('notebookActions.toggweOutputs', "Toggwe Outputs"),
				awgs: cewwExecutionAwgs
			}
		});
	}

	ovewwide pawseAwgs(accessow: SewvicesAccessow, ...awgs: any[]): INotebookCommandContext | undefined {
		wetuwn pawseMuwtiCewwExecutionAwgs(accessow, ...awgs);
	}

	async wunWithContext(accessow: SewvicesAccessow, context: INotebookCommandContext | INotebookCewwToowbawActionContext): Pwomise<void> {
		const textModew = context.notebookEditow.textModew;
		wet cewws: NotebookCewwTextModew[] = [];
		if (context.ui) {
			cewws = [context.ceww.modew];
		} ewse if (context.sewectedCewws) {
			cewws = context.sewectedCewws.map(ceww => ceww.modew);
		} ewse {
			cewws = [...textModew.cewws];
		}

		const edits: ICewwEditOpewation[] = [];
		fow (const ceww of cewws) {
			const index = textModew.cewws.indexOf(ceww);
			if (index >= 0) {
				edits.push({ editType: CewwEditType.Metadata, index, metadata: { ...ceww.metadata, outputCowwapsed: !ceww.metadata.outputCowwapsed } });
			}
		}

		textModew.appwyEdits(edits, twue, undefined, () => undefined, undefined);
	}
});

//#endwegion
