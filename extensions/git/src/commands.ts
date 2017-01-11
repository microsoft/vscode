/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

'use strict';

import { Uri, commands, scm, Disposable, SCMResourceGroup, SCMResource, window } from 'vscode';
import { Model, Resource } from './model';
import { log } from './util';
import { decorate } from 'core-decorators';
import * as path from 'path';

type Command = (...args: any[]) => any;

function catchErrors(fn: (...args) => Promise<any>): (...args) => void {
	return (...args) => fn.call(this, ...args).catch(err => console.error(err));
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

class CommandCenter {

	private disposables: Disposable[] = [];

	constructor(private model: Model) {
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
			commands.registerCommand('git.checkout', this.checkout, this)
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

	checkout(model: Model): void {
		console.log('checkout');
	}

	dispose(): void {
		this.disposables.forEach(d => d.dispose());
	}
}

export function registerCommands(model: Model): Disposable {
	return new CommandCenter(model);
}