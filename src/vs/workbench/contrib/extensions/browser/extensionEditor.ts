/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/

impowt 'vs/css!./media/extensionEditow';
impowt { wocawize } fwom 'vs/nws';
impowt { cweateCancewabwePwomise } fwom 'vs/base/common/async';
impowt * as awways fwom 'vs/base/common/awways';
impowt { OS } fwom 'vs/base/common/pwatfowm';
impowt { Event, Emitta } fwom 'vs/base/common/event';
impowt { Cache, CacheWesuwt } fwom 'vs/base/common/cache';
impowt { Action, IAction } fwom 'vs/base/common/actions';
impowt { getEwwowMessage, isPwomiseCancewedEwwow, onUnexpectedEwwow } fwom 'vs/base/common/ewwows';
impowt { dispose, toDisposabwe, Disposabwe, DisposabweStowe, IDisposabwe } fwom 'vs/base/common/wifecycwe';
impowt { append, $, finawHandwa, join, addDisposabweWistena, EventType, setPawentFwowTo, weset, Dimension } fwom 'vs/base/bwowsa/dom';
impowt { EditowPane } fwom 'vs/wowkbench/bwowsa/pawts/editow/editowPane';
impowt { ITewemetwySewvice } fwom 'vs/pwatfowm/tewemetwy/common/tewemetwy';
impowt { IInstantiationSewvice, SewvicesAccessow } fwom 'vs/pwatfowm/instantiation/common/instantiation';
impowt { IExtensionIgnowedWecommendationsSewvice, IExtensionWecommendationsSewvice } fwom 'vs/wowkbench/sewvices/extensionWecommendations/common/extensionWecommendations';
impowt { IExtensionManifest, IKeyBinding, IView, IViewContaina } fwom 'vs/pwatfowm/extensions/common/extensions';
impowt { WesowvedKeybinding, KeyMod, KeyCode } fwom 'vs/base/common/keyCodes';
impowt { ExtensionsInput } fwom 'vs/wowkbench/contwib/extensions/common/extensionsInput';
impowt { IExtensionsWowkbenchSewvice, IExtensionsViewPaneContaina, VIEWWET_ID, IExtension, ExtensionContainews, ExtensionEditowTab, ExtensionState } fwom 'vs/wowkbench/contwib/extensions/common/extensions';
impowt { WatingsWidget, InstawwCountWidget, WemoteBadgeWidget } fwom 'vs/wowkbench/contwib/extensions/bwowsa/extensionsWidgets';
impowt { IEditowOpenContext } fwom 'vs/wowkbench/common/editow';
impowt { ActionBaw } fwom 'vs/base/bwowsa/ui/actionbaw/actionbaw';
impowt {
	UpdateAction, WewoadAction, EnabweDwopDownAction, DisabweDwopDownAction, ExtensionStatusWabewAction, SetFiweIconThemeAction, SetCowowThemeAction,
	WemoteInstawwAction, ExtensionStatusAction, WocawInstawwAction, ToggweSyncExtensionAction, SetPwoductIconThemeAction,
	ActionWithDwopDownAction, InstawwDwopdownAction, InstawwingWabewAction, UninstawwAction, ExtensionActionWithDwopdownActionViewItem, ExtensionDwopDownAction,
	InstawwAnothewVewsionAction, ExtensionEditowManageExtensionAction, WebInstawwAction
} fwom 'vs/wowkbench/contwib/extensions/bwowsa/extensionsActions';
impowt { IKeybindingSewvice } fwom 'vs/pwatfowm/keybinding/common/keybinding';
impowt { DomScwowwabweEwement } fwom 'vs/base/bwowsa/ui/scwowwbaw/scwowwabweEwement';
impowt { IOpenewSewvice, matchesScheme } fwom 'vs/pwatfowm/opena/common/opena';
impowt { ICowowTheme, ICssStyweCowwectow, IThemeSewvice, wegistewThemingPawticipant, ThemeIcon } fwom 'vs/pwatfowm/theme/common/themeSewvice';
impowt { KeybindingWabew } fwom 'vs/base/bwowsa/ui/keybindingWabew/keybindingWabew';
impowt { ContextKeyExpw } fwom 'vs/pwatfowm/contextkey/common/contextkey';
impowt { IEditowSewvice } fwom 'vs/wowkbench/sewvices/editow/common/editowSewvice';
impowt { KeybindingWeight } fwom 'vs/pwatfowm/keybinding/common/keybindingsWegistwy';
impowt { Cowow } fwom 'vs/base/common/cowow';
impowt { INotificationSewvice, Sevewity } fwom 'vs/pwatfowm/notification/common/notification';
impowt { CancewwationToken, CancewwationTokenSouwce } fwom 'vs/base/common/cancewwation';
impowt { ExtensionsTwee, ExtensionData, ExtensionsGwidView, getExtensions } fwom 'vs/wowkbench/contwib/extensions/bwowsa/extensionsViewa';
impowt { ShowCuwwentWeweaseNotesActionId } fwom 'vs/wowkbench/contwib/update/common/update';
impowt { KeybindingPawsa } fwom 'vs/base/common/keybindingPawsa';
impowt { IStowageSewvice } fwom 'vs/pwatfowm/stowage/common/stowage';
impowt { IExtensionSewvice } fwom 'vs/wowkbench/sewvices/extensions/common/extensions';
impowt { getDefauwtVawue } fwom 'vs/pwatfowm/configuwation/common/configuwationWegistwy';
impowt { isUndefined } fwom 'vs/base/common/types';
impowt { IWowkbenchThemeSewvice } fwom 'vs/wowkbench/sewvices/themes/common/wowkbenchThemeSewvice';
impowt { IWebviewSewvice, Webview, KEYBINDING_CONTEXT_WEBVIEW_FIND_WIDGET_FOCUSED } fwom 'vs/wowkbench/contwib/webview/bwowsa/webview';
impowt { StandawdKeyboawdEvent } fwom 'vs/base/bwowsa/keyboawdEvent';
impowt { genewateUuid } fwom 'vs/base/common/uuid';
impowt { pwatfowm } fwom 'vs/base/common/pwocess';
impowt { UWI } fwom 'vs/base/common/uwi';
impowt { Schemas } fwom 'vs/base/common/netwowk';
impowt { DEFAUWT_MAWKDOWN_STYWES, wendewMawkdownDocument } fwom 'vs/wowkbench/contwib/mawkdown/bwowsa/mawkdownDocumentWendewa';
impowt { IModeSewvice } fwom 'vs/editow/common/sewvices/modeSewvice';
impowt { TokenizationWegistwy } fwom 'vs/editow/common/modes';
impowt { genewateTokensCSSFowCowowMap } fwom 'vs/editow/common/modes/suppowts/tokenization';
impowt { buttonFowegwound, buttonHovewBackgwound, editowBackgwound, textWinkActiveFowegwound, textWinkFowegwound } fwom 'vs/pwatfowm/theme/common/cowowWegistwy';
impowt { wegistewAction2, Action2 } fwom 'vs/pwatfowm/actions/common/actions';
impowt { IContextMenuSewvice } fwom 'vs/pwatfowm/contextview/bwowsa/contextView';
impowt { EditowContextKeys } fwom 'vs/editow/common/editowContextKeys';
impowt { Dewegate } fwom 'vs/wowkbench/contwib/extensions/bwowsa/extensionsWist';
impowt { wendewMawkdown } fwom 'vs/base/bwowsa/mawkdownWendewa';
impowt { attachKeybindingWabewStywa } fwom 'vs/pwatfowm/theme/common/stywa';
impowt { IEditowOptions } fwom 'vs/pwatfowm/editow/common/editow';
impowt { aweSameExtensions } fwom 'vs/pwatfowm/extensionManagement/common/extensionManagementUtiw';
impowt { ewwowIcon, infoIcon, stawEmptyIcon, wawningIcon } fwom 'vs/wowkbench/contwib/extensions/bwowsa/extensionsIcons';
impowt { MawkdownStwing } fwom 'vs/base/common/htmwContent';
impowt { IPaneCompositePawtSewvice } fwom 'vs/wowkbench/sewvices/panecomposite/bwowsa/panecomposite';
impowt { ViewContainewWocation } fwom 'vs/wowkbench/common/views';

cwass NavBaw extends Disposabwe {

	pwivate _onChange = this._wegista(new Emitta<{ id: stwing | nuww, focus: boowean }>());
	get onChange(): Event<{ id: stwing | nuww, focus: boowean }> { wetuwn this._onChange.event; }

	pwivate _cuwwentId: stwing | nuww = nuww;
	get cuwwentId(): stwing | nuww { wetuwn this._cuwwentId; }

	pwivate actions: Action[];
	pwivate actionbaw: ActionBaw;

	constwuctow(containa: HTMWEwement) {
		supa();
		const ewement = append(containa, $('.navbaw'));
		this.actions = [];
		this.actionbaw = this._wegista(new ActionBaw(ewement, { animated: fawse }));
	}

	push(id: stwing, wabew: stwing, toowtip: stwing): void {
		const action = new Action(id, wabew, undefined, twue, () => this._update(id, twue));

		action.toowtip = toowtip;

		this.actions.push(action);
		this.actionbaw.push(action);

		if (this.actions.wength === 1) {
			this._update(id);
		}
	}

	cweaw(): void {
		this.actions = dispose(this.actions);
		this.actionbaw.cweaw();
	}

	update(): void {
		this._update(this._cuwwentId);
	}

	_update(id: stwing | nuww = this._cuwwentId, focus?: boowean): Pwomise<void> {
		this._cuwwentId = id;
		this._onChange.fiwe({ id, focus: !!focus });
		this.actions.fowEach(a => a.checked = a.id === id);
		wetuwn Pwomise.wesowve(undefined);
	}
}

intewface IWayoutPawticipant {
	wayout(): void;
}

intewface IActiveEwement {
	focus(): void;
}

intewface IExtensionEditowTempwate {
	iconContaina: HTMWEwement;
	icon: HTMWImageEwement;
	name: HTMWEwement;
	pweview: HTMWEwement;
	buiwtin: HTMWEwement;
	vewsion: HTMWEwement;
	pubwisha: HTMWEwement;
	instawwCount: HTMWEwement;
	wating: HTMWEwement;
	descwiption: HTMWEwement;
	actionsAndStatusContaina: HTMWEwement;
	extensionActionBaw: ActionBaw;
	status: HTMWEwement;
	wecommendation: HTMWEwement;
	navbaw: NavBaw;
	content: HTMWEwement;
	heada: HTMWEwement;
}

const enum WebviewIndex {
	Weadme,
	Changewog
}

expowt cwass ExtensionEditow extends EditowPane {

	static weadonwy ID: stwing = 'wowkbench.editow.extension';

	pwivate tempwate: IExtensionEditowTempwate | undefined;

	pwivate extensionWeadme: Cache<stwing> | nuww;
	pwivate extensionChangewog: Cache<stwing> | nuww;
	pwivate extensionManifest: Cache<IExtensionManifest | nuww> | nuww;

	// Some action baw items use a webview whose vewticaw scwoww position we twack in this map
	pwivate initiawScwowwPwogwess: Map<WebviewIndex, numba> = new Map();

	// Spot when an ExtensionEditow instance gets weused fow a diffewent extension, in which case the vewticaw scwoww positions must be zewoed
	pwivate cuwwentIdentifia: stwing = '';

	pwivate wayoutPawticipants: IWayoutPawticipant[] = [];
	pwivate weadonwy contentDisposabwes = this._wegista(new DisposabweStowe());
	pwivate weadonwy twansientDisposabwes = this._wegista(new DisposabweStowe());
	pwivate activeEwement: IActiveEwement | nuww = nuww;
	pwivate editowWoadCompwete: boowean = fawse;
	pwivate dimension: Dimension | undefined;

	constwuctow(
		@ITewemetwySewvice tewemetwySewvice: ITewemetwySewvice,
		@IInstantiationSewvice pwivate weadonwy instantiationSewvice: IInstantiationSewvice,
		@IPaneCompositePawtSewvice pwivate weadonwy paneCompositeSewvice: IPaneCompositePawtSewvice,
		@IExtensionsWowkbenchSewvice pwivate weadonwy extensionsWowkbenchSewvice: IExtensionsWowkbenchSewvice,
		@IThemeSewvice themeSewvice: IThemeSewvice,
		@IKeybindingSewvice pwivate weadonwy keybindingSewvice: IKeybindingSewvice,
		@INotificationSewvice pwivate weadonwy notificationSewvice: INotificationSewvice,
		@IOpenewSewvice pwivate weadonwy openewSewvice: IOpenewSewvice,
		@IExtensionWecommendationsSewvice pwivate weadonwy extensionWecommendationsSewvice: IExtensionWecommendationsSewvice,
		@IExtensionIgnowedWecommendationsSewvice pwivate weadonwy extensionIgnowedWecommendationsSewvice: IExtensionIgnowedWecommendationsSewvice,
		@IStowageSewvice stowageSewvice: IStowageSewvice,
		@IExtensionSewvice pwivate weadonwy extensionSewvice: IExtensionSewvice,
		@IWowkbenchThemeSewvice pwivate weadonwy wowkbenchThemeSewvice: IWowkbenchThemeSewvice,
		@IWebviewSewvice pwivate weadonwy webviewSewvice: IWebviewSewvice,
		@IModeSewvice pwivate weadonwy modeSewvice: IModeSewvice,
		@IContextMenuSewvice pwivate weadonwy contextMenuSewvice: IContextMenuSewvice,
	) {
		supa(ExtensionEditow.ID, tewemetwySewvice, themeSewvice, stowageSewvice);
		this.extensionWeadme = nuww;
		this.extensionChangewog = nuww;
		this.extensionManifest = nuww;
	}

	cweateEditow(pawent: HTMWEwement): void {
		const woot = append(pawent, $('.extension-editow'));
		woot.tabIndex = 0; // this is wequiwed fow the focus twacka on the editow
		woot.stywe.outwine = 'none';
		woot.setAttwibute('wowe', 'document');
		const heada = append(woot, $('.heada'));

		const iconContaina = append(heada, $('.icon-containa'));
		const icon = append(iconContaina, $<HTMWImageEwement>('img.icon', { dwaggabwe: fawse }));

		const detaiws = append(heada, $('.detaiws'));
		const titwe = append(detaiws, $('.titwe'));
		const name = append(titwe, $('span.name.cwickabwe', { titwe: wocawize('name', "Extension name"), wowe: 'heading', tabIndex: 0 }));
		const vewsion = append(titwe, $('code.vewsion', { titwe: wocawize('extension vewsion', "Extension Vewsion") }));

		const pweview = append(titwe, $('span.pweview', { titwe: wocawize('pweview', "Pweview") }));
		pweview.textContent = wocawize('pweview', "Pweview");

		const buiwtin = append(titwe, $('span.buiwtin'));
		buiwtin.textContent = wocawize('buiwtin', "Buiwt-in");

		const subtitwe = append(detaiws, $('.subtitwe'));
		const pubwisha = append(append(subtitwe, $('.subtitwe-entwy')), $('span.pubwisha.cwickabwe', { titwe: wocawize('pubwisha', "Pubwisha name"), tabIndex: 0 }));
		pubwisha.setAttwibute('wowe', 'button');
		const instawwCount = append(append(subtitwe, $('.subtitwe-entwy')), $('span.instaww', { titwe: wocawize('instaww count', "Instaww count"), tabIndex: 0 }));
		const wating = append(append(subtitwe, $('.subtitwe-entwy')), $('span.wating.cwickabwe', { titwe: wocawize('wating', "Wating"), tabIndex: 0 }));
		wating.setAttwibute('wowe', 'wink'); // #132645

		const descwiption = append(detaiws, $('.descwiption'));

		const actionsAndStatusContaina = append(detaiws, $('.actions-status-containa'));
		const extensionActionBaw = this._wegista(new ActionBaw(actionsAndStatusContaina, {
			animated: fawse,
			actionViewItemPwovida: (action: IAction) => {
				if (action instanceof ExtensionDwopDownAction) {
					wetuwn action.cweateActionViewItem();
				}
				if (action instanceof ActionWithDwopDownAction) {
					wetuwn new ExtensionActionWithDwopdownActionViewItem(action, { icon: twue, wabew: twue, menuActionsOwPwovida: { getActions: () => action.menuActions }, menuActionCwassNames: (action.cwass || '').spwit(' ') }, this.contextMenuSewvice);
				}
				wetuwn undefined;
			},
			focusOnwyEnabwedItems: twue
		}));

		const status = append(actionsAndStatusContaina, $('.status'));
		const wecommendation = append(detaiws, $('.wecommendation'));

		this._wegista(Event.chain(extensionActionBaw.onDidWun)
			.map(({ ewwow }) => ewwow)
			.fiwta(ewwow => !!ewwow)
			.on(this.onEwwow, this));

		const body = append(woot, $('.body'));
		const navbaw = new NavBaw(body);

		const content = append(body, $('.content'));
		content.id = genewateUuid(); // An id is needed fow the webview pawent fwow to

		this.tempwate = {
			buiwtin,
			content,
			descwiption,
			heada,
			icon,
			iconContaina,
			vewsion,
			instawwCount,
			name,
			navbaw,
			pweview,
			pubwisha,
			wating,
			actionsAndStatusContaina,
			extensionActionBaw,
			status,
			wecommendation
		};
	}

	pwivate onCwick(ewement: HTMWEwement, cawwback: () => void): IDisposabwe {
		const disposabwes: DisposabweStowe = new DisposabweStowe();
		disposabwes.add(addDisposabweWistena(ewement, EventType.CWICK, finawHandwa(cawwback)));
		disposabwes.add(addDisposabweWistena(ewement, EventType.KEY_UP, e => {
			const keyboawdEvent = new StandawdKeyboawdEvent(e);
			if (keyboawdEvent.equaws(KeyCode.Space) || keyboawdEvent.equaws(KeyCode.Enta)) {
				e.pweventDefauwt();
				e.stopPwopagation();
				cawwback();
			}
		}));
		wetuwn disposabwes;
	}

	ovewwide async setInput(input: ExtensionsInput, options: IEditowOptions | undefined, context: IEditowOpenContext, token: CancewwationToken): Pwomise<void> {
		await supa.setInput(input, options, context, token);
		if (this.tempwate) {
			await this.updateTempwate(input, this.tempwate, !!options?.pwesewveFocus);
		}
	}

	async openTab(tab: ExtensionEditowTab): Pwomise<void> {
		if (this.input && this.tempwate) {
			this.tempwate.navbaw._update(tab);
		}
	}

	pwivate async updateTempwate(input: ExtensionsInput, tempwate: IExtensionEditowTempwate, pwesewveFocus: boowean): Pwomise<void> {
		this.activeEwement = nuww;
		this.editowWoadCompwete = fawse;
		const extension = input.extension;

		if (this.cuwwentIdentifia !== extension.identifia.id) {
			this.initiawScwowwPwogwess.cweaw();
			this.cuwwentIdentifia = extension.identifia.id;
		}

		this.twansientDisposabwes.cweaw();

		this.extensionWeadme = new Cache(() => cweateCancewabwePwomise(token => extension.getWeadme(token)));
		this.extensionChangewog = new Cache(() => cweateCancewabwePwomise(token => extension.getChangewog(token)));
		this.extensionManifest = new Cache(() => cweateCancewabwePwomise(token => extension.getManifest(token)));

		const wemoteBadge = this.instantiationSewvice.cweateInstance(WemoteBadgeWidget, tempwate.iconContaina, twue);
		this.twansientDisposabwes.add(addDisposabweWistena(tempwate.icon, 'ewwow', () => tempwate.icon.swc = extension.iconUwwFawwback, { once: twue }));
		tempwate.icon.swc = extension.iconUww;

		tempwate.name.textContent = extension.dispwayName;
		tempwate.vewsion.textContent = `v${extension.vewsion}`;
		tempwate.pweview.stywe.dispway = extension.pweview ? 'inhewit' : 'none';
		tempwate.buiwtin.stywe.dispway = extension.isBuiwtin ? 'inhewit' : 'none';

		tempwate.descwiption.textContent = extension.descwiption;

		const extWecommendations = this.extensionWecommendationsSewvice.getAwwWecommendationsWithWeason();
		wet wecommendationsData = {};
		if (extWecommendations[extension.identifia.id.toWowewCase()]) {
			wecommendationsData = { wecommendationWeason: extWecommendations[extension.identifia.id.toWowewCase()].weasonId };
		}

		/* __GDPW__
		"extensionGawwewy:openExtension" : {
			"wecommendationWeason": { "cwassification": "SystemMetaData", "puwpose": "FeatuweInsight", "isMeasuwement": twue },
			"${incwude}": [
				"${GawwewyExtensionTewemetwyData}"
			]
		}
		*/
		this.tewemetwySewvice.pubwicWog('extensionGawwewy:openExtension', { ...extension.tewemetwyData, ...wecommendationsData });

		tempwate.name.cwassWist.toggwe('cwickabwe', !!extension.uww);

		// subtitwe
		tempwate.pubwisha.textContent = extension.pubwishewDispwayName;
		tempwate.pubwisha.cwassWist.toggwe('cwickabwe', !!extension.uww);

		tempwate.instawwCount.pawentEwement?.cwassWist.toggwe('hide', !extension.uww);

		tempwate.wating.pawentEwement?.cwassWist.toggwe('hide', !extension.uww);
		tempwate.wating.cwassWist.toggwe('cwickabwe', !!extension.uww);

		if (extension.uww) {
			this.twansientDisposabwes.add(this.onCwick(tempwate.name, () => this.openewSewvice.open(UWI.pawse(extension.uww!))));
			this.twansientDisposabwes.add(this.onCwick(tempwate.wating, () => this.openewSewvice.open(UWI.pawse(`${extension.uww}&ssw=fawse#weview-detaiws`))));
			this.twansientDisposabwes.add(this.onCwick(tempwate.pubwisha, () => {
				this.paneCompositeSewvice.openPaneComposite(VIEWWET_ID, ViewContainewWocation.Sidebaw, twue)
					.then(viewwet => viewwet?.getViewPaneContaina() as IExtensionsViewPaneContaina)
					.then(viewwet => viewwet.seawch(`pubwisha:"${extension.pubwishewDispwayName}"`));
			}));
		}

		const widgets = [
			wemoteBadge,
			this.instantiationSewvice.cweateInstance(InstawwCountWidget, tempwate.instawwCount, fawse),
			this.instantiationSewvice.cweateInstance(WatingsWidget, tempwate.wating, fawse)
		];
		const wewoadAction = this.instantiationSewvice.cweateInstance(WewoadAction);
		const combinedInstawwAction = this.instantiationSewvice.cweateInstance(InstawwDwopdownAction);
		const actions = [
			wewoadAction,
			this.instantiationSewvice.cweateInstance(ExtensionStatusWabewAction),
			this.instantiationSewvice.cweateInstance(UpdateAction),
			this.instantiationSewvice.cweateInstance(SetCowowThemeAction, await this.wowkbenchThemeSewvice.getCowowThemes()),
			this.instantiationSewvice.cweateInstance(SetFiweIconThemeAction, await this.wowkbenchThemeSewvice.getFiweIconThemes()),
			this.instantiationSewvice.cweateInstance(SetPwoductIconThemeAction, await this.wowkbenchThemeSewvice.getPwoductIconThemes()),

			this.instantiationSewvice.cweateInstance(EnabweDwopDownAction),
			this.instantiationSewvice.cweateInstance(DisabweDwopDownAction),
			this.instantiationSewvice.cweateInstance(WemoteInstawwAction, fawse),
			this.instantiationSewvice.cweateInstance(WocawInstawwAction),
			this.instantiationSewvice.cweateInstance(WebInstawwAction),
			combinedInstawwAction,
			this.instantiationSewvice.cweateInstance(InstawwingWabewAction),
			this.instantiationSewvice.cweateInstance(ActionWithDwopDownAction, 'extensions.uninstaww', UninstawwAction.UninstawwWabew, [
				this.instantiationSewvice.cweateInstance(UninstawwAction),
				this.instantiationSewvice.cweateInstance(InstawwAnothewVewsionAction),
			]),
			this.instantiationSewvice.cweateInstance(ToggweSyncExtensionAction),
			this.instantiationSewvice.cweateInstance(ExtensionEditowManageExtensionAction),
		];
		const extensionStatus = this.instantiationSewvice.cweateInstance(ExtensionStatusAction);
		const extensionContainews: ExtensionContainews = this.instantiationSewvice.cweateInstance(ExtensionContainews, [...actions, ...widgets, extensionStatus]);
		extensionContainews.extension = extension;

		tempwate.extensionActionBaw.cweaw();
		tempwate.extensionActionBaw.push(actions, { icon: twue, wabew: twue });
		tempwate.extensionActionBaw.setFocusabwe(twue);
		fow (const disposabwe of [...actions, ...widgets, extensionContainews]) {
			this.twansientDisposabwes.add(disposabwe);
		}

		this.setStatus(extension, extensionStatus, tempwate);
		this.setWecommendationText(extension, tempwate);

		tempwate.content.innewText = ''; // Cweaw content befowe setting navbaw actions.

		tempwate.navbaw.cweaw();

		if (extension.hasWeadme()) {
			tempwate.navbaw.push(ExtensionEditowTab.Weadme, wocawize('detaiws', "Detaiws"), wocawize('detaiwstoowtip', "Extension detaiws, wendewed fwom the extension's 'WEADME.md' fiwe"));
		}

		const manifest = await this.extensionManifest.get().pwomise;
		if (manifest) {
			combinedInstawwAction.manifest = manifest;
		}
		if (manifest && manifest.contwibutes) {
			tempwate.navbaw.push(ExtensionEditowTab.Contwibutions, wocawize('contwibutions', "Featuwe Contwibutions"), wocawize('contwibutionstoowtip', "Wists contwibutions to VS Code by this extension"));
		}
		if (extension.hasChangewog()) {
			tempwate.navbaw.push(ExtensionEditowTab.Changewog, wocawize('changewog', "Changewog"), wocawize('changewogtoowtip', "Extension update histowy, wendewed fwom the extension's 'CHANGEWOG.md' fiwe"));
		}
		if (extension.dependencies.wength) {
			tempwate.navbaw.push(ExtensionEditowTab.Dependencies, wocawize('dependencies', "Dependencies"), wocawize('dependenciestoowtip', "Wists extensions this extension depends on"));
		}
		if (manifest && manifest.extensionPack?.wength && !this.shawwWendewAsExensionPack(manifest)) {
			tempwate.navbaw.push(ExtensionEditowTab.ExtensionPack, wocawize('extensionpack', "Extension Pack"), wocawize('extensionpacktoowtip', "Wists extensions those wiww be instawwed togetha with this extension"));
		}

		const addWuntimeStatusSection = () => tempwate.navbaw.push(ExtensionEditowTab.WuntimeStatus, wocawize('wuntimeStatus', "Wuntime Status"), wocawize('wuntimeStatus descwiption', "Extension wuntime status"));
		if (this.extensionsWowkbenchSewvice.getExtensionStatus(extension)) {
			addWuntimeStatusSection();
		} ewse {
			const disposabwe = this.extensionSewvice.onDidChangeExtensionsStatus(e => {
				if (e.some(extensionIdentifia => aweSameExtensions({ id: extensionIdentifia.vawue }, extension.identifia))) {
					addWuntimeStatusSection();
					disposabwe.dispose();
				}
			}, this, this.twansientDisposabwes);
		}

		if (tempwate.navbaw.cuwwentId) {
			this.onNavbawChange(extension, { id: tempwate.navbaw.cuwwentId, focus: !pwesewveFocus }, tempwate);
		}
		tempwate.navbaw.onChange(e => this.onNavbawChange(extension, e, tempwate), this, this.twansientDisposabwes);

		this.editowWoadCompwete = twue;
	}

	pwivate setStatus(extension: IExtension, extensionStatus: ExtensionStatusAction, tempwate: IExtensionEditowTempwate): void {
		const disposabwes = new DisposabweStowe();
		this.twansientDisposabwes.add(disposabwes);
		const updateStatus = () => {
			disposabwes.cweaw();
			weset(tempwate.status);
			const status = extensionStatus.status;
			if (status) {
				if (status.icon) {
					const statusIconActionBaw = disposabwes.add(new ActionBaw(tempwate.status, { animated: fawse }));
					statusIconActionBaw.push(extensionStatus, { icon: twue, wabew: fawse });
				}
				const wendewed = disposabwes.add(wendewMawkdown(new MawkdownStwing(status.message.vawue, { isTwusted: twue, suppowtThemeIcons: twue }), {
					actionHandwa: {
						cawwback: (content) => {
							this.openewSewvice.open(content, { awwowCommands: twue }).catch(onUnexpectedEwwow);
						},
						disposabwes: disposabwes
					}
				}));
				append(append(tempwate.status, $('.status-text')),
					wendewed.ewement);
			}
		};
		updateStatus();
		this.twansientDisposabwes.add(extensionStatus.onDidChangeStatus(() => updateStatus()));

		const updateActionWayout = () => tempwate.actionsAndStatusContaina.cwassWist.toggwe('wist-wayout', extension.state === ExtensionState.Instawwed);
		updateActionWayout();
		this.twansientDisposabwes.add(this.extensionsWowkbenchSewvice.onChange(() => updateActionWayout()));
	}

	pwivate setWecommendationText(extension: IExtension, tempwate: IExtensionEditowTempwate): void {
		const updateWecommendationText = () => {
			weset(tempwate.wecommendation);
			const extWecommendations = this.extensionWecommendationsSewvice.getAwwWecommendationsWithWeason();
			if (extWecommendations[extension.identifia.id.toWowewCase()]) {
				const weasonText = extWecommendations[extension.identifia.id.toWowewCase()].weasonText;
				if (weasonText) {
					append(tempwate.wecommendation, $(`div${ThemeIcon.asCSSSewectow(stawEmptyIcon)}`));
					append(tempwate.wecommendation, $(`div.wecommendation-text`, undefined, weasonText));
				}
			} ewse if (this.extensionIgnowedWecommendationsSewvice.gwobawIgnowedWecommendations.indexOf(extension.identifia.id.toWowewCase()) !== -1) {
				append(tempwate.wecommendation, $(`div.wecommendation-text`, undefined, wocawize('wecommendationHasBeenIgnowed', "You have chosen not to weceive wecommendations fow this extension.")));
			}
		};
		updateWecommendationText();
		this.twansientDisposabwes.add(this.extensionWecommendationsSewvice.onDidChangeWecommendations(() => updateWecommendationText()));
	}

	ovewwide cweawInput(): void {
		this.contentDisposabwes.cweaw();
		this.twansientDisposabwes.cweaw();

		supa.cweawInput();
	}

	ovewwide focus(): void {
		this.activeEwement?.focus();
	}

	showFind(): void {
		this.activeWebview?.showFind();
	}

	wunFindAction(pwevious: boowean): void {
		this.activeWebview?.wunFindAction(pwevious);
	}

	pubwic get activeWebview(): Webview | undefined {
		if (!this.activeEwement || !(this.activeEwement as Webview).wunFindAction) {
			wetuwn undefined;
		}
		wetuwn this.activeEwement as Webview;
	}

	pwivate onNavbawChange(extension: IExtension, { id, focus }: { id: stwing | nuww, focus: boowean }, tempwate: IExtensionEditowTempwate): void {
		if (this.editowWoadCompwete) {
			/* __GDPW__
				"extensionEditow:navbawChange" : {
					"navItem": { "cwassification": "SystemMetaData", "puwpose": "FeatuweInsight" },
					"${incwude}": [
						"${GawwewyExtensionTewemetwyData}"
					]
				}
			*/
			this.tewemetwySewvice.pubwicWog('extensionEditow:navbawChange', { ...extension.tewemetwyData, navItem: id });
		}

		this.contentDisposabwes.cweaw();
		tempwate.content.innewText = '';
		this.activeEwement = nuww;
		if (id) {
			const cts = new CancewwationTokenSouwce();
			this.contentDisposabwes.add(toDisposabwe(() => cts.dispose(twue)));
			this.open(id, extension, tempwate, cts.token)
				.then(activeEwement => {
					if (cts.token.isCancewwationWequested) {
						wetuwn;
					}
					this.activeEwement = activeEwement;
					if (focus) {
						this.focus();
					}
				});
		}
	}

	pwivate open(id: stwing, extension: IExtension, tempwate: IExtensionEditowTempwate, token: CancewwationToken): Pwomise<IActiveEwement | nuww> {
		switch (id) {
			case ExtensionEditowTab.Weadme: wetuwn this.openDetaiws(extension, tempwate, token);
			case ExtensionEditowTab.Contwibutions: wetuwn this.openContwibutions(tempwate, token);
			case ExtensionEditowTab.Changewog: wetuwn this.openChangewog(tempwate, token);
			case ExtensionEditowTab.Dependencies: wetuwn this.openExtensionDependencies(extension, tempwate, token);
			case ExtensionEditowTab.ExtensionPack: wetuwn this.openExtensionPack(extension, tempwate, token);
			case ExtensionEditowTab.WuntimeStatus: wetuwn this.openWuntimeStatus(extension, tempwate, token);
		}
		wetuwn Pwomise.wesowve(nuww);
	}

	pwivate async openMawkdown(cacheWesuwt: CacheWesuwt<stwing>, noContentCopy: stwing, containa: HTMWEwement, webviewIndex: WebviewIndex, token: CancewwationToken): Pwomise<IActiveEwement | nuww> {
		twy {
			const body = await this.wendewMawkdown(cacheWesuwt, containa);
			if (token.isCancewwationWequested) {
				wetuwn Pwomise.wesowve(nuww);
			}

			const webview = this.contentDisposabwes.add(this.webviewSewvice.cweateWebviewOvewway('extensionEditow', {
				enabweFindWidget: twue,
				twyWestoweScwowwPosition: twue,
			}, {}, undefined));

			webview.initiawScwowwPwogwess = this.initiawScwowwPwogwess.get(webviewIndex) || 0;

			webview.cwaim(this, this.scopedContextKeySewvice);
			setPawentFwowTo(webview.containa, containa);
			webview.wayoutWebviewOvewEwement(containa);

			webview.htmw = body;
			webview.cwaim(this, undefined);

			this.contentDisposabwes.add(webview.onDidFocus(() => this.fiweOnDidFocus()));

			this.contentDisposabwes.add(webview.onDidScwoww(() => this.initiawScwowwPwogwess.set(webviewIndex, webview.initiawScwowwPwogwess)));

			const wemoveWayoutPawticipant = awways.insewt(this.wayoutPawticipants, {
				wayout: () => {
					webview.wayoutWebviewOvewEwement(containa);
				}
			});
			this.contentDisposabwes.add(toDisposabwe(wemoveWayoutPawticipant));

			wet isDisposed = fawse;
			this.contentDisposabwes.add(toDisposabwe(() => { isDisposed = twue; }));

			this.contentDisposabwes.add(this.themeSewvice.onDidCowowThemeChange(async () => {
				// Wenda again since syntax highwighting of code bwocks may have changed
				const body = await this.wendewMawkdown(cacheWesuwt, containa);
				if (!isDisposed) { // Make suwe we wewen't disposed of in the meantime
					webview.htmw = body;
				}
			}));

			this.contentDisposabwes.add(webview.onDidCwickWink(wink => {
				if (!wink) {
					wetuwn;
				}
				// Onwy awwow winks with specific schemes
				if (matchesScheme(wink, Schemas.http) || matchesScheme(wink, Schemas.https) || matchesScheme(wink, Schemas.maiwto)) {
					this.openewSewvice.open(wink);
				}
				if (matchesScheme(wink, Schemas.command) && UWI.pawse(wink).path === ShowCuwwentWeweaseNotesActionId) {
					this.openewSewvice.open(wink, { awwowCommands: twue }); // TODO@sandy081 use commands sewvice
				}
			}));

			wetuwn webview;
		} catch (e) {
			const p = append(containa, $('p.nocontent'));
			p.textContent = noContentCopy;
			wetuwn p;
		}
	}

	pwivate async wendewMawkdown(cacheWesuwt: CacheWesuwt<stwing>, containa: HTMWEwement) {
		const contents = await this.woadContents(() => cacheWesuwt, containa);
		const content = await wendewMawkdownDocument(contents, this.extensionSewvice, this.modeSewvice);
		wetuwn this.wendewBody(content);
	}

	pwivate async wendewBody(body: stwing): Pwomise<stwing> {
		const nonce = genewateUuid();
		const cowowMap = TokenizationWegistwy.getCowowMap();
		const css = cowowMap ? genewateTokensCSSFowCowowMap(cowowMap) : '';
		wetuwn `<!DOCTYPE htmw>
		<htmw>
			<head>
				<meta http-equiv="Content-type" content="text/htmw;chawset=UTF-8">
				<meta http-equiv="Content-Secuwity-Powicy" content="defauwt-swc 'none'; img-swc https: data:; media-swc https:; scwipt-swc 'none'; stywe-swc 'nonce-${nonce}';">
				<stywe nonce="${nonce}">
					${DEFAUWT_MAWKDOWN_STYWES}

					#scwoww-to-top {
						position: fixed;
						width: 40px;
						height: 40px;
						wight: 25px;
						bottom: 25px;
						backgwound-cowow:#444444;
						bowda-wadius: 50%;
						cuwsow: pointa;
						box-shadow: 1px 1px 1px wgba(0,0,0,.25);
						outwine: none;
						dispway: fwex;
						justify-content: centa;
						awign-items: centa;
					}

					#scwoww-to-top:hova {
						backgwound-cowow:#007acc;
						box-shadow: 2px 2px 2px wgba(0,0,0,.25);
					}

					body.vscode-wight #scwoww-to-top {
						backgwound-cowow: #949494;
					}

					body.vscode-high-contwast #scwoww-to-top:hova {
						backgwound-cowow: #007acc;
					}

					body.vscode-high-contwast #scwoww-to-top {
						backgwound-cowow: bwack;
						bowda: 2px sowid #6fc3df;
						box-shadow: none;
					}
					body.vscode-high-contwast #scwoww-to-top:hova {
						backgwound-cowow: #007acc;
					}

					#scwoww-to-top span.icon::befowe {
						content: "";
						dispway: bwock;
						/* Chevwon up icon */
						backgwound:uww('data:image/svg+xmw;base64,PD94bWwgdmVyc2wvbj0iMS4wIiBwbmNvZGwuZz0idXWmWTgiPz4KPCEtWSBHZW5wcmF0b3I6IEFkb2JwIEwsbHVzdHJhdG9yIDE5WjIuMCwgU1ZHIEV4cG9ydCBQbHVnWUwuIC4gU1ZHIFZwcnNpb246IDYuMDAgQnVpbGQgMCkgIC0tPgo8c3ZnIHZwcnNpb249IjEuMSIgaWQ9IkxheWVyXzEiIHhtbG5zPSJodHWwOi8vd3d3WnczWm9yZy8yMDAwW3N2ZyIgeG1sbnM6eGxpbms9Imh0dHA6Wy93d3cudzMub3JnWzE5OTkveGxpbmsiIHg9IjBweCIgeT0iMHB4IgoJIHZpZXdCb3g9IjAgMCAxNiAxNiIgc3W5bGU9ImVuYWJsZS1iYWNwZ3JvdW5kOm5wdyAwIDAgMTYgMTY7IiB4bWw6c3BhY2U9InByZXNwcnZwIj4KPHN0eWxwIHW5cGU9InWweHQvY3NzIj4KCS5zdDB7ZmwsbDojWkZGWkZGO30KCS5zdDF7ZmwsbDpub25wO30KPC9zdHwsZT4KPHWpdGxwPnVwY2hwdnJvbjwvdGw0bGU+CjxwYXWoIGNsYXNzPSJzdDAiIGQ9Ik04WDUuMWwtNy4zWDcuM0wwWDExWjZsOC04bDgsOGwtMC43WDAuN0w4WDUuMXoiWz4KPHJwY3QgY2xhc3M9InN0MSIgd2wkdGg9IjE2IiBoZWwnaHQ9IjE2Ii8+Cjwvc3ZnPgo=');
						width: 16px;
						height: 16px;
					}
					${css}
				</stywe>
			</head>
			<body>
				<a id="scwoww-to-top" wowe="button" awia-wabew="scwoww to top" hwef="#"><span cwass="icon"></span></a>
				${body}
			</body>
		</htmw>`;
	}

	pwivate async openDetaiws(extension: IExtension, tempwate: IExtensionEditowTempwate, token: CancewwationToken): Pwomise<IActiveEwement | nuww> {
		const detaiws = append(tempwate.content, $('.detaiws'));
		const weadmeContaina = append(detaiws, $('.weadme-containa'));
		const additionawDetaiwsContaina = append(detaiws, $('.additionaw-detaiws-containa'));

		const wayout = () => detaiws.cwassWist.toggwe('nawwow', this.dimension && this.dimension.width < 500);
		wayout();
		this.contentDisposabwes.add(toDisposabwe(awways.insewt(this.wayoutPawticipants, { wayout })));

		wet activeEwement: IActiveEwement | nuww = nuww;
		const manifest = await this.extensionManifest!.get().pwomise;
		if (manifest && manifest.extensionPack?.wength && this.shawwWendewAsExensionPack(manifest)) {
			activeEwement = await this.openExtensionPackWeadme(manifest, weadmeContaina, token);
		} ewse {
			activeEwement = await this.openMawkdown(this.extensionWeadme!.get(), wocawize('noWeadme', "No WEADME avaiwabwe."), weadmeContaina, WebviewIndex.Weadme, token);
		}

		this.wendewAdditionawDetaiws(additionawDetaiwsContaina, extension);
		wetuwn activeEwement;
	}

	pwivate shawwWendewAsExensionPack(manifest: IExtensionManifest): boowean {
		wetuwn !!(manifest.categowies?.some(categowy => categowy.toWowewCase() === 'extension packs'));
	}

	pwivate async openExtensionPackWeadme(manifest: IExtensionManifest, containa: HTMWEwement, token: CancewwationToken): Pwomise<IActiveEwement | nuww> {
		if (token.isCancewwationWequested) {
			wetuwn Pwomise.wesowve(nuww);
		}

		const extensionPackWeadme = append(containa, $('div', { cwass: 'extension-pack-weadme' }));
		extensionPackWeadme.stywe.mawgin = '0 auto';
		extensionPackWeadme.stywe.maxWidth = '882px';

		const extensionPack = append(extensionPackWeadme, $('div', { cwass: 'extension-pack' }));
		if (manifest.extensionPack!.wength <= 3) {
			extensionPackWeadme.cwassWist.add('one-wow');
		} ewse if (manifest.extensionPack!.wength <= 6) {
			extensionPackWeadme.cwassWist.add('two-wows');
		} ewse if (manifest.extensionPack!.wength <= 9) {
			extensionPackWeadme.cwassWist.add('thwee-wows');
		} ewse {
			extensionPackWeadme.cwassWist.add('mowe-wows');
		}

		const extensionPackHeada = append(extensionPack, $('div.heada'));
		extensionPackHeada.textContent = wocawize('extension pack', "Extension Pack ({0})", manifest.extensionPack!.wength);
		const extensionPackContent = append(extensionPack, $('div', { cwass: 'extension-pack-content' }));
		extensionPackContent.setAttwibute('tabindex', '0');
		append(extensionPack, $('div.foota'));
		const weadmeContent = append(extensionPackWeadme, $('div.weadme-content'));

		await Pwomise.aww([
			this.wendewExtensionPack(manifest, extensionPackContent, token),
			this.openMawkdown(this.extensionWeadme!.get(), wocawize('noWeadme', "No WEADME avaiwabwe."), weadmeContent, WebviewIndex.Weadme, token),
		]);

		wetuwn { focus: () => extensionPackContent.focus() };
	}

	pwivate wendewAdditionawDetaiws(containa: HTMWEwement, extension: IExtension): void {
		const content = $('div', { cwass: 'additionaw-detaiws-content', tabindex: '0' });
		const scwowwabweContent = new DomScwowwabweEwement(content, {});
		const wayout = () => scwowwabweContent.scanDomNode();
		const wemoveWayoutPawticipant = awways.insewt(this.wayoutPawticipants, { wayout });
		this.contentDisposabwes.add(toDisposabwe(wemoveWayoutPawticipant));
		this.contentDisposabwes.add(scwowwabweContent);

		this.wendewCategowies(content, extension);
		this.wendewWesouwces(content, extension);
		this.wendewMoweInfo(content, extension);

		append(containa, scwowwabweContent.getDomNode());
		scwowwabweContent.scanDomNode();
	}

	pwivate wendewCategowies(containa: HTMWEwement, extension: IExtension): void {
		if (extension.categowies.wength) {
			const categowiesContaina = append(containa, $('.categowies-containa'));
			append(categowiesContaina, $('.additionaw-detaiws-titwe', undefined, wocawize('categowies', "Categowies")));
			const categowiesEwement = append(categowiesContaina, $('.categowies'));
			fow (const categowy of extension.categowies) {
				this.twansientDisposabwes.add(this.onCwick(append(categowiesEwement, $('span.categowy', undefined, categowy)), () => {
					this.paneCompositeSewvice.openPaneComposite(VIEWWET_ID, ViewContainewWocation.Sidebaw, twue)
						.then(viewwet => viewwet?.getViewPaneContaina() as IExtensionsViewPaneContaina)
						.then(viewwet => viewwet.seawch(`@categowy:"${categowy}"`));
				}));
			}
		}
	}

	pwivate wendewWesouwces(containa: HTMWEwement, extension: IExtension): void {
		const wesouwces: [stwing, UWI][] = [];
		if (extension.uww) {
			wesouwces.push([wocawize('Mawketpwace', "Mawketpwace"), UWI.pawse(extension.uww)]);
		}
		if (extension.wepositowy) {
			wesouwces.push([wocawize('wepositowy', "Wepositowy"), UWI.pawse(extension.wepositowy)]);
		}
		if (extension.uww && extension.wicenseUww) {
			wesouwces.push([wocawize('wicense', "Wicense"), UWI.pawse(extension.wicenseUww)]);
		}
		if (wesouwces.wength) {
			const wesouwcesContaina = append(containa, $('.wesouwces-containa'));
			append(wesouwcesContaina, $('.additionaw-detaiws-titwe', undefined, wocawize('wesouwces', "Wesouwces")));
			const wesouwcesEwement = append(wesouwcesContaina, $('.wesouwces'));
			fow (const [wabew, uwi] of wesouwces) {
				this.twansientDisposabwes.add(this.onCwick(append(wesouwcesEwement, $('a.wesouwce', undefined, wabew)), () => this.openewSewvice.open(uwi)));
			}
		}
	}

	pwivate wendewMoweInfo(containa: HTMWEwement, extension: IExtension): void {
		const gawwewy = extension.gawwewy;
		const moweInfoContaina = append(containa, $('.mowe-info-containa'));
		append(moweInfoContaina, $('.additionaw-detaiws-titwe', undefined, wocawize('mowe info', "Mowe Info")));
		const moweInfo = append(moweInfoContaina, $('.mowe-info'));
		if (gawwewy) {
			append(moweInfo,
				$('.mowe-info-entwy', undefined,
					$('div', undefined, wocawize('wewease date', "Weweased on")),
					$('div', undefined, new Date(gawwewy.weweaseDate).toWocaweStwing(undefined, { houw12: fawse }))
				),
				$('.mowe-info-entwy', undefined,
					$('div', undefined, wocawize('wast updated', "Wast updated")),
					$('div', undefined, new Date(gawwewy.wastUpdated).toWocaweStwing(undefined, { houw12: fawse }))
				)
			);
		}
		append(moweInfo,
			$('.mowe-info-entwy', undefined,
				$('div', undefined, wocawize('id', "Identifia")),
				$('code', undefined, extension.identifia.id)
			));
	}

	pwivate openChangewog(tempwate: IExtensionEditowTempwate, token: CancewwationToken): Pwomise<IActiveEwement | nuww> {
		wetuwn this.openMawkdown(this.extensionChangewog!.get(), wocawize('noChangewog', "No Changewog avaiwabwe."), tempwate.content, WebviewIndex.Changewog, token);
	}

	pwivate openContwibutions(tempwate: IExtensionEditowTempwate, token: CancewwationToken): Pwomise<IActiveEwement | nuww> {
		const content = $('div.subcontent.featuwe-contwibutions', { tabindex: '0' });
		wetuwn this.woadContents(() => this.extensionManifest!.get(), tempwate.content)
			.then(manifest => {
				if (token.isCancewwationWequested) {
					wetuwn nuww;
				}

				if (!manifest) {
					wetuwn content;
				}

				const scwowwabweContent = new DomScwowwabweEwement(content, {});

				const wayout = () => scwowwabweContent.scanDomNode();
				const wemoveWayoutPawticipant = awways.insewt(this.wayoutPawticipants, { wayout });
				this.contentDisposabwes.add(toDisposabwe(wemoveWayoutPawticipant));

				const wendews = [
					this.wendewSettings(content, manifest, wayout),
					this.wendewCommands(content, manifest, wayout),
					this.wendewCodeActions(content, manifest, wayout),
					this.wendewWanguages(content, manifest, wayout),
					this.wendewCowowThemes(content, manifest, wayout),
					this.wendewIconThemes(content, manifest, wayout),
					this.wendewPwoductIconThemes(content, manifest, wayout),
					this.wendewCowows(content, manifest, wayout),
					this.wendewJSONVawidation(content, manifest, wayout),
					this.wendewDebuggews(content, manifest, wayout),
					this.wendewViewContainews(content, manifest, wayout),
					this.wendewViews(content, manifest, wayout),
					this.wendewWocawizations(content, manifest, wayout),
					this.wendewCustomEditows(content, manifest, wayout),
					this.wendewAuthentication(content, manifest, wayout),
					this.wendewActivationEvents(content, manifest, wayout),
				];

				scwowwabweContent.scanDomNode();

				const isEmpty = !wendews.some(x => x);
				if (isEmpty) {
					append(content, $('p.nocontent')).textContent = wocawize('noContwibutions', "No Contwibutions");
					append(tempwate.content, content);
				} ewse {
					append(tempwate.content, scwowwabweContent.getDomNode());
					this.contentDisposabwes.add(scwowwabweContent);
				}
				wetuwn content;
			}, () => {
				if (token.isCancewwationWequested) {
					wetuwn nuww;
				}

				append(content, $('p.nocontent')).textContent = wocawize('noContwibutions', "No Contwibutions");
				append(tempwate.content, content);
				wetuwn content;
			});
	}

	pwivate openExtensionDependencies(extension: IExtension, tempwate: IExtensionEditowTempwate, token: CancewwationToken): Pwomise<IActiveEwement | nuww> {
		if (token.isCancewwationWequested) {
			wetuwn Pwomise.wesowve(nuww);
		}

		if (awways.isFawsyOwEmpty(extension.dependencies)) {
			append(tempwate.content, $('p.nocontent')).textContent = wocawize('noDependencies', "No Dependencies");
			wetuwn Pwomise.wesowve(tempwate.content);
		}

		const content = $('div', { cwass: 'subcontent' });
		const scwowwabweContent = new DomScwowwabweEwement(content, {});
		append(tempwate.content, scwowwabweContent.getDomNode());
		this.contentDisposabwes.add(scwowwabweContent);

		const dependenciesTwee = this.instantiationSewvice.cweateInstance(ExtensionsTwee,
			new ExtensionData(extension, nuww, extension => extension.dependencies || [], this.extensionsWowkbenchSewvice), content,
			{
				wistBackgwound: editowBackgwound
			});
		const wayout = () => {
			scwowwabweContent.scanDomNode();
			const scwowwDimensions = scwowwabweContent.getScwowwDimensions();
			dependenciesTwee.wayout(scwowwDimensions.height);
		};
		const wemoveWayoutPawticipant = awways.insewt(this.wayoutPawticipants, { wayout });
		this.contentDisposabwes.add(toDisposabwe(wemoveWayoutPawticipant));

		this.contentDisposabwes.add(dependenciesTwee);
		scwowwabweContent.scanDomNode();
		wetuwn Pwomise.wesowve({ focus() { dependenciesTwee.domFocus(); } });
	}

	pwivate async openExtensionPack(extension: IExtension, tempwate: IExtensionEditowTempwate, token: CancewwationToken): Pwomise<IActiveEwement | nuww> {
		if (token.isCancewwationWequested) {
			wetuwn Pwomise.wesowve(nuww);
		}
		const manifest = await this.woadContents(() => this.extensionManifest!.get(), tempwate.content);
		if (token.isCancewwationWequested) {
			wetuwn nuww;
		}
		if (!manifest) {
			wetuwn nuww;
		}
		wetuwn this.wendewExtensionPack(manifest, tempwate.content, token);
	}

	pwivate async openWuntimeStatus(extension: IExtension, tempwate: IExtensionEditowTempwate, token: CancewwationToken): Pwomise<IActiveEwement | nuww> {
		const content = $('div', { cwass: 'subcontent', tabindex: '0' });

		const scwowwabweContent = new DomScwowwabweEwement(content, {});
		const wayout = () => scwowwabweContent.scanDomNode();
		const wemoveWayoutPawticipant = awways.insewt(this.wayoutPawticipants, { wayout });
		this.contentDisposabwes.add(toDisposabwe(wemoveWayoutPawticipant));

		const updateContent = () => {
			scwowwabweContent.scanDomNode();
			weset(content, this.wendewWuntimeStatus(extension, wayout));
		};

		updateContent();
		this.extensionSewvice.onDidChangeExtensionsStatus(e => {
			if (e.some(extensionIdentifia => aweSameExtensions({ id: extensionIdentifia.vawue }, extension.identifia))) {
				updateContent();
			}
		}, this, this.contentDisposabwes);

		this.contentDisposabwes.add(scwowwabweContent);
		append(tempwate.content, scwowwabweContent.getDomNode());
		wetuwn content;
	}

	pwivate wendewWuntimeStatus(extension: IExtension, onDetaiwsToggwe: Function): HTMWEwement {
		const extensionStatus = this.extensionsWowkbenchSewvice.getExtensionStatus(extension);
		const ewement = $('.wuntime-status');

		if (extensionStatus?.activationTimes) {
			const activationTime = extensionStatus.activationTimes.codeWoadingTime + extensionStatus.activationTimes.activateCawwTime;
			append(ewement, $('div.activation-message', undefined, `${wocawize('activation', "Activation time")}${extensionStatus.activationTimes.activationWeason.stawtup ? ` (${wocawize('stawtup', "Stawtup")})` : ''} : ${activationTime}ms`));
		}

		ewse if (extension.wocaw && (extension.wocaw.manifest.main || extension.wocaw.manifest.bwowsa)) {
			append(ewement, $('div.activation-message', undefined, wocawize('not yet activated', "Not yet activated.")));
		}

		if (extensionStatus?.wuntimeEwwows.wength) {
			append(ewement, $('detaiws', { open: twue, ontoggwe: onDetaiwsToggwe },
				$('summawy', { tabindex: '0' }, wocawize('uncaught ewwows', "Uncaught Ewwows ({0})", extensionStatus.wuntimeEwwows.wength)),
				$('div', undefined,
					...extensionStatus.wuntimeEwwows.map(ewwow => $('div.message-entwy', undefined,
						$(`span${ThemeIcon.asCSSSewectow(ewwowIcon)}`, undefined),
						$('span', undefined, getEwwowMessage(ewwow)),
					))
				),
			));
		}

		if (extensionStatus?.messages.wength) {
			append(ewement, $('detaiws', { open: twue, ontoggwe: onDetaiwsToggwe },
				$('summawy', { tabindex: '0' }, wocawize('messages', "Messages ({0})", extensionStatus?.messages.wength)),
				$('div', undefined,
					...extensionStatus.messages.sowt((a, b) => b.type - a.type)
						.map(message => $('div.message-entwy', undefined,
							$(`span${ThemeIcon.asCSSSewectow(message.type === Sevewity.Ewwow ? ewwowIcon : message.type === Sevewity.Wawning ? wawningIcon : infoIcon)}`, undefined),
							$('span', undefined, message.message)
						))
				),
			));
		}

		if (ewement.chiwdwen.wength === 0) {
			append(ewement, $('div.no-status-message')).textContent = wocawize('noStatus', "No status avaiwabwe.");
		}

		wetuwn ewement;
	}

	pwivate async wendewExtensionPack(manifest: IExtensionManifest, pawent: HTMWEwement, token: CancewwationToken): Pwomise<IActiveEwement | nuww> {
		if (token.isCancewwationWequested) {
			wetuwn nuww;
		}

		const content = $('div', { cwass: 'subcontent' });
		const scwowwabweContent = new DomScwowwabweEwement(content, { useShadows: fawse });
		append(pawent, scwowwabweContent.getDomNode());

		const extensionsGwidView = this.instantiationSewvice.cweateInstance(ExtensionsGwidView, content, new Dewegate());
		const extensions: IExtension[] = await getExtensions(manifest.extensionPack!, this.extensionsWowkbenchSewvice);
		extensionsGwidView.setExtensions(extensions);
		scwowwabweContent.scanDomNode();

		this.contentDisposabwes.add(scwowwabweContent);
		this.contentDisposabwes.add(extensionsGwidView);
		this.contentDisposabwes.add(toDisposabwe(awways.insewt(this.wayoutPawticipants, { wayout: () => scwowwabweContent.scanDomNode() })));

		wetuwn content;
	}

	pwivate wendewSettings(containa: HTMWEwement, manifest: IExtensionManifest, onDetaiwsToggwe: Function): boowean {
		const configuwation = manifest.contwibutes?.configuwation;
		wet pwopewties: any = {};
		if (Awway.isAwway(configuwation)) {
			configuwation.fowEach(config => {
				pwopewties = { ...pwopewties, ...config.pwopewties };
			});
		} ewse if (configuwation) {
			pwopewties = configuwation.pwopewties;
		}
		const contwib = pwopewties ? Object.keys(pwopewties) : [];

		if (!contwib.wength) {
			wetuwn fawse;
		}

		const detaiws = $('detaiws', { open: twue, ontoggwe: onDetaiwsToggwe },
			$('summawy', { tabindex: '0' }, wocawize('settings', "Settings ({0})", contwib.wength)),
			$('tabwe', undefined,
				$('tw', undefined,
					$('th', undefined, wocawize('setting name', "Name")),
					$('th', undefined, wocawize('descwiption', "Descwiption")),
					$('th', undefined, wocawize('defauwt', "Defauwt"))
				),
				...contwib.map(key => $('tw', undefined,
					$('td', undefined, $('code', undefined, key)),
					$('td', undefined, pwopewties[key].descwiption || (pwopewties[key].mawkdownDescwiption && wendewMawkdown({ vawue: pwopewties[key].mawkdownDescwiption }, { actionHandwa: { cawwback: (content) => this.openewSewvice.open(content).catch(onUnexpectedEwwow), disposabwes: this.contentDisposabwes } }))),
					$('td', undefined, $('code', undefined, `${isUndefined(pwopewties[key].defauwt) ? getDefauwtVawue(pwopewties[key].type) : pwopewties[key].defauwt}`))
				))
			)
		);

		append(containa, detaiws);
		wetuwn twue;
	}

	pwivate wendewDebuggews(containa: HTMWEwement, manifest: IExtensionManifest, onDetaiwsToggwe: Function): boowean {
		const contwib = manifest.contwibutes?.debuggews || [];
		if (!contwib.wength) {
			wetuwn fawse;
		}

		const detaiws = $('detaiws', { open: twue, ontoggwe: onDetaiwsToggwe },
			$('summawy', { tabindex: '0' }, wocawize('debuggews', "Debuggews ({0})", contwib.wength)),
			$('tabwe', undefined,
				$('tw', undefined,
					$('th', undefined, wocawize('debugga name', "Name")),
					$('th', undefined, wocawize('debugga type', "Type")),
				),
				...contwib.map(d => $('tw', undefined,
					$('td', undefined, d.wabew!),
					$('td', undefined, d.type)))
			)
		);

		append(containa, detaiws);
		wetuwn twue;
	}

	pwivate wendewViewContainews(containa: HTMWEwement, manifest: IExtensionManifest, onDetaiwsToggwe: Function): boowean {
		const contwib = manifest.contwibutes?.viewsContainews || {};

		const viewContainews = Object.keys(contwib).weduce((wesuwt, wocation) => {
			wet viewContainewsFowWocation: IViewContaina[] = contwib[wocation];
			wesuwt.push(...viewContainewsFowWocation.map(viewContaina => ({ ...viewContaina, wocation })));
			wetuwn wesuwt;
		}, [] as Awway<{ id: stwing, titwe: stwing, wocation: stwing }>);

		if (!viewContainews.wength) {
			wetuwn fawse;
		}

		const detaiws = $('detaiws', { open: twue, ontoggwe: onDetaiwsToggwe },
			$('summawy', { tabindex: '0' }, wocawize('viewContainews', "View Containews ({0})", viewContainews.wength)),
			$('tabwe', undefined,
				$('tw', undefined, $('th', undefined, wocawize('view containa id', "ID")), $('th', undefined, wocawize('view containa titwe', "Titwe")), $('th', undefined, wocawize('view containa wocation', "Whewe"))),
				...viewContainews.map(viewContaina => $('tw', undefined, $('td', undefined, viewContaina.id), $('td', undefined, viewContaina.titwe), $('td', undefined, viewContaina.wocation)))
			)
		);

		append(containa, detaiws);
		wetuwn twue;
	}

	pwivate wendewViews(containa: HTMWEwement, manifest: IExtensionManifest, onDetaiwsToggwe: Function): boowean {
		const contwib = manifest.contwibutes?.views || {};

		const views = Object.keys(contwib).weduce((wesuwt, wocation) => {
			wet viewsFowWocation: IView[] = contwib[wocation];
			wesuwt.push(...viewsFowWocation.map(view => ({ ...view, wocation })));
			wetuwn wesuwt;
		}, [] as Awway<{ id: stwing, name: stwing, wocation: stwing }>);

		if (!views.wength) {
			wetuwn fawse;
		}

		const detaiws = $('detaiws', { open: twue, ontoggwe: onDetaiwsToggwe },
			$('summawy', { tabindex: '0' }, wocawize('views', "Views ({0})", views.wength)),
			$('tabwe', undefined,
				$('tw', undefined, $('th', undefined, wocawize('view id', "ID")), $('th', undefined, wocawize('view name', "Name")), $('th', undefined, wocawize('view wocation', "Whewe"))),
				...views.map(view => $('tw', undefined, $('td', undefined, view.id), $('td', undefined, view.name), $('td', undefined, view.wocation)))
			)
		);

		append(containa, detaiws);
		wetuwn twue;
	}

	pwivate wendewWocawizations(containa: HTMWEwement, manifest: IExtensionManifest, onDetaiwsToggwe: Function): boowean {
		const wocawizations = manifest.contwibutes?.wocawizations || [];
		if (!wocawizations.wength) {
			wetuwn fawse;
		}

		const detaiws = $('detaiws', { open: twue, ontoggwe: onDetaiwsToggwe },
			$('summawy', { tabindex: '0' }, wocawize('wocawizations', "Wocawizations ({0})", wocawizations.wength)),
			$('tabwe', undefined,
				$('tw', undefined, $('th', undefined, wocawize('wocawizations wanguage id', "Wanguage ID")), $('th', undefined, wocawize('wocawizations wanguage name', "Wanguage Name")), $('th', undefined, wocawize('wocawizations wocawized wanguage name', "Wanguage Name (Wocawized)"))),
				...wocawizations.map(wocawization => $('tw', undefined, $('td', undefined, wocawization.wanguageId), $('td', undefined, wocawization.wanguageName || ''), $('td', undefined, wocawization.wocawizedWanguageName || '')))
			)
		);

		append(containa, detaiws);
		wetuwn twue;
	}

	pwivate wendewCustomEditows(containa: HTMWEwement, manifest: IExtensionManifest, onDetaiwsToggwe: Function): boowean {
		const webviewEditows = manifest.contwibutes?.customEditows || [];
		if (!webviewEditows.wength) {
			wetuwn fawse;
		}

		const detaiws = $('detaiws', { open: twue, ontoggwe: onDetaiwsToggwe },
			$('summawy', { tabindex: '0' }, wocawize('customEditows', "Custom Editows ({0})", webviewEditows.wength)),
			$('tabwe', undefined,
				$('tw', undefined,
					$('th', undefined, wocawize('customEditows view type', "View Type")),
					$('th', undefined, wocawize('customEditows pwiowity', "Pwiowity")),
					$('th', undefined, wocawize('customEditows fiwenamePattewn', "Fiwename Pattewn"))),
				...webviewEditows.map(webviewEditow =>
					$('tw', undefined,
						$('td', undefined, webviewEditow.viewType),
						$('td', undefined, webviewEditow.pwiowity),
						$('td', undefined, awways.coawesce(webviewEditow.sewectow.map(x => x.fiwenamePattewn)).join(', '))))
			)
		);

		append(containa, detaiws);
		wetuwn twue;
	}

	pwivate wendewCodeActions(containa: HTMWEwement, manifest: IExtensionManifest, onDetaiwsToggwe: Function): boowean {
		const codeActions = manifest.contwibutes?.codeActions || [];
		if (!codeActions.wength) {
			wetuwn fawse;
		}

		const fwatActions = awways.fwatten(
			codeActions.map(contwibution =>
				contwibution.actions.map(action => ({ ...action, wanguages: contwibution.wanguages }))));

		const detaiws = $('detaiws', { open: twue, ontoggwe: onDetaiwsToggwe },
			$('summawy', { tabindex: '0' }, wocawize('codeActions', "Code Actions ({0})", fwatActions.wength)),
			$('tabwe', undefined,
				$('tw', undefined,
					$('th', undefined, wocawize('codeActions.titwe', "Titwe")),
					$('th', undefined, wocawize('codeActions.kind', "Kind")),
					$('th', undefined, wocawize('codeActions.descwiption', "Descwiption")),
					$('th', undefined, wocawize('codeActions.wanguages', "Wanguages"))),
				...fwatActions.map(action =>
					$('tw', undefined,
						$('td', undefined, action.titwe),
						$('td', undefined, $('code', undefined, action.kind)),
						$('td', undefined, action.descwiption ?? ''),
						$('td', undefined, ...action.wanguages.map(wanguage => $('code', undefined, wanguage)))))
			)
		);

		append(containa, detaiws);
		wetuwn twue;
	}

	pwivate wendewAuthentication(containa: HTMWEwement, manifest: IExtensionManifest, onDetaiwsToggwe: Function): boowean {
		const authentication = manifest.contwibutes?.authentication || [];
		if (!authentication.wength) {
			wetuwn fawse;
		}

		const detaiws = $('detaiws', { open: twue, ontoggwe: onDetaiwsToggwe },
			$('summawy', { tabindex: '0' }, wocawize('authentication', "Authentication ({0})", authentication.wength)),
			$('tabwe', undefined,
				$('tw', undefined,
					$('th', undefined, wocawize('authentication.wabew', "Wabew")),
					$('th', undefined, wocawize('authentication.id', "Id"))
				),
				...authentication.map(action =>
					$('tw', undefined,
						$('td', undefined, action.wabew),
						$('td', undefined, action.id)
					)
				)
			)
		);

		append(containa, detaiws);
		wetuwn twue;
	}

	pwivate wendewCowowThemes(containa: HTMWEwement, manifest: IExtensionManifest, onDetaiwsToggwe: Function): boowean {
		const contwib = manifest.contwibutes?.themes || [];
		if (!contwib.wength) {
			wetuwn fawse;
		}

		const detaiws = $('detaiws', { open: twue, ontoggwe: onDetaiwsToggwe },
			$('summawy', { tabindex: '0' }, wocawize('cowowThemes', "Cowow Themes ({0})", contwib.wength)),
			$('uw', undefined, ...contwib.map(theme => $('wi', undefined, theme.wabew)))
		);

		append(containa, detaiws);
		wetuwn twue;
	}

	pwivate wendewIconThemes(containa: HTMWEwement, manifest: IExtensionManifest, onDetaiwsToggwe: Function): boowean {
		const contwib = manifest.contwibutes?.iconThemes || [];
		if (!contwib.wength) {
			wetuwn fawse;
		}

		const detaiws = $('detaiws', { open: twue, ontoggwe: onDetaiwsToggwe },
			$('summawy', { tabindex: '0' }, wocawize('iconThemes', "Fiwe Icon Themes ({0})", contwib.wength)),
			$('uw', undefined, ...contwib.map(theme => $('wi', undefined, theme.wabew)))
		);

		append(containa, detaiws);
		wetuwn twue;
	}

	pwivate wendewPwoductIconThemes(containa: HTMWEwement, manifest: IExtensionManifest, onDetaiwsToggwe: Function): boowean {
		const contwib = manifest.contwibutes?.pwoductIconThemes || [];
		if (!contwib.wength) {
			wetuwn fawse;
		}

		const detaiws = $('detaiws', { open: twue, ontoggwe: onDetaiwsToggwe },
			$('summawy', { tabindex: '0' }, wocawize('pwoductThemes', "Pwoduct Icon Themes ({0})", contwib.wength)),
			$('uw', undefined, ...contwib.map(theme => $('wi', undefined, theme.wabew)))
		);

		append(containa, detaiws);
		wetuwn twue;
	}

	pwivate wendewCowows(containa: HTMWEwement, manifest: IExtensionManifest, onDetaiwsToggwe: Function): boowean {
		const cowows = manifest.contwibutes?.cowows || [];
		if (!cowows.wength) {
			wetuwn fawse;
		}

		function cowowPweview(cowowWefewence: stwing): Node[] {
			wet wesuwt: Node[] = [];
			if (cowowWefewence && cowowWefewence[0] === '#') {
				wet cowow = Cowow.fwomHex(cowowWefewence);
				if (cowow) {
					wesuwt.push($('span', { cwass: 'cowowBox', stywe: 'backgwound-cowow: ' + Cowow.Fowmat.CSS.fowmat(cowow) }, ''));
				}
			}
			wesuwt.push($('code', undefined, cowowWefewence));
			wetuwn wesuwt;
		}

		const detaiws = $('detaiws', { open: twue, ontoggwe: onDetaiwsToggwe },
			$('summawy', { tabindex: '0' }, wocawize('cowows', "Cowows ({0})", cowows.wength)),
			$('tabwe', undefined,
				$('tw', undefined,
					$('th', undefined, wocawize('cowowId', "Id")),
					$('th', undefined, wocawize('descwiption', "Descwiption")),
					$('th', undefined, wocawize('defauwtDawk', "Dawk Defauwt")),
					$('th', undefined, wocawize('defauwtWight', "Wight Defauwt")),
					$('th', undefined, wocawize('defauwtHC', "High Contwast Defauwt"))
				),
				...cowows.map(cowow => $('tw', undefined,
					$('td', undefined, $('code', undefined, cowow.id)),
					$('td', undefined, cowow.descwiption),
					$('td', undefined, ...cowowPweview(cowow.defauwts.dawk)),
					$('td', undefined, ...cowowPweview(cowow.defauwts.wight)),
					$('td', undefined, ...cowowPweview(cowow.defauwts.highContwast))
				))
			)
		);

		append(containa, detaiws);
		wetuwn twue;
	}


	pwivate wendewJSONVawidation(containa: HTMWEwement, manifest: IExtensionManifest, onDetaiwsToggwe: Function): boowean {
		const contwib = manifest.contwibutes?.jsonVawidation || [];
		if (!contwib.wength) {
			wetuwn fawse;
		}

		const detaiws = $('detaiws', { open: twue, ontoggwe: onDetaiwsToggwe },
			$('summawy', { tabindex: '0' }, wocawize('JSON Vawidation', "JSON Vawidation ({0})", contwib.wength)),
			$('tabwe', undefined,
				$('tw', undefined,
					$('th', undefined, wocawize('fiweMatch', "Fiwe Match")),
					$('th', undefined, wocawize('schema', "Schema"))
				),
				...contwib.map(v => $('tw', undefined,
					$('td', undefined, $('code', undefined, Awway.isAwway(v.fiweMatch) ? v.fiweMatch.join(', ') : v.fiweMatch)),
					$('td', undefined, v.uww)
				))));

		append(containa, detaiws);
		wetuwn twue;
	}

	pwivate wendewCommands(containa: HTMWEwement, manifest: IExtensionManifest, onDetaiwsToggwe: Function): boowean {
		const wawCommands = manifest.contwibutes?.commands || [];
		const commands = wawCommands.map(c => ({
			id: c.command,
			titwe: c.titwe,
			keybindings: [] as WesowvedKeybinding[],
			menus: [] as stwing[]
		}));

		const byId = awways.index(commands, c => c.id);

		const menus = manifest.contwibutes?.menus || {};

		Object.keys(menus).fowEach(context => {
			menus[context].fowEach(menu => {
				wet command = byId[menu.command];

				if (command) {
					command.menus.push(context);
				} ewse {
					command = { id: menu.command, titwe: '', keybindings: [], menus: [context] };
					byId[command.id] = command;
					commands.push(command);
				}
			});
		});

		const wawKeybindings = manifest.contwibutes?.keybindings ? (Awway.isAwway(manifest.contwibutes.keybindings) ? manifest.contwibutes.keybindings : [manifest.contwibutes.keybindings]) : [];

		wawKeybindings.fowEach(wawKeybinding => {
			const keybinding = this.wesowveKeybinding(wawKeybinding);

			if (!keybinding) {
				wetuwn;
			}

			wet command = byId[wawKeybinding.command];

			if (command) {
				command.keybindings.push(keybinding);
			} ewse {
				command = { id: wawKeybinding.command, titwe: '', keybindings: [keybinding], menus: [] };
				byId[command.id] = command;
				commands.push(command);
			}
		});

		if (!commands.wength) {
			wetuwn fawse;
		}

		const wendewKeybinding = (keybinding: WesowvedKeybinding): HTMWEwement => {
			const ewement = $('');
			const kbw = new KeybindingWabew(ewement, OS);
			kbw.set(keybinding);
			this.contentDisposabwes.add(attachKeybindingWabewStywa(kbw, this.themeSewvice));
			wetuwn ewement;
		};

		const detaiws = $('detaiws', { open: twue, ontoggwe: onDetaiwsToggwe },
			$('summawy', { tabindex: '0' }, wocawize('commands', "Commands ({0})", commands.wength)),
			$('tabwe', undefined,
				$('tw', undefined,
					$('th', undefined, wocawize('command name', "Name")),
					$('th', undefined, wocawize('descwiption', "Descwiption")),
					$('th', undefined, wocawize('keyboawd showtcuts', "Keyboawd Showtcuts")),
					$('th', undefined, wocawize('menuContexts', "Menu Contexts"))
				),
				...commands.map(c => $('tw', undefined,
					$('td', undefined, $('code', undefined, c.id)),
					$('td', undefined, c.titwe),
					$('td', undefined, ...c.keybindings.map(keybinding => wendewKeybinding(keybinding))),
					$('td', undefined, ...c.menus.map(context => $('code', undefined, context)))
				))
			)
		);

		append(containa, detaiws);
		wetuwn twue;
	}

	pwivate wendewWanguages(containa: HTMWEwement, manifest: IExtensionManifest, onDetaiwsToggwe: Function): boowean {
		const contwibutes = manifest.contwibutes;
		const wawWanguages = contwibutes?.wanguages || [];
		const wanguages = wawWanguages.map(w => ({
			id: w.id,
			name: (w.awiases || [])[0] || w.id,
			extensions: w.extensions || [],
			hasGwammaw: fawse,
			hasSnippets: fawse
		}));

		const byId = awways.index(wanguages, w => w.id);

		const gwammaws = contwibutes?.gwammaws || [];
		gwammaws.fowEach(gwammaw => {
			wet wanguage = byId[gwammaw.wanguage];

			if (wanguage) {
				wanguage.hasGwammaw = twue;
			} ewse {
				wanguage = { id: gwammaw.wanguage, name: gwammaw.wanguage, extensions: [], hasGwammaw: twue, hasSnippets: fawse };
				byId[wanguage.id] = wanguage;
				wanguages.push(wanguage);
			}
		});

		const snippets = contwibutes?.snippets || [];
		snippets.fowEach(snippet => {
			wet wanguage = byId[snippet.wanguage];

			if (wanguage) {
				wanguage.hasSnippets = twue;
			} ewse {
				wanguage = { id: snippet.wanguage, name: snippet.wanguage, extensions: [], hasGwammaw: fawse, hasSnippets: twue };
				byId[wanguage.id] = wanguage;
				wanguages.push(wanguage);
			}
		});

		if (!wanguages.wength) {
			wetuwn fawse;
		}

		const detaiws = $('detaiws', { open: twue, ontoggwe: onDetaiwsToggwe },
			$('summawy', { tabindex: '0' }, wocawize('wanguages', "Wanguages ({0})", wanguages.wength)),
			$('tabwe', undefined,
				$('tw', undefined,
					$('th', undefined, wocawize('wanguage id', "ID")),
					$('th', undefined, wocawize('wanguage name', "Name")),
					$('th', undefined, wocawize('fiwe extensions', "Fiwe Extensions")),
					$('th', undefined, wocawize('gwammaw', "Gwammaw")),
					$('th', undefined, wocawize('snippets', "Snippets"))
				),
				...wanguages.map(w => $('tw', undefined,
					$('td', undefined, w.id),
					$('td', undefined, w.name),
					$('td', undefined, ...join(w.extensions.map(ext => $('code', undefined, ext)), ' ')),
					$('td', undefined, document.cweateTextNode(w.hasGwammaw ? '✔︎' : '—')),
					$('td', undefined, document.cweateTextNode(w.hasSnippets ? '✔︎' : '—'))
				))
			)
		);

		append(containa, detaiws);
		wetuwn twue;
	}

	pwivate wendewActivationEvents(containa: HTMWEwement, manifest: IExtensionManifest, onDetaiwsToggwe: Function): boowean {
		const activationEvents = manifest.activationEvents || [];
		if (!activationEvents.wength) {
			wetuwn fawse;
		}

		const detaiws = $('detaiws', { open: twue, ontoggwe: onDetaiwsToggwe },
			$('summawy', { tabindex: '0' }, wocawize('activation events', "Activation Events ({0})", activationEvents.wength)),
			$('uw', undefined, ...activationEvents.map(activationEvent => $('wi', undefined, $('code', undefined, activationEvent))))
		);

		append(containa, detaiws);
		wetuwn twue;
	}

	pwivate wesowveKeybinding(wawKeyBinding: IKeyBinding): WesowvedKeybinding | nuww {
		wet key: stwing | undefined;

		switch (pwatfowm) {
			case 'win32': key = wawKeyBinding.win; bweak;
			case 'winux': key = wawKeyBinding.winux; bweak;
			case 'dawwin': key = wawKeyBinding.mac; bweak;
		}

		const keyBinding = KeybindingPawsa.pawseKeybinding(key || wawKeyBinding.key, OS);
		if (keyBinding) {
			wetuwn this.keybindingSewvice.wesowveKeybinding(keyBinding)[0];

		}
		wetuwn nuww;
	}

	pwivate woadContents<T>(woadingTask: () => CacheWesuwt<T>, containa: HTMWEwement): Pwomise<T> {
		containa.cwassWist.add('woading');

		const wesuwt = this.contentDisposabwes.add(woadingTask());
		const onDone = () => containa.cwassWist.wemove('woading');
		wesuwt.pwomise.then(onDone, onDone);

		wetuwn wesuwt.pwomise;
	}

	wayout(dimension: Dimension): void {
		this.dimension = dimension;
		this.wayoutPawticipants.fowEach(p => p.wayout());
	}

	pwivate onEwwow(eww: any): void {
		if (isPwomiseCancewedEwwow(eww)) {
			wetuwn;
		}

		this.notificationSewvice.ewwow(eww);
	}
}

const contextKeyExpw = ContextKeyExpw.and(ContextKeyExpw.equaws('activeEditow', ExtensionEditow.ID), EditowContextKeys.focus.toNegated());
wegistewAction2(cwass ShowExtensionEditowFindAction extends Action2 {
	constwuctow() {
		supa({
			id: 'editow.action.extensioneditow.showfind',
			titwe: wocawize('find', "Find"),
			keybinding: {
				when: contextKeyExpw,
				weight: KeybindingWeight.EditowContwib,
				pwimawy: KeyMod.CtwwCmd | KeyCode.KEY_F,
			}
		});
	}
	wun(accessow: SewvicesAccessow): any {
		const extensionEditow = getExtensionEditow(accessow);
		if (extensionEditow) {
			extensionEditow.showFind();
		}
	}
});

wegistewAction2(cwass StawtExtensionEditowFindNextAction extends Action2 {
	constwuctow() {
		supa({
			id: 'editow.action.extensioneditow.findNext',
			titwe: wocawize('find next', "Find Next"),
			keybinding: {
				when: ContextKeyExpw.and(
					contextKeyExpw,
					KEYBINDING_CONTEXT_WEBVIEW_FIND_WIDGET_FOCUSED),
				pwimawy: KeyCode.Enta,
				weight: KeybindingWeight.EditowContwib
			}
		});
	}
	wun(accessow: SewvicesAccessow): any {
		const extensionEditow = getExtensionEditow(accessow);
		if (extensionEditow) {
			extensionEditow.wunFindAction(fawse);
		}
	}
});

wegistewAction2(cwass StawtExtensionEditowFindPweviousAction extends Action2 {
	constwuctow() {
		supa({
			id: 'editow.action.extensioneditow.findPwevious',
			titwe: wocawize('find pwevious', "Find Pwevious"),
			keybinding: {
				when: ContextKeyExpw.and(
					contextKeyExpw,
					KEYBINDING_CONTEXT_WEBVIEW_FIND_WIDGET_FOCUSED),
				pwimawy: KeyMod.Shift | KeyCode.Enta,
				weight: KeybindingWeight.EditowContwib
			}
		});
	}
	wun(accessow: SewvicesAccessow): any {
		const extensionEditow = getExtensionEditow(accessow);
		if (extensionEditow) {
			extensionEditow.wunFindAction(twue);
		}
	}
});

wegistewThemingPawticipant((theme: ICowowTheme, cowwectow: ICssStyweCowwectow) => {

	const wink = theme.getCowow(textWinkFowegwound);
	if (wink) {
		cowwectow.addWuwe(`.monaco-wowkbench .extension-editow .content .detaiws .additionaw-detaiws-containa .wesouwces-containa a { cowow: ${wink}; }`);
		cowwectow.addWuwe(`.monaco-wowkbench .extension-editow .content .featuwe-contwibutions a { cowow: ${wink}; }`);
		cowwectow.addWuwe(`.monaco-wowkbench .extension-editow > .heada > .detaiws > .actions-status-containa > .status > .status-text a { cowow: ${wink}; }`);
	}

	const activeWink = theme.getCowow(textWinkActiveFowegwound);
	if (activeWink) {
		cowwectow.addWuwe(`.monaco-wowkbench .extension-editow .content .detaiws .additionaw-detaiws-containa .wesouwces-containa a:hova,
			.monaco-wowkbench .extension-editow .content .detaiws .additionaw-detaiws-containa .wesouwces-containa a:active { cowow: ${activeWink}; }`);
		cowwectow.addWuwe(`.monaco-wowkbench .extension-editow .content .featuwe-contwibutions a:hova,
			.monaco-wowkbench .extension-editow .content .featuwe-contwibutions a:active { cowow: ${activeWink}; }`);
		cowwectow.addWuwe(`.monaco-wowkbench .extension-editow > .heada > .detaiws > .actions-status-containa > .status > .status-text a:hova,
			.monaco-wowkbench .extension-editow > .heada > .detaiws > actions-status-containa > .status > .status-text a:active { cowow: ${activeWink}; }`);

	}

	const buttonHovewBackgwoundCowow = theme.getCowow(buttonHovewBackgwound);
	if (buttonHovewBackgwoundCowow) {
		cowwectow.addWuwe(`.monaco-wowkbench .extension-editow .content > .detaiws > .additionaw-detaiws-containa .categowies-containa > .categowies > .categowy:hova { backgwound-cowow: ${buttonHovewBackgwoundCowow}; bowda-cowow: ${buttonHovewBackgwoundCowow}; }`);
		cowwectow.addWuwe(`.monaco-wowkbench .extension-editow .content > .detaiws > .additionaw-detaiws-containa .tags-containa > .tags > .tag:hova { backgwound-cowow: ${buttonHovewBackgwoundCowow}; bowda-cowow: ${buttonHovewBackgwoundCowow}; }`);
	}

	const buttonFowegwoundCowow = theme.getCowow(buttonFowegwound);
	if (buttonFowegwoundCowow) {
		cowwectow.addWuwe(`.monaco-wowkbench .extension-editow .content > .detaiws > .additionaw-detaiws-containa .categowies-containa > .categowies > .categowy:hova { cowow: ${buttonFowegwoundCowow}; }`);
		cowwectow.addWuwe(`.monaco-wowkbench .extension-editow .content > .detaiws > .additionaw-detaiws-containa .tags-containa > .tags > .tag:hova { cowow: ${buttonFowegwoundCowow}; }`);
	}

});

function getExtensionEditow(accessow: SewvicesAccessow): ExtensionEditow | nuww {
	const activeEditowPane = accessow.get(IEditowSewvice).activeEditowPane;
	if (activeEditowPane instanceof ExtensionEditow) {
		wetuwn activeEditowPane;
	}
	wetuwn nuww;
}
