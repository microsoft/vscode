/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/* eslint-disable local/code-no-unexternalized-strings */

//#region proposals
/**
 * MCP protocol proposals.
 * - Proposals here MUST have an MCP PR linked to them
 * - Proposals here are subject to change and SHALL be removed when
 *   the upstream MCP PR is merged or closed.
 */
export namespace MCP {

	// Nothing, yet

}

//#endregion

/**
 * Schema updated from the Model Context Protocol repository at
 * https://github.com/modelcontextprotocol/specification/tree/main/schema
 *
 * ⚠️ Do not edit within `namespace` manually except to update schema versions ⚠️
 */
export namespace MCP {
	/* JSON-RPC types */

	/**
	 * Refers to any valid JSON-RPC object that can be decoded off the wire, or encoded to be sent.
	 *
	 * @category JSON-RPC
	 */
	export type JSONRPCMessage =
		| JSONRPCRequest
		| JSONRPCNotification
		| JSONRPCResponse;

	/** @internal */
	export const LATEST_PROTOCOL_VERSION = "2025-11-25";
	/** @internal */
	export const JSONRPC_VERSION = "2.0";

	/**
	 * Represents the contents of a `_meta` field, which clients and servers use to attach additional metadata to their interactions.
	 *
	 * Certain key names are reserved by MCP for protocol-level metadata; implementations MUST NOT make assumptions about values at these keys. Additionally, specific schema definitions may reserve particular names for purpose-specific metadata, as declared in those definitions.
	 *
	 * Valid keys have two segments:
	 *
	 * **Prefix:**
	 * - Optional - if specified, MUST be a series of _labels_ separated by dots (`.`), followed by a slash (`/`).
	 * - Labels MUST start with a letter and end with a letter or digit. Interior characters may be letters, digits, or hyphens (`-`).
	 * - Any prefix consisting of zero or more labels, followed by `modelcontextprotocol` or `mcp`, followed by any label, is **reserved** for MCP use. For example: `modelcontextprotocol.io/`, `mcp.dev/`, `api.modelcontextprotocol.org/`, and `tools.mcp.com/` are all reserved.
	 *
	 * **Name:**
	 * - Unless empty, MUST start and end with an alphanumeric character (`[a-z0-9A-Z]`).
	 * - Interior characters may be alphanumeric, hyphens (`-`), underscores (`_`), or dots (`.`).
	 *
	 * @see [General fields: `_meta`](/specification/draft/basic/index#meta) for more details.
	 * @category Common Types
	 */
	export type MetaObject = Record<string, unknown>;

	/**
	 * Extends {@link MetaObject} with additional request-specific fields. All key naming rules from `MetaObject` apply.
	 *
	 * @see {@link MetaObject} for key naming rules and reserved prefixes.
	 * @see [General fields: `_meta`](/specification/draft/basic/index#meta) for more details.
	 * @category Common Types
	 */
	export interface RequestMetaObject extends MetaObject {
		/**
		 * If specified, the caller is requesting out-of-band progress notifications for this request (as represented by {@link ProgressNotification | notifications/progress}). The value of this parameter is an opaque token that will be attached to any subsequent notifications. The receiver is not obligated to provide these notifications.
		 */
		progressToken?: ProgressToken;
	}

	/**
	 * A progress token, used to associate progress notifications with the original request.
	 *
	 * @category Common Types
	 */
	export type ProgressToken = string | number;

	/**
	 * An opaque token used to represent a cursor for pagination.
	 *
	 * @category Common Types
	 */
	export type Cursor = string;

	/**
	 * Common params for any task-augmented request.
	 *
	 * @internal
	 */
	export interface TaskAugmentedRequestParams extends RequestParams {
		/**
		 * If specified, the caller is requesting task-augmented execution for this request.
		 * The request will return a {@link CreateTaskResult} immediately, and the actual result can be
		 * retrieved later via {@link GetTaskPayloadRequest | tasks/result}.
		 *
		 * Task augmentation is subject to capability negotiation - receivers MUST declare support
		 * for task augmentation of specific request types in their capabilities.
		 */
		task?: TaskMetadata;
	}

	/**
	 * Common params for any request.
	 *
	 * @category Common Types
	 */
	export interface RequestParams {
		_meta?: RequestMetaObject;
	}

	/** @internal */
	export interface Request {
		method: string;
		// Allow unofficial extensions of `Request.params` without impacting `RequestParams`.
		// eslint-disable-next-line @typescript-eslint/no-explicit-any
		params?: { [key: string]: any };
	}

	/**
	 * Common params for any notification.
	 *
	 * @category Common Types
	 */
	export interface NotificationParams {
		_meta?: MetaObject;
	}

	/** @internal */
	export interface Notification {
		method: string;
		// Allow unofficial extensions of `Notification.params` without impacting `NotificationParams`.
		// eslint-disable-next-line @typescript-eslint/no-explicit-any
		params?: { [key: string]: any };
	}

	/**
	 * Common result fields.
	 *
	 * @category Common Types
	 */
	export interface Result {
		_meta?: MetaObject;
		[key: string]: unknown;
	}

	/**
	 * @category Errors
	 */
	export interface Error {
		/**
		 * The error type that occurred.
		 */
		code: number;
		/**
		 * A short description of the error. The message SHOULD be limited to a concise single sentence.
		 */
		message: string;
		/**
		 * Additional information about the error. The value of this member is defined by the sender (e.g. detailed error information, nested errors etc.).
		 */
		data?: unknown;
	}

	/**
	 * A uniquely identifying ID for a request in JSON-RPC.
	 *
	 * @category Common Types
	 */
	export type RequestId = string | number;

	/**
	 * A request that expects a response.
	 *
	 * @category JSON-RPC
	 */
	export interface JSONRPCRequest extends Request {
		jsonrpc: typeof JSONRPC_VERSION;
		id: RequestId;
	}

	/**
	 * A notification which does not expect a response.
	 *
	 * @category JSON-RPC
	 */
	export interface JSONRPCNotification extends Notification {
		jsonrpc: typeof JSONRPC_VERSION;
	}

	/**
	 * A successful (non-error) response to a request.
	 *
	 * @category JSON-RPC
	 */
	export interface JSONRPCResultResponse {
		jsonrpc: typeof JSONRPC_VERSION;
		id: RequestId;
		result: Result;
	}

	/**
	 * A response to a request that indicates an error occurred.
	 *
	 * @category JSON-RPC
	 */
	export interface JSONRPCErrorResponse {
		jsonrpc: typeof JSONRPC_VERSION;
		id?: RequestId;
		error: Error;
	}

	/**
	 * A response to a request, containing either the result or error.
	 *
	 * @category JSON-RPC
	 */
	export type JSONRPCResponse = JSONRPCResultResponse | JSONRPCErrorResponse;

	// Standard JSON-RPC error codes
	export const PARSE_ERROR = -32700;
	export const INVALID_REQUEST = -32600;
	export const METHOD_NOT_FOUND = -32601;
	export const INVALID_PARAMS = -32602;
	export const INTERNAL_ERROR = -32603;

	/**
	 * A JSON-RPC error indicating that invalid JSON was received by the server. This error is returned when the server cannot parse the JSON text of a message.
	 *
	 * @see {@link https://www.jsonrpc.org/specification#error_object | JSON-RPC 2.0 Error Object}
	 *
	 * @example Invalid JSON
	 * {@includeCode ./examples/ParseError/invalid-json.json}
	 *
	 * @category Errors
	 */
	export interface ParseError extends Error {
		code: typeof PARSE_ERROR;
	}

	/**
	 * A JSON-RPC error indicating that the request is not a valid request object. This error is returned when the message structure does not conform to the JSON-RPC 2.0 specification requirements for a request (e.g., missing required fields like `jsonrpc` or `method`, or using invalid types for these fields).
	 *
	 * @see {@link https://www.jsonrpc.org/specification#error_object | JSON-RPC 2.0 Error Object}
	 *
	 * @category Errors
	 */
	export interface InvalidRequestError extends Error {
		code: typeof INVALID_REQUEST;
	}

	/**
	 * A JSON-RPC error indicating that the requested method does not exist or is not available.
	 *
	 * In MCP, this error is returned when a request is made for a method that requires a capability that has not been declared. This can occur in either direction:
	 *
	 * - A server returning this error when the client requests a capability it doesn't support (e.g., requesting completions when the `completions` capability was not advertised)
	 * - A client returning this error when the server requests a capability it doesn't support (e.g., requesting roots when the client did not declare the `roots` capability)
	 *
	 * @see {@link https://www.jsonrpc.org/specification#error_object | JSON-RPC 2.0 Error Object}
	 *
	 * @example Roots not supported
	 * {@includeCode ./examples/MethodNotFoundError/roots-not-supported.json}
	 *
	 * @category Errors
	 */
	export interface MethodNotFoundError extends Error {
		code: typeof METHOD_NOT_FOUND;
	}

	/**
	 * A JSON-RPC error indicating that the method parameters are invalid or malformed.
	 *
	 * In MCP, this error is returned in various contexts when request parameters fail validation:
	 *
	 * - **Tools**: Unknown tool name or invalid tool arguments
	 * - **Prompts**: Unknown prompt name or missing required arguments
	 * - **Pagination**: Invalid or expired cursor values
	 * - **Logging**: Invalid log level
	 * - **Tasks**: Invalid or nonexistent task ID, invalid cursor, or attempting to cancel a task already in a terminal status
	 * - **Elicitation**: Server requests an elicitation mode not declared in client capabilities
	 * - **Sampling**: Missing tool result or tool results mixed with other content
	 *
	 * @see {@link https://www.jsonrpc.org/specification#error_object | JSON-RPC 2.0 Error Object}
	 *
	 * @example Unknown tool
	 * {@includeCode ./examples/InvalidParamsError/unknown-tool.json}
	 *
	 * @example Invalid tool arguments
	 * {@includeCode ./examples/InvalidParamsError/invalid-tool-arguments.json}
	 *
	 * @example Unknown prompt
	 * {@includeCode ./examples/InvalidParamsError/unknown-prompt.json}
	 *
	 * @example Invalid cursor
	 * {@includeCode ./examples/InvalidParamsError/invalid-cursor.json}
	 *
	 * @category Errors
	 */
	export interface InvalidParamsError extends Error {
		code: typeof INVALID_PARAMS;
	}

	/**
	 * A JSON-RPC error indicating that an internal error occurred on the receiver. This error is returned when the receiver encounters an unexpected condition that prevents it from fulfilling the request.
	 *
	 * @see {@link https://www.jsonrpc.org/specification#error_object | JSON-RPC 2.0 Error Object}
	 *
	 * @example Unexpected error
	 * {@includeCode ./examples/InternalError/unexpected-error.json}
	 *
	 * @category Errors
	 */
	export interface InternalError extends Error {
		code: typeof INTERNAL_ERROR;
	}

	// Implementation-specific JSON-RPC error codes [-32000, -32099]
	/** @internal */
	export const URL_ELICITATION_REQUIRED = -32042;

	/**
	 * An error response that indicates that the server requires the client to provide additional information via an elicitation request.
	 *
	 * @example Authorization required
	 * {@includeCode ./examples/URLElicitationRequiredError/authorization-required.json}
	 *
	 * @internal
	 */
	export interface URLElicitationRequiredError extends Omit<
		JSONRPCErrorResponse,
		"error"
	> {
		error: Error & {
			code: typeof URL_ELICITATION_REQUIRED;
			data: {
				elicitations: ElicitRequestURLParams[];
				[key: string]: unknown;
			};
		};
	}

	/* Empty result */
	/**
	 * A result that indicates success but carries no data.
	 *
	 * @category Common Types
	 */
	export type EmptyResult = Result;

	/* Cancellation */
	/**
	 * Parameters for a `notifications/cancelled` notification.
	 *
	 * @example User-requested cancellation
	 * {@includeCode ./examples/CancelledNotificationParams/user-requested-cancellation.json}
	 *
	 * @category `notifications/cancelled`
	 */
	export interface CancelledNotificationParams extends NotificationParams {
		/**
		 * The ID of the request to cancel.
		 *
		 * This MUST correspond to the ID of a request previously issued in the same direction.
		 * This MUST be provided for cancelling non-task requests.
		 * This MUST NOT be used for cancelling tasks (use the {@link CancelTaskRequest | tasks/cancel} request instead).
		 */
		requestId?: RequestId;

		/**
		 * An optional string describing the reason for the cancellation. This MAY be logged or presented to the user.
		 */
		reason?: string;
	}

	/**
	 * This notification can be sent by either side to indicate that it is cancelling a previously-issued request.
	 *
	 * The request SHOULD still be in-flight, but due to communication latency, it is always possible that this notification MAY arrive after the request has already finished.
	 *
	 * This notification indicates that the result will be unused, so any associated processing SHOULD cease.
	 *
	 * A client MUST NOT attempt to cancel its `initialize` request.
	 *
	 * For task cancellation, use the {@link CancelTaskRequest | tasks/cancel} request instead of this notification.
	 *
	 * @example User-requested cancellation
	 * {@includeCode ./examples/CancelledNotification/user-requested-cancellation.json}
	 *
	 * @category `notifications/cancelled`
	 */
	export interface CancelledNotification extends JSONRPCNotification {
		method: "notifications/cancelled";
		params: CancelledNotificationParams;
	}

	/* Initialization */
	/**
	 * Parameters for an `initialize` request.
	 *
	 * @example Full client capabilities
	 * {@includeCode ./examples/InitializeRequestParams/full-client-capabilities.json}
	 *
	 * @category `initialize`
	 */
	export interface InitializeRequestParams extends RequestParams {
		/**
		 * The latest version of the Model Context Protocol that the client supports. The client MAY decide to support older versions as well.
		 */
		protocolVersion: string;
		capabilities: ClientCapabilities;
		clientInfo: Implementation;
	}

	/**
	 * This request is sent from the client to the server when it first connects, asking it to begin initialization.
	 *
	 * @example Initialize request
	 * {@includeCode ./examples/InitializeRequest/initialize-request.json}
	 *
	 * @category `initialize`
	 */
	export interface InitializeRequest extends JSONRPCRequest {
		method: "initialize";
		params: InitializeRequestParams;
	}

	/**
	 * The result returned by the server for an {@link InitializeRequest | initialize} request.
	 *
	 * @example Full server capabilities
	 * {@includeCode ./examples/InitializeResult/full-server-capabilities.json}
	 *
	 * @category `initialize`
	 */
	export interface InitializeResult extends Result {
		/**
		 * The version of the Model Context Protocol that the server wants to use. This may not match the version that the client requested. If the client cannot support this version, it MUST disconnect.
		 */
		protocolVersion: string;
		capabilities: ServerCapabilities;
		serverInfo: Implementation;

		/**
		 * Instructions describing how to use the server and its features.
		 *
		 * This can be used by clients to improve the LLM's understanding of available tools, resources, etc. It can be thought of like a "hint" to the model. For example, this information MAY be added to the system prompt.
		 */
		instructions?: string;
	}

	/**
	 * A successful response from the server for a {@link InitializeRequest | initialize} request.
	 *
	 * @example Initialize result response
	 * {@includeCode ./examples/InitializeResultResponse/initialize-result-response.json}
	 *
	 * @category `initialize`
	 */
	export interface InitializeResultResponse extends JSONRPCResultResponse {
		result: InitializeResult;
	}

	/**
	 * This notification is sent from the client to the server after initialization has finished.
	 *
	 * @example Initialized notification
	 * {@includeCode ./examples/InitializedNotification/initialized-notification.json}
	 *
	 * @category `notifications/initialized`
	 */
	export interface InitializedNotification extends JSONRPCNotification {
		method: "notifications/initialized";
		params?: NotificationParams;
	}

	/**
	 * Capabilities a client may support. Known capabilities are defined here, in this schema, but this is not a closed set: any client can define its own, additional capabilities.
	 *
	 * @category `initialize`
	 */
	export interface ClientCapabilities {
		/**
		 * Experimental, non-standard capabilities that the client supports.
		 */
		experimental?: { [key: string]: object };
		/**
		 * Present if the client supports listing roots.
		 *
		 * @example Roots - minimum baseline support
		 * {@includeCode ./examples/ClientCapabilities/roots-minimum-baseline-support.json}
		 *
		 * @example Roots - list changed notifications
		 * {@includeCode ./examples/ClientCapabilities/roots-list-changed-notifications.json}
		 */
		roots?: {
			/**
			 * Whether the client supports notifications for changes to the roots list.
			 */
			listChanged?: boolean;
		};
		/**
		 * Present if the client supports sampling from an LLM.
		 *
		 * @example Sampling - minimum baseline support
		 * {@includeCode ./examples/ClientCapabilities/sampling-minimum-baseline-support.json}
		 *
		 * @example Sampling - tool use support
		 * {@includeCode ./examples/ClientCapabilities/sampling-tool-use-support.json}
		 *
		 * @example Sampling - context inclusion support (soft-deprecated)
		 * {@includeCode ./examples/ClientCapabilities/sampling-context-inclusion-support-soft-deprecated.json}
		 */
		sampling?: {
			/**
			 * Whether the client supports context inclusion via `includeContext` parameter.
			 * If not declared, servers SHOULD only use `includeContext: "none"` (or omit it).
			 */
			context?: object;
			/**
			 * Whether the client supports tool use via `tools` and `toolChoice` parameters.
			 */
			tools?: object;
		};
		/**
		 * Present if the client supports elicitation from the server.
		 *
		 * @example Elicitation - form and URL mode support
		 * {@includeCode ./examples/ClientCapabilities/elicitation-form-and-url-mode-support.json}
		 *
		 * @example Elicitation - form mode only (implicit)
		 * {@includeCode ./examples/ClientCapabilities/elicitation-form-only-implicit.json}
		 */
		elicitation?: { form?: object; url?: object };

		/**
		 * Present if the client supports task-augmented requests.
		 */
		tasks?: {
			/**
			 * Whether this client supports {@link ListTasksRequest | tasks/list}.
			 */
			list?: object;
			/**
			 * Whether this client supports {@link CancelTaskRequest | tasks/cancel}.
			 */
			cancel?: object;
			/**
			 * Specifies which request types can be augmented with tasks.
			 */
			requests?: {
				/**
				 * Task support for sampling-related requests.
				 */
				sampling?: {
					/**
					 * Whether the client supports task-augmented `sampling/createMessage` requests.
					 */
					createMessage?: object;
				};
				/**
				 * Task support for elicitation-related requests.
				 */
				elicitation?: {
					/**
					 * Whether the client supports task-augmented {@link ElicitRequest | elicitation/create} requests.
					 */
					create?: object;
				};
			};
		};
		/**
		 * Optional MCP extensions that the client supports. Keys are extension identifiers
		 * (e.g., "io.modelcontextprotocol/oauth-client-credentials"), and values are
		 * per-extension settings objects. An empty object indicates support with no settings.
		 *
		 * @example Extensions - UI extension with MIME type support
		 * {@includeCode ./examples/ClientCapabilities/extensions-ui-mime-types.json}
		 */
		extensions?: { [key: string]: object };
	}

	/**
	 * Capabilities that a server may support. Known capabilities are defined here, in this schema, but this is not a closed set: any server can define its own, additional capabilities.
	 *
	 * @category `initialize`
	 */
	export interface ServerCapabilities {
		/**
		 * Experimental, non-standard capabilities that the server supports.
		 */
		experimental?: { [key: string]: object };
		/**
		 * Present if the server supports sending log messages to the client.
		 *
		 * @example Logging - minimum baseline support
		 * {@includeCode ./examples/ServerCapabilities/logging-minimum-baseline-support.json}
		 */
		logging?: object;
		/**
		 * Present if the server supports argument autocompletion suggestions.
		 *
		 * @example Completions - minimum baseline support
		 * {@includeCode ./examples/ServerCapabilities/completions-minimum-baseline-support.json}
		 */
		completions?: object;
		/**
		 * Present if the server offers any prompt templates.
		 *
		 * @example Prompts - minimum baseline support
		 * {@includeCode ./examples/ServerCapabilities/prompts-minimum-baseline-support.json}
		 *
		 * @example Prompts - list changed notifications
		 * {@includeCode ./examples/ServerCapabilities/prompts-list-changed-notifications.json}
		 */
		prompts?: {
			/**
			 * Whether this server supports notifications for changes to the prompt list.
			 */
			listChanged?: boolean;
		};
		/**
		 * Present if the server offers any resources to read.
		 *
		 * @example Resources - minimum baseline support
		 * {@includeCode ./examples/ServerCapabilities/resources-minimum-baseline-support.json}
		 *
		 * @example Resources - subscription to individual resource updates (only)
		 * {@includeCode ./examples/ServerCapabilities/resources-subscription-to-individual-resource-updates-only.json}
		 *
		 * @example Resources - list changed notifications (only)
		 * {@includeCode ./examples/ServerCapabilities/resources-list-changed-notifications-only.json}
		 *
		 * @example Resources - all notifications
		 * {@includeCode ./examples/ServerCapabilities/resources-all-notifications.json}
		 */
		resources?: {
			/**
			 * Whether this server supports subscribing to resource updates.
			 */
			subscribe?: boolean;
			/**
			 * Whether this server supports notifications for changes to the resource list.
			 */
			listChanged?: boolean;
		};
		/**
		 * Present if the server offers any tools to call.
		 *
		 * @example Tools - minimum baseline support
		 * {@includeCode ./examples/ServerCapabilities/tools-minimum-baseline-support.json}
		 *
		 * @example Tools - list changed notifications
		 * {@includeCode ./examples/ServerCapabilities/tools-list-changed-notifications.json}
		 */
		tools?: {
			/**
			 * Whether this server supports notifications for changes to the tool list.
			 */
			listChanged?: boolean;
		};
		/**
		 * Present if the server supports task-augmented requests.
		 */
		tasks?: {
			/**
			 * Whether this server supports {@link ListTasksRequest | tasks/list}.
			 */
			list?: object;
			/**
			 * Whether this server supports {@link CancelTaskRequest | tasks/cancel}.
			 */
			cancel?: object;
			/**
			 * Specifies which request types can be augmented with tasks.
			 */
			requests?: {
				/**
				 * Task support for tool-related requests.
				 */
				tools?: {
					/**
					 * Whether the server supports task-augmented {@link CallToolRequest | tools/call} requests.
					 */
					call?: object;
				};
			};
		};
		/**
		 * Optional MCP extensions that the server supports. Keys are extension identifiers
		 * (e.g., "io.modelcontextprotocol/apps"), and values are per-extension settings
		 * objects. An empty object indicates support with no settings.
		 *
		 * @example Extensions - UI extension support
		 * {@includeCode ./examples/ServerCapabilities/extensions-ui.json}
		 */
		extensions?: { [key: string]: object };
	}

	/**
	 * An optionally-sized icon that can be displayed in a user interface.
	 *
	 * @category Common Types
	 */
	export interface Icon {
		/**
		 * A standard URI pointing to an icon resource. May be an HTTP/HTTPS URL or a
		 * `data:` URI with Base64-encoded image data.
		 *
		 * Consumers SHOULD take steps to ensure URLs serving icons are from the
		 * same domain as the client/server or a trusted domain.
		 *
		 * Consumers SHOULD take appropriate precautions when consuming SVGs as they can contain
		 * executable JavaScript.
		 *
		 * @format uri
		 */
		src: string;

		/**
		 * Optional MIME type override if the source MIME type is missing or generic.
		 * For example: `"image/png"`, `"image/jpeg"`, or `"image/svg+xml"`.
		 */
		mimeType?: string;

		/**
		 * Optional array of strings that specify sizes at which the icon can be used.
		 * Each string should be in WxH format (e.g., `"48x48"`, `"96x96"`) or `"any"` for scalable formats like SVG.
		 *
		 * If not provided, the client should assume that the icon can be used at any size.
		 */
		sizes?: string[];

		/**
		 * Optional specifier for the theme this icon is designed for. `"light"` indicates
		 * the icon is designed to be used with a light background, and `"dark"` indicates
		 * the icon is designed to be used with a dark background.
		 *
		 * If not provided, the client should assume the icon can be used with any theme.
		 */
		theme?: "light" | "dark";
	}

	/**
	 * Base interface to add `icons` property.
	 *
	 * @internal
	 */
	export interface Icons {
		/**
		 * Optional set of sized icons that the client can display in a user interface.
		 *
		 * Clients that support rendering icons MUST support at least the following MIME types:
		 * - `image/png` - PNG images (safe, universal compatibility)
		 * - `image/jpeg` (and `image/jpg`) - JPEG images (safe, universal compatibility)
		 *
		 * Clients that support rendering icons SHOULD also support:
		 * - `image/svg+xml` - SVG images (scalable but requires security precautions)
		 * - `image/webp` - WebP images (modern, efficient format)
		 */
		icons?: Icon[];
	}

	/**
	 * Base interface for metadata with name (identifier) and title (display name) properties.
	 *
	 * @internal
	 */
	export interface BaseMetadata {
		/**
		 * Intended for programmatic or logical use, but used as a display name in past specs or fallback (if title isn't present).
		 */
		name: string;

		/**
		 * Intended for UI and end-user contexts - optimized to be human-readable and easily understood,
		 * even by those unfamiliar with domain-specific terminology.
		 *
		 * If not provided, the name should be used for display (except for {@link Tool},
		 * where `annotations.title` should be given precedence over using `name`,
		 * if present).
		 */
		title?: string;
	}

	/**
	 * Describes the MCP implementation.
	 *
	 * @category `initialize`
	 */
	export interface Implementation extends BaseMetadata, Icons {
		/**
		 * The version of this implementation.
		 */
		version: string;

		/**
		 * An optional human-readable description of what this implementation does.
		 *
		 * This can be used by clients or servers to provide context about their purpose
		 * and capabilities. For example, a server might describe the types of resources
		 * or tools it provides, while a client might describe its intended use case.
		 */
		description?: string;

		/**
		 * An optional URL of the website for this implementation.
		 *
		 * @format uri
		 */
		websiteUrl?: string;
	}

	/* Ping */
	/**
	 * A ping, issued by either the server or the client, to check that the other party is still alive. The receiver must promptly respond, or else may be disconnected.
	 *
	 * @example Ping request
	 * {@includeCode ./examples/PingRequest/ping-request.json}
	 *
	 * @category `ping`
	 */
	export interface PingRequest extends JSONRPCRequest {
		method: "ping";
		params?: RequestParams;
	}

	/**
	 * A successful response for a {@link PingRequest | ping} request.
	 *
	 * @example Ping result response
	 * {@includeCode ./examples/PingResultResponse/ping-result-response.json}
	 *
	 * @category `ping`
	 */
	export interface PingResultResponse extends JSONRPCResultResponse {
		result: EmptyResult;
	}

	/* Progress notifications */

	/**
	 * Parameters for a {@link ProgressNotification | notifications/progress} notification.
	 *
	 * @example Progress message
	 * {@includeCode ./examples/ProgressNotificationParams/progress-message.json}
	 *
	 * @category `notifications/progress`
	 */
	export interface ProgressNotificationParams extends NotificationParams {
		/**
		 * The progress token which was given in the initial request, used to associate this notification with the request that is proceeding.
		 */
		progressToken: ProgressToken;
		/**
		 * The progress thus far. This should increase every time progress is made, even if the total is unknown.
		 *
		 * @TJS-type number
		 */
		progress: number;
		/**
		 * Total number of items to process (or total progress required), if known.
		 *
		 * @TJS-type number
		 */
		total?: number;
		/**
		 * An optional message describing the current progress.
		 */
		message?: string;
	}

	/**
	 * An out-of-band notification used to inform the receiver of a progress update for a long-running request.
	 *
	 * @example Progress message
	 * {@includeCode ./examples/ProgressNotification/progress-message.json}
	 *
	 * @category `notifications/progress`
	 */
	export interface ProgressNotification extends JSONRPCNotification {
		method: "notifications/progress";
		params: ProgressNotificationParams;
	}

	/* Pagination */
	/**
	 * Common params for paginated requests.
	 *
	 * @example List request with cursor
	 * {@includeCode ./examples/PaginatedRequestParams/list-with-cursor.json}
	 *
	 * @category Common Types
	 */
	export interface PaginatedRequestParams extends RequestParams {
		/**
		 * An opaque token representing the current pagination position.
		 * If provided, the server should return results starting after this cursor.
		 */
		cursor?: Cursor;
	}

	/** @internal */
	export interface PaginatedRequest extends JSONRPCRequest {
		params?: PaginatedRequestParams;
	}

	/** @internal */
	export interface PaginatedResult extends Result {
		/**
		 * An opaque token representing the pagination position after the last returned result.
		 * If present, there may be more results available.
		 */
		nextCursor?: Cursor;
	}

	/* Resources */
	/**
	 * Sent from the client to request a list of resources the server has.
	 *
	 * @example List resources request
	 * {@includeCode ./examples/ListResourcesRequest/list-resources-request.json}
	 *
	 * @category `resources/list`
	 */
	export interface ListResourcesRequest extends PaginatedRequest {
		method: "resources/list";
	}

	/**
	 * The result returned by the server for a {@link ListResourcesRequest | resources/list} request.
	 *
	 * @example Resources list with cursor
	 * {@includeCode ./examples/ListResourcesResult/resources-list-with-cursor.json}
	 *
	 * @category `resources/list`
	 */
	export interface ListResourcesResult extends PaginatedResult {
		resources: Resource[];
	}

	/**
	 * A successful response from the server for a {@link ListResourcesRequest | resources/list} request.
	 *
	 * @example List resources result response
	 * {@includeCode ./examples/ListResourcesResultResponse/list-resources-result-response.json}
	 *
	 * @category `resources/list`
	 */
	export interface ListResourcesResultResponse extends JSONRPCResultResponse {
		result: ListResourcesResult;
	}

	/**
	 * Sent from the client to request a list of resource templates the server has.
	 *
	 * @example List resource templates request
	 * {@includeCode ./examples/ListResourceTemplatesRequest/list-resource-templates-request.json}
	 *
	 * @category `resources/templates/list`
	 */
	export interface ListResourceTemplatesRequest extends PaginatedRequest {
		method: "resources/templates/list";
	}

	/**
	 * The result returned by the server for a {@link ListResourceTemplatesRequest | resources/templates/list} request.
	 *
	 * @example Resource templates list
	 * {@includeCode ./examples/ListResourceTemplatesResult/resource-templates-list.json}
	 *
	 * @category `resources/templates/list`
	 */
	export interface ListResourceTemplatesResult extends PaginatedResult {
		resourceTemplates: ResourceTemplate[];
	}

	/**
	 * A successful response from the server for a {@link ListResourceTemplatesRequest | resources/templates/list} request.
	 *
	 * @example List resource templates result response
	 * {@includeCode ./examples/ListResourceTemplatesResultResponse/list-resource-templates-result-response.json}
	 *
	 * @category `resources/templates/list`
	 */
	export interface ListResourceTemplatesResultResponse extends JSONRPCResultResponse {
		result: ListResourceTemplatesResult;
	}

	/**
	 * Common params for resource-related requests.
	 *
	 * @internal
	 */
	export interface ResourceRequestParams extends RequestParams {
		/**
		 * The URI of the resource. The URI can use any protocol; it is up to the server how to interpret it.
		 *
		 * @format uri
		 */
		uri: string;
	}

	/**
	 * Parameters for a `resources/read` request.
	 *
	 * @category `resources/read`
	 */
	export interface ReadResourceRequestParams extends ResourceRequestParams { }

	/**
	 * Sent from the client to the server, to read a specific resource URI.
	 *
	 * @example Read resource request
	 * {@includeCode ./examples/ReadResourceRequest/read-resource-request.json}
	 *
	 * @category `resources/read`
	 */
	export interface ReadResourceRequest extends JSONRPCRequest {
		method: "resources/read";
		params: ReadResourceRequestParams;
	}

	/**
	 * The result returned by the server for a {@link ReadResourceRequest | resources/read} request.
	 *
	 * @example File resource contents
	 * {@includeCode ./examples/ReadResourceResult/file-resource-contents.json}
	 *
	 * @category `resources/read`
	 */
	export interface ReadResourceResult extends Result {
		contents: (TextResourceContents | BlobResourceContents)[];
	}

	/**
	 * A successful response from the server for a {@link ReadResourceRequest | resources/read} request.
	 *
	 * @example Read resource result response
	 * {@includeCode ./examples/ReadResourceResultResponse/read-resource-result-response.json}
	 *
	 * @category `resources/read`
	 */
	export interface ReadResourceResultResponse extends JSONRPCResultResponse {
		result: ReadResourceResult;
	}

	/**
	 * An optional notification from the server to the client, informing it that the list of resources it can read from has changed. This may be issued by servers without any previous subscription from the client.
	 *
	 * @example Resources list changed
	 * {@includeCode ./examples/ResourceListChangedNotification/resources-list-changed.json}
	 *
	 * @category `notifications/resources/list_changed`
	 */
	export interface ResourceListChangedNotification extends JSONRPCNotification {
		method: "notifications/resources/list_changed";
		params?: NotificationParams;
	}

	/**
	 * Parameters for a `resources/subscribe` request.
	 *
	 * @example Subscribe to file resource
	 * {@includeCode ./examples/SubscribeRequestParams/subscribe-to-file-resource.json}
	 *
	 * @category `resources/subscribe`
	 */
	export interface SubscribeRequestParams extends ResourceRequestParams { }

	/**
	 * Sent from the client to request {@link ResourceUpdatedNotification | resources/updated} notifications from the server whenever a particular resource changes.
	 *
	 * @example Subscribe request
	 * {@includeCode ./examples/SubscribeRequest/subscribe-request.json}
	 *
	 * @category `resources/subscribe`
	 */
	export interface SubscribeRequest extends JSONRPCRequest {
		method: "resources/subscribe";
		params: SubscribeRequestParams;
	}

	/**
	 * A successful response from the server for a {@link SubscribeRequest | resources/subscribe} request.
	 *
	 * @example Subscribe result response
	 * {@includeCode ./examples/SubscribeResultResponse/subscribe-result-response.json}
	 *
	 * @category `resources/subscribe`
	 */
	export interface SubscribeResultResponse extends JSONRPCResultResponse {
		result: EmptyResult;
	}

	/**
	 * Parameters for a `resources/unsubscribe` request.
	 *
	 * @category `resources/unsubscribe`
	 */
	export interface UnsubscribeRequestParams extends ResourceRequestParams { }

	/**
	 * Sent from the client to request cancellation of {@link ResourceUpdatedNotification | resources/updated} notifications from the server. This should follow a previous {@link SubscribeRequest | resources/subscribe} request.
	 *
	 * @example Unsubscribe request
	 * {@includeCode ./examples/UnsubscribeRequest/unsubscribe-request.json}
	 *
	 * @category `resources/unsubscribe`
	 */
	export interface UnsubscribeRequest extends JSONRPCRequest {
		method: "resources/unsubscribe";
		params: UnsubscribeRequestParams;
	}

	/**
	 * A successful response from the server for a {@link UnsubscribeRequest | resources/unsubscribe} request.
	 *
	 * @example Unsubscribe result response
	 * {@includeCode ./examples/UnsubscribeResultResponse/unsubscribe-result-response.json}
	 *
	 * @category `resources/unsubscribe`
	 */
	export interface UnsubscribeResultResponse extends JSONRPCResultResponse {
		result: EmptyResult;
	}

	/**
	 * Parameters for a `notifications/resources/updated` notification.
	 *
	 * @example File resource updated
	 * {@includeCode ./examples/ResourceUpdatedNotificationParams/file-resource-updated.json}
	 *
	 * @category `notifications/resources/updated`
	 */
	export interface ResourceUpdatedNotificationParams extends NotificationParams {
		/**
		 * The URI of the resource that has been updated. This might be a sub-resource of the one that the client actually subscribed to.
		 *
		 * @format uri
		 */
		uri: string;
	}

	/**
	 * A notification from the server to the client, informing it that a resource has changed and may need to be read again. This should only be sent if the client previously sent a {@link SubscribeRequest | resources/subscribe} request.
	 *
	 * @example File resource updated notification
	 * {@includeCode ./examples/ResourceUpdatedNotification/file-resource-updated-notification.json}
	 *
	 * @category `notifications/resources/updated`
	 */
	export interface ResourceUpdatedNotification extends JSONRPCNotification {
		method: "notifications/resources/updated";
		params: ResourceUpdatedNotificationParams;
	}

	/**
	 * A known resource that the server is capable of reading.
	 *
	 * @example File resource with annotations
	 * {@includeCode ./examples/Resource/file-resource-with-annotations.json}
	 *
	 * @category `resources/list`
	 */
	export interface Resource extends BaseMetadata, Icons {
		/**
		 * The URI of this resource.
		 *
		 * @format uri
		 */
		uri: string;

		/**
		 * A description of what this resource represents.
		 *
		 * This can be used by clients to improve the LLM's understanding of available resources. It can be thought of like a "hint" to the model.
		 */
		description?: string;

		/**
		 * The MIME type of this resource, if known.
		 */
		mimeType?: string;

		/**
		 * Optional annotations for the client.
		 */
		annotations?: Annotations;

		/**
		 * The size of the raw resource content, in bytes (i.e., before base64 encoding or any tokenization), if known.
		 *
		 * This can be used by Hosts to display file sizes and estimate context window usage.
		 */
		size?: number;

		_meta?: MetaObject;
	}

	/**
	 * A template description for resources available on the server.
	 *
	 * @category `resources/templates/list`
	 */
	export interface ResourceTemplate extends BaseMetadata, Icons {
		/**
		 * A URI template (according to RFC 6570) that can be used to construct resource URIs.
		 *
		 * @format uri-template
		 */
		uriTemplate: string;

		/**
		 * A description of what this template is for.
		 *
		 * This can be used by clients to improve the LLM's understanding of available resources. It can be thought of like a "hint" to the model.
		 */
		description?: string;

		/**
		 * The MIME type for all resources that match this template. This should only be included if all resources matching this template have the same type.
		 */
		mimeType?: string;

		/**
		 * Optional annotations for the client.
		 */
		annotations?: Annotations;

		_meta?: MetaObject;
	}

	/**
	 * The contents of a specific resource or sub-resource.
	 *
	 * @internal
	 */
	export interface ResourceContents {
		/**
		 * The URI of this resource.
		 *
		 * @format uri
		 */
		uri: string;
		/**
		 * The MIME type of this resource, if known.
		 */
		mimeType?: string;

		_meta?: MetaObject;
	}

	/**
	 * @example Text file contents
	 * {@includeCode ./examples/TextResourceContents/text-file-contents.json}
	 *
	 * @category Content
	 */
	export interface TextResourceContents extends ResourceContents {
		/**
		 * The text of the item. This must only be set if the item can actually be represented as text (not binary data).
		 */
		text: string;
	}

	/**
	 * @example Image file contents
	 * {@includeCode ./examples/BlobResourceContents/image-file-contents.json}
	 *
	 * @category Content
	 */
	export interface BlobResourceContents extends ResourceContents {
		/**
		 * A base64-encoded string representing the binary data of the item.
		 *
		 * @format byte
		 */
		blob: string;
	}

	/* Prompts */
	/**
	 * Sent from the client to request a list of prompts and prompt templates the server has.
	 *
	 * @example List prompts request
	 * {@includeCode ./examples/ListPromptsRequest/list-prompts-request.json}
	 *
	 * @category `prompts/list`
	 */
	export interface ListPromptsRequest extends PaginatedRequest {
		method: "prompts/list";
	}

	/**
	 * The result returned by the server for a {@link ListPromptsRequest | prompts/list} request.
	 *
	 * @example Prompts list with cursor
	 * {@includeCode ./examples/ListPromptsResult/prompts-list-with-cursor.json}
	 *
	 * @category `prompts/list`
	 */
	export interface ListPromptsResult extends PaginatedResult {
		prompts: Prompt[];
	}

	/**
	 * A successful response from the server for a {@link ListPromptsRequest | prompts/list} request.
	 *
	 * @example List prompts result response
	 * {@includeCode ./examples/ListPromptsResultResponse/list-prompts-result-response.json}
	 *
	 * @category `prompts/list`
	 */
	export interface ListPromptsResultResponse extends JSONRPCResultResponse {
		result: ListPromptsResult;
	}

	/**
	 * Parameters for a `prompts/get` request.
	 *
	 * @example Get code review prompt
	 * {@includeCode ./examples/GetPromptRequestParams/get-code-review-prompt.json}
	 *
	 * @category `prompts/get`
	 */
	export interface GetPromptRequestParams extends RequestParams {
		/**
		 * The name of the prompt or prompt template.
		 */
		name: string;
		/**
		 * Arguments to use for templating the prompt.
		 */
		arguments?: { [key: string]: string };
	}

	/**
	 * Used by the client to get a prompt provided by the server.
	 *
	 * @example Get prompt request
	 * {@includeCode ./examples/GetPromptRequest/get-prompt-request.json}
	 *
	 * @category `prompts/get`
	 */
	export interface GetPromptRequest extends JSONRPCRequest {
		method: "prompts/get";
		params: GetPromptRequestParams;
	}

	/**
	 * The result returned by the server for a {@link GetPromptRequest | prompts/get} request.
	 *
	 * @example Code review prompt
	 * {@includeCode ./examples/GetPromptResult/code-review-prompt.json}
	 *
	 * @category `prompts/get`
	 */
	export interface GetPromptResult extends Result {
		/**
		 * An optional description for the prompt.
		 */
		description?: string;
		messages: PromptMessage[];
	}

	/**
	 * A successful response from the server for a {@link GetPromptRequest | prompts/get} request.
	 *
	 * @example Get prompt result response
	 * {@includeCode ./examples/GetPromptResultResponse/get-prompt-result-response.json}
	 *
	 * @category `prompts/get`
	 */
	export interface GetPromptResultResponse extends JSONRPCResultResponse {
		result: GetPromptResult;
	}

	/**
	 * A prompt or prompt template that the server offers.
	 *
	 * @category `prompts/list`
	 */
	export interface Prompt extends BaseMetadata, Icons {
		/**
		 * An optional description of what this prompt provides
		 */
		description?: string;

		/**
		 * A list of arguments to use for templating the prompt.
		 */
		arguments?: PromptArgument[];

		_meta?: MetaObject;
	}

	/**
	 * Describes an argument that a prompt can accept.
	 *
	 * @category `prompts/list`
	 */
	export interface PromptArgument extends BaseMetadata {
		/**
		 * A human-readable description of the argument.
		 */
		description?: string;
		/**
		 * Whether this argument must be provided.
		 */
		required?: boolean;
	}

	/**
	 * The sender or recipient of messages and data in a conversation.
	 *
	 * @category Common Types
	 */
	export type Role = "user" | "assistant";

	/**
	 * Describes a message returned as part of a prompt.
	 *
	 * This is similar to {@link SamplingMessage}, but also supports the embedding of
	 * resources from the MCP server.
	 *
	 * @category `prompts/get`
	 */
	export interface PromptMessage {
		role: Role;
		content: ContentBlock;
	}

	/**
	 * A resource that the server is capable of reading, included in a prompt or tool call result.
	 *
	 * Note: resource links returned by tools are not guaranteed to appear in the results of {@link ListResourcesRequest | resources/list} requests.
	 *
	 * @example File resource link
	 * {@includeCode ./examples/ResourceLink/file-resource-link.json}
	 *
	 * @category Content
	 */
	export interface ResourceLink extends Resource {
		type: "resource_link";
	}

	/**
	 * The contents of a resource, embedded into a prompt or tool call result.
	 *
	 * It is up to the client how best to render embedded resources for the benefit
	 * of the LLM and/or the user.
	 *
	 * @example Embedded file resource with annotations
	 * {@includeCode ./examples/EmbeddedResource/embedded-file-resource-with-annotations.json}
	 *
	 * @category Content
	 */
	export interface EmbeddedResource {
		type: "resource";
		resource: TextResourceContents | BlobResourceContents;

		/**
		 * Optional annotations for the client.
		 */
		annotations?: Annotations;

		_meta?: MetaObject;
	}
	/**
	 * An optional notification from the server to the client, informing it that the list of prompts it offers has changed. This may be issued by servers without any previous subscription from the client.
	 *
	 * @example Prompts list changed
	 * {@includeCode ./examples/PromptListChangedNotification/prompts-list-changed.json}
	 *
	 * @category `notifications/prompts/list_changed`
	 */
	export interface PromptListChangedNotification extends JSONRPCNotification {
		method: "notifications/prompts/list_changed";
		params?: NotificationParams;
	}

	/* Tools */
	/**
	 * Sent from the client to request a list of tools the server has.
	 *
	 * @example List tools request
	 * {@includeCode ./examples/ListToolsRequest/list-tools-request.json}
	 *
	 * @category `tools/list`
	 */
	export interface ListToolsRequest extends PaginatedRequest {
		method: "tools/list";
	}

	/**
	 * The result returned by the server for a {@link ListToolsRequest | tools/list} request.
	 *
	 * @example Tools list with cursor
	 * {@includeCode ./examples/ListToolsResult/tools-list-with-cursor.json}
	 *
	 * @category `tools/list`
	 */
	export interface ListToolsResult extends PaginatedResult {
		tools: Tool[];
	}

	/**
	 * A successful response from the server for a {@link ListToolsRequest | tools/list} request.
	 *
	 * @example List tools result response
	 * {@includeCode ./examples/ListToolsResultResponse/list-tools-result-response.json}
	 *
	 * @category `tools/list`
	 */
	export interface ListToolsResultResponse extends JSONRPCResultResponse {
		result: ListToolsResult;
	}

	/**
	 * The result returned by the server for a {@link CallToolRequest | tools/call} request.
	 *
	 * @example Result with unstructured text
	 * {@includeCode ./examples/CallToolResult/result-with-unstructured-text.json}
	 *
	 * @example Result with structured content
	 * {@includeCode ./examples/CallToolResult/result-with-structured-content.json}
	 *
	 * @example Invalid tool input error
	 * {@includeCode ./examples/CallToolResult/invalid-tool-input-error.json}
	 *
	 * @category `tools/call`
	 */
	export interface CallToolResult extends Result {
		/**
		 * A list of content objects that represent the unstructured result of the tool call.
		 */
		content: ContentBlock[];

		/**
		 * An optional JSON object that represents the structured result of the tool call.
		 */
		structuredContent?: { [key: string]: unknown };

		/**
		 * Whether the tool call ended in an error.
		 *
		 * If not set, this is assumed to be false (the call was successful).
		 *
		 * Any errors that originate from the tool SHOULD be reported inside the result
		 * object, with `isError` set to true, _not_ as an MCP protocol-level error
		 * response. Otherwise, the LLM would not be able to see that an error occurred
		 * and self-correct.
		 *
		 * However, any errors in _finding_ the tool, an error indicating that the
		 * server does not support tool calls, or any other exceptional conditions,
		 * should be reported as an MCP error response.
		 */
		isError?: boolean;
	}

	/**
	 * A successful response from the server for a {@link CallToolRequest | tools/call} request.
	 *
	 * @example Call tool result response
	 * {@includeCode ./examples/CallToolResultResponse/call-tool-result-response.json}
	 *
	 * @category `tools/call`
	 */
	export interface CallToolResultResponse extends JSONRPCResultResponse {
		result: CallToolResult;
	}

	/**
	 * Parameters for a `tools/call` request.
	 *
	 * @example `get_weather` tool call params
	 * {@includeCode ./examples/CallToolRequestParams/get-weather-tool-call-params.json}
	 *
	 * @example Tool call params with progress token
	 * {@includeCode ./examples/CallToolRequestParams/tool-call-params-with-progress-token.json}
	 *
	 * @category `tools/call`
	 */
	export interface CallToolRequestParams extends TaskAugmentedRequestParams {
		/**
		 * The name of the tool.
		 */
		name: string;
		/**
		 * Arguments to use for the tool call.
		 */
		arguments?: { [key: string]: unknown };
	}

	/**
	 * Used by the client to invoke a tool provided by the server.
	 *
	 * @example Call tool request
	 * {@includeCode ./examples/CallToolRequest/call-tool-request.json}
	 *
	 * @category `tools/call`
	 */
	export interface CallToolRequest extends JSONRPCRequest {
		method: "tools/call";
		params: CallToolRequestParams;
	}

	/**
	 * An optional notification from the server to the client, informing it that the list of tools it offers has changed. This may be issued by servers without any previous subscription from the client.
	 *
	 * @example Tools list changed
	 * {@includeCode ./examples/ToolListChangedNotification/tools-list-changed.json}
	 *
	 * @category `notifications/tools/list_changed`
	 */
	export interface ToolListChangedNotification extends JSONRPCNotification {
		method: "notifications/tools/list_changed";
		params?: NotificationParams;
	}

	/**
	 * Additional properties describing a {@link Tool} to clients.
	 *
	 * NOTE: all properties in `ToolAnnotations` are **hints**.
	 * They are not guaranteed to provide a faithful description of
	 * tool behavior (including descriptive properties like `title`).
	 *
	 * Clients should never make tool use decisions based on `ToolAnnotations`
	 * received from untrusted servers.
	 *
	 * @category `tools/list`
	 */
	export interface ToolAnnotations {
		/**
		 * A human-readable title for the tool.
		 */
		title?: string;

		/**
		 * If true, the tool does not modify its environment.
		 *
		 * Default: false
		 */
		readOnlyHint?: boolean;

		/**
		 * If true, the tool may perform destructive updates to its environment.
		 * If false, the tool performs only additive updates.
		 *
		 * (This property is meaningful only when `readOnlyHint == false`)
		 *
		 * Default: true
		 */
		destructiveHint?: boolean;

		/**
		 * If true, calling the tool repeatedly with the same arguments
		 * will have no additional effect on its environment.
		 *
		 * (This property is meaningful only when `readOnlyHint == false`)
		 *
		 * Default: false
		 */
		idempotentHint?: boolean;

		/**
		 * If true, this tool may interact with an "open world" of external
		 * entities. If false, the tool's domain of interaction is closed.
		 * For example, the world of a web search tool is open, whereas that
		 * of a memory tool is not.
		 *
		 * Default: true
		 */
		openWorldHint?: boolean;
	}

	/**
	 * Execution-related properties for a tool.
	 *
	 * @category `tools/list`
	 */
	export interface ToolExecution {
		/**
		 * Indicates whether this tool supports task-augmented execution.
		 * This allows clients to handle long-running operations through polling
		 * the task system.
		 *
		 * - `"forbidden"`: Tool does not support task-augmented execution (default when absent)
		 * - `"optional"`: Tool may support task-augmented execution
		 * - `"required"`: Tool requires task-augmented execution
		 *
		 * Default: `"forbidden"`
		 */
		taskSupport?: "forbidden" | "optional" | "required";
	}

	/**
	 * Definition for a tool the client can call.
	 *
	 * @example With default 2020-12 input schema
	 * {@includeCode ./examples/Tool/with-default-2020-12-input-schema.json}
	 *
	 * @example With explicit draft-07 input schema
	 * {@includeCode ./examples/Tool/with-explicit-draft-07-input-schema.json}
	 *
	 * @example With no parameters
	 * {@includeCode ./examples/Tool/with-no-parameters.json}
	 *
	 * @example With output schema for structured content
	 * {@includeCode ./examples/Tool/with-output-schema-for-structured-content.json}
	 *
	 * @category `tools/list`
	 */
	export interface Tool extends BaseMetadata, Icons {
		/**
		 * A human-readable description of the tool.
		 *
		 * This can be used by clients to improve the LLM's understanding of available tools. It can be thought of like a "hint" to the model.
		 */
		description?: string;

		/**
		 * A JSON Schema object defining the expected parameters for the tool.
		 */
		inputSchema: {
			$schema?: string;
			type: "object";
			properties?: { [key: string]: object };
			required?: string[];
		};

		/**
		 * Execution-related properties for this tool.
		 */
		execution?: ToolExecution;

		/**
		 * An optional JSON Schema object defining the structure of the tool's output returned in
		 * the structuredContent field of a {@link CallToolResult}.
		 *
		 * Defaults to JSON Schema 2020-12 when no explicit `$schema` is provided.
		 * Currently restricted to `type: "object"` at the root level.
		 */
		outputSchema?: {
			$schema?: string;
			type: "object";
			properties?: { [key: string]: object };
			required?: string[];
		};

		/**
		 * Optional additional tool information.
		 *
		 * Display name precedence order is: `title`, `annotations.title`, then `name`.
		 */
		annotations?: ToolAnnotations;

		_meta?: MetaObject;
	}

	/* Tasks */

	/**
	 * The status of a task.
	 *
	 * @category `tasks`
	 */
	export type TaskStatus =
		| "working" // The request is currently being processed
		| "input_required" // The task is waiting for input (e.g., elicitation or sampling)
		| "completed" // The request completed successfully and results are available
		| "failed" // The associated request did not complete successfully. For tool calls specifically, this includes cases where the tool call result has `isError` set to true.
		| "cancelled"; // The request was cancelled before completion

	/**
	 * Metadata for augmenting a request with task execution.
	 * Include this in the `task` field of the request parameters.
	 *
	 * @category `tasks`
	 */
	export interface TaskMetadata {
		/**
		 * Requested duration in milliseconds to retain task from creation.
		 */
		ttl?: number;
	}

	/**
	 * Metadata for associating messages with a task.
	 * Include this in the `_meta` field under the key `io.modelcontextprotocol/related-task`.
	 *
	 * @category `tasks`
	 */
	export interface RelatedTaskMetadata {
		/**
		 * The task identifier this message is associated with.
		 */
		taskId: string;
	}

	/**
	 * Data associated with a task.
	 *
	 * @category `tasks`
	 */
	export interface Task {
		/**
		 * The task identifier.
		 */
		taskId: string;

		/**
		 * Current task state.
		 */
		status: TaskStatus;

		/**
		 * Optional human-readable message describing the current task state.
		 * This can provide context for any status, including:
		 * - Reasons for "cancelled" status
		 * - Summaries for "completed" status
		 * - Diagnostic information for "failed" status (e.g., error details, what went wrong)
		 */
		statusMessage?: string;

		/**
		 * ISO 8601 timestamp when the task was created.
		 */
		createdAt: string;

		/**
		 * ISO 8601 timestamp when the task was last updated.
		 */
		lastUpdatedAt: string;

		/**
		 * Actual retention duration from creation in milliseconds, null for unlimited.
		 */
		ttl: number | null;

		/**
		 * Suggested polling interval in milliseconds.
		 */
		pollInterval?: number;
	}

	/**
	 * The result returned for a task-augmented request.
	 *
	 * @category `tasks`
	 */
	export interface CreateTaskResult extends Result {
		task: Task;
	}

	/**
	 * A successful response for a task-augmented request.
	 *
	 * @category `tasks`
	 */
	export interface CreateTaskResultResponse extends JSONRPCResultResponse {
		result: CreateTaskResult;
	}

	/**
	 * A request to retrieve the state of a task.
	 *
	 * @category `tasks/get`
	 */
	export interface GetTaskRequest extends JSONRPCRequest {
		method: "tasks/get";
		params: {
			/**
			 * The task identifier to query.
			 */
			taskId: string;
		};
	}

	/**
	 * The result returned for a {@link GetTaskRequest | tasks/get} request.
	 *
	 * @category `tasks/get`
	 */
	export type GetTaskResult = Result & Task;

	/**
	 * A successful response for a {@link GetTaskRequest | tasks/get} request.
	 *
	 * @category `tasks/get`
	 */
	export interface GetTaskResultResponse extends JSONRPCResultResponse {
		result: GetTaskResult;
	}

	/**
	 * A request to retrieve the result of a completed task.
	 *
	 * @category `tasks/result`
	 */
	export interface GetTaskPayloadRequest extends JSONRPCRequest {
		method: "tasks/result";
		params: {
			/**
			 * The task identifier to retrieve results for.
			 */
			taskId: string;
		};
	}

	/**
	 * The result returned for a {@link GetTaskPayloadRequest | tasks/result} request.
	 * The structure matches the result type of the original request.
	 * For example, a {@link CallToolRequest | tools/call} task would return the {@link CallToolResult} structure.
	 *
	 * @category `tasks/result`
	 */
	export interface GetTaskPayloadResult extends Result {
		[key: string]: unknown;
	}

	/**
	 * A successful response for a {@link GetTaskPayloadRequest | tasks/result} request.
	 *
	 * @category `tasks/result`
	 */
	export interface GetTaskPayloadResultResponse extends JSONRPCResultResponse {
		result: GetTaskPayloadResult;
	}

	/**
	 * A request to cancel a task.
	 *
	 * @category `tasks/cancel`
	 */
	export interface CancelTaskRequest extends JSONRPCRequest {
		method: "tasks/cancel";
		params: {
			/**
			 * The task identifier to cancel.
			 */
			taskId: string;
		};
	}

	/**
	 * The result returned for a {@link CancelTaskRequest | tasks/cancel} request.
	 *
	 * @category `tasks/cancel`
	 */
	export type CancelTaskResult = Result & Task;

	/**
	 * A successful response for a {@link CancelTaskRequest | tasks/cancel} request.
	 *
	 * @category `tasks/cancel`
	 */
	export interface CancelTaskResultResponse extends JSONRPCResultResponse {
		result: CancelTaskResult;
	}

	/**
	 * A request to retrieve a list of tasks.
	 *
	 * @category `tasks/list`
	 */
	export interface ListTasksRequest extends PaginatedRequest {
		method: "tasks/list";
	}

	/**
	 * The result returned for a {@link ListTasksRequest | tasks/list} request.
	 *
	 * @category `tasks/list`
	 */
	export interface ListTasksResult extends PaginatedResult {
		tasks: Task[];
	}

	/**
	 * A successful response for a {@link ListTasksRequest | tasks/list} request.
	 *
	 * @category `tasks/list`
	 */
	export interface ListTasksResultResponse extends JSONRPCResultResponse {
		result: ListTasksResult;
	}

	/**
	 * Parameters for a `notifications/tasks/status` notification.
	 *
	 * @category `notifications/tasks/status`
	 */
	export type TaskStatusNotificationParams = NotificationParams & Task;

	/**
	 * An optional notification from the receiver to the requestor, informing them that a task's status has changed. Receivers are not required to send these notifications.
	 *
	 * @category `notifications/tasks/status`
	 */
	export interface TaskStatusNotification extends JSONRPCNotification {
		method: "notifications/tasks/status";
		params: TaskStatusNotificationParams;
	}

	/* Logging */

	/**
	 * Parameters for a `logging/setLevel` request.
	 *
	 * @example Set log level to "info"
	 * {@includeCode ./examples/SetLevelRequestParams/set-log-level-to-info.json}
	 *
	 * @category `logging/setLevel`
	 */
	export interface SetLevelRequestParams extends RequestParams {
		/**
		 * The level of logging that the client wants to receive from the server. The server should send all logs at this level and higher (i.e., more severe) to the client as {@link LoggingMessageNotification | notifications/message}.
		 */
		level: LoggingLevel;
	}

	/**
	 * A request from the client to the server, to enable or adjust logging.
	 *
	 * @example Set logging level request
	 * {@includeCode ./examples/SetLevelRequest/set-logging-level-request.json}
	 *
	 * @category `logging/setLevel`
	 */
	export interface SetLevelRequest extends JSONRPCRequest {
		method: "logging/setLevel";
		params: SetLevelRequestParams;
	}

	/**
	 * A successful response from the server for a {@link SetLevelRequest | logging/setLevel} request.
	 *
	 * @example Set logging level result response
	 * {@includeCode ./examples/SetLevelResultResponse/set-logging-level-result-response.json}
	 *
	 * @category `logging/setLevel`
	 */
	export interface SetLevelResultResponse extends JSONRPCResultResponse {
		result: EmptyResult;
	}

	/**
	 * Parameters for a `notifications/message` notification.
	 *
	 * @example Log database connection failed
	 * {@includeCode ./examples/LoggingMessageNotificationParams/log-database-connection-failed.json}
	 *
	 * @category `notifications/message`
	 */
	export interface LoggingMessageNotificationParams extends NotificationParams {
		/**
		 * The severity of this log message.
		 */
		level: LoggingLevel;
		/**
		 * An optional name of the logger issuing this message.
		 */
		logger?: string;
		/**
		 * The data to be logged, such as a string message or an object. Any JSON serializable type is allowed here.
		 */
		data: unknown;
	}

	/**
	 * JSONRPCNotification of a log message passed from server to client. If no `logging/setLevel` request has been sent from the client, the server MAY decide which messages to send automatically.
	 *
	 * @example Log database connection failed
	 * {@includeCode ./examples/LoggingMessageNotification/log-database-connection-failed.json}
	 *
	 * @category `notifications/message`
	 */
	export interface LoggingMessageNotification extends JSONRPCNotification {
		method: "notifications/message";
		params: LoggingMessageNotificationParams;
	}

	/**
	 * The severity of a log message.
	 *
	 * These map to syslog message severities, as specified in RFC-5424:
	 * https://datatracker.ietf.org/doc/html/rfc5424#section-6.2.1
	 *
	 * @category Common Types
	 */
	export type LoggingLevel =
		| "debug"
		| "info"
		| "notice"
		| "warning"
		| "error"
		| "critical"
		| "alert"
		| "emergency";

	/* Sampling */
	/**
	 * Parameters for a `sampling/createMessage` request.
	 *
	 * @example Basic request
	 * {@includeCode ./examples/CreateMessageRequestParams/basic-request.json}
	 *
	 * @example Request with tools
	 * {@includeCode ./examples/CreateMessageRequestParams/request-with-tools.json}
	 *
	 * @example Follow-up request with tool results
	 * {@includeCode ./examples/CreateMessageRequestParams/follow-up-with-tool-results.json}
	 *
	 * @category `sampling/createMessage`
	 */
	export interface CreateMessageRequestParams extends TaskAugmentedRequestParams {
		messages: SamplingMessage[];
		/**
		 * The server's preferences for which model to select. The client MAY ignore these preferences.
		 */
		modelPreferences?: ModelPreferences;
		/**
		 * An optional system prompt the server wants to use for sampling. The client MAY modify or omit this prompt.
		 */
		systemPrompt?: string;
		/**
		 * A request to include context from one or more MCP servers (including the caller), to be attached to the prompt.
		 * The client MAY ignore this request.
		 *
		 * Default is `"none"`. Values `"thisServer"` and `"allServers"` are soft-deprecated. Servers SHOULD only use these values if the client
		 * declares {@link ClientCapabilities.sampling.context}. These values may be removed in future spec releases.
		 */
		includeContext?: "none" | "thisServer" | "allServers";
		/**
		 * @TJS-type number
		 */
		temperature?: number;
		/**
		 * The requested maximum number of tokens to sample (to prevent runaway completions).
		 *
		 * The client MAY choose to sample fewer tokens than the requested maximum.
		 */
		maxTokens: number;
		stopSequences?: string[];
		/**
		 * Optional metadata to pass through to the LLM provider. The format of this metadata is provider-specific.
		 */
		metadata?: object;
		/**
		 * Tools that the model may use during generation.
		 * The client MUST return an error if this field is provided but {@link ClientCapabilities.sampling.tools} is not declared.
		 */
		tools?: Tool[];
		/**
		 * Controls how the model uses tools.
		 * The client MUST return an error if this field is provided but {@link ClientCapabilities.sampling.tools} is not declared.
		 * Default is `{ mode: "auto" }`.
		 */
		toolChoice?: ToolChoice;
	}

	/**
	 * Controls tool selection behavior for sampling requests.
	 *
	 * @category `sampling/createMessage`
	 */
	export interface ToolChoice {
		/**
		 * Controls the tool use ability of the model:
		 * - `"auto"`: Model decides whether to use tools (default)
		 * - `"required"`: Model MUST use at least one tool before completing
		 * - `"none"`: Model MUST NOT use any tools
		 */
		mode?: "auto" | "required" | "none";
	}

	/**
	 * A request from the server to sample an LLM via the client. The client has full discretion over which model to select. The client should also inform the user before beginning sampling, to allow them to inspect the request (human in the loop) and decide whether to approve it.
	 *
	 * @example Sampling request
	 * {@includeCode ./examples/CreateMessageRequest/sampling-request.json}
	 *
	 * @category `sampling/createMessage`
	 */
	export interface CreateMessageRequest extends JSONRPCRequest {
		method: "sampling/createMessage";
		params: CreateMessageRequestParams;
	}

	/**
	 * The result returned by the client for a {@link CreateMessageRequest | sampling/createMessage} request.
	 * The client should inform the user before returning the sampled message, to allow them
	 * to inspect the response (human in the loop) and decide whether to allow the server to see it.
	 *
	 * @example Text response
	 * {@includeCode ./examples/CreateMessageResult/text-response.json}
	 *
	 * @example Tool use response
	 * {@includeCode ./examples/CreateMessageResult/tool-use-response.json}
	 *
	 * @example Final response after tool use
	 * {@includeCode ./examples/CreateMessageResult/final-response.json}
	 *
	 * @category `sampling/createMessage`
	 */
	export interface CreateMessageResult extends Result, SamplingMessage {
		/**
		 * The name of the model that generated the message.
		 */
		model: string;

		/**
		 * The reason why sampling stopped, if known.
		 *
		 * Standard values:
		 * - `"endTurn"`: Natural end of the assistant's turn
		 * - `"stopSequence"`: A stop sequence was encountered
		 * - `"maxTokens"`: Maximum token limit was reached
		 * - `"toolUse"`: The model wants to use one or more tools
		 *
		 * This field is an open string to allow for provider-specific stop reasons.
		 */
		stopReason?: "endTurn" | "stopSequence" | "maxTokens" | "toolUse" | string;
	}

	/**
	 * A successful response from the client for a {@link CreateMessageRequest | sampling/createMessage} request.
	 *
	 * @example Sampling result response
	 * {@includeCode ./examples/CreateMessageResultResponse/sampling-result-response.json}
	 *
	 * @category `sampling/createMessage`
	 */
	export interface CreateMessageResultResponse extends JSONRPCResultResponse {
		result: CreateMessageResult;
	}

	/**
	 * Describes a message issued to or received from an LLM API.
	 *
	 * @example Single content block
	 * {@includeCode ./examples/SamplingMessage/single-content-block.json}
	 *
	 * @example Multiple content blocks
	 * {@includeCode ./examples/SamplingMessage/multiple-content-blocks.json}
	 *
	 * @category `sampling/createMessage`
	 */
	export interface SamplingMessage {
		role: Role;
		content: SamplingMessageContentBlock | SamplingMessageContentBlock[];
		_meta?: MetaObject;
	}

	/**
	 * @category `sampling/createMessage`
	 */
	export type SamplingMessageContentBlock =
		| TextContent
		| ImageContent
		| AudioContent
		| ToolUseContent
		| ToolResultContent;

	/**
	 * Optional annotations for the client. The client can use annotations to inform how objects are used or displayed
	 *
	 * @category Common Types
	 */
	export interface Annotations {
		/**
		 * Describes who the intended audience of this object or data is.
		 *
		 * It can include multiple entries to indicate content useful for multiple audiences (e.g., `["user", "assistant"]`).
		 */
		audience?: Role[];

		/**
		 * Describes how important this data is for operating the server.
		 *
		 * A value of 1 means "most important," and indicates that the data is
		 * effectively required, while 0 means "least important," and indicates that
		 * the data is entirely optional.
		 *
		 * @TJS-type number
		 * @minimum 0
		 * @maximum 1
		 */
		priority?: number;

		/**
		 * The moment the resource was last modified, as an ISO 8601 formatted string.
		 *
		 * Should be an ISO 8601 formatted string (e.g., "2025-01-12T15:00:58Z").
		 *
		 * Examples: last activity timestamp in an open file, timestamp when the resource
		 * was attached, etc.
		 */
		lastModified?: string;
	}

	/**
	 * @category Content
	 */
	export type ContentBlock =
		| TextContent
		| ImageContent
		| AudioContent
		| ResourceLink
		| EmbeddedResource;

	/**
	 * Text provided to or from an LLM.
	 *
	 * @example Text content
	 * {@includeCode ./examples/TextContent/text-content.json}
	 *
	 * @category Content
	 */
	export interface TextContent {
		type: "text";

		/**
		 * The text content of the message.
		 */
		text: string;

		/**
		 * Optional annotations for the client.
		 */
		annotations?: Annotations;

		_meta?: MetaObject;
	}

	/**
	 * An image provided to or from an LLM.
	 *
	 * @example `image/png` content with annotations
	 * {@includeCode ./examples/ImageContent/image-png-content-with-annotations.json}
	 *
	 * @category Content
	 */
	export interface ImageContent {
		type: "image";

		/**
		 * The base64-encoded image data.
		 *
		 * @format byte
		 */
		data: string;

		/**
		 * The MIME type of the image. Different providers may support different image types.
		 */
		mimeType: string;

		/**
		 * Optional annotations for the client.
		 */
		annotations?: Annotations;

		_meta?: MetaObject;
	}

	/**
	 * Audio provided to or from an LLM.
	 *
	 * @example `audio/wav` content
	 * {@includeCode ./examples/AudioContent/audio-wav-content.json}
	 *
	 * @category Content
	 */
	export interface AudioContent {
		type: "audio";

		/**
		 * The base64-encoded audio data.
		 *
		 * @format byte
		 */
		data: string;

		/**
		 * The MIME type of the audio. Different providers may support different audio types.
		 */
		mimeType: string;

		/**
		 * Optional annotations for the client.
		 */
		annotations?: Annotations;

		_meta?: MetaObject;
	}

	/**
	 * A request from the assistant to call a tool.
	 *
	 * @example `get_weather` tool use
	 * {@includeCode ./examples/ToolUseContent/get-weather-tool-use.json}
	 *
	 * @category `sampling/createMessage`
	 */
	export interface ToolUseContent {
		type: "tool_use";

		/**
		 * A unique identifier for this tool use.
		 *
		 * This ID is used to match tool results to their corresponding tool uses.
		 */
		id: string;

		/**
		 * The name of the tool to call.
		 */
		name: string;

		/**
		 * The arguments to pass to the tool, conforming to the tool's input schema.
		 */
		input: { [key: string]: unknown };

		/**
		 * Optional metadata about the tool use. Clients SHOULD preserve this field when
		 * including tool uses in subsequent sampling requests to enable caching optimizations.
		 */
		_meta?: MetaObject;
	}

	/**
	 * The result of a tool use, provided by the user back to the assistant.
	 *
	 * @example `get_weather` tool result
	 * {@includeCode ./examples/ToolResultContent/get-weather-tool-result.json}
	 *
	 * @category `sampling/createMessage`
	 */
	export interface ToolResultContent {
		type: "tool_result";

		/**
		 * The ID of the tool use this result corresponds to.
		 *
		 * This MUST match the ID from a previous {@link ToolUseContent}.
		 */
		toolUseId: string;

		/**
		 * The unstructured result content of the tool use.
		 *
		 * This has the same format as {@link CallToolResult.content} and can include text, images,
		 * audio, resource links, and embedded resources.
		 */
		content: ContentBlock[];

		/**
		 * An optional structured result object.
		 *
		 * If the tool defined an {@link Tool.outputSchema}, this SHOULD conform to that schema.
		 */
		structuredContent?: { [key: string]: unknown };

		/**
		 * Whether the tool use resulted in an error.
		 *
		 * If true, the content typically describes the error that occurred.
		 * Default: false
		 */
		isError?: boolean;

		/**
		 * Optional metadata about the tool result. Clients SHOULD preserve this field when
		 * including tool results in subsequent sampling requests to enable caching optimizations.
		 */
		_meta?: MetaObject;
	}

	/**
	 * The server's preferences for model selection, requested of the client during sampling.
	 *
	 * Because LLMs can vary along multiple dimensions, choosing the "best" model is
	 * rarely straightforward.  Different models excel in different areas-some are
	 * faster but less capable, others are more capable but more expensive, and so
	 * on. This interface allows servers to express their priorities across multiple
	 * dimensions to help clients make an appropriate selection for their use case.
	 *
	 * These preferences are always advisory. The client MAY ignore them. It is also
	 * up to the client to decide how to interpret these preferences and how to
	 * balance them against other considerations.
	 *
	 * @example With hints and priorities
	 * {@includeCode ./examples/ModelPreferences/with-hints-and-priorities.json}
	 *
	 * @category `sampling/createMessage`
	 */
	export interface ModelPreferences {
		/**
		 * Optional hints to use for model selection.
		 *
		 * If multiple hints are specified, the client MUST evaluate them in order
		 * (such that the first match is taken).
		 *
		 * The client SHOULD prioritize these hints over the numeric priorities, but
		 * MAY still use the priorities to select from ambiguous matches.
		 */
		hints?: ModelHint[];

		/**
		 * How much to prioritize cost when selecting a model. A value of 0 means cost
		 * is not important, while a value of 1 means cost is the most important
		 * factor.
		 *
		 * @TJS-type number
		 * @minimum 0
		 * @maximum 1
		 */
		costPriority?: number;

		/**
		 * How much to prioritize sampling speed (latency) when selecting a model. A
		 * value of 0 means speed is not important, while a value of 1 means speed is
		 * the most important factor.
		 *
		 * @TJS-type number
		 * @minimum 0
		 * @maximum 1
		 */
		speedPriority?: number;

		/**
		 * How much to prioritize intelligence and capabilities when selecting a
		 * model. A value of 0 means intelligence is not important, while a value of 1
		 * means intelligence is the most important factor.
		 *
		 * @TJS-type number
		 * @minimum 0
		 * @maximum 1
		 */
		intelligencePriority?: number;
	}

	/**
	 * Hints to use for model selection.
	 *
	 * Keys not declared here are currently left unspecified by the spec and are up
	 * to the client to interpret.
	 *
	 * @category `sampling/createMessage`
	 */
	export interface ModelHint {
		/**
		 * A hint for a model name.
		 *
		 * The client SHOULD treat this as a substring of a model name; for example:
		 *  - `claude-3-5-sonnet` should match `claude-3-5-sonnet-20241022`
		 *  - `sonnet` should match `claude-3-5-sonnet-20241022`, `claude-3-sonnet-20240229`, etc.
		 *  - `claude` should match any Claude model
		 *
		 * The client MAY also map the string to a different provider's model name or a different model family, as long as it fills a similar niche; for example:
		 *  - `gemini-1.5-flash` could match `claude-3-haiku-20240307`
		 */
		name?: string;
	}

	/* Autocomplete */
	/**
	 * Parameters for a `completion/complete` request.
	 *
	 * @category `completion/complete`
	 *
	 * @example Prompt argument completion
	 * {@includeCode ./examples/CompleteRequestParams/prompt-argument-completion.json}
	 *
	 * @example Prompt argument completion with context
	 * {@includeCode ./examples/CompleteRequestParams/prompt-argument-completion-with-context.json}
	 */
	export interface CompleteRequestParams extends RequestParams {
		ref: PromptReference | ResourceTemplateReference;
		/**
		 * The argument's information
		 */
		argument: {
			/**
			 * The name of the argument
			 */
			name: string;
			/**
			 * The value of the argument to use for completion matching.
			 */
			value: string;
		};

		/**
		 * Additional, optional context for completions
		 */
		context?: {
			/**
			 * Previously-resolved variables in a URI template or prompt.
			 */
			arguments?: { [key: string]: string };
		};
	}

	/**
	 * A request from the client to the server, to ask for completion options.
	 *
	 * @example Completion request
	 * {@includeCode ./examples/CompleteRequest/completion-request.json}
	 *
	 * @category `completion/complete`
	 */
	export interface CompleteRequest extends JSONRPCRequest {
		method: "completion/complete";
		params: CompleteRequestParams;
	}

	/**
	 * The result returned by the server for a {@link CompleteRequest | completion/complete} request.
	 *
	 * @category `completion/complete`
	 *
	 * @example Single completion value
	 * {@includeCode ./examples/CompleteResult/single-completion-value.json}
	 *
	 * @example Multiple completion values with more available
	 * {@includeCode ./examples/CompleteResult/multiple-completion-values-with-more-available.json}
	 */
	export interface CompleteResult extends Result {
		completion: {
			/**
			 * An array of completion values. Must not exceed 100 items.
			 */
			values: string[];
			/**
			 * The total number of completion options available. This can exceed the number of values actually sent in the response.
			 */
			total?: number;
			/**
			 * Indicates whether there are additional completion options beyond those provided in the current response, even if the exact total is unknown.
			 */
			hasMore?: boolean;
		};
	}

	/**
	 * A successful response from the server for a {@link CompleteRequest | completion/complete} request.
	 *
	 * @example Completion result response
	 * {@includeCode ./examples/CompleteResultResponse/completion-result-response.json}
	 *
	 * @category `completion/complete`
	 */
	export interface CompleteResultResponse extends JSONRPCResultResponse {
		result: CompleteResult;
	}

	/**
	 * A reference to a resource or resource template definition.
	 *
	 * @category `completion/complete`
	 */
	export interface ResourceTemplateReference {
		type: "ref/resource";
		/**
		 * The URI or URI template of the resource.
		 *
		 * @format uri-template
		 */
		uri: string;
	}

	/**
	 * Identifies a prompt.
	 *
	 * @category `completion/complete`
	 */
	export interface PromptReference extends BaseMetadata {
		type: "ref/prompt";
	}

	/* Roots */
	/**
	 * Sent from the server to request a list of root URIs from the client. Roots allow
	 * servers to ask for specific directories or files to operate on. A common example
	 * for roots is providing a set of repositories or directories a server should operate
	 * on.
	 *
	 * This request is typically used when the server needs to understand the file system
	 * structure or access specific locations that the client has permission to read from.
	 *
	 * @example List roots request
	 * {@includeCode ./examples/ListRootsRequest/list-roots-request.json}
	 *
	 * @category `roots/list`
	 */
	export interface ListRootsRequest extends JSONRPCRequest {
		method: "roots/list";
		params?: RequestParams;
	}

	/**
	 * The result returned by the client for a {@link ListRootsRequest | roots/list} request.
	 * This result contains an array of {@link Root} objects, each representing a root directory
	 * or file that the server can operate on.
	 *
	 * @example Single root directory
	 * {@includeCode ./examples/ListRootsResult/single-root-directory.json}
	 *
	 * @example Multiple root directories
	 * {@includeCode ./examples/ListRootsResult/multiple-root-directories.json}
	 *
	 * @category `roots/list`
	 */
	export interface ListRootsResult extends Result {
		roots: Root[];
	}

	/**
	 * A successful response from the client for a {@link ListRootsRequest | roots/list} request.
	 *
	 * @example List roots result response
	 * {@includeCode ./examples/ListRootsResultResponse/list-roots-result-response.json}
	 *
	 * @category `roots/list`
	 */
	export interface ListRootsResultResponse extends JSONRPCResultResponse {
		result: ListRootsResult;
	}

	/**
	 * Represents a root directory or file that the server can operate on.
	 *
	 * @example Project directory root
	 * {@includeCode ./examples/Root/project-directory.json}
	 *
	 * @category `roots/list`
	 */
	export interface Root {
		/**
		 * The URI identifying the root. This *must* start with `file://` for now.
		 * This restriction may be relaxed in future versions of the protocol to allow
		 * other URI schemes.
		 *
		 * @format uri
		 */
		uri: string;
		/**
		 * An optional name for the root. This can be used to provide a human-readable
		 * identifier for the root, which may be useful for display purposes or for
		 * referencing the root in other parts of the application.
		 */
		name?: string;

		_meta?: MetaObject;
	}

	/**
	 * A notification from the client to the server, informing it that the list of roots has changed.
	 * This notification should be sent whenever the client adds, removes, or modifies any root.
	 * The server should then request an updated list of roots using the {@link ListRootsRequest}.
	 *
	 * @example Roots list changed
	 * {@includeCode ./examples/RootsListChangedNotification/roots-list-changed.json}
	 *
	 * @category `notifications/roots/list_changed`
	 */
	export interface RootsListChangedNotification extends JSONRPCNotification {
		method: "notifications/roots/list_changed";
		params?: NotificationParams;
	}

	/**
	 * The parameters for a request to elicit non-sensitive information from the user via a form in the client.
	 *
	 * @example Elicit single field
	 * {@includeCode ./examples/ElicitRequestFormParams/elicit-single-field.json}
	 *
	 * @example Elicit multiple fields
	 * {@includeCode ./examples/ElicitRequestFormParams/elicit-multiple-fields.json}
	 *
	 * @category `elicitation/create`
	 */
	export interface ElicitRequestFormParams extends TaskAugmentedRequestParams {
		/**
		 * The elicitation mode.
		 */
		mode?: "form";

		/**
		 * The message to present to the user describing what information is being requested.
		 */
		message: string;

		/**
		 * A restricted subset of JSON Schema.
		 * Only top-level properties are allowed, without nesting.
		 */
		requestedSchema: {
			$schema?: string;
			type: "object";
			properties: {
				[key: string]: PrimitiveSchemaDefinition;
			};
			required?: string[];
		};
	}

	/**
	 * The parameters for a request to elicit information from the user via a URL in the client.
	 *
	 * @example Elicit sensitive data
	 * {@includeCode ./examples/ElicitRequestURLParams/elicit-sensitive-data.json}
	 *
	 * @category `elicitation/create`
	 */
	export interface ElicitRequestURLParams extends TaskAugmentedRequestParams {
		/**
		 * The elicitation mode.
		 */
		mode: "url";

		/**
		 * The message to present to the user explaining why the interaction is needed.
		 */
		message: string;

		/**
		 * The ID of the elicitation, which must be unique within the context of the server.
		 * The client MUST treat this ID as an opaque value.
		 */
		elicitationId: string;

		/**
		 * The URL that the user should navigate to.
		 *
		 * @format uri
		 */
		url: string;
	}

	/**
	 * The parameters for a request to elicit additional information from the user via the client.
	 *
	 * @category `elicitation/create`
	 */
	export type ElicitRequestParams =
		| ElicitRequestFormParams
		| ElicitRequestURLParams;

	/**
	 * A request from the server to elicit additional information from the user via the client.
	 *
	 * @example Elicitation request
	 * {@includeCode ./examples/ElicitRequest/elicitation-request.json}
	 *
	 * @category `elicitation/create`
	 */
	export interface ElicitRequest extends JSONRPCRequest {
		method: "elicitation/create";
		params: ElicitRequestParams;
	}

	/**
	 * Restricted schema definitions that only allow primitive types
	 * without nested objects or arrays.
	 *
	 * @category `elicitation/create`
	 */
	export type PrimitiveSchemaDefinition =
		| StringSchema
		| NumberSchema
		| BooleanSchema
		| EnumSchema;

	/**
	 * @example Email input schema
	 * {@includeCode ./examples/StringSchema/email-input-schema.json}
	 *
	 * @category `elicitation/create`
	 */
	export interface StringSchema {
		type: "string";
		title?: string;
		description?: string;
		minLength?: number;
		maxLength?: number;
		format?: "email" | "uri" | "date" | "date-time";
		default?: string;
	}

	/**
	 * @example Number input schema
	 * {@includeCode ./examples/NumberSchema/number-input-schema.json}
	 *
	 * @category `elicitation/create`
	 */
	export interface NumberSchema {
		type: "number" | "integer";
		title?: string;
		description?: string;
		minimum?: number;
		maximum?: number;
		default?: number;
	}

	/**
	 * @example Boolean input schema
	 * {@includeCode ./examples/BooleanSchema/boolean-input-schema.json}
	 *
	 * @category `elicitation/create`
	 */
	export interface BooleanSchema {
		type: "boolean";
		title?: string;
		description?: string;
		default?: boolean;
	}

	/**
	 * Schema for single-selection enumeration without display titles for options.
	 *
	 * @example Color select schema
	 * {@includeCode ./examples/UntitledSingleSelectEnumSchema/color-select-schema.json}
	 *
	 * @category `elicitation/create`
	 */
	export interface UntitledSingleSelectEnumSchema {
		type: "string";
		/**
		 * Optional title for the enum field.
		 */
		title?: string;
		/**
		 * Optional description for the enum field.
		 */
		description?: string;
		/**
		 * Array of enum values to choose from.
		 */
		enum: string[];
		/**
		 * Optional default value.
		 */
		default?: string;
	}

	/**
	 * Schema for single-selection enumeration with display titles for each option.
	 *
	 * @example Titled color select schema
	 * {@includeCode ./examples/TitledSingleSelectEnumSchema/titled-color-select-schema.json}
	 *
	 * @category `elicitation/create`
	 */
	export interface TitledSingleSelectEnumSchema {
		type: "string";
		/**
		 * Optional title for the enum field.
		 */
		title?: string;
		/**
		 * Optional description for the enum field.
		 */
		description?: string;
		/**
		 * Array of enum options with values and display labels.
		 */
		oneOf: Array<{
			/**
			 * The enum value.
			 */
			const: string;
			/**
			 * Display label for this option.
			 */
			title: string;
		}>;
		/**
		 * Optional default value.
		 */
		default?: string;
	}

	/**
	 * @category `elicitation/create`
	 */
	// Combined single selection enumeration
	export type SingleSelectEnumSchema =
		| UntitledSingleSelectEnumSchema
		| TitledSingleSelectEnumSchema;

	/**
	 * Schema for multiple-selection enumeration without display titles for options.
	 *
	 * @example Color multi-select schema
	 * {@includeCode ./examples/UntitledMultiSelectEnumSchema/color-multi-select-schema.json}
	 *
	 * @category `elicitation/create`
	 */
	export interface UntitledMultiSelectEnumSchema {
		type: "array";
		/**
		 * Optional title for the enum field.
		 */
		title?: string;
		/**
		 * Optional description for the enum field.
		 */
		description?: string;
		/**
		 * Minimum number of items to select.
		 */
		minItems?: number;
		/**
		 * Maximum number of items to select.
		 */
		maxItems?: number;
		/**
		 * Schema for the array items.
		 */
		items: {
			type: "string";
			/**
			 * Array of enum values to choose from.
			 */
			enum: string[];
		};
		/**
		 * Optional default value.
		 */
		default?: string[];
	}

	/**
	 * Schema for multiple-selection enumeration with display titles for each option.
	 *
	 * @example Titled color multi-select schema
	 * {@includeCode ./examples/TitledMultiSelectEnumSchema/titled-color-multi-select-schema.json}
	 *
	 * @category `elicitation/create`
	 */
	export interface TitledMultiSelectEnumSchema {
		type: "array";
		/**
		 * Optional title for the enum field.
		 */
		title?: string;
		/**
		 * Optional description for the enum field.
		 */
		description?: string;
		/**
		 * Minimum number of items to select.
		 */
		minItems?: number;
		/**
		 * Maximum number of items to select.
		 */
		maxItems?: number;
		/**
		 * Schema for array items with enum options and display labels.
		 */
		items: {
			/**
			 * Array of enum options with values and display labels.
			 */
			anyOf: Array<{
				/**
				 * The constant enum value.
				 */
				const: string;
				/**
				 * Display title for this option.
				 */
				title: string;
			}>;
		};
		/**
		 * Optional default value.
		 */
		default?: string[];
	}

	/**
	 * @category `elicitation/create`
	 */
	// Combined multiple selection enumeration
	export type MultiSelectEnumSchema =
		| UntitledMultiSelectEnumSchema
		| TitledMultiSelectEnumSchema;

	/**
	 * Use {@link TitledSingleSelectEnumSchema} instead.
	 * This interface will be removed in a future version.
	 *
	 * @category `elicitation/create`
	 */
	export interface LegacyTitledEnumSchema {
		type: "string";
		title?: string;
		description?: string;
		enum: string[];
		/**
		 * (Legacy) Display names for enum values.
		 * Non-standard according to JSON schema 2020-12.
		 */
		enumNames?: string[];
		default?: string;
	}

	/**
	 * @category `elicitation/create`
	 */
	// Union type for all enum schemas
	export type EnumSchema =
		| SingleSelectEnumSchema
		| MultiSelectEnumSchema
		| LegacyTitledEnumSchema;

	/**
	 * The result returned by the client for an {@link ElicitRequest | elicitation/create} request.
	 *
	 * @example Input single field
	 * {@includeCode ./examples/ElicitResult/input-single-field.json}
	 *
	 * @example Input multiple fields
	 * {@includeCode ./examples/ElicitResult/input-multiple-fields.json}
	 *
	 * @example Accept URL mode (no content)
	 * {@includeCode ./examples/ElicitResult/accept-url-mode-no-content.json}
	 *
	 * @category `elicitation/create`
	 */
	export interface ElicitResult extends Result {
		/**
		 * The user action in response to the elicitation.
		 * - `"accept"`: User submitted the form/confirmed the action
		 * - `"decline"`: User explicitly declined the action
		 * - `"cancel"`: User dismissed without making an explicit choice
		 */
		action: "accept" | "decline" | "cancel";

		/**
		 * The submitted form data, only present when action is `"accept"` and mode was `"form"`.
		 * Contains values matching the requested schema.
		 * Omitted for out-of-band mode responses.
		 */
		content?: { [key: string]: string | number | boolean | string[] };
	}

	/**
	 * A successful response from the client for a {@link ElicitRequest | elicitation/create} request.
	 *
	 * @example Elicitation result response
	 * {@includeCode ./examples/ElicitResultResponse/elicitation-result-response.json}
	 *
	 * @category `elicitation/create`
	 */
	export interface ElicitResultResponse extends JSONRPCResultResponse {
		result: ElicitResult;
	}

	/**
	 * An optional notification from the server to the client, informing it of a completion of a out-of-band elicitation request.
	 *
	 * @example Elicitation complete
	 * {@includeCode ./examples/ElicitationCompleteNotification/elicitation-complete.json}
	 *
	 * @category `notifications/elicitation/complete`
	 */
	export interface ElicitationCompleteNotification extends JSONRPCNotification {
		method: "notifications/elicitation/complete";
		params: {
			/**
			 * The ID of the elicitation that completed.
			 */
			elicitationId: string;
		};
	}

	/* Client messages */
	/** @internal */
	export type ClientRequest =
		| PingRequest
		| InitializeRequest
		| CompleteRequest
		| SetLevelRequest
		| GetPromptRequest
		| ListPromptsRequest
		| ListResourcesRequest
		| ListResourceTemplatesRequest
		| ReadResourceRequest
		| SubscribeRequest
		| UnsubscribeRequest
		| CallToolRequest
		| ListToolsRequest
		| GetTaskRequest
		| GetTaskPayloadRequest
		| ListTasksRequest
		| CancelTaskRequest;

	/** @internal */
	export type ClientNotification =
		| CancelledNotification
		| ProgressNotification
		| InitializedNotification
		| RootsListChangedNotification
		| TaskStatusNotification;

	/** @internal */
	export type ClientResult =
		| EmptyResult
		| CreateMessageResult
		| ListRootsResult
		| ElicitResult
		| GetTaskResult
		| GetTaskPayloadResult
		| ListTasksResult
		| CancelTaskResult;

	/* Server messages */
	/** @internal */
	export type ServerRequest =
		| PingRequest
		| CreateMessageRequest
		| ListRootsRequest
		| ElicitRequest
		| GetTaskRequest
		| GetTaskPayloadRequest
		| ListTasksRequest
		| CancelTaskRequest;

	/** @internal */
	export type ServerNotification =
		| CancelledNotification
		| ProgressNotification
		| LoggingMessageNotification
		| ResourceUpdatedNotification
		| ResourceListChangedNotification
		| ToolListChangedNotification
		| PromptListChangedNotification
		| ElicitationCompleteNotification
		| TaskStatusNotification;

	/** @internal */
	export type ServerResult =
		| EmptyResult
		| InitializeResult
		| CompleteResult
		| GetPromptResult
		| ListPromptsResult
		| ListResourceTemplatesResult
		| ListResourcesResult
		| ReadResourceResult
		| CallToolResult
		| CreateTaskResult
		| ListToolsResult
		| GetTaskResult
		| GetTaskPayloadResult
		| ListTasksResult
		| CancelTaskResult;
}
