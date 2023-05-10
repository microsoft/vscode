/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { renderMarkdown } from 'vs/base/browser/markdownRenderer';
import { DeferredPromise, raceCancellationError } from 'vs/base/common/async';
import { CancellationTokenSource } from 'vs/base/common/cancellation';
import { toErrorMessage } from 'vs/base/common/errorMessage';
import { isCancellationError } from 'vs/base/common/errors';
import { DisposableStore } from 'vs/base/common/lifecycle';
import { isEqual } from 'vs/base/common/resources';
import { StopWatch } from 'vs/base/common/stopwatch';
import 'vs/css!./interactiveEditor';
import { ICodeEditor } from 'vs/editor/browser/editorBrowser';
import { EditOperation } from 'vs/editor/common/core/editOperation';
import { IRange, Range } from 'vs/editor/common/core/range';
import { LineRangeMapping } from 'vs/editor/common/diff/linesDiffComputer';
import { IEditorContribution, ScrollType } from 'vs/editor/common/editorCommon';
import { ModelDecorationOptions, createTextBufferFactoryFromSnapshot } from 'vs/editor/common/model/textModel';
import { IEditorWorkerService } from 'vs/editor/common/services/editorWorker';
import { IModelService } from 'vs/editor/common/services/model';
import { InlineCompletionsController } from 'vs/editor/contrib/inlineCompletions/browser/inlineCompletionsController';
import { localize } from 'vs/nls';
import { IConfigurationService } from 'vs/platform/configuration/common/configuration';
import { IContextKey, IContextKeyService } from 'vs/platform/contextkey/common/contextkey';
import { IInstantiationService, ServicesAccessor } from 'vs/platform/instantiation/common/instantiation';
import { ILogService } from 'vs/platform/log/common/log';
import { EditResponse, IInteractiveEditorSessionService, MarkdownResponse, Session, SessionExchange } from 'vs/workbench/contrib/interactiveEditor/browser/interactiveEditorSession';
import { EditModeStrategy, LivePreviewStrategy, LiveStrategy, PreviewStrategy } from 'vs/workbench/contrib/interactiveEditor/browser/interactiveEditorStrategies';
import { InteractiveEditorZoneWidget } from 'vs/workbench/contrib/interactiveEditor/browser/interactiveEditorWidget';
import { CTX_INTERACTIVE_EDITOR_HAS_ACTIVE_REQUEST, CTX_INTERACTIVE_EDITOR_LAST_EDIT_TYPE as CTX_INTERACTIVE_EDITOR_LAST_EDIT_KIND, CTX_INTERACTIVE_EDITOR_LAST_FEEDBACK as CTX_INTERACTIVE_EDITOR_LAST_FEEDBACK_KIND, IInteractiveEditorRequest, IInteractiveEditorResponse, INTERACTIVE_EDITOR_ID, EditMode, InteractiveEditorResponseFeedbackKind, CTX_INTERACTIVE_EDITOR_LAST_RESPONSE_TYPE, InteractiveEditorResponseType } from 'vs/workbench/contrib/interactiveEditor/common/interactiveEditor';
import { IInteractiveSessionWidgetService } from 'vs/workbench/contrib/interactiveSession/browser/interactiveSessionWidget';
import { IInteractiveSessionService } from 'vs/workbench/contrib/interactiveSession/common/interactiveSessionService';
import { INotebookEditorService } from 'vs/workbench/contrib/notebook/browser/services/notebookEditorService';
import { CellUri } from 'vs/workbench/contrib/notebook/common/notebookCommon';


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

	private static _decoWholeRange = ModelDecorationOptions.register({
		description: 'interactive-editor-marker'
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
	private _isActive: boolean = false;

	private _currentInputPromise?: DeferredPromise<void>;

	private _ctsSession: CancellationTokenSource = new CancellationTokenSource();
	private _ctsRequest?: CancellationTokenSource;

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

		this._store.add(this._editor.onDidChangeModel(() => {

			if (this._activeSession && !this._isActive) {
				// AUTO RUN!
				this.run(undefined);
				this._logService.info('[IE] restoring session after model change');
			}
		}));
	}

	dispose(): void {
		this._store.dispose();
		this._ctsSession.dispose(true);
	}

	getId(): string {
		return INTERACTIVE_EDITOR_ID;
	}

	private _getMode(): EditMode {
		return this._configurationService.getValue('interactiveEditor.editMode');
	}

	private get _activeSession(): Session | undefined {
		if (!this._editor.hasModel()) {
			return undefined;
		}
		return this._interactiveEditorSessionService.retrieveSession(this._editor, this._editor.getModel().uri);
	}

	async run(options: InteractiveEditorRunOptions | undefined): Promise<void> {

		// hide/cancel inline completions when invoking IE
		InlineCompletionsController.get(this._editor)?.hide();


		this._ctsSession.dispose(true);
		this._ctsSession = new CancellationTokenSource();
		this._cancelNotebookSiblingEditors();

		if (!this._editor.hasModel()) {
			return;
		}

		const store = new DisposableStore();

		// TODO@jrieken MOVE into session
		let textModel0Changes: LineRangeMapping[] | undefined;

		const editMode = this._getMode();

		const activeSession = await this._interactiveEditorSessionService.getOrCreateSession(this._editor, editMode, this._ctsSession.token);
		if (!activeSession) {
			return;
		}
		switch (editMode) {
			case EditMode.Live:
				this._strategy = this._instaService.createInstance(LiveStrategy, activeSession, this._editor, this._zone.widget);
				break;
			case EditMode.LivePreview:
				this._strategy = this._instaService.createInstance(LivePreviewStrategy, activeSession, this._editor, this._zone.widget,
					() => wholeRangeDecoration.getRange(0)!, // TODO@jrieken if it can be null it will be null
				);
				break;
			case EditMode.Preview:
				this._strategy = this._instaService.createInstance(PreviewStrategy, activeSession, this._zone.widget);
				break;
		}
		this._isActive = true;

		const selection = this._editor.getSelection();
		const blockDecoration = this._editor.createDecorationsCollection();
		const wholeRangeDecoration = this._editor.createDecorationsCollection();

		let optionsRange = Range.lift(options?.initialRange) ?? (activeSession.session.wholeRange ? Range.lift(activeSession.session.wholeRange) : selection);
		if (optionsRange.isEmpty()) {
			optionsRange = new Range(optionsRange.startLineNumber, 1, optionsRange.startLineNumber, activeSession.textModelN.getLineMaxColumn(optionsRange.startLineNumber));
		}
		wholeRangeDecoration.set([{
			range: optionsRange,
			options: InteractiveEditorController._decoWholeRange
		}]);

		let autoSend = options?.autoSend ?? false;

		this._zone.widget.updateSlashCommands(activeSession.session.slashCommands ?? []);
		this._zone.widget.updateStatus(activeSession.session.message ?? localize('welcome.1', "AI-generated code may be incorrect."));


		let suspendSession = false;
		store.add(this._editor.onDidDispose(() => {
			// parkSession!
			this.cancelCurrentRequest();
			suspendSession = true;
		}));

		store.add(this._editor.onDidChangeModel(() => {
			// parkSession!
			this.cancelCurrentRequest();
			suspendSession = true;
		}));


		let ignoreModelChanges = false;
		this._editor.onDidChangeModelContent(e => {
			if (!ignoreModelChanges) {


				// note when "other" edits happen
				activeSession.recordExternalEditOccurred();

				// CANCEL if the document has changed outside the current range
				const wholeRange = wholeRangeDecoration.getRange(0);
				if (!wholeRange) {
					this._ctsSession.cancel();
					this._logService.trace('[IE] ABORT wholeRange seems gone/collapsed');
					return;
				}
			}

		}, undefined, store);


		let _requestCancelledOnModelContentChanged = false;
		this._zone.widget.placeholder = activeSession.session.placeholder ?? '';
		this._zone.widget.input = options?.message ?? '';

		do {
			const wholeRange = wholeRangeDecoration.getRange(0);
			if (!wholeRange) {
				// nuked whole file contents?
				this._logService.trace('[IE] ABORT wholeRange seems gone/collapsed');
				break;
			}


			// visuals: add block decoration
			blockDecoration.set([{
				range: wholeRange,
				options: InteractiveEditorController._decoBlock
			}]);

			this._ctsRequest?.dispose(true);
			this._ctsRequest = new CancellationTokenSource(this._ctsSession.token);

			this._historyOffset = -1;

			if (!_requestCancelledOnModelContentChanged) {
				this._zone.widget.selectAll();
			}

			this._zone.show(wholeRange.getEndPosition());

			this._currentInputPromise = new DeferredPromise();
			this._ctsRequest.token.onCancellationRequested(() => { this._currentInputPromise?.complete(); });

			// const inputPromise = this._zone.getInput(wholeRange.getEndPosition(), placeholder, value, this._ctsRequest.token, _requestCancelledOnModelContentChanged);
			_requestCancelledOnModelContentChanged = false;


			this._ctxLastFeedbackKind.reset();
			// reveal the line after the whole range to ensure that the input box is visible
			this._editor.revealPosition({ lineNumber: wholeRange.endLineNumber + 1, column: 1 }, ScrollType.Smooth);
			if (autoSend) {
				autoSend = false;
				this.accept();
			}

			await this._currentInputPromise.p;
			if (this._ctsSession.token.isCancellationRequested) {
				break;
			}
			const input = this._zone.widget.input;

			if (!input) {
				continue;
			}

			if (!InteractiveEditorController._promptHistory.includes(input)) {
				InteractiveEditorController._promptHistory.unshift(input);
			}

			const refer = activeSession.session.slashCommands?.some(value => value.refer && input!.startsWith(`/${value.command}`));
			if (refer) {
				this._logService.info('[IE] seeing refer command, continuing outside editor', activeSession.provider.debugName);
				this._editor.setSelection(wholeRange);
				this._instaService.invokeFunction(sendRequest, input);
				continue;
			}

			const typeListener = this._zone.widget.onDidChangeInput(() => {
				this.cancelCurrentRequest();
				_requestCancelledOnModelContentChanged = true;
			});

			const sw = StopWatch.create();
			const request: IInteractiveEditorRequest = {
				prompt: input,
				selection: this._editor.getSelection(),
				wholeRange
			};
			const task = activeSession.provider.provideResponse(activeSession.session, request, this._ctsRequest.token);
			this._logService.trace('[IE] request started', activeSession.provider.debugName, activeSession.session, request);
			// this._zone.widget.input = input;

			let reply: IInteractiveEditorResponse | null | undefined;
			try {
				this._zone.widget.updateProgress(true);
				this._ctxHasActiveRequest.set(true);
				reply = await raceCancellationError(Promise.resolve(task), this._ctsRequest.token);

			} catch (e) {
				if (isCancellationError(e) || this._ctsRequest.token.isCancellationRequested) {
					this._logService.trace('[IE] request CANCELED', activeSession.provider.debugName);
				} else {
					this._logService.error('[IE] ERROR during request', activeSession.provider.debugName);
					this._logService.error(e);
					this._zone.widget.updateStatus(toErrorMessage(e), { classes: ['error'] });
				}
				continue;

			} finally {
				this._ctxHasActiveRequest.set(false);
				this._ctxLastResponseType.set(reply?.type);
				this._zone.widget.updateProgress(false);
				this._logService.trace('[IE] request took', sw.elapsed(), activeSession.provider.debugName);

				typeListener.dispose();
			}

			if (!reply) {
				this._logService.trace('[IE] NO reply or edits', activeSession.provider.debugName);
				this._zone.widget.updateStatus(localize('empty', "No results, please refine your input and try again."), { classes: ['warn'] });
				continue;
			}

			this._zone.widget.updateToolbar(true);

			const response = reply.type === 'message'
				? new MarkdownResponse(activeSession.textModel0.uri, reply)
				: new EditResponse(activeSession.textModel0.uri, reply);
			activeSession.addExchange(new SessionExchange(input, response));

			if (response instanceof MarkdownResponse) {
				this._logService.info('[IE] received a MESSAGE, showing inline first', activeSession.provider.debugName);
				const renderedMarkdown = renderMarkdown(response.raw.message, { inline: true });
				this._zone.widget.updateStatus('');
				this._zone.widget.updateMarkdownMessage(renderedMarkdown.element);
				continue;
			}

			const canContinue = this._strategy.checkChanges(response);
			if (!canContinue) {
				break;
			}

			this._ctxLastEditKind.set(response.localEdits.length === 1 ? 'simple' : '');

			// use whole range from reply
			if (reply.wholeRange) {
				wholeRangeDecoration.set([{
					range: reply.wholeRange,
					options: InteractiveEditorController._decoWholeRange
				}]);
			}
			const moreMinimalEdits = (await this._editorWorkerService.computeHumanReadableDiff(activeSession.textModel0.uri, response.localEdits));
			const editOperations = (moreMinimalEdits ?? response.localEdits).map(edit => EditOperation.replace(Range.lift(edit.range), edit.text));
			this._logService.trace('[IE] edits from PROVIDER and after making them MORE MINIMAL', activeSession.provider.debugName, response.localEdits, moreMinimalEdits);

			const textModelNplus1 = this._modelService.createModel(createTextBufferFactoryFromSnapshot(activeSession.textModelN.createSnapshot()), null, undefined, true);
			textModelNplus1.applyEdits(editOperations);
			const diff = await this._editorWorkerService.computeDiff(activeSession.textModel0.uri, textModelNplus1.uri, { ignoreTrimWhitespace: false, maxComputationTimeMs: 5000 }, 'advanced');
			textModel0Changes = diff?.changes ?? [];
			textModelNplus1.dispose();

			try {
				ignoreModelChanges = true;
				await this._strategy.renderChanges(response, editOperations, textModel0Changes);
			} finally {
				ignoreModelChanges = false;
			}

			this._zone.widget.placeholder = reply.placeholder ?? activeSession.session.placeholder ?? '';

		} while (!this._ctsSession.token.isCancellationRequested && !suspendSession);
		this._logService.trace('[IE] session DONE', activeSession.provider.debugName);

		// done, cleanup
		wholeRangeDecoration.clear();
		blockDecoration.clear();

		store.dispose();

		this._ctxLastEditKind.reset();
		this._ctxLastResponseType.reset();
		this._ctxLastFeedbackKind.reset();

		this._zone.hide();
		this._editor.focus();

		if (!suspendSession) {
			this._interactiveEditorSessionService.releaseSession(activeSession);
		} else {
			this._strategy.dispose();
			this._strategy = undefined;
		}

		this._isActive = false;
	}

	private _cancelNotebookSiblingEditors() {
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

	accept(): void {
		this._currentInputPromise?.complete();
	}

	cancelCurrentRequest(): void {
		this._ctsRequest?.cancel();
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

		this._zone.widget.input = entry;
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
		if (this._activeSession?.lastExchange?.response) {
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
			this._ctsSession.cancel();
			return this._activeSession.lastExchange.response;
		}
	}

	async cancelSession() {
		const strategy = this._strategy;
		this._strategy = undefined;
		await strategy?.cancel();
		strategy?.dispose();
		this._ctsSession.cancel();
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
