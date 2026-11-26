/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as path from 'path';
import { Disposable, l10n, LogOutputChannel, ProgressLocation, scm, SourceControl, SourceControlInputBox, ThemeIcon, Uri, window, workspace } from 'vscode';
import { ActionButton } from './actionButton';
import { GitArtifactProvider } from './artifactProvider';
import { GitQuickDiffProvider, StagedResourceQuickDiffProvider } from './quickDiffProvider';
import type { GitResourceGroup, IRepositoryResolver, Repository } from './repository';
import { debounceEvent, dispose, EmptyDisposable, eventToPromise, filterEvent, IDisposable, isCopilotWorktreeFolder, onceEvent } from './util';
import { OperationKind } from './operation';
import type { CommitCommandsCenter } from './postCommitCommands';
import type { IRemoteSourcePublisherRegistry } from './remotePublisher';
import { StatusBarCommands } from './statusbar';
import { Status } from './api/git.constants';

class ProgressManager {

	private enabled = false;
	private disposable: IDisposable = EmptyDisposable;
	private readonly disposables: IDisposable[] = [];

	constructor(private repository: Repository) {
		const onDidChange = filterEvent(workspace.onDidChangeConfiguration, e => e.affectsConfiguration('git', Uri.file(this.repository.root)));
		onDidChange(_ => this.updateEnablement(), null, this.disposables);
		this.updateEnablement();
	}

	private updateEnablement(): void {
		const config = workspace.getConfiguration('git', Uri.file(this.repository.root));
		const showProgress = config.get<boolean>('showProgress') === true && !workspace.isAgentSessionsWorkspace;

		if (showProgress) {
			this.enable();
		} else {
			this.disable();
		}
	}

	private enable(): void {
		if (this.enabled) {
			return;
		}

		const start = onceEvent(filterEvent(this.repository.onDidChangeOperations, () => this.repository.operations.shouldShowProgress()));
		const end = onceEvent(filterEvent(debounceEvent(this.repository.onDidChangeOperations, 300), () => !this.repository.operations.shouldShowProgress()));

		const setup = () => {
			this.disposable = start(() => {
				const promise = eventToPromise(end).then(() => setup());
				window.withProgress({ location: ProgressLocation.SourceControl }, () => promise);
			});
		};

		setup();
		this.enabled = true;
	}

	private disable(): void {
		if (!this.enabled) {
			return;
		}

		this.disposable.dispose();
		this.disposable = EmptyDisposable;
		this.enabled = false;
	}

	dispose(): void {
		this.disable();
		dispose(this.disposables);
	}
}

export interface GitSourceControlOptions {
	/**
	 * Whether the repository is the one of a workspace folder location that a switch of the folder shows.
	 */
	readonly isFolderLocation: boolean;
	/**
	 * The commit message that the input box starts with, such as the one it had when the repository was detached.
	 */
	readonly commitMessage: string | undefined;
}

/**
 * The view model of a repository: owns its source control, with its resource groups, input box and providers, and
 * writes the repository model into them when the repository reports a change. Disposing it removes the repository
 * from the Source Control view without disposing the repository.
 */
export class GitSourceControl implements Disposable {

	readonly sourceControl: SourceControl;
	get inputBox(): SourceControlInputBox { return this.sourceControl.inputBox; }
	readonly artifactProvider: GitArtifactProvider;

	/**
	 * The root of the repository that this source control is shown under, if any.
	 */
	readonly parentRoot: string | undefined;

	readonly mergeGroup: GitResourceGroup;
	readonly indexGroup: GitResourceGroup;
	readonly workingTreeGroup: GitResourceGroup;
	readonly untrackedGroup: GitResourceGroup;

	private disposables: Disposable[] = [];

	constructor(
		private readonly repository: Repository,
		repositoryResolver: IRepositoryResolver,
		remoteSourcePublisherRegistry: IRemoteSourcePublisherRegistry,
		commitCommandsCenter: CommitCommandsCenter,
		logger: LogOutputChannel,
		options: GitSourceControlOptions
	) {
		// Parent source control. Repositories opened in the Sessions app
		// don't use the parent/child relationship and it is expected for
		// a worktree repository to be opened while the main repository
		// is closed. The repository of a workspace folder location has no
		// parent either: a switch of the folder detaches the repository of
		// the location it leaves, which closes the ones shown under it.
		const parentRoot = workspace.isAgentSessionsWorkspace || options.isFolderLocation
			? undefined
			: repository.kind === 'submodule'
				? repository.dotGit.superProjectPath
				: repository.kind === 'worktree' && repository.dotGit.commonPath
					? path.dirname(repository.dotGit.commonPath)
					: undefined;
		const parent = parentRoot
			? repositoryResolver.getRepository(parentRoot)?.sourceControl.sourceControl
			: undefined;
		this.parentRoot = parent ? parentRoot : undefined;

		// Icon
		const icon = repository.kind === 'submodule'
			? new ThemeIcon('archive')
			: repository.kind === 'worktree'
				? isCopilotWorktreeFolder(repository.root)
					? new ThemeIcon('chat-sparkle')
					: new ThemeIcon('worktree')
				: new ThemeIcon('repo');

		const root = Uri.file(repository.root);
		this.sourceControl = scm.createSourceControl('git', 'Git', root, icon, parent);
		this.sourceControl.contextValue = repository.kind;
		const activeRepositoryRoot = repository.dotGit.isBare ? repository.dotGit.commonPath : parentRoot;
		this.sourceControl.activeRepositoryName = repository.kind === 'worktree' && activeRepositoryRoot
			? path.basename(activeRepositoryRoot) || undefined
			: undefined;

		this.sourceControl.quickDiffProvider = new GitQuickDiffProvider(repository, repositoryResolver, logger);
		this.sourceControl.secondaryQuickDiffProvider = new StagedResourceQuickDiffProvider(repository, logger);
		this.sourceControl.historyProvider = repository.historyProvider;

		this.artifactProvider = new GitArtifactProvider(repository, logger);
		this.sourceControl.artifactProvider = this.artifactProvider;
		this.disposables.push(this.artifactProvider);

		this.sourceControl.acceptInputCommand = { command: 'git.commit', title: l10n.t('Commit'), arguments: [this.sourceControl] };
		this.sourceControl.inputBox.validateInput = (text, position) => repository.validateInput(text, position);
		if (options.commitMessage !== undefined) {
			this.sourceControl.inputBox.value = options.commitMessage;
		}

		this.disposables.push(this.sourceControl);

		this.updateInputBoxPlaceholder();
		this.disposables.push(repository.onDidRunGitStatus(() => this.updateInputBoxPlaceholder()));

		const updateCommitTemplate = () => this.sourceControl.commitTemplate = repository.commitTemplate;
		repository.onDidChangeCommitTemplate(updateCommitTemplate, null, this.disposables);
		updateCommitTemplate();

		this.mergeGroup = this.sourceControl.createResourceGroup('merge', l10n.t('Merge Changes')) as GitResourceGroup;
		this.indexGroup = this.sourceControl.createResourceGroup('index', l10n.t('Staged Changes'), { multiDiffEditorEnableViewChanges: true }) as GitResourceGroup;
		this.workingTreeGroup = this.sourceControl.createResourceGroup('workingTree', l10n.t('Changes'), { multiDiffEditorEnableViewChanges: true }) as GitResourceGroup;
		this.untrackedGroup = this.sourceControl.createResourceGroup('untracked', l10n.t('Untracked Changes'), { multiDiffEditorEnableViewChanges: true }) as GitResourceGroup;

		const updateIndexGroupVisibility = () => {
			const config = workspace.getConfiguration('git', root);
			this.indexGroup.hideWhenEmpty = !config.get<boolean>('alwaysShowStagedChangesResourceGroup');
		};

		const onConfigListener = filterEvent(workspace.onDidChangeConfiguration, e => e.affectsConfiguration('git.alwaysShowStagedChangesResourceGroup', root));
		onConfigListener(updateIndexGroupVisibility, this, this.disposables);
		updateIndexGroupVisibility();

		const updateInputBoxVisibility = () => {
			const config = workspace.getConfiguration('git', root);
			this.sourceControl.inputBox.visible = config.get<boolean>('showCommitInput', true);
		};

		const onConfigListenerForInputBoxVisibility = filterEvent(workspace.onDidChangeConfiguration, e => e.affectsConfiguration('git.showCommitInput', root));
		onConfigListenerForInputBoxVisibility(updateInputBoxVisibility, this, this.disposables);
		updateInputBoxVisibility();

		this.mergeGroup.hideWhenEmpty = true;
		this.untrackedGroup.hideWhenEmpty = true;

		this.disposables.push(this.mergeGroup);
		this.disposables.push(this.indexGroup);
		this.disposables.push(this.workingTreeGroup);
		this.disposables.push(this.untrackedGroup);

		const onDidChangeCountBadge = filterEvent(workspace.onDidChangeConfiguration, e => e.affectsConfiguration('git.countBadge', root));
		onDidChangeCountBadge(this.setCountBadge, this, this.disposables);
		repository.onDidChangeResources(this.updateResourceStates, this, this.disposables);
		this.updateResourceStates();

		// Shows or clears the validation warning of a repository with too many changes
		repository.onDidCheckStatusLimit(() => this.sourceControl.inputBox.validateInput = this.sourceControl.inputBox.validateInput, null, this.disposables);

		const statusBar = new StatusBarCommands(repository, this.sourceControl, remoteSourcePublisherRegistry);
		this.disposables.push(statusBar);
		statusBar.onDidChange(() => this.sourceControl.statusBarCommands = statusBar.commands, null, this.disposables);
		this.sourceControl.statusBarCommands = statusBar.commands;

		const actionButton = new ActionButton(repository, this.sourceControl, commitCommandsCenter, logger);
		this.disposables.push(actionButton);
		actionButton.onDidChange(() => this.sourceControl.actionButton = actionButton.button, null, this.disposables);
		this.sourceControl.actionButton = actionButton.button;

		this.disposables.push(new ProgressManager(repository));

		if (!workspace.isAgentSessionsWorkspace) {
			// Disable input box when the commit operation is running
			const updateInputBoxEnablement = () => this.sourceControl.inputBox.enabled = !repository.operations.isRunning(OperationKind.Commit);
			repository.onDidChangeOperations(updateInputBoxEnablement, null, this.disposables);
			updateInputBoxEnablement();
		}
	}

	private updateResourceStates(): void {
		this.indexGroup.resourceStates = [...this.repository.indexChanges];
		this.mergeGroup.resourceStates = [...this.repository.mergeChanges];
		this.untrackedGroup.resourceStates = [...this.repository.untrackedChanges];
		this.workingTreeGroup.resourceStates = [...this.repository.workingTreeChanges];
		this.setCountBadge();
	}

	private setCountBadge(): void {
		const config = workspace.getConfiguration('git', Uri.file(this.repository.root));
		const countBadge = config.get<'all' | 'tracked' | 'off'>('countBadge');
		const untrackedChanges = config.get<'mixed' | 'separate' | 'hidden'>('untrackedChanges');

		let count =
			this.repository.mergeChanges.length +
			this.repository.indexChanges.length +
			this.repository.workingTreeChanges.length;

		switch (countBadge) {
			case 'off': count = 0; break;
			case 'tracked':
				if (untrackedChanges === 'mixed') {
					count -= this.repository.workingTreeChanges.filter(r => r.type === Status.UNTRACKED || r.type === Status.IGNORED).length;
				}
				break;
			case 'all':
				if (untrackedChanges === 'separate') {
					count += this.repository.untrackedChanges.length;
				}
				break;
		}

		this.sourceControl.count = count;
	}

	private updateInputBoxPlaceholder(): void {
		const branchName = this.repository.headShortName;

		if (branchName) {
			// '{0}' will be replaced by the corresponding key-command later in the process, which is why it needs to stay.
			this.sourceControl.inputBox.placeholder = l10n.t('Message ({0} to commit on "{1}")', '{0}', branchName);
		} else {
			this.sourceControl.inputBox.placeholder = l10n.t('Message ({0} to commit)');
		}
	}

	dispose(): void {
		this.disposables = dispose(this.disposables);
	}
}
