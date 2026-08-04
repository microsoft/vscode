/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { ResourceMap } from '../../../../../../base/common/map.js';
import { URI } from '../../../../../../base/common/uri.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../../base/test/common/utils.js';
import { TestInstantiationService } from '../../../../../../platform/instantiation/test/common/instantiationServiceMock.js';
import { ILogService, NullLogService, ILoggerService, NullLoggerService } from '../../../../../../platform/log/common/log.js';
import { withCustomizationEnablement } from '../../../../../../platform/agentHost/common/customizationEnablement.js';
import { CustomizationEnablementKind, CustomizationType, McpServerCustomization, McpServerStatus, type Customization, type CustomizationEnablement } from '../../../../../../platform/agentHost/common/state/protocol/state.js';
import { ContributionEnablementState } from '../../../common/enablement.js';
import { AbstractAgentHostCustomizationService, IAgentHostCustomizationTarget } from '../../../browser/agentSessions/agentHost/agentHostCustomizationService.js';
import { IOutputService } from '../../../../../services/output/common/output.js';

interface IDispatchedToggle {
	readonly rawId: string;
	readonly enablement: CustomizationEnablement[];
}

class FakeTarget implements IAgentHostCustomizationTarget {
	readonly dispatched: IDispatchedToggle[] = [];
	readonly workingDirectories = ['file:///repo'];

	constructor(readonly customizations: Customization[]) { }

	authenticate(): Promise<unknown> { return Promise.resolve(undefined); }
	setCustomizationEnabled(rawId: string, enablement: CustomizationEnablement[]): void {
		this.dispatched.push({ rawId, enablement });
	}
	startMcpServer(): Promise<void> { return Promise.resolve(); }
	stopMcpServer(): Promise<void> { return Promise.resolve(); }
	setRootConfigValue(): void { }
}

function mcpServer(id: string, name: string, enabled: boolean, enablement?: CustomizationEnablement): McpServerCustomization {
	return {
		type: CustomizationType.McpServer,
		id,
		uri: `file:///${id}`,
		name,
		enabled,
		...(enablement ? { enablement: [enablement] } : {}),
		state: { kind: McpServerStatus.Stopped },
	};
}

class TestAgentHostCustomizationService extends AbstractAgentHostCustomizationService {
	private readonly _targets = new ResourceMap<FakeTarget>();

	constructor(instantiationService: TestInstantiationService, logService: ILogService) {
		super(instantiationService, logService);
	}

	setTarget(sessionResource: URI, target: FakeTarget): void {
		this._targets.set(sessionResource, target);
	}

	protected override _resolveTarget(sessionResource: URI): IAgentHostCustomizationTarget | undefined {
		return this._targets.get(sessionResource);
	}
}

suite('AbstractAgentHostCustomizationService - MCP server enablement', () => {
	const store = ensureNoDisposablesAreLeakedInTestSuite();
	const session = URI.from({ scheme: 'agent-host-copilotcli', authority: 'session-a', path: '/' });

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

	test('dispatches global enablement for profile state', () => {
		const sut = createSut();
		const target = new FakeTarget([mcpServer('github', 'GitHub', true)]);
		sut.setTarget(session, target);

		sut.setMcpServerEnablement(session, 'GitHub', ContributionEnablementState.DisabledProfile);

		assert.deepStrictEqual(target.dispatched, [{ rawId: 'github', enablement: [{ kind: CustomizationEnablementKind.Global, enabled: false }] }]);
	});

	test('dispatches working-directory enablement for workspace state', () => {
		const sut = createSut();
		const target = new FakeTarget([mcpServer('github', 'GitHub', true)]);
		sut.setTarget(session, target);

		sut.setMcpServerEnablement(session, 'GitHub', ContributionEnablementState.EnabledWorkspace);

		assert.deepStrictEqual(target.dispatched, [{ rawId: 'github', enablement: [{ kind: CustomizationEnablementKind.Workspace, uri: 'file:///repo', enabled: true }] }]);
	});

	test('dispatches session enablement for direct server toggles', () => {
		const sut = createSut();
		const target = new FakeTarget([mcpServer('github', 'GitHub', true)]);
		sut.setTarget(session, target);

		sut.getMcpServers(session)[0].setEnabled(false);

		assert.deepStrictEqual(target.dispatched, [{ rawId: 'github', enablement: [{ kind: CustomizationEnablementKind.Session, enabled: false }] }]);
	});

	test('dispatches a plugin scope toggle with the complete enablement array', () => {
		const sut = createSut();
		const target = new FakeTarget([{
			type: CustomizationType.Plugin,
			id: 'plugin-1',
			uri: 'file:///plugin-1',
			name: 'Plugin One',
			enabled: false,
			enablement: [
				{ kind: CustomizationEnablementKind.Session, enabled: false },
				{ kind: CustomizationEnablementKind.Global, enabled: false },
			],
		}]);
		sut.setTarget(session, target);

		sut.setCustomizationEnablement(session, 'plugin-1', [
			{ kind: CustomizationEnablementKind.Session, enabled: true },
			{ kind: CustomizationEnablementKind.Global, enabled: false },
		]);

		assert.deepStrictEqual(target.dispatched, [{
			rawId: 'plugin-1',
			enablement: [
				{ kind: CustomizationEnablementKind.Session, enabled: true },
				{ kind: CustomizationEnablementKind.Global, enabled: false },
			],
		}]);
	});

	test('preserves enablement updates that occur after retrieving a server', () => {
		const sut = createSut();
		const target = new FakeTarget([mcpServer('github', 'GitHub', true, { kind: CustomizationEnablementKind.Global, enabled: true })]);
		sut.setTarget(session, target);
		const [server] = sut.getMcpServers(session);
		target.customizations[0] = {
			...target.customizations[0],
			enablement: [
				{ kind: CustomizationEnablementKind.Workspace, uri: 'file:///disabled', enabled: false },
				{ kind: CustomizationEnablementKind.Global, enabled: true },
			],
		};

		server.setEnabled(true);

		assert.deepStrictEqual(target.dispatched, [{
			rawId: 'github',
			enablement: [
				{ kind: CustomizationEnablementKind.Session, enabled: true },
				{ kind: CustomizationEnablementKind.Workspace, uri: 'file:///disabled', enabled: false },
				{ kind: CustomizationEnablementKind.Global, enabled: true },
			],
		}]);
	});

	test('reads host-published effective enablement', () => {
		const sut = createSut();
		sut.setTarget(session, new FakeTarget([
			mcpServer('workspace', 'Workspace', false, { kind: CustomizationEnablementKind.Workspace, uri: 'file:///repo', enabled: false }),
			mcpServer('session', 'Session', false, { kind: CustomizationEnablementKind.Session, enabled: false }),
		]));

		assert.deepStrictEqual({
			workspace: sut.getMcpServerEnablement(session, 'Workspace'),
			session: sut.getMcpServerEnablement(session, 'Session'),
		}, {
			workspace: ContributionEnablementState.DisabledWorkspace,
			session: ContributionEnablementState.EnabledProfile,
		});
	});

	test('uses the workspace veto when reporting multi-root durable enablement', () => {
		const sut = createSut();
		sut.setTarget(session, new FakeTarget([{
			...mcpServer('workspace', 'Workspace', false),
			enablement: [
				{ kind: CustomizationEnablementKind.Workspace, uri: 'file:///disabled', enabled: false },
				{ kind: CustomizationEnablementKind.Workspace, uri: 'file:///enabled', enabled: true },
			],
		}]));

		assert.strictEqual(sut.getMcpServerEnablement(session, 'Workspace'), ContributionEnablementState.DisabledWorkspace);
	});

	test('reports durable enablement when a session override disables a globally enabled server', () => {
		const sut = createSut();
		sut.setTarget(session, new FakeTarget([
			{
				...mcpServer('session', 'Session', false),
				enablement: [{ kind: CustomizationEnablementKind.Session, enabled: false }, { kind: CustomizationEnablementKind.Global, enabled: true }],
			},
		]));

		assert.strictEqual(sut.getMcpServerEnablement(session, 'Session'), ContributionEnablementState.EnabledProfile);
	});

	test('session enablement upsert preserves the global decision', () => {
		assert.deepStrictEqual(
			withCustomizationEnablement(
				[{ kind: CustomizationEnablementKind.Global, enabled: false }],
				CustomizationEnablementKind.Session,
				{ kind: CustomizationEnablementKind.Session, enabled: true },
			),
			[{ kind: CustomizationEnablementKind.Session, enabled: true }, { kind: CustomizationEnablementKind.Global, enabled: false }],
		);
	});

	test('masks the enabled state of an MCP server contained by a disabled plugin', () => {
		const sut = createSut();
		sut.setTarget(session, new FakeTarget([{
			type: CustomizationType.Plugin,
			id: 'plugin-1',
			uri: 'file:///plugin-1',
			name: 'Plugin One',
			enabled: false,
			children: [mcpServer('github', 'GitHub', true, { kind: CustomizationEnablementKind.Session, enabled: true })],
		}]));

		assert.deepStrictEqual(sut.getMcpServers(session).map(server => ({
			name: server.name,
			enabled: server.enabled,
			enablement: server.enablement,
		})), [{
			name: 'GitHub',
			enabled: false,
			enablement: [{ kind: CustomizationEnablementKind.Session, enabled: true }],
		}]);
	});
});
