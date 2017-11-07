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
	private readonly commands = new Map<string, vscode.Disposable>();

	public dispose() {
		for (const registration of this.commands) {
			registration[1].dispose();
		}
		this.commands.clear();
	}

	public registerCommand(id: string, impl: (...args: any[]) => void, thisArg?: any) {
		if (this.commands.has(id)) {
			return;
		}

		this.commands.set(id, vscode.commands.registerCommand(id, impl, thisArg));
	}

	public register(command: Command) {
		this.registerCommand(command.id, command.execute, command);
	}
}