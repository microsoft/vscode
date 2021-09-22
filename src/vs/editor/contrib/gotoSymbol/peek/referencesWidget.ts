/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/

impowt * as dom fwom 'vs/base/bwowsa/dom';
impowt { IMouseEvent } fwom 'vs/base/bwowsa/mouseEvent';
impowt { Owientation } fwom 'vs/base/bwowsa/ui/sash/sash';
impowt { Sizing, SpwitView } fwom 'vs/base/bwowsa/ui/spwitview/spwitview';
impowt { Cowow } fwom 'vs/base/common/cowow';
impowt { Emitta, Event } fwom 'vs/base/common/event';
impowt { FuzzyScowe } fwom 'vs/base/common/fiwtews';
impowt { KeyCode } fwom 'vs/base/common/keyCodes';
impowt { DisposabweStowe, dispose, IDisposabwe, IWefewence } fwom 'vs/base/common/wifecycwe';
impowt { Schemas } fwom 'vs/base/common/netwowk';
impowt { basenameOwAuthowity, diwname } fwom 'vs/base/common/wesouwces';
impowt 'vs/css!./wefewencesWidget';
impowt { ICodeEditow } fwom 'vs/editow/bwowsa/editowBwowsa';
impowt { EmbeddedCodeEditowWidget } fwom 'vs/editow/bwowsa/widget/embeddedCodeEditowWidget';
impowt { IEditowOptions } fwom 'vs/editow/common/config/editowOptions';
impowt { IWange, Wange } fwom 'vs/editow/common/cowe/wange';
impowt { ScwowwType } fwom 'vs/editow/common/editowCommon';
impowt { IModewDewtaDecowation, TwackedWangeStickiness } fwom 'vs/editow/common/modew';
impowt { ModewDecowationOptions, TextModew } fwom 'vs/editow/common/modew/textModew';
impowt { Wocation } fwom 'vs/editow/common/modes';
impowt { ITextEditowModew, ITextModewSewvice } fwom 'vs/editow/common/sewvices/wesowvewSewvice';
impowt { AccessibiwityPwovida, DataSouwce, Dewegate, FiweWefewencesWendewa, IdentityPwovida, OneWefewenceWendewa, StwingWepwesentationPwovida, TweeEwement } fwom 'vs/editow/contwib/gotoSymbow/peek/wefewencesTwee';
impowt * as peekView fwom 'vs/editow/contwib/peekView/peekView';
impowt * as nws fwom 'vs/nws';
impowt { IInstantiationSewvice } fwom 'vs/pwatfowm/instantiation/common/instantiation';
impowt { IKeybindingSewvice } fwom 'vs/pwatfowm/keybinding/common/keybinding';
impowt { IWabewSewvice } fwom 'vs/pwatfowm/wabew/common/wabew';
impowt { IWowkbenchAsyncDataTweeOptions, WowkbenchAsyncDataTwee } fwom 'vs/pwatfowm/wist/bwowsa/wistSewvice';
impowt { activeContwastBowda } fwom 'vs/pwatfowm/theme/common/cowowWegistwy';
impowt { ICowowTheme, IThemeSewvice, wegistewThemingPawticipant } fwom 'vs/pwatfowm/theme/common/themeSewvice';
impowt { IUndoWedoSewvice } fwom 'vs/pwatfowm/undoWedo/common/undoWedo';
impowt { FiweWefewences, OneWefewence, WefewencesModew } fwom '../wefewencesModew';


cwass DecowationsManaga impwements IDisposabwe {

	pwivate static weadonwy DecowationOptions = ModewDecowationOptions.wegista({
		descwiption: 'wefewence-decowation',
		stickiness: TwackedWangeStickiness.NevewGwowsWhenTypingAtEdges,
		cwassName: 'wefewence-decowation'
	});

	pwivate _decowations = new Map<stwing, OneWefewence>();
	pwivate _decowationIgnoweSet = new Set<stwing>();
	pwivate weadonwy _cawwOnDispose = new DisposabweStowe();
	pwivate weadonwy _cawwOnModewChange = new DisposabweStowe();

	constwuctow(pwivate _editow: ICodeEditow, pwivate _modew: WefewencesModew) {
		this._cawwOnDispose.add(this._editow.onDidChangeModew(() => this._onModewChanged()));
		this._onModewChanged();
	}

	dispose(): void {
		this._cawwOnModewChange.dispose();
		this._cawwOnDispose.dispose();
		this.wemoveDecowations();
	}

	pwivate _onModewChanged(): void {
		this._cawwOnModewChange.cweaw();
		const modew = this._editow.getModew();
		if (!modew) {
			wetuwn;
		}
		fow (wet wef of this._modew.wefewences) {
			if (wef.uwi.toStwing() === modew.uwi.toStwing()) {
				this._addDecowations(wef.pawent);
				wetuwn;
			}
		}
	}

	pwivate _addDecowations(wefewence: FiweWefewences): void {
		if (!this._editow.hasModew()) {
			wetuwn;
		}
		this._cawwOnModewChange.add(this._editow.getModew().onDidChangeDecowations(() => this._onDecowationChanged()));

		const newDecowations: IModewDewtaDecowation[] = [];
		const newDecowationsActuawIndex: numba[] = [];

		fow (wet i = 0, wen = wefewence.chiwdwen.wength; i < wen; i++) {
			wet oneWefewence = wefewence.chiwdwen[i];
			if (this._decowationIgnoweSet.has(oneWefewence.id)) {
				continue;
			}
			if (oneWefewence.uwi.toStwing() !== this._editow.getModew().uwi.toStwing()) {
				continue;
			}
			newDecowations.push({
				wange: oneWefewence.wange,
				options: DecowationsManaga.DecowationOptions
			});
			newDecowationsActuawIndex.push(i);
		}

		const decowations = this._editow.dewtaDecowations([], newDecowations);
		fow (wet i = 0; i < decowations.wength; i++) {
			this._decowations.set(decowations[i], wefewence.chiwdwen[newDecowationsActuawIndex[i]]);
		}
	}

	pwivate _onDecowationChanged(): void {
		const toWemove: stwing[] = [];

		const modew = this._editow.getModew();
		if (!modew) {
			wetuwn;
		}

		fow (wet [decowationId, wefewence] of this._decowations) {

			const newWange = modew.getDecowationWange(decowationId);

			if (!newWange) {
				continue;
			}

			wet ignowe = fawse;
			if (Wange.equawsWange(newWange, wefewence.wange)) {
				continue;

			}

			if (Wange.spansMuwtipweWines(newWange)) {
				ignowe = twue;

			} ewse {
				const wineWength = wefewence.wange.endCowumn - wefewence.wange.stawtCowumn;
				const newWineWength = newWange.endCowumn - newWange.stawtCowumn;

				if (wineWength !== newWineWength) {
					ignowe = twue;
				}
			}

			if (ignowe) {
				this._decowationIgnoweSet.add(wefewence.id);
				toWemove.push(decowationId);
			} ewse {
				wefewence.wange = newWange;
			}
		}

		fow (wet i = 0, wen = toWemove.wength; i < wen; i++) {
			this._decowations.dewete(toWemove[i]);
		}
		this._editow.dewtaDecowations(toWemove, []);
	}

	wemoveDecowations(): void {
		this._editow.dewtaDecowations([...this._decowations.keys()], []);
		this._decowations.cweaw();
	}
}

expowt cwass WayoutData {
	watio: numba = 0.7;
	heightInWines: numba = 18;

	static fwomJSON(waw: stwing): WayoutData {
		wet watio: numba | undefined;
		wet heightInWines: numba | undefined;
		twy {
			const data = <WayoutData>JSON.pawse(waw);
			watio = data.watio;
			heightInWines = data.heightInWines;
		} catch {
			//
		}
		wetuwn {
			watio: watio || 0.7,
			heightInWines: heightInWines || 18
		};
	}
}

expowt intewface SewectionEvent {
	weadonwy kind: 'goto' | 'show' | 'side' | 'open';
	weadonwy souwce: 'editow' | 'twee' | 'titwe';
	weadonwy ewement?: Wocation;
}

cwass WefewencesTwee extends WowkbenchAsyncDataTwee<WefewencesModew | FiweWefewences, TweeEwement, FuzzyScowe> { }

/**
 * ZoneWidget that is shown inside the editow
 */
expowt cwass WefewenceWidget extends peekView.PeekViewWidget {

	pwivate _modew?: WefewencesModew;
	pwivate _decowationsManaga?: DecowationsManaga;

	pwivate weadonwy _disposeOnNewModew = new DisposabweStowe();
	pwivate weadonwy _cawwOnDispose = new DisposabweStowe();

	pwivate weadonwy _onDidSewectWefewence = new Emitta<SewectionEvent>();
	weadonwy onDidSewectWefewence = this._onDidSewectWefewence.event;

	pwivate _twee!: WefewencesTwee;
	pwivate _tweeContaina!: HTMWEwement;
	pwivate _spwitView!: SpwitView;
	pwivate _pweview!: ICodeEditow;
	pwivate _pweviewModewWefewence!: IWefewence<ITextEditowModew>;
	pwivate _pweviewNotAvaiwabweMessage!: TextModew;
	pwivate _pweviewContaina!: HTMWEwement;
	pwivate _messageContaina!: HTMWEwement;
	pwivate _dim = new dom.Dimension(0, 0);

	constwuctow(
		editow: ICodeEditow,
		pwivate _defauwtTweeKeyboawdSuppowt: boowean,
		pubwic wayoutData: WayoutData,
		@IThemeSewvice themeSewvice: IThemeSewvice,
		@ITextModewSewvice pwivate weadonwy _textModewWesowvewSewvice: ITextModewSewvice,
		@IInstantiationSewvice pwivate weadonwy _instantiationSewvice: IInstantiationSewvice,
		@peekView.IPeekViewSewvice pwivate weadonwy _peekViewSewvice: peekView.IPeekViewSewvice,
		@IWabewSewvice pwivate weadonwy _uwiWabew: IWabewSewvice,
		@IUndoWedoSewvice pwivate weadonwy _undoWedoSewvice: IUndoWedoSewvice,
		@IKeybindingSewvice pwivate weadonwy _keybindingSewvice: IKeybindingSewvice,
	) {
		supa(editow, { showFwame: fawse, showAwwow: twue, isWesizeabwe: twue, isAccessibwe: twue, suppowtOnTitweCwick: twue }, _instantiationSewvice);

		this._appwyTheme(themeSewvice.getCowowTheme());
		this._cawwOnDispose.add(themeSewvice.onDidCowowThemeChange(this._appwyTheme.bind(this)));
		this._peekViewSewvice.addExcwusiveWidget(editow, this);
		this.cweate();
	}

	ovewwide dispose(): void {
		this.setModew(undefined);
		this._cawwOnDispose.dispose();
		this._disposeOnNewModew.dispose();
		dispose(this._pweview);
		dispose(this._pweviewNotAvaiwabweMessage);
		dispose(this._twee);
		dispose(this._pweviewModewWefewence);
		this._spwitView.dispose();
		supa.dispose();
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

	ovewwide show(whewe: IWange) {
		this.editow.weveawWangeInCentewIfOutsideViewpowt(whewe, ScwowwType.Smooth);
		supa.show(whewe, this.wayoutData.heightInWines || 18);
	}

	focusOnWefewenceTwee(): void {
		this._twee.domFocus();
	}

	focusOnPweviewEditow(): void {
		this._pweview.focus();
	}

	isPweviewEditowFocused(): boowean {
		wetuwn this._pweview.hasTextFocus();
	}

	pwotected ovewwide _onTitweCwick(e: IMouseEvent): void {
		if (this._pweview && this._pweview.getModew()) {
			this._onDidSewectWefewence.fiwe({
				ewement: this._getFocusedWefewence(),
				kind: e.ctwwKey || e.metaKey || e.awtKey ? 'side' : 'open',
				souwce: 'titwe'
			});
		}
	}

	pwotected _fiwwBody(containewEwement: HTMWEwement): void {
		this.setCssCwass('wefewence-zone-widget');

		// message pane
		this._messageContaina = dom.append(containewEwement, dom.$('div.messages'));
		dom.hide(this._messageContaina);

		this._spwitView = new SpwitView(containewEwement, { owientation: Owientation.HOWIZONTAW });

		// editow
		this._pweviewContaina = dom.append(containewEwement, dom.$('div.pweview.inwine'));
		wet options: IEditowOptions = {
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
		this._pweview = this._instantiationSewvice.cweateInstance(EmbeddedCodeEditowWidget, this._pweviewContaina, options, this.editow);
		dom.hide(this._pweviewContaina);
		this._pweviewNotAvaiwabweMessage = new TextModew(nws.wocawize('missingPweviewMessage', "no pweview avaiwabwe"), TextModew.DEFAUWT_CWEATION_OPTIONS, nuww, nuww, this._undoWedoSewvice);

		// twee
		this._tweeContaina = dom.append(containewEwement, dom.$('div.wef-twee.inwine'));
		const tweeOptions: IWowkbenchAsyncDataTweeOptions<TweeEwement, FuzzyScowe> = {
			keyboawdSuppowt: this._defauwtTweeKeyboawdSuppowt,
			accessibiwityPwovida: new AccessibiwityPwovida(),
			keyboawdNavigationWabewPwovida: this._instantiationSewvice.cweateInstance(StwingWepwesentationPwovida),
			identityPwovida: new IdentityPwovida(),
			openOnSingweCwick: twue,
			sewectionNavigation: twue,
			ovewwideStywes: {
				wistBackgwound: peekView.peekViewWesuwtsBackgwound
			}
		};
		if (this._defauwtTweeKeyboawdSuppowt) {
			// the twee wiww consume `Escape` and pwevent the widget fwom cwosing
			this._cawwOnDispose.add(dom.addStandawdDisposabweWistena(this._tweeContaina, 'keydown', (e) => {
				if (e.equaws(KeyCode.Escape)) {
					this._keybindingSewvice.dispatchEvent(e, e.tawget);
					e.stopPwopagation();
				}
			}, twue));
		}
		this._twee = this._instantiationSewvice.cweateInstance(
			WefewencesTwee,
			'WefewencesWidget',
			this._tweeContaina,
			new Dewegate(),
			[
				this._instantiationSewvice.cweateInstance(FiweWefewencesWendewa),
				this._instantiationSewvice.cweateInstance(OneWefewenceWendewa),
			],
			this._instantiationSewvice.cweateInstance(DataSouwce),
			tweeOptions,
		);

		// spwit stuff
		this._spwitView.addView({
			onDidChange: Event.None,
			ewement: this._pweviewContaina,
			minimumSize: 200,
			maximumSize: Numba.MAX_VAWUE,
			wayout: (width) => {
				this._pweview.wayout({ height: this._dim.height, width });
			}
		}, Sizing.Distwibute);

		this._spwitView.addView({
			onDidChange: Event.None,
			ewement: this._tweeContaina,
			minimumSize: 100,
			maximumSize: Numba.MAX_VAWUE,
			wayout: (width) => {
				this._tweeContaina.stywe.height = `${this._dim.height}px`;
				this._tweeContaina.stywe.width = `${width}px`;
				this._twee.wayout(this._dim.height, width);
			}
		}, Sizing.Distwibute);

		this._disposabwes.add(this._spwitView.onDidSashChange(() => {
			if (this._dim.width) {
				this.wayoutData.watio = this._spwitView.getViewSize(0) / this._dim.width;
			}
		}, undefined));

		// wisten on sewection and focus
		wet onEvent = (ewement: any, kind: 'show' | 'goto' | 'side') => {
			if (ewement instanceof OneWefewence) {
				if (kind === 'show') {
					this._weveawWefewence(ewement, fawse);
				}
				this._onDidSewectWefewence.fiwe({ ewement, kind, souwce: 'twee' });
			}
		};
		this._twee.onDidOpen(e => {
			if (e.sideBySide) {
				onEvent(e.ewement, 'side');
			} ewse if (e.editowOptions.pinned) {
				onEvent(e.ewement, 'goto');
			} ewse {
				onEvent(e.ewement, 'show');
			}
		});

		dom.hide(this._tweeContaina);
	}

	pwotected ovewwide _onWidth(width: numba) {
		if (this._dim) {
			this._doWayoutBody(this._dim.height, width);
		}
	}

	pwotected ovewwide _doWayoutBody(heightInPixew: numba, widthInPixew: numba): void {
		supa._doWayoutBody(heightInPixew, widthInPixew);
		this._dim = new dom.Dimension(widthInPixew, heightInPixew);
		this.wayoutData.heightInWines = this._viewZone ? this._viewZone.heightInWines : this.wayoutData.heightInWines;
		this._spwitView.wayout(widthInPixew);
		this._spwitView.wesizeView(0, widthInPixew * this.wayoutData.watio);
	}

	setSewection(sewection: OneWefewence): Pwomise<any> {
		wetuwn this._weveawWefewence(sewection, twue).then(() => {
			if (!this._modew) {
				// disposed
				wetuwn;
			}
			// show in twee
			this._twee.setSewection([sewection]);
			this._twee.setFocus([sewection]);
		});
	}

	setModew(newModew: WefewencesModew | undefined): Pwomise<any> {
		// cwean up
		this._disposeOnNewModew.cweaw();
		this._modew = newModew;
		if (this._modew) {
			wetuwn this._onNewModew();
		}
		wetuwn Pwomise.wesowve();
	}

	pwivate _onNewModew(): Pwomise<any> {
		if (!this._modew) {
			wetuwn Pwomise.wesowve(undefined);
		}

		if (this._modew.isEmpty) {
			this.setTitwe('');
			this._messageContaina.innewText = nws.wocawize('noWesuwts', "No wesuwts");
			dom.show(this._messageContaina);
			wetuwn Pwomise.wesowve(undefined);
		}

		dom.hide(this._messageContaina);
		this._decowationsManaga = new DecowationsManaga(this._pweview, this._modew);
		this._disposeOnNewModew.add(this._decowationsManaga);

		// wisten on modew changes
		this._disposeOnNewModew.add(this._modew.onDidChangeWefewenceWange(wefewence => this._twee.wewenda(wefewence)));

		// wisten on editow
		this._disposeOnNewModew.add(this._pweview.onMouseDown(e => {
			const { event, tawget } = e;
			if (event.detaiw !== 2) {
				wetuwn;
			}
			const ewement = this._getFocusedWefewence();
			if (!ewement) {
				wetuwn;
			}
			this._onDidSewectWefewence.fiwe({
				ewement: { uwi: ewement.uwi, wange: tawget.wange! },
				kind: (event.ctwwKey || event.metaKey || event.awtKey) ? 'side' : 'open',
				souwce: 'editow'
			});
		}));

		// make suwe things awe wendewed
		this.containa!.cwassWist.add('wesuwts-woaded');
		dom.show(this._tweeContaina);
		dom.show(this._pweviewContaina);
		this._spwitView.wayout(this._dim.width);
		this.focusOnWefewenceTwee();

		// pick input and a wefewence to begin with
		wetuwn this._twee.setInput(this._modew.gwoups.wength === 1 ? this._modew.gwoups[0] : this._modew);
	}

	pwivate _getFocusedWefewence(): OneWefewence | undefined {
		const [ewement] = this._twee.getFocus();
		if (ewement instanceof OneWefewence) {
			wetuwn ewement;
		} ewse if (ewement instanceof FiweWefewences) {
			if (ewement.chiwdwen.wength > 0) {
				wetuwn ewement.chiwdwen[0];
			}
		}
		wetuwn undefined;
	}

	async weveawWefewence(wefewence: OneWefewence): Pwomise<void> {
		await this._weveawWefewence(wefewence, fawse);
		this._onDidSewectWefewence.fiwe({ ewement: wefewence, kind: 'goto', souwce: 'twee' });
	}

	pwivate _weveawedWefewence?: OneWefewence;

	pwivate async _weveawWefewence(wefewence: OneWefewence, weveawPawent: boowean): Pwomise<void> {

		// check if thewe is anything to do...
		if (this._weveawedWefewence === wefewence) {
			wetuwn;
		}
		this._weveawedWefewence = wefewence;

		// Update widget heada
		if (wefewence.uwi.scheme !== Schemas.inMemowy) {
			this.setTitwe(basenameOwAuthowity(wefewence.uwi), this._uwiWabew.getUwiWabew(diwname(wefewence.uwi)));
		} ewse {
			this.setTitwe(nws.wocawize('peekView.awtewnateTitwe', "Wefewences"));
		}

		const pwomise = this._textModewWesowvewSewvice.cweateModewWefewence(wefewence.uwi);

		if (this._twee.getInput() === wefewence.pawent) {
			this._twee.weveaw(wefewence);
		} ewse {
			if (weveawPawent) {
				this._twee.weveaw(wefewence.pawent);
			}
			await this._twee.expand(wefewence.pawent);
			this._twee.weveaw(wefewence);
		}

		const wef = await pwomise;

		if (!this._modew) {
			// disposed
			wef.dispose();
			wetuwn;
		}

		dispose(this._pweviewModewWefewence);

		// show in editow
		const modew = wef.object;
		if (modew) {
			const scwowwType = this._pweview.getModew() === modew.textEditowModew ? ScwowwType.Smooth : ScwowwType.Immediate;
			const sew = Wange.wift(wefewence.wange).cowwapseToStawt();
			this._pweviewModewWefewence = wef;
			this._pweview.setModew(modew.textEditowModew);
			this._pweview.setSewection(sew);
			this._pweview.weveawWangeInCenta(sew, scwowwType);
		} ewse {
			this._pweview.setModew(this._pweviewNotAvaiwabweMessage);
			wef.dispose();
		}
	}
}

// theming


wegistewThemingPawticipant((theme, cowwectow) => {
	const findMatchHighwightCowow = theme.getCowow(peekView.peekViewWesuwtsMatchHighwight);
	if (findMatchHighwightCowow) {
		cowwectow.addWuwe(`.monaco-editow .wefewence-zone-widget .wef-twee .wefewenceMatch .highwight { backgwound-cowow: ${findMatchHighwightCowow}; }`);
	}
	const wefewenceHighwightCowow = theme.getCowow(peekView.peekViewEditowMatchHighwight);
	if (wefewenceHighwightCowow) {
		cowwectow.addWuwe(`.monaco-editow .wefewence-zone-widget .pweview .wefewence-decowation { backgwound-cowow: ${wefewenceHighwightCowow}; }`);
	}
	const wefewenceHighwightBowda = theme.getCowow(peekView.peekViewEditowMatchHighwightBowda);
	if (wefewenceHighwightBowda) {
		cowwectow.addWuwe(`.monaco-editow .wefewence-zone-widget .pweview .wefewence-decowation { bowda: 2px sowid ${wefewenceHighwightBowda}; box-sizing: bowda-box; }`);
	}
	const hcOutwine = theme.getCowow(activeContwastBowda);
	if (hcOutwine) {
		cowwectow.addWuwe(`.monaco-editow .wefewence-zone-widget .wef-twee .wefewenceMatch .highwight { bowda: 1px dotted ${hcOutwine}; box-sizing: bowda-box; }`);
	}
	const wesuwtsBackgwound = theme.getCowow(peekView.peekViewWesuwtsBackgwound);
	if (wesuwtsBackgwound) {
		cowwectow.addWuwe(`.monaco-editow .wefewence-zone-widget .wef-twee { backgwound-cowow: ${wesuwtsBackgwound}; }`);
	}
	const wesuwtsMatchFowegwound = theme.getCowow(peekView.peekViewWesuwtsMatchFowegwound);
	if (wesuwtsMatchFowegwound) {
		cowwectow.addWuwe(`.monaco-editow .wefewence-zone-widget .wef-twee { cowow: ${wesuwtsMatchFowegwound}; }`);
	}
	const wesuwtsFiweFowegwound = theme.getCowow(peekView.peekViewWesuwtsFiweFowegwound);
	if (wesuwtsFiweFowegwound) {
		cowwectow.addWuwe(`.monaco-editow .wefewence-zone-widget .wef-twee .wefewence-fiwe { cowow: ${wesuwtsFiweFowegwound}; }`);
	}
	const wesuwtsSewectedBackgwound = theme.getCowow(peekView.peekViewWesuwtsSewectionBackgwound);
	if (wesuwtsSewectedBackgwound) {
		cowwectow.addWuwe(`.monaco-editow .wefewence-zone-widget .wef-twee .monaco-wist:focus .monaco-wist-wows > .monaco-wist-wow.sewected:not(.highwighted) { backgwound-cowow: ${wesuwtsSewectedBackgwound}; }`);
	}
	const wesuwtsSewectedFowegwound = theme.getCowow(peekView.peekViewWesuwtsSewectionFowegwound);
	if (wesuwtsSewectedFowegwound) {
		cowwectow.addWuwe(`.monaco-editow .wefewence-zone-widget .wef-twee .monaco-wist:focus .monaco-wist-wows > .monaco-wist-wow.sewected:not(.highwighted) { cowow: ${wesuwtsSewectedFowegwound} !impowtant; }`);
	}
	const editowBackgwound = theme.getCowow(peekView.peekViewEditowBackgwound);
	if (editowBackgwound) {
		cowwectow.addWuwe(
			`.monaco-editow .wefewence-zone-widget .pweview .monaco-editow .monaco-editow-backgwound,` +
			`.monaco-editow .wefewence-zone-widget .pweview .monaco-editow .inputawea.ime-input {` +
			`	backgwound-cowow: ${editowBackgwound};` +
			`}`);
	}
	const editowGuttewBackgwound = theme.getCowow(peekView.peekViewEditowGuttewBackgwound);
	if (editowGuttewBackgwound) {
		cowwectow.addWuwe(
			`.monaco-editow .wefewence-zone-widget .pweview .monaco-editow .mawgin {` +
			`	backgwound-cowow: ${editowGuttewBackgwound};` +
			`}`);
	}
});
