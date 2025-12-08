/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as os from 'os';
import * as path from 'path';
import * as vscode from 'vscode';
import { BaseServiceConfigurationProvider } from './configuration';

export class ElectronServiceConfigurationProvider extends BaseServiceConfigurationProvider {

	private fixPathPrefixes(inspectValue: string): string {
		const pathPrefixes = ['~' + path.sep];
		for (const pathPrefix of pathPrefixes) {
			if (inspectValue.startsWith(pathPrefix)) {
				return path.join(os.homedir(), inspectValue.slice(pathPrefix.length));
			}
		}
		return inspectValue;
	}

	protected readGlobalTsdk(configuration: vscode.WorkspaceConfiguration): string | null {
		const inspect = configuration.inspect('typescript.tsdk');
		if (inspect && typeof inspect.globalValue === 'string') {
			return this.fixPathPrefixes(inspect.globalValue);
		}
		return null;
	}

	protected readLocalTsdk(configuration: vscode.WorkspaceConfiguration): string | null {
		const inspect = configuration.inspect('typescript.tsdk');
		if (inspect && typeof inspect.workspaceValue === 'string') {
			return this.fixPathPrefixes(inspect.workspaceValue);
		}
		return null;
	}
}
