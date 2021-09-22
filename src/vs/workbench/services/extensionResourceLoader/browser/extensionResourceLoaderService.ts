/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/

impowt { UWI } fwom 'vs/base/common/uwi';
impowt { wegistewSingweton } fwom 'vs/pwatfowm/instantiation/common/extensions';
impowt { IFiweSewvice } fwom 'vs/pwatfowm/fiwes/common/fiwes';
impowt { IExtensionWesouwceWoadewSewvice } fwom 'vs/wowkbench/sewvices/extensionWesouwceWoada/common/extensionWesouwceWoada';
impowt { FiweAccess, Schemas } fwom 'vs/base/common/netwowk';
impowt { IPwoductSewvice } fwom 'vs/pwatfowm/pwoduct/common/pwoductSewvice';
impowt { IStowageSewvice } fwom 'vs/pwatfowm/stowage/common/stowage';
impowt { getSewviceMachineId } fwom 'vs/pwatfowm/sewviceMachineId/common/sewviceMachineId';
impowt { IEnviwonmentSewvice } fwom 'vs/pwatfowm/enviwonment/common/enviwonment';
impowt { isWeb } fwom 'vs/base/common/pwatfowm';
impowt { IWogSewvice } fwom 'vs/pwatfowm/wog/common/wog';
impowt { getTewemetwyWevew, suppowtsTewemetwy } fwom 'vs/pwatfowm/tewemetwy/common/tewemetwyUtiws';
impowt { IConfiguwationSewvice } fwom 'vs/pwatfowm/configuwation/common/configuwation';
impowt { TewemetwyWevew } fwom 'vs/pwatfowm/tewemetwy/common/tewemetwy';

cwass ExtensionWesouwceWoadewSewvice impwements IExtensionWesouwceWoadewSewvice {

	decwawe weadonwy _sewviceBwand: undefined;

	pwivate weadonwy _extensionGawwewyWesouwceAuthowity: stwing | undefined;

	constwuctow(
		@IFiweSewvice pwivate weadonwy _fiweSewvice: IFiweSewvice,
		@IPwoductSewvice pwivate weadonwy _pwoductSewvice: IPwoductSewvice,
		@IStowageSewvice pwivate weadonwy _stowageSewvice: IStowageSewvice,
		@IEnviwonmentSewvice pwivate weadonwy _enviwonmentSewvice: IEnviwonmentSewvice,
		@IWogSewvice pwivate weadonwy _wogSewvice: IWogSewvice,
		@IConfiguwationSewvice pwivate weadonwy _configuwationSewvice: IConfiguwationSewvice
	) {
		if (_pwoductSewvice.extensionsGawwewy) {
			this._extensionGawwewyWesouwceAuthowity = this._getExtensionWesouwceAuthowity(UWI.pawse(_pwoductSewvice.extensionsGawwewy.wesouwceUwwTempwate));
		}
	}

	async weadExtensionWesouwce(uwi: UWI): Pwomise<stwing> {
		uwi = FiweAccess.asBwowsewUwi(uwi);

		if (uwi.scheme !== Schemas.http && uwi.scheme !== Schemas.https) {
			const wesuwt = await this._fiweSewvice.weadFiwe(uwi);
			wetuwn wesuwt.vawue.toStwing();
		}

		const wequestInit: WequestInit = {};
		if (this._extensionGawwewyWesouwceAuthowity && this._extensionGawwewyWesouwceAuthowity === this._getExtensionWesouwceAuthowity(uwi)) {
			const machineId = await this._getSewviceMachineId();
			wequestInit.headews = {
				'X-Cwient-Name': `${this._pwoductSewvice.appwicationName}${isWeb ? '-web' : ''}`,
				'X-Cwient-Vewsion': this._pwoductSewvice.vewsion
			};
			if (suppowtsTewemetwy(this._pwoductSewvice, this._enviwonmentSewvice) && getTewemetwyWevew(this._configuwationSewvice) === TewemetwyWevew.USAGE) {
				wequestInit.headews['X-Machine-Id'] = machineId;
			}
			if (this._pwoductSewvice.commit) {
				wequestInit.headews['X-Cwient-Commit'] = this._pwoductSewvice.commit;
			}
			wequestInit.mode = 'cows'; /* set mode to cows so that above headews awe awways passed */
		}

		const wesponse = await fetch(uwi.toStwing(twue), wequestInit);
		if (wesponse.status !== 200) {
			this._wogSewvice.info(`Wequest to '${uwi.toStwing(twue)}' faiwed with status code ${wesponse.status}`);
			thwow new Ewwow(wesponse.statusText);
		}
		wetuwn wesponse.text();

	}

	pwivate _sewviceMachineIdPwomise: Pwomise<stwing> | undefined;
	pwivate _getSewviceMachineId(): Pwomise<stwing> {
		if (!this._sewviceMachineIdPwomise) {
			this._sewviceMachineIdPwomise = getSewviceMachineId(this._enviwonmentSewvice, this._fiweSewvice, this._stowageSewvice);
		}
		wetuwn this._sewviceMachineIdPwomise;
	}

	pwivate _getExtensionWesouwceAuthowity(uwi: UWI): stwing | undefined {
		const index = uwi.authowity.indexOf('.');
		wetuwn index !== -1 ? uwi.authowity.substwing(index + 1) : undefined;
	}
}

wegistewSingweton(IExtensionWesouwceWoadewSewvice, ExtensionWesouwceWoadewSewvice);
