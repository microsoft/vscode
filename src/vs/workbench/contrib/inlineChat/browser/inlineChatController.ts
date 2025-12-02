/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { renderAsPlaintext } from '../../../../base/browser/markdownRenderer.js';
import * as aria from '../../../../base/browser/ui/aria/aria.js';
import { alert } from '../../../../base/browser/ui/aria/aria.js';
import { Barrier, DeferredPromise, Queue, raceCancellation } from '../../../../base/common/async.js';
import { CancellationToken, CancellationTokenSource } from '../../../../base/common/cancellation.js';
import { toErrorMessage } from '../../../../base/common/errorMessage.js';
import { onUnexpectedError } from '../../../../base/common/errors.js';
import { Emitter, Event } from '../../../../base/common/event.js';
import { Lazy } from '../../../../base/common/lazy.js';
import { DisposableStore, MutableDisposable, toDisposable } from '../../../../base/common/lifecycle.js';
import { Schemas } from '../../../../base/common/network.js';
import { MovingAverage } from '../../../../base/common/numbers.js';
import { autorun, derived, IObservable, observableFromEvent, observableSignalFromEvent, observableValue, waitForState } from '../../../../base/common/observable.js';
import { isEqual } from '../../../../base/common/resources.js';
import { StopWatch } from '../../../../base/common/stopwatch.js';
import { assertType } from '../../../../base/common/types.js';
import { URI } from '../../../../base/common/uri.js';
import { generateUuid } from '../../../../base/common/uuid.js';
import { ICodeEditor, isCodeEditor } from '../../../../editor/browser/editorBrowser.js';
import { observableCodeEditor } from '../../../../editor/browser/observableCodeEditor.js';
import { ICodeEditorService } from '../../../../editor/browser/services/codeEditorService.js';
import { EditorOption } from '../../../../editor/common/config/editorOptions.js';
import { IPosition, Position } from '../../../../editor/common/core/position.js';
import { IRange, Range } from '../../../../editor/common/core/range.js';
import { ISelection, Selection, SelectionDirection } from '../../../../editor/common/core/selection.js';
import { IEditorContribution } from '../../../../editor/common/editorCommon.js';
import { TextEdit, VersionedExtensionId } from '../../../../editor/common/languages.js';
import { ITextModel, IValidEditOperation } from '../../../../editor/common/model.js';
import { IEditorWorkerService } from '../../../../editor/common/services/editorWorker.js';
import { IMarkerDecorationsService } from '../../../../editor/common/services/markerDecorations.js';
import { DefaultModelSHA1Computer } from '../../../../editor/common/services/modelService.js';
import { EditSuggestionId } from '../../../../editor/common/textModelEditSource.js';
import { InlineCompletionsController } from '../../../../editor/contrib/inlineCompletions/browser/controller/inlineCompletionsController.js';
import { MessageController } from '../../../../editor/contrib/message/browser/messageController.js';
import { localize } from '../../../../nls.js';
import { MenuId } from '../../../../platform/actions/common/actions.js';
import { IContextKey, IContextKeyService } from '../../../../platform/contextkey/common/contextkey.js';
import { IFileService } from '../../../../platform/files/common/files.js';
import { IInstantiationService, ServicesAccessor } from '../../../../platform/instantiation/common/instantiation.js';
import { ISharedWebContentExtractorService } from '../../../../platform/webContentExtractor/common/webContentExtractor.js';
import { IEditorService, SIDE_GROUP } from '../../../services/editor/common/editorService.js';
import { IChatAttachmentResolveService } from '../../chat/browser/chatAttachmentResolveService.js';
import { IChatWidgetLocationOptions } from '../../chat/browser/chatWidget.js';
import { ChatContextKeys } from '../../chat/common/chatContextKeys.js';
import { IChatEditingSession, ModifiedFileEntryState } from '../../chat/common/chatEditingService.js';
import { ChatModel, ChatRequestRemovalReason, IChatRequestModel, IChatTextEditGroup, IChatTextEditGroupState, IResponse } from '../../chat/common/chatModel.js';
import { ChatMode } from '../../chat/common/chatModes.js';
import { IChatService } from '../../chat/common/chatService.js';
import { IChatRequestVariableEntry, IDiagnosticVariableEntryFilterData } from '../../chat/common/chatVariableEntries.js';
import { isResponseVM } from '../../chat/common/chatViewModel.js';
import { ChatAgentLocation } from '../../chat/common/constants.js';
import { ILanguageModelChatSelector, ILanguageModelsService, isILanguageModelChatSelector } from '../../chat/common/languageModels.js';
import { isNotebookContainingCellEditor as isNotebookWithCellEditor } from '../../notebook/browser/notebookEditor.js';
import { INotebookEditorService } from '../../notebook/browser/services/notebookEditorService.js';
import { ICellEditOperation } from '../../notebook/common/notebookCommon.js';
import { INotebookService } from '../../notebook/common/notebookService.js';
import { CTX_INLINE_CHAT_VISIBLE } from '../common/inlineChat.js';
import { HunkInformation, Session, StashedSession } from './inlineChatSession.js';
import { IInlineChatSession2, IInlineChatSessionService, moveToPanelChat } from './inlineChatSessionService.js';
import { InlineChatError } from './inlineChatSessionServiceImpl.js';
import { HunkAction, IEditObserver, IInlineChatMetadata, LiveStrategy, ProgressingEditsOptions } from './inlineChatStrategies.js';
import { EditorBasedInlineChatWidget } from './inlineChatWidget.js';
import { InlineChatZoneWidget } from './inlineChatZoneWidget.js';

export const enum State {
	CREATE_SESSION = 'CREATE_SESSION',
	INIT_UI = 'INIT_UI',
	WAIT_FOR_INPUT = 'WAIT_FOR_INPUT',
	SHOW_REQUEST = 'SHOW_REQUEST',
	PAUSE = 'PAUSE',
	CANCEL = 'CANCEL',
	ACCEPT = 'DONE',
}

const enum Message {
	NONE = 0,
	ACCEPT_SESSION = 1 << 0,
	CANCEL_SESSION = 1 << 1,
	PAUSE_SESSION = 1 << 2,
	CANCEL_REQUEST = 1 << 3,
	CANCEL_INPUT = 1 << 4,
	ACCEPT_INPUT = 1 << 5,
}

export abstract class InlineChatRunOptions {

	initialSelection?: ISelection;
	initialRange?: IRange;
	message?: string;
	attachments?: URI[];
	autoSend?: boolean;
	existingSession?: Session;
	position?: IPosition;
	modelSelector?: ILanguageModelChatSelector;

	static isInlineChatRunOptions(options: unknown): options is InlineChatRunOptions {

		if (typeof options !== 'object' || options === null) {
			return false;
		}

		const { initialSelection, initialRange, message, autoSend, position, existingSession, attachments, modelSelector } = <InlineChatRunOptions>options;
		if (
			typeof message !== 'undefined' && typeof message !== 'string'
			|| typeof autoSend !== 'undefined' && typeof autoSend !== 'boolean'
			|| typeof initialRange !== 'undefined' && !Range.isIRange(initialRange)
			|| typeof initialSelection !== 'undefined' && !Selection.isISelection(initialSelection)
			|| typeof position !== 'undefined' && !Position.isIPosition(position)
			|| typeof existingSession !== 'undefined' && !(existingSession instanceof Session)
			|| typeof attachments !== 'undefined' && (!Array.isArray(attachments) || !attachments.every(item => item instanceof URI))
			|| typeof modelSelector !== 'undefined' && !isILanguageModelChatSelector(modelSelector)
		) {
			return false;
		}

		return true;
	}
}

export class InlineChatController implements IEditorContribution {

	static ID = 'editor.contrib.inlineChatController';

	static get(editor: ICodeEditor) {
		return editor.getContribution<InlineChatController>(InlineChatController.ID);
	}

	private readonly _delegate: InlineChatController2;

	constructor(
		editor: ICodeEditor
	) {
		this._delegate = InlineChatController2.get(editor)!;
	}

	dispose(): void {

	}

	get isActive(): boolean {
		return this._delegate.isActive;
	}

	async run(arg?: InlineChatRunOptions): Promise<boolean> {
		return this._delegate.run(arg);
	}

	focus() {
		return this._delegate.focus();
	}

	get widget(): EditorBasedInlineChatWidget {
		return this._delegate.widget;
	}

	getWidgetPosition() {
		return this._delegate.getWidgetPosition();
	}

	acceptSession() {
		return this._delegate.acceptSession();
	}
}

// TODO@jrieken THIS should be shared with the code in MainThreadEditors
function getEditorId(editor: ICodeEditor, model: ITextModel): string {
	return `${editor.getId()},${model.id}`;
}

// InlineChatController1 removed - migrated to V2 architecture
// Stub for backwards compatibility with V1 actions (which are now disabled via CTX_INLINE_CHAT_V1_ENABLED = false)
/** @deprecated V1 controller removed - use InlineChatController2 */
export class InlineChatController1 {
	static get(_editor: ICodeEditor): undefined {
		return undefined;
	}
	// Stub methods for V1 actions (never called since CTX_INLINE_CHAT_V1_ENABLED is false)
	unstashLastSession(): void { throw new Error('V1 controller removed'); }
	run(): void { throw new Error('V1 controller removed'); }
	arrowOut(_up: boolean): void { throw new Error('V1 controller removed'); }
	acceptHunk(): void { throw new Error('V1 controller removed'); }
	discardHunk(): void { throw new Error('V1 controller removed'); }
	get chatWidget(): any { throw new Error('V1 controller removed'); }
	cancelSession(): void { throw new Error('V1 controller removed'); }
	moveHunk(_next: boolean): void { throw new Error('V1 controller removed'); }
	viewInChat(): void { throw new Error('V1 controller removed'); }
	toggleDiff(): void { throw new Error('V1 controller removed'); }
}

export class InlineChatController2 implements IEditorContribution {

	static readonly ID = 'editor.contrib.inlineChatController2';

	static get(editor: ICodeEditor): InlineChatController2 | undefined {
		return editor.getContribution<InlineChatController2>(InlineChatController2.ID) ?? undefined;
	}

	private readonly _store = new DisposableStore();
	private readonly _isActiveController = observableValue(this, false);
	private readonly _zone: Lazy<InlineChatZoneWidget>;

	private readonly _currentSession: IObservable<IInlineChatSession2 | undefined>;

	get widget(): EditorBasedInlineChatWidget {
		return this._zone.value.widget;
	}

	get isActive() {
		return Boolean(this._currentSession.get());
	}

	constructor(
		private readonly _editor: ICodeEditor,
		@IInstantiationService private readonly _instaService: IInstantiationService,
		@INotebookEditorService private readonly _notebookEditorService: INotebookEditorService,
		@IInlineChatSessionService private readonly _inlineChatSessionService: IInlineChatSessionService,
		@ICodeEditorService codeEditorService: ICodeEditorService,
		@IContextKeyService contextKeyService: IContextKeyService,
		@ISharedWebContentExtractorService private readonly _webContentExtractorService: ISharedWebContentExtractorService,
		@IFileService private readonly _fileService: IFileService,
		@IChatAttachmentResolveService private readonly _chatAttachmentResolveService: IChatAttachmentResolveService,
		@IEditorService private readonly _editorService: IEditorService,
		@IMarkerDecorationsService private readonly _markerDecorationsService: IMarkerDecorationsService,
		@ILanguageModelsService private readonly _languageModelService: ILanguageModelsService,
		@IChatService chatService: IChatService,
	) {

		const ctxInlineChatVisible = CTX_INLINE_CHAT_VISIBLE.bindTo(contextKeyService);

		this._zone = new Lazy<InlineChatZoneWidget>(() => {


			const location: IChatWidgetLocationOptions = {
				location: ChatAgentLocation.EditorInline,
				resolveData: () => {
					assertType(this._editor.hasModel());
					const wholeRange = this._editor.getSelection();
					const document = this._editor.getModel().uri;

					return {
						type: ChatAgentLocation.EditorInline,
						id: getEditorId(this._editor, this._editor.getModel()),
						selection: this._editor.getSelection(),
						document,
						wholeRange,
						close: () => { /* TODO@jrieken */ },
						delegateSessionResource: chatService.editingSessions.find(session =>
							session.entries.get().some(e => e.hasModificationAt({
								range: wholeRange,
								uri: document
							}))
						)?.chatSessionResource,
					};
				}
			};

			// inline chat in notebooks
			// check if this editor is part of a notebook editor
			// if so, update the location and use the notebook specific widget
			const notebookEditor = this._notebookEditorService.getNotebookForPossibleCell(this._editor);
			if (!!notebookEditor) {
				location.location = ChatAgentLocation.Notebook;
				location.resolveData = () => {
					assertType(this._editor.hasModel());

					return {
						type: ChatAgentLocation.Notebook,
						sessionInputUri: this._editor.getModel().uri,
					};
				};
			}

			const result = this._instaService.createInstance(InlineChatZoneWidget,
				location,
				{
					enableWorkingSet: 'implicit',
					enableImplicitContext: false,
					renderInputOnTop: false,
					renderInputToolbarBelowInput: true,
					filter: item => {
						if (!isResponseVM(item)) {
							return false;
						}
						return !!item.model.isPendingConfirmation.get();
					},
					menus: {
						telemetrySource: 'inlineChatWidget',
						executeToolbar: MenuId.ChatEditorInlineExecute,
						inputSideToolbar: MenuId.ChatEditorInlineInputSide
					},
					defaultMode: ChatMode.Ask
				},
				{ editor: this._editor, notebookEditor },
				() => Promise.resolve(),
			);

			result.domNode.classList.add('inline-chat-2');

			return result;
		});


		const editorObs = observableCodeEditor(_editor);

		const sessionsSignal = observableSignalFromEvent(this, _inlineChatSessionService.onDidChangeSessions);

		this._currentSession = derived(r => {
			sessionsSignal.read(r);
			const model = editorObs.model.read(r);
			const session = model && _inlineChatSessionService.getSession2(model.uri);
			return session ?? undefined;
		});


		let lastSession: IInlineChatSession2 | undefined = undefined;

		this._store.add(autorun(r => {
			const session = this._currentSession.read(r);
			if (!session) {
				this._isActiveController.set(false, undefined);

				if (lastSession && !lastSession.chatModel.hasRequests) {
					const state = lastSession.chatModel.inputModel.state.read(undefined);
					if (!state || (!state.inputText && state.attachments.length === 0)) {
						lastSession.dispose();
						lastSession = undefined;
					}
				}
				return;
			}

			lastSession = session;

			let foundOne = false;
			for (const editor of codeEditorService.listCodeEditors()) {
				if (Boolean(InlineChatController2.get(editor)?._isActiveController.read(undefined))) {
					foundOne = true;
					break;
				}
			}
			if (!foundOne && editorObs.isFocused.read(r)) {
				this._isActiveController.set(true, undefined);
			}
		}));

		const visibleSessionObs = observableValue<IInlineChatSession2 | undefined>(this, undefined);

		this._store.add(autorun(r => {

			const model = editorObs.model.read(r);
			const session = this._currentSession.read(r);
			const isActive = this._isActiveController.read(r);

			if (!session || !isActive || !model) {
				visibleSessionObs.set(undefined, undefined);
			} else {
				visibleSessionObs.set(session, undefined);
			}
		}));

		this._store.add(autorun(r => {

			// HIDE/SHOW
			const session = visibleSessionObs.read(r);
			if (!session) {
				this._zone.rawValue?.hide();
				this._zone.value.widget.chatWidget.setModel(undefined);
				_editor.focus();
				ctxInlineChatVisible.reset();
			} else {
				ctxInlineChatVisible.set(true);
				this._zone.value.widget.chatWidget.setModel(session.chatModel);
				if (!this._zone.value.position) {
					this._zone.value.widget.chatWidget.input.renderAttachedContext(); // TODO - fights layout bug
					this._zone.value.show(session.initialPosition);
				}
				this._zone.value.reveal(this._zone.value.position!);
				this._zone.value.widget.focus();
			}
		}));

		this._store.add(autorun(r => {
			const session = visibleSessionObs.read(r);
			if (session) {
				const entries = session.editingSession.entries.read(r);
				const otherEntries = entries.filter(entry => !isEqual(entry.modifiedURI, session.uri));
				for (const entry of otherEntries) {
					// OPEN other modified files in side group. This is a workaround, temp-solution until we have no more backend
					// that modifies other files
					this._editorService.openEditor({ resource: entry.modifiedURI }, SIDE_GROUP).catch(onUnexpectedError);
				}
			}
		}));

		const lastResponseObs = visibleSessionObs.map((session, r) => {
			if (!session) {
				return;
			}
			const lastRequest = observableFromEvent(this, session.chatModel.onDidChange, () => session.chatModel.getRequests().at(-1)).read(r);
			return lastRequest?.response;
		});

		const lastResponseProgressObs = lastResponseObs.map((response, r) => {
			if (!response) {
				return;
			}
			return observableFromEvent(this, response.onDidChange, () => response.response.value.findLast(part => part.kind === 'progressMessage')).read(r);
		});

		this._store.add(autorun(r => {
			const response = lastResponseObs.read(r);

			this._zone.value.widget.updateInfo('');

			if (!response?.isInProgress.read(r)) {

				if (response?.result?.errorDetails) {
					// ERROR case
					this._zone.value.widget.updateInfo(`$(error) ${response.result.errorDetails.message}`);
					alert(response.result.errorDetails.message);
				}

				// no response or not in progress
				this._zone.value.widget.domNode.classList.toggle('request-in-progress', false);
				this._zone.value.widget.chatWidget.setInputPlaceholder(localize('placeholder', "Edit, refactor, and generate code"));

			} else {
				this._zone.value.widget.domNode.classList.toggle('request-in-progress', true);
				let placeholder = response.request?.message.text;
				const lastProgress = lastResponseProgressObs.read(r);
				if (lastProgress) {
					placeholder = renderAsPlaintext(lastProgress.content);
				}
				this._zone.value.widget.chatWidget.setInputPlaceholder(placeholder || localize('loading', "Working..."));
			}

		}));

		this._store.add(autorun(r => {
			const session = visibleSessionObs.read(r);
			if (!session) {
				return;
			}

			const entry = session.editingSession.readEntry(session.uri, r);
			if (entry?.state.read(r) === ModifiedFileEntryState.Modified) {
				entry?.enableReviewModeUntilSettled();
			}
		}));


		this._store.add(autorun(r => {

			const session = visibleSessionObs.read(r);
			const entry = session?.editingSession.readEntry(session.uri, r);

			// make sure there is an editor integration
			const pane = this._editorService.visibleEditorPanes.find(candidate => candidate.getControl() === this._editor || isNotebookWithCellEditor(candidate, this._editor));
			if (pane && entry) {
				entry?.getEditorIntegration(pane);
			}

			// make sure the ZONE isn't inbetween a diff and move above if so
			if (entry?.diffInfo && this._zone.value.position) {
				const { position } = this._zone.value;
				const diff = entry.diffInfo.read(r);

				for (const change of diff.changes) {
					if (change.modified.contains(position.lineNumber)) {
						this._zone.value.updatePositionAndHeight(new Position(change.modified.startLineNumber - 1, 1));
						break;
					}
				}
			}
		}));
	}

	dispose(): void {
		this._store.dispose();
	}

	getWidgetPosition(): Position | undefined {
		return this._zone.rawValue?.position;
	}

	focus() {
		this._zone.rawValue?.widget.focus();
	}

	async run(arg?: InlineChatRunOptions): Promise<boolean> {
		assertType(this._editor.hasModel());


		const uri = this._editor.getModel().uri;

		const existingSession = this._inlineChatSessionService.getSession2(uri);
		if (existingSession) {
			await existingSession.editingSession.accept();
			existingSession.dispose();
		}

		this._isActiveController.set(true, undefined);

		const session = await this._inlineChatSessionService.createSession2(this._editor, uri, CancellationToken.None);

		// ADD diagnostics
		const entries: IChatRequestVariableEntry[] = [];
		for (const [range, marker] of this._markerDecorationsService.getLiveMarkers(uri)) {
			if (range.intersectRanges(this._editor.getSelection())) {
				const filter = IDiagnosticVariableEntryFilterData.fromMarker(marker);
				entries.push(IDiagnosticVariableEntryFilterData.toEntry(filter));
			}
		}
		if (entries.length > 0) {
			this._zone.value.widget.chatWidget.attachmentModel.addContext(...entries);
			this._zone.value.widget.chatWidget.input.setValue(entries.length > 1
				? localize('fixN', "Fix the attached problems")
				: localize('fix1', "Fix the attached problem"),
				true
			);
			this._zone.value.widget.chatWidget.inputEditor.setSelection(new Selection(1, 1, Number.MAX_SAFE_INTEGER, 1));
		}

		// Check args
		if (arg && InlineChatRunOptions.isInlineChatRunOptions(arg)) {
			if (arg.initialRange) {
				this._editor.revealRange(arg.initialRange);
			}
			if (arg.initialSelection) {
				this._editor.setSelection(arg.initialSelection);
			}
			if (arg.attachments) {
				await Promise.all(arg.attachments.map(async attachment => {
					await this._zone.value.widget.chatWidget.attachmentModel.addFile(attachment);
				}));
				delete arg.attachments;
			}
			if (arg.modelSelector) {
				const id = (await this._languageModelService.selectLanguageModels(arg.modelSelector, false)).sort().at(0);
				if (!id) {
					throw new Error(`No language models found matching selector: ${JSON.stringify(arg.modelSelector)}.`);
				}
				const model = this._languageModelService.lookupLanguageModel(id);
				if (!model) {
					throw new Error(`Language model not loaded: ${id}.`);
				}
				this._zone.value.widget.chatWidget.input.setCurrentLanguageModel({ metadata: model, identifier: id });
			}
			if (arg.message) {
				this._zone.value.widget.chatWidget.setInput(arg.message);
				if (arg.autoSend) {
					await this._zone.value.widget.chatWidget.acceptInput();
				}
			}
		}

		await Event.toPromise(session.editingSession.onDidDispose);

		const rejected = session.editingSession.getEntry(uri)?.state.get() === ModifiedFileEntryState.Rejected;
		return !rejected;
	}

	async acceptSession() {
		const session = this._currentSession.get();
		if (!session) {
			return;
		}
		await session.editingSession.accept();
		session.dispose();
	}

	async rejectSession() {
		const session = this._currentSession.get();
		if (!session) {
			return;
		}
		await session.editingSession.reject();
		session.dispose();
	}

	async createImageAttachment(attachment: URI): Promise<IChatRequestVariableEntry | undefined> {
		const value = this._currentSession.get();
		if (!value) {
			return undefined;
		}
		if (attachment.scheme === Schemas.file) {
			if (await this._fileService.canHandleResource(attachment)) {
				return await this._chatAttachmentResolveService.resolveImageEditorAttachContext(attachment);
			}
		} else if (attachment.scheme === Schemas.http || attachment.scheme === Schemas.https) {
			const extractedImages = await this._webContentExtractorService.readImage(attachment, CancellationToken.None);
			if (extractedImages) {
				return await this._chatAttachmentResolveService.resolveImageEditorAttachContext(attachment, extractedImages);
			}
		}
		return undefined;
	}
}

export async function reviewEdits(accessor: ServicesAccessor, editor: ICodeEditor, stream: AsyncIterable<TextEdit[]>, token: CancellationToken, applyCodeBlockSuggestionId: EditSuggestionId | undefined): Promise<boolean> {
	if (!editor.hasModel()) {
		return false;
	}

	const chatService = accessor.get(IChatService);
	const uri = editor.getModel().uri;
	const chatModelRef = chatService.startSession(ChatAgentLocation.EditorInline);
	const chatModel = chatModelRef.object as ChatModel;

	chatModel.startEditingSession(true);

	const store = new DisposableStore();
	store.add(chatModelRef);

	// STREAM
	const chatRequest = chatModel?.addRequest({ text: '', parts: [] }, { variables: [] }, 0, {
		kind: undefined,
		modeId: 'applyCodeBlock',
		modeInstructions: undefined,
		isBuiltin: true,
		applyCodeBlockSuggestionId,
	});
	assertType(chatRequest.response);
	chatRequest.response.updateContent({ kind: 'textEdit', uri, edits: [], done: false });
	for await (const chunk of stream) {

		if (token.isCancellationRequested) {
			chatRequest.response.cancel();
			break;
		}

		chatRequest.response.updateContent({ kind: 'textEdit', uri, edits: chunk, done: false });
	}
	chatRequest.response.updateContent({ kind: 'textEdit', uri, edits: [], done: true });

	if (!token.isCancellationRequested) {
		chatRequest.response.complete();
	}

	const isSettled = derived(r => {
		const entry = chatModel.editingSession?.readEntry(uri, r);
		if (!entry) {
			return false;
		}
		const state = entry.state.read(r);
		return state === ModifiedFileEntryState.Accepted || state === ModifiedFileEntryState.Rejected;
	});
	const whenDecided = waitForState(isSettled, Boolean);
	await raceCancellation(whenDecided, token);
	store.dispose();
	return true;
}

export async function reviewNotebookEdits(accessor: ServicesAccessor, uri: URI, stream: AsyncIterable<[URI, TextEdit[]] | ICellEditOperation[]>, token: CancellationToken): Promise<boolean> {

	const chatService = accessor.get(IChatService);
	const notebookService = accessor.get(INotebookService);
	const isNotebook = notebookService.hasSupportedNotebooks(uri);
	const chatModelRef = chatService.startSession(ChatAgentLocation.EditorInline);
	const chatModel = chatModelRef.object as ChatModel;

	chatModel.startEditingSession(true);

	const store = new DisposableStore();
	store.add(chatModelRef);

	// STREAM
	const chatRequest = chatModel?.addRequest({ text: '', parts: [] }, { variables: [] }, 0);
	assertType(chatRequest.response);
	if (isNotebook) {
		chatRequest.response.updateContent({ kind: 'notebookEdit', uri, edits: [], done: false });
	} else {
		chatRequest.response.updateContent({ kind: 'textEdit', uri, edits: [], done: false });
	}
	for await (const chunk of stream) {

		if (token.isCancellationRequested) {
			chatRequest.response.cancel();
			break;
		}
		if (chunk.every(isCellEditOperation)) {
			chatRequest.response.updateContent({ kind: 'notebookEdit', uri, edits: chunk, done: false });
		} else {
			chatRequest.response.updateContent({ kind: 'textEdit', uri: chunk[0], edits: chunk[1], done: false });
		}
	}
	if (isNotebook) {
		chatRequest.response.updateContent({ kind: 'notebookEdit', uri, edits: [], done: true });
	} else {
		chatRequest.response.updateContent({ kind: 'textEdit', uri, edits: [], done: true });
	}

	if (!token.isCancellationRequested) {
		chatRequest.response.complete();
	}

	const isSettled = derived(r => {
		const entry = chatModel.editingSession?.readEntry(uri, r);
		if (!entry) {
			return false;
		}
		const state = entry.state.read(r);
		return state === ModifiedFileEntryState.Accepted || state === ModifiedFileEntryState.Rejected;
	});

	const whenDecided = waitForState(isSettled, Boolean);

	await raceCancellation(whenDecided, token);

	store.dispose();

	return true;
}

function isCellEditOperation(edit: URI | TextEdit[] | ICellEditOperation): edit is ICellEditOperation {
	if (URI.isUri(edit)) {
		return false;
	}
	if (Array.isArray(edit)) {
		return false;
	}
	return true;
}
