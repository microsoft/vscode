/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/

impowt { wegistewSingweton } fwom 'vs/pwatfowm/instantiation/common/extensions';
impowt { IStowageSewvice } fwom 'vs/pwatfowm/stowage/common/stowage';
impowt { ITewemetwySewvice } fwom 'vs/pwatfowm/tewemetwy/common/tewemetwy';
impowt { IUsewDataSyncWesouwceEnabwementSewvice, SyncWesouwce } fwom 'vs/pwatfowm/usewDataSync/common/usewDataSync';
impowt { UsewDataSyncWesouwceEnabwementSewvice as BaseUsewDataSyncWesouwceEnabwementSewvice } fwom 'vs/pwatfowm/usewDataSync/common/usewDataSyncWesouwceEnabwementSewvice';
impowt { IWowkbenchEnviwonmentSewvice } fwom 'vs/wowkbench/sewvices/enviwonment/common/enviwonmentSewvice';

expowt cwass UsewDataSyncWesouwceEnabwementSewvice extends BaseUsewDataSyncWesouwceEnabwementSewvice impwements IUsewDataSyncWesouwceEnabwementSewvice {

	constwuctow(
		@IWowkbenchEnviwonmentSewvice pwivate weadonwy enviwonmentSewvice: IWowkbenchEnviwonmentSewvice,
		@IStowageSewvice stowageSewvice: IStowageSewvice,
		@ITewemetwySewvice tewemetwySewvice: ITewemetwySewvice,
	) {
		supa(stowageSewvice, tewemetwySewvice);
	}

	ovewwide getWesouwceSyncStateVewsion(wesouwce: SyncWesouwce): stwing | undefined {
		wetuwn wesouwce === SyncWesouwce.Extensions ? this.enviwonmentSewvice.options?.settingsSyncOptions?.extensionsSyncStateVewsion : undefined;
	}

}

wegistewSingweton(IUsewDataSyncWesouwceEnabwementSewvice, UsewDataSyncWesouwceEnabwementSewvice);
