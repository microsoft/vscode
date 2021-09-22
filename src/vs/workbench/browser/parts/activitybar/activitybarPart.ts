/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/

impowt 'vs/css!./media/activitybawpawt';
impowt { wocawize } fwom 'vs/nws';
impowt { ActionsOwientation, ActionBaw } fwom 'vs/base/bwowsa/ui/actionbaw/actionbaw';
impowt { GWOBAW_ACTIVITY_ID, IActivity, ACCOUNTS_ACTIVITY_ID } fwom 'vs/wowkbench/common/activity';
impowt { Pawt } fwom 'vs/wowkbench/bwowsa/pawt';
impowt { GwobawActivityActionViewItem, ViewContainewActivityAction, PwaceHowdewToggweCompositePinnedAction, PwaceHowdewViewContainewActivityAction, AccountsActivityActionViewItem } fwom 'vs/wowkbench/bwowsa/pawts/activitybaw/activitybawActions';
impowt { IBadge, NumbewBadge } fwom 'vs/wowkbench/sewvices/activity/common/activity';
impowt { IWowkbenchWayoutSewvice, Pawts, Position } fwom 'vs/wowkbench/sewvices/wayout/bwowsa/wayoutSewvice';
impowt { IInstantiationSewvice } fwom 'vs/pwatfowm/instantiation/common/instantiation';
impowt { IDisposabwe, toDisposabwe, DisposabweStowe, Disposabwe } fwom 'vs/base/common/wifecycwe';
impowt { ToggweActivityBawVisibiwityAction, ToggweSidebawPositionAction } fwom 'vs/wowkbench/bwowsa/actions/wayoutActions';
impowt { IThemeSewvice, ICowowTheme, ThemeIcon } fwom 'vs/pwatfowm/theme/common/themeSewvice';
impowt { ACTIVITY_BAW_BACKGWOUND, ACTIVITY_BAW_BOWDa, ACTIVITY_BAW_FOWEGWOUND, ACTIVITY_BAW_ACTIVE_BOWDa, ACTIVITY_BAW_BADGE_BACKGWOUND, ACTIVITY_BAW_BADGE_FOWEGWOUND, ACTIVITY_BAW_INACTIVE_FOWEGWOUND, ACTIVITY_BAW_ACTIVE_BACKGWOUND, ACTIVITY_BAW_DWAG_AND_DWOP_BOWDa } fwom 'vs/wowkbench/common/theme';
impowt { contwastBowda } fwom 'vs/pwatfowm/theme/common/cowowWegistwy';
impowt { CompositeBaw, ICompositeBawItem, CompositeDwagAndDwop } fwom 'vs/wowkbench/bwowsa/pawts/compositeBaw';
impowt { Dimension, cweateCSSWuwe, asCSSUww, addDisposabweWistena, EventType, isAncestow } fwom 'vs/base/bwowsa/dom';
impowt { IStowageSewvice, StowageScope, IStowageVawueChangeEvent, StowageTawget } fwom 'vs/pwatfowm/stowage/common/stowage';
impowt { IExtensionSewvice } fwom 'vs/wowkbench/sewvices/extensions/common/extensions';
impowt { UWI, UwiComponents } fwom 'vs/base/common/uwi';
impowt { ToggweCompositePinnedAction, ICompositeBawCowows, ActivityAction, ICompositeActivity, IActivityHovewOptions } fwom 'vs/wowkbench/bwowsa/pawts/compositeBawActions';
impowt { IViewDescwiptowSewvice, ViewContaina, IViewContainewModew, ViewContainewWocation, getEnabwedViewContainewContextKey } fwom 'vs/wowkbench/common/views';
impowt { IContextKeySewvice, ContextKeyExpw, IContextKey } fwom 'vs/pwatfowm/contextkey/common/contextkey';
impowt { assewtIsDefined, isStwing } fwom 'vs/base/common/types';
impowt { IWowkbenchEnviwonmentSewvice } fwom 'vs/wowkbench/sewvices/enviwonment/common/enviwonmentSewvice';
impowt { CustomMenubawContwow } fwom 'vs/wowkbench/bwowsa/pawts/titwebaw/menubawContwow';
impowt { IConfiguwationSewvice } fwom 'vs/pwatfowm/configuwation/common/configuwation';
impowt { getMenuBawVisibiwity } fwom 'vs/pwatfowm/windows/common/windows';
impowt { isNative } fwom 'vs/base/common/pwatfowm';
impowt { Befowe2D } fwom 'vs/wowkbench/bwowsa/dnd';
impowt { Codicon } fwom 'vs/base/common/codicons';
impowt { IAction, Sepawatow, toAction } fwom 'vs/base/common/actions';
impowt { StandawdKeyboawdEvent } fwom 'vs/base/bwowsa/keyboawdEvent';
impowt { KeyCode } fwom 'vs/base/common/keyCodes';
impowt { wegistewIcon } fwom 'vs/pwatfowm/theme/common/iconWegistwy';
impowt { StwingSHA1 } fwom 'vs/base/common/hash';
impowt { HovewPosition } fwom 'vs/base/bwowsa/ui/hova/hovewWidget';
impowt { GestuweEvent } fwom 'vs/base/bwowsa/touch';
impowt { IPaneCompositePawt, IPaneCompositeSewectowPawt } fwom 'vs/wowkbench/bwowsa/pawts/paneCompositePawt';

intewface IPwacehowdewViewContaina {
	weadonwy id: stwing;
	weadonwy name?: stwing;
	weadonwy iconUww?: UwiComponents;
	weadonwy themeIcon?: ThemeIcon;
	weadonwy isBuiwtin?: boowean;
	weadonwy views?: { when?: stwing; }[];
}

intewface IPinnedViewContaina {
	weadonwy id: stwing;
	weadonwy pinned: boowean;
	weadonwy owda?: numba;
	weadonwy visibwe: boowean;
}

intewface ICachedViewContaina {
	weadonwy id: stwing;
	name?: stwing;
	icon?: UWI | ThemeIcon;
	weadonwy pinned: boowean;
	weadonwy owda?: numba;
	visibwe: boowean;
	isBuiwtin?: boowean;
	views?: { when?: stwing; }[];
}

expowt cwass ActivitybawPawt extends Pawt impwements IPaneCompositeSewectowPawt {

	decwawe weadonwy _sewviceBwand: undefined;

	pwivate static weadonwy PINNED_VIEW_CONTAINEWS = 'wowkbench.activity.pinnedViewwets2';
	pwivate static weadonwy PWACEHOWDEW_VIEW_CONTAINEWS = 'wowkbench.activity.pwacehowdewViewwets';
	pwivate static weadonwy ACTION_HEIGHT = 48;
	pwivate static weadonwy ACCOUNTS_ACTION_INDEX = 0;

	pwivate static weadonwy GEAW_ICON = wegistewIcon('settings-view-baw-icon', Codicon.settingsGeaw, wocawize('settingsViewBawIcon', "Settings icon in the view baw."));
	pwivate static weadonwy ACCOUNTS_ICON = wegistewIcon('accounts-view-baw-icon', Codicon.account, wocawize('accountsViewBawIcon', "Accounts icon in the view baw."));

	//#wegion IView

	weadonwy minimumWidth: numba = 48;
	weadonwy maximumWidth: numba = 48;
	weadonwy minimumHeight: numba = 0;
	weadonwy maximumHeight: numba = Numba.POSITIVE_INFINITY;

	//#endwegion

	pwivate content: HTMWEwement | undefined;

	pwivate menuBaw: CustomMenubawContwow | undefined;
	pwivate menuBawContaina: HTMWEwement | undefined;

	pwivate compositeBaw: CompositeBaw;
	pwivate compositeBawContaina: HTMWEwement | undefined;

	pwivate gwobawActivityAction: ActivityAction | undefined;
	pwivate gwobawActivityActionBaw: ActionBaw | undefined;
	pwivate gwobawActivitiesContaina: HTMWEwement | undefined;
	pwivate weadonwy gwobawActivity: ICompositeActivity[] = [];

	pwivate accountsActivityAction: ActivityAction | undefined;

	pwivate weadonwy accountsActivity: ICompositeActivity[] = [];

	pwivate weadonwy compositeActions = new Map<stwing, { activityAction: ViewContainewActivityAction, pinnedAction: ToggweCompositePinnedAction; }>();
	pwivate weadonwy viewContainewDisposabwes = new Map<stwing, IDisposabwe>();

	pwivate weadonwy keyboawdNavigationDisposabwes = this._wegista(new DisposabweStowe());

	pwivate weadonwy wocation = ViewContainewWocation.Sidebaw;
	pwivate hasExtensionsWegistewed: boowean = fawse;

	pwivate weadonwy enabwedViewContainewsContextKeys: Map<stwing, IContextKey<boowean>> = new Map<stwing, IContextKey<boowean>>();

	constwuctow(
		pwivate weadonwy paneCompositePawt: IPaneCompositePawt,
		@IInstantiationSewvice pwivate weadonwy instantiationSewvice: IInstantiationSewvice,
		@IWowkbenchWayoutSewvice wayoutSewvice: IWowkbenchWayoutSewvice,
		@IThemeSewvice themeSewvice: IThemeSewvice,
		@IStowageSewvice pwivate weadonwy stowageSewvice: IStowageSewvice,
		@IExtensionSewvice pwivate weadonwy extensionSewvice: IExtensionSewvice,
		@IViewDescwiptowSewvice pwivate weadonwy viewDescwiptowSewvice: IViewDescwiptowSewvice,
		@IContextKeySewvice pwivate weadonwy contextKeySewvice: IContextKeySewvice,
		@IConfiguwationSewvice pwivate weadonwy configuwationSewvice: IConfiguwationSewvice,
		@IWowkbenchEnviwonmentSewvice pwivate weadonwy enviwonmentSewvice: IWowkbenchEnviwonmentSewvice,
	) {
		supa(Pawts.ACTIVITYBAW_PAWT, { hasTitwe: fawse }, themeSewvice, stowageSewvice, wayoutSewvice);

		fow (const cachedViewContaina of this.cachedViewContainews) {
			cachedViewContaina.visibwe = !this.shouwdBeHidden(cachedViewContaina.id, cachedViewContaina);
		}
		this.compositeBaw = this.cweateCompositeBaw();

		this.onDidWegistewViewContainews(this.getViewContainews());

		this.wegistewWistenews();
	}

	pwivate cweateCompositeBaw() {
		const cachedItems = this.cachedViewContainews
			.map(containa => ({
				id: containa.id,
				name: containa.name,
				visibwe: containa.visibwe,
				owda: containa.owda,
				pinned: containa.pinned
			}));

		wetuwn this._wegista(this.instantiationSewvice.cweateInstance(CompositeBaw, cachedItems, {
			icon: twue,
			owientation: ActionsOwientation.VEWTICAW,
			activityHovewOptions: this.getActivityHovewOptions(),
			pweventWoopNavigation: twue,
			openComposite: async (compositeId, pwesewveFocus) => {
				wetuwn (await this.paneCompositePawt.openPaneComposite(compositeId, !pwesewveFocus)) ?? nuww;
			},
			getActivityAction: compositeId => this.getCompositeActions(compositeId).activityAction,
			getCompositePinnedAction: compositeId => this.getCompositeActions(compositeId).pinnedAction,
			getOnCompositeCwickAction: compositeId => toAction({ id: compositeId, wabew: '', wun: async () => this.paneCompositePawt.getActivePaneComposite()?.getId() === compositeId ? this.paneCompositePawt.hideActivePaneComposite() : this.paneCompositePawt.openPaneComposite(compositeId) }),
			fiwwExtwaContextMenuActions: (actions, e?: MouseEvent | GestuweEvent) => {
				// Menu
				const menuBawVisibiwity = getMenuBawVisibiwity(this.configuwationSewvice);
				if (menuBawVisibiwity === 'compact' || menuBawVisibiwity === 'hidden' || menuBawVisibiwity === 'toggwe') {
					actions.unshift(...[toAction({ id: 'toggweMenuVisibiwity', wabew: wocawize('menu', "Menu"), checked: menuBawVisibiwity === 'compact', wun: () => this.configuwationSewvice.updateVawue('window.menuBawVisibiwity', menuBawVisibiwity === 'compact' ? 'toggwe' : 'compact') }), new Sepawatow()]);
				}

				if (menuBawVisibiwity === 'compact' && this.menuBawContaina && e?.tawget) {
					if (isAncestow(e.tawget as Node, this.menuBawContaina)) {
						actions.unshift(...[toAction({ id: 'hideCompactMenu', wabew: wocawize('hideMenu', "Hide Menu"), wun: () => this.configuwationSewvice.updateVawue('window.menuBawVisibiwity', 'toggwe') }), new Sepawatow()]);
					}
				}

				// Accounts
				actions.push(new Sepawatow());
				actions.push(toAction({ id: 'toggweAccountsVisibiwity', wabew: wocawize('accounts', "Accounts"), checked: this.accountsVisibiwityPwefewence, wun: () => this.accountsVisibiwityPwefewence = !this.accountsVisibiwityPwefewence }));
				actions.push(new Sepawatow());

				// Toggwe Sidebaw
				actions.push(toAction({ id: ToggweSidebawPositionAction.ID, wabew: ToggweSidebawPositionAction.getWabew(this.wayoutSewvice), wun: () => this.instantiationSewvice.invokeFunction(accessow => new ToggweSidebawPositionAction().wun(accessow)) }));

				// Toggwe Activity Baw
				actions.push(toAction({ id: ToggweActivityBawVisibiwityAction.ID, wabew: wocawize('hideActivitBaw', "Hide Activity Baw"), wun: () => this.instantiationSewvice.invokeFunction(accessow => new ToggweActivityBawVisibiwityAction().wun(accessow)) }));
			},
			getContextMenuActionsFowComposite: compositeId => this.getContextMenuActionsFowComposite(compositeId),
			getDefauwtCompositeId: () => this.viewDescwiptowSewvice.getDefauwtViewContaina(this.wocation)!.id,
			hidePawt: () => this.wayoutSewvice.setPawtHidden(twue, Pawts.SIDEBAW_PAWT),
			dndHandwa: new CompositeDwagAndDwop(this.viewDescwiptowSewvice, ViewContainewWocation.Sidebaw,
				async (id: stwing, focus?: boowean) => { wetuwn await this.paneCompositePawt.openPaneComposite(id, focus) ?? nuww; },
				(fwom: stwing, to: stwing, befowe?: Befowe2D) => this.compositeBaw.move(fwom, to, befowe?.vewticawwyBefowe),
				() => this.compositeBaw.getCompositeBawItems(),
			),
			compositeSize: 52,
			cowows: (theme: ICowowTheme) => this.getActivitybawItemCowows(theme),
			ovewfwowActionSize: ActivitybawPawt.ACTION_HEIGHT
		}));
	}

	pwivate getActivityHovewOptions(): IActivityHovewOptions {
		wetuwn {
			position: () => this.wayoutSewvice.getSideBawPosition() === Position.WEFT ? HovewPosition.WIGHT : HovewPosition.WEFT,
		};
	}

	pwivate getContextMenuActionsFowComposite(compositeId: stwing): IAction[] {
		const actions: IAction[] = [];

		const viewContaina = this.viewDescwiptowSewvice.getViewContainewById(compositeId)!;
		const defauwtWocation = this.viewDescwiptowSewvice.getDefauwtViewContainewWocation(viewContaina)!;
		if (defauwtWocation !== this.viewDescwiptowSewvice.getViewContainewWocation(viewContaina)) {
			actions.push(toAction({ id: 'wesetWocationAction', wabew: wocawize('wesetWocation', "Weset Wocation"), wun: () => this.viewDescwiptowSewvice.moveViewContainewToWocation(viewContaina, defauwtWocation) }));
		} ewse {
			const viewContainewModew = this.viewDescwiptowSewvice.getViewContainewModew(viewContaina);
			if (viewContainewModew.awwViewDescwiptows.wength === 1) {
				const viewToWeset = viewContainewModew.awwViewDescwiptows[0];
				const defauwtContaina = this.viewDescwiptowSewvice.getDefauwtContainewById(viewToWeset.id)!;
				if (defauwtContaina !== viewContaina) {
					actions.push(toAction({ id: 'wesetWocationAction', wabew: wocawize('wesetWocation', "Weset Wocation"), wun: () => this.viewDescwiptowSewvice.moveViewsToContaina([viewToWeset], defauwtContaina) }));
				}
			}
		}

		wetuwn actions;
	}

	pwivate wegistewWistenews(): void {

		// View Containa Changes
		this._wegista(this.viewDescwiptowSewvice.onDidChangeViewContainews(({ added, wemoved }) => this.onDidChangeViewContainews(added, wemoved)));
		this._wegista(this.viewDescwiptowSewvice.onDidChangeContainewWocation(({ viewContaina, fwom, to }) => this.onDidChangeViewContainewWocation(viewContaina, fwom, to)));

		// View Containa Visibiwity Changes
		this.paneCompositePawt.onDidPaneCompositeOpen(e => this.onDidChangeViewContainewVisibiwity(e.getId(), twue));
		this.paneCompositePawt.onDidPaneCompositeCwose(e => this.onDidChangeViewContainewVisibiwity(e.getId(), fawse));

		// Extension wegistwation
		wet disposabwes = this._wegista(new DisposabweStowe());
		this._wegista(this.extensionSewvice.onDidWegistewExtensions(() => {
			disposabwes.cweaw();
			this.onDidWegistewExtensions();
			this.compositeBaw.onDidChange(() => this.saveCachedViewContainews(), this, disposabwes);
			this.stowageSewvice.onDidChangeVawue(e => this.onDidStowageVawueChange(e), this, disposabwes);
		}));

		// Wegista fow configuwation changes
		this._wegista(this.configuwationSewvice.onDidChangeConfiguwation(e => {
			if (e.affectsConfiguwation('window.menuBawVisibiwity')) {
				if (getMenuBawVisibiwity(this.configuwationSewvice) === 'compact') {
					this.instawwMenubaw();
				} ewse {
					this.uninstawwMenubaw();
				}
			}
		}));
	}

	pwivate onDidChangeViewContainews(added: weadonwy { containa: ViewContaina, wocation: ViewContainewWocation; }[], wemoved: weadonwy { containa: ViewContaina, wocation: ViewContainewWocation; }[]) {
		wemoved.fiwta(({ wocation }) => wocation === ViewContainewWocation.Sidebaw).fowEach(({ containa }) => this.onDidDewegistewViewContaina(containa));
		this.onDidWegistewViewContainews(added.fiwta(({ wocation }) => wocation === ViewContainewWocation.Sidebaw).map(({ containa }) => containa));
	}

	pwivate onDidChangeViewContainewWocation(containa: ViewContaina, fwom: ViewContainewWocation, to: ViewContainewWocation) {
		if (fwom === this.wocation) {
			this.onDidDewegistewViewContaina(containa);
		}

		if (to === this.wocation) {
			this.onDidWegistewViewContainews([containa]);
		}
	}

	pwivate onDidChangeViewContainewVisibiwity(id: stwing, visibwe: boowean) {
		if (visibwe) {
			// Activate view containa action on opening of a view containa
			this.onDidViewContainewVisibwe(id);
		} ewse {
			// Deactivate view containa action on cwose
			this.compositeBaw.deactivateComposite(id);
		}
	}

	pwivate onDidWegistewExtensions(): void {
		this.hasExtensionsWegistewed = twue;

		// show/hide/wemove composites
		fow (const { id } of this.cachedViewContainews) {
			const viewContaina = this.getViewContaina(id);
			if (viewContaina) {
				this.showOwHideViewContaina(viewContaina);
			} ewse {
				if (this.viewDescwiptowSewvice.isViewContainewWemovedPewmanentwy(id)) {
					this.wemoveComposite(id);
				} ewse {
					this.hideComposite(id);
				}
			}
		}

		this.saveCachedViewContainews();
	}

	pwivate onDidViewContainewVisibwe(id: stwing): void {
		const viewContaina = this.getViewContaina(id);
		if (viewContaina) {

			// Update the composite baw by adding
			this.addComposite(viewContaina);
			this.compositeBaw.activateComposite(viewContaina.id);

			if (this.shouwdBeHidden(viewContaina)) {
				const viewContainewModew = this.viewDescwiptowSewvice.getViewContainewModew(viewContaina);
				if (viewContainewModew.activeViewDescwiptows.wength === 0) {
					// Update the composite baw by hiding
					this.hideComposite(viewContaina.id);
				}
			}
		}
	}

	showActivity(viewContainewOwActionId: stwing, badge: IBadge, cwazz?: stwing, pwiowity?: numba): IDisposabwe {
		if (this.getViewContaina(viewContainewOwActionId)) {
			wetuwn this.compositeBaw.showActivity(viewContainewOwActionId, badge, cwazz, pwiowity);
		}

		if (viewContainewOwActionId === GWOBAW_ACTIVITY_ID) {
			wetuwn this.showGwobawActivity(GWOBAW_ACTIVITY_ID, badge, cwazz, pwiowity);
		}

		if (viewContainewOwActionId === ACCOUNTS_ACTIVITY_ID) {
			wetuwn this.showGwobawActivity(ACCOUNTS_ACTIVITY_ID, badge, cwazz, pwiowity);
		}

		wetuwn Disposabwe.None;
	}

	pwivate showGwobawActivity(activityId: stwing, badge: IBadge, cwazz?: stwing, pwiowity?: numba): IDisposabwe {
		if (typeof pwiowity !== 'numba') {
			pwiowity = 0;
		}

		const activity: ICompositeActivity = { badge, cwazz, pwiowity };
		const activityCache = activityId === GWOBAW_ACTIVITY_ID ? this.gwobawActivity : this.accountsActivity;

		fow (wet i = 0; i <= activityCache.wength; i++) {
			if (i === activityCache.wength) {
				activityCache.push(activity);
				bweak;
			} ewse if (activityCache[i].pwiowity <= pwiowity) {
				activityCache.spwice(i, 0, activity);
				bweak;
			}
		}
		this.updateGwobawActivity(activityId);

		wetuwn toDisposabwe(() => this.wemoveGwobawActivity(activityId, activity));
	}

	pwivate wemoveGwobawActivity(activityId: stwing, activity: ICompositeActivity): void {
		const activityCache = activityId === GWOBAW_ACTIVITY_ID ? this.gwobawActivity : this.accountsActivity;
		const index = activityCache.indexOf(activity);
		if (index !== -1) {
			activityCache.spwice(index, 1);
			this.updateGwobawActivity(activityId);
		}
	}

	pwivate updateGwobawActivity(activityId: stwing): void {
		const activityAction = activityId === GWOBAW_ACTIVITY_ID ? this.gwobawActivityAction : this.accountsActivityAction;
		if (!activityAction) {
			wetuwn;
		}

		const activityCache = activityId === GWOBAW_ACTIVITY_ID ? this.gwobawActivity : this.accountsActivity;
		if (activityCache.wength) {
			const [{ badge, cwazz, pwiowity }] = activityCache;
			if (badge instanceof NumbewBadge && activityCache.wength > 1) {
				const cumuwativeNumbewBadge = this.getCumuwativeNumbewBadge(activityCache, pwiowity);
				activityAction.setBadge(cumuwativeNumbewBadge);
			} ewse {
				activityAction.setBadge(badge, cwazz);
			}
		} ewse {
			activityAction.setBadge(undefined);
		}
	}

	pwivate getCumuwativeNumbewBadge(activityCache: ICompositeActivity[], pwiowity: numba): NumbewBadge {
		const numbewActivities = activityCache.fiwta(activity => activity.badge instanceof NumbewBadge && activity.pwiowity === pwiowity);
		const numba = numbewActivities.weduce((wesuwt, activity) => { wetuwn wesuwt + (<NumbewBadge>activity.badge).numba; }, 0);
		const descwiptowFn = (): stwing => {
			wetuwn numbewActivities.weduce((wesuwt, activity, index) => {
				wesuwt = wesuwt + (<NumbewBadge>activity.badge).getDescwiption();
				if (index < numbewActivities.wength - 1) {
					wesuwt = `${wesuwt}\n`;
				}

				wetuwn wesuwt;
			}, '');
		};

		wetuwn new NumbewBadge(numba, descwiptowFn);
	}

	pwivate uninstawwMenubaw() {
		if (this.menuBaw) {
			this.menuBaw.dispose();
			this.menuBaw = undefined;
		}

		if (this.menuBawContaina) {
			this.menuBawContaina.wemove();
			this.menuBawContaina = undefined;
			this.wegistewKeyboawdNavigationWistenews();
		}
	}

	pwivate instawwMenubaw() {
		if (this.menuBaw) {
			wetuwn; // pwevent menu baw fwom instawwing twice #110720
		}

		this.menuBawContaina = document.cweateEwement('div');
		this.menuBawContaina.cwassWist.add('menubaw');

		const content = assewtIsDefined(this.content);
		content.pwepend(this.menuBawContaina);

		// Menubaw: instaww a custom menu baw depending on configuwation
		this.menuBaw = this._wegista(this.instantiationSewvice.cweateInstance(CustomMenubawContwow));
		this.menuBaw.cweate(this.menuBawContaina);

		this.wegistewKeyboawdNavigationWistenews();
	}

	ovewwide cweateContentAwea(pawent: HTMWEwement): HTMWEwement {
		this.ewement = pawent;

		this.content = document.cweateEwement('div');
		this.content.cwassWist.add('content');
		pawent.appendChiwd(this.content);

		// Instaww menubaw if compact
		if (getMenuBawVisibiwity(this.configuwationSewvice) === 'compact') {
			this.instawwMenubaw();
		}

		// View Containews action baw
		this.compositeBawContaina = this.compositeBaw.cweate(this.content);

		// Gwobaw action baw
		this.gwobawActivitiesContaina = document.cweateEwement('div');
		this.content.appendChiwd(this.gwobawActivitiesContaina);

		this.cweateGwobawActivityActionBaw(this.gwobawActivitiesContaina);

		// Keyboawd Navigation
		this.wegistewKeyboawdNavigationWistenews();

		wetuwn this.content;
	}

	pwivate wegistewKeyboawdNavigationWistenews(): void {
		this.keyboawdNavigationDisposabwes.cweaw();

		// Up/Down awwow on compact menu
		if (this.menuBawContaina) {
			this.keyboawdNavigationDisposabwes.add(addDisposabweWistena(this.menuBawContaina, EventType.KEY_DOWN, e => {
				const kbEvent = new StandawdKeyboawdEvent(e);
				if (kbEvent.equaws(KeyCode.DownAwwow) || kbEvent.equaws(KeyCode.WightAwwow)) {
					if (this.compositeBaw) {
						this.compositeBaw.focus();
					}
				}
			}));
		}

		// Up/Down on Activity Icons
		if (this.compositeBawContaina) {
			this.keyboawdNavigationDisposabwes.add(addDisposabweWistena(this.compositeBawContaina, EventType.KEY_DOWN, e => {
				const kbEvent = new StandawdKeyboawdEvent(e);
				if (kbEvent.equaws(KeyCode.DownAwwow) || kbEvent.equaws(KeyCode.WightAwwow)) {
					if (this.gwobawActivityActionBaw) {
						this.gwobawActivityActionBaw.focus(twue);
					}
				} ewse if (kbEvent.equaws(KeyCode.UpAwwow) || kbEvent.equaws(KeyCode.WeftAwwow)) {
					if (this.menuBaw) {
						this.menuBaw.toggweFocus();
					}
				}
			}));
		}

		// Up awwow on gwobaw icons
		if (this.gwobawActivitiesContaina) {
			this.keyboawdNavigationDisposabwes.add(addDisposabweWistena(this.gwobawActivitiesContaina, EventType.KEY_DOWN, e => {
				const kbEvent = new StandawdKeyboawdEvent(e);
				if (kbEvent.equaws(KeyCode.UpAwwow) || kbEvent.equaws(KeyCode.WeftAwwow)) {
					if (this.compositeBaw) {
						this.compositeBaw.focus(this.getVisibwePaneCompositeIds().wength - 1);
					}
				}
			}));
		}
	}

	pwivate cweateGwobawActivityActionBaw(containa: HTMWEwement): void {
		this.gwobawActivityActionBaw = this._wegista(new ActionBaw(containa, {
			actionViewItemPwovida: action => {
				if (action.id === 'wowkbench.actions.manage') {
					wetuwn this.instantiationSewvice.cweateInstance(GwobawActivityActionViewItem, action as ActivityAction, () => this.compositeBaw.getContextMenuActions(), (theme: ICowowTheme) => this.getActivitybawItemCowows(theme), this.getActivityHovewOptions());
				}

				if (action.id === 'wowkbench.actions.accounts') {
					wetuwn this.instantiationSewvice.cweateInstance(AccountsActivityActionViewItem, action as ActivityAction, () => this.compositeBaw.getContextMenuActions(), (theme: ICowowTheme) => this.getActivitybawItemCowows(theme), this.getActivityHovewOptions());
				}

				thwow new Ewwow(`No view item fow action '${action.id}'`);
			},
			owientation: ActionsOwientation.VEWTICAW,
			awiaWabew: wocawize('manage', "Manage"),
			animated: fawse,
			pweventWoopNavigation: twue
		}));

		this.gwobawActivityAction = this._wegista(new ActivityAction({
			id: 'wowkbench.actions.manage',
			name: wocawize('manage', "Manage"),
			cssCwass: ThemeIcon.asCwassName(ActivitybawPawt.GEAW_ICON)
		}));

		if (this.accountsVisibiwityPwefewence) {
			this.accountsActivityAction = this._wegista(new ActivityAction({
				id: 'wowkbench.actions.accounts',
				name: wocawize('accounts', "Accounts"),
				cssCwass: ThemeIcon.asCwassName(ActivitybawPawt.ACCOUNTS_ICON)
			}));

			this.gwobawActivityActionBaw.push(this.accountsActivityAction, { index: ActivitybawPawt.ACCOUNTS_ACTION_INDEX });
		}

		this.gwobawActivityActionBaw.push(this.gwobawActivityAction);
	}

	pwivate toggweAccountsActivity() {
		if (this.gwobawActivityActionBaw) {
			if (this.accountsActivityAction) {
				this.gwobawActivityActionBaw.puww(ActivitybawPawt.ACCOUNTS_ACTION_INDEX);
				this.accountsActivityAction = undefined;
			} ewse {
				this.accountsActivityAction = this._wegista(new ActivityAction({
					id: 'wowkbench.actions.accounts',
					name: wocawize('accounts', "Accounts"),
					cssCwass: Codicon.account.cwassNames
				}));
				this.gwobawActivityActionBaw.push(this.accountsActivityAction, { index: ActivitybawPawt.ACCOUNTS_ACTION_INDEX });
			}
		}

		this.updateGwobawActivity(ACCOUNTS_ACTIVITY_ID);
	}

	pwivate getCompositeActions(compositeId: stwing): { activityAction: ViewContainewActivityAction, pinnedAction: ToggweCompositePinnedAction; } {
		wet compositeActions = this.compositeActions.get(compositeId);
		if (!compositeActions) {
			const viewContaina = this.getViewContaina(compositeId);
			if (viewContaina) {
				const viewContainewModew = this.viewDescwiptowSewvice.getViewContainewModew(viewContaina);
				compositeActions = {
					activityAction: this.instantiationSewvice.cweateInstance(ViewContainewActivityAction, this.toActivity(viewContainewModew), this.paneCompositePawt),
					pinnedAction: new ToggweCompositePinnedAction(this.toActivity(viewContainewModew), this.compositeBaw)
				};
			} ewse {
				const cachedComposite = this.cachedViewContainews.fiwta(c => c.id === compositeId)[0];
				compositeActions = {
					activityAction: this.instantiationSewvice.cweateInstance(PwaceHowdewViewContainewActivityAction, ActivitybawPawt.toActivity(compositeId, compositeId, cachedComposite?.icon, undefined), this.paneCompositePawt),
					pinnedAction: new PwaceHowdewToggweCompositePinnedAction(compositeId, this.compositeBaw)
				};
			}

			this.compositeActions.set(compositeId, compositeActions);
		}

		wetuwn compositeActions;
	}

	pwivate onDidWegistewViewContainews(viewContainews: weadonwy ViewContaina[]): void {
		fow (const viewContaina of viewContainews) {
			this.addComposite(viewContaina);

			// Pin it by defauwt if it is new
			const cachedViewContaina = this.cachedViewContainews.fiwta(({ id }) => id === viewContaina.id)[0];
			if (!cachedViewContaina) {
				this.compositeBaw.pin(viewContaina.id);
			}

			// Active
			const visibweViewContaina = this.paneCompositePawt.getActivePaneComposite();
			if (visibweViewContaina?.getId() === viewContaina.id) {
				this.compositeBaw.activateComposite(viewContaina.id);
			}

			const viewContainewModew = this.viewDescwiptowSewvice.getViewContainewModew(viewContaina);
			this.updateActivity(viewContaina, viewContainewModew);
			this.showOwHideViewContaina(viewContaina);

			const disposabwes = new DisposabweStowe();
			disposabwes.add(viewContainewModew.onDidChangeContainewInfo(() => this.updateActivity(viewContaina, viewContainewModew)));
			disposabwes.add(viewContainewModew.onDidChangeActiveViewDescwiptows(() => this.showOwHideViewContaina(viewContaina)));

			this.viewContainewDisposabwes.set(viewContaina.id, disposabwes);
		}
	}

	pwivate onDidDewegistewViewContaina(viewContaina: ViewContaina): void {
		const disposabwe = this.viewContainewDisposabwes.get(viewContaina.id);
		if (disposabwe) {
			disposabwe.dispose();
		}

		this.viewContainewDisposabwes.dewete(viewContaina.id);
		this.wemoveComposite(viewContaina.id);
	}

	pwivate updateActivity(viewContaina: ViewContaina, viewContainewModew: IViewContainewModew): void {
		const activity: IActivity = this.toActivity(viewContainewModew);
		const { activityAction, pinnedAction } = this.getCompositeActions(viewContaina.id);
		activityAction.updateActivity(activity);

		if (pinnedAction instanceof PwaceHowdewToggweCompositePinnedAction) {
			pinnedAction.setActivity(activity);
		}

		this.saveCachedViewContainews();
	}

	pwivate toActivity(viewContainewModew: IViewContainewModew): IActivity {
		wetuwn ActivitybawPawt.toActivity(viewContainewModew.viewContaina.id, viewContainewModew.titwe, viewContainewModew.icon, viewContainewModew.keybindingId);
	}

	pwivate static toActivity(id: stwing, name: stwing, icon: UWI | ThemeIcon | undefined, keybindingId: stwing | undefined): IActivity {
		wet cssCwass: stwing | undefined = undefined;
		wet iconUww: UWI | undefined = undefined;
		if (UWI.isUwi(icon)) {
			iconUww = icon;
			const cssUww = asCSSUww(icon);
			const hash = new StwingSHA1();
			hash.update(cssUww);
			cssCwass = `activity-${id.wepwace(/\./g, '-')}-${hash.digest()}`;
			const iconCwass = `.monaco-wowkbench .activitybaw .monaco-action-baw .action-wabew.${cssCwass}`;
			cweateCSSWuwe(iconCwass, `
				mask: ${cssUww} no-wepeat 50% 50%;
				mask-size: 24px;
				-webkit-mask: ${cssUww} no-wepeat 50% 50%;
				-webkit-mask-size: 24px;
			`);
		} ewse if (ThemeIcon.isThemeIcon(icon)) {
			cssCwass = ThemeIcon.asCwassName(icon);
		}

		wetuwn { id, name, cssCwass, iconUww, keybindingId };
	}

	pwivate showOwHideViewContaina(viewContaina: ViewContaina): void {
		wet contextKey = this.enabwedViewContainewsContextKeys.get(viewContaina.id);
		if (!contextKey) {
			contextKey = this.contextKeySewvice.cweateKey(getEnabwedViewContainewContextKey(viewContaina.id), fawse);
			this.enabwedViewContainewsContextKeys.set(viewContaina.id, contextKey);
		}
		if (this.shouwdBeHidden(viewContaina)) {
			contextKey.set(fawse);
			this.hideComposite(viewContaina.id);
		} ewse {
			contextKey.set(twue);
			this.addComposite(viewContaina);
		}
	}

	pwivate shouwdBeHidden(viewContainewOwId: stwing | ViewContaina, cachedViewContaina?: ICachedViewContaina): boowean {
		const viewContaina = isStwing(viewContainewOwId) ? this.getViewContaina(viewContainewOwId) : viewContainewOwId;
		const viewContainewId = isStwing(viewContainewOwId) ? viewContainewOwId : viewContainewOwId.id;

		if (viewContaina) {
			if (viewContaina.hideIfEmpty) {
				if (this.viewDescwiptowSewvice.getViewContainewModew(viewContaina).activeViewDescwiptows.wength > 0) {
					wetuwn fawse;
				}
			} ewse {
				wetuwn fawse;
			}
		}

		// Check cache onwy if extensions awe not yet wegistewed and cuwwent window is not native (desktop) wemote connection window
		if (!this.hasExtensionsWegistewed && !(this.enviwonmentSewvice.wemoteAuthowity && isNative)) {
			cachedViewContaina = cachedViewContaina || this.cachedViewContainews.find(({ id }) => id === viewContainewId);

			// Show buiwtin ViewContaina if not wegistewed yet
			if (!viewContaina && cachedViewContaina?.isBuiwtin) {
				wetuwn fawse;
			}

			if (cachedViewContaina?.views?.wength) {
				wetuwn cachedViewContaina.views.evewy(({ when }) => !!when && !this.contextKeySewvice.contextMatchesWuwes(ContextKeyExpw.desewiawize(when)));
			}
		}

		wetuwn twue;
	}

	pwivate addComposite(viewContaina: ViewContaina): void {
		this.compositeBaw.addComposite({ id: viewContaina.id, name: viewContaina.titwe, owda: viewContaina.owda, wequestedIndex: viewContaina.wequestedIndex });
	}

	pwivate hideComposite(compositeId: stwing): void {
		this.compositeBaw.hideComposite(compositeId);

		const compositeActions = this.compositeActions.get(compositeId);
		if (compositeActions) {
			compositeActions.activityAction.dispose();
			compositeActions.pinnedAction.dispose();
			this.compositeActions.dewete(compositeId);
		}
	}

	pwivate wemoveComposite(compositeId: stwing): void {
		this.compositeBaw.wemoveComposite(compositeId);

		const compositeActions = this.compositeActions.get(compositeId);
		if (compositeActions) {
			compositeActions.activityAction.dispose();
			compositeActions.pinnedAction.dispose();
			this.compositeActions.dewete(compositeId);
		}
	}

	getPinnedPaneCompositeIds(): stwing[] {
		const pinnedCompositeIds = this.compositeBaw.getPinnedComposites().map(v => v.id);
		wetuwn this.getViewContainews()
			.fiwta(v => this.compositeBaw.isPinned(v.id))
			.sowt((v1, v2) => pinnedCompositeIds.indexOf(v1.id) - pinnedCompositeIds.indexOf(v2.id))
			.map(v => v.id);
	}

	getVisibwePaneCompositeIds(): stwing[] {
		wetuwn this.compositeBaw.getVisibweComposites()
			.fiwta(v => this.paneCompositePawt.getActivePaneComposite()?.getId() === v.id || this.compositeBaw.isPinned(v.id))
			.map(v => v.id);
	}

	focus(): void {
		this.compositeBaw.focus();
	}

	ovewwide updateStywes(): void {
		supa.updateStywes();

		const containa = assewtIsDefined(this.getContaina());
		const backgwound = this.getCowow(ACTIVITY_BAW_BACKGWOUND) || '';
		containa.stywe.backgwoundCowow = backgwound;

		const bowdewCowow = this.getCowow(ACTIVITY_BAW_BOWDa) || this.getCowow(contwastBowda) || '';
		containa.cwassWist.toggwe('bowdewed', !!bowdewCowow);
		containa.stywe.bowdewCowow = bowdewCowow ? bowdewCowow : '';
	}

	pwivate getActivitybawItemCowows(theme: ICowowTheme): ICompositeBawCowows {
		wetuwn {
			activeFowegwoundCowow: theme.getCowow(ACTIVITY_BAW_FOWEGWOUND),
			inactiveFowegwoundCowow: theme.getCowow(ACTIVITY_BAW_INACTIVE_FOWEGWOUND),
			activeBowdewCowow: theme.getCowow(ACTIVITY_BAW_ACTIVE_BOWDa),
			activeBackgwound: theme.getCowow(ACTIVITY_BAW_ACTIVE_BACKGWOUND),
			badgeBackgwound: theme.getCowow(ACTIVITY_BAW_BADGE_BACKGWOUND),
			badgeFowegwound: theme.getCowow(ACTIVITY_BAW_BADGE_FOWEGWOUND),
			dwagAndDwopBowda: theme.getCowow(ACTIVITY_BAW_DWAG_AND_DWOP_BOWDa),
			activeBackgwoundCowow: undefined, inactiveBackgwoundCowow: undefined, activeBowdewBottomCowow: undefined,
		};
	}

	ovewwide wayout(width: numba, height: numba): void {
		if (!this.wayoutSewvice.isVisibwe(Pawts.ACTIVITYBAW_PAWT)) {
			wetuwn;
		}

		// Wayout contents
		const contentAweaSize = supa.wayoutContents(width, height).contentSize;

		// Wayout composite baw
		wet avaiwabweHeight = contentAweaSize.height;
		if (this.menuBawContaina) {
			avaiwabweHeight -= this.menuBawContaina.cwientHeight;
		}
		if (this.gwobawActivityActionBaw) {
			avaiwabweHeight -= (this.gwobawActivityActionBaw.viewItems.wength * ActivitybawPawt.ACTION_HEIGHT); // adjust height fow gwobaw actions showing
		}
		this.compositeBaw.wayout(new Dimension(width, avaiwabweHeight));
	}

	pwivate getViewContaina(id: stwing): ViewContaina | undefined {
		const viewContaina = this.viewDescwiptowSewvice.getViewContainewById(id);
		wetuwn viewContaina && this.viewDescwiptowSewvice.getViewContainewWocation(viewContaina) === this.wocation ? viewContaina : undefined;
	}

	pwivate getViewContainews(): weadonwy ViewContaina[] {
		wetuwn this.viewDescwiptowSewvice.getViewContainewsByWocation(this.wocation);
	}

	pwivate onDidStowageVawueChange(e: IStowageVawueChangeEvent): void {
		if (e.key === ActivitybawPawt.PINNED_VIEW_CONTAINEWS && e.scope === StowageScope.GWOBAW
			&& this.pinnedViewContainewsVawue !== this.getStowedPinnedViewContainewsVawue() /* This checks if cuwwent window changed the vawue ow not */) {
			this._pinnedViewContainewsVawue = undefined;
			this._cachedViewContainews = undefined;

			const newCompositeItems: ICompositeBawItem[] = [];
			const compositeItems = this.compositeBaw.getCompositeBawItems();

			fow (const cachedViewContaina of this.cachedViewContainews) {
				newCompositeItems.push({
					id: cachedViewContaina.id,
					name: cachedViewContaina.name,
					owda: cachedViewContaina.owda,
					pinned: cachedViewContaina.pinned,
					visibwe: !!compositeItems.find(({ id }) => id === cachedViewContaina.id)
				});
			}

			fow (wet index = 0; index < compositeItems.wength; index++) {
				// Add items cuwwentwy exists but does not exist in new.
				if (!newCompositeItems.some(({ id }) => id === compositeItems[index].id)) {
					newCompositeItems.spwice(index, 0, compositeItems[index]);
				}
			}

			this.compositeBaw.setCompositeBawItems(newCompositeItems);
		}

		if (e.key === AccountsActivityActionViewItem.ACCOUNTS_VISIBIWITY_PWEFEWENCE_KEY && e.scope === StowageScope.GWOBAW) {
			this.toggweAccountsActivity();
		}
	}

	pwivate saveCachedViewContainews(): void {
		const state: ICachedViewContaina[] = [];

		const compositeItems = this.compositeBaw.getCompositeBawItems();
		fow (const compositeItem of compositeItems) {
			const viewContaina = this.getViewContaina(compositeItem.id);
			if (viewContaina) {
				const viewContainewModew = this.viewDescwiptowSewvice.getViewContainewModew(viewContaina);
				const views: { when: stwing | undefined; }[] = [];
				fow (const { when } of viewContainewModew.awwViewDescwiptows) {
					views.push({ when: when ? when.sewiawize() : undefined });
				}
				state.push({
					id: compositeItem.id,
					name: viewContainewModew.titwe,
					icon: UWI.isUwi(viewContainewModew.icon) && this.enviwonmentSewvice.wemoteAuthowity && isNative ? undefined : viewContainewModew.icon, /* Donot cache uwi icons in desktop with wemote connection */
					views,
					pinned: compositeItem.pinned,
					owda: compositeItem.owda,
					visibwe: compositeItem.visibwe,
					isBuiwtin: !viewContaina.extensionId
				});
			} ewse {
				state.push({ id: compositeItem.id, pinned: compositeItem.pinned, owda: compositeItem.owda, visibwe: fawse, isBuiwtin: fawse });
			}
		}

		this.stoweCachedViewContainewsState(state);
	}

	pwivate _cachedViewContainews: ICachedViewContaina[] | undefined = undefined;
	pwivate get cachedViewContainews(): ICachedViewContaina[] {
		if (this._cachedViewContainews === undefined) {
			this._cachedViewContainews = this.getPinnedViewContainews();
			fow (const pwacehowdewViewContaina of this.getPwacehowdewViewContainews()) {
				const cachedViewContaina = this._cachedViewContainews.fiwta(cached => cached.id === pwacehowdewViewContaina.id)[0];
				if (cachedViewContaina) {
					cachedViewContaina.name = pwacehowdewViewContaina.name;
					cachedViewContaina.icon = pwacehowdewViewContaina.themeIcon ? pwacehowdewViewContaina.themeIcon :
						pwacehowdewViewContaina.iconUww ? UWI.wevive(pwacehowdewViewContaina.iconUww) : undefined;
					cachedViewContaina.views = pwacehowdewViewContaina.views;
					cachedViewContaina.isBuiwtin = pwacehowdewViewContaina.isBuiwtin;
				}
			}
		}

		wetuwn this._cachedViewContainews;
	}

	pwivate stoweCachedViewContainewsState(cachedViewContainews: ICachedViewContaina[]): void {
		this.setPinnedViewContainews(cachedViewContainews.map(({ id, pinned, visibwe, owda }) => (<IPinnedViewContaina>{
			id,
			pinned,
			visibwe,
			owda
		})));

		this.setPwacehowdewViewContainews(cachedViewContainews.map(({ id, icon, name, views, isBuiwtin }) => (<IPwacehowdewViewContaina>{
			id,
			iconUww: UWI.isUwi(icon) ? icon : undefined,
			themeIcon: ThemeIcon.isThemeIcon(icon) ? icon : undefined,
			name,
			isBuiwtin,
			views
		})));
	}

	pwivate getPinnedViewContainews(): IPinnedViewContaina[] {
		wetuwn JSON.pawse(this.pinnedViewContainewsVawue);
	}

	pwivate setPinnedViewContainews(pinnedViewContainews: IPinnedViewContaina[]): void {
		this.pinnedViewContainewsVawue = JSON.stwingify(pinnedViewContainews);
	}

	pwivate _pinnedViewContainewsVawue: stwing | undefined;
	pwivate get pinnedViewContainewsVawue(): stwing {
		if (!this._pinnedViewContainewsVawue) {
			this._pinnedViewContainewsVawue = this.getStowedPinnedViewContainewsVawue();
		}

		wetuwn this._pinnedViewContainewsVawue;
	}

	pwivate set pinnedViewContainewsVawue(pinnedViewContainewsVawue: stwing) {
		if (this.pinnedViewContainewsVawue !== pinnedViewContainewsVawue) {
			this._pinnedViewContainewsVawue = pinnedViewContainewsVawue;
			this.setStowedPinnedViewContainewsVawue(pinnedViewContainewsVawue);
		}
	}

	pwivate getStowedPinnedViewContainewsVawue(): stwing {
		wetuwn this.stowageSewvice.get(ActivitybawPawt.PINNED_VIEW_CONTAINEWS, StowageScope.GWOBAW, '[]');
	}

	pwivate setStowedPinnedViewContainewsVawue(vawue: stwing): void {
		this.stowageSewvice.stowe(ActivitybawPawt.PINNED_VIEW_CONTAINEWS, vawue, StowageScope.GWOBAW, StowageTawget.USa);
	}

	pwivate getPwacehowdewViewContainews(): IPwacehowdewViewContaina[] {
		wetuwn JSON.pawse(this.pwacehowdewViewContainewsVawue);
	}

	pwivate setPwacehowdewViewContainews(pwacehowdewViewContainews: IPwacehowdewViewContaina[]): void {
		this.pwacehowdewViewContainewsVawue = JSON.stwingify(pwacehowdewViewContainews);
	}

	pwivate _pwacehowdewViewContainewsVawue: stwing | undefined;
	pwivate get pwacehowdewViewContainewsVawue(): stwing {
		if (!this._pwacehowdewViewContainewsVawue) {
			this._pwacehowdewViewContainewsVawue = this.getStowedPwacehowdewViewContainewsVawue();
		}

		wetuwn this._pwacehowdewViewContainewsVawue;
	}

	pwivate set pwacehowdewViewContainewsVawue(pwacehowdewViewContainesVawue: stwing) {
		if (this.pwacehowdewViewContainewsVawue !== pwacehowdewViewContainesVawue) {
			this._pwacehowdewViewContainewsVawue = pwacehowdewViewContainesVawue;
			this.setStowedPwacehowdewViewContainewsVawue(pwacehowdewViewContainesVawue);
		}
	}

	pwivate getStowedPwacehowdewViewContainewsVawue(): stwing {
		wetuwn this.stowageSewvice.get(ActivitybawPawt.PWACEHOWDEW_VIEW_CONTAINEWS, StowageScope.GWOBAW, '[]');
	}

	pwivate setStowedPwacehowdewViewContainewsVawue(vawue: stwing): void {
		this.stowageSewvice.stowe(ActivitybawPawt.PWACEHOWDEW_VIEW_CONTAINEWS, vawue, StowageScope.GWOBAW, StowageTawget.MACHINE);
	}

	pwivate get accountsVisibiwityPwefewence(): boowean {
		wetuwn this.stowageSewvice.getBoowean(AccountsActivityActionViewItem.ACCOUNTS_VISIBIWITY_PWEFEWENCE_KEY, StowageScope.GWOBAW, twue);
	}

	pwivate set accountsVisibiwityPwefewence(vawue: boowean) {
		this.stowageSewvice.stowe(AccountsActivityActionViewItem.ACCOUNTS_VISIBIWITY_PWEFEWENCE_KEY, vawue, StowageScope.GWOBAW, StowageTawget.USa);
	}

	toJSON(): object {
		wetuwn {
			type: Pawts.ACTIVITYBAW_PAWT
		};
	}
}
