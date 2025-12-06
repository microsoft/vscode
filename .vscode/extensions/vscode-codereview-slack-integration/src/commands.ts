/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as vscode from 'vscode';
import { SlackService } from './service';
import { SlackMessageItem, SlackTreeDataProvider } from './treeDataProvider';

export class SlackCommandsRegistry extends vscode.Disposable {

	private _disposables: vscode.Disposable[] = [];

	constructor(slackService: SlackService, slackTreeDataProvider: SlackTreeDataProvider) {
		super(() => this.dispose());
		this._disposables.push(this._registerCommand(new SignIntoSlackCommand(slackService, slackTreeDataProvider)));
		this._disposables.push(this._registerCommand(new RefreshPRsCommand(slackService, slackTreeDataProvider)));
		this._disposables.push(this._registerCommand(new OpenPRViewCommand(slackService, slackTreeDataProvider)));
		this._disposables.push(this._registerCommand(new OpenPRInBrowser(slackService, slackTreeDataProvider)));
	}

	private _registerCommand(command: Command): vscode.Disposable {
		return vscode.commands.registerCommand(command.ID, async (...args: any[]) => { command.execute(...args); });
	}

	override dispose() {
		super.dispose();
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

	constructor(public readonly slackService: SlackService, public readonly slackTreeDataProvider: SlackTreeDataProvider) {
		super();
	}

	async execute(): Promise<void> {
		this.slackService.signIn();
	}
}

class RefreshPRsCommand extends Command {

	public readonly ID = 'vs-code-codereview.refreshMessages';

	constructor(public readonly slackService: SlackService, public readonly slackTreeDataProvider: SlackTreeDataProvider) {
		super();
	}

	async execute(): Promise<void> {
		await this.slackTreeDataProvider.fetchMessages();
	}
}

class OpenPRViewCommand extends Command {

	public readonly ID = 'vs-code-codereview.openPrLocally';

	constructor(public readonly slackService: SlackService, public readonly slackTreeDataProvider: SlackTreeDataProvider) {
		super();
	}

	async execute(item: SlackMessageItem): Promise<void> {
		if (!item || !item.message.pr) {
			vscode.window.showWarningMessage('No PR information available for this item');
			return;
		}
		try {
			this.slackTreeDataProvider.setLoadingPR(item.message.id);
			const params = {
				owner: item.message.pr.owner,
				repo: item.message.pr.repo,
				pullRequestNumber: item.message.pr.number
			};
			const encodedParams = encodeURIComponent(JSON.stringify(params));
			const uri = await vscode.env.asExternalUri(
				vscode.Uri.parse(`${vscode.env.uriScheme}://github.vscode-pull-request-github/open-pull-request-webview?${encodedParams}&`)
			);
			await vscode.env.openExternal(uri);
		} catch (error) {
			vscode.window.showErrorMessage(`Failed to open PR #${item.message.pr.number}: ${error}`);
		} finally {
			// Clear loading state after a delay to give time for the PR view to open
			setTimeout(() => {
				this.slackTreeDataProvider.setLoadingPR(undefined);
			}, 2000);
		}
	}
}

class OpenPRInBrowser extends Command {

	public readonly ID = 'vs-code-codereview.openPrInBrowser';

	constructor(public readonly slackService: SlackService, public readonly slackTreeDataProvider: SlackTreeDataProvider) {
		super();
	}

	async execute(item: SlackMessageItem): Promise<void> {
		if (!item || !item.message.pr) {
			vscode.window.showWarningMessage('No PR URL available for this item');
			return;
		}
		try {
			await vscode.env.openExternal(vscode.Uri.parse(item.message.pr.url));
		} catch (error) {
			console.error('Failed to open PR in browser:', error);
			vscode.window.showErrorMessage(`Failed to open PR in browser: ${error}`);
		}
	}
}
