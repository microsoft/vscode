/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { Event } from '../../../../../../base/common/event.js';
import { IReference } from '../../../../../../base/common/lifecycle.js';
import { URI } from '../../../../../../base/common/uri.js';
import { mock, upcastPartial } from '../../../../../../base/test/common/mock.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../../base/test/common/utils.js';
import { IConfigurationService } from '../../../../../../platform/configuration/common/configuration.js';
import { TestConfigurationService } from '../../../../../../platform/configuration/test/common/testConfigurationService.js';
import { TestInstantiationService } from '../../../../../../platform/instantiation/test/common/instantiationServiceMock.js';
import { ILogService, NullLogService } from '../../../../../../platform/log/common/log.js';
import { NullTelemetryService } from '../../../../../../platform/telemetry/common/telemetryUtils.js';
import { ITelemetryService } from '../../../../../../platform/telemetry/common/telemetry.js';
import { IAgentConnection } from '../../../../../../platform/agentHost/common/agentService.js';
import { IAgentSubscription } from '../../../../../../platform/agentHost/common/state/agentSubscription.js';
import { IAgentHostConnectionsService } from '../../../../../../platform/agentHost/common/agentHostConnectionsService.js';
import { ChatConfiguration } from '../../../common/constants.js';
import { IAgentSession } from '../../../browser/agentSessions/agentSessionsModel.js';
import { openSession, openSessionByResource, ISessionOpenerParticipant, sessionOpenerRegistry } from '../../../browser/agentSessions/agentSessionsOpener.js';
import { IAgentSessionsService } from '../../../browser/agentSessions/agentSessionsService.js';

suite('AgentSessionsOpener', () => {

	const disposables = ensureNoDisposablesAreLeakedInTestSuite();

	/** The opener consults the agent host to redirect legacy Copilot CLI resources. */
	function stubAgentHost(instantiationService: TestInstantiationService): void {
		instantiationService.stub(IAgentHostConnectionsService, upcastPartial<IAgentHostConnectionsService>({ ambientConnection: undefined }));
	}

	test('lets a participant handle a resource before legacy session lookup', async () => {
		const instantiationService = disposables.add(new TestInstantiationService());
		instantiationService.stub(ILogService, new NullLogService());
		stubAgentHost(instantiationService);
		const resource = URI.parse('test-session://provider/session');
		let handledResource: URI | undefined;
		const participant: ISessionOpenerParticipant = {
			handleOpenSession: async () => false,
			handleOpenSessionResource: async (_accessor, candidate) => {
				handledResource = candidate;
				return true;
			},
		};
		const registration = sessionOpenerRegistry.registerParticipant(participant);

		try {
			await instantiationService.invokeFunction(openSessionByResource, resource);
		} finally {
			registration.dispose();
		}

		assert.strictEqual(handledResource, resource);
	});

	test('falls back to the legacy session opener when no participant handles the resource', async () => {
		const instantiationService = disposables.add(new TestInstantiationService());
		instantiationService.stub(ILogService, new NullLogService());
		stubAgentHost(instantiationService);
		const resource = URI.parse('test-session://provider/session');
		const session = upcastPartial<IAgentSession>({ resource });
		let resolvedResource: URI | undefined;
		instantiationService.stub(IAgentSessionsService, upcastPartial<IAgentSessionsService>({
			getSession: candidate => {
				resolvedResource = candidate;
				return session;
			},
		}));
		let handledSession: IAgentSession | undefined;
		const participant: ISessionOpenerParticipant = {
			handleOpenSession: async (_accessor, candidate) => {
				handledSession = candidate;
				return true;
			},
		};
		const registration = sessionOpenerRegistry.registerParticipant(participant);

		try {
			await instantiationService.invokeFunction(openSessionByResource, resource);
		} finally {
			registration.dispose();
		}

		assert.deepStrictEqual({ resolvedResource, handledSession }, { resolvedResource: resource, handledSession: session });
	});

	test('surfaces a just-migrated session before opening it', async () => {
		// Adoption registers the twin with the host, but the list only learns about
		// it on the next provider refresh — without that refresh the open reverts to
		// the legacy session it just migrated away from.
		const legacy = URI.parse('copilotcli:/sess-1');
		const twin = URI.parse('agent-host-copilotcli:/sess-1');
		const twinSession = upcastPartial<IAgentSession>({ resource: twin });

		const instantiationService = disposables.add(new TestInstantiationService());
		instantiationService.stub(ILogService, new NullLogService());
		instantiationService.stub(ITelemetryService, NullTelemetryService);
		instantiationService.stub(IConfigurationService, new TestConfigurationService({ [ChatConfiguration.MigrateLegacyCopilotCliSessions]: true }));
		// A host that answers the adoption probe with state, i.e. migration succeeded.
		instantiationService.stub(IAgentHostConnectionsService, upcastPartial<IAgentHostConnectionsService>({
			ambientConnection: new class extends mock<IAgentConnection>() {
				override getSubscription<T>(): IReference<IAgentSubscription<T>> {
					return {
						object: upcastPartial<IAgentSubscription<T>>({ value: {} as T, onDidChange: Event.None, onDidError: Event.None }),
						dispose: () => { },
					};
				}
			},
		}));
		const resolvedProviders: (string | string[] | undefined)[] = [];
		let surfaced = false;
		instantiationService.stub(IAgentSessionsService, upcastPartial<IAgentSessionsService>({
			getSession: candidate => (surfaced && candidate.toString() === twin.toString()) ? twinSession : undefined,
			model: upcastPartial<IAgentSessionsService['model']>({
				resolve: async provider => {
					resolvedProviders.push(provider);
					surfaced = true;
				},
			}),
		}));

		let handledSession: IAgentSession | undefined;
		const participant: ISessionOpenerParticipant = {
			handleOpenSession: async (_accessor, candidate) => {
				handledSession = candidate;
				return true;
			},
			handleOpenSessionResource: async () => false,
		};
		const registration = sessionOpenerRegistry.registerParticipant(participant);

		try {
			await instantiationService.invokeFunction(openSessionByResource, legacy);
		} finally {
			registration.dispose();
		}

		assert.deepStrictEqual(
			{ handled: handledSession?.resource.toString(), resolvedProviders },
			{ handled: twin.toString(), resolvedProviders: ['agent-host-copilotcli'] },
		);
	});

	test('a list click opens the migrated session, not the legacy one it came from', async () => {
		// The path Rob hit: adoption succeeded, but the twin was not in the list yet,
		// so the open silently reverted to the legacy session.
		const legacy = URI.parse('copilotcli:/sess-2');
		const twin = URI.parse('agent-host-copilotcli:/sess-2');
		const legacySession = upcastPartial<IAgentSession>({ resource: legacy });
		const twinSession = upcastPartial<IAgentSession>({ resource: twin });

		const instantiationService = disposables.add(new TestInstantiationService());
		instantiationService.stub(ILogService, new NullLogService());
		instantiationService.stub(ITelemetryService, NullTelemetryService);
		instantiationService.stub(IConfigurationService, new TestConfigurationService({ [ChatConfiguration.MigrateLegacyCopilotCliSessions]: true }));
		instantiationService.stub(IAgentHostConnectionsService, upcastPartial<IAgentHostConnectionsService>({
			ambientConnection: new class extends mock<IAgentConnection>() {
				override getSubscription<T>(): IReference<IAgentSubscription<T>> {
					return {
						object: upcastPartial<IAgentSubscription<T>>({ value: {} as T, onDidChange: Event.None, onDidError: Event.None }),
						dispose: () => { },
					};
				}
			},
		}));
		let surfaced = false;
		instantiationService.stub(IAgentSessionsService, upcastPartial<IAgentSessionsService>({
			getSession: candidate => (surfaced && candidate.toString() === twin.toString()) ? twinSession : undefined,
			model: upcastPartial<IAgentSessionsService['model']>({ resolve: async () => { surfaced = true; } }),
		}));

		let handledSession: IAgentSession | undefined;
		const registration = sessionOpenerRegistry.registerParticipant({
			handleOpenSession: async (_accessor, candidate) => {
				handledSession = candidate;
				return true;
			},
		});

		try {
			await instantiationService.invokeFunction(openSession, legacySession);
		} finally {
			registration.dispose();
		}

		assert.strictEqual(handledSession?.resource.toString(), twin.toString());
	});
});
