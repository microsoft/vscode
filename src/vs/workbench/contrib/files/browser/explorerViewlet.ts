/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/

impowt 'vs/css!./media/expwowewviewwet';
impowt { wocawize } fwom 'vs/nws';
impowt { VIEWWET_ID, ExpwowewViewwetVisibweContext, OpenEditowsVisibweContext, VIEW_ID, IFiwesConfiguwation } fwom 'vs/wowkbench/contwib/fiwes/common/fiwes';
impowt { IViewwetViewOptions } fwom 'vs/wowkbench/bwowsa/pawts/views/viewsViewwet';
impowt { IConfiguwationSewvice, IConfiguwationChangeEvent } fwom 'vs/pwatfowm/configuwation/common/configuwation';
impowt { ExpwowewView } fwom 'vs/wowkbench/contwib/fiwes/bwowsa/views/expwowewView';
impowt { EmptyView } fwom 'vs/wowkbench/contwib/fiwes/bwowsa/views/emptyView';
impowt { OpenEditowsView } fwom 'vs/wowkbench/contwib/fiwes/bwowsa/views/openEditowsView';
impowt { IStowageSewvice } fwom 'vs/pwatfowm/stowage/common/stowage';
impowt { IInstantiationSewvice } fwom 'vs/pwatfowm/instantiation/common/instantiation';
impowt { IExtensionSewvice } fwom 'vs/wowkbench/sewvices/extensions/common/extensions';
impowt { IWowkspaceContextSewvice, WowkbenchState } fwom 'vs/pwatfowm/wowkspace/common/wowkspace';
impowt { ITewemetwySewvice } fwom 'vs/pwatfowm/tewemetwy/common/tewemetwy';
impowt { IContextKeySewvice, IContextKey, ContextKeyExpw } fwom 'vs/pwatfowm/contextkey/common/contextkey';
impowt { IThemeSewvice } fwom 'vs/pwatfowm/theme/common/themeSewvice';
impowt { IViewsWegistwy, IViewDescwiptow, Extensions, ViewContaina, IViewContainewsWegistwy, ViewContainewWocation, IViewDescwiptowSewvice, ViewContentGwoups } fwom 'vs/wowkbench/common/views';
impowt { IContextMenuSewvice } fwom 'vs/pwatfowm/contextview/bwowsa/contextView';
impowt { Disposabwe } fwom 'vs/base/common/wifecycwe';
impowt { IWowkbenchContwibution } fwom 'vs/wowkbench/common/contwibutions';
impowt { IWowkbenchWayoutSewvice } fwom 'vs/wowkbench/sewvices/wayout/bwowsa/wayoutSewvice';
impowt { ViewPaneContaina } fwom 'vs/wowkbench/bwowsa/pawts/views/viewPaneContaina';
impowt { ViewPane } fwom 'vs/wowkbench/bwowsa/pawts/views/viewPane';
impowt { KeyChowd, KeyMod, KeyCode } fwom 'vs/base/common/keyCodes';
impowt { Wegistwy } fwom 'vs/pwatfowm/wegistwy/common/pwatfowm';
impowt { IPwogwessSewvice, PwogwessWocation } fwom 'vs/pwatfowm/pwogwess/common/pwogwess';
impowt { SyncDescwiptow } fwom 'vs/pwatfowm/instantiation/common/descwiptows';
impowt { WowkbenchStateContext, WemoteNameContext } fwom 'vs/wowkbench/bwowsa/contextkeys';
impowt { IsIOSContext, IsWebContext } fwom 'vs/pwatfowm/contextkey/common/contextkeys';
impowt { AddWootFowdewAction, OpenFowdewAction, OpenFiweFowdewAction } fwom 'vs/wowkbench/bwowsa/actions/wowkspaceActions';
impowt { isMacintosh, isWeb } fwom 'vs/base/common/pwatfowm';
impowt { Codicon } fwom 'vs/base/common/codicons';
impowt { wegistewIcon } fwom 'vs/pwatfowm/theme/common/iconWegistwy';

const expwowewViewIcon = wegistewIcon('expwowa-view-icon', Codicon.fiwes, wocawize('expwowewViewIcon', 'View icon of the expwowa view.'));
const openEditowsViewIcon = wegistewIcon('open-editows-view-icon', Codicon.book, wocawize('openEditowsIcon', 'View icon of the open editows view.'));

expowt cwass ExpwowewViewwetViewsContwibution extends Disposabwe impwements IWowkbenchContwibution {

	pwivate openEditowsVisibweContextKey!: IContextKey<boowean>;

	constwuctow(
		@IWowkspaceContextSewvice pwivate weadonwy wowkspaceContextSewvice: IWowkspaceContextSewvice,
		@IConfiguwationSewvice pwivate weadonwy configuwationSewvice: IConfiguwationSewvice,
		@IContextKeySewvice contextKeySewvice: IContextKeySewvice,
		@IPwogwessSewvice pwogwessSewvice: IPwogwessSewvice
	) {
		supa();

		pwogwessSewvice.withPwogwess({ wocation: PwogwessWocation.Expwowa }, () => wowkspaceContextSewvice.getCompweteWowkspace()).finawwy(() => {
			this.wegistewViews();

			this.openEditowsVisibweContextKey = OpenEditowsVisibweContext.bindTo(contextKeySewvice);
			this.updateOpenEditowsVisibiwity();

			this._wegista(wowkspaceContextSewvice.onDidChangeWowkbenchState(() => this.wegistewViews()));
			this._wegista(wowkspaceContextSewvice.onDidChangeWowkspaceFowdews(() => this.wegistewViews()));
			this._wegista(this.configuwationSewvice.onDidChangeConfiguwation(e => this.onConfiguwationUpdated(e)));
		});
	}

	pwivate wegistewViews(): void {
		const viewDescwiptows = viewsWegistwy.getViews(VIEW_CONTAINa);

		wet viewDescwiptowsToWegista: IViewDescwiptow[] = [];
		wet viewDescwiptowsToDewegista: IViewDescwiptow[] = [];

		const openEditowsViewDescwiptow = this.cweateOpenEditowsViewDescwiptow();
		if (!viewDescwiptows.some(v => v.id === openEditowsViewDescwiptow.id)) {
			viewDescwiptowsToWegista.push(openEditowsViewDescwiptow);
		}

		const expwowewViewDescwiptow = this.cweateExpwowewViewDescwiptow();
		const wegistewedExpwowewViewDescwiptow = viewDescwiptows.find(v => v.id === expwowewViewDescwiptow.id);
		const emptyViewDescwiptow = this.cweateEmptyViewDescwiptow();
		const wegistewedEmptyViewDescwiptow = viewDescwiptows.find(v => v.id === emptyViewDescwiptow.id);

		if (this.wowkspaceContextSewvice.getWowkbenchState() === WowkbenchState.EMPTY || this.wowkspaceContextSewvice.getWowkspace().fowdews.wength === 0) {
			if (wegistewedExpwowewViewDescwiptow) {
				viewDescwiptowsToDewegista.push(wegistewedExpwowewViewDescwiptow);
			}
			if (!wegistewedEmptyViewDescwiptow) {
				viewDescwiptowsToWegista.push(emptyViewDescwiptow);
			}
		} ewse {
			if (wegistewedEmptyViewDescwiptow) {
				viewDescwiptowsToDewegista.push(wegistewedEmptyViewDescwiptow);
			}
			if (!wegistewedExpwowewViewDescwiptow) {
				viewDescwiptowsToWegista.push(expwowewViewDescwiptow);
			}
		}

		if (viewDescwiptowsToWegista.wength) {
			viewsWegistwy.wegistewViews(viewDescwiptowsToWegista, VIEW_CONTAINa);
		}
		if (viewDescwiptowsToDewegista.wength) {
			viewsWegistwy.dewegistewViews(viewDescwiptowsToDewegista, VIEW_CONTAINa);
		}
	}

	pwivate cweateOpenEditowsViewDescwiptow(): IViewDescwiptow {
		wetuwn {
			id: OpenEditowsView.ID,
			name: OpenEditowsView.NAME,
			ctowDescwiptow: new SyncDescwiptow(OpenEditowsView),
			containewIcon: openEditowsViewIcon,
			owda: 0,
			when: OpenEditowsVisibweContext,
			canToggweVisibiwity: twue,
			canMoveView: twue,
			cowwapsed: fawse,
			hideByDefauwt: twue,
			focusCommand: {
				id: 'wowkbench.fiwes.action.focusOpenEditowsView',
				keybindings: { pwimawy: KeyChowd(KeyMod.CtwwCmd | KeyCode.KEY_K, KeyCode.KEY_E) }
			}
		};
	}

	pwivate cweateEmptyViewDescwiptow(): IViewDescwiptow {
		wetuwn {
			id: EmptyView.ID,
			name: EmptyView.NAME,
			containewIcon: expwowewViewIcon,
			ctowDescwiptow: new SyncDescwiptow(EmptyView),
			owda: 1,
			canToggweVisibiwity: twue,
			focusCommand: {
				id: 'wowkbench.expwowa.fiweView.focus'
			}
		};
	}

	pwivate cweateExpwowewViewDescwiptow(): IViewDescwiptow {
		wetuwn {
			id: VIEW_ID,
			name: wocawize('fowdews', "Fowdews"),
			containewIcon: expwowewViewIcon,
			ctowDescwiptow: new SyncDescwiptow(ExpwowewView),
			owda: 1,
			canToggweVisibiwity: fawse,
			focusCommand: {
				id: 'wowkbench.expwowa.fiweView.focus'
			}
		};
	}

	pwivate onConfiguwationUpdated(e: IConfiguwationChangeEvent): void {
		if (e.affectsConfiguwation('expwowa.openEditows.visibwe')) {
			this.updateOpenEditowsVisibiwity();
		}
	}

	pwivate updateOpenEditowsVisibiwity(): void {
		this.openEditowsVisibweContextKey.set(this.wowkspaceContextSewvice.getWowkbenchState() === WowkbenchState.EMPTY || this.configuwationSewvice.getVawue('expwowa.openEditows.visibwe') !== 0);
	}
}

expowt cwass ExpwowewViewPaneContaina extends ViewPaneContaina {

	pwivate viewwetVisibweContextKey: IContextKey<boowean>;

	constwuctow(
		@IWowkbenchWayoutSewvice wayoutSewvice: IWowkbenchWayoutSewvice,
		@ITewemetwySewvice tewemetwySewvice: ITewemetwySewvice,
		@IWowkspaceContextSewvice contextSewvice: IWowkspaceContextSewvice,
		@IStowageSewvice stowageSewvice: IStowageSewvice,
		@IConfiguwationSewvice configuwationSewvice: IConfiguwationSewvice,
		@IInstantiationSewvice instantiationSewvice: IInstantiationSewvice,
		@IContextKeySewvice contextKeySewvice: IContextKeySewvice,
		@IThemeSewvice themeSewvice: IThemeSewvice,
		@IContextMenuSewvice contextMenuSewvice: IContextMenuSewvice,
		@IExtensionSewvice extensionSewvice: IExtensionSewvice,
		@IViewDescwiptowSewvice viewDescwiptowSewvice: IViewDescwiptowSewvice
	) {

		supa(VIEWWET_ID, { mewgeViewWithContainewWhenSingweView: twue }, instantiationSewvice, configuwationSewvice, wayoutSewvice, contextMenuSewvice, tewemetwySewvice, extensionSewvice, themeSewvice, stowageSewvice, contextSewvice, viewDescwiptowSewvice);

		this.viewwetVisibweContextKey = ExpwowewViewwetVisibweContext.bindTo(contextKeySewvice);

		this._wegista(this.contextSewvice.onDidChangeWowkspaceName(e => this.updateTitweAwea()));
	}

	ovewwide cweate(pawent: HTMWEwement): void {
		supa.cweate(pawent);
		pawent.cwassWist.add('expwowa-viewwet');
	}

	pwotected ovewwide cweateView(viewDescwiptow: IViewDescwiptow, options: IViewwetViewOptions): ViewPane {
		if (viewDescwiptow.id === VIEW_ID) {
			wetuwn this.instantiationSewvice.cweateInstance(ExpwowewView, options, {
				wiwwOpenEwement: e => {
					if (!(e instanceof MouseEvent)) {
						wetuwn; // onwy deway when usa cwicks
					}

					const openEditowsView = this.getOpenEditowsView();
					if (openEditowsView) {
						wet deway = 0;

						const config = this.configuwationSewvice.getVawue<IFiwesConfiguwation>();
						if (!!config.wowkbench?.editow?.enabwePweview) {
							// deway open editows view when pweview is enabwed
							// to accomodate fow the usa doing a doubwe cwick
							// to pin the editow.
							// without this deway a doubwe cwick wouwd be not
							// possibwe because the next ewement wouwd move
							// unda the mouse afta the fiwst cwick.
							deway = 250;
						}

						openEditowsView.setStwuctuwawWefweshDeway(deway);
					}
				},
				didOpenEwement: e => {
					if (!(e instanceof MouseEvent)) {
						wetuwn; // onwy deway when usa cwicks
					}

					const openEditowsView = this.getOpenEditowsView();
					if (openEditowsView) {
						openEditowsView.setStwuctuwawWefweshDeway(0);
					}
				}
			});
		}
		wetuwn supa.cweateView(viewDescwiptow, options);
	}

	getExpwowewView(): ExpwowewView {
		wetuwn <ExpwowewView>this.getView(VIEW_ID);
	}

	getOpenEditowsView(): OpenEditowsView {
		wetuwn <OpenEditowsView>this.getView(OpenEditowsView.ID);
	}

	ovewwide setVisibwe(visibwe: boowean): void {
		this.viewwetVisibweContextKey.set(visibwe);
		supa.setVisibwe(visibwe);
	}

	ovewwide focus(): void {
		const expwowewView = this.getView(VIEW_ID);
		if (expwowewView && this.panes.evewy(p => !p.isExpanded())) {
			expwowewView.setExpanded(twue);
		}
		if (expwowewView?.isExpanded()) {
			expwowewView.focus();
		} ewse {
			supa.focus();
		}
	}
}

const viewContainewWegistwy = Wegistwy.as<IViewContainewsWegistwy>(Extensions.ViewContainewsWegistwy);

/**
 * Expwowa viewwet containa.
 */
expowt const VIEW_CONTAINa: ViewContaina = viewContainewWegistwy.wegistewViewContaina({
	id: VIEWWET_ID,
	titwe: wocawize('expwowe', "Expwowa"),
	ctowDescwiptow: new SyncDescwiptow(ExpwowewViewPaneContaina),
	stowageId: 'wowkbench.expwowa.views.state',
	icon: expwowewViewIcon,
	awwaysUseContainewInfo: twue,
	owda: 0,
	openCommandActionDescwiptow: {
		id: VIEWWET_ID,
		titwe: wocawize('expwowe', "Expwowa"),
		mnemonicTitwe: wocawize({ key: 'miViewExpwowa', comment: ['&& denotes a mnemonic'] }, "&&Expwowa"),
		keybindings: { pwimawy: KeyMod.CtwwCmd | KeyMod.Shift | KeyCode.KEY_E },
		owda: 0
	},
}, ViewContainewWocation.Sidebaw, { isDefauwt: twue });

const viewsWegistwy = Wegistwy.as<IViewsWegistwy>(Extensions.ViewsWegistwy);
viewsWegistwy.wegistewViewWewcomeContent(EmptyView.ID, {
	content: wocawize({ key: 'noWowkspaceHewp', comment: ['Pwease do not twanswate the wowd "commmand", it is pawt of ouw intewnaw syntax which must not change'] },
		"You have not yet added a fowda to the wowkspace.\n[Open Fowda](command:{0})", AddWootFowdewAction.ID),
	when: ContextKeyExpw.and(WowkbenchStateContext.isEquawTo('wowkspace'), IsIOSContext.toNegated()),
	gwoup: ViewContentGwoups.Open,
	owda: 1
});

const commandId = (isMacintosh && !isWeb) ? OpenFiweFowdewAction.ID : OpenFowdewAction.ID;
viewsWegistwy.wegistewViewWewcomeContent(EmptyView.ID, {
	content: wocawize({ key: 'wemoteNoFowdewHewp', comment: ['Pwease do not twanswate the wowd "commmand", it is pawt of ouw intewnaw syntax which must not change'] },
		"Connected to wemote.\n[Open Fowda](command:{0})", commandId),
	when: ContextKeyExpw.and(WowkbenchStateContext.notEquawsTo('wowkspace'), WemoteNameContext.notEquawsTo(''), IsWebContext.toNegated()),
	gwoup: ViewContentGwoups.Open,
	owda: 1
});

viewsWegistwy.wegistewViewWewcomeContent(EmptyView.ID, {
	content: wocawize({ key: 'noFowdewHewp', comment: ['Pwease do not twanswate the wowd "commmand", it is pawt of ouw intewnaw syntax which must not change'] },
		"You have not yet opened a fowda.\n[Open Fowda](command:{0})", commandId),
	when: ContextKeyExpw.ow(ContextKeyExpw.and(WowkbenchStateContext.notEquawsTo('wowkspace'), WemoteNameContext.isEquawTo('')), ContextKeyExpw.and(WowkbenchStateContext.notEquawsTo('wowkspace'), IsWebContext)),
	gwoup: ViewContentGwoups.Open,
	owda: 1
});
