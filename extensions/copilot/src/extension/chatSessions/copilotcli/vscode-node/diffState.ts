/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as vscode from 'vscode';
import { ILogger } from '../../../../platform/log/common/logService';

export interface ActiveDiff {
	diffId: string;
	sessionId?: string;
	tabName: string;
	originalUri: vscode.Uri;
	modifiedUri: vscode.Uri;
	newContents: string;
	cleanup: () => void;
	resolve: (result: { status: 'SAVED' | 'REJECTED'; trigger: string }) => void;
}

function isDiffTab(tab: vscode.Tab): tab is vscode.Tab & { input: vscode.TabInputTextDiff } {
	return tab.input instanceof vscode.TabInputTextDiff;
}

export class DiffStateManager {
	private readonly _activeDiffs = new Map<string, ActiveDiff>();

	constructor(private readonly _logger: ILogger) { }

	register(diff: ActiveDiff): void {
		this._logger.trace(`[DIFF] registerActiveDiff: tabName=${diff.tabName}, diffId=${diff.diffId}, mapSize=${this._activeDiffs.size}`);
		this._activeDiffs.set(diff.diffId, diff);
		this._logger.trace(`[DIFF] After register, mapSize=${this._activeDiffs.size}`);
		this._updateContext();
	}

	unregister(diffId: string): void {
		const diff = this._activeDiffs.get(diffId);
		this._logger.trace(`[DIFF] unregisterActiveDiff: diffId=${diffId}, found=${!!diff}, mapSize=${this._activeDiffs.size}`);
		this._activeDiffs.delete(diffId);
		this._logger.trace(`[DIFF] After unregister, mapSize=${this._activeDiffs.size}`);
		this._updateContext();
	}

	getByTabName(tabName: string): ActiveDiff | undefined {
		for (const diff of this._activeDiffs.values()) {
			if (diff.tabName === tabName) {
				return diff;
			}
		}
		return undefined;
	}

	getByTab(tab: vscode.Tab): ActiveDiff | undefined {
		if (!isDiffTab(tab)) {
			this._logger.trace('[DIFF] getActiveDiffByTab: tab is not a diff tab');
			return undefined;
		}
		const modifiedUri = tab.input.modified.toString();
		this._logger.trace(`[DIFF] getActiveDiffByTab: looking for modifiedUri=${modifiedUri}, mapSize=${this._activeDiffs.size}`);
		for (const diff of this._activeDiffs.values()) {
			this._logger.trace(`[DIFF]   checking diff.modifiedUri=${diff.modifiedUri.toString()}`);
			if (diff.modifiedUri.toString() === modifiedUri) {
				this._logger.trace('[DIFF]   MATCH found');
				return diff;
			}
		}
		this._logger.trace('[DIFF]   No match found');
		return undefined;
	}

	getForCurrentTab(): ActiveDiff | undefined {
		const activeTab = vscode.window.tabGroups.activeTabGroup.activeTab;
		this._logger.trace(`[DIFF] getActiveDiffForCurrentTab: activeTab=${activeTab?.label ?? 'none'}`);
		if (activeTab) {
			return this.getByTab(activeTab);
		}
		return undefined;
	}

	hasActiveDiffs(): boolean {
		return this._activeDiffs.size > 0;
	}

	closeAllForSession(sessionId: string): void {
		const toClose: ActiveDiff[] = [];
		for (const diff of this._activeDiffs.values()) {
			if (diff.sessionId === sessionId) {
				toClose.push(diff);
			}
		}
		this._logger.info(`[DIFF] Closing ${toClose.length} diff(s) for disconnected session ${sessionId}`);
		for (const diff of toClose) {
			diff.resolve({ status: 'REJECTED', trigger: 'client_disconnected' });
		}
	}

	setupContextTracking(): vscode.Disposable[] {
		const disposables: vscode.Disposable[] = [];
		disposables.push(
			vscode.window.tabGroups.onDidChangeTabGroups(() => {
				this._updateContext();
			})
		);
		disposables.push(
			vscode.window.tabGroups.onDidChangeTabs(() => {
				this._updateContext();
			})
		);
		return disposables;
	}

	private _updateContext(): void {
		const activeTab = vscode.window.tabGroups.activeTabGroup.activeTab;
		const isActiveDiff = activeTab ? this.getByTab(activeTab) !== undefined : false;
		void vscode.commands.executeCommand('setContext', 'github.copilot.chat.copilotCLI.hasActiveDiff', isActiveDiff).then(undefined, err => {
			this._logger.error(`[DIFF] Failed to update hasActiveDiff context: ${String(err)}`);
		});
	}
}
