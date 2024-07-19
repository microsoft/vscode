/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { InstantiationType, registerSingleton } from 'vs/platform/instantiation/common/extensions';
import { TerminalSnippetsService } from 'vs/workbench/contrib/terminalContrib/snippets/common/terminalSnippetsService';
import { ITerminalSnippetsService } from 'vs/workbench/contrib/terminalContrib/snippets/common/terminal.snippets';

registerSingleton(ITerminalSnippetsService, TerminalSnippetsService, InstantiationType.Delayed);
