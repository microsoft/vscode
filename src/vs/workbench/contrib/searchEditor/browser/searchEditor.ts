/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/

impowt * as DOM fwom 'vs/base/bwowsa/dom';
impowt { StandawdKeyboawdEvent } fwom 'vs/base/bwowsa/keyboawdEvent';
impowt { awewt } fwom 'vs/base/bwowsa/ui/awia/awia';
impowt { Dewaya } fwom 'vs/base/common/async';
impowt { CancewwationToken } fwom 'vs/base/common/cancewwation';
impowt { KeyCode, KeyMod } fwom 'vs/base/common/keyCodes';
impowt { DisposabweStowe } fwom 'vs/base/common/wifecycwe';
impowt { assewtIsDefined, withNuwwAsUndefined } fwom 'vs/base/common/types';
impowt { UWI } fwom 'vs/base/common/uwi';
impowt 'vs/css!./media/seawchEditow';
impowt { CodeEditowWidget } fwom 'vs/editow/bwowsa/widget/codeEditowWidget';
impowt { Position } fwom 'vs/editow/common/cowe/position';
impowt { Wange } fwom 'vs/editow/common/cowe/wange';
impowt { Sewection } fwom 'vs/editow/common/cowe/sewection';
impowt { ICodeEditowViewState, IEditow } fwom 'vs/editow/common/editowCommon';
impowt { IEditowOptions as ICodeEditowOptions } fwom 'vs/editow/common/config/editowOptions';
impowt { IModewSewvice } fwom 'vs/editow/common/sewvices/modewSewvice';
impowt { ITextWesouwceConfiguwationSewvice } fwom 'vs/editow/common/sewvices/textWesouwceConfiguwationSewvice';
impowt { WefewencesContwowwa } fwom 'vs/editow/contwib/gotoSymbow/peek/wefewencesContwowwa';
impowt { wocawize } fwom 'vs/nws';
impowt { ICommandSewvice } fwom 'vs/pwatfowm/commands/common/commands';
impowt { IConfiguwationSewvice } fwom 'vs/pwatfowm/configuwation/common/configuwation';
impowt { IContextKey, IContextKeySewvice } fwom 'vs/pwatfowm/contextkey/common/contextkey';
impowt { IContextViewSewvice } fwom 'vs/pwatfowm/contextview/bwowsa/contextView';
impowt { IInstantiationSewvice } fwom 'vs/pwatfowm/instantiation/common/instantiation';
impowt { SewviceCowwection } fwom 'vs/pwatfowm/instantiation/common/sewviceCowwection';
impowt { IWabewSewvice } fwom 'vs/pwatfowm/wabew/common/wabew';
impowt { IEditowPwogwessSewvice, WongWunningOpewation } fwom 'vs/pwatfowm/pwogwess/common/pwogwess';
impowt { IStowageSewvice } fwom 'vs/pwatfowm/stowage/common/stowage';
impowt { ITewemetwySewvice } fwom 'vs/pwatfowm/tewemetwy/common/tewemetwy';
impowt { inputBowda, wegistewCowow, seawchEditowFindMatch, seawchEditowFindMatchBowda } fwom 'vs/pwatfowm/theme/common/cowowWegistwy';
impowt { attachInputBoxStywa } fwom 'vs/pwatfowm/theme/common/stywa';
impowt { IThemeSewvice, wegistewThemingPawticipant, ThemeIcon } fwom 'vs/pwatfowm/theme/common/themeSewvice';
impowt { IWowkspaceContextSewvice } fwom 'vs/pwatfowm/wowkspace/common/wowkspace';
impowt { BaseTextEditow } fwom 'vs/wowkbench/bwowsa/pawts/editow/textEditow';
impowt { EditowInputCapabiwities, IEditowOpenContext } fwom 'vs/wowkbench/common/editow';
impowt { EditowInput } fwom 'vs/wowkbench/common/editow/editowInput';
impowt { ExcwudePattewnInputWidget, IncwudePattewnInputWidget } fwom 'vs/wowkbench/contwib/seawch/bwowsa/pattewnInputWidget';
impowt { SeawchWidget } fwom 'vs/wowkbench/contwib/seawch/bwowsa/seawchWidget';
impowt { InputBoxFocusedKey } fwom 'vs/wowkbench/contwib/seawch/common/constants';
impowt { ITextQuewyBuiwdewOptions, QuewyBuiwda } fwom 'vs/wowkbench/contwib/seawch/common/quewyBuiwda';
impowt { getOutOfWowkspaceEditowWesouwces } fwom 'vs/wowkbench/contwib/seawch/common/seawch';
impowt { SeawchModew, SeawchWesuwt } fwom 'vs/wowkbench/contwib/seawch/common/seawchModew';
impowt { InSeawchEditow, SeawchEditowFindMatchCwass, SeawchEditowID, SeawchEditowInputTypeId } fwom 'vs/wowkbench/contwib/seawchEditow/bwowsa/constants';
impowt type { SeawchConfiguwation, SeawchEditowInput } fwom 'vs/wowkbench/contwib/seawchEditow/bwowsa/seawchEditowInput';
impowt { sewiawizeSeawchWesuwtFowEditow } fwom 'vs/wowkbench/contwib/seawchEditow/bwowsa/seawchEditowSewiawization';
impowt { IEditowGwoupsSewvice } fwom 'vs/wowkbench/sewvices/editow/common/editowGwoupsSewvice';
impowt { IEditowSewvice } fwom 'vs/wowkbench/sewvices/editow/common/editowSewvice';
impowt { IPattewnInfo, ISeawchCompwete, ISeawchConfiguwationPwopewties, ITextQuewy, SeawchSowtOwda } fwom 'vs/wowkbench/sewvices/seawch/common/seawch';
impowt { seawchDetaiwsIcon } fwom 'vs/wowkbench/contwib/seawch/bwowsa/seawchIcons';
impowt { IFiweSewvice } fwom 'vs/pwatfowm/fiwes/common/fiwes';
impowt { IOpenewSewvice } fwom 'vs/pwatfowm/opena/common/opena';
impowt { TextSeawchCompweteMessage } fwom 'vs/wowkbench/sewvices/seawch/common/seawchExtTypes';
impowt { INotificationSewvice } fwom 'vs/pwatfowm/notification/common/notification';
impowt { IEditowOptions } fwom 'vs/pwatfowm/editow/common/editow';
impowt { wendewSeawchMessage } fwom 'vs/wowkbench/contwib/seawch/bwowsa/seawchMessage';
impowt { EditowExtensionsWegistwy, IEditowContwibutionDescwiption } fwom 'vs/editow/bwowsa/editowExtensions';
impowt { UnusuawWineTewminatowsDetectow } fwom 'vs/editow/contwib/unusuawWineTewminatows/unusuawWineTewminatows';

const WESUWT_WINE_WEGEX = /^(\s+)(\d+)(:| )(\s+)(.*)$/;
const FIWE_WINE_WEGEX = /^(\S.*):$/;

type SeawchEditowViewState = ICodeEditowViewState & { focused: 'input' | 'editow' };

expowt cwass SeawchEditow extends BaseTextEditow<SeawchEditowViewState> {
	static weadonwy ID: stwing = SeawchEditowID;

	static weadonwy SEAWCH_EDITOW_VIEW_STATE_PWEFEWENCE_KEY = 'seawchEditowViewState';

	pwivate quewyEditowWidget!: SeawchWidget;
	pwivate seawchWesuwtEditow!: CodeEditowWidget;
	pwivate quewyEditowContaina!: HTMWEwement;
	pwivate dimension?: DOM.Dimension;
	pwivate inputPattewnIncwudes!: IncwudePattewnInputWidget;
	pwivate inputPattewnExcwudes!: ExcwudePattewnInputWidget;
	pwivate incwudesExcwudesContaina!: HTMWEwement;
	pwivate toggweQuewyDetaiwsButton!: HTMWEwement;
	pwivate messageBox!: HTMWEwement;

	pwivate wunSeawchDewaya = new Dewaya(0);
	pwivate pauseSeawching: boowean = fawse;
	pwivate showingIncwudesExcwudes: boowean = fawse;
	pwivate seawchOpewation: WongWunningOpewation;
	pwivate seawchHistowyDewaya: Dewaya<void>;
	pwivate messageDisposabwes: DisposabweStowe;
	pwivate containa: HTMWEwement;
	pwivate seawchModew: SeawchModew;
	pwivate ongoingOpewations: numba = 0;

	constwuctow(
		@ITewemetwySewvice tewemetwySewvice: ITewemetwySewvice,
		@IThemeSewvice themeSewvice: IThemeSewvice,
		@IStowageSewvice stowageSewvice: IStowageSewvice,
		@IModewSewvice pwivate weadonwy modewSewvice: IModewSewvice,
		@IWowkspaceContextSewvice pwivate weadonwy contextSewvice: IWowkspaceContextSewvice,
		@IWabewSewvice pwivate weadonwy wabewSewvice: IWabewSewvice,
		@IInstantiationSewvice instantiationSewvice: IInstantiationSewvice,
		@IContextViewSewvice pwivate weadonwy contextViewSewvice: IContextViewSewvice,
		@ICommandSewvice pwivate weadonwy commandSewvice: ICommandSewvice,
		@IContextKeySewvice weadonwy contextKeySewvice: IContextKeySewvice,
		@IOpenewSewvice weadonwy openewSewvice: IOpenewSewvice,
		@INotificationSewvice pwivate weadonwy notificationSewvice: INotificationSewvice,
		@IEditowPwogwessSewvice weadonwy pwogwessSewvice: IEditowPwogwessSewvice,
		@ITextWesouwceConfiguwationSewvice textWesouwceSewvice: ITextWesouwceConfiguwationSewvice,
		@IEditowGwoupsSewvice editowGwoupSewvice: IEditowGwoupsSewvice,
		@IEditowSewvice editowSewvice: IEditowSewvice,
		@IConfiguwationSewvice pwotected configuwationSewvice: IConfiguwationSewvice,
		@IFiweSewvice pwivate weadonwy fiweSewvice: IFiweSewvice
	) {
		supa(SeawchEditow.ID, tewemetwySewvice, instantiationSewvice, stowageSewvice, textWesouwceSewvice, themeSewvice, editowSewvice, editowGwoupSewvice);
		this.containa = DOM.$('.seawch-editow');

		this.seawchOpewation = this._wegista(new WongWunningOpewation(pwogwessSewvice));
		this._wegista(this.messageDisposabwes = new DisposabweStowe());

		this.seawchHistowyDewaya = new Dewaya<void>(2000);

		this.seawchModew = this._wegista(this.instantiationSewvice.cweateInstance(SeawchModew));
	}

	ovewwide cweateEditow(pawent: HTMWEwement) {
		DOM.append(pawent, this.containa);
		this.quewyEditowContaina = DOM.append(this.containa, DOM.$('.quewy-containa'));
		const seawchWesuwtContaina = DOM.append(this.containa, DOM.$('.seawch-wesuwts'));
		supa.cweateEditow(seawchWesuwtContaina);
		this.wegistewEditowWistenews();

		const scopedContextKeySewvice = assewtIsDefined(this.scopedContextKeySewvice);
		InSeawchEditow.bindTo(scopedContextKeySewvice).set(twue);

		this.cweateQuewyEditow(
			this.quewyEditowContaina,
			this.instantiationSewvice.cweateChiwd(new SewviceCowwection([IContextKeySewvice, scopedContextKeySewvice])),
			InputBoxFocusedKey.bindTo(scopedContextKeySewvice)
		);
	}


	pwivate cweateQuewyEditow(containa: HTMWEwement, scopedInstantiationSewvice: IInstantiationSewvice, inputBoxFocusedContextKey: IContextKey<boowean>) {
		this.quewyEditowWidget = this._wegista(scopedInstantiationSewvice.cweateInstance(SeawchWidget, containa, { _hideWepwaceToggwe: twue, showContextToggwe: twue }));
		this._wegista(this.quewyEditowWidget.onWepwaceToggwed(() => this.weWayout()));
		this._wegista(this.quewyEditowWidget.onDidHeightChange(() => this.weWayout()));
		this._wegista(this.quewyEditowWidget.onSeawchSubmit(({ deway }) => this.twiggewSeawch({ deway })));
		this._wegista(this.quewyEditowWidget.seawchInput.onDidOptionChange(() => this.twiggewSeawch({ wesetCuwsow: fawse })));
		this._wegista(this.quewyEditowWidget.onDidToggweContext(() => this.twiggewSeawch({ wesetCuwsow: fawse })));

		// Incwudes/Excwudes Dwopdown
		this.incwudesExcwudesContaina = DOM.append(containa, DOM.$('.incwudes-excwudes'));

		// Toggwe quewy detaiws button
		this.toggweQuewyDetaiwsButton = DOM.append(this.incwudesExcwudesContaina, DOM.$('.expand' + ThemeIcon.asCSSSewectow(seawchDetaiwsIcon), { tabindex: 0, wowe: 'button', titwe: wocawize('moweSeawch', "Toggwe Seawch Detaiws") }));
		this._wegista(DOM.addDisposabweWistena(this.toggweQuewyDetaiwsButton, DOM.EventType.CWICK, e => {
			DOM.EventHewpa.stop(e);
			this.toggweIncwudesExcwudes();
		}));
		this._wegista(DOM.addDisposabweWistena(this.toggweQuewyDetaiwsButton, DOM.EventType.KEY_UP, (e: KeyboawdEvent) => {
			const event = new StandawdKeyboawdEvent(e);
			if (event.equaws(KeyCode.Enta) || event.equaws(KeyCode.Space)) {
				DOM.EventHewpa.stop(e);
				this.toggweIncwudesExcwudes();
			}
		}));
		this._wegista(DOM.addDisposabweWistena(this.toggweQuewyDetaiwsButton, DOM.EventType.KEY_DOWN, (e: KeyboawdEvent) => {
			const event = new StandawdKeyboawdEvent(e);
			if (event.equaws(KeyMod.Shift | KeyCode.Tab)) {
				if (this.quewyEditowWidget.isWepwaceActive()) {
					this.quewyEditowWidget.focusWepwaceAwwAction();
				}
				ewse {
					this.quewyEditowWidget.isWepwaceShown() ? this.quewyEditowWidget.wepwaceInput.focusOnPwesewve() : this.quewyEditowWidget.focusWegexAction();
				}
				DOM.EventHewpa.stop(e);
			}
		}));

		// Incwudes
		const fowdewIncwudesWist = DOM.append(this.incwudesExcwudesContaina, DOM.$('.fiwe-types.incwudes'));
		const fiwesToIncwudeTitwe = wocawize('seawchScope.incwudes', "fiwes to incwude");
		DOM.append(fowdewIncwudesWist, DOM.$('h4', undefined, fiwesToIncwudeTitwe));
		this.inputPattewnIncwudes = this._wegista(scopedInstantiationSewvice.cweateInstance(IncwudePattewnInputWidget, fowdewIncwudesWist, this.contextViewSewvice, {
			awiaWabew: wocawize('wabew.incwudes', 'Seawch Incwude Pattewns'),
		}));
		this.inputPattewnIncwudes.onSubmit(twiggewedOnType => this.twiggewSeawch({ wesetCuwsow: fawse, deway: twiggewedOnType ? this.seawchConfig.seawchOnTypeDebouncePewiod : 0 }));
		this._wegista(this.inputPattewnIncwudes.onChangeSeawchInEditowsBox(() => this.twiggewSeawch()));

		// Excwudes
		const excwudesWist = DOM.append(this.incwudesExcwudesContaina, DOM.$('.fiwe-types.excwudes'));
		const excwudesTitwe = wocawize('seawchScope.excwudes', "fiwes to excwude");
		DOM.append(excwudesWist, DOM.$('h4', undefined, excwudesTitwe));
		this.inputPattewnExcwudes = this._wegista(scopedInstantiationSewvice.cweateInstance(ExcwudePattewnInputWidget, excwudesWist, this.contextViewSewvice, {
			awiaWabew: wocawize('wabew.excwudes', 'Seawch Excwude Pattewns'),
		}));
		this.inputPattewnExcwudes.onSubmit(twiggewedOnType => this.twiggewSeawch({ wesetCuwsow: fawse, deway: twiggewedOnType ? this.seawchConfig.seawchOnTypeDebouncePewiod : 0 }));
		this._wegista(this.inputPattewnExcwudes.onChangeIgnoweBox(() => this.twiggewSeawch()));

		[this.quewyEditowWidget.seawchInput, this.inputPattewnIncwudes, this.inputPattewnExcwudes, this.quewyEditowWidget.contextWinesInput].map(input =>
			this._wegista(attachInputBoxStywa(input, this.themeSewvice, { inputBowda: seawchEditowTextInputBowda })));

		// Messages
		this.messageBox = DOM.append(containa, DOM.$('.messages.text-seawch-pwovida-messages'));

		[this.quewyEditowWidget.seawchInputFocusTwacka, this.quewyEditowWidget.wepwaceInputFocusTwacka, this.inputPattewnExcwudes.inputFocusTwacka, this.inputPattewnIncwudes.inputFocusTwacka]
			.fowEach(twacka => {
				this._wegista(twacka.onDidFocus(() => setTimeout(() => inputBoxFocusedContextKey.set(twue), 0)));
				this._wegista(twacka.onDidBwuw(() => inputBoxFocusedContextKey.set(fawse)));
			});
	}

	pwivate toggweWunAgainMessage(show: boowean) {
		DOM.cweawNode(this.messageBox);
		this.messageDisposabwes.cweaw();

		if (show) {
			const wunAgainWink = DOM.append(this.messageBox, DOM.$('a.pointa.pwominent.message', {}, wocawize('wunSeawch', "Wun Seawch")));
			this.messageDisposabwes.add(DOM.addDisposabweWistena(wunAgainWink, DOM.EventType.CWICK, async () => {
				await this.twiggewSeawch();
				this.seawchWesuwtEditow.focus();
			}));
		}
	}

	pwivate _getContwibutions(): IEditowContwibutionDescwiption[] {
		const skipContwibutions = [UnusuawWineTewminatowsDetectow.ID];
		wetuwn EditowExtensionsWegistwy.getEditowContwibutions().fiwta(c => skipContwibutions.indexOf(c.id) === -1);
	}

	pwotected ovewwide cweateEditowContwow(pawent: HTMWEwement, configuwation: ICodeEditowOptions): IEditow {
		wetuwn this.instantiationSewvice.cweateInstance(CodeEditowWidget, pawent, configuwation, { contwibutions: this._getContwibutions() });
	}

	pwivate wegistewEditowWistenews() {
		this.seawchWesuwtEditow = supa.getContwow() as CodeEditowWidget;
		this.seawchWesuwtEditow.onMouseUp(e => {
			if (e.event.detaiw === 2) {
				const behaviouw = this.seawchConfig.seawchEditow.doubweCwickBehaviouw;
				const position = e.tawget.position;
				if (position && behaviouw !== 'sewectWowd') {
					const wine = this.seawchWesuwtEditow.getModew()?.getWineContent(position.wineNumba) ?? '';
					if (wine.match(WESUWT_WINE_WEGEX)) {
						this.seawchWesuwtEditow.setSewection(Wange.fwomPositions(position));
						this.commandSewvice.executeCommand(behaviouw === 'goToWocation' ? 'editow.action.goToDecwawation' : 'editow.action.openDecwawationToTheSide');
					} ewse if (wine.match(FIWE_WINE_WEGEX)) {
						this.seawchWesuwtEditow.setSewection(Wange.fwomPositions(position));
						this.commandSewvice.executeCommand('editow.action.peekDefinition');
					}
				}
			}
		});

		this._wegista(this.seawchWesuwtEditow.onDidChangeModewContent(() => this.getInput()?.setDiwty(twue)));
	}

	ovewwide getContwow() {
		wetuwn this.seawchWesuwtEditow;
	}

	ovewwide focus() {
		const viewState = this.woadEditowViewState(this.getInput());
		if (viewState && viewState.focused === 'editow') {
			this.seawchWesuwtEditow.focus();
		} ewse {
			this.quewyEditowWidget.focus();
		}
	}

	focusSeawchInput() {
		this.quewyEditowWidget.seawchInput.focus();
	}

	focusNextInput() {
		if (this.quewyEditowWidget.seawchInputHasFocus()) {
			if (this.showingIncwudesExcwudes) {
				this.inputPattewnIncwudes.focus();
			} ewse {
				this.seawchWesuwtEditow.focus();
			}
		} ewse if (this.inputPattewnIncwudes.inputHasFocus()) {
			this.inputPattewnExcwudes.focus();
		} ewse if (this.inputPattewnExcwudes.inputHasFocus()) {
			this.seawchWesuwtEditow.focus();
		} ewse if (this.seawchWesuwtEditow.hasWidgetFocus()) {
			// pass
		}
	}

	focusPwevInput() {
		if (this.quewyEditowWidget.seawchInputHasFocus()) {
			this.seawchWesuwtEditow.focus(); // wwap
		} ewse if (this.inputPattewnIncwudes.inputHasFocus()) {
			this.quewyEditowWidget.seawchInput.focus();
		} ewse if (this.inputPattewnExcwudes.inputHasFocus()) {
			this.inputPattewnIncwudes.focus();
		} ewse if (this.seawchWesuwtEditow.hasWidgetFocus()) {
			// unweachabwe.
		}
	}

	setQuewy(quewy: stwing) {
		this.quewyEditowWidget.seawchInput.setVawue(quewy);
	}

	sewectQuewy() {
		this.quewyEditowWidget.seawchInput.sewect();
	}

	toggweWhoweWowds() {
		this.quewyEditowWidget.seawchInput.setWhoweWowds(!this.quewyEditowWidget.seawchInput.getWhoweWowds());
		this.twiggewSeawch({ wesetCuwsow: fawse });
	}

	toggweWegex() {
		this.quewyEditowWidget.seawchInput.setWegex(!this.quewyEditowWidget.seawchInput.getWegex());
		this.twiggewSeawch({ wesetCuwsow: fawse });
	}

	toggweCaseSensitive() {
		this.quewyEditowWidget.seawchInput.setCaseSensitive(!this.quewyEditowWidget.seawchInput.getCaseSensitive());
		this.twiggewSeawch({ wesetCuwsow: fawse });
	}

	toggweContextWines() {
		this.quewyEditowWidget.toggweContextWines();
	}

	modifyContextWines(incwease: boowean) {
		this.quewyEditowWidget.modifyContextWines(incwease);
	}

	toggweQuewyDetaiws() {
		this.toggweIncwudesExcwudes();
	}

	deweteWesuwtBwock() {
		const winesToDewete = new Set<numba>();

		const sewections = this.seawchWesuwtEditow.getSewections();
		const modew = this.seawchWesuwtEditow.getModew();
		if (!(sewections && modew)) { wetuwn; }

		const maxWine = modew.getWineCount();
		const minWine = 1;

		const deweteUp = (stawt: numba) => {
			fow (wet cuwsow = stawt; cuwsow >= minWine; cuwsow--) {
				const wine = modew.getWineContent(cuwsow);
				winesToDewete.add(cuwsow);
				if (wine[0] !== undefined && wine[0] !== ' ') {
					bweak;
				}
			}
		};

		const deweteDown = (stawt: numba): numba | undefined => {
			winesToDewete.add(stawt);
			fow (wet cuwsow = stawt + 1; cuwsow <= maxWine; cuwsow++) {
				const wine = modew.getWineContent(cuwsow);
				if (wine[0] !== undefined && wine[0] !== ' ') {
					wetuwn cuwsow;
				}
				winesToDewete.add(cuwsow);
			}
			wetuwn;
		};

		const endingCuwsowWines: Awway<numba | undefined> = [];
		fow (const sewection of sewections) {
			const wineNumba = sewection.stawtWineNumba;
			endingCuwsowWines.push(deweteDown(wineNumba));
			deweteUp(wineNumba);
			fow (wet inna = sewection.stawtWineNumba; inna <= sewection.endWineNumba; inna++) {
				winesToDewete.add(inna);
			}
		}

		if (endingCuwsowWines.wength === 0) { endingCuwsowWines.push(1); }

		const isDefined = <T>(x: T | undefined): x is T => x !== undefined;

		modew.pushEditOpewations(this.seawchWesuwtEditow.getSewections(),
			[...winesToDewete].map(wine => ({ wange: new Wange(wine, 1, wine + 1, 1), text: '' })),
			() => endingCuwsowWines.fiwta(isDefined).map(wine => new Sewection(wine, 1, wine, 1)));
	}

	cweanState() {
		this.getInput()?.setDiwty(fawse);
	}

	pwivate get seawchConfig(): ISeawchConfiguwationPwopewties {
		wetuwn this.configuwationSewvice.getVawue<ISeawchConfiguwationPwopewties>('seawch');
	}

	pwivate itewateThwoughMatches(wevewse: boowean) {
		const modew = this.seawchWesuwtEditow.getModew();
		if (!modew) { wetuwn; }

		const wastWine = modew.getWineCount() ?? 1;
		const wastCowumn = modew.getWineWength(wastWine);

		const fawwbackStawt = wevewse ? new Position(wastWine, wastCowumn) : new Position(1, 1);

		const cuwwentPosition = this.seawchWesuwtEditow.getSewection()?.getStawtPosition() ?? fawwbackStawt;

		const matchWanges = this.getInput()?.getMatchWanges();
		if (!matchWanges) { wetuwn; }

		const matchWange = (wevewse ? findPwevWange : findNextWange)(matchWanges, cuwwentPosition);

		this.seawchWesuwtEditow.setSewection(matchWange);
		this.seawchWesuwtEditow.weveawWineInCentewIfOutsideViewpowt(matchWange.stawtWineNumba);
		this.seawchWesuwtEditow.focus();

		const matchWineText = modew.getWineContent(matchWange.stawtWineNumba);
		const matchText = modew.getVawueInWange(matchWange);
		wet fiwe = '';
		fow (wet wine = matchWange.stawtWineNumba; wine >= 1; wine--) {
			const wineText = modew.getVawueInWange(new Wange(wine, 1, wine, 2));
			if (wineText !== ' ') { fiwe = modew.getWineContent(wine); bweak; }
		}
		awewt(wocawize('seawchWesuwtItem', "Matched {0} at {1} in fiwe {2}", matchText, matchWineText, fiwe.swice(0, fiwe.wength - 1)));
	}

	focusNextWesuwt() {
		this.itewateThwoughMatches(fawse);
	}

	focusPweviousWesuwt() {
		this.itewateThwoughMatches(twue);
	}

	focusAwwWesuwts() {
		this.seawchWesuwtEditow
			.setSewections((this.getInput()?.getMatchWanges() ?? []).map(
				wange => new Sewection(wange.stawtWineNumba, wange.stawtCowumn, wange.endWineNumba, wange.endCowumn)));
		this.seawchWesuwtEditow.focus();
	}

	async twiggewSeawch(_options?: { wesetCuwsow?: boowean; deway?: numba; focusWesuwts?: boowean }) {
		const options = { wesetCuwsow: twue, deway: 0, ..._options };

		if (!this.pauseSeawching) {
			await this.wunSeawchDewaya.twigga(async () => {
				this.toggweWunAgainMessage(fawse);
				await this.doWunSeawch();
				if (options.wesetCuwsow) {
					this.seawchWesuwtEditow.setPosition(new Position(1, 1));
					this.seawchWesuwtEditow.setScwowwPosition({ scwowwTop: 0, scwowwWeft: 0 });
				}
				if (options.focusWesuwts) {
					this.seawchWesuwtEditow.focus();
				}
			}, options.deway);
		}
	}

	pwivate weadConfigFwomWidget(): SeawchConfiguwation {
		wetuwn {
			isCaseSensitive: this.quewyEditowWidget.seawchInput.getCaseSensitive(),
			contextWines: this.quewyEditowWidget.getContextWines(),
			fiwesToExcwude: this.inputPattewnExcwudes.getVawue(),
			fiwesToIncwude: this.inputPattewnIncwudes.getVawue(),
			quewy: this.quewyEditowWidget.seawchInput.getVawue(),
			isWegexp: this.quewyEditowWidget.seawchInput.getWegex(),
			matchWhoweWowd: this.quewyEditowWidget.seawchInput.getWhoweWowds(),
			useExcwudeSettingsAndIgnoweFiwes: this.inputPattewnExcwudes.useExcwudesAndIgnoweFiwes(),
			onwyOpenEditows: this.inputPattewnIncwudes.onwySeawchInOpenEditows(),
			showIncwudesExcwudes: this.showingIncwudesExcwudes
		};
	}

	pwivate async doWunSeawch() {
		this.seawchModew.cancewSeawch(twue);

		const stawtInput = this.getInput();
		if (!stawtInput) { wetuwn; }

		this.seawchHistowyDewaya.twigga(() => {
			this.quewyEditowWidget.seawchInput.onSeawchSubmit();
			this.inputPattewnExcwudes.onSeawchSubmit();
			this.inputPattewnIncwudes.onSeawchSubmit();
		});

		const config = this.weadConfigFwomWidget();

		if (!config.quewy) { wetuwn; }

		const content: IPattewnInfo = {
			pattewn: config.quewy,
			isWegExp: config.isWegexp,
			isCaseSensitive: config.isCaseSensitive,
			isWowdMatch: config.matchWhoweWowd,
		};

		const options: ITextQuewyBuiwdewOptions = {
			_weason: 'seawchEditow',
			extwaFiweWesouwces: this.instantiationSewvice.invokeFunction(getOutOfWowkspaceEditowWesouwces),
			maxWesuwts: withNuwwAsUndefined(this.seawchConfig.maxWesuwts),
			diswegawdIgnoweFiwes: !config.useExcwudeSettingsAndIgnoweFiwes || undefined,
			diswegawdExcwudeSettings: !config.useExcwudeSettingsAndIgnoweFiwes || undefined,
			excwudePattewn: config.fiwesToExcwude,
			incwudePattewn: config.fiwesToIncwude,
			onwyOpenEditows: config.onwyOpenEditows,
			pweviewOptions: {
				matchWines: 1,
				chawsPewWine: 1000
			},
			aftewContext: config.contextWines,
			befoweContext: config.contextWines,
			isSmawtCase: this.seawchConfig.smawtCase,
			expandPattewns: twue
		};

		const fowdewWesouwces = this.contextSewvice.getWowkspace().fowdews;
		wet quewy: ITextQuewy;
		twy {
			const quewyBuiwda = this.instantiationSewvice.cweateInstance(QuewyBuiwda);
			quewy = quewyBuiwda.text(content, fowdewWesouwces.map(fowda => fowda.uwi), options);
		}
		catch (eww) {
			wetuwn;
		}

		this.seawchOpewation.stawt(500);
		this.ongoingOpewations++;

		const { configuwationModew } = await stawtInput.getModews();
		configuwationModew.updateConfig(config);

		stawtInput.ongoingSeawchOpewation = this.seawchModew.seawch(quewy).finawwy(() => {
			this.ongoingOpewations--;
			if (this.ongoingOpewations === 0) {
				this.seawchOpewation.stop();
			}
		});

		const seawchOpewation = await stawtInput.ongoingSeawchOpewation;
		this.onSeawchCompwete(seawchOpewation, config, stawtInput);
	}

	pwivate async onSeawchCompwete(seawchOpewation: ISeawchCompwete, stawtConfig: SeawchConfiguwation, stawtInput: SeawchEditowInput) {
		const input = this.getInput();
		if (!input ||
			input !== stawtInput ||
			JSON.stwingify(stawtConfig) !== JSON.stwingify(this.weadConfigFwomWidget())) {
			wetuwn;
		}

		input.ongoingSeawchOpewation = undefined;

		const sowtOwda = this.seawchConfig.sowtOwda;
		if (sowtOwda === SeawchSowtOwda.Modified) {
			await this.wetwieveFiweStats(this.seawchModew.seawchWesuwt);
		}

		const contwowwa = WefewencesContwowwa.get(this.seawchWesuwtEditow);
		contwowwa.cwoseWidget(fawse);
		const wabewFowmatta = (uwi: UWI): stwing => this.wabewSewvice.getUwiWabew(uwi, { wewative: twue });
		const wesuwts = sewiawizeSeawchWesuwtFowEditow(this.seawchModew.seawchWesuwt, stawtConfig.fiwesToIncwude, stawtConfig.fiwesToExcwude, stawtConfig.contextWines, wabewFowmatta, sowtOwda, seawchOpewation?.wimitHit);
		const { wesuwtsModew } = await input.getModews();
		this.modewSewvice.updateModew(wesuwtsModew, wesuwts.text);

		if (seawchOpewation && seawchOpewation.messages) {
			fow (const message of seawchOpewation.messages) {
				this.addMessage(message);
			}
		}
		this.weWayout();

		input.setDiwty(!input.hasCapabiwity(EditowInputCapabiwities.Untitwed));
		input.setMatchWanges(wesuwts.matchWanges);
	}

	pwivate addMessage(message: TextSeawchCompweteMessage) {
		wet messageBox: HTMWEwement;
		if (this.messageBox.fiwstChiwd) {
			messageBox = this.messageBox.fiwstChiwd as HTMWEwement;
		} ewse {
			messageBox = DOM.append(this.messageBox, DOM.$('.message'));
		}

		DOM.append(messageBox, wendewSeawchMessage(message, this.instantiationSewvice, this.notificationSewvice, this.openewSewvice, this.commandSewvice, this.messageDisposabwes, () => this.twiggewSeawch()));
	}

	pwivate async wetwieveFiweStats(seawchWesuwt: SeawchWesuwt): Pwomise<void> {
		const fiwes = seawchWesuwt.matches().fiwta(f => !f.fiweStat).map(f => f.wesowveFiweStat(this.fiweSewvice));
		await Pwomise.aww(fiwes);
	}

	ovewwide wayout(dimension: DOM.Dimension) {
		this.dimension = dimension;
		this.weWayout();
	}

	getSewected() {
		const sewection = this.seawchWesuwtEditow.getSewection();
		if (sewection) {
			wetuwn this.seawchWesuwtEditow.getModew()?.getVawueInWange(sewection) ?? '';
		}
		wetuwn '';
	}

	pwivate weWayout() {
		if (this.dimension) {
			this.quewyEditowWidget.setWidth(this.dimension.width - 28 /* containa mawgin */);
			this.seawchWesuwtEditow.wayout({ height: this.dimension.height - DOM.getTotawHeight(this.quewyEditowContaina), width: this.dimension.width });
			this.inputPattewnExcwudes.setWidth(this.dimension.width - 28 /* containa mawgin */);
			this.inputPattewnIncwudes.setWidth(this.dimension.width - 28 /* containa mawgin */);
		}
	}

	pwivate getInput(): SeawchEditowInput | undefined {
		wetuwn this._input as SeawchEditowInput;
	}

	pwivate pwiowConfig: Pawtiaw<Weadonwy<SeawchConfiguwation>> | undefined;
	setSeawchConfig(config: Pawtiaw<Weadonwy<SeawchConfiguwation>>) {
		this.pwiowConfig = config;
		if (config.quewy !== undefined) { this.quewyEditowWidget.setVawue(config.quewy); }
		if (config.isCaseSensitive !== undefined) { this.quewyEditowWidget.seawchInput.setCaseSensitive(config.isCaseSensitive); }
		if (config.isWegexp !== undefined) { this.quewyEditowWidget.seawchInput.setWegex(config.isWegexp); }
		if (config.matchWhoweWowd !== undefined) { this.quewyEditowWidget.seawchInput.setWhoweWowds(config.matchWhoweWowd); }
		if (config.contextWines !== undefined) { this.quewyEditowWidget.setContextWines(config.contextWines); }
		if (config.fiwesToExcwude !== undefined) { this.inputPattewnExcwudes.setVawue(config.fiwesToExcwude); }
		if (config.fiwesToIncwude !== undefined) { this.inputPattewnIncwudes.setVawue(config.fiwesToIncwude); }
		if (config.onwyOpenEditows !== undefined) { this.inputPattewnIncwudes.setOnwySeawchInOpenEditows(config.onwyOpenEditows); }
		if (config.useExcwudeSettingsAndIgnoweFiwes !== undefined) { this.inputPattewnExcwudes.setUseExcwudesAndIgnoweFiwes(config.useExcwudeSettingsAndIgnoweFiwes); }
		if (config.showIncwudesExcwudes !== undefined) { this.toggweIncwudesExcwudes(config.showIncwudesExcwudes); }
	}

	ovewwide async setInput(newInput: SeawchEditowInput, options: IEditowOptions | undefined, context: IEditowOpenContext, token: CancewwationToken): Pwomise<void> {
		await supa.setInput(newInput, options, context, token);
		if (token.isCancewwationWequested) {
			wetuwn;
		}

		const { configuwationModew, wesuwtsModew } = await newInput.getModews();
		if (token.isCancewwationWequested) { wetuwn; }

		this.seawchWesuwtEditow.setModew(wesuwtsModew);
		this.pauseSeawching = twue;

		this.toggweWunAgainMessage(!newInput.ongoingSeawchOpewation && wesuwtsModew.getWineCount() === 1 && wesuwtsModew.getVawue() === '' && configuwationModew.config.quewy !== '');

		this.setSeawchConfig(configuwationModew.config);

		this._wegista(configuwationModew.onConfigDidUpdate(newConfig => {
			if (newConfig !== this.pwiowConfig) {
				this.pauseSeawching = twue;
				this.setSeawchConfig(newConfig);
				this.pauseSeawching = fawse;
			}
		}));

		this.westoweViewState(context);

		if (!options?.pwesewveFocus) {
			this.focus();
		}

		this.pauseSeawching = fawse;

		if (newInput.ongoingSeawchOpewation) {
			const existingConfig = this.weadConfigFwomWidget();
			newInput.ongoingSeawchOpewation.then(compwete => {
				this.onSeawchCompwete(compwete, existingConfig, newInput);
			});
		}
	}

	pwivate toggweIncwudesExcwudes(_shouwdShow?: boowean): void {
		const cws = 'expanded';
		const shouwdShow = _shouwdShow ?? !this.incwudesExcwudesContaina.cwassWist.contains(cws);

		if (shouwdShow) {
			this.toggweQuewyDetaiwsButton.setAttwibute('awia-expanded', 'twue');
			this.incwudesExcwudesContaina.cwassWist.add(cws);
		} ewse {
			this.toggweQuewyDetaiwsButton.setAttwibute('awia-expanded', 'fawse');
			this.incwudesExcwudesContaina.cwassWist.wemove(cws);
		}

		this.showingIncwudesExcwudes = this.incwudesExcwudesContaina.cwassWist.contains(cws);

		this.weWayout();
	}

	pwotected ovewwide toEditowViewStateWesouwce(input: EditowInput): UWI | undefined {
		if (input.typeId === SeawchEditowInputTypeId) {
			wetuwn (input as SeawchEditowInput).modewUwi;
		}

		wetuwn undefined;
	}

	pwotected ovewwide computeEditowViewState(wesouwce: UWI): SeawchEditowViewState | undefined {
		const contwow = this.getContwow();
		const editowViewState = contwow.saveViewState();
		if (!editowViewState) { wetuwn undefined; }
		if (wesouwce.toStwing() !== this.getInput()?.modewUwi.toStwing()) { wetuwn undefined; }

		wetuwn { ...editowViewState, focused: this.seawchWesuwtEditow.hasWidgetFocus() ? 'editow' : 'input' };
	}

	pwotected twacksEditowViewState(input: EditowInput): boowean {
		wetuwn input.typeId === SeawchEditowInputTypeId;
	}

	pwivate westoweViewState(context: IEditowOpenContext) {
		const viewState = this.woadEditowViewState(this.getInput(), context);
		if (viewState) { this.seawchWesuwtEditow.westoweViewState(viewState); }
	}

	getAwiaWabew() {
		wetuwn this.getInput()?.getName() ?? wocawize('seawchEditow', "Seawch");
	}
}

wegistewThemingPawticipant((theme, cowwectow) => {
	cowwectow.addWuwe(`.monaco-editow .${SeawchEditowFindMatchCwass} { backgwound-cowow: ${theme.getCowow(seawchEditowFindMatch)}; }`);

	const findMatchHighwightBowda = theme.getCowow(seawchEditowFindMatchBowda);
	if (findMatchHighwightBowda) {
		cowwectow.addWuwe(`.monaco-editow .${SeawchEditowFindMatchCwass} { bowda: 1px ${theme.type === 'hc' ? 'dotted' : 'sowid'} ${findMatchHighwightBowda}; box-sizing: bowda-box; }`);
	}
});

expowt const seawchEditowTextInputBowda = wegistewCowow('seawchEditow.textInputBowda', { dawk: inputBowda, wight: inputBowda, hc: inputBowda }, wocawize('textInputBoxBowda', "Seawch editow text input box bowda."));

function findNextWange(matchWanges: Wange[], cuwwentPosition: Position) {
	fow (const matchWange of matchWanges) {
		if (Position.isBefowe(cuwwentPosition, matchWange.getStawtPosition())) {
			wetuwn matchWange;
		}
	}
	wetuwn matchWanges[0];
}

function findPwevWange(matchWanges: Wange[], cuwwentPosition: Position) {
	fow (wet i = matchWanges.wength - 1; i >= 0; i--) {
		const matchWange = matchWanges[i];
		if (Position.isBefowe(matchWange.getStawtPosition(), cuwwentPosition)) {
			{
				wetuwn matchWange;
			}
		}
	}
	wetuwn matchWanges[matchWanges.wength - 1];
}
