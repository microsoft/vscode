/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Disposable, IDisposable } from '../../../../base/common/lifecycle.js';
import { autorun, constObservable, derived, ObservablePromise, observableValue } from '../../../../base/common/observable.js';
import { Codicon } from '../../../../base/common/codicons.js';
import { ThemeIcon } from '../../../../base/common/themables.js';
import { localize } from '../../../../nls.js';
import { Action2, MenuId, registerAction2 } from '../../../../platform/actions/common/actions.js';
import { ICommandService } from '../../../../platform/commands/common/commands.js';
import { IContextKeyService, RawContextKey } from '../../../../platform/contextkey/common/contextkey.js';
import { ServicesAccessor } from '../../../../platform/instantiation/common/instantiation.js';
import { IWorkbenchContribution, registerWorkbenchContribution2, WorkbenchPhase } from '../../../../workbench/common/contributions.js';
import { CHAT_CATEGORY } from '../../../../workbench/contrib/chat/browser/actions/chatActions.js';
import { GitBranch, GitRepositoryState, IGitService } from '../../../../workbench/contrib/git/common/gitService.js';
import { ISessionsManagementService } from '../../sessions/browser/sessionsManagementService.js';

const hasUpstreamBranchContextKey = new RawContextKey<boolean>('agentSessionGitHasUpstreamBranch', false, {
	type: 'boolean',
	description: localize('agentSessionGitHasUpstreamBranch', "True when the active agent session worktree has an upstream branch."),
});

class GitSyncContribution extends Disposable implements IWorkbenchContribution {

	static readonly ID = 'sessions.contrib.gitSync';

	private readonly _isSyncingObs = observableValue<boolean>(this, false);

	constructor(
		@IContextKeyService private readonly contextKeyService: IContextKeyService,
		@ISessionsManagementService private readonly sessionManagementService: ISessionsManagementService,
		@IGitService private readonly gitService: IGitService,
	) {
		super();

		const hasUpstreamBranch = hasUpstreamBranchContextKey.bindTo(this.contextKeyService);

		const activeSessionWorktreeObs = derived(reader => {
			const activeSession = this.sessionManagementService.activeSession.read(reader);
			return activeSession?.worktree;
		});

		const activeSessionRepositoryPromiseObs = derived(reader => {
			const worktreeUri = activeSessionWorktreeObs.read(reader);
			if (!worktreeUri) {
				return constObservable(undefined);
			}

			return new ObservablePromise(this.gitService.openRepository(worktreeUri)).resolvedValue;
		});

		const activeSessionRepositoryStateObs = derived<GitRepositoryState | undefined>(reader => {
			const activeSessionRepository = activeSessionRepositoryPromiseObs.read(reader).read(reader);
			if (activeSessionRepository === undefined) {
				return undefined;
			}

			return activeSessionRepository.state.read(reader);
		});

		this._register(autorun(reader => {
			const isSyncing = this._isSyncingObs.read(reader);
			const activeSessionRepositoryState = activeSessionRepositoryStateObs.read(reader);
			if (!activeSessionRepositoryState) {
				hasUpstreamBranch.set(false);
				return;
			}

			const head = activeSessionRepositoryState.HEAD;
			hasUpstreamBranch.set(head?.upstream !== undefined);

			if (!head?.upstream) {
				return;
			}

			reader.store.add(registerSyncAction(head, isSyncing, (syncing) => {
				this._isSyncingObs.set(syncing, undefined);
			}));
		}));
	}
}

function registerSyncAction(branch: GitBranch, isSyncing: boolean, setSyncing: (syncing: boolean) => void): IDisposable {
	const ahead = branch.ahead ?? 0;
	const behind = branch.behind ?? 0;

	const titleSegments = [localize('synchronizeChangesTitle', "Sync Changes")];
	if (behind > 0) {
		titleSegments.push(`${behind}↓`);
	}
	if (ahead > 0) {
		titleSegments.push(`${ahead}↑`);
	}

	const icon = isSyncing
		? ThemeIcon.modify(Codicon.sync, 'spin')
		: Codicon.sync;

	class SynchronizeChangesAction extends Action2 {
		static readonly ID = 'chatEditing.synchronizeChanges';

		constructor() {
			super({
				id: SynchronizeChangesAction.ID,
				title: titleSegments.join(' '),
				tooltip: localize('synchronizeChanges', "Synchronize Changes with Git (Behind {0}, Ahead {1})", behind, ahead),
				icon,
				category: CHAT_CATEGORY,
				menu: [
					{
						id: MenuId.ChatEditingSessionApplySubmenu,
						group: 'navigation',
						order: 0,
						when: hasUpstreamBranchContextKey,
					},
				],
			});
		}

		override async run(accessor: ServicesAccessor): Promise<void> {
			const commandService = accessor.get(ICommandService);
			const sessionManagementService = accessor.get(ISessionsManagementService);
			const worktreeUri = sessionManagementService.getActiveSession()?.worktree;
			setSyncing(true);
			try {
				await commandService.executeCommand('git.sync', worktreeUri);
			} finally {
				setSyncing(false);
			}
		}
	}
	return registerAction2(SynchronizeChangesAction);
}

registerWorkbenchContribution2(GitSyncContribution.ID, GitSyncContribution, WorkbenchPhase.AfterRestored);
