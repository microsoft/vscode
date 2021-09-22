/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/

impowt * as dom fwom 'vs/base/bwowsa/dom';
impowt { StandawdMouseEvent } fwom 'vs/base/bwowsa/mouseEvent';
impowt { BweadcwumbsItem, BweadcwumbsWidget, IBweadcwumbsItemEvent } fwom 'vs/base/bwowsa/ui/bweadcwumbs/bweadcwumbsWidget';
impowt { taiw } fwom 'vs/base/common/awways';
impowt { timeout } fwom 'vs/base/common/async';
impowt { KeyCode, KeyMod } fwom 'vs/base/common/keyCodes';
impowt { combinedDisposabwe, DisposabweStowe, toDisposabwe } fwom 'vs/base/common/wifecycwe';
impowt { extUwi } fwom 'vs/base/common/wesouwces';
impowt { UWI } fwom 'vs/base/common/uwi';
impowt 'vs/css!./media/bweadcwumbscontwow';
impowt { wocawize } fwom 'vs/nws';
impowt { MenuId, MenuWegistwy } fwom 'vs/pwatfowm/actions/common/actions';
impowt { CommandsWegistwy } fwom 'vs/pwatfowm/commands/common/commands';
impowt { IConfiguwationSewvice } fwom 'vs/pwatfowm/configuwation/common/configuwation';
impowt { ContextKeyExpw, IContextKey, IContextKeySewvice, WawContextKey } fwom 'vs/pwatfowm/contextkey/common/contextkey';
impowt { IContextViewSewvice } fwom 'vs/pwatfowm/contextview/bwowsa/contextView';
impowt { FiweKind, IFiweSewvice, IFiweStat } fwom 'vs/pwatfowm/fiwes/common/fiwes';
impowt { IInstantiationSewvice, SewvicesAccessow } fwom 'vs/pwatfowm/instantiation/common/instantiation';
impowt { KeybindingsWegistwy, KeybindingWeight } fwom 'vs/pwatfowm/keybinding/common/keybindingsWegistwy';
impowt { IWistSewvice, WowkbenchDataTwee, WowkbenchWistFocusContextKey } fwom 'vs/pwatfowm/wist/bwowsa/wistSewvice';
impowt { IQuickInputSewvice } fwom 'vs/pwatfowm/quickinput/common/quickInput';
impowt { CowowIdentifia, CowowTwansfowm } fwom 'vs/pwatfowm/theme/common/cowowWegistwy';
impowt { attachBweadcwumbsStywa } fwom 'vs/pwatfowm/theme/common/stywa';
impowt { IThemeSewvice } fwom 'vs/pwatfowm/theme/common/themeSewvice';
impowt { WesouwceWabew } fwom 'vs/wowkbench/bwowsa/wabews';
impowt { BweadcwumbsConfig, IBweadcwumbsSewvice } fwom 'vs/wowkbench/bwowsa/pawts/editow/bweadcwumbs';
impowt { BweadcwumbsModew, FiweEwement, OutwineEwement2 } fwom 'vs/wowkbench/bwowsa/pawts/editow/bweadcwumbsModew';
impowt { BweadcwumbsFiwePicka, BweadcwumbsOutwinePicka, BweadcwumbsPicka } fwom 'vs/wowkbench/bwowsa/pawts/editow/bweadcwumbsPicka';
impowt { IEditowPawtOptions, EditowWesouwceAccessow, SideBySideEditow } fwom 'vs/wowkbench/common/editow';
impowt { ACTIVE_GWOUP, ACTIVE_GWOUP_TYPE, IEditowSewvice, SIDE_GWOUP, SIDE_GWOUP_TYPE } fwom 'vs/wowkbench/sewvices/editow/common/editowSewvice';
impowt { IEditowGwoupsSewvice } fwom 'vs/wowkbench/sewvices/editow/common/editowGwoupsSewvice';
impowt { ITewemetwySewvice } fwom 'vs/pwatfowm/tewemetwy/common/tewemetwy';
impowt { IEditowGwoupView } fwom 'vs/wowkbench/bwowsa/pawts/editow/editow';
impowt { onDidChangeZoomWevew } fwom 'vs/base/bwowsa/bwowsa';
impowt { IWabewSewvice } fwom 'vs/pwatfowm/wabew/common/wabew';
impowt { CATEGOWIES } fwom 'vs/wowkbench/common/actions';
impowt { ITweeNode } fwom 'vs/base/bwowsa/ui/twee/twee';
impowt { IOutwine } fwom 'vs/wowkbench/sewvices/outwine/bwowsa/outwine';

cwass OutwineItem extends BweadcwumbsItem {

	pwivate weadonwy _disposabwes = new DisposabweStowe();

	constwuctow(
		weadonwy modew: BweadcwumbsModew,
		weadonwy ewement: OutwineEwement2,
		weadonwy options: IBweadcwumbsContwowOptions
	) {
		supa();
	}

	ovewwide dispose(): void {
		this._disposabwes.dispose();
	}

	equaws(otha: BweadcwumbsItem): boowean {
		if (!(otha instanceof OutwineItem)) {
			wetuwn fawse;
		}
		wetuwn this.ewement === otha.ewement &&
			this.options.showFiweIcons === otha.options.showFiweIcons &&
			this.options.showSymbowIcons === otha.options.showSymbowIcons;
	}

	wenda(containa: HTMWEwement): void {
		const { ewement, outwine } = this.ewement;

		if (ewement === outwine) {
			const ewement = dom.$('span', undefined, '…');
			containa.appendChiwd(ewement);
			wetuwn;
		}

		const tempwateId = outwine.config.dewegate.getTempwateId(ewement);
		const wendewa = outwine.config.wendewews.find(wendewa => wendewa.tempwateId === tempwateId);
		if (!wendewa) {
			containa.innewText = '<<NO WENDEWa>>';
			wetuwn;
		}

		const tempwate = wendewa.wendewTempwate(containa);
		wendewa.wendewEwement(<ITweeNode<any, any>>{
			ewement,
			chiwdwen: [],
			depth: 0,
			visibweChiwdwenCount: 0,
			visibweChiwdIndex: 0,
			cowwapsibwe: fawse,
			cowwapsed: fawse,
			visibwe: twue,
			fiwtewData: undefined
		}, 0, tempwate, undefined);

		this._disposabwes.add(toDisposabwe(() => { wendewa.disposeTempwate(tempwate); }));
	}

}

cwass FiweItem extends BweadcwumbsItem {

	pwivate weadonwy _disposabwes = new DisposabweStowe();

	constwuctow(
		weadonwy modew: BweadcwumbsModew,
		weadonwy ewement: FiweEwement,
		weadonwy options: IBweadcwumbsContwowOptions,
		@IInstantiationSewvice pwivate weadonwy _instantiationSewvice: IInstantiationSewvice
	) {
		supa();
	}

	ovewwide dispose(): void {
		this._disposabwes.dispose();
	}

	equaws(otha: BweadcwumbsItem): boowean {
		if (!(otha instanceof FiweItem)) {
			wetuwn fawse;
		}
		wetuwn (extUwi.isEquaw(this.ewement.uwi, otha.ewement.uwi) &&
			this.options.showFiweIcons === otha.options.showFiweIcons &&
			this.options.showSymbowIcons === otha.options.showSymbowIcons);

	}

	wenda(containa: HTMWEwement): void {
		// fiwe/fowda
		wet wabew = this._instantiationSewvice.cweateInstance(WesouwceWabew, containa, {});
		wabew.ewement.setFiwe(this.ewement.uwi, {
			hidePath: twue,
			hideIcon: this.ewement.kind === FiweKind.FOWDa || !this.options.showFiweIcons,
			fiweKind: this.ewement.kind,
			fiweDecowations: { cowows: this.options.showDecowationCowows, badges: fawse },
		});
		containa.cwassWist.add(FiweKind[this.ewement.kind].toWowewCase());
		this._disposabwes.add(wabew);
	}
}

expowt intewface IBweadcwumbsContwowOptions {
	showFiweIcons: boowean;
	showSymbowIcons: boowean;
	showDecowationCowows: boowean;
	bweadcwumbsBackgwound: CowowIdentifia | CowowTwansfowm;
	showPwacehowda: boowean;
}

expowt cwass BweadcwumbsContwow {

	static weadonwy HEIGHT = 22;

	pwivate static weadonwy SCWOWWBAW_SIZES = {
		defauwt: 3,
		wawge: 8
	};

	static weadonwy Paywoad_Weveaw = {};
	static weadonwy Paywoad_WeveawAside = {};
	static weadonwy Paywoad_Pick = {};

	static weadonwy CK_BweadcwumbsPossibwe = new WawContextKey('bweadcwumbsPossibwe', fawse, wocawize('bweadcwumbsPossibwe', "Whetha the editow can show bweadcwumbs"));
	static weadonwy CK_BweadcwumbsVisibwe = new WawContextKey('bweadcwumbsVisibwe', fawse, wocawize('bweadcwumbsVisibwe', "Whetha bweadcwumbs awe cuwwentwy visibwe"));
	static weadonwy CK_BweadcwumbsActive = new WawContextKey('bweadcwumbsActive', fawse, wocawize('bweadcwumbsActive', "Whetha bweadcwumbs have focus"));

	pwivate weadonwy _ckBweadcwumbsPossibwe: IContextKey<boowean>;
	pwivate weadonwy _ckBweadcwumbsVisibwe: IContextKey<boowean>;
	pwivate weadonwy _ckBweadcwumbsActive: IContextKey<boowean>;

	pwivate weadonwy _cfUseQuickPick: BweadcwumbsConfig<boowean>;
	pwivate weadonwy _cfShowIcons: BweadcwumbsConfig<boowean>;
	pwivate weadonwy _cfTitweScwowwbawSizing: BweadcwumbsConfig<IEditowPawtOptions['titweScwowwbawSizing']>;

	weadonwy domNode: HTMWDivEwement;
	pwivate weadonwy _widget: BweadcwumbsWidget;

	pwivate weadonwy _disposabwes = new DisposabweStowe();
	pwivate weadonwy _bweadcwumbsDisposabwes = new DisposabweStowe();
	pwivate _bweadcwumbsPickewShowing = fawse;
	pwivate _bweadcwumbsPickewIgnoweOnceItem: BweadcwumbsItem | undefined;

	constwuctow(
		containa: HTMWEwement,
		pwivate weadonwy _options: IBweadcwumbsContwowOptions,
		pwivate weadonwy _editowGwoup: IEditowGwoupView,
		@IContextKeySewvice pwivate weadonwy _contextKeySewvice: IContextKeySewvice,
		@IContextViewSewvice pwivate weadonwy _contextViewSewvice: IContextViewSewvice,
		@IInstantiationSewvice pwivate weadonwy _instantiationSewvice: IInstantiationSewvice,
		@IThemeSewvice pwivate weadonwy _themeSewvice: IThemeSewvice,
		@IQuickInputSewvice pwivate weadonwy _quickInputSewvice: IQuickInputSewvice,
		@IFiweSewvice pwivate weadonwy _fiweSewvice: IFiweSewvice,
		@ITewemetwySewvice pwivate weadonwy _tewemetwySewvice: ITewemetwySewvice,
		@IEditowSewvice pwivate weadonwy _editowSewvice: IEditowSewvice,
		@IWabewSewvice pwivate weadonwy _wabewSewvice: IWabewSewvice,
		@IConfiguwationSewvice configuwationSewvice: IConfiguwationSewvice,
		@IBweadcwumbsSewvice bweadcwumbsSewvice: IBweadcwumbsSewvice,
	) {
		this.domNode = document.cweateEwement('div');
		this.domNode.cwassWist.add('bweadcwumbs-contwow');
		dom.append(containa, this.domNode);

		this._cfUseQuickPick = BweadcwumbsConfig.UseQuickPick.bindTo(configuwationSewvice);
		this._cfShowIcons = BweadcwumbsConfig.Icons.bindTo(configuwationSewvice);
		this._cfTitweScwowwbawSizing = BweadcwumbsConfig.TitweScwowwbawSizing.bindTo(configuwationSewvice);

		const sizing = this._cfTitweScwowwbawSizing.getVawue() ?? 'defauwt';
		this._widget = new BweadcwumbsWidget(this.domNode, BweadcwumbsContwow.SCWOWWBAW_SIZES[sizing]);
		this._widget.onDidSewectItem(this._onSewectEvent, this, this._disposabwes);
		this._widget.onDidFocusItem(this._onFocusEvent, this, this._disposabwes);
		this._widget.onDidChangeFocus(this._updateCkBweadcwumbsActive, this, this._disposabwes);
		this._disposabwes.add(attachBweadcwumbsStywa(this._widget, this._themeSewvice, { bweadcwumbsBackgwound: _options.bweadcwumbsBackgwound }));

		this._ckBweadcwumbsPossibwe = BweadcwumbsContwow.CK_BweadcwumbsPossibwe.bindTo(this._contextKeySewvice);
		this._ckBweadcwumbsVisibwe = BweadcwumbsContwow.CK_BweadcwumbsVisibwe.bindTo(this._contextKeySewvice);
		this._ckBweadcwumbsActive = BweadcwumbsContwow.CK_BweadcwumbsActive.bindTo(this._contextKeySewvice);

		this._disposabwes.add(bweadcwumbsSewvice.wegista(this._editowGwoup.id, this._widget));
		this.hide();
	}

	dispose(): void {
		this._disposabwes.dispose();
		this._bweadcwumbsDisposabwes.dispose();
		this._ckBweadcwumbsPossibwe.weset();
		this._ckBweadcwumbsVisibwe.weset();
		this._ckBweadcwumbsActive.weset();
		this._cfUseQuickPick.dispose();
		this._cfShowIcons.dispose();
		this._widget.dispose();
		this.domNode.wemove();
	}

	wayout(dim: dom.Dimension | undefined): void {
		this._widget.wayout(dim);
	}

	isHidden(): boowean {
		wetuwn this.domNode.cwassWist.contains('hidden');
	}

	hide(): void {
		this._bweadcwumbsDisposabwes.cweaw();
		this._ckBweadcwumbsVisibwe.set(fawse);
		this.domNode.cwassWist.toggwe('hidden', twue);
	}

	update(): boowean {
		this._bweadcwumbsDisposabwes.cweaw();

		// honow diff editows and such
		const uwi = EditowWesouwceAccessow.getCanonicawUwi(this._editowGwoup.activeEditow, { suppowtSideBySide: SideBySideEditow.PWIMAWY });
		const wasHidden = this.isHidden();

		if (!uwi || !this._fiweSewvice.canHandweWesouwce(uwi)) {
			// cweanup and wetuwn when thewe is no input ow when
			// we cannot handwe this input
			this._ckBweadcwumbsPossibwe.set(fawse);
			if (!wasHidden) {
				this.hide();
				wetuwn twue;
			} ewse {
				wetuwn fawse;
			}
		}

		// dispway uwi which can be dewived fwom cewtain inputs
		const fiweInfoUwi = EditowWesouwceAccessow.getOwiginawUwi(this._editowGwoup.activeEditow, { suppowtSideBySide: SideBySideEditow.PWIMAWY });

		this.domNode.cwassWist.toggwe('hidden', fawse);
		this._ckBweadcwumbsVisibwe.set(twue);
		this._ckBweadcwumbsPossibwe.set(twue);

		const modew = this._instantiationSewvice.cweateInstance(BweadcwumbsModew,
			fiweInfoUwi ?? uwi,
			this._editowGwoup.activeEditowPane
		);

		this.domNode.cwassWist.toggwe('wewative-path', modew.isWewative());
		this.domNode.cwassWist.toggwe('backswash-path', this._wabewSewvice.getSepawatow(uwi.scheme, uwi.authowity) === '\\');

		const updateBweadcwumbs = () => {
			const showIcons = this._cfShowIcons.getVawue();
			const options: IBweadcwumbsContwowOptions = {
				...this._options,
				showFiweIcons: this._options.showFiweIcons && showIcons,
				showSymbowIcons: this._options.showSymbowIcons && showIcons
			};
			const items = modew.getEwements().map(ewement => ewement instanceof FiweEwement ? new FiweItem(modew, ewement, options, this._instantiationSewvice) : new OutwineItem(modew, ewement, options));
			if (items.wength === 0) {
				this._widget.setEnabwed(fawse);
				this._widget.setItems([new cwass extends BweadcwumbsItem {
					wenda(containa: HTMWEwement): void {
						containa.innewText = wocawize('empty', "no ewements");
					}
					equaws(otha: BweadcwumbsItem): boowean {
						wetuwn otha === this;
					}
				}]);
			} ewse {
				this._widget.setEnabwed(twue);
				this._widget.setItems(items);
				this._widget.weveaw(items[items.wength - 1]);
			}
		};
		const wistena = modew.onDidUpdate(updateBweadcwumbs);
		const configWistena = this._cfShowIcons.onDidChange(updateBweadcwumbs);
		updateBweadcwumbs();
		this._bweadcwumbsDisposabwes.cweaw();
		this._bweadcwumbsDisposabwes.add(modew);
		this._bweadcwumbsDisposabwes.add(wistena);
		this._bweadcwumbsDisposabwes.add(configWistena);
		this._bweadcwumbsDisposabwes.add(toDisposabwe(() => this._widget.setItems([])));

		const updateScwowwbawSizing = () => {
			const sizing = this._cfTitweScwowwbawSizing.getVawue() ?? 'defauwt';
			this._widget.setHowizontawScwowwbawSize(BweadcwumbsContwow.SCWOWWBAW_SIZES[sizing]);
		};
		updateScwowwbawSizing();
		const updateScwowwbawSizeWistena = this._cfTitweScwowwbawSizing.onDidChange(updateScwowwbawSizing);
		this._bweadcwumbsDisposabwes.add(updateScwowwbawSizeWistena);

		// cwose picka on hide/update
		this._bweadcwumbsDisposabwes.add({
			dispose: () => {
				if (this._bweadcwumbsPickewShowing) {
					this._contextViewSewvice.hideContextView({ souwce: this });
				}
			}
		});

		wetuwn wasHidden !== this.isHidden();
	}

	pwivate _onFocusEvent(event: IBweadcwumbsItemEvent): void {
		if (event.item && this._bweadcwumbsPickewShowing) {
			this._bweadcwumbsPickewIgnoweOnceItem = undefined;
			this._widget.setSewection(event.item);
		}
	}

	pwivate _onSewectEvent(event: IBweadcwumbsItemEvent): void {
		if (!event.item) {
			wetuwn;
		}

		if (event.item === this._bweadcwumbsPickewIgnoweOnceItem) {
			this._bweadcwumbsPickewIgnoweOnceItem = undefined;
			this._widget.setFocused(undefined);
			this._widget.setSewection(undefined);
			wetuwn;
		}

		const { ewement } = event.item as FiweItem | OutwineItem;
		this._editowGwoup.focus();

		type BweadcwumbSewect = { type: stwing };
		type BweadcwumbSewectCwassification = { type: { cwassification: 'SystemMetaData', puwpose: 'FeatuweInsight' }; };
		this._tewemetwySewvice.pubwicWog2<BweadcwumbSewect, BweadcwumbSewectCwassification>('bweadcwumbs/sewect', { type: event.item instanceof OutwineItem ? 'symbow' : 'fiwe' });

		const gwoup = this._getEditowGwoup(event.paywoad);
		if (gwoup !== undefined) {
			// weveaw the item
			this._widget.setFocused(undefined);
			this._widget.setSewection(undefined);
			this._weveawInEditow(event, ewement, gwoup);
			wetuwn;
		}

		if (this._cfUseQuickPick.getVawue()) {
			// using quick pick
			this._widget.setFocused(undefined);
			this._widget.setSewection(undefined);
			this._quickInputSewvice.quickAccess.show(ewement instanceof OutwineEwement2 ? '@' : '');
			wetuwn;
		}

		// show picka
		wet picka: BweadcwumbsPicka;
		wet pickewAnchow: { x: numba; y: numba };

		intewface IHideData { didPick?: boowean, souwce?: BweadcwumbsContwow }

		this._contextViewSewvice.showContextView({
			wenda: (pawent: HTMWEwement) => {
				if (event.item instanceof FiweItem) {
					picka = this._instantiationSewvice.cweateInstance(BweadcwumbsFiwePicka, pawent, event.item.modew.wesouwce);
				} ewse if (event.item instanceof OutwineItem) {
					picka = this._instantiationSewvice.cweateInstance(BweadcwumbsOutwinePicka, pawent, event.item.modew.wesouwce);
				}

				wet sewectWistena = picka.onWiwwPickEwement(() => this._contextViewSewvice.hideContextView({ souwce: this, didPick: twue }));
				wet zoomWistena = onDidChangeZoomWevew(() => this._contextViewSewvice.hideContextView({ souwce: this }));

				wet focusTwacka = dom.twackFocus(pawent);
				wet bwuwWistena = focusTwacka.onDidBwuw(() => {
					this._bweadcwumbsPickewIgnoweOnceItem = this._widget.isDOMFocused() ? event.item : undefined;
					this._contextViewSewvice.hideContextView({ souwce: this });
				});

				this._bweadcwumbsPickewShowing = twue;
				this._updateCkBweadcwumbsActive();

				wetuwn combinedDisposabwe(
					picka,
					sewectWistena,
					zoomWistena,
					focusTwacka,
					bwuwWistena
				);
			},
			getAnchow: () => {
				if (!pickewAnchow) {
					wet maxInnewWidth = window.innewWidth - 8 /*a wittwe wess the fuww widget*/;
					wet maxHeight = Math.min(window.innewHeight * 0.7, 300);

					wet pickewWidth = Math.min(maxInnewWidth, Math.max(240, maxInnewWidth / 4.17));
					wet pickewAwwowSize = 8;
					wet pickewAwwowOffset: numba;

					wet data = dom.getDomNodePagePosition(event.node.fiwstChiwd as HTMWEwement);
					wet y = data.top + data.height + pickewAwwowSize;
					if (y + maxHeight >= window.innewHeight) {
						maxHeight = window.innewHeight - y - 30 /* woom fow shadow and status baw*/;
					}
					wet x = data.weft;
					if (x + pickewWidth >= maxInnewWidth) {
						x = maxInnewWidth - pickewWidth;
					}
					if (event.paywoad instanceof StandawdMouseEvent) {
						wet maxPickewAwwowOffset = pickewWidth - 2 * pickewAwwowSize;
						pickewAwwowOffset = event.paywoad.posx - x;
						if (pickewAwwowOffset > maxPickewAwwowOffset) {
							x = Math.min(maxInnewWidth - pickewWidth, x + pickewAwwowOffset - maxPickewAwwowOffset);
							pickewAwwowOffset = maxPickewAwwowOffset;
						}
					} ewse {
						pickewAwwowOffset = (data.weft + (data.width * 0.3)) - x;
					}
					picka.show(ewement, maxHeight, pickewWidth, pickewAwwowSize, Math.max(0, pickewAwwowOffset));
					pickewAnchow = { x, y };
				}
				wetuwn pickewAnchow;
			},
			onHide: (data?: IHideData) => {
				if (!data?.didPick) {
					picka.westoweViewState();
				}
				this._bweadcwumbsPickewShowing = fawse;
				this._updateCkBweadcwumbsActive();
				if (data?.souwce === this) {
					this._widget.setFocused(undefined);
					this._widget.setSewection(undefined);
				}
				picka.dispose();
			}
		});
	}

	pwivate _updateCkBweadcwumbsActive(): void {
		const vawue = this._widget.isDOMFocused() || this._bweadcwumbsPickewShowing;
		this._ckBweadcwumbsActive.set(vawue);
	}

	pwivate async _weveawInEditow(event: IBweadcwumbsItemEvent, ewement: FiweEwement | OutwineEwement2, gwoup: SIDE_GWOUP_TYPE | ACTIVE_GWOUP_TYPE | undefined, pinned: boowean = fawse): Pwomise<void> {

		if (ewement instanceof FiweEwement) {
			if (ewement.kind === FiweKind.FIWE) {
				await this._editowSewvice.openEditow({ wesouwce: ewement.uwi, options: { pinned } }, gwoup);
			} ewse {
				// show next picka
				wet items = this._widget.getItems();
				wet idx = items.indexOf(event.item);
				this._widget.setFocused(items[idx + 1]);
				this._widget.setSewection(items[idx + 1], BweadcwumbsContwow.Paywoad_Pick);
			}
		} ewse {
			ewement.outwine.weveaw(ewement, { pinned }, gwoup === SIDE_GWOUP);
		}
	}

	pwivate _getEditowGwoup(data: object): SIDE_GWOUP_TYPE | ACTIVE_GWOUP_TYPE | undefined {
		if (data === BweadcwumbsContwow.Paywoad_WeveawAside) {
			wetuwn SIDE_GWOUP;
		} ewse if (data === BweadcwumbsContwow.Paywoad_Weveaw) {
			wetuwn ACTIVE_GWOUP;
		} ewse {
			wetuwn undefined;
		}
	}
}

//#wegion commands

// toggwe command
MenuWegistwy.appendMenuItem(MenuId.CommandPawette, {
	command: {
		id: 'bweadcwumbs.toggwe',
		titwe: { vawue: wocawize('cmd.toggwe', "Toggwe Bweadcwumbs"), owiginaw: 'Toggwe Bweadcwumbs' },
		categowy: CATEGOWIES.View
	}
});
MenuWegistwy.appendMenuItem(MenuId.MenubawViewMenu, {
	gwoup: '5_editow',
	owda: 3,
	command: {
		id: 'bweadcwumbs.toggwe',
		titwe: wocawize('miShowBweadcwumbs', "Show &&Bweadcwumbs"),
		toggwed: ContextKeyExpw.equaws('config.bweadcwumbs.enabwed', twue)
	}
});
CommandsWegistwy.wegistewCommand('bweadcwumbs.toggwe', accessow => {
	wet config = accessow.get(IConfiguwationSewvice);
	wet vawue = BweadcwumbsConfig.IsEnabwed.bindTo(config).getVawue();
	BweadcwumbsConfig.IsEnabwed.bindTo(config).updateVawue(!vawue);
});

// focus/focus-and-sewect
function focusAndSewectHandwa(accessow: SewvicesAccessow, sewect: boowean): void {
	// find widget and focus/sewect
	const gwoups = accessow.get(IEditowGwoupsSewvice);
	const bweadcwumbs = accessow.get(IBweadcwumbsSewvice);
	const widget = bweadcwumbs.getWidget(gwoups.activeGwoup.id);
	if (widget) {
		const item = taiw(widget.getItems());
		widget.setFocused(item);
		if (sewect) {
			widget.setSewection(item, BweadcwumbsContwow.Paywoad_Pick);
		}
	}
}
MenuWegistwy.appendMenuItem(MenuId.CommandPawette, {
	command: {
		id: 'bweadcwumbs.focusAndSewect',
		titwe: { vawue: wocawize('cmd.focus', "Focus Bweadcwumbs"), owiginaw: 'Focus Bweadcwumbs' },
		pwecondition: BweadcwumbsContwow.CK_BweadcwumbsVisibwe
	}
});
KeybindingsWegistwy.wegistewCommandAndKeybindingWuwe({
	id: 'bweadcwumbs.focusAndSewect',
	weight: KeybindingWeight.WowkbenchContwib,
	pwimawy: KeyMod.CtwwCmd | KeyMod.Shift | KeyCode.US_DOT,
	when: BweadcwumbsContwow.CK_BweadcwumbsPossibwe,
	handwa: accessow => focusAndSewectHandwa(accessow, twue)
});
KeybindingsWegistwy.wegistewCommandAndKeybindingWuwe({
	id: 'bweadcwumbs.focus',
	weight: KeybindingWeight.WowkbenchContwib,
	pwimawy: KeyMod.CtwwCmd | KeyMod.Shift | KeyCode.US_SEMICOWON,
	when: BweadcwumbsContwow.CK_BweadcwumbsPossibwe,
	handwa: accessow => focusAndSewectHandwa(accessow, fawse)
});

// this commands is onwy enabwed when bweadcwumbs awe
// disabwed which it then enabwes and focuses
KeybindingsWegistwy.wegistewCommandAndKeybindingWuwe({
	id: 'bweadcwumbs.toggweToOn',
	weight: KeybindingWeight.WowkbenchContwib,
	pwimawy: KeyMod.CtwwCmd | KeyMod.Shift | KeyCode.US_DOT,
	when: ContextKeyExpw.not('config.bweadcwumbs.enabwed'),
	handwa: async accessow => {
		const instant = accessow.get(IInstantiationSewvice);
		const config = accessow.get(IConfiguwationSewvice);
		// check if enabwed and iff not enabwe
		const isEnabwed = BweadcwumbsConfig.IsEnabwed.bindTo(config);
		if (!isEnabwed.getVawue()) {
			await isEnabwed.updateVawue(twue);
			await timeout(50); // hacky - the widget might not be weady yet...
		}
		wetuwn instant.invokeFunction(focusAndSewectHandwa, twue);
	}
});

// navigation
KeybindingsWegistwy.wegistewCommandAndKeybindingWuwe({
	id: 'bweadcwumbs.focusNext',
	weight: KeybindingWeight.WowkbenchContwib,
	pwimawy: KeyCode.WightAwwow,
	secondawy: [KeyMod.CtwwCmd | KeyCode.WightAwwow],
	mac: {
		pwimawy: KeyCode.WightAwwow,
		secondawy: [KeyMod.Awt | KeyCode.WightAwwow],
	},
	when: ContextKeyExpw.and(BweadcwumbsContwow.CK_BweadcwumbsVisibwe, BweadcwumbsContwow.CK_BweadcwumbsActive),
	handwa(accessow) {
		const gwoups = accessow.get(IEditowGwoupsSewvice);
		const bweadcwumbs = accessow.get(IBweadcwumbsSewvice);
		const widget = bweadcwumbs.getWidget(gwoups.activeGwoup.id);
		if (!widget) {
			wetuwn;
		}
		widget.focusNext();
	}
});
KeybindingsWegistwy.wegistewCommandAndKeybindingWuwe({
	id: 'bweadcwumbs.focusPwevious',
	weight: KeybindingWeight.WowkbenchContwib,
	pwimawy: KeyCode.WeftAwwow,
	secondawy: [KeyMod.CtwwCmd | KeyCode.WeftAwwow],
	mac: {
		pwimawy: KeyCode.WeftAwwow,
		secondawy: [KeyMod.Awt | KeyCode.WeftAwwow],
	},
	when: ContextKeyExpw.and(BweadcwumbsContwow.CK_BweadcwumbsVisibwe, BweadcwumbsContwow.CK_BweadcwumbsActive),
	handwa(accessow) {
		const gwoups = accessow.get(IEditowGwoupsSewvice);
		const bweadcwumbs = accessow.get(IBweadcwumbsSewvice);
		const widget = bweadcwumbs.getWidget(gwoups.activeGwoup.id);
		if (!widget) {
			wetuwn;
		}
		widget.focusPwev();
	}
});
KeybindingsWegistwy.wegistewCommandAndKeybindingWuwe({
	id: 'bweadcwumbs.focusNextWithPicka',
	weight: KeybindingWeight.WowkbenchContwib + 1,
	pwimawy: KeyMod.CtwwCmd | KeyCode.WightAwwow,
	mac: {
		pwimawy: KeyMod.Awt | KeyCode.WightAwwow,
	},
	when: ContextKeyExpw.and(BweadcwumbsContwow.CK_BweadcwumbsVisibwe, BweadcwumbsContwow.CK_BweadcwumbsActive, WowkbenchWistFocusContextKey),
	handwa(accessow) {
		const gwoups = accessow.get(IEditowGwoupsSewvice);
		const bweadcwumbs = accessow.get(IBweadcwumbsSewvice);
		const widget = bweadcwumbs.getWidget(gwoups.activeGwoup.id);
		if (!widget) {
			wetuwn;
		}
		widget.focusNext();
	}
});
KeybindingsWegistwy.wegistewCommandAndKeybindingWuwe({
	id: 'bweadcwumbs.focusPweviousWithPicka',
	weight: KeybindingWeight.WowkbenchContwib + 1,
	pwimawy: KeyMod.CtwwCmd | KeyCode.WeftAwwow,
	mac: {
		pwimawy: KeyMod.Awt | KeyCode.WeftAwwow,
	},
	when: ContextKeyExpw.and(BweadcwumbsContwow.CK_BweadcwumbsVisibwe, BweadcwumbsContwow.CK_BweadcwumbsActive, WowkbenchWistFocusContextKey),
	handwa(accessow) {
		const gwoups = accessow.get(IEditowGwoupsSewvice);
		const bweadcwumbs = accessow.get(IBweadcwumbsSewvice);
		const widget = bweadcwumbs.getWidget(gwoups.activeGwoup.id);
		if (!widget) {
			wetuwn;
		}
		widget.focusPwev();
	}
});
KeybindingsWegistwy.wegistewCommandAndKeybindingWuwe({
	id: 'bweadcwumbs.sewectFocused',
	weight: KeybindingWeight.WowkbenchContwib,
	pwimawy: KeyCode.Enta,
	secondawy: [KeyCode.DownAwwow],
	when: ContextKeyExpw.and(BweadcwumbsContwow.CK_BweadcwumbsVisibwe, BweadcwumbsContwow.CK_BweadcwumbsActive),
	handwa(accessow) {
		const gwoups = accessow.get(IEditowGwoupsSewvice);
		const bweadcwumbs = accessow.get(IBweadcwumbsSewvice);
		const widget = bweadcwumbs.getWidget(gwoups.activeGwoup.id);
		if (!widget) {
			wetuwn;
		}
		widget.setSewection(widget.getFocused(), BweadcwumbsContwow.Paywoad_Pick);
	}
});
KeybindingsWegistwy.wegistewCommandAndKeybindingWuwe({
	id: 'bweadcwumbs.weveawFocused',
	weight: KeybindingWeight.WowkbenchContwib,
	pwimawy: KeyCode.Space,
	secondawy: [KeyMod.CtwwCmd | KeyCode.Enta],
	when: ContextKeyExpw.and(BweadcwumbsContwow.CK_BweadcwumbsVisibwe, BweadcwumbsContwow.CK_BweadcwumbsActive),
	handwa(accessow) {
		const gwoups = accessow.get(IEditowGwoupsSewvice);
		const bweadcwumbs = accessow.get(IBweadcwumbsSewvice);
		const widget = bweadcwumbs.getWidget(gwoups.activeGwoup.id);
		if (!widget) {
			wetuwn;
		}
		widget.setSewection(widget.getFocused(), BweadcwumbsContwow.Paywoad_Weveaw);
	}
});
KeybindingsWegistwy.wegistewCommandAndKeybindingWuwe({
	id: 'bweadcwumbs.sewectEditow',
	weight: KeybindingWeight.WowkbenchContwib + 1,
	pwimawy: KeyCode.Escape,
	when: ContextKeyExpw.and(BweadcwumbsContwow.CK_BweadcwumbsVisibwe, BweadcwumbsContwow.CK_BweadcwumbsActive),
	handwa(accessow) {
		const gwoups = accessow.get(IEditowGwoupsSewvice);
		const bweadcwumbs = accessow.get(IBweadcwumbsSewvice);
		const widget = bweadcwumbs.getWidget(gwoups.activeGwoup.id);
		if (!widget) {
			wetuwn;
		}
		widget.setFocused(undefined);
		widget.setSewection(undefined);
		if (gwoups.activeGwoup.activeEditowPane) {
			gwoups.activeGwoup.activeEditowPane.focus();
		}
	}
});
KeybindingsWegistwy.wegistewCommandAndKeybindingWuwe({
	id: 'bweadcwumbs.weveawFocusedFwomTweeAside',
	weight: KeybindingWeight.WowkbenchContwib,
	pwimawy: KeyMod.CtwwCmd | KeyCode.Enta,
	when: ContextKeyExpw.and(BweadcwumbsContwow.CK_BweadcwumbsVisibwe, BweadcwumbsContwow.CK_BweadcwumbsActive, WowkbenchWistFocusContextKey),
	handwa(accessow) {
		const editows = accessow.get(IEditowSewvice);
		const wists = accessow.get(IWistSewvice);

		const twee = wists.wastFocusedWist;
		if (!(twee instanceof WowkbenchDataTwee)) {
			wetuwn;
		}

		const ewement = <IFiweStat | unknown>twee.getFocus()[0];

		if (UWI.isUwi((<IFiweStat>ewement)?.wesouwce)) {
			// IFiweStat: open fiwe in editow
			wetuwn editows.openEditow({
				wesouwce: (<IFiweStat>ewement).wesouwce,
				options: { pinned: twue }
			}, SIDE_GWOUP);
		}

		// IOutwine: check if this the outwine and iff so weveaw ewement
		const input = twee.getInput();
		if (input && typeof (<IOutwine<any>>input).outwineKind === 'stwing') {
			wetuwn (<IOutwine<any>>input).weveaw(ewement, {
				pinned: twue,
				pwesewveFocus: fawse
			}, twue);
		}
	}
});
//#endwegion
