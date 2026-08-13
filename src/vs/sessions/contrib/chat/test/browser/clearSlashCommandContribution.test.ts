/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { CancellationToken } from '../../../../../base/common/cancellation.js';
import { Event } from '../../../../../base/common/event.js';
import { DisposableStore, toDisposable } from '../../../../../base/common/lifecycle.js';
import { constObservable } from '../../../../../base/common/observable.js';
import { URI } from '../../../../../base/common/uri.js';
import { upcastPartial } from '../../../../../base/test/common/mock.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { ChatSessionArchiveActionWordingSettingId } from '../../../../../platform/chat/common/sessionArchiveActions.js';
import { IConfigurationChangeEvent, IConfigurationService } from '../../../../../platform/configuration/common/configuration.js';
import { TestConfigurationService } from '../../../../../platform/configuration/test/common/testConfigurationService.js';
import { TestInstantiationService } from '../../../../../platform/instantiation/test/common/instantiationServiceMock.js';
import { ILogService, NullLogService } from '../../../../../platform/log/common/log.js';
import { INotificationService, NoOpNotification } from '../../../../../platform/notification/common/notification.js';
import { ChatAgentLocation } from '../../../../../workbench/contrib/chat/common/constants.js';
import { IChatSlashCallback, IChatSlashCommandService, IChatSlashData } from '../../../../../workbench/contrib/chat/common/participants/chatSlashCommands.js';
import { IWorkbenchEnvironmentService } from '../../../../../workbench/services/environment/common/environmentService.js';
import { ISessionsService } from '../../../../services/sessions/browser/sessionsService.js';
import { IChat, ISession } from '../../../../services/sessions/common/session.js';
import { ISessionsManagementService } from '../../../../services/sessions/common/sessionsManagement.js';
import { ClearSlashCommandContribution } from '../../browser/clearSlashCommand.contribution.js';

suite('ClearSlashCommandContribution', () => {
	const disposables = ensureNoDisposablesAreLeakedInTestSuite();

	interface ISetupOptions {
		readonly isSessionsWindow?: boolean;
		readonly isArchived?: boolean;
		readonly knownChatResource?: boolean;
	}

	function setup(store: DisposableStore, options: ISetupOptions = {}) {
		const { isSessionsWindow = true, isArchived = false, knownChatResource = true } = options;

		const instantiationService = store.add(new TestInstantiationService());
		const registrations: { data: IChatSlashData; callback: IChatSlashCallback }[] = [];
		let disposedRegistrations = 0;
		instantiationService.stub(IChatSlashCommandService, {
			_serviceBrand: undefined,
			onDidChangeCommands: Event.None,
			registerSlashCommand: (data, callback) => {
				registrations.push({ data, callback });
				return toDisposable(() => disposedRegistrations++);
			},
			executeCommand: async () => undefined,
			getCommands: () => [],
			hasCommand: () => false,
		});
		instantiationService.stub(IWorkbenchEnvironmentService, upcastPartial<IWorkbenchEnvironmentService>({ isSessionsWindow }));

		const chat = upcastPartial<IChat>({ resource: URI.parse('test:///chat/main') });
		const session = upcastPartial<ISession>({
			sessionId: 'session',
			resource: URI.parse('test:///session'),
			isArchived: constObservable(isArchived),
		});

		const callOrder: string[] = [];
		instantiationService.stub(ISessionsManagementService, upcastPartial<ISessionsManagementService>({
			getSessionForChatResource: resource => knownChatResource && resource.toString() === chat.resource.toString()
				? { session, chat }
				: undefined,
			archiveSession: async archived => {
				callOrder.push(`archive:${archived.sessionId}`);
			},
		}));
		instantiationService.stub(ISessionsService, upcastPartial<ISessionsService>({
			openNewSession: async () => {
				callOrder.push('openNewSession');
				return { session: undefined, trustDeclined: false };
			},
		}));

		const warnings: string[] = [];
		instantiationService.stub(INotificationService, upcastPartial<INotificationService>({
			warn: (message: string) => {
				warnings.push(message);
				return new NoOpNotification();
			},
		}));
		instantiationService.stub(ILogService, new NullLogService());

		const configurationService = new TestConfigurationService();
		instantiationService.stub(IConfigurationService, configurationService);

		const contribution = store.add(instantiationService.createInstance(ClearSlashCommandContribution));

		return {
			contribution,
			chat,
			session,
			callOrder,
			warnings,
			registrations,
			get disposedRegistrations() { return disposedRegistrations; },
			fireConfigurationChange: (setting: string) => configurationService.onDidChangeConfigurationEmitter.fire(upcastPartial<IConfigurationChangeEvent>({
				affectsConfiguration: (key: string) => key === setting,
			})),
		};
	}

	test('registers `/clear` as a silent, immediately executed chat command', () => {
		const store = disposables.add(new DisposableStore());
		const { registrations } = setup(store);

		assert.strictEqual(registrations.length, 1);
		const { data } = registrations[0];
		assert.strictEqual(data.command, 'clear');
		assert.strictEqual(data.executeImmediately, true);
		assert.strictEqual(data.silent, true);
		assert.deepStrictEqual(data.locations, [ChatAgentLocation.Chat]);
	});

	test('does not register outside the Agents window', () => {
		const store = disposables.add(new DisposableStore());
		const { registrations } = setup(store, { isSessionsWindow: false });

		assert.strictEqual(registrations.length, 0);
	});

	test('archives the session, then opens a new one', async () => {
		const store = disposables.add(new DisposableStore());
		const { registrations, chat, session, callOrder } = setup(store);

		await registrations[0].callback('', { report: () => undefined }, [], ChatAgentLocation.Chat, chat.resource, CancellationToken.None);

		assert.deepStrictEqual(callOrder, [`archive:${session.sessionId}`, 'openNewSession']);
	});

	test('skips archiving a session that is already archived', async () => {
		const store = disposables.add(new DisposableStore());
		const { registrations, chat, callOrder } = setup(store, { isArchived: true });

		await registrations[0].callback('', { report: () => undefined }, [], ChatAgentLocation.Chat, chat.resource, CancellationToken.None);

		assert.deepStrictEqual(callOrder, ['openNewSession']);
	});

	test('warns and does nothing when no session owns the chat resource', async () => {
		const store = disposables.add(new DisposableStore());
		const { registrations, chat, callOrder, warnings } = setup(store, { knownChatResource: false });

		await registrations[0].callback('', { report: () => undefined }, [], ChatAgentLocation.Chat, chat.resource, CancellationToken.None);

		assert.strictEqual(warnings.length, 1);
		assert.deepStrictEqual(callOrder, []);
	});

	test('re-registers when the archive action wording changes', () => {
		const store = disposables.add(new DisposableStore());
		const setupResult = setup(store);

		setupResult.fireConfigurationChange(ChatSessionArchiveActionWordingSettingId);
		assert.strictEqual(setupResult.registrations.length, 2);
		assert.strictEqual(setupResult.disposedRegistrations, 1);

		setupResult.fireConfigurationChange('chat.someOtherSetting');
		assert.strictEqual(setupResult.registrations.length, 2);
	});
});
