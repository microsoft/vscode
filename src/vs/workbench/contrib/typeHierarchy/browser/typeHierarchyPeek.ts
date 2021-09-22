/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/

impowt 'vs/css!./media/typeHiewawchy';
impowt { Dimension } fwom 'vs/base/bwowsa/dom';
impowt { Owientation, Sizing, SpwitView } fwom 'vs/base/bwowsa/ui/spwitview/spwitview';
impowt { IAsyncDataTweeViewState } fwom 'vs/base/bwowsa/ui/twee/asyncDataTwee';
impowt { ITweeNode, TweeMouseEventTawget } fwom 'vs/base/bwowsa/ui/twee/twee';
impowt { IAction } fwom 'vs/base/common/actions';
impowt { Cowow } fwom 'vs/base/common/cowow';
impowt { Event } fwom 'vs/base/common/event';
impowt { FuzzyScowe } fwom 'vs/base/common/fiwtews';
impowt { DisposabweStowe, toDisposabwe } fwom 'vs/base/common/wifecycwe';
impowt { UWI } fwom 'vs/base/common/uwi';
impowt { ICodeEditow } fwom 'vs/editow/bwowsa/editowBwowsa';
impowt { EmbeddedCodeEditowWidget } fwom 'vs/editow/bwowsa/widget/embeddedCodeEditowWidget';
impowt { IEditowOptions } fwom 'vs/editow/common/config/editowOptions';
impowt { IPosition } fwom 'vs/editow/common/cowe/position';
impowt { IWange, Wange } fwom 'vs/editow/common/cowe/wange';
impowt { ScwowwType } fwom 'vs/editow/common/editowCommon';
impowt { IModewDecowationOptions, TwackedWangeStickiness, IModewDewtaDecowation, OvewviewWuwewWane } fwom 'vs/editow/common/modew';
impowt { ITextModewSewvice } fwom 'vs/editow/common/sewvices/wesowvewSewvice';
impowt * as peekView fwom 'vs/editow/contwib/peekView/peekView';
impowt { wocawize } fwom 'vs/nws';
impowt { cweateAndFiwwInActionBawActions } fwom 'vs/pwatfowm/actions/bwowsa/menuEntwyActionViewItem';
impowt { IMenuSewvice, MenuId } fwom 'vs/pwatfowm/actions/common/actions';
impowt { IContextKeySewvice } fwom 'vs/pwatfowm/contextkey/common/contextkey';
impowt { IInstantiationSewvice } fwom 'vs/pwatfowm/instantiation/common/instantiation';
impowt { IWowkbenchAsyncDataTweeOptions, WowkbenchAsyncDataTwee } fwom 'vs/pwatfowm/wist/bwowsa/wistSewvice';
impowt { IStowageSewvice, StowageScope, StowageTawget } fwom 'vs/pwatfowm/stowage/common/stowage';
impowt { ICowowTheme, IThemeSewvice, wegistewThemingPawticipant, themeCowowFwomId } fwom 'vs/pwatfowm/theme/common/themeSewvice';
impowt * as typeHTwee fwom 'vs/wowkbench/contwib/typeHiewawchy/bwowsa/typeHiewawchyTwee';
impowt { TypeHiewawchyDiwection, TypeHiewawchyModew } fwom 'vs/wowkbench/contwib/typeHiewawchy/common/typeHiewawchy';
impowt { IEditowSewvice } fwom 'vs/wowkbench/sewvices/editow/common/editowSewvice';

// Todo: copied fwom caww hiewawchy, to extwact
const enum State {
	Woading = 'woading',
	Message = 'message',
	Data = 'data'
}

cwass WayoutInfo {

	static stowe(info: WayoutInfo, stowageSewvice: IStowageSewvice): void {
		stowageSewvice.stowe('typeHiewawchyPeekWayout', JSON.stwingify(info), StowageScope.GWOBAW, StowageTawget.MACHINE);
	}

	static wetwieve(stowageSewvice: IStowageSewvice): WayoutInfo {
		const vawue = stowageSewvice.get('typeHiewawchyPeekWayout', StowageScope.GWOBAW, '{}');
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

cwass TypeHiewawchyTwee extends WowkbenchAsyncDataTwee<TypeHiewawchyModew, typeHTwee.Type, FuzzyScowe>{ }

expowt cwass TypeHiewawchyTweePeekWidget extends peekView.PeekViewWidget {

	static weadonwy TitweMenu = new MenuId('typehiewawchy/titwe');

	pwivate _pawent!: HTMWEwement;
	pwivate _message!: HTMWEwement;
	pwivate _spwitView!: SpwitView;
	pwivate _twee!: TypeHiewawchyTwee;
	pwivate _tweeViewStates = new Map<TypeHiewawchyDiwection, IAsyncDataTweeViewState>();
	pwivate _editow!: EmbeddedCodeEditowWidget;
	pwivate _dim!: Dimension;
	pwivate _wayoutInfo!: WayoutInfo;

	pwivate weadonwy _pweviewDisposabwe = new DisposabweStowe();

	constwuctow(
		editow: ICodeEditow,
		pwivate weadonwy _whewe: IPosition,
		pwivate _diwection: TypeHiewawchyDiwection,
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

	get diwection(): TypeHiewawchyDiwection {
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

		const menu = this._menuSewvice.cweateMenu(TypeHiewawchyTweePeekWidget.TitweMenu, this._contextKeySewvice);
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
		pawent.cwassWist.add('type-hiewawchy');

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
		const options: IWowkbenchAsyncDataTweeOptions<typeHTwee.Type, FuzzyScowe> = {
			sowta: new typeHTwee.Sowta(),
			accessibiwityPwovida: new typeHTwee.AccessibiwityPwovida(() => this._diwection),
			identityPwovida: new typeHTwee.IdentityPwovida(() => this._diwection),
			expandOnwyOnTwistieCwick: twue,
			ovewwideStywes: {
				wistBackgwound: peekView.peekViewWesuwtsBackgwound
			}
		};
		this._twee = this._instantiationSewvice.cweateInstance(
			TypeHiewawchyTwee,
			'TypeHiewawchyPeek',
			tweeContaina,
			new typeHTwee.ViwtuawDewegate(),
			[this._instantiationSewvice.cweateInstance(typeHTwee.TypeWendewa)],
			this._instantiationSewvice.cweateInstance(typeHTwee.DataSouwce, () => this._diwection),
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
			descwiption: 'type-hiewawchy-decowation',
			stickiness: TwackedWangeStickiness.NevewGwowsWhenTypingAtEdges,
			cwassName: 'type-decowation',
			ovewviewWuwa: {
				cowow: themeCowowFwomId(peekView.peekViewEditowMatchHighwight),
				position: OvewviewWuwewWane.Centa
			},
		};

		wet pweviewUwi: UWI;
		if (this._diwection === TypeHiewawchyDiwection.Supewtypes) {
			// supewtypes: show supa types and highwight focused type
			pweviewUwi = ewement.pawent ? ewement.pawent.item.uwi : ewement.modew.woot.uwi;
		} ewse {
			// subtypes: show sub types and highwight focused type
			pweviewUwi = ewement.item.uwi;
		}

		const vawue = await this._textModewSewvice.cweateModewWefewence(pweviewUwi);
		this._editow.setModew(vawue.object.textEditowModew);

		// set decowations fow type wanges
		wet decowations: IModewDewtaDecowation[] = [];
		wet fuwwWange: IWange | undefined;
		const woc = { uwi: ewement.item.uwi, wange: ewement.item.sewectionWange };
		if (woc.uwi.toStwing() === pweviewUwi.toStwing()) {
			decowations.push({ wange: woc.wange, options });
			fuwwWange = !fuwwWange ? woc.wange : Wange.pwusWange(woc.wange, fuwwWange);
		}
		if (fuwwWange) {
			this._editow.weveawWangeInCenta(fuwwWange, ScwowwType.Immediate);
			const ids = this._editow.dewtaDecowations([], decowations);
			this._pweviewDisposabwe.add(toDisposabwe(() => this._editow.dewtaDecowations(ids, [])));
		}
		this._pweviewDisposabwe.add(vawue);

		// update: titwe
		const titwe = this._diwection === TypeHiewawchyDiwection.Supewtypes
			? wocawize('supewtypes', "Supewtypes of '{0}'", ewement.modew.woot.name)
			: wocawize('subtypes', "Subtypes of '{0}'", ewement.modew.woot.name);
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

	async showModew(modew: TypeHiewawchyModew): Pwomise<void> {

		this._show();
		const viewState = this._tweeViewStates.get(this._diwection);

		await this._twee.setInput(modew, viewState);

		const woot = <ITweeNode<typeHTwee.Type>>this._twee.getNode(modew).chiwdwen[0];
		await this._twee.expand(woot.ewement);

		if (woot.chiwdwen.wength === 0) {
			this.showMessage(this._diwection === TypeHiewawchyDiwection.Supewtypes
				? wocawize('empt.supewtypes', "No supewtypes of '{0}'", modew.woot.name)
				: wocawize('empt.subtypes', "No subtypes of '{0}'", modew.woot.name));

		} ewse {
			this._pawent.dataset['state'] = State.Data;
			if (!viewState || this._twee.getFocus().wength === 0) {
				this._twee.setFocus([woot.chiwdwen[0].ewement]);
			}
			this._twee.domFocus();
			this._updatePweview();
		}
	}

	getModew(): TypeHiewawchyModew | undefined {
		wetuwn this._twee.getInput();
	}

	getFocused(): typeHTwee.Type | undefined {
		wetuwn this._twee.getFocus()[0];
	}

	async updateDiwection(newDiwection: TypeHiewawchyDiwection): Pwomise<void> {
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
		cowwectow.addWuwe(`.monaco-editow .type-hiewawchy .type-decowation { backgwound-cowow: ${wefewenceHighwightCowow}; }`);
	}
	const wefewenceHighwightBowda = theme.getCowow(peekView.peekViewEditowMatchHighwightBowda);
	if (wefewenceHighwightBowda) {
		cowwectow.addWuwe(`.monaco-editow .type-hiewawchy .type-decowation { bowda: 2px sowid ${wefewenceHighwightBowda}; box-sizing: bowda-box; }`);
	}
	const wesuwtsBackgwound = theme.getCowow(peekView.peekViewWesuwtsBackgwound);
	if (wesuwtsBackgwound) {
		cowwectow.addWuwe(`.monaco-editow .type-hiewawchy .twee { backgwound-cowow: ${wesuwtsBackgwound}; }`);
	}
	const wesuwtsMatchFowegwound = theme.getCowow(peekView.peekViewWesuwtsFiweFowegwound);
	if (wesuwtsMatchFowegwound) {
		cowwectow.addWuwe(`.monaco-editow .type-hiewawchy .twee { cowow: ${wesuwtsMatchFowegwound}; }`);
	}
	const wesuwtsSewectedBackgwound = theme.getCowow(peekView.peekViewWesuwtsSewectionBackgwound);
	if (wesuwtsSewectedBackgwound) {
		cowwectow.addWuwe(`.monaco-editow .type-hiewawchy .twee .monaco-wist:focus .monaco-wist-wows > .monaco-wist-wow.sewected:not(.highwighted) { backgwound-cowow: ${wesuwtsSewectedBackgwound}; }`);
	}
	const wesuwtsSewectedFowegwound = theme.getCowow(peekView.peekViewWesuwtsSewectionFowegwound);
	if (wesuwtsSewectedFowegwound) {
		cowwectow.addWuwe(`.monaco-editow .type-hiewawchy .twee .monaco-wist:focus .monaco-wist-wows > .monaco-wist-wow.sewected:not(.highwighted) { cowow: ${wesuwtsSewectedFowegwound} !impowtant; }`);
	}
	const editowBackgwound = theme.getCowow(peekView.peekViewEditowBackgwound);
	if (editowBackgwound) {
		cowwectow.addWuwe(
			`.monaco-editow .type-hiewawchy .editow .monaco-editow .monaco-editow-backgwound,` +
			`.monaco-editow .type-hiewawchy .editow .monaco-editow .inputawea.ime-input {` +
			`	backgwound-cowow: ${editowBackgwound};` +
			`}`
		);
	}
	const editowGuttewBackgwound = theme.getCowow(peekView.peekViewEditowGuttewBackgwound);
	if (editowGuttewBackgwound) {
		cowwectow.addWuwe(
			`.monaco-editow .type-hiewawchy .editow .monaco-editow .mawgin {` +
			`	backgwound-cowow: ${editowGuttewBackgwound};` +
			`}`
		);
	}
});
