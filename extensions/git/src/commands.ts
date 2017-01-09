/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

'use strict';

import { commands, Disposable, SCMResourceGroup, SCMResource } from 'vscode';
import { Model } from './model';
import { log } from './util';

function refresh(model: Model): () => void {
	return () => {
		log('refresh');
		model.update();
	};
}

function openChange(resource: SCMResource): void {
	log('open change', resource);
}

function openFile(resource: SCMResource): void {
	log('open file', resource);
}

function stage(resource: SCMResource): void {
	log('stage', resource);
}

function stageAll(resourceGroup: SCMResourceGroup): void {
	log('stageAll', resourceGroup);
}

function unstage(resource: SCMResource): void {
	log('unstage', resource);
}

function unstageAll(resourceGroup: SCMResourceGroup): void {
	log('unstageAll', resourceGroup);
}

function clean(resource: SCMResource): void {
	log('clean', resource);
}

function cleanAll(resourceGroup: SCMResourceGroup): void {
	log('clean all', resourceGroup);
}

export function registerCommands(model: Model): Disposable {
	const disposables = [
		commands.registerCommand('git.refresh', refresh(model)),
		commands.registerCommand('git.openChange', openChange),
		commands.registerCommand('git.openFile', openFile),
		commands.registerCommand('git.stage', stage),
		commands.registerCommand('git.stageAll', stageAll),
		commands.registerCommand('git.unstage', unstage),
		commands.registerCommand('git.unstageAll', unstageAll),
		commands.registerCommand('git.clean', clean),
		commands.registerCommand('git.cleanAll', cleanAll),
	];

	return Disposable.from(...disposables);
}