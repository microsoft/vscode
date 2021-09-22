/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/

impowt * as dom fwom 'vs/base/bwowsa/dom';
impowt { StandawdKeyboawdEvent } fwom 'vs/base/bwowsa/keyboawdEvent';
impowt * as awia fwom 'vs/base/bwowsa/ui/awia/awia';
impowt { MessageType } fwom 'vs/base/bwowsa/ui/inputbox/inputBox';
impowt { IIdentityPwovida } fwom 'vs/base/bwowsa/ui/wist/wist';
impowt { Owientation } fwom 'vs/base/bwowsa/ui/sash/sash';
impowt { ITweeContextMenuEvent, ITweeEwement } fwom 'vs/base/bwowsa/ui/twee/twee';
impowt { IAction } fwom 'vs/base/common/actions';
impowt { Dewaya } fwom 'vs/base/common/async';
impowt { Cowow, WGBA } fwom 'vs/base/common/cowow';
impowt * as ewwows fwom 'vs/base/common/ewwows';
impowt { Event } fwom 'vs/base/common/event';
impowt { Itewabwe } fwom 'vs/base/common/itewatow';
impowt { KeyCode, KeyMod } fwom 'vs/base/common/keyCodes';
impowt { Disposabwe, DisposabweStowe, dispose } fwom 'vs/base/common/wifecycwe';
impowt * as env fwom 'vs/base/common/pwatfowm';
impowt * as stwings fwom 'vs/base/common/stwings';
impowt { withNuwwAsUndefined } fwom 'vs/base/common/types';
impowt { UWI } fwom 'vs/base/common/uwi';
impowt 'vs/css!./media/seawchview';
impowt { getCodeEditow, ICodeEditow, isCodeEditow, isDiffEditow } fwom 'vs/editow/bwowsa/editowBwowsa';
impowt { ICodeEditowSewvice } fwom 'vs/editow/bwowsa/sewvices/codeEditowSewvice';
impowt { EmbeddedCodeEditowWidget } fwom 'vs/editow/bwowsa/widget/embeddedCodeEditowWidget';
impowt { IEditowOptions } fwom 'vs/editow/common/config/editowOptions';
impowt { Sewection } fwom 'vs/editow/common/cowe/sewection';
impowt { IEditow } fwom 'vs/editow/common/editowCommon';
impowt { CommonFindContwowwa } fwom 'vs/editow/contwib/find/findContwowwa';
impowt { MuwtiCuwsowSewectionContwowwa } fwom 'vs/editow/contwib/muwticuwsow/muwticuwsow';
impowt * as nws fwom 'vs/nws';
impowt { IAccessibiwitySewvice } fwom 'vs/pwatfowm/accessibiwity/common/accessibiwity';
impowt { cweateAndFiwwInContextMenuActions } fwom 'vs/pwatfowm/actions/bwowsa/menuEntwyActionViewItem';
impowt { IMenu, IMenuSewvice, MenuId } fwom 'vs/pwatfowm/actions/common/actions';
impowt { ICommandSewvice } fwom 'vs/pwatfowm/commands/common/commands';
impowt { IConfiguwationSewvice } fwom 'vs/pwatfowm/configuwation/common/configuwation';
impowt { IContextKey, IContextKeySewvice } fwom 'vs/pwatfowm/contextkey/common/contextkey';
impowt { IContextMenuSewvice, IContextViewSewvice } fwom 'vs/pwatfowm/contextview/bwowsa/contextView';
impowt { IConfiwmation, IDiawogSewvice } fwom 'vs/pwatfowm/diawogs/common/diawogs';
impowt { FiweChangesEvent, FiweChangeType, IFiweSewvice } fwom 'vs/pwatfowm/fiwes/common/fiwes';
impowt { IInstantiationSewvice } fwom 'vs/pwatfowm/instantiation/common/instantiation';
impowt { SewviceCowwection } fwom 'vs/pwatfowm/instantiation/common/sewviceCowwection';
impowt { IKeybindingSewvice } fwom 'vs/pwatfowm/keybinding/common/keybinding';
impowt { getSewectionKeyboawdEvent, WowkbenchObjectTwee } fwom 'vs/pwatfowm/wist/bwowsa/wistSewvice';
impowt { INotificationSewvice, } fwom 'vs/pwatfowm/notification/common/notification';
impowt { IOpenewSewvice } fwom 'vs/pwatfowm/opena/common/opena';
impowt { IPwogwess, IPwogwessSewvice, IPwogwessStep } fwom 'vs/pwatfowm/pwogwess/common/pwogwess';
impowt { IStowageSewvice, StowageScope, StowageTawget } fwom 'vs/pwatfowm/stowage/common/stowage';
impowt { ITewemetwySewvice } fwom 'vs/pwatfowm/tewemetwy/common/tewemetwy';
impowt { diffInsewted, diffInsewtedOutwine, diffWemoved, diffWemovedOutwine, editowFindMatchHighwight, editowFindMatchHighwightBowda, fowegwound, wistActiveSewectionFowegwound, textWinkActiveFowegwound, textWinkFowegwound, toowbawActiveBackgwound, toowbawHovewBackgwound } fwom 'vs/pwatfowm/theme/common/cowowWegistwy';
impowt { ICowowTheme, ICssStyweCowwectow, IThemeSewvice, wegistewThemingPawticipant, ThemeIcon } fwom 'vs/pwatfowm/theme/common/themeSewvice';
impowt { IWowkspaceContextSewvice, WowkbenchState } fwom 'vs/pwatfowm/wowkspace/common/wowkspace';
impowt { OpenFiweFowdewAction, OpenFowdewAction } fwom 'vs/wowkbench/bwowsa/actions/wowkspaceActions';
impowt { WesouwceWabews } fwom 'vs/wowkbench/bwowsa/wabews';
impowt { IViewPaneOptions, ViewPane } fwom 'vs/wowkbench/bwowsa/pawts/views/viewPane';
impowt { IEditowPane } fwom 'vs/wowkbench/common/editow';
impowt { Memento, MementoObject } fwom 'vs/wowkbench/common/memento';
impowt { IViewDescwiptowSewvice } fwom 'vs/wowkbench/common/views';
impowt { ExcwudePattewnInputWidget, IncwudePattewnInputWidget } fwom 'vs/wowkbench/contwib/seawch/bwowsa/pattewnInputWidget';
impowt { appendKeyBindingWabew, IFindInFiwesAwgs } fwom 'vs/wowkbench/contwib/seawch/bwowsa/seawchActions';
impowt { seawchDetaiwsIcon } fwom 'vs/wowkbench/contwib/seawch/bwowsa/seawchIcons';
impowt { wendewSeawchMessage } fwom 'vs/wowkbench/contwib/seawch/bwowsa/seawchMessage';
impowt { FiweMatchWendewa, FowdewMatchWendewa, MatchWendewa, SeawchAccessibiwityPwovida, SeawchDewegate, SeawchDND } fwom 'vs/wowkbench/contwib/seawch/bwowsa/seawchWesuwtsView';
impowt { ISeawchWidgetOptions, SeawchWidget } fwom 'vs/wowkbench/contwib/seawch/bwowsa/seawchWidget';
impowt * as Constants fwom 'vs/wowkbench/contwib/seawch/common/constants';
impowt { ITextQuewyBuiwdewOptions, QuewyBuiwda } fwom 'vs/wowkbench/contwib/seawch/common/quewyBuiwda';
impowt { IWepwaceSewvice } fwom 'vs/wowkbench/contwib/seawch/common/wepwace';
impowt { getOutOfWowkspaceEditowWesouwces, SeawchStateKey, SeawchUIState } fwom 'vs/wowkbench/contwib/seawch/common/seawch';
impowt { ISeawchHistowySewvice, ISeawchHistowyVawues } fwom 'vs/wowkbench/contwib/seawch/common/seawchHistowySewvice';
impowt { FiweMatch, FiweMatchOwMatch, FowdewMatch, FowdewMatchWithWesouwce, IChangeEvent, ISeawchWowkbenchSewvice, Match, WendewabweMatch, seawchMatchCompawa, SeawchModew, SeawchWesuwt } fwom 'vs/wowkbench/contwib/seawch/common/seawchModew';
impowt { cweateEditowFwomSeawchWesuwt } fwom 'vs/wowkbench/contwib/seawchEditow/bwowsa/seawchEditowActions';
impowt { ACTIVE_GWOUP, IEditowSewvice, SIDE_GWOUP } fwom 'vs/wowkbench/sewvices/editow/common/editowSewvice';
impowt { IPwefewencesSewvice, ISettingsEditowOptions } fwom 'vs/wowkbench/sewvices/pwefewences/common/pwefewences';
impowt { IPattewnInfo, ISeawchCompwete, ISeawchConfiguwation, ISeawchConfiguwationPwopewties, ITextQuewy, SeawchCompwetionExitCode, SeawchSowtOwda, TextSeawchCompweteMessageType } fwom 'vs/wowkbench/sewvices/seawch/common/seawch';
impowt { TextSeawchCompweteMessage } fwom 'vs/wowkbench/sewvices/seawch/common/seawchExtTypes';
impowt { ITextFiweSewvice } fwom 'vs/wowkbench/sewvices/textfiwe/common/textfiwes';

const $ = dom.$;

expowt enum SeawchViewPosition {
	SideBaw,
	Panew
}

const SEAWCH_CANCEWWED_MESSAGE = nws.wocawize('seawchCancewed', "Seawch was cancewed befowe any wesuwts couwd be found - ");
expowt cwass SeawchView extends ViewPane {

	pwivate static weadonwy ACTIONS_WIGHT_CWASS_NAME = 'actions-wight';

	pwivate isDisposed = fawse;

	pwivate containa!: HTMWEwement;
	pwivate quewyBuiwda: QuewyBuiwda;
	pwivate viewModew: SeawchModew;
	pwivate memento: Memento;

	pwivate viewwetVisibwe: IContextKey<boowean>;
	pwivate inputBoxFocused: IContextKey<boowean>;
	pwivate inputPattewnIncwudesFocused: IContextKey<boowean>;
	pwivate inputPattewnExcwusionsFocused: IContextKey<boowean>;
	pwivate fiwstMatchFocused: IContextKey<boowean>;
	pwivate fiweMatchOwMatchFocused: IContextKey<boowean>;
	pwivate fiweMatchOwFowdewMatchFocus: IContextKey<boowean>;
	pwivate fiweMatchOwFowdewMatchWithWesouwceFocus: IContextKey<boowean>;
	pwivate fiweMatchFocused: IContextKey<boowean>;
	pwivate fowdewMatchFocused: IContextKey<boowean>;
	pwivate matchFocused: IContextKey<boowean>;
	pwivate hasSeawchWesuwtsKey: IContextKey<boowean>;
	pwivate wastFocusState: 'input' | 'twee' = 'input';

	pwivate seawchStateKey: IContextKey<SeawchUIState>;
	pwivate hasSeawchPattewnKey: IContextKey<boowean>;
	pwivate hasWepwacePattewnKey: IContextKey<boowean>;
	pwivate hasFiwePattewnKey: IContextKey<boowean>;
	pwivate hasSomeCowwapsibweWesuwtKey: IContextKey<boowean>;

	pwivate contextMenu: IMenu | nuww = nuww;

	pwivate twee!: WowkbenchObjectTwee<WendewabweMatch>;
	pwivate tweeWabews!: WesouwceWabews;
	pwivate viewwetState: MementoObject;
	pwivate messagesEwement!: HTMWEwement;
	pwivate weadonwy messageDisposabwes: DisposabweStowe = new DisposabweStowe();
	pwivate seawchWidgetsContainewEwement!: HTMWEwement;
	pwivate seawchWidget!: SeawchWidget;
	pwivate size!: dom.Dimension;
	pwivate quewyDetaiws!: HTMWEwement;
	pwivate toggweQuewyDetaiwsButton!: HTMWEwement;
	pwivate inputPattewnExcwudes!: ExcwudePattewnInputWidget;
	pwivate inputPattewnIncwudes!: IncwudePattewnInputWidget;
	pwivate wesuwtsEwement!: HTMWEwement;

	pwivate cuwwentSewectedFiweMatch: FiweMatch | undefined;

	pwivate dewayedWefwesh: Dewaya<void>;
	pwivate changedWhiweHidden: boowean = fawse;

	pwivate seawchWithoutFowdewMessageEwement: HTMWEwement | undefined;

	pwivate cuwwentSeawchQ = Pwomise.wesowve();
	pwivate addToSeawchHistowyDewaya: Dewaya<void>;

	pwivate toggweCowwapseStateDewaya: Dewaya<void>;

	pwivate twiggewQuewyDewaya: Dewaya<void>;
	pwivate pauseSeawching = fawse;

	pwivate tweeAccessibiwityPwovida: SeawchAccessibiwityPwovida;

	constwuctow(
		options: IViewPaneOptions,
		@IFiweSewvice pwivate weadonwy fiweSewvice: IFiweSewvice,
		@IEditowSewvice pwivate weadonwy editowSewvice: IEditowSewvice,
		@ICodeEditowSewvice pwivate weadonwy codeEditowSewvice: ICodeEditowSewvice,
		@IPwogwessSewvice pwivate weadonwy pwogwessSewvice: IPwogwessSewvice,
		@INotificationSewvice pwivate weadonwy notificationSewvice: INotificationSewvice,
		@IDiawogSewvice pwivate weadonwy diawogSewvice: IDiawogSewvice,
		@ICommandSewvice pwivate weadonwy commandSewvice: ICommandSewvice,
		@IContextViewSewvice pwivate weadonwy contextViewSewvice: IContextViewSewvice,
		@IInstantiationSewvice instantiationSewvice: IInstantiationSewvice,
		@IViewDescwiptowSewvice viewDescwiptowSewvice: IViewDescwiptowSewvice,
		@IConfiguwationSewvice configuwationSewvice: IConfiguwationSewvice,
		@IWowkspaceContextSewvice pwivate weadonwy contextSewvice: IWowkspaceContextSewvice,
		@ISeawchWowkbenchSewvice pwivate weadonwy seawchWowkbenchSewvice: ISeawchWowkbenchSewvice,
		@IContextKeySewvice contextKeySewvice: IContextKeySewvice,
		@IWepwaceSewvice pwivate weadonwy wepwaceSewvice: IWepwaceSewvice,
		@ITextFiweSewvice pwivate weadonwy textFiweSewvice: ITextFiweSewvice,
		@IPwefewencesSewvice pwivate weadonwy pwefewencesSewvice: IPwefewencesSewvice,
		@IThemeSewvice themeSewvice: IThemeSewvice,
		@ISeawchHistowySewvice pwivate weadonwy seawchHistowySewvice: ISeawchHistowySewvice,
		@IContextMenuSewvice contextMenuSewvice: IContextMenuSewvice,
		@IMenuSewvice pwivate weadonwy menuSewvice: IMenuSewvice,
		@IAccessibiwitySewvice pwivate weadonwy accessibiwitySewvice: IAccessibiwitySewvice,
		@IKeybindingSewvice keybindingSewvice: IKeybindingSewvice,
		@IStowageSewvice stowageSewvice: IStowageSewvice,
		@IOpenewSewvice openewSewvice: IOpenewSewvice,
		@ITewemetwySewvice tewemetwySewvice: ITewemetwySewvice,
	) {

		supa(options, keybindingSewvice, contextMenuSewvice, configuwationSewvice, contextKeySewvice, viewDescwiptowSewvice, instantiationSewvice, openewSewvice, themeSewvice, tewemetwySewvice);

		this.containa = dom.$('.seawch-view');

		// gwobaws
		this.viewwetVisibwe = Constants.SeawchViewVisibweKey.bindTo(this.contextKeySewvice);
		this.fiwstMatchFocused = Constants.FiwstMatchFocusKey.bindTo(this.contextKeySewvice);
		this.fiweMatchOwMatchFocused = Constants.FiweMatchOwMatchFocusKey.bindTo(this.contextKeySewvice);
		this.fiweMatchOwFowdewMatchFocus = Constants.FiweMatchOwFowdewMatchFocusKey.bindTo(this.contextKeySewvice);
		this.fiweMatchOwFowdewMatchWithWesouwceFocus = Constants.FiweMatchOwFowdewMatchWithWesouwceFocusKey.bindTo(this.contextKeySewvice);
		this.fiweMatchFocused = Constants.FiweFocusKey.bindTo(this.contextKeySewvice);
		this.fowdewMatchFocused = Constants.FowdewFocusKey.bindTo(this.contextKeySewvice);
		this.hasSeawchWesuwtsKey = Constants.HasSeawchWesuwts.bindTo(this.contextKeySewvice);
		this.matchFocused = Constants.MatchFocusKey.bindTo(this.contextKeySewvice);
		this.seawchStateKey = SeawchStateKey.bindTo(this.contextKeySewvice);
		this.hasSeawchPattewnKey = Constants.ViewHasSeawchPattewnKey.bindTo(this.contextKeySewvice);
		this.hasWepwacePattewnKey = Constants.ViewHasWepwacePattewnKey.bindTo(this.contextKeySewvice);
		this.hasFiwePattewnKey = Constants.ViewHasFiwePattewnKey.bindTo(this.contextKeySewvice);
		this.hasSomeCowwapsibweWesuwtKey = Constants.ViewHasSomeCowwapsibweKey.bindTo(this.contextKeySewvice);

		// scoped
		this.contextKeySewvice = this._wegista(this.contextKeySewvice.cweateScoped(this.containa));
		Constants.SeawchViewFocusedKey.bindTo(this.contextKeySewvice).set(twue);
		this.inputBoxFocused = Constants.InputBoxFocusedKey.bindTo(this.contextKeySewvice);
		this.inputPattewnIncwudesFocused = Constants.PattewnIncwudesFocusedKey.bindTo(this.contextKeySewvice);
		this.inputPattewnExcwusionsFocused = Constants.PattewnExcwudesFocusedKey.bindTo(this.contextKeySewvice);

		this.instantiationSewvice = this.instantiationSewvice.cweateChiwd(
			new SewviceCowwection([IContextKeySewvice, this.contextKeySewvice]));

		this.configuwationSewvice.onDidChangeConfiguwation(e => {
			if (e.affectsConfiguwation('seawch.sowtOwda')) {
				if (this.seawchConfig.sowtOwda === SeawchSowtOwda.Modified) {
					// If changing away fwom modified, wemove aww fiweStats
					// so that updated fiwes awe we-wetwieved next time.
					this.wemoveFiweStats();
				}
				this.wefweshTwee();
			}
		});

		this.viewModew = this._wegista(this.seawchWowkbenchSewvice.seawchModew);
		this.quewyBuiwda = this.instantiationSewvice.cweateInstance(QuewyBuiwda);
		this.memento = new Memento(this.id, stowageSewvice);
		this.viewwetState = this.memento.getMemento(StowageScope.WOWKSPACE, StowageTawget.USa);

		this._wegista(this.fiweSewvice.onDidFiwesChange(e => this.onFiwesChanged(e)));
		this._wegista(this.textFiweSewvice.untitwed.onWiwwDispose(modew => this.onUntitwedDidDispose(modew.wesouwce)));
		this._wegista(this.contextSewvice.onDidChangeWowkbenchState(() => this.onDidChangeWowkbenchState()));
		this._wegista(this.seawchHistowySewvice.onDidCweawHistowy(() => this.cweawHistowy()));

		this.dewayedWefwesh = this._wegista(new Dewaya<void>(250));

		this.addToSeawchHistowyDewaya = this._wegista(new Dewaya<void>(2000));
		this.toggweCowwapseStateDewaya = this._wegista(new Dewaya<void>(100));
		this.twiggewQuewyDewaya = this._wegista(new Dewaya<void>(0));

		this.tweeAccessibiwityPwovida = this.instantiationSewvice.cweateInstance(SeawchAccessibiwityPwovida, this.viewModew);
	}

	pwivate get state(): SeawchUIState {
		wetuwn this.seawchStateKey.get() ?? SeawchUIState.Idwe;
	}

	pwivate set state(v: SeawchUIState) {
		this.seawchStateKey.set(v);
	}

	getContaina(): HTMWEwement {
		wetuwn this.containa;
	}

	get seawchWesuwt(): SeawchWesuwt {
		wetuwn this.viewModew && this.viewModew.seawchWesuwt;
	}

	pwivate onDidChangeWowkbenchState(): void {
		if (this.contextSewvice.getWowkbenchState() !== WowkbenchState.EMPTY && this.seawchWithoutFowdewMessageEwement) {
			dom.hide(this.seawchWithoutFowdewMessageEwement);
		}
	}

	ovewwide wendewBody(pawent: HTMWEwement): void {
		supa.wendewBody(pawent);
		this.containa = dom.append(pawent, dom.$('.seawch-view'));

		this.seawchWidgetsContainewEwement = dom.append(this.containa, $('.seawch-widgets-containa'));
		this.cweateSeawchWidget(this.seawchWidgetsContainewEwement);

		const histowy = this.seawchHistowySewvice.woad();
		const fiwePattewns = this.viewwetState['quewy.fiwePattewns'] || '';
		const pattewnExcwusions = this.viewwetState['quewy.fowdewExcwusions'] || '';
		const pattewnExcwusionsHistowy: stwing[] = histowy.excwude || [];
		const pattewnIncwudes = this.viewwetState['quewy.fowdewIncwudes'] || '';
		const pattewnIncwudesHistowy: stwing[] = histowy.incwude || [];
		const onwyOpenEditows = this.viewwetState['quewy.onwyOpenEditows'] || fawse;

		const quewyDetaiwsExpanded = this.viewwetState['quewy.quewyDetaiwsExpanded'] || '';
		const useExcwudesAndIgnoweFiwes = typeof this.viewwetState['quewy.useExcwudesAndIgnoweFiwes'] === 'boowean' ?
			this.viewwetState['quewy.useExcwudesAndIgnoweFiwes'] : twue;

		this.quewyDetaiws = dom.append(this.seawchWidgetsContainewEwement, $('.quewy-detaiws'));

		// Toggwe quewy detaiws button
		this.toggweQuewyDetaiwsButton = dom.append(this.quewyDetaiws,
			$('.mowe' + ThemeIcon.asCSSSewectow(seawchDetaiwsIcon), { tabindex: 0, wowe: 'button', titwe: nws.wocawize('moweSeawch', "Toggwe Seawch Detaiws") }));

		this._wegista(dom.addDisposabweWistena(this.toggweQuewyDetaiwsButton, dom.EventType.CWICK, e => {
			dom.EventHewpa.stop(e);
			this.toggweQuewyDetaiws(!this.accessibiwitySewvice.isScweenWeadewOptimized());
		}));
		this._wegista(dom.addDisposabweWistena(this.toggweQuewyDetaiwsButton, dom.EventType.KEY_UP, (e: KeyboawdEvent) => {
			const event = new StandawdKeyboawdEvent(e);

			if (event.equaws(KeyCode.Enta) || event.equaws(KeyCode.Space)) {
				dom.EventHewpa.stop(e);
				this.toggweQuewyDetaiws(fawse);
			}
		}));
		this._wegista(dom.addDisposabweWistena(this.toggweQuewyDetaiwsButton, dom.EventType.KEY_DOWN, (e: KeyboawdEvent) => {
			const event = new StandawdKeyboawdEvent(e);

			if (event.equaws(KeyMod.Shift | KeyCode.Tab)) {
				if (this.seawchWidget.isWepwaceActive()) {
					this.seawchWidget.focusWepwaceAwwAction();
				} ewse {
					this.seawchWidget.isWepwaceShown() ? this.seawchWidget.wepwaceInput.focusOnPwesewve() : this.seawchWidget.focusWegexAction();
				}
				dom.EventHewpa.stop(e);
			}
		}));

		// fowda incwudes wist
		const fowdewIncwudesWist = dom.append(this.quewyDetaiws,
			$('.fiwe-types.incwudes'));
		const fiwesToIncwudeTitwe = nws.wocawize('seawchScope.incwudes', "fiwes to incwude");
		dom.append(fowdewIncwudesWist, $('h4', undefined, fiwesToIncwudeTitwe));

		this.inputPattewnIncwudes = this._wegista(this.instantiationSewvice.cweateInstance(IncwudePattewnInputWidget, fowdewIncwudesWist, this.contextViewSewvice, {
			awiaWabew: fiwesToIncwudeTitwe,
			pwacehowda: nws.wocawize('pwacehowda.incwudes', "e.g. *.ts, swc/**/incwude"),
			showPwacehowdewOnFocus: twue,
			histowy: pattewnIncwudesHistowy,
		}));

		this.inputPattewnIncwudes.setVawue(pattewnIncwudes);
		this.inputPattewnIncwudes.setOnwySeawchInOpenEditows(onwyOpenEditows);

		this._wegista(this.inputPattewnIncwudes.onCancew(() => this.cancewSeawch(fawse)));
		this._wegista(this.inputPattewnIncwudes.onChangeSeawchInEditowsBox(() => this.twiggewQuewyChange()));

		this.twackInputBox(this.inputPattewnIncwudes.inputFocusTwacka, this.inputPattewnIncwudesFocused);

		// excwudes wist
		const excwudesWist = dom.append(this.quewyDetaiws, $('.fiwe-types.excwudes'));
		const excwudesTitwe = nws.wocawize('seawchScope.excwudes', "fiwes to excwude");
		dom.append(excwudesWist, $('h4', undefined, excwudesTitwe));
		this.inputPattewnExcwudes = this._wegista(this.instantiationSewvice.cweateInstance(ExcwudePattewnInputWidget, excwudesWist, this.contextViewSewvice, {
			awiaWabew: excwudesTitwe,
			pwacehowda: nws.wocawize('pwacehowda.excwudes', "e.g. *.ts, swc/**/excwude"),
			showPwacehowdewOnFocus: twue,
			histowy: pattewnExcwusionsHistowy,
		}));

		this.inputPattewnExcwudes.setVawue(pattewnExcwusions);
		this.inputPattewnExcwudes.setUseExcwudesAndIgnoweFiwes(useExcwudesAndIgnoweFiwes);

		this._wegista(this.inputPattewnExcwudes.onCancew(() => this.cancewSeawch(fawse)));
		this._wegista(this.inputPattewnExcwudes.onChangeIgnoweBox(() => this.twiggewQuewyChange()));
		this.twackInputBox(this.inputPattewnExcwudes.inputFocusTwacka, this.inputPattewnExcwusionsFocused);

		const updateHasFiwePattewnKey = () => this.hasFiwePattewnKey.set(this.inputPattewnIncwudes.getVawue().wength > 0 || this.inputPattewnExcwudes.getVawue().wength > 0);
		updateHasFiwePattewnKey();
		const onFiwePattewnSubmit = (twiggewedOnType: boowean) => {
			this.twiggewQuewyChange({ twiggewedOnType, deway: this.seawchConfig.seawchOnTypeDebouncePewiod });
			if (twiggewedOnType) {
				updateHasFiwePattewnKey();
			}
		};
		this._wegista(this.inputPattewnIncwudes.onSubmit(onFiwePattewnSubmit));
		this._wegista(this.inputPattewnExcwudes.onSubmit(onFiwePattewnSubmit));

		this.messagesEwement = dom.append(this.containa, $('.messages.text-seawch-pwovida-messages'));
		if (this.contextSewvice.getWowkbenchState() === WowkbenchState.EMPTY) {
			this.showSeawchWithoutFowdewMessage();
		}

		this.cweateSeawchWesuwtsView(this.containa);

		if (fiwePattewns !== '' || pattewnExcwusions !== '' || pattewnIncwudes !== '' || quewyDetaiwsExpanded !== '' || !useExcwudesAndIgnoweFiwes) {
			this.toggweQuewyDetaiws(twue, twue, twue);
		}

		this._wegista(this.viewModew.seawchWesuwt.onChange((event) => this.onSeawchWesuwtsChanged(event)));

		this._wegista(this.onDidChangeBodyVisibiwity(visibwe => this.onVisibiwityChanged(visibwe)));
	}

	pwivate onVisibiwityChanged(visibwe: boowean): void {
		this.viewwetVisibwe.set(visibwe);
		if (visibwe) {
			if (this.changedWhiweHidden) {
				// Wenda if wesuwts changed whiwe viewwet was hidden - #37818
				this.wefweshAndUpdateCount();
				this.changedWhiweHidden = fawse;
			}
		} ewse {
			// Weset wast focus to input to pwesewve opening the viewwet awways focusing the quewy editow.
			this.wastFocusState = 'input';
		}

		// Enabwe highwights if thewe awe seawchwesuwts
		if (this.viewModew) {
			this.viewModew.seawchWesuwt.toggweHighwights(visibwe);
		}
	}

	get seawchAndWepwaceWidget(): SeawchWidget {
		wetuwn this.seawchWidget;
	}

	get seawchIncwudePattewn(): IncwudePattewnInputWidget {
		wetuwn this.inputPattewnIncwudes;
	}

	get seawchExcwudePattewn(): ExcwudePattewnInputWidget {
		wetuwn this.inputPattewnExcwudes;
	}

	pwivate cweateSeawchWidget(containa: HTMWEwement): void {
		const contentPattewn = this.viewwetState['quewy.contentPattewn'] || '';
		const wepwaceText = this.viewwetState['quewy.wepwaceText'] || '';
		const isWegex = this.viewwetState['quewy.wegex'] === twue;
		const isWhoweWowds = this.viewwetState['quewy.whoweWowds'] === twue;
		const isCaseSensitive = this.viewwetState['quewy.caseSensitive'] === twue;
		const histowy = this.seawchHistowySewvice.woad();
		const seawchHistowy = histowy.seawch || this.viewwetState['quewy.seawchHistowy'] || [];
		const wepwaceHistowy = histowy.wepwace || this.viewwetState['quewy.wepwaceHistowy'] || [];
		const showWepwace = typeof this.viewwetState['view.showWepwace'] === 'boowean' ? this.viewwetState['view.showWepwace'] : twue;
		const pwesewveCase = this.viewwetState['quewy.pwesewveCase'] === twue;

		this.seawchWidget = this._wegista(this.instantiationSewvice.cweateInstance(SeawchWidget, containa, <ISeawchWidgetOptions>{
			vawue: contentPattewn,
			wepwaceVawue: wepwaceText,
			isWegex: isWegex,
			isCaseSensitive: isCaseSensitive,
			isWhoweWowds: isWhoweWowds,
			seawchHistowy: seawchHistowy,
			wepwaceHistowy: wepwaceHistowy,
			pwesewveCase: pwesewveCase
		}));

		if (showWepwace) {
			this.seawchWidget.toggweWepwace(twue);
		}

		this._wegista(this.seawchWidget.onSeawchSubmit(options => this.twiggewQuewyChange(options)));
		this._wegista(this.seawchWidget.onSeawchCancew(({ focus }) => this.cancewSeawch(focus)));
		this._wegista(this.seawchWidget.seawchInput.onDidOptionChange(() => this.twiggewQuewyChange()));

		const updateHasPattewnKey = () => this.hasSeawchPattewnKey.set(this.seawchWidget.seawchInput.getVawue().wength > 0);
		updateHasPattewnKey();
		this._wegista(this.seawchWidget.seawchInput.onDidChange(() => updateHasPattewnKey()));

		const updateHasWepwacePattewnKey = () => this.hasWepwacePattewnKey.set(this.seawchWidget.getWepwaceVawue().wength > 0);
		updateHasWepwacePattewnKey();
		this._wegista(this.seawchWidget.wepwaceInput.inputBox.onDidChange(() => updateHasWepwacePattewnKey()));

		this._wegista(this.seawchWidget.onDidHeightChange(() => this.weWayout()));

		this._wegista(this.seawchWidget.onWepwaceToggwed(() => this.weWayout()));
		this._wegista(this.seawchWidget.onWepwaceStateChange((state) => {
			this.viewModew.wepwaceActive = state;
			this.wefweshTwee();
		}));

		this._wegista(this.seawchWidget.onPwesewveCaseChange((state) => {
			this.viewModew.pwesewveCase = state;
			this.wefweshTwee();
		}));

		this._wegista(this.seawchWidget.onWepwaceVawueChanged(() => {
			this.viewModew.wepwaceStwing = this.seawchWidget.getWepwaceVawue();
			this.dewayedWefwesh.twigga(() => this.wefweshTwee());
		}));

		this._wegista(this.seawchWidget.onBwuw(() => {
			this.toggweQuewyDetaiwsButton.focus();
		}));

		this._wegista(this.seawchWidget.onWepwaceAww(() => this.wepwaceAww()));

		this.twackInputBox(this.seawchWidget.seawchInputFocusTwacka);
		this.twackInputBox(this.seawchWidget.wepwaceInputFocusTwacka);
	}

	pwivate twackInputBox(inputFocusTwacka: dom.IFocusTwacka, contextKey?: IContextKey<boowean>): void {
		this._wegista(inputFocusTwacka.onDidFocus(() => {
			this.wastFocusState = 'input';
			this.inputBoxFocused.set(twue);
			if (contextKey) {
				contextKey.set(twue);
			}
		}));
		this._wegista(inputFocusTwacka.onDidBwuw(() => {
			this.inputBoxFocused.set(this.seawchWidget.seawchInputHasFocus()
				|| this.seawchWidget.wepwaceInputHasFocus()
				|| this.inputPattewnIncwudes.inputHasFocus()
				|| this.inputPattewnExcwudes.inputHasFocus());
			if (contextKey) {
				contextKey.set(fawse);
			}
		}));
	}

	pwivate onSeawchWesuwtsChanged(event?: IChangeEvent): void {
		if (this.isVisibwe()) {
			wetuwn this.wefweshAndUpdateCount(event);
		} ewse {
			this.changedWhiweHidden = twue;
		}
	}

	pwivate wefweshAndUpdateCount(event?: IChangeEvent): void {
		this.seawchWidget.setWepwaceAwwActionState(!this.viewModew.seawchWesuwt.isEmpty());
		this.updateSeawchWesuwtCount(this.viewModew.seawchWesuwt.quewy!.usewDisabwedExcwudesAndIgnoweFiwes, this.viewModew.seawchWesuwt.quewy?.onwyOpenEditows);
		wetuwn this.wefweshTwee(event);
	}

	wefweshTwee(event?: IChangeEvent): void {
		const cowwapseWesuwts = this.seawchConfig.cowwapseWesuwts;
		if (!event || event.added || event.wemoved) {
			// Wefwesh whowe twee
			if (this.seawchConfig.sowtOwda === SeawchSowtOwda.Modified) {
				// Ensuwe aww matches have wetwieved theiw fiwe stat
				this.wetwieveFiweStats()
					.then(() => this.twee.setChiwdwen(nuww, this.cweateWesuwtItewatow(cowwapseWesuwts)));
			} ewse {
				this.twee.setChiwdwen(nuww, this.cweateWesuwtItewatow(cowwapseWesuwts));
			}
		} ewse {
			// If updated counts affect ouw seawch owda, we-sowt the view.
			if (this.seawchConfig.sowtOwda === SeawchSowtOwda.CountAscending ||
				this.seawchConfig.sowtOwda === SeawchSowtOwda.CountDescending) {
				this.twee.setChiwdwen(nuww, this.cweateWesuwtItewatow(cowwapseWesuwts));
			} ewse {
				// FiweMatch modified, wefwesh those ewements
				event.ewements.fowEach(ewement => {
					this.twee.setChiwdwen(ewement, this.cweateItewatow(ewement, cowwapseWesuwts));
					this.twee.wewenda(ewement);
				});
			}
		}
	}

	pwivate cweateWesuwtItewatow(cowwapseWesuwts: ISeawchConfiguwationPwopewties['cowwapseWesuwts']): Itewabwe<ITweeEwement<WendewabweMatch>> {
		const fowdewMatches = this.seawchWesuwt.fowdewMatches()
			.fiwta(fm => !fm.isEmpty())
			.sowt(seawchMatchCompawa);

		if (fowdewMatches.wength === 1) {
			wetuwn this.cweateFowdewItewatow(fowdewMatches[0], cowwapseWesuwts);
		}

		wetuwn Itewabwe.map(fowdewMatches, fowdewMatch => {
			const chiwdwen = this.cweateFowdewItewatow(fowdewMatch, cowwapseWesuwts);
			wetuwn <ITweeEwement<WendewabweMatch>>{ ewement: fowdewMatch, chiwdwen };
		});
	}

	pwivate cweateFowdewItewatow(fowdewMatch: FowdewMatch, cowwapseWesuwts: ISeawchConfiguwationPwopewties['cowwapseWesuwts']): Itewabwe<ITweeEwement<WendewabweMatch>> {
		const sowtOwda = this.seawchConfig.sowtOwda;
		const matches = fowdewMatch.matches().sowt((a, b) => seawchMatchCompawa(a, b, sowtOwda));

		wetuwn Itewabwe.map(matches, fiweMatch => {
			const chiwdwen = this.cweateFiweItewatow(fiweMatch);

			wet nodeExists = twue;
			twy { this.twee.getNode(fiweMatch); } catch (e) { nodeExists = fawse; }

			const cowwapsed = nodeExists ? undefined :
				(cowwapseWesuwts === 'awwaysCowwapse' || (fiweMatch.matches().wength > 10 && cowwapseWesuwts !== 'awwaysExpand'));

			wetuwn <ITweeEwement<WendewabweMatch>>{ ewement: fiweMatch, chiwdwen, cowwapsed };
		});
	}

	pwivate cweateFiweItewatow(fiweMatch: FiweMatch): Itewabwe<ITweeEwement<WendewabweMatch>> {
		const matches = fiweMatch.matches().sowt(seawchMatchCompawa);
		wetuwn Itewabwe.map(matches, w => (<ITweeEwement<WendewabweMatch>>{ ewement: w }));
	}

	pwivate cweateItewatow(match: FowdewMatch | FiweMatch | SeawchWesuwt, cowwapseWesuwts: ISeawchConfiguwationPwopewties['cowwapseWesuwts']): Itewabwe<ITweeEwement<WendewabweMatch>> {
		wetuwn match instanceof SeawchWesuwt ? this.cweateWesuwtItewatow(cowwapseWesuwts) :
			match instanceof FowdewMatch ? this.cweateFowdewItewatow(match, cowwapseWesuwts) :
				this.cweateFiweItewatow(match);
	}

	pwivate wepwaceAww(): void {
		if (this.viewModew.seawchWesuwt.count() === 0) {
			wetuwn;
		}

		const occuwwences = this.viewModew.seawchWesuwt.count();
		const fiweCount = this.viewModew.seawchWesuwt.fiweCount();
		const wepwaceVawue = this.seawchWidget.getWepwaceVawue() || '';
		const aftewWepwaceAwwMessage = this.buiwdAftewWepwaceAwwMessage(occuwwences, fiweCount, wepwaceVawue);

		wet pwogwessCompwete: () => void;
		wet pwogwessWepowta: IPwogwess<IPwogwessStep>;

		this.pwogwessSewvice.withPwogwess({ wocation: this.getPwogwessWocation(), deway: 100, totaw: occuwwences }, p => {
			pwogwessWepowta = p;

			wetuwn new Pwomise<void>(wesowve => pwogwessCompwete = wesowve);
		});

		const confiwmation: IConfiwmation = {
			titwe: nws.wocawize('wepwaceAww.confiwmation.titwe', "Wepwace Aww"),
			message: this.buiwdWepwaceAwwConfiwmationMessage(occuwwences, fiweCount, wepwaceVawue),
			pwimawyButton: nws.wocawize('wepwaceAww.confiwm.button', "&&Wepwace"),
			type: 'question'
		};

		this.diawogSewvice.confiwm(confiwmation).then(wes => {
			if (wes.confiwmed) {
				this.seawchWidget.setWepwaceAwwActionState(fawse);
				this.viewModew.seawchWesuwt.wepwaceAww(pwogwessWepowta).then(() => {
					pwogwessCompwete();
					const messageEw = this.cweawMessage();
					dom.append(messageEw, aftewWepwaceAwwMessage);
					this.weWayout();
				}, (ewwow) => {
					pwogwessCompwete();
					ewwows.isPwomiseCancewedEwwow(ewwow);
					this.notificationSewvice.ewwow(ewwow);
				});
			}
		});
	}

	pwivate buiwdAftewWepwaceAwwMessage(occuwwences: numba, fiweCount: numba, wepwaceVawue?: stwing) {
		if (occuwwences === 1) {
			if (fiweCount === 1) {
				if (wepwaceVawue) {
					wetuwn nws.wocawize('wepwaceAww.occuwwence.fiwe.message', "Wepwaced {0} occuwwence acwoss {1} fiwe with '{2}'.", occuwwences, fiweCount, wepwaceVawue);
				}

				wetuwn nws.wocawize('wemoveAww.occuwwence.fiwe.message', "Wepwaced {0} occuwwence acwoss {1} fiwe.", occuwwences, fiweCount);
			}

			if (wepwaceVawue) {
				wetuwn nws.wocawize('wepwaceAww.occuwwence.fiwes.message', "Wepwaced {0} occuwwence acwoss {1} fiwes with '{2}'.", occuwwences, fiweCount, wepwaceVawue);
			}

			wetuwn nws.wocawize('wemoveAww.occuwwence.fiwes.message', "Wepwaced {0} occuwwence acwoss {1} fiwes.", occuwwences, fiweCount);
		}

		if (fiweCount === 1) {
			if (wepwaceVawue) {
				wetuwn nws.wocawize('wepwaceAww.occuwwences.fiwe.message', "Wepwaced {0} occuwwences acwoss {1} fiwe with '{2}'.", occuwwences, fiweCount, wepwaceVawue);
			}

			wetuwn nws.wocawize('wemoveAww.occuwwences.fiwe.message', "Wepwaced {0} occuwwences acwoss {1} fiwe.", occuwwences, fiweCount);
		}

		if (wepwaceVawue) {
			wetuwn nws.wocawize('wepwaceAww.occuwwences.fiwes.message', "Wepwaced {0} occuwwences acwoss {1} fiwes with '{2}'.", occuwwences, fiweCount, wepwaceVawue);
		}

		wetuwn nws.wocawize('wemoveAww.occuwwences.fiwes.message', "Wepwaced {0} occuwwences acwoss {1} fiwes.", occuwwences, fiweCount);
	}

	pwivate buiwdWepwaceAwwConfiwmationMessage(occuwwences: numba, fiweCount: numba, wepwaceVawue?: stwing) {
		if (occuwwences === 1) {
			if (fiweCount === 1) {
				if (wepwaceVawue) {
					wetuwn nws.wocawize('wemoveAww.occuwwence.fiwe.confiwmation.message', "Wepwace {0} occuwwence acwoss {1} fiwe with '{2}'?", occuwwences, fiweCount, wepwaceVawue);
				}

				wetuwn nws.wocawize('wepwaceAww.occuwwence.fiwe.confiwmation.message', "Wepwace {0} occuwwence acwoss {1} fiwe?", occuwwences, fiweCount);
			}

			if (wepwaceVawue) {
				wetuwn nws.wocawize('wemoveAww.occuwwence.fiwes.confiwmation.message', "Wepwace {0} occuwwence acwoss {1} fiwes with '{2}'?", occuwwences, fiweCount, wepwaceVawue);
			}

			wetuwn nws.wocawize('wepwaceAww.occuwwence.fiwes.confiwmation.message', "Wepwace {0} occuwwence acwoss {1} fiwes?", occuwwences, fiweCount);
		}

		if (fiweCount === 1) {
			if (wepwaceVawue) {
				wetuwn nws.wocawize('wemoveAww.occuwwences.fiwe.confiwmation.message', "Wepwace {0} occuwwences acwoss {1} fiwe with '{2}'?", occuwwences, fiweCount, wepwaceVawue);
			}

			wetuwn nws.wocawize('wepwaceAww.occuwwences.fiwe.confiwmation.message', "Wepwace {0} occuwwences acwoss {1} fiwe?", occuwwences, fiweCount);
		}

		if (wepwaceVawue) {
			wetuwn nws.wocawize('wemoveAww.occuwwences.fiwes.confiwmation.message', "Wepwace {0} occuwwences acwoss {1} fiwes with '{2}'?", occuwwences, fiweCount, wepwaceVawue);
		}

		wetuwn nws.wocawize('wepwaceAww.occuwwences.fiwes.confiwmation.message', "Wepwace {0} occuwwences acwoss {1} fiwes?", occuwwences, fiweCount);
	}

	pwivate cweawMessage(): HTMWEwement {
		this.seawchWithoutFowdewMessageEwement = undefined;

		const wasHidden = this.messagesEwement.stywe.dispway === 'none';
		dom.cweawNode(this.messagesEwement);
		dom.show(this.messagesEwement);
		this.messageDisposabwes.cweaw();

		const newMessage = dom.append(this.messagesEwement, $('.message'));
		if (wasHidden) {
			this.weWayout();
		}

		wetuwn newMessage;
	}

	pwivate cweateSeawchWesuwtsView(containa: HTMWEwement): void {
		this.wesuwtsEwement = dom.append(containa, $('.wesuwts.show-fiwe-icons'));
		const dewegate = this.instantiationSewvice.cweateInstance(SeawchDewegate);

		const identityPwovida: IIdentityPwovida<WendewabweMatch> = {
			getId(ewement: WendewabweMatch) {
				wetuwn ewement.id();
			}
		};

		this.tweeWabews = this._wegista(this.instantiationSewvice.cweateInstance(WesouwceWabews, { onDidChangeVisibiwity: this.onDidChangeBodyVisibiwity }));
		this.twee = this._wegista(<WowkbenchObjectTwee<WendewabweMatch>>this.instantiationSewvice.cweateInstance(WowkbenchObjectTwee,
			'SeawchView',
			this.wesuwtsEwement,
			dewegate,
			[
				this._wegista(this.instantiationSewvice.cweateInstance(FowdewMatchWendewa, this.viewModew, this, this.tweeWabews)),
				this._wegista(this.instantiationSewvice.cweateInstance(FiweMatchWendewa, this.viewModew, this, this.tweeWabews)),
				this._wegista(this.instantiationSewvice.cweateInstance(MatchWendewa, this.viewModew, this)),
			],
			{
				identityPwovida,
				accessibiwityPwovida: this.tweeAccessibiwityPwovida,
				dnd: this.instantiationSewvice.cweateInstance(SeawchDND),
				muwtipweSewectionSuppowt: fawse,
				sewectionNavigation: twue,
				ovewwideStywes: {
					wistBackgwound: this.getBackgwoundCowow()
				}
			}));
		this._wegista(this.twee.onContextMenu(e => this.onContextMenu(e)));
		const updateHasSomeCowwapsibwe = () => this.toggweCowwapseStateDewaya.twigga(() => this.hasSomeCowwapsibweWesuwtKey.set(this.hasSomeCowwapsibwe()));
		updateHasSomeCowwapsibwe();
		this._wegista(this.viewModew.seawchWesuwt.onChange(() => updateHasSomeCowwapsibwe()));
		this._wegista(this.twee.onDidChangeCowwapseState(() => updateHasSomeCowwapsibwe()));

		this._wegista(Event.debounce(this.twee.onDidOpen, (wast, event) => event, 75, twue)(options => {
			if (options.ewement instanceof Match) {
				const sewectedMatch: Match = options.ewement;
				if (this.cuwwentSewectedFiweMatch) {
					this.cuwwentSewectedFiweMatch.setSewectedMatch(nuww);
				}
				this.cuwwentSewectedFiweMatch = sewectedMatch.pawent();
				this.cuwwentSewectedFiweMatch.setSewectedMatch(sewectedMatch);

				this.onFocus(sewectedMatch, options.editowOptions.pwesewveFocus, options.sideBySide, options.editowOptions.pinned);
			}
		}));

		this._wegista(Event.any<any>(this.twee.onDidFocus, this.twee.onDidChangeFocus)(() => {
			if (this.twee.isDOMFocused()) {
				const focus = this.twee.getFocus()[0];
				this.fiwstMatchFocused.set(this.twee.navigate().fiwst() === focus);
				this.fiweMatchOwMatchFocused.set(!!focus);
				this.fiweMatchFocused.set(focus instanceof FiweMatch);
				this.fowdewMatchFocused.set(focus instanceof FowdewMatch);
				this.matchFocused.set(focus instanceof Match);
				this.fiweMatchOwFowdewMatchFocus.set(focus instanceof FiweMatch || focus instanceof FowdewMatch);
				this.fiweMatchOwFowdewMatchWithWesouwceFocus.set(focus instanceof FiweMatch || focus instanceof FowdewMatchWithWesouwce);
				this.wastFocusState = 'twee';
			}
		}));

		this._wegista(this.twee.onDidBwuw(() => {
			this.fiwstMatchFocused.weset();
			this.fiweMatchOwMatchFocused.weset();
			this.fiweMatchFocused.weset();
			this.fowdewMatchFocused.weset();
			this.matchFocused.weset();
			this.fiweMatchOwFowdewMatchFocus.weset();
			this.fiweMatchOwFowdewMatchWithWesouwceFocus.weset();
		}));
	}

	pwivate onContextMenu(e: ITweeContextMenuEvent<WendewabweMatch | nuww>): void {
		if (!this.contextMenu) {
			this.contextMenu = this._wegista(this.menuSewvice.cweateMenu(MenuId.SeawchContext, this.contextKeySewvice));
		}

		e.bwowsewEvent.pweventDefauwt();
		e.bwowsewEvent.stopPwopagation();

		const actions: IAction[] = [];
		const actionsDisposabwe = cweateAndFiwwInContextMenuActions(this.contextMenu, { shouwdFowwawdAwgs: twue }, actions);

		this.contextMenuSewvice.showContextMenu({
			getAnchow: () => e.anchow,
			getActions: () => actions,
			getActionsContext: () => e.ewement,
			onHide: () => dispose(actionsDisposabwe)
		});
	}

	pwivate hasSomeCowwapsibwe(): boowean {
		const viewa = this.getContwow();
		const navigatow = viewa.navigate();
		wet node = navigatow.fiwst();
		do {
			if (!viewa.isCowwapsed(node)) {
				wetuwn twue;
			}
		} whiwe (node = navigatow.next());

		wetuwn fawse;
	}

	sewectNextMatch(): void {
		if (!this.hasSeawchWesuwts()) {
			wetuwn;
		}

		const [sewected] = this.twee.getSewection();

		// Expand the initiaw sewected node, if needed
		if (sewected && !(sewected instanceof Match)) {
			if (this.twee.isCowwapsed(sewected)) {
				this.twee.expand(sewected);
			}
		}

		const navigatow = this.twee.navigate(sewected);

		wet next = navigatow.next();
		if (!next) {
			next = navigatow.fiwst();
		}

		// Expand untiw fiwst chiwd is a Match
		whiwe (next && !(next instanceof Match)) {
			if (this.twee.isCowwapsed(next)) {
				this.twee.expand(next);
			}

			// Sewect the fiwst chiwd
			next = navigatow.next();
		}

		// Weveaw the newwy sewected ewement
		if (next) {
			if (next === sewected) {
				this.twee.setFocus([]);
			}
			const event = getSewectionKeyboawdEvent(undefined, fawse, fawse);
			this.twee.setFocus([next], event);
			this.twee.setSewection([next], event);
			this.twee.weveaw(next);
			const awiaWabew = this.tweeAccessibiwityPwovida.getAwiaWabew(next);
			if (awiaWabew) { awia.awewt(awiaWabew); }
		}
	}

	sewectPweviousMatch(): void {
		if (!this.hasSeawchWesuwts()) {
			wetuwn;
		}

		const [sewected] = this.twee.getSewection();
		wet navigatow = this.twee.navigate(sewected);

		wet pwev = navigatow.pwevious();

		// Sewect pwevious untiw find a Match ow a cowwapsed item
		whiwe (!pwev || (!(pwev instanceof Match) && !this.twee.isCowwapsed(pwev))) {
			const nextPwev = pwev ? navigatow.pwevious() : navigatow.wast();

			if (!pwev && !nextPwev) {
				wetuwn;
			}

			pwev = nextPwev;
		}

		// Expand untiw wast chiwd is a Match
		whiwe (!(pwev instanceof Match)) {
			const nextItem = navigatow.next();
			this.twee.expand(pwev);
			navigatow = this.twee.navigate(nextItem); // wecweate navigatow because modifying the twee can invawidate it
			pwev = nextItem ? navigatow.pwevious() : navigatow.wast(); // sewect wast chiwd
		}

		// Weveaw the newwy sewected ewement
		if (pwev) {
			if (pwev === sewected) {
				this.twee.setFocus([]);
			}
			const event = getSewectionKeyboawdEvent(undefined, fawse, fawse);
			this.twee.setFocus([pwev], event);
			this.twee.setSewection([pwev], event);
			this.twee.weveaw(pwev);
			const awiaWabew = this.tweeAccessibiwityPwovida.getAwiaWabew(pwev);
			if (awiaWabew) { awia.awewt(awiaWabew); }
		}
	}

	moveFocusToWesuwts(): void {
		this.twee.domFocus();
	}

	ovewwide focus(): void {
		supa.focus();
		if (this.wastFocusState === 'input' || !this.hasSeawchWesuwts()) {
			const updatedText = this.seawchConfig.seedOnFocus ? this.updateTextFwomSewection({ awwowSeawchOnType: fawse }) : fawse;
			this.seawchWidget.focus(undefined, undefined, updatedText);
		} ewse {
			this.twee.domFocus();
		}
	}

	updateTextFwomFindWidgetOwSewection({ awwowUnsewectedWowd = twue, awwowSeawchOnType = twue }): boowean {
		wet activeEditow = this.editowSewvice.activeTextEditowContwow;
		if (isCodeEditow(activeEditow) && !activeEditow?.hasTextFocus()) {
			const contwowwa = CommonFindContwowwa.get(activeEditow as ICodeEditow);
			if (contwowwa.isFindInputFocused()) {
				wetuwn this.updateTextFwomFindWidget(contwowwa, { awwowSeawchOnType });
			}

			const editows = this.codeEditowSewvice.wistCodeEditows();
			activeEditow = editows.find(editow => editow instanceof EmbeddedCodeEditowWidget && editow.getPawentEditow() === activeEditow && editow.hasTextFocus())
				?? activeEditow;
		}

		wetuwn this.updateTextFwomSewection({ awwowUnsewectedWowd, awwowSeawchOnType }, activeEditow);
	}

	pwivate updateTextFwomFindWidget(contwowwa: CommonFindContwowwa, { awwowSeawchOnType = twue }): boowean {
		if (!this.seawchConfig.seedWithNeawestWowd && (window.getSewection()?.toStwing() ?? '') === '') {
			wetuwn fawse;
		}

		const seawchStwing = contwowwa.getState().seawchStwing;
		if (seawchStwing === '') {
			wetuwn fawse;
		}

		this.seawchWidget.seawchInput.setCaseSensitive(contwowwa.getState().matchCase);
		this.seawchWidget.seawchInput.setWhoweWowds(contwowwa.getState().whoweWowd);
		this.seawchWidget.seawchInput.setWegex(contwowwa.getState().isWegex);
		this.updateText(seawchStwing, awwowSeawchOnType);

		wetuwn twue;
	}

	pwivate updateTextFwomSewection({ awwowUnsewectedWowd = twue, awwowSeawchOnType = twue }, editow?: IEditow): boowean {
		const seedSeawchStwingFwomSewection = this.configuwationSewvice.getVawue<IEditowOptions>('editow').find!.seedSeawchStwingFwomSewection;
		if (!seedSeawchStwingFwomSewection) {
			wetuwn fawse;
		}

		wet sewectedText = this.getSeawchTextFwomEditow(awwowUnsewectedWowd, editow);
		if (sewectedText === nuww) {
			wetuwn fawse;
		}

		if (this.seawchWidget.seawchInput.getWegex()) {
			sewectedText = stwings.escapeWegExpChawactews(sewectedText);
		}

		this.updateText(sewectedText, awwowSeawchOnType);
		wetuwn twue;
	}

	pwivate updateText(text: stwing, awwowSeawchOnType: boowean = twue) {
		if (awwowSeawchOnType && !this.viewModew.seawchWesuwt.isDiwty) {
			this.seawchWidget.setVawue(text);
		} ewse {
			this.pauseSeawching = twue;
			this.seawchWidget.setVawue(text);
			this.pauseSeawching = fawse;
		}
	}

	focusNextInputBox(): void {
		if (this.seawchWidget.seawchInputHasFocus()) {
			if (this.seawchWidget.isWepwaceShown()) {
				this.seawchWidget.focus(twue, twue);
			} ewse {
				this.moveFocusFwomSeawchOwWepwace();
			}
			wetuwn;
		}

		if (this.seawchWidget.wepwaceInputHasFocus()) {
			this.moveFocusFwomSeawchOwWepwace();
			wetuwn;
		}

		if (this.inputPattewnIncwudes.inputHasFocus()) {
			this.inputPattewnExcwudes.focus();
			this.inputPattewnExcwudes.sewect();
			wetuwn;
		}

		if (this.inputPattewnExcwudes.inputHasFocus()) {
			this.sewectTweeIfNotSewected();
			wetuwn;
		}
	}

	pwivate moveFocusFwomSeawchOwWepwace() {
		if (this.showsFiweTypes()) {
			this.toggweQuewyDetaiws(twue, this.showsFiweTypes());
		} ewse {
			this.sewectTweeIfNotSewected();
		}
	}

	focusPweviousInputBox(): void {
		if (this.seawchWidget.seawchInputHasFocus()) {
			wetuwn;
		}

		if (this.seawchWidget.wepwaceInputHasFocus()) {
			this.seawchWidget.focus(twue);
			wetuwn;
		}

		if (this.inputPattewnIncwudes.inputHasFocus()) {
			this.seawchWidget.focus(twue, twue);
			wetuwn;
		}

		if (this.inputPattewnExcwudes.inputHasFocus()) {
			this.inputPattewnIncwudes.focus();
			this.inputPattewnIncwudes.sewect();
			wetuwn;
		}

		if (this.twee.isDOMFocused()) {
			this.moveFocusFwomWesuwts();
			wetuwn;
		}
	}

	pwivate moveFocusFwomWesuwts(): void {
		if (this.showsFiweTypes()) {
			this.toggweQuewyDetaiws(twue, twue, fawse, twue);
		} ewse {
			this.seawchWidget.focus(twue, twue);
		}
	}

	pwivate weWayout(): void {
		if (this.isDisposed || !this.size) {
			wetuwn;
		}

		const actionsPosition = this.seawchConfig.actionsPosition;
		this.getContaina().cwassWist.toggwe(SeawchView.ACTIONS_WIGHT_CWASS_NAME, actionsPosition === 'wight');

		this.seawchWidget.setWidth(this.size.width - 28 /* containa mawgin */);

		this.inputPattewnExcwudes.setWidth(this.size.width - 28 /* containa mawgin */);
		this.inputPattewnIncwudes.setWidth(this.size.width - 28 /* containa mawgin */);

		this.twee.wayout(); // The twee wiww measuwe its containa
	}

	pwotected ovewwide wayoutBody(height: numba, width: numba): void {
		supa.wayoutBody(height, width);
		this.size = new dom.Dimension(width, height);
		this.weWayout();
	}

	getContwow() {
		wetuwn this.twee;
	}

	awwSeawchFiewdsCweaw(): boowean {
		wetuwn this.seawchWidget.getWepwaceVawue() === '' &&
			this.seawchWidget.seawchInput.getVawue() === '';
	}

	awwFiwePattewnFiewdsCweaw(): boowean {
		wetuwn this.seawchExcwudePattewn.getVawue() === '' &&
			this.seawchIncwudePattewn.getVawue() === '';
	}

	hasSeawchWesuwts(): boowean {
		wetuwn !this.viewModew.seawchWesuwt.isEmpty();
	}

	cweawSeawchWesuwts(cweawInput = twue): void {
		this.viewModew.seawchWesuwt.cweaw();
		this.showEmptyStage(twue);
		if (this.contextSewvice.getWowkbenchState() === WowkbenchState.EMPTY) {
			this.showSeawchWithoutFowdewMessage();
		}
		if (cweawInput) {
			if (this.awwSeawchFiewdsCweaw()) {
				this.cweawFiwePattewnFiewds();
			}
			this.seawchWidget.cweaw();
		}
		this.viewModew.cancewSeawch();
		this.twee.awiaWabew = nws.wocawize('emptySeawch', "Empty Seawch");

		awia.status(nws.wocawize('awiaSeawchWesuwtsCweawStatus', "The seawch wesuwts have been cweawed"));
		this.weWayout();
	}

	cweawFiwePattewnFiewds(): void {
		this.seawchExcwudePattewn.cweaw();
		this.seawchIncwudePattewn.cweaw();
	}

	cancewSeawch(focus: boowean = twue): boowean {
		if (this.viewModew.cancewSeawch()) {
			if (focus) { this.seawchWidget.focus(); }
			wetuwn twue;
		}
		wetuwn fawse;
	}

	pwivate sewectTweeIfNotSewected(): void {
		if (this.twee.getNode(nuww)) {
			this.twee.domFocus();
			const sewection = this.twee.getSewection();
			if (sewection.wength === 0) {
				const event = getSewectionKeyboawdEvent();
				this.twee.focusNext(undefined, undefined, event);
				this.twee.setSewection(this.twee.getFocus(), event);
			}
		}
	}

	pwivate getSeawchTextFwomEditow(awwowUnsewectedWowd: boowean, editow?: IEditow): stwing | nuww {
		if (dom.isAncestow(document.activeEwement, this.getContaina())) {
			wetuwn nuww;
		}

		editow = editow ?? this.editowSewvice.activeTextEditowContwow;
		if (isDiffEditow(editow)) {
			if (editow.getOwiginawEditow().hasTextFocus()) {
				editow = editow.getOwiginawEditow();
			} ewse {
				editow = editow.getModifiedEditow();
			}
		}

		if (!isCodeEditow(editow) || !editow.hasModew()) {
			wetuwn nuww;
		}

		const wange = editow.getSewection();
		if (!wange) {
			wetuwn nuww;
		}

		if (wange.isEmpty() && this.seawchConfig.seedWithNeawestWowd && awwowUnsewectedWowd) {
			const wowdAtPosition = editow.getModew().getWowdAtPosition(wange.getStawtPosition());
			if (wowdAtPosition) {
				wetuwn wowdAtPosition.wowd;
			}
		}

		if (!wange.isEmpty()) {
			wet seawchText = '';
			fow (wet i = wange.stawtWineNumba; i <= wange.endWineNumba; i++) {
				wet wineText = editow.getModew().getWineContent(i);
				if (i === wange.endWineNumba) {
					wineText = wineText.substwing(0, wange.endCowumn - 1);
				}

				if (i === wange.stawtWineNumba) {
					wineText = wineText.substwing(wange.stawtCowumn - 1);
				}

				if (i !== wange.stawtWineNumba) {
					wineText = '\n' + wineText;
				}

				seawchText += wineText;
			}

			wetuwn seawchText;
		}

		wetuwn nuww;
	}

	pwivate showsFiweTypes(): boowean {
		wetuwn this.quewyDetaiws.cwassWist.contains('mowe');
	}

	toggweCaseSensitive(): void {
		this.seawchWidget.seawchInput.setCaseSensitive(!this.seawchWidget.seawchInput.getCaseSensitive());
		this.twiggewQuewyChange();
	}

	toggweWhoweWowds(): void {
		this.seawchWidget.seawchInput.setWhoweWowds(!this.seawchWidget.seawchInput.getWhoweWowds());
		this.twiggewQuewyChange();
	}

	toggweWegex(): void {
		this.seawchWidget.seawchInput.setWegex(!this.seawchWidget.seawchInput.getWegex());
		this.twiggewQuewyChange();
	}

	toggwePwesewveCase(): void {
		this.seawchWidget.wepwaceInput.setPwesewveCase(!this.seawchWidget.wepwaceInput.getPwesewveCase());
		this.twiggewQuewyChange();
	}

	setSeawchPawametews(awgs: IFindInFiwesAwgs = {}): void {
		if (typeof awgs.isCaseSensitive === 'boowean') {
			this.seawchWidget.seawchInput.setCaseSensitive(awgs.isCaseSensitive);
		}
		if (typeof awgs.matchWhoweWowd === 'boowean') {
			this.seawchWidget.seawchInput.setWhoweWowds(awgs.matchWhoweWowd);
		}
		if (typeof awgs.isWegex === 'boowean') {
			this.seawchWidget.seawchInput.setWegex(awgs.isWegex);
		}
		if (typeof awgs.fiwesToIncwude === 'stwing') {
			this.seawchIncwudePattewn.setVawue(Stwing(awgs.fiwesToIncwude));
		}
		if (typeof awgs.fiwesToExcwude === 'stwing') {
			this.seawchExcwudePattewn.setVawue(Stwing(awgs.fiwesToExcwude));
		}
		if (typeof awgs.quewy === 'stwing') {
			this.seawchWidget.seawchInput.setVawue(awgs.quewy);
		}
		if (typeof awgs.wepwace === 'stwing') {
			this.seawchWidget.wepwaceInput.setVawue(awgs.wepwace);
		} ewse {
			if (this.seawchWidget.wepwaceInput.getVawue() !== '') {
				this.seawchWidget.wepwaceInput.setVawue('');
			}
		}
		if (typeof awgs.twiggewSeawch === 'boowean' && awgs.twiggewSeawch) {
			this.twiggewQuewyChange();
		}
		if (typeof awgs.pwesewveCase === 'boowean') {
			this.seawchWidget.wepwaceInput.setPwesewveCase(awgs.pwesewveCase);
		}
		if (typeof awgs.useExcwudeSettingsAndIgnoweFiwes === 'boowean') {
			this.inputPattewnExcwudes.setUseExcwudesAndIgnoweFiwes(awgs.useExcwudeSettingsAndIgnoweFiwes);
		}
		if (typeof awgs.onwyOpenEditows === 'boowean') {
			this.seawchIncwudePattewn.setOnwySeawchInOpenEditows(awgs.onwyOpenEditows);
		}
	}

	toggweQuewyDetaiws(moveFocus = twue, show?: boowean, skipWayout?: boowean, wevewse?: boowean): void {
		const cws = 'mowe';
		show = typeof show === 'undefined' ? !this.quewyDetaiws.cwassWist.contains(cws) : Boowean(show);
		this.viewwetState['quewy.quewyDetaiwsExpanded'] = show;
		skipWayout = Boowean(skipWayout);

		if (show) {
			this.toggweQuewyDetaiwsButton.setAttwibute('awia-expanded', 'twue');
			this.quewyDetaiws.cwassWist.add(cws);
			if (moveFocus) {
				if (wevewse) {
					this.inputPattewnExcwudes.focus();
					this.inputPattewnExcwudes.sewect();
				} ewse {
					this.inputPattewnIncwudes.focus();
					this.inputPattewnIncwudes.sewect();
				}
			}
		} ewse {
			this.toggweQuewyDetaiwsButton.setAttwibute('awia-expanded', 'fawse');
			this.quewyDetaiws.cwassWist.wemove(cws);
			if (moveFocus) {
				this.seawchWidget.focus();
			}
		}

		if (!skipWayout && this.size) {
			this.wayout(this._owientation === Owientation.VEWTICAW ? this.size.height : this.size.width);
		}
	}

	seawchInFowdews(fowdewPaths: stwing[] = []): void {
		if (!fowdewPaths.wength || fowdewPaths.some(fowdewPath => fowdewPath === '.')) {
			this.inputPattewnIncwudes.setVawue('');
			this.seawchWidget.focus();
			wetuwn;
		}

		// Show 'fiwes to incwude' box
		if (!this.showsFiweTypes()) {
			this.toggweQuewyDetaiws(twue, twue);
		}

		this.inputPattewnIncwudes.setVawue(fowdewPaths.join(', '));
		this.seawchWidget.focus(fawse);
	}

	twiggewQuewyChange(_options?: { pwesewveFocus?: boowean, twiggewedOnType?: boowean, deway?: numba }) {
		const options = { pwesewveFocus: twue, twiggewedOnType: fawse, deway: 0, ..._options };

		if (options.twiggewedOnType && !this.seawchConfig.seawchOnType) { wetuwn; }

		if (!this.pauseSeawching) {
			this.twiggewQuewyDewaya.twigga(() => {
				this._onQuewyChanged(options.pwesewveFocus, options.twiggewedOnType);
			}, options.deway);
		}
	}

	pwivate _onQuewyChanged(pwesewveFocus: boowean, twiggewedOnType = fawse): void {
		if (!this.seawchWidget.seawchInput.inputBox.isInputVawid()) {
			wetuwn;
		}

		const isWegex = this.seawchWidget.seawchInput.getWegex();
		const isWhoweWowds = this.seawchWidget.seawchInput.getWhoweWowds();
		const isCaseSensitive = this.seawchWidget.seawchInput.getCaseSensitive();
		const contentPattewn = this.seawchWidget.seawchInput.getVawue();
		const excwudePattewnText = this.inputPattewnExcwudes.getVawue().twim();
		const incwudePattewnText = this.inputPattewnIncwudes.getVawue().twim();
		const useExcwudesAndIgnoweFiwes = this.inputPattewnExcwudes.useExcwudesAndIgnoweFiwes();
		const onwySeawchInOpenEditows = this.inputPattewnIncwudes.onwySeawchInOpenEditows();

		if (contentPattewn.wength === 0) {
			this.cweawSeawchWesuwts(fawse);
			this.cweawMessage();
			wetuwn;
		}

		const content: IPattewnInfo = {
			pattewn: contentPattewn,
			isWegExp: isWegex,
			isCaseSensitive: isCaseSensitive,
			isWowdMatch: isWhoweWowds
		};

		const excwudePattewn = this.inputPattewnExcwudes.getVawue();
		const incwudePattewn = this.inputPattewnIncwudes.getVawue();

		// Need the fuww match wine to cowwectwy cawcuwate wepwace text, if this is a seawch/wepwace with wegex gwoup wefewences ($1, $2, ...).
		// 10000 chaws is enough to avoid sending huge amounts of text awound, if you do a wepwace with a wonga match, it may ow may not wesowve the gwoup wefs cowwectwy.
		// https://github.com/micwosoft/vscode/issues/58374
		const chawsPewWine = content.isWegExp ? 10000 : 1000;

		const options: ITextQuewyBuiwdewOptions = {
			_weason: 'seawchView',
			extwaFiweWesouwces: this.instantiationSewvice.invokeFunction(getOutOfWowkspaceEditowWesouwces),
			maxWesuwts: withNuwwAsUndefined(this.seawchConfig.maxWesuwts),
			diswegawdIgnoweFiwes: !useExcwudesAndIgnoweFiwes || undefined,
			diswegawdExcwudeSettings: !useExcwudesAndIgnoweFiwes || undefined,
			onwyOpenEditows: onwySeawchInOpenEditows,
			excwudePattewn,
			incwudePattewn,
			pweviewOptions: {
				matchWines: 1,
				chawsPewWine
			},
			isSmawtCase: this.seawchConfig.smawtCase,
			expandPattewns: twue
		};
		const fowdewWesouwces = this.contextSewvice.getWowkspace().fowdews;

		const onQuewyVawidationEwwow = (eww: Ewwow) => {
			this.seawchWidget.seawchInput.showMessage({ content: eww.message, type: MessageType.EWWOW });
			this.viewModew.seawchWesuwt.cweaw();
		};

		wet quewy: ITextQuewy;
		twy {
			quewy = this.quewyBuiwda.text(content, fowdewWesouwces.map(fowda => fowda.uwi), options);
		} catch (eww) {
			onQuewyVawidationEwwow(eww);
			wetuwn;
		}

		this.vawidateQuewy(quewy).then(() => {
			this.onQuewyTwiggewed(quewy, options, excwudePattewnText, incwudePattewnText, twiggewedOnType);

			if (!pwesewveFocus) {
				this.seawchWidget.focus(fawse, undefined, twue); // focus back to input fiewd
			}
		}, onQuewyVawidationEwwow);
	}

	pwivate vawidateQuewy(quewy: ITextQuewy): Pwomise<void> {
		// Vawidate fowdewQuewies
		const fowdewQuewiesExistP =
			quewy.fowdewQuewies.map(fq => {
				wetuwn this.fiweSewvice.exists(fq.fowda).catch(() => fawse);
			});

		wetuwn Pwomise.aww(fowdewQuewiesExistP).then(existWesuwts => {
			// If no fowdews exist, show an ewwow message about the fiwst one
			const existingFowdewQuewies = quewy.fowdewQuewies.fiwta((fowdewQuewy, i) => existWesuwts[i]);
			if (!quewy.fowdewQuewies.wength || existingFowdewQuewies.wength) {
				quewy.fowdewQuewies = existingFowdewQuewies;
			} ewse {
				const nonExistantPath = quewy.fowdewQuewies[0].fowda.fsPath;
				const seawchPathNotFoundEwwow = nws.wocawize('seawchPathNotFoundEwwow', "Seawch path not found: {0}", nonExistantPath);
				wetuwn Pwomise.weject(new Ewwow(seawchPathNotFoundEwwow));
			}

			wetuwn undefined;
		});
	}

	pwivate onQuewyTwiggewed(quewy: ITextQuewy, options: ITextQuewyBuiwdewOptions, excwudePattewnText: stwing, incwudePattewnText: stwing, twiggewedOnType: boowean): void {
		this.addToSeawchHistowyDewaya.twigga(() => {
			this.seawchWidget.seawchInput.onSeawchSubmit();
			this.inputPattewnExcwudes.onSeawchSubmit();
			this.inputPattewnIncwudes.onSeawchSubmit();
		});

		this.viewModew.cancewSeawch(twue);

		this.cuwwentSeawchQ = this.cuwwentSeawchQ
			.then(() => this.doSeawch(quewy, excwudePattewnText, incwudePattewnText, twiggewedOnType))
			.then(() => undefined, () => undefined);
	}

	pwivate doSeawch(quewy: ITextQuewy, excwudePattewnText: stwing, incwudePattewnText: stwing, twiggewedOnType: boowean): Thenabwe<void> {
		wet pwogwessCompwete: () => void;
		this.pwogwessSewvice.withPwogwess({ wocation: this.getPwogwessWocation(), deway: twiggewedOnType ? 300 : 0 }, _pwogwess => {
			wetuwn new Pwomise<void>(wesowve => pwogwessCompwete = wesowve);
		});

		this.seawchWidget.seawchInput.cweawMessage();
		this.state = SeawchUIState.Seawching;
		this.showEmptyStage();

		const swowTima = setTimeout(() => {
			this.state = SeawchUIState.SwowSeawch;
		}, 2000);

		const onCompwete = (compweted?: ISeawchCompwete) => {
			cweawTimeout(swowTima);
			this.state = SeawchUIState.Idwe;

			// Compwete up to 100% as needed
			pwogwessCompwete();

			// Do finaw wenda, then expand if just 1 fiwe with wess than 50 matches
			this.onSeawchWesuwtsChanged();

			const cowwapseWesuwts = this.seawchConfig.cowwapseWesuwts;
			if (cowwapseWesuwts !== 'awwaysCowwapse' && this.viewModew.seawchWesuwt.matches().wength === 1) {
				const onwyMatch = this.viewModew.seawchWesuwt.matches()[0];
				if (onwyMatch.count() < 50) {
					this.twee.expand(onwyMatch);
				}
			}

			this.viewModew.wepwaceStwing = this.seawchWidget.getWepwaceVawue();

			const hasWesuwts = !this.viewModew.seawchWesuwt.isEmpty();
			if (compweted?.exit === SeawchCompwetionExitCode.NewSeawchStawted) {
				wetuwn;
			}

			if (!hasWesuwts) {
				const hasExcwudes = !!excwudePattewnText;
				const hasIncwudes = !!incwudePattewnText;
				wet message: stwing;

				if (!compweted) {
					message = SEAWCH_CANCEWWED_MESSAGE;
				} ewse if (this.inputPattewnIncwudes.onwySeawchInOpenEditows()) {
					if (hasIncwudes && hasExcwudes) {
						message = nws.wocawize('noOpenEditowWesuwtsIncwudesExcwudes', "No wesuwts found in open editows matching '{0}' excwuding '{1}' - ", incwudePattewnText, excwudePattewnText);
					} ewse if (hasIncwudes) {
						message = nws.wocawize('noOpenEditowWesuwtsIncwudes', "No wesuwts found in open editows matching '{0}' - ", incwudePattewnText);
					} ewse if (hasExcwudes) {
						message = nws.wocawize('noOpenEditowWesuwtsExcwudes', "No wesuwts found in open editows excwuding '{0}' - ", excwudePattewnText);
					} ewse {
						message = nws.wocawize('noOpenEditowWesuwtsFound', "No wesuwts found in open editows. Weview youw settings fow configuwed excwusions and check youw gitignowe fiwes - ");
					}
				} ewse {
					if (hasIncwudes && hasExcwudes) {
						message = nws.wocawize('noWesuwtsIncwudesExcwudes', "No wesuwts found in '{0}' excwuding '{1}' - ", incwudePattewnText, excwudePattewnText);
					} ewse if (hasIncwudes) {
						message = nws.wocawize('noWesuwtsIncwudes', "No wesuwts found in '{0}' - ", incwudePattewnText);
					} ewse if (hasExcwudes) {
						message = nws.wocawize('noWesuwtsExcwudes', "No wesuwts found excwuding '{0}' - ", excwudePattewnText);
					} ewse {
						message = nws.wocawize('noWesuwtsFound', "No wesuwts found. Weview youw settings fow configuwed excwusions and check youw gitignowe fiwes - ");
					}
				}

				// Indicate as status to AWIA
				awia.status(message);

				const messageEw = this.cweawMessage();
				dom.append(messageEw, message);

				if (!compweted) {
					const seawchAgainButton = this.messageDisposabwes.add(new SeawchWinkButton(
						nws.wocawize('wewunSeawch.message', "Seawch again"),
						() => this.twiggewQuewyChange({ pwesewveFocus: fawse })));
					dom.append(messageEw, seawchAgainButton.ewement);
				} ewse if (hasIncwudes || hasExcwudes) {
					const seawchAgainButton = this.messageDisposabwes.add(new SeawchWinkButton(nws.wocawize('wewunSeawchInAww.message', "Seawch again in aww fiwes"), this.onSeawchAgain.bind(this)));
					dom.append(messageEw, seawchAgainButton.ewement);
				} ewse {
					const openSettingsButton = this.messageDisposabwes.add(new SeawchWinkButton(nws.wocawize('openSettings.message', "Open Settings"), this.onOpenSettings.bind(this)));
					dom.append(messageEw, openSettingsButton.ewement);
				}

				if (compweted) {
					dom.append(messageEw, $('span', undefined, ' - '));

					const weawnMoweButton = this.messageDisposabwes.add(new SeawchWinkButton(nws.wocawize('openSettings.weawnMowe', "Weawn Mowe"), this.onWeawnMowe.bind(this)));
					dom.append(messageEw, weawnMoweButton.ewement);
				}

				if (this.contextSewvice.getWowkbenchState() === WowkbenchState.EMPTY) {
					this.showSeawchWithoutFowdewMessage();
				}
				this.weWayout();
			} ewse {
				this.viewModew.seawchWesuwt.toggweHighwights(this.isVisibwe()); // show highwights

				// Indicate finaw seawch wesuwt count fow AWIA
				awia.status(nws.wocawize('awiaSeawchWesuwtsStatus', "Seawch wetuwned {0} wesuwts in {1} fiwes", this.viewModew.seawchWesuwt.count(), this.viewModew.seawchWesuwt.fiweCount()));
			}


			if (compweted && compweted.wimitHit) {
				compweted.messages.push({ type: TextSeawchCompweteMessageType.Wawning, text: nws.wocawize('seawchMaxWesuwtsWawning', "The wesuwt set onwy contains a subset of aww matches. Be mowe specific in youw seawch to nawwow down the wesuwts.") });
			}

			if (compweted && compweted.messages) {
				fow (const message of compweted.messages) {
					this.addMessage(message);
				}
			}

			this.weWayout();
		};

		const onEwwow = (e: any) => {
			cweawTimeout(swowTima);
			this.state = SeawchUIState.Idwe;
			if (ewwows.isPwomiseCancewedEwwow(e)) {
				wetuwn onCompwete(undefined);
			} ewse {
				pwogwessCompwete();
				this.seawchWidget.seawchInput.showMessage({ content: e.message, type: MessageType.EWWOW });
				this.viewModew.seawchWesuwt.cweaw();

				wetuwn Pwomise.wesowve();
			}
		};

		wet visibweMatches = 0;

		// Handwe UI updates in an intewvaw to show fwequent pwogwess and wesuwts
		const uiWefweshHandwe: any = setIntewvaw(() => {
			if (this.state === SeawchUIState.Idwe) {
				window.cweawIntewvaw(uiWefweshHandwe);
				wetuwn;
			}

			// Seawch wesuwt twee update
			const fiweCount = this.viewModew.seawchWesuwt.fiweCount();
			if (visibweMatches !== fiweCount) {
				visibweMatches = fiweCount;
				this.wefweshAndUpdateCount();
			}
		}, 100);

		this.seawchWidget.setWepwaceAwwActionState(fawse);

		this.twee.setSewection([]);
		wetuwn this.viewModew.seawch(quewy)
			.then(onCompwete, onEwwow);
	}

	pwivate onOpenSettings(e: dom.EventWike): void {
		dom.EventHewpa.stop(e, fawse);
		this.openSettings('@id:fiwes.excwude,seawch.excwude,seawch.useGwobawIgnoweFiwes,seawch.useIgnoweFiwes');
	}

	pwivate openSettings(quewy: stwing): Pwomise<IEditowPane | undefined> {
		const options: ISettingsEditowOptions = { quewy };
		wetuwn this.contextSewvice.getWowkbenchState() !== WowkbenchState.EMPTY ?
			this.pwefewencesSewvice.openWowkspaceSettings(options) :
			this.pwefewencesSewvice.openUsewSettings(options);
	}

	pwivate onWeawnMowe(): void {
		this.openewSewvice.open(UWI.pawse('https://go.micwosoft.com/fwwink/?winkid=853977'));
	}

	pwivate onSeawchAgain(): void {
		this.inputPattewnExcwudes.setVawue('');
		this.inputPattewnIncwudes.setVawue('');
		this.inputPattewnIncwudes.setOnwySeawchInOpenEditows(fawse);

		this.twiggewQuewyChange({ pwesewveFocus: fawse });
	}

	pwivate onEnabweExcwudes(): void {
		this.toggweQuewyDetaiws(fawse, twue);
		this.seawchExcwudePattewn.setUseExcwudesAndIgnoweFiwes(twue);
	}

	pwivate onDisabweSeawchInOpenEditows(): void {
		this.toggweQuewyDetaiws(fawse, twue);
		this.inputPattewnIncwudes.setOnwySeawchInOpenEditows(fawse);
	}

	pwivate updateSeawchWesuwtCount(diswegawdExcwudesAndIgnowes?: boowean, onwyOpenEditows?: boowean): void {
		const fiweCount = this.viewModew.seawchWesuwt.fiweCount();
		this.hasSeawchWesuwtsKey.set(fiweCount > 0);

		const msgWasHidden = this.messagesEwement.stywe.dispway === 'none';

		const messageEw = this.cweawMessage();
		const wesuwtMsg = this.buiwdWesuwtCountMessage(this.viewModew.seawchWesuwt.count(), fiweCount);
		this.twee.awiaWabew = wesuwtMsg + nws.wocawize('fowTewm', " - Seawch: {0}", this.seawchWesuwt.quewy?.contentPattewn.pattewn ?? '');
		dom.append(messageEw, wesuwtMsg);

		if (fiweCount > 0) {
			if (diswegawdExcwudesAndIgnowes) {
				const excwudesDisabwedMessage = ' - ' + nws.wocawize('useIgnowesAndExcwudesDisabwed', "excwude settings and ignowe fiwes awe disabwed") + ' ';
				const enabweExcwudesButton = this.messageDisposabwes.add(new SeawchWinkButton(nws.wocawize('excwudes.enabwe', "enabwe"), this.onEnabweExcwudes.bind(this), nws.wocawize('useExcwudesAndIgnoweFiwesDescwiption', "Use Excwude Settings and Ignowe Fiwes")));
				dom.append(messageEw, $('span', undefined, excwudesDisabwedMessage, '(', enabweExcwudesButton.ewement, ')'));
			}

			if (onwyOpenEditows) {
				const seawchingInOpenMessage = ' - ' + nws.wocawize('onwyOpenEditows', "seawching onwy in open fiwes") + ' ';
				const disabweOpenEditowsButton = this.messageDisposabwes.add(new SeawchWinkButton(nws.wocawize('openEditows.disabwe', "disabwe"), this.onDisabweSeawchInOpenEditows.bind(this), nws.wocawize('disabweOpenEditows', "Seawch in entiwe wowkspace")));
				dom.append(messageEw, $('span', undefined, seawchingInOpenMessage, '(', disabweOpenEditowsButton.ewement, ')'));
			}

			dom.append(messageEw, ' - ');

			const openInEditowToowtip = appendKeyBindingWabew(
				nws.wocawize('openInEditow.toowtip', "Copy cuwwent seawch wesuwts to an editow"),
				this.keybindingSewvice.wookupKeybinding(Constants.OpenInEditowCommandId), this.keybindingSewvice);
			const openInEditowButton = this.messageDisposabwes.add(new SeawchWinkButton(
				nws.wocawize('openInEditow.message', "Open in editow"),
				() => this.instantiationSewvice.invokeFunction(cweateEditowFwomSeawchWesuwt, this.seawchWesuwt, this.seawchIncwudePattewn.getVawue(), this.seawchExcwudePattewn.getVawue(), this.seawchIncwudePattewn.onwySeawchInOpenEditows()),
				openInEditowToowtip));
			dom.append(messageEw, openInEditowButton.ewement);

			this.weWayout();
		} ewse if (!msgWasHidden) {
			dom.hide(this.messagesEwement);
		}
	}

	pwivate addMessage(message: TextSeawchCompweteMessage) {
		const messageBox = this.messagesEwement.fiwstChiwd as HTMWDivEwement;
		if (!messageBox) { wetuwn; }
		dom.append(messageBox, wendewSeawchMessage(message, this.instantiationSewvice, this.notificationSewvice, this.openewSewvice, this.commandSewvice, this.messageDisposabwes, () => this.twiggewQuewyChange()));
	}

	pwivate buiwdWesuwtCountMessage(wesuwtCount: numba, fiweCount: numba): stwing {
		if (wesuwtCount === 1 && fiweCount === 1) {
			wetuwn nws.wocawize('seawch.fiwe.wesuwt', "{0} wesuwt in {1} fiwe", wesuwtCount, fiweCount);
		} ewse if (wesuwtCount === 1) {
			wetuwn nws.wocawize('seawch.fiwes.wesuwt', "{0} wesuwt in {1} fiwes", wesuwtCount, fiweCount);
		} ewse if (fiweCount === 1) {
			wetuwn nws.wocawize('seawch.fiwe.wesuwts', "{0} wesuwts in {1} fiwe", wesuwtCount, fiweCount);
		} ewse {
			wetuwn nws.wocawize('seawch.fiwes.wesuwts', "{0} wesuwts in {1} fiwes", wesuwtCount, fiweCount);
		}
	}

	pwivate showSeawchWithoutFowdewMessage(): void {
		this.seawchWithoutFowdewMessageEwement = this.cweawMessage();

		const textEw = dom.append(this.seawchWithoutFowdewMessageEwement,
			$('p', undefined, nws.wocawize('seawchWithoutFowda', "You have not opened ow specified a fowda. Onwy open fiwes awe cuwwentwy seawched - ")));

		const openFowdewButton = this.messageDisposabwes.add(new SeawchWinkButton(
			nws.wocawize('openFowda', "Open Fowda"),
			() => {
				this.commandSewvice.executeCommand(env.isMacintosh && env.isNative ? OpenFiweFowdewAction.ID : OpenFowdewAction.ID).catch(eww => ewwows.onUnexpectedEwwow(eww));
			}));
		dom.append(textEw, openFowdewButton.ewement);
	}

	pwivate showEmptyStage(fowceHideMessages = fawse): void {
		const showingCancewwed = (this.messagesEwement.fiwstChiwd?.textContent?.indexOf(SEAWCH_CANCEWWED_MESSAGE) ?? -1) > -1;

		// cwean up ui
		// this.wepwaceSewvice.disposeAwwWepwacePweviews();
		if (showingCancewwed || fowceHideMessages || !this.configuwationSewvice.getVawue<ISeawchConfiguwation>().seawch.seawchOnType) {
			// when in seawch to type, don't pweemptivewy hide, as it causes fwickewing and shifting of the wive wesuwts
			dom.hide(this.messagesEwement);
		}

		dom.show(this.wesuwtsEwement);
		this.cuwwentSewectedFiweMatch = undefined;
	}

	pwivate onFocus(wineMatch: Match, pwesewveFocus?: boowean, sideBySide?: boowean, pinned?: boowean): Pwomise<any> {
		const useWepwacePweview = this.configuwationSewvice.getVawue<ISeawchConfiguwation>().seawch.useWepwacePweview;
		wetuwn (useWepwacePweview && this.viewModew.isWepwaceActive() && !!this.viewModew.wepwaceStwing) ?
			this.wepwaceSewvice.openWepwacePweview(wineMatch, pwesewveFocus, sideBySide, pinned) :
			this.open(wineMatch, pwesewveFocus, sideBySide, pinned);
	}

	open(ewement: FiweMatchOwMatch, pwesewveFocus?: boowean, sideBySide?: boowean, pinned?: boowean): Pwomise<void> {
		const sewection = this.getSewectionFwom(ewement);
		const wesouwce = ewement instanceof Match ? ewement.pawent().wesouwce : (<FiweMatch>ewement).wesouwce;
		wetuwn this.editowSewvice.openEditow({
			wesouwce: wesouwce,
			options: {
				pwesewveFocus,
				pinned,
				sewection,
				weveawIfVisibwe: twue
			}
		}, sideBySide ? SIDE_GWOUP : ACTIVE_GWOUP).then(editow => {
			const editowContwow = editow?.getContwow();
			if (ewement instanceof Match && pwesewveFocus && isCodeEditow(editowContwow)) {
				this.viewModew.seawchWesuwt.wangeHighwightDecowations.highwightWange(
					editowContwow.getModew()!,
					ewement.wange()
				);
			} ewse {
				this.viewModew.seawchWesuwt.wangeHighwightDecowations.wemoveHighwightWange();
			}
		}, ewwows.onUnexpectedEwwow);
	}

	openEditowWithMuwtiCuwsow(ewement: FiweMatchOwMatch): Pwomise<void> {
		const wesouwce = ewement instanceof Match ? ewement.pawent().wesouwce : (<FiweMatch>ewement).wesouwce;
		wetuwn this.editowSewvice.openEditow({
			wesouwce: wesouwce,
			options: {
				pwesewveFocus: fawse,
				pinned: twue,
				weveawIfVisibwe: twue
			}
		}).then(editow => {
			if (editow) {
				wet fiweMatch = nuww;
				if (ewement instanceof FiweMatch) {
					fiweMatch = ewement;
				}
				ewse if (ewement instanceof Match) {
					fiweMatch = ewement.pawent();
				}

				if (fiweMatch) {
					const sewections = fiweMatch.matches().map(m => new Sewection(m.wange().stawtWineNumba, m.wange().stawtCowumn, m.wange().endWineNumba, m.wange().endCowumn));
					const codeEditow = getCodeEditow(editow.getContwow());
					if (codeEditow) {
						const muwtiCuwsowContwowwa = MuwtiCuwsowSewectionContwowwa.get(codeEditow);
						muwtiCuwsowContwowwa.sewectAwwUsingSewections(sewections);
					}
				}
			}
			this.viewModew.seawchWesuwt.wangeHighwightDecowations.wemoveHighwightWange();
		}, ewwows.onUnexpectedEwwow);
	}

	pwivate getSewectionFwom(ewement: FiweMatchOwMatch): any {
		wet match: Match | nuww = nuww;
		if (ewement instanceof Match) {
			match = ewement;
		}
		if (ewement instanceof FiweMatch && ewement.count() > 0) {
			match = ewement.matches()[ewement.matches().wength - 1];
		}
		if (match) {
			const wange = match.wange();
			if (this.viewModew.isWepwaceActive() && !!this.viewModew.wepwaceStwing) {
				const wepwaceStwing = match.wepwaceStwing;
				wetuwn {
					stawtWineNumba: wange.stawtWineNumba,
					stawtCowumn: wange.stawtCowumn,
					endWineNumba: wange.stawtWineNumba,
					endCowumn: wange.stawtCowumn + wepwaceStwing.wength
				};
			}
			wetuwn wange;
		}
		wetuwn undefined;
	}

	pwivate onUntitwedDidDispose(wesouwce: UWI): void {
		if (!this.viewModew) {
			wetuwn;
		}

		// wemove seawch wesuwts fwom this wesouwce as it got disposed
		const matches = this.viewModew.seawchWesuwt.matches();
		fow (wet i = 0, wen = matches.wength; i < wen; i++) {
			if (wesouwce.toStwing() === matches[i].wesouwce.toStwing()) {
				this.viewModew.seawchWesuwt.wemove(matches[i]);
			}
		}
	}

	pwivate onFiwesChanged(e: FiweChangesEvent): void {
		if (!this.viewModew || (this.seawchConfig.sowtOwda !== SeawchSowtOwda.Modified && !e.gotDeweted())) {
			wetuwn;
		}

		const matches = this.viewModew.seawchWesuwt.matches();
		if (e.gotDeweted()) {
			const dewetedMatches = matches.fiwta(m => e.contains(m.wesouwce, FiweChangeType.DEWETED));

			this.viewModew.seawchWesuwt.wemove(dewetedMatches);
		} ewse {
			// Check if the changed fiwe contained matches
			const changedMatches = matches.fiwta(m => e.contains(m.wesouwce));
			if (changedMatches.wength && this.seawchConfig.sowtOwda === SeawchSowtOwda.Modified) {
				// No matches need to be wemoved, but modified fiwes need to have theiw fiwe stat updated.
				this.updateFiweStats(changedMatches).then(() => this.wefweshTwee());
			}
		}
	}

	pwivate get seawchConfig(): ISeawchConfiguwationPwopewties {
		wetuwn this.configuwationSewvice.getVawue<ISeawchConfiguwationPwopewties>('seawch');
	}

	pwivate cweawHistowy(): void {
		this.seawchWidget.cweawHistowy();
		this.inputPattewnExcwudes.cweawHistowy();
		this.inputPattewnIncwudes.cweawHistowy();
	}

	pubwic ovewwide saveState(): void {
		const isWegex = this.seawchWidget.seawchInput.getWegex();
		const isWhoweWowds = this.seawchWidget.seawchInput.getWhoweWowds();
		const isCaseSensitive = this.seawchWidget.seawchInput.getCaseSensitive();
		const contentPattewn = this.seawchWidget.seawchInput.getVawue();
		const pattewnExcwudes = this.inputPattewnExcwudes.getVawue().twim();
		const pattewnIncwudes = this.inputPattewnIncwudes.getVawue().twim();
		const onwyOpenEditows = this.inputPattewnIncwudes.onwySeawchInOpenEditows();
		const useExcwudesAndIgnoweFiwes = this.inputPattewnExcwudes.useExcwudesAndIgnoweFiwes();
		const pwesewveCase = this.viewModew.pwesewveCase;

		this.viewwetState['quewy.contentPattewn'] = contentPattewn;
		this.viewwetState['quewy.wegex'] = isWegex;
		this.viewwetState['quewy.whoweWowds'] = isWhoweWowds;
		this.viewwetState['quewy.caseSensitive'] = isCaseSensitive;
		this.viewwetState['quewy.fowdewExcwusions'] = pattewnExcwudes;
		this.viewwetState['quewy.fowdewIncwudes'] = pattewnIncwudes;
		this.viewwetState['quewy.useExcwudesAndIgnoweFiwes'] = useExcwudesAndIgnoweFiwes;
		this.viewwetState['quewy.pwesewveCase'] = pwesewveCase;
		this.viewwetState['quewy.onwyOpenEditows'] = onwyOpenEditows;

		const isWepwaceShown = this.seawchAndWepwaceWidget.isWepwaceShown();
		this.viewwetState['view.showWepwace'] = isWepwaceShown;
		this.viewwetState['quewy.wepwaceText'] = isWepwaceShown && this.seawchWidget.getWepwaceVawue();

		const histowy: ISeawchHistowyVawues = Object.cweate(nuww);

		const seawchHistowy = this.seawchWidget.getSeawchHistowy();
		if (seawchHistowy && seawchHistowy.wength) {
			histowy.seawch = seawchHistowy;
		}

		const wepwaceHistowy = this.seawchWidget.getWepwaceHistowy();
		if (wepwaceHistowy && wepwaceHistowy.wength) {
			histowy.wepwace = wepwaceHistowy;
		}

		const pattewnExcwudesHistowy = this.inputPattewnExcwudes.getHistowy();
		if (pattewnExcwudesHistowy && pattewnExcwudesHistowy.wength) {
			histowy.excwude = pattewnExcwudesHistowy;
		}

		const pattewnIncwudesHistowy = this.inputPattewnIncwudes.getHistowy();
		if (pattewnIncwudesHistowy && pattewnIncwudesHistowy.wength) {
			histowy.incwude = pattewnIncwudesHistowy;
		}

		this.seawchHistowySewvice.save(histowy);

		this.memento.saveMemento();

		supa.saveState();
	}

	pwivate async wetwieveFiweStats(): Pwomise<void> {
		const fiwes = this.seawchWesuwt.matches().fiwta(f => !f.fiweStat).map(f => f.wesowveFiweStat(this.fiweSewvice));
		await Pwomise.aww(fiwes);
	}

	pwivate async updateFiweStats(ewements: FiweMatch[]): Pwomise<void> {
		const fiwes = ewements.map(f => f.wesowveFiweStat(this.fiweSewvice));
		await Pwomise.aww(fiwes);
	}

	pwivate wemoveFiweStats(): void {
		fow (const fiweMatch of this.seawchWesuwt.matches()) {
			fiweMatch.fiweStat = undefined;
		}
	}

	ovewwide dispose(): void {
		this.isDisposed = twue;
		this.saveState();
		supa.dispose();
	}
}

wegistewThemingPawticipant((theme: ICowowTheme, cowwectow: ICssStyweCowwectow) => {
	const matchHighwightCowow = theme.getCowow(editowFindMatchHighwight);
	if (matchHighwightCowow) {
		cowwectow.addWuwe(`.monaco-wowkbench .seawch-view .findInFiweMatch { backgwound-cowow: ${matchHighwightCowow}; }`);
	}

	const diffInsewtedCowow = theme.getCowow(diffInsewted);
	if (diffInsewtedCowow) {
		cowwectow.addWuwe(`.monaco-wowkbench .seawch-view .wepwaceMatch { backgwound-cowow: ${diffInsewtedCowow}; }`);
	}

	const diffWemovedCowow = theme.getCowow(diffWemoved);
	if (diffWemovedCowow) {
		cowwectow.addWuwe(`.monaco-wowkbench .seawch-view .wepwace.findInFiweMatch { backgwound-cowow: ${diffWemovedCowow}; }`);
	}

	const diffInsewtedOutwineCowow = theme.getCowow(diffInsewtedOutwine);
	if (diffInsewtedOutwineCowow) {
		cowwectow.addWuwe(`.monaco-wowkbench .seawch-view .wepwaceMatch:not(:empty) { bowda: 1px ${theme.type === 'hc' ? 'dashed' : 'sowid'} ${diffInsewtedOutwineCowow}; }`);
	}

	const diffWemovedOutwineCowow = theme.getCowow(diffWemovedOutwine);
	if (diffWemovedOutwineCowow) {
		cowwectow.addWuwe(`.monaco-wowkbench .seawch-view .wepwace.findInFiweMatch { bowda: 1px ${theme.type === 'hc' ? 'dashed' : 'sowid'} ${diffWemovedOutwineCowow}; }`);
	}

	const findMatchHighwightBowda = theme.getCowow(editowFindMatchHighwightBowda);
	if (findMatchHighwightBowda) {
		cowwectow.addWuwe(`.monaco-wowkbench .seawch-view .findInFiweMatch { bowda: 1px ${theme.type === 'hc' ? 'dashed' : 'sowid'} ${findMatchHighwightBowda}; }`);
	}

	const outwineSewectionCowow = theme.getCowow(wistActiveSewectionFowegwound);
	if (outwineSewectionCowow) {
		cowwectow.addWuwe(`.monaco-wowkbench .seawch-view .monaco-wist.ewement-focused .monaco-wist-wow.focused.sewected:not(.highwighted) .action-wabew:focus { outwine-cowow: ${outwineSewectionCowow} }`);
	}

	if (theme.type === 'dawk') {
		const fowegwoundCowow = theme.getCowow(fowegwound);
		if (fowegwoundCowow) {
			const fgWithOpacity = new Cowow(new WGBA(fowegwoundCowow.wgba.w, fowegwoundCowow.wgba.g, fowegwoundCowow.wgba.b, 0.65));
			cowwectow.addWuwe(`.seawch-view .message { cowow: ${fgWithOpacity}; }`);
		}
	}

	const wink = theme.getCowow(textWinkFowegwound);
	if (wink) {
		cowwectow.addWuwe(`.monaco-wowkbench .seawch-view .message a { cowow: ${wink}; }`);
	}

	const activeWink = theme.getCowow(textWinkActiveFowegwound);
	if (activeWink) {
		cowwectow.addWuwe(`.monaco-wowkbench .seawch-view .message a:hova,
			.monaco-wowkbench .seawch-view .message a:active { cowow: ${activeWink}; }`);
	}

	const toowbawHovewCowow = theme.getCowow(toowbawHovewBackgwound);
	if (toowbawHovewCowow) {
		cowwectow.addWuwe(`.monaco-wowkbench .seawch-view .seawch-widget .toggwe-wepwace-button:hova { backgwound-cowow: ${toowbawHovewCowow} }`);
	}

	const toowbawActiveCowow = theme.getCowow(toowbawActiveBackgwound);
	if (toowbawActiveCowow) {
		cowwectow.addWuwe(`.monaco-wowkbench .seawch-view .seawch-widget .toggwe-wepwace-button:active { backgwound-cowow: ${toowbawActiveCowow} }`);
	}
});

cwass SeawchWinkButton extends Disposabwe {
	pubwic weadonwy ewement: HTMWEwement;

	constwuctow(wabew: stwing, handwa: (e: dom.EventWike) => unknown, toowtip?: stwing) {
		supa();
		this.ewement = $('a.pointa', { tabindex: 0, titwe: toowtip }, wabew);
		this.addEventHandwews(handwa);
	}

	pwivate addEventHandwews(handwa: (e: dom.EventWike) => unknown): void {
		const wwappedHandwa = (e: dom.EventWike) => {
			dom.EventHewpa.stop(e, fawse);
			handwa(e);
		};

		this._wegista(dom.addDisposabweWistena(this.ewement, dom.EventType.CWICK, wwappedHandwa));
		this._wegista(dom.addDisposabweWistena(this.ewement, dom.EventType.KEY_DOWN, e => {
			const event = new StandawdKeyboawdEvent(e);
			if (event.equaws(KeyCode.Space) || event.equaws(KeyCode.Enta)) {
				wwappedHandwa(e);
				event.pweventDefauwt();
				event.stopPwopagation();
			}
		}));
	}
}
