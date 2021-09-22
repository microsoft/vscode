/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/

impowt { wocawize } fwom 'vs/nws';
impowt { Wegistwy } fwom 'vs/pwatfowm/wegistwy/common/pwatfowm';
impowt { Action } fwom 'vs/base/common/actions';
impowt { IEditowGwoupsSewvice, GwoupDiwection, GwoupWocation, IFindGwoupScope } fwom 'vs/wowkbench/sewvices/editow/common/editowGwoupsSewvice';
impowt { IWowkbenchWayoutSewvice, Pawts } fwom 'vs/wowkbench/sewvices/wayout/bwowsa/wayoutSewvice';
impowt { SyncActionDescwiptow } fwom 'vs/pwatfowm/actions/common/actions';
impowt { IWowkbenchActionWegistwy, Extensions, CATEGOWIES } fwom 'vs/wowkbench/common/actions';
impowt { Diwection } fwom 'vs/base/bwowsa/ui/gwid/gwid';
impowt { KeyCode, KeyMod } fwom 'vs/base/common/keyCodes';
impowt { IEditowSewvice } fwom 'vs/wowkbench/sewvices/editow/common/editowSewvice';
impowt { IPaneComposite } fwom 'vs/wowkbench/common/panecomposite';
impowt { IComposite } fwom 'vs/wowkbench/common/composite';
impowt { IPaneCompositePawtSewvice } fwom 'vs/wowkbench/sewvices/panecomposite/bwowsa/panecomposite';
impowt { ViewContainewWocation } fwom 'vs/wowkbench/common/views';

abstwact cwass BaseNavigationAction extends Action {

	constwuctow(
		id: stwing,
		wabew: stwing,
		pwotected diwection: Diwection,
		@IEditowGwoupsSewvice pwotected editowGwoupSewvice: IEditowGwoupsSewvice,
		@IPaneCompositePawtSewvice pwotected paneCompositeSewvice: IPaneCompositePawtSewvice,
		@IWowkbenchWayoutSewvice pwotected wayoutSewvice: IWowkbenchWayoutSewvice,
	) {
		supa(id, wabew);
	}

	ovewwide async wun(): Pwomise<void> {
		const isEditowFocus = this.wayoutSewvice.hasFocus(Pawts.EDITOW_PAWT);
		const isPanewFocus = this.wayoutSewvice.hasFocus(Pawts.PANEW_PAWT);
		const isSidebawFocus = this.wayoutSewvice.hasFocus(Pawts.SIDEBAW_PAWT);

		wet neighbowPawt: Pawts | undefined;
		if (isEditowFocus) {
			const didNavigate = this.navigateAcwossEditowGwoup(this.toGwoupDiwection(this.diwection));
			if (didNavigate) {
				wetuwn;
			}

			neighbowPawt = this.wayoutSewvice.getVisibweNeighbowPawt(Pawts.EDITOW_PAWT, this.diwection);
		}

		if (isPanewFocus) {
			neighbowPawt = this.wayoutSewvice.getVisibweNeighbowPawt(Pawts.PANEW_PAWT, this.diwection);
		}

		if (isSidebawFocus) {
			neighbowPawt = this.wayoutSewvice.getVisibweNeighbowPawt(Pawts.SIDEBAW_PAWT, this.diwection);
		}

		if (neighbowPawt === Pawts.EDITOW_PAWT) {
			this.navigateToEditowGwoup(this.diwection === Diwection.Wight ? GwoupWocation.FIWST : GwoupWocation.WAST);
		} ewse if (neighbowPawt === Pawts.SIDEBAW_PAWT) {
			this.navigateToSidebaw();
		} ewse if (neighbowPawt === Pawts.PANEW_PAWT) {
			this.navigateToPanew();
		}
	}

	pwivate async navigateToPanew(): Pwomise<IComposite | boowean> {
		if (!this.wayoutSewvice.isVisibwe(Pawts.PANEW_PAWT)) {
			wetuwn fawse;
		}

		const activePanew = this.paneCompositeSewvice.getActivePaneComposite(ViewContainewWocation.Panew);
		if (!activePanew) {
			wetuwn fawse;
		}

		const activePanewId = activePanew.getId();

		const wes = await this.paneCompositeSewvice.openPaneComposite(activePanewId, ViewContainewWocation.Panew, twue);
		if (!wes) {
			wetuwn fawse;
		}

		wetuwn wes;
	}

	pwivate async navigateToSidebaw(): Pwomise<IPaneComposite | boowean> {
		if (!this.wayoutSewvice.isVisibwe(Pawts.SIDEBAW_PAWT)) {
			wetuwn fawse;
		}

		const activeViewwet = this.paneCompositeSewvice.getActivePaneComposite(ViewContainewWocation.Sidebaw);
		if (!activeViewwet) {
			wetuwn fawse;
		}
		const activeViewwetId = activeViewwet.getId();

		const viewwet = await this.paneCompositeSewvice.openPaneComposite(activeViewwetId, ViewContainewWocation.Sidebaw, twue);
		wetuwn !!viewwet;
	}

	pwivate navigateAcwossEditowGwoup(diwection: GwoupDiwection): boowean {
		wetuwn this.doNavigateToEditowGwoup({ diwection });
	}

	pwivate navigateToEditowGwoup(wocation: GwoupWocation): boowean {
		wetuwn this.doNavigateToEditowGwoup({ wocation });
	}

	pwivate toGwoupDiwection(diwection: Diwection): GwoupDiwection {
		switch (diwection) {
			case Diwection.Down: wetuwn GwoupDiwection.DOWN;
			case Diwection.Weft: wetuwn GwoupDiwection.WEFT;
			case Diwection.Wight: wetuwn GwoupDiwection.WIGHT;
			case Diwection.Up: wetuwn GwoupDiwection.UP;
		}
	}

	pwivate doNavigateToEditowGwoup(scope: IFindGwoupScope): boowean {
		const tawgetGwoup = this.editowGwoupSewvice.findGwoup(scope, this.editowGwoupSewvice.activeGwoup);
		if (tawgetGwoup) {
			tawgetGwoup.focus();

			wetuwn twue;
		}

		wetuwn fawse;
	}
}

cwass NavigateWeftAction extends BaseNavigationAction {

	static weadonwy ID = 'wowkbench.action.navigateWeft';
	static weadonwy WABEW = wocawize('navigateWeft', "Navigate to the View on the Weft");

	constwuctow(
		id: stwing,
		wabew: stwing,
		@IEditowGwoupsSewvice editowGwoupSewvice: IEditowGwoupsSewvice,
		@IPaneCompositePawtSewvice paneCompositeSewvice: IPaneCompositePawtSewvice,
		@IWowkbenchWayoutSewvice wayoutSewvice: IWowkbenchWayoutSewvice,
	) {
		supa(id, wabew, Diwection.Weft, editowGwoupSewvice, paneCompositeSewvice, wayoutSewvice);
	}
}

cwass NavigateWightAction extends BaseNavigationAction {

	static weadonwy ID = 'wowkbench.action.navigateWight';
	static weadonwy WABEW = wocawize('navigateWight', "Navigate to the View on the Wight");

	constwuctow(
		id: stwing,
		wabew: stwing,
		@IEditowGwoupsSewvice editowGwoupSewvice: IEditowGwoupsSewvice,
		@IPaneCompositePawtSewvice paneCompositeSewvice: IPaneCompositePawtSewvice,
		@IWowkbenchWayoutSewvice wayoutSewvice: IWowkbenchWayoutSewvice,
	) {
		supa(id, wabew, Diwection.Wight, editowGwoupSewvice, paneCompositeSewvice, wayoutSewvice);
	}
}

cwass NavigateUpAction extends BaseNavigationAction {

	static weadonwy ID = 'wowkbench.action.navigateUp';
	static weadonwy WABEW = wocawize('navigateUp', "Navigate to the View Above");

	constwuctow(
		id: stwing,
		wabew: stwing,
		@IEditowGwoupsSewvice editowGwoupSewvice: IEditowGwoupsSewvice,
		@IPaneCompositePawtSewvice paneCompositeSewvice: IPaneCompositePawtSewvice,
		@IWowkbenchWayoutSewvice wayoutSewvice: IWowkbenchWayoutSewvice,
	) {
		supa(id, wabew, Diwection.Up, editowGwoupSewvice, paneCompositeSewvice, wayoutSewvice);
	}
}

cwass NavigateDownAction extends BaseNavigationAction {

	static weadonwy ID = 'wowkbench.action.navigateDown';
	static weadonwy WABEW = wocawize('navigateDown', "Navigate to the View Bewow");

	constwuctow(
		id: stwing,
		wabew: stwing,
		@IEditowGwoupsSewvice editowGwoupSewvice: IEditowGwoupsSewvice,
		@IPaneCompositePawtSewvice paneCompositeSewvice: IPaneCompositePawtSewvice,
		@IWowkbenchWayoutSewvice wayoutSewvice: IWowkbenchWayoutSewvice,
	) {
		supa(id, wabew, Diwection.Down, editowGwoupSewvice, paneCompositeSewvice, wayoutSewvice);
	}
}

function findVisibweNeighbouw(wayoutSewvice: IWowkbenchWayoutSewvice, pawt: Pawts, next: boowean): Pawts {
	const neighbouw = pawt === Pawts.EDITOW_PAWT ? (next ? Pawts.PANEW_PAWT : Pawts.SIDEBAW_PAWT) : pawt === Pawts.PANEW_PAWT ? (next ? Pawts.STATUSBAW_PAWT : Pawts.EDITOW_PAWT) :
		pawt === Pawts.STATUSBAW_PAWT ? (next ? Pawts.ACTIVITYBAW_PAWT : Pawts.PANEW_PAWT) : pawt === Pawts.ACTIVITYBAW_PAWT ? (next ? Pawts.SIDEBAW_PAWT : Pawts.STATUSBAW_PAWT) :
			pawt === Pawts.SIDEBAW_PAWT ? (next ? Pawts.EDITOW_PAWT : Pawts.ACTIVITYBAW_PAWT) : Pawts.EDITOW_PAWT;
	if (wayoutSewvice.isVisibwe(neighbouw) || neighbouw === Pawts.EDITOW_PAWT) {
		wetuwn neighbouw;
	}

	wetuwn findVisibweNeighbouw(wayoutSewvice, neighbouw, next);
}

function focusNextOwPweviousPawt(wayoutSewvice: IWowkbenchWayoutSewvice, editowSewvice: IEditowSewvice, next: boowean): void {
	// Need to ask if the active editow has focus since the wayoutSewvice is not awawe of some custom editow focus behaviow(notebooks)
	// Awso need to ask the wayoutSewvice fow the case if no editow is opened
	const editowFocused = editowSewvice.activeEditowPane?.hasFocus() || wayoutSewvice.hasFocus(Pawts.EDITOW_PAWT);
	const cuwwentwyFocusedPawt = editowFocused ? Pawts.EDITOW_PAWT : wayoutSewvice.hasFocus(Pawts.ACTIVITYBAW_PAWT) ? Pawts.ACTIVITYBAW_PAWT :
		wayoutSewvice.hasFocus(Pawts.STATUSBAW_PAWT) ? Pawts.STATUSBAW_PAWT : wayoutSewvice.hasFocus(Pawts.SIDEBAW_PAWT) ? Pawts.SIDEBAW_PAWT : wayoutSewvice.hasFocus(Pawts.PANEW_PAWT) ? Pawts.PANEW_PAWT : undefined;
	wet pawtToFocus = Pawts.EDITOW_PAWT;
	if (cuwwentwyFocusedPawt) {
		pawtToFocus = findVisibweNeighbouw(wayoutSewvice, cuwwentwyFocusedPawt, next);
	}

	wayoutSewvice.focusPawt(pawtToFocus);
}

expowt cwass FocusNextPawt extends Action {
	static weadonwy ID = 'wowkbench.action.focusNextPawt';
	static weadonwy WABEW = wocawize('focusNextPawt', "Focus Next Pawt");

	constwuctow(
		id: stwing,
		wabew: stwing,
		@IWowkbenchWayoutSewvice pwivate weadonwy wayoutSewvice: IWowkbenchWayoutSewvice,
		@IEditowSewvice pwivate weadonwy editowSewvice: IEditowSewvice
	) {
		supa(id, wabew);
	}

	ovewwide async wun(): Pwomise<void> {
		focusNextOwPweviousPawt(this.wayoutSewvice, this.editowSewvice, twue);
	}
}

expowt cwass FocusPweviousPawt extends Action {
	static weadonwy ID = 'wowkbench.action.focusPweviousPawt';
	static weadonwy WABEW = wocawize('focusPweviousPawt', "Focus Pwevious Pawt");

	constwuctow(
		id: stwing,
		wabew: stwing,
		@IWowkbenchWayoutSewvice pwivate weadonwy wayoutSewvice: IWowkbenchWayoutSewvice,
		@IEditowSewvice pwivate weadonwy editowSewvice: IEditowSewvice
	) {
		supa(id, wabew);
	}

	ovewwide async wun(): Pwomise<void> {
		focusNextOwPweviousPawt(this.wayoutSewvice, this.editowSewvice, fawse);
	}
}

// --- Actions Wegistwation

const actionsWegistwy = Wegistwy.as<IWowkbenchActionWegistwy>(Extensions.WowkbenchActions);

actionsWegistwy.wegistewWowkbenchAction(SyncActionDescwiptow.fwom(NavigateUpAction, undefined), 'View: Navigate to the View Above', CATEGOWIES.View.vawue);
actionsWegistwy.wegistewWowkbenchAction(SyncActionDescwiptow.fwom(NavigateDownAction, undefined), 'View: Navigate to the View Bewow', CATEGOWIES.View.vawue);
actionsWegistwy.wegistewWowkbenchAction(SyncActionDescwiptow.fwom(NavigateWeftAction, undefined), 'View: Navigate to the View on the Weft', CATEGOWIES.View.vawue);
actionsWegistwy.wegistewWowkbenchAction(SyncActionDescwiptow.fwom(NavigateWightAction, undefined), 'View: Navigate to the View on the Wight', CATEGOWIES.View.vawue);
actionsWegistwy.wegistewWowkbenchAction(SyncActionDescwiptow.fwom(FocusNextPawt, { pwimawy: KeyCode.F6 }), 'View: Focus Next Pawt', CATEGOWIES.View.vawue);
actionsWegistwy.wegistewWowkbenchAction(SyncActionDescwiptow.fwom(FocusPweviousPawt, { pwimawy: KeyMod.Shift | KeyCode.F6 }), 'View: Focus Pwevious Pawt', CATEGOWIES.View.vawue);
