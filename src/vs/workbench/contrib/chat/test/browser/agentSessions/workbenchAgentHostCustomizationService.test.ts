/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { CancellationToken } from '../../../../../../base/common/cancellation.js';
import { Emitter, Event } from '../../../../../../base/common/event.js';
import { Schemas } from '../../../../../../base/common/network.js';
import { URI } from '../../../../../../base/common/uri.js';
import { mock } from '../../../../../../base/test/common/mock.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../../base/test/common/utils.js';
import { IAgentHostConnectionsService } from '../../../../../../platform/agentHost/common/agentHostConnectionsService.js';
import { AGENT_HOST_SCHEME, createAgentHostResourceUriMapper } from '../../../../../../platform/agentHost/common/agentHostUri.js';
import { IAgentConnection } from '../../../../../../platform/agentHost/common/agentService.js';
import { IAgentSubscription } from '../../../../../../platform/agentHost/common/state/agentSubscription.js';
import { CustomizationType, SessionState } from '../../../../../../platform/agentHost/common/state/protocol/state.js';
import { IFileService } from '../../../../../../platform/files/common/files.js';
import { ILogService, ILoggerService, NullLogService, NullLoggerService } from '../../../../../../platform/log/common/log.js';
import { TestInstantiationService } from '../../../../../../platform/instantiation/test/common/instantiationServiceMock.js';
import { IOutputService } from '../../../../../services/output/common/output.js';
import { AgentCustomizationItemProvider } from '../../../browser/agentSessions/agentHost/agentCustomizationItemProvider.js';
import { IAgentHostActiveClientService } from '../../../browser/agentSessions/agentHost/agentHostActiveClientService.js';
import { WorkbenchAgentHostCustomizationService } from '../../../browser/agentSessions/agentHost/agentHostCustomizationService.js';
import { IAgentHostUntitledProvisionalSessionService } from '../../../browser/agentSessions/agentHost/agentHostUntitledProvisionalSessionService.js';
import { IChatService } from '../../../common/chatService/chatService.js';
import { PromptsType } from '../../../common/promptSyntax/promptTypes.js';
import { MockPromptsService } from '../../common/promptSyntax/service/mockPromptsService.js';

suite('WorkbenchAgentHostCustomizationService', () => {
	const store = ensureNoDisposablesAreLeakedInTestSuite();

	for (const transportMapped of [false, true]) {
		test(`keeps ${transportMapped ? 'transport-mapped' : 'host-side'} roots in client space through hydration and subscription errors`, async () => {
			const snapshotRoot = (path: string) => URI.from({
				scheme: transportMapped ? Schemas.vscodeRemote : Schemas.file,
				authority: transportMapped ? 'dev-container+test' : '',
				path,
			});
			const expectedRoots = (...paths: string[]) => ({
				session: paths.map(path => snapshotRoot(path).toString()),
				client: paths.map(path => ({
					scheme: transportMapped ? Schemas.vscodeRemote : AGENT_HOST_SCHEME,
					authority: transportMapped ? 'dev-container+test' : 'remote-test',
					path,
				})),
			});
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
			let provisionalRoots = [URI.parse('vscode-remote://dev-container+test/provisional')];
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

			const readRoots = () => ({
				session: service.getWorkingDirectories(session),
				client: service.getClientWorkingDirectoryUris(session).map(uri => ({ scheme: uri.scheme, authority: uri.authority, path: uri.path })),
			});
			const provisional = readRoots();
			subscription.verifiedValue = {
				workingDirectories: [snapshotRoot('/verified').toString(), snapshotRoot('/second workspace').toString()],
				customizations: [{
					type: CustomizationType.Directory,
					id: 'workspace-skills',
					uri: snapshotRoot('/verified/.github/skills').toString(),
					name: 'Workspace Skills',
					contents: CustomizationType.Skill,
					writable: true,
					enabled: true,
				}],
			} as unknown as SessionState;
			subscription.value = subscription.verifiedValue;
			subscriptionChanged.fire();
			const verified = readRoots();
			const itemProvider = store.add(new AgentCustomizationItemProvider(
				'remote-test',
				undefined,
				undefined,
				new class extends mock<IFileService>() { }(),
				new NullLogService(),
				service,
				store.add(new MockPromptsService()),
			));
			const folders = await itemProvider.provideSourceFolders(session, PromptsType.skill, CancellationToken.None);
			subscription.value = { workingDirectories: [snapshotRoot('/optimistic').toString(), snapshotRoot('/second workspace').toString()], customizations: [] } as unknown as SessionState;
			subscriptionChanged.fire();
			const optimistic = readRoots();
			customizationChangeCount = 0;
			subscription.value = new Error('transient');
			subscriptionError.fire(subscription.value);
			const afterError = readRoots();
			const changesAfterError = customizationChangeCount;
			subscription.value = { ...subscription.verifiedValue, workingDirectories: [] };
			subscriptionChanged.fire();
			const emptySnapshot = readRoots();
			subscription.value = { ...subscription.verifiedValue, workingDirectories: undefined };
			subscriptionChanged.fire();
			const omittedRoots = readRoots();
			backend = URI.parse('agent-host:/provisional-b');
			provisionalRoots = [URI.parse('vscode-remote://dev-container+test/replacement')];
			subscription.value = undefined;
			subscription.verifiedValue = undefined;
			provisionalChanged.fire(session);
			const replacement = readRoots();

			assert.deepStrictEqual({
				provisional,
				verified,
				optimistic,
				afterError,
				changesAfterError,
				emptySnapshot,
				omittedRoots,
				replacement,
				folders: folders.map(folder => ({ source: folder.source, uri: folder.uri.toString() })),
			}, {
				provisional: { session: ['vscode-remote://dev-container%2Btest/provisional'], client: [{ scheme: 'vscode-remote', authority: 'dev-container+test', path: '/provisional' }] },
				verified: expectedRoots('/verified', '/second workspace'),
				optimistic: expectedRoots('/optimistic', '/second workspace'),
				afterError: expectedRoots('/verified', '/second workspace'),
				changesAfterError: 1,
				emptySnapshot: { session: [], client: [] },
				omittedRoots: { session: [], client: [] },
				replacement: { session: ['vscode-remote://dev-container%2Btest/replacement'], client: [{ scheme: 'vscode-remote', authority: 'dev-container+test', path: '/replacement' }] },
				folders: [{ source: 'local', uri: connection.resourceUris.fromAgentHost(snapshotRoot('/verified/.github/skills')).toString() }],
			});
		});
	}
});
