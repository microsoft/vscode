/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import 'vs/css!./interactiveEditor';
import { CancellationToken, CancellationTokenSource } from 'vs/base/common/cancellation';
import { DisposableStore } from 'vs/base/common/lifecycle';
import { IActiveCodeEditor, ICodeEditor } from 'vs/editor/browser/editorBrowser';
import { Range } from 'vs/editor/common/core/range';
import { IEditorContribution, IEditorDecorationsCollection, ScrollType } from 'vs/editor/common/editorCommon';
import { localize } from 'vs/nls';
import { IContextKey, IContextKeyService } from 'vs/platform/contextkey/common/contextkey';
import { IInstantiationService, ServicesAccessor } from 'vs/platform/instantiation/common/instantiation';
import { IInteractiveEditorResponse, IInteractiveEditorService, CTX_INTERACTIVE_EDITOR_HAS_ACTIVE_REQUEST, IInteractiveEditorRequest, IInteractiveEditorSession, IInteractiveEditorSlashCommand, IInteractiveEditorSessionProvider, InteractiveEditorResponseFeedbackKind, IInteractiveEditorEditResponse, CTX_INTERACTIVE_EDITOR_LAST_EDIT_TYPE as CTX_INTERACTIVE_EDITOR_LAST_EDIT_KIND, CTX_INTERACTIVE_EDITOR_LAST_FEEDBACK as CTX_INTERACTIVE_EDITOR_LAST_FEEDBACK_KIND, CTX_INTERACTIVE_EDITOR_INLNE_DIFF, CTX_INTERACTIVE_EDITOR_HAS_RESPONSE, IInteractiveEditorBulkEditResponse } from 'vs/workbench/contrib/interactiveEditor/common/interactiveEditor';
import { EditOperation } from 'vs/editor/common/core/editOperation';
import { Iterable } from 'vs/base/common/iterator';
import { ICursorStateComputer, IModelDecorationOptions, IModelDeltaDecoration, ITextModel, IValidEditOperation } from 'vs/editor/common/model';
import { ModelDecorationOptions } from 'vs/editor/common/model/textModel';
import { Position } from 'vs/editor/common/core/position';
import { Selection } from 'vs/editor/common/core/selection';
import { raceCancellationError } from 'vs/base/common/async';
import { isCancellationError } from 'vs/base/common/errors';
import { IEditorWorkerService } from 'vs/editor/common/services/editorWorker';
import { ILogService } from 'vs/platform/log/common/log';
import { StopWatch } from 'vs/base/common/stopwatch';
import { LRUCache } from 'vs/base/common/map';
import { ITelemetryService } from 'vs/platform/telemetry/common/telemetry';
import { IBulkEditService, ResourceEdit, ResourceFileEdit, ResourceTextEdit } from 'vs/editor/browser/services/bulkEditService';
import { toErrorMessage } from 'vs/base/common/errorMessage';
import { IInteractiveSessionWidgetService } from 'vs/workbench/contrib/interactiveSession/browser/interactiveSessionWidget';
import { IViewsService } from 'vs/workbench/common/views';
import { IInteractiveSessionContributionService } from 'vs/workbench/contrib/interactiveSession/common/interactiveSessionContributionService';
import { InteractiveSessionViewPane } from 'vs/workbench/contrib/interactiveSession/browser/interactiveSessionSidebar';
import { ILanguageFeaturesService } from 'vs/editor/common/services/languageFeatures';
import { CompletionContext, CompletionItem, CompletionItemInsertTextRule, CompletionItemKind, CompletionItemProvider, CompletionList, ProviderResult, TextEdit } from 'vs/editor/common/languages';
import { LanguageSelector } from 'vs/editor/common/languageSelector';
import { IInteractiveSessionService } from 'vs/workbench/contrib/interactiveSession/common/interactiveSessionService';
import { IStorageService, StorageScope, StorageTarget } from 'vs/platform/storage/common/storage';
import { splitLines } from 'vs/base/common/strings';
import { InteractiveEditorZoneWidget } from 'vs/workbench/contrib/interactiveEditor/browser/interactiveEditorWidget';
import { IConfigurationService } from 'vs/platform/configuration/common/configuration';
import { URI } from 'vs/base/common/uri';
import { isEqual } from 'vs/base/common/resources';


type Exchange = { req: IInteractiveEditorRequest; res: IInteractiveEditorResponse };
export type Recording = { when: Date; session: IInteractiveEditorSession; value: string; exchanges: Exchange[] };

class SessionRecorder {

	private readonly _data = new LRUCache<IInteractiveEditorSession, Recording>(3);

	add(session: IInteractiveEditorSession, model: ITextModel) {
		this._data.set(session, { when: new Date(), session, value: model.getValue(), exchanges: [] });
	}

	addExchange(session: IInteractiveEditorSession, req: IInteractiveEditorRequest, res: IInteractiveEditorResponse) {
		this._data.get(session)?.exchanges.push({ req, res });
	}

	getAll(): Recording[] {
		return [...this._data.values()];
	}
}

type TelemetryData = {
	extension: string;
	rounds: string;
	undos: string;
	edits: boolean;
	terminalEdits: boolean;
	startTime: string;
	endTime: string;
};

type TelemetryDataClassification = {
	owner: 'jrieken';
	comment: 'Data about an interaction editor session';
	extension: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; comment: 'The extension providing the data' };
	rounds: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; comment: 'Number of request that were made' };
	undos: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; isMeasurement: true; comment: 'Requests that have been undone' };
	edits: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; isMeasurement: true; comment: 'Did edits happen while the session was active' };
	terminalEdits: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; comment: 'Did edits terminal the session' };
	startTime: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; comment: 'When the session started' };
	endTime: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; comment: 'When the session ended' };
};

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

export class EditResponse {

	readonly localEdits: TextEdit[] = [];
	readonly singleCreateFileEdit: { uri: URI; edits: Promise<TextEdit>[] } | undefined;
	readonly workspaceEdits: ResourceEdit[] | undefined;
	readonly workspaceEditsIncludeLocalEdits: boolean = false;

	constructor(localUri: URI, readonly raw: IInteractiveEditorBulkEditResponse | IInteractiveEditorEditResponse) {
		if (raw.type === 'editorEdit') {
			//
			this.localEdits = raw.edits;
			this.singleCreateFileEdit = undefined;
			this.workspaceEdits = undefined;

		} else {
			//
			const edits = ResourceEdit.convert(raw.edits);
			this.workspaceEdits = edits;

			let isComplexEdit = false;

			for (const edit of edits) {
				if (edit instanceof ResourceFileEdit) {
					if (!isComplexEdit && edit.newResource && !edit.oldResource) {
						// file create
						if (this.singleCreateFileEdit) {
							isComplexEdit = true;
							this.singleCreateFileEdit = undefined;
						} else {
							this.singleCreateFileEdit = { uri: edit.newResource, edits: [] };
							if (edit.options.contents) {
								this.singleCreateFileEdit.edits.push(edit.options.contents.then(x => ({ range: new Range(1, 1, 1, 1), text: x.toString() })));
							}
						}
					}
				} else if (edit instanceof ResourceTextEdit) {
					//
					if (isEqual(edit.resource, localUri)) {
						this.localEdits.push(edit.textEdit);
						this.workspaceEditsIncludeLocalEdits = true;

					} else if (isEqual(this.singleCreateFileEdit?.uri, edit.resource)) {
						this.singleCreateFileEdit!.edits.push(Promise.resolve(edit.textEdit));
					} else {
						isComplexEdit = true;
					}
				}
			}

			if (isComplexEdit) {
				this.singleCreateFileEdit = undefined;
			}
		}
	}
}

class LastEditorState {

	constructor(
		readonly model: ITextModel,
		readonly modelVersionId: number,
		readonly provider: IInteractiveEditorSessionProvider,
		readonly session: IInteractiveEditorSession,
		readonly response: EditResponse,
	) { }
}

type EditMode = 'preview' | 'direct';

export class InteractiveEditorController implements IEditorContribution {

	static ID = 'interactiveEditor';

	static get(editor: ICodeEditor) {
		return editor.getContribution<InteractiveEditorController>(InteractiveEditorController.ID);
	}

	private static _inlineDiffStorageKey: string = 'interactiveEditor.storage.inlineDiff';

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
	private readonly _recorder = new SessionRecorder();
	private readonly _zone: InteractiveEditorZoneWidget;
	private readonly _ctxHasActiveRequest: IContextKey<boolean>;
	private readonly _ctxHasResponse: IContextKey<boolean>;
	private readonly _ctxInlineDiff: IContextKey<boolean>;
	private readonly _ctxLastEditKind: IContextKey<'' | 'simple'>;
	private readonly _ctxLastFeedbackKind: IContextKey<'helpful' | 'unhelpful' | ''>;

	private _lastEditState?: LastEditorState;
	private _lastInlineDecorations?: InlineDiffDecorations;
	private _inlineDiffEnabled: boolean = false;

	private _ctsSession: CancellationTokenSource = new CancellationTokenSource();
	private _ctsRequest?: CancellationTokenSource;

	constructor(
		private readonly _editor: ICodeEditor,
		@IInstantiationService private readonly _instaService: IInstantiationService,
		@IInteractiveEditorService private readonly _interactiveEditorService: IInteractiveEditorService,
		@IBulkEditService private readonly _bulkEditService: IBulkEditService,
		@IEditorWorkerService private readonly _editorWorkerService: IEditorWorkerService,
		@ILogService private readonly _logService: ILogService,
		@ITelemetryService private readonly _telemetryService: ITelemetryService,
		@IStorageService private readonly _storageService: IStorageService,
		@IConfigurationService private readonly _configurationService: IConfigurationService,
		@IContextKeyService contextKeyService: IContextKeyService,

	) {
		this._zone = this._store.add(_instaService.createInstance(InteractiveEditorZoneWidget, this._editor));
		this._ctxHasActiveRequest = CTX_INTERACTIVE_EDITOR_HAS_ACTIVE_REQUEST.bindTo(contextKeyService);
		this._ctxHasResponse = CTX_INTERACTIVE_EDITOR_HAS_RESPONSE.bindTo(contextKeyService);
		this._ctxInlineDiff = CTX_INTERACTIVE_EDITOR_INLNE_DIFF.bindTo(contextKeyService);
		this._ctxLastEditKind = CTX_INTERACTIVE_EDITOR_LAST_EDIT_KIND.bindTo(contextKeyService);
		this._ctxLastFeedbackKind = CTX_INTERACTIVE_EDITOR_LAST_FEEDBACK_KIND.bindTo(contextKeyService);
	}

	dispose(): void {
		this._store.dispose();
		this._ctsSession.dispose(true);
		this._ctsSession.dispose();
	}

	getId(): string {
		return InteractiveEditorController.ID;
	}

	async run(initialRange?: Range): Promise<void> {

		const editMode: EditMode = this._configurationService.getValue('interactiveEditor.editMode');

		this._ctsSession.dispose(true);

		if (!this._editor.hasModel()) {
			return;
		}

		const provider = Iterable.first(this._interactiveEditorService.getAllProvider());
		if (!provider) {
			this._logService.trace('[IE] NO provider found');
			return;
		}

		const thisSession = this._ctsSession = new CancellationTokenSource();
		const textModel = this._editor.getModel();
		const selection = this._editor.getSelection();
		const session = await provider.prepareInteractiveEditorSession(textModel, selection, this._ctsSession.token);
		if (!session) {
			this._logService.trace('[IE] NO session', provider.debugName);
			return;
		}
		this._recorder.add(session, textModel);
		this._logService.trace('[IE] NEW session', provider.debugName);

		const data: TelemetryData = {
			extension: provider.debugName,
			startTime: new Date().toISOString(),
			endTime: new Date().toISOString(),
			edits: false,
			terminalEdits: false,
			rounds: '',
			undos: ''
		};

		this._inlineDiffEnabled = this._storageService.getBoolean(InteractiveEditorController._inlineDiffStorageKey, StorageScope.PROFILE, false);
		const inlineDiffDecorations = new InlineDiffDecorations(this._editor, this._inlineDiffEnabled);
		this._lastInlineDecorations = inlineDiffDecorations;
		this._ctxInlineDiff.set(this._inlineDiffEnabled);

		const blockDecoration = this._editor.createDecorationsCollection();
		const wholeRangeDecoration = this._editor.createDecorationsCollection();

		if (!initialRange) {
			initialRange = session.wholeRange ? Range.lift(session.wholeRange) : selection;
		}
		if (initialRange.isEmpty()) {
			initialRange = new Range(
				initialRange.startLineNumber, 1,
				initialRange.startLineNumber, textModel.getLineMaxColumn(initialRange.startLineNumber)
			);
		}
		wholeRangeDecoration.set([{
			range: initialRange,
			options: InteractiveEditorController._decoWholeRange
		}]);


		let placeholder = session.placeholder ?? '';
		let value = '';

		const store = new DisposableStore();

		if (session.slashCommands) {
			store.add(this._instaService.invokeFunction(installSlashCommandSupport, this._zone.widget.inputEditor as IActiveCodeEditor, session.slashCommands));
		}

		this._zone.widget.updateMessage(session.message ?? localize('welcome.1', "AI-generated code may be incorrect."));

		// CANCEL when input changes
		this._editor.onDidChangeModel(this._ctsSession.cancel, this._ctsSession, store);

		// REposition the zone widget whenever the block decoration changes
		let lastPost: Position | undefined;
		wholeRangeDecoration.onDidChange(e => {
			const range = wholeRangeDecoration.getRange(0);
			if (range && (!lastPost || !lastPost.equals(range.getEndPosition()))) {
				lastPost = range.getEndPosition();
				this._zone.updatePosition(lastPost);
			}
		}, undefined, store);

		let ignoreModelChanges = false;
		this._editor.onDidChangeModelContent(e => {
			if (!ignoreModelChanges) {

				// remove inline diff when the model changes
				inlineDiffDecorations.clear();

				// note when "other" edits happen
				data.edits = true;

				// CANCEL if the document has changed outside the current range
				const wholeRange = wholeRangeDecoration.getRange(0);
				if (!wholeRange) {
					this._ctsSession.cancel();
					this._logService.trace('[IE] ABORT wholeRange seems gone/collapsed');
					return;
				}
				for (const change of e.changes) {
					if (!Range.areIntersectingOrTouching(wholeRange, change.range)) {
						this._ctsSession.cancel();
						this._logService.trace('[IE] CANCEL because of model change OUTSIDE range');
						data.terminalEdits = true;
						break;
					}
				}
			}

		}, undefined, store);

		let round = 0;
		const roundStore = new DisposableStore();
		store.add(roundStore);

		do {

			round += 1;

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
			const inputPromise = this._zone.getInput(wholeRange.getEndPosition(), placeholder, value, this._ctsRequest.token);


			this._ctxLastFeedbackKind.reset();

			// reveal the line after the whole range to ensure that the input box is visible
			this._editor.revealPosition({ lineNumber: wholeRange.endLineNumber + 1, column: 1 }, ScrollType.Smooth);

			const input = await inputPromise;
			roundStore.clear();

			if (!input) {
				continue;
			}

			if (!InteractiveEditorController._promptHistory.includes(input)) {
				InteractiveEditorController._promptHistory.unshift(input);
			}

			const refer = session.slashCommands?.some(value => value.refer && input.startsWith(`/${value.command}`));
			if (refer) {
				this._logService.info('[IE] seeing refer command, continuing outside editor', provider.debugName);
				this._editor.setSelection(wholeRange);
				this._instaService.invokeFunction(sendRequest, input);
				continue;
			}

			const sw = StopWatch.create();
			const request: IInteractiveEditorRequest = {
				prompt: input,
				selection: this._editor.getSelection(),
				wholeRange
			};
			const task = provider.provideResponse(session, request, this._ctsRequest.token);
			this._logService.trace('[IE] request started', provider.debugName, session, request);
			value = input;

			let reply: IInteractiveEditorResponse | null | undefined;
			try {
				this._zone.widget.updateProgress(true);
				this._ctxHasActiveRequest.set(true);
				reply = await raceCancellationError(Promise.resolve(task), this._ctsRequest.token);

			} catch (e) {
				if (!isCancellationError(e)) {
					this._logService.error('[IE] ERROR during request', provider.debugName);
					this._logService.error(e);
					this._zone.widget.updateMessage(toErrorMessage(e), ['error']);
					// statusWidget
					continue;
				}
			} finally {
				this._ctxHasActiveRequest.set(false);
				this._ctxHasResponse.set(!!reply);
				this._zone.widget.updateProgress(false);
				this._logService.trace('[IE] request took', sw.elapsed(), provider.debugName);
			}

			if (this._ctsRequest.token.isCancellationRequested) {
				this._logService.trace('[IE] request CANCELED', provider.debugName);
				continue;
			}

			if (!reply) {
				this._logService.trace('[IE] NO reply or edits', provider.debugName);
				this._zone.widget.updateMessage(localize('empty', "No results, please refine your input and try again."), ['warn']);
				continue;
			}


			this._recorder.addExchange(session, request, reply);

			if (reply.type === 'message') {
				this._logService.info('[IE] received a MESSAGE, continuing outside editor', provider.debugName);
				this._instaService.invokeFunction(showMessageResponse, request.prompt, reply.message.value);
				continue;
			}

			const editResponse = new EditResponse(textModel.uri, reply);

			if (editResponse.workspaceEdits && (!editResponse.singleCreateFileEdit || editMode === 'direct')) {
				this._bulkEditService.apply(editResponse.workspaceEdits, { editor: this._editor, label: localize('ie', "{0}", input), showPreview: true });
				// todo@jrieken keep interactive editor?
				break;
			}

			this._ctxLastEditKind.set(editResponse.localEdits.length === 1 ? 'simple' : '');

			// inline diff
			inlineDiffDecorations.clear();

			this._lastEditState = new LastEditorState(textModel, textModel.getAlternativeVersionId(), provider, session, editResponse);

			// use whole range from reply
			if (reply.wholeRange) {
				wholeRangeDecoration.set([{
					range: reply.wholeRange,
					options: InteractiveEditorController._decoWholeRange
				}]);
			}

			if (editMode === 'preview') {
				// only preview changes
				if (editResponse.localEdits.length > 0) {
					this._zone.widget.showEditsPreview(textModel, editResponse.localEdits);
				} else {
					this._zone.widget.hideEditsPreview();
				}

			} else {
				// make edits more minimal
				const moreMinimalEdits = (await this._editorWorkerService.computeHumanReadableDiff(textModel.uri, editResponse.localEdits));
				this._logService.trace('[IE] edits from PROVIDER and after making them MORE MINIMAL', provider.debugName, editResponse.localEdits, moreMinimalEdits);

				try {
					ignoreModelChanges = true;

					const cursorStateComputerAndInlineDiffCollection: ICursorStateComputer = (undoEdits) => {
						let last: Position | null = null;
						for (const edit of undoEdits) {
							last = !last || last.isBefore(edit.range.getEndPosition()) ? edit.range.getEndPosition() : last;
							inlineDiffDecorations.collectEditOperation(edit);
						}
						return last && [Selection.fromPositions(last)];
					};

					this._editor.pushUndoStop();
					this._editor.executeEdits(
						'interactive-editor',
						(moreMinimalEdits ?? editResponse.localEdits).map(edit => EditOperation.replace(Range.lift(edit.range), edit.text)),
						cursorStateComputerAndInlineDiffCollection
					);
					this._editor.pushUndoStop();

				} finally {
					ignoreModelChanges = false;
				}

				inlineDiffDecorations.update();

				// line count
				const lineSet = new Set<number>();
				let addRemoveCount = 0;
				for (const edit of moreMinimalEdits ?? editResponse.localEdits) {

					const len2 = splitLines(edit.text).length - 1;

					if (Range.isEmpty(edit.range) && len2 > 0) {
						// insert lines
						addRemoveCount += len2;
					} else if (Range.isEmpty(edit.range) && edit.text.length === 0) {
						// delete
						addRemoveCount += edit.range.endLineNumber - edit.range.startLineNumber + 1;
					} else {
						// edit
						for (let line = edit.range.startLineNumber; line <= edit.range.endLineNumber; line++) {
							lineSet.add(line);
						}
					}
				}
				const linesChanged = addRemoveCount + lineSet.size;

				this._zone.widget.updateMessage(linesChanged === 1
					? localize('lines.1', "Generated reply and changed 1 line.")
					: localize('lines.N', "Generated reply and changed {0} lines.", linesChanged)
				);
			}

			this._zone.widget.updateToolbar(true);

			if (editResponse.singleCreateFileEdit) {
				this._zone.widget.showCreatePreview(editResponse.singleCreateFileEdit.uri, await Promise.all(editResponse.singleCreateFileEdit.edits));
			} else {
				this._zone.widget.hideCreatePreview();
			}

			placeholder = reply.placeholder ?? session.placeholder ?? '';

			data.rounds += round + '|';

		} while (!thisSession.token.isCancellationRequested);

		this._inlineDiffEnabled = inlineDiffDecorations.visible;
		this._storageService.store(InteractiveEditorController._inlineDiffStorageKey, this._inlineDiffEnabled, StorageScope.PROFILE, StorageTarget.USER);

		// done, cleanup
		wholeRangeDecoration.clear();
		blockDecoration.clear();
		inlineDiffDecorations.clear();

		store.dispose();
		session.dispose?.();

		this._ctxLastEditKind.reset();
		this._ctxHasResponse.reset();
		this._ctxLastFeedbackKind.reset();
		this._lastEditState = undefined;
		this._lastInlineDecorations = undefined;

		this._zone.hide();
		this._editor.focus();

		this._logService.trace('[IE] session DONE', provider.debugName);
		data.endTime = new Date().toISOString();

		this._telemetryService.publicLog2<TelemetryData, TelemetryDataClassification>('interactiveEditor/session', data);
	}

	accept(): void {
		this._zone.widget.acceptInput();
	}

	cancelCurrentRequest(): void {
		this._ctsRequest?.cancel();
	}

	cancelSession() {
		this._ctsSession.cancel();
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
		this._inlineDiffEnabled = !this._inlineDiffEnabled;
		this._ctxInlineDiff.set(this._inlineDiffEnabled);
		this._storageService.store(InteractiveEditorController._inlineDiffStorageKey, this._inlineDiffEnabled, StorageScope.PROFILE, StorageTarget.USER);
		if (this._lastInlineDecorations) {
			this._lastInlineDecorations.visible = this._inlineDiffEnabled;
		}
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
		this._zone.widget.populateInputField(entry);
		this._historyOffset = pos;
	}

	recordings() {
		return this._recorder.getAll();
	}

	undoLast(): string | void {
		if (this._lastEditState) {
			const { model, modelVersionId } = this._lastEditState;
			while (model.getAlternativeVersionId() !== modelVersionId) {
				model.undo();
			}
			this._lastEditState.provider.handleInteractiveEditorResponseFeedback?.(this._lastEditState.session, this._lastEditState.response.raw, InteractiveEditorResponseFeedbackKind.Undone);
			return this._lastEditState.response.localEdits[0].text;
		}
	}

	feedbackLast(helpful: boolean) {
		if (this._lastEditState) {
			const kind = helpful ? InteractiveEditorResponseFeedbackKind.Helpful : InteractiveEditorResponseFeedbackKind.Unhelpful;
			this._lastEditState.provider.handleInteractiveEditorResponseFeedback?.(this._lastEditState.session, this._lastEditState.response.raw, kind);
			this._ctxLastFeedbackKind.set(helpful ? 'helpful' : 'unhelpful');
			this._zone.widget.updateMessage('Thank you for your feedback!', undefined, 1250);
		}
	}

	async applyChanges() {
		if (!this._lastEditState) {
			return undefined;
		}

		const { model, modelVersionId, response } = this._lastEditState;

		if (response.workspaceEdits) {
			await this._bulkEditService.apply(response.workspaceEdits);

		} else if (!response.workspaceEditsIncludeLocalEdits) {
			if (model.getAlternativeVersionId() === modelVersionId) {
				model.pushStackElement();
				const edits = response.localEdits.map(edit => EditOperation.replace(Range.lift(edit.range), edit.text));
				model.pushEditOperations(null, edits, () => null);
				model.pushStackElement();
			}
		}

		return response;
	}
}

function installSlashCommandSupport(accessor: ServicesAccessor, editor: IActiveCodeEditor, commands: IInteractiveEditorSlashCommand[]) {

	const languageFeaturesService = accessor.get(ILanguageFeaturesService);

	const store = new DisposableStore();
	const selector: LanguageSelector = { scheme: editor.getModel().uri.scheme, pattern: editor.getModel().uri.path, language: editor.getModel().getLanguageId() };
	store.add(languageFeaturesService.completionProvider.register(selector, new class implements CompletionItemProvider {

		_debugDisplayName?: string = 'InteractiveEditorSlashCommandProvider';

		readonly triggerCharacters?: string[] = ['/'];

		provideCompletionItems(model: ITextModel, position: Position, context: CompletionContext, token: CancellationToken): ProviderResult<CompletionList> {
			if (position.lineNumber !== 1 && position.column !== 1) {
				return undefined;
			}

			const suggestions: CompletionItem[] = commands.map(command => {

				const withSlash = `/${command.command}`;

				return {
					label: { label: withSlash, description: command.detail },
					insertText: `${withSlash} $0`,
					insertTextRules: CompletionItemInsertTextRule.InsertAsSnippet,
					kind: CompletionItemKind.Text,
					range: new Range(1, 1, 1, 1),
				};
			});

			return { suggestions };
		}
	}));

	const decorations = editor.createDecorationsCollection();

	const updateSlashDecorations = () => {
		const newDecorations: IModelDeltaDecoration[] = [];
		for (const command of commands) {
			const withSlash = `/${command.command}`;
			const firstLine = editor.getModel().getLineContent(1);
			if (firstLine.startsWith(withSlash)) {
				newDecorations.push({
					range: new Range(1, 1, 1, withSlash.length + 1),
					options: {
						description: 'interactive-editor-slash-command',
						inlineClassName: 'interactive-editor-slash-command',
					}
				});

				// inject detail when otherwise empty
				if (firstLine === `/${command.command} `) {
					newDecorations.push({
						range: new Range(1, withSlash.length + 1, 1, withSlash.length + 2),
						options: {
							description: 'interactive-editor-slash-command-detail',
							after: {
								content: `${command.detail}`,
								inlineClassName: 'interactive-editor-slash-command-detail'
							}
						}
					});
				}
				break;
			}
		}
		decorations.set(newDecorations);
	};

	store.add(editor.onDidChangeModelContent(updateSlashDecorations));
	updateSlashDecorations();

	return store;
}

async function showMessageResponse(accessor: ServicesAccessor, query: string, response: string) {
	const interactiveSessionService = accessor.get(IInteractiveSessionService);
	const providerId = interactiveSessionService.getProviders()[0];
	if (await interactiveSessionService.revealSessionForProvider(providerId)) {
		interactiveSessionService.addCompleteRequest(providerId, query, { message: response });
	}
}

async function sendRequest(accessor: ServicesAccessor, query: string) {

	const widgetService = accessor.get(IInteractiveSessionWidgetService);
	const viewsService = accessor.get(IViewsService);
	const interactiveSessionContributionService = accessor.get(IInteractiveSessionContributionService);

	if (widgetService.lastFocusedWidget && widgetService.lastFocusedWidget.viewId) {
		// option 1 - take the most recent view
		viewsService.openView(widgetService.lastFocusedWidget.viewId, true);
		widgetService.lastFocusedWidget.acceptInput(query);

	} else {
		// fallback - take the first view that's openable
		for (const { id } of interactiveSessionContributionService.registeredProviders) {
			const viewId = interactiveSessionContributionService.getViewIdForProvider(id);
			const view = await viewsService.openView<InteractiveSessionViewPane>(viewId, true);
			if (view) {
				view.acceptInput(query);
				break;
			}
		}
	}
}
