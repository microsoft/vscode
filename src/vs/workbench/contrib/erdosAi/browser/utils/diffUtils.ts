/*
 * Copyright (C) 2024 Lotas Inc. All rights reserved.
 * Licensed under the MIT License. See LICENSE file in the project root for details.
 */

/**
 * Diff computation utilities for Erdos AI
 */

/**
 */
export interface DiffItem {
	type: 'added' | 'deleted' | 'unchanged';
	content: string;
	old_line?: number;
	new_line?: number;
	display_line?: number;
}

/**
 */
export interface DiffResult {
	diff: DiffItem[];
	added: number;
	deleted: number;
}

/**
 */
export interface DiffData extends DiffResult {
	clean_filename?: string;
	old_content?: string;
	new_content?: string;
}

/**
 */
export interface DiffEntry {
	message_id: string;
	timestamp: string;
	diff_data: DiffItem[];
	old_content?: string;
	new_content?: string;
	original_content?: string;
	filtered_diff?: DiffItem[];
	file_path?: string;
	old_string?: string;
	new_string?: string;
	flags?: {
		is_start_edit?: boolean;
		is_end_edit?: boolean;
	};
}

/**
 * Compute line-by-line diff between two arrays of lines
 */
export function computeLineDiff(oldLines: string[], newLines: string[]): DiffResult {
	if (!oldLines || oldLines.length === 0) {
		const result: DiffItem[] = newLines.map((line, i) => ({
			type: 'added',
			content: line,
			new_line: i + 1,
			old_line: undefined
		}));
		return {
			diff: result,
			added: newLines.length,
			deleted: 0
		};
	}

	if (!newLines || newLines.length === 0) {
		const result: DiffItem[] = oldLines.map((line, i) => ({
			type: 'deleted',
			content: line,
			old_line: i + 1,
			new_line: undefined
		}));
		return {
			diff: result,
			added: 0,
			deleted: oldLines.length
		};
	}

	const m = oldLines.length;
	const n = newLines.length;

	const lcs: number[][] = Array(m + 1).fill(null).map(() => Array(n + 1).fill(0));
	
	for (let i = 1; i <= m; i++) {
		for (let j = 1; j <= n; j++) {
			if (oldLines[i - 1] === newLines[j - 1]) {
				lcs[i][j] = lcs[i - 1][j - 1] + 1;
			} else {
				lcs[i][j] = Math.max(lcs[i][j - 1], lcs[i - 1][j]);
			}
		}
	}

	const diff: DiffItem[] = [];
	let i = m;
	let j = n;
	let added = 0;
	let deleted = 0;

	while (i > 0 || j > 0) {
		if (i > 0 && j > 0 && oldLines[i - 1] === newLines[j - 1]) {
			diff.unshift({
				type: 'unchanged',
				content: oldLines[i - 1],
				old_line: i,
				new_line: j
			});
			i--;
			j--;
		} else if (j > 0 && (i === 0 || lcs[i][j - 1] >= lcs[i - 1][j])) {
			diff.unshift({
				type: 'added',
				content: newLines[j - 1],
				old_line: undefined,
				new_line: j
			});
			added++;
			j--;
		} else {
			diff.unshift({
				type: 'deleted',
				content: oldLines[i - 1],
				old_line: i,
				new_line: undefined
			});
			deleted++;
			i--;
		}
	}

	return {
		diff,
		added,
		deleted
	};
}

/**
 * Filter diff for display - show only changed lines plus context
 */
export function filterDiffForDisplay(diffData: DiffItem[]): DiffItem[] {
	if (!diffData || diffData.length === 0) {
		return diffData;
	}

	let firstChangeIndex: number | null = null;
	let lastChangeIndex: number | null = null;

	for (let i = 0; i < diffData.length; i++) {
		const lineType = diffData[i].type;
		if (lineType === 'added' || lineType === 'deleted') {
			if (firstChangeIndex === null) {
				firstChangeIndex = i;
			}
			lastChangeIndex = i;
		}
	}

	if (firstChangeIndex === null || lastChangeIndex === null) {
		return diffData;
	}

	const startIndex = Math.max(0, firstChangeIndex - 1);
	const endIndex = Math.min(diffData.length - 1, lastChangeIndex + 1);

	return diffData.slice(startIndex, endIndex + 1);
}

/**
 * Reconstruct content from filtered diff
 */
export function reconstructContentFromDiff(filteredDiff: DiffItem[]): string {
	let content = '';
	
	for (const diffItem of filteredDiff) {
		if (diffItem.type !== 'deleted' && diffItem.content !== undefined) {
			content += diffItem.content + '\n';
		}
	}

	return content.replace(/\n$/, '');
}


/**
 * Create flexible whitespace pattern for search/replace
 */
export function createFlexibleWhitespacePattern(text: string): string {
	if (!text || text === '') {
		return '';
	}

	const escapedText = text.replace(/([.\\^$*+?{}[\]|()\\])/g, '\\$1');

	const lines = escapedText.split('\n');

	const flexibleLines: string[] = [];
	for (const line of lines) {
		// Remove any existing trailing whitespace and add optional whitespace pattern
		const lineTrimmed = line.replace(/[ \t]*$/, '');
		flexibleLines.push(lineTrimmed + '[ \\t]*');
	}

	return flexibleLines.join('\n');
}

/**
 * Count matches using flexible whitespace pattern
 */
export function countFlexibleMatches(content: string, searchString: string): number {
	const flexiblePattern = createFlexibleWhitespacePattern(searchString);
	const matches = content.match(new RegExp(flexiblePattern, 'g'));
	return matches ? matches.length : 0;
}

/**
 * Perform flexible replacement
 */
export function performFlexibleReplacement(content: string, oldString: string, newString: string): string {
	const flexiblePattern = createFlexibleWhitespacePattern(oldString);
	return content.replace(new RegExp(flexiblePattern, 'g'), newString);
}

/**
 * In-memory diff storage system
 */
class DiffStorage {
	private diffs: Map<string, DiffEntry> = new Map();
	private conversationManager: any = null;
	
	/**
	 * Set the conversation manager for file persistence
	 */
	setConversationManager(conversationManager: any): void {
		this.conversationManager = conversationManager;
	}

	/**
	 * Store diff data for a specific message ID
	 */
	storeDiffData(messageId: string, diffData: DiffItem[], oldContent?: string, newContent?: string, flags?: DiffEntry['flags'], filePath?: string, oldString?: string, newString?: string): boolean {
		const diffEntry: DiffEntry = {
			message_id: messageId,
			timestamp: new Date().toISOString(),
			diff_data: diffData,
			old_content: oldContent,
			new_content: newContent
		};

		if (flags) {
			diffEntry.flags = flags;
		}

		if (filePath) {
			diffEntry.file_path = filePath;
		}

		if (oldString) {
			diffEntry.old_string = oldString;
		}

		if (newString) {
			diffEntry.new_string = newString;
		}

		// Store in memory
		this.diffs.set(messageId, diffEntry);
		
		// Also persist to file immediately (like Rao does)
		this.persistDiffToFile(messageId, diffEntry);
		
		return true;
	}

	/**
	 * Persist diff data to conversation_diffs.json file (like Rao's store_diff_data)
	 */
	private async persistDiffToFile(messageId: string, diffEntry: DiffEntry): Promise<void> {
		try {
			// Read existing diffs from file
			const existingDiffs = await this.readDiffsFromFile();
			
			// Add new diff entry
			existingDiffs[messageId] = diffEntry;
			
			// Write back to file
			await this.writeDiffsToFile(existingDiffs);
			
		} catch (error) {
			console.error(`[DIFF_STORAGE] Failed to persist diff data for message ${messageId}:`, error);
		}
	}

	/**
	 * Read diffs from conversation_diffs.json file
	 */
	private async readDiffsFromFile(): Promise<Record<string, DiffEntry>> {
		if (!this.conversationManager) {
			return {};
		}

		try {
			const conversation = this.conversationManager.getCurrentConversation();
			if (!conversation) {
				return {};
			}

			const paths = this.conversationManager.getConversationPaths(conversation.info.id);
			const fileService = this.conversationManager.fileService;
			
			const { URI } = await import('../../../../../base/common/uri.js');
			const diffContent = await fileService.readFile(URI.parse(paths.conversationDiffLogPath));
			const diffsData = JSON.parse(diffContent.value.toString());
			
			return diffsData || {};
		} catch (error) {
			return {};
		}
	}

	/**
	 * Write diffs to conversation_diffs.json file
	 */
	private async writeDiffsToFile(diffs: Record<string, DiffEntry>): Promise<void> {
		if (!this.conversationManager) {
			console.error(`[DIFF_STORAGE] No conversation manager - cannot write diffs`);
			return;
		}

		try {
			const conversation = this.conversationManager.getCurrentConversation();
			if (!conversation) {
				return;
			}

			const paths = this.conversationManager.getConversationPaths(conversation.info.id);
			const fileService = this.conversationManager.fileService;
			
			const jsonContent = JSON.stringify(diffs, null, 2);
			const { URI } = await import('../../../../../base/common/uri.js');
			const { VSBuffer } = await import('../../../../../base/common/buffer.js');
			
			await fileService.writeFile(
				URI.parse(paths.conversationDiffLogPath),
				VSBuffer.fromString(jsonContent)
			);
			
		} catch (error) {
			console.error(`[DIFF_STORAGE] Failed to write diffs to file:`, error);
		}
	}

	/**
	 * Load diffs from conversation_diffs.json into memory
	 */
	async loadDiffsFromFile(): Promise<void> {
		if (!this.conversationManager) {
			return;
		}

		try {
			const diffsFromFile = await this.readDiffsFromFile();
			
			// Clear existing in-memory diffs and load from file
			this.diffs.clear();
			for (const [messageId, diffEntry] of Object.entries(diffsFromFile)) {
				this.diffs.set(messageId, diffEntry);
			}
			
		} catch (error) {
		}
	}

	/**
	 * Get full stored diff entry for a specific message ID
	 */
	getStoredDiffEntry(messageId: string): DiffEntry | null {
		return this.diffs.get(messageId) || null;
	}

	/**
	 * Get stored diff data for a specific message ID
	 */
	getStoredDiffData(messageId: string): DiffResult | null {
		const diffEntry = this.diffs.get(messageId);
		
		if (!diffEntry) {
			return null;
		}

		const cleanedDiffData = diffEntry.diff_data.map(diffItem => ({
			...diffItem,
			old_line: diffItem.old_line !== undefined ? diffItem.old_line : undefined,
			new_line: diffItem.new_line !== undefined ? diffItem.new_line : undefined
		}));

		return {
			diff: cleanedDiffData,
			...(diffEntry.flags || { is_start_edit: false, is_end_edit: false })
		} as any;
	}

	/**
	 * Get diff data for a specific message ID
	 */
	getDiffData(messageId: string): DiffEntry | null {
		return this.diffs.get(messageId) || null;
	}

	/**
	 * Remove diff data for a specific message ID
	 */
	removeDiffData(messageId: string): boolean {
		return this.diffs.delete(messageId);
	}

	/**
	 * Clear all stored diff data
	 */
	clearAllDiffs(): void {
		this.diffs.clear();
	}
}

// Export singleton instance
export const diffStorage = new DiffStorage();
