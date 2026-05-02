/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as vscode from 'vscode';
import * as path from 'path';
import { promises as fs } from 'fs';
import type { ToolResult } from './executor';

const MAX_FILE_SIZE = 50 * 1024; // 50KB limit
const SKIP_PATTERNS = ['.env', '.pem', 'credentials', 'secret', '.key'];

function isPathSafe(workspaceRoot: string, filePath: string): boolean {
	const resolved = path.resolve(workspaceRoot, filePath);
	const normalizedRoot = path.resolve(workspaceRoot);

	if (process.platform === 'win32') {
		return resolved.toLowerCase().startsWith(normalizedRoot.toLowerCase() + path.sep) ||
			resolved.toLowerCase() === normalizedRoot.toLowerCase();
	}
	return resolved.startsWith(normalizedRoot + path.sep) || resolved === normalizedRoot;
}

function isSensitiveFile(filePath: string): boolean {
	const lower = filePath.toLowerCase();
	return SKIP_PATTERNS.some(p => lower.includes(p));
}

export async function readFileTool(
	workspaceRoot: string,
	filePath: string,
	startLine?: number,
	endLine?: number
): Promise<ToolResult> {
	// Validate path is inside workspace
	if (!isPathSafe(workspaceRoot, filePath)) {
		return {
			success: false,
			error: `Path '${filePath}' is outside workspace root`
		};
	}

	// Check for sensitive files
	if (isSensitiveFile(filePath)) {
		return {
			success: false,
			error: `Cannot read sensitive file: ${filePath}`
		};
	}

	const fullPath = path.resolve(workspaceRoot, filePath);

	try {
		const stat = await fs.stat(fullPath);

		if (!stat.isFile()) {
			return {
				success: false,
				error: `'${filePath}' is not a file`
			};
		}

		if (stat.size > MAX_FILE_SIZE) {
			return {
				success: false,
				error: `File too large (${Math.round(stat.size / 1024)}KB). Max: ${MAX_FILE_SIZE / 1024}KB. Use line range.`
			};
		}

		const content = await fs.readFile(fullPath, 'utf8');
		const lines = content.split('\n');

		let resultLines = lines;
		let truncated = false;

		if (startLine !== undefined || endLine !== undefined) {
			const start = Math.max(0, (startLine || 1) - 1);
			const end = endLine !== undefined ? endLine : lines.length;
			resultLines = lines.slice(start, end);
			truncated = end < lines.length || start > 0;
		}

		// Format with line numbers
		const numbered = resultLines.map((line, i) => {
			const lineNum = (startLine || 1) + i;
			return `${lineNum}|${line}`;
		}).join('\n');

		return {
			success: true,
			data: {
				path: filePath,
				content: numbered,
				total_lines: lines.length,
				lines_shown: resultLines.length
			},
			truncated
		};
	} catch (err: any) {
		if (err.code === 'ENOENT') {
			return {
				success: false,
				error: `File not found: ${filePath}`
			};
		}
		return {
			success: false,
			error: err.message || String(err)
		};
	}
}
