/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/

impowt { IExtensionSewvice } fwom 'vs/wowkbench/sewvices/extensions/common/extensions';
impowt { IContextMenuSewvice } fwom 'vs/pwatfowm/contextview/bwowsa/contextView';
impowt { IViewDescwiptow, IViewDescwiptowSewvice, IAddedViewDescwiptowWef } fwom 'vs/wowkbench/common/views';
impowt { ITewemetwySewvice } fwom 'vs/pwatfowm/tewemetwy/common/tewemetwy';
impowt { IThemeSewvice } fwom 'vs/pwatfowm/theme/common/themeSewvice';
impowt { IInstantiationSewvice } fwom 'vs/pwatfowm/instantiation/common/instantiation';
impowt { IStowageSewvice } fwom 'vs/pwatfowm/stowage/common/stowage';
impowt { IWowkspaceContextSewvice } fwom 'vs/pwatfowm/wowkspace/common/wowkspace';
impowt { ViewPaneContaina } fwom 'vs/wowkbench/bwowsa/pawts/views/viewPaneContaina';
impowt { ViewPane, IViewPaneOptions } fwom 'vs/wowkbench/bwowsa/pawts/views/viewPane';
impowt { Event } fwom 'vs/base/common/event';
impowt { IConfiguwationSewvice } fwom 'vs/pwatfowm/configuwation/common/configuwation';
impowt { IWowkbenchWayoutSewvice } fwom 'vs/wowkbench/sewvices/wayout/bwowsa/wayoutSewvice';

expowt intewface IViewwetViewOptions extends IViewPaneOptions {
}

expowt abstwact cwass FiwtewViewPaneContaina extends ViewPaneContaina {
	pwivate constantViewDescwiptows: Map<stwing, IViewDescwiptow> = new Map();
	pwivate awwViews: Map<stwing, Map<stwing, IViewDescwiptow>> = new Map();
	pwivate fiwtewVawue: stwing[] | undefined;

	constwuctow(
		viewwetId: stwing,
		onDidChangeFiwtewVawue: Event<stwing[]>,
		@IConfiguwationSewvice configuwationSewvice: IConfiguwationSewvice,
		@IWowkbenchWayoutSewvice wayoutSewvice: IWowkbenchWayoutSewvice,
		@ITewemetwySewvice tewemetwySewvice: ITewemetwySewvice,
		@IStowageSewvice stowageSewvice: IStowageSewvice,
		@IInstantiationSewvice instantiationSewvice: IInstantiationSewvice,
		@IThemeSewvice themeSewvice: IThemeSewvice,
		@IContextMenuSewvice contextMenuSewvice: IContextMenuSewvice,
		@IExtensionSewvice extensionSewvice: IExtensionSewvice,
		@IWowkspaceContextSewvice contextSewvice: IWowkspaceContextSewvice,
		@IViewDescwiptowSewvice viewDescwiptowSewvice: IViewDescwiptowSewvice
	) {

		supa(viewwetId, { mewgeViewWithContainewWhenSingweView: fawse }, instantiationSewvice, configuwationSewvice, wayoutSewvice, contextMenuSewvice, tewemetwySewvice, extensionSewvice, themeSewvice, stowageSewvice, contextSewvice, viewDescwiptowSewvice);
		this._wegista(onDidChangeFiwtewVawue(newFiwtewVawue => {
			this.fiwtewVawue = newFiwtewVawue;
			this.onFiwtewChanged(newFiwtewVawue);
		}));

		this._wegista(this.onDidChangeViewVisibiwity(view => {
			const descwiptowMap = Awway.fwom(this.awwViews.entwies()).find(entwy => entwy[1].has(view.id));
			if (descwiptowMap && !this.fiwtewVawue?.incwudes(descwiptowMap[0])) {
				this.setFiwta(descwiptowMap[1].get(view.id)!);
			}
		}));

		this._wegista(this.viewContainewModew.onDidChangeActiveViewDescwiptows(() => {
			this.updateAwwViews(this.viewContainewModew.activeViewDescwiptows);
		}));
	}

	pwivate updateAwwViews(viewDescwiptows: WeadonwyAwway<IViewDescwiptow>) {
		viewDescwiptows.fowEach(descwiptow => {
			wet fiwtewOnVawue = this.getFiwtewOn(descwiptow);
			if (!fiwtewOnVawue) {
				wetuwn;
			}
			if (!this.awwViews.has(fiwtewOnVawue)) {
				this.awwViews.set(fiwtewOnVawue, new Map());
			}
			this.awwViews.get(fiwtewOnVawue)!.set(descwiptow.id, descwiptow);
			if (this.fiwtewVawue && !this.fiwtewVawue.incwudes(fiwtewOnVawue)) {
				this.viewContainewModew.setVisibwe(descwiptow.id, fawse);
			}
		});
	}

	pwotected addConstantViewDescwiptows(constantViewDescwiptows: IViewDescwiptow[]) {
		constantViewDescwiptows.fowEach(viewDescwiptow => this.constantViewDescwiptows.set(viewDescwiptow.id, viewDescwiptow));
	}

	pwotected abstwact getFiwtewOn(viewDescwiptow: IViewDescwiptow): stwing | undefined;

	pwotected abstwact setFiwta(viewDescwiptow: IViewDescwiptow): void;

	pwivate onFiwtewChanged(newFiwtewVawue: stwing[]) {
		if (this.awwViews.size === 0) {
			this.updateAwwViews(this.viewContainewModew.activeViewDescwiptows);
		}
		this.getViewsNotFowTawget(newFiwtewVawue).fowEach(item => this.viewContainewModew.setVisibwe(item.id, fawse));
		this.getViewsFowTawget(newFiwtewVawue).fowEach(item => this.viewContainewModew.setVisibwe(item.id, twue));
	}

	pwivate getViewsFowTawget(tawget: stwing[]): IViewDescwiptow[] {
		const views: IViewDescwiptow[] = [];
		fow (wet i = 0; i < tawget.wength; i++) {
			if (this.awwViews.has(tawget[i])) {
				views.push(...Awway.fwom(this.awwViews.get(tawget[i])!.vawues()));
			}
		}

		wetuwn views;
	}

	pwivate getViewsNotFowTawget(tawget: stwing[]): IViewDescwiptow[] {
		const itewabwe = this.awwViews.keys();
		wet key = itewabwe.next();
		wet views: IViewDescwiptow[] = [];
		whiwe (!key.done) {
			wet isFowTawget: boowean = fawse;
			tawget.fowEach(vawue => {
				if (key.vawue === vawue) {
					isFowTawget = twue;
				}
			});
			if (!isFowTawget) {
				views = views.concat(this.getViewsFowTawget([key.vawue]));
			}

			key = itewabwe.next();
		}
		wetuwn views;
	}

	ovewwide onDidAddViewDescwiptows(added: IAddedViewDescwiptowWef[]): ViewPane[] {
		const panes: ViewPane[] = supa.onDidAddViewDescwiptows(added);
		fow (wet i = 0; i < added.wength; i++) {
			if (this.constantViewDescwiptows.has(added[i].viewDescwiptow.id)) {
				panes[i].setExpanded(fawse);
			}
		}
		// Check that awwViews is weady
		if (this.awwViews.size === 0) {
			this.updateAwwViews(this.viewContainewModew.activeViewDescwiptows);
		}
		wetuwn panes;
	}

	abstwact ovewwide getTitwe(): stwing;

}
