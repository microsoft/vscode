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

function stage(model: Model, resource: Resource): void {
	log('stage', resource);
}

function stageAll(model: Model, resourceGroup: ResourceGroup): void {
	log('stageAll', resourceGroup);
}

function unstage(model: Model, resource: Resource): void {
	log('unstage', resource);
}

function unstageAll(model: Model, resourceGroup: ResourceGroup): void {
	log('unstageAll', resourceGroup);
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

function compose(command: Command, ...args: Function[]): Command {
	return args.reduce((r, fn) => fn(r), command) as Command;
}

export function registerCommands(model: Model): Disposable {
	const bindModel = command => (...args: any[]) => command(model, ...args);

	const disposables = [
		commands.registerCommand('git.refresh', compose(refresh, bindModel)),
		commands.registerCommand('git.openChange', compose(openChange, bindModel, resolveURI, skipUndefined)),
		commands.registerCommand('git.openFile', compose(openFile, bindModel, resolveURI, skipUndefined)),
		commands.registerCommand('git.stage', compose(stage, bindModel, resolveURI, skipUndefined)),
		commands.registerCommand('git.stageAll', compose(stageAll, bindModel, resolveURI, skipUndefined)),
		commands.registerCommand('git.unstage', compose(unstage, bindModel, resolveURI, skipUndefined)),
		commands.registerCommand('git.unstageAll', compose(unstageAll, bindModel, resolveURI, skipUndefined)),
		commands.registerCommand('git.clean', compose(clean, bindModel, resolveURI, skipUndefined)),
		commands.registerCommand('git.cleanAll', compose(cleanAll, bindModel, resolveURI, skipUndefined)),
	];

	return Disposable.from(...disposables);
}