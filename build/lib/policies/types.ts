/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

export interface ProductJson {
	readonly nameLong: string;
	readonly darwinBundleIdentifier: string;
	readonly darwinProfilePayloadUUID: string;
	readonly darwinProfileUUID: string;
	readonly win32RegValueName: string;
	readonly extensionsGallery?: {
		readonly serviceUrl: string;
		readonly resourceUrlTemplate: string;
	};
}

export interface Policy {
	readonly name: string;
	readonly type: PolicyType;
	readonly category: Category;
	readonly minimumVersion: string;
	renderADMX(regKey: string): string[];
	renderADMLStrings(translations?: LanguageTranslations): string[];
	renderADMLPresentation(): string;
	renderJsonValue(): string | number | boolean | object | null;
	renderProfile(): string[];
	// https://github.com/ProfileManifests/ProfileManifests/wiki/Manifest-Format
	renderProfileManifest(translations?: LanguageTranslations): string;
}

export type NlsString = { value: string; nlsKey: string };

export interface Category {
	readonly moduleName: string;
	readonly name: NlsString;
}

export const PolicyType = Object.freeze({
	Boolean: 'boolean',
	Number: 'number',
	Object: 'object',
	String: 'string',
	StringEnum: 'stringEnum',
});
export type PolicyType = typeof PolicyType[keyof typeof PolicyType];

export const Languages = {
	'fr': 'fr-fr',
	'it': 'it-it',
	'de': 'de-de',
	'es': 'es-es',
	'ru': 'ru-ru',
	'zh-hans': 'zh-cn',
	'zh-hant': 'zh-tw',
	'ja': 'ja-jp',
	'ko': 'ko-kr',
	'cs': 'cs-cz',
	'pt-br': 'pt-br',
	'tr': 'tr-tr',
	'pl': 'pl-pl',
};

export type LanguageTranslations = { [moduleName: string]: { [nlsKey: string]: string } };
export type Translations = { languageId: string; languageTranslations: LanguageTranslations }[];

export type Version = [number, number, number];
