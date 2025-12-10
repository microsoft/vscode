/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as vscode from 'vscode';

export interface ICommand {
	readonly id: string;
	execute(...args: any[]): Promise<void> | void;
}

export class CommandManager {
	private readonly commands = new Map<string, ICommand>();

	register(command: ICommand): vscode.Disposable {
		this.commands.set(command.id, command);
		return vscode.commands.registerCommand(command.id, command.execute, command);
	}

	dispose(): void {
		this.commands.clear();
	}
}

