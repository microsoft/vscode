/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { generateUuid } from '../../../../../../base/common/uuid.js';
import { EditSuggestionId } from '../../../../../../editor/common/textModelEditSource.js';
import { IInstantiationService } from '../../../../../../platform/instantiation/common/instantiation.js';
import { ITelemetryService } from '../../../../../../platform/telemetry/common/telemetry.js';
import { DataChannelForwardingTelemetryService } from '../forwardingTelemetryService.js';
import { IAiEditTelemetryService, IEditTelemetryCodeAcceptedData, IEditTelemetryCodeSuggestedData } from './aiEditTelemetryService.js';

export class AiEditTelemetryServiceImpl implements IAiEditTelemetryService {
	declare readonly _serviceBrand: undefined;

	private readonly _telemetryService: ITelemetryService;

	constructor(
		@IInstantiationService private readonly instantiationService: IInstantiationService
	) {
		this._telemetryService = this.instantiationService.createInstance(DataChannelForwardingTelemetryService);
	}

	public createSuggestionId(data: Omit<IEditTelemetryCodeSuggestedData, 'suggestionId'>): EditSuggestionId {
		const suggestionId = EditSuggestionId.newId();
		this._telemetryService.publicLog2<{
			eventId: string | undefined;
			suggestionId: string | undefined;

			presentation: 'codeBlock' | 'highlightedEdit' | 'inlineSuggestion' | undefined;
			feature: 'sideBarChat' | 'inlineChat' | 'inlineSuggestion' | string | undefined;

			editCharsInserted: number | undefined;
			editCharsDeleted: number | undefined;
			editLinesInserted: number | undefined;
			editLinesDeleted: number | undefined;

			modeId: 'ask' | 'edit' | 'agent' | 'custom' | 'applyCodeBlock' | undefined;
			modelId: string | undefined;

			applyCodeBlockSuggestionId: string | undefined;
			languageId: string | undefined;

		}, {
			owner: 'hediet';
			comment: 'Reports when code is suggested to the user for editing.';

			eventId: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; comment: 'Unique identifier for this event.' };
			suggestionId: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; comment: 'Unique identifier for this suggestion.' };

			presentation: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; comment: 'How the code suggestion is presented to the user.' };
			feature: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; comment: 'Where in the UI the code suggestion is shown.' };

			editCharsInserted: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; isMeasurement: true; comment: 'Number of characters inserted in the edit.' };
			editCharsDeleted: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; isMeasurement: true; comment: 'Number of characters deleted in the edit.' };
			editLinesInserted: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; isMeasurement: true; comment: 'Number of lines inserted in the edit.' };
			editLinesDeleted: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; isMeasurement: true; comment: 'Number of lines deleted in the edit.' };

			modeId: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; comment: 'The mode or type of editing session.' };
			modelId: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; comment: 'The AI model used to generate the suggestion.' };

			applyCodeBlockSuggestionId: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; comment: 'If the suggestion is for applying a code block, this is the ID of that suggestion.' };
			languageId: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; comment: 'The programming language of the code suggestion.' };

		}>('editTelemetry.codeSuggested', {
			eventId: generateUuid(),
			suggestionId: suggestionId as unknown as string,
			presentation: data.presentation,
			feature: data.feature,
			editCharsInserted: data.editDeltaInfo?.charsAdded,
			editCharsDeleted: data.editDeltaInfo?.charsRemoved,
			editLinesInserted: data.editDeltaInfo?.linesAdded,
			editLinesDeleted: data.editDeltaInfo?.linesRemoved,
			modeId: data.modeId,
			modelId: data.modelId,
			applyCodeBlockSuggestionId: data.applyCodeBlockSuggestionId as unknown as string,
			languageId: data.languageId,
		});

		return suggestionId;
	}

	public handleCodeAccepted(data: IEditTelemetryCodeAcceptedData): void {
		this._telemetryService.publicLog2<{
			eventId: string | undefined;
			suggestionId: string | undefined;

			presentation: 'codeBlock' | 'highlightedEdit' | 'inlineSuggestion' | undefined;
			feature: 'sideBarChat' | 'inlineChat' | 'inlineSuggestion' | string | undefined;

			editCharsInserted: number | undefined;
			editCharsDeleted: number | undefined;
			editLinesInserted: number | undefined;
			editLinesDeleted: number | undefined;

			modeId: 'ask' | 'edit' | 'agent' | 'custom' | 'applyCodeBlock' | undefined;
			modelId: string | undefined;

			applyCodeBlockSuggestionId: string | undefined;
			languageId: string | undefined;
			acceptanceMethod:
			| 'insertAtCursor'
			| 'insertInNewFile'
			| 'copyManual'
			| 'copyButton'
			| 'applyCodeBlock'
			| 'accept';
		}, {
			owner: 'hediet';
			comment: 'Reports when code is suggested to the user for editing.';

			eventId: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; comment: 'Unique identifier for this event.' };
			suggestionId: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; comment: 'Unique identifier for this suggestion.' };

			presentation: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; comment: 'How the code suggestion is presented to the user.' };
			feature: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; comment: 'Where in the UI the code suggestion is shown.' };

			editCharsInserted: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; isMeasurement: true; comment: 'Number of characters inserted in the edit.' };
			editCharsDeleted: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; isMeasurement: true; comment: 'Number of characters deleted in the edit.' };
			editLinesInserted: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; isMeasurement: true; comment: 'Number of lines inserted in the edit.' };
			editLinesDeleted: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; isMeasurement: true; comment: 'Number of lines deleted in the edit.' };

			modeId: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; comment: 'The mode or type of editing session.' };
			modelId: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; comment: 'The AI model used to generate the suggestion.' };

			applyCodeBlockSuggestionId: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; comment: 'If the suggestion is for applying a code block, this is the ID of that suggestion.' };
			languageId: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; comment: 'The programming language of the code suggestion.' };
			acceptanceMethod: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; comment: 'How the user accepted the code suggestion.' };

		}>('editTelemetry.codeAccepted', {
			eventId: generateUuid(),
			suggestionId: data.suggestionId as unknown as string,
			presentation: data.presentation,
			feature: data.feature,
			editCharsInserted: data.editDeltaInfo?.charsAdded,
			editCharsDeleted: data.editDeltaInfo?.charsRemoved,
			editLinesInserted: data.editDeltaInfo?.linesAdded,
			editLinesDeleted: data.editDeltaInfo?.linesRemoved,
			modeId: data.modeId,
			modelId: data.modelId,
			applyCodeBlockSuggestionId: data.applyCodeBlockSuggestionId as unknown as string,
			languageId: data.languageId,
			acceptanceMethod: data.acceptanceMethod,
		});
	}
}
