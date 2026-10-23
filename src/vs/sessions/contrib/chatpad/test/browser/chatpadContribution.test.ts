/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { timeout } from '../../../../../base/common/async.js';
import { Emitter } from '../../../../../base/common/event.js';
import { DisposableStore } from '../../../../../base/common/lifecycle.js';
import { observableValue } from '../../../../../base/common/observable.js';
import { URI } from '../../../../../base/common/uri.js';
import { ensureNoDisposablesAreLeakedInTestSuite, runWithFakedTimers } from '../../../../../base/test/common/utils.js';
import { CommandsRegistry } from '../../../../../platform/commands/common/commands.js';
import { IConfigurationService } from '../../../../../platform/configuration/common/configuration.js';
import { TestConfigurationService } from '../../../../../platform/configuration/test/common/testConfigurationService.js';
import { ContextKeyService } from '../../../../../platform/contextkey/browser/contextKeyService.js';
import { IContextKeyService } from '../../../../../platform/contextkey/common/contextkey.js';
import { IDialogService } from '../../../../../platform/dialogs/common/dialogs.js';
import { TestInstantiationService } from '../../../../../platform/instantiation/test/common/instantiationServiceMock.js';
import { ILogService, NullLogService } from '../../../../../platform/log/common/log.js';
import { INotificationService } from '../../../../../platform/notification/common/notification.js';
import { IQuickInputService } from '../../../../../platform/quickinput/common/quickInput.js';
import { IStorageService, InMemoryStorageService, StorageScope, StorageTarget } from '../../../../../platform/storage/common/storage.js';
import { IsSessionsWindowContext } from '../../../../../workbench/common/contextkeys.js';
import { ChatContextKeys } from '../../../../../workbench/contrib/chat/common/actions/chatContextKeys.js';
import { IChatEntitlementService } from '../../../../../workbench/services/chat/common/chatEntitlementService.js';
import { IChatWindowService } from '../../../../services/chatWindow/browser/chatWindowService.js';
import { ISessionsProvidersService } from '../../../../services/sessions/browser/sessionsProvidersService.js';
import { ISessionsService } from '../../../../services/sessions/browser/sessionsService.js';
import { ISessionsManagementService } from '../../../../services/sessions/common/sessionsManagement.js';
import type { ISessionsProvider } from '../../../../services/sessions/common/sessionsProvider.js';
import { CHATPAD_CHAT_WINDOW_KIND, CHATPAD_ENABLED_SETTING, ChatpadProviderContext } from '../../browser/chatpad.js';
import { ChatpadRestoration, ChatpadProviderContextContribution } from '../../browser/chatpad.contribution.js';

interface IFakeProvider {
	readonly id: string;
	readonly calls: string[];
	getChatpad?(): Promise<unknown>;
	appendToChatpad?(text: string): Promise<void>;
}

suite('Chatpad contribution', () => {

	const store = ensureNoDisposablesAreLeakedInTestSuite();
	const note = URI.file('/chats/1/chatpad.md');
	const OPEN_KEY = 'sessions.chatpad.open';

	let providers: IFakeProvider[];
	let onDidChangeProviders: Emitter<void>;
	let opened: unknown[];
	let windows: ReturnType<typeof observableValue<readonly { kind: unknown }[]>>;
	let messages: string[];
	let storage: InMemoryStorageService;
	let contextKeyService: ContextKeyService;
	let instantiationService: TestInstantiationService;
	let setting: boolean;
	let hidden: boolean;
	let confirmed: boolean;
	let activeWindow: unknown;
	let deleted: string[];
	let deleteFails: boolean;

	function localProvider(calls: string[], options?: { fails?: boolean; unavailable?: boolean }): IFakeProvider {
		return {
			id: 'local', calls,
			async getChatpad() {
				calls.push('getChatpad');
				if (options?.fails) {
					throw new Error('boom');
				}
				return options?.unavailable ? undefined : { note, session: { sessionId: 'local:/1', providerId: 'local' } };
			},
			async appendToChatpad(text: string) { calls.push(`append:${text}`); },
		};
	}

	function remoteProvider(calls: string[]): IFakeProvider {
		return { id: 'remote', calls };
	}

	function setup(): void {
		providers = [];
		opened = [];
		messages = [];
		setting = true;
		hidden = false;
		confirmed = true;
		activeWindow = undefined;
		deleted = [];
		deleteFails = false;
		onDidChangeProviders = store.add(new Emitter<void>());
		windows = observableValue('windows', []);
		storage = store.add(new InMemoryStorageService());
		const configurationService = new TestConfigurationService({ [CHATPAD_ENABLED_SETTING]: true });
		contextKeyService = store.add(new ContextKeyService(configurationService));
		ChatContextKeys.enabled.bindTo(contextKeyService).set(true);
		IsSessionsWindowContext.bindTo(contextKeyService).set(true);

		instantiationService = store.add(new TestInstantiationService());
		instantiationService.stub(IConfigurationService, { getValue: () => setting, onDidChangeConfiguration: new Emitter<never>().event } as Partial<IConfigurationService>);
		instantiationService.stub(IContextKeyService, contextKeyService);
		instantiationService.stub(ILogService, new NullLogService());
		instantiationService.stub(IStorageService, storage);
		instantiationService.stub(INotificationService, {
			info: (message: string) => { messages.push(`info:${message}`); },
			error: (message: string) => { messages.push(`error:${message}`); },
		} as Partial<INotificationService>);
		instantiationService.stub(IQuickInputService, { input: async () => 'typed' } as Partial<IQuickInputService>);
		instantiationService.stub(IDialogService, { confirm: async () => ({ confirmed }) } as Partial<IDialogService>);
		instantiationService.stub(IChatEntitlementService, { get sentiment() { return { hidden }; } } as Partial<IChatEntitlementService>);
		instantiationService.stub(ISessionsService, { initialRestoreComplete: observableValue('restored', true) } as Partial<ISessionsService>);
		instantiationService.stub(ISessionsManagementService, {
			getSession: () => ({ sessionId: 'local:/1', providerId: 'local' }),
			deleteSession: async (session: { sessionId: string }) => { if (deleteFails) { throw new Error('boom'); } deleted.push(session.sessionId); },
		} as unknown as Partial<ISessionsManagementService>);
		instantiationService.stub(ISessionsProvidersService, {
			getProviders: () => providers as unknown as ISessionsProvider[],
			getProvider: (id: string) => providers.find(provider => provider.id === id),
			onDidChangeProviders: onDidChangeProviders.event,
		} as unknown as Partial<ISessionsProvidersService>);
		instantiationService.stub(IChatWindowService, {
			windows,
			getActiveWindow: () => activeWindow,
			open: async (_kind: unknown, content: unknown) => { opened.push(content); return undefined; },
		} as unknown as Partial<IChatWindowService>);
	}

	function runCommand(id: string): Promise<void> {
		return instantiationService.invokeFunction(accessor => CommandsRegistry.getCommand(id)!.handler(accessor));
	}

	function setProviderKey(value: boolean): void {
		ChatpadProviderContext.bindTo(contextKeyService).set(value);
	}

	setup();
	teardown(() => setup());

	test('only the local provider is asked, to open and to append', async () => {
		const localCalls: string[] = [];
		const remoteCalls: string[] = [];
		providers = [remoteProvider(remoteCalls), localProvider(localCalls)];
		setProviderKey(true);

		await runCommand('sessions.openChatpad');
		await runCommand('sessions.appendToChatpad');

		assert.deepStrictEqual({ localCalls, remoteCalls, opened: opened.length, messages }, {
			localCalls: ['getChatpad', 'getChatpad', 'append:typed'], remoteCalls: [], opened: 1, messages: [],
		});
	});

	test('open without a provider says it is not available, and a failure shows the error', async () => {
		providers = [remoteProvider([])];
		setProviderKey(true);
		await runCommand('sessions.openChatpad');
		const withoutProvider = messages.splice(0);

		providers = [localProvider([], { unavailable: true })];
		await runCommand('sessions.openChatpad');
		const unavailable = messages.splice(0);

		providers = [localProvider([], { fails: true })];
		await runCommand('sessions.openChatpad');

		assert.deepStrictEqual({ withoutProvider, unavailable, failed: messages, opened: opened.length }, {
			withoutProvider: ['info:The Chatpad is not available.'],
			unavailable: ['info:The Chatpad is not available.'],
			failed: ['error:Could not open the Chatpad.'],
			opened: 0,
		});
	});

	test('does nothing when the setting is off', async () => {
		providers = [localProvider([])];
		setProviderKey(true);
		contextKeyService.setContext('config.sessions.chatpad.enabled', false);
		await runCommand('sessions.openChatpad');
		assert.deepStrictEqual({ opened: opened.length, messages }, { opened: 0, messages: [] });
	});

	function chatpadWindow(replaced: unknown[]) {
		return {
			kind: CHATPAD_CHAT_WINDOW_KIND,
			content: observableValue('content', { session: URI.parse('local:/1') }),
			replace: async (content: Promise<unknown>) => { replaced.push(await content); },
		};
	}

	test('Clear does nothing without a Chatpad window, or when not confirmed', async () => {
		providers = [localProvider([])];
		setProviderKey(true);
		await runCommand('sessions.chatpad.clear');
		const replaced: unknown[] = [];
		activeWindow = chatpadWindow(replaced);
		confirmed = false;
		await runCommand('sessions.chatpad.clear');
		assert.deepStrictEqual({ replaced: replaced.length, deleted, messages }, { replaced: 0, deleted: [], messages: [] });
	});

	test('Clear deletes the Chatpad chat and shows a new Chatpad in its window', async () => {
		providers = [localProvider([])];
		setProviderKey(true);
		const replaced: unknown[] = [];
		activeWindow = chatpadWindow(replaced);
		await runCommand('sessions.chatpad.clear');
		assert.deepStrictEqual({ replaced: replaced.length, deleted, messages }, { replaced: 1, deleted: ['local:/1'], messages: [] });
	});

	test('Clear shows an error when it fails', async () => {
		providers = [localProvider([])];
		setProviderKey(true);
		activeWindow = chatpadWindow([]);
		deleteFails = true;
		await runCommand('sessions.chatpad.clear');
		assert.deepStrictEqual({ deleted, messages }, { deleted: [], messages: ['error:Could not clear the Chatpad.'] });
	});

	test('the provider key follows the providers that implement the Chatpad', () => {
		providers = [remoteProvider([])];
		const keyStore = store.add(new DisposableStore());
		const contribution = keyStore.add(instantiationService.createInstance(ChatpadProviderContextContribution));
		const read = () => contextKeyService.getContextKeyValue<boolean>(ChatpadProviderContext.key);
		const before = read();
		providers = [remoteProvider([]), localProvider([])];
		onDidChangeProviders.fire();
		const after = read();
		assert.deepStrictEqual({ before, after }, { before: false, after: true });
		assert.ok(contribution);
	});

	suite('restore', () => {

		test('opens the Chatpad when it was open, once a local provider is there', () => runWithFakedTimers<void>({ useFakeTimers: true }, async () => {
			storage.store(OPEN_KEY, true, StorageScope.WORKSPACE, StorageTarget.MACHINE);
			const remoteCalls: string[] = [];
			providers = [remoteProvider(remoteCalls)];
			setProviderKey(true);
			store.add(instantiationService.createInstance(ChatpadRestoration));
			await timeout(1000);
			const beforeLocal = opened.length;

			providers = [remoteProvider(remoteCalls), localProvider([])];
			onDidChangeProviders.fire();
			await timeout(0);

			assert.deepStrictEqual({ beforeLocal, opened: opened.length, remoteCalls }, { beforeLocal: 0, opened: 1, remoteCalls: [] });
		}));

		test('gives up after the timeout', () => runWithFakedTimers<void>({ useFakeTimers: true }, async () => {
			storage.store(OPEN_KEY, true, StorageScope.WORKSPACE, StorageTarget.MACHINE);
			providers = [];
			store.add(instantiationService.createInstance(ChatpadRestoration));
			await timeout(31_000);

			providers = [localProvider([])];
			onDidChangeProviders.fire();
			await timeout(0);

			assert.strictEqual(opened.length, 0);
		}));

		test('keeps the stored state while the setting is off or AI features are hidden', () => runWithFakedTimers<void>({ useFakeTimers: true }, async () => {
			storage.store(OPEN_KEY, true, StorageScope.WORKSPACE, StorageTarget.MACHINE);
			providers = [localProvider([])];
			setProviderKey(true);
			setting = false;
			const restoration = store.add(instantiationService.createInstance(ChatpadRestoration));
			await timeout(0);
			await storage.flush();

			assert.deepStrictEqual({ opened: opened.length, stored: storage.getBoolean(OPEN_KEY, StorageScope.WORKSPACE, false) }, { opened: 0, stored: true });
			assert.ok(restoration);
		}));
	});
});
