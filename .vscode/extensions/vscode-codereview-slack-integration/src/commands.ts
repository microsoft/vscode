/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as vscode from 'vscode';
import { SlackService } from './service';
import { SlackMessageItem, SlackTreeDataProvider } from './treeDataProvider';

export class SlackCommandsRegistry implements vscode.Disposable {

	private readonly _disposables: vscode.Disposable[] = [];

	constructor(slackService: SlackService, slackTreeDataProvider: SlackTreeDataProvider) {
		this._disposables.push(this._registerCommand(new SignIntoSlackCommand(slackService)));
		this._disposables.push(this._registerCommand(new RefreshPRsCommand(slackTreeDataProvider)));
		this._disposables.push(this._registerCommand(new OpenPRViewCommand(slackTreeDataProvider)));
		this._disposables.push(this._registerCommand(new OpenPRInBrowser(slackTreeDataProvider)));
	}

	private _registerCommand(command: Command): vscode.Disposable {
		return vscode.commands.registerCommand(command.ID, async (...args: any[]) => { command.execute(...args); });
	}

	dispose() {
		this._disposables.forEach(d => d.dispose());
	}
}

export abstract class Command {

	constructor() { }

	public abstract readonly ID: string;

	public abstract execute(...args: any[]): Promise<void> | void;
}


class SignIntoSlackCommand extends Command {

	public readonly ID = 'vs-code-codereview.signIn';

	constructor(public readonly slackService: SlackService) {
		super();
	}

	async execute(): Promise<void> {
		this.slackService.signIn();
	}
}

class RefreshPRsCommand extends Command {

	public readonly ID = 'vs-code-codereview.refreshMessages';

	constructor(public readonly slackTreeDataProvider: SlackTreeDataProvider) {
		super();
	}

	async execute(): Promise<void> {
		await this.slackTreeDataProvider.fetchMessages();
	}
}

class OpenPRViewCommand extends Command {

	public readonly ID = 'vs-code-codereview.viewPR';

	constructor(public readonly slackTreeDataProvider: SlackTreeDataProvider) {
		super();
	}

	async execute(item: SlackMessageItem): Promise<void> {
		this.slackTreeDataProvider.viewPR(item);
	}
}

class OpenPRInBrowser extends Command {

	public readonly ID = 'vs-code-codereview.openPRInBrowser';

	constructor(public readonly slackTreeDataProvider: SlackTreeDataProvider) {
		super();
	}

	async execute(item: SlackMessageItem): Promise<void> {
		this.slackTreeDataProvider.openPRInBrowser(item);
	}
}
