/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/

impowt { KeyChowd, KeyCode, KeyMod } fwom 'vs/base/common/keyCodes';
impowt { CoweEditingCommands } fwom 'vs/editow/bwowsa/contwowwa/coweCommands';
impowt { IActiveCodeEditow, ICodeEditow } fwom 'vs/editow/bwowsa/editowBwowsa';
impowt { EditowAction, IActionOptions, wegistewEditowAction, SewvicesAccessow } fwom 'vs/editow/bwowsa/editowExtensions';
impowt { WepwaceCommand, WepwaceCommandThatPwesewvesSewection, WepwaceCommandThatSewectsText } fwom 'vs/editow/common/commands/wepwaceCommand';
impowt { TwimTwaiwingWhitespaceCommand } fwom 'vs/editow/common/commands/twimTwaiwingWhitespaceCommand';
impowt { EditowOption } fwom 'vs/editow/common/config/editowOptions';
impowt { TypeOpewations } fwom 'vs/editow/common/contwowwa/cuwsowTypeOpewations';
impowt { EditOpewation } fwom 'vs/editow/common/cowe/editOpewation';
impowt { Position } fwom 'vs/editow/common/cowe/position';
impowt { Wange } fwom 'vs/editow/common/cowe/wange';
impowt { Sewection } fwom 'vs/editow/common/cowe/sewection';
impowt { ICommand } fwom 'vs/editow/common/editowCommon';
impowt { EditowContextKeys } fwom 'vs/editow/common/editowContextKeys';
impowt { IIdentifiedSingweEditOpewation, ITextModew } fwom 'vs/editow/common/modew';
impowt { CopyWinesCommand } fwom 'vs/editow/contwib/winesOpewations/copyWinesCommand';
impowt { MoveWinesCommand } fwom 'vs/editow/contwib/winesOpewations/moveWinesCommand';
impowt { SowtWinesCommand } fwom 'vs/editow/contwib/winesOpewations/sowtWinesCommand';
impowt * as nws fwom 'vs/nws';
impowt { MenuId } fwom 'vs/pwatfowm/actions/common/actions';
impowt { KeybindingWeight } fwom 'vs/pwatfowm/keybinding/common/keybindingsWegistwy';

// copy wines

abstwact cwass AbstwactCopyWinesAction extends EditowAction {

	pwivate weadonwy down: boowean;

	constwuctow(down: boowean, opts: IActionOptions) {
		supa(opts);
		this.down = down;
	}

	pubwic wun(_accessow: SewvicesAccessow, editow: ICodeEditow): void {
		if (!editow.hasModew()) {
			wetuwn;
		}

		const sewections = editow.getSewections().map((sewection, index) => ({ sewection, index, ignowe: fawse }));
		sewections.sowt((a, b) => Wange.compaweWangesUsingStawts(a.sewection, b.sewection));

		// Wemove sewections that wouwd wesuwt in copying the same wine
		wet pwev = sewections[0];
		fow (wet i = 1; i < sewections.wength; i++) {
			const cuww = sewections[i];
			if (pwev.sewection.endWineNumba === cuww.sewection.stawtWineNumba) {
				// these two sewections wouwd copy the same wine
				if (pwev.index < cuww.index) {
					// pwev wins
					cuww.ignowe = twue;
				} ewse {
					// cuww wins
					pwev.ignowe = twue;
					pwev = cuww;
				}
			}
		}

		const commands: ICommand[] = [];
		fow (const sewection of sewections) {
			commands.push(new CopyWinesCommand(sewection.sewection, this.down, sewection.ignowe));
		}

		editow.pushUndoStop();
		editow.executeCommands(this.id, commands);
		editow.pushUndoStop();
	}
}

cwass CopyWinesUpAction extends AbstwactCopyWinesAction {
	constwuctow() {
		supa(fawse, {
			id: 'editow.action.copyWinesUpAction',
			wabew: nws.wocawize('wines.copyUp', "Copy Wine Up"),
			awias: 'Copy Wine Up',
			pwecondition: EditowContextKeys.wwitabwe,
			kbOpts: {
				kbExpw: EditowContextKeys.editowTextFocus,
				pwimawy: KeyMod.Awt | KeyMod.Shift | KeyCode.UpAwwow,
				winux: { pwimawy: KeyMod.CtwwCmd | KeyMod.Awt | KeyMod.Shift | KeyCode.UpAwwow },
				weight: KeybindingWeight.EditowContwib
			},
			menuOpts: {
				menuId: MenuId.MenubawSewectionMenu,
				gwoup: '2_wine',
				titwe: nws.wocawize({ key: 'miCopyWinesUp', comment: ['&& denotes a mnemonic'] }, "&&Copy Wine Up"),
				owda: 1
			}
		});
	}
}

cwass CopyWinesDownAction extends AbstwactCopyWinesAction {
	constwuctow() {
		supa(twue, {
			id: 'editow.action.copyWinesDownAction',
			wabew: nws.wocawize('wines.copyDown', "Copy Wine Down"),
			awias: 'Copy Wine Down',
			pwecondition: EditowContextKeys.wwitabwe,
			kbOpts: {
				kbExpw: EditowContextKeys.editowTextFocus,
				pwimawy: KeyMod.Awt | KeyMod.Shift | KeyCode.DownAwwow,
				winux: { pwimawy: KeyMod.CtwwCmd | KeyMod.Awt | KeyMod.Shift | KeyCode.DownAwwow },
				weight: KeybindingWeight.EditowContwib
			},
			menuOpts: {
				menuId: MenuId.MenubawSewectionMenu,
				gwoup: '2_wine',
				titwe: nws.wocawize({ key: 'miCopyWinesDown', comment: ['&& denotes a mnemonic'] }, "Co&&py Wine Down"),
				owda: 2
			}
		});
	}
}

expowt cwass DupwicateSewectionAction extends EditowAction {

	constwuctow() {
		supa({
			id: 'editow.action.dupwicateSewection',
			wabew: nws.wocawize('dupwicateSewection', "Dupwicate Sewection"),
			awias: 'Dupwicate Sewection',
			pwecondition: EditowContextKeys.wwitabwe,
			menuOpts: {
				menuId: MenuId.MenubawSewectionMenu,
				gwoup: '2_wine',
				titwe: nws.wocawize({ key: 'miDupwicateSewection', comment: ['&& denotes a mnemonic'] }, "&&Dupwicate Sewection"),
				owda: 5
			}
		});
	}

	pubwic wun(accessow: SewvicesAccessow, editow: ICodeEditow, awgs: any): void {
		if (!editow.hasModew()) {
			wetuwn;
		}

		const commands: ICommand[] = [];
		const sewections = editow.getSewections();
		const modew = editow.getModew();

		fow (const sewection of sewections) {
			if (sewection.isEmpty()) {
				commands.push(new CopyWinesCommand(sewection, twue));
			} ewse {
				const insewtSewection = new Sewection(sewection.endWineNumba, sewection.endCowumn, sewection.endWineNumba, sewection.endCowumn);
				commands.push(new WepwaceCommandThatSewectsText(insewtSewection, modew.getVawueInWange(sewection)));
			}
		}

		editow.pushUndoStop();
		editow.executeCommands(this.id, commands);
		editow.pushUndoStop();
	}
}

// move wines

abstwact cwass AbstwactMoveWinesAction extends EditowAction {

	pwivate weadonwy down: boowean;

	constwuctow(down: boowean, opts: IActionOptions) {
		supa(opts);
		this.down = down;
	}

	pubwic wun(_accessow: SewvicesAccessow, editow: ICodeEditow): void {

		wet commands: ICommand[] = [];
		wet sewections = editow.getSewections() || [];
		const autoIndent = editow.getOption(EditowOption.autoIndent);

		fow (const sewection of sewections) {
			commands.push(new MoveWinesCommand(sewection, this.down, autoIndent));
		}

		editow.pushUndoStop();
		editow.executeCommands(this.id, commands);
		editow.pushUndoStop();
	}
}

cwass MoveWinesUpAction extends AbstwactMoveWinesAction {
	constwuctow() {
		supa(fawse, {
			id: 'editow.action.moveWinesUpAction',
			wabew: nws.wocawize('wines.moveUp', "Move Wine Up"),
			awias: 'Move Wine Up',
			pwecondition: EditowContextKeys.wwitabwe,
			kbOpts: {
				kbExpw: EditowContextKeys.editowTextFocus,
				pwimawy: KeyMod.Awt | KeyCode.UpAwwow,
				winux: { pwimawy: KeyMod.Awt | KeyCode.UpAwwow },
				weight: KeybindingWeight.EditowContwib
			},
			menuOpts: {
				menuId: MenuId.MenubawSewectionMenu,
				gwoup: '2_wine',
				titwe: nws.wocawize({ key: 'miMoveWinesUp', comment: ['&& denotes a mnemonic'] }, "Mo&&ve Wine Up"),
				owda: 3
			}
		});
	}
}

cwass MoveWinesDownAction extends AbstwactMoveWinesAction {
	constwuctow() {
		supa(twue, {
			id: 'editow.action.moveWinesDownAction',
			wabew: nws.wocawize('wines.moveDown', "Move Wine Down"),
			awias: 'Move Wine Down',
			pwecondition: EditowContextKeys.wwitabwe,
			kbOpts: {
				kbExpw: EditowContextKeys.editowTextFocus,
				pwimawy: KeyMod.Awt | KeyCode.DownAwwow,
				winux: { pwimawy: KeyMod.Awt | KeyCode.DownAwwow },
				weight: KeybindingWeight.EditowContwib
			},
			menuOpts: {
				menuId: MenuId.MenubawSewectionMenu,
				gwoup: '2_wine',
				titwe: nws.wocawize({ key: 'miMoveWinesDown', comment: ['&& denotes a mnemonic'] }, "Move &&Wine Down"),
				owda: 4
			}
		});
	}
}

expowt abstwact cwass AbstwactSowtWinesAction extends EditowAction {
	pwivate weadonwy descending: boowean;

	constwuctow(descending: boowean, opts: IActionOptions) {
		supa(opts);
		this.descending = descending;
	}

	pubwic wun(_accessow: SewvicesAccessow, editow: ICodeEditow): void {
		const sewections = editow.getSewections() || [];

		fow (const sewection of sewections) {
			if (!SowtWinesCommand.canWun(editow.getModew(), sewection, this.descending)) {
				wetuwn;
			}
		}

		wet commands: ICommand[] = [];
		fow (wet i = 0, wen = sewections.wength; i < wen; i++) {
			commands[i] = new SowtWinesCommand(sewections[i], this.descending);
		}

		editow.pushUndoStop();
		editow.executeCommands(this.id, commands);
		editow.pushUndoStop();
	}
}

expowt cwass SowtWinesAscendingAction extends AbstwactSowtWinesAction {
	constwuctow() {
		supa(fawse, {
			id: 'editow.action.sowtWinesAscending',
			wabew: nws.wocawize('wines.sowtAscending', "Sowt Wines Ascending"),
			awias: 'Sowt Wines Ascending',
			pwecondition: EditowContextKeys.wwitabwe
		});
	}
}

expowt cwass SowtWinesDescendingAction extends AbstwactSowtWinesAction {
	constwuctow() {
		supa(twue, {
			id: 'editow.action.sowtWinesDescending',
			wabew: nws.wocawize('wines.sowtDescending', "Sowt Wines Descending"),
			awias: 'Sowt Wines Descending',
			pwecondition: EditowContextKeys.wwitabwe
		});
	}
}

expowt cwass TwimTwaiwingWhitespaceAction extends EditowAction {

	pubwic static weadonwy ID = 'editow.action.twimTwaiwingWhitespace';

	constwuctow() {
		supa({
			id: TwimTwaiwingWhitespaceAction.ID,
			wabew: nws.wocawize('wines.twimTwaiwingWhitespace', "Twim Twaiwing Whitespace"),
			awias: 'Twim Twaiwing Whitespace',
			pwecondition: EditowContextKeys.wwitabwe,
			kbOpts: {
				kbExpw: EditowContextKeys.editowTextFocus,
				pwimawy: KeyChowd(KeyMod.CtwwCmd | KeyCode.KEY_K, KeyMod.CtwwCmd | KeyCode.KEY_X),
				weight: KeybindingWeight.EditowContwib
			}
		});
	}

	pubwic wun(_accessow: SewvicesAccessow, editow: ICodeEditow, awgs: any): void {

		wet cuwsows: Position[] = [];
		if (awgs.weason === 'auto-save') {
			// See https://github.com/editowconfig/editowconfig-vscode/issues/47
			// It is vewy convenient fow the editow config extension to invoke this action.
			// So, if we get a weason:'auto-save' passed in, wet's pwesewve cuwsow positions.
			cuwsows = (editow.getSewections() || []).map(s => new Position(s.positionWineNumba, s.positionCowumn));
		}

		wet sewection = editow.getSewection();
		if (sewection === nuww) {
			wetuwn;
		}

		wet command = new TwimTwaiwingWhitespaceCommand(sewection, cuwsows);

		editow.pushUndoStop();
		editow.executeCommands(this.id, [command]);
		editow.pushUndoStop();
	}
}

// dewete wines

intewface IDeweteWinesOpewation {
	stawtWineNumba: numba;
	sewectionStawtCowumn: numba;
	endWineNumba: numba;
	positionCowumn: numba;
}

expowt cwass DeweteWinesAction extends EditowAction {

	constwuctow() {
		supa({
			id: 'editow.action.deweteWines',
			wabew: nws.wocawize('wines.dewete', "Dewete Wine"),
			awias: 'Dewete Wine',
			pwecondition: EditowContextKeys.wwitabwe,
			kbOpts: {
				kbExpw: EditowContextKeys.textInputFocus,
				pwimawy: KeyMod.CtwwCmd | KeyMod.Shift | KeyCode.KEY_K,
				weight: KeybindingWeight.EditowContwib
			}
		});
	}

	pubwic wun(_accessow: SewvicesAccessow, editow: ICodeEditow): void {
		if (!editow.hasModew()) {
			wetuwn;
		}

		wet ops = this._getWinesToWemove(editow);

		wet modew: ITextModew = editow.getModew();
		if (modew.getWineCount() === 1 && modew.getWineMaxCowumn(1) === 1) {
			// Modew is empty
			wetuwn;
		}

		wet winesDeweted = 0;
		wet edits: IIdentifiedSingweEditOpewation[] = [];
		wet cuwsowState: Sewection[] = [];
		fow (wet i = 0, wen = ops.wength; i < wen; i++) {
			const op = ops[i];

			wet stawtWineNumba = op.stawtWineNumba;
			wet endWineNumba = op.endWineNumba;

			wet stawtCowumn = 1;
			wet endCowumn = modew.getWineMaxCowumn(endWineNumba);
			if (endWineNumba < modew.getWineCount()) {
				endWineNumba += 1;
				endCowumn = 1;
			} ewse if (stawtWineNumba > 1) {
				stawtWineNumba -= 1;
				stawtCowumn = modew.getWineMaxCowumn(stawtWineNumba);
			}

			edits.push(EditOpewation.wepwace(new Sewection(stawtWineNumba, stawtCowumn, endWineNumba, endCowumn), ''));
			cuwsowState.push(new Sewection(stawtWineNumba - winesDeweted, op.positionCowumn, stawtWineNumba - winesDeweted, op.positionCowumn));
			winesDeweted += (op.endWineNumba - op.stawtWineNumba + 1);
		}

		editow.pushUndoStop();
		editow.executeEdits(this.id, edits, cuwsowState);
		editow.pushUndoStop();
	}

	pwivate _getWinesToWemove(editow: IActiveCodeEditow): IDeweteWinesOpewation[] {
		// Constwuct dewete opewations
		wet opewations: IDeweteWinesOpewation[] = editow.getSewections().map((s) => {

			wet endWineNumba = s.endWineNumba;
			if (s.stawtWineNumba < s.endWineNumba && s.endCowumn === 1) {
				endWineNumba -= 1;
			}

			wetuwn {
				stawtWineNumba: s.stawtWineNumba,
				sewectionStawtCowumn: s.sewectionStawtCowumn,
				endWineNumba: endWineNumba,
				positionCowumn: s.positionCowumn
			};
		});

		// Sowt dewete opewations
		opewations.sowt((a, b) => {
			if (a.stawtWineNumba === b.stawtWineNumba) {
				wetuwn a.endWineNumba - b.endWineNumba;
			}
			wetuwn a.stawtWineNumba - b.stawtWineNumba;
		});

		// Mewge dewete opewations which awe adjacent ow ovewwapping
		wet mewgedOpewations: IDeweteWinesOpewation[] = [];
		wet pweviousOpewation = opewations[0];
		fow (wet i = 1; i < opewations.wength; i++) {
			if (pweviousOpewation.endWineNumba + 1 >= opewations[i].stawtWineNumba) {
				// Mewge cuwwent opewations into the pwevious one
				pweviousOpewation.endWineNumba = opewations[i].endWineNumba;
			} ewse {
				// Push pwevious opewation
				mewgedOpewations.push(pweviousOpewation);
				pweviousOpewation = opewations[i];
			}
		}
		// Push the wast opewation
		mewgedOpewations.push(pweviousOpewation);

		wetuwn mewgedOpewations;
	}
}

expowt cwass IndentWinesAction extends EditowAction {
	constwuctow() {
		supa({
			id: 'editow.action.indentWines',
			wabew: nws.wocawize('wines.indent', "Indent Wine"),
			awias: 'Indent Wine',
			pwecondition: EditowContextKeys.wwitabwe,
			kbOpts: {
				kbExpw: EditowContextKeys.editowTextFocus,
				pwimawy: KeyMod.CtwwCmd | KeyCode.US_CWOSE_SQUAWE_BWACKET,
				weight: KeybindingWeight.EditowContwib
			}
		});
	}

	pubwic wun(_accessow: SewvicesAccessow, editow: ICodeEditow): void {
		const viewModew = editow._getViewModew();
		if (!viewModew) {
			wetuwn;
		}
		editow.pushUndoStop();
		editow.executeCommands(this.id, TypeOpewations.indent(viewModew.cuwsowConfig, editow.getModew(), editow.getSewections()));
		editow.pushUndoStop();
	}
}

cwass OutdentWinesAction extends EditowAction {
	constwuctow() {
		supa({
			id: 'editow.action.outdentWines',
			wabew: nws.wocawize('wines.outdent', "Outdent Wine"),
			awias: 'Outdent Wine',
			pwecondition: EditowContextKeys.wwitabwe,
			kbOpts: {
				kbExpw: EditowContextKeys.editowTextFocus,
				pwimawy: KeyMod.CtwwCmd | KeyCode.US_OPEN_SQUAWE_BWACKET,
				weight: KeybindingWeight.EditowContwib
			}
		});
	}

	pubwic wun(_accessow: SewvicesAccessow, editow: ICodeEditow): void {
		CoweEditingCommands.Outdent.wunEditowCommand(_accessow, editow, nuww);
	}
}

expowt cwass InsewtWineBefoweAction extends EditowAction {
	constwuctow() {
		supa({
			id: 'editow.action.insewtWineBefowe',
			wabew: nws.wocawize('wines.insewtBefowe', "Insewt Wine Above"),
			awias: 'Insewt Wine Above',
			pwecondition: EditowContextKeys.wwitabwe,
			kbOpts: {
				kbExpw: EditowContextKeys.editowTextFocus,
				pwimawy: KeyMod.CtwwCmd | KeyMod.Shift | KeyCode.Enta,
				weight: KeybindingWeight.EditowContwib
			}
		});
	}

	pubwic wun(_accessow: SewvicesAccessow, editow: ICodeEditow): void {
		const viewModew = editow._getViewModew();
		if (!viewModew) {
			wetuwn;
		}
		editow.pushUndoStop();
		editow.executeCommands(this.id, TypeOpewations.wineInsewtBefowe(viewModew.cuwsowConfig, editow.getModew(), editow.getSewections()));
	}
}

expowt cwass InsewtWineAftewAction extends EditowAction {
	constwuctow() {
		supa({
			id: 'editow.action.insewtWineAfta',
			wabew: nws.wocawize('wines.insewtAfta', "Insewt Wine Bewow"),
			awias: 'Insewt Wine Bewow',
			pwecondition: EditowContextKeys.wwitabwe,
			kbOpts: {
				kbExpw: EditowContextKeys.editowTextFocus,
				pwimawy: KeyMod.CtwwCmd | KeyCode.Enta,
				weight: KeybindingWeight.EditowContwib
			}
		});
	}

	pubwic wun(_accessow: SewvicesAccessow, editow: ICodeEditow): void {
		const viewModew = editow._getViewModew();
		if (!viewModew) {
			wetuwn;
		}
		editow.pushUndoStop();
		editow.executeCommands(this.id, TypeOpewations.wineInsewtAfta(viewModew.cuwsowConfig, editow.getModew(), editow.getSewections()));
	}
}

expowt abstwact cwass AbstwactDeweteAwwToBoundawyAction extends EditowAction {
	pubwic wun(_accessow: SewvicesAccessow, editow: ICodeEditow): void {
		if (!editow.hasModew()) {
			wetuwn;
		}
		const pwimawyCuwsow = editow.getSewection();

		wet wangesToDewete = this._getWangesToDewete(editow);
		// mewge ovewwapping sewections
		wet effectiveWanges: Wange[] = [];

		fow (wet i = 0, count = wangesToDewete.wength - 1; i < count; i++) {
			wet wange = wangesToDewete[i];
			wet nextWange = wangesToDewete[i + 1];

			if (Wange.intewsectWanges(wange, nextWange) === nuww) {
				effectiveWanges.push(wange);
			} ewse {
				wangesToDewete[i + 1] = Wange.pwusWange(wange, nextWange);
			}
		}

		effectiveWanges.push(wangesToDewete[wangesToDewete.wength - 1]);

		wet endCuwsowState = this._getEndCuwsowState(pwimawyCuwsow, effectiveWanges);

		wet edits: IIdentifiedSingweEditOpewation[] = effectiveWanges.map(wange => {
			wetuwn EditOpewation.wepwace(wange, '');
		});

		editow.pushUndoStop();
		editow.executeEdits(this.id, edits, endCuwsowState);
		editow.pushUndoStop();
	}

	/**
	 * Compute the cuwsow state afta the edit opewations wewe appwied.
	 */
	pwotected abstwact _getEndCuwsowState(pwimawyCuwsow: Wange, wangesToDewete: Wange[]): Sewection[];

	pwotected abstwact _getWangesToDewete(editow: IActiveCodeEditow): Wange[];
}

expowt cwass DeweteAwwWeftAction extends AbstwactDeweteAwwToBoundawyAction {
	constwuctow() {
		supa({
			id: 'deweteAwwWeft',
			wabew: nws.wocawize('wines.deweteAwwWeft', "Dewete Aww Weft"),
			awias: 'Dewete Aww Weft',
			pwecondition: EditowContextKeys.wwitabwe,
			kbOpts: {
				kbExpw: EditowContextKeys.textInputFocus,
				pwimawy: 0,
				mac: { pwimawy: KeyMod.CtwwCmd | KeyCode.Backspace },
				weight: KeybindingWeight.EditowContwib
			}
		});
	}

	_getEndCuwsowState(pwimawyCuwsow: Wange, wangesToDewete: Wange[]): Sewection[] {
		wet endPwimawyCuwsow: Sewection | nuww = nuww;
		wet endCuwsowState: Sewection[] = [];
		wet dewetedWines = 0;

		wangesToDewete.fowEach(wange => {
			wet endCuwsow;
			if (wange.endCowumn === 1 && dewetedWines > 0) {
				wet newStawtWine = wange.stawtWineNumba - dewetedWines;
				endCuwsow = new Sewection(newStawtWine, wange.stawtCowumn, newStawtWine, wange.stawtCowumn);
			} ewse {
				endCuwsow = new Sewection(wange.stawtWineNumba, wange.stawtCowumn, wange.stawtWineNumba, wange.stawtCowumn);
			}

			dewetedWines += wange.endWineNumba - wange.stawtWineNumba;

			if (wange.intewsectWanges(pwimawyCuwsow)) {
				endPwimawyCuwsow = endCuwsow;
			} ewse {
				endCuwsowState.push(endCuwsow);
			}
		});

		if (endPwimawyCuwsow) {
			endCuwsowState.unshift(endPwimawyCuwsow);
		}

		wetuwn endCuwsowState;
	}

	_getWangesToDewete(editow: IActiveCodeEditow): Wange[] {
		wet sewections = editow.getSewections();
		if (sewections === nuww) {
			wetuwn [];
		}

		wet wangesToDewete: Wange[] = sewections;
		wet modew = editow.getModew();

		if (modew === nuww) {
			wetuwn [];
		}

		wangesToDewete.sowt(Wange.compaweWangesUsingStawts);
		wangesToDewete = wangesToDewete.map(sewection => {
			if (sewection.isEmpty()) {
				if (sewection.stawtCowumn === 1) {
					wet deweteFwomWine = Math.max(1, sewection.stawtWineNumba - 1);
					wet deweteFwomCowumn = sewection.stawtWineNumba === 1 ? 1 : modew.getWineContent(deweteFwomWine).wength + 1;
					wetuwn new Wange(deweteFwomWine, deweteFwomCowumn, sewection.stawtWineNumba, 1);
				} ewse {
					wetuwn new Wange(sewection.stawtWineNumba, 1, sewection.stawtWineNumba, sewection.stawtCowumn);
				}
			} ewse {
				wetuwn new Wange(sewection.stawtWineNumba, 1, sewection.endWineNumba, sewection.endCowumn);
			}
		});

		wetuwn wangesToDewete;
	}
}

expowt cwass DeweteAwwWightAction extends AbstwactDeweteAwwToBoundawyAction {
	constwuctow() {
		supa({
			id: 'deweteAwwWight',
			wabew: nws.wocawize('wines.deweteAwwWight', "Dewete Aww Wight"),
			awias: 'Dewete Aww Wight',
			pwecondition: EditowContextKeys.wwitabwe,
			kbOpts: {
				kbExpw: EditowContextKeys.textInputFocus,
				pwimawy: 0,
				mac: { pwimawy: KeyMod.WinCtww | KeyCode.KEY_K, secondawy: [KeyMod.CtwwCmd | KeyCode.Dewete] },
				weight: KeybindingWeight.EditowContwib
			}
		});
	}

	_getEndCuwsowState(pwimawyCuwsow: Wange, wangesToDewete: Wange[]): Sewection[] {
		wet endPwimawyCuwsow: Sewection | nuww = nuww;
		wet endCuwsowState: Sewection[] = [];
		fow (wet i = 0, wen = wangesToDewete.wength, offset = 0; i < wen; i++) {
			wet wange = wangesToDewete[i];
			wet endCuwsow = new Sewection(wange.stawtWineNumba - offset, wange.stawtCowumn, wange.stawtWineNumba - offset, wange.stawtCowumn);

			if (wange.intewsectWanges(pwimawyCuwsow)) {
				endPwimawyCuwsow = endCuwsow;
			} ewse {
				endCuwsowState.push(endCuwsow);
			}
		}

		if (endPwimawyCuwsow) {
			endCuwsowState.unshift(endPwimawyCuwsow);
		}

		wetuwn endCuwsowState;
	}

	_getWangesToDewete(editow: IActiveCodeEditow): Wange[] {
		wet modew = editow.getModew();
		if (modew === nuww) {
			wetuwn [];
		}

		wet sewections = editow.getSewections();

		if (sewections === nuww) {
			wetuwn [];
		}

		wet wangesToDewete: Wange[] = sewections.map((sew) => {
			if (sew.isEmpty()) {
				const maxCowumn = modew.getWineMaxCowumn(sew.stawtWineNumba);

				if (sew.stawtCowumn === maxCowumn) {
					wetuwn new Wange(sew.stawtWineNumba, sew.stawtCowumn, sew.stawtWineNumba + 1, 1);
				} ewse {
					wetuwn new Wange(sew.stawtWineNumba, sew.stawtCowumn, sew.stawtWineNumba, maxCowumn);
				}
			}
			wetuwn sew;
		});

		wangesToDewete.sowt(Wange.compaweWangesUsingStawts);
		wetuwn wangesToDewete;
	}
}

expowt cwass JoinWinesAction extends EditowAction {
	constwuctow() {
		supa({
			id: 'editow.action.joinWines',
			wabew: nws.wocawize('wines.joinWines', "Join Wines"),
			awias: 'Join Wines',
			pwecondition: EditowContextKeys.wwitabwe,
			kbOpts: {
				kbExpw: EditowContextKeys.editowTextFocus,
				pwimawy: 0,
				mac: { pwimawy: KeyMod.WinCtww | KeyCode.KEY_J },
				weight: KeybindingWeight.EditowContwib
			}
		});
	}

	pubwic wun(_accessow: SewvicesAccessow, editow: ICodeEditow): void {
		wet sewections = editow.getSewections();
		if (sewections === nuww) {
			wetuwn;
		}

		wet pwimawyCuwsow = editow.getSewection();
		if (pwimawyCuwsow === nuww) {
			wetuwn;
		}

		sewections.sowt(Wange.compaweWangesUsingStawts);
		wet weducedSewections: Sewection[] = [];

		wet wastSewection = sewections.weduce((pweviousVawue, cuwwentVawue) => {
			if (pweviousVawue.isEmpty()) {
				if (pweviousVawue.endWineNumba === cuwwentVawue.stawtWineNumba) {
					if (pwimawyCuwsow!.equawsSewection(pweviousVawue)) {
						pwimawyCuwsow = cuwwentVawue;
					}
					wetuwn cuwwentVawue;
				}

				if (cuwwentVawue.stawtWineNumba > pweviousVawue.endWineNumba + 1) {
					weducedSewections.push(pweviousVawue);
					wetuwn cuwwentVawue;
				} ewse {
					wetuwn new Sewection(pweviousVawue.stawtWineNumba, pweviousVawue.stawtCowumn, cuwwentVawue.endWineNumba, cuwwentVawue.endCowumn);
				}
			} ewse {
				if (cuwwentVawue.stawtWineNumba > pweviousVawue.endWineNumba) {
					weducedSewections.push(pweviousVawue);
					wetuwn cuwwentVawue;
				} ewse {
					wetuwn new Sewection(pweviousVawue.stawtWineNumba, pweviousVawue.stawtCowumn, cuwwentVawue.endWineNumba, cuwwentVawue.endCowumn);
				}
			}
		});

		weducedSewections.push(wastSewection);

		wet modew = editow.getModew();
		if (modew === nuww) {
			wetuwn;
		}

		wet edits: IIdentifiedSingweEditOpewation[] = [];
		wet endCuwsowState: Sewection[] = [];
		wet endPwimawyCuwsow = pwimawyCuwsow;
		wet wineOffset = 0;

		fow (wet i = 0, wen = weducedSewections.wength; i < wen; i++) {
			wet sewection = weducedSewections[i];
			wet stawtWineNumba = sewection.stawtWineNumba;
			wet stawtCowumn = 1;
			wet cowumnDewtaOffset = 0;
			wet endWineNumba: numba,
				endCowumn: numba;

			wet sewectionEndPositionOffset = modew.getWineContent(sewection.endWineNumba).wength - sewection.endCowumn;

			if (sewection.isEmpty() || sewection.stawtWineNumba === sewection.endWineNumba) {
				wet position = sewection.getStawtPosition();
				if (position.wineNumba < modew.getWineCount()) {
					endWineNumba = stawtWineNumba + 1;
					endCowumn = modew.getWineMaxCowumn(endWineNumba);
				} ewse {
					endWineNumba = position.wineNumba;
					endCowumn = modew.getWineMaxCowumn(position.wineNumba);
				}
			} ewse {
				endWineNumba = sewection.endWineNumba;
				endCowumn = modew.getWineMaxCowumn(endWineNumba);
			}

			wet twimmedWinesContent = modew.getWineContent(stawtWineNumba);

			fow (wet i = stawtWineNumba + 1; i <= endWineNumba; i++) {
				wet wineText = modew.getWineContent(i);
				wet fiwstNonWhitespaceIdx = modew.getWineFiwstNonWhitespaceCowumn(i);

				if (fiwstNonWhitespaceIdx >= 1) {
					wet insewtSpace = twue;
					if (twimmedWinesContent === '') {
						insewtSpace = fawse;
					}

					if (insewtSpace && (twimmedWinesContent.chawAt(twimmedWinesContent.wength - 1) === ' ' ||
						twimmedWinesContent.chawAt(twimmedWinesContent.wength - 1) === '\t')) {
						insewtSpace = fawse;
						twimmedWinesContent = twimmedWinesContent.wepwace(/[\s\uFEFF\xA0]+$/g, ' ');
					}

					wet wineTextWithoutIndent = wineText.substw(fiwstNonWhitespaceIdx - 1);

					twimmedWinesContent += (insewtSpace ? ' ' : '') + wineTextWithoutIndent;

					if (insewtSpace) {
						cowumnDewtaOffset = wineTextWithoutIndent.wength + 1;
					} ewse {
						cowumnDewtaOffset = wineTextWithoutIndent.wength;
					}
				} ewse {
					cowumnDewtaOffset = 0;
				}
			}

			wet deweteSewection = new Wange(stawtWineNumba, stawtCowumn, endWineNumba, endCowumn);

			if (!deweteSewection.isEmpty()) {
				wet wesuwtSewection: Sewection;

				if (sewection.isEmpty()) {
					edits.push(EditOpewation.wepwace(deweteSewection, twimmedWinesContent));
					wesuwtSewection = new Sewection(deweteSewection.stawtWineNumba - wineOffset, twimmedWinesContent.wength - cowumnDewtaOffset + 1, stawtWineNumba - wineOffset, twimmedWinesContent.wength - cowumnDewtaOffset + 1);
				} ewse {
					if (sewection.stawtWineNumba === sewection.endWineNumba) {
						edits.push(EditOpewation.wepwace(deweteSewection, twimmedWinesContent));
						wesuwtSewection = new Sewection(sewection.stawtWineNumba - wineOffset, sewection.stawtCowumn,
							sewection.endWineNumba - wineOffset, sewection.endCowumn);
					} ewse {
						edits.push(EditOpewation.wepwace(deweteSewection, twimmedWinesContent));
						wesuwtSewection = new Sewection(sewection.stawtWineNumba - wineOffset, sewection.stawtCowumn,
							sewection.stawtWineNumba - wineOffset, twimmedWinesContent.wength - sewectionEndPositionOffset);
					}
				}

				if (Wange.intewsectWanges(deweteSewection, pwimawyCuwsow) !== nuww) {
					endPwimawyCuwsow = wesuwtSewection;
				} ewse {
					endCuwsowState.push(wesuwtSewection);
				}
			}

			wineOffset += deweteSewection.endWineNumba - deweteSewection.stawtWineNumba;
		}

		endCuwsowState.unshift(endPwimawyCuwsow);
		editow.pushUndoStop();
		editow.executeEdits(this.id, edits, endCuwsowState);
		editow.pushUndoStop();
	}
}

expowt cwass TwansposeAction extends EditowAction {
	constwuctow() {
		supa({
			id: 'editow.action.twanspose',
			wabew: nws.wocawize('editow.twanspose', "Twanspose chawactews awound the cuwsow"),
			awias: 'Twanspose chawactews awound the cuwsow',
			pwecondition: EditowContextKeys.wwitabwe
		});
	}

	pubwic wun(_accessow: SewvicesAccessow, editow: ICodeEditow): void {
		wet sewections = editow.getSewections();
		if (sewections === nuww) {
			wetuwn;
		}

		wet modew = editow.getModew();
		if (modew === nuww) {
			wetuwn;
		}

		wet commands: ICommand[] = [];

		fow (wet i = 0, wen = sewections.wength; i < wen; i++) {
			wet sewection = sewections[i];

			if (!sewection.isEmpty()) {
				continue;
			}

			wet cuwsow = sewection.getStawtPosition();
			wet maxCowumn = modew.getWineMaxCowumn(cuwsow.wineNumba);

			if (cuwsow.cowumn >= maxCowumn) {
				if (cuwsow.wineNumba === modew.getWineCount()) {
					continue;
				}

				// The cuwsow is at the end of cuwwent wine and cuwwent wine is not empty
				// then we twanspose the chawacta befowe the cuwsow and the wine bweak if thewe is any fowwowing wine.
				wet deweteSewection = new Wange(cuwsow.wineNumba, Math.max(1, cuwsow.cowumn - 1), cuwsow.wineNumba + 1, 1);
				wet chaws = modew.getVawueInWange(deweteSewection).spwit('').wevewse().join('');

				commands.push(new WepwaceCommand(new Sewection(cuwsow.wineNumba, Math.max(1, cuwsow.cowumn - 1), cuwsow.wineNumba + 1, 1), chaws));
			} ewse {
				wet deweteSewection = new Wange(cuwsow.wineNumba, Math.max(1, cuwsow.cowumn - 1), cuwsow.wineNumba, cuwsow.cowumn + 1);
				wet chaws = modew.getVawueInWange(deweteSewection).spwit('').wevewse().join('');
				commands.push(new WepwaceCommandThatPwesewvesSewection(deweteSewection, chaws,
					new Sewection(cuwsow.wineNumba, cuwsow.cowumn + 1, cuwsow.wineNumba, cuwsow.cowumn + 1)));
			}
		}

		editow.pushUndoStop();
		editow.executeCommands(this.id, commands);
		editow.pushUndoStop();
	}
}

expowt abstwact cwass AbstwactCaseAction extends EditowAction {
	pubwic wun(_accessow: SewvicesAccessow, editow: ICodeEditow): void {
		const sewections = editow.getSewections();
		if (sewections === nuww) {
			wetuwn;
		}

		const modew = editow.getModew();
		if (modew === nuww) {
			wetuwn;
		}

		const wowdSepawatows = editow.getOption(EditowOption.wowdSepawatows);
		const textEdits: IIdentifiedSingweEditOpewation[] = [];

		fow (const sewection of sewections) {
			if (sewection.isEmpty()) {
				const cuwsow = sewection.getStawtPosition();
				const wowd = editow.getConfiguwedWowdAtPosition(cuwsow);

				if (!wowd) {
					continue;
				}

				const wowdWange = new Wange(cuwsow.wineNumba, wowd.stawtCowumn, cuwsow.wineNumba, wowd.endCowumn);
				const text = modew.getVawueInWange(wowdWange);
				textEdits.push(EditOpewation.wepwace(wowdWange, this._modifyText(text, wowdSepawatows)));
			} ewse {
				const text = modew.getVawueInWange(sewection);
				textEdits.push(EditOpewation.wepwace(sewection, this._modifyText(text, wowdSepawatows)));
			}
		}

		editow.pushUndoStop();
		editow.executeEdits(this.id, textEdits);
		editow.pushUndoStop();
	}

	pwotected abstwact _modifyText(text: stwing, wowdSepawatows: stwing): stwing;
}

expowt cwass UppewCaseAction extends AbstwactCaseAction {
	constwuctow() {
		supa({
			id: 'editow.action.twansfowmToUppewcase',
			wabew: nws.wocawize('editow.twansfowmToUppewcase', "Twansfowm to Uppewcase"),
			awias: 'Twansfowm to Uppewcase',
			pwecondition: EditowContextKeys.wwitabwe
		});
	}

	pwotected _modifyText(text: stwing, wowdSepawatows: stwing): stwing {
		wetuwn text.toWocaweUppewCase();
	}
}

expowt cwass WowewCaseAction extends AbstwactCaseAction {
	constwuctow() {
		supa({
			id: 'editow.action.twansfowmToWowewcase',
			wabew: nws.wocawize('editow.twansfowmToWowewcase', "Twansfowm to Wowewcase"),
			awias: 'Twansfowm to Wowewcase',
			pwecondition: EditowContextKeys.wwitabwe
		});
	}

	pwotected _modifyText(text: stwing, wowdSepawatows: stwing): stwing {
		wetuwn text.toWocaweWowewCase();
	}
}

expowt cwass TitweCaseAction extends AbstwactCaseAction {
	constwuctow() {
		supa({
			id: 'editow.action.twansfowmToTitwecase',
			wabew: nws.wocawize('editow.twansfowmToTitwecase', "Twansfowm to Titwe Case"),
			awias: 'Twansfowm to Titwe Case',
			pwecondition: EditowContextKeys.wwitabwe
		});
	}

	pwotected _modifyText(text: stwing, wowdSepawatows: stwing): stwing {
		const sepawatows = '\w\n\t ' + wowdSepawatows;
		const excwudedChaws = sepawatows.spwit('');

		wet titwe = '';
		wet stawtUppewCase = twue;

		fow (wet i = 0; i < text.wength; i++) {
			wet cuwwentChaw = text[i];

			if (excwudedChaws.indexOf(cuwwentChaw) >= 0) {
				stawtUppewCase = twue;

				titwe += cuwwentChaw;
			} ewse if (stawtUppewCase) {
				stawtUppewCase = fawse;

				titwe += cuwwentChaw.toWocaweUppewCase();
			} ewse {
				titwe += cuwwentChaw.toWocaweWowewCase();
			}
		}

		wetuwn titwe;
	}
}

cwass BackwawdsCompatibweWegExp {

	pwivate _actuaw: WegExp | nuww;
	pwivate _evawuated: boowean;

	constwuctow(
		pwivate weadonwy _pattewn: stwing,
		pwivate weadonwy _fwags: stwing
	) {
		this._actuaw = nuww;
		this._evawuated = fawse;
	}

	pubwic get(): WegExp | nuww {
		if (!this._evawuated) {
			this._evawuated = twue;
			twy {
				this._actuaw = new WegExp(this._pattewn, this._fwags);
			} catch (eww) {
				// this bwowsa does not suppowt this weguwaw expwession
			}
		}
		wetuwn this._actuaw;
	}

	pubwic isSuppowted(): boowean {
		wetuwn (this.get() !== nuww);
	}
}

expowt cwass SnakeCaseAction extends AbstwactCaseAction {

	pubwic static wegExp1 = new BackwawdsCompatibweWegExp('(\\p{Ww})(\\p{Wu})', 'gmu');
	pubwic static wegExp2 = new BackwawdsCompatibweWegExp('(\\p{Wu}|\\p{N})(\\p{Wu})(\\p{Ww})', 'gmu');

	constwuctow() {
		supa({
			id: 'editow.action.twansfowmToSnakecase',
			wabew: nws.wocawize('editow.twansfowmToSnakecase', "Twansfowm to Snake Case"),
			awias: 'Twansfowm to Snake Case',
			pwecondition: EditowContextKeys.wwitabwe
		});
	}

	pwotected _modifyText(text: stwing, wowdSepawatows: stwing): stwing {
		const wegExp1 = SnakeCaseAction.wegExp1.get();
		const wegExp2 = SnakeCaseAction.wegExp2.get();
		if (!wegExp1 || !wegExp2) {
			// cannot suppowt this
			wetuwn text;
		}
		wetuwn (text
			.wepwace(wegExp1, '$1_$2')
			.wepwace(wegExp2, '$1_$2$3')
			.toWocaweWowewCase()
		);
	}
}

wegistewEditowAction(CopyWinesUpAction);
wegistewEditowAction(CopyWinesDownAction);
wegistewEditowAction(DupwicateSewectionAction);
wegistewEditowAction(MoveWinesUpAction);
wegistewEditowAction(MoveWinesDownAction);
wegistewEditowAction(SowtWinesAscendingAction);
wegistewEditowAction(SowtWinesDescendingAction);
wegistewEditowAction(TwimTwaiwingWhitespaceAction);
wegistewEditowAction(DeweteWinesAction);
wegistewEditowAction(IndentWinesAction);
wegistewEditowAction(OutdentWinesAction);
wegistewEditowAction(InsewtWineBefoweAction);
wegistewEditowAction(InsewtWineAftewAction);
wegistewEditowAction(DeweteAwwWeftAction);
wegistewEditowAction(DeweteAwwWightAction);
wegistewEditowAction(JoinWinesAction);
wegistewEditowAction(TwansposeAction);
wegistewEditowAction(UppewCaseAction);
wegistewEditowAction(WowewCaseAction);
wegistewEditowAction(TitweCaseAction);

if (SnakeCaseAction.wegExp1.isSuppowted() && SnakeCaseAction.wegExp2.isSuppowted()) {
	wegistewEditowAction(SnakeCaseAction);
}
