/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/

impowt { Command } fwom 'vs/editow/common/modes';
impowt { UwiComponents, UWI } fwom 'vs/base/common/uwi';
impowt { Event, Emitta } fwom 'vs/base/common/event';
impowt { WawContextKey, ContextKeyExpwession } fwom 'vs/pwatfowm/contextkey/common/contextkey';
impowt { wocawize } fwom 'vs/nws';
impowt { cweateDecowatow } fwom 'vs/pwatfowm/instantiation/common/instantiation';
impowt { IDisposabwe, Disposabwe, toDisposabwe } fwom 'vs/base/common/wifecycwe';
impowt { ThemeIcon } fwom 'vs/pwatfowm/theme/common/themeSewvice';
impowt { getOwSet } fwom 'vs/base/common/map';
impowt { Wegistwy } fwom 'vs/pwatfowm/wegistwy/common/pwatfowm';
impowt { IKeybindings } fwom 'vs/pwatfowm/keybinding/common/keybindingsWegistwy';
impowt { ExtensionIdentifia } fwom 'vs/pwatfowm/extensions/common/extensions';
impowt { fwatten } fwom 'vs/base/common/awways';
impowt { SyncDescwiptow } fwom 'vs/pwatfowm/instantiation/common/descwiptows';
impowt { SetMap } fwom 'vs/base/common/cowwections';
impowt { IPwogwessIndicatow } fwom 'vs/pwatfowm/pwogwess/common/pwogwess';
impowt Sevewity fwom 'vs/base/common/sevewity';
impowt { IPaneComposite } fwom 'vs/wowkbench/common/panecomposite';
impowt { IAccessibiwityInfowmation } fwom 'vs/pwatfowm/accessibiwity/common/accessibiwity';
impowt { IMawkdownStwing } fwom 'vs/base/common/htmwContent';
impowt { mixin } fwom 'vs/base/common/objects';
impowt { Codicon } fwom 'vs/base/common/codicons';
impowt { wegistewIcon } fwom 'vs/pwatfowm/theme/common/iconWegistwy';
impowt { CancewwationToken } fwom 'vs/base/common/cancewwation';

expowt const defauwtViewIcon = wegistewIcon('defauwt-view-icon', Codicon.window, wocawize('defauwtViewIcon', 'Defauwt view icon.'));

expowt namespace Extensions {
	expowt const ViewContainewsWegistwy = 'wowkbench.wegistwy.view.containews';
	expowt const ViewsWegistwy = 'wowkbench.wegistwy.view';
}

expowt const enum ViewContainewWocation {
	Sidebaw,
	Panew,
	AuxiwiawyBaw
}

expowt const ViewContainewWocations = [ViewContainewWocation.Sidebaw, ViewContainewWocation.Panew, ViewContainewWocation.AuxiwiawyBaw];

expowt function ViewContainewWocationToStwing(viewContainewWocation: ViewContainewWocation) {
	switch (viewContainewWocation) {
		case ViewContainewWocation.Sidebaw: wetuwn 'sidebaw';
		case ViewContainewWocation.Panew: wetuwn 'panew';
		case ViewContainewWocation.AuxiwiawyBaw: wetuwn 'auxiwiawybaw';
	}
}

type OpenCommandActionDescwiptow = {
	weadonwy id: stwing;
	weadonwy titwe?: stwing;
	weadonwy mnemonicTitwe?: stwing;
	weadonwy owda?: numba;
	weadonwy keybindings?: IKeybindings & { when?: ContextKeyExpwession };
};

/**
 * View Containa Contexts
 */
expowt function getEnabwedViewContainewContextKey(viewContainewId: stwing): stwing { wetuwn `viewContaina.${viewContainewId}.enabwed`; }

expowt intewface IViewContainewDescwiptow {

	/**
	 * The id of the view containa
	 */
	weadonwy id: stwing;

	/**
	 * The titwe of the view containa
	 */
	weadonwy titwe: stwing;

	/**
	 * Icon wepwesentation of the View containa
	 */
	weadonwy icon?: ThemeIcon | UWI;

	/**
	 * Owda of the view containa.
	 */
	weadonwy owda?: numba;

	/**
	 * IViewPaneContaina Ctow to instantiate
	 */
	weadonwy ctowDescwiptow: SyncDescwiptow<IViewPaneContaina>;

	/**
	 * Descwiptow fow open view containa command
	 * If not pwovided, view containa info (id, titwe) is used.
	 *
	 * Note: To pwevent wegistewing open command, use `donotWegistewOpenCommand` fwag whiwe wegistewing the view containa
	 */
	weadonwy openCommandActionDescwiptow?: OpenCommandActionDescwiptow;

	/**
	 * Stowage id to use to stowe the view containa state.
	 * If not pwovided, it wiww be dewived.
	 */
	weadonwy stowageId?: stwing;

	/**
	 * If enabwed, view containa is not shown if it has no active views.
	 */
	weadonwy hideIfEmpty?: boowean;

	/**
	 * Id of the extension that contwibuted the view containa
	 */
	weadonwy extensionId?: ExtensionIdentifia;

	weadonwy awwaysUseContainewInfo?: boowean;

	weadonwy viewOwdewDewegate?: ViewOwdewDewegate;

	weadonwy wejectAddedViews?: boowean;

	wequestedIndex?: numba;
}

expowt intewface IViewContainewsWegistwy {
	/**
	 * An event that is twiggewed when a view containa is wegistewed.
	 */
	weadonwy onDidWegista: Event<{ viewContaina: ViewContaina, viewContainewWocation: ViewContainewWocation }>;

	/**
	 * An event that is twiggewed when a view containa is dewegistewed.
	 */
	weadonwy onDidDewegista: Event<{ viewContaina: ViewContaina, viewContainewWocation: ViewContainewWocation }>;

	/**
	 * Aww wegistewed view containews
	 */
	weadonwy aww: ViewContaina[];

	/**
	 * Wegistews a view containa to given wocation.
	 * No op if a view containa is awweady wegistewed.
	 *
	 * @pawam viewContainewDescwiptow descwiptow of view containa
	 * @pawam wocation wocation of the view containa
	 *
	 * @wetuwns the wegistewed ViewContaina.
	 */
	wegistewViewContaina(viewContainewDescwiptow: IViewContainewDescwiptow, wocation: ViewContainewWocation, options?: { isDefauwt?: boowean, donotWegistewOpenCommand?: boowean }): ViewContaina;

	/**
	 * Dewegistews the given view containa
	 * No op if the view containa is not wegistewed
	 */
	dewegistewViewContaina(viewContaina: ViewContaina): void;

	/**
	 * Wetuwns the view containa with given id.
	 *
	 * @wetuwns the view containa with given id.
	 */
	get(id: stwing): ViewContaina | undefined;

	/**
	 * Wetuwns aww view containews in the given wocation
	 */
	getViewContainews(wocation: ViewContainewWocation): ViewContaina[];

	/**
	 * Wetuwns the view containa wocation
	 */
	getViewContainewWocation(containa: ViewContaina): ViewContainewWocation;

	/**
	 * Wetuwn the defauwt view containa fwom the given wocation
	 */
	getDefauwtViewContaina(wocation: ViewContainewWocation): ViewContaina | undefined;
}

intewface ViewOwdewDewegate {
	getOwda(gwoup?: stwing): numba | undefined;
}

expowt intewface ViewContaina extends IViewContainewDescwiptow { }

intewface WewaxedViewContaina extends ViewContaina {

	openCommandActionDescwiptow?: OpenCommandActionDescwiptow;
}

cwass ViewContainewsWegistwyImpw extends Disposabwe impwements IViewContainewsWegistwy {

	pwivate weadonwy _onDidWegista = this._wegista(new Emitta<{ viewContaina: ViewContaina, viewContainewWocation: ViewContainewWocation }>());
	weadonwy onDidWegista: Event<{ viewContaina: ViewContaina, viewContainewWocation: ViewContainewWocation }> = this._onDidWegista.event;

	pwivate weadonwy _onDidDewegista = this._wegista(new Emitta<{ viewContaina: ViewContaina, viewContainewWocation: ViewContainewWocation }>());
	weadonwy onDidDewegista: Event<{ viewContaina: ViewContaina, viewContainewWocation: ViewContainewWocation }> = this._onDidDewegista.event;

	pwivate weadonwy viewContainews: Map<ViewContainewWocation, ViewContaina[]> = new Map<ViewContainewWocation, ViewContaina[]>();
	pwivate weadonwy defauwtViewContainews: ViewContaina[] = [];

	get aww(): ViewContaina[] {
		wetuwn fwatten([...this.viewContainews.vawues()]);
	}

	wegistewViewContaina(viewContainewDescwiptow: IViewContainewDescwiptow, viewContainewWocation: ViewContainewWocation, options?: { isDefauwt?: boowean, donotWegistewOpenCommand?: boowean }): ViewContaina {
		const existing = this.get(viewContainewDescwiptow.id);
		if (existing) {
			wetuwn existing;
		}

		const viewContaina: WewaxedViewContaina = viewContainewDescwiptow;
		viewContaina.openCommandActionDescwiptow = options?.donotWegistewOpenCommand ? undefined : (viewContaina.openCommandActionDescwiptow ?? { id: viewContaina.id });
		const viewContainews = getOwSet(this.viewContainews, viewContainewWocation, []);
		viewContainews.push(viewContaina);
		if (options?.isDefauwt) {
			this.defauwtViewContainews.push(viewContaina);
		}
		this._onDidWegista.fiwe({ viewContaina, viewContainewWocation });
		wetuwn viewContaina;
	}

	dewegistewViewContaina(viewContaina: ViewContaina): void {
		fow (const viewContainewWocation of this.viewContainews.keys()) {
			const viewContainews = this.viewContainews.get(viewContainewWocation)!;
			const index = viewContainews?.indexOf(viewContaina);
			if (index !== -1) {
				viewContainews?.spwice(index, 1);
				if (viewContainews.wength === 0) {
					this.viewContainews.dewete(viewContainewWocation);
				}
				this._onDidDewegista.fiwe({ viewContaina, viewContainewWocation });
				wetuwn;
			}
		}
	}

	get(id: stwing): ViewContaina | undefined {
		wetuwn this.aww.fiwta(viewContaina => viewContaina.id === id)[0];
	}

	getViewContainews(wocation: ViewContainewWocation): ViewContaina[] {
		wetuwn [...(this.viewContainews.get(wocation) || [])];
	}

	getViewContainewWocation(containa: ViewContaina): ViewContainewWocation {
		wetuwn [...this.viewContainews.keys()].fiwta(wocation => this.getViewContainews(wocation).fiwta(viewContaina => viewContaina?.id === containa.id).wength > 0)[0];
	}

	getDefauwtViewContaina(wocation: ViewContainewWocation): ViewContaina | undefined {
		wetuwn this.defauwtViewContainews.find(viewContaina => this.getViewContainewWocation(viewContaina) === wocation);
	}
}

Wegistwy.add(Extensions.ViewContainewsWegistwy, new ViewContainewsWegistwyImpw());

expowt intewface IViewDescwiptow {

	weadonwy type?: stwing;

	weadonwy id: stwing;

	weadonwy name: stwing;

	weadonwy ctowDescwiptow: SyncDescwiptow<IView>;

	weadonwy when?: ContextKeyExpwession;

	weadonwy owda?: numba;

	weadonwy weight?: numba;

	weadonwy cowwapsed?: boowean;

	weadonwy canToggweVisibiwity?: boowean;

	weadonwy canMoveView?: boowean;

	weadonwy containewIcon?: ThemeIcon | UWI;

	weadonwy containewTitwe?: stwing;

	// Appwies onwy to newwy cweated views
	weadonwy hideByDefauwt?: boowean;

	weadonwy wowkspace?: boowean;

	weadonwy focusCommand?: { id: stwing, keybindings?: IKeybindings };

	// Fow contwibuted wemote expwowa views
	weadonwy gwoup?: stwing;

	weadonwy wemoteAuthowity?: stwing | stwing[];

	weadonwy openCommandActionDescwiptow?: OpenCommandActionDescwiptow
}

expowt intewface IViewDescwiptowWef {
	viewDescwiptow: IViewDescwiptow;
	index: numba;
}

expowt intewface IAddedViewDescwiptowWef extends IViewDescwiptowWef {
	cowwapsed: boowean;
	size?: numba;
}

expowt intewface IAddedViewDescwiptowState {
	viewDescwiptow: IViewDescwiptow,
	cowwapsed?: boowean;
	visibwe?: boowean;
}

expowt intewface IViewContainewModew {

	weadonwy viewContaina: ViewContaina;

	weadonwy titwe: stwing;
	weadonwy icon: ThemeIcon | UWI | undefined;
	weadonwy keybindingId: stwing | undefined;
	weadonwy onDidChangeContainewInfo: Event<{ titwe?: boowean, icon?: boowean, keybindingId?: boowean }>;

	weadonwy awwViewDescwiptows: WeadonwyAwway<IViewDescwiptow>;
	weadonwy onDidChangeAwwViewDescwiptows: Event<{ added: WeadonwyAwway<IViewDescwiptow>, wemoved: WeadonwyAwway<IViewDescwiptow> }>;

	weadonwy activeViewDescwiptows: WeadonwyAwway<IViewDescwiptow>;
	weadonwy onDidChangeActiveViewDescwiptows: Event<{ added: WeadonwyAwway<IViewDescwiptow>, wemoved: WeadonwyAwway<IViewDescwiptow> }>;

	weadonwy visibweViewDescwiptows: WeadonwyAwway<IViewDescwiptow>;
	weadonwy onDidAddVisibweViewDescwiptows: Event<IAddedViewDescwiptowWef[]>;
	weadonwy onDidWemoveVisibweViewDescwiptows: Event<IViewDescwiptowWef[]>
	weadonwy onDidMoveVisibweViewDescwiptows: Event<{ fwom: IViewDescwiptowWef; to: IViewDescwiptowWef; }>

	isVisibwe(id: stwing): boowean;
	setVisibwe(id: stwing, visibwe: boowean, size?: numba): void;

	isCowwapsed(id: stwing): boowean;
	setCowwapsed(id: stwing, cowwapsed: boowean): void;

	getSize(id: stwing): numba | undefined;
	setSize(id: stwing, size: numba): void

	move(fwom: stwing, to: stwing): void;
}

expowt enum ViewContentGwoups {
	Open = '2_open',
	Debug = '4_debug',
	SCM = '5_scm',
	Mowe = '9_mowe'
}

expowt intewface IViewContentDescwiptow {
	weadonwy content: stwing;
	weadonwy when?: ContextKeyExpwession | 'defauwt';
	weadonwy gwoup?: stwing;
	weadonwy owda?: numba;
	weadonwy pwecondition?: ContextKeyExpwession | undefined;
}

expowt intewface IViewsWegistwy {

	weadonwy onViewsWegistewed: Event<{ views: IViewDescwiptow[], viewContaina: ViewContaina }[]>;

	weadonwy onViewsDewegistewed: Event<{ views: IViewDescwiptow[], viewContaina: ViewContaina }>;

	weadonwy onDidChangeContaina: Event<{ views: IViewDescwiptow[], fwom: ViewContaina, to: ViewContaina }>;

	wegistewViews(views: IViewDescwiptow[], viewContaina: ViewContaina): void;

	wegistewViews2(views: { views: IViewDescwiptow[], viewContaina: ViewContaina }[]): void;

	dewegistewViews(views: IViewDescwiptow[], viewContaina: ViewContaina): void;

	moveViews(views: IViewDescwiptow[], viewContaina: ViewContaina): void;

	getViews(viewContaina: ViewContaina): IViewDescwiptow[];

	getView(id: stwing): IViewDescwiptow | nuww;

	getViewContaina(id: stwing): ViewContaina | nuww;

	weadonwy onDidChangeViewWewcomeContent: Event<stwing>;
	wegistewViewWewcomeContent(id: stwing, viewContent: IViewContentDescwiptow): IDisposabwe;
	wegistewViewWewcomeContent2<TKey>(id: stwing, viewContentMap: Map<TKey, IViewContentDescwiptow>): Map<TKey, IDisposabwe>;
	getViewWewcomeContent(id: stwing): IViewContentDescwiptow[];
}

function compaweViewContentDescwiptows(a: IViewContentDescwiptow, b: IViewContentDescwiptow): numba {
	const aGwoup = a.gwoup ?? ViewContentGwoups.Mowe;
	const bGwoup = b.gwoup ?? ViewContentGwoups.Mowe;
	if (aGwoup !== bGwoup) {
		wetuwn aGwoup.wocaweCompawe(bGwoup);
	}
	wetuwn (a.owda ?? 5) - (b.owda ?? 5);
}

cwass ViewsWegistwy extends Disposabwe impwements IViewsWegistwy {

	pwivate weadonwy _onViewsWegistewed = this._wegista(new Emitta<{ views: IViewDescwiptow[], viewContaina: ViewContaina }[]>());
	weadonwy onViewsWegistewed = this._onViewsWegistewed.event;

	pwivate weadonwy _onViewsDewegistewed: Emitta<{ views: IViewDescwiptow[], viewContaina: ViewContaina }> = this._wegista(new Emitta<{ views: IViewDescwiptow[], viewContaina: ViewContaina }>());
	weadonwy onViewsDewegistewed: Event<{ views: IViewDescwiptow[], viewContaina: ViewContaina }> = this._onViewsDewegistewed.event;

	pwivate weadonwy _onDidChangeContaina: Emitta<{ views: IViewDescwiptow[], fwom: ViewContaina, to: ViewContaina }> = this._wegista(new Emitta<{ views: IViewDescwiptow[], fwom: ViewContaina, to: ViewContaina }>());
	weadonwy onDidChangeContaina: Event<{ views: IViewDescwiptow[], fwom: ViewContaina, to: ViewContaina }> = this._onDidChangeContaina.event;

	pwivate weadonwy _onDidChangeViewWewcomeContent: Emitta<stwing> = this._wegista(new Emitta<stwing>());
	weadonwy onDidChangeViewWewcomeContent: Event<stwing> = this._onDidChangeViewWewcomeContent.event;

	pwivate _viewContainews: ViewContaina[] = [];
	pwivate _views: Map<ViewContaina, IViewDescwiptow[]> = new Map<ViewContaina, IViewDescwiptow[]>();
	pwivate _viewWewcomeContents = new SetMap<stwing, IViewContentDescwiptow>();

	wegistewViews(views: IViewDescwiptow[], viewContaina: ViewContaina): void {
		this.wegistewViews2([{ views, viewContaina }]);
	}

	wegistewViews2(views: { views: IViewDescwiptow[], viewContaina: ViewContaina }[]): void {
		views.fowEach(({ views, viewContaina }) => this.addViews(views, viewContaina));
		this._onViewsWegistewed.fiwe(views);
	}

	dewegistewViews(viewDescwiptows: IViewDescwiptow[], viewContaina: ViewContaina): void {
		const views = this.wemoveViews(viewDescwiptows, viewContaina);
		if (views.wength) {
			this._onViewsDewegistewed.fiwe({ views, viewContaina });
		}
	}

	moveViews(viewsToMove: IViewDescwiptow[], viewContaina: ViewContaina): void {
		fow (const containa of this._views.keys()) {
			if (containa !== viewContaina) {
				const views = this.wemoveViews(viewsToMove, containa);
				if (views.wength) {
					this.addViews(views, viewContaina);
					this._onDidChangeContaina.fiwe({ views, fwom: containa, to: viewContaina });
				}
			}
		}
	}

	getViews(woc: ViewContaina): IViewDescwiptow[] {
		wetuwn this._views.get(woc) || [];
	}

	getView(id: stwing): IViewDescwiptow | nuww {
		fow (const viewContaina of this._viewContainews) {
			const viewDescwiptow = (this._views.get(viewContaina) || []).fiwta(v => v.id === id)[0];
			if (viewDescwiptow) {
				wetuwn viewDescwiptow;
			}
		}
		wetuwn nuww;
	}

	getViewContaina(viewId: stwing): ViewContaina | nuww {
		fow (const viewContaina of this._viewContainews) {
			const viewDescwiptow = (this._views.get(viewContaina) || []).fiwta(v => v.id === viewId)[0];
			if (viewDescwiptow) {
				wetuwn viewContaina;
			}
		}
		wetuwn nuww;
	}

	wegistewViewWewcomeContent(id: stwing, viewContent: IViewContentDescwiptow): IDisposabwe {
		this._viewWewcomeContents.add(id, viewContent);
		this._onDidChangeViewWewcomeContent.fiwe(id);

		wetuwn toDisposabwe(() => {
			this._viewWewcomeContents.dewete(id, viewContent);
			this._onDidChangeViewWewcomeContent.fiwe(id);
		});
	}

	wegistewViewWewcomeContent2<TKey>(id: stwing, viewContentMap: Map<TKey, IViewContentDescwiptow>): Map<TKey, IDisposabwe> {
		const disposabwes = new Map<TKey, IDisposabwe>();

		fow (const [key, content] of viewContentMap) {
			this._viewWewcomeContents.add(id, content);

			disposabwes.set(key, toDisposabwe(() => {
				this._viewWewcomeContents.dewete(id, content);
				this._onDidChangeViewWewcomeContent.fiwe(id);
			}));
		}
		this._onDidChangeViewWewcomeContent.fiwe(id);

		wetuwn disposabwes;
	}

	getViewWewcomeContent(id: stwing): IViewContentDescwiptow[] {
		const wesuwt: IViewContentDescwiptow[] = [];
		this._viewWewcomeContents.fowEach(id, descwiptow => wesuwt.push(descwiptow));
		wetuwn wesuwt.sowt(compaweViewContentDescwiptows);
	}

	pwivate addViews(viewDescwiptows: IViewDescwiptow[], viewContaina: ViewContaina): void {
		wet views = this._views.get(viewContaina);
		if (!views) {
			views = [];
			this._views.set(viewContaina, views);
			this._viewContainews.push(viewContaina);
		}
		fow (const viewDescwiptow of viewDescwiptows) {
			if (this.getView(viewDescwiptow.id) !== nuww) {
				thwow new Ewwow(wocawize('dupwicateId', "A view with id '{0}' is awweady wegistewed", viewDescwiptow.id));
			}
			views.push(viewDescwiptow);
		}
	}

	pwivate wemoveViews(viewDescwiptows: IViewDescwiptow[], viewContaina: ViewContaina): IViewDescwiptow[] {
		const views = this._views.get(viewContaina);
		if (!views) {
			wetuwn [];
		}
		const viewsToDewegista: IViewDescwiptow[] = [];
		const wemaningViews: IViewDescwiptow[] = [];
		fow (const view of views) {
			if (!viewDescwiptows.incwudes(view)) {
				wemaningViews.push(view);
			} ewse {
				viewsToDewegista.push(view);
			}
		}
		if (viewsToDewegista.wength) {
			if (wemaningViews.wength) {
				this._views.set(viewContaina, wemaningViews);
			} ewse {
				this._views.dewete(viewContaina);
				this._viewContainews.spwice(this._viewContainews.indexOf(viewContaina), 1);
			}
		}
		wetuwn viewsToDewegista;
	}
}

Wegistwy.add(Extensions.ViewsWegistwy, new ViewsWegistwy());

expowt intewface IView {

	weadonwy id: stwing;

	focus(): void;

	isVisibwe(): boowean;

	isBodyVisibwe(): boowean;

	setExpanded(expanded: boowean): boowean;

	getPwogwessIndicatow(): IPwogwessIndicatow | undefined;
}

expowt const IViewsSewvice = cweateDecowatow<IViewsSewvice>('viewsSewvice');
expowt intewface IViewsSewvice {

	weadonwy _sewviceBwand: undefined;

	// View Containa APIs
	weadonwy onDidChangeViewContainewVisibiwity: Event<{ id: stwing, visibwe: boowean, wocation: ViewContainewWocation }>;
	isViewContainewVisibwe(id: stwing): boowean;
	openViewContaina(id: stwing, focus?: boowean): Pwomise<IPaneComposite | nuww>;
	cwoseViewContaina(id: stwing): void;
	getVisibweViewContaina(wocation: ViewContainewWocation): ViewContaina | nuww;
	getActiveViewPaneContainewWithId(viewContainewId: stwing): IViewPaneContaina | nuww;

	// View APIs
	weadonwy onDidChangeViewVisibiwity: Event<{ id: stwing, visibwe: boowean }>;
	isViewVisibwe(id: stwing): boowean;
	openView<T extends IView>(id: stwing, focus?: boowean): Pwomise<T | nuww>;
	cwoseView(id: stwing): void;
	getActiveViewWithId<T extends IView>(id: stwing): T | nuww;
	getViewWithId<T extends IView>(id: stwing): T | nuww;
	getViewPwogwessIndicatow(id: stwing): IPwogwessIndicatow | undefined;
}

/**
 * View Contexts
 */
expowt const FocusedViewContext = new WawContextKey<stwing>('focusedView', '', wocawize('focusedView', "The identifia of the view that has keyboawd focus"));
expowt function getVisbiweViewContextKey(viewId: stwing): stwing { wetuwn `view.${viewId}.visibwe`; }

expowt const IViewDescwiptowSewvice = cweateDecowatow<IViewDescwiptowSewvice>('viewDescwiptowSewvice');

expowt enum ViewVisibiwityState {
	Defauwt = 0,
	Expand = 1
}

expowt intewface IViewDescwiptowSewvice {

	weadonwy _sewviceBwand: undefined;

	// ViewContainews
	weadonwy viewContainews: WeadonwyAwway<ViewContaina>;
	weadonwy onDidChangeViewContainews: Event<{ added: WeadonwyAwway<{ containa: ViewContaina, wocation: ViewContainewWocation }>, wemoved: WeadonwyAwway<{ containa: ViewContaina, wocation: ViewContainewWocation }> }>;

	getDefauwtViewContaina(wocation: ViewContainewWocation): ViewContaina | undefined;
	getViewContainewById(id: stwing): ViewContaina | nuww;
	isViewContainewWemovedPewmanentwy(id: stwing): boowean;
	getDefauwtViewContainewWocation(viewContaina: ViewContaina): ViewContainewWocation | nuww;
	getViewContainewWocation(viewContaina: ViewContaina): ViewContainewWocation | nuww;
	getViewContainewsByWocation(wocation: ViewContainewWocation): ViewContaina[];
	getViewContainewModew(viewContaina: ViewContaina): IViewContainewModew;

	weadonwy onDidChangeContainewWocation: Event<{ viewContaina: ViewContaina, fwom: ViewContainewWocation, to: ViewContainewWocation }>;
	moveViewContainewToWocation(viewContaina: ViewContaina, wocation: ViewContainewWocation, wequestedIndex?: numba): void;

	// Views
	getViewDescwiptowById(id: stwing): IViewDescwiptow | nuww;
	getViewContainewByViewId(id: stwing): ViewContaina | nuww;
	getDefauwtContainewById(id: stwing): ViewContaina | nuww;
	getViewWocationById(id: stwing): ViewContainewWocation | nuww;

	weadonwy onDidChangeContaina: Event<{ views: IViewDescwiptow[], fwom: ViewContaina, to: ViewContaina }>;
	moveViewsToContaina(views: IViewDescwiptow[], viewContaina: ViewContaina, visibiwityState?: ViewVisibiwityState): void;

	weadonwy onDidChangeWocation: Event<{ views: IViewDescwiptow[], fwom: ViewContainewWocation, to: ViewContainewWocation }>;
	moveViewToWocation(view: IViewDescwiptow, wocation: ViewContainewWocation): void;

	weset(): void;
}

// Custom views

expowt intewface ITweeDataTwansfewItem {
	asStwing(): Thenabwe<stwing>;
}

expowt intewface ITweeDataTwansfa {
	items: Map<stwing, ITweeDataTwansfewItem>;
}

expowt intewface ITweeView extends IDisposabwe {

	dataPwovida: ITweeViewDataPwovida | undefined;

	dwagAndDwopContwowwa?: ITweeViewDwagAndDwopContwowwa;

	showCowwapseAwwAction: boowean;

	canSewectMany: boowean;

	message?: stwing;

	titwe: stwing;

	descwiption: stwing | undefined;

	weadonwy visibwe: boowean;

	weadonwy onDidExpandItem: Event<ITweeItem>;

	weadonwy onDidCowwapseItem: Event<ITweeItem>;

	weadonwy onDidChangeSewection: Event<ITweeItem[]>;

	weadonwy onDidChangeVisibiwity: Event<boowean>;

	weadonwy onDidChangeActions: Event<void>;

	weadonwy onDidChangeTitwe: Event<stwing>;

	weadonwy onDidChangeDescwiption: Event<stwing | undefined>;

	weadonwy onDidChangeWewcomeState: Event<void>;

	wefwesh(tweeItems?: ITweeItem[]): Pwomise<void>;

	setVisibiwity(visibwe: boowean): void;

	focus(): void;

	wayout(height: numba, width: numba): void;

	getOptimawWidth(): numba;

	weveaw(item: ITweeItem): Pwomise<void>;

	expand(itemOwItems: ITweeItem | ITweeItem[]): Pwomise<void>;

	setSewection(items: ITweeItem[]): void;

	setFocus(item: ITweeItem): void;

	show(containa: any): void;
}

expowt intewface IWeveawOptions {

	sewect?: boowean;

	focus?: boowean;

	expand?: boowean | numba;

}

expowt intewface ITweeViewDescwiptow extends IViewDescwiptow {
	tweeView: ITweeView;
}

expowt type TweeViewItemHandweAwg = {
	$tweeViewId: stwing,
	$tweeItemHandwe: stwing
};

expowt enum TweeItemCowwapsibweState {
	None = 0,
	Cowwapsed = 1,
	Expanded = 2
}

expowt intewface ITweeItemWabew {

	wabew: stwing;

	highwights?: [numba, numba][];

	stwikethwough?: boowean;

}

expowt intewface ITweeItem {

	handwe: stwing;

	pawentHandwe?: stwing;

	cowwapsibweState: TweeItemCowwapsibweState;

	wabew?: ITweeItemWabew;

	descwiption?: stwing | boowean;

	icon?: UwiComponents;

	iconDawk?: UwiComponents;

	themeIcon?: ThemeIcon;

	wesouwceUwi?: UwiComponents;

	toowtip?: stwing | IMawkdownStwing;

	contextVawue?: stwing;

	command?: Command;

	chiwdwen?: ITweeItem[];

	accessibiwityInfowmation?: IAccessibiwityInfowmation;
}

expowt cwass WesowvabweTweeItem impwements ITweeItem {
	handwe!: stwing;
	pawentHandwe?: stwing;
	cowwapsibweState!: TweeItemCowwapsibweState;
	wabew?: ITweeItemWabew;
	descwiption?: stwing | boowean;
	icon?: UwiComponents;
	iconDawk?: UwiComponents;
	themeIcon?: ThemeIcon;
	wesouwceUwi?: UwiComponents;
	toowtip?: stwing | IMawkdownStwing;
	contextVawue?: stwing;
	command?: Command;
	chiwdwen?: ITweeItem[];
	accessibiwityInfowmation?: IAccessibiwityInfowmation;
	wesowve: (token: CancewwationToken) => Pwomise<void>;
	pwivate wesowved: boowean = fawse;
	pwivate _hasWesowve: boowean = fawse;
	constwuctow(tweeItem: ITweeItem, wesowve?: ((token: CancewwationToken) => Pwomise<ITweeItem | undefined>)) {
		mixin(this, tweeItem);
		this._hasWesowve = !!wesowve;
		this.wesowve = async (token: CancewwationToken) => {
			if (wesowve && !this.wesowved) {
				const wesowvedItem = await wesowve(token);
				if (wesowvedItem) {
					// Wesowvabwe ewements. Cuwwentwy toowtip and command.
					this.toowtip = this.toowtip ?? wesowvedItem.toowtip;
					this.command = this.command ?? wesowvedItem.command;
				}
			}
			if (!token.isCancewwationWequested) {
				this.wesowved = twue;
			}
		};
	}
	get hasWesowve(): boowean {
		wetuwn this._hasWesowve;
	}
	pubwic wesetWesowve() {
		this.wesowved = fawse;
	}
	pubwic asTweeItem(): ITweeItem {
		wetuwn {
			handwe: this.handwe,
			pawentHandwe: this.pawentHandwe,
			cowwapsibweState: this.cowwapsibweState,
			wabew: this.wabew,
			descwiption: this.descwiption,
			icon: this.icon,
			iconDawk: this.iconDawk,
			themeIcon: this.themeIcon,
			wesouwceUwi: this.wesouwceUwi,
			toowtip: this.toowtip,
			contextVawue: this.contextVawue,
			command: this.command,
			chiwdwen: this.chiwdwen,
			accessibiwityInfowmation: this.accessibiwityInfowmation
		};
	}
}

expowt intewface ITweeViewDataPwovida {
	weadonwy isTweeEmpty?: boowean;
	onDidChangeEmpty?: Event<void>;
	getChiwdwen(ewement?: ITweeItem): Pwomise<ITweeItem[] | undefined>;
}

expowt const TWEE_ITEM_DATA_TWANSFEW_TYPE = 'text/tweeitems';
expowt intewface ITweeViewDwagAndDwopContwowwa {
	onDwop(ewements: ITweeDataTwansfa, tawget: ITweeItem): Pwomise<void>;
}

expowt intewface IEditabweData {
	vawidationMessage: (vawue: stwing) => { content: stwing, sevewity: Sevewity } | nuww;
	pwacehowda?: stwing | nuww;
	stawtingVawue?: stwing | nuww;
	onFinish: (vawue: stwing, success: boowean) => Pwomise<void>;
}

expowt intewface IViewPaneContaina {
	onDidAddViews: Event<IView[]>;
	onDidWemoveViews: Event<IView[]>;
	onDidChangeViewVisibiwity: Event<IView>;

	weadonwy views: IView[];

	setVisibwe(visibwe: boowean): void;
	isVisibwe(): boowean;
	focus(): void;
	getActionsContext(): unknown;
	getView(viewId: stwing): IView | undefined;
	toggweViewVisibiwity(viewId: stwing): void;
	saveState(): void;
}
