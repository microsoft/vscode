/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { GeneralShellType, TerminalShellType } from '../../../../../platform/terminal/common/terminal.js';

export const VSCODE_LSP_TERMINAL_PROMPT_TRACKER = 'vscode_lsp_terminal_prompt_tracker= {}\n';
export const PYLANCE_DEBUG_DISPLAY_NAME = `ms-python.python(.["')`;
export const NEW_PYLANCE_DEBUG_DISPLAY_NAME = `ms-python.vscode-pylance(.["')`;
export const PYTHON_LANGUAGE_ID = 'python';
export const PWSH_LANGUAGE_ID = 'powershell';
export const PWSH_DEBUG_DISPLAY_NAME = `ms-vscode.powershell(.-:\\$ )`;

export function mapShellTypeToExtension(shellType: TerminalShellType): string {
	switch (shellType) {
		case GeneralShellType.Python:
			return 'py';
		case GeneralShellType.PowerShell:
			return 'ps1';
		default:
			// This will never happen, since function will only get called after checking `isLspSupportedShellType`
			return '';
	}
}

