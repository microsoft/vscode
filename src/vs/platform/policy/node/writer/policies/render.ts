/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { LanguageTranslations, NlsString } from '../types.js';

export function renderADMLString(prefix: string, nlsString: NlsString, translations?: LanguageTranslations): string {
	let value: string | undefined;

	if (translations) {
		value = translations[nlsString.nlsKey];
	}

	if (!value) {
		value = nlsString.value;
	}

	return `<string id="${prefix}_${nlsString.nlsKey.replace(/\./g, '_')}">${value}</string>`;
}

export function renderProfileString(_prefix: string, nlsString: NlsString, translations?: LanguageTranslations): string {
	let value: string | undefined;

	if (translations) {
		value = translations[nlsString.nlsKey];
	}

	if (!value) {
		value = nlsString.value;
	}

	return value;
}
