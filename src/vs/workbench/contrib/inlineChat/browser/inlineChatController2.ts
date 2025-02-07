/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { CancellationToken } from '../../../../base/common/cancellation.js';
import { Codicon } from '../../../../base/common/codicons.js';
import { Event } from '../../../../base/common/event.js';
import { KeyCode, KeyMod } from '../../../../base/common/keyCodes.js';
import { Lazy } from '../../../../base/common/lazy.js';
import { DisposableStore } from '../../../../base/common/lifecycle.js';
import { autorun, autorunWithStore, constObservable, derived, IObservable, observableFromEvent, observableSignalFromEvent, observableValue, transaction } from '../../../../base/common/observable.js';
import { isEqual } from '../../../../base/common/resources.js';
import { assertType } from '../../../../base/common/types.js';
import { ICodeEditor, isCodeEditor, isDiffEditor } from '../../../../editor/browser/editorBrowser.js';
import { EditorAction2, ServicesAccessor } from '../../../../editor/browser/editorExtensions.js';
import { observableCodeEditor } from '../../../../editor/browser/observableCodeEditor.js';
import { ICodeEditorService } from '../../../../editor/browser/services/codeEditorService.js';
import { EmbeddedCodeEditorWidget } from '../../../../editor/browser/widget/codeEditor/embeddedCodeEditorWidget.js';
import { EmbeddedDiffEditorWidget } from '../../../../editor/browser/widget/diffEditor/embeddedDiffEditorWidget.js';
import { Position } from '../../../../editor/common/core/position.js';
import { IEditorContribution } from '../../../../editor/common/editorCommon.js';
import { EditorContextKeys } from '../../../../editor/common/editorContextKeys.js';
import { localize, localize2 } from '../../../../nls.js';
import { IAction2Options, MenuId, registerAction2 } from '../../../../platform/actions/common/actions.js';
import { ContextKeyExpr, IContextKeyService, RawContextKey } from '../../../../platform/contextkey/common/contextkey.js';
import { IInstantiationService } from '../../../../platform/instantiation/common/instantiation.js';
import { KeybindingWeight } from '../../../../platform/keybinding/common/keybindingsRegistry.js';
import { ILogService } from '../../../../platform/log/common/log.js';
import { IEditorService } from '../../../services/editor/common/editorService.js';
import { ctxIsGlobalEditingSession } from '../../chat/browser/chatEditing/chatEditingEditorController.js';
import { ChatEditorOverlayController } from '../../chat/browser/chatEditing/chatEditingEditorOverlay.js';
import { IChatWidgetLocationOptions } from '../../chat/browser/chatWidget.js';
import { ChatAgentLocation } from '../../chat/common/chatAgents.js';
import { WorkingSetEntryState } from '../../chat/common/chatEditingService.js';
import { INotebookEditorService } from '../../notebook/browser/services/notebookEditorService.js';
import { CTX_INLINE_CHAT_HAS_AGENT2, CTX_INLINE_CHAT_POSSIBLE, CTX_INLINE_CHAT_VISIBLE } from '../common/inlineChat.js';
import { InlineChatRunOptions } from './inlineChatController.js';
import { IInlineChatSession2, IInlineChatSessionService } from './inlineChatSessionService.js';
import { EditorBasedInlineChatWidget } from './inlineChatWidget.js';
import { InlineChatZoneWidget } from './inlineChatZoneWidget.js';


export const CTX_HAS_SESSION = new RawContextKey<undefined | 'empty' | 'active'>('inlineChatHasSession', undefined, localize('chat.hasInlineChatSession', "The current editor has an active inline chat session"));


export class InlineChatController2 implements IEditorContribution {

	static readonly ID = 'editor.contrib.inlineChatController2';

	static get(editor: ICodeEditor): InlineChatController2 | undefined {
		return editor.getContribution<InlineChatController2>(InlineChatController2.ID) ?? undefined;
	}

	private readonly _store = new DisposableStore();
	private readonly _showWidgetOverrideObs = observableValue(this, false);
	private readonly _isActiveController = observableValue(this, false);
	private readonly _zone: Lazy<InlineChatZoneWidget>;

	private readonly _currentSession: IObservable<IInlineChatSession2 | undefined>;

	get widget(): EditorBasedInlineChatWidget {
		return this._zone.value.widget;
	}

	constructor(
		private readonly _editor: ICodeEditor,
		@IInstantiationService private readonly _instaService: IInstantiationService,
		@INotebookEditorService private readonly _notebookEditorService: INotebookEditorService,
		@IInlineChatSessionService private readonly _inlineChatSessions: IInlineChatSessionService,
		@IContextKeyService contextKeyService: IContextKeyService,
	) {

		const ctxHasSession = CTX_HAS_SESSION.bindTo(contextKeyService);
		const ctxInlineChatVisible = CTX_INLINE_CHAT_VISIBLE.bindTo(contextKeyService);

		this._zone = new Lazy<InlineChatZoneWidget>(() => {


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

			const result = this._instaService.createInstance(InlineChatZoneWidget,
				location,
				{
					enableWorkingSet: 'implicit',
					rendererOptions: {
						renderCodeBlockPills: true,
						renderTextEditsAsSummary: uri => isEqual(uri, _editor.getModel()?.uri)
					}
				},
				this._editor
			);

			result.domNode.classList.add('inline-chat-2');

			return result;
		});


		const editorObs = observableCodeEditor(_editor);

		const sessionsSignal = observableSignalFromEvent(this, _inlineChatSessions.onDidChangeSessions);

		this._currentSession = derived(r => {
			sessionsSignal.read(r);
			const model = editorObs.model.read(r);
			const value = model && _inlineChatSessions.getSession2(model.uri);
			return value ?? undefined;
		});


		this._store.add(autorunWithStore((r, store) => {
			const session = this._currentSession.read(r);

			if (!session) {
				ctxHasSession.set(undefined);
				this._isActiveController.set(false, undefined);
			} else {
				const checkRequests = () => ctxHasSession.set(session.chatModel.getRequests().length === 0 ? 'empty' : 'active');
				store.add(session.chatModel.onDidChange(checkRequests));
				checkRequests();
			}
		}));

		const visibleSessionObs = observableValue<IInlineChatSession2 | undefined>(this, undefined);

		this._store.add(autorunWithStore((r, store) => {

			const session = this._currentSession.read(r);
			const isActive = this._isActiveController.read(r);

			if (!session || !isActive) {
				visibleSessionObs.set(undefined, undefined);
				return;
			}

			const { chatModel } = session;
			const showShowUntil = this._showWidgetOverrideObs.read(r);
			const hasNoRequests = chatModel.getRequests().length === 0;

			store.add(chatModel.onDidChange(e => {
				if (e.kind === 'addRequest') {
					transaction(tx => {
						this._showWidgetOverrideObs.set(false, tx);
						visibleSessionObs.set(undefined, tx);
					});
				}
			}));

			if (showShowUntil || hasNoRequests) {
				visibleSessionObs.set(session, undefined);
			} else {
				visibleSessionObs.set(undefined, undefined);
			}
		}));

		this._store.add(autorun(r => {

			const session = visibleSessionObs.read(r);

			if (!session) {
				this._zone.rawValue?.hide();
				_editor.focus();
				ctxInlineChatVisible.reset();
			} else {
				ctxInlineChatVisible.set(true);
				this._zone.value.widget.setChatModel(session.chatModel);
				if (!this._zone.value.position) {
					this._zone.value.show(session.initialPosition);
				}
				this._zone.value.reveal(this._zone.value.position!);
				this._zone.value.widget.focus();
				session.editingSession.getEntry(session.uri)?.autoAcceptController.get()?.cancel();
			}
		}));

		this._store.add(autorun(r => {

			const overlay = ChatEditorOverlayController.get(_editor)!;
			const session = this._currentSession.read(r);
			const model = editorObs.model.read(r);
			if (!session || !model) {
				overlay.hide();
				return;
			}

			const lastResponse = observableFromEvent(this, session.chatModel.onDidChange, () => session.chatModel.getRequests().at(-1)?.response);
			const response = lastResponse.read(r);

			const isInProgress = response
				? observableFromEvent(this, response.onDidChange, () => !response.isComplete)
				: constObservable(false);

			if (isInProgress.read(r)) {
				overlay.showRequest(session.editingSession);
			} else if (session.editingSession.getEntry(session.uri)?.state.get() !== WorkingSetEntryState.Modified) {
				overlay.hide();
			}
		}));
	}

	dispose(): void {
		this._store.dispose();
	}

	toggleWidgetUntilNextRequest() {
		const value = this._showWidgetOverrideObs.get();
		this._showWidgetOverrideObs.set(!value, undefined);
	}


	getWidgetPosition(): Position | undefined {
		return this._zone.rawValue?.position;
	}

	focus() {
		this._zone.rawValue?.widget.focus();
	}

	markActiveController() {
		this._isActiveController.set(true, undefined);
	}

	async run(arg?: InlineChatRunOptions): Promise<boolean> {
		assertType(this._editor.hasModel());

		const uri = this._editor.getModel().uri;
		const session = await this._inlineChatSessions.createSession2(this._editor, uri, CancellationToken.None);

		this.markActiveController();

		if (arg && InlineChatRunOptions.isInlineChatRunOptions(arg)) {
			if (arg.initialRange) {
				this._editor.revealRange(arg.initialRange);
			}
			if (arg.initialSelection) {
				this._editor.setSelection(arg.initialSelection);
			}
			if (arg.message) {
				this._zone.value.widget.chatWidget.setInput(arg.message);
				if (arg.autoSend) {
					await this._zone.value.widget.chatWidget.acceptInput();
				}
			}
		}

		await Event.toPromise(session.editingSession.onDidDispose);

		const rejected = session.editingSession.getEntry(uri)?.state.get() === WorkingSetEntryState.Rejected;
		return !rejected;
	}

	acceptSession() {
		const value = this._currentSession.get();
		value?.editingSession.accept();
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
				CTX_HAS_SESSION.negate(),
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
				when: CTX_INLINE_CHAT_HAS_AGENT2
			}
		});
	}

	override async runEditorCommand(accessor: ServicesAccessor, editor: ICodeEditor, ...args: any[]) {
		const ctrl = InlineChatController2.get(editor);
		ctrl?.run();
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
			precondition: ContextKeyExpr.and(CTX_HAS_SESSION.isEqualTo('empty'), CTX_INLINE_CHAT_VISIBLE),
			keybinding: {
				weight: KeybindingWeight.WorkbenchContrib,
				primary: KeyCode.Escape,
				secondary: [KeyMod.CtrlCmd | KeyCode.KeyI]
			},
		});
	}

	runInlineChatCommand(accessor: ServicesAccessor, _ctrl: InlineChatController2, editor: ICodeEditor, ...args: any[]): void {
		const inlineChatSessions = accessor.get(IInlineChatSessionService);
		if (!editor.hasModel()) {
			return;
		}
		const textModel = editor.getModel();
		inlineChatSessions.getSession2(textModel.uri)?.dispose();
	}
}

class RevealWidget extends AbstractInlineChatAction {
	constructor() {
		super({
			id: 'inlineChat2.reveal',
			title: localize2('reveal', "Toggle Inline Chat"),
			f1: true,
			icon: Codicon.copilot,
			precondition: ContextKeyExpr.and(
				CTX_HAS_SESSION,
			),
			keybinding: {
				weight: KeybindingWeight.WorkbenchContrib,
				primary: KeyMod.CtrlCmd | KeyCode.KeyI
			},
			menu: {
				id: MenuId.ChatEditingEditorContent,
				when: ContextKeyExpr.and(
					CTX_HAS_SESSION,
					ctxIsGlobalEditingSession.negate(),
				),
				group: 'navigate',
				order: 4,
			}
		});
	}

	runInlineChatCommand(_accessor: ServicesAccessor, ctrl: InlineChatController2, _editor: ICodeEditor): void {
		ctrl.toggleWidgetUntilNextRequest();
		ctrl.markActiveController();
	}
}

registerAction2(RevealWidget);
