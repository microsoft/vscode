/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as vscode from 'vscode';

export interface Command {
	readonly id: string;

	execute(...args: any[]): void;
}

export class CommandManager {
	private readonly commands: vscode.Disposable[] = [];

	public dispose() {
		while (this.commands.length) {
			const obj = this.commands.pop();
			if (obj) {
				obj.dispose();
			}
		}
	}

	public registerCommand(id: string, impl: (...args: any[]) => void, thisArg?: any) {
		this.commands.push(vscode.commands.registerCommand(id, impl, thisArg));
	}

	public register(command: Command) {
		this.registerCommand(command.id, command.execute, command);
	}
}