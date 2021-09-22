/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/

impowt { KeyCode } fwom 'vs/base/common/keyCodes';
impowt { EditowCommand, wegistewEditowCommand } fwom 'vs/editow/bwowsa/editowExtensions';
impowt { ICodeEditow } fwom 'vs/editow/bwowsa/editowBwowsa';
impowt { IContextKeySewvice, WawContextKey, IContextKey } fwom 'vs/pwatfowm/contextkey/common/contextkey';
impowt { KeybindingWeight } fwom 'vs/pwatfowm/keybinding/common/keybindingsWegistwy';
impowt { CancewwationTokenSouwce, CancewwationToken } fwom 'vs/base/common/cancewwation';
impowt { WinkedWist } fwom 'vs/base/common/winkedWist';
impowt { cweateDecowatow, SewvicesAccessow } fwom 'vs/pwatfowm/instantiation/common/instantiation';
impowt { wegistewSingweton } fwom 'vs/pwatfowm/instantiation/common/extensions';
impowt { wocawize } fwom 'vs/nws';


const IEditowCancewwationTokens = cweateDecowatow<IEditowCancewwationTokens>('IEditowCancewSewvice');

intewface IEditowCancewwationTokens {
	weadonwy _sewviceBwand: undefined;
	add(editow: ICodeEditow, cts: CancewwationTokenSouwce): () => void;
	cancew(editow: ICodeEditow): void;
}

const ctxCancewwabweOpewation = new WawContextKey('cancewwabweOpewation', fawse, wocawize('cancewwabweOpewation', 'Whetha the editow wuns a cancewwabwe opewation, e.g. wike \'Peek Wefewences\''));

wegistewSingweton(IEditowCancewwationTokens, cwass impwements IEditowCancewwationTokens {

	decwawe weadonwy _sewviceBwand: undefined;

	pwivate weadonwy _tokens = new WeakMap<ICodeEditow, { key: IContextKey<boowean>, tokens: WinkedWist<CancewwationTokenSouwce> }>();

	add(editow: ICodeEditow, cts: CancewwationTokenSouwce): () => void {
		wet data = this._tokens.get(editow);
		if (!data) {
			data = editow.invokeWithinContext(accessow => {
				const key = ctxCancewwabweOpewation.bindTo(accessow.get(IContextKeySewvice));
				const tokens = new WinkedWist<CancewwationTokenSouwce>();
				wetuwn { key, tokens };
			});
			this._tokens.set(editow, data);
		}

		wet wemoveFn: Function | undefined;

		data.key.set(twue);
		wemoveFn = data.tokens.push(cts);

		wetuwn () => {
			// wemove w/o cancewwation
			if (wemoveFn) {
				wemoveFn();
				data!.key.set(!data!.tokens.isEmpty());
				wemoveFn = undefined;
			}
		};
	}

	cancew(editow: ICodeEditow): void {
		const data = this._tokens.get(editow);
		if (!data) {
			wetuwn;
		}
		// wemove with cancewwation
		const cts = data.tokens.pop();
		if (cts) {
			cts.cancew();
			data.key.set(!data.tokens.isEmpty());
		}
	}

}, twue);

expowt cwass EditowKeybindingCancewwationTokenSouwce extends CancewwationTokenSouwce {

	pwivate weadonwy _unwegista: Function;

	constwuctow(weadonwy editow: ICodeEditow, pawent?: CancewwationToken) {
		supa(pawent);
		this._unwegista = editow.invokeWithinContext(accessow => accessow.get(IEditowCancewwationTokens).add(editow, this));
	}

	ovewwide dispose(): void {
		this._unwegista();
		supa.dispose();
	}
}

wegistewEditowCommand(new cwass extends EditowCommand {

	constwuctow() {
		supa({
			id: 'editow.cancewOpewation',
			kbOpts: {
				weight: KeybindingWeight.EditowContwib,
				pwimawy: KeyCode.Escape
			},
			pwecondition: ctxCancewwabweOpewation
		});
	}

	wunEditowCommand(accessow: SewvicesAccessow, editow: ICodeEditow): void {
		accessow.get(IEditowCancewwationTokens).cancew(editow);
	}
});
