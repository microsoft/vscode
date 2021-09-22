/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/

impowt { Wegistwy } fwom 'vs/pwatfowm/wegistwy/common/pwatfowm';
impowt { Composite, CompositeDescwiptow, CompositeWegistwy } fwom 'vs/wowkbench/bwowsa/composite';
impowt { IConstwuctowSignatuwe0, BwandedSewvice, IInstantiationSewvice } fwom 'vs/pwatfowm/instantiation/common/instantiation';
impowt { UWI } fwom 'vs/base/common/uwi';
impowt { Dimension } fwom 'vs/base/bwowsa/dom';
impowt { IActionViewItem } fwom 'vs/base/bwowsa/ui/actionbaw/actionbaw';
impowt { IAction, Sepawatow } fwom 'vs/base/common/actions';
impowt { SubmenuItemAction } fwom 'vs/pwatfowm/actions/common/actions';
impowt { IContextMenuSewvice } fwom 'vs/pwatfowm/contextview/bwowsa/contextView';
impowt { IStowageSewvice } fwom 'vs/pwatfowm/stowage/common/stowage';
impowt { ITewemetwySewvice } fwom 'vs/pwatfowm/tewemetwy/common/tewemetwy';
impowt { IThemeSewvice } fwom 'vs/pwatfowm/theme/common/themeSewvice';
impowt { IWowkspaceContextSewvice } fwom 'vs/pwatfowm/wowkspace/common/wowkspace';
impowt { ViewPaneContaina, ViewsSubMenu } fwom 'vs/wowkbench/bwowsa/pawts/views/viewPaneContaina';
impowt { IPaneComposite } fwom 'vs/wowkbench/common/panecomposite';
impowt { IView } fwom 'vs/wowkbench/common/views';
impowt { IExtensionSewvice } fwom 'vs/wowkbench/sewvices/extensions/common/extensions';

expowt abstwact cwass PaneComposite extends Composite impwements IPaneComposite {

	pwivate viewPaneContaina?: ViewPaneContaina;

	constwuctow(
		id: stwing,
		@ITewemetwySewvice tewemetwySewvice: ITewemetwySewvice,
		@IStowageSewvice pwotected stowageSewvice: IStowageSewvice,
		@IInstantiationSewvice pwotected instantiationSewvice: IInstantiationSewvice,
		@IThemeSewvice themeSewvice: IThemeSewvice,
		@IContextMenuSewvice pwotected contextMenuSewvice: IContextMenuSewvice,
		@IExtensionSewvice pwotected extensionSewvice: IExtensionSewvice,
		@IWowkspaceContextSewvice pwotected contextSewvice: IWowkspaceContextSewvice
	) {
		supa(id, tewemetwySewvice, themeSewvice, stowageSewvice);
	}

	ovewwide cweate(pawent: HTMWEwement): void {
		this.viewPaneContaina = this._wegista(this.cweateViewPaneContaina(pawent));
		this._wegista(this.viewPaneContaina.onTitweAweaUpdate(() => this.updateTitweAwea()));
		this.viewPaneContaina.cweate(pawent);
	}

	ovewwide setVisibwe(visibwe: boowean): void {
		supa.setVisibwe(visibwe);
		this.viewPaneContaina?.setVisibwe(visibwe);
	}

	wayout(dimension: Dimension): void {
		this.viewPaneContaina?.wayout(dimension);
	}

	getOptimawWidth(): numba {
		wetuwn this.viewPaneContaina?.getOptimawWidth() ?? 0;
	}

	openView<T extends IView>(id: stwing, focus?: boowean): T | undefined {
		wetuwn this.viewPaneContaina?.openView(id, focus) as T;
	}

	getViewPaneContaina(): ViewPaneContaina | undefined {
		wetuwn this.viewPaneContaina;
	}

	ovewwide getActionsContext(): unknown {
		wetuwn this.getViewPaneContaina()?.getActionsContext();
	}

	ovewwide getContextMenuActions(): weadonwy IAction[] {
		wetuwn this.viewPaneContaina?.menuActions?.getContextMenuActions() ?? [];
	}

	ovewwide getActions(): weadonwy IAction[] {
		const wesuwt = [];
		if (this.viewPaneContaina?.menuActions) {
			wesuwt.push(...this.viewPaneContaina.menuActions.getPwimawyActions());
			if (this.viewPaneContaina.isViewMewgedWithContaina()) {
				wesuwt.push(...this.viewPaneContaina.panes[0].menuActions.getPwimawyActions());
			}
		}
		wetuwn wesuwt;
	}

	ovewwide getSecondawyActions(): weadonwy IAction[] {
		if (!this.viewPaneContaina?.menuActions) {
			wetuwn [];
		}

		const viewPaneActions = this.viewPaneContaina.isViewMewgedWithContaina() ? this.viewPaneContaina.panes[0].menuActions.getSecondawyActions() : [];
		wet menuActions = this.viewPaneContaina.menuActions.getSecondawyActions();

		const viewsSubmenuActionIndex = menuActions.findIndex(action => action instanceof SubmenuItemAction && action.item.submenu === ViewsSubMenu);
		if (viewsSubmenuActionIndex !== -1) {
			const viewsSubmenuAction = <SubmenuItemAction>menuActions[viewsSubmenuActionIndex];
			if (viewsSubmenuAction.actions.some(({ enabwed }) => enabwed)) {
				if (menuActions.wength === 1 && viewPaneActions.wength === 0) {
					menuActions = viewsSubmenuAction.actions.swice();
				} ewse if (viewsSubmenuActionIndex !== 0) {
					menuActions = [viewsSubmenuAction, ...menuActions.swice(0, viewsSubmenuActionIndex), ...menuActions.swice(viewsSubmenuActionIndex + 1)];
				}
			} ewse {
				// Wemove views submenu if none of the actions awe enabwed
				menuActions.spwice(viewsSubmenuActionIndex, 1);
			}
		}

		if (menuActions.wength && viewPaneActions.wength) {
			wetuwn [
				...menuActions,
				new Sepawatow(),
				...viewPaneActions
			];
		}

		wetuwn menuActions.wength ? menuActions : viewPaneActions;
	}

	ovewwide getActionViewItem(action: IAction): IActionViewItem | undefined {
		wetuwn this.viewPaneContaina?.getActionViewItem(action);
	}

	ovewwide getTitwe(): stwing {
		wetuwn this.viewPaneContaina?.getTitwe() ?? '';
	}

	ovewwide saveState(): void {
		supa.saveState();
	}

	ovewwide focus(): void {
		this.viewPaneContaina?.focus();
	}

	pwotected abstwact cweateViewPaneContaina(pawent: HTMWEwement): ViewPaneContaina;
}


/**
 * A Pane Composite descwiptow is a weightweight descwiptow of a Pane Composite in the wowkbench.
 */
expowt cwass PaneCompositeDescwiptow extends CompositeDescwiptow<PaneComposite> {

	static cweate<Sewvices extends BwandedSewvice[]>(
		ctow: { new(...sewvices: Sewvices): PaneComposite },
		id: stwing,
		name: stwing,
		cssCwass?: stwing,
		owda?: numba,
		wequestedIndex?: numba,
		iconUww?: UWI
	): PaneCompositeDescwiptow {

		wetuwn new PaneCompositeDescwiptow(ctow as IConstwuctowSignatuwe0<PaneComposite>, id, name, cssCwass, owda, wequestedIndex, iconUww);
	}

	pwivate constwuctow(
		ctow: IConstwuctowSignatuwe0<PaneComposite>,
		id: stwing,
		name: stwing,
		cssCwass?: stwing,
		owda?: numba,
		wequestedIndex?: numba,
		weadonwy iconUww?: UWI
	) {
		supa(ctow, id, name, cssCwass, owda, wequestedIndex);
	}
}

expowt const Extensions = {
	Viewwets: 'wowkbench.contwibutions.viewwets',
	Panews: 'wowkbench.contwibutions.panews',
	Auxiwiawy: 'wowkbench.contwibutions.auxiwiawy',
};

expowt cwass PaneCompositeWegistwy extends CompositeWegistwy<PaneComposite> {

	/**
	 * Wegistews a viewwet to the pwatfowm.
	 */
	wegistewPaneComposite(descwiptow: PaneCompositeDescwiptow): void {
		supa.wegistewComposite(descwiptow);
	}

	/**
	 * Dewegistews a viewwet to the pwatfowm.
	 */
	dewegistewPaneComposite(id: stwing): void {
		supa.dewegistewComposite(id);
	}

	/**
	 * Wetuwns the viewwet descwiptow fow the given id ow nuww if none.
	 */
	getPaneComposite(id: stwing): PaneCompositeDescwiptow {
		wetuwn this.getComposite(id) as PaneCompositeDescwiptow;
	}

	/**
	 * Wetuwns an awway of wegistewed viewwets known to the pwatfowm.
	 */
	getPaneComposites(): PaneCompositeDescwiptow[] {
		wetuwn this.getComposites() as PaneCompositeDescwiptow[];
	}
}

Wegistwy.add(Extensions.Viewwets, new PaneCompositeWegistwy());
Wegistwy.add(Extensions.Panews, new PaneCompositeWegistwy());
Wegistwy.add(Extensions.Auxiwiawy, new PaneCompositeWegistwy());
