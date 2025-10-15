/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { ProviderId } from '../../../../../../editor/common/languages.js';
import { EditDeltaInfo, EditSuggestionId } from '../../../../../../editor/common/textModelEditSource.js';
import { createDecorator } from '../../../../../../platform/instantiation/common/instantiation.js';

export const IAiEditTelemetryService = createDecorator<IAiEditTelemetryService>('aiEditTelemetryService');

export interface IAiEditTelemetryService {
	readonly _serviceBrand: undefined;

	createSuggestionId(data: Omit<IEditTelemetryCodeSuggestedData, 'suggestionId'>): EditSuggestionId;

	handleCodeAccepted(data: IEditTelemetryCodeAcceptedData): void;
}

export interface IEditTelemetryBaseData {
	suggestionId: EditSuggestionId | undefined;

	presentation: 'codeBlock' | 'highlightedEdit' | 'inlineCompletion' | 'nextEditSuggestion';
	feature: 'sideBarChat' | 'inlineChat' | 'inlineSuggestion' | string | undefined;
	source: ProviderId | undefined;

	languageId: string | undefined;

	editDeltaInfo: EditDeltaInfo | undefined;

	modeId: 'ask' | 'edit' | 'agent' | 'custom' | 'applyCodeBlock' | undefined;
	applyCodeBlockSuggestionId: EditSuggestionId | undefined; // Is set if modeId is applyCodeBlock

	modelId: string | undefined; // e.g. 'gpt-4o', 'gpt-4o-mini', 'gpt-3.5-turbo'
}

export interface IEditTelemetryCodeSuggestedData extends IEditTelemetryBaseData {
}

export interface IEditTelemetryCodeAcceptedData extends IEditTelemetryBaseData {
	acceptanceMethod:
	| 'insertAtCursor'
	| 'insertInNewFile'
	| 'copyManual'
	| 'copyButton'
	| 'accept'; // clicking on 'keep' or tab for inline completions
}
