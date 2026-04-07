/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * Claude Code Session Service
 *
 * This service provides access to Claude Code chat sessions using the
 * `@anthropic-ai/claude-agent-sdk` session APIs. It handles:
 * - Listing sessions via `listSessions()`
 * - Loading full session content via `getSessionInfo()` + `getSessionMessages()`
 * - Subagent loading from raw JSONL (SDK doesn't expose subagent transcripts yet)
 *
 * ## Directory Structure
 * Sessions are stored in:
 * - ~/.claude/projects/{workspace-slug}/{session-id}.jsonl
 * Subagent transcripts are stored in:
 * - ~/.claude/projects/{workspace-slug}/{session-id}/subagents/agent-{id}.jsonl
 */

import type { CancellationToken } from 'vscode';
import { INativeEnvService } from '../../../../../platform/env/common/envService';
import { IFileSystemService } from '../../../../../platform/filesystem/common/fileSystemService';
import { FileType } from '../../../../../platform/filesystem/common/fileTypes';
import { ILogService } from '../../../../../platform/log/common/logService';
import { IWorkspaceService } from '../../../../../platform/workspace/common/workspaceService';
import { createServiceIdentifier } from '../../../../../util/common/services';
import { CancellationError } from '../../../../../util/vs/base/common/errors';
import { basename } from '../../../../../util/vs/base/common/resources';
import { URI } from '../../../../../util/vs/base/common/uri';
import { IFolderRepositoryManager } from '../../../../chatSessions/common/folderRepositoryManager';
import { ClaudeSessionUri } from '../../common/claudeSessionUri';
import { IClaudeCodeSdkService } from '../claudeCodeSdkService';
import { getProjectFolders } from '../claudeProjectFolders';
import { buildSubagentSession, parseSessionFileContent } from './claudeSessionParser';
import {
	IClaudeCodeSession,
	IClaudeCodeSessionInfo,
	ISubagentSession,
} from './claudeSessionSchema';
import { buildClaudeCodeSession, sdkSessionInfoToSessionInfo, SubagentCorrelationMap } from './sdkSessionAdapter';

// #region Utility Functions

/**
 * Type-safe extraction of error code from unknown error values.
 * Handles Node.js errors, VS Code FileSystemError, and other error types.
 */
function getErrorCode(error: unknown): string | undefined {
	if (error === null || error === undefined) {
		return undefined;
	}
	if (typeof error !== 'object') {
		return undefined;
	}
	if ('code' in error && typeof error.code === 'string') {
		return error.code;
	}
	return undefined;
}

// #endregion

// #region Service Interface

export const IClaudeCodeSessionService = createServiceIdentifier<IClaudeCodeSessionService>('IClaudeCodeSessionService');

/**
 * Service to load and manage Claude Code chat sessions.
 */
export interface IClaudeCodeSessionService {
	readonly _serviceBrand: undefined;

	/**
	 * Get lightweight metadata for all sessions in the current workspace.
	 * This is optimized for listing sessions without loading full content.
	 */
	getAllSessions(token: CancellationToken): Promise<readonly IClaudeCodeSessionInfo[]>;

	/**
	 * Get a specific session with full content by its resource URI.
	 * This loads the complete message history and subagents.
	 */
	getSession(resource: URI, token: CancellationToken): Promise<IClaudeCodeSession | undefined>;
}

// #endregion

// #region Service Implementation

export class ClaudeCodeSessionService implements IClaudeCodeSessionService {
	declare _serviceBrand: undefined;

	constructor(
		@IClaudeCodeSdkService private readonly _sdkService: IClaudeCodeSdkService,
		@INativeEnvService private readonly _envService: INativeEnvService,
		@IFileSystemService private readonly _fileSystem: IFileSystemService,
		@ILogService private readonly _logService: ILogService,
		@IWorkspaceService private readonly _workspace: IWorkspaceService,
		@IFolderRepositoryManager private readonly _folderRepositoryManager: IFolderRepositoryManager,
	) { }

	/**
	 * Get lightweight metadata for all sessions in the current workspace.
	 * Delegates to the SDK's `listSessions()` and converts results.
	 */
	async getAllSessions(token: CancellationToken): Promise<readonly IClaudeCodeSessionInfo[]> {
		const items: IClaudeCodeSessionInfo[] = [];
		const projectFolders = await this._getProjectFolders();

		for (const { slug, folderUri } of projectFolders) {
			if (token.isCancellationRequested) {
				return items;
			}

			const folderName = basename(folderUri);

			try {
				const sdkSessions = await this._sdkService.listSessions(folderUri.fsPath);
				for (const sdkInfo of sdkSessions) {
					items.push(sdkSessionInfoToSessionInfo(sdkInfo, folderName));
				}
			} catch (e) {
				this._logService.debug(`[ClaudeCodeSessionService] Failed to list sessions for slug ${slug}: ${e}`);
			}
		}

		return items;
	}

	/**
	 * Get a specific session with full content by its resource URI.
	 * Uses SDK APIs for metadata and messages, with raw JSONL parsing only for subagents.
	 */
	async getSession(resource: URI, token: CancellationToken): Promise<IClaudeCodeSession | undefined> {
		const sessionId = ClaudeSessionUri.getSessionId(resource);
		const projectFolders = await this._getProjectFolders();

		for (const { slug, folderUri } of projectFolders) {
			if (token.isCancellationRequested) {
				return undefined;
			}

			const dir = folderUri.fsPath;

			try {
				const info = await this._sdkService.getSessionInfo(sessionId, dir);
				if (!info) {
					continue;
				}

				const messages = await this._sdkService.getSessionMessages(sessionId, dir);
				if (token.isCancellationRequested) {
					return undefined;
				}

				// Load subagents from raw JSONL (SDK doesn't expose these yet)
				const { subagents, correlationMap } = await this._loadSubagents(sessionId, slug, token);

				const folderName = basename(folderUri);
				return buildClaudeCodeSession(info, messages, subagents, correlationMap, folderName);
			} catch (e) {
				this._logService.debug(`[ClaudeCodeSessionService] Failed to load session ${sessionId} from slug ${slug}: ${e}`);
			}
		}

		return undefined;
	}

	// #region Directory Discovery

	/**
	 * Get the project directory slugs to scan for sessions, along with their
	 * original folder URIs (needed for badge display).
	 */
	private _getProjectFolders() {
		return getProjectFolders(this._workspace, this._folderRepositoryManager);
	}

	// #endregion

	// #region Subagent Loading

	/**
	 * Read a directory, returning an empty array if the directory doesn't exist.
	 */
	private async _tryReadDirectory(dirUri: URI): Promise<[string, FileType][]> {
		try {
			return await this._fileSystem.readDirectory(dirUri);
		} catch (e) {
			const code = getErrorCode(e);
			switch (code) {
				case 'FileNotFound':
				case 'DirectoryNotFound':
				case 'ENOENT':
					break;
				default:
					this._logService.error(e, `[ClaudeCodeSessionService] Failed to read directory: ${dirUri}`);
					break;
			}
			return [];
		}
	}

	/**
	 * Load subagents for a session and extract the UUID→agentId correlation map
	 * from the parent JSONL file (needed because the SDK strips `toolUseResult.agentId`).
	 */
	private async _loadSubagents(
		sessionId: string,
		slug: string,
		token: CancellationToken,
	): Promise<{ subagents: readonly ISubagentSession[]; correlationMap: SubagentCorrelationMap }> {
		const projectDirUri = URI.joinPath(this._envService.userHome, '.claude', 'projects', slug);
		const subagentsDirUri = URI.joinPath(projectDirUri, sessionId, 'subagents');
		const subagentEntries = await this._tryReadDirectory(subagentsDirUri);
		if (subagentEntries.length === 0) {
			return { subagents: [], correlationMap: new Map() };
		}

		const subagents = await this._loadSubagentsFromEntries(subagentsDirUri, subagentEntries, token);
		if (subagents.length === 0) {
			return { subagents: [], correlationMap: new Map() };
		}

		// Extract the correlation map from the parent session JSONL
		const correlationMap = await this._extractSubagentCorrelation(projectDirUri, sessionId);

		return { subagents, correlationMap };
	}

	/**
	 * Load all subagent sessions from pre-read directory entries.
	 */
	private async _loadSubagentsFromEntries(
		subagentsDirUri: URI,
		entries: [string, FileType][],
		token: CancellationToken,
	): Promise<ISubagentSession[]> {
		const subagentTasks: Promise<ISubagentSession | null>[] = [];

		for (const [name, type] of entries) {
			if (type !== FileType.File) {
				continue;
			}
			// Match agent-{id}.jsonl pattern
			if (!name.startsWith('agent-') || !name.endsWith('.jsonl')) {
				continue;
			}
			const agentId = name.slice(6, -6); // Extract ID from agent-{id}.jsonl
			if (agentId.length === 0) {
				continue;
			}
			const fileUri = URI.joinPath(subagentsDirUri, name);
			subagentTasks.push(this._parseSubagentFile(agentId, fileUri, token));
		}

		const results = await Promise.allSettled(subagentTasks);
		if (token.isCancellationRequested) {
			return [];
		}

		const subagents: ISubagentSession[] = [];
		for (const r of results) {
			if (r.status === 'fulfilled' && r.value !== null) {
				subagents.push(r.value);
			}
		}

		// Sort by timestamp
		subagents.sort((a, b) => a.timestamp.getTime() - b.timestamp.getTime());

		return subagents;
	}

	/**
	 * Parse a single subagent file.
	 */
	private async _parseSubagentFile(
		agentId: string,
		fileUri: URI,
		token: CancellationToken,
	): Promise<ISubagentSession | null> {
		try {
			const content = await this._fileSystem.readFile(fileUri, true);
			if (token.isCancellationRequested) {
				throw new CancellationError();
			}

			const text = Buffer.from(content).toString('utf8');
			const parseResult = parseSessionFileContent(text, fileUri.fsPath);

			return buildSubagentSession(agentId, parseResult);
		} catch (e) {
			if (e instanceof CancellationError) {
				throw e;
			}
			this._logService.debug(`[ClaudeCodeSessionService] Failed to parse subagent: ${fileUri}`);
			return null;
		}
	}

	/**
	 * Extracts a map from user message UUID → subagent agentId by scanning the
	 * parent session JSONL for entries with `toolUseResult.agentId`.
	 *
	 * This is a targeted scan — we only parse the `toolUseResult` field from entries
	 * that have one, avoiding full message validation overhead.
	 *
	 * When the SDK exposes native subagent correlation, this can be removed.
	 */
	private async _extractSubagentCorrelation(
		projectDirUri: URI,
		sessionId: string,
	): Promise<SubagentCorrelationMap> {
		const sessionFileUri = URI.joinPath(projectDirUri, `${sessionId}.jsonl`);
		const map = new Map<string, string>();

		try {
			const content = await this._fileSystem.readFile(sessionFileUri, true);
			const text = Buffer.from(content).toString('utf8');

			for (const line of text.split('\n')) {
				// Fast-reject lines that don't have toolUseResult
				if (!line.includes('"toolUseResult"')) {
					continue;
				}
				try {
					const entry: unknown = JSON.parse(line);
					if (
						entry !== null &&
						typeof entry === 'object' &&
						'uuid' in entry && typeof entry.uuid === 'string' &&
						'toolUseResult' in entry && entry.toolUseResult !== null && typeof entry.toolUseResult === 'object' &&
						'agentId' in entry.toolUseResult && typeof entry.toolUseResult.agentId === 'string'
					) {
						map.set(entry.uuid, entry.toolUseResult.agentId);
					}
				} catch {
					// Skip malformed lines
				}
			}
		} catch {
			// File not found or read error — acceptable, correlation is best-effort
		}

		return map;
	}

	// #endregion
}

// #endregion
