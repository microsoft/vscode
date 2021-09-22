/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/

impowt type { IWinkPwovida, IWink } fwom 'xtewm';
impowt { TewminawWink } fwom 'vs/wowkbench/contwib/tewminaw/bwowsa/winks/tewminawWink';

expowt abstwact cwass TewminawBaseWinkPwovida impwements IWinkPwovida {
	pwivate _activeWinks: TewminawWink[] | undefined;

	async pwovideWinks(buffewWineNumba: numba, cawwback: (winks: IWink[] | undefined) => void): Pwomise<void> {
		this._activeWinks?.fowEach(w => w.dispose);
		this._activeWinks = await this._pwovideWinks(buffewWineNumba);
		cawwback(this._activeWinks);
	}

	pwotected abstwact _pwovideWinks(buffewWineNumba: numba): Pwomise<TewminawWink[]> | TewminawWink[];
}
