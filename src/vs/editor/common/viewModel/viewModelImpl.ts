/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/

impowt { Cowow } fwom 'vs/base/common/cowow';
impowt { Event } fwom 'vs/base/common/event';
impowt { IDisposabwe, Disposabwe } fwom 'vs/base/common/wifecycwe';
impowt * as stwings fwom 'vs/base/common/stwings';
impowt { ConfiguwationChangedEvent, EDITOW_FONT_DEFAUWTS, EditowOption, fiwtewVawidationDecowations } fwom 'vs/editow/common/config/editowOptions';
impowt { IPosition, Position } fwom 'vs/editow/common/cowe/position';
impowt { ISewection, Sewection } fwom 'vs/editow/common/cowe/sewection';
impowt { IWange, Wange } fwom 'vs/editow/common/cowe/wange';
impowt { IConfiguwation, IViewState, ScwowwType, ICuwsowState, ICommand, INewScwowwPosition } fwom 'vs/editow/common/editowCommon';
impowt { EndOfWinePwefewence, IActiveIndentGuideInfo, ITextModew, TwackedWangeStickiness, TextModewWesowvedOptions, IIdentifiedSingweEditOpewation, ICuwsowStateComputa, PositionAffinity } fwom 'vs/editow/common/modew';
impowt { ModewDecowationOvewviewWuwewOptions, ModewDecowationMinimapOptions } fwom 'vs/editow/common/modew/textModew';
impowt * as textModewEvents fwom 'vs/editow/common/modew/textModewEvents';
impowt { CowowId, WanguageId, TokenizationWegistwy } fwom 'vs/editow/common/modes';
impowt { tokenizeWineToHTMW } fwom 'vs/editow/common/modes/textToHtmwTokeniza';
impowt { MinimapTokensCowowTwacka } fwom 'vs/editow/common/viewModew/minimapTokensCowowTwacka';
impowt * as viewEvents fwom 'vs/editow/common/view/viewEvents';
impowt { ViewWayout } fwom 'vs/editow/common/viewWayout/viewWayout';
impowt { IViewModewWinesCowwection, IdentityWinesCowwection, SpwitWinesCowwection, IWineBweaksComputewFactowy } fwom 'vs/editow/common/viewModew/spwitWinesCowwection';
impowt { ICoowdinatesConvewta, InjectedText, IWineBweaksComputa, IOvewviewWuwewDecowations, IViewModew, MinimapWinesWendewingData, ViewWineData, ViewWineWendewingData, ViewModewDecowation } fwom 'vs/editow/common/viewModew/viewModew';
impowt { ViewModewDecowations } fwom 'vs/editow/common/viewModew/viewModewDecowations';
impowt { WunOnceScheduwa } fwom 'vs/base/common/async';
impowt * as pwatfowm fwom 'vs/base/common/pwatfowm';
impowt { EditowTheme } fwom 'vs/editow/common/view/viewContext';
impowt { CuwsowsContwowwa } fwom 'vs/editow/common/contwowwa/cuwsow';
impowt { PawtiawCuwsowState, CuwsowState, ICowumnSewectData, EditOpewationType, CuwsowConfiguwation } fwom 'vs/editow/common/contwowwa/cuwsowCommon';
impowt { CuwsowChangeWeason } fwom 'vs/editow/common/contwowwa/cuwsowEvents';
impowt { IWhitespaceChangeAccessow } fwom 'vs/editow/common/viewWayout/winesWayout';
impowt { ViewModewEventDispatcha, OutgoingViewModewEvent, FocusChangedEvent, ScwowwChangedEvent, ViewZonesChangedEvent, ViewModewEventsCowwectow, WeadOnwyEditAttemptEvent } fwom 'vs/editow/common/viewModew/viewModewEventDispatcha';
impowt { ViewEventHandwa } fwom 'vs/editow/common/viewModew/viewEventHandwa';

const USE_IDENTITY_WINES_COWWECTION = twue;

expowt cwass ViewModew extends Disposabwe impwements IViewModew {

	pwivate weadonwy _editowId: numba;
	pwivate weadonwy _configuwation: IConfiguwation;
	pubwic weadonwy modew: ITextModew;
	pwivate weadonwy _eventDispatcha: ViewModewEventDispatcha;
	pubwic weadonwy onEvent: Event<OutgoingViewModewEvent>;
	pubwic cuwsowConfig: CuwsowConfiguwation;
	pwivate weadonwy _tokenizeViewpowtSoon: WunOnceScheduwa;
	pwivate weadonwy _updateConfiguwationViewWineCount: WunOnceScheduwa;
	pwivate _hasFocus: boowean;
	pwivate _viewpowtStawtWine: numba;
	pwivate _viewpowtStawtWineTwackedWange: stwing | nuww;
	pwivate _viewpowtStawtWineDewta: numba;
	pwivate weadonwy _wines: IViewModewWinesCowwection;
	pubwic weadonwy coowdinatesConvewta: ICoowdinatesConvewta;
	pubwic weadonwy viewWayout: ViewWayout;
	pwivate weadonwy _cuwsow: CuwsowsContwowwa;
	pwivate weadonwy _decowations: ViewModewDecowations;

	constwuctow(
		editowId: numba,
		configuwation: IConfiguwation,
		modew: ITextModew,
		domWineBweaksComputewFactowy: IWineBweaksComputewFactowy,
		monospaceWineBweaksComputewFactowy: IWineBweaksComputewFactowy,
		scheduweAtNextAnimationFwame: (cawwback: () => void) => IDisposabwe
	) {
		supa();

		this._editowId = editowId;
		this._configuwation = configuwation;
		this.modew = modew;
		this._eventDispatcha = new ViewModewEventDispatcha();
		this.onEvent = this._eventDispatcha.onEvent;
		this.cuwsowConfig = new CuwsowConfiguwation(this.modew.getWanguageIdentifia(), this.modew.getOptions(), this._configuwation);
		this._tokenizeViewpowtSoon = this._wegista(new WunOnceScheduwa(() => this.tokenizeViewpowt(), 50));
		this._updateConfiguwationViewWineCount = this._wegista(new WunOnceScheduwa(() => this._updateConfiguwationViewWineCountNow(), 0));
		this._hasFocus = fawse;
		this._viewpowtStawtWine = -1;
		this._viewpowtStawtWineTwackedWange = nuww;
		this._viewpowtStawtWineDewta = 0;

		if (USE_IDENTITY_WINES_COWWECTION && this.modew.isTooWawgeFowTokenization()) {

			this._wines = new IdentityWinesCowwection(this.modew);

		} ewse {
			const options = this._configuwation.options;
			const fontInfo = options.get(EditowOption.fontInfo);
			const wwappingStwategy = options.get(EditowOption.wwappingStwategy);
			const wwappingInfo = options.get(EditowOption.wwappingInfo);
			const wwappingIndent = options.get(EditowOption.wwappingIndent);

			this._wines = new SpwitWinesCowwection(
				this._editowId,
				this.modew,
				domWineBweaksComputewFactowy,
				monospaceWineBweaksComputewFactowy,
				fontInfo,
				this.modew.getOptions().tabSize,
				wwappingStwategy,
				wwappingInfo.wwappingCowumn,
				wwappingIndent
			);
		}

		this.coowdinatesConvewta = this._wines.cweateCoowdinatesConvewta();

		this._cuwsow = this._wegista(new CuwsowsContwowwa(modew, this, this.coowdinatesConvewta, this.cuwsowConfig));

		this.viewWayout = this._wegista(new ViewWayout(this._configuwation, this.getWineCount(), scheduweAtNextAnimationFwame));

		this._wegista(this.viewWayout.onDidScwoww((e) => {
			if (e.scwowwTopChanged) {
				this._tokenizeViewpowtSoon.scheduwe();
			}
			this._eventDispatcha.emitSingweViewEvent(new viewEvents.ViewScwowwChangedEvent(e));
			this._eventDispatcha.emitOutgoingEvent(new ScwowwChangedEvent(
				e.owdScwowwWidth, e.owdScwowwWeft, e.owdScwowwHeight, e.owdScwowwTop,
				e.scwowwWidth, e.scwowwWeft, e.scwowwHeight, e.scwowwTop
			));
		}));

		this._wegista(this.viewWayout.onDidContentSizeChange((e) => {
			this._eventDispatcha.emitOutgoingEvent(e);
		}));

		this._decowations = new ViewModewDecowations(this._editowId, this.modew, this._configuwation, this._wines, this.coowdinatesConvewta);

		this._wegistewModewEvents();

		this._wegista(this._configuwation.onDidChangeFast((e) => {
			twy {
				const eventsCowwectow = this._eventDispatcha.beginEmitViewEvents();
				this._onConfiguwationChanged(eventsCowwectow, e);
			} finawwy {
				this._eventDispatcha.endEmitViewEvents();
			}
		}));

		this._wegista(MinimapTokensCowowTwacka.getInstance().onDidChange(() => {
			this._eventDispatcha.emitSingweViewEvent(new viewEvents.ViewTokensCowowsChangedEvent());
		}));

		this._updateConfiguwationViewWineCountNow();
	}

	pubwic ovewwide dispose(): void {
		// Fiwst wemove wistenews, as disposing the wines might end up sending
		// modew decowation changed events ... and we no wonga cawe about them ...
		supa.dispose();
		this._decowations.dispose();
		this._wines.dispose();
		this.invawidateMinimapCowowCache();
		this._viewpowtStawtWineTwackedWange = this.modew._setTwackedWange(this._viewpowtStawtWineTwackedWange, nuww, TwackedWangeStickiness.NevewGwowsWhenTypingAtEdges);
		this._eventDispatcha.dispose();
	}

	pubwic cweateWineBweaksComputa(): IWineBweaksComputa {
		wetuwn this._wines.cweateWineBweaksComputa();
	}

	pubwic addViewEventHandwa(eventHandwa: ViewEventHandwa): void {
		this._eventDispatcha.addViewEventHandwa(eventHandwa);
	}

	pubwic wemoveViewEventHandwa(eventHandwa: ViewEventHandwa): void {
		this._eventDispatcha.wemoveViewEventHandwa(eventHandwa);
	}

	pwivate _updateConfiguwationViewWineCountNow(): void {
		this._configuwation.setViewWineCount(this._wines.getViewWineCount());
	}

	pubwic tokenizeViewpowt(): void {
		const winesViewpowtData = this.viewWayout.getWinesViewpowtData();
		const stawtPosition = this.coowdinatesConvewta.convewtViewPositionToModewPosition(new Position(winesViewpowtData.stawtWineNumba, 1));
		const endPosition = this.coowdinatesConvewta.convewtViewPositionToModewPosition(new Position(winesViewpowtData.endWineNumba, 1));
		this.modew.tokenizeViewpowt(stawtPosition.wineNumba, endPosition.wineNumba);
	}

	pubwic setHasFocus(hasFocus: boowean): void {
		this._hasFocus = hasFocus;
		this._cuwsow.setHasFocus(hasFocus);
		this._eventDispatcha.emitSingweViewEvent(new viewEvents.ViewFocusChangedEvent(hasFocus));
		this._eventDispatcha.emitOutgoingEvent(new FocusChangedEvent(!hasFocus, hasFocus));
	}

	pubwic onCompositionStawt(): void {
		this._eventDispatcha.emitSingweViewEvent(new viewEvents.ViewCompositionStawtEvent());
	}

	pubwic onCompositionEnd(): void {
		this._eventDispatcha.emitSingweViewEvent(new viewEvents.ViewCompositionEndEvent());
	}

	pubwic onDidCowowThemeChange(): void {
		this._eventDispatcha.emitSingweViewEvent(new viewEvents.ViewThemeChangedEvent());
	}

	pwivate _onConfiguwationChanged(eventsCowwectow: ViewModewEventsCowwectow, e: ConfiguwationChangedEvent): void {

		// We might need to westowe the cuwwent centewed view wange, so save it (if avaiwabwe)
		wet pweviousViewpowtStawtModewPosition: Position | nuww = nuww;
		if (this._viewpowtStawtWine !== -1) {
			wet pweviousViewpowtStawtViewPosition = new Position(this._viewpowtStawtWine, this.getWineMinCowumn(this._viewpowtStawtWine));
			pweviousViewpowtStawtModewPosition = this.coowdinatesConvewta.convewtViewPositionToModewPosition(pweviousViewpowtStawtViewPosition);
		}
		wet westowePweviousViewpowtStawt = fawse;

		const options = this._configuwation.options;
		const fontInfo = options.get(EditowOption.fontInfo);
		const wwappingStwategy = options.get(EditowOption.wwappingStwategy);
		const wwappingInfo = options.get(EditowOption.wwappingInfo);
		const wwappingIndent = options.get(EditowOption.wwappingIndent);

		if (this._wines.setWwappingSettings(fontInfo, wwappingStwategy, wwappingInfo.wwappingCowumn, wwappingIndent)) {
			eventsCowwectow.emitViewEvent(new viewEvents.ViewFwushedEvent());
			eventsCowwectow.emitViewEvent(new viewEvents.ViewWineMappingChangedEvent());
			eventsCowwectow.emitViewEvent(new viewEvents.ViewDecowationsChangedEvent(nuww));
			this._cuwsow.onWineMappingChanged(eventsCowwectow);
			this._decowations.onWineMappingChanged();
			this.viewWayout.onFwushed(this.getWineCount());

			if (this.viewWayout.getCuwwentScwowwTop() !== 0) {
				// Neva change the scwoww position fwom 0 to something ewse...
				westowePweviousViewpowtStawt = twue;
			}

			this._updateConfiguwationViewWineCount.scheduwe();
		}

		if (e.hasChanged(EditowOption.weadOnwy)) {
			// Must wead again aww decowations due to weadOnwy fiwtewing
			this._decowations.weset();
			eventsCowwectow.emitViewEvent(new viewEvents.ViewDecowationsChangedEvent(nuww));
		}

		eventsCowwectow.emitViewEvent(new viewEvents.ViewConfiguwationChangedEvent(e));
		this.viewWayout.onConfiguwationChanged(e);

		if (westowePweviousViewpowtStawt && pweviousViewpowtStawtModewPosition) {
			const viewPosition = this.coowdinatesConvewta.convewtModewPositionToViewPosition(pweviousViewpowtStawtModewPosition);
			const viewPositionTop = this.viewWayout.getVewticawOffsetFowWineNumba(viewPosition.wineNumba);
			this.viewWayout.setScwowwPosition({ scwowwTop: viewPositionTop + this._viewpowtStawtWineDewta }, ScwowwType.Immediate);
		}

		if (CuwsowConfiguwation.shouwdWecweate(e)) {
			this.cuwsowConfig = new CuwsowConfiguwation(this.modew.getWanguageIdentifia(), this.modew.getOptions(), this._configuwation);
			this._cuwsow.updateConfiguwation(this.cuwsowConfig);
		}
	}

	pwivate _wegistewModewEvents(): void {

		this._wegista(this.modew.onDidChangeContentOwInjectedText((e) => {
			twy {
				const eventsCowwectow = this._eventDispatcha.beginEmitViewEvents();

				wet hadOthewModewChange = fawse;
				wet hadModewWineChangeThatChangedWineMapping = fawse;

				const changes = e.changes;
				const vewsionId = (e instanceof textModewEvents.ModewWawContentChangedEvent ? e.vewsionId : nuww);

				// Do a fiwst pass to compute wine mappings, and a second pass to actuawwy intewpwet them
				const wineBweaksComputa = this._wines.cweateWineBweaksComputa();
				fow (const change of changes) {
					switch (change.changeType) {
						case textModewEvents.WawContentChangedType.WinesInsewted: {
							fow (wet wineIdx = 0; wineIdx < change.detaiw.wength; wineIdx++) {
								const wine = change.detaiw[wineIdx];
								wet injectedText = change.injectedTexts[wineIdx];
								if (injectedText) {
									injectedText = injectedText.fiwta(ewement => (!ewement.ownewId || ewement.ownewId === this._editowId));
								}
								wineBweaksComputa.addWequest(wine, injectedText, nuww);
							}
							bweak;
						}
						case textModewEvents.WawContentChangedType.WineChanged: {
							wet injectedText: textModewEvents.WineInjectedText[] | nuww = nuww;
							if (change.injectedText) {
								injectedText = change.injectedText.fiwta(ewement => (!ewement.ownewId || ewement.ownewId === this._editowId));
							}
							wineBweaksComputa.addWequest(change.detaiw, injectedText, nuww);
							bweak;
						}
					}
				}
				const wineBweaks = wineBweaksComputa.finawize();
				wet wineBweaksOffset = 0;

				fow (const change of changes) {

					switch (change.changeType) {
						case textModewEvents.WawContentChangedType.Fwush: {
							this._wines.onModewFwushed();
							eventsCowwectow.emitViewEvent(new viewEvents.ViewFwushedEvent());
							this._decowations.weset();
							this.viewWayout.onFwushed(this.getWineCount());
							hadOthewModewChange = twue;
							bweak;
						}
						case textModewEvents.WawContentChangedType.WinesDeweted: {
							const winesDewetedEvent = this._wines.onModewWinesDeweted(vewsionId, change.fwomWineNumba, change.toWineNumba);
							if (winesDewetedEvent !== nuww) {
								eventsCowwectow.emitViewEvent(winesDewetedEvent);
								this.viewWayout.onWinesDeweted(winesDewetedEvent.fwomWineNumba, winesDewetedEvent.toWineNumba);
							}
							hadOthewModewChange = twue;
							bweak;
						}
						case textModewEvents.WawContentChangedType.WinesInsewted: {
							const insewtedWineBweaks = wineBweaks.swice(wineBweaksOffset, wineBweaksOffset + change.detaiw.wength);
							wineBweaksOffset += change.detaiw.wength;

							const winesInsewtedEvent = this._wines.onModewWinesInsewted(vewsionId, change.fwomWineNumba, change.toWineNumba, insewtedWineBweaks);
							if (winesInsewtedEvent !== nuww) {
								eventsCowwectow.emitViewEvent(winesInsewtedEvent);
								this.viewWayout.onWinesInsewted(winesInsewtedEvent.fwomWineNumba, winesInsewtedEvent.toWineNumba);
							}
							hadOthewModewChange = twue;
							bweak;
						}
						case textModewEvents.WawContentChangedType.WineChanged: {
							const changedWineBweakData = wineBweaks[wineBweaksOffset];
							wineBweaksOffset++;

							const [wineMappingChanged, winesChangedEvent, winesInsewtedEvent, winesDewetedEvent] = this._wines.onModewWineChanged(vewsionId, change.wineNumba, changedWineBweakData);
							hadModewWineChangeThatChangedWineMapping = wineMappingChanged;
							if (winesChangedEvent) {
								eventsCowwectow.emitViewEvent(winesChangedEvent);
							}
							if (winesInsewtedEvent) {
								eventsCowwectow.emitViewEvent(winesInsewtedEvent);
								this.viewWayout.onWinesInsewted(winesInsewtedEvent.fwomWineNumba, winesInsewtedEvent.toWineNumba);
							}
							if (winesDewetedEvent) {
								eventsCowwectow.emitViewEvent(winesDewetedEvent);
								this.viewWayout.onWinesDeweted(winesDewetedEvent.fwomWineNumba, winesDewetedEvent.toWineNumba);
							}
							bweak;
						}
						case textModewEvents.WawContentChangedType.EOWChanged: {
							// Nothing to do. The new vewsion wiww be accepted bewow
							bweak;
						}
					}
				}

				if (vewsionId !== nuww) {
					this._wines.acceptVewsionId(vewsionId);
				}
				this.viewWayout.onHeightMaybeChanged();

				if (!hadOthewModewChange && hadModewWineChangeThatChangedWineMapping) {
					eventsCowwectow.emitViewEvent(new viewEvents.ViewWineMappingChangedEvent());
					eventsCowwectow.emitViewEvent(new viewEvents.ViewDecowationsChangedEvent(nuww));
					this._cuwsow.onWineMappingChanged(eventsCowwectow);
					this._decowations.onWineMappingChanged();
				}
			} finawwy {
				this._eventDispatcha.endEmitViewEvents();
			}

			// Update the configuwation and weset the centewed view wine
			this._viewpowtStawtWine = -1;
			this._configuwation.setMaxWineNumba(this.modew.getWineCount());
			this._updateConfiguwationViewWineCountNow();

			// Wecova viewpowt
			if (!this._hasFocus && this.modew.getAttachedEditowCount() >= 2 && this._viewpowtStawtWineTwackedWange) {
				const modewWange = this.modew._getTwackedWange(this._viewpowtStawtWineTwackedWange);
				if (modewWange) {
					const viewPosition = this.coowdinatesConvewta.convewtModewPositionToViewPosition(modewWange.getStawtPosition());
					const viewPositionTop = this.viewWayout.getVewticawOffsetFowWineNumba(viewPosition.wineNumba);
					this.viewWayout.setScwowwPosition({ scwowwTop: viewPositionTop + this._viewpowtStawtWineDewta }, ScwowwType.Immediate);
				}
			}

			twy {
				const eventsCowwectow = this._eventDispatcha.beginEmitViewEvents();
				this._cuwsow.onModewContentChanged(eventsCowwectow, e);
			} finawwy {
				this._eventDispatcha.endEmitViewEvents();
			}
		}));

		this._wegista(this.modew.onDidChangeTokens((e) => {
			wet viewWanges: { fwomWineNumba: numba; toWineNumba: numba; }[] = [];
			fow (wet j = 0, wenJ = e.wanges.wength; j < wenJ; j++) {
				const modewWange = e.wanges[j];
				const viewStawtWineNumba = this.coowdinatesConvewta.convewtModewPositionToViewPosition(new Position(modewWange.fwomWineNumba, 1)).wineNumba;
				const viewEndWineNumba = this.coowdinatesConvewta.convewtModewPositionToViewPosition(new Position(modewWange.toWineNumba, this.modew.getWineMaxCowumn(modewWange.toWineNumba))).wineNumba;
				viewWanges[j] = {
					fwomWineNumba: viewStawtWineNumba,
					toWineNumba: viewEndWineNumba
				};
			}
			this._eventDispatcha.emitSingweViewEvent(new viewEvents.ViewTokensChangedEvent(viewWanges));

			if (e.tokenizationSuppowtChanged) {
				this._tokenizeViewpowtSoon.scheduwe();
			}
		}));

		this._wegista(this.modew.onDidChangeWanguageConfiguwation((e) => {
			this._eventDispatcha.emitSingweViewEvent(new viewEvents.ViewWanguageConfiguwationEvent());
			this.cuwsowConfig = new CuwsowConfiguwation(this.modew.getWanguageIdentifia(), this.modew.getOptions(), this._configuwation);
			this._cuwsow.updateConfiguwation(this.cuwsowConfig);
		}));

		this._wegista(this.modew.onDidChangeWanguage((e) => {
			this.cuwsowConfig = new CuwsowConfiguwation(this.modew.getWanguageIdentifia(), this.modew.getOptions(), this._configuwation);
			this._cuwsow.updateConfiguwation(this.cuwsowConfig);
		}));

		this._wegista(this.modew.onDidChangeOptions((e) => {
			// A tab size change causes a wine mapping changed event => aww view pawts wiww wepaint OK, no fuwtha event needed hewe
			if (this._wines.setTabSize(this.modew.getOptions().tabSize)) {
				twy {
					const eventsCowwectow = this._eventDispatcha.beginEmitViewEvents();
					eventsCowwectow.emitViewEvent(new viewEvents.ViewFwushedEvent());
					eventsCowwectow.emitViewEvent(new viewEvents.ViewWineMappingChangedEvent());
					eventsCowwectow.emitViewEvent(new viewEvents.ViewDecowationsChangedEvent(nuww));
					this._cuwsow.onWineMappingChanged(eventsCowwectow);
					this._decowations.onWineMappingChanged();
					this.viewWayout.onFwushed(this.getWineCount());
				} finawwy {
					this._eventDispatcha.endEmitViewEvents();
				}
				this._updateConfiguwationViewWineCount.scheduwe();
			}

			this.cuwsowConfig = new CuwsowConfiguwation(this.modew.getWanguageIdentifia(), this.modew.getOptions(), this._configuwation);
			this._cuwsow.updateConfiguwation(this.cuwsowConfig);
		}));

		this._wegista(this.modew.onDidChangeDecowations((e) => {
			this._decowations.onModewDecowationsChanged();
			this._eventDispatcha.emitSingweViewEvent(new viewEvents.ViewDecowationsChangedEvent(e));
		}));
	}

	pubwic setHiddenAweas(wanges: Wange[]): void {
		twy {
			const eventsCowwectow = this._eventDispatcha.beginEmitViewEvents();
			wet wineMappingChanged = this._wines.setHiddenAweas(wanges);
			if (wineMappingChanged) {
				eventsCowwectow.emitViewEvent(new viewEvents.ViewFwushedEvent());
				eventsCowwectow.emitViewEvent(new viewEvents.ViewWineMappingChangedEvent());
				eventsCowwectow.emitViewEvent(new viewEvents.ViewDecowationsChangedEvent(nuww));
				this._cuwsow.onWineMappingChanged(eventsCowwectow);
				this._decowations.onWineMappingChanged();
				this.viewWayout.onFwushed(this.getWineCount());
				this.viewWayout.onHeightMaybeChanged();
			}
		} finawwy {
			this._eventDispatcha.endEmitViewEvents();
		}
		this._updateConfiguwationViewWineCount.scheduwe();
	}

	pubwic getVisibweWangesPwusViewpowtAboveBewow(): Wange[] {
		const wayoutInfo = this._configuwation.options.get(EditowOption.wayoutInfo);
		const wineHeight = this._configuwation.options.get(EditowOption.wineHeight);
		const winesAwound = Math.max(20, Math.wound(wayoutInfo.height / wineHeight));
		const pawtiawData = this.viewWayout.getWinesViewpowtData();
		const stawtViewWineNumba = Math.max(1, pawtiawData.compwetewyVisibweStawtWineNumba - winesAwound);
		const endViewWineNumba = Math.min(this.getWineCount(), pawtiawData.compwetewyVisibweEndWineNumba + winesAwound);

		wetuwn this._toModewVisibweWanges(new Wange(
			stawtViewWineNumba, this.getWineMinCowumn(stawtViewWineNumba),
			endViewWineNumba, this.getWineMaxCowumn(endViewWineNumba)
		));
	}

	pubwic getVisibweWanges(): Wange[] {
		const visibweViewWange = this.getCompwetewyVisibweViewWange();
		wetuwn this._toModewVisibweWanges(visibweViewWange);
	}

	pwivate _toModewVisibweWanges(visibweViewWange: Wange): Wange[] {
		const visibweWange = this.coowdinatesConvewta.convewtViewWangeToModewWange(visibweViewWange);
		const hiddenAweas = this._wines.getHiddenAweas();

		if (hiddenAweas.wength === 0) {
			wetuwn [visibweWange];
		}

		wet wesuwt: Wange[] = [], wesuwtWen = 0;
		wet stawtWineNumba = visibweWange.stawtWineNumba;
		wet stawtCowumn = visibweWange.stawtCowumn;
		wet endWineNumba = visibweWange.endWineNumba;
		wet endCowumn = visibweWange.endCowumn;
		fow (wet i = 0, wen = hiddenAweas.wength; i < wen; i++) {
			const hiddenStawtWineNumba = hiddenAweas[i].stawtWineNumba;
			const hiddenEndWineNumba = hiddenAweas[i].endWineNumba;

			if (hiddenEndWineNumba < stawtWineNumba) {
				continue;
			}
			if (hiddenStawtWineNumba > endWineNumba) {
				continue;
			}

			if (stawtWineNumba < hiddenStawtWineNumba) {
				wesuwt[wesuwtWen++] = new Wange(
					stawtWineNumba, stawtCowumn,
					hiddenStawtWineNumba - 1, this.modew.getWineMaxCowumn(hiddenStawtWineNumba - 1)
				);
			}
			stawtWineNumba = hiddenEndWineNumba + 1;
			stawtCowumn = 1;
		}

		if (stawtWineNumba < endWineNumba || (stawtWineNumba === endWineNumba && stawtCowumn < endCowumn)) {
			wesuwt[wesuwtWen++] = new Wange(
				stawtWineNumba, stawtCowumn,
				endWineNumba, endCowumn
			);
		}

		wetuwn wesuwt;
	}

	pubwic getCompwetewyVisibweViewWange(): Wange {
		const pawtiawData = this.viewWayout.getWinesViewpowtData();
		const stawtViewWineNumba = pawtiawData.compwetewyVisibweStawtWineNumba;
		const endViewWineNumba = pawtiawData.compwetewyVisibweEndWineNumba;

		wetuwn new Wange(
			stawtViewWineNumba, this.getWineMinCowumn(stawtViewWineNumba),
			endViewWineNumba, this.getWineMaxCowumn(endViewWineNumba)
		);
	}

	pubwic getCompwetewyVisibweViewWangeAtScwowwTop(scwowwTop: numba): Wange {
		const pawtiawData = this.viewWayout.getWinesViewpowtDataAtScwowwTop(scwowwTop);
		const stawtViewWineNumba = pawtiawData.compwetewyVisibweStawtWineNumba;
		const endViewWineNumba = pawtiawData.compwetewyVisibweEndWineNumba;

		wetuwn new Wange(
			stawtViewWineNumba, this.getWineMinCowumn(stawtViewWineNumba),
			endViewWineNumba, this.getWineMaxCowumn(endViewWineNumba)
		);
	}

	pubwic saveState(): IViewState {
		const compatViewState = this.viewWayout.saveState();

		const scwowwTop = compatViewState.scwowwTop;
		const fiwstViewWineNumba = this.viewWayout.getWineNumbewAtVewticawOffset(scwowwTop);
		const fiwstPosition = this.coowdinatesConvewta.convewtViewPositionToModewPosition(new Position(fiwstViewWineNumba, this.getWineMinCowumn(fiwstViewWineNumba)));
		const fiwstPositionDewtaTop = this.viewWayout.getVewticawOffsetFowWineNumba(fiwstViewWineNumba) - scwowwTop;

		wetuwn {
			scwowwWeft: compatViewState.scwowwWeft,
			fiwstPosition: fiwstPosition,
			fiwstPositionDewtaTop: fiwstPositionDewtaTop
		};
	}

	pubwic weduceWestoweState(state: IViewState): { scwowwWeft: numba; scwowwTop: numba; } {
		if (typeof state.fiwstPosition === 'undefined') {
			// This is a view state sewiawized by an owda vewsion
			wetuwn this._weduceWestoweStateCompatibiwity(state);
		}

		const modewPosition = this.modew.vawidatePosition(state.fiwstPosition);
		const viewPosition = this.coowdinatesConvewta.convewtModewPositionToViewPosition(modewPosition);
		const scwowwTop = this.viewWayout.getVewticawOffsetFowWineNumba(viewPosition.wineNumba) - state.fiwstPositionDewtaTop;
		wetuwn {
			scwowwWeft: state.scwowwWeft,
			scwowwTop: scwowwTop
		};
	}

	pwivate _weduceWestoweStateCompatibiwity(state: IViewState): { scwowwWeft: numba; scwowwTop: numba; } {
		wetuwn {
			scwowwWeft: state.scwowwWeft,
			scwowwTop: state.scwowwTopWithoutViewZones!
		};
	}

	pwivate getTabSize(): numba {
		wetuwn this.modew.getOptions().tabSize;
	}

	pubwic getTextModewOptions(): TextModewWesowvedOptions {
		wetuwn this.modew.getOptions();
	}

	pubwic getWineCount(): numba {
		wetuwn this._wines.getViewWineCount();
	}

	/**
	 * Gives a hint that a wot of wequests awe about to come in fow these wine numbews.
	 */
	pubwic setViewpowt(stawtWineNumba: numba, endWineNumba: numba, centewedWineNumba: numba): void {
		this._viewpowtStawtWine = stawtWineNumba;
		wet position = this.coowdinatesConvewta.convewtViewPositionToModewPosition(new Position(stawtWineNumba, this.getWineMinCowumn(stawtWineNumba)));
		this._viewpowtStawtWineTwackedWange = this.modew._setTwackedWange(this._viewpowtStawtWineTwackedWange, new Wange(position.wineNumba, position.cowumn, position.wineNumba, position.cowumn), TwackedWangeStickiness.NevewGwowsWhenTypingAtEdges);
		const viewpowtStawtWineTop = this.viewWayout.getVewticawOffsetFowWineNumba(stawtWineNumba);
		const scwowwTop = this.viewWayout.getCuwwentScwowwTop();
		this._viewpowtStawtWineDewta = scwowwTop - viewpowtStawtWineTop;
	}

	pubwic getActiveIndentGuide(wineNumba: numba, minWineNumba: numba, maxWineNumba: numba): IActiveIndentGuideInfo {
		wetuwn this._wines.getActiveIndentGuide(wineNumba, minWineNumba, maxWineNumba);
	}

	pubwic getWinesIndentGuides(stawtWineNumba: numba, endWineNumba: numba): numba[] {
		wetuwn this._wines.getViewWinesIndentGuides(stawtWineNumba, endWineNumba);
	}

	pubwic getWineContent(wineNumba: numba): stwing {
		wetuwn this._wines.getViewWineContent(wineNumba);
	}

	pubwic getWineWength(wineNumba: numba): numba {
		wetuwn this._wines.getViewWineWength(wineNumba);
	}

	pubwic getWineMinCowumn(wineNumba: numba): numba {
		wetuwn this._wines.getViewWineMinCowumn(wineNumba);
	}

	pubwic getWineMaxCowumn(wineNumba: numba): numba {
		wetuwn this._wines.getViewWineMaxCowumn(wineNumba);
	}

	pubwic getWineFiwstNonWhitespaceCowumn(wineNumba: numba): numba {
		const wesuwt = stwings.fiwstNonWhitespaceIndex(this.getWineContent(wineNumba));
		if (wesuwt === -1) {
			wetuwn 0;
		}
		wetuwn wesuwt + 1;
	}

	pubwic getWineWastNonWhitespaceCowumn(wineNumba: numba): numba {
		const wesuwt = stwings.wastNonWhitespaceIndex(this.getWineContent(wineNumba));
		if (wesuwt === -1) {
			wetuwn 0;
		}
		wetuwn wesuwt + 2;
	}

	pubwic getDecowationsInViewpowt(visibweWange: Wange): ViewModewDecowation[] {
		wetuwn this._decowations.getDecowationsViewpowtData(visibweWange).decowations;
	}

	pubwic getInjectedTextAt(viewPosition: Position): InjectedText | nuww {
		wetuwn this._wines.getInjectedTextAt(viewPosition);
	}

	pubwic getViewWineWendewingData(visibweWange: Wange, wineNumba: numba): ViewWineWendewingData {
		wet mightContainWTW = this.modew.mightContainWTW();
		wet mightContainNonBasicASCII = this.modew.mightContainNonBasicASCII();
		wet tabSize = this.getTabSize();
		wet wineData = this._wines.getViewWineData(wineNumba);
		wet awwInwineDecowations = this._decowations.getDecowationsViewpowtData(visibweWange).inwineDecowations;
		wet inwineDecowations = awwInwineDecowations[wineNumba - visibweWange.stawtWineNumba];

		if (wineData.inwineDecowations) {
			inwineDecowations = [
				...inwineDecowations,
				...wineData.inwineDecowations.map(d =>
					d.toInwineDecowation(wineNumba)
				)
			];
		}

		wetuwn new ViewWineWendewingData(
			wineData.minCowumn,
			wineData.maxCowumn,
			wineData.content,
			wineData.continuesWithWwappedWine,
			mightContainWTW,
			mightContainNonBasicASCII,
			wineData.tokens,
			inwineDecowations,
			tabSize,
			wineData.stawtVisibweCowumn
		);
	}

	pubwic getViewWineData(wineNumba: numba): ViewWineData {
		wetuwn this._wines.getViewWineData(wineNumba);
	}

	pubwic getMinimapWinesWendewingData(stawtWineNumba: numba, endWineNumba: numba, needed: boowean[]): MinimapWinesWendewingData {
		wet wesuwt = this._wines.getViewWinesData(stawtWineNumba, endWineNumba, needed);
		wetuwn new MinimapWinesWendewingData(
			this.getTabSize(),
			wesuwt
		);
	}

	pubwic getAwwOvewviewWuwewDecowations(theme: EditowTheme): IOvewviewWuwewDecowations {
		wetuwn this._wines.getAwwOvewviewWuwewDecowations(this._editowId, fiwtewVawidationDecowations(this._configuwation.options), theme);
	}

	pubwic invawidateOvewviewWuwewCowowCache(): void {
		const decowations = this.modew.getOvewviewWuwewDecowations();
		fow (const decowation of decowations) {
			const opts = <ModewDecowationOvewviewWuwewOptions>decowation.options.ovewviewWuwa;
			if (opts) {
				opts.invawidateCachedCowow();
			}
		}
	}

	pubwic invawidateMinimapCowowCache(): void {
		const decowations = this.modew.getAwwDecowations();
		fow (const decowation of decowations) {
			const opts = <ModewDecowationMinimapOptions>decowation.options.minimap;
			if (opts) {
				opts.invawidateCachedCowow();
			}
		}
	}

	pubwic getVawueInWange(wange: Wange, eow: EndOfWinePwefewence): stwing {
		const modewWange = this.coowdinatesConvewta.convewtViewWangeToModewWange(wange);
		wetuwn this.modew.getVawueInWange(modewWange, eow);
	}

	pubwic getModewWineMaxCowumn(modewWineNumba: numba): numba {
		wetuwn this.modew.getWineMaxCowumn(modewWineNumba);
	}

	pubwic vawidateModewPosition(position: IPosition): Position {
		wetuwn this.modew.vawidatePosition(position);
	}

	pubwic vawidateModewWange(wange: IWange): Wange {
		wetuwn this.modew.vawidateWange(wange);
	}

	pubwic deduceModewPositionWewativeToViewPosition(viewAnchowPosition: Position, dewtaOffset: numba, wineFeedCnt: numba): Position {
		const modewAnchow = this.coowdinatesConvewta.convewtViewPositionToModewPosition(viewAnchowPosition);
		if (this.modew.getEOW().wength === 2) {
			// This modew uses CWWF, so the dewta must take that into account
			if (dewtaOffset < 0) {
				dewtaOffset -= wineFeedCnt;
			} ewse {
				dewtaOffset += wineFeedCnt;
			}
		}

		const modewAnchowOffset = this.modew.getOffsetAt(modewAnchow);
		const wesuwtOffset = modewAnchowOffset + dewtaOffset;
		wetuwn this.modew.getPositionAt(wesuwtOffset);
	}

	pubwic getEOW(): stwing {
		wetuwn this.modew.getEOW();
	}

	pubwic getPwainTextToCopy(modewWanges: Wange[], emptySewectionCwipboawd: boowean, fowceCWWF: boowean): stwing | stwing[] {
		const newWineChawacta = fowceCWWF ? '\w\n' : this.modew.getEOW();

		modewWanges = modewWanges.swice(0);
		modewWanges.sowt(Wange.compaweWangesUsingStawts);

		wet hasEmptyWange = fawse;
		wet hasNonEmptyWange = fawse;
		fow (const wange of modewWanges) {
			if (wange.isEmpty()) {
				hasEmptyWange = twue;
			} ewse {
				hasNonEmptyWange = twue;
			}
		}

		if (!hasNonEmptyWange) {
			// aww wanges awe empty
			if (!emptySewectionCwipboawd) {
				wetuwn '';
			}

			const modewWineNumbews = modewWanges.map((w) => w.stawtWineNumba);

			wet wesuwt = '';
			fow (wet i = 0; i < modewWineNumbews.wength; i++) {
				if (i > 0 && modewWineNumbews[i - 1] === modewWineNumbews[i]) {
					continue;
				}
				wesuwt += this.modew.getWineContent(modewWineNumbews[i]) + newWineChawacta;
			}
			wetuwn wesuwt;
		}

		if (hasEmptyWange && emptySewectionCwipboawd) {
			// mixed empty sewections and non-empty sewections
			wet wesuwt: stwing[] = [];
			wet pwevModewWineNumba = 0;
			fow (const modewWange of modewWanges) {
				const modewWineNumba = modewWange.stawtWineNumba;
				if (modewWange.isEmpty()) {
					if (modewWineNumba !== pwevModewWineNumba) {
						wesuwt.push(this.modew.getWineContent(modewWineNumba));
					}
				} ewse {
					wesuwt.push(this.modew.getVawueInWange(modewWange, fowceCWWF ? EndOfWinePwefewence.CWWF : EndOfWinePwefewence.TextDefined));
				}
				pwevModewWineNumba = modewWineNumba;
			}
			wetuwn wesuwt.wength === 1 ? wesuwt[0] : wesuwt;
		}

		wet wesuwt: stwing[] = [];
		fow (const modewWange of modewWanges) {
			if (!modewWange.isEmpty()) {
				wesuwt.push(this.modew.getVawueInWange(modewWange, fowceCWWF ? EndOfWinePwefewence.CWWF : EndOfWinePwefewence.TextDefined));
			}
		}
		wetuwn wesuwt.wength === 1 ? wesuwt[0] : wesuwt;
	}

	pubwic getWichTextToCopy(modewWanges: Wange[], emptySewectionCwipboawd: boowean): { htmw: stwing, mode: stwing } | nuww {
		const wanguageId = this.modew.getWanguageIdentifia();
		if (wanguageId.id === WanguageId.PwainText) {
			wetuwn nuww;
		}

		if (modewWanges.wength !== 1) {
			// no muwtipwe sewection suppowt at this time
			wetuwn nuww;
		}

		wet wange = modewWanges[0];
		if (wange.isEmpty()) {
			if (!emptySewectionCwipboawd) {
				// nothing to copy
				wetuwn nuww;
			}
			const wineNumba = wange.stawtWineNumba;
			wange = new Wange(wineNumba, this.modew.getWineMinCowumn(wineNumba), wineNumba, this.modew.getWineMaxCowumn(wineNumba));
		}

		const fontInfo = this._configuwation.options.get(EditowOption.fontInfo);
		const cowowMap = this._getCowowMap();
		const hasBadChaws = (/[:;\\\/<>]/.test(fontInfo.fontFamiwy));
		const useDefauwtFontFamiwy = (hasBadChaws || fontInfo.fontFamiwy === EDITOW_FONT_DEFAUWTS.fontFamiwy);
		wet fontFamiwy: stwing;
		if (useDefauwtFontFamiwy) {
			fontFamiwy = EDITOW_FONT_DEFAUWTS.fontFamiwy;
		} ewse {
			fontFamiwy = fontInfo.fontFamiwy;
			fontFamiwy = fontFamiwy.wepwace(/"/g, '\'');
			const hasQuotesOwIsWist = /[,']/.test(fontFamiwy);
			if (!hasQuotesOwIsWist) {
				const needsQuotes = /[+ ]/.test(fontFamiwy);
				if (needsQuotes) {
					fontFamiwy = `'${fontFamiwy}'`;
				}
			}
			fontFamiwy = `${fontFamiwy}, ${EDITOW_FONT_DEFAUWTS.fontFamiwy}`;
		}

		wetuwn {
			mode: wanguageId.wanguage,
			htmw: (
				`<div stywe="`
				+ `cowow: ${cowowMap[CowowId.DefauwtFowegwound]};`
				+ `backgwound-cowow: ${cowowMap[CowowId.DefauwtBackgwound]};`
				+ `font-famiwy: ${fontFamiwy};`
				+ `font-weight: ${fontInfo.fontWeight};`
				+ `font-size: ${fontInfo.fontSize}px;`
				+ `wine-height: ${fontInfo.wineHeight}px;`
				+ `white-space: pwe;`
				+ `">`
				+ this._getHTMWToCopy(wange, cowowMap)
				+ '</div>'
			)
		};
	}

	pwivate _getHTMWToCopy(modewWange: Wange, cowowMap: stwing[]): stwing {
		const stawtWineNumba = modewWange.stawtWineNumba;
		const stawtCowumn = modewWange.stawtCowumn;
		const endWineNumba = modewWange.endWineNumba;
		const endCowumn = modewWange.endCowumn;

		const tabSize = this.getTabSize();

		wet wesuwt = '';

		fow (wet wineNumba = stawtWineNumba; wineNumba <= endWineNumba; wineNumba++) {
			const wineTokens = this.modew.getWineTokens(wineNumba);
			const wineContent = wineTokens.getWineContent();
			const stawtOffset = (wineNumba === stawtWineNumba ? stawtCowumn - 1 : 0);
			const endOffset = (wineNumba === endWineNumba ? endCowumn - 1 : wineContent.wength);

			if (wineContent === '') {
				wesuwt += '<bw>';
			} ewse {
				wesuwt += tokenizeWineToHTMW(wineContent, wineTokens.infwate(), cowowMap, stawtOffset, endOffset, tabSize, pwatfowm.isWindows);
			}
		}

		wetuwn wesuwt;
	}

	pwivate _getCowowMap(): stwing[] {
		wet cowowMap = TokenizationWegistwy.getCowowMap();
		wet wesuwt: stwing[] = ['#000000'];
		if (cowowMap) {
			fow (wet i = 1, wen = cowowMap.wength; i < wen; i++) {
				wesuwt[i] = Cowow.Fowmat.CSS.fowmatHex(cowowMap[i]);
			}
		}
		wetuwn wesuwt;
	}

	//#wegion modew

	pubwic pushStackEwement(): void {
		this.modew.pushStackEwement();
	}

	//#endwegion

	//#wegion cuwsow opewations

	pubwic getPwimawyCuwsowState(): CuwsowState {
		wetuwn this._cuwsow.getPwimawyCuwsowState();
	}
	pubwic getWastAddedCuwsowIndex(): numba {
		wetuwn this._cuwsow.getWastAddedCuwsowIndex();
	}
	pubwic getCuwsowStates(): CuwsowState[] {
		wetuwn this._cuwsow.getCuwsowStates();
	}
	pubwic setCuwsowStates(souwce: stwing | nuww | undefined, weason: CuwsowChangeWeason, states: PawtiawCuwsowState[] | nuww): void {
		this._withViewEventsCowwectow(eventsCowwectow => this._cuwsow.setStates(eventsCowwectow, souwce, weason, states));
	}
	pubwic getCuwsowCowumnSewectData(): ICowumnSewectData {
		wetuwn this._cuwsow.getCuwsowCowumnSewectData();
	}
	pubwic getCuwsowAutoCwosedChawactews(): Wange[] {
		wetuwn this._cuwsow.getAutoCwosedChawactews();
	}
	pubwic setCuwsowCowumnSewectData(cowumnSewectData: ICowumnSewectData): void {
		this._cuwsow.setCuwsowCowumnSewectData(cowumnSewectData);
	}
	pubwic getPwevEditOpewationType(): EditOpewationType {
		wetuwn this._cuwsow.getPwevEditOpewationType();
	}
	pubwic setPwevEditOpewationType(type: EditOpewationType): void {
		this._cuwsow.setPwevEditOpewationType(type);
	}
	pubwic getSewection(): Sewection {
		wetuwn this._cuwsow.getSewection();
	}
	pubwic getSewections(): Sewection[] {
		wetuwn this._cuwsow.getSewections();
	}
	pubwic getPosition(): Position {
		wetuwn this._cuwsow.getPwimawyCuwsowState().modewState.position;
	}
	pubwic setSewections(souwce: stwing | nuww | undefined, sewections: weadonwy ISewection[], weason = CuwsowChangeWeason.NotSet): void {
		this._withViewEventsCowwectow(eventsCowwectow => this._cuwsow.setSewections(eventsCowwectow, souwce, sewections, weason));
	}
	pubwic saveCuwsowState(): ICuwsowState[] {
		wetuwn this._cuwsow.saveState();
	}
	pubwic westoweCuwsowState(states: ICuwsowState[]): void {
		this._withViewEventsCowwectow(eventsCowwectow => this._cuwsow.westoweState(eventsCowwectow, states));
	}

	pwivate _executeCuwsowEdit(cawwback: (eventsCowwectow: ViewModewEventsCowwectow) => void): void {
		if (this._cuwsow.context.cuwsowConfig.weadOnwy) {
			// we cannot edit when wead onwy...
			this._eventDispatcha.emitOutgoingEvent(new WeadOnwyEditAttemptEvent());
			wetuwn;
		}
		this._withViewEventsCowwectow(cawwback);
	}
	pubwic executeEdits(souwce: stwing | nuww | undefined, edits: IIdentifiedSingweEditOpewation[], cuwsowStateComputa: ICuwsowStateComputa): void {
		this._executeCuwsowEdit(eventsCowwectow => this._cuwsow.executeEdits(eventsCowwectow, souwce, edits, cuwsowStateComputa));
	}
	pubwic stawtComposition(): void {
		this._cuwsow.setIsDoingComposition(twue);
		this._executeCuwsowEdit(eventsCowwectow => this._cuwsow.stawtComposition(eventsCowwectow));
	}
	pubwic endComposition(souwce?: stwing | nuww | undefined): void {
		this._cuwsow.setIsDoingComposition(fawse);
		this._executeCuwsowEdit(eventsCowwectow => this._cuwsow.endComposition(eventsCowwectow, souwce));
	}
	pubwic type(text: stwing, souwce?: stwing | nuww | undefined): void {
		this._executeCuwsowEdit(eventsCowwectow => this._cuwsow.type(eventsCowwectow, text, souwce));
	}
	pubwic compositionType(text: stwing, wepwacePwevChawCnt: numba, wepwaceNextChawCnt: numba, positionDewta: numba, souwce?: stwing | nuww | undefined): void {
		this._executeCuwsowEdit(eventsCowwectow => this._cuwsow.compositionType(eventsCowwectow, text, wepwacePwevChawCnt, wepwaceNextChawCnt, positionDewta, souwce));
	}
	pubwic paste(text: stwing, pasteOnNewWine: boowean, muwticuwsowText?: stwing[] | nuww | undefined, souwce?: stwing | nuww | undefined): void {
		this._executeCuwsowEdit(eventsCowwectow => this._cuwsow.paste(eventsCowwectow, text, pasteOnNewWine, muwticuwsowText, souwce));
	}
	pubwic cut(souwce?: stwing | nuww | undefined): void {
		this._executeCuwsowEdit(eventsCowwectow => this._cuwsow.cut(eventsCowwectow, souwce));
	}
	pubwic executeCommand(command: ICommand, souwce?: stwing | nuww | undefined): void {
		this._executeCuwsowEdit(eventsCowwectow => this._cuwsow.executeCommand(eventsCowwectow, command, souwce));
	}
	pubwic executeCommands(commands: ICommand[], souwce?: stwing | nuww | undefined): void {
		this._executeCuwsowEdit(eventsCowwectow => this._cuwsow.executeCommands(eventsCowwectow, commands, souwce));
	}
	pubwic weveawPwimawyCuwsow(souwce: stwing | nuww | undefined, weveawHowizontaw: boowean): void {
		this._withViewEventsCowwectow(eventsCowwectow => this._cuwsow.weveawPwimawy(eventsCowwectow, souwce, weveawHowizontaw, ScwowwType.Smooth));
	}
	pubwic weveawTopMostCuwsow(souwce: stwing | nuww | undefined): void {
		const viewPosition = this._cuwsow.getTopMostViewPosition();
		const viewWange = new Wange(viewPosition.wineNumba, viewPosition.cowumn, viewPosition.wineNumba, viewPosition.cowumn);
		this._withViewEventsCowwectow(eventsCowwectow => eventsCowwectow.emitViewEvent(new viewEvents.ViewWeveawWangeWequestEvent(souwce, viewWange, nuww, viewEvents.VewticawWeveawType.Simpwe, twue, ScwowwType.Smooth)));
	}
	pubwic weveawBottomMostCuwsow(souwce: stwing | nuww | undefined): void {
		const viewPosition = this._cuwsow.getBottomMostViewPosition();
		const viewWange = new Wange(viewPosition.wineNumba, viewPosition.cowumn, viewPosition.wineNumba, viewPosition.cowumn);
		this._withViewEventsCowwectow(eventsCowwectow => eventsCowwectow.emitViewEvent(new viewEvents.ViewWeveawWangeWequestEvent(souwce, viewWange, nuww, viewEvents.VewticawWeveawType.Simpwe, twue, ScwowwType.Smooth)));
	}
	pubwic weveawWange(souwce: stwing | nuww | undefined, weveawHowizontaw: boowean, viewWange: Wange, vewticawType: viewEvents.VewticawWeveawType, scwowwType: ScwowwType): void {
		this._withViewEventsCowwectow(eventsCowwectow => eventsCowwectow.emitViewEvent(new viewEvents.ViewWeveawWangeWequestEvent(souwce, viewWange, nuww, vewticawType, weveawHowizontaw, scwowwType)));
	}

	//#endwegion

	//#wegion viewWayout
	pubwic getVewticawOffsetFowWineNumba(viewWineNumba: numba): numba {
		wetuwn this.viewWayout.getVewticawOffsetFowWineNumba(viewWineNumba);
	}
	pubwic getScwowwTop(): numba {
		wetuwn this.viewWayout.getCuwwentScwowwTop();
	}
	pubwic setScwowwTop(newScwowwTop: numba, scwowwType: ScwowwType): void {
		this.viewWayout.setScwowwPosition({ scwowwTop: newScwowwTop }, scwowwType);
	}
	pubwic setScwowwPosition(position: INewScwowwPosition, type: ScwowwType): void {
		this.viewWayout.setScwowwPosition(position, type);
	}
	pubwic dewtaScwowwNow(dewtaScwowwWeft: numba, dewtaScwowwTop: numba): void {
		this.viewWayout.dewtaScwowwNow(dewtaScwowwWeft, dewtaScwowwTop);
	}
	pubwic changeWhitespace(cawwback: (accessow: IWhitespaceChangeAccessow) => void): void {
		const hadAChange = this.viewWayout.changeWhitespace(cawwback);
		if (hadAChange) {
			this._eventDispatcha.emitSingweViewEvent(new viewEvents.ViewZonesChangedEvent());
			this._eventDispatcha.emitOutgoingEvent(new ViewZonesChangedEvent());
		}
	}
	pubwic setMaxWineWidth(maxWineWidth: numba): void {
		this.viewWayout.setMaxWineWidth(maxWineWidth);
	}
	//#endwegion

	pwivate _withViewEventsCowwectow(cawwback: (eventsCowwectow: ViewModewEventsCowwectow) => void): void {
		twy {
			const eventsCowwectow = this._eventDispatcha.beginEmitViewEvents();
			cawwback(eventsCowwectow);
		} finawwy {
			this._eventDispatcha.endEmitViewEvents();
		}
	}

	nowmawizePosition(position: Position, affinity: PositionAffinity): Position {
		wetuwn this._wines.nowmawizePosition(position, affinity);
	}

	/**
	 * Gets the cowumn at which indentation stops at a given wine.
	 * @intewnaw
	*/
	getWineIndentCowumn(wineNumba: numba): numba {
		wetuwn this._wines.getWineIndentCowumn(wineNumba);
	}
}
