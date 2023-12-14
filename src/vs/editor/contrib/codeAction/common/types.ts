/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { CancellationToken } from 'vs/base/common/cancellation';
import { onUnexpectedExternalError } from 'vs/base/common/errors';
import { Position } from 'vs/editor/common/core/position';
import * as languages from 'vs/editor/common/languages';
import { ActionSet } from 'vs/platform/actionWidget/common/actionWidget';

export class CodeActionKind {
	private static readonly sep = '.';

	public static readonly None = new CodeActionKind('@@none@@'); // Special code action that contains nothing
	public static readonly Empty = new CodeActionKind('');
	public static readonly QuickFix = new CodeActionKind('quickfix');
	public static readonly Refactor = new CodeActionKind('refactor');
	public static readonly RefactorExtract = CodeActionKind.Refactor.append('extract');
	public static readonly RefactorInline = CodeActionKind.Refactor.append('inline');
	public static readonly RefactorMove = CodeActionKind.Refactor.append('move');
	public static readonly RefactorRewrite = CodeActionKind.Refactor.append('rewrite');
	public static readonly Notebook = new CodeActionKind('notebook');
	public static readonly Source = new CodeActionKind('source');
	public static readonly SourceOrganizeImports = CodeActionKind.Source.append('organizeImports');
	public static readonly SourceFixAll = CodeActionKind.Source.append('fixAll');
	public static readonly SurroundWith = CodeActionKind.Refactor.append('surround');

	constructor(
		public readonly value: string
	) { }

	public equals(other: CodeActionKind): boolean {
		return this.value === other.value;
	}

	public contains(other: CodeActionKind): boolean {
		return this.equals(other) || this.value === '' || other.value.startsWith(this.value + CodeActionKind.sep);
	}

	public intersects(other: CodeActionKind): boolean {
		return this.contains(other) || other.contains(this);
	}

	public append(part: string): CodeActionKind {
		return new CodeActionKind(this.value + CodeActionKind.sep + part);
	}
}

export const enum CodeActionAutoApply {
	IfSingle = 'ifSingle',
	First = 'first',
	Never = 'never',
}

export enum CodeActionTriggerSource {
	Refactor = 'refactor',
	RefactorPreview = 'refactor preview',
	Lightbulb = 'lightbulb',
	Default = 'other (default)',
	SourceAction = 'source action',
	QuickFix = 'quick fix action',
	FixAll = 'fix all',
	OrganizeImports = 'organize imports',
	AutoFix = 'auto fix',
	QuickFixHover = 'quick fix hover window',
	OnSave = 'save participants',
	ProblemsView = 'problems view'
}

export interface CodeActionFilter {
	readonly include?: CodeActionKind;
	readonly excludes?: readonly CodeActionKind[];
	readonly includeSourceActions?: boolean;
	readonly onlyIncludePreferredActions?: boolean;
}

export function mayIncludeActionsOfKind(filter: CodeActionFilter, providedKind: CodeActionKind): boolean {
	// A provided kind may be a subset or superset of our filtered kind.
	if (filter.include && !filter.include.intersects(providedKind)) {
		return false;
	}

	if (filter.excludes) {
		if (filter.excludes.some(exclude => excludesAction(providedKind, exclude, filter.include))) {
			return false;
		}
	}

	// Don't return source actions unless they are explicitly requested
	if (!filter.includeSourceActions && CodeActionKind.Source.contains(providedKind)) {
		return false;
	}

	return true;
}

export function filtersAction(filter: CodeActionFilter, action: languages.CodeAction): boolean {
	const actionKind = action.kind ? new CodeActionKind(action.kind) : undefined;

	// Filter out actions by kind
	if (filter.include) {
		if (!actionKind || !filter.include.contains(actionKind)) {
			return false;
		}
	}

	if (filter.excludes) {
		if (actionKind && filter.excludes.some(exclude => excludesAction(actionKind, exclude, filter.include))) {
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

function excludesAction(providedKind: CodeActionKind, exclude: CodeActionKind, include: CodeActionKind | undefined): boolean {
	if (!exclude.contains(providedKind)) {
		return false;
	}
	if (include && exclude.contains(include)) {
		// The include is more specific, don't filter out
		return false;
	}
	return true;
}

export interface CodeActionTrigger {
	readonly type: languages.CodeActionTriggerType;
	readonly triggerAction: CodeActionTriggerSource;
	readonly filter?: CodeActionFilter;
	readonly autoApply?: CodeActionAutoApply;
	readonly context?: {
		readonly notAvailableMessage: string;
		readonly position: Position;
	};
}

export class CodeActionCommandArgs {
	public static fromUser(arg: any, defaults: { kind: CodeActionKind; apply: CodeActionAutoApply }): CodeActionCommandArgs {
		if (!arg || typeof arg !== 'object') {
			return new CodeActionCommandArgs(defaults.kind, defaults.apply, false);
		}
		return new CodeActionCommandArgs(
			CodeActionCommandArgs.getKindFromUser(arg, defaults.kind),
			CodeActionCommandArgs.getApplyFromUser(arg, defaults.apply),
			CodeActionCommandArgs.getPreferredUser(arg));
	}

	private static getApplyFromUser(arg: any, defaultAutoApply: CodeActionAutoApply) {
		switch (typeof arg.apply === 'string' ? arg.apply.toLowerCase() : '') {
			case 'first': return CodeActionAutoApply.First;
			case 'never': return CodeActionAutoApply.Never;
			case 'ifsingle': return CodeActionAutoApply.IfSingle;
			default: return defaultAutoApply;
		}
	}

	private static getKindFromUser(arg: any, defaultKind: CodeActionKind) {
		return typeof arg.kind === 'string'
			? new CodeActionKind(arg.kind)
			: defaultKind;
	}

	private static getPreferredUser(arg: any): boolean {
		return typeof arg.preferred === 'boolean'
			? arg.preferred
			: false;
	}

	private constructor(
		public readonly kind: CodeActionKind,
		public readonly apply: CodeActionAutoApply,
		public readonly preferred: boolean,
	) { }
}

export class CodeActionItem {

	constructor(
		public readonly action: languages.CodeAction,
		public readonly provider: languages.CodeActionProvider | undefined,
		public highlightRange?: boolean,
	) { }

	async resolve(token: CancellationToken): Promise<this> {
		if (this.provider?.resolveCodeAction && !this.action.edit) {
			let action: languages.CodeAction | undefined | null;
			try {
				action = await this.provider.resolveCodeAction(this.action, token);
			} catch (err) {
				onUnexpectedExternalError(err);
			}
			if (action) {
				this.action.edit = action.edit;
			}
		}
		return this;
	}
}

export interface CodeActionSet extends ActionSet<CodeActionItem> {
	readonly validActions: readonly CodeActionItem[];
	readonly allActions: readonly CodeActionItem[];

	readonly documentation: readonly languages.Command[];
}
