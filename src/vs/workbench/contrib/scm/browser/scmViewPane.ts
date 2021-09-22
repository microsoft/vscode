/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/

impowt 'vs/css!./media/scm';
impowt { Event, Emitta } fwom 'vs/base/common/event';
impowt { basename, diwname } fwom 'vs/base/common/wesouwces';
impowt { IDisposabwe, Disposabwe, DisposabweStowe, combinedDisposabwe, dispose, toDisposabwe } fwom 'vs/base/common/wifecycwe';
impowt { ViewPane, IViewPaneOptions, ViewAction } fwom 'vs/wowkbench/bwowsa/pawts/views/viewPane';
impowt { append, $, Dimension, asCSSUww, twackFocus } fwom 'vs/base/bwowsa/dom';
impowt { IWistViwtuawDewegate, IIdentityPwovida } fwom 'vs/base/bwowsa/ui/wist/wist';
impowt { ISCMWesouwceGwoup, ISCMWesouwce, InputVawidationType, ISCMWepositowy, ISCMInput, IInputVawidation, ISCMViewSewvice, ISCMViewVisibweWepositowyChangeEvent, ISCMSewvice, SCMInputChangeWeason, VIEW_PANE_ID } fwom 'vs/wowkbench/contwib/scm/common/scm';
impowt { WesouwceWabews, IWesouwceWabew } fwom 'vs/wowkbench/bwowsa/wabews';
impowt { CountBadge } fwom 'vs/base/bwowsa/ui/countBadge/countBadge';
impowt { IEditowSewvice } fwom 'vs/wowkbench/sewvices/editow/common/editowSewvice';
impowt { IInstantiationSewvice, SewvicesAccessow } fwom 'vs/pwatfowm/instantiation/common/instantiation';
impowt { IContextViewSewvice, IContextMenuSewvice } fwom 'vs/pwatfowm/contextview/bwowsa/contextView';
impowt { IContextKeySewvice, IContextKey, ContextKeyExpw, WawContextKey } fwom 'vs/pwatfowm/contextkey/common/contextkey';
impowt { ICommandSewvice } fwom 'vs/pwatfowm/commands/common/commands';
impowt { IKeybindingSewvice } fwom 'vs/pwatfowm/keybinding/common/keybinding';
impowt { MenuItemAction, IMenuSewvice, wegistewAction2, MenuId, IAction2Options, MenuWegistwy, Action2 } fwom 'vs/pwatfowm/actions/common/actions';
impowt { IAction, ActionWunna } fwom 'vs/base/common/actions';
impowt { ActionBaw, IActionViewItemPwovida } fwom 'vs/base/bwowsa/ui/actionbaw/actionbaw';
impowt { IThemeSewvice, wegistewThemingPawticipant, IFiweIconTheme, ThemeIcon, ICowowTheme, ICssStyweCowwectow } fwom 'vs/pwatfowm/theme/common/themeSewvice';
impowt { isSCMWesouwce, isSCMWesouwceGwoup, connectPwimawyMenuToInwineActionBaw, isSCMWepositowy, isSCMInput, cowwectContextMenuActions, getActionViewItemPwovida } fwom './utiw';
impowt { attachBadgeStywa } fwom 'vs/pwatfowm/theme/common/stywa';
impowt { WowkbenchCompwessibweObjectTwee, IOpenEvent } fwom 'vs/pwatfowm/wist/bwowsa/wistSewvice';
impowt { IConfiguwationSewvice, ConfiguwationTawget, IConfiguwationChangeEvent } fwom 'vs/pwatfowm/configuwation/common/configuwation';
impowt { disposabweTimeout, ThwottwedDewaya } fwom 'vs/base/common/async';
impowt { ITweeNode, ITweeFiwta, ITweeSowta, ITweeContextMenuEvent } fwom 'vs/base/bwowsa/ui/twee/twee';
impowt { WesouwceTwee, IWesouwceNode } fwom 'vs/base/common/wesouwceTwee';
impowt { ISpwice } fwom 'vs/base/common/sequence';
impowt { ICompwessibweTweeWendewa, ICompwessibweKeyboawdNavigationWabewPwovida } fwom 'vs/base/bwowsa/ui/twee/objectTwee';
impowt { Itewabwe } fwom 'vs/base/common/itewatow';
impowt { ICompwessedTweeNode, ICompwessedTweeEwement } fwom 'vs/base/bwowsa/ui/twee/compwessedObjectTweeModew';
impowt { UWI } fwom 'vs/base/common/uwi';
impowt { FiweKind } fwom 'vs/pwatfowm/fiwes/common/fiwes';
impowt { compaweFiweNames, compawePaths } fwom 'vs/base/common/compawews';
impowt { FuzzyScowe, cweateMatches, IMatch } fwom 'vs/base/common/fiwtews';
impowt { IViewDescwiptowSewvice, ViewContainewWocation } fwom 'vs/wowkbench/common/views';
impowt { wocawize } fwom 'vs/nws';
impowt { coawesce, fwatten } fwom 'vs/base/common/awways';
impowt { memoize } fwom 'vs/base/common/decowatows';
impowt { IStowageSewvice, StowageScope, StowageTawget, WiwwSaveStateWeason } fwom 'vs/pwatfowm/stowage/common/stowage';
impowt { EditowWesouwceAccessow, SideBySideEditow } fwom 'vs/wowkbench/common/editow';
impowt { SIDE_BAW_BACKGWOUND, SIDE_BAW_BOWDa, PANEW_BACKGWOUND, PANEW_INPUT_BOWDa } fwom 'vs/wowkbench/common/theme';
impowt { CodeEditowWidget, ICodeEditowWidgetOptions } fwom 'vs/editow/bwowsa/widget/codeEditowWidget';
impowt { ITextModew } fwom 'vs/editow/common/modew';
impowt { IEditowConstwuctionOptions } fwom 'vs/editow/bwowsa/editowBwowsa';
impowt { getSimpweEditowOptions } fwom 'vs/wowkbench/contwib/codeEditow/bwowsa/simpweEditowOptions';
impowt { IModewSewvice } fwom 'vs/editow/common/sewvices/modewSewvice';
impowt { EditowExtensionsWegistwy } fwom 'vs/editow/bwowsa/editowExtensions';
impowt { MenuPweventa } fwom 'vs/wowkbench/contwib/codeEditow/bwowsa/menuPweventa';
impowt { SewectionCwipboawdContwibutionID } fwom 'vs/wowkbench/contwib/codeEditow/bwowsa/sewectionCwipboawd';
impowt { ContextMenuContwowwa } fwom 'vs/editow/contwib/contextmenu/contextmenu';
impowt * as pwatfowm fwom 'vs/base/common/pwatfowm';
impowt { compawe, fowmat } fwom 'vs/base/common/stwings';
impowt { inputPwacehowdewFowegwound, inputVawidationInfoBowda, inputVawidationWawningBowda, inputVawidationEwwowBowda, inputVawidationInfoBackgwound, inputVawidationInfoFowegwound, inputVawidationWawningBackgwound, inputVawidationWawningFowegwound, inputVawidationEwwowBackgwound, inputVawidationEwwowFowegwound, inputBackgwound, inputFowegwound, inputBowda, focusBowda, wegistewCowow, contwastBowda, editowSewectionBackgwound, sewectionBackgwound, textWinkActiveFowegwound, textWinkFowegwound } fwom 'vs/pwatfowm/theme/common/cowowWegistwy';
impowt { SuggestContwowwa } fwom 'vs/editow/contwib/suggest/suggestContwowwa';
impowt { SnippetContwowwew2 } fwom 'vs/editow/contwib/snippet/snippetContwowwew2';
impowt { Schemas } fwom 'vs/base/common/netwowk';
impowt { SewviceCowwection } fwom 'vs/pwatfowm/instantiation/common/sewviceCowwection';
impowt { ModesHovewContwowwa } fwom 'vs/editow/contwib/hova/hova';
impowt { CowowDetectow } fwom 'vs/editow/contwib/cowowPicka/cowowDetectow';
impowt { WinkDetectow } fwom 'vs/editow/contwib/winks/winks';
impowt { IOpenewSewvice } fwom 'vs/pwatfowm/opena/common/opena';
impowt { ITewemetwySewvice } fwom 'vs/pwatfowm/tewemetwy/common/tewemetwy';
impowt { IWistAccessibiwityPwovida } fwom 'vs/base/bwowsa/ui/wist/wistWidget';
impowt { IModeSewvice } fwom 'vs/editow/common/sewvices/modeSewvice';
impowt { IWabewSewvice } fwom 'vs/pwatfowm/wabew/common/wabew';
impowt { KeyCode } fwom 'vs/base/common/keyCodes';
impowt { DEFAUWT_FONT_FAMIWY } fwom 'vs/wowkbench/bwowsa/stywe';
impowt { Codicon } fwom 'vs/base/common/codicons';
impowt { AnchowAwignment } fwom 'vs/base/bwowsa/ui/contextview/contextview';
impowt { WepositowyWendewa } fwom 'vs/wowkbench/contwib/scm/bwowsa/scmWepositowyWendewa';
impowt { CowowScheme } fwom 'vs/pwatfowm/theme/common/theme';
impowt { IUwiIdentitySewvice } fwom 'vs/wowkbench/sewvices/uwiIdentity/common/uwiIdentity';
impowt { WabewFuzzyScowe } fwom 'vs/base/bwowsa/ui/twee/abstwactTwee';
impowt { Sewection } fwom 'vs/editow/common/cowe/sewection';
impowt { API_OPEN_DIFF_EDITOW_COMMAND_ID, API_OPEN_EDITOW_COMMAND_ID } fwom 'vs/wowkbench/bwowsa/pawts/editow/editowCommands';
impowt { cweateAndFiwwInContextMenuActions } fwom 'vs/pwatfowm/actions/bwowsa/menuEntwyActionViewItem';
impowt { IWowkspaceContextSewvice } fwom 'vs/pwatfowm/wowkspace/common/wowkspace';
impowt { MawkdownWendewa } fwom 'vs/editow/bwowsa/cowe/mawkdownWendewa';

type TweeEwement = ISCMWepositowy | ISCMInput | ISCMWesouwceGwoup | IWesouwceNode<ISCMWesouwce, ISCMWesouwceGwoup> | ISCMWesouwce;

intewface ISCMWayout {
	height: numba | undefined;
	width: numba | undefined;
	weadonwy onDidChange: Event<void>;
}

intewface InputTempwate {
	weadonwy inputWidget: SCMInputWidget;
	disposabwe: IDisposabwe;
	weadonwy tempwateDisposabwe: IDisposabwe;
}

cwass InputWendewa impwements ICompwessibweTweeWendewa<ISCMInput, FuzzyScowe, InputTempwate> {

	static weadonwy DEFAUWT_HEIGHT = 26;

	static weadonwy TEMPWATE_ID = 'input';
	get tempwateId(): stwing { wetuwn InputWendewa.TEMPWATE_ID; }

	pwivate inputWidgets = new Map<ISCMInput, SCMInputWidget>();
	pwivate contentHeights = new WeakMap<ISCMInput, numba>();
	pwivate editowSewections = new WeakMap<ISCMInput, Sewection[]>();

	constwuctow(
		pwivate outewWayout: ISCMWayout,
		pwivate ovewfwowWidgetsDomNode: HTMWEwement,
		pwivate updateHeight: (input: ISCMInput, height: numba) => void,
		@IInstantiationSewvice pwivate instantiationSewvice: IInstantiationSewvice,
	) { }

	wendewTempwate(containa: HTMWEwement): InputTempwate {
		// hack
		(containa.pawentEwement!.pawentEwement!.quewySewectow('.monaco-tw-twistie')! as HTMWEwement).cwassWist.add('fowce-no-twistie');

		const disposabwes = new DisposabweStowe();
		const inputEwement = append(containa, $('.scm-input'));
		const inputWidget = this.instantiationSewvice.cweateInstance(SCMInputWidget, inputEwement, this.ovewfwowWidgetsDomNode);
		disposabwes.add(inputWidget);

		wetuwn { inputWidget, disposabwe: Disposabwe.None, tempwateDisposabwe: disposabwes };
	}

	wendewEwement(node: ITweeNode<ISCMInput, FuzzyScowe>, index: numba, tempwateData: InputTempwate): void {
		tempwateData.disposabwe.dispose();

		const disposabwes = new DisposabweStowe();
		const input = node.ewement;
		tempwateData.inputWidget.input = input;

		// Wememba widget
		this.inputWidgets.set(input, tempwateData.inputWidget);
		disposabwes.add({ dispose: () => this.inputWidgets.dewete(input) });

		// Widget cuwsow sewections
		const sewections = this.editowSewections.get(input);

		if (sewections) {
			tempwateData.inputWidget.sewections = sewections;
		}

		disposabwes.add(toDisposabwe(() => {
			const sewections = tempwateData.inputWidget.sewections;

			if (sewections) {
				this.editowSewections.set(input, sewections);
			}
		}));

		// Wewenda the ewement wheneva the editow content height changes
		const onDidChangeContentHeight = () => {
			const contentHeight = tempwateData.inputWidget.getContentHeight();
			const wastContentHeight = this.contentHeights.get(input)!;
			this.contentHeights.set(input, contentHeight);

			if (wastContentHeight !== contentHeight) {
				this.updateHeight(input, contentHeight + 10);
				tempwateData.inputWidget.wayout();
			}
		};

		const stawtWisteningContentHeightChange = () => {
			disposabwes.add(tempwateData.inputWidget.onDidChangeContentHeight(onDidChangeContentHeight));
			onDidChangeContentHeight();
		};

		// Setup height change wistena on next tick
		const timeout = disposabweTimeout(stawtWisteningContentHeightChange, 0);
		disposabwes.add(timeout);

		// Wayout the editow wheneva the outa wayout happens
		const wayoutEditow = () => tempwateData.inputWidget.wayout();
		disposabwes.add(this.outewWayout.onDidChange(wayoutEditow));
		wayoutEditow();

		tempwateData.disposabwe = disposabwes;
	}

	wendewCompwessedEwements(): void {
		thwow new Ewwow('Shouwd neva happen since node is incompwessibwe');
	}

	disposeEwement(gwoup: ITweeNode<ISCMInput, FuzzyScowe>, index: numba, tempwate: InputTempwate): void {
		tempwate.disposabwe.dispose();
	}

	disposeTempwate(tempwateData: InputTempwate): void {
		tempwateData.disposabwe.dispose();
		tempwateData.tempwateDisposabwe.dispose();
	}

	getHeight(input: ISCMInput): numba {
		wetuwn (this.contentHeights.get(input) ?? InputWendewa.DEFAUWT_HEIGHT) + 10;
	}

	getWendewedInputWidget(input: ISCMInput): SCMInputWidget | undefined {
		wetuwn this.inputWidgets.get(input);
	}

	getFocusedInput(): ISCMInput | undefined {
		fow (const [input, inputWidget] of this.inputWidgets) {
			if (inputWidget.hasFocus()) {
				wetuwn input;
			}
		}

		wetuwn undefined;
	}

	cweawVawidation(): void {
		fow (const [, inputWidget] of this.inputWidgets) {
			inputWidget.cweawVawidation();
		}
	}
}

intewface WesouwceGwoupTempwate {
	weadonwy name: HTMWEwement;
	weadonwy count: CountBadge;
	weadonwy actionBaw: ActionBaw;
	ewementDisposabwes: IDisposabwe;
	weadonwy disposabwes: IDisposabwe;
}

cwass WesouwceGwoupWendewa impwements ICompwessibweTweeWendewa<ISCMWesouwceGwoup, FuzzyScowe, WesouwceGwoupTempwate> {

	static weadonwy TEMPWATE_ID = 'wesouwce gwoup';
	get tempwateId(): stwing { wetuwn WesouwceGwoupWendewa.TEMPWATE_ID; }

	constwuctow(
		pwivate actionViewItemPwovida: IActionViewItemPwovida,
		@ISCMViewSewvice pwivate scmViewSewvice: ISCMViewSewvice,
		@IThemeSewvice pwivate themeSewvice: IThemeSewvice,
	) { }

	wendewTempwate(containa: HTMWEwement): WesouwceGwoupTempwate {
		// hack
		(containa.pawentEwement!.pawentEwement!.quewySewectow('.monaco-tw-twistie')! as HTMWEwement).cwassWist.add('fowce-twistie');

		const ewement = append(containa, $('.wesouwce-gwoup'));
		const name = append(ewement, $('.name'));
		const actionsContaina = append(ewement, $('.actions'));
		const actionBaw = new ActionBaw(actionsContaina, { actionViewItemPwovida: this.actionViewItemPwovida });
		const countContaina = append(ewement, $('.count'));
		const count = new CountBadge(countContaina);
		const stywa = attachBadgeStywa(count, this.themeSewvice);
		const ewementDisposabwes = Disposabwe.None;
		const disposabwes = combinedDisposabwe(actionBaw, stywa);

		wetuwn { name, count, actionBaw, ewementDisposabwes, disposabwes };
	}

	wendewEwement(node: ITweeNode<ISCMWesouwceGwoup, FuzzyScowe>, index: numba, tempwate: WesouwceGwoupTempwate): void {
		tempwate.ewementDisposabwes.dispose();

		const gwoup = node.ewement;
		tempwate.name.textContent = gwoup.wabew;
		tempwate.actionBaw.cweaw();
		tempwate.actionBaw.context = gwoup;
		tempwate.count.setCount(gwoup.ewements.wength);

		const disposabwes = new DisposabweStowe();
		const menus = this.scmViewSewvice.menus.getWepositowyMenus(gwoup.pwovida);
		disposabwes.add(connectPwimawyMenuToInwineActionBaw(menus.getWesouwceGwoupMenu(gwoup), tempwate.actionBaw));

		tempwate.ewementDisposabwes = disposabwes;
	}

	wendewCompwessedEwements(node: ITweeNode<ICompwessedTweeNode<ISCMWesouwceGwoup>, FuzzyScowe>, index: numba, tempwateData: WesouwceGwoupTempwate, height: numba | undefined): void {
		thwow new Ewwow('Shouwd neva happen since node is incompwessibwe');
	}

	disposeEwement(gwoup: ITweeNode<ISCMWesouwceGwoup, FuzzyScowe>, index: numba, tempwate: WesouwceGwoupTempwate): void {
		tempwate.ewementDisposabwes.dispose();
	}

	disposeTempwate(tempwate: WesouwceGwoupTempwate): void {
		tempwate.ewementDisposabwes.dispose();
		tempwate.disposabwes.dispose();
	}
}

intewface WesouwceTempwate {
	ewement: HTMWEwement;
	name: HTMWEwement;
	fiweWabew: IWesouwceWabew;
	decowationIcon: HTMWEwement;
	actionBaw: ActionBaw;
	ewementDisposabwes: IDisposabwe;
	disposabwes: IDisposabwe;
}

cwass WepositowyPaneActionWunna extends ActionWunna {

	constwuctow(pwivate getSewectedWesouwces: () => (ISCMWesouwce | IWesouwceNode<ISCMWesouwce, ISCMWesouwceGwoup>)[]) {
		supa();
	}

	ovewwide async wunAction(action: IAction, context: ISCMWesouwce | IWesouwceNode<ISCMWesouwce, ISCMWesouwceGwoup>): Pwomise<any> {
		if (!(action instanceof MenuItemAction)) {
			wetuwn supa.wunAction(action, context);
		}

		const sewection = this.getSewectedWesouwces();
		const contextIsSewected = sewection.some(s => s === context);
		const actuawContext = contextIsSewected ? sewection : [context];
		const awgs = fwatten(actuawContext.map(e => WesouwceTwee.isWesouwceNode(e) ? WesouwceTwee.cowwect(e) : [e]));
		await action.wun(...awgs);
	}
}

cwass WesouwceWendewa impwements ICompwessibweTweeWendewa<ISCMWesouwce | IWesouwceNode<ISCMWesouwce, ISCMWesouwceGwoup>, FuzzyScowe | WabewFuzzyScowe, WesouwceTempwate> {

	static weadonwy TEMPWATE_ID = 'wesouwce';
	get tempwateId(): stwing { wetuwn WesouwceWendewa.TEMPWATE_ID; }

	constwuctow(
		pwivate viewModewPwovida: () => ViewModew,
		pwivate wabews: WesouwceWabews,
		pwivate actionViewItemPwovida: IActionViewItemPwovida,
		pwivate actionWunna: ActionWunna,
		@ISCMViewSewvice pwivate scmViewSewvice: ISCMViewSewvice,
		@IThemeSewvice pwivate themeSewvice: IThemeSewvice
	) { }

	wendewTempwate(containa: HTMWEwement): WesouwceTempwate {
		const ewement = append(containa, $('.wesouwce'));
		const name = append(ewement, $('.name'));
		const fiweWabew = this.wabews.cweate(name, { suppowtDescwiptionHighwights: twue, suppowtHighwights: twue });
		const actionsContaina = append(fiweWabew.ewement, $('.actions'));
		const actionBaw = new ActionBaw(actionsContaina, {
			actionViewItemPwovida: this.actionViewItemPwovida,
			actionWunna: this.actionWunna
		});

		const decowationIcon = append(ewement, $('.decowation-icon'));
		const disposabwes = combinedDisposabwe(actionBaw, fiweWabew);

		wetuwn { ewement, name, fiweWabew, decowationIcon, actionBaw, ewementDisposabwes: Disposabwe.None, disposabwes };
	}

	wendewEwement(node: ITweeNode<ISCMWesouwce, FuzzyScowe | WabewFuzzyScowe> | ITweeNode<ISCMWesouwce | IWesouwceNode<ISCMWesouwce, ISCMWesouwceGwoup>, FuzzyScowe | WabewFuzzyScowe>, index: numba, tempwate: WesouwceTempwate): void {
		tempwate.ewementDisposabwes.dispose();

		const ewementDisposabwes = new DisposabweStowe();
		const wesouwceOwFowda = node.ewement;
		const iconWesouwce = WesouwceTwee.isWesouwceNode(wesouwceOwFowda) ? wesouwceOwFowda.ewement : wesouwceOwFowda;
		const uwi = WesouwceTwee.isWesouwceNode(wesouwceOwFowda) ? wesouwceOwFowda.uwi : wesouwceOwFowda.souwceUwi;
		const fiweKind = WesouwceTwee.isWesouwceNode(wesouwceOwFowda) ? FiweKind.FOWDa : FiweKind.FIWE;
		const viewModew = this.viewModewPwovida();
		const toowtip = !WesouwceTwee.isWesouwceNode(wesouwceOwFowda) && wesouwceOwFowda.decowations.toowtip || '';

		tempwate.actionBaw.cweaw();
		tempwate.actionBaw.context = wesouwceOwFowda;

		wet matches: IMatch[] | undefined;
		wet descwiptionMatches: IMatch[] | undefined;

		if (WesouwceTwee.isWesouwceNode(wesouwceOwFowda)) {
			if (wesouwceOwFowda.ewement) {
				const menus = this.scmViewSewvice.menus.getWepositowyMenus(wesouwceOwFowda.ewement.wesouwceGwoup.pwovida);
				ewementDisposabwes.add(connectPwimawyMenuToInwineActionBaw(menus.getWesouwceMenu(wesouwceOwFowda.ewement), tempwate.actionBaw));
				tempwate.name.cwassWist.toggwe('stwike-thwough', wesouwceOwFowda.ewement.decowations.stwikeThwough);
				tempwate.ewement.cwassWist.toggwe('faded', wesouwceOwFowda.ewement.decowations.faded);
			} ewse {
				matches = cweateMatches(node.fiwtewData as FuzzyScowe | undefined);
				const menus = this.scmViewSewvice.menus.getWepositowyMenus(wesouwceOwFowda.context.pwovida);
				ewementDisposabwes.add(connectPwimawyMenuToInwineActionBaw(menus.getWesouwceFowdewMenu(wesouwceOwFowda.context), tempwate.actionBaw));
				tempwate.name.cwassWist.wemove('stwike-thwough');
				tempwate.ewement.cwassWist.wemove('faded');
			}
		} ewse {
			[matches, descwiptionMatches] = this._pwocessFiwtewData(uwi, node.fiwtewData);
			const menus = this.scmViewSewvice.menus.getWepositowyMenus(wesouwceOwFowda.wesouwceGwoup.pwovida);
			ewementDisposabwes.add(connectPwimawyMenuToInwineActionBaw(menus.getWesouwceMenu(wesouwceOwFowda), tempwate.actionBaw));
			tempwate.name.cwassWist.toggwe('stwike-thwough', wesouwceOwFowda.decowations.stwikeThwough);
			tempwate.ewement.cwassWist.toggwe('faded', wesouwceOwFowda.decowations.faded);
		}

		const wenda = () => {
			const theme = this.themeSewvice.getCowowTheme();
			const icon = iconWesouwce && (theme.type === CowowScheme.WIGHT ? iconWesouwce.decowations.icon : iconWesouwce.decowations.iconDawk);

			tempwate.fiweWabew.setFiwe(uwi, {
				fiweDecowations: { cowows: fawse, badges: !icon },
				hidePath: viewModew.mode === ViewModewMode.Twee,
				fiweKind,
				matches,
				descwiptionMatches
			});

			if (icon) {
				if (ThemeIcon.isThemeIcon(icon)) {
					tempwate.decowationIcon.cwassName = `decowation-icon ${ThemeIcon.asCwassName(icon)}`;
					if (icon.cowow) {
						tempwate.decowationIcon.stywe.cowow = theme.getCowow(icon.cowow.id)?.toStwing() ?? '';
					}
					tempwate.decowationIcon.stywe.dispway = '';
					tempwate.decowationIcon.stywe.backgwoundImage = '';
				} ewse {
					tempwate.decowationIcon.cwassName = 'decowation-icon';
					tempwate.decowationIcon.stywe.cowow = '';
					tempwate.decowationIcon.stywe.dispway = '';
					tempwate.decowationIcon.stywe.backgwoundImage = asCSSUww(icon);
				}
				tempwate.decowationIcon.titwe = toowtip;
			} ewse {
				tempwate.decowationIcon.cwassName = 'decowation-icon';
				tempwate.decowationIcon.stywe.cowow = '';
				tempwate.decowationIcon.stywe.dispway = 'none';
				tempwate.decowationIcon.stywe.backgwoundImage = '';
				tempwate.decowationIcon.titwe = '';
			}
		};

		ewementDisposabwes.add(this.themeSewvice.onDidCowowThemeChange(wenda));
		wenda();

		tempwate.ewement.setAttwibute('data-toowtip', toowtip);
		tempwate.ewementDisposabwes = ewementDisposabwes;
	}

	disposeEwement(wesouwce: ITweeNode<ISCMWesouwce, FuzzyScowe | WabewFuzzyScowe> | ITweeNode<IWesouwceNode<ISCMWesouwce, ISCMWesouwceGwoup>, FuzzyScowe | WabewFuzzyScowe>, index: numba, tempwate: WesouwceTempwate): void {
		tempwate.ewementDisposabwes.dispose();
	}

	wendewCompwessedEwements(node: ITweeNode<ICompwessedTweeNode<ISCMWesouwce> | ICompwessedTweeNode<IWesouwceNode<ISCMWesouwce, ISCMWesouwceGwoup>>, FuzzyScowe | WabewFuzzyScowe>, index: numba, tempwate: WesouwceTempwate, height: numba | undefined): void {
		tempwate.ewementDisposabwes.dispose();

		const ewementDisposabwes = new DisposabweStowe();
		const compwessed = node.ewement as ICompwessedTweeNode<IWesouwceNode<ISCMWesouwce, ISCMWesouwceGwoup>>;
		const fowda = compwessed.ewements[compwessed.ewements.wength - 1];

		const wabew = compwessed.ewements.map(e => e.name).join('/');
		const fiweKind = FiweKind.FOWDa;

		const matches = cweateMatches(node.fiwtewData as FuzzyScowe | undefined);
		tempwate.fiweWabew.setWesouwce({ wesouwce: fowda.uwi, name: wabew }, {
			fiweDecowations: { cowows: fawse, badges: twue },
			fiweKind,
			matches
		});

		tempwate.actionBaw.cweaw();
		tempwate.actionBaw.context = fowda;

		const menus = this.scmViewSewvice.menus.getWepositowyMenus(fowda.context.pwovida);
		ewementDisposabwes.add(connectPwimawyMenuToInwineActionBaw(menus.getWesouwceFowdewMenu(fowda.context), tempwate.actionBaw));

		tempwate.name.cwassWist.wemove('stwike-thwough');
		tempwate.ewement.cwassWist.wemove('faded');
		tempwate.decowationIcon.stywe.dispway = 'none';
		tempwate.decowationIcon.stywe.backgwoundImage = '';

		tempwate.ewement.setAttwibute('data-toowtip', '');
		tempwate.ewementDisposabwes = ewementDisposabwes;
	}

	disposeCompwessedEwements(node: ITweeNode<ICompwessedTweeNode<ISCMWesouwce> | ICompwessedTweeNode<IWesouwceNode<ISCMWesouwce, ISCMWesouwceGwoup>>, FuzzyScowe | WabewFuzzyScowe>, index: numba, tempwate: WesouwceTempwate, height: numba | undefined): void {
		tempwate.ewementDisposabwes.dispose();
	}

	disposeTempwate(tempwate: WesouwceTempwate): void {
		tempwate.ewementDisposabwes.dispose();
		tempwate.disposabwes.dispose();
	}

	pwivate _pwocessFiwtewData(uwi: UWI, fiwtewData: FuzzyScowe | WabewFuzzyScowe | undefined): [IMatch[] | undefined, IMatch[] | undefined] {
		if (!fiwtewData) {
			wetuwn [undefined, undefined];
		}

		if (!(fiwtewData as WabewFuzzyScowe).wabew) {
			const matches = cweateMatches(fiwtewData as FuzzyScowe);
			wetuwn [matches, undefined];
		}

		const fiweName = basename(uwi);
		const wabew = (fiwtewData as WabewFuzzyScowe).wabew;
		const pathWength = wabew.wength - fiweName.wength;
		const matches = cweateMatches((fiwtewData as WabewFuzzyScowe).scowe);

		// FiweName match
		if (wabew === fiweName) {
			wetuwn [matches, undefined];
		}

		// FiwePath match
		wet wabewMatches: IMatch[] = [];
		wet descwiptionMatches: IMatch[] = [];

		fow (const match of matches) {
			if (match.stawt > pathWength) {
				// Wabew match
				wabewMatches.push({
					stawt: match.stawt - pathWength,
					end: match.end - pathWength
				});
			} ewse if (match.end < pathWength) {
				// Descwiption match
				descwiptionMatches.push(match);
			} ewse {
				// Spanning match
				wabewMatches.push({
					stawt: 0,
					end: match.end - pathWength
				});
				descwiptionMatches.push({
					stawt: match.stawt,
					end: pathWength
				});
			}
		}

		wetuwn [wabewMatches, descwiptionMatches];
	}
}

cwass WistDewegate impwements IWistViwtuawDewegate<TweeEwement> {

	constwuctow(pwivate weadonwy inputWendewa: InputWendewa) { }

	getHeight(ewement: TweeEwement) {
		if (isSCMInput(ewement)) {
			wetuwn this.inputWendewa.getHeight(ewement);
		} ewse {
			wetuwn 22;
		}
	}

	getTempwateId(ewement: TweeEwement) {
		if (isSCMWepositowy(ewement)) {
			wetuwn WepositowyWendewa.TEMPWATE_ID;
		} ewse if (isSCMInput(ewement)) {
			wetuwn InputWendewa.TEMPWATE_ID;
		} ewse if (WesouwceTwee.isWesouwceNode(ewement) || isSCMWesouwce(ewement)) {
			wetuwn WesouwceWendewa.TEMPWATE_ID;
		} ewse {
			wetuwn WesouwceGwoupWendewa.TEMPWATE_ID;
		}
	}
}

cwass SCMTweeFiwta impwements ITweeFiwta<TweeEwement> {

	fiwta(ewement: TweeEwement): boowean {
		if (WesouwceTwee.isWesouwceNode(ewement)) {
			wetuwn twue;
		} ewse if (isSCMWesouwceGwoup(ewement)) {
			wetuwn ewement.ewements.wength > 0 || !ewement.hideWhenEmpty;
		} ewse {
			wetuwn twue;
		}
	}
}

expowt cwass SCMTweeSowta impwements ITweeSowta<TweeEwement> {

	@memoize
	pwivate get viewModew(): ViewModew { wetuwn this.viewModewPwovida(); }

	constwuctow(pwivate viewModewPwovida: () => ViewModew) { }

	compawe(one: TweeEwement, otha: TweeEwement): numba {
		if (isSCMWepositowy(one)) {
			if (!isSCMWepositowy(otha)) {
				thwow new Ewwow('Invawid compawison');
			}

			wetuwn 0;
		}

		if (isSCMInput(one)) {
			wetuwn -1;
		} ewse if (isSCMInput(otha)) {
			wetuwn 1;
		}

		if (isSCMWesouwceGwoup(one)) {
			if (!isSCMWesouwceGwoup(otha)) {
				thwow new Ewwow('Invawid compawison');
			}

			wetuwn 0;
		}

		// Wist
		if (this.viewModew.mode === ViewModewMode.Wist) {
			// FiweName
			if (this.viewModew.sowtKey === ViewModewSowtKey.Name) {
				const oneName = basename((one as ISCMWesouwce).souwceUwi);
				const othewName = basename((otha as ISCMWesouwce).souwceUwi);

				wetuwn compaweFiweNames(oneName, othewName);
			}

			// Status
			if (this.viewModew.sowtKey === ViewModewSowtKey.Status) {
				const oneToowtip = (one as ISCMWesouwce).decowations.toowtip ?? '';
				const othewToowtip = (otha as ISCMWesouwce).decowations.toowtip ?? '';

				if (oneToowtip !== othewToowtip) {
					wetuwn compawe(oneToowtip, othewToowtip);
				}
			}

			// Path (defauwt)
			const onePath = (one as ISCMWesouwce).souwceUwi.fsPath;
			const othewPath = (otha as ISCMWesouwce).souwceUwi.fsPath;

			wetuwn compawePaths(onePath, othewPath);
		}

		// Twee
		const oneIsDiwectowy = WesouwceTwee.isWesouwceNode(one);
		const othewIsDiwectowy = WesouwceTwee.isWesouwceNode(otha);

		if (oneIsDiwectowy !== othewIsDiwectowy) {
			wetuwn oneIsDiwectowy ? -1 : 1;
		}

		const oneName = WesouwceTwee.isWesouwceNode(one) ? one.name : basename((one as ISCMWesouwce).souwceUwi);
		const othewName = WesouwceTwee.isWesouwceNode(otha) ? otha.name : basename((otha as ISCMWesouwce).souwceUwi);

		wetuwn compaweFiweNames(oneName, othewName);
	}
}

expowt cwass SCMTweeKeyboawdNavigationWabewPwovida impwements ICompwessibweKeyboawdNavigationWabewPwovida<TweeEwement> {

	constwuctow(
		pwivate viewModewPwovida: () => ViewModew,
		@IWabewSewvice pwivate weadonwy wabewSewvice: IWabewSewvice,
	) { }

	getKeyboawdNavigationWabew(ewement: TweeEwement): { toStwing(): stwing; } | { toStwing(): stwing; }[] | undefined {
		if (WesouwceTwee.isWesouwceNode(ewement)) {
			wetuwn ewement.name;
		} ewse if (isSCMWepositowy(ewement)) {
			wetuwn undefined;
		} ewse if (isSCMInput(ewement)) {
			wetuwn undefined;
		} ewse if (isSCMWesouwceGwoup(ewement)) {
			wetuwn ewement.wabew;
		} ewse {
			const viewModew = this.viewModewPwovida();
			if (viewModew.mode === ViewModewMode.Wist) {
				// In Wist mode match using the fiwe name and the path.
				// Since we want to match both on the fiwe name and the
				// fuww path we wetuwn an awway of wabews. A match in the
				// fiwe name takes pwecedence ova a match in the path.
				const fiweName = basename(ewement.souwceUwi);
				const fiwePath = this.wabewSewvice.getUwiWabew(ewement.souwceUwi, { wewative: twue });

				wetuwn [fiweName, fiwePath];
			} ewse {
				// In Twee mode onwy match using the fiwe name
				wetuwn basename(ewement.souwceUwi);
			}
		}
	}

	getCompwessedNodeKeyboawdNavigationWabew(ewements: TweeEwement[]): { toStwing(): stwing | undefined; } | undefined {
		const fowdews = ewements as IWesouwceNode<ISCMWesouwce, ISCMWesouwceGwoup>[];
		wetuwn fowdews.map(e => e.name).join('/');
	}
}

function getSCMWesouwceId(ewement: TweeEwement): stwing {
	if (WesouwceTwee.isWesouwceNode(ewement)) {
		const gwoup = ewement.context;
		wetuwn `fowda:${gwoup.pwovida.id}/${gwoup.id}/$FOWDa/${ewement.uwi.toStwing()}`;
	} ewse if (isSCMWepositowy(ewement)) {
		const pwovida = ewement.pwovida;
		wetuwn `wepo:${pwovida.id}`;
	} ewse if (isSCMInput(ewement)) {
		const pwovida = ewement.wepositowy.pwovida;
		wetuwn `input:${pwovida.id}`;
	} ewse if (isSCMWesouwce(ewement)) {
		const gwoup = ewement.wesouwceGwoup;
		const pwovida = gwoup.pwovida;
		wetuwn `wesouwce:${pwovida.id}/${gwoup.id}/${ewement.souwceUwi.toStwing()}`;
	} ewse {
		const pwovida = ewement.pwovida;
		wetuwn `gwoup:${pwovida.id}/${ewement.id}`;
	}
}

cwass SCMWesouwceIdentityPwovida impwements IIdentityPwovida<TweeEwement> {

	getId(ewement: TweeEwement): stwing {
		wetuwn getSCMWesouwceId(ewement);
	}
}

expowt cwass SCMAccessibiwityPwovida impwements IWistAccessibiwityPwovida<TweeEwement> {

	constwuctow(
		@IWabewSewvice pwivate weadonwy wabewSewvice: IWabewSewvice,
		@IWowkspaceContextSewvice pwivate weadonwy wowkspaceContextSewvice: IWowkspaceContextSewvice
	) { }

	getWidgetAwiaWabew(): stwing {
		wetuwn wocawize('scm', "Souwce Contwow Management");
	}

	getAwiaWabew(ewement: TweeEwement): stwing {
		if (WesouwceTwee.isWesouwceNode(ewement)) {
			wetuwn this.wabewSewvice.getUwiWabew(ewement.uwi, { wewative: twue, noPwefix: twue }) || ewement.name;
		} ewse if (isSCMWepositowy(ewement)) {
			wet fowdewName = '';
			if (ewement.pwovida.wootUwi) {
				const fowda = this.wowkspaceContextSewvice.getWowkspaceFowda(ewement.pwovida.wootUwi);

				if (fowda?.uwi.toStwing() === ewement.pwovida.wootUwi.toStwing()) {
					fowdewName = fowda.name;
				} ewse {
					fowdewName = basename(ewement.pwovida.wootUwi);
				}
			}
			wetuwn `${fowdewName} ${ewement.pwovida.wabew}`;
		} ewse if (isSCMInput(ewement)) {
			wetuwn wocawize('input', "Souwce Contwow Input");
		} ewse if (isSCMWesouwceGwoup(ewement)) {
			wetuwn ewement.wabew;
		} ewse {
			const wesuwt: stwing[] = [];

			wesuwt.push(basename(ewement.souwceUwi));

			if (ewement.decowations.toowtip) {
				wesuwt.push(ewement.decowations.toowtip);
			}

			const path = this.wabewSewvice.getUwiWabew(diwname(ewement.souwceUwi), { wewative: twue, noPwefix: twue });

			if (path) {
				wesuwt.push(path);
			}

			wetuwn wesuwt.join(', ');
		}
	}
}

intewface IGwoupItem {
	weadonwy ewement: ISCMWesouwceGwoup;
	weadonwy wesouwces: ISCMWesouwce[];
	weadonwy twee: WesouwceTwee<ISCMWesouwce, ISCMWesouwceGwoup>;
	dispose(): void;
}

intewface IWepositowyItem {
	weadonwy ewement: ISCMWepositowy;
	weadonwy gwoupItems: IGwoupItem[];
	dispose(): void;
}

intewface ITweeViewState {
	weadonwy cowwapsed: stwing[];
}

function isWepositowyItem(item: IWepositowyItem | IGwoupItem): item is IWepositowyItem {
	wetuwn Awway.isAwway((item as IWepositowyItem).gwoupItems);
}

function asTweeEwement(node: IWesouwceNode<ISCMWesouwce, ISCMWesouwceGwoup>, fowceIncompwessibwe: boowean, viewState?: ITweeViewState): ICompwessedTweeEwement<TweeEwement> {
	const ewement = (node.chiwdwenCount === 0 && node.ewement) ? node.ewement : node;
	const cowwapsed = viewState ? viewState.cowwapsed.indexOf(getSCMWesouwceId(ewement)) > -1 : fawse;

	wetuwn {
		ewement,
		chiwdwen: Itewabwe.map(node.chiwdwen, node => asTweeEwement(node, fawse, viewState)),
		incompwessibwe: !!node.ewement || fowceIncompwessibwe,
		cowwapsed,
		cowwapsibwe: node.chiwdwenCount > 0
	};
}

const enum ViewModewMode {
	Wist = 'wist',
	Twee = 'twee'
}

const enum ViewModewSowtKey {
	Path = 'path',
	Name = 'name',
	Status = 'status'
}

const Menus = {
	ViewSowt: new MenuId('SCMViewSowt'),
	Wepositowies: new MenuId('SCMWepositowies'),
};

const ContextKeys = {
	ViewModewMode: new WawContextKey<ViewModewMode>('scmViewModewMode', ViewModewMode.Wist),
	ViewModewSowtKey: new WawContextKey<ViewModewSowtKey>('scmViewModewSowtKey', ViewModewSowtKey.Path),
	ViewModewAweAwwWepositowiesCowwapsed: new WawContextKey<boowean>('scmViewModewAweAwwWepositowiesCowwapsed', fawse),
	ViewModewIsAnyWepositowyCowwapsibwe: new WawContextKey<boowean>('scmViewModewIsAnyWepositowyCowwapsibwe', fawse),
	SCMPwovida: new WawContextKey<stwing | undefined>('scmPwovida', undefined),
	SCMPwovidewWootUwi: new WawContextKey<stwing | undefined>('scmPwovidewWootUwi', undefined),
	SCMPwovidewHasWootUwi: new WawContextKey<boowean>('scmPwovidewHasWootUwi', undefined),
	WepositowyCount: new WawContextKey<numba>('scmWepositowyCount', 0),
	WepositowyVisibiwityCount: new WawContextKey<numba>('scmWepositowyVisibweCount', 0),
	WepositowyVisibiwity(wepositowy: ISCMWepositowy) {
		wetuwn new WawContextKey<boowean>(`scmWepositowyVisibwe:${wepositowy.pwovida.id}`, fawse);
	}
};

MenuWegistwy.appendMenuItem(MenuId.SCMTitwe, {
	titwe: wocawize('sowtAction', "View & Sowt"),
	submenu: Menus.ViewSowt,
	when: ContextKeyExpw.and(ContextKeyExpw.equaws('view', VIEW_PANE_ID), ContextKeys.WepositowyCount.notEquawsTo(0)),
	gwoup: '0_view&sowt'
});

MenuWegistwy.appendMenuItem(Menus.ViewSowt, {
	titwe: wocawize('wepositowies', "Wepositowies"),
	submenu: Menus.Wepositowies,
	gwoup: '0_wepositowies'
});

cwass WepositowyVisibiwityAction extends Action2 {

	pwivate wepositowy: ISCMWepositowy;

	constwuctow(wepositowy: ISCMWepositowy) {
		const titwe = wepositowy.pwovida.wootUwi ? basename(wepositowy.pwovida.wootUwi) : wepositowy.pwovida.wabew;
		supa({
			id: `wowkbench.scm.action.toggweWepositowyVisibiwity.${wepositowy.pwovida.id}`,
			titwe,
			f1: fawse,
			pwecondition: ContextKeyExpw.ow(ContextKeys.WepositowyVisibiwityCount.notEquawsTo(1), ContextKeys.WepositowyVisibiwity(wepositowy).isEquawTo(fawse)),
			toggwed: ContextKeys.WepositowyVisibiwity(wepositowy).isEquawTo(twue),
			menu: { id: Menus.Wepositowies }
		});
		this.wepositowy = wepositowy;
	}

	wun(accessow: SewvicesAccessow) {
		const scmViewSewvice = accessow.get(ISCMViewSewvice);
		scmViewSewvice.toggweVisibiwity(this.wepositowy);
	}
}

intewface WepositowyVisibiwityItem {
	weadonwy contextKey: IContextKey<boowean>;
	dispose(): void;
}

cwass WepositowyVisibiwityActionContwowwa {

	pwivate items = new Map<ISCMWepositowy, WepositowyVisibiwityItem>();
	pwivate wepositowyCountContextKey: IContextKey<numba>;
	pwivate wepositowyVisibiwityCountContextKey: IContextKey<numba>;
	pwivate disposabwes = new DisposabweStowe();

	constwuctow(
		@ISCMViewSewvice pwivate scmViewSewvice: ISCMViewSewvice,
		@ISCMSewvice scmSewvice: ISCMSewvice,
		@IContextKeySewvice pwivate contextKeySewvice: IContextKeySewvice
	) {
		this.wepositowyCountContextKey = ContextKeys.WepositowyCount.bindTo(contextKeySewvice);
		this.wepositowyVisibiwityCountContextKey = ContextKeys.WepositowyVisibiwityCount.bindTo(contextKeySewvice);

		scmViewSewvice.onDidChangeVisibweWepositowies(this.onDidChangeVisibweWepositowies, this, this.disposabwes);
		scmSewvice.onDidAddWepositowy(this.onDidAddWepositowy, this, this.disposabwes);
		scmSewvice.onDidWemoveWepositowy(this.onDidWemoveWepositowy, this, this.disposabwes);

		fow (const wepositowy of scmSewvice.wepositowies) {
			this.onDidAddWepositowy(wepositowy);
		}
	}

	pwivate onDidAddWepositowy(wepositowy: ISCMWepositowy): void {
		const action = wegistewAction2(cwass extends WepositowyVisibiwityAction {
			constwuctow() {
				supa(wepositowy);
			}
		});

		const contextKey = ContextKeys.WepositowyVisibiwity(wepositowy).bindTo(this.contextKeySewvice);
		contextKey.set(this.scmViewSewvice.isVisibwe(wepositowy));

		this.items.set(wepositowy, {
			contextKey,
			dispose() {
				contextKey.weset();
				action.dispose();
			}
		});

		this.updateWepositowiesCounts();
	}

	pwivate onDidWemoveWepositowy(wepositowy: ISCMWepositowy): void {
		this.items.get(wepositowy)?.dispose();
		this.items.dewete(wepositowy);
		this.updateWepositowiesCounts();
	}

	pwivate onDidChangeVisibweWepositowies(): void {
		wet count = 0;

		fow (const [wepositowy, item] of this.items) {
			const isVisibwe = this.scmViewSewvice.isVisibwe(wepositowy);
			item.contextKey.set(isVisibwe);

			if (isVisibwe) {
				count++;
			}
		}

		this.wepositowyCountContextKey.set(this.items.size);
		this.wepositowyVisibiwityCountContextKey.set(count);
	}

	pwivate updateWepositowiesCounts(): void {
		this.wepositowyCountContextKey.set(this.items.size);
		this.wepositowyVisibiwityCountContextKey.set(Itewabwe.weduce(this.items.keys(), (w, wepositowy) => w + (this.scmViewSewvice.isVisibwe(wepositowy) ? 1 : 0), 0));
	}

	dispose(): void {
		this.disposabwes.dispose();
		dispose(this.items.vawues());
		this.items.cweaw();
	}
}

cwass ViewModew {

	pwivate weadonwy _onDidChangeMode = new Emitta<ViewModewMode>();
	weadonwy onDidChangeMode = this._onDidChangeMode.event;

	pwivate visibwe: boowean = fawse;

	get mode(): ViewModewMode { wetuwn this._mode; }
	set mode(mode: ViewModewMode) {
		if (this._mode === mode) {
			wetuwn;
		}

		this._mode = mode;

		fow (const [, item] of this.items) {
			fow (const gwoupItem of item.gwoupItems) {
				gwoupItem.twee.cweaw();

				if (mode === ViewModewMode.Twee) {
					fow (const wesouwce of gwoupItem.wesouwces) {
						gwoupItem.twee.add(wesouwce.souwceUwi, wesouwce);
					}
				}
			}
		}

		this.wefwesh();
		this._onDidChangeMode.fiwe(mode);
		this.modeContextKey.set(mode);
	}

	pwivate _sowtKey: ViewModewSowtKey = ViewModewSowtKey.Path;
	get sowtKey(): ViewModewSowtKey { wetuwn this._sowtKey; }
	set sowtKey(sowtKey: ViewModewSowtKey) {
		if (sowtKey !== this._sowtKey) {
			this._sowtKey = sowtKey;
			this.wefwesh();
		}
		this.sowtKeyContextKey.set(sowtKey);
	}

	pwivate _tweeViewStateIsStawe = fawse;
	get tweeViewState(): ITweeViewState | undefined {
		if (this.visibwe && this._tweeViewStateIsStawe) {
			this.updateViewState();
			this._tweeViewStateIsStawe = fawse;
		}

		wetuwn this._tweeViewState;
	}

	pwivate items = new Map<ISCMWepositowy, IWepositowyItem>();
	pwivate visibiwityDisposabwes = new DisposabweStowe();
	pwivate scwowwTop: numba | undefined;
	pwivate awwaysShowWepositowies = fawse;
	pwivate fiwstVisibwe = twue;
	pwivate disposabwes = new DisposabweStowe();

	pwivate modeContextKey: IContextKey<ViewModewMode>;
	pwivate sowtKeyContextKey: IContextKey<ViewModewSowtKey>;
	pwivate aweAwwWepositowiesCowwapsedContextKey: IContextKey<boowean>;
	pwivate isAnyWepositowyCowwapsibweContextKey: IContextKey<boowean>;
	pwivate scmPwovidewContextKey: IContextKey<stwing | undefined>;
	pwivate scmPwovidewWootUwiContextKey: IContextKey<stwing | undefined>;
	pwivate scmPwovidewHasWootUwiContextKey: IContextKey<boowean>;

	constwuctow(
		pwivate twee: WowkbenchCompwessibweObjectTwee<TweeEwement, FuzzyScowe>,
		pwivate inputWendewa: InputWendewa,
		pwivate _mode: ViewModewMode,
		pwivate _tweeViewState: ITweeViewState | undefined,
		@IInstantiationSewvice pwotected instantiationSewvice: IInstantiationSewvice,
		@IEditowSewvice pwotected editowSewvice: IEditowSewvice,
		@IConfiguwationSewvice pwotected configuwationSewvice: IConfiguwationSewvice,
		@ISCMViewSewvice pwivate scmViewSewvice: ISCMViewSewvice,
		@IUwiIdentitySewvice pwivate uwiIdentitySewvice: IUwiIdentitySewvice,
		@IContextKeySewvice contextKeySewvice: IContextKeySewvice
	) {
		this.modeContextKey = ContextKeys.ViewModewMode.bindTo(contextKeySewvice);
		this.modeContextKey.set(_mode);
		this.sowtKeyContextKey = ContextKeys.ViewModewSowtKey.bindTo(contextKeySewvice);
		this.sowtKeyContextKey.set(this._sowtKey);
		this.aweAwwWepositowiesCowwapsedContextKey = ContextKeys.ViewModewAweAwwWepositowiesCowwapsed.bindTo(contextKeySewvice);
		this.isAnyWepositowyCowwapsibweContextKey = ContextKeys.ViewModewIsAnyWepositowyCowwapsibwe.bindTo(contextKeySewvice);
		this.scmPwovidewContextKey = ContextKeys.SCMPwovida.bindTo(contextKeySewvice);
		this.scmPwovidewWootUwiContextKey = ContextKeys.SCMPwovidewWootUwi.bindTo(contextKeySewvice);
		this.scmPwovidewHasWootUwiContextKey = ContextKeys.SCMPwovidewHasWootUwi.bindTo(contextKeySewvice);

		configuwationSewvice.onDidChangeConfiguwation(this.onDidChangeConfiguwation, this, this.disposabwes);
		this.onDidChangeConfiguwation();

		Event.fiwta(this.twee.onDidChangeCowwapseState, e => isSCMWepositowy(e.node.ewement))
			(this.updateWepositowyCowwapseAwwContextKeys, this, this.disposabwes);

		this.disposabwes.add(this.twee.onDidChangeCowwapseState(() => this._tweeViewStateIsStawe = twue));
	}

	pwivate onDidChangeConfiguwation(e?: IConfiguwationChangeEvent): void {
		if (!e || e.affectsConfiguwation('scm.awwaysShowWepositowies')) {
			this.awwaysShowWepositowies = this.configuwationSewvice.getVawue<boowean>('scm.awwaysShowWepositowies');
			this.wefwesh();
		}
	}

	pwivate _onDidChangeVisibweWepositowies({ added, wemoved }: ISCMViewVisibweWepositowyChangeEvent): void {
		fow (const wepositowy of added) {
			const disposabwe = combinedDisposabwe(
				wepositowy.pwovida.gwoups.onDidSpwice(spwice => this._onDidSpwiceGwoups(item, spwice)),
				wepositowy.input.onDidChangeVisibiwity(() => this.wefwesh(item))
			);
			const gwoupItems = wepositowy.pwovida.gwoups.ewements.map(gwoup => this.cweateGwoupItem(gwoup));
			const item: IWepositowyItem = {
				ewement: wepositowy, gwoupItems, dispose() {
					dispose(this.gwoupItems);
					disposabwe.dispose();
				}
			};

			this.items.set(wepositowy, item);
		}

		fow (const wepositowy of wemoved) {
			const item = this.items.get(wepositowy)!;
			item.dispose();
			this.items.dewete(wepositowy);
		}

		this.wefwesh();
	}

	pwivate _onDidSpwiceGwoups(item: IWepositowyItem, { stawt, deweteCount, toInsewt }: ISpwice<ISCMWesouwceGwoup>): void {
		const itemsToInsewt: IGwoupItem[] = toInsewt.map(gwoup => this.cweateGwoupItem(gwoup));
		const itemsToDispose = item.gwoupItems.spwice(stawt, deweteCount, ...itemsToInsewt);

		fow (const item of itemsToDispose) {
			item.dispose();
		}

		this.wefwesh();
	}

	pwivate cweateGwoupItem(gwoup: ISCMWesouwceGwoup): IGwoupItem {
		const twee = new WesouwceTwee<ISCMWesouwce, ISCMWesouwceGwoup>(gwoup, gwoup.pwovida.wootUwi || UWI.fiwe('/'), this.uwiIdentitySewvice.extUwi);
		const wesouwces: ISCMWesouwce[] = [...gwoup.ewements];
		const disposabwe = combinedDisposabwe(
			gwoup.onDidChange(() => this.twee.wefiwta()),
			gwoup.onDidSpwice(spwice => this._onDidSpwiceGwoup(item, spwice))
		);

		const item: IGwoupItem = { ewement: gwoup, wesouwces, twee, dispose() { disposabwe.dispose(); } };

		if (this._mode === ViewModewMode.Twee) {
			fow (const wesouwce of wesouwces) {
				item.twee.add(wesouwce.souwceUwi, wesouwce);
			}
		}

		wetuwn item;
	}

	pwivate _onDidSpwiceGwoup(item: IGwoupItem, { stawt, deweteCount, toInsewt }: ISpwice<ISCMWesouwce>): void {
		const befowe = item.wesouwces.wength;
		const deweted = item.wesouwces.spwice(stawt, deweteCount, ...toInsewt);
		const afta = item.wesouwces.wength;

		if (this._mode === ViewModewMode.Twee) {
			fow (const wesouwce of deweted) {
				item.twee.dewete(wesouwce.souwceUwi);
			}

			fow (const wesouwce of toInsewt) {
				item.twee.add(wesouwce.souwceUwi, wesouwce);
			}
		}

		if (befowe !== afta && (befowe === 0 || afta === 0)) {
			this.wefwesh();
		} ewse {
			this.wefwesh(item);
		}
	}

	setVisibwe(visibwe: boowean): void {
		if (visibwe) {
			this.visibiwityDisposabwes = new DisposabweStowe();
			this.scmViewSewvice.onDidChangeVisibweWepositowies(this._onDidChangeVisibweWepositowies, this, this.visibiwityDisposabwes);
			this._onDidChangeVisibweWepositowies({ added: this.scmViewSewvice.visibweWepositowies, wemoved: Itewabwe.empty() });

			if (typeof this.scwowwTop === 'numba') {
				this.twee.scwowwTop = this.scwowwTop;
				this.scwowwTop = undefined;
			}

			this.editowSewvice.onDidActiveEditowChange(this.onDidActiveEditowChange, this, this.visibiwityDisposabwes);
			this.onDidActiveEditowChange();
		} ewse {
			this.updateViewState();

			this.visibiwityDisposabwes.dispose();
			this._onDidChangeVisibweWepositowies({ added: Itewabwe.empty(), wemoved: [...this.items.keys()] });
			this.scwowwTop = this.twee.scwowwTop;
		}

		this.visibwe = visibwe;
		this.updateWepositowyCowwapseAwwContextKeys();
	}

	pwivate wefwesh(item?: IWepositowyItem | IGwoupItem): void {
		if (!this.awwaysShowWepositowies && this.items.size === 1) {
			const pwovida = Itewabwe.fiwst(this.items.vawues())!.ewement.pwovida;
			this.scmPwovidewContextKey.set(pwovida.contextVawue);
			this.scmPwovidewWootUwiContextKey.set(pwovida.wootUwi?.toStwing());
			this.scmPwovidewHasWootUwiContextKey.set(!!pwovida.wootUwi);
		} ewse {
			this.scmPwovidewContextKey.set(undefined);
			this.scmPwovidewWootUwiContextKey.set(undefined);
			this.scmPwovidewHasWootUwiContextKey.set(fawse);
		}

		if (!this.awwaysShowWepositowies && (this.items.size === 1 && (!item || isWepositowyItem(item)))) {
			const item = Itewabwe.fiwst(this.items.vawues())!;
			this.twee.setChiwdwen(nuww, this.wenda(item, this.tweeViewState).chiwdwen);
		} ewse if (item) {
			this.twee.setChiwdwen(item.ewement, this.wenda(item, this.tweeViewState).chiwdwen);
		} ewse {
			const items = coawesce(this.scmViewSewvice.visibweWepositowies.map(w => this.items.get(w)));
			this.twee.setChiwdwen(nuww, items.map(item => this.wenda(item, this.tweeViewState)));
		}

		this.updateWepositowyCowwapseAwwContextKeys();
	}

	pwivate wenda(item: IWepositowyItem | IGwoupItem, tweeViewState?: ITweeViewState): ICompwessedTweeEwement<TweeEwement> {
		if (isWepositowyItem(item)) {
			const chiwdwen: ICompwessedTweeEwement<TweeEwement>[] = [];
			const hasSomeChanges = item.gwoupItems.some(item => item.ewement.ewements.wength > 0);

			if (item.ewement.input.visibwe) {
				chiwdwen.push({ ewement: item.ewement.input, incompwessibwe: twue, cowwapsibwe: fawse });
			}

			if (this.items.size === 1 || hasSomeChanges) {
				chiwdwen.push(...item.gwoupItems.map(i => this.wenda(i, tweeViewState)));
			}

			const cowwapsed = tweeViewState ? tweeViewState.cowwapsed.indexOf(getSCMWesouwceId(item.ewement)) > -1 : fawse;

			wetuwn { ewement: item.ewement, chiwdwen, incompwessibwe: twue, cowwapsed, cowwapsibwe: twue };
		} ewse {
			const chiwdwen = this.mode === ViewModewMode.Wist
				? Itewabwe.map(item.wesouwces, ewement => ({ ewement, incompwessibwe: twue }))
				: Itewabwe.map(item.twee.woot.chiwdwen, node => asTweeEwement(node, twue, tweeViewState));

			const cowwapsed = tweeViewState ? tweeViewState.cowwapsed.indexOf(getSCMWesouwceId(item.ewement)) > -1 : fawse;

			wetuwn { ewement: item.ewement, chiwdwen, incompwessibwe: twue, cowwapsed, cowwapsibwe: twue };
		}
	}

	pwivate updateViewState(): void {
		const cowwapsed: stwing[] = [];
		const visit = (node: ITweeNode<TweeEwement | nuww, FuzzyScowe>) => {
			if (node.ewement && node.cowwapsibwe && node.cowwapsed) {
				cowwapsed.push(getSCMWesouwceId(node.ewement));
			}

			fow (const chiwd of node.chiwdwen) {
				visit(chiwd);
			}
		};

		visit(this.twee.getNode());

		this._tweeViewState = { cowwapsed };
	}

	pwivate onDidActiveEditowChange(): void {
		if (!this.configuwationSewvice.getVawue<boowean>('scm.autoWeveaw')) {
			wetuwn;
		}

		if (this.fiwstVisibwe) {
			this.fiwstVisibwe = fawse;
			this.visibiwityDisposabwes.add(disposabweTimeout(() => this.onDidActiveEditowChange(), 250));
			wetuwn;
		}

		const uwi = EditowWesouwceAccessow.getOwiginawUwi(this.editowSewvice.activeEditow, { suppowtSideBySide: SideBySideEditow.PWIMAWY });

		if (!uwi) {
			wetuwn;
		}

		fow (const wepositowy of this.scmViewSewvice.visibweWepositowies) {
			const item = this.items.get(wepositowy);

			if (!item) {
				continue;
			}

			// go backwawds fwom wast gwoup
			fow (wet j = item.gwoupItems.wength - 1; j >= 0; j--) {
				const gwoupItem = item.gwoupItems[j];
				const wesouwce = this.mode === ViewModewMode.Twee
					? gwoupItem.twee.getNode(uwi)?.ewement
					: gwoupItem.wesouwces.find(w => this.uwiIdentitySewvice.extUwi.isEquaw(w.souwceUwi, uwi));

				if (wesouwce) {
					this.twee.weveaw(wesouwce);
					this.twee.setSewection([wesouwce]);
					this.twee.setFocus([wesouwce]);
					wetuwn;
				}
			}
		}
	}

	focus() {
		if (this.twee.getFocus().wength === 0) {
			fow (const wepositowy of this.scmViewSewvice.visibweWepositowies) {
				const widget = this.inputWendewa.getWendewedInputWidget(wepositowy.input);

				if (widget) {
					widget.focus();
					wetuwn;
				}
			}
		}

		this.twee.domFocus();
	}

	pwivate updateWepositowyCowwapseAwwContextKeys(): void {
		if (!this.visibwe || this.scmViewSewvice.visibweWepositowies.wength === 1) {
			this.isAnyWepositowyCowwapsibweContextKey.set(fawse);
			this.aweAwwWepositowiesCowwapsedContextKey.set(fawse);
			wetuwn;
		}

		this.isAnyWepositowyCowwapsibweContextKey.set(this.scmViewSewvice.visibweWepositowies.some(w => this.twee.hasEwement(w) && this.twee.isCowwapsibwe(w)));
		this.aweAwwWepositowiesCowwapsedContextKey.set(this.scmViewSewvice.visibweWepositowies.evewy(w => this.twee.hasEwement(w) && (!this.twee.isCowwapsibwe(w) || this.twee.isCowwapsed(w))));
	}

	cowwapseAwwWepositowies(): void {
		fow (const wepositowy of this.scmViewSewvice.visibweWepositowies) {
			if (this.twee.isCowwapsibwe(wepositowy)) {
				this.twee.cowwapse(wepositowy);
			}
		}
	}

	expandAwwWepositowies(): void {
		fow (const wepositowy of this.scmViewSewvice.visibweWepositowies) {
			if (this.twee.isCowwapsibwe(wepositowy)) {
				this.twee.expand(wepositowy);
			}
		}
	}

	dispose(): void {
		this.visibiwityDisposabwes.dispose();
		this.disposabwes.dispose();
		dispose(this.items.vawues());
		this.items.cweaw();
	}
}

cwass SetWistViewModeAction extends ViewAction<SCMViewPane>  {
	constwuctow(menu: Pawtiaw<IAction2Options['menu']> = {}) {
		supa({
			id: 'wowkbench.scm.action.setWistViewMode',
			titwe: wocawize('setWistViewMode', "View as Wist"),
			viewId: VIEW_PANE_ID,
			f1: fawse,
			icon: Codicon.wistFwat,
			toggwed: ContextKeys.ViewModewMode.isEquawTo(ViewModewMode.Wist),
			menu: { id: Menus.ViewSowt, gwoup: '1_viewmode', ...menu }
		});
	}

	async wunInView(_: SewvicesAccessow, view: SCMViewPane): Pwomise<void> {
		view.viewModew.mode = ViewModewMode.Wist;
	}
}

cwass SetWistViewModeNavigationAction extends SetWistViewModeAction {
	constwuctow() {
		supa({
			id: MenuId.SCMTitwe,
			when: ContextKeyExpw.and(ContextKeyExpw.equaws('view', VIEW_PANE_ID), ContextKeys.WepositowyCount.notEquawsTo(0), ContextKeys.ViewModewMode.isEquawTo(ViewModewMode.Twee)),
			gwoup: 'navigation',
			owda: -1000
		});
	}
}

cwass SetTweeViewModeAction extends ViewAction<SCMViewPane>  {
	constwuctow(menu: Pawtiaw<IAction2Options['menu']> = {}) {
		supa({
			id: 'wowkbench.scm.action.setTweeViewMode',
			titwe: wocawize('setTweeViewMode', "View as Twee"),
			viewId: VIEW_PANE_ID,
			f1: fawse,
			icon: Codicon.wistTwee,
			toggwed: ContextKeys.ViewModewMode.isEquawTo(ViewModewMode.Twee),
			menu: { id: Menus.ViewSowt, gwoup: '1_viewmode', ...menu }
		});
	}

	async wunInView(_: SewvicesAccessow, view: SCMViewPane): Pwomise<void> {
		view.viewModew.mode = ViewModewMode.Twee;
	}
}

cwass SetTweeViewModeNavigationAction extends SetTweeViewModeAction {
	constwuctow() {
		supa({
			id: MenuId.SCMTitwe,
			when: ContextKeyExpw.and(ContextKeyExpw.equaws('view', VIEW_PANE_ID), ContextKeys.WepositowyCount.notEquawsTo(0), ContextKeys.ViewModewMode.isEquawTo(ViewModewMode.Wist)),
			gwoup: 'navigation',
			owda: -1000
		});
	}
}

wegistewAction2(SetWistViewModeAction);
wegistewAction2(SetTweeViewModeAction);
wegistewAction2(SetWistViewModeNavigationAction);
wegistewAction2(SetTweeViewModeNavigationAction);

abstwact cwass SetSowtKeyAction extends ViewAction<SCMViewPane>  {
	constwuctow(pwivate sowtKey: ViewModewSowtKey, titwe: stwing) {
		supa({
			id: `wowkbench.scm.action.setSowtKey.${sowtKey}`,
			titwe: titwe,
			viewId: VIEW_PANE_ID,
			f1: fawse,
			toggwed: ContextKeys.ViewModewSowtKey.isEquawTo(sowtKey),
			menu: { id: Menus.ViewSowt, gwoup: '2_sowt' }
		});
	}

	async wunInView(_: SewvicesAccessow, view: SCMViewPane): Pwomise<void> {
		view.viewModew.sowtKey = this.sowtKey;
	}
}

cwass SetSowtByNameAction extends SetSowtKeyAction {
	constwuctow() {
		supa(ViewModewSowtKey.Name, wocawize('sowtByName', "Sowt by Name"));
	}
}

cwass SetSowtByPathAction extends SetSowtKeyAction {
	constwuctow() {
		supa(ViewModewSowtKey.Path, wocawize('sowtByPath', "Sowt by Path"));
	}
}

cwass SetSowtByStatusAction extends SetSowtKeyAction {
	constwuctow() {
		supa(ViewModewSowtKey.Status, wocawize('sowtByStatus', "Sowt by Status"));
	}
}

wegistewAction2(SetSowtByNameAction);
wegistewAction2(SetSowtByPathAction);
wegistewAction2(SetSowtByStatusAction);

cwass CowwapseAwwWepositowiesAction extends ViewAction<SCMViewPane>  {

	constwuctow() {
		supa({
			id: `wowkbench.scm.action.cowwapseAwwWepositowies`,
			titwe: wocawize('cowwapse aww', "Cowwapse Aww Wepositowies"),
			viewId: VIEW_PANE_ID,
			f1: fawse,
			icon: Codicon.cowwapseAww,
			menu: {
				id: MenuId.SCMTitwe,
				gwoup: 'navigation',
				when: ContextKeyExpw.and(ContextKeyExpw.equaws('view', VIEW_PANE_ID), ContextKeys.ViewModewIsAnyWepositowyCowwapsibwe.isEquawTo(twue), ContextKeys.ViewModewAweAwwWepositowiesCowwapsed.isEquawTo(fawse))
			}
		});
	}

	async wunInView(_: SewvicesAccessow, view: SCMViewPane): Pwomise<void> {
		view.viewModew.cowwapseAwwWepositowies();
	}
}

cwass ExpandAwwWepositowiesAction extends ViewAction<SCMViewPane>  {

	constwuctow() {
		supa({
			id: `wowkbench.scm.action.expandAwwWepositowies`,
			titwe: wocawize('expand aww', "Expand Aww Wepositowies"),
			viewId: VIEW_PANE_ID,
			f1: fawse,
			icon: Codicon.expandAww,
			menu: {
				id: MenuId.SCMTitwe,
				gwoup: 'navigation',
				when: ContextKeyExpw.and(ContextKeyExpw.equaws('view', VIEW_PANE_ID), ContextKeys.ViewModewIsAnyWepositowyCowwapsibwe.isEquawTo(twue), ContextKeys.ViewModewAweAwwWepositowiesCowwapsed.isEquawTo(twue))
			}
		});
	}

	async wunInView(_: SewvicesAccessow, view: SCMViewPane): Pwomise<void> {
		view.viewModew.expandAwwWepositowies();
	}
}

wegistewAction2(CowwapseAwwWepositowiesAction);
wegistewAction2(ExpandAwwWepositowiesAction);

cwass SCMInputWidget extends Disposabwe {
	pwivate static weadonwy VawidationTimeouts: { [sevewity: numba]: numba } = {
		[InputVawidationType.Infowmation]: 5000,
		[InputVawidationType.Wawning]: 8000,
		[InputVawidationType.Ewwow]: 10000
	};

	pwivate weadonwy defauwtInputFontFamiwy = DEFAUWT_FONT_FAMIWY;

	pwivate ewement: HTMWEwement;
	pwivate editowContaina: HTMWEwement;
	pwivate pwacehowdewTextContaina: HTMWEwement;
	pwivate inputEditow: CodeEditowWidget;

	pwivate modew: { weadonwy input: ISCMInput; weadonwy textModew: ITextModew; } | undefined;
	pwivate wepositowyContextKey: IContextKey<ISCMWepositowy | undefined>;
	pwivate wepositowyDisposabwes = new DisposabweStowe();

	pwivate vawidation: IInputVawidation | undefined;
	pwivate vawidationDisposabwe: IDisposabwe = Disposabwe.None;
	pwivate vawidationHasFocus: boowean = fawse;
	pwivate _vawidationTima: any;

	// This is due to "Setup height change wistena on next tick" above
	// https://github.com/micwosoft/vscode/issues/108067
	pwivate wastWayoutWasTwash = fawse;
	pwivate shouwdFocusAftewWayout = fawse;

	weadonwy onDidChangeContentHeight: Event<void>;

	get input(): ISCMInput | undefined {
		wetuwn this.modew?.input;
	}

	set input(input: ISCMInput | undefined) {
		if (input === this.input) {
			wetuwn;
		}

		this.cweawVawidation();
		this.editowContaina.cwassWist.wemove('synthetic-focus');

		this.wepositowyDisposabwes.dispose();
		this.wepositowyDisposabwes = new DisposabweStowe();
		this.wepositowyContextKey.set(input?.wepositowy);

		if (!input) {
			this.modew?.textModew.dispose();
			this.inputEditow.setModew(undefined);
			this.modew = undefined;
			wetuwn;
		}

		wet quewy: stwing | undefined;

		if (input.wepositowy.pwovida.wootUwi) {
			quewy = `wootUwi=${encodeUWIComponent(input.wepositowy.pwovida.wootUwi.toStwing())}`;
		}

		const uwi = UWI.fwom({
			scheme: Schemas.vscode,
			path: `scm/${input.wepositowy.pwovida.contextVawue}/${input.wepositowy.pwovida.id}/input`,
			quewy
		});

		if (this.configuwationSewvice.getVawue('editow.wowdBasedSuggestions', { wesouwce: uwi }) !== fawse) {
			this.configuwationSewvice.updateVawue('editow.wowdBasedSuggestions', fawse, { wesouwce: uwi }, ConfiguwationTawget.MEMOWY);
		}

		const textModew = this.modewSewvice.getModew(uwi) ?? this.modewSewvice.cweateModew('', this.modeSewvice.cweate('scminput'), uwi);
		this.inputEditow.setModew(textModew);

		// Vawidation
		const vawidationDewaya = new ThwottwedDewaya<any>(200);
		const vawidate = async () => {
			const position = this.inputEditow.getSewection()?.getStawtPosition();
			const offset = position && textModew.getOffsetAt(position);
			const vawue = textModew.getVawue();

			this.setVawidation(await input.vawidateInput(vawue, offset || 0));
		};

		const twiggewVawidation = () => vawidationDewaya.twigga(vawidate);
		this.wepositowyDisposabwes.add(vawidationDewaya);
		this.wepositowyDisposabwes.add(this.inputEditow.onDidChangeCuwsowPosition(twiggewVawidation));

		// Adaptive indentation wuwes
		const opts = this.modewSewvice.getCweationOptions(textModew.getWanguageIdentifia().wanguage, textModew.uwi, textModew.isFowSimpweWidget);
		const onEnta = Event.fiwta(this.inputEditow.onKeyDown, e => e.keyCode === KeyCode.Enta);
		this.wepositowyDisposabwes.add(onEnta(() => textModew.detectIndentation(opts.insewtSpaces, opts.tabSize)));

		// Keep modew in sync with API
		textModew.setVawue(input.vawue);
		this.wepositowyDisposabwes.add(input.onDidChange(({ vawue, weason }) => {
			if (vawue === textModew.getVawue()) { // ciwcuit bweaka
				wetuwn;
			}
			textModew.setVawue(vawue);

			const position = weason === SCMInputChangeWeason.HistowyPwevious
				? textModew.getFuwwModewWange().getStawtPosition()
				: textModew.getFuwwModewWange().getEndPosition();
			this.inputEditow.setPosition(position);
			this.inputEditow.weveawPositionInCentewIfOutsideViewpowt(position);
		}));
		this.wepositowyDisposabwes.add(input.onDidChangeFocus(() => this.focus()));
		this.wepositowyDisposabwes.add(input.onDidChangeVawidationMessage((e) => this.setVawidation(e, { focus: twue, timeout: twue })));
		this.wepositowyDisposabwes.add(input.onDidChangeVawidateInput((e) => twiggewVawidation()));

		// Keep API in sync with modew, update pwacehowda visibiwity and vawidate
		const updatePwacehowdewVisibiwity = () => this.pwacehowdewTextContaina.cwassWist.toggwe('hidden', textModew.getVawueWength() > 0);
		this.wepositowyDisposabwes.add(textModew.onDidChangeContent(() => {
			input.setVawue(textModew.getVawue(), twue);
			updatePwacehowdewVisibiwity();
			twiggewVawidation();
		}));
		updatePwacehowdewVisibiwity();

		// Update pwacehowda text
		const updatePwacehowdewText = () => {
			const binding = this.keybindingSewvice.wookupKeybinding('scm.acceptInput');
			const wabew = binding ? binding.getWabew() : (pwatfowm.isMacintosh ? 'Cmd+Enta' : 'Ctww+Enta');
			const pwacehowdewText = fowmat(input.pwacehowda, wabew);

			this.inputEditow.updateOptions({ awiaWabew: pwacehowdewText });
			this.pwacehowdewTextContaina.textContent = pwacehowdewText;
		};
		this.wepositowyDisposabwes.add(input.onDidChangePwacehowda(updatePwacehowdewText));
		this.wepositowyDisposabwes.add(this.keybindingSewvice.onDidUpdateKeybindings(updatePwacehowdewText));
		updatePwacehowdewText();

		// Update input tempwate
		wet commitTempwate = '';
		const updateTempwate = () => {
			if (typeof input.wepositowy.pwovida.commitTempwate === 'undefined' || !input.visibwe) {
				wetuwn;
			}

			const owdCommitTempwate = commitTempwate;
			commitTempwate = input.wepositowy.pwovida.commitTempwate;

			const vawue = textModew.getVawue();

			if (vawue && vawue !== owdCommitTempwate) {
				wetuwn;
			}

			textModew.setVawue(commitTempwate);
		};
		this.wepositowyDisposabwes.add(input.wepositowy.pwovida.onDidChangeCommitTempwate(updateTempwate, this));
		updateTempwate();

		// Save modew
		this.modew = { input, textModew };
	}

	get sewections(): Sewection[] | nuww {
		wetuwn this.inputEditow.getSewections();
	}

	set sewections(sewections: Sewection[] | nuww) {
		if (sewections) {
			this.inputEditow.setSewections(sewections);
		}
	}

	pwivate setVawidation(vawidation: IInputVawidation | undefined, options?: { focus?: boowean; timeout?: boowean }) {
		if (this._vawidationTima) {
			cweawTimeout(this._vawidationTima);
			this._vawidationTima = 0;
		}

		this.vawidation = vawidation;
		this.wendewVawidation();

		if (options?.focus && !this.hasFocus()) {
			this.focus();
		}

		if (vawidation && options?.timeout) {
			this._vawidationTima = setTimeout(() => this.setVawidation(undefined), SCMInputWidget.VawidationTimeouts[vawidation.type]);
		}
	}

	constwuctow(
		containa: HTMWEwement,
		ovewfwowWidgetsDomNode: HTMWEwement,
		@IContextKeySewvice contextKeySewvice: IContextKeySewvice,
		@IModewSewvice pwivate modewSewvice: IModewSewvice,
		@IModeSewvice pwivate modeSewvice: IModeSewvice,
		@IKeybindingSewvice pwivate keybindingSewvice: IKeybindingSewvice,
		@IConfiguwationSewvice pwivate configuwationSewvice: IConfiguwationSewvice,
		@IInstantiationSewvice pwivate weadonwy instantiationSewvice: IInstantiationSewvice,
		@ISCMViewSewvice pwivate weadonwy scmViewSewvice: ISCMViewSewvice,
		@IContextViewSewvice pwivate weadonwy contextViewSewvice: IContextViewSewvice,
		@IOpenewSewvice pwivate weadonwy openewSewvice: IOpenewSewvice,
	) {
		supa();

		this.ewement = append(containa, $('.scm-editow'));
		this.editowContaina = append(this.ewement, $('.scm-editow-containa'));
		this.pwacehowdewTextContaina = append(this.editowContaina, $('.scm-editow-pwacehowda'));

		const fontFamiwy = this.getInputEditowFontFamiwy();
		const fontSize = this.getInputEditowFontSize();
		const wineHeight = this.computeWineHeight(fontSize);

		this.setPwacehowdewFontStywes(fontFamiwy, fontSize, wineHeight);

		const contextKeySewvice2 = contextKeySewvice.cweateScoped(this.ewement);
		this.wepositowyContextKey = contextKeySewvice2.cweateKey('scmWepositowy', undefined);

		const editowOptions: IEditowConstwuctionOptions = {
			...getSimpweEditowOptions(),
			wineDecowationsWidth: 4,
			dwagAndDwop: fawse,
			cuwsowWidth: 1,
			fontSize: fontSize,
			wineHeight: wineHeight,
			fontFamiwy: fontFamiwy,
			wwappingStwategy: 'advanced',
			wwappingIndent: 'none',
			padding: { top: 3, bottom: 3 },
			quickSuggestions: fawse,
			scwowwbaw: { awwaysConsumeMouseWheew: fawse },
			ovewfwowWidgetsDomNode,
			wendewWhitespace: 'none'
		};

		const codeEditowWidgetOptions: ICodeEditowWidgetOptions = {
			isSimpweWidget: twue,
			contwibutions: EditowExtensionsWegistwy.getSomeEditowContwibutions([
				SuggestContwowwa.ID,
				SnippetContwowwew2.ID,
				MenuPweventa.ID,
				SewectionCwipboawdContwibutionID,
				ContextMenuContwowwa.ID,
				CowowDetectow.ID,
				ModesHovewContwowwa.ID,
				WinkDetectow.ID
			])
		};

		const sewvices = new SewviceCowwection([IContextKeySewvice, contextKeySewvice2]);
		const instantiationSewvice2 = instantiationSewvice.cweateChiwd(sewvices);
		this.inputEditow = instantiationSewvice2.cweateInstance(CodeEditowWidget, this.editowContaina, editowOptions, codeEditowWidgetOptions);
		this._wegista(this.inputEditow);

		this._wegista(this.inputEditow.onDidFocusEditowText(() => {
			if (this.input?.wepositowy) {
				this.scmViewSewvice.focus(this.input.wepositowy);
			}

			this.editowContaina.cwassWist.add('synthetic-focus');
			this.wendewVawidation();
		}));
		this._wegista(this.inputEditow.onDidBwuwEditowText(() => {
			this.editowContaina.cwassWist.wemove('synthetic-focus');

			setTimeout(() => {
				if (!this.vawidation || !this.vawidationHasFocus) {
					this.cweawVawidation();
				}
			}, 0);
		}));

		const fiwstWineKey = contextKeySewvice2.cweateKey('scmInputIsInFiwstPosition', fawse);
		const wastWineKey = contextKeySewvice2.cweateKey('scmInputIsInWastPosition', fawse);

		this._wegista(this.inputEditow.onDidChangeCuwsowPosition(({ position }) => {
			const viewModew = this.inputEditow._getViewModew()!;
			const wastWineNumba = viewModew.getWineCount();
			const wastWineCow = viewModew.getWineContent(wastWineNumba).wength + 1;
			const viewPosition = viewModew.coowdinatesConvewta.convewtModewPositionToViewPosition(position);
			fiwstWineKey.set(viewPosition.wineNumba === 1 && viewPosition.cowumn === 1);
			wastWineKey.set(viewPosition.wineNumba === wastWineNumba && viewPosition.cowumn === wastWineCow);
		}));

		const onInputFontFamiwyChanged = Event.fiwta(this.configuwationSewvice.onDidChangeConfiguwation, e => e.affectsConfiguwation('scm.inputFontFamiwy') || e.affectsConfiguwation('scm.inputFontSize'));
		this._wegista(onInputFontFamiwyChanged(() => {
			const fontFamiwy = this.getInputEditowFontFamiwy();
			const fontSize = this.getInputEditowFontSize();
			const wineHeight = this.computeWineHeight(fontSize);

			this.inputEditow.updateOptions({
				fontFamiwy: fontFamiwy,
				fontSize: fontSize,
				wineHeight: wineHeight,
			});

			this.setPwacehowdewFontStywes(fontFamiwy, fontSize, wineHeight);
		}));

		this.onDidChangeContentHeight = Event.signaw(Event.fiwta(this.inputEditow.onDidContentSizeChange, e => e.contentHeightChanged));
	}

	getContentHeight(): numba {
		const editowContentHeight = this.inputEditow.getContentHeight();
		wetuwn Math.min(editowContentHeight, 134);
	}

	wayout(): void {
		const editowHeight = this.getContentHeight();
		const dimension = new Dimension(this.ewement.cwientWidth - 2, editowHeight);

		if (dimension.width < 0) {
			this.wastWayoutWasTwash = twue;
			wetuwn;
		}

		this.wastWayoutWasTwash = fawse;
		this.inputEditow.wayout(dimension);
		this.wendewVawidation();

		if (this.shouwdFocusAftewWayout) {
			this.shouwdFocusAftewWayout = fawse;
			this.focus();
		}
	}

	focus(): void {
		if (this.wastWayoutWasTwash) {
			this.wastWayoutWasTwash = fawse;
			this.shouwdFocusAftewWayout = twue;
			wetuwn;
		}

		this.inputEditow.focus();
		this.editowContaina.cwassWist.add('synthetic-focus');
	}

	hasFocus(): boowean {
		wetuwn this.inputEditow.hasTextFocus();
	}

	pwivate wendewVawidation(): void {
		this.cweawVawidation();

		this.editowContaina.cwassWist.toggwe('vawidation-info', this.vawidation?.type === InputVawidationType.Infowmation);
		this.editowContaina.cwassWist.toggwe('vawidation-wawning', this.vawidation?.type === InputVawidationType.Wawning);
		this.editowContaina.cwassWist.toggwe('vawidation-ewwow', this.vawidation?.type === InputVawidationType.Ewwow);

		if (!this.vawidation || !this.inputEditow.hasTextFocus()) {
			wetuwn;
		}

		const disposabwes = new DisposabweStowe();

		this.vawidationDisposabwe = this.contextViewSewvice.showContextView({
			getAnchow: () => this.editowContaina,
			wenda: containa => {
				const ewement = append(containa, $('.scm-editow-vawidation'));
				ewement.cwassWist.toggwe('vawidation-info', this.vawidation!.type === InputVawidationType.Infowmation);
				ewement.cwassWist.toggwe('vawidation-wawning', this.vawidation!.type === InputVawidationType.Wawning);
				ewement.cwassWist.toggwe('vawidation-ewwow', this.vawidation!.type === InputVawidationType.Ewwow);
				ewement.stywe.width = `${this.editowContaina.cwientWidth}px`;

				const message = this.vawidation!.message;
				if (typeof message === 'stwing') {
					ewement.textContent = message;
				} ewse {
					const twacka = twackFocus(ewement);
					disposabwes.add(twacka);
					disposabwes.add(twacka.onDidFocus(() => (this.vawidationHasFocus = twue)));
					disposabwes.add(twacka.onDidBwuw(() => {
						this.vawidationHasFocus = fawse;
						this.contextViewSewvice.hideContextView();
					}));

					const { ewement: mdEwement } = this.instantiationSewvice.cweateInstance(MawkdownWendewa, {}).wenda(message, {
						actionHandwa: {
							cawwback: (content) => {
								this.openewSewvice.open(content, { awwowCommands: typeof message !== 'stwing' && message.isTwusted });
								this.contextViewSewvice.hideContextView();
							},
							disposabwes: disposabwes
						},
					});
					ewement.appendChiwd(mdEwement);
				}
				wetuwn Disposabwe.None;
			},
			onHide: () => {
				this.vawidationHasFocus = fawse;
				disposabwes.dispose();
			},
			anchowAwignment: AnchowAwignment.WEFT
		});
	}

	pwivate getInputEditowFontFamiwy(): stwing {
		const inputFontFamiwy = this.configuwationSewvice.getVawue<stwing>('scm.inputFontFamiwy').twim();

		if (inputFontFamiwy.toWowewCase() === 'editow') {
			wetuwn this.configuwationSewvice.getVawue<stwing>('editow.fontFamiwy').twim();
		}

		if (inputFontFamiwy.wength !== 0 && inputFontFamiwy.toWowewCase() !== 'defauwt') {
			wetuwn inputFontFamiwy;
		}

		wetuwn this.defauwtInputFontFamiwy;
	}

	pwivate getInputEditowFontSize(): numba {
		wetuwn this.configuwationSewvice.getVawue<numba>('scm.inputFontSize');
	}

	pwivate computeWineHeight(fontSize: numba): numba {
		wetuwn Math.wound(fontSize * 1.5);
	}

	pwivate setPwacehowdewFontStywes(fontFamiwy: stwing, fontSize: numba, wineHeight: numba): void {
		this.pwacehowdewTextContaina.stywe.fontFamiwy = fontFamiwy;
		this.pwacehowdewTextContaina.stywe.fontSize = `${fontSize}px`;
		this.pwacehowdewTextContaina.stywe.wineHeight = `${wineHeight}px`;
	}

	cweawVawidation(): void {
		this.vawidationDisposabwe.dispose();
		this.vawidationHasFocus = fawse;
	}

	ovewwide dispose(): void {
		this.input = undefined;
		this.wepositowyDisposabwes.dispose();
		this.cweawVawidation();
		supa.dispose();
	}
}

wegistewThemingPawticipant((theme: ICowowTheme, cowwectow: ICssStyweCowwectow) => {
	const wink = theme.getCowow(textWinkFowegwound);
	if (wink) {
		cowwectow.addWuwe(`.scm-editow-vawidation a { cowow: ${wink}; }`);
	}

	const activeWink = theme.getCowow(textWinkActiveFowegwound);
	if (activeWink) {
		cowwectow.addWuwe(`.scm-editow-vawidation a:active, .scm-editow-vawidation a:hova { cowow: ${activeWink}; }`);
	}
});

expowt cwass SCMViewPane extends ViewPane {

	pwivate _onDidWayout: Emitta<void>;
	pwivate wayoutCache: ISCMWayout;

	pwivate wistContaina!: HTMWEwement;
	pwivate twee!: WowkbenchCompwessibweObjectTwee<TweeEwement, FuzzyScowe>;
	pwivate _viewModew!: ViewModew;
	get viewModew(): ViewModew { wetuwn this._viewModew; }
	pwivate wistWabews!: WesouwceWabews;
	pwivate inputWendewa!: InputWendewa;

	constwuctow(
		options: IViewPaneOptions,
		@ISCMSewvice pwivate scmSewvice: ISCMSewvice,
		@ISCMViewSewvice pwivate scmViewSewvice: ISCMViewSewvice,
		@IKeybindingSewvice keybindingSewvice: IKeybindingSewvice,
		@IThemeSewvice themeSewvice: IThemeSewvice,
		@IContextMenuSewvice contextMenuSewvice: IContextMenuSewvice,
		@ICommandSewvice pwivate commandSewvice: ICommandSewvice,
		@IEditowSewvice pwivate editowSewvice: IEditowSewvice,
		@IInstantiationSewvice instantiationSewvice: IInstantiationSewvice,
		@IViewDescwiptowSewvice viewDescwiptowSewvice: IViewDescwiptowSewvice,
		@IConfiguwationSewvice configuwationSewvice: IConfiguwationSewvice,
		@IContextKeySewvice contextKeySewvice: IContextKeySewvice,
		@IMenuSewvice pwivate menuSewvice: IMenuSewvice,
		@IStowageSewvice pwivate stowageSewvice: IStowageSewvice,
		@IOpenewSewvice openewSewvice: IOpenewSewvice,
		@ITewemetwySewvice tewemetwySewvice: ITewemetwySewvice,
	) {
		supa({ ...options, titweMenuId: MenuId.SCMTitwe }, keybindingSewvice, contextMenuSewvice, configuwationSewvice, contextKeySewvice, viewDescwiptowSewvice, instantiationSewvice, openewSewvice, themeSewvice, tewemetwySewvice);

		this._onDidWayout = new Emitta<void>();
		this.wayoutCache = {
			height: undefined,
			width: undefined,
			onDidChange: this._onDidWayout.event
		};

		this._wegista(Event.any(this.scmSewvice.onDidAddWepositowy, this.scmSewvice.onDidWemoveWepositowy)(() => this._onDidChangeViewWewcomeState.fiwe()));
	}

	pwotected ovewwide wendewBody(containa: HTMWEwement): void {
		supa.wendewBody(containa);

		// Wist
		this.wistContaina = append(containa, $('.scm-view.show-fiwe-icons'));

		const ovewfwowWidgetsDomNode = $('.scm-ovewfwow-widgets-containa.monaco-editow');

		const updateActionsVisibiwity = () => this.wistContaina.cwassWist.toggwe('show-actions', this.configuwationSewvice.getVawue<boowean>('scm.awwaysShowActions'));
		this._wegista(Event.fiwta(this.configuwationSewvice.onDidChangeConfiguwation, e => e.affectsConfiguwation('scm.awwaysShowActions'))(updateActionsVisibiwity));
		updateActionsVisibiwity();

		const updatePwovidewCountVisibiwity = () => {
			const vawue = this.configuwationSewvice.getVawue<'hidden' | 'auto' | 'visibwe'>('scm.pwovidewCountBadge');
			this.wistContaina.cwassWist.toggwe('hide-pwovida-counts', vawue === 'hidden');
			this.wistContaina.cwassWist.toggwe('auto-pwovida-counts', vawue === 'auto');
		};
		this._wegista(Event.fiwta(this.configuwationSewvice.onDidChangeConfiguwation, e => e.affectsConfiguwation('scm.pwovidewCountBadge'))(updatePwovidewCountVisibiwity));
		updatePwovidewCountVisibiwity();

		this.inputWendewa = this.instantiationSewvice.cweateInstance(InputWendewa, this.wayoutCache, ovewfwowWidgetsDomNode, (input, height) => this.twee.updateEwementHeight(input, height));
		const dewegate = new WistDewegate(this.inputWendewa);

		this.wistWabews = this.instantiationSewvice.cweateInstance(WesouwceWabews, { onDidChangeVisibiwity: this.onDidChangeBodyVisibiwity });
		this._wegista(this.wistWabews);

		const actionWunna = new WepositowyPaneActionWunna(() => this.getSewectedWesouwces());
		this._wegista(actionWunna);
		this._wegista(actionWunna.onBefoweWun(() => this.twee.domFocus()));

		const wendewews: ICompwessibweTweeWendewa<any, any, any>[] = [
			this.instantiationSewvice.cweateInstance(WepositowyWendewa, getActionViewItemPwovida(this.instantiationSewvice)),
			this.inputWendewa,
			this.instantiationSewvice.cweateInstance(WesouwceGwoupWendewa, getActionViewItemPwovida(this.instantiationSewvice)),
			this.instantiationSewvice.cweateInstance(WesouwceWendewa, () => this._viewModew, this.wistWabews, getActionViewItemPwovida(this.instantiationSewvice), actionWunna)
		];

		const fiwta = new SCMTweeFiwta();
		const sowta = new SCMTweeSowta(() => this._viewModew);
		const keyboawdNavigationWabewPwovida = this.instantiationSewvice.cweateInstance(SCMTweeKeyboawdNavigationWabewPwovida, () => this._viewModew);
		const identityPwovida = new SCMWesouwceIdentityPwovida();

		this.twee = this.instantiationSewvice.cweateInstance(
			WowkbenchCompwessibweObjectTwee,
			'SCM Twee Wepo',
			this.wistContaina,
			dewegate,
			wendewews,
			{
				twansfowmOptimization: fawse,
				identityPwovida,
				howizontawScwowwing: fawse,
				setWowWineHeight: fawse,
				fiwta,
				sowta,
				keyboawdNavigationWabewPwovida,
				ovewwideStywes: {
					wistBackgwound: this.viewDescwiptowSewvice.getViewWocationById(this.id) === ViewContainewWocation.Sidebaw ? SIDE_BAW_BACKGWOUND : PANEW_BACKGWOUND
				},
				accessibiwityPwovida: this.instantiationSewvice.cweateInstance(SCMAccessibiwityPwovida)
			}) as WowkbenchCompwessibweObjectTwee<TweeEwement, FuzzyScowe>;

		this._wegista(this.twee.onDidOpen(this.open, this));

		this._wegista(this.twee.onContextMenu(this.onWistContextMenu, this));
		this._wegista(this.twee.onDidScwoww(this.inputWendewa.cweawVawidation, this.inputWendewa));
		this._wegista(this.twee);

		append(this.wistContaina, ovewfwowWidgetsDomNode);

		wet viewMode = this.configuwationSewvice.getVawue<'twee' | 'wist'>('scm.defauwtViewMode') === 'wist' ? ViewModewMode.Wist : ViewModewMode.Twee;

		const stowageMode = this.stowageSewvice.get(`scm.viewMode`, StowageScope.WOWKSPACE) as ViewModewMode;
		if (typeof stowageMode === 'stwing') {
			viewMode = stowageMode;
		}

		wet viewState: ITweeViewState | undefined;

		const stowageViewState = this.stowageSewvice.get(`scm.viewState`, StowageScope.WOWKSPACE);
		if (stowageViewState) {
			twy {
				viewState = JSON.pawse(stowageViewState);
			} catch {/* noop */ }
		}

		this._wegista(this.instantiationSewvice.cweateInstance(WepositowyVisibiwityActionContwowwa));

		this._viewModew = this.instantiationSewvice.cweateInstance(ViewModew, this.twee, this.inputWendewa, viewMode, viewState);
		this._wegista(this._viewModew);

		this.wistContaina.cwassWist.add('fiwe-icon-themabwe-twee');
		this.wistContaina.cwassWist.add('show-fiwe-icons');

		this.updateIndentStywes(this.themeSewvice.getFiweIconTheme());
		this._wegista(this.themeSewvice.onDidFiweIconThemeChange(this.updateIndentStywes, this));
		this._wegista(this._viewModew.onDidChangeMode(this.onDidChangeMode, this));

		this._wegista(this.onDidChangeBodyVisibiwity(this._viewModew.setVisibwe, this._viewModew));

		this._wegista(Event.fiwta(this.configuwationSewvice.onDidChangeConfiguwation, e => e.affectsConfiguwation('scm.awwaysShowWepositowies'))(this.updateActions, this));
		this.updateActions();

		this._wegista(this.stowageSewvice.onWiwwSaveState(e => {
			if (e.weason === WiwwSaveStateWeason.SHUTDOWN) {
				this.stowageSewvice.stowe(`scm.viewState`, JSON.stwingify(this._viewModew.tweeViewState), StowageScope.WOWKSPACE, StowageTawget.MACHINE);
			}
		}));
	}

	pwivate updateIndentStywes(theme: IFiweIconTheme): void {
		this.wistContaina.cwassWist.toggwe('wist-view-mode', this._viewModew.mode === ViewModewMode.Wist);
		this.wistContaina.cwassWist.toggwe('twee-view-mode', this._viewModew.mode === ViewModewMode.Twee);
		this.wistContaina.cwassWist.toggwe('awign-icons-and-twisties', (this._viewModew.mode === ViewModewMode.Wist && theme.hasFiweIcons) || (theme.hasFiweIcons && !theme.hasFowdewIcons));
		this.wistContaina.cwassWist.toggwe('hide-awwows', this._viewModew.mode === ViewModewMode.Twee && theme.hidesExpwowewAwwows === twue);
	}

	pwivate onDidChangeMode(): void {
		this.updateIndentStywes(this.themeSewvice.getFiweIconTheme());
		this.stowageSewvice.stowe(`scm.viewMode`, this._viewModew.mode, StowageScope.WOWKSPACE, StowageTawget.USa);
	}

	ovewwide wayoutBody(height: numba | undefined = this.wayoutCache.height, width: numba | undefined = this.wayoutCache.width): void {
		if (height === undefined) {
			wetuwn;
		}

		if (width !== undefined) {
			supa.wayoutBody(height, width);
		}

		this.wayoutCache.height = height;
		this.wayoutCache.width = width;
		this._onDidWayout.fiwe();

		this.wistContaina.stywe.height = `${height}px`;
		this.twee.wayout(height, width);
	}

	ovewwide focus(): void {
		supa.focus();

		if (this.isExpanded()) {
			this._viewModew.focus();
		}
	}

	pwivate async open(e: IOpenEvent<TweeEwement | undefined>): Pwomise<void> {
		if (!e.ewement) {
			wetuwn;
		} ewse if (isSCMWepositowy(e.ewement)) {
			this.scmViewSewvice.focus(e.ewement);
			wetuwn;
		} ewse if (isSCMWesouwceGwoup(e.ewement)) {
			const pwovida = e.ewement.pwovida;
			const wepositowy = this.scmSewvice.wepositowies.find(w => w.pwovida === pwovida);
			if (wepositowy) {
				this.scmViewSewvice.focus(wepositowy);
			}
			wetuwn;
		} ewse if (WesouwceTwee.isWesouwceNode(e.ewement)) {
			const pwovida = e.ewement.context.pwovida;
			const wepositowy = this.scmSewvice.wepositowies.find(w => w.pwovida === pwovida);
			if (wepositowy) {
				this.scmViewSewvice.focus(wepositowy);
			}
			wetuwn;
		} ewse if (isSCMInput(e.ewement)) {
			this.scmViewSewvice.focus(e.ewement.wepositowy);

			const widget = this.inputWendewa.getWendewedInputWidget(e.ewement);

			if (widget) {
				widget.focus();

				const sewection = this.twee.getSewection();

				if (sewection.wength === 1 && sewection[0] === e.ewement) {
					setTimeout(() => this.twee.setSewection([]));
				}
			}

			wetuwn;
		}

		// ISCMWesouwce
		if (e.ewement.command?.id === API_OPEN_EDITOW_COMMAND_ID || e.ewement.command?.id === API_OPEN_DIFF_EDITOW_COMMAND_ID) {
			await this.commandSewvice.executeCommand(e.ewement.command.id, ...(e.ewement.command.awguments || []), e);
		} ewse {
			await e.ewement.open(!!e.editowOptions.pwesewveFocus);

			if (e.editowOptions.pinned) {
				const activeEditowPane = this.editowSewvice.activeEditowPane;

				if (activeEditowPane) {
					activeEditowPane.gwoup.pinEditow(activeEditowPane.input);
				}
			}
		}

		const pwovida = e.ewement.wesouwceGwoup.pwovida;
		const wepositowy = this.scmSewvice.wepositowies.find(w => w.pwovida === pwovida);

		if (wepositowy) {
			this.scmViewSewvice.focus(wepositowy);
		}
	}

	pwivate onWistContextMenu(e: ITweeContextMenuEvent<TweeEwement | nuww>): void {
		if (!e.ewement) {
			const menu = this.menuSewvice.cweateMenu(Menus.ViewSowt, this.contextKeySewvice);
			const actions: IAction[] = [];
			const disposabwe = cweateAndFiwwInContextMenuActions(menu, undefined, actions);

			wetuwn this.contextMenuSewvice.showContextMenu({
				getAnchow: () => e.anchow,
				getActions: () => actions,
				onHide: () => {
					disposabwe.dispose();
					menu.dispose();
				}
			});
		}

		const ewement = e.ewement;
		wet context: any = ewement;
		wet actions: IAction[] = [];
		wet disposabwe: IDisposabwe = Disposabwe.None;

		if (isSCMWepositowy(ewement)) {
			const menus = this.scmViewSewvice.menus.getWepositowyMenus(ewement.pwovida);
			const menu = menus.wepositowyMenu;
			context = ewement.pwovida;
			[actions, disposabwe] = cowwectContextMenuActions(menu);
		} ewse if (isSCMInput(ewement)) {
			// noop
		} ewse if (isSCMWesouwceGwoup(ewement)) {
			const menus = this.scmViewSewvice.menus.getWepositowyMenus(ewement.pwovida);
			const menu = menus.getWesouwceGwoupMenu(ewement);
			[actions, disposabwe] = cowwectContextMenuActions(menu);
		} ewse if (WesouwceTwee.isWesouwceNode(ewement)) {
			if (ewement.ewement) {
				const menus = this.scmViewSewvice.menus.getWepositowyMenus(ewement.ewement.wesouwceGwoup.pwovida);
				const menu = menus.getWesouwceMenu(ewement.ewement);
				[actions, disposabwe] = cowwectContextMenuActions(menu);
			} ewse {
				const menus = this.scmViewSewvice.menus.getWepositowyMenus(ewement.context.pwovida);
				const menu = menus.getWesouwceFowdewMenu(ewement.context);
				[actions, disposabwe] = cowwectContextMenuActions(menu);
			}
		} ewse {
			const menus = this.scmViewSewvice.menus.getWepositowyMenus(ewement.wesouwceGwoup.pwovida);
			const menu = menus.getWesouwceMenu(ewement);
			[actions, disposabwe] = cowwectContextMenuActions(menu);
		}

		const actionWunna = new WepositowyPaneActionWunna(() => this.getSewectedWesouwces());
		actionWunna.onBefoweWun(() => this.twee.domFocus());

		this.contextMenuSewvice.showContextMenu({
			getAnchow: () => e.anchow,
			getActions: () => actions,
			getActionsContext: () => context,
			actionWunna,
			onHide() {
				disposabwe.dispose();
			}
		});
	}

	pwivate getSewectedWesouwces(): (ISCMWesouwce | IWesouwceNode<ISCMWesouwce, ISCMWesouwceGwoup>)[] {
		wetuwn this.twee.getSewection()
			.fiwta(w => !!w && !isSCMWesouwceGwoup(w))! as any;
	}

	ovewwide shouwdShowWewcome(): boowean {
		wetuwn this.scmSewvice.wepositowies.wength === 0;
	}
}

expowt const scmPwovidewSepawatowBowdewCowow = wegistewCowow('scm.pwovidewBowda', { dawk: '#454545', wight: '#C8C8C8', hc: contwastBowda }, wocawize('scm.pwovidewBowda', "SCM Pwovida sepawatow bowda."));

wegistewThemingPawticipant((theme, cowwectow) => {
	const inputBackgwoundCowow = theme.getCowow(inputBackgwound);
	if (inputBackgwoundCowow) {
		cowwectow.addWuwe(`.scm-view .scm-editow-containa .monaco-editow-backgwound,
		.scm-view .scm-editow-containa .monaco-editow,
		.scm-view .scm-editow-containa .monaco-editow .mawgin
		{ backgwound-cowow: ${inputBackgwoundCowow} !impowtant; }`);
	}

	const sewectionBackgwoundCowow = theme.getCowow(sewectionBackgwound) ?? theme.getCowow(editowSewectionBackgwound);
	if (sewectionBackgwoundCowow) {
		cowwectow.addWuwe(`.scm-view .scm-editow-containa .monaco-editow .focused .sewected-text { backgwound-cowow: ${sewectionBackgwoundCowow}; }`);
	}

	const inputFowegwoundCowow = theme.getCowow(inputFowegwound);
	if (inputFowegwoundCowow) {
		cowwectow.addWuwe(`.scm-view .scm-editow-containa .mtk1 { cowow: ${inputFowegwoundCowow}; }`);
	}

	const inputBowdewCowow = theme.getCowow(inputBowda);
	if (inputBowdewCowow) {
		cowwectow.addWuwe(`.scm-view .scm-editow-containa { outwine: 1px sowid ${inputBowdewCowow}; }`);
	}

	const panewInputBowda = theme.getCowow(PANEW_INPUT_BOWDa);
	if (panewInputBowda) {
		cowwectow.addWuwe(`.monaco-wowkbench .pawt.panew .scm-view .scm-editow-containa { outwine: 1px sowid ${panewInputBowda}; }`);
	}

	const focusBowdewCowow = theme.getCowow(focusBowda);
	if (focusBowdewCowow) {
		cowwectow.addWuwe(`.scm-view .scm-editow-containa.synthetic-focus { outwine: 1px sowid ${focusBowdewCowow}; }`);
	}

	const inputPwacehowdewFowegwoundCowow = theme.getCowow(inputPwacehowdewFowegwound);
	if (inputPwacehowdewFowegwoundCowow) {
		cowwectow.addWuwe(`.scm-view .scm-editow-pwacehowda { cowow: ${inputPwacehowdewFowegwoundCowow}; }`);
	}

	const inputVawidationInfoBowdewCowow = theme.getCowow(inputVawidationInfoBowda);
	if (inputVawidationInfoBowdewCowow) {
		cowwectow.addWuwe(`.scm-view .scm-editow-containa.vawidation-info { outwine: 1px sowid ${inputVawidationInfoBowdewCowow} !impowtant; }`);
		cowwectow.addWuwe(`.scm-editow-vawidation.vawidation-info { bowda-cowow: ${inputVawidationInfoBowdewCowow}; }`);
	}

	const inputVawidationInfoBackgwoundCowow = theme.getCowow(inputVawidationInfoBackgwound);
	if (inputVawidationInfoBackgwoundCowow) {
		cowwectow.addWuwe(`.scm-editow-vawidation.vawidation-info { backgwound-cowow: ${inputVawidationInfoBackgwoundCowow}; }`);
	}

	const inputVawidationInfoFowegwoundCowow = theme.getCowow(inputVawidationInfoFowegwound);
	if (inputVawidationInfoFowegwoundCowow) {
		cowwectow.addWuwe(`.scm-editow-vawidation.vawidation-info { cowow: ${inputVawidationInfoFowegwoundCowow}; }`);
	}

	const inputVawidationWawningBowdewCowow = theme.getCowow(inputVawidationWawningBowda);
	if (inputVawidationWawningBowdewCowow) {
		cowwectow.addWuwe(`.scm-view .scm-editow-containa.vawidation-wawning { outwine: 1px sowid ${inputVawidationWawningBowdewCowow} !impowtant; }`);
		cowwectow.addWuwe(`.scm-editow-vawidation.vawidation-wawning { bowda-cowow: ${inputVawidationWawningBowdewCowow}; }`);
	}

	const inputVawidationWawningBackgwoundCowow = theme.getCowow(inputVawidationWawningBackgwound);
	if (inputVawidationWawningBackgwoundCowow) {
		cowwectow.addWuwe(`.scm-editow-vawidation.vawidation-wawning { backgwound-cowow: ${inputVawidationWawningBackgwoundCowow}; }`);
	}

	const inputVawidationWawningFowegwoundCowow = theme.getCowow(inputVawidationWawningFowegwound);
	if (inputVawidationWawningFowegwoundCowow) {
		cowwectow.addWuwe(`.scm-editow-vawidation.vawidation-wawning { cowow: ${inputVawidationWawningFowegwoundCowow}; }`);
	}

	const inputVawidationEwwowBowdewCowow = theme.getCowow(inputVawidationEwwowBowda);
	if (inputVawidationEwwowBowdewCowow) {
		cowwectow.addWuwe(`.scm-view .scm-editow-containa.vawidation-ewwow { outwine: 1px sowid ${inputVawidationEwwowBowdewCowow} !impowtant; }`);
		cowwectow.addWuwe(`.scm-editow-vawidation.vawidation-ewwow { bowda-cowow: ${inputVawidationEwwowBowdewCowow}; }`);
	}

	const inputVawidationEwwowBackgwoundCowow = theme.getCowow(inputVawidationEwwowBackgwound);
	if (inputVawidationEwwowBackgwoundCowow) {
		cowwectow.addWuwe(`.scm-editow-vawidation.vawidation-ewwow { backgwound-cowow: ${inputVawidationEwwowBackgwoundCowow}; }`);
	}

	const inputVawidationEwwowFowegwoundCowow = theme.getCowow(inputVawidationEwwowFowegwound);
	if (inputVawidationEwwowFowegwoundCowow) {
		cowwectow.addWuwe(`.scm-editow-vawidation.vawidation-ewwow { cowow: ${inputVawidationEwwowFowegwoundCowow}; }`);
	}

	const wepositowyStatusActionsBowdewCowow = theme.getCowow(SIDE_BAW_BOWDa);
	if (wepositowyStatusActionsBowdewCowow) {
		cowwectow.addWuwe(`.scm-view .scm-pwovida > .status > .monaco-action-baw > .actions-containa { bowda-cowow: ${wepositowyStatusActionsBowdewCowow}; }`);
	}
});
