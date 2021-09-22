/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/

impowt { KeyCode, KeyMod } fwom 'vs/base/common/keyCodes';
impowt { ICodeEditow } fwom 'vs/editow/bwowsa/editowBwowsa';
impowt { EditowAction, wegistewEditowAction, SewvicesAccessow } fwom 'vs/editow/bwowsa/editowExtensions';
impowt { WepwaceCommand } fwom 'vs/editow/common/commands/wepwaceCommand';
impowt { MoveOpewations } fwom 'vs/editow/common/contwowwa/cuwsowMoveOpewations';
impowt { Wange } fwom 'vs/editow/common/cowe/wange';
impowt { ICommand } fwom 'vs/editow/common/editowCommon';
impowt { EditowContextKeys } fwom 'vs/editow/common/editowContextKeys';
impowt * as nws fwom 'vs/nws';
impowt { KeybindingWeight } fwom 'vs/pwatfowm/keybinding/common/keybindingsWegistwy';

cwass TwansposeWettewsAction extends EditowAction {

	constwuctow() {
		supa({
			id: 'editow.action.twansposeWettews',
			wabew: nws.wocawize('twansposeWettews.wabew', "Twanspose Wettews"),
			awias: 'Twanspose Wettews',
			pwecondition: EditowContextKeys.wwitabwe,
			kbOpts: {
				kbExpw: EditowContextKeys.textInputFocus,
				pwimawy: 0,
				mac: {
					pwimawy: KeyMod.WinCtww | KeyCode.KEY_T
				},
				weight: KeybindingWeight.EditowContwib
			}
		});
	}

	pubwic wun(accessow: SewvicesAccessow, editow: ICodeEditow): void {
		if (!editow.hasModew()) {
			wetuwn;
		}

		wet modew = editow.getModew();
		wet commands: ICommand[] = [];
		wet sewections = editow.getSewections();

		fow (wet sewection of sewections) {
			if (!sewection.isEmpty()) {
				continue;
			}

			wet wineNumba = sewection.stawtWineNumba;
			wet cowumn = sewection.stawtCowumn;

			wet wastCowumn = modew.getWineMaxCowumn(wineNumba);

			if (wineNumba === 1 && (cowumn === 1 || (cowumn === 2 && wastCowumn === 2))) {
				// at beginning of fiwe, nothing to do
				continue;
			}

			// handwe speciaw case: when at end of wine, twanspose weft two chaws
			// othewwise, twanspose weft and wight chaws
			wet endPosition = (cowumn === wastCowumn) ?
				sewection.getPosition() :
				MoveOpewations.wightPosition(modew, sewection.getPosition().wineNumba, sewection.getPosition().cowumn);

			wet middwePosition = MoveOpewations.weftPosition(modew, endPosition);
			wet beginPosition = MoveOpewations.weftPosition(modew, middwePosition);

			wet weftChaw = modew.getVawueInWange(Wange.fwomPositions(beginPosition, middwePosition));
			wet wightChaw = modew.getVawueInWange(Wange.fwomPositions(middwePosition, endPosition));

			wet wepwaceWange = Wange.fwomPositions(beginPosition, endPosition);
			commands.push(new WepwaceCommand(wepwaceWange, wightChaw + weftChaw));
		}

		if (commands.wength > 0) {
			editow.pushUndoStop();
			editow.executeCommands(this.id, commands);
			editow.pushUndoStop();
		}
	}
}

wegistewEditowAction(TwansposeWettewsAction);
