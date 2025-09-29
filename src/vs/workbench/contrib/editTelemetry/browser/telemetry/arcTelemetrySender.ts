/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { TimeoutTimer } from '../../../../../base/common/async.js';
import { onUnexpectedError } from '../../../../../base/common/errors.js';
import { Disposable, DisposableStore, toDisposable } from '../../../../../base/common/lifecycle.js';
import { IObservableWithChange, runOnChange } from '../../../../../base/common/observable.js';
import { generateUuid } from '../../../../../base/common/uuid.js';
import { AnnotatedStringEdit, BaseStringEdit } from '../../../../../editor/common/core/edits/stringEdit.js';
import { StringText } from '../../../../../editor/common/core/text/abstractText.js';
import { EditDeltaInfo, EditSuggestionId, ITextModelEditSourceMetadata } from '../../../../../editor/common/textModelEditSource.js';
import { IInstantiationService } from '../../../../../platform/instantiation/common/instantiation.js';
import { ITelemetryService } from '../../../../../platform/telemetry/common/telemetry.js';
import { EditSourceData, IDocumentWithAnnotatedEdits, createDocWithJustReason } from '../helpers/documentWithAnnotatedEdits.js';
import { IAiEditTelemetryService } from './aiEditTelemetry/aiEditTelemetryService.js';
import { ArcTracker } from '../../common/arcTracker.js';
import type { ScmRepoBridge } from './editSourceTrackingImpl.js';
import { forwardToChannelIf, isCopilotLikeExtension } from './forwardingTelemetryService.js';
import { ProviderId } from '../../../../../editor/common/languages.js';

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
					languageId: string;
					didBranchChange: number;
					timeDelayMs: number;

					originalCharCount: number;
					originalLineCount: number;
					originalDeletedLineCount: number;
					arc: number;
					currentLineCount: number;
					currentDeletedLineCount: number;
				}, {
					owner: 'hediet';
					comment: 'Reports the accepted and retained character count for an inline completion/edit.';

					extensionId: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; comment: 'The extension id (copilot or copilot-chat); which provided this inline completion.' };
					extensionVersion: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; comment: 'The version of the extension.' };
					opportunityId: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; comment: 'Unique identifier for an opportunity to show an inline completion or NES.' };
					languageId: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; comment: 'The language id of the document.' };

					didBranchChange: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; isMeasurement: true; comment: 'Indicates if the branch changed in the meantime. If the branch changed (value is 1); this event should probably be ignored.' };
					timeDelayMs: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; isMeasurement: true; comment: 'The time delay between the user accepting the edit and measuring the survival rate.' };

					originalCharCount: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; isMeasurement: true; comment: 'The original character count before any edits.' };
					originalLineCount: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; isMeasurement: true; comment: 'The original line count before any edits.' };
					originalDeletedLineCount: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; isMeasurement: true; comment: 'The original deleted line count before any edits.' };
					arc: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; isMeasurement: true; comment: 'The accepted and restrained character count.' };
					currentLineCount: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; isMeasurement: true; comment: 'The current line count after edits.' };
					currentDeletedLineCount: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; isMeasurement: true; comment: 'The current deleted line count after edits.' };
				}>('editTelemetry.reportInlineEditArc', {
					extensionId: data.$extensionId ?? '',
					extensionVersion: data.$extensionVersion ?? '',
					opportunityId: data.$$requestUuid ?? 'unknown',
					languageId: data.$$languageId,
					didBranchChange: res.didBranchChange ? 1 : 0,
					timeDelayMs: res.timeDelayMs,

					originalCharCount: res.originalCharCount,
					originalLineCount: res.originalLineCount,
					originalDeletedLineCount: res.originalDeletedLineCount,
					arc: res.arc,
					currentLineCount: res.currentLineCount,
					currentDeletedLineCount: res.currentDeletedLineCount,

					...forwardToChannelIf(isCopilotLikeExtension(data.$extensionId)),
				});
			});

			this._register(toDisposable(() => {
				reporter.cancel();
			}));
		}));
	}
}

export class AiEditTelemetryAdapter extends Disposable {
	constructor(
		docWithAnnotatedEdits: IDocumentWithAnnotatedEdits<EditSourceData>,
		@IAiEditTelemetryService private readonly _aiEditTelemetryService: IAiEditTelemetryService,
	) {
		super();

		this._register(runOnChange(docWithAnnotatedEdits.value, (_val, _prev, changes) => {
			const edit = AnnotatedStringEdit.compose(changes.map(c => c.edit));

			const supportedSource = new Set(['Chat.applyEdits', 'inlineChat.applyEdits'] as ITextModelEditSourceMetadata['source'][]);

			if (!edit.replacements.some(r => supportedSource.has(r.data.editSource.metadata.source))) {
				return;
			}
			if (!edit.replacements.every(r => supportedSource.has(r.data.editSource.metadata.source))) {
				onUnexpectedError(new Error(`ArcTelemetrySender: Not all edits are ${edit.replacements[0].data.editSource.metadata.source}!`));
				return;
			}
			let applyCodeBlockSuggestionId: EditSuggestionId | undefined = undefined;
			const data = edit.replacements[0].data.editSource;
			let feature: 'inlineChat' | 'sideBarChat';
			if (data.metadata.source === 'Chat.applyEdits') {
				feature = 'sideBarChat';
				if (data.metadata.$$mode === 'applyCodeBlock') {
					applyCodeBlockSuggestionId = data.metadata.$$codeBlockSuggestionId;
				}
			} else {
				feature = 'inlineChat';
			}

			const providerId = new ProviderId(data.props.$extensionId, data.props.$extensionVersion, data.props.$providerId);

			// TODO@hediet tie this suggestion id to hunks, so acceptance can be correlated.
			this._aiEditTelemetryService.createSuggestionId({
				applyCodeBlockSuggestionId,
				languageId: data.props.$$languageId,
				presentation: 'highlightedEdit',
				feature,
				source: providerId,
				modelId: data.props.$modelId,
				modeId: data.props.$$mode as any,
				editDeltaInfo: EditDeltaInfo.fromEdit(edit, _prev),
			});
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

			const supportedSource = new Set(['Chat.applyEdits', 'inlineChat.applyEdits'] as ITextModelEditSourceMetadata['source'][]);

			if (!edit.replacements.some(r => supportedSource.has(r.data.editSource.metadata.source))) {
				return;
			}
			if (!edit.replacements.every(r => supportedSource.has(r.data.editSource.metadata.source))) {
				onUnexpectedError(new Error(`ArcTelemetrySender: Not all edits are ${edit.replacements[0].data.editSource.metadata.source}!`));
				return;
			}
			const data = edit.replacements[0].data.editSource;

			const uniqueEditId = generateUuid();

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
					languageId: string | undefined;
					mode: string | undefined;
					uniqueEditId: string | undefined;

					didBranchChange: number;
					timeDelayMs: number;

					originalCharCount: number;
					originalLineCount: number;
					originalDeletedLineCount: number;
					arc: number;
					currentLineCount: number;
					currentDeletedLineCount: number;
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
					languageId: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; comment: 'The language id of the document.' };
					mode: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; comment: 'The mode chat was in.' };
					uniqueEditId: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; comment: 'The unique identifier for the edit.' };

					didBranchChange: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; isMeasurement: true; comment: 'Indicates if the branch changed in the meantime. If the branch changed (value is 1); this event should probably be ignored.' };
					timeDelayMs: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; isMeasurement: true; comment: 'The time delay between the user accepting the edit and measuring the survival rate.' };

					originalCharCount: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; isMeasurement: true; comment: 'The original character count before any edits.' };
					originalLineCount: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; isMeasurement: true; comment: 'The original line count before any edits.' };
					originalDeletedLineCount: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; isMeasurement: true; comment: 'The original deleted line count before any edits.' };
					arc: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; isMeasurement: true; comment: 'The accepted and restrained character count.' };
					currentLineCount: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; isMeasurement: true; comment: 'The current line count after edits.' };
					currentDeletedLineCount: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; isMeasurement: true; comment: 'The current deleted line count after edits.' };
				}>('editTelemetry.reportEditArc', {
					sourceKeyCleaned: data.toKey(Number.MAX_SAFE_INTEGER, {
						$extensionId: false,
						$extensionVersion: false,
						$$requestUuid: false,
						$$sessionId: false,
						$$requestId: false,
						$$languageId: false,
						$modelId: false,
					}),
					extensionId: data.props.$extensionId,
					extensionVersion: data.props.$extensionVersion,
					opportunityId: data.props.$$requestUuid,
					editSessionId: data.props.$$sessionId,
					requestId: data.props.$$requestId,
					modelId: data.props.$modelId,
					languageId: data.props.$$languageId,
					mode: data.props.$$mode,
					uniqueEditId,

					didBranchChange: res.didBranchChange ? 1 : 0,
					timeDelayMs: res.timeDelayMs,

					originalCharCount: res.originalCharCount,
					originalLineCount: res.originalLineCount,
					originalDeletedLineCount: res.originalDeletedLineCount,
					arc: res.arc,
					currentLineCount: res.currentLineCount,
					currentDeletedLineCount: res.currentDeletedLineCount,

					...forwardToChannelIf(isCopilotLikeExtension(data.props.$extensionId)),
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

		this._initialLineCounts = this._arcTracker.getLineCountInfo();

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
		const currentLineCounts = this._arcTracker.getLineCountInfo();

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
