/*---------------------------------------------------------------------------------------------
 *  Copyright (C) 2023 Posit Software, PBC. All rights reserved.
 *  Licensed under the Elastic License 2.0. See LICENSE.txt for license information.
 *--------------------------------------------------------------------------------------------*/

import * as erdos from 'erdos';
import * as vscode from 'vscode';
import { type Cell, type CellParser, getParser } from './parser';
import { canHaveCells, getOrCreateDocumentManager } from './documentManager';

export interface ExecuteCode {
	(language: string, code: string): Promise<void>;
}
const defaultExecuteCode: ExecuteCode = async (language, code) => {
	await erdos.runtime.executeCode(language, code, false, true);
};

// Handles execution of cells via editor
export class CodeCellManager {
	private parser: CellParser | undefined;
	constructor(
		private editor: vscode.TextEditor,
		private readonly executeCode: ExecuteCode = defaultExecuteCode,
	) {
		this.parser = getParser(this.editor.document.languageId);
	}

	private getCursor(line?: number): vscode.Position {
		if (line !== undefined) {
			return new vscode.Position(line, 0);
		}
		return this.editor.selection.active;
	}

	private getCells(): Cell[] | undefined {
		return getOrCreateDocumentManager(this.editor.document)?.getCells();
	}

	private getCurrentCell(line?: number) {
		const cursor = this.getCursor(line);
		const cells = this.getCells();
		if (!cells) { return; }

		return cells.find(cell => {
			return cell.range.contains(cursor);
		});
	}
	private getNextCell(line?: number) {
		const cursor = this.getCursor(line);
		const cells = this.getCells();
		if (!cells) { return; }

		return cells.find(cell => {
			return cell.range.end.isAfter(cursor) && !cell.range.contains(cursor);
		});
	}
	private getPreviousCell(line?: number) {
		const cursor = this.getCursor(line);
		const cells = this.getCells();
		if (!cells) { return; }

		return cells.filter(cell => {
			return cell.range.start.isBefore(cursor) && !cell.range.contains(cursor);
		}).at(-1);
	}

	private goToCell(cell: Cell): void {
		// Skip the cell marker line
		const line = Math.min(cell.range.start.line + 1, cell.range.end.line);
		const cursor = new vscode.Position(line, 0);
		this.editor.selection = new vscode.Selection(cursor, cursor);
		this.editor.revealRange(cell.range);
	}

	// Run cells
	private runCell(cell: Cell): void {
		if (!this.parser) { return; }
		const text = this.parser.getCellText(cell, this.editor.document);
		this.executeCode(this.editor.document.languageId, text);
	}

	// Public commands
	public runCurrentCell(line?: number): void {
		const cell = this.getCurrentCell(line);
		if (cell) {
			this.runCell(cell);
		}
	}

	public runCurrentAdvance(line?: number): void {
		this.runCurrentCell(line);
		this.goToNextCell(line);
	}

	public runPreviousCell(line?: number): void {
		const cell = this.getPreviousCell(line);
		if (cell) {
			this.runCell(cell);
			this.goToCell(cell);
		}
	}

	public runNextCell(line?: number): void {
		const cell = this.getNextCell(line);
		if (cell) {
			this.runCell(cell);
			this.goToCell(cell);
		}
	}

	public runAllCells(): void {
		const cells = this.getCells();
		if (cells) {
			cells.forEach((cell) => this.runCell(cell));
		}
	}

	public runCellsAbove(line?: number): void {
		const cursor = this.getCursor(line);
		this.getCells()?.filter((cell) =>
			cell.range.start.isBefore(cursor) && !cell.range.contains(cursor)
		).forEach((cell) => this.runCell(cell));
	}

	public runCurrentAndBelow(line?: number): void {
		const cursor = this.getCursor(line);
		this.getCells()?.filter((cell) =>
			cell.range.end.isAfter(cursor)
		).forEach((cell) => this.runCell(cell));
	}

	public runCellsBelow(line?: number): void {
		const cursor = this.getCursor(line);
		this.getCells()?.filter((cell) =>
			cell.range.end.isAfter(cursor) && !cell.range.contains(cursor)
		).forEach((cell) => this.runCell(cell));
	}

	public goToPreviousCell(line?: number): void {
		const cell = this.getPreviousCell(line);
		if (cell) {
			this.goToCell(cell);
		}
	}

	public goToNextCell(line?: number): void {
		const cell = this.getNextCell(line);
		if (cell) {
			this.goToCell(cell);
		}
	}

	public async insertCodeCell(line?: number): Promise<void> {
		const location = this.getCurrentCell(line)?.range.end ?? this.editor.selection.active;
		await this.editor.edit(editBuilder => {
			editBuilder.insert(location, this.parser?.newCell() ?? '');
		});
		this.goToNextCell(location.line);
	}

}

export function getActiveCodeCellManager(): CodeCellManager | undefined {
	const activeEditor = vscode.window?.activeTextEditor;
	if (activeEditor && canHaveCells(activeEditor.document)) {
		return new CodeCellManager(activeEditor);
	}
	return undefined;
}
