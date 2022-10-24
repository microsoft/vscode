/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { ResolvedKeybinding } from 'vs/base/common/keybindings';
import { Lazy } from 'vs/base/common/lazy';
import { CodeAction } from 'vs/editor/common/languages';
import { codeActionCommandId, fixAllCommandId, organizeImportsCommandId, refactorCommandId, sourceActionCommandId } from 'vs/editor/contrib/codeAction/browser/codeAction';
import { CodeActionAutoApply, CodeActionCommandArgs, CodeActionKind } from 'vs/editor/contrib/codeAction/common/types';
import { IKeybindingService } from 'vs/platform/keybinding/common/keybinding';

export interface ResolveCodeActionKeybinding {
	readonly kind: CodeActionKind;
	readonly preferred: boolean;
	readonly resolvedKeybinding: ResolvedKeybinding;
}

export class CodeActionKeybindingResolver {
	private static readonly codeActionCommands: readonly string[] = [
		refactorCommandId,
		codeActionCommandId,
		sourceActionCommandId,
		organizeImportsCommandId,
		fixAllCommandId
	];

	constructor(
		private readonly keybindingService: IKeybindingService
	) { }

	public getResolver(): (action: CodeAction) => ResolvedKeybinding | undefined {
		// Lazy since we may not actually ever read the value
		const allCodeActionBindings = new Lazy<readonly ResolveCodeActionKeybinding[]>(() => this.keybindingService.getKeybindings()
			.filter(item => CodeActionKeybindingResolver.codeActionCommands.indexOf(item.command!) >= 0)
			.filter(item => item.resolvedKeybinding)
			.map((item): ResolveCodeActionKeybinding => {
				// Special case these commands since they come built-in with VS Code and don't use 'commandArgs'
				let commandArgs = item.commandArgs;
				if (item.command === organizeImportsCommandId) {
					commandArgs = { kind: CodeActionKind.SourceOrganizeImports.value };
				} else if (item.command === fixAllCommandId) {
					commandArgs = { kind: CodeActionKind.SourceFixAll.value };
				}

				return {
					resolvedKeybinding: item.resolvedKeybinding!,
					...CodeActionCommandArgs.fromUser(commandArgs, {
						kind: CodeActionKind.None,
						apply: CodeActionAutoApply.Never
					})
				};
			}));

		return (action) => {
			if (action.kind) {
				const binding = this.bestKeybindingForCodeAction(action, allCodeActionBindings.getValue());
				return binding?.resolvedKeybinding;
			}
			return undefined;
		};
	}

	private bestKeybindingForCodeAction(
		action: CodeAction,
		candidates: readonly ResolveCodeActionKeybinding[]
	): ResolveCodeActionKeybinding | undefined {
		if (!action.kind) {
			return undefined;
		}
		const kind = new CodeActionKind(action.kind);

		return candidates
			.filter(candidate => candidate.kind.contains(kind))
			.filter(candidate => {
				if (candidate.preferred) {
					// If the candidate keybinding only applies to preferred actions, the this action must also be preferred
					return action.isPreferred;
				}
				return true;
			})
			.reduceRight((currentBest, candidate) => {
				if (!currentBest) {
					return candidate;
				}
				// Select the more specific binding
				return currentBest.kind.contains(candidate.kind) ? candidate : currentBest;
			}, undefined as ResolveCodeActionKeybinding | undefined);
	}
}
