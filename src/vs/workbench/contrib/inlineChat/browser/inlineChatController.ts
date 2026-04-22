/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { renderAsPlaintext } from '../../../../base/browser/markdownRenderer.js';
import { alert } from '../../../../base/browser/ui/aria/aria.js';
import { raceCancellation } from '../../../../base/common/async.js';
import { CancellationToken } from '../../../../base/common/cancellation.js';
import { onUnexpectedError } from '../../../../base/common/errors.js';
import { Event } from '../../../../base/common/event.js';
import { Lazy } from '../../../../base/common/lazy.js';
import { DisposableStore } from '../../../../base/common/lifecycle.js';
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
import { TextEdit } from '../../../../editor/common/languages.js';
import { ITextModel } from '../../../../editor/common/model.js';
import { IMarkerDecorationsService } from '../../../../editor/common/services/markerDecorations.js';
import { EditSuggestionId } from '../../../../editor/common/textModelEditSource.js';
import { localize } from '../../../../nls.js';
import { MenuId } from '../../../../platform/actions/common/actions.js';
import { IConfigurationService } from '../../../../platform/configuration/common/configuration.js';
import { IContextKeyService } from '../../../../platform/contextkey/common/contextkey.js';
import { IFileService } from '../../../../platform/files/common/files.js';
import { IInstantiationService, ServicesAccessor } from '../../../../platform/instantiation/common/instantiation.js';
import { ILogService } from '../../../../platform/log/common/log.js';
import { observableConfigValue } from '../../../../platform/observable/common/platformObservableUtils.js';
import { ISharedWebContentExtractorService } from '../../../../platform/webContentExtractor/common/webContentExtractor.js';
import { IEditorService, SIDE_GROUP } from '../../../services/editor/common/editorService.js';
import { IChatAttachmentResolveService } from '../../chat/browser/attachments/chatAttachmentResolveService.js';
import { IChatWidgetLocationOptions } from '../../chat/browser/widget/chatWidget.js';
import { IChatEditingService, ModifiedFileEntryState } from '../../chat/common/editing/chatEditingService.js';
import { ChatModel } from '../../chat/common/model/chatModel.js';
import { ChatMode } from '../../chat/common/chatModes.js';
import { IChatLocationData, IChatService, IChatToolInvocation, ToolConfirmKind } from '../../chat/common/chatService/chatService.js';
import { IChatRequestVariableEntry, IDiagnosticVariableEntryFilterData } from '../../chat/common/attachments/chatVariableEntries.js';
import { isResponseVM } from '../../chat/common/model/chatViewModel.js';
import { ChatAgentLocation, ChatModeKind } from '../../chat/common/constants.js';
import { ILanguageModelChatMetadata, ILanguageModelChatSelector, ILanguageModelsService, isILanguageModelChatSelector } from '../../chat/common/languageModels.js';
import { isNotebookContainingCellEditor as isNotebookWithCellEditor } from '../../notebook/browser/notebookEditor.js';
import { INotebookEditorService } from '../../notebook/browser/services/notebookEditorService.js';
import { CellUri, ICellEditOperation } from '../../notebook/common/notebookCommon.js';
import { INotebookService } from '../../notebook/common/notebookService.js';
import { CTX_INLINE_CHAT_FILE_BELONGS_TO_CHAT, CTX_INLINE_CHAT_PENDING_CONFIRMATION, CTX_INLINE_CHAT_TERMINATED, CTX_INLINE_CHAT_VISIBLE, InlineChatConfigKeys } from '../common/inlineChat.js';
import { InlineChatAffordance } from './inlineChatAffordance.js';
import { InlineChatInputWidget, InlineChatSessionOverlayWidget } from './inlineChatOverlayWidget.js';
import { continueInPanelChat, IInlineChatSession2, IInlineChatSessionService, rephraseInlineChat } from './inlineChatSessionService.js';
import { EditorBasedInlineChatWidget } from './inlineChatWidget.js';
import { InlineChatZoneWidget } from './inlineChatZoneWidget.js';

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

export class InlineChatController implements IEditorContribution {

	static readonly ID = 'editor.contrib.inlineChatController';

	static get(editor: ICodeEditor): InlineChatController | undefined {
		return editor.getContribution<InlineChatController>(InlineChatController.ID) ?? undefined;
	}

	/**
	 * Stores the user's explicitly chosen model (qualified name) from a previous inline chat request in the same session.
	 * When set, this takes priority over the inlineChat.defaultModel setting.
	 */
	static #userSelectedModel: string | undefined;

	readonly #store = new DisposableStore();
	readonly #isActiveController = observableValue(this, false);
	readonly #renderMode: IObservable<'zone' | 'hover'>;
	readonly #zone: Lazy<InlineChatZoneWidget>;
	readonly inputOverlayWidget: InlineChatAffordance;
	readonly #inputWidget: InlineChatInputWidget;

	readonly #currentSession: IObservable<IInlineChatSession2 | undefined>;

	readonly #editor: ICodeEditor;
	readonly #instaService: IInstantiationService;
	readonly #notebookEditorService: INotebookEditorService;
	readonly #inlineChatSessionService: IInlineChatSessionService;
	readonly #configurationService: IConfigurationService;
	readonly #webContentExtractorService: ISharedWebContentExtractorService;
	readonly #fileService: IFileService;
	readonly #chatAttachmentResolveService: IChatAttachmentResolveService;
	readonly #editorService: IEditorService;
	readonly #markerDecorationsService: IMarkerDecorationsService;
	readonly #languageModelService: ILanguageModelsService;
	readonly #logService: ILogService;
	readonly #chatEditingService: IChatEditingService;
	readonly #chatService: IChatService;

	get widget(): EditorBasedInlineChatWidget {
		return this.#zone.value.widget;
	}

	get isActive() {
		return Boolean(this.#currentSession.get());
	}

	get inputWidget(): InlineChatInputWidget {
		return this.#inputWidget;
	}

	constructor(
		editor: ICodeEditor,
		@IInstantiationService instaService: IInstantiationService,
		@INotebookEditorService notebookEditorService: INotebookEditorService,
		@IInlineChatSessionService inlineChatSessionService: IInlineChatSessionService,
		@ICodeEditorService codeEditorService: ICodeEditorService,
		@IContextKeyService contextKeyService: IContextKeyService,
		@IConfigurationService configurationService: IConfigurationService,
		@ISharedWebContentExtractorService webContentExtractorService: ISharedWebContentExtractorService,
		@IFileService fileService: IFileService,
		@IChatAttachmentResolveService chatAttachmentResolveService: IChatAttachmentResolveService,
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
		this.#configurationService = configurationService;
		this.#webContentExtractorService = webContentExtractorService;
		this.#fileService = fileService;
		this.#chatAttachmentResolveService = chatAttachmentResolveService;
		this.#editorService = editorService;
		this.#markerDecorationsService = markerDecorationsService;
		this.#languageModelService = languageModelService;
		this.#logService = logService;
		this.#chatEditingService = chatEditingService;
		this.#chatService = chatService;

		const editorObs = observableCodeEditor(editor);

		const ctxInlineChatVisible = CTX_INLINE_CHAT_VISIBLE.bindTo(contextKeyService);
		const ctxFileBelongsToChat = CTX_INLINE_CHAT_FILE_BELONGS_TO_CHAT.bindTo(contextKeyService);
		const ctxPendingConfirmation = CTX_INLINE_CHAT_PENDING_CONFIRMATION.bindTo(contextKeyService);
		const ctxTerminated = CTX_INLINE_CHAT_TERMINATED.bindTo(contextKeyService);
		const notebookAgentConfig = observableConfigValue(InlineChatConfigKeys.notebookAgent, false, this.#configurationService);
		this.#renderMode = observableConfigValue(InlineChatConfigKeys.RenderMode, 'zone', this.#configurationService);

		// Track whether the current editor's file is being edited by any chat editing session
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

		const overlayWidget = this.#inputWidget = this.#store.add(this.#instaService.createInstance(InlineChatInputWidget, editorObs));
		const sessionOverlayWidget = this.#store.add(this.#instaService.createInstance(InlineChatSessionOverlayWidget, editorObs));
		this.inputOverlayWidget = this.#store.add(this.#instaService.createInstance(InlineChatAffordance, this.#editor, overlayWidget));

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
					defaultMode: ChatMode.Ask
				},
				{ editor: this.#editor, notebookEditor },
				() => Promise.resolve(),
			);

			this.#store.add(result);

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


		let lastSession: IInlineChatSession2 | undefined = undefined;

		this.#store.add(autorun(r => {
			const session = this.#currentSession.read(r);
			if (!session) {
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

		const visibleSessionObs = observableValue<IInlineChatSession2 | undefined>(this, undefined);

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
			const renderMode = this.#renderMode.read(r);
			if (!session) {
				this.#zone.rawValue?.hide();
				this.#zone.rawValue?.widget.chatWidget.setModel(undefined);
				editor.focus();
				ctxInlineChatVisible.reset();
			} else if (renderMode === 'hover') {
				// hover mode: no zone widget needed, keep focus in editor
				ctxInlineChatVisible.set(true);
			} else {
				ctxInlineChatVisible.set(true);
				this.#zone.value.widget.chatWidget.setModel(session.chatModel);
				if (!this.#zone.value.position) {
					this.#zone.value.widget.chatWidget.setInputPlaceholder(defaultPlaceholderObs.read(r));
					this.#zone.value.widget.chatWidget.input.renderAttachedContext(); // TODO - fights layout bug
					this.#zone.value.show(session.initialPosition);
				}
				this.#zone.value.reveal(this.#zone.value.position!);
				this.#zone.value.widget.focus();
			}
		}));

		// Show progress overlay widget in hover mode when a request is in progress or edits are not yet settled
		this.#store.add(autorun(r => {
			const session = visibleSessionObs.read(r);
			const renderMode = this.#renderMode.read(r);
			if (!session || renderMode !== 'hover') {
				ctxPendingConfirmation.set(false);
				sessionOverlayWidget.hide();
				return;
			}
			const lastRequest = session.chatModel.lastRequestObs.read(r);
			const isInProgress = lastRequest?.response?.isInProgress.read(r);
			const isPendingConfirmation = !!lastRequest?.response?.isPendingConfirmation.read(r);
			const isError = !!lastRequest?.response?.result?.errorDetails;
			const isTerminated = !!session.terminationState.read(r);
			ctxPendingConfirmation.set(isPendingConfirmation);
			const entry = session.editingSession.readEntry(session.uri, r);
			// When there's no entry (no changes made) and the response is complete, the widget should be hidden.
			// When there's an entry in Modified state, it needs to be settled (accepted/rejected).
			const isNotSettled = entry ? entry.state.read(r) === ModifiedFileEntryState.Modified : false;
			if (isInProgress || isNotSettled || isPendingConfirmation || isError || isTerminated) {
				sessionOverlayWidget.show(session);
			} else {
				sessionOverlayWidget.hide();
			}
		}));

		// Auto-approve tool confirmations for inline chat. The user implicitly
		// consents to editing the current file by invoking inline chat on it,
		// even if the file qualifies as a sensitive file.
		this.#store.add(autorun(r => {
			const session = this.#currentSession.read(r);
			if (!session) {
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
			return observableFromEvent(this, response.onDidChange, () => response.response.value.findLast(part => part.kind === 'progressMessage')).read(r);
		});


		this.#store.add(autorun(r => {
			const session = visibleSessionObs.read(r);
			const response = lastResponseObs.read(r);
			const terminationState = session?.terminationState.read(r);
			const renderMode = this.#renderMode.read(r);

			this.#zone.rawValue?.widget.updateInfo('');

			if (!response?.isInProgress.read(r)) {

				if (response?.result?.errorDetails) {
					// ERROR case
					this.#zone.rawValue?.widget.updateInfo(`$(error) ${response.result.errorDetails.message}`);
					alert(response.result.errorDetails.message);
				} else if (terminationState && renderMode === 'zone') {
					// Zone mode: show termination card with message and action buttons
					this.#zone.rawValue?.showTerminationCard(terminationState, this.#instaService);
				} else if (terminationState) {
					this.#zone.rawValue?.widget.updateInfo(`$(info) ${renderAsPlaintext(terminationState)}`);
				}

				if (!terminationState || renderMode !== 'zone') {
					this.#zone.rawValue?.hideTerminationCard();
				}

				// no response or not in progress
				this.#zone.rawValue?.widget.domNode.classList.toggle('request-in-progress', false);
				this.#zone.rawValue?.widget.chatWidget.setInputPlaceholder(defaultPlaceholderObs.read(r));

			} else {
				this.#zone.rawValue?.widget.domNode.classList.toggle('request-in-progress', true);
				let placeholder = response.request?.message.text;
				const lastProgress = lastResponseProgressObs.read(r);
				if (lastProgress) {
					placeholder = renderAsPlaintext(lastProgress.content);
				}
				this.#zone.rawValue?.widget.chatWidget.setInputPlaceholder(placeholder || localize('loading', "Working..."));
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

			const session = visibleSessionObs.read(r);
			const entry = session?.editingSession.readEntry(session.uri, r);

			// make sure there is an editor integration
			const pane = this.#editorService.visibleEditorPanes.find(candidate => candidate.getControl() === this.#editor || isNotebookWithCellEditor(candidate, this.#editor));
			if (pane && entry) {
				entry?.getEditorIntegration(pane);
			}

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

	dispose(): void {
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
		const uri = this.#editor.getModel().uri;

		const existingSession = this.#inlineChatSessionService.getSessionByTextModel(uri);
		if (existingSession) {
			await existingSession.editingSession.accept();
			existingSession.dispose();
		}

		this.#isActiveController.set(true, undefined);

		const session = this.#inlineChatSessionService.createSession(this.#editor);

		if (this.#renderMode.get() === 'hover') {
			return this.#runHover(session, arg);
		} else {
			return this.#runZone(session, arg);
		}
	}

	/**
	 * Hover mode: submit requests directly via IChatService.sendRequest without
	 * instantiating the zone widget.
	 */
	async #runHover(session: IInlineChatSession2, arg?: InlineChatRunOptions): Promise<boolean> {
		assertType(this.#editor.hasModel());
		const uri = this.#editor.getModel().uri;


		// Apply editor adjustments from args
		if (arg && InlineChatRunOptions.isInlineChatRunOptions(arg)) {
			if (arg.initialRange) {
				this.#editor.revealRange(arg.initialRange);
			}
			if (arg.initialSelection) {
				this.#editor.setSelection(arg.initialSelection);
			}
		}

		// Build location data (after selection adjustments)
		const { location, locationData } = this.#buildLocationData();

		// Resolve model
		let userSelectedModelId: string | undefined;
		if (arg?.modelSelector) {
			userSelectedModelId = (await this.#languageModelService.selectLanguageModels(arg.modelSelector)).sort().at(0);
			if (!userSelectedModelId) {
				throw new Error(`No language models found matching selector: ${JSON.stringify(arg.modelSelector)}.`);
			}
		} else {
			userSelectedModelId = await this.#resolveModelId(location);
		}

		// Collect attachments
		const attachedContext: IChatRequestVariableEntry[] = [];
		if (arg?.attachments) {
			for (const attachment of arg.attachments) {
				const resolved = await this.#chatAttachmentResolveService.resolveImageEditorAttachContext(attachment);
				if (resolved) {
					attachedContext.push(resolved);
				}
			}
		}

		// ADD diagnostics (only when explicitly requested)
		if (arg?.attachDiagnostics) {
			for (const [range, marker] of this.#markerDecorationsService.getLiveMarkers(uri)) {
				if (range.intersectRanges(this.#editor.getSelection())) {
					const filter = IDiagnosticVariableEntryFilterData.fromMarker(marker);
					attachedContext.push(IDiagnosticVariableEntryFilterData.toEntry(filter));
				}
			}
			if (attachedContext.length > 0 && !arg.message) {
				arg.message = attachedContext.length > 1
					? localize('fixN', "Fix the attached problems")
					: localize('fix1', "Fix the attached problem");
			}
		}

		// Send the request directly
		if (arg?.message && arg.autoSend) {
			await this.#chatService.sendRequest(
				session.chatModel.sessionResource,
				arg.message,
				{
					userSelectedModelId,
					location,
					locationData,
					attachedContext: attachedContext.length > 0 ? attachedContext : undefined,
					modeInfo: {
						kind: ChatModeKind.Ask,
						isBuiltin: true,
						modeInstructions: undefined,
						modeId: 'ask',
						applyCodeBlockSuggestionId: undefined,
					},
				}
			);
		}

		if (!arg?.resolveOnResponse) {
			await Event.toPromise(session.editingSession.onDidDispose);
			const rejected = session.editingSession.getEntry(uri)?.state.get() === ModifiedFileEntryState.Rejected;
			return !rejected;
		} else {
			const modifiedObs = derived(r => {
				const entry = session.editingSession.readEntry(uri, r);
				return entry?.state.read(r) === ModifiedFileEntryState.Modified && !entry?.isCurrentlyBeingModifiedBy.read(r);
			});
			await waitForState(modifiedObs, state => state === true);
			return true;
		}
	}

	/**
	 * Zone mode: use the full zone widget and chat widget for request submission.
	 */
	async #runZone(session: IInlineChatSession2, arg?: InlineChatRunOptions): Promise<boolean> {
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
					this.#zone.value.widget.chatWidget.input.setCurrentLanguageModel({ metadata: model, identifier: id });
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

		if (this.#renderMode.get() === 'zone') {
			// Zone mode: clear termination state and restore input text in the chat widget.
			// The autorun watching terminationState will flip the card back automatically.
			const requestText = this.#instaService.invokeFunction(rephraseInlineChat, session);
			if (requestText) {
				this.#zone.rawValue?.widget.chatWidget.setInput(requestText);
			}
			this.#zone.rawValue?.widget.focus();
			return;
		}

		const requestText = session.chatModel.getRequests().at(-1)?.message.text;
		session.dispose();

		if (!requestText) {
			return;
		}

		const selection = this.#editor.getSelection();
		const placeholder = selection && !selection.isEmpty()
			? localize('placeholderWithSelectionHover', "Describe how to change this")
			: localize('placeholderNoSelectionHover', "Describe what to generate");
		await this.inputOverlayWidget.showMenuAtSelection(placeholder, requestText);
	}

	async #selectVendorDefaultModel(session: IInlineChatSession2): Promise<void> {
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
	 * Resolves the language model identifier without going through the zone widget.
	 * Used in hover mode to avoid instantiating the zone widget.
	 *
	 * Priority: user session choice > inlineChat.defaultModel setting > vendor default for location
	 */
	async #resolveModelId(location: ChatAgentLocation): Promise<string | undefined> {
		const userSelectedModel = InlineChatController.#userSelectedModel;
		const defaultModelSetting = this.#configurationService.getValue<string>(InlineChatConfigKeys.DefaultModel);

		// 1. Try user's explicitly chosen model from a previous inline chat
		if (userSelectedModel) {
			const match = this.#languageModelService.lookupLanguageModelByQualifiedName(userSelectedModel);
			if (match) {
				return match.identifier;
			}
			// Previously selected model is no longer available
			InlineChatController.#userSelectedModel = undefined;
		}

		// 2. Try inlineChat.defaultModel setting
		if (defaultModelSetting) {
			const match = this.#languageModelService.lookupLanguageModelByQualifiedName(defaultModelSetting);
			if (match) {
				return match.identifier;
			}
			this.#logService.warn(`inlineChat.defaultModel setting value '${defaultModelSetting}' did not match any available model. Falling back to vendor default.`);
		}

		// 3. Fall back to vendor default for the given location
		for (const id of this.#languageModelService.getLanguageModelIds()) {
			const metadata = this.#languageModelService.lookupLanguageModel(id);
			if (metadata?.isDefaultForLocation[location]) {
				return id;
			}
		}

		return undefined;
	}

	/**
	 * Builds location data for chat requests without going through the zone widget.
	 */
	#buildLocationData(): { location: ChatAgentLocation; locationData: IChatLocationData } {
		assertType(this.#editor.hasModel());

		const notebookEditor = this.#notebookEditorService.getNotebookForPossibleCell(this.#editor);
		if (notebookEditor) {
			const useNotebookAgent = this.#configurationService.getValue<boolean>(InlineChatConfigKeys.notebookAgent);
			if (useNotebookAgent) {
				return {
					location: ChatAgentLocation.Notebook,
					locationData: {
						type: ChatAgentLocation.Notebook,
						sessionInputUri: this.#editor.getModel().uri,
					}
				};
			}
			// Notebook cell but notebookAgent config is off: use Notebook location
			// but with EditorInline-shaped locationData (matches zone widget behavior)
			return {
				location: ChatAgentLocation.Notebook,
				locationData: {
					type: ChatAgentLocation.EditorInline,
					id: getEditorId(this.#editor, this.#editor.getModel()),
					selection: this.#editor.getSelection(),
					document: this.#editor.getModel().uri,
					wholeRange: this.#editor.getSelection(),
				}
			};
		}

		return {
			location: ChatAgentLocation.EditorInline,
			locationData: {
				type: ChatAgentLocation.EditorInline,
				id: getEditorId(this.#editor, this.#editor.getModel()),
				selection: this.#editor.getSelection(),
				document: this.#editor.getModel().uri,
				wholeRange: this.#editor.getSelection(),
			}
		};
	}

	/**
	 * Applies model defaults based on settings and tracks user model changes.
	 * Prioritization: user session choice > inlineChat.defaultModel setting > vendor default
	 */
	async #applyModelDefaults(session: IInlineChatSession2, sessionStore: DisposableStore): Promise<void> {
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

	async createImageAttachment(attachment: URI): Promise<IChatRequestVariableEntry | undefined> {
		const value = this.#currentSession.get();
		if (!value) {
			return undefined;
		}
		if (attachment.scheme === Schemas.file) {
			if (await this.#fileService.canHandleResource(attachment)) {
				return await this.#chatAttachmentResolveService.resolveImageEditorAttachContext(attachment);
			}
		} else if (attachment.scheme === Schemas.http || attachment.scheme === Schemas.https) {
			const extractedImages = await this.#webContentExtractorService.readImage(attachment, CancellationToken.None);
			if (extractedImages) {
				return await this.#chatAttachmentResolveService.resolveImageEditorAttachContext(attachment, extractedImages);
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
	const chatModelRef = chatService.startNewLocalSession(ChatAgentLocation.EditorInline);
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
	const chatModelRef = chatService.startNewLocalSession(ChatAgentLocation.EditorInline);
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
