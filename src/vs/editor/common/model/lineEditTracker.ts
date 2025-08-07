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

		const affectedLines = new Map<number, LineEditSource>();

		// Process each change and determine the edit source
		for (let i = 0; i < changes.length; i++) {
			const change = changes[i];
			const editSource = editSources[Math.min(i, editSources.length - 1)];

			const lineEditSource = this._classifyEditSource(editSource);
			const startLine = change.range.startLineNumber;
			const endLine = change.range.endLineNumber;

			// Handle line deletions first
			if (change.range.startLineNumber < change.range.endLineNumber) {
				this._handleLineDeletion(startLine, endLine);
			}

			// Determine how many lines were inserted
			const insertedLines = this._countNewLines(change.text);

			// Mark affected lines with the edit source
			for (let lineNum = startLine; lineNum <= startLine + insertedLines; lineNum++) {
				this._setLineEditSource(lineNum, lineEditSource);
				affectedLines.set(lineNum, lineEditSource);
			}

			// Handle line insertions - shift line numbers for subsequent lines
			if (insertedLines > 0) {
				const lineDelta = insertedLines - (endLine - startLine);
				if (lineDelta !== 0) {
					this._shiftLineNumbers(endLine + 1, lineDelta);
				}
			}
		}

		// Fire event if any lines were affected
		if (affectedLines.size > 0) {
			this._onDidChangeLineEditSources.fire({ changes: affectedLines });
		}
	}

	/**
	 * Classify a TextModelEditSource into a LineEditSource
	 */
	private _classifyEditSource(editSource: TextModelEditSource): LineEditSource {
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
				case 'paste':
				case 'cut':
					return LineEditSource.Human;
			}
		}

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

		for (const [lineNumberStr, source] of Object.entries(data)) {
			const lineNumber = parseInt(lineNumberStr, 10);
			if (!isNaN(lineNumber) && lineNumber > 0) {
				this._lineEditSources.set(lineNumber, source);
			}
		}
	}
}
