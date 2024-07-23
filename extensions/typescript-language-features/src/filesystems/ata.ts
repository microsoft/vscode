/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as vscode from 'vscode';
import { conditionalRegistration, requireGlobalConfiguration } from '../languageFeatures/util/dependentRegistration';
import { supportsReadableByteStreams } from '../utils/platform';
import { AutoInstallerFs } from './autoInstallerFs';
import { MemFs } from './memFs';

export function registerAtaSupport(): vscode.Disposable {
	if (!supportsReadableByteStreams()) {
		return vscode.Disposable.from();
	}

	return conditionalRegistration([
		requireGlobalConfiguration('typescript', 'tsserver.web.typeAcquisition.enabled'),
	], () => {
		return vscode.Disposable.from(
			vscode.workspace.registerFileSystemProvider('vscode-global-typings', new MemFs(), {
				isCaseSensitive: true,
				isReadonly: false
			}),
			vscode.workspace.registerFileSystemProvider('vscode-node-modules', new AutoInstallerFs(), {
				isCaseSensitive: true,
				isReadonly: false
			}));
	});
}
