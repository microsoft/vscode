/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { GeneralShellType, TerminalShellType } from '../../../../../platform/terminal/common/terminal.js';

export const VSCODE_LSP_TERMINAL_PROMPT_TRACKER = 'vscode_lsp_terminal_prompt_tracker= {}\n';
export const PYLANCE_DEBUG_DISPLAY_NAME = `ms-python.python(.["')`;
export const PYTHON_LANGUAGE_ID = 'python';

export enum LspSupportedShellTypes {
	Python = GeneralShellType.Python,
	Powershell = GeneralShellType.PowerShell
}

export function isLspSupportedShellType(shellType: TerminalShellType): boolean {
	if (!shellType) {
		return false;
	}
	return shellType in LspSupportedShellTypes;
}

