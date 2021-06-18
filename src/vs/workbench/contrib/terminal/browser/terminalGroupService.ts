/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { ITerminalGroupService, ITerminalInstance } from 'vs/workbench/contrib/terminal/browser/terminal';

export class TerminalGroupService implements ITerminalGroupService {
	declare _serviceBrand: undefined;

	terminalInstances: ITerminalInstance[] = [];
}
