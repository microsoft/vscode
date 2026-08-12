/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Disposable, toDisposable } from '../../../../base/common/lifecycle.js';
import { KeyCode } from '../../../../base/common/keyCodes.js';
import { ICodeEditor, MouseTargetType } from '../../../../editor/browser/editorBrowser.js';
import { Position } from '../../../../editor/common/core/position.js';
import { Selection } from '../../../../editor/common/core/selection.js';
import { IEditorDecorationsCollection } from '../../../../editor/common/editorCommon.js';
import { localize } from '../../../../nls.js';
import { IContextKey, RawContextKey } from '../../../../platform/contextkey/common/contextkey.js';
import { KeybindingsRegistry, KeybindingWeight } from '../../../../platform/keybinding/common/keybindingsRegistry.js';

export const REPLACE_PROMPT_TEMPLATE_PLACEHOLDER_COMMAND_ID = 'sessions.chat.replacePromptTemplatePlaceholder';
const PromptTemplatePlaceholderFocused = new RawContextKey<boolean>('sessionsPromptTemplatePlaceholderFocused', false, localize('sessionsPromptTemplatePlaceholderFocused', "Whether the caret is inside an editable prompt template placeholder."));
let activePromptTemplatePlaceholderController: PromptTemplatePlaceholderController | undefined;

KeybindingsRegistry.registerCommandAndKeybindingRule({
	id: REPLACE_PROMPT_TEMPLATE_PLACEHOLDER_COMMAND_ID,
	weight: KeybindingWeight.WorkbenchContrib + 2,
	when: PromptTemplatePlaceholderFocused,
	primary: KeyCode.Enter,
	handler: () => activePromptTemplatePlaceholderController?.replaceAtCursor(),
});

/** Highlights and replaces the editable task placeholder in an onboarding prompt. */
export class PromptTemplatePlaceholderController extends Disposable {
	private static readonly _className = 'sessions-prompt-template-placeholder';

	private readonly _decorations: IEditorDecorationsCollection;
	private readonly _focusedContextKey: IContextKey<boolean>;
	private _placeholder: string | undefined;
	private _wasPresent = false;

	constructor(
		private readonly _editor: ICodeEditor,
		private readonly _onWillReplace: () => void,
	) {
		super();
		this._decorations = this._editor.createDecorationsCollection();
		this._focusedContextKey = PromptTemplatePlaceholderFocused.bindTo(this._editor.contextKeyService);
		this._register(toDisposable(() => this._decorations.clear()));
		this._register(toDisposable(() => {
			this._focusedContextKey.reset();
			if (activePromptTemplatePlaceholderController === this) {
				activePromptTemplatePlaceholderController = undefined;
			}
		}));
		this._register(this._editor.onDidChangeModelContent(() => {
			this._updateDecorations();
			this._updateActiveState();
		}));
		this._register(this._editor.onDidChangeCursorPosition(() => this._updateActiveState()));
		this._register(this._editor.onDidFocusEditorWidget(() => this._updateActiveState()));
		this._register(this._editor.onDidBlurEditorWidget(() => this._updateActiveState()));
		this._register(this._editor.onMouseUp(event => {
			if (!event.event.leftButton || event.target.type !== MouseTargetType.CONTENT_TEXT || !this._editor.getSelection()?.isEmpty()) {
				return;
			}
			this.replaceAt(event.target.position);
		}));
	}

	setPlaceholder(placeholder: string | undefined): void {
		this._placeholder = placeholder;
		this._wasPresent = false;
		this._updateDecorations();
		this._updateActiveState();
	}

	replaceAtCursor(): boolean {
		const position = this._editor.getPosition();
		return position ? this.replaceAt(position) : false;
	}

	replaceAt(position: Position): boolean {
		if (!this._contains(position)) {
			return false;
		}

		this._onWillReplace();
		const model = this._editor.getModel();
		const range = this._decorations.getRange(0);
		if (!model || !range || !this._placeholder || !this._contains(position) || model.getValueInRange(range) !== this._placeholder) {
			return false;
		}

		const start = range.getStartPosition();
		this._editor.pushUndoStop();
		const edited = this._editor.executeEdits('sessions.promptTemplatePlaceholder', [{ range, text: '' }], [Selection.fromPositions(start)]);
		if (edited) {
			this._editor.pushUndoStop();
			this._editor.focus();
		}
		this._updateActiveState();
		return edited;
	}

	private _updateActiveState(): void {
		const position = this._editor.getPosition();
		const active = this._editor.hasTextFocus() && !!position && this._contains(position);
		this._focusedContextKey.set(active);
		if (active) {
			activePromptTemplatePlaceholderController = this;
		} else if (activePromptTemplatePlaceholderController === this) {
			activePromptTemplatePlaceholderController = undefined;
		}
	}

	private _contains(position: Position): boolean {
		const model = this._editor.getModel();
		const range = this._decorations.getRange(0);
		if (!model || !range) {
			return false;
		}

		const offset = model.getOffsetAt(position);
		return offset >= model.getOffsetAt(range.getStartPosition()) && offset < model.getOffsetAt(range.getEndPosition());
	}

	private _updateDecorations(): void {
		const model = this._editor.getModel();
		const match = this._placeholder && model
			? model.findMatches(this._placeholder, model.getFullModelRange(), false, true, null, false, 1)[0]
			: undefined;
		if (!match) {
			this._decorations.clear();
			if (this._wasPresent) {
				this._placeholder = undefined;
			}
			return;
		}

		this._wasPresent = true;
		this._decorations.set([{
			range: match.range,
			options: {
				description: 'sessions-prompt-template-placeholder',
				inlineClassName: PromptTemplatePlaceholderController._className,
				hoverMessage: { value: localize('sessions.promptTemplatePlaceholder.hover', "Click or place the caret here and press Enter to describe the coding task") },
			},
		}]);
	}
}
