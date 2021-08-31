/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Code } from './code';
import { ILocalizedStrings, ILocaleInfo } from './driver';

export class Localization {
	constructor(private code: Code) { }

	async getLocaleInfo(): Promise<ILocaleInfo> {
		return this.code.getLocaleInfo();
	}

	async getLocalizedStrings(): Promise<ILocalizedStrings> {
		return this.code.getLocalizedStrings();
	}
}
