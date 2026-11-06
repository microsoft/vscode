/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { autorun, constObservable, IObservable, observableValue } from '../../../../../base/common/observable.js';
import { Emitter, Event } from '../../../../../base/common/event.js';
import { URI } from '../../../../../base/common/uri.js';
import { mock, upcastPartial } from '../../../../../base/test/common/mock.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { IAgentHostSessionsProvider, IAgentMergeClientState } from '../../common/agentHostSessionsProvider.js';
import { getSessionAgentMergeConfigurationObservable, getSessionAgentMergeStateObservable } from '../../browser/sessionAgentMerge.js';
import { ArtifactIntegrationsSettingId } from '../../../../../platform/artifactIntegrations/common/artifactIntegration.js';
import { IConfigurationChangeEvent } from '../../../../../platform/configuration/common/configuration.js';
import { TestConfigurationService } from '../../../../../platform/configuration/test/common/testConfigurationService.js';
import { ISessionsProvidersService } from '../../browser/sessionsProvidersService.js';
import { IChat, ISession } from '../../../../services/sessions/common/session.js';
import { ISessionsProvider } from '../../common/sessionsProvider.js';

suite('sessionAgentMerge', () => {

	const store = ensureNoDisposablesAreLeakedInTestSuite();

	test('reads the Agent Merge state of the folder a chat works in, sharing the session folder with the main chat', () => {
		const requests: Array<string | undefined> = [];
		const provider: ISessionsProvider = new class extends mock<IAgentHostSessionsProvider>() {
			override readonly id = 'local-agent-host';
			override readonly onDidChangeSessions = Event.None;
			override getAgentMergeClientStateObservable(_sessionId: string, chat?: URI): IObservable<IAgentMergeClientState | undefined> {
				requests.push(chat?.toString());
				return constObservable({ enabled: chat !== undefined });
			}
			override readonly onDidChangeSessionConfig = Event.None;
		};
		const providers = new class extends mock<ISessionsProvidersService>() {
			override readonly onDidChangeProviders = Event.None;
			override getProvider<T extends ISessionsProvider>(providerId: string): T | undefined {
				return providerId === provider.id ? provider as T : undefined;
			}
		};
		const mainChat = { resource: URI.parse('agent-host-session:/session#main') } as IChat;
		const peerChat = { resource: URI.parse('agent-host-session:/session#peer') } as IChat;
		const session = { sessionId: 'session', providerId: provider.id, mainChat: constObservable(mainChat) } as unknown as ISession;

		const sessionFolder = getSessionAgentMergeStateObservable(session, providers);
		const mainChatFolder = getSessionAgentMergeStateObservable(session, providers, mainChat);
		const peerChatFolder = getSessionAgentMergeStateObservable(session, providers, peerChat);
		const peerChatFolderAgain = getSessionAgentMergeStateObservable(session, providers, peerChat);

		assert.deepStrictEqual({
			requests,
			mainChatSharesSessionFolder: mainChatFolder === sessionFolder,
			peerChatCached: peerChatFolderAgain === peerChatFolder,
			enabled: [sessionFolder.get()?.enabled, peerChatFolder.get()?.enabled],
		}, {
			requests: [undefined, peerChat.resource.toString()],
			mainChatSharesSessionFolder: true,
			peerChatCached: true,
			enabled: [false, true],
		});
	});

	test('integration mode hides effective Agent Merge state without changing the saved session choice', async () => {
		const saved = constObservable({ enabled: true });
		const provider: ISessionsProvider = new class extends mock<IAgentHostSessionsProvider>() {
			override readonly id = 'local-agent-host';
			override readonly onDidChangeSessions = Event.None;
			override getAgentMergeClientStateObservable() { return saved; }
			override readonly onDidChangeSessionConfig = Event.None;
		}();
		const providers = new class extends mock<ISessionsProvidersService>() {
			override readonly onDidChangeProviders = Event.None;
			override getProvider<T extends ISessionsProvider>() { return provider as T; }
		}();
		const mainChat = upcastPartial<IChat>({ resource: URI.parse('agent-host-session:/session#main') });
		const session = upcastPartial<ISession>({ sessionId: 'session', providerId: provider.id, mainChat: constObservable(mainChat) });
		const configuration = new TestConfigurationService();
		store.add(configuration.onDidChangeConfigurationEmitter);
		const state = getSessionAgentMergeConfigurationObservable(session, providers, configuration);
		const states = [state.get()?.enabled];
		for (const enabled of [true, false]) {
			await configuration.setUserConfiguration(ArtifactIntegrationsSettingId, enabled);
			configuration.onDidChangeConfigurationEmitter.fire(upcastPartial<IConfigurationChangeEvent>({ affectsConfiguration: setting => setting === ArtifactIntegrationsSettingId }));
			states.push(state.get()?.enabled);
		}
		assert.deepStrictEqual({ states, saved: saved.get().enabled }, { states: [true, false, true], saved: true });
	});

	test('existing state and configuration subscribers follow a runtime acquired behind a stable catalog', () => {
		const changes = store.add(new Emitter<{ added: ISession[]; changed: ISession[]; removed: ISession[] }>());
		const configChanges = store.add(new Emitter<string>());
		const runtimeState = observableValue<IAgentMergeClientState | undefined>('runtimeMerge', { enabled: true });
		const catalog = new class extends mock<IAgentHostSessionsProvider>() {
			override readonly id = 'agenthost-cloud-tasks';
			override readonly onDidChangeSessions = changes.event;
			override readonly onDidChangeSessionConfig = configChanges.event;
			override getAgentMergeClientStateObservable() { return constObservable(undefined); }
		}();
		const runtime = new class extends mock<IAgentHostSessionsProvider>() {
			override readonly id = catalog.id;
			override getAgentMergeClientStateObservable() { return runtimeState; }
		}();
		let acquired = false;
		const providers = new class extends mock<ISessionsProvidersService>() {
			override readonly onDidChangeProviders = Event.None;
			override getProvider<T extends ISessionsProvider>(_id: string, sessionId?: string) {
				const provider: ISessionsProvider = sessionId && acquired ? runtime : catalog;
				return provider as T;
			}
		}();
		const chat = upcastPartial<IChat>({ resource: URI.parse('cloud-sandbox-task:/task') });
		const session = upcastPartial<ISession>({ sessionId: 'task', providerId: catalog.id, mainChat: constObservable(chat) });
		const configuration = new TestConfigurationService();
		store.add(configuration.onDidChangeConfigurationEmitter);
		const state = getSessionAgentMergeStateObservable(session, providers);
		const effective = getSessionAgentMergeConfigurationObservable(session, providers, configuration);
		const observed: (boolean | undefined)[][] = [];
		store.add(autorun(reader => observed.push([state.read(reader)?.enabled, effective.read(reader)?.enabled])));
		acquired = true;
		configChanges.fire(session.sessionId);
		runtimeState.set({ enabled: false }, undefined);
		acquired = false;
		changes.fire({ added: [], changed: [session], removed: [] });
		assert.deepStrictEqual({
			observed,
			stateCached: getSessionAgentMergeStateObservable(session, providers) === state,
			configurationCached: getSessionAgentMergeConfigurationObservable(session, providers, configuration) === effective,
		}, { observed: [[undefined, false], [true, true], [false, false], [undefined, false]], stateCached: true, configurationCached: true });
	});
});
