/*---------------------------------------------------------------------------------------------
 *  Copyright (C) 2023 Posit Software, PBC. All rights reserved.
 *  Licensed under the Elastic License 2.0. See LICENSE.txt for license information.
 *--------------------------------------------------------------------------------------------*/

import * as vscode from 'vscode';
import { getActiveCodeCellManager } from './codeCellManager';

export function registerCommands(disposables: vscode.Disposable[]) {
	disposables.push(
		// Movement
		vscode.commands.registerCommand('erdos.goToPreviousCell', (line?: number) => {
			getActiveCodeCellManager()?.goToPreviousCell(line);
		}),

		vscode.commands.registerCommand('erdos.goToNextCell', (line?: number) => {
			getActiveCodeCellManager()?.goToNextCell(line);
		}),

		// Insert cell
		vscode.commands.registerCommand('erdos.insertCodeCell', async (line?: number) => {
			await getActiveCodeCellManager()?.insertCodeCell(line);
		}),

		// Run cells
		vscode.commands.registerCommand('erdos.runAllCells', () => {
			getActiveCodeCellManager()?.runAllCells();
		}),

		vscode.commands.registerCommand('erdos.runCellsAbove', (line?: number) => {
			getActiveCodeCellManager()?.runCellsAbove(line);
		}),

		vscode.commands.registerCommand('erdos.runCurrentAndBelow', (line?: number) => {
			getActiveCodeCellManager()?.runCurrentAndBelow(line);
		}),

		vscode.commands.registerCommand('erdos.runCellsBelow', (line?: number) => {
			getActiveCodeCellManager()?.runCellsBelow(line);
		}),

		vscode.commands.registerCommand('erdos.runCurrentAdvance', (line?: number) => {
			getActiveCodeCellManager()?.runCurrentAdvance(line);
		}),

		vscode.commands.registerCommand('erdos.runCurrentCell', (line?: number) => {
			getActiveCodeCellManager()?.runCurrentCell(line);
		}),

		vscode.commands.registerCommand('erdos.runNextCell', (line?: number) => {
			getActiveCodeCellManager()?.runNextCell(line);
		}),

		vscode.commands.registerCommand('erdos.runPreviousCell', (line?: number) => {
			getActiveCodeCellManager()?.runPreviousCell(line);
		}),

	);
}
