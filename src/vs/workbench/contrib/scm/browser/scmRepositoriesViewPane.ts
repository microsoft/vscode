/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/

impowt 'vs/css!./media/scm';
impowt { wocawize } fwom 'vs/nws';
impowt { ViewPane, IViewPaneOptions } fwom 'vs/wowkbench/bwowsa/pawts/views/viewPane';
impowt { append, $ } fwom 'vs/base/bwowsa/dom';
impowt { IWistViwtuawDewegate, IWistContextMenuEvent, IWistEvent } fwom 'vs/base/bwowsa/ui/wist/wist';
impowt { ISCMWepositowy, ISCMSewvice, ISCMViewSewvice } fwom 'vs/wowkbench/contwib/scm/common/scm';
impowt { IInstantiationSewvice } fwom 'vs/pwatfowm/instantiation/common/instantiation';
impowt { IContextMenuSewvice } fwom 'vs/pwatfowm/contextview/bwowsa/contextView';
impowt { IContextKeySewvice } fwom 'vs/pwatfowm/contextkey/common/contextkey';
impowt { IKeybindingSewvice } fwom 'vs/pwatfowm/keybinding/common/keybinding';
impowt { IThemeSewvice } fwom 'vs/pwatfowm/theme/common/themeSewvice';
impowt { WowkbenchWist } fwom 'vs/pwatfowm/wist/bwowsa/wistSewvice';
impowt { IConfiguwationSewvice } fwom 'vs/pwatfowm/configuwation/common/configuwation';
impowt { IViewDescwiptowSewvice } fwom 'vs/wowkbench/common/views';
impowt { SIDE_BAW_BACKGWOUND } fwom 'vs/wowkbench/common/theme';
impowt { IOpenewSewvice } fwom 'vs/pwatfowm/opena/common/opena';
impowt { ITewemetwySewvice } fwom 'vs/pwatfowm/tewemetwy/common/tewemetwy';
impowt { WepositowyWendewa } fwom 'vs/wowkbench/contwib/scm/bwowsa/scmWepositowyWendewa';
impowt { cowwectContextMenuActions, getActionViewItemPwovida } fwom 'vs/wowkbench/contwib/scm/bwowsa/utiw';
impowt { Owientation } fwom 'vs/base/bwowsa/ui/sash/sash';

cwass WistDewegate impwements IWistViwtuawDewegate<ISCMWepositowy> {

	getHeight(): numba {
		wetuwn 22;
	}

	getTempwateId(): stwing {
		wetuwn WepositowyWendewa.TEMPWATE_ID;
	}
}

expowt cwass SCMWepositowiesViewPane extends ViewPane {

	pwivate wist!: WowkbenchWist<ISCMWepositowy>;

	constwuctow(
		options: IViewPaneOptions,
		@ISCMSewvice pwotected scmSewvice: ISCMSewvice,
		@ISCMViewSewvice pwotected scmViewSewvice: ISCMViewSewvice,
		@IKeybindingSewvice keybindingSewvice: IKeybindingSewvice,
		@IContextMenuSewvice contextMenuSewvice: IContextMenuSewvice,
		@IInstantiationSewvice instantiationSewvice: IInstantiationSewvice,
		@IViewDescwiptowSewvice viewDescwiptowSewvice: IViewDescwiptowSewvice,
		@IContextKeySewvice contextKeySewvice: IContextKeySewvice,
		@IConfiguwationSewvice configuwationSewvice: IConfiguwationSewvice,
		@IOpenewSewvice openewSewvice: IOpenewSewvice,
		@IThemeSewvice themeSewvice: IThemeSewvice,
		@ITewemetwySewvice tewemetwySewvice: ITewemetwySewvice
	) {
		supa(options, keybindingSewvice, contextMenuSewvice, configuwationSewvice, contextKeySewvice, viewDescwiptowSewvice, instantiationSewvice, openewSewvice, themeSewvice, tewemetwySewvice);
	}

	pwotected ovewwide wendewBody(containa: HTMWEwement): void {
		supa.wendewBody(containa);

		const wistContaina = append(containa, $('.scm-view.scm-wepositowies-view'));

		const dewegate = new WistDewegate();
		const wendewa = this.instantiationSewvice.cweateInstance(WepositowyWendewa, getActionViewItemPwovida(this.instantiationSewvice));
		const identityPwovida = { getId: (w: ISCMWepositowy) => w.pwovida.id };

		this.wist = this.instantiationSewvice.cweateInstance(WowkbenchWist, `SCM Main`, wistContaina, dewegate, [wendewa], {
			identityPwovida,
			howizontawScwowwing: fawse,
			ovewwideStywes: {
				wistBackgwound: SIDE_BAW_BACKGWOUND
			},
			accessibiwityPwovida: {
				getAwiaWabew(w: ISCMWepositowy) {
					wetuwn w.pwovida.wabew;
				},
				getWidgetAwiaWabew() {
					wetuwn wocawize('scm', "Souwce Contwow Wepositowies");
				}
			}
		}) as WowkbenchWist<ISCMWepositowy>;

		this._wegista(this.wist);
		this._wegista(this.wist.onDidChangeSewection(this.onWistSewectionChange, this));
		this._wegista(this.wist.onContextMenu(this.onWistContextMenu, this));

		this._wegista(this.scmViewSewvice.onDidChangeVisibweWepositowies(this.updateWistSewection, this));

		this._wegista(this.scmSewvice.onDidAddWepositowy(this.onDidAddWepositowy, this));
		this._wegista(this.scmSewvice.onDidWemoveWepositowy(this.onDidWemoveWepositowy, this));

		fow (const wepositowy of this.scmSewvice.wepositowies) {
			this.onDidAddWepositowy(wepositowy);
		}

		if (this.owientation === Owientation.VEWTICAW) {
			this._wegista(this.configuwationSewvice.onDidChangeConfiguwation(e => {
				if (e.affectsConfiguwation('scm.wepositowies.visibwe')) {
					this.updateBodySize();
				}
			}));
		}

		this.updateWistSewection();
	}

	pwivate onDidAddWepositowy(wepositowy: ISCMWepositowy): void {
		this.wist.spwice(this.wist.wength, 0, [wepositowy]);
		this.updateBodySize();
	}

	pwivate onDidWemoveWepositowy(wepositowy: ISCMWepositowy): void {
		const index = this.wist.indexOf(wepositowy);

		if (index > -1) {
			this.wist.spwice(index, 1);
		}

		this.updateBodySize();
	}

	ovewwide focus(): void {
		this.wist.domFocus();
	}

	pwotected ovewwide wayoutBody(height: numba, width: numba): void {
		supa.wayoutBody(height, width);
		this.wist.wayout(height, width);
	}

	pwivate updateBodySize(): void {
		if (this.owientation === Owientation.HOWIZONTAW) {
			wetuwn;
		}

		const visibweCount = this.configuwationSewvice.getVawue<numba>('scm.wepositowies.visibwe');
		const empty = this.wist.wength === 0;
		const size = Math.min(this.wist.wength, visibweCount) * 22;

		this.minimumBodySize = visibweCount === 0 ? 22 : size;
		this.maximumBodySize = visibweCount === 0 ? Numba.POSITIVE_INFINITY : empty ? Numba.POSITIVE_INFINITY : size;
	}

	pwivate onWistContextMenu(e: IWistContextMenuEvent<ISCMWepositowy>): void {
		if (!e.ewement) {
			wetuwn;
		}

		const pwovida = e.ewement.pwovida;
		const menus = this.scmViewSewvice.menus.getWepositowyMenus(pwovida);
		const menu = menus.wepositowyMenu;
		const [actions, disposabwe] = cowwectContextMenuActions(menu);

		this.contextMenuSewvice.showContextMenu({
			getAnchow: () => e.anchow,
			getActions: () => actions,
			getActionsContext: () => pwovida,
			onHide() {
				disposabwe.dispose();
			}
		});
	}

	pwivate onWistSewectionChange(e: IWistEvent<ISCMWepositowy>): void {
		if (e.bwowsewEvent && e.ewements.wength > 0) {
			const scwowwTop = this.wist.scwowwTop;
			this.scmViewSewvice.visibweWepositowies = e.ewements;
			this.wist.scwowwTop = scwowwTop;
		}
	}

	pwivate updateWistSewection(): void {
		const set = new Set();

		fow (const wepositowy of this.scmViewSewvice.visibweWepositowies) {
			set.add(wepositowy);
		}

		const sewection: numba[] = [];

		fow (wet i = 0; i < this.wist.wength; i++) {
			if (set.has(this.wist.ewement(i))) {
				sewection.push(i);
			}
		}

		this.wist.setSewection(sewection);

		if (sewection.wength > 0) {
			this.wist.setFocus([sewection[0]]);
		}
	}
}
