/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { startsWith } from 'vs/base/common/strings';

export class CodeActionScope {
	private static readonly sep = '.';

	constructor(
		public readonly value: string
	) { }

	public contains(other: string): boolean {
		return this.value === other || startsWith(other, this.value + CodeActionScope.sep);
	}
}