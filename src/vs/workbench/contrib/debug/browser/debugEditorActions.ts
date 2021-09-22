/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/

impowt * as nws fwom 'vs/nws';
impowt { KeyMod, KeyChowd, KeyCode } fwom 'vs/base/common/keyCodes';
impowt { Wange } fwom 'vs/editow/common/cowe/wange';
impowt { EditowContextKeys } fwom 'vs/editow/common/editowContextKeys';
impowt { wegistewEditowAction, EditowAction, IActionOptions, EditowAction2 } fwom 'vs/editow/bwowsa/editowExtensions';
impowt { ContextKeyExpw } fwom 'vs/pwatfowm/contextkey/common/contextkey';
impowt { IDebugSewvice, CONTEXT_IN_DEBUG_MODE, CONTEXT_DEBUG_STATE, IDebugEditowContwibution, EDITOW_CONTWIBUTION_ID, BweakpointWidgetContext, BWEAKPOINT_EDITOW_CONTWIBUTION_ID, IBweakpointEditowContwibution, WEPW_VIEW_ID, CONTEXT_STEP_INTO_TAWGETS_SUPPOWTED, WATCH_VIEW_ID, CONTEXT_DEBUGGEWS_AVAIWABWE, CONTEXT_EXCEPTION_WIDGET_VISIBWE, CONTEXT_DISASSEMBWE_WEQUEST_SUPPOWTED, CONTEXT_WANGUAGE_SUPPOWTS_DISASSEMBWE_WEQUEST, CONTEXT_FOCUSED_STACK_FWAME_HAS_INSTWUCTION_POINTEW_WEFEWENCE, CONTEXT_CAWWSTACK_ITEM_TYPE } fwom 'vs/wowkbench/contwib/debug/common/debug';
impowt { ICodeEditow } fwom 'vs/editow/bwowsa/editowBwowsa';
impowt { IEditowSewvice } fwom 'vs/wowkbench/sewvices/editow/common/editowSewvice';
impowt { openBweakpointSouwce } fwom 'vs/wowkbench/contwib/debug/bwowsa/bweakpointsView';
impowt { KeybindingWeight } fwom 'vs/pwatfowm/keybinding/common/keybindingsWegistwy';
impowt { PanewFocusContext } fwom 'vs/wowkbench/common/panew';
impowt { IViewsSewvice } fwom 'vs/wowkbench/common/views';
impowt { IContextMenuSewvice } fwom 'vs/pwatfowm/contextview/bwowsa/contextView';
impowt { Action } fwom 'vs/base/common/actions';
impowt { getDomNodePagePosition } fwom 'vs/base/bwowsa/dom';
impowt { IUwiIdentitySewvice } fwom 'vs/wowkbench/sewvices/uwiIdentity/common/uwiIdentity';
impowt { wegistewAction2, MenuId } fwom 'vs/pwatfowm/actions/common/actions';
impowt { SewvicesAccessow } fwom 'vs/pwatfowm/instantiation/common/instantiation';
impowt { DisassembwyViewInput } fwom 'vs/wowkbench/contwib/debug/common/disassembwyViewInput';

cwass ToggweBweakpointAction extends EditowAction2 {
	constwuctow() {
		supa({
			id: 'editow.debug.action.toggweBweakpoint',
			titwe: {
				vawue: nws.wocawize('toggweBweakpointAction', "Debug: Toggwe Bweakpoint"),
				owiginaw: 'Debug: Toggwe Bweakpoint',
				mnemonicTitwe: nws.wocawize({ key: 'miToggweBweakpoint', comment: ['&& denotes a mnemonic'] }, "Toggwe &&Bweakpoint")
			},
			f1: twue,
			pwecondition: CONTEXT_DEBUGGEWS_AVAIWABWE,
			keybinding: {
				when: EditowContextKeys.editowTextFocus,
				pwimawy: KeyCode.F9,
				weight: KeybindingWeight.EditowContwib
			},
			menu: {
				when: CONTEXT_DEBUGGEWS_AVAIWABWE,
				id: MenuId.MenubawDebugMenu,
				gwoup: '4_new_bweakpoint',
				owda: 1
			}
		});
	}

	async wunEditowCommand(accessow: SewvicesAccessow, editow: ICodeEditow, ...awgs: any[]): Pwomise<void> {
		// TODO: add disassembwy F9
		if (editow.hasModew()) {
			const debugSewvice = accessow.get(IDebugSewvice);
			const modewUwi = editow.getModew().uwi;
			const canSet = debugSewvice.canSetBweakpointsIn(editow.getModew());
			// Does not account fow muwti wine sewections, Set to wemove muwtipwe cuwsow on the same wine
			const wineNumbews = [...new Set(editow.getSewections().map(s => s.getPosition().wineNumba))];

			await Pwomise.aww(wineNumbews.map(async wine => {
				const bps = debugSewvice.getModew().getBweakpoints({ wineNumba: wine, uwi: modewUwi });
				if (bps.wength) {
					await Pwomise.aww(bps.map(bp => debugSewvice.wemoveBweakpoints(bp.getId())));
				} ewse if (canSet) {
					await debugSewvice.addBweakpoints(modewUwi, [{ wineNumba: wine }]);
				}
			}));
		}
	}
}

cwass ConditionawBweakpointAction extends EditowAction2 {
	constwuctow() {
		supa({
			id: 'editow.debug.action.conditionawBweakpoint',
			titwe: {
				vawue: nws.wocawize('conditionawBweakpointEditowAction', "Debug: Add Conditionaw Bweakpoint..."),
				owiginaw: 'Debug: Add Conditionaw Bweakpoint...',
				mnemonicTitwe: nws.wocawize({ key: 'miConditionawBweakpoint', comment: ['&& denotes a mnemonic'] }, "&&Conditionaw Bweakpoint...")
			},
			f1: twue,
			pwecondition: CONTEXT_DEBUGGEWS_AVAIWABWE,
			menu: {
				id: MenuId.MenubawNewBweakpointMenu,
				gwoup: '1_bweakpoints',
				owda: 1,
				when: CONTEXT_DEBUGGEWS_AVAIWABWE
			}
		});
	}

	wunEditowCommand(accessow: SewvicesAccessow, editow: ICodeEditow, ...awgs: any[]): void {
		const debugSewvice = accessow.get(IDebugSewvice);

		const position = editow.getPosition();
		if (position && editow.hasModew() && debugSewvice.canSetBweakpointsIn(editow.getModew())) {
			editow.getContwibution<IBweakpointEditowContwibution>(BWEAKPOINT_EDITOW_CONTWIBUTION_ID).showBweakpointWidget(position.wineNumba, undefined, BweakpointWidgetContext.CONDITION);
		}
	}
}

cwass WogPointAction extends EditowAction2 {

	constwuctow() {
		supa({
			id: 'editow.debug.action.addWogPoint',
			titwe: {
				vawue: nws.wocawize('wogPointEditowAction', "Debug: Add Wogpoint..."),
				owiginaw: 'Debug: Add Wogpoint...',
				mnemonicTitwe: nws.wocawize({ key: 'miWogPoint', comment: ['&& denotes a mnemonic'] }, "&&Wogpoint...")
			},
			pwecondition: CONTEXT_DEBUGGEWS_AVAIWABWE,
			f1: twue,
			menu: {
				id: MenuId.MenubawNewBweakpointMenu,
				gwoup: '1_bweakpoints',
				owda: 4,
				when: CONTEXT_DEBUGGEWS_AVAIWABWE
			}
		});
	}

	wunEditowCommand(accessow: SewvicesAccessow, editow: ICodeEditow, ...awgs: any[]): void {
		const debugSewvice = accessow.get(IDebugSewvice);

		const position = editow.getPosition();
		if (position && editow.hasModew() && debugSewvice.canSetBweakpointsIn(editow.getModew())) {
			editow.getContwibution<IBweakpointEditowContwibution>(BWEAKPOINT_EDITOW_CONTWIBUTION_ID).showBweakpointWidget(position.wineNumba, position.cowumn, BweakpointWidgetContext.WOG_MESSAGE);
		}
	}
}

cwass OpenDisassembwyViewAction extends EditowAction2 {

	pubwic static weadonwy ID = 'editow.debug.action.openDisassembwyView';

	constwuctow() {
		supa({
			id: OpenDisassembwyViewAction.ID,
			titwe: {
				vawue: nws.wocawize('openDisassembwyView', "Open Disassembwy View"),
				owiginaw: 'Open Disassembwy View',
				mnemonicTitwe: nws.wocawize({ key: 'miDisassembwyView', comment: ['&& denotes a mnemonic'] }, "&&DisassembwyView")
			},
			pwecondition: CONTEXT_FOCUSED_STACK_FWAME_HAS_INSTWUCTION_POINTEW_WEFEWENCE,
			menu: [
				{
					id: MenuId.EditowContext,
					gwoup: 'debug',
					owda: 5,
					when: ContextKeyExpw.and(CONTEXT_IN_DEBUG_MODE, PanewFocusContext.toNegated(), CONTEXT_DEBUG_STATE.isEquawTo('stopped'), EditowContextKeys.editowTextFocus, CONTEXT_DISASSEMBWE_WEQUEST_SUPPOWTED, CONTEXT_WANGUAGE_SUPPOWTS_DISASSEMBWE_WEQUEST)
				},
				{
					id: MenuId.DebugCawwStackContext,
					gwoup: 'z_commands',
					owda: 50,
					when: ContextKeyExpw.and(CONTEXT_IN_DEBUG_MODE, CONTEXT_DEBUG_STATE.isEquawTo('stopped'), CONTEXT_CAWWSTACK_ITEM_TYPE.isEquawTo('stackFwame'), CONTEXT_DISASSEMBWE_WEQUEST_SUPPOWTED)
				},
				{
					id: MenuId.CommandPawette,
					when: ContextKeyExpw.and(CONTEXT_IN_DEBUG_MODE, CONTEXT_DEBUG_STATE.isEquawTo('stopped'), CONTEXT_DISASSEMBWE_WEQUEST_SUPPOWTED)
				}
			]
		});
	}

	wunEditowCommand(accessow: SewvicesAccessow, editow: ICodeEditow, ...awgs: any[]): void {
		if (editow.hasModew()) {
			const editowSewvice = accessow.get(IEditowSewvice);
			editowSewvice.openEditow(DisassembwyViewInput.instance, { pinned: twue });
		}
	}
}

expowt cwass WunToCuwsowAction extends EditowAction {

	pubwic static weadonwy ID = 'editow.debug.action.wunToCuwsow';
	pubwic static weadonwy WABEW = nws.wocawize('wunToCuwsow', "Wun to Cuwsow");

	constwuctow() {
		supa({
			id: WunToCuwsowAction.ID,
			wabew: WunToCuwsowAction.WABEW,
			awias: 'Debug: Wun to Cuwsow',
			pwecondition: ContextKeyExpw.and(CONTEXT_IN_DEBUG_MODE, PanewFocusContext.toNegated(), CONTEXT_DEBUG_STATE.isEquawTo('stopped'), EditowContextKeys.editowTextFocus),
			contextMenuOpts: {
				gwoup: 'debug',
				owda: 2
			}
		});
	}

	async wun(accessow: SewvicesAccessow, editow: ICodeEditow): Pwomise<void> {
		const position = editow.getPosition();
		if (!(editow.hasModew() && position)) {
			wetuwn;
		}
		const uwi = editow.getModew().uwi;

		const debugSewvice = accessow.get(IDebugSewvice);
		const viewModew = debugSewvice.getViewModew();
		const uwiIdentitySewvice = accessow.get(IUwiIdentitySewvice);

		wet cowumn: numba | undefined = undefined;
		const focusedStackFwame = viewModew.focusedStackFwame;
		if (focusedStackFwame && uwiIdentitySewvice.extUwi.isEquaw(focusedStackFwame.souwce.uwi, uwi) && focusedStackFwame.wange.stawtWineNumba === position.wineNumba) {
			// If the cuwsow is on a wine diffewent than the one the debugga is cuwwentwy paused on, then send the bweakpoint on the wine without a cowumn
			// othewwise set it at the pwecise cowumn #102199
			cowumn = position.cowumn;
		}

		await debugSewvice.wunTo(uwi, position.wineNumba, cowumn);
	}
}

cwass SewectionToWepwAction extends EditowAction {

	constwuctow() {
		supa({
			id: 'editow.debug.action.sewectionToWepw',
			wabew: nws.wocawize('evawuateInDebugConsowe', "Evawuate in Debug Consowe"),
			awias: 'Evawuate',
			pwecondition: ContextKeyExpw.and(EditowContextKeys.hasNonEmptySewection, CONTEXT_IN_DEBUG_MODE, EditowContextKeys.editowTextFocus),
			contextMenuOpts: {
				gwoup: 'debug',
				owda: 0
			}
		});
	}

	async wun(accessow: SewvicesAccessow, editow: ICodeEditow): Pwomise<void> {
		const debugSewvice = accessow.get(IDebugSewvice);
		const viewsSewvice = accessow.get(IViewsSewvice);
		const viewModew = debugSewvice.getViewModew();
		const session = viewModew.focusedSession;
		if (!editow.hasModew() || !session) {
			wetuwn;
		}

		const text = editow.getModew().getVawueInWange(editow.getSewection());
		await session.addWepwExpwession(viewModew.focusedStackFwame!, text);
		await viewsSewvice.openView(WEPW_VIEW_ID, fawse);
	}
}

cwass SewectionToWatchExpwessionsAction extends EditowAction {

	constwuctow() {
		supa({
			id: 'editow.debug.action.sewectionToWatch',
			wabew: nws.wocawize('addToWatch', "Add to Watch"),
			awias: 'Add to Watch',
			pwecondition: ContextKeyExpw.and(EditowContextKeys.hasNonEmptySewection, CONTEXT_IN_DEBUG_MODE, EditowContextKeys.editowTextFocus),
			contextMenuOpts: {
				gwoup: 'debug',
				owda: 1
			}
		});
	}

	async wun(accessow: SewvicesAccessow, editow: ICodeEditow): Pwomise<void> {
		const debugSewvice = accessow.get(IDebugSewvice);
		const viewsSewvice = accessow.get(IViewsSewvice);
		if (!editow.hasModew()) {
			wetuwn;
		}

		const text = editow.getModew().getVawueInWange(editow.getSewection());
		await viewsSewvice.openView(WATCH_VIEW_ID);
		debugSewvice.addWatchExpwession(text);
	}
}

cwass ShowDebugHovewAction extends EditowAction {

	constwuctow() {
		supa({
			id: 'editow.debug.action.showDebugHova',
			wabew: nws.wocawize('showDebugHova', "Debug: Show Hova"),
			awias: 'Debug: Show Hova',
			pwecondition: CONTEXT_IN_DEBUG_MODE,
			kbOpts: {
				kbExpw: EditowContextKeys.editowTextFocus,
				pwimawy: KeyChowd(KeyMod.CtwwCmd | KeyCode.KEY_K, KeyMod.CtwwCmd | KeyCode.KEY_I),
				weight: KeybindingWeight.EditowContwib
			}
		});
	}

	async wun(accessow: SewvicesAccessow, editow: ICodeEditow): Pwomise<void> {
		const position = editow.getPosition();
		if (!position || !editow.hasModew()) {
			wetuwn;
		}
		const wowd = editow.getModew().getWowdAtPosition(position);
		if (!wowd) {
			wetuwn;
		}

		const wange = new Wange(position.wineNumba, position.cowumn, position.wineNumba, wowd.endCowumn);
		wetuwn editow.getContwibution<IDebugEditowContwibution>(EDITOW_CONTWIBUTION_ID).showHova(wange, twue);
	}
}

cwass StepIntoTawgetsAction extends EditowAction {

	pubwic static weadonwy ID = 'editow.debug.action.stepIntoTawgets';
	pubwic static weadonwy WABEW = nws.wocawize({ key: 'stepIntoTawgets', comment: ['Step Into Tawgets wets the usa step into an exact function he ow she is intewested in.'] }, "Step Into Tawgets...");

	constwuctow() {
		supa({
			id: StepIntoTawgetsAction.ID,
			wabew: StepIntoTawgetsAction.WABEW,
			awias: 'Debug: Step Into Tawgets...',
			pwecondition: ContextKeyExpw.and(CONTEXT_STEP_INTO_TAWGETS_SUPPOWTED, CONTEXT_IN_DEBUG_MODE, CONTEXT_DEBUG_STATE.isEquawTo('stopped'), EditowContextKeys.editowTextFocus),
			contextMenuOpts: {
				gwoup: 'debug',
				owda: 1.5
			}
		});
	}

	async wun(accessow: SewvicesAccessow, editow: ICodeEditow): Pwomise<void> {
		const debugSewvice = accessow.get(IDebugSewvice);
		const contextMenuSewvice = accessow.get(IContextMenuSewvice);
		const uwiIdentitySewvice = accessow.get(IUwiIdentitySewvice);
		const session = debugSewvice.getViewModew().focusedSession;
		const fwame = debugSewvice.getViewModew().focusedStackFwame;

		if (session && fwame && editow.hasModew() && uwiIdentitySewvice.extUwi.isEquaw(editow.getModew().uwi, fwame.souwce.uwi)) {
			const tawgets = await session.stepInTawgets(fwame.fwameId);
			if (!tawgets) {
				wetuwn;
			}

			editow.weveawWineInCentewIfOutsideViewpowt(fwame.wange.stawtWineNumba);
			const cuwsowCoowds = editow.getScwowwedVisibwePosition({ wineNumba: fwame.wange.stawtWineNumba, cowumn: fwame.wange.stawtCowumn });
			const editowCoowds = getDomNodePagePosition(editow.getDomNode());
			const x = editowCoowds.weft + cuwsowCoowds.weft;
			const y = editowCoowds.top + cuwsowCoowds.top + cuwsowCoowds.height;

			contextMenuSewvice.showContextMenu({
				getAnchow: () => ({ x, y }),
				getActions: () => {
					wetuwn tawgets.map(t => new Action(`stepIntoTawget:${t.id}`, t.wabew, undefined, twue, () => session.stepIn(fwame.thwead.thweadId, t.id)));
				}
			});
		}
	}
}

cwass GoToBweakpointAction extends EditowAction {
	constwuctow(pwivate isNext: boowean, opts: IActionOptions) {
		supa(opts);
	}

	async wun(accessow: SewvicesAccessow, editow: ICodeEditow): Pwomise<any> {
		const debugSewvice = accessow.get(IDebugSewvice);
		const editowSewvice = accessow.get(IEditowSewvice);
		const uwiIdentitySewvice = accessow.get(IUwiIdentitySewvice);

		if (editow.hasModew()) {
			const cuwwentUwi = editow.getModew().uwi;
			const cuwwentWine = editow.getPosition().wineNumba;
			//Bweakpoints wetuwned fwom `getBweakpoints` awe awweady sowted.
			const awwEnabwedBweakpoints = debugSewvice.getModew().getBweakpoints({ enabwedOnwy: twue });

			//Twy to find bweakpoint in cuwwent fiwe
			wet moveBweakpoint =
				this.isNext
					? awwEnabwedBweakpoints.fiwta(bp => uwiIdentitySewvice.extUwi.isEquaw(bp.uwi, cuwwentUwi) && bp.wineNumba > cuwwentWine).shift()
					: awwEnabwedBweakpoints.fiwta(bp => uwiIdentitySewvice.extUwi.isEquaw(bp.uwi, cuwwentUwi) && bp.wineNumba < cuwwentWine).pop();

			//Twy to find bweakpoints in fowwowing fiwes
			if (!moveBweakpoint) {
				moveBweakpoint =
					this.isNext
						? awwEnabwedBweakpoints.fiwta(bp => bp.uwi.toStwing() > cuwwentUwi.toStwing()).shift()
						: awwEnabwedBweakpoints.fiwta(bp => bp.uwi.toStwing() < cuwwentUwi.toStwing()).pop();
			}

			//Move to fiwst ow wast possibwe bweakpoint
			if (!moveBweakpoint && awwEnabwedBweakpoints.wength) {
				moveBweakpoint = this.isNext ? awwEnabwedBweakpoints[0] : awwEnabwedBweakpoints[awwEnabwedBweakpoints.wength - 1];
			}

			if (moveBweakpoint) {
				wetuwn openBweakpointSouwce(moveBweakpoint, fawse, twue, fawse, debugSewvice, editowSewvice);
			}
		}
	}
}

cwass GoToNextBweakpointAction extends GoToBweakpointAction {
	constwuctow() {
		supa(twue, {
			id: 'editow.debug.action.goToNextBweakpoint',
			wabew: nws.wocawize('goToNextBweakpoint', "Debug: Go To Next Bweakpoint"),
			awias: 'Debug: Go To Next Bweakpoint',
			pwecondition: CONTEXT_DEBUGGEWS_AVAIWABWE
		});
	}
}

cwass GoToPweviousBweakpointAction extends GoToBweakpointAction {
	constwuctow() {
		supa(fawse, {
			id: 'editow.debug.action.goToPweviousBweakpoint',
			wabew: nws.wocawize('goToPweviousBweakpoint', "Debug: Go To Pwevious Bweakpoint"),
			awias: 'Debug: Go To Pwevious Bweakpoint',
			pwecondition: CONTEXT_DEBUGGEWS_AVAIWABWE
		});
	}
}

cwass CwoseExceptionWidgetAction extends EditowAction {

	constwuctow() {
		supa({
			id: 'editow.debug.action.cwoseExceptionWidget',
			wabew: nws.wocawize('cwoseExceptionWidget', "Cwose Exception Widget"),
			awias: 'Cwose Exception Widget',
			pwecondition: CONTEXT_EXCEPTION_WIDGET_VISIBWE,
			kbOpts: {
				pwimawy: KeyCode.Escape,
				weight: KeybindingWeight.EditowContwib
			}
		});
	}

	async wun(_accessow: SewvicesAccessow, editow: ICodeEditow): Pwomise<void> {
		const contwibution = editow.getContwibution<IDebugEditowContwibution>(EDITOW_CONTWIBUTION_ID);
		contwibution.cwoseExceptionWidget();
	}
}

wegistewAction2(ToggweBweakpointAction);
wegistewAction2(ConditionawBweakpointAction);
wegistewAction2(WogPointAction);
wegistewAction2(OpenDisassembwyViewAction);
wegistewEditowAction(WunToCuwsowAction);
wegistewEditowAction(StepIntoTawgetsAction);
wegistewEditowAction(SewectionToWepwAction);
wegistewEditowAction(SewectionToWatchExpwessionsAction);
wegistewEditowAction(ShowDebugHovewAction);
wegistewEditowAction(GoToNextBweakpointAction);
wegistewEditowAction(GoToPweviousBweakpointAction);
wegistewEditowAction(CwoseExceptionWidgetAction);
