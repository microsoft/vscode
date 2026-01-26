/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { EditSuggestionId } from '../../../../../../editor/common/textModelEditSource.js';
import { IInstantiationService } from '../../../../../../platform/instantiation/common/instantiation.js';
import { ITelemetryService } from '../../../../../../platform/telemetry/common/telemetry.js';
import { TelemetryTrustedValue } from '../../../../../../platform/telemetry/common/telemetryUtils.js';
import { DataChannelForwardingTelemetryService, forwardToChannelIf, isCopilotLikeExtension } from '../../../../../../platform/dataChannel/browser/forwardingTelemetryService.js';
import { IAiEditTelemetryService, IEditTelemetryCodeAcceptedData, IEditTelemetryCodeSuggestedData } from './aiEditTelemetryService.js';
import { IRandomService } from '../../randomService.js';

export class AiEditTelemetryServiceImpl implements IAiEditTelemetryService {
	declare readonly _serviceBrand: undefined;

	private readonly _telemetryService: ITelemetryService;

	constructor(
		@IInstantiationService private readonly instantiationService: IInstantiationService,
		@IRandomService private readonly _randomService: IRandomService,
	) {
		this._telemetryService = this.instantiationService.createInstance(DataChannelForwardingTelemetryService);
	}

	public createSuggestionId(data: Omit<IEditTelemetryCodeSuggestedData, 'suggestionId'>): EditSuggestionId {
		const suggestionId = EditSuggestionId.newId(ns => this._randomService.generatePrefixedUuid(ns));
		this._telemetryService.publicLog2<{
			eventId: string | undefined;
			suggestionId: string | undefined;

			presentation: 'codeBlock' | 'highlightedEdit' | 'inlineCompletion' | 'nextEditSuggestion' | undefined;
			feature: 'sideBarChat' | 'inlineChat' | 'inlineSuggestion' | string | undefined;

			sourceExtensionId: string | undefined;
			sourceExtensionVersion: string | undefined;
			sourceProviderId: string | undefined;

			languageId: string | undefined;
			editCharsInserted: number | undefined;
			editCharsDeleted: number | undefined;
			editLinesInserted: number | undefined;
			editLinesDeleted: number | undefined;

			modeId: 'ask' | 'edit' | 'agent' | 'custom' | 'applyCodeBlock' | undefined;
			modelId: TelemetryTrustedValue<string | undefined>;
			applyCodeBlockSuggestionId: string | undefined;
		}, {
			owner: 'hediet';
			comment: 'Reports when code from AI is suggested to the user. @sentToGitHub';

			eventId: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; comment: 'Unique identifier for this event.' };
			suggestionId: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; comment: 'Unique identifier for this suggestion. Not always set.' };

			presentation: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; comment: 'How the code suggestion is presented to the user. See #IEditTelemetryBaseData.presentation for possible values.' };
			feature: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; comment: 'The feature the code suggestion came from. See #IEditTelemetryBaseData.feature for possible values.' };

			sourceExtensionId: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; comment: 'The extension that provided the code suggestion, if any.' };
			sourceExtensionVersion: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; comment: 'The version of the extension that provided the code suggestion, if any.' };
			sourceProviderId: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; comment: 'The provider ID of the source that provided the code suggestion, if any.' };

			languageId: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; comment: 'The programming language of the code suggestion.' };
			editCharsInserted: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; isMeasurement: true; comment: 'Number of characters inserted in the edit.' };
			editCharsDeleted: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; isMeasurement: true; comment: 'Number of characters deleted in the edit.' };
			editLinesInserted: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; isMeasurement: true; comment: 'Number of lines inserted in the edit.' };
			editLinesDeleted: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; isMeasurement: true; comment: 'Number of lines deleted in the edit.' };

			modeId: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; comment: 'The mode. See #IEditTelemetryBaseData.modeId for possible values.' };
			modelId: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; comment: 'The AI model used to generate the suggestion.' };
			applyCodeBlockSuggestionId: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; comment: 'If this suggestion is for applying a suggested code block, this is the id of the suggested code block.' };
		}>('editTelemetry.codeSuggested', {
			eventId: this._randomService.generatePrefixedUuid('evt'),
			suggestionId: suggestionId as unknown as string,
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
			modelId: new TelemetryTrustedValue(data.modelId),
			applyCodeBlockSuggestionId: data.applyCodeBlockSuggestionId as unknown as string,

			...forwardToChannelIf(isCopilotLikeExtension(data.source?.extensionId)),
		});

		return suggestionId;
	}

	public handleCodeAccepted(data: IEditTelemetryCodeAcceptedData): void {
		this._telemetryService.publicLog2<{
			eventId: string | undefined;
			suggestionId: string | undefined;

			presentation: 'codeBlock' | 'highlightedEdit' | 'inlineCompletion' | 'nextEditSuggestion' | undefined;
			feature: 'sideBarChat' | 'inlineChat' | 'inlineSuggestion' | string | undefined;

			sourceExtensionId: string | undefined;
			sourceExtensionVersion: string | undefined;
			sourceProviderId: string | undefined;


			languageId: string | undefined;
			editCharsInserted: number | undefined;
			editCharsDeleted: number | undefined;
			editLinesInserted: number | undefined;
			editLinesDeleted: number | undefined;

			modeId: 'ask' | 'edit' | 'agent' | 'custom' | 'applyCodeBlock' | undefined;
			modelId: TelemetryTrustedValue<string | undefined>;
			applyCodeBlockSuggestionId: string | undefined;

			acceptanceMethod:
			| 'insertAtCursor'
			| 'insertInNewFile'
			| 'copyManual'
			| 'copyButton'
			| 'applyCodeBlock'
			| 'accept';
		}, {
			owner: 'hediet';
			comment: 'Reports when code from AI is accepted by the user. @sentToGitHub';

			eventId: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; comment: 'Unique identifier for this event.' };
			suggestionId: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; comment: 'Unique identifier for this suggestion. Not always set.' };

			presentation: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; comment: 'How the code suggestion is presented to the user. See #IEditTelemetryBaseData.presentation for possible values.' };
			feature: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; comment: 'The feature the code suggestion came from. See #IEditTelemetryBaseData.feature for possible values.' };

			sourceExtensionId: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; comment: 'The extension that provided the code suggestion, if any.' };
			sourceExtensionVersion: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; comment: 'The version of the extension that provided the code suggestion, if any.' };
			sourceProviderId: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; comment: 'The provider ID of the source that provided the code suggestion, if any.' };

			languageId: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; comment: 'The programming language of the code suggestion.' };
			editCharsInserted: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; isMeasurement: true; comment: 'Number of characters inserted in the edit.' };
			editCharsDeleted: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; isMeasurement: true; comment: 'Number of characters deleted in the edit.' };
			editLinesInserted: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; isMeasurement: true; comment: 'Number of lines inserted in the edit.' };
			editLinesDeleted: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; isMeasurement: true; comment: 'Number of lines deleted in the edit.' };

			modeId: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; comment: 'The mode. See #IEditTelemetryBaseData.modeId for possible values.' };
			modelId: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; comment: 'The AI model used to generate the suggestion.' };

			applyCodeBlockSuggestionId: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; comment: 'If this suggestion is for applying a suggested code block, this is the id of the suggested code block.' };
			acceptanceMethod: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; comment: 'How the user accepted the code suggestion. See #IEditTelemetryCodeAcceptedData.acceptanceMethod for possible values.' };
		}>('editTelemetry.codeAccepted', {
			eventId: this._randomService.generatePrefixedUuid('evt'),
			suggestionId: data.suggestionId as unknown as string,
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
			modelId: new TelemetryTrustedValue(data.modelId),
			applyCodeBlockSuggestionId: data.applyCodeBlockSuggestionId as unknown as string,
			acceptanceMethod: data.acceptanceMethod,

			...forwardToChannelIf(isCopilotLikeExtension(data.source?.extensionId)),
		});
	}
}
