/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import type { PermissionMode, SDKUserMessage, WarmQuery } from '@anthropic-ai/claude-agent-sdk';
import { Emitter, Event } from '../../../../base/common/event.js';
import { Disposable, IReference } from '../../../../base/common/lifecycle.js';
import { URI } from '../../../../base/common/uri.js';
import { IInstantiationService } from '../../../instantiation/common/instantiation.js';
import { ClaudeRuntimeEffortLevel } from '../../common/claudeModelConfig.js';
import { AgentSignal } from '../../common/agentService.js';
import { PendingRequestRegistry } from '../../common/pendingRequestRegistry.js';
import { ISessionDatabase } from '../../common/sessionDataService.js';
import { ActionType } from '../../common/state/sessionActions.js';
import { PendingMessage, SessionInputAnswer, SessionInputRequest, SessionInputResponseKind, ToolCallPendingConfirmationState } from '../../common/state/protocol/state.js';
import { resolvePromptToContentBlocks } from './claudePromptResolver.js';
import { ClaudeSdkPipeline, IRematerializer } from './claudeSdkPipeline.js';
import { SubagentRegistry } from './claudeSubagentRegistry.js';
import { ClaudePermissionKind } from './claudeToolDisplay.js';

// Re-export for callers that import IRematerializer from the session.
export type { IRematerializer } from './claudeSdkPipeline.js';

/**
 * Per-session coordinator. Owns:
 *   • Per-session identity (sessionId / sessionUri / workingDirectory).
 *   • The {@link ClaudeSdkPipeline} that drives the SDK Query lifecycle
 *     and emits every {@link AgentSignal} for this session (router-
 *     mapped per-message signals plus `SessionTurnComplete` and
 *     `steering_consumed`).
 *   • Pending-permission and pending-user-input registries (Phase 7),
 *     surfaced via `requestPermission` / `requestUserInput`.
 */
export class ClaudeAgentSession extends Disposable {

	private readonly _pipeline: ClaudeSdkPipeline;

	/**
	 * Phase 12 — per-session registry of Task tool calls that spawn
	 * subagents (`SubagentSpawn` records keyed by `tool_use_id`, plus a
	 * reverse index from inner `tool_use_id` to its parent Task). Owned
	 * here so the registry dies with the session; consumers in the live
	 * mapper (`ClaudeSdkMessageRouter` / `claudeMapSessionEvents` /
	 * `claudeSubagentSignals`) and the `canUseTool` bridge read from
	 * the same instance via the session.
	 */
	readonly subagents: SubagentRegistry = this._register(new SubagentRegistry());

	/**
	 * Phase 7 / S3.2. Tool-permission deferreds parked inside
	 * {@link Options.canUseTool}. Keyed by SDK `tool_use_id`.
	 */
	private readonly _pendingPermissions = new PendingRequestRegistry<boolean>();

	/**
	 * Phase 7 / S3.2. User-input deferreds parked for interactive tools
	 * (`AskUserQuestion`, `ExitPlanMode`). Keyed by `SessionInputRequest.id`.
	 */
	private readonly _pendingUserInputs = new PendingRequestRegistry<{ response: SessionInputResponseKind; answers?: Record<string, SessionInputAnswer> }>();

	private readonly _onDidSessionProgress = this._register(new Emitter<AgentSignal>());
	readonly onDidSessionProgress: Event<AgentSignal> = this._onDidSessionProgress.event;

	constructor(
		readonly sessionId: string,
		readonly sessionUri: URI,
		readonly workingDirectory: URI | undefined,
		warm: WarmQuery,
		abortController: AbortController,
		dbRef: IReference<ISessionDatabase>,
		@IInstantiationService instantiationService: IInstantiationService,
	) {
		super();
		this._pipeline = this._register(instantiationService.createInstance(
			ClaudeSdkPipeline, sessionId, sessionUri, warm, abortController, dbRef, this.subagents,
		));
		this._register(this._pipeline.onDidProduceSignal(s => this._onDidSessionProgress.fire(s)));
	}

	get isResumed(): boolean { return this._pipeline.isResumed; }

	/**
	 * Seed the pipeline's current + applied config cache from
	 * materialize-time `Options`. The SDK already starts with these
	 * values, so the cache prevents a redundant first `setModel` /
	 * `applyFlagSettings` call.
	 */
	seedBijectiveState(state: { model?: string; effort?: ClaudeRuntimeEffortLevel; permissionMode?: PermissionMode }): void {
		this._pipeline.seedCurrentConfig(state.model, state.effort, state.permissionMode);
	}

	attachRematerializer(rematerializer: IRematerializer): void {
		this._pipeline.attachRematerializer(rematerializer);
	}

	/**
	 * Send a user prompt. Model / effort are not threaded through here
	 * — the pipeline's current model / effort (set eagerly via
	 * {@link queueModelChange}) is whatever the SDK has been told.
	 */
	send(prompt: SDKUserMessage, turnId: string): Promise<void> {
		return this._pipeline.send(prompt, turnId);
	}

	/**
	 * Cancel the in-flight SDK turn. Mirrors the production reference;
	 * see {@link ClaudeSdkPipeline.abort}. Also denies any parked
	 * permission / user-input requests so the SDK's `canUseTool`
	 * callback (and any interactive tool waiting on user input) unwinds
	 * with a deny / cancel result instead of leaving stale UI behind.
	 */
	abort(): void {
		this._pendingPermissions.denyAll(false);
		this._pendingUserInputs.denyAll({ response: SessionInputResponseKind.Cancel });
		this._pipeline.abort();
	}

	/**
	 * Eagerly push a model and / or effort change to the SDK. Safe to
	 * call mid-turn: per the SDK contract, `setModel` /
	 * `applyFlagSettings` only take effect on the NEXT user request.
	 * Per-field last-write-wins.
	 */
	async queueModelChange(model: string | undefined, effort: ClaudeRuntimeEffortLevel | undefined): Promise<void> {
		if (model !== undefined) {
			await this._pipeline.setModel(model);
		}
		if (effort !== undefined) {
			await this._pipeline.setEffort(effort);
		}
	}

	/**
	 * Inject a steering message. Builds the `priority: 'now'`
	 * {@link SDKUserMessage} and hands it to the pipeline; the pipeline
	 * inherits the parent's turnId (CONTEXT.md M10) and fires
	 * `steering_consumed` when the SDK accepts it. No-op if the pipeline
	 * is aborted.
	 */
	injectSteering(steeringMessage: PendingMessage): void {
		if (this._pipeline.isAborted) {
			return;
		}
		const contentBlocks = resolvePromptToContentBlocks(
			steeringMessage.userMessage.text,
			steeringMessage.userMessage.attachments,
		);
		const sdkMessage: SDKUserMessage = {
			type: 'user',
			message: { role: 'user', content: contentBlocks },
			session_id: this.sessionId,
			parent_tool_use_id: null,
			priority: 'now',
			// Reuse the protocol PendingMessage.id as the SDK uuid — same
			// pattern as `ClaudeAgent.sendMessage` reusing turnId. The SDK's
			// `uuid` field is typed as a branded UUID, but the cast at the
			// boundary is the convention for both code paths.
			uuid: steeringMessage.id as `${string}-${string}-${string}-${string}-${string}`,
		};
		this._pipeline.injectSteering(sdkMessage, steeringMessage.id);
	}

	/** Live permission-mode change. Forwards to the pipeline; the pipeline remembers it for re-application after a rebind. */
	setPermissionMode(mode: PermissionMode): Promise<void> {
		return this._pipeline.setPermissionMode(mode);
	}

	// #region Phase 7 / S3.2 — pending state

	/**
	 * Atomically register a pending-permission deferred and fire the
	 * `pending_confirmation` signal. The SDK is blocked on the returned
	 * promise inside its `canUseTool` callback until
	 * {@link respondToPermissionRequest} resolves it. Resolves with
	 * `false` if the pipeline is aborted.
	 */
	requestPermission(args: {
		readonly toolUseID: string;
		readonly state: ToolCallPendingConfirmationState;
		readonly permissionKind: ClaudePermissionKind;
		readonly permissionPath?: string;
		/** Phase 12 step 5 — when the confirmation belongs to a subagent context, route it to the subagent session. */
		readonly parentToolCallId?: string;
	}): Promise<boolean> {
		if (this._pipeline.isAborted) {
			return Promise.resolve(false);
		}
		return this._pendingPermissions.registerAndFire(args.toolUseID, () => {
			this._onDidSessionProgress.fire({
				kind: 'pending_confirmation',
				session: this.sessionUri,
				state: args.state,
				permissionKind: args.permissionKind,
				...(args.permissionPath !== undefined ? { permissionPath: args.permissionPath } : {}),
				...(args.parentToolCallId !== undefined ? { parentToolCallId: args.parentToolCallId } : {}),
			});
		});
	}

	respondToPermissionRequest(requestId: string, approved: boolean): boolean {
		return this._pendingPermissions.respond(requestId, approved);
	}

	/**
	 * Fire a {@link ActionType.SessionInputRequested} action and park on
	 * a deferred until {@link respondToUserInputRequest} resolves it.
	 * Resolves with `{ response: Cancel }` if the pipeline is aborted.
	 */
	requestUserInput(request: SessionInputRequest, parentToolCallId?: string): Promise<{ response: SessionInputResponseKind; answers?: Record<string, SessionInputAnswer> }> {
		if (this._pipeline.isAborted) {
			return Promise.resolve({ response: SessionInputResponseKind.Cancel });
		}
		return this._pendingUserInputs.registerAndFire(request.id, () => {
			this._onDidSessionProgress.fire({
				kind: 'action',
				session: this.sessionUri,
				action: {
					type: ActionType.SessionInputRequested,
					session: this.sessionUri.toString(),
					request,
				},
				...(parentToolCallId !== undefined ? { parentToolCallId } : {}),
			});
		});
	}

	respondToUserInputRequest(
		requestId: string,
		response: SessionInputResponseKind,
		answers?: Record<string, SessionInputAnswer>,
	): boolean {
		return this._pendingUserInputs.respond(requestId, { response, answers });
	}

	// #endregion

	override dispose(): void {
		// Resolve parked deferreds before tearing the pipeline down so the
		// SDK's canUseTool callback unwinds with a deny and the loop exits.
		this._pendingPermissions.denyAll(false);
		this._pendingUserInputs.denyAll({ response: SessionInputResponseKind.Cancel });
		super.dispose();
	}
}
