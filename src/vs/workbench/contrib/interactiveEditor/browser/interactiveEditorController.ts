/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { renderMarkdown } from 'vs/base/browser/markdownRenderer';
import { DeferredPromise, raceCancellationError } from 'vs/base/common/async';
import { CancellationTokenSource } from 'vs/base/common/cancellation';
import { toErrorMessage } from 'vs/base/common/errorMessage';
import { isCancellationError } from 'vs/base/common/errors';
import { Event } from 'vs/base/common/event';
import { Iterable } from 'vs/base/common/iterator';
import { DisposableStore, IDisposable } from 'vs/base/common/lifecycle';
import { isEqual } from 'vs/base/common/resources';
import { StopWatch } from 'vs/base/common/stopwatch';
import 'vs/css!./interactiveEditor';
import { IActiveCodeEditor, ICodeEditor } from 'vs/editor/browser/editorBrowser';
import { IBulkEditService } from 'vs/editor/browser/services/bulkEditService';
import { EditOperation, ISingleEditOperation } from 'vs/editor/common/core/editOperation';
import { Position } from 'vs/editor/common/core/position';
import { IRange, Range } from 'vs/editor/common/core/range';
import { Selection } from 'vs/editor/common/core/selection';
import { LineRangeMapping } from 'vs/editor/common/diff/linesDiffComputer';
import { IEditorContribution, IEditorDecorationsCollection, ScrollType } from 'vs/editor/common/editorCommon';
import { ICursorStateComputer, IModelDecorationOptions, IModelDeltaDecoration, IValidEditOperation } from 'vs/editor/common/model';
import { ModelDecorationOptions, createTextBufferFactoryFromSnapshot } from 'vs/editor/common/model/textModel';
import { IEditorWorkerService } from 'vs/editor/common/services/editorWorker';
import { IModelService } from 'vs/editor/common/services/model';
import { ITextModelService } from 'vs/editor/common/services/resolverService';
import { InlineCompletionsController } from 'vs/editor/contrib/inlineCompletions/browser/inlineCompletionsController';
import { localize } from 'vs/nls';
import { IConfigurationService } from 'vs/platform/configuration/common/configuration';
import { IContextKey, IContextKeyService } from 'vs/platform/contextkey/common/contextkey';
import { IInstantiationService, ServicesAccessor } from 'vs/platform/instantiation/common/instantiation';
import { ILogService } from 'vs/platform/log/common/log';
import { IStorageService, StorageScope, StorageTarget } from 'vs/platform/storage/common/storage';
import { InteractiveEditorFileCreatePreviewWidget, InteractiveEditorLivePreviewWidget } from 'vs/workbench/contrib/interactiveEditor/browser/interactiveEditorLivePreviewWidget';
import { EditResponse, IInteractiveEditorSessionService, MarkdownResponse, Session, SessionExchange } from 'vs/workbench/contrib/interactiveEditor/browser/interactiveEditorSession';
import { InteractiveEditorWidget, InteractiveEditorZoneWidget } from 'vs/workbench/contrib/interactiveEditor/browser/interactiveEditorWidget';
import { CTX_INTERACTIVE_EDITOR_HAS_ACTIVE_REQUEST, CTX_INTERACTIVE_EDITOR_INLNE_DIFF, CTX_INTERACTIVE_EDITOR_LAST_EDIT_TYPE as CTX_INTERACTIVE_EDITOR_LAST_EDIT_KIND, CTX_INTERACTIVE_EDITOR_LAST_FEEDBACK as CTX_INTERACTIVE_EDITOR_LAST_FEEDBACK_KIND, IInteractiveEditorRequest, IInteractiveEditorResponse, IInteractiveEditorService, INTERACTIVE_EDITOR_ID, EditMode, InteractiveEditorResponseFeedbackKind, CTX_INTERACTIVE_EDITOR_LAST_RESPONSE_TYPE, InteractiveEditorResponseType, CTX_INTERACTIVE_EDITOR_DOCUMENT_CHANGED } from 'vs/workbench/contrib/interactiveEditor/common/interactiveEditor';
import { IInteractiveSessionWidgetService } from 'vs/workbench/contrib/interactiveSession/browser/interactiveSessionWidget';
import { IInteractiveSessionService } from 'vs/workbench/contrib/interactiveSession/common/interactiveSessionService';
import { INotebookEditorService } from 'vs/workbench/contrib/notebook/browser/services/notebookEditorService';
import { CellUri } from 'vs/workbench/contrib/notebook/common/notebookCommon';

class InlineDiffDecorations {

	private readonly _collection: IEditorDecorationsCollection;

	private _data: { tracking: IModelDeltaDecoration; decorating: IModelDecorationOptions }[] = [];
	private _visible: boolean = false;

	constructor(editor: ICodeEditor, visible: boolean = false) {
		this._collection = editor.createDecorationsCollection();
		this._visible = visible;
	}

	get visible() {
		return this._visible;
	}

	set visible(value: boolean) {
		this._visible = value;
		this.update();
	}

	clear() {
		this._collection.clear();
		this._data.length = 0;
	}

	collectEditOperation(op: IValidEditOperation) {
		this._data.push(InlineDiffDecorations._asDecorationData(op));
	}

	update() {
		this._collection.set(this._data.map(d => {
			const res = { ...d.tracking };
			if (this._visible) {
				res.options = { ...res.options, ...d.decorating };
			}
			return res;
		}));
	}

	private static _asDecorationData(edit: IValidEditOperation): { tracking: IModelDeltaDecoration; decorating: IModelDecorationOptions } {
		let content = edit.text;
		if (content.length > 12) {
			content = content.substring(0, 12) + '…';
		}
		const tracking: IModelDeltaDecoration = {
			range: edit.range,
			options: {
				description: 'interactive-editor-inline-diff',
			}
		};

		const decorating: IModelDecorationOptions = {
			description: 'interactive-editor-inline-diff',
			className: !edit.range.isEmpty() ? 'interactive-editor-lines-inserted-range' : undefined,
			showIfCollapsed: true,
			before: {
				content,
				inlineClassName: 'interactive-editor-lines-deleted-range-inline',
				attachedData: edit,
			}
		};

		return { tracking, decorating };
	}
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

	private _currentInputPromise?: DeferredPromise<void>;

	private _ctsSession: CancellationTokenSource = new CancellationTokenSource();
	private _ctsRequest?: CancellationTokenSource;

	constructor(
		private readonly _editor: ICodeEditor,
		@IInstantiationService private readonly _instaService: IInstantiationService,
		@IInteractiveEditorService private readonly _interactiveEditorService: IInteractiveEditorService,
		@IInteractiveEditorSessionService private readonly _interactiveEditorSessionService: IInteractiveEditorSessionService,
		@IEditorWorkerService private readonly _editorWorkerService: IEditorWorkerService,
		@ILogService private readonly _logService: ILogService,
		@IConfigurationService private readonly _configurationService: IConfigurationService,
		@IModelService private readonly _modelService: IModelService,
		@ITextModelService private readonly _textModelService: ITextModelService,
		@INotebookEditorService private readonly _notebookEditorService: INotebookEditorService,
		@IContextKeyService contextKeyService: IContextKeyService,

	) {
		this._ctxHasActiveRequest = CTX_INTERACTIVE_EDITOR_HAS_ACTIVE_REQUEST.bindTo(contextKeyService);
		this._ctxLastEditKind = CTX_INTERACTIVE_EDITOR_LAST_EDIT_KIND.bindTo(contextKeyService);
		this._ctxLastResponseType = CTX_INTERACTIVE_EDITOR_LAST_RESPONSE_TYPE.bindTo(contextKeyService);
		this._ctxLastFeedbackKind = CTX_INTERACTIVE_EDITOR_LAST_FEEDBACK_KIND.bindTo(contextKeyService);
		this._zone = this._store.add(_instaService.createInstance(InteractiveEditorZoneWidget, this._editor));
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
		this._cancelNotebookSiblingEditors();

		if (!this._editor.hasModel()) {
			return;
		}

		const provider = Iterable.first(this._interactiveEditorService.getAllProvider());
		if (!provider) {
			this._logService.trace('[IE] NO provider found');
			return;
		}

		this._ctsSession = new CancellationTokenSource();
		const textModel = this._editor.getModel();
		const selection = this._editor.getSelection();
		const session = await provider.prepareInteractiveEditorSession(textModel, selection, this._ctsSession.token);
		if (!session) {
			this._logService.trace('[IE] NO session', provider.debugName);
			return;
		}
		this._logService.trace('[IE] NEW session', provider.debugName);

		const store = new DisposableStore();

		// keep a snapshot of the "actual" model
		const textModel0 = this._modelService.createModel(createTextBufferFactoryFromSnapshot(textModel.createSnapshot()), { languageId: textModel.getLanguageId(), onDidChange: Event.None }, undefined, true);
		store.add(textModel0);

		// keep a reference to prevent disposal of the "actual" model
		const refTextModelN = await this._textModelService.createModelReference(textModel.uri);
		store.add(refTextModelN);

		let textModel0Changes: LineRangeMapping[] | undefined;

		const editMode = this._getMode();
		const activeSession = new Session(editMode, textModel0, textModel, provider, session);
		this._interactiveEditorSessionService.storeSession(this._editor, textModel.uri, activeSession);

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

		const blockDecoration = this._editor.createDecorationsCollection();
		const wholeRangeDecoration = this._editor.createDecorationsCollection();

		let optionsRange = Range.lift(options?.initialRange) ?? (session.wholeRange ? Range.lift(session.wholeRange) : selection);
		if (optionsRange.isEmpty()) {
			optionsRange = new Range(optionsRange.startLineNumber, 1, optionsRange.startLineNumber, textModel.getLineMaxColumn(optionsRange.startLineNumber));
		}
		wholeRangeDecoration.set([{
			range: optionsRange,
			options: InteractiveEditorController._decoWholeRange
		}]);

		let autoSend = options?.autoSend ?? false;

		this._zone.widget.updateSlashCommands(session.slashCommands ?? []);
		this._zone.widget.updateStatus(session.message ?? localize('welcome.1', "AI-generated code may be incorrect."));

		// CANCEL when input changes
		this._editor.onDidChangeModel(this.cancelSession, this, store);

		// if (editMode === EditMode.Live) {

		// 	// REposition the zone widget whenever the block decoration changes
		// 	let lastPost: Position | undefined;
		// 	wholeRangeDecoration.onDidChange(e => {
		// 		const range = wholeRangeDecoration.getRange(0);
		// 		if (range && (!lastPost || !lastPost.equals(range.getEndPosition()))) {
		// 			lastPost = range.getEndPosition();
		// 			this._zone.updatePosition(lastPost);
		// 		}
		// 	}, undefined, store);
		// }

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
		this._zone.widget.placeholder = session.placeholder ?? '';
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
			this._ctsSession.token.onCancellationRequested(() => { this._currentInputPromise?.complete(); });

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

			const refer = session.slashCommands?.some(value => value.refer && input!.startsWith(`/${value.command}`));
			if (refer) {
				this._logService.info('[IE] seeing refer command, continuing outside editor', provider.debugName);
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
			const task = provider.provideResponse(session, request, this._ctsRequest.token);
			this._logService.trace('[IE] request started', provider.debugName, session, request);
			// this._zone.widget.input = input;

			let reply: IInteractiveEditorResponse | null | undefined;
			try {
				this._zone.widget.updateProgress(true);
				this._ctxHasActiveRequest.set(true);
				reply = await raceCancellationError(Promise.resolve(task), this._ctsRequest.token);

			} catch (e) {
				if (isCancellationError(e) || this._ctsRequest.token.isCancellationRequested) {
					this._logService.trace('[IE] request CANCELED', provider.debugName);
				} else {
					this._logService.error('[IE] ERROR during request', provider.debugName);
					this._logService.error(e);
					this._zone.widget.updateStatus(toErrorMessage(e), { classes: ['error'] });
				}
				continue;

			} finally {
				this._ctxHasActiveRequest.set(false);
				this._ctxLastResponseType.set(reply?.type);
				this._zone.widget.updateProgress(false);
				this._logService.trace('[IE] request took', sw.elapsed(), provider.debugName);

				typeListener.dispose();
			}

			if (!reply) {
				this._logService.trace('[IE] NO reply or edits', provider.debugName);
				this._zone.widget.updateStatus(localize('empty', "No results, please refine your input and try again."), { classes: ['warn'] });
				continue;
			}

			this._zone.widget.updateToolbar(true);

			const response = reply.type === 'message'
				? new MarkdownResponse(textModel.uri, reply)
				: new EditResponse(textModel.uri, reply);
			activeSession.addExchange(new SessionExchange(input, response));

			if (response instanceof MarkdownResponse) {
				this._logService.info('[IE] received a MESSAGE, showing inline first', provider.debugName);
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
			const moreMinimalEdits = (await this._editorWorkerService.computeHumanReadableDiff(textModel.uri, response.localEdits));
			const editOperations = (moreMinimalEdits ?? response.localEdits).map(edit => EditOperation.replace(Range.lift(edit.range), edit.text));
			this._logService.trace('[IE] edits from PROVIDER and after making them MORE MINIMAL', provider.debugName, response.localEdits, moreMinimalEdits);

			const textModelNplus1 = this._modelService.createModel(createTextBufferFactoryFromSnapshot(textModel.createSnapshot()), null, undefined, true);
			textModelNplus1.applyEdits(editOperations);
			const diff = await this._editorWorkerService.computeDiff(textModel0.uri, textModelNplus1.uri, { ignoreTrimWhitespace: false, maxComputationTimeMs: 5000 }, 'advanced');
			textModel0Changes = diff?.changes ?? [];
			textModelNplus1.dispose();

			try {
				ignoreModelChanges = true;
				await this._strategy.renderChanges(response, editOperations, textModel0Changes);
			} finally {
				ignoreModelChanges = false;
			}

			this._zone.widget.placeholder = reply.placeholder ?? session.placeholder ?? '';

		} while (!this._ctsSession.token.isCancellationRequested);


		this._logService.trace('[IE] session DONE', provider.debugName);

		// done, cleanup
		wholeRangeDecoration.clear();
		blockDecoration.clear();

		store.dispose();
		session.dispose?.();

		this._ctxLastEditKind.reset();
		this._ctxLastResponseType.reset();
		this._ctxLastFeedbackKind.reset();
		this._interactiveEditorSessionService.releaseSession(this._editor, textModel.uri, activeSession);

		this._zone.hide();
		this._editor.focus();
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
			this._activeSession.modelN.undo();
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

abstract class EditModeStrategy {

	dispose(): void { }

	abstract checkChanges(response: EditResponse): boolean;

	abstract apply(): Promise<void>;

	abstract cancel(): Promise<void>;

	abstract renderChanges(response: EditResponse, edits: ISingleEditOperation[], changes: LineRangeMapping[]): Promise<void>;

	abstract toggleInlineDiff(): void;
}

class PreviewStrategy extends EditModeStrategy {

	private readonly _ctxDocumentChanged: IContextKey<boolean>;
	private readonly _listener: IDisposable;

	constructor(
		private readonly _session: Session,
		private readonly _widget: InteractiveEditorWidget,
		@IContextKeyService contextKeyService: IContextKeyService,
		@IBulkEditService private readonly _bulkEditService: IBulkEditService,
	) {
		super();

		this._ctxDocumentChanged = CTX_INTERACTIVE_EDITOR_DOCUMENT_CHANGED.bindTo(contextKeyService);
		this._listener = Event.debounce(_session.modelN.onDidChangeContent.bind(_session.modelN), () => { }, 350)(_ => {
			this._ctxDocumentChanged.set(!_session.modelN.equalsTextBuffer(_session.model0.getTextBuffer()));
		});
	}

	override dispose(): void {
		this._listener.dispose();
		this._ctxDocumentChanged.reset();
		super.dispose();
	}

	checkChanges(response: EditResponse): boolean {
		if (!response.workspaceEdits || response.singleCreateFileEdit) {
			// preview stategy can handle simple workspace edit (single file create)
			return true;
		}
		this._bulkEditService.apply(response.workspaceEdits, { showPreview: true });
		return false;
	}

	async apply() {

		if (!(this._session.lastExchange?.response instanceof EditResponse)) {
			return;
		}
		const editResponse = this._session.lastExchange?.response;
		if (editResponse.workspaceEdits) {
			await this._bulkEditService.apply(editResponse.workspaceEdits);

		} else if (!editResponse.workspaceEditsIncludeLocalEdits) {

			const { modelN } = this._session;

			if (modelN.equalsTextBuffer(this._session.model0.getTextBuffer())) {
				modelN.pushStackElement();
				const edits = editResponse.localEdits.map(edit => EditOperation.replace(Range.lift(edit.range), edit.text));
				modelN.pushEditOperations(null, edits, () => null);
				modelN.pushStackElement();
			}
		}
	}

	async cancel(): Promise<void> {
		// nothing to do
	}

	override async renderChanges(response: EditResponse, edits: ISingleEditOperation[], changes: LineRangeMapping[]): Promise<void> {
		if (response.localEdits.length > 0) {
			this._widget.showEditsPreview(this._session.modelN, edits, changes);
		} else {
			this._widget.hideEditsPreview();
		}

		if (response.singleCreateFileEdit) {
			this._widget.showCreatePreview(response.singleCreateFileEdit.uri, await Promise.all(response.singleCreateFileEdit.edits));
		} else {
			this._widget.hideCreatePreview();
		}
	}

	toggleInlineDiff(): void { }
}

class LiveStrategy extends EditModeStrategy {

	private static _inlineDiffStorageKey: string = 'interactiveEditor.storage.inlineDiff';
	private _inlineDiffEnabled: boolean = false;

	private readonly _inlineDiffDecorations: InlineDiffDecorations;
	private readonly _ctxInlineDiff: IContextKey<boolean>;
	private _lastResponse?: EditResponse;

	constructor(
		protected readonly _session: Session,
		protected readonly _editor: IActiveCodeEditor,
		protected readonly _widget: InteractiveEditorWidget,
		@IContextKeyService contextKeyService: IContextKeyService,
		@IStorageService protected _storageService: IStorageService,
		@IBulkEditService protected readonly _bulkEditService: IBulkEditService,
		@IEditorWorkerService protected readonly _editorWorkerService: IEditorWorkerService
	) {
		super();
		this._inlineDiffDecorations = new InlineDiffDecorations(this._editor, this._inlineDiffEnabled);
		this._ctxInlineDiff = CTX_INTERACTIVE_EDITOR_INLNE_DIFF.bindTo(contextKeyService);

		this._inlineDiffEnabled = _storageService.getBoolean(LiveStrategy._inlineDiffStorageKey, StorageScope.PROFILE, false);
		this._ctxInlineDiff.set(this._inlineDiffEnabled);
		this._inlineDiffDecorations.visible = this._inlineDiffEnabled;
	}

	override dispose(): void {
		this._inlineDiffEnabled = this._inlineDiffDecorations.visible;
		this._storageService.store(LiveStrategy._inlineDiffStorageKey, this._inlineDiffEnabled, StorageScope.PROFILE, StorageTarget.USER);
		this._inlineDiffDecorations.clear();
		this._ctxInlineDiff.reset();

		super.dispose();
	}

	toggleInlineDiff(): void {
		this._inlineDiffEnabled = !this._inlineDiffEnabled;
		this._ctxInlineDiff.set(this._inlineDiffEnabled);
		this._inlineDiffDecorations.visible = this._inlineDiffEnabled;
		this._storageService.store(LiveStrategy._inlineDiffStorageKey, this._inlineDiffEnabled, StorageScope.PROFILE, StorageTarget.USER);
	}

	checkChanges(response: EditResponse): boolean {
		this._lastResponse = response;
		if (response.singleCreateFileEdit) {
			// preview stategy can handle simple workspace edit (single file create)
			return true;
		}
		if (response.workspaceEdits) {
			this._bulkEditService.apply(response.workspaceEdits, { showPreview: true });
			return false;
		}
		return true;
	}

	async apply() {
		if (this._lastResponse?.workspaceEdits) {
			await this._bulkEditService.apply(this._lastResponse.workspaceEdits);
		}
	}

	async cancel() {
		const { modelN, model0 } = this._session;
		if (modelN.isDisposed() || model0.isDisposed()) {
			return;
		}
		const edits = await this._editorWorkerService.computeMoreMinimalEdits(modelN.uri, [{ range: modelN.getFullModelRange(), text: model0.getValue() }]);
		if (edits) {
			const operations = edits.map(e => EditOperation.replace(Range.lift(e.range), e.text));
			modelN.pushEditOperations(null, operations, () => null);
		}
	}

	override async renderChanges(response: EditResponse, edits: ISingleEditOperation[], textModel0Changes: LineRangeMapping[]) {

		const cursorStateComputerAndInlineDiffCollection: ICursorStateComputer = (undoEdits) => {
			let last: Position | null = null;
			for (const edit of undoEdits) {
				last = !last || last.isBefore(edit.range.getEndPosition()) ? edit.range.getEndPosition() : last;
				this._inlineDiffDecorations.collectEditOperation(edit);
			}
			return last && [Selection.fromPositions(last)];
		};

		this._editor.pushUndoStop();
		this._editor.executeEdits('interactive-editor-live', edits, cursorStateComputerAndInlineDiffCollection);
		this._editor.pushUndoStop();
		this._inlineDiffDecorations.update();
		this._updateSummaryMessage(textModel0Changes);

		if (response.singleCreateFileEdit) {
			this._widget.showCreatePreview(response.singleCreateFileEdit.uri, await Promise.all(response.singleCreateFileEdit.edits));
		} else {
			this._widget.hideCreatePreview();
		}
	}

	protected _updateSummaryMessage(textModel0Changes: LineRangeMapping[]) {
		let linesChanged = 0;
		if (textModel0Changes) {
			for (const change of textModel0Changes) {
				linesChanged += change.changedLineCount;
			}
		}
		let message: string;
		if (linesChanged === 0) {
			message = localize('lines.0', "Generated reply");
		} else if (linesChanged === 1) {
			message = localize('lines.1', "Generated reply and changed 1 line.");
		} else {
			message = localize('lines.N', "Generated reply and changed {0} lines.", linesChanged);
		}
		this._widget.updateStatus(message);
	}
}

class LivePreviewStrategy extends LiveStrategy {

	private readonly _diffZone: InteractiveEditorLivePreviewWidget;
	private readonly _previewZone: InteractiveEditorFileCreatePreviewWidget;

	constructor(
		session: Session,
		editor: IActiveCodeEditor,
		widget: InteractiveEditorWidget,
		private _getWholeRange: () => Range,
		@IContextKeyService contextKeyService: IContextKeyService,
		@IStorageService storageService: IStorageService,
		@IBulkEditService bulkEditService: IBulkEditService,
		@IEditorWorkerService editorWorkerService: IEditorWorkerService,
		@IInstantiationService instaService: IInstantiationService,
	) {
		super(session, editor, widget, contextKeyService, storageService, bulkEditService, editorWorkerService);

		this._diffZone = instaService.createInstance(InteractiveEditorLivePreviewWidget, editor, session.model0);
		this._previewZone = instaService.createInstance(InteractiveEditorFileCreatePreviewWidget, editor);
	}

	override dispose(): void {
		this._diffZone.hide();
		this._diffZone.dispose();
		this._previewZone.hide();
		this._previewZone.dispose();
		super.dispose();
	}

	override async renderChanges(response: EditResponse, edits: ISingleEditOperation[], changes: LineRangeMapping[]) {

		this._editor.pushUndoStop();
		this._editor.executeEdits('interactive-editor-livePreview', edits);
		this._editor.pushUndoStop();

		this._diffZone.showDiff(() => this._getWholeRange(), changes);
		this._updateSummaryMessage(changes);

		if (response.singleCreateFileEdit) {
			this._previewZone.showCreation(this._getWholeRange(), response.singleCreateFileEdit.uri, await Promise.all(response.singleCreateFileEdit.edits));
		} else {
			this._previewZone.hide();
		}
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
