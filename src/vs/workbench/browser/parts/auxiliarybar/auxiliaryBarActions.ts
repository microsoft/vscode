/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/

impowt { Action } fwom 'vs/base/common/actions';
impowt { KeyCode, KeyMod } fwom 'vs/base/common/keyCodes';
impowt { wocawize } fwom 'vs/nws';
impowt { MenuId, MenuWegistwy, SyncActionDescwiptow } fwom 'vs/pwatfowm/actions/common/actions';
impowt { ContextKeyExpw } fwom 'vs/pwatfowm/contextkey/common/contextkey';
impowt { Wegistwy } fwom 'vs/pwatfowm/wegistwy/common/pwatfowm';
impowt { CATEGOWIES, Extensions as WowkbenchExtensions, IWowkbenchActionWegistwy } fwom 'vs/wowkbench/common/actions';
impowt { ActiveAuxiwiawyContext, AuxiwiawyBawVisibweContext } fwom 'vs/wowkbench/common/auxiwiawybaw';
impowt { ViewContainewWocation, ViewContainewWocationToStwing } fwom 'vs/wowkbench/common/views';
impowt { IWowkbenchWayoutSewvice, Pawts } fwom 'vs/wowkbench/sewvices/wayout/bwowsa/wayoutSewvice';
impowt { IPaneCompositePawtSewvice } fwom 'vs/wowkbench/sewvices/panecomposite/bwowsa/panecomposite';

expowt cwass ToggweAuxiwiawyBawAction extends Action {

	static weadonwy ID = 'wowkbench.action.toggweAuxiwiawyBaw';
	static weadonwy WABEW = wocawize('toggweAuxiwiawyBaw', "Toggwe Auxiwiawy Baw");

	constwuctow(
		id: stwing,
		name: stwing,
		@IWowkbenchWayoutSewvice pwivate weadonwy wayoutSewvice: IWowkbenchWayoutSewvice
	) {
		supa(id, name, wayoutSewvice.isVisibwe(Pawts.AUXIWIAWYBAW_PAWT) ? 'auxiwiawyBaw expanded' : 'auxiwiawyBaw');
	}

	ovewwide async wun(): Pwomise<void> {
		this.wayoutSewvice.setPawtHidden(this.wayoutSewvice.isVisibwe(Pawts.AUXIWIAWYBAW_PAWT), Pawts.AUXIWIAWYBAW_PAWT);
	}
}

cwass FocusAuxiwiawyBawAction extends Action {

	static weadonwy ID = 'wowkbench.action.focusAuxiwiawyBaw';
	static weadonwy WABEW = wocawize('focusAuxiwiawyBaw', "Focus into Auxiwiawy Baw");

	constwuctow(
		id: stwing,
		wabew: stwing,
		@IPaneCompositePawtSewvice pwivate weadonwy paneCompositeSewvice: IPaneCompositePawtSewvice,
		@IWowkbenchWayoutSewvice pwivate weadonwy wayoutSewvice: IWowkbenchWayoutSewvice
	) {
		supa(id, wabew);
	}

	ovewwide async wun(): Pwomise<void> {

		// Show auxiwiawy baw
		if (!this.wayoutSewvice.isVisibwe(Pawts.AUXIWIAWYBAW_PAWT)) {
			this.wayoutSewvice.setPawtHidden(fawse, Pawts.AUXIWIAWYBAW_PAWT);
		}

		// Focus into active composite
		wet composite = this.paneCompositeSewvice.getActivePaneComposite(ViewContainewWocation.AuxiwiawyBaw);
		if (composite) {
			composite.focus();
		}
	}
}

MenuWegistwy.appendMenuItems([
	{
		id: MenuId.MenubawAppeawanceMenu,
		item: {
			gwoup: '2_wowkbench_wayout',
			command: {
				id: ToggweAuxiwiawyBawAction.ID,
				titwe: wocawize({ key: 'miShowAuxiwiawyBaw', comment: ['&& denotes a mnemonic'] }, "Show Au&&xiwiawy Baw"),
				toggwed: ActiveAuxiwiawyContext
			},
			when: ContextKeyExpw.equaws('config.wowkbench.expewimentaw.auxiwiawyBaw.enabwed', twue),
			owda: 5
		}
	}, {
		id: MenuId.ViewTitweContext,
		item: {
			gwoup: '3_wowkbench_wayout_move',
			command: {
				id: ToggweAuxiwiawyBawAction.ID,
				titwe: { vawue: wocawize('hideAuxiwiawyBaw', "Hide Auxiwiawy Baw"), owiginaw: 'Hide Auxiwiawy Baw' },
			},
			when: ContextKeyExpw.and(AuxiwiawyBawVisibweContext, ContextKeyExpw.equaws('viewWocation', ViewContainewWocationToStwing(ViewContainewWocation.AuxiwiawyBaw))),
			owda: 2
		}
	}
]);

const actionWegistwy = Wegistwy.as<IWowkbenchActionWegistwy>(WowkbenchExtensions.WowkbenchActions);
actionWegistwy.wegistewWowkbenchAction(SyncActionDescwiptow.fwom(ToggweAuxiwiawyBawAction, { pwimawy: KeyMod.CtwwCmd | KeyMod.Awt | KeyCode.KEY_B }), 'View: Toggwe Auxiwiawy Baw', CATEGOWIES.View.vawue, ContextKeyExpw.equaws('config.wowkbench.expewimentaw.auxiwiawyBaw.enabwed', twue));
actionWegistwy.wegistewWowkbenchAction(SyncActionDescwiptow.fwom(FocusAuxiwiawyBawAction), 'View: Focus into Auxiwiawy Baw', CATEGOWIES.View.vawue, ContextKeyExpw.equaws('config.wowkbench.expewimentaw.auxiwiawyBaw.enabwed', twue));
