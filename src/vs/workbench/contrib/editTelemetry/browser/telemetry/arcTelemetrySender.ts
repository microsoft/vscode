/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { onUnexpectedError } from '../../../../../base/common/errors.js';
import { Disposable } from '../../../../../base/common/lifecycle.js';
import { IObservable, runOnChange } from '../../../../../base/common/observable.js';
import { AnnotatedStringEdit } from '../../../../../editor/common/core/edits/stringEdit.js';
import { EditDeltaInfo, EditSuggestionId, ITextModelEditSourceMetadata } from '../../../../../editor/common/textModelEditSource.js';
import { IInstantiationService } from '../../../../../platform/instantiation/common/instantiation.js';
import { EditSourceData, IDocumentWithAnnotatedEdits, createDocWithJustReason } from '../helpers/documentWithAnnotatedEdits.js';
import { IAiEditTelemetryService } from './aiEditTelemetry/aiEditTelemetryService.js';
import type { ScmRepoAdapter } from './scmAdapter.js';
import { forwardToChannelIf, isCopilotLikeExtension } from '../../../../../platform/dataChannel/browser/forwardingTelemetryService.js';
import { ProviderId } from '../../../../../editor/common/languages.js';
import { ArcTelemetryReporter } from './arcTelemetryReporter.js';
import { IRandomService } from '../randomService.js';

export class EditTelemetryReportInlineEditArcSender extends Disposable {
	constructor(
		docWithAnnotatedEdits: IDocumentWithAnnotatedEdits<EditSourceData>,
		scmRepoBridge: IObservable<ScmRepoAdapter | undefined>,
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
			const reporter = this._store.add(this._instantiationService.createInstance(ArcTelemetryReporter, [0, 30, 120, 300, 600, 900].map(s => s * 1000), _prev, docWithJustReason, scmRepoBridge, edit, res => {
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
					comment: 'Reports for each accepted inline suggestion (= inline completions + next edit suggestions) the accumulated retained character count after a certain time delay. This event is sent 0s, 30s, 120s, 300s, 600s and 900s after acceptance. @sentToGitHub';

					extensionId: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; comment: 'The extension id which provided this inline suggestion.' };
					extensionVersion: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; comment: 'The version of the extension.' };
					opportunityId: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; comment: 'Unique identifier for an opportunity to show an inline suggestion.' };
					languageId: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; comment: 'The language id of the document.' };

					didBranchChange: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; isMeasurement: true; comment: 'Indicates if the branch changed in the meantime. If the branch changed (value is 1); this event should probably be ignored.' };
					timeDelayMs: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; isMeasurement: true; comment: 'The time delay between the user accepting the edit and measuring the survival rate.' };

					originalCharCount: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; isMeasurement: true; comment: 'The original character count before any edits.' };
					originalLineCount: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; isMeasurement: true; comment: 'The original line count before any edits.' };
					originalDeletedLineCount: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; isMeasurement: true; comment: 'The original deleted line count before any edits.' };
					arc: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; isMeasurement: true; comment: 'The accepted and retained character count.' };
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
			}, () => {
				this._store.deleteAndLeak(reporter);
			}));
		}));
	}
}

export class CreateSuggestionIdForChatOrInlineChatCaller extends Disposable {
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
				// eslint-disable-next-line local/code-no-any-casts
				modeId: data.props.$$mode as any,
				editDeltaInfo: EditDeltaInfo.fromEdit(edit, _prev),
			});
		}));
	}
}

export class EditTelemetryReportEditArcForChatOrInlineChatSender extends Disposable {
	constructor(
		docWithAnnotatedEdits: IDocumentWithAnnotatedEdits<EditSourceData>,
		scmRepoBridge: IObservable<ScmRepoAdapter | undefined>,
		@IInstantiationService private readonly _instantiationService: IInstantiationService,
		@IRandomService private readonly _randomService: IRandomService,
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

			const uniqueEditId = this._randomService.generateUuid();

			const docWithJustReason = createDocWithJustReason(docWithAnnotatedEdits, this._store);
			const reporter = this._store.add(this._instantiationService.createInstance(ArcTelemetryReporter, [0, 60, 300].map(s => s * 1000), _prev, docWithJustReason, scmRepoBridge, edit, res => {
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
					comment: 'Reports the accepted and retained character count for an inline completion/edit. @sentToGitHub';

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
			}, () => {
				this._store.deleteAndLeak(reporter);
			}));
		}));
	}
}
