/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Emitter, Event } from '../../../base/common/event.js';
import { Disposable } from '../../../base/common/lifecycle.js';
import { LineEditSource, ILineEditSourcesChangedEvent } from '../lineEditSource.js';
import { TextModelEditSource, isAiEdit, isUserEdit } from '../textModelEditSource.js';
import { IModelContentChange } from '../textModelEvents.js';

/**
 * Tracks the edit source (human, AI, or undetermined) for each line in a text model
 */
export class LineEditTracker extends Disposable {

	private readonly _onDidChangeLineEditSources = this._register(new Emitter<ILineEditSourcesChangedEvent>());
	public readonly onDidChangeLineEditSources: Event<ILineEditSourcesChangedEvent> = this._onDidChangeLineEditSources.event;

	/**
	 * Map from line number to edit source. Only stores non-undetermined lines for memory efficiency.
	 */
	private _lineEditSources = new Map<number, LineEditSource>();

	constructor() {
		super();
	}

	/**
	 * Get the edit source for a specific line
	 */
	public getLineEditSource(lineNumber: number): LineEditSource {
		return this._lineEditSources.get(lineNumber) ?? LineEditSource.Undetermined;
	}

	/**
	 * Get edit sources for all lines that have been edited
	 */
	public getAllLineEditSources(): Map<number, LineEditSource> {
		return new Map(this._lineEditSources);
	}

	/**
	 * Handle content changes and update line edit sources accordingly
	 */
	public handleContentChanges(changes: readonly IModelContentChange[], editSources: readonly TextModelEditSource[]): void {
		if (changes.length === 0) {
			return;
		}

		try {
			const affectedLines = new Map<number, LineEditSource>();

			// Process changes from end to beginning to avoid line number shifting issues
			for (let i = changes.length - 1; i >= 0; i--) {
				const change = changes[i];
				const editSource = editSources[Math.min(i, editSources.length - 1)];

				const lineEditSource = this._classifyEditSource(editSource);
				const startLine = change.range.startLineNumber;
				const endLine = change.range.endLineNumber;

				// Validate line numbers to prevent invalid operations
				if (startLine <= 0 || endLine <= 0 || startLine > endLine) {
					continue; // Skip invalid changes
				}

				/**
				 * Analyze deletion characteristics
				 */
				const startColumn = change.range.startColumn;
				const endColumn = change.range.endColumn;
				const isPureDeletion = change.text === '';
				// Partial deletion within a single line
				const isPartialLineDeletion = (startLine === endLine) && isPureDeletion;
				// Full line deletion only when entire lines are removed (from col 1 to col 1 across lines)
				const isFullLineDeletion = isPureDeletion && (startLine < endLine) && (startColumn === 1) && (endColumn === 1);

				// Determine how many line breaks were inserted and how many logical lines are affected
				const newlineCount = this._countNewLines(change.text);
				const affectedInsertedLines = (change.text === '') ? 0 : (newlineCount + 1);

				if (isPartialLineDeletion) {
					// Partial deletion within a line - mark as edited by the deletion source
					this._setLineEditSource(startLine, lineEditSource);
					affectedLines.set(startLine, lineEditSource);
				} else if (isFullLineDeletion) {
					// Complete line deletion - remove deleted lines and shift remaining lines
					this._handleLineDeletion(startLine, endLine - 1);
					// Shift lines that come after the deletion
					const deletedLineCount = endLine - startLine;
					if (deletedLineCount > 0) {
						this._shiftLineNumbers(endLine, -deletedLineCount);
					}
				} else if (change.text !== '') {
					// Handle insertions and replacements
					// For replacements, first clear the existing range
					if (startLine < endLine || change.rangeLength > 0) {
						for (let lineNum = startLine; lineNum <= endLine; lineNum++) {
							this._lineEditSources.delete(lineNum);
						}
					}

					/**
					 * Handle line number shifts for insertions.
					 * A positive delta shifts following lines down.
					 */
					const lineDelta = newlineCount - (endLine - startLine);
					if (lineDelta > 0) {
						// When inserting lines, shift existing lines that come after the insertion point
						// For insertions, we need to shift lines that come after the end of the replacement range
						this._shiftLineNumbers(endLine + 1, lineDelta);
					} else if (lineDelta < 0) {
						// Handle case where replacement results in fewer lines
						this._shiftLineNumbers(endLine + 1, lineDelta);
					}

					// Check if we're inserting only newlines (empty line insertion)
					const isEmptyLineInsertion = change.text.trim() === '' && newlineCount > 0;

					// Special case: Check if this is a line merge operation disguised as an insertion/replacement
					// This happens when user backspaces from one line to merge with previous line using replacement text
					const isLineMergeReplacement = startLine !== endLine && startColumn > 1 && endColumn === 1;

					if (isLineMergeReplacement) {
						// This is a line merge via replacement - only mark the start line if it was already marked
						const existingSource = this._lineEditSources.get(startLine);
						if (existingSource !== undefined) {
							// Preserve the existing source, but update with current edit source if it's more specific
							const finalSource = this._resolveEditSourcePriority(existingSource, lineEditSource);
							this._setLineEditSource(startLine, finalSource);
							affectedLines.set(startLine, finalSource);
						}
						// Don't automatically mark pristine lines just from merge operations
						// Shift remaining lines
						const deletedLineCount = endLine - startLine;
						if (deletedLineCount > 0) {
							this._shiftLineNumbers(endLine + 1, -deletedLineCount);
						}
					} else {
						// Regular insertion/replacement - mark lines appropriately
						if (!isEmptyLineInsertion) {
							// Mark all affected lines with content
							for (let j = 0; j < affectedInsertedLines; j++) {
								const lineNum = startLine + j;
								this._setLineEditSource(lineNum, lineEditSource);
								affectedLines.set(lineNum, lineEditSource);
							}
						}
						// Note: Empty line insertions are not tracked (remain Undetermined)
						// This maintains consistency with test expectations and avoids tracking
						// lines that contain no actual content
					}
				} else if (isPureDeletion && startLine !== endLine) {
					// Handle cross-line deletion (like deleting from end of one line to start of next)
					// This typically happens when deleting a newline character (merging lines)
					const isCrossLineMerge = startColumn > 1 && endColumn === 1;
					if (isCrossLineMerge) {
						// This is a line merge operation - the second line is being merged into the first
						// Remove the attribution from all deleted lines
						for (let lineNum = startLine + 1; lineNum <= endLine; lineNum++) {
							this._lineEditSources.delete(lineNum);
						}
						// Use consistent merge logic: preserve existing source, apply priority resolution
						const existingSource = this._lineEditSources.get(startLine);
						if (existingSource !== undefined) {
							const finalSource = this._resolveEditSourcePriority(existingSource, lineEditSource);
							this._setLineEditSource(startLine, finalSource);
							affectedLines.set(startLine, finalSource);
						}
						// If the line was previously undetermined, leave it undetermined - don't mark it just from the merge

						// Shift all lines after the deletion up
						const deletedLineCount = endLine - startLine;
						this._shiftLineNumbers(endLine + 1, -deletedLineCount);
					} else {
						// Regular cross-line deletion - remove all affected lines and shift
						for (let lineNum = startLine; lineNum <= endLine; lineNum++) {
							this._lineEditSources.delete(lineNum);
						}
						// For pure deletions across lines, don't automatically mark as any particular source
						const deletedLineCount = endLine - startLine;
						if (deletedLineCount > 0) {
							this._shiftLineNumbers(endLine + 1, -deletedLineCount);
						}
					}
				}
			}

			// Fire event if any lines were affected
			if (affectedLines.size > 0) {
				this._onDidChangeLineEditSources.fire({ changes: affectedLines });
			}
		} catch (error) {
			// Log error and continue gracefully - don't let edit tracking break the editor
			console.warn('LineEditTracker: Error processing content changes:', error);
		}
	}

	/**
	 * Classify a TextModelEditSource into a LineEditSource
	 */
	private _classifyEditSource(editSource: TextModelEditSource): LineEditSource {
		// Check AI edits first (now includes extension.applyEdits)
		if (isAiEdit(editSource)) {
			return LineEditSource.AI;
		}

		if (isUserEdit(editSource)) {
			return LineEditSource.Human;
		}

		// Check for additional human edit patterns
		const metadata = editSource.metadata;
		if (metadata.source === 'cursor') {
			switch (metadata.kind) {
				case 'type':
				case 'paste':
				case 'cut':
				case 'executeCommands':  // Handle deletion operations
				case 'executeCommand':   // Handle single deletion operations
					return LineEditSource.Human;
			}
		}

		// Legacy applyEdits handling (for backwards compatibility)
		// When we can't detect the extension context, treat as AI to be conservative
		if (metadata.source === 'applyEdits') {
			return LineEditSource.AI;
		}

		// Check for other AI patterns that might indicate automated tool usage
		if (metadata.source === 'snippet') {
			// Snippets can be AI-generated (e.g., from completion providers) or user-invoked
			return LineEditSource.AI;
		}

		if (metadata.source === 'codeAction') {
			// Code actions can be triggered by AI tools
			return LineEditSource.AI;
		}

		if (metadata.source === 'suggest') {
			// Suggest operations are typically AI-driven
			return LineEditSource.AI;
		}

		return LineEditSource.Undetermined;
	}

	/**
	 * Resolve priority when two edit sources conflict on the same line
	 * Priority: Human > AI > Undetermined
	 */
	private _resolveEditSourcePriority(existing: LineEditSource, incoming: LineEditSource): LineEditSource {
		// Human edits always take precedence
		if (existing === LineEditSource.Human || incoming === LineEditSource.Human) {
			return LineEditSource.Human;
		}
		// AI takes precedence over Undetermined
		if (existing === LineEditSource.AI || incoming === LineEditSource.AI) {
			return LineEditSource.AI;
		}
		// Both are Undetermined
		return LineEditSource.Undetermined;
	}

	/**
	 * Set the edit source for a line
	 */
	private _setLineEditSource(lineNumber: number, source: LineEditSource): void {
		if (source === LineEditSource.Undetermined) {
			this._lineEditSources.delete(lineNumber);
		} else {
			this._lineEditSources.set(lineNumber, source);
		}
	}

	/**
	 * Handle deletion of lines by removing their edit source tracking
	 */
	private _handleLineDeletion(startLine: number, endLine: number): void {
		for (let lineNum = startLine; lineNum <= endLine; lineNum++) {
			this._lineEditSources.delete(lineNum);
		}
	}

	/**
	 * Shift line numbers when lines are inserted or deleted
	 */
	private _shiftLineNumbers(fromLine: number, delta: number): void {
		if (delta === 0) {
			return;
		}

		const entriesToUpdate = new Map<number, LineEditSource>();

		// Collect entries that need to be shifted
		for (const [lineNumber, source] of this._lineEditSources) {
			if (lineNumber >= fromLine) {
				entriesToUpdate.set(lineNumber, source);
				this._lineEditSources.delete(lineNumber);
			}
		}

		// Add them back with shifted line numbers
		for (const [lineNumber, source] of entriesToUpdate) {
			const newLineNumber = lineNumber + delta;
			// Only add back lines that remain valid (positive line numbers)
			if (newLineNumber > 0) {
				this._lineEditSources.set(newLineNumber, source);
			}
		}
	}

	/**
	 * Count the number of new lines in a text string
	 */
	private _countNewLines(text: string): number {
		let count = 0;
		for (let i = 0; i < text.length; i++) {
			if (text[i] === '\n') {
				count++;
			}
		}
		return count;
	}

	/**
	 * Clear all line edit sources (useful for model resets)
	 */
	public clear(): void {
		const hadChanges = this._lineEditSources.size > 0;
		this._lineEditSources.clear();

		if (hadChanges) {
			this._onDidChangeLineEditSources.fire({ changes: new Map() });
		}
	}

	/**
	 * Dispose of the tracker and clean up resources
	 */
	public override dispose(): void {
		this._lineEditSources.clear();
		super.dispose();
	}

	/**
	 * Get serializable data for persistence
	 */
	public serialize(): { [lineNumber: string]: LineEditSource } {
		const result: { [lineNumber: string]: LineEditSource } = {};
		for (const [lineNumber, source] of this._lineEditSources) {
			result[lineNumber.toString()] = source;
		}
		return result;
	}

	/**
	 * Restore from serialized data
	*/
	public deserialize(data: { [lineNumber: string]: LineEditSource }): void {
		this._lineEditSources.clear();

		if (!data || typeof data !== 'object') {
			return;
		}

		for (const [lineNumberStr, source] of Object.entries(data)) {
			const lineNumber = parseInt(lineNumberStr, 10);
			// Validate line number and source value - reject line 0 and negative numbers
			if (!isNaN(lineNumber) && lineNumber > 0 && this._isValidLineEditSource(source)) {
				this._lineEditSources.set(lineNumber, source);
			}
		}
	}

	/**
	 * Validate that a value is a valid LineEditSource enum value
	 */
	private _isValidLineEditSource(value: any): value is LineEditSource {
		return value === LineEditSource.Undetermined ||
			value === LineEditSource.Human ||
			value === LineEditSource.AI;
	}
}
