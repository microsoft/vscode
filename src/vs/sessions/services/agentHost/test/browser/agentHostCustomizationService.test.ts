/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { Event } from '../../../../../base/common/event.js';
import { observableValue } from '../../../../../base/common/observable.js';
import { URI } from '../../../../../base/common/uri.js';
import { mock } from '../../../../../base/test/common/mock.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { createAgentHostResourceUriMapper } from '../../../../../platform/agentHost/common/agentHostUri.js';
import { CustomizationType, McpServerStatus, type Customization, type McpServerCustomization, type PluginCustomization } from '../../../../../platform/agentHost/common/state/protocol/state.js';
import { TestInstantiationService } from '../../../../../platform/instantiation/test/common/instantiationServiceMock.js';
import { ILoggerService, NullLoggerService, NullLogService } from '../../../../../platform/log/common/log.js';
import { IOutputService } from '../../../../../workbench/services/output/common/output.js';
import { IAgentHostActiveClientService } from '../../../../../workbench/contrib/chat/browser/agentSessions/agentHost/agentHostActiveClientService.js';
import { IAgentHostSessionsProvider } from '../../../../common/agentHostSessionsProvider.js';
import { AgentHostCustomizationService } from '../../browser/agentHostCustomizationService.js';
import { ISession } from '../../../sessions/common/session.js';
import { ISessionsManagementService } from '../../../sessions/common/sessionsManagement.js';
import { ISessionsProvidersService } from '../../../sessions/browser/sessionsProvidersService.js';
import { ISessionsService } from '../../../sessions/browser/sessionsService.js';
import { ISessionsProvider } from '../../../sessions/common/sessionsProvider.js';

suite('AgentHostCustomizationService', () => {
	const store = ensureNoDisposablesAreLeakedInTestSuite();

	function createSut(provider: IAgentHostSessionsProvider, activeClientService?: IAgentHostActiveClientService): { service: AgentHostCustomizationService; sessionResource: URI } {
		const sessionResource = URI.parse('agent-host-copilot:///session-1');
		const session = new class extends mock<ISession>() {
			override readonly resource = sessionResource;
			override readonly providerId = provider.id;
			override readonly sessionId = `${provider.id}:session-1`;
		};
		const sessionsManagementService = new class extends mock<ISessionsManagementService>() {
			override readonly onDidChangeSessions = Event.None;
			override getSession(resource: URI): ISession | undefined {
				return resource.toString() === sessionResource.toString() ? session : undefined;
			}
		};
		const sessionsService = new class extends mock<ISessionsService>() {
			override readonly activeSession = observableValue(this, undefined);
		};
		const sessionsProvidersService = new class extends mock<ISessionsProvidersService>() {
			constructor(private readonly _provider: ISessionsProvider) {
				super();
			}
			override getProvider<T extends ISessionsProvider>(): T | undefined {
				return this._provider as T;
			}
		}(provider);
		const instantiationService = store.add(new TestInstantiationService());
		instantiationService.stub(ILoggerService, store.add(new NullLoggerService()));
		instantiationService.stub(IOutputService, {
			getChannel: () => undefined,
			getChannelDescriptor: () => undefined,
			showChannel: async () => { },
		});
		const service = store.add(new AgentHostCustomizationService(
			sessionsManagementService,
			sessionsService,
			sessionsProvidersService,
			instantiationService,
			new NullLogService(),
			activeClientService ?? new class extends mock<IAgentHostActiveClientService>() {
				override isBundledMcpServer(): boolean { return false; }
			}(),
		));
		return { service, sessionResource };
	}

	test('reports client-bundled MCP servers from the active client', () => {
		const server: McpServerCustomization = {
			type: CustomizationType.McpServer,
			id: 'context7',
			uri: 'file:///plugin/.mcp.json',
			name: 'context7',
			state: { kind: McpServerStatus.Stopped },
		};
		const plugin: PluginCustomization = {
			type: CustomizationType.Plugin,
			id: 'plugin',
			uri: 'vscode-synced-customization:///plugin',
			name: 'Plugin',
			children: [server],
		};
		const provider = new class extends mock<IAgentHostSessionsProvider>() {
			override readonly id = 'agenthost-test';
			override readonly onDidChangeCustomAgents = Event.None;
			override readonly onDidChangeCustomizations = Event.None;
			override getCustomizations(): Customization[] {
				return [plugin];
			}
			override getWorkingDirectory(): string | undefined {
				return undefined;
			}
			override getWorkingDirectories(): readonly string[] {
				return [];
			}
			override mapAgentHostResource(resource: URI): URI {
				return resource;
			}
			override getRootConfig() {
				return undefined;
			}
			override getMcpServers() {
				return [];
			}
			override authenticate() {
				return Promise.resolve({ authenticated: false });
			}
			override setCustomizationEnablement(): void {
				// no-op
			}
		};
		const activeClientService = new class extends mock<IAgentHostActiveClientService>() {
			override isBundledMcpServer(pluginUri: string, serverName: string): boolean {
				return pluginUri === plugin.uri && serverName === server.name;
			}
		};
		const { service, sessionResource } = createSut(provider, activeClientService);

		const [mcpServer] = service.getMcpServers(sessionResource);

		assert.deepStrictEqual({ isClientBundled: mcpServer.isClientBundled }, { isClientBundled: true });
	});

	for (const authority of ['local', 'remote-test']) {
		test(`maps ${authority} roots and MCP sources without a feedback channel`, () => {
			const roots = [URI.file('/workspace'), URI.file('/second workspace')];
			const resourceUris = createAgentHostResourceUriMapper(authority);
			const server: McpServerCustomization = {
				type: CustomizationType.McpServer,
				id: 'server',
				uri: URI.joinPath(roots[0], '.mcp.json').toString(),
				name: 'Server',
				state: { kind: McpServerStatus.Stopped },
			};
			let feedbackChannelReads = 0;
			const provider = new class extends mock<IAgentHostSessionsProvider>() {
				override readonly id = authority === 'local' ? 'local-agent-host' : 'agenthost-remote-test';
				override readonly onDidChangeCustomAgents = Event.None;
				override readonly onDidChangeCustomizations = Event.None;
				override getCustomizations(): Customization[] { return [server]; }
				override getWorkingDirectory(): string { return roots[0].toString(); }
				override getWorkingDirectories(): readonly string[] { return roots.map(root => root.toString()); }
				override mapAgentHostResource(resource: URI): URI { return resourceUris.fromAgentHost(resource); }
				override getRootConfig() { return undefined; }
				override getFeedbackAnnotationsChannel() {
					feedbackChannelReads++;
					return undefined;
				}
			};
			const { service, sessionResource } = createSut(provider);

			assert.deepStrictEqual({
				primaryRoot: service.getWorkingDirectory(sessionResource),
				hostRoots: service.getWorkingDirectories(sessionResource),
				clientRoots: service.getWorkingDirectoryUris(sessionResource).map(root => root.toString()),
				mcpSource: service.getMcpServers(sessionResource)[0].sourceUri?.toString(),
				missingSessionRoots: service.getWorkingDirectoryUris(URI.parse('agent-host-copilot:///missing')),
				feedbackChannelReads,
			}, {
				primaryRoot: roots[0].toString(),
				hostRoots: roots.map(root => root.toString()),
				clientRoots: roots.map(root => resourceUris.fromAgentHost(root).toString()),
				mcpSource: resourceUris.fromAgentHost(URI.parse(server.uri)).toString(),
				missingSessionRoots: [],
				feedbackChannelReads: 0,
			});
		});
	}
});
