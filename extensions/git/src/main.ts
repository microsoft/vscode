/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

'use strict';

import { findGit } from './git';
import { scm, ExtensionContext, workspace } from 'vscode';

export function log(...args: any[]): void {
	console.log.apply(console, ['git:', ...args]);
}

export function activate(context: ExtensionContext): any {
	const pathHint = workspace.getConfiguration('git').get<string>('path');

	findGit(pathHint).then(info => {
		log(`Using git ${info.version} from ${info.path}`);

		const provider = scm.createSCMProvider('git', {
			// getOriginalResource: uri => {
			// 	return uri;
			// }
		});
		context.subscriptions.push(provider);

		// return new Git({ gitPath: info.path, version: info.version });
	});
}