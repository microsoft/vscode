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
 * - Subagent loading via `listSubagents()` + `getSubagentMessages()`
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
import { ILogService } from '../../../../../platform/log/common/logService';
import { IWorkspaceService } from '../../../../../platform/workspace/common/workspaceService';
import { createServiceIdentifier } from '../../../../../util/common/services';
import { basename } from '../../../../../util/vs/base/common/resources';
import { URI } from '../../../../../util/vs/base/common/uri';
import { IFolderRepositoryManager } from '../../../../chatSessions/common/folderRepositoryManager';
import { ClaudeSessionUri } from '../../common/claudeSessionUri';
import { IClaudeCodeSdkService } from '../claudeCodeSdkService';
import { getProjectFolders } from '../claudeProjectFolders';
import {
	IClaudeCodeSession,
	IClaudeCodeSessionInfo,
	ISubagentSession,
} from './claudeSessionSchema';
import { buildClaudeCodeSession, sdkSessionInfoToSessionInfo, sdkSubagentMessagesToSubagentSession, SubagentCorrelationMap } from './sdkSessionAdapter';
import { toErrorMessage } from '../../../../../util/common/errorMessage';

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
	 * Uses SDK APIs for metadata, messages, and subagent transcripts.
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

				// Load subagents via SDK
				const { subagents, correlationMap } = await this._loadSubagents(sessionId, slug, dir, token);

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
	 * Load subagents for a session using the SDK and extract the UUID→agentId
	 * correlation map from the parent JSONL file (needed because the SDK strips
	 * `toolUseResult.agentId`).
	 */
	private async _loadSubagents(
		sessionId: string,
		slug: string,
		dir: string,
		token: CancellationToken,
	): Promise<{ subagents: readonly ISubagentSession[]; correlationMap: SubagentCorrelationMap }> {
		let agentIds: string[];
		try {
			agentIds = await this._sdkService.listSubagents(sessionId, { dir });
		} catch (error) {
			this._logService.warn(`[ClaudeCodeSessionService] listSubagents failed: ${toErrorMessage(error)}`);
			return { subagents: [], correlationMap: new Map() };
		}

		if (agentIds.length === 0 || token.isCancellationRequested) {
			return { subagents: [], correlationMap: new Map() };
		}

		const subagentTasks = agentIds.map(agentId =>
			this._loadSubagentFromSdk(sessionId, agentId, dir)
		);

		const [results, correlationMap] = await Promise.all([
			Promise.allSettled(subagentTasks),
			this._extractSubagentCorrelation(
				URI.joinPath(this._envService.userHome, '.claude', 'projects', slug),
				sessionId,
			),
		]);

		if (token.isCancellationRequested) {
			return { subagents: [], correlationMap: new Map() };
		}

		const subagents: ISubagentSession[] = [];
		for (const r of results) {
			if (r.status === 'fulfilled' && r.value !== null) {
				subagents.push(r.value);
			}
		}

		// Sort by timestamp
		subagents.sort((a, b) => a.timestamp.getTime() - b.timestamp.getTime());

		return { subagents, correlationMap };
	}

	/**
	 * Load a single subagent's messages via the SDK.
	 */
	private async _loadSubagentFromSdk(
		sessionId: string,
		agentId: string,
		dir: string,
	): Promise<ISubagentSession | null> {
		try {
			const messages = await this._sdkService.getSubagentMessages(sessionId, agentId, { dir });
			return sdkSubagentMessagesToSubagentSession(agentId, messages);
		} catch (error) {
			this._logService.warn(`[ClaudeCodeSessionService] Failed to load subagent ${agentId} for session ${sessionId}: ${toErrorMessage(error)}`);
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
