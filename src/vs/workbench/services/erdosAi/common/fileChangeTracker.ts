/*---------------------------------------------------------------------------------------------
 *  Copyright (C) 2025 by Lotas Inc.
 *  Licensed under the AGPL-3.0 License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { createDecorator } from '../../../../platform/instantiation/common/instantiation.js';
import { URI } from '../../../../base/common/uri.js';

export const IFileChangeTracker = createDecorator<IFileChangeTracker>('fileChangeTracker');

export interface IFileChangeTracker {
	readonly _serviceBrand: undefined;

	initializeFileChangeTracking(conversationId: number): Promise<void>;
	getOriginalFileContent(filePath: string, conversationId: number): Promise<string | undefined>;
	computeLineDiff(oldContent: string, newContent: string): Promise<Array<{
		type: 'added' | 'deleted' | 'unchanged';
		content: string;
		oldLine: number;
		newLine: number;
	}>>;
	applyFileChangeHighlighting(uri: URI, fileChange: any): Promise<void>;
	clearAllFileHighlighting(): void;
}
