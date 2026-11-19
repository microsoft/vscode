/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as path from 'path';
import { Disposable, l10n, LogOutputChannel, ProgressLocation, scm, SourceControl, SourceControlResourceGroup, ThemeIcon, Uri, window, workspace } from 'vscode';
import { ActionButton } from './actionButton';
import { GitArtifactProvider } from './artifactProvider';
import { OperationKind } from './operation';
import { CommitCommandsCenter } from './postCommitCommands';
import { GitQuickDiffProvider, StagedResourceQuickDiffProvider } from './quickDiffProvider';
import { IRemoteSourcePublisherRegistry } from './remotePublisher';
import type { GitResourceGroup, IRepositoryResolver, Repository, Resource } from './repository';
import { StatusBarCommands } from './statusbar';
import { debounceEvent, dispose, EmptyDisposable, eventToPromise, filterEvent, IDisposable, isCopilotWorktreeFolder, onceEvent } from './util';
import { Status } from './api/git.constants';

class ProgressManager {

	private enabled = false;
	private disposable: IDisposable = EmptyDisposable;
	private readonly disposables: IDisposable[] = [];

	constructor(private readonly repository: Repository, private readonly sourceControl: SourceControl) {
		const onDidChange = filterEvent(workspace.onDidChangeConfiguration, e => e.affectsConfiguration('git', Uri.file(this.repository.root)));
		onDidChange(_ => this.updateEnablement(), null, this.disposables);
		this.updateEnablement();

		if (!workspace.isAgentSessionsWorkspace) {
			this.repository.onDidChangeOperations(() => {
				// Disable input box when the commit operation is running
				this.sourceControl.inputBox.enabled = !this.repository.operations.isRunning(OperationKind.Commit);
			}, null, this.disposables);
		}
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

/**
 * Owns every `vscode.scm` object of a repository and copies the repository
 * model into them. Disposing it removes the repository from the Source
 * Control view without disposing the repository.
 */
export class GitSourceControl implements Disposable {

	readonly sourceControl: SourceControl;
	readonly artifactProvider: GitArtifactProvider;

	private _isHidden: boolean;
	get isHidden(): boolean { return this._isHidden; }

	/**
	 * The root of the repository that this source control is shown under, if any.
	 */
	readonly parentRoot: string | undefined;

	private readonly resourceGroups: ReadonlyMap<GitResourceGroup, SourceControlResourceGroup>;
	get sourceControlResourceGroups(): SourceControlResourceGroup[] { return [...this.resourceGroups.values()]; }

	// The resource states last copied into each source control resource group
	private readonly resourceStates = new Map<GitResourceGroup, readonly Resource[]>();
	private disposables: Disposable[] = [];

	constructor(
		private readonly repository: Repository,
		commitCommandCenter: CommitCommandsCenter,
		repositoryResolver: IRepositoryResolver,
		remoteSourcePublisherRegistry: IRemoteSourcePublisherRegistry,
		logger: LogOutputChannel
	) {
		// Parent source control. Repositories opened in the Sessions app
		// don't use the parent/child relationship and it is expected for
		// a worktree repository to be opened while the main repository
		// is closed.
		const parentRoot = workspace.isAgentSessionsWorkspace
			? undefined
			: repository.kind === 'submodule'
				? repository.dotGit.superProjectPath
				: repository.kind === 'worktree' && repository.dotGit.commonPath
					? path.dirname(repository.dotGit.commonPath)
					: undefined;
		const parent = parentRoot
			? repositoryResolver.getRepository(parentRoot)?.sourceControl
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

		// Hidden
		// This is a temporary solution to hide:
		// * repositories in the empty window
		// * worktrees created by Copilot when the main repository
		//   is opened. Users can still manually open the worktree
		//   from the Repositories view.
		this._isHidden = workspace.workspaceFolders === undefined ||
			(repository.kind === 'worktree' &&
				isCopilotWorktreeFolder(repository.root) && parent !== undefined);

		const root = Uri.file(repository.root);
		this.sourceControl = scm.createSourceControl('git', 'Git', root, icon, this._isHidden || repository.isWarm, parent);
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

		this.disposables.push(this.sourceControl);

		this.updateInputBoxPlaceholder();
		this.disposables.push(repository.onDidRunGitStatus(() => this.updateInputBoxPlaceholder()));

		const mergeGroup = this.sourceControl.createResourceGroup(repository.mergeGroup.id, repository.mergeGroup.label);
		const indexGroup = this.sourceControl.createResourceGroup(repository.indexGroup.id, repository.indexGroup.label, { multiDiffEditorEnableViewChanges: true });
		const workingTreeGroup = this.sourceControl.createResourceGroup(repository.workingTreeGroup.id, repository.workingTreeGroup.label, { multiDiffEditorEnableViewChanges: true });
		const untrackedGroup = this.sourceControl.createResourceGroup(repository.untrackedGroup.id, repository.untrackedGroup.label, { multiDiffEditorEnableViewChanges: true });
		this.resourceGroups = new Map([
			[repository.mergeGroup, mergeGroup],
			[repository.indexGroup, indexGroup],
			[repository.workingTreeGroup, workingTreeGroup],
			[repository.untrackedGroup, untrackedGroup]
		]);

		const updateIndexGroupVisibility = () => {
			const config = workspace.getConfiguration('git', root);
			indexGroup.hideWhenEmpty = !config.get<boolean>('alwaysShowStagedChangesResourceGroup');
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

		mergeGroup.hideWhenEmpty = true;
		untrackedGroup.hideWhenEmpty = true;

		this.disposables.push(mergeGroup);
		this.disposables.push(indexGroup);
		this.disposables.push(workingTreeGroup);
		this.disposables.push(untrackedGroup);

		const statusBar = new StatusBarCommands(repository, this.sourceControl, remoteSourcePublisherRegistry);
		this.disposables.push(statusBar);
		const updateStatusBarCommands = () => this.sourceControl.statusBarCommands = this._isHidden || repository.isWarm ? [] : statusBar.commands;
		statusBar.onDidChange(updateStatusBarCommands, null, this.disposables);
		updateStatusBarCommands();

		const actionButton = new ActionButton(repository, this.sourceControl, commitCommandCenter, logger);
		this.disposables.push(actionButton);
		actionButton.onDidChange(() => this.sourceControl.actionButton = actionButton.button, this, this.disposables);
		this.sourceControl.actionButton = actionButton.button;

		const progressManager = new ProgressManager(repository, this.sourceControl);
		this.disposables.push(progressManager);

		const onDidChangeCountBadge = filterEvent(workspace.onDidChangeConfiguration, e => e.affectsConfiguration('git.countBadge', root));
		onDidChangeCountBadge(this.updateCount, this, this.disposables);

		this.update();
	}

	/**
	 * Hides or shows the source control as the one of a warm repository, see {@link Repository.isWarm}.
	 */
	setWarm(isWarm: boolean): void {
		if (!isWarm) {
			// A repository is shown as the one of a workspace folder's current location, so even a worktree that is
			// hidden when its main repository is open (see the constructor) is shown
			this._isHidden = false;
		}
		this.sourceControl.isHidden = this._isHidden || isWarm;
	}

	/**
	 * Copies the repository model into the source control: each changed
	 * resource group, the commit template, and the count badge.
	 */
	update(): void {
		for (const [group, sourceControlGroup] of this.resourceGroups) {
			if (this.resourceStates.get(group) !== group.resourceStates) {
				sourceControlGroup.resourceStates = group.resourceStates;
				this.resourceStates.set(group, group.resourceStates);
			}
		}

		this.sourceControl.commitTemplate = this.repository.commitTemplate;
		this.updateCount();
	}

	private updateCount(): void {
		const config = workspace.getConfiguration('git', Uri.file(this.repository.root));
		const countBadge = config.get<'all' | 'tracked' | 'off'>('countBadge');
		const untrackedChanges = config.get<'mixed' | 'separate' | 'hidden'>('untrackedChanges');

		let count =
			this.repository.mergeGroup.resourceStates.length +
			this.repository.indexGroup.resourceStates.length +
			this.repository.workingTreeGroup.resourceStates.length;

		switch (countBadge) {
			case 'off': count = 0; break;
			case 'tracked':
				if (untrackedChanges === 'mixed') {
					count -= this.repository.workingTreeGroup.resourceStates.filter(r => r.type === Status.UNTRACKED || r.type === Status.IGNORED).length;
				}
				break;
			case 'all':
				if (untrackedChanges === 'separate') {
					count += this.repository.untrackedGroup.resourceStates.length;
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
