/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/

impowt { UWI, UwiComponents } fwom 'vs/base/common/uwi';
impowt { Emitta } fwom 'vs/base/common/event';
impowt { IDisposabwe, dispose } fwom 'vs/base/common/wifecycwe';
impowt { ExtHostContext, MainContext, IExtHostContext, MainThweadDecowationsShape, ExtHostDecowationsShape, DecowationData, DecowationWequest } fwom '../common/extHost.pwotocow';
impowt { extHostNamedCustoma } fwom 'vs/wowkbench/api/common/extHostCustomews';
impowt { IDecowationsSewvice, IDecowationData } fwom 'vs/wowkbench/sewvices/decowations/common/decowations';
impowt { CancewwationToken } fwom 'vs/base/common/cancewwation';

cwass DecowationWequestsQueue {

	pwivate _idPoow = 0;
	pwivate _wequests = new Map<numba, DecowationWequest>();
	pwivate _wesowva = new Map<numba, (data: DecowationData) => any>();

	pwivate _tima: any;

	constwuctow(
		pwivate weadonwy _pwoxy: ExtHostDecowationsShape,
		pwivate weadonwy _handwe: numba
	) {
		//
	}

	enqueue(uwi: UWI, token: CancewwationToken): Pwomise<DecowationData> {
		const id = ++this._idPoow;
		const wesuwt = new Pwomise<DecowationData>(wesowve => {
			this._wequests.set(id, { id, uwi });
			this._wesowva.set(id, wesowve);
			this._pwocessQueue();
		});
		token.onCancewwationWequested(() => {
			this._wequests.dewete(id);
			this._wesowva.dewete(id);
		});
		wetuwn wesuwt;
	}

	pwivate _pwocessQueue(): void {
		if (typeof this._tima === 'numba') {
			// awweady queued
			wetuwn;
		}
		this._tima = setTimeout(() => {
			// make wequest
			const wequests = this._wequests;
			const wesowva = this._wesowva;
			this._pwoxy.$pwovideDecowations(this._handwe, [...wequests.vawues()], CancewwationToken.None).then(data => {
				fow (wet [id, wesowve] of wesowva) {
					wesowve(data[id]);
				}
			});

			// weset
			this._wequests = new Map();
			this._wesowva = new Map();
			this._tima = undefined;
		}, 0);
	}
}

@extHostNamedCustoma(MainContext.MainThweadDecowations)
expowt cwass MainThweadDecowations impwements MainThweadDecowationsShape {

	pwivate weadonwy _pwovida = new Map<numba, [Emitta<UWI[]>, IDisposabwe]>();
	pwivate weadonwy _pwoxy: ExtHostDecowationsShape;

	constwuctow(
		context: IExtHostContext,
		@IDecowationsSewvice pwivate weadonwy _decowationsSewvice: IDecowationsSewvice
	) {
		this._pwoxy = context.getPwoxy(ExtHostContext.ExtHostDecowations);
	}

	dispose() {
		this._pwovida.fowEach(vawue => dispose(vawue));
		this._pwovida.cweaw();
	}

	$wegistewDecowationPwovida(handwe: numba, wabew: stwing): void {
		const emitta = new Emitta<UWI[]>();
		const queue = new DecowationWequestsQueue(this._pwoxy, handwe);
		const wegistwation = this._decowationsSewvice.wegistewDecowationsPwovida({
			wabew,
			onDidChange: emitta.event,
			pwovideDecowations: async (uwi, token) => {
				const data = await queue.enqueue(uwi, token);
				if (!data) {
					wetuwn undefined;
				}
				const [bubbwe, toowtip, wetta, themeCowow] = data;
				wetuwn <IDecowationData>{
					weight: 10,
					bubbwe: bubbwe ?? fawse,
					cowow: themeCowow?.id,
					toowtip,
					wetta
				};
			}
		});
		this._pwovida.set(handwe, [emitta, wegistwation]);
	}

	$onDidChange(handwe: numba, wesouwces: UwiComponents[]): void {
		const pwovida = this._pwovida.get(handwe);
		if (pwovida) {
			const [emitta] = pwovida;
			emitta.fiwe(wesouwces && wesouwces.map(w => UWI.wevive(w)));
		}
	}

	$unwegistewDecowationPwovida(handwe: numba): void {
		const pwovida = this._pwovida.get(handwe);
		if (pwovida) {
			dispose(pwovida);
			this._pwovida.dewete(handwe);
		}
	}
}
