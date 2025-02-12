/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { PromptFilesConfig } from '../config.js';
import { PROMPT_FILE_EXTENSION } from '../constants.js';
import { URI } from '../../../../../../base/common/uri.js';
import { ResourceSet } from '../../../../../../base/common/map.js';
import { dirname, extUri } from '../../../../../../base/common/resources.js';
import { IFileService } from '../../../../../../platform/files/common/files.js';
import { IWorkspaceContextService } from '../../../../../../platform/workspace/common/workspace.js';
import { IConfigurationService } from '../../../../../../platform/configuration/common/configuration.js';

/**
 * Class to locate prompt files.
 */
export class PromptFilesLocator {
	constructor(
		@IFileService private readonly fileService: IFileService,
		@IWorkspaceContextService private readonly workspaceService: IWorkspaceContextService,
		@IConfigurationService private readonly configService: IConfigurationService,
	) { }

	/**
	 * List all prompt files from the filesystem.
	 *
	 * @param exclude List of `URIs` to exclude from the result.
	 * @returns List of prompt files found in the workspace.
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
	 * Get all possible prompt file locations based on the current
	 * workspace folder structure.
	 *
	 * @returns List of possible prompt file locations.
	 */
	private getSourceLocations(): readonly URI[] {
		const paths = new ResourceSet();
		const sourceLocations = PromptFilesConfig.sourceLocations(this.configService);

		// otherwise for each folder provided in the configuration, create
		// a URI per each folder in the current workspace
		for (const sourceFolderName of sourceLocations) {
			// if source folder is an absolute path, add the path as is
			// without trying to resolve it against the workspace folders
			const sourceFolderUri = URI.file(sourceFolderName);
			if (sourceFolderUri.path === sourceFolderName) {
				if (paths.has(sourceFolderUri)) {
					continue;
				}

				paths.add(sourceFolderUri);
				continue;
			}

			const { folders } = this.workspaceService.getWorkspace();
			for (const folder of folders) {
				// create the source path as a path relative to the workspace
				// folder, or as an absolute path if the absolute value is provided
				const relativeFolderUri = extUri.resolvePath(folder.uri, sourceFolderName);
				if (!paths.has(relativeFolderUri)) {
					paths.add(relativeFolderUri);
				}

				// if not inside a workspace, we are done
				if (folders.length <= 1) {
					continue;
				}

				// if inside a multi-root workspace, consider the specified source location
				// inside the workspace root, to allow users to use some (e.g., `.github/prompts`)
				// folder as a top-level folder in the workspace
				const workspaceRootUri = dirname(folder.uri);
				const workspaceFolderUri = extUri.resolvePath(workspaceRootUri, sourceFolderName);
				// if we already have this folder in the list, skip it
				if (paths.has(workspaceFolderUri)) {
					continue;
				}

				// otherwise, if the source location is inside a top-level workspace folder,
				// add it to the list of paths too; this helps to handle the case when a
				// relative path must be resolved from `root` of the workspace
				if (workspaceFolderUri.fsPath.startsWith(folder.uri.fsPath)) {
					paths.add(workspaceFolderUri);
				}
			}
		}

		return [...paths];
	}

	/**
	 * Finds all existent prompt files in the provided locations.
	 *
	 * @param locations List of locations to search for prompt files in.
	 * @param exclude Map of `path -> boolean` to exclude from the result.
	 * @returns List of prompt files found in the provided locations.
	 */
	private async findInstructionFiles(
		locations: readonly URI[],
		exclude: ReadonlySet<string>,
	): Promise<readonly URI[]> {
		const results = await this.fileService.resolveAll(
			locations.map((resource) => {
				return { resource };
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

				if (!name.endsWith(PROMPT_FILE_EXTENSION)) {
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
