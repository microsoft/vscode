/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { PromptsService } from '../../../../workbench/contrib/chat/common/promptSyntax/service/promptsServiceImpl.js';
import { PromptFilesLocator } from '../../../../workbench/contrib/chat/common/promptSyntax/utils/promptFilesLocator.js';
import { Event } from '../../../../base/common/event.js';
import { basename, isEqualOrParent, joinPath } from '../../../../base/common/resources.js';
import { URI } from '../../../../base/common/uri.js';
import { IConfigurationService } from '../../../../platform/configuration/common/configuration.js';
import { IFileService } from '../../../../platform/files/common/files.js';
import { ILogService } from '../../../../platform/log/common/log.js';
import { IWorkspaceContextService, IWorkspaceFolder } from '../../../../platform/workspace/common/workspace.js';
import { HOOKS_SOURCE_FOLDER } from '../../../../workbench/contrib/chat/common/promptSyntax/config/promptFileLocations.js';
import { PromptsType } from '../../../../workbench/contrib/chat/common/promptSyntax/promptTypes.js';
import { IPromptPath, PromptsStorage } from '../../../../workbench/contrib/chat/common/promptSyntax/service/promptsService.js';
import { IWorkbenchEnvironmentService } from '../../../../workbench/services/environment/common/environmentService.js';
import { IPathService } from '../../../../workbench/services/path/common/pathService.js';
import { ISearchService } from '../../../../workbench/services/search/common/search.js';
import { IUserDataProfileService } from '../../../../workbench/services/userDataProfile/common/userDataProfile.js';
import { ISessionsManagementService } from '../../sessions/browser/sessionsManagementService.js';

export class AgenticPromptsService extends PromptsService {
	private _copilotRoot: URI | undefined;

	protected override createPromptFilesLocator(): PromptFilesLocator {
		return this.instantiationService.createInstance(AgenticPromptFilesLocator);
	}

	private getCopilotRoot(): URI {
		if (!this._copilotRoot) {
			const pathService = this.instantiationService.invokeFunction(accessor => accessor.get(IPathService));
			this._copilotRoot = joinPath(pathService.userHome({ preferLocal: true }), '.copilot');
		}
		return this._copilotRoot;
	}

	/**
	 * Override to use ~/.copilot as the user-level source folder for creation,
	 * instead of the VS Code profile's promptsHome.
	 */
	public override async getSourceFolders(type: PromptsType): Promise<readonly IPromptPath[]> {
		const folders = await super.getSourceFolders(type);
		const copilotRoot = this.getCopilotRoot();
		// Replace any user-storage folders with the CLI-accessible ~/.copilot root
		return folders.map(folder => {
			if (folder.storage === PromptsStorage.user) {
				const subfolder = getCliUserSubfolder(type);
				return subfolder
					? { ...folder, uri: joinPath(copilotRoot, subfolder) }
					: folder;
			}
			return folder;
		});
	}
}

class AgenticPromptFilesLocator extends PromptFilesLocator {

	constructor(
		@IFileService fileService: IFileService,
		@IConfigurationService configService: IConfigurationService,
		@IWorkspaceContextService workspaceService: IWorkspaceContextService,
		@IWorkbenchEnvironmentService environmentService: IWorkbenchEnvironmentService,
		@ISearchService searchService: ISearchService,
		@IUserDataProfileService userDataService: IUserDataProfileService,
		@ILogService logService: ILogService,
		@IPathService pathService: IPathService,
		@ISessionsManagementService private readonly activeSessionService: ISessionsManagementService,
	) {
		super(
			fileService,
			configService,
			workspaceService,
			environmentService,
			searchService,
			userDataService,
			logService,
			pathService
		);
	}

	protected override getWorkspaceFolders(): readonly IWorkspaceFolder[] {
		const folder = this.getActiveWorkspaceFolder();
		return folder ? [folder] : [];
	}

	protected override getWorkspaceFolder(resource: URI): IWorkspaceFolder | undefined {
		const folder = this.getActiveWorkspaceFolder();
		if (!folder) {
			return undefined;
		}
		return isEqualOrParent(resource, folder.uri) ? folder : undefined;
	}

	protected override onDidChangeWorkspaceFolders(): Event<void> {
		return Event.fromObservableLight(this.activeSessionService.activeSession);
	}

	public override async getHookSourceFolders(): Promise<readonly URI[]> {
		const configured = await super.getHookSourceFolders();
		if (configured.length > 0) {
			return configured;
		}
		const folder = this.getActiveWorkspaceFolder();
		return folder ? [joinPath(folder.uri, HOOKS_SOURCE_FOLDER)] : [];
	}

	private getActiveWorkspaceFolder(): IWorkspaceFolder | undefined {
		const session = this.activeSessionService.getActiveSession();
		const root = session?.worktree ?? session?.repository;
		if (!root) {
			return undefined;
		}
		return {
			uri: root,
			name: basename(root),
			index: 0,
			toResource: relativePath => joinPath(root, relativePath),
		};
	}
}

/**
 * Returns the subfolder name under ~/.copilot/ for a given customization type.
 * Used to determine the CLI-accessible user creation target.
 */
function getCliUserSubfolder(type: PromptsType): string | undefined {
	switch (type) {
		case PromptsType.instructions: return 'instructions';
		case PromptsType.skill: return 'skills';
		case PromptsType.agent: return 'agents';
		case PromptsType.prompt: return 'prompts';
		default: return undefined;
	}
}

