/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Disposable } from '../../../../base/common/lifecycle.js';
import { URI } from '../../../../base/common/uri.js';
import { areSameExtensions } from '../../../../platform/extensionManagement/common/extensionManagementUtil.js';
import { IFileService } from '../../../../platform/files/common/files.js';
import { ILogService } from '../../../../platform/log/common/log.js';
import { IStorageService, StorageScope, StorageTarget } from '../../../../platform/storage/common/storage.js';
import { IUriIdentityService } from '../../../../platform/uriIdentity/common/uriIdentity.js';
import { IWorkspaceContextService } from '../../../../platform/workspace/common/workspace.js';
import { IWorkspaceTrustManagementService } from '../../../../platform/workspace/common/workspaceTrust.js';
import { IWorkbenchContribution } from '../../../common/contributions.js';
import { IWorkbenchExtensionManagementService } from '../../../services/extensionManagement/common/extensionManagement.js';
import { IWorkspaceExtensionsConfigService } from '../../../services/extensionRecommendations/common/workspaceExtensionsConfig.js';
import { IExtension, IExtensionsWorkbenchService } from '../common/extensions.js';

const ForceInstallVersionStateStorageKey = 'extensions.forceInstallVersionState';

type ForceInstallVersionState = Record<string, string>;

export class ForceInstallExtensionsContribution extends Disposable implements IWorkbenchContribution {

	static readonly ID = 'workbench.contrib.forceInstallExtensions';

	constructor(
		@IExtensionsWorkbenchService private readonly _extensionsWorkbenchService: IExtensionsWorkbenchService,
		@IWorkspaceExtensionsConfigService private readonly _workspaceExtensionsConfigService: IWorkspaceExtensionsConfigService,
		@IWorkbenchExtensionManagementService private readonly _extensionManagementService: IWorkbenchExtensionManagementService,
		@IWorkspaceContextService private readonly _workspaceContextService: IWorkspaceContextService,
		@IWorkspaceTrustManagementService private readonly _workspaceTrustManagementService: IWorkspaceTrustManagementService,
		@IUriIdentityService private readonly _uriIdentityService: IUriIdentityService,
		@IFileService private readonly _fileService: IFileService,
		@ILogService private readonly _logService: ILogService,
		@IStorageService private readonly _storageService: IStorageService,
	) {
		super();

		this._register(this._workspaceExtensionsConfigService.onDidChangeExtensionsConfigs(() => {
			this._forceInstallExtensions()
				.catch(error => this._logService.error(error));
		}));

		this._register(this._workspaceTrustManagementService.onDidChangeTrust(() => {
			this._forceInstallExtensions()
				.catch(error => this._logService.error(error));
		}));

		this._forceInstallExtensions()
			.catch(error => this._logService.error(error));
	}

	private async _forceInstallExtensions(): Promise<void> {
		if (!this._workspaceTrustManagementService.isWorkspaceTrusted()) {
			return;
		}

		const extensionIdsToInstall = await this._workspaceExtensionsConfigService.getForceInstall();
		if (extensionIdsToInstall.length === 0) {
			return;
		}

		await this._extensionsWorkbenchService.whenInitialized;

		const forceInstallState = this._storageService.getObject<ForceInstallVersionState>(ForceInstallVersionStateStorageKey, StorageScope.WORKSPACE, {});

		const workspaceResourceExtensions = await this._getWorkspaceResourceExtensions(extensionIdsToInstall);
		for (const extension of workspaceResourceExtensions) {
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
