/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { getDomNodePagePosition } from 'vs/base/browser/dom';
import { IAnchor } from 'vs/base/browser/ui/contextview/contextview';
import { Action } from 'vs/base/common/actions';
import { canceled } from 'vs/base/common/errors';
import { ResolvedKeybinding } from 'vs/base/common/keyCodes';
import { Lazy } from 'vs/base/common/lazy';
import { Disposable, MutableDisposable } from 'vs/base/common/lifecycle';
import { ICodeEditor } from 'vs/editor/browser/editorBrowser';
import { IPosition, Position } from 'vs/editor/common/core/position';
import { ScrollType } from 'vs/editor/common/editorCommon';
import { CodeAction } from 'vs/editor/common/modes';
import { CodeActionSet, refactorCommandId, sourceActionCommandId, codeActionCommandId, organizeImportsCommandId, fixAllCommandId } from 'vs/editor/contrib/codeAction/codeAction';
import { CodeActionAutoApply, CodeActionCommandArgs, CodeActionKind } from 'vs/editor/contrib/codeAction/codeActionTrigger';
import { IContextMenuService } from 'vs/platform/contextview/browser/contextView';
import { IKeybindingService } from 'vs/platform/keybinding/common/keybinding';

interface CodeActionWidgetDelegate {
	onSelectCodeAction: (action: CodeAction) => Promise<any>;
}

interface ResolveCodeActionKeybinding {
	readonly kind: CodeActionKind;
	readonly preferred: boolean;
	readonly resolvedKeybinding: ResolvedKeybinding;
}

class CodeActionAction extends Action {
	constructor(
		public readonly action: CodeAction,
		callback: () => Promise<void>,
	) {
		super(action.command ? action.command.id : action.title, action.title, undefined, true, callback);
	}
}

export class CodeActionWidget extends Disposable {

	private _visible: boolean = false;
	private readonly _showingActions = this._register(new MutableDisposable<CodeActionSet>());

	constructor(
		private readonly _editor: ICodeEditor,
		private readonly _contextMenuService: IContextMenuService,
		private readonly _keybindingService: IKeybindingService,
		private readonly _delegate: CodeActionWidgetDelegate,
	) {
		super();
	}

	get isVisible(): boolean {
		return this._visible;
	}

	public async show(codeActions: CodeActionSet, at?: IAnchor | IPosition): Promise<void> {
		if (!codeActions.actions.length) {
			this._visible = false;
			return;
		}
		if (!this._editor.getDomNode()) {
			// cancel when editor went off-dom
			this._visible = false;
			return Promise.reject(canceled());
		}

		this._visible = true;

		const actions = codeActions.actions.map(action =>
			new CodeActionAction(action, () => this._delegate.onSelectCodeAction(action)));

		const keyBindings = this.resolveKeybindings(actions);

		this._showingActions.value = codeActions;
		this._contextMenuService.showContextMenu({
			getAnchor: () => {
				if (Position.isIPosition(at)) {
					at = this._toCoords(at);
				}
				return at || { x: 0, y: 0 };
			},
			getActions: () => actions,
			onHide: () => {
				this._visible = false;
				this._editor.focus();
			},
			autoSelectFirstItem: true,
			getKeyBinding: (action): ResolvedKeybinding | undefined => {
				return action instanceof CodeActionAction ? keyBindings.get(action) : undefined;
			},
		});
	}

	private resolveKeybindings(actions: readonly CodeActionAction[]): Map<CodeActionAction, ResolvedKeybinding> {
		const codeActionCommands = new Set([
			refactorCommandId,
			codeActionCommandId,
			sourceActionCommandId,
			organizeImportsCommandId,
			fixAllCommandId
		]);

		// Lazy since we may not actually ever read the value
		const allCodeActionBindings = new Lazy<readonly ResolveCodeActionKeybinding[]>(() =>
			this._keybindingService.getKeybindings()
				.filter(item => codeActionCommands.has(item.command!))
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

		const out = new Map<CodeActionAction, ResolvedKeybinding>();
		for (const action of actions) {
			if (action.action.kind) {
				const binding = this.bestKeybindingForCodeAction(action.action, allCodeActionBindings.getValue());
				if (binding) {
					out.set(action, binding.resolvedKeybinding);
				}
			}
		}
		return out;
	}

	private bestKeybindingForCodeAction(
		action: CodeAction,
		candidates: readonly ResolveCodeActionKeybinding[],
	): ResolveCodeActionKeybinding | undefined {
		if (!action.kind) {
			return undefined;
		}
		const kind = new CodeActionKind(action.kind);

		return candidates
			.filter(candidate => candidate.kind.contains(kind))
			.filter(candidate => {
				if (candidate.preferred && !action.isPreferred) {
					// The candidate keybinding only applies to preferred actions, and this action is not preferred
					return false;
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

	private _toCoords(position: IPosition): { x: number, y: number } {
		if (!this._editor.hasModel()) {
			return { x: 0, y: 0 };
		}
		this._editor.revealPosition(position, ScrollType.Immediate);
		this._editor.render();

		// Translate to absolute editor position
		const cursorCoords = this._editor.getScrolledVisiblePosition(position);
		const editorCoords = getDomNodePagePosition(this._editor.getDomNode());
		const x = editorCoords.left + cursorCoords.left;
		const y = editorCoords.top + cursorCoords.top + cursorCoords.height;

		return { x, y };
	}
}
