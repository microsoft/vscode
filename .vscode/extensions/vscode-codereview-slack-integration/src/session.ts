import * as vscode from 'vscode';
import { SlackService } from './slackService';
import { SlackTreeDataProvider } from './slackTreeDataProvider';

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
		this._triggerNewSession();
	}

	private async _onDidChangeSession(e: vscode.AuthenticationSessionsChangeEvent): Promise<void> {
		if (e.provider.id !== 'slack') {
			return;
		}
		const isAuthenticated = await this.slackService.isAuthenticated();
		if (!isAuthenticated) {
			this._autoRefresh?.dispose();
			return;
		}
		this._triggerNewSession();
	}

	private _triggerNewSession() {
		(async () => {
			const isAuthenticated = await this.slackService.isAuthenticated();
			if (!isAuthenticated) {
				return;
			}
			this.slackTreeDataProvider.refresh();
			this._autoRefresh = this._triggerAutoRefresh();
			await this.slackTreeDataProvider.fetchPRs();
		})();
	}

	private _triggerAutoRefresh(): vscode.Disposable {
		const autoRefreshInterval = setInterval(async () => {
			await this.slackTreeDataProvider.fetchPRs();
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
