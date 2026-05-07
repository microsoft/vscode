/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import type { IJsonRpcRequest } from '../../../../base/common/jsonRpcProtocol.js';

/**
 * MIME type the MCP Apps extension advertises support for.
 */
const MCP_APPS_MIME_TYPE = 'text/html;profile=mcp-app';

/**
 * Capability key for the MCP Apps extension under
 * `params.capabilities.extensions`.
 */
const MCP_APPS_EXTENSION_KEY = 'io.modelcontextprotocol/ui';

/**
 * Mutates an MCP `initialize` request payload from the upstream SDK
 * to advertise additional client capabilities (e.g. MCP Apps) when
 * the AHP client supports them.
 *
 * The proxy is otherwise blind. This is the only inbound (client →
 * upstream) rewrite it performs.
 */
export interface IInitializeInjector {
	/**
	 * Apply mutations to the `params` object of an `initialize` request.
	 * Idempotent: re-running on already-injected params is a no-op.
	 * Caller-provided client capabilities are PRESERVED — never
	 * overwritten — only merged. Unknown extension keys remain.
	 */
	inject(request: IJsonRpcRequest): IJsonRpcRequest;
}

interface IMutableInitializeParams {
	capabilities?: IMutableCapabilities;
	[k: string]: unknown;
}

interface IMutableCapabilities {
	extensions?: Record<string, unknown>;
	[k: string]: unknown;
}

/**
 * Injector that adds the MCP Apps extension capability under
 * `params.capabilities.extensions['io.modelcontextprotocol/ui']`.
 * Other fields on `capabilities` (sampling, elicitation, roots,
 * tasks, etc.) are preserved.
 */
export class McpAppsInitializeInjector implements IInitializeInjector {
	inject(request: IJsonRpcRequest): IJsonRpcRequest {
		const originalParams = (request.params ?? {}) as IMutableInitializeParams;
		const originalCaps = (originalParams.capabilities ?? {}) as IMutableCapabilities;
		const originalExtensions = (originalCaps.extensions ?? {}) as Record<string, unknown>;

		const newExtensions: Record<string, unknown> = {
			...originalExtensions,
			[MCP_APPS_EXTENSION_KEY]: {
				mimeTypes: [MCP_APPS_MIME_TYPE],
			},
		};

		const newCapabilities: IMutableCapabilities = {
			...originalCaps,
			extensions: newExtensions,
		};

		const newParams: IMutableInitializeParams = {
			...originalParams,
			capabilities: newCapabilities,
		};

		return {
			jsonrpc: request.jsonrpc,
			id: request.id,
			method: request.method,
			params: newParams,
		};
	}
}
