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
import { IRepositorySource, validateRepositories } from '../../../../../../platform/agentHost/common/agentHostRepositorySource.js';
import { getWorkingDirectoryUri } from '../../../../../../platform/agentHost/common/agentHostWorkingDirectories.js';
import { IAgentSubscription } from '../../../../../../platform/agentHost/common/state/agentSubscription.js';
import { RepositoryPreparationCapabilities } from '../../../../../../platform/agentHost/common/state/protocol/common/commands.js';
import { ChatInteractivity, DEFAULT_CHAT_ID, getSessionChatResource, SessionLifecycle, SessionState } from '../../../../../../platform/agentHost/common/state/sessionState.js';

export function getRepositoryPreparationCapability(connection: IAgentConnection): RepositoryPreparationCapabilities | undefined {
	const capability = connection.initializeResult.get()?.repositoryPreparation;
	if (capability === undefined) {
		return undefined;
	}
	if (!capability || typeof capability !== 'object' || Array.isArray(capability)
		|| (capability.revision !== undefined && typeof capability.revision !== 'boolean')
		|| (capability.multipleRepositories !== undefined && typeof capability.multipleRepositories !== 'boolean')) {
		throw new Error(localize('agentHost.invalidRepositoryCapability', "The agent host advertised an invalid repository preparation capability."));
	}
	return capability;
}

/** Preserve HTTPS repository selections without treating ordinary file directories as sources. */
export function getRepositoriesFromSelection(connection: IAgentConnection, selected: URI | undefined): readonly IRepositorySource[] | undefined {
	if (selected?.scheme !== Schemas.https) {
		return undefined;
	}
	const defaultDirectory = connection.initializeResult.get()?.defaultDirectory;
	const defaultScheme = defaultDirectory ? (URI.isUri(defaultDirectory) ? URI.revive(defaultDirectory) : URI.parse(defaultDirectory)).scheme : undefined;
	return defaultScheme !== Schemas.https
		&& getRepositoryPreparationCapability(connection) ? [{ source: selected }] : undefined;
}

/** Resolve provider configuration with typed repository context, without preparing a checkout. */
export async function resolveAgentHostRepositoryConfig(connection: IAgentConnection, provider: string, repositories: readonly IRepositorySource[], config: Record<string, unknown> | undefined, token: CancellationToken): Promise<Record<string, unknown>> {
	if (token.isCancellationRequested) {
		throw new CancellationError();
	}
	const inputs = { repositories, config };
	validateRepositories(inputs, getRepositoryPreparationCapability(connection));
	const resolved = await raceCancellationError(connection.resolveSessionConfig({ provider, ...inputs }), token);
	validateRepositories({ ...inputs, config: resolved.values }, getRepositoryPreparationCapability(connection));
	return resolved.values;
}

export function waitForSessionPreparation(subscription: IAgentSubscription<SessionState>, token: CancellationToken, repositoryCreation = false): Promise<SessionState> {
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
				if (state.lifecycle === SessionLifecycle.Creating) {
					const defaultChat = getSessionChatResource(state, DEFAULT_CHAT_ID);
					const chat = state.chats.find(chat => chat.resource === defaultChat);
					// Native drafts already expose an interactive chat; their first turn materializes the backing session.
					if (repositoryCreation || !chat || chat.interactivity !== undefined && chat.interactivity !== ChatInteractivity.Full) {
						return;
					}
				}
				if (state.lifecycle === SessionLifecycle.Failed) {
					throw new Error(state.creationError?.message ?? localize('agentHost.sessionCreationFailed', "The agent host could not prepare this session."));
				}
				if (repositoryCreation && (state.lifecycle !== SessionLifecycle.Ready
					|| !Array.isArray(state.workingDirectories) || !state.workingDirectories.length
					|| state.workingDirectories.some(directory => !URI.parse(getWorkingDirectoryUri(directory), true).scheme))) {
					throw new Error(localize('agentHost.repositoryNotReady', "The agent host did not report a ready checkout for the selected repository."));
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
