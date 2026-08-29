/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { ResourceMap } from '../../../../../../base/common/map.js';
import { URI } from '../../../../../../base/common/uri.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../../base/test/common/utils.js';
import { CustomizationEnablementKind, CustomizationType, McpServerCustomization, McpServerStatus, type Customization, type CustomizationEnablement } from '../../../../../../platform/agentHost/common/state/protocol/state.js';
import { createAgentHostResourceUriMapper, identityAgentHostResourceUriMapper, IAgentHostResourceUriMapper } from '../../../../../../platform/agentHost/common/agentHostUri.js';
import { IOutputService } from '../../../../../services/output/common/output.js';
import { TestInstantiationService } from '../../../../../../platform/instantiation/test/common/instantiationServiceMock.js';
import { ILogService, ILoggerService, NullLogService, NullLoggerService } from '../../../../../../platform/log/common/log.js';
import { AbstractAgentHostCustomizationService, IAgentHostCustomizationTarget } from '../../../browser/agentSessions/agentHost/agentHostCustomizationService.js';

class FakeTarget implements IAgentHostCustomizationTarget {
	readonly enablementChanges: { readonly rawId: string; readonly enablement: readonly CustomizationEnablement[] }[] = [];

	constructor(
		readonly customizations: readonly Customization[],
		readonly workingDirectory?: string,
		private readonly _isBundledMcpServer: (pluginUri: string, serverName: string) => boolean = () => false,
		readonly resourceUris: IAgentHostResourceUriMapper = identityAgentHostResourceUriMapper,
	) { }

	isBundledMcpServer(pluginUri: string, serverName: string): boolean {
		return this._isBundledMcpServer(pluginUri, serverName);
	}

	authenticate(): Promise<unknown> { return Promise.resolve(undefined); }
	setCustomizationEnablement(rawId: string, enablement: readonly CustomizationEnablement[]): void {
		this.enablementChanges.push({ rawId, enablement });
	}
	startMcpServer(): Promise<void> { return Promise.resolve(); }
	stopMcpServer(): Promise<void> { return Promise.resolve(); }
	setRootConfigValue(): void { /* no-op */ }
}

function mcpServer(id: string, name: string): McpServerCustomization {
	return {
		type: CustomizationType.McpServer,
		id,
		uri: `file:///${id}`,
		name,
		state: { kind: McpServerStatus.Stopped },
	};
}

class TestAgentHostCustomizationService extends AbstractAgentHostCustomizationService {
	private readonly _targets = new ResourceMap<FakeTarget>();

	constructor(
		instantiationService: TestInstantiationService,
		logService: ILogService,
	) {
		super(instantiationService, logService);
	}

	setTarget(sessionResource: URI, target: FakeTarget): void {
		this._targets.set(sessionResource, target);
	}

	protected override _resolveTarget(sessionResource: URI): IAgentHostCustomizationTarget | undefined {
		return this._targets.get(sessionResource);
	}
}

suite('AbstractAgentHostCustomizationService', () => {
	const store = ensureNoDisposablesAreLeakedInTestSuite();

	function createSut(): TestAgentHostCustomizationService {
		const instantiationService = store.add(new TestInstantiationService());
		instantiationService.stub(ILoggerService, store.add(new NullLoggerService()));
		instantiationService.stub(IOutputService, {
			getChannel: () => undefined,
			getChannelDescriptor: () => undefined,
			showChannel: async () => { },
		});
		return store.add(new TestAgentHostCustomizationService(instantiationService, new NullLogService()));
	}

	test('dispatches complete enablement decisions', () => {
		const sut = createSut();
		const session = URI.parse('vscode-agent-session:///session-1');
		const target = new FakeTarget([mcpServer('server-1', 'Server One')]);
		sut.setTarget(session, target);

		const [server] = sut.getMcpServers(session);
		server.setEnabled(false);
		sut.setCustomizationEnablement(session, server.id, undefined, CustomizationEnablementKind.Global, true);

		assert.deepStrictEqual(target.enablementChanges, [
			{ rawId: 'server-1', enablement: [{ kind: CustomizationEnablementKind.Session, enabled: false }] },
			{ rawId: 'server-1', enablement: [{ kind: CustomizationEnablementKind.Global, enabled: true }] },
		]);
	});

	test('dispatches enablement for an MCP server contributed by a plugin', () => {
		const sut = createSut();
		const session = URI.parse('vscode-agent-session:///session-1');
		const server = mcpServer('server-1', 'Server One');
		const target = new FakeTarget([{
			type: CustomizationType.Plugin,
			id: 'plugin-1',
			uri: 'file:///plugin-1',
			name: 'Plugin One',
			children: [server],
		} as unknown as Customization]);
		sut.setTarget(session, target);

		const [pluginServer] = sut.getMcpServers(session);
		sut.setCustomizationEnablement(session, pluginServer.id, undefined, CustomizationEnablementKind.Global, false);

		assert.deepStrictEqual(target.enablementChanges, [
			{ rawId: 'server-1', enablement: [{ kind: CustomizationEnablementKind.Global, enabled: false }] },
		]);
	});

	test('derives client-bundled MCP server ownership from its plugin', () => {
		const sut = createSut();
		const session = URI.parse('vscode-agent-session:///session-1');
		const server = mcpServer('server-1', 'Server One');
		const target = new FakeTarget([{
			type: CustomizationType.Plugin,
			id: 'plugin-1',
			uri: 'vscode-synced-customization:///agent-host-copilot',
			name: 'Synced',
			children: [server],
		} as unknown as Customization], undefined, (pluginUri, serverName) => pluginUri === 'vscode-synced-customization:///agent-host-copilot' && serverName === 'Server One');
		sut.setTarget(session, target);

		const [pluginServer] = sut.getMcpServers(session);

		assert.strictEqual(pluginServer.isClientBundled, true);
	});

	test('maps host MCP sources and omits synthetic top-level sources', () => {
		const sut = createSut();
		const session = URI.parse('vscode-agent-session:///session-1');
		const fileServer = mcpServer('file-server', 'File Server');
		const topLevelServer = { ...mcpServer('top-level-server', 'Top Level Server'), uri: 'mcp-top-level:/top-level-server' };
		const resourceUris = createAgentHostResourceUriMapper('remote.example');
		sut.setTarget(session, new FakeTarget([fileServer, topLevelServer], undefined, undefined, resourceUris));

		const servers = sut.getMcpServers(session);

		assert.deepStrictEqual(servers.map(server => server.sourceUri?.toString()), [
			resourceUris.fromAgentHost(URI.parse(fileServer.uri)).toString(),
			undefined,
		]);
	});

	test('preserves global and session decisions when re-enabling workspace enablement', () => {
		const sut = createSut();
		const session = URI.parse('vscode-agent-session:///session-1');
		const enablement: CustomizationEnablement[] = [
			{ kind: CustomizationEnablementKind.Global, enabled: false },
			{ kind: CustomizationEnablementKind.Workspace, uri: 'file:///workspace', enabled: false },
			{ kind: CustomizationEnablementKind.Session, enabled: false },
		];
		const server = {
			...mcpServer('server-1', 'Server One'),
			enablement,
		};
		const target = new FakeTarget([server], 'file:///workspace');
		sut.setTarget(session, target);

		sut.setCustomizationEnablement(session, server.id, server.enablement, CustomizationEnablementKind.Workspace, true);

		assert.deepStrictEqual(target.enablementChanges, [{
			rawId: 'server-1',
			enablement: [
				{ kind: CustomizationEnablementKind.Session, enabled: false },
				{ kind: CustomizationEnablementKind.Workspace, uri: 'file:///workspace', enabled: true },
				{ kind: CustomizationEnablementKind.Global, enabled: false },
			],
		}]);
	});

	test('provides a stable diagnostics output channel id without creating a logger', () => {
		const sut = createSut();
		const session = URI.parse('vscode-agent-session:///session-1');
		sut.setTarget(session, new FakeTarget([mcpServer('server-1', 'Server One')]));

		const [first] = sut.getMcpServers(session);
		const [second] = sut.getMcpServers(session);

		assert.strictEqual(second.logOutputChannelId, first.logOutputChannelId);
	});

	test('surfaces the host-published winning disabled reason for MCP servers', () => {
		const sut = createSut();
		const session = URI.parse('vscode-agent-session:///session-1');
		sut.setTarget(session, new FakeTarget([{
			...mcpServer('server-1', 'Server One'),
			enablement: [
				{ kind: CustomizationEnablementKind.Session, enabled: false },
				{ kind: CustomizationEnablementKind.Global, enabled: true },
			],
		}]));

		const [server] = sut.getMcpServers(session);

		assert.deepStrictEqual({
			enabled: server.enabled,
			disabledReason: server.disabledReason,
		}, {
			enabled: false,
			disabledReason: { source: 'scope', scope: CustomizationEnablementKind.Session },
		});
	});

	test('keeps plugin MCP servers visible and gives the disabled plugin precedence over child decisions', () => {
		const sut = createSut();
		const session = URI.parse('vscode-agent-session:///session-1');
		const pluginEnablement: CustomizationEnablement[] = [
			{ kind: CustomizationEnablementKind.Workspace, uri: 'file:///workspace', enabled: false },
			{ kind: CustomizationEnablementKind.Global, enabled: true },
		];
		const childEnablement: CustomizationEnablement[] = [{ kind: CustomizationEnablementKind.Session, enabled: false }];
		const server = { ...mcpServer('server-1', 'Server One'), enablement: childEnablement };
		const plugin = {
			type: CustomizationType.Plugin,
			id: 'plugin-1',
			uri: 'file:///plugin-1',
			name: 'Plugin One',
			enablement: pluginEnablement,
			children: [server],
		} as unknown as Customization;
		const target = new FakeTarget([plugin], 'file:///workspace');
		sut.setTarget(session, target);

		const [disabledServer] = sut.getMcpServers(session);
		assert.deepStrictEqual({
			enabled: disabledServer.enabled,
			disabledReason: disabledServer.disabledReason,
		}, {
			enabled: false,
			disabledReason: {
				source: 'plugin',
				plugin: {
					id: 'plugin-1',
					name: 'Plugin One',
					uri: 'file:///plugin-1',
					enablement: pluginEnablement,
				},
			},
		});

		sut.setCustomizationEnablement(session, 'plugin-1', pluginEnablement, CustomizationEnablementKind.Workspace, true);
		assert.deepStrictEqual(target.enablementChanges, [{
			rawId: 'plugin-1',
			enablement: [
				{ kind: CustomizationEnablementKind.Workspace, uri: 'file:///workspace', enabled: true },
				{ kind: CustomizationEnablementKind.Global, enabled: true },
			],
		}]);

		const enabledPlugin = { ...plugin, enablement: target.enablementChanges[0].enablement } as unknown as Customization;
		sut.setTarget(session, new FakeTarget([enabledPlugin], 'file:///workspace'));
		const [restoredServer] = sut.getMcpServers(session);
		assert.deepStrictEqual({
			enabled: restoredServer.enabled,
			disabledReason: restoredServer.disabledReason,
		}, {
			enabled: false,
			disabledReason: { source: 'scope', scope: CustomizationEnablementKind.Session },
		});
	});
});
