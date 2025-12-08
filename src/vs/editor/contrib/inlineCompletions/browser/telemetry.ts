/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { DataChannelForwardingTelemetryService } from '../../../../platform/dataChannel/browser/forwardingTelemetryService.js';

export function sendInlineCompletionsEndOfLifeTelemetry(dataChannel: DataChannelForwardingTelemetryService, endOfLifeSummary: InlineCompletionEndOfLifeEvent) {
	dataChannel.publicLog2<InlineCompletionEndOfLifeEvent, InlineCompletionsEndOfLifeClassification>('inlineCompletion.endOfLife', endOfLifeSummary);
}

export type InlineCompletionEndOfLifeEvent = {
	// request
	opportunityId: string;
	requestReason: string;
	editorType: string;
	languageId: string;
	typingInterval: number;
	typingIntervalCharacterCount: number;
	selectedSuggestionInfo: boolean;
	availableProviders: string;
	skuPlan: string | undefined;
	skuType: string | undefined;
	// response
	correlationId: string | undefined;
	extensionId: string;
	extensionVersion: string;
	groupId: string | undefined;
	// behavior
	shown: boolean;
	shownDuration: number | undefined;
	shownDurationUncollapsed: number | undefined;
	timeUntilShown: number | undefined;
	timeUntilProviderRequest: number | undefined;
	timeUntilProviderResponse: number | undefined;
	reason: 'accepted' | 'rejected' | 'ignored' | undefined;
	partiallyAccepted: number | undefined;
	partiallyAcceptedCountSinceOriginal: number | undefined;
	partiallyAcceptedRatioSinceOriginal: number | undefined;
	partiallyAcceptedCharactersSinceOriginal: number | undefined;
	preceeded: boolean | undefined;
	superseded: boolean | undefined;
	notShownReason: string | undefined;
	renameCreated: boolean;
	renameDuration: number | undefined;
	renameTimedOut: boolean;
	renameDroppedOtherEdits: number | undefined;
	renameDroppedRenameEdits: number | undefined;
	performanceMarkers: string | undefined;
	// rendering
	viewKind: string | undefined;
	cursorColumnDistance: number | undefined;
	cursorLineDistance: number | undefined;
	lineCountOriginal: number | undefined;
	lineCountModified: number | undefined;
	characterCountOriginal: number | undefined;
	characterCountModified: number | undefined;
	disjointReplacements: number | undefined;
	sameShapeReplacements: boolean | undefined;
	longDistanceHintVisible: boolean | undefined;
	longDistanceHintDistance: number | undefined;
	// empty
	noSuggestionReason: string | undefined;
	// shape
	editKind: string | undefined;
};

type InlineCompletionsEndOfLifeClassification = {
	owner: 'benibenj';
	comment: 'Inline completions ended. @sentToGitHub';
	opportunityId: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; comment: 'Unique identifier for an opportunity to show an inline completion or NES' };
	correlationId: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; comment: 'The correlation identifier for the inline completion' };
	extensionId: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; comment: 'The identifier for the extension that contributed the inline completion' };
	extensionVersion: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; comment: 'The version of the extension that contributed the inline completion' };
	groupId: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; comment: 'The group ID of the extension that contributed the inline completion' };
	availableProviders: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; comment: 'The list of available inline completion providers at the time of the request' };
	skuPlan: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; comment: 'The the plan the user is subscribed to' };
	skuType: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; comment: 'The sku type of the user' };
	shown: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; comment: 'Whether the inline completion was shown to the user' };
	shownDuration: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; comment: 'The duration for which the inline completion was shown' };
	shownDurationUncollapsed: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; comment: 'The duration for which the inline completion was shown without collapsing' };
	timeUntilShown: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; comment: 'The time it took for the inline completion to be shown after the request' };
	timeUntilProviderRequest: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; comment: 'The time it took for the inline completion to be requested from the provider' };
	timeUntilProviderResponse: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; comment: 'The time it took for the inline completion to be shown after the request' };
	reason: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; comment: 'The reason for the inline completion ending' };
	selectedSuggestionInfo: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; comment: 'Whether the inline completion was requested with a selected suggestion' };
	partiallyAccepted: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; comment: 'How often the inline completion was partially accepted by the user' };
	partiallyAcceptedCountSinceOriginal: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; comment: 'How often the inline completion was partially accepted since the original request' };
	partiallyAcceptedRatioSinceOriginal: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; comment: 'The percentage of characters accepted since the original request' };
	partiallyAcceptedCharactersSinceOriginal: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; comment: 'The character count accepted since the original request' };
	preceeded: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; comment: 'Whether the inline completion was preceeded by another one' };
	languageId: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; comment: 'The language ID of the document where the inline completion was shown' };
	requestReason: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; comment: 'The reason for the inline completion request' };
	typingInterval: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; comment: 'The average typing interval of the user at the moment the inline completion was requested' };
	typingIntervalCharacterCount: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; comment: 'The character count involved in the typing interval calculation' };
	renameCreated: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; comment: 'Whether a rename operation was created' };
	renameDuration: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; comment: 'The duration of the rename processor' };
	renameTimedOut: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; comment: 'Whether the rename prepare operation timed out' };
	renameDroppedOtherEdits: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; comment: 'The number of non-rename edits dropped due to rename processing' };
	renameDroppedRenameEdits: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; comment: 'The number of rename edits dropped due to rename processing' };
	superseded: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; comment: 'Whether the inline completion was superseded by another one' };
	editorType: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; comment: 'The type of the editor where the inline completion was shown' };
	viewKind: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; comment: 'The kind of the view where the inline completion was shown' };
	cursorColumnDistance: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; comment: 'The distance in columns from the cursor to the inline suggestion' };
	cursorLineDistance: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; comment: 'The distance in lines from the cursor to the inline suggestion' };
	lineCountOriginal: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; comment: 'The number of lines in the original text' };
	lineCountModified: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; comment: 'The number of lines in the modified text' };
	characterCountOriginal: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; comment: 'The number of characters in the original text' };
	characterCountModified: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; comment: 'The number of characters in the modified text' };
	disjointReplacements: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; comment: 'The number of inner replacements made by the inline completion' };
	sameShapeReplacements: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; comment: 'Whether all inner replacements are the same shape' };
	longDistanceHintVisible: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; comment: 'Whether a long distance hint was rendered' };
	longDistanceHintDistance: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; isMeasurement: true; comment: 'The distance in lines between the long distance hint and the inline edit' };
	noSuggestionReason: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; comment: 'The reason why no inline completion was provided' };
	notShownReason: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; comment: 'The reason why the inline completion was not shown' };
	performanceMarkers: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; comment: 'Performance markers for the inline completion lifecycle' };
	editKind: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; comment: 'The kind of edit made by the inline completion' };
};
