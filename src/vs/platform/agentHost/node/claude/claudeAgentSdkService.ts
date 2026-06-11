/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import type { AnyZodRawShape, GetSessionMessagesOptions, GetSubagentMessagesOptions, InferShape, ListSessionsOptions, ListSubagentsOptions, McpSdkServerConfigWithInstance, Options, SDKSessionInfo, SdkMcpToolDefinition, SessionMessage, WarmQuery } from '@anthropic-ai/claude-agent-sdk';
import type { CallToolResult } from '@modelcontextprotocol/sdk/types.js';
import { pathToFileURL } from 'url';
import { CancellationToken } from '../../../../base/common/cancellation.js';
import { join } from '../../../../base/common/path.js';
import { createDecorator } from '../../../instantiation/common/instantiation.js';
import { ILogService } from '../../../log/common/log.js';
import { IAgentSdkDownloader, IAgentSdkPackage } from '../agentSdkDownloader.js';
import { AgentHostClaudeSdkRootEnvVar } from '../../common/agentService.js';

/**
 * `@anthropic-ai/claude-agent-sdk` distribution descriptor. Lives in this
 * file because it encodes Claude-specific knowledge — the env-var name.
 * The downloader consumes this through `IAgentSdkPackage` and never names
 * Claude directly.
 */
export const ClaudeSdkPackage: IAgentSdkPackage = {
	id: 'claude',
	devOverrideEnvVar: AgentHostClaudeSdkRootEnvVar,
};

export const IClaudeAgentSdkService = createDecorator<IClaudeAgentSdkService>('claudeAgentSdkService');

/**
 * Pure per-method passthrough shim over `@anthropic-ai/claude-agent-sdk`.
 *
 * Every method on this interface corresponds 1:1 to a single SDK export.
 * The shim owns lazy module loading and the first-failure log-once
 * convention; it does NOT compose, wrap, or add behavior on top of the
 * SDK's surface. Higher-level orchestration (e.g. building the in-process
 * client-tool MCP server) lives in dedicated modules that depend on this
 * interface for the raw bindings.
 */
export interface IClaudeAgentSdkService {
	readonly _serviceBrand: undefined;

	listSessions(): Promise<readonly SDKSessionInfo[]>;
	getSessionInfo(sessionId: string): Promise<SDKSessionInfo | undefined>;
	startup(params: { options: Options; initializeTimeoutMs?: number }): Promise<WarmQuery>;
	getSessionMessages(sessionId: string, options?: GetSessionMessagesOptions): Promise<readonly SessionMessage[]>;
	listSubagents(sessionId: string, options?: ListSubagentsOptions): Promise<readonly string[]>;
	getSubagentMessages(sessionId: string, agentId: string, options?: GetSubagentMessagesOptions): Promise<readonly SessionMessage[]>;

	createSdkMcpServer(options: {
		name: string;
		version?: string;
		// SDK signature: `tools?: Array<SdkMcpToolDefinition<any>>`. The `any`
		// here is required to match the SDK's own erased generic and to allow
		// callers to pass an array of tools whose schemas differ from each other.
		// eslint-disable-next-line @typescript-eslint/no-explicit-any
		tools?: Array<SdkMcpToolDefinition<any>>;
	}): Promise<McpSdkServerConfigWithInstance>;

	tool<Schema extends AnyZodRawShape>(
		name: string,
		description: string,
		inputSchema: Schema,
		handler: (args: InferShape<Schema>, extra: unknown) => Promise<CallToolResult>
	): Promise<SdkMcpToolDefinition<Schema>>;
}

/**
 * Narrowed structural slice of `@anthropic-ai/claude-agent-sdk` covering
 * exactly the bindings the agent host pulls from the SDK. Production
 * `import()` returns the full module which is structurally assignable to
 * this interface. Tests usually stub {@link IClaudeAgentSdkService} via
 * the DI container, but a few existing suites subclass
 * {@link ClaudeAgentSdkService} and override {@link ClaudeAgentSdkService._loadSdk}
 * to fault or stub these bindings without having to name every export of
 * the SDK module — `_loadSdk` is `protected` for that reason.
 */
export interface IClaudeSdkBindings {
	listSessions(options?: ListSessionsOptions): Promise<SDKSessionInfo[]>;
	getSessionInfo(sessionId: string): Promise<SDKSessionInfo | undefined>;
	startup(params: { options: Options; initializeTimeoutMs?: number }): Promise<WarmQuery>;
	getSessionMessages(sessionId: string, options?: GetSessionMessagesOptions): Promise<SessionMessage[]>;
	listSubagents(sessionId: string, options?: ListSubagentsOptions): Promise<string[]>;
	getSubagentMessages(sessionId: string, agentId: string, options?: GetSubagentMessagesOptions): Promise<SessionMessage[]>;
	createSdkMcpServer(options: {
		name: string;
		version?: string;
		// eslint-disable-next-line @typescript-eslint/no-explicit-any
		tools?: Array<SdkMcpToolDefinition<any>>;
	}): McpSdkServerConfigWithInstance;
	tool<Schema extends AnyZodRawShape>(
		name: string,
		description: string,
		inputSchema: Schema,
		handler: (args: InferShape<Schema>, extra: unknown) => Promise<CallToolResult>
	): SdkMcpToolDefinition<Schema>;
}

export class ClaudeAgentSdkService implements IClaudeAgentSdkService {
	declare readonly _serviceBrand: undefined;

	/**
	 * Cached resolved bindings. We deliberately cache the *resolved* value,
	 * not the in-flight promise — if a transient `import()` failure recovers
	 * (e.g. user fixes a broken `node_modules`), the next call retries.
	 */
	private _sdkModule: IClaudeSdkBindings | undefined;

	/**
	 * Latched once we've logged a load failure, so a corrupt postinstall
	 * doesn't flood `error` events on every `listSessions()` call.
	 */
	private _firstLoadFailureLogged = false;

	constructor(
		@ILogService private readonly _logService: ILogService,
		@IAgentSdkDownloader private readonly _downloader: IAgentSdkDownloader,
	) { }

	async listSessions(): Promise<readonly SDKSessionInfo[]> {
		const sdk = await this._getSdk();
		return sdk.listSessions(undefined);
	}

	async getSessionInfo(sessionId: string): Promise<SDKSessionInfo | undefined> {
		const sdk = await this._getSdk();
		return sdk.getSessionInfo(sessionId);
	}

	async startup(params: { options: Options; initializeTimeoutMs?: number }): Promise<WarmQuery> {
		const sdk = await this._getSdk();
		return sdk.startup(params);
	}

	async getSessionMessages(sessionId: string, options?: GetSessionMessagesOptions): Promise<readonly SessionMessage[]> {
		const sdk = await this._getSdk();
		return sdk.getSessionMessages(sessionId, options);
	}

	async listSubagents(sessionId: string, options?: ListSubagentsOptions): Promise<readonly string[]> {
		const sdk = await this._getSdk();
		return sdk.listSubagents(sessionId, options);
	}

	async getSubagentMessages(sessionId: string, agentId: string, options?: GetSubagentMessagesOptions): Promise<readonly SessionMessage[]> {
		const sdk = await this._getSdk();
		return sdk.getSubagentMessages(sessionId, agentId, options);
	}

	async createSdkMcpServer(options: {
		name: string;
		version?: string;
		// eslint-disable-next-line @typescript-eslint/no-explicit-any
		tools?: Array<SdkMcpToolDefinition<any>>;
	}): Promise<McpSdkServerConfigWithInstance> {
		const sdk = await this._getSdk();
		return sdk.createSdkMcpServer(options);
	}

	async tool<Schema extends AnyZodRawShape>(
		name: string,
		description: string,
		inputSchema: Schema,
		handler: (args: InferShape<Schema>, extra: unknown) => Promise<CallToolResult>
	): Promise<SdkMcpToolDefinition<Schema>> {
		const sdk = await this._getSdk();
		return sdk.tool(name, description, inputSchema, handler);
	}

	private async _getSdk(): Promise<IClaudeSdkBindings> {
		if (this._sdkModule) {
			return this._sdkModule;
		}
		try {
			this._sdkModule = await this._loadSdk();
			return this._sdkModule;
		} catch (err) {
			if (!this._firstLoadFailureLogged) {
				this._firstLoadFailureLogged = true;
				this._logService.error('[Claude] Failed to load @anthropic-ai/claude-agent-sdk', err);
			}
			throw err;
		}
	}

	protected async _loadSdk(): Promise<IClaudeSdkBindings> {
		// Resolve the SDK root via the downloader: dev override → cache →
		// download from `product.agentSdks.claude`. The known internal
		// `sdk.mjs` entrypoint is hard-coded here because this file is the
		// one place that owns knowledge of the Claude SDK's import surface.
		const root = await this._downloader.loadSdkRoot(ClaudeSdkPackage, CancellationToken.None);
		const entry = join(root, 'node_modules', '@anthropic-ai', 'claude-agent-sdk', 'sdk.mjs');
		return import(pathToFileURL(entry).href);
	}
}

// #region Compile-time SDK drift detection
//
// Enforce that every method on IClaudeSdkBindings names a real export of
// `@anthropic-ai/claude-agent-sdk` and is assignable from that export's
// type. If the SDK renames or changes the signature of any of these
// exports, the `_assertBindingsMatchSdk` assignment below stops type-
// checking and the build fails — flagging that the shim needs updating.

type SdkModule = typeof import('@anthropic-ai/claude-agent-sdk');

type AssertBindingsMatchSdk = {
	[K in keyof IClaudeSdkBindings]: K extends keyof SdkModule
	? SdkModule[K] extends IClaudeSdkBindings[K]
	? true
	: ['SDK export signature drifted from IClaudeSdkBindings', K, SdkModule[K], IClaudeSdkBindings[K]]
	: ['Not an export of @anthropic-ai/claude-agent-sdk', K];
};

// Forces the mapped type above to be eagerly checked: if any entry is not
// `true`, this assignment fails to compile. Module-local so the runtime
// surface stays clean — the only purpose is the type-level assertion.
const _assertBindingsMatchSdk: { [K in keyof IClaudeSdkBindings]: true } = null as unknown as AssertBindingsMatchSdk;
void _assertBindingsMatchSdk;

// #endregion
