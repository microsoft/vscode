/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Schemas } from 'vs/base/common/network';
import { DataUri } from 'vs/base/common/resources';
import { URI as uri } from 'vs/base/common/uri';
import { extname, basename } from 'vs/base/common/path';
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
		const { filename, dirname } = getResourceName(resource);

		if (dirname) {
			classes.push(`${dirname}-dirname-${kindClass}`); // parent directory
		}

		// Get dot segments for filename, and avoid doing an explosive combination of segments
		// (from a filename with lots of `.` characters; most file systems do not allow files > 255 length)
		// https://github.com/microsoft/vscode/issues/116199
		let segments: string[] | undefined;
		if (typeof filename === 'string' && filename.length <= 255) {
			segments = filename.replace(/\.\.\.+/g, '').split('.');
		}

		// Folders
		if (typeof filename === 'string' && fileKind === FileKind.FOLDER) {
			classes.push(`${filename}-name-folder-icon`);
			classes.push(`name-folder-icon`); // extra segment to increase folder-name score
		}

		// Files
		else {

			// Name & Extension(s)
			if (typeof filename === 'string') {
				classes.push(`${filename}-name-file-icon`);
				classes.push(`name-file-icon`); // extra segment to increase file-name score
				if (filename.length <= 255 && segments) {
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

export function getIconAttributes(resource: uri | undefined, fileKind?: FileKind) {
	const attributes: Record<string, string> = {};

	if (resource) {
		const { filename } = getResourceName(resource);

		if (filename) {
			const fileExtname = extname(filename);
			const fileBasename = basename(filename, fileExtname);
			attributes.fileIconExtname = fileExtname.substring(1);
			attributes.fileIconBasename = fileBasename;
		}
	}

	return attributes;
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

function getResourceName(resource: uri) {
	// Get the path and name of the resource. For data-URIs, we need to parse specially
	let filename: string | undefined;
	let dirname: string | undefined;

	if (resource.scheme === Schemas.data) {
		const metadata = DataUri.parseMetaData(resource);
		filename = metadata.get(DataUri.META_DATA_LABEL);

	} else {
		const match = resource.path.match(fileIconDirectoryRegex);
		if (match) {
			dirname = cssEscape(cssEscape(match[1].toLowerCase()));
			filename = cssEscape(match[2].toLowerCase());

		} else {
			filename = cssEscape(resource.authority.toLowerCase());
		}
	}

	return { filename, dirname };
}

function cssEscape(str: string): string {
	return str.replace(/[\11\12\14\15\40]/g, '/'); // HTML class names can not contain certain whitespace characters, use / instead, which doesn't exist in file names.
}
