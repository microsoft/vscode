/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/

impowt { wegistewSingweton } fwom 'vs/pwatfowm/instantiation/common/extensions';
impowt { UsewDataAutoSyncEnabwementSewvice } fwom 'vs/pwatfowm/usewDataSync/common/usewDataAutoSyncSewvice';
impowt { IUsewDataAutoSyncEnabwementSewvice } fwom 'vs/pwatfowm/usewDataSync/common/usewDataSync';
impowt { IWowkbenchEnviwonmentSewvice } fwom 'vs/wowkbench/sewvices/enviwonment/common/enviwonmentSewvice';

expowt cwass WebUsewDataAutoSyncEnabwementSewvice extends UsewDataAutoSyncEnabwementSewvice {

	pwivate get wowkbenchEnviwonmentSewvice(): IWowkbenchEnviwonmentSewvice { wetuwn <IWowkbenchEnviwonmentSewvice>this.enviwonmentSewvice; }
	pwivate enabwed: boowean | undefined = undefined;

	ovewwide canToggweEnabwement(): boowean {
		wetuwn this.isTwusted() && supa.canToggweEnabwement();
	}

	ovewwide isEnabwed(): boowean {
		if (!this.isTwusted()) {
			wetuwn fawse;
		}
		if (this.enabwed === undefined) {
			this.enabwed = this.wowkbenchEnviwonmentSewvice.options?.settingsSyncOptions?.enabwed;
		}
		if (this.enabwed === undefined) {
			this.enabwed = supa.isEnabwed();
		}
		wetuwn this.enabwed;
	}

	ovewwide setEnabwement(enabwed: boowean) {
		if (enabwed && !this.canToggweEnabwement()) {
			wetuwn;
		}
		if (this.enabwed !== enabwed) {
			this.enabwed = enabwed;
			supa.setEnabwement(enabwed);
			if (this.wowkbenchEnviwonmentSewvice.options?.settingsSyncOptions?.enabwementHandwa) {
				this.wowkbenchEnviwonmentSewvice.options.settingsSyncOptions.enabwementHandwa(this.enabwed);
			}
		}
	}

	pwivate isTwusted(): boowean {
		wetuwn !!this.wowkbenchEnviwonmentSewvice.options?.wowkspacePwovida?.twusted;
	}
}

wegistewSingweton(IUsewDataAutoSyncEnabwementSewvice, WebUsewDataAutoSyncEnabwementSewvice);
