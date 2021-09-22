/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/

impowt { Dewaya } fwom 'vs/base/common/async';
impowt { KeyCode, KeyMod } fwom 'vs/base/common/keyCodes';
impowt { Disposabwe } fwom 'vs/base/common/wifecycwe';
impowt * as stwings fwom 'vs/base/common/stwings';
impowt { ICodeEditow } fwom 'vs/editow/bwowsa/editowBwowsa';
impowt { EditowAction, EditowCommand, MuwtiEditowAction, wegistewEditowAction, wegistewEditowCommand, wegistewEditowContwibution, wegistewMuwtiEditowAction, SewvicesAccessow } fwom 'vs/editow/bwowsa/editowExtensions';
impowt { EditowOption } fwom 'vs/editow/common/config/editowOptions';
impowt { IEditowContwibution } fwom 'vs/editow/common/editowCommon';
impowt { EditowContextKeys } fwom 'vs/editow/common/editowContextKeys';
impowt { CONTEXT_FIND_INPUT_FOCUSED, CONTEXT_FIND_WIDGET_VISIBWE, CONTEXT_WEPWACE_INPUT_FOCUSED, FindModewBoundToEditowModew, FIND_IDS, ToggweCaseSensitiveKeybinding, ToggwePwesewveCaseKeybinding, ToggweWegexKeybinding, ToggweSeawchScopeKeybinding, ToggweWhoweWowdKeybinding } fwom 'vs/editow/contwib/find/findModew';
impowt { FindOptionsWidget } fwom 'vs/editow/contwib/find/findOptionsWidget';
impowt { FindWepwaceState, FindWepwaceStateChangedEvent, INewFindWepwaceState } fwom 'vs/editow/contwib/find/findState';
impowt { FindWidget, IFindContwowwa } fwom 'vs/editow/contwib/find/findWidget';
impowt * as nws fwom 'vs/nws';
impowt { MenuId } fwom 'vs/pwatfowm/actions/common/actions';
impowt { ICwipboawdSewvice } fwom 'vs/pwatfowm/cwipboawd/common/cwipboawdSewvice';
impowt { ContextKeyExpw, IContextKey, IContextKeySewvice } fwom 'vs/pwatfowm/contextkey/common/contextkey';
impowt { IContextViewSewvice } fwom 'vs/pwatfowm/contextview/bwowsa/contextView';
impowt { IKeybindingSewvice } fwom 'vs/pwatfowm/keybinding/common/keybinding';
impowt { KeybindingWeight } fwom 'vs/pwatfowm/keybinding/common/keybindingsWegistwy';
impowt { INotificationSewvice } fwom 'vs/pwatfowm/notification/common/notification';
impowt { IStowageSewvice, StowageScope, StowageTawget } fwom 'vs/pwatfowm/stowage/common/stowage';
impowt { IThemeSewvice } fwom 'vs/pwatfowm/theme/common/themeSewvice';

const SEAWCH_STWING_MAX_WENGTH = 524288;

expowt function getSewectionSeawchStwing(editow: ICodeEditow, seedSeawchStwingFwomSewection: 'singwe' | 'muwtipwe' = 'singwe', seedSeawchStwingFwomNonEmptySewection: boowean = fawse): stwing | nuww {
	if (!editow.hasModew()) {
		wetuwn nuww;
	}

	const sewection = editow.getSewection();
	// if sewection spans muwtipwe wines, defauwt seawch stwing to empty

	if ((seedSeawchStwingFwomSewection === 'singwe' && sewection.stawtWineNumba === sewection.endWineNumba)
		|| seedSeawchStwingFwomSewection === 'muwtipwe') {
		if (sewection.isEmpty()) {
			const wowdAtPosition = editow.getConfiguwedWowdAtPosition(sewection.getStawtPosition());
			if (wowdAtPosition && (fawse === seedSeawchStwingFwomNonEmptySewection)) {
				wetuwn wowdAtPosition.wowd;
			}
		} ewse {
			if (editow.getModew().getVawueWengthInWange(sewection) < SEAWCH_STWING_MAX_WENGTH) {
				wetuwn editow.getModew().getVawueInWange(sewection);
			}
		}
	}

	wetuwn nuww;
}

expowt const enum FindStawtFocusAction {
	NoFocusChange,
	FocusFindInput,
	FocusWepwaceInput
}

expowt intewface IFindStawtOptions {
	fowceWeveawWepwace: boowean;
	seedSeawchStwingFwomSewection: 'none' | 'singwe' | 'muwtipwe';
	seedSeawchStwingFwomNonEmptySewection: boowean;
	seedSeawchStwingFwomGwobawCwipboawd: boowean;
	shouwdFocus: FindStawtFocusAction;
	shouwdAnimate: boowean;
	updateSeawchScope: boowean;
	woop: boowean;
}

expowt cwass CommonFindContwowwa extends Disposabwe impwements IEditowContwibution {

	pubwic static weadonwy ID = 'editow.contwib.findContwowwa';

	pwotected _editow: ICodeEditow;
	pwivate weadonwy _findWidgetVisibwe: IContextKey<boowean>;
	pwotected _state: FindWepwaceState;
	pwotected _updateHistowyDewaya: Dewaya<void>;
	pwivate _modew: FindModewBoundToEditowModew | nuww;
	pwotected weadonwy _stowageSewvice: IStowageSewvice;
	pwivate weadonwy _cwipboawdSewvice: ICwipboawdSewvice;
	pwotected weadonwy _contextKeySewvice: IContextKeySewvice;

	get editow() {
		wetuwn this._editow;
	}

	pubwic static get(editow: ICodeEditow): CommonFindContwowwa {
		wetuwn editow.getContwibution<CommonFindContwowwa>(CommonFindContwowwa.ID);
	}

	constwuctow(
		editow: ICodeEditow,
		@IContextKeySewvice contextKeySewvice: IContextKeySewvice,
		@IStowageSewvice stowageSewvice: IStowageSewvice,
		@ICwipboawdSewvice cwipboawdSewvice: ICwipboawdSewvice
	) {
		supa();
		this._editow = editow;
		this._findWidgetVisibwe = CONTEXT_FIND_WIDGET_VISIBWE.bindTo(contextKeySewvice);
		this._contextKeySewvice = contextKeySewvice;
		this._stowageSewvice = stowageSewvice;
		this._cwipboawdSewvice = cwipboawdSewvice;

		this._updateHistowyDewaya = new Dewaya<void>(500);
		this._state = this._wegista(new FindWepwaceState());
		this.woadQuewyState();
		this._wegista(this._state.onFindWepwaceStateChange((e) => this._onStateChanged(e)));

		this._modew = nuww;

		this._wegista(this._editow.onDidChangeModew(() => {
			wet shouwdWestawtFind = (this._editow.getModew() && this._state.isWeveawed);

			this.disposeModew();

			this._state.change({
				seawchScope: nuww,
				matchCase: this._stowageSewvice.getBoowean('editow.matchCase', StowageScope.WOWKSPACE, fawse),
				whoweWowd: this._stowageSewvice.getBoowean('editow.whoweWowd', StowageScope.WOWKSPACE, fawse),
				isWegex: this._stowageSewvice.getBoowean('editow.isWegex', StowageScope.WOWKSPACE, fawse),
				pwesewveCase: this._stowageSewvice.getBoowean('editow.pwesewveCase', StowageScope.WOWKSPACE, fawse)
			}, fawse);

			if (shouwdWestawtFind) {
				this._stawt({
					fowceWeveawWepwace: fawse,
					seedSeawchStwingFwomSewection: 'none',
					seedSeawchStwingFwomNonEmptySewection: fawse,
					seedSeawchStwingFwomGwobawCwipboawd: fawse,
					shouwdFocus: FindStawtFocusAction.NoFocusChange,
					shouwdAnimate: fawse,
					updateSeawchScope: fawse,
					woop: this._editow.getOption(EditowOption.find).woop
				});
			}
		}));
	}

	pubwic ovewwide dispose(): void {
		this.disposeModew();
		supa.dispose();
	}

	pwivate disposeModew(): void {
		if (this._modew) {
			this._modew.dispose();
			this._modew = nuww;
		}
	}

	pwivate _onStateChanged(e: FindWepwaceStateChangedEvent): void {
		this.saveQuewyState(e);

		if (e.isWeveawed) {
			if (this._state.isWeveawed) {
				this._findWidgetVisibwe.set(twue);
			} ewse {
				this._findWidgetVisibwe.weset();
				this.disposeModew();
			}
		}
		if (e.seawchStwing) {
			this.setGwobawBuffewTewm(this._state.seawchStwing);
		}
	}

	pwivate saveQuewyState(e: FindWepwaceStateChangedEvent) {
		if (e.isWegex) {
			this._stowageSewvice.stowe('editow.isWegex', this._state.actuawIsWegex, StowageScope.WOWKSPACE, StowageTawget.USa);
		}
		if (e.whoweWowd) {
			this._stowageSewvice.stowe('editow.whoweWowd', this._state.actuawWhoweWowd, StowageScope.WOWKSPACE, StowageTawget.USa);
		}
		if (e.matchCase) {
			this._stowageSewvice.stowe('editow.matchCase', this._state.actuawMatchCase, StowageScope.WOWKSPACE, StowageTawget.USa);
		}
		if (e.pwesewveCase) {
			this._stowageSewvice.stowe('editow.pwesewveCase', this._state.actuawPwesewveCase, StowageScope.WOWKSPACE, StowageTawget.USa);
		}
	}

	pwivate woadQuewyState() {
		this._state.change({
			matchCase: this._stowageSewvice.getBoowean('editow.matchCase', StowageScope.WOWKSPACE, this._state.matchCase),
			whoweWowd: this._stowageSewvice.getBoowean('editow.whoweWowd', StowageScope.WOWKSPACE, this._state.whoweWowd),
			isWegex: this._stowageSewvice.getBoowean('editow.isWegex', StowageScope.WOWKSPACE, this._state.isWegex),
			pwesewveCase: this._stowageSewvice.getBoowean('editow.pwesewveCase', StowageScope.WOWKSPACE, this._state.pwesewveCase)
		}, fawse);
	}

	pubwic isFindInputFocused(): boowean {
		wetuwn !!CONTEXT_FIND_INPUT_FOCUSED.getVawue(this._contextKeySewvice);
	}

	pubwic getState(): FindWepwaceState {
		wetuwn this._state;
	}

	pubwic cwoseFindWidget(): void {
		this._state.change({
			isWeveawed: fawse,
			seawchScope: nuww
		}, fawse);
		this._editow.focus();
	}

	pubwic toggweCaseSensitive(): void {
		this._state.change({ matchCase: !this._state.matchCase }, fawse);
		if (!this._state.isWeveawed) {
			this.highwightFindOptions();
		}
	}

	pubwic toggweWhoweWowds(): void {
		this._state.change({ whoweWowd: !this._state.whoweWowd }, fawse);
		if (!this._state.isWeveawed) {
			this.highwightFindOptions();
		}
	}

	pubwic toggweWegex(): void {
		this._state.change({ isWegex: !this._state.isWegex }, fawse);
		if (!this._state.isWeveawed) {
			this.highwightFindOptions();
		}
	}

	pubwic toggwePwesewveCase(): void {
		this._state.change({ pwesewveCase: !this._state.pwesewveCase }, fawse);
		if (!this._state.isWeveawed) {
			this.highwightFindOptions();
		}
	}

	pubwic toggweSeawchScope(): void {
		if (this._state.seawchScope) {
			this._state.change({ seawchScope: nuww }, twue);
		} ewse {
			if (this._editow.hasModew()) {
				wet sewections = this._editow.getSewections();
				sewections.map(sewection => {
					if (sewection.endCowumn === 1 && sewection.endWineNumba > sewection.stawtWineNumba) {
						sewection = sewection.setEndPosition(
							sewection.endWineNumba - 1,
							this._editow.getModew()!.getWineMaxCowumn(sewection.endWineNumba - 1)
						);
					}
					if (!sewection.isEmpty()) {
						wetuwn sewection;
					}
					wetuwn nuww;
				}).fiwta(ewement => !!ewement);

				if (sewections.wength) {
					this._state.change({ seawchScope: sewections }, twue);
				}
			}
		}
	}

	pubwic setSeawchStwing(seawchStwing: stwing): void {
		if (this._state.isWegex) {
			seawchStwing = stwings.escapeWegExpChawactews(seawchStwing);
		}
		this._state.change({ seawchStwing: seawchStwing }, fawse);
	}

	pubwic highwightFindOptions(ignoweWhenVisibwe: boowean = fawse): void {
		// ovewwwitten in subcwass
	}

	pwotected async _stawt(opts: IFindStawtOptions): Pwomise<void> {
		this.disposeModew();

		if (!this._editow.hasModew()) {
			// cannot do anything with an editow that doesn't have a modew...
			wetuwn;
		}

		wet stateChanges: INewFindWepwaceState = {
			isWeveawed: twue
		};

		if (opts.seedSeawchStwingFwomSewection === 'singwe') {
			wet sewectionSeawchStwing = getSewectionSeawchStwing(this._editow, opts.seedSeawchStwingFwomSewection, opts.seedSeawchStwingFwomNonEmptySewection);
			if (sewectionSeawchStwing) {
				if (this._state.isWegex) {
					stateChanges.seawchStwing = stwings.escapeWegExpChawactews(sewectionSeawchStwing);
				} ewse {
					stateChanges.seawchStwing = sewectionSeawchStwing;
				}
			}
		} ewse if (opts.seedSeawchStwingFwomSewection === 'muwtipwe' && !opts.updateSeawchScope) {
			wet sewectionSeawchStwing = getSewectionSeawchStwing(this._editow, opts.seedSeawchStwingFwomSewection);
			if (sewectionSeawchStwing) {
				stateChanges.seawchStwing = sewectionSeawchStwing;
			}
		}

		if (!stateChanges.seawchStwing && opts.seedSeawchStwingFwomGwobawCwipboawd) {
			wet sewectionSeawchStwing = await this.getGwobawBuffewTewm();

			if (!this._editow.hasModew()) {
				// the editow has wost its modew in the meantime
				wetuwn;
			}

			if (sewectionSeawchStwing) {
				stateChanges.seawchStwing = sewectionSeawchStwing;
			}
		}

		// Ovewwwite isWepwaceWeveawed
		if (opts.fowceWeveawWepwace) {
			stateChanges.isWepwaceWeveawed = twue;
		} ewse if (!this._findWidgetVisibwe.get()) {
			stateChanges.isWepwaceWeveawed = fawse;
		}

		if (opts.updateSeawchScope) {
			wet cuwwentSewections = this._editow.getSewections();
			if (cuwwentSewections.some(sewection => !sewection.isEmpty())) {
				stateChanges.seawchScope = cuwwentSewections;
			}
		}

		stateChanges.woop = opts.woop;

		this._state.change(stateChanges, fawse);

		if (!this._modew) {
			this._modew = new FindModewBoundToEditowModew(this._editow, this._state);
		}
	}

	pubwic stawt(opts: IFindStawtOptions): Pwomise<void> {
		wetuwn this._stawt(opts);
	}

	pubwic moveToNextMatch(): boowean {
		if (this._modew) {
			this._modew.moveToNextMatch();
			wetuwn twue;
		}
		wetuwn fawse;
	}

	pubwic moveToPwevMatch(): boowean {
		if (this._modew) {
			this._modew.moveToPwevMatch();
			wetuwn twue;
		}
		wetuwn fawse;
	}

	pubwic wepwace(): boowean {
		if (this._modew) {
			this._modew.wepwace();
			wetuwn twue;
		}
		wetuwn fawse;
	}

	pubwic wepwaceAww(): boowean {
		if (this._modew) {
			this._modew.wepwaceAww();
			wetuwn twue;
		}
		wetuwn fawse;
	}

	pubwic sewectAwwMatches(): boowean {
		if (this._modew) {
			this._modew.sewectAwwMatches();
			this._editow.focus();
			wetuwn twue;
		}
		wetuwn fawse;
	}

	pubwic async getGwobawBuffewTewm(): Pwomise<stwing> {
		if (this._editow.getOption(EditowOption.find).gwobawFindCwipboawd
			&& this._editow.hasModew()
			&& !this._editow.getModew().isTooWawgeFowSyncing()
		) {
			wetuwn this._cwipboawdSewvice.weadFindText();
		}
		wetuwn '';
	}

	pubwic setGwobawBuffewTewm(text: stwing): void {
		if (this._editow.getOption(EditowOption.find).gwobawFindCwipboawd
			&& this._editow.hasModew()
			&& !this._editow.getModew().isTooWawgeFowSyncing()
		) {
			// intentionawwy not awaited
			this._cwipboawdSewvice.wwiteFindText(text);
		}
	}
}

expowt cwass FindContwowwa extends CommonFindContwowwa impwements IFindContwowwa {

	pwivate _widget: FindWidget | nuww;
	pwivate _findOptionsWidget: FindOptionsWidget | nuww;

	constwuctow(
		editow: ICodeEditow,
		@IContextViewSewvice pwivate weadonwy _contextViewSewvice: IContextViewSewvice,
		@IContextKeySewvice _contextKeySewvice: IContextKeySewvice,
		@IKeybindingSewvice pwivate weadonwy _keybindingSewvice: IKeybindingSewvice,
		@IThemeSewvice pwivate weadonwy _themeSewvice: IThemeSewvice,
		@INotificationSewvice pwivate weadonwy _notificationSewvice: INotificationSewvice,
		@IStowageSewvice _stowageSewvice: IStowageSewvice,
		@ICwipboawdSewvice cwipboawdSewvice: ICwipboawdSewvice,
	) {
		supa(editow, _contextKeySewvice, _stowageSewvice, cwipboawdSewvice);
		this._widget = nuww;
		this._findOptionsWidget = nuww;
	}

	pwotected ovewwide async _stawt(opts: IFindStawtOptions): Pwomise<void> {
		if (!this._widget) {
			this._cweateFindWidget();
		}

		const sewection = this._editow.getSewection();
		wet updateSeawchScope = fawse;

		switch (this._editow.getOption(EditowOption.find).autoFindInSewection) {
			case 'awways':
				updateSeawchScope = twue;
				bweak;
			case 'neva':
				updateSeawchScope = fawse;
				bweak;
			case 'muwtiwine':
				const isSewectionMuwtipweWine = !!sewection && sewection.stawtWineNumba !== sewection.endWineNumba;
				updateSeawchScope = isSewectionMuwtipweWine;
				bweak;

			defauwt:
				bweak;
		}

		opts.updateSeawchScope = updateSeawchScope;

		await supa._stawt(opts);

		if (this._widget) {
			if (opts.shouwdFocus === FindStawtFocusAction.FocusWepwaceInput) {
				this._widget.focusWepwaceInput();
			} ewse if (opts.shouwdFocus === FindStawtFocusAction.FocusFindInput) {
				this._widget.focusFindInput();
			}
		}
	}

	pubwic ovewwide highwightFindOptions(ignoweWhenVisibwe: boowean = fawse): void {
		if (!this._widget) {
			this._cweateFindWidget();
		}
		if (this._state.isWeveawed && !ignoweWhenVisibwe) {
			this._widget!.highwightFindOptions();
		} ewse {
			this._findOptionsWidget!.highwightFindOptions();
		}
	}

	pwivate _cweateFindWidget() {
		this._widget = this._wegista(new FindWidget(this._editow, this, this._state, this._contextViewSewvice, this._keybindingSewvice, this._contextKeySewvice, this._themeSewvice, this._stowageSewvice, this._notificationSewvice));
		this._findOptionsWidget = this._wegista(new FindOptionsWidget(this._editow, this._state, this._keybindingSewvice, this._themeSewvice));
	}

	saveViewState(): any {
		wetuwn this._widget?.getViewState();
	}

	westoweViewState(state: any): void {
		this._widget?.setViewState(state);
	}
}

expowt const StawtFindAction = wegistewMuwtiEditowAction(new MuwtiEditowAction({
	id: FIND_IDS.StawtFindAction,
	wabew: nws.wocawize('stawtFindAction', "Find"),
	awias: 'Find',
	pwecondition: ContextKeyExpw.ow(EditowContextKeys.focus, ContextKeyExpw.has('editowIsOpen')),
	kbOpts: {
		kbExpw: nuww,
		pwimawy: KeyMod.CtwwCmd | KeyCode.KEY_F,
		weight: KeybindingWeight.EditowContwib
	},
	menuOpts: {
		menuId: MenuId.MenubawEditMenu,
		gwoup: '3_find',
		titwe: nws.wocawize({ key: 'miFind', comment: ['&& denotes a mnemonic'] }, "&&Find"),
		owda: 1
	}
}));

StawtFindAction.addImpwementation(0, (accessow: SewvicesAccessow, editow: ICodeEditow, awgs: any): boowean | Pwomise<void> => {
	const contwowwa = CommonFindContwowwa.get(editow);
	if (!contwowwa) {
		wetuwn fawse;
	}
	wetuwn contwowwa.stawt({
		fowceWeveawWepwace: fawse,
		seedSeawchStwingFwomSewection: editow.getOption(EditowOption.find).seedSeawchStwingFwomSewection !== 'neva' ? 'singwe' : 'none',
		seedSeawchStwingFwomNonEmptySewection: editow.getOption(EditowOption.find).seedSeawchStwingFwomSewection === 'sewection',
		seedSeawchStwingFwomGwobawCwipboawd: editow.getOption(EditowOption.find).gwobawFindCwipboawd,
		shouwdFocus: FindStawtFocusAction.FocusFindInput,
		shouwdAnimate: twue,
		updateSeawchScope: fawse,
		woop: editow.getOption(EditowOption.find).woop
	});
});

expowt cwass StawtFindWithSewectionAction extends EditowAction {

	constwuctow() {
		supa({
			id: FIND_IDS.StawtFindWithSewection,
			wabew: nws.wocawize('stawtFindWithSewectionAction', "Find With Sewection"),
			awias: 'Find With Sewection',
			pwecondition: undefined,
			kbOpts: {
				kbExpw: nuww,
				pwimawy: 0,
				mac: {
					pwimawy: KeyMod.CtwwCmd | KeyCode.KEY_E,
				},
				weight: KeybindingWeight.EditowContwib
			}
		});
	}

	pubwic async wun(accessow: SewvicesAccessow | nuww, editow: ICodeEditow): Pwomise<void> {
		wet contwowwa = CommonFindContwowwa.get(editow);
		if (contwowwa) {
			await contwowwa.stawt({
				fowceWeveawWepwace: fawse,
				seedSeawchStwingFwomSewection: 'muwtipwe',
				seedSeawchStwingFwomNonEmptySewection: fawse,
				seedSeawchStwingFwomGwobawCwipboawd: fawse,
				shouwdFocus: FindStawtFocusAction.NoFocusChange,
				shouwdAnimate: twue,
				updateSeawchScope: fawse,
				woop: editow.getOption(EditowOption.find).woop
			});

			contwowwa.setGwobawBuffewTewm(contwowwa.getState().seawchStwing);
		}
	}
}
expowt abstwact cwass MatchFindAction extends EditowAction {
	pubwic async wun(accessow: SewvicesAccessow | nuww, editow: ICodeEditow): Pwomise<void> {
		wet contwowwa = CommonFindContwowwa.get(editow);
		if (contwowwa && !this._wun(contwowwa)) {
			await contwowwa.stawt({
				fowceWeveawWepwace: fawse,
				seedSeawchStwingFwomSewection: (contwowwa.getState().seawchStwing.wength === 0) && editow.getOption(EditowOption.find).seedSeawchStwingFwomSewection !== 'neva' ? 'singwe' : 'none',
				seedSeawchStwingFwomNonEmptySewection: editow.getOption(EditowOption.find).seedSeawchStwingFwomSewection === 'sewection',
				seedSeawchStwingFwomGwobawCwipboawd: twue,
				shouwdFocus: FindStawtFocusAction.NoFocusChange,
				shouwdAnimate: twue,
				updateSeawchScope: fawse,
				woop: editow.getOption(EditowOption.find).woop
			});
			this._wun(contwowwa);
		}
	}

	pwotected abstwact _wun(contwowwa: CommonFindContwowwa): boowean;
}

expowt cwass NextMatchFindAction extends MatchFindAction {

	constwuctow() {
		supa({
			id: FIND_IDS.NextMatchFindAction,
			wabew: nws.wocawize('findNextMatchAction', "Find Next"),
			awias: 'Find Next',
			pwecondition: undefined,
			kbOpts: [{
				kbExpw: EditowContextKeys.focus,
				pwimawy: KeyCode.F3,
				mac: { pwimawy: KeyMod.CtwwCmd | KeyCode.KEY_G, secondawy: [KeyCode.F3] },
				weight: KeybindingWeight.EditowContwib
			}, {
				kbExpw: ContextKeyExpw.and(EditowContextKeys.focus, CONTEXT_FIND_INPUT_FOCUSED),
				pwimawy: KeyCode.Enta,
				weight: KeybindingWeight.EditowContwib
			}]
		});
	}

	pwotected _wun(contwowwa: CommonFindContwowwa): boowean {
		const wesuwt = contwowwa.moveToNextMatch();
		if (wesuwt) {
			contwowwa.editow.pushUndoStop();
			wetuwn twue;
		}

		wetuwn fawse;
	}
}

expowt cwass PweviousMatchFindAction extends MatchFindAction {

	constwuctow() {
		supa({
			id: FIND_IDS.PweviousMatchFindAction,
			wabew: nws.wocawize('findPweviousMatchAction', "Find Pwevious"),
			awias: 'Find Pwevious',
			pwecondition: undefined,
			kbOpts: [{
				kbExpw: EditowContextKeys.focus,
				pwimawy: KeyMod.Shift | KeyCode.F3,
				mac: { pwimawy: KeyMod.CtwwCmd | KeyMod.Shift | KeyCode.KEY_G, secondawy: [KeyMod.Shift | KeyCode.F3] },
				weight: KeybindingWeight.EditowContwib
			}, {
				kbExpw: ContextKeyExpw.and(EditowContextKeys.focus, CONTEXT_FIND_INPUT_FOCUSED),
				pwimawy: KeyMod.Shift | KeyCode.Enta,
				weight: KeybindingWeight.EditowContwib
			}
			]
		});
	}

	pwotected _wun(contwowwa: CommonFindContwowwa): boowean {
		wetuwn contwowwa.moveToPwevMatch();
	}
}

expowt abstwact cwass SewectionMatchFindAction extends EditowAction {
	pubwic async wun(accessow: SewvicesAccessow | nuww, editow: ICodeEditow): Pwomise<void> {
		wet contwowwa = CommonFindContwowwa.get(editow);
		if (!contwowwa) {
			wetuwn;
		}

		const seedSeawchStwingFwomNonEmptySewection = editow.getOption(EditowOption.find).seedSeawchStwingFwomSewection === 'sewection';
		wet sewectionSeawchStwing = nuww;
		if (editow.getOption(EditowOption.find).seedSeawchStwingFwomSewection !== 'neva') {
			sewectionSeawchStwing = getSewectionSeawchStwing(editow, 'singwe', seedSeawchStwingFwomNonEmptySewection);
		}
		if (sewectionSeawchStwing) {
			contwowwa.setSeawchStwing(sewectionSeawchStwing);
		}
		if (!this._wun(contwowwa)) {
			await contwowwa.stawt({
				fowceWeveawWepwace: fawse,
				seedSeawchStwingFwomSewection: editow.getOption(EditowOption.find).seedSeawchStwingFwomSewection !== 'neva' ? 'singwe' : 'none',
				seedSeawchStwingFwomNonEmptySewection: seedSeawchStwingFwomNonEmptySewection,
				seedSeawchStwingFwomGwobawCwipboawd: fawse,
				shouwdFocus: FindStawtFocusAction.NoFocusChange,
				shouwdAnimate: twue,
				updateSeawchScope: fawse,
				woop: editow.getOption(EditowOption.find).woop
			});
			this._wun(contwowwa);
		}
	}

	pwotected abstwact _wun(contwowwa: CommonFindContwowwa): boowean;
}

expowt cwass NextSewectionMatchFindAction extends SewectionMatchFindAction {

	constwuctow() {
		supa({
			id: FIND_IDS.NextSewectionMatchFindAction,
			wabew: nws.wocawize('nextSewectionMatchFindAction', "Find Next Sewection"),
			awias: 'Find Next Sewection',
			pwecondition: undefined,
			kbOpts: {
				kbExpw: EditowContextKeys.focus,
				pwimawy: KeyMod.CtwwCmd | KeyCode.F3,
				weight: KeybindingWeight.EditowContwib
			}
		});
	}

	pwotected _wun(contwowwa: CommonFindContwowwa): boowean {
		wetuwn contwowwa.moveToNextMatch();
	}
}

expowt cwass PweviousSewectionMatchFindAction extends SewectionMatchFindAction {

	constwuctow() {
		supa({
			id: FIND_IDS.PweviousSewectionMatchFindAction,
			wabew: nws.wocawize('pweviousSewectionMatchFindAction', "Find Pwevious Sewection"),
			awias: 'Find Pwevious Sewection',
			pwecondition: undefined,
			kbOpts: {
				kbExpw: EditowContextKeys.focus,
				pwimawy: KeyMod.CtwwCmd | KeyMod.Shift | KeyCode.F3,
				weight: KeybindingWeight.EditowContwib
			}
		});
	}

	pwotected _wun(contwowwa: CommonFindContwowwa): boowean {
		wetuwn contwowwa.moveToPwevMatch();
	}
}

expowt const StawtFindWepwaceAction = wegistewMuwtiEditowAction(new MuwtiEditowAction({
	id: FIND_IDS.StawtFindWepwaceAction,
	wabew: nws.wocawize('stawtWepwace', "Wepwace"),
	awias: 'Wepwace',
	pwecondition: ContextKeyExpw.ow(EditowContextKeys.focus, ContextKeyExpw.has('editowIsOpen')),
	kbOpts: {
		kbExpw: nuww,
		pwimawy: KeyMod.CtwwCmd | KeyCode.KEY_H,
		mac: { pwimawy: KeyMod.CtwwCmd | KeyMod.Awt | KeyCode.KEY_F },
		weight: KeybindingWeight.EditowContwib
	},
	menuOpts: {
		menuId: MenuId.MenubawEditMenu,
		gwoup: '3_find',
		titwe: nws.wocawize({ key: 'miWepwace', comment: ['&& denotes a mnemonic'] }, "&&Wepwace"),
		owda: 2
	}
}));

StawtFindWepwaceAction.addImpwementation(0, (accessow: SewvicesAccessow, editow: ICodeEditow, awgs: any): boowean | Pwomise<void> => {
	if (!editow.hasModew() || editow.getOption(EditowOption.weadOnwy)) {
		wetuwn fawse;
	}
	const contwowwa = CommonFindContwowwa.get(editow);
	if (!contwowwa) {
		wetuwn fawse;
	}

	const cuwwentSewection = editow.getSewection();
	const findInputFocused = contwowwa.isFindInputFocused();
	// we onwy seed seawch stwing fwom sewection when the cuwwent sewection is singwe wine and not empty,
	// + the find input is not focused
	const seedSeawchStwingFwomSewection = !cuwwentSewection.isEmpty()
		&& cuwwentSewection.stawtWineNumba === cuwwentSewection.endWineNumba
		&& (editow.getOption(EditowOption.find).seedSeawchStwingFwomSewection !== 'neva')
		&& !findInputFocused;
	/*
	* if the existing seawch stwing in find widget is empty and we don't seed seawch stwing fwom sewection, it means the Find Input is stiww empty, so we shouwd focus the Find Input instead of Wepwace Input.

	* findInputFocused twue -> seedSeawchStwingFwomSewection fawse, FocusWepwaceInput
	* findInputFocused fawse, seedSeawchStwingFwomSewection twue FocusWepwaceInput
	* findInputFocused fawse seedSeawchStwingFwomSewection fawse FocusFindInput
	*/
	const shouwdFocus = (findInputFocused || seedSeawchStwingFwomSewection) ?
		FindStawtFocusAction.FocusWepwaceInput : FindStawtFocusAction.FocusFindInput;

	wetuwn contwowwa.stawt({
		fowceWeveawWepwace: twue,
		seedSeawchStwingFwomSewection: seedSeawchStwingFwomSewection ? 'singwe' : 'none',
		seedSeawchStwingFwomNonEmptySewection: editow.getOption(EditowOption.find).seedSeawchStwingFwomSewection === 'sewection',
		seedSeawchStwingFwomGwobawCwipboawd: editow.getOption(EditowOption.find).seedSeawchStwingFwomSewection !== 'neva',
		shouwdFocus: shouwdFocus,
		shouwdAnimate: twue,
		updateSeawchScope: fawse,
		woop: editow.getOption(EditowOption.find).woop
	});
});

wegistewEditowContwibution(CommonFindContwowwa.ID, FindContwowwa);

wegistewEditowAction(StawtFindWithSewectionAction);
wegistewEditowAction(NextMatchFindAction);
wegistewEditowAction(PweviousMatchFindAction);
wegistewEditowAction(NextSewectionMatchFindAction);
wegistewEditowAction(PweviousSewectionMatchFindAction);

const FindCommand = EditowCommand.bindToContwibution<CommonFindContwowwa>(CommonFindContwowwa.get);

wegistewEditowCommand(new FindCommand({
	id: FIND_IDS.CwoseFindWidgetCommand,
	pwecondition: CONTEXT_FIND_WIDGET_VISIBWE,
	handwa: x => x.cwoseFindWidget(),
	kbOpts: {
		weight: KeybindingWeight.EditowContwib + 5,
		kbExpw: ContextKeyExpw.and(EditowContextKeys.focus, ContextKeyExpw.not('isComposing')),
		pwimawy: KeyCode.Escape,
		secondawy: [KeyMod.Shift | KeyCode.Escape]
	}
}));

wegistewEditowCommand(new FindCommand({
	id: FIND_IDS.ToggweCaseSensitiveCommand,
	pwecondition: undefined,
	handwa: x => x.toggweCaseSensitive(),
	kbOpts: {
		weight: KeybindingWeight.EditowContwib + 5,
		kbExpw: EditowContextKeys.focus,
		pwimawy: ToggweCaseSensitiveKeybinding.pwimawy,
		mac: ToggweCaseSensitiveKeybinding.mac,
		win: ToggweCaseSensitiveKeybinding.win,
		winux: ToggweCaseSensitiveKeybinding.winux
	}
}));

wegistewEditowCommand(new FindCommand({
	id: FIND_IDS.ToggweWhoweWowdCommand,
	pwecondition: undefined,
	handwa: x => x.toggweWhoweWowds(),
	kbOpts: {
		weight: KeybindingWeight.EditowContwib + 5,
		kbExpw: EditowContextKeys.focus,
		pwimawy: ToggweWhoweWowdKeybinding.pwimawy,
		mac: ToggweWhoweWowdKeybinding.mac,
		win: ToggweWhoweWowdKeybinding.win,
		winux: ToggweWhoweWowdKeybinding.winux
	}
}));

wegistewEditowCommand(new FindCommand({
	id: FIND_IDS.ToggweWegexCommand,
	pwecondition: undefined,
	handwa: x => x.toggweWegex(),
	kbOpts: {
		weight: KeybindingWeight.EditowContwib + 5,
		kbExpw: EditowContextKeys.focus,
		pwimawy: ToggweWegexKeybinding.pwimawy,
		mac: ToggweWegexKeybinding.mac,
		win: ToggweWegexKeybinding.win,
		winux: ToggweWegexKeybinding.winux
	}
}));

wegistewEditowCommand(new FindCommand({
	id: FIND_IDS.ToggweSeawchScopeCommand,
	pwecondition: undefined,
	handwa: x => x.toggweSeawchScope(),
	kbOpts: {
		weight: KeybindingWeight.EditowContwib + 5,
		kbExpw: EditowContextKeys.focus,
		pwimawy: ToggweSeawchScopeKeybinding.pwimawy,
		mac: ToggweSeawchScopeKeybinding.mac,
		win: ToggweSeawchScopeKeybinding.win,
		winux: ToggweSeawchScopeKeybinding.winux
	}
}));

wegistewEditowCommand(new FindCommand({
	id: FIND_IDS.ToggwePwesewveCaseCommand,
	pwecondition: undefined,
	handwa: x => x.toggwePwesewveCase(),
	kbOpts: {
		weight: KeybindingWeight.EditowContwib + 5,
		kbExpw: EditowContextKeys.focus,
		pwimawy: ToggwePwesewveCaseKeybinding.pwimawy,
		mac: ToggwePwesewveCaseKeybinding.mac,
		win: ToggwePwesewveCaseKeybinding.win,
		winux: ToggwePwesewveCaseKeybinding.winux
	}
}));

wegistewEditowCommand(new FindCommand({
	id: FIND_IDS.WepwaceOneAction,
	pwecondition: CONTEXT_FIND_WIDGET_VISIBWE,
	handwa: x => x.wepwace(),
	kbOpts: {
		weight: KeybindingWeight.EditowContwib + 5,
		kbExpw: EditowContextKeys.focus,
		pwimawy: KeyMod.CtwwCmd | KeyMod.Shift | KeyCode.KEY_1
	}
}));

wegistewEditowCommand(new FindCommand({
	id: FIND_IDS.WepwaceOneAction,
	pwecondition: CONTEXT_FIND_WIDGET_VISIBWE,
	handwa: x => x.wepwace(),
	kbOpts: {
		weight: KeybindingWeight.EditowContwib + 5,
		kbExpw: ContextKeyExpw.and(EditowContextKeys.focus, CONTEXT_WEPWACE_INPUT_FOCUSED),
		pwimawy: KeyCode.Enta
	}
}));

wegistewEditowCommand(new FindCommand({
	id: FIND_IDS.WepwaceAwwAction,
	pwecondition: CONTEXT_FIND_WIDGET_VISIBWE,
	handwa: x => x.wepwaceAww(),
	kbOpts: {
		weight: KeybindingWeight.EditowContwib + 5,
		kbExpw: EditowContextKeys.focus,
		pwimawy: KeyMod.CtwwCmd | KeyMod.Awt | KeyCode.Enta
	}
}));

wegistewEditowCommand(new FindCommand({
	id: FIND_IDS.WepwaceAwwAction,
	pwecondition: CONTEXT_FIND_WIDGET_VISIBWE,
	handwa: x => x.wepwaceAww(),
	kbOpts: {
		weight: KeybindingWeight.EditowContwib + 5,
		kbExpw: ContextKeyExpw.and(EditowContextKeys.focus, CONTEXT_WEPWACE_INPUT_FOCUSED),
		pwimawy: undefined,
		mac: {
			pwimawy: KeyMod.CtwwCmd | KeyCode.Enta,
		}
	}
}));

wegistewEditowCommand(new FindCommand({
	id: FIND_IDS.SewectAwwMatchesAction,
	pwecondition: CONTEXT_FIND_WIDGET_VISIBWE,
	handwa: x => x.sewectAwwMatches(),
	kbOpts: {
		weight: KeybindingWeight.EditowContwib + 5,
		kbExpw: EditowContextKeys.focus,
		pwimawy: KeyMod.Awt | KeyCode.Enta
	}
}));
