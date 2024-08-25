/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { DisposableStore, MutableDisposable } from 'vs/base/common/lifecycle';
import { IActiveCodeEditor, ICodeEditor } from 'vs/editor/browser/editorBrowser';
import { CursorChangeReason } from 'vs/editor/common/cursorEvents';
import { IEditorContribution } from 'vs/editor/common/editorCommon';
import { localize, localize2 } from 'vs/nls';
import { ContextKeyExpr, IContextKey, IContextKeyService, RawContextKey } from 'vs/platform/contextkey/common/contextkey';
import { IChatAgentService } from 'vs/workbench/contrib/chat/common/chatAgents';
import { InlineChatController, State } from 'vs/workbench/contrib/inlineChat/browser/inlineChatController';
import { CTX_INLINE_CHAT_HAS_AGENT, CTX_INLINE_CHAT_VISIBLE } from 'vs/workbench/contrib/inlineChat/common/inlineChat';
import { EditorAction2, ServicesAccessor } from 'vs/editor/browser/editorExtensions';
import { EditOperation } from 'vs/editor/common/core/editOperation';
import { Range } from 'vs/editor/common/core/range';
import { Position } from 'vs/editor/common/core/position';
import { AbstractInlineChatAction } from 'vs/workbench/contrib/inlineChat/browser/inlineChatActions';
import { EditorContextKeys } from 'vs/editor/common/editorContextKeys';
import { IValidEditOperation } from 'vs/editor/common/model';


export const CTX_INLINE_CHAT_EXPANSION = new RawContextKey<boolean>('inlineChatExpansion', false, localize('inlineChatExpansion', "Whether the inline chat expansion is enabled when at the end of a just-typed line"));

export class InlineChatExansionContextKey implements IEditorContribution {

	static Id = 'editor.inlineChatExpansion';

	private readonly _store = new DisposableStore();
	private readonly _editorListener = this._store.add(new MutableDisposable());

	private readonly _ctxInlineChatExpansion: IContextKey<boolean>;

	constructor(
		editor: ICodeEditor,
		@IContextKeyService contextKeyService: IContextKeyService,
		@IChatAgentService chatAgentService: IChatAgentService
	) {
		this._ctxInlineChatExpansion = CTX_INLINE_CHAT_EXPANSION.bindTo(contextKeyService);

		const update = () => {
			if (editor.hasModel() && chatAgentService.getAgents().length > 0) {
				this._install(editor);
			} else {
				this._uninstall();
			}
		};
		this._store.add(chatAgentService.onDidChangeAgents(update));
		this._store.add(editor.onDidChangeModel(update));
		update();
	}

	dispose(): void {
		this._ctxInlineChatExpansion.reset();
		this._store.dispose();
	}

	private _install(editor: IActiveCodeEditor): void {

		const store = new DisposableStore();
		this._editorListener.value = store;

		const model = editor.getModel();
		const lastChangeEnds: number[] = [];

		store.add(editor.onDidChangeCursorPosition(e => {

			let enabled = false;

			if (e.reason === CursorChangeReason.NotSet) {

				const position = editor.getPosition();
				const positionOffset = model.getOffsetAt(position);

				const lineLength = model.getLineLength(position.lineNumber);
				const firstNonWhitespace = model.getLineFirstNonWhitespaceColumn(position.lineNumber);

				if (firstNonWhitespace !== 0 && position.column > lineLength && lastChangeEnds.includes(positionOffset)) {
					enabled = true;
				}
			}

			lastChangeEnds.length = 0;
			this._ctxInlineChatExpansion.set(enabled);

		}));

		store.add(editor.onDidChangeModelContent(e => {
			lastChangeEnds.length = 0;
			for (const change of e.changes) {
				const changeEnd = change.rangeOffset + change.text.length;
				lastChangeEnds.push(changeEnd);
			}
			queueMicrotask(() => {
				if (lastChangeEnds.length > 0) {
					// this is a signal that onDidChangeCursorPosition didn't run which means some outside change
					// which means we should disable the context key
					this._ctxInlineChatExpansion.set(false);
				}
			});
		}));
	}

	private _uninstall(): void {
		this._editorListener.clear();
	}
}

export class InlineChatExpandLineAction extends EditorAction2 {

	constructor() {
		super({
			id: 'inlineChat.startWithCurrentLine',
			category: AbstractInlineChatAction.category,
			title: localize2('startWithCurrentLine', "Start in Editor with Current Line"),
			f1: true,
			precondition: ContextKeyExpr.and(CTX_INLINE_CHAT_VISIBLE.negate(), CTX_INLINE_CHAT_HAS_AGENT, EditorContextKeys.writable),
			// keybinding: {
			// 	when: CTX_INLINE_CHAT_EXPANSION,
			// 	weight: KeybindingWeight.EditorContrib,
			// 	primary: KeyCode.Tab
			// }
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
