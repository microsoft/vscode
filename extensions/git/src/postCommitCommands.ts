/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Command, commands, Disposable, Event, EventEmitter, Memento, Uri, workspace, l10n } from 'vscode';
import { PostCommitCommandsProvider } from './api/git';
import { IRepositoryResolver, Repository } from './repository';
import { ApiRepository } from './api/api1';
import { dispose } from './util';
import { OperationKind } from './operation';

export interface IPostCommitCommandsProviderRegistry {
	readonly onDidChangePostCommitCommandsProviders: Event<void>;

	getPostCommitCommandsProviders(): PostCommitCommandsProvider[];
	registerPostCommitCommandsProvider(provider: PostCommitCommandsProvider): Disposable;
}

export class GitPostCommitCommandsProvider implements PostCommitCommandsProvider {
	constructor(private readonly _repositoryResolver: IRepositoryResolver) { }

	getCommands(apiRepository: ApiRepository): Command[] {
		const repository = this._repositoryResolver.getRepository(apiRepository.rootUri);
		if (!repository) {
			return [];
		}

		const config = workspace.getConfiguration('git', Uri.file(repository.root));

		// Branch protection
		const isBranchProtected = repository.isBranchProtected();
		const branchProtectionPrompt = config.get<'alwaysCommit' | 'alwaysCommitToNewBranch' | 'alwaysPrompt'>('branchProtectionPrompt')!;
		const alwaysPrompt = isBranchProtected && branchProtectionPrompt === 'alwaysPrompt';
		const alwaysCommitToNewBranch = isBranchProtected && branchProtectionPrompt === 'alwaysCommitToNewBranch';

		// Icon
		const isCommitInProgress = repository.operations.isRunning(OperationKind.Commit) || repository.operations.isRunning(OperationKind.PostCommitCommand);
		const icon = isCommitInProgress ? '$(sync~spin)' : alwaysPrompt ? '$(lock)' : alwaysCommitToNewBranch ? '$(git-branch)' : undefined;

		// Tooltip (default)
		let pushCommandTooltip = !alwaysCommitToNewBranch ?
			l10n.t('Commit & Push Changes') :
			l10n.t('Commit to New Branch & Push Changes');

		let syncCommandTooltip = !alwaysCommitToNewBranch ?
			l10n.t('Commit & Sync Changes') :
			l10n.t('Commit to New Branch & Synchronize Changes');

		// Tooltip (in progress)
		if (isCommitInProgress) {
			pushCommandTooltip = !alwaysCommitToNewBranch ?
				l10n.t('Committing & Pushing Changes...') :
				l10n.t('Committing to New Branch & Pushing Changes...');

			syncCommandTooltip = !alwaysCommitToNewBranch ?
				l10n.t('Committing & Synchronizing Changes...') :
				l10n.t('Committing to New Branch & Synchronizing Changes...');
		}

		return [
			{
				command: 'git.push',
				title: l10n.t('{0} Commit & Push', icon ?? '$(arrow-up)'),
				tooltip: pushCommandTooltip
			},
			{
				command: 'git.sync',
				title: l10n.t('{0} Commit & Sync', icon ?? '$(sync)'),
				tooltip: syncCommandTooltip
			},
		];
	}
}

export class CommitCommandsCenter {

	private _onDidChange = new EventEmitter<void>();
	get onDidChange(): Event<void> { return this._onDidChange.event; }

	private disposables: Disposable[] = [];

	set postCommitCommand(command: string | null | undefined) {
		if (command === undefined) {
			// Commit WAS NOT initiated using the action button
			// so there is no need to store the post-commit command
			return;
		}

		this.globalState.update(this.getGlobalStateKey(), command)
			.then(() => this._onDidChange.fire());
	}

	constructor(
		private readonly globalState: Memento,
		private readonly repository: Repository,
		private readonly postCommitCommandsProviderRegistry: IPostCommitCommandsProviderRegistry
	) {
		const root = Uri.file(repository.root);

		// Migrate post commit command storage
		this.migratePostCommitCommandStorage()
			.then(() => {
				const onRememberPostCommitCommandChange = async () => {
					const config = workspace.getConfiguration('git', root);
					if (!config.get<boolean>('rememberPostCommitCommand')) {
						await this.globalState.update(this.getGlobalStateKey(), undefined);
					}
				};
				this.disposables.push(workspace.onDidChangeConfiguration(e => {
					if (e.affectsConfiguration('git.rememberPostCommitCommand', root)) {
						onRememberPostCommitCommandChange();
					}
				}));
				onRememberPostCommitCommandChange();

				this.disposables.push(postCommitCommandsProviderRegistry.onDidChangePostCommitCommandsProviders(() => this._onDidChange.fire()));
			});
	}

	getPrimaryCommand(): Command {
		const allCommands = this.getSecondaryCommands().map(c => c).flat();
		const commandFromStorage = allCommands.find(c => c.arguments?.length === 2 && c.arguments[1] === this.getPostCommitCommandStringFromStorage());
		const commandFromSetting = allCommands.find(c => c.arguments?.length === 2 && c.arguments[1] === this.getPostCommitCommandStringFromSetting());

		return commandFromStorage ?? commandFromSetting ?? this.getCommitCommands()[0];
	}

	getSecondaryCommands(): Command[][] {
		const commandGroups: Command[][] = [];

		for (const provider of this.postCommitCommandsProviderRegistry.getPostCommitCommandsProviders()) {
			const commands = provider.getCommands(new ApiRepository(this.repository));
			commandGroups.push((commands ?? []).map(c => {
				return { command: 'git.commit', title: c.title, tooltip: c.tooltip, arguments: [this.repository.sourceControl, c.command] };
			}));
		}

		if (commandGroups.length > 0) {
			commandGroups.splice(0, 0, this.getCommitCommands());
		}

		return commandGroups;
	}

	async executePostCommitCommand(command: string | null | undefined): Promise<void> {
		try {
			if (command === null) {
				// No post-commit command
				return;
			}

			if (command === undefined) {
				// Commit WAS NOT initiated using the action button (ex: keybinding, toolbar action,
				// command palette) so we have to honour the default post commit command (memento/setting).
				const primaryCommand = this.getPrimaryCommand();
				command = primaryCommand.arguments?.length === 2 ? primaryCommand.arguments[1] : null;
			}

			if (command !== null) {
				await commands.executeCommand(command!.toString(), new ApiRepository(this.repository));
			}
		} catch (err) {
			throw err;
		}
		finally {
			if (!this.isRememberPostCommitCommandEnabled()) {
				await this.globalState.update(this.getGlobalStateKey(), undefined);
				this._onDidChange.fire();
			}
		}
	}

	private getGlobalStateKey(): string {
		return `postCommitCommand:${this.repository.root}`;
	}

	private getCommitCommands(): Command[] {
		const config = workspace.getConfiguration('git', Uri.file(this.repository.root));

		// Branch protection
		const isBranchProtected = this.repository.isBranchProtected();
		const branchProtectionPrompt = config.get<'alwaysCommit' | 'alwaysCommitToNewBranch' | 'alwaysPrompt'>('branchProtectionPrompt')!;
		const alwaysPrompt = isBranchProtected && branchProtectionPrompt === 'alwaysPrompt';
		const alwaysCommitToNewBranch = isBranchProtected && branchProtectionPrompt === 'alwaysCommitToNewBranch';

		// Icon
		const icon = alwaysPrompt ? '$(lock)' : alwaysCommitToNewBranch ? '$(git-branch)' : undefined;

		// Tooltip (default)
		const branch = this.repository.HEAD?.name;
		let tooltip = alwaysCommitToNewBranch ?
			l10n.t('Commit Changes to New Branch') :
			branch ?
				l10n.t('Commit Changes on "{0}"', branch) :
				l10n.t('Commit Changes');

		// Tooltip (in progress)
		if (this.repository.operations.isRunning(OperationKind.Commit)) {
			tooltip = !alwaysCommitToNewBranch ?
				l10n.t('Committing Changes...') :
				l10n.t('Committing Changes to New Branch...');
		}

		return [
			{ command: 'git.commit', title: l10n.t('{0} Commit', icon ?? '$(check)'), tooltip, arguments: [this.repository.sourceControl, null] },
			{ command: 'git.commitAmend', title: l10n.t('{0} Commit (Amend)', icon ?? '$(check)'), tooltip, arguments: [this.repository.sourceControl, null] },
		];
	}

	private getPostCommitCommandStringFromSetting(): string | undefined {
		const config = workspace.getConfiguration('git', Uri.file(this.repository.root));
		const postCommitCommandSetting = config.get<string>('postCommitCommand');

		return postCommitCommandSetting === 'push' || postCommitCommandSetting === 'sync' ? `git.${postCommitCommandSetting}` : undefined;
	}

	private getPostCommitCommandStringFromStorage(): string | null | undefined {
		return this.globalState.get<string | null>(this.getGlobalStateKey());
	}

	private async migratePostCommitCommandStorage(): Promise<void> {
		const postCommitCommandString = this.globalState.get<string | null>(this.repository.root);

		if (postCommitCommandString !== undefined) {
			await this.globalState.update(this.getGlobalStateKey(), postCommitCommandString);
			await this.globalState.update(this.repository.root, undefined);
		}
	}

	private isRememberPostCommitCommandEnabled(): boolean {
		const config = workspace.getConfiguration('git', Uri.file(this.repository.root));
		return config.get<boolean>('rememberPostCommitCommand') === true;
	}

	dispose(): void {
		this.disposables = dispose(this.disposables);
	}
}
