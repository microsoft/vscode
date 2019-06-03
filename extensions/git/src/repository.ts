/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { commands, Uri, Command, EventEmitter, Event, scm, SourceControl, SourceControlInputBox, SourceControlResourceGroup, SourceControlResourceState, SourceControlResourceDecorations, SourceControlInputBoxValidation, Disposable, ProgressLocation, window, workspace, WorkspaceEdit, ThemeColor, DecorationData, Memento, SourceControlInputBoxValidationType } from 'vscode';
import { Repository as BaseRepository, Commit, Stash, GitError, Submodule, CommitOptions, ForcePushMode } from './git';
import { anyEvent, filterEvent, eventToPromise, dispose, find, isDescendant, IDisposable, onceEvent, EmptyDisposable, debounceEvent } from './util';
import { memoize, throttle, debounce } from './decorators';
import { toGitUri } from './uri';
import { AutoFetcher } from './autofetch';
import * as path from 'path';
import * as nls from 'vscode-nls';
import * as fs from 'fs';
import { StatusBarCommands } from './statusbar';
import { Branch, Ref, Remote, RefType, GitErrorCodes, Status, LogOptions, Change } from './api/git';

const timeout = (millis: number) => new Promise(c => setTimeout(c, millis));

const localize = nls.loadMessageBundle();
const iconsRootPath = path.join(path.dirname(__dirname), 'resources', 'icons');

function getIconUri(iconName: string, theme: string): Uri {
	return Uri.file(path.join(iconsRootPath, theme, `${iconName}.svg`));
}

export const enum RepositoryState {
	Idle,
	Disposed
}

export const enum ResourceGroupType {
	Merge,
	Index,
	WorkingTree
}

export class Resource implements SourceControlResourceState {

	@memoize
	get resourceUri(): Uri {
		if (this.renameResourceUri && (this._type === Status.MODIFIED || this._type === Status.DELETED || this._type === Status.INDEX_RENAMED || this._type === Status.INDEX_COPIED)) {
			return this.renameResourceUri;
		}

		return this._resourceUri;
	}

	@memoize
	get command(): Command {
		return {
			command: 'git.openResource',
			title: localize('open', "Open"),
			arguments: [this]
		};
	}

	get resourceGroupType(): ResourceGroupType { return this._resourceGroupType; }
	get type(): Status { return this._type; }
	get original(): Uri { return this._resourceUri; }
	get renameResourceUri(): Uri | undefined { return this._renameResourceUri; }

	private static Icons: any = {
		light: {
			Modified: getIconUri('status-modified', 'light'),
			Added: getIconUri('status-added', 'light'),
			Deleted: getIconUri('status-deleted', 'light'),
			Renamed: getIconUri('status-renamed', 'light'),
			Copied: getIconUri('status-copied', 'light'),
			Untracked: getIconUri('status-untracked', 'light'),
			Ignored: getIconUri('status-ignored', 'light'),
			Conflict: getIconUri('status-conflict', 'light'),
		},
		dark: {
			Modified: getIconUri('status-modified', 'dark'),
			Added: getIconUri('status-added', 'dark'),
			Deleted: getIconUri('status-deleted', 'dark'),
			Renamed: getIconUri('status-renamed', 'dark'),
			Copied: getIconUri('status-copied', 'dark'),
			Untracked: getIconUri('status-untracked', 'dark'),
			Ignored: getIconUri('status-ignored', 'dark'),
			Conflict: getIconUri('status-conflict', 'dark')
		}
	};

	private getIconPath(theme: string): Uri {
		switch (this.type) {
			case Status.INDEX_MODIFIED: return Resource.Icons[theme].Modified;
			case Status.MODIFIED: return Resource.Icons[theme].Modified;
			case Status.INDEX_ADDED: return Resource.Icons[theme].Added;
			case Status.INDEX_DELETED: return Resource.Icons[theme].Deleted;
			case Status.DELETED: return Resource.Icons[theme].Deleted;
			case Status.INDEX_RENAMED: return Resource.Icons[theme].Renamed;
			case Status.INDEX_COPIED: return Resource.Icons[theme].Copied;
			case Status.UNTRACKED: return Resource.Icons[theme].Untracked;
			case Status.IGNORED: return Resource.Icons[theme].Ignored;
			case Status.INTENT_TO_ADD: return Resource.Icons[theme].Added;
			case Status.BOTH_DELETED: return Resource.Icons[theme].Conflict;
			case Status.ADDED_BY_US: return Resource.Icons[theme].Conflict;
			case Status.DELETED_BY_THEM: return Resource.Icons[theme].Conflict;
			case Status.ADDED_BY_THEM: return Resource.Icons[theme].Conflict;
			case Status.DELETED_BY_US: return Resource.Icons[theme].Conflict;
			case Status.BOTH_ADDED: return Resource.Icons[theme].Conflict;
			case Status.BOTH_MODIFIED: return Resource.Icons[theme].Conflict;
			default: throw new Error('Unknown git status: ' + this.type);
		}
	}

	private get tooltip(): string {
		switch (this.type) {
			case Status.INDEX_MODIFIED: return localize('index modified', "Index Modified");
			case Status.MODIFIED: return localize('modified', "Modified");
			case Status.INDEX_ADDED: return localize('index added', "Index Added");
			case Status.INDEX_DELETED: return localize('index deleted', "Index Deleted");
			case Status.DELETED: return localize('deleted', "Deleted");
			case Status.INDEX_RENAMED: return localize('index renamed', "Index Renamed");
			case Status.INDEX_COPIED: return localize('index copied', "Index Copied");
			case Status.UNTRACKED: return localize('untracked', "Untracked");
			case Status.IGNORED: return localize('ignored', "Ignored");
			case Status.INTENT_TO_ADD: return localize('intent to add', "Intent to Add");
			case Status.BOTH_DELETED: return localize('both deleted', "Both Deleted");
			case Status.ADDED_BY_US: return localize('added by us', "Added By Us");
			case Status.DELETED_BY_THEM: return localize('deleted by them', "Deleted By Them");
			case Status.ADDED_BY_THEM: return localize('added by them', "Added By Them");
			case Status.DELETED_BY_US: return localize('deleted by us', "Deleted By Us");
			case Status.BOTH_ADDED: return localize('both added', "Both Added");
			case Status.BOTH_MODIFIED: return localize('both modified', "Both Modified");
			default: return '';
		}
	}

	private get strikeThrough(): boolean {
		switch (this.type) {
			case Status.DELETED:
			case Status.BOTH_DELETED:
			case Status.DELETED_BY_THEM:
			case Status.DELETED_BY_US:
			case Status.INDEX_DELETED:
				return true;
			default:
				return false;
		}
	}

	@memoize
	private get faded(): boolean {
		// TODO@joao
		return false;
		// const workspaceRootPath = this.workspaceRoot.fsPath;
		// return this.resourceUri.fsPath.substr(0, workspaceRootPath.length) !== workspaceRootPath;
	}

	get decorations(): SourceControlResourceDecorations {
		const light = this._useIcons ? { iconPath: this.getIconPath('light') } : undefined;
		const dark = this._useIcons ? { iconPath: this.getIconPath('dark') } : undefined;
		const tooltip = this.tooltip;
		const strikeThrough = this.strikeThrough;
		const faded = this.faded;
		const letter = this.letter;
		const color = this.color;

		return { strikeThrough, faded, tooltip, light, dark, letter, color, source: 'git.resource' /*todo@joh*/ };
	}

	get letter(): string {
		switch (this.type) {
			case Status.INDEX_MODIFIED:
			case Status.MODIFIED:
				return 'M';
			case Status.INDEX_ADDED:
			case Status.INTENT_TO_ADD:
				return 'A';
			case Status.INDEX_DELETED:
			case Status.DELETED:
				return 'D';
			case Status.INDEX_RENAMED:
				return 'R';
			case Status.UNTRACKED:
				return 'U';
			case Status.IGNORED:
				return 'I';
			case Status.DELETED_BY_THEM:
				return 'D';
			case Status.DELETED_BY_US:
				return 'D';
			case Status.INDEX_COPIED:
			case Status.BOTH_DELETED:
			case Status.ADDED_BY_US:
			case Status.ADDED_BY_THEM:
			case Status.BOTH_ADDED:
			case Status.BOTH_MODIFIED:
				return 'C';
			default:
				throw new Error('Unknown git status: ' + this.type);
		}
	}

	get color(): ThemeColor {
		switch (this.type) {
			case Status.INDEX_MODIFIED:
			case Status.MODIFIED:
				return new ThemeColor('gitDecoration.modifiedResourceForeground');
			case Status.INDEX_DELETED:
			case Status.DELETED:
				return new ThemeColor('gitDecoration.deletedResourceForeground');
			case Status.INDEX_ADDED:
			case Status.INTENT_TO_ADD:
				return new ThemeColor('gitDecoration.addedResourceForeground');
			case Status.INDEX_RENAMED:
			case Status.UNTRACKED:
				return new ThemeColor('gitDecoration.untrackedResourceForeground');
			case Status.IGNORED:
				return new ThemeColor('gitDecoration.ignoredResourceForeground');
			case Status.INDEX_COPIED:
			case Status.BOTH_DELETED:
			case Status.ADDED_BY_US:
			case Status.DELETED_BY_THEM:
			case Status.ADDED_BY_THEM:
			case Status.DELETED_BY_US:
			case Status.BOTH_ADDED:
			case Status.BOTH_MODIFIED:
				return new ThemeColor('gitDecoration.conflictingResourceForeground');
			default:
				throw new Error('Unknown git status: ' + this.type);
		}
	}

	get priority(): number {
		switch (this.type) {
			case Status.INDEX_MODIFIED:
			case Status.MODIFIED:
				return 2;
			case Status.IGNORED:
				return 3;
			case Status.INDEX_COPIED:
			case Status.BOTH_DELETED:
			case Status.ADDED_BY_US:
			case Status.DELETED_BY_THEM:
			case Status.ADDED_BY_THEM:
			case Status.DELETED_BY_US:
			case Status.BOTH_ADDED:
			case Status.BOTH_MODIFIED:
				return 4;
			default:
				return 1;
		}
	}

	get resourceDecoration(): DecorationData {
		const title = this.tooltip;
		const letter = this.letter;
		const color = this.color;
		const priority = this.priority;
		return { bubble: true, source: 'git.resource', title, letter, color, priority };
	}

	constructor(
		private _resourceGroupType: ResourceGroupType,
		private _resourceUri: Uri,
		private _type: Status,
		private _useIcons: boolean,
		private _renameResourceUri?: Uri
	) { }
}

export const enum Operation {
	Status = 'Status',
	Config = 'Config',
	Diff = 'Diff',
	MergeBase = 'MergeBase',
	Add = 'Add',
	Remove = 'Remove',
	RevertFiles = 'RevertFiles',
	Commit = 'Commit',
	Clean = 'Clean',
	Branch = 'Branch',
	GetBranch = 'GetBranch',
	SetBranchUpstream = 'SetBranchUpstream',
	HashObject = 'HashObject',
	Checkout = 'Checkout',
	CheckoutTracking = 'CheckoutTracking',
	Reset = 'Reset',
	Remote = 'Remote',
	Fetch = 'Fetch',
	Pull = 'Pull',
	Push = 'Push',
	Sync = 'Sync',
	Show = 'Show',
	Stage = 'Stage',
	GetCommitTemplate = 'GetCommitTemplate',
	DeleteBranch = 'DeleteBranch',
	RenameBranch = 'RenameBranch',
	DeleteRef = 'DeleteRef',
	Merge = 'Merge',
	Ignore = 'Ignore',
	Tag = 'Tag',
	Stash = 'Stash',
	CheckIgnore = 'CheckIgnore',
	GetObjectDetails = 'GetObjectDetails',
	SubmoduleUpdate = 'SubmoduleUpdate',
	RebaseContinue = 'RebaseContinue',
	FindTrackingBranches = 'GetTracking',
	Apply = 'Apply',
	Blame = 'Blame',
	Log = 'Log',
}

function isReadOnly(operation: Operation): boolean {
	switch (operation) {
		case Operation.Show:
		case Operation.GetCommitTemplate:
		case Operation.CheckIgnore:
		case Operation.GetObjectDetails:
		case Operation.MergeBase:
			return true;
		default:
			return false;
	}
}

function shouldShowProgress(operation: Operation): boolean {
	switch (operation) {
		case Operation.Fetch:
		case Operation.CheckIgnore:
		case Operation.GetObjectDetails:
		case Operation.Show:
			return false;
		default:
			return true;
	}
}

export interface Operations {
	isIdle(): boolean;
	shouldShowProgress(): boolean;
	isRunning(operation: Operation): boolean;
}

class OperationsImpl implements Operations {

	private operations = new Map<Operation, number>();

	start(operation: Operation): void {
		this.operations.set(operation, (this.operations.get(operation) || 0) + 1);
	}

	end(operation: Operation): void {
		const count = (this.operations.get(operation) || 0) - 1;

		if (count <= 0) {
			this.operations.delete(operation);
		} else {
			this.operations.set(operation, count);
		}
	}

	isRunning(operation: Operation): boolean {
		return this.operations.has(operation);
	}

	isIdle(): boolean {
		const operations = this.operations.keys();

		for (const operation of operations) {
			if (!isReadOnly(operation)) {
				return false;
			}
		}

		return true;
	}

	shouldShowProgress(): boolean {
		const operations = this.operations.keys();

		for (const operation of operations) {
			if (shouldShowProgress(operation)) {
				return true;
			}
		}

		return false;
	}
}

export interface GitResourceGroup extends SourceControlResourceGroup {
	resourceStates: Resource[];
}

export interface OperationResult {
	operation: Operation;
	error: any;
}

class ProgressManager {

	private enabled = false;
	private disposable: IDisposable = EmptyDisposable;

	constructor(private repository: Repository) {
		const onDidChange = filterEvent(workspace.onDidChangeConfiguration, e => e.affectsConfiguration('git', Uri.file(this.repository.root)));
		onDidChange(_ => this.updateEnablement());
		this.updateEnablement();
	}

	private updateEnablement(): void {
		const config = workspace.getConfiguration('git', Uri.file(this.repository.root));

		if (config.get<boolean>('showProgress')) {
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
	}
}

export class Repository implements Disposable {

	private _onDidChangeRepository = new EventEmitter<Uri>();
	readonly onDidChangeRepository: Event<Uri> = this._onDidChangeRepository.event;

	private _onDidChangeState = new EventEmitter<RepositoryState>();
	readonly onDidChangeState: Event<RepositoryState> = this._onDidChangeState.event;

	private _onDidChangeStatus = new EventEmitter<void>();
	readonly onDidRunGitStatus: Event<void> = this._onDidChangeStatus.event;

	private _onDidChangeOriginalResource = new EventEmitter<Uri>();
	readonly onDidChangeOriginalResource: Event<Uri> = this._onDidChangeOriginalResource.event;

	private _onRunOperation = new EventEmitter<Operation>();
	readonly onRunOperation: Event<Operation> = this._onRunOperation.event;

	private _onDidRunOperation = new EventEmitter<OperationResult>();
	readonly onDidRunOperation: Event<OperationResult> = this._onDidRunOperation.event;

	@memoize
	get onDidChangeOperations(): Event<void> {
		return anyEvent(this.onRunOperation as Event<any>, this.onDidRunOperation as Event<any>);
	}

	private _sourceControl: SourceControl;
	get sourceControl(): SourceControl { return this._sourceControl; }

	get inputBox(): SourceControlInputBox { return this._sourceControl.inputBox; }

	private _mergeGroup: SourceControlResourceGroup;
	get mergeGroup(): GitResourceGroup { return this._mergeGroup as GitResourceGroup; }

	private _indexGroup: SourceControlResourceGroup;
	get indexGroup(): GitResourceGroup { return this._indexGroup as GitResourceGroup; }

	private _workingTreeGroup: SourceControlResourceGroup;
	get workingTreeGroup(): GitResourceGroup { return this._workingTreeGroup as GitResourceGroup; }

	private _HEAD: Branch | undefined;
	get HEAD(): Branch | undefined {
		return this._HEAD;
	}

	private _refs: Ref[] = [];
	get refs(): Ref[] {
		return this._refs;
	}

	private _remotes: Remote[] = [];
	get remotes(): Remote[] {
		return this._remotes;
	}

	private _submodules: Submodule[] = [];
	get submodules(): Submodule[] {
		return this._submodules;
	}

	private _rebaseCommit: Commit | undefined = undefined;

	set rebaseCommit(rebaseCommit: Commit | undefined) {
		if (this._rebaseCommit && !rebaseCommit) {
			this.inputBox.value = '';
		} else if (rebaseCommit && (!this._rebaseCommit || this._rebaseCommit.hash !== rebaseCommit.hash)) {
			this.inputBox.value = rebaseCommit.message;
		}

		this._rebaseCommit = rebaseCommit;
	}

	get rebaseCommit(): Commit | undefined {
		return this._rebaseCommit;
	}

	private _operations = new OperationsImpl();
	get operations(): Operations { return this._operations; }

	private _state = RepositoryState.Idle;
	get state(): RepositoryState { return this._state; }
	set state(state: RepositoryState) {
		this._state = state;
		this._onDidChangeState.fire(state);

		this._HEAD = undefined;
		this._refs = [];
		this._remotes = [];
		this.mergeGroup.resourceStates = [];
		this.indexGroup.resourceStates = [];
		this.workingTreeGroup.resourceStates = [];
		this._sourceControl.count = 0;
	}

	get root(): string {
		return this.repository.root;
	}

	private isRepositoryHuge = false;
	private didWarnAboutLimit = false;
	private isFreshRepository: boolean | undefined = undefined;
	private disposables: Disposable[] = [];

	constructor(
		private readonly repository: BaseRepository,
		globalState: Memento
	) {
		const fsWatcher = workspace.createFileSystemWatcher('**');
		this.disposables.push(fsWatcher);

		const workspaceFilter = (uri: Uri) => isDescendant(repository.root, uri.fsPath);
		const onWorkspaceDelete = filterEvent(fsWatcher.onDidDelete, workspaceFilter);
		const onWorkspaceChange = filterEvent(anyEvent(fsWatcher.onDidChange, fsWatcher.onDidCreate), workspaceFilter);
		const onRepositoryDotGitDelete = filterEvent(onWorkspaceDelete, uri => /\/\.git$/.test(uri.path));
		const onRepositoryChange = anyEvent(onWorkspaceDelete, onWorkspaceChange);

		// relevant repository changes are:
		//  - DELETE .git folder
		//  - ANY CHANGE within .git folder except .git itself and .git/index.lock
		const onRelevantRepositoryChange = anyEvent(
			onRepositoryDotGitDelete,
			filterEvent(onRepositoryChange, uri => !/\/\.git(\/index\.lock)?$/.test(uri.path))
		);

		onRelevantRepositoryChange(this.onFSChange, this, this.disposables);

		const onRelevantGitChange = filterEvent(onRelevantRepositoryChange, uri => /\/\.git\//.test(uri.path));
		onRelevantGitChange(this._onDidChangeRepository.fire, this._onDidChangeRepository, this.disposables);

		const root = Uri.file(repository.root);
		this._sourceControl = scm.createSourceControl('git', 'Git', root);
		this._sourceControl.inputBox.placeholder = localize('commitMessage', "Message (press {0} to commit)");
		this._sourceControl.acceptInputCommand = { command: 'git.commitWithInput', title: localize('commit', "Commit"), arguments: [this._sourceControl] };
		this._sourceControl.quickDiffProvider = this;
		this._sourceControl.inputBox.validateInput = this.validateInput.bind(this);
		this.disposables.push(this._sourceControl);

		this._mergeGroup = this._sourceControl.createResourceGroup('merge', localize('merge changes', "Merge Changes"));
		this._indexGroup = this._sourceControl.createResourceGroup('index', localize('staged changes', "Staged Changes"));
		this._workingTreeGroup = this._sourceControl.createResourceGroup('workingTree', localize('changes', "Changes"));

		const updateIndexGroupVisibility = () => {
			const config = workspace.getConfiguration('git', root);
			this.indexGroup.hideWhenEmpty = !config.get<boolean>('alwaysShowStagedChangesResourceGroup');
		};

		const onConfigListener = filterEvent(workspace.onDidChangeConfiguration, e => e.affectsConfiguration('git.alwaysShowStagedChangesResourceGroup', root));
		onConfigListener(updateIndexGroupVisibility, this, this.disposables);
		updateIndexGroupVisibility();

		this.mergeGroup.hideWhenEmpty = true;

		this.disposables.push(this.mergeGroup);
		this.disposables.push(this.indexGroup);
		this.disposables.push(this.workingTreeGroup);

		this.disposables.push(new AutoFetcher(this, globalState));

		// https://github.com/Microsoft/vscode/issues/39039
		const onSuccessfulPush = filterEvent(this.onDidRunOperation, e => e.operation === Operation.Push && !e.error);
		onSuccessfulPush(() => {
			const gitConfig = workspace.getConfiguration('git');

			if (gitConfig.get<boolean>('showPushSuccessNotification')) {
				window.showInformationMessage(localize('push success', "Successfully pushed."));
			}
		}, null, this.disposables);

		const statusBar = new StatusBarCommands(this);
		this.disposables.push(statusBar);
		statusBar.onDidChange(() => this._sourceControl.statusBarCommands = statusBar.commands, null, this.disposables);
		this._sourceControl.statusBarCommands = statusBar.commands;

		const progressManager = new ProgressManager(this);
		this.disposables.push(progressManager);

		this.updateCommitTemplate();
		this.status();
	}

	validateInput(text: string, position: number): SourceControlInputBoxValidation | undefined {
		if (this.rebaseCommit) {
			if (this.rebaseCommit.message !== text) {
				return {
					message: localize('commit in rebase', "It's not possible to change the commit message in the middle of a rebase. Please complete the rebase operation and use interactive rebase instead."),
					type: SourceControlInputBoxValidationType.Warning
				};
			}
		}

		const config = workspace.getConfiguration('git');
		const setting = config.get<'always' | 'warn' | 'off'>('inputValidation');

		if (setting === 'off') {
			return;
		}

		if (/^\s+$/.test(text)) {
			return {
				message: localize('commitMessageWhitespacesOnlyWarning', "Current commit message only contains whitespace characters"),
				type: SourceControlInputBoxValidationType.Warning
			};
		}

		let lineNumber = 0;
		let start = 0, end;
		let match: RegExpExecArray | null;
		const regex = /\r?\n/g;

		while ((match = regex.exec(text)) && position > match.index) {
			start = match.index + match[0].length;
			lineNumber++;
		}

		end = match ? match.index : text.length;

		const line = text.substring(start, end);

		let threshold = config.get<number>('inputValidationLength', 50);

		if (lineNumber === 0) {
			const inputValidationSubjectLength = config.get<number | null>('inputValidationSubjectLength', null);

			if (inputValidationSubjectLength !== null) {
				threshold = inputValidationSubjectLength;
			}
		}

		if (line.length <= threshold) {
			if (setting !== 'always') {
				return;
			}

			return {
				message: localize('commitMessageCountdown', "{0} characters left in current line", threshold - line.length),
				type: SourceControlInputBoxValidationType.Information
			};
		} else {
			return {
				message: localize('commitMessageWarning', "{0} characters over {1} in current line", line.length - threshold, threshold),
				type: SourceControlInputBoxValidationType.Warning
			};
		}
	}

	provideOriginalResource(uri: Uri): Uri | undefined {
		if (uri.scheme !== 'file') {
			return;
		}

		return toGitUri(uri, '', { replaceFileExtension: true });
	}

	private async updateCommitTemplate(): Promise<void> {
		try {
			this._sourceControl.commitTemplate = await this.repository.getCommitTemplate();
		} catch (e) {
			// noop
		}
	}

	getConfigs(): Promise<{ key: string; value: string; }[]> {
		return this.run(Operation.Config, () => this.repository.getConfigs('local'));
	}

	getConfig(key: string): Promise<string> {
		return this.run(Operation.Config, () => this.repository.config('local', key));
	}

	getGlobalConfig(key: string): Promise<string> {
		return this.run(Operation.Config, () => this.repository.config('global', key));
	}

	setConfig(key: string, value: string): Promise<string> {
		return this.run(Operation.Config, () => this.repository.config('local', key, value));
	}

	log(options?: LogOptions): Promise<Commit[]> {
		return this.run(Operation.Log, () => this.repository.log(options));
	}

	@throttle
	async status(): Promise<void> {
		await this.run(Operation.Status);
	}

	diff(cached?: boolean): Promise<string> {
		return this.run(Operation.Diff, () => this.repository.diff(cached));
	}

	diffWithHEAD(): Promise<Change[]>;
	diffWithHEAD(path: string): Promise<string>;
	diffWithHEAD(path?: string | undefined): Promise<string | Change[]>;
	diffWithHEAD(path?: string | undefined): Promise<string | Change[]> {
		return this.run(Operation.Diff, () => this.repository.diffWithHEAD(path));
	}

	diffWith(ref: string): Promise<Change[]>;
	diffWith(ref: string, path: string): Promise<string>;
	diffWith(ref: string, path?: string | undefined): Promise<string | Change[]>;
	diffWith(ref: string, path?: string): Promise<string | Change[]> {
		return this.run(Operation.Diff, () => this.repository.diffWith(ref, path));
	}

	diffIndexWithHEAD(): Promise<Change[]>;
	diffIndexWithHEAD(path: string): Promise<string>;
	diffIndexWithHEAD(path?: string | undefined): Promise<string | Change[]>;
	diffIndexWithHEAD(path?: string): Promise<string | Change[]> {
		return this.run(Operation.Diff, () => this.repository.diffIndexWithHEAD(path));
	}

	diffIndexWith(ref: string): Promise<Change[]>;
	diffIndexWith(ref: string, path: string): Promise<string>;
	diffIndexWith(ref: string, path?: string | undefined): Promise<string | Change[]>;
	diffIndexWith(ref: string, path?: string): Promise<string | Change[]> {
		return this.run(Operation.Diff, () => this.repository.diffIndexWith(ref, path));
	}

	diffBlobs(object1: string, object2: string): Promise<string> {
		return this.run(Operation.Diff, () => this.repository.diffBlobs(object1, object2));
	}

	diffBetween(ref1: string, ref2: string): Promise<Change[]>;
	diffBetween(ref1: string, ref2: string, path: string): Promise<string>;
	diffBetween(ref1: string, ref2: string, path?: string | undefined): Promise<string | Change[]>;
	diffBetween(ref1: string, ref2: string, path?: string): Promise<string | Change[]> {
		return this.run(Operation.Diff, () => this.repository.diffBetween(ref1, ref2, path));
	}

	getMergeBase(ref1: string, ref2: string): Promise<string> {
		return this.run(Operation.MergeBase, () => this.repository.getMergeBase(ref1, ref2));
	}

	async hashObject(data: string): Promise<string> {
		return this.run(Operation.HashObject, () => this.repository.hashObject(data));
	}

	async add(resources: Uri[]): Promise<void> {
		await this.run(Operation.Add, () => this.repository.add(resources.map(r => r.fsPath)));
	}

	async rm(resources: Uri[]): Promise<void> {
		await this.run(Operation.Remove, () => this.repository.rm(resources.map(r => r.fsPath)));
	}

	async stage(resource: Uri, contents: string): Promise<void> {
		const relativePath = path.relative(this.repository.root, resource.fsPath).replace(/\\/g, '/');
		await this.run(Operation.Stage, () => this.repository.stage(relativePath, contents));
		this._onDidChangeOriginalResource.fire(resource);
	}

	async revert(resources: Uri[]): Promise<void> {
		await this.run(Operation.RevertFiles, () => this.repository.revert('HEAD', resources.map(r => r.fsPath)));
	}

	async commit(message: string, opts: CommitOptions = Object.create(null)): Promise<void> {
		if (this.rebaseCommit) {
			await this.run(Operation.RebaseContinue, async () => {
				if (opts.all) {
					await this.repository.add([]);
				}

				await this.repository.rebaseContinue();
			});
		} else {
			await this.run(Operation.Commit, async () => {
				if (opts.all) {
					await this.repository.add([]);
				}

				await this.repository.commit(message, opts);
			});
		}
	}

	async clean(resources: Uri[]): Promise<void> {
		await this.run(Operation.Clean, async () => {
			const toClean: string[] = [];
			const toCheckout: string[] = [];
			const submodulesToUpdate: string[] = [];

			resources.forEach(r => {
				const fsPath = r.fsPath;

				for (const submodule of this.submodules) {
					if (path.join(this.root, submodule.path) === fsPath) {
						submodulesToUpdate.push(fsPath);
						return;
					}
				}

				const raw = r.toString();
				const scmResource = find(this.workingTreeGroup.resourceStates, sr => sr.resourceUri.toString() === raw);

				if (!scmResource) {
					return;
				}

				switch (scmResource.type) {
					case Status.UNTRACKED:
					case Status.IGNORED:
						toClean.push(fsPath);
						break;

					default:
						toCheckout.push(fsPath);
						break;
				}
			});

			const promises: Promise<void>[] = [];

			if (toClean.length > 0) {
				promises.push(this.repository.clean(toClean));
			}

			if (toCheckout.length > 0) {
				promises.push(this.repository.checkout('', toCheckout));
			}

			if (submodulesToUpdate.length > 0) {
				promises.push(this.repository.updateSubmodules(submodulesToUpdate));
			}

			await Promise.all(promises);
		});
	}

	async branch(name: string, _checkout: boolean, _ref?: string): Promise<void> {
		await this.run(Operation.Branch, () => this.repository.branch(name, _checkout, _ref));
	}

	async deleteBranch(name: string, force?: boolean): Promise<void> {
		await this.run(Operation.DeleteBranch, () => this.repository.deleteBranch(name, force));
	}

	async renameBranch(name: string): Promise<void> {
		await this.run(Operation.RenameBranch, () => this.repository.renameBranch(name));
	}

	async getBranch(name: string): Promise<Branch> {
		return await this.run(Operation.GetBranch, () => this.repository.getBranch(name));
	}

	async setBranchUpstream(name: string, upstream: string): Promise<void> {
		await this.run(Operation.SetBranchUpstream, () => this.repository.setBranchUpstream(name, upstream));
	}

	async merge(ref: string): Promise<void> {
		await this.run(Operation.Merge, () => this.repository.merge(ref));
	}

	async tag(name: string, message?: string): Promise<void> {
		await this.run(Operation.Tag, () => this.repository.tag(name, message));
	}

	async checkout(treeish: string): Promise<void> {
		await this.run(Operation.Checkout, () => this.repository.checkout(treeish, []));
	}

	async checkoutTracking(treeish: string): Promise<void> {
		await this.run(Operation.CheckoutTracking, () => this.repository.checkout(treeish, [], { track: true }));
	}

	async findTrackingBranches(upstreamRef: string): Promise<Branch[]> {
		return await this.run(Operation.FindTrackingBranches, () => this.repository.findTrackingBranches(upstreamRef));
	}

	async getCommit(ref: string): Promise<Commit> {
		return await this.repository.getCommit(ref);
	}

	async reset(treeish: string, hard?: boolean): Promise<void> {
		await this.run(Operation.Reset, () => this.repository.reset(treeish, hard));
	}

	async deleteRef(ref: string): Promise<void> {
		await this.run(Operation.DeleteRef, () => this.repository.deleteRef(ref));
	}

	async addRemote(name: string, url: string): Promise<void> {
		await this.run(Operation.Remote, () => this.repository.addRemote(name, url));
	}

	async removeRemote(name: string): Promise<void> {
		await this.run(Operation.Remote, () => this.repository.removeRemote(name));
	}

	@throttle
	async fetchDefault(): Promise<void> {
		await this.run(Operation.Fetch, () => this.repository.fetch());
	}

	@throttle
	async fetchPrune(): Promise<void> {
		await this.run(Operation.Fetch, () => this.repository.fetch({ prune: true }));
	}

	@throttle
	async fetchAll(): Promise<void> {
		await this.run(Operation.Fetch, () => this.repository.fetch({ all: true }));
	}

	async fetch(remote?: string, ref?: string, depth?: number): Promise<void> {
		await this.run(Operation.Fetch, () => this.repository.fetch({ remote, ref, depth }));
	}

	@throttle
	async pullWithRebase(head: Branch | undefined): Promise<void> {
		let remote: string | undefined;
		let branch: string | undefined;

		if (head && head.name && head.upstream) {
			remote = head.upstream.remote;
			branch = `${head.upstream.name}`;
		}

		return this.pullFrom(true, remote, branch);
	}

	@throttle
	async pull(head?: Branch, unshallow?: boolean): Promise<void> {
		let remote: string | undefined;
		let branch: string | undefined;

		if (head && head.name && head.upstream) {
			remote = head.upstream.remote;
			branch = `${head.upstream.name}`;
		}

		return this.pullFrom(false, remote, branch, unshallow);
	}

	async pullFrom(rebase?: boolean, remote?: string, branch?: string, unshallow?: boolean): Promise<void> {
		await this.run(Operation.Pull, async () => {
			await this.maybeAutoStash(async () => {
				const config = workspace.getConfiguration('git', Uri.file(this.root));
				const fetchOnPull = config.get<boolean>('fetchOnPull');

				if (fetchOnPull) {
					await this.repository.pull(rebase, undefined, undefined, { unshallow });
				} else {
					await this.repository.pull(rebase, remote, branch, { unshallow });
				}
			});
		});
	}

	@throttle
	async push(head: Branch, forcePushMode?: ForcePushMode): Promise<void> {
		let remote: string | undefined;
		let branch: string | undefined;

		if (head && head.name && head.upstream) {
			remote = head.upstream.remote;
			branch = `${head.name}:${head.upstream.name}`;
		}

		await this.run(Operation.Push, () => this.repository.push(remote, branch, undefined, undefined, forcePushMode));
	}

	async pushTo(remote?: string, name?: string, setUpstream: boolean = false, forcePushMode?: ForcePushMode): Promise<void> {
		await this.run(Operation.Push, () => this.repository.push(remote, name, setUpstream, undefined, forcePushMode));
	}

	async pushTags(remote?: string, forcePushMode?: ForcePushMode): Promise<void> {
		await this.run(Operation.Push, () => this.repository.push(remote, undefined, false, true, forcePushMode));
	}

	async blame(path: string): Promise<string> {
		return await this.run(Operation.Blame, () => this.repository.blame(path));
	}

	@throttle
	sync(head: Branch): Promise<void> {
		return this._sync(head, false);
	}

	@throttle
	async syncRebase(head: Branch): Promise<void> {
		return this._sync(head, true);
	}

	private async _sync(head: Branch, rebase: boolean): Promise<void> {
		let remoteName: string | undefined;
		let pullBranch: string | undefined;
		let pushBranch: string | undefined;

		if (head.name && head.upstream) {
			remoteName = head.upstream.remote;
			pullBranch = `${head.upstream.name}`;
			pushBranch = `${head.name}:${head.upstream.name}`;
		}

		await this.run(Operation.Sync, async () => {
			await this.maybeAutoStash(async () => {
				const config = workspace.getConfiguration('git', Uri.file(this.root));
				const fetchOnPull = config.get<boolean>('fetchOnPull');

				if (fetchOnPull) {
					await this.repository.pull(rebase);
				} else {
					await this.repository.pull(rebase, remoteName, pullBranch);
				}

				const remote = this.remotes.find(r => r.name === remoteName);

				if (remote && remote.isReadOnly) {
					return;
				}

				const shouldPush = this.HEAD && (typeof this.HEAD.ahead === 'number' ? this.HEAD.ahead > 0 : true);

				if (shouldPush) {
					await this.repository.push(remoteName, pushBranch);
				}
			});
		});
	}

	async show(ref: string, filePath: string): Promise<string> {
		return await this.run(Operation.Show, async () => {
			const relativePath = path.relative(this.repository.root, filePath).replace(/\\/g, '/');
			const configFiles = workspace.getConfiguration('files', Uri.file(filePath));
			const defaultEncoding = configFiles.get<string>('encoding');
			const autoGuessEncoding = configFiles.get<boolean>('autoGuessEncoding');

			try {
				return await this.repository.bufferString(`${ref}:${relativePath}`, defaultEncoding, autoGuessEncoding);
			} catch (err) {
				if (err.gitErrorCode === GitErrorCodes.WrongCase) {
					const gitRelativePath = await this.repository.getGitRelativePath(ref, relativePath);
					return await this.repository.bufferString(`${ref}:${gitRelativePath}`, defaultEncoding, autoGuessEncoding);
				}

				throw err;
			}
		});
	}

	async buffer(ref: string, filePath: string): Promise<Buffer> {
		return this.run(Operation.Show, () => {
			const relativePath = path.relative(this.repository.root, filePath).replace(/\\/g, '/');
			return this.repository.buffer(`${ref}:${relativePath}`);
		});
	}

	getObjectDetails(ref: string, filePath: string): Promise<{ mode: string, object: string, size: number }> {
		return this.run(Operation.GetObjectDetails, () => this.repository.getObjectDetails(ref, filePath));
	}

	detectObjectType(object: string): Promise<{ mimetype: string, encoding?: string }> {
		return this.run(Operation.Show, () => this.repository.detectObjectType(object));
	}

	async apply(patch: string, reverse?: boolean): Promise<void> {
		return await this.run(Operation.Apply, () => this.repository.apply(patch, reverse));
	}

	async getStashes(): Promise<Stash[]> {
		return await this.repository.getStashes();
	}

	async createStash(message?: string, includeUntracked?: boolean): Promise<void> {
		return await this.run(Operation.Stash, () => this.repository.createStash(message, includeUntracked));
	}

	async popStash(index?: number): Promise<void> {
		return await this.run(Operation.Stash, () => this.repository.popStash(index));
	}

	async applyStash(index?: number): Promise<void> {
		return await this.run(Operation.Stash, () => this.repository.applyStash(index));
	}

	async getCommitTemplate(): Promise<string> {
		return await this.run(Operation.GetCommitTemplate, async () => this.repository.getCommitTemplate());
	}

	async ignore(files: Uri[]): Promise<void> {
		return await this.run(Operation.Ignore, async () => {
			const ignoreFile = `${this.repository.root}${path.sep}.gitignore`;
			const textToAppend = files
				.map(uri => path.relative(this.repository.root, uri.fsPath).replace(/\\/g, '/'))
				.join('\n');

			const document = await new Promise(c => fs.exists(ignoreFile, c))
				? await workspace.openTextDocument(ignoreFile)
				: await workspace.openTextDocument(Uri.file(ignoreFile).with({ scheme: 'untitled' }));

			await window.showTextDocument(document);

			const edit = new WorkspaceEdit();
			const lastLine = document.lineAt(document.lineCount - 1);
			const text = lastLine.isEmptyOrWhitespace ? `${textToAppend}\n` : `\n${textToAppend}\n`;

			edit.insert(document.uri, lastLine.range.end, text);
			await workspace.applyEdit(edit);
			await document.save();
		});
	}

	checkIgnore(filePaths: string[]): Promise<Set<string>> {
		return this.run(Operation.CheckIgnore, () => {
			return new Promise<Set<string>>((resolve, reject) => {

				filePaths = filePaths
					.filter(filePath => isDescendant(this.root, filePath));

				if (filePaths.length === 0) {
					// nothing left
					return resolve(new Set<string>());
				}

				// https://git-scm.com/docs/git-check-ignore#git-check-ignore--z
				const child = this.repository.stream(['check-ignore', '-v', '-z', '--stdin'], { stdio: [null, null, null] });
				child.stdin.end(filePaths.join('\0'), 'utf8');

				const onExit = (exitCode: number) => {
					if (exitCode === 1) {
						// nothing ignored
						resolve(new Set<string>());
					} else if (exitCode === 0) {
						resolve(new Set<string>(this.parseIgnoreCheck(data)));
					} else {
						if (/ is in submodule /.test(stderr)) {
							reject(new GitError({ stdout: data, stderr, exitCode, gitErrorCode: GitErrorCodes.IsInSubmodule }));
						} else {
							reject(new GitError({ stdout: data, stderr, exitCode }));
						}
					}
				};

				let data = '';
				const onStdoutData = (raw: string) => {
					data += raw;
				};

				child.stdout.setEncoding('utf8');
				child.stdout.on('data', onStdoutData);

				let stderr: string = '';
				child.stderr.setEncoding('utf8');
				child.stderr.on('data', raw => stderr += raw);

				child.on('error', reject);
				child.on('exit', onExit);
			});
		});
	}

	// Parses output of `git check-ignore -v -z` and returns only those paths
	// that are actually ignored by git.
	// Matches to a negative pattern (starting with '!') are filtered out.
	// See also https://git-scm.com/docs/git-check-ignore#_output.
	private parseIgnoreCheck(raw: string): string[] {
		const ignored = [];
		const elements = raw.split('\0');
		for (let i = 0; i < elements.length; i += 4) {
			const pattern = elements[i + 2];
			const path = elements[i + 3];
			if (pattern && !pattern.startsWith('!')) {
				ignored.push(path);
			}
		}
		return ignored;
	}

	private async run<T>(operation: Operation, runOperation: () => Promise<T> = () => Promise.resolve<any>(null)): Promise<T> {
		if (this.state !== RepositoryState.Idle) {
			throw new Error('Repository not initialized');
		}

		let error: any = null;

		this._operations.start(operation);
		this._onRunOperation.fire(operation);

		try {
			const result = await this.retryRun(operation, runOperation);

			if (!isReadOnly(operation)) {
				await this.updateModelState();
			}

			return result;
		} catch (err) {
			error = err;

			if (err.gitErrorCode === GitErrorCodes.NotAGitRepository) {
				this.state = RepositoryState.Disposed;
			}

			throw err;
		} finally {
			this._operations.end(operation);
			this._onDidRunOperation.fire({ operation, error });
		}
	}

	private async retryRun<T>(operation: Operation, runOperation: () => Promise<T> = () => Promise.resolve<any>(null)): Promise<T> {
		let attempt = 0;

		while (true) {
			try {
				attempt++;
				return await runOperation();
			} catch (err) {
				const shouldRetry = attempt <= 10 && (
					(err.gitErrorCode === GitErrorCodes.RepositoryIsLocked)
					|| ((operation === Operation.Pull || operation === Operation.Sync || operation === Operation.Fetch) && (err.gitErrorCode === GitErrorCodes.CantLockRef || err.gitErrorCode === GitErrorCodes.CantRebaseMultipleBranches))
				);

				if (shouldRetry) {
					// quatratic backoff
					await timeout(Math.pow(attempt, 2) * 50);
				} else {
					throw err;
				}
			}
		}
	}

	private static KnownHugeFolderNames = ['node_modules'];

	private async findKnownHugeFolderPathsToIgnore(): Promise<string[]> {
		const folderPaths: string[] = [];

		for (const folderName of Repository.KnownHugeFolderNames) {
			const folderPath = path.join(this.repository.root, folderName);

			if (await new Promise<boolean>(c => fs.exists(folderPath, c))) {
				folderPaths.push(folderPath);
			}
		}

		const ignored = await this.checkIgnore(folderPaths);

		return folderPaths.filter(p => !ignored.has(p));
	}

	@throttle
	private async updateModelState(): Promise<void> {
		const { status, didHitLimit } = await this.repository.getStatus();
		const config = workspace.getConfiguration('git');
		const shouldIgnore = config.get<boolean>('ignoreLimitWarning') === true;
		const useIcons = !config.get<boolean>('decorations.enabled', true);

		this.isRepositoryHuge = didHitLimit;

		if (didHitLimit && !shouldIgnore && !this.didWarnAboutLimit) {
			const knownHugeFolderPaths = await this.findKnownHugeFolderPathsToIgnore();
			const gitWarn = localize('huge', "The git repository at '{0}' has too many active changes, only a subset of Git features will be enabled.", this.repository.root);
			const neverAgain = { title: localize('neveragain', "Don't Show Again") };

			if (knownHugeFolderPaths.length > 0) {
				const folderPath = knownHugeFolderPaths[0];
				const folderName = path.basename(folderPath);

				const addKnown = localize('add known', "Would you like to add '{0}' to .gitignore?", folderName);
				const yes = { title: localize('yes', "Yes") };

				const result = await window.showWarningMessage(`${gitWarn} ${addKnown}`, yes, neverAgain);

				if (result === neverAgain) {
					config.update('ignoreLimitWarning', true, false);
					this.didWarnAboutLimit = true;
				} else if (result === yes) {
					this.ignore([Uri.file(folderPath)]);
				}
			} else {
				const result = await window.showWarningMessage(gitWarn, neverAgain);

				if (result === neverAgain) {
					config.update('ignoreLimitWarning', true, false);
				}

				this.didWarnAboutLimit = true;
			}
		}

		let HEAD: Branch | undefined;

		try {
			HEAD = await this.repository.getHEAD();

			if (HEAD.name) {
				try {
					HEAD = await this.repository.getBranch(HEAD.name);
				} catch (err) {
					// noop
				}
			}
		} catch (err) {
			// noop
		}

		const [refs, remotes, submodules, rebaseCommit] = await Promise.all([this.repository.getRefs(), this.repository.getRemotes(), this.repository.getSubmodules(), this.getRebaseCommit()]);

		this._HEAD = HEAD;
		this._refs = refs;
		this._remotes = remotes;
		this._submodules = submodules;
		this.rebaseCommit = rebaseCommit;

		const index: Resource[] = [];
		const workingTree: Resource[] = [];
		const merge: Resource[] = [];

		status.forEach(raw => {
			const uri = Uri.file(path.join(this.repository.root, raw.path));
			const renameUri = raw.rename ? Uri.file(path.join(this.repository.root, raw.rename)) : undefined;

			switch (raw.x + raw.y) {
				case '??': return workingTree.push(new Resource(ResourceGroupType.WorkingTree, uri, Status.UNTRACKED, useIcons));
				case '!!': return workingTree.push(new Resource(ResourceGroupType.WorkingTree, uri, Status.IGNORED, useIcons));
				case 'DD': return merge.push(new Resource(ResourceGroupType.Merge, uri, Status.BOTH_DELETED, useIcons));
				case 'AU': return merge.push(new Resource(ResourceGroupType.Merge, uri, Status.ADDED_BY_US, useIcons));
				case 'UD': return merge.push(new Resource(ResourceGroupType.Merge, uri, Status.DELETED_BY_THEM, useIcons));
				case 'UA': return merge.push(new Resource(ResourceGroupType.Merge, uri, Status.ADDED_BY_THEM, useIcons));
				case 'DU': return merge.push(new Resource(ResourceGroupType.Merge, uri, Status.DELETED_BY_US, useIcons));
				case 'AA': return merge.push(new Resource(ResourceGroupType.Merge, uri, Status.BOTH_ADDED, useIcons));
				case 'UU': return merge.push(new Resource(ResourceGroupType.Merge, uri, Status.BOTH_MODIFIED, useIcons));
			}

			switch (raw.x) {
				case 'M': index.push(new Resource(ResourceGroupType.Index, uri, Status.INDEX_MODIFIED, useIcons)); break;
				case 'A': index.push(new Resource(ResourceGroupType.Index, uri, Status.INDEX_ADDED, useIcons)); break;
				case 'D': index.push(new Resource(ResourceGroupType.Index, uri, Status.INDEX_DELETED, useIcons)); break;
				case 'R': index.push(new Resource(ResourceGroupType.Index, uri, Status.INDEX_RENAMED, useIcons, renameUri)); break;
				case 'C': index.push(new Resource(ResourceGroupType.Index, uri, Status.INDEX_COPIED, useIcons, renameUri)); break;
			}

			switch (raw.y) {
				case 'M': workingTree.push(new Resource(ResourceGroupType.WorkingTree, uri, Status.MODIFIED, useIcons, renameUri)); break;
				case 'D': workingTree.push(new Resource(ResourceGroupType.WorkingTree, uri, Status.DELETED, useIcons, renameUri)); break;
				case 'A': workingTree.push(new Resource(ResourceGroupType.WorkingTree, uri, Status.INTENT_TO_ADD, useIcons, renameUri)); break;
			}
			return undefined;
		});

		// set resource groups
		this.mergeGroup.resourceStates = merge;
		this.indexGroup.resourceStates = index;
		this.workingTreeGroup.resourceStates = workingTree;

		// set count badge
		const countBadge = workspace.getConfiguration('git').get<string>('countBadge');
		let count = merge.length + index.length + workingTree.length;

		switch (countBadge) {
			case 'off': count = 0; break;
			case 'tracked': count = count - workingTree.filter(r => r.type === Status.UNTRACKED || r.type === Status.IGNORED).length; break;
		}

		this._sourceControl.count = count;

		// Disable `Discard All Changes` for "fresh" repositories
		// https://github.com/Microsoft/vscode/issues/43066
		const isFreshRepository = !this._HEAD || !this._HEAD.commit;

		if (this.isFreshRepository !== isFreshRepository) {
			commands.executeCommand('setContext', 'gitFreshRepository', isFreshRepository);
			this.isFreshRepository = isFreshRepository;
		}

		this._onDidChangeStatus.fire();
	}

	private async getRebaseCommit(): Promise<Commit | undefined> {
		const rebaseHeadPath = path.join(this.repository.root, '.git', 'REBASE_HEAD');
		const rebaseApplyPath = path.join(this.repository.root, '.git', 'rebase-apply');
		const rebaseMergePath = path.join(this.repository.root, '.git', 'rebase-merge');

		try {
			const [rebaseApplyExists, rebaseMergePathExists, rebaseHead] = await Promise.all([
				new Promise<boolean>(c => fs.exists(rebaseApplyPath, c)),
				new Promise<boolean>(c => fs.exists(rebaseMergePath, c)),
				new Promise<string>((c, e) => fs.readFile(rebaseHeadPath, 'utf8', (err, result) => err ? e(err) : c(result)))
			]);
			if (!rebaseApplyExists && !rebaseMergePathExists) {
				return undefined;
			}
			return await this.getCommit(rebaseHead.trim());
		} catch (err) {
			return undefined;
		}
	}

	private async maybeAutoStash<T>(runOperation: () => Promise<T>): Promise<T> {
		const config = workspace.getConfiguration('git', Uri.file(this.root));
		const shouldAutoStash = config.get<boolean>('autoStash')
			&& this.workingTreeGroup.resourceStates.some(r => r.type !== Status.UNTRACKED && r.type !== Status.IGNORED);

		if (!shouldAutoStash) {
			return await runOperation();
		}

		await this.repository.createStash(undefined, true);
		const result = await runOperation();
		await this.repository.popStash();

		return result;
	}

	private onFSChange(_uri: Uri): void {
		const config = workspace.getConfiguration('git');
		const autorefresh = config.get<boolean>('autorefresh');

		if (!autorefresh) {
			return;
		}

		if (this.isRepositoryHuge) {
			return;
		}

		if (!this.operations.isIdle()) {
			return;
		}

		this.eventuallyUpdateWhenIdleAndWait();
	}

	@debounce(1000)
	private eventuallyUpdateWhenIdleAndWait(): void {
		this.updateWhenIdleAndWait();
	}

	@throttle
	private async updateWhenIdleAndWait(): Promise<void> {
		await this.whenIdleAndFocused();
		await this.status();
		await timeout(5000);
	}

	async whenIdleAndFocused(): Promise<void> {
		while (true) {
			if (!this.operations.isIdle()) {
				await eventToPromise(this.onDidRunOperation);
				continue;
			}

			if (!window.state.focused) {
				const onDidFocusWindow = filterEvent(window.onDidChangeWindowState, e => e.focused);
				await eventToPromise(onDidFocusWindow);
				continue;
			}

			return;
		}
	}

	get headLabel(): string {
		const HEAD = this.HEAD;

		if (!HEAD) {
			return '';
		}

		const tag = this.refs.filter(iref => iref.type === RefType.Tag && iref.commit === HEAD.commit)[0];
		const tagName = tag && tag.name;
		const head = HEAD.name || tagName || (HEAD.commit || '').substr(0, 8);

		return head
			+ (this.workingTreeGroup.resourceStates.length > 0 ? '*' : '')
			+ (this.indexGroup.resourceStates.length > 0 ? '+' : '')
			+ (this.mergeGroup.resourceStates.length > 0 ? '!' : '');
	}

	get syncLabel(): string {
		if (!this.HEAD
			|| !this.HEAD.name
			|| !this.HEAD.commit
			|| !this.HEAD.upstream
			|| !(this.HEAD.ahead || this.HEAD.behind)
		) {
			return '';
		}

		const remoteName = this.HEAD && this.HEAD.remote || this.HEAD.upstream.remote;
		const remote = this.remotes.find(r => r.name === remoteName);

		if (remote && remote.isReadOnly) {
			return `${this.HEAD.behind}↓`;
		}

		return `${this.HEAD.behind}↓ ${this.HEAD.ahead}↑`;
	}

	dispose(): void {
		this.disposables = dispose(this.disposables);
	}
}
