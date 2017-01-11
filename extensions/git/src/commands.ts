/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

'use strict';

import { Uri, commands, scm, Disposable, SCMResourceGroup, SCMResource, window } from 'vscode';
import { Model, Resource } from './model';
import { log } from './util';
import * as path from 'path';

type Command = (...args: any[]) => any;

async function refresh(model: Model): Promise<void> {
	return await model.update();
}

function openChange(model: Model, resource: Resource): void {
	log('open change', resource);
}

function openFile(model: Model, resource: Resource): void {
	log('open file', resource);
}

async function stage(model: Model, resource: Resource): Promise<void> {
	return await model.stage(resource);
}

async function stageAll(model: Model): Promise<void> {
	return await model.stage();
}

async function unstage(model: Model, resource: Resource): Promise<void> {
	return await model.unstage(resource);
}

async function unstageAll(model: Model): Promise<void> {
	return await model.unstage();
}

async function clean(model: Model, resource: Resource): Promise<void> {
	const basename = path.basename(resource.uri.fsPath);
	const message = `Are you sure you want to clean changes in ${basename}?`;
	const yes = 'Yes';
	const no = 'No, keep them';
	const pick = await window.showQuickPick([no, yes], { placeHolder: message });

	if (pick !== yes) {
		return;
	}

	return await model.clean(resource);
}

async function cleanAll(model: Model): Promise<void> {
	const message = `Are you sure you want to clean all changes?`;
	const yes = 'Yes';
	const no = 'No, keep them';
	const pick = await window.showQuickPick([no, yes], { placeHolder: message });

	if (pick !== yes) {
		return;
	}

	return await model.clean(...model.workingTreeGroup.resources);
}

function checkout(model: Model): void {
	console.log('checkout');
}

function resolveURI<R>(command: (t: SCMResource | SCMResourceGroup | undefined) => R): (uri: Uri) => R | undefined {
	return uri => {
		if (uri.authority !== 'git') {
			return;
		}

		const result = scm.getResourceFromURI(uri);

		if (!result) {
			return;
		}

		return command(result);
	};
}

// TODO: do more with these errors
function catchErrors<T, R>(command: (...args: any[]) => Promise<R>): (...args: any[]) => void {
	return (...args) => command(...args).catch(err => console.error(err));
}

function compose(command: Command, ...args: Function[]): Command {
	return args.reduce((r, fn) => fn(r), command) as Command;
}

export function registerCommands(model: Model): Disposable {
	const bindModel = command => (...args: any[]) => command(model, ...args);

	const disposables = [
		commands.registerCommand('git.refresh', compose(refresh, catchErrors, bindModel)),
		commands.registerCommand('git.openChange', compose(openChange, bindModel, resolveURI)),
		commands.registerCommand('git.openFile', compose(openFile, bindModel, resolveURI)),
		commands.registerCommand('git.stage', compose(stage, catchErrors, bindModel, resolveURI)),
		commands.registerCommand('git.stageAll', compose(stageAll, catchErrors, bindModel)),
		commands.registerCommand('git.unstage', compose(unstage, catchErrors, bindModel, resolveURI)),
		commands.registerCommand('git.unstageAll', compose(unstageAll, catchErrors, bindModel)),
		commands.registerCommand('git.clean', compose(clean, catchErrors, bindModel, resolveURI)),
		commands.registerCommand('git.cleanAll', compose(cleanAll, catchErrors, bindModel)),
		commands.registerCommand('git.checkout', compose(checkout, bindModel)),
	];

	return Disposable.from(...disposables);
}