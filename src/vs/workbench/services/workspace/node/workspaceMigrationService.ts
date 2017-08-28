/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

'use strict';

import { TPromise } from 'vs/base/common/winjs.base';
import URI from 'vs/base/common/uri';
import { once } from 'vs/base/common/event';
import { IDisposable } from 'vs/base/common/lifecycle';
import { IWorkspaceContextService } from 'vs/platform/workspace/common/workspace';
import { Registry } from 'vs/platform/registry/common/platform';
import { IConfigurationRegistry, Extensions as ConfigurationExtensions, ConfigurationScope } from 'vs/platform/configuration/common/configurationRegistry';
import { IConfigurationService } from 'vs/platform/configuration/common/configuration';
import { IWorkspaceIdentifier } from 'vs/platform/workspaces/common/workspaces';
import { ILifecycleService } from 'vs/platform/lifecycle/common/lifecycle';
import { StorageService } from 'vs/platform/storage/common/storageService';
import { migrateStorageToMultiRootWorkspace } from 'vs/platform/storage/common/migration';
import { IStorageService } from 'vs/platform/storage/common/storage';
import { IJSONEditingService } from 'vs/workbench/services/configuration/common/jsonEditing';
import { IWorkspaceMigrationService } from 'vs/workbench/services/workspace/common/workspaceEditing';

export class WorkspaceMigrationService implements IWorkspaceMigrationService {

	public _serviceBrand: any;

	private shutdownListener: IDisposable;

	constructor(
		@IStorageService private storageService: IStorageService,
		@IJSONEditingService private jsonEditingService: IJSONEditingService,
		@IWorkspaceContextService private contextService: IWorkspaceContextService,
		@IConfigurationService private configurationService: IConfigurationService,
		@ILifecycleService private lifecycleService: ILifecycleService
	) {
	}

	migrate(toWorkspaceId: IWorkspaceIdentifier): TPromise<void> {
		this.migrateStorage(toWorkspaceId);

		return this.migrateConfiguration(toWorkspaceId);
	}

	migrateStorage(toWorkspaceId: IWorkspaceIdentifier): void {

		// The shutdown sequence could have been stopped due to a veto. Make sure to
		// always dispose the shutdown listener if we are called again in the same session.
		if (this.shutdownListener) {
			this.shutdownListener.dispose();
			this.shutdownListener = void 0;
		}

		// Since many components write to storage only on shutdown, we register a shutdown listener
		// very late to be called as the last one.
		this.shutdownListener = once(this.lifecycleService.onShutdown)(() => {

			// TODO@Ben revisit this when we move away from local storage to a file based approach
			const storageImpl = this.storageService as StorageService;
			migrateStorageToMultiRootWorkspace(storageImpl.storageId, toWorkspaceId, storageImpl.workspaceStorage);
		});
	}

	private migrateConfiguration(toWorkspaceId: IWorkspaceIdentifier): TPromise<void> {
		if (!this.contextService.hasFolderWorkspace()) {
			return TPromise.as(void 0); // return early if not a folder workspace is opened
		}

		const configurationProperties = Registry.as<IConfigurationRegistry>(ConfigurationExtensions.Configuration).getConfigurationProperties();
		const targetWorkspaceConfiguration = {};
		for (const key of this.configurationService.keys().workspace) {
			if (configurationProperties[key] && configurationProperties[key].scope === ConfigurationScope.WINDOW) {
				targetWorkspaceConfiguration[key] = this.configurationService.lookup(key).workspace;
			}
		}

		return this.jsonEditingService.write(URI.file(toWorkspaceId.configPath), { key: 'settings', value: targetWorkspaceConfiguration }, true);
	}
}
