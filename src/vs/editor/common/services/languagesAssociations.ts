/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { ParsedPattern, parse } from '../../../base/common/glob.js';
import { Mimes } from '../../../base/common/mime.js';
import { Schemas } from '../../../base/common/network.js';
import { basename, posix } from '../../../base/common/path.js';
import { DataUri } from '../../../base/common/resources.js';
import { endsWithIgnoreCase, equals, startsWithUTF8BOM } from '../../../base/common/strings.js';
import { URI } from '../../../base/common/uri.js';
import { PLAINTEXT_LANGUAGE_ID } from '../languages/modesRegistry.js';

export interface ILanguageAssociation {
	readonly id: string;
	readonly mime: string;
	readonly filename?: string;
	readonly extension?: string;
	readonly filepattern?: string;
	readonly firstline?: RegExp;
}

interface ILanguageAssociationItem extends ILanguageAssociation {
	readonly userConfigured: boolean;
	readonly filepatternParsed?: ParsedPattern;
	readonly filepatternOnPath?: boolean;
}

let registeredAssociations: ILanguageAssociationItem[] = [];
let nonUserRegisteredAssociations: ILanguageAssociationItem[] = [];
let userRegisteredAssociations: ILanguageAssociationItem[] = [];

/**
 * Associate a language to the registry (platform).
 * * **NOTE**: This association will lose over associations registered using `registerConfiguredLanguageAssociation`.
 * * **NOTE**: Use `clearPlatformLanguageAssociations` to remove all associations registered using this function.
 */
export function registerPlatformLanguageAssociation(association: ILanguageAssociation, warnOnOverwrite = false): void {
	_registerLanguageAssociation(association, false, warnOnOverwrite);
}

/**
 * Associate a language to the registry (configured).
 * * **NOTE**: This association will win over associations registered using `registerPlatformLanguageAssociation`.
 * * **NOTE**: Use `clearConfiguredLanguageAssociations` to remove all associations registered using this function.
 */
export function registerConfiguredLanguageAssociation(association: ILanguageAssociation): void {
	_registerLanguageAssociation(association, true, false);
}

function _registerLanguageAssociation(association: ILanguageAssociation, userConfigured: boolean, warnOnOverwrite: boolean): void {

	// Register
	const associationItem = toLanguageAssociationItem(association, userConfigured);
	registeredAssociations.push(associationItem);
	if (!associationItem.userConfigured) {
		nonUserRegisteredAssociations.push(associationItem);
	} else {
		userRegisteredAssociations.push(associationItem);
	}

	// Check for conflicts unless this is a user configured association
	if (warnOnOverwrite && !associationItem.userConfigured) {
		registeredAssociations.forEach(a => {
			if (a.mime === associationItem.mime || a.userConfigured) {
				return; // same mime or userConfigured is ok
			}

			if (associationItem.extension && a.extension === associationItem.extension) {
				console.warn(`Overwriting extension <<${associationItem.extension}>> to now point to mime <<${associationItem.mime}>>`);
			}

			if (associationItem.filename && a.filename === associationItem.filename) {
				console.warn(`Overwriting filename <<${associationItem.filename}>> to now point to mime <<${associationItem.mime}>>`);
			}

			if (associationItem.filepattern && a.filepattern === associationItem.filepattern) {
				console.warn(`Overwriting filepattern <<${associationItem.filepattern}>> to now point to mime <<${associationItem.mime}>>`);
			}

			if (associationItem.firstline && a.firstline === associationItem.firstline) {
				console.warn(`Overwriting firstline <<${associationItem.firstline}>> to now point to mime <<${associationItem.mime}>>`);
			}
		});
	}
}

function toLanguageAssociationItem(association: ILanguageAssociation, userConfigured: boolean): ILanguageAssociationItem {
	return {
		id: association.id,
		mime: association.mime,
		filename: association.filename,
		extension: association.extension,
		filepattern: association.filepattern,
		firstline: association.firstline,
		userConfigured: userConfigured,
		filepatternParsed: association.filepattern ? parse(association.filepattern, { ignoreCase: true }) : undefined,
		filepatternOnPath: association.filepattern ? association.filepattern.indexOf(posix.sep) >= 0 : false
	};
}

/**
 * Clear language associations from the registry (platform).
 */
export function clearPlatformLanguageAssociations(): void {
	registeredAssociations = registeredAssociations.filter(a => a.userConfigured);
	nonUserRegisteredAssociations = [];
}

/**
 * Clear language associations from the registry (configured).
 */
export function clearConfiguredLanguageAssociations(): void {
	registeredAssociations = registeredAssociations.filter(a => !a.userConfigured);
	userRegisteredAssociations = [];
}

interface IdAndMime {
	id: string;
	mime: string;
}

/**
 * Given a file, return the best matching mime types for it
 * based on the registered language associations.
 */
export function getMimeTypes(resource: URI | null, firstLine?: string): string[] {
	return getAssociations(resource, firstLine).map(item => item.mime);
}

/**
 * @see `getMimeTypes`
 */
export function getLanguageIds(resource: URI | null, firstLine?: string): string[] {
	return getAssociations(resource, firstLine).map(item => item.id);
}

function getAssociations(resource: URI | null, firstLine?: string): IdAndMime[] {
	let path: string | undefined;
	if (resource) {
		switch (resource.scheme) {
			case Schemas.file:
				path = resource.fsPath;
				break;
			case Schemas.data: {
				const metadata = DataUri.parseMetaData(resource);
				path = metadata.get(DataUri.META_DATA_LABEL);
				break;
			}
			case Schemas.vscodeNotebookCell:
				// File path not relevant for language detection of cell
				path = undefined;
				break;
			default:
				path = resource.path;
		}
	}

	if (!path) {
		return [{ id: 'unknown', mime: Mimes.unknown }];
	}

	path = path.toLowerCase();

	const filename = basename(path);

	// 1.) User configured mappings have highest priority
	const configuredLanguage = getAssociationByPath(path, filename, userRegisteredAssociations);
	if (configuredLanguage) {
		return [configuredLanguage, { id: PLAINTEXT_LANGUAGE_ID, mime: Mimes.text }];
	}

	// 2.) Registered mappings have middle priority
	const registeredLanguage = getAssociationByPath(path, filename, nonUserRegisteredAssociations);
	if (registeredLanguage) {
		return [registeredLanguage, { id: PLAINTEXT_LANGUAGE_ID, mime: Mimes.text }];
	}

	// 3.) Firstline has lowest priority
	if (firstLine) {
		const firstlineLanguage = getAssociationByFirstline(firstLine);
		if (firstlineLanguage) {
			return [firstlineLanguage, { id: PLAINTEXT_LANGUAGE_ID, mime: Mimes.text }];
		}
	}

	return [{ id: 'unknown', mime: Mimes.unknown }];
}

function getAssociationByPath(path: string, filename: string, associations: ILanguageAssociationItem[]): ILanguageAssociationItem | undefined {
	let filenameMatch: ILanguageAssociationItem | undefined = undefined;
	let patternMatch: ILanguageAssociationItem | undefined = undefined;
	let extensionMatch: ILanguageAssociationItem | undefined = undefined;

	// We want to prioritize associations based on the order they are registered so that the last registered
	// association wins over all other. This is for https://github.com/microsoft/vscode/issues/20074
	for (let i = associations.length - 1; i >= 0; i--) {
		const association = associations[i];

		// First exact name match
		if (equals(filename, association.filename, true)) {
			filenameMatch = association;
			break; // take it!
		}

		// Longest pattern match
		if (association.filepattern) {
			if (!patternMatch || association.filepattern.length > patternMatch.filepattern!.length) {
				const target = association.filepatternOnPath ? path : filename; // match on full path if pattern contains path separator
				if (association.filepatternParsed?.(target)) {
					patternMatch = association;
				}
			}
		}

		// Longest extension match
		if (association.extension) {
			if (!extensionMatch || association.extension.length > extensionMatch.extension!.length) {
				if (endsWithIgnoreCase(filename, association.extension)) {
					extensionMatch = association;
				}
			}
		}
	}

	// 1.) Exact name match has second highest priority
	if (filenameMatch) {
		return filenameMatch;
	}

	// 2.) Match on pattern
	if (patternMatch) {
		return patternMatch;
	}

	// 3.) Match on extension comes next
	if (extensionMatch) {
		return extensionMatch;
	}

	return undefined;
}

function getAssociationByFirstline(firstLine: string): ILanguageAssociationItem | undefined {
	if (startsWithUTF8BOM(firstLine)) {
		firstLine = firstLine.substring(1);
	}

	if (firstLine.length > 0) {

		// We want to prioritize associations based on the order they are registered so that the last registered
		// association wins over all other. This is for https://github.com/microsoft/vscode/issues/20074
		for (let i = registeredAssociations.length - 1; i >= 0; i--) {
			const association = registeredAssociations[i];
			if (!association.firstline) {
				continue;
			}

			const matches = firstLine.match(association.firstline);
			if (matches && matches.length > 0) {
				return association;
			}
		}
	}

	return undefined;
}
