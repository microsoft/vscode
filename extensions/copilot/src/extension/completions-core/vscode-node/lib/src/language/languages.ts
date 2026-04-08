/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { knownLanguages } from './generatedLanguages';

export const knownTemplateLanguageExtensions = [
	'.ejs',
	'.erb',
	'.haml',
	'.hbs',
	'.j2',
	'.jinja',
	'.jinja2',
	'.liquid',
	'.mustache',
	'.njk',
	'.php',
	'.pug',
	'.slim',
	'.webc',
];

export const templateLanguageLimitations: { [extension: string]: string[] } = {
	'.php': ['.blade'],
};

export type LanguageInfo = {
	extensions: string[];
	filenames?: string[];
};

export const knownFileExtensions = Object.keys(knownLanguages).flatMap(language => knownLanguages[language].extensions);