/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import * as vscode from 'vscode';
import { TrustedFolders } from './TrustedFolders';

/**
 * Status bar surface for Son of Anton's per-workspace trust gate.
 *
 * Visibility rule: the item is shown **only** when the platform's workspace
 * trust is granted but Son of Anton's per-workspace consent has not been
 * given. This keeps the status bar quiet in the common case (workspace
 * fully trusted) and avoids competing with VS Code's own restricted-mode
 * banner when platform trust itself is missing.
 *
 * Click target is `sota.grantWorkspaceTrust`, which triggers the same modal
 * prompt the chat surface fires before its first run.
 */
export class TrustStatusBarItem implements vscode.Disposable {
	private readonly item: vscode.StatusBarItem;
	private readonly disposables: vscode.Disposable[] = [];

	constructor(private readonly trustedFolders: TrustedFolders) {
		// Priority 98 sits just left of the auth indicator (99) so the lock
		// reads as a prefix to the rest of Son of Anton's status group.
		this.item = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Left, 98);
		this.item.text = '$(lock) Trust';
		this.item.command = 'sota.grantWorkspaceTrust';
		this.item.tooltip = 'Son of Anton trust required — click to grant.';

		this.disposables.push(
			this.trustedFolders.onDidChange(() => this.refresh()),
		);
		this.disposables.push(
			vscode.workspace.onDidChangeWorkspaceFolders(() => this.refresh()),
		);
		// VS Code fires this when the platform trust state flips; we want to
		// hide the item the moment platform trust is revoked because the
		// "grant workspace trust" prompt would be moot.
		this.disposables.push(
			vscode.workspace.onDidGrantWorkspaceTrust(() => this.refresh()),
		);

		this.refresh();
	}

	/**
	 * Force a re-evaluation of the visibility rule. Exposed so callers that
	 * mutate trust state (e.g. command handlers) can repaint without waiting
	 * for an event round-trip.
	 */
	refresh(): void {
		const folder = vscode.workspace.workspaceFolders?.[0];
		if (!folder) {
			this.item.hide();
			return;
		}
		if (!vscode.workspace.isTrusted) {
			// Platform trust missing — defer to VS Code's restricted-mode UI.
			this.item.hide();
			return;
		}
		if (this.trustedFolders.isTrusted(folder.uri.fsPath)) {
			this.item.hide();
			return;
		}
		this.item.show();
	}

	dispose(): void {
		this.item.dispose();
		for (const d of this.disposables) {
			d.dispose();
		}
		this.disposables.length = 0;
	}
}
