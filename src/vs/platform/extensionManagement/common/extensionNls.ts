/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { isObject, isString } from 'vs/base/common/types';
import { ILocalizedString } from 'vs/platform/action/common/action';
import { IExtensionManifest } from 'vs/platform/extensions/common/extensions';
import { localize } from 'vs/nls';

export interface ITranslations {
	[key: string]: string | { message: string; comment: string[] };
}

export function localizeManifest(extensionManifest: IExtensionManifest, translations: ITranslations, fallbackTranslations?: ITranslations): IExtensionManifest {
	try {
		replaceNLStrings(extensionManifest, translations, fallbackTranslations);
	} catch (error) {
		/*Ignore Error*/
	}
	return extensionManifest;
}

/**
 * This routine makes the following assumptions:
 * The root element is an object literal
 */
function replaceNLStrings(extensionManifest: IExtensionManifest, messages: ITranslations, originalMessages?: ITranslations): void {
	const processEntry = (obj: any, key: string | number, command?: boolean) => {
		const value = obj[key];
		if (isString(value)) {
			const str = <string>value;
			const length = str.length;
			if (length > 1 && str[0] === '%' && str[length - 1] === '%') {
				const messageKey = str.substr(1, length - 2);
				let translated = messages[messageKey];
				// If the messages come from a language pack they might miss some keys
				// Fill them from the original messages.
				if (translated === undefined && originalMessages) {
					translated = originalMessages[messageKey];
				}
				const message: string | undefined = typeof translated === 'string' ? translated : translated.message;
				if (message !== undefined) {
					// This branch returns ILocalizedString's instead of Strings so that the Command Palette can contain both the localized and the original value.
					const original = originalMessages?.[messageKey];
					const originalMessage: string | undefined = typeof original === 'string' ? original : original?.message;
					if (
						// if we are translating the title or category of a command
						command && (key === 'title' || key === 'category') &&
						// and the original value is not the same as the translated value
						originalMessage && originalMessage !== message
					) {
						const localizedString: ILocalizedString = {
							value: message,
							original: originalMessage
						};
						obj[key] = localizedString;
					} else {
						obj[key] = message;
					}
				} else {
					console.warn(`[${extensionManifest.name}]: ${localize('missingNLSKey', "Couldn't find message for key {0}.", messageKey)}`);
				}
			}
		} else if (isObject(value)) {
			for (const k in value) {
				if (value.hasOwnProperty(k)) {
					k === 'commands' ? processEntry(value, k, true) : processEntry(value, k, command);
				}
			}
		} else if (Array.isArray(value)) {
			for (let i = 0; i < value.length; i++) {
				processEntry(value, i, command);
			}
		}
	};

	for (const key in extensionManifest) {
		if (extensionManifest.hasOwnProperty(key)) {
			processEntry(extensionManifest, key);
		}
	}
}
