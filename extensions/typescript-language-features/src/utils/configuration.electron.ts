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

	protected override extractGlobalTsdk(configuration: vscode.WorkspaceConfiguration): string | null {
		const result = super.extractGlobalTsdk(configuration);
		return result && this.fixPathPrefixes(result);
	}

	protected override extractLocalTsdk(configuration: vscode.WorkspaceConfiguration): string | null {
		const result = super.extractLocalTsdk(configuration);
		return result && this.fixPathPrefixes(result);
	}
}
