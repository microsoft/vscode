/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Code } from './code';
import { ILocalizedStrings } from './driver';

export class Localization {
	constructor(private code: Code) { }

	async getLocalizedStrings(): Promise<ILocalizedStrings> {
		return this.code.getLocalizedStrings();
	}
}
