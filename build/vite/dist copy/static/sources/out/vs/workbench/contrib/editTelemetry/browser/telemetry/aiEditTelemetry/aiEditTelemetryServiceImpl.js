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
import { EditSuggestionId } from '../../../../../../editor/common/textModelEditSource.js';
import { IInstantiationService } from '../../../../../../platform/instantiation/common/instantiation.js';
import { DataChannelForwardingTelemetryService, forwardToChannelIf, isCopilotLikeExtension } from '../../../../../../platform/dataChannel/browser/forwardingTelemetryService.js';
import { IRandomService } from '../../randomService.js';
let AiEditTelemetryServiceImpl = class AiEditTelemetryServiceImpl {
    constructor(instantiationService, _randomService) {
        this.instantiationService = instantiationService;
        this._randomService = _randomService;
        this._telemetryService = this.instantiationService.createInstance(DataChannelForwardingTelemetryService);
    }
    createSuggestionId(data) {
        const suggestionId = EditSuggestionId.newId(ns => this._randomService.generatePrefixedUuid(ns));
        this._telemetryService.publicLog2('editTelemetry.codeSuggested', {
            eventId: this._randomService.generatePrefixedUuid('evt'),
            suggestionId: suggestionId,
            presentation: data.presentation,
            feature: data.feature,
            sourceExtensionId: data.source?.extensionId,
            sourceExtensionVersion: data.source?.extensionVersion,
            sourceProviderId: data.source?.providerId,
            languageId: data.languageId,
            editCharsInserted: data.editDeltaInfo?.charsAdded,
            editCharsDeleted: data.editDeltaInfo?.charsRemoved,
            editLinesInserted: data.editDeltaInfo?.linesAdded,
            editLinesDeleted: data.editDeltaInfo?.linesRemoved,
            modeId: data.modeId,
            modelId: data.modelId?.replace(/[\/\\]/g, '_'),
            applyCodeBlockSuggestionId: data.applyCodeBlockSuggestionId,
            ...forwardToChannelIf(isCopilotLikeExtension(data.source?.extensionId)),
        });
        return suggestionId;
    }
    handleCodeAccepted(data) {
        this._telemetryService.publicLog2('editTelemetry.codeAccepted', {
            eventId: this._randomService.generatePrefixedUuid('evt'),
            suggestionId: data.suggestionId,
            presentation: data.presentation,
            feature: data.feature,
            sourceExtensionId: data.source?.extensionId,
            sourceExtensionVersion: data.source?.extensionVersion,
            sourceProviderId: data.source?.providerId,
            languageId: data.languageId,
            editCharsInserted: data.editDeltaInfo?.charsAdded,
            editCharsDeleted: data.editDeltaInfo?.charsRemoved,
            editLinesInserted: data.editDeltaInfo?.linesAdded,
            editLinesDeleted: data.editDeltaInfo?.linesRemoved,
            modeId: data.modeId,
            modelId: data.modelId?.replace(/[\/\\]/g, '_'),
            applyCodeBlockSuggestionId: data.applyCodeBlockSuggestionId,
            acceptanceMethod: data.acceptanceMethod,
            ...forwardToChannelIf(isCopilotLikeExtension(data.source?.extensionId)),
        });
    }
};
AiEditTelemetryServiceImpl = __decorate([
    __param(0, IInstantiationService),
    __param(1, IRandomService)
], AiEditTelemetryServiceImpl);
export { AiEditTelemetryServiceImpl };
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiYWlFZGl0VGVsZW1ldHJ5U2VydmljZUltcGwuanMiLCJzb3VyY2VSb290IjoiZmlsZTovLy9ob21lL2Evd2ViY29kZS5ob3N0L3ZzY29kZS9zcmMvIiwic291cmNlcyI6WyJ2cy93b3JrYmVuY2gvY29udHJpYi9lZGl0VGVsZW1ldHJ5L2Jyb3dzZXIvdGVsZW1ldHJ5L2FpRWRpdFRlbGVtZXRyeS9haUVkaXRUZWxlbWV0cnlTZXJ2aWNlSW1wbC50cyJdLCJuYW1lcyI6W10sIm1hcHBpbmdzIjoiQUFBQTs7O2dHQUdnRzs7Ozs7Ozs7OztBQUVoRyxPQUFPLEVBQUUsZ0JBQWdCLEVBQUUsTUFBTSx3REFBd0QsQ0FBQztBQUMxRixPQUFPLEVBQUUscUJBQXFCLEVBQUUsTUFBTSxrRUFBa0UsQ0FBQztBQUV6RyxPQUFPLEVBQUUscUNBQXFDLEVBQUUsa0JBQWtCLEVBQUUsc0JBQXNCLEVBQUUsTUFBTSw4RUFBOEUsQ0FBQztBQUVqTCxPQUFPLEVBQUUsY0FBYyxFQUFFLE1BQU0sd0JBQXdCLENBQUM7QUFFakQsSUFBTSwwQkFBMEIsR0FBaEMsTUFBTSwwQkFBMEI7SUFLdEMsWUFDeUMsb0JBQTJDLEVBQ2xELGNBQThCO1FBRHZCLHlCQUFvQixHQUFwQixvQkFBb0IsQ0FBdUI7UUFDbEQsbUJBQWMsR0FBZCxjQUFjLENBQWdCO1FBRS9ELElBQUksQ0FBQyxpQkFBaUIsR0FBRyxJQUFJLENBQUMsb0JBQW9CLENBQUMsY0FBYyxDQUFDLHFDQUFxQyxDQUFDLENBQUM7SUFDMUcsQ0FBQztJQUVNLGtCQUFrQixDQUFDLElBQTJEO1FBQ3BGLE1BQU0sWUFBWSxHQUFHLGdCQUFnQixDQUFDLEtBQUssQ0FBQyxFQUFFLENBQUMsRUFBRSxDQUFDLElBQUksQ0FBQyxjQUFjLENBQUMsb0JBQW9CLENBQUMsRUFBRSxDQUFDLENBQUMsQ0FBQztRQUNoRyxJQUFJLENBQUMsaUJBQWlCLENBQUMsVUFBVSxDQTJDOUIsNkJBQTZCLEVBQUU7WUFDakMsT0FBTyxFQUFFLElBQUksQ0FBQyxj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