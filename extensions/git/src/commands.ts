/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

'use strict';

import { commands, Disposable } from 'vscode';
import { Model } from './model';
import { log } from './util';

function refresh(model: Model): () => void {
	return () => {
		log('refresh');
		model.update();
	};
}

function openChange(...args: any[]): void {
	console.log('openChange', args);
}

export function registerCommands(model: Model): Disposable {
	const disposables = [
		commands.registerCommand('git.refresh', refresh(model)),
		commands.registerCommand('git.open-change', openChange)
	];

	return Disposable.from(...disposables);
}