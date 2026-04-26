/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { ChatFetchResponseType } from '../../../platform/chat/common/commonTypes';
import { IGitExtensionService } from '../../../platform/git/common/gitExtensionService';
import { DebugRecorderBookmark } from '../../../platform/inlineEdits/common/debugRecorderBookmark';
import { IObservableDocument, ObservableWorkspace } from '../../../platform/inlineEdits/common/observableWorkspace';
import { IStatelessNextEditTelemetry, StatelessNextEditRequest } from '../../../platform/inlineEdits/common/statelessNextEditProvider';
import { autorunWithChanges } from '../../../platform/inlineEdits/common/utils/observable';
import { APIUsage } from '../../../platform/networking/common/openai';
import { INotebookService } from '../../../platform/notebook/common/notebookService';
import { ITelemetryService, multiplexProperties, TelemetryEventMeasurements, TelemetryEventProperties } from '../../../platform/telemetry/common/telemetry';
import { IWorkspaceService } from '../../../platform/workspace/common/workspaceService';
import { LogEntry } from '../../../platform/workspaceRecorder/common/workspaceLog';
import { findNotebook } from '../../../util/common/notebooks';
import { RunOnceScheduler } from '../../../util/vs/base/common/async';
import { Disposable, DisposableStore, IDisposable, RefCountedDisposable } from '../../../util/vs/base/common/lifecycle';
import { Schemas } from '../../../util/vs/base/common/network';
import { autorun, autorunHandleChanges } from '../../../util/vs/base/common/observableInternal';
import { StringEdit, StringReplacement } from '../../../util/vs/editor/common/core/edits/stringEdit';
import { OffsetRange } from '../../../util/vs/editor/common/core/ranges/offsetRange';
import { StringText } from '../../../util/vs/editor/common/core/text/abstractText';
import { Uri } from '../../../vscodeTypes';
import { DebugRecorder } from './debugRecorder';
import { INesConfigs } from './nesConfigs';
import { INextEditDisplayLocation, INextEditResult } from './nextEditResult';

export type NextEditTelemetryStatus = 'new' | 'requested' | `noEdit:${string}` | 'docChanged' | 'emptyEdits' | 'emptyEditsButHasNextCursorPosition' | 'previouslyRejected' | 'previouslyRejectedCache' | 'accepted' | 'notAccepted' | 'rejected';

export type NesAcceptance = 'accepted' | 'notAccepted' | 'rejected';

export type EnhancedTelemetrySendingReasonKind = 'idle' | 'hard_cap' | 'user_jump';

export interface IEnhancedTelemetrySendingReason {
	readonly reason: EnhancedTelemetrySendingReasonKind;
	readonly details: {
		readonly idleTimeoutMs?: number;
		readonly hardCapTimeoutMs?: number;
		readonly from?: { readonly file: string; readonly line: number };
		readonly to?: { readonly file: string; readonly line: number | undefined };
	};
}

export interface IAlternativeAction {
	readonly text: string | undefined; // undefined if the text is too long
	readonly textLength: number;
	readonly selection: ITelemetryRange[];
	readonly edits: ITelemetryEdit[];
	readonly tags: string[];
	readonly recording: ITelemetryRecording | undefined;
}

export interface ITelemetryEdit {
	readonly time: string;
	readonly start: number;
	readonly endExclusive: number;
	readonly newText: string;
}

export interface ITelemetryRange {
	readonly start: number;
	readonly endExclusive: number;
}

export interface ITelemetryRecording {
	readonly entries: LogEntry[] | undefined;
	readonly entriesSize: number;
	readonly requestTime: number;
}

export const enum ReusedRequestKind {
	Speculative = 'speculative',
	Async = 'async',
}

export interface ILlmNESTelemetry extends Partial<IStatelessNextEditTelemetry> { // it's partial because the next edit can be pulled from cache resulting in no stateless provider telemetry
	readonly providerId: string;
	readonly headerRequestId: string | undefined;
	readonly nextEditProviderDuration: number | undefined;
	readonly fetchStartedAfterMs: number | undefined;
	readonly isFromCache: boolean;
	readonly reusedRequest: ReusedRequestKind | undefined;
	readonly subsequentEditOrder: number | undefined;
	readonly activeDocumentOriginalLineCount: number | undefined;
	readonly activeDocumentEditsCount: number | undefined;
	readonly activeDocumentLanguageId: string | undefined;
	readonly activeDocumentRepository: string | undefined;
	readonly hasNextEdit: boolean;
	readonly wasPreviouslyRejected: boolean;
	readonly status: NextEditTelemetryStatus;
	readonly nextEditProviderError: string | undefined;
	readonly nesConfigs: INesConfigs | undefined;
	readonly repositoryUrls: string[] | undefined;
	readonly documentsCount: number | undefined;
	readonly editsCount: number | undefined;
	readonly isNotebook: boolean;
	readonly notebookType: string | undefined;
	readonly alternativeAction: IAlternativeAction | undefined;
}

export interface IDiagnosticsTelemetry {
	readonly diagnosticType: string | undefined;
	readonly diagnosticDroppedReasons: string | undefined;
	readonly diagnosticDistanceToUnknownDiagnostic: number | undefined;
	readonly diagnosticDistanceToAlternativeDiagnostic: number | undefined;
	readonly diagnosticHasAlternativeDiagnosticForSameRange: boolean | undefined;

	// imports
	readonly diagnosticHasExistingSameFileImport: boolean | undefined;
	readonly diagnosticIsLocalImport: boolean | undefined;
	readonly diagnosticAlternativeImportsCount: number | undefined;
}

export interface INextEditProviderTelemetry extends ILlmNESTelemetry, IDiagnosticsTelemetry {
	readonly opportunityId: string;
	readonly requestN: number;
	readonly isShown: boolean;
	readonly acceptance: NesAcceptance;
	readonly disposalReason: string | undefined;
	readonly supersededByOpportunityId: string | undefined;
	readonly status: NextEditTelemetryStatus;
	readonly nextEditProviderError: string | undefined;
	readonly activeDocumentRepository: string | undefined;
	readonly repositoryUrls: string[] | undefined;
	readonly alternativeAction: IAlternativeAction | undefined;
	readonly postProcessingOutcome: string | undefined;
	readonly isNESForAnotherDoc: boolean;
	readonly notebookCellMarkerCount: number;
	readonly notebookCellMarkerIndex: number;
	readonly notebookId: string | undefined;
	readonly notebookCellLines: string | undefined;
	readonly isActiveDocument?: boolean;
	readonly isMultilineEdit?: boolean;
	readonly isEolDifferent?: boolean;
	readonly isNextEditorVisible?: boolean;
	readonly isNextEditorRangeVisible?: boolean;
	readonly isNaturalLanguageDominated: boolean;

	readonly hadLlmNES: boolean;
	readonly hadDiagnosticsNES: boolean;
	readonly pickedNES: 'llm' | 'diagnostics' | undefined;
	readonly configIsDiagnosticsNESEnabled: boolean;

	readonly userTypingDisagreed: boolean | undefined;
}

export class LlmNESTelemetryBuilder extends Disposable {

	public build(includeAlternativeAction: boolean): ILlmNESTelemetry {
		let documentsCount: number | undefined = undefined;
		let editsCount: number | undefined = undefined;
		let activeDocumentEditsCount: number | undefined = undefined;
		let activeDocumentLanguageId: string | undefined = undefined;
		let activeDocumentOriginalLineCount: number | undefined = undefined;
		let isNotebook: boolean = false;
		let notebookType: string | undefined = undefined;
		let activeDocumentRepository: string | undefined = undefined;
		let repositoryUrls: string[] | undefined = undefined;

		if (this._request) {
			const activeDoc = this._request.getActiveDocument();
			documentsCount = this._request.documents.length;
			editsCount = this._request.documents.reduce((acc, doc) => acc + doc.recentEdits.edits.length, 0);
			activeDocumentEditsCount = activeDoc.recentEdits.edits.length;
			activeDocumentLanguageId = activeDoc.languageId;
			activeDocumentOriginalLineCount = activeDoc.documentAfterEditsLines.length;
			isNotebook = activeDoc.id.toUri().scheme === Schemas.vscodeNotebookCell || this._notebookService?.hasSupportedNotebooks(activeDoc.id.toUri()) || false;
			notebookType = this._workspaceService === undefined ? undefined : findNotebook(activeDoc.id.toUri(), this._workspaceService.notebookDocuments)?.notebookType;
			const git = this._gitExtensionService?.getExtensionApi();
			if (git) {
				const activeDocRepository = git.getRepository(Uri.parse(activeDoc.id.uri));
				if (activeDocRepository) {
					const remoteName = activeDocRepository.state.HEAD?.upstream?.remote;
					const remote = activeDocRepository.state.remotes.find(r => r.name === remoteName);
					if (remote?.fetchUrl) {
						activeDocumentRepository = remote.pushUrl || remote.fetchUrl;
					}
				}

				const remoteUrlSet = new Set<string>();
				const repositories = [...new Set(this._request.documents.map(doc => git.getRepository(Uri.parse(doc.id.uri))).filter(Boolean))];
				for (const repository of repositories) {
					const remoteName = repository?.state.HEAD?.upstream?.remote;
					const remote = repository?.state.remotes.find(r => r.name === remoteName);
					if (remote?.fetchUrl) {
						remoteUrlSet.add(remote.fetchUrl);
					}
					if (remote?.pushUrl) {
						remoteUrlSet.add(remote.pushUrl);
					}
				}
				repositoryUrls = [...remoteUrlSet];
			}
		}

		let alternativeAction: IAlternativeAction | undefined;
		if (includeAlternativeAction && this.editCollectingInfo !== undefined) {
			const originalText = this.editCollectingInfo.originalDoc.value;
			let recording: ITelemetryRecording | undefined;
			if (this._debugRecorder && this._requestBookmark) {
				const entries = this._debugRecorder.getRecentLog();
				const entriesSize = JSON.stringify(entries)?.length || 0;
				recording = {
					entries: entriesSize > 200 * 1024 ? undefined : entries,
					entriesSize: entriesSize,
					requestTime: this._requestBookmark.timeMs,
				};
			}
			alternativeAction = {
				text: originalText.length > 200 * 1024 ? undefined : originalText,
				textLength: originalText.length,
				selection: this.editCollectingInfo.originalSelection.map(range => ({
					start: range.start,
					endExclusive: range.endExclusive,
				})),
				edits: this.editCollectingInfo.edits.map(edit => edit.edit.replacements.map(e => ({
					time: edit.time.toISOString(),
					start: e.replaceRange.start,
					endExclusive: e.replaceRange.endExclusive,
					newText: e.newText,
				}))).flat(),
				tags: [],
				recording,
			};
		}

		const fetchStartedAfterMs = this._statelessNextEditTelemetry?.fetchStartedAt === undefined ? undefined : this._statelessNextEditTelemetry.fetchStartedAt - this._startTime;

		return {
			providerId: this._providerId,
			headerRequestId: this._headerRequestId,
			nextEditProviderDuration: this._duration,
			isFromCache: this._isFromCache,
			reusedRequest: this._reusedRequest,
			subsequentEditOrder: this._subsequentEditOrder,
			documentsCount,
			editsCount,
			activeDocumentEditsCount,
			activeDocumentLanguageId,
			activeDocumentOriginalLineCount,
			fetchStartedAfterMs,
			hasNextEdit: this._hasNextEdit,
			wasPreviouslyRejected: this._wasPreviouslyRejected,
			isNotebook,
			notebookType,
			status: this._status,
			nextEditProviderError: this._nextEditProviderError,
			alternativeAction,

			...this._statelessNextEditTelemetry,

			activeDocumentRepository,
			repositoryUrls,

			nesConfigs: this._nesConfigs,
		};
	}

	private _startTime: number;

	/** Dependent on the observable document to track edits and selections */
	private editCollectingInfo: undefined | {
		originalDoc: StringText;
		originalSelection: readonly OffsetRange[];
		originalSelectionLine: number | undefined;
		edits: { time: Date; edit: StringEdit }[];
	};

	public get originalSelectionLine(): number | undefined {
		return this.editCollectingInfo?.originalSelectionLine;
	}

	/**
	 * @param _doc passing an observable document allows to track edits and selections
	 */
	constructor(
		private readonly _gitExtensionService: IGitExtensionService | undefined,
		private readonly _notebookService: INotebookService | undefined,
		private readonly _workspaceService: IWorkspaceService | undefined,
		private readonly _providerId: string,
		private readonly _doc: IObservableDocument | undefined,
		private readonly _debugRecorder?: DebugRecorder,
		private readonly _requestBookmark?: DebugRecorderBookmark,
	) {
		super();
		this._startTime = Date.now();

		if (this._doc) {
			this.editCollectingInfo = {
				originalDoc: this._doc.value.get(),
				originalSelection: this._doc.selection.get(),
				originalSelectionLine: this._doc.primarySelectionLine.get(),
				edits: [],
			};

			this._store.add(autorunWithChanges(this, {
				value: this._doc.value,
			}, (data) => {
				const time = new Date();
				data.value.changes.forEach(change => {
					this.editCollectingInfo?.edits.push({
						time,
						edit: change,
					});
				});
			}));
		}
	}

	private _nesConfigs: INesConfigs | undefined;
	public setNESConfigs(nesConfigs: INesConfigs): this {
		this._nesConfigs = nesConfigs;
		return this;
	}

	private _headerRequestId: string | undefined;
	public setHeaderRequestId(uuid: string): this {
		this._headerRequestId = uuid;
		return this;
	}

	private _isFromCache: boolean = false;
	public setIsFromCache(): this {
		this._isFromCache = true;
		return this;
	}

	private _reusedRequest: ReusedRequestKind | undefined;
	public setReusedRequest(kind: ReusedRequestKind): this {
		this._reusedRequest = kind;
		return this;
	}

	private _subsequentEditOrder: number | undefined;
	public setSubsequentEditOrder(subsequentEditOrder: number | undefined): this {
		this._subsequentEditOrder = subsequentEditOrder;
		return this;
	}

	private _request: StatelessNextEditRequest | undefined;
	public setRequest(request: StatelessNextEditRequest): this {
		this._request = request;
		return this;
	}

	private _statelessNextEditTelemetry: IStatelessNextEditTelemetry | undefined;
	public setStatelessNextEditTelemetry(statelessNextEditTelemetry: IStatelessNextEditTelemetry): this {
		this._statelessNextEditTelemetry = statelessNextEditTelemetry;
		return this;
	}

	private _hasNextEdit: boolean = false;
	public setHasNextEdit(hasNextEdit: boolean): this {
		this._hasNextEdit = hasNextEdit;
		return this;
	}

	private _wasPreviouslyRejected: boolean = false;
	public setWasPreviouslyRejected(): this {
		this._wasPreviouslyRejected = true;
		return this;
	}

	private _duration: number | undefined;
	public markEndTime(): this {
		this._duration = Date.now() - this._startTime;
		return this;
	}

	private _status: NextEditTelemetryStatus = 'new';
	public setStatus(status: NextEditTelemetryStatus): this {
		this._status = status;
		return this;
	}

	private _nextEditProviderError: string | undefined;
	public setNextEditProviderError(nextEditProviderError: string | undefined): this {
		this._nextEditProviderError = nextEditProviderError;
		return this;
	}
}

interface IDiagnosticTelemetryRun {
	alternativeImportsCount?: number;
	hasExistingSameFileImport?: boolean;
	isLocalImport?: boolean;
	distanceToUnknownDiagnostic?: number;
	distanceToAlternativeDiagnostic?: number;
	hasAlternativeDiagnosticForSameRange?: boolean;
}

export class DiagnosticsTelemetryBuilder {

	public build(): IDiagnosticsTelemetry {
		const diagnosticDroppedReasons = this._droppedReasons.length > 0 ? JSON.stringify(this._droppedReasons) : undefined;
		return {
			diagnosticType: this._type,
			diagnosticDroppedReasons,
			diagnosticAlternativeImportsCount: this._diagnosticRunTelemetry?.alternativeImportsCount,
			diagnosticHasExistingSameFileImport: this._diagnosticRunTelemetry?.hasExistingSameFileImport,
			diagnosticIsLocalImport: this._diagnosticRunTelemetry?.isLocalImport,
			diagnosticDistanceToUnknownDiagnostic: this._diagnosticRunTelemetry?.distanceToUnknownDiagnostic,
			diagnosticDistanceToAlternativeDiagnostic: this._diagnosticRunTelemetry?.distanceToAlternativeDiagnostic,
			diagnosticHasAlternativeDiagnosticForSameRange: this._diagnosticRunTelemetry?.hasAlternativeDiagnosticForSameRange
		};
	}

	public populate(telemetry: DiagnosticsTelemetryBuilder) {
		this._droppedReasons.forEach(reason => telemetry.addDroppedReason(reason));
		if (this._type) {
			telemetry.setType(this._type);
		}
		if (this._diagnosticRunTelemetry) {
			telemetry.setDiagnosticRunTelemetry(this._diagnosticRunTelemetry);
		}
	}

	private _type: string | undefined;
	setType(type: string): this {
		this._type = type;
		return this;
	}

	private _droppedReasons: string[] = [];
	addDroppedReason(reason: string): this {
		this._droppedReasons.push(reason);
		return this;
	}

	private _diagnosticRunTelemetry: IDiagnosticTelemetryRun | undefined;
	setDiagnosticRunTelemetry(diagnosticRun: IDiagnosticTelemetryRun): this {
		this._diagnosticRunTelemetry = diagnosticRun;
		return this;
	}
}

export class NextEditProviderTelemetryBuilder extends Disposable {

	private static providerIdToReqN = new Map<string /* providerId */, number>();

	/**
	 * Whether telemetry for this builder has been sent -- only for ordinary telemetry, not enhanced telemetry
	 */
	private _isSent: boolean = false;
	public get isSent(): boolean {
		return this._isSent;
	}
	public markAsSent(): void {
		this._isSent = true;
	}

	public build(includeAlternativeAction: boolean): INextEditProviderTelemetry {

		const nesTelemetry = this._nesBuilder.build(includeAlternativeAction);
		const diagnosticsTelemetry = this._diagnosticsBuilder.build();

		return {
			...nesTelemetry,
			...diagnosticsTelemetry,

			opportunityId: this._opportunityId || '',
			requestN: this._requestN,
			isShown: this._isShown,
			acceptance: this._acceptance,
			disposalReason: this._disposalReason,
			supersededByOpportunityId: this._supersededByOpportunityId,
			pickedNES: this._nesTypePicked,
			hadLlmNES: this._hadLlmNES,
			isMultilineEdit: this._isMultilineEdit,
			isEolDifferent: this._isEolDifferent,
			isActiveDocument: this._isActiveDocument,
			isNextEditorVisible: this._isNextEditorVisible,
			isNextEditorRangeVisible: this._isNextEditorRangeVisible,
			isNESForAnotherDoc: this._isNESForAnotherDoc,
			notebookId: this._notebookId,
			notebookCellLines: this._notebookCellLines,
			notebookCellMarkerCount: this._notebookCellMarkerCount,
			notebookCellMarkerIndex: this._notebookCellMarkerIndex,
			hadDiagnosticsNES: this._hadDiagnosticsNES,
			configIsDiagnosticsNESEnabled: this._configIsDiagnosticsNESEnabled,
			isNaturalLanguageDominated: this._isNaturalLanguageDominated,
			postProcessingOutcome: this._postProcessingOutcome,
			userTypingDisagreed: this._userTypingDisagreed,
		};
	}

	private _requestN: number;

	private readonly _nesBuilder: LlmNESTelemetryBuilder;
	public get nesBuilder(): LlmNESTelemetryBuilder {
		return this._nesBuilder;
	}
	private readonly _diagnosticsBuilder: DiagnosticsTelemetryBuilder;
	public get diagnosticsBuilder(): DiagnosticsTelemetryBuilder {
		return this._diagnosticsBuilder;
	}

	/**
	 * @param _doc passing an observable document allows to track edits and selections
	 */
	constructor(
		gitExtensionService: IGitExtensionService | undefined,
		notebookService: INotebookService | undefined,
		workspaceService: IWorkspaceService | undefined,
		providerId: string,
		public readonly doc: IObservableDocument | undefined,
		debugRecorder?: DebugRecorder,
		requestBookmark?: DebugRecorderBookmark,
	) {
		super();

		let requestN = NextEditProviderTelemetryBuilder.providerIdToReqN.get(providerId) || 0;
		this._requestN = ++requestN;
		NextEditProviderTelemetryBuilder.providerIdToReqN.set(providerId, requestN);

		this._nesBuilder = this._register(new LlmNESTelemetryBuilder(gitExtensionService, notebookService, workspaceService, providerId, doc, debugRecorder, requestBookmark));
		this._diagnosticsBuilder = new DiagnosticsTelemetryBuilder();
	}

	private _opportunityId: string | undefined;
	public setOpportunityId(uuid: string): this {
		this._opportunityId = uuid;
		return this;
	}

	private _isShown: boolean = false;
	public setAsShown(): this {
		this._isShown = true;
		return this;
	}

	private _acceptance: NesAcceptance = 'notAccepted';
	public setAcceptance(acceptance: NesAcceptance): this {
		this._acceptance = acceptance;
		return this;
	}

	private _disposalReason: string | undefined = undefined;
	public setDisposalReason(disposalReason: string | undefined): this {
		this._disposalReason = disposalReason;
		return this;
	}

	private _supersededByOpportunityId: string | undefined = undefined;
	public setSupersededBy(opportunityId: string | undefined): this {
		this._supersededByOpportunityId = opportunityId;
		return this;
	}

	private _userTypingDisagreed: boolean | undefined = undefined;
	public setUserTypingDisagreed(userTypingDisagreed: boolean): this {
		this._userTypingDisagreed = userTypingDisagreed;
		return this;
	}

	private _nesTypePicked: 'llm' | 'diagnostics' | undefined;
	public setPickedNESType(nesTypePicked: 'llm' | 'diagnostics'): this {
		this._nesTypePicked = nesTypePicked;
		return this;
	}

	private _isActiveDocument?: boolean;
	public setIsActiveDocument(isActive: boolean): this {
		this._isActiveDocument = isActive;
		return this;
	}

	private _notebookCellMarkerCount: number = 0;
	public setNotebookCellMarkerCount(count: number): this {
		this._notebookCellMarkerCount = count;
		return this;
	}

	private _isMultilineEdit?: boolean;
	public setIsMultilineEdit(isMultiLine: boolean): this {
		this._isMultilineEdit = isMultiLine;
		return this;
	}

	private _isEolDifferent?: boolean;
	public setIsEolDifferent(isEolDifferent: boolean): this {
		this._isEolDifferent = isEolDifferent;
		return this;
	}

	private _isNextEditorVisible?: boolean;
	public setIsNextEditorVisible(isVisible: boolean): this {
		this._isNextEditorVisible = isVisible;
		return this;
	}

	private _isNextEditorRangeVisible?: boolean;
	public setIsNextEditorRangeVisible(isVisible: boolean): this {
		this._isNextEditorRangeVisible = isVisible;
		return this;
	}

	private _notebookId?: string;
	public setNotebookId(notebookId: string): this {
		this._notebookId = notebookId;
		return this;
	}

	private _notebookCellLines?: string;
	public setNotebookCellLines(notebookCellLines: string): this {
		this._notebookCellLines = notebookCellLines;
		return this;
	}

	private _notebookCellMarkerIndex: number = -1;
	public setNotebookCellMarkerIndex(index: number): this {
		this._notebookCellMarkerIndex = index;
		return this;
	}

	private _isNESForAnotherDoc: boolean = false;
	public setIsNESForOtherEditor(isForAnotherDoc: boolean): this {
		this._isNESForAnotherDoc = isForAnotherDoc;
		return this;
	}

	private _hadLlmNES: boolean = false;
	public setHadLlmNES(boolean: boolean): this {
		this._hadLlmNES = boolean;
		return this;
	}

	private _hadDiagnosticsNES: boolean = false;
	public setHadDiagnosticsNES(boolean: boolean): this {
		this._hadDiagnosticsNES = boolean;
		return this;
	}

	public setStatus(status: NextEditTelemetryStatus): this {
		this._nesBuilder.setStatus(status);
		return this;
	}

	private _configIsDiagnosticsNESEnabled: boolean = false;
	public setConfigIsDiagnosticsNESEnabled(boolean: boolean): this {
		this._configIsDiagnosticsNESEnabled = boolean;
		return this;
	}

	private _isNaturalLanguageDominated: boolean = false;
	public setIsNaturalLanguageDominated(isNaturalLanguageDominated: boolean): this {
		this._isNaturalLanguageDominated = isNaturalLanguageDominated;
		return this;
	}

	private _postProcessingOutcome: string | undefined;
	public setPostProcessingOutcome(suggestion: {
		edit: StringReplacement;
		isInlineCompletion: boolean;
		displayLocation?: INextEditDisplayLocation;
	}): this {
		const displayLocation = suggestion.displayLocation ? {
			label: suggestion.displayLocation.label,
			range: suggestion.displayLocation.range.toString()
		} : undefined;

		this._postProcessingOutcome = JSON.stringify({
			suggestedEdit: suggestion.edit.toString(),
			isInlineCompletion: suggestion.isInlineCompletion,
			displayLocation
		});

		return this;
	}
}

/**
 * Watches all documents in the {@link ObservableWorkspace} for idle periods and cursor jumps.
 *
 * Only documents tracked by the workspace are monitored. Documents in languages where
 * Copilot completions are disabled (e.g. markdown, plaintext), non-file URI schemes,
 * and copilot-ignored files are excluded. This matches the scope of {@link DebugRecorder}.
 *
 * Fires `onIdle` after 5 seconds of no document edits across the workspace,
 * and `onUserJump` when the user moves their cursor to a different line or file
 * (ignoring selection changes within 200ms of an edit, which are likely side-effects of typing).
 *
 * Ref-counted via {@link RefCountedDisposable}: call {@link acquire} when a telemetry entry
 * starts using this detector, {@link release} when it's done. Auto-disposes when all
 * references are released. Use {@link forceDispose} on owner shutdown.
 */
class IdleDetector {
	private readonly _store = new DisposableStore();
	private readonly _disposalTracker = new RefCountedDisposable(this._store);

	/** Snapshot of each document's primarySelectionLine to detect which doc's cursor actually moved. */
	private readonly _selectionSnapshots = new Map<string, number | undefined>();

	/** Timestamp of the last document edit, used to suppress selection changes caused by typing. */
	private _lastEditTime = 0;

	get isDisposed(): boolean { return this._store.isDisposed; }

	constructor(
		workspace: ObservableWorkspace,
		private readonly _onIdle: (idleTimeoutMs: number) => void,
		private readonly _onUserJump: (toDocId: string, toLine: number | undefined) => void,
	) {
		const idleTimeMs = 5_000;

		// Idle timer: resets each time any tracked document changes, fires after 5s of inactivity
		const idleScheduler = this._store.add(new RunOnceScheduler(() => {
			this._onIdle(idleTimeMs);
		}, idleTimeMs));
		this._idleScheduler = idleScheduler;

		// Watch for document content changes across the workspace.
		// Skip scheduling on the first (initialization) run — the idle timer is started
		// explicitly via scheduleIdleTimer() when the first entry acquires the detector.
		let isFirstDocRun = true;
		this._store.add(autorun(reader => {
			workspace.onDidOpenDocumentChange.read(reader);
			if (isFirstDocRun) {
				isFirstDocRun = false;
				return;
			}
			this._lastEditTime = Date.now();
			idleScheduler.schedule();
		}));

		// Watch for selection (cursor) changes across all documents to detect user jumps.
		// Uses autorunHandleChanges to get the `removed` list from openDocuments change data
		// so we can clean up stale selection snapshots when documents are closed.
		let isFirstSelectionRun = true;
		this._store.add(autorunHandleChanges({
			owner: this,
			changeTracker: {
				createChangeSummary: () => ({ removed: [] as readonly IObservableDocument[] }),
				handleChange: (ctx, summary) => {
					if (ctx.didChange(workspace.openDocuments)) {
						summary.removed = ctx.change.removed;
					}
					return true;
				}
			}
		}, (reader, changeSummary) => {
			if (this._store.isDisposed) { return; }

			// Subscribe to all document primarySelectionLine observables to detect line changes
			const docs = workspace.openDocuments.read(reader);
			for (const doc of docs) {
				doc.primarySelectionLine.read(reader);
			}

			// On the first run, snapshot all current selection lines as baseline
			if (isFirstSelectionRun) {
				isFirstSelectionRun = false;
				for (const doc of docs) {
					this._selectionSnapshots.set(doc.id.uri, doc.primarySelectionLine.get());
				}
				return;
			}

			// Clean up snapshots for closed documents
			for (const removed of changeSummary.removed) {
				this._selectionSnapshots.delete(removed.id.uri);
			}

			// If a document was edited very recently (within 200ms), this selection change
			// is likely a side-effect of the edit (e.g. cursor moves when typing) — not a deliberate jump
			if (Date.now() - this._lastEditTime < 200) { return; }

			// Find the doc whose selection line actually changed from what we last saw
			for (const doc of docs) {
				const currentDocId = doc.id.uri;
				const currentLine = doc.primarySelectionLine.get();
				const previousLine = this._selectionSnapshots.get(currentDocId);

				if (previousLine === currentLine) { continue; }

				this._selectionSnapshots.set(currentDocId, currentLine);
				this._onUserJump(currentDocId, currentLine);
				return;
			}
		}));
	}

	private _idleScheduler: RunOnceScheduler | undefined;

	/** Start the idle timer. Called when an entry first acquires this detector. */
	scheduleIdleTimer(): void { this._idleScheduler?.schedule(); }

	acquire(): void { this._disposalTracker.acquire(); }
	release(): void { this._disposalTracker.release(); }
	forceDispose(): void { this._store.dispose(); }
}

export class TelemetrySender implements IDisposable {

	private readonly _map = new Map<INextEditResult, { builder: NextEditProviderTelemetryBuilder; timeout: TimeoutHandle; hardCapTimeout?: TimeoutHandle }>();
	private _idleDetector: IdleDetector | undefined;

	constructor(
		private readonly _workspace: ObservableWorkspace | undefined,
		@ITelemetryService private readonly _telemetryService: ITelemetryService,
	) {
	}

	/**
	 * Schedule sending enhanced telemetry for a NES suggestion.
	 *
	 * After a 2-minute initial delay, enters an idle-detection phase that monitors all workspace documents
	 * and finally sends the telemetry event when one of these conditions is met:
	 *
	 * - **idle** (5s): No document edits across the entire workspace for 5 seconds.
	 * - **user_jump**: User moves cursor to a different line or different file (detected via
	 *   {@link IObservableDocument.primarySelectionLine} snapshot diffs.
	 * - **hard_cap** (30s): Forced send after 30 seconds regardless of activity.
	 *
	 * Note: only documents tracked by the {@link ObservableWorkspace} are monitored. Documents in
	 * languages where Copilot completions are disabled (e.g. markdown) and copilot-ignored files are excluded,
	 * so activity in those files won't reset the idle timer. This matches the scope of {@link DebugRecorder}.
	 */
	public scheduleSendingEnhancedTelemetry(nextEditResult: INextEditResult, builder: NextEditProviderTelemetryBuilder): void {
		const existing = this._map.get(nextEditResult);
		if (existing) {
			if (existing.builder !== builder) {
				existing.builder.dispose();
			}
			this._removeEntry(nextEditResult, existing);
		}

		const timeout = setTimeout(() => {
			this._enterIdleDetection(nextEditResult, builder);
		}, /* 2 minutes */ 2 * 60 * 1000);
		this._map.set(nextEditResult, { builder, timeout });
	}

	private _enterIdleDetection(nextEditResult: INextEditResult, builder: NextEditProviderTelemetryBuilder): void {
		const workspace = this._workspace;
		if (!workspace) {
			this._buildAndSendEnhancedTelemetry(nextEditResult, builder, { reason: 'idle', details: { idleTimeoutMs: 0 } });
			return;
		}

		if (!this._idleDetector) {
			this._idleDetector = new IdleDetector(
				workspace,
				idleTimeoutMs => this._sendAllPendingInIdlePhase({ reason: 'idle', details: { idleTimeoutMs } }),
				(toDocId, toLine) => this._sendAllPendingInIdlePhaseWithJump(toDocId, toLine),
			);
			// RefCountedDisposable starts at count=1, which covers this first entry.
			// Only subsequent entries need acquire().
		} else {
			this._idleDetector.acquire();
		}
		// Start/restart the idle timer so this entry gets a fresh 5s window
		this._idleDetector.scheduleIdleTimer();

		const hardCapMs = 30_000;
		const hardCapTimeout = setTimeout(() => {
			this._sendForEntry(nextEditResult, { reason: 'hard_cap', details: { hardCapTimeoutMs: hardCapMs } });
		}, hardCapMs);

		const entry = this._map.get(nextEditResult);
		if (entry) {
			entry.hardCapTimeout = hardCapTimeout;
		}
	}

	private _releaseIdleDetector(): void {
		this._idleDetector?.release();
		if (this._idleDetector?.isDisposed) {
			this._idleDetector = undefined;
		}
	}

	/** Send all entries that are in the idle-detection phase (have no initial timeout pending) with a shared reason. */
	private _sendAllPendingInIdlePhase(reason: IEnhancedTelemetrySendingReason): void {
		const entriesToSend: INextEditResult[] = [];
		for (const [result, data] of this._map) {
			if (data.hardCapTimeout !== undefined) {
				entriesToSend.push(result);
			}
		}
		for (const result of entriesToSend) {
			this._sendForEntry(result, reason);
		}
	}

	/** Send all entries in idle-detection phase with user_jump, using per-entry `from` positions. */
	private _sendAllPendingInIdlePhaseWithJump(toDocId: string, toLine: number | undefined): void {
		const entriesToSend: [INextEditResult, NextEditProviderTelemetryBuilder][] = [];
		for (const [result, data] of this._map) {
			if (data.hardCapTimeout !== undefined) {
				entriesToSend.push([result, data.builder]);
			}
		}
		for (const [result, builder] of entriesToSend) {
			const nesDocId: string | undefined = builder.doc?.id.uri;
			const nesDocLine: number | undefined = builder.nesBuilder.originalSelectionLine;
			const from = nesDocId !== undefined && nesDocLine !== undefined
				? { file: nesDocId, line: nesDocLine }
				: undefined;
			this._sendForEntry(result, {
				reason: 'user_jump',
				details: {
					from,
					to: { file: toDocId, line: toLine },
				},
			});
		}
	}

	/** Send enhanced telemetry for a single entry that's in the idle-detection phase. */
	private _sendForEntry(nextEditResult: INextEditResult, reason: IEnhancedTelemetrySendingReason): void {
		const data = this._map.get(nextEditResult);
		if (!data) { return; }

		if (data.hardCapTimeout !== undefined) {
			clearTimeout(data.hardCapTimeout);
			this._releaseIdleDetector();
		}
		this._map.delete(nextEditResult);

		let telemetry: INextEditProviderTelemetry;
		try {
			telemetry = data.builder.build(true);
		} finally {
			data.builder.dispose();
		}
		this._doSendEnhancedTelemetry(telemetry, reason);
	}

	private _removeEntry(nextEditResult: INextEditResult, data: { builder: NextEditProviderTelemetryBuilder; timeout: TimeoutHandle; hardCapTimeout?: TimeoutHandle }): void {
		clearTimeout(data.timeout);
		if (data.hardCapTimeout !== undefined) {
			clearTimeout(data.hardCapTimeout);
			this._releaseIdleDetector();
		}
		this._map.delete(nextEditResult);
	}

	private _buildAndSendEnhancedTelemetry(nextEditResult: INextEditResult, builder: NextEditProviderTelemetryBuilder, sendingReason: IEnhancedTelemetrySendingReason): void {
		let telemetry: INextEditProviderTelemetry;
		this._map.delete(nextEditResult);
		try {
			telemetry = builder.build(true);
		} finally {
			builder.dispose();
		}
		this._doSendEnhancedTelemetry(telemetry, sendingReason);
	}

	/**
	 * Send telemetry for the next edit result in case it has already been rejected or contains no edits to be shown.
	 */
	public sendTelemetry(nextEditResult: INextEditResult | undefined, builder: NextEditProviderTelemetryBuilder): void {
		if (nextEditResult) {
			const data = this._map.get(nextEditResult);
			if (data) {
				this._removeEntry(nextEditResult, data);
			}
		}
		const telemetry = builder.build(true);
		if (!builder.isSent) {
			this._doSendTelemetry(telemetry);
			builder.markAsSent();
		}
		this._doSendEnhancedTelemetry(telemetry, undefined);
	}

	public sendTelemetryForBuilder(builder: NextEditProviderTelemetryBuilder): void {
		if (builder.isSent) {
			return;
		}
		const telemetry = builder.build(false); // disposal is done by enhanced telemetry sending in a setTimeout callback
		this._doSendTelemetry(telemetry);
		builder.markAsSent();
	}

	private async _doSendTelemetry(telemetry: INextEditProviderTelemetry): Promise<void> {
		const {
			opportunityId,
			headerRequestId,
			requestN,
			providerId,
			modelName,
			hadStatelessNextEditProviderCall,
			statelessNextEditProviderDuration,
			nextEditProviderDuration,
			isFromCache,
			reusedRequest,
			subsequentEditOrder,
			activeDocumentLanguageId,
			activeDocumentOriginalLineCount,
			nLinesOfCurrentFileInPrompt,
			wasPreviouslyRejected,
			isShown,
			isNotebook,
			notebookType,
			isNESForAnotherDoc,
			isActiveDocument,
			isEolDifferent,
			isMultilineEdit,
			isNextEditorRangeVisible,
			isNextEditorVisible,
			acceptance,
			disposalReason,
			logProbThreshold,
			documentsCount,
			editsCount,
			activeDocumentEditsCount,
			promptLineCount,
			promptCharCount,
			hadLowLogProbSuggestion,
			nEditsSuggested,
			lineDistanceToMostRecentEdit,
			isCursorAtEndOfLine,
			isInlineSuggestion,
			debounceTime,
			artificialDelay,
			hasNextEdit,
			notebookCellMarkerCount,
			notebookCellMarkerIndex,
			notebookId,
			notebookCellLines,
			nextEditLogprob,
			supersededByOpportunityId,
			noNextEditReasonKind,
			noNextEditReasonMessage,
			fetchStartedAfterMs,
			response: responseWithStats,
			configIsDiagnosticsNESEnabled,
			isNaturalLanguageDominated,
			diagnosticType,
			diagnosticDroppedReasons,
			diagnosticHasExistingSameFileImport,
			diagnosticIsLocalImport,
			diagnosticAlternativeImportsCount,
			diagnosticDistanceToUnknownDiagnostic,
			diagnosticDistanceToAlternativeDiagnostic,
			diagnosticHasAlternativeDiagnosticForSameRange,
			hadDiagnosticsNES,
			hadLlmNES,
			pickedNES,
			xtabAggressivenessLevel,
			xtabUserHappinessScore,
			userAggressivenessSetting,
			modelConfig,
		} = telemetry;

		let usage: APIUsage | undefined;
		let ttft_: number | undefined;
		let fetchResult_: ChatFetchResponseType | undefined;
		let fetchTime_: number | undefined;
		if (responseWithStats !== undefined) {
			const { response, ttft, fetchResult, fetchTime } = await responseWithStats;
			if (response.type === ChatFetchResponseType.Success) {
				usage = response.usage;
			}
			ttft_ = ttft;
			fetchResult_ = fetchResult;
			fetchTime_ = fetchTime;
		}

		/* __GDPR__
			"provideInlineEdit" : {
				"owner": "ulugbekna",
				"comment": "Telemetry for inline edit (NES) provided",
				"opportunityId": { "classification": "SystemMetaData", "purpose": "FeatureInsight", "comment": "Unique identifier for an opportunity to show an NES." },
				"headerRequestId": { "classification": "SystemMetaData", "purpose": "FeatureInsight", "comment": "Unique identifier of the network request which is also included in the fetch request header." },
				"providerId": { "classification": "SystemMetaData", "purpose": "FeatureInsight", "comment": "NES provider identifier (StatelessNextEditProvider)" },
				"modelName": { "classification": "SystemMetaData", "purpose": "FeatureInsight", "comment": "Name of the model used to provide the NES" },
				"activeDocumentLanguageId": { "classification": "SystemMetaData", "purpose": "FeatureInsight", "comment": "LanguageId of the active document" },
				"mergeConflictExpanded": { "classification": "SystemMetaData", "purpose": "FeatureInsight", "comment": "If and how edit window expanded to include merge conflict lines ('normal' or 'only' or undefined if not expanded)" },
				"acceptance": { "classification": "SystemMetaData", "purpose": "FeatureInsight", "comment": "User acceptance of the edit" },
				"disposalReason": { "classification": "SystemMetaData", "purpose": "FeatureInsight", "comment": "Reason for disposal of NES" },
				"supersededByOpportunityId": { "classification": "SystemMetaData", "purpose": "FeatureInsight", "comment": "UUID of the opportunity that superseded this edit" },
				"endpoint": { "classification": "SystemMetaData", "purpose": "FeatureInsight", "comment": "Endpoint for the request" },
				"noNextEditReasonKind": { "classification": "SystemMetaData", "purpose": "FeatureInsight", "comment": "Reason kind for no next edit" },
				"noNextEditReasonMessage": { "classification": "SystemMetaData", "purpose": "FeatureInsight", "comment": "Reason message for no next edit" },
				"fetchResult": { "classification": "SystemMetaData", "purpose": "FeatureInsight", "comment": "Fetch result" },
				"fetchError": { "classification": "SystemMetaData", "purpose": "FeatureInsight", "comment": "Fetch error message" },
				"pickedNES": { "classification": "SystemMetaData", "purpose": "FeatureInsight", "comment": "Whether the request had picked NES" },
				"nextEditProviderError": { "classification": "SystemMetaData", "purpose": "FeatureInsight", "comment": "Error message from next edit provider" },
				"diagnosticType": { "classification": "SystemMetaData", "purpose": "FeatureInsight", "comment": "Type of diagnostics" },
				"diagnosticDroppedReasons": { "classification": "SystemMetaData", "purpose": "FeatureInsight", "comment": "Reasons for dropping diagnostics NES suggestions" },
				"requestN": { "classification": "SystemMetaData", "purpose": "FeatureInsight", "comment": "Request number", "isMeasurement": true },
				"hadStatelessNextEditProviderCall": { "classification": "SystemMetaData", "purpose": "FeatureInsight", "comment": "Whether the request had a stateless next edit provider call", "isMeasurement": true },
				"statelessNextEditProviderDuration": { "classification": "SystemMetaData", "purpose": "FeatureInsight", "comment": "Duration of stateless next edit provider", "isMeasurement": true },
				"nextEditProviderDuration": { "classification": "SystemMetaData", "purpose": "FeatureInsight", "comment": "Duration of next edit provider", "isMeasurement": true },
				"isFromCache": { "classification": "SystemMetaData", "purpose": "FeatureInsight", "comment": "Whether the edit was provided from cache", "isMeasurement": true },
				"reusedRequest": { "classification": "SystemMetaData", "purpose": "FeatureInsight", "comment": "Whether the result was obtained by joining a pending request ('speculative' or 'async'), undefined for fresh requests and cache hits" },
				"subsequentEditOrder": { "classification": "SystemMetaData", "purpose": "FeatureInsight", "comment": "Order of the subsequent edit", "isMeasurement": true },
				"activeDocumentOriginalLineCount": { "classification": "SystemMetaData", "purpose": "FeatureInsight", "comment": "Number of lines in the active document before shortening", "isMeasurement": true },
				"activeDocumentNLinesInPrompt": { "classification": "SystemMetaData", "purpose": "FeatureInsight", "comment": "Number of lines in the active document included in prompt", "isMeasurement": true },
				"wasPreviouslyRejected": { "classification": "SystemMetaData", "purpose": "FeatureInsight", "comment": "Whether the edit was previously rejected", "isMeasurement": true },
				"isShown": { "classification": "SystemMetaData", "purpose": "FeatureInsight", "comment": "Whether the edit was shown", "isMeasurement": true },
				"isNotebook": { "classification": "SystemMetaData", "purpose": "FeatureInsight", "comment": "Whether the document is a notebook", "isMeasurement": true },
				"isNESForAnotherDoc": { "classification": "SystemMetaData", "purpose": "FeatureInsight", "comment": "Whether the NES if for another document", "isMeasurement": true },
				"isMultilineEdit": { "classification": "SystemMetaData", "purpose": "FeatureInsight", "comment": "Whether the NES is for a multiline edit", "isMeasurement": true },
				"isEolDifferent": { "classification": "SystemMetaData", "purpose": "FeatureInsight", "comment": "Whether the NES edit and original text have different end of lines", "isMeasurement": true },
				"isNextEditorVisible": { "classification": "SystemMetaData", "purpose": "FeatureInsight", "comment": "Whether the next editor is visible", "isMeasurement": true },
				"isNextEditorRangeVisible": { "classification": "SystemMetaData", "purpose": "FeatureInsight", "comment": "Whether the next editor range is visible", "isMeasurement": true },
				"notebookCellMarkerIndex": { "classification": "SystemMetaData", "purpose": "FeatureInsight", "comment": "Index of the notebook cell marker in the edit", "isMeasurement": true },
				"isActiveDocument": { "classification": "SystemMetaData", "purpose": "FeatureInsight", "comment": "Whether the document is the active document", "isMeasurement": true },
				"hasNotebookCellMarker": { "classification": "SystemMetaData", "purpose": "FeatureInsight", "comment": "Whether the edit has a notebook cell marker", "isMeasurement": true },
				"notebookCellMarkerCount": { "classification": "SystemMetaData", "purpose": "FeatureInsight", "comment": "Count of notebook cell markers in the edit", "isMeasurement": true },
				"notebookId": { "classification": "SystemMetaData", "purpose": "FeatureInsight", "comment": "Id of notebook" },
				"notebookCellLines": { "classification": "SystemMetaData", "purpose": "FeatureInsight", "comment": "Line counts of notebook cells" },
				"notebookType": { "classification": "SystemMetaData", "purpose": "FeatureInsight", "comment": "Type of notebook, if any" },
				"logProbThreshold": { "classification": "SystemMetaData", "purpose": "FeatureInsight", "comment": "Log probability threshold for the edit", "isMeasurement": true },
				"documentsCount": { "classification": "SystemMetaData", "purpose": "FeatureInsight", "comment": "Number of documents", "isMeasurement": true },
				"editsCount": { "classification": "SystemMetaData", "purpose": "FeatureInsight", "comment": "Number of edits", "isMeasurement": true },
				"activeDocumentEditsCount": { "classification": "SystemMetaData", "purpose": "FeatureInsight", "comment": "Number of edits in the active document", "isMeasurement": true },
				"promptLineCount": { "classification": "SystemMetaData", "purpose": "FeatureInsight", "comment": "Number of lines in the prompt", "isMeasurement": true },
				"promptCharCount": { "classification": "SystemMetaData", "purpose": "FeatureInsight", "comment": "Number of characters in the prompt", "isMeasurement": true },
				"nDiffsInPrompt": { "classification": "SystemMetaData", "purpose": "FeatureInsight", "comment": "Number of diffs included in the prompt", "isMeasurement": true },
				"diffTokensInPrompt": { "classification": "SystemMetaData", "purpose": "FeatureInsight", "comment": "Number of tokens consumed by diffs in the prompt", "isMeasurement": true },
				"nNeighborSnippetsComputed": { "classification": "SystemMetaData", "purpose": "FeatureInsight", "comment": "Total number of neighbor (similar files) snippets computed before budget filtering", "isMeasurement": true },
				"nNeighborSnippetsInPrompt": { "classification": "SystemMetaData", "purpose": "FeatureInsight", "comment": "Number of neighbor (similar files) snippets actually included in the prompt", "isMeasurement": true },
				"neighborSnippetIndicesInPrompt": { "classification": "SystemMetaData", "purpose": "FeatureInsight", "comment": "JSON-encoded array of original input indices (ascending) of neighbor snippets included in the prompt" },
				"hadLowLogProbSuggestion": { "classification": "SystemMetaData", "purpose": "FeatureInsight", "comment": "Whether the suggestion had low log probability", "isMeasurement": true },
				"nEditsSuggested": { "classification": "SystemMetaData", "purpose": "FeatureInsight", "comment": "Number of edits suggested", "isMeasurement": true },
				"hasNextEdit": { "classification": "SystemMetaData", "purpose": "FeatureInsight", "comment": "Whether next edit provider returned an edit (if an edit was previously rejected, this field is false)", "isMeasurement": true },
				"nextEditLogprob": { "classification": "SystemMetaData", "purpose": "FeatureInsight", "comment": "Log probability of the next edit", "isMeasurement": true },
				"lineDistanceToMostRecentEdit": { "classification": "SystemMetaData", "purpose": "FeatureInsight", "comment": "Line distance to most recent edit", "isMeasurement": true },
				"isCursorAtEndOfLine": { "classification": "SystemMetaData", "purpose": "FeatureInsight", "comment": "Whether the cursor is at the end of the line", "isMeasurement": true },
				"isInlineSuggestion": { "classification": "SystemMetaData", "purpose": "FeatureInsight", "comment": "Whether the cursor is at a valid inline suggestion position (middle of line with valid trailing characters)", "isMeasurement": true },
				"debounceTime": { "classification": "SystemMetaData", "purpose": "FeatureInsight", "comment": "Debounce time", "isMeasurement": true },
				"artificialDelay": { "classification": "SystemMetaData", "purpose": "FeatureInsight", "comment": "Artificial delay (aka backoff) on the response based on previous user acceptance/rejection in milliseconds", "isMeasurement": true },
				"fetchStartedAfterMs": { "classification": "SystemMetaData", "purpose": "FeatureInsight", "comment": "Time from inline edit provider invocation to fetch init", "isMeasurement": true },
				"ttft": { "classification": "SystemMetaData", "purpose": "FeatureInsight", "comment": "Time to first token", "isMeasurement": true },
				"fetchTime": { "classification": "SystemMetaData", "purpose": "FeatureInsight", "comment": "Time from fetch init to end of stream", "isMeasurement": true },
				"promptTokens": { "classification": "SystemMetaData", "purpose": "FeatureInsight", "comment": "Number of tokens in the prompt", "isMeasurement": true },
				"responseTokens": { "classification": "SystemMetaData", "purpose": "FeatureInsight", "comment": "Number of tokens in the response", "isMeasurement": true },
				"cachedTokens": { "classification": "SystemMetaData", "purpose": "FeatureInsight", "comment": "Number of cached tokens in the response", "isMeasurement": true },
				"acceptedPredictionTokens": { "classification": "SystemMetaData", "purpose": "FeatureInsight", "comment": "Number of tokens in the prediction that appeared in the completion", "isMeasurement": true },
				"rejectedPredictionTokens": { "classification": "SystemMetaData", "purpose": "FeatureInsight", "comment": "Number of tokens in the prediction that appeared in the completion", "isMeasurement": true },
				"hadDiagnosticsNES": { "classification": "SystemMetaData", "purpose": "FeatureInsight", "comment": "Whether the request had diagnostics NES", "isMeasurement": true },
				"hadLlmNES": { "classification": "SystemMetaData", "purpose": "FeatureInsight", "comment": "Whether the request had LLM NES", "isMeasurement": true },
				"configIsDiagnosticsNESEnabled": { "classification": "SystemMetaData", "purpose": "FeatureInsight", "comment": "Whether diagnostics NES is enabled", "isMeasurement": true },
				"isNaturalLanguageDominated": { "classification": "SystemMetaData", "purpose": "FeatureInsight", "comment": "Whether the context is dominated by natural language", "isMeasurement": true },
				"diagnosticHasExistingSameFileImport": { "classification": "SystemMetaData", "purpose": "FeatureInsight", "comment": "Whether the diagnostic has an existing same file import", "isMeasurement": true },
				"diagnosticIsLocalImport": { "classification": "SystemMetaData", "purpose": "FeatureInsight", "comment": "Whether the diagnostic is a local import", "isMeasurement": true },
				"diagnosticAlternativeImportsCount": { "classification": "SystemMetaData", "purpose": "FeatureInsight", "comment": "Number of alternative imports for the diagnostic", "isMeasurement": true },
				"diagnosticDistanceToUnknownDiagnostic": { "classification": "SystemMetaData", "purpose": "FeatureInsight", "comment": "Distance to the unknown diagnostic", "isMeasurement": true },
				"diagnosticDistanceToAlternativeDiagnostic": { "classification": "SystemMetaData", "purpose": "FeatureInsight", "comment": "Distance to the alternative diagnostic", "isMeasurement": true },
				"diagnosticHasAlternativeDiagnosticForSameRange": { "classification": "SystemMetaData", "purpose": "FeatureInsight", "comment": "Whether there is an alternative diagnostic for the same range", "isMeasurement": true },
				"nextCursorLineDistance": { "classification": "SystemMetaData", "purpose": "FeatureInsight", "comment": "Distance from next cursor line to current cursor line: newCursorLineNumber - currentCursorLineNumber", "isMeasurement": true },
				"nextCursorLineError": { "classification": "SystemMetaData", "purpose": "FeatureInsight", "comment": "Error in the predicted next cursor line" },
				"xtabAggressivenessLevel": { "classification": "SystemMetaData", "purpose": "FeatureInsight", "comment": "The aggressiveness level used for xtabAggressiveness prompting strategy (low, medium, high)" },
				"userAggressivenessSetting": { "classification": "SystemMetaData", "purpose": "FeatureInsight", "comment": "The raw user-facing aggressiveness setting value (only set when user changed from default)" },
				"xtabUserHappinessScore": { "classification": "SystemMetaData", "purpose": "FeatureInsight", "comment": "User happiness score (0-1) when using xtabAggressiveness prompting strategy", "isMeasurement": true },
				"userTypingDisagreed": { "classification": "SystemMetaData", "purpose": "FeatureInsight", "comment": "Whether the user typing disagreed with the suggestion", "isMeasurement": true },
				"modelConfig": { "classification": "SystemMetaData", "purpose": "FeatureInsight", "comment": "JSON-encoded model configuration from the model service" }
			}
		*/
		this._sendTelemetryToBoth(
			{
				opportunityId,
				headerRequestId,
				providerId,
				modelName,
				activeDocumentLanguageId,
				mergeConflictExpanded: telemetry.mergeConflictExpanded,
				acceptance,
				disposalReason,
				supersededByOpportunityId,
				noNextEditReasonKind,
				noNextEditReasonMessage,
				fetchResult: fetchResult_,
				nextEditProviderError: telemetry.nextEditProviderError,
				reusedRequest,
				diagnosticType,
				diagnosticDroppedReasons,
				pickedNES,
				notebookType,
				notebookId,
				notebookCellLines,
				nextCursorLineError: telemetry.nextCursorPrediction?.nextCursorLineError,
				xtabAggressivenessLevel,
				userAggressivenessSetting,
				modelConfig,
				neighborSnippetIndicesInPrompt: telemetry.neighborSnippetIndicesInPrompt,
			},
			{
				requestN,
				hadStatelessNextEditProviderCall: this._boolToNum(hadStatelessNextEditProviderCall),
				statelessNextEditProviderDuration,
				nextEditProviderDuration,
				isFromCache: this._boolToNum(isFromCache),
				subsequentEditOrder,
				activeDocumentOriginalLineCount,
				activeDocumentNLinesInPrompt: nLinesOfCurrentFileInPrompt,
				wasPreviouslyRejected: this._boolToNum(wasPreviouslyRejected),
				isShown: this._boolToNum(isShown),
				isNotebook: this._boolToNum(isNotebook),
				isNESForAnotherDoc: this._boolToNum(isNESForAnotherDoc),
				isActiveDocument: this._boolToNum(isActiveDocument),
				isEolDifferent: this._boolToNum(isEolDifferent),
				isMultilineEdit: this._boolToNum(isMultilineEdit),
				isNextEditorRangeVisible: this._boolToNum(isNextEditorRangeVisible),
				isNextEditorVisible: this._boolToNum(isNextEditorVisible),
				hasNotebookCellMarker: notebookCellMarkerCount > 0 ? 1 : 0,
				notebookCellMarkerCount,
				notebookCellMarkerIndex,
				logProbThreshold,
				documentsCount,
				editsCount,
				activeDocumentEditsCount,
				promptLineCount,
				promptCharCount,
				hadLowLogProbSuggestion: this._boolToNum(hadLowLogProbSuggestion),
				nEditsSuggested,
				lineDistanceToMostRecentEdit,
				isCursorAtEndOfLine: this._boolToNum(isCursorAtEndOfLine),
				isInlineSuggestion: this._boolToNum(isInlineSuggestion),
				debounceTime,
				artificialDelay,
				fetchStartedAfterMs,
				ttft: ttft_,
				fetchTime: fetchTime_,
				promptTokens: usage?.prompt_tokens,
				responseTokens: usage?.completion_tokens,
				cachedTokens: usage?.prompt_tokens_details?.cached_tokens,
				acceptedPredictionTokens: usage?.completion_tokens_details?.accepted_prediction_tokens,
				rejectedPredictionTokens: usage?.completion_tokens_details?.rejected_prediction_tokens,
				hasNextEdit: this._boolToNum(hasNextEdit),
				userTypingDisagreed: this._boolToNum(telemetry.userTypingDisagreed),
				nextEditLogprob,
				hadDiagnosticsNES: this._boolToNum(hadDiagnosticsNES),
				hadLlmNES: this._boolToNum(hadLlmNES),
				configIsDiagnosticsNESEnabled: this._boolToNum(configIsDiagnosticsNESEnabled),
				isNaturalLanguageDominated: this._boolToNum(isNaturalLanguageDominated),
				diagnosticHasExistingSameFileImport: this._boolToNum(diagnosticHasExistingSameFileImport),
				diagnosticIsLocalImport: this._boolToNum(diagnosticIsLocalImport),
				diagnosticAlternativeImportsCount: diagnosticAlternativeImportsCount,
				diagnosticDistanceToUnknownDiagnostic: diagnosticDistanceToUnknownDiagnostic,
				diagnosticDistanceToAlternativeDiagnostic: diagnosticDistanceToAlternativeDiagnostic,
				diagnosticHasAlternativeDiagnosticForSameRange: this._boolToNum(diagnosticHasAlternativeDiagnosticForSameRange),
				nextCursorLineDistance: telemetry.nextCursorPrediction?.nextCursorLineDistance,
				xtabUserHappinessScore,
				nDiffsInPrompt: telemetry.nDiffsInPrompt,
				diffTokensInPrompt: telemetry.diffTokensInPrompt,
				nNeighborSnippetsComputed: telemetry.nNeighborSnippetsComputed,
				nNeighborSnippetsInPrompt: telemetry.nNeighborSnippetsInPrompt,
			}
		);
	}

	private _sendTelemetryToBoth(properties?: TelemetryEventProperties, measurements?: TelemetryEventMeasurements): void {
		this._telemetryService.sendMSFTTelemetryEvent('provideInlineEdit', properties, measurements);
		this._telemetryService.sendGHTelemetryEvent('copilot-nes/provideInlineEdit', properties, measurements);
	}

	private async _doSendEnhancedTelemetry(telemetry: INextEditProviderTelemetry, sendingReason: IEnhancedTelemetrySendingReason | undefined): Promise<void> {

		const {
			opportunityId,
			headerRequestId,
			providerId,
			activeDocumentLanguageId,
			status: suggestionStatus,
			modelName,
			prompt,
			response,
			alternativeAction,
			postProcessingOutcome,
			activeDocumentRepository,
			repositoryUrls,
			cursorJumpModelName,
			cursorJumpPrompt,
			cursorJumpResponse,
			lintErrors,
			terminalOutput,
			similarFilesContext,
			modelConfig,
			isFromCache,
		} = telemetry;

		const modelResponse = response === undefined ? response : await response;
		const resolvedSimilarFilesContext = await similarFilesContext?.catch(() => undefined);

		this._telemetryService.sendEnhancedGHTelemetryEvent('copilot-nes/provideInlineEdit',
			multiplexProperties({
				opportunityId,
				headerRequestId,
				providerId,
				activeDocumentLanguageId,
				suggestionStatus,
				modelName,
				prompt,
				modelResponse: modelResponse === undefined || modelResponse.response.type !== ChatFetchResponseType.Success ? undefined : modelResponse.response.value,
				alternativeAction: alternativeAction ? JSON.stringify({ ...alternativeAction, enhancedTelemetrySendingReason: sendingReason }) : undefined,
				enhancedTelemetrySendingReason: !alternativeAction && sendingReason ? JSON.stringify(sendingReason) : undefined,
				postProcessingOutcome,
				activeDocumentRepository,
				repositories: JSON.stringify(repositoryUrls),
				cursorJumpModelName,
				cursorJumpPrompt,
				cursorJumpResponse,
				lintErrors,
				terminalOutput,
				similarFilesContext: resolvedSimilarFilesContext,
				modelConfig,
			}),
			{
				isFromCache: this._boolToNum(isFromCache),
			}
		);
	}

	/**
	 * If `value` is undefined, return undefined, otherwise return 1 if `value` is true, 0 otherwise.
	 */
	private _boolToNum(value: boolean | undefined): number | undefined {
		return value === undefined ? undefined : (value ? 1 : 0);
	}

	dispose(): void {
		for (const data of this._map.values()) {
			clearTimeout(data.timeout);
			if (data.hardCapTimeout !== undefined) {
				clearTimeout(data.hardCapTimeout);
			}
			data.builder.dispose();
		}
		this._map.clear();

		if (this._idleDetector) {
			this._idleDetector.forceDispose();
			this._idleDetector = undefined;
		}
	}
}
