import * as vscode from 'vscode';
import { SlackService } from './service';
import { SlackTreeDataProvider } from './treeDataProvider';

export class SlackSessionManager extends vscode.Disposable {

	private readonly REFRESH_INTERVAL_MS = 60000;

	private readonly _onDidChangeSessions: vscode.Disposable;

	private _autoRefresh: vscode.Disposable | undefined;

	constructor(
		private readonly slackService: SlackService,
		private readonly slackTreeDataProvider: SlackTreeDataProvider
	) {
		super(() => this.dispose());
		this._onDidChangeSessions = vscode.authentication.onDidChangeSessions(async (e) => this._onDidChangeSession(e));
		this._updateSession();
	}

	private async _onDidChangeSession(e: vscode.AuthenticationSessionsChangeEvent): Promise<void> {
		if (e.provider.id !== 'slack') {
			return;
		}
		this._updateSession();
	}

	private async _updateSession() {
		const isAuthenticated = await this.slackService.isAuthenticated();
		if (!isAuthenticated) {
			this._autoRefresh?.dispose();
			this.slackService.onSignOut();
			return;
		}
		this._createNewSession();
	}

	private async _createNewSession() {
		this.slackTreeDataProvider.refresh();
		await this.slackTreeDataProvider.fetchMessages();
		this._autoRefresh = this._triggerAutoRefresh();
	}

	private _triggerAutoRefresh(): vscode.Disposable {
		const autoRefreshInterval = setInterval(async () => {
			await this.slackTreeDataProvider.fetchMessages();
		}, this.REFRESH_INTERVAL_MS);
		return {
			dispose: () => clearInterval(autoRefreshInterval)
		};
	}

	override dispose() {
		this._onDidChangeSessions.dispose();
		this._autoRefresh?.dispose();
	}
}
