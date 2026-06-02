/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { knownLanguages } from './generatedLanguages';
import {
	knownFileExtensions,
	knownTemplateLanguageExtensions,
	templateLanguageLimitations,
} from './languages';
import { basename } from '../util/uri';
import * as path from 'node:path';

export class Language {
	constructor(
		readonly languageId: string,
		readonly isGuess: boolean,
		readonly fileExtension: string
	) { }
}

interface LanguageDetectionInput {
	languageId: string;
	uri: string;
}

export abstract class LanguageDetection {
	abstract detectLanguage(doc: LanguageDetectionInput): Language;
}

type LanguageIdWithGuessing = { languageId: string; isGuess: boolean };

const knownExtensions = new Map<string, string[]>();
const knownFilenames = new Map<string, string[]>();

for (const [languageId, { extensions, filenames }] of Object.entries(knownLanguages)) {
	for (const extension of extensions) {
		knownExtensions.set(extension, [...(knownExtensions.get(extension) ?? []), languageId]);
	}
	for (const filename of filenames ?? []) {
		knownFilenames.set(filename, [...(knownFilenames.get(filename) ?? []), languageId]);
	}
}

class FilenameAndExensionLanguageDetection extends LanguageDetection {
	detectLanguage(doc: LanguageDetectionInput): Language {
		const filename = basename(doc.uri);
		const extension = path.extname(filename).toLowerCase();
		const extensionWithoutTemplate = this.extensionWithoutTemplateLanguage(filename, extension);
		const languageIdWithGuessing = this.detectLanguageId(filename, extensionWithoutTemplate);
		const ext = this.computeFullyQualifiedExtension(extension, extensionWithoutTemplate);
		if (!languageIdWithGuessing) {
			return new Language(doc.languageId, true, ext);
		}
		return new Language(languageIdWithGuessing.languageId, languageIdWithGuessing.isGuess, ext);
	}

	private extensionWithoutTemplateLanguage(filename: string, extension: string): string {
		if (knownTemplateLanguageExtensions.includes(extension)) {
			const filenameWithoutExtension = filename.substring(0, filename.lastIndexOf('.'));
			const extensionWithoutTemplate = path.extname(filenameWithoutExtension).toLowerCase();
			const isTemplateLanguage =
				extensionWithoutTemplate.length > 0 &&
				knownFileExtensions.includes(extensionWithoutTemplate) &&
				this.isExtensionValidForTemplateLanguage(extension, extensionWithoutTemplate);
			if (isTemplateLanguage) {
				return extensionWithoutTemplate;
			}
		}
		return extension;
	}

	private isExtensionValidForTemplateLanguage(extension: string, extensionWithoutTemplate: string): boolean {
		const limitations = templateLanguageLimitations[extension];
		return !limitations || limitations.includes(extensionWithoutTemplate);
	}

	private detectLanguageId(filename: string, extension: string): LanguageIdWithGuessing | undefined {
		if (knownFilenames.has(filename)) {
			return { languageId: knownFilenames.get(filename)![0], isGuess: false };
		}
		const extensionCandidates = knownExtensions.get(extension) ?? [];
		if (extensionCandidates.length > 0) {
			return { languageId: extensionCandidates[0], isGuess: extensionCandidates.length > 1 };
		}
		while (filename.includes('.')) {
			filename = filename.replace(/\.[^.]*$/, '');
			if (knownFilenames.has(filename)) {
				return { languageId: knownFilenames.get(filename)![0], isGuess: false };
			}
		}
	}

	private computeFullyQualifiedExtension(extension: string, extensionWithoutTemplate: string): string {
		if (extension !== extensionWithoutTemplate) {
			return extensionWithoutTemplate + extension;
		}
		return extension;
	}
}

// This class is used to group similar languages together.
// The main drawback of trying to keep them apart is that for related files (e.g. header files),
// the language detection might be wrong and thus features like neighbor tabs might not work as expected.
// In the end, this feature should be moved to neighborTabs.ts (but that's hard to do behind a feature flag)
class GroupingLanguageDetection extends LanguageDetection {
	constructor(private readonly delegate: LanguageDetection) {
		super();
	}

	detectLanguage(doc: LanguageDetectionInput): Language {
		const language = this.delegate.detectLanguage(doc);
		const languageId = language.languageId;
		if (languageId === 'c' || languageId === 'cpp') {
			return new Language('cpp', language.isGuess, language.fileExtension);
		}
		return language;
	}
}

class ClientProvidedLanguageDetection extends LanguageDetection {
	constructor(private readonly delegate: LanguageDetection) {
		super();
	}

	detectLanguage(doc: LanguageDetectionInput): Language {
		if (doc.uri.startsWith('untitled:') || doc.uri.startsWith('vscode-notebook-cell:')) {
			return new Language(doc.languageId, true, '');
		}
		return this.delegate.detectLanguage(doc);
	}
}

export const languageDetection = new GroupingLanguageDetection(
	new ClientProvidedLanguageDetection(new FilenameAndExensionLanguageDetection())
);

export function detectLanguage({ uri, languageId }: { uri: string; languageId: string }): string;
export function detectLanguage({ uri }: { uri: string }): string | undefined;
export function detectLanguage({ uri, languageId }: { uri: string; languageId?: string }) {
	const language = languageDetection.detectLanguage({ uri, languageId: 'UNKNOWN' });
	if (language.languageId === 'UNKNOWN') {
		return languageId;
	}
	return language.languageId;
}
