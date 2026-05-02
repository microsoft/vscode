/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as vscode from 'vscode';
import type { ToolResult } from './executor';

const SKIP_DIRS = ['node_modules', '.git', '__pycache__', 'venv', '.venv', 'dist', 'build', '.next', '.cache'];

export async function listFilesTool(
	workspaceRoot: string,
	glob: string = '**/*',
	maxResults: number = 50
): Promise<ToolResult> {
	try {
		const workspaceUri = vscode.Uri.file(workspaceRoot);

		// Build exclude pattern
		const excludePattern = `{${SKIP_DIRS.map(d => `**/${d}/**`).join(',')}}`;

		const files = await vscode.workspace.findFiles(
			new vscode.RelativePattern(workspaceUri, glob),
			new vscode.RelativePattern(workspaceUri, excludePattern),
			maxResults + 1
		);

		const truncated = files.length > maxResults;
		const limitedFiles = files.slice(0, maxResults);

		const relativePaths = limitedFiles.map(f =>
			vscode.workspace.asRelativePath(f, false)
		).sort();

		return {
			success: true,
			data: {
				glob,
				files: relativePaths,
				total: relativePaths.length
			},
			truncated
		};
	} catch (err) {
		return {
			success: false,
			error: err instanceof Error ? err.message : String(err)
		};
	}
}
