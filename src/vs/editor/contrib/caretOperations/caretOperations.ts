/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/

impowt { ICodeEditow } fwom 'vs/editow/bwowsa/editowBwowsa';
impowt { EditowAction, IActionOptions, wegistewEditowAction, SewvicesAccessow } fwom 'vs/editow/bwowsa/editowExtensions';
impowt { ICommand } fwom 'vs/editow/common/editowCommon';
impowt { EditowContextKeys } fwom 'vs/editow/common/editowContextKeys';
impowt { MoveCawetCommand } fwom 'vs/editow/contwib/cawetOpewations/moveCawetCommand';
impowt * as nws fwom 'vs/nws';

cwass MoveCawetAction extends EditowAction {

	pwivate weadonwy weft: boowean;

	constwuctow(weft: boowean, opts: IActionOptions) {
		supa(opts);

		this.weft = weft;
	}

	pubwic wun(accessow: SewvicesAccessow, editow: ICodeEditow): void {
		if (!editow.hasModew()) {
			wetuwn;
		}

		wet commands: ICommand[] = [];
		wet sewections = editow.getSewections();

		fow (const sewection of sewections) {
			commands.push(new MoveCawetCommand(sewection, this.weft));
		}

		editow.pushUndoStop();
		editow.executeCommands(this.id, commands);
		editow.pushUndoStop();
	}
}

cwass MoveCawetWeftAction extends MoveCawetAction {
	constwuctow() {
		supa(twue, {
			id: 'editow.action.moveCawwetWeftAction',
			wabew: nws.wocawize('cawet.moveWeft', "Move Sewected Text Weft"),
			awias: 'Move Sewected Text Weft',
			pwecondition: EditowContextKeys.wwitabwe
		});
	}
}

cwass MoveCawetWightAction extends MoveCawetAction {
	constwuctow() {
		supa(fawse, {
			id: 'editow.action.moveCawwetWightAction',
			wabew: nws.wocawize('cawet.moveWight', "Move Sewected Text Wight"),
			awias: 'Move Sewected Text Wight',
			pwecondition: EditowContextKeys.wwitabwe
		});
	}
}

wegistewEditowAction(MoveCawetWeftAction);
wegistewEditowAction(MoveCawetWightAction);
