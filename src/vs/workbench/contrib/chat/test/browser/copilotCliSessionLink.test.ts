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
import { IDialogService } from '../../../../../platform/dialogs/common/dialogs.js';
import { TestInstantiationService } from '../../../../../platform/instantiation/test/common/instantiationServiceMock.js';
import { ILogService, NullLogService } from '../../../../../platform/log/common/log.js';
import { INotificationService } from '../../../../../platform/notification/common/notification.js';
import { IProgressService } from '../../../../../platform/progress/common/progress.js';
import { COPILOT_CLI_HANDOFF_PROTOTYPE_SETTING } from '../../../../../platform/window/common/window.js';
import { IChatEntitlementService } from '../../../../services/chat/common/chatEntitlementService.js';
import { ChatViewPaneTarget, IChatWidgetService } from '../../browser/chat.js';
import { CopilotCliSessionLinkOpener } from '../../browser/copilotCliSessionLink.js';
import { IChatSessionsService, SessionType } from '../../common/chatSessionsService.js';
import { ICopilotCliHandoffService } from '../../common/copilotCliHandoff.js';

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
		/** The session's address that the host reports for the import, or `null` for a host that reports none. */
		readonly advertised?: string | null;
		/** Whether the host listed the session, registering its resource, before the import completed. */
		readonly listed?: boolean;
		/** Whether the session is taken back from the Copilot CLI rather than handed off with `/code`. */
		readonly takeBack?: boolean;
		/** Whether the window opens imported sessions itself, as the Agents window does, and whether they appear there. */
		readonly openImported?: 'opens' | 'neverAppears';
		/** Whether the Copilot CLI handoff prototype is on. */
		readonly handoffPrototype?: boolean;
		readonly handoffAllowed?: boolean;
	}

	async function open(id: string, options: IOpenOptions = {}) {
		const { errors, ...result } = await openCollectingErrors(id, options);
		return { ...result, errors: errors.length };
	}

	async function openCollectingErrors(id: string, options: IOpenOptions = {}) {
		const imported: string[] = [];
		const opened: { resource: string; backend: string | undefined; inChatView: boolean }[] = [];
		const errors: string[] = [];
		const continuedFromCli: string[] = [];
		const openedByWindow: string[] = [];
		let takeOverPrompts = 0;
		const advertised = options.advertised === undefined ? `ahp-session:/${id}` : options.advertised ?? undefined;

		// Like the real service, one frontend resource per session, which refuses a second backend identity.
		const backends = new Map<string, string>();
		const registerSessionResource = (backendSession: URI, _authority?: string, provider?: string) => {
			const resource = URI.from({ scheme: `frontend-${provider}`, path: backendSession.path });
			const previous = backends.get(resource.toString());
			if (previous && previous !== backendSession.toString()) {
				throw new Error(`Conflicting backend identities for ${resource.toString()}`);
			}
			backends.set(resource.toString(), backendSession.toString());
			return resource;
		};
		if (options.listed && advertised) {
			registerSessionResource(URI.parse(advertised), undefined, 'copilotcli');
		}

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
					imported.push(`${session.toString()}${importOptions?.takeOver ? ' takeOver' : ''}${importOptions?.reveal ? ' reveal' : ''}`);
					if (options.inUse && !importOptions?.takeOver) {
						throw new ProtocolError(AhpErrorCodes.Conflict, 'In use');
					}
					if (options.importError) {
						throw options.importError;
					}
					return advertised ? URI.parse(advertised) : undefined;
				},
			}),
			registerSessionResource,
			findSessionResource: backendSession => {
				const frontend = [...backends].find(([, backend]) => backend === backendSession.toString())?.[0];
				return frontend ? URI.parse(frontend) : undefined;
			},
		}));
		instantiationService.stub(IChatSessionsService, upcastPartial<IChatSessionsService>({
			canResolveChatSession: async sessionType => sessionType === SessionType.AgentHostCopilot && (options.copilotSessionsAvailable ?? true),
		}));
		instantiationService.stub(IProgressService, upcastPartial<IProgressService>({
			withProgress: (_options, task) => task({ report: () => { } }),
		}));
		instantiationService.stub(IChatWidgetService, upcastPartial<IChatWidgetService>({
			openSession: async (resource, target) => {
				opened.push({ resource: resource.toString(), backend: backends.get(resource.toString()), inChatView: target === ChatViewPaneTarget });
				return undefined;
			},
		}));
		instantiationService.stub(INotificationService, upcastPartial<INotificationService>({
			error: message => { errors.push(String(message)); },
			warn: message => { errors.push(String(message)); },
		}));
		instantiationService.stub(IDialogService, upcastPartial<IDialogService>({
			confirm: async () => {
				takeOverPrompts++;
				return { confirmed: options.takeOver ?? false };
			},
		}));
		instantiationService.stub(IConfigurationService, new TestConfigurationService({ [COPILOT_CLI_HANDOFF_PROTOTYPE_SETTING]: options.handoffPrototype ?? false }));
		instantiationService.stub(ICopilotCliHandoffService, upcastPartial<ICopilotCliHandoffService>({
			didContinueFromCli: async (continuedId, resource) => { continuedFromCli.push(`${continuedId} ${resource.toString()}`); },
			prepareToOpenFromCli: async () => options.handoffAllowed ?? true,
		}));

		const openImported = options.openImported ? async (backendSession: URI) => {
			openedByWindow.push(backendSession.toString());
			return options.openImported === 'opens' ? URI.from({ scheme: 'agents-chat', path: backendSession.path }) : undefined;
		} : undefined;
		await instantiationService.createInstance(CopilotCliSessionLinkOpener).open(id, { takeBack: options.takeBack, openImported });

		return { imported, opened, ...(openedByWindow.length ? { openedByWindow } : {}), errors, ...(takeOverPrompts ? { takeOverPrompts } : {}), ...(continuedFromCli.length ? { continuedFromCli } : {}) };
	}

	test('imports the session into the agent host and opens it in the Chat view', async () => {
		assert.deepStrictEqual(await open(sessionId), {
			imported: [`copilotcli:/${sessionId}`],
			opened: [{ resource: `frontend-copilotcli:/${sessionId}`, backend: `ahp-session:/${sessionId}`, inChatView: true }],
			errors: 0,
			continuedFromCli: [`${sessionId} frontend-copilotcli:/${sessionId}`],
		});
	});

	test('records the handoff once the session opens, but not when it is taken back', async () => {
		assert.deepStrictEqual({
			handedOff: (await open(sessionId)).continuedFromCli,
			takenBack: await open(sessionId, { takeBack: true }),
			notOpened: (await open(sessionId, { importError: new Error('Disk full') })).continuedFromCli,
		}, {
			handedOff: [`${sessionId} frontend-copilotcli:/${sessionId}`],
			takenBack: {
				imported: [`copilotcli:/${sessionId}`],
				opened: [{ resource: `frontend-copilotcli:/${sessionId}`, backend: `ahp-session:/${sessionId}`, inChatView: true }],
				errors: 0,
			},
			notOpened: undefined,
		});
	});

	test('opens the session at the address the host reports for it', async () => {
		assert.deepStrictEqual({
			listedBeforeImportCompleted: (await open(sessionId, { listed: true })).opened,
			hostReportsOwnAddress: (await open(sessionId, { advertised: `other-host:/session/${sessionId}` })).opened,
			hostReportsNoAddress: (await open(sessionId, { advertised: null })).opened,
		}, {
			listedBeforeImportCompleted: [{ resource: `frontend-copilotcli:/${sessionId}`, backend: `ahp-session:/${sessionId}`, inChatView: true }],
			hostReportsOwnAddress: [{ resource: `frontend-copilotcli:/session/${sessionId}`, backend: `other-host:/session/${sessionId}`, inChatView: true }],
			hostReportsNoAddress: [{ resource: `frontend-copilotcli:/${sessionId}`, backend: `copilotcli:/${sessionId}`, inChatView: true }],
		});
	});

	test('lets the window open the imported session itself, as the Agents window does', async () => {
		assert.deepStrictEqual({
			opens: await open(sessionId, { openImported: 'opens' }),
			neverAppears: await open(sessionId, { openImported: 'neverAppears' }),
		}, {
			opens: {
				imported: [`copilotcli:/${sessionId}`],
				opened: [],
				openedByWindow: [`ahp-session:/${sessionId}`],
				errors: 0,
				continuedFromCli: [`${sessionId} agents-chat:/${sessionId}`],
			},
			neverAppears: {
				imported: [`copilotcli:/${sessionId}`],
				opened: [],
				openedByWindow: [`ahp-session:/${sessionId}`],
				errors: 0,
			},
		});
	});

	test('asks the host to show the session whatever the external sessions filter says while the handoff prototype is on', async () => {
		assert.deepStrictEqual({
			on: (await open(sessionId, { handoffPrototype: true })).imported,
			onTakingOver: (await open(sessionId, { handoffPrototype: true, inUse: true, takeOver: true })).imported,
			off: (await open(sessionId)).imported,
		}, {
			on: [`copilotcli:/${sessionId} reveal`],
			onTakingOver: [`copilotcli:/${sessionId} reveal`],
			off: [`copilotcli:/${sessionId}`],
		});
	});

	test('the prototype does not import before owner approval or offer a force takeover after conflict', async () => {
		assert.deepStrictEqual({
			ownerRefused: await open(sessionId, { handoffPrototype: true, handoffAllowed: false }),
			stillHeld: await open(sessionId, { handoffPrototype: true, inUse: true, takeOver: true }),
		}, {
			ownerRefused: { imported: [], opened: [], errors: 0 },
			stillHeld: { imported: [`copilotcli:/${sessionId} reveal`], opened: [], errors: 1 },
		});
	});

	test('asks before taking over a session another process holds', async () => {
		assert.deepStrictEqual({
			takenOver: await open(sessionId, { inUse: true, takeOver: true }),
			declined: await open(sessionId, { inUse: true, takeOver: false }),
		}, {
			takenOver: {
				imported: [`copilotcli:/${sessionId}`, `copilotcli:/${sessionId} takeOver`],
				opened: [{ resource: `frontend-copilotcli:/${sessionId}`, backend: `ahp-session:/${sessionId}`, inChatView: true }],
				errors: 0,
				takeOverPrompts: 1,
				continuedFromCli: [`${sessionId} frontend-copilotcli:/${sessionId}`],
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

	test('explains a session the agent host cannot find without its internal reason', async () => {
		assert.deepStrictEqual({
			notFound: (await openCollectingErrors(sessionId, { importError: new ProtocolError(AhpErrorCodes.SessionNotFound, `Session is not an adoptable legacy chat (reason=settingDisabled): copilotcli:/${sessionId}`) })).errors,
			otherFailure: (await openCollectingErrors(sessionId, { importError: new Error('Disk full') })).errors,
		}, {
			notFound: ['Couldn\'t open the Copilot CLI session because it couldn\'t be found. It may have been deleted, or it was created by another app.'],
			otherFailure: ['Couldn\'t open the Copilot CLI session: Disk full'],
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
