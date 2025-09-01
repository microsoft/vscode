/*---------------------------------------------------------------------------------------------
 *  Copyright (C) 2025 by Lotas Inc.
 *  Licensed under the AGPL-3.0 License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { createDecorator } from '../../../../platform/instantiation/common/instantiation.js';

export const IDocumentServiceIntegration = createDecorator<IDocumentServiceIntegration>('documentServiceIntegration');

export interface IDocumentServiceIntegration {
	readonly _serviceBrand: undefined;

	getAllOpenDocuments(includeContent?: boolean): Promise<any[]>;
	getActiveDocument(): Promise<any>;
	matchTextInOpenDocuments(searchText: string, options?: any): Promise<any[]>;
	updateOpenDocumentContent(documentIdOrPath: string, newContent: string, markClean?: boolean): Promise<boolean>;
	getEffectiveFileContent(filePath: string, startLine?: number, endLine?: number): Promise<string | null>;
	getOpenDocumentContent(filePath: string): Promise<string | null>;
	checkPastedTextInOpenDocuments(pastedText: string): Promise<{filePath: string; startLine: number; endLine: number} | null>;
}
