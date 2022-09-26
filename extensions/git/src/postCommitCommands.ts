/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as nls from 'vscode-nls';
import { Command, commands, Disposable, Event, EventEmitter, Memento, Uri, workspace } from 'vscode';
import { PostCommitCommandsProvider } from './api/git';
import { Operation, Repository } from './repository';
import { ApiRepository } from './api/api1';
import { dispose } from './util';

export interface IPostCommitCommandsProviderRegistry {
	readonly onDidChangePostCommitCommandsProviders: Event<void>;

	getPostCommitCommandsProviders(): PostCommitCommandsProvider[];
	registerPostCommitCommandsProvider(provider: PostCommitCommandsProvider): Disposable;
}

const localize = nls.loadMessageBundle();

export class GitPostCommitCommandsProvider implements PostCommitCommandsProvider {
	getCommands(apiRepository: ApiRepository): Command[] {
		const config = workspace.getConfiguration('git', Uri.file(apiRepository.repository.root));

		// Branch protection
		const isBranchProtected = apiRepository.repository.isBranchProtected();
		const branchProtectionPrompt = config.get<'alwaysCommit' | 'alwaysCommitToNewBranch' | 'alwaysPrompt'>('branchProtectionPrompt')!;
		const alwaysPrompt = isBranchProtected && branchProtectionPrompt === 'alwaysPrompt';
		const alwaysCommitToNewBranch = isBranchProtected && branchProtectionPrompt === 'alwaysCommitToNewBranch';

		// Icon
		const icon = alwaysPrompt ? '$(lock)' : alwaysCommitToNewBranch ? '$(git-branch)' : undefined;

		// Tooltip (default)
		let pushCommandTooltip = !alwaysCommitToNewBranch ?
			localize('scm button commit and push tooltip', "Commit & Push Changes") :
			localize('scm button commit to new branch and push tooltip', "Commit to New Branch & Push Changes");

		let syncCommandTooltip = !alwaysCommitToNewBranch ?
			localize('scm button commit and sync tooltip', "Commit & Sync Changes") :
			localize('scm button commit to new branch and sync tooltip', "Commit to New Branch & Synchronize Changes");

		// Tooltip (in progress)
		if (apiRepository.repository.operations.isRunning(Operation.Commit)) {
			pushCommandTooltip = !alwaysCommitToNewBranch ?
				localize('scm button committing and pushing tooltip', "Committing & Pushing Changes...") :
				localize('scm button committing to new branch and pushing tooltip', "Committing to New Branch & Pushing Changes...");

			syncCommandTooltip = !alwaysCommitToNewBranch ?
				localize('scm button committing and syncing tooltip', "Committing & Synchronizing Changes...") :
				localize('scm button committing to new branch and syncing tooltip', "Committing to New Branch & Synchronizing Changes...");
		}

		return [
			{
				command: 'git.push',
				title: localize('scm button commit and push title', "{0} Commit & Push", icon ?? '$(arrow-up)'),
				tooltip: pushCommandTooltip
			},
			{
				command: 'git.sync',
				title: localize('scm button commit and sync title', "{0} Commit & Sync", icon ?? '$(sync)'),
				tooltip: syncCommandTooltip
			},
		];
	}
}

export class CommitCommandsCenter {

	private _onDidChange = new EventEmitter<void>();
	get onDidChange(): Event<void> { return this._onDidChange.event; }

	private disposables: Disposable[] = [];

	constructor(
		private readonly globalState: Memento,
		private readonly repository: Repository,
		private readonly postCommitCommandsProviderRegistry: IPostCommitCommandsProviderRegistry
	) {
		const root = Uri.file(repository.root);

		const onRememberPostCommitCommandChange = async () => {
			const config = workspace.getConfiguration('git', root);
			if (!config.get<boolean>('rememberPostCommitCommand')) {
				await this.globalState.update(repository.root, undefined);
			}
		};
		this.disposables.push(workspace.onDidChangeConfiguration(e => {
			if (e.affectsConfiguration('git.rememberPostCommitCommand', root)) {
				onRememberPostCommitCommandChange();
			}
		}));
		onRememberPostCommitCommandChange();

		this.disposables.push(postCommitCommandsProviderRegistry.onDidChangePostCommitCommandsProviders(() => this._onDidChange.fire()));
	}

	getPrimaryCommand(): Command {
		const allCommands = this.getSecondaryCommands().map(c => c).flat();
		const commandFromStorage = allCommands.find(c => c.arguments?.length === 2 && c.arguments[1] === this.getPostCommitCommandStringFromStorage());
		const commandFromSetting = allCommands.find(c => c.arguments?.length === 2 && c.arguments[1] === this.getPostCommitCommandStringFromSetting());

		return commandFromStorage ?? commandFromSetting ?? this.getCommitCommand();
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
			commandGroups[0].splice(0, 0, this.getCommitCommand());
		}

		return commandGroups;
	}

	async executePostCommitCommand(command: string | undefined): Promise<void> {
		if (command === undefined) {
			// Commit WAS NOT initiated using the action button (ex: keybinding, toolbar action,
			// command palette) so we have to honour the default post commit command (memento/setting).
			const primaryCommand = this.getPrimaryCommand();
			command = primaryCommand.arguments?.length === 2 ? primaryCommand.arguments[1] : '';
		}

		if (command?.length) {
			await commands.executeCommand(command, new ApiRepository(this.repository));
		}

		await this.savePostCommitCommand(command);
	}

	private getCommitCommand(): Command {
		const config = workspace.getConfiguration('git', Uri.file(this.repository.root));

		// Branch protection
		const isBranchProtected = this.repository.isBranchProtected();
		const branchProtectionPrompt = config.get<'alwaysCommit' | 'alwaysCommitToNewBranch' | 'alwaysPrompt'>('branchProtectionPrompt')!;
		const alwaysPrompt = isBranchProtected && branchProtectionPrompt === 'alwaysPrompt';
		const alwaysCommitToNewBranch = isBranchProtected && branchProtectionPrompt === 'alwaysCommitToNewBranch';

		// Icon
		const icon = alwaysPrompt ? '$(lock)' : alwaysCommitToNewBranch ? '$(git-branch)' : undefined;

		// Tooltip (default)
		let tooltip = !alwaysCommitToNewBranch ?
			localize('scm button commit tooltip', "Commit Changes") :
			localize('scm button commit to new branch tooltip', "Commit Changes to New Branch");

		// Tooltip (in progress)
		if (this.repository.operations.isRunning(Operation.Commit)) {
			tooltip = !alwaysCommitToNewBranch ?
				localize('scm button committing tooltip', "Committing Changes...") :
				localize('scm button committing to new branch tooltip', "Committing Changes to New Branch...");
		}

		return { command: 'git.commit', title: localize('scm button commit title', "{0} Commit", icon ?? '$(check)'), tooltip, arguments: [this.repository.sourceControl, ''] };
	}

	private getPostCommitCommandStringFromSetting(): string | undefined {
		const config = workspace.getConfiguration('git', Uri.file(this.repository.root));
		const postCommitCommandSetting = config.get<string>('postCommitCommand');

		return postCommitCommandSetting === 'push' || postCommitCommandSetting === 'sync' ? `git.${postCommitCommandSetting}` : undefined;
	}

	private getPostCommitCommandStringFromStorage(): string | undefined {
		if (!this.isRememberPostCommitCommandEnabled()) {
			return undefined;
		}

		return this.globalState.get<string>(this.repository.root);
	}

	private isRememberPostCommitCommandEnabled(): boolean {
		const config = workspace.getConfiguration('git', Uri.file(this.repository.root));
		return config.get<boolean>('rememberPostCommitCommand') === true;
	}

	private async savePostCommitCommand(command: string | undefined): Promise<void> {
		if (!this.isRememberPostCommitCommandEnabled()) {
			return;
		}

		command = command !== '' ? command : undefined;
		await this.globalState.update(this.repository.root, command);
		this._onDidChange.fire();
	}

	dispose(): void {
		this.disposables = dispose(this.disposables);
	}
}
