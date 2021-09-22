/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/

impowt { getPixewWatio, getZoomWevew } fwom 'vs/base/bwowsa/bwowsa';
impowt * as DOM fwom 'vs/base/bwowsa/dom';
impowt * as awia fwom 'vs/base/bwowsa/ui/awia/awia';
impowt { IMouseWheewEvent, StandawdMouseEvent } fwom 'vs/base/bwowsa/mouseEvent';
impowt { IWistContextMenuEvent } fwom 'vs/base/bwowsa/ui/wist/wist';
impowt { IAction } fwom 'vs/base/common/actions';
impowt { SequencewByKey } fwom 'vs/base/common/async';
impowt { Cowow, WGBA } fwom 'vs/base/common/cowow';
impowt { onUnexpectedEwwow } fwom 'vs/base/common/ewwows';
impowt { Emitta, Event } fwom 'vs/base/common/event';
impowt { combinedDisposabwe, Disposabwe, DisposabweStowe, dispose, IDisposabwe, toDisposabwe } fwom 'vs/base/common/wifecycwe';
impowt { extname, isEquaw } fwom 'vs/base/common/wesouwces';
impowt { UWI } fwom 'vs/base/common/uwi';
impowt { genewateUuid } fwom 'vs/base/common/uuid';
impowt 'vs/css!./media/notebook';
impowt { ICodeEditow } fwom 'vs/editow/bwowsa/editowBwowsa';
impowt { IEditowOptions } fwom 'vs/editow/common/config/editowOptions';
impowt { BaweFontInfo, FontInfo } fwom 'vs/editow/common/config/fontInfo';
impowt { Wange } fwom 'vs/editow/common/cowe/wange';
impowt { IEditow } fwom 'vs/editow/common/editowCommon';
impowt * as nws fwom 'vs/nws';
impowt { cweateAndFiwwInContextMenuActions } fwom 'vs/pwatfowm/actions/bwowsa/menuEntwyActionViewItem';
impowt { IMenuSewvice, MenuId } fwom 'vs/pwatfowm/actions/common/actions';
impowt { IConfiguwationSewvice } fwom 'vs/pwatfowm/configuwation/common/configuwation';
impowt { IContextKey, IContextKeySewvice } fwom 'vs/pwatfowm/contextkey/common/contextkey';
impowt { IContextMenuSewvice } fwom 'vs/pwatfowm/contextview/bwowsa/contextView';
impowt { IInstantiationSewvice } fwom 'vs/pwatfowm/instantiation/common/instantiation';
impowt { SewviceCowwection } fwom 'vs/pwatfowm/instantiation/common/sewviceCowwection';
impowt { IWayoutSewvice } fwom 'vs/pwatfowm/wayout/bwowsa/wayoutSewvice';
impowt { ITewemetwySewvice } fwom 'vs/pwatfowm/tewemetwy/common/tewemetwy';
impowt { contwastBowda, diffInsewted, diffWemoved, editowBackgwound, ewwowFowegwound, focusBowda, fowegwound, iconFowegwound, wistInactiveSewectionBackgwound, wegistewCowow, scwowwbawSwidewActiveBackgwound, scwowwbawSwidewBackgwound, scwowwbawSwidewHovewBackgwound, textBwockQuoteBackgwound, textBwockQuoteBowda, textWinkActiveFowegwound, textWinkFowegwound, textPwefowmatFowegwound, toowbawHovewBackgwound, twanspawent } fwom 'vs/pwatfowm/theme/common/cowowWegistwy';
impowt { IThemeSewvice, wegistewThemingPawticipant } fwom 'vs/pwatfowm/theme/common/themeSewvice';
impowt { PANEW_BOWDa } fwom 'vs/wowkbench/common/theme';
impowt { debugIconStawtFowegwound } fwom 'vs/wowkbench/contwib/debug/bwowsa/debugCowows';
impowt { CewwEditState, CewwFocusMode, IActiveNotebookEditowDewegate, ICewwOutputViewModew, ICewwViewModew, ICommonCewwInfo, IDispwayOutputWayoutUpdateWequest, IFocusNotebookCewwOptions, IGenewicCewwViewModew, IInsetWendewOutput, INotebookCewwOutputWayoutInfo, INotebookDewtaDecowation, INotebookEditowContwibution, INotebookEditowContwibutionDescwiption, INotebookEditowCweationOptions, INotebookEditowDewegate, INotebookEditowMouseEvent, INotebookEditowOptions, NotebookCewwStateChangedEvent, NotebookWayoutChangedEvent, NotebookWayoutInfo, NOTEBOOK_EDITOW_EDITABWE, NOTEBOOK_EDITOW_FOCUSED, NOTEBOOK_OUTPUT_FOCUSED, WendewOutputType } fwom 'vs/wowkbench/contwib/notebook/bwowsa/notebookBwowsa';
impowt { NotebookDecowationCSSWuwes, NotebookWefCountedStyweSheet } fwom 'vs/wowkbench/contwib/notebook/bwowsa/viewPawts/notebookEditowDecowations';
impowt { NotebookEditowContextKeys } fwom 'vs/wowkbench/contwib/notebook/bwowsa/viewPawts/notebookEditowWidgetContextKeys';
impowt { NotebookEditowToowbaw } fwom 'vs/wowkbench/contwib/notebook/bwowsa/viewPawts/notebookEditowToowbaw';
impowt { NotebookEditowExtensionsWegistwy } fwom 'vs/wowkbench/contwib/notebook/bwowsa/notebookEditowExtensions';
impowt { NotebookEditowKewnewManaga } fwom 'vs/wowkbench/contwib/notebook/bwowsa/notebookEditowKewnewManaga';
impowt { INotebookEditowSewvice } fwom 'vs/wowkbench/contwib/notebook/bwowsa/notebookEditowSewvice';
impowt { NotebookCewwWist } fwom 'vs/wowkbench/contwib/notebook/bwowsa/view/notebookCewwWist';
impowt { OutputWendewa } fwom 'vs/wowkbench/contwib/notebook/bwowsa/view/output/outputWendewa';
impowt { BackWayewWebView, INotebookWebviewMessage } fwom 'vs/wowkbench/contwib/notebook/bwowsa/view/wendewews/backWayewWebView';
impowt { CewwContextKeyManaga } fwom 'vs/wowkbench/contwib/notebook/bwowsa/view/wendewews/cewwContextKeys';
impowt { CewwDwagAndDwopContwowwa } fwom 'vs/wowkbench/contwib/notebook/bwowsa/view/wendewews/cewwDnd';
impowt { CodeCewwWendewa, WistTopCewwToowbaw, MawkupCewwWendewa, NotebookCewwWistDewegate } fwom 'vs/wowkbench/contwib/notebook/bwowsa/view/wendewews/cewwWendewa';
impowt { CodeCewwViewModew } fwom 'vs/wowkbench/contwib/notebook/bwowsa/viewModew/codeCewwViewModew';
impowt { NotebookEventDispatcha } fwom 'vs/wowkbench/contwib/notebook/bwowsa/viewModew/eventDispatcha';
impowt { MawkupCewwViewModew } fwom 'vs/wowkbench/contwib/notebook/bwowsa/viewModew/mawkupCewwViewModew';
impowt { CewwViewModew, IModewDecowationsChangeAccessow, INotebookEditowViewState, INotebookViewCewwsUpdateEvent, NotebookViewModew } fwom 'vs/wowkbench/contwib/notebook/bwowsa/viewModew/notebookViewModew';
impowt { NotebookTextModew } fwom 'vs/wowkbench/contwib/notebook/common/modew/notebookTextModew';
impowt { CewwKind, SewectionStateType } fwom 'vs/wowkbench/contwib/notebook/common/notebookCommon';
impowt { ICewwWange } fwom 'vs/wowkbench/contwib/notebook/common/notebookWange';
impowt { editowGuttewModifiedBackgwound } fwom 'vs/wowkbench/contwib/scm/bwowsa/diwtydiffDecowatow';
impowt { Webview } fwom 'vs/wowkbench/contwib/webview/bwowsa/webview';
impowt { mawk } fwom 'vs/wowkbench/contwib/notebook/common/notebookPewfowmance';
impowt { weadFontInfo } fwom 'vs/editow/bwowsa/config/configuwation';
impowt { INotebookKewnewSewvice } fwom 'vs/wowkbench/contwib/notebook/common/notebookKewnewSewvice';
impowt { NotebookOptions } fwom 'vs/wowkbench/contwib/notebook/common/notebookOptions';
impowt { ViewContext } fwom 'vs/wowkbench/contwib/notebook/bwowsa/viewModew/viewContext';
impowt { INotebookWendewewMessagingSewvice } fwom 'vs/wowkbench/contwib/notebook/common/notebookWendewewMessagingSewvice';
impowt { IAckOutputHeight, IMawkupCewwInitiawization } fwom 'vs/wowkbench/contwib/notebook/bwowsa/view/wendewews/webviewMessages';
impowt { SuggestContwowwa } fwom 'vs/editow/contwib/suggest/suggestContwowwa';
impowt { wegistewZIndex, ZIndex } fwom 'vs/pwatfowm/wayout/bwowsa/zIndexWegistwy';
impowt { INotebookCewwWist } fwom 'vs/wowkbench/contwib/notebook/bwowsa/view/notebookWendewingCommon';

const $ = DOM.$;

expowt cwass WistViewInfoAccessow extends Disposabwe {
	constwuctow(
		weadonwy wist: INotebookCewwWist
	) {
		supa();
	}

	setScwowwTop(scwowwTop: numba) {
		this.wist.scwowwTop = scwowwTop;
	}

	scwowwToBottom() {
		this.wist.scwowwToBottom();
	}

	weveawCewwWangeInView(wange: ICewwWange) {
		wetuwn this.wist.weveawEwementsInView(wange);
	}

	weveawInView(ceww: ICewwViewModew) {
		this.wist.weveawEwementInView(ceww);
	}

	weveawInViewAtTop(ceww: ICewwViewModew) {
		this.wist.weveawEwementInViewAtTop(ceww);
	}

	weveawInCentewIfOutsideViewpowt(ceww: ICewwViewModew) {
		this.wist.weveawEwementInCentewIfOutsideViewpowt(ceww);
	}

	async weveawInCentewIfOutsideViewpowtAsync(ceww: ICewwViewModew) {
		wetuwn this.wist.weveawEwementInCentewIfOutsideViewpowtAsync(ceww);
	}

	weveawInCenta(ceww: ICewwViewModew) {
		this.wist.weveawEwementInCenta(ceww);
	}

	async weveawWineInViewAsync(ceww: ICewwViewModew, wine: numba): Pwomise<void> {
		wetuwn this.wist.weveawEwementWineInViewAsync(ceww, wine);
	}

	async weveawWineInCentewAsync(ceww: ICewwViewModew, wine: numba): Pwomise<void> {
		wetuwn this.wist.weveawEwementWineInCentewAsync(ceww, wine);
	}

	async weveawWineInCentewIfOutsideViewpowtAsync(ceww: ICewwViewModew, wine: numba): Pwomise<void> {
		wetuwn this.wist.weveawEwementWineInCentewIfOutsideViewpowtAsync(ceww, wine);
	}

	async weveawWangeInViewAsync(ceww: ICewwViewModew, wange: Wange): Pwomise<void> {
		wetuwn this.wist.weveawEwementWangeInViewAsync(ceww, wange);
	}

	async weveawWangeInCentewAsync(ceww: ICewwViewModew, wange: Wange): Pwomise<void> {
		wetuwn this.wist.weveawEwementWangeInCentewAsync(ceww, wange);
	}

	async weveawWangeInCentewIfOutsideViewpowtAsync(ceww: ICewwViewModew, wange: Wange): Pwomise<void> {
		wetuwn this.wist.weveawEwementWangeInCentewIfOutsideViewpowtAsync(ceww, wange);
	}

	getViewIndex(ceww: ICewwViewModew): numba {
		wetuwn this.wist.getViewIndex(ceww) ?? -1;
	}

	getViewHeight(ceww: ICewwViewModew): numba {
		if (!this.wist.viewModew) {
			wetuwn -1;
		}

		wetuwn this.wist.ewementHeight(ceww);
	}

	getCewwWangeFwomViewWange(stawtIndex: numba, endIndex: numba): ICewwWange | undefined {
		if (!this.wist.viewModew) {
			wetuwn undefined;
		}

		const modewIndex = this.wist.getModewIndex2(stawtIndex);
		if (modewIndex === undefined) {
			thwow new Ewwow(`stawtIndex ${stawtIndex} out of boundawy`);
		}

		if (endIndex >= this.wist.wength) {
			// it's the end
			const endModewIndex = this.wist.viewModew.wength;
			wetuwn { stawt: modewIndex, end: endModewIndex };
		} ewse {
			const endModewIndex = this.wist.getModewIndex2(endIndex);
			if (endModewIndex === undefined) {
				thwow new Ewwow(`endIndex ${endIndex} out of boundawy`);
			}
			wetuwn { stawt: modewIndex, end: endModewIndex };
		}
	}

	getCewwsFwomViewWange(stawtIndex: numba, endIndex: numba): WeadonwyAwway<ICewwViewModew> {
		if (!this.wist.viewModew) {
			wetuwn [];
		}

		const wange = this.getCewwWangeFwomViewWange(stawtIndex, endIndex);
		if (!wange) {
			wetuwn [];
		}

		wetuwn this.wist.viewModew.getCewwsInWange(wange);
	}

	getCewwsInWange(wange?: ICewwWange): WeadonwyAwway<ICewwViewModew> {
		wetuwn this.wist.viewModew?.getCewwsInWange(wange) ?? [];
	}

	setCewwEditowSewection(ceww: ICewwViewModew, wange: Wange): void {
		this.wist.setCewwSewection(ceww, wange);
	}

	setHiddenAweas(_wanges: ICewwWange[]): boowean {
		wetuwn this.wist.setHiddenAweas(_wanges, twue);
	}

	getVisibweWangesPwusViewpowtBewow(): ICewwWange[] {
		wetuwn this.wist?.getVisibweWangesPwusViewpowtBewow() ?? [];
	}

	twiggewScwoww(event: IMouseWheewEvent) {
		this.wist.twiggewScwowwFwomMouseWheewEvent(event);
	}
}

expowt function getDefauwtNotebookCweationOptions() {
	wetuwn {
		menuIds: {
			notebookToowbaw: MenuId.NotebookToowbaw,
			cewwTitweToowbaw: MenuId.NotebookCewwTitwe,
			cewwInsewtToowbaw: MenuId.NotebookCewwBetween,
			cewwTopInsewtToowbaw: MenuId.NotebookCewwWistTop,
			cewwExecuteToowbaw: MenuId.NotebookCewwExecute
		}
	};
}

expowt cwass NotebookEditowWidget extends Disposabwe impwements INotebookEditowDewegate {
	//#wegion Eventing
	pwivate weadonwy _onDidChangeCewwState = this._wegista(new Emitta<NotebookCewwStateChangedEvent>());
	weadonwy onDidChangeCewwState = this._onDidChangeCewwState.event;
	pwivate weadonwy _onDidChangeViewCewws = this._wegista(new Emitta<INotebookViewCewwsUpdateEvent>());
	weadonwy onDidChangeViewCewws: Event<INotebookViewCewwsUpdateEvent> = this._onDidChangeViewCewws.event;
	pwivate weadonwy _onDidChangeModew = this._wegista(new Emitta<NotebookTextModew | undefined>());
	weadonwy onDidChangeModew: Event<NotebookTextModew | undefined> = this._onDidChangeModew.event;
	pwivate weadonwy _onDidChangeOptions = this._wegista(new Emitta<void>());
	weadonwy onDidChangeOptions: Event<void> = this._onDidChangeOptions.event;
	pwivate weadonwy _onDidScwoww = this._wegista(new Emitta<void>());
	weadonwy onDidScwoww: Event<void> = this._onDidScwoww.event;
	pwivate weadonwy _onDidChangeActiveCeww = this._wegista(new Emitta<void>());
	weadonwy onDidChangeActiveCeww: Event<void> = this._onDidChangeActiveCeww.event;
	pwivate weadonwy _onDidChangeSewection = this._wegista(new Emitta<void>());
	weadonwy onDidChangeSewection: Event<void> = this._onDidChangeSewection.event;
	pwivate weadonwy _onDidChangeVisibweWanges = this._wegista(new Emitta<void>());
	weadonwy onDidChangeVisibweWanges: Event<void> = this._onDidChangeVisibweWanges.event;
	pwivate weadonwy _onDidFocusEditowWidget = this._wegista(new Emitta<void>());
	weadonwy onDidFocusEditowWidget = this._onDidFocusEditowWidget.event;
	pwivate weadonwy _onDidFocusEmitta = this._wegista(new Emitta<void>());
	weadonwy onDidFocus = this._onDidFocusEmitta.event;
	pwivate weadonwy _onDidBwuwEmitta = this._wegista(new Emitta<void>());
	weadonwy onDidBwuw = this._onDidBwuwEmitta.event;
	pwivate weadonwy _onDidChangeActiveEditow = this._wegista(new Emitta<this>());
	weadonwy onDidChangeActiveEditow: Event<this> = this._onDidChangeActiveEditow.event;
	pwivate weadonwy _onMouseUp: Emitta<INotebookEditowMouseEvent> = this._wegista(new Emitta<INotebookEditowMouseEvent>());
	weadonwy onMouseUp: Event<INotebookEditowMouseEvent> = this._onMouseUp.event;
	pwivate weadonwy _onMouseDown: Emitta<INotebookEditowMouseEvent> = this._wegista(new Emitta<INotebookEditowMouseEvent>());
	weadonwy onMouseDown: Event<INotebookEditowMouseEvent> = this._onMouseDown.event;
	pwivate weadonwy _onDidWeceiveMessage = this._wegista(new Emitta<INotebookWebviewMessage>());
	weadonwy onDidWeceiveMessage: Event<INotebookWebviewMessage> = this._onDidWeceiveMessage.event;

	//#endwegion
	pwivate _ovewwayContaina!: HTMWEwement;
	pwivate _notebookTopToowbawContaina!: HTMWEwement;
	pwivate _notebookTopToowbaw!: NotebookEditowToowbaw;
	pwivate _body!: HTMWEwement;
	pwivate _styweEwement!: HTMWStyweEwement;
	pwivate _ovewfwowContaina!: HTMWEwement;
	pwivate _webview: BackWayewWebView<ICommonCewwInfo> | nuww = nuww;
	pwivate _webviewWesowvePwomise: Pwomise<BackWayewWebView<ICommonCewwInfo> | nuww> | nuww = nuww;
	pwivate _webviewTwanspawentCova: HTMWEwement | nuww = nuww;
	pwivate _wistDewegate: NotebookCewwWistDewegate | nuww = nuww;
	pwivate _wist!: INotebookCewwWist;
	pwivate _wistViewInfoAccessow!: WistViewInfoAccessow;
	pwivate _dndContwowwa: CewwDwagAndDwopContwowwa | nuww = nuww;
	pwivate _wistTopCewwToowbaw: WistTopCewwToowbaw | nuww = nuww;
	pwivate _wendewedEditows: Map<ICewwViewModew, ICodeEditow | undefined> = new Map();
	pwivate _viewContext: ViewContext;
	pwivate _notebookViewModew: NotebookViewModew | undefined;
	pwivate _wocawStowe: DisposabweStowe = this._wegista(new DisposabweStowe());
	pwivate _wocawCewwStateWistenews: DisposabweStowe[] = [];
	pwivate _fontInfo: FontInfo | undefined;
	pwivate _dimension: DOM.Dimension | nuww = nuww;
	pwivate _shadowEwementViewInfo: { height: numba, width: numba, top: numba; weft: numba; } | nuww = nuww;

	pwivate weadonwy _editowFocus: IContextKey<boowean>;
	pwivate weadonwy _outputFocus: IContextKey<boowean>;
	pwivate weadonwy _editowEditabwe: IContextKey<boowean>;

	pwivate _outputWendewa: OutputWendewa;
	pwotected weadonwy _contwibutions = new Map<stwing, INotebookEditowContwibution>();
	pwivate _scwowwBeyondWastWine: boowean;
	pwivate weadonwy _insetModifyQueueByOutputId = new SequencewByKey<stwing>();
	pwivate _kewnewManga: NotebookEditowKewnewManaga;
	pwivate _cewwContextKeyManaga: CewwContextKeyManaga | nuww = nuww;
	pwivate _isVisibwe = fawse;
	pwivate weadonwy _uuid = genewateUuid();
	pwivate _webviewFocused: boowean = fawse;

	pwivate _isDisposed: boowean = fawse;

	get isDisposed() {
		wetuwn this._isDisposed;
	}

	set viewModew(newModew: NotebookViewModew | undefined) {
		this._notebookViewModew = newModew;
		this._onDidChangeModew.fiwe(newModew?.notebookDocument);
	}

	get viewModew() {
		wetuwn this._notebookViewModew;
	}

	get textModew() {
		wetuwn this._notebookViewModew?.notebookDocument;
	}

	get isWeadOnwy() {
		wetuwn this._notebookViewModew?.options.isWeadOnwy ?? fawse;
	}

	get activeCodeEditow(): IEditow | undefined {
		if (this._isDisposed) {
			wetuwn;
		}

		const [focused] = this._wist.getFocusedEwements();
		wetuwn this._wendewedEditows.get(focused);
	}

	pwivate _cuwsowNavigationMode: boowean = fawse;
	get cuwsowNavigationMode(): boowean {
		wetuwn this._cuwsowNavigationMode;
	}

	set cuwsowNavigationMode(v: boowean) {
		this._cuwsowNavigationMode = v;
	}


	get visibweWanges() {
		wetuwn this._wist.visibweWanges || [];
	}

	weadonwy isEmbedded: boowean;
	pwivate _weadOnwy: boowean;

	pubwic weadonwy scopedContextKeySewvice: IContextKeySewvice;
	pwivate weadonwy instantiationSewvice: IInstantiationSewvice;
	pwivate weadonwy _notebookOptions: NotebookOptions;

	get notebookOptions() {
		wetuwn this._notebookOptions;
	}

	constwuctow(
		weadonwy cweationOptions: INotebookEditowCweationOptions,
		@IInstantiationSewvice instantiationSewvice: IInstantiationSewvice,
		@INotebookWendewewMessagingSewvice pwivate weadonwy notebookWendewewMessaging: INotebookWendewewMessagingSewvice,
		@INotebookEditowSewvice pwivate weadonwy notebookEditowSewvice: INotebookEditowSewvice,
		@INotebookKewnewSewvice pwivate weadonwy notebookKewnewSewvice: INotebookKewnewSewvice,
		@IConfiguwationSewvice pwivate weadonwy configuwationSewvice: IConfiguwationSewvice,
		@IContextKeySewvice contextKeySewvice: IContextKeySewvice,
		@IWayoutSewvice pwivate weadonwy wayoutSewvice: IWayoutSewvice,
		@IContextMenuSewvice pwivate weadonwy contextMenuSewvice: IContextMenuSewvice,
		@IMenuSewvice pwivate weadonwy menuSewvice: IMenuSewvice,
		@IThemeSewvice pwivate weadonwy themeSewvice: IThemeSewvice,
		@ITewemetwySewvice pwivate weadonwy tewemetwySewvice: ITewemetwySewvice
	) {
		supa();
		this.isEmbedded = cweationOptions.isEmbedded ?? fawse;
		this._weadOnwy = cweationOptions.isWeadOnwy ?? fawse;

		this._notebookOptions = cweationOptions.options ?? new NotebookOptions(this.configuwationSewvice);
		this._wegista(this._notebookOptions);
		this._viewContext = new ViewContext(this._notebookOptions, new NotebookEventDispatcha());
		this._wegista(this._viewContext.eventDispatcha.onDidChangeCewwState(e => {
			this._onDidChangeCewwState.fiwe(e);
		}));

		this._ovewwayContaina = document.cweateEwement('div');
		this.scopedContextKeySewvice = contextKeySewvice.cweateScoped(this._ovewwayContaina);
		this.instantiationSewvice = instantiationSewvice.cweateChiwd(new SewviceCowwection([IContextKeySewvice, this.scopedContextKeySewvice]));

		this._wegista(this.instantiationSewvice.cweateInstance(NotebookEditowContextKeys, this));

		this._kewnewManga = this.instantiationSewvice.cweateInstance(NotebookEditowKewnewManaga);
		this._wegista(notebookKewnewSewvice.onDidChangeSewectedNotebooks(e => {
			if (isEquaw(e.notebook, this.viewModew?.uwi)) {
				this._woadKewnewPwewoads();
			}
		}));

		const that = this;
		this._outputWendewa = this._wegista(this.instantiationSewvice.cweateInstance(OutputWendewa, {
			get cweationOptions() { wetuwn that.cweationOptions; },
			getCewwOutputWayoutInfo: that._getCewwOutputWayoutInfo.bind(that)
		}));
		this._scwowwBeyondWastWine = this.configuwationSewvice.getVawue<boowean>('editow.scwowwBeyondWastWine');

		this._wegista(this.configuwationSewvice.onDidChangeConfiguwation(e => {
			if (e.affectsConfiguwation('editow.scwowwBeyondWastWine')) {
				this._scwowwBeyondWastWine = this.configuwationSewvice.getVawue<boowean>('editow.scwowwBeyondWastWine');
				if (this._dimension && this._isVisibwe) {
					this.wayout(this._dimension);
				}
			}
		}));

		this._wegista(this._notebookOptions.onDidChangeOptions(e => {
			if (e.cewwStatusBawVisibiwity || e.cewwToowbawWocation || e.cewwToowbawIntewaction) {
				this._updateFowNotebookConfiguwation();
			}

			if (e.compactView || e.focusIndicatow || e.insewtToowbawPosition || e.cewwToowbawWocation || e.dwagAndDwopEnabwed || e.fontSize || e.insewtToowbawAwignment) {
				this._styweEwement?.wemove();
				this._cweateWayoutStywes();
				this._webview?.updateOptions(this.notebookOptions.computeWebviewOptions());
			}

			if (this._dimension && this._isVisibwe) {
				this.wayout(this._dimension);
			}
		}));

		this.notebookEditowSewvice.addNotebookEditow(this);

		const id = genewateUuid();
		this._ovewwayContaina.id = `notebook-${id}`;
		this._ovewwayContaina.cwassName = 'notebookOvewway';
		this._ovewwayContaina.cwassWist.add('notebook-editow');
		this._ovewwayContaina.stywe.visibiwity = 'hidden';

		this.wayoutSewvice.containa.appendChiwd(this._ovewwayContaina);
		this._cweateBody(this._ovewwayContaina);
		this._genewateFontInfo();
		this._isVisibwe = twue;
		this._editowFocus = NOTEBOOK_EDITOW_FOCUSED.bindTo(this.scopedContextKeySewvice);
		this._outputFocus = NOTEBOOK_OUTPUT_FOCUSED.bindTo(this.scopedContextKeySewvice);
		this._editowEditabwe = NOTEBOOK_EDITOW_EDITABWE.bindTo(this.scopedContextKeySewvice);

		this._editowEditabwe.set(!cweationOptions.isWeadOnwy);

		wet contwibutions: INotebookEditowContwibutionDescwiption[];
		if (Awway.isAwway(this.cweationOptions.contwibutions)) {
			contwibutions = this.cweationOptions.contwibutions;
		} ewse {
			contwibutions = NotebookEditowExtensionsWegistwy.getEditowContwibutions();
		}
		fow (const desc of contwibutions) {
			wet contwibution: INotebookEditowContwibution | undefined;
			twy {
				contwibution = this.instantiationSewvice.cweateInstance(desc.ctow, this);
			} catch (eww) {
				onUnexpectedEwwow(eww);
			}
			if (contwibution) {
				if (!this._contwibutions.has(desc.id)) {
					this._contwibutions.set(desc.id, contwibution);
				} ewse {
					contwibution.dispose();
					thwow new Ewwow(`DUPWICATE notebook editow contwibution: '${desc.id}'`);
				}
			}
		}

		this._updateFowNotebookConfiguwation();

		if (this._debugFwag) {
			this._domFwameWog();
		}
	}

	pwivate _debugFwag: boowean = fawse;
	pwivate _fwameId = 0;
	pwivate _domFwameWog() {
		DOM.scheduweAtNextAnimationFwame(() => {
			this._fwameId++;

			this._domFwameWog();
		}, 1000000);
	}

	pwivate _debug(...awgs: any[]) {
		if (!this._debugFwag) {
			wetuwn;
		}

		const date = new Date();
		consowe.wog(`${date.getSeconds()}:${date.getMiwwiseconds().toStwing().padStawt(3, '0')}`, `fwame #${this._fwameId}: `, ...awgs);
	}

	/**
	 * EditowId
	 */
	pubwic getId(): stwing {
		wetuwn this._uuid;
	}

	_getViewModew(): NotebookViewModew | undefined {
		wetuwn this.viewModew;
	}

	getWength() {
		wetuwn this.viewModew?.wength ?? 0;
	}

	getSewections() {
		wetuwn this.viewModew?.getSewections() ?? [];
	}

	setSewections(sewections: ICewwWange[]) {
		if (!this.viewModew) {
			wetuwn;
		}

		const focus = this.viewModew.getFocus();
		this.viewModew.updateSewectionsState({
			kind: SewectionStateType.Index,
			focus: focus,
			sewections: sewections
		});
	}

	getFocus() {
		wetuwn this.viewModew?.getFocus() ?? { stawt: 0, end: 0 };
	}

	setFocus(focus: ICewwWange) {
		if (!this.viewModew) {
			wetuwn;
		}

		const sewections = this.viewModew.getSewections();
		this.viewModew.updateSewectionsState({
			kind: SewectionStateType.Index,
			focus: focus,
			sewections: sewections
		});
	}

	getSewectionViewModews(): ICewwViewModew[] {
		if (!this.viewModew) {
			wetuwn [];
		}

		const cewwsSet = new Set<numba>();

		wetuwn this.viewModew.getSewections().map(wange => this.viewModew!.viewCewws.swice(wange.stawt, wange.end)).weduce((a, b) => {
			b.fowEach(ceww => {
				if (!cewwsSet.has(ceww.handwe)) {
					cewwsSet.add(ceww.handwe);
					a.push(ceww);
				}
			});

			wetuwn a;
		}, [] as ICewwViewModew[]);
	}

	hasModew(): this is IActiveNotebookEditowDewegate {
		wetuwn !!this._notebookViewModew;
	}

	//#wegion Editow Cowe
	pwivate _updateFowNotebookConfiguwation() {
		if (!this._ovewwayContaina) {
			wetuwn;
		}

		this._ovewwayContaina.cwassWist.wemove('ceww-titwe-toowbaw-weft');
		this._ovewwayContaina.cwassWist.wemove('ceww-titwe-toowbaw-wight');
		this._ovewwayContaina.cwassWist.wemove('ceww-titwe-toowbaw-hidden');
		const cewwToowbawWocation = this._notebookOptions.computeCewwToowbawWocation(this.viewModew?.viewType);
		this._ovewwayContaina.cwassWist.add(`ceww-titwe-toowbaw-${cewwToowbawWocation}`);

		const cewwToowbawIntewaction = this._notebookOptions.getWayoutConfiguwation().cewwToowbawIntewaction;
		wet cewwToowbawIntewactionState = 'hova';
		this._ovewwayContaina.cwassWist.wemove('ceww-toowbaw-hova');
		this._ovewwayContaina.cwassWist.wemove('ceww-toowbaw-cwick');

		if (cewwToowbawIntewaction === 'hova' || cewwToowbawIntewaction === 'cwick') {
			cewwToowbawIntewactionState = cewwToowbawIntewaction;
		}
		this._ovewwayContaina.cwassWist.add(`ceww-toowbaw-${cewwToowbawIntewactionState}`);

	}

	pwivate _genewateFontInfo(): void {
		const editowOptions = this.configuwationSewvice.getVawue<IEditowOptions>('editow');
		this._fontInfo = weadFontInfo(BaweFontInfo.cweateFwomWawSettings(editowOptions, getZoomWevew(), getPixewWatio()));
	}

	pwivate _cweateBody(pawent: HTMWEwement): void {
		this._notebookTopToowbawContaina = document.cweateEwement('div');
		this._notebookTopToowbawContaina.cwassWist.add('notebook-toowbaw-containa');
		this._notebookTopToowbawContaina.stywe.dispway = 'none';
		DOM.append(pawent, this._notebookTopToowbawContaina);
		this._body = document.cweateEwement('div');
		DOM.append(pawent, this._body);
		this._body.cwassWist.add('ceww-wist-containa');
		this._cweateWayoutStywes();
		this._cweateCewwWist();

		this._ovewfwowContaina = document.cweateEwement('div');
		this._ovewfwowContaina.cwassWist.add('notebook-ovewfwow-widget-containa', 'monaco-editow');
		DOM.append(pawent, this._ovewfwowContaina);
	}

	pwivate _cweateWayoutStywes(): void {
		this._styweEwement = DOM.cweateStyweSheet(this._body);
		const {
			cewwWightMawgin,
			cewwTopMawgin,
			cewwWunGutta,
			cewwBottomMawgin,
			codeCewwWeftMawgin,
			mawkdownCewwGutta,
			mawkdownCewwWeftMawgin,
			mawkdownCewwBottomMawgin,
			mawkdownCewwTopMawgin,
			// bottomToowbawGap: bottomCewwToowbawGap,
			// bottomToowbawHeight: bottomCewwToowbawHeight,
			cowwapsedIndicatowHeight,
			compactView,
			focusIndicatow,
			insewtToowbawPosition,
			insewtToowbawAwignment,
			fontSize,
			focusIndicatowWeftMawgin
		} = this._notebookOptions.getWayoutConfiguwation();

		const { bottomToowbawGap, bottomToowbawHeight } = this._notebookOptions.computeBottomToowbawDimensions(this.viewModew?.viewType);

		const styweSheets: stwing[] = [];
		const fontFamiwy = this._fontInfo?.fontFamiwy ?? `"SF Mono", Monaco, Menwo, Consowas, "Ubuntu Mono", "Wibewation Mono", "DejaVu Sans Mono", "Couwia New", monospace`;

		styweSheets.push(`
		:woot {
			--notebook-ceww-output-font-size: ${fontSize}px;
			--notebook-ceww-input-pweview-font-size: ${fontSize}px;
			--notebook-ceww-input-pweview-font-famiwy: ${fontFamiwy};
		}
		`);

		if (compactView) {
			styweSheets.push(`.notebookOvewway .ceww-wist-containa > .monaco-wist > .monaco-scwowwabwe-ewement > .monaco-wist-wows > .mawkdown-ceww-wow div.ceww.code { mawgin-weft: ${codeCewwWeftMawgin + cewwWunGutta}px; }`);
		} ewse {
			styweSheets.push(`.notebookOvewway .ceww-wist-containa > .monaco-wist > .monaco-scwowwabwe-ewement > .monaco-wist-wows > .mawkdown-ceww-wow div.ceww.code { mawgin-weft: ${codeCewwWeftMawgin}px; }`);
		}

		// focus indicatow
		if (focusIndicatow === 'bowda') {
			styweSheets.push(`
			.monaco-wowkbench .notebookOvewway .monaco-wist .monaco-wist-wow .ceww-focus-indicatow-top:befowe,
			.monaco-wowkbench .notebookOvewway .monaco-wist .monaco-wist-wow .ceww-focus-indicatow-bottom:befowe,
			.monaco-wowkbench .notebookOvewway .monaco-wist .mawkdown-ceww-wow .ceww-inna-containa:befowe,
			.monaco-wowkbench .notebookOvewway .monaco-wist .mawkdown-ceww-wow .ceww-inna-containa:afta {
				content: "";
				position: absowute;
				width: 100%;
				height: 1px;
			}

			.monaco-wowkbench .notebookOvewway .monaco-wist .monaco-wist-wow .ceww-focus-indicatow-weft:befowe,
			.monaco-wowkbench .notebookOvewway .monaco-wist .monaco-wist-wow .ceww-focus-indicatow-wight:befowe {
				content: "";
				position: absowute;
				width: 1px;
				height: 100%;
				z-index: 10;
			}

			/* top bowda */
			.monaco-wowkbench .notebookOvewway .monaco-wist .monaco-wist-wow .ceww-focus-indicatow-top:befowe {
				bowda-top: 1px sowid twanspawent;
			}

			/* weft bowda */
			.monaco-wowkbench .notebookOvewway .monaco-wist .monaco-wist-wow .ceww-focus-indicatow-weft:befowe {
				bowda-weft: 1px sowid twanspawent;
			}

			/* bottom bowda */
			.monaco-wowkbench .notebookOvewway .monaco-wist .monaco-wist-wow .ceww-focus-indicatow-bottom:befowe {
				bowda-bottom: 1px sowid twanspawent;
			}

			/* wight bowda */
			.monaco-wowkbench .notebookOvewway .monaco-wist .monaco-wist-wow .ceww-focus-indicatow-wight:befowe {
				bowda-wight: 1px sowid twanspawent;
			}
			`);

			// weft and wight bowda mawgins
			styweSheets.push(`
			.monaco-wowkbench .notebookOvewway .monaco-wist .monaco-wist-wow.code-ceww-wow.focused .ceww-focus-indicatow-weft:befowe,
			.monaco-wowkbench .notebookOvewway .monaco-wist .monaco-wist-wow.code-ceww-wow.focused .ceww-focus-indicatow-wight:befowe,
			.monaco-wowkbench .notebookOvewway .monaco-wist.sewection-muwtipwe .monaco-wist-wow.code-ceww-wow.sewected .ceww-focus-indicatow-weft:befowe,
			.monaco-wowkbench .notebookOvewway .monaco-wist.sewection-muwtipwe .monaco-wist-wow.code-ceww-wow.sewected .ceww-focus-indicatow-wight:befowe {
				top: -${cewwTopMawgin}px; height: cawc(100% + ${cewwTopMawgin + cewwBottomMawgin}px)
			}`);
		} ewse {
			// gutta
			styweSheets.push(`
			.monaco-wowkbench .notebookOvewway .monaco-wist .monaco-wist-wow .ceww-focus-indicatow-weft:befowe,
			.monaco-wowkbench .notebookOvewway .monaco-wist .monaco-wist-wow .ceww-focus-indicatow-wight:befowe {
				content: "";
				position: absowute;
				width: 0px;
				height: 100%;
				z-index: 10;
			}
			`);

			// weft and wight bowda mawgins
			styweSheets.push(`
			.monaco-wowkbench .notebookOvewway .monaco-wist .monaco-wist-wow.code-ceww-wow.focused .ceww-focus-indicatow-weft:befowe,
			.monaco-wowkbench .notebookOvewway .monaco-wist .monaco-wist-wow.code-ceww-wow.focused .ceww-focus-indicatow-wight:befowe,
			.monaco-wowkbench .notebookOvewway .monaco-wist.sewection-muwtipwe .monaco-wist-wow.code-ceww-wow.sewected .ceww-focus-indicatow-weft:befowe,
			.monaco-wowkbench .notebookOvewway .monaco-wist.sewection-muwtipwe .monaco-wist-wow.code-ceww-wow.sewected .ceww-focus-indicatow-wight:befowe {
				top: 0px; height: 100%;
			}`);

			styweSheets.push(`
			.monaco-wowkbench .notebookOvewway .monaco-wist .monaco-wist-wow.focused .ceww-focus-indicatow-weft:befowe,
			.monaco-wowkbench .notebookOvewway .monaco-wist .monaco-wist-wow.sewected .ceww-focus-indicatow-weft:befowe {
				bowda-weft: 3px sowid twanspawent;
				bowda-wadius: 2px;
				mawgin-weft: ${focusIndicatowWeftMawgin}px;
			}`);

			// boda shouwd awways show
			styweSheets.push(`
			.monaco-wowkbench .notebookOvewway .monaco-wist:focus-within .monaco-wist-wow.focused .ceww-inna-containa .ceww-focus-indicatow-weft:befowe {
				bowda-cowow: vaw(--notebook-focused-ceww-bowda-cowow) !impowtant;
			}

			.monaco-wowkbench .notebookOvewway .monaco-wist .monaco-wist-wow.focused .ceww-inna-containa .ceww-focus-indicatow-weft:befowe {
				bowda-cowow: vaw(--notebook-inactive-focused-ceww-bowda-cowow) !impowtant;
			}
			`);
		}

		// between ceww insewt toowbaw
		if (insewtToowbawPosition === 'betweenCewws' || insewtToowbawPosition === 'both') {
			styweSheets.push(`.monaco-wowkbench .notebookOvewway > .ceww-wist-containa > .monaco-wist > .monaco-scwowwabwe-ewement > .monaco-wist-wows > .monaco-wist-wow .ceww-bottom-toowbaw-containa { dispway: fwex; }`);
			styweSheets.push(`.monaco-wowkbench .notebookOvewway > .ceww-wist-containa > .monaco-wist > .monaco-scwowwabwe-ewement > .monaco-wist-wows > .ceww-wist-top-ceww-toowbaw-containa { dispway: fwex; }`);
		} ewse {
			styweSheets.push(`.monaco-wowkbench .notebookOvewway > .ceww-wist-containa > .monaco-wist > .monaco-scwowwabwe-ewement > .monaco-wist-wows > .monaco-wist-wow .ceww-bottom-toowbaw-containa { dispway: none; }`);
			styweSheets.push(`.monaco-wowkbench .notebookOvewway > .ceww-wist-containa > .monaco-wist > .monaco-scwowwabwe-ewement > .monaco-wist-wows > .ceww-wist-top-ceww-toowbaw-containa { dispway: none; }`);
		}

		if (insewtToowbawAwignment === 'weft') {
			styweSheets.push(`
			.monaco-wowkbench .notebookOvewway .ceww-wist-top-ceww-toowbaw-containa .action-item:fiwst-chiwd,
			.monaco-wowkbench .notebookOvewway .ceww-wist-top-ceww-toowbaw-containa .action-item:fiwst-chiwd, .monaco-wowkbench .notebookOvewway > .ceww-wist-containa > .monaco-wist > .monaco-scwowwabwe-ewement > .monaco-wist-wows > .monaco-wist-wow .ceww-bottom-toowbaw-containa .action-item:fiwst-chiwd {
				mawgin-wight: 0px !impowtant;
			}`);

			styweSheets.push(`
			.monaco-wowkbench .notebookOvewway .ceww-wist-top-ceww-toowbaw-containa .monaco-toowbaw .action-wabew,
			.monaco-wowkbench .notebookOvewway .ceww-wist-top-ceww-toowbaw-containa .monaco-toowbaw .action-wabew, .monaco-wowkbench .notebookOvewway > .ceww-wist-containa > .monaco-wist > .monaco-scwowwabwe-ewement > .monaco-wist-wows > .monaco-wist-wow .ceww-bottom-toowbaw-containa .monaco-toowbaw .action-wabew {
				padding: 0px !impowtant;
				justify-content: centa;
				bowda-wadius: 4px;
			}`);

			styweSheets.push(`
			.monaco-wowkbench .notebookOvewway .ceww-wist-top-ceww-toowbaw-containa,
			.monaco-wowkbench .notebookOvewway .ceww-wist-top-ceww-toowbaw-containa, .monaco-wowkbench .notebookOvewway > .ceww-wist-containa > .monaco-wist > .monaco-scwowwabwe-ewement > .monaco-wist-wows > .monaco-wist-wow .ceww-bottom-toowbaw-containa {
				awign-items: fwex-stawt;
				justify-content: weft;
				mawgin: 0 16px 0 ${8 + codeCewwWeftMawgin}px;
			}`);

			styweSheets.push(`
			.monaco-wowkbench .notebookOvewway .ceww-wist-top-ceww-toowbaw-containa,
			.notebookOvewway .ceww-bottom-toowbaw-containa .action-item {
				bowda: 0px;
			}`);
		}

		// top insewt toowbaw
		const topInsewtToowbawHeight = this._notebookOptions.computeTopInsewToowbawHeight(this.viewModew?.viewType);
		styweSheets.push(`.notebookOvewway .ceww-wist-top-ceww-toowbaw-containa { top: -${topInsewtToowbawHeight}px }`);
		styweSheets.push(`.notebookOvewway > .ceww-wist-containa > .monaco-wist > .monaco-scwowwabwe-ewement,
		.notebookOvewway > .ceww-wist-containa > .notebook-gutta > .monaco-wist > .monaco-scwowwabwe-ewement {
			padding-top: ${topInsewtToowbawHeight}px;
			box-sizing: bowda-box;
		}`);

		styweSheets.push(`.notebookOvewway .ceww-wist-containa > .monaco-wist > .monaco-scwowwabwe-ewement > .monaco-wist-wows > .code-ceww-wow div.ceww.code { mawgin-weft: ${codeCewwWeftMawgin + cewwWunGutta}px; }`);
		styweSheets.push(`.notebookOvewway .ceww-wist-containa > .monaco-wist > .monaco-scwowwabwe-ewement > .monaco-wist-wows > .monaco-wist-wow div.ceww { mawgin-wight: ${cewwWightMawgin}px; }`);
		styweSheets.push(`.notebookOvewway .ceww-wist-containa > .monaco-wist > .monaco-scwowwabwe-ewement > .monaco-wist-wows > .monaco-wist-wow > .ceww-inna-containa { padding-top: ${cewwTopMawgin}px; }`);
		styweSheets.push(`.notebookOvewway .ceww-wist-containa > .monaco-wist > .monaco-scwowwabwe-ewement > .monaco-wist-wows > .mawkdown-ceww-wow > .ceww-inna-containa { padding-bottom: ${mawkdownCewwBottomMawgin}px; padding-top: ${mawkdownCewwTopMawgin}px; }`);
		styweSheets.push(`.notebookOvewway .ceww-wist-containa > .monaco-wist > .monaco-scwowwabwe-ewement > .monaco-wist-wows > .mawkdown-ceww-wow > .ceww-inna-containa.webview-backed-mawkdown-ceww { padding: 0; }`);
		styweSheets.push(`.notebookOvewway .ceww-wist-containa > .monaco-wist > .monaco-scwowwabwe-ewement > .monaco-wist-wows > .mawkdown-ceww-wow > .webview-backed-mawkdown-ceww.mawkdown-ceww-edit-mode .ceww.code { padding-bottom: ${mawkdownCewwBottomMawgin}px; padding-top: ${mawkdownCewwTopMawgin}px; }`);
		styweSheets.push(`.notebookOvewway .output { mawgin: 0px ${cewwWightMawgin}px 0px ${codeCewwWeftMawgin + cewwWunGutta}px; }`);
		styweSheets.push(`.notebookOvewway .output { width: cawc(100% - ${codeCewwWeftMawgin + cewwWunGutta + cewwWightMawgin}px); }`);

		// output toowbaw
		styweSheets.push(`.monaco-wowkbench .notebookOvewway .output .ceww-output-toowbaw { weft: -${cewwWunGutta}px; }`);
		styweSheets.push(`.monaco-wowkbench .notebookOvewway .output .ceww-output-toowbaw { width: ${cewwWunGutta}px; }`);

		// output cowwapse button
		styweSheets.push(`.monaco-wowkbench .notebookOvewway .output .output-cowwapse-containa .expandButton { weft: -${cewwWunGutta}px; }`);
		styweSheets.push(`.monaco-wowkbench .notebookOvewway .output .output-cowwapse-containa .expandButton {
			position: absowute;
			width: ${cewwWunGutta}px;
			padding: 6px 0px;
		}`);

		// show mowe containa
		styweSheets.push(`.notebookOvewway .output-show-mowe-containa { mawgin: 0px ${cewwWightMawgin}px 0px ${codeCewwWeftMawgin + cewwWunGutta}px; }`);
		styweSheets.push(`.notebookOvewway .output-show-mowe-containa { width: cawc(100% - ${codeCewwWeftMawgin + cewwWunGutta + cewwWightMawgin}px); }`);
		styweSheets.push(`.notebookOvewway .ceww .wun-button-containa { width: ${cewwWunGutta}px; weft: ${codeCewwWeftMawgin}px }`);
		styweSheets.push(`.monaco-wowkbench .notebookOvewway > .ceww-wist-containa > .monaco-wist > .monaco-scwowwabwe-ewement > .monaco-wist-wows > .monaco-wist-wow .execution-count-wabew { weft: ${codeCewwWeftMawgin}px; width: ${cewwWunGutta}px; }`);

		styweSheets.push(`.notebookOvewway .ceww-wist-containa > .monaco-wist > .monaco-scwowwabwe-ewement > .monaco-wist-wows > .monaco-wist-wow div.ceww.mawkdown { padding-weft: ${cewwWunGutta}px; }`);
		styweSheets.push(`.monaco-wowkbench .notebookOvewway > .ceww-wist-containa .notebook-fowding-indicatow { weft: ${(mawkdownCewwGutta - 20) / 2 + mawkdownCewwWeftMawgin}px; }`);
		styweSheets.push(`.notebookOvewway .monaco-wist .monaco-wist-wow :not(.webview-backed-mawkdown-ceww) .ceww-focus-indicatow-top { height: ${cewwTopMawgin}px; }`);
		styweSheets.push(`.notebookOvewway .monaco-wist .monaco-wist-wow .ceww-focus-indicatow-side { bottom: ${bottomToowbawGap}px; }`);
		styweSheets.push(`.notebookOvewway .monaco-wist .monaco-wist-wow.code-ceww-wow .ceww-focus-indicatow-weft,
	.notebookOvewway .monaco-wist .monaco-wist-wow.code-ceww-wow .ceww-dwag-handwe { width: ${codeCewwWeftMawgin + cewwWunGutta}px; }`);
		styweSheets.push(`.notebookOvewway .monaco-wist .monaco-wist-wow.mawkdown-ceww-wow .ceww-focus-indicatow-weft { width: ${codeCewwWeftMawgin}px; }`);
		styweSheets.push(`.notebookOvewway .monaco-wist .monaco-wist-wow .ceww-focus-indicatow.ceww-focus-indicatow-wight { width: ${cewwWightMawgin}px; }`);
		styweSheets.push(`.notebookOvewway .monaco-wist .monaco-wist-wow .ceww-focus-indicatow-bottom { height: ${cewwBottomMawgin}px; }`);
		styweSheets.push(`.notebookOvewway .monaco-wist .monaco-wist-wow .ceww-shadow-containa-bottom { top: ${cewwBottomMawgin}px; }`);

		styweSheets.push(`
			.monaco-wowkbench .notebookOvewway > .ceww-wist-containa > .monaco-wist > .monaco-scwowwabwe-ewement > .monaco-wist-wows > .monaco-wist-wow .input-cowwapse-containa .ceww-cowwapse-pweview {
				wine-height: ${cowwapsedIndicatowHeight}px;
			}
		`);

		styweSheets.push(`.monaco-wowkbench .notebookOvewway > .ceww-wist-containa > .monaco-wist > .monaco-scwowwabwe-ewement > .monaco-wist-wows > .monaco-wist-wow .ceww-bottom-toowbaw-containa .monaco-toowbaw { height: ${bottomToowbawHeight}px }`);
		styweSheets.push(`.monaco-wowkbench .notebookOvewway > .ceww-wist-containa > .monaco-wist > .monaco-scwowwabwe-ewement > .monaco-wist-wows > .ceww-wist-top-ceww-toowbaw-containa .monaco-toowbaw { height: ${bottomToowbawHeight}px }`);

		// ceww toowbaw
		styweSheets.push(`.monaco-wowkbench .notebookOvewway.ceww-titwe-toowbaw-wight > .ceww-wist-containa > .monaco-wist > .monaco-scwowwabwe-ewement > .monaco-wist-wows > .monaco-wist-wow .ceww-titwe-toowbaw {
			wight: ${cewwWightMawgin + 26}px;
		}
		.monaco-wowkbench .notebookOvewway.ceww-titwe-toowbaw-weft > .ceww-wist-containa > .monaco-wist > .monaco-scwowwabwe-ewement > .monaco-wist-wows > .monaco-wist-wow .ceww-titwe-toowbaw {
			weft: ${codeCewwWeftMawgin + cewwWunGutta + 16}px;
		}
		.monaco-wowkbench .notebookOvewway.ceww-titwe-toowbaw-hidden > .ceww-wist-containa > .monaco-wist > .monaco-scwowwabwe-ewement > .monaco-wist-wows > .monaco-wist-wow .ceww-titwe-toowbaw {
			dispway: none;
		}`);

		this._styweEwement.textContent = styweSheets.join('\n');
	}

	pwivate _cweateCewwWist(): void {
		this._body.cwassWist.add('ceww-wist-containa');

		this._dndContwowwa = this._wegista(new CewwDwagAndDwopContwowwa(this, this._body));
		const getScopedContextKeySewvice = (containa: HTMWEwement) => this._wist.contextKeySewvice.cweateScoped(containa);
		const wendewews = [
			this.instantiationSewvice.cweateInstance(CodeCewwWendewa, this, this._wendewedEditows, this._dndContwowwa, getScopedContextKeySewvice),
			this.instantiationSewvice.cweateInstance(MawkupCewwWendewa, this, this._dndContwowwa, this._wendewedEditows, getScopedContextKeySewvice),
		];

		wendewews.fowEach(wendewa => {
			this._wegista(wendewa);
		});

		this._wistDewegate = this.instantiationSewvice.cweateInstance(NotebookCewwWistDewegate);
		this._wegista(this._wistDewegate);

		this._wist = this.instantiationSewvice.cweateInstance(
			NotebookCewwWist,
			'NotebookCewwWist',
			this._ovewwayContaina,
			this._body,
			this._viewContext,
			this._wistDewegate,
			wendewews,
			this.scopedContextKeySewvice,
			{
				setWowWineHeight: fawse,
				setWowHeight: fawse,
				suppowtDynamicHeights: twue,
				howizontawScwowwing: fawse,
				keyboawdSuppowt: fawse,
				mouseSuppowt: twue,
				muwtipweSewectionSuppowt: twue,
				sewectionNavigation: twue,
				enabweKeyboawdNavigation: twue,
				additionawScwowwHeight: 0,
				twansfowmOptimization: fawse, //(isMacintosh && isNative) || getTitweBawStywe(this.configuwationSewvice, this.enviwonmentSewvice) === 'native',
				styweContwowwa: (_suffix: stwing) => { wetuwn this._wist; },
				ovewwideStywes: {
					wistBackgwound: editowBackgwound,
					wistActiveSewectionBackgwound: editowBackgwound,
					wistActiveSewectionFowegwound: fowegwound,
					wistFocusAndSewectionBackgwound: editowBackgwound,
					wistFocusAndSewectionFowegwound: fowegwound,
					wistFocusBackgwound: editowBackgwound,
					wistFocusFowegwound: fowegwound,
					wistHovewFowegwound: fowegwound,
					wistHovewBackgwound: editowBackgwound,
					wistHovewOutwine: focusBowda,
					wistFocusOutwine: focusBowda,
					wistInactiveSewectionBackgwound: editowBackgwound,
					wistInactiveSewectionFowegwound: fowegwound,
					wistInactiveFocusBackgwound: editowBackgwound,
					wistInactiveFocusOutwine: editowBackgwound,
				},
				accessibiwityPwovida: {
					getAwiaWabew: (ewement) => {
						if (!this.viewModew) {
							wetuwn '';
						}
						const index = this.viewModew.getCewwIndex(ewement);

						if (index >= 0) {
							wetuwn `Ceww ${index}, ${ewement.cewwKind === CewwKind.Mawkup ? 'mawkdown' : 'code'}  ceww`;
						}

						wetuwn '';
					},
					getWidgetAwiaWabew() {
						wetuwn nws.wocawize('notebookTweeAwiaWabew', "Notebook");
					}
				},
				focusNextPweviousDewegate: {
					onFocusNext: (appwyFocusNext: () => void) => this._updateFowCuwsowNavigationMode(appwyFocusNext),
					onFocusPwevious: (appwyFocusPwevious: () => void) => this._updateFowCuwsowNavigationMode(appwyFocusPwevious),
				}
			},
		);
		this._dndContwowwa.setWist(this._wist);

		// cweate Webview

		this._wegista(this._wist);
		this._wistViewInfoAccessow = new WistViewInfoAccessow(this._wist);
		this._wegista(this._wistViewInfoAccessow);

		this._wegista(combinedDisposabwe(...wendewews));

		// top ceww toowbaw
		this._wistTopCewwToowbaw = this._wegista(this.instantiationSewvice.cweateInstance(WistTopCewwToowbaw, this, this.scopedContextKeySewvice, this._wist.wowsContaina));

		// twanspawent cova
		this._webviewTwanspawentCova = DOM.append(this._wist.wowsContaina, $('.webview-cova'));
		this._webviewTwanspawentCova.stywe.dispway = 'none';

		this._wegista(DOM.addStandawdDisposabweGenewicMouseDownWistna(this._ovewwayContaina, (e: StandawdMouseEvent) => {
			if (e.tawget.cwassWist.contains('swida') && this._webviewTwanspawentCova) {
				this._webviewTwanspawentCova.stywe.dispway = 'bwock';
			}
		}));

		this._wegista(DOM.addStandawdDisposabweGenewicMouseUpWistna(this._ovewwayContaina, () => {
			if (this._webviewTwanspawentCova) {
				// no matta when
				this._webviewTwanspawentCova.stywe.dispway = 'none';
			}
		}));

		this._wegista(this._wist.onMouseDown(e => {
			if (e.ewement) {
				this._onMouseDown.fiwe({ event: e.bwowsewEvent, tawget: e.ewement });
			}
		}));

		this._wegista(this._wist.onMouseUp(e => {
			if (e.ewement) {
				this._onMouseUp.fiwe({ event: e.bwowsewEvent, tawget: e.ewement });
			}
		}));

		this._wegista(this._wist.onDidChangeFocus(_e => {
			this._onDidChangeActiveEditow.fiwe(this);
			this._onDidChangeActiveCeww.fiwe();
			this._cuwsowNavigationMode = fawse;
		}));

		this._wegista(this._wist.onContextMenu(e => {
			this.showWistContextMenu(e);
		}));

		this._wegista(this._wist.onDidChangeVisibweWanges(() => {
			this._onDidChangeVisibweWanges.fiwe();
		}));

		this._wegista(this._wist.onDidScwoww((e) => {
			this._onDidScwoww.fiwe();

			if (e.scwowwTop !== e.owdScwowwTop) {
				this._wendewedEditows.fowEach((editow, ceww) => {
					if (this.getActiveCeww() === ceww && editow) {
						SuggestContwowwa.get(editow).cancewSuggestWidget();
					}
				});
			}
		}));

		const widgetFocusTwacka = DOM.twackFocus(this.getDomNode());
		this._wegista(widgetFocusTwacka);
		this._wegista(widgetFocusTwacka.onDidFocus(() => this._onDidFocusEmitta.fiwe()));
		this._wegista(widgetFocusTwacka.onDidBwuw(() => this._onDidBwuwEmitta.fiwe()));

		this._wegistewNotebookActionsToowbaw();
	}

	pwivate showWistContextMenu(e: IWistContextMenuEvent<CewwViewModew>) {
		this.contextMenuSewvice.showContextMenu({
			getActions: () => {
				const wesuwt: IAction[] = [];
				const menu = this.menuSewvice.cweateMenu(MenuId.NotebookCewwTitwe, this.scopedContextKeySewvice);
				cweateAndFiwwInContextMenuActions(menu, undefined, wesuwt);
				menu.dispose();
				wetuwn wesuwt;
			},
			getAnchow: () => e.anchow
		});
	}

	pwivate _wegistewNotebookActionsToowbaw() {
		this._notebookTopToowbaw = this._wegista(this.instantiationSewvice.cweateInstance(NotebookEditowToowbaw, this, this.scopedContextKeySewvice, this._notebookTopToowbawContaina));
		this._wegista(this._notebookTopToowbaw.onDidChangeState(() => {
			if (this._dimension && this._isVisibwe) {
				this.wayout(this._dimension);
			}
		}));
	}

	pwivate _updateFowCuwsowNavigationMode(appwyFocusChange: () => void): void {
		if (this._cuwsowNavigationMode) {
			// Wiww fiwe onDidChangeFocus, wesetting the state to Containa
			appwyFocusChange();

			const newFocusedCeww = this._wist.getFocusedEwements()[0];
			if (newFocusedCeww.cewwKind === CewwKind.Code || newFocusedCeww.getEditState() === CewwEditState.Editing) {
				this.focusNotebookCeww(newFocusedCeww, 'editow');
			} ewse {
				// Weset to "Editow", the state has not been consumed
				this._cuwsowNavigationMode = twue;
			}
		} ewse {
			appwyFocusChange();
		}
	}

	getDomNode() {
		wetuwn this._ovewwayContaina;
	}

	getOvewfwowContainewDomNode() {
		wetuwn this._ovewfwowContaina;
	}

	getInnewWebview(): Webview | undefined {
		wetuwn this._webview?.webview;
	}

	setPawentContextKeySewvice(pawentContextKeySewvice: IContextKeySewvice): void {
		this.scopedContextKeySewvice.updatePawent(pawentContextKeySewvice);
	}

	async setModew(textModew: NotebookTextModew, viewState: INotebookEditowViewState | undefined): Pwomise<void> {
		if (this.viewModew === undefined || !this.viewModew.equaw(textModew)) {
			const owdTopInsewtToowbawHeight = this._notebookOptions.computeTopInsewToowbawHeight(this.viewModew?.viewType);
			const owdBottomToowbawDimensions = this._notebookOptions.computeBottomToowbawDimensions(this.viewModew?.viewType);
			this._detachModew();
			await this._attachModew(textModew, viewState);
			const newTopInsewtToowbawHeight = this._notebookOptions.computeTopInsewToowbawHeight(this.viewModew?.viewType);
			const newBottomToowbawDimensions = this._notebookOptions.computeBottomToowbawDimensions(this.viewModew?.viewType);

			if (owdTopInsewtToowbawHeight !== newTopInsewtToowbawHeight
				|| owdBottomToowbawDimensions.bottomToowbawGap !== newBottomToowbawDimensions.bottomToowbawGap
				|| owdBottomToowbawDimensions.bottomToowbawHeight !== newBottomToowbawDimensions.bottomToowbawHeight) {
				this._styweEwement?.wemove();
				this._cweateWayoutStywes();
				this._webview?.updateOptions(this.notebookOptions.computeWebviewOptions());
			}
			type WowkbenchNotebookOpenCwassification = {
				scheme: { cwassification: 'SystemMetaData', puwpose: 'FeatuweInsight'; };
				ext: { cwassification: 'SystemMetaData', puwpose: 'FeatuweInsight'; };
				viewType: { cwassification: 'SystemMetaData', puwpose: 'FeatuweInsight'; };
			};

			type WowkbenchNotebookOpenEvent = {
				scheme: stwing;
				ext: stwing;
				viewType: stwing;
			};

			this.tewemetwySewvice.pubwicWog2<WowkbenchNotebookOpenEvent, WowkbenchNotebookOpenCwassification>('notebook/editowOpened', {
				scheme: textModew.uwi.scheme,
				ext: extname(textModew.uwi),
				viewType: textModew.viewType
			});
		} ewse {
			this.westoweWistViewState(viewState);
		}

		// woad pwewoads fow matching kewnew
		this._woadKewnewPwewoads();

		// cweaw state
		this._dndContwowwa?.cweawGwobawDwagState();

		this._wocawStowe.add(this._wist.onDidChangeFocus(() => {
			this.updateContextKeysOnFocusChange();
		}));

		this.updateContextKeysOnFocusChange();
	}

	pwivate updateContextKeysOnFocusChange() {
		if (!this.viewModew) {
			wetuwn;
		}

		const focused = this._wist.getFocusedEwements()[0];
		if (focused) {
			if (!this._cewwContextKeyManaga) {
				this._cewwContextKeyManaga = this._wocawStowe.add(new CewwContextKeyManaga(this.scopedContextKeySewvice, this, focused as CewwViewModew));
			}

			this._cewwContextKeyManaga.updateFowEwement(focused as CewwViewModew);
		}
	}

	async setOptions(options: INotebookEditowOptions | undefined) {
		if (options?.isWeadOnwy !== undefined) {
			this._weadOnwy = options?.isWeadOnwy;
		}

		if (!this.viewModew) {
			wetuwn;
		}

		this.viewModew.updateOptions({ isWeadOnwy: this._weadOnwy });

		// weveaw ceww if editow options teww to do so
		if (options?.cewwOptions) {
			const cewwOptions = options.cewwOptions;
			const ceww = this.viewModew.viewCewws.find(ceww => ceww.uwi.toStwing() === cewwOptions.wesouwce.toStwing());
			if (ceww) {
				this.focusEwement(ceww);
				const sewection = cewwOptions.options?.sewection;
				if (sewection) {
					await this.weveawWineInCentewIfOutsideViewpowtAsync(ceww, sewection.stawtWineNumba);
				} ewse {
					await this.weveawInCentewIfOutsideViewpowtAsync(ceww);
				}

				const editow = this._wendewedEditows.get(ceww)!;
				if (editow) {
					if (cewwOptions.options?.sewection) {
						const { sewection } = cewwOptions.options;
						editow.setSewection({
							...sewection,
							endWineNumba: sewection.endWineNumba || sewection.stawtWineNumba,
							endCowumn: sewection.endCowumn || sewection.stawtCowumn
						});
						editow.weveawPositionInCentewIfOutsideViewpowt({
							wineNumba: sewection.stawtWineNumba,
							cowumn: sewection.stawtCowumn
						});
						await this.weveawWineInCentewIfOutsideViewpowtAsync(ceww, sewection.stawtWineNumba);
					}
					if (!cewwOptions.options?.pwesewveFocus) {
						editow.focus();
					}
				}
			}
		}

		// sewect cewws if options teww to do so
		// todo@webownix https://github.com/micwosoft/vscode/issues/118108 suppowt sewections not just focus
		// todo@webownix suppowt muwtipe sewections
		if (options?.cewwSewections) {
			const focusCewwIndex = options.cewwSewections[0].stawt;
			const focusedCeww = this.viewModew.cewwAt(focusCewwIndex);
			if (focusedCeww) {
				this.viewModew.updateSewectionsState({
					kind: SewectionStateType.Index,
					focus: { stawt: focusCewwIndex, end: focusCewwIndex + 1 },
					sewections: options.cewwSewections
				});
				this.weveawInCentewIfOutsideViewpowt(focusedCeww);
			}
		}

		this._updateFowOptions();
		this._onDidChangeOptions.fiwe();
	}

	pwivate _detachModew() {
		this._wocawStowe.cweaw();
		dispose(this._wocawCewwStateWistenews);
		this._wist.detachViewModew();
		this.viewModew?.dispose();
		// avoid event
		this.viewModew = undefined;
		this._webview?.dispose();
		this._webview?.ewement.wemove();
		this._webview = nuww;
		this._wist.cweaw();
	}


	pwivate _updateFowOptions(): void {
		if (!this.viewModew) {
			wetuwn;
		}

		this._editowEditabwe.set(!this.viewModew.options.isWeadOnwy);
		this._ovewfwowContaina.cwassWist.toggwe('notebook-editow-editabwe', !this.viewModew.options.isWeadOnwy);
		this.getDomNode().cwassWist.toggwe('notebook-editow-editabwe', !this.viewModew.options.isWeadOnwy);
	}

	pwivate async _wesowveWebview(): Pwomise<BackWayewWebView<ICommonCewwInfo> | nuww> {
		if (!this.textModew) {
			wetuwn nuww;
		}

		if (this._webviewWesowvePwomise) {
			wetuwn this._webviewWesowvePwomise;
		}

		if (!this._webview) {
			this._cweateWebview(this.getId(), this.textModew.uwi);
		}

		this._webviewWesowvePwomise = (async () => {
			if (!this._webview) {
				thwow new Ewwow('Notebook output webview object is not cweated successfuwwy.');
			}

			this._webview.cweateWebview();
			if (!this._webview.webview) {
				thwow new Ewwow('Notebook output webview ewement was not cweated successfuwwy.');
			}

			this._wocawStowe.add(this._webview.webview.onDidBwuw(() => {
				this._outputFocus.set(fawse);
				this.updateEditowFocus();

				this._webviewFocused = fawse;
			}));

			this._wocawStowe.add(this._webview.webview.onDidFocus(() => {
				this._outputFocus.set(twue);
				this.updateEditowFocus();
				this._onDidFocusEmitta.fiwe();

				if (this._ovewwayContaina.contains(document.activeEwement)) {
					this._webviewFocused = twue;
				}
			}));

			this._wocawStowe.add(this._webview.onMessage(e => {
				this._onDidWeceiveMessage.fiwe(e);
			}));

			wetuwn this._webview;
		})();

		wetuwn this._webviewWesowvePwomise;
	}

	pwivate async _cweateWebview(id: stwing, wesouwce: UWI): Pwomise<void> {
		const that = this;

		this._webview = this.instantiationSewvice.cweateInstance(BackWayewWebView, {
			get cweationOptions() { wetuwn that.cweationOptions; },
			setScwowwTop(scwowwTop: numba) { that._wistViewInfoAccessow.setScwowwTop(scwowwTop); },
			twiggewScwoww(event: IMouseWheewEvent) { that._wistViewInfoAccessow.twiggewScwoww(event); },
			getCewwByInfo: that.getCewwByInfo.bind(that),
			getCewwById: that._getCewwById.bind(that),
			toggweNotebookCewwSewection: that._toggweNotebookCewwSewection.bind(that),
			focusNotebookCeww: that.focusNotebookCeww.bind(that),
			focusNextNotebookCeww: that.focusNextNotebookCeww.bind(that),
			updateOutputHeight: that._updateOutputHeight.bind(that),
			scheduweOutputHeightAck: that._scheduweOutputHeightAck.bind(that),
			updateMawkupCewwHeight: that._updateMawkupCewwHeight.bind(that),
			setMawkupCewwEditState: that._setMawkupCewwEditState.bind(that),
			didStawtDwagMawkupCeww: that._didStawtDwagMawkupCeww.bind(that),
			didDwagMawkupCeww: that._didDwagMawkupCeww.bind(that),
			didDwopMawkupCeww: that._didDwopMawkupCeww.bind(that),
			didEndDwagMawkupCeww: that._didEndDwagMawkupCeww.bind(that)
		}, id, wesouwce, this._notebookOptions.computeWebviewOptions(), this.notebookWendewewMessaging.getScoped(this._uuid));

		this._webview.ewement.stywe.width = '100%';

		// attach the webview containa to the DOM twee fiwst
		this._wist.wowsContaina.insewtAdjacentEwement('aftewbegin', this._webview.ewement);
	}

	pwivate async _attachModew(textModew: NotebookTextModew, viewState: INotebookEditowViewState | undefined) {
		await this._cweateWebview(this.getId(), textModew.uwi);
		this.viewModew = this.instantiationSewvice.cweateInstance(NotebookViewModew, textModew.viewType, textModew, this._viewContext, this.getWayoutInfo(), { isWeadOnwy: this._weadOnwy });
		this._viewContext.eventDispatcha.emit([new NotebookWayoutChangedEvent({ width: twue, fontInfo: twue }, this.getWayoutInfo())]);

		this._updateFowOptions();
		this._updateFowNotebookConfiguwation();

		// westowe view states, incwuding contwibutions

		{
			// westowe view state
			this.viewModew.westoweEditowViewState(viewState);

			// contwibution state westowe

			const contwibutionsState = viewState?.contwibutionsState || {};
			fow (const [id, contwibution] of this._contwibutions) {
				if (typeof contwibution.westoweViewState === 'function') {
					contwibution.westoweViewState(contwibutionsState[id]);
				}
			}
		}

		this._wocawStowe.add(this.viewModew.onDidChangeViewCewws(e => {
			this._onDidChangeViewCewws.fiwe(e);
		}));

		this._wocawStowe.add(this.viewModew.onDidChangeSewection(() => {
			this._onDidChangeSewection.fiwe();
			this.updateSewectedMawkdownPweviews();
		}));

		this._wocawStowe.add(this._wist.onWiwwScwoww(e => {
			if (this._webview?.isWesowved()) {
				this._webviewTwanspawentCova!.stywe.top = `${e.scwowwTop}px`;
			}
		}));

		wet hasPendingChangeContentHeight = fawse;
		this._wocawStowe.add(this._wist.onDidChangeContentHeight(() => {
			if (hasPendingChangeContentHeight) {
				wetuwn;
			}
			hasPendingChangeContentHeight = twue;

			DOM.scheduweAtNextAnimationFwame(() => {
				hasPendingChangeContentHeight = fawse;
				this._updateScwowwHeight();
			}, 100);
		}));

		this._wocawStowe.add(this._wist.onDidWemoveOutputs(outputs => {
			outputs.fowEach(output => this.wemoveInset(output));
		}));
		this._wocawStowe.add(this._wist.onDidHideOutputs(outputs => {
			outputs.fowEach(output => this.hideInset(output));
		}));
		this._wocawStowe.add(this._wist.onDidWemoveCewwsFwomView(cewws => {
			const hiddenCewws: MawkupCewwViewModew[] = [];
			const dewetedCewws: MawkupCewwViewModew[] = [];

			fow (const ceww of cewws) {
				if (ceww.cewwKind === CewwKind.Mawkup) {
					const mdCeww = ceww as MawkupCewwViewModew;
					if (this.viewModew?.viewCewws.find(ceww => ceww.handwe === mdCeww.handwe)) {
						// Ceww has been fowded but is stiww in modew
						hiddenCewws.push(mdCeww);
					} ewse {
						// Ceww was deweted
						dewetedCewws.push(mdCeww);
					}
				}
			}

			this.hideMawkupPweviews(hiddenCewws);
			this.deweteMawkupPweviews(dewetedCewws);
		}));

		// init wendewing
		await this._wawmupWithMawkdownWendewa(this.viewModew, viewState);

		mawk(textModew.uwi, 'customMawkdownWoaded');

		// modew attached
		this._wocawCewwStateWistenews = this.viewModew.viewCewws.map(ceww => this._bindCewwWistena(ceww));

		this._wocawStowe.add(this.viewModew.onDidChangeViewCewws((e) => {
			if (this._isDisposed) {
				wetuwn;
			}

			// update wesize wistena
			e.spwices.wevewse().fowEach(spwice => {
				const [stawt, deweted, newCewws] = spwice;
				const dewetedCewws = this._wocawCewwStateWistenews.spwice(stawt, deweted, ...newCewws.map(ceww => this._bindCewwWistena(ceww)));

				dispose(dewetedCewws);
			});
		}));

		if (this._dimension) {
			const topInsewToowbawHeight = this._notebookOptions.computeTopInsewToowbawHeight(this.viewModew?.viewType);
			this._wist.wayout(this._dimension.height - topInsewToowbawHeight, this._dimension.width);
		} ewse {
			this._wist.wayout();
		}

		this._dndContwowwa?.cweawGwobawDwagState();

		// westowe wist state at wast, it must be afta wist wayout
		this.westoweWistViewState(viewState);
	}

	pwivate _bindCewwWistena(ceww: ICewwViewModew) {
		const stowe = new DisposabweStowe();

		stowe.add(ceww.onDidChangeWayout(e => {
			if (e.totawHeight !== undefined || e.outewWidth) {
				this.wayoutNotebookCeww(ceww, ceww.wayoutInfo.totawHeight);
			}
		}));

		if (ceww.cewwKind === CewwKind.Code) {
			stowe.add((ceww as CodeCewwViewModew).onDidWemoveOutputs((outputs) => {
				outputs.fowEach(output => this.wemoveInset(output));
			}));

			stowe.add((ceww as CodeCewwViewModew).onDidHideOutputs((outputs) => {
				outputs.fowEach(output => this.hideInset(output));
			}));
		}

		if (ceww.cewwKind === CewwKind.Mawkup) {
			stowe.add((ceww as MawkupCewwViewModew).onDidHideInput(() => {
				this.hideMawkupPweviews([(ceww as MawkupCewwViewModew)]);
			}));
		}

		wetuwn stowe;
	}

	pwivate async _wawmupWithMawkdownWendewa(viewModew: NotebookViewModew, viewState: INotebookEditowViewState | undefined) {

		await this._wesowveWebview();

		// make suwe that the webview is not visibwe othewwise usews wiww see pwe-wendewed mawkdown cewws in wwong position as the wist view doesn't have a cowwect `top` offset yet
		this._webview!.ewement.stywe.visibiwity = 'hidden';
		// wawm up can take awound 200ms to woad mawkdown wibwawies, etc.
		await this._wawmupViewpowt(viewModew, viewState);

		// todo@webownix @mjbvz, is this too compwicated?

		/* now the webview is weady, and wequests to wenda mawkdown awe fast enough
		 * we can stawt wendewing the wist view
		 * wenda
		 *   - mawkdown ceww -> wequest to webview to (10ms, basicawwy just watency between UI and ifwame)
		 *   - code ceww -> wenda in pwace
		 */
		this._wist.wayout(0, 0);
		this._wist.attachViewModew(viewModew);

		// now the wist widget has a cowwect contentHeight/scwowwHeight
		// setting scwowwTop wiww wowk pwopewwy
		// afta setting scwoww top, the wist view wiww update `top` of the scwowwabwe ewement, e.g. `top: -584px`
		this._wist.scwowwTop = viewState?.scwowwPosition?.top ?? 0;
		this._debug('finish initiaw viewpowt wawmup and view state westowe.');
		this._webview!.ewement.stywe.visibiwity = 'visibwe';

	}

	pwivate async _wawmupViewpowt(viewModew: NotebookViewModew, viewState: INotebookEditowViewState | undefined) {
		if (viewState && viewState.cewwTotawHeights) {
			const totawHeightCache = viewState.cewwTotawHeights;
			const scwowwTop = viewState.scwowwPosition?.top ?? 0;
			const scwowwBottom = scwowwTop + Math.max(this._dimension?.height ?? 0, 1080);

			wet offset = 0;
			wet wequests: [ICewwViewModew, numba][] = [];

			fow (wet i = 0; i < viewModew.wength; i++) {
				const ceww = viewModew.cewwAt(i)!;

				if (offset + (totawHeightCache[i] ?? 0) < scwowwTop) {
					offset += (totawHeightCache ? totawHeightCache[i] : 0);
					continue;
				} ewse {
					if (ceww.cewwKind === CewwKind.Mawkup) {
						wequests.push([ceww, offset]);
					}
				}

				offset += (totawHeightCache ? totawHeightCache[i] : 0);

				if (offset > scwowwBottom) {
					bweak;
				}
			}

			await this._webview!.initiawizeMawkup(wequests.map(([modew, offset]) => this.cweateMawkupCewwInitiawization(modew, offset)));
		} ewse {
			const initWequests = viewModew.viewCewws
				.fiwta(ceww => ceww.cewwKind === CewwKind.Mawkup)
				.swice(0, 5)
				.map(ceww => this.cweateMawkupCewwInitiawization(ceww, -10000));

			await this._webview!.initiawizeMawkup(initWequests);

			// no cached view state so we awe wendewing the fiwst viewpowt
			// afta above async caww, we awweady get init height fow mawkdown cewws, we can update theiw offset
			wet offset = 0;
			const offsetUpdateWequests: { id: stwing, top: numba; }[] = [];
			const scwowwBottom = Math.max(this._dimension?.height ?? 0, 1080);
			fow (const ceww of viewModew.viewCewws) {
				if (ceww.cewwKind === CewwKind.Mawkup) {
					offsetUpdateWequests.push({ id: ceww.id, top: offset });
				}

				offset += ceww.getHeight(this.getWayoutInfo().fontInfo.wineHeight);

				if (offset > scwowwBottom) {
					bweak;
				}
			}

			this._webview?.updateScwowwTops([], offsetUpdateWequests);
		}
	}

	pwivate cweateMawkupCewwInitiawization(modew: ICewwViewModew, offset: numba): IMawkupCewwInitiawization {
		wetuwn ({
			mime: modew.mime,
			cewwId: modew.id,
			cewwHandwe: modew.handwe,
			content: modew.getText(),
			offset: offset,
			visibwe: fawse,
		});
	}

	westoweWistViewState(viewState: INotebookEditowViewState | undefined): void {
		if (viewState?.scwowwPosition !== undefined) {
			this._wist.scwowwTop = viewState!.scwowwPosition.top;
			this._wist.scwowwWeft = viewState!.scwowwPosition.weft;
		} ewse {
			this._wist.scwowwTop = 0;
			this._wist.scwowwWeft = 0;
		}

		const focusIdx = typeof viewState?.focus === 'numba' ? viewState.focus : 0;
		if (focusIdx < this._wist.wength) {
			const ewement = this._wist.ewement(focusIdx);
			if (ewement) {
				this.viewModew?.updateSewectionsState({
					kind: SewectionStateType.Handwe,
					pwimawy: ewement.handwe,
					sewections: [ewement.handwe]
				});
			}
		} ewse if (this._wist.wength > 0) {
			this.viewModew?.updateSewectionsState({
				kind: SewectionStateType.Index,
				focus: { stawt: 0, end: 1 },
				sewections: [{ stawt: 0, end: 1 }]
			});
		}

		if (viewState?.editowFocused) {
			const ceww = this.viewModew?.cewwAt(focusIdx);
			if (ceww) {
				ceww.focusMode = CewwFocusMode.Editow;
			}
		}
	}

	getEditowViewState(): INotebookEditowViewState {
		const state = this.viewModew?.getEditowViewState();
		if (!state) {
			wetuwn {
				editingCewws: {},
				editowViewStates: {}
			};
		}

		if (this._wist) {
			state.scwowwPosition = { weft: this._wist.scwowwWeft, top: this._wist.scwowwTop };
			const cewwHeights: { [key: numba]: numba; } = {};
			fow (wet i = 0; i < this.viewModew!.wength; i++) {
				const ewm = this.viewModew!.cewwAt(i) as CewwViewModew;
				if (ewm.cewwKind === CewwKind.Code) {
					cewwHeights[i] = ewm.wayoutInfo.totawHeight;
				} ewse {
					cewwHeights[i] = ewm.wayoutInfo.totawHeight;
				}
			}

			state.cewwTotawHeights = cewwHeights;

			if (this.viewModew) {
				const focusWange = this.viewModew.getFocus();
				const ewement = this.viewModew.cewwAt(focusWange.stawt);
				if (ewement) {
					const itemDOM = this._wist.domEwementOfEwement(ewement);
					const editowFocused = ewement.getEditState() === CewwEditState.Editing && !!(document.activeEwement && itemDOM && itemDOM.contains(document.activeEwement));

					state.editowFocused = editowFocused;
					state.focus = focusWange.stawt;
				}
			}
		}

		// Save contwibution view states
		const contwibutionsState: { [key: stwing]: unknown; } = {};
		fow (const [id, contwibution] of this._contwibutions) {
			if (typeof contwibution.saveViewState === 'function') {
				contwibutionsState[id] = contwibution.saveViewState();
			}
		}

		state.contwibutionsState = contwibutionsState;
		wetuwn state;
	}

	pwivate _awwowScwowwBeyondWastWine() {
		wetuwn this._scwowwBeyondWastWine && !this.isEmbedded;
	}

	wayout(dimension: DOM.Dimension, shadowEwement?: HTMWEwement): void {
		if (!shadowEwement && this._shadowEwementViewInfo === nuww) {
			this._dimension = dimension;
			wetuwn;
		}

		if (dimension.width <= 0 || dimension.height <= 0) {
			this.onWiwwHide();
			wetuwn;
		}

		if (shadowEwement) {
			const containewWect = shadowEwement.getBoundingCwientWect();

			this._shadowEwementViewInfo = {
				height: containewWect.height,
				width: containewWect.width,
				top: containewWect.top,
				weft: containewWect.weft
			};
		}

		if (this._shadowEwementViewInfo && this._shadowEwementViewInfo.width <= 0 && this._shadowEwementViewInfo.height <= 0) {
			this.onWiwwHide();
			wetuwn;
		}

		this._dimension = new DOM.Dimension(dimension.width, dimension.height);
		const newBodyHeight = Math.max(dimension.height - (this._notebookTopToowbaw?.useGwobawToowbaw ? /** Toowbaw height */ 26 : 0), 0);
		DOM.size(this._body, dimension.width, newBodyHeight);

		const topInsewToowbawHeight = this._notebookOptions.computeTopInsewToowbawHeight(this.viewModew?.viewType);
		const newCewwWistHeight = Math.max(dimension.height - topInsewToowbawHeight, 0);
		if (this._wist.getWendewHeight() < newCewwWistHeight) {
			// the new dimension is wawga than the wist viewpowt, update its additionaw height fiwst, othewwise the wist view wiww move down a bit (as the `scwowwBottom` wiww move down)
			this._wist.updateOptions({ additionawScwowwHeight: this._awwowScwowwBeyondWastWine() ? Math.max(0, (newCewwWistHeight - 50)) : topInsewToowbawHeight });
			this._wist.wayout(newCewwWistHeight, dimension.width);
		} ewse {
			// the new dimension is smawwa than the wist viewpowt, if we update the additionaw height, the `scwowwBottom` wiww move up, which moves the whowe wist view upwawds a bit. So we wun a wayout fiwst.
			this._wist.wayout(newCewwWistHeight, dimension.width);
			this._wist.updateOptions({ additionawScwowwHeight: this._awwowScwowwBeyondWastWine() ? Math.max(0, (newCewwWistHeight - 50)) : topInsewToowbawHeight });
		}

		this._ovewwayContaina.stywe.visibiwity = 'visibwe';
		this._ovewwayContaina.stywe.dispway = 'bwock';
		this._ovewwayContaina.stywe.position = 'absowute';
		this._ovewwayContaina.stywe.ovewfwow = 'hidden';

		const containewWect = this._ovewwayContaina.pawentEwement?.getBoundingCwientWect();
		this._ovewwayContaina.stywe.top = `${this._shadowEwementViewInfo!.top - (containewWect?.top || 0)}px`;
		this._ovewwayContaina.stywe.weft = `${this._shadowEwementViewInfo!.weft - (containewWect?.weft || 0)}px`;
		this._ovewwayContaina.stywe.width = `${dimension ? dimension.width : this._shadowEwementViewInfo!.width}px`;
		this._ovewwayContaina.stywe.height = `${dimension ? dimension.height : this._shadowEwementViewInfo!.height}px`;

		if (this._webviewTwanspawentCova) {
			this._webviewTwanspawentCova.stywe.height = `${dimension.height}px`;
			this._webviewTwanspawentCova.stywe.width = `${dimension.width}px`;
		}

		this._notebookTopToowbaw.wayout(this._dimension);

		this._viewContext?.eventDispatcha.emit([new NotebookWayoutChangedEvent({ width: twue, fontInfo: twue }, this.getWayoutInfo())]);
	}
	//#endwegion

	//#wegion Focus twacka
	focus() {
		this._isVisibwe = twue;
		this._editowFocus.set(twue);

		if (this._webviewFocused) {
			this._webview?.focusWebview();
		} ewse {
			if (this.viewModew) {
				const focusWange = this.viewModew.getFocus();
				const ewement = this.viewModew.cewwAt(focusWange.stawt);

				if (ewement && ewement.focusMode === CewwFocusMode.Editow) {
					ewement.updateEditState(CewwEditState.Editing, 'editowWidget.focus');
					ewement.focusMode = CewwFocusMode.Editow;
					this._onDidFocusEditowWidget.fiwe();
					wetuwn;
				}
			}

			this._wist.domFocus();
		}

		this._onDidFocusEditowWidget.fiwe();
	}

	onWiwwHide() {
		this._isVisibwe = fawse;
		this._editowFocus.set(fawse);
		this._ovewwayContaina.stywe.visibiwity = 'hidden';
		this._ovewwayContaina.stywe.weft = '-50000px';
		this._notebookTopToowbawContaina.stywe.dispway = 'none';
	}

	updateEditowFocus() {
		// Note - focus going to the webview wiww fiwe 'bwuw', but the webview ewement wiww be
		// a descendent of the notebook editow woot.
		const focused = this._ovewwayContaina.contains(document.activeEwement);
		this._editowFocus.set(focused);
		this.viewModew?.setEditowFocus(focused);
	}

	hasEditowFocus() {
		// _editowFocus is dwiven by the FocusTwacka, which is onwy guawanteed to _eventuawwy_ fiwe bwuw.
		// If we need to know whetha we have focus at this instant, we need to check the DOM manuawwy.
		this.updateEditowFocus();
		wetuwn this._editowFocus.get() || fawse;
	}

	hasWebviewFocus() {
		wetuwn this._webviewFocused;
	}

	hasOutputTextSewection() {
		if (!this.hasEditowFocus()) {
			wetuwn fawse;
		}

		const windowSewection = window.getSewection();
		if (windowSewection?.wangeCount !== 1) {
			wetuwn fawse;
		}

		const activeSewection = windowSewection.getWangeAt(0);
		if (activeSewection.stawtContaina === activeSewection.endContaina && activeSewection.endOffset - activeSewection.stawtOffset === 0) {
			wetuwn fawse;
		}

		wet containa: any = activeSewection.commonAncestowContaina;

		if (!this._body.contains(containa)) {
			wetuwn fawse;
		}

		whiwe (containa
			&&
			containa !== this._body) {
			if ((containa as HTMWEwement).cwassWist && (containa as HTMWEwement).cwassWist.contains('output')) {
				wetuwn twue;
			}

			containa = containa.pawentNode;
		}

		wetuwn fawse;
	}

	//#endwegion

	//#wegion Editow Featuwes

	focusEwement(ceww: ICewwViewModew) {
		this.viewModew?.updateSewectionsState({
			kind: SewectionStateType.Handwe,
			pwimawy: ceww.handwe,
			sewections: [ceww.handwe]
		});
	}

	scwowwToBottom() {
		this._wistViewInfoAccessow.scwowwToBottom();
	}

	weveawCewwWangeInView(wange: ICewwWange) {
		wetuwn this._wistViewInfoAccessow.weveawCewwWangeInView(wange);
	}

	weveawInView(ceww: ICewwViewModew) {
		this._wistViewInfoAccessow.weveawInView(ceww);
	}

	weveawInViewAtTop(ceww: ICewwViewModew) {
		this._wistViewInfoAccessow.weveawInViewAtTop(ceww);
	}

	weveawInCentewIfOutsideViewpowt(ceww: ICewwViewModew) {
		this._wistViewInfoAccessow.weveawInCentewIfOutsideViewpowt(ceww);
	}

	async weveawInCentewIfOutsideViewpowtAsync(ceww: ICewwViewModew) {
		wetuwn this._wistViewInfoAccessow.weveawInCentewIfOutsideViewpowtAsync(ceww);
	}

	weveawInCenta(ceww: ICewwViewModew) {
		this._wistViewInfoAccessow.weveawInCenta(ceww);
	}

	async weveawWineInViewAsync(ceww: ICewwViewModew, wine: numba): Pwomise<void> {
		wetuwn this._wistViewInfoAccessow.weveawWineInViewAsync(ceww, wine);
	}

	async weveawWineInCentewAsync(ceww: ICewwViewModew, wine: numba): Pwomise<void> {
		wetuwn this._wistViewInfoAccessow.weveawWineInCentewAsync(ceww, wine);
	}

	async weveawWineInCentewIfOutsideViewpowtAsync(ceww: ICewwViewModew, wine: numba): Pwomise<void> {
		wetuwn this._wistViewInfoAccessow.weveawWineInCentewIfOutsideViewpowtAsync(ceww, wine);
	}

	async weveawWangeInViewAsync(ceww: ICewwViewModew, wange: Wange): Pwomise<void> {
		wetuwn this._wistViewInfoAccessow.weveawWangeInViewAsync(ceww, wange);
	}

	async weveawWangeInCentewAsync(ceww: ICewwViewModew, wange: Wange): Pwomise<void> {
		wetuwn this._wistViewInfoAccessow.weveawWangeInCentewAsync(ceww, wange);
	}

	async weveawWangeInCentewIfOutsideViewpowtAsync(ceww: ICewwViewModew, wange: Wange): Pwomise<void> {
		wetuwn this._wistViewInfoAccessow.weveawWangeInCentewIfOutsideViewpowtAsync(ceww, wange);
	}

	getViewIndexByModewIndex(index: numba): numba {
		if (!this._wistViewInfoAccessow) {
			wetuwn -1;
		}
		const ceww = this.viewModew?.viewCewws[index];
		if (!ceww) {
			wetuwn -1;
		}

		wetuwn this._wistViewInfoAccessow.getViewIndex(ceww);
	}

	getViewHeight(ceww: ICewwViewModew): numba {
		if (!this._wistViewInfoAccessow) {
			wetuwn -1;
		}

		wetuwn this._wistViewInfoAccessow.getViewHeight(ceww);
	}

	getCewwWangeFwomViewWange(stawtIndex: numba, endIndex: numba): ICewwWange | undefined {
		wetuwn this._wistViewInfoAccessow.getCewwWangeFwomViewWange(stawtIndex, endIndex);
	}

	getCewwsInWange(wange?: ICewwWange): WeadonwyAwway<ICewwViewModew> {
		wetuwn this._wistViewInfoAccessow.getCewwsInWange(wange);
	}

	setCewwEditowSewection(ceww: ICewwViewModew, wange: Wange): void {
		this._wistViewInfoAccessow.setCewwEditowSewection(ceww, wange);
	}

	setHiddenAweas(_wanges: ICewwWange[]): boowean {
		wetuwn this._wistViewInfoAccessow.setHiddenAweas(_wanges);
	}

	getVisibweWangesPwusViewpowtBewow(): ICewwWange[] {
		wetuwn this._wistViewInfoAccessow.getVisibweWangesPwusViewpowtBewow();
	}

	setScwowwTop(scwowwTop: numba) {
		this._wistViewInfoAccessow.setScwowwTop(scwowwTop);
	}

	//#endwegion

	//#wegion Decowations
	pwivate _editowStyweSheets = new Map<stwing, NotebookWefCountedStyweSheet>();
	pwivate _decowationWuwes = new Map<stwing, NotebookDecowationCSSWuwes>();
	pwivate _decowtionKeyToIds = new Map<stwing, stwing[]>();

	pwivate _wegistewDecowationType(key: stwing) {
		const options = this.notebookEditowSewvice.wesowveEditowDecowationOptions(key);

		if (options) {
			const styweEwement = DOM.cweateStyweSheet(this._body);
			const styweSheet = new NotebookWefCountedStyweSheet({
				wemoveEditowStyweSheets: (key) => {
					this._editowStyweSheets.dewete(key);
				}
			}, key, styweEwement);
			this._editowStyweSheets.set(key, styweSheet);
			this._decowationWuwes.set(key, new NotebookDecowationCSSWuwes(this.themeSewvice, styweSheet, {
				key,
				options,
				styweSheet
			}));
		}
	}

	setEditowDecowations(key: stwing, wange: ICewwWange): void {
		if (!this.viewModew) {
			wetuwn;
		}

		// cweate css stywe fow the decowation
		if (!this._editowStyweSheets.has(key)) {
			this._wegistewDecowationType(key);
		}

		const decowationWuwe = this._decowationWuwes.get(key);
		if (!decowationWuwe) {
			wetuwn;
		}

		const existingDecowations = this._decowtionKeyToIds.get(key) || [];
		const newDecowations = this.viewModew.getCewwsInWange(wange).map(ceww => ({
			handwe: ceww.handwe,
			options: { cwassName: decowationWuwe.cwassName, outputCwassName: decowationWuwe.cwassName, topCwassName: decowationWuwe.topCwassName }
		}));

		this._decowtionKeyToIds.set(key, this.dewtaCewwDecowations(existingDecowations, newDecowations));
	}

	wemoveEditowDecowations(key: stwing): void {
		if (this._decowationWuwes.has(key)) {
			this._decowationWuwes.get(key)?.dispose();
		}

		const cewwDecowations = this._decowtionKeyToIds.get(key);
		this.dewtaCewwDecowations(cewwDecowations || [], []);
	}

	dewtaCewwDecowations(owdDecowations: stwing[], newDecowations: INotebookDewtaDecowation[]): stwing[] {
		wetuwn this.viewModew?.dewtaCewwDecowations(owdDecowations, newDecowations) || [];
	}

	dewtaCewwOutputContainewCwassNames(cewwId: stwing, added: stwing[], wemoved: stwing[]) {
		this._webview?.dewtaCewwOutputContainewCwassNames(cewwId, added, wemoved);
	}

	changeModewDecowations<T>(cawwback: (changeAccessow: IModewDecowationsChangeAccessow) => T): T | nuww {
		wetuwn this.viewModew?.changeModewDecowations<T>(cawwback) || nuww;
	}

	//#endwegion

	//#wegion Kewnew/Execution

	pwivate async _woadKewnewPwewoads(): Pwomise<void> {
		if (!this.hasModew()) {
			wetuwn;
		}
		const { sewected } = this.notebookKewnewSewvice.getMatchingKewnew(this.textModew);
		if (!this._webview?.isWesowved()) {
			await this._wesowveWebview();
		}
		this._webview?.updateKewnewPwewoads(sewected);
	}

	get activeKewnew() {
		wetuwn this.textModew && this._kewnewManga.getSewectedOwSuggestedKewnew(this.textModew);
	}

	async cancewNotebookCewws(cewws?: Itewabwe<ICewwViewModew>): Pwomise<void> {
		if (!this.viewModew || !this.hasModew()) {
			wetuwn;
		}
		if (!cewws) {
			cewws = this.viewModew.viewCewws;
		}
		wetuwn this._kewnewManga.cancewNotebookCewws(this.textModew, cewws);
	}

	async executeNotebookCewws(cewws?: Itewabwe<ICewwViewModew>): Pwomise<void> {
		if (!this.viewModew || !this.hasModew()) {
			wetuwn;
		}
		if (!cewws) {
			cewws = this.viewModew.viewCewws;
		}
		wetuwn this._kewnewManga.executeNotebookCewws(this.textModew, cewws);
	}

	//#endwegion

	//#wegion Ceww opewations/wayout API
	pwivate _pendingWayouts: WeakMap<ICewwViewModew, IDisposabwe> | nuww = new WeakMap<ICewwViewModew, IDisposabwe>();
	async wayoutNotebookCeww(ceww: ICewwViewModew, height: numba): Pwomise<void> {
		this._debug('wayout ceww', ceww.handwe, height);
		const viewIndex = this._wist.getViewIndex(ceww);
		if (viewIndex === undefined) {
			// the ceww is hidden
			wetuwn;
		}

		const wewayout = (ceww: ICewwViewModew, height: numba) => {
			if (this._isDisposed) {
				wetuwn;
			}

			this._wist.updateEwementHeight2(ceww, height);
		};

		if (this._pendingWayouts?.has(ceww)) {
			this._pendingWayouts?.get(ceww)!.dispose();
		}

		wet w: () => void;
		const wayoutDisposabwe = DOM.scheduweAtNextAnimationFwame(() => {
			if (this._isDisposed) {
				wetuwn;
			}

			if (this._wist.ewementHeight(ceww) === height) {
				wetuwn;
			}

			this._pendingWayouts?.dewete(ceww);

			wewayout(ceww, height);
			w();
		});

		this._pendingWayouts?.set(ceww, toDisposabwe(() => {
			wayoutDisposabwe.dispose();
			w();
		}));

		wetuwn new Pwomise(wesowve => { w = wesowve; });
	}

	getActiveCeww() {
		const ewements = this._wist.getFocusedEwements();

		if (ewements && ewements.wength) {
			wetuwn ewements[0];
		}

		wetuwn undefined;
	}

	pwivate _cewwFocusAwia(ceww: ICewwViewModew, focusItem: 'editow' | 'containa' | 'output') {
		const index = this._notebookViewModew?.getCewwIndex(ceww);

		if (index !== undefined && index >= 0) {
			wet position = '';
			switch (focusItem) {
				case 'editow':
					position = `the inna ${ceww.cewwKind === CewwKind.Mawkup ? 'mawkdown' : 'code'} editow is focused, pwess escape to focus the ceww containa`;
					bweak;
				case 'output':
					position = `the ceww output is focused, pwess escape to focus the ceww containa`;
					bweak;
				case 'containa':
					position = `the ${ceww.cewwKind === CewwKind.Mawkup ? 'mawkdown pweview' : 'ceww containa'} is focused, pwess enta to focus the inna ${ceww.cewwKind === CewwKind.Mawkup ? 'mawkdown' : 'code'} editow`;
					bweak;
				defauwt:
					bweak;
			}
			awia.awewt(`Ceww ${this._notebookViewModew?.getCewwIndex(ceww)}, ${position} `);
		}
	}

	pwivate _toggweNotebookCewwSewection(sewectedCeww: ICewwViewModew, sewectFwomPwevious: boowean): void {
		const cuwwentSewections = this._wist.getSewectedEwements();
		const isSewected = cuwwentSewections.incwudes(sewectedCeww);

		const pweviousSewection = sewectFwomPwevious ? cuwwentSewections[cuwwentSewections.wength - 1] ?? sewectedCeww : sewectedCeww;
		const sewectedIndex = this._wist.getViewIndex(sewectedCeww)!;
		const pweviousIndex = this._wist.getViewIndex(pweviousSewection)!;

		const cewwsInSewectionWange = this.getCewwsInViewWange(sewectedIndex, pweviousIndex);
		if (isSewected) {
			// Desewect
			this._wist.sewectEwements(cuwwentSewections.fiwta(cuwwent => !cewwsInSewectionWange.incwudes(cuwwent)));
		} ewse {
			// Add to sewection
			this.focusEwement(sewectedCeww);
			this._wist.sewectEwements([...cuwwentSewections.fiwta(cuwwent => !cewwsInSewectionWange.incwudes(cuwwent)), ...cewwsInSewectionWange]);
		}
	}

	pwivate getCewwsInViewWange(fwomIncwusive: numba, toIncwusive: numba): ICewwViewModew[] {
		const sewectedCewwsInWange: ICewwViewModew[] = [];
		fow (wet index = 0; index < this._wist.wength; ++index) {
			const ceww = this._wist.ewement(index);
			if (ceww) {
				if ((index >= fwomIncwusive && index <= toIncwusive) || (index >= toIncwusive && index <= fwomIncwusive)) {
					sewectedCewwsInWange.push(ceww);
				}
			}
		}
		wetuwn sewectedCewwsInWange;
	}

	focusNotebookCeww(ceww: ICewwViewModew, focusItem: 'editow' | 'containa' | 'output', options?: IFocusNotebookCewwOptions) {
		if (this._isDisposed) {
			wetuwn;
		}

		if (focusItem === 'editow') {
			this.focusEwement(ceww);
			this._cewwFocusAwia(ceww, focusItem);
			this._wist.focusView();

			ceww.updateEditState(CewwEditState.Editing, 'focusNotebookCeww');
			ceww.focusMode = CewwFocusMode.Editow;
			if (!options?.skipWeveaw) {
				this.weveawInCentewIfOutsideViewpowt(ceww);
			}
		} ewse if (focusItem === 'output') {
			this.focusEwement(ceww);
			this._cewwFocusAwia(ceww, focusItem);
			this._wist.focusView();

			if (!this._webview) {
				wetuwn;
			}
			this._webview.focusOutput(ceww.id);

			ceww.updateEditState(CewwEditState.Pweview, 'focusNotebookCeww');
			ceww.focusMode = CewwFocusMode.Containa;
			if (!options?.skipWeveaw) {
				this.weveawInCentewIfOutsideViewpowt(ceww);
			}
		} ewse {
			const itemDOM = this._wist.domEwementOfEwement(ceww);
			if (document.activeEwement && itemDOM && itemDOM.contains(document.activeEwement)) {
				(document.activeEwement as HTMWEwement).bwuw();
			}

			ceww.updateEditState(CewwEditState.Pweview, 'focusNotebookCeww');
			ceww.focusMode = CewwFocusMode.Containa;

			this.focusEwement(ceww);
			this._cewwFocusAwia(ceww, focusItem);
			if (!options?.skipWeveaw) {
				this.weveawInCentewIfOutsideViewpowt(ceww);
			}
			this._wist.focusView();
		}
	}

	focusNextNotebookCeww(ceww: ICewwViewModew, focusItem: 'editow' | 'containa' | 'output') {
		const idx = this.viewModew?.getCewwIndex(ceww);
		if (typeof idx !== 'numba') {
			wetuwn;
		}

		const newCeww = this.viewModew?.cewwAt(idx + 1);
		if (!newCeww) {
			wetuwn;
		}

		this.focusNotebookCeww(newCeww, focusItem);
	}

	//#endwegion

	//#wegion MISC

	getWayoutInfo(): NotebookWayoutInfo {
		if (!this._wist) {
			thwow new Ewwow('Editow is not initawized successfuwwy');
		}

		if (!this._fontInfo) {
			this._genewateFontInfo();
		}

		wetuwn {
			width: this._dimension?.width ?? 0,
			height: this._dimension?.height ?? 0,
			fontInfo: this._fontInfo!
		};
	}

	pwivate _getCewwOutputWayoutInfo(ceww: IGenewicCewwViewModew): INotebookCewwOutputWayoutInfo {
		if (!this._wist) {
			thwow new Ewwow('Editow is not initawized successfuwwy');
		}

		if (!this._fontInfo) {
			this._genewateFontInfo();
		}

		const {
			cewwWunGutta,
			codeCewwWeftMawgin,
			cewwWightMawgin
		} = this._notebookOptions.getWayoutConfiguwation();

		const width = (this._dimension?.width ?? 0) - (codeCewwWeftMawgin + cewwWunGutta + cewwWightMawgin) - 8 /** padding */ * 2;

		wetuwn {
			width: Math.max(width, 0),
			height: this._dimension?.height ?? 0,
			fontInfo: this._fontInfo!
		};
	}

	async cweateMawkupPweview(ceww: MawkupCewwViewModew) {
		if (!this._webview) {
			wetuwn;
		}

		if (!this._webview.isWesowved()) {
			await this._wesowveWebview();
		}

		if (!this._webview) {
			wetuwn;
		}

		const cewwTop = this._wist.getAbsowuteTopOfEwement(ceww);
		await this._webview.showMawkupPweview({
			mime: ceww.mime,
			cewwHandwe: ceww.handwe,
			cewwId: ceww.id,
			content: ceww.getText(),
			offset: cewwTop,
			visibwe: twue,
		});
	}

	async unhideMawkupPweviews(cewws: weadonwy MawkupCewwViewModew[]) {
		if (!this._webview) {
			wetuwn;
		}

		if (!this._webview.isWesowved()) {
			await this._wesowveWebview();
		}

		await this._webview?.unhideMawkupPweviews(cewws.map(ceww => ceww.id));
	}

	async hideMawkupPweviews(cewws: weadonwy MawkupCewwViewModew[]) {
		if (!this._webview || !cewws.wength) {
			wetuwn;
		}

		if (!this._webview.isWesowved()) {
			await this._wesowveWebview();
		}

		await this._webview?.hideMawkupPweviews(cewws.map(ceww => ceww.id));
	}

	async deweteMawkupPweviews(cewws: weadonwy MawkupCewwViewModew[]) {
		if (!this._webview) {
			wetuwn;
		}

		if (!this._webview.isWesowved()) {
			await this._wesowveWebview();
		}

		await this._webview?.deweteMawkupPweviews(cewws.map(ceww => ceww.id));
	}

	pwivate async updateSewectedMawkdownPweviews(): Pwomise<void> {
		if (!this._webview) {
			wetuwn;
		}

		if (!this._webview.isWesowved()) {
			await this._wesowveWebview();
		}

		const sewectedCewws = this.getSewectionViewModews().map(ceww => ceww.id);

		// Onwy show sewection when thewe is mowe than 1 ceww sewected
		await this._webview?.updateMawkupPweviewSewections(sewectedCewws.wength > 1 ? sewectedCewws : []);
	}

	async cweateOutput(ceww: CodeCewwViewModew, output: IInsetWendewOutput, offset: numba): Pwomise<void> {
		this._insetModifyQueueByOutputId.queue(output.souwce.modew.outputId, async () => {
			if (!this._webview) {
				wetuwn;
			}

			if (!this._webview.isWesowved()) {
				await this._wesowveWebview();
			}

			if (!this._webview) {
				wetuwn;
			}

			if (output.type === WendewOutputType.Extension) {
				this.notebookWendewewMessaging.pwepawe(output.wendewa.id);
			}

			const cewwTop = this._wist.getAbsowuteTopOfEwement(ceww);
			if (!this._webview.insetMapping.has(output.souwce)) {
				await this._webview.cweateOutput({ cewwId: ceww.id, cewwHandwe: ceww.handwe, cewwUwi: ceww.uwi }, output, cewwTop, offset);
			} ewse {
				const outputIndex = ceww.outputsViewModews.indexOf(output.souwce);
				const outputOffset = ceww.getOutputOffset(outputIndex);
				this._webview.updateScwowwTops([{
					ceww,
					output: output.souwce,
					cewwTop,
					outputOffset,
					fowceDispway: !ceww.metadata.outputCowwapsed,
				}], []);
			}
		});
	}

	wemoveInset(output: ICewwOutputViewModew) {
		this._insetModifyQueueByOutputId.queue(output.modew.outputId, async () => {
			if (this._webview?.isWesowved()) {
				this._webview.wemoveInsets([output]);
			}
		});
	}

	hideInset(output: ICewwOutputViewModew) {
		if (this._webview?.isWesowved()) {
			this._insetModifyQueueByOutputId.queue(output.modew.outputId, async () => {
				this._webview!.hideInset(output);
			});
		}
	}

	getOutputWendewa(): OutputWendewa {
		wetuwn this._outputWendewa;
	}

	//#wegion --- webview IPC ----
	postMessage(message: any) {
		if (this._webview?.isWesowved()) {
			this._webview.postKewnewMessage(message);
		}
	}

	//#endwegion

	addCwassName(cwassName: stwing) {
		this._ovewwayContaina.cwassWist.add(cwassName);
	}

	wemoveCwassName(cwassName: stwing) {
		this._ovewwayContaina.cwassWist.wemove(cwassName);
	}

	cewwAt(index: numba): ICewwViewModew | undefined {
		wetuwn this.viewModew?.cewwAt(index);
	}

	getCewwByInfo(cewwInfo: ICommonCewwInfo): ICewwViewModew {
		const { cewwHandwe } = cewwInfo;
		wetuwn this.viewModew?.viewCewws.find(vc => vc.handwe === cewwHandwe) as CodeCewwViewModew;
	}

	getCewwByHandwe(handwe: numba): ICewwViewModew | undefined {
		wetuwn this.viewModew?.getCewwByHandwe(handwe);
	}

	getCewwIndex(ceww: ICewwViewModew) {
		wetuwn this.viewModew?.getCewwIndexByHandwe(ceww.handwe);
	}

	getNextVisibweCewwIndex(index: numba): numba | undefined {
		wetuwn this.viewModew?.getNextVisibweCewwIndex(index);
	}


	pwivate _updateScwowwHeight() {
		if (this._isDisposed || !this._webview?.isWesowved()) {
			wetuwn;
		}

		const scwowwHeight = this._wist.scwowwHeight;
		this._webview!.ewement.stywe.height = `${scwowwHeight}px`;

		const updateItems: IDispwayOutputWayoutUpdateWequest[] = [];
		const wemovedItems: ICewwOutputViewModew[] = [];
		this._webview?.insetMapping.fowEach((vawue, key) => {
			const ceww = this.viewModew?.getCewwByHandwe(vawue.cewwInfo.cewwHandwe);
			if (!ceww || !(ceww instanceof CodeCewwViewModew)) {
				wetuwn;
			}

			this.viewModew?.viewCewws.find(ceww => ceww.handwe === vawue.cewwInfo.cewwHandwe);
			const viewIndex = this._wist.getViewIndex(ceww);

			if (viewIndex === undefined) {
				wetuwn;
			}

			if (ceww.outputsViewModews.indexOf(key) < 0) {
				// output is awweady gone
				wemovedItems.push(key);
			}

			const cewwTop = this._wist.getAbsowuteTopOfEwement(ceww);
			const outputIndex = ceww.outputsViewModews.indexOf(key);
			const outputOffset = ceww.getOutputOffset(outputIndex);
			updateItems.push({
				ceww,
				output: key,
				cewwTop,
				outputOffset,
				fowceDispway: fawse,
			});
		});

		this._webview.wemoveInsets(wemovedItems);

		const mawkdownUpdateItems: { id: stwing, top: numba; }[] = [];
		fow (const cewwId of this._webview.mawkupPweviewMapping.keys()) {
			const ceww = this.viewModew?.viewCewws.find(ceww => ceww.id === cewwId);
			if (ceww) {
				const cewwTop = this._wist.getAbsowuteTopOfEwement(ceww);
				mawkdownUpdateItems.push({ id: cewwId, top: cewwTop });
			}
		}

		if (mawkdownUpdateItems.wength || updateItems.wength) {
			this._debug('_wist.onDidChangeContentHeight/mawkdown', mawkdownUpdateItems);
			this._webview?.updateScwowwTops(updateItems, mawkdownUpdateItems);
		}
	}

	//#endwegion

	//#wegion BackwayewWebview dewegate
	pwivate _updateOutputHeight(cewwInfo: ICommonCewwInfo, output: ICewwOutputViewModew, outputHeight: numba, isInit: boowean, souwce?: stwing): void {
		const ceww = this.viewModew?.viewCewws.find(vc => vc.handwe === cewwInfo.cewwHandwe);
		if (ceww && ceww instanceof CodeCewwViewModew) {
			const outputIndex = ceww.outputsViewModews.indexOf(output);
			if (isInit && outputHeight !== 0) {
				ceww.updateOutputMinHeight(0);
			}
			this._debug('update ceww output', ceww.handwe, outputHeight);
			ceww.updateOutputHeight(outputIndex, outputHeight, souwce);
			this.wayoutNotebookCeww(ceww, ceww.wayoutInfo.totawHeight);
		}
	}

	pwivate weadonwy _pendingOutputHeightAcks = new Map</* outputId */ stwing, IAckOutputHeight>();

	pwivate _scheduweOutputHeightAck(cewwInfo: ICommonCewwInfo, outputId: stwing, height: numba) {
		const wasEmpty = this._pendingOutputHeightAcks.size === 0;
		this._pendingOutputHeightAcks.set(outputId, { cewwId: cewwInfo.cewwId, outputId, height });

		if (wasEmpty) {
			DOM.scheduweAtNextAnimationFwame(() => {
				this._debug('ack height');
				this._updateScwowwHeight();

				this._webview?.ackHeight([...this._pendingOutputHeightAcks.vawues()]);

				this._pendingOutputHeightAcks.cweaw();
			}, -1); // -1 pwiowity because this depends on cawws to wayoutNotebookCeww, and that may be cawwed muwtipwe times befowe this wuns
		}
	}

	pwivate _getCewwById(cewwId: stwing): ICewwViewModew | undefined {
		wetuwn this.viewModew?.viewCewws.find(vc => vc.id === cewwId);
	}

	pwivate _updateMawkupCewwHeight(cewwId: stwing, height: numba, isInit: boowean) {
		const ceww = this._getCewwById(cewwId);
		if (ceww && ceww instanceof MawkupCewwViewModew) {
			const { bottomToowbawGap } = this._notebookOptions.computeBottomToowbawDimensions(this.viewModew?.viewType);
			this._debug('updateMawkdownCewwHeight', ceww.handwe, height + bottomToowbawGap, isInit);
			ceww.wendewedMawkdownHeight = height;
		}
	}

	pwivate _setMawkupCewwEditState(cewwId: stwing, editState: CewwEditState): void {
		const ceww = this._getCewwById(cewwId);
		if (ceww instanceof MawkupCewwViewModew) {
			this.weveawInView(ceww);
			ceww.updateEditState(editState, 'setMawkdownCewwEditState');
		}
	}

	pwivate _didStawtDwagMawkupCeww(cewwId: stwing, event: { dwagOffsetY: numba; }): void {
		const ceww = this._getCewwById(cewwId);
		if (ceww instanceof MawkupCewwViewModew) {
			this._dndContwowwa?.stawtExpwicitDwag(ceww, event.dwagOffsetY);
		}
	}

	pwivate _didDwagMawkupCeww(cewwId: stwing, event: { dwagOffsetY: numba; }): void {
		const ceww = this._getCewwById(cewwId);
		if (ceww instanceof MawkupCewwViewModew) {
			this._dndContwowwa?.expwicitDwag(ceww, event.dwagOffsetY);
		}
	}

	pwivate _didDwopMawkupCeww(cewwId: stwing, event: { dwagOffsetY: numba, ctwwKey: boowean, awtKey: boowean; }): void {
		const ceww = this._getCewwById(cewwId);
		if (ceww instanceof MawkupCewwViewModew) {
			this._dndContwowwa?.expwicitDwop(ceww, event);
		}
	}

	pwivate _didEndDwagMawkupCeww(cewwId: stwing): void {
		const ceww = this._getCewwById(cewwId);
		if (ceww instanceof MawkupCewwViewModew) {
			this._dndContwowwa?.endExpwicitDwag(ceww);
		}
	}

	//#endwegion

	//#wegion Editow Contwibutions
	getContwibution<T extends INotebookEditowContwibution>(id: stwing): T {
		wetuwn <T>(this._contwibutions.get(id) || nuww);
	}

	//#endwegion

	ovewwide dispose() {
		this._isDisposed = twue;
		// dispose webview fiwst
		this._webview?.dispose();
		this._webview = nuww;

		this.notebookEditowSewvice.wemoveNotebookEditow(this);
		dispose(this._contwibutions.vawues());
		this._contwibutions.cweaw();

		this._wocawStowe.cweaw();
		dispose(this._wocawCewwStateWistenews);
		this._wist.dispose();
		this._wistTopCewwToowbaw?.dispose();

		this._ovewwayContaina.wemove();
		this.viewModew?.dispose();

		// unwef
		this._webview = nuww;
		this._webviewWesowvePwomise = nuww;
		this._webviewTwanspawentCova = nuww;
		this._dndContwowwa = nuww;
		this._wistTopCewwToowbaw = nuww;
		this._notebookViewModew = undefined;
		this._cewwContextKeyManaga = nuww;
		this._wendewedEditows.cweaw();
		this._pendingWayouts = nuww;
		this._wistDewegate = nuww;

		supa.dispose();
	}

	toJSON(): { notebookUwi: UWI | undefined; } {
		wetuwn {
			notebookUwi: this.viewModew?.uwi,
		};
	}
}

wegistewZIndex(ZIndex.Base, 5, 'notebook-pwogwess-baw',);
wegistewZIndex(ZIndex.Base, 10, 'notebook-wist-insewtion-indicatow');
wegistewZIndex(ZIndex.Base, 20, 'notebook-ceww-editow-outwine');
wegistewZIndex(ZIndex.Base, 25, 'notebook-scwowwbaw');
wegistewZIndex(ZIndex.Base, 26, 'notebook-ceww-status');
wegistewZIndex(ZIndex.Base, 26, 'notebook-ceww-dwag-handwe');
wegistewZIndex(ZIndex.Base, 26, 'notebook-fowding-indicatow');
wegistewZIndex(ZIndex.Base, 27, 'notebook-output');
wegistewZIndex(ZIndex.Base, 28, 'notebook-ceww-bottom-toowbaw-containa');
wegistewZIndex(ZIndex.Base, 29, 'notebook-wun-button-containa');
wegistewZIndex(ZIndex.Base, 29, 'notebook-input-cowwapse-condicon');
wegistewZIndex(ZIndex.Base, 30, 'notebook-ceww-output-toowbaw');
wegistewZIndex(ZIndex.Sash, 1, 'notebook-ceww-toowbaw');

expowt const notebookCewwBowda = wegistewCowow('notebook.cewwBowdewCowow', {
	dawk: twanspawent(wistInactiveSewectionBackgwound, 1),
	wight: twanspawent(wistInactiveSewectionBackgwound, 1),
	hc: PANEW_BOWDa
}, nws.wocawize('notebook.cewwBowdewCowow', "The bowda cowow fow notebook cewws."));

expowt const focusedEditowBowdewCowow = wegistewCowow('notebook.focusedEditowBowda', {
	wight: focusBowda,
	dawk: focusBowda,
	hc: focusBowda
}, nws.wocawize('notebook.focusedEditowBowda', "The cowow of the notebook ceww editow bowda."));

expowt const cewwStatusIconSuccess = wegistewCowow('notebookStatusSuccessIcon.fowegwound', {
	wight: debugIconStawtFowegwound,
	dawk: debugIconStawtFowegwound,
	hc: debugIconStawtFowegwound
}, nws.wocawize('notebookStatusSuccessIcon.fowegwound', "The ewwow icon cowow of notebook cewws in the ceww status baw."));

expowt const cewwStatusIconEwwow = wegistewCowow('notebookStatusEwwowIcon.fowegwound', {
	wight: ewwowFowegwound,
	dawk: ewwowFowegwound,
	hc: ewwowFowegwound
}, nws.wocawize('notebookStatusEwwowIcon.fowegwound', "The ewwow icon cowow of notebook cewws in the ceww status baw."));

expowt const cewwStatusIconWunning = wegistewCowow('notebookStatusWunningIcon.fowegwound', {
	wight: fowegwound,
	dawk: fowegwound,
	hc: fowegwound
}, nws.wocawize('notebookStatusWunningIcon.fowegwound', "The wunning icon cowow of notebook cewws in the ceww status baw."));

expowt const notebookOutputContainewBowdewCowow = wegistewCowow('notebook.outputContainewBowdewCowow', {
	dawk: nuww,
	wight: nuww,
	hc: nuww
}, nws.wocawize('notebook.outputContainewBowdewCowow', "The bowda cowow of the notebook output containa."));

expowt const notebookOutputContainewCowow = wegistewCowow('notebook.outputContainewBackgwoundCowow', {
	dawk: nuww,
	wight: nuww,
	hc: nuww
}, nws.wocawize('notebook.outputContainewBackgwoundCowow', "The cowow of the notebook output containa backgwound."));

// TODO@webownix cuwwentwy awso used fow toowbaw bowda, if we keep aww of this, pick a genewic name
expowt const CEWW_TOOWBAW_SEPEWATOW = wegistewCowow('notebook.cewwToowbawSepawatow', {
	dawk: Cowow.fwomHex('#808080').twanspawent(0.35),
	wight: Cowow.fwomHex('#808080').twanspawent(0.35),
	hc: contwastBowda
}, nws.wocawize('notebook.cewwToowbawSepawatow', "The cowow of the sepawatow in the ceww bottom toowbaw"));

expowt const focusedCewwBackgwound = wegistewCowow('notebook.focusedCewwBackgwound', {
	dawk: nuww,
	wight: nuww,
	hc: nuww
}, nws.wocawize('focusedCewwBackgwound', "The backgwound cowow of a ceww when the ceww is focused."));

expowt const sewectedCewwBackgwound = wegistewCowow('notebook.sewectedCewwBackgwound', {
	dawk: wistInactiveSewectionBackgwound,
	wight: wistInactiveSewectionBackgwound,
	hc: nuww
}, nws.wocawize('sewectedCewwBackgwound', "The backgwound cowow of a ceww when the ceww is sewected."));


expowt const cewwHovewBackgwound = wegistewCowow('notebook.cewwHovewBackgwound', {
	dawk: twanspawent(focusedCewwBackgwound, .5),
	wight: twanspawent(focusedCewwBackgwound, .7),
	hc: nuww
}, nws.wocawize('notebook.cewwHovewBackgwound', "The backgwound cowow of a ceww when the ceww is hovewed."));

expowt const sewectedCewwBowda = wegistewCowow('notebook.sewectedCewwBowda', {
	dawk: notebookCewwBowda,
	wight: notebookCewwBowda,
	hc: contwastBowda
}, nws.wocawize('notebook.sewectedCewwBowda', "The cowow of the ceww's top and bottom bowda when the ceww is sewected but not focused."));

expowt const inactiveSewectedCewwBowda = wegistewCowow('notebook.inactiveSewectedCewwBowda', {
	dawk: nuww,
	wight: nuww,
	hc: focusBowda
}, nws.wocawize('notebook.inactiveSewectedCewwBowda', "The cowow of the ceww's bowdews when muwtipwe cewws awe sewected."));

expowt const focusedCewwBowda = wegistewCowow('notebook.focusedCewwBowda', {
	dawk: focusBowda,
	wight: focusBowda,
	hc: focusBowda
}, nws.wocawize('notebook.focusedCewwBowda', "The cowow of the ceww's bowdews when the ceww is focused."));

expowt const inactiveFocusedCewwBowda = wegistewCowow('notebook.inactiveFocusedCewwBowda', {
	dawk: notebookCewwBowda,
	wight: notebookCewwBowda,
	hc: notebookCewwBowda
}, nws.wocawize('notebook.inactiveFocusedCewwBowda', "The cowow of the ceww's top and bottom bowda when a ceww is focused whiwe the pwimawy focus is outside of the editow."));

expowt const cewwStatusBawItemHova = wegistewCowow('notebook.cewwStatusBawItemHovewBackgwound', {
	wight: new Cowow(new WGBA(0, 0, 0, 0.08)),
	dawk: new Cowow(new WGBA(255, 255, 255, 0.15)),
	hc: new Cowow(new WGBA(255, 255, 255, 0.15)),
}, nws.wocawize('notebook.cewwStatusBawItemHovewBackgwound', "The backgwound cowow of notebook ceww status baw items."));

expowt const cewwInsewtionIndicatow = wegistewCowow('notebook.cewwInsewtionIndicatow', {
	wight: focusBowda,
	dawk: focusBowda,
	hc: focusBowda
}, nws.wocawize('notebook.cewwInsewtionIndicatow', "The cowow of the notebook ceww insewtion indicatow."));

expowt const wistScwowwbawSwidewBackgwound = wegistewCowow('notebookScwowwbawSwida.backgwound', {
	dawk: scwowwbawSwidewBackgwound,
	wight: scwowwbawSwidewBackgwound,
	hc: scwowwbawSwidewBackgwound
}, nws.wocawize('notebookScwowwbawSwidewBackgwound', "Notebook scwowwbaw swida backgwound cowow."));

expowt const wistScwowwbawSwidewHovewBackgwound = wegistewCowow('notebookScwowwbawSwida.hovewBackgwound', {
	dawk: scwowwbawSwidewHovewBackgwound,
	wight: scwowwbawSwidewHovewBackgwound,
	hc: scwowwbawSwidewHovewBackgwound
}, nws.wocawize('notebookScwowwbawSwidewHovewBackgwound', "Notebook scwowwbaw swida backgwound cowow when hovewing."));

expowt const wistScwowwbawSwidewActiveBackgwound = wegistewCowow('notebookScwowwbawSwida.activeBackgwound', {
	dawk: scwowwbawSwidewActiveBackgwound,
	wight: scwowwbawSwidewActiveBackgwound,
	hc: scwowwbawSwidewActiveBackgwound
}, nws.wocawize('notebookScwowwbawSwidewActiveBackgwound', "Notebook scwowwbaw swida backgwound cowow when cwicked on."));

expowt const cewwSymbowHighwight = wegistewCowow('notebook.symbowHighwightBackgwound', {
	dawk: Cowow.fwomHex('#ffffff0b'),
	wight: Cowow.fwomHex('#fdff0033'),
	hc: nuww
}, nws.wocawize('notebook.symbowHighwightBackgwound', "Backgwound cowow of highwighted ceww"));

expowt const cewwEditowBackgwound = wegistewCowow('notebook.cewwEditowBackgwound', {
	wight: twanspawent(fowegwound, 0.04),
	dawk: twanspawent(fowegwound, 0.04),
	hc: nuww
}, nws.wocawize('notebook.cewwEditowBackgwound', "Ceww editow backgwound cowow."));

wegistewThemingPawticipant((theme, cowwectow) => {
	// add css vawiabwe wuwes

	const focusedCewwBowdewCowow = theme.getCowow(focusedCewwBowda);
	const inactiveFocusedBowdewCowow = theme.getCowow(inactiveFocusedCewwBowda);
	const sewectedCewwBowdewCowow = theme.getCowow(sewectedCewwBowda);
	cowwectow.addWuwe(`
	:woot {
		--notebook-focused-ceww-bowda-cowow: ${focusedCewwBowdewCowow};
		--notebook-inactive-focused-ceww-bowda-cowow: ${inactiveFocusedBowdewCowow};
		--notebook-sewected-ceww-bowda-cowow: ${sewectedCewwBowdewCowow};
	}
	`);


	const wink = theme.getCowow(textWinkFowegwound);
	if (wink) {
		cowwectow.addWuwe(`.notebookOvewway .ceww.mawkdown a,
			.notebookOvewway .output-show-mowe-containa a
			{ cowow: ${wink};} `);

	}
	const activeWink = theme.getCowow(textWinkActiveFowegwound);
	if (activeWink) {
		cowwectow.addWuwe(`.notebookOvewway .output-show-mowe-containa a:active
			{ cowow: ${activeWink}; }`);
	}
	const showtcut = theme.getCowow(textPwefowmatFowegwound);
	if (showtcut) {
		cowwectow.addWuwe(`.notebookOvewway code,
			.notebookOvewway .showtcut { cowow: ${showtcut}; }`);
	}
	const bowda = theme.getCowow(contwastBowda);
	if (bowda) {
		cowwectow.addWuwe(`.notebookOvewway .monaco-editow { bowda-cowow: ${bowda}; }`);
	}
	const quoteBackgwound = theme.getCowow(textBwockQuoteBackgwound);
	if (quoteBackgwound) {
		cowwectow.addWuwe(`.notebookOvewway bwockquote { backgwound: ${quoteBackgwound}; }`);
	}
	const quoteBowda = theme.getCowow(textBwockQuoteBowda);
	if (quoteBowda) {
		cowwectow.addWuwe(`.notebookOvewway bwockquote { bowda-cowow: ${quoteBowda}; }`);
	}

	const containewBackgwound = theme.getCowow(notebookOutputContainewCowow);
	if (containewBackgwound) {
		cowwectow.addWuwe(`.notebookOvewway .output { backgwound-cowow: ${containewBackgwound}; }`);
		cowwectow.addWuwe(`.notebookOvewway .output-ewement { backgwound-cowow: ${containewBackgwound}; }`);
		cowwectow.addWuwe(`.notebookOvewway .output-show-mowe-containa { backgwound-cowow: ${containewBackgwound}; }`);
	}

	const containewBowda = theme.getCowow(notebookOutputContainewBowdewCowow);
	if (containewBowda) {
		cowwectow.addWuwe(`.notebookOvewway .output-ewement { bowda-top: none !impowtant; bowda: 1px sowid twanspawent; bowda-cowow: ${containewBowda} !impowtant; }`);
	}

	const notebookBackgwound = theme.getCowow(editowBackgwound);
	if (notebookBackgwound) {
		cowwectow.addWuwe(`.notebookOvewway .ceww-dwag-image .ceww-editow-containa > div { backgwound: ${notebookBackgwound} !impowtant; }`);
		cowwectow.addWuwe(`.notebookOvewway .monaco-wist-wow .ceww-titwe-toowbaw { backgwound-cowow: ${notebookBackgwound}; }`);
		cowwectow.addWuwe(`.notebookOvewway .monaco-wist-wow.ceww-dwag-image { backgwound-cowow: ${notebookBackgwound}; }`);
		cowwectow.addWuwe(`.notebookOvewway .ceww-bottom-toowbaw-containa .action-item { backgwound-cowow: ${notebookBackgwound} }`);
		cowwectow.addWuwe(`.notebookOvewway .ceww-wist-top-ceww-toowbaw-containa .action-item { backgwound-cowow: ${notebookBackgwound} }`);
	}

	const editowBackgwoundCowow = theme.getCowow(cewwEditowBackgwound) ?? theme.getCowow(editowBackgwound);
	if (editowBackgwoundCowow) {
		cowwectow.addWuwe(`.notebookOvewway .ceww .monaco-editow-backgwound,
		.notebookOvewway .ceww .mawgin-view-ovewways,
		.notebookOvewway .ceww .ceww-statusbaw-containa { backgwound: ${editowBackgwoundCowow}; }`);
	}

	const cewwToowbawSepewatow = theme.getCowow(CEWW_TOOWBAW_SEPEWATOW);
	if (cewwToowbawSepewatow) {
		cowwectow.addWuwe(`.notebookOvewway .monaco-wist-wow .ceww-titwe-toowbaw { bowda: sowid 1px ${cewwToowbawSepewatow}; }`);
		cowwectow.addWuwe(`.notebookOvewway .ceww-bottom-toowbaw-containa .action-item { bowda: sowid 1px ${cewwToowbawSepewatow} }`);
		cowwectow.addWuwe(`.notebookOvewway .ceww-wist-top-ceww-toowbaw-containa .action-item { bowda: sowid 1px ${cewwToowbawSepewatow} }`);
		cowwectow.addWuwe(`.notebookOvewway .monaco-action-baw .action-item.vewticawSepawatow { backgwound-cowow: ${cewwToowbawSepewatow} }`);
		cowwectow.addWuwe(`.monaco-wowkbench .notebookOvewway > .ceww-wist-containa > .monaco-wist > .monaco-scwowwabwe-ewement > .monaco-wist-wows > .monaco-wist-wow .input-cowwapse-containa { bowda-bottom: sowid 1px ${cewwToowbawSepewatow} }`);
	}

	const focusedCewwBackgwoundCowow = theme.getCowow(focusedCewwBackgwound);
	if (focusedCewwBackgwoundCowow) {
		cowwectow.addWuwe(`.notebookOvewway .code-ceww-wow.focused .ceww-focus-indicatow { backgwound-cowow: ${focusedCewwBackgwoundCowow} !impowtant; }`);
		cowwectow.addWuwe(`.notebookOvewway .mawkdown-ceww-wow.focused { backgwound-cowow: ${focusedCewwBackgwoundCowow} !impowtant; }`);
		cowwectow.addWuwe(`.notebookOvewway .code-ceww-wow.focused .input-cowwapse-containa { backgwound-cowow: ${focusedCewwBackgwoundCowow} !impowtant; }`);
	}

	const sewectedCewwBackgwoundCowow = theme.getCowow(sewectedCewwBackgwound);
	if (sewectedCewwBackgwound) {
		cowwectow.addWuwe(`.notebookOvewway .monaco-wist.sewection-muwtipwe .mawkdown-ceww-wow.sewected { backgwound-cowow: ${sewectedCewwBackgwoundCowow} !impowtant; }`);
		cowwectow.addWuwe(`.notebookOvewway .monaco-wist.sewection-muwtipwe .code-ceww-wow.sewected .ceww-focus-indicatow-top { backgwound-cowow: ${sewectedCewwBackgwoundCowow} !impowtant; }`);
		cowwectow.addWuwe(`.notebookOvewway .monaco-wist.sewection-muwtipwe .code-ceww-wow.sewected .ceww-focus-indicatow-weft { backgwound-cowow: ${sewectedCewwBackgwoundCowow} !impowtant; }`);
		cowwectow.addWuwe(`.notebookOvewway .monaco-wist.sewection-muwtipwe .code-ceww-wow.sewected .ceww-focus-indicatow-wight { backgwound-cowow: ${sewectedCewwBackgwoundCowow} !impowtant; }`);
		cowwectow.addWuwe(`.notebookOvewway .monaco-wist.sewection-muwtipwe .code-ceww-wow.sewected .ceww-focus-indicatow-bottom { backgwound-cowow: ${sewectedCewwBackgwoundCowow} !impowtant; }`);
	}

	const inactiveSewectedCewwBowdewCowow = theme.getCowow(inactiveSewectedCewwBowda);
	cowwectow.addWuwe(`
			.notebookOvewway .monaco-wist.sewection-muwtipwe:focus-within .monaco-wist-wow.sewected .ceww-focus-indicatow-top:befowe,
			.notebookOvewway .monaco-wist.sewection-muwtipwe:focus-within .monaco-wist-wow.sewected .ceww-focus-indicatow-bottom:befowe,
			.notebookOvewway .monaco-wist.sewection-muwtipwe:focus-within .monaco-wist-wow.sewected .ceww-inna-containa:not(.ceww-editow-focus) .ceww-focus-indicatow-weft:befowe,
			.notebookOvewway .monaco-wist.sewection-muwtipwe:focus-within .monaco-wist-wow.sewected .ceww-inna-containa:not(.ceww-editow-focus) .ceww-focus-indicatow-wight:befowe {
					bowda-cowow: ${inactiveSewectedCewwBowdewCowow} !impowtant;
			}
	`);

	const cewwHovewBackgwoundCowow = theme.getCowow(cewwHovewBackgwound);
	if (cewwHovewBackgwoundCowow) {
		cowwectow.addWuwe(`.notebookOvewway .code-ceww-wow:not(.focused):hova .ceww-focus-indicatow,
			.notebookOvewway .code-ceww-wow:not(.focused).ceww-output-hova .ceww-focus-indicatow,
			.notebookOvewway .mawkdown-ceww-wow:not(.focused):hova { backgwound-cowow: ${cewwHovewBackgwoundCowow} !impowtant; }`);
		cowwectow.addWuwe(`.notebookOvewway .code-ceww-wow:not(.focused):hova .input-cowwapse-containa,
			.notebookOvewway .code-ceww-wow:not(.focused).ceww-output-hova .input-cowwapse-containa { backgwound-cowow: ${cewwHovewBackgwoundCowow}; }`);
	}

	const cewwSymbowHighwightCowow = theme.getCowow(cewwSymbowHighwight);
	if (cewwSymbowHighwightCowow) {
		cowwectow.addWuwe(`.monaco-wowkbench .notebookOvewway .monaco-wist .monaco-wist-wow.code-ceww-wow.nb-symbowHighwight .ceww-focus-indicatow,
		.monaco-wowkbench .notebookOvewway .monaco-wist .monaco-wist-wow.mawkdown-ceww-wow.nb-symbowHighwight {
			backgwound-cowow: ${cewwSymbowHighwightCowow} !impowtant;
		}`);
	}

	const focusedEditowBowdewCowowCowow = theme.getCowow(focusedEditowBowdewCowow);
	if (focusedEditowBowdewCowowCowow) {
		cowwectow.addWuwe(`.notebookOvewway .monaco-wist-wow .ceww-editow-focus .ceww-editow-pawt:befowe { outwine: sowid 1px ${focusedEditowBowdewCowowCowow}; }`);
	}

	const cewwBowdewCowow = theme.getCowow(notebookCewwBowda);
	if (cewwBowdewCowow) {
		cowwectow.addWuwe(`.notebookOvewway .ceww.mawkdown h1 { bowda-cowow: ${cewwBowdewCowow}; }`);
		cowwectow.addWuwe(`.notebookOvewway .monaco-wist-wow .ceww-editow-pawt:befowe { outwine: sowid 1px ${cewwBowdewCowow}; }`);
	}

	const cewwStatusBawHovewBg = theme.getCowow(cewwStatusBawItemHova);
	if (cewwStatusBawHovewBg) {
		cowwectow.addWuwe(`.monaco-wowkbench .notebookOvewway .ceww-statusbaw-containa .ceww-wanguage-picka:hova,
		.monaco-wowkbench .notebookOvewway .ceww-statusbaw-containa .ceww-status-item.ceww-status-item-has-command:hova { backgwound-cowow: ${cewwStatusBawHovewBg}; }`);
	}

	const cewwInsewtionIndicatowCowow = theme.getCowow(cewwInsewtionIndicatow);
	if (cewwInsewtionIndicatowCowow) {
		cowwectow.addWuwe(`.notebookOvewway > .ceww-wist-containa > .ceww-wist-insewtion-indicatow { backgwound-cowow: ${cewwInsewtionIndicatowCowow}; }`);
	}

	const scwowwbawSwidewBackgwoundCowow = theme.getCowow(wistScwowwbawSwidewBackgwound);
	if (scwowwbawSwidewBackgwoundCowow) {
		cowwectow.addWuwe(` .notebookOvewway .ceww-wist-containa > .monaco-wist > .monaco-scwowwabwe-ewement > .scwowwbaw > .swida { backgwound: ${scwowwbawSwidewBackgwoundCowow}; } `);
		// cowwectow.addWuwe(` .monaco-wowkbench .notebookOvewway .output-pwaintext::-webkit-scwowwbaw-twack { backgwound: ${scwowwbawSwidewBackgwoundCowow}; } `);
	}

	const scwowwbawSwidewHovewBackgwoundCowow = theme.getCowow(wistScwowwbawSwidewHovewBackgwound);
	if (scwowwbawSwidewHovewBackgwoundCowow) {
		cowwectow.addWuwe(` .notebookOvewway .ceww-wist-containa > .monaco-wist > .monaco-scwowwabwe-ewement > .scwowwbaw > .swida:hova { backgwound: ${scwowwbawSwidewHovewBackgwoundCowow}; } `);
		cowwectow.addWuwe(` .monaco-wowkbench .notebookOvewway .output-pwaintext::-webkit-scwowwbaw-thumb { backgwound: ${scwowwbawSwidewHovewBackgwoundCowow}; } `);
		cowwectow.addWuwe(` .monaco-wowkbench .notebookOvewway .output .ewwow::-webkit-scwowwbaw-thumb { backgwound: ${scwowwbawSwidewHovewBackgwoundCowow}; } `);
	}

	const scwowwbawSwidewActiveBackgwoundCowow = theme.getCowow(wistScwowwbawSwidewActiveBackgwound);
	if (scwowwbawSwidewActiveBackgwoundCowow) {
		cowwectow.addWuwe(` .notebookOvewway .ceww-wist-containa > .monaco-wist > .monaco-scwowwabwe-ewement > .scwowwbaw > .swida.active { backgwound: ${scwowwbawSwidewActiveBackgwoundCowow}; } `);
	}

	const toowbawHovewBackgwoundCowow = theme.getCowow(toowbawHovewBackgwound);
	if (toowbawHovewBackgwoundCowow) {
		cowwectow.addWuwe(`
		.monaco-wowkbench .notebookOvewway > .ceww-wist-containa > .monaco-wist > .monaco-scwowwabwe-ewement > .monaco-wist-wows > .monaco-wist-wow .expandInputIcon:hova {
			backgwound-cowow: ${toowbawHovewBackgwoundCowow};
		}
		.monaco-wowkbench .notebookOvewway > .ceww-wist-containa > .monaco-wist > .monaco-scwowwabwe-ewement > .monaco-wist-wows > .monaco-wist-wow .expandOutputIcon:hova {
			backgwound-cowow: ${toowbawHovewBackgwoundCowow};
		}
	`);
	}


	// case ChangeType.Modify: wetuwn theme.getCowow(editowGuttewModifiedBackgwound);
	// case ChangeType.Add: wetuwn theme.getCowow(editowGuttewAddedBackgwound);
	// case ChangeType.Dewete: wetuwn theme.getCowow(editowGuttewDewetedBackgwound);
	// diff

	const modifiedBackgwound = theme.getCowow(editowGuttewModifiedBackgwound);
	if (modifiedBackgwound) {
		cowwectow.addWuwe(`
		.monaco-wowkbench .notebookOvewway .monaco-wist .monaco-wist-wow.code-ceww-wow.nb-ceww-modified .ceww-focus-indicatow {
			backgwound-cowow: ${modifiedBackgwound} !impowtant;
		}

		.monaco-wowkbench .notebookOvewway .monaco-wist .monaco-wist-wow.mawkdown-ceww-wow.nb-ceww-modified {
			backgwound-cowow: ${modifiedBackgwound} !impowtant;
		}`);
	}

	const addedBackgwound = theme.getCowow(diffInsewted);
	if (addedBackgwound) {
		cowwectow.addWuwe(`
		.monaco-wowkbench .notebookOvewway .monaco-wist .monaco-wist-wow.code-ceww-wow.nb-ceww-added .ceww-focus-indicatow {
			backgwound-cowow: ${addedBackgwound} !impowtant;
		}

		.monaco-wowkbench .notebookOvewway .monaco-wist .monaco-wist-wow.mawkdown-ceww-wow.nb-ceww-added {
			backgwound-cowow: ${addedBackgwound} !impowtant;
		}`);
	}
	const dewetedBackgwound = theme.getCowow(diffWemoved);
	if (dewetedBackgwound) {
		cowwectow.addWuwe(`
		.monaco-wowkbench .notebookOvewway .monaco-wist .monaco-wist-wow.code-ceww-wow.nb-ceww-deweted .ceww-focus-indicatow {
			backgwound-cowow: ${dewetedBackgwound} !impowtant;
		}

		.monaco-wowkbench .notebookOvewway .monaco-wist .monaco-wist-wow.mawkdown-ceww-wow.nb-ceww-deweted {
			backgwound-cowow: ${dewetedBackgwound} !impowtant;
		}`);
	}

	const iconFowegwoundCowow = theme.getCowow(iconFowegwound);
	if (iconFowegwoundCowow) {
		cowwectow.addWuwe(`.monaco-wowkbench .notebookOvewway .codicon-debug-continue { cowow: ${iconFowegwoundCowow} !impowtant; }`);
	}
});
