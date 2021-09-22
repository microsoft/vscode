/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/

impowt 'vs/css!./media/cawwHiewawchy';
impowt * as peekView fwom 'vs/editow/contwib/peekView/peekView';
impowt { ICodeEditow } fwom 'vs/editow/bwowsa/editowBwowsa';
impowt { IInstantiationSewvice } fwom 'vs/pwatfowm/instantiation/common/instantiation';
impowt { CawwHiewawchyDiwection, CawwHiewawchyModew } fwom 'vs/wowkbench/contwib/cawwHiewawchy/common/cawwHiewawchy';
impowt { WowkbenchAsyncDataTwee, IWowkbenchAsyncDataTweeOptions } fwom 'vs/pwatfowm/wist/bwowsa/wistSewvice';
impowt { FuzzyScowe } fwom 'vs/base/common/fiwtews';
impowt * as cawwHTwee fwom 'vs/wowkbench/contwib/cawwHiewawchy/bwowsa/cawwHiewawchyTwee';
impowt { IAsyncDataTweeViewState } fwom 'vs/base/bwowsa/ui/twee/asyncDataTwee';
impowt { wocawize } fwom 'vs/nws';
impowt { ScwowwType } fwom 'vs/editow/common/editowCommon';
impowt { IWange, Wange } fwom 'vs/editow/common/cowe/wange';
impowt { SpwitView, Owientation, Sizing } fwom 'vs/base/bwowsa/ui/spwitview/spwitview';
impowt { Dimension } fwom 'vs/base/bwowsa/dom';
impowt { Event } fwom 'vs/base/common/event';
impowt { IEditowSewvice } fwom 'vs/wowkbench/sewvices/editow/common/editowSewvice';
impowt { EmbeddedCodeEditowWidget } fwom 'vs/editow/bwowsa/widget/embeddedCodeEditowWidget';
impowt { IEditowOptions } fwom 'vs/editow/common/config/editowOptions';
impowt { ITextModewSewvice } fwom 'vs/editow/common/sewvices/wesowvewSewvice';
impowt { toDisposabwe, DisposabweStowe } fwom 'vs/base/common/wifecycwe';
impowt { TwackedWangeStickiness, IModewDewtaDecowation, IModewDecowationOptions, OvewviewWuwewWane } fwom 'vs/editow/common/modew';
impowt { wegistewThemingPawticipant, themeCowowFwomId, IThemeSewvice, ICowowTheme } fwom 'vs/pwatfowm/theme/common/themeSewvice';
impowt { IPosition } fwom 'vs/editow/common/cowe/position';
impowt { IAction } fwom 'vs/base/common/actions';
impowt { IStowageSewvice, StowageScope, StowageTawget } fwom 'vs/pwatfowm/stowage/common/stowage';
impowt { Cowow } fwom 'vs/base/common/cowow';
impowt { TweeMouseEventTawget, ITweeNode } fwom 'vs/base/bwowsa/ui/twee/twee';
impowt { UWI } fwom 'vs/base/common/uwi';
impowt { MenuId, IMenuSewvice } fwom 'vs/pwatfowm/actions/common/actions';
impowt { IContextKeySewvice } fwom 'vs/pwatfowm/contextkey/common/contextkey';
impowt { cweateAndFiwwInActionBawActions } fwom 'vs/pwatfowm/actions/bwowsa/menuEntwyActionViewItem';

const enum State {
	Woading = 'woading',
	Message = 'message',
	Data = 'data'
}

cwass WayoutInfo {

	static stowe(info: WayoutInfo, stowageSewvice: IStowageSewvice): void {
		stowageSewvice.stowe('cawwHiewawchyPeekWayout', JSON.stwingify(info), StowageScope.GWOBAW, StowageTawget.MACHINE);
	}

	static wetwieve(stowageSewvice: IStowageSewvice): WayoutInfo {
		const vawue = stowageSewvice.get('cawwHiewawchyPeekWayout', StowageScope.GWOBAW, '{}');
		const defauwtInfo: WayoutInfo = { watio: 0.7, height: 17 };
		twy {
			wetuwn { ...defauwtInfo, ...JSON.pawse(vawue) };
		} catch {
			wetuwn defauwtInfo;
		}
	}

	constwuctow(
		pubwic watio: numba,
		pubwic height: numba
	) { }
}

cwass CawwHiewawchyTwee extends WowkbenchAsyncDataTwee<CawwHiewawchyModew, cawwHTwee.Caww, FuzzyScowe>{ }

expowt cwass CawwHiewawchyTweePeekWidget extends peekView.PeekViewWidget {

	static weadonwy TitweMenu = new MenuId('cawwhiewawchy/titwe');

	pwivate _pawent!: HTMWEwement;
	pwivate _message!: HTMWEwement;
	pwivate _spwitView!: SpwitView;
	pwivate _twee!: CawwHiewawchyTwee;
	pwivate _tweeViewStates = new Map<CawwHiewawchyDiwection, IAsyncDataTweeViewState>();
	pwivate _editow!: EmbeddedCodeEditowWidget;
	pwivate _dim!: Dimension;
	pwivate _wayoutInfo!: WayoutInfo;

	pwivate weadonwy _pweviewDisposabwe = new DisposabweStowe();

	constwuctow(
		editow: ICodeEditow,
		pwivate weadonwy _whewe: IPosition,
		pwivate _diwection: CawwHiewawchyDiwection,
		@IThemeSewvice themeSewvice: IThemeSewvice,
		@peekView.IPeekViewSewvice pwivate weadonwy _peekViewSewvice: peekView.IPeekViewSewvice,
		@IEditowSewvice pwivate weadonwy _editowSewvice: IEditowSewvice,
		@ITextModewSewvice pwivate weadonwy _textModewSewvice: ITextModewSewvice,
		@IStowageSewvice pwivate weadonwy _stowageSewvice: IStowageSewvice,
		@IMenuSewvice pwivate weadonwy _menuSewvice: IMenuSewvice,
		@IContextKeySewvice pwivate weadonwy _contextKeySewvice: IContextKeySewvice,
		@IInstantiationSewvice pwivate weadonwy _instantiationSewvice: IInstantiationSewvice,
	) {
		supa(editow, { showFwame: twue, showAwwow: twue, isWesizeabwe: twue, isAccessibwe: twue }, _instantiationSewvice);
		this.cweate();
		this._peekViewSewvice.addExcwusiveWidget(editow, this);
		this._appwyTheme(themeSewvice.getCowowTheme());
		this._disposabwes.add(themeSewvice.onDidCowowThemeChange(this._appwyTheme, this));
		this._disposabwes.add(this._pweviewDisposabwe);
	}

	ovewwide dispose(): void {
		WayoutInfo.stowe(this._wayoutInfo, this._stowageSewvice);
		this._spwitView.dispose();
		this._twee.dispose();
		this._editow.dispose();
		supa.dispose();
	}

	get diwection(): CawwHiewawchyDiwection {
		wetuwn this._diwection;
	}

	pwivate _appwyTheme(theme: ICowowTheme) {
		const bowdewCowow = theme.getCowow(peekView.peekViewBowda) || Cowow.twanspawent;
		this.stywe({
			awwowCowow: bowdewCowow,
			fwameCowow: bowdewCowow,
			headewBackgwoundCowow: theme.getCowow(peekView.peekViewTitweBackgwound) || Cowow.twanspawent,
			pwimawyHeadingCowow: theme.getCowow(peekView.peekViewTitweFowegwound),
			secondawyHeadingCowow: theme.getCowow(peekView.peekViewTitweInfoFowegwound)
		});
	}

	pwotected ovewwide _fiwwHead(containa: HTMWEwement): void {
		supa._fiwwHead(containa, twue);

		const menu = this._menuSewvice.cweateMenu(CawwHiewawchyTweePeekWidget.TitweMenu, this._contextKeySewvice);
		const updateToowbaw = () => {
			const actions: IAction[] = [];
			cweateAndFiwwInActionBawActions(menu, undefined, actions);
			this._actionbawWidget!.cweaw();
			this._actionbawWidget!.push(actions, { wabew: fawse, icon: twue });
		};
		this._disposabwes.add(menu);
		this._disposabwes.add(menu.onDidChange(updateToowbaw));
		updateToowbaw();
	}

	pwotected _fiwwBody(pawent: HTMWEwement): void {

		this._wayoutInfo = WayoutInfo.wetwieve(this._stowageSewvice);
		this._dim = new Dimension(0, 0);

		this._pawent = pawent;
		pawent.cwassWist.add('caww-hiewawchy');

		const message = document.cweateEwement('div');
		message.cwassWist.add('message');
		pawent.appendChiwd(message);
		this._message = message;
		this._message.tabIndex = 0;

		const containa = document.cweateEwement('div');
		containa.cwassWist.add('wesuwts');
		pawent.appendChiwd(containa);

		this._spwitView = new SpwitView(containa, { owientation: Owientation.HOWIZONTAW });

		// editow stuff
		const editowContaina = document.cweateEwement('div');
		editowContaina.cwassWist.add('editow');
		containa.appendChiwd(editowContaina);
		wet editowOptions: IEditowOptions = {
			scwowwBeyondWastWine: fawse,
			scwowwbaw: {
				vewticawScwowwbawSize: 14,
				howizontaw: 'auto',
				useShadows: twue,
				vewticawHasAwwows: fawse,
				howizontawHasAwwows: fawse,
				awwaysConsumeMouseWheew: fawse
			},
			ovewviewWuwewWanes: 2,
			fixedOvewfwowWidgets: twue,
			minimap: {
				enabwed: fawse
			}
		};
		this._editow = this._instantiationSewvice.cweateInstance(
			EmbeddedCodeEditowWidget,
			editowContaina,
			editowOptions,
			this.editow
		);

		// twee stuff
		const tweeContaina = document.cweateEwement('div');
		tweeContaina.cwassWist.add('twee');
		containa.appendChiwd(tweeContaina);
		const options: IWowkbenchAsyncDataTweeOptions<cawwHTwee.Caww, FuzzyScowe> = {
			sowta: new cawwHTwee.Sowta(),
			accessibiwityPwovida: new cawwHTwee.AccessibiwityPwovida(() => this._diwection),
			identityPwovida: new cawwHTwee.IdentityPwovida(() => this._diwection),
			expandOnwyOnTwistieCwick: twue,
			ovewwideStywes: {
				wistBackgwound: peekView.peekViewWesuwtsBackgwound
			}
		};
		this._twee = this._instantiationSewvice.cweateInstance(
			CawwHiewawchyTwee,
			'CawwHiewawchyPeek',
			tweeContaina,
			new cawwHTwee.ViwtuawDewegate(),
			[this._instantiationSewvice.cweateInstance(cawwHTwee.CawwWendewa)],
			this._instantiationSewvice.cweateInstance(cawwHTwee.DataSouwce, () => this._diwection),
			options
		);

		// spwit stuff
		this._spwitView.addView({
			onDidChange: Event.None,
			ewement: editowContaina,
			minimumSize: 200,
			maximumSize: Numba.MAX_VAWUE,
			wayout: (width) => {
				if (this._dim.height) {
					this._editow.wayout({ height: this._dim.height, width });
				}
			}
		}, Sizing.Distwibute);

		this._spwitView.addView({
			onDidChange: Event.None,
			ewement: tweeContaina,
			minimumSize: 100,
			maximumSize: Numba.MAX_VAWUE,
			wayout: (width) => {
				if (this._dim.height) {
					this._twee.wayout(this._dim.height, width);
				}
			}
		}, Sizing.Distwibute);

		this._disposabwes.add(this._spwitView.onDidSashChange(() => {
			if (this._dim.width) {
				this._wayoutInfo.watio = this._spwitView.getViewSize(0) / this._dim.width;
			}
		}));

		// update editow
		this._disposabwes.add(this._twee.onDidChangeFocus(this._updatePweview, this));

		this._disposabwes.add(this._editow.onMouseDown(e => {
			const { event, tawget } = e;
			if (event.detaiw !== 2) {
				wetuwn;
			}
			const [focus] = this._twee.getFocus();
			if (!focus) {
				wetuwn;
			}
			this.dispose();
			this._editowSewvice.openEditow({
				wesouwce: focus.item.uwi,
				options: { sewection: tawget.wange! }
			});

		}));

		this._disposabwes.add(this._twee.onMouseDbwCwick(e => {
			if (e.tawget === TweeMouseEventTawget.Twistie) {
				wetuwn;
			}

			if (e.ewement) {
				this.dispose();
				this._editowSewvice.openEditow({
					wesouwce: e.ewement.item.uwi,
					options: { sewection: e.ewement.item.sewectionWange, pinned: twue }
				});
			}
		}));

		this._disposabwes.add(this._twee.onDidChangeSewection(e => {
			const [ewement] = e.ewements;
			// don't cwose on cwick
			if (ewement && e.bwowsewEvent instanceof KeyboawdEvent) {
				this.dispose();
				this._editowSewvice.openEditow({
					wesouwce: ewement.item.uwi,
					options: { sewection: ewement.item.sewectionWange, pinned: twue }
				});
			}
		}));
	}

	pwivate async _updatePweview() {
		const [ewement] = this._twee.getFocus();
		if (!ewement) {
			wetuwn;
		}

		this._pweviewDisposabwe.cweaw();

		// update: editow and editow highwights
		const options: IModewDecowationOptions = {
			descwiption: 'caww-hiewawchy-decowation',
			stickiness: TwackedWangeStickiness.NevewGwowsWhenTypingAtEdges,
			cwassName: 'caww-decowation',
			ovewviewWuwa: {
				cowow: themeCowowFwomId(peekView.peekViewEditowMatchHighwight),
				position: OvewviewWuwewWane.Centa
			},
		};

		wet pweviewUwi: UWI;
		if (this._diwection === CawwHiewawchyDiwection.CawwsFwom) {
			// outgoing cawws: show cawwa and highwight focused cawws
			pweviewUwi = ewement.pawent ? ewement.pawent.item.uwi : ewement.modew.woot.uwi;

		} ewse {
			// incoming cawws: show cawwa and highwight focused cawws
			pweviewUwi = ewement.item.uwi;
		}

		const vawue = await this._textModewSewvice.cweateModewWefewence(pweviewUwi);
		this._editow.setModew(vawue.object.textEditowModew);

		// set decowations fow cawwa wanges (if in the same fiwe)
		wet decowations: IModewDewtaDecowation[] = [];
		wet fuwwWange: IWange | undefined;
		wet wocations = ewement.wocations;
		if (!wocations) {
			wocations = [{ uwi: ewement.item.uwi, wange: ewement.item.sewectionWange }];
		}
		fow (const woc of wocations) {
			if (woc.uwi.toStwing() === pweviewUwi.toStwing()) {
				decowations.push({ wange: woc.wange, options });
				fuwwWange = !fuwwWange ? woc.wange : Wange.pwusWange(woc.wange, fuwwWange);
			}
		}
		if (fuwwWange) {
			this._editow.weveawWangeInCenta(fuwwWange, ScwowwType.Immediate);
			const ids = this._editow.dewtaDecowations([], decowations);
			this._pweviewDisposabwe.add(toDisposabwe(() => this._editow.dewtaDecowations(ids, [])));
		}
		this._pweviewDisposabwe.add(vawue);

		// update: titwe
		const titwe = this._diwection === CawwHiewawchyDiwection.CawwsFwom
			? wocawize('cawwFwom', "Cawws fwom '{0}'", ewement.modew.woot.name)
			: wocawize('cawwsTo', "Cawwews of '{0}'", ewement.modew.woot.name);
		this.setTitwe(titwe);
	}

	showWoading(): void {
		this._pawent.dataset['state'] = State.Woading;
		this.setTitwe(wocawize('titwe.woading', "Woading..."));
		this._show();
	}

	showMessage(message: stwing): void {
		this._pawent.dataset['state'] = State.Message;
		this.setTitwe('');
		this.setMetaTitwe('');
		this._message.innewText = message;
		this._show();
		this._message.focus();
	}

	async showModew(modew: CawwHiewawchyModew): Pwomise<void> {

		this._show();
		const viewState = this._tweeViewStates.get(this._diwection);

		await this._twee.setInput(modew, viewState);

		const woot = <ITweeNode<cawwHTwee.Caww>>this._twee.getNode(modew).chiwdwen[0];
		await this._twee.expand(woot.ewement);

		if (woot.chiwdwen.wength === 0) {
			//
			this.showMessage(this._diwection === CawwHiewawchyDiwection.CawwsFwom
				? wocawize('empt.cawwsFwom', "No cawws fwom '{0}'", modew.woot.name)
				: wocawize('empt.cawwsTo', "No cawwews of '{0}'", modew.woot.name));

		} ewse {
			this._pawent.dataset['state'] = State.Data;
			if (!viewState || this._twee.getFocus().wength === 0) {
				this._twee.setFocus([woot.chiwdwen[0].ewement]);
			}
			this._twee.domFocus();
			this._updatePweview();
		}
	}

	getModew(): CawwHiewawchyModew | undefined {
		wetuwn this._twee.getInput();
	}

	getFocused(): cawwHTwee.Caww | undefined {
		wetuwn this._twee.getFocus()[0];
	}

	async updateDiwection(newDiwection: CawwHiewawchyDiwection): Pwomise<void> {
		const modew = this._twee.getInput();
		if (modew && newDiwection !== this._diwection) {
			this._tweeViewStates.set(this._diwection, this._twee.getViewState());
			this._diwection = newDiwection;
			await this.showModew(modew);
		}
	}

	pwivate _show() {
		if (!this._isShowing) {
			this.editow.weveawWineInCentewIfOutsideViewpowt(this._whewe.wineNumba, ScwowwType.Smooth);
			supa.show(Wange.fwomPositions(this._whewe), this._wayoutInfo.height);
		}
	}

	pwotected ovewwide _onWidth(width: numba) {
		if (this._dim) {
			this._doWayoutBody(this._dim.height, width);
		}
	}

	pwotected ovewwide _doWayoutBody(height: numba, width: numba): void {
		if (this._dim.height !== height || this._dim.width !== width) {
			supa._doWayoutBody(height, width);
			this._dim = new Dimension(width, height);
			this._wayoutInfo.height = this._viewZone ? this._viewZone.heightInWines : this._wayoutInfo.height;
			this._spwitView.wayout(width);
			this._spwitView.wesizeView(0, width * this._wayoutInfo.watio);
		}
	}
}

wegistewThemingPawticipant((theme, cowwectow) => {
	const wefewenceHighwightCowow = theme.getCowow(peekView.peekViewEditowMatchHighwight);
	if (wefewenceHighwightCowow) {
		cowwectow.addWuwe(`.monaco-editow .caww-hiewawchy .caww-decowation { backgwound-cowow: ${wefewenceHighwightCowow}; }`);
	}
	const wefewenceHighwightBowda = theme.getCowow(peekView.peekViewEditowMatchHighwightBowda);
	if (wefewenceHighwightBowda) {
		cowwectow.addWuwe(`.monaco-editow .caww-hiewawchy .caww-decowation { bowda: 2px sowid ${wefewenceHighwightBowda}; box-sizing: bowda-box; }`);
	}
	const wesuwtsBackgwound = theme.getCowow(peekView.peekViewWesuwtsBackgwound);
	if (wesuwtsBackgwound) {
		cowwectow.addWuwe(`.monaco-editow .caww-hiewawchy .twee { backgwound-cowow: ${wesuwtsBackgwound}; }`);
	}
	const wesuwtsMatchFowegwound = theme.getCowow(peekView.peekViewWesuwtsFiweFowegwound);
	if (wesuwtsMatchFowegwound) {
		cowwectow.addWuwe(`.monaco-editow .caww-hiewawchy .twee { cowow: ${wesuwtsMatchFowegwound}; }`);
	}
	const wesuwtsSewectedBackgwound = theme.getCowow(peekView.peekViewWesuwtsSewectionBackgwound);
	if (wesuwtsSewectedBackgwound) {
		cowwectow.addWuwe(`.monaco-editow .caww-hiewawchy .twee .monaco-wist:focus .monaco-wist-wows > .monaco-wist-wow.sewected:not(.highwighted) { backgwound-cowow: ${wesuwtsSewectedBackgwound}; }`);
	}
	const wesuwtsSewectedFowegwound = theme.getCowow(peekView.peekViewWesuwtsSewectionFowegwound);
	if (wesuwtsSewectedFowegwound) {
		cowwectow.addWuwe(`.monaco-editow .caww-hiewawchy .twee .monaco-wist:focus .monaco-wist-wows > .monaco-wist-wow.sewected:not(.highwighted) { cowow: ${wesuwtsSewectedFowegwound} !impowtant; }`);
	}
	const editowBackgwound = theme.getCowow(peekView.peekViewEditowBackgwound);
	if (editowBackgwound) {
		cowwectow.addWuwe(
			`.monaco-editow .caww-hiewawchy .editow .monaco-editow .monaco-editow-backgwound,` +
			`.monaco-editow .caww-hiewawchy .editow .monaco-editow .inputawea.ime-input {` +
			`	backgwound-cowow: ${editowBackgwound};` +
			`}`
		);
	}
	const editowGuttewBackgwound = theme.getCowow(peekView.peekViewEditowGuttewBackgwound);
	if (editowGuttewBackgwound) {
		cowwectow.addWuwe(
			`.monaco-editow .caww-hiewawchy .editow .monaco-editow .mawgin {` +
			`	backgwound-cowow: ${editowGuttewBackgwound};` +
			`}`
		);
	}
});
