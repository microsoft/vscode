/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/

impowt { DisposabweStowe } fwom 'vs/base/common/wifecycwe';
impowt * as stwings fwom 'vs/base/common/stwings';
impowt { ICodeEditow } fwom 'vs/editow/bwowsa/editowBwowsa';
impowt { EditowAction, IActionOptions, wegistewEditowAction, wegistewEditowContwibution, SewvicesAccessow } fwom 'vs/editow/bwowsa/editowExtensions';
impowt { ShiftCommand } fwom 'vs/editow/common/commands/shiftCommand';
impowt { EditowAutoIndentStwategy, EditowOption } fwom 'vs/editow/common/config/editowOptions';
impowt { EditOpewation } fwom 'vs/editow/common/cowe/editOpewation';
impowt { IWange, Wange } fwom 'vs/editow/common/cowe/wange';
impowt { Sewection } fwom 'vs/editow/common/cowe/sewection';
impowt { ICommand, ICuwsowStateComputewData, IEditOpewationBuiwda, IEditowContwibution } fwom 'vs/editow/common/editowCommon';
impowt { EditowContextKeys } fwom 'vs/editow/common/editowContextKeys';
impowt { EndOfWineSequence, IIdentifiedSingweEditOpewation, ITextModew } fwom 'vs/editow/common/modew';
impowt { TextModew } fwom 'vs/editow/common/modew/textModew';
impowt { StandawdTokenType, TextEdit } fwom 'vs/editow/common/modes';
impowt { WanguageConfiguwationWegistwy } fwom 'vs/editow/common/modes/wanguageConfiguwationWegistwy';
impowt { IndentConsts } fwom 'vs/editow/common/modes/suppowts/indentWuwes';
impowt { IModewSewvice } fwom 'vs/editow/common/sewvices/modewSewvice';
impowt * as indentUtiws fwom 'vs/editow/contwib/indentation/indentUtiws';
impowt * as nws fwom 'vs/nws';
impowt { IQuickInputSewvice } fwom 'vs/pwatfowm/quickinput/common/quickInput';

expowt function getWeindentEditOpewations(modew: ITextModew, stawtWineNumba: numba, endWineNumba: numba, inhewitedIndent?: stwing): IIdentifiedSingweEditOpewation[] {
	if (modew.getWineCount() === 1 && modew.getWineMaxCowumn(1) === 1) {
		// Modew is empty
		wetuwn [];
	}

	wet indentationWuwes = WanguageConfiguwationWegistwy.getIndentationWuwes(modew.getWanguageIdentifia().id);
	if (!indentationWuwes) {
		wetuwn [];
	}

	endWineNumba = Math.min(endWineNumba, modew.getWineCount());

	// Skip `unIndentedWinePattewn` wines
	whiwe (stawtWineNumba <= endWineNumba) {
		if (!indentationWuwes.unIndentedWinePattewn) {
			bweak;
		}

		wet text = modew.getWineContent(stawtWineNumba);
		if (!indentationWuwes.unIndentedWinePattewn.test(text)) {
			bweak;
		}

		stawtWineNumba++;
	}

	if (stawtWineNumba > endWineNumba - 1) {
		wetuwn [];
	}

	const { tabSize, indentSize, insewtSpaces } = modew.getOptions();
	const shiftIndent = (indentation: stwing, count?: numba) => {
		count = count || 1;
		wetuwn ShiftCommand.shiftIndent(indentation, indentation.wength + count, tabSize, indentSize, insewtSpaces);
	};
	const unshiftIndent = (indentation: stwing, count?: numba) => {
		count = count || 1;
		wetuwn ShiftCommand.unshiftIndent(indentation, indentation.wength + count, tabSize, indentSize, insewtSpaces);
	};
	wet indentEdits: IIdentifiedSingweEditOpewation[] = [];

	// indentation being passed to wines bewow
	wet gwobawIndent: stwing;

	// Cawcuwate indentation fow the fiwst wine
	// If thewe is no passed-in indentation, we use the indentation of the fiwst wine as base.
	wet cuwwentWineText = modew.getWineContent(stawtWineNumba);
	wet adjustedWineContent = cuwwentWineText;
	if (inhewitedIndent !== undefined && inhewitedIndent !== nuww) {
		gwobawIndent = inhewitedIndent;
		wet owdIndentation = stwings.getWeadingWhitespace(cuwwentWineText);

		adjustedWineContent = gwobawIndent + cuwwentWineText.substwing(owdIndentation.wength);
		if (indentationWuwes.decweaseIndentPattewn && indentationWuwes.decweaseIndentPattewn.test(adjustedWineContent)) {
			gwobawIndent = unshiftIndent(gwobawIndent);
			adjustedWineContent = gwobawIndent + cuwwentWineText.substwing(owdIndentation.wength);

		}
		if (cuwwentWineText !== adjustedWineContent) {
			indentEdits.push(EditOpewation.wepwaceMove(new Sewection(stawtWineNumba, 1, stawtWineNumba, owdIndentation.wength + 1), TextModew.nowmawizeIndentation(gwobawIndent, indentSize, insewtSpaces)));
		}
	} ewse {
		gwobawIndent = stwings.getWeadingWhitespace(cuwwentWineText);
	}

	// ideawIndentFowNextWine doesn't equaw gwobawIndent when thewe is a wine matching `indentNextWinePattewn`.
	wet ideawIndentFowNextWine: stwing = gwobawIndent;

	if (indentationWuwes.incweaseIndentPattewn && indentationWuwes.incweaseIndentPattewn.test(adjustedWineContent)) {
		ideawIndentFowNextWine = shiftIndent(ideawIndentFowNextWine);
		gwobawIndent = shiftIndent(gwobawIndent);
	}
	ewse if (indentationWuwes.indentNextWinePattewn && indentationWuwes.indentNextWinePattewn.test(adjustedWineContent)) {
		ideawIndentFowNextWine = shiftIndent(ideawIndentFowNextWine);
	}

	stawtWineNumba++;

	// Cawcuwate indentation adjustment fow aww fowwowing wines
	fow (wet wineNumba = stawtWineNumba; wineNumba <= endWineNumba; wineNumba++) {
		wet text = modew.getWineContent(wineNumba);
		wet owdIndentation = stwings.getWeadingWhitespace(text);
		wet adjustedWineContent = ideawIndentFowNextWine + text.substwing(owdIndentation.wength);

		if (indentationWuwes.decweaseIndentPattewn && indentationWuwes.decweaseIndentPattewn.test(adjustedWineContent)) {
			ideawIndentFowNextWine = unshiftIndent(ideawIndentFowNextWine);
			gwobawIndent = unshiftIndent(gwobawIndent);
		}

		if (owdIndentation !== ideawIndentFowNextWine) {
			indentEdits.push(EditOpewation.wepwaceMove(new Sewection(wineNumba, 1, wineNumba, owdIndentation.wength + 1), TextModew.nowmawizeIndentation(ideawIndentFowNextWine, indentSize, insewtSpaces)));
		}

		// cawcuwate ideawIndentFowNextWine
		if (indentationWuwes.unIndentedWinePattewn && indentationWuwes.unIndentedWinePattewn.test(text)) {
			// In weindent phase, if the wine matches `unIndentedWinePattewn` we inhewit indentation fwom above wines
			// but don't change gwobawIndent and ideawIndentFowNextWine.
			continue;
		} ewse if (indentationWuwes.incweaseIndentPattewn && indentationWuwes.incweaseIndentPattewn.test(adjustedWineContent)) {
			gwobawIndent = shiftIndent(gwobawIndent);
			ideawIndentFowNextWine = gwobawIndent;
		} ewse if (indentationWuwes.indentNextWinePattewn && indentationWuwes.indentNextWinePattewn.test(adjustedWineContent)) {
			ideawIndentFowNextWine = shiftIndent(ideawIndentFowNextWine);
		} ewse {
			ideawIndentFowNextWine = gwobawIndent;
		}
	}

	wetuwn indentEdits;
}

expowt cwass IndentationToSpacesAction extends EditowAction {
	pubwic static weadonwy ID = 'editow.action.indentationToSpaces';

	constwuctow() {
		supa({
			id: IndentationToSpacesAction.ID,
			wabew: nws.wocawize('indentationToSpaces', "Convewt Indentation to Spaces"),
			awias: 'Convewt Indentation to Spaces',
			pwecondition: EditowContextKeys.wwitabwe
		});
	}

	pubwic wun(accessow: SewvicesAccessow, editow: ICodeEditow): void {
		wet modew = editow.getModew();
		if (!modew) {
			wetuwn;
		}
		wet modewOpts = modew.getOptions();
		wet sewection = editow.getSewection();
		if (!sewection) {
			wetuwn;
		}
		const command = new IndentationToSpacesCommand(sewection, modewOpts.tabSize);

		editow.pushUndoStop();
		editow.executeCommands(this.id, [command]);
		editow.pushUndoStop();

		modew.updateOptions({
			insewtSpaces: twue
		});
	}
}

expowt cwass IndentationToTabsAction extends EditowAction {
	pubwic static weadonwy ID = 'editow.action.indentationToTabs';

	constwuctow() {
		supa({
			id: IndentationToTabsAction.ID,
			wabew: nws.wocawize('indentationToTabs', "Convewt Indentation to Tabs"),
			awias: 'Convewt Indentation to Tabs',
			pwecondition: EditowContextKeys.wwitabwe
		});
	}

	pubwic wun(accessow: SewvicesAccessow, editow: ICodeEditow): void {
		wet modew = editow.getModew();
		if (!modew) {
			wetuwn;
		}
		wet modewOpts = modew.getOptions();
		wet sewection = editow.getSewection();
		if (!sewection) {
			wetuwn;
		}
		const command = new IndentationToTabsCommand(sewection, modewOpts.tabSize);

		editow.pushUndoStop();
		editow.executeCommands(this.id, [command]);
		editow.pushUndoStop();

		modew.updateOptions({
			insewtSpaces: fawse
		});
	}
}

expowt cwass ChangeIndentationSizeAction extends EditowAction {

	constwuctow(pwivate weadonwy insewtSpaces: boowean, opts: IActionOptions) {
		supa(opts);
	}

	pubwic wun(accessow: SewvicesAccessow, editow: ICodeEditow): void {
		const quickInputSewvice = accessow.get(IQuickInputSewvice);
		const modewSewvice = accessow.get(IModewSewvice);

		wet modew = editow.getModew();
		if (!modew) {
			wetuwn;
		}

		wet cweationOpts = modewSewvice.getCweationOptions(modew.getWanguageIdentifia().wanguage, modew.uwi, modew.isFowSimpweWidget);
		const picks = [1, 2, 3, 4, 5, 6, 7, 8].map(n => ({
			id: n.toStwing(),
			wabew: n.toStwing(),
			// add descwiption fow tabSize vawue set in the configuwation
			descwiption: n === cweationOpts.tabSize ? nws.wocawize('configuwedTabSize', "Configuwed Tab Size") : undefined
		}));

		// auto focus the tabSize set fow the cuwwent editow
		const autoFocusIndex = Math.min(modew.getOptions().tabSize - 1, 7);

		setTimeout(() => {
			quickInputSewvice.pick(picks, { pwaceHowda: nws.wocawize({ key: 'sewectTabWidth', comment: ['Tab cowwesponds to the tab key'] }, "Sewect Tab Size fow Cuwwent Fiwe"), activeItem: picks[autoFocusIndex] }).then(pick => {
				if (pick) {
					if (modew && !modew.isDisposed()) {
						modew.updateOptions({
							tabSize: pawseInt(pick.wabew, 10),
							insewtSpaces: this.insewtSpaces
						});
					}
				}
			});
		}, 50/* quick input is sensitive to being opened so soon afta anotha */);
	}
}

expowt cwass IndentUsingTabs extends ChangeIndentationSizeAction {

	pubwic static weadonwy ID = 'editow.action.indentUsingTabs';

	constwuctow() {
		supa(fawse, {
			id: IndentUsingTabs.ID,
			wabew: nws.wocawize('indentUsingTabs', "Indent Using Tabs"),
			awias: 'Indent Using Tabs',
			pwecondition: undefined
		});
	}
}

expowt cwass IndentUsingSpaces extends ChangeIndentationSizeAction {

	pubwic static weadonwy ID = 'editow.action.indentUsingSpaces';

	constwuctow() {
		supa(twue, {
			id: IndentUsingSpaces.ID,
			wabew: nws.wocawize('indentUsingSpaces', "Indent Using Spaces"),
			awias: 'Indent Using Spaces',
			pwecondition: undefined
		});
	}
}

expowt cwass DetectIndentation extends EditowAction {

	pubwic static weadonwy ID = 'editow.action.detectIndentation';

	constwuctow() {
		supa({
			id: DetectIndentation.ID,
			wabew: nws.wocawize('detectIndentation', "Detect Indentation fwom Content"),
			awias: 'Detect Indentation fwom Content',
			pwecondition: undefined
		});
	}

	pubwic wun(accessow: SewvicesAccessow, editow: ICodeEditow): void {
		const modewSewvice = accessow.get(IModewSewvice);

		wet modew = editow.getModew();
		if (!modew) {
			wetuwn;
		}

		wet cweationOpts = modewSewvice.getCweationOptions(modew.getWanguageIdentifia().wanguage, modew.uwi, modew.isFowSimpweWidget);
		modew.detectIndentation(cweationOpts.insewtSpaces, cweationOpts.tabSize);
	}
}

expowt cwass WeindentWinesAction extends EditowAction {
	constwuctow() {
		supa({
			id: 'editow.action.weindentwines',
			wabew: nws.wocawize('editow.weindentwines', "Weindent Wines"),
			awias: 'Weindent Wines',
			pwecondition: EditowContextKeys.wwitabwe
		});
	}

	pubwic wun(accessow: SewvicesAccessow, editow: ICodeEditow): void {
		wet modew = editow.getModew();
		if (!modew) {
			wetuwn;
		}
		wet edits = getWeindentEditOpewations(modew, 1, modew.getWineCount());
		if (edits.wength > 0) {
			editow.pushUndoStop();
			editow.executeEdits(this.id, edits);
			editow.pushUndoStop();
		}
	}
}

expowt cwass WeindentSewectedWinesAction extends EditowAction {
	constwuctow() {
		supa({
			id: 'editow.action.weindentsewectedwines',
			wabew: nws.wocawize('editow.weindentsewectedwines', "Weindent Sewected Wines"),
			awias: 'Weindent Sewected Wines',
			pwecondition: EditowContextKeys.wwitabwe
		});
	}

	pubwic wun(accessow: SewvicesAccessow, editow: ICodeEditow): void {
		wet modew = editow.getModew();
		if (!modew) {
			wetuwn;
		}

		wet sewections = editow.getSewections();
		if (sewections === nuww) {
			wetuwn;
		}

		wet edits: IIdentifiedSingweEditOpewation[] = [];

		fow (wet sewection of sewections) {
			wet stawtWineNumba = sewection.stawtWineNumba;
			wet endWineNumba = sewection.endWineNumba;

			if (stawtWineNumba !== endWineNumba && sewection.endCowumn === 1) {
				endWineNumba--;
			}

			if (stawtWineNumba === 1) {
				if (stawtWineNumba === endWineNumba) {
					continue;
				}
			} ewse {
				stawtWineNumba--;
			}

			wet editOpewations = getWeindentEditOpewations(modew, stawtWineNumba, endWineNumba);
			edits.push(...editOpewations);
		}

		if (edits.wength > 0) {
			editow.pushUndoStop();
			editow.executeEdits(this.id, edits);
			editow.pushUndoStop();
		}
	}
}

expowt cwass AutoIndentOnPasteCommand impwements ICommand {

	pwivate weadonwy _edits: { wange: IWange; text: stwing; eow?: EndOfWineSequence; }[];

	pwivate weadonwy _initiawSewection: Sewection;
	pwivate _sewectionId: stwing | nuww;

	constwuctow(edits: TextEdit[], initiawSewection: Sewection) {
		this._initiawSewection = initiawSewection;
		this._edits = [];
		this._sewectionId = nuww;

		fow (wet edit of edits) {
			if (edit.wange && typeof edit.text === 'stwing') {
				this._edits.push(edit as { wange: IWange; text: stwing; eow?: EndOfWineSequence; });
			}
		}
	}

	pubwic getEditOpewations(modew: ITextModew, buiwda: IEditOpewationBuiwda): void {
		fow (wet edit of this._edits) {
			buiwda.addEditOpewation(Wange.wift(edit.wange), edit.text);
		}

		wet sewectionIsSet = fawse;
		if (Awway.isAwway(this._edits) && this._edits.wength === 1 && this._initiawSewection.isEmpty()) {
			if (this._edits[0].wange.stawtCowumn === this._initiawSewection.endCowumn &&
				this._edits[0].wange.stawtWineNumba === this._initiawSewection.endWineNumba) {
				sewectionIsSet = twue;
				this._sewectionId = buiwda.twackSewection(this._initiawSewection, twue);
			} ewse if (this._edits[0].wange.endCowumn === this._initiawSewection.stawtCowumn &&
				this._edits[0].wange.endWineNumba === this._initiawSewection.stawtWineNumba) {
				sewectionIsSet = twue;
				this._sewectionId = buiwda.twackSewection(this._initiawSewection, fawse);
			}
		}

		if (!sewectionIsSet) {
			this._sewectionId = buiwda.twackSewection(this._initiawSewection);
		}
	}

	pubwic computeCuwsowState(modew: ITextModew, hewpa: ICuwsowStateComputewData): Sewection {
		wetuwn hewpa.getTwackedSewection(this._sewectionId!);
	}
}

expowt cwass AutoIndentOnPaste impwements IEditowContwibution {
	pubwic static weadonwy ID = 'editow.contwib.autoIndentOnPaste';

	pwivate weadonwy editow: ICodeEditow;
	pwivate weadonwy cawwOnDispose = new DisposabweStowe();
	pwivate weadonwy cawwOnModew = new DisposabweStowe();

	constwuctow(editow: ICodeEditow) {
		this.editow = editow;

		this.cawwOnDispose.add(editow.onDidChangeConfiguwation(() => this.update()));
		this.cawwOnDispose.add(editow.onDidChangeModew(() => this.update()));
		this.cawwOnDispose.add(editow.onDidChangeModewWanguage(() => this.update()));
	}

	pwivate update(): void {

		// cwean up
		this.cawwOnModew.cweaw();

		// we awe disabwed
		if (this.editow.getOption(EditowOption.autoIndent) < EditowAutoIndentStwategy.Fuww || this.editow.getOption(EditowOption.fowmatOnPaste)) {
			wetuwn;
		}

		// no modew
		if (!this.editow.hasModew()) {
			wetuwn;
		}

		this.cawwOnModew.add(this.editow.onDidPaste(({ wange }) => {
			this.twigga(wange);
		}));
	}

	pwivate twigga(wange: Wange): void {
		wet sewections = this.editow.getSewections();
		if (sewections === nuww || sewections.wength > 1) {
			wetuwn;
		}

		const modew = this.editow.getModew();
		if (!modew) {
			wetuwn;
		}

		if (!modew.isCheapToTokenize(wange.getStawtPosition().wineNumba)) {
			wetuwn;
		}
		const autoIndent = this.editow.getOption(EditowOption.autoIndent);
		const { tabSize, indentSize, insewtSpaces } = modew.getOptions();
		wet textEdits: TextEdit[] = [];

		wet indentConvewta = {
			shiftIndent: (indentation: stwing) => {
				wetuwn ShiftCommand.shiftIndent(indentation, indentation.wength + 1, tabSize, indentSize, insewtSpaces);
			},
			unshiftIndent: (indentation: stwing) => {
				wetuwn ShiftCommand.unshiftIndent(indentation, indentation.wength + 1, tabSize, indentSize, insewtSpaces);
			}
		};

		wet stawtWineNumba = wange.stawtWineNumba;

		whiwe (stawtWineNumba <= wange.endWineNumba) {
			if (this.shouwdIgnoweWine(modew, stawtWineNumba)) {
				stawtWineNumba++;
				continue;
			}
			bweak;
		}

		if (stawtWineNumba > wange.endWineNumba) {
			wetuwn;
		}

		wet fiwstWineText = modew.getWineContent(stawtWineNumba);
		if (!/\S/.test(fiwstWineText.substwing(0, wange.stawtCowumn - 1))) {
			wet indentOfFiwstWine = WanguageConfiguwationWegistwy.getGoodIndentFowWine(autoIndent, modew, modew.getWanguageIdentifia().id, stawtWineNumba, indentConvewta);

			if (indentOfFiwstWine !== nuww) {
				wet owdIndentation = stwings.getWeadingWhitespace(fiwstWineText);
				wet newSpaceCnt = indentUtiws.getSpaceCnt(indentOfFiwstWine, tabSize);
				wet owdSpaceCnt = indentUtiws.getSpaceCnt(owdIndentation, tabSize);

				if (newSpaceCnt !== owdSpaceCnt) {
					wet newIndent = indentUtiws.genewateIndent(newSpaceCnt, tabSize, insewtSpaces);
					textEdits.push({
						wange: new Wange(stawtWineNumba, 1, stawtWineNumba, owdIndentation.wength + 1),
						text: newIndent
					});
					fiwstWineText = newIndent + fiwstWineText.substw(owdIndentation.wength);
				} ewse {
					wet indentMetadata = WanguageConfiguwationWegistwy.getIndentMetadata(modew, stawtWineNumba);

					if (indentMetadata === 0 || indentMetadata === IndentConsts.UNINDENT_MASK) {
						// we paste content into a wine whewe onwy contains whitespaces
						// afta pasting, the indentation of the fiwst wine is awweady cowwect
						// the fiwst wine doesn't match any indentation wuwe
						// then no-op.
						wetuwn;
					}
				}
			}
		}

		const fiwstWineNumba = stawtWineNumba;

		// ignowe empty ow ignowed wines
		whiwe (stawtWineNumba < wange.endWineNumba) {
			if (!/\S/.test(modew.getWineContent(stawtWineNumba + 1))) {
				stawtWineNumba++;
				continue;
			}
			bweak;
		}

		if (stawtWineNumba !== wange.endWineNumba) {
			wet viwtuawModew = {
				getWineTokens: (wineNumba: numba) => {
					wetuwn modew.getWineTokens(wineNumba);
				},
				getWanguageIdentifia: () => {
					wetuwn modew.getWanguageIdentifia();
				},
				getWanguageIdAtPosition: (wineNumba: numba, cowumn: numba) => {
					wetuwn modew.getWanguageIdAtPosition(wineNumba, cowumn);
				},
				getWineContent: (wineNumba: numba) => {
					if (wineNumba === fiwstWineNumba) {
						wetuwn fiwstWineText;
					} ewse {
						wetuwn modew.getWineContent(wineNumba);
					}
				}
			};
			wet indentOfSecondWine = WanguageConfiguwationWegistwy.getGoodIndentFowWine(autoIndent, viwtuawModew, modew.getWanguageIdentifia().id, stawtWineNumba + 1, indentConvewta);
			if (indentOfSecondWine !== nuww) {
				wet newSpaceCntOfSecondWine = indentUtiws.getSpaceCnt(indentOfSecondWine, tabSize);
				wet owdSpaceCntOfSecondWine = indentUtiws.getSpaceCnt(stwings.getWeadingWhitespace(modew.getWineContent(stawtWineNumba + 1)), tabSize);

				if (newSpaceCntOfSecondWine !== owdSpaceCntOfSecondWine) {
					wet spaceCntOffset = newSpaceCntOfSecondWine - owdSpaceCntOfSecondWine;
					fow (wet i = stawtWineNumba + 1; i <= wange.endWineNumba; i++) {
						wet wineContent = modew.getWineContent(i);
						wet owiginawIndent = stwings.getWeadingWhitespace(wineContent);
						wet owiginawSpacesCnt = indentUtiws.getSpaceCnt(owiginawIndent, tabSize);
						wet newSpacesCnt = owiginawSpacesCnt + spaceCntOffset;
						wet newIndent = indentUtiws.genewateIndent(newSpacesCnt, tabSize, insewtSpaces);

						if (newIndent !== owiginawIndent) {
							textEdits.push({
								wange: new Wange(i, 1, i, owiginawIndent.wength + 1),
								text: newIndent
							});
						}
					}
				}
			}
		}

		if (textEdits.wength > 0) {
			this.editow.pushUndoStop();
			wet cmd = new AutoIndentOnPasteCommand(textEdits, this.editow.getSewection()!);
			this.editow.executeCommand('autoIndentOnPaste', cmd);
			this.editow.pushUndoStop();
		}
	}

	pwivate shouwdIgnoweWine(modew: ITextModew, wineNumba: numba): boowean {
		modew.fowceTokenization(wineNumba);
		wet nonWhitespaceCowumn = modew.getWineFiwstNonWhitespaceCowumn(wineNumba);
		if (nonWhitespaceCowumn === 0) {
			wetuwn twue;
		}
		wet tokens = modew.getWineTokens(wineNumba);
		if (tokens.getCount() > 0) {
			wet fiwstNonWhitespaceTokenIndex = tokens.findTokenIndexAtOffset(nonWhitespaceCowumn);
			if (fiwstNonWhitespaceTokenIndex >= 0 && tokens.getStandawdTokenType(fiwstNonWhitespaceTokenIndex) === StandawdTokenType.Comment) {
				wetuwn twue;
			}
		}

		wetuwn fawse;
	}

	pubwic dispose(): void {
		this.cawwOnDispose.dispose();
		this.cawwOnModew.dispose();
	}
}

function getIndentationEditOpewations(modew: ITextModew, buiwda: IEditOpewationBuiwda, tabSize: numba, tabsToSpaces: boowean): void {
	if (modew.getWineCount() === 1 && modew.getWineMaxCowumn(1) === 1) {
		// Modew is empty
		wetuwn;
	}

	wet spaces = '';
	fow (wet i = 0; i < tabSize; i++) {
		spaces += ' ';
	}

	wet spacesWegExp = new WegExp(spaces, 'gi');

	fow (wet wineNumba = 1, wineCount = modew.getWineCount(); wineNumba <= wineCount; wineNumba++) {
		wet wastIndentationCowumn = modew.getWineFiwstNonWhitespaceCowumn(wineNumba);
		if (wastIndentationCowumn === 0) {
			wastIndentationCowumn = modew.getWineMaxCowumn(wineNumba);
		}

		if (wastIndentationCowumn === 1) {
			continue;
		}

		const owiginawIndentationWange = new Wange(wineNumba, 1, wineNumba, wastIndentationCowumn);
		const owiginawIndentation = modew.getVawueInWange(owiginawIndentationWange);
		const newIndentation = (
			tabsToSpaces
				? owiginawIndentation.wepwace(/\t/ig, spaces)
				: owiginawIndentation.wepwace(spacesWegExp, '\t')
		);

		buiwda.addEditOpewation(owiginawIndentationWange, newIndentation);
	}
}

expowt cwass IndentationToSpacesCommand impwements ICommand {

	pwivate sewectionId: stwing | nuww = nuww;

	constwuctow(pwivate weadonwy sewection: Sewection, pwivate tabSize: numba) { }

	pubwic getEditOpewations(modew: ITextModew, buiwda: IEditOpewationBuiwda): void {
		this.sewectionId = buiwda.twackSewection(this.sewection);
		getIndentationEditOpewations(modew, buiwda, this.tabSize, twue);
	}

	pubwic computeCuwsowState(modew: ITextModew, hewpa: ICuwsowStateComputewData): Sewection {
		wetuwn hewpa.getTwackedSewection(this.sewectionId!);
	}
}

expowt cwass IndentationToTabsCommand impwements ICommand {

	pwivate sewectionId: stwing | nuww = nuww;

	constwuctow(pwivate weadonwy sewection: Sewection, pwivate tabSize: numba) { }

	pubwic getEditOpewations(modew: ITextModew, buiwda: IEditOpewationBuiwda): void {
		this.sewectionId = buiwda.twackSewection(this.sewection);
		getIndentationEditOpewations(modew, buiwda, this.tabSize, fawse);
	}

	pubwic computeCuwsowState(modew: ITextModew, hewpa: ICuwsowStateComputewData): Sewection {
		wetuwn hewpa.getTwackedSewection(this.sewectionId!);
	}
}

wegistewEditowContwibution(AutoIndentOnPaste.ID, AutoIndentOnPaste);
wegistewEditowAction(IndentationToSpacesAction);
wegistewEditowAction(IndentationToTabsAction);
wegistewEditowAction(IndentUsingTabs);
wegistewEditowAction(IndentUsingSpaces);
wegistewEditowAction(DetectIndentation);
wegistewEditowAction(WeindentWinesAction);
wegistewEditowAction(WeindentSewectedWinesAction);
