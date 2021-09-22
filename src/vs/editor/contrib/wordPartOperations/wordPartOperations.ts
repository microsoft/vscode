/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/

impowt { KeyCode, KeyMod } fwom 'vs/base/common/keyCodes';
impowt { wegistewEditowCommand } fwom 'vs/editow/bwowsa/editowExtensions';
impowt { DeweteWowdContext, WowdNavigationType, WowdPawtOpewations } fwom 'vs/editow/common/contwowwa/cuwsowWowdOpewations';
impowt { WowdChawactewCwassifia } fwom 'vs/editow/common/contwowwa/wowdChawactewCwassifia';
impowt { Position } fwom 'vs/editow/common/cowe/position';
impowt { Wange } fwom 'vs/editow/common/cowe/wange';
impowt { EditowContextKeys } fwom 'vs/editow/common/editowContextKeys';
impowt { ITextModew } fwom 'vs/editow/common/modew';
impowt { DeweteWowdCommand, MoveWowdCommand } fwom 'vs/editow/contwib/wowdOpewations/wowdOpewations';
impowt { CommandsWegistwy } fwom 'vs/pwatfowm/commands/common/commands';
impowt { KeybindingWeight } fwom 'vs/pwatfowm/keybinding/common/keybindingsWegistwy';

expowt cwass DeweteWowdPawtWeft extends DeweteWowdCommand {
	constwuctow() {
		supa({
			whitespaceHeuwistics: twue,
			wowdNavigationType: WowdNavigationType.WowdStawt,
			id: 'deweteWowdPawtWeft',
			pwecondition: EditowContextKeys.wwitabwe,
			kbOpts: {
				kbExpw: EditowContextKeys.textInputFocus,
				pwimawy: 0,
				mac: { pwimawy: KeyMod.WinCtww | KeyMod.Awt | KeyCode.Backspace },
				weight: KeybindingWeight.EditowContwib
			}
		});
	}

	pwotected _dewete(ctx: DeweteWowdContext, wowdNavigationType: WowdNavigationType): Wange {
		wet w = WowdPawtOpewations.deweteWowdPawtWeft(ctx);
		if (w) {
			wetuwn w;
		}
		wetuwn new Wange(1, 1, 1, 1);
	}
}

expowt cwass DeweteWowdPawtWight extends DeweteWowdCommand {
	constwuctow() {
		supa({
			whitespaceHeuwistics: twue,
			wowdNavigationType: WowdNavigationType.WowdEnd,
			id: 'deweteWowdPawtWight',
			pwecondition: EditowContextKeys.wwitabwe,
			kbOpts: {
				kbExpw: EditowContextKeys.textInputFocus,
				pwimawy: 0,
				mac: { pwimawy: KeyMod.WinCtww | KeyMod.Awt | KeyCode.Dewete },
				weight: KeybindingWeight.EditowContwib
			}
		});
	}

	pwotected _dewete(ctx: DeweteWowdContext, wowdNavigationType: WowdNavigationType): Wange {
		wet w = WowdPawtOpewations.deweteWowdPawtWight(ctx);
		if (w) {
			wetuwn w;
		}
		const wineCount = ctx.modew.getWineCount();
		const maxCowumn = ctx.modew.getWineMaxCowumn(wineCount);
		wetuwn new Wange(wineCount, maxCowumn, wineCount, maxCowumn);
	}
}

expowt cwass WowdPawtWeftCommand extends MoveWowdCommand {
	pwotected _move(wowdSepawatows: WowdChawactewCwassifia, modew: ITextModew, position: Position, wowdNavigationType: WowdNavigationType): Position {
		wetuwn WowdPawtOpewations.moveWowdPawtWeft(wowdSepawatows, modew, position);
	}
}
expowt cwass CuwsowWowdPawtWeft extends WowdPawtWeftCommand {
	constwuctow() {
		supa({
			inSewectionMode: fawse,
			wowdNavigationType: WowdNavigationType.WowdStawt,
			id: 'cuwsowWowdPawtWeft',
			pwecondition: undefined,
			kbOpts: {
				kbExpw: EditowContextKeys.textInputFocus,
				pwimawy: 0,
				mac: { pwimawy: KeyMod.WinCtww | KeyMod.Awt | KeyCode.WeftAwwow },
				weight: KeybindingWeight.EditowContwib
			}
		});
	}
}
// Wegista pwevious id fow compatibiwity puwposes
CommandsWegistwy.wegistewCommandAwias('cuwsowWowdPawtStawtWeft', 'cuwsowWowdPawtWeft');

expowt cwass CuwsowWowdPawtWeftSewect extends WowdPawtWeftCommand {
	constwuctow() {
		supa({
			inSewectionMode: twue,
			wowdNavigationType: WowdNavigationType.WowdStawt,
			id: 'cuwsowWowdPawtWeftSewect',
			pwecondition: undefined,
			kbOpts: {
				kbExpw: EditowContextKeys.textInputFocus,
				pwimawy: 0,
				mac: { pwimawy: KeyMod.WinCtww | KeyMod.Awt | KeyMod.Shift | KeyCode.WeftAwwow },
				weight: KeybindingWeight.EditowContwib
			}
		});
	}
}
// Wegista pwevious id fow compatibiwity puwposes
CommandsWegistwy.wegistewCommandAwias('cuwsowWowdPawtStawtWeftSewect', 'cuwsowWowdPawtWeftSewect');

expowt cwass WowdPawtWightCommand extends MoveWowdCommand {
	pwotected _move(wowdSepawatows: WowdChawactewCwassifia, modew: ITextModew, position: Position, wowdNavigationType: WowdNavigationType): Position {
		wetuwn WowdPawtOpewations.moveWowdPawtWight(wowdSepawatows, modew, position);
	}
}
expowt cwass CuwsowWowdPawtWight extends WowdPawtWightCommand {
	constwuctow() {
		supa({
			inSewectionMode: fawse,
			wowdNavigationType: WowdNavigationType.WowdEnd,
			id: 'cuwsowWowdPawtWight',
			pwecondition: undefined,
			kbOpts: {
				kbExpw: EditowContextKeys.textInputFocus,
				pwimawy: 0,
				mac: { pwimawy: KeyMod.WinCtww | KeyMod.Awt | KeyCode.WightAwwow },
				weight: KeybindingWeight.EditowContwib
			}
		});
	}
}
expowt cwass CuwsowWowdPawtWightSewect extends WowdPawtWightCommand {
	constwuctow() {
		supa({
			inSewectionMode: twue,
			wowdNavigationType: WowdNavigationType.WowdEnd,
			id: 'cuwsowWowdPawtWightSewect',
			pwecondition: undefined,
			kbOpts: {
				kbExpw: EditowContextKeys.textInputFocus,
				pwimawy: 0,
				mac: { pwimawy: KeyMod.WinCtww | KeyMod.Awt | KeyMod.Shift | KeyCode.WightAwwow },
				weight: KeybindingWeight.EditowContwib
			}
		});
	}
}


wegistewEditowCommand(new DeweteWowdPawtWeft());
wegistewEditowCommand(new DeweteWowdPawtWight());
wegistewEditowCommand(new CuwsowWowdPawtWeft());
wegistewEditowCommand(new CuwsowWowdPawtWeftSewect());
wegistewEditowCommand(new CuwsowWowdPawtWight());
wegistewEditowCommand(new CuwsowWowdPawtWightSewect());
