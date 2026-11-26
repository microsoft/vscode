/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { IDisposable, DisposableMap, DisposableStore, MutableDisposable } from '../../../../../../base/common/lifecycle.js';
import { autorun } from '../../../../../../base/common/observable.js';
import { IInstantiationService, ServicesAccessor } from '../../../../../../platform/instantiation/common/instantiation.js';
import { AgentHostContribution } from '../../../../chat/browser/agentSessions/agentHost/agentHostChatContribution.js';
import { IAgentHostSessionWorkingDirectoryResolver } from '../../../../chat/browser/agentSessions/agentHost/agentHostSessionWorkingDirectoryResolver.js';
import { ISessionsProvidersService } from '../../../browser/sessionsProvidersService.js';
import { SessionStatus } from '../../../../../services/sessions/common/session.js';
import { IAgentHostEnablementService } from '../../../../../../platform/agentHost/common/agentHostEnablementService.js';
import { LocalAgentHostSessionsProvider } from './localAgentHostSessionsProvider.js';

/**
 * Registers the {@link LocalAgentHostSessionsProvider} while the Agent Host is available in this runtime, with the working
 * directory resolvers of its session types, until the returned disposable is disposed.
 *
 * {@link AgentHostContribution} handles all the heavy lifting — agent discovery,
 * session handler registration, language model providers, customization harness —
 * via {@link IChatSessionsService}. This only bridges the session
 * listing and lifecycle to the {@link ISessionsProvidersService} layer used by
 * the sessions UI.
 *
 * Call it once per window, from the one module or contribution that owns these registrations: its registrations are
 * global, and registering them twice throws or duplicates them.
 */
export function registerLocalAgentHostSessionsProvider(accessor: ServicesAccessor): IDisposable {
	const agentHostEnablementService = accessor.get(IAgentHostEnablementService);
	const instantiationService = accessor.get(IInstantiationService);
	const sessionsProvidersService = accessor.get(ISessionsProvidersService);
	const workingDirectoryResolver = accessor.get(IAgentHostSessionWorkingDirectoryResolver);

	const disposables = new DisposableStore();

	const registration = disposables.add(new MutableDisposable<DisposableStore>());
	const initialize = () => {
		if (registration.value) {
			return;
		}
		const store = new DisposableStore();
		const provider = store.add(instantiationService.createInstance(LocalAgentHostSessionsProvider));
		store.add(sessionsProvidersService.registerProvider(provider));

		const resolverRegistrations = store.add(new DisposableMap<string>());
		const registerResolvers = () => {
			const sessionTypeIds = new Set(provider.sessionTypes.map(sessionType => `agent-host-${sessionType.id}`));
			for (const [sessionTypeId] of resolverRegistrations) {
				if (!sessionTypeIds.has(sessionTypeId)) {
					resolverRegistrations.deleteAndDispose(sessionTypeId);
				}
			}

			for (const sessionType of provider.sessionTypes) {
				const resourceScheme = `agent-host-${sessionType.id}`;
				if (resolverRegistrations.has(resourceScheme)) {
					continue;
				}
				resolverRegistrations.set(resourceScheme, workingDirectoryResolver.registerResolver(resourceScheme, sessionResource => {
					return provider.getSessionByResource(sessionResource)?.workspace.get()?.folders[0]?.workingDirectory;
				}, sessionResource => {
					return provider.getSessionByResource(sessionResource)?.status.get() === SessionStatus.Untitled;
				}));
			}
		};
		registerResolvers();
		store.add(provider.onDidChangeSessionTypes(registerResolvers));
		registration.value = store;
	};

	disposables.add(autorun(reader => {
		if (agentHostEnablementService.enabled.read(reader)) {
			initialize();
		} else {
			registration.clear();
		}
	}));
	return disposables;
}
