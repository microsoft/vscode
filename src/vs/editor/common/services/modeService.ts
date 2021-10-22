/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Event } from 'vs/base/common/event';
import { URI } from 'vs/base/common/uri';
import { ILanguageIdCodec } from 'vs/editor/common/modes';
import { createDecorator } from 'vs/platform/instantiation/common/instantiation';

export const IModeService = createDecorator<IModeService>('modeService');

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

export interface IModeService {
	readonly _serviceBrand: undefined;

	readonly languageIdCodec: ILanguageIdCodec;

	onDidEncounterLanguage: Event<string>;
	onLanguagesMaybeChanged: Event<void>;

	// --- reading
	isRegisteredMode(mimetypeOrModeId: string): boolean;
	getRegisteredModes(): string[];
	getRegisteredLanguageNames(): string[];
	getExtensions(alias: string): string[];
	getFilenames(alias: string): string[];
	getMimeForMode(languageId: string): string | null;
	getLanguageName(languageId: string): string | null;
	getModeIdForLanguageName(alias: string): string | null;
	getModeIdByFilepathOrFirstLine(resource: URI, firstLine?: string): string | null;
	getModeId(commaSeparatedMimetypesOrCommaSeparatedIds: string): string | null;
	validateLanguageId(languageId: string): string | null;
	getConfigurationFiles(languageId: string): URI[];

	// --- instantiation
	create(commaSeparatedMimetypesOrCommaSeparatedIds: string | undefined): ILanguageSelection;
	createByLanguageName(languageName: string): ILanguageSelection;
	createByFilepathOrFirstLine(resource: URI | null, firstLine?: string): ILanguageSelection;

	triggerMode(commaSeparatedMimetypesOrCommaSeparatedIds: string): void;
}
