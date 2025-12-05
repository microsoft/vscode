import * as vscode from 'vscode';
import { SlackService } from './slackService';
import { SlackMessageItem, SlackTreeDataProvider } from './slackTreeDataProvider';

export class SlackCommandsRegistry extends vscode.Disposable {

	private _disposables: vscode.Disposable[] = [];

	constructor(slackService: SlackService, slackTreeDataProvider: SlackTreeDataProvider) {
		super(() => this.dispose());
		this._disposables.push(this._registerCommand(new SignInCommand(slackService, slackTreeDataProvider)));
		this._disposables.push(this._registerCommand(new SignOutCommand(slackService, slackTreeDataProvider)));
		this._disposables.push(this._registerCommand(new RefreshCommand(slackService, slackTreeDataProvider)));
		this._disposables.push(this._registerCommand(new OpenPRViewCommand(slackService, slackTreeDataProvider)));
		this._disposables.push(this._registerCommand(new OpenPRInBrowser(slackService, slackTreeDataProvider)));
	}

	private _registerCommand(command: Command): vscode.Disposable {
		return vscode.commands.registerCommand(command.name, async (...args: any[]) => { command.execute(...args); });
	}

	override dispose() {
		this._disposables.forEach(d => d.dispose());
	}
}

export abstract class Command {

	constructor() { }

	public abstract readonly name: string;

	public abstract execute(...args: any[]): Promise<void> | void;
}


class SignInCommand extends Command {

	public readonly name = 'vs-code-codereview.signIn';

	constructor(public readonly slackService: SlackService, public readonly slackTreeDataProvider: SlackTreeDataProvider) {
		super();
	}

	async execute(): Promise<void> {
		const success = await this.slackService.signIn();
		if (!success) {
			return;
		}
		this.slackTreeDataProvider.refresh();
	}
}

class SignOutCommand extends Command {

	public readonly name = 'vs-code-codereview.signOut';

	constructor(public readonly slackService: SlackService, public readonly slackTreeDataProvider: SlackTreeDataProvider) {
		super();
	}

	async execute(): Promise<void> {
		await this.slackService.signOut();
		this.slackTreeDataProvider.refresh();
	}
}

class RefreshCommand extends Command {

	public readonly name = 'vs-code-codereview.refreshMessages';

	constructor(public readonly slackService: SlackService, public readonly slackTreeDataProvider: SlackTreeDataProvider) {
		super();
	}

	async execute(): Promise<void> {
		await this.slackTreeDataProvider.fetchPRs();
	}
}

class OpenPRViewCommand extends Command {

	public readonly name = 'vs-code-codereview.openPrLocally';

	constructor(public readonly slackService: SlackService, public readonly slackTreeDataProvider: SlackTreeDataProvider) {
		super();
	}

	async execute(item: SlackMessageItem): Promise<void> {
		if (!item || !item.message.prOwner || !item.message.prRepo || !item.message.prNumber) {
			vscode.window.showWarningMessage('No PR information available for this item');
			return;
		}
		try {
			this.slackTreeDataProvider.setLoadingPr(item.message.id);
			const params = {
				owner: item.message.prOwner,
				repo: item.message.prRepo,
				pullRequestNumber: item.message.prNumber
			};
			const encodedParams = encodeURIComponent(JSON.stringify(params));
			const uri = await vscode.env.asExternalUri(
				vscode.Uri.parse(`${vscode.env.uriScheme}://github.vscode-pull-request-github/open-pull-request-webview?${encodedParams}&`)
			);
			await vscode.env.openExternal(uri);
		} catch (error) {
			console.error('Failed to open pull request:', error);
			vscode.window.showErrorMessage(`Failed to open PR #${item.message.prNumber}: ${error}`);
		} finally {
			// Clear loading state after a delay to give time for the PR view to open
			setTimeout(() => {
				this.slackTreeDataProvider.setLoadingPr(undefined);
			}, 2000);
		}
	}
}

class OpenPRInBrowser extends Command {

	public readonly name = 'vs-code-codereview.openPrInBrowser';

	constructor(public readonly slackService: SlackService, public readonly slackTreeDataProvider: SlackTreeDataProvider) {
		super();
	}

	async execute(item: SlackMessageItem): Promise<void> {
		if (!item || !item.message.prUrl) {
			vscode.window.showWarningMessage('No PR URL available for this item');
			return;
		}
		try {
			await vscode.env.openExternal(vscode.Uri.parse(item.message.prUrl));
		} catch (error) {
			console.error('Failed to open PR in browser:', error);
			vscode.window.showErrorMessage(`Failed to open PR in browser: ${error}`);
		}
	}
}
