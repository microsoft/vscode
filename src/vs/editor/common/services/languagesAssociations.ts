/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { ParsedPattern, parse } from 'vs/base/common/glob';
import { Mimes } from 'vs/base/common/mime';
import { Schemas } from 'vs/base/common/network';
import { basename, posix } from 'vs/base/common/path';
import { DataUri } from 'vs/base/common/resources';
import { startsWithUTF8BOM } from 'vs/base/common/strings';
import { URI } from 'vs/base/common/uri';

export interface ILanguageAssociation {
	readonly id: string;
	readonly mime: string;
	readonly filename?: string;
	readonly extension?: string;
	readonly filepattern?: string;
	readonly firstline?: RegExp;
	readonly userConfigured?: boolean;
}

interface ILanguageAssociationItem extends ILanguageAssociation {
	readonly filenameLowercase?: string;
	readonly extensionLowercase?: string;
	readonly filepatternLowercase?: ParsedPattern;
	readonly filepatternOnPath?: boolean;
}

let registeredAssociations: ILanguageAssociationItem[] = [];
let nonUserRegisteredAssociations: ILanguageAssociationItem[] = [];
let userRegisteredAssociations: ILanguageAssociationItem[] = [];

/**
 * Associate a language to the registry.
 */
export function registerLanguageAssociation(association: ILanguageAssociation, warnOnOverwrite = false): void {

	// Register
	const associationItem = toLanguageAssociationItem(association);
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

function toLanguageAssociationItem(association: ILanguageAssociation): ILanguageAssociationItem {
	return {
		id: association.id,
		mime: association.mime,
		filename: association.filename,
		extension: association.extension,
		filepattern: association.filepattern,
		firstline: association.firstline,
		userConfigured: association.userConfigured,
		filenameLowercase: association.filename ? association.filename.toLowerCase() : undefined,
		extensionLowercase: association.extension ? association.extension.toLowerCase() : undefined,
		filepatternLowercase: association.filepattern ? parse(association.filepattern.toLowerCase()) : undefined,
		filepatternOnPath: association.filepattern ? association.filepattern.indexOf(posix.sep) >= 0 : false
	};
}

/**
 * Clear language associations from the registry.
 */
export function clearLanguageAssociations(onlyUserConfigured?: boolean): void {
	if (!onlyUserConfigured) {
		registeredAssociations = [];
		nonUserRegisteredAssociations = [];
		userRegisteredAssociations = [];
	} else {
		registeredAssociations = registeredAssociations.filter(a => !a.userConfigured);
		userRegisteredAssociations = [];
	}
}

/**
 * Given a file, return the best matching mime types for it
 * based on the registered language associations.
 */
export function getMimeTypes(resource: URI | null, firstLine?: string): string[] {
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
			default:
				path = resource.path;
		}
	}

	if (!path) {
		return [Mimes.unknown];
	}

	path = path.toLowerCase();

	const filename = basename(path);

	// 1.) User configured mappings have highest priority
	const configuredLanguage = getMimeByPath(path, filename, userRegisteredAssociations);
	if (configuredLanguage) {
		return [configuredLanguage, Mimes.text];
	}

	// 2.) Registered mappings have middle priority
	const registeredLanguage = getMimeByPath(path, filename, nonUserRegisteredAssociations);
	if (registeredLanguage) {
		return [registeredLanguage, Mimes.text];
	}

	// 3.) Firstline has lowest priority
	if (firstLine) {
		const firstlineLanguage = getMimeByFirstline(firstLine);
		if (firstlineLanguage) {
			return [firstlineLanguage, Mimes.text];
		}
	}

	return [Mimes.unknown];
}

function getMimeByPath(path: string, filename: string, associations: ILanguageAssociationItem[]): string | undefined {
	let filenameMatch: ILanguageAssociationItem | undefined = undefined;
	let patternMatch: ILanguageAssociationItem | undefined = undefined;
	let extensionMatch: ILanguageAssociationItem | undefined = undefined;

	// We want to prioritize associations based on the order they are registered so that the last registered
	// association wins over all other. This is for https://github.com/microsoft/vscode/issues/20074
	for (let i = associations.length - 1; i >= 0; i--) {
		const association = associations[i];

		// First exact name match
		if (filename === association.filenameLowercase) {
			filenameMatch = association;
			break; // take it!
		}

		// Longest pattern match
		if (association.filepattern) {
			if (!patternMatch || association.filepattern.length > patternMatch.filepattern!.length) {
				const target = association.filepatternOnPath ? path : filename; // match on full path if pattern contains path separator
				if (association.filepatternLowercase?.(target)) {
					patternMatch = association;
				}
			}
		}

		// Longest extension match
		if (association.extension) {
			if (!extensionMatch || association.extension.length > extensionMatch.extension!.length) {
				if (filename.endsWith(association.extensionLowercase!)) {
					extensionMatch = association;
				}
			}
		}
	}

	// 1.) Exact name match has second highest priority
	if (filenameMatch) {
		return filenameMatch.mime;
	}

	// 2.) Match on pattern
	if (patternMatch) {
		return patternMatch.mime;
	}

	// 3.) Match on extension comes next
	if (extensionMatch) {
		return extensionMatch.mime;
	}

	return undefined;
}

function getMimeByFirstline(firstLine: string): string | undefined {
	if (startsWithUTF8BOM(firstLine)) {
		firstLine = firstLine.substr(1);
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
				return association.mime;
			}
		}
	}

	return undefined;
}
