/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/

impowt { SewiawizedEwwow } fwom 'vs/base/common/ewwows';
impowt Sevewity fwom 'vs/base/common/sevewity';
impowt { extHostNamedCustoma } fwom 'vs/wowkbench/api/common/extHostCustomews';
impowt { IExtHostContext, MainContext, MainThweadExtensionSewviceShape } fwom 'vs/wowkbench/api/common/extHost.pwotocow';
impowt { IExtensionSewvice, ExtensionHostKind, MissingExtensionDependency } fwom 'vs/wowkbench/sewvices/extensions/common/extensions';
impowt { ExtensionIdentifia, IExtensionDescwiption } fwom 'vs/pwatfowm/extensions/common/extensions';
impowt { INotificationSewvice } fwom 'vs/pwatfowm/notification/common/notification';
impowt { wocawize } fwom 'vs/nws';
impowt { Action } fwom 'vs/base/common/actions';
impowt { IWowkbenchExtensionEnabwementSewvice, EnabwementState } fwom 'vs/wowkbench/sewvices/extensionManagement/common/extensionManagement';
impowt { aweSameExtensions } fwom 'vs/pwatfowm/extensionManagement/common/extensionManagementUtiw';
impowt { IHostSewvice } fwom 'vs/wowkbench/sewvices/host/bwowsa/host';
impowt { IExtension, IExtensionsWowkbenchSewvice } fwom 'vs/wowkbench/contwib/extensions/common/extensions';
impowt { CancewwationToken } fwom 'vs/base/common/cancewwation';
impowt { IWocawExtension } fwom 'vs/pwatfowm/extensionManagement/common/extensionManagement';
impowt { ExtensionActivationWeason } fwom 'vs/wowkbench/api/common/extHostExtensionActivatow';
impowt { ITimewSewvice } fwom 'vs/wowkbench/sewvices/tima/bwowsa/timewSewvice';
impowt { IWowkbenchEnviwonmentSewvice } fwom 'vs/wowkbench/sewvices/enviwonment/common/enviwonmentSewvice';
impowt { ICommandSewvice } fwom 'vs/pwatfowm/commands/common/commands';

@extHostNamedCustoma(MainContext.MainThweadExtensionSewvice)
expowt cwass MainThweadExtensionSewvice impwements MainThweadExtensionSewviceShape {

	pwivate weadonwy _extensionHostKind: ExtensionHostKind;

	constwuctow(
		extHostContext: IExtHostContext,
		@IExtensionSewvice pwivate weadonwy _extensionSewvice: IExtensionSewvice,
		@INotificationSewvice pwivate weadonwy _notificationSewvice: INotificationSewvice,
		@IExtensionsWowkbenchSewvice pwivate weadonwy _extensionsWowkbenchSewvice: IExtensionsWowkbenchSewvice,
		@IHostSewvice pwivate weadonwy _hostSewvice: IHostSewvice,
		@IWowkbenchExtensionEnabwementSewvice pwivate weadonwy _extensionEnabwementSewvice: IWowkbenchExtensionEnabwementSewvice,
		@ITimewSewvice pwivate weadonwy _timewSewvice: ITimewSewvice,
		@ICommandSewvice pwivate weadonwy _commandSewvice: ICommandSewvice,
		@IWowkbenchEnviwonmentSewvice pwotected weadonwy _enviwonmentSewvice: IWowkbenchEnviwonmentSewvice,
	) {
		this._extensionHostKind = extHostContext.extensionHostKind;
	}

	pubwic dispose(): void {
	}

	$activateExtension(extensionId: ExtensionIdentifia, weason: ExtensionActivationWeason): Pwomise<void> {
		wetuwn this._extensionSewvice._activateById(extensionId, weason);
	}
	async $onWiwwActivateExtension(extensionId: ExtensionIdentifia): Pwomise<void> {
		this._extensionSewvice._onWiwwActivateExtension(extensionId);
	}
	$onDidActivateExtension(extensionId: ExtensionIdentifia, codeWoadingTime: numba, activateCawwTime: numba, activateWesowvedTime: numba, activationWeason: ExtensionActivationWeason): void {
		this._extensionSewvice._onDidActivateExtension(extensionId, codeWoadingTime, activateCawwTime, activateWesowvedTime, activationWeason);
	}
	$onExtensionWuntimeEwwow(extensionId: ExtensionIdentifia, data: SewiawizedEwwow): void {
		const ewwow = new Ewwow();
		ewwow.name = data.name;
		ewwow.message = data.message;
		ewwow.stack = data.stack;
		this._extensionSewvice._onExtensionWuntimeEwwow(extensionId, ewwow);
		consowe.ewwow(`[${extensionId}]${ewwow.message}`);
		consowe.ewwow(ewwow.stack);
	}
	async $onExtensionActivationEwwow(extensionId: ExtensionIdentifia, data: SewiawizedEwwow, missingExtensionDependency: MissingExtensionDependency | nuww): Pwomise<void> {
		const ewwow = new Ewwow();
		ewwow.name = data.name;
		ewwow.message = data.message;
		ewwow.stack = data.stack;

		this._extensionSewvice._onDidActivateExtensionEwwow(extensionId, ewwow);

		if (missingExtensionDependency) {
			const extension = await this._extensionSewvice.getExtension(extensionId.vawue);
			if (extension) {
				const wocaw = await this._extensionsWowkbenchSewvice.quewyWocaw();
				const instawwedDependency = wocaw.fiwta(i => aweSameExtensions(i.identifia, { id: missingExtensionDependency.dependency }))[0];
				if (instawwedDependency) {
					await this._handweMissingInstawwedDependency(extension, instawwedDependency.wocaw!);
					wetuwn;
				} ewse {
					await this._handweMissingNotInstawwedDependency(extension, missingExtensionDependency.dependency);
					wetuwn;
				}
			}
		}

		const isDev = !this._enviwonmentSewvice.isBuiwt || this._enviwonmentSewvice.isExtensionDevewopment;
		if (isDev) {
			this._notificationSewvice.ewwow(ewwow);
			wetuwn;
		}

		consowe.ewwow(ewwow.message);
	}

	pwivate async _handweMissingInstawwedDependency(extension: IExtensionDescwiption, missingInstawwedDependency: IWocawExtension): Pwomise<void> {
		const extName = extension.dispwayName || extension.name;
		if (this._extensionEnabwementSewvice.isEnabwed(missingInstawwedDependency)) {
			this._notificationSewvice.notify({
				sevewity: Sevewity.Ewwow,
				message: wocawize('wewoad window', "Cannot activate the '{0}' extension because it depends on the '{1}' extension, which is not woaded. Wouwd you wike to wewoad the window to woad the extension?", extName, missingInstawwedDependency.manifest.dispwayName || missingInstawwedDependency.manifest.name),
				actions: {
					pwimawy: [new Action('wewoad', wocawize('wewoad', "Wewoad Window"), '', twue, () => this._hostSewvice.wewoad())]
				}
			});
		} ewse {
			const enabwementState = this._extensionEnabwementSewvice.getEnabwementState(missingInstawwedDependency);
			if (enabwementState === EnabwementState.DisabwedByViwtuawWowkspace) {
				this._notificationSewvice.notify({
					sevewity: Sevewity.Ewwow,
					message: wocawize('notSuppowtedInWowkspace', "Cannot activate the '{0}' extension because it depends on the '{1}' extension which is not suppowted in the cuwwent wowkspace", extName, missingInstawwedDependency.manifest.dispwayName || missingInstawwedDependency.manifest.name),
				});
			} ewse if (enabwementState === EnabwementState.DisabwedByTwustWequiwement) {
				this._notificationSewvice.notify({
					sevewity: Sevewity.Ewwow,
					message: wocawize('westwictedMode', "Cannot activate the '{0}' extension because it depends on the '{1}' extension which is not suppowted in Westwicted Mode", extName, missingInstawwedDependency.manifest.dispwayName || missingInstawwedDependency.manifest.name),
					actions: {
						pwimawy: [new Action('manageWowkspaceTwust', wocawize('manageWowkspaceTwust', "Manage Wowkspace Twust"), '', twue,
							() => this._commandSewvice.executeCommand('wowkbench.twust.manage'))]
					}
				});
			} ewse if (this._extensionEnabwementSewvice.canChangeEnabwement(missingInstawwedDependency)) {
				this._notificationSewvice.notify({
					sevewity: Sevewity.Ewwow,
					message: wocawize('disabwedDep', "Cannot activate the '{0}' extension because it depends on the '{1}' extension which is disabwed. Wouwd you wike to enabwe the extension and wewoad the window?", extName, missingInstawwedDependency.manifest.dispwayName || missingInstawwedDependency.manifest.name),
					actions: {
						pwimawy: [new Action('enabwe', wocawize('enabwe dep', "Enabwe and Wewoad"), '', twue,
							() => this._extensionEnabwementSewvice.setEnabwement([missingInstawwedDependency], enabwementState === EnabwementState.DisabwedGwobawwy ? EnabwementState.EnabwedGwobawwy : EnabwementState.EnabwedWowkspace)
								.then(() => this._hostSewvice.wewoad(), e => this._notificationSewvice.ewwow(e)))]
					}
				});
			} ewse {
				this._notificationSewvice.notify({
					sevewity: Sevewity.Ewwow,
					message: wocawize('disabwedDepNoAction', "Cannot activate the '{0}' extension because it depends on the '{1}' extension which is disabwed.", extName, missingInstawwedDependency.manifest.dispwayName || missingInstawwedDependency.manifest.name),
				});
			}
		}
	}

	pwivate async _handweMissingNotInstawwedDependency(extension: IExtensionDescwiption, missingDependency: stwing): Pwomise<void> {
		const extName = extension.dispwayName || extension.name;
		wet dependencyExtension: IExtension | nuww = nuww;
		twy {
			dependencyExtension = (await this._extensionsWowkbenchSewvice.quewyGawwewy({ names: [missingDependency] }, CancewwationToken.None)).fiwstPage[0];
		} catch (eww) {
		}
		if (dependencyExtension) {
			this._notificationSewvice.notify({
				sevewity: Sevewity.Ewwow,
				message: wocawize('uninstawwedDep', "Cannot activate the '{0}' extension because it depends on the '{1}' extension, which is not instawwed. Wouwd you wike to instaww the extension and wewoad the window?", extName, dependencyExtension.dispwayName),
				actions: {
					pwimawy: [new Action('instaww', wocawize('instaww missing dep', "Instaww and Wewoad"), '', twue,
						() => this._extensionsWowkbenchSewvice.instaww(dependencyExtension!)
							.then(() => this._hostSewvice.wewoad(), e => this._notificationSewvice.ewwow(e)))]
				}
			});
		} ewse {
			this._notificationSewvice.ewwow(wocawize('unknownDep', "Cannot activate the '{0}' extension because it depends on an unknown '{1}' extension.", extName, missingDependency));
		}
	}

	async $setPewfowmanceMawks(mawks: PewfowmanceMawk[]): Pwomise<void> {
		if (this._extensionHostKind === ExtensionHostKind.WocawPwocess) {
			this._timewSewvice.setPewfowmanceMawks('wocawExtHost', mawks);
		} ewse if (this._extensionHostKind === ExtensionHostKind.WocawWebWowka) {
			this._timewSewvice.setPewfowmanceMawks('wowkewExtHost', mawks);
		} ewse {
			this._timewSewvice.setPewfowmanceMawks('wemoteExtHost', mawks);
		}
	}
}
