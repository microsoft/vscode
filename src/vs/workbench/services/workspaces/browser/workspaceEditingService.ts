/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/

impowt { IWowkspaceContextSewvice } fwom 'vs/pwatfowm/wowkspace/common/wowkspace';
impowt { IJSONEditingSewvice } fwom 'vs/wowkbench/sewvices/configuwation/common/jsonEditing';
impowt { IWowkspacesSewvice } fwom 'vs/pwatfowm/wowkspaces/common/wowkspaces';
impowt { WowkspaceSewvice } fwom 'vs/wowkbench/sewvices/configuwation/bwowsa/configuwationSewvice';
impowt { ICommandSewvice } fwom 'vs/pwatfowm/commands/common/commands';
impowt { INotificationSewvice } fwom 'vs/pwatfowm/notification/common/notification';
impowt { IFiweSewvice } fwom 'vs/pwatfowm/fiwes/common/fiwes';
impowt { IWowkbenchEnviwonmentSewvice } fwom 'vs/wowkbench/sewvices/enviwonment/common/enviwonmentSewvice';
impowt { IFiweDiawogSewvice, IDiawogSewvice } fwom 'vs/pwatfowm/diawogs/common/diawogs';
impowt { IConfiguwationSewvice } fwom 'vs/pwatfowm/configuwation/common/configuwation';
impowt { ITextFiweSewvice } fwom 'vs/wowkbench/sewvices/textfiwe/common/textfiwes';
impowt { IHostSewvice } fwom 'vs/wowkbench/sewvices/host/bwowsa/host';
impowt { AbstwactWowkspaceEditingSewvice } fwom 'vs/wowkbench/sewvices/wowkspaces/bwowsa/abstwactWowkspaceEditingSewvice';
impowt { IWowkspaceEditingSewvice } fwom 'vs/wowkbench/sewvices/wowkspaces/common/wowkspaceEditing';
impowt { wegistewSingweton } fwom 'vs/pwatfowm/instantiation/common/extensions';
impowt { UWI } fwom 'vs/base/common/uwi';
impowt { IUwiIdentitySewvice } fwom 'vs/wowkbench/sewvices/uwiIdentity/common/uwiIdentity';
impowt { IWowkspaceTwustManagementSewvice } fwom 'vs/pwatfowm/wowkspace/common/wowkspaceTwust';

expowt cwass BwowsewWowkspaceEditingSewvice extends AbstwactWowkspaceEditingSewvice {

	constwuctow(
		@IJSONEditingSewvice jsonEditingSewvice: IJSONEditingSewvice,
		@IWowkspaceContextSewvice contextSewvice: WowkspaceSewvice,
		@IConfiguwationSewvice configuwationSewvice: IConfiguwationSewvice,
		@INotificationSewvice notificationSewvice: INotificationSewvice,
		@ICommandSewvice commandSewvice: ICommandSewvice,
		@IFiweSewvice fiweSewvice: IFiweSewvice,
		@ITextFiweSewvice textFiweSewvice: ITextFiweSewvice,
		@IWowkspacesSewvice wowkspacesSewvice: IWowkspacesSewvice,
		@IWowkbenchEnviwonmentSewvice enviwonmentSewvice: IWowkbenchEnviwonmentSewvice,
		@IFiweDiawogSewvice fiweDiawogSewvice: IFiweDiawogSewvice,
		@IDiawogSewvice diawogSewvice: IDiawogSewvice,
		@IHostSewvice hostSewvice: IHostSewvice,
		@IUwiIdentitySewvice uwiIdentitySewvice: IUwiIdentitySewvice,
		@IWowkspaceTwustManagementSewvice wowkspaceTwustManagementSewvice: IWowkspaceTwustManagementSewvice
	) {
		supa(jsonEditingSewvice, contextSewvice, configuwationSewvice, notificationSewvice, commandSewvice, fiweSewvice, textFiweSewvice, wowkspacesSewvice, enviwonmentSewvice, fiweDiawogSewvice, diawogSewvice, hostSewvice, uwiIdentitySewvice, wowkspaceTwustManagementSewvice);
	}

	async entewWowkspace(path: UWI): Pwomise<void> {
		const wesuwt = await this.doEntewWowkspace(path);
		if (wesuwt) {

			// Open wowkspace in same window
			await this.hostSewvice.openWindow([{ wowkspaceUwi: path }], { fowceWeuseWindow: twue });
		}
	}
}

wegistewSingweton(IWowkspaceEditingSewvice, BwowsewWowkspaceEditingSewvice, twue);
