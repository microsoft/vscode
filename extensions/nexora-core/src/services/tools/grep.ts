/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as vscode from 'vscode';
import type { ToolResult } from './executor';

const SKIP_DIRS = ['node_modules', '.git', '__pycache__', 'venv', '.venv', 'dist', 'build'];

export async function grepTool(
	workspaceRoot: string,
	pattern: string,
	glob: string = '**/*',
	maxResults: number = 20
): Promise<ToolResult> {
	try {
		// Use VS Code's findTextInFiles API
		const workspaceUri = vscode.Uri.file(workspaceRoot);

		// Build exclude pattern
		const excludePattern = `{${SKIP_DIRS.map(d => `**/${d}/**`).join(',')}}`;

		const results: Array<{
			file: string;
			line: number;
			text: string;
		}> = [];

		// Use workspace.findFiles + read approach since findTextInFiles may not be available
		const files = await vscode.workspace.findFiles(
			new vscode.RelativePattern(workspaceUri, glob),
			new vscode.RelativePattern(workspaceUri, excludePattern),
			500
		);

		const regex = new RegExp(pattern, 'gi');

		for (const file of files) {
			if (results.length >= maxResults) {
				break;
			}

			try {
				const doc = await vscode.workspace.openTextDocument(file);
				const text = doc.getText();
				const lines = text.split('\n');

				for (let i = 0; i < lines.length && results.length < maxResults; i++) {
					if (regex.test(lines[i])) {
						const relativePath = vscode.workspace.asRelativePath(file, false);
						results.push({
							file: relativePath,
							line: i + 1,
							text: lines[i].trim().slice(0, 200)
						});
					}
					regex.lastIndex = 0;
				}
			} catch {
				// Skip files that can't be read
			}
		}

		return {
			success: true,
			data: {
				pattern,
				matches: results,
				total: results.length
			},
			truncated: results.length >= maxResults
		};
	} catch (err) {
		return {
			success: false,
			error: err instanceof Error ? err.message : String(err)
		};
	}
}
