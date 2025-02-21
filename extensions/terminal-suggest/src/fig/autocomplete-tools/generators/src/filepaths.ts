/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import { ensureTrailingSlash, shellExpand } from './resolve';

export interface FilepathsOptions {
	/**
	 * Show suggestions with any of these extensions. Do not include the leading dot.
	 */
	extensions?: string[];
	/**
	 * Show suggestions where the name exactly matches one of these strings
	 */
	equals?: string | string[];
	/**
	 * Show suggestions where the name matches this expression
	 */
	matches?: RegExp;
	/**
	 * Will treat folders like files, filtering based on the name.
	 */
	filterFolders?: boolean;
	/**
	 * Set properties of suggestions of type 'file'.
	 */
	editFileSuggestions?: Omit<Fig.Suggestion, 'name' | 'type'>;
	/**
	 * Set properties of suggestions of type 'folder'.
	 */
	editFolderSuggestions?: Omit<Fig.Suggestion, 'name' | 'type'>;
	/**
	 * Start to suggest filepaths and folders from this directory.
	 */
	rootDirectory?: string;
	/**
	 * Set how the generator should display folders:
	 * - **Default:** `always` will always suggest folders.
	 * - `never`: will never suggest folders.
	 * - `only`: will show only folders and no files.
	 */
	showFolders?: 'always' | 'never' | 'only';
}

export function sortFilesAlphabetically(array: string[], skip: string[] = []): string[] {
	const skipLower = skip.map((str) => str.toLowerCase());
	const results = array.filter((x) => !skipLower.includes(x.toLowerCase()));

	// Put all files beginning with . after all those that don't, sort alphabetically within each.
	return [
		...results.filter((x) => !x.startsWith('.')).sort((a, b) => a.localeCompare(b)),
		...results.filter((x) => x.startsWith('.')).sort((a, b) => a.localeCompare(b)),
		'../',
	];
}

/**
 * @param cwd - The current working directory when the user started typing the new path
 * @param searchTerm - The path inserted by the user, it can be relative to cwd or absolute
 * @returns The directory the user inserted, taking into account the cwd.
 */
export const getCurrentInsertedDirectory = (
	cwd: string | null,
	searchTerm: string,
	context: Fig.ShellContext
): string => {
	if (cwd === null) {
		return '/';
	}
	const resolvedPath = shellExpand(searchTerm, context);

	const dirname = resolvedPath.slice(0, resolvedPath.lastIndexOf('/') + 1);

	if (dirname === '') {
		return ensureTrailingSlash(cwd);
	}

	return dirname.startsWith('/') ? dirname : `${ensureTrailingSlash(cwd)}${dirname}`;
};

/**
 * Sugar over using the `filepaths` template with `filterTemplateSuggestions`. If any of the
 * conditions match, the suggestion will be accepted.
 *
 * Basic filepath filters can be replaced with this generator.
 *
 * @example
 * ```
 * // inside a `Fig.Arg`...
 * generators: filepaths({ extensions: ['mjs', 'js', 'json'] });
 * ```
 */
function filepathsFn(options: FilepathsOptions = {}): Fig.Generator {
	const {
		extensions = [],
		equals = [],
		matches,
		filterFolders = false,
		editFileSuggestions,
		editFolderSuggestions,
		rootDirectory,
		showFolders = 'always',
	} = options;
	// TODO: automatically remove eventual leading dots
	const extensionsSet = new Set(extensions);
	const equalsSet = new Set(equals);

	// NOTE: If no filter is provided we should not run the filterSuggestions fn.
	// !! When new filtering parameters are added we should increase this function
	const shouldFilterSuggestions = () => extensions.length > 0 || equals.length > 0 || matches;

	const filterSuggestions = (
		suggestions: Fig.TemplateSuggestion[] = []
	): Fig.TemplateSuggestion[] => {
		if (!shouldFilterSuggestions()) { return suggestions; }

		return suggestions.filter(({ name = '', type }) => {
			if (!filterFolders && type === 'folder') { return true; }

			if (equalsSet.has(name)) { return true; }
			if (matches && !!name.match(matches)) { return true; }
			// handle extensions
			const [, ...suggestionExtensions] = name.split('.');
			if (suggestionExtensions.length >= 1) {
				let i = suggestionExtensions.length - 1;
				let stackedExtensions = suggestionExtensions[i];
				do {
					if (extensionsSet.has(stackedExtensions)) {
						return true;
					}
					i -= 1;
					// `i` may become -1 which is not a valid index, but the extensionSet check at the beginning is not run in that case,
					// so the wrong extension is not evaluated
					stackedExtensions = [suggestionExtensions[i], stackedExtensions].join('.');
				} while (i >= 0);
			}
			return false;
		});
	};

	const postProcessSuggestions = (
		suggestions: Fig.TemplateSuggestion[] = []
	): Fig.TemplateSuggestion[] => {
		if (!editFileSuggestions && !editFolderSuggestions) { return suggestions; }

		return suggestions.map((suggestion) => ({
			...suggestion,
			...((suggestion.type === 'file' ? editFileSuggestions : editFolderSuggestions) || {})
		}));
	};

	return {
		trigger: (oldToken, newToken) => {
			const oldLastSlashIndex = oldToken.lastIndexOf('/');
			const newLastSlashIndex = newToken.lastIndexOf('/');
			// If the final path segment has changed, trigger new suggestions
			if (oldLastSlashIndex !== newLastSlashIndex) {
				return true;
			}
			// Here, there could either be no slashes, or something before the
			// final slash has changed. In the case where there are no slashes,
			// we don't want to trigger on each keystroke, so explicitly return false.
			if (oldLastSlashIndex === -1 && newLastSlashIndex === -1) {
				return false;
			}
			// We know there's at least one slash in the string thanks to the case
			// above, so trigger if anything before the final slash has changed.
			return oldToken.slice(0, oldLastSlashIndex) !== newToken.slice(0, newLastSlashIndex);
		},
		getQueryTerm: (token) => token.slice(token.lastIndexOf('/') + 1),
		filepathOptions: options,
		custom: async (_, executeCommand, generatorContext) => {
			const { isDangerous, currentWorkingDirectory, searchTerm } = generatorContext;
			const currentInsertedDirectory =
				getCurrentInsertedDirectory(
					rootDirectory ?? currentWorkingDirectory,
					searchTerm,
					generatorContext
				) ?? '/';

			try {
				const data = await executeCommand({
					command: 'ls',
					args: ['-1ApL'],
					cwd: currentInsertedDirectory,
				});
				const sortedFiles = sortFilesAlphabetically(data.stdout.split('\n'), ['.DS_Store']);

				const generatorOutputArray: Fig.TemplateSuggestion[] = [];
				// Then loop through them and add them to the generatorOutputArray
				// depending on the template type
				for (const name of sortedFiles) {
					if (name) {
						const templateType = name.endsWith('/') ? 'folders' : 'filepaths';
						if (
							(templateType === 'filepaths' && showFolders !== 'only') ||
							(templateType === 'folders' && showFolders !== 'never')
						) {
							generatorOutputArray.push({
								type: templateType === 'filepaths' ? 'file' : 'folder',
								name,
								insertValue: name,
								isDangerous,
								context: { templateType },
							});
						}
					}
				}

				// Filter suggestions. This takes in the array of suggestions, filters it,
				// and outputs an array of suggestions
				return postProcessSuggestions(filterSuggestions(generatorOutputArray));
			} catch (err) {
				return [];
			}
		},
	};
}

export const folders = Object.assign(
	() => filepathsFn({ showFolders: 'only' }),
	Object.freeze(filepathsFn({ showFolders: 'only' }))
);
export const filepaths = Object.assign(filepathsFn, Object.freeze(filepathsFn()));
