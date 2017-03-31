/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

'use strict';

import { Uri, commands, scm, Disposable, window, workspace, QuickPickItem, OutputChannel, Range, WorkspaceEdit, Position, LineChange, SourceControlResourceState } from 'vscode';
import { Ref, RefType, Git } from './git';
import { Model, Resource, Status, CommitOptions, WorkingTreeGroup, IndexGroup, MergeGroup } from './model';
import * as staging from './staging';
import * as path from 'path';
import * as os from 'os';
import TelemetryReporter from 'vscode-extension-telemetry';
import * as nls from 'vscode-nls';

const localize = nls.loadMessageBundle();

class CheckoutItem implements QuickPickItem {

	protected get shortCommit(): string { return (this.ref.commit || '').substr(0, 8); }
	protected get treeish(): string | undefined { return this.ref.name; }
	get label(): string { return this.ref.name || this.shortCommit; }
	get description(): string { return this.shortCommit; }

	constructor(protected ref: Ref) { }

	async run(model: Model): Promise<void> {
		const ref = this.treeish;

		if (!ref) {
			return;
		}

		await model.checkout(ref);
	}
}

class CheckoutTagItem extends CheckoutItem {

	get description(): string {
		return localize('tag at', "Tag at {0}", this.shortCommit);
	}
}

class CheckoutRemoteHeadItem extends CheckoutItem {

	get description(): string {
		return localize('remote branch at', "Remote branch at {0}", this.shortCommit);
	}

	protected get treeish(): string | undefined {
		if (!this.ref.name) {
			return;
		}

		const match = /^[^/]+\/(.*)$/.exec(this.ref.name);
		return match ? match[1] : this.ref.name;
	}
}

interface Command {
	commandId: string;
	key: string;
	method: Function;
	skipModelCheck: boolean;
	requiresDiffInformation: boolean;
}

const Commands: Command[] = [];

function command(commandId: string, skipModelCheck = false, requiresDiffInformation = false): Function {
	return (target: any, key: string, descriptor: any) => {
		if (!(typeof descriptor.value === 'function')) {
			throw new Error('not supported');
		}

		Commands.push({ commandId, key, method: descriptor.value, skipModelCheck, requiresDiffInformation });
	};
}

export class CommandCenter {

	private model: Model;
	private disposables: Disposable[];

	constructor(
		private git: Git,
		model: Model | undefined,
		private outputChannel: OutputChannel,
		private telemetryReporter: TelemetryReporter
	) {
		if (model) {
			this.model = model;
		}

		this.disposables = Commands
			.map(({ commandId, key, method, skipModelCheck, requiresDiffInformation }) => {
				const command = this.createCommand(commandId, key, method, skipModelCheck);

				if (requiresDiffInformation) {
					return commands.registerDiffInformationCommand(commandId, command);
				} else {
					return commands.registerCommand(commandId, command);
				}
			});
	}

	@command('git.refresh')
	async refresh(): Promise<void> {
		await this.model.status();
	}

	@command('git.openResource')
	async openResource(resource: Resource): Promise<void> {
		await this._openResource(resource);
	}

	private async _openResource(resource: Resource): Promise<void> {
		const left = this.getLeftResource(resource);
		const right = this.getRightResource(resource);
		const title = this.getTitle(resource);

		if (!right) {
			// TODO
			console.error('oh no');
			return;
		}

		if (!left) {
			return await commands.executeCommand<void>('vscode.open', right);
		}

		return await commands.executeCommand<void>('vscode.diff', left, right, title);
	}

	private getLeftResource(resource: Resource): Uri | undefined {
		switch (resource.type) {
			case Status.INDEX_MODIFIED:
			case Status.INDEX_RENAMED:
				return resource.original.with({ scheme: 'git', query: 'HEAD' });

			case Status.MODIFIED:
				return resource.resourceUri.with({ scheme: 'git', query: '~' });
		}
	}

	private getRightResource(resource: Resource): Uri | undefined {
		switch (resource.type) {
			case Status.INDEX_MODIFIED:
			case Status.INDEX_ADDED:
			case Status.INDEX_COPIED:
				return resource.resourceUri.with({ scheme: 'git' });

			case Status.INDEX_RENAMED:
				return resource.resourceUri.with({ scheme: 'git' });

			case Status.INDEX_DELETED:
			case Status.DELETED:
				return resource.resourceUri.with({ scheme: 'git', query: 'HEAD' });

			case Status.MODIFIED:
			case Status.UNTRACKED:
			case Status.IGNORED:
				const uriString = resource.resourceUri.toString();
				const [indexStatus] = this.model.indexGroup.resources.filter(r => r.resourceUri.toString() === uriString);

				if (indexStatus && indexStatus.renameResourceUri) {
					return indexStatus.renameResourceUri;
				}

				return resource.resourceUri;

			case Status.BOTH_MODIFIED:
				return resource.resourceUri;
		}
	}

	private getTitle(resource: Resource): string {
		const basename = path.basename(resource.resourceUri.fsPath);

		switch (resource.type) {
			case Status.INDEX_MODIFIED:
			case Status.INDEX_RENAMED:
				return `${basename} (Index)`;

			case Status.MODIFIED:
				return `${basename} (Working Tree)`;
		}

		return '';
	}

	@command('git.clone', true)
	async clone(): Promise<void> {
		const url = await window.showInputBox({
			prompt: localize('repourl', "Repository URL"),
			ignoreFocusOut: true
		});

		if (!url) {
			this.telemetryReporter.sendTelemetryEvent('clone', { outcome: 'no_URL' });
			return;
		}

		const parentPath = await window.showInputBox({
			prompt: localize('parent', "Parent Directory"),
			value: os.homedir(),
			ignoreFocusOut: true
		});

		if (!parentPath) {
			this.telemetryReporter.sendTelemetryEvent('clone', { outcome: 'no_directory' });
			return;
		}

		const clonePromise = this.git.clone(url, parentPath);
		window.setStatusBarMessage(localize('cloning', "Cloning git repository..."), clonePromise);

		try {
			const repositoryPath = await clonePromise;

			const open = localize('openrepo', "Open Repository");
			const result = await window.showInformationMessage(localize('proposeopen', "Would you like to open the cloned repository?"), open);

			const openFolder = result === open;
			this.telemetryReporter.sendTelemetryEvent('clone', { outcome: 'success' }, { openFolder: openFolder ? 1 : 0 });
			if (openFolder) {
				commands.executeCommand('vscode.openFolder', Uri.file(repositoryPath));
			}
		} catch (err) {
			if (/already exists and is not an empty directory/.test(err && err.stderr || '')) {
				this.telemetryReporter.sendTelemetryEvent('clone', { outcome: 'directory_not_empty' });
			} else {
				this.telemetryReporter.sendTelemetryEvent('clone', { outcome: 'error' });
			}
			throw err;
		}
	}

	@command('git.init')
	async init(): Promise<void> {
		await this.model.init();
	}

	@command('git.openFile')
	async openFile(resource?: Resource): Promise<void> {
		if (!resource) {
			return;
		}

		return await commands.executeCommand<void>('vscode.open', resource.resourceUri);
	}

	@command('git.openChange')
	async openChange(resource?: Resource): Promise<void> {
		if (!resource) {
			return;
		}

		return await this._openResource(resource);
	}

	@command('git.openFileFromUri')
	async openFileFromUri(uri?: Uri): Promise<void> {
		const resource = this.getSCMResource(uri);

		if (!resource) {
			return;
		}

		return await commands.executeCommand<void>('vscode.open', resource.resourceUri);
	}

	@command('git.openChangeFromUri')
	async openChangeFromUri(uri?: Uri): Promise<void> {
		const resource = this.getSCMResource(uri);

		if (!resource) {
			return;
		}

		return await this._openResource(resource);
	}

	@command('git.stage')
	async stage(...resourceStates: SourceControlResourceState[]): Promise<void> {
		if (resourceStates.length === 0) {
			const resource = this.getSCMResource();

			if (!resource) {
				return;
			}

			resourceStates = [resource];
		}

		const resources = resourceStates
			.filter(s => s instanceof Resource && (s.resourceGroup instanceof WorkingTreeGroup || s.resourceGroup instanceof MergeGroup)) as Resource[];

		if (!resources.length) {
			return;
		}

		return await this.model.add(...resources);
	}

	@command('git.stageAll')
	async stageAll(): Promise<void> {
		return await this.model.add();
	}

	@command('git.stageSelectedRanges', false, true)
	async stageSelectedRanges(diffs: LineChange[]): Promise<void> {
		const textEditor = window.activeTextEditor;

		if (!textEditor) {
			return;
		}

		const modifiedDocument = textEditor.document;
		const modifiedUri = modifiedDocument.uri;

		if (modifiedUri.scheme !== 'file') {
			return;
		}

		const originalUri = modifiedUri.with({ scheme: 'git', query: '~' });
		const originalDocument = await workspace.openTextDocument(originalUri);
		const selections = textEditor.selections;
		const selectedDiffs = diffs.filter(diff => {
			const modifiedRange = diff.modifiedEndLineNumber === 0
				? new Range(modifiedDocument.lineAt(diff.modifiedStartLineNumber - 1).range.end, modifiedDocument.lineAt(diff.modifiedStartLineNumber).range.start)
				: new Range(modifiedDocument.lineAt(diff.modifiedStartLineNumber - 1).range.start, modifiedDocument.lineAt(diff.modifiedEndLineNumber - 1).range.end);

			return selections.some(selection => !!selection.intersection(modifiedRange));
		});

		if (!selectedDiffs.length) {
			return;
		}

		const result = staging.applyChanges(originalDocument, modifiedDocument, selectedDiffs);
		await this.model.stage(modifiedUri, result);
	}

	@command('git.revertSelectedRanges', false, true)
	async revertSelectedRanges(diffs: LineChange[]): Promise<void> {
		const textEditor = window.activeTextEditor;

		if (!textEditor) {
			return;
		}

		const modifiedDocument = textEditor.document;
		const modifiedUri = modifiedDocument.uri;

		if (modifiedUri.scheme !== 'file') {
			return;
		}

		const originalUri = modifiedUri.with({ scheme: 'git', query: '~' });
		const originalDocument = await workspace.openTextDocument(originalUri);
		const selections = textEditor.selections;
		const selectedDiffs = diffs.filter(diff => {
			const modifiedRange = diff.modifiedEndLineNumber === 0
				? new Range(modifiedDocument.lineAt(diff.modifiedStartLineNumber - 1).range.end, modifiedDocument.lineAt(diff.modifiedStartLineNumber).range.start)
				: new Range(modifiedDocument.lineAt(diff.modifiedStartLineNumber - 1).range.start, modifiedDocument.lineAt(diff.modifiedEndLineNumber - 1).range.end);

			return selections.every(selection => !selection.intersection(modifiedRange));
		});

		if (selectedDiffs.length === diffs.length) {
			return;
		}

		const basename = path.basename(modifiedUri.fsPath);
		const message = localize('confirm revert', "Are you sure you want to revert the selected changes in {0}?", basename);
		const yes = localize('revert', "Revert Changes");
		const pick = await window.showWarningMessage(message, { modal: true }, yes);

		if (pick !== yes) {
			return;
		}

		const result = staging.applyChanges(originalDocument, modifiedDocument, selectedDiffs);
		const edit = new WorkspaceEdit();
		edit.replace(modifiedUri, new Range(new Position(0, 0), modifiedDocument.lineAt(modifiedDocument.lineCount - 1).range.end), result);
		workspace.applyEdit(edit);
	}

	@command('git.unstage')
	async unstage(...resourceStates: SourceControlResourceState[]): Promise<void> {
		if (resourceStates.length === 0) {
			const resource = this.getSCMResource();

			if (!resource) {
				return;
			}

			resourceStates = [resource];
		}

		const resources = resourceStates
			.filter(s => s instanceof Resource && s.resourceGroup instanceof IndexGroup) as Resource[];

		if (!resources.length) {
			return;
		}

		return await this.model.revertFiles(...resources);
	}

	@command('git.unstageAll')
	async unstageAll(): Promise<void> {
		return await this.model.revertFiles();
	}

	@command('git.unstageSelectedRanges', false, true)
	async unstageSelectedRanges(diffs: LineChange[]): Promise<void> {
		const textEditor = window.activeTextEditor;

		if (!textEditor) {
			return;
		}

		const modifiedDocument = textEditor.document;
		const modifiedUri = modifiedDocument.uri;

		if (modifiedUri.scheme !== 'git' || modifiedUri.query !== '') {
			return;
		}

		const originalUri = modifiedUri.with({ scheme: 'git', query: 'HEAD' });
		const originalDocument = await workspace.openTextDocument(originalUri);
		const selections = textEditor.selections;
		const selectedDiffs = diffs.filter(diff => {
			const modifiedRange = diff.modifiedEndLineNumber === 0
				? new Range(diff.modifiedStartLineNumber - 1, 0, diff.modifiedStartLineNumber - 1, 0)
				: new Range(modifiedDocument.lineAt(diff.modifiedStartLineNumber - 1).range.start, modifiedDocument.lineAt(diff.modifiedEndLineNumber - 1).range.end);

			return selections.some(selection => !!selection.intersection(modifiedRange));
		});

		if (!selectedDiffs.length) {
			return;
		}

		const invertedDiffs = selectedDiffs.map(c => ({
			modifiedStartLineNumber: c.originalStartLineNumber,
			modifiedEndLineNumber: c.originalEndLineNumber,
			originalStartLineNumber: c.modifiedStartLineNumber,
			originalEndLineNumber: c.modifiedEndLineNumber
		}));

		const result = staging.applyChanges(modifiedDocument, originalDocument, invertedDiffs);
		await this.model.stage(modifiedUri, result);
	}

	@command('git.clean')
	async clean(...resourceStates: SourceControlResourceState[]): Promise<void> {
		if (resourceStates.length === 0) {
			const resource = this.getSCMResource();

			if (!resource) {
				return;
			}

			resourceStates = [resource];
		}

		const resources = resourceStates
			.filter(s => s instanceof Resource && s.resourceGroup instanceof WorkingTreeGroup) as Resource[];

		if (!resources.length) {
			return;
		}

		const message = resources.length === 1
			? localize('confirm discard', "Are you sure you want to discard changes in {0}?", path.basename(resources[0].resourceUri.fsPath))
			: localize('confirm discard multiple', "Are you sure you want to discard changes in {0} files?", resources.length);

		const yes = localize('discard', "Discard Changes");
		const pick = await window.showWarningMessage(message, { modal: true }, yes);

		if (pick !== yes) {
			return;
		}

		await this.model.clean(...resources);
	}

	@command('git.cleanAll')
	async cleanAll(): Promise<void> {
		const message = localize('confirm discard all', "Are you sure you want to discard ALL changes?");
		const yes = localize('discard', "Discard Changes");
		const pick = await window.showWarningMessage(message, { modal: true }, yes);

		if (pick !== yes) {
			return;
		}

		await this.model.clean(...this.model.workingTreeGroup.resources);
	}

	private async smartCommit(
		getCommitMessage: () => Promise<string>,
		opts?: CommitOptions
	): Promise<boolean> {
		if (!opts) {
			opts = { all: this.model.indexGroup.resources.length === 0 };
		}

		if (
			// no changes
			(this.model.indexGroup.resources.length === 0 && this.model.workingTreeGroup.resources.length === 0)
			// or no staged changes and not `all`
			|| (!opts.all && this.model.indexGroup.resources.length === 0)
		) {
			window.showInformationMessage(localize('no changes', "There are no changes to commit."));
			return false;
		}

		const message = await getCommitMessage();

		if (!message) {
			// TODO@joao: show modal dialog to confirm empty message commit
			return false;
		}

		await this.model.commit(message, opts);

		return true;
	}

	private async commitWithAnyInput(opts?: CommitOptions): Promise<void> {
		const message = scm.inputBox.value;
		const getCommitMessage = async () => {
			if (message) {
				return message;
			}

			return await window.showInputBox({
				placeHolder: localize('commit message', "Commit message"),
				prompt: localize('provide commit message', "Please provide a commit message"),
				ignoreFocusOut: true
			});
		};

		const didCommit = await this.smartCommit(getCommitMessage, opts);

		if (message && didCommit) {
			scm.inputBox.value = await this.model.getCommitTemplate();
		}
	}

	@command('git.commit')
	async commit(): Promise<void> {
		await this.commitWithAnyInput();
	}

	@command('git.commitWithInput')
	async commitWithInput(): Promise<void> {
		const didCommit = await this.smartCommit(async () => scm.inputBox.value);

		if (didCommit) {
			scm.inputBox.value = await this.model.getCommitTemplate();
		}
	}

	@command('git.commitStaged')
	async commitStaged(): Promise<void> {
		await this.commitWithAnyInput({ all: false });
	}

	@command('git.commitStagedSigned')
	async commitStagedSigned(): Promise<void> {
		await this.commitWithAnyInput({ all: false, signoff: true });
	}

	@command('git.commitAll')
	async commitAll(): Promise<void> {
		await this.commitWithAnyInput({ all: true });
	}

	@command('git.commitAllSigned')
	async commitAllSigned(): Promise<void> {
		await this.commitWithAnyInput({ all: true, signoff: true });
	}

	@command('git.undoCommit')
	async undoCommit(): Promise<void> {
		const HEAD = this.model.HEAD;

		if (!HEAD || !HEAD.commit) {
			return;
		}

		const commit = await this.model.getCommit('HEAD');
		await this.model.reset('HEAD~');
		scm.inputBox.value = commit.message;
	}

	@command('git.checkout')
	async checkout(): Promise<void> {
		const config = workspace.getConfiguration('git');
		const checkoutType = config.get<string>('checkoutType') || 'all';
		const includeTags = checkoutType === 'all' || checkoutType === 'tags';
		const includeRemotes = checkoutType === 'all' || checkoutType === 'remote';

		const heads = this.model.refs.filter(ref => ref.type === RefType.Head)
			.map(ref => new CheckoutItem(ref));

		const tags = (includeTags ? this.model.refs.filter(ref => ref.type === RefType.Tag) : [])
			.map(ref => new CheckoutTagItem(ref));

		const remoteHeads = (includeRemotes ? this.model.refs.filter(ref => ref.type === RefType.RemoteHead) : [])
			.map(ref => new CheckoutRemoteHeadItem(ref));

		const picks = [...heads, ...tags, ...remoteHeads];
		const placeHolder = 'Select a ref to checkout';
		const choice = await window.showQuickPick<CheckoutItem>(picks, { placeHolder });

		if (!choice) {
			return;
		}

		await choice.run(this.model);
	}

	@command('git.branch')
	async branch(): Promise<void> {
		const result = await window.showInputBox({
			placeHolder: localize('branch name', "Branch name"),
			prompt: localize('provide branch name', "Please provide a branch name"),
			ignoreFocusOut: true
		});

		if (!result) {
			return;
		}

		const name = result.replace(/^\.|\/\.|\.\.|~|\^|:|\/$|\.lock$|\.lock\/|\\|\*|\s|^\s*$|\.$/g, '-');
		await this.model.branch(name);
	}

	@command('git.pull')
	async pull(): Promise<void> {
		const remotes = this.model.remotes;

		if (remotes.length === 0) {
			window.showWarningMessage(localize('no remotes to pull', "Your repository has no remotes configured to pull from."));
			return;
		}

		await this.model.pull();
	}

	@command('git.pullRebase')
	async pullRebase(): Promise<void> {
		const remotes = this.model.remotes;

		if (remotes.length === 0) {
			window.showWarningMessage(localize('no remotes to pull', "Your repository has no remotes configured to pull from."));
			return;
		}

		await this.model.pull(true);
	}

	@command('git.push')
	async push(): Promise<void> {
		const remotes = this.model.remotes;

		if (remotes.length === 0) {
			window.showWarningMessage(localize('no remotes to push', "Your repository has no remotes configured to push to."));
			return;
		}

		await this.model.push();
	}

	@command('git.pushTo')
	async pushTo(): Promise<void> {
		const remotes = this.model.remotes;

		if (remotes.length === 0) {
			window.showWarningMessage(localize('no remotes to push', "Your repository has no remotes configured to push to."));
			return;
		}

		if (!this.model.HEAD || !this.model.HEAD.name) {
			window.showWarningMessage(localize('nobranch', "Please check out a branch to push to a remote."));
			return;
		}

		const branchName = this.model.HEAD.name;
		const picks = remotes.map(r => ({ label: r.name, description: r.url }));
		const placeHolder = localize('pick remote', "Pick a remote to publish the branch '{0}' to:", branchName);
		const pick = await window.showQuickPick(picks, { placeHolder });

		if (!pick) {
			return;
		}

		this.model.push(pick.label, branchName);
	}

	@command('git.sync')
	async sync(): Promise<void> {
		const HEAD = this.model.HEAD;

		if (!HEAD || !HEAD.upstream) {
			return;
		}

		const config = workspace.getConfiguration('git');
		const shouldPrompt = config.get<boolean>('confirmSync') === true;

		if (shouldPrompt) {
			const message = localize('sync is unpredictable', "This action will push and pull commits to and from '{0}'.", HEAD.upstream);
			const yes = localize('ok', "OK");
			const neverAgain = localize('never again', "OK, Never Show Again");
			const pick = await window.showWarningMessage(message, { modal: true }, yes, neverAgain);

			if (pick === neverAgain) {
				await config.update('confirmSync', false, true);
			} else if (pick !== yes) {
				return;
			}
		}

		await this.model.sync();
	}

	@command('git.publish')
	async publish(): Promise<void> {
		const remotes = this.model.remotes;

		if (remotes.length === 0) {
			window.showWarningMessage(localize('no remotes to publish', "Your repository has no remotes configured to publish to."));
			return;
		}

		const branchName = this.model.HEAD && this.model.HEAD.name || '';
		const picks = this.model.remotes.map(r => r.name);
		const placeHolder = localize('pick remote', "Pick a remote to publish the branch '{0}' to:", branchName);
		const choice = await window.showQuickPick(picks, { placeHolder });

		if (!choice) {
			return;
		}

		await this.model.push(choice, branchName, { setUpstream: true });
	}

	@command('git.showOutput')
	showOutput(): void {
		this.outputChannel.show();
	}

	private createCommand(id: string, key: string, method: Function, skipModelCheck: boolean): (...args: any[]) => any {
		const result = (...args) => {
			if (!skipModelCheck && !this.model) {
				window.showInformationMessage(localize('disabled', "Git is either disabled or not supported in this workspace"));
				return;
			}

			this.telemetryReporter.sendTelemetryEvent('git.command', { command: id });

			const result = Promise.resolve(method.apply(this, args));

			return result.catch(async err => {
				let message: string;

				switch (err.gitErrorCode) {
					case 'DirtyWorkTree':
						message = localize('clean repo', "Please clean your repository working tree before checkout.");
						break;
					default:
						const hint = (err.stderr || err.message || String(err))
							.replace(/^error: /mi, '')
							.replace(/^> husky.*$/mi, '')
							.split(/[\r\n]/)
							.filter(line => !!line)
						[0];

						message = hint
							? localize('git error details', "Git: {0}", hint)
							: localize('git error', "Git error");

						break;
				}

				if (!message) {
					console.error(err);
					return;
				}

				const outputChannel = this.outputChannel as OutputChannel;
				const openOutputChannelChoice = localize('open git log', "Open Git Log");
				const choice = await window.showErrorMessage(message, openOutputChannelChoice);

				if (choice === openOutputChannelChoice) {
					outputChannel.show();
				}
			});
		};

		// patch this object, so people can call methods directly
		this[key] = result;

		return result;
	}

	private getSCMResource(uri?: Uri): Resource | undefined {
		uri = uri ? uri : window.activeTextEditor && window.activeTextEditor.document.uri;

		if (!uri) {
			return undefined;
		}

		if (uri.scheme === 'git') {
			uri = uri.with({ scheme: 'file' });
		}

		if (uri.scheme === 'file') {
			const uriString = uri.toString();

			return this.model.workingTreeGroup.resources.filter(r => r.resourceUri.toString() === uriString)[0]
				|| this.model.indexGroup.resources.filter(r => r.resourceUri.toString() === uriString)[0];
		}
	}

	dispose(): void {
		this.disposables.forEach(d => d.dispose());
	}
}