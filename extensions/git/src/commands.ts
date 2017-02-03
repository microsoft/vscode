/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

'use strict';

import { Uri, commands, scm, Disposable, SCMResourceGroup, SCMResource, window, workspace, QuickPickItem, OutputChannel } from 'vscode';
import { IRef, RefType } from './git';
import { Model, Resource, Status } from './model';
import { CommitController } from './commit';
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
						message = (err.stderr || err.message || String(err)).replace(/^error: /, '');
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

	private disposables: Disposable[];

	constructor(
		private model: Model,
		private commitController: CommitController,
		private outputChannel: OutputChannel
	) {
		this.disposables = CommandCenter.Commands
			.map(({ commandId, method }) => commands.registerCommand(commandId, method, this));
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
		const yes = localize('yes', "Yes");
		const no = localize('no, keep them', "No, keep them");
		const pick = await window.showQuickPick([yes, no], { placeHolder: message });

		if (pick !== yes) {
			return;
		}

		await this.model.clean(resource);
	}

	@CommandCenter.Command('git.cleanAll')
	@CommandCenter.CatchErrors
	async cleanAll(): Promise<void> {
		const message = localize('confirm clean all', "Are you sure you want to clean all changes?");
		const yes = localize('yes', "Yes");
		const no = localize('no, keep them', "No, keep them");
		const pick = await window.showQuickPick([yes, no], { placeHolder: message });

		if (pick !== yes) {
			return;
		}

		await this.model.clean(...this.model.workingTreeGroup.resources);
	}

	private async _commit(fn: () => Promise<string>): Promise<boolean> {
		if (this.model.indexGroup.resources.length === 0 && this.model.workingTreeGroup.resources.length === 0) {
			window.showInformationMessage(localize('no changes', "There are no changes to commit."));
			return false;
		}

		const message = await fn();

		if (!message) {
			// TODO@joao: show modal dialog to confirm empty message commit
			return false;
		}

		const all = this.model.indexGroup.resources.length === 0;
		await this.model.commit(message, { all });

		return true;
	}

	@CommandCenter.Command('git.commit')
	@CommandCenter.CatchErrors
	async commit(): Promise<void> {
		const message = this.commitController.message;

		const didCommit = await this._commit(async () => {
			if (message) {
				return message;
			}

			return await window.showInputBox({
				placeHolder: localize('commit message', "Commit message"),
				prompt: localize('provide commit message', "Please provide a commit message")
			});
		});

		if (message && didCommit) {
			this.commitController.message = '';
		}
	}

	@CommandCenter.Command('git.commitWithInput')
	@CommandCenter.CatchErrors
	async commitWithInput(): Promise<void> {
		const didCommit = await this._commit(async () => this.commitController.message);

		if (didCommit) {
			this.commitController.message = '';
		}
	}

	@CommandCenter.Command('git.commitStaged')
	@CommandCenter.CatchErrors
	async commitStaged(): Promise<void> {
		await Promise.reject('not implemented');
	}

	@CommandCenter.Command('git.commitStagedSigned')
	@CommandCenter.CatchErrors
	async commitStagedSigned(): Promise<void> {
		await Promise.reject('not implemented');
	}

	@CommandCenter.Command('git.commitAll')
	@CommandCenter.CatchErrors
	async commitAll(): Promise<void> {
		await Promise.reject('not implemented');
	}

	@CommandCenter.Command('git.commitAllSigned')
	@CommandCenter.CatchErrors
	async commitAllSigned(): Promise<void> {
		await Promise.reject('not implemented');
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
		await Promise.reject('not implemented');
	}

	@CommandCenter.Command('git.pullRebase')
	@CommandCenter.CatchErrors
	async pullRebase(): Promise<void> {
		await Promise.reject('not implemented');
	}

	@CommandCenter.Command('git.push')
	@CommandCenter.CatchErrors
	async push(): Promise<void> {
		await Promise.reject('not implemented');
	}

	@CommandCenter.Command('git.pushTo')
	@CommandCenter.CatchErrors
	async pushTo(): Promise<void> {
		await Promise.reject('not implemented');
	}

	@CommandCenter.Command('git.sync')
	@CommandCenter.CatchErrors
	async sync(): Promise<void> {
		await this.model.sync();
	}

	@CommandCenter.Command('git.publish')
	@CommandCenter.CatchErrors
	async publish(): Promise<void> {
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