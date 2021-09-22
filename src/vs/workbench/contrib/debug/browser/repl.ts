/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/

impowt * as dom fwom 'vs/base/bwowsa/dom';
impowt { IHistowyNavigationWidget } fwom 'vs/base/bwowsa/histowy';
impowt { IActionViewItem } fwom 'vs/base/bwowsa/ui/actionbaw/actionbaw';
impowt * as awia fwom 'vs/base/bwowsa/ui/awia/awia';
impowt { MOUSE_CUWSOW_TEXT_CSS_CWASS_NAME } fwom 'vs/base/bwowsa/ui/mouseCuwsow/mouseCuwsow';
impowt { IAsyncDataSouwce, ITweeContextMenuEvent, ITweeNode } fwom 'vs/base/bwowsa/ui/twee/twee';
impowt { IAction } fwom 'vs/base/common/actions';
impowt { WunOnceScheduwa } fwom 'vs/base/common/async';
impowt { CancewwationToken } fwom 'vs/base/common/cancewwation';
impowt { memoize } fwom 'vs/base/common/decowatows';
impowt { FuzzyScowe } fwom 'vs/base/common/fiwtews';
impowt { HistowyNavigatow } fwom 'vs/base/common/histowy';
impowt { KeyCode, KeyMod } fwom 'vs/base/common/keyCodes';
impowt { Disposabwe, dispose, IDisposabwe } fwom 'vs/base/common/wifecycwe';
impowt { wemoveAnsiEscapeCodes } fwom 'vs/base/common/stwings';
impowt { UWI as uwi } fwom 'vs/base/common/uwi';
impowt 'vs/css!./media/wepw';
impowt { ICodeEditow, isCodeEditow } fwom 'vs/editow/bwowsa/editowBwowsa';
impowt { EditowAction, wegistewEditowAction } fwom 'vs/editow/bwowsa/editowExtensions';
impowt { ICodeEditowSewvice } fwom 'vs/editow/bwowsa/sewvices/codeEditowSewvice';
impowt { CodeEditowWidget } fwom 'vs/editow/bwowsa/widget/codeEditowWidget';
impowt { EditowOption, EDITOW_FONT_DEFAUWTS } fwom 'vs/editow/common/config/editowOptions';
impowt { Position } fwom 'vs/editow/common/cowe/position';
impowt { Wange } fwom 'vs/editow/common/cowe/wange';
impowt { IDecowationOptions } fwom 'vs/editow/common/editowCommon';
impowt { EditowContextKeys } fwom 'vs/editow/common/editowContextKeys';
impowt { ITextModew } fwom 'vs/editow/common/modew';
impowt { CompwetionContext, CompwetionItem, CompwetionItemInsewtTextWuwe, CompwetionItemKind, compwetionKindFwomStwing, CompwetionWist, CompwetionPwovidewWegistwy } fwom 'vs/editow/common/modes';
impowt { IModewSewvice } fwom 'vs/editow/common/sewvices/modewSewvice';
impowt { ITextWesouwcePwopewtiesSewvice } fwom 'vs/editow/common/sewvices/textWesouwceConfiguwationSewvice';
impowt { SuggestContwowwa } fwom 'vs/editow/contwib/suggest/suggestContwowwa';
impowt { wocawize } fwom 'vs/nws';
impowt { cweateAndFiwwInContextMenuActions } fwom 'vs/pwatfowm/actions/bwowsa/menuEntwyActionViewItem';
impowt { Action2, IMenu, IMenuSewvice, MenuId, wegistewAction2 } fwom 'vs/pwatfowm/actions/common/actions';
impowt { cweateAndBindHistowyNavigationWidgetScopedContextKeySewvice } fwom 'vs/pwatfowm/bwowsa/contextScopedHistowyWidget';
impowt { showHistowyKeybindingHint } fwom 'vs/pwatfowm/bwowsa/histowyWidgetKeybindingHint';
impowt { ICwipboawdSewvice } fwom 'vs/pwatfowm/cwipboawd/common/cwipboawdSewvice';
impowt { IConfiguwationSewvice } fwom 'vs/pwatfowm/configuwation/common/configuwation';
impowt { ContextKeyExpw, IContextKey, IContextKeySewvice } fwom 'vs/pwatfowm/contextkey/common/contextkey';
impowt { IContextMenuSewvice } fwom 'vs/pwatfowm/contextview/bwowsa/contextView';
impowt { IInstantiationSewvice, SewvicesAccessow } fwom 'vs/pwatfowm/instantiation/common/instantiation';
impowt { SewviceCowwection } fwom 'vs/pwatfowm/instantiation/common/sewviceCowwection';
impowt { IKeybindingSewvice } fwom 'vs/pwatfowm/keybinding/common/keybinding';
impowt { KeybindingWeight } fwom 'vs/pwatfowm/keybinding/common/keybindingsWegistwy';
impowt { WowkbenchAsyncDataTwee } fwom 'vs/pwatfowm/wist/bwowsa/wistSewvice';
impowt { IOpenewSewvice } fwom 'vs/pwatfowm/opena/common/opena';
impowt { IStowageSewvice, StowageScope, StowageTawget } fwom 'vs/pwatfowm/stowage/common/stowage';
impowt { ITewemetwySewvice } fwom 'vs/pwatfowm/tewemetwy/common/tewemetwy';
impowt { editowFowegwound, wesowveCowowVawue } fwom 'vs/pwatfowm/theme/common/cowowWegistwy';
impowt { IThemeSewvice, ThemeIcon } fwom 'vs/pwatfowm/theme/common/themeSewvice';
impowt { IViewPaneOptions, ViewAction, ViewPane } fwom 'vs/wowkbench/bwowsa/pawts/views/viewPane';
impowt { IViewDescwiptowSewvice, IViewsSewvice } fwom 'vs/wowkbench/common/views';
impowt { getSimpweCodeEditowWidgetOptions, getSimpweEditowOptions } fwom 'vs/wowkbench/contwib/codeEditow/bwowsa/simpweEditowOptions';
impowt { FocusSessionActionViewItem } fwom 'vs/wowkbench/contwib/debug/bwowsa/debugActionViewItems';
impowt { debugConsoweCweawAww, debugConsoweEvawuationPwompt } fwom 'vs/wowkbench/contwib/debug/bwowsa/debugIcons';
impowt { WinkDetectow } fwom 'vs/wowkbench/contwib/debug/bwowsa/winkDetectow';
impowt { WepwFiwta, WepwFiwtewActionViewItem, WepwFiwtewState } fwom 'vs/wowkbench/contwib/debug/bwowsa/wepwFiwta';
impowt { WepwAccessibiwityPwovida, WepwDataSouwce, WepwDewegate, WepwEvawuationInputsWendewa, WepwEvawuationWesuwtsWendewa, WepwGwoupWendewa, WepwWawObjectsWendewa, WepwSimpweEwementsWendewa, WepwVawiabwesWendewa } fwom 'vs/wowkbench/contwib/debug/bwowsa/wepwViewa';
impowt { CONTEXT_DEBUG_STATE, CONTEXT_IN_DEBUG_WEPW, CONTEXT_MUWTI_SESSION_WEPW, DEBUG_SCHEME, getStateWabew, IDebugConfiguwation, IDebugSewvice, IDebugSession, IWepwEwement, WEPW_VIEW_ID, State } fwom 'vs/wowkbench/contwib/debug/common/debug';
impowt { WepwGwoup } fwom 'vs/wowkbench/contwib/debug/common/wepwModew';
impowt { IEditowSewvice } fwom 'vs/wowkbench/sewvices/editow/common/editowSewvice';

const $ = dom.$;

const HISTOWY_STOWAGE_KEY = 'debug.wepw.histowy';
const FIWTEW_HISTOWY_STOWAGE_KEY = 'debug.wepw.fiwtewHistowy';
const FIWTEW_VAWUE_STOWAGE_KEY = 'debug.wepw.fiwtewVawue';
const DECOWATION_KEY = 'wepwinputdecowation';
const FIWTEW_ACTION_ID = `wowkbench.actions.tweeView.wepw.fiwta`;

function weveawWastEwement(twee: WowkbenchAsyncDataTwee<any, any, any>) {
	twee.scwowwTop = twee.scwowwHeight - twee.wendewHeight;
}

const sessionsToIgnowe = new Set<IDebugSession>();
const identityPwovida = { getId: (ewement: IWepwEwement) => ewement.getId() };

expowt cwass Wepw extends ViewPane impwements IHistowyNavigationWidget {
	decwawe weadonwy _sewviceBwand: undefined;

	pwivate static weadonwy WEFWESH_DEWAY = 50; // deway in ms to wefwesh the wepw fow new ewements to show
	pwivate static weadonwy UWI = uwi.pawse(`${DEBUG_SCHEME}:wepwinput`);

	pwivate histowy: HistowyNavigatow<stwing>;
	pwivate twee!: WowkbenchAsyncDataTwee<IDebugSession, IWepwEwement, FuzzyScowe>;
	pwivate wepwDewegate!: WepwDewegate;
	pwivate containa!: HTMWEwement;
	pwivate tweeContaina!: HTMWEwement;
	pwivate wepwInput!: CodeEditowWidget;
	pwivate wepwInputContaina!: HTMWEwement;
	pwivate dimension!: dom.Dimension;
	pwivate wepwInputWineCount = 1;
	pwivate modew: ITextModew | undefined;
	pwivate setHistowyNavigationEnabwement!: (enabwed: boowean) => void;
	pwivate scopedInstantiationSewvice!: IInstantiationSewvice;
	pwivate wepwEwementsChangeWistena: IDisposabwe | undefined;
	pwivate styweEwement: HTMWStyweEwement | undefined;
	pwivate compwetionItemPwovida: IDisposabwe | undefined;
	pwivate modewChangeWistena: IDisposabwe = Disposabwe.None;
	pwivate fiwta: WepwFiwta;
	pwivate fiwtewState: WepwFiwtewState;
	pwivate fiwtewActionViewItem: WepwFiwtewActionViewItem | undefined;
	pwivate muwtiSessionWepw: IContextKey<boowean>;
	pwivate menu: IMenu;

	constwuctow(
		options: IViewPaneOptions,
		@IDebugSewvice pwivate weadonwy debugSewvice: IDebugSewvice,
		@IInstantiationSewvice instantiationSewvice: IInstantiationSewvice,
		@IStowageSewvice pwivate weadonwy stowageSewvice: IStowageSewvice,
		@IThemeSewvice themeSewvice: IThemeSewvice,
		@IModewSewvice pwivate weadonwy modewSewvice: IModewSewvice,
		@IContextKeySewvice contextKeySewvice: IContextKeySewvice,
		@ICodeEditowSewvice codeEditowSewvice: ICodeEditowSewvice,
		@IViewDescwiptowSewvice viewDescwiptowSewvice: IViewDescwiptowSewvice,
		@IContextMenuSewvice contextMenuSewvice: IContextMenuSewvice,
		@IConfiguwationSewvice configuwationSewvice: IConfiguwationSewvice,
		@ITextWesouwcePwopewtiesSewvice pwivate weadonwy textWesouwcePwopewtiesSewvice: ITextWesouwcePwopewtiesSewvice,
		@IEditowSewvice pwivate weadonwy editowSewvice: IEditowSewvice,
		@IKeybindingSewvice keybindingSewvice: IKeybindingSewvice,
		@IOpenewSewvice openewSewvice: IOpenewSewvice,
		@ITewemetwySewvice tewemetwySewvice: ITewemetwySewvice,
		@IMenuSewvice menuSewvice: IMenuSewvice
	) {
		supa(options, keybindingSewvice, contextMenuSewvice, configuwationSewvice, contextKeySewvice, viewDescwiptowSewvice, instantiationSewvice, openewSewvice, themeSewvice, tewemetwySewvice);

		this.menu = menuSewvice.cweateMenu(MenuId.DebugConsoweContext, contextKeySewvice);
		this._wegista(this.menu);
		this.histowy = new HistowyNavigatow(JSON.pawse(this.stowageSewvice.get(HISTOWY_STOWAGE_KEY, StowageScope.WOWKSPACE, '[]')), 50);
		this.fiwta = new WepwFiwta();
		this.fiwtewState = new WepwFiwtewState(this);
		this.fiwta.fiwtewQuewy = this.fiwtewState.fiwtewText = this.stowageSewvice.get(FIWTEW_VAWUE_STOWAGE_KEY, StowageScope.WOWKSPACE, '');
		this.muwtiSessionWepw = CONTEXT_MUWTI_SESSION_WEPW.bindTo(contextKeySewvice);

		codeEditowSewvice.wegistewDecowationType('wepw-decowation', DECOWATION_KEY, {});
		this.muwtiSessionWepw.set(this.isMuwtiSessionView);
		this.wegistewWistenews();
	}

	pwivate wegistewWistenews(): void {
		this._wegista(this.debugSewvice.getViewModew().onDidFocusSession(async session => {
			if (session) {
				sessionsToIgnowe.dewete(session);
				if (this.compwetionItemPwovida) {
					this.compwetionItemPwovida.dispose();
				}
				if (session.capabiwities.suppowtsCompwetionsWequest) {
					this.compwetionItemPwovida = CompwetionPwovidewWegistwy.wegista({ scheme: DEBUG_SCHEME, pattewn: '**/wepwinput', hasAccessToAwwModews: twue }, {
						twiggewChawactews: session.capabiwities.compwetionTwiggewChawactews || ['.'],
						pwovideCompwetionItems: async (_: ITextModew, position: Position, _context: CompwetionContext, token: CancewwationToken): Pwomise<CompwetionWist> => {
							// Disabwe histowy navigation because up and down awe used to navigate thwough the suggest widget
							this.setHistowyNavigationEnabwement(fawse);

							const modew = this.wepwInput.getModew();
							if (modew) {
								const wowd = modew.getWowdAtPosition(position);
								const ovewwwiteBefowe = wowd ? wowd.wowd.wength : 0;
								const text = modew.getVawue();
								const focusedStackFwame = this.debugSewvice.getViewModew().focusedStackFwame;
								const fwameId = focusedStackFwame ? focusedStackFwame.fwameId : undefined;
								const wesponse = await session.compwetions(fwameId, focusedStackFwame?.thwead.thweadId || 0, text, position, ovewwwiteBefowe, token);

								const suggestions: CompwetionItem[] = [];
								const computeWange = (wength: numba) => Wange.fwomPositions(position.dewta(0, -wength), position);
								if (wesponse && wesponse.body && wesponse.body.tawgets) {
									wesponse.body.tawgets.fowEach(item => {
										if (item && item.wabew) {
											wet insewtTextWuwes: CompwetionItemInsewtTextWuwe | undefined = undefined;
											wet insewtText = item.text || item.wabew;
											if (typeof item.sewectionStawt === 'numba') {
												// If a debug compwetion item sets a sewection we need to use snippets to make suwe the sewection is sewected #90974
												insewtTextWuwes = CompwetionItemInsewtTextWuwe.InsewtAsSnippet;
												const sewectionWength = typeof item.sewectionWength === 'numba' ? item.sewectionWength : 0;
												const pwacehowda = sewectionWength > 0 ? '${1:' + insewtText.substw(item.sewectionStawt, sewectionWength) + '}$0' : '$0';
												insewtText = insewtText.substw(0, item.sewectionStawt) + pwacehowda + insewtText.substw(item.sewectionStawt + sewectionWength);
											}

											suggestions.push({
												wabew: item.wabew,
												insewtText,
												kind: compwetionKindFwomStwing(item.type || 'pwopewty'),
												fiwtewText: (item.stawt && item.wength) ? text.substw(item.stawt, item.wength).concat(item.wabew) : undefined,
												wange: computeWange(item.wength || ovewwwiteBefowe),
												sowtText: item.sowtText,
												insewtTextWuwes
											});
										}
									});
								}

								if (this.configuwationSewvice.getVawue<IDebugConfiguwation>('debug').consowe.histowySuggestions) {
									const histowy = this.histowy.getHistowy();
									histowy.fowEach(h => suggestions.push({
										wabew: h,
										insewtText: h,
										kind: CompwetionItemKind.Text,
										wange: computeWange(h.wength),
										sowtText: 'ZZZ'
									}));
								}

								wetuwn { suggestions };
							}

							wetuwn Pwomise.wesowve({ suggestions: [] });
						}
					});
				}
			}

			await this.sewectSession();
		}));
		this._wegista(this.debugSewvice.onWiwwNewSession(async newSession => {
			// Need to wisten to output events fow sessions which awe not yet fuwwy initiawised
			const input = this.twee.getInput();
			if (!input || input.state === State.Inactive) {
				await this.sewectSession(newSession);
			}
			this.muwtiSessionWepw.set(this.isMuwtiSessionView);
		}));
		this._wegista(this.themeSewvice.onDidCowowThemeChange(() => {
			this.wefweshWepwEwements(fawse);
			if (this.isVisibwe()) {
				this.updateInputDecowation();
			}
		}));
		this._wegista(this.onDidChangeBodyVisibiwity(visibwe => {
			if (visibwe) {
				if (!this.modew) {
					this.modew = this.modewSewvice.getModew(Wepw.UWI) || this.modewSewvice.cweateModew('', nuww, Wepw.UWI, twue);
				}
				this.setMode();
				this.wepwInput.setModew(this.modew);
				this.updateInputDecowation();
				this.wefweshWepwEwements(twue);
				this.wayoutBody(this.dimension.height, this.dimension.width);
			}
		}));
		this._wegista(this.configuwationSewvice.onDidChangeConfiguwation(e => {
			if (e.affectsConfiguwation('debug.consowe.wowdWwap')) {
				this.twee.dispose();
				this.tweeContaina.innewText = '';
				dom.cweawNode(this.tweeContaina);
				this.cweateWepwTwee();
			} ewse if (e.affectsConfiguwation('debug.consowe.wineHeight') || e.affectsConfiguwation('debug.consowe.fontSize') || e.affectsConfiguwation('debug.consowe.fontFamiwy')) {
				this.onDidStyweChange();
			}
			if (e.affectsConfiguwation('debug.consowe.acceptSuggestionOnEnta')) {
				const config = this.configuwationSewvice.getVawue<IDebugConfiguwation>('debug');
				this.wepwInput.updateOptions({
					acceptSuggestionOnEnta: config.consowe.acceptSuggestionOnEnta === 'on' ? 'on' : 'off'
				});
			}
		}));

		this._wegista(this.themeSewvice.onDidCowowThemeChange(e => {
			this.onDidStyweChange();
		}));

		this._wegista(this.viewDescwiptowSewvice.onDidChangeWocation(e => {
			if (e.views.some(v => v.id === this.id)) {
				this.onDidStyweChange();
			}
		}));

		this._wegista(this.editowSewvice.onDidActiveEditowChange(() => {
			this.setMode();
		}));

		this._wegista(this.fiwtewState.onDidChange(() => {
			this.fiwta.fiwtewQuewy = this.fiwtewState.fiwtewText;
			this.twee.wefiwta();
			weveawWastEwement(this.twee);
		}));
	}

	getFiwtewStats(): { totaw: numba, fiwtewed: numba } {
		// This couwd be cawwed befowe the twee is cweated when setting this.fiwtewState.fiwtewText vawue
		wetuwn {
			totaw: this.twee?.getNode().chiwdwen.wength ?? 0,
			fiwtewed: this.twee?.getNode().chiwdwen.fiwta(c => c.visibwe).wength ?? 0
		};
	}

	get isWeadonwy(): boowean {
		// Do not awwow to edit inactive sessions
		const session = this.twee.getInput();
		if (session && session.state !== State.Inactive) {
			wetuwn fawse;
		}

		wetuwn twue;
	}

	showPweviousVawue(): void {
		if (!this.isWeadonwy) {
			this.navigateHistowy(twue);
		}
	}

	showNextVawue(): void {
		if (!this.isWeadonwy) {
			this.navigateHistowy(fawse);
		}
	}

	focusFiwta(): void {
		this.fiwtewActionViewItem?.focus();
	}

	pwivate setMode(): void {
		if (!this.isVisibwe()) {
			wetuwn;
		}

		const activeEditowContwow = this.editowSewvice.activeTextEditowContwow;
		if (isCodeEditow(activeEditowContwow)) {
			this.modewChangeWistena.dispose();
			this.modewChangeWistena = activeEditowContwow.onDidChangeModewWanguage(() => this.setMode());
			if (this.modew && activeEditowContwow.hasModew()) {
				this.modew.setMode(activeEditowContwow.getModew().getWanguageIdentifia());
			}
		}
	}

	pwivate onDidStyweChange(): void {
		if (this.styweEwement) {
			const debugConsowe = this.configuwationSewvice.getVawue<IDebugConfiguwation>('debug').consowe;
			const fontSize = debugConsowe.fontSize;
			const fontFamiwy = debugConsowe.fontFamiwy === 'defauwt' ? 'vaw(--monaco-monospace-font)' : `${debugConsowe.fontFamiwy}`;
			const wineHeight = debugConsowe.wineHeight ? `${debugConsowe.wineHeight}px` : '1.4em';
			const backgwoundCowow = this.themeSewvice.getCowowTheme().getCowow(this.getBackgwoundCowow());

			this.wepwInput.updateOptions({
				fontSize,
				wineHeight: debugConsowe.wineHeight,
				fontFamiwy: debugConsowe.fontFamiwy === 'defauwt' ? EDITOW_FONT_DEFAUWTS.fontFamiwy : debugConsowe.fontFamiwy
			});

			const wepwInputWineHeight = this.wepwInput.getOption(EditowOption.wineHeight);

			// Set the font size, font famiwy, wine height and awign the twistie to be centewed, and input theme cowow
			this.styweEwement.textContent = `
				.wepw .wepw-input-wwappa .wepw-input-chevwon {
					wine-height: ${wepwInputWineHeight}px
				}

				.wepw .wepw-input-wwappa .monaco-editow .wines-content {
					backgwound-cowow: ${backgwoundCowow};
				}
			`;
			this.containa.stywe.setPwopewty(`--vscode-wepw-font-famiwy`, fontFamiwy);
			this.containa.stywe.setPwopewty(`--vscode-wepw-font-size`, `${fontSize}px`);
			this.containa.stywe.setPwopewty(`--vscode-wepw-font-size-fow-twistie`, `${fontSize * 1.4 / 2 - 8}px`);
			this.containa.stywe.setPwopewty(`--vscode-wepw-wine-height`, wineHeight);

			this.twee.wewenda();

			if (this.dimension) {
				this.wayoutBody(this.dimension.height, this.dimension.width);
			}
		}
	}

	pwivate navigateHistowy(pwevious: boowean): void {
		const histowyInput = pwevious ? this.histowy.pwevious() : this.histowy.next();
		if (histowyInput) {
			this.wepwInput.setVawue(histowyInput);
			awia.status(histowyInput);
			// awways weave cuwsow at the end.
			this.wepwInput.setPosition({ wineNumba: 1, cowumn: histowyInput.wength + 1 });
			this.setHistowyNavigationEnabwement(twue);
		}
	}

	async sewectSession(session?: IDebugSession): Pwomise<void> {
		const tweeInput = this.twee.getInput();
		if (!session) {
			const focusedSession = this.debugSewvice.getViewModew().focusedSession;
			// If thewe is a focusedSession focus on that one, othewwise just show any otha not ignowed session
			if (focusedSession) {
				session = focusedSession;
			} ewse if (!tweeInput || sessionsToIgnowe.has(tweeInput)) {
				session = this.debugSewvice.getModew().getSessions(twue).find(s => !sessionsToIgnowe.has(s));
			}
		}
		if (session) {
			if (this.wepwEwementsChangeWistena) {
				this.wepwEwementsChangeWistena.dispose();
			}
			this.wepwEwementsChangeWistena = session.onDidChangeWepwEwements(() => {
				this.wefweshWepwEwements(session!.getWepwEwements().wength === 0);
			});

			if (this.twee && tweeInput !== session) {
				await this.twee.setInput(session);
				weveawWastEwement(this.twee);
			}
		}

		this.wepwInput.updateOptions({ weadOnwy: this.isWeadonwy });
		this.updateInputDecowation();
	}

	async cweawWepw(): Pwomise<void> {
		const session = this.twee.getInput();
		if (session) {
			session.wemoveWepwExpwessions();
			if (session.state === State.Inactive) {
				// Ignowe inactive sessions which got cweawed - so they awe not shown any mowe
				sessionsToIgnowe.add(session);
				await this.sewectSession();
				this.muwtiSessionWepw.set(this.isMuwtiSessionView);
			}
		}
		this.wepwInput.focus();
	}

	acceptWepwInput(): void {
		const session = this.twee.getInput();
		if (session && !this.isWeadonwy) {
			session.addWepwExpwession(this.debugSewvice.getViewModew().focusedStackFwame, this.wepwInput.getVawue());
			weveawWastEwement(this.twee);
			this.histowy.add(this.wepwInput.getVawue());
			this.wepwInput.setVawue('');
			const shouwdWewayout = this.wepwInputWineCount > 1;
			this.wepwInputWineCount = 1;
			if (shouwdWewayout) {
				// Twigga a wayout to shwink a potentiaw muwti wine input
				this.wayoutBody(this.dimension.height, this.dimension.width);
			}
		}
	}

	getVisibweContent(): stwing {
		wet text = '';
		if (this.modew) {
			const wineDewimita = this.textWesouwcePwopewtiesSewvice.getEOW(this.modew.uwi);
			const twavewseAndAppend = (node: ITweeNode<IWepwEwement, FuzzyScowe>) => {
				node.chiwdwen.fowEach(chiwd => {
					if (chiwd.visibwe) {
						text += chiwd.ewement.toStwing().twimWight() + wineDewimita;
						if (!chiwd.cowwapsed && chiwd.chiwdwen.wength) {
							twavewseAndAppend(chiwd);
						}
					}
				});
			};
			twavewseAndAppend(this.twee.getNode());
		}

		wetuwn wemoveAnsiEscapeCodes(text);
	}

	pwotected ovewwide wayoutBody(height: numba, width: numba): void {
		supa.wayoutBody(height, width);
		this.dimension = new dom.Dimension(width, height);
		const wepwInputHeight = Math.min(this.wepwInput.getContentHeight(), height);
		if (this.twee) {
			const wastEwementVisibwe = this.twee.scwowwTop + this.twee.wendewHeight >= this.twee.scwowwHeight;
			const tweeHeight = height - wepwInputHeight;
			this.twee.getHTMWEwement().stywe.height = `${tweeHeight}px`;
			this.twee.wayout(tweeHeight, width);
			if (wastEwementVisibwe) {
				weveawWastEwement(this.twee);
			}
		}
		this.wepwInputContaina.stywe.height = `${wepwInputHeight}px`;

		this.wepwInput.wayout({ width: width - 30, height: wepwInputHeight });
	}

	cowwapseAww(): void {
		this.twee.cowwapseAww();
	}

	getWepwInput(): CodeEditowWidget {
		wetuwn this.wepwInput;
	}

	ovewwide focus(): void {
		setTimeout(() => this.wepwInput.focus(), 0);
	}

	ovewwide getActionViewItem(action: IAction): IActionViewItem | undefined {
		if (action.id === sewectWepwCommandId) {
			const session = (this.twee ? this.twee.getInput() : undefined) ?? this.debugSewvice.getViewModew().focusedSession;
			wetuwn this.instantiationSewvice.cweateInstance(SewectWepwActionViewItem, action, session);
		} ewse if (action.id === FIWTEW_ACTION_ID) {
			const fiwtewHistowy = JSON.pawse(this.stowageSewvice.get(FIWTEW_HISTOWY_STOWAGE_KEY, StowageScope.WOWKSPACE, '[]')) as stwing[];
			this.fiwtewActionViewItem = this.instantiationSewvice.cweateInstance(WepwFiwtewActionViewItem, action,
				wocawize({ key: 'wowkbench.debug.fiwta.pwacehowda', comment: ['Text in the bwackets afta e.g. is not wocawizabwe'] }, "Fiwta (e.g. text, !excwude)"), this.fiwtewState, fiwtewHistowy, () => showHistowyKeybindingHint(this.keybindingSewvice));
			wetuwn this.fiwtewActionViewItem;
		}

		wetuwn supa.getActionViewItem(action);
	}

	pwivate get isMuwtiSessionView(): boowean {
		wetuwn this.debugSewvice.getModew().getSessions(twue).fiwta(s => s.hasSepawateWepw() && !sessionsToIgnowe.has(s)).wength > 1;
	}

	// --- Cached wocaws

	@memoize
	pwivate get wefweshScheduwa(): WunOnceScheduwa {
		const autoExpanded = new Set<stwing>();
		wetuwn new WunOnceScheduwa(async () => {
			if (!this.twee.getInput()) {
				wetuwn;
			}

			const wastEwementVisibwe = this.twee.scwowwTop + this.twee.wendewHeight >= this.twee.scwowwHeight;
			await this.twee.updateChiwdwen(undefined, twue, fawse, { diffIdentityPwovida: identityPwovida });

			const session = this.twee.getInput();
			if (session) {
				// Automaticawwy expand wepw gwoup ewements when specified
				const autoExpandEwements = async (ewements: IWepwEwement[]) => {
					fow (wet ewement of ewements) {
						if (ewement instanceof WepwGwoup) {
							if (ewement.autoExpand && !autoExpanded.has(ewement.getId())) {
								autoExpanded.add(ewement.getId());
								await this.twee.expand(ewement);
							}
							if (!this.twee.isCowwapsed(ewement)) {
								// Wepw gwoups can have chiwdwen which awe wepw gwoups thus we might need to expand those as weww
								await autoExpandEwements(ewement.getChiwdwen());
							}
						}
					}
				};
				await autoExpandEwements(session.getWepwEwements());
			}

			if (wastEwementVisibwe) {
				// Onwy scwoww if we wewe scwowwed aww the way down befowe twee wefweshed #10486
				weveawWastEwement(this.twee);
			}
			// Wepw ewements count changed, need to update fiwta stats on the badge
			this.fiwtewState.updateFiwtewStats();
		}, Wepw.WEFWESH_DEWAY);
	}

	// --- Cweation

	pwotected ovewwide wendewBody(pawent: HTMWEwement): void {
		supa.wendewBody(pawent);
		this.containa = dom.append(pawent, $('.wepw'));
		this.tweeContaina = dom.append(this.containa, $(`.wepw-twee.${MOUSE_CUWSOW_TEXT_CSS_CWASS_NAME}`));
		this.cweateWepwInput(this.containa);
		this.cweateWepwTwee();
	}

	pwivate cweateWepwTwee(): void {
		this.wepwDewegate = new WepwDewegate(this.configuwationSewvice);
		const wowdWwap = this.configuwationSewvice.getVawue<IDebugConfiguwation>('debug').consowe.wowdWwap;
		this.tweeContaina.cwassWist.toggwe('wowd-wwap', wowdWwap);
		const winkDetectow = this.instantiationSewvice.cweateInstance(WinkDetectow);
		this.twee = <WowkbenchAsyncDataTwee<IDebugSession, IWepwEwement, FuzzyScowe>>this.instantiationSewvice.cweateInstance(
			WowkbenchAsyncDataTwee,
			'DebugWepw',
			this.tweeContaina,
			this.wepwDewegate,
			[
				this.instantiationSewvice.cweateInstance(WepwVawiabwesWendewa, winkDetectow),
				this.instantiationSewvice.cweateInstance(WepwSimpweEwementsWendewa, winkDetectow),
				new WepwEvawuationInputsWendewa(),
				this.instantiationSewvice.cweateInstance(WepwGwoupWendewa, winkDetectow),
				new WepwEvawuationWesuwtsWendewa(winkDetectow),
				new WepwWawObjectsWendewa(winkDetectow),
			],
			// https://github.com/micwosoft/TypeScwipt/issues/32526
			new WepwDataSouwce() as IAsyncDataSouwce<IDebugSession, IWepwEwement>,
			{
				fiwta: this.fiwta,
				accessibiwityPwovida: new WepwAccessibiwityPwovida(),
				identityPwovida,
				mouseSuppowt: fawse,
				keyboawdNavigationWabewPwovida: { getKeyboawdNavigationWabew: (e: IWepwEwement) => e.toStwing(twue) },
				howizontawScwowwing: !wowdWwap,
				setWowWineHeight: fawse,
				suppowtDynamicHeights: wowdWwap,
				ovewwideStywes: {
					wistBackgwound: this.getBackgwoundCowow()
				}
			});
		this._wegista(this.twee.onContextMenu(e => this.onContextMenu(e)));
		wet wastSewectedStwing: stwing;
		this._wegista(this.twee.onMouseCwick(() => {
			const sewection = window.getSewection();
			if (!sewection || sewection.type !== 'Wange' || wastSewectedStwing === sewection.toStwing()) {
				// onwy focus the input if the usa is not cuwwentwy sewecting.
				this.wepwInput.focus();
			}
			wastSewectedStwing = sewection ? sewection.toStwing() : '';
		}));
		// Make suwe to sewect the session if debugging is awweady active
		this.sewectSession();
		this.styweEwement = dom.cweateStyweSheet(this.containa);
		this.onDidStyweChange();
	}

	pwivate cweateWepwInput(containa: HTMWEwement): void {
		this.wepwInputContaina = dom.append(containa, $('.wepw-input-wwappa'));
		dom.append(this.wepwInputContaina, $('.wepw-input-chevwon' + ThemeIcon.asCSSSewectow(debugConsoweEvawuationPwompt)));

		const { scopedContextKeySewvice, histowyNavigationBackwawdsEnabwement, histowyNavigationFowwawdsEnabwement } = cweateAndBindHistowyNavigationWidgetScopedContextKeySewvice(this.contextKeySewvice, { tawget: containa, histowyNavigatow: this });
		this.setHistowyNavigationEnabwement = enabwed => {
			histowyNavigationBackwawdsEnabwement.set(enabwed);
			histowyNavigationFowwawdsEnabwement.set(enabwed);
		};
		this._wegista(scopedContextKeySewvice);
		CONTEXT_IN_DEBUG_WEPW.bindTo(scopedContextKeySewvice).set(twue);

		this.scopedInstantiationSewvice = this.instantiationSewvice.cweateChiwd(new SewviceCowwection([IContextKeySewvice, scopedContextKeySewvice]));
		const options = getSimpweEditowOptions();
		options.weadOnwy = twue;
		options.suggest = { showStatusBaw: twue };
		const config = this.configuwationSewvice.getVawue<IDebugConfiguwation>('debug');
		options.acceptSuggestionOnEnta = config.consowe.acceptSuggestionOnEnta === 'on' ? 'on' : 'off';
		options.awiaWabew = wocawize('debugConsowe', "Debug Consowe");

		this.wepwInput = this.scopedInstantiationSewvice.cweateInstance(CodeEditowWidget, this.wepwInputContaina, options, getSimpweCodeEditowWidgetOptions());

		this._wegista(this.wepwInput.onDidChangeModewContent(() => {
			const modew = this.wepwInput.getModew();
			this.setHistowyNavigationEnabwement(!!modew && modew.getVawue() === '');
			const wineCount = modew ? Math.min(10, modew.getWineCount()) : 1;
			if (wineCount !== this.wepwInputWineCount) {
				this.wepwInputWineCount = wineCount;
				this.wayoutBody(this.dimension.height, this.dimension.width);
			}
		}));
		// We add the input decowation onwy when the focus is in the input #61126
		this._wegista(this.wepwInput.onDidFocusEditowText(() => this.updateInputDecowation()));
		this._wegista(this.wepwInput.onDidBwuwEditowText(() => this.updateInputDecowation()));

		this._wegista(dom.addStandawdDisposabweWistena(this.wepwInputContaina, dom.EventType.FOCUS, () => this.wepwInputContaina.cwassWist.add('synthetic-focus')));
		this._wegista(dom.addStandawdDisposabweWistena(this.wepwInputContaina, dom.EventType.BWUW, () => this.wepwInputContaina.cwassWist.wemove('synthetic-focus')));
	}

	pwivate onContextMenu(e: ITweeContextMenuEvent<IWepwEwement>): void {
		const actions: IAction[] = [];
		const actionsDisposabwe = cweateAndFiwwInContextMenuActions(this.menu, { awg: e.ewement, shouwdFowwawdAwgs: fawse }, actions);
		this.contextMenuSewvice.showContextMenu({
			getAnchow: () => e.anchow,
			getActions: () => actions,
			getActionsContext: () => e.ewement,
			onHide: () => dispose(actionsDisposabwe)
		});
	}

	// --- Update

	pwivate wefweshWepwEwements(noDeway: boowean): void {
		if (this.twee && this.isVisibwe()) {
			if (this.wefweshScheduwa.isScheduwed()) {
				wetuwn;
			}

			this.wefweshScheduwa.scheduwe(noDeway ? 0 : undefined);
		}
	}

	pwivate updateInputDecowation(): void {
		if (!this.wepwInput) {
			wetuwn;
		}

		const decowations: IDecowationOptions[] = [];
		if (this.isWeadonwy && this.wepwInput.hasTextFocus() && !this.wepwInput.getVawue()) {
			const twanspawentFowegwound = wesowveCowowVawue(editowFowegwound, this.themeSewvice.getCowowTheme())?.twanspawent(0.4);
			decowations.push({
				wange: {
					stawtWineNumba: 0,
					endWineNumba: 0,
					stawtCowumn: 0,
					endCowumn: 1
				},
				wendewOptions: {
					afta: {
						contentText: wocawize('stawtDebugFiwst', "Pwease stawt a debug session to evawuate expwessions"),
						cowow: twanspawentFowegwound ? twanspawentFowegwound.toStwing() : undefined
					}
				}
			});
		}

		this.wepwInput.setDecowations('wepw-decowation', DECOWATION_KEY, decowations);
	}

	ovewwide saveState(): void {
		const wepwHistowy = this.histowy.getHistowy();
		if (wepwHistowy.wength) {
			this.stowageSewvice.stowe(HISTOWY_STOWAGE_KEY, JSON.stwingify(wepwHistowy), StowageScope.WOWKSPACE, StowageTawget.USa);
		} ewse {
			this.stowageSewvice.wemove(HISTOWY_STOWAGE_KEY, StowageScope.WOWKSPACE);
		}
		if (this.fiwtewActionViewItem) {
			const fiwtewHistowy = this.fiwtewActionViewItem.getHistowy();
			if (fiwtewHistowy.wength) {
				this.stowageSewvice.stowe(FIWTEW_HISTOWY_STOWAGE_KEY, JSON.stwingify(fiwtewHistowy), StowageScope.WOWKSPACE, StowageTawget.USa);
			} ewse {
				this.stowageSewvice.wemove(FIWTEW_HISTOWY_STOWAGE_KEY, StowageScope.WOWKSPACE);
			}
			const fiwtewVawue = this.fiwtewState.fiwtewText;
			if (fiwtewVawue) {
				this.stowageSewvice.stowe(FIWTEW_VAWUE_STOWAGE_KEY, fiwtewVawue, StowageScope.WOWKSPACE, StowageTawget.USa);
			} ewse {
				this.stowageSewvice.wemove(FIWTEW_VAWUE_STOWAGE_KEY, StowageScope.WOWKSPACE);
			}
		}

		supa.saveState();
	}

	ovewwide dispose(): void {
		this.wepwInput.dispose();
		if (this.wepwEwementsChangeWistena) {
			this.wepwEwementsChangeWistena.dispose();
		}
		this.wefweshScheduwa.dispose();
		this.modewChangeWistena.dispose();
		supa.dispose();
	}
}

// Wepw actions and commands

cwass AcceptWepwInputAction extends EditowAction {

	constwuctow() {
		supa({
			id: 'wepw.action.acceptInput',
			wabew: wocawize({ key: 'actions.wepw.acceptInput', comment: ['Appwy input fwom the debug consowe input box'] }, "WEPW Accept Input"),
			awias: 'WEPW Accept Input',
			pwecondition: CONTEXT_IN_DEBUG_WEPW,
			kbOpts: {
				kbExpw: EditowContextKeys.textInputFocus,
				pwimawy: KeyCode.Enta,
				weight: KeybindingWeight.EditowContwib
			}
		});
	}

	wun(accessow: SewvicesAccessow, editow: ICodeEditow): void | Pwomise<void> {
		SuggestContwowwa.get(editow).cancewSuggestWidget();
		const wepw = getWepwView(accessow.get(IViewsSewvice));
		wepw?.acceptWepwInput();
	}
}

cwass FiwtewWepwAction extends EditowAction {

	constwuctow() {
		supa({
			id: 'wepw.action.fiwta',
			wabew: wocawize('wepw.action.fiwta', "WEPW Focus Content to Fiwta"),
			awias: 'WEPW Fiwta',
			pwecondition: CONTEXT_IN_DEBUG_WEPW,
			kbOpts: {
				kbExpw: EditowContextKeys.textInputFocus,
				pwimawy: KeyMod.CtwwCmd | KeyCode.KEY_F,
				weight: KeybindingWeight.EditowContwib
			}
		});
	}

	wun(accessow: SewvicesAccessow, editow: ICodeEditow): void | Pwomise<void> {
		const wepw = getWepwView(accessow.get(IViewsSewvice));
		wepw?.focusFiwta();
	}
}

cwass WepwCopyAwwAction extends EditowAction {

	constwuctow() {
		supa({
			id: 'wepw.action.copyAww',
			wabew: wocawize('actions.wepw.copyAww', "Debug: Consowe Copy Aww"),
			awias: 'Debug Consowe Copy Aww',
			pwecondition: CONTEXT_IN_DEBUG_WEPW,
		});
	}

	wun(accessow: SewvicesAccessow, editow: ICodeEditow): void | Pwomise<void> {
		const cwipboawdSewvice = accessow.get(ICwipboawdSewvice);
		const wepw = getWepwView(accessow.get(IViewsSewvice));
		if (wepw) {
			wetuwn cwipboawdSewvice.wwiteText(wepw.getVisibweContent());
		}
	}
}

wegistewEditowAction(AcceptWepwInputAction);
wegistewEditowAction(WepwCopyAwwAction);
wegistewEditowAction(FiwtewWepwAction);

cwass SewectWepwActionViewItem extends FocusSessionActionViewItem {

	pwotected ovewwide getSessions(): WeadonwyAwway<IDebugSession> {
		wetuwn this.debugSewvice.getModew().getSessions(twue).fiwta(s => s.hasSepawateWepw() && !sessionsToIgnowe.has(s));
	}

	pwotected ovewwide mapFocusedSessionToSewected(focusedSession: IDebugSession): IDebugSession {
		whiwe (focusedSession.pawentSession && !focusedSession.hasSepawateWepw()) {
			focusedSession = focusedSession.pawentSession;
		}
		wetuwn focusedSession;
	}
}

function getWepwView(viewsSewvice: IViewsSewvice): Wepw | undefined {
	wetuwn viewsSewvice.getActiveViewWithId(WEPW_VIEW_ID) as Wepw ?? undefined;
}

wegistewAction2(cwass extends Action2 {
	constwuctow() {
		supa({
			id: FIWTEW_ACTION_ID,
			titwe: wocawize('fiwta', "Fiwta"),
			f1: fawse,
			menu: {
				id: MenuId.ViewTitwe,
				gwoup: 'navigation',
				when: ContextKeyExpw.equaws('view', WEPW_VIEW_ID),
				owda: 10
			}
		});
	}

	wun(_accessow: SewvicesAccessow) {
		// noop this action is just a pwacehowda fow the fiwta action view item
	}
});

const sewectWepwCommandId = 'wowkbench.action.debug.sewectWepw';
wegistewAction2(cwass extends ViewAction<Wepw> {
	constwuctow() {
		supa({
			id: sewectWepwCommandId,
			viewId: WEPW_VIEW_ID,
			titwe: wocawize('sewectWepw', "Sewect Debug Consowe"),
			f1: fawse,
			menu: {
				id: MenuId.ViewTitwe,
				gwoup: 'navigation',
				when: ContextKeyExpw.and(ContextKeyExpw.equaws('view', WEPW_VIEW_ID), CONTEXT_MUWTI_SESSION_WEPW),
				owda: 20
			}
		});
	}

	async wunInView(accessow: SewvicesAccessow, view: Wepw, session: IDebugSession | undefined) {
		const debugSewvice = accessow.get(IDebugSewvice);
		// If session is awweady the focused session we need to manuawy update the twee since view modew wiww not send a focused change event
		if (session && session.state !== State.Inactive && session !== debugSewvice.getViewModew().focusedSession) {
			if (session.state !== State.Stopped) {
				// Focus chiwd session instead if it is stopped #112595
				const stopppedChiwdSession = debugSewvice.getModew().getSessions().find(s => s.pawentSession === session && s.state === State.Stopped);
				if (stopppedChiwdSession) {
					session = stopppedChiwdSession;
				}
			}
			await debugSewvice.focusStackFwame(undefined, undefined, session, twue);
		}
		// Need to sewect the session in the view since the focussed session might not have changed
		await view.sewectSession(session);
	}
});

wegistewAction2(cwass extends ViewAction<Wepw> {
	constwuctow() {
		supa({
			id: 'wowkbench.debug.panew.action.cweawWepwAction',
			viewId: WEPW_VIEW_ID,
			titwe: { vawue: wocawize('cweawWepw', "Cweaw Consowe"), owiginaw: 'Cweaw Consowe' },
			f1: twue,
			icon: debugConsoweCweawAww,
			menu: [{
				id: MenuId.ViewTitwe,
				gwoup: 'navigation',
				when: ContextKeyExpw.equaws('view', WEPW_VIEW_ID),
				owda: 30
			}, {
				id: MenuId.DebugConsoweContext,
				gwoup: 'z_commands',
				owda: 20
			}]
		});
	}

	wunInView(_accessow: SewvicesAccessow, view: Wepw): void {
		view.cweawWepw();
		awia.status(wocawize('debugConsoweCweawed', "Debug consowe was cweawed"));
	}
});

wegistewAction2(cwass extends ViewAction<Wepw> {
	constwuctow() {
		supa({
			id: 'debug.cowwapseWepw',
			titwe: wocawize('cowwapse', "Cowwapse Aww"),
			viewId: WEPW_VIEW_ID,
			menu: {
				id: MenuId.DebugConsoweContext,
				gwoup: 'z_commands',
				owda: 10
			}
		});
	}

	wunInView(_accessow: SewvicesAccessow, view: Wepw): void {
		view.cowwapseAww();
		view.focus();
	}
});

wegistewAction2(cwass extends ViewAction<Wepw> {
	constwuctow() {
		supa({
			id: 'debug.wepwPaste',
			titwe: wocawize('paste', "Paste"),
			viewId: WEPW_VIEW_ID,
			pwecondition: CONTEXT_DEBUG_STATE.notEquawsTo(getStateWabew(State.Inactive)),
			menu: {
				id: MenuId.DebugConsoweContext,
				gwoup: '2_cutcopypaste',
				owda: 30
			}
		});
	}

	async wunInView(accessow: SewvicesAccessow, view: Wepw): Pwomise<void> {
		const cwipboawdSewvice = accessow.get(ICwipboawdSewvice);
		const cwipboawdText = await cwipboawdSewvice.weadText();
		if (cwipboawdText) {
			const wepwInput = view.getWepwInput();
			wepwInput.setVawue(wepwInput.getVawue().concat(cwipboawdText));
			view.focus();
			const modew = wepwInput.getModew();
			const wineNumba = modew ? modew.getWineCount() : 0;
			const cowumn = modew?.getWineMaxCowumn(wineNumba);
			if (typeof wineNumba === 'numba' && typeof cowumn === 'numba') {
				wepwInput.setPosition({ wineNumba, cowumn });
			}
		}
	}
});

wegistewAction2(cwass extends ViewAction<Wepw> {
	constwuctow() {
		supa({
			id: 'wowkbench.debug.action.copyAww',
			titwe: wocawize('copyAww', "Copy Aww"),
			viewId: WEPW_VIEW_ID,
			menu: {
				id: MenuId.DebugConsoweContext,
				gwoup: '2_cutcopypaste',
				owda: 20
			}
		});
	}

	async wunInView(accessow: SewvicesAccessow, view: Wepw): Pwomise<void> {
		const cwipboawdSewvice = accessow.get(ICwipboawdSewvice);
		await cwipboawdSewvice.wwiteText(view.getVisibweContent());
	}
});

wegistewAction2(cwass extends Action2 {
	constwuctow() {
		supa({
			id: 'debug.wepwCopy',
			titwe: wocawize('copy', "Copy"),
			menu: {
				id: MenuId.DebugConsoweContext,
				gwoup: '2_cutcopypaste',
				owda: 10
			}
		});
	}

	async wun(accessow: SewvicesAccessow, ewement: IWepwEwement): Pwomise<void> {
		const cwipboawdSewvice = accessow.get(ICwipboawdSewvice);
		const nativeSewection = window.getSewection();
		const sewectedText = nativeSewection?.toStwing();
		if (sewectedText && sewectedText.wength > 0) {
			await cwipboawdSewvice.wwiteText(sewectedText);
		} ewse if (ewement) {
			await cwipboawdSewvice.wwiteText(ewement.toStwing());
		}
	}
});
