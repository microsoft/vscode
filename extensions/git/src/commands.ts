/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

'use strict';

import { commands, Disposable, SCMResourceGroup, SCMResource } from 'vscode';
import { Model } from './model';
import { log } from './util';

function refresh(model: Model): void {
	log('refresh');
	model.update();
}

function openChange(model: Model, resource: SCMResource): void {
	log('open change', resource);
}

function openFile(model: Model, resource: SCMResource): void {
	log('open file', resource);
}

function stage(model: Model, resource: SCMResource): void {
	log('stage', resource);
}

function stageAll(model: Model, resourceGroup: SCMResourceGroup): void {
	log('stageAll', resourceGroup);
}

function unstage(model: Model, resource: SCMResource): void {
	log('unstage', resource);
}

function unstageAll(model: Model, resourceGroup: SCMResourceGroup): void {
	log('unstageAll', resourceGroup);
}

function clean(model: Model, resource: SCMResource): void {
	log('clean', resource);
}

function cleanAll(model: Model, resourceGroup: SCMResourceGroup): void {
	log('clean all', resourceGroup);
}

function bind(command: (model: Model, ...args: any[]) => any, model: Model): (...args: any[]) => any {
	return command.bind(null, model);
}

export function registerCommands(model: Model): Disposable {
	const disposables = [
		commands.registerCommand('git.refresh', bind(refresh, model)),
		commands.registerCommand('git.openChange', bind(openChange, model)),
		commands.registerCommand('git.openFile', bind(openFile, model)),
		commands.registerCommand('git.stage', bind(stage, model)),
		commands.registerCommand('git.stageAll', bind(stageAll, model)),
		commands.registerCommand('git.unstage', bind(unstage, model)),
		commands.registerCommand('git.unstageAll', bind(unstageAll, model)),
		commands.registerCommand('git.clean', bind(clean, model)),
		commands.registerCommand('git.cleanAll', bind(cleanAll, model)),
	];

	return Disposable.from(...disposables);
}