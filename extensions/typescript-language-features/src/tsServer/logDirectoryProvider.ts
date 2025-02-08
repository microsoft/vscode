/*---------------------------------------------------------------------------------------------
 *  Copyright (c) 2025 EthicalCoder. All rights reserved.
 *  Licensed under the MIT License. See LICENSE.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as vscode from 'vscode';

export interface ILogDirectoryProvider {
	getNewLogDirectory(): vscode.Uri | undefined;
}

export const noopLogDirectoryProvider = new class implements ILogDirectoryProvider {
	public getNewLogDirectory(): undefined {
		return undefined;
	}
};
