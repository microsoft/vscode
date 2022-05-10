/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { workspace, WorkspaceFoldersChangeEvent, Uri, window, Event, EventEmitter, QuickPickItem, Disposable, SourceControl, SourceControlResourceGroup, TextEditor, Memento, commands } from 'vscode';
import TelemetryReporter from '@vscode/extension-telemetry';
import { Repository, RepositoryState } from './repository';
import { memoize, sequentialize, debounce } from './decorators';
import { dispose, anyEvent, filterEvent, isDescendant, pathEquals, toDisposable, eventToPromise } from './util';
import { Git } from './git';
import * as path from 'path';
import * as fs from 'fs';
import * as nls from 'vscode-nls';
import { fromGitUri } from './uri';
import { APIState as State, CredentialsProvider, PushErrorHandler, PublishEvent, RemoteSourcePublisher } from './api/git';
import { Askpass } from './askpass';
import { IPushErrorHandlerRegistry } from './pushError';
import { ApiRepository } from './api/api1';
import { IRemoteSourcePublisherRegistry } from './remotePublisher';
import { OutputChannelLogger } from './log';

const localize = nls.loadMessageBundle();

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

export class Model implements IRemoteSourcePublisherRegistry, IPushErrorHandlerRegistry {

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

	private showRepoOnHomeDriveRootWarning = true;
	private pushErrorHandlers = new Set<PushErrorHandler>();

	private disposables: Disposable[] = [];

	constructor(readonly git: Git, private readonly askpass: Askpass, private globalState: Memento, private outputChannelLogger: OutputChannelLogger, private telemetryReporter: TelemetryReporter) {
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
		await Promise.all([
			this.onDidChangeWorkspaceFolders({ added: workspace.workspaceFolders || [], removed: [] }),
			this.onDidChangeVisibleTextEditors(window.visibleTextEditors),
			this.scanWorkspaceFolders()
		]);
	}

	/**
	 * Scans each workspace folder, looking for git repositories. By
	 * default it scans one level deep but that can be changed using
	 * the git.repositoryScanMaxDepth setting.
	 */
	private async scanWorkspaceFolders(): Promise<void> {
		const config = workspace.getConfiguration('git');
		const autoRepositoryDetection = config.get<boolean | 'subFolders' | 'openEditors'>('autoRepositoryDetection');

		// Log repository scan settings
		this.outputChannelLogger.logTrace(`autoRepositoryDetection="${autoRepositoryDetection}"`);

		if (autoRepositoryDetection !== true && autoRepositoryDetection !== 'subFolders') {
			return;
		}

		await Promise.all((workspace.workspaceFolders || []).map(async folder => {
			const root = folder.uri.fsPath;

			// Workspace folder children
			const repositoryScanMaxDepth = (workspace.isTrusted ? workspace.getConfiguration('git', folder.uri) : config).get<number>('repositoryScanMaxDepth', 1);
			const repositoryScanIgnoredFolders = (workspace.isTrusted ? workspace.getConfiguration('git', folder.uri) : config).get<string[]>('repositoryScanIgnoredFolders', []);

			const subfolders = new Set(await this.traverseWorkspaceFolder(root, repositoryScanMaxDepth, repositoryScanIgnoredFolders));

			// Repository scan folders
			const scanPaths = (workspace.isTrusted ? workspace.getConfiguration('git', folder.uri) : config).get<string[]>('scanRepositories') || [];
			for (const scanPath of scanPaths) {
				if (scanPath === '.git') {
					continue;
				}

				if (path.isAbsolute(scanPath)) {
					console.warn(localize('not supported', "Absolute paths not supported in 'git.scanRepositories' setting."));
					continue;
				}

				subfolders.add(path.join(root, scanPath));
			}

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

		possibleRepositoryFolders.forEach(p => this.openRepository(p.uri.fsPath));
		openRepositoriesToDispose.forEach(r => r.dispose());
	}

	private async onDidChangeVisibleTextEditors(editors: readonly TextEditor[]): Promise<void> {
		if (!workspace.isTrusted) {
			return;
		}

		const config = workspace.getConfiguration('git');
		const autoRepositoryDetection = config.get<boolean | 'subFolders' | 'openEditors'>('autoRepositoryDetection');

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
				return;
			}

			await this.openRepository(path.dirname(uri.fsPath));
		}));
	}

	@sequentialize
	async openRepository(repoPath: string): Promise<void> {
		if (this.getRepository(repoPath)) {
			return;
		}

		const config = workspace.getConfiguration('git', Uri.file(repoPath));
		const enabled = config.get<boolean>('enabled') === true;

		if (!enabled) {
			return;
		}

		if (!workspace.isTrusted) {
			// Check if the folder is a bare repo: if it has a file named HEAD && `rev-parse --show -cdup` is empty
			try {
				fs.accessSync(path.join(repoPath, 'HEAD'), fs.constants.F_OK);
				const result = await this.git.exec(repoPath, ['-C', repoPath, 'rev-parse', '--show-cdup']);
				if (result.stderr.trim() === '' && result.stdout.trim() === '') {
					return;
				}
			} catch {
				// If this throw, we should be good to open the repo (e.g. HEAD doesn't exist)
			}
		}

		try {
			const rawRoot = await this.git.getRepositoryRoot(repoPath);

			// This can happen whenever `path` has the wrong case sensitivity in
			// case insensitive file systems
			// https://github.com/microsoft/vscode/issues/33498
			const repositoryRoot = Uri.file(rawRoot).fsPath;

			if (this.getRepository(repositoryRoot)) {
				return;
			}

			if (this.shouldRepositoryBeIgnored(rawRoot)) {
				return;
			}

			// On Window, opening a git repository from the root of the HOMEDRIVE poses a security risk.
			// We will only a open git repository from the root of the HOMEDRIVE if the user explicitly
			// opens the HOMEDRIVE as a folder. Only show the warning once during repository discovery.
			if (process.platform === 'win32' && process.env.HOMEDRIVE && pathEquals(`${process.env.HOMEDRIVE}\\`, repositoryRoot)) {
				const isRepoInWorkspaceFolders = (workspace.workspaceFolders ?? []).find(f => pathEquals(f.uri.fsPath, repositoryRoot))!!;

				if (!isRepoInWorkspaceFolders) {
					if (this.showRepoOnHomeDriveRootWarning) {
						window.showWarningMessage(localize('repoOnHomeDriveRootWarning', "Unable to automatically open the git repository at '{0}'. To open that git repository, open it directly as a folder in VS Code.", repositoryRoot));
						this.showRepoOnHomeDriveRootWarning = false;
					}

					return;
				}
			}

			const dotGit = await this.git.getRepositoryDotGit(repositoryRoot);
			const repository = new Repository(this.git.open(repositoryRoot, dotGit), this, this, this.globalState, this.outputChannelLogger, this.telemetryReporter);

			this.open(repository);
			repository.status(); // do not await this, we want SCM to know about the repo asap
		} catch (ex) {
			// noop
			this.outputChannelLogger.logTrace(`Opening repository for path='${repoPath}' failed; ex=${ex}`);
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
		this.outputChannelLogger.logInfo(`Open repository: ${repository.root}`);

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
				return;
			}

			if (repository.submodules.length > submodulesLimit) {
				window.showWarningMessage(localize('too many submodules', "The '{0}' repository has {1} submodules which won't be opened automatically. You can still open each one individually by opening a file within.", path.basename(repository.root), repository.submodules.length));
				statusListener.dispose();
			}

			repository.submodules
				.slice(0, submodulesLimit)
				.map(r => path.join(repository.root, r.path))
				.forEach(p => this.eventuallyScanPossibleGitRepository(p));
		};

		const statusListener = repository.onDidRunGitStatus(checkForSubmodules);
		checkForSubmodules();

		const dispose = () => {
			disappearListener.dispose();
			changeListener.dispose();
			originalResourceChangeListener.dispose();
			statusListener.dispose();
			repository.dispose();

			this.openRepositories = this.openRepositories.filter(e => e !== openRepository);
			this._onDidCloseRepository.fire(repository);
		};

		const openRepository = { repository, dispose };
		this.openRepositories.push(openRepository);
		this._onDidOpenRepository.fire(repository);
	}

	close(repository: Repository): void {
		const openRepository = this.getOpenRepository(repository);

		if (!openRepository) {
			return;
		}

		this.outputChannelLogger.logInfo(`Close repository: ${repository.root}`);
		openRepository.dispose();
	}

	async pickRepository(): Promise<Repository | undefined> {
		if (this.openRepositories.length === 0) {
			throw new Error(localize('no repositories', "There are no available repositories"));
		}

		const picks = this.openRepositories.map((e, index) => new RepositoryPick(e.repository, index));
		const active = window.activeTextEditor;
		const repository = active && this.getRepository(active.document.fileName);
		const index = picks.findIndex(pick => pick.repository === repository);

		// Move repository pick containing the active text editor to appear first
		if (index > -1) {
			picks.unshift(...picks.splice(index, 1));
		}

		const placeHolder = localize('pick repo', "Choose a repository");
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

			if (hint === repository.mergeGroup || hint === repository.indexGroup || hint === repository.workingTreeGroup) {
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

	dispose(): void {
		const openRepositories = [...this.openRepositories];
		openRepositories.forEach(r => r.dispose());
		this.openRepositories = [];

		this.possibleGitRepositoryPaths.clear();
		this.disposables = dispose(this.disposables);
	}
}
