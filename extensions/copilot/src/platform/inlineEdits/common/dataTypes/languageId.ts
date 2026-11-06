/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

export type LanguageId = string & { _brand: 'languageId' };

export namespace LanguageId {
	export const PlainText = create('plaintext');

	export function create(value: string): LanguageId {
		return value as LanguageId;
	}
}
