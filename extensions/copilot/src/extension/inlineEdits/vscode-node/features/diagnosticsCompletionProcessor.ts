/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as vscode from 'vscode';
import { ConfigKey, IConfigurationService } from '../../../../platform/configuration/common/configurationService';
import { applyEditsToRanges } from '../../../../platform/editSurvivalTracking/common/editSurvivalTracker';
import { IFileSystemService } from '../../../../platform/filesystem/common/fileSystemService';
import { DocumentId } from '../../../../platform/inlineEdits/common/dataTypes/documentId';
import { Edits } from '../../../../platform/inlineEdits/common/dataTypes/edit';
import { ObservableGit } from '../../../../platform/inlineEdits/common/observableGit';
import { IObservableDocument } from '../../../../platform/inlineEdits/common/observableWorkspace';
import { autorunWithChanges } from '../../../../platform/inlineEdits/common/utils/observable';
import { WorkspaceDocumentEditHistory } from '../../../../platform/inlineEdits/common/workspaceEditTracker/workspaceDocumentEditTracker';
import { ILogger, ILogService } from '../../../../platform/log/common/logService';
import { ITabsAndEditorsService } from '../../../../platform/tabs/common/tabsAndEditorsService';
import { IWorkspaceService } from '../../../../platform/workspace/common/workspaceService';
import { isNotebookCell } from '../../../../util/common/notebooks';
import { equals } from '../../../../util/vs/base/common/arrays';
import { findFirstMonotonous } from '../../../../util/vs/base/common/arraysFind';
import { ThrottledDelayer } from '../../../../util/vs/base/common/async';
import { CancellationToken, CancellationTokenSource } from '../../../../util/vs/base/common/cancellation';
import { BugIndicatingError } from '../../../../util/vs/base/common/errors';
import { Emitter } from '../../../../util/vs/base/common/event';
import { Disposable } from '../../../../util/vs/base/common/lifecycle';
import { autorun, derived, IObservable, runOnChange } from '../../../../util/vs/base/common/observableInternal';
import { isEqual } from '../../../../util/vs/base/common/resources';
import { StringEdit } from '../../../../util/vs/editor/common/core/edits/stringEdit';
import { Position } from '../../../../util/vs/editor/common/core/position';
import { OffsetRange } from '../../../../util/vs/editor/common/core/ranges/offsetRange';
import { StringText } from '../../../../util/vs/editor/common/core/text/abstractText';
import { getInformationDelta, InformationDelta } from '../../common/informationDelta';
import { RejectionCollector } from '../../common/rejectionCollector';
import { IVSCodeObservableDocument, VSCodeWorkspace } from '../parts/vscodeWorkspace';
import { toInternalPosition } from '../utils/translations';
import { AnyDiagnosticCompletionItem, AnyDiagnosticCompletionProvider } from './diagnosticsBasedCompletions/anyDiagnosticsCompletionProvider';
import { AsyncDiagnosticCompletionProvider } from './diagnosticsBasedCompletions/asyncDiagnosticsCompletionProvider';
import { Diagnostic, DiagnosticCompletionItem, DiagnosticInlineEditRequestLogContext, IDiagnosticCompletionProvider, log, logList, sortDiagnosticsByDistance } from './diagnosticsBasedCompletions/diagnosticsCompletions';
import { ImportDiagnosticCompletionItem, ImportDiagnosticCompletionProvider } from './diagnosticsBasedCompletions/importDiagnosticsCompletionProvider';

interface IDiagnosticsCompletionState<T extends DiagnosticCompletionItem = DiagnosticCompletionItem> {
	completionItem: T | null;
	logContext: DiagnosticInlineEditRequestLogContext;
	telemetryBuilder: DiagnosticsCompletionHandlerTelemetry;
}

function diagnosticCompletionRunResultEquals(a: IDiagnosticsCompletionState, b: IDiagnosticsCompletionState): boolean {
	if (!!a.completionItem && !!b.completionItem) {
		return DiagnosticCompletionItem.equals(a.completionItem, b.completionItem);
	}
	return a.completionItem === b.completionItem;
}

// Only exported for testing
export class DiagnosticsCollection {

	private _diagnostics: Diagnostic[] = [];

	applyEdit(previous: StringText, edit: StringEdit, after: StringText): boolean {

		let hasInvalidated = false;
		for (const diagnostic of this._diagnostics) {
			const oldRange = diagnostic.range;
			const newRange = applyEditsToRanges([oldRange], edit)[0];

			// If the range shrank then the diagnostic will have changed
			if (!newRange || newRange.length < oldRange.length) {
				diagnostic.invalidate();
				hasInvalidated = true;
				continue;
			}

			const contentAtOldRange = oldRange.substring(previous.value);

			// If the range stays the same then the diagnostic is still valid if the content is the same
			if (newRange.length === oldRange.length) {
				const contentAtNewRange = newRange.substring(after.value);
				if (contentAtOldRange === contentAtNewRange) {
					diagnostic.updateRange(newRange);
				} else {
					diagnostic.invalidate();
					hasInvalidated = true;
				}
				continue;
			}

			// If the range grew then we need to check what got added
			const isSamePrefix = contentAtOldRange === new OffsetRange(newRange.start, newRange.start + oldRange.length).substring(after.value);
			const isSameSuffix = contentAtOldRange === new OffsetRange(newRange.endExclusive - oldRange.length, newRange.endExclusive).substring(after.value);
			if (!isSamePrefix && !isSameSuffix) {
				// The content at the diagnostic range has changed
				diagnostic.invalidate();
				hasInvalidated = true;
				continue;
			}

			let edgeCharacter;
			if (isSamePrefix) {
				const offsetAfterOldRange = newRange.start + oldRange.length;
				edgeCharacter = new OffsetRange(offsetAfterOldRange, offsetAfterOldRange + 1).substring(after.value);
			} else {
				const offsetBeforeOldRange = newRange.endExclusive - oldRange.length - 1;
				edgeCharacter = new OffsetRange(offsetBeforeOldRange, offsetBeforeOldRange + 1).substring(after.value);
			}

			if (edgeCharacter.length !== 1 || /^[a-zA-Z0-9_]$/.test(edgeCharacter)) {
				// The content at the diagnostic range has changed
				diagnostic.invalidate();
				hasInvalidated = true;
				continue;
			}

			// We need to update the range of the diagnostic after applying the edits
			let updatedRange: OffsetRange;
			if (isSamePrefix) {
				updatedRange = new OffsetRange(newRange.start, newRange.start + oldRange.length);
			} else {
				updatedRange = new OffsetRange(newRange.endExclusive - oldRange.length, newRange.endExclusive);
			}

			diagnostic.updateRange(updatedRange);
		}

		return hasInvalidated;
	}

	isEqualAndUpdate(relevantDiagnostics: Diagnostic[]): boolean {
		if (equals(this._diagnostics, relevantDiagnostics, Diagnostic.equals)) {
			return true;
		}
		this._diagnostics = relevantDiagnostics;
		return false;
	}

	toString(): string {
		return this._diagnostics.map(d => d.toString()).join('\n');
	}
}

export type DiagnosticCompletionState = {
	item: DiagnosticCompletionItem | undefined;
	telemetry: IDiagnosticsCompletionTelemetry;
	logContext: DiagnosticInlineEditRequestLogContext | undefined;
	workInProgress?: boolean;
};

export class DiagnosticsCompletionProcessor extends Disposable {

	static get documentSelector(): vscode.DocumentSelector {
		return Array.from(new Set([
			...ImportDiagnosticCompletionProvider.SupportedLanguages,
			...AsyncDiagnosticCompletionProvider.SupportedLanguages
		]));
	}

	private readonly _onDidChange = this._register(new Emitter<boolean>());
	readonly onDidChange = this._onDidChange.event;

	private readonly _worker = new AsyncWorker<IDiagnosticsCompletionState>(20, diagnosticCompletionRunResultEquals);

	private readonly _rejectionCollector: RejectionCollector;
	private readonly _diagnosticsCompletionProviders: IObservable<IDiagnosticCompletionProvider[]>;
	private readonly _workspaceDocumentEditHistory: WorkspaceDocumentEditHistory;
	private readonly _currentDiagnostics = new DiagnosticsCollection();

	private readonly _logger: ILogger;

	constructor(
		private readonly _workspace: VSCodeWorkspace,
		git: ObservableGit,
		@ILogService logService: ILogService,
		@IConfigurationService configurationService: IConfigurationService,
		@IWorkspaceService workspaceService: IWorkspaceService,
		@IFileSystemService fileSystemService: IFileSystemService,
		@ITabsAndEditorsService private readonly _tabsAndEditorsService: ITabsAndEditorsService,
	) {
		super();

		this._workspaceDocumentEditHistory = this._register(new WorkspaceDocumentEditHistory(this._workspace, git, 100));

		this._logger = logService.createSubLogger(['NES', 'DiagnosticsInlineCompletionProvider']);

		const diagnosticsExplorationEnabled = configurationService.getConfigObservable(ConfigKey.TeamInternal.InlineEditsDiagnosticsExplorationEnabled);

		const importProvider = new ImportDiagnosticCompletionProvider(this._logger.createSubLogger('Import'), workspaceService, fileSystemService);
		const asyncProvider = new AsyncDiagnosticCompletionProvider(this._logger.createSubLogger('Async'));

		this._diagnosticsCompletionProviders = derived(reader => {
			const providers: IDiagnosticCompletionProvider[] = [
				importProvider,
				asyncProvider
			];

			if (diagnosticsExplorationEnabled.read(reader)) {
				providers.push(new AnyDiagnosticCompletionProvider(this._logger.createSubLogger('All')));
			}

			return providers;
		}).recomputeInitiallyAndOnChange(this._store);

		this._rejectionCollector = this._register(new RejectionCollector(this._workspace, logService));

		const isValidEditor = (editor: vscode.TextEditor | undefined): editor is vscode.TextEditor => {
			return !!editor && (isNotebookCell(editor.document.uri) || isEditorFromEditorGrid(editor));
		};

		this._register(autorun(reader => {
			const activeDocument = this._workspace.lastActiveDocument.read(reader);
			if (!activeDocument) { return; }

			const activeEditor = this._tabsAndEditorsService.activeTextEditor;
			if (!activeEditor || !isEditorFromEditorGrid(activeEditor) || !isEqual(activeDocument.id.toUri(), activeEditor.document.uri)) {
				return;
			}

			// update state because document changed
			this._updateState();

			// update state because diagnostics changed
			reader.store.add(runOnChange(activeDocument.diagnostics, (diagnostics) => {
				this._logger.trace(`Diagnostics changed received in processor: ${diagnostics.map(d => '\n- ' + d.message).join('')}`);
				this._updateState();
			}));
		}));

		this._register(vscode.window.onDidChangeTextEditorSelection(async e => {
			const activeEditor = this._tabsAndEditorsService.activeTextEditor;
			if (!isValidEditor(activeEditor)) {
				return;
			}

			if (!isEqual(e.textEditor.document.uri, activeEditor.document.uri)) {
				return;
			}

			this._updateState();
		}));

		this._register(this._worker.onDidChange(result => {
			this._onDidChange.fire(!!result.completionItem);
		}));

		this._register(autorun(reader => {
			const document = this._workspace.lastActiveDocument.read(reader);
			if (!document) { return; }

			reader.store.add(autorunWithChanges(this, {
				value: document.value,
			}, (data) => {
				for (const edit of data.value.changes) {
					if (!data.value.previous) { continue; }
					const hasInvalidatedRange = this._currentDiagnostics.applyEdit(data.value.previous, edit, data.value.value);
					if (hasInvalidatedRange) {
						this._updateState();
					}
				}
			}));
		}));
	}

	private async _updateState(): Promise<void> {
		const activeTextEditor = this._tabsAndEditorsService.activeTextEditor;
		if (!activeTextEditor) { return; }

		const workspaceDocument = this._workspace.getDocumentByTextDocument(activeTextEditor.document);
		if (!workspaceDocument) { return; }

		const range = new vscode.Range(activeTextEditor.selection.active, activeTextEditor.selection.active);
		const selection = workspaceDocument.toRange(activeTextEditor.document, range);
		if (!selection) {
			return;
		}

		const cursor = toInternalPosition(selection.start);
		const log = new DiagnosticInlineEditRequestLogContext();

		const relevantDiagnostics = this._getDiagnostics(workspaceDocument, cursor, log);
		const diagnosticsSorted = sortDiagnosticsByDistance(workspaceDocument, relevantDiagnostics, cursor);

		if (this._currentDiagnostics.isEqualAndUpdate(diagnosticsSorted)) {
			return;
		}

		this._logger.trace('Scheduled update for diagnostics inline completion');

		await this._worker.schedule(async (token: CancellationToken) => this._runCompletionHandler(workspaceDocument, diagnosticsSorted, cursor, log, token));
	}

	private _getDiagnostics(workspaceDocument: IVSCodeObservableDocument, cursor: Position, logContext: DiagnosticInlineEditRequestLogContext): Diagnostic[] {
		const availableDiagnostics = workspaceDocument.diagnostics.get().map(d => new Diagnostic(d));
		if (availableDiagnostics.length === 0) {
			return [];
		}

		const filterDiagnosticsAndLog = (diagnostics: Diagnostic[], message: string, filterFn: (diagnostics: Diagnostic[]) => Diagnostic[]): Diagnostic[] => {
			const diagnosticsAfter = filterFn(diagnostics);
			const diagnosticsDiff = diagnostics.filter(diagnostic => !diagnosticsAfter.includes(diagnostic));
			if (diagnosticsDiff.length > 0) {
				logList(message, diagnosticsDiff, logContext, this._logger);
			}
			return diagnosticsAfter;
		};

		const language = workspaceDocument.languageId.get();
		const providers = this._diagnosticsCompletionProviders.get();

		let relevantDiagnostics = [...availableDiagnostics];
		relevantDiagnostics = filterDiagnosticsAndLog(relevantDiagnostics, 'Filtered by provider', ds => ds.filter(diagnostic => providers.some(provider => provider.providesCompletionsForDiagnostic(workspaceDocument, diagnostic, language, cursor))));
		relevantDiagnostics = filterDiagnosticsAndLog(relevantDiagnostics, 'Filtered by recent acceptance', ds => ds.filter(diagnostic => !this._hasDiagnosticRecentlyBeenAccepted(diagnostic)));
		relevantDiagnostics = filterDiagnosticsAndLog(relevantDiagnostics, 'Filtered by no recent edit', ds => this._filterDiagnosticsByRecentEditNearby(ds, workspaceDocument));

		return relevantDiagnostics;
	}

	private async _runCompletionHandler(workspaceDocument: IVSCodeObservableDocument, diagnosticsSorted: Diagnostic[], cursor: Position, log: DiagnosticInlineEditRequestLogContext, token: CancellationToken): Promise<IDiagnosticsCompletionState> {
		const telemetryBuilder = new DiagnosticsCompletionHandlerTelemetry();

		let completionItem = null;
		try {
			this._logger.trace('Running diagnostics inline completion handler');
			completionItem = await this._getCompletionFromDiagnostics(workspaceDocument, diagnosticsSorted, cursor, log, token, telemetryBuilder);
		} catch (error) {
			log.setError(error);
		}

		this._logger.trace('Diagnostic Providers returned completion item: ' + (completionItem ? completionItem.toString() : 'null'));

		if (completionItem instanceof ImportDiagnosticCompletionItem) {
			telemetryBuilder.setImportTelemetry(completionItem);
		}

		return { completionItem, logContext: log, telemetryBuilder: telemetryBuilder };
	}

	getCurrentState(docId: DocumentId): DiagnosticCompletionState {
		const currentState = this._worker.getCurrentResult();

		const workspaceDocument = this._workspace.getDocument(docId);
		if (!workspaceDocument) { return { item: undefined, telemetry: new DiagnosticsCompletionHandlerTelemetry().addDroppedReason('WorkspaceDocumentNotFound').build(), logContext: undefined }; }

		if (currentState === undefined) {
			return { item: undefined, telemetry: new DiagnosticsCompletionHandlerTelemetry().build(), logContext: undefined };
		}

		const { telemetryBuilder, completionItem, logContext } = currentState;
		const workInProgress = this._worker.workInProgress();
		if (!completionItem) {
			return { item: undefined, telemetry: telemetryBuilder.build(), logContext, workInProgress };
		}

		if (!this._isCompletionItemValid(completionItem, workspaceDocument, currentState.logContext, telemetryBuilder)) {
			return { item: undefined, telemetry: telemetryBuilder.build(), logContext, workInProgress };
		}

		if (completionItem.documentId !== docId) {
			logContext.addLog('Dropped: wrong-document');
			return { item: undefined, telemetry: telemetryBuilder.addDroppedReason('wrong-document').build(), logContext, workInProgress };
		}

		log('following known diagnostics:\n' + this._currentDiagnostics.toString(), undefined, this._logger);

		return { item: completionItem, telemetry: telemetryBuilder.build(), logContext, workInProgress };
	}

	private async _getCompletionFromDiagnostics(workspaceDocument: IVSCodeObservableDocument, diagnosticsSorted: Diagnostic[], pos: Position, logContext: DiagnosticInlineEditRequestLogContext, token: CancellationToken, tb: DiagnosticsCompletionHandlerTelemetry): Promise<DiagnosticCompletionItem | null> {
		if (diagnosticsSorted.length === 0) {
			log(`No diagnostics available for document ${workspaceDocument.id.toString()}`, logContext, this._logger);
			return null;
		}

		const diagnosticsCompletionItems = await this._fetchDiagnosticsBasedCompletions(workspaceDocument, diagnosticsSorted, pos, logContext, token);

		return diagnosticsCompletionItems.find(item => this._isCompletionItemValid(item, workspaceDocument, logContext, tb)) ?? null;
	}

	private async _fetchDiagnosticsBasedCompletions(workspaceDocument: IVSCodeObservableDocument, sortedDiagnostics: Diagnostic[], pos: Position, logContext: DiagnosticInlineEditRequestLogContext, token: CancellationToken): Promise<DiagnosticCompletionItem[]> {
		const providers = this._diagnosticsCompletionProviders.get();

		const providerTimings: Array<{ provider: string; duration: number }> = [];

		const providerResults = await Promise.all(providers.map(async provider => {
			const startTime = Date.now();
			const result = await provider.provideDiagnosticCompletionItem(workspaceDocument, sortedDiagnostics, pos, logContext, token);
			providerTimings.push({ provider: provider.providerName, duration: Date.now() - startTime });
			return result;
		}));

		this._logger.trace(`Provider durations: ${providerTimings.map(timing => `\n- ${timing.provider}: ${timing.duration}ms`).join('')}`);

		return providerResults.filter(item => !!item) as DiagnosticCompletionItem[];
	}

	// Handle Acceptance and rejection of diagnostics completion items

	public handleEndOfLifetime(completionItem: DiagnosticCompletionItem, reason: vscode.InlineCompletionEndOfLifeReason): void {
		const provider = this._diagnosticsCompletionProviders.get().find(p => p.providerName === completionItem.providerName);
		if (!provider) {
			throw new BugIndicatingError('No provider found for completion item');
		}

		if (reason.kind === vscode.InlineCompletionEndOfLifeReasonKind.Rejected) {
			this._rejectDiagnosticCompletion(provider, completionItem);
		} else if (reason.kind === vscode.InlineCompletionEndOfLifeReasonKind.Accepted) {
			this._acceptDiagnosticCompletion(provider, completionItem);
		}
	}

	private _lastAcceptedDiagnostic: { diagnostic: Diagnostic; time: number } | undefined = undefined;
	private _acceptDiagnosticCompletion(provider: IDiagnosticCompletionProvider, item: DiagnosticCompletionItem): void {
		this._lastAcceptedDiagnostic = { diagnostic: item.diagnostic, time: Date.now() };
	}

	private _rejectDiagnosticCompletion(provider: IDiagnosticCompletionProvider, item: DiagnosticCompletionItem): void {
		this._rejectionCollector.reject(item.documentId, item.toOffsetEdit());

		provider.completionItemRejected?.(item);
	}

	// Filters

	private _isCompletionItemValid(item: DiagnosticCompletionItem, workspaceDocument: IObservableDocument, logContext: DiagnosticInlineEditRequestLogContext, tb: DiagnosticsCompletionHandlerTelemetry): boolean {
		if (!item.diagnostic.isValid()) {
			log('Diagnostic completion item is no longer valid', logContext, this._logger);
			tb.addDroppedReason('no-longer-valid', item);
			logContext.markToBeLogged();
			return false;
		}

		if (this._isDiagnosticCompletionRejected(item)) {
			log('Diagnostic completion item has been rejected before', logContext, this._logger);
			tb.addDroppedReason('recently-rejected', item);
			logContext.markToBeLogged();
			return false;
		}

		if (this._isUndoRecentEdit(item)) {
			log('Diagnostic completion item is an undo operation', logContext, this._logger);
			tb.addDroppedReason('undo-operation', item);
			logContext.markToBeLogged();
			return false;
		}

		if (this._hasDiagnosticRecentlyBeenAccepted(item.diagnostic)) {
			log('Completion item fixing the diagnostic has been accepted recently', logContext, this._logger);
			tb.addDroppedReason('recently-accepted', item);
			logContext.markToBeLogged();
			return false;
		}

		if (this._hasRecentlyBeenAddedWithoutNES(item)) {
			log('Diagnostic has been fixed without NES recently', logContext, this._logger);
			tb.addDroppedReason('recently-added-without-nes', item);
			logContext.markToBeLogged();
			return false;
		}

		const provider = this._diagnosticsCompletionProviders.get().find(p => p.providerName === item.providerName);
		if (provider && provider.isCompletionItemStillValid && !provider.isCompletionItemStillValid(item, workspaceDocument)) {
			log(`${provider.providerName}: Completion item is no longer valid`, logContext, this._logger);
			tb.addDroppedReason(`${provider.providerName}-no-longer-valid`, item);
			logContext.markToBeLogged();
			return false;
		}

		return true;
	}

	private _isDiagnosticCompletionRejected(diagnostic: DiagnosticCompletionItem): boolean {
		return this._rejectionCollector.isRejected(diagnostic.documentId, diagnostic.toOffsetEdit());
	}

	private _hasRecentlyBeenAddedWithoutNES(item: DiagnosticCompletionItem): boolean {
		const recentEdits = this._workspaceDocumentEditHistory.getNRecentEdits(item.documentId, 5)?.edits;
		if (!recentEdits) {
			return false;
		}

		const offsetEdit = item.toOffsetEdit();
		return recentEdits.replacements.some(edit => edit.replaceRange.intersectsOrTouches(offsetEdit.replaceRange));
	}

	private _hasDiagnosticRecentlyBeenAccepted(diagnostic: Diagnostic): boolean {
		if (!this._lastAcceptedDiagnostic || this._lastAcceptedDiagnostic.time + 1000 < Date.now()) {
			return false;
		}
		return this._lastAcceptedDiagnostic.diagnostic.equals(diagnostic);
	}

	private _isUndoRecentEdit(diagnostic: DiagnosticCompletionItem): boolean {
		const documentHistory = this._workspaceDocumentEditHistory.getRecentEdits(diagnostic.documentId);
		if (!documentHistory) {
			return false;
		}

		return diagnosticWouldUndoUserEdit(diagnostic, documentHistory.before, documentHistory.after, Edits.single(documentHistory.edits));
	}

	private _filterDiagnosticsByRecentEditNearby(diagnostics: Diagnostic[], document: IVSCodeObservableDocument): Diagnostic[] {
		const recentEdits = this._workspaceDocumentEditHistory.getRecentEdits(document.id)?.edits;
		if (!recentEdits) {
			return [];
		}

		return diagnostics.filter(diagnostic => {
			const newRanges = recentEdits.getNewRanges();
			const potentialIntersection = findFirstMonotonous(newRanges, (r) => r.endExclusive >= diagnostic.range.start);
			return potentialIntersection?.intersectsOrTouches(diagnostic.range);
		});
	}
}

function diagnosticWouldUndoUserEdit(diagnostic: DiagnosticCompletionItem, documentBefore: StringText, documentAfter: StringText, edits: Edits): boolean {

	const currentEdit = diagnostic.toOffsetEdit().toEdit();
	const ourInformationDelta = getInformationDelta(documentAfter.value, currentEdit);

	let recentInformationDelta = new InformationDelta();
	let doc = documentBefore.value;
	for (const edit of edits.edits) {
		recentInformationDelta = recentInformationDelta.combine(getInformationDelta(doc, edit));
		doc = edit.apply(doc);
	}

	if (recentInformationDelta.isUndoneBy(ourInformationDelta)) {
		return true;
	}

	return false;
}

function isEditorFromEditorGrid(editor: vscode.TextEditor): boolean {
	return editor.viewColumn !== undefined;
}

class AsyncWorker<T extends {}> extends Disposable {
	private readonly _taskQueue: ThrottledDelayer<void>;

	private readonly _onDidChange = this._register(new vscode.EventEmitter<T>());
	readonly onDidChange = this._onDidChange.event;

	private _currentTokenSource: CancellationTokenSource | undefined = undefined;
	private _activeWorkPromise: Promise<T | undefined> | undefined = undefined;

	private __currentResult: T | undefined = undefined;
	private get _currentResult(): T | undefined {
		return this.__currentResult;
	}
	private set _currentResult(value: T) {
		const changed = this.__currentResult === undefined || !this._equals(value, this.__currentResult);
		this.__currentResult = value;
		if (changed) {
			this._onDidChange.fire(value);
		}
	}

	constructor(delay: number, private readonly _equals: (a: T, b: T) => boolean) {
		super();

		this._taskQueue = new ThrottledDelayer<void>(delay);
	}

	async schedule(fn: (token: CancellationToken) => Promise<T>): Promise<void> {
		const activePromise = this._doSchedule(fn);
		this._activeWorkPromise = activePromise;

		const result = await activePromise;

		if (this._activeWorkPromise === activePromise) {
			this._activeWorkPromise = undefined;
		}

		if (result !== undefined) {
			this._currentResult = result;
		}
	}

	private async _doSchedule(fn: (token: CancellationToken) => Promise<T>): Promise<T | undefined> {
		this._currentTokenSource?.dispose(true);
		this._currentTokenSource = new CancellationTokenSource();
		const token = this._currentTokenSource.token;

		let result;
		await this._taskQueue.trigger(async () => {
			if (token.isCancellationRequested) {
				return;
			}

			result = await fn(token);
		});

		return result;
	}

	// Get the active result if there is one currently
	// Return undefined if there is currently work being done
	getCurrentResult(): T | undefined {
		if (this._currentResult === undefined) {
			return undefined;
		}

		return this._currentResult;
	}

	workInProgress(): boolean {
		return this._activeWorkPromise !== undefined;
	}

	override dispose(): void {
		if (this._currentTokenSource) {
			this._currentTokenSource.dispose();
		}
		super.dispose();
	}
}

interface IDiagnosticsCompletionTelemetry {
	droppedReasons: string[];
	alternativeImportsCount?: number;
	hasExistingSameFileImport?: boolean;
	isLocalImport?: boolean;
	distanceToUnknownDiagnostic?: number;
	distanceToAlternativeDiagnostic?: number;
	hasAlternativeDiagnosticForSameRange?: boolean;
}

class DiagnosticsCompletionHandlerTelemetry {
	private _droppedReasons: string[] = [];

	addDroppedReason(reason: string, item?: DiagnosticCompletionItem): this {
		if (item instanceof AnyDiagnosticCompletionItem) {
			return this; // Do not track dropped reasons for "any" items
		}

		this._droppedReasons.push(item ? `${item.type}:${reason}` : reason);
		return this;
	}

	private _distanceToAlternativeDiagnostic: number | undefined;
	setDistanceToAlternativeDiagnostic(distance: number | undefined): this {
		this._distanceToAlternativeDiagnostic = distance;
		return this;
	}

	private _distanceToUnknownDiagnostic: number | undefined;
	setDistanceToUnknownDiagnostic(distance: number | undefined): this {
		this._distanceToUnknownDiagnostic = distance;
		return this;
	}

	private _hasAlternativeDiagnosticForSameRange: boolean | undefined;
	setHasAlternativeDiagnosticForSameRange(has: boolean | undefined): this {
		this._hasAlternativeDiagnosticForSameRange = has;
		return this;
	}

	private _alternativeImportsCount: number | undefined;
	private _hasExistingSameFileImport: boolean | undefined;
	private _isLocalImport: boolean | undefined;

	setImportTelemetry(item: ImportDiagnosticCompletionItem): this {
		this._alternativeImportsCount = item.alternativeImportsCount;
		this._hasExistingSameFileImport = item.hasExistingSameFileImport;
		this._isLocalImport = item.isLocalImport;
		return this;
	}

	build(): IDiagnosticsCompletionTelemetry {
		return {
			droppedReasons: this._droppedReasons,
			alternativeImportsCount: this._alternativeImportsCount,
			hasExistingSameFileImport: this._hasExistingSameFileImport,
			isLocalImport: this._isLocalImport,
			distanceToUnknownDiagnostic: this._distanceToUnknownDiagnostic,
			distanceToAlternativeDiagnostic: this._distanceToAlternativeDiagnostic,
			hasAlternativeDiagnosticForSameRange: this._hasAlternativeDiagnosticForSameRange
		};
	}
}
