/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Schemas } from 'vs/base/common/network';
import { DataUri } from 'vs/base/common/resources';
import { URI as uri } from 'vs/base/common/uri';
import { PLAINTEXT_LANGUAGE_ID } from 'vs/editor/common/languages/modesRegistry';
import { ILanguageService } from 'vs/editor/common/languages/language';
import { IModelService } from 'vs/editor/common/services/model';
import { FileKind } from 'vs/platform/files/common/files';

const fileIconDirectoryRegex = /(?:\/|^)(?:([^\/]+)\/)?([^\/]+)$/;

export function getIconClasses(modelService: IModelService, languageService: ILanguageService, resource: uri | undefined, fileKind?: FileKind): string[] {

	// we always set these base classes even if we do not have a path
	const kindClass = fileKind === FileKind.ROOT_FOLDER ? 'rootfolder-icon' : fileKind === FileKind.FOLDER ? 'folder-icon' : 'file-icon';
	const classes = [kindClass];
	if (resource) {

		// Get the path and name of the resource. For data-URIs, we need to parse specially
		let name: string | undefined;
		if (resource.scheme === Schemas.data) {
			const metadata = DataUri.parseMetaData(resource);
			name = metadata.get(DataUri.META_DATA_LABEL);
		} else {
			const match = resource.path.match(fileIconDirectoryRegex);
			if (match) {
				name = cssEscape(match[2].toLowerCase());
				if (match[1]) {
					classes.push(`${cssEscape(match[1].toLowerCase())}-dirname-${kindClass}`); // parent directory
				}

			} else {
				name = cssEscape(resource.authority.toLowerCase());
			}
		}

		// Get dot segments for filename, and avoid doing an explosive combination of segments
		// (from a filename with lots of `.` characters; most file systems do not allow files > 255 length)
		// https://github.com/microsoft/vscode/issues/116199
		let segments: string[] | undefined;
		if (typeof name === 'string' && name.length <= 255) {
			segments = name.replace(/\.\.\.+/g, '').split('.');
		}

		// Folders
		if (typeof name === 'string' && fileKind === FileKind.FOLDER) {
			classes.push(`${name}-name-folder-icon`);
			classes.push(`name-folder-icon`); // extra segment to increase folder-name score
			if (name.length <= 255 && segments && segments.length <= 4) {
				pushGlobIconClassesForName(name, classes, segments, 'folder'); // add globs targeting folder name
			}
		}

		// Files
		else {

			// Name & Extension(s)
			if (typeof name === 'string') {
				classes.push(`${name}-name-file-icon`);
				classes.push(`name-file-icon`); // extra segment to increase file-name score
				if (name.length <= 255 && segments && segments.length <= 4) {
					pushGlobIconClassesForName(name, classes, segments, 'file'); // add globs targeting file name
					for (let i = 1; i < segments.length; i++) {
						classes.push(`${segments.slice(i).join('.')}-ext-file-icon`); // add each combination of all found extensions if more than one
					}
				}
				classes.push(`ext-file-icon`); // extra segment to increase file-ext score
			}

			// Detected Mode
			const detectedLanguageId = detectLanguageId(modelService, languageService, resource);
			if (detectedLanguageId) {
				classes.push(`${cssEscape(detectedLanguageId)}-lang-file-icon`);
			}
		}
	}
	return classes;
}

export function getIconClassesForLanguageId(languageId: string): string[] {
	return ['file-icon', `${cssEscape(languageId)}-lang-file-icon`];
}

function pushGlobIconClassesForName(name: string, classes: string[], segments: string[], kind: string): void {
	// Non-coalescing wildcard globs, limited to <=4 dot segments (<=3 file extensions).
	// We start from the 2nd segment (index=1) to prevent overlap with Extension(s).
	for (let index = 1; index < segments.length; index++) {
		const wildcardSegments = segments.slice();
		wildcardSegments[index] = '*';
		const wildcardGlob = wildcardSegments.join('.');
		classes.push(`${wildcardGlob}-glob-${kind}-icon`);
	}

	// Globs for dashed file basenames, limited to 2 dot segments (1 file extension).
	// Targets hyphenated prefix or suffix
	// E.g. the tooling filename conventions `test_*.py` & `*_test.go`
	if (segments.length !== 2) {
		return;
	}

	const dotIndex = name.indexOf('.');
	const extname = name.substring(dotIndex);
	const basename = name.substring(0, dotIndex);

	const separator = basename.match(/_|-/)?.[0];

	if (!separator) {
		return;
	}

	// Prefix basename glob for 1 file extension, e.g. `test_*.py`.
	const basenameDashIndex = basename.indexOf(separator);
	const basenamePrefix = basename.substring(0, basenameDashIndex);
	const basenamePrefixGlob = basenamePrefix + separator + '*' + extname;
	classes.push(`${basenamePrefixGlob}-glob-${kind}-icon`);

	// Suffix basename glob for 1 file extension, e.g. `*_test.go`.
	const basenameLastDashIndex = basename.lastIndexOf(separator);
	const basenameSuffix = basename.substring(basenameLastDashIndex + 1);
	const basenameSuffixGlob = '*' + separator + basenameSuffix + extname;
	classes.push(`${basenameSuffixGlob}-glob-${kind}-icon`);
}

function detectLanguageId(modelService: IModelService, languageService: ILanguageService, resource: uri): string | null {
	if (!resource) {
		return null; // we need a resource at least
	}

	let languageId: string | null = null;

	// Data URI: check for encoded metadata
	if (resource.scheme === Schemas.data) {
		const metadata = DataUri.parseMetaData(resource);
		const mime = metadata.get(DataUri.META_DATA_MIME);

		if (mime) {
			languageId = languageService.getLanguageIdByMimeType(mime);
		}
	}

	// Any other URI: check for model if existing
	else {
		const model = modelService.getModel(resource);
		if (model) {
			languageId = model.getLanguageId();
		}
	}

	// only take if the language id is specific (aka no just plain text)
	if (languageId && languageId !== PLAINTEXT_LANGUAGE_ID) {
		return languageId;
	}

	// otherwise fallback to path based detection
	return languageService.guessLanguageIdByFilepathOrFirstLine(resource);
}

function cssEscape(str: string): string {
	return str.replace(/[\11\12\14\15\40]/g, '/'); // HTML class names can not contain certain whitespace characters, use / instead, which doesn't exist in file names.
}
