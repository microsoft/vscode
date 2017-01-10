/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

'use strict';

import { Uri, commands, scm, Disposable, SCMResourceGroup, SCMResource } from 'vscode';
import { Model, Resource, ResourceGroup } from './model';
import { log } from './util';

type Command = (...args: any[]) => any;

function refresh(model: Model): void {
	log('refresh');
	model.update();
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

function clean(model: Model, resource: Resource): void {
	log('clean', resource);
}

function cleanAll(model: Model, resourceGroup: ResourceGroup): void {
	log('clean all', resourceGroup);
}

function resolveURI<R>(command: (t: SCMResource | SCMResourceGroup | undefined) => R): (uri: Uri) => R | undefined {
	return uri => uri.authority !== 'git' ? undefined : command(scm.getResourceFromURI(uri));
}

function skipUndefined<T, R>(command: (t: T) => R): (t: T | undefined) => R | undefined {
	return t => t === undefined ? undefined : command(t);
}

// TODO: do more with these errors
function catchErrors<T, R>(command: (t: T) => Promise<R>): (t: T) => void {
	return t => command(t).catch(err => console.error(err));
}

function compose(command: Command, ...args: Function[]): Command {
	return args.reduce((r, fn) => fn(r), command) as Command;
}

export function registerCommands(model: Model): Disposable {
	const bindModel = command => (...args: any[]) => command(model, ...args);

	const disposables = [
		commands.registerCommand('git.refresh', compose(refresh, bindModel)),
		commands.registerCommand('git.openChange', compose(openChange, bindModel, resolveURI, skipUndefined)),
		commands.registerCommand('git.openFile', compose(openFile, bindModel, resolveURI, skipUndefined)),
		commands.registerCommand('git.stage', compose(stage, bindModel, resolveURI, skipUndefined, catchErrors)),
		commands.registerCommand('git.stageAll', compose(stageAll, bindModel, catchErrors)),
		commands.registerCommand('git.unstage', compose(unstage, bindModel, resolveURI, skipUndefined, catchErrors)),
		commands.registerCommand('git.unstageAll', compose(unstageAll, bindModel, catchErrors)),
		commands.registerCommand('git.clean', compose(clean, bindModel, resolveURI, skipUndefined)),
		commands.registerCommand('git.cleanAll', compose(cleanAll, bindModel, resolveURI, skipUndefined)),
	];

	return Disposable.from(...disposables);
}