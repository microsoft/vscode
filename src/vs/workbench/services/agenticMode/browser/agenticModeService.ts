/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Event } from '../../../../base/common/event.js';
import { URI } from '../../../../base/common/uri.js';
import { InstantiationType, registerSingleton } from '../../../../platform/instantiation/common/extensions.js';
import { IStorageService, StorageScope, StorageTarget } from '../../../../platform/storage/common/storage.js';
import { AGENTIC_MODE_STORAGE_KEY, AgenticModeWorkspaceService } from '../../configuration/browser/agents/agenticModeWorkspaceService.js';
import { IWorkbenchConfigurationService } from '../../configuration/common/configuration.js';
import { IAgenticModeService } from '../common/agenticMode.js';

/**
 * Switches the window's {@link AgenticModeWorkspaceService} into and out of
 * Agentic Mode. Windows whose workspace and configuration service can't switch
 * (web, remote, the Agents window, and windows with a folder unless the user opted in) don't support the mode.
 */
export class AgenticModeService implements IAgenticModeService {

	declare readonly _serviceBrand: undefined;

	private readonly workspaceService: AgenticModeWorkspaceService | undefined;

	readonly onDidChange: Event<boolean>;

	constructor(
		@IWorkbenchConfigurationService configurationService: IWorkbenchConfigurationService,
		@IStorageService private readonly storageService: IStorageService,
	) {
		this.workspaceService = configurationService instanceof AgenticModeWorkspaceService ? configurationService : undefined;
		this.onDidChange = this.workspaceService?.onDidChangeAgenticMode ?? Event.None;
	}

	get isSupported(): boolean {
		return !!this.workspaceService;
	}

	get windowFolders(): readonly URI[] {
		return this.workspaceService?.windowFolders ?? [];
	}

	get isActive(): boolean {
		return !!this.workspaceService?.isAgenticMode;
	}

	async setActive(active: boolean): Promise<void> {
		if (!this.workspaceService) {
			return;
		}
		await this.workspaceService.setAgenticMode(active);
		if (active) {
			this.storageService.store(AGENTIC_MODE_STORAGE_KEY, true, StorageScope.WORKSPACE, StorageTarget.MACHINE);
		} else {
			this.storageService.remove(AGENTIC_MODE_STORAGE_KEY, StorageScope.WORKSPACE);
		}
	}
}

registerSingleton(IAgenticModeService, AgenticModeService, InstantiationType.Delayed);
