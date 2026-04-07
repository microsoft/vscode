/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import type { ForkSessionOptions, ForkSessionResult, Options, Query, SDKSessionInfo, SDKUserMessage, SessionMessage } from '@anthropic-ai/claude-agent-sdk';
import { createServiceIdentifier } from '../../../../util/common/services';

export interface IClaudeCodeSdkService {
	readonly _serviceBrand: undefined;

	/**
	 * Creates a new Claude Code query generator
	 * @param options Query options including prompt and configuration
	 * @returns Query instance for Claude Code responses
	 */
	query(options: {
		prompt: AsyncIterable<SDKUserMessage>;
		options: Options;
	}): Promise<Query>;

	/**
	 * Lists all Claude Code sessions for the specified project directory
	 * @param dir Workspace/project directory path (the SDK resolves this to the session storage location internally)
	 * @returns Array of session info objects
	 */
	listSessions(dir: string): Promise<SDKSessionInfo[]>;

	/**
	 * Gets detailed information for a specific session
	 * @param sessionId Session ID
	 * @param dir Workspace/project directory path (the SDK resolves this to the session storage location internally)
	 * @returns Session info object, or undefined if not found
	 */
	getSessionInfo(sessionId: string, dir: string): Promise<SDKSessionInfo | undefined>;

	/**
	 * Gets all messages for a specific session
	 * @param sessionId Session ID
	 * @param dir Workspace/project directory path (the SDK resolves this to the session storage location internally)
	 * @returns Array of session messages
	 */
	getSessionMessages(sessionId: string, dir: string): Promise<SessionMessage[]>;

	/**
	 * Renames a session by setting a custom title
	 * @param sessionId Session ID
	 * @param title New title for the session
	 */
	renameSession(sessionId: string, title: string): Promise<void>;

	/**
	 * Forks an existing session to create a new one, optionally with a subset of messages
	 * @param sessionId Session ID
	 * @param options Fork session options
	 */
	forkSession(sessionId: string, options?: ForkSessionOptions): Promise<ForkSessionResult>;
}


export const IClaudeCodeSdkService = createServiceIdentifier<IClaudeCodeSdkService>('IClaudeCodeSdkService');

/**
 * Service that wraps the Claude Code SDK for DI in tests and lazy loading
 */
export class ClaudeCodeSdkService implements IClaudeCodeSdkService {
	readonly _serviceBrand: undefined;

	private _sdk: Promise<typeof import('@anthropic-ai/claude-agent-sdk')> | undefined;

	private _loadSdk() {
		this._sdk ??= import('@anthropic-ai/claude-agent-sdk');
		return this._sdk;
	}

	public async query(options: {
		prompt: AsyncIterable<SDKUserMessage>;
		options: Options;
	}): Promise<Query> {
		const { query } = await this._loadSdk();
		return query(options);
	}

	public async listSessions(dir: string): Promise<SDKSessionInfo[]> {
		const { listSessions } = await this._loadSdk();
		return listSessions({ dir });
	}

	public async getSessionInfo(sessionId: string, dir: string): Promise<SDKSessionInfo | undefined> {
		const { getSessionInfo } = await this._loadSdk();
		return getSessionInfo(sessionId, { dir });
	}

	public async getSessionMessages(sessionId: string, dir: string): Promise<SessionMessage[]> {
		const { getSessionMessages } = await this._loadSdk();
		return getSessionMessages(sessionId, { dir });
	}

	public async renameSession(sessionId: string, title: string): Promise<void> {
		const { renameSession } = await this._loadSdk();
		await renameSession(sessionId, title);
	}

	public async forkSession(sessionId: string, options?: ForkSessionOptions): Promise<ForkSessionResult> {
		const { forkSession } = await this._loadSdk();
		return forkSession(sessionId, options);
	}
}
