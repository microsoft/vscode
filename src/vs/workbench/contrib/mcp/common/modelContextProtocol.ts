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
export namespace MCP {/* JSON-RPC types */

	/**
	 * Refers to any valid JSON-RPC object that can be decoded off the wire, or encoded to be sent.
	 *
	 * @internal
	 */
	export type JSONRPCMessage =
		| JSONRPCRequest
		| JSONRPCNotification
		| JSONRPCResponse
		| JSONRPCError;

	/** @internal */
	export const LATEST_PROTOCOL_VERSION = "2025-06-18";
	/** @internal */
	export const JSONRPC_VERSION = "2.0";

	/**
	 * A progress token, used to associate progress notifications with the original request.
	 */
	export type ProgressToken = string | number;

	/**
	 * An opaque token used to represent a cursor for pagination.
	 */
	export type Cursor = string;

	/** @internal */
	export interface Request {
		method: string;
		params?: {
			/**
			 * See [General fields: `_meta`](/specification/draft/basic/index#meta) for notes on `_meta` usage.
			 */
			_meta?: {
				/**
				 * If specified, the caller is requesting out-of-band progress notifications for this request (as represented by notifications/progress). The value of this parameter is an opaque token that will be attached to any subsequent notifications. The receiver is not obligated to provide these notifications.
				 */
				progressToken?: ProgressToken;
				[key: string]: unknown;
			};
			[key: string]: unknown;
		};
	}

	/** @internal */
	export interface Notification {
		method: string;
		params?: {
			/**
			 * See [General fields: `_meta`](/specification/draft/basic/index#meta) for notes on `_meta` usage.
			 */
			_meta?: { [key: string]: unknown };
			[key: string]: unknown;
		};
	}

	export interface Result {
		/**
		 * See [General fields: `_meta`](/specification/draft/basic/index#meta) for notes on `_meta` usage.
		 */
		_meta?: { [key: string]: unknown };
		[key: string]: unknown;
	}

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
	 */
	export type RequestId = string | number;

	/**
	 * A request that expects a response.
	 */
	export interface JSONRPCRequest extends Request {
		jsonrpc: typeof JSONRPC_VERSION;
		id: RequestId;
	}

	/**
	 * A notification which does not expect a response.
	 */
	export interface JSONRPCNotification extends Notification {
		jsonrpc: typeof JSONRPC_VERSION;
	}

	/**
	 * A successful (non-error) response to a request.
	 */
	export interface JSONRPCResponse {
		jsonrpc: typeof JSONRPC_VERSION;
		id: RequestId;
		result: Result;
	}

	// Standard JSON-RPC error codes
	/** @internal */
	export const PARSE_ERROR = -32700;
	/** @internal */
	export const INVALID_REQUEST = -32600;
	/** @internal */
	export const METHOD_NOT_FOUND = -32601;
	/** @internal */
	export const INVALID_PARAMS = -32602;
	/** @internal */
	export const INTERNAL_ERROR = -32603;

	/**
	 * A response to a request that indicates an error occurred.
	 */
	export interface JSONRPCError {
		jsonrpc: typeof JSONRPC_VERSION;
		id: RequestId;
		error: Error;
	}

	/* Empty result */
	/**
	 * A response that indicates success but carries no data.
	 */
	export type EmptyResult = Result;

	/* Cancellation */
	/**
	 * This notification can be sent by either side to indicate that it is cancelling a previously-issued request.
	 *
	 * The request SHOULD still be in-flight, but due to communication latency, it is always possible that this notification MAY arrive after the request has already finished.
	 *
	 * This notification indicates that the result will be unused, so any associated processing SHOULD cease.
	 *
	 * A client MUST NOT attempt to cancel its `initialize` request.
	 *
	 * @category notifications/cancelled
	 */
	export interface CancelledNotification extends JSONRPCNotification {
		method: "notifications/cancelled";
		params: {
			/**
			 * The ID of the request to cancel.
			 *
			 * This MUST correspond to the ID of a request previously issued in the same direction.
			 */
			requestId: RequestId;

			/**
			 * An optional string describing the reason for the cancellation. This MAY be logged or presented to the user.
			 */
			reason?: string;
		};
	}

	/* Initialization */
	/**
	 * This request is sent from the client to the server when it first connects, asking it to begin initialization.
	 *
	 * @category initialize
	 */
	export interface InitializeRequest extends JSONRPCRequest {
		method: "initialize";
		params: {
			/**
			 * The latest version of the Model Context Protocol that the client supports. The client MAY decide to support older versions as well.
			 */
			protocolVersion: string;
			capabilities: ClientCapabilities;
			clientInfo: Implementation;
		};
	}

	/**
	 * After receiving an initialize request from the client, the server sends this response.
	 *
	 * @category initialize
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
	 * This notification is sent from the client to the server after initialization has finished.
	 *
	 * @category notifications/initialized
	 */
	export interface InitializedNotification extends JSONRPCNotification {
		method: "notifications/initialized";
	}

	/**
	 * Capabilities a client may support. Known capabilities are defined here, in this schema, but this is not a closed set: any client can define its own, additional capabilities.
	 */
	export interface ClientCapabilities {
		/**
		 * Experimental, non-standard capabilities that the client supports.
		 */
		experimental?: { [key: string]: object };
		/**
		 * Present if the client supports listing roots.
		 */
		roots?: {
			/**
			 * Whether the client supports notifications for changes to the roots list.
			 */
			listChanged?: boolean;
		};
		/**
		 * Present if the client supports sampling from an LLM.
		 */
		sampling?: object;
		/**
		 * Present if the client supports elicitation from the server.
		 */
		elicitation?: object;
	}

	/**
	 * Capabilities that a server may support. Known capabilities are defined here, in this schema, but this is not a closed set: any server can define its own, additional capabilities.
	 */
	export interface ServerCapabilities {
		/**
		 * Experimental, non-standard capabilities that the server supports.
		 */
		experimental?: { [key: string]: object };
		/**
		 * Present if the server supports sending log messages to the client.
		 */
		logging?: object;
		/**
		 * Present if the server supports argument autocompletion suggestions.
		 */
		completions?: object;
		/**
		 * Present if the server offers any prompt templates.
		 */
		prompts?: {
			/**
			 * Whether this server supports notifications for changes to the prompt list.
			 */
			listChanged?: boolean;
		};
		/**
		 * Present if the server offers any resources to read.
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
		 */
		tools?: {
			/**
			 * Whether this server supports notifications for changes to the tool list.
			 */
			listChanged?: boolean;
		};
	}

	/**
	 * An optionally-sized icon that can be displayed in a user interface.
	 */
	export interface Icon {
		/**
		 * A standard URI pointing to an icon resource. May be an HTTP/HTTPS URL or a
		 * `data:` URI with Base64-encoded image data.
		 *
		 * Consumers SHOULD takes steps to ensure URLs serving icons are from the
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
		 * Optional string that specifies one or more sizes at which the icon can be used.
		 * For example: `"48x48"`, `"48x48 96x96"`, or `"any"` for scalable formats like SVG.
		 *
		 * If not provided, the client should assume that the icon can be used at any size.
		 */
		sizes?: string;

		/**
		 * Optional specifier for the theme this icon is designed for. `light` indicates
		 * the icon is designed to be used with a light background, and `dark` indicates
		 * the icon is designed to be used with a dark background.
		 *
		 * If not provided, the client should assume the icon can be used with any theme.
		 */
		theme?: 'light' | 'dark';
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
		 * If not provided, the name should be used for display (except for Tool,
		 * where `annotations.title` should be given precedence over using `name`,
		 * if present).
		 */
		title?: string;
	}

	/**
	 * Describes the MCP implementation
	 */
	export interface Implementation extends BaseMetadata, Icons {
		version: string;

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
	 * @category ping
	 */
	export interface PingRequest extends JSONRPCRequest {
		method: "ping";
	}

	/* Progress notifications */
	/**
	 * An out-of-band notification used to inform the receiver of a progress update for a long-running request.
	 *
	 * @category notifications/progress
	 */
	export interface ProgressNotification extends JSONRPCNotification {
		method: "notifications/progress";
		params: {
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
		};
	}

	/* Pagination */
	/** @internal */
	export interface PaginatedRequest extends JSONRPCRequest {
		params?: {
			/**
			 * An opaque token representing the current pagination position.
			 * If provided, the server should return results starting after this cursor.
			 */
			cursor?: Cursor;
		};
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
	 * @category resources/list
	 */
	export interface ListResourcesRequest extends PaginatedRequest {
		method: "resources/list";
	}

	/**
	 * The server's response to a resources/list request from the client.
	 *
	 * @category resources/list
	 */
	export interface ListResourcesResult extends PaginatedResult {
		resources: Resource[];
	}

	/**
	 * Sent from the client to request a list of resource templates the server has.
	 *
	 * @category resources/templates/list
	 */
	export interface ListResourceTemplatesRequest extends PaginatedRequest {
		method: "resources/templates/list";
	}

	/**
	 * The server's response to a resources/templates/list request from the client.
	 *
	 * @category resources/templates/list
	 */
	export interface ListResourceTemplatesResult extends PaginatedResult {
		resourceTemplates: ResourceTemplate[];
	}

	/**
	 * Sent from the client to the server, to read a specific resource URI.
	 *
	 * @category resources/read
	 */
	export interface ReadResourceRequest extends JSONRPCRequest {
		method: "resources/read";
		params: {
			/**
			 * The URI of the resource to read. The URI can use any protocol; it is up to the server how to interpret it.
			 *
			 * @format uri
			 */
			uri: string;
		};
	}

	/**
	 * The server's response to a resources/read request from the client.
	 *
	 * @category resources/read
	 */
	export interface ReadResourceResult extends Result {
		contents: (TextResourceContents | BlobResourceContents)[];
	}

	/**
	 * An optional notification from the server to the client, informing it that the list of resources it can read from has changed. This may be issued by servers without any previous subscription from the client.
	 *
	 * @category notifications/resources/list_changed
	 */
	export interface ResourceListChangedNotification extends JSONRPCNotification {
		method: "notifications/resources/list_changed";
	}

	/**
	 * Sent from the client to request resources/updated notifications from the server whenever a particular resource changes.
	 *
	 * @category resources/subscribe
	 */
	export interface SubscribeRequest extends JSONRPCRequest {
		method: "resources/subscribe";
		params: {
			/**
			 * The URI of the resource to subscribe to. The URI can use any protocol; it is up to the server how to interpret it.
			 *
			 * @format uri
			 */
			uri: string;
		};
	}

	/**
	 * Sent from the client to request cancellation of resources/updated notifications from the server. This should follow a previous resources/subscribe request.
	 *
	 * @category resources/unsubscribe
	 */
	export interface UnsubscribeRequest extends JSONRPCRequest {
		method: "resources/unsubscribe";
		params: {
			/**
			 * The URI of the resource to unsubscribe from.
			 *
			 * @format uri
			 */
			uri: string;
		};
	}

	/**
	 * A notification from the server to the client, informing it that a resource has changed and may need to be read again. This should only be sent if the client previously sent a resources/subscribe request.
	 *
	 * @category notifications/resources/updated
	 */
	export interface ResourceUpdatedNotification extends JSONRPCNotification {
		method: "notifications/resources/updated";
		params: {
			/**
			 * The URI of the resource that has been updated. This might be a sub-resource of the one that the client actually subscribed to.
			 *
			 * @format uri
			 */
			uri: string;
		};
	}

	/**
	 * A known resource that the server is capable of reading.
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

		/**
		 * See [General fields: `_meta`](/specification/draft/basic/index#meta) for notes on `_meta` usage.
		 */
		_meta?: { [key: string]: unknown };
	}

	/**
	 * A template description for resources available on the server.
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

		/**
		 * See [General fields: `_meta`](/specification/draft/basic/index#meta) for notes on `_meta` usage.
		 */
		_meta?: { [key: string]: unknown };
	}

	/**
	 * The contents of a specific resource or sub-resource.
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

		/**
		 * See [General fields: `_meta`](/specification/draft/basic/index#meta) for notes on `_meta` usage.
		 */
		_meta?: { [key: string]: unknown };
	}

	export interface TextResourceContents extends ResourceContents {
		/**
		 * The text of the item. This must only be set if the item can actually be represented as text (not binary data).
		 */
		text: string;
	}

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
	 * @category prompts/list
	 */
	export interface ListPromptsRequest extends PaginatedRequest {
		method: "prompts/list";
	}

	/**
	 * The server's response to a prompts/list request from the client.
	 *
	 * @category prompts/list
	 */
	export interface ListPromptsResult extends PaginatedResult {
		prompts: Prompt[];
	}

	/**
	 * Used by the client to get a prompt provided by the server.
	 *
	 * @category prompts/get
	 */
	export interface GetPromptRequest extends JSONRPCRequest {
		method: "prompts/get";
		params: {
			/**
			 * The name of the prompt or prompt template.
			 */
			name: string;
			/**
			 * Arguments to use for templating the prompt.
			 */
			arguments?: { [key: string]: string };
		};
	}

	/**
	 * The server's response to a prompts/get request from the client.
	 *
	 * @category prompts/get
	 */
	export interface GetPromptResult extends Result {
		/**
		 * An optional description for the prompt.
		 */
		description?: string;
		messages: PromptMessage[];
	}

	/**
	 * A prompt or prompt template that the server offers.
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

		/**
		 * See [General fields: `_meta`](/specification/draft/basic/index#meta) for notes on `_meta` usage.
		 */
		_meta?: { [key: string]: unknown };
	}

	/**
	 * Describes an argument that a prompt can accept.
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
	 */
	export type Role = "user" | "assistant";

	/**
	 * Describes a message returned as part of a prompt.
	 *
	 * This is similar to `SamplingMessage`, but also supports the embedding of
	 * resources from the MCP server.
	 */
	export interface PromptMessage {
		role: Role;
		content: ContentBlock;
	}

	/**
	 * A resource that the server is capable of reading, included in a prompt or tool call result.
	 *
	 * Note: resource links returned by tools are not guaranteed to appear in the results of `resources/list` requests.
	 */
	export interface ResourceLink extends Resource {
		type: "resource_link";
	}

	/**
	 * The contents of a resource, embedded into a prompt or tool call result.
	 *
	 * It is up to the client how best to render embedded resources for the benefit
	 * of the LLM and/or the user.
	 */
	export interface EmbeddedResource {
		type: "resource";
		resource: TextResourceContents | BlobResourceContents;

		/**
		 * Optional annotations for the client.
		 */
		annotations?: Annotations;

		/**
		 * See [General fields: `_meta`](/specification/draft/basic/index#meta) for notes on `_meta` usage.
		 */
		_meta?: { [key: string]: unknown };
	}
	/**
	 * An optional notification from the server to the client, informing it that the list of prompts it offers has changed. This may be issued by servers without any previous subscription from the client.
	 *
	 * @category notifications/prompts/list_changed
	 */
	export interface PromptListChangedNotification extends JSONRPCNotification {
		method: "notifications/prompts/list_changed";
	}

	/* Tools */
	/**
	 * Sent from the client to request a list of tools the server has.
	 *
	 * @category tools/list
	 */
	export interface ListToolsRequest extends PaginatedRequest {
		method: "tools/list";
	}

	/**
	 * The server's response to a tools/list request from the client.
	 *
	 * @category tools/list
	 */
	export interface ListToolsResult extends PaginatedResult {
		tools: Tool[];
	}

	/**
	 * The server's response to a tool call.
	 *
	 * @category tools/call
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
	 * Used by the client to invoke a tool provided by the server.
	 *
	 * @category tools/call
	 */
	export interface CallToolRequest extends JSONRPCRequest {
		method: "tools/call";
		params: {
			name: string;
			arguments?: { [key: string]: unknown };
		};
	}

	/**
	 * An optional notification from the server to the client, informing it that the list of tools it offers has changed. This may be issued by servers without any previous subscription from the client.
	 *
	 * @category notifications/tools/list_changed
	 */
	export interface ToolListChangedNotification extends JSONRPCNotification {
		method: "notifications/tools/list_changed";
	}

	/**
	 * Additional properties describing a Tool to clients.
	 *
	 * NOTE: all properties in ToolAnnotations are **hints**.
	 * They are not guaranteed to provide a faithful description of
	 * tool behavior (including descriptive properties like `title`).
	 *
	 * Clients should never make tool use decisions based on ToolAnnotations
	 * received from untrusted servers.
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
		 * will have no additional effect on the its environment.
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
	 * Definition for a tool the client can call.
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
			type: "object";
			properties?: { [key: string]: object };
			required?: string[];
		};

		/**
		 * An optional JSON Schema object defining the structure of the tool's output returned in
		 * the structuredContent field of a CallToolResult.
		 */
		outputSchema?: {
			type: "object";
			properties?: { [key: string]: object };
			required?: string[];
		};

		/**
		 * Optional additional tool information.
		 *
		 * Display name precedence order is: title, annotations.title, then name.
		 */
		annotations?: ToolAnnotations;

		/**
		 * See [General fields: `_meta`](/specification/draft/basic/index#meta) for notes on `_meta` usage.
		 */
		_meta?: { [key: string]: unknown };
	}

	/* Logging */
	/**
	 * A request from the client to the server, to enable or adjust logging.
	 *
	 * @category logging/setLevel
	 */
	export interface SetLevelRequest extends JSONRPCRequest {
		method: "logging/setLevel";
		params: {
			/**
			 * The level of logging that the client wants to receive from the server. The server should send all logs at this level and higher (i.e., more severe) to the client as notifications/message.
			 */
			level: LoggingLevel;
		};
	}

	/**
	 * JSONRPCNotification of a log message passed from server to client. If no logging/setLevel request has been sent from the client, the server MAY decide which messages to send automatically.
	 *
	 * @category notifications/message
	 */
	export interface LoggingMessageNotification extends JSONRPCNotification {
		method: "notifications/message";
		params: {
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
		};
	}

	/**
	 * The severity of a log message.
	 *
	 * These map to syslog message severities, as specified in RFC-5424:
	 * https://datatracker.ietf.org/doc/html/rfc5424#section-6.2.1
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
	 * A request from the server to sample an LLM via the client. The client has full discretion over which model to select. The client should also inform the user before beginning sampling, to allow them to inspect the request (human in the loop) and decide whether to approve it.
	 *
	 * @category sampling/createMessage
	 */
	export interface CreateMessageRequest extends JSONRPCRequest {
		method: "sampling/createMessage";
		params: {
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
			 * A request to include context from one or more MCP servers (including the caller), to be attached to the prompt. The client MAY ignore this request.
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
		};
	}

	/**
	 * The client's response to a sampling/create_message request from the server. The client should inform the user before returning the sampled message, to allow them to inspect the response (human in the loop) and decide whether to allow the server to see it.
	 *
	 * @category sampling/createMessage
	 */
	export interface CreateMessageResult extends Result, SamplingMessage {
		/**
		 * The name of the model that generated the message.
		 */
		model: string;
		/**
		 * The reason why sampling stopped, if known.
		 */
		stopReason?: "endTurn" | "stopSequence" | "maxTokens" | string;
	}

	/**
	 * Describes a message issued to or received from an LLM API.
	 */
	export interface SamplingMessage {
		role: Role;
		content: TextContent | ImageContent | AudioContent;
	}

	/**
	 * Optional annotations for the client. The client can use annotations to inform how objects are used or displayed
	 */
	export interface Annotations {
		/**
		 * Describes who the intended customer of this object or data is.
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

	export type ContentBlock =
		| TextContent
		| ImageContent
		| AudioContent
		| ResourceLink
		| EmbeddedResource;

	/**
	 * Text provided to or from an LLM.
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

		/**
		 * See [General fields: `_meta`](/specification/draft/basic/index#meta) for notes on `_meta` usage.
		 */
		_meta?: { [key: string]: unknown };
	}

	/**
	 * An image provided to or from an LLM.
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

		/**
		 * See [General fields: `_meta`](/specification/draft/basic/index#meta) for notes on `_meta` usage.
		 */
		_meta?: { [key: string]: unknown };
	}

	/**
	 * Audio provided to or from an LLM.
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

		/**
		 * See [General fields: `_meta`](/specification/draft/basic/index#meta) for notes on `_meta` usage.
		 */
		_meta?: { [key: string]: unknown };
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
	 * A request from the client to the server, to ask for completion options.
	 *
	 * @category completion/complete
	 */
	export interface CompleteRequest extends JSONRPCRequest {
		method: "completion/complete";
		params: {
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
		};
	}

	/**
	 * The server's response to a completion/complete request
	 *
	 * @category completion/complete
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
	 * A reference to a resource or resource template definition.
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
	 * @category roots/list
	 */
	export interface ListRootsRequest extends JSONRPCRequest {
		method: "roots/list";
	}

	/**
	 * The client's response to a roots/list request from the server.
	 * This result contains an array of Root objects, each representing a root directory
	 * or file that the server can operate on.
	 *
	 * @category roots/list
	 */
	export interface ListRootsResult extends Result {
		roots: Root[];
	}

	/**
	 * Represents a root directory or file that the server can operate on.
	 */
	export interface Root {
		/**
		 * The URI identifying the root. This *must* start with file:// for now.
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

		/**
		 * See [General fields: `_meta`](/specification/draft/basic/index#meta) for notes on `_meta` usage.
		 */
		_meta?: { [key: string]: unknown };
	}

	/**
	 * A notification from the client to the server, informing it that the list of roots has changed.
	 * This notification should be sent whenever the client adds, removes, or modifies any root.
	 * The server should then request an updated list of roots using the ListRootsRequest.
	 *
	 * @category notifications/roots/list_changed
	 */
	export interface RootsListChangedNotification extends JSONRPCNotification {
		method: "notifications/roots/list_changed";
	}

	/**
	 * A request from the server to elicit additional information from the user via the client.
	 *
	 * @category elicitation/create
	 */
	export interface ElicitRequest extends JSONRPCRequest {
		method: "elicitation/create";
		params: {
			/**
			 * The message to present to the user.
			 */
			message: string;
			/**
			 * A restricted subset of JSON Schema.
			 * Only top-level properties are allowed, without nesting.
			 */
			requestedSchema: {
				type: "object";
				properties: {
					[key: string]: PrimitiveSchemaDefinition;
				};
				required?: string[];
			};
		};
	}

	/**
	 * Restricted schema definitions that only allow primitive types
	 * without nested objects or arrays.
	 */
	export type PrimitiveSchemaDefinition =
		| StringSchema
		| NumberSchema
		| BooleanSchema
		| EnumSchema;

	export interface StringSchema {
		type: "string";
		title?: string;
		description?: string;
		minLength?: number;
		maxLength?: number;
		format?: "email" | "uri" | "date" | "date-time";
		default?: string;
	}

	export interface NumberSchema {
		type: "number" | "integer";
		title?: string;
		description?: string;
		minimum?: number;
		maximum?: number;
		default?: number;
	}

	export interface BooleanSchema {
		type: "boolean";
		title?: string;
		description?: string;
		default?: boolean;
	}

	export interface EnumSchema {
		type: "string";
		title?: string;
		description?: string;
		enum: string[];
		enumNames?: string[]; // Display names for enum values
		default?: string;
	}

	/**
	 * The client's response to an elicitation request.
	 *
	 * @category elicitation/create
	 */
	export interface ElicitResult extends Result {
		/**
		 * The user action in response to the elicitation.
		 * - "accept": User submitted the form/confirmed the action
		 * - "decline": User explicitly decline the action
		 * - "cancel": User dismissed without making an explicit choice
		 */
		action: "accept" | "decline" | "cancel";

		/**
		 * The submitted form data, only present when action is "accept".
		 * Contains values matching the requested schema.
		 */
		content?: { [key: string]: string | number | boolean };
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
		| ListToolsRequest;

	/** @internal */
	export type ClientNotification =
		| CancelledNotification
		| ProgressNotification
		| InitializedNotification
		| RootsListChangedNotification;

	/** @internal */
	export type ClientResult =
		| EmptyResult
		| CreateMessageResult
		| ListRootsResult
		| ElicitResult;

	/* Server messages */
	/** @internal */
	export type ServerRequest =
		| PingRequest
		| CreateMessageRequest
		| ListRootsRequest
		| ElicitRequest;

	/** @internal */
	export type ServerNotification =
		| CancelledNotification
		| ProgressNotification
		| LoggingMessageNotification
		| ResourceUpdatedNotification
		| ResourceListChangedNotification
		| ToolListChangedNotification
		| PromptListChangedNotification;

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
		| ListToolsResult;
}
