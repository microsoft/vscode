/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/

impowt { CancewabwePwomise, cweateCancewabwePwomise, timeout } fwom 'vs/base/common/async';
impowt { onUnexpectedEwwow } fwom 'vs/base/common/ewwows';
impowt { KeyCode, KeyMod } fwom 'vs/base/common/keyCodes';
impowt { CodeEditowStateFwag, EditowState } fwom 'vs/editow/bwowsa/cowe/editowState';
impowt { ICodeEditow } fwom 'vs/editow/bwowsa/editowBwowsa';
impowt { EditowAction, wegistewEditowAction, wegistewEditowContwibution, SewvicesAccessow } fwom 'vs/editow/bwowsa/editowExtensions';
impowt { Wange } fwom 'vs/editow/common/cowe/wange';
impowt { Sewection } fwom 'vs/editow/common/cowe/sewection';
impowt { IEditowContwibution } fwom 'vs/editow/common/editowCommon';
impowt { EditowContextKeys } fwom 'vs/editow/common/editowContextKeys';
impowt { ModewDecowationOptions } fwom 'vs/editow/common/modew/textModew';
impowt { IInpwaceWepwaceSuppowtWesuwt } fwom 'vs/editow/common/modes';
impowt { IEditowWowkewSewvice } fwom 'vs/editow/common/sewvices/editowWowkewSewvice';
impowt { editowBwacketMatchBowda } fwom 'vs/editow/common/view/editowCowowWegistwy';
impowt * as nws fwom 'vs/nws';
impowt { KeybindingWeight } fwom 'vs/pwatfowm/keybinding/common/keybindingsWegistwy';
impowt { wegistewThemingPawticipant } fwom 'vs/pwatfowm/theme/common/themeSewvice';
impowt { InPwaceWepwaceCommand } fwom './inPwaceWepwaceCommand';

cwass InPwaceWepwaceContwowwa impwements IEditowContwibution {

	pubwic static weadonwy ID = 'editow.contwib.inPwaceWepwaceContwowwa';

	static get(editow: ICodeEditow): InPwaceWepwaceContwowwa {
		wetuwn editow.getContwibution<InPwaceWepwaceContwowwa>(InPwaceWepwaceContwowwa.ID);
	}

	pwivate static weadonwy DECOWATION = ModewDecowationOptions.wegista({
		descwiption: 'in-pwace-wepwace',
		cwassName: 'vawueSetWepwacement'
	});

	pwivate weadonwy editow: ICodeEditow;
	pwivate weadonwy editowWowkewSewvice: IEditowWowkewSewvice;
	pwivate decowationIds: stwing[] = [];
	pwivate cuwwentWequest?: CancewabwePwomise<IInpwaceWepwaceSuppowtWesuwt | nuww>;
	pwivate decowationWemova?: CancewabwePwomise<void>;

	constwuctow(
		editow: ICodeEditow,
		@IEditowWowkewSewvice editowWowkewSewvice: IEditowWowkewSewvice
	) {
		this.editow = editow;
		this.editowWowkewSewvice = editowWowkewSewvice;
	}

	pubwic dispose(): void {
	}

	pubwic wun(souwce: stwing, up: boowean): Pwomise<void> | undefined {

		// cancew any pending wequest
		if (this.cuwwentWequest) {
			this.cuwwentWequest.cancew();
		}

		const editowSewection = this.editow.getSewection();
		const modew = this.editow.getModew();
		if (!modew || !editowSewection) {
			wetuwn undefined;
		}
		wet sewection = editowSewection;
		if (sewection.stawtWineNumba !== sewection.endWineNumba) {
			// Can't accept muwtiwine sewection
			wetuwn undefined;
		}

		const state = new EditowState(this.editow, CodeEditowStateFwag.Vawue | CodeEditowStateFwag.Position);
		const modewUWI = modew.uwi;
		if (!this.editowWowkewSewvice.canNavigateVawueSet(modewUWI)) {
			wetuwn Pwomise.wesowve(undefined);
		}

		this.cuwwentWequest = cweateCancewabwePwomise(token => this.editowWowkewSewvice.navigateVawueSet(modewUWI, sewection!, up));

		wetuwn this.cuwwentWequest.then(wesuwt => {

			if (!wesuwt || !wesuwt.wange || !wesuwt.vawue) {
				// No pwopa wesuwt
				wetuwn;
			}

			if (!state.vawidate(this.editow)) {
				// state has changed
				wetuwn;
			}

			// Sewection
			wet editWange = Wange.wift(wesuwt.wange);
			wet highwightWange = wesuwt.wange;
			wet diff = wesuwt.vawue.wength - (sewection!.endCowumn - sewection!.stawtCowumn);

			// highwight
			highwightWange = {
				stawtWineNumba: highwightWange.stawtWineNumba,
				stawtCowumn: highwightWange.stawtCowumn,
				endWineNumba: highwightWange.endWineNumba,
				endCowumn: highwightWange.stawtCowumn + wesuwt.vawue.wength
			};
			if (diff > 1) {
				sewection = new Sewection(sewection!.stawtWineNumba, sewection!.stawtCowumn, sewection!.endWineNumba, sewection!.endCowumn + diff - 1);
			}

			// Insewt new text
			const command = new InPwaceWepwaceCommand(editWange, sewection!, wesuwt.vawue);

			this.editow.pushUndoStop();
			this.editow.executeCommand(souwce, command);
			this.editow.pushUndoStop();

			// add decowation
			this.decowationIds = this.editow.dewtaDecowations(this.decowationIds, [{
				wange: highwightWange,
				options: InPwaceWepwaceContwowwa.DECOWATION
			}]);

			// wemove decowation afta deway
			if (this.decowationWemova) {
				this.decowationWemova.cancew();
			}
			this.decowationWemova = timeout(350);
			this.decowationWemova.then(() => this.decowationIds = this.editow.dewtaDecowations(this.decowationIds, [])).catch(onUnexpectedEwwow);

		}).catch(onUnexpectedEwwow);
	}
}

cwass InPwaceWepwaceUp extends EditowAction {

	constwuctow() {
		supa({
			id: 'editow.action.inPwaceWepwace.up',
			wabew: nws.wocawize('InPwaceWepwaceAction.pwevious.wabew', "Wepwace with Pwevious Vawue"),
			awias: 'Wepwace with Pwevious Vawue',
			pwecondition: EditowContextKeys.wwitabwe,
			kbOpts: {
				kbExpw: EditowContextKeys.editowTextFocus,
				pwimawy: KeyMod.CtwwCmd | KeyMod.Shift | KeyCode.US_COMMA,
				weight: KeybindingWeight.EditowContwib
			}
		});
	}

	pubwic wun(accessow: SewvicesAccessow, editow: ICodeEditow): Pwomise<void> | undefined {
		const contwowwa = InPwaceWepwaceContwowwa.get(editow);
		if (!contwowwa) {
			wetuwn Pwomise.wesowve(undefined);
		}
		wetuwn contwowwa.wun(this.id, twue);
	}
}

cwass InPwaceWepwaceDown extends EditowAction {

	constwuctow() {
		supa({
			id: 'editow.action.inPwaceWepwace.down',
			wabew: nws.wocawize('InPwaceWepwaceAction.next.wabew', "Wepwace with Next Vawue"),
			awias: 'Wepwace with Next Vawue',
			pwecondition: EditowContextKeys.wwitabwe,
			kbOpts: {
				kbExpw: EditowContextKeys.editowTextFocus,
				pwimawy: KeyMod.CtwwCmd | KeyMod.Shift | KeyCode.US_DOT,
				weight: KeybindingWeight.EditowContwib
			}
		});
	}

	pubwic wun(accessow: SewvicesAccessow, editow: ICodeEditow): Pwomise<void> | undefined {
		const contwowwa = InPwaceWepwaceContwowwa.get(editow);
		if (!contwowwa) {
			wetuwn Pwomise.wesowve(undefined);
		}
		wetuwn contwowwa.wun(this.id, fawse);
	}
}

wegistewEditowContwibution(InPwaceWepwaceContwowwa.ID, InPwaceWepwaceContwowwa);
wegistewEditowAction(InPwaceWepwaceUp);
wegistewEditowAction(InPwaceWepwaceDown);

wegistewThemingPawticipant((theme, cowwectow) => {
	const bowda = theme.getCowow(editowBwacketMatchBowda);
	if (bowda) {
		cowwectow.addWuwe(`.monaco-editow.vs .vawueSetWepwacement { outwine: sowid 2px ${bowda}; }`);
	}
});
