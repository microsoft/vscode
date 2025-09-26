/*---------------------------------------------------------------------------------------------
 *  Copyright (c) 2025 Lotas Inc. All rights reserved.
 *--------------------------------------------------------------------------------------------*/

import { DiffItem, DiffResult, DiffEntry } from '../common/diffUtils.js';
import { reads } from '../../erdosAiIntegration/browser/jupytext/jupytext.js';

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

	const filteredItems = diffData.slice(startIndex, endIndex + 1).map(item => {
		const baseItem = { ...item };
		
		// Preserve enhanced notebook properties if they exist
		if ((item as any).cellIndex !== undefined) {
			(baseItem as any).cellIndex = (item as any).cellIndex;
			(baseItem as any).lineInCell = (item as any).lineInCell;
			(baseItem as any).cellType = (item as any).cellType;
		}
		
		return baseItem;
	});

	return filteredItems;
}



export function createFlexibleWhitespacePattern(text: string): string {
	if (!text || text === '') {
		return '';
	}

	const escapedText = text.replace(/([.\\^$*+?{}[\]|()\\])/g, '\\$1');

	const lines = escapedText.split('\n');

	const flexibleLines: string[] = [];
	for (const line of lines) {
		const lineTrimmed = line.replace(/[ \t]*$/, '');
		flexibleLines.push(lineTrimmed + '[ \\t]*');
	}

	return flexibleLines.join('\n');
}

class DiffStorage {
	private diffs: Map<string, DiffEntry> = new Map();
	private conversationManager: any = null;
	
	setConversationManager(conversationManager: any): void {
		this.conversationManager = conversationManager;
	}

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

		this.diffs.set(messageId, diffEntry);
		
		this.persistDiffToFile(messageId, diffEntry);
		
		return true;
	}

	private async persistDiffToFile(messageId: string, diffEntry: DiffEntry): Promise<void> {
		try {
			const existingDiffs = await this.readDiffsFromFile();
			
			existingDiffs[messageId] = diffEntry;
			
			await this.writeDiffsToFile(existingDiffs);
			
		} catch (error) {
			console.error(`Failed to persist diff data for message ${messageId}:`, error);
		}
	}

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
			
			const { URI } = await import('../../../../base/common/uri.js');
			const diffContent = await fileService.readFile(URI.parse(paths.conversationDiffLogPath));
			const diffsData = JSON.parse(diffContent.value.toString());
			
			return diffsData || {};
		} catch (error) {
			return {};
		}
	}

	private async writeDiffsToFile(diffs: Record<string, DiffEntry>): Promise<void> {
		if (!this.conversationManager) {
			console.error(`No conversation manager - cannot write diffs`);
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
			const { URI } = await import('../../../../base/common/uri.js');
			const { VSBuffer } = await import('../../../../base/common/buffer.js');
			
			await fileService.writeFile(
				URI.parse(paths.conversationDiffLogPath),
				VSBuffer.fromString(jsonContent)
			);
			
		} catch (error) {
			console.error(`Failed to write diffs to file:`, error);
		}
	}

	async loadDiffsFromFile(): Promise<void> {
		if (!this.conversationManager) {
			return;
		}

		try {
			const diffsFromFile = await this.readDiffsFromFile();
			
			this.diffs.clear();
			for (const [messageId, diffEntry] of Object.entries(diffsFromFile)) {
				this.diffs.set(messageId, diffEntry);
			}
		} catch (error) {
			console.error(`Error loading diffs from file:`, error);
		}
	}

	getStoredDiffEntry(messageId: string): DiffEntry | null {
		return this.diffs.get(messageId) || null;
	}

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

	getDiffData(messageId: string): DiffEntry | null {
		return this.diffs.get(messageId) || null;
	}

	removeDiffData(messageId: string): boolean {
		return this.diffs.delete(messageId);
	}

	clearAllDiffs(): void {
		this.diffs.clear();
	}

	/**
	 * Notebook-specific diff computation using file_changes algorithm
	 */
	async storeNotebookDiff(
		oldString: string, 
		newString: string, 
		messageId: string, 
		filePath: string,
		effectiveContent: string,  // The full old Jupytext content
		replaceAll: boolean = false  // Whether to replace all occurrences
	): Promise<void> {
		try {
			// 1. Full old Jupytext content (already have this)
			const fullOldJupytext = effectiveContent;
			
			// 2. Full new Jupytext content (simulate the replacement)
			const flexiblePattern = createFlexibleWhitespacePattern(oldString);
			const fullNewJupytext = replaceAll ? 
				effectiveContent.replace(new RegExp(flexiblePattern, 'g'), newString) :
				effectiveContent.replace(new RegExp(flexiblePattern), newString);
			
			const oldLines = fullOldJupytext === '' ? [] : fullOldJupytext.split('\n');
			const newLines = fullNewJupytext === '' ? [] : fullNewJupytext.split('\n');
			
			// 3. Get jupytext line mapping using the same reads function as fileContentService.ts
			const parseResult = reads(fullNewJupytext, { extension: '.py', format_name: 'percent' }, 4, null, true);
			
			if (typeof parseResult !== 'object' || !('cellLineMap' in parseResult) || !parseResult.cellLineMap) {
				throw new Error('Failed to get jupytext line mapping from reads function');
			}
			
			const cellLineMap = parseResult.cellLineMap;

			// 4. Compute diff on the full Jupytext contents
			const diffResult = computeLineDiff(oldLines, newLines);
						
			// 5. Map diff entries back to cells using line mapping (same as fileChangeTracker)
			const cellDiffs = new Map<number, Array<{ type: 'added' | 'deleted' | 'unchanged'; content: string; lineNumber: number; }>>();
			for (const diffEntry of diffResult.diff) {
				if (diffEntry.type === 'added' && diffEntry.new_line && diffEntry.new_line > 0) {
					// Find which cell this line belongs to using cellLineMap
					const cellMapping = cellLineMap.find((mapping: { cellIndex: number; startLine: number; endLine: number }) => 
						diffEntry.new_line! >= mapping.startLine && diffEntry.new_line! <= mapping.endLine
					);
					const lineInCell = cellMapping ? diffEntry.new_line! - cellMapping.startLine + 1 : 1;
					if (cellMapping) {
						if (!cellDiffs.has(cellMapping.cellIndex)) {
							cellDiffs.set(cellMapping.cellIndex, []);
						}
						cellDiffs.get(cellMapping.cellIndex)!.push({
							type: diffEntry.type,
							content: diffEntry.content,
							lineNumber: lineInCell
						});
					}
				} else if (diffEntry.type === 'deleted') {
					// For deleted lines, find the next available line in the new content (same algorithm as fileChangeTracker)
					let targetCellIndex = 0;
					let targetLineInCell = 1;
					
					// Look for the next line after this deletion
					const nextAddedOrUnchanged = diffResult.diff.find((entry, index) => 
						index > diffResult.diff.indexOf(diffEntry) && 
						(entry.type === 'added' || entry.type === 'unchanged') && 
						entry.new_line && entry.new_line > 0
					);
					
					if (nextAddedOrUnchanged && nextAddedOrUnchanged.new_line) {
						// Find which cell the next line belongs to using cellLineMap
						const cellMapping = cellLineMap.find((mapping: { cellIndex: number; startLine: number; endLine: number }) => 
							nextAddedOrUnchanged.new_line! >= mapping.startLine && nextAddedOrUnchanged.new_line! <= mapping.endLine
						);
						if (cellMapping) {
							targetCellIndex = cellMapping.cellIndex;
							targetLineInCell = nextAddedOrUnchanged.new_line! - cellMapping.startLine + 1; // Show before this line
						}
					}
					
					if (!cellDiffs.has(targetCellIndex)) {
						cellDiffs.set(targetCellIndex, []);
					}
					cellDiffs.get(targetCellIndex)!.push({
						type: diffEntry.type,
						content: diffEntry.content,
						lineNumber: targetLineInCell
					});
				} else if (diffEntry.type === 'unchanged' && diffEntry.new_line && diffEntry.new_line > 0) {
					// Find which cell this line belongs to using cellLineMap
					const cellMapping = cellLineMap.find((mapping: { cellIndex: number; startLine: number; endLine: number }) => 
						diffEntry.new_line! >= mapping.startLine && diffEntry.new_line! <= mapping.endLine
					);
					const lineInCell = cellMapping ? diffEntry.new_line! - cellMapping.startLine + 1 : 1;
					if (cellMapping) {
						if (!cellDiffs.has(cellMapping.cellIndex)) {
							cellDiffs.set(cellMapping.cellIndex, []);
						}
						cellDiffs.get(cellMapping.cellIndex)!.push({
							type: diffEntry.type,
							content: diffEntry.content,
							lineNumber: lineInCell
						});
					}
				}
			}

			// 6. Create enhanced diff items with cell information
			const enhancedDiffItems: any[] = [];
			
			for (const [cellIndex, lineDiffs] of cellDiffs.entries()) {
				for (const lineDiff of lineDiffs) {
					// Find the original diff entry to get old_line and new_line
					const originalDiffEntry = diffResult.diff.find(d => 
						d.type === lineDiff.type && d.content === lineDiff.content
					);
					
					// For now, default to 'code' cell type (we could enhance this by parsing the notebook)
					const cellType = 'code';
					
					const enhancedItem = {
						type: lineDiff.type,
						content: lineDiff.content,
						old_line: originalDiffEntry?.old_line,
						new_line: originalDiffEntry?.new_line,
						cellIndex: cellIndex,
						lineInCell: lineDiff.lineNumber,
						cellType: cellType
					};
					
					enhancedDiffItems.push(enhancedItem);
				}
			}

			// 7. Store the enhanced diff data with cell information
			const filteredDiff = filterDiffForDisplay(enhancedDiffItems);
			
			this.storeDiffData(
				messageId,
				filteredDiff,
				fullOldJupytext,
				fullNewJupytext,
				{ is_start_edit: false, is_end_edit: false },
				filePath,
				oldString,
				newString
			);
						
		} catch (error) {
			console.error(`[NOTEBOOK_DIFF_FLOW_STEP1] Failed to compute notebook diff for ${filePath}:`, error);
			// Fall back to regular diff computation
			const flexiblePattern = createFlexibleWhitespacePattern(oldString);
			const newContent = replaceAll ? 
				effectiveContent.replace(new RegExp(flexiblePattern, 'g'), newString) :
				effectiveContent.replace(new RegExp(flexiblePattern), newString);
			const diffResult = computeLineDiff(
				effectiveContent === '' ? [] : effectiveContent.split('\n'), 
				newContent === '' ? [] : newContent.split('\n')
			);
			const filteredDiff = filterDiffForDisplay(diffResult.diff);
			this.storeDiffData(messageId, filteredDiff, effectiveContent, newContent, { is_start_edit: false, is_end_edit: false }, filePath, oldString, newString);
		}
	}
}

export const diffStorage = new DiffStorage();
