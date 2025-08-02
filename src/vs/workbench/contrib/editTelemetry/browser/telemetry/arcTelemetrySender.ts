/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { sumBy } from '../../../../../base/common/arrays.js';
import { TimeoutTimer } from '../../../../../base/common/async.js';
import { onUnexpectedError } from '../../../../../base/common/errors.js';
import { Disposable, toDisposable, DisposableStore } from '../../../../../base/common/lifecycle.js';
import { runOnChange, IObservableWithChange } from '../../../../../base/common/observable.js';
import { LineEdit } from '../../../../../editor/common/core/edits/lineEdit.js';
import { AnnotatedStringEdit, BaseStringEdit } from '../../../../../editor/common/core/edits/stringEdit.js';
import { StringText } from '../../../../../editor/common/core/text/abstractText.js';
import { IInstantiationService } from '../../../../../platform/instantiation/common/instantiation.js';
import { ITelemetryService } from '../../../../../platform/telemetry/common/telemetry.js';
import { ArcTracker } from './arcTracker.js';
import { IDocumentWithAnnotatedEdits, EditSourceData, createDocWithJustReason } from '../helpers/documentWithAnnotatedEdits.js';
import type { ScmRepoBridge } from './editSourceTrackingImpl.js';

export class InlineEditArcTelemetrySender extends Disposable {
	constructor(
		docWithAnnotatedEdits: IDocumentWithAnnotatedEdits<EditSourceData>,
		scmRepoBridge: ScmRepoBridge | undefined,
		@IInstantiationService private readonly _instantiationService: IInstantiationService
	) {
		super();

		this._register(runOnChange(docWithAnnotatedEdits.value, (_val, _prev, changes) => {
			const edit = AnnotatedStringEdit.compose(changes.map(c => c.edit));

			if (!edit.replacements.some(r => r.data.editSource.metadata.source === 'inlineCompletionAccept')) {
				return;
			}
			if (!edit.replacements.every(r => r.data.editSource.metadata.source === 'inlineCompletionAccept')) {
				onUnexpectedError(new Error('ArcTelemetrySender: Not all edits are inline completion accept edits!'));
				return;
			}
			if (edit.replacements[0].data.editSource.metadata.source !== 'inlineCompletionAccept') {
				return;
			}
			const data = edit.replacements[0].data.editSource.metadata;

			const docWithJustReason = createDocWithJustReason(docWithAnnotatedEdits, this._store);
			const reporter = this._instantiationService.createInstance(ArcTelemetryReporter, [0, 30, 120, 300, 600, 900].map(s => s * 1000), _prev, docWithJustReason, scmRepoBridge, edit, res => {
				res.telemetryService.publicLog2<{
					extensionId: string;
					extensionVersion: string;
					opportunityId: string;
					didBranchChange: number;
					timeDelayMs: number;
					arc: number;
					originalCharCount: number;
					originalLineCount: number;
					currentLineCount: number;
					originalDeletedLineCount: number;
					currentDeletedLineCount: number;
				}, {
					owner: 'hediet';
					comment: 'Reports the accepted and retained character count for an inline completion/edit.';

					extensionId: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; comment: 'The extension id (copilot or copilot-chat); which provided this inline completion.' };
					extensionVersion: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; comment: 'The version of the extension.' };
					opportunityId: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; comment: 'Unique identifier for an opportunity to show an inline completion or NES.' };

					didBranchChange: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; isMeasurement: true; comment: 'Indicates if the branch changed in the meantime. If the branch changed (value is 1); this event should probably be ignored.' };
					timeDelayMs: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; isMeasurement: true; comment: 'The time delay between the user accepting the edit and measuring the survival rate.' };
					arc: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; isMeasurement: true; comment: 'The accepted and restrained character count.' };
					originalCharCount: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; isMeasurement: true; comment: 'The original character count before any edits.' };
					originalLineCount: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; isMeasurement: true; comment: 'The original line count before any edits.' };
					currentLineCount: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; isMeasurement: true; comment: 'The current line count after edits.' };
					originalDeletedLineCount: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; isMeasurement: true; comment: 'The original deleted line count before any edits.' };
					currentDeletedLineCount: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; isMeasurement: true; comment: 'The current deleted line count after edits.' };
				}>('editTelemetry.reportInlineEditArc', {
					extensionId: data.$extensionId ?? '',
					extensionVersion: data.$extensionVersion ?? '',
					opportunityId: data.$$requestUuid ?? 'unknown',
					didBranchChange: res.didBranchChange ? 1 : 0,
					timeDelayMs: res.timeDelayMs,
					arc: res.arc,
					originalCharCount: res.originalCharCount,
					originalLineCount: res.originalLineCount,
					currentLineCount: res.currentLineCount,
					originalDeletedLineCount: res.originalDeletedLineCount,
					currentDeletedLineCount: res.currentDeletedLineCount,
				});
			});

			this._register(toDisposable(() => {
				reporter.cancel();
			}));
		}));
	}
}

export class ChatArcTelemetrySender extends Disposable {
	constructor(
		docWithAnnotatedEdits: IDocumentWithAnnotatedEdits<EditSourceData>,
		scmRepoBridge: ScmRepoBridge | undefined,
		@IInstantiationService private readonly _instantiationService: IInstantiationService
	) {
		super();

		this._register(runOnChange(docWithAnnotatedEdits.value, (_val, _prev, changes) => {
			const edit = AnnotatedStringEdit.compose(changes.map(c => c.edit));

			const supportedSource = new Set(['Chat.applyEdits']);

			if (!edit.replacements.some(r => supportedSource.has(r.data.editSource.metadata.source))) {
				return;
			}
			if (!edit.replacements.every(r => supportedSource.has(r.data.editSource.metadata.source))) {
				onUnexpectedError(new Error(`ArcTelemetrySender: Not all edits are ${edit.replacements[0].data.editSource.metadata.source}!`));
				return;
			}
			const data = edit.replacements[0].data.editSource;

			const docWithJustReason = createDocWithJustReason(docWithAnnotatedEdits, this._store);
			const reporter = this._instantiationService.createInstance(ArcTelemetryReporter, [0, 60, 300].map(s => s * 1000), _prev, docWithJustReason, scmRepoBridge, edit, res => {
				res.telemetryService.publicLog2<{
					sourceKeyCleaned: string;
					extensionId: string | undefined;
					extensionVersion: string | undefined;
					opportunityId: string | undefined;
					editSessionId: string | undefined;
					requestId: string | undefined;
					modelId: string | undefined;

					didBranchChange: number;
					timeDelayMs: number;
					arc: number;
					originalCharCount: number;

					originalLineCount: number;
					currentLineCount: number;
					originalDeletedLineCount: number;
				}, {
					owner: 'hediet';
					comment: 'Reports the accepted and retained character count for an inline completion/edit.';

					sourceKeyCleaned: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; comment: 'The key of the edit source.' };
					extensionId: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; comment: 'The extension id (copilot or copilot-chat); which provided this inline completion.' };
					extensionVersion: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; comment: 'The version of the extension.' };
					opportunityId: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; comment: 'Unique identifier for an opportunity to show an inline completion or NES.' };
					editSessionId: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; comment: 'The session id.' };
					requestId: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; comment: 'The request id.' };
					modelId: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; comment: 'The model id.' };

					didBranchChange: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; isMeasurement: true; comment: 'Indicates if the branch changed in the meantime. If the branch changed (value is 1); this event should probably be ignored.' };
					timeDelayMs: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; isMeasurement: true; comment: 'The time delay between the user accepting the edit and measuring the survival rate.' };
					arc: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; isMeasurement: true; comment: 'The accepted and restrained character count.' };
					originalCharCount: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; isMeasurement: true; comment: 'The original character count before any edits.' };
					originalLineCount: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; isMeasurement: true; comment: 'The original line count before any edits.' };
					currentLineCount: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; isMeasurement: true; comment: 'The current line count after edits.' };
					originalDeletedLineCount: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; isMeasurement: true; comment: 'The original deleted line count before any edits.' };
				}>('editTelemetry.reportEditArc', {
					sourceKeyCleaned: data.toKey(Number.MAX_SAFE_INTEGER, {
						$extensionId: false,
						$extensionVersion: false,
						$$requestUuid: false,
						$$sessionId: false,
						$$requestId: false,
						$modelId: false,
					}),
					extensionId: data.props.$extensionId,
					extensionVersion: data.props.$extensionVersion,
					opportunityId: data.props.$$requestUuid,
					editSessionId: data.props.$$sessionId,
					requestId: data.props.$$requestId,
					modelId: data.props.$modelId,

					didBranchChange: res.didBranchChange ? 1 : 0,
					timeDelayMs: res.timeDelayMs,
					arc: res.arc,
					originalCharCount: res.originalCharCount,

					originalLineCount: res.originalLineCount,
					currentLineCount: res.currentLineCount,
					originalDeletedLineCount: res.originalDeletedLineCount,
				});
			});

			this._register(toDisposable(() => {
				reporter.cancel();
			}));
		}));
	}
}


export interface EditTelemetryData {
	telemetryService: ITelemetryService;
	timeDelayMs: number;
	didBranchChange: boolean;
	arc: number;
	originalCharCount: number;

	currentLineCount: number;
	currentDeletedLineCount: number;
	originalLineCount: number;
	originalDeletedLineCount: number;
}

export class ArcTelemetryReporter {
	private readonly _store = new DisposableStore();
	private readonly _arcTracker;
	private readonly _initialBranchName: string | undefined;

	private readonly _initialLineCounts;

	constructor(
		private readonly _timesMs: number[],
		private readonly _documentValueBeforeTrackedEdit: StringText,
		private readonly _document: { value: IObservableWithChange<StringText, { edit: BaseStringEdit }> },
		// _markedEdits -> document.value
		private readonly _gitRepo: ScmRepoBridge | undefined,
		private readonly _trackedEdit: BaseStringEdit,
		private readonly _sendTelemetryEvent: (res: EditTelemetryData) => void,

		@ITelemetryService private readonly _telemetryService: ITelemetryService
	) {
		this._arcTracker = new ArcTracker(this._documentValueBeforeTrackedEdit, this._trackedEdit);

		this._store.add(runOnChange(this._document.value, (_val, _prevVal, changes) => {
			const edit = BaseStringEdit.composeOrUndefined(changes.map(c => c.edit));
			if (edit) {
				this._arcTracker.handleEdits(edit);
			}
		}));

		this._initialLineCounts = this._getLineCountInfo();

		this._initialBranchName = this._gitRepo?.headBranchNameObs.get();

		for (let i = 0; i < this._timesMs.length; i++) {
			const timeMs = this._timesMs[i];

			if (timeMs <= 0) {
				this._report(timeMs);
			} else {
				this._reportAfter(timeMs, i === this._timesMs.length - 1 ? () => {
					this._store.dispose();
				} : undefined);
			}
		}
	}

	private _getLineCountInfo(): { deletedLineCounts: number; insertedLineCounts: number } {
		const e = this._arcTracker.getTrackedEdit();
		const le = LineEdit.fromEdit(e, this._documentValueBeforeTrackedEdit);
		const deletedLineCount = sumBy(le.replacements, r => r.lineRange.length);
		const insertedLineCount = sumBy(le.getNewLineRanges(), r => r.length);
		return {
			deletedLineCounts: deletedLineCount,
			insertedLineCounts: insertedLineCount,
		};
	}

	private _reportAfter(timeoutMs: number, cb?: () => void) {
		const timer = new TimeoutTimer(() => {
			this._report(timeoutMs);
			timer.dispose();
			if (cb) {
				cb();
			}
		}, timeoutMs);
		this._store.add(timer);
	}

	private _report(timeMs: number): void {
		const currentBranch = this._gitRepo?.headBranchNameObs.get();
		const didBranchChange = currentBranch !== this._initialBranchName;
		const currentLineCounts = this._getLineCountInfo();

		this._sendTelemetryEvent({
			telemetryService: this._telemetryService,
			timeDelayMs: timeMs,
			didBranchChange,
			arc: this._arcTracker.getAcceptedRestrainedCharactersCount(),
			originalCharCount: this._arcTracker.getOriginalCharacterCount(),

			currentLineCount: currentLineCounts.insertedLineCounts,
			currentDeletedLineCount: currentLineCounts.deletedLineCounts,
			originalLineCount: this._initialLineCounts.insertedLineCounts,
			originalDeletedLineCount: this._initialLineCounts.deletedLineCounts,
		});
	}

	public cancel(): void {
		this._store.dispose();
	}
}
