/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * List of extension ids (lowercased) that are allowed to run in the sessions window
 * even if they would otherwise be disabled by the sessions window environment check.
 */
export const SESSIONS_WINDOW_ALLOWED_EXTENSIONS: ReadonlySet<string> = new Set<string>([
	'pkief.material-icon-theme',
	'zhuangtongfa.material-theme',
	'vscode-icons-team.vscode-icons',
	'oderwat.indent-rainbow',
	'formulahendry.auto-close-tag',
	'pranaygp.vscode-css-peek',
	'codezombiech.gitignore',
	'usernamehw.errorlens',
	'wayou.vscode-todo-highlight',
	'bierner.markdown-mermaid',
	'kisstkondoros.vscode-gutter-preview',
	'tomoki1207.pdf',
].map(id => id.toLowerCase()));
