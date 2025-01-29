/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { URI } from '../../../../../base/common/uri.js';
import { dirname, extUri } from '../../../../../base/common/resources.js';
import { IFileService } from '../../../../../platform/files/common/files.js';
import { PromptFilesConfig } from '../../common/promptSyntax/config.js';
import { IConfigurationService } from '../../../../../platform/configuration/common/configuration.js';
import { IWorkspaceContextService, WorkbenchState } from '../../../../../platform/workspace/common/workspace.js';
import { PROMPT_SNIPPET_FILE_EXTENSION } from '../../common/promptSyntax/contentProviders/promptContentsProviderBase.js';

/**
 * Class to locate prompt instructions files.
 */
export class ChatInstructionsFileLocator {
	constructor(
		@IFileService private readonly fileService: IFileService,
		@IWorkspaceContextService private readonly workspaceService: IWorkspaceContextService,
		@IConfigurationService private readonly configService: IConfigurationService,
	) { }

	/**
	 * List all prompt instructions files from the filesystem.
	 *
	 * @param exclude List of `URIs` to exclude from the result.
	 * @returns List of prompt instructions files found in the workspace.
	 */
	public async listFiles(exclude: ReadonlyArray<URI>): Promise<readonly URI[]> {
		// create a set from the list of URIs for convenience
		const excludeSet: Set<string> = new Set();
		for (const excludeUri of exclude) {
			excludeSet.add(excludeUri.path);
		}

		// filter out the excluded paths from the locations list
		const locations = this.getSourceLocations()
			.filter((location) => {
				return !excludeSet.has(location.path);
			});

		return await this.findInstructionFiles(locations, excludeSet);
	}

	/**
	 * Get all possible prompt instructions file locations based on the current
	 * workspace folder structure.
	 *
	 * @returns List of possible prompt instructions file locations.
	 */
	private getSourceLocations(): readonly URI[] {
		const state = this.workspaceService.getWorkbenchState();

		// nothing to do if the workspace is empty
		if (state === WorkbenchState.EMPTY) {
			return [];
		}

		const sourceLocations = PromptFilesConfig.sourceLocations(this.configService);
		const result = [];

		// otherwise for each folder provided in the configuration, create
		// a URI per each folder in the current workspace
		const { folders } = this.workspaceService.getWorkspace();
		for (const folder of folders) {
			for (const sourceFolderName of sourceLocations) {
				const folderUri = extUri.resolvePath(folder.uri, sourceFolderName);
				result.push(folderUri);
			}
		}

		// if inside a workspace, add the specified source locations inside the workspace
		// root too, to allow users to use `.copilot/prompts` folder (or whatever they
		// specify in the setting) in the workspace root
		if (folders.length > 1) {
			const workspaceRootUri = dirname(folders[0].uri);
			for (const sourceFolderName of sourceLocations) {
				const folderUri = extUri.resolvePath(workspaceRootUri, sourceFolderName);
				result.push(folderUri);
			}
		}

		return result;
	}

	/**
	 * Finds all existent prompt instruction files in the provided locations.
	 *
	 * @param locations List of locations to search for prompt instruction files in.
	 * @param exclude Map of `path -> boolean` to exclude from the result.
	 * @returns List of prompt instruction files found in the provided locations.
	 */
	private async findInstructionFiles(
		locations: readonly URI[],
		exclude: ReadonlySet<string>,
	): Promise<readonly URI[]> {
		const results = await this.fileService.resolveAll(
			locations.map((location) => {
				return { resource: location };
			}),
		);

		const files = [];
		for (const result of results) {
			const { stat, success } = result;

			if (!success) {
				continue;
			}

			if (!stat || !stat.children) {
				continue;
			}

			for (const child of stat.children) {
				const { name, resource, isDirectory } = child;

				if (isDirectory) {
					continue;
				}

				if (!name.endsWith(PROMPT_SNIPPET_FILE_EXTENSION)) {
					continue;
				}

				if (exclude.has(resource.path)) {
					continue;
				}

				files.push(resource);
			}
		}

		return files;

	}
}
