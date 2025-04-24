/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { TPromptsType } from '../service/types.js';
import { URI } from '../../../../../../base/common/uri.js';
import { match } from '../../../../../../base/common/glob.js';
import { assert } from '../../../../../../base/common/assert.js';
import { isAbsolute } from '../../../../../../base/common/path.js';
import { ResourceSet } from '../../../../../../base/common/map.js';
import { IFileService } from '../../../../../../platform/files/common/files.js';
import { PromptsConfig } from '../../../../../../platform/prompts/common/config.js';
import { basename, dirname, extUri } from '../../../../../../base/common/resources.js';
import { IWorkspaceContextService } from '../../../../../../platform/workspace/common/workspace.js';
import { IConfigurationService } from '../../../../../../platform/configuration/common/configuration.js';
import { getPromptFileType, PROMPT_FILE_EXTENSION } from '../../../../../../platform/prompts/common/constants.js';

/**
 * Utility class to locate prompt files.
 */
export class PromptFilesLocator {
	constructor(
		@IFileService private readonly fileService: IFileService,
		@IConfigurationService private readonly configService: IConfigurationService,
		@IWorkspaceContextService private readonly workspaceService: IWorkspaceContextService,
	) { }

	/**
	 * List all prompt files from the filesystem.
	 *
	 * @returns List of prompt files found in the workspace.
	 */
	public async listFiles(type: TPromptsType): Promise<readonly URI[]> {
		const configuredLocations = PromptsConfig.promptSourceFolders(this.configService, type);
		const absoluteLocations = toAbsoluteLocations(configuredLocations, this.workspaceService);

		return await this.listFilesIn(absoluteLocations, type);
	}

	/**
	 * Lists all prompt files in the provided folders.
	 *
	 * @throws if any of the provided folder paths is not an `absolute path`.
	 *
	 * @param absoluteLocations List of prompt file source folders to search for prompt files in. Must be absolute paths.
	 * @returns List of prompt files found in the provided folders.
	 */
	public async listFilesIn(
		folders: readonly URI[],
		type: TPromptsType,
	): Promise<readonly URI[]> {
		return await this.findFilesInLocations(folders, type);
	}

	/**
	 * Get all possible unambiguous prompt file source folders based on
	 * the current workspace folder structure.
	 *
	 * This method is currently primarily used by the `> Create Prompt`
	 * command that providers users with the list of destination folders
	 * for a newly created prompt file. Because such a list cannot contain
	 * paths that include `glob pattern` in them, we need to process config
	 * values and try to create a list of clear and unambiguous locations.
	 *
	 * @returns List of possible unambiguous prompt file folders.
	 */
	public getConfigBasedSourceFolders(type: TPromptsType): readonly URI[] {
		const configuredLocations = PromptsConfig.promptSourceFolders(this.configService, type);
		const absoluteLocations = toAbsoluteLocations(configuredLocations, this.workspaceService);

		// locations in the settings can contain glob patterns so we need
		// to process them to get "clean" paths; the goal here is to have
		// a list of unambiguous folder paths where prompt files are stored
		const result = new ResourceSet();
		for (const absoluteLocation of absoluteLocations) {
			let { path } = absoluteLocation;
			const baseName = basename(absoluteLocation);

			// if a path ends with a well-known "any file" pattern, remove
			// it so we can get the dirname path of that setting value
			const filePatterns = ['*.md', `*${PROMPT_FILE_EXTENSION}`];
			for (const filePattern of filePatterns) {
				if (baseName === filePattern) {
					path = URI.joinPath(absoluteLocation, '..').path;

					continue;
				}
			}

			// likewise, if the pattern ends with single `*` (any file name)
			// remove it to get the dirname path of the setting value
			if (baseName === '*') {
				path = URI.joinPath(absoluteLocation, '..').path;
			}

			// if after replacing the "file name" glob pattern, the path
			// still contains a glob pattern, then ignore the path
			if (isValidGlob(path) === true) {
				continue;
			}

			result.add(URI.file(path));
		}

		return [...result];
	}

	/**
	 * Finds all existent prompt files in the provided source folders.
	 *
	 * @throws if any of the provided folder paths is not an `absolute path`.
	 *
	 * @param absoluteLocations List of prompt file source folders to search for prompt files in. Must be absolute paths.
	 * @returns List of prompt files found in the provided source folders.
	 */
	private async findFilesInLocations(
		absoluteLocations: readonly URI[],
		type: TPromptsType,
	): Promise<readonly URI[]> {

		// find all prompt files in the provided locations, then match
		// the found file paths against (possible) glob patterns
		const paths = new ResourceSet();
		for (const absoluteLocation of absoluteLocations) {
			assert(
				isAbsolute(absoluteLocation.path),
				`Provided location must be an absolute path, got '${absoluteLocation.path}'.`,
			);

			const nonGlobParent = firstNonGlobParent(absoluteLocation);
			if (nonGlobParent === absoluteLocation) {
				// the path does not contain a glob pattern, so we can
				// just find all prompt files in the provided location
				const promptFiles = await findFilesInLocation(
					absoluteLocation,
					type,
					this.fileService,
				);
				for (const file of promptFiles) {
					paths.add(file);
				}
			} else {
				// the path contains a glob pattern
				// need to discuss whether to keep it or how to limit it (not documented yet)
				const promptFiles = await findFilesInLocation(
					nonGlobParent,
					type,
					this.fileService,
				);

				// filter out found prompt files to only include those that match
				// the original glob pattern specified in the settings (if any)
				for (const file of promptFiles) {
					if (match(absoluteLocation.path, file.path)) {
						paths.add(file);
					}
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

	let previousCharacter: string | undefined;
	for (const char of pattern) {
		// skip all escaped characters
		if (previousCharacter === '\\') {
			previousCharacter = char;
			continue;
		}

		if (char === '*') {
			return true;
		}

		if (char === '?') {
			return true;
		}

		if (char === '[') {
			squareBrackets = true;
			squareBracketsCount++;

			previousCharacter = char;
			continue;
		}

		if (char === ']') {
			squareBrackets = true;
			squareBracketsCount--;
			previousCharacter = char;
			continue;
		}

		if (char === '{') {
			curlyBrackets = true;
			curlyBracketsCount++;
			continue;
		}

		if (char === '}') {
			curlyBrackets = true;
			curlyBracketsCount--;
			previousCharacter = char;
			continue;
		}

		previousCharacter = char;
	}

	// if square brackets exist and are in pairs, this is a `valid glob`
	if (squareBrackets && (squareBracketsCount === 0)) {
		return true;
	}

	// if curly brackets exist and are in pairs, this is a `valid glob`
	if (curlyBrackets && (curlyBracketsCount === 0)) {
		return true;
	}

	return false;
};

/**
 * Finds the first parent of the provided location that does not contain a `glob pattern`.
 *
 * @throws if the provided location is not an `absolute path`.
 *
 * ## Examples
 *
 * ```typescript
 * assert.strictEqual(
 *     firstNonGlobParent(URI.file('/home/user/{folder1,folder2}/file.md')).path,
 *     URI.file('/home/user').path,
 *     'Must find correct non-glob parent dirname.',
 * );
 * ```
 */
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
 * Finds all `prompt files` in the provided location and all of its subfolders.
 */
const findFilesInLocation = async (
	location: URI,
	type: TPromptsType,
	fileService: IFileService,
): Promise<readonly URI[]> => {
	const result: URI[] = [];

	try {
		const info = await fileService.resolve(location);

		if (info.isFile && getPromptFileType(info.resource) === type) {
			result.push(info.resource);

			return result;
		}

		if (info.isDirectory && info.children) {
			for (const child of info.children) {
				if (child.isFile && getPromptFileType(child.resource) === type) {
					result.push(child.resource);

					continue;
				}

				if (child.isDirectory) {
					const promptFiles = await findFilesInLocation(child.resource, type, fileService);
					result.push(...promptFiles);

					continue;
				}
			}

			return result;
		}
	} catch (error) {
		// noop
	}

	return result;
};

/**
 * Converts locations defined in `settings` to absolute filesystem path URIs.
 * This conversion is needed because locations in settings can be relative,
 * hence we need to resolve them based on the current workspace folders.
 */
const toAbsoluteLocations = (
	configuredLocations: readonly string[],
	workspaceService: IWorkspaceContextService,
): readonly URI[] => {
	const result = new ResourceSet();
	const { folders } = workspaceService.getWorkspace();

	for (const configuredLocation of configuredLocations) {
		if (isAbsolute(configuredLocation)) {
			result.add(URI.file(configuredLocation));

			continue;
		}

		for (const workspaceFolder of folders) {
			const absolutePath = extUri.resolvePath(workspaceFolder.uri, configuredLocation);

			// a sanity check on the expected outcome of the `resolvePath()` call
			assert(
				isAbsolute(absolutePath.path),
				`Provided location must be an absolute path, got '${absolutePath.path}'.`,
			);

			if (result.has(absolutePath) === false) {
				result.add(absolutePath);
			}

			// if not inside a multi-root workspace, we are done
			if (folders.length <= 1) {
				continue;
			}

			// if inside a multi-root workspace, consider the specified prompts source folder
			// inside the workspace root, to allow users to use some (e.g., `.github/prompts`)
			// folder as a top-level folder in the workspace
			const workspaceRootUri = dirname(workspaceFolder.uri);
			const workspaceFolderUri = extUri.resolvePath(workspaceRootUri, configuredLocation);
			// if we already have this folder in the list, skip it
			if (result.has(workspaceFolderUri) === true) {
				continue;
			}

			// otherwise, if the prompt source folder is inside a top-level workspace folder,
			// add it to the list of paths too; this helps to handle the case when a relative
			// path must be resolved from `root` of the workspace
			if (workspaceFolderUri.fsPath.startsWith(workspaceFolder.uri.fsPath)) {
				result.add(workspaceFolderUri);
			}
		}
	}

	return [...result];
};
