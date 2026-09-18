/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { raceCancellationError } from '../../../../../../base/common/async.js';
import { CancellationToken } from '../../../../../../base/common/cancellation.js';
import { CancellationError } from '../../../../../../base/common/errors.js';
import { DisposableStore } from '../../../../../../base/common/lifecycle.js';
import { Schemas } from '../../../../../../base/common/network.js';
import { URI } from '../../../../../../base/common/uri.js';
import { localize } from '../../../../../../nls.js';
import { IAgentConnection } from '../../../../../../platform/agentHost/common/agentService.js';
import { validateRepositorySource } from '../../../../../../platform/agentHost/common/agentHostRepositorySource.js';
import { IAgentSubscription } from '../../../../../../platform/agentHost/common/state/agentSubscription.js';
import { RepositorySourceCapability } from '../../../../../../platform/agentHost/common/state/protocol/channels-root/state.js';
import { SessionLifecycle, SessionState } from '../../../../../../platform/agentHost/common/state/sessionState.js';

/** Read the per-agent capability, independently of provider configuration. */
export function getRepositorySourceCapability(connection: IAgentConnection, provider: string): RepositorySourceCapability | undefined {
	const root = connection.rootState.value;
	if (root instanceof Error) {
		throw root;
	}
	const capability = root?.agents.find(agent => agent.provider === provider)?.capabilities?.repositorySource;
	if (capability === undefined) {
		return undefined;
	}
	if (!capability || typeof capability !== 'object' || Array.isArray(capability)
		|| (capability.revision !== undefined && typeof capability.revision !== 'boolean')) {
		throw new Error(localize('agentHost.invalidRepositoryCapability', "The agent host advertised an invalid repository source capability."));
	}
	return capability;
}

/** Preserve HTTPS repository selections without treating ordinary file directories as sources. */
export function getRepositorySourceFromSelection(connection: IAgentConnection, provider: string, selected: URI | undefined): URI | undefined {
	if (selected?.scheme !== Schemas.https) {
		return undefined;
	}
	const defaultDirectory = connection.initializeResult.get()?.defaultDirectory;
	const defaultScheme = defaultDirectory ? (URI.isUri(defaultDirectory) ? URI.revive(defaultDirectory) : URI.parse(defaultDirectory)).scheme : undefined;
	return defaultScheme !== Schemas.https
		&& getRepositorySourceCapability(connection, provider) ? selected : undefined;
}

/** Read immutable requested intent from session metadata, including restored sessions. */
export function getRepositorySessionSource(state: Pick<SessionState, 'repositorySource' | 'repositoryRevision'> | undefined): string | undefined {
	const value = state?.repositorySource;
	const revision = state?.repositoryRevision;
	if (value === undefined && revision === undefined) {
		return undefined;
	}
	if (typeof value !== 'string' || !value.trim()) {
		throw new Error(localize('agentHost.invalidRepositoryValue', "The agent host returned an invalid repository selection."));
	}
	if (revision !== undefined && (typeof revision !== 'string' || !revision.trim())) {
		throw new Error(localize('agentHost.invalidRepositoryRevision', "The repository revision must be a nonempty string."));
	}
	return value;
}

/** Resolve provider configuration with typed repository context, without preparing a checkout. */
export async function resolveAgentHostRepositoryConfig(connection: IAgentConnection, provider: string, repository: URI, config: Record<string, unknown> | undefined, token: CancellationToken, revision?: string): Promise<Record<string, unknown>> {
	if (token.isCancellationRequested) {
		throw new CancellationError();
	}
	const inputs = { repositorySource: repository, ...(revision !== undefined ? { repositoryRevision: revision } : {}), config };
	validateRepositorySource(inputs, getRepositorySourceCapability(connection, provider));
	const resolved = await raceCancellationError(connection.resolveSessionConfig({ provider, ...inputs }), token);
	validateRepositorySource({ ...inputs, config: resolved.values }, getRepositorySourceCapability(connection, provider));
	return resolved.values;
}

/** Wait for opted-in repository initialization, preserving other sessions' existing lifecycle handling. */
export function waitForRepositorySessionReady(subscription: IAgentSubscription<SessionState>, token: CancellationToken, expectedRepository?: URI, expectedRevision?: string): Promise<SessionState> {
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
				const repository = getRepositorySessionSource(state);
				if (repository !== undefined || expectedRepository) {
					if (state.lifecycle === SessionLifecycle.Creating) {
						return;
					}
					if (state.lifecycle === SessionLifecycle.Failed) {
						throw new Error(state.creationError?.message ?? localize('agentHost.repositoryCreationFailed', "The agent host could not prepare this repository session."));
					}
					const actualRevision = state.repositoryRevision;
					if (state.lifecycle !== SessionLifecycle.Ready || !repository
						|| (expectedRepository && repository !== expectedRepository.toString())
						|| ((expectedRepository !== undefined || expectedRevision !== undefined) && actualRevision !== expectedRevision)
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
