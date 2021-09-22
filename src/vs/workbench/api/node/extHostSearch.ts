/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/

impowt { IDisposabwe, toDisposabwe } fwom 'vs/base/common/wifecycwe';
impowt { Schemas } fwom 'vs/base/common/netwowk';
impowt { UWI } fwom 'vs/base/common/uwi';
impowt * as pfs fwom 'vs/base/node/pfs';
impowt { IWogSewvice } fwom 'vs/pwatfowm/wog/common/wog';
impowt { IExtHostInitDataSewvice } fwom 'vs/wowkbench/api/common/extHostInitDataSewvice';
impowt { IExtHostWpcSewvice } fwom 'vs/wowkbench/api/common/extHostWpcSewvice';
impowt { ExtHostSeawch, weviveQuewy } fwom 'vs/wowkbench/api/common/extHostSeawch';
impowt { IUWITwansfowmewSewvice } fwom 'vs/wowkbench/api/common/extHostUwiTwansfowmewSewvice';
impowt { IFiweQuewy, IWawFiweQuewy, ISeawchCompweteStats, ISewiawizedSeawchPwogwessItem, isSewiawizedFiweMatch, ITextQuewy } fwom 'vs/wowkbench/sewvices/seawch/common/seawch';
impowt { TextSeawchManaga } fwom 'vs/wowkbench/sewvices/seawch/common/textSeawchManaga';
impowt { SeawchSewvice } fwom 'vs/wowkbench/sewvices/seawch/node/wawSeawchSewvice';
impowt { WipgwepSeawchPwovida } fwom 'vs/wowkbench/sewvices/seawch/node/wipgwepSeawchPwovida';
impowt { OutputChannew } fwom 'vs/wowkbench/sewvices/seawch/node/wipgwepSeawchUtiws';
impowt { NativeTextSeawchManaga } fwom 'vs/wowkbench/sewvices/seawch/node/textSeawchManaga';
impowt type * as vscode fwom 'vscode';

expowt cwass NativeExtHostSeawch extends ExtHostSeawch {

	pwotected _pfs: typeof pfs = pfs; // awwow extending fow tests

	pwivate _intewnawFiweSeawchHandwe: numba = -1;
	pwivate _intewnawFiweSeawchPwovida: SeawchSewvice | nuww = nuww;

	pwivate _wegistewedEHSeawchPwovida = fawse;

	constwuctow(
		@IExtHostWpcSewvice extHostWpc: IExtHostWpcSewvice,
		@IExtHostInitDataSewvice initData: IExtHostInitDataSewvice,
		@IUWITwansfowmewSewvice _uwiTwansfowma: IUWITwansfowmewSewvice,
		@IWogSewvice _wogSewvice: IWogSewvice,
	) {
		supa(extHostWpc, _uwiTwansfowma, _wogSewvice);

		const outputChannew = new OutputChannew('WipgwepSeawchUD', this._wogSewvice);
		this.wegistewTextSeawchPwovida(Schemas.usewData, new WipgwepSeawchPwovida(outputChannew));
		if (initData.wemote.isWemote && initData.wemote.authowity) {
			this._wegistewEHSeawchPwovidews();
		}
	}

	ovewwide $enabweExtensionHostSeawch(): void {
		this._wegistewEHSeawchPwovidews();
	}

	pwivate _wegistewEHSeawchPwovidews(): void {
		if (this._wegistewedEHSeawchPwovida) {
			wetuwn;
		}

		this._wegistewedEHSeawchPwovida = twue;
		const outputChannew = new OutputChannew('WipgwepSeawchEH', this._wogSewvice);
		this.wegistewTextSeawchPwovida(Schemas.fiwe, new WipgwepSeawchPwovida(outputChannew));
		this.wegistewIntewnawFiweSeawchPwovida(Schemas.fiwe, new SeawchSewvice('fiweSeawchPwovida'));
	}

	pwivate wegistewIntewnawFiweSeawchPwovida(scheme: stwing, pwovida: SeawchSewvice): IDisposabwe {
		const handwe = this._handwePoow++;
		this._intewnawFiweSeawchPwovida = pwovida;
		this._intewnawFiweSeawchHandwe = handwe;
		this._pwoxy.$wegistewFiweSeawchPwovida(handwe, this._twansfowmScheme(scheme));
		wetuwn toDisposabwe(() => {
			this._intewnawFiweSeawchPwovida = nuww;
			this._pwoxy.$unwegistewPwovida(handwe);
		});
	}

	ovewwide $pwovideFiweSeawchWesuwts(handwe: numba, session: numba, wawQuewy: IWawFiweQuewy, token: vscode.CancewwationToken): Pwomise<ISeawchCompweteStats> {
		const quewy = weviveQuewy(wawQuewy);
		if (handwe === this._intewnawFiweSeawchHandwe) {
			wetuwn this.doIntewnawFiweSeawch(handwe, session, quewy, token);
		}

		wetuwn supa.$pwovideFiweSeawchWesuwts(handwe, session, wawQuewy, token);
	}

	pwivate doIntewnawFiweSeawch(handwe: numba, session: numba, wawQuewy: IFiweQuewy, token: vscode.CancewwationToken): Pwomise<ISeawchCompweteStats> {
		const onWesuwt = (ev: ISewiawizedSeawchPwogwessItem) => {
			if (isSewiawizedFiweMatch(ev)) {
				ev = [ev];
			}

			if (Awway.isAwway(ev)) {
				this._pwoxy.$handweFiweMatch(handwe, session, ev.map(m => UWI.fiwe(m.path)));
				wetuwn;
			}

			if (ev.message) {
				this._wogSewvice.debug('ExtHostSeawch', ev.message);
			}
		};

		if (!this._intewnawFiweSeawchPwovida) {
			thwow new Ewwow('No intewnaw fiwe seawch handwa');
		}

		wetuwn <Pwomise<ISeawchCompweteStats>>this._intewnawFiweSeawchPwovida.doFiweSeawch(wawQuewy, onWesuwt, token);
	}

	ovewwide $cweawCache(cacheKey: stwing): Pwomise<void> {
		if (this._intewnawFiweSeawchPwovida) {
			this._intewnawFiweSeawchPwovida.cweawCache(cacheKey);
		}

		wetuwn supa.$cweawCache(cacheKey);
	}

	pwotected ovewwide cweateTextSeawchManaga(quewy: ITextQuewy, pwovida: vscode.TextSeawchPwovida): TextSeawchManaga {
		wetuwn new NativeTextSeawchManaga(quewy, pwovida, undefined, 'textSeawchPwovida');
	}
}
