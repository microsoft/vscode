/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Disposable } from '../../../../base/common/lifecycle.js';
import { ICodeEditor, MouseTargetType } from '../../../../editor/browser/editorBrowser.js';
import { IEditorContribution } from '../../../../editor/common/editorCommon.js';
import { localize, localize2 } from '../../../../nls.js';
import { ContextKeyExpr, IContextKey, IContextKeyService, RawContextKey } from '../../../../platform/contextkey/common/contextkey.js';
import { InlineChatController, State } from './inlineChatController.js';
import { ACTION_START, CTX_INLINE_CHAT_HAS_AGENT, CTX_INLINE_CHAT_VISIBLE } from '../common/inlineChat.js';
import { EditorAction2, ServicesAccessor } from '../../../../editor/browser/editorExtensions.js';
import { EditOperation } from '../../../../editor/common/core/editOperation.js';
import { Range } from '../../../../editor/common/core/range.js';
import { IPosition, Position } from '../../../../editor/common/core/position.js';
import { AbstractInlineChatAction } from './inlineChatActions.js';
import { EditorContextKeys } from '../../../../editor/common/editorContextKeys.js';
import { InjectedTextCursorStops, IValidEditOperation, TrackedRangeStickiness } from '../../../../editor/common/model.js';
import { URI } from '../../../../base/common/uri.js';
import { isEqual } from '../../../../base/common/resources.js';
import { StandardTokenType } from '../../../../editor/common/encodedTokenAttributes.js';
import { autorun, observableFromEvent, observableValue } from '../../../../base/common/observable.js';
import { KeyCode, KeyMod } from '../../../../base/common/keyCodes.js';
import { KeybindingWeight } from '../../../../platform/keybinding/common/keybindingsRegistry.js';
import './media/inlineChat.css';
import { IKeybindingService } from '../../../../platform/keybinding/common/keybinding.js';
import { ICommandService } from '../../../../platform/commands/common/commands.js';
import { InlineCompletionsController } from '../../../../editor/contrib/inlineCompletions/browser/controller/inlineCompletionsController.js';

export const CTX_INLINE_CHAT_SHOWING_HINT = new RawContextKey<boolean>('inlineChatShowingHint', false, localize('inlineChatShowingHint', "Whether inline chat shows a contextual hint"));

const _inlineChatActionId = 'inlineChat.startWithCurrentLine';

export class InlineChatExpandLineAction extends EditorAction2 {

	constructor() {
		super({
			id: _inlineChatActionId,
			category: AbstractInlineChatAction.category,
			title: localize2('startWithCurrentLine', "Start in Editor with Current Line"),
			f1: true,
			precondition: ContextKeyExpr.and(CTX_INLINE_CHAT_VISIBLE.negate(), CTX_INLINE_CHAT_HAS_AGENT, EditorContextKeys.writable),
			keybinding: {
				when: CTX_INLINE_CHAT_SHOWING_HINT,
				weight: KeybindingWeight.WorkbenchContrib + 1,
				primary: KeyMod.CtrlCmd | KeyCode.KeyI
			}
		});
	}

	override async runEditorCommand(_accessor: ServicesAccessor, editor: ICodeEditor) {
		const ctrl = InlineChatController.get(editor);
		if (!ctrl || !editor.hasModel()) {
			return;
		}

		const model = editor.getModel();
		const lineNumber = editor.getSelection().positionLineNumber;
		const lineContent = model.getLineContent(lineNumber);

		const startColumn = model.getLineFirstNonWhitespaceColumn(lineNumber);
		const endColumn = model.getLineMaxColumn(lineNumber);

		// clear the line
		let undoEdits: IValidEditOperation[] = [];
		model.pushEditOperations(null, [EditOperation.replace(new Range(lineNumber, startColumn, lineNumber, endColumn), '')], (edits) => {
			undoEdits = edits;
			return null;
		});

		let lastState: State | undefined;
		const d = ctrl.onDidEnterState(e => lastState = e);

		try {
			// trigger chat
			await ctrl.run({
				autoSend: true,
				message: lineContent.trim(),
				position: new Position(lineNumber, startColumn)
			});

		} finally {
			d.dispose();
		}

		if (lastState === State.CANCEL) {
			model.pushEditOperations(null, undoEdits, () => null);
		}
	}
}

export class ShowInlineChatHintAction extends EditorAction2 {

	constructor() {
		super({
			id: 'inlineChat.showHint',
			category: AbstractInlineChatAction.category,
			title: localize2('showHint', "Show Inline Chat Hint"),
			f1: false,
			precondition: ContextKeyExpr.and(CTX_INLINE_CHAT_VISIBLE.negate(), CTX_INLINE_CHAT_HAS_AGENT, EditorContextKeys.writable),
		});
	}

	override async runEditorCommand(_accessor: ServicesAccessor, editor: ICodeEditor, ...args: [uri: URI, position: IPosition, ...rest: any[]]) {
		if (!editor.hasModel()) {
			return;
		}

		const ctrl = InlineChatHintsController.get(editor);
		if (!ctrl) {
			return;
		}

		const [uri, position] = args;
		if (!URI.isUri(uri) || !Position.isIPosition(position)) {
			ctrl.hide();
			return;
		}

		const model = editor.getModel();
		if (!isEqual(model.uri, uri)) {
			ctrl.hide();
			return;
		}

		model.tokenization.forceTokenization(position.lineNumber);
		const tokens = model.tokenization.getLineTokens(position.lineNumber);
		const tokenIndex = tokens.findTokenIndexAtOffset(position.column - 1);
		const tokenType = tokens.getStandardTokenType(tokenIndex);

		if (tokenType === StandardTokenType.Comment) {
			ctrl.hide();
		} else {
			ctrl.show();
		}
	}
}

export class InlineChatHintsController extends Disposable implements IEditorContribution {

	public static readonly ID = 'editor.contrib.inlineChatHints';

	static get(editor: ICodeEditor): InlineChatHintsController | null {
		return editor.getContribution<InlineChatHintsController>(InlineChatHintsController.ID);
	}

	private readonly _editor: ICodeEditor;
	private readonly _ctxShowingHint: IContextKey<boolean>;
	private readonly _visibilityObs = observableValue<boolean>(this, false);

	constructor(
		editor: ICodeEditor,
		@IContextKeyService contextKeyService: IContextKeyService,
		@ICommandService commandService: ICommandService,
		@IKeybindingService keybindingService: IKeybindingService,
	) {
		super();
		this._editor = editor;
		this._ctxShowingHint = CTX_INLINE_CHAT_SHOWING_HINT.bindTo(contextKeyService);


		const ghostCtrl = InlineCompletionsController.get(editor);

		this._store.add(this._editor.onMouseDown(e => {
			if (e.target.type !== MouseTargetType.CONTENT_TEXT) {
				return;
			}
			if (e.target.detail.injectedText?.options.attachedData !== this) {
				return;
			}
			commandService.executeCommand(_inlineChatActionId);
			this.hide();
		}));

		this._store.add(commandService.onWillExecuteCommand(e => {
			if (e.commandId === _inlineChatActionId) {
				this.hide();
			}
		}));

		const posObs = observableFromEvent(editor.onDidChangeCursorPosition, () => editor.getPosition());

		const decos = this._editor.createDecorationsCollection();

		const keyObs = observableFromEvent(keybindingService.onDidUpdateKeybindings, _ => keybindingService.lookupKeybinding(ACTION_START)?.getLabel());


		this._store.add(autorun(r => {

			const ghostState = ghostCtrl?.model.read(r)?.state.read(r);
			const visible = this._visibilityObs.read(r);
			const kb = keyObs.read(r);
			const position = posObs.read(r);

			// update context key
			this._ctxShowingHint.set(visible);

			if (!visible || !kb || !position || ghostState !== undefined) {
				decos.clear();
				return;
			}

			const column = this._editor.getModel()?.getLineMaxColumn(position.lineNumber);
			if (!column) {
				return;
			}

			const range = Range.fromPositions(position);

			decos.set([{
				range,
				options: {
					description: 'inline-chat-hint-line',
					showIfCollapsed: true,
					stickiness: TrackedRangeStickiness.NeverGrowsWhenTypingAtEdges,
					after: {
						inlineClassName: 'inline-chat-hint',
						content: '\u00A0' + localize('ddd', "{0} to chat", kb),
						inlineClassNameAffectsLetterSpacing: true,
						cursorStops: InjectedTextCursorStops.Both,
						attachedData: this
					}
				}
			}]);
		}));
	}

	show(): void {
		this._visibilityObs.set(true, undefined);
	}

	hide(): void {
		this._visibilityObs.set(false, undefined);
	}
}

export class HideInlineChatHintAction extends EditorAction2 {

	constructor() {
		super({
			id: 'inlineChat.hideHint',
			title: localize2('hideHint', "Hide Inline Chat Hint"),
			precondition: CTX_INLINE_CHAT_SHOWING_HINT,
			keybinding: {
				weight: KeybindingWeight.EditorContrib - 10,
				primary: KeyCode.Escape
			}
		});
	}

	override async runEditorCommand(_accessor: ServicesAccessor, editor: ICodeEditor): Promise<void> {
		InlineChatHintsController.get(editor)?.hide();
	}
}
