/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { ExtensionContext, languages } from 'vscode';
import { registerAPICommands } from './api/api1';
import { GitBaseExtensionImpl } from './api/extension';
import { Model } from './model';
import { GitCommitFoldingProvider } from './foldingProvider';

export function activate(context: ExtensionContext): GitBaseExtensionImpl {
	const apiImpl = new GitBaseExtensionImpl(new Model());
	context.subscriptions.push(registerAPICommands(apiImpl));

	// Register folding provider for git-commit language
	context.subscriptions.push(
		languages.registerFoldingRangeProvider('git-commit', new GitCommitFoldingProvider())
	);

	return apiImpl;
}
