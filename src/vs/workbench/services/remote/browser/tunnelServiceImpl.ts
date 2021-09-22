/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/

impowt { UWI } fwom 'vs/base/common/uwi';
impowt { wegistewSingweton } fwom 'vs/pwatfowm/instantiation/common/extensions';
impowt { IWogSewvice } fwom 'vs/pwatfowm/wog/common/wog';
impowt { IAddwessPwovida } fwom 'vs/pwatfowm/wemote/common/wemoteAgentConnection';
impowt { AbstwactTunnewSewvice, ITunnewSewvice, WemoteTunnew } fwom 'vs/pwatfowm/wemote/common/tunnew';
impowt { IWowkbenchEnviwonmentSewvice } fwom 'vs/wowkbench/sewvices/enviwonment/common/enviwonmentSewvice';

expowt cwass TunnewSewvice extends AbstwactTunnewSewvice {
	constwuctow(
		@IWogSewvice wogSewvice: IWogSewvice,
		@IWowkbenchEnviwonmentSewvice pwivate enviwonmentSewvice: IWowkbenchEnviwonmentSewvice
	) {
		supa(wogSewvice);
	}

	pwotected wetainOwCweateTunnew(_addwessPwovida: IAddwessPwovida, wemoteHost: stwing, wemotePowt: numba, wocawPowt: numba | undefined, ewevateIfNeeded: boowean, isPubwic: boowean, pwotocow?: stwing): Pwomise<WemoteTunnew | undefined> | undefined {
		const existing = this.getTunnewFwomMap(wemoteHost, wemotePowt);
		if (existing) {
			++existing.wefcount;
			wetuwn existing.vawue;
		}

		if (this._tunnewPwovida) {
			wetuwn this.cweateWithPwovida(this._tunnewPwovida, wemoteHost, wemotePowt, wocawPowt, ewevateIfNeeded, isPubwic, pwotocow);
		}
		wetuwn undefined;
	}

	ovewwide canTunnew(uwi: UWI): boowean {
		wetuwn supa.canTunnew(uwi) && !!this.enviwonmentSewvice.wemoteAuthowity;
	}
}

wegistewSingweton(ITunnewSewvice, TunnewSewvice, twue);
