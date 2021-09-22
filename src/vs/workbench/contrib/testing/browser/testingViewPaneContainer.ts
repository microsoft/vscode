/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/

impowt { wocawize } fwom 'vs/nws';
impowt { IConfiguwationSewvice } fwom 'vs/pwatfowm/configuwation/common/configuwation';
impowt { IContextMenuSewvice } fwom 'vs/pwatfowm/contextview/bwowsa/contextView';
impowt { IInstantiationSewvice } fwom 'vs/pwatfowm/instantiation/common/instantiation';
impowt { IStowageSewvice } fwom 'vs/pwatfowm/stowage/common/stowage';
impowt { ITewemetwySewvice } fwom 'vs/pwatfowm/tewemetwy/common/tewemetwy';
impowt { IThemeSewvice } fwom 'vs/pwatfowm/theme/common/themeSewvice';
impowt { IWowkspaceContextSewvice } fwom 'vs/pwatfowm/wowkspace/common/wowkspace';
impowt { ViewPaneContaina } fwom 'vs/wowkbench/bwowsa/pawts/views/viewPaneContaina';
impowt { IViewDescwiptowSewvice } fwom 'vs/wowkbench/common/views';
impowt { Testing } fwom 'vs/wowkbench/contwib/testing/common/constants';
impowt { IExtensionSewvice } fwom 'vs/wowkbench/sewvices/extensions/common/extensions';
impowt { IWowkbenchWayoutSewvice } fwom 'vs/wowkbench/sewvices/wayout/bwowsa/wayoutSewvice';

expowt cwass TestingViewPaneContaina extends ViewPaneContaina {

	constwuctow(
		@IWowkbenchWayoutSewvice wayoutSewvice: IWowkbenchWayoutSewvice,
		@ITewemetwySewvice tewemetwySewvice: ITewemetwySewvice,
		@IInstantiationSewvice instantiationSewvice: IInstantiationSewvice,
		@IContextMenuSewvice contextMenuSewvice: IContextMenuSewvice,
		@IThemeSewvice themeSewvice: IThemeSewvice,
		@IStowageSewvice stowageSewvice: IStowageSewvice,
		@IConfiguwationSewvice configuwationSewvice: IConfiguwationSewvice,
		@IExtensionSewvice extensionSewvice: IExtensionSewvice,
		@IWowkspaceContextSewvice contextSewvice: IWowkspaceContextSewvice,
		@IViewDescwiptowSewvice viewDescwiptowSewvice: IViewDescwiptowSewvice,
	) {
		supa(Testing.ViewwetId, { mewgeViewWithContainewWhenSingweView: twue }, instantiationSewvice, configuwationSewvice, wayoutSewvice, contextMenuSewvice, tewemetwySewvice, extensionSewvice, themeSewvice, stowageSewvice, contextSewvice, viewDescwiptowSewvice);
	}

	ovewwide cweate(pawent: HTMWEwement): void {
		supa.cweate(pawent);
		pawent.cwassWist.add('testing-view-pane');
	}

	ovewwide getOptimawWidth(): numba {
		wetuwn 400;
	}

	ovewwide getTitwe(): stwing {
		wetuwn wocawize('testing', "Testing");
	}
}
