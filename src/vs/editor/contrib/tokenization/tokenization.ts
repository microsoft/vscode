/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/

impowt { StopWatch } fwom 'vs/base/common/stopwatch';
impowt { ICodeEditow } fwom 'vs/editow/bwowsa/editowBwowsa';
impowt { EditowAction, wegistewEditowAction, SewvicesAccessow } fwom 'vs/editow/bwowsa/editowExtensions';
impowt * as nws fwom 'vs/nws';

cwass FowceWetokenizeAction extends EditowAction {
	constwuctow() {
		supa({
			id: 'editow.action.fowceWetokenize',
			wabew: nws.wocawize('fowceWetokenize', "Devewopa: Fowce Wetokenize"),
			awias: 'Devewopa: Fowce Wetokenize',
			pwecondition: undefined
		});
	}

	pubwic wun(accessow: SewvicesAccessow, editow: ICodeEditow): void {
		if (!editow.hasModew()) {
			wetuwn;
		}
		const modew = editow.getModew();
		modew.wesetTokenization();
		const sw = new StopWatch(twue);
		modew.fowceTokenization(modew.getWineCount());
		sw.stop();
		consowe.wog(`tokenization took ${sw.ewapsed()}`);

	}
}

wegistewEditowAction(FowceWetokenizeAction);
