/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { workspace, WorkspaceFoldersChangeEvent, Uri, window, Event, EventEmitter, QuickPickItem, Disposable, SourceControl, SourceControlResourceGroup, TextEditor, Memento, commands, LogOutputChannel, l10n, ProgressLocation, WorkspaceFolder } from 'vscode';
import TelemetryReporter from '@vscode/extension-telemetry';
import { IRepositoryResolver, Repository, RepositoryState } from './repository';
import { memoize, sequentialize, debounce } from './decorators';
import { dispose, anyEvent, filterEvent, isDescendant, pathEquals, toDisposable, eventToPromise } from './util';
import { Git } from './git';
import * as path from 'path';
import * as fs from 'fs';
import { fromGitUri } from './uri';
import { APIState as State, CredentialsProvider, PushErrorHandler, PublishEvent, RemoteSourcePublisher, PostCommitCommandsProvider, BranchProtectionProvider } from './api/git';
import { Askpass } from './askpass';
import { IPushErrorHandlerRegistry } from './pushError';
import { ApiRepository } from './api/api1';
import { IRemoteSourcePublisherRegistry } from './remotePublisher';
import { IPostCommitCommandsProviderRegistry } from './postCommitCommands';
import { IBranchProtectionProviderRegistry } from './branchProtection';

class RepositoryPick implements QuickPickItem {
	@memoize get label(): string {
		return path.basename(this.repository.root);
	}

	@memoize get description(): string {
		return [this.repository.headLabel, this.repository.syncLabel]
			.filter(l => !!l)
			.join(' ');
	}

	constructor(public readonly repository: Repository, public readonly index: number) { }
}

export interface ModelChangeEvent {
	repository: Repository;
	uri: Uri;
}

export interface OriginalResourceChangeEvent {
	repository: Repository;
	uri: Uri;
}

interface OpenRepository extends Disposable {
	repository: Repository;
}

class ClosedRepositoriesManager {

	private _repositories: Set<string>;
	get repositories(): string[] {
		return [...this._repositories.values()];
	}

	constructor(private readonly workspaceState: Memento) {
		this._repositories = new Set<string>(workspaceState.get<string[]>('closedRepositories', []));
		this.onDidChangeRepositories();
	}

	addRepository(repository: string): void {
		this._repositories.add(repository);
		this.onDidChangeRepositories();
	}

	deleteRepository(repository: string): boolean {
		const result = this._repositories.delete(repository);
		if (result) {
			this.onDidChangeRepositories();
		}

		return result;
	}

	isRepositoryClosed(repository: string): boolean {
		return this._repositories.has(repository);
	}

	private onDidChangeRepositories(): void {
		this.workspaceState.update('closedRepositories', [...this._repositories.values()]);
		commands.executeCommand('setContext', 'git.closedRepositoryCount', this._repositories.size);
	}
}

class ParentRepositoriesManager {

	/**
	 * Key   - normalized path used in user interface
	 * Value - value indicating whether the repository should be opened
	 */
	private _repositories = new Set<string>;
	get repositories(): string[] {
		return [...this._repositories.values()];
	}

	constructor(private readonly globalState: Memento) {
		this.onDidChangeRepositories();
	}

	addRepository(repository: string): void {
		this._repositories.add(repository);
		this.onDidChangeRepositories();
	}

	deleteRepository(repository: string): boolean {
		const result = this._repositories.delete(repository);
		if (result) {
			this.onDidChangeRepositories();
		}

		return result;
	}

	hasRepository(repository: string): boolean {
		return this._repositories.has(repository);
	}

	openRepository(repository: string): void {
		this.globalState.update(`parentRepository:${repository}`, true);
		this.deleteRepository(repository);
	}

	private onDidChangeRepositories(): void {
		commands.executeCommand('setContext', 'git.parentRepositoryCount', this._repositories.size);
	}
}

class UnsafeRepositoriesManager {

	/**
	 * Key   - normalized path used in user interface
	 * Value - path extracted from the output of the `git status` command
	 *         used when calling `git config --global --add safe.directory`
	 */
	private _repositories = new Map<string, string>();
	get repositories(): string[] {
		return [...this._repositories.keys()];
	}

	constructor() {
		this.onDidChangeRepositories();
	}

	addRepository(repository: string, path: string): void {
		this._repositories.set(repository, path);
		this.onDidChangeRepositories();
	}

	deleteRepository(repository: string): boolean {
		const result = this._repositories.delete(repository);
		if (result) {
			this.onDidChangeRepositories();
		}

		return result;
	}

	getRepositoryPath(repository: string): string | undefined {
		return this._repositories.get(repository);
	}

	hasRepository(repository: string): boolean {
		return this._repositories.has(repository);
	}

	private onDidChangeRepositories(): void {
		commands.executeCommand('setContext', 'git.unsafeRepositoryCount', this._repositories.size);
	}
}

export class Model implements IRepositoryResolver, IBranchProtectionProviderRegistry, IRemoteSourcePublisherRegistry, IPostCommitCommandsProviderRegistry, IPushErrorHandlerRegistry {

	private _onDidOpenRepository = new EventEmitter<Repository>();
	readonly onDidOpenRepository: Event<Repository> = this._onDidOpenRepository.event;

	private _onDidCloseRepository = new EventEmitter<Repository>();
	readonly onDidCloseRepository: Event<Repository> = this._onDidCloseRepository.event;

	private _onDidChangeRepository = new EventEmitter<ModelChangeEvent>();
	readonly onDidChangeRepository: Event<ModelChangeEvent> = this._onDidChangeRepository.event;

	private _onDidChangeOriginalResource = new EventEmitter<OriginalResourceChangeEvent>();
	readonly onDidChangeOriginalResource: Event<OriginalResourceChangeEvent> = this._onDidChangeOriginalResource.event;

	private openRepositories: OpenRepository[] = [];
	get repositories(): Repository[] { return this.openRepositories.map(r => r.repository); }

	private possibleGitRepositoryPaths = new Set<string>();

	private _onDidChangeState = new EventEmitter<State>();
	readonly onDidChangeState = this._onDidChangeState.event;

	private _onDidPublish = new EventEmitter<PublishEvent>();
	readonly onDidPublish = this._onDidPublish.event;

	firePublishEvent(repository: Repository, branch?: string) {
		this._onDidPublish.fire({ repository: new ApiRepository(repository), branch: branch });
	}

	private _state: State = 'uninitialized';
	get state(): State { return this._state; }

	setState(state: State): void {
		this._state = state;
		this._onDidChangeState.fire(state);
		commands.executeCommand('setContext', 'git.state', state);
	}

	@memoize
	get isInitialized(): Promise<void> {
		if (this._state === 'initialized') {
			return Promise.resolve();
		}

		return eventToPromise(filterEvent(this.onDidChangeState, s => s === 'initialized')) as Promise<any>;
	}

	private remoteSourcePublishers = new Set<RemoteSourcePublisher>();

	private _onDidAddRemoteSourcePublisher = new EventEmitter<RemoteSourcePublisher>();
	readonly onDidAddRemoteSourcePublisher = this._onDidAddRemoteSourcePublisher.event;

	private _onDidRemoveRemoteSourcePublisher = new EventEmitter<RemoteSourcePublisher>();
	readonly onDidRemoveRemoteSourcePublisher = this._onDidRemoveRemoteSourcePublisher.event;

	private postCommitCommandsProviders = new Set<PostCommitCommandsProvider>();

	private _onDidChangePostCommitCommandsProviders = new EventEmitter<void>();
	readonly onDidChangePostCommitCommandsProviders = this._onDidChangePostCommitCommandsProviders.event;

	private branchProtectionProviders = new Map<string, Set<BranchProtectionProvider>>();

	private _onDidChangeBranchProtectionProviders = new EventEmitter<Uri>();
	readonly onDidChangeBranchProtectionProviders = this._onDidChangeBranchProtectionProviders.event;

	private pushErrorHandlers = new Set<PushErrorHandler>();

	private _unsafeRepositoriesManager: UnsafeRepositoriesManager;
	get unsafeRepositories(): string[] {
		return this._unsafeRepositoriesManager.repositories;
	}

	private _parentRepositoriesManager: ParentRepositoriesManager;
	get parentRepositories(): string[] {
		return this._parentRepositoriesManager.repositories;
	}

	private _closedRepositoriesManager: ClosedRepositoriesManager;
	get closedRepositories(): string[] {
		return [...this._closedRepositoriesManager.repositories];
	}

	/**
	 * We maintain a map containing both the path and the canonical path of the
	 * workspace folders. We are doing this as `git.exe` expands the symbolic links
	 * while there are scenarios in which VS Code does not.
	 *
	 * Key   - path of the workspace folder
	 * Value - canonical path of the workspace folder
	 */
	private _workspaceFolders = new Map<string, string>();

	private disposables: Disposable[] = [];

	constructor(readonly git: Git, private readonly askpass: Askpass, private globalState: Memento, readonly workspaceState: Memento, private logger: LogOutputChannel, private telemetryReporter: TelemetryReporter) {
		// Repositories managers
		this._closedRepositoriesManager = new ClosedRepositoriesManager(workspaceState);
		this._parentRepositoriesManager = new ParentRepositoriesManager(globalState);
		this._unsafeRepositoriesManager = new UnsafeRepositoriesManager();

		workspace.onDidChangeWorkspaceFolders(this.onDidChangeWorkspaceFolders, this, this.disposables);
		window.onDidChangeVisibleTextEditors(this.onDidChangeVisibleTextEditors, this, this.disposables);
		workspace.onDidChangeConfiguration(this.onDidChangeConfiguration, this, this.disposables);

		const fsWatcher = workspace.createFileSystemWatcher('**');
		this.disposables.push(fsWatcher);

		const onWorkspaceChange = anyEvent(fsWatcher.onDidChange, fsWatcher.onDidCreate, fsWatcher.onDidDelete);
		const onGitRepositoryChange = filterEvent(onWorkspaceChange, uri => /\/\.git/.test(uri.path));
		const onPossibleGitRepositoryChange = filterEvent(onGitRepositoryChange, uri => !this.getRepository(uri));
		onPossibleGitRepositoryChange(this.onPossibleGitRepositoryChange, this, this.disposables);

		this.setState('uninitialized');
		this.doInitialScan().finally(() => this.setState('initialized'));
	}

	private async doInitialScan(): Promise<void> {
		const config = workspace.getConfiguration('git');
		const autoRepositoryDetection = config.get<boolean | 'subFolders' | 'openEditors'>('autoRepositoryDetection');
		const parentRepositoryConfig = config.get<'always' | 'never' | 'prompt'>('openRepositoryInParentFolders', 'prompt');

		// Initial repository scan function
		const initialScanFn = () => Promise.all([
			this.onDidChangeWorkspaceFolders({ added: workspace.workspaceFolders || [], removed: [] }),
			this.onDidChangeVisibleTextEditors(window.visibleTextEditors),
			this.scanWorkspaceFolders()
		]);

		if (config.get<boolean>('showProgress', true)) {
			await window.withProgress({ location: ProgressLocation.SourceControl }, initialScanFn);
		} else {
			await initialScanFn();
		}

		if (this.parentRepositories.length !== 0 &&
			parentRepositoryConfig === 'prompt') {
			// Parent repositories notification
			this.showParentRepositoryNotification();
		} else if (this.unsafeRepositories.length !== 0) {
			// Unsafe repositories notification
			this.showUnsafeRepositoryNotification();
		}

		/* __GDPR__
			"git.repositoryInitialScan" : {
				"owner": "lszomoru",
				"autoRepositoryDetection": { "classification": "SystemMetaData", "purpose": "FeatureInsight", "comment": "Setting that controls the initial repository scan" },
				"repositoryCount": { "classification": "SystemMetaData", "purpose": "FeatureInsight", "isMeasurement": true, "comment": "Number of repositories opened during initial repository scan" }
			}
		*/
		this.telemetryReporter.sendTelemetryEvent('git.repositoryInitialScan', { autoRepositoryDetection: String(autoRepositoryDetection) }, { repositoryCount: this.openRepositories.length });
	}

	/**
	 * Scans each workspace folder, looking for git repositories. By
	 * default it scans one level deep but that can be changed using
	 * the git.repositoryScanMaxDepth setting.
	 */
	private async scanWorkspaceFolders(): Promise<void> {
		const config = workspace.getConfiguration('git');
		const autoRepositoryDetection = config.get<boolean | 'subFolders' | 'openEditors'>('autoRepositoryDetection');
		this.logger.trace(`[swsf] Scan workspace sub folders. autoRepositoryDetection=${autoRepositoryDetection}`);

		if (autoRepositoryDetection !== true && autoRepositoryDetection !== 'subFolders') {
			return;
		}

		await Promise.all((workspace.workspaceFolders || []).map(async folder => {
			const root = folder.uri.fsPath;
			this.logger.trace(`[swsf] Workspace folder: ${root}`);

			// Workspace folder children
			const repositoryScanMaxDepth = (workspace.isTrusted ? workspace.getConfiguration('git', folder.uri) : config).get<number>('repositoryScanMaxDepth', 1);
			const repositoryScanIgnoredFolders = (workspace.isTrusted ? workspace.getConfiguration('git', folder.uri) : config).get<string[]>('repositoryScanIgnoredFolders', []);

			const subfolders = new Set(await this.traverseWorkspaceFolder(root, repositoryScanMaxDepth, repositoryScanIgnoredFolders));

			// Repository scan folders
			const scanPaths = (workspace.isTrusted ? workspace.getConfiguration('git', folder.uri) : config).get<string[]>('scanRepositories') || [];
			this.logger.trace(`[swsf] Workspace scan settings: repositoryScanMaxDepth=${repositoryScanMaxDepth}; repositoryScanIgnoredFolders=[${repositoryScanIgnoredFolders.join(', ')}]; scanRepositories=[${scanPaths.join(', ')}]`);

			for (const scanPath of scanPaths) {
				if (scanPath === '.git') {
					this.logger.trace('[swsf] \'.git\' not supported in \'git.scanRepositories\' setting.');
					continue;
				}

				if (path.isAbsolute(scanPath)) {
					const notSupportedMessage = l10n.t('Absolute paths not supported in "git.scanRepositories" setting.');
					this.logger.warn(notSupportedMessage);
					console.warn(notSupportedMessage);
					continue;
				}

				subfolders.add(path.join(root, scanPath));
			}

			this.logger.trace(`[swsf] Workspace scan sub folders: [${[...subfolders].join(', ')}]`);
			await Promise.all([...subfolders].map(f => this.openRepository(f)));
		}));
	}

	private async traverseWorkspaceFolder(workspaceFolder: string, maxDepth: number, repositoryScanIgnoredFolders: string[]): Promise<string[]> {
		const result: string[] = [];
		const foldersToTravers = [{ path: workspaceFolder, depth: 0 }];

		while (foldersToTravers.length > 0) {
			const currentFolder = foldersToTravers.shift()!;

			if (currentFolder.depth < maxDepth || maxDepth === -1) {
				const children = await fs.promises.readdir(currentFolder.path, { withFileTypes: true });
				const childrenFolders = children
					.filter(dirent =>
						dirent.isDirectory() && dirent.name !== '.git' &&
						!repositoryScanIgnoredFolders.find(f => pathEquals(dirent.name, f)))
					.map(dirent => path.join(currentFolder.path, dirent.name));

				result.push(...childrenFolders);
				foldersToTravers.push(...childrenFolders.map(folder => {
					return { path: folder, depth: currentFolder.depth + 1 };
				}));
			}
		}

		return result;
	}

	private onPossibleGitRepositoryChange(uri: Uri): void {
		const config = workspace.getConfiguration('git');
		const autoRepositoryDetection = config.get<boolean | 'subFolders' | 'openEditors'>('autoRepositoryDetection');

		if (autoRepositoryDetection === false) {
			return;
		}

		this.eventuallyScanPossibleGitRepository(uri.fsPath.replace(/\.git.*$/, ''));
	}

	private eventuallyScanPossibleGitRepository(path: string) {
		this.possibleGitRepositoryPaths.add(path);
		this.eventuallyScanPossibleGitRepositories();
	}

	@debounce(500)
	private eventuallyScanPossibleGitRepositories(): void {
		for (const path of this.possibleGitRepositoryPaths) {
			this.openRepository(path);
		}

		this.possibleGitRepositoryPaths.clear();
	}

	private async onDidChangeWorkspaceFolders({ added, removed }: WorkspaceFoldersChangeEvent): Promise<void> {
		const possibleRepositoryFolders = added
			.filter(folder => !this.getOpenRepository(folder.uri));

		const activeRepositoriesList = window.visibleTextEditors
			.map(editor => this.getRepository(editor.document.uri))
			.filter(repository => !!repository) as Repository[];

		const activeRepositories = new Set<Repository>(activeRepositoriesList);
		const openRepositoriesToDispose = removed
			.map(folder => this.getOpenRepository(folder.uri))
			.filter(r => !!r)
			.filter(r => !activeRepositories.has(r!.repository))
			.filter(r => !(workspace.workspaceFolders || []).some(f => isDescendant(f.uri.fsPath, r!.repository.root))) as OpenRepository[];

		openRepositoriesToDispose.forEach(r => r.dispose());
		this.logger.trace(`[swf] Scan workspace folders: [${possibleRepositoryFolders.map(p => p.uri.fsPath).join(', ')}]`);
		await Promise.all(possibleRepositoryFolders.map(p => this.openRepository(p.uri.fsPath)));
	}

	private onDidChangeConfiguration(): void {
		const possibleRepositoryFolders = (workspace.workspaceFolders || [])
			.filter(folder => workspace.getConfiguration('git', folder.uri).get<boolean>('enabled') === true)
			.filter(folder => !this.getOpenRepository(folder.uri));

		const openRepositoriesToDispose = this.openRepositories
			.map(repository => ({ repository, root: Uri.file(repository.repository.root) }))
			.filter(({ root }) => workspace.getConfiguration('git', root).get<boolean>('enabled') !== true)
			.map(({ repository }) => repository);

		this.logger.trace(`[swf] Scan workspace folders: [${possibleRepositoryFolders.map(p => p.uri.fsPath).join(', ')}]`);
		possibleRepositoryFolders.forEach(p => this.openRepository(p.uri.fsPath));
		openRepositoriesToDispose.forEach(r => r.dispose());
	}

	private async onDidChangeVisibleTextEditors(editors: readonly TextEditor[]): Promise<void> {
		if (!workspace.isTrusted) {
			this.logger.trace('[svte] Workspace is not trusted.');
			return;
		}

		const config = workspace.getConfiguration('git');
		const autoRepositoryDetection = config.get<boolean | 'subFolders' | 'openEditors'>('autoRepositoryDetection');
		this.logger.trace(`[svte] Scan visible text editors. autoRepositoryDetection=${autoRepositoryDetection}`);

		if (autoRepositoryDetection !== true && autoRepositoryDetection !== 'openEditors') {
			return;
		}

		await Promise.all(editors.map(async editor => {
			const uri = editor.document.uri;

			if (uri.scheme !== 'file') {
				return;
			}

			const repository = this.getRepository(uri);

			if (repository) {
				this.logger.trace(`[svte] Repository for editor resource ${uri.fsPath} already exists: ${repository.root}`);
				return;
			}

			this.logger.trace(`[svte] Open repository for editor resource ${uri.fsPath}`);
			await this.openRepository(path.dirname(uri.fsPath));
		}));
	}

	@sequentialize
	async openRepository(repoPath: string, openIfClosed = false): Promise<void> {
		this.logger.trace(`Opening repository: ${repoPath}`);
		const existingRepository = await this.getRepositoryExact(repoPath);
		if (existingRepository) {
			this.logger.trace(`Repository for path ${repoPath} already exists: ${existingRepository.root}`);
			return;
		}

		const config = workspace.getConfiguration('git', Uri.file(repoPath));
		const enabled = config.get<boolean>('enabled') === true;

		if (!enabled) {
			this.logger.trace('Git is not enabled');
			return;
		}

		if (!workspace.isTrusted) {
			// Check if the folder is a bare repo: if it has a file named HEAD && `rev-parse --show -cdup` is empty
			try {
				fs.accessSync(path.join(repoPath, 'HEAD'), fs.constants.F_OK);
				const result = await this.git.exec(repoPath, ['-C', repoPath, 'rev-parse', '--show-cdup']);
				if (result.stderr.trim() === '' && result.stdout.trim() === '') {
					this.logger.trace(`Bare repository: ${repoPath}`);
					return;
				}
			} catch {
				// If this throw, we should be good to open the repo (e.g. HEAD doesn't exist)
			}
		}

		try {
			const { repositoryRoot, unsafeRepositoryMatch } = await this.getRepositoryRoot(repoPath);
			this.logger.trace(`Repository root for path ${repoPath} is: ${repositoryRoot}`);

			const existingRepository = await this.getRepositoryExact(repositoryRoot);
			if (existingRepository) {
				this.logger.trace(`Repository for path ${repositoryRoot} already exists: ${existingRepository.root}`);
				return;
			}

			if (this.shouldRepositoryBeIgnored(repositoryRoot)) {
				this.logger.trace(`Repository for path ${repositoryRoot} is ignored`);
				return;
			}

			// Handle git repositories that are in parent folders
			const parentRepositoryConfig = config.get<'always' | 'never' | 'prompt'>('openRepositoryInParentFolders', 'prompt');
			if (parentRepositoryConfig !== 'always' && this.globalState.get<boolean>(`parentRepository:${repositoryRoot}`) !== true) {
				const isRepositoryOutsideWorkspace = await this.isRepositoryOutsideWorkspace(repositoryRoot);
				if (isRepositoryOutsideWorkspace) {
					this.logger.trace(`Repository in parent folder: ${repositoryRoot}`);

					if (!this._parentRepositoriesManager.hasRepository(repositoryRoot)) {
						// Show a notification if the parent repository is opened after the initial scan
						if (this.state === 'initialized' && parentRepositoryConfig === 'prompt') {
							this.showParentRepositoryNotification();
						}

						this._parentRepositoriesManager.addRepository(repositoryRoot);
					}

					return;
				}
			}

			// Handle unsafe repositories
			if (unsafeRepositoryMatch && unsafeRepositoryMatch.length === 3) {
				this.logger.trace(`Unsafe repository: ${repositoryRoot}`);

				// Show a notification if the unsafe repository is opened after the initial scan
				if (this._state === 'initialized' && !this._unsafeRepositoriesManager.hasRepository(repositoryRoot)) {
					this.showUnsafeRepositoryNotification();
				}

				this._unsafeRepositoriesManager.addRepository(repositoryRoot, unsafeRepositoryMatch[2]);

				return;
			}

			// Handle repositories that were closed by the user
			if (!openIfClosed && this._closedRepositoriesManager.isRepositoryClosed(repositoryRoot)) {
				this.logger.trace(`Repository for path ${repositoryRoot} is closed`);
				return;
			}

			// Open repository
			const [dotGit, repositoryRootRealPath] = await Promise.all([this.git.getRepositoryDotGit(repositoryRoot), this.getRepositoryRootRealPath(repositoryRoot)]);
			const repository = new Repository(this.git.open(repositoryRoot, repositoryRootRealPath, dotGit, this.logger), this, this, this, this, this, this.globalState, this.logger, this.telemetryReporter);

			this.open(repository);
			this._closedRepositoriesManager.deleteRepository(repository.root);

			// Do not await this, we want SCM
			// to know about the repo asap
			repository.status();
		} catch (err) {
			// noop
			this.logger.trace(`Opening repository for path='${repoPath}' failed; ex=${err}`);
		}
	}

	async openParentRepository(repoPath: string): Promise<void> {
		await this.openRepository(repoPath);
		this._parentRepositoriesManager.openRepository(repoPath);
	}

	private async getRepositoryRoot(repoPath: string): Promise<{ repositoryRoot: string; unsafeRepositoryMatch: RegExpMatchArray | null }> {
		try {
			const rawRoot = await this.git.getRepositoryRoot(repoPath);

			// This can happen whenever `path` has the wrong case sensitivity in case
			// insensitive file systems https://github.com/microsoft/vscode/issues/33498
			return { repositoryRoot: Uri.file(rawRoot).fsPath, unsafeRepositoryMatch: null };
		} catch (err) {
			// Handle unsafe repository
			const unsafeRepositoryMatch = /^fatal: detected dubious ownership in repository at \'([^']+)\'[\s\S]*git config --global --add safe\.directory '?([^'\n]+)'?$/m.exec(err.stderr);
			if (unsafeRepositoryMatch && unsafeRepositoryMatch.length === 3) {
				return { repositoryRoot: path.normalize(unsafeRepositoryMatch[1]), unsafeRepositoryMatch };
			}

			throw err;
		}
	}

	private async getRepositoryRootRealPath(repositoryRoot: string): Promise<string | undefined> {
		try {
			const repositoryRootRealPath = await fs.promises.realpath(repositoryRoot);
			return !pathEquals(repositoryRoot, repositoryRootRealPath) ? repositoryRootRealPath : undefined;
		} catch (err) {
			this.logger.warn(`Failed to get repository realpath for: "${repositoryRoot}". ${err}`);
			return undefined;
		}
	}

	private shouldRepositoryBeIgnored(repositoryRoot: string): boolean {
		const config = workspace.getConfiguration('git');
		const ignoredRepos = config.get<string[]>('ignoredRepositories') || [];

		for (const ignoredRepo of ignoredRepos) {
			if (path.isAbsolute(ignoredRepo)) {
				if (pathEquals(ignoredRepo, repositoryRoot)) {
					return true;
				}
			} else {
				for (const folder of workspace.workspaceFolders || []) {
					if (pathEquals(path.join(folder.uri.fsPath, ignoredRepo), repositoryRoot)) {
						return true;
					}
				}
			}
		}

		return false;
	}

	private open(repository: Repository): void {
		this.logger.info(`Open repository: ${repository.root}`);

		const onDidDisappearRepository = filterEvent(repository.onDidChangeState, state => state === RepositoryState.Disposed);
		const disappearListener = onDidDisappearRepository(() => dispose());
		const changeListener = repository.onDidChangeRepository(uri => this._onDidChangeRepository.fire({ repository, uri }));
		const originalResourceChangeListener = repository.onDidChangeOriginalResource(uri => this._onDidChangeOriginalResource.fire({ repository, uri }));

		const shouldDetectSubmodules = workspace
			.getConfiguration('git', Uri.file(repository.root))
			.get<boolean>('detectSubmodules') as boolean;

		const submodulesLimit = workspace
			.getConfiguration('git', Uri.file(repository.root))
			.get<number>('detectSubmodulesLimit') as number;

		const checkForSubmodules = () => {
			if (!shouldDetectSubmodules) {
				this.logger.trace('Automatic detection of git submodules is not enabled.');
				return;
			}

			if (repository.submodules.length > submodulesLimit) {
				window.showWarningMessage(l10n.t('The "{0}" repository has {1} submodules which won\'t be opened automatically. You can still open each one individually by opening a file within.', path.basename(repository.root), repository.submodules.length));
				statusListener.dispose();
			}

			repository.submodules
				.slice(0, submodulesLimit)
				.map(r => path.join(repository.root, r.path))
				.forEach(p => {
					this.logger.trace(`Opening submodule: '${p}'`);
					this.eventuallyScanPossibleGitRepository(p);
				});
		};

		const updateMergeChanges = () => {
			// set mergeChanges context
			const mergeChanges: Uri[] = [];
			for (const { repository } of this.openRepositories.values()) {
				for (const state of repository.mergeGroup.resourceStates) {
					mergeChanges.push(state.resourceUri);
				}
			}
			commands.executeCommand('setContext', 'git.mergeChanges', mergeChanges);
		};

		const statusListener = repository.onDidRunGitStatus(() => {
			checkForSubmodules();
			updateMergeChanges();
		});
		checkForSubmodules();

		const updateOperationInProgressContext = () => {
			let operationInProgress = false;
			for (const { repository } of this.openRepositories.values()) {
				if (repository.operations.shouldDisableCommands()) {
					operationInProgress = true;
				}
			}

			commands.executeCommand('setContext', 'operationInProgress', operationInProgress);
		};

		const operationEvent = anyEvent(repository.onDidRunOperation as Event<any>, repository.onRunOperation as Event<any>);
		const operationListener = operationEvent(() => updateOperationInProgressContext());
		updateOperationInProgressContext();

		const dispose = () => {
			disappearListener.dispose();
			changeListener.dispose();
			originalResourceChangeListener.dispose();
			statusListener.dispose();
			operationListener.dispose();
			repository.dispose();

			this.openRepositories = this.openRepositories.filter(e => e !== openRepository);
			this._onDidCloseRepository.fire(repository);
		};

		const openRepository = { repository, dispose };
		this.openRepositories.push(openRepository);
		updateMergeChanges();
		this._onDidOpenRepository.fire(repository);
	}

	close(repository: Repository): void {
		const openRepository = this.getOpenRepository(repository);

		if (!openRepository) {
			return;
		}

		this.logger.info(`Close repository: ${repository.root}`);
		this._closedRepositoriesManager.addRepository(openRepository.repository.root);

		openRepository.dispose();
	}

	async pickRepository(): Promise<Repository | undefined> {
		if (this.openRepositories.length === 0) {
			throw new Error(l10n.t('There are no available repositories'));
		}

		const picks = this.openRepositories.map((e, index) => new RepositoryPick(e.repository, index));
		const active = window.activeTextEditor;
		const repository = active && this.getRepository(active.document.fileName);
		const index = picks.findIndex(pick => pick.repository === repository);

		// Move repository pick containing the active text editor to appear first
		if (index > -1) {
			picks.unshift(...picks.splice(index, 1));
		}

		const placeHolder = l10n.t('Choose a repository');
		const pick = await window.showQuickPick(picks, { placeHolder });

		return pick && pick.repository;
	}

	getRepository(sourceControl: SourceControl): Repository | undefined;
	getRepository(resourceGroup: SourceControlResourceGroup): Repository | undefined;
	getRepository(path: string): Repository | undefined;
	getRepository(resource: Uri): Repository | undefined;
	getRepository(hint: any): Repository | undefined {
		const liveRepository = this.getOpenRepository(hint);
		return liveRepository && liveRepository.repository;
	}

	private async getRepositoryExact(repoPath: string): Promise<Repository | undefined> {
		// Use the repository path
		const openRepository = this.openRepositories
			.find(r => pathEquals(r.repository.root, repoPath));

		if (openRepository) {
			return openRepository.repository;
		}

		try {
			// Use the repository real path
			const repoPathRealPath = await fs.promises.realpath(repoPath, { encoding: 'utf8' });
			const openRepositoryRealPath = this.openRepositories
				.find(r => pathEquals(r.repository.rootRealPath ?? '', repoPathRealPath));

			return openRepositoryRealPath?.repository;
		} catch (err) {
			this.logger.warn(`Failed to get repository realpath for: "${repoPath}". ${err}`);
			return undefined;
		}
	}

	private getOpenRepository(repository: Repository): OpenRepository | undefined;
	private getOpenRepository(sourceControl: SourceControl): OpenRepository | undefined;
	private getOpenRepository(resourceGroup: SourceControlResourceGroup): OpenRepository | undefined;
	private getOpenRepository(path: string): OpenRepository | undefined;
	private getOpenRepository(resource: Uri): OpenRepository | undefined;
	private getOpenRepository(hint: any): OpenRepository | undefined {
		if (!hint) {
			return undefined;
		}

		if (hint instanceof Repository) {
			return this.openRepositories.filter(r => r.repository === hint)[0];
		}

		if (hint instanceof ApiRepository) {
			return this.openRepositories.filter(r => r.repository === hint.repository)[0];
		}

		if (typeof hint === 'string') {
			hint = Uri.file(hint);
		}

		if (hint instanceof Uri) {
			let resourcePath: string;

			if (hint.scheme === 'git') {
				resourcePath = fromGitUri(hint).path;
			} else {
				resourcePath = hint.fsPath;
			}

			outer:
			for (const liveRepository of this.openRepositories.sort((a, b) => b.repository.root.length - a.repository.root.length)) {
				if (!isDescendant(liveRepository.repository.root, resourcePath)) {
					continue;
				}

				for (const submodule of liveRepository.repository.submodules) {
					const submoduleRoot = path.join(liveRepository.repository.root, submodule.path);

					if (isDescendant(submoduleRoot, resourcePath)) {
						continue outer;
					}
				}

				return liveRepository;
			}

			return undefined;
		}

		for (const liveRepository of this.openRepositories) {
			const repository = liveRepository.repository;

			if (hint === repository.sourceControl) {
				return liveRepository;
			}

			if (hint === repository.mergeGroup || hint === repository.indexGroup || hint === repository.workingTreeGroup || hint === repository.untrackedGroup) {
				return liveRepository;
			}
		}

		return undefined;
	}

	getRepositoryForSubmodule(submoduleUri: Uri): Repository | undefined {
		for (const repository of this.repositories) {
			for (const submodule of repository.submodules) {
				const submodulePath = path.join(repository.root, submodule.path);

				if (submodulePath === submoduleUri.fsPath) {
					return repository;
				}
			}
		}

		return undefined;
	}

	registerRemoteSourcePublisher(publisher: RemoteSourcePublisher): Disposable {
		this.remoteSourcePublishers.add(publisher);
		this._onDidAddRemoteSourcePublisher.fire(publisher);

		return toDisposable(() => {
			this.remoteSourcePublishers.delete(publisher);
			this._onDidRemoveRemoteSourcePublisher.fire(publisher);
		});
	}

	getRemoteSourcePublishers(): RemoteSourcePublisher[] {
		return [...this.remoteSourcePublishers.values()];
	}

	registerBranchProtectionProvider(root: Uri, provider: BranchProtectionProvider): Disposable {
		const providerDisposables: Disposable[] = [];

		this.branchProtectionProviders.set(root.toString(), (this.branchProtectionProviders.get(root.toString()) ?? new Set()).add(provider));
		providerDisposables.push(provider.onDidChangeBranchProtection(uri => this._onDidChangeBranchProtectionProviders.fire(uri)));

		this._onDidChangeBranchProtectionProviders.fire(root);

		return toDisposable(() => {
			const providers = this.branchProtectionProviders.get(root.toString());

			if (providers && providers.has(provider)) {
				providers.delete(provider);
				this.branchProtectionProviders.set(root.toString(), providers);
				this._onDidChangeBranchProtectionProviders.fire(root);
			}

			dispose(providerDisposables);
		});
	}

	getBranchProtectionProviders(root: Uri): BranchProtectionProvider[] {
		return [...(this.branchProtectionProviders.get(root.toString()) ?? new Set()).values()];
	}

	registerPostCommitCommandsProvider(provider: PostCommitCommandsProvider): Disposable {
		this.postCommitCommandsProviders.add(provider);
		this._onDidChangePostCommitCommandsProviders.fire();

		return toDisposable(() => {
			this.postCommitCommandsProviders.delete(provider);
			this._onDidChangePostCommitCommandsProviders.fire();
		});
	}

	getPostCommitCommandsProviders(): PostCommitCommandsProvider[] {
		return [...this.postCommitCommandsProviders.values()];
	}

	registerCredentialsProvider(provider: CredentialsProvider): Disposable {
		return this.askpass.registerCredentialsProvider(provider);
	}

	registerPushErrorHandler(handler: PushErrorHandler): Disposable {
		this.pushErrorHandlers.add(handler);
		return toDisposable(() => this.pushErrorHandlers.delete(handler));
	}

	getPushErrorHandlers(): PushErrorHandler[] {
		return [...this.pushErrorHandlers];
	}

	getUnsafeRepositoryPath(repository: string): string | undefined {
		return this._unsafeRepositoriesManager.getRepositoryPath(repository);
	}

	deleteUnsafeRepository(repository: string): boolean {
		return this._unsafeRepositoriesManager.deleteRepository(repository);
	}

	private async isRepositoryOutsideWorkspace(repositoryPath: string): Promise<boolean> {
		const workspaceFolders = (workspace.workspaceFolders || [])
			.filter(folder => folder.uri.scheme === 'file');

		if (workspaceFolders.length === 0) {
			return true;
		}

		// The repository path may be a canonical path or it may contain a symbolic link so we have
		// to match it against the workspace folders and the canonical paths of the workspace folders
		const workspaceFolderPaths = new Set<string | undefined>([
			...workspaceFolders.map(folder => folder.uri.fsPath),
			...await Promise.all(workspaceFolders.map(folder => this.getWorkspaceFolderRealPath(folder)))
		]);

		return !Array.from(workspaceFolderPaths).some(folder => folder && (pathEquals(folder, repositoryPath) || isDescendant(folder, repositoryPath)));
	}

	private async getWorkspaceFolderRealPath(workspaceFolder: WorkspaceFolder): Promise<string | undefined> {
		let result = this._workspaceFolders.get(workspaceFolder.uri.fsPath);

		if (!result) {
			try {
				result = await fs.promises.realpath(workspaceFolder.uri.fsPath, { encoding: 'utf8' });
				this._workspaceFolders.set(workspaceFolder.uri.fsPath, result);
			} catch (err) {
				// noop - Workspace folder does not exist
				this.logger.trace(`Failed to resolve workspace folder: "${workspaceFolder.uri.fsPath}". ${err}`);
			}
		}

		return result;
	}

	private async showParentRepositoryNotification(): Promise<void> {
		const message = this.parentRepositories.length === 1 ?
			l10n.t('A git repository was found in the parent folders of the workspace or the open file(s). Would you like to open the repository?') :
			l10n.t('Git repositories were found in the parent folders of the workspace or the open file(s). Would you like to open the repositories?');

		const yes = l10n.t('Yes');
		const always = l10n.t('Always');
		const never = l10n.t('Never');

		const choice = await window.showInformationMessage(message, yes, always, never);
		if (choice === yes) {
			// Open Parent Repositories
			commands.executeCommand('git.openRepositoriesInParentFolders');
		} else if (choice === always || choice === never) {
			// Update setting
			const config = workspace.getConfiguration('git');
			await config.update('openRepositoryInParentFolders', choice === always ? 'always' : 'never', true);

			if (choice === always) {
				for (const parentRepository of this.parentRepositories) {
					await this.openParentRepository(parentRepository);
				}
			}
		}
	}

	private async showUnsafeRepositoryNotification(): Promise<void> {
		// If no repositories are open, we will use a welcome view to inform the user
		// that a potentially unsafe repository was found so we do not have to show
		// the notification
		if (this.repositories.length === 0) {
			return;
		}

		const message = this.unsafeRepositories.length === 1 ?
			l10n.t('The git repository in the current folder is potentially unsafe as the folder is owned by someone other than the current user.') :
			l10n.t('The git repositories in the current folder are potentially unsafe as the folders are owned by someone other than the current user.');

		const manageUnsafeRepositories = l10n.t('Manage Unsafe Repositories');
		const learnMore = l10n.t('Learn More');

		const choice = await window.showErrorMessage(message, manageUnsafeRepositories, learnMore);
		if (choice === manageUnsafeRepositories) {
			// Manage Unsafe Repositories
			commands.executeCommand('git.manageUnsafeRepositories');
		} else if (choice === learnMore) {
			// Learn More
			commands.executeCommand('vscode.open', Uri.parse('https://aka.ms/vscode-git-unsafe-repository'));
		}
	}

	dispose(): void {
		const openRepositories = [...this.openRepositories];
		openRepositories.forEach(r => r.dispose());
		this.openRepositories = [];

		this.possibleGitRepositoryPaths.clear();
		this.disposables = dispose(this.disposables);
	}
}
