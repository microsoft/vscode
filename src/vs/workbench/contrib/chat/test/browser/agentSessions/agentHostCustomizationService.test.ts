/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { ResourceMap } from '../../../../../../base/common/map.js';
import { URI } from '../../../../../../base/common/uri.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../../base/test/common/utils.js';
import { CustomizationType, McpServerCustomization, McpServerStatus } from '../../../../../../platform/agentHost/common/state/protocol/state.js';
import { IOutputService } from '../../../../../services/output/common/output.js';
import { TestInstantiationService } from '../../../../../../platform/instantiation/test/common/instantiationServiceMock.js';
import { ILogService, ILoggerService, NullLogService, NullLoggerService } from '../../../../../../platform/log/common/log.js';
import { AbstractAgentHostCustomizationService, IAgentHostCustomizationTarget } from '../../../browser/agentSessions/agentHost/agentHostCustomizationService.js';

class FakeTarget implements IAgentHostCustomizationTarget {
	readonly sessionToggles: { readonly rawId: string; readonly enabled: boolean }[] = [];
	readonly globalToggles: { readonly rawId: string; readonly enabled: boolean }[] = [];

	constructor(readonly customizations: McpServerCustomization[]) { }

	authenticate(): Promise<unknown> { return Promise.resolve(undefined); }
	setMcpServerSessionEnabled(rawId: string, enabled: boolean): void {
		this.sessionToggles.push({ rawId, enabled });
	}
	setMcpServerGlobalEnabled(rawId: string, enabled: boolean): void {
		this.globalToggles.push({ rawId, enabled });
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

	test('dispatches session and global enablement independently', () => {
		const sut = createSut();
		const session = URI.parse('vscode-agent-session:///session-1');
		const target = new FakeTarget([mcpServer('server-1', 'Server One')]);
		sut.setTarget(session, target);

		const [server] = sut.getMcpServers(session);
		server.setEnabled(false);
		sut.setMcpServerGlobalEnablement(session, server.id, true);

		assert.deepStrictEqual({
			session: target.sessionToggles,
			global: target.globalToggles,
		}, {
			session: [{ rawId: 'server-1', enabled: false }],
			global: [{ rawId: 'server-1', enabled: true }],
		});
	});

	test('provides a stable diagnostics output channel id without creating a logger', () => {
		const sut = createSut();
		const session = URI.parse('vscode-agent-session:///session-1');
		sut.setTarget(session, new FakeTarget([mcpServer('server-1', 'Server One')]));

		const [first] = sut.getMcpServers(session);
		const [second] = sut.getMcpServers(session);

		assert.strictEqual(second.logOutputChannelId, first.logOutputChannelId);
	});
});
