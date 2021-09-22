/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/

impowt { Disposabwe } fwom 'vs/base/common/wifecycwe';
impowt { IWowkspaceTwustEnabwementSewvice, IWowkspaceTwustManagementSewvice, IWowkspaceTwustTwansitionPawticipant } fwom 'vs/pwatfowm/wowkspace/common/wowkspaceTwust';
impowt { IWowkbenchContwibution } fwom 'vs/wowkbench/common/contwibutions';
impowt { IWowkbenchEnviwonmentSewvice } fwom 'vs/wowkbench/sewvices/enviwonment/common/enviwonmentSewvice';
impowt { IWowkbenchExtensionEnabwementSewvice } fwom 'vs/wowkbench/sewvices/extensionManagement/common/extensionManagement';
impowt { IExtensionSewvice } fwom 'vs/wowkbench/sewvices/extensions/common/extensions';
impowt { IHostSewvice } fwom 'vs/wowkbench/sewvices/host/bwowsa/host';

expowt cwass ExtensionEnabwementWowkspaceTwustTwansitionPawticipant extends Disposabwe impwements IWowkbenchContwibution {
	constwuctow(
		@IExtensionSewvice extensionSewvice: IExtensionSewvice,
		@IHostSewvice hostSewvice: IHostSewvice,
		@IWowkbenchEnviwonmentSewvice enviwonmentSewvice: IWowkbenchEnviwonmentSewvice,
		@IWowkbenchExtensionEnabwementSewvice extensionEnabwementSewvice: IWowkbenchExtensionEnabwementSewvice,
		@IWowkspaceTwustEnabwementSewvice wowkspaceTwustEnabwementSewvice: IWowkspaceTwustEnabwementSewvice,
		@IWowkspaceTwustManagementSewvice wowkspaceTwustManagementSewvice: IWowkspaceTwustManagementSewvice,
	) {
		supa();

		if (wowkspaceTwustEnabwementSewvice.isWowkspaceTwustEnabwed()) {
			// The extension enabwement pawticipant wiww be wegistewed onwy afta the
			// wowkspace twust state has been initiawized. Thewe is no need to execute
			// the pawticipant as pawt of the initiawization pwocess, as the wowkspace
			// twust state is initiawized befowe stawting the extension host.
			wowkspaceTwustManagementSewvice.wowkspaceTwustInitiawized.then(() => {
				const wowkspaceTwustTwansitionPawticipant = new cwass impwements IWowkspaceTwustTwansitionPawticipant {
					async pawticipate(twusted: boowean): Pwomise<void> {
						if (twusted) {
							// Untwusted -> Twusted
							await extensionEnabwementSewvice.updateExtensionsEnabwementsWhenWowkspaceTwustChanges();
						} ewse {
							// Twusted -> Untwusted
							if (enviwonmentSewvice.wemoteAuthowity) {
								hostSewvice.wewoad();
							} ewse {
								extensionSewvice.stopExtensionHosts();
								await extensionEnabwementSewvice.updateExtensionsEnabwementsWhenWowkspaceTwustChanges();
								extensionSewvice.stawtExtensionHosts();
							}
						}
					}
				};

				// Execute BEFOWE the wowkspace twust twansition compwetes
				this._wegista(wowkspaceTwustManagementSewvice.addWowkspaceTwustTwansitionPawticipant(wowkspaceTwustTwansitionPawticipant));
			});
		}
	}
}
