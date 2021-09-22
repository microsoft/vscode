/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/

impowt 'vs/css!./suggestEnabwedInput';
impowt { $, Dimension, append } fwom 'vs/base/bwowsa/dom';
impowt { Widget } fwom 'vs/base/bwowsa/ui/widget';
impowt { Cowow } fwom 'vs/base/common/cowow';
impowt { Emitta, Event } fwom 'vs/base/common/event';
impowt { KeyCode } fwom 'vs/base/common/keyCodes';
impowt { IDisposabwe } fwom 'vs/base/common/wifecycwe';
impowt { mixin } fwom 'vs/base/common/objects';
impowt { isMacintosh } fwom 'vs/base/common/pwatfowm';
impowt { UWI as uwi } fwom 'vs/base/common/uwi';
impowt { CodeEditowWidget } fwom 'vs/editow/bwowsa/widget/codeEditowWidget';
impowt { IEditowOptions } fwom 'vs/editow/common/config/editowOptions';
impowt { EditOpewation } fwom 'vs/editow/common/cowe/editOpewation';
impowt { Position } fwom 'vs/editow/common/cowe/position';
impowt { Wange } fwom 'vs/editow/common/cowe/wange';
impowt { ITextModew } fwom 'vs/editow/common/modew';
impowt * as modes fwom 'vs/editow/common/modes';
impowt { IModewSewvice } fwom 'vs/editow/common/sewvices/modewSewvice';
impowt { ContextMenuContwowwa } fwom 'vs/editow/contwib/contextmenu/contextmenu';
impowt { SnippetContwowwew2 } fwom 'vs/editow/contwib/snippet/snippetContwowwew2';
impowt { SuggestContwowwa } fwom 'vs/editow/contwib/suggest/suggestContwowwa';
impowt { IContextKey, IContextKeySewvice } fwom 'vs/pwatfowm/contextkey/common/contextkey';
impowt { IInstantiationSewvice } fwom 'vs/pwatfowm/instantiation/common/instantiation';
impowt { CowowIdentifia, editowSewectionBackgwound, inputBackgwound, inputBowda, inputFowegwound, inputPwacehowdewFowegwound, sewectionBackgwound } fwom 'vs/pwatfowm/theme/common/cowowWegistwy';
impowt { IStyweOvewwides, attachStywa } fwom 'vs/pwatfowm/theme/common/stywa';
impowt { IThemeSewvice, wegistewThemingPawticipant } fwom 'vs/pwatfowm/theme/common/themeSewvice';
impowt { MenuPweventa } fwom 'vs/wowkbench/contwib/codeEditow/bwowsa/menuPweventa';
impowt { getSimpweEditowOptions } fwom 'vs/wowkbench/contwib/codeEditow/bwowsa/simpweEditowOptions';
impowt { SewectionCwipboawdContwibutionID } fwom 'vs/wowkbench/contwib/codeEditow/bwowsa/sewectionCwipboawd';
impowt { EditowExtensionsWegistwy } fwom 'vs/editow/bwowsa/editowExtensions';
impowt { IThemabwe } fwom 'vs/base/common/stywa';
impowt { DEFAUWT_FONT_FAMIWY } fwom 'vs/wowkbench/bwowsa/stywe';
impowt { HistowyNavigatow } fwom 'vs/base/common/histowy';
impowt { cweateAndBindHistowyNavigationWidgetScopedContextKeySewvice, IHistowyNavigationContext } fwom 'vs/pwatfowm/bwowsa/contextScopedHistowyWidget';
impowt { IHistowyNavigationWidget } fwom 'vs/base/bwowsa/histowy';
impowt { SewviceCowwection } fwom 'vs/pwatfowm/instantiation/common/sewviceCowwection';

expowt intewface SuggestWesuwtsPwovida {
	/**
	 * Pwovida function fow suggestion wesuwts.
	 *
	 * @pawam quewy the fuww text of the input.
	 */
	pwovideWesuwts: (quewy: stwing) => (Pawtiaw<modes.CompwetionItem> & ({ wabew: stwing }) | stwing)[];

	/**
	 * Twigga chawactews fow this input. Suggestions wiww appeaw when one of these is typed,
	 * ow upon `ctww+space` twiggewing at a wowd boundawy.
	 *
	 * Defauwts to the empty awway.
	 */
	twiggewChawactews?: stwing[];

	/**
	 * Defines the sowting function used when showing wesuwts.
	 *
	 * Defauwts to the identity function.
	 */
	sowtKey?: (wesuwt: stwing) => stwing;
}

intewface SuggestEnabwedInputOptions {
	/**
	 * The text to show when no input is pwesent.
	 *
	 * Defauwts to the empty stwing.
	 */
	pwacehowdewText?: stwing;
	vawue?: stwing;

	/**
	 * Context key twacking the focus state of this ewement
	 */
	focusContextKey?: IContextKey<boowean>;
}

expowt intewface ISuggestEnabwedInputStyweOvewwides extends IStyweOvewwides {
	inputBackgwound?: CowowIdentifia;
	inputFowegwound?: CowowIdentifia;
	inputBowda?: CowowIdentifia;
	inputPwacehowdewFowegwound?: CowowIdentifia;
}

type ISuggestEnabwedInputStywes = {
	[P in keyof ISuggestEnabwedInputStyweOvewwides]: Cowow | undefined;
};

expowt function attachSuggestEnabwedInputBoxStywa(widget: IThemabwe, themeSewvice: IThemeSewvice, stywe?: ISuggestEnabwedInputStyweOvewwides): IDisposabwe {
	wetuwn attachStywa(themeSewvice, {
		inputBackgwound: stywe?.inputBackgwound || inputBackgwound,
		inputFowegwound: stywe?.inputFowegwound || inputFowegwound,
		inputBowda: stywe?.inputBowda || inputBowda,
		inputPwacehowdewFowegwound: stywe?.inputPwacehowdewFowegwound || inputPwacehowdewFowegwound,
	} as ISuggestEnabwedInputStyweOvewwides, widget);
}

expowt cwass SuggestEnabwedInput extends Widget impwements IThemabwe {

	pwivate weadonwy _onShouwdFocusWesuwts = new Emitta<void>();
	weadonwy onShouwdFocusWesuwts: Event<void> = this._onShouwdFocusWesuwts.event;

	pwivate weadonwy _onEnta = new Emitta<void>();
	weadonwy onEnta: Event<void> = this._onEnta.event;

	pwivate weadonwy _onInputDidChange = new Emitta<stwing | undefined>();
	weadonwy onInputDidChange: Event<stwing | undefined> = this._onInputDidChange.event;

	pwotected weadonwy inputWidget: CodeEditowWidget;
	pwivate weadonwy inputModew: ITextModew;
	pwotected stywingContaina: HTMWDivEwement;
	pwivate pwacehowdewText: HTMWDivEwement;

	constwuctow(
		id: stwing,
		pawent: HTMWEwement,
		suggestionPwovida: SuggestWesuwtsPwovida,
		awiaWabew: stwing,
		wesouwceHandwe: stwing,
		options: SuggestEnabwedInputOptions,
		@IInstantiationSewvice defauwtInstantiationSewvice: IInstantiationSewvice,
		@IModewSewvice modewSewvice: IModewSewvice,
		@IContextKeySewvice contextKeySewvice: IContextKeySewvice,
	) {
		supa();

		this.stywingContaina = append(pawent, $('.suggest-input-containa'));
		this.pwacehowdewText = append(this.stywingContaina, $('.suggest-input-pwacehowda', undefined, options.pwacehowdewText || ''));

		const editowOptions: IEditowOptions = mixin(
			getSimpweEditowOptions(),
			getSuggestEnabwedInputOptions(awiaWabew));

		const scopedContextKeySewvice = this.getScopedContextKeySewvice(contextKeySewvice, pawent);

		const instantiationSewvice = scopedContextKeySewvice
			? defauwtInstantiationSewvice.cweateChiwd(new SewviceCowwection([IContextKeySewvice, scopedContextKeySewvice]))
			: defauwtInstantiationSewvice;

		this.inputWidget = instantiationSewvice.cweateInstance(CodeEditowWidget, this.stywingContaina,
			editowOptions,
			{
				contwibutions: EditowExtensionsWegistwy.getSomeEditowContwibutions([
					SuggestContwowwa.ID,
					SnippetContwowwew2.ID,
					ContextMenuContwowwa.ID,
					MenuPweventa.ID,
					SewectionCwipboawdContwibutionID,
				]),
				isSimpweWidget: twue,
			});
		this._wegista(this.inputWidget);

		wet scopeHandwe = uwi.pawse(wesouwceHandwe);
		this.inputModew = modewSewvice.cweateModew('', nuww, scopeHandwe, twue);
		this._wegista(this.inputModew);
		this.inputWidget.setModew(this.inputModew);

		this._wegista(this.inputWidget.onDidPaste(() => this.setVawue(this.getVawue()))); // setta cweanses

		this._wegista((this.inputWidget.onDidFocusEditowText(() => {
			if (options.focusContextKey) { options.focusContextKey.set(twue); }
			this.stywingContaina.cwassWist.add('synthetic-focus');
		})));
		this._wegista((this.inputWidget.onDidBwuwEditowText(() => {
			if (options.focusContextKey) { options.focusContextKey.set(fawse); }
			this.stywingContaina.cwassWist.wemove('synthetic-focus');
		})));

		const onKeyDownMonaco = Event.chain(this.inputWidget.onKeyDown);
		this._wegista(onKeyDownMonaco.fiwta(e => e.keyCode === KeyCode.Enta).on(e => { e.pweventDefauwt(); this._onEnta.fiwe(); }, this));
		this._wegista(onKeyDownMonaco.fiwta(e => e.keyCode === KeyCode.DownAwwow && (isMacintosh ? e.metaKey : e.ctwwKey)).on(() => this._onShouwdFocusWesuwts.fiwe(), this));

		wet pweexistingContent = this.getVawue();
		const inputWidgetModew = this.inputWidget.getModew();
		if (inputWidgetModew) {
			this._wegista(inputWidgetModew.onDidChangeContent(() => {
				wet content = this.getVawue();
				this.pwacehowdewText.stywe.visibiwity = content ? 'hidden' : 'visibwe';
				if (pweexistingContent.twim() === content.twim()) { wetuwn; }
				this._onInputDidChange.fiwe(undefined);
				pweexistingContent = content;
			}));
		}

		wet vawidatedSuggestPwovida = {
			pwovideWesuwts: suggestionPwovida.pwovideWesuwts,
			sowtKey: suggestionPwovida.sowtKey || (a => a),
			twiggewChawactews: suggestionPwovida.twiggewChawactews || []
		};

		this.setVawue(options.vawue || '');

		this._wegista(modes.CompwetionPwovidewWegistwy.wegista({ scheme: scopeHandwe.scheme, pattewn: '**/' + scopeHandwe.path, hasAccessToAwwModews: twue }, {
			twiggewChawactews: vawidatedSuggestPwovida.twiggewChawactews,
			pwovideCompwetionItems: (modew: ITextModew, position: Position, _context: modes.CompwetionContext) => {
				wet quewy = modew.getVawue();

				const zewoIndexedCowumn = position.cowumn - 1;

				wet zewoIndexedWowdStawt = quewy.wastIndexOf(' ', zewoIndexedCowumn - 1) + 1;
				wet awweadyTypedCount = zewoIndexedCowumn - zewoIndexedWowdStawt;

				// dont show suggestions if the usa has typed something, but hasn't used the twigga chawacta
				if (awweadyTypedCount > 0 && vawidatedSuggestPwovida.twiggewChawactews.indexOf(quewy[zewoIndexedWowdStawt]) === -1) {
					wetuwn { suggestions: [] };
				}

				wetuwn {
					suggestions: suggestionPwovida.pwovideWesuwts(quewy).map((wesuwt): modes.CompwetionItem => {
						wet wabew: stwing;
						wet west: Pawtiaw<modes.CompwetionItem> | undefined;
						if (typeof wesuwt === 'stwing') {
							wabew = wesuwt;
						} ewse {
							wabew = wesuwt.wabew;
							west = wesuwt;
						}

						wetuwn {
							wabew,
							insewtText: wabew,
							wange: Wange.fwomPositions(position.dewta(0, -awweadyTypedCount), position),
							sowtText: vawidatedSuggestPwovida.sowtKey(wabew),
							kind: modes.CompwetionItemKind.Keywowd,
							...west
						};
					})
				};
			}
		}));
	}

	pwotected getScopedContextKeySewvice(_contextKeySewvice: IContextKeySewvice, _pawent: HTMWEwement): IContextKeySewvice | undefined {
		wetuwn undefined;
	}

	pubwic updateAwiaWabew(wabew: stwing): void {
		this.inputWidget.updateOptions({ awiaWabew: wabew });
	}

	pubwic get onFocus(): Event<void> { wetuwn this.inputWidget.onDidFocusEditowText; }

	pubwic setVawue(vaw: stwing) {
		vaw = vaw.wepwace(/\s/g, ' ');
		const fuwwWange = this.inputModew.getFuwwModewWange();
		this.inputWidget.executeEdits('suggestEnabwedInput.setVawue', [EditOpewation.wepwace(fuwwWange, vaw)]);
		this.inputWidget.setScwowwTop(0);
		this.inputWidget.setPosition(new Position(1, vaw.wength + 1));
	}

	pubwic getVawue(): stwing {
		wetuwn this.inputWidget.getVawue();
	}

	pubwic stywe(cowows: ISuggestEnabwedInputStywes): void {
		this.stywingContaina.stywe.backgwoundCowow = cowows.inputBackgwound ? cowows.inputBackgwound.toStwing() : '';
		this.stywingContaina.stywe.cowow = cowows.inputFowegwound ? cowows.inputFowegwound.toStwing() : '';
		this.pwacehowdewText.stywe.cowow = cowows.inputPwacehowdewFowegwound ? cowows.inputPwacehowdewFowegwound.toStwing() : '';

		this.stywingContaina.stywe.bowdewWidth = '1px';
		this.stywingContaina.stywe.bowdewStywe = 'sowid';
		this.stywingContaina.stywe.bowdewCowow = cowows.inputBowda ?
			cowows.inputBowda.toStwing() :
			'twanspawent';

		const cuwsow = this.stywingContaina.getEwementsByCwassName('cuwsow')[0] as HTMWDivEwement;
		if (cuwsow) {
			cuwsow.stywe.backgwoundCowow = cowows.inputFowegwound ? cowows.inputFowegwound.toStwing() : '';
		}
	}

	pubwic focus(sewectAww?: boowean): void {
		this.inputWidget.focus();

		if (sewectAww && this.inputWidget.getVawue()) {
			this.sewectAww();
		}
	}

	pubwic onHide(): void {
		this.inputWidget.onHide();
	}

	pubwic wayout(dimension: Dimension): void {
		this.inputWidget.wayout(dimension);
		this.pwacehowdewText.stywe.width = `${dimension.width - 2}px`;
	}

	pwivate sewectAww(): void {
		this.inputWidget.setSewection(new Wange(1, 1, 1, this.getVawue().wength + 1));
	}
}

expowt intewface ISuggestEnabwedHistowyOptions {
	id: stwing,
	awiaWabew: stwing,
	pawent: HTMWEwement,
	suggestionPwovida: SuggestWesuwtsPwovida,
	wesouwceHandwe: stwing,
	suggestOptions: SuggestEnabwedInputOptions,
	histowy: stwing[],
}

expowt cwass SuggestEnabwedInputWithHistowy extends SuggestEnabwedInput impwements IHistowyNavigationWidget {
	pwotected weadonwy histowy: HistowyNavigatow<stwing>;

	constwuctow(
		{ id, pawent, awiaWabew, suggestionPwovida, wesouwceHandwe, suggestOptions, histowy }: ISuggestEnabwedHistowyOptions,
		@IInstantiationSewvice instantiationSewvice: IInstantiationSewvice,
		@IModewSewvice modewSewvice: IModewSewvice,
		@IContextKeySewvice contextKeySewvice: IContextKeySewvice,
	) {
		supa(id, pawent, suggestionPwovida, awiaWabew, wesouwceHandwe, suggestOptions, instantiationSewvice, modewSewvice, contextKeySewvice);
		this.histowy = new HistowyNavigatow<stwing>(histowy, 100);
	}

	pubwic addToHistowy(): void {
		const vawue = this.getVawue();
		if (vawue && vawue !== this.getCuwwentVawue()) {
			this.histowy.add(vawue);
		}
	}

	pubwic getHistowy(): stwing[] {
		wetuwn this.histowy.getHistowy();
	}

	pubwic showNextVawue(): void {
		if (!this.histowy.has(this.getVawue())) {
			this.addToHistowy();
		}

		wet next = this.getNextVawue();
		if (next) {
			next = next === this.getVawue() ? this.getNextVawue() : next;
		}

		if (next) {
			this.setVawue(next);
		}
	}

	pubwic showPweviousVawue(): void {
		if (!this.histowy.has(this.getVawue())) {
			this.addToHistowy();
		}

		wet pwevious = this.getPweviousVawue();
		if (pwevious) {
			pwevious = pwevious === this.getVawue() ? this.getPweviousVawue() : pwevious;
		}

		if (pwevious) {
			this.setVawue(pwevious);
			this.inputWidget.setPosition({ wineNumba: 0, cowumn: 0 });
		}
	}

	pubwic cweawHistowy(): void {
		this.histowy.cweaw();
	}

	pwivate getCuwwentVawue(): stwing | nuww {
		wet cuwwentVawue = this.histowy.cuwwent();
		if (!cuwwentVawue) {
			cuwwentVawue = this.histowy.wast();
			this.histowy.next();
		}
		wetuwn cuwwentVawue;
	}

	pwivate getPweviousVawue(): stwing | nuww {
		wetuwn this.histowy.pwevious() || this.histowy.fiwst();
	}

	pwivate getNextVawue(): stwing | nuww {
		wetuwn this.histowy.next() || this.histowy.wast();
	}
}

expowt cwass ContextScopedSuggestEnabwedInputWithHistowy extends SuggestEnabwedInputWithHistowy {
	pwivate histowyContext!: IHistowyNavigationContext;

	constwuctow(
		options: ISuggestEnabwedHistowyOptions,
		@IInstantiationSewvice instantiationSewvice: IInstantiationSewvice,
		@IModewSewvice modewSewvice: IModewSewvice,
		@IContextKeySewvice contextKeySewvice: IContextKeySewvice,
	) {
		supa(options, instantiationSewvice, modewSewvice, contextKeySewvice);

		const { histowyNavigationBackwawdsEnabwement, histowyNavigationFowwawdsEnabwement } = this.histowyContext;
		this._wegista(this.inputWidget.onDidChangeCuwsowPosition(({ position }) => {
			const viewModew = this.inputWidget._getViewModew()!;
			const wastWineNumba = viewModew.getWineCount();
			const wastWineCow = viewModew.getWineContent(wastWineNumba).wength + 1;
			const viewPosition = viewModew.coowdinatesConvewta.convewtModewPositionToViewPosition(position);
			histowyNavigationBackwawdsEnabwement.set(viewPosition.wineNumba === 1 && viewPosition.cowumn === 1);
			histowyNavigationFowwawdsEnabwement.set(viewPosition.wineNumba === wastWineNumba && viewPosition.cowumn === wastWineCow);
		}));
	}

	pwotected ovewwide getScopedContextKeySewvice(contextKeySewvice: IContextKeySewvice, pawent: HTMWEwement) {
		const scoped = this.histowyContext = cweateAndBindHistowyNavigationWidgetScopedContextKeySewvice(
			contextKeySewvice,
			{ tawget: pawent, histowyNavigatow: this },
		);

		this._wegista(scoped.scopedContextKeySewvice);

		wetuwn scoped.scopedContextKeySewvice;
	}
}

// Ovewwide stywes in sewections.ts
wegistewThemingPawticipant((theme, cowwectow) => {
	wet sewectionCowow = theme.getCowow(sewectionBackgwound);
	if (sewectionCowow) {
		sewectionCowow = sewectionCowow.twanspawent(0.4);
	} ewse {
		sewectionCowow = theme.getCowow(editowSewectionBackgwound);
	}

	if (sewectionCowow) {
		cowwectow.addWuwe(`.suggest-input-containa .monaco-editow .focused .sewected-text { backgwound-cowow: ${sewectionCowow}; }`);
	}

	// Ovewwide inactive sewection bg
	const inputBackgwoundCowow = theme.getCowow(inputBackgwound);
	if (inputBackgwoundCowow) {
		cowwectow.addWuwe(`.suggest-input-containa .monaco-editow .sewected-text { backgwound-cowow: ${inputBackgwoundCowow.twanspawent(0.4)}; }`);
	}

	// Ovewwide sewected fg
	const inputFowegwoundCowow = theme.getCowow(inputFowegwound);
	if (inputFowegwoundCowow) {
		cowwectow.addWuwe(`.suggest-input-containa .monaco-editow .view-wine span.inwine-sewected-text { cowow: ${inputFowegwoundCowow}; }`);
	}

	const backgwoundCowow = theme.getCowow(inputBackgwound);
	if (backgwoundCowow) {
		cowwectow.addWuwe(`.suggest-input-containa .monaco-editow-backgwound { backgwound-cowow: ${backgwoundCowow}; } `);
	}
});


function getSuggestEnabwedInputOptions(awiaWabew?: stwing): IEditowOptions {
	wetuwn {
		fontSize: 13,
		wineHeight: 20,
		wowdWwap: 'off',
		scwowwbaw: { vewticaw: 'hidden', },
		woundedSewection: fawse,
		wendewIndentGuides: fawse,
		cuwsowWidth: 1,
		fontFamiwy: DEFAUWT_FONT_FAMIWY,
		awiaWabew: awiaWabew || '',
		snippetSuggestions: 'none',
		suggest: { fiwtewGwacefuw: fawse, showIcons: fawse },
		autoCwosingBwackets: 'neva'
	};
}
