/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { derived, IObservable } from '../../../../base/common/observable.js';
import { URI } from '../../../../base/common/uri.js';
import { IAICustomizationWorkspaceService, AICustomizationManagementSection } from '../../../../workbench/contrib/chat/common/aiCustomizationWorkspaceService.js';
import { ISessionsManagementService } from '../../sessions/browser/sessionsManagementService.js';
import { IInstantiationService } from '../../../../platform/instantiation/common/instantiation.js';
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

	constructor(
		@ISessionsManagementService private readonly sessionsService: ISessionsManagementService,
		@IInstantiationService private readonly instantiationService: IInstantiationService,
	) {
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
		AICustomizationManagementSection.McpServers,
		AICustomizationManagementSection.Models,
	];

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
