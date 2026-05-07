/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import type { JsonRpcMessage } from '../../../../base/common/jsonRpcProtocol.js';
import { Disposable, type IDisposable } from '../../../../base/common/lifecycle.js';
import { autorun } from '../../../../base/common/observable.js';
import type { URI } from '../../../../base/common/uri.js';
import { createDecorator } from '../../../instantiation/common/instantiation.js';
import type { ILogger } from '../../../log/common/log.js';
import {
	McpServerStatusKind,
	type McpRpcCallResponse,
	type McpRpcMessage,
	type McpServerStatus,
	type McpServerStatusAuthRequired,
} from '../../common/state/protocol/state.js';
import type { IInitializeInjector } from './mcpInitializeInjector.js';
import { McpProxyHttpListener, type IRouteRegistration } from './mcpProxyHttpListener.js';
import { McpProxyRoute } from './mcpProxyRoute.js';
import type { IMcpUpstream } from './mcpUpstream.js';

export interface IMcpProxyOptions {
	/** mcp:/<sessionId>/<serverId> URI; matches the AHP McpServerSummary.resource. */
	readonly resource: URI;
	readonly upstream: IMcpUpstream;
	readonly initializeInjector?: IInitializeInjector;
	readonly onUpstreamMessage: (message: McpRpcMessage) => string;
	readonly onAuthRequired: (status: McpServerStatusAuthRequired) => void;
	readonly onStateChange: (status: McpServerStatus) => void;
	readonly logger: ILogger;
}

export interface IMcpProxy extends IDisposable {
	/** mcp:/<sessionId>/<serverId> URI; matches the AHP McpServerSummary.resource. */
	readonly resource: URI;
	/** HTTP endpoint the upstream-facing SDK should connect to. */
	readonly endpoint: URI;
	/**
	 * Push a bearer token. Returns true if the upstream accepted the
	 * token (state transitioned to {@link McpServerStatusKind.Ready}).
	 * The `resource` argument is the protected-resource identifier the
	 * caller obtained via the most recent `AuthRequired` status; it is
	 * cross-checked against the proxy's last challenge.
	 */
	authenticate(resource: string, token: string): Promise<boolean>;
	/** Forward a message from the AHP client (via `mcpMessage`) to the upstream. */
	sendClientMessage(message: JsonRpcMessage): Promise<JsonRpcMessage | undefined>;
	/** Forward an AHP-client response to a previously-tapped upstream-originated request. */
	deliverClientResponse(messageId: string, response: McpRpcCallResponse): void;
}

export const IMcpProxyFactory = createDecorator<IMcpProxyFactory>('mcpProxyFactory');

export interface IMcpProxyFactory {
	readonly _serviceBrand: undefined;
	/**
	 * Create a proxy AND register its HTTP route. Resolves once the
	 * shared HTTP listener has bound and the route is reachable.
	 */
	create(options: IMcpProxyOptions): Promise<IMcpProxy>;
}

class McpProxy extends Disposable implements IMcpProxy {

	public readonly resource: URI;
	public readonly endpoint: URI;
	private readonly _route: McpProxyRoute;
	private readonly _options: IMcpProxyOptions;
	private _lastAuthChallenge: McpServerStatusAuthRequired | undefined;

	constructor(options: IMcpProxyOptions, route: McpProxyRoute, registration: IRouteRegistration) {
		super();
		this._options = options;
		this.resource = options.resource;
		this.endpoint = registration.endpoint;
		this._route = this._register(route);
		this._register({ dispose: () => registration.dispose() });

		this._register(autorun(reader => {
			const status = options.upstream.status.read(reader);
			if (status.kind === McpServerStatusKind.AuthRequired) {
				this._lastAuthChallenge = status;
				options.onAuthRequired(status);
			} else {
				options.onStateChange(status);
			}
		}));
	}

	public async authenticate(resource: string, token: string): Promise<boolean> {
		const challenge = this._lastAuthChallenge;
		if (challenge && challenge.resource.resource !== resource) {
			this._options.logger.warn(`McpProxy: authenticate called with resource '${resource}' but the most recent challenge was for '${challenge.resource.resource}'`);
			return false;
		}
		this._options.upstream.setBearerToken(token);
		try {
			const status = await this._options.upstream.start();
			return status.kind === McpServerStatusKind.Ready;
		} catch (err) {
			const message = err instanceof Error ? err.message : String(err);
			this._options.logger.error(`McpProxy: authenticate failed: ${message}`);
			return false;
		}
	}

	public sendClientMessage(message: JsonRpcMessage): Promise<JsonRpcMessage | undefined> {
		return this._route.sendClientMessage(message);
	}

	public deliverClientResponse(messageId: string, response: McpRpcCallResponse): void {
		this._route.deliverClientResponse(messageId, response);
	}
}

/**
 * Default implementation of {@link IMcpProxyFactory}. Owns a single
 * shared {@link McpProxyHttpListener}; the listener is bound on first
 * `create()` and shut down when the last route is removed.
 */
export class McpProxyFactory extends Disposable implements IMcpProxyFactory {

	public readonly _serviceBrand: undefined;

	private readonly _listener: McpProxyHttpListener;

	constructor(logger: ILogger) {
		super();
		this._listener = this._register(new McpProxyHttpListener(logger));
	}

	public async create(options: IMcpProxyOptions): Promise<IMcpProxy> {
		const route = new McpProxyRoute({
			upstream: options.upstream,
			logger: options.logger,
			initializeInjector: options.initializeInjector,
			onUpstreamMessage: options.onUpstreamMessage,
		});
		let registration: IRouteRegistration;
		try {
			registration = await this._listener.registerRoute(body => route.handleSdkBody(body));
		} catch (err) {
			route.dispose();
			throw err;
		}
		try {
			return new McpProxy(options, route, registration);
		} catch (err) {
			registration.dispose();
			route.dispose();
			throw err;
		}
	}
}
