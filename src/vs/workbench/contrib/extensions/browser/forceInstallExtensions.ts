/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { TokenSourceCancelOnDispose } from '../../../../base/common/cancellation.js';
import { Disposable } from '../../../../base/common/lifecycle.js';
import { autorun } from '../../../../base/common/observable.js';
import { URI } from '../../../../base/common/uri.js';
import { IConfigurationService } from '../../../../platform/configuration/common/configuration.js';
import { IExtensionGalleryService } from '../../../../platform/extensionManagement/common/extensionManagement.js';
import { areSameExtensions } from '../../../../platform/extensionManagement/common/extensionManagementUtil.js';
import { IFileService } from '../../../../platform/files/common/files.js';
import { ILogService } from '../../../../platform/log/common/log.js';
import { observableConfigValue } from '../../../../platform/observable/common/platformObservableUtils.js';
import { IStorageService, StorageScope, StorageTarget } from '../../../../platform/storage/common/storage.js';
import { IUriIdentityService } from '../../../../platform/uriIdentity/common/uriIdentity.js';
import { IWorkspaceContextService } from '../../../../platform/workspace/common/workspace.js';
import { IWorkbenchContribution } from '../../../common/contributions.js';
import { IWorkbenchExtensionManagementService } from '../../../services/extensionManagement/common/extensionManagement.js';
import { IExtension, IExtensionsWorkbenchService } from '../common/extensions.js';

export const ForceInstallConfigurationKey = 'extensions.forceInstall';
export const DisableForceInstallConfigurationKey = 'extensions.disableForceInstall';
const ForceInstallVersionStateStorageKey = 'extensions.forceInstallVersionState';

type ForceInstallVersionState = Record<string, string>;

export class ForceInstallExtensionsContribution extends Disposable implements IWorkbenchContribution {

	static readonly ID = 'workbench.contrib.forceInstallExtensions';

	constructor(
		@IExtensionsWorkbenchService private readonly _extensionsWorkbenchService: IExtensionsWorkbenchService,
		@IConfigurationService private readonly _configurationService: IConfigurationService,
		@IExtensionGalleryService private readonly _galleryService: IExtensionGalleryService,
		@IWorkbenchExtensionManagementService private readonly _extensionManagementService: IWorkbenchExtensionManagementService,
		@IWorkspaceContextService private readonly _workspaceContextService: IWorkspaceContextService,
		@IUriIdentityService private readonly _uriIdentityService: IUriIdentityService,
		@IFileService private readonly _fileService: IFileService,
		@ILogService private readonly _logService: ILogService,
		@IStorageService private readonly _storageService: IStorageService,
	) {
		super();

		const forceInstallIds = observableConfigValue<string[]>(ForceInstallConfigurationKey, [], this._configurationService);
		const disableForceInstallIds = observableConfigValue<string[]>(DisableForceInstallConfigurationKey, [], this._configurationService);

		this._register(autorun(reader => {
			const forceInstall = forceInstallIds.read(reader);
			const disableForceInstall = disableForceInstallIds.read(undefined);
			const cts = reader.store.add(new TokenSourceCancelOnDispose());
			this._forceInstallExtensions(forceInstall, disableForceInstall, cts)
				.catch(error => this._logService.error(error));
		}));
	}

	private async _forceInstallExtensions(forceInstallIds: string[], disableForceInstallIds: string[], cts: TokenSourceCancelOnDispose): Promise<void> {
		const extensionIdsToInstall = forceInstallIds.filter(
			id => !disableForceInstallIds.some(disabledId => areSameExtensions({ id }, { id: disabledId }))
		);

		if (extensionIdsToInstall.length === 0) {
			return;
		}

		await this._extensionsWorkbenchService.whenInitialized;

		if (cts.token.isCancellationRequested) {
			return;
		}

		const installed = this._extensionsWorkbenchService.local;
		const forceInstallState = this._storageService.getObject<ForceInstallVersionState>(ForceInstallVersionStateStorageKey, StorageScope.WORKSPACE, {});
		const remaining = new Set(extensionIdsToInstall);

		const deleteFromRemaining = (id: string): void => {
			for (const existingId of remaining) {
				if (areSameExtensions({ id: existingId }, { id })) {
					remaining.delete(existingId);
					break;
				}
			}
		};

		const workspaceResourceExtensions = await this._getWorkspaceResourceExtensions(extensionIdsToInstall);
		for (const extension of workspaceResourceExtensions) {
			deleteFromRemaining(extension.identifier.id);
			if (this._isAlreadyForceInstalledForVersion(extension.identifier.id, extension.version, forceInstallState)) {
				continue;
			}

			this._logService.info(`Force installing workspace extension '${extension.identifier.id}'`);
			this._extensionsWorkbenchService.install(extension, { isWorkspaceScoped: true }).then(
				(installedExtension) => {
					this._storeForceInstalledVersion(installedExtension.identifier.id, installedExtension.version, forceInstallState);
					this._logService.info(`Successfully force installed workspace extension '${installedExtension.identifier.id}'`);
				},
				error => this._logService.error(`Failed to force install workspace extension '${extension.identifier.id}'`, error),
			);
		}

		if (remaining.size > 0 && this._galleryService.isEnabled()) {
			const installedVersions = new Map<string, string>();
			for (const extension of installed) {
				installedVersions.set(this._normalizeExtensionId(extension.identifier.id), extension.version);
			}

			const galleryExtensions = await this._extensionsWorkbenchService.getExtensions(
				[...remaining].map(id => ({ id })),
				cts.token
			);
			const galleryVersions = new Map<string, string>();
			for (const extension of galleryExtensions) {
				galleryVersions.set(this._normalizeExtensionId(extension.identifier.id), extension.latestVersion || extension.version);
			}

			for (const extensionId of remaining) {
				const normalizedExtensionId = this._normalizeExtensionId(extensionId);
				const expectedVersion = galleryVersions.get(normalizedExtensionId) ?? installedVersions.get(normalizedExtensionId);
				if (expectedVersion && this._isAlreadyForceInstalledForVersion(extensionId, expectedVersion, forceInstallState)) {
					continue;
				}

				this._logService.info(`Force installing extension '${extensionId}'`);
				this._extensionsWorkbenchService.install(extensionId, { isWorkspaceScoped: true }).then(
					(installedExtension) => {
						this._storeForceInstalledVersion(installedExtension.identifier.id, installedExtension.version, forceInstallState);
						this._logService.info(`Successfully force installed extension '${installedExtension.identifier.id}'`);
					},
					error => this._logService.error(`Failed to force install extension '${extensionId}'`, error),
				);
			}
		}
	}

	private _normalizeExtensionId(extensionId: string): string {
		return extensionId.toLowerCase();
	}

	private _isAlreadyForceInstalledForVersion(extensionId: string, version: string, state: ForceInstallVersionState): boolean {
		return state[this._normalizeExtensionId(extensionId)] === version;
	}

	private _storeForceInstalledVersion(extensionId: string, version: string, state: ForceInstallVersionState): void {
		state[this._normalizeExtensionId(extensionId)] = version;
		this._storageService.store(ForceInstallVersionStateStorageKey, state, StorageScope.WORKSPACE, StorageTarget.MACHINE);
	}

	private async _getWorkspaceResourceExtensions(extensionIds: string[]): Promise<IExtension[]> {
		const extensionLocations: URI[] = [];
		for (const folder of this._workspaceContextService.getWorkspace().folders) {
			const extensionsFolder = this._uriIdentityService.extUri.joinPath(folder.uri, '.vscode/extensions');
			try {
				const stat = await this._fileService.resolve(extensionsFolder);
				for (const child of stat.children ?? []) {
					if (child.isDirectory) {
						extensionLocations.push(child.resource);
					}
				}
			} catch {
				// folder doesn't exist
			}
		}

		if (extensionLocations.length === 0) {
			return [];
		}

		const resourceExtensions = await this._extensionManagementService.getExtensions(extensionLocations);
		const matching = resourceExtensions.filter(
			ext => extensionIds.some(id => areSameExtensions(ext.identifier, { id }))
		);

		if (matching.length === 0) {
			return [];
		}

		return this._extensionsWorkbenchService.getResourceExtensions(matching.map(e => e.location), true);
	}
}
