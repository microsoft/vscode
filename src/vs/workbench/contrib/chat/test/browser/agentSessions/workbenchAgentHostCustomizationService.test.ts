/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { Emitter, Event } from '../../../../../../base/common/event.js';
import { URI } from '../../../../../../base/common/uri.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../../base/test/common/utils.js';
import { IAgentHostConnectionsService } from '../../../../../../platform/agentHost/common/agentHostConnectionsService.js';
import { createAgentHostResourceUriMapper } from '../../../../../../platform/agentHost/common/agentHostUri.js';
import { IAgentConnection } from '../../../../../../platform/agentHost/common/agentService.js';
import { IAgentSubscription } from '../../../../../../platform/agentHost/common/state/agentSubscription.js';
import { SessionState } from '../../../../../../platform/agentHost/common/state/protocol/state.js';
import { ILogService, ILoggerService, NullLogService, NullLoggerService } from '../../../../../../platform/log/common/log.js';
import { TestInstantiationService } from '../../../../../../platform/instantiation/test/common/instantiationServiceMock.js';
import { IOutputService } from '../../../../../services/output/common/output.js';
import { IAgentHostActiveClientService } from '../../../browser/agentSessions/agentHost/agentHostActiveClientService.js';
import { WorkbenchAgentHostCustomizationService } from '../../../browser/agentSessions/agentHost/agentHostCustomizationService.js';
import { IAgentHostUntitledProvisionalSessionService } from '../../../browser/agentSessions/agentHost/agentHostUntitledProvisionalSessionService.js';
import { IChatService } from '../../../common/chatService/chatService.js';

suite('WorkbenchAgentHostCustomizationService', () => {
	const store = ensureNoDisposablesAreLeakedInTestSuite();

	test('uses provisional roots until hydration and retains verified roots during subscription errors', () => {
		const instantiationService = store.add(new TestInstantiationService());
		instantiationService.stub(ILoggerService, store.add(new NullLoggerService()));
		instantiationService.stub(IOutputService, {
			getChannel: () => undefined,
			getChannelDescriptor: () => undefined,
			showChannel: async () => { },
		});
		const subscriptionChanged = store.add(new Emitter<void>());
		const subscriptionError = store.add(new Emitter<Error>());
		const subscription = {
			value: undefined as SessionState | Error | undefined,
			verifiedValue: undefined as SessionState | undefined,
			onDidChange: subscriptionChanged.event,
			onDidError: subscriptionError.event,
		} as unknown as IAgentSubscription<SessionState> & { value: SessionState | Error | undefined; verifiedValue: SessionState | undefined };
		const connection = {
			onDidAction: Event.None,
			rootState: { value: undefined },
			resourceUris: createAgentHostResourceUriMapper('remote-test'),
			getSubscription: () => ({ object: subscription, dispose: () => { } }),
		} as unknown as IAgentConnection;
		let backend = URI.parse('agent-host:/provisional-a');
		let provisionalRoots = [URI.file('/provisional')];
		const provisionalChanged = store.add(new Emitter<URI>());
		const provisionalService = {
			onDidChange: provisionalChanged.event,
			get: () => backend,
			getProvisionalWorkingDirectories: () => provisionalRoots,
		} as Partial<IAgentHostUntitledProvisionalSessionService> as IAgentHostUntitledProvisionalSessionService;
		const connectionsService = {
			ambientConnection: connection,
		} as Partial<IAgentHostConnectionsService> as IAgentHostConnectionsService;
		const chatService = {
			onDidDisposeSession: Event.None,
		} as Partial<IChatService> as IChatService;
		const activeClientService = {
			isBundledMcpServer: () => false,
		} as Partial<IAgentHostActiveClientService> as IAgentHostActiveClientService;
		const service = store.add(new WorkbenchAgentHostCustomizationService(
			connectionsService,
			provisionalService,
			instantiationService,
			new NullLogService() as ILogService,
			chatService,
			activeClientService,
		));
		let customizationChangeCount = 0;
		store.add(service.onDidChangeCustomizations(() => customizationChangeCount++));
		const session = URI.parse('untitled:chat-session');

		const provisional = service.getWorkingDirectories(session);
		const verifiedBeforeHydration = service.getVerifiedWorkingDirectories(session);
		subscription.verifiedValue = { workingDirectories: ['file:///verified'], customizations: [] } as unknown as SessionState;
		subscription.value = subscription.verifiedValue;
		subscriptionChanged.fire();
		const verified = service.getWorkingDirectories(session);
		const verifiedRoots = service.getVerifiedWorkingDirectories(session);
		subscription.value = { workingDirectories: ['file:///optimistic'], customizations: [] } as unknown as SessionState;
		subscriptionChanged.fire();
		const optimistic = service.getWorkingDirectories(session);
		const verifiedDuringOptimisticChange = service.getVerifiedWorkingDirectories(session);
		customizationChangeCount = 0;
		subscription.value = new Error('transient');
		subscriptionError.fire(subscription.value);
		const afterError = service.getWorkingDirectories(session);
		const verifiedAfterError = service.getVerifiedWorkingDirectories(session);
		const changesAfterError = customizationChangeCount;
		backend = URI.parse('agent-host:/provisional-b');
		provisionalRoots = [URI.file('/replacement')];
		subscription.value = undefined;
		subscription.verifiedValue = undefined;
		provisionalChanged.fire(session);
		const replacement = service.getWorkingDirectories(session);
		const verifiedAfterReplacement = service.getVerifiedWorkingDirectories(session);
		const summarizeRoots = (roots: readonly string[]) => roots.map(root => {
			const uri = URI.parse(root);
			return { scheme: uri.scheme, authority: uri.authority, path: uri.path };
		});

		assert.deepStrictEqual({
			provisional: summarizeRoots(provisional),
			verifiedBeforeHydration,
			verified: summarizeRoots(verified),
			verifiedRoots: summarizeRoots(verifiedRoots),
			optimistic: summarizeRoots(optimistic),
			verifiedDuringOptimisticChange: summarizeRoots(verifiedDuringOptimisticChange),
			afterError: summarizeRoots(afterError),
			verifiedAfterError: summarizeRoots(verifiedAfterError),
			changesAfterError,
			replacement: summarizeRoots(replacement),
			verifiedAfterReplacement,
		}, {
			provisional: [{ scheme: 'vscode-agent-host', authority: 'remote-test', path: '/provisional' }],
			verifiedBeforeHydration: [],
			verified: [{ scheme: 'vscode-agent-host', authority: 'remote-test', path: '/verified' }],
			verifiedRoots: [{ scheme: 'vscode-agent-host', authority: 'remote-test', path: '/verified' }],
			optimistic: [{ scheme: 'vscode-agent-host', authority: 'remote-test', path: '/optimistic' }],
			verifiedDuringOptimisticChange: [{ scheme: 'vscode-agent-host', authority: 'remote-test', path: '/verified' }],
			afterError: [{ scheme: 'vscode-agent-host', authority: 'remote-test', path: '/verified' }],
			verifiedAfterError: [{ scheme: 'vscode-agent-host', authority: 'remote-test', path: '/verified' }],
			changesAfterError: 1,
			replacement: [{ scheme: 'vscode-agent-host', authority: 'remote-test', path: '/replacement' }],
			verifiedAfterReplacement: [],
		});
	});
});
