/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import type { Command } from 'vscode';
import * as vscode from 'vscode';
import { DocumentId } from '../../../../platform/inlineEdits/common/dataTypes/documentId';
import { InlineEditRequestLogContext } from '../../../../platform/inlineEdits/common/inlineEditLogContext';
import { ObservableGit } from '../../../../platform/inlineEdits/common/observableGit';
import { ILogService, ILogger } from '../../../../platform/log/common/logService';
import { ErrorUtils } from '../../../../util/common/errors';
import { raceCancellation, timeout } from '../../../../util/vs/base/common/async';
import { CancellationToken } from '../../../../util/vs/base/common/cancellation';
import { BugIndicatingError } from '../../../../util/vs/base/common/errors';
import { Disposable, DisposableStore } from '../../../../util/vs/base/common/lifecycle';
import { StringReplacement } from '../../../../util/vs/editor/common/core/edits/stringEdit';
import { IInstantiationService } from '../../../../util/vs/platform/instantiation/common/instantiation';
import { INextEditProvider, NESInlineCompletionContext, NesOutcome } from '../../node/nextEditProvider';
import { DiagnosticsTelemetryBuilder } from '../../node/nextEditProviderTelemetry';
import { INextEditDisplayLocation, INextEditResult } from '../../node/nextEditResult';
import { VSCodeWorkspace } from '../parts/vscodeWorkspace';
import { DiagnosticCompletionItem } from './diagnosticsBasedCompletions/diagnosticsCompletions';
import { DiagnosticCompletionState, DiagnosticsCompletionProcessor } from './diagnosticsCompletionProcessor';

export class DiagnosticsNextEditResult implements INextEditResult {
	constructor(
		public readonly requestId: number,
		public readonly result: {
			edit: StringReplacement;
			displayLocation?: INextEditDisplayLocation;
			item: DiagnosticCompletionItem;
			action?: Command;
		} | undefined,
		public workInProgress: boolean = false
	) { }
}

export class DiagnosticsNextEditProvider extends Disposable implements INextEditProvider<DiagnosticsNextEditResult, DiagnosticsTelemetryBuilder, boolean> {
	public readonly ID = 'DiagnosticsNextEditProvider';

	private _lastRejectionTime: number = 0;
	public get lastRejectionTime(): number {
		return this._lastRejectionTime;
	}

	private _lastTriggerTime: number = 0;
	public get lastTriggerTime(): number {
		return this._lastTriggerTime;
	}

	private _lastOutcome: NesOutcome | undefined;
	public get lastOutcome(): NesOutcome | undefined {
		return this._lastOutcome;
	}

	private readonly _diagnosticsCompletionHandler: DiagnosticsCompletionProcessor;
	private _logger: ILogger;

	constructor(
		workspace: VSCodeWorkspace,
		git: ObservableGit,
		@IInstantiationService instantiationService: IInstantiationService,
		@ILogService logService: ILogService,
	) {
		super();

		this._logger = logService.createSubLogger(['NES', 'DiagnosticsNextEditProvider']);
		this._diagnosticsCompletionHandler = this._register(instantiationService.createInstance(DiagnosticsCompletionProcessor, workspace, git));
	}

	async getNextEdit(docId: DocumentId, context: NESInlineCompletionContext, logContext: InlineEditRequestLogContext, cancellationToken: CancellationToken, tb: DiagnosticsTelemetryBuilder): Promise<DiagnosticsNextEditResult> {
		this._lastTriggerTime = Date.now();
		throw new BugIndicatingError('DiagnosticsNextEditProvider does not support getNextEdit, use runUntilNextEdit instead');
	}

	async runUntilNextEdit(docId: DocumentId, context: NESInlineCompletionContext, logContext: InlineEditRequestLogContext, delayStart: number, cancellationToken: CancellationToken, tb: DiagnosticsTelemetryBuilder): Promise<DiagnosticsNextEditResult> {
		try {
			await timeout(delayStart);
			if (cancellationToken.isCancellationRequested) {
				this._logger.trace('cancellationRequested before started');
				return new DiagnosticsNextEditResult(logContext.requestId, undefined);
			}

			// Check if the last computed edit is still valid
			const initialResult = this._getResultForCurrentState(docId, logContext, tb);
			if (initialResult.result) {
				return initialResult;
			}

			const asyncResult = await raceCancellation(new Promise<DiagnosticsNextEditResult>((resolve) => {
				const disposables = new DisposableStore();
				const complete = (result: DiagnosticsNextEditResult) => {
					resolve(result);
					disposables.dispose();
				};

				disposables.add(this._diagnosticsCompletionHandler.onDidChange(() => {
					const completionResult = this._getResultForCurrentState(docId, logContext, tb);
					if (completionResult.result || !completionResult.workInProgress) {
						complete(completionResult);
					}
				}));

				disposables.add(cancellationToken.onCancellationRequested(() => {
					disposables.dispose();
				}));
			}), cancellationToken);

			return asyncResult ?? initialResult;
		} catch (error) {
			const errorMessage = `Error occurred while waiting for diagnostic edit: ${ErrorUtils.toString(ErrorUtils.fromUnknown(error))}`;
			logContext.addLog(errorMessage);
			this._logger.trace(errorMessage);
			return new DiagnosticsNextEditResult(logContext.requestId, undefined);
		} finally {
			this._logger.trace('DiagnosticsInlineCompletionProvider runUntilNextEdit complete' + (cancellationToken.isCancellationRequested ? ' (cancelled)' : ''));
		}
	}

	private _getResultForCurrentState(docId: DocumentId, logContext: InlineEditRequestLogContext, tb: DiagnosticsTelemetryBuilder): DiagnosticsNextEditResult {
		const completionResult = this._diagnosticsCompletionHandler.getCurrentState(docId);
		const telemetry = new DiagnosticsTelemetryBuilder();
		const diagnosticEditResult = this._createNextEditResult(completionResult, logContext, telemetry);
		if (diagnosticEditResult.result) {
			telemetry.populate(tb);
		}
		return diagnosticEditResult;
	}

	private _createNextEditResult(diagnosticEditResult: DiagnosticCompletionState, logContext: InlineEditRequestLogContext, tb: DiagnosticsTelemetryBuilder): DiagnosticsNextEditResult {
		const { item, telemetry } = diagnosticEditResult;

		// Diagnostics might not have updated yet since accepting a diagnostics based NES
		if (item && this._hasRecentlyBeenAccepted(item)) {
			tb.addDroppedReason(`${item.type}:recently-accepted`);
			this._logger.trace('recently accepted');
			return new DiagnosticsNextEditResult(logContext.requestId, undefined, diagnosticEditResult.workInProgress);
		}

		telemetry.droppedReasons.forEach(reason => tb.addDroppedReason(reason));
		tb.setDiagnosticRunTelemetry(telemetry);

		if (!item) {
			this._logger.trace('no diagnostic edit result');
			return new DiagnosticsNextEditResult(logContext.requestId, undefined, diagnosticEditResult.workInProgress);
		}

		tb.setType(item.type);
		logContext.setDiagnosticsResult(item.getRootedLineEdit());

		this._logger.trace(`created next edit result`);

		return new DiagnosticsNextEditResult(logContext.requestId, {
			edit: item.toOffsetEdit(),
			displayLocation: item.nextEditDisplayLocation,
			item
		}, diagnosticEditResult.workInProgress);
	}

	handleShown(suggestion: DiagnosticsNextEditResult): void { }

	handleAcceptance(docId: DocumentId, suggestion: DiagnosticsNextEditResult): void {
		const completionResult = suggestion.result;
		if (!completionResult) {
			throw new BugIndicatingError('Completion result is undefined when accepted');
		}

		this._lastAcceptedItem = { item: completionResult.item, time: Date.now() };
		this._lastOutcome = NesOutcome.Accepted;
		this._diagnosticsCompletionHandler.handleEndOfLifetime(completionResult.item, { kind: vscode.InlineCompletionEndOfLifeReasonKind.Accepted });
	}

	private _lastAcceptedItem: { item: DiagnosticCompletionItem; time: number } | undefined = undefined;
	private _hasRecentlyBeenAccepted(item: DiagnosticCompletionItem): boolean {
		if (!this._lastAcceptedItem) {
			return false;
		}

		if (Date.now() - this._lastAcceptedItem.time >= 1000) {
			return false;
		}

		return item.diagnostic.equals(this._lastAcceptedItem.item.diagnostic) || DiagnosticCompletionItem.equals(this._lastAcceptedItem.item, item);
	}

	handleRejection(docId: DocumentId, suggestion: DiagnosticsNextEditResult): void {
		this._lastRejectionTime = Date.now();
		this._lastOutcome = NesOutcome.Rejected;

		const completionResult = suggestion.result;
		if (!completionResult) {
			throw new BugIndicatingError('Completion result is undefined when rejected');
		}

		this._diagnosticsCompletionHandler.handleEndOfLifetime(completionResult.item, { kind: vscode.InlineCompletionEndOfLifeReasonKind.Rejected });
	}

	handleIgnored(docId: DocumentId, suggestion: DiagnosticsNextEditResult, supersededBy: INextEditResult | undefined): void {
		this._lastOutcome = NesOutcome.Ignored;

		const completionResult = suggestion.result;
		if (!completionResult) {
			throw new BugIndicatingError('Completion result is undefined when accepted');
		}

		const supersededByItem = supersededBy instanceof DiagnosticsNextEditResult ? supersededBy?.result?.item : undefined;

		this._diagnosticsCompletionHandler.handleEndOfLifetime(completionResult.item, {
			kind: vscode.InlineCompletionEndOfLifeReasonKind.Ignored,
			supersededBy: supersededByItem,
			userTypingDisagreed: false /* TODO: Adopt this*/
		});
	}

}
