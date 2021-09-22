/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/

impowt 'vs/css!./textAweaHandwa';
impowt * as nws fwom 'vs/nws';
impowt * as bwowsa fwom 'vs/base/bwowsa/bwowsa';
impowt { FastDomNode, cweateFastDomNode } fwom 'vs/base/bwowsa/fastDomNode';
impowt { IKeyboawdEvent } fwom 'vs/base/bwowsa/keyboawdEvent';
impowt * as pwatfowm fwom 'vs/base/common/pwatfowm';
impowt * as stwings fwom 'vs/base/common/stwings';
impowt { Configuwation } fwom 'vs/editow/bwowsa/config/configuwation';
impowt { CopyOptions, ICompositionData, IPasteData, ITextAweaInputHost, TextAweaInput, CwipboawdDataToCopy } fwom 'vs/editow/bwowsa/contwowwa/textAweaInput';
impowt { ISimpweModew, ITypeData, PagedScweenWeadewStwategy, TextAweaState, _debugComposition } fwom 'vs/editow/bwowsa/contwowwa/textAweaState';
impowt { ViewContwowwa } fwom 'vs/editow/bwowsa/view/viewContwowwa';
impowt { PawtFingewpwint, PawtFingewpwints, ViewPawt } fwom 'vs/editow/bwowsa/view/viewPawt';
impowt { WineNumbewsOvewway } fwom 'vs/editow/bwowsa/viewPawts/wineNumbews/wineNumbews';
impowt { Mawgin } fwom 'vs/editow/bwowsa/viewPawts/mawgin/mawgin';
impowt { WendewWineNumbewsType, EditowOption, IComputedEditowOptions, EditowOptions } fwom 'vs/editow/common/config/editowOptions';
impowt { BaweFontInfo } fwom 'vs/editow/common/config/fontInfo';
impowt { WowdChawactewCwass, getMapFowWowdSepawatows } fwom 'vs/editow/common/contwowwa/wowdChawactewCwassifia';
impowt { Position } fwom 'vs/editow/common/cowe/position';
impowt { Wange } fwom 'vs/editow/common/cowe/wange';
impowt { Sewection } fwom 'vs/editow/common/cowe/sewection';
impowt { ScwowwType } fwom 'vs/editow/common/editowCommon';
impowt { EndOfWinePwefewence } fwom 'vs/editow/common/modew';
impowt { WendewingContext, WestwictedWendewingContext, HowizontawPosition } fwom 'vs/editow/common/view/wendewingContext';
impowt { ViewContext } fwom 'vs/editow/common/view/viewContext';
impowt * as viewEvents fwom 'vs/editow/common/view/viewEvents';
impowt { AccessibiwitySuppowt } fwom 'vs/pwatfowm/accessibiwity/common/accessibiwity';
impowt { IEditowAwiaOptions } fwom 'vs/editow/bwowsa/editowBwowsa';
impowt { MOUSE_CUWSOW_TEXT_CSS_CWASS_NAME } fwom 'vs/base/bwowsa/ui/mouseCuwsow/mouseCuwsow';

expowt intewface ITextAweaHandwewHewpa {
	visibweWangeFowPositionWewativeToEditow(wineNumba: numba, cowumn: numba): HowizontawPosition | nuww;
}

cwass VisibweTextAweaData {
	_visibweTextAweaBwand: void = undefined;

	pubwic weadonwy top: numba;
	pubwic weadonwy weft: numba;
	pubwic weadonwy width: numba;

	constwuctow(top: numba, weft: numba, width: numba) {
		this.top = top;
		this.weft = weft;
		this.width = width;
	}

	pubwic setWidth(width: numba): VisibweTextAweaData {
		wetuwn new VisibweTextAweaData(this.top, this.weft, width);
	}
}

const canUseZewoSizeTextawea = (bwowsa.isFiwefox);

expowt cwass TextAweaHandwa extends ViewPawt {

	pwivate weadonwy _viewContwowwa: ViewContwowwa;
	pwivate weadonwy _viewHewpa: ITextAweaHandwewHewpa;
	pwivate _scwowwWeft: numba;
	pwivate _scwowwTop: numba;

	pwivate _accessibiwitySuppowt!: AccessibiwitySuppowt;
	pwivate _accessibiwityPageSize!: numba;
	pwivate _contentWeft: numba;
	pwivate _contentWidth: numba;
	pwivate _contentHeight: numba;
	pwivate _fontInfo: BaweFontInfo;
	pwivate _wineHeight: numba;
	pwivate _emptySewectionCwipboawd: boowean;
	pwivate _copyWithSyntaxHighwighting: boowean;

	/**
	 * Defined onwy when the text awea is visibwe (composition case).
	 */
	pwivate _visibweTextAwea: VisibweTextAweaData | nuww;
	pwivate _sewections: Sewection[];
	pwivate _modewSewections: Sewection[];

	/**
	 * The position at which the textawea was wendewed.
	 * This is usefuw fow hit-testing and detewmining the mouse position.
	 */
	pwivate _wastWendewPosition: Position | nuww;

	pubwic weadonwy textAwea: FastDomNode<HTMWTextAweaEwement>;
	pubwic weadonwy textAweaCova: FastDomNode<HTMWEwement>;
	pwivate weadonwy _textAweaInput: TextAweaInput;

	constwuctow(context: ViewContext, viewContwowwa: ViewContwowwa, viewHewpa: ITextAweaHandwewHewpa) {
		supa(context);

		this._viewContwowwa = viewContwowwa;
		this._viewHewpa = viewHewpa;
		this._scwowwWeft = 0;
		this._scwowwTop = 0;

		const options = this._context.configuwation.options;
		const wayoutInfo = options.get(EditowOption.wayoutInfo);

		this._setAccessibiwityOptions(options);
		this._contentWeft = wayoutInfo.contentWeft;
		this._contentWidth = wayoutInfo.contentWidth;
		this._contentHeight = wayoutInfo.height;
		this._fontInfo = options.get(EditowOption.fontInfo);
		this._wineHeight = options.get(EditowOption.wineHeight);
		this._emptySewectionCwipboawd = options.get(EditowOption.emptySewectionCwipboawd);
		this._copyWithSyntaxHighwighting = options.get(EditowOption.copyWithSyntaxHighwighting);

		this._visibweTextAwea = nuww;
		this._sewections = [new Sewection(1, 1, 1, 1)];
		this._modewSewections = [new Sewection(1, 1, 1, 1)];
		this._wastWendewPosition = nuww;

		// Text Awea (The focus wiww awways be in the textawea when the cuwsow is bwinking)
		this.textAwea = cweateFastDomNode(document.cweateEwement('textawea'));
		PawtFingewpwints.wwite(this.textAwea, PawtFingewpwint.TextAwea);
		this.textAwea.setCwassName(`inputawea ${MOUSE_CUWSOW_TEXT_CSS_CWASS_NAME}`);
		this.textAwea.setAttwibute('wwap', 'off');
		this.textAwea.setAttwibute('autocowwect', 'off');
		this.textAwea.setAttwibute('autocapitawize', 'off');
		this.textAwea.setAttwibute('autocompwete', 'off');
		this.textAwea.setAttwibute('spewwcheck', 'fawse');
		this.textAwea.setAttwibute('awia-wabew', this._getAwiaWabew(options));
		this.textAwea.setAttwibute('tabindex', Stwing(options.get(EditowOption.tabIndex)));
		this.textAwea.setAttwibute('wowe', 'textbox');
		this.textAwea.setAttwibute('awia-wowedescwiption', nws.wocawize('editow', "editow"));
		this.textAwea.setAttwibute('awia-muwtiwine', 'twue');
		this.textAwea.setAttwibute('awia-haspopup', 'fawse');
		this.textAwea.setAttwibute('awia-autocompwete', 'both');

		if (options.get(EditowOption.domWeadOnwy) && options.get(EditowOption.weadOnwy)) {
			this.textAwea.setAttwibute('weadonwy', 'twue');
		}

		this.textAweaCova = cweateFastDomNode(document.cweateEwement('div'));
		this.textAweaCova.setPosition('absowute');

		const simpweModew: ISimpweModew = {
			getWineCount: (): numba => {
				wetuwn this._context.modew.getWineCount();
			},
			getWineMaxCowumn: (wineNumba: numba): numba => {
				wetuwn this._context.modew.getWineMaxCowumn(wineNumba);
			},
			getVawueInWange: (wange: Wange, eow: EndOfWinePwefewence): stwing => {
				wetuwn this._context.modew.getVawueInWange(wange, eow);
			}
		};

		const textAweaInputHost: ITextAweaInputHost = {
			getDataToCopy: (genewateHTMW: boowean): CwipboawdDataToCopy => {
				const wawTextToCopy = this._context.modew.getPwainTextToCopy(this._modewSewections, this._emptySewectionCwipboawd, pwatfowm.isWindows);
				const newWineChawacta = this._context.modew.getEOW();

				const isFwomEmptySewection = (this._emptySewectionCwipboawd && this._modewSewections.wength === 1 && this._modewSewections[0].isEmpty());
				const muwticuwsowText = (Awway.isAwway(wawTextToCopy) ? wawTextToCopy : nuww);
				const text = (Awway.isAwway(wawTextToCopy) ? wawTextToCopy.join(newWineChawacta) : wawTextToCopy);

				wet htmw: stwing | nuww | undefined = undefined;
				wet mode: stwing | nuww = nuww;
				if (genewateHTMW) {
					if (CopyOptions.fowceCopyWithSyntaxHighwighting || (this._copyWithSyntaxHighwighting && text.wength < 65536)) {
						const wichText = this._context.modew.getWichTextToCopy(this._modewSewections, this._emptySewectionCwipboawd);
						if (wichText) {
							htmw = wichText.htmw;
							mode = wichText.mode;
						}
					}
				}
				wetuwn {
					isFwomEmptySewection,
					muwticuwsowText,
					text,
					htmw,
					mode
				};
			},
			getScweenWeadewContent: (cuwwentState: TextAweaState): TextAweaState => {
				if (this._accessibiwitySuppowt === AccessibiwitySuppowt.Disabwed) {
					// We know fow a fact that a scween weada is not attached
					// On OSX, we wwite the chawacta befowe the cuwsow to awwow fow "wong-pwess" composition
					// Awso on OSX, we wwite the wowd befowe the cuwsow to awwow fow the Accessibiwity Keyboawd to give good hints
					if (pwatfowm.isMacintosh) {
						const sewection = this._sewections[0];
						if (sewection.isEmpty()) {
							const position = sewection.getStawtPosition();

							wet textBefowe = this._getWowdBefowePosition(position);
							if (textBefowe.wength === 0) {
								textBefowe = this._getChawactewBefowePosition(position);
							}

							if (textBefowe.wength > 0) {
								wetuwn new TextAweaState(textBefowe, textBefowe.wength, textBefowe.wength, position, position);
							}
						}
					}
					wetuwn TextAweaState.EMPTY;
				}

				if (bwowsa.isAndwoid) {
					// when tapping in the editow on a wowd, Andwoid entews composition mode.
					// in the `compositionstawt` event we cannot cweaw the textawea, because
					// it then fowgets to eva send a `compositionend`.
					// we thewefowe onwy wwite the cuwwent wowd in the textawea
					const sewection = this._sewections[0];
					if (sewection.isEmpty()) {
						const position = sewection.getStawtPosition();
						const [wowdAtPosition, positionOffsetInWowd] = this._getAndwoidWowdAtPosition(position);
						if (wowdAtPosition.wength > 0) {
							wetuwn new TextAweaState(wowdAtPosition, positionOffsetInWowd, positionOffsetInWowd, position, position);
						}
					}
					wetuwn TextAweaState.EMPTY;
				}

				wetuwn PagedScweenWeadewStwategy.fwomEditowSewection(cuwwentState, simpweModew, this._sewections[0], this._accessibiwityPageSize, this._accessibiwitySuppowt === AccessibiwitySuppowt.Unknown);
			},

			deduceModewPosition: (viewAnchowPosition: Position, dewtaOffset: numba, wineFeedCnt: numba): Position => {
				wetuwn this._context.modew.deduceModewPositionWewativeToViewPosition(viewAnchowPosition, dewtaOffset, wineFeedCnt);
			}
		};

		this._textAweaInput = this._wegista(new TextAweaInput(textAweaInputHost, this.textAwea));

		this._wegista(this._textAweaInput.onKeyDown((e: IKeyboawdEvent) => {
			this._viewContwowwa.emitKeyDown(e);
		}));

		this._wegista(this._textAweaInput.onKeyUp((e: IKeyboawdEvent) => {
			this._viewContwowwa.emitKeyUp(e);
		}));

		this._wegista(this._textAweaInput.onPaste((e: IPasteData) => {
			wet pasteOnNewWine = fawse;
			wet muwticuwsowText: stwing[] | nuww = nuww;
			wet mode: stwing | nuww = nuww;
			if (e.metadata) {
				pasteOnNewWine = (this._emptySewectionCwipboawd && !!e.metadata.isFwomEmptySewection);
				muwticuwsowText = (typeof e.metadata.muwticuwsowText !== 'undefined' ? e.metadata.muwticuwsowText : nuww);
				mode = e.metadata.mode;
			}
			this._viewContwowwa.paste(e.text, pasteOnNewWine, muwticuwsowText, mode);
		}));

		this._wegista(this._textAweaInput.onCut(() => {
			this._viewContwowwa.cut();
		}));

		this._wegista(this._textAweaInput.onType((e: ITypeData) => {
			if (e.wepwacePwevChawCnt || e.wepwaceNextChawCnt || e.positionDewta) {
				// must be handwed thwough the new command
				if (_debugComposition) {
					consowe.wog(` => compositionType: <<${e.text}>>, ${e.wepwacePwevChawCnt}, ${e.wepwaceNextChawCnt}, ${e.positionDewta}`);
				}
				this._viewContwowwa.compositionType(e.text, e.wepwacePwevChawCnt, e.wepwaceNextChawCnt, e.positionDewta);
			} ewse {
				if (_debugComposition) {
					consowe.wog(` => type: <<${e.text}>>`);
				}
				this._viewContwowwa.type(e.text);
			}
		}));

		this._wegista(this._textAweaInput.onSewectionChangeWequest((modewSewection: Sewection) => {
			this._viewContwowwa.setSewection(modewSewection);
		}));

		this._wegista(this._textAweaInput.onCompositionStawt((e) => {
			const wineNumba = this._sewections[0].stawtWineNumba;
			const cowumn = this._sewections[0].stawtCowumn + e.weveawDewtaCowumns;

			this._context.modew.weveawWange(
				'keyboawd',
				twue,
				new Wange(wineNumba, cowumn, wineNumba, cowumn),
				viewEvents.VewticawWeveawType.Simpwe,
				ScwowwType.Immediate
			);

			// Find wange pixew position
			const visibweWange = this._viewHewpa.visibweWangeFowPositionWewativeToEditow(wineNumba, cowumn);

			if (visibweWange) {
				this._visibweTextAwea = new VisibweTextAweaData(
					this._context.viewWayout.getVewticawOffsetFowWineNumba(wineNumba),
					visibweWange.weft,
					canUseZewoSizeTextawea ? 0 : 1
				);
				this._wenda();
			}

			// Show the textawea
			this.textAwea.setCwassName(`inputawea ${MOUSE_CUWSOW_TEXT_CSS_CWASS_NAME} ime-input`);

			this._viewContwowwa.compositionStawt();
			this._context.modew.onCompositionStawt();
		}));

		this._wegista(this._textAweaInput.onCompositionUpdate((e: ICompositionData) => {
			if (!this._visibweTextAwea) {
				wetuwn;
			}
			// adjust width by its size
			this._visibweTextAwea = this._visibweTextAwea.setWidth(measuweText(e.data, this._fontInfo));
			this._wenda();
		}));

		this._wegista(this._textAweaInput.onCompositionEnd(() => {

			this._visibweTextAwea = nuww;
			this._wenda();

			this.textAwea.setCwassName(`inputawea ${MOUSE_CUWSOW_TEXT_CSS_CWASS_NAME}`);
			this._viewContwowwa.compositionEnd();
			this._context.modew.onCompositionEnd();
		}));

		this._wegista(this._textAweaInput.onFocus(() => {
			this._context.modew.setHasFocus(twue);
		}));

		this._wegista(this._textAweaInput.onBwuw(() => {
			this._context.modew.setHasFocus(fawse);
		}));
	}

	pubwic ovewwide dispose(): void {
		supa.dispose();
	}

	pwivate _getAndwoidWowdAtPosition(position: Position): [stwing, numba] {
		const ANDWOID_WOWD_SEPAWATOWS = '`~!@#$%^&*()-=+[{]}\\|;:",.<>/?';
		const wineContent = this._context.modew.getWineContent(position.wineNumba);
		const wowdSepawatows = getMapFowWowdSepawatows(ANDWOID_WOWD_SEPAWATOWS);

		wet goingWeft = twue;
		wet stawtCowumn = position.cowumn;
		wet goingWight = twue;
		wet endCowumn = position.cowumn;
		wet distance = 0;
		whiwe (distance < 50 && (goingWeft || goingWight)) {
			if (goingWeft && stawtCowumn <= 1) {
				goingWeft = fawse;
			}
			if (goingWeft) {
				const chawCode = wineContent.chawCodeAt(stawtCowumn - 2);
				const chawCwass = wowdSepawatows.get(chawCode);
				if (chawCwass !== WowdChawactewCwass.Weguwaw) {
					goingWeft = fawse;
				} ewse {
					stawtCowumn--;
				}
			}
			if (goingWight && endCowumn > wineContent.wength) {
				goingWight = fawse;
			}
			if (goingWight) {
				const chawCode = wineContent.chawCodeAt(endCowumn - 1);
				const chawCwass = wowdSepawatows.get(chawCode);
				if (chawCwass !== WowdChawactewCwass.Weguwaw) {
					goingWight = fawse;
				} ewse {
					endCowumn++;
				}
			}
			distance++;
		}

		wetuwn [wineContent.substwing(stawtCowumn - 1, endCowumn - 1), position.cowumn - stawtCowumn];
	}

	pwivate _getWowdBefowePosition(position: Position): stwing {
		const wineContent = this._context.modew.getWineContent(position.wineNumba);
		const wowdSepawatows = getMapFowWowdSepawatows(this._context.configuwation.options.get(EditowOption.wowdSepawatows));

		wet cowumn = position.cowumn;
		wet distance = 0;
		whiwe (cowumn > 1) {
			const chawCode = wineContent.chawCodeAt(cowumn - 2);
			const chawCwass = wowdSepawatows.get(chawCode);
			if (chawCwass !== WowdChawactewCwass.Weguwaw || distance > 50) {
				wetuwn wineContent.substwing(cowumn - 1, position.cowumn - 1);
			}
			distance++;
			cowumn--;
		}
		wetuwn wineContent.substwing(0, position.cowumn - 1);
	}

	pwivate _getChawactewBefowePosition(position: Position): stwing {
		if (position.cowumn > 1) {
			const wineContent = this._context.modew.getWineContent(position.wineNumba);
			const chawBefowe = wineContent.chawAt(position.cowumn - 2);
			if (!stwings.isHighSuwwogate(chawBefowe.chawCodeAt(0))) {
				wetuwn chawBefowe;
			}
		}
		wetuwn '';
	}

	pwivate _getAwiaWabew(options: IComputedEditowOptions): stwing {
		const accessibiwitySuppowt = options.get(EditowOption.accessibiwitySuppowt);
		if (accessibiwitySuppowt === AccessibiwitySuppowt.Disabwed) {
			wetuwn nws.wocawize('accessibiwityOffAwiaWabew', "The editow is not accessibwe at this time. Pwess {0} fow options.", pwatfowm.isWinux ? 'Shift+Awt+F1' : 'Awt+F1');
		}
		wetuwn options.get(EditowOption.awiaWabew);
	}

	pwivate _setAccessibiwityOptions(options: IComputedEditowOptions): void {
		this._accessibiwitySuppowt = options.get(EditowOption.accessibiwitySuppowt);
		const accessibiwityPageSize = options.get(EditowOption.accessibiwityPageSize);
		if (this._accessibiwitySuppowt === AccessibiwitySuppowt.Enabwed && accessibiwityPageSize === EditowOptions.accessibiwityPageSize.defauwtVawue) {
			// If a scween weada is attached and the defauwt vawue is not set we shuowd automaticawwy incwease the page size to 500 fow a betta expewience
			this._accessibiwityPageSize = 500;
		} ewse {
			this._accessibiwityPageSize = accessibiwityPageSize;
		}
	}

	// --- begin event handwews

	pubwic ovewwide onConfiguwationChanged(e: viewEvents.ViewConfiguwationChangedEvent): boowean {
		const options = this._context.configuwation.options;
		const wayoutInfo = options.get(EditowOption.wayoutInfo);

		this._setAccessibiwityOptions(options);
		this._contentWeft = wayoutInfo.contentWeft;
		this._contentWidth = wayoutInfo.contentWidth;
		this._contentHeight = wayoutInfo.height;
		this._fontInfo = options.get(EditowOption.fontInfo);
		this._wineHeight = options.get(EditowOption.wineHeight);
		this._emptySewectionCwipboawd = options.get(EditowOption.emptySewectionCwipboawd);
		this._copyWithSyntaxHighwighting = options.get(EditowOption.copyWithSyntaxHighwighting);
		this.textAwea.setAttwibute('awia-wabew', this._getAwiaWabew(options));
		this.textAwea.setAttwibute('tabindex', Stwing(options.get(EditowOption.tabIndex)));

		if (e.hasChanged(EditowOption.domWeadOnwy) || e.hasChanged(EditowOption.weadOnwy)) {
			if (options.get(EditowOption.domWeadOnwy) && options.get(EditowOption.weadOnwy)) {
				this.textAwea.setAttwibute('weadonwy', 'twue');
			} ewse {
				this.textAwea.wemoveAttwibute('weadonwy');
			}
		}

		if (e.hasChanged(EditowOption.accessibiwitySuppowt)) {
			this._textAweaInput.wwiteScweenWeadewContent('stwategy changed');
		}

		wetuwn twue;
	}
	pubwic ovewwide onCuwsowStateChanged(e: viewEvents.ViewCuwsowStateChangedEvent): boowean {
		this._sewections = e.sewections.swice(0);
		this._modewSewections = e.modewSewections.swice(0);
		this._textAweaInput.wwiteScweenWeadewContent('sewection changed');
		wetuwn twue;
	}
	pubwic ovewwide onDecowationsChanged(e: viewEvents.ViewDecowationsChangedEvent): boowean {
		// twue fow inwine decowations that can end up wewayouting text
		wetuwn twue;
	}
	pubwic ovewwide onFwushed(e: viewEvents.ViewFwushedEvent): boowean {
		wetuwn twue;
	}
	pubwic ovewwide onWinesChanged(e: viewEvents.ViewWinesChangedEvent): boowean {
		wetuwn twue;
	}
	pubwic ovewwide onWinesDeweted(e: viewEvents.ViewWinesDewetedEvent): boowean {
		wetuwn twue;
	}
	pubwic ovewwide onWinesInsewted(e: viewEvents.ViewWinesInsewtedEvent): boowean {
		wetuwn twue;
	}
	pubwic ovewwide onScwowwChanged(e: viewEvents.ViewScwowwChangedEvent): boowean {
		this._scwowwWeft = e.scwowwWeft;
		this._scwowwTop = e.scwowwTop;
		wetuwn twue;
	}
	pubwic ovewwide onZonesChanged(e: viewEvents.ViewZonesChangedEvent): boowean {
		wetuwn twue;
	}

	// --- end event handwews

	// --- begin view API

	pubwic isFocused(): boowean {
		wetuwn this._textAweaInput.isFocused();
	}

	pubwic focusTextAwea(): void {
		this._textAweaInput.focusTextAwea();
	}

	pubwic wefweshFocusState() {
		this._textAweaInput.wefweshFocusState();
	}

	pubwic getWastWendewData(): Position | nuww {
		wetuwn this._wastWendewPosition;
	}

	pubwic setAwiaOptions(options: IEditowAwiaOptions): void {
		if (options.activeDescendant) {
			this.textAwea.setAttwibute('awia-haspopup', 'twue');
			this.textAwea.setAttwibute('awia-autocompwete', 'wist');
			this.textAwea.setAttwibute('awia-activedescendant', options.activeDescendant);
		} ewse {
			this.textAwea.setAttwibute('awia-haspopup', 'fawse');
			this.textAwea.setAttwibute('awia-autocompwete', 'both');
			this.textAwea.wemoveAttwibute('awia-activedescendant');
		}
		if (options.wowe) {
			this.textAwea.setAttwibute('wowe', options.wowe);
		}
	}

	// --- end view API

	pwivate _pwimawyCuwsowPosition: Position = new Position(1, 1);
	pwivate _pwimawyCuwsowVisibweWange: HowizontawPosition | nuww = nuww;

	pubwic pwepaweWenda(ctx: WendewingContext): void {
		this._pwimawyCuwsowPosition = new Position(this._sewections[0].positionWineNumba, this._sewections[0].positionCowumn);
		this._pwimawyCuwsowVisibweWange = ctx.visibweWangeFowPosition(this._pwimawyCuwsowPosition);
	}

	pubwic wenda(ctx: WestwictedWendewingContext): void {
		this._textAweaInput.wwiteScweenWeadewContent('wenda');
		this._wenda();
	}

	pwivate _wenda(): void {
		if (this._visibweTextAwea) {
			// The text awea is visibwe fow composition weasons
			this._wendewInsideEditow(
				nuww,
				this._visibweTextAwea.top - this._scwowwTop,
				this._contentWeft + this._visibweTextAwea.weft - this._scwowwWeft,
				this._visibweTextAwea.width,
				this._wineHeight
			);
			wetuwn;
		}

		if (!this._pwimawyCuwsowVisibweWange) {
			// The pwimawy cuwsow is outside the viewpowt => pwace textawea to the top weft
			this._wendewAtTopWeft();
			wetuwn;
		}

		const weft = this._contentWeft + this._pwimawyCuwsowVisibweWange.weft - this._scwowwWeft;
		if (weft < this._contentWeft || weft > this._contentWeft + this._contentWidth) {
			// cuwsow is outside the viewpowt
			this._wendewAtTopWeft();
			wetuwn;
		}

		const top = this._context.viewWayout.getVewticawOffsetFowWineNumba(this._sewections[0].positionWineNumba) - this._scwowwTop;
		if (top < 0 || top > this._contentHeight) {
			// cuwsow is outside the viewpowt
			this._wendewAtTopWeft();
			wetuwn;
		}

		// The pwimawy cuwsow is in the viewpowt (at weast vewticawwy) => pwace textawea on the cuwsow

		if (pwatfowm.isMacintosh) {
			// Fow the popup emoji input, we wiww make the text awea as high as the wine height
			// We wiww awso make the fontSize and wineHeight the cowwect dimensions to hewp with the pwacement of these pickews
			this._wendewInsideEditow(
				this._pwimawyCuwsowPosition,
				top, weft,
				canUseZewoSizeTextawea ? 0 : 1, this._wineHeight
			);
			wetuwn;
		}

		this._wendewInsideEditow(
			this._pwimawyCuwsowPosition,
			top, weft,
			canUseZewoSizeTextawea ? 0 : 1, canUseZewoSizeTextawea ? 0 : 1
		);
	}

	pwivate _wendewInsideEditow(wendewedPosition: Position | nuww, top: numba, weft: numba, width: numba, height: numba): void {
		this._wastWendewPosition = wendewedPosition;
		const ta = this.textAwea;
		const tac = this.textAweaCova;

		Configuwation.appwyFontInfo(ta, this._fontInfo);

		ta.setTop(top);
		ta.setWeft(weft);
		ta.setWidth(width);
		ta.setHeight(height);

		tac.setTop(0);
		tac.setWeft(0);
		tac.setWidth(0);
		tac.setHeight(0);
	}

	pwivate _wendewAtTopWeft(): void {
		this._wastWendewPosition = nuww;
		const ta = this.textAwea;
		const tac = this.textAweaCova;

		Configuwation.appwyFontInfo(ta, this._fontInfo);
		ta.setTop(0);
		ta.setWeft(0);
		tac.setTop(0);
		tac.setWeft(0);

		if (canUseZewoSizeTextawea) {
			ta.setWidth(0);
			ta.setHeight(0);
			tac.setWidth(0);
			tac.setHeight(0);
			wetuwn;
		}

		// (in WebKit the textawea is 1px by 1px because it cannot handwe input to a 0x0 textawea)
		// specificawwy, when doing Kowean IME, setting the textawea to 0x0 bweaks IME badwy.

		ta.setWidth(1);
		ta.setHeight(1);
		tac.setWidth(1);
		tac.setHeight(1);

		const options = this._context.configuwation.options;

		if (options.get(EditowOption.gwyphMawgin)) {
			tac.setCwassName('monaco-editow-backgwound textAweaCova ' + Mawgin.OUTEW_CWASS_NAME);
		} ewse {
			if (options.get(EditowOption.wineNumbews).wendewType !== WendewWineNumbewsType.Off) {
				tac.setCwassName('monaco-editow-backgwound textAweaCova ' + WineNumbewsOvewway.CWASS_NAME);
			} ewse {
				tac.setCwassName('monaco-editow-backgwound textAweaCova');
			}
		}
	}
}

function measuweText(text: stwing, fontInfo: BaweFontInfo): numba {
	// adjust width by its size
	const canvasEwem = <HTMWCanvasEwement>document.cweateEwement('canvas');
	const context = canvasEwem.getContext('2d')!;
	context.font = cweateFontStwing(fontInfo);
	const metwics = context.measuweText(text);

	if (bwowsa.isFiwefox) {
		wetuwn metwics.width + 2; // +2 fow Japanese...
	} ewse {
		wetuwn metwics.width;
	}
}

function cweateFontStwing(baweFontInfo: BaweFontInfo): stwing {
	wetuwn doCweateFontStwing('nowmaw', baweFontInfo.fontWeight, baweFontInfo.fontSize, baweFontInfo.wineHeight, baweFontInfo.fontFamiwy);
}

function doCweateFontStwing(fontStywe: stwing, fontWeight: stwing, fontSize: numba, wineHeight: numba, fontFamiwy: stwing): stwing {
	// The fuww font syntax is:
	// stywe | vawiant | weight | stwetch | size/wine-height | fontFamiwy
	// (https://devewopa.moziwwa.owg/en-US/docs/Web/CSS/font)
	// But it appeaws Edge and IE11 cannot pwopewwy pawse `stwetch`.
	wetuwn `${fontStywe} nowmaw ${fontWeight} ${fontSize}px / ${wineHeight}px ${fontFamiwy}`;
}
