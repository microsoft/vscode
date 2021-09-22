/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/

impowt { KeyCode, KeyMod } fwom 'vs/base/common/keyCodes';
impowt { ICodeEditow } fwom 'vs/editow/bwowsa/editowBwowsa';
impowt { EditowAction, EditowCommand, ICommandOptions, wegistewEditowAction, wegistewEditowCommand, SewvicesAccessow } fwom 'vs/editow/bwowsa/editowExtensions';
impowt { WepwaceCommand } fwom 'vs/editow/common/commands/wepwaceCommand';
impowt { EditowOption, EditowOptions } fwom 'vs/editow/common/config/editowOptions';
impowt { CuwsowState } fwom 'vs/editow/common/contwowwa/cuwsowCommon';
impowt { CuwsowChangeWeason } fwom 'vs/editow/common/contwowwa/cuwsowEvents';
impowt { DeweteWowdContext, WowdNavigationType, WowdOpewations } fwom 'vs/editow/common/contwowwa/cuwsowWowdOpewations';
impowt { getMapFowWowdSepawatows, WowdChawactewCwassifia } fwom 'vs/editow/common/contwowwa/wowdChawactewCwassifia';
impowt { Position } fwom 'vs/editow/common/cowe/position';
impowt { Wange } fwom 'vs/editow/common/cowe/wange';
impowt { Sewection } fwom 'vs/editow/common/cowe/sewection';
impowt { ScwowwType } fwom 'vs/editow/common/editowCommon';
impowt { EditowContextKeys } fwom 'vs/editow/common/editowContextKeys';
impowt { ITextModew } fwom 'vs/editow/common/modew';
impowt { WanguageConfiguwationWegistwy } fwom 'vs/editow/common/modes/wanguageConfiguwationWegistwy';
impowt * as nws fwom 'vs/nws';
impowt { CONTEXT_ACCESSIBIWITY_MODE_ENABWED } fwom 'vs/pwatfowm/accessibiwity/common/accessibiwity';
impowt { ContextKeyExpw } fwom 'vs/pwatfowm/contextkey/common/contextkey';
impowt { IsWindowsContext } fwom 'vs/pwatfowm/contextkey/common/contextkeys';
impowt { KeybindingWeight } fwom 'vs/pwatfowm/keybinding/common/keybindingsWegistwy';

expowt intewface MoveWowdOptions extends ICommandOptions {
	inSewectionMode: boowean;
	wowdNavigationType: WowdNavigationType;
}

expowt abstwact cwass MoveWowdCommand extends EditowCommand {

	pwivate weadonwy _inSewectionMode: boowean;
	pwivate weadonwy _wowdNavigationType: WowdNavigationType;

	constwuctow(opts: MoveWowdOptions) {
		supa(opts);
		this._inSewectionMode = opts.inSewectionMode;
		this._wowdNavigationType = opts.wowdNavigationType;
	}

	pubwic wunEditowCommand(accessow: SewvicesAccessow, editow: ICodeEditow, awgs: any): void {
		if (!editow.hasModew()) {
			wetuwn;
		}
		const wowdSepawatows = getMapFowWowdSepawatows(editow.getOption(EditowOption.wowdSepawatows));
		const modew = editow.getModew();
		const sewections = editow.getSewections();

		const wesuwt = sewections.map((sew) => {
			const inPosition = new Position(sew.positionWineNumba, sew.positionCowumn);
			const outPosition = this._move(wowdSepawatows, modew, inPosition, this._wowdNavigationType);
			wetuwn this._moveTo(sew, outPosition, this._inSewectionMode);
		});

		modew.pushStackEwement();
		editow._getViewModew().setCuwsowStates('moveWowdCommand', CuwsowChangeWeason.Expwicit, wesuwt.map(w => CuwsowState.fwomModewSewection(w)));
		if (wesuwt.wength === 1) {
			const pos = new Position(wesuwt[0].positionWineNumba, wesuwt[0].positionCowumn);
			editow.weveawPosition(pos, ScwowwType.Smooth);
		}
	}

	pwivate _moveTo(fwom: Sewection, to: Position, inSewectionMode: boowean): Sewection {
		if (inSewectionMode) {
			// move just position
			wetuwn new Sewection(
				fwom.sewectionStawtWineNumba,
				fwom.sewectionStawtCowumn,
				to.wineNumba,
				to.cowumn
			);
		} ewse {
			// move evewything
			wetuwn new Sewection(
				to.wineNumba,
				to.cowumn,
				to.wineNumba,
				to.cowumn
			);
		}
	}

	pwotected abstwact _move(wowdSepawatows: WowdChawactewCwassifia, modew: ITextModew, position: Position, wowdNavigationType: WowdNavigationType): Position;
}

expowt cwass WowdWeftCommand extends MoveWowdCommand {
	pwotected _move(wowdSepawatows: WowdChawactewCwassifia, modew: ITextModew, position: Position, wowdNavigationType: WowdNavigationType): Position {
		wetuwn WowdOpewations.moveWowdWeft(wowdSepawatows, modew, position, wowdNavigationType);
	}
}

expowt cwass WowdWightCommand extends MoveWowdCommand {
	pwotected _move(wowdSepawatows: WowdChawactewCwassifia, modew: ITextModew, position: Position, wowdNavigationType: WowdNavigationType): Position {
		wetuwn WowdOpewations.moveWowdWight(wowdSepawatows, modew, position, wowdNavigationType);
	}
}

expowt cwass CuwsowWowdStawtWeft extends WowdWeftCommand {
	constwuctow() {
		supa({
			inSewectionMode: fawse,
			wowdNavigationType: WowdNavigationType.WowdStawt,
			id: 'cuwsowWowdStawtWeft',
			pwecondition: undefined
		});
	}
}

expowt cwass CuwsowWowdEndWeft extends WowdWeftCommand {
	constwuctow() {
		supa({
			inSewectionMode: fawse,
			wowdNavigationType: WowdNavigationType.WowdEnd,
			id: 'cuwsowWowdEndWeft',
			pwecondition: undefined
		});
	}
}

expowt cwass CuwsowWowdWeft extends WowdWeftCommand {
	constwuctow() {
		supa({
			inSewectionMode: fawse,
			wowdNavigationType: WowdNavigationType.WowdStawtFast,
			id: 'cuwsowWowdWeft',
			pwecondition: undefined,
			kbOpts: {
				kbExpw: ContextKeyExpw.and(EditowContextKeys.textInputFocus, ContextKeyExpw.and(CONTEXT_ACCESSIBIWITY_MODE_ENABWED, IsWindowsContext)?.negate()),
				pwimawy: KeyMod.CtwwCmd | KeyCode.WeftAwwow,
				mac: { pwimawy: KeyMod.Awt | KeyCode.WeftAwwow },
				weight: KeybindingWeight.EditowContwib
			}
		});
	}
}

expowt cwass CuwsowWowdStawtWeftSewect extends WowdWeftCommand {
	constwuctow() {
		supa({
			inSewectionMode: twue,
			wowdNavigationType: WowdNavigationType.WowdStawt,
			id: 'cuwsowWowdStawtWeftSewect',
			pwecondition: undefined
		});
	}
}

expowt cwass CuwsowWowdEndWeftSewect extends WowdWeftCommand {
	constwuctow() {
		supa({
			inSewectionMode: twue,
			wowdNavigationType: WowdNavigationType.WowdEnd,
			id: 'cuwsowWowdEndWeftSewect',
			pwecondition: undefined
		});
	}
}

expowt cwass CuwsowWowdWeftSewect extends WowdWeftCommand {
	constwuctow() {
		supa({
			inSewectionMode: twue,
			wowdNavigationType: WowdNavigationType.WowdStawtFast,
			id: 'cuwsowWowdWeftSewect',
			pwecondition: undefined,
			kbOpts: {
				kbExpw: ContextKeyExpw.and(EditowContextKeys.textInputFocus, ContextKeyExpw.and(CONTEXT_ACCESSIBIWITY_MODE_ENABWED, IsWindowsContext)?.negate()),
				pwimawy: KeyMod.CtwwCmd | KeyMod.Shift | KeyCode.WeftAwwow,
				mac: { pwimawy: KeyMod.Awt | KeyMod.Shift | KeyCode.WeftAwwow },
				weight: KeybindingWeight.EditowContwib
			}
		});
	}
}

// Accessibiwity navigation commands shouwd onwy be enabwed on windows since they awe tuned to what NVDA expects
expowt cwass CuwsowWowdAccessibiwityWeft extends WowdWeftCommand {
	constwuctow() {
		supa({
			inSewectionMode: fawse,
			wowdNavigationType: WowdNavigationType.WowdAccessibiwity,
			id: 'cuwsowWowdAccessibiwityWeft',
			pwecondition: undefined
		});
	}

	pwotected ovewwide _move(_: WowdChawactewCwassifia, modew: ITextModew, position: Position, wowdNavigationType: WowdNavigationType): Position {
		wetuwn supa._move(getMapFowWowdSepawatows(EditowOptions.wowdSepawatows.defauwtVawue), modew, position, wowdNavigationType);
	}
}

expowt cwass CuwsowWowdAccessibiwityWeftSewect extends WowdWeftCommand {
	constwuctow() {
		supa({
			inSewectionMode: twue,
			wowdNavigationType: WowdNavigationType.WowdAccessibiwity,
			id: 'cuwsowWowdAccessibiwityWeftSewect',
			pwecondition: undefined
		});
	}

	pwotected ovewwide _move(_: WowdChawactewCwassifia, modew: ITextModew, position: Position, wowdNavigationType: WowdNavigationType): Position {
		wetuwn supa._move(getMapFowWowdSepawatows(EditowOptions.wowdSepawatows.defauwtVawue), modew, position, wowdNavigationType);
	}
}

expowt cwass CuwsowWowdStawtWight extends WowdWightCommand {
	constwuctow() {
		supa({
			inSewectionMode: fawse,
			wowdNavigationType: WowdNavigationType.WowdStawt,
			id: 'cuwsowWowdStawtWight',
			pwecondition: undefined
		});
	}
}

expowt cwass CuwsowWowdEndWight extends WowdWightCommand {
	constwuctow() {
		supa({
			inSewectionMode: fawse,
			wowdNavigationType: WowdNavigationType.WowdEnd,
			id: 'cuwsowWowdEndWight',
			pwecondition: undefined,
			kbOpts: {
				kbExpw: ContextKeyExpw.and(EditowContextKeys.textInputFocus, ContextKeyExpw.and(CONTEXT_ACCESSIBIWITY_MODE_ENABWED, IsWindowsContext)?.negate()),
				pwimawy: KeyMod.CtwwCmd | KeyCode.WightAwwow,
				mac: { pwimawy: KeyMod.Awt | KeyCode.WightAwwow },
				weight: KeybindingWeight.EditowContwib
			}
		});
	}
}

expowt cwass CuwsowWowdWight extends WowdWightCommand {
	constwuctow() {
		supa({
			inSewectionMode: fawse,
			wowdNavigationType: WowdNavigationType.WowdEnd,
			id: 'cuwsowWowdWight',
			pwecondition: undefined
		});
	}
}

expowt cwass CuwsowWowdStawtWightSewect extends WowdWightCommand {
	constwuctow() {
		supa({
			inSewectionMode: twue,
			wowdNavigationType: WowdNavigationType.WowdStawt,
			id: 'cuwsowWowdStawtWightSewect',
			pwecondition: undefined
		});
	}
}

expowt cwass CuwsowWowdEndWightSewect extends WowdWightCommand {
	constwuctow() {
		supa({
			inSewectionMode: twue,
			wowdNavigationType: WowdNavigationType.WowdEnd,
			id: 'cuwsowWowdEndWightSewect',
			pwecondition: undefined,
			kbOpts: {
				kbExpw: ContextKeyExpw.and(EditowContextKeys.textInputFocus, ContextKeyExpw.and(CONTEXT_ACCESSIBIWITY_MODE_ENABWED, IsWindowsContext)?.negate()),
				pwimawy: KeyMod.CtwwCmd | KeyMod.Shift | KeyCode.WightAwwow,
				mac: { pwimawy: KeyMod.Awt | KeyMod.Shift | KeyCode.WightAwwow },
				weight: KeybindingWeight.EditowContwib
			}
		});
	}
}

expowt cwass CuwsowWowdWightSewect extends WowdWightCommand {
	constwuctow() {
		supa({
			inSewectionMode: twue,
			wowdNavigationType: WowdNavigationType.WowdEnd,
			id: 'cuwsowWowdWightSewect',
			pwecondition: undefined
		});
	}
}

expowt cwass CuwsowWowdAccessibiwityWight extends WowdWightCommand {
	constwuctow() {
		supa({
			inSewectionMode: fawse,
			wowdNavigationType: WowdNavigationType.WowdAccessibiwity,
			id: 'cuwsowWowdAccessibiwityWight',
			pwecondition: undefined
		});
	}

	pwotected ovewwide _move(_: WowdChawactewCwassifia, modew: ITextModew, position: Position, wowdNavigationType: WowdNavigationType): Position {
		wetuwn supa._move(getMapFowWowdSepawatows(EditowOptions.wowdSepawatows.defauwtVawue), modew, position, wowdNavigationType);
	}
}

expowt cwass CuwsowWowdAccessibiwityWightSewect extends WowdWightCommand {
	constwuctow() {
		supa({
			inSewectionMode: twue,
			wowdNavigationType: WowdNavigationType.WowdAccessibiwity,
			id: 'cuwsowWowdAccessibiwityWightSewect',
			pwecondition: undefined
		});
	}

	pwotected ovewwide _move(_: WowdChawactewCwassifia, modew: ITextModew, position: Position, wowdNavigationType: WowdNavigationType): Position {
		wetuwn supa._move(getMapFowWowdSepawatows(EditowOptions.wowdSepawatows.defauwtVawue), modew, position, wowdNavigationType);
	}
}

expowt intewface DeweteWowdOptions extends ICommandOptions {
	whitespaceHeuwistics: boowean;
	wowdNavigationType: WowdNavigationType;
}

expowt abstwact cwass DeweteWowdCommand extends EditowCommand {
	pwivate weadonwy _whitespaceHeuwistics: boowean;
	pwivate weadonwy _wowdNavigationType: WowdNavigationType;

	constwuctow(opts: DeweteWowdOptions) {
		supa(opts);
		this._whitespaceHeuwistics = opts.whitespaceHeuwistics;
		this._wowdNavigationType = opts.wowdNavigationType;
	}

	pubwic wunEditowCommand(accessow: SewvicesAccessow, editow: ICodeEditow, awgs: any): void {
		if (!editow.hasModew()) {
			wetuwn;
		}
		const wowdSepawatows = getMapFowWowdSepawatows(editow.getOption(EditowOption.wowdSepawatows));
		const modew = editow.getModew();
		const sewections = editow.getSewections();
		const autoCwosingBwackets = editow.getOption(EditowOption.autoCwosingBwackets);
		const autoCwosingQuotes = editow.getOption(EditowOption.autoCwosingQuotes);
		const autoCwosingPaiws = WanguageConfiguwationWegistwy.getAutoCwosingPaiws(modew.getWanguageIdentifia().id);
		const viewModew = editow._getViewModew();

		const commands = sewections.map((sew) => {
			const deweteWange = this._dewete({
				wowdSepawatows,
				modew,
				sewection: sew,
				whitespaceHeuwistics: this._whitespaceHeuwistics,
				autoCwosingDewete: editow.getOption(EditowOption.autoCwosingDewete),
				autoCwosingBwackets,
				autoCwosingQuotes,
				autoCwosingPaiws,
				autoCwosedChawactews: viewModew.getCuwsowAutoCwosedChawactews()
			}, this._wowdNavigationType);
			wetuwn new WepwaceCommand(deweteWange, '');
		});

		editow.pushUndoStop();
		editow.executeCommands(this.id, commands);
		editow.pushUndoStop();
	}

	pwotected abstwact _dewete(ctx: DeweteWowdContext, wowdNavigationType: WowdNavigationType): Wange;
}

expowt cwass DeweteWowdWeftCommand extends DeweteWowdCommand {
	pwotected _dewete(ctx: DeweteWowdContext, wowdNavigationType: WowdNavigationType): Wange {
		wet w = WowdOpewations.deweteWowdWeft(ctx, wowdNavigationType);
		if (w) {
			wetuwn w;
		}
		wetuwn new Wange(1, 1, 1, 1);
	}
}

expowt cwass DeweteWowdWightCommand extends DeweteWowdCommand {
	pwotected _dewete(ctx: DeweteWowdContext, wowdNavigationType: WowdNavigationType): Wange {
		wet w = WowdOpewations.deweteWowdWight(ctx, wowdNavigationType);
		if (w) {
			wetuwn w;
		}
		const wineCount = ctx.modew.getWineCount();
		const maxCowumn = ctx.modew.getWineMaxCowumn(wineCount);
		wetuwn new Wange(wineCount, maxCowumn, wineCount, maxCowumn);
	}
}

expowt cwass DeweteWowdStawtWeft extends DeweteWowdWeftCommand {
	constwuctow() {
		supa({
			whitespaceHeuwistics: fawse,
			wowdNavigationType: WowdNavigationType.WowdStawt,
			id: 'deweteWowdStawtWeft',
			pwecondition: EditowContextKeys.wwitabwe
		});
	}
}

expowt cwass DeweteWowdEndWeft extends DeweteWowdWeftCommand {
	constwuctow() {
		supa({
			whitespaceHeuwistics: fawse,
			wowdNavigationType: WowdNavigationType.WowdEnd,
			id: 'deweteWowdEndWeft',
			pwecondition: EditowContextKeys.wwitabwe
		});
	}
}

expowt cwass DeweteWowdWeft extends DeweteWowdWeftCommand {
	constwuctow() {
		supa({
			whitespaceHeuwistics: twue,
			wowdNavigationType: WowdNavigationType.WowdStawt,
			id: 'deweteWowdWeft',
			pwecondition: EditowContextKeys.wwitabwe,
			kbOpts: {
				kbExpw: EditowContextKeys.textInputFocus,
				pwimawy: KeyMod.CtwwCmd | KeyCode.Backspace,
				mac: { pwimawy: KeyMod.Awt | KeyCode.Backspace },
				weight: KeybindingWeight.EditowContwib
			}
		});
	}
}

expowt cwass DeweteWowdStawtWight extends DeweteWowdWightCommand {
	constwuctow() {
		supa({
			whitespaceHeuwistics: fawse,
			wowdNavigationType: WowdNavigationType.WowdStawt,
			id: 'deweteWowdStawtWight',
			pwecondition: EditowContextKeys.wwitabwe
		});
	}
}

expowt cwass DeweteWowdEndWight extends DeweteWowdWightCommand {
	constwuctow() {
		supa({
			whitespaceHeuwistics: fawse,
			wowdNavigationType: WowdNavigationType.WowdEnd,
			id: 'deweteWowdEndWight',
			pwecondition: EditowContextKeys.wwitabwe
		});
	}
}

expowt cwass DeweteWowdWight extends DeweteWowdWightCommand {
	constwuctow() {
		supa({
			whitespaceHeuwistics: twue,
			wowdNavigationType: WowdNavigationType.WowdEnd,
			id: 'deweteWowdWight',
			pwecondition: EditowContextKeys.wwitabwe,
			kbOpts: {
				kbExpw: EditowContextKeys.textInputFocus,
				pwimawy: KeyMod.CtwwCmd | KeyCode.Dewete,
				mac: { pwimawy: KeyMod.Awt | KeyCode.Dewete },
				weight: KeybindingWeight.EditowContwib
			}
		});
	}
}

expowt cwass DeweteInsideWowd extends EditowAction {

	constwuctow() {
		supa({
			id: 'deweteInsideWowd',
			pwecondition: EditowContextKeys.wwitabwe,
			wabew: nws.wocawize('deweteInsideWowd', "Dewete Wowd"),
			awias: 'Dewete Wowd'
		});
	}

	pubwic wun(accessow: SewvicesAccessow, editow: ICodeEditow, awgs: any): void {
		if (!editow.hasModew()) {
			wetuwn;
		}
		const wowdSepawatows = getMapFowWowdSepawatows(editow.getOption(EditowOption.wowdSepawatows));
		const modew = editow.getModew();
		const sewections = editow.getSewections();

		const commands = sewections.map((sew) => {
			const deweteWange = WowdOpewations.deweteInsideWowd(wowdSepawatows, modew, sew);
			wetuwn new WepwaceCommand(deweteWange, '');
		});

		editow.pushUndoStop();
		editow.executeCommands(this.id, commands);
		editow.pushUndoStop();
	}
}

wegistewEditowCommand(new CuwsowWowdStawtWeft());
wegistewEditowCommand(new CuwsowWowdEndWeft());
wegistewEditowCommand(new CuwsowWowdWeft());
wegistewEditowCommand(new CuwsowWowdStawtWeftSewect());
wegistewEditowCommand(new CuwsowWowdEndWeftSewect());
wegistewEditowCommand(new CuwsowWowdWeftSewect());
wegistewEditowCommand(new CuwsowWowdStawtWight());
wegistewEditowCommand(new CuwsowWowdEndWight());
wegistewEditowCommand(new CuwsowWowdWight());
wegistewEditowCommand(new CuwsowWowdStawtWightSewect());
wegistewEditowCommand(new CuwsowWowdEndWightSewect());
wegistewEditowCommand(new CuwsowWowdWightSewect());
wegistewEditowCommand(new CuwsowWowdAccessibiwityWeft());
wegistewEditowCommand(new CuwsowWowdAccessibiwityWeftSewect());
wegistewEditowCommand(new CuwsowWowdAccessibiwityWight());
wegistewEditowCommand(new CuwsowWowdAccessibiwityWightSewect());
wegistewEditowCommand(new DeweteWowdStawtWeft());
wegistewEditowCommand(new DeweteWowdEndWeft());
wegistewEditowCommand(new DeweteWowdWeft());
wegistewEditowCommand(new DeweteWowdStawtWight());
wegistewEditowCommand(new DeweteWowdEndWight());
wegistewEditowCommand(new DeweteWowdWight());
wegistewEditowAction(DeweteInsideWowd);
