/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Gesture } from '../../../../base/browser/touch.js';
import { decodeBase64 } from '../../../../base/common/buffer.js';
import { CancellationToken } from '../../../../base/common/cancellation.js';
import { Disposable } from '../../../../base/common/lifecycle.js';
import { derived, IObservable, observableFromEvent } from '../../../../base/common/observable.js';
import { isMobile, isWeb, locale } from '../../../../base/common/platform.js';
import { hasKey } from '../../../../base/common/types.js';
import { ColorScheme } from '../../../../platform/theme/common/theme.js';
import { IThemeService } from '../../../../platform/theme/common/themeService.js';
import { McpServer } from '../common/mcpServer.js';
import { IMcpServer, IMcpService, IMcpToolCallUIData, McpToolVisibility } from '../common/mcpTypes.js';
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
 * Wrapper class that "upgrades" serializable IMcpToolCallUIData into a functional
 * object that can load UI resources and proxy tool/resource calls back to the MCP server.
 */
export class McpToolCallUI extends Disposable {
	/**
	 * Basic host context reflecting the current UI and theme. Notably lacks
	 * the `toolInfo` or `viewport` sizes.
	 */
	public readonly hostContext: IObservable<McpApps.McpUiHostContext>;

	constructor(
		private readonly _uiData: IMcpToolCallUIData,
		@IMcpService private readonly _mcpService: IMcpService,
		@IThemeService themeService: IThemeService,
	) {
		super();

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
	public async log(log: MCP.LoggingMessageNotificationParams) {
		const server = await this._getServer(CancellationToken.None);
		if (server) {
			translateMcpLogMessage((server as McpServer).logger, log, `[App UI]`);
		}
	}

	/**
	 * Gets or finds the MCP server for this UI.
	 */
	private async _getServer(token: CancellationToken): Promise<IMcpServer | undefined> {
		return findMcpServer(this._mcpService, s =>
			s.definition.id === this._uiData.serverDefinitionId &&
			s.collection.id === this._uiData.collectionId,
			token
		);
	}

	/**
	 * Loads the UI resource from the MCP server.
	 * @param token Cancellation token
	 * @returns The HTML content and CSP configuration
	 */
	public async loadResource(token: CancellationToken): Promise<IMcpAppResourceContent> {
		const server = await this._getServer(token);
		if (!server) {
			throw new Error('MCP server not found for UI resource');
		}

		const resourceResult = await McpServer.callOn(server, h => h.readResource({ uri: this._uiData.resourceUri }, token), token);
		if (!resourceResult.contents || resourceResult.contents.length === 0) {
			throw new Error('UI resource not found on server');
		}

		const content = resourceResult.contents[0];
		let html: string;
		const mimeType = content.mimeType || 'text/html';

		if (hasKey(content, { text: true })) {
			html = content.text;
		} else if (hasKey(content, { blob: true })) {
			html = decodeBase64(content.blob).toString();
		} else {
			throw new Error('UI resource has no content');
		}

		const meta = resourceResult._meta?.ui as McpApps.McpUiResourceMeta | undefined;

		return {
			...meta,
			html,
			mimeType,
		};
	}

	/**
	 * Calls a tool on the MCP server.
	 * @param name Tool name
	 * @param params Tool parameters
	 * @param token Cancellation token
	 * @returns The tool call result
	 */
	public async callTool(name: string, params: Record<string, unknown>, token: CancellationToken): Promise<MCP.CallToolResult> {
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

	/**
	 * Reads a resource from the MCP server.
	 * @param uri Resource URI
	 * @param token Cancellation token
	 * @returns The resource content
	 */
	public async readResource(uri: string, token: CancellationToken): Promise<MCP.ReadResourceResult> {
		const server = await this._getServer(token);
		if (!server) {
			throw new Error('MCP server not found');
		}

		return await McpServer.callOn(server, h => h.readResource({ uri }, token), token);
	}
}
