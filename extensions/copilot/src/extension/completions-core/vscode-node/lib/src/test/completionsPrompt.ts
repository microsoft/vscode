/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { CancellationTokenSource, Position } from 'vscode-languageserver-protocol';
import { ServicesAccessor } from '../../../../../../util/vs/platform/instantiation/common/instantiation';
import {
	CompletionRequestData,
	CompletionRequestDocument,
} from '../prompt/completionsPromptFactory/componentsCompletionsPromptFactory';
import { CodeSnippetWithId, TraitWithId } from '../prompt/contextProviders/contextItemSchemas';
import { TelemetryWithExp } from '../telemetry';

export function createCompletionRequestData(
	accessor: ServicesAccessor,
	doc: CompletionRequestDocument,
	position: Position,
	codeSnippets?: CodeSnippetWithId[],
	traits?: TraitWithId[],
	turnOffSimilarFiles?: boolean,
	suffixMatchThreshold?: number,
	maxPromptLength?: number
): CompletionRequestData {
	return {
		document: doc,
		position,
		telemetryData: TelemetryWithExp.createEmptyConfigForTesting(),
		cancellationToken: new CancellationTokenSource().token,
		codeSnippets,
		traits,
		turnOffSimilarFiles,
		suffixMatchThreshold,
		maxPromptTokens: maxPromptLength ?? 1000,
	};
}
