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
		this._createNewSession();
	}

	private async _onDidChangeSession(e: vscode.AuthenticationSessionsChangeEvent): Promise<void> {
		if (e.provider.id !== 'slack') {
			return;
		}
		this._createNewSession();
	}

	private _createNewSession() {
		(async () => {
			const isAuthenticated = await this.slackService.isAuthenticated();
			if (!isAuthenticated) {
				this._autoRefresh?.dispose();
				return;
			}
			this.slackTreeDataProvider.refresh();
			this._autoRefresh = this._triggerAutoRefresh();
			await this.slackTreeDataProvider.fetchMessages();
		})();
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
