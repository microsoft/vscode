/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as vscode from 'vscode';
import { IExtensionContribution } from '../../../extension/common/contributions';
import { IWorkspaceMutationManager } from '../../../platform/testing/common/workspaceMutationManager';
import { Disposable } from '../../../util/vs/base/common/lifecycle';
import { SetupTestFileScheme } from '../common/files';

export class SetupTestsContribution extends Disposable implements IExtensionContribution {
	constructor(
		@IWorkspaceMutationManager workspaceMutationManager: IWorkspaceMutationManager,
	) {
		super();
		this._register(vscode.workspace.registerTextDocumentContentProvider(SetupTestFileScheme, {
			provideTextDocumentContent(uri, token) {
				return workspaceMutationManager.get(uri.authority).get(uri.path, token);
			},
		}));
		this._register(vscode.commands.registerCommand('github.copilot.tests.applyMutations', (requestId: string) => {
			vscode.window.withProgress({
				location: vscode.ProgressLocation.Notification,
				cancellable: true,
			}, async (progress, token) => {
				try {
					return await workspaceMutationManager.get(requestId).apply(progress, token);
				} catch (e) {
					vscode.window.showErrorMessage(`Failed to apply edits: ${e.message}`);
				}
			});
		}));
	}
}
