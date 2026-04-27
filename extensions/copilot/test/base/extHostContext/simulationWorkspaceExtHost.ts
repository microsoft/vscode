/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
// Allow importing vscode here. eslint does not let us exclude this path: https://github.com/import-js/eslint-plugin-import/issues/2800
/* eslint-disable local/no-runtime-import */

import { writeFileSync } from 'fs';
import * as vscode from 'vscode';
import { TestingServiceCollection } from '../../../src/platform/test/node/services';
import { SimulationWorkspace } from '../../../src/platform/test/node/simulationWorkspace';
import { isEqualOrParent } from '../../../src/util/vs/base/common/resources';
import { addExtensionHostSimulationServices } from './simulationExtHostContext';

export class SimulationWorkspaceExtHost extends SimulationWorkspace {
	private readonly _root = vscode.workspace.workspaceFolders![0].uri;

	public override setupServices(testingServiceCollection: TestingServiceCollection): void {
		super.setupServices(testingServiceCollection);
		addExtensionHostSimulationServices(testingServiceCollection);
		vscode.commands.executeCommand('setContext', 'vscode.chat.tools.global.autoApprove.testMode', true);
		vscode.workspace.getConfiguration('chat.tools.global').update('autoApprove', true, vscode.ConfigurationTarget.Global);
		vscode.workspace.getConfiguration('chat.tools.terminal').update('autoReplyToPrompts', true, vscode.ConfigurationTarget.Global);
	}

	override applyEdits(uri: vscode.Uri, edits: vscode.TextEdit[], initialRange?: vscode.Range): vscode.Range {
		const res = super.applyEdits(uri, edits, initialRange);

		if (isEqualOrParent(uri, this._root)) {
			const document = this.getDocument(uri);
			writeFileSync(uri.fsPath, document.getText(), 'utf8');
		}

		return res;
	}
}
