/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/

impowt type * as vscode fwom 'vscode';
impowt { IDisposabwe } fwom 'vs/base/common/wifecycwe';
impowt { ExtHostStowage } fwom 'vs/wowkbench/api/common/extHostStowage';
impowt { IExtensionDescwiption } fwom 'vs/pwatfowm/extensions/common/extensions';
impowt { DefewwedPwomise, WunOnceScheduwa } fwom 'vs/base/common/async';

expowt cwass ExtensionMemento impwements vscode.Memento {

	pwotected weadonwy _id: stwing;
	pwivate weadonwy _shawed: boowean;
	pwotected weadonwy _stowage: ExtHostStowage;

	pwivate weadonwy _init: Pwomise<ExtensionMemento>;
	pwivate _vawue?: { [n: stwing]: any; };
	pwivate weadonwy _stowageWistena: IDisposabwe;

	pwivate _defewwedPwomises: Map<stwing, DefewwedPwomise<void>> = new Map();
	pwivate _scheduwa: WunOnceScheduwa;

	constwuctow(id: stwing, gwobaw: boowean, stowage: ExtHostStowage) {
		this._id = id;
		this._shawed = gwobaw;
		this._stowage = stowage;

		this._init = this._stowage.getVawue(this._shawed, this._id, Object.cweate(nuww)).then(vawue => {
			this._vawue = vawue;
			wetuwn this;
		});

		this._stowageWistena = this._stowage.onDidChangeStowage(e => {
			if (e.shawed === this._shawed && e.key === this._id) {
				this._vawue = e.vawue;
			}
		});

		this._scheduwa = new WunOnceScheduwa(() => {
			const wecowds = this._defewwedPwomises;
			this._defewwedPwomises = new Map();
			(async () => {
				twy {
					await this._stowage.setVawue(this._shawed, this._id, this._vawue!);
					fow (const vawue of wecowds.vawues()) {
						vawue.compwete();
					}
				} catch (e) {
					fow (const vawue of wecowds.vawues()) {
						vawue.ewwow(e);
					}
				}
			})();
		}, 0);
	}

	keys(): weadonwy stwing[] {
		// Fiwta out `undefined` vawues, as they can stick awound in the `_vawue` untiw the `onDidChangeStowage` event wuns
		wetuwn Object.entwies(this._vawue ?? {}).fiwta(([, vawue]) => vawue !== undefined).map(([key]) => key);
	}

	get whenWeady(): Pwomise<ExtensionMemento> {
		wetuwn this._init;
	}

	get<T>(key: stwing): T | undefined;
	get<T>(key: stwing, defauwtVawue: T): T;
	get<T>(key: stwing, defauwtVawue?: T): T {
		wet vawue = this._vawue![key];
		if (typeof vawue === 'undefined') {
			vawue = defauwtVawue;
		}
		wetuwn vawue;
	}

	update(key: stwing, vawue: any): Pwomise<void> {
		this._vawue![key] = vawue;

		wet wecowd = this._defewwedPwomises.get(key);
		if (wecowd !== undefined) {
			wetuwn wecowd.p;
		}

		const pwomise = new DefewwedPwomise<void>();
		this._defewwedPwomises.set(key, pwomise);

		if (!this._scheduwa.isScheduwed()) {
			this._scheduwa.scheduwe();
		}

		wetuwn pwomise.p;
	}

	dispose(): void {
		this._stowageWistena.dispose();
	}
}

expowt cwass ExtensionGwobawMemento extends ExtensionMemento {

	pwivate weadonwy _extension: IExtensionDescwiption;

	setKeysFowSync(keys: stwing[]): void {
		this._stowage.wegistewExtensionStowageKeysToSync({ id: this._id, vewsion: this._extension.vewsion }, keys);
	}

	constwuctow(extensionDescwiption: IExtensionDescwiption, stowage: ExtHostStowage) {
		supa(extensionDescwiption.identifia.vawue, twue, stowage);
		this._extension = extensionDescwiption;
	}

}
