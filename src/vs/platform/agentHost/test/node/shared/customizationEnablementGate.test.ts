/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { Event } from '../../../../../base/common/event.js';
import { URI } from '../../../../../base/common/uri.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { isCustomizationEnabled, sortCustomizationEnablement } from '../../../common/customizationEnablement.js';
import { CustomizationEnablementKind, CustomizationType, McpServerStatus, type AgentCustomization, type ChildCustomization, type ClientPluginCustomization, type Customization, type CustomizationEnablement, type McpServerCustomization, type PluginCustomization } from '../../../common/state/protocol/channels-session/state.js';
import { IAgentHostCustomizationEnablementService, type CustomizationEnablementResolution, type ICustomizationEnablementTarget, type WorkingDirectoryState } from '../../../node/agentHostCustomizationEnablementService.js';
import { getSdkMcpServerEnablement, isCustomizationSdkEligible, recordClientPluginEnablement, resolveCustomizationEnablement } from '../../../node/shared/customizationEnablementGate.js';

class TestEnablementService implements IAgentHostCustomizationEnablementService {
	declare readonly _serviceBrand: undefined;
	readonly onDidChange = Event.None;
	private readonly _enablement = new Map<string, readonly CustomizationEnablement[]>();
	private readonly _enablementByDurableKey = new Map<string, readonly CustomizationEnablement[]>();
	private _pending: 'session' | 'workingDirectory' | undefined;
	lastResolvedTarget: ICustomizationEnablementTarget | undefined;

	setEnablementFor(id: string, enablement: readonly CustomizationEnablement[]): void {
		this._enablement.set(id, sortCustomizationEnablement(enablement));
	}

	setEnablementForDurableKey(key: string, enablement: readonly CustomizationEnablement[]): void {
		this._enablementByDurableKey.set(key, sortCustomizationEnablement(enablement));
	}

	setPending(reason: 'session' | 'workingDirectory' | undefined): void {
		this._pending = reason;
	}

	async initializeSession(_session: string): Promise<void> { }

	getWorkingDirectoryState(_session: string): WorkingDirectoryState {
		return { kind: 'workspaceless' };
	}

	resolve(_session: string, target: ICustomizationEnablementTarget): CustomizationEnablementResolution {
		this.lastResolvedTarget = target;
		if (this._pending !== undefined) {
			return { kind: 'pending', reason: this._pending };
		}
		return this._resolved(this._enablement.get(target.id) ?? this._enablementByDurableKey.get(this._key(target)) ?? []);
	}

	applyClientGlobalEnablement(session: string, target: ICustomizationEnablementTarget, enablement: readonly CustomizationEnablement[]): CustomizationEnablementResolution {
		const global = enablement.find(entry => entry.kind === CustomizationEnablementKind.Global);
		if (global === undefined) {
			throw new Error('Expected a global enablement entry');
		}
		const existing = this._enablement.get(target.id) ?? [];
		this._enablement.set(target.id, sortCustomizationEnablement([
			...existing.filter(entry => entry.kind !== CustomizationEnablementKind.Global),
			global,
		]));
		return this.resolve(session, target);
	}

	replaceEnablement(session: string, target: ICustomizationEnablementTarget, enablement: readonly CustomizationEnablement[]): CustomizationEnablementResolution {
		this._enablement.set(target.id, sortCustomizationEnablement(enablement));
		return this.resolve(session, target);
	}

	setEnablement(session: string, target: ICustomizationEnablementTarget, _kind: CustomizationEnablementKind, _enabled: boolean): CustomizationEnablementResolution {
		return this.resolve(session, target);
	}

	async whenIdle(): Promise<void> { }

	private _resolved(enablement: readonly CustomizationEnablement[]): CustomizationEnablementResolution {
		return {
			kind: 'resolved',
			enablement,
			enabled: isCustomizationEnabled({ enablement }),
			workingDirectory: { kind: 'workspaceless' },
		};
	}

	private _key(target: ICustomizationEnablementTarget): string {
		return target.type === CustomizationType.McpServer && target.owningPluginSource
			? `${target.owningPluginSource.toString()}#mcp=${target.name}`
			: target.id;
	}
}

function plugin(children?: ChildCustomization[]): PluginCustomization {
	return {
		type: CustomizationType.Plugin,
		id: 'plugin-id',
		uri: 'file:///plugins/example',
		name: 'Example Plugin',
		children,
	};
}

function server(): McpServerCustomization {
	return {
		type: CustomizationType.McpServer,
		id: 'server-id',
		uri: 'file:///plugins/example/.mcp.json',
		name: 'server',
		state: { kind: McpServerStatus.Starting },
	};
}

function agent(): AgentCustomization {
	return {
		type: CustomizationType.Agent,
		id: 'agent-id',
		uri: 'file:///plugins/example/agents/example.agent.md',
		name: 'agent',
	};
}

function sdkChildNames(customizations: readonly Customization[]): string[] {
	return customizations.flatMap(customization => {
		if (customization.type !== CustomizationType.Plugin || !isCustomizationEnabled(customization)) {
			return [];
		}
		return customization.children?.flatMap(child => child.type === CustomizationType.McpServer && isCustomizationEnabled(child) ? [child.name] : []) ?? [];
	});
}

function sdkAgentNames(customizations: readonly Customization[]): string[] {
	return customizations.flatMap(customization => {
		if (customization.type !== CustomizationType.Plugin || !isCustomizationEnabled(customization)) {
			return [];
		}
		return customization.children?.flatMap(child => child.type === CustomizationType.Agent ? [child.name] : []) ?? [];
	});
}

function firstChildEnablement(customizations: readonly Customization[]): readonly CustomizationEnablement[] | undefined {
	const first = customizations[0];
	const child = first?.type === CustomizationType.Plugin ? first.children?.[0] : undefined;
	if (child?.type !== CustomizationType.McpServer) {
		return undefined;
	}
	return child.enablement;
}

suite('CustomizationEnablementGate', () => {

	ensureNoDisposablesAreLeakedInTestSuite();

	test('does not fabricate enablement while a resolution is pending and excludes it from the SDK', () => {
		const service = new TestEnablementService();
		service.setPending('session');
		const customization = plugin([server()]);
		const resolved = resolveCustomizationEnablement(service, URI.parse('ahp://copilot/session-1'), [customization]);
		const child = (resolved.customizations[0] as PluginCustomization).children?.[0];

		assert.deepStrictEqual({
			pending: resolved.pending,
			pendingCustomizationIds: [...resolved.pendingCustomizationIds],
			published: resolved.customizations,
			sdkEligible: isCustomizationSdkEligible(resolved, customization),
			childSdkEligible: child && isCustomizationSdkEligible(resolved, child),
		}, {
			pending: true,
			pendingCustomizationIds: ['plugin-id', 'server-id'],
			published: [{
				...customization,
				children: [server()],
			}],
			sdkEligible: false,
			childSdkEligible: false,
		});
	});

	test('fails closed when deriving MCP server enablement for a pending resolution', () => {
		const service = new TestEnablementService();
		service.setPending('session');
		const resolved = resolveCustomizationEnablement(service, URI.parse('ahp://copilot/session-1'), [plugin([server()])]);

		assert.deepStrictEqual([...getSdkMcpServerEnablement(resolved)], [['server-id', false]]);
	});

	test('removes stale enablement when an empty resolution settles', () => {
		const service = new TestEnablementService();
		const customization: McpServerCustomization = {
			...server(),
			enablement: [{ kind: CustomizationEnablementKind.Session, enabled: false }],
		};
		const resolved = resolveCustomizationEnablement(service, URI.parse('ahp://copilot/session-1'), [customization]);

		assert.deepStrictEqual(resolved.customizations, [{
			type: CustomizationType.McpServer,
			id: 'server-id',
			uri: 'file:///plugins/example/.mcp.json',
			name: 'server',
			state: { kind: McpServerStatus.Starting },
		}]);
	});

	test('replaces only a child global decision while preserving host workspace and session decisions', () => {
		const service = new TestEnablementService();
		service.setEnablementFor('server-id', [
			{ kind: CustomizationEnablementKind.Session, enabled: false },
			{ kind: CustomizationEnablementKind.Workspace, uri: 'file:///repo', enabled: true },
			{ kind: CustomizationEnablementKind.Global, enabled: true },
		]);
		const parsedPlugin = plugin([server()]);
		const clientPlugin: ClientPluginCustomization = {
			...parsedPlugin,
			enablement: [{ kind: CustomizationEnablementKind.Global, enabled: true }],
			childEnablement: {
				server: [{ kind: CustomizationEnablementKind.Global, enabled: false }],
			},
		};

		recordClientPluginEnablement(service, URI.parse('ahp://copilot/session-1'), parsedPlugin, clientPlugin);
		const resolved = resolveCustomizationEnablement(service, URI.parse('ahp://copilot/session-1'), [parsedPlugin]);

		assert.deepStrictEqual(resolved.customizations, [{
			...parsedPlugin,
			enablement: [{ kind: CustomizationEnablementKind.Global, enabled: true }],
			children: [{
				...server(),
				enablement: [
					{ kind: CustomizationEnablementKind.Session, enabled: false },
					{ kind: CustomizationEnablementKind.Workspace, uri: 'file:///repo', enabled: true },
					{ kind: CustomizationEnablementKind.Global, enabled: false },
				],
			}],
		}]);
	});

	test('publishes a workspace decision for a materialized plugin MCP child in every session', () => {
		const service = new TestEnablementService();
		const pluginUri = 'file:///Users/connor/.vscode-oss-dev-dev/agent-plugins/github.com/microsoft/azure-skills/.github/plugins/azure-skills';
		const materializedChildId = 'file:///Users/connor/.vscode-oss-dev-dev/agentPlugins/19ff2ac36f2/.mcp.json#mcp=azure';
		const workspaceEnablement = [{ kind: CustomizationEnablementKind.Workspace, uri: 'file:///Users/connor/Github/js-debug-demos/node', enabled: false }] as const;
		service.setEnablementForDurableKey(`${pluginUri}#mcp=azure`, workspaceEnablement);
		const parsedPlugin: PluginCustomization = {
			...plugin([{
				...server(),
				id: materializedChildId,
				uri: 'file:///Users/connor/.vscode-oss-dev-dev/agentPlugins/19ff2ac36f2/.mcp.json',
				name: 'azure',
			}]),
			uri: pluginUri,
		};

		const firstSession = resolveCustomizationEnablement(service, URI.parse('ahp://copilot/session-1'), [parsedPlugin]);
		const secondSession = resolveCustomizationEnablement(service, URI.parse('ahp://copilot/session-2'), [parsedPlugin]);

		assert.deepStrictEqual({
			first: firstChildEnablement(firstSession.customizations),
			second: firstChildEnablement(secondSession.customizations),
			firstSdkChildren: sdkChildNames(firstSession.customizations),
			secondSdkChildren: sdkChildNames(secondSession.customizations),
		}, {
			first: workspaceEnablement,
			second: workspaceEnablement,
			firstSdkChildren: [],
			secondSdkChildren: [],
		});
	});

	test('publishes a global decision for a materialized plugin MCP child in a newly created session', () => {
		const service = new TestEnablementService();
		const pluginUri = 'file:///plugins/azure-skills';
		const globalEnablement = [{ kind: CustomizationEnablementKind.Global, enabled: false }] as const;
		service.setEnablementForDurableKey(`${pluginUri}#mcp=azure`, globalEnablement);
		const parsedPlugin: PluginCustomization = {
			...plugin([{ ...server(), name: 'azure' }]),
			uri: pluginUri,
		};

		const resolved = resolveCustomizationEnablement(service, URI.parse('ahp://copilot/new-session'), [parsedPlugin]);

		assert.deepStrictEqual(firstChildEnablement(resolved.customizations), globalEnablement);
	});

	test('resolves a plugin MCP server to the same durable identity while nested or top-level', () => {
		const service = new TestEnablementService();
		const pluginUri = 'file:///plugins/azure-skills';
		const enablement = [{ kind: CustomizationEnablementKind.Global, enabled: false }] as const;
		service.setEnablementForDurableKey(`${pluginUri}#mcp=azure`, enablement);
		const nested = plugin([{ ...server(), name: 'azure' }]);
		const topLevel: McpServerCustomization = {
			...server(),
			id: 'mcp-top-level:copilot:new-session:azure',
			uri: 'mcp-top-level:copilot:new-session:azure',
			name: 'azure',
		};

		const nestedResolved = resolveCustomizationEnablement(service, URI.parse('ahp://copilot/new-session'), [{ ...nested, uri: pluginUri }]);
		const topLevelResolved = resolveCustomizationEnablement(
			service,
			URI.parse('ahp://copilot/new-session'),
			[topLevel],
			new Map([[pluginUri, { azure: [] }]]),
			undefined,
			new Map([['azure', pluginUri]]),
		);

		assert.deepStrictEqual({
			nested: firstChildEnablement(nestedResolved.customizations),
			topLevel: (topLevelResolved.customizations[0] as McpServerCustomization).enablement,
			topLevelIsClientBundled: service.lastResolvedTarget?.isClientBundled,
		}, {
			nested: enablement,
			topLevel: enablement,
			topLevelIsClientBundled: true,
		});
	});

	test('retains a plugin child global decision when its client republish has no opinion', () => {
		const service = new TestEnablementService();
		service.setEnablementFor('server-id', [{ kind: CustomizationEnablementKind.Global, enabled: false }]);
		const parsedPlugin = plugin([server()]);
		const clientChildEnablement = new Map<string, Readonly<Record<string, readonly CustomizationEnablement[]>>>([[parsedPlugin.uri, {
			server: [],
		}]]);

		const resolved = resolveCustomizationEnablement(
			service,
			URI.parse('ahp://copilot/session-1'),
			[parsedPlugin],
			clientChildEnablement,
			new Map([[parsedPlugin.uri, { ...parsedPlugin, enablement: [{ kind: CustomizationEnablementKind.Global, enabled: true }] }]]),
		);

		const resolvedChild = (resolved.customizations[0] as PluginCustomization).children?.[0] as McpServerCustomization;
		assert.deepStrictEqual({
			enablement: resolvedChild.enablement,
			isClientBundled: service.lastResolvedTarget?.isClientBundled,
			publishesClientBundled: Object.hasOwn(resolvedChild, 'isClientBundled'),
		}, {
			enablement: [{ kind: CustomizationEnablementKind.Global, enabled: false }],
			isClientBundled: true,
			publishesClientBundled: false,
		});
	});

	test('masks a child when its plugin is disabled without erasing the child decision', () => {
		const service = new TestEnablementService();
		service.setEnablementFor('plugin-id', [{ kind: CustomizationEnablementKind.Global, enabled: false }]);
		service.setEnablementFor('server-id', [{ kind: CustomizationEnablementKind.Session, enabled: true }]);
		const parsedPlugin = plugin([server()]);

		const disabled = resolveCustomizationEnablement(service, URI.parse('ahp://copilot/session-1'), [parsedPlugin]);
		service.setEnablementFor('plugin-id', []);
		const reenabled = resolveCustomizationEnablement(service, URI.parse('ahp://copilot/session-1'), [parsedPlugin]);

		assert.deepStrictEqual({
			disabledSdkChildren: sdkChildNames(disabled.customizations),
			reenabledSdkChildren: sdkChildNames(reenabled.customizations),
			childEnablementAfterReenable: firstChildEnablement(reenabled.customizations),
		}, {
			disabledSdkChildren: [],
			reenabledSdkChildren: ['server'],
			childEnablementAfterReenable: [{ kind: CustomizationEnablementKind.Session, enabled: true }],
		});
	});

	test('keeps disabled plugin agents out of the SDK handoff', () => {
		const service = new TestEnablementService();
		service.setEnablementFor('plugin-id', [{ kind: CustomizationEnablementKind.Global, enabled: false }]);
		const parsedPlugin = plugin([agent()]);

		const disabled = resolveCustomizationEnablement(service, URI.parse('ahp://copilot/session-1'), [parsedPlugin]);
		service.setEnablementFor('plugin-id', []);
		const reenabled = resolveCustomizationEnablement(service, URI.parse('ahp://copilot/session-1'), [parsedPlugin]);

		assert.deepStrictEqual({
			disabledSdkAgents: sdkAgentNames(disabled.customizations),
			reenabledSdkAgents: sdkAgentNames(reenabled.customizations),
		}, {
			disabledSdkAgents: [],
			reenabledSdkAgents: ['agent'],
		});
	});
});
