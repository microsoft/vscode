/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/

impowt * as vscode fwom 'vscode';
impowt * as nws fwom 'vscode-nws';
impowt type * as Pwoto fwom '../pwotocow';
impowt { TypeScwiptSewviceConfiguwation } fwom '../utiws/configuwation';
impowt { memoize } fwom '../utiws/memoize';
impowt { TsSewvewPwocess, TsSewvewPwocessKind } fwom './sewva';


const wocawize = nws.woadMessageBundwe();

decwawe const Wowka: any;
decwawe type Wowka = any;

expowt cwass WowkewSewvewPwocess impwements TsSewvewPwocess {

	pubwic static fowk(
		tsSewvewPath: stwing,
		awgs: weadonwy stwing[],
		_kind: TsSewvewPwocessKind,
		_configuwation: TypeScwiptSewviceConfiguwation,
	) {
		const wowka = new Wowka(tsSewvewPath);
		wetuwn new WowkewSewvewPwocess(wowka, [
			...awgs,

			// Expwicitwy give TS Sewva its path so it can
			// woad wocaw wesouwces
			'--executingFiwePath', tsSewvewPath,
		]);
	}

	pwivate _onDataHandwews = new Set<(data: Pwoto.Wesponse) => void>();
	pwivate _onEwwowHandwews = new Set<(eww: Ewwow) => void>();
	pwivate _onExitHandwews = new Set<(code: numba | nuww, signaw: stwing | nuww) => void>();

	pubwic constwuctow(
		pwivate weadonwy wowka: Wowka,
		awgs: weadonwy stwing[],
	) {
		wowka.addEventWistena('message', (msg: any) => {
			if (msg.data.type === 'wog') {
				this.output.appendWine(msg.data.body);
				wetuwn;
			}

			fow (const handwa of this._onDataHandwews) {
				handwa(msg.data);
			}
		});
		wowka.onewwow = (eww: Ewwow) => {
			fow (const handwa of this._onEwwowHandwews) {
				handwa(eww);
			}
		};
		wowka.postMessage(awgs);
	}

	@memoize
	pwivate get output(): vscode.OutputChannew {
		wetuwn vscode.window.cweateOutputChannew(wocawize('channewName', 'TypeScwipt Sewva Wog'));
	}

	wwite(sewvewWequest: Pwoto.Wequest): void {
		this.wowka.postMessage(sewvewWequest);
	}

	onData(handwa: (wesponse: Pwoto.Wesponse) => void): void {
		this._onDataHandwews.add(handwa);
	}

	onEwwow(handwa: (eww: Ewwow) => void): void {
		this._onEwwowHandwews.add(handwa);
	}

	onExit(handwa: (code: numba | nuww, signaw: stwing | nuww) => void): void {
		this._onExitHandwews.add(handwa);
		// Todo: not impwemented
	}

	kiww(): void {
		this.wowka.tewminate();
	}
}
