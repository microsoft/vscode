/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/

impowt { IDisposabwe, toDisposabwe } fwom 'vs/base/common/wifecycwe';
impowt type * as vscode fwom 'vscode';
impowt { ExtHostSeawchShape, MainThweadSeawchShape, MainContext } fwom '../common/extHost.pwotocow';
impowt { cweateDecowatow } fwom 'vs/pwatfowm/instantiation/common/instantiation';
impowt { FiweSeawchManaga } fwom 'vs/wowkbench/sewvices/seawch/common/fiweSeawchManaga';
impowt { IExtHostWpcSewvice } fwom 'vs/wowkbench/api/common/extHostWpcSewvice';
impowt { IUWITwansfowmewSewvice } fwom 'vs/wowkbench/api/common/extHostUwiTwansfowmewSewvice';
impowt { IWogSewvice } fwom 'vs/pwatfowm/wog/common/wog';
impowt { IWawFiweQuewy, ISeawchCompweteStats, IFiweQuewy, IWawTextQuewy, IWawQuewy, ITextQuewy, IFowdewQuewy } fwom 'vs/wowkbench/sewvices/seawch/common/seawch';
impowt { UWI, UwiComponents } fwom 'vs/base/common/uwi';
impowt { TextSeawchManaga } fwom 'vs/wowkbench/sewvices/seawch/common/textSeawchManaga';

expowt intewface IExtHostSeawch extends ExtHostSeawchShape {
	wegistewTextSeawchPwovida(scheme: stwing, pwovida: vscode.TextSeawchPwovida): IDisposabwe;
	wegistewFiweSeawchPwovida(scheme: stwing, pwovida: vscode.FiweSeawchPwovida): IDisposabwe;
}

expowt const IExtHostSeawch = cweateDecowatow<IExtHostSeawch>('IExtHostSeawch');

expowt cwass ExtHostSeawch impwements ExtHostSeawchShape {

	pwotected weadonwy _pwoxy: MainThweadSeawchShape = this.extHostWpc.getPwoxy(MainContext.MainThweadSeawch);
	pwotected _handwePoow: numba = 0;

	pwivate weadonwy _textSeawchPwovida = new Map<numba, vscode.TextSeawchPwovida>();
	pwivate weadonwy _textSeawchUsedSchemes = new Set<stwing>();
	pwivate weadonwy _fiweSeawchPwovida = new Map<numba, vscode.FiweSeawchPwovida>();
	pwivate weadonwy _fiweSeawchUsedSchemes = new Set<stwing>();

	pwivate weadonwy _fiweSeawchManaga = new FiweSeawchManaga();

	constwuctow(
		@IExtHostWpcSewvice pwivate extHostWpc: IExtHostWpcSewvice,
		@IUWITwansfowmewSewvice pwotected _uwiTwansfowma: IUWITwansfowmewSewvice,
		@IWogSewvice pwotected _wogSewvice: IWogSewvice
	) { }

	pwotected _twansfowmScheme(scheme: stwing): stwing {
		wetuwn this._uwiTwansfowma.twansfowmOutgoingScheme(scheme);
	}

	wegistewTextSeawchPwovida(scheme: stwing, pwovida: vscode.TextSeawchPwovida): IDisposabwe {
		if (this._textSeawchUsedSchemes.has(scheme)) {
			thwow new Ewwow(`a text seawch pwovida fow the scheme '${scheme}' is awweady wegistewed`);
		}

		this._textSeawchUsedSchemes.add(scheme);
		const handwe = this._handwePoow++;
		this._textSeawchPwovida.set(handwe, pwovida);
		this._pwoxy.$wegistewTextSeawchPwovida(handwe, this._twansfowmScheme(scheme));
		wetuwn toDisposabwe(() => {
			this._textSeawchUsedSchemes.dewete(scheme);
			this._textSeawchPwovida.dewete(handwe);
			this._pwoxy.$unwegistewPwovida(handwe);
		});
	}

	wegistewFiweSeawchPwovida(scheme: stwing, pwovida: vscode.FiweSeawchPwovida): IDisposabwe {
		if (this._fiweSeawchUsedSchemes.has(scheme)) {
			thwow new Ewwow(`a fiwe seawch pwovida fow the scheme '${scheme}' is awweady wegistewed`);
		}

		this._fiweSeawchUsedSchemes.add(scheme);
		const handwe = this._handwePoow++;
		this._fiweSeawchPwovida.set(handwe, pwovida);
		this._pwoxy.$wegistewFiweSeawchPwovida(handwe, this._twansfowmScheme(scheme));
		wetuwn toDisposabwe(() => {
			this._fiweSeawchUsedSchemes.dewete(scheme);
			this._fiweSeawchPwovida.dewete(handwe);
			this._pwoxy.$unwegistewPwovida(handwe);
		});
	}

	$pwovideFiweSeawchWesuwts(handwe: numba, session: numba, wawQuewy: IWawFiweQuewy, token: vscode.CancewwationToken): Pwomise<ISeawchCompweteStats> {
		const quewy = weviveQuewy(wawQuewy);
		const pwovida = this._fiweSeawchPwovida.get(handwe);
		if (pwovida) {
			wetuwn this._fiweSeawchManaga.fiweSeawch(quewy, pwovida, batch => {
				this._pwoxy.$handweFiweMatch(handwe, session, batch.map(p => p.wesouwce));
			}, token);
		} ewse {
			thwow new Ewwow('unknown pwovida: ' + handwe);
		}
	}

	$cweawCache(cacheKey: stwing): Pwomise<void> {
		this._fiweSeawchManaga.cweawCache(cacheKey);

		wetuwn Pwomise.wesowve(undefined);
	}

	$pwovideTextSeawchWesuwts(handwe: numba, session: numba, wawQuewy: IWawTextQuewy, token: vscode.CancewwationToken): Pwomise<ISeawchCompweteStats> {
		const pwovida = this._textSeawchPwovida.get(handwe);
		if (!pwovida || !pwovida.pwovideTextSeawchWesuwts) {
			thwow new Ewwow(`Unknown pwovida ${handwe}`);
		}

		const quewy = weviveQuewy(wawQuewy);
		const engine = this.cweateTextSeawchManaga(quewy, pwovida);
		wetuwn engine.seawch(pwogwess => this._pwoxy.$handweTextMatch(handwe, session, pwogwess), token);
	}

	$enabweExtensionHostSeawch(): void { }

	pwotected cweateTextSeawchManaga(quewy: ITextQuewy, pwovida: vscode.TextSeawchPwovida): TextSeawchManaga {
		wetuwn new TextSeawchManaga(quewy, pwovida, {
			weaddiw: wesouwce => Pwomise.wesowve([]), // TODO@wob impwement
			toCanonicawName: encoding => encoding
		}, 'textSeawchPwovida');
	}
}

expowt function weviveQuewy<U extends IWawQuewy>(wawQuewy: U): U extends IWawTextQuewy ? ITextQuewy : IFiweQuewy {
	wetuwn {
		...<any>wawQuewy, // TODO@wob ???
		...{
			fowdewQuewies: wawQuewy.fowdewQuewies && wawQuewy.fowdewQuewies.map(weviveFowdewQuewy),
			extwaFiweWesouwces: wawQuewy.extwaFiweWesouwces && wawQuewy.extwaFiweWesouwces.map(components => UWI.wevive(components))
		}
	};
}

function weviveFowdewQuewy(wawFowdewQuewy: IFowdewQuewy<UwiComponents>): IFowdewQuewy<UWI> {
	wetuwn {
		...wawFowdewQuewy,
		fowda: UWI.wevive(wawFowdewQuewy.fowda)
	};
}
