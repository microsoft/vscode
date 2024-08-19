/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Schemas } from 'vs/base/common/network';
import { DataUri } from 'vs/base/common/resources';
import { URI, URI as uri } from 'vs/base/common/uri';
import { PLAINTEXT_LANGUAGE_ID } from 'vs/editor/common/languages/modesRegistry';
import { ILanguageService } from 'vs/editor/common/languages/language';
import { IModelService } from 'vs/editor/common/services/model';
import { FileKind } from 'vs/platform/files/common/files';
import { ThemeIcon } from 'vs/base/common/themables';

const fileIconDirectoryRegex = /(?:\/|^)(?:([^\/]+)\/)?([^\/]+)$/;

export function getIconClasses(modelService: IModelService, languageService: ILanguageService, resource: uri | undefined, fileKind?: FileKind, icon?: ThemeIcon | URI): string[] {
	if (ThemeIcon.isThemeIcon(icon)) {
		return [`codicon-${icon.id}`, 'predefined-file-icon'];
	}

	if (URI.isUri(icon)) {
		return [];
	}

	// we always set these base classes even if we do not have a path
	const classes = fileKind === FileKind.ROOT_FOLDER ? ['rootfolder-icon'] : fileKind === FileKind.FOLDER ? ['folder-icon'] : ['file-icon'];
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
					classes.push(`${cssEscape(match[1].toLowerCase())}-name-dir-icon`); // parent directory
				}

			} else {
				name = cssEscape(resource.authority.toLowerCase());
			}
		}

		// Root Folders
		if (fileKind === FileKind.ROOT_FOLDER) {
			classes.push(`${name}-root-name-folder-icon`);
		}

		// Folders
		else if (fileKind === FileKind.FOLDER) {
			classes.push(`${name}-name-folder-icon`);
		}

		// Files
		else {

			// Name & Extension(s)
			if (name) {
				classes.push(`${name}-name-file-icon`);
				classes.push(`name-file-icon`); // extra segment to increase file-name score
				// Avoid doing an explosive combination of extensions for very long filenames
				// (most file systems do not allow files > 255 length) with lots of `.` characters
				// https://github.com/microsoft/vscode/issues/116199
				if (name.length <= 255) {
					const dotSegments = name.split('.');
					for (let i = 1; i < dotSegments.length; i++) {
						classes.push(`${dotSegments.slice(i).join('.')}-ext-file-icon`); // add each combination of all found extensions if more than one
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
	return str.replace(/[\x11\x12\x14\x15\x40]/g, '/'); // HTML class names can not contain certain whitespace characters, use / instead, which doesn't exist in file names.
}
