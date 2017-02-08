/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

'use strict';

import { Uri, commands, scm, Disposable, SCMResourceGroup, SCMResource, window, workspace, QuickPickItem, OutputChannel } from 'vscode';
import { IRef, RefType } from './git';
import { Model, Resource, Status, CommitOptions } from './model';
import * as path from 'path';
import * as nls from 'vscode-nls';

const localize = nls.loadMessageBundle();

function resolveGitURI(uri: Uri): SCMResource | SCMResourceGroup | undefined {
	if (uri.authority !== 'git') {
		return;
	}

	return scm.getResourceFromURI(uri);
}

function resolveGitResource(uri: Uri): Resource | undefined {
	const resource = resolveGitURI(uri);

	if (!(resource instanceof Resource)) {
		return;
	}

	return resource;
}

class CheckoutItem implements QuickPickItem {

	protected get shortCommit(): string { return (this.ref.commit || '').substr(0, 8); }
	protected get treeish(): string | undefined { return this.ref.name; }
	get label(): string { return this.ref.name || this.shortCommit; }
	get description(): string { return this.shortCommit; }

	constructor(protected ref: IRef) { }

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

export class CommandCenter {

	private static readonly Commands: { commandId: string; method: any; }[] = [];
	private static Command(commandId: string): Function {
		return (target: any, key: string, descriptor: any) => {
			if (!(typeof descriptor.value === 'function')) {
				throw new Error('not supported');
			}

			CommandCenter.Commands.push({ commandId, method: descriptor.value });
		};
	}

	private static CatchErrors(target: any, key: string, descriptor: any): void {
		if (!(typeof descriptor.value === 'function')) {
			throw new Error('not supported');
		}

		const fn = descriptor.value;

		descriptor.value = function (...args: any[]) {
			fn.apply(this, args).catch(async err => {
				let message: string;

				switch (err.gitErrorCode) {
					case 'DirtyWorkTree':
						message = localize('clean repo', "Please clean your repository working tree before checkout.");
						break;
					default:
						const lines = (err.stderr || err.message || String(err))
							.replace(/^error: /, '')
							.split(/[\r\n]/)
							.filter(line => !!line);

						message = lines[0] || 'Git error';
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
	}

	private model: Model;
	private disposables: Disposable[];

	constructor(
		model: Model | undefined,
		private outputChannel: OutputChannel
	) {
		if (model) {
			this.model = model;
		}

		this.disposables = CommandCenter.Commands
			.map(({ commandId, method }) => commands.registerCommand(commandId, (...args) => {
				if (!model) {
					window.showInformationMessage(localize('disabled', "Git is either disabled or not supported in this workspace"));
					return;
				}

				return method.apply(this, args);
			}));
	}

	@CommandCenter.Command('git.refresh')
	@CommandCenter.CatchErrors
	async refresh(): Promise<void> {
		await this.model.status();
	}

	@CommandCenter.Command('git.openChange')
	@CommandCenter.CatchErrors
	async openChange(uri: Uri): Promise<void> {
		const resource = resolveGitResource(uri);

		if (!resource) {
			return;
		}

		return this.open(resource);
	}

	async open(resource: Resource): Promise<void> {
		const left = this.getLeftResource(resource);
		const right = this.getRightResource(resource);
		const title = this.getTitle(resource);

		if (!left) {
			if (!right) {
				// TODO
				console.error('oh no');
				return;
			}

			return commands.executeCommand<void>('vscode.open', right);
		}

		return commands.executeCommand<void>('vscode.diff', left, right, title);
	}

	private getLeftResource(resource: Resource): Uri | undefined {
		switch (resource.type) {
			case Status.INDEX_MODIFIED:
			case Status.INDEX_RENAMED:
				return resource.uri.with({ scheme: 'git', query: 'HEAD' });

			case Status.MODIFIED:
				const uriString = resource.uri.toString();
				const [indexStatus] = this.model.indexGroup.resources.filter(r => r.uri.toString() === uriString);

				if (indexStatus) {
					return resource.uri.with({ scheme: 'git' });
				}

				return resource.uri.with({ scheme: 'git', query: 'HEAD' });
		}
	}

	private getRightResource(resource: Resource): Uri | undefined {
		switch (resource.type) {
			case Status.INDEX_MODIFIED:
			case Status.INDEX_ADDED:
			case Status.INDEX_COPIED:
			case Status.INDEX_RENAMED:
				return resource.uri.with({ scheme: 'git' });

			case Status.INDEX_DELETED:
			case Status.DELETED:
				return resource.uri.with({ scheme: 'git', query: 'HEAD' });

			case Status.MODIFIED:
			case Status.UNTRACKED:
			case Status.IGNORED:
			case Status.BOTH_MODIFIED:
				return resource.uri;
		}
	}

	private getTitle(resource: Resource): string {
		const basename = path.basename(resource.uri.fsPath);

		switch (resource.type) {
			case Status.INDEX_MODIFIED:
			case Status.INDEX_RENAMED:
				return `${basename} (Index)`;

			case Status.MODIFIED:
				return `${basename} (Working Tree)`;
		}

		return '';
	}

	@CommandCenter.Command('git.openFile')
	@CommandCenter.CatchErrors
	async openFile(uri: Uri): Promise<void> {
		const resource = resolveGitResource(uri);

		if (!resource) {
			return;
		}

		return commands.executeCommand<void>('vscode.open', resource.uri);
	}

	@CommandCenter.Command('git.stage')
	@CommandCenter.CatchErrors
	async stage(uri: Uri): Promise<void> {
		const resource = resolveGitResource(uri);

		if (!resource) {
			return;
		}

		return await this.model.stage(resource);
	}

	@CommandCenter.Command('git.stageAll')
	@CommandCenter.CatchErrors
	async stageAll(): Promise<void> {
		return await this.model.stage();
	}

	@CommandCenter.Command('git.unstage')
	@CommandCenter.CatchErrors
	async unstage(uri: Uri): Promise<void> {
		const resource = resolveGitResource(uri);

		if (!resource) {
			return;
		}

		return await this.model.unstage(resource);
	}

	@CommandCenter.Command('git.unstageAll')
	@CommandCenter.CatchErrors
	async unstageAll(): Promise<void> {
		return await this.model.unstage();
	}

	@CommandCenter.Command('git.clean')
	@CommandCenter.CatchErrors
	async clean(uri: Uri): Promise<void> {
		const resource = resolveGitResource(uri);

		if (!resource) {
			return;
		}

		const basename = path.basename(resource.uri.fsPath);
		const message = localize('confirm clean', "Are you sure you want to clean changes in {0}?", basename);
		const yes = localize('clean', "Clean Changes");
		const pick = await window.showWarningMessage(message, { modal: true }, yes);

		if (pick !== yes) {
			return;
		}

		await this.model.clean(resource);
	}

	@CommandCenter.Command('git.cleanAll')
	@CommandCenter.CatchErrors
	async cleanAll(): Promise<void> {
		const message = localize('confirm clean all', "Are you sure you want to clean all changes?");
		const yes = localize('clean', "Clean Changes");
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
				prompt: localize('provide commit message', "Please provide a commit message")
			});
		};

		const didCommit = await this.smartCommit(getCommitMessage, opts);

		if (message && didCommit) {
			scm.inputBox.value = '';
		}
	}

	@CommandCenter.Command('git.commit')
	@CommandCenter.CatchErrors
	async commit(): Promise<void> {
		await this.commitWithAnyInput();
	}

	@CommandCenter.Command('git.commitWithInput')
	@CommandCenter.CatchErrors
	async commitWithInput(): Promise<void> {
		const didCommit = await this.smartCommit(async () => scm.inputBox.value);

		if (didCommit) {
			scm.inputBox.value = '';
		}
	}

	@CommandCenter.Command('git.commitStaged')
	@CommandCenter.CatchErrors
	async commitStaged(): Promise<void> {
		await this.commitWithAnyInput({ all: false });
	}

	@CommandCenter.Command('git.commitStagedSigned')
	@CommandCenter.CatchErrors
	async commitStagedSigned(): Promise<void> {
		await this.commitWithAnyInput({ all: false, signoff: true });
	}

	@CommandCenter.Command('git.commitAll')
	@CommandCenter.CatchErrors
	async commitAll(): Promise<void> {
		await this.commitWithAnyInput({ all: true });
	}

	@CommandCenter.Command('git.commitAllSigned')
	@CommandCenter.CatchErrors
	async commitAllSigned(): Promise<void> {
		await this.commitWithAnyInput({ all: true, signoff: true });
	}

	@CommandCenter.Command('git.undoCommit')
	@CommandCenter.CatchErrors
	async undoCommit(): Promise<void> {
		await Promise.reject('not implemented');
	}

	@CommandCenter.Command('git.checkout')
	@CommandCenter.CatchErrors
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

	@CommandCenter.Command('git.branch')
	@CommandCenter.CatchErrors
	async branch(): Promise<void> {
		const result = await window.showInputBox({
			placeHolder: localize('branch name', "Branch name"),
			prompt: localize('provide branch name', "Please provide a branch name")
		});

		if (!result) {
			return;
		}

		const name = result.replace(/^\.|\/\.|\.\.|~|\^|:|\/$|\.lock$|\.lock\/|\\|\*|\s|^\s*$|\.$/g, '-');
		await this.model.branch(name);
	}

	@CommandCenter.Command('git.pull')
	@CommandCenter.CatchErrors
	async pull(): Promise<void> {
		const remotes = this.model.remotes;

		if (remotes.length === 0) {
			window.showWarningMessage(localize('no remotes to pull', "Your repository has no remotes configured to pull from."));
			return;
		}

		await this.model.pull();
	}

	@CommandCenter.Command('git.pullRebase')
	@CommandCenter.CatchErrors
	async pullRebase(): Promise<void> {
		const remotes = this.model.remotes;

		if (remotes.length === 0) {
			window.showWarningMessage(localize('no remotes to pull', "Your repository has no remotes configured to pull from."));
			return;
		}

		await this.model.pull(true);
	}

	@CommandCenter.Command('git.push')
	@CommandCenter.CatchErrors
	async push(): Promise<void> {
		const remotes = this.model.remotes;

		if (remotes.length === 0) {
			window.showWarningMessage(localize('no remotes to push', "Your repository has no remotes configured to push to."));
			return;
		}

		await this.model.push();
	}

	@CommandCenter.Command('git.pushTo')
	@CommandCenter.CatchErrors
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

	@CommandCenter.Command('git.sync')
	@CommandCenter.CatchErrors
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

	@CommandCenter.Command('git.publish')
	@CommandCenter.CatchErrors
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

	@CommandCenter.Command('git.showOutput')
	showOutput(): void {
		this.outputChannel.show();
	}

	dispose(): void {
		this.disposables.forEach(d => d.dispose());
	}
}