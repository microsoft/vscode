/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import type { Query } from '@anthropic-ai/claude-agent-sdk';
import { isAbsolute } from '../../../../base/common/path.js';
import { isEqual } from '../../../../base/common/resources.js';
import { URI } from '../../../../base/common/uri.js';
import { AgentWorkingDirectoryChangedError, AgentWorkingDirectoryUnconfirmedError } from '../../common/agent.js';

// SDK 0.3.258 ships setCwd but omits it from Query's public declarations.
interface IClaudeWorkingDirectoryQuery extends Query {
	setCwd(path: string, options?: { readonly trustAccepted: boolean; readonly trustedDirectory: string }): Promise<unknown>;
}

function supportsWorkingDirectoryChange(query: Query): query is IClaudeWorkingDirectoryQuery {
	return 'setCwd' in query && typeof query.setCwd === 'function';
}

function isResponse(value: unknown): value is Record<string, unknown> {
	return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/** Uses the native trust-bound cwd transition, never a shell command or a resume-based substitute. */
export async function setClaudeWorkingDirectory(query: Query, workingDirectory: URI): Promise<URI> {
	if (!supportsWorkingDirectoryChange(query)) {
		throw new Error('This Claude SDK does not support native working-directory changes.');
	}
	let result = await query.setCwd(workingDirectory.fsPath);
	if (isResponse(result) && result.status === 'needs_trust') {
		if (typeof result.directory !== 'string' || !isAbsolute(result.directory)
			|| !isEqual(URI.file(result.directory), workingDirectory)) {
			throw new Error('Claude requested trust for a directory other than the confirmed workspace.');
		}
		// The shared conversion flow has already obtained trust for this exact target.
		result = await query.setCwd(workingDirectory.fsPath, { trustAccepted: true, trustedDirectory: result.directory });
	}
	if (!isResponse(result) || result.status !== 'ok') {
		if (!isResponse(result) || (result.status !== 'rejected' && result.status !== 'needs_trust')) {
			throw new AgentWorkingDirectoryUnconfirmedError('Claude returned an unrecognized working-directory acknowledgement.');
		}
		const detail = isResponse(result) && typeof result.message === 'string'
			? result.message : 'no successful native acknowledgement';
		throw new Error(`Claude did not change the working directory: ${detail}`);
	}
	if (typeof result.cwd !== 'string' || !isAbsolute(result.cwd)) {
		throw new AgentWorkingDirectoryUnconfirmedError('Claude acknowledged a working-directory change without an absolute cwd.');
	}
	const appliedDirectory = URI.file(result.cwd);
	if (typeof result.changed !== 'boolean' || result.transcript_relocated !== true) {
		throw new AgentWorkingDirectoryChangedError(appliedDirectory, 'Claude changed the working directory without confirming transcript relocation.', true);
	}
	if (!isEqual(appliedDirectory, workingDirectory)) {
		throw new AgentWorkingDirectoryChangedError(appliedDirectory, `Claude applied '${appliedDirectory.fsPath}' instead of '${workingDirectory.fsPath}'.`);
	}
	return appliedDirectory;
}
