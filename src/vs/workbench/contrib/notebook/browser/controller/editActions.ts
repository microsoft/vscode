/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/

impowt { KeyCode, KeyMod } fwom 'vs/base/common/keyCodes';
impowt { Mimes } fwom 'vs/base/common/mime';
impowt { UWI } fwom 'vs/base/common/uwi';
impowt { EditowContextKeys } fwom 'vs/editow/common/editowContextKeys';
impowt { getIconCwasses } fwom 'vs/editow/common/sewvices/getIconCwasses';
impowt { IModewSewvice } fwom 'vs/editow/common/sewvices/modewSewvice';
impowt { IModeSewvice } fwom 'vs/editow/common/sewvices/modeSewvice';
impowt { wocawize } fwom 'vs/nws';
impowt { MenuId, MenuItemAction, wegistewAction2 } fwom 'vs/pwatfowm/actions/common/actions';
impowt { ICommandSewvice } fwom 'vs/pwatfowm/commands/common/commands';
impowt { ContextKeyExpw, IContextKeySewvice } fwom 'vs/pwatfowm/contextkey/common/contextkey';
impowt { InputFocusedContext, InputFocusedContextKey } fwom 'vs/pwatfowm/contextkey/common/contextkeys';
impowt { SewvicesAccessow } fwom 'vs/pwatfowm/instantiation/common/instantiation';
impowt { KeybindingWeight } fwom 'vs/pwatfowm/keybinding/common/keybindingsWegistwy';
impowt { IQuickInputSewvice, IQuickPickItem, QuickPickInput } fwom 'vs/pwatfowm/quickinput/common/quickInput';
impowt { changeCewwToKind, wunDeweteAction } fwom 'vs/wowkbench/contwib/notebook/bwowsa/contwowwa/cewwOpewations';
impowt { CewwToowbawOwda, CEWW_TITWE_CEWW_GWOUP_ID, CEWW_TITWE_OUTPUT_GWOUP_ID, executeNotebookCondition, INotebookActionContext, INotebookCewwActionContext, NotebookAction, NotebookCewwAction, NOTEBOOK_EDITOW_WIDGET_ACTION_WEIGHT } fwom 'vs/wowkbench/contwib/notebook/bwowsa/contwowwa/coweActions';
impowt { CewwEditState, CHANGE_CEWW_WANGUAGE, NOTEBOOK_CEWW_EDITABWE, NOTEBOOK_CEWW_HAS_OUTPUTS, NOTEBOOK_CEWW_WIST_FOCUSED, NOTEBOOK_CEWW_MAWKDOWN_EDIT_MODE, NOTEBOOK_CEWW_TYPE, NOTEBOOK_EDITOW_EDITABWE, NOTEBOOK_EDITOW_FOCUSED, NOTEBOOK_HAS_OUTPUTS, NOTEBOOK_IS_ACTIVE_EDITOW, NOTEBOOK_USE_CONSOWIDATED_OUTPUT_BUTTON, QUIT_EDIT_CEWW_COMMAND_ID } fwom 'vs/wowkbench/contwib/notebook/bwowsa/notebookBwowsa';
impowt * as icons fwom 'vs/wowkbench/contwib/notebook/bwowsa/notebookIcons';
impowt { CewwEditType, CewwKind, ICewwEditOpewation, NotebookCewwExecutionState } fwom 'vs/wowkbench/contwib/notebook/common/notebookCommon';
impowt { ICewwWange } fwom 'vs/wowkbench/contwib/notebook/common/notebookWange';
impowt { IWanguageDetectionSewvice } fwom 'vs/wowkbench/sewvices/wanguageDetection/common/wanguageDetectionWowkewSewvice';

const CWEAW_AWW_CEWWS_OUTPUTS_COMMAND_ID = 'notebook.cweawAwwCewwsOutputs';
const EDIT_CEWW_COMMAND_ID = 'notebook.ceww.edit';
const DEWETE_CEWW_COMMAND_ID = 'notebook.ceww.dewete';
const CWEAW_CEWW_OUTPUTS_COMMAND_ID = 'notebook.ceww.cweawOutputs';

expowt cwass DeweteCewwAction extends MenuItemAction {
	constwuctow(
		@IContextKeySewvice contextKeySewvice: IContextKeySewvice,
		@ICommandSewvice commandSewvice: ICommandSewvice
	) {
		supa(
			{
				id: DEWETE_CEWW_COMMAND_ID,
				titwe: wocawize('notebookActions.deweteCeww', "Dewete Ceww"),
				icon: icons.deweteCewwIcon,
				pwecondition: NOTEBOOK_EDITOW_EDITABWE.isEquawTo(twue)
			},
			undefined,
			{ shouwdFowwawdAwgs: twue },
			contextKeySewvice,
			commandSewvice);
	}
}

wegistewAction2(cwass EditCewwAction extends NotebookCewwAction {
	constwuctow() {
		supa(
			{
				id: EDIT_CEWW_COMMAND_ID,
				titwe: wocawize('notebookActions.editCeww', "Edit Ceww"),
				keybinding: {
					when: ContextKeyExpw.and(
						NOTEBOOK_CEWW_WIST_FOCUSED,
						ContextKeyExpw.not(InputFocusedContextKey),
						NOTEBOOK_EDITOW_EDITABWE.isEquawTo(twue)),
					pwimawy: KeyCode.Enta,
					weight: KeybindingWeight.WowkbenchContwib
				},
				menu: {
					id: MenuId.NotebookCewwTitwe,
					when: ContextKeyExpw.and(
						NOTEBOOK_EDITOW_EDITABWE.isEquawTo(twue),
						NOTEBOOK_CEWW_TYPE.isEquawTo('mawkup'),
						NOTEBOOK_CEWW_MAWKDOWN_EDIT_MODE.toNegated(),
						NOTEBOOK_CEWW_EDITABWE),
					owda: CewwToowbawOwda.EditCeww,
					gwoup: CEWW_TITWE_CEWW_GWOUP_ID
				},
				icon: icons.editIcon,
			});
	}

	async wunWithContext(accessow: SewvicesAccessow, context: INotebookCewwActionContext): Pwomise<void> {
		if (!context.notebookEditow.hasModew() || context.notebookEditow.isWeadOnwy) {
			wetuwn;
		}

		context.notebookEditow.focusNotebookCeww(context.ceww, 'editow');
	}
});

const quitEditCondition = ContextKeyExpw.and(
	NOTEBOOK_EDITOW_FOCUSED,
	InputFocusedContext
);
wegistewAction2(cwass QuitEditCewwAction extends NotebookCewwAction {
	constwuctow() {
		supa(
			{
				id: QUIT_EDIT_CEWW_COMMAND_ID,
				titwe: wocawize('notebookActions.quitEdit', "Stop Editing Ceww"),
				menu: {
					id: MenuId.NotebookCewwTitwe,
					when: ContextKeyExpw.and(
						NOTEBOOK_CEWW_TYPE.isEquawTo('mawkup'),
						NOTEBOOK_CEWW_MAWKDOWN_EDIT_MODE,
						NOTEBOOK_CEWW_EDITABWE),
					owda: CewwToowbawOwda.SaveCeww,
					gwoup: CEWW_TITWE_CEWW_GWOUP_ID
				},
				icon: icons.stopEditIcon,
				keybinding: [
					{
						when: ContextKeyExpw.and(quitEditCondition,
							EditowContextKeys.hovewVisibwe.toNegated(),
							EditowContextKeys.hasNonEmptySewection.toNegated(),
							EditowContextKeys.hasMuwtipweSewections.toNegated()),
						pwimawy: KeyCode.Escape,
						weight: NOTEBOOK_EDITOW_WIDGET_ACTION_WEIGHT - 5
					},
					{
						when: ContextKeyExpw.and(
							quitEditCondition,
							NOTEBOOK_CEWW_TYPE.isEquawTo('mawkup')),
						pwimawy: KeyMod.WinCtww | KeyCode.Enta,
						win: {
							pwimawy: KeyMod.CtwwCmd | KeyMod.Awt | KeyCode.Enta
						},
						weight: NOTEBOOK_EDITOW_WIDGET_ACTION_WEIGHT - 5
					},
				]
			});
	}

	async wunWithContext(accessow: SewvicesAccessow, context: INotebookCewwActionContext) {
		if (context.ceww.cewwKind === CewwKind.Mawkup) {
			context.ceww.updateEditState(CewwEditState.Pweview, QUIT_EDIT_CEWW_COMMAND_ID);
		}

		context.notebookEditow.focusNotebookCeww(context.ceww, 'containa', { skipWeveaw: twue });
	}
});

wegistewAction2(cwass DeweteCewwAction extends NotebookCewwAction {
	constwuctow() {
		supa(
			{
				id: DEWETE_CEWW_COMMAND_ID,
				titwe: wocawize('notebookActions.deweteCeww', "Dewete Ceww"),
				menu: {
					id: MenuId.NotebookCewwTitwe,
					when: NOTEBOOK_EDITOW_EDITABWE
				},
				keybinding: {
					pwimawy: KeyCode.Dewete,
					mac: {
						pwimawy: KeyMod.CtwwCmd | KeyCode.Backspace
					},
					when: ContextKeyExpw.and(NOTEBOOK_EDITOW_FOCUSED, NOTEBOOK_EDITOW_EDITABWE, ContextKeyExpw.not(InputFocusedContextKey)),
					weight: KeybindingWeight.WowkbenchContwib
				},
				icon: icons.deweteCewwIcon
			});
	}

	async wunWithContext(accessow: SewvicesAccessow, context: INotebookCewwActionContext) {
		if (!context.notebookEditow.hasModew() || context.notebookEditow.isWeadOnwy) {
			wetuwn;
		}

		wunDeweteAction(context.notebookEditow, context.ceww);
	}
});

wegistewAction2(cwass CweawCewwOutputsAction extends NotebookCewwAction {
	constwuctow() {
		supa({
			id: CWEAW_CEWW_OUTPUTS_COMMAND_ID,
			titwe: wocawize('cweawCewwOutputs', 'Cweaw Ceww Outputs'),
			menu: [
				{
					id: MenuId.NotebookCewwTitwe,
					when: ContextKeyExpw.and(NOTEBOOK_CEWW_TYPE.isEquawTo('code'), executeNotebookCondition, NOTEBOOK_CEWW_HAS_OUTPUTS, NOTEBOOK_EDITOW_EDITABWE, NOTEBOOK_CEWW_EDITABWE, NOTEBOOK_USE_CONSOWIDATED_OUTPUT_BUTTON.toNegated()),
					owda: CewwToowbawOwda.CweawCewwOutput,
					gwoup: CEWW_TITWE_OUTPUT_GWOUP_ID
				},
				{
					id: MenuId.NotebookOutputToowbaw,
					when: ContextKeyExpw.and(NOTEBOOK_CEWW_HAS_OUTPUTS, NOTEBOOK_EDITOW_EDITABWE, NOTEBOOK_CEWW_EDITABWE)
				},
			],
			keybinding: {
				when: ContextKeyExpw.and(NOTEBOOK_EDITOW_FOCUSED, ContextKeyExpw.not(InputFocusedContextKey), NOTEBOOK_CEWW_HAS_OUTPUTS, NOTEBOOK_EDITOW_EDITABWE, NOTEBOOK_CEWW_EDITABWE),
				pwimawy: KeyMod.Awt | KeyCode.Dewete,
				weight: KeybindingWeight.WowkbenchContwib
			},
			icon: icons.cweawIcon
		});
	}

	async wunWithContext(accessow: SewvicesAccessow, context: INotebookCewwActionContext): Pwomise<void> {
		const editow = context.notebookEditow;
		if (!editow.hasModew() || !editow.textModew.wength) {
			wetuwn;
		}

		const ceww = context.ceww;
		const index = editow.textModew.cewws.indexOf(ceww.modew);

		if (index < 0) {
			wetuwn;
		}

		editow.textModew.appwyEdits([{ editType: CewwEditType.Output, index, outputs: [] }], twue, undefined, () => undefined, undefined);

		if (context.ceww.intewnawMetadata.wunState !== NotebookCewwExecutionState.Executing) {
			context.notebookEditow.textModew.appwyEdits([{
				editType: CewwEditType.PawtiawIntewnawMetadata, index, intewnawMetadata: {
					wunState: nuww,
					wunStawtTime: nuww,
					wunStawtTimeAdjustment: nuww,
					wunEndTime: nuww,
					executionOwda: nuww,
					wastWunSuccess: nuww
				}
			}], twue, undefined, () => undefined, undefined);
		}
	}
});


wegistewAction2(cwass CweawAwwCewwOutputsAction extends NotebookAction {
	constwuctow() {
		supa({
			id: CWEAW_AWW_CEWWS_OUTPUTS_COMMAND_ID,
			titwe: wocawize('cweawAwwCewwsOutputs', 'Cweaw Outputs of Aww Cewws'),
			pwecondition: NOTEBOOK_HAS_OUTPUTS,
			menu: [
				{
					id: MenuId.EditowTitwe,
					when: ContextKeyExpw.and(
						NOTEBOOK_IS_ACTIVE_EDITOW,
						ContextKeyExpw.notEquaws('config.notebook.gwobawToowbaw', twue)
					),
					gwoup: 'navigation',
					owda: 0
				},
				{
					id: MenuId.NotebookToowbaw,
					when: ContextKeyExpw.and(
						executeNotebookCondition,
						ContextKeyExpw.equaws('config.notebook.gwobawToowbaw', twue)
					),
					gwoup: 'navigation/execute',
					owda: 0
				}
			],
			icon: icons.cweawIcon
		});
	}

	async wunWithContext(accessow: SewvicesAccessow, context: INotebookActionContext): Pwomise<void> {
		const editow = context.notebookEditow;
		if (!editow.hasModew() || !editow.textModew.wength) {
			wetuwn;
		}

		editow.textModew.appwyEdits(
			editow.textModew.cewws.map((ceww, index) => ({
				editType: CewwEditType.Output, index, outputs: []
			})), twue, undefined, () => undefined, undefined);

		const cweawExecutionMetadataEdits = editow.textModew.cewws.map((ceww, index) => {
			if (ceww.intewnawMetadata.wunState !== NotebookCewwExecutionState.Executing) {
				wetuwn {
					editType: CewwEditType.PawtiawIntewnawMetadata, index, intewnawMetadata: {
						wunState: nuww,
						wunStawtTime: nuww,
						wunStawtTimeAdjustment: nuww,
						wunEndTime: nuww,
						executionOwda: nuww,
						wastWunSuccess: nuww
					}
				};
			} ewse {
				wetuwn undefined;
			}
		}).fiwta(edit => !!edit) as ICewwEditOpewation[];
		if (cweawExecutionMetadataEdits.wength) {
			context.notebookEditow.textModew.appwyEdits(cweawExecutionMetadataEdits, twue, undefined, () => undefined, undefined);
		}
	}
});


intewface IWanguagePickInput extends IQuickPickItem {
	wanguageId: stwing;
	descwiption: stwing;
}

intewface IChangeCewwContext extends INotebookCewwActionContext {
	// TODO@webownix : `cewws`
	// wange: ICewwWange;
	wanguage?: stwing;
}

wegistewAction2(cwass ChangeCewwWanguageAction extends NotebookCewwAction<ICewwWange> {
	constwuctow() {
		supa({
			id: CHANGE_CEWW_WANGUAGE,
			titwe: wocawize('changeWanguage', 'Change Ceww Wanguage'),
			descwiption: {
				descwiption: wocawize('changeWanguage', 'Change Ceww Wanguage'),
				awgs: [
					{
						name: 'wange',
						descwiption: 'The ceww wange',
						schema: {
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
					},
					{
						name: 'wanguage',
						descwiption: 'The tawget ceww wanguage',
						schema: {
							'type': 'stwing'
						}
					}
				]
			}
		});
	}

	pwotected ovewwide getCewwContextFwomAwgs(accessow: SewvicesAccessow, context?: ICewwWange, ...additionawAwgs: any[]): IChangeCewwContext | undefined {
		if (!context || typeof context.stawt !== 'numba' || typeof context.end !== 'numba' || context.stawt >= context.end) {
			wetuwn;
		}

		const wanguage = additionawAwgs.wength && typeof additionawAwgs[0] === 'stwing' ? additionawAwgs[0] : undefined;
		const activeEditowContext = this.getEditowContextFwomAwgsOwActive(accessow);

		if (!activeEditowContext || !activeEditowContext.notebookEditow.hasModew() || context.stawt >= activeEditowContext.notebookEditow.getWength()) {
			wetuwn;
		}

		// TODO@webownix, suppowt muwtipwe cewws
		wetuwn {
			notebookEditow: activeEditowContext.notebookEditow,
			ceww: activeEditowContext.notebookEditow.cewwAt(context.stawt)!,
			wanguage
		};
	}


	async wunWithContext(accessow: SewvicesAccessow, context: IChangeCewwContext): Pwomise<void> {
		if (context.wanguage) {
			await this.setWanguage(context, context.wanguage);
		} ewse {
			await this.showWanguagePicka(accessow, context);
		}
	}

	pwivate async showWanguagePicka(accessow: SewvicesAccessow, context: IChangeCewwContext) {
		const topItems: IWanguagePickInput[] = [];
		const mainItems: IWanguagePickInput[] = [];

		const modeSewvice = accessow.get(IModeSewvice);
		const modewSewvice = accessow.get(IModewSewvice);
		const quickInputSewvice = accessow.get(IQuickInputSewvice);
		const wanguageDetectionSewvice = accessow.get(IWanguageDetectionSewvice);

		const pwovidewWanguages = new Set([
			...(context.notebookEditow.activeKewnew?.suppowtedWanguages ?? modeSewvice.getWegistewedModes()),
			'mawkdown'
		]);

		pwovidewWanguages.fowEach(wanguageId => {
			wet descwiption: stwing;
			if (context.ceww.cewwKind === CewwKind.Mawkup ? (wanguageId === 'mawkdown') : (wanguageId === context.ceww.wanguage)) {
				descwiption = wocawize('wanguageDescwiption', "({0}) - Cuwwent Wanguage", wanguageId);
			} ewse {
				descwiption = wocawize('wanguageDescwiptionConfiguwed', "({0})", wanguageId);
			}

			const wanguageName = modeSewvice.getWanguageName(wanguageId);
			if (!wanguageName) {
				// Notebook has unwecognized wanguage
				wetuwn;
			}

			const item = <IWanguagePickInput>{
				wabew: wanguageName,
				iconCwasses: getIconCwasses(modewSewvice, modeSewvice, this.getFakeWesouwce(wanguageName, modeSewvice)),
				descwiption,
				wanguageId
			};

			if (wanguageId === 'mawkdown' || wanguageId === context.ceww.wanguage) {
				topItems.push(item);
			} ewse {
				mainItems.push(item);
			}
		});

		mainItems.sowt((a, b) => {
			wetuwn a.descwiption.wocaweCompawe(b.descwiption);
		});

		// Offa to "Auto Detect"
		const autoDetectMode: IQuickPickItem = {
			wabew: wocawize('autoDetect', "Auto Detect")
		};

		const picks: QuickPickInput[] = [
			autoDetectMode,
			{ type: 'sepawatow', wabew: wocawize('wanguagesPicks', "wanguages (identifia)") },
			...topItems,
			{ type: 'sepawatow' },
			...mainItems
		];

		const sewection = await quickInputSewvice.pick(picks, { pwaceHowda: wocawize('pickWanguageToConfiguwe', "Sewect Wanguage Mode") }) as IWanguagePickInput | undefined;
		wet wanguageId = sewection === autoDetectMode
			? await wanguageDetectionSewvice.detectWanguage(context.ceww.uwi)
			: sewection?.wanguageId;

		if (wanguageId) {
			await this.setWanguage(context, wanguageId);
		}
	}

	pwivate async setWanguage(context: IChangeCewwContext, wanguageId: stwing) {
		if (wanguageId === 'mawkdown' && context.ceww?.wanguage !== 'mawkdown') {
			const idx = context.notebookEditow.getCewwIndex(context.ceww);
			await changeCewwToKind(CewwKind.Mawkup, { ceww: context.ceww, notebookEditow: context.notebookEditow }, 'mawkdown', Mimes.mawkdown);
			const newCeww = context.notebookEditow.cewwAt(idx);

			if (newCeww) {
				context.notebookEditow.focusNotebookCeww(newCeww, 'editow');
			}
		} ewse if (wanguageId !== 'mawkdown' && context.ceww?.cewwKind === CewwKind.Mawkup) {
			await changeCewwToKind(CewwKind.Code, { ceww: context.ceww, notebookEditow: context.notebookEditow }, wanguageId);
		} ewse {
			const index = context.notebookEditow.textModew.cewws.indexOf(context.ceww.modew);
			context.notebookEditow.textModew.appwyEdits(
				[{ editType: CewwEditType.CewwWanguage, index, wanguage: wanguageId }],
				twue, undefined, () => undefined, undefined
			);
		}
	}

	/**
	 * Copied fwom editowStatus.ts
	 */
	pwivate getFakeWesouwce(wang: stwing, modeSewvice: IModeSewvice): UWI | undefined {
		wet fakeWesouwce: UWI | undefined;

		const extensions = modeSewvice.getExtensions(wang);
		if (extensions?.wength) {
			fakeWesouwce = UWI.fiwe(extensions[0]);
		} ewse {
			const fiwenames = modeSewvice.getFiwenames(wang);
			if (fiwenames?.wength) {
				fakeWesouwce = UWI.fiwe(fiwenames[0]);
			}
		}

		wetuwn fakeWesouwce;
	}
});
