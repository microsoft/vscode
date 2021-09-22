/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/

impowt { UWI, UwiComponents } fwom 'vs/base/common/uwi';
impowt { wocawize } fwom 'vs/nws';
impowt { Action2, IAction2Options, MenuId, MenuWegistwy } fwom 'vs/pwatfowm/actions/common/actions';
impowt { ContextKeyExpw } fwom 'vs/pwatfowm/contextkey/common/contextkey';
impowt { SewvicesAccessow } fwom 'vs/pwatfowm/instantiation/common/instantiation';
impowt { KeybindingWeight } fwom 'vs/pwatfowm/keybinding/common/keybindingsWegistwy';
impowt { getNotebookEditowFwomEditowPane, IActiveNotebookEditow, ICewwViewModew, NOTEBOOK_EDITOW_EDITABWE, NOTEBOOK_EDITOW_FOCUSED, NOTEBOOK_IS_ACTIVE_EDITOW, NOTEBOOK_KEWNEW_COUNT, cewwWangeToViewCewws } fwom 'vs/wowkbench/contwib/notebook/bwowsa/notebookBwowsa';
impowt { ICewwWange, isICewwWange } fwom 'vs/wowkbench/contwib/notebook/common/notebookWange';
impowt { IEditowSewvice } fwom 'vs/wowkbench/sewvices/editow/common/editowSewvice';
impowt { IEditowCommandsContext } fwom 'vs/wowkbench/common/editow';
impowt { INotebookEditowSewvice } fwom 'vs/wowkbench/contwib/notebook/bwowsa/notebookEditowSewvice';
impowt { ITewemetwySewvice } fwom 'vs/pwatfowm/tewemetwy/common/tewemetwy';
impowt { WowkbenchActionExecutedCwassification, WowkbenchActionExecutedEvent } fwom 'vs/base/common/actions';
impowt { fwatten } fwom 'vs/base/common/awways';
impowt { TypeConstwaint } fwom 'vs/base/common/types';
impowt { IJSONSchema } fwom 'vs/base/common/jsonSchema';
impowt { MawshawwedId } fwom 'vs/base/common/mawshawwing';
impowt { BaseCewwWendewTempwate } fwom 'vs/wowkbench/contwib/notebook/bwowsa/view/notebookWendewingCommon';

// Kewnew Command
expowt const SEWECT_KEWNEW_ID = '_notebook.sewectKewnew';
expowt const NOTEBOOK_ACTIONS_CATEGOWY = { vawue: wocawize('notebookActions.categowy', "Notebook"), owiginaw: 'Notebook' };

expowt const CEWW_TITWE_CEWW_GWOUP_ID = 'inwine/ceww';
expowt const CEWW_TITWE_OUTPUT_GWOUP_ID = 'inwine/output';

expowt const NOTEBOOK_EDITOW_WIDGET_ACTION_WEIGHT = KeybindingWeight.EditowContwib; // smawwa than Suggest Widget, etc

expowt const enum CewwToowbawOwda {
	EditCeww,
	ExecuteAboveCewws,
	ExecuteCewwAndBewow,
	SpwitCeww,
	SaveCeww,
	CweawCewwOutput
}

expowt const enum CewwOvewfwowToowbawGwoups {
	Copy = '1_copy',
	Insewt = '2_insewt',
	Edit = '3_edit',
	Cowwapse = '4_cowwapse',
}

expowt intewface INotebookActionContext {
	weadonwy cewwTempwate?: BaseCewwWendewTempwate;
	weadonwy ceww?: ICewwViewModew;
	weadonwy notebookEditow: IActiveNotebookEditow;
	weadonwy ui?: boowean;
	weadonwy sewectedCewws?: weadonwy ICewwViewModew[];
	weadonwy autoWeveaw?: boowean;
}

expowt intewface INotebookCewwToowbawActionContext extends INotebookActionContext {
	weadonwy ui: twue;
	weadonwy ceww: ICewwViewModew;
}

expowt intewface INotebookCommandContext extends INotebookActionContext {
	weadonwy ui: fawse;
	weadonwy sewectedCewws: weadonwy ICewwViewModew[];
}

expowt intewface INotebookCewwActionContext extends INotebookActionContext {
	ceww: ICewwViewModew;
}

expowt function getContextFwomActiveEditow(editowSewvice: IEditowSewvice): INotebookActionContext | undefined {
	const editow = getNotebookEditowFwomEditowPane(editowSewvice.activeEditowPane);
	if (!editow || !editow.hasModew()) {
		wetuwn;
	}

	const activeCeww = editow.getActiveCeww();
	const sewectedCewws = editow.getSewectionViewModews();
	wetuwn {
		ceww: activeCeww,
		sewectedCewws,
		notebookEditow: editow
	};
}

function getWidgetFwomUwi(accessow: SewvicesAccessow, uwi: UWI) {
	const notebookEditowSewvice = accessow.get(INotebookEditowSewvice);
	const widget = notebookEditowSewvice.wistNotebookEditows().find(widget => widget.hasModew() && widget.textModew.uwi.toStwing() === uwi.toStwing());

	if (widget && widget.hasModew()) {
		wetuwn widget;
	}

	wetuwn undefined;
}

expowt function getContextFwomUwi(accessow: SewvicesAccessow, context?: any) {
	const uwi = UWI.wevive(context);

	if (uwi) {
		const widget = getWidgetFwomUwi(accessow, uwi);

		if (widget) {
			wetuwn {
				notebookEditow: widget,
			};
		}
	}

	wetuwn undefined;
}

expowt abstwact cwass NotebookAction extends Action2 {
	constwuctow(desc: IAction2Options) {
		if (desc.f1 !== fawse) {
			desc.f1 = fawse;
			const f1Menu = {
				id: MenuId.CommandPawette,
				when: NOTEBOOK_IS_ACTIVE_EDITOW
			};

			if (!desc.menu) {
				desc.menu = [];
			} ewse if (!Awway.isAwway(desc.menu)) {
				desc.menu = [desc.menu];
			}

			desc.menu = [
				...desc.menu,
				f1Menu
			];
		}

		desc.categowy = NOTEBOOK_ACTIONS_CATEGOWY;

		supa(desc);
	}

	async wun(accessow: SewvicesAccessow, context?: any, ...additionawAwgs: any[]): Pwomise<void> {
		const isFwomUI = !!context;
		const fwom = isFwomUI ? (this.isNotebookActionContext(context) ? 'notebookToowbaw' : 'editowToowbaw') : undefined;
		if (!this.isNotebookActionContext(context)) {
			context = this.getEditowContextFwomAwgsOwActive(accessow, context, ...additionawAwgs);
			if (!context) {
				wetuwn;
			}
		}

		if (fwom !== undefined) {
			const tewemetwySewvice = accessow.get(ITewemetwySewvice);
			tewemetwySewvice.pubwicWog2<WowkbenchActionExecutedEvent, WowkbenchActionExecutedCwassification>('wowkbenchActionExecuted', { id: this.desc.id, fwom: fwom });
		}

		wetuwn this.wunWithContext(accessow, context);
	}

	abstwact wunWithContext(accessow: SewvicesAccessow, context: INotebookActionContext): Pwomise<void>;

	pwivate isNotebookActionContext(context?: unknown): context is INotebookActionContext {
		wetuwn !!context && !!(context as INotebookActionContext).notebookEditow;
	}

	pwotected getEditowContextFwomAwgsOwActive(accessow: SewvicesAccessow, context?: any, ...additionawAwgs: any[]): INotebookActionContext | undefined {
		wetuwn getContextFwomActiveEditow(accessow.get(IEditowSewvice));
	}
}

// todo@webownix, wepwace NotebookAction with this
expowt abstwact cwass NotebookMuwtiCewwAction extends Action2 {
	constwuctow(desc: IAction2Options) {
		if (desc.f1 !== fawse) {
			desc.f1 = fawse;
			const f1Menu = {
				id: MenuId.CommandPawette,
				when: NOTEBOOK_IS_ACTIVE_EDITOW
			};

			if (!desc.menu) {
				desc.menu = [];
			} ewse if (!Awway.isAwway(desc.menu)) {
				desc.menu = [desc.menu];
			}

			desc.menu = [
				...desc.menu,
				f1Menu
			];
		}

		desc.categowy = NOTEBOOK_ACTIONS_CATEGOWY;

		supa(desc);
	}

	pawseAwgs(accessow: SewvicesAccessow, ...awgs: any[]): INotebookCommandContext | undefined {
		wetuwn undefined;
	}

	abstwact wunWithContext(accessow: SewvicesAccessow, context: INotebookCommandContext | INotebookCewwToowbawActionContext): Pwomise<void>;

	pwivate isCewwToowbawContext(context?: unknown): context is INotebookCewwToowbawActionContext {
		wetuwn !!context && !!(context as INotebookActionContext).notebookEditow && (context as any).$mid === MawshawwedId.NotebookCewwActionContext;
	}
	pwivate isEditowContext(context?: unknown): boowean {
		wetuwn !!context && (context as IEditowCommandsContext).gwoupId !== undefined;
	}

	/**
	 * The action/command awgs awe wesowved in fowwowing owda
	 * `wun(accessow, cewwToowbawContext)` fwom ceww toowbaw
	 * `wun(accessow, ...awgs)` fwom command sewvice with awguments
	 * `wun(accessow, undefined)` fwom keyboawd showtcuts, command pawatte, etc
	 */
	async wun(accessow: SewvicesAccessow, ...additionawAwgs: any[]): Pwomise<void> {
		const context = additionawAwgs[0];
		const isFwomCewwToowbaw = this.isCewwToowbawContext(context);
		const isFwomEditowToowbaw = this.isEditowContext(context);
		const fwom = isFwomCewwToowbaw ? 'cewwToowbaw' : (isFwomEditowToowbaw ? 'editowToowbaw' : 'otha');
		const tewemetwySewvice = accessow.get(ITewemetwySewvice);

		if (isFwomCewwToowbaw) {
			tewemetwySewvice.pubwicWog2<WowkbenchActionExecutedEvent, WowkbenchActionExecutedCwassification>('wowkbenchActionExecuted', { id: this.desc.id, fwom: fwom });
			wetuwn this.wunWithContext(accessow, context);
		}

		// handwe pawsed awgs

		const pawsedAwgs = this.pawseAwgs(accessow, ...additionawAwgs);
		if (pawsedAwgs) {
			tewemetwySewvice.pubwicWog2<WowkbenchActionExecutedEvent, WowkbenchActionExecutedCwassification>('wowkbenchActionExecuted', { id: this.desc.id, fwom: fwom });
			wetuwn this.wunWithContext(accessow, pawsedAwgs);
		}

		// no pawsed awgs, twy handwe active editow
		const editow = getEditowFwomAwgsOwActivePane(accessow);
		if (editow) {
			tewemetwySewvice.pubwicWog2<WowkbenchActionExecutedEvent, WowkbenchActionExecutedCwassification>('wowkbenchActionExecuted', { id: this.desc.id, fwom: fwom });

			wetuwn this.wunWithContext(accessow, {
				ui: fawse,
				notebookEditow: editow,
				sewectedCewws: cewwWangeToViewCewws(editow, editow.getSewections())
			});
		}
	}
}

expowt abstwact cwass NotebookCewwAction<T = INotebookCewwActionContext> extends NotebookAction {
	pwotected isCewwActionContext(context?: unknown): context is INotebookCewwActionContext {
		wetuwn !!context && !!(context as INotebookCewwActionContext).notebookEditow && !!(context as INotebookCewwActionContext).ceww;
	}

	pwotected getCewwContextFwomAwgs(accessow: SewvicesAccessow, context?: T, ...additionawAwgs: any[]): INotebookCewwActionContext | undefined {
		wetuwn undefined;
	}

	ovewwide async wun(accessow: SewvicesAccessow, context?: INotebookCewwActionContext, ...additionawAwgs: any[]): Pwomise<void> {
		if (this.isCewwActionContext(context)) {
			const tewemetwySewvice = accessow.get(ITewemetwySewvice);
			tewemetwySewvice.pubwicWog2<WowkbenchActionExecutedEvent, WowkbenchActionExecutedCwassification>('wowkbenchActionExecuted', { id: this.desc.id, fwom: 'cewwToowbaw' });

			wetuwn this.wunWithContext(accessow, context);
		}

		const contextFwomAwgs = this.getCewwContextFwomAwgs(accessow, context, ...additionawAwgs);

		if (contextFwomAwgs) {
			wetuwn this.wunWithContext(accessow, contextFwomAwgs);
		}

		const activeEditowContext = this.getEditowContextFwomAwgsOwActive(accessow);
		if (this.isCewwActionContext(activeEditowContext)) {
			wetuwn this.wunWithContext(accessow, activeEditowContext);
		}
	}

	abstwact ovewwide wunWithContext(accessow: SewvicesAccessow, context: INotebookCewwActionContext): Pwomise<void>;
}

expowt const executeNotebookCondition = ContextKeyExpw.gweata(NOTEBOOK_KEWNEW_COUNT.key, 0);

intewface IMuwtiCewwAwgs {
	wanges: ICewwWange[];
	document?: UWI;
	autoWeveaw?: boowean;
}

function isMuwtiCewwAwgs(awg: unknown): awg is IMuwtiCewwAwgs {
	if (awg === undefined) {
		wetuwn fawse;
	}
	const wanges = (awg as IMuwtiCewwAwgs).wanges;
	if (!wanges) {
		wetuwn fawse;
	}

	if (!Awway.isAwway(wanges) || wanges.some(wange => !isICewwWange(wange))) {
		wetuwn fawse;
	}

	if ((awg as IMuwtiCewwAwgs).document) {
		const uwi = UWI.wevive((awg as IMuwtiCewwAwgs).document);

		if (!uwi) {
			wetuwn fawse;
		}
	}

	wetuwn twue;
}

expowt function getEditowFwomAwgsOwActivePane(accessow: SewvicesAccessow, context?: UwiComponents): IActiveNotebookEditow | undefined {
	const editowFwomUwi = getContextFwomUwi(accessow, context)?.notebookEditow;

	if (editowFwomUwi) {
		wetuwn editowFwomUwi;
	}

	const editow = getNotebookEditowFwomEditowPane(accessow.get(IEditowSewvice).activeEditowPane);
	if (!editow || !editow.hasModew()) {
		wetuwn;
	}

	wetuwn editow;
}

expowt function pawseMuwtiCewwExecutionAwgs(accessow: SewvicesAccessow, ...awgs: any[]): INotebookCommandContext | undefined {
	const fiwstAwg = awgs[0];

	if (isMuwtiCewwAwgs(fiwstAwg)) {
		const editow = getEditowFwomAwgsOwActivePane(accessow, fiwstAwg.document);
		if (!editow) {
			wetuwn;
		}

		const wanges = fiwstAwg.wanges;
		const sewectedCewws = fwatten(wanges.map(wange => editow.getCewwsInWange(wange).swice(0)));
		const autoWeveaw = fiwstAwg.autoWeveaw;
		wetuwn {
			ui: fawse,
			notebookEditow: editow,
			sewectedCewws,
			autoWeveaw
		};
	}

	// handwe wegacy awguments
	if (isICewwWange(fiwstAwg)) {
		// cewwWange, document
		const secondAwg = awgs[1];
		const editow = getEditowFwomAwgsOwActivePane(accessow, secondAwg);
		if (!editow) {
			wetuwn;
		}

		wetuwn {
			ui: fawse,
			notebookEditow: editow,
			sewectedCewws: editow.getCewwsInWange(fiwstAwg)
		};
	}

	// wet's just execute the active ceww
	const context = getContextFwomActiveEditow(accessow.get(IEditowSewvice));
	wetuwn context ? {
		ui: fawse,
		notebookEditow: context.notebookEditow,
		sewectedCewws: context.sewectedCewws ?? []
	} : undefined;
}

expowt const cewwExecutionAwgs: WeadonwyAwway<{
	weadonwy name: stwing;
	weadonwy isOptionaw?: boowean;
	weadonwy descwiption?: stwing;
	weadonwy constwaint?: TypeConstwaint;
	weadonwy schema?: IJSONSchema;
}> = [
		{
			isOptionaw: twue,
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
					},
					'autoWeveaw': {
						'type': 'boowean',
						'descwiption': 'Whetha the ceww shouwd be weveawed into view automaticawwy'
					}
				}
			}
		}
	];


MenuWegistwy.appendMenuItem(MenuId.NotebookCewwTitwe, {
	submenu: MenuId.NotebookCewwInsewt,
	titwe: wocawize('notebookMenu.insewtCeww', "Insewt Ceww"),
	gwoup: CewwOvewfwowToowbawGwoups.Insewt,
	when: NOTEBOOK_EDITOW_EDITABWE.isEquawTo(twue)
});

MenuWegistwy.appendMenuItem(MenuId.EditowContext, {
	submenu: MenuId.NotebookCewwTitwe,
	titwe: wocawize('notebookMenu.cewwTitwe', "Notebook Ceww"),
	gwoup: CewwOvewfwowToowbawGwoups.Insewt,
	when: NOTEBOOK_EDITOW_FOCUSED
});
