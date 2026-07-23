/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import type { SDKMessage } from '@anthropic-ai/claude-agent-sdk';
import { Disposable, IReference } from '../../../../base/common/lifecycle.js';
import { IInstantiationService } from '../../../instantiation/common/instantiation.js';
import { ILogService } from '../../../log/common/log.js';
import { ISessionDatabase } from '../../common/sessionDataService.js';
import { FileEditTracker } from '../shared/fileEditTracker.js';
import type { ClaudeMapperState } from './claudeMapSessionEvents.js';
import { getClaudeToolPath, isClaudeFileEditTool } from './claudeToolDisplay.js';

/**
 * Phase 8 — file-edit observation off the SDK message stream.
 *
 * Owns the {@link FileEditTracker}, the in-flight `tool_use_id → path`
 * map, and the dbRef whose lifetime gates persistence writes. Snapshots
 * before-content when an assistant `tool_use` block arrives, snapshots
 * after-content when the matching synthetic `tool_result` arrives, and
 * stages a {@link ToolResultFileEditContent} on the session's
 * {@link ClaudeMapperState} so the synchronous mapper can attach it to
 * the `ChatToolCallComplete` action.
 *
 * Hooks (`Options.hooks.PreToolUse` / `Options.hooks.PostToolUse`) are
 * deliberately NOT used: they are user-bypassable via settings, whereas
 * the SDK message stream is the canonical, non-bypassable signal that
 * a tool will run. Mirrors the production extension's dispatch-time
 * observation (extensions/copilot/.../claudeMessageDispatch.ts:200) —
 * see the comment there about `bypassPermissions` and internal SDK
 * paths that skip `canUseTool`.
 *
 * Best-effort: the SDK proceeds to run the tool concurrently after
 * yielding the `tool_use` block, so {@link observeAssistant}'s before-
 * snapshot races against tool execution. Tool execution involves disk
 * I/O before the write, which gives enough microtask headroom in
 * practice; same guarantee the production extension relies on with
 * `stream.externalEdit`.
 */
export class ClaudeFileEditObserver extends Disposable {

	private readonly _editTracker: FileEditTracker;

	/**
	 * Maps SDK `tool_use_id` → file path + raw tool input + model
	 * captured when the SDK yields the assistant `tool_use` block in
	 * {@link observeAssistant}. Consumed (and removed) by
	 * {@link observeUser} when the matching `tool_result` arrives.
	 * The raw input is forwarded to
	 * {@link FileEditTracker.takeCompletedEdit} so it can extract the
	 * AI-written text chunks for the edit-survival reporter. The
	 * model is read off the assistant message body and is naturally
	 * per-subagent: when a subagent emits the `tool_use`, its model
	 * (not the parent's) is what we record.
	 */
	private readonly _editToolPaths = new Map<string, { readonly filePath: string; readonly toolName: string; readonly toolInput: unknown; readonly modelId: string | undefined }>();

	constructor(
		sessionUri: string,
		dbRef: IReference<ISessionDatabase>,
		@ILogService private readonly _logService: ILogService,
		@IInstantiationService instantiationService: IInstantiationService,
	) {
		super();
		// Own the DB reference for this observer's lifetime so
		// {@link FileEditTracker.takeCompletedEdit}'s `storeFileEdit` write
		// has a live database. Disposed first — ahead of any owning
		// session's WarmQuery abort — so any in-flight write completes
		// against an open DB.
		this._register(dbRef);
		this._editTracker = instantiationService.createInstance(
			FileEditTracker,
			sessionUri,
			dbRef.object,
		);
	}

	/**
	 * Snapshot before-content for any file-edit `tool_use` blocks
	 * carried by an SDK assistant message. Caller must invoke this when
	 * the SDK yields a canonical `'assistant'` message (full
	 * `tool_use.input` available).
	 */
	observeAssistant(message: Extract<SDKMessage, { type: 'assistant' }>): void {
		const content = message.message.content;
		if (!Array.isArray(content)) {
			return;
		}
		const modelId = typeof message.message.model === 'string' ? message.message.model : undefined;
		for (const block of content) {
			if (block.type !== 'tool_use' || !isClaudeFileEditTool(block.name)) {
				continue;
			}
			const filePath = getClaudeToolPath(block.name, block.input);
			if (!filePath) {
				continue;
			}
			this._editToolPaths.set(block.id, { filePath, toolName: block.name, toolInput: block.input, modelId });
			void this._editTracker.trackEditStart(filePath).catch(err =>
				this._logService.warn(`[ClaudeFileEditObserver] trackEditStart failed for ${filePath}: ${err}`));
		}
	}

	/**
	 * Take after-content snapshots and stage
	 * {@link ToolResultFileEditContent} entries on `mapperState` for any
	 * `tool_result` blocks carried by an SDK user message. Caller MUST
	 * await this BEFORE invoking the synchronous mapper, so the cached
	 * file edit is already on `mapperState` when `mapUserMessage` calls
	 * `state.takeFileEdit`.
	 */
	async observeUser(
		message: Extract<SDKMessage, { type: 'user' }>,
		turnId: string,
		mapperState: ClaudeMapperState,
	): Promise<void> {
		const content = message.message.content;
		if (!Array.isArray(content)) {
			return;
		}
		for (const block of content) {
			if (block.type !== 'tool_result') {
				continue;
			}
			const tracked = this._editToolPaths.get(block.tool_use_id);
			if (!tracked) {
				continue;
			}
			this._editToolPaths.delete(block.tool_use_id);
			try {
				await this._editTracker.completeEdit(tracked.filePath);
				const fileEdit = await this._editTracker.takeCompletedEdit(turnId, block.tool_use_id, tracked.filePath, tracked.toolName, tracked.toolInput, tracked.modelId);
				if (fileEdit) {
					mapperState.cacheFileEdit(block.tool_use_id, fileEdit);
				}
			} catch (err) {
				this._logService.warn(`[ClaudeFileEditObserver] file edit tracking failed for ${tracked.filePath}: ${err}`);
			}
		}
	}
}
