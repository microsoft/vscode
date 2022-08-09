/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { LineRangeMapping } from 'vs/editor/common/diff/linesDiffComputer';
import { ITextModel } from 'vs/editor/common/model';

export interface IDocumentDiffProvider {
	computeDiff(original: ITextModel, modified: ITextModel, options: IDocumentDiffProviderOptions): Promise<IDocumentDiff>;
}

export interface IDocumentDiffProviderOptions {
	ignoreTrimWhitespace: boolean;
	maxComputationTime: number;
	diffAlgorithm: 'smart' | 'experimental';
}

export interface IDocumentDiff {
	readonly identical: boolean;
	readonly quitEarly: boolean;
	readonly changes: LineRangeMapping[];
}
