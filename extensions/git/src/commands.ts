/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

'use strict';

import { Uri, commands, scm, Disposable, SCMResourceGroup, SCMResource, window, workspace, QuickPickItem, OutputChannel } from 'vscode';
import { IRef, RefType } from './git';
import { Model, Resource, Status } from './model';
import * as path from 'path';

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

	get description(): string { return `Tag at ${this.shortCommit}`; }
}

class CheckoutRemoteHeadItem extends CheckoutItem {

	get description(): string { return `Remote branch at ${this.shortCommit}`; }

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
				if (err.gitErrorCode) {
					let message: string;

					switch (err.gitErrorCode) {
						case 'DirtyWorkTree':
							message = 'Please clean your repository working tree before checkout.';
							break;
						default:
							message = (err.stderr || err.message).replace(/^error: /, '');
							break;
					}

					const outputChannel = this.outputChannel as OutputChannel;
					const openOutputChannelChoice = 'Open Git Log';
					const choice = await window.showErrorMessage(message, openOutputChannelChoice);

					if (choice === openOutputChannelChoice) {
						outputChannel.show();
					}
				} else if (err.message) {
					window.showErrorMessage(err.message);
					console.error(err);
				} else {
					console.error(err);
				}
			});
		};
	}

	private disposables: Disposable[];

	constructor(private model: Model, private outputChannel: OutputChannel) {
		this.disposables = CommandCenter.Commands
			.map(({ commandId, method }) => commands.registerCommand(commandId, method, this));
	}

	@CommandCenter.Command('git.refresh')
	@CommandCenter.CatchErrors
	async refresh(): Promise<void> {
		await this.model.update();
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
				const query = indexStatus ? '~' : 'HEAD';
				return resource.uri.with({ scheme: 'git', query });
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
		const message = `Are you sure you want to clean changes in ${basename}?`;
		const yes = 'Yes';
		const no = 'No, keep them';
		const pick = await window.showQuickPick([yes, no], { placeHolder: message });

		if (pick !== yes) {
			return;
		}

		return await this.model.clean(resource);
	}

	@CommandCenter.Command('git.cleanAll')
	@CommandCenter.CatchErrors
	async cleanAll(): Promise<void> {
		const message = `Are you sure you want to clean all changes?`;
		const yes = 'Yes';
		const no = 'No, keep them';
		const pick = await window.showQuickPick([yes, no], { placeHolder: message });

		if (pick !== yes) {
			return;
		}

		return await this.model.clean(...this.model.workingTreeGroup.resources);
	}

	@CommandCenter.Command('git.checkout')
	@CommandCenter.CatchErrors
	async checkout(): Promise<void> {
		const config = workspace.getConfiguration('git');
		const checkoutType = config.get<string>('checkoutType');
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
		const placeHolder = `Pick a remote to publish the branch '${branchName}' to:`;
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