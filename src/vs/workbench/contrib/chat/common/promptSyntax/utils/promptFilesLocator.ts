/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { URI } from '../../../../../../base/common/uri.js';
import { match } from '../../../../../../base/common/glob.js';
import { assert } from '../../../../../../base/common/assert.js';
import { isAbsolute } from '../../../../../../base/common/path.js';
import { ResourceSet } from '../../../../../../base/common/map.js';
import { dirname, extUri } from '../../../../../../base/common/resources.js';
import { IFileService } from '../../../../../../platform/files/common/files.js';
import { PromptsConfig } from '../../../../../../platform/prompts/common/config.js';
import { IWorkspaceContextService } from '../../../../../../platform/workspace/common/workspace.js';
import { IConfigurationService } from '../../../../../../platform/configuration/common/configuration.js';
import { isPromptFile, PROMPT_FILE_EXTENSION } from '../../../../../../platform/prompts/common/constants.js';

/**
 * Utility class to locate prompt files.
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
	public async listFiles(): Promise<readonly URI[]> {
		return await this.listFilesIn(
			this.getConfigBasedSourceFolders(),
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
	): Promise<readonly URI[]> {
		return await this.findInstructionFiles(folders);
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

				files.push(resource);
			}
		}

		return files;
	}

	/**
	* TODO: @lego
	*
	* @throws if any of the provided locations is not an `absolute path`.
	*/
	public async findAllMatchingPromptFiles(
		// configuredLocations: readonly string[],
		// fileService: IFileService,
		// workspaceService: IWorkspaceContextService,
	): Promise<readonly URI[]> {
		const configuredLocations = PromptsConfig.promptSourceFolders(this.configService);
		// convert locations from settings to absolute paths based on the current workspace folders
		const absoluteLocations = toAbsoluteLocations(configuredLocations, this.workspaceService);

		// find all prompt files in the provided locations, then match
		// the found file paths against (possible) glob patterns
		const paths = new ResourceSet();
		for (const absoluteLocation of absoluteLocations) {
			// assert(
			// 	isAbsolute(location),
			// 	`Provided location must be an absolute path, got '${location}'.`,
			// );

			// normalize the glob pattern to always end with "any prompt file" pattern
			const location = (absoluteLocation.path.endsWith(PROMPT_FILE_EXTENSION))
				? absoluteLocation
				: extUri.joinPath(absoluteLocation, `*${PROMPT_FILE_EXTENSION}`);

			// find all prompt files in entire file tree, starting from
			// a first parent folder that does not contain a glob pattern
			const promptFiles = await findAllPromptFiles(
				firstNonGlobParent(location),
				this.fileService,
			);

			// filter out found prompt files to only include those that match
			// the original glob pattern specified in the settings (if any)
			for (const file of promptFiles) {
				if (match(location.path, file.path)) {
					paths.add(file);
				}
			}
		}

		return [...paths];
	}
}

/**
 * Checks if the provided `pattern` could be a valid glob pattern.
 */
export const isValidGlob = (pattern: string): boolean => {
	let squareBrackets = false;
	let squareBracketsCount = 0;

	let curlyBrackets = false;
	let curlyBracketsCount = 0;

	for (const char of pattern) {
		if (char === '*') {
			return true;
		}

		if (char === '?') {
			return true;
		}

		// TODO: @lego - check that these are not escaped?
		if (char === '[') {
			squareBrackets = true;

			squareBracketsCount++;
		}

		if (char === ']') {
			squareBrackets = true;

			// if there are no matching opening square brackets, this is an `invalid glob`
			if (squareBracketsCount % 2 === 0) {
				return false;
			}

			squareBracketsCount--;
		}

		if (char === '{') {
			curlyBrackets = true;

			curlyBracketsCount++;
		}

		if (char === '}') {
			curlyBrackets = true;

			// if there are no matching opening curly brackets, this is an `invalid glob`
			if (curlyBracketsCount % 2 === 0) {
				return false;
			}

			curlyBracketsCount--;
		}
	}

	// if square brackets exist and are in pairs, this is a `valid glob`
	if (squareBrackets && squareBracketsCount === 0) {
		return true;
	}

	// if curly brackets exist and are in pairs, this is a `valid glob`
	if (curlyBrackets && curlyBracketsCount === 0) {
		return true;
	}

	return false;
};

/**
 * TODO: @lego - notes
 * - if path `starts with a glob`, it must be relative to current workspace folders, otherwise we would need to scan through entire filesystem of the machine
 * - likewise if a `relative path`, it must be relative to current workspace folders
 * - only if path is `absolute`, we can try to resolve all prompt files in it and its subfolders, and then try to match the files against a glob pattern
 */

/**
 * Finds the first parent of the provided location that does not contain a `glob pattern`.
 *
 * @throws if the provided location is not an `absolute path`.
 */
// TODO: @lego - add examples?
export const firstNonGlobParent = (
	location: URI,
): URI => {
	// sanity check of the provided location
	assert(
		isAbsolute(location.path),
		`Provided location must be an absolute path, got '${location.path}'.`,
	);

	// note! if though the folder name can be `invalid glob` here, it is still OK to
	//       use it as we don't really known if that is a glob pattern, or the folder
	//       name contains characters that can also be used in a glob pattern
	if (isValidGlob(location.path) === false) {
		return location;
	}

	// if location is the root of the filesystem, we are done
	const parent = dirname(location);
	if (extUri.isEqual(parent, location)) {
		return location;
	}

	// otherwise, try again starting with the parent folder
	return firstNonGlobParent(parent);
};

/**
 * TODO: @lego
 */
const findAllPromptFiles = async (
	location: URI,
	fileService: IFileService,
): Promise<readonly URI[]> => {
	const result: URI[] = [];
	const info = await fileService.resolve(location);

	if (info.isFile && isPromptFile(info.resource)) {
		result.push(info.resource);

		return result;
	}

	if (info.isDirectory && info.children) {
		for (const child of info.children) {
			if (child.isFile && isPromptFile(child.resource)) {
				result.push(child.resource);

				continue;
			}

			if (child.isDirectory) {
				const promptFiles = await findAllPromptFiles(child.resource, fileService);
				result.push(...promptFiles);

				continue;
			}
		}

		return result;
	}

	return result;
};

/**
 * Converts locations from settings to absolute paths
 * based on the current workspace folders.
 */
const toAbsoluteLocations = (
	configuredLocations: readonly string[],
	workspaceService: IWorkspaceContextService,
): readonly URI[] => {
	const { folders } = workspaceService.getWorkspace();

	const result: URI[] = [];
	for (const configuredLocation of configuredLocations) {
		if (isAbsolute(configuredLocation)) {
			result.push(URI.file(configuredLocation));

			continue;
		}

		for (const workspaceFolder of folders) {
			const absolutePath = extUri.resolvePath(workspaceFolder.uri, configuredLocation);

			// a sanity check on the expected outcome of the `resolvePath()` call
			assert(
				isAbsolute(absolutePath.path),
				`Provided location must be an absolute path, got '${absolutePath.path}'.`,
			);

			result.push(absolutePath);
		}
	}

	return result;
};
