/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { derived, IObservable } from '../../../../base/common/observable.js';
import { URI } from '../../../../base/common/uri.js';
import { IAICustomizationWorkspaceService, AICustomizationManagementSection } from '../../../../workbench/contrib/chat/common/aiCustomizationWorkspaceService.js';
import { PromptsStorage } from '../../../../workbench/contrib/chat/common/promptSyntax/service/promptsService.js';
import { ISessionsManagementService } from '../../sessions/browser/sessionsManagementService.js';
import { IInstantiationService } from '../../../../platform/instantiation/common/instantiation.js';
import { IUserDataProfilesService } from '../../../../platform/userDataProfile/common/userDataProfile.js';
import { CustomizationCreatorService } from '../../../../workbench/contrib/chat/browser/aiCustomization/customizationCreatorService.js';
import { PromptsType } from '../../../../workbench/contrib/chat/common/promptSyntax/promptTypes.js';

/**
 * Agent Sessions override of IAICustomizationWorkspaceService.
 * Delegates to ISessionsManagementService to provide the active session's
 * worktree/repository as the project root, and supports worktree commit.
 */
export class SessionsAICustomizationWorkspaceService implements IAICustomizationWorkspaceService {
	declare readonly _serviceBrand: undefined;

	readonly activeProjectRoot: IObservable<URI | undefined>;

	readonly excludedUserFileRoots: readonly URI[];

	constructor(
		@ISessionsManagementService private readonly sessionsService: ISessionsManagementService,
		@IInstantiationService private readonly instantiationService: IInstantiationService,
		@IUserDataProfilesService userDataProfilesService: IUserDataProfilesService,
	) {
		this.excludedUserFileRoots = [userDataProfilesService.defaultProfile.promptsHome];
		this.activeProjectRoot = derived(reader => {
			const session = this.sessionsService.activeSession.read(reader);
			return session?.worktree ?? session?.repository;
		});
	}

	getActiveProjectRoot(): URI | undefined {
		const session = this.sessionsService.getActiveSession();
		return session?.worktree ?? session?.repository;
	}

	readonly managementSections: readonly AICustomizationManagementSection[] = [
		AICustomizationManagementSection.Agents,
		AICustomizationManagementSection.Skills,
		AICustomizationManagementSection.Instructions,
		AICustomizationManagementSection.Prompts,
		AICustomizationManagementSection.Hooks,
		// TODO: Re-enable MCP Servers once CLI MCP configuration is unified with VS Code
		// AICustomizationManagementSection.McpServers,
	];

	readonly visibleStorageSources: readonly PromptsStorage[] = [
		PromptsStorage.local,
		PromptsStorage.user,
	];

	getVisibleStorageSources(type: PromptsType): readonly PromptsStorage[] {
		if (type === PromptsType.hook) {
			return [PromptsStorage.local];
		}
		return this.visibleStorageSources;
	}

	readonly preferManualCreation = true;

	async commitFiles(projectRoot: URI, fileUris: URI[]): Promise<void> {
		const session = this.sessionsService.getActiveSession();
		if (session) {
			await this.sessionsService.commitWorktreeFiles(session, fileUris);
		}
	}

	async generateCustomization(type: PromptsType): Promise<void> {
		const creator = this.instantiationService.createInstance(CustomizationCreatorService);
		await creator.createWithAI(type);
	}
}
