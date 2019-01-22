/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { startsWith } from 'vs/base/common/strings';

export class CodeActionKind {
	private static readonly sep = '.';

	public static readonly Empty = new CodeActionKind('');
	public static readonly QuickFix = new CodeActionKind('quickfix');
	public static readonly Refactor = new CodeActionKind('refactor');
	public static readonly Source = new CodeActionKind('source');
	public static readonly SourceOrganizeImports = new CodeActionKind('source.organizeImports');

	constructor(
		public readonly value: string
	) { }

	public contains(other: CodeActionKind): boolean {
		return this.value === other.value || startsWith(other.value, this.value + CodeActionKind.sep);
	}

	public intersects(other: CodeActionKind): boolean {
		return this.contains(other) || other.contains(this);
	}
}

export const enum CodeActionAutoApply {
	IfSingle,
	First,
	Preferred,
	Never,
}

export interface CodeActionFilter {
	readonly kind?: CodeActionKind;
	readonly includeSourceActions?: boolean;
	readonly onlyIncludePreferredActions?: boolean;
}

export interface CodeActionTrigger {
	readonly type: 'auto' | 'manual';
	readonly filter?: CodeActionFilter;
	readonly autoApply?: CodeActionAutoApply;
}