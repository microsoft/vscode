/*---------------------------------------------------------------------------------------------
 *  Copyright (C) 2025 by Lotas Inc.
 *  Licensed under the AGPL-3.0 License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { createDecorator } from '../../../../platform/instantiation/common/instantiation.js';

export interface DiffItem {
	type: 'added' | 'deleted' | 'unchanged';
	content: string;
	old_line?: number;
	new_line?: number;
	display_line?: number;
	cellIndex?: number;        // Which cell this line belongs to
	lineInCell?: number;       // Line number within the cell (1-based)
	cellType?: 'code' | 'markdown';  // Type of cell
}

export interface DiffResult {
	diff: DiffItem[];
	added: number;
	deleted: number;
}

export interface DiffEntry {
	message_id: string;
	timestamp: string;
	diff_data: DiffItem[];
	old_content?: string;
	new_content?: string;
	filtered_diff?: DiffItem[];
	file_path?: string;
	old_string?: string;
	new_string?: string;
	flags?: {
		is_start_edit?: boolean;
		is_end_edit?: boolean;
	};
}

export const IDiffUtils = createDecorator<IDiffUtils>('diffUtils');

export interface IDiffUtils {
	readonly _serviceBrand: undefined;

	computeLineDiff(oldLines: string[], newLines: string[]): DiffResult;
	filterDiffForDisplay(diffData: DiffItem[]): DiffItem[];
	createFlexibleWhitespacePattern(text: string): string;
	storeDiffData(messageId: string, diffData: DiffItem[], oldContent?: string, newContent?: string, flags?: DiffEntry['flags'], filePath?: string, oldString?: string, newString?: string): boolean;
	getStoredDiffEntry(messageId: string): DiffEntry | null;
	getStoredDiffData(messageId: string): DiffResult | null;
	getDiffData(messageId: string): DiffEntry | null;
	removeDiffData(messageId: string): boolean;
	clearAllDiffs(): void;
	loadDiffsFromFile(): Promise<void>;
}
