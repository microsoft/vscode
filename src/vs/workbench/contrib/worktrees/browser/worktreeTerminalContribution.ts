/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Disposable } from '../../../../base/common/lifecycle.js';
import { autorun } from '../../../../base/common/observable.js';
import { ILogService } from '../../../../platform/log/common/log.js';
import { TerminalCapability } from '../../../../platform/terminal/common/capabilities/capabilities.js';
import { IWorkbenchContribution } from '../../../common/contributions.js';
import { ITerminalInstance, ITerminalService } from '../../terminal/browser/terminal.js';
import { IWorktree, IWorktreeGroupService } from '../../../services/worktrees/common/worktrees.js';

/**
 * Filters terminal visibility by the active worktree's filesystem path.
 *
 * - Terminals whose initial cwd matches the active worktree are foreground.
 * - Terminals whose initial cwd matches some other (known) worktree are
 *   hidden into the background and shown again when the user switches back.
 * - Terminals with cwds outside any known worktree are left alone — they
 *   may belong to unrelated folders.
 * - `hideFromUser` terminals are never touched (managed by their owners,
 *   e.g. the chat tool lifecycle).
 *
 * Terminals are never killed on a worktree switch — only re-parented.
 */
export class WorktreeTerminalContribution extends Disposable implements IWorkbenchContribution {

	static readonly ID = 'workbench.contrib.worktrees.terminal';

	private _activeKey: string | undefined;

	constructor(
		@IWorktreeGroupService private readonly _worktreeGroupService: IWorktreeGroupService,
		@ITerminalService private readonly _terminalService: ITerminalService,
		@ILogService private readonly _logService: ILogService,
	) {
		super();

		this._register(autorun(reader => {
			const active = this._worktreeGroupService.activeWorktree.read(reader);
			const all = this._worktreeGroupService.worktrees.read(reader);
			void this._onActiveWorktreeChanged(active, all);
		}));

		// Hide restored terminals that arrive asynchronously after a window
		// reload and don't belong to the current worktree.
		this._register(this._terminalService.onDidCreateInstance(instance => {
			if (instance.shellLaunchConfig.hideFromUser) {
				return;
			}
			if (instance.shellLaunchConfig.attachPersistentProcess && this._activeKey) {
				instance.getInitialCwd().then(cwd => {
					if (!cwd || this._activeKey === undefined) {
						return;
					}
					if (cwd.toLowerCase() !== this._activeKey) {
						const available = this._getAvailableTerminal(instance);
						if (available) {
							this._terminalService.moveToBackground(available);
							this._logService.trace(`[WorktreeTerminal] Hid restored terminal ${available.instanceId} (cwd: ${cwd})`);
						}
					}
				});
			}
		}));
	}

	private async _onActiveWorktreeChanged(active: IWorktree | undefined, all: readonly IWorktree[]): Promise<void> {
		if (!active) {
			this._activeKey = undefined;
			return;
		}

		const targetKey = active.uri.fsPath.toLowerCase();
		if (this._activeKey === targetKey) {
			return;
		}
		this._activeKey = targetKey;

		const knownKeys = new Set<string>();
		for (const wt of all) {
			knownKeys.add(wt.uri.fsPath.toLowerCase());
		}

		await this._updateTerminalVisibility(targetKey, knownKeys);
	}

	private async _updateTerminalVisibility(activeKey: string, knownKeys: ReadonlySet<string>): Promise<void> {
		const toShow: ITerminalInstance[] = [];
		const toHide: ITerminalInstance[] = [];

		for (const instance of [...this._terminalService.instances]) {
			if (instance.shellLaunchConfig.hideFromUser) {
				continue;
			}
			let cwd: string;
			try {
				cwd = (await instance.getInitialCwd()).toLowerCase();
			} catch {
				continue;
			}
			const available = this._getAvailableTerminal(instance);
			if (!available) {
				continue;
			}

			const belongsToActive = cwd === activeKey;
			const belongsToKnownWorktree = knownKeys.has(cwd);
			const isForeground = this._terminalService.foregroundInstances.includes(available);

			if (belongsToActive && !isForeground) {
				toShow.push(available);
			} else if (belongsToKnownWorktree && !belongsToActive && isForeground) {
				toHide.push(available);
			}
		}

		for (const instance of toShow) {
			const available = this._getAvailableTerminal(instance);
			if (available) {
				await this._terminalService.showBackgroundTerminal(available, true);
			}
		}
		for (const instance of toHide) {
			const available = this._getAvailableTerminal(instance);
			if (available) {
				this._terminalService.moveToBackground(available);
			}
		}

		// Promote the foreground terminal with the most recent activity as active.
		let mostRecent: ITerminalInstance | undefined;
		let mostRecentTimestamp = -1;
		for (const instance of this._terminalService.foregroundInstances) {
			const cmdDetection = instance.capabilities.get(TerminalCapability.CommandDetection);
			const lastCmd = cmdDetection?.commands.at(-1);
			if (lastCmd && lastCmd.timestamp > mostRecentTimestamp) {
				mostRecentTimestamp = lastCmd.timestamp;
				mostRecent = instance;
			}
		}
		if (mostRecent) {
			this._terminalService.setActiveInstance(mostRecent);
		}
	}

	private _getAvailableTerminal(instance: ITerminalInstance): ITerminalInstance | undefined {
		const current = this._terminalService.getInstanceFromId(instance.instanceId);
		if (!current || current.isDisposed) {
			return undefined;
		}
		return current;
	}
}
