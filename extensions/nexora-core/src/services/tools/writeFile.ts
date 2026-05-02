/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as vscode from 'vscode';
import * as path from 'path';
import { promises as fs } from 'fs';
import type { ToolResult } from './executor';

const SKIP_PATTERNS = ['.env', '.pem', 'credentials', 'secret', '.key', 'node_modules', '.git'];

function isPathSafe(workspaceRoot: string, filePath: string): boolean {
	const resolved = path.resolve(workspaceRoot, filePath);
	const normalizedRoot = path.resolve(workspaceRoot);

	if (process.platform === 'win32') {
		return resolved.toLowerCase().startsWith(normalizedRoot.toLowerCase() + path.sep) ||
			resolved.toLowerCase() === normalizedRoot.toLowerCase();
	}
	return resolved.startsWith(normalizedRoot + path.sep) || resolved === normalizedRoot;
}

function isSensitivePath(filePath: string): boolean {
	const lower = filePath.toLowerCase();
	return SKIP_PATTERNS.some(p => lower.includes(p));
}

/**
 * Write or create a file in the workspace.
 * Shows confirmation dialog before writing.
 */
export async function writeFileTool(
	workspaceRoot: string,
	filePath: string,
	content: string,
	requireConfirmation: boolean = true
): Promise<ToolResult> {
	// Validate path is inside workspace
	if (!isPathSafe(workspaceRoot, filePath)) {
		return {
			success: false,
			error: `Path '${filePath}' is outside workspace root`
		};
	}

	// Check for sensitive paths
	if (isSensitivePath(filePath)) {
		return {
			success: false,
			error: `Cannot write to sensitive path: ${filePath}`
		};
	}

	const fullPath = path.resolve(workspaceRoot, filePath);
	const isNewFile = !await fs.access(fullPath).then(() => true).catch(() => false);

	// Show confirmation dialog
	if (requireConfirmation) {
		const action = isNewFile ? 'Create' : 'Overwrite';
		const result = await vscode.window.showWarningMessage(
			`${action} file: ${filePath}?`,
			{ modal: true, detail: `Content: ${content.slice(0, 200)}${content.length > 200 ? '...' : ''}` },
			'Yes',
			'No'
		);

		if (result !== 'Yes') {
			return {
				success: false,
				error: 'User cancelled file write'
			};
		}
	}

	try {
		// Ensure parent directory exists
		const dir = path.dirname(fullPath);
		await fs.mkdir(dir, { recursive: true });

		// Write file
		await fs.writeFile(fullPath, content, 'utf8');

		return {
			success: true,
			data: {
				path: filePath,
				action: isNewFile ? 'created' : 'overwritten',
				bytes: content.length
			}
		};
	} catch (err: any) {
		return {
			success: false,
			error: err.message || String(err)
		};
	}
}
