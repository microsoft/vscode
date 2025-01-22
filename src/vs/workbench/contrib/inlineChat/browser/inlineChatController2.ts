/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { CancellationToken } from '../../../../base/common/cancellation.js';
import { KeyCode, KeyMod } from '../../../../base/common/keyCodes.js';
import { DisposableStore } from '../../../../base/common/lifecycle.js';
import { autorun, observableFromEvent } from '../../../../base/common/observable.js';
import { assertType } from '../../../../base/common/types.js';
import { ICodeEditor, isCodeEditor, isDiffEditor } from '../../../../editor/browser/editorBrowser.js';
import { EditorAction2, ServicesAccessor } from '../../../../editor/browser/editorExtensions.js';
import { ObservableCodeEditor, observableCodeEditor } from '../../../../editor/browser/observableCodeEditor.js';
import { ICodeEditorService } from '../../../../editor/browser/services/codeEditorService.js';
import { EmbeddedCodeEditorWidget } from '../../../../editor/browser/widget/codeEditor/embeddedCodeEditorWidget.js';
import { EmbeddedDiffEditorWidget } from '../../../../editor/browser/widget/diffEditor/embeddedDiffEditorWidget.js';
import { IEditorContribution } from '../../../../editor/common/editorCommon.js';
import { EditorContextKeys } from '../../../../editor/common/editorContextKeys.js';
import { localize2 } from '../../../../nls.js';
import { IAction2Options, MenuId } from '../../../../platform/actions/common/actions.js';
import { ContextKeyExpr, IContextKeyService } from '../../../../platform/contextkey/common/contextkey.js';
import { IInstantiationService } from '../../../../platform/instantiation/common/instantiation.js';
import { KeybindingWeight } from '../../../../platform/keybinding/common/keybindingsRegistry.js';
import { ILogService } from '../../../../platform/log/common/log.js';
import { IEditorService } from '../../../services/editor/common/editorService.js';
import { IChatWidgetLocationOptions } from '../../chat/browser/chatWidget.js';
import { ChatAgentLocation } from '../../chat/common/chatAgents.js';
import { isRequestVM } from '../../chat/common/chatViewModel.js';
import { INotebookEditorService } from '../../notebook/browser/services/notebookEditorService.js';
import { CTX_INLINE_CHAT_HAS_AGENT2, CTX_INLINE_CHAT_POSSIBLE, CTX_INLINE_CHAT_VISIBLE } from '../common/inlineChat.js';
import { IInlineChatSessionService } from './inlineChatSessionService.js';
import { InlineChatZoneWidget } from './inlineChatZoneWidget.js';

export class InlineChatController2 implements IEditorContribution {

	static readonly ID = 'editor.contrib.inlineChatController2';

	static get(editor: ICodeEditor): InlineChatController2 | undefined {
		return editor.getContribution<InlineChatController2>(InlineChatController2.ID) ?? undefined;
	}

	private readonly _store = new DisposableStore();

	private readonly _editorObs: ObservableCodeEditor;

	// private readonly _session: IObservable<IInlineChatSession2 | undefined>;

	// private readonly _zone: InlineChatZoneWidget;

	constructor(
		private readonly _editor: ICodeEditor,
		@IInstantiationService private readonly _instaService: IInstantiationService,
		@INotebookEditorService private readonly _notebookEditorService: INotebookEditorService,
		@IInlineChatSessionService private readonly _inlineChatSessions: IInlineChatSessionService,
		@IContextKeyService contextKeyService: IContextKeyService,
	) {

		const ctxInlineChatVisible = CTX_INLINE_CHAT_VISIBLE.bindTo(contextKeyService);

		const location: IChatWidgetLocationOptions = {
			location: ChatAgentLocation.Editor,
			resolveData: () => {
				assertType(this._editor.hasModel());

				return {
					type: ChatAgentLocation.Editor,
					selection: this._editor.getSelection(),
					document: this._editor.getModel().uri,
					wholeRange: this._editor.getSelection(),
				};
			}
		};

		// inline chat in notebooks
		// check if this editor is part of a notebook editor
		// and iff so, use the notebook location but keep the resolveData
		// talk about editor data
		for (const notebookEditor of this._notebookEditorService.listNotebookEditors()) {
			for (const [, codeEditor] of notebookEditor.codeEditors) {
				if (codeEditor === this._editor) {
					location.location = ChatAgentLocation.Notebook;
					break;
				}
			}
		}

		const zone = this._instaService.createInstance(InlineChatZoneWidget,
			location,
			{
				enableWorkingSet: false,
				filter: item => isRequestVM(item)
			},
			this._editor
		);


		this._editorObs = observableCodeEditor(_editor);

		const sessionObs = observableFromEvent(this, _inlineChatSessions.onDidChangeSessions, () => {
			const model = _editor.getModel();
			if (!model) {
				return undefined;
			}
			return _inlineChatSessions.getSession2(_editor, model.uri);
		});

		this._store.add(autorun(r => {
			const position = this._editorObs.cursorPosition.read(r);
			const value = sessionObs.read(r);
			if (!value || !position) {
				zone.hide();
				ctxInlineChatVisible.reset();
			} else {
				zone.widget.setChatModel(value.chatModel);
				ctxInlineChatVisible.set(true);
				if (!zone.position) {
					zone.show(position);
				}
			}
		}));

	}

	dispose(): void {
		this._store.dispose();
	}

	async start() {
		assertType(this._editor.hasModel());
		const textModel = this._editor.getModel();
		await this._inlineChatSessions.createSession2(this._editor, textModel.uri, CancellationToken.None);
	}
}

export class StartSessionAction2 extends EditorAction2 {

	constructor() {
		super({
			id: 'inlineChat2.start',
			title: localize2('start', "Inline Chat"),
			precondition: ContextKeyExpr.and(
				CTX_INLINE_CHAT_HAS_AGENT2,
				CTX_INLINE_CHAT_POSSIBLE,
				EditorContextKeys.writable,
				EditorContextKeys.editorSimpleInput.negate()
			),
			f1: true,
			category: AbstractInlineChatAction.category,
			keybinding: {
				when: EditorContextKeys.focus,
				weight: KeybindingWeight.WorkbenchContrib,
				primary: KeyMod.CtrlCmd | KeyCode.KeyI
			},
			menu: {
				id: MenuId.ChatCommandCenter,
				group: 'd_inlineChat',
				order: 10,
			}
		});
	}

	override async runEditorCommand(accessor: ServicesAccessor, editor: ICodeEditor, ...args: any[]) {
		const inlineChatSessions = accessor.get(IInlineChatSessionService);
		if (!editor.hasModel()) {
			return;
		}
		const textModel = editor.getModel();
		await inlineChatSessions.createSession2(editor, textModel.uri, CancellationToken.None);
	}
}

abstract class AbstractInlineChatAction extends EditorAction2 {

	static readonly category = localize2('cat', "Inline Chat");

	constructor(desc: IAction2Options) {
		super({
			...desc,
			category: AbstractInlineChatAction.category,
			precondition: ContextKeyExpr.and(CTX_INLINE_CHAT_HAS_AGENT2, desc.precondition)
		});
	}

	override runEditorCommand(accessor: ServicesAccessor, editor: ICodeEditor, ..._args: any[]) {
		const editorService = accessor.get(IEditorService);
		const logService = accessor.get(ILogService);

		let ctrl = InlineChatController2.get(editor);
		if (!ctrl) {
			const { activeTextEditorControl } = editorService;
			if (isCodeEditor(activeTextEditorControl)) {
				editor = activeTextEditorControl;
			} else if (isDiffEditor(activeTextEditorControl)) {
				editor = activeTextEditorControl.getModifiedEditor();
			}
			ctrl = InlineChatController2.get(editor);
		}

		if (!ctrl) {
			logService.warn('[IE] NO controller found for action', this.desc.id, editor.getModel()?.uri);
			return;
		}

		if (editor instanceof EmbeddedCodeEditorWidget) {
			editor = editor.getParentEditor();
		}
		if (!ctrl) {
			for (const diffEditor of accessor.get(ICodeEditorService).listDiffEditors()) {
				if (diffEditor.getOriginalEditor() === editor || diffEditor.getModifiedEditor() === editor) {
					if (diffEditor instanceof EmbeddedDiffEditorWidget) {
						this.runEditorCommand(accessor, diffEditor.getParentEditor(), ..._args);
					}
				}
			}
			return;
		}
		this.runInlineChatCommand(accessor, ctrl, editor, ..._args);
	}

	abstract runInlineChatCommand(accessor: ServicesAccessor, ctrl: InlineChatController2, editor: ICodeEditor, ...args: any[]): void;
}

export class StopSessionAction2 extends AbstractInlineChatAction {
	constructor() {
		super({
			id: 'inlineChat2.stop',
			title: localize2('stop', "Stop"),
			f1: true,
			category: AbstractInlineChatAction.category,
			precondition: ContextKeyExpr.and(
				CTX_INLINE_CHAT_VISIBLE,
			),
			keybinding: {
				when: EditorContextKeys.focus,
				weight: KeybindingWeight.WorkbenchContrib,
				primary: KeyCode.Escape
			},
		});
	}

	runInlineChatCommand(accessor: ServicesAccessor, _ctrl: InlineChatController2, editor: ICodeEditor, ...args: any[]): void {
		const inlineChatSessions = accessor.get(IInlineChatSessionService);
		if (!editor.hasModel()) {
			return;
		}
		const textModel = editor.getModel();
		inlineChatSessions.getSession2(editor, textModel.uri)?.dispose();
	}
}
