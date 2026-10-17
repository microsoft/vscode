/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { constObservable } from '../../../../../base/common/observable.js';
import { URI } from '../../../../../base/common/uri.js';
import { upcastPartial } from '../../../../../base/test/common/mock.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { IAgentHostConnectionsService } from '../../../../../platform/agentHost/common/agentHostConnectionsService.js';
import { IAgentHostEnablementService } from '../../../../../platform/agentHost/common/agentHostEnablementService.js';
import { IAgentConnection } from '../../../../../platform/agentHost/common/agentService.js';
import { AgentHostSessionImportCapabilityMetaKey } from '../../../../../platform/agentHost/common/meta/agentHostSessionImportMeta.js';
import type { InitializeResult } from '../../../../../platform/agentHost/common/state/protocol/common/commands.js';
import { AhpErrorCodes, ProtocolError } from '../../../../../platform/agentHost/common/state/sessionProtocol.js';
import { IConfigurationService } from '../../../../../platform/configuration/common/configuration.js';
import { TestConfigurationService } from '../../../../../platform/configuration/test/common/testConfigurationService.js';
import { TestInstantiationService } from '../../../../../platform/instantiation/test/common/instantiationServiceMock.js';
import { ILogService, NullLogService } from '../../../../../platform/log/common/log.js';
import { INotificationService } from '../../../../../platform/notification/common/notification.js';
import { IManagedSettingsService, NullManagedSettingsService } from '../../../../../platform/policy/common/copilotManagedSettings.js';
import { IProgressService } from '../../../../../platform/progress/common/progress.js';
import { IWorkspaceContextService } from '../../../../../platform/workspace/common/workspace.js';
import { IChatEntitlementService } from '../../../../services/chat/common/chatEntitlementService.js';
import { TestContextService } from '../../../../test/common/workbenchTestServices.js';
import { ChatViewPaneTarget, IChatWidgetService } from '../../browser/chat.js';
import { CopilotCliSessionLinkOpener } from '../../browser/copilotCliSessionLink.js';
import { IChatSessionsService, SessionType } from '../../common/chatSessionsService.js';
import { ChatConfiguration } from '../../common/constants.js';

suite('CopilotCliSessionLinkOpener', () => {

	const store = ensureNoDisposablesAreLeakedInTestSuite();
	const sessionId = '0b6f9a4e-1c2d-4e5f-8a9b-0c1d2e3f4a5b';

	interface IOpenOptions {
		/** Whether the Copilot CLI chat session provider of the Copilot extension can open sessions. */
		readonly providerAvailable: boolean;
		/** Whether the agent host's Copilot harness can open sessions. */
		readonly harnessAvailable?: boolean;
		/** Whether new chats default to the Copilot harness. */
		readonly harnessDefault?: boolean;
		readonly importSupported?: boolean;
		readonly importError?: Error;
		readonly aiHidden?: boolean;
	}

	async function open(id: string, options: IOpenOptions) {
		const imported: string[] = [];
		const opened: { resource: string; inChatView: boolean }[] = [];
		const errors: string[] = [];

		const instantiationService = store.add(new TestInstantiationService());
		instantiationService.stub(ILogService, new NullLogService());
		instantiationService.stub(IConfigurationService, new TestConfigurationService({ [ChatConfiguration.DefaultToCopilotHarness]: options.harnessDefault ?? false }));
		instantiationService.stub(IWorkspaceContextService, new TestContextService());
		instantiationService.stub(IManagedSettingsService, new NullManagedSettingsService());
		instantiationService.stub(IChatEntitlementService, upcastPartial<IChatEntitlementService>({ sentiment: { hidden: options.aiHidden } }));
		instantiationService.stub(IAgentHostEnablementService, upcastPartial<IAgentHostEnablementService>({
			enabled: constObservable(options.harnessAvailable ?? false),
			managedSandboxEnforced: constObservable(false),
		}));
		instantiationService.stub(IAgentHostConnectionsService, upcastPartial<IAgentHostConnectionsService>({
			ambientConnection: upcastPartial<IAgentConnection>({
				initializeResult: constObservable(upcastPartial<InitializeResult>({ _meta: { [AgentHostSessionImportCapabilityMetaKey]: options.importSupported ?? true } })),
				importSession: async session => {
					imported.push(session.toString());
					if (options.importError) {
						throw options.importError;
					}
				},
			}),
			registerSessionResource: (backendSession, authority, provider) => URI.from({ scheme: `frontend-${provider}`, path: backendSession.path, query: authority ?? 'ambient' }),
		}));
		instantiationService.stub(IChatSessionsService, upcastPartial<IChatSessionsService>({
			canResolveChatSession: async sessionType => sessionType === SessionType.AgentHostCopilot ? options.harnessAvailable ?? false : options.providerAvailable,
			getChatSessionContribution: () => undefined,
			getAllChatSessionContributions: () => [],
		}));
		instantiationService.stub(IProgressService, upcastPartial<IProgressService>({
			withProgress: (_options, task) => task({ report: () => { } }),
		}));
		instantiationService.stub(IChatWidgetService, upcastPartial<IChatWidgetService>({
			openSession: async (resource, target) => {
				opened.push({ resource: resource.toString(), inChatView: target === ChatViewPaneTarget });
				return undefined;
			},
		}));
		instantiationService.stub(INotificationService, upcastPartial<INotificationService>({
			error: message => { errors.push(String(message)); },
		}));

		await instantiationService.createInstance(CopilotCliSessionLinkOpener).open(id);

		return { imported, opened, errors: errors.length };
	}

	test('imports the session into the Copilot harness when new chats default to it', async () => {
		assert.deepStrictEqual(await open(sessionId, { providerAvailable: true, harnessAvailable: true, harnessDefault: true }), {
			imported: [`copilotcli:/${sessionId}`],
			opened: [{ resource: `frontend-copilotcli:/${sessionId}?ambient`, inChatView: true }],
			errors: 0,
		});
	});

	test('opens the session through the Copilot CLI provider when the harness is not the default or cannot import it', async () => {
		const legacy = { opened: [{ resource: `copilotcli:/${sessionId}`, inChatView: true }], errors: 0 };
		assert.deepStrictEqual({
			harnessNotDefault: await open(sessionId, { providerAvailable: true, harnessAvailable: true }),
			harnessDisabled: await open(sessionId, { providerAvailable: true, harnessDefault: true }),
			importUnsupported: await open(sessionId, { providerAvailable: true, harnessAvailable: true, harnessDefault: true, importSupported: false }),
			sessionNotImportable: await open(sessionId, { providerAvailable: true, harnessAvailable: true, harnessDefault: true, importError: new ProtocolError(AhpErrorCodes.SessionNotFound, 'Session not found') }),
		}, {
			harnessNotDefault: { imported: [], ...legacy },
			harnessDisabled: { imported: [], ...legacy },
			importUnsupported: { imported: [], ...legacy },
			sessionNotImportable: { imported: [`copilotcli:/${sessionId}`], ...legacy },
		});
	});

	test('uses the Copilot harness when the Copilot CLI provider is unavailable', async () => {
		assert.deepStrictEqual(await open(sessionId, { providerAvailable: false, harnessAvailable: true }), {
			imported: [`copilotcli:/${sessionId}`],
			opened: [{ resource: `frontend-copilotcli:/${sessionId}?ambient`, inChatView: true }],
			errors: 0,
		});
	});

	test('reports a session the Copilot harness cannot take over instead of opening it elsewhere', async () => {
		assert.deepStrictEqual(await open(sessionId, { providerAvailable: true, harnessAvailable: true, harnessDefault: true, importError: new ProtocolError(AhpErrorCodes.Conflict, 'In use') }), {
			imported: [`copilotcli:/${sessionId}`],
			opened: [],
			errors: 1,
		});
	});

	test('reports an error instead of opening an empty chat when no provider can open the session', async () => {
		assert.deepStrictEqual({
			providersUnavailable: await open(sessionId, { providerAvailable: false }),
			aiFeaturesHidden: await open(sessionId, { providerAvailable: true, harnessAvailable: true, harnessDefault: true, aiHidden: true }),
		}, {
			providersUnavailable: { imported: [], opened: [], errors: 1 },
			aiFeaturesHidden: { imported: [], opened: [], errors: 1 },
		});
	});

	test('ignores an invalid session id', async () => {
		assert.deepStrictEqual(await open('../session', { providerAvailable: true, harnessAvailable: true, harnessDefault: true }), {
			imported: [],
			opened: [],
			errors: 0,
		});
	});
});
