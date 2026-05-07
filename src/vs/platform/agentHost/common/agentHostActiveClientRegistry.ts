/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { IDisposable, toDisposable } from '../../../base/common/lifecycle.js';
import { InstantiationType, registerSingleton } from '../../instantiation/common/extensions.js';
import { createDecorator } from '../../instantiation/common/instantiation.js';
import { CustomizationRef, ToolDefinition } from './state/protocol/state.js';

/**
 * The workbench-owned slice of {@link import('./state/protocol/state.js').SessionActiveClient} — everything the
 * workbench can produce without knowing the session's `clientId` (which is
 * supplied by the consumer at the call site).
 */
export interface IActiveClientBundle {
	readonly tools: ToolDefinition[];
	readonly customizations?: CustomizationRef[];
}

export type IActiveClientResolver = () => IActiveClientBundle;

export const IAgentHostActiveClientRegistry = createDecorator<IAgentHostActiveClientRegistry>('agentHostActiveClientRegistry');

/**
 * Cross-layer registry that lets the sessions-window eager-create flow
 * (`vs/sessions/...`) read the workbench-owned active-client bundle (tools +
 * customizations) for a given `(clientId, provider)` pair, so it can populate
 * `createSession.activeClient` at provisional creation time instead of
 * deferring the customization sync until the chat panel opens.
 *
 * Producer: workbench `AgentHostSessionHandler` registers a resolver per
 * `(clientId, provider)` in its constructor.
 *
 * Consumer: `BaseAgentHostSessionsProvider` (in `vs/sessions`) resolves the
 * bundle inside `NewSession.eagerCreate` and forwards it on the wire.
 */
export interface IAgentHostActiveClientRegistry {
	readonly _serviceBrand: undefined;

	/**
	 * Registers a resolver for `(clientId, provider)`. Returned disposable
	 * removes the registration. Re-registering replaces the previous resolver.
	 */
	registerResolver(clientId: string, provider: string, resolver: IActiveClientResolver): IDisposable;

	/**
	 * Returns the latest active-client bundle for `(clientId, provider)`, or
	 * `undefined` if no resolver is registered.
	 */
	resolve(clientId: string, provider: string): IActiveClientBundle | undefined;
}

export class AgentHostActiveClientRegistry implements IAgentHostActiveClientRegistry {
	declare readonly _serviceBrand: undefined;

	private readonly _resolvers = new Map<string, IActiveClientResolver>();

	registerResolver(clientId: string, provider: string, resolver: IActiveClientResolver): IDisposable {
		const key = AgentHostActiveClientRegistry._key(clientId, provider);
		this._resolvers.set(key, resolver);
		return toDisposable(() => {
			if (this._resolvers.get(key) === resolver) {
				this._resolvers.delete(key);
			}
		});
	}

	resolve(clientId: string, provider: string): IActiveClientBundle | undefined {
		return this._resolvers.get(AgentHostActiveClientRegistry._key(clientId, provider))?.();
	}

	private static _key(clientId: string, provider: string): string {
		return `${clientId}::${provider}`;
	}
}

registerSingleton(IAgentHostActiveClientRegistry, AgentHostActiveClientRegistry, InstantiationType.Delayed);
