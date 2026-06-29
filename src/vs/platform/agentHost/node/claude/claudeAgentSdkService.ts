/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import type { AnyZodRawShape, ForkSessionOptions, ForkSessionResult, GetSessionMessagesOptions, GetSubagentMessagesOptions, InferShape, ListSessionsOptions, ListSubagentsOptions, McpSdkServerConfigWithInstance, Options, Query, SDKSessionInfo, SDKUserMessage, SdkMcpToolDefinition, SessionMessage, SessionMutationOptions, WarmQuery } from '@anthropic-ai/claude-agent-sdk';
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
 * file because it encodes Claude-specific knowledge — the env-var name
 * and the fact that Claude ships separate `linux-{x64,arm64}-musl` SKUs
 * alongside the default glibc ones. The downloader consumes this through
 * `IAgentSdkPackage` and never names Claude directly.
 */
export const ClaudeSdkPackage: IAgentSdkPackage = {
	id: 'claude',
	displayName: 'Claude',
	devOverrideEnvVar: AgentHostClaudeSdkRootEnvVar,
	hasSeparateMuslLinuxPackage: true,
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
	/**
	 * 1:1 with the SDK's top-level `query` export. Returns a `Query` whose
	 * subprocess starts lazily; callers drive control requests on it (e.g.
	 * `supportedModels()` for model enumeration) and `close()` it when done.
	 * Async only because the SDK module itself is loaded lazily.
	 */
	query(params: { prompt: string | AsyncIterable<SDKUserMessage>; options?: Options }): Promise<Query>;
	getSessionMessages(sessionId: string, options?: GetSessionMessagesOptions): Promise<readonly SessionMessage[]>;
	listSubagents(sessionId: string, options?: ListSubagentsOptions): Promise<readonly string[]>;
	getSubagentMessages(sessionId: string, agentId: string, options?: GetSubagentMessagesOptions): Promise<readonly SessionMessage[]>;

	/**
	 * True iff the SDK can be loaded WITHOUT a network download — a dev
	 * override or dev bare-import is available, or a previously-downloaded SDK
	 * is cached on disk. Eager / background callers (e.g. `listSessions` at
	 * startup) gate on this so listing sessions never kicks off a multi-second
	 * cold download before the user has started a session.
	 */
	canLoadWithoutDownload(): Promise<boolean>;

	forkSession(sessionId: string, options?: ForkSessionOptions): Promise<ForkSessionResult>;
	deleteSession(sessionId: string, options?: SessionMutationOptions): Promise<void>;
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
	query(params: { prompt: string | AsyncIterable<SDKUserMessage>; options?: Options }): Query;
	getSessionMessages(sessionId: string, options?: GetSessionMessagesOptions): Promise<SessionMessage[]>;
	listSubagents(sessionId: string, options?: ListSubagentsOptions): Promise<string[]>;
	getSubagentMessages(sessionId: string, agentId: string, options?: GetSubagentMessagesOptions): Promise<SessionMessage[]>;
	forkSession(sessionId: string, options?: ForkSessionOptions): Promise<ForkSessionResult>;
	deleteSession(sessionId: string, options?: SessionMutationOptions): Promise<void>;
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

	async canLoadWithoutDownload(): Promise<boolean> {
		// A dev override (explicit SDK root) is always local. So is the dev
		// bare-import path, which is taken when there is no product config —
		// `isAvailable` is false exactly in that case. Otherwise the SDK comes
		// from the downloader, which is only local once it has been cached.
		if (process.env[AgentHostClaudeSdkRootEnvVar] || !this._downloader.isAvailable(ClaudeSdkPackage)) {
			return true;
		}
		return this._downloader.isSdkResolvableWithoutDownload(ClaudeSdkPackage);
	}

	async getSessionInfo(sessionId: string): Promise<SDKSessionInfo | undefined> {
		const sdk = await this._getSdk();
		return sdk.getSessionInfo(sessionId);
	}

	async startup(params: { options: Options; initializeTimeoutMs?: number }): Promise<WarmQuery> {
		const sdk = await this._getSdk();
		return sdk.startup(params);
	}

	async query(params: { prompt: string | AsyncIterable<SDKUserMessage>; options?: Options }): Promise<Query> {
		const sdk = await this._getSdk();
		return sdk.query(params);
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

	async forkSession(sessionId: string, options?: ForkSessionOptions): Promise<ForkSessionResult> {
		const sdk = await this._getSdk();
		return sdk.forkSession(sessionId, options);
	}

	async deleteSession(sessionId: string, options?: SessionMutationOptions): Promise<void> {
		const sdk = await this._getSdk();
		return sdk.deleteSession(sessionId, options);
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
		// 1. Env-var override wins — both for the air-gapped server case
		//    (`--claude-sdk-root` flag) and for developers who want to point
		//    at an out-of-tree SDK build without touching `node_modules`.
		const override = process.env[AgentHostClaudeSdkRootEnvVar];
		if (override) {
			const entry = join(override, 'node_modules', '@anthropic-ai', 'claude-agent-sdk', 'sdk.mjs');
			return import(pathToFileURL(entry).href);
		}

		// 2. Built products: load via the downloader (cache → fetch the
		//    per-host tarball described by `product.agentSdks.claude`). Errors
		//    from this path propagate as-is so users see actionable diagnostics
		//    on a CDN outage / corrupt cache / etc., not a misleading
		//    "cannot find module" from a fallback that would never succeed in
		//    a shipped build anyway.
		//
		//    We use `isAvailable` (env var || product config) — already false
		//    in dev — to discriminate without injecting `INativeEnvironmentService`
		//    here. The env-var branch above already returned, so reaching this
		//    point with `isAvailable === true` means product config is present
		//    and the downloader is the correct path.
		if (this._downloader.isAvailable(ClaudeSdkPackage)) {
			const root = await this._downloader.loadSdkRoot(ClaudeSdkPackage, CancellationToken.None);
			const entry = join(root, 'node_modules', '@anthropic-ai', 'claude-agent-sdk', 'sdk.mjs');
			return import(pathToFileURL(entry).href);
		}

		// 3. Dev: bare import resolves via this repo's `node_modules` where
		//    `@anthropic-ai/claude-agent-sdk` is a devDependency. Only reached
		//    when neither the env var nor product config supplied a path —
		//    i.e. exclusively in dev launches.
		return import('@anthropic-ai/claude-agent-sdk');
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
