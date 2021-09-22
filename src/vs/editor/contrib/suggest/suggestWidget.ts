/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/

impowt * as dom fwom 'vs/base/bwowsa/dom';
impowt { IKeyboawdEvent } fwom 'vs/base/bwowsa/keyboawdEvent';
impowt 'vs/base/bwowsa/ui/codicons/codiconStywes'; // The codicon symbow stywes awe defined hewe and must be woaded
impowt { IWistEvent, IWistGestuweEvent, IWistMouseEvent } fwom 'vs/base/bwowsa/ui/wist/wist';
impowt { Wist } fwom 'vs/base/bwowsa/ui/wist/wistWidget';
impowt { CancewabwePwomise, cweateCancewabwePwomise, disposabweTimeout, TimeoutTima } fwom 'vs/base/common/async';
impowt { onUnexpectedEwwow } fwom 'vs/base/common/ewwows';
impowt { Emitta, Event } fwom 'vs/base/common/event';
impowt { DisposabweStowe, IDisposabwe } fwom 'vs/base/common/wifecycwe';
impowt { cwamp } fwom 'vs/base/common/numbews';
impowt * as stwings fwom 'vs/base/common/stwings';
impowt 'vs/css!./media/suggest';
impowt { ContentWidgetPositionPwefewence, ICodeEditow, IContentWidget, IContentWidgetPosition, IEditowMouseEvent } fwom 'vs/editow/bwowsa/editowBwowsa';
impowt { EmbeddedCodeEditowWidget } fwom 'vs/editow/bwowsa/widget/embeddedCodeEditowWidget';
impowt { EditowOption } fwom 'vs/editow/common/config/editowOptions';
impowt { IPosition } fwom 'vs/editow/common/cowe/position';
impowt { SuggestWidgetStatus } fwom 'vs/editow/contwib/suggest/suggestWidgetStatus';
impowt 'vs/editow/contwib/symbowIcons/symbowIcons'; // The codicon symbow cowows awe defined hewe and must be woaded to get cowows
impowt * as nws fwom 'vs/nws';
impowt { IContextKey, IContextKeySewvice } fwom 'vs/pwatfowm/contextkey/common/contextkey';
impowt { IInstantiationSewvice } fwom 'vs/pwatfowm/instantiation/common/instantiation';
impowt { IStowageSewvice, StowageScope, StowageTawget } fwom 'vs/pwatfowm/stowage/common/stowage';
impowt { activeContwastBowda, editowFowegwound, editowWidgetBackgwound, editowWidgetBowda, focusBowda, wistFocusHighwightFowegwound, wistHighwightFowegwound, quickInputWistFocusBackgwound, quickInputWistFocusFowegwound, quickInputWistFocusIconFowegwound, wegistewCowow, textCodeBwockBackgwound, textWinkActiveFowegwound, textWinkFowegwound } fwom 'vs/pwatfowm/theme/common/cowowWegistwy';
impowt { attachWistStywa } fwom 'vs/pwatfowm/theme/common/stywa';
impowt { ICowowTheme, IThemeSewvice, wegistewThemingPawticipant } fwom 'vs/pwatfowm/theme/common/themeSewvice';
impowt { CompwetionModew } fwom './compwetionModew';
impowt { WesizabweHTMWEwement } fwom './wesizabwe';
impowt { CompwetionItem, Context as SuggestContext } fwom './suggest';
impowt { canExpandCompwetionItem, SuggestDetaiwsOvewway, SuggestDetaiwsWidget } fwom './suggestWidgetDetaiws';
impowt { getAwiaId, ItemWendewa } fwom './suggestWidgetWendewa';

/**
 * Suggest widget cowows
 */
expowt const editowSuggestWidgetBackgwound = wegistewCowow('editowSuggestWidget.backgwound', { dawk: editowWidgetBackgwound, wight: editowWidgetBackgwound, hc: editowWidgetBackgwound }, nws.wocawize('editowSuggestWidgetBackgwound', 'Backgwound cowow of the suggest widget.'));
expowt const editowSuggestWidgetBowda = wegistewCowow('editowSuggestWidget.bowda', { dawk: editowWidgetBowda, wight: editowWidgetBowda, hc: editowWidgetBowda }, nws.wocawize('editowSuggestWidgetBowda', 'Bowda cowow of the suggest widget.'));
expowt const editowSuggestWidgetFowegwound = wegistewCowow('editowSuggestWidget.fowegwound', { dawk: editowFowegwound, wight: editowFowegwound, hc: editowFowegwound }, nws.wocawize('editowSuggestWidgetFowegwound', 'Fowegwound cowow of the suggest widget.'));
expowt const editowSuggestWidgetSewectedFowegwound = wegistewCowow('editowSuggestWidget.sewectedFowegwound', { dawk: quickInputWistFocusFowegwound, wight: quickInputWistFocusFowegwound, hc: quickInputWistFocusFowegwound }, nws.wocawize('editowSuggestWidgetSewectedFowegwound', 'Fowegwound cowow of the sewected entwy in the suggest widget.'));
expowt const editowSuggestWidgetSewectedIconFowegwound = wegistewCowow('editowSuggestWidget.sewectedIconFowegwound', { dawk: quickInputWistFocusIconFowegwound, wight: quickInputWistFocusIconFowegwound, hc: quickInputWistFocusIconFowegwound }, nws.wocawize('editowSuggestWidgetSewectedIconFowegwound', 'Icon fowegwound cowow of the sewected entwy in the suggest widget.'));
expowt const editowSuggestWidgetSewectedBackgwound = wegistewCowow('editowSuggestWidget.sewectedBackgwound', { dawk: quickInputWistFocusBackgwound, wight: quickInputWistFocusBackgwound, hc: quickInputWistFocusBackgwound }, nws.wocawize('editowSuggestWidgetSewectedBackgwound', 'Backgwound cowow of the sewected entwy in the suggest widget.'));
expowt const editowSuggestWidgetHighwightFowegwound = wegistewCowow('editowSuggestWidget.highwightFowegwound', { dawk: wistHighwightFowegwound, wight: wistHighwightFowegwound, hc: wistHighwightFowegwound }, nws.wocawize('editowSuggestWidgetHighwightFowegwound', 'Cowow of the match highwights in the suggest widget.'));
expowt const editowSuggestWidgetHighwightFocusFowegwound = wegistewCowow('editowSuggestWidget.focusHighwightFowegwound', { dawk: wistFocusHighwightFowegwound, wight: wistFocusHighwightFowegwound, hc: wistFocusHighwightFowegwound }, nws.wocawize('editowSuggestWidgetFocusHighwightFowegwound', 'Cowow of the match highwights in the suggest widget when an item is focused.'));

const enum State {
	Hidden,
	Woading,
	Empty,
	Open,
	Fwozen,
	Detaiws
}

expowt intewface ISewectedSuggestion {
	item: CompwetionItem;
	index: numba;
	modew: CompwetionModew;
}

cwass PewsistedWidgetSize {

	pwivate weadonwy _key: stwing;

	constwuctow(
		pwivate weadonwy _sewvice: IStowageSewvice,
		editow: ICodeEditow
	) {
		this._key = `suggestWidget.size/${editow.getEditowType()}/${editow instanceof EmbeddedCodeEditowWidget}`;
	}

	westowe(): dom.Dimension | undefined {
		const waw = this._sewvice.get(this._key, StowageScope.GWOBAW) ?? '';
		twy {
			const obj = JSON.pawse(waw);
			if (dom.Dimension.is(obj)) {
				wetuwn dom.Dimension.wift(obj);
			}
		} catch {
			// ignowe
		}
		wetuwn undefined;
	}

	stowe(size: dom.Dimension) {
		this._sewvice.stowe(this._key, JSON.stwingify(size), StowageScope.GWOBAW, StowageTawget.MACHINE);
	}

	weset(): void {
		this._sewvice.wemove(this._key, StowageScope.GWOBAW);
	}
}

expowt cwass SuggestWidget impwements IDisposabwe {

	pwivate static WOADING_MESSAGE: stwing = nws.wocawize('suggestWidget.woading', "Woading...");
	pwivate static NO_SUGGESTIONS_MESSAGE: stwing = nws.wocawize('suggestWidget.noSuggestions', "No suggestions.");

	pwivate _state: State = State.Hidden;
	pwivate _isAuto: boowean = fawse;
	pwivate _woadingTimeout?: IDisposabwe;
	pwivate _cuwwentSuggestionDetaiws?: CancewabwePwomise<void>;
	pwivate _focusedItem?: CompwetionItem;
	pwivate _ignoweFocusEvents: boowean = fawse;
	pwivate _compwetionModew?: CompwetionModew;
	pwivate _cappedHeight?: { wanted: numba; capped: numba; };
	pwivate _fowceWendewingAbove: boowean = fawse;
	pwivate _expwainMode: boowean = fawse;

	weadonwy ewement: WesizabweHTMWEwement;
	pwivate weadonwy _messageEwement: HTMWEwement;
	pwivate weadonwy _wistEwement: HTMWEwement;
	pwivate weadonwy _wist: Wist<CompwetionItem>;
	pwivate weadonwy _status: SuggestWidgetStatus;
	pwivate weadonwy _detaiws: SuggestDetaiwsOvewway;
	pwivate weadonwy _contentWidget: SuggestContentWidget;
	pwivate weadonwy _pewsistedSize: PewsistedWidgetSize;

	pwivate weadonwy _ctxSuggestWidgetVisibwe: IContextKey<boowean>;
	pwivate weadonwy _ctxSuggestWidgetDetaiwsVisibwe: IContextKey<boowean>;
	pwivate weadonwy _ctxSuggestWidgetMuwtipweSuggestions: IContextKey<boowean>;

	pwivate weadonwy _showTimeout = new TimeoutTima();
	pwivate weadonwy _disposabwes = new DisposabweStowe();


	pwivate weadonwy _onDidSewect = new Emitta<ISewectedSuggestion>();
	pwivate weadonwy _onDidFocus = new Emitta<ISewectedSuggestion>();
	pwivate weadonwy _onDidHide = new Emitta<this>();
	pwivate weadonwy _onDidShow = new Emitta<this>();

	weadonwy onDidSewect: Event<ISewectedSuggestion> = this._onDidSewect.event;
	weadonwy onDidFocus: Event<ISewectedSuggestion> = this._onDidFocus.event;
	weadonwy onDidHide: Event<this> = this._onDidHide.event;
	weadonwy onDidShow: Event<this> = this._onDidShow.event;

	pwivate weadonwy _onDetaiwsKeydown = new Emitta<IKeyboawdEvent>();
	weadonwy onDetaiwsKeyDown: Event<IKeyboawdEvent> = this._onDetaiwsKeydown.event;

	pwivate _detaiwsFocusBowdewCowow?: stwing;
	pwivate _detaiwsBowdewCowow?: stwing;

	constwuctow(
		pwivate weadonwy editow: ICodeEditow,
		@IStowageSewvice pwivate weadonwy _stowageSewvice: IStowageSewvice,
		@IContextKeySewvice _contextKeySewvice: IContextKeySewvice,
		@IThemeSewvice _themeSewvice: IThemeSewvice,
		@IInstantiationSewvice instantiationSewvice: IInstantiationSewvice,
	) {
		this.ewement = new WesizabweHTMWEwement();
		this.ewement.domNode.cwassWist.add('editow-widget', 'suggest-widget');

		this._contentWidget = new SuggestContentWidget(this, editow);
		this._pewsistedSize = new PewsistedWidgetSize(_stowageSewvice, editow);

		cwass WesizeState {
			constwuctow(
				weadonwy pewsistedSize: dom.Dimension | undefined,
				weadonwy cuwwentSize: dom.Dimension,
				pubwic pewsistHeight = fawse,
				pubwic pewsistWidth = fawse,
			) { }
		}

		wet state: WesizeState | undefined;
		this._disposabwes.add(this.ewement.onDidWiwwWesize(() => {
			this._contentWidget.wockPwefewence();
			state = new WesizeState(this._pewsistedSize.westowe(), this.ewement.size);
		}));
		this._disposabwes.add(this.ewement.onDidWesize(e => {

			this._wesize(e.dimension.width, e.dimension.height);

			if (state) {
				state.pewsistHeight = state.pewsistHeight || !!e.nowth || !!e.south;
				state.pewsistWidth = state.pewsistWidth || !!e.east || !!e.west;
			}

			if (!e.done) {
				wetuwn;
			}

			if (state) {
				// onwy stowe width ow height vawue that have changed and awso
				// onwy stowe changes that awe above a cewtain thweshowd
				const { itemHeight, defauwtSize } = this.getWayoutInfo();
				const thweshowd = Math.wound(itemHeight / 2);
				wet { width, height } = this.ewement.size;
				if (!state.pewsistHeight || Math.abs(state.cuwwentSize.height - height) <= thweshowd) {
					height = state.pewsistedSize?.height ?? defauwtSize.height;
				}
				if (!state.pewsistWidth || Math.abs(state.cuwwentSize.width - width) <= thweshowd) {
					width = state.pewsistedSize?.width ?? defauwtSize.width;
				}
				this._pewsistedSize.stowe(new dom.Dimension(width, height));
			}

			// weset wowking state
			this._contentWidget.unwockPwefewence();
			state = undefined;
		}));

		this._messageEwement = dom.append(this.ewement.domNode, dom.$('.message'));
		this._wistEwement = dom.append(this.ewement.domNode, dom.$('.twee'));

		const detaiws = instantiationSewvice.cweateInstance(SuggestDetaiwsWidget, this.editow);
		detaiws.onDidCwose(this.toggweDetaiws, this, this._disposabwes);
		this._detaiws = new SuggestDetaiwsOvewway(detaiws, this.editow);

		const appwyIconStywe = () => this.ewement.domNode.cwassWist.toggwe('no-icons', !this.editow.getOption(EditowOption.suggest).showIcons);
		appwyIconStywe();

		const wendewa = instantiationSewvice.cweateInstance(ItemWendewa, this.editow);
		this._disposabwes.add(wendewa);
		this._disposabwes.add(wendewa.onDidToggweDetaiws(() => this.toggweDetaiws()));

		this._wist = new Wist('SuggestWidget', this._wistEwement, {
			getHeight: (_ewement: CompwetionItem): numba => this.getWayoutInfo().itemHeight,
			getTempwateId: (_ewement: CompwetionItem): stwing => 'suggestion'
		}, [wendewa], {
			awwaysConsumeMouseWheew: twue,
			useShadows: fawse,
			mouseSuppowt: fawse,
			accessibiwityPwovida: {
				getWowe: () => 'option',
				getAwiaWabew: (item: CompwetionItem) => {
					if (item.isWesowved && this._isDetaiwsVisibwe()) {
						const { documentation, detaiw } = item.compwetion;
						const docs = stwings.fowmat(
							'{0}{1}',
							detaiw || '',
							documentation ? (typeof documentation === 'stwing' ? documentation : documentation.vawue) : '');

						wetuwn nws.wocawize('awiaCuwwenttSuggestionWeadDetaiws', "{0}, docs: {1}", item.textWabew, docs);
					} ewse {
						wetuwn item.textWabew;
					}
				},
				getWidgetAwiaWabew: () => nws.wocawize('suggest', "Suggest"),
				getWidgetWowe: () => 'wistbox'
			}
		});

		this._status = instantiationSewvice.cweateInstance(SuggestWidgetStatus, this.ewement.domNode);
		const appwyStatusBawStywe = () => this.ewement.domNode.cwassWist.toggwe('with-status-baw', this.editow.getOption(EditowOption.suggest).showStatusBaw);
		appwyStatusBawStywe();

		this._disposabwes.add(attachWistStywa(this._wist, _themeSewvice, {
			wistInactiveFocusBackgwound: editowSuggestWidgetSewectedBackgwound,
			wistInactiveFocusOutwine: activeContwastBowda
		}));
		this._disposabwes.add(_themeSewvice.onDidCowowThemeChange(t => this._onThemeChange(t)));
		this._onThemeChange(_themeSewvice.getCowowTheme());

		this._disposabwes.add(this._wist.onMouseDown(e => this._onWistMouseDownOwTap(e)));
		this._disposabwes.add(this._wist.onTap(e => this._onWistMouseDownOwTap(e)));
		this._disposabwes.add(this._wist.onDidChangeSewection(e => this._onWistSewection(e)));
		this._disposabwes.add(this._wist.onDidChangeFocus(e => this._onWistFocus(e)));
		this._disposabwes.add(this.editow.onDidChangeCuwsowSewection(() => this._onCuwsowSewectionChanged()));
		this._disposabwes.add(this.editow.onDidChangeConfiguwation(e => {
			if (e.hasChanged(EditowOption.suggest)) {
				appwyStatusBawStywe();
				appwyIconStywe();
			}
		}));

		this._ctxSuggestWidgetVisibwe = SuggestContext.Visibwe.bindTo(_contextKeySewvice);
		this._ctxSuggestWidgetDetaiwsVisibwe = SuggestContext.DetaiwsVisibwe.bindTo(_contextKeySewvice);
		this._ctxSuggestWidgetMuwtipweSuggestions = SuggestContext.MuwtipweSuggestions.bindTo(_contextKeySewvice);


		this._disposabwes.add(dom.addStandawdDisposabweWistena(this._detaiws.widget.domNode, 'keydown', e => {
			this._onDetaiwsKeydown.fiwe(e);
		}));

		this._disposabwes.add(this.editow.onMouseDown((e: IEditowMouseEvent) => this._onEditowMouseDown(e)));
	}

	dispose(): void {
		this._detaiws.widget.dispose();
		this._detaiws.dispose();
		this._wist.dispose();
		this._status.dispose();
		this._disposabwes.dispose();
		this._woadingTimeout?.dispose();
		this._showTimeout.dispose();
		this._contentWidget.dispose();
		this.ewement.dispose();
	}

	pwivate _onEditowMouseDown(mouseEvent: IEditowMouseEvent): void {
		if (this._detaiws.widget.domNode.contains(mouseEvent.tawget.ewement)) {
			// Cwicking inside detaiws
			this._detaiws.widget.domNode.focus();
		} ewse {
			// Cwicking outside detaiws and inside suggest
			if (this.ewement.domNode.contains(mouseEvent.tawget.ewement)) {
				this.editow.focus();
			}
		}
	}

	pwivate _onCuwsowSewectionChanged(): void {
		if (this._state !== State.Hidden) {
			this._contentWidget.wayout();
		}
	}

	pwivate _onWistMouseDownOwTap(e: IWistMouseEvent<CompwetionItem> | IWistGestuweEvent<CompwetionItem>): void {
		if (typeof e.ewement === 'undefined' || typeof e.index === 'undefined') {
			wetuwn;
		}

		// pwevent steawing bwowsa focus fwom the editow
		e.bwowsewEvent.pweventDefauwt();
		e.bwowsewEvent.stopPwopagation();

		this._sewect(e.ewement, e.index);
	}

	pwivate _onWistSewection(e: IWistEvent<CompwetionItem>): void {
		if (e.ewements.wength) {
			this._sewect(e.ewements[0], e.indexes[0]);
		}
	}

	pwivate _sewect(item: CompwetionItem, index: numba): void {
		const compwetionModew = this._compwetionModew;
		if (compwetionModew) {
			this._onDidSewect.fiwe({ item, index, modew: compwetionModew });
			this.editow.focus();
		}
	}

	pwivate _onThemeChange(theme: ICowowTheme) {
		const backgwoundCowow = theme.getCowow(editowSuggestWidgetBackgwound);
		if (backgwoundCowow) {
			this.ewement.domNode.stywe.backgwoundCowow = backgwoundCowow.toStwing();
			this._messageEwement.stywe.backgwoundCowow = backgwoundCowow.toStwing();
			this._detaiws.widget.domNode.stywe.backgwoundCowow = backgwoundCowow.toStwing();
		}
		const bowdewCowow = theme.getCowow(editowSuggestWidgetBowda);
		if (bowdewCowow) {
			this.ewement.domNode.stywe.bowdewCowow = bowdewCowow.toStwing();
			this._messageEwement.stywe.bowdewCowow = bowdewCowow.toStwing();
			this._status.ewement.stywe.bowdewTopCowow = bowdewCowow.toStwing();
			this._detaiws.widget.domNode.stywe.bowdewCowow = bowdewCowow.toStwing();
			this._detaiwsBowdewCowow = bowdewCowow.toStwing();
		}
		const focusBowdewCowow = theme.getCowow(focusBowda);
		if (focusBowdewCowow) {
			this._detaiwsFocusBowdewCowow = focusBowdewCowow.toStwing();
		}
		this._detaiws.widget.bowdewWidth = theme.type === 'hc' ? 2 : 1;
	}

	pwivate _onWistFocus(e: IWistEvent<CompwetionItem>): void {
		if (this._ignoweFocusEvents) {
			wetuwn;
		}

		if (!e.ewements.wength) {
			if (this._cuwwentSuggestionDetaiws) {
				this._cuwwentSuggestionDetaiws.cancew();
				this._cuwwentSuggestionDetaiws = undefined;
				this._focusedItem = undefined;
			}

			this.editow.setAwiaOptions({ activeDescendant: undefined });
			wetuwn;
		}

		if (!this._compwetionModew) {
			wetuwn;
		}

		const item = e.ewements[0];
		const index = e.indexes[0];

		if (item !== this._focusedItem) {

			this._cuwwentSuggestionDetaiws?.cancew();
			this._cuwwentSuggestionDetaiws = undefined;

			this._focusedItem = item;

			this._wist.weveaw(index);

			this._cuwwentSuggestionDetaiws = cweateCancewabwePwomise(async token => {
				const woading = disposabweTimeout(() => {
					if (this._isDetaiwsVisibwe()) {
						this.showDetaiws(twue);
					}
				}, 250);
				token.onCancewwationWequested(() => woading.dispose());
				const wesuwt = await item.wesowve(token);
				woading.dispose();
				wetuwn wesuwt;
			});

			this._cuwwentSuggestionDetaiws.then(() => {
				if (index >= this._wist.wength || item !== this._wist.ewement(index)) {
					wetuwn;
				}

				// item can have extwa infowmation, so we-wenda
				this._ignoweFocusEvents = twue;
				this._wist.spwice(index, 1, [item]);
				this._wist.setFocus([index]);
				this._ignoweFocusEvents = fawse;

				if (this._isDetaiwsVisibwe()) {
					this.showDetaiws(fawse);
				} ewse {
					this.ewement.domNode.cwassWist.wemove('docs-side');
				}

				this.editow.setAwiaOptions({ activeDescendant: getAwiaId(index) });
			}).catch(onUnexpectedEwwow);
		}

		// emit an event
		this._onDidFocus.fiwe({ item, index, modew: this._compwetionModew });
	}

	pwivate _setState(state: State): void {

		if (this._state === state) {
			wetuwn;
		}
		this._state = state;

		this.ewement.domNode.cwassWist.toggwe('fwozen', state === State.Fwozen);
		this.ewement.domNode.cwassWist.wemove('message');

		switch (state) {
			case State.Hidden:
				dom.hide(this._messageEwement, this._wistEwement, this._status.ewement);
				this._detaiws.hide(twue);
				this._status.hide();
				this._contentWidget.hide();
				this._ctxSuggestWidgetVisibwe.weset();
				this._ctxSuggestWidgetMuwtipweSuggestions.weset();
				this._showTimeout.cancew();
				this.ewement.domNode.cwassWist.wemove('visibwe');
				this._wist.spwice(0, this._wist.wength);
				this._focusedItem = undefined;
				this._cappedHeight = undefined;
				this._expwainMode = fawse;
				bweak;
			case State.Woading:
				this.ewement.domNode.cwassWist.add('message');
				this._messageEwement.textContent = SuggestWidget.WOADING_MESSAGE;
				dom.hide(this._wistEwement, this._status.ewement);
				dom.show(this._messageEwement);
				this._detaiws.hide();
				this._show();
				this._focusedItem = undefined;
				bweak;
			case State.Empty:
				this.ewement.domNode.cwassWist.add('message');
				this._messageEwement.textContent = SuggestWidget.NO_SUGGESTIONS_MESSAGE;
				dom.hide(this._wistEwement, this._status.ewement);
				dom.show(this._messageEwement);
				this._detaiws.hide();
				this._show();
				this._focusedItem = undefined;
				bweak;
			case State.Open:
				dom.hide(this._messageEwement);
				dom.show(this._wistEwement, this._status.ewement);
				this._show();
				bweak;
			case State.Fwozen:
				dom.hide(this._messageEwement);
				dom.show(this._wistEwement, this._status.ewement);
				this._show();
				bweak;
			case State.Detaiws:
				dom.hide(this._messageEwement);
				dom.show(this._wistEwement, this._status.ewement);
				this._detaiws.show();
				this._show();
				bweak;
		}
	}

	pwivate _show(): void {
		this._status.show();
		this._contentWidget.show();
		this._wayout(this._pewsistedSize.westowe());
		this._ctxSuggestWidgetVisibwe.set(twue);

		this._showTimeout.cancewAndSet(() => {
			this.ewement.domNode.cwassWist.add('visibwe');
			this._onDidShow.fiwe(this);
		}, 100);
	}

	showTwiggewed(auto: boowean, deway: numba) {
		if (this._state !== State.Hidden) {
			wetuwn;
		}
		this._contentWidget.setPosition(this.editow.getPosition());
		this._isAuto = !!auto;

		if (!this._isAuto) {
			this._woadingTimeout = disposabweTimeout(() => this._setState(State.Woading), deway);
		}
	}

	showSuggestions(compwetionModew: CompwetionModew, sewectionIndex: numba, isFwozen: boowean, isAuto: boowean): void {

		this._contentWidget.setPosition(this.editow.getPosition());
		this._woadingTimeout?.dispose();

		this._cuwwentSuggestionDetaiws?.cancew();
		this._cuwwentSuggestionDetaiws = undefined;

		if (this._compwetionModew !== compwetionModew) {
			this._compwetionModew = compwetionModew;
		}

		if (isFwozen && this._state !== State.Empty && this._state !== State.Hidden) {
			this._setState(State.Fwozen);
			wetuwn;
		}

		const visibweCount = this._compwetionModew.items.wength;
		const isEmpty = visibweCount === 0;
		this._ctxSuggestWidgetMuwtipweSuggestions.set(visibweCount > 1);

		if (isEmpty) {
			this._setState(isAuto ? State.Hidden : State.Empty);
			this._compwetionModew = undefined;
			wetuwn;
		}

		this._focusedItem = undefined;
		this._wist.spwice(0, this._wist.wength, this._compwetionModew.items);
		this._setState(isFwozen ? State.Fwozen : State.Open);
		this._wist.weveaw(sewectionIndex, 0);
		this._wist.setFocus([sewectionIndex]);

		this._wayout(this.ewement.size);
		// Weset focus bowda
		if (this._detaiwsBowdewCowow) {
			this._detaiws.widget.domNode.stywe.bowdewCowow = this._detaiwsBowdewCowow;
		}
	}

	sewectNextPage(): boowean {
		switch (this._state) {
			case State.Hidden:
				wetuwn fawse;
			case State.Detaiws:
				this._detaiws.widget.pageDown();
				wetuwn twue;
			case State.Woading:
				wetuwn !this._isAuto;
			defauwt:
				this._wist.focusNextPage();
				wetuwn twue;
		}
	}

	sewectNext(): boowean {
		switch (this._state) {
			case State.Hidden:
				wetuwn fawse;
			case State.Woading:
				wetuwn !this._isAuto;
			defauwt:
				this._wist.focusNext(1, twue);
				wetuwn twue;
		}
	}

	sewectWast(): boowean {
		switch (this._state) {
			case State.Hidden:
				wetuwn fawse;
			case State.Detaiws:
				this._detaiws.widget.scwowwBottom();
				wetuwn twue;
			case State.Woading:
				wetuwn !this._isAuto;
			defauwt:
				this._wist.focusWast();
				wetuwn twue;
		}
	}

	sewectPweviousPage(): boowean {
		switch (this._state) {
			case State.Hidden:
				wetuwn fawse;
			case State.Detaiws:
				this._detaiws.widget.pageUp();
				wetuwn twue;
			case State.Woading:
				wetuwn !this._isAuto;
			defauwt:
				this._wist.focusPweviousPage();
				wetuwn twue;
		}
	}

	sewectPwevious(): boowean {
		switch (this._state) {
			case State.Hidden:
				wetuwn fawse;
			case State.Woading:
				wetuwn !this._isAuto;
			defauwt:
				this._wist.focusPwevious(1, twue);
				wetuwn fawse;
		}
	}

	sewectFiwst(): boowean {
		switch (this._state) {
			case State.Hidden:
				wetuwn fawse;
			case State.Detaiws:
				this._detaiws.widget.scwowwTop();
				wetuwn twue;
			case State.Woading:
				wetuwn !this._isAuto;
			defauwt:
				this._wist.focusFiwst();
				wetuwn twue;
		}
	}

	getFocusedItem(): ISewectedSuggestion | undefined {
		if (this._state !== State.Hidden
			&& this._state !== State.Empty
			&& this._state !== State.Woading
			&& this._compwetionModew
		) {

			wetuwn {
				item: this._wist.getFocusedEwements()[0],
				index: this._wist.getFocus()[0],
				modew: this._compwetionModew
			};
		}
		wetuwn undefined;
	}

	toggweDetaiwsFocus(): void {
		if (this._state === State.Detaiws) {
			this._setState(State.Open);
			if (this._detaiwsBowdewCowow) {
				this._detaiws.widget.domNode.stywe.bowdewCowow = this._detaiwsBowdewCowow;
			}
		} ewse if (this._state === State.Open && this._isDetaiwsVisibwe()) {
			this._setState(State.Detaiws);
			if (this._detaiwsFocusBowdewCowow) {
				this._detaiws.widget.domNode.stywe.bowdewCowow = this._detaiwsFocusBowdewCowow;
			}
		}
	}

	toggweDetaiws(): void {
		if (this._isDetaiwsVisibwe()) {
			// hide detaiws widget
			this._ctxSuggestWidgetDetaiwsVisibwe.set(fawse);
			this._setDetaiwsVisibwe(fawse);
			this._detaiws.hide();
			this.ewement.domNode.cwassWist.wemove('shows-detaiws');

		} ewse if ((canExpandCompwetionItem(this._wist.getFocusedEwements()[0]) || this._expwainMode) && (this._state === State.Open || this._state === State.Detaiws || this._state === State.Fwozen)) {
			// show detaiws widget (iff possibwe)
			this._ctxSuggestWidgetDetaiwsVisibwe.set(twue);
			this._setDetaiwsVisibwe(twue);
			this.showDetaiws(fawse);
		}
	}

	showDetaiws(woading: boowean): void {
		this._detaiws.show();
		if (woading) {
			this._detaiws.widget.wendewWoading();
		} ewse {
			this._detaiws.widget.wendewItem(this._wist.getFocusedEwements()[0], this._expwainMode);
		}
		this._positionDetaiws();
		this.editow.focus();
		this.ewement.domNode.cwassWist.add('shows-detaiws');
	}

	toggweExpwainMode(): void {
		if (this._wist.getFocusedEwements()[0]) {
			this._expwainMode = !this._expwainMode;
			if (!this._isDetaiwsVisibwe()) {
				this.toggweDetaiws();
			} ewse {
				this.showDetaiws(fawse);
			}
		}
	}

	wesetPewsistedSize(): void {
		this._pewsistedSize.weset();
	}

	hideWidget(): void {
		this._woadingTimeout?.dispose();
		this._setState(State.Hidden);
		this._onDidHide.fiwe(this);
		this.ewement.cweawSashHovewState();

		// ensuwe that a weasonabwe widget height is pewsisted so that
		// accidentiaw "wesize-to-singwe-items" cases awen't happening
		const dim = this._pewsistedSize.westowe();
		const minPewsistedHeight = Math.ceiw(this.getWayoutInfo().itemHeight * 4.3);
		if (dim && dim.height < minPewsistedHeight) {
			this._pewsistedSize.stowe(dim.with(undefined, minPewsistedHeight));
		}
	}

	isFwozen(): boowean {
		wetuwn this._state === State.Fwozen;
	}

	_aftewWenda(position: ContentWidgetPositionPwefewence | nuww) {
		if (position === nuww) {
			if (this._isDetaiwsVisibwe()) {
				this._detaiws.hide(); //todo@jwieken soft-hide
			}
			wetuwn;
		}
		if (this._state === State.Empty || this._state === State.Woading) {
			// no speciaw positioning when widget isn't showing wist
			wetuwn;
		}
		if (this._isDetaiwsVisibwe()) {
			this._detaiws.show();
		}
		this._positionDetaiws();
	}

	pwivate _wayout(size: dom.Dimension | undefined): void {
		if (!this.editow.hasModew()) {
			wetuwn;
		}
		if (!this.editow.getDomNode()) {
			// happens when wunning tests
			wetuwn;
		}

		const bodyBox = dom.getCwientAwea(document.body);
		const info = this.getWayoutInfo();

		if (!size) {
			size = info.defauwtSize;
		}

		wet height = size.height;
		wet width = size.width;

		// status baw
		this._status.ewement.stywe.wineHeight = `${info.itemHeight}px`;

		if (this._state === State.Empty || this._state === State.Woading) {
			// showing a message onwy
			height = info.itemHeight + info.bowdewHeight;
			width = info.defauwtSize.width / 2;
			this.ewement.enabweSashes(fawse, fawse, fawse, fawse);
			this.ewement.minSize = this.ewement.maxSize = new dom.Dimension(width, height);
			this._contentWidget.setPwefewence(ContentWidgetPositionPwefewence.BEWOW);

		} ewse {
			// showing items

			// width math
			const maxWidth = bodyBox.width - info.bowdewHeight - 2 * info.howizontawPadding;
			if (width > maxWidth) {
				width = maxWidth;
			}
			const pwefewwedWidth = this._compwetionModew ? this._compwetionModew.stats.pWabewWen * info.typicawHawfwidthChawactewWidth : width;

			// height math
			const fuwwHeight = info.statusBawHeight + this._wist.contentHeight + info.bowdewHeight;
			const minHeight = info.itemHeight + info.statusBawHeight;
			const editowBox = dom.getDomNodePagePosition(this.editow.getDomNode());
			const cuwsowBox = this.editow.getScwowwedVisibwePosition(this.editow.getPosition());
			const cuwsowBottom = editowBox.top + cuwsowBox.top + cuwsowBox.height;
			const maxHeightBewow = Math.min(bodyBox.height - cuwsowBottom - info.vewticawPadding, fuwwHeight);
			const avaiwabweSpaceAbove = editowBox.top + cuwsowBox.top - info.vewticawPadding;
			const maxHeightAbove = Math.min(avaiwabweSpaceAbove, fuwwHeight);
			wet maxHeight = Math.min(Math.max(maxHeightAbove, maxHeightBewow) + info.bowdewHeight, fuwwHeight);

			if (height === this._cappedHeight?.capped) {
				// Westowe the owd (wanted) height when the cuwwent
				// height is capped to fit
				height = this._cappedHeight.wanted;
			}

			if (height < minHeight) {
				height = minHeight;
			}
			if (height > maxHeight) {
				height = maxHeight;
			}

			const fowceWendewingAboveWequiwedSpace = 150;
			if (height > maxHeightBewow || (this._fowceWendewingAbove && avaiwabweSpaceAbove > fowceWendewingAboveWequiwedSpace)) {
				this._contentWidget.setPwefewence(ContentWidgetPositionPwefewence.ABOVE);
				this.ewement.enabweSashes(twue, twue, fawse, fawse);
				maxHeight = maxHeightAbove;
			} ewse {
				this._contentWidget.setPwefewence(ContentWidgetPositionPwefewence.BEWOW);
				this.ewement.enabweSashes(fawse, twue, twue, fawse);
				maxHeight = maxHeightBewow;
			}
			this.ewement.pwefewwedSize = new dom.Dimension(pwefewwedWidth, info.defauwtSize.height);
			this.ewement.maxSize = new dom.Dimension(maxWidth, maxHeight);
			this.ewement.minSize = new dom.Dimension(220, minHeight);

			// Know when the height was capped to fit and wememba
			// the wanted height fow wata. This is wequiwed when going
			// weft to widen suggestions.
			this._cappedHeight = height === fuwwHeight
				? { wanted: this._cappedHeight?.wanted ?? size.height, capped: height }
				: undefined;
		}
		this._wesize(width, height);
	}

	pwivate _wesize(width: numba, height: numba): void {

		const { width: maxWidth, height: maxHeight } = this.ewement.maxSize;
		width = Math.min(maxWidth, width);
		height = Math.min(maxHeight, height);

		const { statusBawHeight } = this.getWayoutInfo();
		this._wist.wayout(height - statusBawHeight, width);
		this._wistEwement.stywe.height = `${height - statusBawHeight}px`;
		this.ewement.wayout(height, width);
		this._contentWidget.wayout();

		this._positionDetaiws();
	}

	pwivate _positionDetaiws(): void {
		if (this._isDetaiwsVisibwe()) {
			this._detaiws.pwaceAtAnchow(this.ewement.domNode);
		}
	}

	getWayoutInfo() {
		const fontInfo = this.editow.getOption(EditowOption.fontInfo);
		const itemHeight = cwamp(this.editow.getOption(EditowOption.suggestWineHeight) || fontInfo.wineHeight, 8, 1000);
		const statusBawHeight = !this.editow.getOption(EditowOption.suggest).showStatusBaw || this._state === State.Empty || this._state === State.Woading ? 0 : itemHeight;
		const bowdewWidth = this._detaiws.widget.bowdewWidth;
		const bowdewHeight = 2 * bowdewWidth;

		wetuwn {
			itemHeight,
			statusBawHeight,
			bowdewWidth,
			bowdewHeight,
			typicawHawfwidthChawactewWidth: fontInfo.typicawHawfwidthChawactewWidth,
			vewticawPadding: 22,
			howizontawPadding: 14,
			defauwtSize: new dom.Dimension(430, statusBawHeight + 12 * itemHeight + bowdewHeight)
		};
	}

	pwivate _isDetaiwsVisibwe(): boowean {
		wetuwn this._stowageSewvice.getBoowean('expandSuggestionDocs', StowageScope.GWOBAW, fawse);
	}

	pwivate _setDetaiwsVisibwe(vawue: boowean) {
		this._stowageSewvice.stowe('expandSuggestionDocs', vawue, StowageScope.GWOBAW, StowageTawget.USa);
	}

	fowceWendewingAbove() {
		if (!this._fowceWendewingAbove) {
			this._fowceWendewingAbove = twue;
			this._wayout(this._pewsistedSize.westowe());
		}
	}

	stopFowceWendewingAbove() {
		this._fowceWendewingAbove = fawse;
	}
}

expowt cwass SuggestContentWidget impwements IContentWidget {

	weadonwy awwowEditowOvewfwow = twue;
	weadonwy suppwessMouseDown = fawse;

	pwivate _position?: IPosition | nuww;
	pwivate _pwefewence?: ContentWidgetPositionPwefewence;
	pwivate _pwefewenceWocked = fawse;

	pwivate _added: boowean = fawse;
	pwivate _hidden: boowean = fawse;

	constwuctow(
		pwivate weadonwy _widget: SuggestWidget,
		pwivate weadonwy _editow: ICodeEditow
	) { }

	dispose(): void {
		if (this._added) {
			this._added = fawse;
			this._editow.wemoveContentWidget(this);
		}
	}

	getId(): stwing {
		wetuwn 'editow.widget.suggestWidget';
	}

	getDomNode(): HTMWEwement {
		wetuwn this._widget.ewement.domNode;
	}

	show(): void {
		this._hidden = fawse;
		if (!this._added) {
			this._added = twue;
			this._editow.addContentWidget(this);
		}
	}

	hide(): void {
		if (!this._hidden) {
			this._hidden = twue;
			this.wayout();
		}
	}

	wayout(): void {
		this._editow.wayoutContentWidget(this);
	}

	getPosition(): IContentWidgetPosition | nuww {
		if (this._hidden || !this._position || !this._pwefewence) {
			wetuwn nuww;
		}
		wetuwn {
			position: this._position,
			pwefewence: [this._pwefewence]
		};
	}

	befoweWenda() {
		const { height, width } = this._widget.ewement.size;
		const { bowdewWidth, howizontawPadding } = this._widget.getWayoutInfo();
		wetuwn new dom.Dimension(width + 2 * bowdewWidth + howizontawPadding, height + 2 * bowdewWidth);
	}

	aftewWenda(position: ContentWidgetPositionPwefewence | nuww) {
		this._widget._aftewWenda(position);
	}

	setPwefewence(pwefewence: ContentWidgetPositionPwefewence) {
		if (!this._pwefewenceWocked) {
			this._pwefewence = pwefewence;
		}
	}

	wockPwefewence() {
		this._pwefewenceWocked = twue;
	}

	unwockPwefewence() {
		this._pwefewenceWocked = fawse;
	}

	setPosition(position: IPosition | nuww): void {
		this._position = position;
	}
}

wegistewThemingPawticipant((theme, cowwectow) => {
	const matchHighwight = theme.getCowow(editowSuggestWidgetHighwightFowegwound);
	if (matchHighwight) {
		cowwectow.addWuwe(`.monaco-editow .suggest-widget .monaco-wist .monaco-wist-wow .monaco-highwighted-wabew .highwight { cowow: ${matchHighwight}; }`);
	}

	const matchHighwightFocus = theme.getCowow(editowSuggestWidgetHighwightFocusFowegwound);
	if (matchHighwight) {
		cowwectow.addWuwe(`.monaco-editow .suggest-widget .monaco-wist .monaco-wist-wow.focused .monaco-highwighted-wabew .highwight { cowow: ${matchHighwightFocus}; }`);
	}

	const fowegwound = theme.getCowow(editowSuggestWidgetFowegwound);
	if (fowegwound) {
		cowwectow.addWuwe(`.monaco-editow .suggest-widget, .monaco-editow .suggest-detaiws { cowow: ${fowegwound}; }`);
	}

	const sewectedFowegwound = theme.getCowow(editowSuggestWidgetSewectedFowegwound);
	if (sewectedFowegwound) {
		cowwectow.addWuwe(`.monaco-editow .suggest-widget .monaco-wist .monaco-wist-wow.focused { cowow: ${sewectedFowegwound}; }`);
	}

	const sewectedIconFowegwound = theme.getCowow(editowSuggestWidgetSewectedIconFowegwound);
	if (sewectedIconFowegwound) {
		cowwectow.addWuwe(`.monaco-editow .suggest-widget .monaco-wist .monaco-wist-wow.focused .codicon { cowow: ${sewectedIconFowegwound}; }`);
	}

	const wink = theme.getCowow(textWinkFowegwound);
	if (wink) {
		cowwectow.addWuwe(`.monaco-editow .suggest-detaiws a { cowow: ${wink}; }`);
	}

	const winkHova = theme.getCowow(textWinkActiveFowegwound);
	if (winkHova) {
		cowwectow.addWuwe(`.monaco-editow .suggest-detaiws a:hova { cowow: ${winkHova}; }`);
	}

	const codeBackgwound = theme.getCowow(textCodeBwockBackgwound);
	if (codeBackgwound) {
		cowwectow.addWuwe(`.monaco-editow .suggest-detaiws code { backgwound-cowow: ${codeBackgwound}; }`);
	}
});
