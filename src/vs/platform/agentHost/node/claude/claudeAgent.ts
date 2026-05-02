/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import type { CCAModel } from '@vscode/copilot-api';
import { Emitter } from '../../../../base/common/event.js';
import { Disposable } from '../../../../base/common/lifecycle.js';
import { IObservable, observableValue } from '../../../../base/common/observable.js';
import { URI } from '../../../../base/common/uri.js';
import { localize } from '../../../../nls.js';
import { ILogService } from '../../../log/common/log.js';
import { ISyncedCustomization } from '../../common/agentPluginManager.js';
import { AgentProvider, AgentSignal, GITHUB_COPILOT_PROTECTED_RESOURCE, IAgent, IAgentAttachment, IAgentCreateSessionConfig, IAgentCreateSessionResult, IAgentDescriptor, IAgentModelInfo, IAgentResolveSessionConfigParams, IAgentSessionConfigCompletionsParams, IAgentSessionMetadata } from '../../common/agentService.js';
import type { ResolveSessionConfigResult, SessionConfigCompletionsResult } from '../../common/state/protocol/commands.js';
import { ProtectedResourceMetadata, type ModelSelection, type ToolDefinition } from '../../common/state/protocol/state.js';
import { CustomizationRef, SessionInputResponseKind, type SessionInputAnswer, type ToolCallResult, type Turn } from '../../common/state/sessionState.js';
import { ICopilotApiService } from '../shared/copilotApiService.js';
import { tryParseClaudeModelId } from './claudeModelId.js';
import { IClaudeProxyHandle, IClaudeProxyService } from './claudeProxyService.js';

/**
 * Returns true if `m` is a Claude-family model that should be advertised
 * to clients picking a model for the Claude provider.
 *
 * Combines the same surface checks the extension uses (vendor, picker
 * eligibility, tool-call support, `/v1/messages` endpoint) with a parse
 * of the model id via {@link tryParseClaudeModelId}, which excludes
 * synthetic ids like `auto` that aren't real Claude endpoints.
 */
function isClaudeModel(m: CCAModel): boolean {
	return (
		m.vendor === 'Anthropic' &&
		!!m.supported_endpoints?.includes('/v1/messages') &&
		!!m.model_picker_enabled &&
		!!m.capabilities?.supports?.tool_calls &&
		tryParseClaudeModelId(m.id) !== undefined
	);
}

/**
 * Project a {@link CCAModel} into the agent host's
 * {@link IAgentModelInfo} surface. The returned `provider` is the
 * agent's id (`'claude'`) — clients filter the root state's model list
 * by provider, so this must match {@link ClaudeAgent.id}, NOT the
 * upstream `vendor: 'Anthropic'` field.
 */
function toAgentModelInfo(m: CCAModel, provider: AgentProvider): IAgentModelInfo {
	return {
		provider,
		id: m.id,
		name: m.name,
		maxContextWindow: m.capabilities?.limits?.max_context_window_tokens,
		supportsVision: !!m.capabilities?.supports?.vision,
	};
}

/**
 * Phase 4 skeleton {@link IAgent} provider for the Claude Agent SDK.
 *
 * What is implemented:
 * - Provider id, descriptor, and protected resources surface so root
 *   state advertises Claude alongside Copilot CLI.
 * - GitHub token capture via {@link authenticate} and lazy acquisition
 *   of an {@link IClaudeProxyHandle} from {@link IClaudeProxyService}.
 * - {@link models} observable derived from {@link ICopilotApiService.models}
 *   filtered to Claude-family entries via {@link isClaudeModel}.
 *
 * What is stubbed:
 * - All other {@link IAgent} methods throw `Error('TODO: Phase N')`. The
 *   exact phase numbers reference the roadmap in
 *   `src/vs/platform/agentHost/node/claude/roadmap.md`.
 *
 * The class is intentionally lean: each subsequent phase adds one
 * concern (sessions, sendMessage, permissions, etc.) so the surface area
 * of any single review stays small.
 */
export class ClaudeAgent extends Disposable implements IAgent {
	readonly id: AgentProvider = 'claude';

	private readonly _onDidSessionProgress = this._register(new Emitter<AgentSignal>());
	readonly onDidSessionProgress = this._onDidSessionProgress.event;

	private readonly _models = observableValue<readonly IAgentModelInfo[]>(this, []);
	readonly models: IObservable<readonly IAgentModelInfo[]> = this._models;

	private _githubToken: string | undefined;
	private _proxyHandle: IClaudeProxyHandle | undefined;

	constructor(
		@ILogService private readonly _logService: ILogService,
		@ICopilotApiService private readonly _copilotApiService: ICopilotApiService,
		@IClaudeProxyService private readonly _claudeProxyService: IClaudeProxyService,
	) {
		super();
	}

	// #region Descriptor + auth

	getDescriptor(): IAgentDescriptor {
		return {
			provider: this.id,
			displayName: localize('claudeAgent.displayName', "Claude"),
			description: localize('claudeAgent.description', "Claude agent backed by the Anthropic Claude Agent SDK"),
		};
	}

	getProtectedResources(): ProtectedResourceMetadata[] {
		return [GITHUB_COPILOT_PROTECTED_RESOURCE];
	}

	async authenticate(resource: string, token: string): Promise<boolean> {
		if (resource !== GITHUB_COPILOT_PROTECTED_RESOURCE.resource) {
			return false;
		}
		const tokenChanged = this._githubToken !== token;
		if (!tokenChanged) {
			this._logService.info('[Claude] Auth token unchanged');
			return true;
		}
		// Acquire the new handle BEFORE committing the token or disposing
		// the old one. If `start()` throws, leave `_githubToken` and
		// `_proxyHandle` untouched so the next `authenticate()` call still
		// sees the token as new and retries — otherwise a transient proxy
		// startup failure would leave us in a "token recorded, no proxy
		// running" state and the retry path would short-circuit as
		// "unchanged" and falsely return true.
		//
		// The proxy server's refcount stays >= 1 throughout this swap
		// because the new handle is acquired before the old one is
		// disposed; {@link IClaudeProxyService} applies most-recent-token-
		// wins on subsequent `start()` calls.
		const newHandle = await this._claudeProxyService.start(token);
		const oldHandle = this._proxyHandle;
		this._proxyHandle = newHandle;
		this._githubToken = token;
		this._logService.info('[Claude] Auth token updated');
		oldHandle?.dispose();
		void this._refreshModels();
		return true;
	}

	private async _refreshModels(): Promise<void> {
		const tokenAtStart = this._githubToken;
		if (!tokenAtStart) {
			this._models.set([], undefined);
			return;
		}
		try {
			const all = await this._copilotApiService.models(tokenAtStart);
			// Stale-write guard: if `authenticate()` rotated the token
			// while we were awaiting the model list, a newer refresh has
			// already published the right value — don't overwrite it.
			if (this._githubToken !== tokenAtStart) {
				return;
			}
			const filtered = all.filter(isClaudeModel).map(m => toAgentModelInfo(m, this.id));
			this._models.set(filtered, undefined);
		} catch (err) {
			this._logService.error(err, '[Claude] Failed to refresh models');
			if (this._githubToken === tokenAtStart) {
				this._models.set([], undefined);
			}
		}
	}

	// #endregion

	// #region Stubs — implemented in later phases

	createSession(_config?: IAgentCreateSessionConfig): Promise<IAgentCreateSessionResult> {
		throw new Error('TODO: Phase 5');
	}

	disposeSession(_session: URI): Promise<void> {
		throw new Error('TODO: Phase 5');
	}

	/**
	 * Full transcript reconstruction from the SDK event log lands in
	 * Phase 13; the bare method shape is required by {@link IAgent}.
	 */
	getSessionMessages(_session: URI): Promise<readonly Turn[]> {
		throw new Error('TODO: Phase 5');
	}

	listSessions(): Promise<IAgentSessionMetadata[]> {
		throw new Error('TODO: Phase 5');
	}

	resolveSessionConfig(_params: IAgentResolveSessionConfigParams): Promise<ResolveSessionConfigResult> {
		throw new Error('TODO: Phase 5');
	}

	sessionConfigCompletions(_params: IAgentSessionConfigCompletionsParams): Promise<SessionConfigCompletionsResult> {
		throw new Error('TODO: Phase 5');
	}

	shutdown(): Promise<void> {
		throw new Error('TODO: Phase 5');
	}

	sendMessage(_session: URI, _prompt: string, _attachments?: IAgentAttachment[], _turnId?: string): Promise<void> {
		throw new Error('TODO: Phase 6');
	}

	respondToPermissionRequest(_requestId: string, _approved: boolean): void {
		throw new Error('TODO: Phase 7');
	}

	respondToUserInputRequest(_requestId: string, _response: SessionInputResponseKind, _answers?: Record<string, SessionInputAnswer>): void {
		throw new Error('TODO: Phase 7');
	}

	abortSession(_session: URI): Promise<void> {
		throw new Error('TODO: Phase 9');
	}

	changeModel(_session: URI, _model: ModelSelection): Promise<void> {
		throw new Error('TODO: Phase 9');
	}

	setClientTools(_session: URI, _clientId: string, _tools: ToolDefinition[]): void {
		throw new Error('TODO: Phase 10');
	}

	onClientToolCallComplete(_session: URI, _toolCallId: string, _result: ToolCallResult): void {
		throw new Error('TODO: Phase 10');
	}

	setClientCustomizations(_clientId: string, _customizations: CustomizationRef[], _progress?: (results: ISyncedCustomization[]) => void): Promise<ISyncedCustomization[]> {
		throw new Error('TODO: Phase 11');
	}

	setCustomizationEnabled(_uri: string, _enabled: boolean): void {
		throw new Error('TODO: Phase 11');
	}

	// #endregion

	override dispose(): void {
		// Phase 6+ INVARIANT: SDK subprocess(es) MUST be killed BEFORE the
		// proxy handle is disposed. After dispose the proxy may rebind on
		// a different port and the subprocess would silently lose its
		// endpoint. See `IClaudeProxyHandle` doc in `claudeProxyService.ts`.
		// In Phase 4 there are no subprocesses, so this ordering is moot —
		// but the comment is mandatory so future contributors don't break
		// it when they wire the SDK in.
		this._proxyHandle?.dispose();
		this._proxyHandle = undefined;
		this._githubToken = undefined;
		this._models.set([], undefined);
		super.dispose();
	}
}
