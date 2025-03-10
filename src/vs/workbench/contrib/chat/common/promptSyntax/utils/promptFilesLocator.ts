/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { URI } from '../../../../../../base/common/uri.js';
import { ResourceSet } from '../../../../../../base/common/map.js';
import { dirname, extUri } from '../../../../../../base/common/resources.js';
import { IFileService } from '../../../../../../platform/files/common/files.js';
import { PromptsConfig } from '../../../../../../platform/prompts/common/config.js';
import { isPromptFile } from '../../../../../../platform/prompts/common/constants.js';
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
	public async listFiles(
		exclude: readonly URI[],
	): Promise<readonly URI[]> {
		return await this.listFilesIn(
			this.getConfigBasedSourceFolders(),
			exclude,
		);
	}

	/**
	 * Lists all prompt files in the provided folders.
	 *
	 * @param folders List of `URIs` to search for prompt files in.
	 * @param exclude List of `URIs` to exclude from the result.
	 * @returns List of prompt files found in the provided folders.
	 */
	public async listFilesIn(
		folders: readonly URI[],
		exclude: readonly URI[],
	): Promise<readonly URI[]> {
		// create a set from the list of URIs for convenience
		const excludeSet: Set<string> = new Set();
		for (const excludeUri of exclude) {
			excludeSet.add(excludeUri.path);
		}

		// filter out the excluded paths from the folders list
		const cleanFolders = folders
			.filter((folder) => {
				return !excludeSet.has(folder.path);
			});

		return await this.findInstructionFiles(cleanFolders, excludeSet);
	}

	/**
	 * Get all possible prompt file source folders based on the current
	 * workspace folder structure.
	 *
	 * @returns List of possible prompt file folders.
	 */
	public getConfigBasedSourceFolders(): readonly URI[] {
		const paths = new ResourceSet();
		const sourceFolders = PromptsConfig.promptSourceFolders(this.configService);

		// otherwise for each folder provided in the configuration, create
		// a URI per each folder in the current workspace
		for (const sourceFolderName of sourceFolders) {
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

				// if inside a multi-root workspace, consider the specified prompts source folder
				// inside the workspace root, to allow users to use some (e.g., `.github/prompts`)
				// folder as a top-level folder in the workspace
				const workspaceRootUri = dirname(folder.uri);
				const workspaceFolderUri = extUri.resolvePath(workspaceRootUri, sourceFolderName);
				// if we already have this folder in the list, skip it
				if (paths.has(workspaceFolderUri)) {
					continue;
				}

				// otherwise, if the prompt source folder is inside a top-level workspace folder,
				// add it to the list of paths too; this helps to handle the case when a relative
				// path must be resolved from `root` of the workspace
				if (workspaceFolderUri.fsPath.startsWith(folder.uri.fsPath)) {
					paths.add(workspaceFolderUri);
				}
			}
		}

		return [...paths];
	}

	/**
	 * Finds all existent prompt files in the provided source folders.
	 *
	 * @param folders List of prompt file source folders to search for prompt files in.
	 * @param exclude Map of `path -> boolean` to exclude from the result.
	 * @returns List of prompt files found in the provided source folders.
	 */
	private async findInstructionFiles(
		folders: readonly URI[],
		exclude: ReadonlySet<string>,
	): Promise<readonly URI[]> {
		const results = await this.fileService.resolveAll(
			folders.map((resource) => {
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
				const { resource, isDirectory } = child;

				if (isDirectory) {
					continue;
				}

				if (!isPromptFile(resource)) {
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
