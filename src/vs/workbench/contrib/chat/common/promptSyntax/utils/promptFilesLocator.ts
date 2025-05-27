/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { URI } from '../../../../../../base/common/uri.js';
import { assert } from '../../../../../../base/common/assert.js';
import { isAbsolute } from '../../../../../../base/common/path.js';
import { ResourceSet } from '../../../../../../base/common/map.js';
import { IFileService } from '../../../../../../platform/files/common/files.js';
import { PromptsConfig } from '../../../../../../platform/prompts/common/config.js';
import { basename, dirname, joinPath } from '../../../../../../base/common/resources.js';
import { IWorkspaceContextService } from '../../../../../../platform/workspace/common/workspace.js';
import { IConfigurationService } from '../../../../../../platform/configuration/common/configuration.js';
import { getPromptFileExtension, getPromptFileType, PromptsType } from '../../../../../../platform/prompts/common/prompts.js';
import { IWorkbenchEnvironmentService } from '../../../../../services/environment/common/environmentService.js';
import { Schemas } from '../../../../../../base/common/network.js';
import { getExcludes, IFileQuery, ISearchConfiguration, ISearchService, QueryType } from '../../../../../services/search/common/search.js';
import { CancellationToken } from '../../../../../../base/common/cancellation.js';
import { isCancellationError } from '../../../../../../base/common/errors.js';
import { TPromptsStorage } from '../service/types.js';
import { IUserDataProfileService } from '../../../../../services/userDataProfile/common/userDataProfile.js';

/**
 * Utility class to locate prompt files.
 */
export class PromptFilesLocator {

	constructor(
		@IFileService private readonly fileService: IFileService,
		@IConfigurationService private readonly configService: IConfigurationService,
		@IWorkspaceContextService private readonly workspaceService: IWorkspaceContextService,
		@IWorkbenchEnvironmentService private readonly environmentService: IWorkbenchEnvironmentService,
		@ISearchService private readonly searchService: ISearchService,
		@IUserDataProfileService private readonly userDataService: IUserDataProfileService,
	) { }

	/**
	 * List all prompt files from the filesystem.
	 *
	 * @returns List of prompt files found in the workspace.
	 */
	public async listFiles(type: PromptsType, storage: TPromptsStorage, token: CancellationToken): Promise<readonly URI[]> {
		if (storage === 'local') {
			const configuredLocations = PromptsConfig.promptSourceFolders(this.configService, type);
			const absoluteLocations = this.toAbsoluteLocations(configuredLocations);
			return await this.findFilesInLocations(absoluteLocations, type, token);
		} else {
			return await this.listFilesInUserData(type, token);
		}
	}

	private async listFilesInUserData(type: PromptsType, token: CancellationToken): Promise<readonly URI[]> {
		try {
			const info = await this.fileService.resolve(this.userDataService.currentProfile.promptsHome);
			if (info.isDirectory && info.children && !token.isCancellationRequested) {
				const result: URI[] = [];
				for (const child of info.children) {
					if (child.isFile && getPromptFileType(child.resource) === type) {
						result.push(child.resource);
					}
				}
				return result;
			}
			return [];
		} catch (error) {
			return [];
		}
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
	public getConfigBasedSourceFolders(type: PromptsType): readonly URI[] {
		const configuredLocations = PromptsConfig.promptSourceFolders(this.configService, type);
		const absoluteLocations = this.toAbsoluteLocations(configuredLocations);

		// locations in the settings can contain glob patterns so we need
		// to process them to get "clean" paths; the goal here is to have
		// a list of unambiguous folder paths where prompt files are stored
		const result = new ResourceSet();
		for (let absoluteLocation of absoluteLocations) {
			const baseName = basename(absoluteLocation);

			// if a path ends with a well-known "any file" pattern, remove
			// it so we can get the dirname path of that setting value
			const filePatterns = ['*.md', `*${getPromptFileExtension(type)}`];
			for (const filePattern of filePatterns) {
				if (baseName === filePattern) {
					absoluteLocation = dirname(absoluteLocation);
					continue;
				}
			}

			// likewise, if the pattern ends with single `*` (any file name)
			// remove it to get the dirname path of the setting value
			if (baseName === '*') {
				absoluteLocation = dirname(absoluteLocation);
			}

			// if after replacing the "file name" glob pattern, the path
			// still contains a glob pattern, then ignore the path
			if (isValidGlob(absoluteLocation.path) === true) {
				continue;
			}

			result.add(absoluteLocation);
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
		type: PromptsType,
		token: CancellationToken
	): Promise<readonly URI[]> {
		// find all prompt files in the provided locations, then match
		// the found file paths against (possible) glob patterns
		const paths = new ResourceSet();
		for (const absoluteLocation of absoluteLocations) {
			assert(
				isAbsolute(absoluteLocation.path),
				`Provided location must be an absolute path, got '${absoluteLocation.path}'.`,
			);

			const { parent, filePattern } = firstNonGlobParentAndPattern(absoluteLocation);
			if (filePattern === undefined && await this.isExistingFile(parent)) {
				// if the provided location points to a file, add it
				if (getPromptFileType(parent) === type) {
					paths.add(parent);
				}
			} else {
				const promptFiles = await this.searchFilesInLocation(parent, filePattern, token);
				for (const file of promptFiles) {
					if (getPromptFileType(file) === type) {
						paths.add(file);
					}
				}
			}
			if (token.isCancellationRequested) {
				return [];
			}
		}

		return [...paths];
	}

	/**
	 * Converts locations defined in `settings` to absolute filesystem path URIs.
	 * This conversion is needed because locations in settings can be relative,
	 * hence we need to resolve them based on the current workspace folders.
	 */
	private toAbsoluteLocations(configuredLocations: readonly string[]): readonly URI[] {
		const result = new ResourceSet();
		const { folders } = this.workspaceService.getWorkspace();

		for (const configuredLocation of configuredLocations) {
			if (isAbsolute(configuredLocation)) {
				const remoteAuthority = this.environmentService.remoteAuthority;
				if (remoteAuthority) {
					// if the location is absolute and we are in a remote environment,
					// we need to convert it to a file URI with the remote authority
					result.add(URI.from({ scheme: Schemas.vscodeRemote, authority: remoteAuthority, path: configuredLocation }));
				} else {
					result.add(URI.file(configuredLocation));
				}
			} else {
				for (const workspaceFolder of folders) {
					const absolutePath = joinPath(workspaceFolder.uri, configuredLocation);
					// a sanity check on the expected outcome of the `joinPath()` call
					assert(
						isAbsolute(absolutePath.path),
						`Provided location must be an absolute path, got '${absolutePath.path}'.`,
					);
					result.add(absolutePath);
				}
			}
		}

		return [...result];
	}

	private async searchFilesInLocation(
		folder: URI,
		filePattern: string | undefined,
		token: CancellationToken | undefined
	): Promise<URI[]> {
		const disregardIgnoreFiles = this.configService.getValue<boolean>('explorer.excludeGitIgnore');

		const workspaceRoot = this.workspaceService.getWorkspaceFolder(folder);

		const getExcludePattern = (folder: URI) => getExcludes(this.configService.getValue<ISearchConfiguration>({ resource: folder })) || {};
		const searchOptions: IFileQuery = {
			folderQueries: [{ folder, disregardIgnoreFiles }],
			type: QueryType.File,
			shouldGlobMatchFilePattern: true,
			excludePattern: workspaceRoot ? getExcludePattern(workspaceRoot.uri) : undefined,
			sortByScore: true,
			filePattern
		};

		try {
			const searchResult = await this.searchService.fileSearch(searchOptions, token);
			if (token?.isCancellationRequested) {
				return [];
			}
			return searchResult.results.map(r => r.resource);
		} catch (e) {
			if (!isCancellationError(e)) {
				throw e;
			}
		}
		return [];
	}

	private async isExistingFile(uri: URI): Promise<boolean> {
		try {
			return (await this.fileService.resolve(uri)).isFile;
		} catch (e) {
		}
		return false;
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
 * Asumes that the location that is provided has a valid path (is abstract)
 *
 * ## Examples
 *
 * ```typescript
 * assert.strictDeepEqual(
 *     firstNonGlobParentAndPattern(URI.file('/home/user/{folder1,folder2}/file.md')).path,
 *     { parent: URI.file('/home/user'), filePattern: '{folder1,folder2}/file.md' },
 *     'Must find correct non-glob parent dirname.',
 * );
 * ```
 */
const firstNonGlobParentAndPattern = (
	location: URI
): { parent: URI; filePattern: string | undefined } => {
	const segments = location.path.split('/');
	let i = 0;
	while (i < segments.length && isValidGlob(segments[i]) === false) {
		i++;
	}
	if (i === segments.length) {
		// the path does not contain a glob pattern, so we can
		// just find all prompt files in the provided location
		return { parent: location, filePattern: undefined };
	}
	// the path contains a glob pattern, so we search in last folder that does not contain a glob pattern
	return {
		parent: location.with({ path: segments.slice(0, i).join('/') }),
		filePattern: segments.slice(i).join('/')
	};
};




