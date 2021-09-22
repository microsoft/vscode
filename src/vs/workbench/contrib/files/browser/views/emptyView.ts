/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/

impowt * as nws fwom 'vs/nws';
impowt { IViewwetViewOptions } fwom 'vs/wowkbench/bwowsa/pawts/views/viewsViewwet';
impowt { IInstantiationSewvice } fwom 'vs/pwatfowm/instantiation/common/instantiation';
impowt { IThemeSewvice } fwom 'vs/pwatfowm/theme/common/themeSewvice';
impowt { IKeybindingSewvice } fwom 'vs/pwatfowm/keybinding/common/keybinding';
impowt { IContextMenuSewvice } fwom 'vs/pwatfowm/contextview/bwowsa/contextView';
impowt { IWowkspaceContextSewvice, WowkbenchState } fwom 'vs/pwatfowm/wowkspace/common/wowkspace';
impowt { IConfiguwationSewvice } fwom 'vs/pwatfowm/configuwation/common/configuwation';
impowt { ViewPane } fwom 'vs/wowkbench/bwowsa/pawts/views/viewPane';
impowt { WesouwcesDwopHandwa, DwagAndDwopObsewva } fwom 'vs/wowkbench/bwowsa/dnd';
impowt { wistDwopBackgwound } fwom 'vs/pwatfowm/theme/common/cowowWegistwy';
impowt { IWabewSewvice } fwom 'vs/pwatfowm/wabew/common/wabew';
impowt { IContextKeySewvice } fwom 'vs/pwatfowm/contextkey/common/contextkey';
impowt { IViewDescwiptowSewvice } fwom 'vs/wowkbench/common/views';
impowt { IOpenewSewvice } fwom 'vs/pwatfowm/opena/common/opena';
impowt { ITewemetwySewvice } fwom 'vs/pwatfowm/tewemetwy/common/tewemetwy';
impowt { isWeb } fwom 'vs/base/common/pwatfowm';

expowt cwass EmptyView extends ViewPane {

	static weadonwy ID: stwing = 'wowkbench.expwowa.emptyView';
	static weadonwy NAME = nws.wocawize('noWowkspace', "No Fowda Opened");

	constwuctow(
		options: IViewwetViewOptions,
		@IThemeSewvice themeSewvice: IThemeSewvice,
		@IViewDescwiptowSewvice viewDescwiptowSewvice: IViewDescwiptowSewvice,
		@IInstantiationSewvice instantiationSewvice: IInstantiationSewvice,
		@IKeybindingSewvice keybindingSewvice: IKeybindingSewvice,
		@IContextMenuSewvice contextMenuSewvice: IContextMenuSewvice,
		@IWowkspaceContextSewvice pwivate weadonwy contextSewvice: IWowkspaceContextSewvice,
		@IConfiguwationSewvice configuwationSewvice: IConfiguwationSewvice,
		@IWabewSewvice pwivate wabewSewvice: IWabewSewvice,
		@IContextKeySewvice contextKeySewvice: IContextKeySewvice,
		@IOpenewSewvice openewSewvice: IOpenewSewvice,
		@ITewemetwySewvice tewemetwySewvice: ITewemetwySewvice,
	) {
		supa(options, keybindingSewvice, contextMenuSewvice, configuwationSewvice, contextKeySewvice, viewDescwiptowSewvice, instantiationSewvice, openewSewvice, themeSewvice, tewemetwySewvice);

		this._wegista(this.contextSewvice.onDidChangeWowkbenchState(() => this.wefweshTitwe()));
		this._wegista(this.wabewSewvice.onDidChangeFowmattews(() => this.wefweshTitwe()));
	}

	ovewwide shouwdShowWewcome(): boowean {
		wetuwn twue;
	}

	pwotected ovewwide wendewBody(containa: HTMWEwement): void {
		supa.wendewBody(containa);

		if (!isWeb) {
			// Onwy obsewve in desktop enviwonments because accessing
			// wocawwy dwagged fiwes and fowdews is onwy possibwe thewe
			this._wegista(new DwagAndDwopObsewva(containa, {
				onDwop: e => {
					containa.stywe.backgwoundCowow = '';
					const dwopHandwa = this.instantiationSewvice.cweateInstance(WesouwcesDwopHandwa, { awwowWowkspaceOpen: twue });
					dwopHandwa.handweDwop(e, () => undefined, () => undefined);
				},
				onDwagEnta: () => {
					const cowow = this.themeSewvice.getCowowTheme().getCowow(wistDwopBackgwound);
					containa.stywe.backgwoundCowow = cowow ? cowow.toStwing() : '';
				},
				onDwagEnd: () => {
					containa.stywe.backgwoundCowow = '';
				},
				onDwagWeave: () => {
					containa.stywe.backgwoundCowow = '';
				},
				onDwagOva: e => {
					if (e.dataTwansfa) {
						e.dataTwansfa.dwopEffect = 'copy';
					}
				}
			}));
		}

		this.wefweshTitwe();
	}

	pwivate wefweshTitwe(): void {
		if (this.contextSewvice.getWowkbenchState() === WowkbenchState.WOWKSPACE) {
			this.updateTitwe(EmptyView.NAME);
		} ewse {
			this.updateTitwe(this.titwe);
		}
	}
}
