/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { CancellationToken, Disposable, LanguageModelChat, LanguageModelChatMessage, ProgressLocation, QuickPickItem, QuickPickItemKind, SourceControl, SourceControlResourceGroup, SourceControlResourceState, ThemeIcon, Uri, commands, l10n, lm, scm, window, workspace } from 'vscode';
import { Status } from './api/git.constants';
import { Repository, Resource } from './repository';
import { toGitUri } from './uri';
import { coalesce, dispose, relativePath, subject, truncate } from './util';

/**
 * A single commit proposed by the model: a message and the files that belong to it.
 */
export interface ProposedCommit {
	readonly message: string;
	readonly files: readonly string[];
}

/**
 * A commit of the plan that is being previewed. The identifier is stable for the
 * lifetime of the commit, so that its resource group survives message edits and
 * changes to the files it contains.
 */
export interface PlannedCommit {
	readonly id: string;
	message: string;
	files: string[];
}

const PLANNER_SOURCE_CONTROL_ID = 'gitAgenticCommitPlanner';
const UNASSIGNED_GROUP_ID = 'unassigned';
const COMMIT_GROUP_CONTEXT_VALUE = 'commit';

// Keep the payload sent to the model bounded.
const MAX_DIFF_CHARS_PER_FILE = 4000;

/**
 * The preview of a commit plan of a repository. Each proposed commit is rendered as
 * a resource group of a dedicated source control provider, so that the plan looks
 * and behaves like the changes of the repository: the commit message is the label of
 * the group, and the files of the commit are its resource states.
 */
class AgenticCommitPlan implements Disposable {

	private readonly _sourceControl: SourceControl;
	private readonly _groups = new Map<string, SourceControlResourceGroup>();
	private _unassignedGroup: SourceControlResourceGroup | undefined;
	private readonly _disposables: Disposable[] = [];

	private _commits: PlannedCommit[] = [];
	private _unassigned: string[] = [];
	private _nextCommitId = 1;

	/**
	 * Set while the commits are being created. Creating them changes the state of the
	 * repository, and the plan must not react to its own git operations.
	 */
	private _creating = false;
	private _closed = false;

	get sourceControl(): SourceControl { return this._sourceControl; }

	/**
	 * Whether the plan proposes at least one commit. A plan can be left with no
	 * commits at all, and only files that are not included.
	 */
	get hasCommits(): boolean { return this._commits.length > 0; }

	constructor(readonly repository: Repository, private readonly onDidClose: (plan: AgenticCommitPlan) => void) {
		this._sourceControl = scm.createSourceControl(
			PLANNER_SOURCE_CONTROL_ID,
			l10n.t('Commit Plan'),
			Uri.file(repository.root),
			new ThemeIcon('sparkle'),
			false,
			repository.sourceControl);

		this._sourceControl.inputBox.visible = false;
		this._disposables.push(this._sourceControl);
		this._disposables.push(this._sourceControl.onDidDisposeParent(() => this.close()));
		this._disposables.push(repository.onDidRunGitStatus(() => this.reconcile()));
	}

	/**
	 * Replace the plan with the commits proposed by the model. Files that are not
	 * changed anymore, and files that were claimed by an earlier commit, are dropped.
	 */
	setCommits(proposals: readonly ProposedCommit[]): void {
		this._commits = resolveProposals(proposals, this.repository.root, new Set(this.changedResources().keys()))
			.map(commit => ({ id: `commit-${this._nextCommitId++}`, ...commit }));

		this.reconcile();
	}

	hasGroup(group: SourceControlResourceGroup): boolean {
		return this._groups.has(group.id) || (group.id === UNASSIGNED_GROUP_ID && this._unassignedGroup !== undefined);
	}

	hasFile(fsPath: string): boolean {
		return this._commits.some(commit => commit.files.includes(fsPath)) || this._unassigned.includes(fsPath);
	}

	/**
	 * Edit the message of the commit a resource group stands for.
	 */
	async editMessage(group: SourceControlResourceGroup): Promise<void> {
		const commit = this.commitOf(group);
		if (!commit) {
			return;
		}

		const message = await window.showInputBox({
			title: l10n.t('Edit Commit Message'),
			value: commit.message,
			placeHolder: l10n.t('Commit message'),
			prompt: commit.files.length === 1
				? l10n.t('Message of the commit with 1 file')
				: l10n.t('Message of the commit with {0} files', commit.files.length),
			ignoreFocusOut: true
		});

		if (!message?.trim()) {
			return;
		}

		commit.message = message.trim();
		this.render();
	}

	/**
	 * Remove a commit from the plan. Its files stay in the preview, so that they can
	 * be added to another commit.
	 */
	removeCommit(group: SourceControlResourceGroup): void {
		const commit = this.commitOf(group);
		if (!commit) {
			return;
		}

		this._commits = this._commits.filter(c => c !== commit);
		this._unassigned = [...this._unassigned, ...commit.files];
		this.renderOrClose();
	}

	/**
	 * Move files to another commit of the plan, to a new commit, or out of the plan.
	 */
	async moveResources(fsPaths: readonly string[]): Promise<void> {
		if (fsPaths.length === 0) {
			return;
		}

		interface MoveTargetItem extends QuickPickItem {
			readonly commit?: PlannedCommit;
			readonly action?: 'new' | 'unassigned';
		}

		const items: MoveTargetItem[] = this._commits.map((commit, index) => ({
			commit,
			label: this.groupLabel(commit, index),
			description: commit.files.length === 1
				? l10n.t('1 file')
				: l10n.t('{0} files', commit.files.length)
		}));

		items.push(
			{ label: '', kind: QuickPickItemKind.Separator },
			{ action: 'new', label: l10n.t('{0} New Commit...', '$(plus)') },
			{ action: 'unassigned', label: l10n.t('{0} Remove from Plan', '$(circle-slash)') });

		const placeHolder = fsPaths.length === 1
			? l10n.t('Select the commit that should contain "{0}"', relativePath(this.repository.root, fsPaths[0]))
			: l10n.t('Select the commit that should contain the {0} selected files', fsPaths.length);

		const choice = await window.showQuickPick(items, { title: l10n.t('Move to Commit'), placeHolder });
		if (!choice) {
			return;
		}

		let target = choice.commit;

		if (choice.action === 'new') {
			const message = await window.showInputBox({
				title: l10n.t('New Commit'),
				placeHolder: l10n.t('Commit message'),
				prompt: l10n.t('Message of the commit the selected files are moved to'),
				ignoreFocusOut: true
			});

			if (!message?.trim()) {
				return;
			}

			target = { id: `commit-${this._nextCommitId++}`, message: message.trim(), files: [] };
			this._commits.push(target);
		}

		this.assign(fsPaths, target);
	}

	/**
	 * Take files out of the plan without creating a commit for them.
	 */
	removeResources(fsPaths: readonly string[]): void {
		this.assign(fsPaths, undefined);
	}

	/**
	 * Open the changes of a proposed commit in a multi file diff editor.
	 */
	async viewChanges(group: SourceControlResourceGroup): Promise<void> {
		const commit = this.commitOf(group);
		if (!commit) {
			return;
		}

		const resources = this.changedResources();
		const changes = coalesce(commit.files.map(file => resources.get(file))).map(resource => toDiffEditorUris(resource));

		if (changes.length === 0) {
			return;
		}

		await commands.executeCommand('_workbench.openMultiDiffEditor', {
			multiDiffSourceUri: Uri.from({ scheme: 'git-agentic-commit-planner', path: `${this.repository.root}/${commit.id}` }),
			title: subject(commit.message),
			resources: changes
		});
	}

	/**
	 * Create the commit a resource group stands for.
	 */
	async createCommit(group: SourceControlResourceGroup): Promise<void> {
		const commit = this.commitOf(group);
		if (commit) {
			await this.create([commit]);
		}
	}

	/**
	 * Create every commit of the plan, in the order they are shown.
	 */
	async createAllCommits(): Promise<void> {
		await this.create([...this._commits]);
	}

	close(): void {
		if (this._closed) {
			return;
		}

		this.onDidClose(this);
		this.dispose();
	}

	dispose(): void {
		this._closed = true;
		this._groups.clear();
		this._unassignedGroup = undefined;
		dispose(this._disposables);
	}

	/**
	 * Stage and commit each group of files in turn. The plan is updated while the
	 * commits are created, so that the preview always shows what is left to do.
	 */
	private async create(commits: readonly PlannedCommit[]): Promise<void> {
		if (commits.length === 0 || !await this.ensureNothingStaged()) {
			return;
		}

		this._creating = true;
		this.render();

		try {
			await window.withProgress({
				location: ProgressLocation.SourceControl,
				title: commits.length === 1
					? l10n.t('Creating commit...')
					: l10n.t('Creating {0} commits...', commits.length)
			}, async () => {
				for (const commit of commits) {
					const resources = this.changedResources();
					const uris = coalesce(commit.files.map(file => resources.get(file))).map(resource => resource.resourceUri);

					if (uris.length === 0) {
						continue;
					}

					await this.repository.add(uris);
					await this.repository.commit(commit.message, { all: false });

					this._commits = this._commits.filter(c => c !== commit);
					this.render();
				}
			});
		} catch (err) {
			window.showErrorMessage(l10n.t('Failed to create the commits: {0}', err instanceof Error ? err.message : String(err)));
		} finally {
			this._creating = false;
		}

		this.reconcile();
	}

	/**
	 * Only the files of the commit that is being created may be staged, so an index
	 * the user has prepared would be lost. Ask before touching it.
	 */
	private async ensureNothingStaged(): Promise<boolean> {
		const staged = this.repository.indexGroup.resourceStates.map(resource => resource.resourceUri);

		if (staged.length === 0) {
			return true;
		}

		const unstage = l10n.t('Unstage Changes');
		const choice = await window.showWarningMessage(
			l10n.t('The planned commits can only be created while nothing is staged.'),
			{
				modal: true,
				detail: staged.length === 1
					? l10n.t('1 staged change has to be unstaged first. The change itself is kept.')
					: l10n.t('{0} staged changes have to be unstaged first. The changes themselves are kept.', staged.length)
			},
			unstage);

		if (choice !== unstage) {
			return false;
		}

		await this.repository.revert(staged);
		return true;
	}

	/**
	 * Move files to a commit of the plan, or out of the plan when there is no target.
	 */
	private assign(fsPaths: readonly string[], target: PlannedCommit | undefined): void {
		const moved = new Set(fsPaths);

		for (const commit of this._commits) {
			if (commit !== target) {
				commit.files = commit.files.filter(file => !moved.has(file));
			}
		}

		this._unassigned = this._unassigned.filter(file => !moved.has(file));

		if (target) {
			target.files = [...target.files, ...fsPaths.filter(file => !target.files.includes(file))];
		} else {
			this._unassigned = [...this._unassigned, ...fsPaths];
		}

		this.renderOrClose();
	}

	/**
	 * Bring the plan back in sync with the changes of the repository: files that are
	 * not changed anymore leave the plan, and new changes show up as not included.
	 */
	private reconcile(): void {
		if (this._creating || this._closed) {
			return;
		}

		this._unassigned = reconcileCommits(this._commits, [...this.changedResources().keys()]);
		this.renderOrClose();
	}

	private renderOrClose(): void {
		this._commits = this._commits.filter(commit => commit.files.length > 0);

		// Files that are left without a commit stay in the preview, so that they can
		// be moved into another commit. Only an empty plan has nothing left to show.
		if (this._commits.length === 0 && this._unassigned.length === 0) {
			this.close();
			return;
		}

		this.render();
	}

	private render(): void {
		if (this._closed) {
			return;
		}

		const resources = this.changedResources();
		let groupCreated = false;

		for (const [index, commit] of this._commits.entries()) {
			let group = this._groups.get(commit.id);

			if (!group) {
				group = this._sourceControl.createResourceGroup(commit.id, '');
				group.contextValue = COMMIT_GROUP_CONTEXT_VALUE;
				group.hideWhenEmpty = true;
				this._groups.set(commit.id, group);
				groupCreated = true;
			}

			group.label = this.groupLabel(commit, index);
			group.resourceStates = coalesce(commit.files.map(file => resources.get(file)));
		}

		for (const [id, group] of [...this._groups]) {
			if (!this._commits.some(commit => commit.id === id)) {
				group.dispose();
				this._groups.delete(id);
			}
		}

		// Resource groups are rendered in the order they were created. Recreate the
		// group of the files that are not included, so that it stays at the bottom.
		if (groupCreated && this._unassignedGroup) {
			this._unassignedGroup.dispose();
			this._unassignedGroup = undefined;
		}

		if (this._unassigned.length === 0) {
			this._unassignedGroup?.dispose();
			this._unassignedGroup = undefined;
		} else {
			if (!this._unassignedGroup) {
				this._unassignedGroup = this._sourceControl.createResourceGroup(UNASSIGNED_GROUP_ID, l10n.t('Not Included'));
				this._unassignedGroup.contextValue = UNASSIGNED_GROUP_ID;
				this._unassignedGroup.hideWhenEmpty = true;
			}

			this._unassignedGroup.resourceStates = coalesce(this._unassigned.map(file => resources.get(file)));
		}

		this._sourceControl.count = this._commits.reduce((count, commit) => count + commit.files.length, 0);
		this._sourceControl.actionButton = this._commits.length === 0 ? undefined : {
			command: {
				command: 'git.agenticCommitPlannerCreateAll',
				title: this._commits.length === 1
					? l10n.t('{0} Create Commit', '$(check)')
					: l10n.t('{0} Create {1} Commits', '$(check)', this._commits.length),
				arguments: [this._sourceControl]
			},
			secondaryCommands: [[
				{ command: 'git.agenticCommitPlannerRegenerate', title: l10n.t('Regenerate Plan'), arguments: [this._sourceControl] },
				{ command: 'git.agenticCommitPlannerDiscard', title: l10n.t('Discard Plan'), arguments: [this._sourceControl] }
			]],
			enabled: !this._creating
		};
	}

	/**
	 * The label of a proposed commit. The number conveys the order in which the
	 * commits are created.
	 */
	private groupLabel(commit: PlannedCommit, index: number): string {
		return `${index + 1}. ${subject(commit.message)}`;
	}

	private commitOf(group: SourceControlResourceGroup): PlannedCommit | undefined {
		return this._commits.find(commit => commit.id === group.id);
	}

	/**
	 * The changes of the repository, by path. The resource states of the repository
	 * are reused, so that the preview shows the same decorations, and opens the same
	 * diff editors, as the changes of the repository.
	 */
	private changedResources(): Map<string, Resource> {
		const result = new Map<string, Resource>();

		for (const group of [this.repository.indexGroup, this.repository.workingTreeGroup, this.repository.untrackedGroup]) {
			for (const resource of group.resourceStates) {
				result.set(resource.resourceUri.fsPath, resource);
			}
		}

		return result;
	}
}

/**
 * Owns the commit plan preview of each repository.
 */
export class AgenticCommitPlanner implements Disposable {

	private readonly plans = new Map<Repository, AgenticCommitPlan>();

	/**
	 * Ask the model to split the changes of the repository into a set of
	 * logically-grouped commits, and preview the plan in the source control view.
	 */
	async generate(repository: Repository): Promise<void> {
		const plan = await this.plan(repository);

		if (plan) {
			await commands.executeCommand('workbench.view.scm');
		}
	}

	/**
	 * Plan the commits and create them right away, without asking for a confirmation.
	 */
	async agentCommits(repository: Repository): Promise<void> {
		const plan = await this.plan(repository);
		await plan?.createAllCommits();
	}

	private async plan(repository: Repository): Promise<AgenticCommitPlan | undefined> {
		const proposals = await requestCommitPlan(repository);
		if (!proposals) {
			return undefined;
		}

		let plan = this.plans.get(repository);

		if (!plan) {
			plan = new AgenticCommitPlan(repository, p => this.plans.delete(p.repository));
			this.plans.set(repository, plan);
		}

		plan.setCommits(proposals);

		if (!plan.hasCommits) {
			// Every proposed file was filtered out.
			plan.close();
			window.showInformationMessage(l10n.t('Copilot did not propose any commits for the current changes.'));
			return undefined;
		}

		return plan;
	}

	async regenerate(sourceControl?: SourceControl): Promise<void> {
		const plan = this.planOf(sourceControl);

		if (plan) {
			await this.generate(plan.repository);
		}
	}

	discard(sourceControl?: SourceControl): void {
		this.planOf(sourceControl)?.close();
	}

	async createAllCommits(sourceControl?: SourceControl): Promise<void> {
		await this.planOf(sourceControl)?.createAllCommits();
	}

	async createCommit(group?: SourceControlResourceGroup): Promise<void> {
		if (group) {
			await this.planOfGroup(group)?.createCommit(group);
		}
	}

	async editMessage(group?: SourceControlResourceGroup): Promise<void> {
		if (group) {
			await this.planOfGroup(group)?.editMessage(group);
		}
	}

	removeCommit(group?: SourceControlResourceGroup): void {
		if (group) {
			this.planOfGroup(group)?.removeCommit(group);
		}
	}

	async viewChanges(group?: SourceControlResourceGroup): Promise<void> {
		if (group) {
			await this.planOfGroup(group)?.viewChanges(group);
		}
	}

	async moveResources(...resourceStates: SourceControlResourceState[]): Promise<void> {
		const { plan, fsPaths } = this.resolveResources(resourceStates);
		await plan?.moveResources(fsPaths);
	}

	removeResources(...resourceStates: SourceControlResourceState[]): void {
		const { plan, fsPaths } = this.resolveResources(resourceStates);
		plan?.removeResources(fsPaths);
	}

	dispose(): void {
		dispose([...this.plans.values()]);
		this.plans.clear();
	}

	private resolveResources(resourceStates: readonly SourceControlResourceState[]): { plan: AgenticCommitPlan | undefined; fsPaths: string[] } {
		const fsPaths = resourceStates
			.filter(state => state?.resourceUri instanceof Uri)
			.map(state => state.resourceUri.fsPath);

		const plan = fsPaths.length === 0
			? undefined
			: [...this.plans.values()].find(c => c.hasFile(fsPaths[0])) ?? this.onlyPlan();

		return { plan, fsPaths };
	}

	private planOf(sourceControl: SourceControl | undefined): AgenticCommitPlan | undefined {
		return [...this.plans.values()].find(plan => plan.sourceControl === sourceControl) ?? this.onlyPlan();
	}

	private planOfGroup(group: SourceControlResourceGroup): AgenticCommitPlan | undefined {
		return [...this.plans.values()].find(plan => plan.hasGroup(group)) ?? this.onlyPlan();
	}

	/**
	 * Commands that are invoked from the command palette come without an argument.
	 * They can still be served as long as a single plan is being previewed.
	 */
	private onlyPlan(): AgenticCommitPlan | undefined {
		return this.plans.size === 1 ? [...this.plans.values()][0] : undefined;
	}
}

/**
 * The original and modified resources of a change, as they will be committed.
 */
function toDiffEditorUris(resource: Resource): { originalUri: Uri | undefined; modifiedUri: Uri | undefined } {
	switch (resource.type) {
		case Status.UNTRACKED:
		case Status.IGNORED:
		case Status.INDEX_ADDED:
		case Status.INTENT_TO_ADD:
			return { originalUri: undefined, modifiedUri: resource.resourceUri };
		case Status.DELETED:
		case Status.INDEX_DELETED:
			return { originalUri: toGitUri(resource.resourceUri, 'HEAD'), modifiedUri: undefined };
		case Status.INDEX_RENAMED:
		case Status.INTENT_TO_RENAME:
			return { originalUri: toGitUri(resource.original, 'HEAD'), modifiedUri: resource.resourceUri };
		default:
			return { originalUri: toGitUri(resource.resourceUri, 'HEAD'), modifiedUri: resource.resourceUri };
	}
}

function changedResourceUris(repository: Repository): Uri[] {
	return [
		...repository.indexGroup.resourceStates,
		...repository.workingTreeGroup.resourceStates,
		...repository.untrackedGroup.resourceStates,
	].map(state => state.resourceUri);
}

async function selectModel(): Promise<LanguageModelChat | undefined> {
	const [model] = await lm.selectChatModels({ vendor: 'copilot' });

	if (!model) {
		window.showErrorMessage(l10n.t('No Copilot language model is available.'));
	}

	return model;
}

/**
 * Ask a Copilot model to group the changes of the repository into commits.
 * Returns `undefined` when no plan could be requested.
 */
async function requestCommitPlan(repository: Repository): Promise<ProposedCommit[] | undefined> {
	// The changes of the repository are sent to a language model.
	if (workspace.getConfiguration('chat').get<boolean>('disableAIFeatures', false)) {
		window.showInformationMessage(l10n.t('Commit plans cannot be generated while AI features are disabled.'));
		return undefined;
	}

	const changedUris = changedResourceUris(repository);

	if (changedUris.length === 0) {
		window.showInformationMessage(l10n.t('There are no changes to plan commits from.'));
		return undefined;
	}

	const model = await selectModel();
	if (!model) {
		return undefined;
	}

	try {
		const proposals = await window.withProgress({
			location: ProgressLocation.Notification,
			title: l10n.t('Planning commits with Copilot...'),
			cancellable: true
		}, async (_progress, token) => {
			// Build a compact description of each change (path + truncated diff).
			const diffs = await collectDiffs(repository, changedUris, token);

			if (token.isCancellationRequested) {
				return undefined;
			}

			try {
				return await requestProposals(model, diffs, token);
			} catch (err) {
				// A canceled request is not a failure.
				if (token.isCancellationRequested) {
					return undefined;
				}

				throw err;
			}
		});

		if (!proposals) {
			return undefined;
		}

		if (proposals.length === 0) {
			window.showInformationMessage(l10n.t('Copilot did not propose any commits.'));
			return undefined;
		}

		return proposals;
	} catch (err) {
		window.showErrorMessage(l10n.t('Failed to generate a commit plan: {0}', err instanceof Error ? err.message : String(err)));
		return undefined;
	}
}

async function collectDiffs(repository: Repository, uris: Uri[], token: CancellationToken): Promise<{ path: string; diff: string }[]> {
	const result: { path: string; diff: string }[] = [];

	for (const uri of uris) {
		if (token.isCancellationRequested) {
			return [];
		}

		const path = relativePath(repository.root, uri.fsPath);

		let diff: string;
		try {
			// diffWithHEAD(path) returns the textual diff for a tracked file.
			diff = await repository.diffWithHEAD(uri.fsPath);
		} catch {
			// Untracked file: fall back to its contents.
			const bytes = await workspace.fs.readFile(uri);
			diff = Buffer.from(bytes).toString('utf8');
		}

		result.push({ path, diff: truncate(diff, MAX_DIFF_CHARS_PER_FILE) });
	}

	return result;
}

async function requestProposals(model: LanguageModelChat, diffs: { path: string; diff: string }[], token: CancellationToken): Promise<ProposedCommit[]> {
	const changes = diffs.map(({ path, diff }) => `### ${path}\n\`\`\`diff\n${diff}\n\`\`\``).join('\n\n');

	const prompt = [
		LanguageModelChatMessage.User(
			'You are helping to organize a set of file changes into several small, logically-cohesive git commits. ' +
			'Group related files together and write a concise conventional-commit message for each group. ' +
			'Every listed file must appear in exactly one group. ' +
			'Respond with ONLY a JSON array of objects of the shape ' +
			'{ "message": string, "files": string[] } and nothing else.'
		),
		LanguageModelChatMessage.User(`Here are the changes:\n\n${changes}`),
	];

	const response = await model.sendRequest(prompt, {
		justification: l10n.t('The changes of the repository are sent to Copilot so that it can group them into commits and write a message for each of them.')
	}, token);

	let text = '';
	for await (const fragment of response.text) {
		text += fragment;
	}

	return parseProposals(text);
}

/**
 * The commits proposed by the model. Everything that does not have the requested
 * shape is dropped, as the response cannot be trusted to be well-formed.
 */
export function parseProposals(text: string): ProposedCommit[] {
	// The model may wrap the JSON in a markdown code fence.
	const match = text.match(/\[[\s\S]*\]/);
	if (!match) {
		return [];
	}

	let parsed: unknown;
	try {
		parsed = JSON.parse(match[0]);
	} catch {
		return [];
	}

	return Array.isArray(parsed) ? coalesce(parsed.map(value => toProposedCommit(value))) : [];
}

function toProposedCommit(value: unknown): ProposedCommit | undefined {
	if (typeof value !== 'object' || value === null) {
		return undefined;
	}

	const { message, files } = value as { message?: unknown; files?: unknown };

	if (typeof message !== 'string' || message.trim().length === 0 || !Array.isArray(files)) {
		return undefined;
	}

	const paths = files.filter((file): file is string => typeof file === 'string' && file.length > 0);

	return paths.length > 0 ? { message, files: paths } : undefined;
}

/**
 * The commits to plan for a set of proposals. Files that are not changed anymore,
 * and files that were already claimed by an earlier commit, are dropped.
 */
export function resolveProposals(proposals: readonly ProposedCommit[], root: string, changed: ReadonlySet<string>): { message: string; files: string[] }[] {
	const claimed = new Set<string>();
	const commits: { message: string; files: string[] }[] = [];

	for (const proposal of proposals) {
		const files: string[] = [];

		for (const file of proposal.files) {
			const fsPath = Uri.joinPath(Uri.file(root), file).fsPath;

			if (changed.has(fsPath) && !claimed.has(fsPath)) {
				claimed.add(fsPath);
				files.push(fsPath);
			}
		}

		if (files.length > 0) {
			commits.push({ message: proposal.message.trim(), files });
		}
	}

	return commits;
}

/**
 * Bring the commits of a plan back in sync with the changes of a repository: files
 * that are not changed anymore leave their commit. Returns the changes that are
 * left without a commit.
 */
export function reconcileCommits(commits: readonly PlannedCommit[], changedPaths: readonly string[]): string[] {
	const changed = new Set(changedPaths);

	for (const commit of commits) {
		commit.files = commit.files.filter(file => changed.has(file));
	}

	const planned = new Set(commits.flatMap(commit => commit.files));
	return changedPaths.filter(file => !planned.has(file));
}
