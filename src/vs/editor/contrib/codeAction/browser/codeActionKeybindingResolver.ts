/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { HierarchicalKind } from '../../../../base/common/hierarchicalKind.js';
import { ResolvedKeybinding } from '../../../../base/common/keybindings.js';
import { Lazy } from '../../../../base/common/lazy.js';
import { CodeAction } from '../../../common/languages.js';
import { codeActionCommandId, fixAllCommandId, organizeImportsCommandId, refactorCommandId, sourceActionCommandId } from './codeAction.js';
import { CodeActionAutoApply, CodeActionCommandArgs, CodeActionKind } from '../common/types.js';
import { IKeybindingService } from '../../../../platform/keybinding/common/keybinding.js';

interface ResolveCodeActionKeybinding {
	readonly kind: HierarchicalKind;
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
		@IKeybindingService private readonly keybindingService: IKeybindingService
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
						kind: HierarchicalKind.None,
						apply: CodeActionAutoApply.Never
					})
				};
			}));

		return (action) => {
			if (action.kind) {
				const binding = this.bestKeybindingForCodeAction(action, allCodeActionBindings.value);
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
		const kind = new HierarchicalKind(action.kind);

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
