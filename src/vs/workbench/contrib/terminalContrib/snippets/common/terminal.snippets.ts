/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { createDecorator } from 'vs/platform/instantiation/common/instantiation';
import type { IWorkspaceFolder } from 'vs/platform/workspace/common/workspace';

export const ITerminalSnippetsService = createDecorator<ITerminalSnippetsService>('terminalSnippetsService');

export interface ITerminalSnippetsService {
	readonly _serviceBrand: undefined;

	getSnippets(workspaceFolder: IWorkspaceFolder): Map<string, ITerminalSnippet>;
}

export interface ITerminalSnippet {
	prefix: string[] | string;
	body: string[] | string;
	description?: string;
}
