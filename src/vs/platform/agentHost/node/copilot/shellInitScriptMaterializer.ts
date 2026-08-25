/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { VSBuffer } from '../../../../base/common/buffer.js';
import { getErrorMessage } from '../../../../base/common/errors.js';
import { URI } from '../../../../base/common/uri.js';
import { FileOperationResult, FileSystemProviderCapabilities, IFileService, toFileOperationResult } from '../../../files/common/files.js';
import { ILogService } from '../../../log/common/log.js';
import { INativeEnvironmentService } from '../../../environment/common/environment.js';
import { sanitizeSnippetSource, type IShellInitSnippet, type ShellInitSnippetShell } from '../../common/shellInitSnippets.js';

/** A materialized script, in the shape the SDK's `ShellOptions.initScripts` accepts. */
export interface IShellInitScriptRef {
	readonly shell: ShellInitSnippetShell;
	readonly path: string;
}

/** Test seam for {@link ShellInitScriptMaterializer}. */
export interface IShellInitScriptMaterializer {
	directoryFor(sessionId: string): URI;
	materialize(sessionId: string, snippets: readonly IShellInitSnippet[]): Promise<IShellInitScriptRef[]>;
	clear(sessionId: string): Promise<void>;
}

/**
 * Directory holding the shell init scripts materialized for `sessionId`.
 *
 * Shared by the materializer and by every producer of a session
 * `sandboxConfig`, so the written location and the sandbox grant cannot drift
 * apart — a mismatch would make the SDK fail to read the scripts silently.
 */
export function shellInitScriptDirectory(userDataPath: string, sessionId: string): URI {
	return URI.joinPath(URI.file(userDataPath), 'agentHost', 'shellInit', sanitizeSnippetSource(sessionId) || 'session');
}

/**
 * Writes the shell init snippets a session needs to disk so the SDK can source
 * them before each built-in shell tool command.
 *
 * Provider-internal: created by `CopilotAgent` via `createInstance` rather than
 * registered in the Agent Host service graph, because only the Copilot provider
 * has an SDK shell tool to configure.
 *
 * Each session owns one directory, which keeps the sandbox allow-list to a
 * single path and makes cleanup a single recursive delete.
 */
export class ShellInitScriptMaterializer implements IShellInitScriptMaterializer {

	private readonly _userDataPath: string;

	constructor(
		@INativeEnvironmentService environmentService: INativeEnvironmentService,
		@IFileService private readonly _fileService: IFileService,
		@ILogService private readonly _logService: ILogService,
	) {
		this._userDataPath = environmentService.userDataPath;
	}

	/** Directory holding every script materialized for `sessionId`. */
	directoryFor(sessionId: string): URI {
		return shellInitScriptDirectory(this._userDataPath, sessionId);
	}

	/**
	 * Writes `snippets` for `sessionId` and returns the SDK-shaped references,
	 * in the order given. Scripts left over from a previous call are removed.
	 *
	 * File names are derived from the snippet index and source, so repeated
	 * calls with the same snippet shape reuse the same paths. That matters
	 * because the runtime re-reads each script from disk before every command:
	 * rewriting content in place takes effect immediately, with no need to push
	 * a new path list to the SDK. Writes are atomic so a command that runs
	 * during a rewrite sees either the old or the new content, never a
	 * half-written file.
	 *
	 * Best-effort: a snippet that cannot be written is logged and skipped
	 * rather than failing the turn, matching how the SDK treats an init script
	 * that fails at run time.
	 */
	async materialize(sessionId: string, snippets: readonly IShellInitSnippet[]): Promise<IShellInitScriptRef[]> {
		const directory = this.directoryFor(sessionId);
		if (!snippets.length) {
			await this.clear(sessionId);
			return [];
		}
		const refs: IShellInitScriptRef[] = [];
		const written = new Set<string>();
		// Atomic writes keep a command that runs during a rewrite from sourcing
		// a half-written file. Not every provider supports them, and requesting
		// one that is unsupported throws, so degrade rather than lose the
		// scripts entirely.
		const atomic = this._fileService.hasCapability(directory, FileSystemProviderCapabilities.FileAtomicWrite)
			? { postfix: '.vsctmp' }
			: false;
		for (const [index, snippet] of snippets.entries()) {
			const name = `${String(index).padStart(2, '0')}-${sanitizeSnippetSource(snippet.source) || 'snippet'}.${snippet.shell === 'powershell' ? 'ps1' : 'sh'}`;
			const resource = URI.joinPath(directory, name);
			try {
				await this._fileService.writeFile(resource, VSBuffer.fromString(snippet.script), { atomic });
			} catch (error) {
				this._logService.warn(`[Copilot:${sessionId}] Failed to write shell init script '${name}': ${getErrorMessage(error)}`);
				continue;
			}
			written.add(name);
			refs.push({ shell: snippet.shell, path: resource.fsPath });
		}
		await this._removeStaleScripts(sessionId, directory, written);
		return refs;
	}

	/** Removes every script materialized for `sessionId`. Never throws. */
	async clear(sessionId: string): Promise<void> {
		const directory = this.directoryFor(sessionId);
		try {
			await this._fileService.del(directory, { recursive: true });
		} catch (error) {
			if (!this._isNotFound(error)) {
				this._logService.warn(`[Copilot:${sessionId}] Failed to remove shell init scripts at '${directory.fsPath}': ${getErrorMessage(error)}`);
			}
		}
	}

	/**
	 * Deletes scripts from a previous materialization that the current snippets
	 * no longer produce, so a stale script is never sourced.
	 */
	private async _removeStaleScripts(sessionId: string, directory: URI, keep: ReadonlySet<string>): Promise<void> {
		try {
			const stat = await this._fileService.resolve(directory);
			for (const child of stat.children ?? []) {
				if (!keep.has(child.name)) {
					await this._fileService.del(child.resource, { recursive: true });
				}
			}
		} catch (error) {
			if (!this._isNotFound(error)) {
				this._logService.warn(`[Copilot:${sessionId}] Failed to prune stale shell init scripts at '${directory.fsPath}': ${getErrorMessage(error)}`);
			}
		}
	}

	private _isNotFound(error: unknown): boolean {
		return error instanceof Error && toFileOperationResult(error) === FileOperationResult.FILE_NOT_FOUND;
	}
}
