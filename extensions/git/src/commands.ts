/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

'use strict';

import { Uri, commands, scm, Disposable, SCMResourceGroup, SCMResource, window, workspace, QuickPickItem, OutputChannel } from 'vscode';
import { IRef, RefType } from './git';
import { Model, Resource } from './model';
import { log } from './util';
import { decorate } from 'core-decorators';
import * as path from 'path';

type Command = (...args: any[]) => any;

function catchErrors(fn: (...args) => Promise<any>): (...args) => void {
	return (...args) => fn.call(this, ...args).catch(async err => {
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
		} else {
			console.error(err);
		}
	});
}

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

	private disposables: Disposable[] = [];

	constructor(private model: Model, private outputChannel: OutputChannel) {
		this.disposables.push(
			commands.registerCommand('git.refresh', this.refresh, this),
			commands.registerCommand('git.openChange', this.openChange, this),
			commands.registerCommand('git.openFile', this.openFile, this),
			commands.registerCommand('git.stage', this.stage, this),
			commands.registerCommand('git.stageAll', this.stageAll, this),
			commands.registerCommand('git.unstage', this.unstage, this),
			commands.registerCommand('git.unstageAll', this.unstageAll, this),
			commands.registerCommand('git.clean', this.clean, this),
			commands.registerCommand('git.cleanAll', this.cleanAll, this),
			commands.registerCommand('git.checkout', this.checkout, this),
			commands.registerCommand('git.sync', this.sync, this),
			commands.registerCommand('git.publish', this.publish, this),
		);
	}

	@decorate(catchErrors)
	async refresh(): Promise<void> {
		return await this.model.update();
	}

	openChange(uri: Uri): void {
		const resource = resolveGitResource(uri);
		log('open change', resource);
	}

	openFile(uri: Uri): void {
		const resource = resolveGitResource(uri);
		log('open file', resource);
	}

	@decorate(catchErrors)
	async stage(uri: Uri): Promise<void> {
		const resource = resolveGitResource(uri);

		if (!resource) {
			return;
		}

		return await this.model.stage(resource);
	}

	@decorate(catchErrors)
	async stageAll(): Promise<void> {
		return await this.model.stage();
	}

	@decorate(catchErrors)
	async unstage(uri: Uri): Promise<void> {
		const resource = resolveGitResource(uri);

		if (!resource) {
			return;
		}

		return await this.model.unstage(resource);
	}

	@decorate(catchErrors)
	async unstageAll(): Promise<void> {
		return await this.model.unstage();
	}

	@decorate(catchErrors)
	async clean(uri: Uri): Promise<void> {
		const resource = resolveGitResource(uri);

		if (!resource) {
			return;
		}

		const basename = path.basename(resource.uri.fsPath);
		const message = `Are you sure you want to clean changes in ${basename}?`;
		const yes = 'Yes';
		const no = 'No, keep them';
		const pick = await window.showQuickPick([no, yes], { placeHolder: message });

		if (pick !== yes) {
			return;
		}

		return await this.model.clean(resource);
	}

	@decorate(catchErrors)
	async cleanAll(): Promise<void> {
		const message = `Are you sure you want to clean all changes?`;
		const yes = 'Yes';
		const no = 'No, keep them';
		const pick = await window.showQuickPick([no, yes], { placeHolder: message });

		if (pick !== yes) {
			return;
		}

		return await this.model.clean(...this.model.workingTreeGroup.resources);
	}

	@decorate(catchErrors)
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

	@decorate(catchErrors)
	async sync(): Promise<void> {
		await this.model.sync();
	}

	@decorate(catchErrors)
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

	dispose(): void {
		this.disposables.forEach(d => d.dispose());
	}
}