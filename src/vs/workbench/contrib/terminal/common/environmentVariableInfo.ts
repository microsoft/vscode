/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { IEnvironmentVariableInfo } from 'vs/workbench/contrib/terminal/common/environmentVariable';

export class EnvironmentVariableInfoStale implements IEnvironmentVariableInfo {
	getInfo(): string {
		return 'stale';
	}
	getIcon(): string {
		return 'warning';
	}
}

export class EnvironmentVariableInfoChangesActive implements IEnvironmentVariableInfo {
	getInfo(): string {
		return 'info';
	}
	getIcon(): string {
		return 'info';
	}
}
