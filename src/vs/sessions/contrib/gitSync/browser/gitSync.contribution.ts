/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Disposable, DisposableStore, IDisposable, MutableDisposable } from '../../../../base/common/lifecycle.js';
import { autorun } from '../../../../base/common/observable.js';
import { Codicon } from '../../../../base/common/codicons.js';
import { localize } from '../../../../nls.js';
import { Action2, MenuId, registerAction2 } from '../../../../platform/actions/common/actions.js';
import { ICommandService } from '../../../../platform/commands/common/commands.js';
import { IContextKeyService, RawContextKey } from '../../../../platform/contextkey/common/contextkey.js';
import { ServicesAccessor } from '../../../../platform/instantiation/common/instantiation.js';
import { IWorkbenchContribution, registerWorkbenchContribution2, WorkbenchPhase } from '../../../../workbench/common/contributions.js';
import { CHAT_CATEGORY } from '../../../../workbench/contrib/chat/browser/actions/chatActions.js';
import { IGitService } from '../../../../workbench/contrib/git/common/gitService.js';
import { ISessionsManagementService } from '../../sessions/browser/sessionsManagementService.js';

const hasGitSyncChangesContextKey = new RawContextKey<boolean>('agentSessionHasGitSyncChanges', false, {
	type: 'boolean',
	description: localize('agentSessionHasGitSyncChanges', "True when the active agent session worktree has ahead or behind commits relative to its upstream.")
});

class GitSyncContribution extends Disposable implements IWorkbenchContribution {

	static readonly ID = 'sessions.contrib.gitSync';

	private readonly _syncActionDisposable = this._register(new MutableDisposable());
	private readonly _gitRepoDisposables = this._register(new DisposableStore());

	constructor(
		@IContextKeyService private readonly contextKeyService: IContextKeyService,
		@ISessionsManagementService private readonly sessionManagementService: ISessionsManagementService,
		@IGitService private readonly gitService: IGitService,
	) {
		super();

		const contextKey = hasGitSyncChangesContextKey.bindTo(this.contextKeyService);

		this._register(autorun(reader => {
			const activeSession = this.sessionManagementService.activeSession.read(reader);
			this._gitRepoDisposables.clear();

			const worktreeUri = activeSession ? this.sessionManagementService.getActiveSession()?.worktree : undefined;
			if (!worktreeUri) {
				this._syncActionDisposable.clear();
				contextKey.set(false);
				return;
			}

			const repoDisposables = this._gitRepoDisposables.add(new DisposableStore());
			this.gitService.openRepository(worktreeUri).then(repository => {
				if (repoDisposables.isDisposed) {
					return;
				}
				if (!repository) {
					this._syncActionDisposable.clear();
					contextKey.set(false);
					return;
				}
				repoDisposables.add(autorun(innerReader => {
					const state = repository.state.read(innerReader);
					const head = state.HEAD;
					if (!head?.upstream) {
						this._syncActionDisposable.clear();
						contextKey.set(false);
						return;
					}
					const ahead = head.ahead ?? 0;
					const behind = head.behind ?? 0;
					const hasSyncChanges = ahead > 0 || behind > 0;
					contextKey.set(hasSyncChanges);
					this._syncActionDisposable.value = registerSyncAction(behind, ahead);
				}));
			});
		}));
	}
}

function registerSyncAction(behind: number, ahead: number): IDisposable {
	if (behind === 0 && ahead === 0) {
		return Disposable.None;
	}
	let title = '';
	if (behind > 0) {
		title += `${behind}↓ `;
	}
	if (ahead > 0) {
		title += `${ahead}↑`;
	}

	class SynchronizeChangesAction extends Action2 {
		static readonly ID = 'chatEditing.synchronizeChanges';

		constructor() {
			super({
				id: SynchronizeChangesAction.ID,
				title,
				tooltip: localize('synchronizeChanges', "Synchronize Changes with Git (Behind {0}, Ahead {1})", behind, ahead),
				icon: Codicon.sync,
				category: CHAT_CATEGORY,
				menu: [
					{
						id: MenuId.ChatEditingSessionChangesToolbar,
						group: 'navigation',
						order: 5,
						when: hasGitSyncChangesContextKey,
					},
				],
			});
		}

		override async run(accessor: ServicesAccessor): Promise<void> {
			const commandService = accessor.get(ICommandService);
			const sessionManagementService = accessor.get(ISessionsManagementService);
			const worktreeUri = sessionManagementService.getActiveSession()?.worktree;
			await commandService.executeCommand('git.sync', worktreeUri);
		}
	}
	return registerAction2(SynchronizeChangesAction);
}

registerWorkbenchContribution2(GitSyncContribution.ID, GitSyncContribution, WorkbenchPhase.AfterRestored);
