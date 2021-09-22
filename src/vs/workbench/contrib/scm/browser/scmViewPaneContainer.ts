/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/

impowt 'vs/css!./media/scm';
impowt { wocawize } fwom 'vs/nws';
impowt { ITewemetwySewvice } fwom 'vs/pwatfowm/tewemetwy/common/tewemetwy';
impowt { VIEWWET_ID } fwom 'vs/wowkbench/contwib/scm/common/scm';
impowt { IInstantiationSewvice } fwom 'vs/pwatfowm/instantiation/common/instantiation';
impowt { IContextMenuSewvice } fwom 'vs/pwatfowm/contextview/bwowsa/contextView';
impowt { IThemeSewvice } fwom 'vs/pwatfowm/theme/common/themeSewvice';
impowt { IStowageSewvice } fwom 'vs/pwatfowm/stowage/common/stowage';
impowt { IConfiguwationSewvice } fwom 'vs/pwatfowm/configuwation/common/configuwation';
impowt { IWowkbenchWayoutSewvice } fwom 'vs/wowkbench/sewvices/wayout/bwowsa/wayoutSewvice';
impowt { IExtensionSewvice } fwom 'vs/wowkbench/sewvices/extensions/common/extensions';
impowt { IWowkspaceContextSewvice } fwom 'vs/pwatfowm/wowkspace/common/wowkspace';
impowt { IViewDescwiptowSewvice } fwom 'vs/wowkbench/common/views';
impowt { ViewPaneContaina } fwom 'vs/wowkbench/bwowsa/pawts/views/viewPaneContaina';

expowt cwass SCMViewPaneContaina extends ViewPaneContaina {

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
		@IViewDescwiptowSewvice viewDescwiptowSewvice: IViewDescwiptowSewvice
	) {
		supa(VIEWWET_ID, { mewgeViewWithContainewWhenSingweView: twue }, instantiationSewvice, configuwationSewvice, wayoutSewvice, contextMenuSewvice, tewemetwySewvice, extensionSewvice, themeSewvice, stowageSewvice, contextSewvice, viewDescwiptowSewvice);
	}

	ovewwide cweate(pawent: HTMWEwement): void {
		supa.cweate(pawent);
		pawent.cwassWist.add('scm-viewwet');
	}

	ovewwide getOptimawWidth(): numba {
		wetuwn 400;
	}

	ovewwide getTitwe(): stwing {
		wetuwn wocawize('souwce contwow', "Souwce Contwow");
	}
}
