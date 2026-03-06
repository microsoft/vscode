/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as fs from 'fs';
import { isAbsolute, normalize, resolve } from '../../../../base/common/path.js';
import { IAgentTool, IToolContext, IToolResult } from '../../common/tools.js';

const MAX_FILE_SIZE = 1024 * 1024; // 1 MB
const MAX_OUTPUT_LINES = 2000;

/**
 * Tool that reads file contents from disk.
 * Supports optional line range to read a portion of the file.
 */
export class ReadFileTool implements IAgentTool {
	readonly name = 'read_file';
	readonly description = 'Read the contents of a file from disk. Supports optional line range for reading a portion of the file.';
	readonly parametersSchema = {
		type: 'object',
		properties: {
			path: {
				type: 'string',
				description: 'The file path to read (absolute or relative to working directory).',
			},
			startLine: {
				type: 'number',
				description: 'Optional 1-based start line number.',
			},
			endLine: {
				type: 'number',
				description: 'Optional 1-based end line number (inclusive).',
			},
		},
		required: ['path'],
	};
	readonly readOnly = true;

	async execute(args: Record<string, unknown>, context: IToolContext): Promise<IToolResult> {
		const filePath = args['path'];
		if (typeof filePath !== 'string' || !filePath) {
			return { content: 'Error: "path" argument is required and must be a string.', isError: true };
		}

		const resolvedPath = isAbsolute(filePath)
			? filePath
			: resolve(context.workingDirectory, filePath);

		// Security: prevent path traversal outside working directory for relative paths
		if (!isAbsolute(filePath)) {
			const normalizedResolved = normalize(resolvedPath);
			const normalizedWorkDir = normalize(context.workingDirectory);
			// Ensure the work dir ends with separator to prevent prefix collisions
			// (e.g., /repo/project must not match /repo/project2/...)
			const workDirPrefix = normalizedWorkDir.endsWith('/') ? normalizedWorkDir : normalizedWorkDir + '/';
			if (!normalizedResolved.startsWith(workDirPrefix) && normalizedResolved !== normalizedWorkDir) {
				return { content: 'Error: Path traversal outside working directory is not allowed.', isError: true };
			}
		}

		try {
			const stat = await fs.promises.stat(resolvedPath);
			if (stat.isDirectory()) {
				return { content: `Error: "${filePath}" is a directory, not a file.`, isError: true };
			}
			if (stat.size > MAX_FILE_SIZE) {
				return { content: `Error: File is too large (${stat.size} bytes, max ${MAX_FILE_SIZE} bytes). Use startLine/endLine to read a portion.`, isError: true };
			}

			const content = await fs.promises.readFile(resolvedPath, 'utf-8');
			const lines = content.split('\n');

			const startLine = typeof args['startLine'] === 'number' ? Math.max(1, Math.floor(args['startLine'])) : 1;
			const endLine = typeof args['endLine'] === 'number' ? Math.min(lines.length, Math.floor(args['endLine'])) : lines.length;

			const selectedLines = lines.slice(startLine - 1, endLine);
			let result: string;

			if (selectedLines.length > MAX_OUTPUT_LINES) {
				result = selectedLines.slice(0, MAX_OUTPUT_LINES).join('\n');
				result += `\n\n[Output truncated: showing ${MAX_OUTPUT_LINES} of ${selectedLines.length} lines]`;
			} else {
				result = selectedLines.join('\n');
			}

			// Add line number context if a range was requested
			if (startLine > 1 || endLine < lines.length) {
				return { content: `Lines ${startLine}-${Math.min(endLine, lines.length)} of ${lines.length}:\n${result}` };
			}

			return { content: result };
		} catch (err) {
			const errnoErr = err as NodeJS.ErrnoException;
			if (errnoErr.code === 'ENOENT') {
				return { content: `Error: File not found: ${filePath}`, isError: true };
			}
			if (errnoErr.code === 'EACCES') {
				return { content: `Error: Permission denied: ${filePath}`, isError: true };
			}
			return { content: `Error reading file: ${err instanceof Error ? err.message : String(err)}`, isError: true };
		}
	}
}
