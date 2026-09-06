/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Gesture } from '../../../../base/browser/touch.js';
import { decodeBase64 } from '../../../../base/common/buffer.js';
import { CancellationToken } from '../../../../base/common/cancellation.js';
import { Emitter, Event } from '../../../../base/common/event.js';
import { Disposable, IDisposable } from '../../../../base/common/lifecycle.js';
import { derived, IObservable, observableFromEvent } from '../../../../base/common/observable.js';
import { isMobile, isWeb, locale } from '../../../../base/common/platform.js';
import { hasKey } from '../../../../base/common/types.js';
import { IAgentHostService } from '../../../../platform/agentHost/common/agentService.js';
import { IInstantiationService } from '../../../../platform/instantiation/common/instantiation.js';
import { ColorScheme } from '../../../../platform/theme/common/theme.js';
import { IThemeService } from '../../../../platform/theme/common/themeService.js';
import { McpServer } from '../common/mcpServer.js';
import { IMcpServer, IMcpService, IMcpSamplingService, IMcpToolCallUIData, McpToolVisibility } from '../common/mcpTypes.js';
import { findMcpServer, startServerAndWaitForLiveTools, translateMcpLogMessage } from '../common/mcpTypesUtils.js';
import { MCP } from '../common/modelContextProtocol.js';
import { McpApps } from '../common/modelContextProtocolApps.js';

/**
 * Result from loading an MCP App UI resource.
 */
export interface IMcpAppResourceContent extends McpApps.McpUiResourceMeta {
	/** The HTML content of the UI resource */
	readonly html: string;
	/** MIME type of the content */
	readonly mimeType: string;
}

/**
 * Transport abstraction for the constrained subset of MCP requests an MCP
 * App's webview makes back to the host. Two implementations exist: one
 * routes through {@link IMcpService} (local servers), the other through
 * {@link IAgentHostService.handleMcpRequest} on an `mcp://` AHP side
 * channel (agent-host-resident servers).
 */
export interface IMcpAppCallTransport extends IDisposable {
	/** Forwarded MCP server notifications (`notifications/*`) for this server. */
	readonly onNotification: Event<{ readonly method: string; readonly params?: unknown }>;

	loadResource(token: CancellationToken): Promise<IMcpAppResourceContent>;
	callTool(name: string, params: Record<string, unknown>, token: CancellationToken): Promise<MCP.CallToolResult>;
	readResource(uri: string, token: CancellationToken): Promise<MCP.ReadResourceResult>;
	sampling(params: MCP.CreateMessageRequest['params'], token: CancellationToken): Promise<MCP.CreateMessageResult>;
	log(params: MCP.LoggingMessageNotificationParams): Promise<void>;
}

function readResourceContentToHtml(contents: readonly (MCP.TextResourceContents | MCP.BlobResourceContents)[]): IMcpAppResourceContent {
	if (!contents || contents.length === 0) {
		throw new Error('UI resource not found on server');
	}

	const content = contents[0];
	let html: string;
	const mimeType = content.mimeType || 'text/html';

	if (hasKey(content, { text: true })) {
		html = content.text;
	} else if (hasKey(content, { blob: true })) {
		html = decodeBase64(content.blob).toString();
	} else {
		throw new Error('UI resource has no content');
	}

	const meta = content._meta?.ui as McpApps.McpUiResourceMeta | undefined;
	return {
		...meta,
		html,
		mimeType,
	};
}

/**
 * Local transport: resolves the MCP server via {@link IMcpService} and
 * proxies requests through {@link IMcpServer}. Used for locally-configured
 * MCP servers whose state lives in the workbench.
 */
class LocalMcpAppCallTransport extends Disposable implements IMcpAppCallTransport {
	private readonly _onNotification = this._register(new Emitter<{ readonly method: string; readonly params?: unknown }>());
	readonly onNotification: Event<{ readonly method: string; readonly params?: unknown }> = this._onNotification.event;

	constructor(
		private readonly _uiData: Extract<IMcpToolCallUIData, { kind: 'local' }>,
		@IMcpService private readonly _mcpService: IMcpService,
		@IMcpSamplingService private readonly _samplingService: IMcpSamplingService,
	) {
		super();
	}

	private async _getServer(token: CancellationToken): Promise<IMcpServer | undefined> {
		return findMcpServer(this._mcpService, s =>
			s.definition.id === this._uiData.serverDefinitionId &&
			s.collection.id === this._uiData.collectionId,
			token
		);
	}

	async log(params: MCP.LoggingMessageNotificationParams): Promise<void> {
		const server = await this._getServer(CancellationToken.None);
		if (server) {
			translateMcpLogMessage((server as McpServer).logger, params, `[App UI]`);
		}
	}

	async loadResource(token: CancellationToken): Promise<IMcpAppResourceContent> {
		const server = await this._getServer(token);
		if (!server) {
			throw new Error('MCP server not found for UI resource');
		}

		const resourceResult = await McpServer.callOn(server, h => h.readResource({ uri: this._uiData.resourceUri }, token), token);
		return readResourceContentToHtml(resourceResult.contents);
	}

	async callTool(name: string, params: Record<string, unknown>, token: CancellationToken): Promise<MCP.CallToolResult> {
		const server = await this._getServer(token);
		if (!server) {
			throw new Error('MCP server not found for tool call');
		}

		await startServerAndWaitForLiveTools(server, undefined, token);

		const tool = server.tools.get().find(t => t.definition.name === name);
		if (!tool || !(tool.visibility & McpToolVisibility.App)) {
			throw new Error(`Tool not found on server: ${name}`);
		}

		const res = await tool.call(params, undefined, token);
		return {
			content: res.content,
			isError: res.isError,
			_meta: res._meta,
			structuredContent: res.structuredContent,
		};
	}

	async readResource(uri: string, token: CancellationToken): Promise<MCP.ReadResourceResult> {
		const server = await this._getServer(token);
		if (!server) {
			throw new Error('MCP server not found');
		}

		return await McpServer.callOn(server, h => h.readResource({ uri }, token), token);
	}

	async sampling(params: MCP.CreateMessageRequest['params'], token: CancellationToken): Promise<MCP.CreateMessageResult> {
		const server = await this._getServer(token);
		if (!server) {
			throw new Error('MCP server not found for sampling');
		}
		const { sample } = await this._samplingService.sample({
			server,
			isDuringToolCall: true,
			params,
		}, token);
		return sample;
	}
}

/**
 * AHP transport: routes requests over the `mcp://` side channel via
 * {@link IAgentHostService.handleMcpRequest}, and filters
 * {@link IAgentHostService.onMcpNotification} down to this channel.
 *
 * Used for MCP servers owned by an agent host (e.g. Copilot CLI).
 */
class AhpMcpAppCallTransport extends Disposable implements IMcpAppCallTransport {
	private readonly _onNotification = this._register(new Emitter<{ readonly method: string; readonly params?: unknown }>());
	readonly onNotification: Event<{ readonly method: string; readonly params?: unknown }> = this._onNotification.event;

	constructor(
		private readonly _uiData: Extract<IMcpToolCallUIData, { kind: 'agentHost' }>,
		private readonly _channel: string,
		@IAgentHostService private readonly _agentHostService: IAgentHostService,
	) {
		super();

		this._register(this._agentHostService.onMcpNotification(n => {
			if (n.channel === this._channel) {
				this._onNotification.fire({ method: n.method, params: n.params });
			}
		}));
	}

	async log(params: MCP.LoggingMessageNotificationParams): Promise<void> {
		// Notifications are one-way; the AHP `mcp://` channel accepts
		// `notifications/message` from the client. We use the request
		// path here for symmetry (the host treats `notifications/message`
		// the same regardless of how it arrived). Failures are swallowed
		// to avoid surfacing log-pipe errors to the App.
		try {
			await this._agentHostService.handleMcpRequest(this._channel, 'notifications/message', params as unknown as Record<string, unknown>);
		} catch {
			// no-op
		}
	}

	async loadResource(_token: CancellationToken): Promise<IMcpAppResourceContent> {
		const result = await this._agentHostService.handleMcpRequest(this._channel, 'resources/read', { uri: this._uiData.resourceUri }) as MCP.ReadResourceResult;
		return readResourceContentToHtml(result.contents);
	}

	async callTool(name: string, params: Record<string, unknown>, _token: CancellationToken): Promise<MCP.CallToolResult> {
		const result = await this._agentHostService.handleMcpRequest(this._channel, 'tools/call', { name, arguments: params }) as MCP.CallToolResult;
		return result;
	}

	async readResource(uri: string, _token: CancellationToken): Promise<MCP.ReadResourceResult> {
		const result = await this._agentHostService.handleMcpRequest(this._channel, 'resources/read', { uri }) as MCP.ReadResourceResult;
		return result;
	}

	async sampling(params: MCP.CreateMessageRequest['params'], _token: CancellationToken): Promise<MCP.CreateMessageResult> {
		const result = await this._agentHostService.handleMcpRequest(this._channel, 'sampling/createMessage', params as unknown as Record<string, unknown>) as MCP.CreateMessageResult;
		return result;
	}
}

/**
 * Wrapper class that "upgrades" serializable IMcpToolCallUIData into a functional
 * object that can load UI resources and proxy tool/resource calls back to the MCP server.
 *
 * Selects the underlying transport based on whether the renderer was given
 * an AHP `mcp://` channel — agent-host-resident servers route through
 * {@link IAgentHostService}, everything else uses the local {@link IMcpService}.
 */
export class McpToolCallUI extends Disposable {
	/**
	 * Basic host context reflecting the current UI and theme. Notably lacks
	 * the `toolInfo` or `viewport` sizes.
	 */
	public readonly hostContext: IObservable<McpApps.McpUiHostContext>;

	private readonly _transport: IMcpAppCallTransport;

	/** Forwarded MCP server notifications scoped to this App's server. */
	public readonly onNotification: Event<{ readonly method: string; readonly params?: unknown }>;

	constructor(
		private readonly _uiData: IMcpToolCallUIData,
		@IInstantiationService instantiationService: IInstantiationService,
		@IThemeService themeService: IThemeService,
	) {
		super();

		this._transport = this._register(
			_uiData.kind === 'agentHost'
				? instantiationService.createInstance(AhpMcpAppCallTransport, _uiData, _uiData.channel)
				: instantiationService.createInstance(LocalMcpAppCallTransport, _uiData)
		);
		this.onNotification = this._transport.onNotification;

		const colorTheme = observableFromEvent(
			themeService.onDidColorThemeChange,
			() => {
				const type = themeService.getColorTheme().type;
				return type === ColorScheme.DARK || type === ColorScheme.HIGH_CONTRAST_DARK ? 'dark' : 'light';
			}
		);

		this.hostContext = derived((reader): McpApps.McpUiHostContext => {
			return {
				theme: colorTheme.read(reader),
				styles: {
					variables: {
						'--color-background-primary': 'var(--vscode-editor-background)',
						'--color-background-secondary': 'var(--vscode-sideBar-background)',
						'--color-background-tertiary': 'var(--vscode-activityBar-background)',
						'--color-background-inverse': 'var(--vscode-editor-foreground)',
						'--color-background-ghost': 'transparent',
						'--color-background-info': 'var(--vscode-inputValidation-infoBackground)',
						'--color-background-danger': 'var(--vscode-inputValidation-errorBackground)',
						'--color-background-success': 'var(--vscode-diffEditor-insertedTextBackground)',
						'--color-background-warning': 'var(--vscode-inputValidation-warningBackground)',
						'--color-background-disabled': 'var(--vscode-editor-inactiveSelectionBackground)',

						'--color-text-primary': 'var(--vscode-foreground)',
						'--color-text-secondary': 'var(--vscode-descriptionForeground)',
						'--color-text-tertiary': 'var(--vscode-disabledForeground)',
						'--color-text-inverse': 'var(--vscode-editor-background)',
						'--color-text-info': 'var(--vscode-textLink-foreground)',
						'--color-text-danger': 'var(--vscode-errorForeground)',
						'--color-text-success': 'var(--vscode-testing-iconPassed)',
						'--color-text-warning': 'var(--vscode-editorWarning-foreground)',
						'--color-text-disabled': 'var(--vscode-disabledForeground)',
						'--color-text-ghost': 'var(--vscode-descriptionForeground)',

						'--color-border-primary': 'var(--vscode-widget-border)',
						'--color-border-secondary': 'var(--vscode-editorWidget-border)',
						'--color-border-tertiary': 'var(--vscode-panel-border)',
						'--color-border-inverse': 'var(--vscode-foreground)',
						'--color-border-ghost': 'transparent',
						'--color-border-info': 'var(--vscode-inputValidation-infoBorder)',
						'--color-border-danger': 'var(--vscode-inputValidation-errorBorder)',
						'--color-border-success': 'var(--vscode-testing-iconPassed)',
						'--color-border-warning': 'var(--vscode-inputValidation-warningBorder)',
						'--color-border-disabled': 'var(--vscode-disabledForeground)',

						'--color-ring-primary': 'var(--vscode-focusBorder)',
						'--color-ring-secondary': 'var(--vscode-focusBorder)',
						'--color-ring-inverse': 'var(--vscode-focusBorder)',
						'--color-ring-info': 'var(--vscode-inputValidation-infoBorder)',
						'--color-ring-danger': 'var(--vscode-inputValidation-errorBorder)',
						'--color-ring-success': 'var(--vscode-testing-iconPassed)',
						'--color-ring-warning': 'var(--vscode-inputValidation-warningBorder)',

						'--font-sans': 'var(--vscode-font-family)',
						'--font-mono': 'var(--vscode-editor-font-family)',

						'--font-weight-normal': 'normal',
						'--font-weight-medium': '500',
						'--font-weight-semibold': '600',
						'--font-weight-bold': 'bold',

						'--font-text-xs-size': '10px',
						'--font-text-sm-size': '11px',
						'--font-text-md-size': '13px',
						'--font-text-lg-size': '14px',

						'--font-heading-xs-size': '16px',
						'--font-heading-sm-size': '18px',
						'--font-heading-md-size': '20px',
						'--font-heading-lg-size': '24px',
						'--font-heading-xl-size': '32px',
						'--font-heading-2xl-size': '40px',
						'--font-heading-3xl-size': '48px',

						'--border-radius-xs': '2px',
						'--border-radius-sm': '3px',
						'--border-radius-md': '4px',
						'--border-radius-lg': '6px',
						'--border-radius-xl': '8px',
						'--border-radius-full': '9999px',

						'--border-width-regular': '1px',

						'--font-text-xs-line-height': '1.5',
						'--font-text-sm-line-height': '1.5',
						'--font-text-md-line-height': '1.5',
						'--font-text-lg-line-height': '1.5',

						'--font-heading-xs-line-height': '1.25',
						'--font-heading-sm-line-height': '1.25',
						'--font-heading-md-line-height': '1.25',
						'--font-heading-lg-line-height': '1.25',
						'--font-heading-xl-line-height': '1.25',
						'--font-heading-2xl-line-height': '1.25',
						'--font-heading-3xl-line-height': '1.25',

						'--shadow-hairline': '0 0 0 1px var(--vscode-widget-shadow)',
						'--shadow-sm': '0 1px 2px 0 var(--vscode-widget-shadow)',
						'--shadow-md': '0 4px 6px -1px var(--vscode-widget-shadow)',
						'--shadow-lg': '0 10px 15px -3px var(--vscode-widget-shadow)',
					}
				},
				displayMode: 'inline',
				availableDisplayModes: ['inline'],
				locale: locale,
				platform: isWeb ? 'web' : isMobile ? 'mobile' : 'desktop',
				deviceCapabilities: {
					touch: Gesture.isTouchDevice(),
					hover: Gesture.isHoverDevice(),
				},
			};
		});
	}

	/**
	 * Gets the underlying UI data.
	 */
	public get uiData(): IMcpToolCallUIData {
		return this._uiData;
	}

	/**
	 * Logs a message to the MCP server's logger.
	 */
	public log(log: MCP.LoggingMessageNotificationParams): Promise<void> {
		return this._transport.log(log);
	}

	/**
	 * Loads the UI resource from the MCP server.
	 * @param token Cancellation token
	 * @returns The HTML content and CSP configuration
	 */
	public loadResource(token: CancellationToken): Promise<IMcpAppResourceContent> {
		return this._transport.loadResource(token);
	}

	/**
	 * Calls a tool on the MCP server.
	 * @param name Tool name
	 * @param params Tool parameters
	 * @param token Cancellation token
	 * @returns The tool call result
	 */
	public callTool(name: string, params: Record<string, unknown>, token: CancellationToken): Promise<MCP.CallToolResult> {
		return this._transport.callTool(name, params, token);
	}

	/**
	 * Reads a resource from the MCP server.
	 * @param uri Resource URI
	 * @param token Cancellation token
	 * @returns The resource content
	 */
	public readResource(uri: string, token: CancellationToken): Promise<MCP.ReadResourceResult> {
		return this._transport.readResource(uri, token);
	}

	/**
	 * Issues a `sampling/createMessage` request against the MCP server's
	 * host-side sampling implementation. Only supported when the App
	 * server runs inside an agent host that has opted into sampling.
	 */
	public sampling(params: MCP.CreateMessageRequest['params'], token: CancellationToken): Promise<MCP.CreateMessageResult> {
		return this._transport.sampling(params, token);
	}
}
