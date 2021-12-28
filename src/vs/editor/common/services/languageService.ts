/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Event } from 'vs/base/common/event';
import { URI } from 'vs/base/common/uri';
import { ILanguageIdCodec } from 'vs/editor/common/modes';
import { createDecorator } from 'vs/platform/instantiation/common/instantiation';

export const ILanguageService = createDecorator<ILanguageService>('languageService');

export interface ILanguageExtensionPoint {
	id: string;
	extensions?: string[];
	filenames?: string[];
	filenamePatterns?: string[];
	firstLine?: string;
	aliases?: string[];
	mimetypes?: string[];
	configuration?: URI;
}

export interface ILanguageSelection {
	readonly languageId: string;
	readonly onDidChange: Event<string>;
}

export interface ILanguageService {
	readonly _serviceBrand: undefined;

	readonly languageIdCodec: ILanguageIdCodec;

	onDidEncounterLanguage: Event<string>;
	onLanguagesMaybeChanged: Event<void>;

	// --- reading
	isRegisteredLanguageId(languageId: string): boolean;
	getRegisteredLanguageIds(): string[];
	getRegisteredLanguageNames(): string[];
	getExtensions(alias: string): string[]; // TODO
	getFilenamesForLanguageId(languageId: string): string[];
	getMimeTypeForLanguageId(languageId: string): string | null;
	getLanguageName(languageId: string): string | null;
	/**
	 * Look up a language by its name case insensitive.
	 */
	getLanguageIdForLanguageName(languageName: string): string | null;
	getLanguageIdForMimeType(mimeType: string | null | undefined): string | null;
	getLanguageIdByFilepathOrFirstLine(resource: URI, firstLine?: string): string | null;
	validateLanguageId(languageId: string): string | null;
	getConfigurationFiles(languageId: string): URI[];

	/**
	 * Will fall back to 'plaintext' if `languageId` is unknown.
	 */
	createById(languageId: string | null | undefined): ILanguageSelection;
	/**
	 * Will fall back to 'plaintext' if `mimeType` is unknown.
	 */
	createByMimeType(mimeType: string | null | undefined): ILanguageSelection;
	/**
	 * Will fall back to 'plaintext' if the `languageId` cannot be determined.
	 */
	createByFilepathOrFirstLine(resource: URI | null, firstLine?: string): ILanguageSelection;
}
