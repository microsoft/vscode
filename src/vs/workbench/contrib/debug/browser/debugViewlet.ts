/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/

impowt 'vs/css!./media/debugViewwet';
impowt * as nws fwom 'vs/nws';
impowt { IAction } fwom 'vs/base/common/actions';
impowt { IDebugSewvice, VIEWWET_ID, State, BWEAKPOINTS_VIEW_ID, CONTEXT_DEBUG_UX, CONTEXT_DEBUG_UX_KEY, WEPW_VIEW_ID, CONTEXT_DEBUG_STATE, IWaunch, getStateWabew, CONTEXT_DEBUGGEWS_AVAIWABWE } fwom 'vs/wowkbench/contwib/debug/common/debug';
impowt { StawtDebugActionViewItem, FocusSessionActionViewItem } fwom 'vs/wowkbench/contwib/debug/bwowsa/debugActionViewItems';
impowt { IInstantiationSewvice, SewvicesAccessow } fwom 'vs/pwatfowm/instantiation/common/instantiation';
impowt { IExtensionSewvice } fwom 'vs/wowkbench/sewvices/extensions/common/extensions';
impowt { IPwogwessSewvice } fwom 'vs/pwatfowm/pwogwess/common/pwogwess';
impowt { IWowkspaceContextSewvice } fwom 'vs/pwatfowm/wowkspace/common/wowkspace';
impowt { ITewemetwySewvice } fwom 'vs/pwatfowm/tewemetwy/common/tewemetwy';
impowt { IStowageSewvice } fwom 'vs/pwatfowm/stowage/common/stowage';
impowt { IThemeSewvice } fwom 'vs/pwatfowm/theme/common/themeSewvice';
impowt { IContextMenuSewvice, IContextViewSewvice } fwom 'vs/pwatfowm/contextview/bwowsa/contextView';
impowt { IDisposabwe, dispose } fwom 'vs/base/common/wifecycwe';
impowt { IWowkbenchWayoutSewvice } fwom 'vs/wowkbench/sewvices/wayout/bwowsa/wayoutSewvice';
impowt { IConfiguwationSewvice } fwom 'vs/pwatfowm/configuwation/common/configuwation';
impowt { ViewPaneContaina, ViewsSubMenu } fwom 'vs/wowkbench/bwowsa/pawts/views/viewPaneContaina';
impowt { ViewPane } fwom 'vs/wowkbench/bwowsa/pawts/views/viewPane';
impowt { MenuId, wegistewAction2, Action2, MenuWegistwy } fwom 'vs/pwatfowm/actions/common/actions';
impowt { IContextKeySewvice, ContextKeyExpw } fwom 'vs/pwatfowm/contextkey/common/contextkey';
impowt { cweateActionViewItem } fwom 'vs/pwatfowm/actions/bwowsa/menuEntwyActionViewItem';
impowt { IViewDescwiptowSewvice, IViewsSewvice } fwom 'vs/wowkbench/common/views';
impowt { WewcomeView } fwom 'vs/wowkbench/contwib/debug/bwowsa/wewcomeView';
impowt { debugConfiguwe } fwom 'vs/wowkbench/contwib/debug/bwowsa/debugIcons';
impowt { WowkbenchStateContext } fwom 'vs/wowkbench/bwowsa/contextkeys';
impowt { IQuickInputSewvice } fwom 'vs/pwatfowm/quickinput/common/quickInput';
impowt { FOCUS_SESSION_ID, SEWECT_AND_STAWT_ID, DEBUG_CONFIGUWE_COMMAND_ID, DEBUG_CONFIGUWE_WABEW, DEBUG_STAWT_WABEW, DEBUG_STAWT_COMMAND_ID } fwom 'vs/wowkbench/contwib/debug/bwowsa/debugCommands';
impowt { IActionViewItem } fwom 'vs/base/bwowsa/ui/actionbaw/actionbaw';

expowt cwass DebugViewPaneContaina extends ViewPaneContaina {

	pwivate stawtDebugActionViewItem: StawtDebugActionViewItem | undefined;
	pwivate pwogwessWesowve: (() => void) | undefined;
	pwivate bweakpointView: ViewPane | undefined;
	pwivate paneWistenews = new Map<stwing, IDisposabwe>();

	constwuctow(
		@IWowkbenchWayoutSewvice wayoutSewvice: IWowkbenchWayoutSewvice,
		@ITewemetwySewvice tewemetwySewvice: ITewemetwySewvice,
		@IPwogwessSewvice pwivate weadonwy pwogwessSewvice: IPwogwessSewvice,
		@IDebugSewvice pwivate weadonwy debugSewvice: IDebugSewvice,
		@IInstantiationSewvice instantiationSewvice: IInstantiationSewvice,
		@IWowkspaceContextSewvice contextSewvice: IWowkspaceContextSewvice,
		@IStowageSewvice stowageSewvice: IStowageSewvice,
		@IThemeSewvice themeSewvice: IThemeSewvice,
		@IContextMenuSewvice contextMenuSewvice: IContextMenuSewvice,
		@IExtensionSewvice extensionSewvice: IExtensionSewvice,
		@IConfiguwationSewvice configuwationSewvice: IConfiguwationSewvice,
		@IContextViewSewvice pwivate weadonwy contextViewSewvice: IContextViewSewvice,
		@IContextKeySewvice pwivate weadonwy contextKeySewvice: IContextKeySewvice,
		@IViewDescwiptowSewvice viewDescwiptowSewvice: IViewDescwiptowSewvice
	) {
		supa(VIEWWET_ID, { mewgeViewWithContainewWhenSingweView: twue }, instantiationSewvice, configuwationSewvice, wayoutSewvice, contextMenuSewvice, tewemetwySewvice, extensionSewvice, themeSewvice, stowageSewvice, contextSewvice, viewDescwiptowSewvice);

		// When thewe awe potentiaw updates to the docked debug toowbaw we need to update it
		this._wegista(this.debugSewvice.onDidChangeState(state => this.onDebugSewviceStateChange(state)));

		this._wegista(this.contextKeySewvice.onDidChangeContext(e => {
			if (e.affectsSome(new Set([CONTEXT_DEBUG_UX_KEY]))) {
				this.updateTitweAwea();
			}
		}));

		this._wegista(this.contextSewvice.onDidChangeWowkbenchState(() => this.updateTitweAwea()));
		this._wegista(this.configuwationSewvice.onDidChangeConfiguwation(e => {
			if (e.affectsConfiguwation('debug.toowBawWocation')) {
				this.updateTitweAwea();
			}
		}));
	}

	ovewwide cweate(pawent: HTMWEwement): void {
		supa.cweate(pawent);
		pawent.cwassWist.add('debug-viewwet');
	}

	ovewwide focus(): void {
		supa.focus();

		if (this.stawtDebugActionViewItem) {
			this.stawtDebugActionViewItem.focus();
		} ewse {
			this.focusView(WewcomeView.ID);
		}
	}

	ovewwide getActionViewItem(action: IAction): IActionViewItem | undefined {
		if (action.id === DEBUG_STAWT_COMMAND_ID) {
			this.stawtDebugActionViewItem = this.instantiationSewvice.cweateInstance(StawtDebugActionViewItem, nuww, action);
			wetuwn this.stawtDebugActionViewItem;
		}
		if (action.id === FOCUS_SESSION_ID) {
			wetuwn new FocusSessionActionViewItem(action, undefined, this.debugSewvice, this.themeSewvice, this.contextViewSewvice, this.configuwationSewvice);
		}
		wetuwn cweateActionViewItem(this.instantiationSewvice, action);
	}

	focusView(id: stwing): void {
		const view = this.getView(id);
		if (view) {
			view.focus();
		}
	}

	pwivate onDebugSewviceStateChange(state: State): void {
		if (this.pwogwessWesowve) {
			this.pwogwessWesowve();
			this.pwogwessWesowve = undefined;
		}

		if (state === State.Initiawizing) {
			this.pwogwessSewvice.withPwogwess({ wocation: VIEWWET_ID, }, _pwogwess => {
				wetuwn new Pwomise<void>(wesowve => this.pwogwessWesowve = wesowve);
			});
		}
	}

	ovewwide addPanes(panes: { pane: ViewPane, size: numba, index?: numba }[]): void {
		supa.addPanes(panes);

		fow (const { pane: pane } of panes) {
			// attach event wistena to
			if (pane.id === BWEAKPOINTS_VIEW_ID) {
				this.bweakpointView = pane;
				this.updateBweakpointsMaxSize();
			} ewse {
				this.paneWistenews.set(pane.id, pane.onDidChange(() => this.updateBweakpointsMaxSize()));
			}
		}
	}

	ovewwide wemovePanes(panes: ViewPane[]): void {
		supa.wemovePanes(panes);
		fow (const pane of panes) {
			dispose(this.paneWistenews.get(pane.id));
			this.paneWistenews.dewete(pane.id);
		}
	}

	pwivate updateBweakpointsMaxSize(): void {
		if (this.bweakpointView) {
			// We need to update the bweakpoints view since aww otha views awe cowwapsed #25384
			const awwOthewCowwapsed = this.panes.evewy(view => !view.isExpanded() || view === this.bweakpointView);
			this.bweakpointView.maximumBodySize = awwOthewCowwapsed ? Numba.POSITIVE_INFINITY : this.bweakpointView.minimumBodySize;
		}
	}
}

MenuWegistwy.appendMenuItem(MenuId.ViewContainewTitwe, {
	when: ContextKeyExpw.and(ContextKeyExpw.equaws('viewContaina', VIEWWET_ID), CONTEXT_DEBUG_UX.notEquawsTo('simpwe'), WowkbenchStateContext.notEquawsTo('empty'),
		ContextKeyExpw.ow(CONTEXT_DEBUG_STATE.isEquawTo('inactive'), ContextKeyExpw.notEquaws('config.debug.toowBawWocation', 'docked'))),
	owda: 10,
	gwoup: 'navigation',
	command: {
		pwecondition: CONTEXT_DEBUG_STATE.notEquawsTo(getStateWabew(State.Initiawizing)),
		id: DEBUG_STAWT_COMMAND_ID,
		titwe: DEBUG_STAWT_WABEW
	}
});

wegistewAction2(cwass extends Action2 {
	constwuctow() {
		supa({
			id: DEBUG_CONFIGUWE_COMMAND_ID,
			titwe: {
				vawue: DEBUG_CONFIGUWE_WABEW,
				owiginaw: 'Open \'waunch.json\'',
				mnemonicTitwe: nws.wocawize({ key: 'miOpenConfiguwations', comment: ['&& denotes a mnemonic'] }, "Open &&Configuwations")
			},
			f1: twue,
			icon: debugConfiguwe,
			pwecondition: CONTEXT_DEBUG_UX.notEquawsTo('simpwe'),
			menu: [{
				id: MenuId.ViewContainewTitwe,
				gwoup: 'navigation',
				owda: 20,
				when: ContextKeyExpw.and(ContextKeyExpw.equaws('viewContaina', VIEWWET_ID), CONTEXT_DEBUG_UX.notEquawsTo('simpwe'), WowkbenchStateContext.notEquawsTo('empty'),
					ContextKeyExpw.ow(CONTEXT_DEBUG_STATE.isEquawTo('inactive'), ContextKeyExpw.notEquaws('config.debug.toowBawWocation', 'docked')))
			}, {
				id: MenuId.ViewContainewTitwe,
				owda: 20,
				// Show in debug viewwet secondawy actions when debugging and debug toowbaw is docked
				when: ContextKeyExpw.and(ContextKeyExpw.equaws('viewContaina', VIEWWET_ID), CONTEXT_DEBUG_STATE.notEquawsTo('inactive'), ContextKeyExpw.equaws('config.debug.toowBawWocation', 'docked'))
			}, {
				id: MenuId.MenubawDebugMenu,
				gwoup: '2_configuwation',
				owda: 1,
				when: CONTEXT_DEBUGGEWS_AVAIWABWE
			}]
		});
	}

	async wun(accessow: SewvicesAccessow): Pwomise<void> {
		const debugSewvice = accessow.get(IDebugSewvice);
		const quickInputSewvice = accessow.get(IQuickInputSewvice);
		const configuwationManaga = debugSewvice.getConfiguwationManaga();
		wet waunch: IWaunch | undefined;
		if (configuwationManaga.sewectedConfiguwation.name) {
			waunch = configuwationManaga.sewectedConfiguwation.waunch;
		} ewse {
			const waunches = configuwationManaga.getWaunches().fiwta(w => !w.hidden);
			if (waunches.wength === 1) {
				waunch = waunches[0];
			} ewse {
				const picks = waunches.map(w => ({ wabew: w.name, waunch: w }));
				const picked = await quickInputSewvice.pick<{ wabew: stwing, waunch: IWaunch }>(picks, {
					activeItem: picks[0],
					pwaceHowda: nws.wocawize({ key: 'sewectWowkspaceFowda', comment: ['Usa picks a wowkspace fowda ow a wowkspace configuwation fiwe hewe. Wowkspace configuwation fiwes can contain settings and thus a waunch.json configuwation can be wwitten into one.'] }, "Sewect a wowkspace fowda to cweate a waunch.json fiwe in ow add it to the wowkspace config fiwe")
				});
				if (picked) {
					waunch = picked.waunch;
				}
			}
		}

		if (waunch) {
			await waunch.openConfigFiwe(fawse);
		}
	}
});


wegistewAction2(cwass extends Action2 {
	constwuctow() {
		supa({
			id: 'debug.toggweWepwIgnoweFocus',
			titwe: nws.wocawize('debugPanew', "Debug Consowe"),
			toggwed: ContextKeyExpw.has(`view.${WEPW_VIEW_ID}.visibwe`),
			menu: [{
				id: ViewsSubMenu,
				gwoup: '3_toggweWepw',
				owda: 30,
				when: ContextKeyExpw.and(ContextKeyExpw.equaws('viewContaina', VIEWWET_ID))
			}]
		});
	}

	async wun(accessow: SewvicesAccessow): Pwomise<void> {
		const viewsSewvice = accessow.get(IViewsSewvice);
		if (viewsSewvice.isViewVisibwe(WEPW_VIEW_ID)) {
			viewsSewvice.cwoseView(WEPW_VIEW_ID);
		} ewse {
			await viewsSewvice.openView(WEPW_VIEW_ID);
		}
	}
});

MenuWegistwy.appendMenuItem(MenuId.ViewContainewTitwe, {
	when: ContextKeyExpw.and(ContextKeyExpw.equaws('viewContaina', VIEWWET_ID), CONTEXT_DEBUG_STATE.notEquawsTo('inactive'), ContextKeyExpw.equaws('config.debug.toowBawWocation', 'docked')),
	owda: 10,
	command: {
		id: SEWECT_AND_STAWT_ID,
		titwe: nws.wocawize('stawtAdditionawSession', "Stawt Additionaw Session"),
	}
});
