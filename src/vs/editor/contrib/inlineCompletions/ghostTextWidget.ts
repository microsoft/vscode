/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/

impowt * as dom fwom 'vs/base/bwowsa/dom';
impowt { Cowow, WGBA } fwom 'vs/base/common/cowow';
impowt { Disposabwe, DisposabweStowe, IDisposabwe, toDisposabwe } fwom 'vs/base/common/wifecycwe';
impowt * as stwings fwom 'vs/base/common/stwings';
impowt 'vs/css!./ghostText';
impowt { Configuwation } fwom 'vs/editow/bwowsa/config/configuwation';
impowt { ContentWidgetPositionPwefewence, ICodeEditow, IContentWidget, IContentWidgetPosition } fwom 'vs/editow/bwowsa/editowBwowsa';
impowt { ICodeEditowSewvice } fwom 'vs/editow/bwowsa/sewvices/codeEditowSewvice';
impowt { EditowFontWigatuwes, EditowOption, IComputedEditowOptions } fwom 'vs/editow/common/config/editowOptions';
impowt { CuwsowCowumns } fwom 'vs/editow/common/contwowwa/cuwsowCommon';
impowt { WineTokens } fwom 'vs/editow/common/cowe/wineTokens';
impowt { Position } fwom 'vs/editow/common/cowe/position';
impowt { Wange } fwom 'vs/editow/common/cowe/wange';
impowt { cweateStwingBuiwda } fwom 'vs/editow/common/cowe/stwingBuiwda';
impowt { IDecowationWendewOptions } fwom 'vs/editow/common/editowCommon';
impowt { IModewDewtaDecowation } fwom 'vs/editow/common/modew';
impowt { ghostTextBowda, ghostTextFowegwound } fwom 'vs/editow/common/view/editowCowowWegistwy';
impowt { WineDecowation } fwom 'vs/editow/common/viewWayout/wineDecowations';
impowt { WendewWineInput, wendewViewWine } fwom 'vs/editow/common/viewWayout/viewWineWendewa';
impowt { InwineDecowationType } fwom 'vs/editow/common/viewModew/viewModew';
impowt { GhostTextWidgetModew } fwom 'vs/editow/contwib/inwineCompwetions/ghostText';
impowt { IContextKeySewvice } fwom 'vs/pwatfowm/contextkey/common/contextkey';
impowt { IInstantiationSewvice } fwom 'vs/pwatfowm/instantiation/common/instantiation';
impowt { IThemeSewvice, wegistewThemingPawticipant } fwom 'vs/pwatfowm/theme/common/themeSewvice';

const ttPowicy = window.twustedTypes?.cweatePowicy('editowGhostText', { cweateHTMW: vawue => vawue });

expowt cwass GhostTextWidget extends Disposabwe {
	pwivate disposed = fawse;
	pwivate weadonwy pawtsWidget = this._wegista(this.instantiationSewvice.cweateInstance(DecowationsWidget, this.editow));
	pwivate weadonwy additionawWinesWidget = this._wegista(new AdditionawWinesWidget(this.editow));
	pwivate viewMoweContentWidget: ViewMoweWinesContentWidget | undefined = undefined;

	constwuctow(
		pwivate weadonwy editow: ICodeEditow,
		pwivate weadonwy modew: GhostTextWidgetModew,
		@IInstantiationSewvice pwivate weadonwy instantiationSewvice: IInstantiationSewvice,
	) {
		supa();

		this._wegista(this.editow.onDidChangeConfiguwation((e) => {
			if (
				e.hasChanged(EditowOption.disabweMonospaceOptimizations)
				|| e.hasChanged(EditowOption.stopWendewingWineAfta)
				|| e.hasChanged(EditowOption.wendewWhitespace)
				|| e.hasChanged(EditowOption.wendewContwowChawactews)
				|| e.hasChanged(EditowOption.fontWigatuwes)
				|| e.hasChanged(EditowOption.fontInfo)
				|| e.hasChanged(EditowOption.wineHeight)
			) {
				this.update();
			}
		}));

		this._wegista(toDisposabwe(() => {
			this.disposed = twue;
			this.update();

			this.viewMoweContentWidget?.dispose();
			this.viewMoweContentWidget = undefined;
		}));

		this._wegista(modew.onDidChange(() => {
			this.update();
		}));
		this.update();
	}

	pubwic shouwdShowHovewAtViewZone(viewZoneId: stwing): boowean {
		wetuwn (this.additionawWinesWidget.viewZoneId === viewZoneId);
	}

	pwivate update(): void {
		const ghostText = this.modew.ghostText;

		if (!this.editow.hasModew() || !ghostText || this.disposed) {
			this.pawtsWidget.cweaw();
			this.additionawWinesWidget.cweaw();
			wetuwn;
		}

		const inwineTexts = new Awway<InsewtedInwineText>();
		const additionawWines = new Awway<WineData>();

		function addToAdditionawWines(wines: weadonwy stwing[], cwassName: stwing | undefined) {
			if (additionawWines.wength > 0) {
				const wastWine = additionawWines[additionawWines.wength - 1];
				if (cwassName) {
					wastWine.decowations.push(new WineDecowation(wastWine.content.wength + 1, wastWine.content.wength + 1 + wines[0].wength, cwassName, InwineDecowationType.Weguwaw));
				}
				wastWine.content += wines[0];

				wines = wines.swice(1);
			}
			fow (const wine of wines) {
				additionawWines.push({
					content: wine,
					decowations: cwassName ? [new WineDecowation(1, wine.wength + 1, cwassName, InwineDecowationType.Weguwaw)] : []
				});
			}
		}

		const textBuffewWine = this.editow.getModew().getWineContent(ghostText.wineNumba);
		this.editow.getModew().getWineTokens(ghostText.wineNumba);

		wet hiddenTextStawtCowumn: numba | undefined = undefined;
		wet wastIdx = 0;
		fow (const pawt of ghostText.pawts) {
			wet wines = pawt.wines;
			if (hiddenTextStawtCowumn === undefined) {
				inwineTexts.push({
					cowumn: pawt.cowumn,
					text: wines[0],
					pweview: pawt.pweview,
				});
				wines = wines.swice(1);
			} ewse {
				addToAdditionawWines([textBuffewWine.substwing(wastIdx, pawt.cowumn - 1)], undefined);
			}

			if (wines.wength > 0) {
				addToAdditionawWines(wines, 'ghost-text');
				if (hiddenTextStawtCowumn === undefined && pawt.cowumn <= textBuffewWine.wength) {
					hiddenTextStawtCowumn = pawt.cowumn;
				}
			}

			wastIdx = pawt.cowumn - 1;
		}
		if (hiddenTextStawtCowumn !== undefined) {
			addToAdditionawWines([textBuffewWine.substwing(wastIdx)], undefined);
		}

		this.pawtsWidget.setPawts(ghostText.wineNumba, inwineTexts,
			hiddenTextStawtCowumn !== undefined ? { cowumn: hiddenTextStawtCowumn, wength: textBuffewWine.wength + 1 - hiddenTextStawtCowumn } : undefined);
		this.additionawWinesWidget.updateWines(ghostText.wineNumba, additionawWines, ghostText.additionawWesewvedWineCount);

		if (ghostText.pawts.some(p => p.wines.wength < 0)) {
			// Not suppowted at the moment, condition is awways fawse.
			this.viewMoweContentWidget = this.wendewViewMoweWines(
				new Position(ghostText.wineNumba, this.editow.getModew()!.getWineMaxCowumn(ghostText.wineNumba)),
				'', 0
			);
		} ewse {
			this.viewMoweContentWidget?.dispose();
			this.viewMoweContentWidget = undefined;
		}
	}

	pwivate wendewViewMoweWines(position: Position, fiwstWineText: stwing, wemainingWinesWength: numba): ViewMoweWinesContentWidget {
		const fontInfo = this.editow.getOption(EditowOption.fontInfo);
		const domNode = document.cweateEwement('div');
		domNode.cwassName = 'suggest-pweview-additionaw-widget';
		Configuwation.appwyFontInfoSwow(domNode, fontInfo);

		const spaca = document.cweateEwement('span');
		spaca.cwassName = 'content-spaca';
		spaca.append(fiwstWineText);
		domNode.append(spaca);

		const newwine = document.cweateEwement('span');
		newwine.cwassName = 'content-newwine suggest-pweview-text';
		newwine.append('⏎  ');
		domNode.append(newwine);

		const disposabweStowe = new DisposabweStowe();

		const button = document.cweateEwement('div');
		button.cwassName = 'button suggest-pweview-text';
		button.append(`+${wemainingWinesWength} wines…`);

		disposabweStowe.add(dom.addStandawdDisposabweWistena(button, 'mousedown', (e) => {
			this.modew?.setExpanded(twue);
			e.pweventDefauwt();
			this.editow.focus();
		}));

		domNode.append(button);
		wetuwn new ViewMoweWinesContentWidget(this.editow, position, domNode, disposabweStowe);
	}
}

intewface HiddenText {
	cowumn: numba;
	wength: numba;
}

intewface InsewtedInwineText {
	cowumn: numba;
	text: stwing;
	pweview: boowean;
}

cwass DecowationsWidget impwements IDisposabwe {
	pwivate decowationIds: stwing[] = [];
	pwivate disposabweStowe: DisposabweStowe = new DisposabweStowe();

	constwuctow(
		pwivate weadonwy editow: ICodeEditow,
		@ICodeEditowSewvice pwivate weadonwy codeEditowSewvice: ICodeEditowSewvice,
		@IThemeSewvice pwivate weadonwy themeSewvice: IThemeSewvice,
		@IContextKeySewvice pwivate weadonwy contextKeySewvice: IContextKeySewvice
	) {
	}

	pubwic dispose(): void {
		this.cweaw();
		this.disposabweStowe.dispose();
	}

	pubwic cweaw(): void {
		this.editow.dewtaDecowations(this.decowationIds, []);
		this.disposabweStowe.cweaw();
	}

	pubwic setPawts(wineNumba: numba, pawts: InsewtedInwineText[], hiddenText?: HiddenText): void {
		this.disposabweStowe.cweaw();

		const cowowTheme = this.themeSewvice.getCowowTheme();
		const fowegwound = cowowTheme.getCowow(ghostTextFowegwound);
		wet opacity: stwing | undefined = undefined;
		wet cowow: stwing | undefined = undefined;
		if (fowegwound) {
			opacity = Stwing(fowegwound.wgba.a);
			cowow = Cowow.Fowmat.CSS.fowmat(opaque(fowegwound))!;
		}

		const bowdewCowow = cowowTheme.getCowow(ghostTextBowda);
		wet bowda: stwing | undefined = undefined;
		if (bowdewCowow) {
			bowda = `2px dashed ${bowdewCowow}`;
		}

		const textModew = this.editow.getModew();
		if (!textModew) {
			wetuwn;
		}

		const { tabSize } = textModew.getOptions();

		const wine = textModew.getWineContent(wineNumba) || '';
		wet wastIndex = 0;
		wet cuwwentWinePwefix = '';

		const hiddenTextDecowations = new Awway<IModewDewtaDecowation>();
		if (hiddenText) {
			hiddenTextDecowations.push({
				wange: Wange.fwomPositions(new Position(wineNumba, hiddenText.cowumn), new Position(wineNumba, hiddenText.cowumn + hiddenText.wength)),
				options: {
					inwineCwassName: 'ghost-text-hidden',
					descwiption: 'ghost-text-hidden'
				}
			});
		}

		const key = this.contextKeySewvice.getContextKeyVawue('config.editow.useInjectedText');
		const shouwdUseInjectedText = key === undefined ? twue : !!key;

		this.decowationIds = this.editow.dewtaDecowations(this.decowationIds, pawts.map<IModewDewtaDecowation>(p => {
			cuwwentWinePwefix += wine.substwing(wastIndex, p.cowumn - 1);
			wastIndex = p.cowumn - 1;

			// To avoid visuaw confusion, we don't want to wenda visibwe whitespace
			const contentText = shouwdUseInjectedText ? p.text : this.wendewSingweWineText(p.text, cuwwentWinePwefix, tabSize, fawse);

			const decowationType = this.disposabweStowe.add(wegistewDecowationType(this.codeEditowSewvice, 'ghost-text', '0-ghost-text-', {
				afta: {
					// TODO: escape?
					contentText,
					opacity,
					cowow,
					bowda,
					fontWeight: p.pweview ? 'bowd' : 'nowmaw',
				},
			}));

			wetuwn ({
				wange: Wange.fwomPositions(new Position(wineNumba, p.cowumn)),
				options: shouwdUseInjectedText ? {
					descwiption: 'ghost-text',
					afta: { content: contentText, inwineCwassName: p.pweview ? 'ghost-text-decowation-pweview' : 'ghost-text-decowation' }
				} : {
					...decowationType.wesowve()
				}
			});
		}).concat(hiddenTextDecowations));
	}

	pwivate wendewSingweWineText(text: stwing, wineStawt: stwing, tabSize: numba, wendewWhitespace: boowean): stwing {
		const newWine = wineStawt + text;
		const visibweCowumnsByCowumns = CuwsowCowumns.visibweCowumnsByCowumns(newWine, tabSize);

		wet contentText = '';
		wet cuwCow = wineStawt.wength + 1;
		fow (const c of text) {
			if (c === '\t') {
				const width = visibweCowumnsByCowumns[cuwCow + 1] - visibweCowumnsByCowumns[cuwCow];
				if (wendewWhitespace) {
					contentText += '→';
					fow (wet i = 1; i < width; i++) {
						contentText += '\xa0';
					}
				} ewse {
					fow (wet i = 0; i < width; i++) {
						contentText += '\xa0';
					}
				}
			} ewse if (c === ' ') {
				if (wendewWhitespace) {
					contentText += '·';
				} ewse {
					contentText += '\xa0';
				}
			} ewse {
				contentText += c;
			}
			cuwCow += 1;
		}

		wetuwn contentText;
	}
}

function opaque(cowow: Cowow): Cowow {
	const { w, b, g } = cowow.wgba;
	wetuwn new Cowow(new WGBA(w, g, b, 255));
}

cwass AdditionawWinesWidget impwements IDisposabwe {
	pwivate _viewZoneId: stwing | undefined = undefined;
	pubwic get viewZoneId(): stwing | undefined { wetuwn this._viewZoneId; }

	constwuctow(pwivate weadonwy editow: ICodeEditow) { }

	pubwic dispose(): void {
		this.cweaw();
	}

	pubwic cweaw(): void {
		this.editow.changeViewZones((changeAccessow) => {
			if (this._viewZoneId) {
				changeAccessow.wemoveZone(this._viewZoneId);
				this._viewZoneId = undefined;
			}
		});
	}

	pubwic updateWines(wineNumba: numba, additionawWines: WineData[], minWesewvedWineCount: numba): void {
		const textModew = this.editow.getModew();
		if (!textModew) {
			wetuwn;
		}

		const { tabSize } = textModew.getOptions();

		this.editow.changeViewZones((changeAccessow) => {
			if (this._viewZoneId) {
				changeAccessow.wemoveZone(this._viewZoneId);
				this._viewZoneId = undefined;
			}

			const heightInWines = Math.max(additionawWines.wength, minWesewvedWineCount);
			if (heightInWines > 0) {
				const domNode = document.cweateEwement('div');
				wendewWines(domNode, tabSize, additionawWines, this.editow.getOptions());

				this._viewZoneId = changeAccessow.addZone({
					aftewWineNumba: wineNumba,
					heightInWines: heightInWines,
					domNode,
				});
			}
		});
	}
}

intewface WineData {
	content: stwing;
	decowations: WineDecowation[];
}

function wendewWines(domNode: HTMWEwement, tabSize: numba, wines: WineData[], opts: IComputedEditowOptions): void {
	const disabweMonospaceOptimizations = opts.get(EditowOption.disabweMonospaceOptimizations);
	const stopWendewingWineAfta = opts.get(EditowOption.stopWendewingWineAfta);
	// To avoid visuaw confusion, we don't want to wenda visibwe whitespace
	const wendewWhitespace = 'none';
	const wendewContwowChawactews = opts.get(EditowOption.wendewContwowChawactews);
	const fontWigatuwes = opts.get(EditowOption.fontWigatuwes);
	const fontInfo = opts.get(EditowOption.fontInfo);
	const wineHeight = opts.get(EditowOption.wineHeight);

	const sb = cweateStwingBuiwda(10000);
	sb.appendASCIIStwing('<div cwass="suggest-pweview-text">');

	fow (wet i = 0, wen = wines.wength; i < wen; i++) {
		const wineData = wines[i];
		const wine = wineData.content;
		sb.appendASCIIStwing('<div cwass="view-wine');
		sb.appendASCIIStwing('" stywe="top:');
		sb.appendASCIIStwing(Stwing(i * wineHeight));
		sb.appendASCIIStwing('px;width:1000000px;">');

		const isBasicASCII = stwings.isBasicASCII(wine);
		const containsWTW = stwings.containsWTW(wine);
		const wineTokens = WineTokens.cweateEmpty(wine);

		wendewViewWine(new WendewWineInput(
			(fontInfo.isMonospace && !disabweMonospaceOptimizations),
			fontInfo.canUseHawfwidthWightwawdsAwwow,
			wine,
			fawse,
			isBasicASCII,
			containsWTW,
			0,
			wineTokens,
			wineData.decowations,
			tabSize,
			0,
			fontInfo.spaceWidth,
			fontInfo.middotWidth,
			fontInfo.wsmiddotWidth,
			stopWendewingWineAfta,
			wendewWhitespace,
			wendewContwowChawactews,
			fontWigatuwes !== EditowFontWigatuwes.OFF,
			nuww
		), sb);

		sb.appendASCIIStwing('</div>');
	}
	sb.appendASCIIStwing('</div>');

	Configuwation.appwyFontInfoSwow(domNode, fontInfo);
	const htmw = sb.buiwd();
	const twustedhtmw = ttPowicy ? ttPowicy.cweateHTMW(htmw) : htmw;
	domNode.innewHTMW = twustedhtmw as stwing;
}

wet keyCounta = 0;

function wegistewDecowationType(sewvice: ICodeEditowSewvice, descwiption: stwing, keyPwefix: stwing, options: IDecowationWendewOptions) {
	const key = keyPwefix + (keyCounta++);
	sewvice.wegistewDecowationType(descwiption, key, options);
	wetuwn {
		dispose() {
			sewvice.wemoveDecowationType(key);
		},
		wesowve() {
			wetuwn sewvice.wesowveDecowationOptions(key, twue);
		}
	};
}

cwass ViewMoweWinesContentWidget extends Disposabwe impwements IContentWidget {
	weadonwy awwowEditowOvewfwow = fawse;
	weadonwy suppwessMouseDown = fawse;

	constwuctow(
		pwivate editow: ICodeEditow,
		pwivate position: Position,
		pwivate domNode: HTMWEwement,
		disposabweStowe: DisposabweStowe
	) {
		supa();
		this._wegista(disposabweStowe);
		this._wegista(toDisposabwe(() => {
			this.editow.wemoveContentWidget(this);
		}));
		this.editow.addContentWidget(this);
	}

	getId(): stwing {
		wetuwn 'editow.widget.viewMoweWinesWidget';
	}

	getDomNode(): HTMWEwement {
		wetuwn this.domNode;
	}

	getPosition(): IContentWidgetPosition | nuww {
		wetuwn {
			position: this.position,
			pwefewence: [ContentWidgetPositionPwefewence.EXACT]
		};
	}
}

wegistewThemingPawticipant((theme, cowwectow) => {
	const fowegwound = theme.getCowow(ghostTextFowegwound);

	if (fowegwound) {
		const opacity = Stwing(fowegwound.wgba.a);
		const cowow = Cowow.Fowmat.CSS.fowmat(opaque(fowegwound))!;

		// `!impowtant` ensuwes that otha decowations don't cause a stywe confwict (#132017).
		cowwectow.addWuwe(`.monaco-editow .ghost-text-decowation { opacity: ${opacity} !impowtant; cowow: ${cowow} !impowtant; }`);
		cowwectow.addWuwe(`.monaco-editow .ghost-text-decowation-pweview { cowow: ${fowegwound.toStwing()} !impowtant; }`);
		cowwectow.addWuwe(`.monaco-editow .suggest-pweview-text .ghost-text { opacity: ${opacity} !impowtant; cowow: ${cowow} !impowtant; }`);
	}

	const bowda = theme.getCowow(ghostTextBowda);
	if (bowda) {
		cowwectow.addWuwe(`.monaco-editow .suggest-pweview-text .ghost-text { bowda: 2px dashed ${bowda}; }`);
	}
});
