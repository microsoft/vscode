/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { SerializedError } from 'vs/base/common/errors';
import Severity from 'vs/base/common/severity';
import { extHostNamedCustomer } from 'vs/workbench/api/common/extHostCustomers';
import { IExtHostContext, MainContext, MainThreadExtensionServiceShape } from 'vs/workbench/api/common/extHost.protocol';
import { IExtensionService, ExtensionActivationError } from 'vs/workbench/services/extensions/common/extensions';
import { ExtensionIdentifier, IExtensionDescription } from 'vs/platform/extensions/common/extensions';
import { INotificationService } from 'vs/platform/notification/common/notification';
import { localize } from 'vs/nls';
import { Action } from 'vs/base/common/actions';
import { IExtensionEnablementService, EnablementState } from 'vs/workbench/services/extensionManagement/common/extensionManagement';
import { areSameExtensions } from 'vs/platform/extensionManagement/common/extensionManagementUtil';
import { IWindowService } from 'vs/platform/windows/common/windows';
import { IExtensionsWorkbenchService } from 'vs/workbench/contrib/extensions/common/extensions';
import { CancellationToken } from 'vs/base/common/cancellation';
import { ILocalExtension } from 'vs/platform/extensionManagement/common/extensionManagement';

@extHostNamedCustomer(MainContext.MainThreadExtensionService)
export class MainThreadExtensionService implements MainThreadExtensionServiceShape {

	private readonly _extensionService: IExtensionService;
	private readonly _notificationService: INotificationService;
	private readonly _extensionsWorkbenchService: IExtensionsWorkbenchService;
	private readonly _windowService: IWindowService;
	private readonly _extensionEnablementService: IExtensionEnablementService;

	constructor(
		extHostContext: IExtHostContext,
		@IExtensionService extensionService: IExtensionService,
		@INotificationService notificationService: INotificationService,
		@IExtensionsWorkbenchService extensionsWorkbenchService: IExtensionsWorkbenchService,
		@IWindowService windowService: IWindowService,
		@IExtensionEnablementService extensionEnablementService: IExtensionEnablementService
	) {
		this._extensionService = extensionService;
		this._notificationService = notificationService;
		this._extensionsWorkbenchService = extensionsWorkbenchService;
		this._windowService = windowService;
		this._extensionEnablementService = extensionEnablementService;
	}

	public dispose(): void {
	}

	$activateExtension(extensionId: ExtensionIdentifier, activationEvent: string): Promise<void> {
		return this._extensionService._activateById(extensionId, activationEvent);
	}
	$onWillActivateExtension(extensionId: ExtensionIdentifier): void {
		this._extensionService._onWillActivateExtension(extensionId);
	}
	$onDidActivateExtension(extensionId: ExtensionIdentifier, startup: boolean, codeLoadingTime: number, activateCallTime: number, activateResolvedTime: number, activationEvent: string): void {
		this._extensionService._onDidActivateExtension(extensionId, startup, codeLoadingTime, activateCallTime, activateResolvedTime, activationEvent);
	}
	$onExtensionRuntimeError(extensionId: ExtensionIdentifier, data: SerializedError): void {
		const error = new Error();
		error.name = data.name;
		error.message = data.message;
		error.stack = data.stack;
		this._extensionService._onExtensionRuntimeError(extensionId, error);
		console.error(`[${extensionId}]${error.message}`);
		console.error(error.stack);
	}
	async $onExtensionActivationError(extensionId: ExtensionIdentifier, activationError: ExtensionActivationError): Promise<void> {
		if (typeof activationError === 'string') {
			this._extensionService._logOrShowMessage(Severity.Error, activationError);
		} else {
			this._handleMissingDependency(extensionId, activationError.dependency);
		}
	}

	private async _handleMissingDependency(extensionId: ExtensionIdentifier, missingDependency: string): Promise<void> {
		const extension = await this._extensionService.getExtension(extensionId.value);
		if (extension) {
			const local = await this._extensionsWorkbenchService.queryLocal();
			const installedDependency = local.filter(i => areSameExtensions(i.identifier, { id: missingDependency }))[0];
			if (installedDependency) {
				await this._handleMissingInstalledDependency(extension, installedDependency.local!);
			} else {
				await this._handleMissingNotInstalledDependency(extension, missingDependency);
			}
		}
	}

	private async _handleMissingInstalledDependency(extension: IExtensionDescription, missingInstalledDependency: ILocalExtension): Promise<void> {
		const extName = extension.displayName || extension.name;
		if (this._extensionEnablementService.isEnabled(missingInstalledDependency)) {
			this._notificationService.notify({
				severity: Severity.Error,
				message: localize('reload window', "Cannot activate the '{0}' extension because it depends on the '{1}' extension, which is not loaded. Would you like to reload the window to load the extension?", extName, missingInstalledDependency.manifest.displayName || missingInstalledDependency.manifest.name),
				actions: {
					primary: [new Action('reload', localize('reload', "Reload Window"), '', true, () => this._windowService.reloadWindow())]
				}
			});
		} else {
			const enablementState = this._extensionEnablementService.getEnablementState(missingInstalledDependency);
			this._notificationService.notify({
				severity: Severity.Error,
				message: localize('disabledDep', "Cannot activate the '{0}' extension because it depends on the '{1}' extension, which is disabled. Would you like to enable the extension and reload the window?", extName, missingInstalledDependency.manifest.displayName || missingInstalledDependency.manifest.name),
				actions: {
					primary: [new Action('enable', localize('enable dep', "Enable and Reload"), '', true,
						() => this._extensionEnablementService.setEnablement([missingInstalledDependency], enablementState === EnablementState.DisabledGlobally ? EnablementState.EnabledGlobally : EnablementState.EnabledWorkspace)
							.then(() => this._windowService.reloadWindow(), e => this._notificationService.error(e)))]
				}
			});
		}
	}

	private async _handleMissingNotInstalledDependency(extension: IExtensionDescription, missingDependency: string): Promise<void> {
		const extName = extension.displayName || extension.name;
		const dependencyExtension = (await this._extensionsWorkbenchService.queryGallery({ names: [missingDependency] }, CancellationToken.None)).firstPage[0];
		if (dependencyExtension) {
			this._notificationService.notify({
				severity: Severity.Error,
				message: localize('uninstalledDep', "Cannot activate the '{0}' extension because it depends on the '{1}' extension, which is not installed. Would you like to install the extension and reload the window?", extName, dependencyExtension.displayName),
				actions: {
					primary: [new Action('install', localize('install missing dep', "Install and Reload"), '', true,
						() => this._extensionsWorkbenchService.install(dependencyExtension)
							.then(() => this._windowService.reloadWindow(), e => this._notificationService.error(e)))]
				}
			});
		} else {
			this._notificationService.error(localize('unknownDep', "Cannot activate the '{0}' extension because it depends on an unknown '{1}' extension .", extName, missingDependency));
		}
	}

	$onExtensionHostExit(code: number): void {
		this._extensionService._onExtensionHostExit(code);
	}
}
