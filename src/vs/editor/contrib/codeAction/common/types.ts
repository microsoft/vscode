/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { CancellationToken } from 'vs/base/common/cancellation';
import { onUnexpectedExternalError } from 'vs/base/common/errors';
import { HierarchicalKind } from 'vs/base/common/hierarchicalKind';
import { Position } from 'vs/editor/common/core/position';
import * as languages from 'vs/editor/common/languages';
import { ActionSet } from 'vs/platform/actionWidget/common/actionWidget';

export const CodeActionKind = new class {
	public readonly QuickFix = new HierarchicalKind('quickfix');

	public readonly Refactor = new HierarchicalKind('refactor');
	public readonly RefactorExtract = this.Refactor.append('extract');
	public readonly RefactorInline = this.Refactor.append('inline');
	public readonly RefactorMove = this.Refactor.append('move');
	public readonly RefactorRewrite = this.Refactor.append('rewrite');

	public readonly Notebook = new HierarchicalKind('notebook');

	public readonly Source = new HierarchicalKind('source');
	public readonly SourceOrganizeImports = this.Source.append('organizeImports');
	public readonly SourceFixAll = this.Source.append('fixAll');
	public readonly SurroundWith = this.Refactor.append('surround');
};

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
	readonly include?: HierarchicalKind;
	readonly excludes?: readonly HierarchicalKind[];
	readonly includeSourceActions?: boolean;
	readonly onlyIncludePreferredActions?: boolean;
}

export function mayIncludeActionsOfKind(filter: CodeActionFilter, providedKind: HierarchicalKind): boolean {
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
	const actionKind = action.kind ? new HierarchicalKind(action.kind) : undefined;

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

function excludesAction(providedKind: HierarchicalKind, exclude: HierarchicalKind, include: HierarchicalKind | undefined): boolean {
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
	public static fromUser(arg: any, defaults: { kind: HierarchicalKind; apply: CodeActionAutoApply }): CodeActionCommandArgs {
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

	private static getKindFromUser(arg: any, defaultKind: HierarchicalKind) {
		return typeof arg.kind === 'string'
			? new HierarchicalKind(arg.kind)
			: defaultKind;
	}

	private static getPreferredUser(arg: any): boolean {
		return typeof arg.preferred === 'boolean'
			? arg.preferred
			: false;
	}

	private constructor(
		public readonly kind: HierarchicalKind,
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
