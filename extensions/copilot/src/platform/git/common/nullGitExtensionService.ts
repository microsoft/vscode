/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import type * as vscode from 'vscode';
import { Event } from '../../../util/vs/base/common/event';
import { IGitExtensionService } from './gitExtensionService';

export class NullGitExtensionService implements IGitExtensionService {
	declare readonly _serviceBrand: undefined;

	onDidChange: vscode.Event<{ enabled: boolean }> = Event.None;

	readonly extensionAvailable: boolean = false;

	getExtensionApi(): undefined {
		return undefined;
	}
}
