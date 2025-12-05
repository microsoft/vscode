import * as vscode from 'vscode';
import { SlackTreeDataProvider } from './treeDataProvider';

export class SlackView extends vscode.Disposable {

	private SLACK_CODE_REVIEW_VIEW_ID = 'codereview-slack-messages';

	private _treeView: vscode.TreeView<any>;

	constructor(slackTreeDataProvider: SlackTreeDataProvider) {
		super(() => this.dispose());
		this._treeView = vscode.window.createTreeView(this.SLACK_CODE_REVIEW_VIEW_ID, { treeDataProvider: slackTreeDataProvider });
		slackTreeDataProvider.setOnMessageCountChanged((count) => this._onMessageCountChanged(count));
	}

	private _onMessageCountChanged(count: number) {
		this._treeView.badge = count > 0 ? { value: count, tooltip: `${count} code review message${count !== 1 ? 's' : ''}` } : undefined;
	}

	override dispose() {
		this._treeView.dispose();
	}
}
