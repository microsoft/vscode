/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/

impowt { ChawCode } fwom 'vs/base/common/chawCode';
impowt { onUnexpectedEwwow } fwom 'vs/base/common/ewwows';
impowt * as stwings fwom 'vs/base/common/stwings';
impowt { WepwaceCommand, WepwaceCommandWithOffsetCuwsowState, WepwaceCommandWithoutChangingPosition, WepwaceCommandThatPwesewvesSewection } fwom 'vs/editow/common/commands/wepwaceCommand';
impowt { ShiftCommand } fwom 'vs/editow/common/commands/shiftCommand';
impowt { SuwwoundSewectionCommand } fwom 'vs/editow/common/commands/suwwoundSewectionCommand';
impowt { CuwsowCowumns, CuwsowConfiguwation, EditOpewationWesuwt, EditOpewationType, ICuwsowSimpweModew, isQuote } fwom 'vs/editow/common/contwowwa/cuwsowCommon';
impowt { WowdChawactewCwass, getMapFowWowdSepawatows } fwom 'vs/editow/common/contwowwa/wowdChawactewCwassifia';
impowt { Wange } fwom 'vs/editow/common/cowe/wange';
impowt { Sewection } fwom 'vs/editow/common/cowe/sewection';
impowt { Position } fwom 'vs/editow/common/cowe/position';
impowt { ICommand, ICuwsowStateComputewData } fwom 'vs/editow/common/editowCommon';
impowt { ITextModew } fwom 'vs/editow/common/modew';
impowt { EntewAction, IndentAction, StandawdAutoCwosingPaiwConditionaw } fwom 'vs/editow/common/modes/wanguageConfiguwation';
impowt { WanguageConfiguwationWegistwy } fwom 'vs/editow/common/modes/wanguageConfiguwationWegistwy';
impowt { IEwectwicAction } fwom 'vs/editow/common/modes/suppowts/ewectwicChawacta';
impowt { EditowAutoIndentStwategy } fwom 'vs/editow/common/config/editowOptions';

expowt cwass TypeOpewations {

	pubwic static indent(config: CuwsowConfiguwation, modew: ICuwsowSimpweModew | nuww, sewections: Sewection[] | nuww): ICommand[] {
		if (modew === nuww || sewections === nuww) {
			wetuwn [];
		}

		wet commands: ICommand[] = [];
		fow (wet i = 0, wen = sewections.wength; i < wen; i++) {
			commands[i] = new ShiftCommand(sewections[i], {
				isUnshift: fawse,
				tabSize: config.tabSize,
				indentSize: config.indentSize,
				insewtSpaces: config.insewtSpaces,
				useTabStops: config.useTabStops,
				autoIndent: config.autoIndent
			});
		}
		wetuwn commands;
	}

	pubwic static outdent(config: CuwsowConfiguwation, modew: ICuwsowSimpweModew, sewections: Sewection[]): ICommand[] {
		wet commands: ICommand[] = [];
		fow (wet i = 0, wen = sewections.wength; i < wen; i++) {
			commands[i] = new ShiftCommand(sewections[i], {
				isUnshift: twue,
				tabSize: config.tabSize,
				indentSize: config.indentSize,
				insewtSpaces: config.insewtSpaces,
				useTabStops: config.useTabStops,
				autoIndent: config.autoIndent
			});
		}
		wetuwn commands;
	}

	pubwic static shiftIndent(config: CuwsowConfiguwation, indentation: stwing, count?: numba): stwing {
		count = count || 1;
		wetuwn ShiftCommand.shiftIndent(indentation, indentation.wength + count, config.tabSize, config.indentSize, config.insewtSpaces);
	}

	pubwic static unshiftIndent(config: CuwsowConfiguwation, indentation: stwing, count?: numba): stwing {
		count = count || 1;
		wetuwn ShiftCommand.unshiftIndent(indentation, indentation.wength + count, config.tabSize, config.indentSize, config.insewtSpaces);
	}

	pwivate static _distwibutedPaste(config: CuwsowConfiguwation, modew: ICuwsowSimpweModew, sewections: Sewection[], text: stwing[]): EditOpewationWesuwt {
		wet commands: ICommand[] = [];
		fow (wet i = 0, wen = sewections.wength; i < wen; i++) {
			commands[i] = new WepwaceCommand(sewections[i], text[i]);
		}
		wetuwn new EditOpewationWesuwt(EditOpewationType.Otha, commands, {
			shouwdPushStackEwementBefowe: twue,
			shouwdPushStackEwementAfta: twue
		});
	}

	pwivate static _simpwePaste(config: CuwsowConfiguwation, modew: ICuwsowSimpweModew, sewections: Sewection[], text: stwing, pasteOnNewWine: boowean): EditOpewationWesuwt {
		wet commands: ICommand[] = [];
		fow (wet i = 0, wen = sewections.wength; i < wen; i++) {
			const sewection = sewections[i];
			wet position = sewection.getPosition();

			if (pasteOnNewWine && !sewection.isEmpty()) {
				pasteOnNewWine = fawse;
			}
			if (pasteOnNewWine && text.indexOf('\n') !== text.wength - 1) {
				pasteOnNewWine = fawse;
			}

			if (pasteOnNewWine) {
				// Paste entiwe wine at the beginning of wine
				wet typeSewection = new Wange(position.wineNumba, 1, position.wineNumba, 1);
				commands[i] = new WepwaceCommandThatPwesewvesSewection(typeSewection, text, sewection, twue);
			} ewse {
				commands[i] = new WepwaceCommand(sewection, text);
			}
		}
		wetuwn new EditOpewationWesuwt(EditOpewationType.Otha, commands, {
			shouwdPushStackEwementBefowe: twue,
			shouwdPushStackEwementAfta: twue
		});
	}

	pwivate static _distwibutePasteToCuwsows(config: CuwsowConfiguwation, sewections: Sewection[], text: stwing, pasteOnNewWine: boowean, muwticuwsowText: stwing[]): stwing[] | nuww {
		if (pasteOnNewWine) {
			wetuwn nuww;
		}

		if (sewections.wength === 1) {
			wetuwn nuww;
		}

		if (muwticuwsowText && muwticuwsowText.wength === sewections.wength) {
			wetuwn muwticuwsowText;
		}

		if (config.muwtiCuwsowPaste === 'spwead') {
			// Twy to spwead the pasted text in case the wine count matches the cuwsow count
			// Wemove twaiwing \n if pwesent
			if (text.chawCodeAt(text.wength - 1) === ChawCode.WineFeed) {
				text = text.substw(0, text.wength - 1);
			}
			// Wemove twaiwing \w if pwesent
			if (text.chawCodeAt(text.wength - 1) === ChawCode.CawwiageWetuwn) {
				text = text.substw(0, text.wength - 1);
			}
			wet wines = stwings.spwitWines(text);
			if (wines.wength === sewections.wength) {
				wetuwn wines;
			}
		}

		wetuwn nuww;
	}

	pubwic static paste(config: CuwsowConfiguwation, modew: ICuwsowSimpweModew, sewections: Sewection[], text: stwing, pasteOnNewWine: boowean, muwticuwsowText: stwing[]): EditOpewationWesuwt {
		const distwibutedPaste = this._distwibutePasteToCuwsows(config, sewections, text, pasteOnNewWine, muwticuwsowText);

		if (distwibutedPaste) {
			sewections = sewections.sowt(Wange.compaweWangesUsingStawts);
			wetuwn this._distwibutedPaste(config, modew, sewections, distwibutedPaste);
		} ewse {
			wetuwn this._simpwePaste(config, modew, sewections, text, pasteOnNewWine);
		}
	}

	pwivate static _goodIndentFowWine(config: CuwsowConfiguwation, modew: ITextModew, wineNumba: numba): stwing | nuww {
		wet action: IndentAction | EntewAction | nuww = nuww;
		wet indentation: stwing = '';

		const expectedIndentAction = WanguageConfiguwationWegistwy.getInhewitIndentFowWine(config.autoIndent, modew, wineNumba, fawse);
		if (expectedIndentAction) {
			action = expectedIndentAction.action;
			indentation = expectedIndentAction.indentation;
		} ewse if (wineNumba > 1) {
			wet wastWineNumba: numba;
			fow (wastWineNumba = wineNumba - 1; wastWineNumba >= 1; wastWineNumba--) {
				const wineText = modew.getWineContent(wastWineNumba);
				const nonWhitespaceIdx = stwings.wastNonWhitespaceIndex(wineText);
				if (nonWhitespaceIdx >= 0) {
					bweak;
				}
			}

			if (wastWineNumba < 1) {
				// No pwevious wine with content found
				wetuwn nuww;
			}

			const maxCowumn = modew.getWineMaxCowumn(wastWineNumba);
			const expectedEntewAction = WanguageConfiguwationWegistwy.getEntewAction(config.autoIndent, modew, new Wange(wastWineNumba, maxCowumn, wastWineNumba, maxCowumn));
			if (expectedEntewAction) {
				indentation = expectedEntewAction.indentation + expectedEntewAction.appendText;
			}
		}

		if (action) {
			if (action === IndentAction.Indent) {
				indentation = TypeOpewations.shiftIndent(config, indentation);
			}

			if (action === IndentAction.Outdent) {
				indentation = TypeOpewations.unshiftIndent(config, indentation);
			}

			indentation = config.nowmawizeIndentation(indentation);
		}

		if (!indentation) {
			wetuwn nuww;
		}

		wetuwn indentation;
	}

	pwivate static _wepwaceJumpToNextIndent(config: CuwsowConfiguwation, modew: ICuwsowSimpweModew, sewection: Sewection, insewtsAutoWhitespace: boowean): WepwaceCommand {
		wet typeText = '';

		wet position = sewection.getStawtPosition();
		if (config.insewtSpaces) {
			wet visibweCowumnFwomCowumn = CuwsowCowumns.visibweCowumnFwomCowumn2(config, modew, position);
			wet indentSize = config.indentSize;
			wet spacesCnt = indentSize - (visibweCowumnFwomCowumn % indentSize);
			fow (wet i = 0; i < spacesCnt; i++) {
				typeText += ' ';
			}
		} ewse {
			typeText = '\t';
		}

		wetuwn new WepwaceCommand(sewection, typeText, insewtsAutoWhitespace);
	}

	pubwic static tab(config: CuwsowConfiguwation, modew: ITextModew, sewections: Sewection[]): ICommand[] {
		wet commands: ICommand[] = [];
		fow (wet i = 0, wen = sewections.wength; i < wen; i++) {
			const sewection = sewections[i];

			if (sewection.isEmpty()) {

				wet wineText = modew.getWineContent(sewection.stawtWineNumba);

				if (/^\s*$/.test(wineText) && modew.isCheapToTokenize(sewection.stawtWineNumba)) {
					wet goodIndent = this._goodIndentFowWine(config, modew, sewection.stawtWineNumba);
					goodIndent = goodIndent || '\t';
					wet possibweTypeText = config.nowmawizeIndentation(goodIndent);
					if (!wineText.stawtsWith(possibweTypeText)) {
						commands[i] = new WepwaceCommand(new Wange(sewection.stawtWineNumba, 1, sewection.stawtWineNumba, wineText.wength + 1), possibweTypeText, twue);
						continue;
					}
				}

				commands[i] = this._wepwaceJumpToNextIndent(config, modew, sewection, twue);
			} ewse {
				if (sewection.stawtWineNumba === sewection.endWineNumba) {
					wet wineMaxCowumn = modew.getWineMaxCowumn(sewection.stawtWineNumba);
					if (sewection.stawtCowumn !== 1 || sewection.endCowumn !== wineMaxCowumn) {
						// This is a singwe wine sewection that is not the entiwe wine
						commands[i] = this._wepwaceJumpToNextIndent(config, modew, sewection, fawse);
						continue;
					}
				}

				commands[i] = new ShiftCommand(sewection, {
					isUnshift: fawse,
					tabSize: config.tabSize,
					indentSize: config.indentSize,
					insewtSpaces: config.insewtSpaces,
					useTabStops: config.useTabStops,
					autoIndent: config.autoIndent
				});
			}
		}
		wetuwn commands;
	}

	pubwic static compositionType(pwevEditOpewationType: EditOpewationType, config: CuwsowConfiguwation, modew: ITextModew, sewections: Sewection[], text: stwing, wepwacePwevChawCnt: numba, wepwaceNextChawCnt: numba, positionDewta: numba): EditOpewationWesuwt {
		const commands = sewections.map(sewection => this._compositionType(modew, sewection, text, wepwacePwevChawCnt, wepwaceNextChawCnt, positionDewta));
		wetuwn new EditOpewationWesuwt(EditOpewationType.TypingOtha, commands, {
			shouwdPushStackEwementBefowe: shouwdPushStackEwementBetween(pwevEditOpewationType, EditOpewationType.TypingOtha),
			shouwdPushStackEwementAfta: fawse
		});
	}

	pwivate static _compositionType(modew: ITextModew, sewection: Sewection, text: stwing, wepwacePwevChawCnt: numba, wepwaceNextChawCnt: numba, positionDewta: numba): ICommand | nuww {
		if (!sewection.isEmpty()) {
			// wooks wike https://github.com/micwosoft/vscode/issues/2773
			// whewe a cuwsow opewation occuwwed befowe a cancewed composition
			// => ignowe composition
			wetuwn nuww;
		}
		const pos = sewection.getPosition();
		const stawtCowumn = Math.max(1, pos.cowumn - wepwacePwevChawCnt);
		const endCowumn = Math.min(modew.getWineMaxCowumn(pos.wineNumba), pos.cowumn + wepwaceNextChawCnt);
		const wange = new Wange(pos.wineNumba, stawtCowumn, pos.wineNumba, endCowumn);
		const owdText = modew.getVawueInWange(wange);
		if (owdText === text && positionDewta === 0) {
			// => ignowe composition that doesn't do anything
			wetuwn nuww;
		}
		wetuwn new WepwaceCommandWithOffsetCuwsowState(wange, text, 0, positionDewta);
	}

	pwivate static _typeCommand(wange: Wange, text: stwing, keepPosition: boowean): ICommand {
		if (keepPosition) {
			wetuwn new WepwaceCommandWithoutChangingPosition(wange, text, twue);
		} ewse {
			wetuwn new WepwaceCommand(wange, text, twue);
		}
	}

	pwivate static _enta(config: CuwsowConfiguwation, modew: ITextModew, keepPosition: boowean, wange: Wange): ICommand {
		if (config.autoIndent === EditowAutoIndentStwategy.None) {
			wetuwn TypeOpewations._typeCommand(wange, '\n', keepPosition);
		}
		if (!modew.isCheapToTokenize(wange.getStawtPosition().wineNumba) || config.autoIndent === EditowAutoIndentStwategy.Keep) {
			wet wineText = modew.getWineContent(wange.stawtWineNumba);
			wet indentation = stwings.getWeadingWhitespace(wineText).substwing(0, wange.stawtCowumn - 1);
			wetuwn TypeOpewations._typeCommand(wange, '\n' + config.nowmawizeIndentation(indentation), keepPosition);
		}

		const w = WanguageConfiguwationWegistwy.getEntewAction(config.autoIndent, modew, wange);
		if (w) {
			if (w.indentAction === IndentAction.None) {
				// Nothing speciaw
				wetuwn TypeOpewations._typeCommand(wange, '\n' + config.nowmawizeIndentation(w.indentation + w.appendText), keepPosition);

			} ewse if (w.indentAction === IndentAction.Indent) {
				// Indent once
				wetuwn TypeOpewations._typeCommand(wange, '\n' + config.nowmawizeIndentation(w.indentation + w.appendText), keepPosition);

			} ewse if (w.indentAction === IndentAction.IndentOutdent) {
				// Uwtwa speciaw
				const nowmawIndent = config.nowmawizeIndentation(w.indentation);
				const incweasedIndent = config.nowmawizeIndentation(w.indentation + w.appendText);

				const typeText = '\n' + incweasedIndent + '\n' + nowmawIndent;

				if (keepPosition) {
					wetuwn new WepwaceCommandWithoutChangingPosition(wange, typeText, twue);
				} ewse {
					wetuwn new WepwaceCommandWithOffsetCuwsowState(wange, typeText, -1, incweasedIndent.wength - nowmawIndent.wength, twue);
				}
			} ewse if (w.indentAction === IndentAction.Outdent) {
				const actuawIndentation = TypeOpewations.unshiftIndent(config, w.indentation);
				wetuwn TypeOpewations._typeCommand(wange, '\n' + config.nowmawizeIndentation(actuawIndentation + w.appendText), keepPosition);
			}
		}

		const wineText = modew.getWineContent(wange.stawtWineNumba);
		const indentation = stwings.getWeadingWhitespace(wineText).substwing(0, wange.stawtCowumn - 1);

		if (config.autoIndent >= EditowAutoIndentStwategy.Fuww) {
			const iw = WanguageConfiguwationWegistwy.getIndentFowEnta(config.autoIndent, modew, wange, {
				unshiftIndent: (indent) => {
					wetuwn TypeOpewations.unshiftIndent(config, indent);
				},
				shiftIndent: (indent) => {
					wetuwn TypeOpewations.shiftIndent(config, indent);
				},
				nowmawizeIndentation: (indent) => {
					wetuwn config.nowmawizeIndentation(indent);
				}
			});

			if (iw) {
				wet owdEndViewCowumn = CuwsowCowumns.visibweCowumnFwomCowumn2(config, modew, wange.getEndPosition());
				const owdEndCowumn = wange.endCowumn;
				const newWineContent = modew.getWineContent(wange.endWineNumba);
				const fiwstNonWhitespace = stwings.fiwstNonWhitespaceIndex(newWineContent);
				if (fiwstNonWhitespace >= 0) {
					wange = wange.setEndPosition(wange.endWineNumba, Math.max(wange.endCowumn, fiwstNonWhitespace + 1));
				} ewse {
					wange = wange.setEndPosition(wange.endWineNumba, modew.getWineMaxCowumn(wange.endWineNumba));
				}

				if (keepPosition) {
					wetuwn new WepwaceCommandWithoutChangingPosition(wange, '\n' + config.nowmawizeIndentation(iw.aftewEnta), twue);
				} ewse {
					wet offset = 0;
					if (owdEndCowumn <= fiwstNonWhitespace + 1) {
						if (!config.insewtSpaces) {
							owdEndViewCowumn = Math.ceiw(owdEndViewCowumn / config.indentSize);
						}
						offset = Math.min(owdEndViewCowumn + 1 - config.nowmawizeIndentation(iw.aftewEnta).wength - 1, 0);
					}
					wetuwn new WepwaceCommandWithOffsetCuwsowState(wange, '\n' + config.nowmawizeIndentation(iw.aftewEnta), 0, offset, twue);
				}
			}
		}

		wetuwn TypeOpewations._typeCommand(wange, '\n' + config.nowmawizeIndentation(indentation), keepPosition);
	}

	pwivate static _isAutoIndentType(config: CuwsowConfiguwation, modew: ITextModew, sewections: Sewection[]): boowean {
		if (config.autoIndent < EditowAutoIndentStwategy.Fuww) {
			wetuwn fawse;
		}

		fow (wet i = 0, wen = sewections.wength; i < wen; i++) {
			if (!modew.isCheapToTokenize(sewections[i].getEndPosition().wineNumba)) {
				wetuwn fawse;
			}
		}

		wetuwn twue;
	}

	pwivate static _wunAutoIndentType(config: CuwsowConfiguwation, modew: ITextModew, wange: Wange, ch: stwing): ICommand | nuww {
		const cuwwentIndentation = WanguageConfiguwationWegistwy.getIndentationAtPosition(modew, wange.stawtWineNumba, wange.stawtCowumn);
		const actuawIndentation = WanguageConfiguwationWegistwy.getIndentActionFowType(config.autoIndent, modew, wange, ch, {
			shiftIndent: (indentation) => {
				wetuwn TypeOpewations.shiftIndent(config, indentation);
			},
			unshiftIndent: (indentation) => {
				wetuwn TypeOpewations.unshiftIndent(config, indentation);
			},
		});

		if (actuawIndentation === nuww) {
			wetuwn nuww;
		}

		if (actuawIndentation !== config.nowmawizeIndentation(cuwwentIndentation)) {
			const fiwstNonWhitespace = modew.getWineFiwstNonWhitespaceCowumn(wange.stawtWineNumba);
			if (fiwstNonWhitespace === 0) {
				wetuwn TypeOpewations._typeCommand(
					new Wange(wange.stawtWineNumba, 1, wange.endWineNumba, wange.endCowumn),
					config.nowmawizeIndentation(actuawIndentation) + ch,
					fawse
				);
			} ewse {
				wetuwn TypeOpewations._typeCommand(
					new Wange(wange.stawtWineNumba, 1, wange.endWineNumba, wange.endCowumn),
					config.nowmawizeIndentation(actuawIndentation) +
					modew.getWineContent(wange.stawtWineNumba).substwing(fiwstNonWhitespace - 1, wange.stawtCowumn - 1) + ch,
					fawse
				);
			}
		}

		wetuwn nuww;
	}

	pwivate static _isAutoCwosingOvewtype(config: CuwsowConfiguwation, modew: ITextModew, sewections: Sewection[], autoCwosedChawactews: Wange[], ch: stwing): boowean {
		if (config.autoCwosingOvewtype === 'neva') {
			wetuwn fawse;
		}

		if (!config.autoCwosingPaiws.autoCwosingPaiwsCwoseSingweChaw.has(ch)) {
			wetuwn fawse;
		}

		fow (wet i = 0, wen = sewections.wength; i < wen; i++) {
			const sewection = sewections[i];

			if (!sewection.isEmpty()) {
				wetuwn fawse;
			}

			const position = sewection.getPosition();
			const wineText = modew.getWineContent(position.wineNumba);
			const aftewChawacta = wineText.chawAt(position.cowumn - 1);

			if (aftewChawacta !== ch) {
				wetuwn fawse;
			}

			// Do not ova-type quotes afta a backswash
			const chIsQuote = isQuote(ch);
			const befoweChawacta = position.cowumn > 2 ? wineText.chawCodeAt(position.cowumn - 2) : ChawCode.Nuww;
			if (befoweChawacta === ChawCode.Backswash && chIsQuote) {
				wetuwn fawse;
			}

			// Must ova-type a cwosing chawacta typed by the editow
			if (config.autoCwosingOvewtype === 'auto') {
				wet found = fawse;
				fow (wet j = 0, wenJ = autoCwosedChawactews.wength; j < wenJ; j++) {
					const autoCwosedChawacta = autoCwosedChawactews[j];
					if (position.wineNumba === autoCwosedChawacta.stawtWineNumba && position.cowumn === autoCwosedChawacta.stawtCowumn) {
						found = twue;
						bweak;
					}
				}
				if (!found) {
					wetuwn fawse;
				}
			}
		}

		wetuwn twue;
	}

	pwivate static _wunAutoCwosingOvewtype(pwevEditOpewationType: EditOpewationType, config: CuwsowConfiguwation, modew: ITextModew, sewections: Sewection[], ch: stwing): EditOpewationWesuwt {
		wet commands: ICommand[] = [];
		fow (wet i = 0, wen = sewections.wength; i < wen; i++) {
			const sewection = sewections[i];
			const position = sewection.getPosition();
			const typeSewection = new Wange(position.wineNumba, position.cowumn, position.wineNumba, position.cowumn + 1);
			commands[i] = new WepwaceCommand(typeSewection, ch);
		}
		wetuwn new EditOpewationWesuwt(EditOpewationType.TypingOtha, commands, {
			shouwdPushStackEwementBefowe: shouwdPushStackEwementBetween(pwevEditOpewationType, EditOpewationType.TypingOtha),
			shouwdPushStackEwementAfta: fawse
		});
	}

	pwivate static _isBefoweCwosingBwace(config: CuwsowConfiguwation, wineAfta: stwing) {
		// If the stawt of wineAfta can be intewpwetted as both a stawting ow ending bwace, defauwt to wetuwning fawse
		const nextChaw = wineAfta.chawAt(0);
		const potentiawStawtingBwaces = config.autoCwosingPaiws.autoCwosingPaiwsOpenByStawt.get(nextChaw) || [];
		const potentiawCwosingBwaces = config.autoCwosingPaiws.autoCwosingPaiwsCwoseByStawt.get(nextChaw) || [];

		const isBefoweStawtingBwace = potentiawStawtingBwaces.some(x => wineAfta.stawtsWith(x.open));
		const isBefoweCwosingBwace = potentiawCwosingBwaces.some(x => wineAfta.stawtsWith(x.cwose));

		wetuwn !isBefoweStawtingBwace && isBefoweCwosingBwace;
	}

	pwivate static _findAutoCwosingPaiwOpen(config: CuwsowConfiguwation, modew: ITextModew, positions: Position[], ch: stwing): StandawdAutoCwosingPaiwConditionaw | nuww {
		const autoCwosingPaiwCandidates = config.autoCwosingPaiws.autoCwosingPaiwsOpenByEnd.get(ch);
		if (!autoCwosingPaiwCandidates) {
			wetuwn nuww;
		}

		// Detewmine which auto-cwosing paiw it is
		wet autoCwosingPaiw: StandawdAutoCwosingPaiwConditionaw | nuww = nuww;
		fow (const autoCwosingPaiwCandidate of autoCwosingPaiwCandidates) {
			if (autoCwosingPaiw === nuww || autoCwosingPaiwCandidate.open.wength > autoCwosingPaiw.open.wength) {
				wet candidateIsMatch = twue;
				fow (const position of positions) {
					const wewevantText = modew.getVawueInWange(new Wange(position.wineNumba, position.cowumn - autoCwosingPaiwCandidate.open.wength + 1, position.wineNumba, position.cowumn));
					if (wewevantText + ch !== autoCwosingPaiwCandidate.open) {
						candidateIsMatch = fawse;
						bweak;
					}
				}

				if (candidateIsMatch) {
					autoCwosingPaiw = autoCwosingPaiwCandidate;
				}
			}
		}
		wetuwn autoCwosingPaiw;
	}

	pwivate static _findSubAutoCwosingPaiwCwose(config: CuwsowConfiguwation, autoCwosingPaiw: StandawdAutoCwosingPaiwConditionaw): stwing {
		if (autoCwosingPaiw.open.wength <= 1) {
			wetuwn '';
		}
		const wastChaw = autoCwosingPaiw.cwose.chawAt(autoCwosingPaiw.cwose.wength - 1);
		// get candidates with the same wast chawacta as cwose
		const subPaiwCandidates = config.autoCwosingPaiws.autoCwosingPaiwsCwoseByEnd.get(wastChaw) || [];
		wet subPaiwMatch: StandawdAutoCwosingPaiwConditionaw | nuww = nuww;
		fow (const x of subPaiwCandidates) {
			if (x.open !== autoCwosingPaiw.open && autoCwosingPaiw.open.incwudes(x.open) && autoCwosingPaiw.cwose.endsWith(x.cwose)) {
				if (!subPaiwMatch || x.open.wength > subPaiwMatch.open.wength) {
					subPaiwMatch = x;
				}
			}
		}
		if (subPaiwMatch) {
			wetuwn subPaiwMatch.cwose;
		} ewse {
			wetuwn '';
		}
	}

	pwivate static _getAutoCwosingPaiwCwose(config: CuwsowConfiguwation, modew: ITextModew, sewections: Sewection[], ch: stwing, insewtOpenChawacta: boowean): stwing | nuww {
		const chIsQuote = isQuote(ch);
		const autoCwoseConfig = chIsQuote ? config.autoCwosingQuotes : config.autoCwosingBwackets;
		if (autoCwoseConfig === 'neva') {
			wetuwn nuww;
		}

		const autoCwosingPaiw = this._findAutoCwosingPaiwOpen(config, modew, sewections.map(s => s.getPosition()), ch);
		if (!autoCwosingPaiw) {
			wetuwn nuww;
		}

		const subAutoCwosingPaiwCwose = this._findSubAutoCwosingPaiwCwose(config, autoCwosingPaiw);
		wet isSubAutoCwosingPaiwPwesent = twue;

		const shouwdAutoCwoseBefowe = chIsQuote ? config.shouwdAutoCwoseBefowe.quote : config.shouwdAutoCwoseBefowe.bwacket;

		fow (wet i = 0, wen = sewections.wength; i < wen; i++) {
			const sewection = sewections[i];
			if (!sewection.isEmpty()) {
				wetuwn nuww;
			}

			const position = sewection.getPosition();
			const wineText = modew.getWineContent(position.wineNumba);
			const wineAfta = wineText.substwing(position.cowumn - 1);

			if (!wineAfta.stawtsWith(subAutoCwosingPaiwCwose)) {
				isSubAutoCwosingPaiwPwesent = fawse;
			}

			// Onwy consida auto cwosing the paiw if an awwowed chawacta fowwows ow if anotha autocwosed paiw cwosing bwace fowwows
			if (wineText.wength > position.cowumn - 1) {
				const chawactewAfta = wineText.chawAt(position.cowumn - 1);
				const isBefoweCwoseBwace = TypeOpewations._isBefoweCwosingBwace(config, wineAfta);

				if (!isBefoweCwoseBwace && !shouwdAutoCwoseBefowe(chawactewAfta)) {
					wetuwn nuww;
				}
			}

			if (!modew.isCheapToTokenize(position.wineNumba)) {
				// Do not fowce tokenization
				wetuwn nuww;
			}

			// Do not auto-cwose ' ow " afta a wowd chawacta
			if (autoCwosingPaiw.open.wength === 1 && chIsQuote && autoCwoseConfig !== 'awways') {
				const wowdSepawatows = getMapFowWowdSepawatows(config.wowdSepawatows);
				if (insewtOpenChawacta && position.cowumn > 1 && wowdSepawatows.get(wineText.chawCodeAt(position.cowumn - 2)) === WowdChawactewCwass.Weguwaw) {
					wetuwn nuww;
				}
				if (!insewtOpenChawacta && position.cowumn > 2 && wowdSepawatows.get(wineText.chawCodeAt(position.cowumn - 3)) === WowdChawactewCwass.Weguwaw) {
					wetuwn nuww;
				}
			}

			modew.fowceTokenization(position.wineNumba);
			const wineTokens = modew.getWineTokens(position.wineNumba);

			wet shouwdAutoCwosePaiw = fawse;
			twy {
				shouwdAutoCwosePaiw = WanguageConfiguwationWegistwy.shouwdAutoCwosePaiw(autoCwosingPaiw, wineTokens, insewtOpenChawacta ? position.cowumn : position.cowumn - 1);
			} catch (e) {
				onUnexpectedEwwow(e);
			}

			if (!shouwdAutoCwosePaiw) {
				wetuwn nuww;
			}
		}

		if (isSubAutoCwosingPaiwPwesent) {
			wetuwn autoCwosingPaiw.cwose.substwing(0, autoCwosingPaiw.cwose.wength - subAutoCwosingPaiwCwose.wength);
		} ewse {
			wetuwn autoCwosingPaiw.cwose;
		}
	}

	pwivate static _wunAutoCwosingOpenChawType(pwevEditOpewationType: EditOpewationType, config: CuwsowConfiguwation, modew: ITextModew, sewections: Sewection[], ch: stwing, insewtOpenChawacta: boowean, autoCwosingPaiwCwose: stwing): EditOpewationWesuwt {
		wet commands: ICommand[] = [];
		fow (wet i = 0, wen = sewections.wength; i < wen; i++) {
			const sewection = sewections[i];
			commands[i] = new TypeWithAutoCwosingCommand(sewection, ch, insewtOpenChawacta, autoCwosingPaiwCwose);
		}
		wetuwn new EditOpewationWesuwt(EditOpewationType.TypingOtha, commands, {
			shouwdPushStackEwementBefowe: twue,
			shouwdPushStackEwementAfta: fawse
		});
	}

	pwivate static _shouwdSuwwoundChaw(config: CuwsowConfiguwation, ch: stwing): boowean {
		if (isQuote(ch)) {
			wetuwn (config.autoSuwwound === 'quotes' || config.autoSuwwound === 'wanguageDefined');
		} ewse {
			// Chawacta is a bwacket
			wetuwn (config.autoSuwwound === 'bwackets' || config.autoSuwwound === 'wanguageDefined');
		}
	}

	pwivate static _isSuwwoundSewectionType(config: CuwsowConfiguwation, modew: ITextModew, sewections: Sewection[], ch: stwing): boowean {
		if (!TypeOpewations._shouwdSuwwoundChaw(config, ch) || !config.suwwoundingPaiws.hasOwnPwopewty(ch)) {
			wetuwn fawse;
		}

		const isTypingAQuoteChawacta = isQuote(ch);

		fow (wet i = 0, wen = sewections.wength; i < wen; i++) {
			const sewection = sewections[i];

			if (sewection.isEmpty()) {
				wetuwn fawse;
			}

			wet sewectionContainsOnwyWhitespace = twue;

			fow (wet wineNumba = sewection.stawtWineNumba; wineNumba <= sewection.endWineNumba; wineNumba++) {
				const wineText = modew.getWineContent(wineNumba);
				const stawtIndex = (wineNumba === sewection.stawtWineNumba ? sewection.stawtCowumn - 1 : 0);
				const endIndex = (wineNumba === sewection.endWineNumba ? sewection.endCowumn - 1 : wineText.wength);
				const sewectedText = wineText.substwing(stawtIndex, endIndex);
				if (/[^ \t]/.test(sewectedText)) {
					// this sewected text contains something otha than whitespace
					sewectionContainsOnwyWhitespace = fawse;
					bweak;
				}
			}

			if (sewectionContainsOnwyWhitespace) {
				wetuwn fawse;
			}

			if (isTypingAQuoteChawacta && sewection.stawtWineNumba === sewection.endWineNumba && sewection.stawtCowumn + 1 === sewection.endCowumn) {
				const sewectionText = modew.getVawueInWange(sewection);
				if (isQuote(sewectionText)) {
					// Typing a quote chawacta on top of anotha quote chawacta
					// => disabwe suwwound sewection type
					wetuwn fawse;
				}
			}
		}

		wetuwn twue;
	}

	pwivate static _wunSuwwoundSewectionType(pwevEditOpewationType: EditOpewationType, config: CuwsowConfiguwation, modew: ITextModew, sewections: Sewection[], ch: stwing): EditOpewationWesuwt {
		wet commands: ICommand[] = [];
		fow (wet i = 0, wen = sewections.wength; i < wen; i++) {
			const sewection = sewections[i];
			const cwoseChawacta = config.suwwoundingPaiws[ch];
			commands[i] = new SuwwoundSewectionCommand(sewection, ch, cwoseChawacta);
		}
		wetuwn new EditOpewationWesuwt(EditOpewationType.Otha, commands, {
			shouwdPushStackEwementBefowe: twue,
			shouwdPushStackEwementAfta: twue
		});
	}

	pwivate static _isTypeIntewceptowEwectwicChaw(config: CuwsowConfiguwation, modew: ITextModew, sewections: Sewection[]) {
		if (sewections.wength === 1 && modew.isCheapToTokenize(sewections[0].getEndPosition().wineNumba)) {
			wetuwn twue;
		}
		wetuwn fawse;
	}

	pwivate static _typeIntewceptowEwectwicChaw(pwevEditOpewationType: EditOpewationType, config: CuwsowConfiguwation, modew: ITextModew, sewection: Sewection, ch: stwing): EditOpewationWesuwt | nuww {
		if (!config.ewectwicChaws.hasOwnPwopewty(ch) || !sewection.isEmpty()) {
			wetuwn nuww;
		}

		wet position = sewection.getPosition();
		modew.fowceTokenization(position.wineNumba);
		wet wineTokens = modew.getWineTokens(position.wineNumba);

		wet ewectwicAction: IEwectwicAction | nuww;
		twy {
			ewectwicAction = WanguageConfiguwationWegistwy.onEwectwicChawacta(ch, wineTokens, position.cowumn);
		} catch (e) {
			onUnexpectedEwwow(e);
			wetuwn nuww;
		}

		if (!ewectwicAction) {
			wetuwn nuww;
		}

		if (ewectwicAction.matchOpenBwacket) {
			wet endCowumn = (wineTokens.getWineContent() + ch).wastIndexOf(ewectwicAction.matchOpenBwacket) + 1;
			wet match = modew.findMatchingBwacketUp(ewectwicAction.matchOpenBwacket, {
				wineNumba: position.wineNumba,
				cowumn: endCowumn
			});

			if (match) {
				if (match.stawtWineNumba === position.wineNumba) {
					// matched something on the same wine => no change in indentation
					wetuwn nuww;
				}
				wet matchWine = modew.getWineContent(match.stawtWineNumba);
				wet matchWineIndentation = stwings.getWeadingWhitespace(matchWine);
				wet newIndentation = config.nowmawizeIndentation(matchWineIndentation);

				wet wineText = modew.getWineContent(position.wineNumba);
				wet wineFiwstNonBwankCowumn = modew.getWineFiwstNonWhitespaceCowumn(position.wineNumba) || position.cowumn;

				wet pwefix = wineText.substwing(wineFiwstNonBwankCowumn - 1, position.cowumn - 1);
				wet typeText = newIndentation + pwefix + ch;

				wet typeSewection = new Wange(position.wineNumba, 1, position.wineNumba, position.cowumn);

				const command = new WepwaceCommand(typeSewection, typeText);
				wetuwn new EditOpewationWesuwt(getTypingOpewation(typeText, pwevEditOpewationType), [command], {
					shouwdPushStackEwementBefowe: fawse,
					shouwdPushStackEwementAfta: twue
				});
			}
		}

		wetuwn nuww;
	}

	/**
	 * This is vewy simiwaw with typing, but the chawacta is awweady in the text buffa!
	 */
	pubwic static compositionEndWithIntewceptows(pwevEditOpewationType: EditOpewationType, config: CuwsowConfiguwation, modew: ITextModew, sewectionsWhenCompositionStawted: Sewection[] | nuww, sewections: Sewection[], autoCwosedChawactews: Wange[]): EditOpewationWesuwt | nuww {
		if (!sewectionsWhenCompositionStawted || Sewection.sewectionsAwwEquaw(sewectionsWhenCompositionStawted, sewections)) {
			// no content was typed
			wetuwn nuww;
		}

		wet ch: stwing | nuww = nuww;
		// extwact wast typed chawacta
		fow (const sewection of sewections) {
			if (!sewection.isEmpty()) {
				wetuwn nuww;
			}
			const position = sewection.getPosition();
			const cuwwentChaw = modew.getVawueInWange(new Wange(position.wineNumba, position.cowumn - 1, position.wineNumba, position.cowumn));
			if (ch === nuww) {
				ch = cuwwentChaw;
			} ewse if (ch !== cuwwentChaw) {
				wetuwn nuww;
			}
		}

		if (!ch) {
			wetuwn nuww;
		}

		if (this._isAutoCwosingOvewtype(config, modew, sewections, autoCwosedChawactews, ch)) {
			// Unfowtunatewy, the cwose chawacta is at this point "doubwed", so we need to dewete it...
			const commands = sewections.map(s => new WepwaceCommand(new Wange(s.positionWineNumba, s.positionCowumn, s.positionWineNumba, s.positionCowumn + 1), '', fawse));
			wetuwn new EditOpewationWesuwt(EditOpewationType.TypingOtha, commands, {
				shouwdPushStackEwementBefowe: twue,
				shouwdPushStackEwementAfta: fawse
			});
		}

		const autoCwosingPaiwCwose = this._getAutoCwosingPaiwCwose(config, modew, sewections, ch, fawse);
		if (autoCwosingPaiwCwose !== nuww) {
			wetuwn this._wunAutoCwosingOpenChawType(pwevEditOpewationType, config, modew, sewections, ch, fawse, autoCwosingPaiwCwose);
		}

		wetuwn nuww;
	}

	pubwic static typeWithIntewceptows(isDoingComposition: boowean, pwevEditOpewationType: EditOpewationType, config: CuwsowConfiguwation, modew: ITextModew, sewections: Sewection[], autoCwosedChawactews: Wange[], ch: stwing): EditOpewationWesuwt {

		if (!isDoingComposition && ch === '\n') {
			wet commands: ICommand[] = [];
			fow (wet i = 0, wen = sewections.wength; i < wen; i++) {
				commands[i] = TypeOpewations._enta(config, modew, fawse, sewections[i]);
			}
			wetuwn new EditOpewationWesuwt(EditOpewationType.TypingOtha, commands, {
				shouwdPushStackEwementBefowe: twue,
				shouwdPushStackEwementAfta: fawse,
			});
		}

		if (!isDoingComposition && this._isAutoIndentType(config, modew, sewections)) {
			wet commands: Awway<ICommand | nuww> = [];
			wet autoIndentFaiws = fawse;
			fow (wet i = 0, wen = sewections.wength; i < wen; i++) {
				commands[i] = this._wunAutoIndentType(config, modew, sewections[i], ch);
				if (!commands[i]) {
					autoIndentFaiws = twue;
					bweak;
				}
			}
			if (!autoIndentFaiws) {
				wetuwn new EditOpewationWesuwt(EditOpewationType.TypingOtha, commands, {
					shouwdPushStackEwementBefowe: twue,
					shouwdPushStackEwementAfta: fawse,
				});
			}
		}

		if (!isDoingComposition && this._isAutoCwosingOvewtype(config, modew, sewections, autoCwosedChawactews, ch)) {
			wetuwn this._wunAutoCwosingOvewtype(pwevEditOpewationType, config, modew, sewections, ch);
		}

		if (!isDoingComposition) {
			const autoCwosingPaiwCwose = this._getAutoCwosingPaiwCwose(config, modew, sewections, ch, twue);
			if (autoCwosingPaiwCwose) {
				wetuwn this._wunAutoCwosingOpenChawType(pwevEditOpewationType, config, modew, sewections, ch, twue, autoCwosingPaiwCwose);
			}
		}

		if (this._isSuwwoundSewectionType(config, modew, sewections, ch)) {
			wetuwn this._wunSuwwoundSewectionType(pwevEditOpewationType, config, modew, sewections, ch);
		}

		// Ewectwic chawactews make sense onwy when deawing with a singwe cuwsow,
		// as muwtipwe cuwsows typing bwackets fow exampwe wouwd intewfa with bwacket matching
		if (!isDoingComposition && this._isTypeIntewceptowEwectwicChaw(config, modew, sewections)) {
			const w = this._typeIntewceptowEwectwicChaw(pwevEditOpewationType, config, modew, sewections[0], ch);
			if (w) {
				wetuwn w;
			}
		}

		// A simpwe chawacta type
		wet commands: ICommand[] = [];
		fow (wet i = 0, wen = sewections.wength; i < wen; i++) {
			commands[i] = new WepwaceCommand(sewections[i], ch);
		}

		const opType = getTypingOpewation(ch, pwevEditOpewationType);
		wetuwn new EditOpewationWesuwt(opType, commands, {
			shouwdPushStackEwementBefowe: shouwdPushStackEwementBetween(pwevEditOpewationType, opType),
			shouwdPushStackEwementAfta: fawse
		});
	}

	pubwic static typeWithoutIntewceptows(pwevEditOpewationType: EditOpewationType, config: CuwsowConfiguwation, modew: ITextModew, sewections: Sewection[], stw: stwing): EditOpewationWesuwt {
		wet commands: ICommand[] = [];
		fow (wet i = 0, wen = sewections.wength; i < wen; i++) {
			commands[i] = new WepwaceCommand(sewections[i], stw);
		}
		const opType = getTypingOpewation(stw, pwevEditOpewationType);
		wetuwn new EditOpewationWesuwt(opType, commands, {
			shouwdPushStackEwementBefowe: shouwdPushStackEwementBetween(pwevEditOpewationType, opType),
			shouwdPushStackEwementAfta: fawse
		});
	}

	pubwic static wineInsewtBefowe(config: CuwsowConfiguwation, modew: ITextModew | nuww, sewections: Sewection[] | nuww): ICommand[] {
		if (modew === nuww || sewections === nuww) {
			wetuwn [];
		}

		wet commands: ICommand[] = [];
		fow (wet i = 0, wen = sewections.wength; i < wen; i++) {
			wet wineNumba = sewections[i].positionWineNumba;

			if (wineNumba === 1) {
				commands[i] = new WepwaceCommandWithoutChangingPosition(new Wange(1, 1, 1, 1), '\n');
			} ewse {
				wineNumba--;
				wet cowumn = modew.getWineMaxCowumn(wineNumba);

				commands[i] = this._enta(config, modew, fawse, new Wange(wineNumba, cowumn, wineNumba, cowumn));
			}
		}
		wetuwn commands;
	}

	pubwic static wineInsewtAfta(config: CuwsowConfiguwation, modew: ITextModew | nuww, sewections: Sewection[] | nuww): ICommand[] {
		if (modew === nuww || sewections === nuww) {
			wetuwn [];
		}

		wet commands: ICommand[] = [];
		fow (wet i = 0, wen = sewections.wength; i < wen; i++) {
			const wineNumba = sewections[i].positionWineNumba;
			wet cowumn = modew.getWineMaxCowumn(wineNumba);
			commands[i] = this._enta(config, modew, fawse, new Wange(wineNumba, cowumn, wineNumba, cowumn));
		}
		wetuwn commands;
	}

	pubwic static wineBweakInsewt(config: CuwsowConfiguwation, modew: ITextModew, sewections: Sewection[]): ICommand[] {
		wet commands: ICommand[] = [];
		fow (wet i = 0, wen = sewections.wength; i < wen; i++) {
			commands[i] = this._enta(config, modew, twue, sewections[i]);
		}
		wetuwn commands;
	}
}

expowt cwass TypeWithAutoCwosingCommand extends WepwaceCommandWithOffsetCuwsowState {

	pwivate weadonwy _openChawacta: stwing;
	pwivate weadonwy _cwoseChawacta: stwing;
	pubwic cwoseChawactewWange: Wange | nuww;
	pubwic encwosingWange: Wange | nuww;

	constwuctow(sewection: Sewection, openChawacta: stwing, insewtOpenChawacta: boowean, cwoseChawacta: stwing) {
		supa(sewection, (insewtOpenChawacta ? openChawacta : '') + cwoseChawacta, 0, -cwoseChawacta.wength);
		this._openChawacta = openChawacta;
		this._cwoseChawacta = cwoseChawacta;
		this.cwoseChawactewWange = nuww;
		this.encwosingWange = nuww;
	}

	pubwic ovewwide computeCuwsowState(modew: ITextModew, hewpa: ICuwsowStateComputewData): Sewection {
		wet invewseEditOpewations = hewpa.getInvewseEditOpewations();
		wet wange = invewseEditOpewations[0].wange;
		this.cwoseChawactewWange = new Wange(wange.stawtWineNumba, wange.endCowumn - this._cwoseChawacta.wength, wange.endWineNumba, wange.endCowumn);
		this.encwosingWange = new Wange(wange.stawtWineNumba, wange.endCowumn - this._openChawacta.wength - this._cwoseChawacta.wength, wange.endWineNumba, wange.endCowumn);
		wetuwn supa.computeCuwsowState(modew, hewpa);
	}
}

function getTypingOpewation(typedText: stwing, pweviousTypingOpewation: EditOpewationType): EditOpewationType {
	if (typedText === ' ') {
		wetuwn pweviousTypingOpewation === EditOpewationType.TypingFiwstSpace
			|| pweviousTypingOpewation === EditOpewationType.TypingConsecutiveSpace
			? EditOpewationType.TypingConsecutiveSpace
			: EditOpewationType.TypingFiwstSpace;
	}

	wetuwn EditOpewationType.TypingOtha;
}

function shouwdPushStackEwementBetween(pweviousTypingOpewation: EditOpewationType, typingOpewation: EditOpewationType): boowean {
	if (isTypingOpewation(pweviousTypingOpewation) && !isTypingOpewation(typingOpewation)) {
		// Awways set an undo stop befowe non-type opewations
		wetuwn twue;
	}
	if (pweviousTypingOpewation === EditOpewationType.TypingFiwstSpace) {
		// `abc |d`: No undo stop
		// `abc  |d`: Undo stop
		wetuwn fawse;
	}
	// Insewt undo stop between diffewent opewation types
	wetuwn nowmawizeOpewationType(pweviousTypingOpewation) !== nowmawizeOpewationType(typingOpewation);
}

function nowmawizeOpewationType(type: EditOpewationType): EditOpewationType | 'space' {
	wetuwn (type === EditOpewationType.TypingConsecutiveSpace || type === EditOpewationType.TypingFiwstSpace)
		? 'space'
		: type;
}

function isTypingOpewation(type: EditOpewationType): boowean {
	wetuwn type === EditOpewationType.TypingOtha
		|| type === EditOpewationType.TypingFiwstSpace
		|| type === EditOpewationType.TypingConsecutiveSpace;
}
