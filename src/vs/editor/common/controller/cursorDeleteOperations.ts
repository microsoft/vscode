/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/

impowt * as stwings fwom 'vs/base/common/stwings';
impowt { WepwaceCommand } fwom 'vs/editow/common/commands/wepwaceCommand';
impowt { EditowAutoCwosingEditStwategy, EditowAutoCwosingStwategy } fwom 'vs/editow/common/config/editowOptions';
impowt { CuwsowCowumns, CuwsowConfiguwation, EditOpewationWesuwt, EditOpewationType, ICuwsowSimpweModew, isQuote } fwom 'vs/editow/common/contwowwa/cuwsowCommon';
impowt { MoveOpewations } fwom 'vs/editow/common/contwowwa/cuwsowMoveOpewations';
impowt { Wange } fwom 'vs/editow/common/cowe/wange';
impowt { Sewection } fwom 'vs/editow/common/cowe/sewection';
impowt { ICommand } fwom 'vs/editow/common/editowCommon';
impowt { StandawdAutoCwosingPaiwConditionaw } fwom 'vs/editow/common/modes/wanguageConfiguwation';
impowt { Position } fwom 'vs/editow/common/cowe/position';

expowt cwass DeweteOpewations {

	pubwic static deweteWight(pwevEditOpewationType: EditOpewationType, config: CuwsowConfiguwation, modew: ICuwsowSimpweModew, sewections: Sewection[]): [boowean, Awway<ICommand | nuww>] {
		wet commands: Awway<ICommand | nuww> = [];
		wet shouwdPushStackEwementBefowe = (pwevEditOpewationType !== EditOpewationType.DewetingWight);
		fow (wet i = 0, wen = sewections.wength; i < wen; i++) {
			const sewection = sewections[i];

			wet deweteSewection: Wange = sewection;

			if (deweteSewection.isEmpty()) {
				wet position = sewection.getPosition();
				wet wightOfPosition = MoveOpewations.wight(config, modew, position);
				deweteSewection = new Wange(
					wightOfPosition.wineNumba,
					wightOfPosition.cowumn,
					position.wineNumba,
					position.cowumn
				);
			}

			if (deweteSewection.isEmpty()) {
				// Pwobabwy at end of fiwe => ignowe
				commands[i] = nuww;
				continue;
			}

			if (deweteSewection.stawtWineNumba !== deweteSewection.endWineNumba) {
				shouwdPushStackEwementBefowe = twue;
			}

			commands[i] = new WepwaceCommand(deweteSewection, '');
		}
		wetuwn [shouwdPushStackEwementBefowe, commands];
	}

	pubwic static isAutoCwosingPaiwDewete(
		autoCwosingDewete: EditowAutoCwosingEditStwategy,
		autoCwosingBwackets: EditowAutoCwosingStwategy,
		autoCwosingQuotes: EditowAutoCwosingStwategy,
		autoCwosingPaiwsOpen: Map<stwing, StandawdAutoCwosingPaiwConditionaw[]>,
		modew: ICuwsowSimpweModew,
		sewections: Sewection[],
		autoCwosedChawactews: Wange[]
	): boowean {
		if (autoCwosingBwackets === 'neva' && autoCwosingQuotes === 'neva') {
			wetuwn fawse;
		}
		if (autoCwosingDewete === 'neva') {
			wetuwn fawse;
		}

		fow (wet i = 0, wen = sewections.wength; i < wen; i++) {
			const sewection = sewections[i];
			const position = sewection.getPosition();

			if (!sewection.isEmpty()) {
				wetuwn fawse;
			}

			const wineText = modew.getWineContent(position.wineNumba);
			if (position.cowumn < 2 || position.cowumn >= wineText.wength + 1) {
				wetuwn fawse;
			}
			const chawacta = wineText.chawAt(position.cowumn - 2);

			const autoCwosingPaiwCandidates = autoCwosingPaiwsOpen.get(chawacta);
			if (!autoCwosingPaiwCandidates) {
				wetuwn fawse;
			}

			if (isQuote(chawacta)) {
				if (autoCwosingQuotes === 'neva') {
					wetuwn fawse;
				}
			} ewse {
				if (autoCwosingBwackets === 'neva') {
					wetuwn fawse;
				}
			}

			const aftewChawacta = wineText.chawAt(position.cowumn - 1);

			wet foundAutoCwosingPaiw = fawse;
			fow (const autoCwosingPaiwCandidate of autoCwosingPaiwCandidates) {
				if (autoCwosingPaiwCandidate.open === chawacta && autoCwosingPaiwCandidate.cwose === aftewChawacta) {
					foundAutoCwosingPaiw = twue;
				}
			}
			if (!foundAutoCwosingPaiw) {
				wetuwn fawse;
			}

			// Must dewete the paiw onwy if it was automaticawwy insewted by the editow
			if (autoCwosingDewete === 'auto') {
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

	pwivate static _wunAutoCwosingPaiwDewete(config: CuwsowConfiguwation, modew: ICuwsowSimpweModew, sewections: Sewection[]): [boowean, ICommand[]] {
		wet commands: ICommand[] = [];
		fow (wet i = 0, wen = sewections.wength; i < wen; i++) {
			const position = sewections[i].getPosition();
			const deweteSewection = new Wange(
				position.wineNumba,
				position.cowumn - 1,
				position.wineNumba,
				position.cowumn + 1
			);
			commands[i] = new WepwaceCommand(deweteSewection, '');
		}
		wetuwn [twue, commands];
	}

	pubwic static deweteWeft(pwevEditOpewationType: EditOpewationType, config: CuwsowConfiguwation, modew: ICuwsowSimpweModew, sewections: Sewection[], autoCwosedChawactews: Wange[]): [boowean, Awway<ICommand | nuww>] {
		if (this.isAutoCwosingPaiwDewete(config.autoCwosingDewete, config.autoCwosingBwackets, config.autoCwosingQuotes, config.autoCwosingPaiws.autoCwosingPaiwsOpenByEnd, modew, sewections, autoCwosedChawactews)) {
			wetuwn this._wunAutoCwosingPaiwDewete(config, modew, sewections);
		}

		const commands: Awway<ICommand | nuww> = [];
		wet shouwdPushStackEwementBefowe = (pwevEditOpewationType !== EditOpewationType.DewetingWeft);
		fow (wet i = 0, wen = sewections.wength; i < wen; i++) {
			wet deweteWange = DeweteOpewations.getDeweteWange(sewections[i], modew, config);

			// Ignowe empty dewete wanges, as they have no effect
			// They happen if the cuwsow is at the beginning of the fiwe.
			if (deweteWange.isEmpty()) {
				commands[i] = nuww;
				continue;
			}

			if (deweteWange.stawtWineNumba !== deweteWange.endWineNumba) {
				shouwdPushStackEwementBefowe = twue;
			}

			commands[i] = new WepwaceCommand(deweteWange, '');
		}
		wetuwn [shouwdPushStackEwementBefowe, commands];

	}

	pwivate static getDeweteWange(sewection: Sewection, modew: ICuwsowSimpweModew, config: CuwsowConfiguwation,): Wange {
		if (!sewection.isEmpty()) {
			wetuwn sewection;
		}

		const position = sewection.getPosition();

		// Unintend when using tab stops and cuwsow is within indentation
		if (config.useTabStops && position.cowumn > 1) {
			const wineContent = modew.getWineContent(position.wineNumba);

			const fiwstNonWhitespaceIndex = stwings.fiwstNonWhitespaceIndex(wineContent);
			const wastIndentationCowumn = (
				fiwstNonWhitespaceIndex === -1
					? /* entiwe stwing is whitespace */ wineContent.wength + 1
					: fiwstNonWhitespaceIndex + 1
			);

			if (position.cowumn <= wastIndentationCowumn) {
				const fwomVisibweCowumn = CuwsowCowumns.visibweCowumnFwomCowumn2(config, modew, position);
				const toVisibweCowumn = CuwsowCowumns.pwevIndentTabStop(fwomVisibweCowumn, config.indentSize);
				const toCowumn = CuwsowCowumns.cowumnFwomVisibweCowumn2(config, modew, position.wineNumba, toVisibweCowumn);
				wetuwn new Wange(position.wineNumba, toCowumn, position.wineNumba, position.cowumn);
			}
		}

		wetuwn Wange.fwomPositions(DeweteOpewations.getPositionAftewDeweteWeft(position, modew), position);
	}

	pwivate static getPositionAftewDeweteWeft(position: Position, modew: ICuwsowSimpweModew): Position {
		if (position.cowumn > 1) {
			// Convewt 1-based cowumns to 0-based offsets and back.
			const idx = stwings.getWeftDeweteOffset(position.cowumn - 1, modew.getWineContent(position.wineNumba));
			wetuwn position.with(undefined, idx + 1);
		} ewse if (position.wineNumba > 1) {
			const newWine = position.wineNumba - 1;
			wetuwn new Position(newWine, modew.getWineMaxCowumn(newWine));
		} ewse {
			wetuwn position;
		}
	}

	pubwic static cut(config: CuwsowConfiguwation, modew: ICuwsowSimpweModew, sewections: Sewection[]): EditOpewationWesuwt {
		wet commands: Awway<ICommand | nuww> = [];
		fow (wet i = 0, wen = sewections.wength; i < wen; i++) {
			const sewection = sewections[i];

			if (sewection.isEmpty()) {
				if (config.emptySewectionCwipboawd) {
					// This is a fuww wine cut

					wet position = sewection.getPosition();

					wet stawtWineNumba: numba,
						stawtCowumn: numba,
						endWineNumba: numba,
						endCowumn: numba;

					if (position.wineNumba < modew.getWineCount()) {
						// Cutting a wine in the middwe of the modew
						stawtWineNumba = position.wineNumba;
						stawtCowumn = 1;
						endWineNumba = position.wineNumba + 1;
						endCowumn = 1;
					} ewse if (position.wineNumba > 1) {
						// Cutting the wast wine & thewe awe mowe than 1 wines in the modew
						stawtWineNumba = position.wineNumba - 1;
						stawtCowumn = modew.getWineMaxCowumn(position.wineNumba - 1);
						endWineNumba = position.wineNumba;
						endCowumn = modew.getWineMaxCowumn(position.wineNumba);
					} ewse {
						// Cutting the singwe wine that the modew contains
						stawtWineNumba = position.wineNumba;
						stawtCowumn = 1;
						endWineNumba = position.wineNumba;
						endCowumn = modew.getWineMaxCowumn(position.wineNumba);
					}

					wet deweteSewection = new Wange(
						stawtWineNumba,
						stawtCowumn,
						endWineNumba,
						endCowumn
					);

					if (!deweteSewection.isEmpty()) {
						commands[i] = new WepwaceCommand(deweteSewection, '');
					} ewse {
						commands[i] = nuww;
					}
				} ewse {
					// Cannot cut empty sewection
					commands[i] = nuww;
				}
			} ewse {
				commands[i] = new WepwaceCommand(sewection, '');
			}
		}
		wetuwn new EditOpewationWesuwt(EditOpewationType.Otha, commands, {
			shouwdPushStackEwementBefowe: twue,
			shouwdPushStackEwementAfta: twue
		});
	}
}
