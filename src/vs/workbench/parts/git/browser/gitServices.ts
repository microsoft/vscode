/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

import { localize } from 'vs/nls';
import * as platform from 'vs/base/common/platform';
import { TPromise } from 'vs/base/common/winjs.base';
import { IDisposable, dispose } from 'vs/base/common/lifecycle';
import { Action } from 'vs/base/common/actions';
import { isPromiseCanceledError, create as createError } from 'vs/base/common/errors';
import * as mime from 'vs/base/common/mime';
import * as paths from 'vs/base/common/paths';
import Event, { once } from 'vs/base/common/event';
import { EventEmitter } from 'vs/base/common/eventEmitter';
import { EditorInput } from 'vs/workbench/common/editor';
import {
	IFileStatus, IGitServiceError, GitErrorCodes, Status, StatusType, AutoFetcherState, IGitConfiguration, IAutoFetcher, ServiceEvents, ServiceState,
	IModel, IGitOperation, IRawGitService, IGitService, RawServiceState, ServiceOperations, IPushOptions, ICommit, IRawStatus
} from 'vs/workbench/parts/git/common/git';
import { Model } from 'vs/workbench/parts/git/common/gitModel';
import { NativeGitIndexStringEditorInput, GitIndexDiffEditorInput, GitWorkingTreeDiffEditorInput, GitDiffEditorInput } from 'vs/workbench/parts/git/browser/gitEditorInputs';
import { GitOperation } from 'vs/workbench/parts/git/browser/gitOperations';
import { TextFileModelChangeEvent, ITextFileService } from 'vs/workbench/services/textfile/common/textfiles';
import { IFileService, FileChangesEvent, FileChangeType } from 'vs/platform/files/common/files';
import { ThrottledDelayer, PeriodThrottledDelayer } from 'vs/base/common/async';
import severity from 'vs/base/common/severity';
import { IOutputService } from 'vs/workbench/parts/output/common/output';
import { IWorkbenchEditorService } from 'vs/workbench/services/editor/common/editorService';
import { IConfigurationService } from 'vs/platform/configuration/common/configuration';
import { IInstantiationService } from 'vs/platform/instantiation/common/instantiation';
import { IMessageService, CloseAction } from 'vs/platform/message/common/message';
import { IWorkspaceContextService } from 'vs/platform/workspace/common/workspace';
import { ILifecycleService } from 'vs/platform/lifecycle/common/lifecycle';
import URI from 'vs/base/common/uri';
import { IStorageService, StorageScope } from 'vs/platform/storage/common/storage';
import { domEvent } from 'vs/base/browser/event';
import { IEditorGroupService } from 'vs/workbench/services/group/common/groupService';

function toReadablePath(path: string): string {
	if (!platform.isWindows) {
		return path;
	}

	return path.replace(/\//g, '\\');
}

class EditorInputCache {
	private gitService: GitService;
	private fileService: IFileService;
	private instantiationService: IInstantiationService;
	private editorService: IWorkbenchEditorService;
	private editorGroupService: IEditorGroupService;
	private contextService: IWorkspaceContextService;
	private cache: { [key: string]: TPromise<EditorInput> };
	private toDispose: IDisposable[];

	constructor(gitService: GitService,
		@IInstantiationService instantiationService: IInstantiationService,
		@IFileService fileService: IFileService,
		@IWorkbenchEditorService editorService: IWorkbenchEditorService,
		@IEditorGroupService editorGroupService: IEditorGroupService,
		@IWorkspaceContextService contextService: IWorkspaceContextService
	) {
		this.instantiationService = instantiationService;
		this.fileService = fileService;
		this.editorService = editorService;
		this.editorGroupService = editorGroupService;
		this.contextService = contextService;

		this.gitService = gitService;

		this.cache = {};
		this.toDispose = [];

		this.toDispose.push(this.gitService.getModel().addListener2('fileStatus:dispose', (fileStatus: IFileStatus) => this.onFileStatusDispose(fileStatus)));
	}

	getInput(status: IFileStatus): TPromise<EditorInput> {
		var result = this.cache[status.getId()];

		if (result) {
			return result;
		}

		result = this.createInput(status);
		this.cache[status.getId()] = result;
		return result;
	}

	private createInput(status: IFileStatus): TPromise<EditorInput> {
		return TPromise.join<EditorInput>([this.createLeftInput(status), this.createRightInput(status)]).then((result) => {
			var leftInput = result[0];
			var rightInput = result[1];

			var fileSegment: string;
			var folderSegment: string;

			if (status.getStatus() === Status.INDEX_RENAMED) {
				let pathComponents = status.getRename().split('/');
				fileSegment = pathComponents[pathComponents.length - 1];
				folderSegment = toReadablePath(pathComponents.slice(0, pathComponents.length - 1).join('/'));
			} else {
				let pathComponents = status.getPathComponents();
				fileSegment = pathComponents[pathComponents.length - 1];
				folderSegment = toReadablePath(pathComponents.slice(0, pathComponents.length - 1).join('/'));
			}

			if (!leftInput) {
				if (!rightInput) {
					var error = new Error(localize('cantOpen', "Can't open this git resource."));
					(<IGitServiceError>error).gitErrorCode = GitErrorCodes.CantOpenResource;
					return TPromise.wrapError(error);
				}

				return TPromise.as(rightInput);
			}

			switch (status.getStatus()) {
				case Status.INDEX_MODIFIED:
					return TPromise.as(new GitIndexDiffEditorInput(localize('gitIndexChanges', "{0} (index) ↔ {1}", fileSegment, fileSegment), localize('gitIndexChangesDesc', "{0} - Changes on index", folderSegment), leftInput, rightInput, status));
				case Status.INDEX_RENAMED:
					return TPromise.as(new GitIndexDiffEditorInput(localize('gitIndexChangesRenamed', "{0} ← {1}", status.getRename(), status.getPath()), localize('gitIndexChangesRenamedDesc', "{0} - Renamed - Changes on index", folderSegment), leftInput, rightInput, status));
				case Status.MODIFIED:
					return TPromise.as(new GitWorkingTreeDiffEditorInput(localize('workingTreeChanges', "{0} (HEAD) ↔ {1}", fileSegment, fileSegment), localize('workingTreeChangesDesc', "{0} - Changes on working tree", folderSegment), leftInput, rightInput, status));
				default:
					return TPromise.as(new GitDiffEditorInput(localize('gitMergeChanges', "{0} (merge) ↔ {1}", fileSegment, fileSegment), localize('gitMergeChangesDesc', "{0} - Merge changes", folderSegment), leftInput, rightInput, status));
			}
		}).then((editorInput: EditorInput) => {
			const onceDispose = once(editorInput.onDispose);
			onceDispose(() => {
				delete this.cache[status.getId()];
			});

			return editorInput;
		}, (errs) => {
			return TPromise.wrapError(Array.isArray(errs) ? errs[0] || errs[1] : errs);
		});
	}

	private createLeftInput(status: IFileStatus): TPromise<EditorInput> {
		var path = status.getPath();
		var model = this.gitService.getModel();

		switch (status.getStatus()) {
			case Status.INDEX_MODIFIED:
			case Status.INDEX_RENAMED:
				return this.gitService.show(path, status, 'HEAD', status.getMimetype());

			case Status.MODIFIED:
				var indexStatus = model.getStatus().find(path, StatusType.INDEX);

				if (indexStatus && indexStatus.getStatus() === Status.INDEX_RENAMED) {
					return this.gitService.show(indexStatus.getRename(), status, '~', status.getMimetype());
				}

				if (indexStatus) {
					return this.gitService.show(path, status, '~', status.getMimetype());
				}

				return this.gitService.show(path, status, 'HEAD', status.getMimetype());

			default:
				return TPromise.as(null);
		}
	}

	private createRightInput(status: IFileStatus): TPromise<EditorInput> {
		const model = this.gitService.getModel();
		const path = status.getPath();
		let resource = URI.file(paths.join(model.getRepositoryRoot(), path));

		switch (status.getStatus()) {
			case Status.INDEX_MODIFIED:
			case Status.INDEX_ADDED:
			case Status.INDEX_COPIED:
				return this.gitService.show(path, status, '~', status.getMimetype());

			case Status.INDEX_RENAMED:
				return this.gitService.show(status.getRename(), status, '~', status.getMimetype());

			case Status.INDEX_DELETED:
			case Status.DELETED:
				return this.gitService.show(path, status, 'HEAD', status.getMimetype());

			case Status.MODIFIED:
			case Status.UNTRACKED:
			case Status.IGNORED:
				var indexStatus = model.getStatus().find(path, StatusType.INDEX);

				if (indexStatus && indexStatus.getStatus() === Status.INDEX_RENAMED) {
					resource = URI.file(paths.join(model.getRepositoryRoot(), indexStatus.getRename()));
				}

				return this.editorService.createInput({ resource });

			case Status.BOTH_MODIFIED:
				return this.editorService.createInput({ resource });

			default:
				return TPromise.as(null);
		}
	}

	private onFileStatusDispose(fileStatus: IFileStatus): void {
		var id = fileStatus.getId();
		var editorInputPromise = this.cache[id];

		if (editorInputPromise) {
			editorInputPromise.done((editorInput) => { this.eventuallyDispose(editorInput); });
		}
	}

	/**
	 * If the disposed status is the same as this input's status, we must try to dispose the input.
	 * But we should not do it while the input is still open. This method will eventually call dispose
	 * when the editor input goes out of the visible editors.
	 */
	private eventuallyDispose(editorInput: EditorInput): void {
		if (!this.maybeDispose(editorInput)) {
			var listener = this.editorGroupService.onEditorsChanged(() => {
				if (this.maybeDispose(editorInput)) {
					listener.dispose();
				}
			});
		}
	}

	private maybeDispose(editorInput: EditorInput): boolean {
		if (!editorInput.isDirty() && !this.editorService.getVisibleEditors().some((editor) => editor.input && editor.input.matches(editorInput))) {
			editorInput.dispose();
			return true;
		}

		return false;
	}

	dispose(): void {
		Object.keys(this.cache).forEach(key => {
			this.cache[key].done((editorInput) => { editorInput.dispose(); });
			delete this.cache[key];
		});

		this.toDispose = dispose(this.toDispose);
	}
}

export class AutoFetcher implements IAutoFetcher, IDisposable {
	private static MIN_TIMEOUT = 2 * 60 * 1000; // every two minutes
	private static MAX_TIMEOUT = 5 * 60 * 1000; // every five minutes

	private _state: AutoFetcherState;
	private gitService: GitService;
	private messageService: IMessageService;
	private configurationService: IConfigurationService;
	private instantiationService: IInstantiationService;
	private currentRequest: TPromise<void>;
	private timeout: number;
	private toDispose: IDisposable[];
	private gitServiceStateDisposable: IDisposable;

	constructor(gitService: GitService, // gitService passed as argument, not by injection
		@IMessageService messageService: IMessageService,
		@IWorkbenchEditorService editorService: IWorkbenchEditorService,
		@IConfigurationService configurationService: IConfigurationService,
		@IInstantiationService instantiationService: IInstantiationService
	) {
		this._state = AutoFetcherState.Disabled;
		this.gitService = gitService;
		this.messageService = messageService;
		this.configurationService = configurationService;
		this.instantiationService = instantiationService;
		this.currentRequest = null;
		this.timeout = AutoFetcher.MIN_TIMEOUT;

		this.toDispose = [];
		this.toDispose.push(this.configurationService.onDidUpdateConfiguration(e => this.onConfiguration(e.config.git)));
		this.onConfiguration(configurationService.getConfiguration<IGitConfiguration>('git'));
	}

	get state(): AutoFetcherState {
		return this._state;
	}

	private onConfiguration(config: IGitConfiguration): void {
		if (config.autofetch === false) {
			this.disable();
		} else {
			this.enable();
		}
	}

	enable(): void {
		if (this._state !== AutoFetcherState.Disabled) {
			return;
		}

		this.gitServiceStateDisposable = this.gitService.addListener2(ServiceEvents.STATE_CHANGED, (e) => this.onGitServiceStateChange(e));
		this._state = AutoFetcherState.Active;
		this.onGitServiceStateChange(this.gitService.getState());
	}

	disable(): void {
		if (this.gitServiceStateDisposable) {
			this.gitServiceStateDisposable.dispose();
			this.gitServiceStateDisposable = null;
		}

		this.deactivate();
		this._state = AutoFetcherState.Disabled;
	}

	private onGitServiceStateChange(state: ServiceState): void {
		if (state === ServiceState.OK) {
			this.activate();
		} else {
			this.deactivate();
		}
	}

	activate(): void {
		if (this.currentRequest) {
			this.currentRequest.cancel();
		}

		this._state = AutoFetcherState.Active;
		this.loop();
	}

	deactivate(): void {
		if (!this.currentRequest) {
			return;
		}

		this._state = AutoFetcherState.Inactive;
		this.currentRequest.cancel();
		this.currentRequest = null;
	}

	private loop(): void {
		this._state = AutoFetcherState.Fetching;

		const model = this.gitService.getModel();
		const remotes = model ? model.getRemotes() : [];

		if (remotes.length === 0) {
			this.timeout = AutoFetcher.MIN_TIMEOUT;
			this.currentRequest = TPromise.as(null);
		} else {
			this.currentRequest = this.gitService.fetch().then(() => {
				this.timeout = AutoFetcher.MIN_TIMEOUT;
			}, (err) => {
				if (isPromiseCanceledError(err)) {
					return TPromise.wrapError(err);
				} else if (err.gitErrorCode === GitErrorCodes.AuthenticationFailed) {
					return TPromise.wrapError(err);
				} else {
					this.timeout = Math.min(Math.round(this.timeout * 1.2), AutoFetcher.MAX_TIMEOUT); // backoff
				}
				return undefined;
			});
		}

		this.currentRequest.then(() => {
			this._state = AutoFetcherState.Active;
			this.currentRequest = TPromise.timeout(this.timeout);
			return this.currentRequest;
		}).then(() => this.loop(), (err) => this.deactivate());
	}

	dispose(): void {
		this.disable();
	}
}

const IgnoreOldGitStorageKey = 'settings.workspace.git.ignoreOld';

export class GitService extends EventEmitter
	implements
	IGitService {

	_serviceBrand: any;

	private contextService: IWorkspaceContextService;
	private messageService: IMessageService;
	private textFileService: ITextFileService;
	private instantiationService: IInstantiationService;
	private editorService: IWorkbenchEditorService;
	private lifecycleService: ILifecycleService;
	private outputService: IOutputService;
	protected raw: IRawGitService;

	private state: ServiceState;
	private operations: IGitOperation[];
	private model: IModel;
	private inputCache: EditorInputCache;
	private toDispose: IDisposable[];
	private needsRefresh: boolean;
	private statusDelayer: ThrottledDelayer<IModel>;
	private reactiveStatusDelayer: PeriodThrottledDelayer<IModel>;
	private autoFetcher: AutoFetcher;
	private isStatusPending = false;

	private _allowHugeRepositories: boolean;
	get allowHugeRepositories(): boolean { return this._allowHugeRepositories; }
	set allowHugeRepositories(value: boolean) {
		this._allowHugeRepositories = value;

		if (value && this.state === ServiceState.Huge) {
			this.transition(ServiceState.OK);
		}
	}

	get onOutput(): Event<string> { return this.raw.onOutput; }

	constructor(
		raw: IRawGitService,
		@IInstantiationService instantiationService: IInstantiationService,
		@IFileService private fileService: IFileService,
		@IMessageService messageService: IMessageService,
		@IWorkbenchEditorService editorService: IWorkbenchEditorService,
		@IOutputService outputService: IOutputService,
		@ITextFileService textFileService: ITextFileService,
		@IWorkspaceContextService contextService: IWorkspaceContextService,
		@ILifecycleService lifecycleService: ILifecycleService,
		@IStorageService storageService: IStorageService,
		@IConfigurationService private configurationService: IConfigurationService
	) {
		super();

		this.instantiationService = instantiationService;
		this.messageService = messageService;
		this.editorService = editorService;
		this.textFileService = textFileService;
		this.outputService = outputService;
		this.contextService = contextService;
		this.lifecycleService = lifecycleService;

		this.raw = raw;
		this.state = ServiceState.NotInitialized;
		this.operations = [];
		this.model = new Model();
		this.toDispose = [];

		this.needsRefresh = false;
		this.statusDelayer = new ThrottledDelayer<IModel>(500);
		this.reactiveStatusDelayer = new PeriodThrottledDelayer<IModel>(500, 10000);
		this.autoFetcher = this.instantiationService.createInstance(AutoFetcher, this);
		this._allowHugeRepositories = false;

		this.registerListeners();

		this.inputCache = this.instantiationService.createInstance(EditorInputCache, this);

		this.triggerAutoStatus(true); // trigger initial status

		if (!storageService.getBoolean(IgnoreOldGitStorageKey, StorageScope.GLOBAL, false)) {
			this.raw.serviceState().done(state => {
				if (state !== RawServiceState.OK) {
					return undefined;
				}

				return this.raw.getVersion().then(version => {
					const match = /^(\d+)\.\d+\.\d+/.exec(version || '');
					const major = match && parseInt(match[1]);

					if (major && major < 2) {
						messageService.show(severity.Warning, {
							message: localize('updateGit', "You seem to have git {0} installed. Code works best with git >=2.0.0.", version),
							actions: [
								new Action('downloadLatest', localize('download', "Download"), '', true, () => {
									window.open('https://git-scm.com/');
									return null;
								}),
								new Action('neverShowAgain', localize('neverShowAgain', "Don't show again"), null, true, () => {
									storageService.store(IgnoreOldGitStorageKey, true, StorageScope.GLOBAL);
									return null;
								}),
								CloseAction
							]
						});
					}
				});
			});
		}
	}

	private registerListeners(): void {
		this.toDispose.push(this.fileService.onFileChanges((e) => this.onFileChanges(e)));
		this.toDispose.push(this.textFileService.models.onModelSaved((e) => this.onTextFileChange(e)));
		this.toDispose.push(this.textFileService.models.onModelReverted((e) => this.onTextFileChange(e)));
		this.toDispose.push(this.configurationService.onDidUpdateConfiguration(() => {
			if (this._allowHugeRepositories) {
				return;
			}

			const config = this.configurationService.getConfiguration<IGitConfiguration>('git');
			this._allowHugeRepositories = config.allowLargeRepositories;

			if (this._allowHugeRepositories) {
				this.triggerAutoStatus();
			}
		}));
		this.lifecycleService.onShutdown(this.dispose, this);

		const focusEvent = domEvent(window, 'focus');
		this.toDispose.push(focusEvent(() => {
			if (this.isStatusPending) {
				this.triggerAutoStatus();
			}
		}));
	}

	private onTextFileChange(e: TextFileModelChangeEvent): void {
		var shouldTriggerStatus = paths.basename(e.resource.fsPath) === '.gitignore';

		if (!shouldTriggerStatus) {
			return;
		}

		this.triggerAutoStatus();
	}

	private onFileChanges(e: FileChangesEvent): void {
		var isIdle = this.isIdle();

		var shouldTriggerStatus = e.changes.some(c => {
			var workspacePath = this.contextService.toWorkspaceRelativePath(c.resource);
			if (!workspacePath) {
				return false; // ignore out of workspace files
			}

			// for .gitindex, the service must be idle
			if ('.git/index' === workspacePath) {
				return isIdle;
			}

			// for anything other that .git*
			if (!/^\.git/.test(workspacePath)) {
				return true;
			}

			// added or deleted .git folder
			if (workspacePath === '.git') {
				return c.type === FileChangeType.ADDED || c.type === FileChangeType.DELETED;
			}

			return ['.git/index.lock', '.git/FETCH_HEAD', '.gitignore', '.gitmodules'].indexOf(workspacePath) === -1;
		});

		if (!shouldTriggerStatus) {
			return;
		}

		this.triggerAutoStatus();
	}

	private onGitServiceOperationEnd(e: { operation: IGitOperation; }): void {
		if (e.operation.id === ServiceOperations.COMMAND) {
			this.triggerAutoStatus();
		}
	}

	getState(): ServiceState {
		return this.state;
	}

	getModel(): IModel {
		return this.model;
	}

	status(): TPromise<IModel> {
		return this.statusDelayer.trigger(() => this._status());
	}

	private _status(): TPromise<IModel> {
		const config = this.configurationService.getConfiguration<IGitConfiguration>('git');

		if (this._allowHugeRepositories || config.allowLargeRepositories) {
			return this.run(ServiceOperations.STATUS, () => this.raw.status());
		}

		if (this.state === ServiceState.Huge) {
			return TPromise.as(this.model);
		}

		return this.raw.statusCount().then(count => {
			if (count > 5000 && !this._allowHugeRepositories) {
				this.transition(ServiceState.Huge);
				return TPromise.as(this.model);
			}

			return this.run(ServiceOperations.STATUS, () => this.raw.status());
		});
	}

	private triggerAutoStatus(force = false): void {
		this.isStatusPending = true;

		if (!document.hasFocus() && !force) {
			return;
		}

		this.isStatusPending = false;

		const config = this.configurationService.getConfiguration<IGitConfiguration>('git');

		if (!config.autorefresh) {
			return;
		}

		this.reactiveStatusDelayer.trigger(() => this.status()).done(null, e => {
			if (isPromiseCanceledError(e)) {
				return;
			}

			this.messageService.show(severity.Error, e);
		});
	}

	init(): TPromise<IModel> {
		return this.run(ServiceOperations.INIT, () => this.raw.init());
	}

	add(files?: IFileStatus[]): TPromise<IModel> {
		return this.run(ServiceOperations.ADD, () => this.raw.add(GitService.toPaths(files)));
	}

	stage(filePath: string, content: string): TPromise<IModel> {
		return this.run(ServiceOperations.STAGE, () => this.raw.stage(filePath, content));
	}

	branch(name: string, checkout: boolean = false): TPromise<IModel> {
		return this.run(ServiceOperations.BRANCH, () => this.raw.branch(name, checkout));
	}

	checkout(treeish: string = '', files: IFileStatus[] = null): TPromise<IModel> {
		return this.run(ServiceOperations.CHECKOUT, () => this.raw.checkout(treeish, GitService.toPaths(files)));
	}

	clean(files: IFileStatus[]): TPromise<IModel> {
		return this.run(ServiceOperations.CLEAN, () => this.raw.clean(files.map((s) => s.getPath())));
	}

	undo(): TPromise<IModel> {
		return this.run(ServiceOperations.UNDO, () => this.raw.undo());
	}

	reset(treeish: string, hard?: boolean): TPromise<IModel> {
		return this.run(ServiceOperations.RESET, () => this.raw.reset(treeish, hard));
	}

	revertFiles(treeish: string, files?: IFileStatus[]): TPromise<IModel> {
		return this.run(ServiceOperations.REVERT, () => this.raw.revertFiles(treeish, (files || []).map((s) => s.getPath())));
	}

	fetch(): TPromise<IModel> {
		return this.run(ServiceOperations.BACKGROUND_FETCH, () => this.raw.fetch());
	}

	pull(rebase?: boolean): TPromise<IModel> {
		return this.run(ServiceOperations.PULL, () => this.raw.pull(rebase));
	}

	push(remote?: string, name?: string, options?: IPushOptions): TPromise<IModel> {
		return this.run(ServiceOperations.PUSH, () => this.raw.push(remote, name, options));
	}

	sync(rebase?: boolean): TPromise<IModel> {
		const head = this.model.getHEAD();
		const isAhead = head && head.upstream && !!head.ahead;

		if (!isAhead) {
			return this.run(ServiceOperations.SYNC, () => this.raw.pull(rebase));
		} else {
			return this.run(ServiceOperations.SYNC, () => this.raw.sync());
		}
	}

	commit(message: string, amend: boolean = false, stage: boolean = false, signoff: boolean = false): TPromise<IModel> {
		return this.run(ServiceOperations.COMMIT, () => this.raw.commit(message, amend, stage, signoff));
	}

	getCommitTemplate(): TPromise<string> {
		return this.raw.getCommitTemplate();
	}

	getCommit(ref: string): TPromise<ICommit> {
		return this.raw.getCommit(ref);
	}

	detectMimetypes(path: string, treeish: string = '~'): TPromise<string[]> {
		return this.raw.detectMimetypes(path, treeish);
	}

	clone(url: string, parentPath: string): TPromise<string> {
		return this.raw.clone(url, parentPath)
			.then(null, e => this.wrapGitError(e));
	}

	private run(operationId: string, fn: () => TPromise<IRawStatus>): TPromise<IModel> {
		return this.raw.serviceState().then(state => {
			if (state === RawServiceState.GitNotFound) {
				this.transition(ServiceState.NoGit);
				return TPromise.as(null);
			} else if (state === RawServiceState.Disabled) {
				this.transition(ServiceState.Disabled);
				return TPromise.as(null);
			} else {
				return this._run(operationId, fn);
			}
		});
	}

	private _run(operationId: string, fn: () => TPromise<IRawStatus>): TPromise<IModel> {
		var operation = new GitOperation(operationId, fn);

		this.operations.push(operation);
		this.emit(ServiceEvents.OPERATION_START, operation);
		this.emit(ServiceEvents.OPERATION, operation);

		var onDone = (error: any = null) => {
			var index = this.operations.indexOf(operation);

			if (index > -1) {
				this.operations.splice(index, 1);
			}

			var e = { operation: operation, error: error };
			this.emit(ServiceEvents.OPERATION_END, e);
			this.onGitServiceOperationEnd(e);
			this.emit(ServiceEvents.OPERATION, operation);
		};

		return operation.run().then((status: IRawStatus) => {
			this.model.update(status);

			onDone();

			if (status) {
				this.transition(status.state === null || status.state === undefined ? ServiceState.OK : status.state);
			} else {
				this.transition(ServiceState.NotARepo);
			}

			return this.model;
		}, (e) => {
			onDone(e);

			if (isPromiseCanceledError(e)) {
				return TPromise.wrapError(e);
			}

			var gitErrorCode: string = e.gitErrorCode || null;

			if (gitErrorCode === GitErrorCodes.NotAtRepositoryRoot) {
				this.transition(ServiceState.NotAtRepoRoot);
				return TPromise.as(this.model);
			}

			this.emit(ServiceEvents.ERROR, e);
			this.transition(ServiceState.OK);

			if (gitErrorCode === GitErrorCodes.NoUserNameConfigured || gitErrorCode === GitErrorCodes.NoUserEmailConfigured) {
				this.messageService.show(severity.Warning, localize('configureUsernameEmail', "Please configure your git user name and e-mail."));

				return TPromise.as(null);

			} else if (gitErrorCode === GitErrorCodes.BadConfigFile) {
				this.messageService.show(severity.Error, localize('badConfigFile', "Git {0}", e.message));
				return TPromise.as(null);

			} else if (gitErrorCode === GitErrorCodes.UnmergedChanges) {
				this.messageService.show(severity.Warning, localize('unmergedChanges', "You should first resolve the unmerged changes before committing your changes."));
				return TPromise.as(null);
			}

			return this.wrapGitError(e);
		});
	}

	private wrapGitError<T>(e: any): TPromise<T> {
		const gitErrorCode: string = e.gitErrorCode || null;
		const showOutputAction = new Action('show.gitOutput', localize('showOutput', "Show Output"), null, true, () => this.outputService.getChannel('Git').show());
		const cancelAction = new Action('close.message', localize('cancel', "Cancel"), null, true, () => TPromise.as(true));
		const error = createError(
			localize('checkNativeConsole', "There was an issue running a git operation. Please review the output or use a console to check the state of your repository."),
			{ actions: [cancelAction, showOutputAction] }
		);

		(<any>error).gitErrorCode = gitErrorCode;
		(<any>error).stdout = e.stdout;
		(<any>error).stderr = e.stderr;

		return TPromise.wrapError(error);
	}

	private transition(state: ServiceState): void {
		var oldState = this.state;

		this.state = state;

		if (state !== oldState) {
			this.emit(ServiceEvents.STATE_CHANGED, state);
		}
	}

	buffer(path: string, treeish: string = '~'): TPromise<string> {
		return this.raw.show(path, treeish);
	}

	show(path: string, status: IFileStatus, treeish: string = '~', mimetype: string = 'text/plain'): TPromise<EditorInput> {
		return this.detectMimetypes(path, treeish).then((mimetypes: string[]) => {
			var pathComponents = status.getPathComponents();
			var fileSegment = pathComponents[pathComponents.length - 1];
			var folderSegment = toReadablePath(pathComponents.slice(0, pathComponents.length - 1).join('/'));

			var label: string;
			var description: string;

			if (treeish === '~') {
				label = localize('changesFromIndex', "{0} (index)", fileSegment);
				description = localize('changesFromIndexDesc', "{0} - Changes on index", folderSegment);
			} else {
				label = localize('changesFromTree', "{0} ({1})", fileSegment, treeish);
				description = localize('changesFromTreeDesc', "{0} - Changes on {1}", folderSegment, treeish);
			}

			if (mime.isUnspecific(mimetypes)) {
				mimetypes = mime.guessMimeTypes(path); // guess from path if our detection did not yield results
			}

			// Binary: our story is weak here for binary files on the index. Since we run natively, we do not have a way currently
			// to e.g. show images as binary inside the renderer because images need to be served through a URL to show. We could revisit this by
			// allowing to use data URLs for resource inputs to render them. However, this would mean potentially loading a large file into memory
			//
			// Our solution now is to detect binary files and immediately return an input that is flagged as binary unknown mime type.
			if (mime.isBinaryMime(mime.guessMimeTypes(path)) || mimetypes.indexOf(mime.MIME_BINARY) >= 0) {
				return TPromise.wrapError(new Error('The resource seems to be binary and cannot be displayed'));
			}

			// Text
			return TPromise.as(this.instantiationService.createInstance(NativeGitIndexStringEditorInput, label, description, mimetypes.join(', '), status, path, treeish));
		});
	}

	getInput(status: IFileStatus): TPromise<EditorInput> {
		return this.inputCache.getInput(status).then(null, (err) => {
			if (err.gitErrorCode = GitErrorCodes.CantOpenResource) {
				this.messageService.show(severity.Warning, localize('cantOpenResource', "Can't open this git resource."));
				return TPromise.as(null);
			}

			return TPromise.wrapError(err);
		});
	}

	isInitialized(): boolean {
		return this.state === ServiceState.OK;
	}

	isIdle(): boolean {
		return this.isInitialized() && !this.operations.some(op => op.id !== ServiceOperations.BACKGROUND_FETCH);
	}

	getRunningOperations(): IGitOperation[] {
		return this.operations;
	}

	getAutoFetcher(): IAutoFetcher {
		return this.autoFetcher;
	}

	private static toPaths(files: IFileStatus[]): string[] {
		if (!files) {
			return null;
		}

		return files.map((status) => {
			/*	In the case that a file was renamed in the index and (changed || deleted) in the
				working tree, we must use its new name, running the checkout command.
			*/

			switch (status.getStatus()) {
				case Status.MODIFIED:
				case Status.DELETED:
					if (status.getRename()) {
						return status.getRename();
					}

				default:
					return status.getPath();
			}
		});
	}

	dispose(): void {
		this.emit(ServiceEvents.DISPOSE);

		if (this.model) {
			this.model.dispose();
			this.model = null;
		}

		super.dispose();
	}
}