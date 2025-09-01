/*---------------------------------------------------------------------------------------------
 *  Copyright (C) 2025 by Lotas Inc.
 *  Licensed under the AGPL-3.0 License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { createDecorator } from '../../../../platform/instantiation/common/instantiation.js';

export const ISearchAnalyzer = createDecorator<ISearchAnalyzer>('searchAnalyzer');

export interface ISearchAnalyzer {
	readonly _serviceBrand: undefined;
	
	performFuzzySearchInContent(searchString: string, fileLines: string[]): Array<{similarity: number, line: number, text: string}>;
	calculateEditDistance(str1: string, str2: string): number;
	generateUniqueContexts(fileLines: string[], matchLineNums: number[]): string[];
}
