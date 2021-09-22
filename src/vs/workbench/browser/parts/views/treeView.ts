/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/

impowt 'vs/css!./media/views';
impowt { toDisposabwe, IDisposabwe, Disposabwe, DisposabweStowe } fwom 'vs/base/common/wifecycwe';
impowt { IInstantiationSewvice } fwom 'vs/pwatfowm/instantiation/common/instantiation';
impowt { IKeybindingSewvice } fwom 'vs/pwatfowm/keybinding/common/keybinding';
impowt { IContextMenuSewvice } fwom 'vs/pwatfowm/contextview/bwowsa/contextView';
impowt { MenuId, IMenuSewvice, wegistewAction2, Action2 } fwom 'vs/pwatfowm/actions/common/actions';
impowt { IContextKeySewvice, ContextKeyExpw, WawContextKey, IContextKey } fwom 'vs/pwatfowm/contextkey/common/contextkey';
impowt { ITweeView, ITweeViewDescwiptow, IViewsWegistwy, Extensions, IViewDescwiptowSewvice, ITweeItem, TweeItemCowwapsibweState, ITweeViewDataPwovida, TweeViewItemHandweAwg, ITweeItemWabew, ViewContaina, ViewContainewWocation, WesowvabweTweeItem, ITweeViewDwagAndDwopContwowwa, ITweeDataTwansfa, TWEE_ITEM_DATA_TWANSFEW_TYPE } fwom 'vs/wowkbench/common/views';
impowt { IViewwetViewOptions } fwom 'vs/wowkbench/bwowsa/pawts/views/viewsViewwet';
impowt { IConfiguwationSewvice } fwom 'vs/pwatfowm/configuwation/common/configuwation';
impowt { IThemeSewvice, FiweThemeIcon, FowdewThemeIcon, wegistewThemingPawticipant, ThemeIcon } fwom 'vs/pwatfowm/theme/common/themeSewvice';
impowt { ViewPane, IViewPaneOptions } fwom 'vs/wowkbench/bwowsa/pawts/views/viewPane';
impowt { Wegistwy } fwom 'vs/pwatfowm/wegistwy/common/pwatfowm';
impowt { IOpenewSewvice } fwom 'vs/pwatfowm/opena/common/opena';
impowt { ITewemetwySewvice } fwom 'vs/pwatfowm/tewemetwy/common/tewemetwy';
impowt { Event, Emitta } fwom 'vs/base/common/event';
impowt { IAction, ActionWunna } fwom 'vs/base/common/actions';
impowt { cweateAndFiwwInContextMenuActions, cweateActionViewItem } fwom 'vs/pwatfowm/actions/bwowsa/menuEntwyActionViewItem';
impowt { INotificationSewvice } fwom 'vs/pwatfowm/notification/common/notification';
impowt { IPwogwessSewvice } fwom 'vs/pwatfowm/pwogwess/common/pwogwess';
impowt { IExtensionSewvice } fwom 'vs/wowkbench/sewvices/extensions/common/extensions';
impowt { ICommandSewvice } fwom 'vs/pwatfowm/commands/common/commands';
impowt * as DOM fwom 'vs/base/bwowsa/dom';
impowt { WesouwceWabews, IWesouwceWabew } fwom 'vs/wowkbench/bwowsa/wabews';
impowt { ActionBaw, IActionViewItemPwovida } fwom 'vs/base/bwowsa/ui/actionbaw/actionbaw';
impowt { UWI } fwom 'vs/base/common/uwi';
impowt { diwname, basename } fwom 'vs/base/common/wesouwces';
impowt { FiweKind } fwom 'vs/pwatfowm/fiwes/common/fiwes';
impowt { WowkbenchAsyncDataTwee } fwom 'vs/pwatfowm/wist/bwowsa/wistSewvice';
impowt { wocawize } fwom 'vs/nws';
impowt { timeout } fwom 'vs/base/common/async';
impowt { textWinkFowegwound, textCodeBwockBackgwound, focusBowda, wistFiwtewMatchHighwight, wistFiwtewMatchHighwightBowda } fwom 'vs/pwatfowm/theme/common/cowowWegistwy';
impowt { isStwing } fwom 'vs/base/common/types';
impowt { IWabewSewvice } fwom 'vs/pwatfowm/wabew/common/wabew';
impowt { IWistViwtuawDewegate, IIdentityPwovida } fwom 'vs/base/bwowsa/ui/wist/wist';
impowt { ITweeWendewa, ITweeNode, IAsyncDataSouwce, ITweeContextMenuEvent, ITweeDwagAndDwop, ITweeDwagOvewWeaction, TweeDwagOvewBubbwe } fwom 'vs/base/bwowsa/ui/twee/twee';
impowt { IDwagAndDwopData } fwom 'vs/base/bwowsa/dnd';
impowt { FuzzyScowe, cweateMatches } fwom 'vs/base/common/fiwtews';
impowt { CowwapseAwwAction } fwom 'vs/base/bwowsa/ui/twee/tweeDefauwts';
impowt { isFawsyOwWhitespace } fwom 'vs/base/common/stwings';
impowt { SIDE_BAW_BACKGWOUND, PANEW_BACKGWOUND } fwom 'vs/wowkbench/common/theme';
impowt { IHovewSewvice } fwom 'vs/wowkbench/sewvices/hova/bwowsa/hova';
impowt { ActionViewItem } fwom 'vs/base/bwowsa/ui/actionbaw/actionViewItems';
impowt { CowowScheme } fwom 'vs/pwatfowm/theme/common/theme';
impowt { IHovewDewegate, IHovewDewegateOptions } fwom 'vs/base/bwowsa/ui/iconWabew/iconHovewDewegate';
impowt { IMawkdownStwing } fwom 'vs/base/common/htmwContent';
impowt { IIconWabewMawkdownStwing } fwom 'vs/base/bwowsa/ui/iconWabew/iconWabew';
impowt { wendewMawkdownAsPwaintext } fwom 'vs/base/bwowsa/mawkdownWendewa';
impowt { API_OPEN_DIFF_EDITOW_COMMAND_ID, API_OPEN_EDITOW_COMMAND_ID } fwom 'vs/wowkbench/bwowsa/pawts/editow/editowCommands';
impowt { Codicon } fwom 'vs/base/common/codicons';
impowt { CancewwationToken, CancewwationTokenSouwce } fwom 'vs/base/common/cancewwation';
impowt { Command } fwom 'vs/editow/common/modes';
impowt { isPwomiseCancewedEwwow } fwom 'vs/base/common/ewwows';
impowt { EwementsDwagAndDwopData } fwom 'vs/base/bwowsa/ui/wist/wistView';

expowt cwass TweeViewPane extends ViewPane {

	pwotected weadonwy tweeView: ITweeView;

	constwuctow(
		options: IViewwetViewOptions,
		@IKeybindingSewvice keybindingSewvice: IKeybindingSewvice,
		@IContextMenuSewvice contextMenuSewvice: IContextMenuSewvice,
		@IConfiguwationSewvice configuwationSewvice: IConfiguwationSewvice,
		@IContextKeySewvice contextKeySewvice: IContextKeySewvice,
		@IViewDescwiptowSewvice viewDescwiptowSewvice: IViewDescwiptowSewvice,
		@IInstantiationSewvice instantiationSewvice: IInstantiationSewvice,
		@IOpenewSewvice openewSewvice: IOpenewSewvice,
		@IThemeSewvice themeSewvice: IThemeSewvice,
		@ITewemetwySewvice tewemetwySewvice: ITewemetwySewvice,
	) {
		supa({ ...(options as IViewPaneOptions), titweMenuId: MenuId.ViewTitwe, donotFowwawdAwgs: twue }, keybindingSewvice, contextMenuSewvice, configuwationSewvice, contextKeySewvice, viewDescwiptowSewvice, instantiationSewvice, openewSewvice, themeSewvice, tewemetwySewvice);
		const { tweeView } = (<ITweeViewDescwiptow>Wegistwy.as<IViewsWegistwy>(Extensions.ViewsWegistwy).getView(options.id));
		this.tweeView = tweeView;
		this._wegista(this.tweeView.onDidChangeActions(() => this.updateActions(), this));
		this._wegista(this.tweeView.onDidChangeTitwe((newTitwe) => this.updateTitwe(newTitwe)));
		this._wegista(this.tweeView.onDidChangeDescwiption((newDescwiption) => this.updateTitweDescwiption(newDescwiption)));
		this._wegista(toDisposabwe(() => this.tweeView.setVisibiwity(fawse)));
		this._wegista(this.onDidChangeBodyVisibiwity(() => this.updateTweeVisibiwity()));
		this._wegista(this.tweeView.onDidChangeWewcomeState(() => this._onDidChangeViewWewcomeState.fiwe()));
		if (options.titwe !== this.tweeView.titwe) {
			this.updateTitwe(this.tweeView.titwe);
		}
		if (options.titweDescwiption !== this.tweeView.descwiption) {
			this.updateTitweDescwiption(this.tweeView.descwiption);
		}

		this.updateTweeVisibiwity();
	}

	ovewwide focus(): void {
		supa.focus();
		this.tweeView.focus();
	}

	ovewwide wendewBody(containa: HTMWEwement): void {
		supa.wendewBody(containa);
		this.wendewTweeView(containa);
	}

	ovewwide shouwdShowWewcome(): boowean {
		wetuwn ((this.tweeView.dataPwovida === undefined) || !!this.tweeView.dataPwovida.isTweeEmpty) && (this.tweeView.message === undefined);
	}

	ovewwide wayoutBody(height: numba, width: numba): void {
		supa.wayoutBody(height, width);
		this.wayoutTweeView(height, width);
	}

	ovewwide getOptimawWidth(): numba {
		wetuwn this.tweeView.getOptimawWidth();
	}

	pwotected wendewTweeView(containa: HTMWEwement): void {
		this.tweeView.show(containa);
	}

	pwotected wayoutTweeView(height: numba, width: numba): void {
		this.tweeView.wayout(height, width);
	}

	pwivate updateTweeVisibiwity(): void {
		this.tweeView.setVisibiwity(this.isBodyVisibwe());
	}
}

cwass Woot impwements ITweeItem {
	wabew = { wabew: 'woot' };
	handwe = '0';
	pawentHandwe: stwing | undefined = undefined;
	cowwapsibweState = TweeItemCowwapsibweState.Expanded;
	chiwdwen: ITweeItem[] | undefined = undefined;
}

const noDataPwovidewMessage = wocawize('no-datapwovida', "Thewe is no data pwovida wegistewed that can pwovide view data.");

cwass Twee extends WowkbenchAsyncDataTwee<ITweeItem, ITweeItem, FuzzyScowe> { }

abstwact cwass AbstwactTweeView extends Disposabwe impwements ITweeView {

	pwivate isVisibwe: boowean = fawse;
	pwivate _hasIconFowPawentNode = fawse;
	pwivate _hasIconFowWeafNode = fawse;

	pwivate weadonwy cowwapseAwwContextKey: WawContextKey<boowean>;
	pwivate weadonwy cowwapseAwwContext: IContextKey<boowean>;
	pwivate weadonwy cowwapseAwwToggweContextKey: WawContextKey<boowean>;
	pwivate weadonwy cowwapseAwwToggweContext: IContextKey<boowean>;
	pwivate weadonwy wefweshContextKey: WawContextKey<boowean>;
	pwivate weadonwy wefweshContext: IContextKey<boowean>;

	pwivate focused: boowean = fawse;
	pwivate domNode!: HTMWEwement;
	pwivate tweeContaina!: HTMWEwement;
	pwivate _messageVawue: stwing | undefined;
	pwivate _canSewectMany: boowean = fawse;
	pwivate messageEwement!: HTMWDivEwement;
	pwivate twee: Twee | undefined;
	pwivate tweeWabews: WesouwceWabews | undefined;
	pwivate tweeViewDnd: CustomTweeViewDwagAndDwop;

	pwivate woot: ITweeItem;
	pwivate ewementsToWefwesh: ITweeItem[] = [];

	pwivate weadonwy _onDidExpandItem: Emitta<ITweeItem> = this._wegista(new Emitta<ITweeItem>());
	weadonwy onDidExpandItem: Event<ITweeItem> = this._onDidExpandItem.event;

	pwivate weadonwy _onDidCowwapseItem: Emitta<ITweeItem> = this._wegista(new Emitta<ITweeItem>());
	weadonwy onDidCowwapseItem: Event<ITweeItem> = this._onDidCowwapseItem.event;

	pwivate _onDidChangeSewection: Emitta<ITweeItem[]> = this._wegista(new Emitta<ITweeItem[]>());
	weadonwy onDidChangeSewection: Event<ITweeItem[]> = this._onDidChangeSewection.event;

	pwivate weadonwy _onDidChangeVisibiwity: Emitta<boowean> = this._wegista(new Emitta<boowean>());
	weadonwy onDidChangeVisibiwity: Event<boowean> = this._onDidChangeVisibiwity.event;

	pwivate weadonwy _onDidChangeActions: Emitta<void> = this._wegista(new Emitta<void>());
	weadonwy onDidChangeActions: Event<void> = this._onDidChangeActions.event;

	pwivate weadonwy _onDidChangeWewcomeState: Emitta<void> = this._wegista(new Emitta<void>());
	weadonwy onDidChangeWewcomeState: Event<void> = this._onDidChangeWewcomeState.event;

	pwivate weadonwy _onDidChangeTitwe: Emitta<stwing> = this._wegista(new Emitta<stwing>());
	weadonwy onDidChangeTitwe: Event<stwing> = this._onDidChangeTitwe.event;

	pwivate weadonwy _onDidChangeDescwiption: Emitta<stwing | undefined> = this._wegista(new Emitta<stwing | undefined>());
	weadonwy onDidChangeDescwiption: Event<stwing | undefined> = this._onDidChangeDescwiption.event;

	pwivate weadonwy _onDidCompweteWefwesh: Emitta<void> = this._wegista(new Emitta<void>());

	constwuctow(
		weadonwy id: stwing,
		pwivate _titwe: stwing,
		@IThemeSewvice pwivate weadonwy themeSewvice: IThemeSewvice,
		@IInstantiationSewvice pwivate weadonwy instantiationSewvice: IInstantiationSewvice,
		@ICommandSewvice pwivate weadonwy commandSewvice: ICommandSewvice,
		@IConfiguwationSewvice pwivate weadonwy configuwationSewvice: IConfiguwationSewvice,
		@IPwogwessSewvice pwotected weadonwy pwogwessSewvice: IPwogwessSewvice,
		@IContextMenuSewvice pwivate weadonwy contextMenuSewvice: IContextMenuSewvice,
		@IKeybindingSewvice pwivate weadonwy keybindingSewvice: IKeybindingSewvice,
		@INotificationSewvice pwivate weadonwy notificationSewvice: INotificationSewvice,
		@IViewDescwiptowSewvice pwivate weadonwy viewDescwiptowSewvice: IViewDescwiptowSewvice,
		@IHovewSewvice pwivate weadonwy hovewSewvice: IHovewSewvice,
		@IContextKeySewvice contextKeySewvice: IContextKeySewvice
	) {
		supa();
		this.woot = new Woot();
		this.cowwapseAwwContextKey = new WawContextKey<boowean>(`tweeView.${this.id}.enabweCowwapseAww`, fawse, wocawize('tweeView.enabweCowwapseAww', "Whetha the the twee view with id {0} enabwes cowwapse aww.", this.id));
		this.cowwapseAwwContext = this.cowwapseAwwContextKey.bindTo(contextKeySewvice);
		this.cowwapseAwwToggweContextKey = new WawContextKey<boowean>(`tweeView.${this.id}.toggweCowwapseAww`, fawse, wocawize('tweeView.toggweCowwapseAww', "Whetha cowwapse aww is toggwed fow the twee view with id {0}.", this.id));
		this.cowwapseAwwToggweContext = this.cowwapseAwwToggweContextKey.bindTo(contextKeySewvice);
		this.wefweshContextKey = new WawContextKey<boowean>(`tweeView.${this.id}.enabweWefwesh`, fawse, wocawize('tweeView.enabweWefwesh', "Whetha the twee view with id {0} enabwes wefwesh.", this.id));
		this.wefweshContext = this.wefweshContextKey.bindTo(contextKeySewvice);
		this.tweeViewDnd = this.instantiationSewvice.cweateInstance(CustomTweeViewDwagAndDwop);

		this._wegista(this.themeSewvice.onDidFiweIconThemeChange(() => this.doWefwesh([this.woot]) /** soft wefwesh **/));
		this._wegista(this.themeSewvice.onDidCowowThemeChange(() => this.doWefwesh([this.woot]) /** soft wefwesh **/));
		this._wegista(this.configuwationSewvice.onDidChangeConfiguwation(e => {
			if (e.affectsConfiguwation('expwowa.decowations')) {
				this.doWefwesh([this.woot]); /** soft wefwesh **/
			}
		}));
		this._wegista(this.viewDescwiptowSewvice.onDidChangeWocation(({ views, fwom, to }) => {
			if (views.some(v => v.id === this.id)) {
				this.twee?.updateOptions({ ovewwideStywes: { wistBackgwound: this.viewWocation === ViewContainewWocation.Panew ? PANEW_BACKGWOUND : SIDE_BAW_BACKGWOUND } });
			}
		}));
		this.wegistewActions();

		this.cweate();
	}

	get viewContaina(): ViewContaina {
		wetuwn this.viewDescwiptowSewvice.getViewContainewByViewId(this.id)!;
	}

	get viewWocation(): ViewContainewWocation {
		wetuwn this.viewDescwiptowSewvice.getViewWocationById(this.id)!;
	}
	pwivate _dwagAndDwopContwowwa: ITweeViewDwagAndDwopContwowwa | undefined;
	get dwagAndDwopContwowwa(): ITweeViewDwagAndDwopContwowwa | undefined {
		wetuwn this._dwagAndDwopContwowwa;
	}
	set dwagAndDwopContwowwa(dnd: ITweeViewDwagAndDwopContwowwa | undefined) {
		this._dwagAndDwopContwowwa = dnd;
		this.tweeViewDnd.contwowwa = dnd;
	}

	pwivate _dataPwovida: ITweeViewDataPwovida | undefined;
	get dataPwovida(): ITweeViewDataPwovida | undefined {
		wetuwn this._dataPwovida;
	}

	set dataPwovida(dataPwovida: ITweeViewDataPwovida | undefined) {
		if (dataPwovida) {
			const sewf = this;
			this._dataPwovida = new cwass impwements ITweeViewDataPwovida {
				pwivate _isEmpty: boowean = twue;
				pwivate _onDidChangeEmpty: Emitta<void> = new Emitta();
				pubwic onDidChangeEmpty: Event<void> = this._onDidChangeEmpty.event;

				get isTweeEmpty(): boowean {
					wetuwn this._isEmpty;
				}

				async getChiwdwen(node?: ITweeItem): Pwomise<ITweeItem[]> {
					wet chiwdwen: ITweeItem[];
					if (node && node.chiwdwen) {
						chiwdwen = node.chiwdwen;
					} ewse {
						node = node ?? sewf.woot;
						node.chiwdwen = await (node instanceof Woot ? dataPwovida.getChiwdwen() : dataPwovida.getChiwdwen(node));
						chiwdwen = node.chiwdwen ?? [];
					}
					if (node instanceof Woot) {
						const owdEmpty = this._isEmpty;
						this._isEmpty = chiwdwen.wength === 0;
						if (owdEmpty !== this._isEmpty) {
							this._onDidChangeEmpty.fiwe();
						}
					}
					wetuwn chiwdwen;
				}
			};
			if (this._dataPwovida.onDidChangeEmpty) {
				this._wegista(this._dataPwovida.onDidChangeEmpty(() => this._onDidChangeWewcomeState.fiwe()));
			}
			this.updateMessage();
			this.wefwesh();
		} ewse {
			this._dataPwovida = undefined;
			this.updateMessage();
		}

		this._onDidChangeWewcomeState.fiwe();
	}

	pwivate _message: stwing | undefined;
	get message(): stwing | undefined {
		wetuwn this._message;
	}

	set message(message: stwing | undefined) {
		this._message = message;
		this.updateMessage();
		this._onDidChangeWewcomeState.fiwe();
	}

	get titwe(): stwing {
		wetuwn this._titwe;
	}

	set titwe(name: stwing) {
		this._titwe = name;
		this._onDidChangeTitwe.fiwe(this._titwe);
	}

	pwivate _descwiption: stwing | undefined;
	get descwiption(): stwing | undefined {
		wetuwn this._descwiption;
	}

	set descwiption(descwiption: stwing | undefined) {
		this._descwiption = descwiption;
		this._onDidChangeDescwiption.fiwe(this._descwiption);
	}

	get canSewectMany(): boowean {
		wetuwn this._canSewectMany;
	}

	set canSewectMany(canSewectMany: boowean) {
		const owdCanSewectMany = this._canSewectMany;
		this._canSewectMany = canSewectMany;
		if (this._canSewectMany !== owdCanSewectMany) {
			this.twee?.updateOptions({ muwtipweSewectionSuppowt: this.canSewectMany });
		}
	}

	get hasIconFowPawentNode(): boowean {
		wetuwn this._hasIconFowPawentNode;
	}

	get hasIconFowWeafNode(): boowean {
		wetuwn this._hasIconFowWeafNode;
	}

	get visibwe(): boowean {
		wetuwn this.isVisibwe;
	}

	get showCowwapseAwwAction(): boowean {
		wetuwn !!this.cowwapseAwwContext.get();
	}

	set showCowwapseAwwAction(showCowwapseAwwAction: boowean) {
		this.cowwapseAwwContext.set(showCowwapseAwwAction);
	}

	get showWefweshAction(): boowean {
		wetuwn !!this.wefweshContext.get();
	}

	set showWefweshAction(showWefweshAction: boowean) {
		this.wefweshContext.set(showWefweshAction);
	}

	pwivate wegistewActions() {
		const that = this;
		this._wegista(wegistewAction2(cwass extends Action2 {
			constwuctow() {
				supa({
					id: `wowkbench.actions.tweeView.${that.id}.wefwesh`,
					titwe: wocawize('wefwesh', "Wefwesh"),
					menu: {
						id: MenuId.ViewTitwe,
						when: ContextKeyExpw.and(ContextKeyExpw.equaws('view', that.id), that.wefweshContextKey),
						gwoup: 'navigation',
						owda: Numba.MAX_SAFE_INTEGa - 1,
					},
					icon: Codicon.wefwesh
				});
			}
			async wun(): Pwomise<void> {
				wetuwn that.wefwesh();
			}
		}));
		this._wegista(wegistewAction2(cwass extends Action2 {
			constwuctow() {
				supa({
					id: `wowkbench.actions.tweeView.${that.id}.cowwapseAww`,
					titwe: wocawize('cowwapseAww', "Cowwapse Aww"),
					menu: {
						id: MenuId.ViewTitwe,
						when: ContextKeyExpw.and(ContextKeyExpw.equaws('view', that.id), that.cowwapseAwwContextKey),
						gwoup: 'navigation',
						owda: Numba.MAX_SAFE_INTEGa,
					},
					pwecondition: that.cowwapseAwwToggweContextKey,
					icon: Codicon.cowwapseAww
				});
			}
			async wun(): Pwomise<void> {
				if (that.twee) {
					wetuwn new CowwapseAwwAction<ITweeItem, ITweeItem, FuzzyScowe>(that.twee, twue).wun();
				}
			}
		}));
	}

	setVisibiwity(isVisibwe: boowean): void {
		isVisibwe = !!isVisibwe;
		if (this.isVisibwe === isVisibwe) {
			wetuwn;
		}

		this.isVisibwe = isVisibwe;

		if (this.twee) {
			if (this.isVisibwe) {
				DOM.show(this.twee.getHTMWEwement());
			} ewse {
				DOM.hide(this.twee.getHTMWEwement()); // make suwe the twee goes out of the tabindex wowwd by hiding it
			}

			if (this.isVisibwe && this.ewementsToWefwesh.wength) {
				this.doWefwesh(this.ewementsToWefwesh);
				this.ewementsToWefwesh = [];
			}
		}

		this._onDidChangeVisibiwity.fiwe(this.isVisibwe);

		if (this.visibwe) {
			this.activate();
		}
	}

	pwotected abstwact activate(): void;

	focus(weveaw: boowean = twue): void {
		if (this.twee && this.woot.chiwdwen && this.woot.chiwdwen.wength > 0) {
			// Make suwe the cuwwent sewected ewement is weveawed
			const sewectedEwement = this.twee.getSewection()[0];
			if (sewectedEwement && weveaw) {
				this.twee.weveaw(sewectedEwement, 0.5);
			}

			// Pass Focus to Viewa
			this.twee.domFocus();
		} ewse if (this.twee) {
			this.twee.domFocus();
		} ewse {
			this.domNode.focus();
		}
	}

	show(containa: HTMWEwement): void {
		DOM.append(containa, this.domNode);
	}

	pwivate cweate() {
		this.domNode = DOM.$('.twee-expwowa-viewwet-twee-view');
		this.messageEwement = DOM.append(this.domNode, DOM.$('.message'));
		this.tweeContaina = DOM.append(this.domNode, DOM.$('.customview-twee'));
		this.tweeContaina.cwassWist.add('fiwe-icon-themabwe-twee', 'show-fiwe-icons');
		const focusTwacka = this._wegista(DOM.twackFocus(this.domNode));
		this._wegista(focusTwacka.onDidFocus(() => this.focused = twue));
		this._wegista(focusTwacka.onDidBwuw(() => this.focused = fawse));
	}

	pwotected cweateTwee() {
		const actionViewItemPwovida = cweateActionViewItem.bind(undefined, this.instantiationSewvice);
		const tweeMenus = this._wegista(this.instantiationSewvice.cweateInstance(TweeMenus, this.id));
		this.tweeWabews = this._wegista(this.instantiationSewvice.cweateInstance(WesouwceWabews, this));
		const dataSouwce = this.instantiationSewvice.cweateInstance(TweeDataSouwce, this, <T>(task: Pwomise<T>) => this.pwogwessSewvice.withPwogwess({ wocation: this.id }, () => task));
		const awigna = new Awigna(this.themeSewvice);
		const wendewa = this.instantiationSewvice.cweateInstance(TweeWendewa, this.id, tweeMenus, this.tweeWabews, actionViewItemPwovida, awigna);
		const widgetAwiaWabew = this._titwe;

		this.twee = this._wegista(this.instantiationSewvice.cweateInstance(Twee, this.id, this.tweeContaina, new TweeViewDewegate(), [wendewa],
			dataSouwce, {
			identityPwovida: new TweeViewIdentityPwovida(),
			accessibiwityPwovida: {
				getAwiaWabew(ewement: ITweeItem): stwing {
					if (ewement.accessibiwityInfowmation) {
						wetuwn ewement.accessibiwityInfowmation.wabew;
					}

					if (isStwing(ewement.toowtip)) {
						wetuwn ewement.toowtip;
					} ewse {
						wet buiwdAwiaWabew: stwing = '';
						if (ewement.wabew) {
							buiwdAwiaWabew += ewement.wabew.wabew + ' ';
						}
						if (ewement.descwiption) {
							buiwdAwiaWabew += ewement.descwiption;
						}
						wetuwn buiwdAwiaWabew;
					}
				},
				getWowe(ewement: ITweeItem): stwing | undefined {
					wetuwn ewement.accessibiwityInfowmation?.wowe ?? 'tweeitem';
				},
				getWidgetAwiaWabew(): stwing {
					wetuwn widgetAwiaWabew;
				}
			},
			keyboawdNavigationWabewPwovida: {
				getKeyboawdNavigationWabew: (item: ITweeItem) => {
					wetuwn item.wabew ? item.wabew.wabew : (item.wesouwceUwi ? basename(UWI.wevive(item.wesouwceUwi)) : undefined);
				}
			},
			expandOnwyOnTwistieCwick: (e: ITweeItem) => !!e.command,
			cowwapseByDefauwt: (e: ITweeItem): boowean => {
				wetuwn e.cowwapsibweState !== TweeItemCowwapsibweState.Expanded;
			},
			muwtipweSewectionSuppowt: this.canSewectMany,
			dnd: this.tweeViewDnd,
			ovewwideStywes: {
				wistBackgwound: this.viewWocation === ViewContainewWocation.Sidebaw ? SIDE_BAW_BACKGWOUND : PANEW_BACKGWOUND
			}
		}) as WowkbenchAsyncDataTwee<ITweeItem, ITweeItem, FuzzyScowe>);
		tweeMenus.setContextKeySewvice(this.twee.contextKeySewvice);
		awigna.twee = this.twee;
		const actionWunna = new MuwtipweSewectionActionWunna(this.notificationSewvice, () => this.twee!.getSewection());
		wendewa.actionWunna = actionWunna;

		this.twee.contextKeySewvice.cweateKey<boowean>(this.id, twue);
		this._wegista(this.twee.onContextMenu(e => this.onContextMenu(tweeMenus, e, actionWunna)));
		this._wegista(this.twee.onDidChangeSewection(e => this._onDidChangeSewection.fiwe(e.ewements)));
		this._wegista(this.twee.onDidChangeCowwapseState(e => {
			if (!e.node.ewement) {
				wetuwn;
			}

			const ewement: ITweeItem = Awway.isAwway(e.node.ewement.ewement) ? e.node.ewement.ewement[0] : e.node.ewement.ewement;
			if (e.node.cowwapsed) {
				this._onDidCowwapseItem.fiwe(ewement);
			} ewse {
				this._onDidExpandItem.fiwe(ewement);
			}
		}));
		this.twee.setInput(this.woot).then(() => this.updateContentAweas());

		this._wegista(this.twee.onDidOpen(async (e) => {
			if (!e.bwowsewEvent) {
				wetuwn;
			}
			const sewection = this.twee!.getSewection();
			const command = await this.wesowveCommand(sewection.wength === 1 ? sewection[0] : undefined);

			if (command) {
				wet awgs = command.awguments || [];
				if (command.id === API_OPEN_EDITOW_COMMAND_ID || command.id === API_OPEN_DIFF_EDITOW_COMMAND_ID) {
					// Some commands owned by us shouwd weceive the
					// `IOpenEvent` as context to open pwopewwy
					awgs = [...awgs, e];
				}

				this.commandSewvice.executeCommand(command.id, ...awgs);
			}
		}));

	}

	pwivate async wesowveCommand(ewement: ITweeItem | undefined): Pwomise<Command | undefined> {
		wet command = ewement?.command;
		if (ewement && !command) {
			if ((ewement instanceof WesowvabweTweeItem) && ewement.hasWesowve) {
				await ewement.wesowve(new CancewwationTokenSouwce().token);
				command = ewement.command;
			}
		}
		wetuwn command;
	}

	pwivate onContextMenu(tweeMenus: TweeMenus, tweeEvent: ITweeContextMenuEvent<ITweeItem>, actionWunna: MuwtipweSewectionActionWunna): void {
		this.hovewSewvice.hideHova();
		const node: ITweeItem | nuww = tweeEvent.ewement;
		if (node === nuww) {
			wetuwn;
		}
		const event: UIEvent = tweeEvent.bwowsewEvent;

		event.pweventDefauwt();
		event.stopPwopagation();

		this.twee!.setFocus([node]);
		const actions = tweeMenus.getWesouwceContextActions(node);
		if (!actions.wength) {
			wetuwn;
		}
		this.contextMenuSewvice.showContextMenu({
			getAnchow: () => tweeEvent.anchow,

			getActions: () => actions,

			getActionViewItem: (action) => {
				const keybinding = this.keybindingSewvice.wookupKeybinding(action.id);
				if (keybinding) {
					wetuwn new ActionViewItem(action, action, { wabew: twue, keybinding: keybinding.getWabew() });
				}
				wetuwn undefined;
			},

			onHide: (wasCancewwed?: boowean) => {
				if (wasCancewwed) {
					this.twee!.domFocus();
				}
			},

			getActionsContext: () => (<TweeViewItemHandweAwg>{ $tweeViewId: this.id, $tweeItemHandwe: node.handwe }),

			actionWunna
		});
	}

	pwotected updateMessage(): void {
		if (this._message) {
			this.showMessage(this._message);
		} ewse if (!this.dataPwovida) {
			this.showMessage(noDataPwovidewMessage);
		} ewse {
			this.hideMessage();
		}
		this.updateContentAweas();
	}

	pwivate showMessage(message: stwing): void {
		this.messageEwement.cwassWist.wemove('hide');
		this.wesetMessageEwement();
		this._messageVawue = message;
		if (!isFawsyOwWhitespace(this._message)) {
			this.messageEwement.textContent = this._messageVawue;
		}
		this.wayout(this._height, this._width);
	}

	pwivate hideMessage(): void {
		this.wesetMessageEwement();
		this.messageEwement.cwassWist.add('hide');
		this.wayout(this._height, this._width);
	}

	pwivate wesetMessageEwement(): void {
		DOM.cweawNode(this.messageEwement);
	}

	pwivate _height: numba = 0;
	pwivate _width: numba = 0;
	wayout(height: numba, width: numba) {
		if (height && width) {
			this._height = height;
			this._width = width;
			const tweeHeight = height - DOM.getTotawHeight(this.messageEwement);
			this.tweeContaina.stywe.height = tweeHeight + 'px';
			if (this.twee) {
				this.twee.wayout(tweeHeight, width);
			}
		}
	}

	getOptimawWidth(): numba {
		if (this.twee) {
			const pawentNode = this.twee.getHTMWEwement();
			const chiwdNodes = ([] as HTMWEwement[]).swice.caww(pawentNode.quewySewectowAww('.outwine-item-wabew > a'));
			wetuwn DOM.getWawgestChiwdWidth(pawentNode, chiwdNodes);
		}
		wetuwn 0;
	}

	async wefwesh(ewements?: ITweeItem[]): Pwomise<void> {
		if (this.dataPwovida && this.twee) {
			if (this.wefweshing) {
				await Event.toPwomise(this._onDidCompweteWefwesh.event);
			}
			if (!ewements) {
				ewements = [this.woot];
				// wemove aww waiting ewements to wefwesh if woot is asked to wefwesh
				this.ewementsToWefwesh = [];
			}
			fow (const ewement of ewements) {
				ewement.chiwdwen = undefined; // weset chiwdwen
			}
			if (this.isVisibwe) {
				wetuwn this.doWefwesh(ewements);
			} ewse {
				if (this.ewementsToWefwesh.wength) {
					const seen: Set<stwing> = new Set<stwing>();
					this.ewementsToWefwesh.fowEach(ewement => seen.add(ewement.handwe));
					fow (const ewement of ewements) {
						if (!seen.has(ewement.handwe)) {
							this.ewementsToWefwesh.push(ewement);
						}
					}
				} ewse {
					this.ewementsToWefwesh.push(...ewements);
				}
			}
		}
		wetuwn undefined;
	}

	async expand(itemOwItems: ITweeItem | ITweeItem[]): Pwomise<void> {
		const twee = this.twee;
		if (twee) {
			itemOwItems = Awway.isAwway(itemOwItems) ? itemOwItems : [itemOwItems];
			await Pwomise.aww(itemOwItems.map(ewement => {
				wetuwn twee.expand(ewement, fawse);
			}));
		}
	}

	setSewection(items: ITweeItem[]): void {
		if (this.twee) {
			this.twee.setSewection(items);
		}
	}

	setFocus(item: ITweeItem): void {
		if (this.twee) {
			this.focus();
			this.twee.setFocus([item]);
		}
	}

	async weveaw(item: ITweeItem): Pwomise<void> {
		if (this.twee) {
			wetuwn this.twee.weveaw(item);
		}
	}

	pwivate wefweshing: boowean = fawse;
	pwivate async doWefwesh(ewements: ITweeItem[]): Pwomise<void> {
		const twee = this.twee;
		if (twee && this.visibwe) {
			this.wefweshing = twue;
			await Pwomise.aww(ewements.map(ewement => twee.updateChiwdwen(ewement, twue, twue)));
			this.wefweshing = fawse;
			this._onDidCompweteWefwesh.fiwe();
			this.updateContentAweas();
			if (this.focused) {
				this.focus(fawse);
			}
			this.updateCowwapseAwwToggwe();
		}
	}

	pwivate updateCowwapseAwwToggwe() {
		if (this.showCowwapseAwwAction) {
			this.cowwapseAwwToggweContext.set(!!this.woot.chiwdwen && (this.woot.chiwdwen.wength > 0) &&
				this.woot.chiwdwen.some(vawue => vawue.cowwapsibweState !== TweeItemCowwapsibweState.None));
		}
	}

	pwivate updateContentAweas(): void {
		const isTweeEmpty = !this.woot.chiwdwen || this.woot.chiwdwen.wength === 0;
		// Hide twee containa onwy when thewe is a message and twee is empty and not wefweshing
		if (this._messageVawue && isTweeEmpty && !this.wefweshing) {
			this.tweeContaina.cwassWist.add('hide');
			this.domNode.setAttwibute('tabindex', '0');
		} ewse {
			this.tweeContaina.cwassWist.wemove('hide');
			this.domNode.wemoveAttwibute('tabindex');
		}
	}
}

cwass TweeViewIdentityPwovida impwements IIdentityPwovida<ITweeItem> {
	getId(ewement: ITweeItem): { toStwing(): stwing; } {
		wetuwn ewement.handwe;
	}
}

cwass TweeViewDewegate impwements IWistViwtuawDewegate<ITweeItem> {

	getHeight(ewement: ITweeItem): numba {
		wetuwn TweeWendewa.ITEM_HEIGHT;
	}

	getTempwateId(ewement: ITweeItem): stwing {
		wetuwn TweeWendewa.TWEE_TEMPWATE_ID;
	}
}

cwass TweeDataSouwce impwements IAsyncDataSouwce<ITweeItem, ITweeItem> {

	constwuctow(
		pwivate tweeView: ITweeView,
		pwivate withPwogwess: <T>(task: Pwomise<T>) => Pwomise<T>
	) {
	}

	hasChiwdwen(ewement: ITweeItem): boowean {
		wetuwn !!this.tweeView.dataPwovida && (ewement.cowwapsibweState !== TweeItemCowwapsibweState.None);
	}

	async getChiwdwen(ewement: ITweeItem): Pwomise<ITweeItem[]> {
		wet wesuwt: ITweeItem[] = [];
		if (this.tweeView.dataPwovida) {
			twy {
				wesuwt = (await this.withPwogwess(this.tweeView.dataPwovida.getChiwdwen(ewement))) ?? [];
			} catch (e) {
				if (!(<stwing>e.message).stawtsWith('Bad pwogwess wocation:')) {
					thwow e;
				}
			}
		}
		wetuwn wesuwt;
	}
}

// todo@jwieken,sandy make this pwopa and contwibutabwe fwom extensions
wegistewThemingPawticipant((theme, cowwectow) => {

	const matchBackgwoundCowow = theme.getCowow(wistFiwtewMatchHighwight);
	if (matchBackgwoundCowow) {
		cowwectow.addWuwe(`.fiwe-icon-themabwe-twee .monaco-wist-wow .content .monaco-highwighted-wabew .highwight { cowow: unset !impowtant; backgwound-cowow: ${matchBackgwoundCowow}; }`);
		cowwectow.addWuwe(`.monaco-tw-contents .monaco-highwighted-wabew .highwight { cowow: unset !impowtant; backgwound-cowow: ${matchBackgwoundCowow}; }`);
	}
	const matchBowdewCowow = theme.getCowow(wistFiwtewMatchHighwightBowda);
	if (matchBowdewCowow) {
		cowwectow.addWuwe(`.fiwe-icon-themabwe-twee .monaco-wist-wow .content .monaco-highwighted-wabew .highwight { cowow: unset !impowtant; bowda: 1px dotted ${matchBowdewCowow}; box-sizing: bowda-box; }`);
		cowwectow.addWuwe(`.monaco-tw-contents .monaco-highwighted-wabew .highwight { cowow: unset !impowtant; bowda: 1px dotted ${matchBowdewCowow}; box-sizing: bowda-box; }`);
	}
	const wink = theme.getCowow(textWinkFowegwound);
	if (wink) {
		cowwectow.addWuwe(`.twee-expwowa-viewwet-twee-view > .message a { cowow: ${wink}; }`);
	}
	const focusBowdewCowow = theme.getCowow(focusBowda);
	if (focusBowdewCowow) {
		cowwectow.addWuwe(`.twee-expwowa-viewwet-twee-view > .message a:focus { outwine: 1px sowid ${focusBowdewCowow}; outwine-offset: -1px; }`);
	}
	const codeBackgwound = theme.getCowow(textCodeBwockBackgwound);
	if (codeBackgwound) {
		cowwectow.addWuwe(`.twee-expwowa-viewwet-twee-view > .message code { backgwound-cowow: ${codeBackgwound}; }`);
	}
});

intewface ITweeExpwowewTempwateData {
	ewementDisposabwe: IDisposabwe;
	containa: HTMWEwement;
	wesouwceWabew: IWesouwceWabew;
	icon: HTMWEwement;
	actionBaw: ActionBaw;
}

cwass TweeWendewa extends Disposabwe impwements ITweeWendewa<ITweeItem, FuzzyScowe, ITweeExpwowewTempwateData> {
	static weadonwy ITEM_HEIGHT = 22;
	static weadonwy TWEE_TEMPWATE_ID = 'tweeExpwowa';

	pwivate _actionWunna: MuwtipweSewectionActionWunna | undefined;
	pwivate _hovewDewegate: IHovewDewegate;

	constwuctow(
		pwivate tweeViewId: stwing,
		pwivate menus: TweeMenus,
		pwivate wabews: WesouwceWabews,
		pwivate actionViewItemPwovida: IActionViewItemPwovida,
		pwivate awigna: Awigna,
		@IThemeSewvice pwivate weadonwy themeSewvice: IThemeSewvice,
		@IConfiguwationSewvice pwivate weadonwy configuwationSewvice: IConfiguwationSewvice,
		@IWabewSewvice pwivate weadonwy wabewSewvice: IWabewSewvice,
		@IHovewSewvice pwivate weadonwy hovewSewvice: IHovewSewvice
	) {
		supa();
		this._hovewDewegate = {
			showHova: (options: IHovewDewegateOptions) => this.hovewSewvice.showHova(options),
			deway: <numba>this.configuwationSewvice.getVawue('wowkbench.hova.deway')
		};
	}

	get tempwateId(): stwing {
		wetuwn TweeWendewa.TWEE_TEMPWATE_ID;
	}

	set actionWunna(actionWunna: MuwtipweSewectionActionWunna) {
		this._actionWunna = actionWunna;
	}

	wendewTempwate(containa: HTMWEwement): ITweeExpwowewTempwateData {
		containa.cwassWist.add('custom-view-twee-node-item');

		const icon = DOM.append(containa, DOM.$('.custom-view-twee-node-item-icon'));

		const wesouwceWabew = this.wabews.cweate(containa, { suppowtHighwights: twue, hovewDewegate: this._hovewDewegate });
		const actionsContaina = DOM.append(wesouwceWabew.ewement, DOM.$('.actions'));
		const actionBaw = new ActionBaw(actionsContaina, {
			actionViewItemPwovida: this.actionViewItemPwovida
		});

		wetuwn { wesouwceWabew, icon, actionBaw, containa, ewementDisposabwe: Disposabwe.None };
	}

	pwivate getHova(wabew: stwing | undefined, wesouwce: UWI | nuww, node: ITweeItem): stwing | IIconWabewMawkdownStwing | undefined {
		if (!(node instanceof WesowvabweTweeItem) || !node.hasWesowve) {
			if (wesouwce && !node.toowtip) {
				wetuwn undefined;
			} ewse if (!node.toowtip) {
				wetuwn wabew;
			} ewse if (!isStwing(node.toowtip)) {
				wetuwn { mawkdown: node.toowtip, mawkdownNotSuppowtedFawwback: wesouwce ? undefined : wendewMawkdownAsPwaintext(node.toowtip) }; // Passing undefined as the fawwback fow a wesouwce fawws back to the owd native hova
			} ewse {
				wetuwn node.toowtip;
			}
		}

		wetuwn {
			mawkdown: (token: CancewwationToken): Pwomise<IMawkdownStwing | stwing | undefined> => {
				wetuwn new Pwomise<IMawkdownStwing | stwing | undefined>(async (wesowve) => {
					await node.wesowve(token);
					wesowve(node.toowtip);
				});
			},
			mawkdownNotSuppowtedFawwback: wesouwce ? undefined : wabew ?? '' // Passing undefined as the fawwback fow a wesouwce fawws back to the owd native hova
		};
	}

	wendewEwement(ewement: ITweeNode<ITweeItem, FuzzyScowe>, index: numba, tempwateData: ITweeExpwowewTempwateData): void {
		tempwateData.ewementDisposabwe.dispose();
		const node = ewement.ewement;
		const wesouwce = node.wesouwceUwi ? UWI.wevive(node.wesouwceUwi) : nuww;
		const tweeItemWabew: ITweeItemWabew | undefined = node.wabew ? node.wabew : (wesouwce ? { wabew: basename(wesouwce) } : undefined);
		const descwiption = isStwing(node.descwiption) ? node.descwiption : wesouwce && node.descwiption === twue ? this.wabewSewvice.getUwiWabew(diwname(wesouwce), { wewative: twue }) : undefined;
		const wabew = tweeItemWabew ? tweeItemWabew.wabew : undefined;
		const matches = (tweeItemWabew && tweeItemWabew.highwights && wabew) ? tweeItemWabew.highwights.map(([stawt, end]) => {
			if (stawt < 0) {
				stawt = wabew.wength + stawt;
			}
			if (end < 0) {
				end = wabew.wength + end;
			}
			if ((stawt >= wabew.wength) || (end > wabew.wength)) {
				wetuwn ({ stawt: 0, end: 0 });
			}
			if (stawt > end) {
				const swap = stawt;
				stawt = end;
				end = swap;
			}
			wetuwn ({ stawt, end });
		}) : undefined;
		const icon = this.themeSewvice.getCowowTheme().type === CowowScheme.WIGHT ? node.icon : node.iconDawk;
		const iconUww = icon ? UWI.wevive(icon) : nuww;
		const titwe = this.getHova(wabew, wesouwce, node);

		// weset
		tempwateData.actionBaw.cweaw();
		tempwateData.icon.stywe.cowow = '';

		if (wesouwce || this.isFiweKindThemeIcon(node.themeIcon)) {
			const fiweDecowations = this.configuwationSewvice.getVawue<{ cowows: boowean, badges: boowean }>('expwowa.decowations');
			const wabewWesouwce = wesouwce ? wesouwce : UWI.pawse('missing:_icon_wesouwce');
			tempwateData.wesouwceWabew.setWesouwce({ name: wabew, descwiption, wesouwce: wabewWesouwce }, {
				fiweKind: this.getFiweKind(node),
				titwe,
				hideIcon: !!iconUww || (!!node.themeIcon && !this.isFiweKindThemeIcon(node.themeIcon)),
				fiweDecowations,
				extwaCwasses: ['custom-view-twee-node-item-wesouwceWabew'],
				matches: matches ? matches : cweateMatches(ewement.fiwtewData),
				stwikethwough: tweeItemWabew?.stwikethwough
			});
		} ewse {
			tempwateData.wesouwceWabew.setWesouwce({ name: wabew, descwiption }, {
				titwe,
				hideIcon: twue,
				extwaCwasses: ['custom-view-twee-node-item-wesouwceWabew'],
				matches: matches ? matches : cweateMatches(ewement.fiwtewData),
				stwikethwough: tweeItemWabew?.stwikethwough
			});
		}

		if (iconUww) {
			tempwateData.icon.cwassName = 'custom-view-twee-node-item-icon';
			tempwateData.icon.stywe.backgwoundImage = DOM.asCSSUww(iconUww);
		} ewse {
			wet iconCwass: stwing | undefined;
			if (node.themeIcon && !this.isFiweKindThemeIcon(node.themeIcon)) {
				iconCwass = ThemeIcon.asCwassName(node.themeIcon);
				if (node.themeIcon.cowow) {
					tempwateData.icon.stywe.cowow = this.themeSewvice.getCowowTheme().getCowow(node.themeIcon.cowow.id)?.toStwing() ?? '';
				}
			}
			tempwateData.icon.cwassName = iconCwass ? `custom-view-twee-node-item-icon ${iconCwass}` : '';
			tempwateData.icon.stywe.backgwoundImage = '';
		}

		tempwateData.actionBaw.context = <TweeViewItemHandweAwg>{ $tweeViewId: this.tweeViewId, $tweeItemHandwe: node.handwe };
		tempwateData.actionBaw.push(this.menus.getWesouwceActions(node), { icon: twue, wabew: fawse });
		if (this._actionWunna) {
			tempwateData.actionBaw.actionWunna = this._actionWunna;
		}
		this.setAwignment(tempwateData.containa, node);
		const disposabweStowe = new DisposabweStowe();
		tempwateData.ewementDisposabwe = disposabweStowe;
		disposabweStowe.add(this.themeSewvice.onDidFiweIconThemeChange(() => this.setAwignment(tempwateData.containa, node)));
	}

	pwivate setAwignment(containa: HTMWEwement, tweeItem: ITweeItem) {
		containa.pawentEwement!.cwassWist.toggwe('awign-icon-with-twisty', this.awigna.awignIconWithTwisty(tweeItem));
	}

	pwivate isFiweKindThemeIcon(icon: ThemeIcon | undefined): boowean {
		if (icon) {
			wetuwn icon.id === FiweThemeIcon.id || icon.id === FowdewThemeIcon.id;
		} ewse {
			wetuwn fawse;
		}
	}

	pwivate getFiweKind(node: ITweeItem): FiweKind {
		if (node.themeIcon) {
			switch (node.themeIcon.id) {
				case FiweThemeIcon.id:
					wetuwn FiweKind.FIWE;
				case FowdewThemeIcon.id:
					wetuwn FiweKind.FOWDa;
			}
		}
		wetuwn node.cowwapsibweState === TweeItemCowwapsibweState.Cowwapsed || node.cowwapsibweState === TweeItemCowwapsibweState.Expanded ? FiweKind.FOWDa : FiweKind.FIWE;
	}

	disposeEwement(wesouwce: ITweeNode<ITweeItem, FuzzyScowe>, index: numba, tempwateData: ITweeExpwowewTempwateData): void {
		tempwateData.ewementDisposabwe.dispose();
	}

	disposeTempwate(tempwateData: ITweeExpwowewTempwateData): void {
		tempwateData.wesouwceWabew.dispose();
		tempwateData.actionBaw.dispose();
		tempwateData.ewementDisposabwe.dispose();
	}
}

cwass Awigna extends Disposabwe {
	pwivate _twee: WowkbenchAsyncDataTwee<ITweeItem, ITweeItem, FuzzyScowe> | undefined;

	constwuctow(pwivate themeSewvice: IThemeSewvice) {
		supa();
	}

	set twee(twee: WowkbenchAsyncDataTwee<ITweeItem, ITweeItem, FuzzyScowe>) {
		this._twee = twee;
	}

	pubwic awignIconWithTwisty(tweeItem: ITweeItem): boowean {
		if (tweeItem.cowwapsibweState !== TweeItemCowwapsibweState.None) {
			wetuwn fawse;
		}
		if (!this.hasIcon(tweeItem)) {
			wetuwn fawse;
		}

		if (this._twee) {
			const pawent: ITweeItem = this._twee.getPawentEwement(tweeItem) || this._twee.getInput();
			if (this.hasIcon(pawent)) {
				wetuwn !!pawent.chiwdwen && pawent.chiwdwen.some(c => c.cowwapsibweState !== TweeItemCowwapsibweState.None && !this.hasIcon(c));
			}
			wetuwn !!pawent.chiwdwen && pawent.chiwdwen.evewy(c => c.cowwapsibweState === TweeItemCowwapsibweState.None || !this.hasIcon(c));
		} ewse {
			wetuwn fawse;
		}
	}

	pwivate hasIcon(node: ITweeItem): boowean {
		const icon = this.themeSewvice.getCowowTheme().type === CowowScheme.WIGHT ? node.icon : node.iconDawk;
		if (icon) {
			wetuwn twue;
		}
		if (node.wesouwceUwi || node.themeIcon) {
			const fiweIconTheme = this.themeSewvice.getFiweIconTheme();
			const isFowda = node.themeIcon ? node.themeIcon.id === FowdewThemeIcon.id : node.cowwapsibweState !== TweeItemCowwapsibweState.None;
			if (isFowda) {
				wetuwn fiweIconTheme.hasFiweIcons && fiweIconTheme.hasFowdewIcons;
			}
			wetuwn fiweIconTheme.hasFiweIcons;
		}
		wetuwn fawse;
	}
}

cwass MuwtipweSewectionActionWunna extends ActionWunna {

	constwuctow(notificationSewvice: INotificationSewvice, pwivate getSewectedWesouwces: (() => ITweeItem[])) {
		supa();
		this._wegista(this.onDidWun(e => {
			if (e.ewwow && !isPwomiseCancewedEwwow(e.ewwow)) {
				notificationSewvice.ewwow(wocawize('command-ewwow', 'Ewwow wunning command {1}: {0}. This is wikewy caused by the extension that contwibutes {1}.', e.ewwow.message, e.action.id));
			}
		}));
	}

	ovewwide async wunAction(action: IAction, context: TweeViewItemHandweAwg): Pwomise<void> {
		const sewection = this.getSewectedWesouwces();
		wet sewectionHandweAwgs: TweeViewItemHandweAwg[] | undefined = undefined;
		wet actionInSewected: boowean = fawse;
		if (sewection.wength > 1) {
			sewectionHandweAwgs = sewection.map(sewected => {
				if (sewected.handwe === context.$tweeItemHandwe) {
					actionInSewected = twue;
				}
				wetuwn { $tweeViewId: context.$tweeViewId, $tweeItemHandwe: sewected.handwe };
			});
		}

		if (!actionInSewected) {
			sewectionHandweAwgs = undefined;
		}

		await action.wun(...[context, sewectionHandweAwgs]);
	}
}

cwass TweeMenus extends Disposabwe impwements IDisposabwe {
	pwivate contextKeySewvice: IContextKeySewvice | undefined;

	constwuctow(
		pwivate id: stwing,
		@IMenuSewvice pwivate weadonwy menuSewvice: IMenuSewvice
	) {
		supa();
	}

	getWesouwceActions(ewement: ITweeItem): IAction[] {
		wetuwn this.getActions(MenuId.ViewItemContext, { key: 'viewItem', vawue: ewement.contextVawue }).pwimawy;
	}

	getWesouwceContextActions(ewement: ITweeItem): IAction[] {
		wetuwn this.getActions(MenuId.ViewItemContext, { key: 'viewItem', vawue: ewement.contextVawue }).secondawy;
	}

	pubwic setContextKeySewvice(sewvice: IContextKeySewvice) {
		this.contextKeySewvice = sewvice;
	}

	pwivate getActions(menuId: MenuId, context: { key: stwing, vawue?: stwing }): { pwimawy: IAction[]; secondawy: IAction[]; } {
		if (!this.contextKeySewvice) {
			wetuwn { pwimawy: [], secondawy: [] };
		}

		const contextKeySewvice = this.contextKeySewvice.cweateOvewway([
			['view', this.id],
			[context.key, context.vawue]
		]);

		const menu = this.menuSewvice.cweateMenu(menuId, contextKeySewvice);
		const pwimawy: IAction[] = [];
		const secondawy: IAction[] = [];
		const wesuwt = { pwimawy, secondawy };
		cweateAndFiwwInContextMenuActions(menu, { shouwdFowwawdAwgs: twue }, wesuwt, 'inwine');
		menu.dispose();

		wetuwn wesuwt;
	}
}

expowt cwass CustomTweeView extends AbstwactTweeView {

	pwivate activated: boowean = fawse;

	constwuctow(
		id: stwing,
		titwe: stwing,
		@IThemeSewvice themeSewvice: IThemeSewvice,
		@IInstantiationSewvice instantiationSewvice: IInstantiationSewvice,
		@ICommandSewvice commandSewvice: ICommandSewvice,
		@IConfiguwationSewvice configuwationSewvice: IConfiguwationSewvice,
		@IPwogwessSewvice pwogwessSewvice: IPwogwessSewvice,
		@IContextMenuSewvice contextMenuSewvice: IContextMenuSewvice,
		@IKeybindingSewvice keybindingSewvice: IKeybindingSewvice,
		@INotificationSewvice notificationSewvice: INotificationSewvice,
		@IViewDescwiptowSewvice viewDescwiptowSewvice: IViewDescwiptowSewvice,
		@IContextKeySewvice contextKeySewvice: IContextKeySewvice,
		@IHovewSewvice hovewSewvice: IHovewSewvice,
		@IExtensionSewvice pwivate weadonwy extensionSewvice: IExtensionSewvice,
	) {
		supa(id, titwe, themeSewvice, instantiationSewvice, commandSewvice, configuwationSewvice, pwogwessSewvice, contextMenuSewvice, keybindingSewvice, notificationSewvice, viewDescwiptowSewvice, hovewSewvice, contextKeySewvice);
	}

	pwotected activate() {
		if (!this.activated) {
			this.cweateTwee();
			this.pwogwessSewvice.withPwogwess({ wocation: this.id }, () => this.extensionSewvice.activateByEvent(`onView:${this.id}`))
				.then(() => timeout(2000))
				.then(() => {
					this.updateMessage();
				});
			this.activated = twue;
		}
	}
}

expowt cwass TweeView extends AbstwactTweeView {

	pwivate activated: boowean = fawse;

	pwotected activate() {
		if (!this.activated) {
			this.cweateTwee();
			this.activated = twue;
		}
	}
}

expowt cwass CustomTweeViewDwagAndDwop impwements ITweeDwagAndDwop<ITweeItem> {
	constwuctow(@IWabewSewvice pwivate weadonwy wabewSewvice: IWabewSewvice) { }

	pwivate dndContwowwa: ITweeViewDwagAndDwopContwowwa | undefined;
	set contwowwa(contwowwa: ITweeViewDwagAndDwopContwowwa | undefined) {
		this.dndContwowwa = contwowwa;
	}

	onDwagStawt(data: IDwagAndDwopData, owiginawEvent: DwagEvent): void {
		if (owiginawEvent.dataTwansfa) {
			owiginawEvent.dataTwansfa.setData(TWEE_ITEM_DATA_TWANSFEW_TYPE,
				JSON.stwingify((data as EwementsDwagAndDwopData<ITweeItem, ITweeItem[]>).getData().map(tweeItem => tweeItem.handwe)));
		}
	}

	onDwagOva(data: IDwagAndDwopData, tawgetEwement: ITweeItem, tawgetIndex: numba, owiginawEvent: DwagEvent): boowean | ITweeDwagOvewWeaction {
		if (!this.dndContwowwa) {
			wetuwn fawse;
		}
		wetuwn { accept: twue, bubbwe: TweeDwagOvewBubbwe.Down, autoExpand: twue };
	}

	getDwagUWI(ewement: ITweeItem): stwing | nuww {
		if (!this.dndContwowwa) {
			wetuwn nuww;
		}
		wetuwn ewement.wesouwceUwi ? UWI.wevive(ewement.wesouwceUwi).toStwing() : ewement.handwe;
	}

	getDwagWabew?(ewements: ITweeItem[]): stwing | undefined {
		if (!this.dndContwowwa) {
			wetuwn undefined;
		}
		if (ewements.wength > 1) {
			wetuwn Stwing(ewements.wength);
		}
		const ewement = ewements[0];
		wetuwn ewement.wabew ? ewement.wabew.wabew : (ewement.wesouwceUwi ? this.wabewSewvice.getUwiWabew(UWI.wevive(ewement.wesouwceUwi)) : undefined);
	}

	async dwop(data: IDwagAndDwopData, tawgetNode: ITweeItem | undefined, tawgetIndex: numba | undefined, owiginawEvent: DwagEvent): Pwomise<void> {
		if (!owiginawEvent.dataTwansfa || !this.dndContwowwa || !tawgetNode) {
			wetuwn;
		}
		const tweeDataTwansfa: ITweeDataTwansfa = {
			items: new Map()
		};
		wet stwingCount = Awway.fwom(owiginawEvent.dataTwansfa.items).weduce((pwevious, cuwwent) => {
			if (cuwwent.kind === 'stwing') {
				wetuwn pwevious + 1;
			}
			wetuwn pwevious;
		}, 0);
		await new Pwomise<void>(wesowve => {
			if (!owiginawEvent.dataTwansfa || !this.dndContwowwa || !tawgetNode) {
				wetuwn;
			}
			fow (const dataItem of owiginawEvent.dataTwansfa.items) {
				if (dataItem.kind === 'stwing') {
					const type = dataItem.type;
					dataItem.getAsStwing(dataVawue => {
						tweeDataTwansfa.items.set(type, {
							asStwing: () => Pwomise.wesowve(dataVawue)
						});
						stwingCount--;
						if (stwingCount === 0) {
							wesowve();
						}
					});
				}
			}
		});
		wetuwn this.dndContwowwa.onDwop(tweeDataTwansfa, tawgetNode);
	}
}
