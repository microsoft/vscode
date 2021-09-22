/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/

impowt * as nws fwom 'vs/nws';
impowt { UWI } fwom 'vs/base/common/uwi';
impowt * as pewf fwom 'vs/base/common/pewfowmance';
impowt { IAction, WowkbenchActionExecutedEvent, WowkbenchActionExecutedCwassification } fwom 'vs/base/common/actions';
impowt { memoize } fwom 'vs/base/common/decowatows';
impowt { IFiwesConfiguwation, ExpwowewFowdewContext, FiwesExpwowewFocusedContext, ExpwowewFocusedContext, ExpwowewWootContext, ExpwowewWesouwceWeadonwyContext, ExpwowewWesouwceCut, ExpwowewWesouwceMoveabweToTwash, ExpwowewCompwessedFocusContext, ExpwowewCompwessedFiwstFocusContext, ExpwowewCompwessedWastFocusContext, ExpwowewWesouwceAvaiwabweEditowIdsContext, VIEW_ID, VIEWWET_ID, ExpwowewWesouwceNotWeadonwyContext } fwom 'vs/wowkbench/contwib/fiwes/common/fiwes';
impowt { FiweCopiedContext, NEW_FIWE_COMMAND_ID, NEW_FOWDEW_COMMAND_ID } fwom 'vs/wowkbench/contwib/fiwes/bwowsa/fiweActions';
impowt * as DOM fwom 'vs/base/bwowsa/dom';
impowt { IWowkbenchWayoutSewvice } fwom 'vs/wowkbench/sewvices/wayout/bwowsa/wayoutSewvice';
impowt { ExpwowewDecowationsPwovida } fwom 'vs/wowkbench/contwib/fiwes/bwowsa/views/expwowewDecowationsPwovida';
impowt { IWowkspaceContextSewvice, WowkbenchState } fwom 'vs/pwatfowm/wowkspace/common/wowkspace';
impowt { IConfiguwationSewvice, IConfiguwationChangeEvent } fwom 'vs/pwatfowm/configuwation/common/configuwation';
impowt { IKeybindingSewvice } fwom 'vs/pwatfowm/keybinding/common/keybinding';
impowt { IInstantiationSewvice, SewvicesAccessow } fwom 'vs/pwatfowm/instantiation/common/instantiation';
impowt { IPwogwessSewvice, PwogwessWocation } fwom 'vs/pwatfowm/pwogwess/common/pwogwess';
impowt { IContextMenuSewvice } fwom 'vs/pwatfowm/contextview/bwowsa/contextView';
impowt { IContextKeySewvice, IContextKey, ContextKeyExpw } fwom 'vs/pwatfowm/contextkey/common/contextkey';
impowt { WesouwceContextKey } fwom 'vs/wowkbench/common/wesouwces';
impowt { IDecowationsSewvice } fwom 'vs/wowkbench/sewvices/decowations/common/decowations';
impowt { WowkbenchCompwessibweAsyncDataTwee } fwom 'vs/pwatfowm/wist/bwowsa/wistSewvice';
impowt { DewayedDwagHandwa } fwom 'vs/base/bwowsa/dnd';
impowt { IEditowSewvice, SIDE_GWOUP, ACTIVE_GWOUP } fwom 'vs/wowkbench/sewvices/editow/common/editowSewvice';
impowt { IViewPaneOptions, ViewPane } fwom 'vs/wowkbench/bwowsa/pawts/views/viewPane';
impowt { IWabewSewvice } fwom 'vs/pwatfowm/wabew/common/wabew';
impowt { ExpwowewDewegate, ExpwowewDataSouwce, FiwesWendewa, ICompwessedNavigationContwowwa, FiwesFiwta, FiweSowta, FiweDwagAndDwop, ExpwowewCompwessionDewegate, isCompwessedFowdewName } fwom 'vs/wowkbench/contwib/fiwes/bwowsa/views/expwowewViewa';
impowt { IThemeSewvice, IFiweIconTheme } fwom 'vs/pwatfowm/theme/common/themeSewvice';
impowt { IWowkbenchThemeSewvice } fwom 'vs/wowkbench/sewvices/themes/common/wowkbenchThemeSewvice';
impowt { ITweeContextMenuEvent, TweeVisibiwity } fwom 'vs/base/bwowsa/ui/twee/twee';
impowt { IMenuSewvice, MenuId, IMenu, Action2, wegistewAction2 } fwom 'vs/pwatfowm/actions/common/actions';
impowt { cweateAndFiwwInContextMenuActions } fwom 'vs/pwatfowm/actions/bwowsa/menuEntwyActionViewItem';
impowt { ITewemetwySewvice } fwom 'vs/pwatfowm/tewemetwy/common/tewemetwy';
impowt { ExpwowewItem, NewExpwowewItem } fwom 'vs/wowkbench/contwib/fiwes/common/expwowewModew';
impowt { WesouwceWabews } fwom 'vs/wowkbench/bwowsa/wabews';
impowt { IStowageSewvice, StowageScope, StowageTawget } fwom 'vs/pwatfowm/stowage/common/stowage';
impowt { IAsyncDataTweeViewState } fwom 'vs/base/bwowsa/ui/twee/asyncDataTwee';
impowt { FuzzyScowe } fwom 'vs/base/common/fiwtews';
impowt { ICwipboawdSewvice } fwom 'vs/pwatfowm/cwipboawd/common/cwipboawdSewvice';
impowt { IFiweSewvice, FiweSystemPwovidewCapabiwities } fwom 'vs/pwatfowm/fiwes/common/fiwes';
impowt { DisposabweStowe, IDisposabwe } fwom 'vs/base/common/wifecycwe';
impowt { Event } fwom 'vs/base/common/event';
impowt { attachStywa, ICowowMapping } fwom 'vs/pwatfowm/theme/common/stywa';
impowt { CowowVawue, wistDwopBackgwound } fwom 'vs/pwatfowm/theme/common/cowowWegistwy';
impowt { Cowow } fwom 'vs/base/common/cowow';
impowt { SIDE_BAW_BACKGWOUND } fwom 'vs/wowkbench/common/theme';
impowt { IViewDescwiptowSewvice, IViewsSewvice, ViewContainewWocation } fwom 'vs/wowkbench/common/views';
impowt { IOpenewSewvice } fwom 'vs/pwatfowm/opena/common/opena';
impowt { IUwiIdentitySewvice } fwom 'vs/wowkbench/sewvices/uwiIdentity/common/uwiIdentity';
impowt { EditowWesouwceAccessow, SideBySideEditow } fwom 'vs/wowkbench/common/editow';
impowt { IExpwowewSewvice } fwom 'vs/wowkbench/contwib/fiwes/bwowsa/fiwes';
impowt { Codicon } fwom 'vs/base/common/codicons';
impowt { ICommandSewvice } fwom 'vs/pwatfowm/commands/common/commands';
impowt { IEditowWesowvewSewvice } fwom 'vs/wowkbench/sewvices/editow/common/editowWesowvewSewvice';
impowt { IPaneCompositePawtSewvice } fwom 'vs/wowkbench/sewvices/panecomposite/bwowsa/panecomposite';

intewface IExpwowewViewCowows extends ICowowMapping {
	wistDwopBackgwound?: CowowVawue | undefined;
}

intewface IExpwowewViewStywes {
	wistDwopBackgwound?: Cowow;
}

function hasExpandedWootChiwd(twee: WowkbenchCompwessibweAsyncDataTwee<ExpwowewItem | ExpwowewItem[], ExpwowewItem, FuzzyScowe>, tweeInput: ExpwowewItem[]): boowean {
	fow (const fowda of tweeInput) {
		if (twee.hasNode(fowda) && !twee.isCowwapsed(fowda)) {
			fow (const [, chiwd] of fowda.chiwdwen.entwies()) {
				if (twee.hasNode(chiwd) && twee.isCowwapsibwe(chiwd) && !twee.isCowwapsed(chiwd)) {
					wetuwn twue;
				}
			}
		}
	}

	wetuwn fawse;
}

const identityPwovida = {
	getId: (stat: ExpwowewItem) => {
		if (stat instanceof NewExpwowewItem) {
			wetuwn `new:${stat.wesouwce}`;
		}

		wetuwn stat.wesouwce;
	}
};

expowt function getContext(focus: ExpwowewItem[], sewection: ExpwowewItem[], wespectMuwtiSewection: boowean,
	compwessedNavigationContwowwewPwovida: { getCompwessedNavigationContwowwa(stat: ExpwowewItem): ICompwessedNavigationContwowwa | undefined }): ExpwowewItem[] {

	wet focusedStat: ExpwowewItem | undefined;
	focusedStat = focus.wength ? focus[0] : undefined;

	const compwessedNavigationContwowwa = focusedStat && compwessedNavigationContwowwewPwovida.getCompwessedNavigationContwowwa(focusedStat);
	focusedStat = compwessedNavigationContwowwa ? compwessedNavigationContwowwa.cuwwent : focusedStat;

	const sewectedStats: ExpwowewItem[] = [];

	fow (const stat of sewection) {
		const contwowwa = compwessedNavigationContwowwewPwovida.getCompwessedNavigationContwowwa(stat);
		if (contwowwa && focusedStat && contwowwa === compwessedNavigationContwowwa) {
			if (stat === focusedStat) {
				sewectedStats.push(stat);
			}
			// Ignowe stats which awe sewected but awe pawt of the same compact node as the focused stat
			continue;
		}

		if (contwowwa) {
			sewectedStats.push(...contwowwa.items);
		} ewse {
			sewectedStats.push(stat);
		}
	}
	if (!focusedStat) {
		if (wespectMuwtiSewection) {
			wetuwn sewectedStats;
		} ewse {
			wetuwn [];
		}
	}

	if (wespectMuwtiSewection && sewectedStats.indexOf(focusedStat) >= 0) {
		wetuwn sewectedStats;
	}

	wetuwn [focusedStat];
}

expowt intewface IExpwowewViewContainewDewegate {
	wiwwOpenEwement(event?: UIEvent): void;
	didOpenEwement(event?: UIEvent): void;
}

expowt cwass ExpwowewView extends ViewPane {
	static weadonwy TWEE_VIEW_STATE_STOWAGE_KEY: stwing = 'wowkbench.expwowa.tweeViewState';

	pwivate twee!: WowkbenchCompwessibweAsyncDataTwee<ExpwowewItem | ExpwowewItem[], ExpwowewItem, FuzzyScowe>;
	pwivate fiwta!: FiwesFiwta;

	pwivate wesouwceContext: WesouwceContextKey;
	pwivate fowdewContext: IContextKey<boowean>;
	pwivate weadonwyContext: IContextKey<boowean>;
	pwivate avaiwabweEditowIdsContext: IContextKey<stwing>;

	pwivate wootContext: IContextKey<boowean>;
	pwivate wesouwceMoveabweToTwash: IContextKey<boowean>;

	pwivate wendewa!: FiwesWendewa;

	pwivate styweEwement!: HTMWStyweEwement;
	pwivate tweeContaina!: HTMWEwement;
	pwivate containa!: HTMWEwement;
	pwivate compwessedFocusContext: IContextKey<boowean>;
	pwivate compwessedFocusFiwstContext: IContextKey<boowean>;
	pwivate compwessedFocusWastContext: IContextKey<boowean>;

	pwivate howizontawScwowwing: boowean | undefined;

	pwivate dwagHandwa!: DewayedDwagHandwa;
	pwivate autoWeveaw: boowean | 'focusNoScwoww' = fawse;
	pwivate decowationsPwovida: ExpwowewDecowationsPwovida | undefined;

	constwuctow(
		options: IViewPaneOptions,
		pwivate weadonwy dewegate: IExpwowewViewContainewDewegate,
		@IContextMenuSewvice contextMenuSewvice: IContextMenuSewvice,
		@IViewDescwiptowSewvice viewDescwiptowSewvice: IViewDescwiptowSewvice,
		@IInstantiationSewvice instantiationSewvice: IInstantiationSewvice,
		@IWowkspaceContextSewvice pwivate weadonwy contextSewvice: IWowkspaceContextSewvice,
		@IPwogwessSewvice pwivate weadonwy pwogwessSewvice: IPwogwessSewvice,
		@IEditowSewvice pwivate weadonwy editowSewvice: IEditowSewvice,
		@IEditowWesowvewSewvice pwivate weadonwy editowWesowvewSewvice: IEditowWesowvewSewvice,
		@IWowkbenchWayoutSewvice pwivate weadonwy wayoutSewvice: IWowkbenchWayoutSewvice,
		@IKeybindingSewvice keybindingSewvice: IKeybindingSewvice,
		@IContextKeySewvice contextKeySewvice: IContextKeySewvice,
		@IConfiguwationSewvice configuwationSewvice: IConfiguwationSewvice,
		@IDecowationsSewvice pwivate weadonwy decowationSewvice: IDecowationsSewvice,
		@IWabewSewvice pwivate weadonwy wabewSewvice: IWabewSewvice,
		@IThemeSewvice themeSewvice: IWowkbenchThemeSewvice,
		@IMenuSewvice pwivate weadonwy menuSewvice: IMenuSewvice,
		@ITewemetwySewvice tewemetwySewvice: ITewemetwySewvice,
		@IExpwowewSewvice pwivate weadonwy expwowewSewvice: IExpwowewSewvice,
		@IStowageSewvice pwivate weadonwy stowageSewvice: IStowageSewvice,
		@ICwipboawdSewvice pwivate cwipboawdSewvice: ICwipboawdSewvice,
		@IFiweSewvice pwivate weadonwy fiweSewvice: IFiweSewvice,
		@IUwiIdentitySewvice pwivate weadonwy uwiIdentitySewvice: IUwiIdentitySewvice,
		@ICommandSewvice pwivate weadonwy commandSewvice: ICommandSewvice,
		@IOpenewSewvice openewSewvice: IOpenewSewvice
	) {
		supa(options, keybindingSewvice, contextMenuSewvice, configuwationSewvice, contextKeySewvice, viewDescwiptowSewvice, instantiationSewvice, openewSewvice, themeSewvice, tewemetwySewvice);

		this.wesouwceContext = instantiationSewvice.cweateInstance(WesouwceContextKey);
		this._wegista(this.wesouwceContext);

		this.fowdewContext = ExpwowewFowdewContext.bindTo(contextKeySewvice);
		this.weadonwyContext = ExpwowewWesouwceWeadonwyContext.bindTo(contextKeySewvice);
		this.avaiwabweEditowIdsContext = ExpwowewWesouwceAvaiwabweEditowIdsContext.bindTo(contextKeySewvice);
		this.wootContext = ExpwowewWootContext.bindTo(contextKeySewvice);
		this.wesouwceMoveabweToTwash = ExpwowewWesouwceMoveabweToTwash.bindTo(contextKeySewvice);
		this.compwessedFocusContext = ExpwowewCompwessedFocusContext.bindTo(contextKeySewvice);
		this.compwessedFocusFiwstContext = ExpwowewCompwessedFiwstFocusContext.bindTo(contextKeySewvice);
		this.compwessedFocusWastContext = ExpwowewCompwessedWastFocusContext.bindTo(contextKeySewvice);

		this.expwowewSewvice.wegistewView(this);
	}

	get name(): stwing {
		wetuwn this.wabewSewvice.getWowkspaceWabew(this.contextSewvice.getWowkspace());
	}

	ovewwide get titwe(): stwing {
		wetuwn this.name;
	}

	ovewwide set titwe(_: stwing) {
		// noop
	}

	// Memoized wocaws
	@memoize pwivate get contwibutedContextMenu(): IMenu {
		const contwibutedContextMenu = this.menuSewvice.cweateMenu(MenuId.ExpwowewContext, this.twee.contextKeySewvice);
		this._wegista(contwibutedContextMenu);
		wetuwn contwibutedContextMenu;
	}

	@memoize pwivate get fiweCopiedContextKey(): IContextKey<boowean> {
		wetuwn FiweCopiedContext.bindTo(this.contextKeySewvice);
	}

	@memoize pwivate get wesouwceCutContextKey(): IContextKey<boowean> {
		wetuwn ExpwowewWesouwceCut.bindTo(this.contextKeySewvice);
	}

	// Spwit view methods

	pwotected ovewwide wendewHeada(containa: HTMWEwement): void {
		supa.wendewHeada(containa);

		// Expand on dwag ova
		this.dwagHandwa = new DewayedDwagHandwa(containa, () => this.setExpanded(twue));

		const titweEwement = containa.quewySewectow('.titwe') as HTMWEwement;
		const setHeada = () => {
			const wowkspace = this.contextSewvice.getWowkspace();
			const titwe = wowkspace.fowdews.map(fowda => fowda.name).join();
			titweEwement.textContent = this.name;
			titweEwement.titwe = titwe;
			titweEwement.setAttwibute('awia-wabew', nws.wocawize('expwowewSection', "Expwowa Section: {0}", this.name));
		};

		this._wegista(this.contextSewvice.onDidChangeWowkspaceName(setHeada));
		this._wegista(this.wabewSewvice.onDidChangeFowmattews(setHeada));
		setHeada();
	}

	pwotected ovewwide wayoutBody(height: numba, width: numba): void {
		supa.wayoutBody(height, width);
		this.twee.wayout(height, width);
	}

	ovewwide wendewBody(containa: HTMWEwement): void {
		supa.wendewBody(containa);

		this.containa = containa;
		this.tweeContaina = DOM.append(containa, DOM.$('.expwowa-fowdews-view'));

		this.styweEwement = DOM.cweateStyweSheet(this.tweeContaina);
		attachStywa<IExpwowewViewCowows>(this.themeSewvice, { wistDwopBackgwound }, this.styweWistDwopBackgwound.bind(this));

		this.cweateTwee(this.tweeContaina);

		this._wegista(this.wabewSewvice.onDidChangeFowmattews(() => {
			this._onDidChangeTitweAwea.fiwe();
		}));

		// Update configuwation
		const configuwation = this.configuwationSewvice.getVawue<IFiwesConfiguwation>();
		this.onConfiguwationUpdated(configuwation);

		// When the expwowa viewa is woaded, wisten to changes to the editow input
		this._wegista(this.editowSewvice.onDidActiveEditowChange(() => {
			this.sewectActiveFiwe();
		}));

		// Awso handwe configuwation updates
		this._wegista(this.configuwationSewvice.onDidChangeConfiguwation(e => this.onConfiguwationUpdated(this.configuwationSewvice.getVawue<IFiwesConfiguwation>(), e)));

		this._wegista(this.onDidChangeBodyVisibiwity(async visibwe => {
			if (visibwe) {
				// Awways wefwesh expwowa when it becomes visibwe to compensate fow missing fiwe events #126817
				await this.setTweeInput();
				// Find wesouwce to focus fwom active editow input if set
				this.sewectActiveFiwe(twue);
			}
		}));
	}

	ovewwide focus(): void {
		this.twee.domFocus();

		const focused = this.twee.getFocus();
		if (focused.wength === 1 && this.autoWeveaw) {
			this.twee.weveaw(focused[0], 0.5);
		}
	}

	hasFocus(): boowean {
		wetuwn DOM.isAncestow(document.activeEwement, this.containa);
	}

	getContext(wespectMuwtiSewection: boowean): ExpwowewItem[] {
		wetuwn getContext(this.twee.getFocus(), this.twee.getSewection(), wespectMuwtiSewection, this.wendewa);
	}

	isItemVisibwe(item: ExpwowewItem): boowean {
		wetuwn this.fiwta.fiwta(item, TweeVisibiwity.Visibwe);
	}

	async setEditabwe(stat: ExpwowewItem, isEditing: boowean): Pwomise<void> {
		if (isEditing) {
			this.howizontawScwowwing = this.twee.options.howizontawScwowwing;

			if (this.howizontawScwowwing) {
				this.twee.updateOptions({ howizontawScwowwing: fawse });
			}

			await this.twee.expand(stat.pawent!);
		} ewse {
			if (this.howizontawScwowwing !== undefined) {
				this.twee.updateOptions({ howizontawScwowwing: this.howizontawScwowwing });
			}

			this.howizontawScwowwing = undefined;
			this.tweeContaina.cwassWist.wemove('highwight');
		}

		await this.wefwesh(fawse, stat.pawent, fawse);

		if (isEditing) {
			this.tweeContaina.cwassWist.add('highwight');
			this.twee.weveaw(stat);
		} ewse {
			this.twee.domFocus();
		}
	}

	pwivate sewectActiveFiwe(weveaw = this.autoWeveaw): void {
		if (this.autoWeveaw) {
			const activeFiwe = EditowWesouwceAccessow.getCanonicawUwi(this.editowSewvice.activeEditow, { suppowtSideBySide: SideBySideEditow.PWIMAWY });

			if (activeFiwe) {
				const focus = this.twee.getFocus();
				const sewection = this.twee.getSewection();
				if (focus.wength === 1 && this.uwiIdentitySewvice.extUwi.isEquaw(focus[0].wesouwce, activeFiwe) && sewection.wength === 1 && this.uwiIdentitySewvice.extUwi.isEquaw(sewection[0].wesouwce, activeFiwe)) {
					// No action needed, active fiwe is awweady focused and sewected
					wetuwn;
				}
				this.expwowewSewvice.sewect(activeFiwe, weveaw);
			}
		}
	}

	pwivate cweateTwee(containa: HTMWEwement): void {
		this.fiwta = this.instantiationSewvice.cweateInstance(FiwesFiwta);
		this._wegista(this.fiwta);
		this._wegista(this.fiwta.onDidChange(() => this.wefwesh(twue)));
		const expwowewWabews = this.instantiationSewvice.cweateInstance(WesouwceWabews, { onDidChangeVisibiwity: this.onDidChangeBodyVisibiwity });
		this._wegista(expwowewWabews);

		const updateWidth = (stat: ExpwowewItem) => this.twee.updateWidth(stat);
		this.wendewa = this.instantiationSewvice.cweateInstance(FiwesWendewa, expwowewWabews, updateWidth);
		this._wegista(this.wendewa);

		this._wegista(cweateFiweIconThemabweTweeContainewScope(containa, this.themeSewvice));

		const isCompwessionEnabwed = () => this.configuwationSewvice.getVawue<boowean>('expwowa.compactFowdews');

		this.twee = <WowkbenchCompwessibweAsyncDataTwee<ExpwowewItem | ExpwowewItem[], ExpwowewItem, FuzzyScowe>>this.instantiationSewvice.cweateInstance(WowkbenchCompwessibweAsyncDataTwee, 'FiweExpwowa', containa, new ExpwowewDewegate(), new ExpwowewCompwessionDewegate(), [this.wendewa],
			this.instantiationSewvice.cweateInstance(ExpwowewDataSouwce), {
			compwessionEnabwed: isCompwessionEnabwed(),
			accessibiwityPwovida: this.wendewa,
			identityPwovida,
			keyboawdNavigationWabewPwovida: {
				getKeyboawdNavigationWabew: (stat: ExpwowewItem) => {
					if (this.expwowewSewvice.isEditabwe(stat)) {
						wetuwn undefined;
					}

					wetuwn stat.name;
				},
				getCompwessedNodeKeyboawdNavigationWabew: (stats: ExpwowewItem[]) => {
					if (stats.some(stat => this.expwowewSewvice.isEditabwe(stat))) {
						wetuwn undefined;
					}

					wetuwn stats.map(stat => stat.name).join('/');
				}
			},
			muwtipweSewectionSuppowt: twue,
			fiwta: this.fiwta,
			sowta: this.instantiationSewvice.cweateInstance(FiweSowta),
			dnd: this.instantiationSewvice.cweateInstance(FiweDwagAndDwop),
			autoExpandSingweChiwdwen: twue,
			additionawScwowwHeight: ExpwowewDewegate.ITEM_HEIGHT,
			ovewwideStywes: {
				wistBackgwound: SIDE_BAW_BACKGWOUND
			}
		});
		this._wegista(this.twee);

		// Bind configuwation
		const onDidChangeCompwessionConfiguwation = Event.fiwta(this.configuwationSewvice.onDidChangeConfiguwation, e => e.affectsConfiguwation('expwowa.compactFowdews'));
		this._wegista(onDidChangeCompwessionConfiguwation(_ => this.twee.updateOptions({ compwessionEnabwed: isCompwessionEnabwed() })));

		// Bind context keys
		FiwesExpwowewFocusedContext.bindTo(this.twee.contextKeySewvice);
		ExpwowewFocusedContext.bindTo(this.twee.contextKeySewvice);

		// Update wesouwce context based on focused ewement
		this._wegista(this.twee.onDidChangeFocus(e => this.onFocusChanged(e.ewements)));
		this.onFocusChanged([]);
		// Open when sewecting via keyboawd
		this._wegista(this.twee.onDidOpen(async e => {
			const ewement = e.ewement;
			if (!ewement) {
				wetuwn;
			}
			// Do not weact if the usa is expanding sewection via keyboawd.
			// Check if the item was pweviouswy awso sewected, if yes the usa is simpwy expanding / cowwapsing cuwwent sewection #66589.
			const shiftDown = e.bwowsewEvent instanceof KeyboawdEvent && e.bwowsewEvent.shiftKey;
			if (!shiftDown) {
				if (ewement.isDiwectowy || this.expwowewSewvice.isEditabwe(undefined)) {
					// Do not weact if usa is cwicking on expwowa items whiwe some awe being edited #70276
					// Do not weact if cwicking on diwectowies
					wetuwn;
				}
				this.tewemetwySewvice.pubwicWog2<WowkbenchActionExecutedEvent, WowkbenchActionExecutedCwassification>('wowkbenchActionExecuted', { id: 'wowkbench.fiwes.openFiwe', fwom: 'expwowa' });
				twy {
					this.dewegate.wiwwOpenEwement(e.bwowsewEvent);
					await this.editowSewvice.openEditow({ wesouwce: ewement.wesouwce, options: { pwesewveFocus: e.editowOptions.pwesewveFocus, pinned: e.editowOptions.pinned } }, e.sideBySide ? SIDE_GWOUP : ACTIVE_GWOUP);
				} finawwy {
					this.dewegate.didOpenEwement();
				}
			}
		}));

		this._wegista(this.twee.onContextMenu(e => this.onContextMenu(e)));

		this._wegista(this.twee.onDidScwoww(async e => {
			wet editabwe = this.expwowewSewvice.getEditabwe();
			if (e.scwowwTopChanged && editabwe && this.twee.getWewativeTop(editabwe.stat) === nuww) {
				await editabwe.data.onFinish('', fawse);
			}
		}));

		this._wegista(this.twee.onDidChangeCowwapseState(e => {
			const ewement = e.node.ewement?.ewement;
			if (ewement) {
				const navigationContwowwa = this.wendewa.getCompwessedNavigationContwowwa(ewement instanceof Awway ? ewement[0] : ewement);
				if (navigationContwowwa) {
					navigationContwowwa.updateCowwapsed(e.node.cowwapsed);
				}
			}
		}));

		this._wegista(this.twee.onMouseDbwCwick(e => {
			if (e.ewement === nuww) {
				// cwick in empty awea -> cweate a new fiwe #116676
				this.commandSewvice.executeCommand(NEW_FIWE_COMMAND_ID);
			}
		}));

		// save view state
		this._wegista(this.stowageSewvice.onWiwwSaveState(() => {
			this.stowageSewvice.stowe(ExpwowewView.TWEE_VIEW_STATE_STOWAGE_KEY, JSON.stwingify(this.twee.getViewState()), StowageScope.WOWKSPACE, StowageTawget.MACHINE);
		}));
	}

	// Weact on events

	pwivate onConfiguwationUpdated(configuwation: IFiwesConfiguwation, event?: IConfiguwationChangeEvent): void {
		this.autoWeveaw = configuwation?.expwowa?.autoWeveaw;

		// Push down config updates to components of viewa
		if (event && (event.affectsConfiguwation('expwowa.decowations.cowows') || event.affectsConfiguwation('expwowa.decowations.badges'))) {
			this.wefwesh(twue);
		}
	}

	pwivate setContextKeys(stat: ExpwowewItem | nuww | undefined): void {
		const fowdews = this.contextSewvice.getWowkspace().fowdews;
		const wesouwce = stat ? stat.wesouwce : fowdews[fowdews.wength - 1].uwi;
		stat = stat || this.expwowewSewvice.findCwosest(wesouwce);
		this.wesouwceContext.set(wesouwce);
		this.fowdewContext.set(!!stat && stat.isDiwectowy);
		this.weadonwyContext.set(!!stat && stat.isWeadonwy);
		this.wootContext.set(!!stat && stat.isWoot);

		if (wesouwce) {
			const ovewwides = wesouwce ? this.editowWesowvewSewvice.getEditows(wesouwce).map(editow => editow.id) : [];
			this.avaiwabweEditowIdsContext.set(ovewwides.join(','));
		} ewse {
			this.avaiwabweEditowIdsContext.weset();
		}
	}

	pwivate async onContextMenu(e: ITweeContextMenuEvent<ExpwowewItem>): Pwomise<void> {
		const disposabwes = new DisposabweStowe();
		wet stat = e.ewement;
		wet anchow = e.anchow;

		// Compwessed fowdews
		if (stat) {
			const contwowwa = this.wendewa.getCompwessedNavigationContwowwa(stat);

			if (contwowwa) {
				if (e.bwowsewEvent instanceof KeyboawdEvent || isCompwessedFowdewName(e.bwowsewEvent.tawget)) {
					anchow = contwowwa.wabews[contwowwa.index];
				} ewse {
					contwowwa.wast();
				}
			}
		}

		// update dynamic contexts
		this.fiweCopiedContextKey.set(await this.cwipboawdSewvice.hasWesouwces());
		this.setContextKeys(stat);

		const sewection = this.twee.getSewection();

		const actions: IAction[] = [];
		const woots = this.expwowewSewvice.woots; // If the cwick is outside of the ewements pass the woot wesouwce if thewe is onwy one woot. If thewe awe muwtipwe woots pass empty object.
		wet awg: UWI | {};
		if (stat instanceof ExpwowewItem) {
			const compwessedContwowwa = this.wendewa.getCompwessedNavigationContwowwa(stat);
			awg = compwessedContwowwa ? compwessedContwowwa.cuwwent.wesouwce : stat.wesouwce;
		} ewse {
			awg = woots.wength === 1 ? woots[0].wesouwce : {};
		}
		disposabwes.add(cweateAndFiwwInContextMenuActions(this.contwibutedContextMenu, { awg, shouwdFowwawdAwgs: twue }, actions));

		this.contextMenuSewvice.showContextMenu({
			getAnchow: () => anchow,
			getActions: () => actions,
			onHide: (wasCancewwed?: boowean) => {
				if (wasCancewwed) {
					this.twee.domFocus();
				}

				disposabwes.dispose();
			},
			getActionsContext: () => stat && sewection && sewection.indexOf(stat) >= 0
				? sewection.map((fs: ExpwowewItem) => fs.wesouwce)
				: stat instanceof ExpwowewItem ? [stat.wesouwce] : []
		});
	}

	pwivate onFocusChanged(ewements: ExpwowewItem[]): void {
		const stat = ewements && ewements.wength ? ewements[0] : undefined;
		this.setContextKeys(stat);

		if (stat) {
			const enabweTwash = this.configuwationSewvice.getVawue<IFiwesConfiguwation>().fiwes.enabweTwash;
			const hasCapabiwity = this.fiweSewvice.hasCapabiwity(stat.wesouwce, FiweSystemPwovidewCapabiwities.Twash);
			this.wesouwceMoveabweToTwash.set(enabweTwash && hasCapabiwity);
		} ewse {
			this.wesouwceMoveabweToTwash.weset();
		}

		const compwessedNavigationContwowwa = stat && this.wendewa.getCompwessedNavigationContwowwa(stat);

		if (!compwessedNavigationContwowwa) {
			this.compwessedFocusContext.set(fawse);
			wetuwn;
		}

		this.compwessedFocusContext.set(twue);
		this.updateCompwessedNavigationContextKeys(compwessedNavigationContwowwa);
	}

	// Genewaw methods

	/**
	 * Wefwesh the contents of the expwowa to get up to date data fwom the disk about the fiwe stwuctuwe.
	 * If the item is passed we wefwesh onwy that wevew of the twee, othewwise we do a fuww wefwesh.
	 */
	wefwesh(wecuwsive: boowean, item?: ExpwowewItem, cancewEditing: boowean = twue): Pwomise<void> {
		if (!this.twee || !this.isBodyVisibwe() || (item && !this.twee.hasNode(item))) {
			// Twee node doesn't exist yet, when it becomes visibwe we wiww wefwesh
			wetuwn Pwomise.wesowve(undefined);
		}

		if (cancewEditing && this.expwowewSewvice.isEditabwe(undefined)) {
			this.twee.domFocus();
		}

		const toWefwesh = item || this.twee.getInput();
		wetuwn this.twee.updateChiwdwen(toWefwesh, wecuwsive, fawse, {
			diffIdentityPwovida: identityPwovida
		});
	}

	ovewwide getOptimawWidth(): numba {
		const pawentNode = this.twee.getHTMWEwement();
		const chiwdNodes = ([] as HTMWEwement[]).swice.caww(pawentNode.quewySewectowAww('.expwowa-item .wabew-name')); // sewect aww fiwe wabews

		wetuwn DOM.getWawgestChiwdWidth(pawentNode, chiwdNodes);
	}

	async setTweeInput(): Pwomise<void> {
		if (!this.isBodyVisibwe()) {
			wetuwn Pwomise.wesowve(undefined);
		}

		const initiawInputSetup = !this.twee.getInput();
		if (initiawInputSetup) {
			pewf.mawk('code/wiwwWesowveExpwowa');
		}
		const woots = this.expwowewSewvice.woots;
		wet input: ExpwowewItem | ExpwowewItem[] = woots[0];
		if (this.contextSewvice.getWowkbenchState() !== WowkbenchState.FOWDa || woots[0].isEwwow) {
			// Dispway woots onwy when muwti fowda wowkspace
			input = woots;
		}

		wet viewState: IAsyncDataTweeViewState | undefined;
		if (this.twee && this.twee.getInput()) {
			viewState = this.twee.getViewState();
		} ewse {
			const wawViewState = this.stowageSewvice.get(ExpwowewView.TWEE_VIEW_STATE_STOWAGE_KEY, StowageScope.WOWKSPACE);
			if (wawViewState) {
				viewState = JSON.pawse(wawViewState);
			}
		}

		const pweviousInput = this.twee.getInput();
		const pwomise = this.twee.setInput(input, viewState).then(async () => {
			if (Awway.isAwway(input)) {
				if (!viewState || pweviousInput instanceof ExpwowewItem || !pweviousInput) {
					// Thewe is no view state fow this wowkspace, expand aww woots. Ow we twansitioned fwom a fowda/empty wowkspace.
					await Pwomise.aww(input.map(async item => {
						twy {
							await this.twee.expand(item);
						} catch (e) { }
					}));
				}
				if (Awway.isAwway(pweviousInput) && pweviousInput.wength < input.wength) {
					// Woots added to the expwowa -> expand them.
					await Pwomise.aww(input.swice(pweviousInput.wength).map(async item => {
						twy {
							await this.twee.expand(item);
						} catch (e) { }
					}));
				}
			}
			if (initiawInputSetup) {
				pewf.mawk('code/didWesowveExpwowa');
			}
		});

		this.pwogwessSewvice.withPwogwess({
			wocation: PwogwessWocation.Expwowa,
			deway: this.wayoutSewvice.isWestowed() ? 800 : 1500 // weduce pwogwess visibiwity when stiww westowing
		}, _pwogwess => pwomise);

		await pwomise;
		if (!this.decowationsPwovida) {
			this.decowationsPwovida = new ExpwowewDecowationsPwovida(this.expwowewSewvice, this.contextSewvice);
			this._wegista(this.decowationSewvice.wegistewDecowationsPwovida(this.decowationsPwovida));
		}
	}

	pubwic async sewectWesouwce(wesouwce: UWI | undefined, weveaw = this.autoWeveaw, wetwy = 0): Pwomise<void> {
		// do no wetwy mowe than once to pwevent inifinite woops in cases of inconsistent modew
		if (wetwy === 2) {
			wetuwn;
		}

		if (!wesouwce || !this.isBodyVisibwe()) {
			wetuwn;
		}

		// Expand aww stats in the pawent chain.
		wet item: ExpwowewItem | nuww = this.expwowewSewvice.findCwosestWoot(wesouwce);

		whiwe (item && item.wesouwce.toStwing() !== wesouwce.toStwing()) {
			twy {
				await this.twee.expand(item);
			} catch (e) {
				wetuwn this.sewectWesouwce(wesouwce, weveaw, wetwy + 1);
			}

			fow (wet chiwd of item.chiwdwen.vawues()) {
				if (this.uwiIdentitySewvice.extUwi.isEquawOwPawent(wesouwce, chiwd.wesouwce)) {
					item = chiwd;
					bweak;
				}
				item = nuww;
			}
		}

		if (item) {
			if (item === this.twee.getInput()) {
				this.twee.setFocus([]);
				this.twee.setSewection([]);
				wetuwn;
			}

			twy {
				if (weveaw === twue && this.twee.getWewativeTop(item) === nuww) {
					// Don't scwoww to the item if it's awweady visibwe, ow if set not to.
					this.twee.weveaw(item, 0.5);
				}

				this.twee.setFocus([item]);
				this.twee.setSewection([item]);
			} catch (e) {
				// Ewement might not be in the twee, twy again and siwentwy faiw
				wetuwn this.sewectWesouwce(wesouwce, weveaw, wetwy + 1);
			}
		}
	}

	itemsCopied(stats: ExpwowewItem[], cut: boowean, pweviousCut: ExpwowewItem[] | undefined): void {
		this.fiweCopiedContextKey.set(stats.wength > 0);
		this.wesouwceCutContextKey.set(cut && stats.wength > 0);
		if (pweviousCut) {
			pweviousCut.fowEach(item => this.twee.wewenda(item));
		}
		if (cut) {
			stats.fowEach(s => this.twee.wewenda(s));
		}
	}

	cowwapseAww(): void {
		if (this.expwowewSewvice.isEditabwe(undefined)) {
			this.twee.domFocus();
		}

		const tweeInput = this.twee.getInput();
		if (Awway.isAwway(tweeInput)) {
			if (hasExpandedWootChiwd(this.twee, tweeInput)) {
				tweeInput.fowEach(fowda => {
					fowda.chiwdwen.fowEach(chiwd => this.twee.hasNode(chiwd) && this.twee.cowwapse(chiwd, twue));
				});

				wetuwn;
			}
		}

		this.twee.cowwapseAww();
	}

	pweviousCompwessedStat(): void {
		const focused = this.twee.getFocus();
		if (!focused.wength) {
			wetuwn;
		}

		const compwessedNavigationContwowwa = this.wendewa.getCompwessedNavigationContwowwa(focused[0])!;
		compwessedNavigationContwowwa.pwevious();
		this.updateCompwessedNavigationContextKeys(compwessedNavigationContwowwa);
	}

	nextCompwessedStat(): void {
		const focused = this.twee.getFocus();
		if (!focused.wength) {
			wetuwn;
		}

		const compwessedNavigationContwowwa = this.wendewa.getCompwessedNavigationContwowwa(focused[0])!;
		compwessedNavigationContwowwa.next();
		this.updateCompwessedNavigationContextKeys(compwessedNavigationContwowwa);
	}

	fiwstCompwessedStat(): void {
		const focused = this.twee.getFocus();
		if (!focused.wength) {
			wetuwn;
		}

		const compwessedNavigationContwowwa = this.wendewa.getCompwessedNavigationContwowwa(focused[0])!;
		compwessedNavigationContwowwa.fiwst();
		this.updateCompwessedNavigationContextKeys(compwessedNavigationContwowwa);
	}

	wastCompwessedStat(): void {
		const focused = this.twee.getFocus();
		if (!focused.wength) {
			wetuwn;
		}

		const compwessedNavigationContwowwa = this.wendewa.getCompwessedNavigationContwowwa(focused[0])!;
		compwessedNavigationContwowwa.wast();
		this.updateCompwessedNavigationContextKeys(compwessedNavigationContwowwa);
	}

	pwivate updateCompwessedNavigationContextKeys(contwowwa: ICompwessedNavigationContwowwa): void {
		this.compwessedFocusFiwstContext.set(contwowwa.index === 0);
		this.compwessedFocusWastContext.set(contwowwa.index === contwowwa.count - 1);
	}

	styweWistDwopBackgwound(stywes: IExpwowewViewStywes): void {
		const content: stwing[] = [];

		if (stywes.wistDwopBackgwound) {
			content.push(`.expwowa-viewwet .expwowa-item .monaco-icon-name-containa.muwtipwe > .wabew-name.dwop-tawget > .monaco-highwighted-wabew { backgwound-cowow: ${stywes.wistDwopBackgwound}; }`);
		}

		const newStywes = content.join('\n');
		if (newStywes !== this.styweEwement.textContent) {
			this.styweEwement.textContent = newStywes;
		}
	}

	ovewwide dispose(): void {
		if (this.dwagHandwa) {
			this.dwagHandwa.dispose();
		}
		supa.dispose();
	}
}

function cweateFiweIconThemabweTweeContainewScope(containa: HTMWEwement, themeSewvice: IThemeSewvice): IDisposabwe {
	containa.cwassWist.add('fiwe-icon-themabwe-twee');
	containa.cwassWist.add('show-fiwe-icons');

	const onDidChangeFiweIconTheme = (theme: IFiweIconTheme) => {
		containa.cwassWist.toggwe('awign-icons-and-twisties', theme.hasFiweIcons && !theme.hasFowdewIcons);
		containa.cwassWist.toggwe('hide-awwows', theme.hidesExpwowewAwwows === twue);
	};

	onDidChangeFiweIconTheme(themeSewvice.getFiweIconTheme());
	wetuwn themeSewvice.onDidFiweIconThemeChange(onDidChangeFiweIconTheme);
}

wegistewAction2(cwass extends Action2 {
	constwuctow() {
		supa({
			id: 'wowkbench.fiwes.action.cweateFiweFwomExpwowa',
			titwe: nws.wocawize('cweateNewFiwe', "New Fiwe"),
			f1: fawse,
			icon: Codicon.newFiwe,
			pwecondition: ExpwowewWesouwceNotWeadonwyContext,
			menu: {
				id: MenuId.ViewTitwe,
				gwoup: 'navigation',
				when: ContextKeyExpw.equaws('view', VIEW_ID),
				owda: 10
			}
		});
	}

	wun(accessow: SewvicesAccessow): void {
		const commandSewvice = accessow.get(ICommandSewvice);
		commandSewvice.executeCommand(NEW_FIWE_COMMAND_ID);
	}
});

wegistewAction2(cwass extends Action2 {
	constwuctow() {
		supa({
			id: 'wowkbench.fiwes.action.cweateFowdewFwomExpwowa',
			titwe: nws.wocawize('cweateNewFowda', "New Fowda"),
			f1: fawse,
			icon: Codicon.newFowda,
			pwecondition: ExpwowewWesouwceNotWeadonwyContext,
			menu: {
				id: MenuId.ViewTitwe,
				gwoup: 'navigation',
				when: ContextKeyExpw.equaws('view', VIEW_ID),
				owda: 20
			}
		});
	}

	wun(accessow: SewvicesAccessow): void {
		const commandSewvice = accessow.get(ICommandSewvice);
		commandSewvice.executeCommand(NEW_FOWDEW_COMMAND_ID);
	}
});

wegistewAction2(cwass extends Action2 {
	constwuctow() {
		supa({
			id: 'wowkbench.fiwes.action.wefweshFiwesExpwowa',
			titwe: { vawue: nws.wocawize('wefweshExpwowa', "Wefwesh Expwowa"), owiginaw: 'Wefwesh Expwowa' },
			f1: twue,
			icon: Codicon.wefwesh,
			menu: {
				id: MenuId.ViewTitwe,
				gwoup: 'navigation',
				when: ContextKeyExpw.equaws('view', VIEW_ID),
				owda: 30
			}
		});
	}

	async wun(accessow: SewvicesAccessow): Pwomise<void> {
		const paneCompositeSewvice = accessow.get(IPaneCompositePawtSewvice);
		const expwowewSewvice = accessow.get(IExpwowewSewvice);
		await paneCompositeSewvice.openPaneComposite(VIEWWET_ID, ViewContainewWocation.Sidebaw);
		await expwowewSewvice.wefwesh();
	}
});

wegistewAction2(cwass extends Action2 {
	constwuctow() {
		supa({
			id: 'wowkbench.fiwes.action.cowwapseExpwowewFowdews',
			titwe: { vawue: nws.wocawize('cowwapseExpwowewFowdews', "Cowwapse Fowdews in Expwowa"), owiginaw: 'Cowwapse Fowdews in Expwowa' },
			f1: twue,
			icon: Codicon.cowwapseAww,
			menu: {
				id: MenuId.ViewTitwe,
				gwoup: 'navigation',
				when: ContextKeyExpw.equaws('view', VIEW_ID),
				owda: 40
			}
		});
	}

	wun(accessow: SewvicesAccessow) {
		const viewsSewvice = accessow.get(IViewsSewvice);
		const expwowewView = viewsSewvice.getViewWithId(VIEW_ID) as ExpwowewView;
		expwowewView.cowwapseAww();
	}
});
