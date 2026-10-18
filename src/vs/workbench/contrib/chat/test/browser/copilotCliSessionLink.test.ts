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
import { IDialogService } from '../../../../../platform/dialogs/common/dialogs.js';
import { TestInstantiationService } from '../../../../../platform/instantiation/test/common/instantiationServiceMock.js';
import { ILogService, NullLogService } from '../../../../../platform/log/common/log.js';
import { INotificationService } from '../../../../../platform/notification/common/notification.js';
import { IProgressService } from '../../../../../platform/progress/common/progress.js';
import { IChatEntitlementService } from '../../../../services/chat/common/chatEntitlementService.js';
import { ChatViewPaneTarget, IChatWidgetService } from '../../browser/chat.js';
import { CopilotCliSessionLinkOpener } from '../../browser/copilotCliSessionLink.js';
import { IChatSessionsService, SessionType } from '../../common/chatSessionsService.js';

suite('CopilotCliSessionLinkOpener', () => {

	const store = ensureNoDisposablesAreLeakedInTestSuite();
	const sessionId = '0b6f9a4e-1c2d-4e5f-8a9b-0c1d2e3f4a5b';

	interface IOpenOptions {
		/** Whether the agent host is enabled in the window. */
		readonly agentHostEnabled?: boolean;
		/** Whether the agent host's Copilot sessions can be opened. */
		readonly copilotSessionsAvailable?: boolean;
		readonly importSupported?: boolean;
		readonly importError?: Error;
		/** Whether another process holds the session until the user takes it over. */
		readonly inUse?: boolean;
		/** The user's answer when asked to take over a session another process holds. */
		readonly takeOver?: boolean;
		readonly aiHidden?: boolean;
	}

	async function open(id: string, options: IOpenOptions = {}) {
		const imported: string[] = [];
		const opened: { resource: string; inChatView: boolean }[] = [];
		const errors: string[] = [];
		let takeOverPrompts = 0;

		const instantiationService = store.add(new TestInstantiationService());
		instantiationService.stub(ILogService, new NullLogService());
		instantiationService.stub(IChatEntitlementService, upcastPartial<IChatEntitlementService>({ sentiment: { hidden: options.aiHidden } }));
		instantiationService.stub(IAgentHostEnablementService, upcastPartial<IAgentHostEnablementService>({
			enabled: constObservable(options.agentHostEnabled ?? true),
		}));
		instantiationService.stub(IAgentHostConnectionsService, upcastPartial<IAgentHostConnectionsService>({
			ambientConnection: upcastPartial<IAgentConnection>({
				initializeResult: constObservable(upcastPartial<InitializeResult>({ _meta: { [AgentHostSessionImportCapabilityMetaKey]: options.importSupported ?? true } })),
				importSession: async (session, importOptions) => {
					imported.push(`${session.toString()}${importOptions?.takeOver ? ' takeOver' : ''}`);
					if (options.inUse && !importOptions?.takeOver) {
						throw new ProtocolError(AhpErrorCodes.Conflict, 'In use');
					}
					if (options.importError) {
						throw options.importError;
					}
				},
			}),
			registerSessionResource: (backendSession, authority, provider) => URI.from({ scheme: `frontend-${provider}`, path: backendSession.path, query: authority ?? 'ambient' }),
		}));
		instantiationService.stub(IChatSessionsService, upcastPartial<IChatSessionsService>({
			canResolveChatSession: async sessionType => sessionType === SessionType.AgentHostCopilot && (options.copilotSessionsAvailable ?? true),
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
		instantiationService.stub(IDialogService, upcastPartial<IDialogService>({
			confirm: async () => {
				takeOverPrompts++;
				return { confirmed: options.takeOver ?? false };
			},
		}));

		await instantiationService.createInstance(CopilotCliSessionLinkOpener).open(id);

		return { imported, opened, errors: errors.length, ...(takeOverPrompts ? { takeOverPrompts } : {}) };
	}

	test('imports the session into the agent host and opens it in the Chat view', async () => {
		assert.deepStrictEqual(await open(sessionId), {
			imported: [`copilotcli:/${sessionId}`],
			opened: [{ resource: `frontend-copilotcli:/${sessionId}?ambient`, inChatView: true }],
			errors: 0,
		});
	});

	test('asks before taking over a session another process holds', async () => {
		assert.deepStrictEqual({
			takenOver: await open(sessionId, { inUse: true, takeOver: true }),
			declined: await open(sessionId, { inUse: true, takeOver: false }),
		}, {
			takenOver: {
				imported: [`copilotcli:/${sessionId}`, `copilotcli:/${sessionId} takeOver`],
				opened: [{ resource: `frontend-copilotcli:/${sessionId}?ambient`, inChatView: true }],
				errors: 0,
				takeOverPrompts: 1,
			},
			declined: { imported: [`copilotcli:/${sessionId}`], opened: [], errors: 0, takeOverPrompts: 1 },
		});
	});

	test('reports an error instead of opening an empty chat when the agent host cannot open the session', async () => {
		const notOpened = { opened: [], errors: 1 };
		assert.deepStrictEqual({
			aiFeaturesHidden: await open(sessionId, { aiHidden: true }),
			agentHostDisabled: await open(sessionId, { agentHostEnabled: false }),
			copilotSessionsUnavailable: await open(sessionId, { copilotSessionsAvailable: false }),
			importUnsupported: await open(sessionId, { importSupported: false }),
			importFailed: await open(sessionId, { importError: new ProtocolError(AhpErrorCodes.SessionNotFound, 'Session not found') }),
		}, {
			aiFeaturesHidden: { imported: [], ...notOpened },
			agentHostDisabled: { imported: [], ...notOpened },
			copilotSessionsUnavailable: { imported: [], ...notOpened },
			importUnsupported: { imported: [], ...notOpened },
			importFailed: { imported: [`copilotcli:/${sessionId}`], ...notOpened },
		});
	});

	test('ignores an invalid session id', async () => {
		assert.deepStrictEqual(await open('../session'), {
			imported: [],
			opened: [],
			errors: 0,
		});
	});
});
