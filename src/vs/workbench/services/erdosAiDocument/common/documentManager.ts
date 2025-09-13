/*---------------------------------------------------------------------------------------------
 *  Copyright (C) 2025 by Lotas Inc.
 *  Licensed under the AGPL-3.0 License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { createDecorator } from '../../../../platform/instantiation/common/instantiation.js';
import { DocumentInfo, MatchOptions, MatchResult } from './documentUtils.js';



export const IDocumentManager = createDecorator<IDocumentManager>('documentManager');

export interface IDocumentManager {
	readonly _serviceBrand: undefined;

	getAllOpenDocuments(includeContent?: boolean): Promise<DocumentInfo[]>;
	getActiveDocument(): Promise<DocumentInfo | null>;
	matchTextInOpenDocuments(searchText: string, options?: MatchOptions): Promise<MatchResult[]>;
	updateOpenDocumentContent(documentIdOrPath: string, newContent: string, markClean?: boolean): Promise<boolean>;
	getEffectiveFileContent(filePath: string, startLine?: number, endLine?: number): Promise<string | null>;
	isFileOpenInEditor(filePath: string): Promise<boolean>;
	getOpenDocumentContent(filePath: string): Promise<string | null>;
	checkPastedTextInOpenDocuments(pastedText: string): Promise<{filePath: string; startLine: number; endLine: number; content: string} | null>;
}
