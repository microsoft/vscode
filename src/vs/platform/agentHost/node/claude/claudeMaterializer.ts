/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import type { Options } from '@anthropic-ai/claude-agent-sdk';
import { rgPath } from '@vscode/ripgrep';
import { CancellationError } from '../../../../base/common/errors.js';
import { delimiter, dirname } from '../../../../base/common/path.js';
import { URI } from '../../../../base/common/uri.js';
import { IInstantiationService } from '../../../instantiation/common/instantiation.js';
import { ILogService } from '../../../log/common/log.js';
import { ClaudePermissionMode } from '../../common/claudeSessionConfigKeys.js';
import { resolveClaudeEffort } from '../../common/claudeModelConfig.js';
import { ISessionDataService } from '../../common/sessionDataService.js';
import type { ModelSelection } from '../../common/state/protocol/state.js';
import { IAgentSessionProjectInfo } from '../../common/agentService.js';
import { IClaudeAgentSdkService } from './claudeAgentSdkService.js';
import { ClaudeAgentSession } from './claudeAgentSession.js';
import { IClaudeProxyHandle } from './claudeProxyService.js';

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
	) { }

	async materialize(
		provisional: IClaudeMaterializeProvisional,
		proxyHandle: IClaudeProxyHandle,
		permissionMode: ClaudePermissionMode,
		canUseTool: NonNullable<Options['canUseTool']>,
	): Promise<ClaudeAgentSession> {
		if (!provisional.workingDirectory) {
			throw new Error(`Cannot materialize Claude session ${provisional.sessionId}: workingDirectory is required`);
		}

		const options = this._buildOptions(provisional, proxyHandle, permissionMode, canUseTool);

		// Trace what the SDK gets so live debugging doesn't have to infer
		// from the absence of a `fileEdit` block whether the edit-tracking
		// plumbing was wired this session.
		this._logService.info(`[Claude] session ${provisional.sessionId}: enableFileCheckpointing=${options.enableFileCheckpointing}`);

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
		try {
			return this._instantiationService.createInstance(
				ClaudeAgentSession,
				provisional.sessionId,
				provisional.sessionUri,
				provisional.workingDirectory,
				warm,
				provisional.abortController,
				dbRef,
			);
		} catch (err) {
			// Construction failed — own the cleanup so no resource leaks.
			dbRef.dispose();
			await warm[Symbol.asyncDispose]();
			throw err;
		}
	}

	private _buildOptions(
		provisional: IClaudeMaterializeProvisional,
		proxyHandle: IClaudeProxyHandle,
		permissionMode: ClaudePermissionMode,
		canUseTool: NonNullable<Options['canUseTool']>,
	): Options {
		const subprocessEnv = buildSubprocessEnv();
		// Settings env: forwarded to the Claude subprocess via the SDK's
		// `Options.settings.env` channel (separate from `Options.env` which
		// is the spawn env). PATH composition uses `delimiter` (`:` or `;`)
		// so Windows agent hosts don't corrupt PATH on subprocess fork.
		// In packaged builds @vscode/ripgrep lives inside node_modules.asar; the
		// rg binary itself is unpacked next door, so rewrite the path before
		// putting it on PATH (matches `copilotAgent.ts` and the workbench
		// search engine helpers).
		const rgDiskPath = rgPath.replace(/\bnode_modules\.asar\b/, 'node_modules.asar.unpacked');
		const settingsEnv: Record<string, string> = {
			ANTHROPIC_BASE_URL: proxyHandle.baseUrl,
			ANTHROPIC_AUTH_TOKEN: `${proxyHandle.nonce}.${provisional.sessionId}`,
			CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC: '1',
			USE_BUILTIN_RIPGREP: '0',
			PATH: `${dirname(rgDiskPath)}${delimiter}${process.env.PATH ?? ''}`,
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
			sessionId: provisional.sessionId,
			settingSources: ['user', 'project', 'local'],
			settings: { env: settingsEnv },
			systemPrompt: { type: 'preset', preset: 'claude_code' },
			stderr: data => this._logService.error(`[Claude SDK stderr] ${data}`),
		};
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
