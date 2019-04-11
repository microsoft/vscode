/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { IExtensionManagementServerService, IExtensionManagementServer, ILocalExtension, IExtensionGalleryService, InstallOperation } from 'vs/platform/extensionManagement/common/extensionManagement';
import { IConfigurationService } from 'vs/platform/configuration/common/configuration';
import { ExtensionType, isLanguagePackExtension } from 'vs/platform/extensions/common/extensions';
import { INotificationService, Severity, INotificationHandle } from 'vs/platform/notification/common/notification';
import { localize } from 'vs/nls';
import { Action } from 'vs/base/common/actions';
import { IWindowService } from 'vs/platform/windows/common/windows';
import { URI } from 'vs/base/common/uri';
import { ILabelService } from 'vs/platform/label/common/label';
import { IWorkbenchContribution } from 'vs/workbench/common/contributions';
import { IInstantiationService } from 'vs/platform/instantiation/common/instantiation';
import { REMOTE_HOST_SCHEME } from 'vs/platform/remote/common/remoteHosts';
import { isUIExtension } from 'vs/workbench/services/extensions/node/extensionsUtil';
import { IRemoteAgentService } from 'vs/workbench/services/remote/common/remoteAgentService';
import { IWorkbenchEnvironmentService } from 'vs/workbench/services/environment/common/environmentService';

export class RemoteAgentExtensionsInstallerAction extends Action {

	static ID = 'remote.install.extensions';

	constructor(
		id: string, label: string,
		@IExtensionManagementServerService private extensionManagementServerService: IExtensionManagementServerService,
		@INotificationService private notificationService: INotificationService,
		@IWindowService private windowService: IWindowService,
		@IExtensionGalleryService private extensionGalleryService: IExtensionGalleryService,
		@ILabelService private labelService: ILabelService,
		@IConfigurationService private configurationService: IConfigurationService,
		@IWorkbenchEnvironmentService private environmentService: IWorkbenchEnvironmentService
	) {
		super(id, label);
		this.enabled = !!environmentService.configuration.remoteAuthority;
	}

	async run(): Promise<void> {
		if (!this.extensionManagementServerService.remoteExtensionManagementServer) {
			return;
		}

		const localExtensionsToInstall = await this.getLocalExtensionsToInstall();
		let extensionsToInstall: ILocalExtension[] = await this.getExtensionsToInstall(localExtensionsToInstall, this.extensionManagementServerService.remoteExtensionManagementServer);

		if (extensionsToInstall.length > 0) {
			if (extensionsToInstall.length > 0) {
				const remoteAuthority = this.environmentService.configuration.remoteAuthority;
				const handler = this.notificationService.notify({ severity: Severity.Info, message: localize('installing', "Installing extensions into {0}", this.labelService.getHostLabel(REMOTE_HOST_SCHEME, remoteAuthority)) });
				handler.progress.infinite();
				this.doInstallExtensions(this.extensionManagementServerService.remoteExtensionManagementServer, extensionsToInstall, handler).then(() => {
					handler.progress.done();
					handler.updateMessage(localize('Installing.finished', "Finished Installing. Please reload now."));
					handler.updateActions({
						primary: [
							new Action('Installing.reloadNow', localize('Installing.reloadNow', "Reload Now"), undefined, true, () => this.windowService.reloadWindow())
						]
					});
				}, error => {
					handler.progress.done();
					handler.updateSeverity(Severity.Error);
					handler.updateMessage(error);
				});
			}
		}
	}

	private async getExtensionsToInstall(workspaceExtensions: ILocalExtension[], server: IExtensionManagementServer): Promise<ILocalExtension[]> {
		const extensions = await server.extensionManagementService.getInstalled(ExtensionType.User);
		const groupedByVersionId: Map<string, ILocalExtension> = extensions.reduce((groupedById, extension) => groupedById.set(extension.identifier.id, extension), new Map<string, ILocalExtension>());
		return workspaceExtensions.filter(e => !groupedByVersionId.has(e.identifier.id));
	}

	private async getLocalExtensionsToInstall(): Promise<ILocalExtension[]> {
		const installedExtensions = await this.extensionManagementServerService.localExtensionManagementServer.extensionManagementService.getInstalled(ExtensionType.User);
		return installedExtensions.filter(i => !isUIExtension(i.manifest, this.configurationService) || isLanguagePackExtension(i.manifest));
	}

	private async doInstallExtensions(server: IExtensionManagementServer, extensions: ILocalExtension[], notificationHandler: INotificationHandle): Promise<void> {
		let installationFromGalleryPromise: Promise<void> = Promise.resolve();
		for (const extension of extensions) {
			installationFromGalleryPromise = installationFromGalleryPromise
				.then(async () => {
					notificationHandler.updateMessage(localize('installing extension', "Installing extension: {0}", extension.manifest.displayName || extension.manifest.name));
					let installed = false;
					try {
						installed = await this._installFromGallery(server, extension);
					} catch (error) { /* try zip-unzip */ }
					if (!installed) {
						const location = await this.extensionManagementServerService.localExtensionManagementServer.extensionManagementService.zip(extension);
						await server.extensionManagementService.install(location);
					}
				});
		}
		await installationFromGalleryPromise;
	}

	private async _installFromGallery(server: IExtensionManagementServer, extension: ILocalExtension): Promise<boolean> {
		if (this.extensionGalleryService.isEnabled()) {
			const gallery = await this.extensionGalleryService.getCompatibleExtension(extension.identifier, extension.manifest.version);
			if (gallery) {
				const downloadedLocation = await this.extensionGalleryService.download(gallery, InstallOperation.None);
				await server.extensionManagementService.install(URI.file(downloadedLocation));
				return true;
			}
		}
		return false;
	}
}

export class RemoteAgentExtensionsAutoInstaller implements IWorkbenchContribution {

	constructor(
		@IInstantiationService instantiationService: IInstantiationService,
		@IRemoteAgentService remoteAgentService: IRemoteAgentService,
	) {
		remoteAgentService.getEnvironment()
			.then((remoteEnv) => {
				if (remoteEnv && remoteEnv.syncExtensions) {
					instantiationService.createInstance(RemoteAgentExtensionsInstallerAction, RemoteAgentExtensionsInstallerAction.ID, '').run();
				}
			});
	}
}