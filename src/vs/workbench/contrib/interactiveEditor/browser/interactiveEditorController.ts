/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { renderMarkdown } from 'vs/base/browser/markdownRenderer';
import { raceCancellationError } from 'vs/base/common/async';
import { CancellationToken, CancellationTokenSource } from 'vs/base/common/cancellation';
import { toErrorMessage } from 'vs/base/common/errorMessage';
import { isCancellationError } from 'vs/base/common/errors';
import { Event } from 'vs/base/common/event';
import { Iterable } from 'vs/base/common/iterator';
import { DisposableStore } from 'vs/base/common/lifecycle';
import { LRUCache } from 'vs/base/common/map';
import { isEqual } from 'vs/base/common/resources';
import { StopWatch } from 'vs/base/common/stopwatch';
import { URI } from 'vs/base/common/uri';
import 'vs/css!./interactiveEditor';
import { IActiveCodeEditor, ICodeEditor } from 'vs/editor/browser/editorBrowser';
import { IBulkEditService, ResourceEdit, ResourceFileEdit, ResourceTextEdit } from 'vs/editor/browser/services/bulkEditService';
import { EditOperation } from 'vs/editor/common/core/editOperation';
import { Position } from 'vs/editor/common/core/position';
import { IRange, Range } from 'vs/editor/common/core/range';
import { Selection } from 'vs/editor/common/core/selection';
import { LineRangeMapping } from 'vs/editor/common/diff/linesDiffComputer';
import { IEditorContribution, IEditorDecorationsCollection, ScrollType } from 'vs/editor/common/editorCommon';
import { LanguageSelector } from 'vs/editor/common/languageSelector';
import { CompletionContext, CompletionItem, CompletionItemInsertTextRule, CompletionItemKind, CompletionItemProvider, CompletionList, ProviderResult, TextEdit } from 'vs/editor/common/languages';
import { ICursorStateComputer, IModelDecorationOptions, IModelDeltaDecoration, ITextModel, IValidEditOperation } from 'vs/editor/common/model';
import { ModelDecorationOptions, createTextBufferFactoryFromSnapshot } from 'vs/editor/common/model/textModel';
import { IEditorWorkerService } from 'vs/editor/common/services/editorWorker';
import { ILanguageFeaturesService } from 'vs/editor/common/services/languageFeatures';
import { IModelService } from 'vs/editor/common/services/model';
import { InlineCompletionsController } from 'vs/editor/contrib/inlineCompletions/browser/inlineCompletionsController';
import { localize } from 'vs/nls';
import { IConfigurationService } from 'vs/platform/configuration/common/configuration';
import { IContextKey, IContextKeyService } from 'vs/platform/contextkey/common/contextkey';
import { IInstantiationService, ServicesAccessor } from 'vs/platform/instantiation/common/instantiation';
import { ILogService } from 'vs/platform/log/common/log';
import { IStorageService, StorageScope, StorageTarget } from 'vs/platform/storage/common/storage';
import { ITelemetryService } from 'vs/platform/telemetry/common/telemetry';
import { InteractiveEditorDiffWidget } from 'vs/workbench/contrib/interactiveEditor/browser/interactiveEditorDiffWidget';
import { InteractiveEditorZoneWidget } from 'vs/workbench/contrib/interactiveEditor/browser/interactiveEditorWidget';
import { CTX_INTERACTIVE_EDITOR_HAS_ACTIVE_REQUEST, CTX_INTERACTIVE_EDITOR_INLNE_DIFF, CTX_INTERACTIVE_EDITOR_LAST_EDIT_TYPE as CTX_INTERACTIVE_EDITOR_LAST_EDIT_KIND, CTX_INTERACTIVE_EDITOR_LAST_FEEDBACK as CTX_INTERACTIVE_EDITOR_LAST_FEEDBACK_KIND, IInteractiveEditorBulkEditResponse, IInteractiveEditorEditResponse, IInteractiveEditorRequest, IInteractiveEditorResponse, IInteractiveEditorService, IInteractiveEditorSession, IInteractiveEditorSessionProvider, IInteractiveEditorSlashCommand, INTERACTIVE_EDITOR_ID, EditMode, InteractiveEditorResponseFeedbackKind, CTX_INTERACTIVE_EDITOR_LAST_RESPONSE_TYPE, InteractiveEditorResponseType, IInteractiveEditorMessageResponse } from 'vs/workbench/contrib/interactiveEditor/common/interactiveEditor';
import { IInteractiveSessionWidgetService } from 'vs/workbench/contrib/interactiveSession/browser/interactiveSessionWidget';
import { IInteractiveSessionService } from 'vs/workbench/contrib/interactiveSession/common/interactiveSessionService';
import { INotebookEditorService } from 'vs/workbench/contrib/notebook/browser/services/notebookEditorService';
import { CellUri } from 'vs/workbench/contrib/notebook/common/notebookCommon';


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
	editMode: string;
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
	editMode: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; comment: 'What edit mode was choosen: live, livePreview, preview' };
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

class Session {

	private readonly _responses: (EditResponse | IInteractiveEditorMessageResponse)[] = [];

	readonly teldata: TelemetryData;

	constructor(
		readonly editMode: EditMode,
		readonly model0: ITextModel,
		readonly modelN: ITextModel,
		readonly provider: IInteractiveEditorSessionProvider,
		readonly session: IInteractiveEditorSession,
	) {
		this.teldata = {
			extension: provider.debugName,
			startTime: new Date().toISOString(),
			endTime: new Date().toISOString(),
			edits: false,
			terminalEdits: false,
			rounds: '',
			undos: '',
			editMode
		};
	}

	addResponse(response: EditResponse | IInteractiveEditorMessageResponse): void {
		const newLen = this._responses.push(response);
		this.teldata.rounds += `${newLen}|`;
	}

	get lastResponse(): EditResponse | IInteractiveEditorMessageResponse | undefined {
		return this._responses[this._responses.length - 1];
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
	private readonly _ctxInlineDiff: IContextKey<boolean>;
	private readonly _ctxLastResponseType: IContextKey<undefined | InteractiveEditorResponseType>;
	private readonly _ctxLastEditKind: IContextKey<'' | 'simple'>;
	private readonly _ctxLastFeedbackKind: IContextKey<'helpful' | 'unhelpful' | ''>;

	private _strategy?: EditModeStrategy;
	private _lastInlineDecorations?: InlineDiffDecorations;
	private _inlineDiffEnabled: boolean = false;

	private _currentSession?: Session;

	private _ctsSession: CancellationTokenSource = new CancellationTokenSource();
	private _ctsRequest?: CancellationTokenSource;

	private _requestPrompt: string | undefined;
	private _messageReply: string | undefined;

	constructor(
		private readonly _editor: ICodeEditor,
		@IInstantiationService private readonly _instaService: IInstantiationService,
		@IInteractiveEditorService private readonly _interactiveEditorService: IInteractiveEditorService,
		@IEditorWorkerService private readonly _editorWorkerService: IEditorWorkerService,
		@ILogService private readonly _logService: ILogService,
		@ITelemetryService private readonly _telemetryService: ITelemetryService,
		@IStorageService private readonly _storageService: IStorageService,
		@IConfigurationService private readonly _configurationService: IConfigurationService,
		@IModelService private readonly _modelService: IModelService,
		@INotebookEditorService private readonly _notebookEditorService: INotebookEditorService,
		@IContextKeyService contextKeyService: IContextKeyService,

	) {
		this._zone = this._store.add(_instaService.createInstance(InteractiveEditorZoneWidget, this._editor));
		this._ctxHasActiveRequest = CTX_INTERACTIVE_EDITOR_HAS_ACTIVE_REQUEST.bindTo(contextKeyService);
		this._ctxInlineDiff = CTX_INTERACTIVE_EDITOR_INLNE_DIFF.bindTo(contextKeyService);
		this._ctxLastEditKind = CTX_INTERACTIVE_EDITOR_LAST_EDIT_KIND.bindTo(contextKeyService);
		this._ctxLastResponseType = CTX_INTERACTIVE_EDITOR_LAST_RESPONSE_TYPE.bindTo(contextKeyService);
		this._ctxLastFeedbackKind = CTX_INTERACTIVE_EDITOR_LAST_FEEDBACK_KIND.bindTo(contextKeyService);
	}

	dispose(): void {
		this._store.dispose();
		this._ctsSession.dispose(true);
		this._ctsSession.dispose();
	}

	getId(): string {
		return INTERACTIVE_EDITOR_ID;
	}

	private _getMode(): EditMode {
		return this._configurationService.getValue('interactiveEditor.editMode');
	}

	viewInChat() {
		if (this._messageReply && this._requestPrompt) {
			this._instaService.invokeFunction(showMessageResponse, this._requestPrompt, this._messageReply);
		}
	}

	async run(options: InteractiveEditorRunOptions | undefined): Promise<void> {

		// hide/cancel inline completions when invoking IE
		InlineCompletionsController.get(this._editor)?.hide();

		const editMode = this._getMode();

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

		const store = new DisposableStore();


		let textModel0Changes: LineRangeMapping[] | undefined;
		const textModel0 = this._modelService.createModel(
			createTextBufferFactoryFromSnapshot(textModel.createSnapshot()),
			{ languageId: textModel.getLanguageId(), onDidChange: Event.None },
			undefined, true
		);

		store.add(textModel0);
		this._currentSession = new Session(editMode, textModel0, textModel, provider, session);
		this._strategy = this._instaService.createInstance(EditModeStrategy.ctor(editMode), this._currentSession);

		this._inlineDiffEnabled = this._storageService.getBoolean(InteractiveEditorController._inlineDiffStorageKey, StorageScope.PROFILE, false);
		const inlineDiffDecorations = new InlineDiffDecorations(this._editor, this._inlineDiffEnabled);
		this._lastInlineDecorations = inlineDiffDecorations;
		this._ctxInlineDiff.set(this._inlineDiffEnabled);

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

		let placeholder = session.placeholder ?? '';
		let value = options?.message ?? '';


		if (session.slashCommands) {
			store.add(this._instaService.invokeFunction(installSlashCommandSupport, this._zone.widget.inputEditor as IActiveCodeEditor, session.slashCommands));
		}

		this._zone.widget.updateStatus(session.message ?? localize('welcome.1', "AI-generated code may be incorrect."));

		// CANCEL when input changes
		this._editor.onDidChangeModel(this.cancelSession, this, store);

		if (editMode === EditMode.Live) {

			// REposition the zone widget whenever the block decoration changes
			let lastPost: Position | undefined;
			wholeRangeDecoration.onDidChange(e => {
				const range = wholeRangeDecoration.getRange(0);
				if (range && (!lastPost || !lastPost.equals(range.getEndPosition()))) {
					lastPost = range.getEndPosition();
					this._zone.updatePosition(lastPost);
				}
			}, undefined, store);
		}

		let ignoreModelChanges = false;
		this._editor.onDidChangeModelContent(e => {
			if (!ignoreModelChanges) {

				// remove inline diff when the model changes
				inlineDiffDecorations.clear();

				// note when "other" edits happen
				this._currentSession!.teldata.edits = true;

				// CANCEL if the document has changed outside the current range
				const wholeRange = wholeRangeDecoration.getRange(0);
				if (!wholeRange) {
					this._ctsSession.cancel();
					this._logService.trace('[IE] ABORT wholeRange seems gone/collapsed');
					return;
				}
				// for (const change of e.changes) {
				// 	if (!Range.areIntersectingOrTouching(wholeRange, change.range)) {
				// 		this._ctsSession.cancel();
				// 		this._logService.trace('[IE] CANCEL because of model change OUTSIDE range');
				// 		this._currentSession!.teldata.terminalEdits = true;
				// 		break;
				// 	}
				// }
			}

		}, undefined, store);

		const roundStore = new DisposableStore();
		store.add(roundStore);

		const diffZone = this._instaService.createInstance(InteractiveEditorDiffWidget, this._editor, textModel0);

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
			const inputPromise = this._zone.getInput(wholeRange.getEndPosition(), placeholder, value, this._ctsRequest.token);

			if (textModel0Changes && editMode === EditMode.LivePreview) {
				const diffPosition = diffZone.getEndPositionForChanges(wholeRange, textModel0Changes);
				if (diffPosition) {
					const newInputPosition = diffPosition.delta(0, 1);
					if (wholeRange.getEndPosition().isBefore(newInputPosition)) {
						this._zone.updatePosition(newInputPosition);
					}
				}
				diffZone.showDiff(
					() => wholeRangeDecoration.getRange(0)!, // TODO@jrieken if it can be null it will be null
					textModel0Changes
				);
			}
			this._ctxLastFeedbackKind.reset();
			// reveal the line after the whole range to ensure that the input box is visible
			this._editor.revealPosition({ lineNumber: wholeRange.endLineNumber + 1, column: 1 }, ScrollType.Smooth);
			if (options?.autoSend && !this._currentSession.lastResponse) {
				this.accept();
			}
			const input = await inputPromise;
			roundStore.clear();

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
					this._zone.widget.updateStatus(toErrorMessage(e), { classes: ['error'] });
					// statusWidget
					continue;
				}
			} finally {
				this._ctxHasActiveRequest.set(false);
				this._ctxLastResponseType.set(reply?.type);
				this._zone.widget.updateProgress(false);
				this._logService.trace('[IE] request took', sw.elapsed(), provider.debugName);
			}

			if (this._ctsRequest.token.isCancellationRequested) {
				this._logService.trace('[IE] request CANCELED', provider.debugName);
				continue;
			}

			if (!reply) {
				this._logService.trace('[IE] NO reply or edits', provider.debugName);
				this._zone.widget.updateStatus(localize('empty', "No results, please refine your input and try again."), { classes: ['warn'] });
				continue;
			}


			this._recorder.addExchange(session, request, reply);
			this._zone.widget.updateToolbar(true);

			if (reply.type === 'message') {
				this._logService.info('[IE] received a MESSAGE, continuing outside editor', provider.debugName);
				this._messageReply = reply.message.value;
				this._requestPrompt = request.prompt;
				const renderedMarkdown = renderMarkdown(reply.message, { inline: true });
				this._zone.widget.updateMarkdownMessage(renderedMarkdown.element);
				this._currentSession.addResponse(reply);
				continue;
			}

			const editResponse = new EditResponse(textModel.uri, reply);
			this._currentSession.addResponse(editResponse);

			const canContinue = this._strategy.update(editResponse);
			if (!canContinue) {
				break;
			}

			this._ctxLastEditKind.set(editResponse.localEdits.length === 1 ? 'simple' : '');

			// inline diff
			inlineDiffDecorations.clear();


			// use whole range from reply
			if (reply.wholeRange) {
				wholeRangeDecoration.set([{
					range: reply.wholeRange,
					options: InteractiveEditorController._decoWholeRange
				}]);
			}

			if (editMode === EditMode.Preview) {
				// only preview changes
				if (editResponse.localEdits.length > 0) {
					this._zone.widget.showEditsPreview(textModel, editResponse.localEdits);
				} else {
					this._zone.widget.hideEditsPreview();
				}

			} else {
				// make edits more minimal

				const moreMinimalEdits = (await this._editorWorkerService.computeHumanReadableDiff(textModel.uri, editResponse.localEdits));
				const editOperations = (moreMinimalEdits ?? editResponse.localEdits).map(edit => EditOperation.replace(Range.lift(edit.range), edit.text));
				this._logService.trace('[IE] edits from PROVIDER and after making them MORE MINIMAL', provider.debugName, editResponse.localEdits, moreMinimalEdits);

				const textModelNplus1 = this._modelService.createModel(createTextBufferFactoryFromSnapshot(textModel.createSnapshot()), null, undefined, true);
				textModelNplus1.applyEdits(editOperations);
				const diff = await this._editorWorkerService.computeDiff(textModel0.uri, textModelNplus1.uri, { ignoreTrimWhitespace: false, maxComputationTimeMs: 5000 }, 'advanced');
				textModel0Changes = diff?.changes ?? undefined;
				textModelNplus1.dispose();

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
						editOperations,
						cursorStateComputerAndInlineDiffCollection
					);
					this._editor.pushUndoStop();

				} finally {
					ignoreModelChanges = false;
				}

				if (editMode === EditMode.Live) {
					inlineDiffDecorations.update();
				}

				// summary message
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
				this._zone.widget.updateStatus(message);
			}


			if (editResponse.singleCreateFileEdit) {
				this._zone.widget.showCreatePreview(editResponse.singleCreateFileEdit.uri, await Promise.all(editResponse.singleCreateFileEdit.edits));
			} else {
				this._zone.widget.hideCreatePreview();
			}

			placeholder = reply.placeholder ?? session.placeholder ?? '';

		} while (!thisSession.token.isCancellationRequested);

		this._inlineDiffEnabled = inlineDiffDecorations.visible;
		this._storageService.store(InteractiveEditorController._inlineDiffStorageKey, this._inlineDiffEnabled, StorageScope.PROFILE, StorageTarget.USER);


		this._logService.trace('[IE] session DONE', provider.debugName);
		this._currentSession.teldata.endTime = new Date().toISOString();
		this._telemetryService.publicLog2<TelemetryData, TelemetryDataClassification>('interactiveEditor/session', this._currentSession.teldata);

		// done, cleanup

		diffZone.hide();
		diffZone.dispose();

		wholeRangeDecoration.clear();
		blockDecoration.clear();
		inlineDiffDecorations.clear();

		store.dispose();
		session.dispose?.();

		this._ctxLastEditKind.reset();
		this._ctxLastResponseType.reset();
		this._ctxLastFeedbackKind.reset();
		this._currentSession = undefined;
		this._lastInlineDecorations = undefined;

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
		this._zone.widget.acceptInput();
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
		if (this._currentSession?.lastResponse instanceof EditResponse) {
			this._currentSession.modelN.undo();
			return this._currentSession.lastResponse.localEdits[0].text;
		}
	}

	feedbackLast(helpful: boolean) {
		if (this._currentSession?.lastResponse) {
			const kind = helpful ? InteractiveEditorResponseFeedbackKind.Helpful : InteractiveEditorResponseFeedbackKind.Unhelpful;
			this._currentSession.provider.handleInteractiveEditorResponseFeedback?.(this._currentSession.session, this._currentSession.lastResponse instanceof EditResponse ? this._currentSession.lastResponse.raw : this._currentSession.lastResponse, kind);
			this._ctxLastFeedbackKind.set(helpful ? 'helpful' : 'unhelpful');
			this._zone.widget.updateStatus('Thank you for your feedback!', { resetAfter: 1250 });
		}
	}

	async applyChanges(): Promise<EditResponse | void> {
		if (this._currentSession?.lastResponse instanceof EditResponse) {
			const { lastResponse } = this._currentSession;
			await this._strategy?.apply();
			this._ctsSession.cancel();
			return lastResponse;
		}
	}

	async cancelSession() {
		await this._strategy?.cancel();
		this._ctsSession.cancel();
	}
}

abstract class EditModeStrategy {

	static ctor(mode: EditMode) {
		switch (mode) {
			case EditMode.Live: return LiveStrategy;
			case EditMode.LivePreview: return LivePreviewStrategy;
			case EditMode.Preview: return PreviewStrategy;
		}
	}

	abstract update(response: EditResponse): boolean;

	abstract apply(): Promise<void>;

	abstract cancel(): Promise<void>;
}

class PreviewStrategy extends EditModeStrategy {

	constructor(
		protected readonly _session: Session,
		@IBulkEditService private readonly _bulkEditService: IBulkEditService,
	) {
		super();
	}

	update(response: EditResponse): boolean {
		if (!response.workspaceEdits || response.singleCreateFileEdit) {
			// preview stategy can handle simple workspace edit (single file create)
			return true;
		}
		this._bulkEditService.apply(response.workspaceEdits, { showPreview: true });
		return false;
	}

	async apply() {

		const response = this._session.lastResponse;
		if (!(response instanceof EditResponse)) {
			return;
		}

		if (response.workspaceEdits) {
			await this._bulkEditService.apply(response.workspaceEdits);

		} else if (!response.workspaceEditsIncludeLocalEdits) {

			const { modelN } = this._session;

			if (modelN.equalsTextBuffer(this._session.model0.getTextBuffer())) {
				modelN.pushStackElement();
				const edits = response.localEdits.map(edit => EditOperation.replace(Range.lift(edit.range), edit.text));
				modelN.pushEditOperations(null, edits, () => null);
				modelN.pushStackElement();
			}
		}
	}

	async cancel(): Promise<void> {
		// nothing to do
	}
}

class LiveStrategy extends EditModeStrategy {

	constructor(
		protected readonly _session: Session,
		@IBulkEditService protected readonly _bulkEditService: IBulkEditService,
		@IEditorWorkerService protected readonly _editorWorkerService: IEditorWorkerService
	) {
		super();
	}

	update(response: EditResponse): boolean {
		if (response.workspaceEdits) {
			this._bulkEditService.apply(response.workspaceEdits, { showPreview: true });
			return false;
		}
		return true;
	}

	async apply() {
		// nothing to do
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
}

class LivePreviewStrategy extends LiveStrategy {

	private _lastResponse?: EditResponse;

	override update(response: EditResponse): boolean {
		this._lastResponse = response;
		if (response.singleCreateFileEdit) {
			// preview stategy can handle simple workspace edit (single file create)
			return true;
		}
		return super.update(response);
	}

	override async apply() {
		if (this._lastResponse?.workspaceEdits) {
			await this._bulkEditService.apply(this._lastResponse.workspaceEdits);
		}
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
	const providerId = interactiveSessionService.getProviderInfos()[0]?.id;

	const interactiveSessionWidgetService = accessor.get(IInteractiveSessionWidgetService);
	const widget = await interactiveSessionWidgetService.revealViewForProvider(providerId);
	if (widget && widget.viewModel) {
		await interactiveSessionService.addCompleteRequest(widget.viewModel.sessionId, query, { message: response });
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
