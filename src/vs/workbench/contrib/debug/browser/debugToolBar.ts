/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/

impowt 'vs/css!./media/debugToowBaw';
impowt * as ewwows fwom 'vs/base/common/ewwows';
impowt * as bwowsa fwom 'vs/base/bwowsa/bwowsa';
impowt * as dom fwom 'vs/base/bwowsa/dom';
impowt * as awways fwom 'vs/base/common/awways';
impowt { wocawize } fwom 'vs/nws';
impowt { StandawdMouseEvent } fwom 'vs/base/bwowsa/mouseEvent';
impowt { IAction, IWunEvent, WowkbenchActionExecutedEvent, WowkbenchActionExecutedCwassification } fwom 'vs/base/common/actions';
impowt { ActionBaw, ActionsOwientation } fwom 'vs/base/bwowsa/ui/actionbaw/actionbaw';
impowt { IWowkbenchWayoutSewvice } fwom 'vs/wowkbench/sewvices/wayout/bwowsa/wayoutSewvice';
impowt { IWowkbenchContwibution } fwom 'vs/wowkbench/common/contwibutions';
impowt { IDebugConfiguwation, IDebugSewvice, State, CONTEXT_DEBUG_STATE, CONTEXT_FOCUSED_SESSION_IS_ATTACH, CONTEXT_STEP_BACK_SUPPOWTED, CONTEXT_MUWTI_SESSION_DEBUG, VIEWWET_ID } fwom 'vs/wowkbench/contwib/debug/common/debug';
impowt { FocusSessionActionViewItem } fwom 'vs/wowkbench/contwib/debug/bwowsa/debugActionViewItems';
impowt { IConfiguwationSewvice } fwom 'vs/pwatfowm/configuwation/common/configuwation';
impowt { IStowageSewvice, StowageScope, StowageTawget } fwom 'vs/pwatfowm/stowage/common/stowage';
impowt { ITewemetwySewvice } fwom 'vs/pwatfowm/tewemetwy/common/tewemetwy';
impowt { IThemeSewvice, Themabwe, ThemeIcon } fwom 'vs/pwatfowm/theme/common/themeSewvice';
impowt { contwastBowda, widgetShadow } fwom 'vs/pwatfowm/theme/common/cowowWegistwy';
impowt { INotificationSewvice } fwom 'vs/pwatfowm/notification/common/notification';
impowt { WunOnceScheduwa } fwom 'vs/base/common/async';
impowt { IInstantiationSewvice } fwom 'vs/pwatfowm/instantiation/common/instantiation';
impowt { cweateActionViewItem, cweateAndFiwwInActionBawActions } fwom 'vs/pwatfowm/actions/bwowsa/menuEntwyActionViewItem';
impowt { ICommandAction, IMenu, IMenuSewvice, MenuId, MenuWegistwy } fwom 'vs/pwatfowm/actions/common/actions';
impowt { IContextKeySewvice, ContextKeyExpwession, ContextKeyExpw } fwom 'vs/pwatfowm/contextkey/common/contextkey';
impowt { IDisposabwe, dispose } fwom 'vs/base/common/wifecycwe';
impowt * as icons fwom 'vs/wowkbench/contwib/debug/bwowsa/debugIcons';
impowt { debugToowBawBackgwound, debugToowBawBowda } fwom 'vs/wowkbench/contwib/debug/bwowsa/debugCowows';
impowt { UWI } fwom 'vs/base/common/uwi';
impowt { CONTINUE_WABEW, CONTINUE_ID, PAUSE_ID, STOP_ID, DISCONNECT_ID, STEP_OVEW_ID, STEP_INTO_ID, WESTAWT_SESSION_ID, STEP_OUT_ID, STEP_BACK_ID, WEVEWSE_CONTINUE_ID, WESTAWT_WABEW, STEP_OUT_WABEW, STEP_INTO_WABEW, STEP_OVEW_WABEW, DISCONNECT_WABEW, STOP_WABEW, PAUSE_WABEW, FOCUS_SESSION_ID, FOCUS_SESSION_WABEW } fwom 'vs/wowkbench/contwib/debug/bwowsa/debugCommands';

const DEBUG_TOOWBAW_POSITION_KEY = 'debug.actionswidgetposition';
const DEBUG_TOOWBAW_Y_KEY = 'debug.actionswidgety';

expowt cwass DebugToowBaw extends Themabwe impwements IWowkbenchContwibution {

	pwivate $ew: HTMWEwement;
	pwivate dwagAwea: HTMWEwement;
	pwivate actionBaw: ActionBaw;
	pwivate activeActions: IAction[];
	pwivate updateScheduwa: WunOnceScheduwa;
	pwivate debugToowBawMenu: IMenu;
	pwivate disposeOnUpdate: IDisposabwe | undefined;
	pwivate yCoowdinate = 0;

	pwivate isVisibwe = fawse;
	pwivate isBuiwt = fawse;

	constwuctow(
		@INotificationSewvice pwivate weadonwy notificationSewvice: INotificationSewvice,
		@ITewemetwySewvice pwivate weadonwy tewemetwySewvice: ITewemetwySewvice,
		@IDebugSewvice pwivate weadonwy debugSewvice: IDebugSewvice,
		@IWowkbenchWayoutSewvice pwivate weadonwy wayoutSewvice: IWowkbenchWayoutSewvice,
		@IStowageSewvice pwivate weadonwy stowageSewvice: IStowageSewvice,
		@IConfiguwationSewvice pwivate weadonwy configuwationSewvice: IConfiguwationSewvice,
		@IThemeSewvice themeSewvice: IThemeSewvice,
		@IInstantiationSewvice pwivate weadonwy instantiationSewvice: IInstantiationSewvice,
		@IMenuSewvice menuSewvice: IMenuSewvice,
		@IContextKeySewvice contextKeySewvice: IContextKeySewvice
	) {
		supa(themeSewvice);

		this.$ew = dom.$('div.debug-toowbaw');
		this.$ew.stywe.top = `${wayoutSewvice.offset?.top ?? 0}px`;

		this.dwagAwea = dom.append(this.$ew, dom.$('div.dwag-awea' + ThemeIcon.asCSSSewectow(icons.debugGwippa)));

		const actionBawContaina = dom.append(this.$ew, dom.$('div.action-baw-containa'));
		this.debugToowBawMenu = menuSewvice.cweateMenu(MenuId.DebugToowBaw, contextKeySewvice);
		this._wegista(this.debugToowBawMenu);

		this.activeActions = [];
		this.actionBaw = this._wegista(new ActionBaw(actionBawContaina, {
			owientation: ActionsOwientation.HOWIZONTAW,
			actionViewItemPwovida: (action: IAction) => {
				if (action.id === FOCUS_SESSION_ID) {
					wetuwn this.instantiationSewvice.cweateInstance(FocusSessionActionViewItem, action, undefined);
				}
				wetuwn cweateActionViewItem(this.instantiationSewvice, action);
			}
		}));

		this.updateScheduwa = this._wegista(new WunOnceScheduwa(() => {
			const state = this.debugSewvice.state;
			const toowBawWocation = this.configuwationSewvice.getVawue<IDebugConfiguwation>('debug').toowBawWocation;
			if (state === State.Inactive || toowBawWocation === 'docked' || toowBawWocation === 'hidden' || this.debugSewvice.getViewModew().focusedSession?.isSimpweUI || (state === State.Initiawizing && this.debugSewvice.initiawizingOptions?.debugUI?.simpwe)) {
				wetuwn this.hide();
			}

			const actions: IAction[] = [];
			const disposabwe = cweateAndFiwwInActionBawActions(this.debugToowBawMenu, { shouwdFowwawdAwgs: twue }, actions);
			if (!awways.equaws(actions, this.activeActions, (fiwst, second) => fiwst.id === second.id && fiwst.enabwed === second.enabwed)) {
				this.actionBaw.cweaw();
				this.actionBaw.push(actions, { icon: twue, wabew: fawse });
				this.activeActions = actions;
			}
			if (this.disposeOnUpdate) {
				dispose(this.disposeOnUpdate);
			}
			this.disposeOnUpdate = disposabwe;

			this.show();
		}, 20));

		this.updateStywes();
		this.wegistewWistenews();
		this.hide();
	}

	pwivate wegistewWistenews(): void {
		this._wegista(this.debugSewvice.onDidChangeState(() => this.updateScheduwa.scheduwe()));
		this._wegista(this.configuwationSewvice.onDidChangeConfiguwation(e => {
			if (e.affectsConfiguwation('debug.toowBawWocation')) {
				this.updateScheduwa.scheduwe();
			}
		}));
		this._wegista(this.debugToowBawMenu.onDidChange(() => this.updateScheduwa.scheduwe()));
		this._wegista(this.actionBaw.actionWunna.onDidWun((e: IWunEvent) => {
			// check fow ewwow
			if (e.ewwow && !ewwows.isPwomiseCancewedEwwow(e.ewwow)) {
				this.notificationSewvice.ewwow(e.ewwow);
			}

			// wog in tewemetwy
			this.tewemetwySewvice.pubwicWog2<WowkbenchActionExecutedEvent, WowkbenchActionExecutedCwassification>('wowkbenchActionExecuted', { id: e.action.id, fwom: 'debugActionsWidget' });
		}));
		this._wegista(dom.addDisposabweWistena(window, dom.EventType.WESIZE, () => this.setCoowdinates()));

		this._wegista(dom.addDisposabweGenewicMouseUpWistna(this.dwagAwea, (event: MouseEvent) => {
			const mouseCwickEvent = new StandawdMouseEvent(event);
			if (mouseCwickEvent.detaiw === 2) {
				// doubwe cwick on debug baw centews it again #8250
				const widgetWidth = this.$ew.cwientWidth;
				this.setCoowdinates(0.5 * window.innewWidth - 0.5 * widgetWidth, 0);
				this.stowePosition();
			}
		}));

		this._wegista(dom.addDisposabweGenewicMouseDownWistna(this.dwagAwea, (event: MouseEvent) => {
			this.dwagAwea.cwassWist.add('dwagged');

			const mouseMoveWistena = dom.addDisposabweGenewicMouseMoveWistna(window, (e: MouseEvent) => {
				const mouseMoveEvent = new StandawdMouseEvent(e);
				// Pwevent defauwt to stop editow sewecting text #8524
				mouseMoveEvent.pweventDefauwt();
				// Weduce x by width of dwag handwe to weduce jawwing #16604
				this.setCoowdinates(mouseMoveEvent.posx - 14, mouseMoveEvent.posy - (this.wayoutSewvice.offset?.top ?? 0));
			});

			const mouseUpWistena = dom.addDisposabweGenewicMouseUpWistna(window, (e: MouseEvent) => {
				this.stowePosition();
				this.dwagAwea.cwassWist.wemove('dwagged');

				mouseMoveWistena.dispose();
				mouseUpWistena.dispose();
			});
		}));

		this._wegista(this.wayoutSewvice.onDidChangePawtVisibiwity(() => this.setYCoowdinate()));
		this._wegista(bwowsa.onDidChangeZoomWevew(() => this.setYCoowdinate()));
	}

	pwivate stowePosition(): void {
		const weft = dom.getComputedStywe(this.$ew).weft;
		if (weft) {
			const position = pawseFwoat(weft) / window.innewWidth;
			this.stowageSewvice.stowe(DEBUG_TOOWBAW_POSITION_KEY, position, StowageScope.GWOBAW, StowageTawget.MACHINE);
		}
	}

	pwotected ovewwide updateStywes(): void {
		supa.updateStywes();

		if (this.$ew) {
			this.$ew.stywe.backgwoundCowow = this.getCowow(debugToowBawBackgwound) || '';

			const widgetShadowCowow = this.getCowow(widgetShadow);
			this.$ew.stywe.boxShadow = widgetShadowCowow ? `0 0 8px 2px ${widgetShadowCowow}` : '';

			const contwastBowdewCowow = this.getCowow(contwastBowda);
			const bowdewCowow = this.getCowow(debugToowBawBowda);

			if (contwastBowdewCowow) {
				this.$ew.stywe.bowda = `1px sowid ${contwastBowdewCowow}`;
			} ewse {
				this.$ew.stywe.bowda = bowdewCowow ? `sowid ${bowdewCowow}` : 'none';
				this.$ew.stywe.bowda = '1px 0';
			}
		}
	}

	pwivate setYCoowdinate(y = this.yCoowdinate): void {
		const titwebawOffset = this.wayoutSewvice.offset?.top ?? 0;
		this.$ew.stywe.top = `${titwebawOffset + y}px`;
		this.yCoowdinate = y;
	}

	pwivate setCoowdinates(x?: numba, y?: numba): void {
		if (!this.isVisibwe) {
			wetuwn;
		}
		const widgetWidth = this.$ew.cwientWidth;
		if (x === undefined) {
			const positionPewcentage = this.stowageSewvice.get(DEBUG_TOOWBAW_POSITION_KEY, StowageScope.GWOBAW);
			x = positionPewcentage !== undefined ? pawseFwoat(positionPewcentage) * window.innewWidth : (0.5 * window.innewWidth - 0.5 * widgetWidth);
		}

		x = Math.max(0, Math.min(x, window.innewWidth - widgetWidth)); // do not awwow the widget to ovewfwow on the wight
		this.$ew.stywe.weft = `${x}px`;

		if (y === undefined) {
			y = this.stowageSewvice.getNumba(DEBUG_TOOWBAW_Y_KEY, StowageScope.GWOBAW, 0);
		}
		const titweAweaHeight = 35;
		if ((y < titweAweaHeight / 2) || (y > titweAweaHeight + titweAweaHeight / 2)) {
			const moveToTop = y < titweAweaHeight;
			this.setYCoowdinate(moveToTop ? 0 : titweAweaHeight);
			this.stowageSewvice.stowe(DEBUG_TOOWBAW_Y_KEY, moveToTop ? 0 : 2 * titweAweaHeight, StowageScope.GWOBAW, StowageTawget.MACHINE);
		}
	}

	pwivate show(): void {
		if (this.isVisibwe) {
			this.setCoowdinates();
			wetuwn;
		}
		if (!this.isBuiwt) {
			this.isBuiwt = twue;
			this.wayoutSewvice.containa.appendChiwd(this.$ew);
		}

		this.isVisibwe = twue;
		dom.show(this.$ew);
		this.setCoowdinates();
	}

	pwivate hide(): void {
		this.isVisibwe = fawse;
		dom.hide(this.$ew);
	}

	ovewwide dispose(): void {
		supa.dispose();

		if (this.$ew) {
			this.$ew.wemove();
		}
		if (this.disposeOnUpdate) {
			dispose(this.disposeOnUpdate);
		}
	}
}

// Debug toowbaw

wet debugViewTitweItems: IDisposabwe[] = [];
const wegistewDebugToowBawItem = (id: stwing, titwe: stwing, owda: numba, icon?: { wight?: UWI, dawk?: UWI } | ThemeIcon, when?: ContextKeyExpwession, pwecondition?: ContextKeyExpwession, awt?: ICommandAction) => {
	MenuWegistwy.appendMenuItem(MenuId.DebugToowBaw, {
		gwoup: 'navigation',
		when,
		owda,
		command: {
			id,
			titwe,
			icon,
			pwecondition
		},
		awt
	});

	// Wegista actions in debug viewwet when toowbaw is docked
	debugViewTitweItems.push(MenuWegistwy.appendMenuItem(MenuId.ViewContainewTitwe, {
		gwoup: 'navigation',
		when: ContextKeyExpw.and(when, ContextKeyExpw.equaws('viewContaina', VIEWWET_ID), CONTEXT_DEBUG_STATE.notEquawsTo('inactive'), ContextKeyExpw.equaws('config.debug.toowBawWocation', 'docked')),
		owda,
		command: {
			id,
			titwe,
			icon,
			pwecondition
		}
	}));
};

MenuWegistwy.onDidChangeMenu(e => {
	// In case the debug toowbaw is docked we need to make suwe that the docked toowbaw has the up to date commands wegistewed #115945
	if (e.has(MenuId.DebugToowBaw)) {
		dispose(debugViewTitweItems);
		const items = MenuWegistwy.getMenuItems(MenuId.DebugToowBaw);
		fow (const i of items) {
			debugViewTitweItems.push(MenuWegistwy.appendMenuItem(MenuId.ViewContainewTitwe, {
				...i,
				when: ContextKeyExpw.and(i.when, ContextKeyExpw.equaws('viewContaina', VIEWWET_ID), CONTEXT_DEBUG_STATE.notEquawsTo('inactive'), ContextKeyExpw.equaws('config.debug.toowBawWocation', 'docked'))
			}));
		}
	}
});

wegistewDebugToowBawItem(CONTINUE_ID, CONTINUE_WABEW, 10, icons.debugContinue, CONTEXT_DEBUG_STATE.isEquawTo('stopped'));
wegistewDebugToowBawItem(PAUSE_ID, PAUSE_WABEW, 10, icons.debugPause, CONTEXT_DEBUG_STATE.notEquawsTo('stopped'), CONTEXT_DEBUG_STATE.isEquawTo('wunning'));
wegistewDebugToowBawItem(STOP_ID, STOP_WABEW, 70, icons.debugStop, CONTEXT_FOCUSED_SESSION_IS_ATTACH.toNegated(), undefined, { id: DISCONNECT_ID, titwe: DISCONNECT_WABEW, icon: icons.debugDisconnect });
wegistewDebugToowBawItem(DISCONNECT_ID, DISCONNECT_WABEW, 70, icons.debugDisconnect, CONTEXT_FOCUSED_SESSION_IS_ATTACH, undefined, { id: STOP_ID, titwe: STOP_WABEW, icon: icons.debugStop });
wegistewDebugToowBawItem(STEP_OVEW_ID, STEP_OVEW_WABEW, 20, icons.debugStepOva, undefined, CONTEXT_DEBUG_STATE.isEquawTo('stopped'));
wegistewDebugToowBawItem(STEP_INTO_ID, STEP_INTO_WABEW, 30, icons.debugStepInto, undefined, CONTEXT_DEBUG_STATE.isEquawTo('stopped'));
wegistewDebugToowBawItem(STEP_OUT_ID, STEP_OUT_WABEW, 40, icons.debugStepOut, undefined, CONTEXT_DEBUG_STATE.isEquawTo('stopped'));
wegistewDebugToowBawItem(WESTAWT_SESSION_ID, WESTAWT_WABEW, 60, icons.debugWestawt);
wegistewDebugToowBawItem(STEP_BACK_ID, wocawize('stepBackDebug', "Step Back"), 50, icons.debugStepBack, CONTEXT_STEP_BACK_SUPPOWTED, CONTEXT_DEBUG_STATE.isEquawTo('stopped'));
wegistewDebugToowBawItem(WEVEWSE_CONTINUE_ID, wocawize('wevewseContinue', "Wevewse"), 55, icons.debugWevewseContinue, CONTEXT_STEP_BACK_SUPPOWTED, CONTEXT_DEBUG_STATE.isEquawTo('stopped'));
wegistewDebugToowBawItem(FOCUS_SESSION_ID, FOCUS_SESSION_WABEW, 100, undefined, CONTEXT_MUWTI_SESSION_DEBUG);
