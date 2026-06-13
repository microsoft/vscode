/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Schemas } from '../../../base/common/network.js';
import { DataUri } from '../../../base/common/resources.js';
import { URI, URI as uri } from '../../../base/common/uri.js';
import { PLAINTEXT_LANGUAGE_ID } from '../languages/modesRegistry.js';
import { ILanguageService } from '../languages/language.js';
import { IModelService } from './model.js';
import { FileKind } from '../../../platform/files/common/files.js';
import { ThemeIcon } from '../../../base/common/themables.js';

const fileIconDirectoryRegex = /(?:\/|^)(?:([^\/]+)\/)?([^\/]+)$/;

/**
 * Structured result from icon class resolution, carrying both CSS classes
 * and optional data-attributes for CSS attribute selector matching (used by glob patterns in icon themes).
 */
export interface FileIconInfo {
	readonly classes: string[];
	readonly attributes?: Readonly<Record<string, string>>;
}

export function getFileIconInfo(modelService: IModelService, languageService: ILanguageService, resource: uri | undefined, fileKind?: FileKind, icon?: ThemeIcon | URI): FileIconInfo {
	if (ThemeIcon.isThemeIcon(icon)) {
		return { classes: [`codicon-${icon.id}`, 'predefined-file-icon'] };
	}

	if (URI.isUri(icon)) {
		return { classes: [] };
	}

	// we always set these base classes even if we do not have a path
	const classes = fileKind === FileKind.ROOT_FOLDER ? ['rootfolder-icon'] : fileKind === FileKind.FOLDER ? ['folder-icon'] : ['file-icon'];
	const attributes: Record<string, string> = {};
	if (resource) {

		// Get the path and name of the resource. For data-URIs, we need to parse specially
		let name: string | undefined;
		if (resource.scheme === Schemas.data) {
			const metadata = DataUri.parseMetaData(resource);
			name = metadata.get(DataUri.META_DATA_LABEL);
		} else {
			const match = resource.path.match(fileIconDirectoryRegex);
			if (match) {
				name = fileIconSelectorEscape(match[2].toLowerCase());
				if (match[1]) {
					classes.push(`${fileIconSelectorEscape(match[1].toLowerCase())}-name-dir-icon`); // parent directory
				}

			} else {
				name = fileIconSelectorEscape(resource.authority.toLowerCase());
			}
		}

		// Root Folders
		if (fileKind === FileKind.ROOT_FOLDER) {
			classes.push(`${name}-root-name-folder-icon`);
			if (name) {
				attributes['data-folder-name'] = name;
			}
		}

		// Folders
		else if (fileKind === FileKind.FOLDER) {
			classes.push(`${name}-name-folder-icon`);
			if (name) {
				attributes['data-folder-name'] = name;
			}
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

				// data-attributes for glob-based icon theme matching
				attributes['data-file-name'] = name;
				const lastDot = name.lastIndexOf('.');
				if (lastDot > 0) {
					attributes['data-file-ext'] = name.substring(lastDot + 1);
				}
			}

			// Detected Mode
			const detectedLanguageId = detectLanguageId(modelService, languageService, resource);
			if (detectedLanguageId) {
				classes.push(`${fileIconSelectorEscape(detectedLanguageId)}-lang-file-icon`);
			}
		}
	}
	return { classes, attributes: Object.keys(attributes).length > 0 ? attributes : undefined };
}

export function getFileIconInfoForLanguageId(languageId: string): FileIconInfo {
	return { classes: ['file-icon', `${fileIconSelectorEscape(languageId)}-lang-file-icon`] };
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

export function fileIconSelectorEscape(str: string): string {
	return str.replace(/[\s]/g, '/'); // HTML class names can not contain certain whitespace characters (https://dom.spec.whatwg.org/#interface-domtokenlist), use / instead, which doesn't exist in file names.
}
