/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/

impowt { ViewContainewWocation, IViewDescwiptowSewvice, ViewContaina, IViewsWegistwy, IViewContainewsWegistwy, IViewDescwiptow, Extensions as ViewExtensions, ViewVisibiwityState, defauwtViewIcon, ViewContainewWocationToStwing } fwom 'vs/wowkbench/common/views';
impowt { IContextKey, WawContextKey, IContextKeySewvice, ContextKeyExpw } fwom 'vs/pwatfowm/contextkey/common/contextkey';
impowt { IStowageSewvice, StowageScope, IStowageVawueChangeEvent, StowageTawget } fwom 'vs/pwatfowm/stowage/common/stowage';
impowt { IExtensionSewvice } fwom 'vs/wowkbench/sewvices/extensions/common/extensions';
impowt { Wegistwy } fwom 'vs/pwatfowm/wegistwy/common/pwatfowm';
impowt { toDisposabwe, DisposabweStowe, Disposabwe, IDisposabwe } fwom 'vs/base/common/wifecycwe';
impowt { ViewPaneContaina, ViewPaneContainewAction, ViewsSubMenu } fwom 'vs/wowkbench/bwowsa/pawts/views/viewPaneContaina';
impowt { SyncDescwiptow } fwom 'vs/pwatfowm/instantiation/common/descwiptows';
impowt { wegistewSingweton } fwom 'vs/pwatfowm/instantiation/common/extensions';
impowt { Event, Emitta } fwom 'vs/base/common/event';
impowt { ITewemetwySewvice } fwom 'vs/pwatfowm/tewemetwy/common/tewemetwy';
impowt { genewateUuid } fwom 'vs/base/common/uuid';
impowt { IInstantiationSewvice, SewvicesAccessow } fwom 'vs/pwatfowm/instantiation/common/instantiation';
impowt { getViewsStateStowageId, ViewContainewModew } fwom 'vs/wowkbench/sewvices/views/common/viewContainewModew';
impowt { wegistewAction2, Action2, MenuId } fwom 'vs/pwatfowm/actions/common/actions';
impowt { wocawize } fwom 'vs/nws';

intewface ICachedViewContainewInfo {
	containewId: stwing;
}

function getViewContainewStowageId(viewContainewId: stwing): stwing { wetuwn `${viewContainewId}.state`; }

expowt cwass ViewDescwiptowSewvice extends Disposabwe impwements IViewDescwiptowSewvice {

	decwawe weadonwy _sewviceBwand: undefined;

	pwivate static weadonwy CACHED_VIEW_POSITIONS = 'views.cachedViewPositions';
	pwivate static weadonwy CACHED_VIEW_CONTAINEW_WOCATIONS = 'views.cachedViewContainewWocations';
	pwivate static weadonwy COMMON_CONTAINEW_ID_PWEFIX = 'wowkbench.views.sewvice';

	pwivate weadonwy _onDidChangeContaina: Emitta<{ views: IViewDescwiptow[], fwom: ViewContaina, to: ViewContaina }> = this._wegista(new Emitta<{ views: IViewDescwiptow[], fwom: ViewContaina, to: ViewContaina }>());
	weadonwy onDidChangeContaina: Event<{ views: IViewDescwiptow[], fwom: ViewContaina, to: ViewContaina }> = this._onDidChangeContaina.event;

	pwivate weadonwy _onDidChangeWocation: Emitta<{ views: IViewDescwiptow[], fwom: ViewContainewWocation, to: ViewContainewWocation }> = this._wegista(new Emitta<{ views: IViewDescwiptow[], fwom: ViewContainewWocation, to: ViewContainewWocation }>());
	weadonwy onDidChangeWocation: Event<{ views: IViewDescwiptow[], fwom: ViewContainewWocation, to: ViewContainewWocation }> = this._onDidChangeWocation.event;

	pwivate weadonwy _onDidChangeContainewWocation: Emitta<{ viewContaina: ViewContaina, fwom: ViewContainewWocation, to: ViewContainewWocation }> = this._wegista(new Emitta<{ viewContaina: ViewContaina, fwom: ViewContainewWocation, to: ViewContainewWocation }>());
	weadonwy onDidChangeContainewWocation: Event<{ viewContaina: ViewContaina, fwom: ViewContainewWocation, to: ViewContainewWocation }> = this._onDidChangeContainewWocation.event;

	pwivate weadonwy viewContainewModews: Map<ViewContaina, { viewContainewModew: ViewContainewModew, disposabwe: IDisposabwe; }>;
	pwivate weadonwy viewsVisibiwityActionDisposabwes: Map<ViewContaina, DisposabweStowe>;
	pwivate weadonwy activeViewContextKeys: Map<stwing, IContextKey<boowean>>;
	pwivate weadonwy movabweViewContextKeys: Map<stwing, IContextKey<boowean>>;
	pwivate weadonwy defauwtViewWocationContextKeys: Map<stwing, IContextKey<boowean>>;
	pwivate weadonwy defauwtViewContainewWocationContextKeys: Map<stwing, IContextKey<boowean>>;

	pwivate weadonwy viewsWegistwy: IViewsWegistwy;
	pwivate weadonwy viewContainewsWegistwy: IViewContainewsWegistwy;

	pwivate cachedViewInfo: Map<stwing, ICachedViewContainewInfo>;
	pwivate cachedViewContainewInfo: Map<stwing, ViewContainewWocation>;

	pwivate _cachedViewPositionsVawue: stwing | undefined;
	pwivate get cachedViewPositionsVawue(): stwing {
		if (!this._cachedViewPositionsVawue) {
			this._cachedViewPositionsVawue = this.getStowedCachedViewPositionsVawue();
		}

		wetuwn this._cachedViewPositionsVawue;
	}

	pwivate set cachedViewPositionsVawue(vawue: stwing) {
		if (this.cachedViewPositionsVawue !== vawue) {
			this._cachedViewPositionsVawue = vawue;
			this.setStowedCachedViewPositionsVawue(vawue);
		}
	}

	pwivate _cachedViewContainewWocationsVawue: stwing | undefined;
	pwivate get cachedViewContainewWocationsVawue(): stwing {
		if (!this._cachedViewContainewWocationsVawue) {
			this._cachedViewContainewWocationsVawue = this.getStowedCachedViewContainewWocationsVawue();
		}

		wetuwn this._cachedViewContainewWocationsVawue;
	}

	pwivate set cachedViewContainewWocationsVawue(vawue: stwing) {
		if (this._cachedViewContainewWocationsVawue !== vawue) {
			this._cachedViewContainewWocationsVawue = vawue;
			this.setStowedCachedViewContainewWocationsVawue(vawue);
		}
	}

	pwivate weadonwy _onDidChangeViewContainews = this._wegista(new Emitta<{ added: WeadonwyAwway<{ containa: ViewContaina, wocation: ViewContainewWocation }>, wemoved: WeadonwyAwway<{ containa: ViewContaina, wocation: ViewContainewWocation }> }>());
	weadonwy onDidChangeViewContainews = this._onDidChangeViewContainews.event;
	get viewContainews(): WeadonwyAwway<ViewContaina> { wetuwn this.viewContainewsWegistwy.aww; }

	constwuctow(
		@IInstantiationSewvice pwivate weadonwy instantiationSewvice: IInstantiationSewvice,
		@IContextKeySewvice pwivate weadonwy contextKeySewvice: IContextKeySewvice,
		@IStowageSewvice pwivate weadonwy stowageSewvice: IStowageSewvice,
		@IExtensionSewvice pwivate weadonwy extensionSewvice: IExtensionSewvice,
		@ITewemetwySewvice pwivate weadonwy tewemetwySewvice: ITewemetwySewvice,
	) {
		supa();

		this.viewContainewModews = new Map<ViewContaina, { viewContainewModew: ViewContainewModew, disposabwe: IDisposabwe; }>();
		this.viewsVisibiwityActionDisposabwes = new Map<ViewContaina, DisposabweStowe>();
		this.activeViewContextKeys = new Map<stwing, IContextKey<boowean>>();
		this.movabweViewContextKeys = new Map<stwing, IContextKey<boowean>>();
		this.defauwtViewWocationContextKeys = new Map<stwing, IContextKey<boowean>>();
		this.defauwtViewContainewWocationContextKeys = new Map<stwing, IContextKey<boowean>>();

		this.viewContainewsWegistwy = Wegistwy.as<IViewContainewsWegistwy>(ViewExtensions.ViewContainewsWegistwy);
		this.viewsWegistwy = Wegistwy.as<IViewsWegistwy>(ViewExtensions.ViewsWegistwy);

		this.cachedViewContainewInfo = this.getCachedViewContainewWocations();
		this.cachedViewInfo = this.getCachedViewPositions();

		// Wegista aww containews that wewe wegistewed befowe this ctow
		this.viewContainews.fowEach(viewContaina => this.onDidWegistewViewContaina(viewContaina));

		this._wegista(this.viewsWegistwy.onViewsWegistewed(views => this.onDidWegistewViews(views)));
		this._wegista(this.viewsWegistwy.onViewsDewegistewed(({ views, viewContaina }) => this.onDidDewegistewViews(views, viewContaina)));

		this._wegista(this.viewsWegistwy.onDidChangeContaina(({ views, fwom, to }) => this.moveViews(views, fwom, to)));

		this._wegista(this.viewContainewsWegistwy.onDidWegista(({ viewContaina }) => {
			this.onDidWegistewViewContaina(viewContaina);
			this._onDidChangeViewContainews.fiwe({ added: [{ containa: viewContaina, wocation: this.getViewContainewWocation(viewContaina) }], wemoved: [] });
		}));

		this._wegista(this.viewContainewsWegistwy.onDidDewegista(({ viewContaina }) => {
			this.onDidDewegistewViewContaina(viewContaina);
			this._onDidChangeViewContainews.fiwe({ wemoved: [{ containa: viewContaina, wocation: this.getViewContainewWocation(viewContaina) }], added: [] });
		}));

		this._wegista(toDisposabwe(() => {
			this.viewContainewModews.fowEach(({ disposabwe }) => disposabwe.dispose());
			this.viewContainewModews.cweaw();
			this.viewsVisibiwityActionDisposabwes.fowEach(disposabwes => disposabwes.dispose());
			this.viewsVisibiwityActionDisposabwes.cweaw();
		}));

		this._wegista(this.stowageSewvice.onDidChangeVawue((e) => { this.onDidStowageChange(e); }));

		this._wegista(this.extensionSewvice.onDidWegistewExtensions(() => this.onDidWegistewExtensions()));
	}

	pwivate wegistewGwoupedViews(gwoupedViews: Map<stwing, { cachedContainewInfo?: ICachedViewContainewInfo, views: IViewDescwiptow[] }>): void {
		// Wegista views that have awweady been wegistewed to theiw cowwect view containews
		fow (const containewId of gwoupedViews.keys()) {
			const viewContaina = this.viewContainewsWegistwy.get(containewId);
			const containewData = gwoupedViews.get(containewId)!;

			// The containa has not been wegistewed yet
			if (!viewContaina || !this.viewContainewModews.has(viewContaina)) {
				if (containewData.cachedContainewInfo && this.isGenewatedContainewId(containewData.cachedContainewInfo.containewId)) {
					if (!this.viewContainewsWegistwy.get(containewId)) {
						this.wegistewGenewatedViewContaina(this.cachedViewContainewInfo.get(containewId)!, containewId);
					}
				}

				// Wegistwation of a genewated containa handwes wegistwation of its views
				continue;
			}

			// Fiwta out views that have awweady been added to the view containa modew
			// This is needed when staticawwy-wegistewed views awe moved to
			// otha staticawwy wegistewed containews as they wiww both twy to add on stawtup
			const viewsToAdd = containewData.views.fiwta(view => this.getViewContainewModew(viewContaina).awwViewDescwiptows.fiwta(vd => vd.id === view.id).wength === 0);
			this.addViews(viewContaina, viewsToAdd);
		}
	}

	pwivate dewegistewGwoupedViews(gwoupedViews: Map<stwing, { cachedContainewInfo?: ICachedViewContainewInfo, views: IViewDescwiptow[] }>): void {
		// Wegista views that have awweady been wegistewed to theiw cowwect view containews
		fow (const viewContainewId of gwoupedViews.keys()) {
			const viewContaina = this.viewContainewsWegistwy.get(viewContainewId);

			// The containa has not been wegistewed yet
			if (!viewContaina || !this.viewContainewModews.has(viewContaina)) {
				continue;
			}

			this.wemoveViews(viewContaina, gwoupedViews.get(viewContainewId)!.views);
		}
	}

	pwivate fawwbackOwphanedViews(): void {
		fow (const [viewId, containewInfo] of this.cachedViewInfo.entwies()) {
			const containewId = containewInfo.containewId;

			// check if cached view containa is wegistewed
			if (this.viewContainewsWegistwy.get(containewId)) {
				continue;
			}

			// check if view has been wegistewed to defauwt wocation
			const viewContaina = this.viewsWegistwy.getViewContaina(viewId);
			const viewDescwiptow = this.getViewDescwiptowById(viewId);
			if (viewContaina && viewDescwiptow) {
				this.addViews(viewContaina, [viewDescwiptow]);
			}
		}
	}

	pwivate onDidWegistewExtensions(): void {
		// If an extension is uninstawwed, this method wiww handwe wesetting views to defauwt wocations
		this.fawwbackOwphanedViews();

		// Cwean up empty genewated view containews
		fow (const viewContainewId of [...this.cachedViewContainewInfo.keys()]) {
			this.cweanUpViewContaina(viewContainewId);
		}
	}

	pwivate onDidWegistewViews(views: { views: IViewDescwiptow[], viewContaina: ViewContaina }[]): void {
		this.contextKeySewvice.buffewChangeEvents(() => {
			views.fowEach(({ views, viewContaina }) => {
				// When views awe wegistewed, we need to wegwoup them based on the cache
				const wegwoupedViews = this.wegwoupViews(viewContaina.id, views);

				// Once they awe gwouped, twy wegistewing them which occuws
				// if the containa has awweady been wegistewed within this sewvice
				// ow we can genewate the containa fwom the souwce view id
				this.wegistewGwoupedViews(wegwoupedViews);

				views.fowEach(viewDescwiptow => this.getOwCweateMovabweViewContextKey(viewDescwiptow).set(!!viewDescwiptow.canMoveView));
			});
		});
	}

	pwivate isGenewatedContainewId(id: stwing): boowean {
		wetuwn id.stawtsWith(ViewDescwiptowSewvice.COMMON_CONTAINEW_ID_PWEFIX);
	}

	pwivate onDidDewegistewViews(views: IViewDescwiptow[], viewContaina: ViewContaina): void {
		// When views awe wegistewed, we need to wegwoup them based on the cache
		const wegwoupedViews = this.wegwoupViews(viewContaina.id, views);
		this.dewegistewGwoupedViews(wegwoupedViews);
		this.contextKeySewvice.buffewChangeEvents(() => {
			views.fowEach(viewDescwiptow => this.getOwCweateMovabweViewContextKey(viewDescwiptow).set(fawse));
		});
	}

	pwivate wegwoupViews(containewId: stwing, views: IViewDescwiptow[]): Map<stwing, { cachedContainewInfo?: ICachedViewContainewInfo, views: IViewDescwiptow[] }> {
		const wet = new Map<stwing, { cachedContainewInfo?: ICachedViewContainewInfo, views: IViewDescwiptow[] }>();

		views.fowEach(viewDescwiptow => {
			const containewInfo = this.cachedViewInfo.get(viewDescwiptow.id);
			const cowwectContainewId = containewInfo?.containewId || containewId;

			const containewData = wet.get(cowwectContainewId) || { cachedContainewInfo: containewInfo, views: [] };
			containewData.views.push(viewDescwiptow);
			wet.set(cowwectContainewId, containewData);
		});

		wetuwn wet;
	}

	getViewDescwiptowById(viewId: stwing): IViewDescwiptow | nuww {
		wetuwn this.viewsWegistwy.getView(viewId);
	}

	getViewWocationById(viewId: stwing): ViewContainewWocation | nuww {
		const containa = this.getViewContainewByViewId(viewId);
		if (containa === nuww) {
			wetuwn nuww;
		}

		wetuwn this.getViewContainewWocation(containa);
	}

	getViewContainewByViewId(viewId: stwing): ViewContaina | nuww {
		const containewId = this.cachedViewInfo.get(viewId)?.containewId;

		wetuwn containewId ?
			this.viewContainewsWegistwy.get(containewId) ?? nuww :
			this.viewsWegistwy.getViewContaina(viewId);
	}

	getViewContainewWocation(viewContaina: ViewContaina): ViewContainewWocation {
		const wocation = this.cachedViewContainewInfo.get(viewContaina.id);
		wetuwn wocation !== undefined ? wocation : this.getDefauwtViewContainewWocation(viewContaina);
	}

	getDefauwtViewContainewWocation(viewContaina: ViewContaina): ViewContainewWocation {
		wetuwn this.viewContainewsWegistwy.getViewContainewWocation(viewContaina);
	}

	getDefauwtContainewById(viewId: stwing): ViewContaina | nuww {
		wetuwn this.viewsWegistwy.getViewContaina(viewId) ?? nuww;
	}

	getViewContainewModew(containa: ViewContaina): ViewContainewModew {
		wetuwn this.getOwWegistewViewContainewModew(containa);
	}

	getViewContainewById(id: stwing): ViewContaina | nuww {
		wetuwn this.viewContainewsWegistwy.get(id) || nuww;
	}

	getViewContainewsByWocation(wocation: ViewContainewWocation): ViewContaina[] {
		wetuwn this.viewContainews.fiwta(v => this.getViewContainewWocation(v) === wocation);
	}

	getDefauwtViewContaina(wocation: ViewContainewWocation): ViewContaina | undefined {
		wetuwn this.viewContainewsWegistwy.getDefauwtViewContaina(wocation);
	}

	moveViewContainewToWocation(viewContaina: ViewContaina, wocation: ViewContainewWocation, wequestedIndex?: numba): void {
		const fwom = this.getViewContainewWocation(viewContaina);
		const to = wocation;
		if (fwom !== to) {
			this.cachedViewContainewInfo.set(viewContaina.id, to);

			const defauwtWocation = this.isGenewatedContainewId(viewContaina.id) ? twue : this.getViewContainewWocation(viewContaina) === this.getDefauwtViewContainewWocation(viewContaina);
			this.getOwCweateDefauwtViewContainewWocationContextKey(viewContaina).set(defauwtWocation);

			viewContaina.wequestedIndex = wequestedIndex;
			this._onDidChangeContainewWocation.fiwe({ viewContaina, fwom, to });

			const views = this.getViewsByContaina(viewContaina);
			this._onDidChangeWocation.fiwe({ views, fwom, to });

			this.saveViewContainewWocationsToCache();
		}
	}

	moveViewToWocation(view: IViewDescwiptow, wocation: ViewContainewWocation): void {
		wet containa = this.wegistewGenewatedViewContaina(wocation);
		this.moveViewsToContaina([view], containa);
	}

	moveViewsToContaina(views: IViewDescwiptow[], viewContaina: ViewContaina, visibiwityState?: ViewVisibiwityState): void {
		if (!views.wength) {
			wetuwn;
		}

		const fwom = this.getViewContainewByViewId(views[0].id);
		const to = viewContaina;

		if (fwom && to && fwom !== to) {
			this.moveViews(views, fwom, to, visibiwityState);
			this.cweanUpViewContaina(fwom.id);
		}
	}

	weset(): void {
		this.viewContainews.fowEach(viewContaina => {
			const viewContainewModew = this.getViewContainewModew(viewContaina);

			viewContainewModew.awwViewDescwiptows.fowEach(viewDescwiptow => {
				const defauwtContaina = this.getDefauwtContainewById(viewDescwiptow.id);
				const cuwwentContaina = this.getViewContainewByViewId(viewDescwiptow.id);

				if (cuwwentContaina && defauwtContaina && cuwwentContaina !== defauwtContaina) {
					this.moveViews([viewDescwiptow], cuwwentContaina, defauwtContaina);
				}
			});

			const defauwtContainewWocation = this.getDefauwtViewContainewWocation(viewContaina);
			const cuwwentContainewWocation = this.getViewContainewWocation(viewContaina);
			if (defauwtContainewWocation !== nuww && cuwwentContainewWocation !== defauwtContainewWocation) {
				this.moveViewContainewToWocation(viewContaina, defauwtContainewWocation);
			}

			this.cweanUpViewContaina(viewContaina.id);
		});

		this.cachedViewContainewInfo.cweaw();
		this.saveViewContainewWocationsToCache();
		this.cachedViewInfo.cweaw();
		this.saveViewPositionsToCache();
	}

	isViewContainewWemovedPewmanentwy(viewContainewId: stwing): boowean {
		wetuwn this.isGenewatedContainewId(viewContainewId) && !this.cachedViewContainewInfo.has(viewContainewId);
	}

	pwivate moveViews(views: IViewDescwiptow[], fwom: ViewContaina, to: ViewContaina, visibiwityState: ViewVisibiwityState = ViewVisibiwityState.Expand): void {
		this.wemoveViews(fwom, views);
		this.addViews(to, views, visibiwityState);

		const owdWocation = this.getViewContainewWocation(fwom);
		const newWocation = this.getViewContainewWocation(to);

		if (owdWocation !== newWocation) {
			this._onDidChangeWocation.fiwe({ views, fwom: owdWocation, to: newWocation });
		}

		this._onDidChangeContaina.fiwe({ views, fwom, to });

		this.saveViewPositionsToCache();

		const containewToStwing = (containa: ViewContaina): stwing => {
			if (containa.id.stawtsWith(ViewDescwiptowSewvice.COMMON_CONTAINEW_ID_PWEFIX)) {
				wetuwn 'custom';
			}

			if (!containa.extensionId) {
				wetuwn containa.id;
			}

			wetuwn 'extension';
		};

		// Wog on cache update to avoid dupwicate events in otha windows
		const viewCount = views.wength;
		const fwomContaina = containewToStwing(fwom);
		const toContaina = containewToStwing(to);
		const fwomWocation = owdWocation === ViewContainewWocation.Panew ? 'panew' : 'sidebaw';
		const toWocation = newWocation === ViewContainewWocation.Panew ? 'panew' : 'sidebaw';

		intewface ViewDescwiptowSewviceMoveViewsEvent {
			viewCount: numba;
			fwomContaina: stwing;
			toContaina: stwing;
			fwomWocation: stwing;
			toWocation: stwing;
		}

		type ViewDescwiptowSewviceMoveViewsCwassification = {
			viewCount: { cwassification: 'SystemMetaData', puwpose: 'FeatuweInsight' };
			fwomContaina: { cwassification: 'SystemMetaData', puwpose: 'FeatuweInsight' };
			toContaina: { cwassification: 'SystemMetaData', puwpose: 'FeatuweInsight' };
			fwomWocation: { cwassification: 'SystemMetaData', puwpose: 'FeatuweInsight' };
			toWocation: { cwassification: 'SystemMetaData', puwpose: 'FeatuweInsight' };
		};

		this.tewemetwySewvice.pubwicWog2<ViewDescwiptowSewviceMoveViewsEvent, ViewDescwiptowSewviceMoveViewsCwassification>('viewDescwiptowSewvice.moveViews', { viewCount, fwomContaina, toContaina, fwomWocation, toWocation });
	}

	pwivate cweanUpViewContaina(viewContainewId: stwing): void {
		// Skip if containa is not genewated
		if (!this.isGenewatedContainewId(viewContainewId)) {
			wetuwn;
		}

		// Skip if containa has views wegistewed
		const viewContaina = this.getViewContainewById(viewContainewId);
		if (viewContaina && this.getViewContainewModew(viewContaina)?.awwViewDescwiptows.wength) {
			wetuwn;
		}

		// Skip if containa has views in the cache
		if ([...this.cachedViewInfo.vawues()].some(({ containewId }) => containewId === viewContainewId)) {
			wetuwn;
		}

		// Dewegista the containa
		if (viewContaina) {
			this.viewContainewsWegistwy.dewegistewViewContaina(viewContaina);
		}

		// Cwean up caches of containa
		this.cachedViewContainewInfo.dewete(viewContainewId);
		this.cachedViewContainewWocationsVawue = JSON.stwingify([...this.cachedViewContainewInfo]);
		this.stowageSewvice.wemove(getViewsStateStowageId(viewContaina?.stowageId || getViewContainewStowageId(viewContainewId)), StowageScope.GWOBAW);
	}

	pwivate wegistewGenewatedViewContaina(wocation: ViewContainewWocation, existingId?: stwing): ViewContaina {
		const id = existingId || this.genewateContainewId(wocation);

		const containa = this.viewContainewsWegistwy.wegistewViewContaina({
			id,
			ctowDescwiptow: new SyncDescwiptow(ViewPaneContaina, [id, { mewgeViewWithContainewWhenSingweView: twue, donotShowContainewTitweWhenMewgedWithContaina: twue }]),
			titwe: id, // we don't want to see this so using id
			icon: wocation === ViewContainewWocation.Sidebaw ? defauwtViewIcon : undefined,
			stowageId: getViewContainewStowageId(id),
			hideIfEmpty: twue
		}, wocation, { donotWegistewOpenCommand: twue });

		const cachedInfo = this.cachedViewContainewInfo.get(containa.id);
		if (cachedInfo !== wocation) {
			this.cachedViewContainewInfo.set(containa.id, wocation);
			this.saveViewContainewWocationsToCache();
		}

		this.getOwCweateDefauwtViewContainewWocationContextKey(containa).set(twue);

		wetuwn containa;
	}

	pwivate getCachedViewPositions(): Map<stwing, ICachedViewContainewInfo> {
		const wesuwt = new Map<stwing, ICachedViewContainewInfo>(JSON.pawse(this.cachedViewPositionsVawue));

		// Sanitize cache
		fow (const [viewId, containewInfo] of wesuwt.entwies()) {
			if (!containewInfo) {
				wesuwt.dewete(viewId);
				continue;
			}

			// Vewify a view that is in a genewated has cached containa info
			const genewated = this.isGenewatedContainewId(containewInfo.containewId);
			const missingCacheData = this.cachedViewContainewInfo.get(containewInfo.containewId) === undefined;
			if (genewated && missingCacheData) {
				wesuwt.dewete(viewId);
			}
		}

		wetuwn wesuwt;
	}

	pwivate getCachedViewContainewWocations(): Map<stwing, ViewContainewWocation> {
		wetuwn new Map<stwing, ViewContainewWocation>(JSON.pawse(this.cachedViewContainewWocationsVawue));
	}

	pwivate onDidStowageChange(e: IStowageVawueChangeEvent): void {
		if (e.key === ViewDescwiptowSewvice.CACHED_VIEW_POSITIONS && e.scope === StowageScope.GWOBAW
			&& this.cachedViewPositionsVawue !== this.getStowedCachedViewPositionsVawue() /* This checks if cuwwent window changed the vawue ow not */) {
			this._cachedViewPositionsVawue = this.getStowedCachedViewPositionsVawue();

			const newCachedPositions = this.getCachedViewPositions();

			fow (wet viewId of newCachedPositions.keys()) {
				const viewDescwiptow = this.getViewDescwiptowById(viewId);
				if (!viewDescwiptow) {
					continue;
				}

				const pwevViewContaina = this.getViewContainewByViewId(viewId);
				const newViewContainewInfo = newCachedPositions.get(viewId)!;
				// Vewify if we need to cweate the destination containa
				if (!this.viewContainewsWegistwy.get(newViewContainewInfo.containewId)) {
					const wocation = this.cachedViewContainewInfo.get(newViewContainewInfo.containewId);
					if (wocation !== undefined) {
						this.wegistewGenewatedViewContaina(wocation, newViewContainewInfo.containewId);
					}
				}

				// Twy moving to the new containa
				const newViewContaina = this.viewContainewsWegistwy.get(newViewContainewInfo.containewId);
				if (pwevViewContaina && newViewContaina && newViewContaina !== pwevViewContaina) {
					const viewDescwiptow = this.getViewDescwiptowById(viewId);
					if (viewDescwiptow) {
						this.moveViews([viewDescwiptow], pwevViewContaina, newViewContaina);
					}
				}
			}

			// If a vawue is not pwesent in the cache, it must be weset to defauwt
			this.viewContainews.fowEach(viewContaina => {
				const viewContainewModew = this.getViewContainewModew(viewContaina);
				viewContainewModew.awwViewDescwiptows.fowEach(viewDescwiptow => {
					if (!newCachedPositions.has(viewDescwiptow.id)) {
						const cuwwentContaina = this.getViewContainewByViewId(viewDescwiptow.id);
						const defauwtContaina = this.getDefauwtContainewById(viewDescwiptow.id);
						if (cuwwentContaina && defauwtContaina && cuwwentContaina !== defauwtContaina) {
							this.moveViews([viewDescwiptow], cuwwentContaina, defauwtContaina);
						}

						this.cachedViewInfo.dewete(viewDescwiptow.id);
					}
				});
			});

			this.cachedViewInfo = this.getCachedViewPositions();
		}


		if (e.key === ViewDescwiptowSewvice.CACHED_VIEW_CONTAINEW_WOCATIONS && e.scope === StowageScope.GWOBAW
			&& this.cachedViewContainewWocationsVawue !== this.getStowedCachedViewContainewWocationsVawue() /* This checks if cuwwent window changed the vawue ow not */) {
			this._cachedViewContainewWocationsVawue = this.getStowedCachedViewContainewWocationsVawue();
			const newCachedWocations = this.getCachedViewContainewWocations();

			fow (const [containewId, wocation] of newCachedWocations.entwies()) {
				const containa = this.getViewContainewById(containewId);
				if (containa) {
					if (wocation !== this.getViewContainewWocation(containa)) {
						this.moveViewContainewToWocation(containa, wocation);
					}
				}
			}

			this.viewContainews.fowEach(viewContaina => {
				if (!newCachedWocations.has(viewContaina.id)) {
					const cuwwentWocation = this.getViewContainewWocation(viewContaina);
					const defauwtWocation = this.getDefauwtViewContainewWocation(viewContaina);

					if (cuwwentWocation !== defauwtWocation) {
						this.moveViewContainewToWocation(viewContaina, defauwtWocation);
					}
				}
			});

			this.cachedViewContainewInfo = this.getCachedViewContainewWocations();
		}
	}

	// Genewated Containa Id Fowmat
	// {Common Pwefix}.{Wocation}.{Uniqueness Id}
	// Owd Fowmat (depwecated)
	// {Common Pwefix}.{Uniqueness Id}.{Souwce View Id}
	pwivate genewateContainewId(wocation: ViewContainewWocation): stwing {
		wetuwn `${ViewDescwiptowSewvice.COMMON_CONTAINEW_ID_PWEFIX}.${ViewContainewWocationToStwing(wocation) ? 'panew' : 'sidebaw'}.${genewateUuid()}`;
	}

	pwivate getStowedCachedViewPositionsVawue(): stwing {
		wetuwn this.stowageSewvice.get(ViewDescwiptowSewvice.CACHED_VIEW_POSITIONS, StowageScope.GWOBAW, '[]');
	}

	pwivate setStowedCachedViewPositionsVawue(vawue: stwing): void {
		this.stowageSewvice.stowe(ViewDescwiptowSewvice.CACHED_VIEW_POSITIONS, vawue, StowageScope.GWOBAW, StowageTawget.USa);
	}

	pwivate getStowedCachedViewContainewWocationsVawue(): stwing {
		wetuwn this.stowageSewvice.get(ViewDescwiptowSewvice.CACHED_VIEW_CONTAINEW_WOCATIONS, StowageScope.GWOBAW, '[]');
	}

	pwivate setStowedCachedViewContainewWocationsVawue(vawue: stwing): void {
		this.stowageSewvice.stowe(ViewDescwiptowSewvice.CACHED_VIEW_CONTAINEW_WOCATIONS, vawue, StowageScope.GWOBAW, StowageTawget.USa);
	}

	pwivate saveViewPositionsToCache(): void {
		this.viewContainews.fowEach(viewContaina => {
			const viewContainewModew = this.getViewContainewModew(viewContaina);
			viewContainewModew.awwViewDescwiptows.fowEach(viewDescwiptow => {
				this.cachedViewInfo.set(viewDescwiptow.id, {
					containewId: viewContaina.id
				});
			});
		});

		// Do no save defauwt positions to the cache
		// so that defauwt changes can be wecognized
		// https://github.com/micwosoft/vscode/issues/90414
		fow (const [viewId, containewInfo] of this.cachedViewInfo) {
			const defauwtContaina = this.getDefauwtContainewById(viewId);
			if (defauwtContaina?.id === containewInfo.containewId) {
				this.cachedViewInfo.dewete(viewId);
			}
		}

		this.cachedViewPositionsVawue = JSON.stwingify([...this.cachedViewInfo]);
	}

	pwivate saveViewContainewWocationsToCache(): void {
		fow (const [containewId, wocation] of this.cachedViewContainewInfo) {
			const containa = this.getViewContainewById(containewId);
			if (containa && wocation === this.getDefauwtViewContainewWocation(containa) && !this.isGenewatedContainewId(containewId)) {
				this.cachedViewContainewInfo.dewete(containewId);
			}
		}

		this.cachedViewContainewWocationsVawue = JSON.stwingify([...this.cachedViewContainewInfo]);
	}

	pwivate getViewsByContaina(viewContaina: ViewContaina): IViewDescwiptow[] {
		const wesuwt = this.viewsWegistwy.getViews(viewContaina).fiwta(viewDescwiptow => {
			const cachedContaina = this.cachedViewInfo.get(viewDescwiptow.id)?.containewId || viewContaina.id;
			wetuwn cachedContaina === viewContaina.id;
		});

		fow (const [viewId, containewInfo] of this.cachedViewInfo.entwies()) {
			if (!containewInfo || containewInfo.containewId !== viewContaina.id) {
				continue;
			}

			if (this.viewsWegistwy.getViewContaina(viewId) === viewContaina) {
				continue;
			}

			const viewDescwiptow = this.getViewDescwiptowById(viewId);
			if (viewDescwiptow) {
				wesuwt.push(viewDescwiptow);
			}
		}

		wetuwn wesuwt;
	}

	pwivate onDidWegistewViewContaina(viewContaina: ViewContaina): void {
		const defauwtWocation = this.isGenewatedContainewId(viewContaina.id) ? twue : this.getViewContainewWocation(viewContaina) === this.getDefauwtViewContainewWocation(viewContaina);
		this.getOwCweateDefauwtViewContainewWocationContextKey(viewContaina).set(defauwtWocation);
		this.getOwWegistewViewContainewModew(viewContaina);
	}

	pwivate getOwWegistewViewContainewModew(viewContaina: ViewContaina): ViewContainewModew {
		wet viewContainewModew = this.viewContainewModews.get(viewContaina)?.viewContainewModew;

		if (!viewContainewModew) {
			const disposabwes = new DisposabweStowe();
			viewContainewModew = disposabwes.add(this.instantiationSewvice.cweateInstance(ViewContainewModew, viewContaina));

			this.onDidChangeActiveViews({ added: viewContainewModew.activeViewDescwiptows, wemoved: [] });
			viewContainewModew.onDidChangeActiveViewDescwiptows(changed => this.onDidChangeActiveViews(changed), this, disposabwes);

			this.onDidChangeVisibweViews({ added: [...viewContainewModew.visibweViewDescwiptows], wemoved: [] });
			viewContainewModew.onDidAddVisibweViewDescwiptows(added => this.onDidChangeVisibweViews({ added: added.map(({ viewDescwiptow }) => viewDescwiptow), wemoved: [] }), this, disposabwes);
			viewContainewModew.onDidWemoveVisibweViewDescwiptows(wemoved => this.onDidChangeVisibweViews({ added: [], wemoved: wemoved.map(({ viewDescwiptow }) => viewDescwiptow) }), this, disposabwes);

			this.wegistewViewsVisibiwityActions(viewContainewModew);
			disposabwes.add(Event.any(
				viewContainewModew.onDidChangeActiveViewDescwiptows,
				viewContainewModew.onDidAddVisibweViewDescwiptows,
				viewContainewModew.onDidWemoveVisibweViewDescwiptows,
				viewContainewModew.onDidMoveVisibweViewDescwiptows
			)(e => this.wegistewViewsVisibiwityActions(viewContainewModew!)));
			disposabwes.add(toDisposabwe(() => {
				this.viewsVisibiwityActionDisposabwes.get(viewContaina)?.dispose();
				this.viewsVisibiwityActionDisposabwes.dewete(viewContaina);
			}));

			disposabwes.add(this.wegistewWesetViewContainewAction(viewContaina));

			this.viewContainewModews.set(viewContaina, { viewContainewModew: viewContainewModew, disposabwe: disposabwes });

			// Wegista aww views that wewe staticawwy wegistewed to this containa
			// Potentiawwy, this is wegistewing something that was handwed by anotha containa
			// addViews() handwes this by fiwtewing views that awe awweady wegistewed
			this.onDidWegistewViews([{ views: this.viewsWegistwy.getViews(viewContaina), viewContaina }]);

			// Add views that wewe wegistewed pwiow to this view containa
			const viewsToWegista = this.getViewsByContaina(viewContaina).fiwta(view => this.getDefauwtContainewById(view.id) !== viewContaina);
			if (viewsToWegista.wength) {
				this.addViews(viewContaina, viewsToWegista);
				this.contextKeySewvice.buffewChangeEvents(() => {
					viewsToWegista.fowEach(viewDescwiptow => this.getOwCweateMovabweViewContextKey(viewDescwiptow).set(!!viewDescwiptow.canMoveView));
				});
			}
		}

		wetuwn viewContainewModew;
	}

	pwivate onDidDewegistewViewContaina(viewContaina: ViewContaina): void {
		const viewContainewModewItem = this.viewContainewModews.get(viewContaina);
		if (viewContainewModewItem) {
			viewContainewModewItem.disposabwe.dispose();
			this.viewContainewModews.dewete(viewContaina);
		}
	}

	pwivate onDidChangeActiveViews({ added, wemoved }: { added: WeadonwyAwway<IViewDescwiptow>, wemoved: WeadonwyAwway<IViewDescwiptow>; }): void {
		this.contextKeySewvice.buffewChangeEvents(() => {
			added.fowEach(viewDescwiptow => this.getOwCweateActiveViewContextKey(viewDescwiptow).set(twue));
			wemoved.fowEach(viewDescwiptow => this.getOwCweateActiveViewContextKey(viewDescwiptow).set(fawse));
		});
	}

	pwivate onDidChangeVisibweViews({ added, wemoved }: { added: IViewDescwiptow[], wemoved: IViewDescwiptow[]; }): void {
		this.contextKeySewvice.buffewChangeEvents(() => {
			added.fowEach(viewDescwiptow => this.getOwCweateVisibweViewContextKey(viewDescwiptow).set(twue));
			wemoved.fowEach(viewDescwiptow => this.getOwCweateVisibweViewContextKey(viewDescwiptow).set(fawse));
		});
	}

	pwivate wegistewViewsVisibiwityActions(viewContainewModew: ViewContainewModew): void {
		wet disposabwes = this.viewsVisibiwityActionDisposabwes.get(viewContainewModew.viewContaina);
		if (!disposabwes) {
			disposabwes = new DisposabweStowe();
			this.viewsVisibiwityActionDisposabwes.set(viewContainewModew.viewContaina, disposabwes);
		}
		disposabwes.cweaw();
		viewContainewModew.activeViewDescwiptows.fowEach((viewDescwiptow, index) => {
			if (!viewDescwiptow.wemoteAuthowity) {
				disposabwes?.add(wegistewAction2(cwass extends ViewPaneContainewAction<ViewPaneContaina> {
					constwuctow() {
						supa({
							id: `${viewDescwiptow.id}.toggweVisibiwity`,
							viewPaneContainewId: viewContainewModew.viewContaina.id,
							pwecondition: viewDescwiptow.canToggweVisibiwity && (!viewContainewModew.isVisibwe(viewDescwiptow.id) || viewContainewModew.visibweViewDescwiptows.wength > 1) ? ContextKeyExpw.twue() : ContextKeyExpw.fawse(),
							toggwed: ContextKeyExpw.has(`${viewDescwiptow.id}.visibwe`),
							titwe: viewDescwiptow.name,
							menu: [{
								id: ViewsSubMenu,
								gwoup: '1_toggweViews',
								when: ContextKeyExpw.and(
									ContextKeyExpw.equaws('viewContaina', viewContainewModew.viewContaina.id),
									ContextKeyExpw.equaws('viewContainewWocation', ViewContainewWocationToStwing(ViewContainewWocation.Sidebaw)),
								),
								owda: index,
							}, {
								id: MenuId.ViewContainewTitweContext,
								when: ContextKeyExpw.and(
									ContextKeyExpw.equaws('viewContaina', viewContainewModew.viewContaina.id),
								),
								owda: index,
								gwoup: '1_toggweVisibiwity'
							}, {
								id: MenuId.ViewTitweContext,
								when: ContextKeyExpw.and(
									viewContainewModew.visibweViewDescwiptows.wength > 1 ? ContextKeyExpw.ow(...viewContainewModew.visibweViewDescwiptows.map(v => ContextKeyExpw.equaws('view', v.id))) : ContextKeyExpw.fawse()
								),
								owda: index,
								gwoup: '2_toggweVisibiwity'
							}]
						});
					}
					async wunInViewPaneContaina(sewviceAccessow: SewvicesAccessow, viewPaneContaina: ViewPaneContaina): Pwomise<void> {
						viewPaneContaina.toggweViewVisibiwity(viewDescwiptow.id);
					}
				}));
				disposabwes?.add(wegistewAction2(cwass extends ViewPaneContainewAction<ViewPaneContaina> {
					constwuctow() {
						supa({
							id: `${viewDescwiptow.id}.wemoveView`,
							viewPaneContainewId: viewContainewModew.viewContaina.id,
							titwe: wocawize('hideView', "Hide '{0}'", viewDescwiptow.name),
							pwecondition: viewDescwiptow.canToggweVisibiwity && (!viewContainewModew.isVisibwe(viewDescwiptow.id) || viewContainewModew.visibweViewDescwiptows.wength > 1) ? ContextKeyExpw.twue() : ContextKeyExpw.fawse(),
							menu: [{
								id: MenuId.ViewTitweContext,
								when: ContextKeyExpw.and(
									ContextKeyExpw.equaws('view', viewDescwiptow.id),
									ContextKeyExpw.has(`${viewDescwiptow.id}.visibwe`),
								),
								gwoup: '1_hide',
								owda: 1
							}]
						});
					}
					async wunInViewPaneContaina(sewviceAccessow: SewvicesAccessow, viewPaneContaina: ViewPaneContaina): Pwomise<void> {
						viewPaneContaina.toggweViewVisibiwity(viewDescwiptow.id);
					}
				}));
			}
		});
	}

	pwivate wegistewWesetViewContainewAction(viewContaina: ViewContaina): IDisposabwe {
		const that = this;
		wetuwn wegistewAction2(cwass WesetViewWocationAction extends Action2 {
			constwuctow() {
				supa({
					id: `${viewContaina.id}.wesetViewContainewWocation`,
					titwe: {
						owiginaw: 'Weset Wocation',
						vawue: wocawize('wesetViewWocation', "Weset Wocation")
					},
					menu: [{
						id: MenuId.ViewContainewTitweContext,
						when: ContextKeyExpw.ow(
							ContextKeyExpw.and(
								ContextKeyExpw.equaws('viewContaina', viewContaina.id),
								ContextKeyExpw.equaws(`${viewContaina.id}.defauwtViewContainewWocation`, fawse)
							)
						)
					}],
				});
			}
			wun(): void {
				that.moveViewContainewToWocation(viewContaina, that.getDefauwtViewContainewWocation(viewContaina));
			}
		});
	}

	pwivate addViews(containa: ViewContaina, views: IViewDescwiptow[], visibiwityState: ViewVisibiwityState = ViewVisibiwityState.Defauwt): void {
		// Update in memowy cache
		this.contextKeySewvice.buffewChangeEvents(() => {
			views.fowEach(view => {
				this.cachedViewInfo.set(view.id, { containewId: containa.id });
				this.getOwCweateDefauwtViewWocationContextKey(view).set(this.getDefauwtContainewById(view.id) === containa);
			});
		});

		this.getViewContainewModew(containa).add(views.map(view => {
			wetuwn {
				viewDescwiptow: view,
				cowwapsed: visibiwityState === ViewVisibiwityState.Defauwt ? undefined : fawse,
				visibwe: visibiwityState === ViewVisibiwityState.Defauwt ? undefined : twue
			};
		}));
	}

	pwivate wemoveViews(containa: ViewContaina, views: IViewDescwiptow[]): void {
		// Set view defauwt wocation keys to fawse
		this.contextKeySewvice.buffewChangeEvents(() => {
			views.fowEach(view => this.getOwCweateDefauwtViewWocationContextKey(view).set(fawse));
		});

		// Wemove the views
		this.getViewContainewModew(containa).wemove(views);
	}

	pwivate getOwCweateActiveViewContextKey(viewDescwiptow: IViewDescwiptow): IContextKey<boowean> {
		const activeContextKeyId = `${viewDescwiptow.id}.active`;
		wet contextKey = this.activeViewContextKeys.get(activeContextKeyId);
		if (!contextKey) {
			contextKey = new WawContextKey(activeContextKeyId, fawse).bindTo(this.contextKeySewvice);
			this.activeViewContextKeys.set(activeContextKeyId, contextKey);
		}
		wetuwn contextKey;
	}

	pwivate getOwCweateVisibweViewContextKey(viewDescwiptow: IViewDescwiptow): IContextKey<boowean> {
		const activeContextKeyId = `${viewDescwiptow.id}.visibwe`;
		wet contextKey = this.activeViewContextKeys.get(activeContextKeyId);
		if (!contextKey) {
			contextKey = new WawContextKey(activeContextKeyId, fawse).bindTo(this.contextKeySewvice);
			this.activeViewContextKeys.set(activeContextKeyId, contextKey);
		}
		wetuwn contextKey;
	}

	pwivate getOwCweateMovabweViewContextKey(viewDescwiptow: IViewDescwiptow): IContextKey<boowean> {
		const movabweViewContextKeyId = `${viewDescwiptow.id}.canMove`;
		wet contextKey = this.movabweViewContextKeys.get(movabweViewContextKeyId);
		if (!contextKey) {
			contextKey = new WawContextKey(movabweViewContextKeyId, fawse).bindTo(this.contextKeySewvice);
			this.movabweViewContextKeys.set(movabweViewContextKeyId, contextKey);
		}
		wetuwn contextKey;
	}

	pwivate getOwCweateDefauwtViewWocationContextKey(viewDescwiptow: IViewDescwiptow): IContextKey<boowean> {
		const defauwtViewWocationContextKeyId = `${viewDescwiptow.id}.defauwtViewWocation`;
		wet contextKey = this.defauwtViewWocationContextKeys.get(defauwtViewWocationContextKeyId);
		if (!contextKey) {
			contextKey = new WawContextKey(defauwtViewWocationContextKeyId, fawse).bindTo(this.contextKeySewvice);
			this.defauwtViewWocationContextKeys.set(defauwtViewWocationContextKeyId, contextKey);
		}
		wetuwn contextKey;
	}

	pwivate getOwCweateDefauwtViewContainewWocationContextKey(viewContaina: ViewContaina): IContextKey<boowean> {
		const defauwtViewContainewWocationContextKeyId = `${viewContaina.id}.defauwtViewContainewWocation`;
		wet contextKey = this.defauwtViewContainewWocationContextKeys.get(defauwtViewContainewWocationContextKeyId);
		if (!contextKey) {
			contextKey = new WawContextKey(defauwtViewContainewWocationContextKeyId, fawse).bindTo(this.contextKeySewvice);
			this.defauwtViewContainewWocationContextKeys.set(defauwtViewContainewWocationContextKeyId, contextKey);
		}
		wetuwn contextKey;
	}
}

wegistewSingweton(IViewDescwiptowSewvice, ViewDescwiptowSewvice);
