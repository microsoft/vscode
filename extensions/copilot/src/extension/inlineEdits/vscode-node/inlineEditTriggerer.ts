/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import type * as vscode from 'vscode';
import { TextDocumentChangeReason } from 'vscode';
import { ConfigKey, IConfigurationService } from '../../../platform/configuration/common/configurationService';
import { DocumentId } from '../../../platform/inlineEdits/common/dataTypes/documentId';
import { DocumentSwitchTriggerStrategy } from '../../../platform/inlineEdits/common/dataTypes/triggerOptions';
import { ILogger, ILogService } from '../../../platform/log/common/logService';
import { IExperimentationService } from '../../../platform/telemetry/common/nullExperimentationService';
import { IWorkspaceService } from '../../../platform/workspace/common/workspaceService';
import { isNotebookCell } from '../../../util/common/notebooks';
import { Emitter } from '../../../util/vs/base/common/event';
import { Disposable, DisposableMap, IDisposable, MutableDisposable } from '../../../util/vs/base/common/lifecycle';
import { generateUuid } from '../../../util/vs/base/common/uuid';
import { createTimeout } from '../common/common';
import { NesChangeHint, NesTriggerReason } from '../common/nesTriggerHint';
import { NesOutcome, NextEditProvider } from '../node/nextEditProvider';
import { VSCodeWorkspace } from './parts/vscodeWorkspace';

export const TRIGGER_INLINE_EDIT_AFTER_CHANGE_LIMIT = 10000; // 10 seconds
export const TRIGGER_INLINE_EDIT_ON_SAME_LINE_COOLDOWN = 5000; // milliseconds
export const TRIGGER_INLINE_EDIT_REJECTION_COOLDOWN = 5000; // 5s

class LastChange extends Disposable {
	public lastEditedTimestamp: number;
	public lineNumberTriggers: Map<number /* lineNumber */, number /* timestamp */>;

	public readonly timeout = this._register(new MutableDisposable<IDisposable>());

	private _nConsecutiveSelectionChanges = 0;
	public get nConsecutiveSelectionChanges(): number {
		return this._nConsecutiveSelectionChanges;
	}
	public incrementSelectionChangeEventCount(): void {
		this._nConsecutiveSelectionChanges++;
	}

	constructor(public documentTrigger: vscode.TextDocument) {
		super();
		this.lastEditedTimestamp = Date.now();
		this.lineNumberTriggers = new Map();
	}
}

export class InlineEditTriggerer extends Disposable {

	private _onChangeEmitter = this._register(new Emitter<NesChangeHint>());
	public readonly onChange = this._onChangeEmitter.event;

	private readonly docToLastChangeMap = this._register(new DisposableMap<DocumentId, LastChange>());

	private lastDocWithSelectionUri: string | undefined;

	/**
	 * Timestamp of the last edit in any document.
	 */
	private lastEditTimestamp: number | undefined;

	private readonly _logger: ILogger;

	constructor(
		private readonly workspace: VSCodeWorkspace,
		private readonly nextEditProvider: NextEditProvider,
		@ILogService private readonly _logService: ILogService,
		@IConfigurationService private readonly _configurationService: IConfigurationService,
		@IExperimentationService private readonly _expService: IExperimentationService,
		@IWorkspaceService private readonly _workspaceService: IWorkspaceService
	) {
		super();

		this._logger = this._logService.createSubLogger(['NES', 'Triggerer']);

		this.registerListeners();
	}

	private registerListeners() {
		this._registerDocumentChangeListener();
		this._registerSelectionChangeListener();
	}

	private _shouldIgnoreDoc(doc: vscode.TextDocument): boolean {
		return doc.uri.scheme === 'output'; // ignore output pane documents
	}

	private _registerDocumentChangeListener() {
		this._register(this._workspaceService.onDidChangeTextDocument(e => {
			if (this._shouldIgnoreDoc(e.document)) {
				return;
			}

			this.lastEditTimestamp = Date.now();

			const logger = this._logger.createSubLogger('onDidChangeTextDocument');

			if (e.reason === TextDocumentChangeReason.Undo || e.reason === TextDocumentChangeReason.Redo) { // ignore
				logger.trace('Return: undo/redo');
				return;
			}

			const doc = this.workspace.getDocumentByTextDocument(e.document);

			if (!doc) { // doc is likely copilot-ignored
				logger.trace('Return: ignored document');
				return;
			}

			this.docToLastChangeMap.set(doc.id, new LastChange(e.document));

			logger.trace(`Return: updated last edit timestamp and cleared line triggers for document for ${doc.id.uri}`);
		}));
	}

	private _registerSelectionChangeListener() {
		this._register(this._workspaceService.onDidChangeTextEditorSelection(e => this._handleSelectionChange(e)));
	}

	private _handleSelectionChange(e: vscode.TextEditorSelectionChangeEvent) {
		if (this._shouldIgnoreDoc(e.textEditor.document)) {
			return;
		}

		const isSameDoc = this.lastDocWithSelectionUri === e.textEditor.document.uri.toString();
		this.lastDocWithSelectionUri = e.textEditor.document.uri.toString();

		const logger = this._logger.createSubLogger('onDidChangeTextEditorSelection');

		if (e.selections.length !== 1) { // ignore multi-selection case
			logger.trace('Return: multiple selections');
			return;
		}

		if (!e.selections[0].isEmpty) { // ignore non-empty selection
			logger.trace('Return: not empty selection');
			return;
		}

		const doc = this.workspace.getDocumentByTextDocument(e.textEditor.document);
		if (!doc) { // doc is likely copilot-ignored
			return;
		}

		if (this._isWithinRejectionCooldown()) {
			// the cursor has moved within 5s of the last rejection, don't auto-trigger until another doc modification
			this.docToLastChangeMap.deleteAndDispose(doc.id);
			logger.trace('Return: rejection cooldown');
			return;
		}

		const mostRecentChange = this.docToLastChangeMap.get(doc.id);
		if (!mostRecentChange) {
			if (!this._maybeTriggerOnDocumentSwitch(e, isSameDoc, logger)) {
				logger.trace('Return: document not tracked - does not have recent changes');
			}
			return;
		}

		const hadRecentEdit = this._hasRecentEdit(mostRecentChange);
		if (!hadRecentEdit || !this._hasRecentTrigger()) {
			// The edit is too old or the provider was not triggered recently (we might be
			// observing a cursor change following an external edit) — try document switch.
			const reason = hadRecentEdit ? 'no recent trigger' : 'no recent edit';
			if (!this._maybeTriggerOnDocumentSwitch(e, isSameDoc, logger)) {
				logger.trace(`Return: ${reason}`);
			}
			return;
		}

		this._handleTrackedDocSelectionChange(e, doc, mostRecentChange, logger);
	}

	/**
	 * Handles a selection change in a document that has a recent tracked edit and a recent NES trigger.
	 * Checks same-line cooldown, cleans up stale triggers, and fires the trigger (possibly debounced).
	 */
	private _handleTrackedDocSelectionChange(
		e: vscode.TextEditorSelectionChangeEvent,
		doc: NonNullable<ReturnType<VSCodeWorkspace['getDocumentByTextDocument']>>,
		mostRecentChange: LastChange,
		logger: ILogger,
	) {
		const range = doc.toRange(e.textEditor.document, e.selections[0]);
		if (!range) {
			logger.trace('Return: no range');
			return;
		}

		const selectionLine = range.start.line;

		if (this._isSameLineCooldownActive(mostRecentChange, selectionLine, e.textEditor.document)) {
			logger.trace('Return: same line cooldown');
			return;
		}

		// TODO: Do not trigger if there is an existing valid request now running, ie don't use just last-trigger timestamp
		this._cleanupStaleLineTriggers(mostRecentChange);

		mostRecentChange.lineNumberTriggers.set(selectionLine, Date.now());
		mostRecentChange.documentTrigger = e.textEditor.document;
		logger.trace('Return: triggering inline edit');

		this._triggerWithDebounce(mostRecentChange);
	}

	// #region Helper predicates

	private _isWithinRejectionCooldown(): boolean {
		return (Date.now() - this.nextEditProvider.lastRejectionTime) < TRIGGER_INLINE_EDIT_REJECTION_COOLDOWN;
	}

	private _hasRecentEdit(mostRecentChange: LastChange): boolean {
		return (Date.now() - mostRecentChange.lastEditedTimestamp) < TRIGGER_INLINE_EDIT_AFTER_CHANGE_LIMIT;
	}

	private _hasRecentTrigger(): boolean {
		return (Date.now() - this.nextEditProvider.lastTriggerTime) < TRIGGER_INLINE_EDIT_AFTER_CHANGE_LIMIT;
	}

	/**
	 * Returns true if the same-line cooldown is active and we should skip triggering.
	 *
	 * The cooldown is bypassed when:
	 * - `triggerOnActiveEditorChange` is configured, OR
	 * - we're in a notebook cell and the current document differs from the one that
	 *   originally triggered the change (user moved to a different cell).
	 */
	private _isSameLineCooldownActive(mostRecentChange: LastChange, selectionLine: number, currentDocument: vscode.TextDocument): boolean {
		const triggerOnActiveEditorChange = this._configurationService.getExperimentBasedConfig(ConfigKey.Advanced.InlineEditsTriggerOnEditorChangeAfterSeconds, this._expService);
		if (triggerOnActiveEditorChange) {
			return false; // cooldown bypassed
		}

		// In a notebook, if the user moved to a different cell, bypass the cooldown
		if (isNotebookCell(currentDocument.uri) && currentDocument !== mostRecentChange.documentTrigger) {
			return false; // cooldown bypassed
		}

		const lastTriggerTimestampForLine = mostRecentChange.lineNumberTriggers.get(selectionLine);
		return lastTriggerTimestampForLine !== undefined
			&& (Date.now() - lastTriggerTimestampForLine) < TRIGGER_INLINE_EDIT_ON_SAME_LINE_COOLDOWN;
	}

	// #endregion

	// #region Trigger helpers

	/**
	 * Removes line triggers older than {@link TRIGGER_INLINE_EDIT_AFTER_CHANGE_LIMIT}
	 * when the map grows beyond 100 entries.
	 */
	private _cleanupStaleLineTriggers(mostRecentChange: LastChange): void {
		if (mostRecentChange.lineNumberTriggers.size <= 100) {
			return;
		}
		const now = Date.now();
		for (const [lineNumber, timestamp] of mostRecentChange.lineNumberTriggers.entries()) {
			if (now - timestamp > TRIGGER_INLINE_EDIT_AFTER_CHANGE_LIMIT) {
				mostRecentChange.lineNumberTriggers.delete(lineNumber);
			}
		}
	}

	/**
	 * Fires a selection-change trigger, applying debounce when configured.
	 *
	 * The first 2 selection changes after an edit fire immediately (the 1st is caused by
	 * the edit itself, the 2nd is the user intentionally moving to the next edit location).
	 * Subsequent changes are debounced to avoid excessive triggering during rapid navigation.
	 */
	private _triggerWithDebounce(mostRecentChange: LastChange): void {
		const debounceMs = this._configurationService.getExperimentBasedConfig(ConfigKey.TeamInternal.InlineEditsDebounceOnSelectionChange, this._expService);
		if (debounceMs === undefined) {
			this._triggerInlineEdit(NesTriggerReason.SelectionChange);
			return;
		}

		const N_ALLOWED_IMMEDIATE_SELECTION_CHANGE_EVENTS = 2;
		if (mostRecentChange.nConsecutiveSelectionChanges < N_ALLOWED_IMMEDIATE_SELECTION_CHANGE_EVENTS) {
			this._triggerInlineEdit(NesTriggerReason.SelectionChange);
		} else {
			mostRecentChange.timeout.value = createTimeout(debounceMs, () => this._triggerInlineEdit(NesTriggerReason.SelectionChange));
		}
		mostRecentChange.incrementSelectionChangeEventCount();
	}

	// #endregion

	private _maybeTriggerOnDocumentSwitch(e: vscode.TextEditorSelectionChangeEvent, isSameDoc: boolean, parentLogger: ILogger): boolean {
		const logger = parentLogger.createSubLogger('editorSwitch');
		const triggerAfterSeconds = this._configurationService.getExperimentBasedConfig(ConfigKey.Advanced.InlineEditsTriggerOnEditorChangeAfterSeconds, this._expService);
		if (triggerAfterSeconds === undefined) {
			logger.trace('document switch disabled');
			return false;
		}
		if (isSameDoc) {
			logger.trace(`Return: document switch didn't happen`);
			return false;
		}
		if (this.lastEditTimestamp === undefined) {
			logger.trace('Return: no last edit timestamp');
			return false;
		}
		const now = Date.now();
		const triggerThresholdMs = triggerAfterSeconds * 1000;
		const timeSinceLastEdit = now - this.lastEditTimestamp;
		if (timeSinceLastEdit > triggerThresholdMs) {
			logger.trace('Return: too long since last edit');
			return false;
		}

		// Require a recent NES trigger before triggering on document switch.
		// lastTriggerTime === 0 means NES was never triggered in this session.
		const timeSinceLastTrigger = now - this.nextEditProvider.lastTriggerTime;
		if (this.nextEditProvider.lastTriggerTime === 0 || timeSinceLastTrigger > triggerThresholdMs) {
			logger.trace('Return: no recent NES trigger');
			return false;
		}

		const strategy = this._configurationService.getExperimentBasedConfig(ConfigKey.TeamInternal.InlineEditsTriggerOnEditorChangeStrategy, this._expService);
		if (strategy === DocumentSwitchTriggerStrategy.AfterAcceptance && this.nextEditProvider.lastOutcome !== NesOutcome.Accepted) {
			// When the afterAcceptance strategy is active, only trigger on document switch
			// if the most recent NES was accepted. A pending outcome (undefined) is treated
			// as not-accepted to avoid racing with the UI's accept/reject/ignore callback.
			logger.trace('Return: afterAcceptance strategy requires last NES to be accepted');
			return false;
		}

		const doc = this.workspace.getDocumentByTextDocument(e.textEditor.document);
		if (!doc) { // doc is likely copilot-ignored
			logger.trace('Return: ignored document');
			return false;
		}

		const range = doc.toRange(e.textEditor.document, e.selections[0]);
		if (!range) {
			logger.trace('Return: no range');
			return false;
		}

		const selectionLine = range.start.line;

		// mark as touched such that NES gets triggered on cursor move; otherwise, user may get a single NES then move cursor and never get the suggestion back
		const lastChange = new LastChange(e.textEditor.document);
		lastChange.lineNumberTriggers.set(selectionLine, Date.now());
		this.docToLastChangeMap.set(doc.id, lastChange);

		this._triggerInlineEdit(NesTriggerReason.ActiveDocumentSwitch);
		return true;
	}

	private _triggerInlineEdit(reason: NesTriggerReason) {
		const uuid = generateUuid();
		this._logger.trace(`Triggering inline edit: ${reason}`);
		this._onChangeEmitter.fire({ data: { uuid, reason } });
	}
}
