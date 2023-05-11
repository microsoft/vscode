/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { renderMarkdown } from 'vs/base/browser/markdownRenderer';
import { DeferredPromise, raceCancellationError } from 'vs/base/common/async';
import { CancellationTokenSource } from 'vs/base/common/cancellation';
import { DisposableStore } from 'vs/base/common/lifecycle';
import { isEqual } from 'vs/base/common/resources';
import { StopWatch } from 'vs/base/common/stopwatch';
import { assertType } from 'vs/base/common/types';
import 'vs/css!./interactiveEditor';
import { ICodeEditor } from 'vs/editor/browser/editorBrowser';
import { EditOperation } from 'vs/editor/common/core/editOperation';
import { Position } from 'vs/editor/common/core/position';
import { IRange, Range } from 'vs/editor/common/core/range';
import { IEditorContribution, IEditorDecorationsCollection } from 'vs/editor/common/editorCommon';
import { ModelDecorationOptions, createTextBufferFactoryFromSnapshot } from 'vs/editor/common/model/textModel';
import { IEditorWorkerService } from 'vs/editor/common/services/editorWorker';
import { IModelService } from 'vs/editor/common/services/model';
import { InlineCompletionsController } from 'vs/editor/contrib/inlineCompletions/browser/inlineCompletionsController';
import { localize } from 'vs/nls';
import { IConfigurationService } from 'vs/platform/configuration/common/configuration';
import { IContextKey, IContextKeyService } from 'vs/platform/contextkey/common/contextkey';
import { IInstantiationService, ServicesAccessor } from 'vs/platform/instantiation/common/instantiation';
import { ILogService } from 'vs/platform/log/common/log';
import { EditResponse, EmptyResponse, ErrorResponse, IInteractiveEditorSessionService, MarkdownResponse, Session, SessionExchange } from 'vs/workbench/contrib/interactiveEditor/browser/interactiveEditorSession';
import { EditModeStrategy, LivePreviewStrategy, LiveStrategy, PreviewStrategy } from 'vs/workbench/contrib/interactiveEditor/browser/interactiveEditorStrategies';
import { InteractiveEditorZoneWidget } from 'vs/workbench/contrib/interactiveEditor/browser/interactiveEditorWidget';
import { CTX_INTERACTIVE_EDITOR_HAS_ACTIVE_REQUEST, CTX_INTERACTIVE_EDITOR_LAST_EDIT_TYPE as CTX_INTERACTIVE_EDITOR_LAST_EDIT_KIND, CTX_INTERACTIVE_EDITOR_LAST_FEEDBACK as CTX_INTERACTIVE_EDITOR_LAST_FEEDBACK_KIND, IInteractiveEditorRequest, IInteractiveEditorResponse, INTERACTIVE_EDITOR_ID, EditMode, InteractiveEditorResponseFeedbackKind, CTX_INTERACTIVE_EDITOR_LAST_RESPONSE_TYPE, InteractiveEditorResponseType } from 'vs/workbench/contrib/interactiveEditor/common/interactiveEditor';
import { IInteractiveSessionWidgetService } from 'vs/workbench/contrib/interactiveSession/browser/interactiveSessionWidget';
import { IInteractiveSessionService } from 'vs/workbench/contrib/interactiveSession/common/interactiveSessionService';
import { INotebookEditorService } from 'vs/workbench/contrib/notebook/browser/services/notebookEditorService';
import { CellUri } from 'vs/workbench/contrib/notebook/common/notebookCommon';


const enum SessionState {
	CREATE_SESSION,
	INIT_UI,
	WAIT_FOR_INPUT,
	MAKE_REQUEST,
	SHOW_RESPONSE,
	DONE,
}

export interface InteractiveEditorRunOptions {
	initialRange?: IRange;
	message?: string;
	autoSend?: boolean;
}

export class InteractiveEditorController implements IEditorContribution {

	static get(editor: ICodeEditor) {
		return editor.getContribution<InteractiveEditorController>(INTERACTIVE_EDITOR_ID);
	}

	private static _decoBlock = ModelDecorationOptions.register({
		description: 'interactive-editor',
		showIfCollapsed: false,
		isWholeLine: true,
		className: 'interactive-editor-block-selection',
	});

	private static _promptHistory: string[] = [];
	private _historyOffset: number = -1;

	private readonly _store = new DisposableStore();
	private readonly _zone: InteractiveEditorZoneWidget;
	private readonly _ctxHasActiveRequest: IContextKey<boolean>;
	private readonly _ctxLastResponseType: IContextKey<undefined | InteractiveEditorResponseType>;
	private readonly _ctxLastEditKind: IContextKey<'' | 'simple'>;
	private readonly _ctxLastFeedbackKind: IContextKey<'helpful' | 'unhelpful' | ''>;

	private _strategy?: EditModeStrategy;

	private _activeSession?: Session;
	private _sessionStore?: DisposableStore;
	private _ignoreModelContentChanged = false;
	private _wholeRangeDecoration?: IEditorDecorationsCollection;
	private _waitForInputPromise?: DeferredPromise<void>;
	private _createSessionCts?: CancellationTokenSource;
	private _makeRequestCts?: CancellationTokenSource;

	constructor(
		private readonly _editor: ICodeEditor,
		@IInstantiationService private readonly _instaService: IInstantiationService,
		@IInteractiveEditorSessionService private readonly _interactiveEditorSessionService: IInteractiveEditorSessionService,
		@IEditorWorkerService private readonly _editorWorkerService: IEditorWorkerService,
		@ILogService private readonly _logService: ILogService,
		@IConfigurationService private readonly _configurationService: IConfigurationService,
		@IModelService private readonly _modelService: IModelService,
		@INotebookEditorService private readonly _notebookEditorService: INotebookEditorService,
		@IContextKeyService contextKeyService: IContextKeyService,

	) {
		this._ctxHasActiveRequest = CTX_INTERACTIVE_EDITOR_HAS_ACTIVE_REQUEST.bindTo(contextKeyService);
		this._ctxLastEditKind = CTX_INTERACTIVE_EDITOR_LAST_EDIT_KIND.bindTo(contextKeyService);
		this._ctxLastResponseType = CTX_INTERACTIVE_EDITOR_LAST_RESPONSE_TYPE.bindTo(contextKeyService);
		this._ctxLastFeedbackKind = CTX_INTERACTIVE_EDITOR_LAST_FEEDBACK_KIND.bindTo(contextKeyService);
		this._zone = this._store.add(_instaService.createInstance(InteractiveEditorZoneWidget, this._editor));

		// this._store.add(this._editor.onDidChangeModel(e => {

		// 	if (!this._activeSession && e.newModelUrl && this._interactiveEditorSessionService.retrieveSession(this._editor, e.newModelUrl)) {
		// 		// AUTO RUN!
		// 		// this.run(undefined);
		// 		this._logService.info('[IE] restoring session after model change');
		// 	}
		// }));
	}

	dispose(): void {
		this._store.dispose();
		this.cancelSession();
	}

	getId(): string {
		return INTERACTIVE_EDITOR_ID;
	}

	getWidgetPosition(): Position | undefined {
		return this._zone.position;
	}

	async run(options: InteractiveEditorRunOptions | undefined): Promise<void> {
		this._nextState(SessionState.CREATE_SESSION, { ...options });
	}

	private async _nextState(state: SessionState, options: InteractiveEditorRunOptions | undefined): Promise<void> {
		this._logService.trace('[IE] setState to ', state);
		let nextState: SessionState | undefined;
		switch (state) {
			case SessionState.CREATE_SESSION:
				nextState = await this._createSession(options?.initialRange);
				delete options?.initialRange;
				break;
			case SessionState.INIT_UI:
				nextState = await this._initUI();
				break;
			case SessionState.WAIT_FOR_INPUT:
				nextState = await this._waitForInput(options);
				delete options?.message;
				delete options?.autoSend;
				break;
			case SessionState.MAKE_REQUEST:
				nextState = await this._makeRequest();
				break;
			case SessionState.SHOW_RESPONSE:
				nextState = await this._showResponse();
				break;
			case SessionState.DONE:
				this._done();
				break;
		}
		if (nextState) {
			this._nextState(nextState, options);
		}
	}

	private async _createSession(wholeRange: IRange | undefined): Promise<SessionState.DONE | SessionState.INIT_UI> {
		assertType(this._editor.hasModel());

		this._createSessionCts?.dispose(true);
		this._createSessionCts = new CancellationTokenSource();
		const session = await this._interactiveEditorSessionService.createSession(
			this._editor,
			{ editMode: this._configurationService.getValue('interactiveEditor.editMode'), wholeRange },
			this._createSessionCts.token
		);
		if (!session) {
			this._createSessionCts?.dispose();
			this._createSessionCts = undefined;
			return SessionState.DONE;
		}

		switch (session.editMode) {
			case EditMode.Live:
				this._strategy = this._instaService.createInstance(LiveStrategy, session, this._editor, this._zone.widget);
				break;
			case EditMode.LivePreview:
				this._strategy = this._instaService.createInstance(LivePreviewStrategy, session, this._editor, this._zone.widget, () => session.wholeRange);
				break;
			case EditMode.Preview:
				this._strategy = this._instaService.createInstance(PreviewStrategy, session, this._zone.widget);
				break;
		}

		this._createSessionCts?.dispose();
		this._createSessionCts = undefined;

		this._activeSession = session;
		return SessionState.INIT_UI;
	}

	private async _initUI(): Promise<SessionState.WAIT_FOR_INPUT> {
		assertType(this._activeSession);

		// hide/cancel inline completions when invoking IE
		InlineCompletionsController.get(this._editor)?.hide();

		this._cancelNotebookSiblingEditors();

		this._wholeRangeDecoration = this._editor.createDecorationsCollection();
		this._wholeRangeDecoration.set([{ range: this._activeSession.wholeRange, options: InteractiveEditorController._decoBlock }]);

		this._zone.widget.updateSlashCommands(this._activeSession.session.slashCommands ?? []);
		this._zone.widget.placeholder = this._activeSession.session.placeholder ?? '';
		this._zone.widget.updateStatus(this._activeSession.session.message ?? localize('welcome.1', "AI-generated code may be incorrect"));

		this._sessionStore?.dispose();
		this._sessionStore = new DisposableStore();
		this._sessionStore.add(this._editor.onDidChangeModel(() => this.cancelSession()));

		this._sessionStore.add(this._editor.onDidChangeModelContent(e => {
			if (!this._ignoreModelContentChanged) {
				this._activeSession!.recordExternalEditOccurred();
			}
		}));

		return SessionState.WAIT_FOR_INPUT;
	}

	private _cancelNotebookSiblingEditors(): void {
		if (!this._editor.hasModel()) {
			return;
		}
		const candidate = CellUri.parse(this._editor.getModel().uri);
		if (!candidate) {
			return;
		}
		for (const editor of this._notebookEditorService.listNotebookEditors()) {
			if (isEqual(editor.textModel?.uri, candidate.notebook)) {
				let found = false;
				const editors: ICodeEditor[] = [];
				for (const [, codeEditor] of editor.codeEditors) {
					editors.push(codeEditor);
					found = codeEditor === this._editor || found;
				}
				if (found) {
					// found the this editor in the outer notebook editor -> make sure to
					// cancel all sibling sessions
					for (const editor of editors) {
						if (editor !== this._editor) {
							InteractiveEditorController.get(editor)?.cancelSession();

						}
					}
					break;
				}
			}
		}
	}

	private async _waitForInput(options: InteractiveEditorRunOptions | undefined): Promise<SessionState.DONE | SessionState.WAIT_FOR_INPUT | SessionState.MAKE_REQUEST> {
		assertType(this._activeSession);

		this._zone.show(this._activeSession.wholeRange.getEndPosition());

		if (options?.message) {
			this._zone.widget.value = options?.message;
			this._zone.widget.selectAll();
		}

		this._waitForInputPromise = new DeferredPromise();

		if (options?.autoSend) {
			this._waitForInputPromise.complete();
		}

		try {
			await this._waitForInputPromise.p;
		} catch {
			return SessionState.DONE;
		} finally {
			this._zone.widget.selectAll();
			this._waitForInputPromise = undefined;
		}

		if (!this._zone.widget.value) {
			return SessionState.WAIT_FOR_INPUT;
		}

		const input = this._zone.widget.value;

		if (!InteractiveEditorController._promptHistory.includes(input)) {
			InteractiveEditorController._promptHistory.unshift(input);
		}

		const refer = this._activeSession.session.slashCommands?.some(value => value.refer && input!.startsWith(`/${value.command}`));
		if (refer) {
			this._logService.info('[IE] seeing refer command, continuing outside editor', this._activeSession.provider.debugName);
			this._editor.setSelection(this._activeSession.wholeRange);
			this._instaService.invokeFunction(sendRequest, input);

			if (!this._activeSession.lastExchange) {
				// DONE when there wasn't any exchange yet. We used the inline chat only as trampoline
				return SessionState.DONE;
			}
			return SessionState.WAIT_FOR_INPUT;
		}

		this._activeSession.addInput(input);
		return SessionState.MAKE_REQUEST;
	}

	private async _makeRequest(): Promise<SessionState> {
		assertType(this._editor.hasModel());
		assertType(this._activeSession);
		assertType(this._activeSession.lastInput);

		this._makeRequestCts?.dispose(true);
		this._makeRequestCts = new CancellationTokenSource();

		const typeListener = this._zone.widget.onDidChangeInput(() => {
			this.cancelCurrentRequest();
		});

		const sw = StopWatch.create();
		const request: IInteractiveEditorRequest = {
			prompt: this._activeSession.lastInput,
			selection: this._editor.getSelection(),
			wholeRange: this._activeSession.wholeRange
		};
		const task = this._activeSession.provider.provideResponse(this._activeSession.session, request, this._makeRequestCts.token);
		this._logService.trace('[IE] request started', this._activeSession.provider.debugName, this._activeSession.session, request);

		let response: EditResponse | MarkdownResponse | ErrorResponse | EmptyResponse;
		let reply: IInteractiveEditorResponse | null | undefined;
		try {
			this._zone.widget.updateProgress(true);
			this._ctxHasActiveRequest.set(true);
			reply = await raceCancellationError(Promise.resolve(task), this._makeRequestCts.token);

			if (reply?.type === 'message') {
				response = new MarkdownResponse(this._activeSession.textModelN.uri, reply);
			} else if (reply) {
				response = new EditResponse(this._activeSession.textModelN.uri, reply);
			} else {
				response = new EmptyResponse();
			}

		} catch (e) {
			response = new ErrorResponse(e);

		} finally {
			this._ctxHasActiveRequest.set(false);
			this._ctxLastResponseType.set(reply?.type);
			this._zone.widget.updateProgress(false);
			this._logService.trace('[IE] request took', sw.elapsed(), this._activeSession.provider.debugName);

		}

		typeListener.dispose();
		this._makeRequestCts.dispose();
		this._makeRequestCts = undefined;

		this._activeSession.addExchange(new SessionExchange(request.prompt, response));
		return SessionState.SHOW_RESPONSE;
	}

	private async _showResponse(): Promise<SessionState> {
		assertType(this._activeSession);
		assertType(this._strategy);

		const { response } = this._activeSession.lastExchange!;

		if (response instanceof EmptyResponse) {
			// show status message
			this._zone.widget.updateStatus(localize('empty', "No results, please refine your input and try again"), { classes: ['warn'] });
			return SessionState.WAIT_FOR_INPUT;

		} else if (response instanceof ErrorResponse) {
			// show error
			if (!response.isCancellation) {
				this._zone.widget.updateStatus(response.message, { classes: ['error'] });
			}

		} else if (response instanceof MarkdownResponse) {
			// clear status, show MD message
			const renderedMarkdown = renderMarkdown(response.raw.message, { inline: true });
			this._zone.widget.updateStatus('');
			this._zone.widget.updateMarkdownMessage(renderedMarkdown.element);
			this._zone.widget.updateToolbar(true);

		} else if (response instanceof EditResponse) {
			// edit response -> complex...
			this._zone.widget.updateMarkdownMessage(undefined);
			this._zone.widget.updateToolbar(true);

			const canContinue = this._strategy.checkChanges(response);
			if (!canContinue) {
				return SessionState.DONE;
			}
			const moreMinimalEdits = (await this._editorWorkerService.computeHumanReadableDiff(this._activeSession.textModelN.uri, response.localEdits));
			const editOperations = (moreMinimalEdits ?? response.localEdits).map(edit => EditOperation.replace(Range.lift(edit.range), edit.text));
			this._logService.trace('[IE] edits from PROVIDER and after making them MORE MINIMAL', this._activeSession.provider.debugName, response.localEdits, moreMinimalEdits);

			const textModelNplus1 = this._modelService.createModel(createTextBufferFactoryFromSnapshot(this._activeSession.textModelN.createSnapshot()), null, undefined, true);
			textModelNplus1.applyEdits(editOperations);
			const diff = await this._editorWorkerService.computeDiff(this._activeSession.textModel0.uri, textModelNplus1.uri, { ignoreTrimWhitespace: false, maxComputationTimeMs: 5000 }, 'advanced');
			const textModel0Changes = diff?.changes ?? [];
			textModelNplus1.dispose();

			try {
				this._ignoreModelContentChanged = true;
				await this._strategy.renderChanges(response, editOperations, textModel0Changes);
			} finally {
				this._ignoreModelContentChanged = false;
			}
		}

		return SessionState.WAIT_FOR_INPUT;
	}

	private async _done() {
		assertType(this._activeSession);
		this._interactiveEditorSessionService.releaseSession(this._activeSession);

		this._ctxLastEditKind.reset();
		this._ctxLastResponseType.reset();
		this._ctxLastFeedbackKind.reset();

		this._zone.hide();
		this._editor.focus();

		this._wholeRangeDecoration?.clear();
		this._wholeRangeDecoration = undefined;

		this._sessionStore?.dispose();
		this._sessionStore = undefined;

		this._strategy?.dispose();
		this._strategy = undefined;
		this._activeSession = undefined;
	}


	accept(): void {
		this._waitForInputPromise?.complete();
	}

	cancelCurrentRequest(): void {
		this._waitForInputPromise?.cancel();
		this._makeRequestCts?.cancel();
	}

	arrowOut(up: boolean): void {
		if (this._zone.position && this._editor.hasModel()) {
			const { column } = this._editor.getPosition();
			const { lineNumber } = this._zone.position;
			const newLine = up ? lineNumber : lineNumber + 1;
			this._editor.setPosition({ lineNumber: newLine, column });
			this._editor.focus();
		}
	}

	toggleInlineDiff(): void {
		this._strategy?.toggleInlineDiff();
	}

	focus(): void {
		this._zone.widget.focus();
	}

	populateHistory(up: boolean) {
		const len = InteractiveEditorController._promptHistory.length;
		if (len === 0) {
			return;
		}
		const pos = (len + this._historyOffset + (up ? 1 : -1)) % len;
		const entry = InteractiveEditorController._promptHistory[pos];

		this._zone.widget.value = entry;
		this._zone.widget.selectAll();
		this._historyOffset = pos;
	}

	viewInChat() {
		if (this._activeSession?.lastExchange?.response instanceof MarkdownResponse) {
			this._instaService.invokeFunction(showMessageResponse, this._activeSession.lastExchange.prompt, this._activeSession.lastExchange.response.raw.message.value);
		}
	}

	updateExpansionState(expand: boolean) {
		this._zone.widget.updateToggleState(expand);
	}

	undoLast(): string | void {
		if (this._activeSession?.lastExchange?.response instanceof EditResponse) {
			this._activeSession.textModelN.undo();
			return this._activeSession.lastExchange.response.localEdits[0].text;
		}
	}

	feedbackLast(helpful: boolean) {
		if (this._activeSession?.lastExchange?.response instanceof EditResponse || this._activeSession?.lastExchange?.response instanceof MarkdownResponse) {
			const kind = helpful ? InteractiveEditorResponseFeedbackKind.Helpful : InteractiveEditorResponseFeedbackKind.Unhelpful;
			this._activeSession.provider.handleInteractiveEditorResponseFeedback?.(this._activeSession.session, this._activeSession.lastExchange.response.raw, kind);
			this._ctxLastFeedbackKind.set(helpful ? 'helpful' : 'unhelpful');
			this._zone.widget.updateStatus('Thank you for your feedback!', { resetAfter: 1250 });
		}
	}

	async applyChanges(): Promise<EditResponse | void> {
		if (this._activeSession?.lastExchange?.response instanceof EditResponse && this._strategy) {
			const strategy = this._strategy;
			this._strategy = undefined;
			await strategy?.apply();
			strategy?.dispose();
			this._createSessionCts?.cancel();
			this._waitForInputPromise?.cancel();
			this._makeRequestCts?.cancel();
			return this._activeSession.lastExchange.response;
		}
	}

	async cancelSession() {
		const strategy = this._strategy;
		this._strategy = undefined;
		await strategy?.cancel();
		strategy?.dispose();
		this._createSessionCts?.cancel();
		this._waitForInputPromise?.cancel();
		this._makeRequestCts?.cancel();
	}
}

async function showMessageResponse(accessor: ServicesAccessor, query: string, response: string) {
	const interactiveSessionService = accessor.get(IInteractiveSessionService);
	const providerId = interactiveSessionService.getProviderInfos()[0]?.id;

	const interactiveSessionWidgetService = accessor.get(IInteractiveSessionWidgetService);
	const widget = await interactiveSessionWidgetService.revealViewForProvider(providerId);
	if (widget && widget.viewModel) {
		interactiveSessionService.addCompleteRequest(widget.viewModel.sessionId, query, { message: response });
		widget.focusLastMessage();
	}
}

async function sendRequest(accessor: ServicesAccessor, query: string) {
	const interactiveSessionService = accessor.get(IInteractiveSessionService);
	const widgetService = accessor.get(IInteractiveSessionWidgetService);

	const providerId = interactiveSessionService.getProviderInfos()[0]?.id;
	const widget = await widgetService.revealViewForProvider(providerId);
	if (!widget) {
		return;
	}

	widget.acceptInput(query);
}
