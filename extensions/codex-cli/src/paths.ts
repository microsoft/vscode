/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as os from 'os';
import * as path from 'path';
import * as vscode from 'vscode';

export function getBundledCodexPath(context: vscode.ExtensionContext): string {
	const platform = os.platform();
	const arch = os.arch();

	let subdir: string | undefined;

	if (platform === 'darwin' && arch === 'arm64') {
		subdir = 'darwin-arm64';
	}
	// TODO: future cases (darwin-x64, linux-x64, win32, etc.)

	if (!subdir) {
		throw new Error(`Unsupported platform for bundled Codex CLI: ${platform} ${arch}`);
	}

	const exeName = platform === 'win32' ? 'codex.exe' : 'codex';
	return context.asAbsolutePath(path.join('bin', subdir, exeName));
}
