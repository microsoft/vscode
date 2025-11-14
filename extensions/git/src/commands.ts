/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as os from 'os';
import * as path from 'path';
import { Command, commands, Disposable, MessageOptions, Position, QuickPickItem, Range, SourceControlResourceState, TextDocumentShowOptions, TextEditor, Uri, ViewColumn, window, workspace, WorkspaceEdit, WorkspaceFolder, TimelineItem, env, Selection, TextDocumentContentProvider, InputBoxValidationSeverity, TabInputText, TabInputTextMerge, QuickPickItemKind, TextDocument, LogOutputChannel, l10n, Memento, UIKind, QuickInputButton, ThemeIcon, SourceControlHistoryItem, SourceControl, InputBoxValidationMessage, Tab, TabInputNotebook, QuickInputButtonLocation, languages, SourceControlArtifact } from 'vscode';
import TelemetryReporter from '@vscode/extension-telemetry';
import { uniqueNamesGenerator, adjectives, animals, colors, NumberDictionary } from '@joaomoreno/unique-names-generator';
import { ForcePushMode, GitErrorCodes, RefType, Status, CommitOptions, RemoteSourcePublisher, Remote, Branch, Ref } from './api/git';
import { Git, GitError, Stash, Worktree } from './git';
import { Model } from './model';
import { GitResourceGroup, Repository, Resource, ResourceGroupType } from './repository';
import { DiffEditorSelectionHunkToolbarContext, LineChange, applyLineChanges, getIndexDiffInformation, getModifiedRange, getWorkingTreeDiffInformation, intersectDiffWithRange, invertLineChange, toLineChanges, toLineRanges, compareLineChanges } from './staging';
import { fromGitUri, toGitUri, isGitUri, toMergeUris, toMultiFileDiffEditorUris } from './uri';
import { DiagnosticSeverityConfig, dispose, fromNow, getHistoryItemDisplayName, grep, isDefined, isDescendant, isLinuxSnap, isRemote, isWindows, pathEquals, relativePath, subject, toDiagnosticSeverity, truncate } from './util';
import { GitTimelineItem } from './timelineProvider';
import { ApiRepository } from './api/api1';
import { getRemoteSourceActions, pickRemoteSource } from './remoteSource';
import { RemoteSourceAction } from './typings/git-base';
import { CloneManager } from './cloneManager';

abstract class CheckoutCommandItem implements QuickPickItem {
	abstract get label(): string;
	get description(): string { return ''; }
	get alwaysShow(): boolean { return true; }
}

class CreateBranchItem extends CheckoutCommandItem {
	get label(): string { return l10n.t('{0} Create new branch...', '$(plus)'); }
}

class CreateBranchFromItem extends CheckoutCommandItem {
	get label(): string { return l10n.t('{0} Create new branch from...', '$(plus)'); }
}

class CheckoutDetachedItem extends CheckoutCommandItem {
	get label(): string { return l10n.t('{0} Checkout detached...', '$(debug-disconnect)'); }
}

class RefItemSeparator implements QuickPickItem {
	get kind(): QuickPickItemKind { return QuickPickItemKind.Separator; }

	get label(): string {
		switch (this.refType) {
			case RefType.Head:
				return l10n.t('branches');
			case RefType.RemoteHead:
				return l10n.t('remote branches');
			case RefType.Tag:
				return l10n.t('tags');
			default:
				return '';
		}
	}

	constructor(private readonly refType: RefType) { }
}

class WorktreeItem implements QuickPickItem {

	get label(): string {
		return `$(list-tree) ${this.worktree.name}`;
	}

	get description(): string {
		return this.worktree.path;
	}

	constructor(readonly worktree: Worktree) { }
}

class RefItem implements QuickPickItem {

	get label(): string {
		switch (this.ref.type) {
			case RefType.Head:
				return `$(git-branch) ${this.ref.name ?? this.shortCommit}`;
			case RefType.RemoteHead:
				return `$(cloud) ${this.ref.name ?? this.shortCommit}`;
			case RefType.Tag:
				return `$(tag) ${this.ref.name ?? this.shortCommit}`;
			default:
				return '';
		}
	}

	get description(): string {
		if (this.ref.commitDetails?.commitDate) {
			return fromNow(this.ref.commitDetails.commitDate, true, true);
		}

		switch (this.ref.type) {
			case RefType.Head:
				return this.shortCommit;
			case RefType.RemoteHead:
				return l10n.t('Remote branch at {0}', this.shortCommit);
			case RefType.Tag:
				return l10n.t('Tag at {0}', this.shortCommit);
			default:
				return '';
		}
	}

	get detail(): string | undefined {
		if (this.ref.commitDetails?.authorName && this.ref.commitDetails?.message) {
			return `${this.ref.commitDetails.authorName}$(circle-small-filled)${this.shortCommit}$(circle-small-filled)${this.ref.commitDetails.message}`;
		}

		return undefined;
	}

	get refId(): string {
		switch (this.ref.type) {
			case RefType.Head:
				return `refs/heads/${this.ref.name}`;
			case RefType.RemoteHead:
				return `refs/remotes/${this.ref.name}`;
			case RefType.Tag:
				return `refs/tags/${this.ref.name}`;
		}
	}
	get refName(): string | undefined { return this.ref.name; }
	get refRemote(): string | undefined { return this.ref.remote; }
	get shortCommit(): string { return (this.ref.commit || '').substring(0, this.shortCommitLength); }
	get commitMessage(): string | undefined { return this.ref.commitDetails?.message; }

	private _buttons?: QuickInputButton[];
	get buttons(): QuickInputButton[] | undefined { return this._buttons; }
	set buttons(newButtons: QuickInputButton[] | undefined) { this._buttons = newButtons; }

	constructor(protected readonly ref: Ref, private readonly shortCommitLength: number) { }
}

class BranchItem extends RefItem {
	override get description(): string {
		const description: string[] = [];

		if (typeof this.ref.behind === 'number' && typeof this.ref.ahead === 'number') {
			description.push(`${this.ref.behind}↓ ${this.ref.ahead}↑`);
		}
		if (this.ref.commitDetails?.commitDate) {
			description.push(fromNow(this.ref.commitDetails.commitDate, true, true));
		}

		return description.length > 0 ? description.join('$(circle-small-filled)') : this.shortCommit;
	}

	constructor(override readonly ref: Branch, shortCommitLength: number) {
		super(ref, shortCommitLength);
	}
}

class CheckoutItem extends BranchItem {
	async run(repository: Repository, opts?: { detached?: boolean }): Promise<void> {
		if (!this.ref.name) {
			return;
		}

		const config = workspace.getConfiguration('git', Uri.file(repository.root));
		const pullBeforeCheckout = config.get<boolean>('pullBeforeCheckout', false) === true;

		const treeish = opts?.detached ? this.ref.commit ?? this.ref.name : this.ref.name;
		await repository.checkout(treeish, { ...opts, pullBeforeCheckout });
	}
}

class CheckoutProtectedItem extends CheckoutItem {

	override get label(): string {
		return `$(lock) ${this.ref.name ?? this.shortCommit}`;
	}
}

class CheckoutRemoteHeadItem extends RefItem {

	async run(repository: Repository, opts?: { detached?: boolean }): Promise<void> {
		if (!this.ref.name) {
			return;
		}

		if (opts?.detached) {
			await repository.checkout(this.ref.commit ?? this.ref.name, opts);
			return;
		}

		const branches = await repository.findTrackingBranches(this.ref.name);

		if (branches.length > 0) {
			await repository.checkout(branches[0].name!, opts);
		} else {
			await repository.checkoutTracking(this.ref.name, opts);
		}
	}
}

class CheckoutTagItem extends RefItem {

	async run(repository: Repository, opts?: { detached?: boolean }): Promise<void> {
		if (!this.ref.name) {
			return;
		}

		await repository.checkout(this.ref.name, opts);
	}
}

class BranchDeleteItem extends BranchItem {

	async run(repository: Repository, force?: boolean): Promise<void> {
		if (this.ref.type === RefType.Head && this.refName) {
			await repository.deleteBranch(this.refName, force);
		} else if (this.ref.type === RefType.RemoteHead && this.refRemote && this.refName) {
			const refName = this.refName.substring(this.refRemote.length + 1);
			await repository.deleteRemoteRef(this.refRemote, refName, { force });
		}
	}
}

class TagDeleteItem extends RefItem {

	async run(repository: Repository): Promise<void> {
		if (this.ref.name) {
			await repository.deleteTag(this.ref.name);
		}
	}
}

class RemoteTagDeleteItem extends RefItem {

	override get description(): string {
		return l10n.t('Remote tag at {0}', this.shortCommit);
	}

	async run(repository: Repository, remote: string): Promise<void> {
		if (this.ref.name) {
			await repository.deleteRemoteRef(remote, this.ref.name);
		}
	}
}

class WorktreeDeleteItem extends WorktreeItem {
	async run(mainRepository: Repository): Promise<void> {
		if (!this.worktree.path) {
			return;
		}

		try {
			await mainRepository.deleteWorktree(this.worktree.path);
		} catch (err) {
			if (err.gitErrorCode === GitErrorCodes.WorktreeContainsChanges) {
				const forceDelete = l10n.t('Force Delete');
				const message = l10n.t('The worktree contains modified or untracked files. Do you want to force delete?');
				const choice = await window.showWarningMessage(message, { modal: true }, forceDelete);

				if (choice === forceDelete) {
					await mainRepository.deleteWorktree(this.worktree.path, { force: true });
				}
			}
		}
	}
}


class MergeItem extends BranchItem {

	async run(repository: Repository): Promise<void> {
		if (this.ref.name || this.ref.commit) {
			await repository.merge(this.ref.name ?? this.ref.commit!);
		}
	}
}

class RebaseItem extends BranchItem {

	async run(repository: Repository): Promise<void> {
		if (this.ref?.name) {
			await repository.rebase(this.ref.name);
		}
	}
}

class RebaseUpstreamItem extends RebaseItem {

	override get description(): string {
		return '(upstream)';
	}
}

class HEADItem implements QuickPickItem {

	constructor(private repository: Repository, private readonly shortCommitLength: number) { }

	get label(): string { return 'HEAD'; }
	get description(): string { return (this.repository.HEAD?.commit ?? '').substring(0, this.shortCommitLength); }
	get alwaysShow(): boolean { return true; }
	get refName(): string { return 'HEAD'; }
}

class AddRemoteItem implements QuickPickItem {

	constructor(private cc: CommandCenter) { }

	get label(): string { return '$(plus) ' + l10n.t('Add a new remote...'); }
	get description(): string { return ''; }

	get alwaysShow(): boolean { return true; }

	async run(repository: Repository): Promise<void> {
		await this.cc.addRemote(repository);
	}
}

class RemoteItem implements QuickPickItem {
	get label() { return `$(cloud) ${this.remote.name}`; }
	get description(): string | undefined { return this.remote.fetchUrl; }
	get remoteName(): string { return this.remote.name; }

	constructor(private readonly repository: Repository, private readonly remote: Remote) { }

	async run(): Promise<void> {
		await this.repository.fetch({ remote: this.remote.name });
	}
}

class FetchAllRemotesItem implements QuickPickItem {
	get label(): string { return l10n.t('{0} Fetch all remotes', '$(cloud-download)'); }

	constructor(private readonly repository: Repository) { }

	async run(): Promise<void> {
		await this.repository.fetch({ all: true });
	}
}

class RepositoryItem implements QuickPickItem {
	get label(): string { return `$(repo) ${getRepositoryLabel(this.path)}`; }

	get description(): string { return this.path; }

	constructor(public readonly path: string) { }
}

class StashItem implements QuickPickItem {
	get label(): string { return `#${this.stash.index}: ${this.stash.description}`; }

	get description(): string | undefined { return this.stash.branchName; }

	constructor(readonly stash: Stash) { }
}

interface ScmCommandOptions {
	repository?: boolean;
	repositoryFilter?: ('repository' | 'submodule' | 'worktree')[];
}

interface ScmCommand {
	commandId: string;
	key: string;
	method: Function;
	options: ScmCommandOptions;
}

const Commands: ScmCommand[] = [];

function command(commandId: string, options: ScmCommandOptions = {}): Function {
	return (value: unknown, context: ClassMethodDecoratorContext) => {
		if (typeof value !== 'function' || context.kind !== 'method') {
			throw new Error('not supported');
		}
		const key = context.name.toString();
		Commands.push({ commandId, key, method: value, options });
	};
}

// const ImageMimetypes = [
// 	'image/png',
// 	'image/gif',
// 	'image/jpeg',
// 	'image/webp',
// 	'image/tiff',
// 	'image/bmp'
// ];

async function categorizeResourceByResolution(resources: Resource[]): Promise<{ merge: Resource[]; resolved: Resource[]; unresolved: Resource[]; deletionConflicts: Resource[] }> {
	const selection = resources.filter(s => s instanceof Resource) as Resource[];
	const merge = selection.filter(s => s.resourceGroupType === ResourceGroupType.Merge);
	const isBothAddedOrModified = (s: Resource) => s.type === Status.BOTH_MODIFIED || s.type === Status.BOTH_ADDED;
	const isAnyDeleted = (s: Resource) => s.type === Status.DELETED_BY_THEM || s.type === Status.DELETED_BY_US;
	const possibleUnresolved = merge.filter(isBothAddedOrModified);
	const promises = possibleUnresolved.map(s => grep(s.resourceUri.fsPath, /^<{7}\s|^={7}$|^>{7}\s/));
	const unresolvedBothModified = await Promise.all<boolean>(promises);
	const resolved = possibleUnresolved.filter((_s, i) => !unresolvedBothModified[i]);
	const deletionConflicts = merge.filter(s => isAnyDeleted(s));
	const unresolved = [
		...merge.filter(s => !isBothAddedOrModified(s) && !isAnyDeleted(s)),
		...possibleUnresolved.filter((_s, i) => unresolvedBothModified[i])
	];

	return { merge, resolved, unresolved, deletionConflicts };
}

async function createCheckoutItems(repository: Repository, detached = false): Promise<QuickPickItem[]> {
	const config = workspace.getConfiguration('git');
	const checkoutTypeConfig = config.get<string | string[]>('checkoutType');
	const showRefDetails = config.get<boolean>('showReferenceDetails') === true;

	let checkoutTypes: string[];

	if (checkoutTypeConfig === 'all' || !checkoutTypeConfig || checkoutTypeConfig.length === 0) {
		checkoutTypes = ['local', 'remote', 'tags'];
	} else if (typeof checkoutTypeConfig === 'string') {
		checkoutTypes = [checkoutTypeConfig];
	} else {
		checkoutTypes = checkoutTypeConfig;
	}

	if (detached) {
		// Remove tags when in detached mode
		checkoutTypes = checkoutTypes.filter(t => t !== 'tags');
	}

	const refs = await repository.getRefs({ includeCommitDetails: showRefDetails });
	const refProcessors = checkoutTypes.map(type => getCheckoutRefProcessor(repository, type))
		.filter(p => !!p) as RefProcessor[];

	const buttons = await getRemoteRefItemButtons(repository);
	const itemsProcessor = new CheckoutItemsProcessor(repository, refProcessors, buttons, detached);

	return itemsProcessor.processRefs(refs);
}

type RemoteSourceActionButton = {
	iconPath: ThemeIcon;
	tooltip: string;
	actual: RemoteSourceAction;
};

async function getRemoteRefItemButtons(repository: Repository) {
	// Compute actions for all known remotes
	const remoteUrlsToActions = new Map<string, RemoteSourceActionButton[]>();

	const getButtons = async (remoteUrl: string) => (await getRemoteSourceActions(remoteUrl)).map((action) => ({ iconPath: new ThemeIcon(action.icon), tooltip: action.label, actual: action }));

	for (const remote of repository.remotes) {
		if (remote.fetchUrl) {
			const actions = remoteUrlsToActions.get(remote.fetchUrl) ?? [];
			actions.push(...await getButtons(remote.fetchUrl));
			remoteUrlsToActions.set(remote.fetchUrl, actions);
		}
		if (remote.pushUrl && remote.pushUrl !== remote.fetchUrl) {
			const actions = remoteUrlsToActions.get(remote.pushUrl) ?? [];
			actions.push(...await getButtons(remote.pushUrl));
			remoteUrlsToActions.set(remote.pushUrl, actions);
		}
	}

	return remoteUrlsToActions;
}

class RefProcessor {
	protected readonly refs: Ref[] = [];

	constructor(protected readonly type: RefType, protected readonly ctor: { new(ref: Ref, shortCommitLength: number): QuickPickItem } = RefItem) { }

	processRef(ref: Ref): boolean {
		if (!ref.name && !ref.commit) {
			return false;
		}
		if (ref.type !== this.type) {
			return false;
		}

		this.refs.push(ref);
		return true;
	}

	getItems(shortCommitLength: number): QuickPickItem[] {
		const items = this.refs.map(r => new this.ctor(r, shortCommitLength));
		return items.length === 0 ? items : [new RefItemSeparator(this.type), ...items];
	}
}

class RefItemsProcessor {
	protected readonly shortCommitLength: number;

	constructor(
		protected readonly repository: Repository,
		protected readonly processors: RefProcessor[],
		protected readonly options: {
			skipCurrentBranch?: boolean;
			skipCurrentBranchRemote?: boolean;
		} = {}
	) {
		const config = workspace.getConfiguration('git', Uri.file(repository.root));
		this.shortCommitLength = config.get<number>('commitShortHashLength', 7);
	}

	processRefs(refs: Ref[]): QuickPickItem[] {
		const refsToSkip = this.getRefsToSkip();

		for (const ref of refs) {
			if (ref.name && refsToSkip.includes(ref.name)) {
				continue;
			}
			for (const processor of this.processors) {
				if (processor.processRef(ref)) {
					break;
				}
			}
		}

		const result: QuickPickItem[] = [];
		for (const processor of this.processors) {
			result.push(...processor.getItems(this.shortCommitLength));
		}

		return result;
	}

	protected getRefsToSkip(): string[] {
		const refsToSkip = ['origin/HEAD'];

		if (this.options.skipCurrentBranch && this.repository.HEAD?.name) {
			refsToSkip.push(this.repository.HEAD.name);
		}

		if (this.options.skipCurrentBranchRemote && this.repository.HEAD?.upstream) {
			refsToSkip.push(`${this.repository.HEAD.upstream.remote}/${this.repository.HEAD.upstream.name}`);
		}

		return refsToSkip;
	}
}

class CheckoutRefProcessor extends RefProcessor {

	constructor(private readonly repository: Repository) {
		super(RefType.Head);
	}

	override getItems(shortCommitLength: number): QuickPickItem[] {
		const items = this.refs.map(ref => {
			return this.repository.isBranchProtected(ref) ?
				new CheckoutProtectedItem(ref, shortCommitLength) :
				new CheckoutItem(ref, shortCommitLength);
		});

		return items.length === 0 ? items : [new RefItemSeparator(this.type), ...items];
	}
}

class CheckoutItemsProcessor extends RefItemsProcessor {

	private defaultButtons: RemoteSourceActionButton[] | undefined;

	constructor(
		repository: Repository,
		processors: RefProcessor[],
		private readonly buttons: Map<string, RemoteSourceActionButton[]>,
		private readonly detached = false) {
		super(repository, processors);

		// Default button(s)
		const remote = repository.remotes.find(r => r.pushUrl === repository.HEAD?.remote || r.fetchUrl === repository.HEAD?.remote) ?? repository.remotes[0];
		const remoteUrl = remote?.pushUrl ?? remote?.fetchUrl;
		if (remoteUrl) {
			this.defaultButtons = buttons.get(remoteUrl);
		}
	}

	override processRefs(refs: Ref[]): QuickPickItem[] {
		for (const ref of refs) {
			if (!this.detached && ref.name === 'origin/HEAD') {
				continue;
			}

			for (const processor of this.processors) {
				if (processor.processRef(ref)) {
					break;
				}
			}
		}

		const result: QuickPickItem[] = [];
		for (const processor of this.processors) {
			for (const item of processor.getItems(this.shortCommitLength)) {
				if (!(item instanceof RefItem)) {
					result.push(item);
					continue;
				}

				// Button(s)
				if (item.refRemote) {
					const matchingRemote = this.repository.remotes.find((remote) => remote.name === item.refRemote);
					const buttons = [];
					if (matchingRemote?.pushUrl) {
						buttons.push(...this.buttons.get(matchingRemote.pushUrl) ?? []);
					}
					if (matchingRemote?.fetchUrl && matchingRemote.fetchUrl !== matchingRemote.pushUrl) {
						buttons.push(...this.buttons.get(matchingRemote.fetchUrl) ?? []);
					}
					if (buttons.length) {
						item.buttons = buttons;
					}
				} else {
					item.buttons = this.defaultButtons;
				}

				result.push(item);
			}
		}

		return result;
	}
}

function getCheckoutRefProcessor(repository: Repository, type: string): RefProcessor | undefined {
	switch (type) {
		case 'local':
			return new CheckoutRefProcessor(repository);
		case 'remote':
			return new RefProcessor(RefType.RemoteHead, CheckoutRemoteHeadItem);
		case 'tags':
			return new RefProcessor(RefType.Tag, CheckoutTagItem);
		default:
			return undefined;
	}
}

function getRepositoryLabel(repositoryRoot: string): string {
	const workspaceFolder = workspace.getWorkspaceFolder(Uri.file(repositoryRoot));
	return workspaceFolder?.uri.toString() === repositoryRoot ? workspaceFolder.name : path.basename(repositoryRoot);
}

function compareRepositoryLabel(repositoryRoot1: string, repositoryRoot2: string): number {
	return getRepositoryLabel(repositoryRoot1).localeCompare(getRepositoryLabel(repositoryRoot2));
}

function sanitizeBranchName(name: string, whitespaceChar: string): string {
	return name ? name.trim().replace(/^-+/, '').replace(/^\.|\/\.|\.\.|~|\^|:|\/$|\.lock$|\.lock\/|\\|\*|\s|^\s*$|\.$|\[|\]$/g, whitespaceChar) : name;
}

function sanitizeRemoteName(name: string) {
	name = name.trim();
	return name && name.replace(/^\.|\/\.|\.\.|~|\^|:|\/$|\.lock$|\.lock\/|\\|\*|\s|^\s*$|\.$|\[|\]$/g, '-');
}

enum PushType {
	Push,
	PushTo,
	PushFollowTags,
	PushTags
}

interface PushOptions {
	pushType: PushType;
	forcePush?: boolean;
	silent?: boolean;

	pushTo?: {
		remote?: string;
		refspec?: string;
		setUpstream?: boolean;
	};
}

class CommandErrorOutputTextDocumentContentProvider implements TextDocumentContentProvider {

	private items = new Map<string, string>();

	set(uri: Uri, contents: string): void {
		this.items.set(uri.path, contents);
	}

	delete(uri: Uri): void {
		this.items.delete(uri.path);
	}

	provideTextDocumentContent(uri: Uri): string | undefined {
		return this.items.get(uri.path);
	}
}

async function evaluateDiagnosticsCommitHook(repository: Repository, options: CommitOptions, logger: LogOutputChannel): Promise<boolean> {
	const config = workspace.getConfiguration('git', Uri.file(repository.root));
	const enabled = config.get<boolean>('diagnosticsCommitHook.enabled', false) === true;
	const sourceSeverity = config.get<Record<string, DiagnosticSeverityConfig>>('diagnosticsCommitHook.sources', { '*': 'error' });
	logger.trace(`[CommandCenter][evaluateDiagnosticsCommitHook] Diagnostics Commit Hook: enabled=${enabled}, sources=${JSON.stringify(sourceSeverity)}`);

	if (!enabled) {
		return true;
	}

	const resources: Uri[] = [];
	if (repository.indexGroup.resourceStates.length > 0) {
		// Staged files
		resources.push(...repository.indexGroup.resourceStates.map(r => r.resourceUri));
	} else if (options.all === 'tracked') {
		// Tracked files
		resources.push(...repository.workingTreeGroup.resourceStates
			.filter(r => r.type !== Status.UNTRACKED && r.type !== Status.IGNORED)
			.map(r => r.resourceUri));
	} else {
		// All files
		resources.push(...repository.workingTreeGroup.resourceStates.map(r => r.resourceUri));
		resources.push(...repository.untrackedGroup.resourceStates.map(r => r.resourceUri));
	}

	const diagnostics: Map<Uri, number> = new Map();

	for (const resource of resources) {
		const unresolvedDiagnostics = languages.getDiagnostics(resource)
			.filter(d => {
				logger.trace(`[CommandCenter][evaluateDiagnosticsCommitHook] Evaluating diagnostic for ${resource.fsPath}: source='${d.source}', severity='${d.severity}'`);

				// No source or ignored source
				if (!d.source || (Object.keys(sourceSeverity).includes(d.source) && sourceSeverity[d.source] === 'none')) {
					logger.trace(`[CommandCenter][evaluateDiagnosticsCommitHook] Ignoring diagnostic for ${resource.fsPath}: source='${d.source}', severity='${d.severity}'`);
					return false;
				}

				// Source severity
				if (Object.keys(sourceSeverity).includes(d.source) && d.severity <= toDiagnosticSeverity(sourceSeverity[d.source])) {
					logger.trace(`[CommandCenter][evaluateDiagnosticsCommitHook] Found unresolved diagnostic for ${resource.fsPath}: source='${d.source}', severity='${d.severity}'`);
					return true;
				}

				// Wildcard severity
				if (Object.keys(sourceSeverity).includes('*') && d.severity <= toDiagnosticSeverity(sourceSeverity['*'])) {
					logger.trace(`[CommandCenter][evaluateDiagnosticsCommitHook] Found unresolved diagnostic for ${resource.fsPath}: source='${d.source}', severity='${d.severity}'`);
					return true;
				}

				logger.trace(`[CommandCenter][evaluateDiagnosticsCommitHook] Ignoring diagnostic for ${resource.fsPath}: source='${d.source}', severity='${d.severity}'`);
				return false;
			});

		if (unresolvedDiagnostics.length > 0) {
			diagnostics.set(resource, unresolvedDiagnostics.length);
		}
	}

	if (diagnostics.size === 0) {
		return true;
	}

	// Show dialog
	const commit = l10n.t('Commit Anyway');
	const view = l10n.t('View Problems');

	const message = diagnostics.size === 1
		? l10n.t('The following file has unresolved diagnostics: \'{0}\'.\n\nHow would you like to proceed?', path.basename(diagnostics.keys().next().value!.fsPath))
		: l10n.t('There are {0} files that have unresolved diagnostics.\n\nHow would you like to proceed?', diagnostics.size);

	const choice = await window.showWarningMessage(message, { modal: true }, commit, view);

	// Commit Anyway
	if (choice === commit) {
		return true;
	}

	// View Problems
	if (choice === view) {
		commands.executeCommand('workbench.panel.markers.view.focus');
	}

	return false;
}

export class CommandCenter {

	private disposables: Disposable[];
	private commandErrors = new CommandErrorOutputTextDocumentContentProvider();

	private static readonly WORKTREE_ROOT_KEY = 'worktreeRoot';

	constructor(
		private git: Git,
		private model: Model,
		private globalState: Memento,
		private logger: LogOutputChannel,
		private telemetryReporter: TelemetryReporter,
		private cloneManager: CloneManager
	) {
		this.disposables = Commands.map(({ commandId, key, method, options }) => {
			const command = this.createCommand(commandId, key, method, options);
			return commands.registerCommand(commandId, command);
		});

		this.disposables.push(workspace.registerTextDocumentContentProvider('git-output', this.commandErrors));
	}

	@command('git.showOutput')
	showOutput(): void {
		this.logger.show();
	}

	@command('git.refresh', { repository: true })
	async refresh(repository: Repository): Promise<void> {
		await repository.refresh();
	}

	@command('git.openResource')
	async openResource(resource: Resource): Promise<void> {
		const repository = this.model.getRepository(resource.resourceUri);

		if (!repository) {
			return;
		}

		await resource.open();
	}

	@command('git.openAllChanges', { repository: true })
	async openChanges(repository: Repository): Promise<void> {
		for (const resource of [...repository.workingTreeGroup.resourceStates, ...repository.untrackedGroup.resourceStates]) {
			if (
				resource.type === Status.DELETED || resource.type === Status.DELETED_BY_THEM ||
				resource.type === Status.DELETED_BY_US || resource.type === Status.BOTH_DELETED
			) {
				continue;
			}

			void commands.executeCommand(
				'vscode.open',
				resource.resourceUri,
				{ background: true, preview: false, }
			);
		}
	}

	@command('git.openMergeEditor')
	async openMergeEditor(uri: unknown) {
		if (uri === undefined) {
			// fallback to active editor...
			if (window.tabGroups.activeTabGroup.activeTab?.input instanceof TabInputText) {
				uri = window.tabGroups.activeTabGroup.activeTab.input.uri;
			}
		}
		if (!(uri instanceof Uri)) {
			return;
		}
		const repo = this.model.getRepository(uri);
		if (!repo) {
			return;
		}

		const isRebasing = Boolean(repo.rebaseCommit);

		type InputData = { uri: Uri; title?: string; detail?: string; description?: string };
		const mergeUris = toMergeUris(uri);

		let isStashConflict = false;
		try {
			// Look at the conflict markers to check if this is a stash conflict
			const document = await workspace.openTextDocument(uri);
			const firstConflictInfo = findFirstConflictMarker(document);
			isStashConflict = firstConflictInfo?.incomingChangeLabel === 'Stashed changes';
		} catch (error) {
			console.error(error);
		}

		const current: InputData = { uri: mergeUris.ours, title: l10n.t('Current') };
		const incoming: InputData = { uri: mergeUris.theirs, title: l10n.t('Incoming') };

		if (isStashConflict) {
			incoming.title = l10n.t('Stashed Changes');
		}

		try {
			const [head, rebaseOrMergeHead, oursDiff, theirsDiff] = await Promise.all([
				repo.getCommit('HEAD'),
				isRebasing ? repo.getCommit('REBASE_HEAD') : repo.getCommit('MERGE_HEAD'),
				await repo.diffBetween(isRebasing ? 'REBASE_HEAD' : 'MERGE_HEAD', 'HEAD'),
				await repo.diffBetween('HEAD', isRebasing ? 'REBASE_HEAD' : 'MERGE_HEAD')
			]);

			const oursDiffFile = oursDiff?.find(diff => diff.uri.fsPath === uri.fsPath);
			const theirsDiffFile = theirsDiff?.find(diff => diff.uri.fsPath === uri.fsPath);

			// ours (current branch and commit)
			current.detail = head.refNames.map(s => s.replace(/^HEAD ->/, '')).join(', ');
			current.description = '$(git-commit) ' + head.hash.substring(0, 7);
			if (theirsDiffFile) {
				// use the original uri in case the file was renamed by theirs
				current.uri = toGitUri(theirsDiffFile.originalUri, head.hash);
			} else {
				current.uri = toGitUri(uri, head.hash);
			}

			// theirs
			incoming.detail = rebaseOrMergeHead.refNames.join(', ');
			incoming.description = '$(git-commit) ' + rebaseOrMergeHead.hash.substring(0, 7);
			if (oursDiffFile) {
				// use the original uri in case the file was renamed by ours
				incoming.uri = toGitUri(oursDiffFile.originalUri, rebaseOrMergeHead.hash);
			} else {
				incoming.uri = toGitUri(uri, rebaseOrMergeHead.hash);
			}

		} catch (error) {
			// not so bad, can continue with just uris
			console.error('FAILED to read HEAD, MERGE_HEAD commits');
			console.error(error);
		}

		const options = {
			base: mergeUris.base,
			input1: isRebasing ? current : incoming,
			input2: isRebasing ? incoming : current,
			output: uri
		};

		await commands.executeCommand(
			'_open.mergeEditor',
			options
		);

		function findFirstConflictMarker(doc: TextDocument): { currentChangeLabel: string; incomingChangeLabel: string } | undefined {
			const conflictMarkerStart = '<<<<<<<';
			const conflictMarkerEnd = '>>>>>>>';
			let inConflict = false;
			let currentChangeLabel: string = '';
			let incomingChangeLabel: string = '';
			let hasConflict = false;

			for (let lineIdx = 0; lineIdx < doc.lineCount; lineIdx++) {
				const lineStr = doc.lineAt(lineIdx).text;
				if (!inConflict) {
					if (lineStr.startsWith(conflictMarkerStart)) {
						currentChangeLabel = lineStr.substring(conflictMarkerStart.length).trim();
						inConflict = true;
						hasConflict = true;
					}
				} else {
					if (lineStr.startsWith(conflictMarkerEnd)) {
						incomingChangeLabel = lineStr.substring(conflictMarkerStart.length).trim();
						inConflict = false;
						break;
					}
				}
			}
			if (hasConflict) {
				return {
					currentChangeLabel,
					incomingChangeLabel
				};
			}
			return undefined;
		}
	}

	private getRepositoriesWithRemote(repositories: Repository[]) {
		return repositories.reduce<(QuickPickItem & { repository: Repository })[]>((items, repository) => {
			const remote = repository.remotes.find((r) => r.name === repository.HEAD?.upstream?.remote);
			if (remote?.pushUrl) {
				items.push({ repository: repository, label: remote.pushUrl });
			}
			return items;
		}, []);
	}

	@command('git.continueInLocalClone')
	async continueInLocalClone(): Promise<Uri | void> {
		if (this.model.repositories.length === 0) { return; }

		// Pick a single repository to continue working on in a local clone if there's more than one
		let items = this.getRepositoriesWithRemote(this.model.repositories);

		// We have a repository but there is no remote URL (e.g. git init)
		if (items.length === 0) {
			const pick = this.model.repositories.length === 1
				? { repository: this.model.repositories[0] }
				: await window.showQuickPick(this.model.repositories.map((i) => ({ repository: i, label: i.root })), { canPickMany: false, placeHolder: l10n.t('Choose which repository to publish') });
			if (!pick) { return; }

			await this.publish(pick.repository);

			items = this.getRepositoriesWithRemote([pick.repository]);
			if (items.length === 0) {
				return;
			}
		}

		let selection = items[0];
		if (items.length > 1) {
			const pick = await window.showQuickPick(items, { canPickMany: false, placeHolder: l10n.t('Choose which repository to clone') });
			if (pick === undefined) { return; }
			selection = pick;
		}

		const uri = selection.label;
		const ref = selection.repository.HEAD?.upstream?.name;

		if (uri !== undefined) {
			let target = `${env.uriScheme}://vscode.git/clone?url=${encodeURIComponent(uri)}`;
			const isWeb = env.uiKind === UIKind.Web;
			const isRemote = env.remoteName !== undefined;

			if (isWeb || isRemote) {
				if (ref !== undefined) {
					target += `&ref=${encodeURIComponent(ref)}`;
				}

				if (isWeb) {
					// Launch desktop client if currently in web
					return Uri.parse(target);
				}

				if (isRemote) {
					// If already in desktop client but in a remote window, we need to force a new window
					// so that the git extension can access the local filesystem for cloning
					target += `&windowId=_blank`;
					return Uri.parse(target);
				}
			}

			// Otherwise, directly clone
			void this.clone(uri, undefined, { ref: ref });
		}
	}

	@command('git.clone')
	async clone(url?: string, parentPath?: string, options?: { ref?: string }): Promise<void> {
		await this.cloneManager.clone(url, { parentPath, ...options });
	}

	@command('git.cloneRecursive')
	async cloneRecursive(url?: string, parentPath?: string): Promise<void> {
		await this.cloneManager.clone(url, { parentPath, recursive: true });
	}

	@command('git.init')
	async init(skipFolderPrompt = false): Promise<void> {
		let repositoryPath: string | undefined = undefined;
		let askToOpen = true;

		if (workspace.workspaceFolders) {
			if (skipFolderPrompt && workspace.workspaceFolders.length === 1) {
				repositoryPath = workspace.workspaceFolders[0].uri.fsPath;
				askToOpen = false;
			} else {
				const placeHolder = l10n.t('Pick workspace folder to initialize git repo in');
				const pick = { label: l10n.t('Choose Folder...') };
				const items: { label: string; folder?: WorkspaceFolder }[] = [
					...workspace.workspaceFolders.map(folder => ({ label: folder.name, description: folder.uri.fsPath, folder })),
					pick
				];
				const item = await window.showQuickPick(items, { placeHolder, ignoreFocusOut: true });

				if (!item) {
					return;
				} else if (item.folder) {
					repositoryPath = item.folder.uri.fsPath;
					askToOpen = false;
				}
			}
		}

		if (!repositoryPath) {
			const homeUri = Uri.file(os.homedir());
			const defaultUri = workspace.workspaceFolders && workspace.workspaceFolders.length > 0
				? Uri.file(workspace.workspaceFolders[0].uri.fsPath)
				: homeUri;

			const result = await window.showOpenDialog({
				canSelectFiles: false,
				canSelectFolders: true,
				canSelectMany: false,
				defaultUri,
				openLabel: l10n.t('Initialize Repository')
			});

			if (!result || result.length === 0) {
				return;
			}

			const uri = result[0];

			if (homeUri.toString().startsWith(uri.toString())) {
				const yes = l10n.t('Initialize Repository');
				const answer = await window.showWarningMessage(l10n.t('This will create a Git repository in "{0}". Are you sure you want to continue?', uri.fsPath), yes);

				if (answer !== yes) {
					return;
				}
			}

			repositoryPath = uri.fsPath;

			if (workspace.workspaceFolders && workspace.workspaceFolders.some(w => w.uri.toString() === uri.toString())) {
				askToOpen = false;
			}
		}

		const config = workspace.getConfiguration('git');
		const defaultBranchName = config.get<string>('defaultBranchName', 'main');
		const branchWhitespaceChar = config.get<string>('branchWhitespaceChar', '-');

		await this.git.init(repositoryPath, { defaultBranch: sanitizeBranchName(defaultBranchName, branchWhitespaceChar) });

		let message = l10n.t('Would you like to open the initialized repository?');
		const open = l10n.t('Open');
		const openNewWindow = l10n.t('Open in New Window');
		const choices = [open, openNewWindow];

		if (!askToOpen) {
			await this.model.openRepository(repositoryPath);
			return;
		}

		const addToWorkspace = l10n.t('Add to Workspace');
		if (workspace.workspaceFolders) {
			message = l10n.t('Would you like to open the initialized repository, or add it to the current workspace?');
			choices.push(addToWorkspace);
		}

		const result = await window.showInformationMessage(message, ...choices);
		const uri = Uri.file(repositoryPath);

		if (result === open) {
			commands.executeCommand('vscode.openFolder', uri);
		} else if (result === addToWorkspace) {
			workspace.updateWorkspaceFolders(workspace.workspaceFolders!.length, 0, { uri });
		} else if (result === openNewWindow) {
			commands.executeCommand('vscode.openFolder', uri, true);
		} else {
			await this.model.openRepository(repositoryPath);
		}
	}

	@command('git.openRepository', { repository: false })
	async openRepository(path?: string): Promise<void> {
		if (!path) {
			const result = await window.showOpenDialog({
				canSelectFiles: false,
				canSelectFolders: true,
				canSelectMany: false,
				defaultUri: Uri.file(os.homedir()),
				openLabel: l10n.t('Open Repository')
			});

			if (!result || result.length === 0) {
				return;
			}

			path = result[0].fsPath;
		}

		await this.model.openRepository(path, true);
	}

	@command('git.reopenClosedRepositories', { repository: false })
	async reopenClosedRepositories(): Promise<void> {
		if (this.model.closedRepositories.length === 0) {
			return;
		}

		const closedRepositories: string[] = [];

		const title = l10n.t('Reopen Closed Repositories');
		const placeHolder = l10n.t('Pick a repository to reopen');

		const allRepositoriesLabel = l10n.t('All Repositories');
		const allRepositoriesQuickPickItem: QuickPickItem = { label: allRepositoriesLabel };
		const repositoriesQuickPickItems: QuickPickItem[] = this.model.closedRepositories
			.sort(compareRepositoryLabel).map(r => new RepositoryItem(r));

		const items = this.model.closedRepositories.length === 1 ? [...repositoriesQuickPickItems] :
			[...repositoriesQuickPickItems, { label: '', kind: QuickPickItemKind.Separator }, allRepositoriesQuickPickItem];

		const repositoryItem = await window.showQuickPick(items, { title, placeHolder });
		if (!repositoryItem) {
			return;
		}

		if (repositoryItem === allRepositoriesQuickPickItem) {
			// All Repositories
			closedRepositories.push(...this.model.closedRepositories.values());
		} else {
			// One Repository
			closedRepositories.push((repositoryItem as RepositoryItem).path);
		}

		for (const repository of closedRepositories) {
			await this.model.openRepository(repository, true);
		}
	}

	@command('git.close', { repository: true })
	async close(repository: Repository, ...args: SourceControl[]): Promise<void> {
		const otherRepositories = args
			.map(sourceControl => this.model.getRepository(sourceControl))
			.filter(isDefined);

		for (const r of [repository, ...otherRepositories]) {
			this.model.close(r);
		}
	}

	@command('git.closeOtherRepositories', { repository: true })
	async closeOtherRepositories(repository: Repository, ...args: SourceControl[]): Promise<void> {
		const otherRepositories = args
			.map(sourceControl => this.model.getRepository(sourceControl))
			.filter(isDefined);

		const selectedRepositories = [repository, ...otherRepositories];
		for (const r of this.model.repositories) {
			if (selectedRepositories.includes(r)) {
				continue;
			}
			this.model.close(r);
		}
	}

	@command('git.openFile')
	async openFile(arg?: Resource | Uri, ...resourceStates: SourceControlResourceState[]): Promise<void> {
		const preserveFocus = arg instanceof Resource;

		let uris: Uri[] | undefined;

		if (arg instanceof Uri) {
			if (isGitUri(arg)) {
				uris = [Uri.file(fromGitUri(arg).path)];
			} else if (arg.scheme === 'file') {
				uris = [arg];
			}
		} else {
			let resource = arg;

			if (!(resource instanceof Resource)) {
				// can happen when called from a keybinding
				resource = this.getSCMResource();
			}

			if (resource) {
				uris = ([resource, ...resourceStates] as Resource[])
					.filter(r => r.type !== Status.DELETED && r.type !== Status.INDEX_DELETED)
					.map(r => r.resourceUri);
			} else if (window.activeTextEditor) {
				uris = [window.activeTextEditor.document.uri];
			}
		}

		if (!uris) {
			return;
		}

		const activeTextEditor = window.activeTextEditor;
		// Must extract these now because opening a new document will change the activeTextEditor reference
		const previousVisibleRanges = activeTextEditor?.visibleRanges;
		const previousURI = activeTextEditor?.document.uri;
		const previousSelection = activeTextEditor?.selection;

		for (const uri of uris) {
			const opts: TextDocumentShowOptions = {
				preserveFocus,
				preview: false,
				viewColumn: ViewColumn.Active
			};

			await commands.executeCommand('vscode.open', uri, {
				...opts,
				override: arg instanceof Resource && arg.type === Status.BOTH_MODIFIED ? false : undefined
			});

			const document = window.activeTextEditor?.document;

			// If the document doesn't match what we opened then don't attempt to select the range
			// Additionally if there was no previous document we don't have information to select a range
			if (document?.uri.toString() !== uri.toString() || !activeTextEditor || !previousURI || !previousSelection) {
				continue;
			}

			// Check if active text editor has same path as other editor. we cannot compare via
			// URI.toString() here because the schemas can be different. Instead we just go by path.
			if (previousURI.path === uri.path && document) {
				// preserve not only selection but also visible range
				opts.selection = previousSelection;
				const editor = await window.showTextDocument(document, opts);
				// This should always be defined but just in case
				if (previousVisibleRanges && previousVisibleRanges.length > 0) {
					let rangeToReveal = previousVisibleRanges[0];
					if (previousSelection && previousVisibleRanges.length > 1) {
						// In case of multiple visible ranges, find the one that intersects with the selection
						rangeToReveal = previousVisibleRanges.find(r => r.intersection(previousSelection)) ?? rangeToReveal;
					}
					editor.revealRange(rangeToReveal);
				}
			}
		}
	}

	@command('git.openFile2')
	async openFile2(arg?: Resource | Uri, ...resourceStates: SourceControlResourceState[]): Promise<void> {
		this.openFile(arg, ...resourceStates);
	}

	@command('git.openHEADFile')
	async openHEADFile(arg?: Resource | Uri): Promise<void> {
		let resource: Resource | undefined = undefined;
		const preview = !(arg instanceof Resource);

		if (arg instanceof Resource) {
			resource = arg;
		} else if (arg instanceof Uri) {
			resource = this.getSCMResource(arg);
		} else {
			resource = this.getSCMResource();
		}

		if (!resource) {
			return;
		}

		const HEAD = resource.leftUri;
		const basename = path.basename(resource.resourceUri.fsPath);
		const title = `${basename} (HEAD)`;

		if (!HEAD) {
			window.showWarningMessage(l10n.t('HEAD version of "{0}" is not available.', path.basename(resource.resourceUri.fsPath)));
			return;
		}

		const opts: TextDocumentShowOptions = {
			preview
		};

		return await commands.executeCommand<void>('vscode.open', HEAD, opts, title);
	}

	@command('git.openChange')
	async openChange(arg?: Resource | Uri, ...resourceStates: SourceControlResourceState[]): Promise<void> {
		let resources: Resource[] | undefined = undefined;

		if (arg instanceof Uri) {
			const resource = this.getSCMResource(arg);
			if (resource !== undefined) {
				resources = [resource];
			}
		} else {
			let resource: Resource | undefined = undefined;

			if (arg instanceof Resource) {
				resource = arg;
			} else {
				resource = this.getSCMResource();
			}

			if (resource) {
				resources = [...resourceStates as Resource[], resource];
			}
		}

		if (!resources) {
			return;
		}

		for (const resource of resources) {
			await resource.openChange();
		}
	}

	@command('git.compareWithWorkspace')
	async compareWithWorkspace(resource?: Resource): Promise<void> {
		if (!resource) {
			return;
		}

		await resource.compareWithWorkspace();
	}

	@command('git.rename', { repository: true })
	async rename(repository: Repository, fromUri: Uri | undefined): Promise<void> {
		fromUri = fromUri ?? window.activeTextEditor?.document.uri;

		if (!fromUri) {
			return;
		}

		const from = relativePath(repository.root, fromUri.fsPath);
		let to = await window.showInputBox({
			value: from,
			valueSelection: [from.length - path.basename(from).length, from.length]
		});

		to = to?.trim();

		if (!to) {
			return;
		}

		await repository.move(from, to);

		// Close active editor and open the renamed file
		await commands.executeCommand('workbench.action.closeActiveEditor');
		await commands.executeCommand('vscode.open', Uri.file(path.join(repository.root, to)), { viewColumn: ViewColumn.Active });
	}

	@command('git.stage')
	async stage(...resourceStates: SourceControlResourceState[]): Promise<void> {
		this.logger.debug(`[CommandCenter][stage] git.stage ${resourceStates.length} `);

		resourceStates = resourceStates.filter(s => !!s);

		if (resourceStates.length === 0 || (resourceStates[0] && !(resourceStates[0].resourceUri instanceof Uri))) {
			const resource = this.getSCMResource();

			this.logger.debug(`[CommandCenter][stage] git.stage.getSCMResource ${resource ? resource.resourceUri.toString() : null} `);

			if (!resource) {
				return;
			}

			resourceStates = [resource];
		}

		const selection = resourceStates.filter(s => s instanceof Resource) as Resource[];
		const { resolved, unresolved, deletionConflicts } = await categorizeResourceByResolution(selection);

		if (unresolved.length > 0) {
			const message = unresolved.length > 1
				? l10n.t('Are you sure you want to stage {0} files with merge conflicts?', unresolved.length)
				: l10n.t('Are you sure you want to stage {0} with merge conflicts?', path.basename(unresolved[0].resourceUri.fsPath));

			const yes = l10n.t('Yes');
			const pick = await window.showWarningMessage(message, { modal: true }, yes);

			if (pick !== yes) {
				return;
			}
		}

		try {
			await this.runByRepository(deletionConflicts.map(r => r.resourceUri), async (repository, resources) => {
				for (const resource of resources) {
					await this._stageDeletionConflict(repository, resource);
				}
			});
		} catch (err) {
			if (/Cancelled/.test(err.message)) {
				return;
			}

			throw err;
		}

		const workingTree = selection.filter(s => s.resourceGroupType === ResourceGroupType.WorkingTree);
		const untracked = selection.filter(s => s.resourceGroupType === ResourceGroupType.Untracked);
		const scmResources = [...workingTree, ...untracked, ...resolved, ...unresolved];

		this.logger.debug(`[CommandCenter][stage] git.stage.scmResources ${scmResources.length} `);
		if (!scmResources.length) {
			return;
		}

		const resources = scmResources.map(r => r.resourceUri);
		await this.runByRepository(resources, async (repository, resources) => repository.add(resources));
	}

	@command('git.stageAll', { repository: true })
	async stageAll(repository: Repository): Promise<void> {
		const resources = [...repository.workingTreeGroup.resourceStates, ...repository.untrackedGroup.resourceStates];
		const uris = resources.map(r => r.resourceUri);

		if (uris.length > 0) {
			const config = workspace.getConfiguration('git', Uri.file(repository.root));
			const untrackedChanges = config.get<'mixed' | 'separate' | 'hidden'>('untrackedChanges');
			await repository.add(uris, untrackedChanges === 'mixed' ? undefined : { update: true });
		}
	}

	private async _stageDeletionConflict(repository: Repository, uri: Uri): Promise<void> {
		const uriString = uri.toString();
		const resource = repository.mergeGroup.resourceStates.filter(r => r.resourceUri.toString() === uriString)[0];

		if (!resource) {
			return;
		}

		if (resource.type === Status.DELETED_BY_THEM) {
			const keepIt = l10n.t('Keep Our Version');
			const deleteIt = l10n.t('Delete File');
			const result = await window.showInformationMessage(l10n.t('File "{0}" was deleted by them and modified by us.\n\nWhat would you like to do?', path.basename(uri.fsPath)), { modal: true }, keepIt, deleteIt);

			if (result === keepIt) {
				await repository.add([uri]);
			} else if (result === deleteIt) {
				await repository.rm([uri]);
			} else {
				throw new Error('Cancelled');
			}
		} else if (resource.type === Status.DELETED_BY_US) {
			const keepIt = l10n.t('Keep Their Version');
			const deleteIt = l10n.t('Delete File');
			const result = await window.showInformationMessage(l10n.t('File "{0}" was deleted by us and modified by them.\n\nWhat would you like to do?', path.basename(uri.fsPath)), { modal: true }, keepIt, deleteIt);

			if (result === keepIt) {
				await repository.add([uri]);
			} else if (result === deleteIt) {
				await repository.rm([uri]);
			} else {
				throw new Error('Cancelled');
			}
		}
	}

	@command('git.stageAllTracked', { repository: true })
	async stageAllTracked(repository: Repository): Promise<void> {
		const resources = repository.workingTreeGroup.resourceStates
			.filter(r => r.type !== Status.UNTRACKED && r.type !== Status.IGNORED);
		const uris = resources.map(r => r.resourceUri);

		await repository.add(uris);
	}

	@command('git.stageAllUntracked', { repository: true })
	async stageAllUntracked(repository: Repository): Promise<void> {
		const resources = [...repository.workingTreeGroup.resourceStates, ...repository.untrackedGroup.resourceStates]
			.filter(r => r.type === Status.UNTRACKED || r.type === Status.IGNORED);
		const uris = resources.map(r => r.resourceUri);

		await repository.add(uris);
	}

	@command('git.stageAllMerge', { repository: true })
	async stageAllMerge(repository: Repository): Promise<void> {
		const resources = repository.mergeGroup.resourceStates.filter(s => s instanceof Resource) as Resource[];
		const { merge, unresolved, deletionConflicts } = await categorizeResourceByResolution(resources);

		try {
			for (const deletionConflict of deletionConflicts) {
				await this._stageDeletionConflict(repository, deletionConflict.resourceUri);
			}
		} catch (err) {
			if (/Cancelled/.test(err.message)) {
				return;
			}

			throw err;
		}

		if (unresolved.length > 0) {
			const message = unresolved.length > 1
				? l10n.t('Are you sure you want to stage {0} files with merge conflicts?', merge.length)
				: l10n.t('Are you sure you want to stage {0} with merge conflicts?', path.basename(merge[0].resourceUri.fsPath));

			const yes = l10n.t('Yes');
			const pick = await window.showWarningMessage(message, { modal: true }, yes);

			if (pick !== yes) {
				return;
			}
		}

		const uris = resources.map(r => r.resourceUri);

		if (uris.length > 0) {
			await repository.add(uris);
		}
	}

	@command('git.stageChange')
	async stageChange(uri: Uri, changes: LineChange[], index: number): Promise<void> {
		if (!uri) {
			return;
		}

		const textEditor = window.visibleTextEditors.filter(e => e.document.uri.toString() === uri.toString())[0];

		if (!textEditor) {
			return;
		}

		await this._stageChanges(textEditor, [changes[index]]);

		const firstStagedLine = changes[index].modifiedStartLineNumber;
		textEditor.selections = [new Selection(firstStagedLine, 0, firstStagedLine, 0)];
	}

	@command('git.diff.stageHunk')
	async diffStageHunk(changes: DiffEditorSelectionHunkToolbarContext | undefined): Promise<void> {
		if (changes) {
			this.diffStageHunkOrSelection(changes);
		} else {
			await this.stageHunkAtCursor();
		}
	}

	@command('git.diff.stageSelection')
	async diffStageSelection(changes: DiffEditorSelectionHunkToolbarContext | undefined): Promise<void> {
		this.diffStageHunkOrSelection(changes);
	}

	async diffStageHunkOrSelection(changes: DiffEditorSelectionHunkToolbarContext | undefined): Promise<void> {
		if (!changes) {
			return;
		}

		let modifiedUri = changes.modifiedUri;
		let modifiedDocument: TextDocument | undefined;

		if (!modifiedUri) {
			const textEditor = window.activeTextEditor;
			if (!textEditor) {
				return;
			}
			modifiedDocument = textEditor.document;
			modifiedUri = modifiedDocument.uri;
		}

		if (modifiedUri.scheme !== 'file') {
			return;
		}

		if (!modifiedDocument) {
			modifiedDocument = await workspace.openTextDocument(modifiedUri);
		}

		const result = changes.originalWithModifiedChanges;
		await this.runByRepository(modifiedUri, async (repository, resource) =>
			await repository.stage(resource, result, modifiedDocument.encoding));
	}

	private async stageHunkAtCursor(): Promise<void> {
		const textEditor = window.activeTextEditor;

		if (!textEditor) {
			return;
		}

		const workingTreeDiffInformation = getWorkingTreeDiffInformation(textEditor);
		if (!workingTreeDiffInformation) {
			return;
		}

		const workingTreeLineChanges = toLineChanges(workingTreeDiffInformation);
		const modifiedDocument = textEditor.document;
		const cursorPosition = textEditor.selection.active;

		// Find the hunk that contains the cursor position
		const hunkAtCursor = workingTreeLineChanges.find(change => {
			const hunkRange = getModifiedRange(modifiedDocument, change);
			return hunkRange.contains(cursorPosition);
		});

		if (!hunkAtCursor) {
			window.showInformationMessage(l10n.t('No hunk found at cursor position.'));
			return;
		}

		await this._stageChanges(textEditor, [hunkAtCursor]);
	}

	@command('git.stageSelectedRanges')
	async stageSelectedChanges(): Promise<void> {
		const textEditor = window.activeTextEditor;

		if (!textEditor) {
			return;
		}

		const workingTreeDiffInformation = getWorkingTreeDiffInformation(textEditor);
		if (!workingTreeDiffInformation) {
			return;
		}

		const workingTreeLineChanges = toLineChanges(workingTreeDiffInformation);

		this.logger.trace(`[CommandCenter][stageSelectedChanges] diffInformation: ${JSON.stringify(workingTreeDiffInformation)}`);
		this.logger.trace(`[CommandCenter][stageSelectedChanges] diffInformation changes: ${JSON.stringify(workingTreeLineChanges)}`);

		const modifiedDocument = textEditor.document;
		const selectedLines = toLineRanges(textEditor.selections, modifiedDocument);
		const selectedChanges = workingTreeLineChanges
			.map(change => selectedLines.reduce<LineChange | null>((result, range) => result || intersectDiffWithRange(modifiedDocument, change, range), null))
			.filter(d => !!d) as LineChange[];

		this.logger.trace(`[CommandCenter][stageSelectedChanges] selectedChanges: ${JSON.stringify(selectedChanges)}`);

		if (!selectedChanges.length) {
			window.showInformationMessage(l10n.t('The selection range does not contain any changes.'));
			return;
		}

		await this._stageChanges(textEditor, selectedChanges);
	}

	@command('git.stageFile')
	async stageFile(uri: Uri): Promise<void> {
		uri = uri ?? window.activeTextEditor?.document.uri;

		if (!uri) {
			return;
		}

		const repository = this.model.getRepository(uri);
		if (!repository) {
			return;
		}

		const resources = [
			...repository.workingTreeGroup.resourceStates,
			...repository.untrackedGroup.resourceStates]
			.filter(r => r.multiFileDiffEditorModifiedUri?.toString() === uri.toString() || r.multiDiffEditorOriginalUri?.toString() === uri.toString())
			.map(r => r.resourceUri);

		if (resources.length === 0) {
			return;
		}

		await repository.add(resources);
	}

	@command('git.acceptMerge')
	async acceptMerge(_uri: Uri | unknown): Promise<void> {
		const { activeTab } = window.tabGroups.activeTabGroup;
		if (!activeTab) {
			return;
		}

		if (!(activeTab.input instanceof TabInputTextMerge)) {
			return;
		}

		const uri = activeTab.input.result;

		const repository = this.model.getRepository(uri);
		if (!repository) {
			console.log(`FAILED to complete merge because uri ${uri.toString()} doesn't belong to any repository`);
			return;
		}

		const result = await commands.executeCommand('mergeEditor.acceptMerge') as { successful: boolean };
		if (result.successful) {
			await repository.add([uri]);
			await commands.executeCommand('workbench.view.scm');
		}

		/*
		if (!(uri instanceof Uri)) {
			return;
		}




		// make sure to save the merged document
		const doc = workspace.textDocuments.find(doc => doc.uri.toString() === uri.toString());
		if (!doc) {
			console.log(`FAILED to complete merge because uri ${uri.toString()} doesn't match a document`);
			return;
		}
		if (doc.isDirty) {
			await doc.save();
		}

		// find the merge editor tabs for the resource in question and close them all
		let didCloseTab = false;
		const mergeEditorTabs = window.tabGroups.all.map(group => group.tabs.filter(tab => tab.input instanceof TabInputTextMerge && tab.input.result.toString() === uri.toString())).flat();
		if (mergeEditorTabs.includes(activeTab)) {
			didCloseTab = await window.tabGroups.close(mergeEditorTabs, true);
		}

		// Only stage if the merge editor has been successfully closed. That means all conflicts have been
		// handled or unhandled conflicts are OK by the user.
		if (didCloseTab) {
			await repository.add([uri]);
			await commands.executeCommand('workbench.view.scm');
		}*/
	}

	@command('git.runGitMerge')
	async runGitMergeNoDiff3(): Promise<void> {
		await this.runGitMerge(false);
	}

	@command('git.runGitMergeDiff3')
	async runGitMergeDiff3(): Promise<void> {
		await this.runGitMerge(true);
	}

	private async runGitMerge(diff3: boolean): Promise<void> {
		const { activeTab } = window.tabGroups.activeTabGroup;
		if (!activeTab) {
			return;
		}

		const input = activeTab.input;
		if (!(input instanceof TabInputTextMerge)) {
			return;
		}

		const result = await this.git.mergeFile({
			basePath: input.base.fsPath,
			input1Path: input.input1.fsPath,
			input2Path: input.input2.fsPath,
			diff3,
		});

		const doc = workspace.textDocuments.find(doc => doc.uri.toString() === input.result.toString());
		if (!doc) {
			return;
		}
		const e = new WorkspaceEdit();

		e.replace(
			input.result,
			new Range(
				new Position(0, 0),
				new Position(doc.lineCount, 0),
			),
			result
		);
		await workspace.applyEdit(e);
	}

	private async _stageChanges(textEditor: TextEditor, changes: LineChange[]): Promise<void> {
		const modifiedDocument = textEditor.document;
		const modifiedUri = modifiedDocument.uri;

		if (modifiedUri.scheme !== 'file') {
			return;
		}

		const originalUri = toGitUri(modifiedUri, '~');
		const originalDocument = await workspace.openTextDocument(originalUri);
		const result = applyLineChanges(originalDocument, modifiedDocument, changes);

		await this.runByRepository(modifiedUri, async (repository, resource) =>
			await repository.stage(resource, result, modifiedDocument.encoding));
	}

	@command('git.revertChange')
	async revertChange(uri: Uri, changes: LineChange[], index: number): Promise<void> {
		if (!uri) {
			return;
		}

		const textEditor = window.visibleTextEditors.filter(e => e.document.uri.toString() === uri.toString())[0];

		if (!textEditor) {
			return;
		}

		await this._revertChanges(textEditor, [...changes.slice(0, index), ...changes.slice(index + 1)]);

		const firstStagedLine = changes[index].modifiedStartLineNumber;
		textEditor.selections = [new Selection(firstStagedLine, 0, firstStagedLine, 0)];
	}

	@command('git.revertSelectedRanges')
	async revertSelectedRanges(): Promise<void> {
		const textEditor = window.activeTextEditor;

		if (!textEditor) {
			return;
		}

		const workingTreeDiffInformation = getWorkingTreeDiffInformation(textEditor);
		if (!workingTreeDiffInformation) {
			return;
		}

		const workingTreeLineChanges = toLineChanges(workingTreeDiffInformation);

		this.logger.trace(`[CommandCenter][revertSelectedRanges] diffInformation: ${JSON.stringify(workingTreeDiffInformation)}`);
		this.logger.trace(`[CommandCenter][revertSelectedRanges] diffInformation changes: ${JSON.stringify(workingTreeLineChanges)}`);

		const modifiedDocument = textEditor.document;
		const selections = textEditor.selections;
		const selectedChanges = workingTreeLineChanges.filter(change => {
			const modifiedRange = getModifiedRange(modifiedDocument, change);
			return selections.every(selection => !selection.intersection(modifiedRange));
		});

		if (selectedChanges.length === workingTreeLineChanges.length) {
			window.showInformationMessage(l10n.t('The selection range does not contain any changes.'));
			return;
		}

		this.logger.trace(`[CommandCenter][revertSelectedRanges] selectedChanges: ${JSON.stringify(selectedChanges)}`);

		const selectionsBeforeRevert = textEditor.selections;
		await this._revertChanges(textEditor, selectedChanges);
		textEditor.selections = selectionsBeforeRevert;
	}

	private async _revertChanges(textEditor: TextEditor, changes: LineChange[]): Promise<void> {
		const modifiedDocument = textEditor.document;
		const modifiedUri = modifiedDocument.uri;

		if (modifiedUri.scheme !== 'file') {
			return;
		}

		const originalUri = toGitUri(modifiedUri, '~');
		const originalDocument = await workspace.openTextDocument(originalUri);
		const visibleRangesBeforeRevert = textEditor.visibleRanges;
		const result = applyLineChanges(originalDocument, modifiedDocument, changes);

		const edit = new WorkspaceEdit();
		edit.replace(modifiedUri, new Range(new Position(0, 0), modifiedDocument.lineAt(modifiedDocument.lineCount - 1).range.end), result);
		workspace.applyEdit(edit);

		await modifiedDocument.save();

		textEditor.revealRange(visibleRangesBeforeRevert[0]);
	}

	@command('git.unstage')
	async unstage(...resourceStates: SourceControlResourceState[]): Promise<void> {
		resourceStates = resourceStates.filter(s => !!s);

		if (resourceStates.length === 0 || (resourceStates[0] && !(resourceStates[0].resourceUri instanceof Uri))) {
			const resource = this.getSCMResource();

			if (!resource) {
				return;
			}

			resourceStates = [resource];
		}

		const scmResources = resourceStates
			.filter(s => s instanceof Resource && s.resourceGroupType === ResourceGroupType.Index) as Resource[];

		if (!scmResources.length) {
			return;
		}

		const resources = scmResources.map(r => r.resourceUri);
		await this.runByRepository(resources, async (repository, resources) => repository.revert(resources));
	}

	@command('git.unstageAll', { repository: true })
	async unstageAll(repository: Repository): Promise<void> {
		await repository.revert([]);
	}

	@command('git.unstageSelectedRanges')
	async unstageSelectedRanges(): Promise<void> {
		const textEditor = window.activeTextEditor;

		if (!textEditor) {
			return;
		}

		const modifiedDocument = textEditor.document;
		const modifiedUri = modifiedDocument.uri;

		const repository = this.model.getRepository(modifiedUri);
		if (!repository) {
			return;
		}

		const resource = repository.indexGroup.resourceStates
			.find(r => pathEquals(r.resourceUri.fsPath, modifiedUri.fsPath));
		if (!resource) {
			return;
		}

		const indexDiffInformation = getIndexDiffInformation(textEditor);
		if (!indexDiffInformation) {
			return;
		}

		const indexLineChanges = toLineChanges(indexDiffInformation);

		this.logger.trace(`[CommandCenter][unstageSelectedRanges] diffInformation: ${JSON.stringify(indexDiffInformation)}`);
		this.logger.trace(`[CommandCenter][unstageSelectedRanges] diffInformation changes: ${JSON.stringify(indexLineChanges)}`);

		const originalUri = toGitUri(resource.original, 'HEAD');
		const originalDocument = await workspace.openTextDocument(originalUri);
		const selectedLines = toLineRanges(textEditor.selections, modifiedDocument);

		const selectedDiffs = indexLineChanges
			.map(change => selectedLines.reduce<LineChange | null>((result, range) => result || intersectDiffWithRange(modifiedDocument, change, range), null))
			.filter(c => !!c) as LineChange[];

		if (!selectedDiffs.length) {
			window.showInformationMessage(l10n.t('The selection range does not contain any changes.'));
			return;
		}

		this.logger.trace(`[CommandCenter][unstageSelectedRanges] selectedDiffs: ${JSON.stringify(selectedDiffs)}`);

		// if (modifiedUri.scheme === 'file') {
		// 	// Editor
		// 	this.logger.trace(`[CommandCenter][unstageSelectedRanges] changes: ${JSON.stringify(selectedDiffs)}`);
		// 	await this._unstageChanges(textEditor, selectedDiffs);
		// 	return;
		// }

		const selectedDiffsInverted = selectedDiffs.map(invertLineChange);
		this.logger.trace(`[CommandCenter][unstageSelectedRanges] selectedDiffsInverted: ${JSON.stringify(selectedDiffsInverted)}`);

		const result = applyLineChanges(modifiedDocument, originalDocument, selectedDiffsInverted);
		await repository.stage(modifiedDocument.uri, result, modifiedDocument.encoding);
	}

	@command('git.unstageFile')
	async unstageFile(uri: Uri): Promise<void> {
		uri = uri ?? window.activeTextEditor?.document.uri;

		if (!uri) {
			return;
		}

		const repository = this.model.getRepository(uri);
		if (!repository) {
			return;
		}

		const resources = repository.indexGroup.resourceStates
			.filter(r => r.multiFileDiffEditorModifiedUri?.toString() === uri.toString() || r.multiDiffEditorOriginalUri?.toString() === uri.toString())
			.map(r => r.resourceUri);

		if (resources.length === 0) {
			return;
		}

		await repository.revert(resources);
	}

	@command('git.unstageChange')
	async unstageChange(uri: Uri, changes: LineChange[], index: number): Promise<void> {
		if (!uri) {
			return;
		}

		const textEditor = window.visibleTextEditors.filter(e => e.document.uri.toString() === uri.toString())[0];
		if (!textEditor) {
			return;
		}

		await this._unstageChanges(textEditor, [changes[index]]);
	}

	private async _unstageChanges(textEditor: TextEditor, changes: LineChange[]): Promise<void> {
		const modifiedDocument = textEditor.document;
		const modifiedUri = modifiedDocument.uri;

		if (modifiedUri.scheme !== 'file') {
			return;
		}

		const workingTreeDiffInformation = getWorkingTreeDiffInformation(textEditor);
		if (!workingTreeDiffInformation) {
			return;
		}

		// Approach to unstage change(s):
		// - use file on disk as original document
		// - revert all changes from the working tree
		// - revert the specify change(s) from the index
		const workingTreeDiffs = toLineChanges(workingTreeDiffInformation);
		const workingTreeDiffsInverted = workingTreeDiffs.map(invertLineChange);
		const changesInverted = changes.map(invertLineChange);
		const diffsInverted = [...changesInverted, ...workingTreeDiffsInverted].sort(compareLineChanges);

		const originalUri = toGitUri(modifiedUri, 'HEAD');
		const originalDocument = await workspace.openTextDocument(originalUri);
		const result = applyLineChanges(modifiedDocument, originalDocument, diffsInverted);

		await this.runByRepository(modifiedUri, async (repository, resource) =>
			await repository.stage(resource, result, modifiedDocument.encoding));
	}

	@command('git.clean')
	async clean(...resourceStates: SourceControlResourceState[]): Promise<void> {
		// Remove duplicate resources
		const resourceUris = new Set<string>();
		resourceStates = resourceStates.filter(s => {
			if (s === undefined) {
				return false;
			}

			if (resourceUris.has(s.resourceUri.toString())) {
				return false;
			}

			resourceUris.add(s.resourceUri.toString());
			return true;
		});

		if (resourceStates.length === 0 || (resourceStates[0] && !(resourceStates[0].resourceUri instanceof Uri))) {
			const resource = this.getSCMResource();

			if (!resource) {
				return;
			}

			resourceStates = [resource];
		}

		const scmResources = resourceStates.filter(s => s instanceof Resource
			&& (s.resourceGroupType === ResourceGroupType.WorkingTree || s.resourceGroupType === ResourceGroupType.Untracked)) as Resource[];

		if (!scmResources.length) {
			return;
		}

		await this._cleanAll(scmResources);
	}

	@command('git.cleanAll', { repository: true })
	async cleanAll(repository: Repository): Promise<void> {
		await this._cleanAll(repository.workingTreeGroup.resourceStates);
	}

	@command('git.cleanAllTracked', { repository: true })
	async cleanAllTracked(repository: Repository): Promise<void> {
		const resources = repository.workingTreeGroup.resourceStates
			.filter(r => r.type !== Status.UNTRACKED && r.type !== Status.IGNORED);

		if (resources.length === 0) {
			return;
		}

		await this._cleanTrackedChanges(resources);
	}

	@command('git.cleanAllUntracked', { repository: true })
	async cleanAllUntracked(repository: Repository): Promise<void> {
		const resources = [...repository.workingTreeGroup.resourceStates, ...repository.untrackedGroup.resourceStates]
			.filter(r => r.type === Status.UNTRACKED || r.type === Status.IGNORED);

		if (resources.length === 0) {
			return;
		}

		await this._cleanUntrackedChanges(resources);
	}

	private async _cleanAll(resources: Resource[]): Promise<void> {
		if (resources.length === 0) {
			return;
		}

		const trackedResources = resources.filter(r => r.type !== Status.UNTRACKED && r.type !== Status.IGNORED);
		const untrackedResources = resources.filter(r => r.type === Status.UNTRACKED || r.type === Status.IGNORED);

		if (untrackedResources.length === 0) {
			// Tracked files only
			await this._cleanTrackedChanges(resources);
		} else if (trackedResources.length === 0) {
			// Untracked files only
			await this._cleanUntrackedChanges(resources);
		} else {
			// Tracked & Untracked files
			const [untrackedMessage, untrackedMessageDetail] = this.getDiscardUntrackedChangesDialogDetails(untrackedResources);

			const trackedMessage = trackedResources.length === 1
				? l10n.t('\n\nAre you sure you want to discard changes in \'{0}\'?', path.basename(trackedResources[0].resourceUri.fsPath))
				: l10n.t('\n\nAre you sure you want to discard ALL changes in {0} files?', trackedResources.length);

			const yesTracked = trackedResources.length === 1
				? l10n.t('Discard 1 Tracked File')
				: l10n.t('Discard All {0} Tracked Files', trackedResources.length);

			const yesAll = l10n.t('Discard All {0} Files', resources.length);
			const pick = await window.showWarningMessage(`${untrackedMessage} ${untrackedMessageDetail}${trackedMessage}\n\nThis is IRREVERSIBLE!\nYour current working set will be FOREVER LOST if you proceed.`, { modal: true }, yesTracked, yesAll);

			if (pick === yesTracked) {
				resources = trackedResources;
			} else if (pick !== yesAll) {
				return;
			}

			const resourceUris = resources.map(r => r.resourceUri);
			await this.runByRepository(resourceUris, async (repository, resources) => repository.clean(resources));
		}
	}

	private async _cleanTrackedChanges(resources: Resource[]): Promise<void> {
		const allResourcesDeleted = resources.every(r => r.type === Status.DELETED);

		const message = allResourcesDeleted
			? resources.length === 1
				? l10n.t('Are you sure you want to restore \'{0}\'?', path.basename(resources[0].resourceUri.fsPath))
				: l10n.t('Are you sure you want to restore ALL {0} files?', resources.length)
			: resources.length === 1
				? l10n.t('Are you sure you want to discard changes in \'{0}\'?', path.basename(resources[0].resourceUri.fsPath))
				: l10n.t('Are you sure you want to discard ALL changes in {0} files?\n\nThis is IRREVERSIBLE!\nYour current working set will be FOREVER LOST if you proceed.', resources.length);

		const yes = allResourcesDeleted
			? resources.length === 1
				? l10n.t('Restore File')
				: l10n.t('Restore All {0} Files', resources.length)
			: resources.length === 1
				? l10n.t('Discard File')
				: l10n.t('Discard All {0} Files', resources.length);

		const pick = await window.showWarningMessage(message, { modal: true }, yes);

		if (pick !== yes) {
			return;
		}

		const resourceUris = resources.map(r => r.resourceUri);
		await this.runByRepository(resourceUris, async (repository, resources) => repository.clean(resources));
	}

	private async _cleanUntrackedChanges(resources: Resource[]): Promise<void> {
		const [message, messageDetail, primaryAction] = this.getDiscardUntrackedChangesDialogDetails(resources);
		const pick = await window.showWarningMessage(message, { detail: messageDetail, modal: true }, primaryAction);

		if (pick !== primaryAction) {
			return;
		}

		const resourceUris = resources.map(r => r.resourceUri);
		await this.runByRepository(resourceUris, async (repository, resources) => repository.clean(resources));
	}

	private getDiscardUntrackedChangesDialogDetails(resources: Resource[]): [string, string, string] {
		const config = workspace.getConfiguration('git');
		const discardUntrackedChangesToTrash = config.get<boolean>('discardUntrackedChangesToTrash', true) && !isRemote && !isLinuxSnap;

		const messageWarning = !discardUntrackedChangesToTrash
			? resources.length === 1
				? '\n\n' + l10n.t('This is IRREVERSIBLE!\nThis file will be FOREVER LOST if you proceed.')
				: '\n\n' + l10n.t('This is IRREVERSIBLE!\nThese files will be FOREVER LOST if you proceed.')
			: '';

		const message = resources.length === 1
			? l10n.t('Are you sure you want to DELETE the following untracked file: \'{0}\'?{1}', path.basename(resources[0].resourceUri.fsPath), messageWarning)
			: l10n.t('Are you sure you want to DELETE the {0} untracked files?{1}', resources.length, messageWarning);

		const messageDetail = discardUntrackedChangesToTrash
			? isWindows
				? resources.length === 1
					? l10n.t('You can restore this file from the Recycle Bin.')
					: l10n.t('You can restore these files from the Recycle Bin.')
				: resources.length === 1
					? l10n.t('You can restore this file from the Trash.')
					: l10n.t('You can restore these files from the Trash.')
			: '';

		const primaryAction = discardUntrackedChangesToTrash
			? isWindows
				? l10n.t('Move to Recycle Bin')
				: l10n.t('Move to Trash')
			: resources.length === 1
				? l10n.t('Delete File')
				: l10n.t('Delete All {0} Files', resources.length);

		return [message, messageDetail, primaryAction];
	}

	private async smartCommit(
		repository: Repository,
		getCommitMessage: () => Promise<string | undefined>,
		opts: CommitOptions
	): Promise<void> {
		const config = workspace.getConfiguration('git', Uri.file(repository.root));
		let promptToSaveFilesBeforeCommit = config.get<'always' | 'staged' | 'never'>('promptToSaveFilesBeforeCommit');

		// migration
		if (typeof promptToSaveFilesBeforeCommit === 'boolean') {
			promptToSaveFilesBeforeCommit = promptToSaveFilesBeforeCommit ? 'always' : 'never';
		}

		let enableSmartCommit = config.get<boolean>('enableSmartCommit') === true;
		const enableCommitSigning = config.get<boolean>('enableCommitSigning') === true;
		let noStagedChanges = repository.indexGroup.resourceStates.length === 0;
		let noUnstagedChanges = repository.workingTreeGroup.resourceStates.length === 0;

		if (!opts.empty) {
			if (promptToSaveFilesBeforeCommit !== 'never') {
				let documents = workspace.textDocuments
					.filter(d => !d.isUntitled && d.isDirty && isDescendant(repository.root, d.uri.fsPath));

				if (promptToSaveFilesBeforeCommit === 'staged' || repository.indexGroup.resourceStates.length > 0) {
					documents = documents
						.filter(d => repository.indexGroup.resourceStates.some(s => pathEquals(s.resourceUri.fsPath, d.uri.fsPath)));
				}

				if (documents.length > 0) {
					const message = documents.length === 1
						? l10n.t('The following file has unsaved changes which won\'t be included in the commit if you proceed: {0}.\n\nWould you like to save it before committing?', path.basename(documents[0].uri.fsPath))
						: l10n.t('There are {0} unsaved files.\n\nWould you like to save them before committing?', documents.length);
					const saveAndCommit = l10n.t('Save All & Commit Changes');
					const commit = l10n.t('Commit Changes');
					const pick = await window.showWarningMessage(message, { modal: true }, saveAndCommit, commit);

					if (pick === saveAndCommit) {
						await Promise.all(documents.map(d => d.save()));

						// After saving the dirty documents, if there are any documents that are part of the
						// index group we have to add them back in order for the saved changes to be committed
						documents = documents
							.filter(d => repository.indexGroup.resourceStates.some(s => pathEquals(s.resourceUri.fsPath, d.uri.fsPath)));
						await repository.add(documents.map(d => d.uri));

						noStagedChanges = repository.indexGroup.resourceStates.length === 0;
						noUnstagedChanges = repository.workingTreeGroup.resourceStates.length === 0;
					} else if (pick !== commit) {
						return; // do not commit on cancel
					}
				}
			}

			// no changes, and the user has not configured to commit all in this case
			if (!noUnstagedChanges && noStagedChanges && !enableSmartCommit && !opts.all && !opts.amend) {
				const suggestSmartCommit = config.get<boolean>('suggestSmartCommit') === true;

				if (!suggestSmartCommit) {
					return;
				}

				// prompt the user if we want to commit all or not
				const message = l10n.t('There are no staged changes to commit.\n\nWould you like to stage all your changes and commit them directly?');
				const yes = l10n.t('Yes');
				const always = l10n.t('Always');
				const never = l10n.t('Never');
				const pick = await window.showWarningMessage(message, { modal: true }, yes, always, never);

				if (pick === always) {
					enableSmartCommit = true;
					config.update('enableSmartCommit', true, true);
				} else if (pick === never) {
					config.update('suggestSmartCommit', false, true);
					return;
				} else if (pick === yes) {
					enableSmartCommit = true;
				} else {
					// Cancel
					return;
				}
			}

			// smart commit
			if (enableSmartCommit && !opts.all) {
				opts = { ...opts, all: noStagedChanges };
			}
		}

		// enable signing of commits if configured
		opts.signCommit = enableCommitSigning;

		if (config.get<boolean>('alwaysSignOff')) {
			opts.signoff = true;
		}

		if (config.get<boolean>('useEditorAsCommitInput')) {
			opts.useEditor = true;

			if (config.get<boolean>('verboseCommit')) {
				opts.verbose = true;
			}
		}

		const smartCommitChanges = config.get<'all' | 'tracked'>('smartCommitChanges');

		if (
			(
				// no changes
				(noStagedChanges && noUnstagedChanges)
				// or no staged changes and not `all`
				|| (!opts.all && noStagedChanges)
				// no staged changes and no tracked unstaged changes
				|| (noStagedChanges && smartCommitChanges === 'tracked' && repository.workingTreeGroup.resourceStates.every(r => r.type === Status.UNTRACKED))
			)
			// amend allows changing only the commit message
			&& !opts.amend
			&& !opts.empty
			// merge not in progress
			&& !repository.mergeInProgress
			// rebase not in progress
			&& repository.rebaseCommit === undefined
		) {
			const commitAnyway = l10n.t('Create Empty Commit');
			const answer = await window.showInformationMessage(l10n.t('There are no changes to commit.'), commitAnyway);

			if (answer !== commitAnyway) {
				return;
			}

			opts.empty = true;
		}

		if (opts.noVerify) {
			if (!config.get<boolean>('allowNoVerifyCommit')) {
				await window.showErrorMessage(l10n.t('Commits without verification are not allowed, please enable them with the "git.allowNoVerifyCommit" setting.'));
				return;
			}

			if (config.get<boolean>('confirmNoVerifyCommit')) {
				const message = l10n.t('You are about to commit your changes without verification, this skips pre-commit hooks and can be undesirable.\n\nAre you sure to continue?');
				const yes = l10n.t('OK');
				const neverAgain = l10n.t('OK, Don\'t Ask Again');
				const pick = await window.showWarningMessage(message, { modal: true }, yes, neverAgain);

				if (pick === neverAgain) {
					config.update('confirmNoVerifyCommit', false, true);
				} else if (pick !== yes) {
					return;
				}
			}
		}

		const message = await getCommitMessage();

		if (!message && !opts.amend && !opts.useEditor) {
			return;
		}

		if (opts.all && smartCommitChanges === 'tracked') {
			opts.all = 'tracked';
		}

		if (opts.all && config.get<'mixed' | 'separate' | 'hidden'>('untrackedChanges') !== 'mixed') {
			opts.all = 'tracked';
		}

		// Diagnostics commit hook
		const diagnosticsResult = await evaluateDiagnosticsCommitHook(repository, opts, this.logger);
		if (!diagnosticsResult) {
			return;
		}

		// Branch protection commit hook
		const branchProtectionPrompt = config.get<'alwaysCommit' | 'alwaysCommitToNewBranch' | 'alwaysPrompt'>('branchProtectionPrompt')!;
		if (repository.isBranchProtected() && (branchProtectionPrompt === 'alwaysPrompt' || branchProtectionPrompt === 'alwaysCommitToNewBranch')) {
			const commitToNewBranch = l10n.t('Commit to a New Branch');

			let pick: string | undefined = commitToNewBranch;

			if (branchProtectionPrompt === 'alwaysPrompt') {
				const message = l10n.t('You are trying to commit to a protected branch and you might not have permission to push your commits to the remote.\n\nHow would you like to proceed?');
				const commit = l10n.t('Commit Anyway');

				pick = await window.showWarningMessage(message, { modal: true }, commitToNewBranch, commit);
			}

			if (!pick) {
				return;
			} else if (pick === commitToNewBranch) {
				const branchName = await this.promptForBranchName(repository);

				if (!branchName) {
					return;
				}

				await repository.branch(branchName, true);
			}
		}

		await repository.commit(message, opts);
	}

	private async commitWithAnyInput(repository: Repository, opts: CommitOptions): Promise<void> {
		const message = repository.inputBox.value;
		const root = Uri.file(repository.root);
		const config = workspace.getConfiguration('git', root);

		const getCommitMessage = async () => {
			let _message: string | undefined = message;

			if (!_message && !config.get<boolean>('useEditorAsCommitInput')) {
				const value: string | undefined = undefined;

				if (opts && opts.amend && repository.HEAD && repository.HEAD.commit) {
					return undefined;
				}

				const branchName = repository.headShortName;
				let placeHolder: string;

				if (branchName) {
					placeHolder = l10n.t('Message (commit on "{0}")', branchName);
				} else {
					placeHolder = l10n.t('Commit message');
				}

				_message = await window.showInputBox({
					value,
					placeHolder,
					prompt: l10n.t('Please provide a commit message'),
					ignoreFocusOut: true
				});
			}

			return _message;
		};

		await this.smartCommit(repository, getCommitMessage, opts);
	}

	@command('git.commit', { repository: true })
	async commit(repository: Repository, postCommitCommand?: string | null): Promise<void> {
		await this.commitWithAnyInput(repository, { postCommitCommand });
	}

	@command('git.commitAmend', { repository: true })
	async commitAmend(repository: Repository): Promise<void> {
		await this.commitWithAnyInput(repository, { amend: true });
	}

	@command('git.commitSigned', { repository: true })
	async commitSigned(repository: Repository): Promise<void> {
		await this.commitWithAnyInput(repository, { signoff: true });
	}

	@command('git.commitStaged', { repository: true })
	async commitStaged(repository: Repository): Promise<void> {
		await this.commitWithAnyInput(repository, { all: false });
	}

	@command('git.commitStagedSigned', { repository: true })
	async commitStagedSigned(repository: Repository): Promise<void> {
		await this.commitWithAnyInput(repository, { all: false, signoff: true });
	}

	@command('git.commitStagedAmend', { repository: true })
	async commitStagedAmend(repository: Repository): Promise<void> {
		await this.commitWithAnyInput(repository, { all: false, amend: true });
	}

	@command('git.commitAll', { repository: true })
	async commitAll(repository: Repository): Promise<void> {
		await this.commitWithAnyInput(repository, { all: true });
	}

	@command('git.commitAllSigned', { repository: true })
	async commitAllSigned(repository: Repository): Promise<void> {
		await this.commitWithAnyInput(repository, { all: true, signoff: true });
	}

	@command('git.commitAllAmend', { repository: true })
	async commitAllAmend(repository: Repository): Promise<void> {
		await this.commitWithAnyInput(repository, { all: true, amend: true });
	}

	@command('git.commitMessageAccept')
	async commitMessageAccept(arg?: Uri): Promise<void> {
		if (!arg && !window.activeTextEditor) { return; }
		arg ??= window.activeTextEditor!.document.uri;

		// Close the tab
		this._closeEditorTab(arg);
	}

	@command('git.commitMessageDiscard')
	async commitMessageDiscard(arg?: Uri): Promise<void> {
		if (!arg && !window.activeTextEditor) { return; }
		arg ??= window.activeTextEditor!.document.uri;

		// Clear the contents of the editor
		const editors = window.visibleTextEditors
			.filter(e => e.document.languageId === 'git-commit' && e.document.uri.toString() === arg!.toString());

		if (editors.length !== 1) { return; }

		const commitMsgEditor = editors[0];
		const commitMsgDocument = commitMsgEditor.document;

		const editResult = await commitMsgEditor.edit(builder => {
			const firstLine = commitMsgDocument.lineAt(0);
			const lastLine = commitMsgDocument.lineAt(commitMsgDocument.lineCount - 1);

			builder.delete(new Range(firstLine.range.start, lastLine.range.end));
		});

		if (!editResult) { return; }

		// Save the document
		const saveResult = await commitMsgDocument.save();
		if (!saveResult) { return; }

		// Close the tab
		this._closeEditorTab(arg);
	}

	private _closeEditorTab(uri: Uri): void {
		const tabToClose = window.tabGroups.all.map(g => g.tabs).flat()
			.filter(t => t.input instanceof TabInputText && t.input.uri.toString() === uri.toString());

		window.tabGroups.close(tabToClose);
	}

	private async _commitEmpty(repository: Repository, noVerify?: boolean): Promise<void> {
		const root = Uri.file(repository.root);
		const config = workspace.getConfiguration('git', root);
		const shouldPrompt = config.get<boolean>('confirmEmptyCommits') === true;

		if (shouldPrompt) {
			const message = l10n.t('Are you sure you want to create an empty commit?');
			const yes = l10n.t('Yes');
			const neverAgain = l10n.t('Yes, Don\'t Show Again');
			const pick = await window.showWarningMessage(message, { modal: true }, yes, neverAgain);

			if (pick === neverAgain) {
				await config.update('confirmEmptyCommits', false, true);
			} else if (pick !== yes) {
				return;
			}
		}

		await this.commitWithAnyInput(repository, { empty: true, noVerify });
	}

	@command('git.commitEmpty', { repository: true })
	async commitEmpty(repository: Repository): Promise<void> {
		await this._commitEmpty(repository);
	}

	@command('git.commitNoVerify', { repository: true })
	async commitNoVerify(repository: Repository): Promise<void> {
		await this.commitWithAnyInput(repository, { noVerify: true });
	}

	@command('git.commitStagedNoVerify', { repository: true })
	async commitStagedNoVerify(repository: Repository): Promise<void> {
		await this.commitWithAnyInput(repository, { all: false, noVerify: true });
	}

	@command('git.commitStagedSignedNoVerify', { repository: true })
	async commitStagedSignedNoVerify(repository: Repository): Promise<void> {
		await this.commitWithAnyInput(repository, { all: false, signoff: true, noVerify: true });
	}

	@command('git.commitAmendNoVerify', { repository: true })
	async commitAmendNoVerify(repository: Repository): Promise<void> {
		await this.commitWithAnyInput(repository, { amend: true, noVerify: true });
	}

	@command('git.commitSignedNoVerify', { repository: true })
	async commitSignedNoVerify(repository: Repository): Promise<void> {
		await this.commitWithAnyInput(repository, { signoff: true, noVerify: true });
	}

	@command('git.commitStagedAmendNoVerify', { repository: true })
	async commitStagedAmendNoVerify(repository: Repository): Promise<void> {
		await this.commitWithAnyInput(repository, { all: false, amend: true, noVerify: true });
	}

	@command('git.commitAllNoVerify', { repository: true })
	async commitAllNoVerify(repository: Repository): Promise<void> {
		await this.commitWithAnyInput(repository, { all: true, noVerify: true });
	}

	@command('git.commitAllSignedNoVerify', { repository: true })
	async commitAllSignedNoVerify(repository: Repository): Promise<void> {
		await this.commitWithAnyInput(repository, { all: true, signoff: true, noVerify: true });
	}

	@command('git.commitAllAmendNoVerify', { repository: true })
	async commitAllAmendNoVerify(repository: Repository): Promise<void> {
		await this.commitWithAnyInput(repository, { all: true, amend: true, noVerify: true });
	}

	@command('git.commitEmptyNoVerify', { repository: true })
	async commitEmptyNoVerify(repository: Repository): Promise<void> {
		await this._commitEmpty(repository, true);
	}

	@command('git.restoreCommitTemplate', { repository: true })
	async restoreCommitTemplate(repository: Repository): Promise<void> {
		repository.inputBox.value = await repository.getCommitTemplate();
	}

	@command('git.undoCommit', { repository: true })
	async undoCommit(repository: Repository): Promise<void> {
		const HEAD = repository.HEAD;

		if (!HEAD || !HEAD.commit) {
			window.showWarningMessage(l10n.t('Can\'t undo because HEAD doesn\'t point to any commit.'));
			return;
		}

		const commit = await repository.getCommit('HEAD');

		if (commit.parents.length > 1) {
			const yes = l10n.t('Undo merge commit');
			const result = await window.showWarningMessage(l10n.t('The last commit was a merge commit. Are you sure you want to undo it?'), { modal: true }, yes);

			if (result !== yes) {
				return;
			}
		}

		if (commit.parents.length > 0) {
			await repository.reset('HEAD~');
		} else {
			await repository.deleteRef('HEAD');
			await this.unstageAll(repository);
		}

		repository.inputBox.value = commit.message;
	}

	@command('git.checkout', { repository: true })
	async checkout(repository: Repository, treeish?: string): Promise<boolean> {
		return this._checkout(repository, { treeish });
	}

	@command('git.graph.checkout', { repository: true })
	async checkout2(repository: Repository, historyItem?: SourceControlHistoryItem, historyItemRefId?: string): Promise<void> {
		const historyItemRef = historyItem?.references?.find(r => r.id === historyItemRefId);
		if (!historyItemRef) {
			return;
		}

		const config = workspace.getConfiguration('git', Uri.file(repository.root));
		const pullBeforeCheckout = config.get<boolean>('pullBeforeCheckout', false) === true;

		// Branch, tag
		if (historyItemRef.id.startsWith('refs/heads/') || historyItemRef.id.startsWith('refs/tags/')) {
			await repository.checkout(historyItemRef.name, { pullBeforeCheckout });
			return;
		}

		// Remote branch
		const branches = await repository.findTrackingBranches(historyItemRef.name);
		if (branches.length > 0) {
			await repository.checkout(branches[0].name!, { pullBeforeCheckout });
		} else {
			await repository.checkoutTracking(historyItemRef.name);
		}
	}

	@command('git.checkoutDetached', { repository: true })
	async checkoutDetached(repository: Repository, treeish?: string): Promise<boolean> {
		return this._checkout(repository, { detached: true, treeish });
	}

	@command('git.graph.checkoutDetached', { repository: true })
	async checkoutDetached2(repository: Repository, historyItem?: SourceControlHistoryItem): Promise<boolean> {
		if (!historyItem) {
			return false;
		}
		return this._checkout(repository, { detached: true, treeish: historyItem.id });
	}

	private async _checkout(repository: Repository, opts?: { detached?: boolean; treeish?: string }): Promise<boolean> {
		if (typeof opts?.treeish === 'string') {
			await repository.checkout(opts?.treeish, opts);
			return true;
		}

		const createBranch = new CreateBranchItem();
		const createBranchFrom = new CreateBranchFromItem();
		const checkoutDetached = new CheckoutDetachedItem();
		const picks: QuickPickItem[] = [];
		const commands: QuickPickItem[] = [];

		if (!opts?.detached) {
			commands.push(createBranch, createBranchFrom, checkoutDetached);
		}

		const disposables: Disposable[] = [];
		const quickPick = window.createQuickPick();
		quickPick.busy = true;
		quickPick.sortByLabel = false;
		quickPick.matchOnDetail = false;
		quickPick.placeholder = opts?.detached
			? l10n.t('Select a branch to checkout in detached mode')
			: l10n.t('Select a branch or tag to checkout');

		quickPick.show();
		picks.push(... await createCheckoutItems(repository, opts?.detached));

		const setQuickPickItems = () => {
			switch (true) {
				case quickPick.value === '':
					quickPick.items = [...commands, ...picks];
					break;
				case commands.length === 0:
					quickPick.items = picks;
					break;
				case picks.length === 0:
					quickPick.items = commands;
					break;
				default:
					quickPick.items = [...picks, { label: '', kind: QuickPickItemKind.Separator }, ...commands];
					break;
			}
		};

		setQuickPickItems();
		quickPick.busy = false;

		const choice = await new Promise<QuickPickItem | undefined>(c => {
			disposables.push(quickPick.onDidHide(() => c(undefined)));
			disposables.push(quickPick.onDidAccept(() => c(quickPick.activeItems[0])));
			disposables.push((quickPick.onDidTriggerItemButton((e) => {
				const button = e.button as QuickInputButton & { actual: RemoteSourceAction };
				const item = e.item as CheckoutItem;
				if (button.actual && item.refName) {
					button.actual.run(item.refRemote ? item.refName.substring(item.refRemote.length + 1) : item.refName);
				}

				c(undefined);
			})));
			disposables.push(quickPick.onDidChangeValue(() => setQuickPickItems()));
		});

		dispose(disposables);
		quickPick.dispose();

		if (!choice) {
			return false;
		}

		if (choice === createBranch) {
			await this._branch(repository, quickPick.value);
		} else if (choice === createBranchFrom) {
			await this._branch(repository, quickPick.value, true);
		} else if (choice === checkoutDetached) {
			return this._checkout(repository, { detached: true });
		} else {
			const item = choice as CheckoutItem;

			try {
				await item.run(repository, opts);
			} catch (err) {
				if (err.gitErrorCode !== GitErrorCodes.DirtyWorkTree && err.gitErrorCode !== GitErrorCodes.WorktreeBranchAlreadyUsed) {
					throw err;
				}

				if (err.gitErrorCode === GitErrorCodes.WorktreeBranchAlreadyUsed) {
					// Not checking out in a worktree (use standard error handling)
					if (!repository.dotGit.commonPath) {
						await this.handleWorktreeBranchAlreadyUsed(err);
						return false;
					}

					// Check out in a worktree (check if worktree's main repository is open in workspace and if branch is already checked out in main repository)
					const commonPath = path.dirname(repository.dotGit.commonPath);
					if (workspace.workspaceFolders && workspace.workspaceFolders.some(folder => pathEquals(folder.uri.fsPath, commonPath))) {
						const mainRepository = this.model.getRepository(commonPath);
						if (mainRepository && item.refName && item.refName.replace(`${item.refRemote}/`, '') === mainRepository.HEAD?.name) {
							const message = l10n.t('Branch "{0}" is already checked out in the current window.', item.refName);
							await window.showErrorMessage(message, { modal: true });
							return false;
						}
					}

					// Check out in a worktree, (branch is already checked out in existing worktree)
					await this.handleWorktreeBranchAlreadyUsed(err);
					return false;
				}

				const stash = l10n.t('Stash & Checkout');
				const migrate = l10n.t('Migrate Changes');
				const force = l10n.t('Force Checkout');
				const choice = await window.showWarningMessage(l10n.t('Your local changes would be overwritten by checkout.'), { modal: true }, stash, migrate, force);

				if (choice === force) {
					await this.cleanAll(repository);
					await item.run(repository, opts);
				} else if (choice === stash || choice === migrate) {
					if (await this._stash(repository, true)) {
						await item.run(repository, opts);

						if (choice === migrate) {
							await this.stashPopLatest(repository);
						}
					}
				}
			}
		}

		return true;
	}

	@command('git.branch', { repository: true })
	async branch(repository: Repository, historyItem?: SourceControlHistoryItem): Promise<void> {
		await this._branch(repository, undefined, false, historyItem?.id);
	}

	@command('git.branchFrom', { repository: true })
	async branchFrom(repository: Repository): Promise<void> {
		await this._branch(repository, undefined, true);
	}

	private async generateRandomBranchName(repository: Repository, separator: string): Promise<string> {
		const config = workspace.getConfiguration('git');
		const branchRandomNameDictionary = config.get<string[]>('branchRandomName.dictionary')!;

		const dictionaries: string[][] = [];
		for (const dictionary of branchRandomNameDictionary) {
			if (dictionary.toLowerCase() === 'adjectives') {
				dictionaries.push(adjectives);
			}
			if (dictionary.toLowerCase() === 'animals') {
				dictionaries.push(animals);
			}
			if (dictionary.toLowerCase() === 'colors') {
				dictionaries.push(colors);
			}
			if (dictionary.toLowerCase() === 'numbers') {
				dictionaries.push(NumberDictionary.generate({ length: 3 }));
			}
		}

		if (dictionaries.length === 0) {
			return '';
		}

		// 5 attempts to generate a random branch name
		for (let index = 0; index < 5; index++) {
			const randomName = uniqueNamesGenerator({
				dictionaries,
				length: dictionaries.length,
				separator
			});

			// Check for local ref conflict
			const refs = await repository.getRefs({ pattern: `refs/heads/${randomName}` });
			if (refs.length === 0) {
				return randomName;
			}
		}

		return '';
	}

	private async promptForBranchName(repository: Repository, defaultName?: string, initialValue?: string): Promise<string> {
		const config = workspace.getConfiguration('git');
		const branchPrefix = config.get<string>('branchPrefix')!;
		const branchWhitespaceChar = config.get<string>('branchWhitespaceChar')!;
		const branchValidationRegex = config.get<string>('branchValidationRegex')!;
		const branchRandomNameEnabled = config.get<boolean>('branchRandomName.enable', false);
		const refs = await repository.getRefs({ pattern: 'refs/heads' });

		if (defaultName) {
			return sanitizeBranchName(defaultName, branchWhitespaceChar);
		}

		const getBranchName = async (): Promise<string> => {
			const branchName = branchRandomNameEnabled ? await this.generateRandomBranchName(repository, branchWhitespaceChar) : '';
			return `${branchPrefix}${branchName}`;
		};

		const getValueSelection = (value: string): [number, number] | undefined => {
			return value.startsWith(branchPrefix) ? [branchPrefix.length, value.length] : undefined;
		};

		const getValidationMessage = (name: string): string | InputBoxValidationMessage | undefined => {
			const validateName = new RegExp(branchValidationRegex);
			const sanitizedName = sanitizeBranchName(name, branchWhitespaceChar);

			// Check if branch name already exists
			const existingBranch = refs.find(ref => ref.name === sanitizedName);
			if (existingBranch) {
				return l10n.t('Branch "{0}" already exists', sanitizedName);
			}

			if (validateName.test(sanitizedName)) {
				// If the sanitized name that we will use is different than what is
				// in the input box, show an info message to the user informing them
				// the branch name that will be used.
				return name === sanitizedName
					? undefined
					: {
						message: l10n.t('The new branch will be "{0}"', sanitizedName),
						severity: InputBoxValidationSeverity.Info
					};
			}

			return l10n.t('Branch name needs to match regex: {0}', branchValidationRegex);
		};

		const disposables: Disposable[] = [];
		const inputBox = window.createInputBox();

		inputBox.placeholder = l10n.t('Branch name');
		inputBox.prompt = l10n.t('Please provide a new branch name');

		inputBox.buttons = branchRandomNameEnabled ? [
			{
				iconPath: new ThemeIcon('refresh'),
				tooltip: l10n.t('Regenerate Branch Name'),
				location: QuickInputButtonLocation.Inline
			}
		] : [];

		inputBox.value = initialValue ?? await getBranchName();
		inputBox.valueSelection = getValueSelection(inputBox.value);
		inputBox.validationMessage = getValidationMessage(inputBox.value);
		inputBox.ignoreFocusOut = true;

		inputBox.show();

		const branchName = await new Promise<string | undefined>((resolve) => {
			disposables.push(inputBox.onDidHide(() => resolve(undefined)));
			disposables.push(inputBox.onDidAccept(() => resolve(inputBox.value)));
			disposables.push(inputBox.onDidChangeValue(value => {
				inputBox.validationMessage = getValidationMessage(value);
			}));
			disposables.push(inputBox.onDidTriggerButton(async () => {
				inputBox.value = await getBranchName();
				inputBox.valueSelection = getValueSelection(inputBox.value);
			}));
		});

		dispose(disposables);
		inputBox.dispose();

		return sanitizeBranchName(branchName || '', branchWhitespaceChar);
	}

	private async _branch(repository: Repository, defaultName?: string, from = false, target?: string): Promise<void> {
		target = target ?? 'HEAD';

		const config = workspace.getConfiguration('git');
		const showRefDetails = config.get<boolean>('showReferenceDetails') === true;
		const commitShortHashLength = config.get<number>('commitShortHashLength') ?? 7;

		if (from) {
			const getRefPicks = async () => {
				const refs = await repository.getRefs({ includeCommitDetails: showRefDetails });
				const refProcessors = new RefItemsProcessor(repository, [
					new RefProcessor(RefType.Head),
					new RefProcessor(RefType.RemoteHead),
					new RefProcessor(RefType.Tag)
				]);

				return [new HEADItem(repository, commitShortHashLength), ...refProcessors.processRefs(refs)];
			};

			const placeHolder = l10n.t('Select a ref to create the branch from');
			const choice = await window.showQuickPick(getRefPicks(), { placeHolder });

			if (!choice) {
				return;
			}

			if (choice instanceof RefItem && choice.refName) {
				target = choice.refName;
			}
		}

		const branchName = await this.promptForBranchName(repository, defaultName);

		if (!branchName) {
			return;
		}

		await repository.branch(branchName, true, target);
	}

	private async pickRef<T extends QuickPickItem>(items: Promise<T[]>, placeHolder: string): Promise<T | undefined> {
		const disposables: Disposable[] = [];
		const quickPick = window.createQuickPick<T>();

		quickPick.placeholder = placeHolder;
		quickPick.sortByLabel = false;
		quickPick.busy = true;

		quickPick.show();

		quickPick.items = await items;
		quickPick.busy = false;

		const choice = await new Promise<T | undefined>(resolve => {
			disposables.push(quickPick.onDidHide(() => resolve(undefined)));
			disposables.push(quickPick.onDidAccept(() => resolve(quickPick.activeItems[0])));
		});

		dispose(disposables);
		quickPick.dispose();

		return choice;
	}

	@command('git.deleteBranch', { repository: true })
	async deleteBranch(repository: Repository, name: string | undefined, force?: boolean): Promise<void> {
		await this._deleteBranch(repository, undefined, name, { remote: false, force });
	}

	@command('git.graph.deleteBranch', { repository: true })
	async deleteBranch2(repository: Repository, historyItem?: SourceControlHistoryItem, historyItemRefId?: string): Promise<void> {
		const historyItemRef = historyItem?.references?.find(r => r.id === historyItemRefId);
		if (!historyItemRef) {
			return;
		}

		// Local branch
		if (historyItemRef.id.startsWith('refs/heads/')) {
			if (historyItemRef.id === repository.historyProvider.currentHistoryItemRef?.id) {
				window.showInformationMessage(l10n.t('The active branch cannot be deleted.'));
				return;
			}

			await this._deleteBranch(repository, undefined, historyItemRef.name, { remote: false });
			return;
		}

		// Remote branch
		if (historyItemRef.id === repository.historyProvider.currentHistoryItemRemoteRef?.id) {
			window.showInformationMessage(l10n.t('The remote branch of the active branch cannot be deleted.'));
			return;
		}

		const index = historyItemRef.name.indexOf('/');
		if (index === -1) {
			return;
		}

		const remoteName = historyItemRef.name.substring(0, index);
		const refName = historyItemRef.name.substring(index + 1);

		await this._deleteBranch(repository, remoteName, refName, { remote: true });
	}

	@command('git.graph.compareWithRemote', { repository: true })
	async compareWithRemote(repository: Repository, historyItem?: SourceControlHistoryItem): Promise<void> {
		if (!historyItem || !repository.historyProvider.currentHistoryItemRemoteRef) {
			return;
		}

		await this._openChangesBetweenRefs(
			repository,
			{
				id: repository.historyProvider.currentHistoryItemRemoteRef.revision,
				displayId: repository.historyProvider.currentHistoryItemRemoteRef.name
			},
			{
				id: historyItem.id,
				displayId: getHistoryItemDisplayName(historyItem)
			});
	}

	@command('git.graph.compareWithMergeBase', { repository: true })
	async compareWithMergeBase(repository: Repository, historyItem?: SourceControlHistoryItem): Promise<void> {
		if (!historyItem || !repository.historyProvider.currentHistoryItemBaseRef) {
			return;
		}

		await this._openChangesBetweenRefs(
			repository,
			{
				id: repository.historyProvider.currentHistoryItemBaseRef.revision,
				displayId: repository.historyProvider.currentHistoryItemBaseRef.name
			},
			{
				id: historyItem.id,
				displayId: getHistoryItemDisplayName(historyItem)
			});
	}

	@command('git.graph.compareRef', { repository: true })
	async compareRef(repository: Repository, historyItem?: SourceControlHistoryItem): Promise<void> {
		if (!repository || !historyItem) {
			return;
		}

		const config = workspace.getConfiguration('git');
		const showRefDetails = config.get<boolean>('showReferenceDetails') === true;

		const getRefPicks = async () => {
			const refs = await repository.getRefs({ includeCommitDetails: showRefDetails });
			const processors = [
				new RefProcessor(RefType.Head, BranchItem),
				new RefProcessor(RefType.RemoteHead, BranchItem),
				new RefProcessor(RefType.Tag, BranchItem)
			];

			const itemsProcessor = new RefItemsProcessor(repository, processors);
			return itemsProcessor.processRefs(refs);
		};

		const placeHolder = l10n.t('Select a reference to compare with');
		const sourceRef = await this.pickRef(getRefPicks(), placeHolder);

		if (!(sourceRef instanceof BranchItem) || !sourceRef.ref.commit) {
			return;
		}

		await this._openChangesBetweenRefs(
			repository,
			{
				id: sourceRef.ref.commit,
				displayId: sourceRef.ref.name
			},
			{
				id: historyItem.id,
				displayId: getHistoryItemDisplayName(historyItem)
			});
	}

	private async _openChangesBetweenRefs(repository: Repository, ref1: { id: string | undefined; displayId: string | undefined }, ref2: { id: string | undefined; displayId: string | undefined }): Promise<void> {
		if (!repository || !ref1.id || !ref2.id) {
			return;
		}

		try {
			const changes = await repository.diffBetween2(ref1.id, ref2.id);

			if (changes.length === 0) {
				window.showInformationMessage(l10n.t('There are no changes between "{0}" and "{1}".', ref1.displayId ?? ref1.id, ref2.displayId ?? ref2.id));
				return;
			}

			const multiDiffSourceUri = Uri.from({ scheme: 'git-ref-compare', path: `${repository.root}/${ref1.id}..${ref2.id}` });
			const resources = changes.map(change => toMultiFileDiffEditorUris(change, ref1.id!, ref2.id!));

			await commands.executeCommand('_workbench.openMultiDiffEditor', {
				multiDiffSourceUri,
				title: `${ref1.displayId ?? ref1.id} \u2194 ${ref2.displayId ?? ref2.id}`,
				resources
			});
		} catch (err) {
			window.showErrorMessage(l10n.t('Failed to open changes between "{0}" and "{1}": {2}', ref1.displayId ?? ref1.id, ref2.displayId ?? ref2.id, err.message));
		}
	}

	@command('git.deleteRemoteBranch', { repository: true })
	async deleteRemoteBranch(repository: Repository): Promise<void> {
		await this._deleteBranch(repository, undefined, undefined, { remote: true });
	}

	private async _deleteBranch(repository: Repository, remote: string | undefined, name: string | undefined, options: { remote: boolean; force?: boolean }): Promise<void> {
		let run: (force?: boolean) => Promise<void>;

		const config = workspace.getConfiguration('git');
		const showRefDetails = config.get<boolean>('showReferenceDetails') === true;

		if (!options.remote && typeof name === 'string') {
			// Local branch
			run = force => repository.deleteBranch(name!, force);
		} else if (options.remote && typeof remote === 'string' && typeof name === 'string') {
			// Remote branch
			run = force => repository.deleteRemoteRef(remote, name!, { force });
		} else {
			const getBranchPicks = async () => {
				const pattern = options.remote ? 'refs/remotes' : 'refs/heads';
				const refs = await repository.getRefs({ pattern, includeCommitDetails: showRefDetails });
				const processors = options.remote
					? [new RefProcessor(RefType.RemoteHead, BranchDeleteItem)]
					: [new RefProcessor(RefType.Head, BranchDeleteItem)];

				const itemsProcessor = new RefItemsProcessor(repository, processors, {
					skipCurrentBranch: true,
					skipCurrentBranchRemote: true
				});

				return itemsProcessor.processRefs(refs);
			};

			const placeHolder = !options.remote
				? l10n.t('Select a branch to delete')
				: l10n.t('Select a remote branch to delete');

			const choice = await this.pickRef(getBranchPicks(), placeHolder);

			if (!(choice instanceof BranchDeleteItem) || !choice.refName) {
				return;
			}
			name = choice.refName;
			run = force => choice.run(repository, force);
		}

		try {
			await run(options.force);
		} catch (err) {
			if (err.gitErrorCode !== GitErrorCodes.BranchNotFullyMerged) {
				throw err;
			}

			const message = l10n.t('The branch "{0}" is not fully merged. Delete anyway?', name);
			const yes = l10n.t('Delete Branch');
			const pick = await window.showWarningMessage(message, { modal: true }, yes);

			if (pick === yes) {
				await run(true);
			}
		}
	}

	@command('git.renameBranch', { repository: true })
	async renameBranch(repository: Repository): Promise<void> {
		const currentBranchName = repository.HEAD && repository.HEAD.name;
		const branchName = await this.promptForBranchName(repository, undefined, currentBranchName);

		if (!branchName) {
			return;
		}

		try {
			await repository.renameBranch(branchName);
		} catch (err) {
			switch (err.gitErrorCode) {
				case GitErrorCodes.InvalidBranchName:
					window.showErrorMessage(l10n.t('Invalid branch name'));
					return;
				case GitErrorCodes.BranchAlreadyExists:
					window.showErrorMessage(l10n.t('A branch named "{0}" already exists', branchName));
					return;
				default:
					throw err;
			}
		}
	}

	@command('git.merge', { repository: true })
	async merge(repository: Repository): Promise<void> {
		const config = workspace.getConfiguration('git');
		const showRefDetails = config.get<boolean>('showReferenceDetails') === true;

		const getQuickPickItems = async (): Promise<QuickPickItem[]> => {
			const refs = await repository.getRefs({ includeCommitDetails: showRefDetails });
			const itemsProcessor = new RefItemsProcessor(repository, [
				new RefProcessor(RefType.Head, MergeItem),
				new RefProcessor(RefType.RemoteHead, MergeItem),
				new RefProcessor(RefType.Tag, MergeItem)
			], {
				skipCurrentBranch: true,
				skipCurrentBranchRemote: true
			});

			return itemsProcessor.processRefs(refs);
		};

		const placeHolder = l10n.t('Select a branch or tag to merge from');
		const choice = await this.pickRef(getQuickPickItems(), placeHolder);

		if (choice instanceof MergeItem) {
			await choice.run(repository);
		}
	}

	@command('git.mergeAbort', { repository: true })
	async abortMerge(repository: Repository): Promise<void> {
		await repository.mergeAbort();
	}

	@command('git.rebase', { repository: true })
	async rebase(repository: Repository): Promise<void> {
		const config = workspace.getConfiguration('git');
		const showRefDetails = config.get<boolean>('showReferenceDetails') === true;
		const commitShortHashLength = config.get<number>('commitShortHashLength') ?? 7;

		const getQuickPickItems = async (): Promise<QuickPickItem[]> => {
			const refs = await repository.getRefs({ includeCommitDetails: showRefDetails });
			const itemsProcessor = new RefItemsProcessor(repository, [
				new RefProcessor(RefType.Head, RebaseItem),
				new RefProcessor(RefType.RemoteHead, RebaseItem)
			], {
				skipCurrentBranch: true,
				skipCurrentBranchRemote: true
			});

			const quickPickItems = itemsProcessor.processRefs(refs);

			if (repository.HEAD?.upstream) {
				const upstreamRef = refs.find(ref => ref.type === RefType.RemoteHead &&
					ref.name === `${repository.HEAD!.upstream!.remote}/${repository.HEAD!.upstream!.name}`);

				if (upstreamRef) {
					quickPickItems.splice(0, 0, new RebaseUpstreamItem(upstreamRef, commitShortHashLength));
				}
			}

			return quickPickItems;
		};

		const placeHolder = l10n.t('Select a branch to rebase onto');
		const choice = await this.pickRef(getQuickPickItems(), placeHolder);

		if (choice instanceof RebaseItem) {
			await choice.run(repository);
		}
	}

	@command('git.createTag', { repository: true })
	async createTag(repository: Repository, historyItem?: SourceControlHistoryItem): Promise<void> {
		await this._createTag(repository, historyItem?.id);
	}

	@command('git.deleteTag', { repository: true })
	async deleteTag(repository: Repository): Promise<void> {
		const config = workspace.getConfiguration('git');
		const showRefDetails = config.get<boolean>('showReferenceDetails') === true;
		const commitShortHashLength = config.get<number>('commitShortHashLength') ?? 7;

		const tagPicks = async (): Promise<TagDeleteItem[] | QuickPickItem[]> => {
			const remoteTags = await repository.getRefs({ pattern: 'refs/tags', includeCommitDetails: showRefDetails });
			return remoteTags.length === 0
				? [{ label: l10n.t('$(info) This repository has no tags.') }]
				: remoteTags.map(ref => new TagDeleteItem(ref, commitShortHashLength));
		};

		const placeHolder = l10n.t('Select a tag to delete');
		const choice = await this.pickRef<TagDeleteItem | QuickPickItem>(tagPicks(), placeHolder);

		if (choice instanceof TagDeleteItem) {
			await choice.run(repository);
		}
	}

	@command('git.migrateWorktreeChanges', { repository: true, repositoryFilter: ['repository', 'submodule'] })
	async migrateWorktreeChanges(repository: Repository, worktreeUri?: Uri): Promise<void> {
		let worktreeRepository: Repository | undefined;
		if (worktreeUri !== undefined) {
			worktreeRepository = this.model.getRepository(worktreeUri);
		} else {
			const worktrees = await repository.getWorktrees();
			if (worktrees.length === 1) {
				worktreeRepository = this.model.getRepository(worktrees[0].path);
			} else {
				const worktreePicks = async (): Promise<WorktreeItem[] | QuickPickItem[]> => {
					return worktrees.length === 0
						? [{ label: l10n.t('$(info) This repository has no worktrees.') }]
						: worktrees.map(worktree => new WorktreeItem(worktree));
				};

				const placeHolder = l10n.t('Select a worktree to migrate changes from');
				const choice = await this.pickRef<WorktreeItem | QuickPickItem>(worktreePicks(), placeHolder);

				if (!choice || !(choice instanceof WorktreeItem)) {
					return;
				}

				worktreeRepository = this.model.getRepository(choice.worktree.path);
			}
		}

		if (!worktreeRepository || worktreeRepository.kind !== 'worktree') {
			return;
		}

		if (worktreeRepository.indexGroup.resourceStates.length === 0 &&
			worktreeRepository.workingTreeGroup.resourceStates.length === 0 &&
			worktreeRepository.untrackedGroup.resourceStates.length === 0) {
			await window.showInformationMessage(l10n.t('There are no changes in the selected worktree to migrate.'));
			return;
		}

		const worktreeChangedFilePaths = [
			...worktreeRepository.indexGroup.resourceStates,
			...worktreeRepository.workingTreeGroup.resourceStates,
			...worktreeRepository.untrackedGroup.resourceStates
		].map(resource => path.relative(worktreeRepository.root, resource.resourceUri.fsPath));

		const targetChangedFilePaths = [
			...repository.workingTreeGroup.resourceStates,
			...repository.untrackedGroup.resourceStates
		].map(resource => path.relative(repository.root, resource.resourceUri.fsPath));

		// Detect overlapping unstaged files in worktree stash and target repository
		const conflicts = worktreeChangedFilePaths.filter(path => targetChangedFilePaths.includes(path));

		// Check for 'LocalChangesOverwritten' error
		if (conflicts.length > 0) {
			const maxFilesShown = 5;
			const filesToShow = conflicts.slice(0, maxFilesShown);
			const remainingCount = conflicts.length - maxFilesShown;

			const fileList = filesToShow.join('\n ') +
				(remainingCount > 0 ? l10n.t('\n and {0} more file{1}...', remainingCount, remainingCount > 1 ? 's' : '') : '');

			const message = l10n.t('Your local changes to the following files would be overwritten by merge:\n {0}\n\nPlease stage, commit, or stash your changes in the repository before migrating changes.', fileList);
			await window.showErrorMessage(message, { modal: true });
			return;
		}

		if (worktreeUri === undefined) {
			// Non-interactive migration, do not show confirmation dialog
			const message = l10n.t('Proceed with migrating changes to the current repository?');
			const detail = l10n.t('This will apply the worktree\'s changes to this repository and discard changes in the worktree.\nThis is IRREVERSIBLE!');
			const proceed = l10n.t('Proceed');
			const pick = await window.showWarningMessage(message, { modal: true, detail }, proceed);
			if (pick !== proceed) {
				return;
			}
		}

		await worktreeRepository.createStash(undefined, true);
		const stashes = await worktreeRepository.getStashes();

		try {
			await repository.applyStash(stashes[0].index);
			worktreeRepository.dropStash(stashes[0].index);
		} catch (err) {
			if (err.gitErrorCode !== GitErrorCodes.StashConflict) {
				await worktreeRepository.popStash();
				throw err;
			}
			repository.isWorktreeMigrating = true;

			const message = l10n.t('There are merge conflicts from migrating changes. Please resolve them before committing.');
			const show = l10n.t('Show Changes');
			const choice = await window.showWarningMessage(message, show);
			if (choice === show) {
				await commands.executeCommand('workbench.view.scm');
			}
			worktreeRepository.dropStash(stashes[0].index);
		}
	}

	@command('git.openWorktreeMergeEditor')
	async openWorktreeMergeEditor(uri: Uri): Promise<void> {
		type InputData = { uri: Uri; title: string };
		const mergeUris = toMergeUris(uri);

		const current: InputData = { uri: mergeUris.ours, title: l10n.t('Workspace') };
		const incoming: InputData = { uri: mergeUris.theirs, title: l10n.t('Worktree') };

		await commands.executeCommand('_open.mergeEditor', {
			base: mergeUris.base,
			input1: current,
			input2: incoming,
			output: uri
		});
	}

	@command('git.createWorktreeWithDefaults', { repository: true, repositoryFilter: ['repository'] })
	async createWorktreeWithDefaults(
		repository: Repository,
		commitish: string = 'HEAD'
	): Promise<string | undefined> {
		const config = workspace.getConfiguration('git');
		const branchPrefix = config.get<string>('branchPrefix', '');

		// Generate branch name if not provided
		let branch = await this.generateRandomBranchName(repository, '-');
		if (!branch) {
			// Fallback to timestamp-based name if random generation fails
			const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
			branch = `${branchPrefix}worktree-${timestamp}`;
		}

		// Ensure branch name starts with prefix if configured
		if (branchPrefix && !branch.startsWith(branchPrefix)) {
			branch = branchPrefix + branch;
		}

		// Create worktree name from branch name
		const worktreeName = branch.startsWith(branchPrefix)
			? branch.substring(branchPrefix.length).replace(/\//g, '-')
			: branch.replace(/\//g, '-');

		// Determine default worktree path
		const defaultWorktreeRoot = this.globalState.get<string>(`${CommandCenter.WORKTREE_ROOT_KEY}:${repository.root}`);
		const defaultWorktreePath = defaultWorktreeRoot
			? path.join(defaultWorktreeRoot, worktreeName)
			: path.join(path.dirname(repository.root), `${path.basename(repository.root)}.worktrees`, worktreeName);

		// Check if worktree already exists at this path
		const existingWorktree = repository.worktrees.find(worktree =>
			pathEquals(path.normalize(worktree.path), path.normalize(defaultWorktreePath))
		);

		if (existingWorktree) {
			// Generate unique path by appending a number
			let counter = 1;
			let uniquePath = `${defaultWorktreePath}-${counter}`;
			while (repository.worktrees.some(wt => pathEquals(path.normalize(wt.path), path.normalize(uniquePath)))) {
				counter++;
				uniquePath = `${defaultWorktreePath}-${counter}`;
			}
			const finalWorktreePath = uniquePath;

			try {
				await repository.addWorktree({ path: finalWorktreePath, branch, commitish });

				// Update worktree root in global state
				const worktreeRoot = path.dirname(finalWorktreePath);
				if (worktreeRoot !== defaultWorktreeRoot) {
					this.globalState.update(`${CommandCenter.WORKTREE_ROOT_KEY}:${repository.root}`, worktreeRoot);
				}

				return finalWorktreePath;
			} catch (err) {
				// Return undefined on failure
				return undefined;
			}
		}

		try {
			await repository.addWorktree({ path: defaultWorktreePath, branch, commitish });

			// Update worktree root in global state
			const worktreeRoot = path.dirname(defaultWorktreePath);
			if (worktreeRoot !== defaultWorktreeRoot) {
				this.globalState.update(`${CommandCenter.WORKTREE_ROOT_KEY}:${repository.root}`, worktreeRoot);
			}

			return defaultWorktreePath;
		} catch (err) {
			// Return undefined on failure
			return undefined;
		}
	}

	@command('git.createWorktree', { repository: true })
	async createWorktree(repository?: Repository): Promise<void> {
		if (!repository) {
			// Single repository/submodule/worktree
			if (this.model.repositories.length === 1) {
				repository = this.model.repositories[0];
			}
		}

		if (!repository) {
			// Single repository/submodule
			const repositories = this.model.repositories
				.filter(r => r.kind === 'repository' || r.kind === 'submodule');

			if (repositories.length === 1) {
				repository = repositories[0];
			}
		}

		if (!repository) {
			// Multiple repositories/submodules
			repository = await this.model.pickRepository(['repository', 'submodule']);
		}

		if (!repository) {
			return;
		}

		await this._createWorktree(repository);
	}

	private async _createWorktree(repository: Repository): Promise<void> {
		const config = workspace.getConfiguration('git');
		const branchPrefix = config.get<string>('branchPrefix')!;
		const showRefDetails = config.get<boolean>('showReferenceDetails') === true;

		const createBranch = new CreateBranchItem();
		const getBranchPicks = async () => {
			const refs = await repository.getRefs({ includeCommitDetails: showRefDetails });
			const itemsProcessor = new RefItemsProcessor(repository, [
				new RefProcessor(RefType.Head),
				new RefProcessor(RefType.RemoteHead),
				new RefProcessor(RefType.Tag)
			]);
			const branchItems = itemsProcessor.processRefs(refs);
			return [createBranch, { label: '', kind: QuickPickItemKind.Separator }, ...branchItems];
		};

		const placeHolder = l10n.t('Select a branch or tag to create the new worktree from');
		const choice = await this.pickRef(getBranchPicks(), placeHolder);

		if (!choice) {
			return;
		}

		let branch: string | undefined = undefined;
		let commitish: string;

		if (choice === createBranch) {
			branch = await this.promptForBranchName(repository);

			if (!branch) {
				return;
			}

			commitish = 'HEAD';
		} else {
			if (!(choice instanceof RefItem) || !choice.refName) {
				return;
			}

			if (choice.refName === repository.HEAD?.name) {
				const message = l10n.t('Branch "{0}" is already checked out in the current repository.', choice.refName);
				const createBranch = l10n.t('Create New Branch');
				const pick = await window.showWarningMessage(message, { modal: true }, createBranch);

				if (pick === createBranch) {
					branch = await this.promptForBranchName(repository);

					if (!branch) {
						return;
					}

					commitish = 'HEAD';
				} else {
					return;
				}
			} else {
				// Check whether the selected branch is checked out in an existing worktree
				const worktree = repository.worktrees.find(worktree => worktree.ref === choice.refId);
				if (worktree) {
					const message = l10n.t('Branch "{0}" is already checked out in the worktree at "{1}".', choice.refName, worktree.path);
					await this.handleWorktreeConflict(worktree.path, message);
					return;
				}
				commitish = choice.refName;
			}
		}

		const worktreeName = ((branch ?? commitish).startsWith(branchPrefix)
			? (branch ?? commitish).substring(branchPrefix.length).replace(/\//g, '-')
			: (branch ?? commitish).replace(/\//g, '-'));

		// If user selects folder button, they manually select the worktree path through folder picker
		const getWorktreePath = async (): Promise<string | undefined> => {
			const worktreeRoot = this.globalState.get<string>(`${CommandCenter.WORKTREE_ROOT_KEY}:${repository.root}`);
			const defaultUri = worktreeRoot ? Uri.file(worktreeRoot) : Uri.file(path.dirname(repository.root));

			const uris = await window.showOpenDialog({
				defaultUri,
				canSelectFiles: false,
				canSelectFolders: true,
				canSelectMany: false,
				openLabel: l10n.t('Select as Worktree Destination'),
			});

			if (!uris || uris.length === 0) {
				return;
			}

			return path.join(uris[0].fsPath, worktreeName);
		};

		const getValueSelection = (value: string): [number, number] | undefined => {
			if (!value || !worktreeName) {
				return;
			}

			const start = value.length - worktreeName.length;
			return [start, value.length];
		};

		const getValidationMessage = (value: string): InputBoxValidationMessage | undefined => {
			const worktree = repository.worktrees.find(worktree => pathEquals(path.normalize(worktree.path), path.normalize(value)));
			return worktree ? {
				message: l10n.t('A worktree already exists at "{0}".', value),
				severity: InputBoxValidationSeverity.Warning
			} : undefined;
		};

		// Default worktree path is based on the last worktree location or a worktree folder for the repository
		const defaultWorktreeRoot = this.globalState.get<string>(`${CommandCenter.WORKTREE_ROOT_KEY}:${repository.root}`);
		const defaultWorktreePath = defaultWorktreeRoot
			? path.join(defaultWorktreeRoot, worktreeName)
			: path.join(path.dirname(repository.root), `${path.basename(repository.root)}.worktrees`, worktreeName);

		const disposables: Disposable[] = [];
		const inputBox = window.createInputBox();
		disposables.push(inputBox);

		inputBox.placeholder = l10n.t('Worktree path');
		inputBox.prompt = l10n.t('Please provide a worktree path');
		inputBox.value = defaultWorktreePath;
		inputBox.valueSelection = getValueSelection(inputBox.value);
		inputBox.validationMessage = getValidationMessage(inputBox.value);
		inputBox.ignoreFocusOut = true;
		inputBox.buttons = [
			{
				iconPath: new ThemeIcon('folder'),
				tooltip: l10n.t('Select Worktree Destination'),
				location: QuickInputButtonLocation.Inline
			}
		];

		inputBox.show();

		const worktreePath = await new Promise<string | undefined>((resolve) => {
			disposables.push(inputBox.onDidHide(() => resolve(undefined)));
			disposables.push(inputBox.onDidAccept(() => resolve(inputBox.value)));
			disposables.push(inputBox.onDidChangeValue(value => {
				inputBox.validationMessage = getValidationMessage(value);
			}));
			disposables.push(inputBox.onDidTriggerButton(async () => {
				inputBox.value = await getWorktreePath() ?? '';
				inputBox.valueSelection = getValueSelection(inputBox.value);
			}));
		});

		dispose(disposables);

		if (!worktreePath) {
			return;
		}

		try {
			await repository.addWorktree({ path: worktreePath, branch, commitish: commitish });

			// Update worktree root in global state
			const worktreeRoot = path.dirname(worktreePath);
			if (worktreeRoot !== defaultWorktreeRoot) {
				this.globalState.update(`${CommandCenter.WORKTREE_ROOT_KEY}:${repository.root}`, worktreeRoot);
			}
		} catch (err) {
			if (err instanceof GitError && err.gitErrorCode === GitErrorCodes.WorktreeAlreadyExists) {
				await this.handleWorktreeAlreadyExists(err);
			} else if (err instanceof GitError && err.gitErrorCode === GitErrorCodes.WorktreeBranchAlreadyUsed) {
				await this.handleWorktreeBranchAlreadyUsed(err);
			} else {
				throw err;
			}

			return;
		}
	}

	private async handleWorktreeBranchAlreadyUsed(err: GitError): Promise<void> {
		const match = err.stderr?.match(/fatal: '([^']+)' is already used by worktree at '([^']+)'/);

		if (!match) {
			return;
		}

		const [, branch, path] = match;
		const message = l10n.t('Branch "{0}" is already checked out in the worktree at "{1}".', branch, path);
		await this.handleWorktreeConflict(path, message);
	}

	private async handleWorktreeAlreadyExists(err: GitError): Promise<void> {
		const match = err.stderr?.match(/fatal: '([^']+)'/);

		if (!match) {
			return;
		}

		const [, path] = match;
		const message = l10n.t('A worktree already exists at "{0}".', path);
		await this.handleWorktreeConflict(path, message);
	}

	private async handleWorktreeConflict(path: string, message: string): Promise<void> {
		await this.model.openRepository(path, true);

		const worktreeRepository = this.model.getRepository(path);

		if (!worktreeRepository) {
			return;
		}

		const openWorktree = l10n.t('Open Worktree in Current Window');
		const openWorktreeInNewWindow = l10n.t('Open Worktree in New Window');
		const choice = await window.showWarningMessage(message, { modal: true }, openWorktree, openWorktreeInNewWindow);

		if (choice === openWorktree) {
			await this.openWorktreeInCurrentWindow(worktreeRepository);
		} else if (choice === openWorktreeInNewWindow) {
			await this.openWorktreeInNewWindow(worktreeRepository);
		}
		return;
	}

	@command('git.deleteWorktree', { repository: true, repositoryFilter: ['worktree'] })
	async deleteWorktree(repository: Repository): Promise<void> {
		if (!repository.dotGit.commonPath) {
			return;
		}

		const mainRepository = this.model.getRepository(path.dirname(repository.dotGit.commonPath));
		if (!mainRepository) {
			await window.showErrorMessage(l10n.t('You cannot delete the worktree you are currently in. Please switch to the main repository first.'), { modal: true });
			return;
		}

		try {
			await mainRepository.deleteWorktree(repository.root);

			// Dispose worktree repository
			this.model.disposeRepository(repository);
		} catch (err) {
			if (err.gitErrorCode === GitErrorCodes.WorktreeContainsChanges) {
				const forceDelete = l10n.t('Force Delete');
				const message = l10n.t('The worktree contains modified or untracked files. Do you want to force delete?');
				const choice = await window.showWarningMessage(message, { modal: true }, forceDelete);
				if (choice === forceDelete) {
					await mainRepository.deleteWorktree(repository.root, { force: true });

					// Dispose worktree repository
					this.model.disposeRepository(repository);
				}

				return;
			}

			throw err;
		}
	}

	@command('git.deleteWorktreeFromPalette', { repository: true, repositoryFilter: ['repository', 'submodule'] })
	async deleteWorktreeFromPalette(repository: Repository): Promise<void> {
		const worktreePicks = async (): Promise<WorktreeDeleteItem[] | QuickPickItem[]> => {
			const worktrees = await repository.getWorktrees();
			return worktrees.length === 0
				? [{ label: l10n.t('$(info) This repository has no worktrees.') }]
				: worktrees.map(worktree => new WorktreeDeleteItem(worktree));
		};

		const placeHolder = l10n.t('Select a worktree to delete');
		const choice = await this.pickRef<WorktreeDeleteItem | QuickPickItem>(worktreePicks(), placeHolder);

		if (choice instanceof WorktreeDeleteItem) {
			await choice.run(repository);
		}
	}

	@command('git.openWorktree', { repository: true })
	async openWorktreeInCurrentWindow(repository: Repository): Promise<void> {
		if (!repository) {
			return;
		}

		const uri = Uri.file(repository.root);
		await commands.executeCommand('vscode.openFolder', uri, { forceReuseWindow: true });
	}

	@command('git.openWorktreeInNewWindow', { repository: true })
	async openWorktreeInNewWindow(repository: Repository): Promise<void> {
		if (!repository) {
			return;
		}

		const uri = Uri.file(repository.root);
		await commands.executeCommand('vscode.openFolder', uri, { forceNewWindow: true });
	}

	@command('git.graph.deleteTag', { repository: true })
	async deleteTag2(repository: Repository, historyItem?: SourceControlHistoryItem, historyItemRefId?: string): Promise<void> {
		const historyItemRef = historyItem?.references?.find(r => r.id === historyItemRefId);
		if (!historyItemRef) {
			return;
		}

		await repository.deleteTag(historyItemRef.name);
	}

	@command('git.deleteRemoteTag', { repository: true })
	async deleteRemoteTag(repository: Repository): Promise<void> {
		const config = workspace.getConfiguration('git');
		const commitShortHashLength = config.get<number>('commitShortHashLength') ?? 7;

		const remotePicks = repository.remotes
			.filter(r => r.pushUrl !== undefined)
			.map(r => new RemoteItem(repository, r));

		if (remotePicks.length === 0) {
			window.showErrorMessage(l10n.t("Your repository has no remotes configured to push to."));
			return;
		}

		let remoteName = remotePicks[0].remoteName;
		if (remotePicks.length > 1) {
			const remotePickPlaceholder = l10n.t('Select a remote to delete a tag from');
			const remotePick = await window.showQuickPick(remotePicks, { placeHolder: remotePickPlaceholder });

			if (!remotePick) {
				return;
			}

			remoteName = remotePick.remoteName;
		}

		const remoteTagPicks = async (): Promise<RemoteTagDeleteItem[] | QuickPickItem[]> => {
			const remoteTagsRaw = await repository.getRemoteRefs(remoteName, { tags: true });

			// Deduplicate annotated and lightweight tags
			const remoteTagNames = new Set<string>();
			const remoteTags: Ref[] = [];

			for (const tag of remoteTagsRaw) {
				const tagName = (tag.name ?? '').replace(/\^{}$/, '');
				if (!remoteTagNames.has(tagName)) {
					remoteTags.push({ ...tag, name: tagName });
					remoteTagNames.add(tagName);
				}
			}

			return remoteTags.length === 0
				? [{ label: l10n.t('$(info) Remote "{0}" has no tags.', remoteName) }]
				: remoteTags.map(ref => new RemoteTagDeleteItem(ref, commitShortHashLength));
		};

		const tagPickPlaceholder = l10n.t('Select a remote tag to delete');
		const remoteTagPick = await window.showQuickPick<RemoteTagDeleteItem | QuickPickItem>(remoteTagPicks(), { placeHolder: tagPickPlaceholder });

		if (remoteTagPick instanceof RemoteTagDeleteItem) {
			await remoteTagPick.run(repository, remoteName);
		}
	}

	@command('git.fetch', { repository: true })
	async fetch(repository: Repository): Promise<void> {
		if (repository.remotes.length === 0) {
			window.showWarningMessage(l10n.t('This repository has no remotes configured to fetch from.'));
			return;
		}

		if (repository.remotes.length === 1) {
			await repository.fetchDefault();
			return;
		}

		const remoteItems: RemoteItem[] = repository.remotes.map(r => new RemoteItem(repository, r));

		if (repository.HEAD?.upstream?.remote) {
			// Move default remote to the top
			const defaultRemoteIndex = remoteItems
				.findIndex(r => r.remoteName === repository.HEAD!.upstream!.remote);

			if (defaultRemoteIndex !== -1) {
				remoteItems.splice(0, 0, ...remoteItems.splice(defaultRemoteIndex, 1));
			}
		}

		const quickpick = window.createQuickPick();
		quickpick.placeholder = l10n.t('Select a remote to fetch');
		quickpick.canSelectMany = false;
		quickpick.items = [...remoteItems, { label: '', kind: QuickPickItemKind.Separator }, new FetchAllRemotesItem(repository)];

		quickpick.show();
		const remoteItem = await new Promise<RemoteItem | FetchAllRemotesItem | undefined>(resolve => {
			quickpick.onDidAccept(() => resolve(quickpick.activeItems[0] as RemoteItem | FetchAllRemotesItem));
			quickpick.onDidHide(() => resolve(undefined));
		});
		quickpick.hide();

		if (!remoteItem) {
			return;
		}

		await remoteItem.run();
	}

	@command('git.fetchPrune', { repository: true })
	async fetchPrune(repository: Repository): Promise<void> {
		if (repository.remotes.length === 0) {
			window.showWarningMessage(l10n.t('This repository has no remotes configured to fetch from.'));
			return;
		}

		await repository.fetchPrune();
	}


	@command('git.fetchAll', { repository: true })
	async fetchAll(repository: Repository): Promise<void> {
		if (repository.remotes.length === 0) {
			window.showWarningMessage(l10n.t('This repository has no remotes configured to fetch from.'));
			return;
		}

		await repository.fetchAll();
	}

	@command('git.fetchRef', { repository: true })
	async fetchRef(repository: Repository, ref?: string): Promise<void> {
		ref = ref ?? repository?.historyProvider.currentHistoryItemRemoteRef?.id;
		if (!repository || !ref) {
			return;
		}

		const branch = await repository.getBranch(ref);
		await repository.fetch({ remote: branch.remote, ref: branch.name });
	}

	@command('git.pullFrom', { repository: true })
	async pullFrom(repository: Repository): Promise<void> {
		const config = workspace.getConfiguration('git');
		const commitShortHashLength = config.get<number>('commitShortHashLength') ?? 7;

		const remotes = repository.remotes;

		if (remotes.length === 0) {
			window.showWarningMessage(l10n.t('Your repository has no remotes configured to pull from.'));
			return;
		}

		let remoteName = remotes[0].name;
		if (remotes.length > 1) {
			const remotePicks = remotes.filter(r => r.fetchUrl !== undefined).map(r => ({ label: r.name, description: r.fetchUrl! }));
			const placeHolder = l10n.t('Pick a remote to pull the branch from');
			const remotePick = await window.showQuickPick(remotePicks, { placeHolder });

			if (!remotePick) {
				return;
			}

			remoteName = remotePick.label;
		}

		const getBranchPicks = async (): Promise<RefItem[]> => {
			const remoteRefs = await repository.getRefs({ pattern: `refs/remotes/${remoteName}/` });
			return remoteRefs.map(r => new RefItem(r, commitShortHashLength));
		};

		const branchPlaceHolder = l10n.t('Pick a branch to pull from');
		const branchPick = await this.pickRef(getBranchPicks(), branchPlaceHolder);

		if (!branchPick || !branchPick.refName) {
			return;
		}

		const remoteCharCnt = remoteName.length;
		await repository.pullFrom(false, remoteName, branchPick.refName.slice(remoteCharCnt + 1));
	}

	@command('git.pull', { repository: true })
	async pull(repository: Repository): Promise<void> {
		const remotes = repository.remotes;

		if (remotes.length === 0) {
			window.showWarningMessage(l10n.t('Your repository has no remotes configured to pull from.'));
			return;
		}

		await repository.pull(repository.HEAD);
	}

	@command('git.pullRebase', { repository: true })
	async pullRebase(repository: Repository): Promise<void> {
		const remotes = repository.remotes;

		if (remotes.length === 0) {
			window.showWarningMessage(l10n.t('Your repository has no remotes configured to pull from.'));
			return;
		}

		await repository.pullWithRebase(repository.HEAD);
	}

	@command('git.pullRef', { repository: true })
	async pullRef(repository: Repository, ref?: string): Promise<void> {
		ref = ref ?? repository?.historyProvider.currentHistoryItemRemoteRef?.id;
		if (!repository || !ref) {
			return;
		}

		const branch = await repository.getBranch(ref);
		await repository.pullFrom(false, branch.remote, branch.name);
	}

	private async _push(repository: Repository, pushOptions: PushOptions) {
		const remotes = repository.remotes;

		if (remotes.length === 0) {
			if (pushOptions.silent) {
				return;
			}

			const addRemote = l10n.t('Add Remote');
			const result = await window.showWarningMessage(l10n.t('Your repository has no remotes configured to push to.'), addRemote);

			if (result === addRemote) {
				await this.addRemote(repository);
			}

			return;
		}

		const config = workspace.getConfiguration('git', Uri.file(repository.root));
		let forcePushMode: ForcePushMode | undefined = undefined;

		if (pushOptions.forcePush) {
			if (!config.get<boolean>('allowForcePush')) {
				await window.showErrorMessage(l10n.t('Force push is not allowed, please enable it with the "git.allowForcePush" setting.'));
				return;
			}

			const useForcePushWithLease = config.get<boolean>('useForcePushWithLease') === true;
			const useForcePushIfIncludes = config.get<boolean>('useForcePushIfIncludes') === true;
			forcePushMode = useForcePushWithLease ? useForcePushIfIncludes ? ForcePushMode.ForceWithLeaseIfIncludes : ForcePushMode.ForceWithLease : ForcePushMode.Force;

			if (config.get<boolean>('confirmForcePush')) {
				const message = l10n.t('You are about to force push your changes, this can be destructive and could inadvertently overwrite changes made by others.\n\nAre you sure to continue?');
				const yes = l10n.t('OK');
				const neverAgain = l10n.t('OK, Don\'t Ask Again');
				const pick = await window.showWarningMessage(message, { modal: true }, yes, neverAgain);

				if (pick === neverAgain) {
					config.update('confirmForcePush', false, true);
				} else if (pick !== yes) {
					return;
				}
			}
		}

		if (pushOptions.pushType === PushType.PushFollowTags) {
			await repository.pushFollowTags(undefined, forcePushMode);
			return;
		}

		if (pushOptions.pushType === PushType.PushTags) {
			await repository.pushTags(undefined, forcePushMode);
		}

		if (!repository.HEAD || !repository.HEAD.name) {
			if (!pushOptions.silent) {
				window.showWarningMessage(l10n.t('Please check out a branch to push to a remote.'));
			}
			return;
		}

		if (pushOptions.pushType === PushType.Push) {
			try {
				await repository.push(repository.HEAD, forcePushMode);
			} catch (err) {
				if (err.gitErrorCode !== GitErrorCodes.NoUpstreamBranch) {
					throw err;
				}

				if (pushOptions.silent) {
					return;
				}

				if (this.globalState.get<boolean>('confirmBranchPublish', true)) {
					const branchName = repository.HEAD.name;
					const message = l10n.t('The branch "{0}" has no remote branch. Would you like to publish this branch?', branchName);
					const yes = l10n.t('OK');
					const neverAgain = l10n.t('OK, Don\'t Ask Again');
					const pick = await window.showWarningMessage(message, { modal: true }, yes, neverAgain);

					if (pick === yes || pick === neverAgain) {
						if (pick === neverAgain) {
							this.globalState.update('confirmBranchPublish', false);
						}
						await this.publish(repository);
					}
				} else {
					await this.publish(repository);
				}
			}
		} else {
			const branchName = repository.HEAD.name;
			if (!pushOptions.pushTo?.remote) {
				const addRemote = new AddRemoteItem(this);
				const picks = [...remotes.filter(r => r.pushUrl !== undefined).map(r => ({ label: r.name, description: r.pushUrl })), addRemote];
				const placeHolder = l10n.t('Pick a remote to publish the branch "{0}" to:', branchName);
				const choice = await window.showQuickPick(picks, { placeHolder });

				if (!choice) {
					return;
				}

				if (choice === addRemote) {
					const newRemote = await this.addRemote(repository);

					if (newRemote) {
						await repository.pushTo(newRemote, branchName, undefined, forcePushMode);
					}
				} else {
					await repository.pushTo(choice.label, branchName, undefined, forcePushMode);
				}
			} else {
				await repository.pushTo(pushOptions.pushTo.remote, pushOptions.pushTo.refspec || branchName, pushOptions.pushTo.setUpstream, forcePushMode);
			}
		}
	}

	@command('git.push', { repository: true })
	async push(repository: Repository): Promise<void> {
		await this._push(repository, { pushType: PushType.Push });
	}

	@command('git.pushForce', { repository: true })
	async pushForce(repository: Repository): Promise<void> {
		await this._push(repository, { pushType: PushType.Push, forcePush: true });
	}

	@command('git.pushWithTags', { repository: true })
	async pushFollowTags(repository: Repository): Promise<void> {
		await this._push(repository, { pushType: PushType.PushFollowTags });
	}

	@command('git.pushWithTagsForce', { repository: true })
	async pushFollowTagsForce(repository: Repository): Promise<void> {
		await this._push(repository, { pushType: PushType.PushFollowTags, forcePush: true });
	}

	@command('git.pushRef', { repository: true })
	async pushRef(repository: Repository): Promise<void> {
		if (!repository) {
			return;
		}

		await this._push(repository, { pushType: PushType.Push });
	}

	@command('git.cherryPick', { repository: true })
	async cherryPick(repository: Repository): Promise<void> {
		const hash = await window.showInputBox({
			placeHolder: l10n.t('Commit Hash'),
			prompt: l10n.t('Please provide the commit hash'),
			ignoreFocusOut: true
		});

		if (!hash) {
			return;
		}

		await repository.cherryPick(hash);
	}

	@command('git.graph.cherryPick', { repository: true })
	async cherryPick2(repository: Repository, historyItem?: SourceControlHistoryItem): Promise<void> {
		if (!historyItem) {
			return;
		}

		await repository.cherryPick(historyItem.id);
	}

	@command('git.cherryPickAbort', { repository: true })
	async cherryPickAbort(repository: Repository): Promise<void> {
		await repository.cherryPickAbort();
	}

	@command('git.pushTo', { repository: true })
	async pushTo(repository: Repository, remote?: string, refspec?: string, setUpstream?: boolean): Promise<void> {
		await this._push(repository, { pushType: PushType.PushTo, pushTo: { remote: remote, refspec: refspec, setUpstream: setUpstream } });
	}

	@command('git.pushToForce', { repository: true })
	async pushToForce(repository: Repository, remote?: string, refspec?: string, setUpstream?: boolean): Promise<void> {
		await this._push(repository, { pushType: PushType.PushTo, pushTo: { remote: remote, refspec: refspec, setUpstream: setUpstream }, forcePush: true });
	}

	@command('git.pushTags', { repository: true })
	async pushTags(repository: Repository): Promise<void> {
		await this._push(repository, { pushType: PushType.PushTags });
	}

	@command('git.addRemote', { repository: true })
	async addRemote(repository: Repository): Promise<string | undefined> {
		const url = await pickRemoteSource({
			providerLabel: provider => l10n.t('Add remote from {0}', provider.name),
			urlLabel: l10n.t('Add remote from URL')
		});

		if (!url) {
			return;
		}

		const resultName = await window.showInputBox({
			placeHolder: l10n.t('Remote name'),
			prompt: l10n.t('Please provide a remote name'),
			ignoreFocusOut: true,
			validateInput: (name: string) => {
				if (!sanitizeRemoteName(name)) {
					return l10n.t('Remote name format invalid');
				} else if (repository.remotes.find(r => r.name === name)) {
					return l10n.t('Remote "{0}" already exists.', name);
				}

				return null;
			}
		});

		const name = sanitizeRemoteName(resultName || '');

		if (!name) {
			return;
		}

		await repository.addRemote(name, url.trim());
		await repository.fetch({ remote: name });
		return name;
	}

	@command('git.removeRemote', { repository: true })
	async removeRemote(repository: Repository): Promise<void> {
		const remotes = repository.remotes;

		if (remotes.length === 0) {
			window.showErrorMessage(l10n.t('Your repository has no remotes.'));
			return;
		}

		const picks: RemoteItem[] = repository.remotes.map(r => new RemoteItem(repository, r));
		const placeHolder = l10n.t('Pick a remote to remove');

		const remote = await window.showQuickPick(picks, { placeHolder });

		if (!remote) {
			return;
		}

		await repository.removeRemote(remote.remoteName);
	}

	private async _sync(repository: Repository, rebase: boolean): Promise<void> {
		const HEAD = repository.HEAD;

		if (!HEAD) {
			return;
		} else if (!HEAD.upstream) {
			this._push(repository, { pushType: PushType.Push });
			return;
		}

		const remoteName = HEAD.remote || HEAD.upstream.remote;
		const remote = repository.remotes.find(r => r.name === remoteName);
		const isReadonly = remote && remote.isReadOnly;

		const config = workspace.getConfiguration('git');
		const shouldPrompt = !isReadonly && config.get<boolean>('confirmSync') === true;

		if (shouldPrompt) {
			const message = l10n.t('This action will pull and push commits from and to "{0}/{1}".', HEAD.upstream.remote, HEAD.upstream.name);
			const yes = l10n.t('OK');
			const neverAgain = l10n.t('OK, Don\'t Show Again');
			const pick = await window.showWarningMessage(message, { modal: true }, yes, neverAgain);

			if (pick === neverAgain) {
				await config.update('confirmSync', false, true);
			} else if (pick !== yes) {
				return;
			}
		}

		await repository.sync(HEAD, rebase);
	}

	@command('git.sync', { repository: true })
	async sync(repository: Repository): Promise<void> {
		const config = workspace.getConfiguration('git', Uri.file(repository.root));
		const rebase = config.get<boolean>('rebaseWhenSync', false) === true;

		try {
			await this._sync(repository, rebase);
		} catch (err) {
			if (/Cancelled/i.test(err && (err.message || err.stderr || ''))) {
				return;
			}

			throw err;
		}
	}

	@command('git._syncAll')
	async syncAll(): Promise<void> {
		await Promise.all(this.model.repositories.map(async repository => {
			const config = workspace.getConfiguration('git', Uri.file(repository.root));
			const rebase = config.get<boolean>('rebaseWhenSync', false) === true;

			const HEAD = repository.HEAD;

			if (!HEAD || !HEAD.upstream) {
				return;
			}

			await repository.sync(HEAD, rebase);
		}));
	}

	@command('git.syncRebase', { repository: true })
	async syncRebase(repository: Repository): Promise<void> {
		try {
			await this._sync(repository, true);
		} catch (err) {
			if (/Cancelled/i.test(err && (err.message || err.stderr || ''))) {
				return;
			}

			throw err;
		}
	}

	@command('git.publish', { repository: true })
	async publish(repository: Repository): Promise<void> {
		const branchName = repository.HEAD && repository.HEAD.name || '';
		const remotes = repository.remotes;

		if (remotes.length === 0) {
			const publishers = this.model.getRemoteSourcePublishers();

			if (publishers.length === 0) {
				window.showWarningMessage(l10n.t('Your repository has no remotes configured to publish to.'));
				return;
			}

			let publisher: RemoteSourcePublisher;

			if (publishers.length === 1) {
				publisher = publishers[0];
			} else {
				const picks = publishers
					.map(provider => ({ label: (provider.icon ? `$(${provider.icon}) ` : '') + l10n.t('Publish to {0}', provider.name), alwaysShow: true, provider }));
				const placeHolder = l10n.t('Pick a provider to publish the branch "{0}" to:', branchName);
				const choice = await window.showQuickPick(picks, { placeHolder });

				if (!choice) {
					return;
				}

				publisher = choice.provider;
			}

			await publisher.publishRepository(new ApiRepository(repository));
			this.model.firePublishEvent(repository, branchName);

			return;
		}

		if (remotes.length === 1) {
			await repository.pushTo(remotes[0].name, branchName, true);
			this.model.firePublishEvent(repository, branchName);

			return;
		}

		const addRemote = new AddRemoteItem(this);
		const picks = [...repository.remotes.map(r => ({ label: r.name, description: r.pushUrl })), addRemote];
		const placeHolder = l10n.t('Pick a remote to publish the branch "{0}" to:', branchName);
		const choice = await window.showQuickPick(picks, { placeHolder });

		if (!choice) {
			return;
		}

		if (choice === addRemote) {
			const newRemote = await this.addRemote(repository);

			if (newRemote) {
				await repository.pushTo(newRemote, branchName, true);

				this.model.firePublishEvent(repository, branchName);
			}
		} else {
			await repository.pushTo(choice.label, branchName, true);

			this.model.firePublishEvent(repository, branchName);
		}
	}

	@command('git.ignore')
	async ignore(...resourceStates: SourceControlResourceState[]): Promise<void> {
		resourceStates = resourceStates.filter(s => !!s);

		if (resourceStates.length === 0 || (resourceStates[0] && !(resourceStates[0].resourceUri instanceof Uri))) {
			const resource = this.getSCMResource();

			if (!resource) {
				return;
			}

			resourceStates = [resource];
		}

		const resources = resourceStates
			.filter(s => s instanceof Resource)
			.map(r => r.resourceUri);

		if (!resources.length) {
			return;
		}

		await this.runByRepository(resources, async (repository, resources) => repository.ignore(resources));
	}

	@command('git.revealInExplorer')
	async revealInExplorer(resourceState: SourceControlResourceState): Promise<void> {
		if (!resourceState) {
			return;
		}

		if (!(resourceState.resourceUri instanceof Uri)) {
			return;
		}

		await commands.executeCommand('revealInExplorer', resourceState.resourceUri);
	}

	@command('git.revealFileInOS.linux')
	@command('git.revealFileInOS.mac')
	@command('git.revealFileInOS.windows')
	async revealFileInOS(resourceState: SourceControlResourceState): Promise<void> {
		if (!resourceState) {
			return;
		}

		if (!(resourceState.resourceUri instanceof Uri)) {
			return;
		}

		await commands.executeCommand('revealFileInOS', resourceState.resourceUri);
	}

	private async _stash(repository: Repository, includeUntracked = false, staged = false): Promise<boolean> {
		const noUnstagedChanges = repository.workingTreeGroup.resourceStates.length === 0
			&& (!includeUntracked || repository.untrackedGroup.resourceStates.length === 0);
		const noStagedChanges = repository.indexGroup.resourceStates.length === 0;

		if (staged) {
			if (noStagedChanges) {
				window.showInformationMessage(l10n.t('There are no staged changes to stash.'));
				return false;
			}
		} else {
			if (noUnstagedChanges && noStagedChanges) {
				window.showInformationMessage(l10n.t('There are no changes to stash.'));
				return false;
			}
		}

		const config = workspace.getConfiguration('git', Uri.file(repository.root));
		const promptToSaveFilesBeforeStashing = config.get<'always' | 'staged' | 'never'>('promptToSaveFilesBeforeStash');

		if (promptToSaveFilesBeforeStashing !== 'never') {
			let documents = workspace.textDocuments
				.filter(d => !d.isUntitled && d.isDirty && isDescendant(repository.root, d.uri.fsPath));

			if (promptToSaveFilesBeforeStashing === 'staged' || repository.indexGroup.resourceStates.length > 0) {
				documents = documents
					.filter(d => repository.indexGroup.resourceStates.some(s => pathEquals(s.resourceUri.fsPath, d.uri.fsPath)));
			}

			if (documents.length > 0) {
				const message = documents.length === 1
					? l10n.t('The following file has unsaved changes which won\'t be included in the stash if you proceed: {0}.\n\nWould you like to save it before stashing?', path.basename(documents[0].uri.fsPath))
					: l10n.t('There are {0} unsaved files.\n\nWould you like to save them before stashing?', documents.length);
				const saveAndStash = l10n.t('Save All & Stash');
				const stash = l10n.t('Stash Anyway');
				const pick = await window.showWarningMessage(message, { modal: true }, saveAndStash, stash);

				if (pick === saveAndStash) {
					await Promise.all(documents.map(d => d.save()));
				} else if (pick !== stash) {
					return false; // do not stash on cancel
				}
			}
		}

		let message: string | undefined;

		if (config.get<boolean>('useCommitInputAsStashMessage') && (!repository.sourceControl.commitTemplate || repository.inputBox.value !== repository.sourceControl.commitTemplate)) {
			message = repository.inputBox.value;
		}

		message = await window.showInputBox({
			value: message,
			prompt: l10n.t('Optionally provide a stash message'),
			placeHolder: l10n.t('Stash message')
		});

		if (typeof message === 'undefined') {
			return false;
		}

		try {
			await repository.createStash(message, includeUntracked, staged);
			return true;
		} catch (err) {
			if (/You do not have the initial commit yet/.test(err.stderr || '')) {
				window.showInformationMessage(l10n.t('The repository does not have any commits. Please make an initial commit before creating a stash.'));
				return false;
			}

			throw err;
		}
	}

	@command('git.stash', { repository: true })
	async stash(repository: Repository): Promise<boolean> {
		const result = await this._stash(repository);
		return result;
	}

	@command('git.stashStaged', { repository: true })
	async stashStaged(repository: Repository): Promise<boolean> {
		const result = await this._stash(repository, false, true);
		return result;
	}

	@command('git.stashIncludeUntracked', { repository: true })
	async stashIncludeUntracked(repository: Repository): Promise<boolean> {
		const result = await this._stash(repository, true);
		return result;
	}

	@command('git.stashPop', { repository: true })
	async stashPop(repository: Repository): Promise<void> {
		const placeHolder = l10n.t('Pick a stash to pop');
		const stash = await this.pickStash(repository, placeHolder);

		if (!stash) {
			return;
		}

		await repository.popStash(stash.index);
	}

	@command('git.stashPopLatest', { repository: true })
	async stashPopLatest(repository: Repository): Promise<void> {
		const stashes = await repository.getStashes();

		if (stashes.length === 0) {
			window.showInformationMessage(l10n.t('There are no stashes in the repository.'));
			return;
		}

		await repository.popStash();
	}

	@command('git.stashPopEditor')
	async stashPopEditor(uri: Uri): Promise<void> {
		const result = await this.getStashFromUri(uri);
		if (!result) {
			return;
		}

		await commands.executeCommand('workbench.action.closeActiveEditor');
		await result.repository.popStash(result.stash.index);
	}

	@command('git.stashApply', { repository: true })
	async stashApply(repository: Repository): Promise<void> {
		const placeHolder = l10n.t('Pick a stash to apply');
		const stash = await this.pickStash(repository, placeHolder);

		if (!stash) {
			return;
		}

		await repository.applyStash(stash.index);
	}

	@command('git.stashApplyLatest', { repository: true })
	async stashApplyLatest(repository: Repository): Promise<void> {
		const stashes = await repository.getStashes();

		if (stashes.length === 0) {
			window.showInformationMessage(l10n.t('There are no stashes in the repository.'));
			return;
		}

		await repository.applyStash();
	}

	@command('git.stashApplyEditor')
	async stashApplyEditor(uri: Uri): Promise<void> {
		const result = await this.getStashFromUri(uri);
		if (!result) {
			return;
		}

		await commands.executeCommand('workbench.action.closeActiveEditor');
		await result.repository.applyStash(result.stash.index);
	}

	@command('git.stashDrop', { repository: true })
	async stashDrop(repository: Repository): Promise<void> {
		const placeHolder = l10n.t('Pick a stash to drop');
		const stash = await this.pickStash(repository, placeHolder);

		if (!stash) {
			return;
		}

		await this._stashDrop(repository, stash);
	}

	@command('git.stashDropAll', { repository: true })
	async stashDropAll(repository: Repository): Promise<void> {
		const stashes = await repository.getStashes();

		if (stashes.length === 0) {
			window.showInformationMessage(l10n.t('There are no stashes in the repository.'));
			return;
		}

		// request confirmation for the operation
		const yes = l10n.t('Yes');
		const question = stashes.length === 1 ?
			l10n.t('Are you sure you want to drop ALL stashes? There is 1 stash that will be subject to pruning, and MAY BE IMPOSSIBLE TO RECOVER.') :
			l10n.t('Are you sure you want to drop ALL stashes? There are {0} stashes that will be subject to pruning, and MAY BE IMPOSSIBLE TO RECOVER.', stashes.length);

		const result = await window.showWarningMessage(question, { modal: true }, yes);
		if (result !== yes) {
			return;
		}

		await repository.dropStash();
	}

	@command('git.stashDropEditor')
	async stashDropEditor(uri: Uri): Promise<void> {
		const result = await this.getStashFromUri(uri);
		if (!result) {
			return;
		}

		if (await this._stashDrop(result.repository, result.stash)) {
			await commands.executeCommand('workbench.action.closeActiveEditor');
		}
	}

	async _stashDrop(repository: Repository, stash: Stash): Promise<boolean> {
		const yes = l10n.t('Yes');
		const result = await window.showWarningMessage(
			l10n.t('Are you sure you want to drop the stash: {0}?', stash.description),
			{ modal: true },
			yes
		);
		if (result !== yes) {
			return false;
		}

		await repository.dropStash(stash.index);
		return true;
	}

	@command('git.stashView', { repository: true })
	async stashView(repository: Repository): Promise<void> {
		const placeHolder = l10n.t('Pick a stash to view');
		const stash = await this.pickStash(repository, placeHolder);

		if (!stash) {
			return;
		}

		const stashChanges = await repository.showStash(stash.index);
		if (!stashChanges || stashChanges.length === 0) {
			return;
		}

		// A stash commit can have up to 3 parents:
		// 1. The first parent is the commit that was HEAD when the stash was created.
		// 2. The second parent is the commit that represents the index when the stash was created.
		// 3. The third parent (when present) represents the untracked files when the stash was created.
		const stashFirstParentCommit = stash.parents.length > 0 ? stash.parents[0] : `${stash.hash}^`;
		const stashUntrackedFilesParentCommit = stash.parents.length === 3 ? stash.parents[2] : undefined;
		const stashUntrackedFiles: string[] = [];

		if (stashUntrackedFilesParentCommit) {
			const untrackedFiles = await repository.getObjectFiles(stashUntrackedFilesParentCommit);
			stashUntrackedFiles.push(...untrackedFiles.map(f => path.join(repository.root, f.file)));
		}

		const title = `Git Stash #${stash.index}: ${stash.description}`;
		const multiDiffSourceUri = toGitUri(Uri.file(repository.root), `stash@{${stash.index}}`, { scheme: 'git-stash' });

		const resources: { originalUri: Uri | undefined; modifiedUri: Uri | undefined }[] = [];
		for (const change of stashChanges) {
			const isChangeUntracked = !!stashUntrackedFiles.find(f => pathEquals(f, change.uri.fsPath));
			const modifiedUriRef = !isChangeUntracked ? stash.hash : stashUntrackedFilesParentCommit ?? stash.hash;

			resources.push(toMultiFileDiffEditorUris(change, stashFirstParentCommit, modifiedUriRef));
		}

		commands.executeCommand('_workbench.openMultiDiffEditor', { multiDiffSourceUri, title, resources });
	}

	private async pickStash(repository: Repository, placeHolder: string): Promise<Stash | undefined> {
		const getStashQuickPickItems = async (): Promise<StashItem[] | QuickPickItem[]> => {
			const stashes = await repository.getStashes();
			return stashes.length > 0 ?
				stashes.map(stash => new StashItem(stash)) :
				[{ label: l10n.t('$(info) This repository has no stashes.') }];
		};

		const result = await window.showQuickPick<StashItem | QuickPickItem>(getStashQuickPickItems(), { placeHolder });
		return result instanceof StashItem ? result.stash : undefined;
	}

	private async getStashFromUri(uri: Uri | undefined): Promise<{ repository: Repository; stash: Stash } | undefined> {
		if (!uri || uri.scheme !== 'git-stash') {
			return undefined;
		}

		const stashUri = fromGitUri(uri);

		// Repository
		const repository = this.model.getRepository(stashUri.path);
		if (!repository) {
			return undefined;
		}

		// Stash
		const regex = /^stash@{(\d+)}$/;
		const match = regex.exec(stashUri.ref);
		if (!match) {
			return undefined;
		}

		const [, index] = match;
		const stashes = await repository.getStashes();
		const stash = stashes.find(stash => stash.index === parseInt(index));
		if (!stash) {
			return undefined;
		}

		return { repository, stash };
	}

	@command('git.timeline.openDiff', { repository: false })
	async timelineOpenDiff(item: TimelineItem, uri: Uri | undefined, _source: string) {
		const cmd = this.resolveTimelineOpenDiffCommand(
			item, uri,
			{
				preserveFocus: true,
				preview: true,
				viewColumn: ViewColumn.Active
			},
		);
		if (cmd === undefined) {
			return undefined;
		}

		return commands.executeCommand(cmd.command, ...(cmd.arguments ?? []));
	}

	resolveTimelineOpenDiffCommand(item: TimelineItem, uri: Uri | undefined, options?: TextDocumentShowOptions): Command | undefined {
		if (uri === undefined || uri === null || !GitTimelineItem.is(item)) {
			return undefined;
		}

		const basename = path.basename(uri.fsPath);

		let title;
		if ((item.previousRef === 'HEAD' || item.previousRef === '~') && item.ref === '') {
			title = l10n.t('{0} (Working Tree)', basename);
		}
		else if (item.previousRef === 'HEAD' && item.ref === '~') {
			title = l10n.t('{0} (Index)', basename);
		} else {
			title = l10n.t('{0} ({1}) \u2194 {0} ({2})', basename, item.shortPreviousRef, item.shortRef);
		}

		return {
			command: 'vscode.diff',
			title: l10n.t('Open Comparison'),
			arguments: [toGitUri(uri, item.previousRef), item.ref === '' ? uri : toGitUri(uri, item.ref), title, options]
		};
	}

	@command('git.timeline.viewCommit', { repository: false })
	async timelineViewCommit(item: TimelineItem, uri: Uri | undefined, _source: string) {
		if (!GitTimelineItem.is(item)) {
			return;
		}

		const cmd = await this._resolveTimelineOpenCommitCommand(
			item, uri,
			{
				preserveFocus: true,
				preview: true,
				viewColumn: ViewColumn.Active
			},
		);
		if (cmd === undefined) {
			return undefined;
		}

		return commands.executeCommand(cmd.command, ...(cmd.arguments ?? []));
	}

	private async _resolveTimelineOpenCommitCommand(item: TimelineItem, uri: Uri | undefined, options?: TextDocumentShowOptions): Promise<Command | undefined> {
		if (uri === undefined || uri === null || !GitTimelineItem.is(item)) {
			return undefined;
		}

		const repository = await this.model.getRepository(uri.fsPath);
		if (!repository) {
			return undefined;
		}

		const commit = await repository.getCommit(item.ref);
		const commitParentId = commit.parents.length > 0 ? commit.parents[0] : await repository.getEmptyTree();
		const changes = await repository.diffBetween2(commitParentId, commit.hash);
		const resources = changes.map(c => toMultiFileDiffEditorUris(c, commitParentId, commit.hash));

		const title = `${item.shortRef} - ${subject(commit.message)}`;
		const multiDiffSourceUri = Uri.from({ scheme: 'scm-history-item', path: `${repository.root}/${commitParentId}..${commit.hash}` });
		const reveal = { modifiedUri: toGitUri(uri, commit.hash) };

		return {
			command: '_workbench.openMultiDiffEditor',
			title: l10n.t('Open Commit'),
			arguments: [{ multiDiffSourceUri, title, resources, reveal }, options]
		};
	}

	@command('git.timeline.copyCommitId', { repository: false })
	async timelineCopyCommitId(item: TimelineItem, _uri: Uri | undefined, _source: string) {
		if (!GitTimelineItem.is(item)) {
			return;
		}

		env.clipboard.writeText(item.ref);
	}

	@command('git.timeline.copyCommitMessage', { repository: false })
	async timelineCopyCommitMessage(item: TimelineItem, _uri: Uri | undefined, _source: string) {
		if (!GitTimelineItem.is(item)) {
			return;
		}

		env.clipboard.writeText(item.message);
	}

	private _selectedForCompare: { uri: Uri; item: GitTimelineItem } | undefined;

	@command('git.timeline.selectForCompare', { repository: false })
	async timelineSelectForCompare(item: TimelineItem, uri: Uri | undefined, _source: string) {
		if (!GitTimelineItem.is(item) || !uri) {
			return;
		}

		this._selectedForCompare = { uri, item };
		await commands.executeCommand('setContext', 'git.timeline.selectedForCompare', true);
	}

	@command('git.timeline.compareWithSelected', { repository: false })
	async timelineCompareWithSelected(item: TimelineItem, uri: Uri | undefined, _source: string) {
		if (!GitTimelineItem.is(item) || !uri || !this._selectedForCompare || uri.toString() !== this._selectedForCompare.uri.toString()) {
			return;
		}

		const { item: selected } = this._selectedForCompare;

		const basename = path.basename(uri.fsPath);
		let leftTitle;
		if ((selected.previousRef === 'HEAD' || selected.previousRef === '~') && selected.ref === '') {
			leftTitle = l10n.t('{0} (Working Tree)', basename);
		}
		else if (selected.previousRef === 'HEAD' && selected.ref === '~') {
			leftTitle = l10n.t('{0} (Index)', basename);
		} else {
			leftTitle = l10n.t('{0} ({1})', basename, selected.shortRef);
		}

		let rightTitle;
		if ((item.previousRef === 'HEAD' || item.previousRef === '~') && item.ref === '') {
			rightTitle = l10n.t('{0} (Working Tree)', basename);
		}
		else if (item.previousRef === 'HEAD' && item.ref === '~') {
			rightTitle = l10n.t('{0} (Index)', basename);
		} else {
			rightTitle = l10n.t('{0} ({1})', basename, item.shortRef);
		}


		const title = l10n.t('{0} \u2194 {1}', leftTitle, rightTitle);
		await commands.executeCommand('vscode.diff', selected.ref === '' ? uri : toGitUri(uri, selected.ref), item.ref === '' ? uri : toGitUri(uri, item.ref), title);
	}

	@command('git.rebaseAbort', { repository: true })
	async rebaseAbort(repository: Repository): Promise<void> {
		if (repository.rebaseCommit) {
			await repository.rebaseAbort();
		} else {
			await window.showInformationMessage(l10n.t('No rebase in progress.'));
		}
	}

	@command('git.closeAllDiffEditors', { repository: true })
	closeDiffEditors(repository: Repository): void {
		repository.closeDiffEditors(undefined, undefined, true);
	}

	@command('git.closeAllUnmodifiedEditors')
	closeUnmodifiedEditors(): void {
		const editorTabsToClose: Tab[] = [];

		// Collect all modified files
		const modifiedFiles: string[] = [];
		for (const repository of this.model.repositories) {
			modifiedFiles.push(...repository.indexGroup.resourceStates.map(r => r.resourceUri.fsPath));
			modifiedFiles.push(...repository.workingTreeGroup.resourceStates.map(r => r.resourceUri.fsPath));
			modifiedFiles.push(...repository.untrackedGroup.resourceStates.map(r => r.resourceUri.fsPath));
			modifiedFiles.push(...repository.mergeGroup.resourceStates.map(r => r.resourceUri.fsPath));
		}

		// Collect all editor tabs that are not dirty and not modified
		for (const tab of window.tabGroups.all.map(g => g.tabs).flat()) {
			if (tab.isDirty) {
				continue;
			}

			if (tab.input instanceof TabInputText || tab.input instanceof TabInputNotebook) {
				const { uri } = tab.input;
				if (!modifiedFiles.find(p => pathEquals(p, uri.fsPath))) {
					editorTabsToClose.push(tab);
				}
			}
		}

		// Close editors
		window.tabGroups.close(editorTabsToClose, true);
	}

	@command('git.openRepositoriesInParentFolders')
	async openRepositoriesInParentFolders(): Promise<void> {
		const parentRepositories: string[] = [];

		const title = l10n.t('Open Repositories In Parent Folders');
		const placeHolder = l10n.t('Pick a repository to open');

		const allRepositoriesLabel = l10n.t('All Repositories');
		const allRepositoriesQuickPickItem: QuickPickItem = { label: allRepositoriesLabel };
		const repositoriesQuickPickItems: QuickPickItem[] = this.model.parentRepositories
			.sort(compareRepositoryLabel).map(r => new RepositoryItem(r));

		const items = this.model.parentRepositories.length === 1 ? [...repositoriesQuickPickItems] :
			[...repositoriesQuickPickItems, { label: '', kind: QuickPickItemKind.Separator }, allRepositoriesQuickPickItem];

		const repositoryItem = await window.showQuickPick(items, { title, placeHolder });
		if (!repositoryItem) {
			return;
		}

		if (repositoryItem === allRepositoriesQuickPickItem) {
			// All Repositories
			parentRepositories.push(...this.model.parentRepositories);
		} else {
			// One Repository
			parentRepositories.push((repositoryItem as RepositoryItem).path);
		}

		for (const parentRepository of parentRepositories) {
			await this.model.openParentRepository(parentRepository);
		}
	}

	@command('git.manageUnsafeRepositories')
	async manageUnsafeRepositories(): Promise<void> {
		const unsafeRepositories: string[] = [];

		const quickpick = window.createQuickPick();
		quickpick.title = l10n.t('Manage Unsafe Repositories');
		quickpick.placeholder = l10n.t('Pick a repository to mark as safe and open');

		const allRepositoriesLabel = l10n.t('All Repositories');
		const allRepositoriesQuickPickItem: QuickPickItem = { label: allRepositoriesLabel };
		const repositoriesQuickPickItems: QuickPickItem[] = this.model.unsafeRepositories
			.sort(compareRepositoryLabel).map(r => new RepositoryItem(r));

		quickpick.items = this.model.unsafeRepositories.length === 1 ? [...repositoriesQuickPickItems] :
			[...repositoriesQuickPickItems, { label: '', kind: QuickPickItemKind.Separator }, allRepositoriesQuickPickItem];

		quickpick.show();
		const repositoryItem = await new Promise<RepositoryItem | QuickPickItem | undefined>(
			resolve => {
				quickpick.onDidAccept(() => resolve(quickpick.activeItems[0]));
				quickpick.onDidHide(() => resolve(undefined));
			});
		quickpick.hide();

		if (!repositoryItem) {
			return;
		}

		if (repositoryItem.label === allRepositoriesLabel) {
			// All Repositories
			unsafeRepositories.push(...this.model.unsafeRepositories);
		} else {
			// One Repository
			unsafeRepositories.push((repositoryItem as RepositoryItem).path);
		}

		for (const unsafeRepository of unsafeRepositories) {
			// Mark as Safe
			await this.git.addSafeDirectory(this.model.getUnsafeRepositoryPath(unsafeRepository)!);

			// Open Repository
			await this.model.openRepository(unsafeRepository);
			this.model.deleteUnsafeRepository(unsafeRepository);
		}
	}

	@command('git.viewChanges', { repository: true })
	async viewChanges(repository: Repository): Promise<void> {
		await this._viewResourceGroupChanges(repository, repository.workingTreeGroup);
	}

	@command('git.viewStagedChanges', { repository: true })
	async viewStagedChanges(repository: Repository): Promise<void> {
		await this._viewResourceGroupChanges(repository, repository.indexGroup);
	}

	@command('git.viewUntrackedChanges', { repository: true })
	async viewUnstagedChanges(repository: Repository): Promise<void> {
		await this._viewResourceGroupChanges(repository, repository.untrackedGroup);
	}

	private async _viewResourceGroupChanges(repository: Repository, resourceGroup: GitResourceGroup): Promise<void> {
		if (resourceGroup.resourceStates.length === 0) {
			switch (resourceGroup.id) {
				case 'index':
					window.showInformationMessage(l10n.t('The repository does not have any staged changes.'));
					break;
				case 'workingTree':
					window.showInformationMessage(l10n.t('The repository does not have any changes.'));
					break;
				case 'untracked':
					window.showInformationMessage(l10n.t('The repository does not have any untracked changes.'));
					break;
			}
			return;
		}

		await commands.executeCommand('_workbench.openScmMultiDiffEditor', {
			title: `${repository.sourceControl.label}: ${resourceGroup.label}`,
			repositoryUri: Uri.file(repository.root),
			resourceGroupId: resourceGroup.id
		});
	}

	@command('git.copyCommitId', { repository: true })
	async copyCommitId(repository: Repository, historyItem: SourceControlHistoryItem): Promise<void> {
		if (!repository || !historyItem) {
			return;
		}

		env.clipboard.writeText(historyItem.id);
	}

	@command('git.copyCommitMessage', { repository: true })
	async copyCommitMessage(repository: Repository, historyItem: SourceControlHistoryItem): Promise<void> {
		if (!repository || !historyItem) {
			return;
		}

		env.clipboard.writeText(historyItem.message);
	}

	@command('git.viewCommit', { repository: true })
	async viewCommit(repository: Repository, historyItemId: string, revealUri?: Uri): Promise<void> {
		if (!repository || !historyItemId) {
			return;
		}

		const rootUri = Uri.file(repository.root);
		const config = workspace.getConfiguration('git', rootUri);
		const commitShortHashLength = config.get<number>('commitShortHashLength', 7);

		const commit = await repository.getCommit(historyItemId);
		const title = `${truncate(historyItemId, commitShortHashLength, false)} - ${subject(commit.message)}`;
		const historyItemParentId = commit.parents.length > 0 ? commit.parents[0] : await repository.getEmptyTree();

		const multiDiffSourceUri = Uri.from({ scheme: 'scm-history-item', path: `${repository.root}/${historyItemParentId}..${historyItemId}` });

		const changes = await repository.diffBetween2(historyItemParentId, historyItemId);
		const resources = changes.map(c => toMultiFileDiffEditorUris(c, historyItemParentId, historyItemId));
		const reveal = revealUri ? { modifiedUri: toGitUri(revealUri, historyItemId) } : undefined;

		await commands.executeCommand('_workbench.openMultiDiffEditor', { multiDiffSourceUri, title, resources, reveal });
	}

	@command('git.copyContentToClipboard')
	async copyContentToClipboard(content: string): Promise<void> {
		if (typeof content !== 'string') {
			return;
		}

		env.clipboard.writeText(content);
	}

	@command('git.blame.toggleEditorDecoration')
	toggleBlameEditorDecoration(): void {
		this._toggleBlameSetting('blame.editorDecoration.enabled');
	}

	@command('git.blame.toggleStatusBarItem')
	toggleBlameStatusBarItem(): void {
		this._toggleBlameSetting('blame.statusBarItem.enabled');
	}

	private _toggleBlameSetting(setting: string): void {
		const config = workspace.getConfiguration('git');
		const enabled = config.get<boolean>(setting) === true;

		config.update(setting, !enabled, true);
	}

	@command('git.repositories.createBranch', { repository: true })
	async artifactGroupCreateBranch(repository: Repository): Promise<void> {
		if (!repository) {
			return;
		}

		await this._branch(repository, undefined, false);
	}

	@command('git.repositories.createTag', { repository: true })
	async artifactGroupCreateTag(repository: Repository): Promise<void> {
		if (!repository) {
			return;
		}

		await this._createTag(repository);
	}

	@command('git.repositories.checkout', { repository: true })
	async artifactCheckout(repository: Repository, artifact: SourceControlArtifact): Promise<void> {
		if (!repository || !artifact) {
			return;
		}

		await this._checkout(repository, { treeish: artifact.name });
	}

	@command('git.repositories.checkoutDetached', { repository: true })
	async artifactCheckoutDetached(repository: Repository, artifact: SourceControlArtifact): Promise<void> {
		if (!repository || !artifact) {
			return;
		}

		await this._checkout(repository, { treeish: artifact.name, detached: true });
	}

	@command('git.repositories.merge', { repository: true })
	async artifactMerge(repository: Repository, artifact: SourceControlArtifact): Promise<void> {
		if (!repository || !artifact) {
			return;
		}

		await repository.merge(artifact.id);
	}

	@command('git.repositories.rebase', { repository: true })
	async artifactRebase(repository: Repository, artifact: SourceControlArtifact): Promise<void> {
		if (!repository || !artifact) {
			return;
		}

		await repository.rebase(artifact.id);
	}

	@command('git.repositories.createFrom', { repository: true })
	async artifactCreateFrom(repository: Repository, artifact: SourceControlArtifact): Promise<void> {
		if (!repository || !artifact) {
			return;
		}

		await this._branch(repository, undefined, false, artifact.id);
	}

	@command('git.repositories.compareRef', { repository: true })
	async artifactCompareWith(repository: Repository, artifact: SourceControlArtifact): Promise<void> {
		if (!repository || !artifact) {
			return;
		}

		const config = workspace.getConfiguration('git');
		const showRefDetails = config.get<boolean>('showReferenceDetails') === true;

		const getRefPicks = async () => {
			const refs = await repository.getRefs({ includeCommitDetails: showRefDetails });
			const processors = [
				new RefProcessor(RefType.Head, BranchItem),
				new RefProcessor(RefType.RemoteHead, BranchItem),
				new RefProcessor(RefType.Tag, BranchItem)
			];

			const itemsProcessor = new RefItemsProcessor(repository, processors);
			return itemsProcessor.processRefs(refs);
		};

		const placeHolder = l10n.t('Select a reference to compare with');
		const sourceRef = await this.pickRef(getRefPicks(), placeHolder);

		if (!(sourceRef instanceof BranchItem) || !sourceRef.ref.commit) {
			return;
		}

		await this._openChangesBetweenRefs(
			repository,
			{
				id: sourceRef.ref.commit,
				displayId: sourceRef.ref.name
			},
			{
				id: artifact.id,
				displayId: artifact.name
			});
	}

	private async _createTag(repository: Repository, ref?: string): Promise<void> {
		const inputTagName = await window.showInputBox({
			placeHolder: l10n.t('Tag name'),
			prompt: l10n.t('Please provide a tag name'),
			ignoreFocusOut: true
		});

		if (!inputTagName) {
			return;
		}

		const inputMessage = await window.showInputBox({
			placeHolder: l10n.t('Message'),
			prompt: l10n.t('Please provide a message to annotate the tag'),
			ignoreFocusOut: true
		});

		const name = inputTagName.replace(/^\.|\/\.|\.\.|~|\^|:|\/$|\.lock$|\.lock\/|\\|\*|\s|^\s*$|\.$/g, '-');
		await repository.tag({ name, message: inputMessage, ref });
	}

	@command('git.repositories.deleteBranch', { repository: true })
	async artifactDeleteBranch(repository: Repository, artifact: SourceControlArtifact): Promise<void> {
		if (!repository || !artifact) {
			return;
		}

		const message = l10n.t('Are you sure you want to delete branch "{0}"? This action will permanently remove the branch reference from the repository.', artifact.name);
		const yes = l10n.t('Delete Branch');
		const result = await window.showWarningMessage(message, { modal: true }, yes);
		if (result !== yes) {
			return;
		}

		await this._deleteBranch(repository, undefined, artifact.name, { remote: false });
	}

	@command('git.repositories.deleteTag', { repository: true })
	async artifactDeleteTag(repository: Repository, artifact: SourceControlArtifact): Promise<void> {
		if (!repository || !artifact) {
			return;
		}

		const message = l10n.t('Are you sure you want to delete tag "{0}"? This action will permanently remove the tag reference from the repository.', artifact.name);
		const yes = l10n.t('Delete Tag');
		const result = await window.showWarningMessage(message, { modal: true }, yes);
		if (result !== yes) {
			return;
		}

		await repository.deleteTag(artifact.name);
	}

	private createCommand(id: string, key: string, method: Function, options: ScmCommandOptions): (...args: any[]) => any {
		const result = (...args: any[]) => {
			let result: Promise<any>;

			if (!options.repository) {
				result = Promise.resolve(method.apply(this, args));
			} else {
				// try to guess the repository based on the first argument
				const repository = this.model.getRepository(args[0]);
				let repositoryPromise: Promise<Repository | undefined>;

				if (repository) {
					repositoryPromise = Promise.resolve(repository);
				} else {
					repositoryPromise = this.model.pickRepository(options.repositoryFilter);
				}

				result = repositoryPromise.then(repository => {
					if (!repository) {
						return Promise.resolve();
					}

					return Promise.resolve(method.apply(this, [repository, ...args.slice(1)]));
				});
			}

			/* __GDPR__
				"git.command" : {
					"owner": "lszomoru",
					"command" : { "classification": "SystemMetaData", "purpose": "FeatureInsight", "comment": "The command id of the command being executed" }
				}
			*/
			this.telemetryReporter.sendTelemetryEvent('git.command', { command: id });

			return result.catch(err => {
				const options: MessageOptions = {
					modal: true
				};

				let message: string;
				let type: 'error' | 'warning' | 'information' = 'error';

				const choices = new Map<string, () => void>();
				const openOutputChannelChoice = l10n.t('Open Git Log');
				const outputChannelLogger = this.logger;
				choices.set(openOutputChannelChoice, () => outputChannelLogger.show());

				const showCommandOutputChoice = l10n.t('Show Command Output');
				if (err.stderr) {
					choices.set(showCommandOutputChoice, async () => {
						const timestamp = new Date().getTime();
						const uri = Uri.parse(`git-output:/git-error-${timestamp}`);

						let command = 'git';

						if (err.gitArgs) {
							command = `${command} ${err.gitArgs.join(' ')}`;
						} else if (err.gitCommand) {
							command = `${command} ${err.gitCommand}`;
						}

						this.commandErrors.set(uri, `> ${command}\n${err.stderr}`);

						try {
							const doc = await workspace.openTextDocument(uri);
							await window.showTextDocument(doc);
						} finally {
							this.commandErrors.delete(uri);
						}
					});
				}

				switch (err.gitErrorCode) {
					case GitErrorCodes.DirtyWorkTree:
						message = l10n.t('Please clean your repository working tree before checkout.');
						break;
					case GitErrorCodes.PushRejected:
						message = l10n.t('Can\'t push refs to remote. Try running "Pull" first to integrate your changes.');
						break;
					case GitErrorCodes.ForcePushWithLeaseRejected:
					case GitErrorCodes.ForcePushWithLeaseIfIncludesRejected:
						message = l10n.t('Can\'t force push refs to remote. The tip of the remote-tracking branch has been updated since the last checkout. Try running "Pull" first to pull the latest changes from the remote branch first.');
						break;
					case GitErrorCodes.Conflict:
						message = l10n.t('There are merge conflicts. Please resolve them before committing your changes.');
						type = 'warning';
						choices.clear();
						choices.set(l10n.t('Show Changes'), () => commands.executeCommand('workbench.view.scm'));
						options.modal = false;
						break;
					case GitErrorCodes.StashConflict:
						message = l10n.t('There are merge conflicts while applying the stash. Please resolve them before committing your changes.');
						type = 'warning';
						choices.clear();
						choices.set(l10n.t('Show Changes'), () => commands.executeCommand('workbench.view.scm'));
						options.modal = false;
						break;
					case GitErrorCodes.AuthenticationFailed: {
						const regex = /Authentication failed for '(.*)'/i;
						const match = regex.exec(err.stderr || String(err));

						message = match
							? l10n.t('Failed to authenticate to git remote:\n\n{0}', match[1])
							: l10n.t('Failed to authenticate to git remote.');
						break;
					}
					case GitErrorCodes.NoUserNameConfigured:
					case GitErrorCodes.NoUserEmailConfigured:
						message = l10n.t('Make sure you configure your "user.name" and "user.email" in git.');
						choices.set(l10n.t('Learn More'), () => commands.executeCommand('vscode.open', Uri.parse('https://aka.ms/vscode-setup-git')));
						break;
					case GitErrorCodes.EmptyCommitMessage:
						message = l10n.t('Commit operation was cancelled due to empty commit message.');
						choices.clear();
						type = 'information';
						options.modal = false;
						break;
					case GitErrorCodes.CherryPickEmpty:
						message = l10n.t('The changes are already present in the current branch.');
						choices.clear();
						type = 'information';
						options.modal = false;
						break;
					case GitErrorCodes.CherryPickConflict:
						message = l10n.t('There were merge conflicts while cherry picking the changes. Resolve the conflicts before committing them.');
						type = 'warning';
						choices.set(l10n.t('Show Changes'), () => commands.executeCommand('workbench.view.scm'));
						options.modal = false;
						break;
					default: {
						const hint = (err.stderr || err.message || String(err))
							.replace(/^error: /mi, '')
							.replace(/^> husky.*$/mi, '')
							.split(/[\r\n]/)
							.filter((line: string) => !!line)
						[0];

						message = hint
							? l10n.t('Git: {0}', hint)
							: l10n.t('Git error');

						break;
					}
				}

				if (!message) {
					console.error(err);
					return;
				}

				// We explicitly do not await this promise, because we do not
				// want the command execution to be stuck waiting for the user
				// to take action on the notification.
				this.showErrorNotification(type, message, options, choices);
			});
		};

		// patch this object, so people can call methods directly
		(this as Record<string, unknown>)[key] = result;

		return result;
	}

	private async showErrorNotification(type: 'error' | 'warning' | 'information', message: string, options: MessageOptions, choices: Map<string, () => void>): Promise<void> {
		let result: string | undefined;
		const allChoices = Array.from(choices.keys());

		switch (type) {
			case 'error':
				result = await window.showErrorMessage(message, options, ...allChoices);
				break;
			case 'warning':
				result = await window.showWarningMessage(message, options, ...allChoices);
				break;
			case 'information':
				result = await window.showInformationMessage(message, options, ...allChoices);
				break;
		}

		if (result) {
			const resultFn = choices.get(result);

			resultFn?.();
		}
	}

	private getSCMResource(uri?: Uri): Resource | undefined {
		uri = uri ? uri : (window.activeTextEditor && window.activeTextEditor.document.uri);

		this.logger.debug(`[CommandCenter][getSCMResource] git.getSCMResource.uri: ${uri && uri.toString()}`);

		for (const r of this.model.repositories.map(r => r.root)) {
			this.logger.debug(`[CommandCenter][getSCMResource] repo root: ${r}`);
		}

		if (!uri) {
			return undefined;
		}

		if (isGitUri(uri)) {
			const { path } = fromGitUri(uri);
			uri = Uri.file(path);
		}

		if (uri.scheme === 'file') {
			const uriString = uri.toString();
			const repository = this.model.getRepository(uri);

			if (!repository) {
				return undefined;
			}

			return repository.workingTreeGroup.resourceStates.filter(r => r.resourceUri.toString() === uriString)[0]
				|| repository.indexGroup.resourceStates.filter(r => r.resourceUri.toString() === uriString)[0]
				|| repository.mergeGroup.resourceStates.filter(r => r.resourceUri.toString() === uriString)[0];
		}
		return undefined;
	}

	private runByRepository<T>(resource: Uri, fn: (repository: Repository, resource: Uri) => Promise<T>): Promise<T[]>;
	private runByRepository<T>(resources: Uri[], fn: (repository: Repository, resources: Uri[]) => Promise<T>): Promise<T[]>;
	private async runByRepository<T>(arg: Uri | Uri[], fn: (repository: Repository, resources: any) => Promise<T>): Promise<T[]> {
		const resources = arg instanceof Uri ? [arg] : arg;
		const isSingleResource = arg instanceof Uri;

		const groups = resources.reduce((result, resource) => {
			let repository = this.model.getRepository(resource);

			if (!repository) {
				console.warn('Could not find git repository for ', resource);
				return result;
			}

			// Could it be a submodule?
			if (pathEquals(resource.fsPath, repository.root)) {
				repository = this.model.getRepositoryForSubmodule(resource) || repository;
			}

			const tuple = result.filter(p => p.repository === repository)[0];

			if (tuple) {
				tuple.resources.push(resource);
			} else {
				result.push({ repository, resources: [resource] });
			}

			return result;
		}, [] as { repository: Repository; resources: Uri[] }[]);

		const promises = groups
			.map(({ repository, resources }) => fn(repository as Repository, isSingleResource ? resources[0] : resources));

		return Promise.all(promises);
	}

	dispose(): void {
		this.disposables.forEach(d => d.dispose());
	}
}
