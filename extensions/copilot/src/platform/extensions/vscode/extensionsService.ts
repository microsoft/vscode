/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as vscode from 'vscode';
import { IExtensionsService } from '../common/extensionsService';

export class VSCodeExtensionsService implements IExtensionsService {
	declare readonly _serviceBrand: undefined;

	get all() {
		return vscode.extensions.all;
	}

	get allAcrossExtensionHosts() {
		return vscode.extensions.allAcrossExtensionHosts;
	}

	get onDidChange() {
		return vscode.extensions.onDidChange;
	}

	get getExtension() {
		return vscode.extensions.getExtension;
	}
}
