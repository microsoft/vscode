/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
var __param = (this && this.__param) || function (paramIndex, decorator) {
    return function (target, key) { decorator(target, key, paramIndex); }
};
import { onUnexpectedError } from '../../../../../base/common/errors.js';
import { Disposable } from '../../../../../base/common/lifecycle.js';
import { runOnChange } from '../../../../../base/common/observable.js';
import { AnnotatedStringEdit } from '../../../../../editor/common/core/edits/stringEdit.js';
import { EditDeltaInfo } from '../../../../../editor/common/textModelEditSource.js';
import { IInstantiationService } from '../../../../../platform/instantiation/common/instantiation.js';
import { createDocWithJustReason } from '../helpers/documentWithAnnotatedEdits.js';
import { IAiEditTelemetryService } from './aiEditTelemetry/aiEditTelemetryService.js';
import { forwardToChannelIf, isCopilotLikeExtension } from '../../../../../platform/dataChannel/browser/forwardingTelemetryService.js';
import { ProviderId } from '../../../../../editor/common/languages.js';
import { ArcTelemetryReporter } from './arcTelemetryReporter.js';
import { IRandomService } from '../randomService.js';
let EditTelemetryReportInlineEditArcSender = class EditTelemetryReportInlineEditArcSender extends Disposable {
    constructor(docWithAnnotatedEdits, scmRepoBridge, _instantiationService) {
        super();
        this._instantiationService = _instantiationService;
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
                res.telemetryService.publicLog2('editTelemetry.reportInlineEditArc', {
                    extensionId: data.$extensionId ?? '',
                    extensionVersion: data.$extensionVersion ?? '',
                    opportunityId: data.$$requestUuid ?? 'unknown',
                    languageId: data.$$languageId,
                    correlationId: data.$$correlationId,
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
                this._store.delete(reporter);
            }));
        }));
    }
};
EditTelemetryReportInlineEditArcSender = __decorate([
    __param(2, IInstantiationService)
], EditTelemetryReportInlineEditArcSender);
export { EditTelemetryReportInlineEditArcSender };
let CreateSuggestionIdForChatOrInlineChatCaller = class CreateSuggestionIdForChatOrInlineChatCaller extends Disposable {
    constructor(docWithAnnotatedEdits, _aiEditTelemetryService) {
        super();
        this._aiEditTelemetryService = _aiEditTelemetryService;
        this._register(runOnChange(docWithAnnotatedEdits.value, (_val, _prev, changes) => {
            const edit = AnnotatedStringEdit.compose(changes.map(c => c.edit));
            const supportedSource = new Set(['Chat.applyEdits', 'inlineChat.applyEdits']);
            if (!edit.replacements.some(r => supportedSource.has(r.data.editSource.metadata.source))) {
                return;
            }
            if (!edit.replacements.every(r => supportedSource.has(r.data.editSource.metadata.source))) {
                onUnexpectedError(new Error(`ArcTelemetrySender: Not all edits are ${edit.replacements[0].data.editSource.metadata.source}!`));
                return;
            }
            let applyCodeBlockSuggestionId = undefined;
            const data = edit.replacements[0].data.editSource;
            let feature;
            if (data.metadata.source === 'Chat.applyEdits') {
                feature = 'sideBarChat';
                if (data.metadata.$$mode === 'applyCodeBlock') {
                    applyCodeBlockSuggestionId = data.metadata.$$codeBlockSuggestionId;
                }
            }
            else {
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
                modeId: data.props.$$mode,
                editDeltaInfo: EditDeltaInfo.fromEdit(edit, _prev),
            });
        }));
    }
};
CreateSuggestionIdForChatOrInlineChatCaller = __decorate([
    __param(1, IAiEditTelemetryService)
], CreateSuggestionIdForChatOrInlineChatCaller);
export { CreateSuggestionIdForChatOrInlineChatCaller };
let EditTelemetryReportEditArcForChatOrInlineChatSender = class EditTelemetryReportEditArcForChatOrInlineChatSender extends Disposable {
    constructor(docWithAnnotatedEdits, scmRepoBridge, _instantiationService, _randomService) {
        super();
        this._instantiationService = _instantiationService;
        this._randomService = _randomService;
        this._register(runOnChange(docWithAnnotatedEdits.value, (_val, _prev, changes) => {
            const edit = AnnotatedStringEdit.compose(changes.map(c => c.edit));
            const supportedSource = new Set(['Chat.applyEdits', 'inlineChat.applyEdits']);
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
                res.telemetryService.publicLog2('editTelemetry.reportEditArc', {
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
                this._store.delete(reporter);
            }));
        }));
    }
};
EditTelemetryReportEditArcForChatOrInlineChatSender = __decorate([
    __param(2, IInstantiationService),
    __param(3, IRandomService)
], EditTelemetryReportEditArcForChatOrInlineChatSender);
export { EditTelemetryReportEditArcForChatOrInlineChatSender };
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiYXJjVGVsZW1ldHJ5U2VuZGVyLmpzIiwic291cmNlUm9vdCI6ImZpbGU6Ly8vaG9tZS9hL3dlYmNvZGUuaG9zdC92c2NvZGUvc3JjLyIsInNvdXJjZXMiOlsidnMvd29ya2JlbmNoL2NvbnRyaWIvZWRpdFRlbGVtZXRyeS9icm93c2VyL3RlbGVtZXRyeS9hcmNUZWxlbWV0cnlTZW5kZXIudHMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6IkFBQUE7OztnR0FHZ0c7Ozs7Ozs7Ozs7QUFFaEcsT0FBTyxFQUFFLGlCQUFpQixFQUFFLE1BQU0sc0NBQXNDLENBQUM7QUFDekUsT0FBTyxFQUFFLFVBQVUsRUFBRSxNQUFNLHlDQUF5QyxDQUFDO0FBQ3JFLE9BQU8sRUFBZSxXQUFXLEVBQUUsTUFBTSwwQ0FBMEMsQ0FBQztBQUNwRixPQUFPLEVBQUUsbUJBQW1CLEVBQUUsTUFBTSx1REFBdUQsQ0FBQztBQUM1RixPQUFPLEVBQUUsYUFBYSxFQUFrRCxNQUFNLHFEQUFxRCxDQUFDO0FBQ3BJLE9BQU8sRUFBRSxxQkFBcUIsRUFBRSxNQUFNLCtEQUErRCxDQUFDO0FBQ3RHLE9BQU8sRUFBK0MsdUJBQXVCLEVBQUUsTUFBTSwwQ0FBMEMsQ0FBQztBQUNoSSxPQUFPLEVBQUUsdUJBQXVCLEVBQUUsTUFBTSw2Q0FBNkMsQ0FBQztBQUV0RixPQUFPLEVBQUUsa0JBQWtCLEVBQUUsc0JBQXNCLEVBQUUsTUFBTSwyRUFBMkUsQ0FBQztBQUN2SSxPQUFPLEVBQUUsVUFBVSxFQUFFLE1BQU0sMkNBQTJDLENBQUM7QUFDdkUsT0FBTyxFQUFFLG9CQUFvQixFQUFFLE1BQU0sMkJBQTJCLENBQUM7QUFDakUsT0FBTyxFQUFFLGNBQWMsRUFBRSxNQUFNLHFCQUFxQixDQUFDO0FBRTlDLElBQU0sc0NBQXNDLEdBQTVDLE1BQU0sc0NBQXVDLFNBQVEsVUFBVTtJQUNyRSxZQUNDLHFCQUFrRSxFQUNsRSxhQUFzRCxFQUNkLHFCQUE0QztRQUVwRixLQUFLLEVBQUUsQ0FBQztRQUZnQywwQkFBcUIs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