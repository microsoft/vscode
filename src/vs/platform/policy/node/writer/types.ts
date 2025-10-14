/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
export interface Policy {
	readonly name: string;
	readonly type: PolicyType;
	readonly category: Category;
	readonly minimumVersion: string;
	readonly description: NlsString;
	renderJsonValue(): string | number | boolean | object | null;
	renderADMX(regKey: string): string[];
	renderADMLStrings(translations?: LanguageTranslations): string[];
	renderADMLPresentation(): string;
	renderProfile(): string[];
	// https://github.com/ProfileManifests/ProfileManifests/wiki/Manifest-Format
	renderProfileManifest(translations?: LanguageTranslations): string;
}

export enum PolicyType {
	Boolean = 'boolean',
	Number = 'number',
	Object = 'object',
	String = 'string',
	StringEnum = 'stringEnum',
}

export interface Category {
	readonly name: NlsString;
}

export type NlsString = { value: string; nlsKey: string };
export type LanguageTranslations = { [nlsKey: string]: string };
export type Translations = { languageId: string; languageTranslations: LanguageTranslations }[];
export type Version = [number, number, number];
