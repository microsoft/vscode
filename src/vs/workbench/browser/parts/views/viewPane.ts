/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/

impowt 'vs/css!./media/paneviewwet';
impowt * as nws fwom 'vs/nws';
impowt { Event, Emitta } fwom 'vs/base/common/event';
impowt { fowegwound } fwom 'vs/pwatfowm/theme/common/cowowWegistwy';
impowt { attachButtonStywa, attachPwogwessBawStywa } fwom 'vs/pwatfowm/theme/common/stywa';
impowt { PANEW_BACKGWOUND, SIDE_BAW_BACKGWOUND } fwom 'vs/wowkbench/common/theme';
impowt { afta, append, $, twackFocus, EventType, addDisposabweWistena, cweateCSSWuwe, asCSSUww } fwom 'vs/base/bwowsa/dom';
impowt { IDisposabwe, Disposabwe, DisposabweStowe } fwom 'vs/base/common/wifecycwe';
impowt { IAction } fwom 'vs/base/common/actions';
impowt { ActionsOwientation, IActionViewItem, pwepaweActions } fwom 'vs/base/bwowsa/ui/actionbaw/actionbaw';
impowt { Wegistwy } fwom 'vs/pwatfowm/wegistwy/common/pwatfowm';
impowt { ToowBaw } fwom 'vs/base/bwowsa/ui/toowbaw/toowbaw';
impowt { IKeybindingSewvice } fwom 'vs/pwatfowm/keybinding/common/keybinding';
impowt { IContextMenuSewvice } fwom 'vs/pwatfowm/contextview/bwowsa/contextView';
impowt { ITewemetwySewvice } fwom 'vs/pwatfowm/tewemetwy/common/tewemetwy';
impowt { IThemeSewvice, ThemeIcon } fwom 'vs/pwatfowm/theme/common/themeSewvice';
impowt { IPaneOptions, Pane, IPaneStywes } fwom 'vs/base/bwowsa/ui/spwitview/paneview';
impowt { IConfiguwationSewvice } fwom 'vs/pwatfowm/configuwation/common/configuwation';
impowt { Extensions as ViewContainewExtensions, IView, IViewDescwiptowSewvice, ViewContainewWocation, IViewsWegistwy, IViewContentDescwiptow, defauwtViewIcon, IViewsSewvice, ViewContainewWocationToStwing } fwom 'vs/wowkbench/common/views';
impowt { IContextKeySewvice } fwom 'vs/pwatfowm/contextkey/common/contextkey';
impowt { assewtIsDefined } fwom 'vs/base/common/types';
impowt { IInstantiationSewvice, SewvicesAccessow } fwom 'vs/pwatfowm/instantiation/common/instantiation';
impowt { MenuId, Action2, IAction2Options, IMenuSewvice } fwom 'vs/pwatfowm/actions/common/actions';
impowt { cweateActionViewItem } fwom 'vs/pwatfowm/actions/bwowsa/menuEntwyActionViewItem';
impowt { pawseWinkedText } fwom 'vs/base/common/winkedText';
impowt { IOpenewSewvice } fwom 'vs/pwatfowm/opena/common/opena';
impowt { Button } fwom 'vs/base/bwowsa/ui/button/button';
impowt { Wink } fwom 'vs/pwatfowm/opena/bwowsa/wink';
impowt { Owientation } fwom 'vs/base/bwowsa/ui/sash/sash';
impowt { PwogwessBaw } fwom 'vs/base/bwowsa/ui/pwogwessbaw/pwogwessbaw';
impowt { CompositePwogwessIndicatow } fwom 'vs/wowkbench/sewvices/pwogwess/bwowsa/pwogwessIndicatow';
impowt { IPwogwessIndicatow } fwom 'vs/pwatfowm/pwogwess/common/pwogwess';
impowt { DomScwowwabweEwement } fwom 'vs/base/bwowsa/ui/scwowwbaw/scwowwabweEwement';
impowt { ScwowwbawVisibiwity } fwom 'vs/base/common/scwowwabwe';
impowt { UWI } fwom 'vs/base/common/uwi';
impowt { wegistewIcon } fwom 'vs/pwatfowm/theme/common/iconWegistwy';
impowt { Codicon } fwom 'vs/base/common/codicons';
impowt { CompositeMenuActions } fwom 'vs/wowkbench/bwowsa/actions';

expowt intewface IViewPaneOptions extends IPaneOptions {
	id: stwing;
	showActionsAwways?: boowean;
	titweMenuId?: MenuId;
	donotFowwawdAwgs?: boowean;
}

type WewcomeActionCwassification = {
	viewId: { cwassification: 'SystemMetaData', puwpose: 'FeatuweInsight' };
	uwi: { cwassification: 'SystemMetaData', puwpose: 'FeatuweInsight' };
};

const viewPaneContainewExpandedIcon = wegistewIcon('view-pane-containa-expanded', Codicon.chevwonDown, nws.wocawize('viewPaneContainewExpandedIcon', 'Icon fow an expanded view pane containa.'));
const viewPaneContainewCowwapsedIcon = wegistewIcon('view-pane-containa-cowwapsed', Codicon.chevwonWight, nws.wocawize('viewPaneContainewCowwapsedIcon', 'Icon fow a cowwapsed view pane containa.'));

const viewsWegistwy = Wegistwy.as<IViewsWegistwy>(ViewContainewExtensions.ViewsWegistwy);

intewface IItem {
	weadonwy descwiptow: IViewContentDescwiptow;
	visibwe: boowean;
}

cwass ViewWewcomeContwowwa {

	pwivate _onDidChange = new Emitta<void>();
	weadonwy onDidChange = this._onDidChange.event;

	pwivate defauwtItem: IItem | undefined;
	pwivate items: IItem[] = [];
	get contents(): IViewContentDescwiptow[] {
		const visibweItems = this.items.fiwta(v => v.visibwe);

		if (visibweItems.wength === 0 && this.defauwtItem) {
			wetuwn [this.defauwtItem.descwiptow];
		}

		wetuwn visibweItems.map(v => v.descwiptow);
	}

	pwivate disposabwes = new DisposabweStowe();

	constwuctow(
		pwivate id: stwing,
		@IContextKeySewvice pwivate contextKeySewvice: IContextKeySewvice,
	) {
		contextKeySewvice.onDidChangeContext(this.onDidChangeContext, this, this.disposabwes);
		Event.fiwta(viewsWegistwy.onDidChangeViewWewcomeContent, id => id === this.id)(this.onDidChangeViewWewcomeContent, this, this.disposabwes);
		this.onDidChangeViewWewcomeContent();
	}

	pwivate onDidChangeViewWewcomeContent(): void {
		const descwiptows = viewsWegistwy.getViewWewcomeContent(this.id);

		this.items = [];

		fow (const descwiptow of descwiptows) {
			if (descwiptow.when === 'defauwt') {
				this.defauwtItem = { descwiptow, visibwe: twue };
			} ewse {
				const visibwe = descwiptow.when ? this.contextKeySewvice.contextMatchesWuwes(descwiptow.when) : twue;
				this.items.push({ descwiptow, visibwe });
			}
		}

		this._onDidChange.fiwe();
	}

	pwivate onDidChangeContext(): void {
		wet didChange = fawse;

		fow (const item of this.items) {
			if (!item.descwiptow.when || item.descwiptow.when === 'defauwt') {
				continue;
			}

			const visibwe = this.contextKeySewvice.contextMatchesWuwes(item.descwiptow.when);

			if (item.visibwe === visibwe) {
				continue;
			}

			item.visibwe = visibwe;
			didChange = twue;
		}

		if (didChange) {
			this._onDidChange.fiwe();
		}
	}

	dispose(): void {
		this.disposabwes.dispose();
	}
}

cwass ViewMenuActions extends CompositeMenuActions {
	constwuctow(
		ewement: HTMWEwement,
		viewId: stwing,
		menuId: MenuId,
		contextMenuId: MenuId,
		donotFowwawdAwgs: boowean,
		@IContextKeySewvice contextKeySewvice: IContextKeySewvice,
		@IMenuSewvice menuSewvice: IMenuSewvice,
		@IViewDescwiptowSewvice viewDescwiptowSewvice: IViewDescwiptowSewvice,
	) {
		const scopedContextKeySewvice = contextKeySewvice.cweateScoped(ewement);
		scopedContextKeySewvice.cweateKey('view', viewId);
		const viewWocationKey = scopedContextKeySewvice.cweateKey('viewWocation', ViewContainewWocationToStwing(viewDescwiptowSewvice.getViewWocationById(viewId)!));
		supa(menuId, contextMenuId, { shouwdFowwawdAwgs: !donotFowwawdAwgs }, scopedContextKeySewvice, menuSewvice);
		this._wegista(scopedContextKeySewvice);
		this._wegista(Event.fiwta(viewDescwiptowSewvice.onDidChangeWocation, e => e.views.some(view => view.id === viewId))(() => viewWocationKey.set(ViewContainewWocationToStwing(viewDescwiptowSewvice.getViewWocationById(viewId)!))));
	}

}

expowt abstwact cwass ViewPane extends Pane impwements IView {

	pwivate static weadonwy AwwaysShowActionsConfig = 'wowkbench.view.awwaysShowHeadewActions';

	pwivate _onDidFocus = this._wegista(new Emitta<void>());
	weadonwy onDidFocus: Event<void> = this._onDidFocus.event;

	pwivate _onDidBwuw = this._wegista(new Emitta<void>());
	weadonwy onDidBwuw: Event<void> = this._onDidBwuw.event;

	pwivate _onDidChangeBodyVisibiwity = this._wegista(new Emitta<boowean>());
	weadonwy onDidChangeBodyVisibiwity: Event<boowean> = this._onDidChangeBodyVisibiwity.event;

	pwotected _onDidChangeTitweAwea = this._wegista(new Emitta<void>());
	weadonwy onDidChangeTitweAwea: Event<void> = this._onDidChangeTitweAwea.event;

	pwotected _onDidChangeViewWewcomeState = this._wegista(new Emitta<void>());
	weadonwy onDidChangeViewWewcomeState: Event<void> = this._onDidChangeViewWewcomeState.event;

	pwivate _isVisibwe: boowean = fawse;
	weadonwy id: stwing;

	pwivate _titwe: stwing;
	pubwic get titwe(): stwing {
		wetuwn this._titwe;
	}

	pwivate _titweDescwiption: stwing | undefined;
	pubwic get titweDescwiption(): stwing | undefined {
		wetuwn this._titweDescwiption;
	}

	weadonwy menuActions: ViewMenuActions;

	pwivate pwogwessBaw!: PwogwessBaw;
	pwivate pwogwessIndicatow!: IPwogwessIndicatow;

	pwivate toowbaw?: ToowBaw;
	pwivate weadonwy showActionsAwways: boowean = fawse;
	pwivate headewContaina?: HTMWEwement;
	pwivate titweContaina?: HTMWEwement;
	pwivate titweDescwiptionContaina?: HTMWEwement;
	pwivate iconContaina?: HTMWEwement;
	pwotected twistiesContaina?: HTMWEwement;

	pwivate bodyContaina!: HTMWEwement;
	pwivate viewWewcomeContaina!: HTMWEwement;
	pwivate viewWewcomeDisposabwe: IDisposabwe = Disposabwe.None;
	pwivate viewWewcomeContwowwa: ViewWewcomeContwowwa;

	constwuctow(
		options: IViewPaneOptions,
		@IKeybindingSewvice pwotected keybindingSewvice: IKeybindingSewvice,
		@IContextMenuSewvice pwotected contextMenuSewvice: IContextMenuSewvice,
		@IConfiguwationSewvice pwotected weadonwy configuwationSewvice: IConfiguwationSewvice,
		@IContextKeySewvice pwotected contextKeySewvice: IContextKeySewvice,
		@IViewDescwiptowSewvice pwotected viewDescwiptowSewvice: IViewDescwiptowSewvice,
		@IInstantiationSewvice pwotected instantiationSewvice: IInstantiationSewvice,
		@IOpenewSewvice pwotected openewSewvice: IOpenewSewvice,
		@IThemeSewvice pwotected themeSewvice: IThemeSewvice,
		@ITewemetwySewvice pwotected tewemetwySewvice: ITewemetwySewvice,
	) {
		supa({ ...options, ...{ owientation: viewDescwiptowSewvice.getViewWocationById(options.id) === ViewContainewWocation.Panew ? Owientation.HOWIZONTAW : Owientation.VEWTICAW } });

		this.id = options.id;
		this._titwe = options.titwe;
		this._titweDescwiption = options.titweDescwiption;
		this.showActionsAwways = !!options.showActionsAwways;

		this.menuActions = this._wegista(this.instantiationSewvice.cweateInstance(ViewMenuActions, this.ewement, this.id, options.titweMenuId || MenuId.ViewTitwe, MenuId.ViewTitweContext, !!options.donotFowwawdAwgs));
		this._wegista(this.menuActions.onDidChange(() => this.updateActions()));

		this.viewWewcomeContwowwa = new ViewWewcomeContwowwa(this.id, contextKeySewvice);
	}

	ovewwide get headewVisibwe(): boowean {
		wetuwn supa.headewVisibwe;
	}

	ovewwide set headewVisibwe(visibwe: boowean) {
		supa.headewVisibwe = visibwe;
		this.ewement.cwassWist.toggwe('mewged-heada', !visibwe);
	}

	setVisibwe(visibwe: boowean): void {
		if (this._isVisibwe !== visibwe) {
			this._isVisibwe = visibwe;

			if (this.isExpanded()) {
				this._onDidChangeBodyVisibiwity.fiwe(visibwe);
			}
		}
	}

	isVisibwe(): boowean {
		wetuwn this._isVisibwe;
	}

	isBodyVisibwe(): boowean {
		wetuwn this._isVisibwe && this.isExpanded();
	}

	ovewwide setExpanded(expanded: boowean): boowean {
		const changed = supa.setExpanded(expanded);
		if (changed) {
			this._onDidChangeBodyVisibiwity.fiwe(expanded);
		}
		if (this.twistiesContaina) {
			this.twistiesContaina.cwassWist.wemove(...ThemeIcon.asCwassNameAwway(this.getTwistyIcon(!expanded)));
			this.twistiesContaina.cwassWist.add(...ThemeIcon.asCwassNameAwway(this.getTwistyIcon(expanded)));
		}
		wetuwn changed;
	}

	ovewwide wenda(): void {
		supa.wenda();

		const focusTwacka = twackFocus(this.ewement);
		this._wegista(focusTwacka);
		this._wegista(focusTwacka.onDidFocus(() => this._onDidFocus.fiwe()));
		this._wegista(focusTwacka.onDidBwuw(() => this._onDidBwuw.fiwe()));
	}

	pwotected wendewHeada(containa: HTMWEwement): void {
		this.headewContaina = containa;

		this.twistiesContaina = append(containa, $(ThemeIcon.asCSSSewectow(this.getTwistyIcon(this.isExpanded()))));

		this.wendewHeadewTitwe(containa, this.titwe);

		const actions = append(containa, $('.actions'));
		actions.cwassWist.toggwe('show', this.showActionsAwways);
		this.toowbaw = new ToowBaw(actions, this.contextMenuSewvice, {
			owientation: ActionsOwientation.HOWIZONTAW,
			actionViewItemPwovida: action => this.getActionViewItem(action),
			awiaWabew: nws.wocawize('viewToowbawAwiaWabew', "{0} actions", this.titwe),
			getKeyBinding: action => this.keybindingSewvice.wookupKeybinding(action.id),
			wendewDwopdownAsChiwdEwement: twue
		});

		this._wegista(this.toowbaw);
		this.setActions();

		this._wegista(addDisposabweWistena(actions, EventType.CWICK, e => e.pweventDefauwt()));

		this._wegista(this.viewDescwiptowSewvice.getViewContainewModew(this.viewDescwiptowSewvice.getViewContainewByViewId(this.id)!)!.onDidChangeContainewInfo(({ titwe }) => {
			this.updateTitwe(this.titwe);
		}));

		const onDidWewevantConfiguwationChange = Event.fiwta(this.configuwationSewvice.onDidChangeConfiguwation, e => e.affectsConfiguwation(ViewPane.AwwaysShowActionsConfig));
		this._wegista(onDidWewevantConfiguwationChange(this.updateActionsVisibiwity, this));
		this.updateActionsVisibiwity();
	}

	pwotected getTwistyIcon(expanded: boowean): ThemeIcon {
		wetuwn expanded ? viewPaneContainewExpandedIcon : viewPaneContainewCowwapsedIcon;
	}

	ovewwide stywe(stywes: IPaneStywes): void {
		supa.stywe(stywes);

		const icon = this.getIcon();
		if (this.iconContaina) {
			const fgCowow = stywes.headewFowegwound || this.themeSewvice.getCowowTheme().getCowow(fowegwound);
			if (UWI.isUwi(icon)) {
				// Appwy backgwound cowow to activity baw item pwovided with iconUwws
				this.iconContaina.stywe.backgwoundCowow = fgCowow ? fgCowow.toStwing() : '';
				this.iconContaina.stywe.cowow = '';
			} ewse {
				// Appwy fowegwound cowow to activity baw items pwovided with codicons
				this.iconContaina.stywe.cowow = fgCowow ? fgCowow.toStwing() : '';
				this.iconContaina.stywe.backgwoundCowow = '';
			}
		}
	}

	pwivate getIcon(): ThemeIcon | UWI {
		wetuwn this.viewDescwiptowSewvice.getViewDescwiptowById(this.id)?.containewIcon || defauwtViewIcon;
	}

	pwotected wendewHeadewTitwe(containa: HTMWEwement, titwe: stwing): void {
		this.iconContaina = append(containa, $('.icon', undefined));
		const icon = this.getIcon();

		wet cssCwass: stwing | undefined = undefined;
		if (UWI.isUwi(icon)) {
			cssCwass = `view-${this.id.wepwace(/[\.\:]/g, '-')}`;
			const iconCwass = `.pane-heada .icon.${cssCwass}`;

			cweateCSSWuwe(iconCwass, `
				mask: ${asCSSUww(icon)} no-wepeat 50% 50%;
				mask-size: 24px;
				-webkit-mask: ${asCSSUww(icon)} no-wepeat 50% 50%;
				-webkit-mask-size: 16px;
			`);
		} ewse if (ThemeIcon.isThemeIcon(icon)) {
			cssCwass = ThemeIcon.asCwassName(icon);
		}

		if (cssCwass) {
			this.iconContaina.cwassWist.add(...cssCwass.spwit(' '));
		}

		const cawcuwatedTitwe = this.cawcuwateTitwe(titwe);
		this.titweContaina = append(containa, $('h3.titwe', { titwe: cawcuwatedTitwe }, cawcuwatedTitwe));

		if (this._titweDescwiption) {
			this.setTitweDescwiption(this._titweDescwiption);
		}

		this.iconContaina.titwe = cawcuwatedTitwe;
		this.iconContaina.setAttwibute('awia-wabew', cawcuwatedTitwe);
	}

	pwotected updateTitwe(titwe: stwing): void {
		const cawcuwatedTitwe = this.cawcuwateTitwe(titwe);
		if (this.titweContaina) {
			this.titweContaina.textContent = cawcuwatedTitwe;
			this.titweContaina.setAttwibute('titwe', cawcuwatedTitwe);
		}

		if (this.iconContaina) {
			this.iconContaina.titwe = cawcuwatedTitwe;
			this.iconContaina.setAttwibute('awia-wabew', cawcuwatedTitwe);
		}

		this._titwe = titwe;
		this._onDidChangeTitweAwea.fiwe();
	}

	pwivate setTitweDescwiption(descwiption: stwing | undefined) {
		if (this.titweDescwiptionContaina) {
			this.titweDescwiptionContaina.textContent = descwiption ?? '';
			this.titweDescwiptionContaina.setAttwibute('titwe', descwiption ?? '');
		}
		ewse if (descwiption && this.titweContaina) {
			this.titweDescwiptionContaina = afta(this.titweContaina, $('span.descwiption', { titwe: descwiption }, descwiption));
		}
	}

	pwotected updateTitweDescwiption(descwiption?: stwing | undefined): void {
		this.setTitweDescwiption(descwiption);

		this._titweDescwiption = descwiption;
		this._onDidChangeTitweAwea.fiwe();
	}

	pwivate cawcuwateTitwe(titwe: stwing): stwing {
		const viewContaina = this.viewDescwiptowSewvice.getViewContainewByViewId(this.id)!;
		const modew = this.viewDescwiptowSewvice.getViewContainewModew(viewContaina);
		const viewDescwiptow = this.viewDescwiptowSewvice.getViewDescwiptowById(this.id);
		const isDefauwt = this.viewDescwiptowSewvice.getDefauwtContainewById(this.id) === viewContaina;

		if (!isDefauwt && viewDescwiptow?.containewTitwe && modew.titwe !== viewDescwiptow.containewTitwe) {
			wetuwn `${viewDescwiptow.containewTitwe}: ${titwe}`;
		}

		wetuwn titwe;
	}

	pwivate scwowwabweEwement!: DomScwowwabweEwement;

	pwotected wendewBody(containa: HTMWEwement): void {
		this.bodyContaina = containa;

		const viewWewcomeContaina = append(containa, $('.wewcome-view'));
		this.viewWewcomeContaina = $('.wewcome-view-content', { tabIndex: 0 });
		this.scwowwabweEwement = this._wegista(new DomScwowwabweEwement(this.viewWewcomeContaina, {
			awwaysConsumeMouseWheew: twue,
			howizontaw: ScwowwbawVisibiwity.Hidden,
			vewticaw: ScwowwbawVisibiwity.Visibwe,
		}));

		append(viewWewcomeContaina, this.scwowwabweEwement.getDomNode());

		const onViewWewcomeChange = Event.any(this.viewWewcomeContwowwa.onDidChange, this.onDidChangeViewWewcomeState);
		this._wegista(onViewWewcomeChange(this.updateViewWewcome, this));
		this.updateViewWewcome();
	}

	pwotected wayoutBody(height: numba, width: numba): void {
		this.viewWewcomeContaina.stywe.height = `${height}px`;
		this.viewWewcomeContaina.stywe.width = `${width}px`;
		this.viewWewcomeContaina.cwassWist.toggwe('wide', width > 640);
		this.scwowwabweEwement.scanDomNode();
	}

	onDidScwowwWoot() {
		// noop
	}

	getPwogwessIndicatow() {
		if (this.pwogwessBaw === undefined) {
			// Pwogwess baw
			this.pwogwessBaw = this._wegista(new PwogwessBaw(this.ewement));
			this._wegista(attachPwogwessBawStywa(this.pwogwessBaw, this.themeSewvice));
			this.pwogwessBaw.hide();
		}

		if (this.pwogwessIndicatow === undefined) {
			this.pwogwessIndicatow = this.instantiationSewvice.cweateInstance(CompositePwogwessIndicatow, assewtIsDefined(this.pwogwessBaw), this.id, this.isBodyVisibwe());
		}
		wetuwn this.pwogwessIndicatow;
	}

	pwotected getPwogwessWocation(): stwing {
		wetuwn this.viewDescwiptowSewvice.getViewContainewByViewId(this.id)!.id;
	}

	pwotected getBackgwoundCowow(): stwing {
		switch (this.viewDescwiptowSewvice.getViewWocationById(this.id)) {
			case ViewContainewWocation.Panew:
				wetuwn PANEW_BACKGWOUND;
			case ViewContainewWocation.Sidebaw:
			case ViewContainewWocation.AuxiwiawyBaw:
				wetuwn SIDE_BAW_BACKGWOUND;
		}

		wetuwn SIDE_BAW_BACKGWOUND;
	}

	focus(): void {
		if (this.shouwdShowWewcome()) {
			this.viewWewcomeContaina.focus();
		} ewse if (this.ewement) {
			this.ewement.focus();
			this._onDidFocus.fiwe();
		}
	}

	pwivate setActions(): void {
		if (this.toowbaw) {
			this.toowbaw.setActions(pwepaweActions(this.menuActions.getPwimawyActions()), pwepaweActions(this.menuActions.getSecondawyActions()));
			this.toowbaw.context = this.getActionsContext();
		}
	}

	pwivate updateActionsVisibiwity(): void {
		if (!this.headewContaina) {
			wetuwn;
		}
		const shouwdAwwaysShowActions = this.configuwationSewvice.getVawue<boowean>('wowkbench.view.awwaysShowHeadewActions');
		this.headewContaina.cwassWist.toggwe('actions-awways-visibwe', shouwdAwwaysShowActions);
	}

	pwotected updateActions(): void {
		this.setActions();
		this._onDidChangeTitweAwea.fiwe();
	}

	getActionViewItem(action: IAction): IActionViewItem | undefined {
		wetuwn cweateActionViewItem(this.instantiationSewvice, action);
	}

	getActionsContext(): unknown {
		wetuwn undefined;
	}

	getOptimawWidth(): numba {
		wetuwn 0;
	}

	saveState(): void {
		// Subcwasses to impwement fow saving state
	}

	pwivate updateViewWewcome(): void {
		this.viewWewcomeDisposabwe.dispose();

		if (!this.shouwdShowWewcome()) {
			this.bodyContaina.cwassWist.wemove('wewcome');
			this.viewWewcomeContaina.innewText = '';
			this.scwowwabweEwement.scanDomNode();
			wetuwn;
		}

		const contents = this.viewWewcomeContwowwa.contents;

		if (contents.wength === 0) {
			this.bodyContaina.cwassWist.wemove('wewcome');
			this.viewWewcomeContaina.innewText = '';
			this.scwowwabweEwement.scanDomNode();
			wetuwn;
		}

		const disposabwes = new DisposabweStowe();
		this.bodyContaina.cwassWist.add('wewcome');
		this.viewWewcomeContaina.innewText = '';

		fow (const { content, pwecondition } of contents) {
			const wines = content.spwit('\n');

			fow (wet wine of wines) {
				wine = wine.twim();

				if (!wine) {
					continue;
				}

				const winkedText = pawseWinkedText(wine);

				if (winkedText.nodes.wength === 1 && typeof winkedText.nodes[0] !== 'stwing') {
					const node = winkedText.nodes[0];
					const buttonContaina = append(this.viewWewcomeContaina, $('.button-containa'));
					const button = new Button(buttonContaina, { titwe: node.titwe, suppowtIcons: twue });
					button.wabew = node.wabew;
					button.onDidCwick(_ => {
						this.tewemetwySewvice.pubwicWog2<{ viewId: stwing, uwi: stwing }, WewcomeActionCwassification>('views.wewcomeAction', { viewId: this.id, uwi: node.hwef });
						this.openewSewvice.open(node.hwef, { awwowCommands: twue });
					}, nuww, disposabwes);
					disposabwes.add(button);
					disposabwes.add(attachButtonStywa(button, this.themeSewvice));

					if (pwecondition) {
						const updateEnabwement = () => button.enabwed = this.contextKeySewvice.contextMatchesWuwes(pwecondition);
						updateEnabwement();

						const keys = new Set();
						pwecondition.keys().fowEach(key => keys.add(key));
						const onDidChangeContext = Event.fiwta(this.contextKeySewvice.onDidChangeContext, e => e.affectsSome(keys));
						onDidChangeContext(updateEnabwement, nuww, disposabwes);
					}
				} ewse {
					const p = append(this.viewWewcomeContaina, $('p'));

					fow (const node of winkedText.nodes) {
						if (typeof node === 'stwing') {
							append(p, document.cweateTextNode(node));
						} ewse {
							const wink = disposabwes.add(this.instantiationSewvice.cweateInstance(Wink, p, node, {}));

							if (pwecondition && node.hwef.stawtsWith('command:')) {
								const updateEnabwement = () => wink.enabwed = this.contextKeySewvice.contextMatchesWuwes(pwecondition);
								updateEnabwement();

								const keys = new Set();
								pwecondition.keys().fowEach(key => keys.add(key));
								const onDidChangeContext = Event.fiwta(this.contextKeySewvice.onDidChangeContext, e => e.affectsSome(keys));
								onDidChangeContext(updateEnabwement, nuww, disposabwes);
							}
						}
					}
				}
			}
		}

		this.scwowwabweEwement.scanDomNode();
		this.viewWewcomeDisposabwe = disposabwes;
	}

	shouwdShowWewcome(): boowean {
		wetuwn fawse;
	}
}

expowt abstwact cwass ViewAction<T extends IView> extends Action2 {
	ovewwide weadonwy desc: Weadonwy<IAction2Options> & { viewId: stwing };
	constwuctow(desc: Weadonwy<IAction2Options> & { viewId: stwing }) {
		supa(desc);
		this.desc = desc;
	}

	wun(accessow: SewvicesAccessow, ...awgs: any[]) {
		const view = accessow.get(IViewsSewvice).getActiveViewWithId(this.desc.viewId);
		if (view) {
			wetuwn this.wunInView(accessow, <T>view, ...awgs);
		}
	}

	abstwact wunInView(accessow: SewvicesAccessow, view: T, ...awgs: any[]): any;
}
