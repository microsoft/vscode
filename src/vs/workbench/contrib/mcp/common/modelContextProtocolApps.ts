/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { MCP } from './modelContextProtocol.js';

type CallToolResult = MCP.CallToolResult;
type ContentBlock = MCP.ContentBlock;
type Implementation = MCP.Implementation;
type RequestId = MCP.RequestId;
type Tool = MCP.Tool;

//#region utilities

export namespace McpApps {
	export type AppRequest =
		| MCP.CallToolRequest
		| MCP.ReadResourceRequest
		| MCP.PingRequest
		| (McpUiOpenLinkRequest & MCP.JSONRPCRequest)
		| (McpUiMessageRequest & MCP.JSONRPCRequest)
		| (McpUiRequestDisplayModeRequest & MCP.JSONRPCRequest)
		| (McpApps.McpUiInitializeRequest & MCP.JSONRPCRequest);

	export type AppNotification =
		| McpUiInitializedNotification
		| McpUiSizeChangedNotification
		| MCP.LoggingMessageNotification;

	export type AppMessage = AppRequest | AppNotification;

	export type HostResult =
		| MCP.CallToolResult
		| MCP.ReadResourceResult
		| MCP.EmptyResult
		| McpApps.McpUiInitializeResult
		| McpUiMessageResult
		| McpUiOpenLinkResult
		| McpUiRequestDisplayModeResult;

	export type HostNotification =
		| McpUiHostContextChangedNotification
		| McpUiResourceTeardownRequest
		| McpUiToolInputNotification
		| McpUiToolInputPartialNotification
		| McpUiToolResultNotification
		| McpUiToolCancelledNotification
		| McpUiSizeChangedNotification;

	export type HostMessage = HostResult | HostNotification;
}

/* eslint-disable local/code-no-unexternalized-strings */


/**
 * Schema updated from the Model Context Protocol Apps repository at
 * https://github.com/modelcontextprotocol/ext-apps/blob/main/src/spec.types.ts
 *
 * ⚠️ Do not edit within `namespace` manually except to update schema versions ⚠️
 */
export namespace McpApps {
	/*
	 * Current protocol version supported by this SDK.
	 *
	 * The SDK automatically handles version negotiation during initialization.
	 * Apps and hosts don't need to manage protocol versions manually.
	 */
	export const LATEST_PROTOCOL_VERSION = "2025-11-21";

	/**
	 * @description Color theme preference for the host environment.
	 */
	export type McpUiTheme = "light" | "dark";

	/**
	 * @description Display mode for UI presentation.
	 */
	export type McpUiDisplayMode = "inline" | "fullscreen" | "pip";

	/**
	 * @description CSS variable keys available to MCP apps for theming.
	 */
	export type McpUiStyleVariableKey =
		// Background colors
		| "--color-background-primary"
		| "--color-background-secondary"
		| "--color-background-tertiary"
		| "--color-background-inverse"
		| "--color-background-ghost"
		| "--color-background-info"
		| "--color-background-danger"
		| "--color-background-success"
		| "--color-background-warning"
		| "--color-background-disabled"
		// Text colors
		| "--color-text-primary"
		| "--color-text-secondary"
		| "--color-text-tertiary"
		| "--color-text-inverse"
		| "--color-text-ghost"
		| "--color-text-info"
		| "--color-text-danger"
		| "--color-text-success"
		| "--color-text-warning"
		| "--color-text-disabled"
		| "--color-text-ghost"
		// Border colors
		| "--color-border-primary"
		| "--color-border-secondary"
		| "--color-border-tertiary"
		| "--color-border-inverse"
		| "--color-border-ghost"
		| "--color-border-info"
		| "--color-border-danger"
		| "--color-border-success"
		| "--color-border-warning"
		| "--color-border-disabled"
		// Ring colors
		| "--color-ring-primary"
		| "--color-ring-secondary"
		| "--color-ring-inverse"
		| "--color-ring-info"
		| "--color-ring-danger"
		| "--color-ring-success"
		| "--color-ring-warning"
		// Typography - Family
		| "--font-sans"
		| "--font-mono"
		// Typography - Weight
		| "--font-weight-normal"
		| "--font-weight-medium"
		| "--font-weight-semibold"
		| "--font-weight-bold"
		// Typography - Text Size
		| "--font-text-xs-size"
		| "--font-text-sm-size"
		| "--font-text-md-size"
		| "--font-text-lg-size"
		// Typography - Heading Size
		| "--font-heading-xs-size"
		| "--font-heading-sm-size"
		| "--font-heading-md-size"
		| "--font-heading-lg-size"
		| "--font-heading-xl-size"
		| "--font-heading-2xl-size"
		| "--font-heading-3xl-size"
		// Typography - Text Line Height
		| "--font-text-xs-line-height"
		| "--font-text-sm-line-height"
		| "--font-text-md-line-height"
		| "--font-text-lg-line-height"
		// Typography - Heading Line Height
		| "--font-heading-xs-line-height"
		| "--font-heading-sm-line-height"
		| "--font-heading-md-line-height"
		| "--font-heading-lg-line-height"
		| "--font-heading-xl-line-height"
		| "--font-heading-2xl-line-height"
		| "--font-heading-3xl-line-height"
		// Border radius
		| "--border-radius-xs"
		| "--border-radius-sm"
		| "--border-radius-md"
		| "--border-radius-lg"
		| "--border-radius-xl"
		| "--border-radius-full"
		// Border width
		| "--border-width-regular"
		// Shadows
		| "--shadow-hairline"
		| "--shadow-sm"
		| "--shadow-md"
		| "--shadow-lg";

	/**
	 * @description Style variables for theming MCP apps.
	 *
	 * Individual style keys are optional - hosts may provide any subset of these values.
	 * Values are strings containing CSS values (colors, sizes, font stacks, etc.).
	 *
	 * Note: This type uses `Record<K, string | undefined>` rather than `Partial<Record<K, string>>`
	 * for compatibility with Zod schema generation. Both are functionally equivalent for validation.
	 */
	export type McpUiStyles = Record<McpUiStyleVariableKey, string | undefined>;

	/**
	 * @description Request to open an external URL in the host's default browser.
	 * @see {@link app.App.sendOpenLink} for the method that sends this request
	 */
	export interface McpUiOpenLinkRequest {
		method: "ui/open-link";
		params: {
			/** @description URL to open in the host's browser */
			url: string;
		};
	}

	/**
	 * @description Result from opening a URL.
	 * @see {@link McpUiOpenLinkRequest}
	 */
	export interface McpUiOpenLinkResult {
		/** @description True if the host failed to open the URL (e.g., due to security policy). */
		isError?: boolean;
		/**
		 * Index signature required for MCP SDK `Protocol` class compatibility.
		 * Note: The schema intentionally omits this to enforce strict validation.
		 */
		[key: string]: unknown;
	}

	/**
	 * @description Request to send a message to the host's chat interface.
	 * @see {@link app.App.sendMessage} for the method that sends this request
	 */
	export interface McpUiMessageRequest {
		method: "ui/message";
		params: {
			/** @description Message role, currently only "user" is supported. */
			role: "user";
			/** @description Message content blocks (text, image, etc.). */
			content: ContentBlock[];
		};
	}

	/**
	 * @description Result from sending a message.
	 * @see {@link McpUiMessageRequest}
	 */
	export interface McpUiMessageResult {
		/** @description True if the host rejected or failed to deliver the message. */
		isError?: boolean;
		/**
		 * Index signature required for MCP SDK `Protocol` class compatibility.
		 * Note: The schema intentionally omits this to enforce strict validation.
		 */
		[key: string]: unknown;
	}

	/**
	 * @description Notification that the sandbox proxy iframe is ready to receive content.
	 * @internal
	 * @see https://github.com/modelcontextprotocol/ext-apps/blob/main/specification/draft/apps.mdx#sandbox-proxy
	 */
	export interface McpUiSandboxProxyReadyNotification {
		method: "ui/notifications/sandbox-proxy-ready";
		params: {};
	}

	/**
	 * @description Notification containing HTML resource for the sandbox proxy to load.
	 * @internal
	 * @see https://github.com/modelcontextprotocol/ext-apps/blob/main/specification/draft/apps.mdx#sandbox-proxy
	 */
	export interface McpUiSandboxResourceReadyNotification {
		method: "ui/notifications/sandbox-resource-ready";
		params: {
			/** @description HTML content to load into the inner iframe. */
			html: string;
			/** @description Optional override for the inner iframe's sandbox attribute. */
			sandbox?: string;
			/** @description CSP configuration from resource metadata. */
			csp?: {
				/** @description Origins for network requests (fetch/XHR/WebSocket). */
				connectDomains?: string[];
				/** @description Origins for static resources (scripts, images, styles, fonts). */
				resourceDomains?: string[];
			};
		};
	}

	/**
	 * @description Notification of UI size changes (bidirectional: Guest <-> Host).
	 * @see {@link app.App.sendSizeChanged} for the method to send this from Guest UI
	 */
	export interface McpUiSizeChangedNotification {
		method: "ui/notifications/size-changed";
		params: {
			/** @description New width in pixels. */
			width?: number;
			/** @description New height in pixels. */
			height?: number;
		};
	}

	/**
	 * @description Notification containing complete tool arguments (Host -> Guest UI).
	 */
	export interface McpUiToolInputNotification {
		method: "ui/notifications/tool-input";
		params: {
			/** @description Complete tool call arguments as key-value pairs. */
			arguments?: Record<string, unknown>;
		};
	}

	/**
	 * @description Notification containing partial/streaming tool arguments (Host -> Guest UI).
	 */
	export interface McpUiToolInputPartialNotification {
		method: "ui/notifications/tool-input-partial";
		params: {
			/** @description Partial tool call arguments (incomplete, may change). */
			arguments?: Record<string, unknown>;
		};
	}

	/**
	 * @description Notification containing tool execution result (Host -> Guest UI).
	 */
	export interface McpUiToolResultNotification {
		method: "ui/notifications/tool-result";
		/** @description Standard MCP tool execution result. */
		params: CallToolResult;
	}

	/**
	 * @description Notification that tool execution was cancelled (Host -> Guest UI).
	 * Host MUST send this if tool execution was cancelled for any reason (user action,
	 * sampling error, classifier intervention, etc.).
	 */
	export interface McpUiToolCancelledNotification {
		method: "ui/notifications/tool-cancelled";
		params: {
			/** @description Optional reason for the cancellation (e.g., "user action", "timeout"). */
			reason?: string;
		};
	}

	/**
	 * @description CSS blocks that can be injected by apps.
	 */
	export interface McpUiHostCss {
		/** @description CSS for font loading (@font-face rules or @import statements). Apps must apply using applyHostFonts(). */
		fonts?: string;
	}

	/**
	 * @description Style configuration for theming MCP apps.
	 */
	export interface McpUiHostStyles {
		/** @description CSS variables for theming the app. */
		variables?: McpUiStyles;
		/** @description CSS blocks that apps can inject. */
		css?: McpUiHostCss;
	}

	/**
	 * @description Rich context about the host environment provided to Guest UIs.
	 */
	export interface McpUiHostContext {
		/** @description Allow additional properties for forward compatibility. */
		[key: string]: unknown;
		/** @description Metadata of the tool call that instantiated this App. */
		toolInfo?: {
			/** @description JSON-RPC id of the tools/call request. */
			id: RequestId;
			/** @description Tool definition including name, inputSchema, etc. */
			tool: Tool;
		};
		/** @description Current color theme preference. */
		theme?: McpUiTheme;
		/** @description Style configuration for theming the app. */
		styles?: McpUiHostStyles;
		/** @description How the UI is currently displayed. */
		displayMode?: McpUiDisplayMode;
		/** @description Display modes the host supports. */
		availableDisplayModes?: string[];
		/**
		 * @description Container dimensions. Represents the dimensions of the iframe or other
		 * container holding the app. Specify either width or maxWidth, and either height or maxHeight.
		 */
		containerDimensions?: (
			| {
				/** @description Fixed container height in pixels. */
				height: number;
			}
			| {
				/** @description Maximum container height in pixels. */
				maxHeight?: number | undefined;
			}
		) &
		(
			| {
				/** @description Fixed container width in pixels. */
				width: number;
			}
			| {
				/** @description Maximum container width in pixels. */
				maxWidth?: number | undefined;
			}
		);
		/** @description User's language and region preference in BCP 47 format. */
		locale?: string;
		/** @description User's timezone in IANA format. */
		timeZone?: string;
		/** @description Host application identifier. */
		userAgent?: string;
		/** @description Platform type for responsive design decisions. */
		platform?: "web" | "desktop" | "mobile";
		/** @description Device input capabilities. */
		deviceCapabilities?: {
			/** @description Whether the device supports touch input. */
			touch?: boolean;
			/** @description Whether the device supports hover interactions. */
			hover?: boolean;
		};
		/** @description Mobile safe area boundaries in pixels. */
		safeAreaInsets?: {
			/** @description Top safe area inset in pixels. */
			top: number;
			/** @description Right safe area inset in pixels. */
			right: number;
			/** @description Bottom safe area inset in pixels. */
			bottom: number;
			/** @description Left safe area inset in pixels. */
			left: number;
		};
	}

	/**
	 * @description Notification that host context has changed (Host -> Guest UI).
	 * @see {@link McpUiHostContext} for the full context structure
	 */
	export interface McpUiHostContextChangedNotification {
		method: "ui/notifications/host-context-changed";
		/** @description Partial context update containing only changed fields. */
		params: McpUiHostContext;
	}

	/**
	 * @description Request for graceful shutdown of the Guest UI (Host -> Guest UI).
	 * @see {@link app-bridge.AppBridge.teardownResource} for the host method that sends this
	 */
	export interface McpUiResourceTeardownRequest {
		method: "ui/resource-teardown";
		params: {};
	}

	/**
	 * @description Result from graceful shutdown request.
	 * @see {@link McpUiResourceTeardownRequest}
	 */
	export interface McpUiResourceTeardownResult {
		/**
		 * Index signature required for MCP SDK `Protocol` class compatibility.
		 */
		[key: string]: unknown;
	}

	/**
	 * @description Capabilities supported by the host application.
	 * @see {@link McpUiInitializeResult} for the initialization result that includes these capabilities
	 */
	export interface McpUiHostCapabilities {
		/** @description Experimental features (structure TBD). */
		experimental?: {};
		/** @description Host supports opening external URLs. */
		openLinks?: {};
		/** @description Host can proxy tool calls to the MCP server. */
		serverTools?: {
			/** @description Host supports tools/list_changed notifications. */
			listChanged?: boolean;
		};
		/** @description Host can proxy resource reads to the MCP server. */
		serverResources?: {
			/** @description Host supports resources/list_changed notifications. */
			listChanged?: boolean;
		};
		/** @description Host accepts log messages. */
		logging?: {};
	}

	/**
	 * @description Capabilities provided by the Guest UI (App).
	 * @see {@link McpUiInitializeRequest} for the initialization request that includes these capabilities
	 */
	export interface McpUiAppCapabilities {
		/** @description Experimental features (structure TBD). */
		experimental?: {};
		/** @description App exposes MCP-style tools that the host can call. */
		tools?: {
			/** @description App supports tools/list_changed notifications. */
			listChanged?: boolean;
		};
	}

	/**
	 * @description Initialization request sent from Guest UI to Host.
	 * @see {@link app.App.connect} for the method that sends this request
	 */
	export interface McpUiInitializeRequest {
		method: "ui/initialize";
		params: {
			/** @description App identification (name and version). */
			appInfo: Implementation;
			/** @description Features and capabilities this app provides. */
			appCapabilities: McpUiAppCapabilities;
			/** @description Protocol version this app supports. */
			protocolVersion: string;
		};
	}

	/**
	 * @description Initialization result returned from Host to Guest UI.
	 * @see {@link McpUiInitializeRequest}
	 */
	export interface McpUiInitializeResult {
		/** @description Negotiated protocol version string (e.g., "2025-11-21"). */
		protocolVersion: string;
		/** @description Host application identification and version. */
		hostInfo: Implementation;
		/** @description Features and capabilities provided by the host. */
		hostCapabilities: McpUiHostCapabilities;
		/** @description Rich context about the host environment. */
		hostContext: McpUiHostContext;
		/**
		 * Index signature required for MCP SDK `Protocol` class compatibility.
		 * Note: The schema intentionally omits this to enforce strict validation.
		 */
		[key: string]: unknown;
	}

	/**
	 * @description Notification that Guest UI has completed initialization (Guest UI -> Host).
	 * @see {@link app.App.connect} for the method that sends this notification
	 */
	export interface McpUiInitializedNotification {
		method: "ui/notifications/initialized";
		params?: {};
	}

	/**
	 * @description Content Security Policy configuration for UI resources.
	 */
	export interface McpUiResourceCsp {
		/** @description Origins for network requests (fetch/XHR/WebSocket). */
		connectDomains?: string[];
		/** @description Origins for static resources (scripts, images, styles, fonts). */
		resourceDomains?: string[];
	}

	/**
	 * @description UI Resource metadata for security and rendering configuration.
	 */
	export interface McpUiResourceMeta {
		/** @description Content Security Policy configuration. */
		csp?: McpUiResourceCsp;
		/** @description Dedicated origin for widget sandbox. */
		domain?: string;
		/** @description Visual boundary preference - true if UI prefers a visible border. */
		prefersBorder?: boolean;
	}

	/**
	 * @description Request to change the display mode of the UI.
	 * The host will respond with the actual display mode that was set,
	 * which may differ from the requested mode if not supported.
	 * @see {@link app.App.requestDisplayMode} for the method that sends this request
	 */
	export interface McpUiRequestDisplayModeRequest {
		method: "ui/request-display-mode";
		params: {
			/** @description The display mode being requested. */
			mode: McpUiDisplayMode;
		};
	}

	/**
	 * @description Result from requesting a display mode change.
	 * @see {@link McpUiRequestDisplayModeRequest}
	 */
	export interface McpUiRequestDisplayModeResult {
		/** @description The display mode that was actually set. May differ from requested if not supported. */
		mode: McpUiDisplayMode;
		/**
		 * Index signature required for MCP SDK `Protocol` class compatibility.
		 * Note: The schema intentionally omits this to enforce strict validation.
		 */
		[key: string]: unknown;
	}

	/**
	 * @description Tool visibility scope - who can access the tool.
	 */
	export type McpUiToolVisibility = "model" | "app";

	/**
	 * @description UI-related metadata for tools.
	 */
	export interface McpUiToolMeta {
		/**
		 * URI of the UI resource to display for this tool.
		 * This is converted to `_meta["ui/resourceUri"]`.
		 *
		 * @example "ui://weather/widget.html"
		 */
		resourceUri: string;
		/**
		 * @description Who can access this tool. Default: ["model", "app"]
		 * - "model": Tool visible to and callable by the agent
		 * - "app": Tool callable by the app from this server only
		 */
		visibility?: McpUiToolVisibility[];
	}
}
