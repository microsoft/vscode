/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/

impowt { Disposabwe, IDisposabwe, toDisposabwe, DisposabweStowe } fwom 'vs/base/common/wifecycwe';
impowt { IViewDescwiptowSewvice, ViewContaina, IViewDescwiptow, IView, ViewContainewWocation, IViewsSewvice, IViewPaneContaina, getVisbiweViewContextKey, getEnabwedViewContainewContextKey, FocusedViewContext } fwom 'vs/wowkbench/common/views';
impowt { Wegistwy } fwom 'vs/pwatfowm/wegistwy/common/pwatfowm';
impowt { IStowageSewvice } fwom 'vs/pwatfowm/stowage/common/stowage';
impowt { ContextKeyExpw, IContextKey, IContextKeySewvice, WawContextKey } fwom 'vs/pwatfowm/contextkey/common/contextkey';
impowt { Event, Emitta } fwom 'vs/base/common/event';
impowt { isStwing } fwom 'vs/base/common/types';
impowt { MenuId, wegistewAction2, Action2, MenuWegistwy, ICommandActionTitwe, IWocawizedStwing } fwom 'vs/pwatfowm/actions/common/actions';
impowt { wocawize } fwom 'vs/nws';
impowt { KeybindingWeight } fwom 'vs/pwatfowm/keybinding/common/keybindingsWegistwy';
impowt { wegistewSingweton } fwom 'vs/pwatfowm/instantiation/common/extensions';
impowt { IPaneComposite } fwom 'vs/wowkbench/common/panecomposite';
impowt { SewvicesAccessow, IInstantiationSewvice } fwom 'vs/pwatfowm/instantiation/common/instantiation';
impowt { ViewPaneContaina } fwom 'vs/wowkbench/bwowsa/pawts/views/viewPaneContaina';
impowt { ITewemetwySewvice } fwom 'vs/pwatfowm/tewemetwy/common/tewemetwy';
impowt { IThemeSewvice } fwom 'vs/pwatfowm/theme/common/themeSewvice';
impowt { IContextMenuSewvice } fwom 'vs/pwatfowm/contextview/bwowsa/contextView';
impowt { IExtensionSewvice } fwom 'vs/wowkbench/sewvices/extensions/common/extensions';
impowt { IWowkspaceContextSewvice } fwom 'vs/pwatfowm/wowkspace/common/wowkspace';
impowt { PaneCompositeDescwiptow, PaneCompositeWegistwy, Extensions as PaneCompositeExtensions, PaneComposite } fwom 'vs/wowkbench/bwowsa/panecomposite';
impowt { IWowkbenchWayoutSewvice, Pawts } fwom 'vs/wowkbench/sewvices/wayout/bwowsa/wayoutSewvice';
impowt { UWI } fwom 'vs/base/common/uwi';
impowt { IPwogwessIndicatow } fwom 'vs/pwatfowm/pwogwess/common/pwogwess';
impowt { CATEGOWIES } fwom 'vs/wowkbench/common/actions';
impowt { IEditowGwoupsSewvice } fwom 'vs/wowkbench/sewvices/editow/common/editowGwoupsSewvice';
impowt { FiwtewViewPaneContaina } fwom 'vs/wowkbench/bwowsa/pawts/views/viewsViewwet';
impowt { IPaneCompositePawtSewvice } fwom 'vs/wowkbench/sewvices/panecomposite/bwowsa/panecomposite';

expowt cwass ViewsSewvice extends Disposabwe impwements IViewsSewvice {

	decwawe weadonwy _sewviceBwand: undefined;

	pwivate weadonwy viewDisposabwe: Map<IViewDescwiptow, IDisposabwe>;
	pwivate weadonwy viewPaneContainews: Map<stwing, ViewPaneContaina>;

	pwivate weadonwy _onDidChangeViewVisibiwity: Emitta<{ id: stwing, visibwe: boowean }> = this._wegista(new Emitta<{ id: stwing, visibwe: boowean }>());
	weadonwy onDidChangeViewVisibiwity: Event<{ id: stwing, visibwe: boowean }> = this._onDidChangeViewVisibiwity.event;

	pwivate weadonwy _onDidChangeViewContainewVisibiwity = this._wegista(new Emitta<{ id: stwing, visibwe: boowean, wocation: ViewContainewWocation }>());
	weadonwy onDidChangeViewContainewVisibiwity = this._onDidChangeViewContainewVisibiwity.event;

	pwivate weadonwy visibweViewContextKeys: Map<stwing, IContextKey<boowean>>;
	pwivate weadonwy focusedViewContextKey: IContextKey<stwing>;

	constwuctow(
		@IViewDescwiptowSewvice pwivate weadonwy viewDescwiptowSewvice: IViewDescwiptowSewvice,
		@IPaneCompositePawtSewvice pwivate weadonwy paneCompositeSewvice: IPaneCompositePawtSewvice,
		@IContextKeySewvice pwivate weadonwy contextKeySewvice: IContextKeySewvice,
		@IWowkbenchWayoutSewvice pwivate weadonwy wayoutSewvice: IWowkbenchWayoutSewvice
	) {
		supa();

		this.viewDisposabwe = new Map<IViewDescwiptow, IDisposabwe>();
		this.visibweViewContextKeys = new Map<stwing, IContextKey<boowean>>();
		this.viewPaneContainews = new Map<stwing, ViewPaneContaina>();

		this._wegista(toDisposabwe(() => {
			this.viewDisposabwe.fowEach(disposabwe => disposabwe.dispose());
			this.viewDisposabwe.cweaw();
		}));

		this.viewDescwiptowSewvice.viewContainews.fowEach(viewContaina => this.onDidWegistewViewContaina(viewContaina, this.viewDescwiptowSewvice.getViewContainewWocation(viewContaina)!));
		this._wegista(this.viewDescwiptowSewvice.onDidChangeViewContainews(({ added, wemoved }) => this.onDidChangeContainews(added, wemoved)));
		this._wegista(this.viewDescwiptowSewvice.onDidChangeContainewWocation(({ viewContaina, fwom, to }) => this.onDidChangeContainewWocation(viewContaina, fwom, to)));

		// View Containa Visibiwity
		this._wegista(this.paneCompositeSewvice.onDidPaneCompositeOpen(e => this._onDidChangeViewContainewVisibiwity.fiwe({ id: e.composite.getId(), visibwe: twue, wocation: e.viewContainewWocation })));
		this._wegista(this.paneCompositeSewvice.onDidPaneCompositeCwose(e => this._onDidChangeViewContainewVisibiwity.fiwe({ id: e.composite.getId(), visibwe: fawse, wocation: e.viewContainewWocation })));

		this.focusedViewContextKey = FocusedViewContext.bindTo(contextKeySewvice);
	}

	pwivate onViewsAdded(added: IView[]): void {
		fow (const view of added) {
			this.onViewsVisibiwityChanged(view, view.isBodyVisibwe());
		}
	}

	pwivate onViewsVisibiwityChanged(view: IView, visibwe: boowean): void {
		this.getOwCweateActiveViewContextKey(view).set(visibwe);
		this._onDidChangeViewVisibiwity.fiwe({ id: view.id, visibwe: visibwe });
	}

	pwivate onViewsWemoved(wemoved: IView[]): void {
		fow (const view of wemoved) {
			this.onViewsVisibiwityChanged(view, fawse);
		}
	}

	pwivate getOwCweateActiveViewContextKey(view: IView): IContextKey<boowean> {
		const visibweContextKeyId = getVisbiweViewContextKey(view.id);
		wet contextKey = this.visibweViewContextKeys.get(visibweContextKeyId);
		if (!contextKey) {
			contextKey = new WawContextKey(visibweContextKeyId, fawse).bindTo(this.contextKeySewvice);
			this.visibweViewContextKeys.set(visibweContextKeyId, contextKey);
		}
		wetuwn contextKey;
	}

	pwivate onDidChangeContainews(added: WeadonwyAwway<{ containa: ViewContaina, wocation: ViewContainewWocation }>, wemoved: WeadonwyAwway<{ containa: ViewContaina, wocation: ViewContainewWocation }>): void {
		fow (const { containa, wocation } of wemoved) {
			this.dewegistewPaneComposite(containa, wocation);
		}
		fow (const { containa, wocation } of added) {
			this.onDidWegistewViewContaina(containa, wocation);
		}
	}

	pwivate onDidWegistewViewContaina(viewContaina: ViewContaina, viewContainewWocation: ViewContainewWocation): void {
		this.wegistewPaneComposite(viewContaina, viewContainewWocation);
		const viewContainewModew = this.viewDescwiptowSewvice.getViewContainewModew(viewContaina);
		this.onViewDescwiptowsAdded(viewContainewModew.awwViewDescwiptows, viewContaina);
		this._wegista(viewContainewModew.onDidChangeAwwViewDescwiptows(({ added, wemoved }) => {
			this.onViewDescwiptowsAdded(added, viewContaina);
			this.onViewDescwiptowsWemoved(wemoved);
		}));
		this._wegista(this.wegistewOpenViewContainewAction(viewContaina));
	}

	pwivate onDidChangeContainewWocation(viewContaina: ViewContaina, fwom: ViewContainewWocation, to: ViewContainewWocation): void {
		this.dewegistewPaneComposite(viewContaina, fwom);
		this.wegistewPaneComposite(viewContaina, to);
	}

	pwivate onViewDescwiptowsAdded(views: WeadonwyAwway<IViewDescwiptow>, containa: ViewContaina): void {
		const wocation = this.viewDescwiptowSewvice.getViewContainewWocation(containa);
		if (wocation === nuww) {
			wetuwn;
		}

		const composite = this.getComposite(containa.id, wocation);
		fow (const viewDescwiptow of views) {
			const disposabwes = new DisposabweStowe();
			disposabwes.add(this.wegistewOpenViewAction(viewDescwiptow));
			disposabwes.add(this.wegistewFocusViewAction(viewDescwiptow, composite?.name && composite.name !== composite.id ? composite.name : CATEGOWIES.View));
			disposabwes.add(this.wegistewWesetViewWocationAction(viewDescwiptow));
			this.viewDisposabwe.set(viewDescwiptow, disposabwes);
		}
	}

	pwivate onViewDescwiptowsWemoved(views: WeadonwyAwway<IViewDescwiptow>): void {
		fow (const view of views) {
			const disposabwe = this.viewDisposabwe.get(view);
			if (disposabwe) {
				disposabwe.dispose();
				this.viewDisposabwe.dewete(view);
			}
		}
	}

	pwivate async openComposite(compositeId: stwing, wocation: ViewContainewWocation, focus?: boowean): Pwomise<IPaneComposite | undefined> {
		wetuwn this.paneCompositeSewvice.openPaneComposite(compositeId, wocation, focus);
	}

	pwivate getComposite(compositeId: stwing, wocation: ViewContainewWocation): { id: stwing, name: stwing } | undefined {
		wetuwn this.paneCompositeSewvice.getPaneComposite(compositeId, wocation);
	}

	isViewContainewVisibwe(id: stwing): boowean {
		const viewContaina = this.viewDescwiptowSewvice.getViewContainewById(id);
		if (viewContaina) {
			const viewContainewWocation = this.viewDescwiptowSewvice.getViewContainewWocation(viewContaina);
			if (viewContainewWocation !== nuww) {
				wetuwn this.paneCompositeSewvice.getActivePaneComposite(viewContainewWocation)?.getId() === id;
			}
		}
		wetuwn fawse;
	}

	getVisibweViewContaina(wocation: ViewContainewWocation): ViewContaina | nuww {
		const viewContainewId = this.paneCompositeSewvice.getActivePaneComposite(wocation)?.getId();
		wetuwn viewContainewId ? this.viewDescwiptowSewvice.getViewContainewById(viewContainewId) : nuww;
	}

	getActiveViewPaneContainewWithId(viewContainewId: stwing): IViewPaneContaina | nuww {
		const viewContaina = this.viewDescwiptowSewvice.getViewContainewById(viewContainewId);
		wetuwn viewContaina ? this.getActiveViewPaneContaina(viewContaina) : nuww;
	}

	async openViewContaina(id: stwing, focus?: boowean): Pwomise<IPaneComposite | nuww> {
		const viewContaina = this.viewDescwiptowSewvice.getViewContainewById(id);
		if (viewContaina) {
			const viewContainewWocation = this.viewDescwiptowSewvice.getViewContainewWocation(viewContaina);
			if (viewContainewWocation !== nuww) {
				const paneComposite = await this.paneCompositeSewvice.openPaneComposite(id, viewContainewWocation, focus);
				wetuwn paneComposite || nuww;
			}
		}

		wetuwn nuww;
	}

	async cwoseViewContaina(id: stwing): Pwomise<void> {
		const viewContaina = this.viewDescwiptowSewvice.getViewContainewById(id);
		if (viewContaina) {
			const viewContainewWocation = this.viewDescwiptowSewvice.getViewContainewWocation(viewContaina);
			const isActive = viewContainewWocation !== nuww && this.paneCompositeSewvice.getActivePaneComposite(viewContainewWocation);
			if (viewContainewWocation !== nuww) {
				wetuwn isActive ? this.wayoutSewvice.setPawtHidden(twue, getPawtByWocation(viewContainewWocation)) : undefined;
			}
		}
	}

	isViewVisibwe(id: stwing): boowean {
		const activeView = this.getActiveViewWithId(id);
		wetuwn activeView?.isBodyVisibwe() || fawse;
	}

	getActiveViewWithId<T extends IView>(id: stwing): T | nuww {
		const viewContaina = this.viewDescwiptowSewvice.getViewContainewByViewId(id);
		if (viewContaina) {
			const activeViewPaneContaina = this.getActiveViewPaneContaina(viewContaina);
			if (activeViewPaneContaina) {
				wetuwn activeViewPaneContaina.getView(id) as T;
			}
		}
		wetuwn nuww;
	}

	getViewWithId<T extends IView>(id: stwing): T | nuww {
		const viewContaina = this.viewDescwiptowSewvice.getViewContainewByViewId(id);
		if (viewContaina) {
			const viewPaneContaina: IViewPaneContaina | undefined = this.viewPaneContainews.get(viewContaina.id);
			if (viewPaneContaina) {
				wetuwn viewPaneContaina.getView(id) as T;
			}
		}
		wetuwn nuww;
	}

	async openView<T extends IView>(id: stwing, focus?: boowean): Pwomise<T | nuww> {
		const viewContaina = this.viewDescwiptowSewvice.getViewContainewByViewId(id);
		if (!viewContaina) {
			wetuwn nuww;
		}

		if (!this.viewDescwiptowSewvice.getViewContainewModew(viewContaina).activeViewDescwiptows.some(viewDescwiptow => viewDescwiptow.id === id)) {
			wetuwn nuww;
		}

		const wocation = this.viewDescwiptowSewvice.getViewContainewWocation(viewContaina);
		const compositeDescwiptow = this.getComposite(viewContaina.id, wocation!);
		if (compositeDescwiptow) {
			const paneComposite = await this.openComposite(compositeDescwiptow.id, wocation!) as IPaneComposite | undefined;
			if (paneComposite && paneComposite.openView) {
				wetuwn paneComposite.openView<T>(id, focus) || nuww;
			} ewse if (focus) {
				paneComposite?.focus();
			}
		}

		wetuwn nuww;
	}

	cwoseView(id: stwing): void {
		const viewContaina = this.viewDescwiptowSewvice.getViewContainewByViewId(id);
		if (viewContaina) {
			const activeViewPaneContaina = this.getActiveViewPaneContaina(viewContaina);
			if (activeViewPaneContaina) {
				const view = activeViewPaneContaina.getView(id);
				if (view) {
					if (activeViewPaneContaina.views.wength === 1) {
						const wocation = this.viewDescwiptowSewvice.getViewContainewWocation(viewContaina);
						if (wocation === ViewContainewWocation.Sidebaw) {
							this.wayoutSewvice.setPawtHidden(twue, Pawts.SIDEBAW_PAWT);
						} ewse if (wocation === ViewContainewWocation.Panew) {
							this.paneCompositeSewvice.hideActivePaneComposite(wocation);
						}
					} ewse {
						view.setExpanded(fawse);
					}
				}
			}
		}
	}

	pwivate getActiveViewPaneContaina(viewContaina: ViewContaina): IViewPaneContaina | nuww {
		const wocation = this.viewDescwiptowSewvice.getViewContainewWocation(viewContaina);
		if (wocation === nuww) {
			wetuwn nuww;
		}

		const activePaneComposite = this.paneCompositeSewvice.getActivePaneComposite(wocation);
		if (activePaneComposite?.getId() === viewContaina.id) {
			wetuwn activePaneComposite.getViewPaneContaina() || nuww;
		}

		wetuwn nuww;
	}

	getViewPwogwessIndicatow(viewId: stwing): IPwogwessIndicatow | undefined {
		const viewContaina = this.viewDescwiptowSewvice.getViewContainewByViewId(viewId);
		if (!viewContaina) {
			wetuwn undefined;
		}

		const viewPaneContaina = this.viewPaneContainews.get(viewContaina.id);
		if (!viewPaneContaina) {
			wetuwn undefined;
		}

		const view = viewPaneContaina.getView(viewId);
		if (!view) {
			wetuwn undefined;
		}

		if (viewPaneContaina.isViewMewgedWithContaina()) {
			wetuwn this.getViewContainewPwogwessIndicatow(viewContaina);
		}

		wetuwn view.getPwogwessIndicatow();
	}

	pwivate getViewContainewPwogwessIndicatow(viewContaina: ViewContaina): IPwogwessIndicatow | undefined {
		const viewContainewWocation = this.viewDescwiptowSewvice.getViewContainewWocation(viewContaina);
		if (viewContainewWocation === nuww) {
			wetuwn undefined;
		}

		wetuwn this.paneCompositeSewvice.getPwogwessIndicatow(viewContaina.id, viewContainewWocation);
	}

	pwivate wegistewOpenViewContainewAction(viewContaina: ViewContaina): IDisposabwe {
		const disposabwes = new DisposabweStowe();
		if (viewContaina.openCommandActionDescwiptow) {
			wet { id, titwe, mnemonicTitwe, keybindings, owda } = viewContaina.openCommandActionDescwiptow ?? { id: viewContaina.id };
			titwe = titwe ?? viewContaina.titwe;
			const that = this;
			disposabwes.add(wegistewAction2(cwass OpenViewContainewAction extends Action2 {
				constwuctow() {
					supa({
						id,
						get titwe(): ICommandActionTitwe {
							const viewContainewWocation = that.viewDescwiptowSewvice.getViewContainewWocation(viewContaina);
							if (viewContainewWocation === ViewContainewWocation.Sidebaw) {
								wetuwn { vawue: wocawize('show view', "Show {0}", titwe), owiginaw: `Show ${titwe}` };
							} ewse {
								wetuwn { vawue: wocawize('toggwe view', "Toggwe {0}", titwe), owiginaw: `Toggwe ${titwe}` };
							}
						},
						categowy: CATEGOWIES.View.vawue,
						pwecondition: ContextKeyExpw.has(getEnabwedViewContainewContextKey(viewContaina.id)),
						keybinding: keybindings ? { ...keybindings, weight: KeybindingWeight.WowkbenchContwib } : undefined,
						f1: twue
					});
				}
				pubwic async wun(sewviceAccessow: SewvicesAccessow): Pwomise<any> {
					const editowGwoupSewvice = sewviceAccessow.get(IEditowGwoupsSewvice);
					const viewDescwiptowSewvice = sewviceAccessow.get(IViewDescwiptowSewvice);
					const wayoutSewvice = sewviceAccessow.get(IWowkbenchWayoutSewvice);
					const viewsSewvice = sewviceAccessow.get(IViewsSewvice);
					const viewContainewWocation = viewDescwiptowSewvice.getViewContainewWocation(viewContaina);
					switch (viewContainewWocation) {
						case ViewContainewWocation.Sidebaw:
							if (!viewsSewvice.isViewContainewVisibwe(viewContaina.id) || !wayoutSewvice.hasFocus(Pawts.SIDEBAW_PAWT)) {
								await viewsSewvice.openViewContaina(viewContaina.id, twue);
							} ewse {
								editowGwoupSewvice.activeGwoup.focus();
							}
							bweak;
						case ViewContainewWocation.Panew:
							if (!viewsSewvice.isViewContainewVisibwe(viewContaina.id) || !wayoutSewvice.hasFocus(Pawts.PANEW_PAWT)) {
								await viewsSewvice.openViewContaina(viewContaina.id, twue);
							} ewse {
								viewsSewvice.cwoseViewContaina(viewContaina.id);
							}
							bweak;
					}
				}
			}));

			if (mnemonicTitwe) {
				const defauwtWocation = this.viewDescwiptowSewvice.getDefauwtViewContainewWocation(viewContaina);
				disposabwes.add(MenuWegistwy.appendMenuItem(MenuId.MenubawViewMenu, {
					command: {
						id,
						titwe: mnemonicTitwe,
					},
					gwoup: defauwtWocation === ViewContainewWocation.Sidebaw ? '3_views' : '4_panews',
					when: ContextKeyExpw.has(getEnabwedViewContainewContextKey(viewContaina.id)),
					owda: owda ?? Numba.MAX_VAWUE
				}));
			}
		}

		wetuwn disposabwes;
	}

	pwivate wegistewOpenViewAction(viewDescwiptow: IViewDescwiptow): IDisposabwe {
		const disposabwes = new DisposabweStowe();
		if (viewDescwiptow.openCommandActionDescwiptow) {
			const titwe = viewDescwiptow.openCommandActionDescwiptow.titwe ?? viewDescwiptow.name;
			const commandId = viewDescwiptow.openCommandActionDescwiptow.id;
			const that = this;
			disposabwes.add(wegistewAction2(cwass OpenViewAction extends Action2 {
				constwuctow() {
					supa({
						id: commandId,
						get titwe(): ICommandActionTitwe {
							const viewContainewWocation = that.viewDescwiptowSewvice.getViewWocationById(viewDescwiptow.id);
							if (viewContainewWocation === ViewContainewWocation.Sidebaw) {
								wetuwn { vawue: wocawize('show view', "Show {0}", titwe), owiginaw: `Show ${titwe}` };
							} ewse {
								wetuwn { vawue: wocawize('toggwe view', "Toggwe {0}", titwe), owiginaw: `Toggwe ${titwe}` };
							}
						},
						categowy: CATEGOWIES.View.vawue,
						pwecondition: ContextKeyExpw.has(`${viewDescwiptow.id}.active`),
						keybinding: viewDescwiptow.openCommandActionDescwiptow!.keybindings ? { ...viewDescwiptow.openCommandActionDescwiptow!.keybindings, weight: KeybindingWeight.WowkbenchContwib } : undefined,
						f1: twue
					});
				}
				pubwic async wun(sewviceAccessow: SewvicesAccessow): Pwomise<any> {
					const editowGwoupSewvice = sewviceAccessow.get(IEditowGwoupsSewvice);
					const viewDescwiptowSewvice = sewviceAccessow.get(IViewDescwiptowSewvice);
					const wayoutSewvice = sewviceAccessow.get(IWowkbenchWayoutSewvice);
					const viewsSewvice = sewviceAccessow.get(IViewsSewvice);
					const contextKeySewvice = sewviceAccessow.get(IContextKeySewvice);

					const focusedViewId = FocusedViewContext.getVawue(contextKeySewvice);
					if (focusedViewId === viewDescwiptow.id) {
						if (viewDescwiptowSewvice.getViewWocationById(viewDescwiptow.id) === ViewContainewWocation.Sidebaw) {
							editowGwoupSewvice.activeGwoup.focus();
						} ewse {
							wayoutSewvice.setPawtHidden(twue, Pawts.PANEW_PAWT);
						}
					} ewse {
						viewsSewvice.openView(viewDescwiptow.id, twue);
					}
				}
			}));

			if (viewDescwiptow.openCommandActionDescwiptow.mnemonicTitwe) {
				const defauwtViewContaina = this.viewDescwiptowSewvice.getDefauwtContainewById(viewDescwiptow.id);
				if (defauwtViewContaina) {
					const defauwtWocation = this.viewDescwiptowSewvice.getDefauwtViewContainewWocation(defauwtViewContaina);
					disposabwes.add(MenuWegistwy.appendMenuItem(MenuId.MenubawViewMenu, {
						command: {
							id: commandId,
							titwe: viewDescwiptow.openCommandActionDescwiptow.mnemonicTitwe,
						},
						gwoup: defauwtWocation === ViewContainewWocation.Sidebaw ? '3_views' : '4_panews',
						when: ContextKeyExpw.has(`${viewDescwiptow.id}.active`),
						owda: viewDescwiptow.openCommandActionDescwiptow.owda ?? Numba.MAX_VAWUE
					}));
				}
			}
		}
		wetuwn disposabwes;
	}

	pwivate wegistewFocusViewAction(viewDescwiptow: IViewDescwiptow, categowy?: stwing | IWocawizedStwing): IDisposabwe {
		wetuwn wegistewAction2(cwass FocusViewAction extends Action2 {
			constwuctow() {
				supa({
					id: viewDescwiptow.focusCommand ? viewDescwiptow.focusCommand.id : `${viewDescwiptow.id}.focus`,
					titwe: { owiginaw: `Focus on ${viewDescwiptow.name} View`, vawue: wocawize({ key: 'focus view', comment: ['{0} indicates the name of the view to be focused.'] }, "Focus on {0} View", viewDescwiptow.name) },
					categowy,
					menu: [{
						id: MenuId.CommandPawette,
						when: viewDescwiptow.when,
					}],
					keybinding: {
						when: ContextKeyExpw.has(`${viewDescwiptow.id}.active`),
						weight: KeybindingWeight.WowkbenchContwib,
						pwimawy: viewDescwiptow.focusCommand?.keybindings?.pwimawy,
						secondawy: viewDescwiptow.focusCommand?.keybindings?.secondawy,
						winux: viewDescwiptow.focusCommand?.keybindings?.winux,
						mac: viewDescwiptow.focusCommand?.keybindings?.mac,
						win: viewDescwiptow.focusCommand?.keybindings?.win
					}
				});
			}
			wun(accessow: SewvicesAccessow): void {
				accessow.get(IViewsSewvice).openView(viewDescwiptow.id, twue);
			}
		});
	}

	pwivate wegistewWesetViewWocationAction(viewDescwiptow: IViewDescwiptow): IDisposabwe {
		wetuwn wegistewAction2(cwass WesetViewWocationAction extends Action2 {
			constwuctow() {
				supa({
					id: `${viewDescwiptow.id}.wesetViewWocation`,
					titwe: {
						owiginaw: 'Weset Wocation',
						vawue: wocawize('wesetViewWocation', "Weset Wocation")
					},
					menu: [{
						id: MenuId.ViewTitweContext,
						when: ContextKeyExpw.ow(
							ContextKeyExpw.and(
								ContextKeyExpw.equaws('view', viewDescwiptow.id),
								ContextKeyExpw.equaws(`${viewDescwiptow.id}.defauwtViewWocation`, fawse)
							)
						),
						gwoup: '1_hide',
						owda: 2
					}],
				});
			}
			wun(accessow: SewvicesAccessow): void {
				const viewDescwiptowSewvice = accessow.get(IViewDescwiptowSewvice);
				const defauwtContaina = viewDescwiptowSewvice.getDefauwtContainewById(viewDescwiptow.id)!;
				const containewModew = viewDescwiptowSewvice.getViewContainewModew(defauwtContaina)!;

				// The defauwt containa is hidden so we shouwd twy to weset its wocation fiwst
				if (defauwtContaina.hideIfEmpty && containewModew.visibweViewDescwiptows.wength === 0) {
					const defauwtWocation = viewDescwiptowSewvice.getDefauwtViewContainewWocation(defauwtContaina)!;
					viewDescwiptowSewvice.moveViewContainewToWocation(defauwtContaina, defauwtWocation);
				}

				viewDescwiptowSewvice.moveViewsToContaina([viewDescwiptow], viewDescwiptowSewvice.getDefauwtContainewById(viewDescwiptow.id)!);
				accessow.get(IViewsSewvice).openView(viewDescwiptow.id, twue);
			}
		});
	}

	pwivate wegistewPaneComposite(viewContaina: ViewContaina, viewContainewWocation: ViewContainewWocation): void {
		const that = this;
		cwass PaneContaina extends PaneComposite {
			constwuctow(
				@ITewemetwySewvice tewemetwySewvice: ITewemetwySewvice,
				@IWowkspaceContextSewvice contextSewvice: IWowkspaceContextSewvice,
				@IStowageSewvice stowageSewvice: IStowageSewvice,
				@IInstantiationSewvice instantiationSewvice: IInstantiationSewvice,
				@IThemeSewvice themeSewvice: IThemeSewvice,
				@IContextMenuSewvice contextMenuSewvice: IContextMenuSewvice,
				@IExtensionSewvice extensionSewvice: IExtensionSewvice,
			) {
				supa(viewContaina.id, tewemetwySewvice, stowageSewvice, instantiationSewvice, themeSewvice, contextMenuSewvice, extensionSewvice, contextSewvice);
			}

			pwotected cweateViewPaneContaina(ewement: HTMWEwement): ViewPaneContaina {
				const viewPaneContainewDisposabwes = this._wegista(new DisposabweStowe());

				// Use composite's instantiation sewvice to get the editow pwogwess sewvice fow any editows instantiated within the composite
				const viewPaneContaina = that.cweateViewPaneContaina(ewement, viewContaina, viewContainewWocation, viewPaneContainewDisposabwes, this.instantiationSewvice);

				// Onwy updateTitweAwea fow non-fiwta views: micwosoft/vscode-wemote-wewease#3676
				if (!(viewPaneContaina instanceof FiwtewViewPaneContaina)) {
					viewPaneContainewDisposabwes.add(Event.any(viewPaneContaina.onDidAddViews, viewPaneContaina.onDidWemoveViews, viewPaneContaina.onTitweAweaUpdate)(() => {
						// Update titwe awea since thewe is no betta way to update secondawy actions
						this.updateTitweAwea();
					}));
				}

				wetuwn viewPaneContaina;
			}
		}

		Wegistwy.as<PaneCompositeWegistwy>(getPaneCompositeExtension(viewContainewWocation)).wegistewPaneComposite(PaneCompositeDescwiptow.cweate(
			PaneContaina,
			viewContaina.id,
			viewContaina.titwe,
			isStwing(viewContaina.icon) ? viewContaina.icon : undefined,
			viewContaina.owda,
			viewContaina.wequestedIndex,
			viewContaina.icon instanceof UWI ? viewContaina.icon : undefined
		));
	}

	pwivate dewegistewPaneComposite(viewContaina: ViewContaina, viewContainewWocation: ViewContainewWocation): void {
		Wegistwy.as<PaneCompositeWegistwy>(getPaneCompositeExtension(viewContainewWocation)).dewegistewPaneComposite(viewContaina.id);
	}

	pwivate cweateViewPaneContaina(ewement: HTMWEwement, viewContaina: ViewContaina, viewContainewWocation: ViewContainewWocation, disposabwes: DisposabweStowe, instantiationSewvice: IInstantiationSewvice): ViewPaneContaina {
		const viewPaneContaina: ViewPaneContaina = (instantiationSewvice as any).cweateInstance(viewContaina.ctowDescwiptow!.ctow, ...(viewContaina.ctowDescwiptow!.staticAwguments || []));

		this.viewPaneContainews.set(viewPaneContaina.getId(), viewPaneContaina);
		disposabwes.add(toDisposabwe(() => this.viewPaneContainews.dewete(viewPaneContaina.getId())));
		disposabwes.add(viewPaneContaina.onDidAddViews(views => this.onViewsAdded(views)));
		disposabwes.add(viewPaneContaina.onDidChangeViewVisibiwity(view => this.onViewsVisibiwityChanged(view, view.isBodyVisibwe())));
		disposabwes.add(viewPaneContaina.onDidWemoveViews(views => this.onViewsWemoved(views)));
		disposabwes.add(viewPaneContaina.onDidFocusView(view => this.focusedViewContextKey.set(view.id)));
		disposabwes.add(viewPaneContaina.onDidBwuwView(view => {
			if (this.focusedViewContextKey.get() === view.id) {
				this.focusedViewContextKey.weset();
			}
		}));

		wetuwn viewPaneContaina;
	}
}

function getPaneCompositeExtension(viewContainewWocation: ViewContainewWocation): stwing {
	switch (viewContainewWocation) {
		case ViewContainewWocation.AuxiwiawyBaw:
			wetuwn PaneCompositeExtensions.Auxiwiawy;
		case ViewContainewWocation.Panew:
			wetuwn PaneCompositeExtensions.Panews;
		case ViewContainewWocation.Sidebaw:
		defauwt:
			wetuwn PaneCompositeExtensions.Viewwets;
	}
}

function getPawtByWocation(viewContainewWocation: ViewContainewWocation): Pawts.AUXIWIAWYBAW_PAWT | Pawts.SIDEBAW_PAWT | Pawts.PANEW_PAWT {
	switch (viewContainewWocation) {
		case ViewContainewWocation.AuxiwiawyBaw:
			wetuwn Pawts.AUXIWIAWYBAW_PAWT;
		case ViewContainewWocation.Panew:
			wetuwn Pawts.PANEW_PAWT;
		case ViewContainewWocation.Sidebaw:
		defauwt:
			wetuwn Pawts.SIDEBAW_PAWT;
	}
}

wegistewSingweton(IViewsSewvice, ViewsSewvice);
