/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Event } from 'vs/base/common/event';
import { createDecorator } from 'vs/platform/instantiation/common/instantiation';
import { IMode, LanguageId, LanguageIdentifier } from 'vs/editor/common/modes';
import { URI } from 'vs/base/common/uri';

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

export interface IModeService {
	_serviceBrand: any;

	onDidCreateMode: Event<IMode>;

	// --- reading
	isRegisteredMode(mimetypeOrModeId: string): boolean;
	getRegisteredModes(): string[];
	getRegisteredLanguageNames(): string[];
	getExtensions(alias: string): string[];
	getFilenames(alias: string): string[];
	getMimeForMode(modeId: string): string | null;
	getLanguageName(modeId: string): string | null;
	getModeIdForLanguageName(alias: string): string | null;
	getModeIdByFilepathOrFirstLine(filepath: string, firstLine?: string): string | null;
	getModeId(commaSeparatedMimetypesOrCommaSeparatedIds: string): string | null;
	getLanguageIdentifier(modeId: string | LanguageId): LanguageIdentifier | null;
	getConfigurationFiles(modeId: string): URI[];

	// --- instantiation
	getMode(commaSeparatedMimetypesOrCommaSeparatedIds: string): IMode | null;
	getOrCreateMode(commaSeparatedMimetypesOrCommaSeparatedIds: string): Promise<IMode>;
	getOrCreateModeByLanguageName(languageName: string): Promise<IMode>;
	getOrCreateModeByFilepathOrFirstLine(filepath: string, firstLine?: string): Promise<IMode>;
}
