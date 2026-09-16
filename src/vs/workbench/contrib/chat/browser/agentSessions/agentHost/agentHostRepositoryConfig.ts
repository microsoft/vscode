/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { raceCancellationError } from '../../../../../../base/common/async.js';
import { CancellationToken } from '../../../../../../base/common/cancellation.js';
import { CancellationError } from '../../../../../../base/common/errors.js';
import { DisposableStore } from '../../../../../../base/common/lifecycle.js';
import { URI } from '../../../../../../base/common/uri.js';
import { localize } from '../../../../../../nls.js';
import { IAgentConnection } from '../../../../../../platform/agentHost/common/agentService.js';
import { IAgentSubscription } from '../../../../../../platform/agentHost/common/state/agentSubscription.js';
import { ResolveSessionConfigResult } from '../../../../../../platform/agentHost/common/state/protocol/commands.js';
import { JsonRpcErrorCodes } from '../../../../../../platform/agentHost/common/state/protocol/errors.js';
import { ProtocolError } from '../../../../../../platform/agentHost/common/state/sessionProtocol.js';
import { RepositorySessionConfig, SessionConfigSchema } from '../../../../../../platform/agentHost/common/state/protocol/channels-session/state.js';
import { SessionConfigState, SessionLifecycle, SessionState } from '../../../../../../platform/agentHost/common/state/sessionState.js';

/** Read the standard repository intent descriptor without guessing configuration property names. */
export function readRepositorySessionConfig(schema: SessionConfigSchema | undefined): RepositorySessionConfig | undefined {
	const descriptor = schema?.repository;
	if (descriptor === undefined) {
		return undefined;
	}
	const properties = schema?.properties;
	const isInput = (property: string) => properties && Object.hasOwn(properties, property)
		&& properties[property]?.type === 'string' && properties[property].readOnly !== true && properties[property].sessionMutable !== true;
	if (!descriptor || typeof descriptor !== 'object'
		|| typeof descriptor.urlProperty !== 'string' || !descriptor.urlProperty || !isInput(descriptor.urlProperty)
		|| (descriptor.revisionProperty !== undefined && (typeof descriptor.revisionProperty !== 'string'
			|| !descriptor.revisionProperty || descriptor.revisionProperty === descriptor.urlProperty || !isInput(descriptor.revisionProperty)))) {
		throw new Error(localize('agentHost.invalidRepositoryConfig', "The agent host advertised an invalid repository configuration."));
	}
	return descriptor;
}

/** Read repository intent published in session state using the host's descriptor. */
export function getRepositorySessionSource(config: SessionConfigState | undefined): string | undefined {
	const descriptor = readRepositorySessionConfig(config?.schema);
	const value = descriptor && config?.values[descriptor.urlProperty];
	if (value === undefined) {
		return undefined;
	}
	if (typeof value !== 'string' || !value) {
		throw new Error(localize('agentHost.invalidRepositoryValue', "The agent host returned an invalid repository selection."));
	}
	return value;
}

/** Resolve a selected repository through advertised session configuration; absence retains the legacy path. */
export async function resolveAgentHostRepositoryConfig(connection: IAgentConnection, provider: string, repository: URI, config: Record<string, unknown> | undefined, token: CancellationToken): Promise<Record<string, unknown> | undefined> {
	if (token.isCancellationRequested) {
		throw new CancellationError();
	}
	if (!repository.authority || repository.authority.includes('@') || repository.query || repository.fragment) {
		throw new Error(localize('agentHost.invalidRepositoryUri', "Select a repository URL without credentials, a query, or a fragment."));
	}
	let initial: ResolveSessionConfigResult;
	try {
		initial = await raceCancellationError(connection.resolveSessionConfig({ provider, config }), token);
	} catch (error) {
		if (error instanceof ProtocolError && error.code === JsonRpcErrorCodes.MethodNotFound) {
			return undefined;
		}
		throw error;
	}
	const descriptor = readRepositorySessionConfig(initial.schema);
	if (!descriptor) {
		return undefined;
	}
	const url = repository.toString();
	const existing = config?.[descriptor.urlProperty];
	if (existing !== undefined && existing !== url) {
		throw new Error(localize('agentHost.conflictingRepository', "The selected repository conflicts with the session configuration."));
	}
	const requested = { ...initial.values, ...config, [descriptor.urlProperty]: url };
	const resolved = await raceCancellationError(connection.resolveSessionConfig({ provider, config: requested }), token);
	const confirmed = readRepositorySessionConfig(resolved.schema);
	if (!confirmed || confirmed.urlProperty !== descriptor.urlProperty || confirmed.revisionProperty !== descriptor.revisionProperty) {
		throw new Error(localize('agentHost.repositoryConfigChanged', "The agent host changed its repository configuration while resolving the session."));
	}
	return { ...resolved.values, ...config, [descriptor.urlProperty]: url };
}

/** Wait for opted-in repository initialization, preserving other sessions' existing lifecycle handling. */
export function waitForRepositorySessionReady(subscription: IAgentSubscription<SessionState>, token: CancellationToken, expectedRepository?: URI, expectedConfig?: Readonly<Record<string, unknown>>): Promise<SessionState> {
	return new Promise<SessionState>((resolve, reject) => {
		const store = new DisposableStore();
		const fail = (error: unknown) => {
			store.dispose();
			reject(error);
		};
		const check = () => {
			try {
				if (token.isCancellationRequested) {
					throw new CancellationError();
				}
				const state = subscription.value;
				if (state instanceof Error) {
					throw state;
				}
				if (!state) {
					return;
				}
				const repository = getRepositorySessionSource(state.config);
				if (repository !== undefined || expectedRepository) {
					if (state.lifecycle === SessionLifecycle.Creating) {
						return;
					}
					if (state.lifecycle === SessionLifecycle.Failed) {
						throw new Error(state.creationError?.message ?? localize('agentHost.repositoryCreationFailed', "The agent host could not prepare this repository session."));
					}
					const revisionProperty = readRepositorySessionConfig(state.config?.schema)?.revisionProperty;
					const expectedRevision = revisionProperty ? expectedConfig?.[revisionProperty] : undefined;
					const actualRevision = revisionProperty ? state.config?.values[revisionProperty] : undefined;
					if (state.lifecycle !== SessionLifecycle.Ready || !repository
						|| (expectedRepository && repository !== expectedRepository.toString())
						|| (expectedRevision !== undefined && actualRevision !== expectedRevision)
						|| !Array.isArray(state.workingDirectories) || !state.workingDirectories.length
						|| state.workingDirectories.some(directory => typeof directory !== 'string' || !URI.parse(directory).scheme)) {
						throw new Error(localize('agentHost.repositoryNotReady', "The agent host did not report a ready checkout for the selected repository."));
					}
				}
				store.dispose();
				resolve(state);
			} catch (error) {
				fail(error);
			}
		};
		store.add(subscription.onDidChange(check));
		if (subscription.onDidError) {
			store.add(subscription.onDidError(fail));
		}
		store.add(token.onCancellationRequested(check));
		check();
	});
}
