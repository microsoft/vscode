/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { startsWith } from 'vs/base/common/strings';
import { CodeAction } from 'vs/editor/common/modes';
import { Position } from 'vs/editor/common/core/position';

export class CodeActionKind {
	private static readonly sep = '.';

	public static readonly Empty = new CodeActionKind('');
	public static readonly QuickFix = new CodeActionKind('quickfix');
	public static readonly Refactor = new CodeActionKind('refactor');
	public static readonly Source = new CodeActionKind('source');
	public static readonly SourceOrganizeImports = new CodeActionKind('source.organizeImports');
	public static readonly SourceFixAll = new CodeActionKind('source.fixAll');

	constructor(
		public readonly value: string
	) { }

	public equals(other: CodeActionKind): boolean {
		return this.value === other.value;
	}

	public contains(other: CodeActionKind): boolean {
		return this.equals(other) || startsWith(other.value, this.value + CodeActionKind.sep);
	}

	public intersects(other: CodeActionKind): boolean {
		return this.contains(other) || other.contains(this);
	}
}

export const enum CodeActionAutoApply {
	IfSingle,
	First,
	Never,
}

export interface CodeActionFilter {
	readonly kind?: CodeActionKind;
	readonly includeSourceActions?: boolean;
	readonly onlyIncludePreferredActions?: boolean;
}

export function mayIncludeActionsOfKind(filter: CodeActionFilter, providedKind: CodeActionKind): boolean {
	// A provided kind may be a subset or superset of our filtered kind.
	if (filter.kind && !filter.kind.intersects(providedKind)) {
		return false;
	}

	// Don't return source actions unless they are explicitly requested
	if (CodeActionKind.Source.contains(providedKind) && !filter.includeSourceActions) {
		return false;
	}

	return true;
}


export function filtersAction(filter: CodeActionFilter, action: CodeAction): boolean {
	const actionKind = action.kind ? new CodeActionKind(action.kind) : undefined;

	// Filter out actions by kind
	if (filter.kind) {
		if (!actionKind || !filter.kind.contains(actionKind)) {
			return false;
		}
	}

	// Don't return source actions unless they are explicitly requested
	if (!filter.includeSourceActions) {
		if (actionKind && CodeActionKind.Source.contains(actionKind)) {
			return false;
		}
	}

	if (filter.onlyIncludePreferredActions) {
		if (!action.isPreferred) {
			return false;
		}
	}

	return true;
}

export interface CodeActionTrigger {
	readonly type: 'auto' | 'manual';
	readonly filter?: CodeActionFilter;
	readonly autoApply?: CodeActionAutoApply;
	readonly context?: {
		readonly notAvailableMessage: string;
		readonly position: Position;
	};
}