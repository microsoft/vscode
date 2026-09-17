/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { renderAsPlaintext } from '../../../../base/browser/markdownRenderer.js';
import { alert } from '../../../../base/browser/ui/aria/aria.js';
import { disposableTimeout } from '../../../../base/common/async.js';
import { CancellationTokenSource } from '../../../../base/common/cancellation.js';
import { CancellationError, isCancellationError, onUnexpectedError } from '../../../../base/common/errors.js';
import { Event } from '../../../../base/common/event.js';
import { Lazy } from '../../../../base/common/lazy.js';
import { DisposableStore, MutableDisposable } from '../../../../base/common/lifecycle.js';
import { Schemas } from '../../../../base/common/network.js';
import { autorun, derived, IObservable, observableFromEvent, observableSignalFromEvent, observableValue, waitForState } from '../../../../base/common/observable.js';
import { isEqual } from '../../../../base/common/resources.js';
import { assertType } from '../../../../base/common/types.js';
import { URI } from '../../../../base/common/uri.js';
import { ICodeEditor } from '../../../../editor/browser/editorBrowser.js';
import { observableCodeEditor } from '../../../../editor/browser/observableCodeEditor.js';
import { ICodeEditorService } from '../../../../editor/browser/services/codeEditorService.js';
import { IPosition, Position } from '../../../../editor/common/core/position.js';
import { IRange, Range } from '../../../../editor/common/core/range.js';
import { ISelection, Selection } from '../../../../editor/common/core/selection.js';
import { IEditorContribution } from '../../../../editor/common/editorCommon.js';
import { ITextModel } from '../../../../editor/common/model.js';
import { IMarkerDecorationsService } from '../../../../editor/common/services/markerDecorations.js';
import { localize } from '../../../../nls.js';
import { MenuId } from '../../../../platform/actions/common/actions.js';
import { IConfigurationService } from '../../../../platform/configuration/common/configuration.js';
import { IContextKey, IContextKeyService } from '../../../../platform/contextkey/common/contextkey.js';
import { IInstantiationService } from '../../../../platform/instantiation/common/instantiation.js';
import { ILogService } from '../../../../platform/log/common/log.js';
import { observableConfigValue } from '../../../../platform/observable/common/platformObservableUtils.js';
import { EditorResourceAccessor, SaveReason } from '../../../common/editor.js';
import { IEditorService, SIDE_GROUP } from '../../../services/editor/common/editorService.js';
import { IChatWidgetLocationOptions } from '../../chat/browser/widget/chatWidget.js';
import { IChatEditingService, ModifiedFileEntryState } from '../../chat/common/editing/chatEditingService.js';
import { ChatMode } from '../../chat/common/chatModes.js';
import { IChatService, IChatToolInvocation, ToolConfirmKind } from '../../chat/common/chatService/chatService.js';
import { IChatRequestVariableEntry, IDiagnosticVariableEntryFilterData } from '../../chat/common/attachments/chatVariableEntries.js';
import { isResponseVM } from '../../chat/common/model/chatViewModel.js';
import { ChatAgentLocation, ChatConfiguration } from '../../chat/common/constants.js';
import { ILanguageModelChatMetadata, ILanguageModelChatSelector, ILanguageModelsService, isILanguageModelChatSelector } from '../../chat/common/languageModels.js';
import { isNotebookContainingCellEditor as isNotebookWithCellEditor } from '../../notebook/browser/notebookEditor.js';
import { INotebookEditorService } from '../../notebook/browser/services/notebookEditorService.js';
import { CellUri } from '../../notebook/common/notebookCommon.js';
import { CTX_INLINE_CHAT_FILE_BELONGS_TO_CHAT, CTX_INLINE_CHAT_TERMINATED, CTX_INLINE_CHAT_VISIBLE, INLINE_CHAT_ID, InlineChatConfigKeys } from '../common/inlineChat.js';
import { InlineChatAffordance } from './inlineChatAffordance.js';
import { continueInPanelChat, IInlineChatSession, IInlineChatSessionService, rephraseInlineChat } from './inlineChatSessionService.js';
import { EditorBasedInlineChatWidget } from './inlineChatWidget.js';
import { InlineChatZoneWidget } from './inlineChatZoneWidget.js';
import { IMarkdownString } from '../../../../base/common/htmlContent.js';

export abstract class InlineChatRunOptions {

	initialSelection?: ISelection;
	initialRange?: IRange;
	message?: string;
	attachments?: URI[];
	autoSend?: boolean;
	position?: IPosition;
	modelSelector?: ILanguageModelChatSelector;
	resolveOnResponse?: boolean;
	attachDiagnostics?: boolean;

	static isInlineChatRunOptions(options: unknown): options is InlineChatRunOptions {

		if (typeof options !== 'object' || options === null) {
			return false;
		}

		const { initialSelection, initialRange, message, autoSend, position, attachments, modelSelector, resolveOnResponse, attachDiagnostics } = <InlineChatRunOptions>options;
		if (
			typeof message !== 'undefined' && typeof message !== 'string'
			|| typeof autoSend !== 'undefined' && typeof autoSend !== 'boolean'
			|| typeof initialRange !== 'undefined' && !Range.isIRange(initialRange)
			|| typeof initialSelection !== 'undefined' && !Selection.isISelection(initialSelection)
			|| typeof position !== 'undefined' && !Position.isIPosition(position)
			|| typeof attachments !== 'undefined' && (!Array.isArray(attachments) || !attachments.every(item => item instanceof URI))
			|| typeof modelSelector !== 'undefined' && !isILanguageModelChatSelector(modelSelector)
			|| typeof resolveOnResponse !== 'undefined' && typeof resolveOnResponse !== 'boolean'
			|| typeof attachDiagnostics !== 'undefined' && typeof attachDiagnostics !== 'boolean'
		) {
			return false;
		}

		return true;
	}
}

// TODO@jrieken THIS should be shared with the code in MainThreadEditors
function getEditorId(editor: ICodeEditor, model: ITextModel): string {
	return `${editor.getId()},${model.id}`;
}

/**
 * Returns the editor range that identifies the Agent Host inline chat target.
 */
export function getAgentHostAttachmentRange(model: ITextModel, selection: Selection | null): IRange | undefined {
	if (!selection) {
		return undefined;
	}
	if (!selection.isEmpty()) {
		return selection;
	}
	return new Range(selection.startLineNumber, 1, selection.startLineNumber, model.getLineMaxColumn(selection.startLineNumber));
}

/** Handles the required save before an Agent Host request can target an untitled editor. */
export class InlineChatUntitledSaveHandler {

	constructor(
		private readonly _isEligible: (resource: URI) => boolean,
		private readonly _editorService: IEditorService,
		private readonly _onSaved: (source: URI, target: URI, message: string) => Promise<void>,
		private readonly _logService: ILogService,
	) { }

	async handle(resource: URI, message: string): Promise<boolean> {
		if (!this._isEligible(resource)) {
			return false;
		}

		const editor = this._editorService.findEditors(resource).at(0);
		if (!editor) {
			return false;
		}

		const result = await this._editorService.save(editor, { reason: SaveReason.EXPLICIT });
		if (!result.success) {
			return true;
		}

		const savedResource = EditorResourceAccessor.getCanonicalUri(result.editors[0]);
		if (!savedResource) {
			this._logService.warn(`[InlineChat] No saved resource returned for untitled resource ${resource.toString()}`);
			return true;
		}

		await this._onSaved(resource, savedResource, message);
		return true;
	}
}

export class InlineChatController implements IEditorContribution {

	static readonly ID = INLINE_CHAT_ID;

	static get(editor: ICodeEditor): InlineChatController | undefined {
		return editor.getContribution<InlineChatController>(InlineChatController.ID) ?? undefined;
	}

	/**
	 * Stores the user's explicitly chosen model (qualified name) from a previous inline chat request in the same session.
	 * When set, this takes priority over the inlineChat.defaultModel setting.
	 */
	static #userSelectedModel: string | undefined;

	readonly #store = new DisposableStore();
	readonly #pendingSessionCts = new MutableDisposable<CancellationTokenSource>();
	readonly #isActiveController = observableValue(this, false);
	readonly #zone: Lazy<InlineChatZoneWidget>;
	readonly inputOverlayWidget: InlineChatAffordance;

	readonly #currentSession: IObservable<IInlineChatSession | undefined>;

	readonly #editor: ICodeEditor;
	readonly #instaService: IInstantiationService;
	readonly #notebookEditorService: INotebookEditorService;
	readonly #inlineChatSessionService: IInlineChatSessionService;
	readonly #codeEditorService: ICodeEditorService;
	readonly #configurationService: IConfigurationService;
	readonly #editorService: IEditorService;
	readonly #markerDecorationsService: IMarkerDecorationsService;
	readonly #languageModelService: ILanguageModelsService;
	readonly #logService: ILogService;
	readonly #chatEditingService: IChatEditingService;
	readonly #chatService: IChatService;
	readonly #ctxInlineChatVisible: IContextKey<boolean>;
	readonly #untitledSaveHandler: InlineChatUntitledSaveHandler;

	get widget(): EditorBasedInlineChatWidget {
		return this.#zone.value.widget;
	}

	get isActive() {
		return Boolean(this.#currentSession.get());
	}

	constructor(
		editor: ICodeEditor,
		@IInstantiationService instaService: IInstantiationService,
		@INotebookEditorService notebookEditorService: INotebookEditorService,
		@IInlineChatSessionService inlineChatSessionService: IInlineChatSessionService,
		@ICodeEditorService codeEditorService: ICodeEditorService,
		@IContextKeyService contextKeyService: IContextKeyService,
		@IConfigurationService configurationService: IConfigurationService,
		@IEditorService editorService: IEditorService,
		@IMarkerDecorationsService markerDecorationsService: IMarkerDecorationsService,
		@ILanguageModelsService languageModelService: ILanguageModelsService,
		@ILogService logService: ILogService,
		@IChatEditingService chatEditingService: IChatEditingService,
		@IChatService chatService: IChatService,
	) {
		this.#editor = editor;
		this.#instaService = instaService;
		this.#notebookEditorService = notebookEditorService;
		this.#inlineChatSessionService = inlineChatSessionService;
		this.#codeEditorService = codeEditorService;
		this.#configurationService = configurationService;
		this.#editorService = editorService;
		this.#markerDecorationsService = markerDecorationsService;
		this.#languageModelService = languageModelService;
		this.#logService = logService;
		this.#chatEditingService = chatEditingService;
		this.#chatService = chatService;
		this.#untitledSaveHandler = new InlineChatUntitledSaveHandler(
			resource => this.#configurationService.getValue<boolean>(ChatConfiguration.InlineChatAgentHostEnabled) === true
				&& !this.#notebookEditorService.getNotebookForPossibleCell(this.#editor)
				&& resource.scheme === Schemas.untitled,
			editorService,
			async (source, target, message) => {
				this.#inlineChatSessionService.getSessionByTextModel(source)?.dispose();
				await this.#replaySavedUntitledInput(target, message);
			},
			logService,
		);

		const editorObs = observableCodeEditor(editor);
		let agentHostAttachmentId: string | undefined;
		let agentHostAttachmentChanges: IObservable<void> | undefined;

		this.#ctxInlineChatVisible = CTX_INLINE_CHAT_VISIBLE.bindTo(contextKeyService);
		this.#store.add(this.#pendingSessionCts);
		const ctxFileBelongsToChat = CTX_INLINE_CHAT_FILE_BELONGS_TO_CHAT.bindTo(contextKeyService);
		const ctxTerminated = CTX_INLINE_CHAT_TERMINATED.bindTo(contextKeyService);
		const notebookAgentConfig = observableConfigValue(InlineChatConfigKeys.NotebookAgent, false, this.#configurationService);

		// Track whether the current editor's file is being edited by any chat editing session
		let initializedZone = false;
		this.#store.add(autorun(r => {
			const model = editorObs.model.read(r);
			if (!model) {
				ctxFileBelongsToChat.set(false);
				return;
			}
			const sessions = this.#chatEditingService.editingSessionsObs.read(r);
			let hasEdits = false;
			for (const session of sessions) {
				const entries = session.entries.read(r);
				for (const entry of entries) {
					if (isEqual(entry.modifiedURI, model.uri)) {
						hasEdits = true;
						break;
					}
				}
				if (hasEdits) {
					break;
				}
			}
			ctxFileBelongsToChat.set(hasEdits);
		}));

		this.inputOverlayWidget = this.#store.add(this.#instaService.createInstance(InlineChatAffordance, this.#editor));

		this.#zone = new Lazy<InlineChatZoneWidget>(() => {

			assertType(this.#editor.hasModel(), '[Illegal State] widget should only be created when the editor has a model');

			const location: IChatWidgetLocationOptions = {
				location: ChatAgentLocation.EditorInline,
				resolveData: () => {
					assertType(this.#editor.hasModel());
					const wholeRange = this.#editor.getSelection();
					const document = this.#editor.getModel().uri;

					return {
						type: ChatAgentLocation.EditorInline,
						id: getEditorId(this.#editor, this.#editor.getModel()),
						selection: this.#editor.getSelection(),
						document,
						wholeRange
					};
				}
			};

			// inline chat in notebooks
			// check if this editor is part of a notebook editor
			// if so, update the location and use the notebook specific widget
			const notebookEditor = this.#notebookEditorService.getNotebookForPossibleCell(this.#editor);
			if (!!notebookEditor) {
				location.location = ChatAgentLocation.Notebook;
				if (notebookAgentConfig.get()) {
					location.resolveData = () => {
						assertType(this.#editor.hasModel());

						return {
							type: ChatAgentLocation.Notebook,
							sessionInputUri: this.#editor.getModel().uri,
						};
					};
				}
			}

			const result = this.#instaService.createInstance(InlineChatZoneWidget,
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
					defaultMode: ChatMode.Ask,
					submitHandler: query => {
						const model = this.#editor.getModel();
						return model ? this.#untitledSaveHandler.handle(model.uri, query) : Promise.resolve(false);
					}
				},
				{ editor: this.#editor, notebookEditor },
				() => Promise.resolve(),
			);

			this.#store.add(result);
			agentHostAttachmentChanges = observableSignalFromEvent(this, result.widget.chatWidget.attachmentModel.onDidChange);

			result.domNode.classList.add('inline-chat-2');

			return result;
		});

		const sessionsSignal = observableSignalFromEvent(this, inlineChatSessionService.onDidChangeSessions);

		this.#currentSession = derived(r => {
			sessionsSignal.read(r);
			const model = editorObs.model.read(r);
			const session = model && inlineChatSessionService.getSessionByTextModel(model.uri);
			return session ?? undefined;
		});


		let lastSession: IInlineChatSession | undefined = undefined;

		this.#store.add(autorun(r => {
			const session = this.#currentSession.read(r);
			if (!session) {
				this.#cancelPendingSession();
				this.#isActiveController.set(false, undefined);

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
				const ctrl = InlineChatController.get(editor);
				if (ctrl && ctrl.#isActiveController.read(undefined)) {
					foundOne = true;
					break;
				}
			}
			if (!foundOne && editorObs.isFocused.read(r)) {
				this.#isActiveController.set(true, undefined);
			}
		}));

		const visibleSessionObs = observableValue<IInlineChatSession | undefined>(this, undefined);

		this.#store.add(autorun(r => {

			const model = editorObs.model.read(r);
			const session = this.#currentSession.read(r);
			const isActive = this.#isActiveController.read(r);

			if (!session || !isActive || !model) {
				visibleSessionObs.set(undefined, undefined);
			} else {
				visibleSessionObs.set(session, undefined);
			}
		}));

		const defaultPlaceholderObs = visibleSessionObs.map((session, r) => {
			return session?.initialSelection.isEmpty()
				? localize('placeholder', "Generate code")
				: localize('placeholderWithSelection', "Modify selected code");
		});

		this.#store.add(autorun(r => {
			const session = visibleSessionObs.read(r);
			ctxTerminated.set(!!session?.terminationState.read(r));
		}));


		this.#store.add(autorun(r => {

			// HIDE/SHOW
			const session = visibleSessionObs.read(r);
			if (!session) {
				initializedZone = false;
				this.#zone.rawValue?.hide();
				this.#zone.rawValue?.widget.chatWidget.setModel(undefined);
				editor.focus();
				this.#ctxInlineChatVisible.reset();
			} else {
				this.#ctxInlineChatVisible.set(true);
				this.#zone.value.widget.chatWidget.setModel(session.chatModel);
				const lockToAgent = session.lockToAgent;
				if (lockToAgent) {
					this.#zone.value.widget.chatWidget.lockToCodingAgent(lockToAgent.name, lockToAgent.displayName, lockToAgent.type, lockToAgent.agentHostProviderId);
				} else {
					this.#zone.value.widget.chatWidget.unlockFromCodingAgent();
				}
				if (!initializedZone) {
					this.#zone.value.widget.chatWidget.setInputPlaceholder(defaultPlaceholderObs.read(r));
					this.#zone.value.widget.chatWidget.input.renderAttachedContext(); // TODO - fights layout bug
					initializedZone = true;
				}
				if (!this.#zone.value.position) {
					this.#zone.value.show(session.initialPosition);
				}
				this.#zone.value.reveal(this.#zone.value.position!);
				this.#zone.value.widget.focus();
			}
		}));

		this.#store.add(autorun(r => {
			const session = visibleSessionObs.read(r);
			const model = editorObs.model.read(r);
			if (!session?.lockToAgent || !model) {
				if (agentHostAttachmentId) {
					this.#zone.rawValue?.widget.chatWidget.attachmentModel.updateContext([agentHostAttachmentId], []);
					agentHostAttachmentId = undefined;
				}
				return;
			}

			const attachmentModel = this.#zone.value.widget.chatWidget.attachmentModel;
			agentHostAttachmentChanges?.read(r);
			const selection = editorObs.cursorSelection.read(r);
			const entry = attachmentModel.asFileVariableEntry(model.uri, getAgentHostAttachmentRange(model, selection));
			attachmentModel.updateContext(agentHostAttachmentId && agentHostAttachmentId !== entry.id ? [agentHostAttachmentId] : [], [entry]);
			agentHostAttachmentId = entry.id;
		}));

		// The legacy inline-chat path cannot use arbitrary tools, so it retains
		// its focused-file approval. Agent Host sessions enforce that scope host-side.
		this.#store.add(autorun(r => {
			const session = this.#currentSession.read(r);
			if (!session || session.lockToAgent) {
				return;
			}
			const lastRequest = session.chatModel.lastRequestObs.read(r);
			const response = lastRequest?.response;
			const pending = response?.isPendingConfirmation.read(r);
			if (pending) {
				this.#logService.info(`[InlineChat] auto-approving: ${pending.detail ?? 'unknown'}`);
				for (const part of response!.response.value) {
					if (part.kind === 'toolInvocation') {
						IChatToolInvocation.confirmWith(part as IChatToolInvocation, { type: ToolConfirmKind.ConfirmationNotNeeded, reason: 'inlineChat' });
					}
				}
			}
		}));

		this.#store.add(autorun(r => {
			const session = visibleSessionObs.read(r);
			if (session) {
				const entries = session.editingSession.entries.read(r);
				const sessionCellUri = CellUri.parse(session.uri);
				const otherEntries = entries.filter(entry => {
					if (isEqual(entry.modifiedURI, session.uri)) {
						return false;
					}
					// Don't count notebooks that include the session's cell
					if (!!sessionCellUri && isEqual(sessionCellUri.notebook, entry.modifiedURI)) {
						return false;
					}
					return true;
				});
				for (const entry of otherEntries) {
					// OPEN other modified files in side group. This is a workaround, temp-solution until we have no more backend
					// that modifies other files
					this.#editorService.openEditor({ resource: entry.modifiedURI }, SIDE_GROUP).catch(onUnexpectedError);
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
			return observableFromEvent(this, response.onDidChange, () => response.response.value.findLast(part =>
				part.kind === 'progressMessage' || part.kind === 'toolInvocation' || part.kind === 'toolInvocationSerialized'
			)).read(r);
		});


		this.#store.add(autorun(r => {
			const session = visibleSessionObs.read(r);
			const response = lastResponseObs.read(r);
			const terminationState = session?.terminationState.read(r);

			this.#zone.rawValue?.widget.updateInfo('');

			if (!response?.isInProgress.read(r)) {

				this.#zone.rawValue?.status.set(response?.result?.details ?? '', undefined);

				if (response?.result?.errorDetails) {
					// ERROR case
					this.#zone.rawValue?.widget.updateInfo(`$(error) ${response.result.errorDetails.message}`);
					alert(response.result.errorDetails.message);
				} else if (terminationState) {
					this.#zone.rawValue?.showTerminationCard(terminationState, this.#instaService);
				}

				if (!terminationState) {
					this.#zone.rawValue?.hideTerminationCard();
				}

				// no response or not in progress
				this.#zone.rawValue?.widget.domNode.classList.toggle('request-in-progress', false);
				this.#zone.rawValue?.widget.chatWidget.setInputPlaceholder(defaultPlaceholderObs.read(r));

			} else {
				this.#zone.rawValue?.widget.domNode.classList.toggle('request-in-progress', true);
				this.#zone.rawValue?.status.set('', undefined);
				r.store.add(autorun(r => {
					let placeholder: string | IMarkdownString | undefined = response.request?.message.text;
					const lastProgress = lastResponseProgressObs.read(r);
					if (lastProgress?.kind === 'progressMessage') {
						placeholder = lastProgress.content;
					} else if (lastProgress?.kind === 'toolInvocationSerialized') {
						placeholder = lastProgress.invocationMessage ?? lastProgress.pastTenseMessage;
					} else if (lastProgress?.kind === 'toolInvocation') {
						const state = lastProgress.state.read(r);
						if (state.type === IChatToolInvocation.StateKind.Executing) {
							placeholder = state.progress.read(r).message;
						} else if (state.type === IChatToolInvocation.StateKind.Streaming) {
							placeholder = state.streamingMessage.read(r);
						} else if (state.type === IChatToolInvocation.StateKind.Completed || state.type === IChatToolInvocation.StateKind.Cancelled) {
							placeholder = lastProgress.pastTenseMessage;
						} else {
							placeholder = lastProgress.invocationMessage;
						}
					}

					// Tool progress messages reference files as empty-text markdown links
					// (`[](file:///…)`) for historical reasons; the link formatter substitutes
					// the file's basename so the placeholder reads naturally.
					const value = typeof placeholder === 'string' ? placeholder : (placeholder ? renderAsPlaintext(placeholder, { useLinkFormatter: true }) : localize('loading', "Working..."));
					this.#zone.rawValue?.widget.chatWidget.setInputPlaceholder(value);
				}));
			}

		}));

		this.#store.add(autorun(r => {
			const session = visibleSessionObs.read(r);
			if (!session) {
				return;
			}

			const entry = session.editingSession.readEntry(session.uri, r);
			if (entry?.state.read(r) === ModifiedFileEntryState.Modified) {
				entry?.enableReviewModeUntilSettled();
			}
		}));


		this.#store.add(autorun(r => {
			const model = editorObs.model.read(r);
			const pane = this.#editorService.visibleEditorPanes.find(candidate => candidate.getControl() === this.#editor || isNotebookWithCellEditor(candidate, this.#editor));
			if (!model || !pane) {
				return;
			}

			for (const session of this.#chatEditingService.editingSessionsObs.read(r)) {
				if (session.isGlobalEditingSession) {
					continue;
				}

				const entry = session.readEntry(model.uri, r);
				if (entry) {
					entry.getEditorIntegration(pane);
					return;
				}
			}
		}));

		this.#store.add(autorun(r => {
			const session = visibleSessionObs.read(r);
			const entry = session?.editingSession.readEntry(session.uri, r);

			// make sure the ZONE isn't inbetween a diff and move above if so
			if (entry?.diffInfo && this.#zone.rawValue?.position) {
				const { position } = this.#zone.rawValue;
				const diff = entry.diffInfo.read(r);

				for (const change of diff.changes) {
					if (change.modified.contains(position.lineNumber)) {
						this.#zone.rawValue?.updatePositionAndHeight(new Position(change.modified.startLineNumber - 1, 1));
						break;
					}
				}
			}
		}));
	}

	async #replaySavedUntitledInput(resource: URI, message: string): Promise<void> {
		const controller = await this.#waitForSavedEditorController(resource);
		if (!controller) {
			this.#logService.warn(`[InlineChat] No editor available after saving untitled resource ${resource.toString()}`);
			return;
		}

		// Must remain un-awaited so the shared widget clears its submit guard before the replay submits.
		void controller.run({ message, autoSend: true }).catch(onUnexpectedError);
	}

	#waitForSavedEditorController(resource: URI): Promise<InlineChatController | undefined> {
		const findController = (): InlineChatController | undefined => {
			for (const editor of this.#codeEditorService.listCodeEditors()) {
				if (isEqual(editor.getModel()?.uri, resource)) {
					return InlineChatController.get(editor);
				}
			}
			return undefined;
		};

		const controller = findController();
		if (controller) {
			return Promise.resolve(controller);
		}

		return new Promise(resolve => {
			const store = new DisposableStore();
			let didComplete = false;
			const complete = (controller: InlineChatController | undefined) => {
				if (didComplete) {
					return;
				}
				didComplete = true;
				store.dispose();
				resolve(controller);
			};
			store.add(Event.any(this.#editorService.onDidActiveEditorChange, this.#editorService.onDidVisibleEditorsChange)(() => {
				const controller = findController();
				if (controller) {
					complete(controller);
				}
			}));
			store.add(disposableTimeout(() => complete(undefined), 5_000));

			const controller = findController();
			if (controller) {
				complete(controller);
			}
		});
	}

	dispose(): void {
		this.#cancelPendingSession();
		this.#store.dispose();
	}

	getWidgetPosition(): Position | undefined {
		return this.#zone.rawValue?.position;
	}

	focus() {
		this.#zone.rawValue?.widget.focus();
	}

	async run(arg?: InlineChatRunOptions): Promise<boolean> {
		assertType(this.#editor.hasModel());
		this.#cancelPendingSession();
		const uri = this.#editor.getModel().uri;

		const existingSession = this.#inlineChatSessionService.getSessionByTextModel(uri);
		if (existingSession) {
			await existingSession.editingSession.accept();
			existingSession.dispose();
		}

		this.#isActiveController.set(true, undefined);
		this.#ctxInlineChatVisible.set(true);

		const initialPosition = this.#editor.getSelection().getStartPosition().delta(-1);
		this.#zone.value.show(initialPosition);
		this.#zone.value.widget.focus();
		const sessionCts = new CancellationTokenSource();
		this.#pendingSessionCts.value = sessionCts;
		try {
			const session = await this.#inlineChatSessionService.createSession(this.#editor, !!this.#notebookEditorService.getNotebookForPossibleCell(this.#editor), sessionCts.token);
			if (sessionCts.token.isCancellationRequested) {
				session.dispose();
				throw new CancellationError();
			}
			if (this.#pendingSessionCts.value === sessionCts) {
				this.#pendingSessionCts.clear();
			}
			return this.#runZone(session, arg);
		} catch (error) {
			if (isCancellationError(error)) {
				if (this.#pendingSessionCts.value === sessionCts) {
					this.#cancelPendingSessionAndHide();
				}
				return false;
			}
			throw error;
		} finally {
			if (this.#pendingSessionCts.value === sessionCts) {
				this.#pendingSessionCts.clear();
			}
		}
	}

	#cancelPendingSession(): void {
		const sessionCts = this.#pendingSessionCts.value;
		if (sessionCts) {
			sessionCts.cancel();
			this.#pendingSessionCts.clear();
		}
	}

	#cancelPendingSessionAndHide(): void {
		this.#cancelPendingSession();
		this.#isActiveController.set(false, undefined);
		this.#zone.rawValue?.hide();
		this.#zone.rawValue?.widget.chatWidget.setModel(undefined);
		this.#editor.focus();
		this.#ctxInlineChatVisible.reset();
	}

	/**
	 * Zone mode: use the full zone widget and chat widget for request submission.
	 */
	async #runZone(session: IInlineChatSession, arg?: InlineChatRunOptions): Promise<boolean> {
		assertType(this.#editor.hasModel());
		const uri = this.#editor.getModel().uri;

		// Store for tracking model changes during this session
		const sessionStore = new DisposableStore();

		try {
			await this.#applyModelDefaults(session, sessionStore);

			if (arg) {
				arg.attachDiagnostics ??= true;
			}

			// ADD diagnostics (only when explicitly requested)
			if (arg?.attachDiagnostics) {
				const entries: IChatRequestVariableEntry[] = [];
				for (const [range, marker] of this.#markerDecorationsService.getLiveMarkers(uri)) {
					if (range.intersectRanges(this.#editor.getSelection())) {
						const filter = IDiagnosticVariableEntryFilterData.fromMarker(marker);
						entries.push(IDiagnosticVariableEntryFilterData.toEntry(filter));
					}
				}
				if (entries.length > 0) {
					this.#zone.value.widget.chatWidget.attachmentModel.addContext(...entries);
					const msg = entries.length > 1
						? localize('fixN', "Fix the attached problems")
						: localize('fix1', "Fix the attached problem");
					this.#zone.value.widget.chatWidget.input.setValue(msg, true);
					arg.message = msg;
					this.#zone.value.widget.chatWidget.inputEditor.setSelection(new Selection(1, 1, Number.MAX_SAFE_INTEGER, 1));
				}
			}

			// Check args
			if (arg && InlineChatRunOptions.isInlineChatRunOptions(arg)) {
				if (arg.initialRange) {
					this.#editor.revealRange(arg.initialRange);
				}
				if (arg.initialSelection) {
					this.#editor.setSelection(arg.initialSelection);
				}
				if (arg.attachments) {
					await Promise.all(arg.attachments.map(async attachment => {
						await this.#zone.value.widget.chatWidget.attachmentModel.addFile(attachment);
					}));
					delete arg.attachments;
				}
				if (arg.modelSelector) {
					const id = (await this.#languageModelService.selectLanguageModels(arg.modelSelector)).sort().at(0);
					if (!id) {
						throw new Error(`No language models found matching selector: ${JSON.stringify(arg.modelSelector)}.`);
					}
					const model = this.#languageModelService.lookupLanguageModel(id);
					if (!model) {
						throw new Error(`Language model not loaded: ${id}.`);
					}
					this.#zone.value.widget.chatWidget.input.setCurrentLanguageModel({ metadata: model, identifier: id }, true);
				}
				if (arg.message) {
					this.#zone.value.widget.chatWidget.setInput(arg.message);
					if (arg.autoSend) {
						await this.#zone.value.widget.chatWidget.acceptInput();
					}
				}
			}

			if (!arg?.resolveOnResponse) {
				// DEFAULT: wait for the session to be accepted or rejected
				await Event.toPromise(session.editingSession.onDidDispose);
				const rejected = session.editingSession.getEntry(uri)?.state.get() === ModifiedFileEntryState.Rejected;
				return !rejected;

			} else {
				// resolveOnResponse: ONLY wait for the file to be modified
				const modifiedObs = derived(r => {
					const entry = session.editingSession.readEntry(uri, r);
					return entry?.state.read(r) === ModifiedFileEntryState.Modified && !entry?.isCurrentlyBeingModifiedBy.read(r);
				});
				await waitForState(modifiedObs, state => state === true);
				return true;
			}
		} finally {
			sessionStore.dispose();
		}
	}

	async acceptSession() {
		const session = this.#currentSession.get();
		if (!session) {
			return;
		}
		await session.editingSession.accept();
		session.dispose();
	}

	async rejectSession() {
		const session = this.#currentSession.get();
		if (!session) {
			this.#cancelPendingSessionAndHide();
			return;
		}
		await this.#chatService.cancelCurrentRequestForSession(session.chatModel.sessionResource, 'inlineChatReject');
		await session.editingSession.reject();
		session.dispose();
	}

	async continueSessionInChat(): Promise<void> {
		const session = this.#currentSession.get();
		if (!session) {
			return;
		}

		await this.#instaService.invokeFunction(continueInPanelChat, session);
	}

	async rephraseSession(): Promise<void> {
		const session = this.#currentSession.get();
		if (!session) {
			return;
		}

		// Clear termination state and restore input text in the chat widget.
		// The autorun watching terminationState will flip the card back automatically.
		const requestText = this.#instaService.invokeFunction(rephraseInlineChat, session);
		if (requestText) {
			this.#zone.rawValue?.widget.chatWidget.setInput(requestText);
		}
		this.#zone.rawValue?.widget.focus();
	}

	async #selectVendorDefaultModel(session: IInlineChatSession): Promise<void> {
		const model = this.#zone.value.widget.chatWidget.input.selectedLanguageModel.get();
		if (model && !model.metadata.isDefaultForLocation[session.chatModel.initialLocation]) {
			const ids = await this.#languageModelService.selectLanguageModels({ vendor: model.metadata.vendor });
			for (const identifier of ids) {
				const candidate = this.#languageModelService.lookupLanguageModel(identifier);
				if (candidate?.isDefaultForLocation[session.chatModel.initialLocation]) {
					this.#zone.value.widget.chatWidget.input.setCurrentLanguageModel({ metadata: candidate, identifier });
					break;
				}
			}
		}
	}

	/**
	 * Applies model defaults based on settings and tracks user model changes.
	 * Prioritization: user session choice > inlineChat.defaultModel setting > vendor default
	 */
	async #applyModelDefaults(session: IInlineChatSession, sessionStore: DisposableStore): Promise<void> {
		const userSelectedModel = InlineChatController.#userSelectedModel;
		const defaultModelSetting = this.#configurationService.getValue<string>(InlineChatConfigKeys.DefaultModel);

		let modelApplied = false;

		// 1. Try user's explicitly chosen model from a previous inline chat in the same session
		if (userSelectedModel) {
			modelApplied = this.#zone.value.widget.chatWidget.input.switchModelByQualifiedName([userSelectedModel]);
			if (!modelApplied) {
				// User's previously selected model is no longer available, clear it
				InlineChatController.#userSelectedModel = undefined;
			}
		}

		// 2. Try inlineChat.defaultModel setting
		if (!modelApplied && defaultModelSetting) {
			modelApplied = this.#zone.value.widget.chatWidget.input.switchModelByQualifiedName([defaultModelSetting]);
			if (!modelApplied) {
				this.#logService.warn(`inlineChat.defaultModel setting value '${defaultModelSetting}' did not match any available model. Falling back to vendor default.`);
			}
		}

		// 3. Fall back to vendor default
		if (!modelApplied) {
			await this.#selectVendorDefaultModel(session);
		}

		// Track model changes - store user's explicit choice in the given sessions.
		// NOTE: This currently detects any model change, not just user-initiated ones.
		let initialModelId: string | undefined;
		sessionStore.add(autorun(r => {
			const newModel = this.#zone.value.widget.chatWidget.input.selectedLanguageModel.read(r);
			if (!newModel) {
				return;
			}
			if (!initialModelId) {
				initialModelId = newModel.identifier;
				return;
			}
			if (initialModelId !== newModel.identifier) {
				// User explicitly changed model, store their choice as qualified name
				InlineChatController.#userSelectedModel = ILanguageModelChatMetadata.asQualifiedName(newModel.metadata);
				initialModelId = newModel.identifier;
			}
		}));
	}
}
