/*---------------------------------------------------------------------------------------------
 *  Copyright (C) 2025 by Lotas Inc.
 *  Licensed under the AGPL-3.0 License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { createDecorator } from '../../../../platform/instantiation/common/instantiation.js';

export interface RMarkdownChunk {
    label?: string;
    start_line: number;
    end_line: number;
    code: string;
    language: string;
    options?: string;
}

export const IRMarkdownParser = createDecorator<IRMarkdownParser>('rMarkdownParser');

export interface IRMarkdownParser {
	readonly _serviceBrand: undefined;

	extractRCodeFromRmd(fileLines: string[]): string[];
	extractRmdCodeChunks(fileLines: string[]): RMarkdownChunk[];
	extractExecutableRCode(fileContent: string[], filename: string): string[];
	isRMarkdownFile(filename: string): boolean;
	getDocumentType(filename: string): string;
	hasRMarkdownChunks(content: string): boolean;
}
