/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
var __param = (this && this.__param) || function (paramIndex, decorator) {
    return function (target, key) { decorator(target, key, paramIndex); }
};
import { Gesture } from '../../../../base/browser/touch.js';
import { decodeBase64 } from '../../../../base/common/buffer.js';
import { CancellationToken } from '../../../../base/common/cancellation.js';
import { Disposable } from '../../../../base/common/lifecycle.js';
import { derived, observableFromEvent } from '../../../../base/common/observable.js';
import { isMobile, isWeb, locale } from '../../../../base/common/platform.js';
import { hasKey } from '../../../../base/common/types.js';
import { ColorScheme } from '../../../../platform/theme/common/theme.js';
import { IThemeService } from '../../../../platform/theme/common/themeService.js';
import { McpServer } from '../common/mcpServer.js';
import { IMcpService } from '../common/mcpTypes.js';
import { findMcpServer, startServerAndWaitForLiveTools, translateMcpLogMessage } from '../common/mcpTypesUtils.js';
/**
 * Wrapper class that "upgrades" serializable IMcpToolCallUIData into a functional
 * object that can load UI resources and proxy tool/resource calls back to the MCP server.
 */
let McpToolCallUI = class McpToolCallUI extends Disposable {
    constructor(_uiData, _mcpService, themeService) {
        super();
        this._uiData = _uiData;
        this._mcpService = _mcpService;
        const colorTheme = observableFromEvent(themeService.onDidColorThemeChange, () => {
            const type = themeService.getColorTheme().type;
            return type === ColorScheme.DARK || type === ColorScheme.HIGH_CONTRAST_DARK ? 'dark' : 'light';
        });
        this.hostContext = derived((reader) => {
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
    get uiData() {
        return this._uiData;
    }
    /**
     * Logs a message to the MCP server's logger.
     */
    async log(log) {
        const server = await this._getServer(CancellationToken.None);
        if (server) {
            translateMcpLogMessage(server.logger, log, `[App UI]`);
        }
    }
    /**
     * Gets or finds the MCP server for this UI.
     */
    async _getServer(token) {
        return findMcpServer(this._mcpService, s => s.definition.id === this._uiData.serverDefinitionId &&
            s.collection.id === this._uiData.collectionId, token);
    }
    /**
     * Loads the UI resource from the MCP server.
     * @param token Cancellation token
     * @returns The HTML content and CSP configuration
     */
    async loadResource(token) {
        const server = await this._getServer(token);
        if (!server) {
            throw new Error('MCP server not found for UI resource');
        }
        const resourceResult = await McpServer.callOn(server, h => h.readResource({ uri: this._uiData.resourceUri }, token), token);
        if (!resourceResult.contents || resourceResult.contents.length === 0) {
            throw new Error('UI resource not found on server');
        }
        const content = resourceResult.contents[0];
        let html;
        const mimeType = content.mimeType || 'text/html';
        if (hasKey(content, { text: true })) {
            html = content.text;
        }
        else if (hasKey(content, { blob: true })) {
            html = decodeBase64(content.blob).toString();
        }
        else {
            throw new Error('UI resource has no content');
        }
        const meta = content._meta?.ui;
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
    async callTool(name, params, token) {
        const server = await this._getServer(token);
        if (!server) {
            throw new Error('MCP server not found for tool call');
        }
        await startServerAndWaitForLiveTools(server, undefined, token);
        const tool = server.tools.get().find(t => t.definition.name === name);
        if (!tool || !(tool.visibility & 2 /* McpToolVisibility.App */)) {
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
    async readResource(uri, token) {
        const server = await this._getServer(token);
        if (!server) {
            throw new Error('MCP server not found');
        }
        return await McpServer.callOn(server, h => h.readResource({ uri }, token), token);
    }
};
McpToolCallUI = __decorate([
    __param(1, IMcpService),
    __param(2, IThemeService)
], McpToolCallUI);
export { McpToolCallUI };
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoibWNwVG9vbENhbGxVSS5qcyIsInNvdXJjZVJvb3QiOiJmaWxlOi8vL2hvbWUvYS93ZWJjb2RlLmhvc3QvdnNjb2RlL3NyYy8iLCJzb3VyY2VzIjpbInZzL3dvcmtiZW5jaC9jb250cmliL21jcC9icm93c2VyL21jcFRvb2xDYWxsVUkudHMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6IkFBQUE7OztnR0FHZ0c7Ozs7Ozs7Ozs7QUFFaEcsT0FBTyxFQUFFLE9BQU8sRUFBRSxNQUFNLG1DQUFtQyxDQUFDO0FBQzVELE9BQU8sRUFBRSxZQUFZLEVBQUUsTUFBTSxtQ0FBbUMsQ0FBQztBQUNqRSxPQUFPLEVBQUUsaUJBQWlCLEVBQUUsTUFBTSx5Q0FBeUMsQ0FBQztBQUM1RSxPQUFPLEVBQUUsVUFBVSxFQUFFLE1BQU0sc0NBQXNDLENBQUM7QUFDbEUsT0FBTyxFQUFFLE9BQU8sRUFBZSxtQkFBbUIsRUFBRSxNQUFNLHVDQUF1QyxDQUFDO0FBQ2xHLE9BQU8sRUFBRSxRQUFRLEVBQUUsS0FBSyxFQUFFLE1BQU0sRUFBRSxNQUFNLHFDQUFxQyxDQUFDO0FBQzlFLE9BQU8sRUFBRSxNQUFNLEVBQUUsTUFBTSxrQ0FBa0MsQ0FBQztBQUMxRCxPQUFPLEVBQUUsV0FBVyxFQUFFLE1BQU0sNENBQTRDLENBQUM7QUFDekUsT0FBTyxFQUFFLGFBQWEsRUFBRSxNQUFNLG1EQUFtRCxDQUFDO0FBQ2xGLE9BQU8sRUFBRSxTQUFTLEVBQUUsTUFBTSx3QkFBd0IsQ0FBQztBQUNuRCxPQUFPLEVBQWMsV0FBVyxFQUF5QyxNQUFNLHVCQUF1QixDQUFDO0FBQ3ZHLE9BQU8sRUFBRSxhQUFhLEVBQUUsOEJBQThCLEVBQUUsc0JBQXNCLEVBQUUsTUFBTSw0QkFBNEIsQ0FBQztBQWNuSDs7O0dBR0c7QUFDSSxJQUFNLGFBQWEsR0FBbkIsTUFBTSxhQUFjLFNBQVEsVUFBVTtJQU81QyxZQUNrQixPQUEyQixFQUNkLFdBQXdCLEVBQ3ZDLFlBQTJCO1FBRTFDLEtBQUssRUFBRSxDQUFDO1FBSlMs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