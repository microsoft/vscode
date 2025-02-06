/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Disposable, MutableDisposable } from '../../../../base/common/lifecycle.js';
import { ICodeEditor, MouseTargetType } from '../../../../editor/browser/editorBrowser.js';
import { IEditorContribution } from '../../../../editor/common/editorCommon.js';
import { localize, localize2 } from '../../../../nls.js';
import { ContextKeyExpr, IContextKey, IContextKeyService, RawContextKey } from '../../../../platform/contextkey/common/contextkey.js';
import { InlineChatController } from './inlineChatController.js';
import { ACTION_START, CTX_INLINE_CHAT_HAS_AGENT, CTX_INLINE_CHAT_VISIBLE, InlineChatConfigKeys } from '../common/inlineChat.js';
import { EditorAction2, ServicesAccessor } from '../../../../editor/browser/editorExtensions.js';
import { EditOperation } from '../../../../editor/common/core/editOperation.js';
import { Range } from '../../../../editor/common/core/range.js';
import { IPosition, Position } from '../../../../editor/common/core/position.js';
import { AbstractInlineChatAction } from './inlineChatActions.js';
import { EditorContextKeys } from '../../../../editor/common/editorContextKeys.js';
import { IValidEditOperation, TrackedRangeStickiness } from '../../../../editor/common/model.js';
import { URI } from '../../../../base/common/uri.js';
import { isEqual } from '../../../../base/common/resources.js';
import { StandardTokenType } from '../../../../editor/common/encodedTokenAttributes.js';
import { autorun, derived, observableFromEvent, observableValue } from '../../../../base/common/observable.js';
import { KeyChord, KeyCode, KeyMod } from '../../../../base/common/keyCodes.js';
import { KeybindingWeight } from '../../../../platform/keybinding/common/keybindingsRegistry.js';
import './media/inlineChat.css';
import { IKeybindingService } from '../../../../platform/keybinding/common/keybinding.js';
import { ICommandService } from '../../../../platform/commands/common/commands.js';
import { InlineCompletionsController } from '../../../../editor/contrib/inlineCompletions/browser/controller/inlineCompletionsController.js';
import { ChatAgentLocation, IChatAgentService } from '../../chat/common/chatAgents.js';
import { IMarkerDecorationsService } from '../../../../editor/common/services/markerDecorations.js';
import { IContextMenuService } from '../../../../platform/contextview/browser/contextView.js';
import { toAction } from '../../../../base/common/actions.js';
import { IMouseEvent } from '../../../../base/browser/mouseEvent.js';
import { IConfigurationService } from '../../../../platform/configuration/common/configuration.js';
import { observableCodeEditor } from '../../../../editor/browser/observableCodeEditor.js';
import { PLAINTEXT_LANGUAGE_ID } from '../../../../editor/common/languages/modesRegistry.js';
import { createStyleSheet2 } from '../../../../base/browser/domStylesheets.js';
import { stringValue } from '../../../../base/browser/cssValue.js';
import { observableConfigValue } from '../../../../platform/observable/common/platformObservableUtils.js';

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
			keybinding: [{
				when: CTX_INLINE_CHAT_SHOWING_HINT,
				weight: KeybindingWeight.WorkbenchContrib + 1,
				primary: KeyMod.CtrlCmd | KeyCode.KeyI
			}, {
				weight: KeybindingWeight.WorkbenchContrib,
				primary: KeyChord(KeyMod.CtrlCmd | KeyCode.KeyK, KeyCode.KeyI),
			}]
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

		// trigger chat
		const accepted = await ctrl.run({
			autoSend: true,
			message: lineContent.trim(),
			position: new Position(lineNumber, startColumn)
		});

		if (!accepted) {
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

		let totalLength = 0;
		let specialLength = 0;
		let lastTokenType: StandardTokenType | undefined;

		tokens.forEach(idx => {
			const tokenType = tokens.getStandardTokenType(idx);
			const startOffset = tokens.getStartOffset(idx);
			const endOffset = tokens.getEndOffset(idx);
			totalLength += endOffset - startOffset;

			if (tokenType !== StandardTokenType.Other) {
				specialLength += endOffset - startOffset;
			}
			lastTokenType = tokenType;
		});

		if (specialLength / totalLength > 0.25) {
			ctrl.hide();
			return;
		}
		if (lastTokenType === StandardTokenType.Comment) {
			ctrl.hide();
			return;
		}
		ctrl.show();
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
		@IChatAgentService chatAgentService: IChatAgentService,
		@IMarkerDecorationsService markerDecorationService: IMarkerDecorationsService,
		@IContextMenuService private readonly _contextMenuService: IContextMenuService,
		@IConfigurationService private readonly _configurationService: IConfigurationService
	) {
		super();
		this._editor = editor;
		this._ctxShowingHint = CTX_INLINE_CHAT_SHOWING_HINT.bindTo(contextKeyService);

		const ghostCtrl = InlineCompletionsController.get(editor);

		this._store.add(commandService.onWillExecuteCommand(e => {
			if (e.commandId === _inlineChatActionId || e.commandId === ACTION_START) {
				this.hide();
			}
		}));

		this._store.add(this._editor.onMouseDown(e => {
			if (e.target.type !== MouseTargetType.CONTENT_TEXT) {
				return;
			}
			if (!e.target.element?.classList.contains('inline-chat-hint-text')) {
				return;
			}
			if (e.event.leftButton) {
				commandService.executeCommand(_inlineChatActionId);
				this.hide();
			} else if (e.event.rightButton) {
				e.event.preventDefault();
				this._showContextMenu(e.event, e.target.element?.classList.contains('whitespace')
					? InlineChatConfigKeys.LineEmptyHint
					: InlineChatConfigKeys.LineNLHint
				);
			}
		}));

		const markerSuppression = this._store.add(new MutableDisposable());
		const decos = this._editor.createDecorationsCollection();

		const editorObs = observableCodeEditor(editor);
		const keyObs = observableFromEvent(keybindingService.onDidUpdateKeybindings, _ => keybindingService.lookupKeybinding(ACTION_START)?.getLabel());
		const configHintEmpty = observableConfigValue(InlineChatConfigKeys.LineEmptyHint, false, this._configurationService);
		const configHintNL = observableConfigValue(InlineChatConfigKeys.LineNLHint, false, this._configurationService);

		const showDataObs = derived(r => {
			const ghostState = ghostCtrl?.model.read(r)?.state.read(r);

			const textFocus = editorObs.isTextFocused.read(r);
			const position = editorObs.cursorPosition.read(r);
			const model = editorObs.model.read(r);

			const kb = keyObs.read(r);

			if (ghostState !== undefined || !kb || !position || !model || !textFocus) {
				return undefined;
			}

			if (model.getLanguageId() === PLAINTEXT_LANGUAGE_ID || model.getLanguageId() === 'markdown') {
				return undefined;
			}

			const visible = this._visibilityObs.read(r);
			const isEol = model.getLineMaxColumn(position.lineNumber) === position.column;
			const isWhitespace = model.getLineLastNonWhitespaceColumn(position.lineNumber) === 0 && model.getValueLength() > 0 && position.column > 1;

			if (isWhitespace) {
				return configHintEmpty.read(r)
					? { isEol, isWhitespace, kb, position, model }
					: undefined;
			}

			if (visible && isEol && configHintNL.read(r)) {
				return { isEol, isWhitespace, kb, position, model };
			}

			return undefined;
		});

		const style = createStyleSheet2();
		this._store.add(style);

		this._store.add(autorun(r => {

			const showData = showDataObs.read(r);
			if (!showData) {
				decos.clear();
				markerSuppression.clear();
				this._ctxShowingHint.reset();
				return;
			}

			const agentName = chatAgentService.getDefaultAgent(ChatAgentLocation.Editor)?.name ?? localize('defaultTitle', "Chat");
			const { position, isEol, isWhitespace, kb, model } = showData;

			const inlineClassName: string[] = ['a' /*HACK but sorts as we want*/, 'inline-chat-hint', 'inline-chat-hint-text'];
			let content: string;
			if (isWhitespace) {
				content = '\u00a0' + localize('title2', "{0} to edit with {1}", kb, agentName);
			} else if (isEol) {
				content = '\u00a0' + localize('title1', "{0} to continue with {1}", kb, agentName);
			} else {
				content = '\u200a' + kb + '\u200a';
				inlineClassName.push('embedded');
			}

			style.setStyle(`.inline-chat-hint-text::after { content: ${stringValue(content)} }`);
			if (isWhitespace) {
				inlineClassName.push('whitespace');
			}

			this._ctxShowingHint.set(true);

			decos.set([{
				range: Range.fromPositions(position),
				options: {
					description: 'inline-chat-hint-line',
					showIfCollapsed: true,
					stickiness: TrackedRangeStickiness.NeverGrowsWhenTypingAtEdges,
					afterContentClassName: inlineClassName.join(' '),
				}
			}]);

			markerSuppression.value = markerDecorationService.addMarkerSuppression(model.uri, model.validateRange(new Range(position.lineNumber, 1, position.lineNumber, Number.MAX_SAFE_INTEGER)));
		}));
	}

	private _showContextMenu(event: IMouseEvent, setting: string): void {
		this._contextMenuService.showContextMenu({
			getAnchor: () => ({ x: event.posx, y: event.posy }),
			getActions: () => [
				toAction({
					id: 'inlineChat.disableHint',
					label: localize('disableHint', "Disable Inline Chat Hint"),
					run: async () => {
						await this._configurationService.updateValue(setting, false);
					}
				})
			]
		});
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
