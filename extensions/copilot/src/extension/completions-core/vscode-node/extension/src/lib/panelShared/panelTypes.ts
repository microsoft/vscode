/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { CopilotNamedAnnotationList } from '../../../../../../../platform/completions-core/common/openai/copilotAnnotations';
import { RequestId } from '../../../../../../../platform/networking/common/fetch';
import { TelemetryWithExp } from '../../../../lib/src/telemetry';
import { IRange } from '../../../../lib/src/textDocument';

export interface UnformattedSolution {
	/** Raw text returned by model */
	completionText: string;
	/** Text that should be inserted into the document, replacing the text at .range */
	insertText: string;
	range: IRange;
	meanProb: number;
	meanLogProb: number;
	requestId: RequestId;
	choiceIndex: number;
	telemetryData: TelemetryWithExp;
	copilotAnnotations?: CopilotNamedAnnotationList;
	/** Optional Model ID when fetching from multiple models */
	modelId?: string;
}

export interface ISolutionHandler {
	onSolution(solution: UnformattedSolution): Promise<void> | void;
	onFinishedNormally(): Promise<void> | void;
	onFinishedWithError(error: string): Promise<void> | void;
}

/**
 * A stream of solutions, ending either with 'FinishedNormally' or 'FinishedWithError'.
 * This structure allows for errors to occur part way through the stream, as well as
 * at the beginning.
 *
 * The stream is similar to an async generator, but with more information when the stream
 * ends: instead of just `done` we can have `FinishedNormally` or `FinishedWithError`.
 */
export type SolutionsStream =
	| { status: 'FinishedNormally' }
	| { status: 'FinishedWithError'; error: string }
	| { status: 'Solution'; solution: UnformattedSolution; next: Promise<SolutionsStream> };
