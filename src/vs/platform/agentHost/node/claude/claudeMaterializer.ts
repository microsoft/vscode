/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import type { McpSdkServerConfigWithInstance, Options, WarmQuery } from '@anthropic-ai/claude-agent-sdk';
import type { CallToolResult } from '@modelcontextprotocol/sdk/types.js';
import { CancellationError } from '../../../../base/common/errors.js';
import { delimiter, dirname } from '../../../../base/common/path.js';
import { URI } from '../../../../base/common/uri.js';
import { rgDiskPath } from '../../../../base/node/ripgrep.js';
import { IInstantiationService } from '../../../instantiation/common/instantiation.js';
import { ILogService } from '../../../log/common/log.js';
import { IAgentConfigurationService } from '../agentConfigurationService.js';
import { ClaudePermissionMode } from '../../common/claudeSessionConfigKeys.js';
import { resolveClaudeEffort } from '../../common/claudeModelConfig.js';
import { PendingRequestRegistry } from '../../common/pendingRequestRegistry.js';
import { ISessionDataService } from '../../common/sessionDataService.js';
import type { ModelSelection, ToolDefinition } from '../../common/state/protocol/state.js';
import { IAgentSessionProjectInfo } from '../../common/agentService.js';
import { IClaudeAgentSdkService } from './claudeAgentSdkService.js';
import { ClaudeAgentSession } from './claudeAgentSession.js';
import { buildClientToolMcpServer } from './clientTools/claudeClientToolMcpServer.js';
import { IClaudeProxyHandle } from './claudeProxyService.js';
import { readClaudePermissionMode } from './claudeSessionPermissionMode.js';
import { SessionClientToolsDiff } from './clientTools/claudeSessionClientToolsModel.js';

/**
 * In-memory record for a provisional Claude session passed into
 * {@link ClaudeMaterializer.materialize}. Mirrors the agent's own
 * `IClaudeProvisionalSession` shape — kept structurally typed so the
 * agent doesn't need to export its private interface.
 */
export interface IClaudeMaterializeProvisional {
	readonly sessionId: string;
	readonly sessionUri: URI;
	readonly workingDirectory: URI | undefined;
	readonly abortController: AbortController;
	readonly project: IAgentSessionProjectInfo | undefined;
	readonly model: ModelSelection | undefined;
	/**
	 * Phase 10 — the workbench-registered client-tool snapshot at
	 * materialize time (if any). The materializer seeds the session's
	 * {@link SessionClientToolsDiff.model} from this and uses it to build
	 * the SDK's initial `Options.mcpServers`.
	 */
	readonly clientTools?: readonly ToolDefinition[];
	/**
	 * Phase 10 — the workbench `clientId` paired with {@link clientTools}.
	 * Used by the stream mapper to stamp `SessionToolCallStart.toolClientId`.
	 */
	readonly clientId?: string;
}

/**
 * Per-session bundle the agent hands to {@link ClaudeMaterializer.materialize}.
 * Everything the materializer needs to bring a session up AND to rebind
 * it on yield-restart — the materializer attaches the rematerializer
 * hook internally using this bundle, so the agent does not own any
 * SDK / client-tool plumbing.
 */
export interface IMaterializeContext {
	readonly provisional: IClaudeMaterializeProvisional;
	readonly proxyHandle: IClaudeProxyHandle;
	readonly canUseTool: NonNullable<Options['canUseTool']>;
	/**
	 * Fallback permission mode used when the live read from
	 * {@link IAgentConfigurationService} returns `undefined` (e.g. the
	 * session's schema has not been registered yet). The materializer
	 * reads the live value at materialize / rebind and falls back to
	 * this value so the SDK never silently downgrades to `'default'`.
	 */
	readonly permissionModeFallback: ClaudePermissionMode;
	readonly isResume: boolean;
}

/**
 * Promotes an {@link IClaudeMaterializeProvisional} record into a live
 * {@link ClaudeAgentSession}: assembles the SDK `Options` bag, awaits
 * `IClaudeAgentSdkService.startup`, opens the per-session DB ref, and
 * constructs the session wrapper.
 *
 * The caller (`ClaudeAgent`) retains:
 * - sequencing and the `_provisionalSessions` / `_sessions` maps,
 * - permission-mode resolution policy (passed in as a value),
 * - the post-materialize metadata write and the second abort gate,
 * - the `_onDidMaterializeSession` event fan-out.
 *
 * The materializer owns Gate 1 (post-`startup` abort): if the
 * controller fires while we awaited the SDK, the WarmQuery is asyncDisposed
 * and a {@link CancellationError} is thrown before any session resources
 * are constructed.
 *
 * Contract: a successful call returns a fully-owned `ClaudeAgentSession`.
 * If the call throws, no resources leak — the materializer cleans up
 * internally. After return, the caller owns disposal of the session
 * (including any post-materialize abort it observes).
 */
export class ClaudeMaterializer {

	constructor(
		@ILogService private readonly _logService: ILogService,
		@IClaudeAgentSdkService private readonly _sdkService: IClaudeAgentSdkService,
		@ISessionDataService private readonly _sessionDataService: ISessionDataService,
		@IInstantiationService private readonly _instantiationService: IInstantiationService,
		@IAgentConfigurationService private readonly _configurationService: IAgentConfigurationService,
	) { }

	async materialize(ctx: IMaterializeContext): Promise<ClaudeAgentSession> {
		const { provisional, proxyHandle, canUseTool, isResume, permissionModeFallback } = ctx;
		if (!provisional.workingDirectory) {
			throw new Error(`Cannot materialize Claude session ${provisional.sessionId}: workingDirectory is required`);
		}

		// Phase 10 — per-session client-tool plumbing. The MCP server's
		// `tool()` handler closures capture the SAME registry + diff that
		// the eventually-owned session holds, so the closures park on the
		// session's live registry (council finding C1).
		const pendingClientToolCalls = new PendingRequestRegistry<CallToolResult>();
		const toolDiff = new SessionClientToolsDiff();
		toolDiff.model.setTools(provisional.clientTools, provisional.clientId);

		const permissionMode = readClaudePermissionMode(this._configurationService, provisional.sessionUri) ?? permissionModeFallback;
		const initialMcpServers = await this._buildClientMcpServers(toolDiff, pendingClientToolCalls);

		const options = await this._buildOptions(provisional, proxyHandle, permissionMode, canUseTool, isResume, initialMcpServers);

		// Trace what the SDK gets so live debugging doesn't have to infer
		// from the absence of a `fileEdit` block whether the edit-tracking
		// plumbing was wired this session.
		this._logService.info(`[Claude] session ${provisional.sessionId}: enableFileCheckpointing=${options.enableFileCheckpointing} isResume=${isResume}`);

		const warm = await this._sdkService.startup({ options });

		// Q8 belt-and-suspenders: the SDK's comment guarantees abort cleanup
		// (sdk.d.ts:982), but if `startup()` resolved despite a racing abort,
		// dispose the WarmQuery and surface cancellation. The agent has been
		// shutting down while we awaited; do NOT materialize.
		if (provisional.abortController.signal.aborted) {
			await warm[Symbol.asyncDispose]();
			throw new CancellationError();
		}

		// Open a DB ref for the session lifetime so
		// `ClaudeAgentSession._observeUserMessage` can persist edit content
		// via `FileEditTracker.takeCompletedEdit`. Ownership transfers to
		// the session, which disposes the ref ahead of its `WarmQuery`
		// abort so any in-flight write completes.
		const dbRef = this._sessionDataService.openDatabase(provisional.sessionUri);
		let session: ClaudeAgentSession;
		try {
			session = this._instantiationService.createInstance(
				ClaudeAgentSession,
				provisional.sessionId,
				provisional.sessionUri,
				provisional.workingDirectory,
				warm,
				provisional.abortController,
				dbRef,
				pendingClientToolCalls,
				toolDiff,
				permissionModeFallback,
			);
		} catch (err) {
			// Construction failed — own the cleanup so no resource leaks.
			dbRef.dispose();
			await warm[Symbol.asyncDispose]();
			throw err;
		}

		// Phase 9 — wire the rematerializer so the session can rebind the
		// SDK on yield-restart (e.g. after a client-tool snapshot change).
		// The closure captures the ctx so `getPermissionMode` is re-read on
		// each rebind and any concurrent `SessionConfigChanged` wins.
		session.attachRematerializer(async (_reason) => {
			const liveMode = readClaudePermissionMode(this._configurationService, provisional.sessionUri) ?? permissionModeFallback;
			try {
				const mcpServers = await this._buildClientMcpServers(session.toolDiff, pendingClientToolCalls);
				return await this._materializeResume(provisional, proxyHandle, liveMode, canUseTool, mcpServers);
			} catch (err) {
				// The client-tool diff was consumed by `_buildClientMcpServers`,
				// but the rebind never reached a live SDK. Re-mark dirty so the
				// next send retries with the same snapshot instead of silently
				// running on the stale server set.
				session.toolDiff.markDirty();
				throw err;
			}
		});

		return session;
	}

	/**
	 * Phase 9 — build a fresh {@link WarmQuery} + {@link AbortController}
	 * for an *existing* session (resume mode). The caller (typically
	 * {@link ClaudeAgentSession._rebindQuery}) owns the returned warm and
	 * controller; `materializeResume` does NOT construct a
	 * {@link ClaudeAgentSession} or open a DB ref — those resources are
	 * already live on the recovering session.
	 *
	 * The new controller is fresh so a previous abort doesn't propagate
	 * into the rebuilt subprocess. Caller is responsible for wiring the
	 * controller into the session's existing dispose chain (the session's
	 * `_register(toDisposable(() => this._abortController.abort()))` reads
	 * the field via `this`, so swapping `_abortController` post-rebind is
	 * sufficient).
	 */
	private async _materializeResume(
		provisional: IClaudeMaterializeProvisional,
		proxyHandle: IClaudeProxyHandle,
		permissionMode: ClaudePermissionMode,
		canUseTool: NonNullable<Options['canUseTool']>,
		mcpServers: Record<string, McpSdkServerConfigWithInstance> | undefined,
	): Promise<{ readonly warm: WarmQuery; readonly abortController: AbortController }> {
		if (!provisional.workingDirectory) {
			throw new Error(`Cannot materialize Claude session ${provisional.sessionId}: workingDirectory is required`);
		}
		const abortController = new AbortController();
		const resumedProvisional: IClaudeMaterializeProvisional = { ...provisional, abortController };
		const options = await this._buildOptions(resumedProvisional, proxyHandle, permissionMode, canUseTool, true, mcpServers);
		this._logService.info(`[Claude] session ${provisional.sessionId}: resume rebuild`);
		const warm = await this._sdkService.startup({ options });
		return { warm, abortController };
	}

	private async _buildOptions(
		provisional: IClaudeMaterializeProvisional,
		proxyHandle: IClaudeProxyHandle,
		permissionMode: ClaudePermissionMode,
		canUseTool: NonNullable<Options['canUseTool']>,
		isResume: boolean,
		mcpServers: Record<string, McpSdkServerConfigWithInstance> | undefined,
	): Promise<Options> {
		const subprocessEnv = buildSubprocessEnv();
		// Settings env: forwarded to the Claude subprocess via the SDK's
		// `Options.settings.env` channel (separate from `Options.env` which
		// is the spawn env). PATH composition uses `delimiter` (`:` or `;`)
		// so Windows agent hosts don't corrupt PATH on subprocess fork.
		const resolvedRgDiskPath = await rgDiskPath();
		const settingsEnv: Record<string, string> = {
			ANTHROPIC_BASE_URL: proxyHandle.baseUrl,
			ANTHROPIC_AUTH_TOKEN: `${proxyHandle.nonce}.${provisional.sessionId}`,
			CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC: '1',
			USE_BUILTIN_RIPGREP: '0',
			PATH: `${dirname(resolvedRgDiskPath)}${delimiter}${process.env.PATH ?? ''}`,
		};

		return {
			cwd: provisional.workingDirectory!.fsPath,
			executable: process.execPath as 'node',
			env: subprocessEnv,
			abortController: provisional.abortController,
			allowDangerouslySkipPermissions: true,
			canUseTool,
			// Plan S3.7: silence the SDK's auto-decline path for any
			// incidental MCP elicitation request. Full MCP wiring is
			// Phase 10; until then we explicitly cancel so the caller
			// gets a deterministic `cancel` response and we record the
			// event for diagnostics.
			onElicitation: async req => {
				this._logService.info(`[Claude] declining elicitation from MCP server (Phase 7 stub): ${req.message ?? ''}`);
				return { action: 'cancel' };
			},
			disallowedTools: ['WebSearch'],
			includePartialMessages: true,
			// Phase 12: forward subagent text + thinking blocks through the
			// live message stream. Without this the SDK emits only
			// `tool_use` / `tool_result` from subagent contexts and the
			// child session shows up content-empty live, while replay via
			// `getSubagentMessages` returns the full transcript — a silent
			// UX asymmetry. Startup-only option, not user-bypassable.
			forwardSubagentText: true,
			// Phase 8: enable the SDK's per-session checkpoint store so
			// `Query.rewindFiles` can revert tool-applied edits without
			// re-running the agent. The session restore UX (smoke row R8)
			// depends on this being on at session start. This is a
			// startup option, not a hook — not user-bypassable via
			// settings.
			enableFileCheckpointing: true,
			// Phase 8: file-edit tracking is observed off the SDK message
			// stream itself (in `ClaudeAgentSession._processMessages`),
			// NOT via `Options.hooks.PreToolUse` / `Options.hooks.PostToolUse`.
			// Hooks can be disabled by the user in settings — relying on
			// them for edit tracking would silently break the diff/
			// checkpoint UX on those machines. The message stream is the
			// non-bypassable signal: the SDK has to yield the assistant
			// `tool_use` block and the synthetic-user `tool_result` block
			// regardless of `permissionMode` (`bypassPermissions`
			// short-circuits `canUseTool`, but never the message stream).
			model: provisional.model?.id,
			effort: resolveClaudeEffort(provisional.model),
			permissionMode,
			// Phase 9 — fresh sessions use `sessionId` so the SDK mints a new
			// transcript file; resume sessions use `resume` so the SDK reloads
			// the existing transcript. Setting both is invalid per the SDK's
			// `Options` discriminated union.
			...(isResume
				? { resume: provisional.sessionId }
				: { sessionId: provisional.sessionId }),
			...(mcpServers ? { mcpServers } : {}),
			settingSources: ['user', 'project', 'local'],
			settings: { env: settingsEnv },
			systemPrompt: { type: 'preset', preset: 'claude_code' },
			stderr: data => this._logService.error(`[Claude SDK stderr] ${data}`),
		};
	}

	/**
	 * Phase 10 — consume the diff (clears its dirty bit) and build the
	 * in-process MCP server config from the resulting tool snapshot.
	 * Resolves to `undefined` when the snapshot is empty so
	 * `Options.mcpServers` is omitted entirely and the SDK keeps its
	 * default. If the build throws the diff is re-marked dirty so the
	 * next sendMessage retries (C6).
	 */
	private async _buildClientMcpServers(
		toolDiff: SessionClientToolsDiff,
		registry: PendingRequestRegistry<CallToolResult>,
	): Promise<Record<string, McpSdkServerConfigWithInstance> | undefined> {
		const { tools } = toolDiff.consume();
		if (!tools || tools.length === 0) {
			return undefined;
		}
		const server = await buildClientToolMcpServer(tools, id => registry.register(id), this._sdkService);
		return { client: server };
	}
}

/**
 * Build the {@link Options.env} payload for the Claude subprocess.
 *
 * The agent host runs in an Electron utility process; the spawn env
 * inherits the parent's env which contains `NODE_OPTIONS`,
 * `ELECTRON_*`, and `VSCODE_*` variables that break the Claude
 * subprocess (it's a plain Node script driven by Electron's
 * `process.execPath` + `ELECTRON_RUN_AS_NODE`). Strip them via
 * {@link Options.env} `undefined` semantics (sdk.d.ts:1075-1078:
 * "Set a key to `undefined` to remove an inherited variable").
 *
 * Mirror of CopilotAgent's strip pattern at copilotAgent.ts:434-450.
 *
 * Exported for unit testing as a pure function over `process.env`.
 */
export function buildSubprocessEnv(): Record<string, string | undefined> {
	const env: Record<string, string | undefined> = {
		ELECTRON_RUN_AS_NODE: '1',
		NODE_OPTIONS: undefined,
		ANTHROPIC_API_KEY: undefined,
	};
	for (const key of Object.keys(process.env)) {
		if (key === 'ELECTRON_RUN_AS_NODE') { continue; }
		if (key.startsWith('VSCODE_') || key.startsWith('ELECTRON_')) {
			env[key] = undefined;
		}
	}
	return env;
}
