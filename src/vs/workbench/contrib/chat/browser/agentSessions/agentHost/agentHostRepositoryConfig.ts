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
import { SessionConfigKey } from '../../../../../../platform/agentHost/common/sessionConfigKeys.js';
import { IAgentSubscription } from '../../../../../../platform/agentHost/common/state/agentSubscription.js';
import { ResolveSessionConfigResult } from '../../../../../../platform/agentHost/common/state/protocol/commands.js';
import { JsonRpcErrorCodes } from '../../../../../../platform/agentHost/common/state/protocol/errors.js';
import { ProtocolError } from '../../../../../../platform/agentHost/common/state/sessionProtocol.js';
import { SessionConfigSchema } from '../../../../../../platform/agentHost/common/state/protocol/channels-session/state.js';
import { SessionConfigState, SessionLifecycle, SessionState } from '../../../../../../platform/agentHost/common/state/sessionState.js';

/** Validate the standard repository inputs advertised in the configuration schema. */
export function supportsRepositorySessionConfig(schema: SessionConfigSchema | undefined): boolean {
	const properties = schema?.properties;
	const hasSource = properties && Object.hasOwn(properties, SessionConfigKey.RepositorySource);
	const hasRevision = properties && Object.hasOwn(properties, SessionConfigKey.RepositoryRevision);
	if (!hasSource && !hasRevision) {
		return false;
	}
	const isInput = (property: string) => properties?.[property]?.type === 'string'
		&& properties[property].readOnly !== true && properties[property].sessionMutable !== true;
	if (!hasSource || !isInput(SessionConfigKey.RepositorySource) || (hasRevision && !isInput(SessionConfigKey.RepositoryRevision))) {
		throw new Error(localize('agentHost.invalidRepositoryConfig', "The agent host advertised an invalid repository configuration."));
	}
	return true;
}

/** Read the standard repository source and validate its optional revision. */
export function getRepositorySessionSource(config: SessionConfigState | undefined): string | undefined {
	const supported = supportsRepositorySessionConfig(config?.schema);
	const value = config?.values[SessionConfigKey.RepositorySource];
	const revision = config?.values[SessionConfigKey.RepositoryRevision];
	if (value === undefined && revision === undefined) {
		return undefined;
	}
	if (!supported || typeof value !== 'string' || !value.trim()) {
		throw new Error(localize('agentHost.invalidRepositoryValue', "The agent host returned an invalid repository selection."));
	}
	if (revision !== undefined) {
		if (!config || !Object.hasOwn(config.schema.properties, SessionConfigKey.RepositoryRevision)) {
			throw new Error(localize('agentHost.unsupportedRepositoryRevision', "The agent host does not advertise repository revision selection."));
		}
		if (typeof revision !== 'string' || !revision.trim()) {
			throw new Error(localize('agentHost.invalidRepositoryRevision', "The repository revision must be a nonempty string."));
		}
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
	const source = repository.toString();
	const existing = config?.[SessionConfigKey.RepositorySource];
	if (existing !== undefined && existing !== source) {
		throw new Error(localize('agentHost.conflictingRepository', "The selected repository conflicts with the session configuration."));
	}
	const hasExplicitRepositoryConfig = existing !== undefined || config?.[SessionConfigKey.RepositoryRevision] !== undefined;
	let initial: ResolveSessionConfigResult;
	try {
		initial = await raceCancellationError(connection.resolveSessionConfig({ provider, config }), token);
	} catch (error) {
		if (error instanceof ProtocolError && error.code === JsonRpcErrorCodes.MethodNotFound && !hasExplicitRepositoryConfig) {
			return undefined;
		}
		throw error;
	}
	if (!supportsRepositorySessionConfig(initial.schema)) {
		if (hasExplicitRepositoryConfig) {
			throw new Error(localize('agentHost.unsupportedRepositoryConfig', "The agent host does not advertise repository-backed session creation."));
		}
		return undefined;
	}
	const requested = { ...initial.values, ...config, [SessionConfigKey.RepositorySource]: source };
	getRepositorySessionSource({ schema: initial.schema, values: requested });
	const resolved = await raceCancellationError(connection.resolveSessionConfig({ provider, config: requested }), token);
	if (!supportsRepositorySessionConfig(resolved.schema)) {
		throw new Error(localize('agentHost.repositoryConfigChanged', "The agent host changed its repository configuration while resolving the session."));
	}
	const values = { ...resolved.values, ...config, [SessionConfigKey.RepositorySource]: source };
	getRepositorySessionSource({ schema: resolved.schema, values });
	return values;
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
					const expectedRevision = expectedConfig?.[SessionConfigKey.RepositoryRevision];
					const actualRevision = state.config?.values[SessionConfigKey.RepositoryRevision];
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
