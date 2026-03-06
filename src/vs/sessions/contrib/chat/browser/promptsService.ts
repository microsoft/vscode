/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { PromptsService } from '../../../../workbench/contrib/chat/common/promptSyntax/service/promptsServiceImpl.js';
import { PromptFilesLocator } from '../../../../workbench/contrib/chat/common/promptSyntax/utils/promptFilesLocator.js';
import { Event } from '../../../../base/common/event.js';
import { basename, isEqualOrParent, joinPath } from '../../../../base/common/resources.js';
import { URI } from '../../../../base/common/uri.js';
import { CancellationToken } from '../../../../base/common/cancellation.js';
import { FileAccess } from '../../../../base/common/network.js';
import { IConfigurationService } from '../../../../platform/configuration/common/configuration.js';
import { IFileService } from '../../../../platform/files/common/files.js';
import { ILogService } from '../../../../platform/log/common/log.js';
import { IWorkspaceContextService, IWorkspaceFolder } from '../../../../platform/workspace/common/workspace.js';
import { HOOKS_SOURCE_FOLDER, getCleanPromptName } from '../../../../workbench/contrib/chat/common/promptSyntax/config/promptFileLocations.js';
import { PromptsType } from '../../../../workbench/contrib/chat/common/promptSyntax/promptTypes.js';
import { IPromptPath, PromptsStorage } from '../../../../workbench/contrib/chat/common/promptSyntax/service/promptsService.js';
import { BUILTIN_STORAGE, IBuiltinPromptPath } from '../../chat/common/builtinPromptsStorage.js';
import { IWorkbenchEnvironmentService } from '../../../../workbench/services/environment/common/environmentService.js';
import { IPathService } from '../../../../workbench/services/path/common/pathService.js';
import { ISearchService } from '../../../../workbench/services/search/common/search.js';
import { IUserDataProfileService } from '../../../../workbench/services/userDataProfile/common/userDataProfile.js';
import { IAICustomizationWorkspaceService } from '../../../../workbench/contrib/chat/common/aiCustomizationWorkspaceService.js';

/** URI root for built-in prompts bundled with the Sessions app. */
export const BUILTIN_PROMPTS_URI = FileAccess.asFileUri('vs/sessions/prompts');

export class AgenticPromptsService extends PromptsService {
	private _copilotRoot: URI | undefined;
	private _builtinPromptsCache: Map<PromptsType, Promise<readonly IBuiltinPromptPath[]>> | undefined;

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
	 * Returns built-in prompt files bundled with the Sessions app.
	 */
	private async getBuiltinPromptFiles(type: PromptsType): Promise<readonly IBuiltinPromptPath[]> {
		if (type !== PromptsType.prompt) {
			return [];
		}

		if (!this._builtinPromptsCache) {
			this._builtinPromptsCache = new Map();
		}

		let cached = this._builtinPromptsCache.get(type);
		if (!cached) {
			cached = this.discoverBuiltinPrompts(type);
			this._builtinPromptsCache.set(type, cached);
		}
		return cached;
	}

	private async discoverBuiltinPrompts(type: PromptsType): Promise<readonly IBuiltinPromptPath[]> {
		const fileService = this.instantiationService.invokeFunction(accessor => accessor.get(IFileService));
		const promptsDir = FileAccess.asFileUri('vs/sessions/prompts');
		try {
			const stat = await fileService.resolve(promptsDir);
			if (!stat.children) {
				return [];
			}
			return stat.children
				.filter(child => !child.isDirectory && child.name.endsWith('.prompt.md'))
				.map(child => ({ uri: child.resource, storage: BUILTIN_STORAGE, type }));
		} catch {
			return [];
		}
	}

	/**
	 * Override to include built-in prompts and filter out those overridden
	 * by user or workspace prompts with the same name.
	 */
	public override async listPromptFiles(type: PromptsType, token: CancellationToken): Promise<readonly IPromptPath[]> {
		const baseResults = await super.listPromptFiles(type, token);
		const builtinPrompts = await this.getBuiltinPromptFiles(type);
		if (builtinPrompts.length === 0) {
			return baseResults;
		}

		// Collect names of user/workspace prompts to detect overrides
		const overriddenNames = new Set<string>();
		for (const p of baseResults) {
			if (p.storage === PromptsStorage.local || p.storage === PromptsStorage.user) {
				overriddenNames.add(getCleanPromptName(p.uri));
			}
		}

		const nonOverridden = builtinPrompts.filter(
			p => !overriddenNames.has(getCleanPromptName(p.uri))
		);
		// Built-in items use BUILTIN_STORAGE ('builtin') which is not in the
		// core IPromptPath union but is handled by the sessions UI layer.
		return [...baseResults, ...nonOverridden] as readonly IPromptPath[];
	}

	public override async listPromptFilesForStorage(type: PromptsType, storage: PromptsStorage, token: CancellationToken): Promise<readonly IPromptPath[]> {
		if (storage === BUILTIN_STORAGE) {
			return this.getBuiltinPromptFiles(type) as Promise<readonly IPromptPath[]>;
		}
		return super.listPromptFilesForStorage(type, storage, token);
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
		@IAICustomizationWorkspaceService private readonly customizationWorkspaceService: IAICustomizationWorkspaceService,
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
		return Event.fromObservableLight(this.customizationWorkspaceService.activeProjectRoot);
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
		const root = this.customizationWorkspaceService.getActiveProjectRoot();
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
 *
 * Prompts are a VS Code concept and use the standard profile promptsHome,
 * so they are intentionally excluded here.
 */
function getCliUserSubfolder(type: PromptsType): string | undefined {
	switch (type) {
		case PromptsType.instructions: return 'instructions';
		case PromptsType.skill: return 'skills';
		case PromptsType.agent: return 'agents';
		default: return undefined;
	}
}

