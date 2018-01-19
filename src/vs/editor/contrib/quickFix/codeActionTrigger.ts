/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { startsWith } from 'vs/base/common/strings';

export class CodeActionKind {
	private static readonly sep = '.';

	public static readonly Empty = new CodeActionKind('');

	constructor(
		public readonly value: string
	) { }

	public contains(other: string): boolean {
		return this.value === other || startsWith(other, this.value + CodeActionKind.sep);
	}
}

export interface CodeActionTrigger {
	type: 'auto' | 'manual';
	scope?: CodeActionKind;
	autoApply?: boolean;
}