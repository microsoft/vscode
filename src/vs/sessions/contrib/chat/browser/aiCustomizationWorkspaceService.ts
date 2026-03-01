/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { derived, IObservable } from '../../../../base/common/observable.js';
import { joinPath } from '../../../../base/common/resources.js';
import { URI } from '../../../../base/common/uri.js';
import { IAICustomizationWorkspaceService, AICustomizationManagementSection, IStorageSourceFilter } from '../../../../workbench/contrib/chat/common/aiCustomizationWorkspaceService.js';
import { PromptsStorage } from '../../../../workbench/contrib/chat/common/promptSyntax/service/promptsService.js';
import { ISessionsManagementService } from '../../sessions/browser/sessionsManagementService.js';
import { IInstantiationService } from '../../../../platform/instantiation/common/instantiation.js';
import { CustomizationCreatorService } from '../../../../workbench/contrib/chat/browser/aiCustomization/customizationCreatorService.js';
import { PromptsType } from '../../../../workbench/contrib/chat/common/promptSyntax/promptTypes.js';
import { IPathService } from '../../../../workbench/services/path/common/pathService.js';

/**
 * Agent Sessions override of IAICustomizationWorkspaceService.
 * Delegates to ISessionsManagementService to provide the active session's
 * worktree/repository as the project root, and supports worktree commit.
 */
export class SessionsAICustomizationWorkspaceService implements IAICustomizationWorkspaceService {
	declare readonly _serviceBrand: undefined;

	readonly activeProjectRoot: IObservable<URI | undefined>;

	/**
	 * CLI-accessible user directories for customization file filtering and creation.
	 */
	private readonly _cliUserRoots: readonly URI[];

	/**
	 * Pre-built filter for types that should only show CLI-accessible user roots.
	 */
	private readonly _cliUserFilter: IStorageSourceFilter;

	constructor(
		@ISessionsManagementService private readonly sessionsService: ISessionsManagementService,
		@IInstantiationService private readonly instantiationService: IInstantiationService,
		@IPathService pathService: IPathService,
	) {
		const userHome = pathService.userHome({ preferLocal: true });
		this._cliUserRoots = [
			joinPath(userHome, '.copilot'),
			joinPath(userHome, '.claude'),
			joinPath(userHome, '.agents'),
		];
		this._cliUserFilter = {
			sources: [PromptsStorage.local, PromptsStorage.user],
			includedUserFileRoots: this._cliUserRoots,
		};

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

	private static readonly _hooksFilter: IStorageSourceFilter = {
		sources: [PromptsStorage.local],
	};

	private static readonly _allUserRootsFilter: IStorageSourceFilter = {
		sources: [PromptsStorage.local, PromptsStorage.user],
	};

	getStorageSourceFilter(type: PromptsType): IStorageSourceFilter {
		if (type === PromptsType.hook) {
			return SessionsAICustomizationWorkspaceService._hooksFilter;
		}
		if (type === PromptsType.prompt) {
			// Prompts are shown from all user roots (including VS Code profile)
			return SessionsAICustomizationWorkspaceService._allUserRootsFilter;
		}
		// Other types only show user files from CLI-accessible roots (~/.copilot, ~/.claude, ~/.agents)
		return this._cliUserFilter;
	}

	/**
	 * Returns the CLI-accessible user directories (~/.copilot, ~/.claude, ~/.agents).
	 */
	readonly isSessionsWindow = true;

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
