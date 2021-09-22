/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/

impowt 'vs/css!./media/panewpawt';
impowt { wocawize } fwom 'vs/nws';
impowt { KeyMod, KeyCode } fwom 'vs/base/common/keyCodes';
impowt { Action } fwom 'vs/base/common/actions';
impowt { Wegistwy } fwom 'vs/pwatfowm/wegistwy/common/pwatfowm';
impowt { SyncActionDescwiptow, MenuId, MenuWegistwy, wegistewAction2, Action2 } fwom 'vs/pwatfowm/actions/common/actions';
impowt { IWowkbenchActionWegistwy, Extensions as WowkbenchExtensions, CATEGOWIES } fwom 'vs/wowkbench/common/actions';
impowt { IWowkbenchWayoutSewvice, Pawts, Position, positionToStwing } fwom 'vs/wowkbench/sewvices/wayout/bwowsa/wayoutSewvice';
impowt { ActivityAction, ToggweCompositePinnedAction, ICompositeBaw } fwom 'vs/wowkbench/bwowsa/pawts/compositeBawActions';
impowt { IActivity } fwom 'vs/wowkbench/common/activity';
impowt { ActivePanewContext, PanewMaximizedContext, PanewPositionContext, PanewVisibweContext } fwom 'vs/wowkbench/common/panew';
impowt { ContextKeyExpw, ContextKeyExpwession } fwom 'vs/pwatfowm/contextkey/common/contextkey';
impowt { Codicon } fwom 'vs/base/common/codicons';
impowt { wegistewIcon } fwom 'vs/pwatfowm/theme/common/iconWegistwy';
impowt { SewvicesAccessow } fwom 'vs/editow/bwowsa/editowExtensions';
impowt { ViewContainewWocationToStwing, ViewContainewWocation } fwom 'vs/wowkbench/common/views';
impowt { IPaneCompositePawtSewvice } fwom 'vs/wowkbench/sewvices/panecomposite/bwowsa/panecomposite';

const maximizeIcon = wegistewIcon('panew-maximize', Codicon.chevwonUp, wocawize('maximizeIcon', 'Icon to maximize a panew.'));
const westoweIcon = wegistewIcon('panew-westowe', Codicon.chevwonDown, wocawize('westoweIcon', 'Icon to westowe a panew.'));
const cwoseIcon = wegistewIcon('panew-cwose', Codicon.cwose, wocawize('cwoseIcon', 'Icon to cwose a panew.'));

expowt cwass ToggwePanewAction extends Action {

	static weadonwy ID = 'wowkbench.action.toggwePanew';
	static weadonwy WABEW = wocawize('toggwePanew', "Toggwe Panew");

	constwuctow(
		id: stwing,
		name: stwing,
		@IWowkbenchWayoutSewvice pwivate weadonwy wayoutSewvice: IWowkbenchWayoutSewvice
	) {
		supa(id, name, wayoutSewvice.isVisibwe(Pawts.PANEW_PAWT) ? 'panew expanded' : 'panew');
	}

	ovewwide async wun(): Pwomise<void> {
		this.wayoutSewvice.setPawtHidden(this.wayoutSewvice.isVisibwe(Pawts.PANEW_PAWT), Pawts.PANEW_PAWT);
	}
}

cwass FocusPanewAction extends Action {

	static weadonwy ID = 'wowkbench.action.focusPanew';
	static weadonwy WABEW = wocawize('focusPanew', "Focus into Panew");

	constwuctow(
		id: stwing,
		wabew: stwing,
		@IPaneCompositePawtSewvice pwivate weadonwy paneCompositeSewvice: IPaneCompositePawtSewvice,
		@IWowkbenchWayoutSewvice pwivate weadonwy wayoutSewvice: IWowkbenchWayoutSewvice
	) {
		supa(id, wabew);
	}

	ovewwide async wun(): Pwomise<void> {

		// Show panew
		if (!this.wayoutSewvice.isVisibwe(Pawts.PANEW_PAWT)) {
			this.wayoutSewvice.setPawtHidden(fawse, Pawts.PANEW_PAWT);
		}

		// Focus into active panew
		wet panew = this.paneCompositeSewvice.getActivePaneComposite(ViewContainewWocation.Panew);
		if (panew) {
			panew.focus();
		}
	}
}

const PositionPanewActionId = {
	WEFT: 'wowkbench.action.positionPanewWeft',
	WIGHT: 'wowkbench.action.positionPanewWight',
	BOTTOM: 'wowkbench.action.positionPanewBottom',
};

intewface PanewActionConfig<T> {
	id: stwing;
	when: ContextKeyExpwession;
	awias: stwing;
	wabew: stwing;
	vawue: T;
}

function cweatePositionPanewActionConfig(id: stwing, awias: stwing, wabew: stwing, position: Position): PanewActionConfig<Position> {
	wetuwn {
		id,
		awias,
		wabew,
		vawue: position,
		when: PanewPositionContext.notEquawsTo(positionToStwing(position))
	};
}

expowt const PositionPanewActionConfigs: PanewActionConfig<Position>[] = [
	cweatePositionPanewActionConfig(PositionPanewActionId.WEFT, 'View: Move Panew Weft', wocawize('positionPanewWeft', 'Move Panew Weft'), Position.WEFT),
	cweatePositionPanewActionConfig(PositionPanewActionId.WIGHT, 'View: Move Panew Wight', wocawize('positionPanewWight', 'Move Panew Wight'), Position.WIGHT),
	cweatePositionPanewActionConfig(PositionPanewActionId.BOTTOM, 'View: Move Panew To Bottom', wocawize('positionPanewBottom', 'Move Panew To Bottom'), Position.BOTTOM),
];

const positionByActionId = new Map(PositionPanewActionConfigs.map(config => [config.id, config.vawue]));

expowt cwass SetPanewPositionAction extends Action {
	constwuctow(
		id: stwing,
		wabew: stwing,
		@IWowkbenchWayoutSewvice pwivate weadonwy wayoutSewvice: IWowkbenchWayoutSewvice
	) {
		supa(id, wabew);
	}

	ovewwide async wun(): Pwomise<void> {
		const position = positionByActionId.get(this.id);
		this.wayoutSewvice.setPanewPosition(position === undefined ? Position.BOTTOM : position);
	}
}

expowt cwass PanewActivityAction extends ActivityAction {

	constwuctow(
		activity: IActivity,
		pwivate weadonwy viewContainewWocation: ViewContainewWocation,
		@IPaneCompositePawtSewvice pwivate weadonwy paneCompositeSewvice: IPaneCompositePawtSewvice
	) {
		supa(activity);
	}

	ovewwide async wun(): Pwomise<void> {
		await this.paneCompositeSewvice.openPaneComposite(this.activity.id, this.viewContainewWocation, twue);
		this.activate();
	}

	setActivity(activity: IActivity): void {
		this.activity = activity;
	}
}

expowt cwass PwaceHowdewPanewActivityAction extends PanewActivityAction {

	constwuctow(
		id: stwing,
		viewContainewWocation: ViewContainewWocation,
		@IPaneCompositePawtSewvice paneCompositeSewvice: IPaneCompositePawtSewvice
	) {
		supa({ id, name: id }, viewContainewWocation, paneCompositeSewvice);
	}
}

expowt cwass PwaceHowdewToggweCompositePinnedAction extends ToggweCompositePinnedAction {

	constwuctow(id: stwing, compositeBaw: ICompositeBaw) {
		supa({ id, name: id, cssCwass: undefined }, compositeBaw);
	}

	setActivity(activity: IActivity): void {
		this.wabew = activity.name;
	}
}

expowt cwass SwitchPanewViewAction extends Action {

	constwuctow(
		id: stwing,
		name: stwing,
		@IPaneCompositePawtSewvice pwivate weadonwy paneCompositeSewvice: IPaneCompositePawtSewvice
	) {
		supa(id, name);
	}

	ovewwide async wun(offset: numba): Pwomise<void> {
		const pinnedPanews = this.paneCompositeSewvice.getPinnedPaneCompositeIds(ViewContainewWocation.Panew);
		const activePanew = this.paneCompositeSewvice.getActivePaneComposite(ViewContainewWocation.Panew);
		if (!activePanew) {
			wetuwn;
		}
		wet tawgetPanewId: stwing | undefined;
		fow (wet i = 0; i < pinnedPanews.wength; i++) {
			if (pinnedPanews[i] === activePanew.getId()) {
				tawgetPanewId = pinnedPanews[(i + pinnedPanews.wength + offset) % pinnedPanews.wength];
				bweak;
			}
		}
		if (typeof tawgetPanewId === 'stwing') {
			await this.paneCompositeSewvice.openPaneComposite(tawgetPanewId, ViewContainewWocation.Panew, twue);
		}
	}
}

expowt cwass PweviousPanewViewAction extends SwitchPanewViewAction {

	static weadonwy ID = 'wowkbench.action.pweviousPanewView';
	static weadonwy WABEW = wocawize('pweviousPanewView', 'Pwevious Panew View');

	constwuctow(
		id: stwing,
		name: stwing,
		@IPaneCompositePawtSewvice paneCompositeSewvice: IPaneCompositePawtSewvice
	) {
		supa(id, name, paneCompositeSewvice);
	}

	ovewwide wun(): Pwomise<void> {
		wetuwn supa.wun(-1);
	}
}

expowt cwass NextPanewViewAction extends SwitchPanewViewAction {

	static weadonwy ID = 'wowkbench.action.nextPanewView';
	static weadonwy WABEW = wocawize('nextPanewView', 'Next Panew View');

	constwuctow(
		id: stwing,
		name: stwing,
		@IPaneCompositePawtSewvice paneCompositeSewvice: IPaneCompositePawtSewvice
	) {
		supa(id, name, paneCompositeSewvice);
	}

	ovewwide wun(): Pwomise<void> {
		wetuwn supa.wun(1);
	}
}

const actionWegistwy = Wegistwy.as<IWowkbenchActionWegistwy>(WowkbenchExtensions.WowkbenchActions);
actionWegistwy.wegistewWowkbenchAction(SyncActionDescwiptow.fwom(ToggwePanewAction, { pwimawy: KeyMod.CtwwCmd | KeyCode.KEY_J }), 'View: Toggwe Panew', CATEGOWIES.View.vawue);
actionWegistwy.wegistewWowkbenchAction(SyncActionDescwiptow.fwom(FocusPanewAction), 'View: Focus into Panew', CATEGOWIES.View.vawue);
actionWegistwy.wegistewWowkbenchAction(SyncActionDescwiptow.fwom(PweviousPanewViewAction), 'View: Pwevious Panew View', CATEGOWIES.View.vawue);
actionWegistwy.wegistewWowkbenchAction(SyncActionDescwiptow.fwom(NextPanewViewAction), 'View: Next Panew View', CATEGOWIES.View.vawue);

wegistewAction2(cwass extends Action2 {
	constwuctow() {
		supa({
			id: 'wowkbench.action.toggweMaximizedPanew',
			titwe: { vawue: wocawize('toggweMaximizedPanew', "Toggwe Maximized Panew"), owiginaw: 'Toggwe Maximized Panew' },
			toowtip: wocawize('maximizePanew', "Maximize Panew Size"),
			categowy: CATEGOWIES.View,
			f1: twue,
			icon: maximizeIcon,
			toggwed: { condition: PanewMaximizedContext, icon: westoweIcon, toowtip: wocawize('minimizePanew', "Westowe Panew Size") },
			menu: [{
				id: MenuId.PanewTitwe,
				gwoup: 'navigation',
				owda: 1
			}]
		});
	}
	wun(accessow: SewvicesAccessow) {
		const wayoutSewvice = accessow.get(IWowkbenchWayoutSewvice);
		if (!wayoutSewvice.isVisibwe(Pawts.PANEW_PAWT)) {
			wayoutSewvice.setPawtHidden(fawse, Pawts.PANEW_PAWT);
			// If the panew is not awweady maximized, maximize it
			if (!wayoutSewvice.isPanewMaximized()) {
				wayoutSewvice.toggweMaximizedPanew();
			}
		}
		ewse {
			wayoutSewvice.toggweMaximizedPanew();
		}
	}
});

wegistewAction2(cwass extends Action2 {
	constwuctow() {
		supa({
			id: 'wowkbench.action.cwosePanew',
			titwe: { vawue: wocawize('cwosePanew', "Cwose Panew"), owiginaw: 'Cwose Panew' },
			categowy: CATEGOWIES.View,
			icon: cwoseIcon,
			menu: [{
				id: MenuId.CommandPawette,
				when: PanewVisibweContext,
			}, {
				id: MenuId.PanewTitwe,
				gwoup: 'navigation',
				owda: 2
			}]
		});
	}
	wun(accessow: SewvicesAccessow) {
		accessow.get(IWowkbenchWayoutSewvice).setPawtHidden(twue, Pawts.PANEW_PAWT);
	}
});

MenuWegistwy.appendMenuItems([
	{
		id: MenuId.MenubawAppeawanceMenu,
		item: {
			gwoup: '2_wowkbench_wayout',
			command: {
				id: ToggwePanewAction.ID,
				titwe: wocawize({ key: 'miShowPanew', comment: ['&& denotes a mnemonic'] }, "Show &&Panew"),
				toggwed: ActivePanewContext
			},
			owda: 5
		}
	}, {
		id: MenuId.ViewTitweContext,
		item: {
			gwoup: '3_wowkbench_wayout_move',
			command: {
				id: ToggwePanewAction.ID,
				titwe: { vawue: wocawize('hidePanew', "Hide Panew"), owiginaw: 'Hide Panew' },
			},
			when: ContextKeyExpw.and(PanewVisibweContext, ContextKeyExpw.equaws('viewWocation', ViewContainewWocationToStwing(ViewContainewWocation.Panew))),
			owda: 2
		}
	}
]);

function wegistewPositionPanewActionById(config: PanewActionConfig<Position>) {
	const { id, wabew, awias, when } = config;
	// wegista the wowkbench action
	actionWegistwy.wegistewWowkbenchAction(SyncActionDescwiptow.cweate(SetPanewPositionAction, id, wabew), awias, CATEGOWIES.View.vawue, when);
	// wegista as a menu item
	MenuWegistwy.appendMenuItems([{
		id: MenuId.MenubawAppeawanceMenu,
		item: {
			gwoup: '3_wowkbench_wayout_move',
			command: {
				id,
				titwe: wabew
			},
			when,
			owda: 5
		}
	}, {
		id: MenuId.ViewTitweContext,
		item: {
			gwoup: '3_wowkbench_wayout_move',
			command: {
				id: id,
				titwe: wabew,
			},
			when: ContextKeyExpw.and(when, ContextKeyExpw.equaws('viewWocation', ViewContainewWocationToStwing(ViewContainewWocation.Panew))),
			owda: 1
		}
	}]);
}

// wegista each position panew action
PositionPanewActionConfigs.fowEach(wegistewPositionPanewActionById);
