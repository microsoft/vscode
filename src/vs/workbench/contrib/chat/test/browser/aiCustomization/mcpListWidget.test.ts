/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import * as DOM from '../../../../../../base/browser/dom.js';
import { Button, unthemedButtonStyles } from '../../../../../../base/browser/ui/button/button.js';
import { URI } from '../../../../../../base/common/uri.js';
import { Action, IAction, Separator } from '../../../../../../base/common/actions.js';
import { DisposableStore, isDisposable } from '../../../../../../base/common/lifecycle.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../../base/test/common/utils.js';
import { CustomizationEnablementKind, McpServerStatus, type CustomizationEnablement } from '../../../../../../platform/agentHost/common/state/protocol/state.js';
import { ContributionEnablementState } from '../../../common/enablement.js';
import { ICommandService } from '../../../../../../platform/commands/common/commands.js';
import { IAgentHostCustomizationService } from '../../../browser/agentSessions/agentHost/agentHostCustomizationService.js';
import { IAgentPluginService } from '../../../common/plugins/agentPluginService.js';
import { IMcpServer, IMcpService, IWorkbenchMcpServer, McpConnectionState } from '../../../../mcp/common/mcpTypes.js';
import { DisableMcpServerForWorkspaceAction, DisableMcpServerGloballyAction, EnableMcpServerForWorkspaceAction, EnableMcpServerGloballyAction } from '../../../../mcp/browser/mcpServerActions.js';
import {
	AgentHostMcpServer,
	authenticateMcpServer,
	createBuiltinActiveSessionMcpEntries,
	getActiveSessionServerLifecycleAction,
	getActiveSessionServerPresentation,
	getBuiltinMcpServerEnablementActions,
	getActiveSessionServerOptionsActions,
	getAgentHostMcpServerEnablementActions,
	getLocalMcpServerEnablementActions,
	getMcpServerOutputHandler,
	getMcpStatusPresentation,
	countSessionOnlyMcpServers,
	getAgentOriginLabel,
	getEnablementTarget,
	getMcpStatusRenderSignature,
	isNoteworthyMcpStatus,
	getServerItemContextMenuActions,
	registerMcpInlineButtonAction,
	type IMcpStatusRenderInput,
} from '../../../browser/aiCustomization/mcpListWidget.js';

function createAgentHostServer(overrides: Partial<AgentHostMcpServer> = {}): AgentHostMcpServer {
	return {
		id: 'server-1',
		name: 'Server One',
		enabled: true,
		status: McpServerStatus.Ready,
		state: { kind: McpServerStatus.Ready },
		setEnabled: () => { },
		start: () => { },
		stop: () => { },
		...overrides,
	} as AgentHostMcpServer;
}

function createAgentHostCustomizations(hasWorkspace = true): { service: IAgentHostCustomizationService; calls: unknown[][] } {
	const calls: unknown[][] = [];
	const service = {
		getWorkingDirectories: () => hasWorkspace ? ['file:///workspace'] : [],
		setCustomizationEnablement: (sessionResource: URI, serverId: string, enablement: unknown, kind: unknown, enabled: boolean) => {
			calls.push([sessionResource, serverId, enablement, kind, enabled]);
		},
	} as unknown as IAgentHostCustomizationService;
	return { service, calls };
}

function createAgentPluginService(calls?: unknown[][]): IAgentPluginService {
	return {
		enablementModel: { setEnabled: (...args: unknown[]) => calls?.push(args) },
	} as unknown as IAgentPluginService;
}

function createMcpService(enablement: ContributionEnablementState): { service: IMcpService; calls: [string, ContributionEnablementState][] } {
	const calls: [string, ContributionEnablementState][] = [];
	const service = {
		enablementModel: {
			readEnabled: () => enablement,
			setEnabled: (key: string, state: ContributionEnablementState) => {
				calls.push([key, state]);
			},
		},
	} as unknown as IMcpService;
	return { service, calls };
}

function runAction(action: IAction | undefined): void {
	assert.ok(action, 'expected an action to be defined');
	void action.run();
}

function trackActions(store: Pick<DisposableStore, 'add'>, actions: readonly IAction[]): IAction[] {
	for (const action of actions) {
		if (isDisposable(action)) {
			store.add(action);
		}
	}
	return [...actions];
}

suite('mcpListWidget', () => {
	const disposables = ensureNoDisposablesAreLeakedInTestSuite();

	test('classifies active-session-only MCP servers as built-in entries', () => {
		const server = createAgentHostServer({ name: 'node_repl' });

		assert.deepStrictEqual(createBuiltinActiveSessionMcpEntries([server]), [{
			type: 'session-server-item',
			server,
		}]);
	});

	test('renders host-published disabled reasons without changing legacy rows', () => {
		assert.deepStrictEqual([
			getMcpStatusPresentation('disabled', { source: 'scope', scope: CustomizationEnablementKind.Global })?.label,
			getMcpStatusPresentation('disabled', { source: 'scope', scope: CustomizationEnablementKind.Workspace })?.label,
			getMcpStatusPresentation('disabled', { source: 'scope', scope: CustomizationEnablementKind.Session })?.label,
			getMcpStatusPresentation('disabled', { source: 'plugin', plugin: { id: 'plugin-1', name: 'Plugin One', uri: URI.file('/plugins/plugin-1').toString(), enablement: [{ kind: CustomizationEnablementKind.Workspace, uri: 'file:///workspace', enabled: false }] } })?.label,
			getMcpStatusPresentation(McpServerStatus.Ready)?.label,
			getMcpStatusPresentation('disabled')?.label,
		], [
			'Disabled',
			'Disabled (Workspace)',
			'Disabled (Session)',
			'Disabled (Plugin)',
			'Running',
			'Disabled',
		]);
	});

	suite('isNoteworthyMcpStatus', () => {

		test('lifecycle is not news, but anything needing attention is', () => {
			assert.deepStrictEqual([
				undefined,
				McpServerStatus.Ready,
				McpConnectionState.Kind.Running,
				McpServerStatus.Stopped,
				McpConnectionState.Kind.Stopped,
				McpServerStatus.Starting,
				McpServerStatus.AuthRequired,
				McpServerStatus.Error,
				McpConnectionState.Kind.Error,
				'disabled' as const,
			].map(isNoteworthyMcpStatus), [
				false, false, false, false, false,
				true, true, true, true, true,
			]);
		});

		test('names a state for every status a row can be in', () => {
			assert.deepStrictEqual([
				getMcpStatusPresentation(McpServerStatus.Stopped)?.label,
				getMcpStatusPresentation(McpServerStatus.Starting)?.label,
				getMcpStatusPresentation(McpServerStatus.AuthRequired)?.label,
				getMcpStatusPresentation(McpServerStatus.Error)?.label,
				getMcpStatusPresentation(undefined)?.label,
			], [
				'Idle',
				'Starting',
				'Sign-in needed',
				'Failed',
				undefined,
			]);
		});
	});

	test('uses the current active-session server enablement for rows and lifecycle actions', () => {
		const disabledServer = createAgentHostServer({ enabled: false });
		const enabledServer = createAgentHostServer({ enabled: true });
		const disabledLifecycleAction = getActiveSessionServerLifecycleAction(disabledServer);
		const enabledLifecycleAction = getActiveSessionServerLifecycleAction(enabledServer);
		if (disabledLifecycleAction) {
			disposables.add(disabledLifecycleAction);
		}
		if (enabledLifecycleAction) {
			disposables.add(enabledLifecycleAction);
		}

		assert.deepStrictEqual([
			{
				renderedDisabled: getActiveSessionServerPresentation(disabledServer).status === 'disabled',
				hasLifecycleAction: disabledLifecycleAction !== undefined,
			},
			{
				renderedDisabled: getActiveSessionServerPresentation(enabledServer).status === 'disabled',
				hasLifecycleAction: enabledLifecycleAction !== undefined,
			},
		], [
			{ renderedDisabled: true, hasLifecycleAction: false },
			{ renderedDisabled: false, hasLifecycleAction: true },
		]);
	});

	test('uses active-session enablement for both the row and built-in context menu', () => {
		const sessionResource = URI.parse('vscode-agent-session:///session-1');
		const server = createAgentHostServer({
			enabled: false,
			enablement: [{ kind: CustomizationEnablementKind.Global, enabled: false }],
		});
		const { service: mcpService } = createMcpService(ContributionEnablementState.EnabledProfile);
		const { service: agentHostService } = createAgentHostCustomizations();

		const actions = trackActions(disposables, getBuiltinMcpServerEnablementActions(
			mcpService,
			'server-def-id',
			false,
			agentHostService,
			createAgentPluginService(),
			sessionResource,
			server,
		));

		assert.deepStrictEqual({
			renderedStatus: getActiveSessionServerPresentation(server).status,
			contextMenuActions: actions.map(action => action.label),
		}, {
			renderedStatus: 'disabled',
			contextMenuActions: ['Enable', 'Enable (Workspace)', 'Enable (Session)'],
		});
	});

	suite('getAgentHostMcpServerEnablementActions', () => {
		const sessionResource = URI.parse('vscode-agent-session:///session-1');

		test('offers the scoped action matrix', () => {
			const cases: readonly [string, AgentHostMcpServer, readonly string[]][] = [
				['no decisions', createAgentHostServer(), ['Disable', 'Disable (Workspace)', 'Disable (Session)']],
				['global disabled', createAgentHostServer({ enabled: false, enablement: [{ kind: CustomizationEnablementKind.Global, enabled: false }] }), ['Enable', 'Enable (Workspace)', 'Enable (Session)']],
				['workspace disabled', createAgentHostServer({ enabled: false, enablement: [{ kind: CustomizationEnablementKind.Workspace, uri: 'file:///workspace', enabled: false }] }), ['Disable', 'Enable (Workspace)', 'Enable (Session)']],
				['session disabled', createAgentHostServer({ enabled: false, enablement: [{ kind: CustomizationEnablementKind.Session, enabled: false }] }), ['Disable', 'Disable (Workspace)', 'Enable (Session)']],
			];
			for (const [, server, expected] of cases) {
				const { service } = createAgentHostCustomizations();
				assert.deepStrictEqual(trackActions(disposables, getAgentHostMcpServerEnablementActions(service, createAgentPluginService(), sessionResource, server)).map(action => action.label), expected);
			}
		});

		test('preserves explicit decisions and omits workspace actions without a workspace', () => {
			const { service, calls } = createAgentHostCustomizations(false);
			const server = createAgentHostServer({ enablement: [{ kind: CustomizationEnablementKind.Global, enabled: false }] });
			const actions = trackActions(disposables, getAgentHostMcpServerEnablementActions(service, createAgentPluginService(), sessionResource, server));
			assert.deepStrictEqual(actions.map(action => action.label), ['Enable', 'Enable (Session)']);
			runAction(actions[1]);
			assert.deepStrictEqual(calls, [[sessionResource, server.id, server.enablement, CustomizationEnablementKind.Session, true]]);
		});

		test('offers only Enable Plugin for a server disabled by its plugin', () => {
			const { service, calls } = createAgentHostCustomizations();
			const pluginEnablement: CustomizationEnablement[] = [
				{ kind: CustomizationEnablementKind.Session, enabled: false },
				{ kind: CustomizationEnablementKind.Workspace, uri: 'file:///workspace', enabled: true },
				{ kind: CustomizationEnablementKind.Global, enabled: false },
			];
			const server = createAgentHostServer({
				enabled: false,
				enablement: [{ kind: CustomizationEnablementKind.Session, enabled: false }],
				disabledReason: { source: 'plugin', plugin: { id: 'plugin-1', name: 'Plugin One', uri: URI.file('/plugins/plugin-1').toString(), enablement: pluginEnablement } },
			});

			const actions = trackActions(disposables, getAgentHostMcpServerEnablementActions(service, createAgentPluginService(), sessionResource, server));
			assert.deepStrictEqual(actions.map(action => action.label), ['Enable Plugin']);
			runAction(actions[0]);
			assert.deepStrictEqual(calls, [[sessionResource, 'plugin-1', pluginEnablement, CustomizationEnablementKind.Session, true]]);
		});

		test('enables a client-published plugin globally through the client', () => {
			const { service, calls: hostCalls } = createAgentHostCustomizations();
			const clientCalls: unknown[][] = [];
			const pluginUri = URI.file('/plugins/plugin-1');
			const server = createAgentHostServer({
				enabled: false,
				disabledReason: {
					source: 'plugin',
					plugin: {
						id: 'plugin-1',
						name: 'Plugin One',
						uri: pluginUri.toString(),
						clientId: 'client-1',
						enablement: [{ kind: CustomizationEnablementKind.Global, enabled: false }],
					},
				},
			});

			const [action] = trackActions(disposables, getAgentHostMcpServerEnablementActions(service, createAgentPluginService(clientCalls), sessionResource, server));
			runAction(action);

			assert.deepStrictEqual({ clientCalls, hostCalls }, {
				clientCalls: [[pluginUri.toString(), ContributionEnablementState.EnabledProfile]],
				hostCalls: [],
			});
		});

		test('offers the inverse session action and preserves all decisions when dispatching', () => {
			const cases: readonly [AgentHostMcpServer, string, boolean][] = [
				[createAgentHostServer(), 'Disable (Session)', false],
				[createAgentHostServer({
					enabled: false,
					enablement: [
						{ kind: CustomizationEnablementKind.Session, enabled: false },
						{ kind: CustomizationEnablementKind.Workspace, uri: 'file:///workspace', enabled: false },
						{ kind: CustomizationEnablementKind.Global, enabled: false },
					],
				}), 'Enable (Session)', true],
			];
			for (const [server, label, enabled] of cases) {
				const { service, calls } = createAgentHostCustomizations();
				const [action] = trackActions(disposables, getAgentHostMcpServerEnablementActions(service, createAgentPluginService(), sessionResource, server, ['session']));
				assert.deepStrictEqual({ label: action.label, calls }, { label, calls: [] });
				runAction(action);
				assert.deepStrictEqual(calls, [[sessionResource, server.id, server.enablement, CustomizationEnablementKind.Session, enabled]]);
			}
		});
	});

	suite('getServerItemContextMenuActions', () => {
		const sessionResource = URI.parse('vscode-agent-session:///session-1');

		test('replaces the VS Code workspace action with agent-host workspace and session actions', () => {
			const { service, calls } = createAgentHostCustomizations();
			const server = createAgentHostServer({
				enabled: false,
				enablement: [
					{ kind: CustomizationEnablementKind.Session, enabled: false },
					{ kind: CustomizationEnablementKind.Workspace, uri: 'file:///workspace', enabled: false },
					{ kind: CustomizationEnablementKind.Global, enabled: false },
				],
			});
			const agentHostActions = trackActions(disposables, getAgentHostMcpServerEnablementActions(service, createAgentPluginService(), sessionResource, server, ['workspace', 'session']));
			const localActions = trackActions(disposables, [
				new Action(DisableMcpServerGloballyAction.ID, 'Disable'),
				new Action(DisableMcpServerForWorkspaceAction.ID, 'Disable (Workspace)'),
				new Action('unrelated', 'Unrelated'),
			]);
			const actions = getServerItemContextMenuActions(
				[
					localActions,
				],
				server,
				undefined,
				agentHostActions,
			);

			assert.deepStrictEqual(actions.filter(action => !(action instanceof Separator)).map(action => action.label), [
				'Disable',
				'Unrelated',
				'Enable (Workspace)',
				'Enable (Session)',
			]);
			runAction(actions.find(action => action.label === 'Enable (Workspace)'));
			runAction(actions.find(action => action.label === 'Enable (Session)'));
			assert.deepStrictEqual(calls, [
				[sessionResource, server.id, server.enablement, CustomizationEnablementKind.Workspace, true],
				[sessionResource, server.id, server.enablement, CustomizationEnablementKind.Session, true],
			]);
		});

		test('keeps the VS Code-owned enablement set without an active agent-host session', () => {
			const localActions = trackActions(disposables, [
				new Action(EnableMcpServerGloballyAction.ID, 'Enable'),
				new Action(EnableMcpServerForWorkspaceAction.ID, 'Enable (Workspace)'),
				new Action(DisableMcpServerGloballyAction.ID, 'Disable'),
				new Action(DisableMcpServerForWorkspaceAction.ID, 'Disable (Workspace)'),
			]);
			const actions = getServerItemContextMenuActions([localActions], undefined, undefined, []);

			assert.deepStrictEqual(actions.filter(action => !(action instanceof Separator)).map(action => action.label), localActions.map(action => action.label));
		});
	});

	suite('getLocalMcpServerEnablementActions', () => {
		test('offers Disable + Disable (Workspace) when enabled and workbench has a workspace', () => {
			const { service, calls } = createMcpService(ContributionEnablementState.EnabledProfile);
			const actions = trackActions(disposables, getLocalMcpServerEnablementActions(service, 'server-def-id', false));
			assert.deepStrictEqual(actions.map(a => a.label), ['Disable', 'Disable (Workspace)']);
			runAction(actions[0]);
			assert.deepStrictEqual(calls, [['server-def-id', ContributionEnablementState.DisabledProfile]]);
		});

		suite('getBuiltinMcpServerEnablementActions', () => {
			const sessionResource = URI.parse('vscode-agent-session:///session-1');

			test('routes workspace and session actions to the active agent-host session', () => {
				const { service: mcpService, calls: localCalls } = createMcpService(ContributionEnablementState.EnabledProfile);
				const { service: agentHostService, calls: agentHostCalls } = createAgentHostCustomizations();
				const server = createAgentHostServer({
					enabled: false,
					enablement: [
						{ kind: CustomizationEnablementKind.Global, enabled: false },
						{ kind: CustomizationEnablementKind.Workspace, uri: 'file:///workspace', enabled: false },
					],
				});
				const actions = trackActions(disposables, getBuiltinMcpServerEnablementActions(mcpService, 'server-def-id', false, agentHostService, createAgentPluginService(), sessionResource, server));

				assert.deepStrictEqual(actions.map(action => action.label), ['Enable', 'Enable (Workspace)', 'Enable (Session)']);
				runAction(actions[0]);
				runAction(actions[1]);
				runAction(actions[2]);
				assert.deepStrictEqual({
					localCalls,
					agentHostCalls,
				}, {
					localCalls: [['server-def-id', ContributionEnablementState.EnabledProfile]],
					agentHostCalls: [
						[sessionResource, server.id, server.enablement, CustomizationEnablementKind.Workspace, true],
						[sessionResource, server.id, server.enablement, CustomizationEnablementKind.Session, true],
					],
				});
			});

			test('routes global enablement through the host for a client-forwarded plugin child', () => {
				const { service: mcpService, calls: localCalls } = createMcpService(ContributionEnablementState.EnabledProfile);
				const { service: agentHostService, calls: agentHostCalls } = createAgentHostCustomizations();
				const server = createAgentHostServer({
					id: 'azure',
					isPluginProvided: true,
					owningPluginClientId: 'forwarded-plugin-client',
				});
				const actions = trackActions(disposables, getBuiltinMcpServerEnablementActions(mcpService, 'azure', false, agentHostService, createAgentPluginService(), sessionResource, server));

				runAction(actions[0]);

				assert.deepStrictEqual({
					labels: actions.map(action => action.label),
					agentHostCalls,
					localCalls,
				}, {
					labels: ['Disable', 'Disable (Workspace)', 'Disable (Session)'],
					agentHostCalls: [[sessionResource, 'azure', undefined, CustomizationEnablementKind.Global, false]],
					localCalls: [],
				});
			});

			test('routes global enablement locally for a client-bundled plugin child', () => {
				const { service: mcpService, calls: localCalls } = createMcpService(ContributionEnablementState.EnabledProfile);
				const { service: agentHostService, calls: agentHostCalls } = createAgentHostCustomizations();
				const server = createAgentHostServer({
					id: 'azure',
					isPluginProvided: true,
					isClientBundled: true,
					owningPluginClientId: 'forwarded-plugin-client',
				});
				const actions = trackActions(disposables, getBuiltinMcpServerEnablementActions(mcpService, 'azure', false, agentHostService, createAgentPluginService(), sessionResource, server));

				runAction(actions[0]);

				assert.deepStrictEqual({
					labels: actions.map(action => action.label),
					agentHostCalls,
					localCalls,
				}, {
					labels: ['Disable', 'Disable (Workspace)', 'Disable (Session)'],
					agentHostCalls: [],
					localCalls: [['azure', ContributionEnablementState.DisabledProfile]],
				});
			});

			test('keeps the client-bundled row presentation and menu in sync after a global change', () => {
				const { service: enabledMcpService } = createMcpService(ContributionEnablementState.EnabledProfile);
				const { service: disabledMcpService } = createMcpService(ContributionEnablementState.DisabledProfile);
				const { service: agentHostService } = createAgentHostCustomizations();
				const enabledServer = createAgentHostServer({ isClientBundled: true });
				const disabledServer = createAgentHostServer({
					isClientBundled: true,
					enabled: false,
					enablement: [{ kind: CustomizationEnablementKind.Global, enabled: false }],
				});

				const enabledActions = trackActions(disposables, getBuiltinMcpServerEnablementActions(
					enabledMcpService,
					'server-def-id',
					false,
					agentHostService,
					createAgentPluginService(),
					sessionResource,
					enabledServer,
				));
				const disabledActions = trackActions(disposables, getBuiltinMcpServerEnablementActions(
					disabledMcpService,
					'server-def-id',
					false,
					agentHostService,
					createAgentPluginService(),
					sessionResource,
					disabledServer,
				));

				assert.deepStrictEqual({
					enabled: {
						status: getActiveSessionServerPresentation(enabledServer).status,
						menu: enabledActions[0].label,
					},
					disabled: {
						status: getActiveSessionServerPresentation(disabledServer).status,
						menu: disabledActions[0].label,
					},
				}, {
					enabled: { status: McpServerStatus.Ready, menu: 'Disable' },
					disabled: { status: 'disabled', menu: 'Enable' },
				});
			});

			test('keeps legacy VS Code workspace actions without an active agent-host session', () => {
				const { service: mcpService, calls: localCalls } = createMcpService(ContributionEnablementState.EnabledProfile);
				const { service: agentHostService, calls: agentHostCalls } = createAgentHostCustomizations();
				const actions = trackActions(disposables, getBuiltinMcpServerEnablementActions(mcpService, 'server-def-id', false, agentHostService, createAgentPluginService(), sessionResource, undefined));

				assert.deepStrictEqual(actions.map(action => action.label), ['Disable', 'Disable (Workspace)']);
				runAction(actions[1]);
				assert.deepStrictEqual({
					localCalls,
					agentHostCalls,
				}, {
					localCalls: [['server-def-id', ContributionEnablementState.DisabledWorkspace]],
					agentHostCalls: [],
				});
			});
		});

		test('omits the workspace variant in an empty workbench', () => {
			const { service } = createMcpService(ContributionEnablementState.DisabledProfile);
			const actions = trackActions(disposables, getLocalMcpServerEnablementActions(service, 'server-def-id', true));
			assert.deepStrictEqual(actions.map(a => a.label), ['Enable']);
		});
	});

	suite('getActiveSessionServerOptionsActions', () => {
		test('composes lifecycle, durable, session, and options actions without duplicating groups', () => {
			const { service } = createAgentHostCustomizations();
			const server = createAgentHostServer({ enabled: true, status: McpServerStatus.Ready });
			const sessionResource = URI.parse('vscode-agent-session:///session-1');
			const commandService = { executeCommand: async () => undefined } as unknown as ICommandService;
			const actions = trackActions(disposables, getActiveSessionServerOptionsActions(
				commandService,
				service,
				createAgentPluginService(),
				sessionResource,
				server,
			));

			const labels = actions.map(a => a instanceof Separator ? '(separator)' : a.label);
			// Stop Server (lifecycle) -> separator -> scoped enablement -> separator -> Server Options
			assert.deepStrictEqual(labels, [
				'Stop Server',
				'(separator)',
				'Disable',
				'Disable (Workspace)',
				'Disable (Session)',
				'(separator)',
				'Server Options',
			]);
		});
	});

	suite('getEnablementTarget', () => {

		const sessionResource = URI.parse('vscode-agent-session:///session-1');

		type Element = Parameters<typeof getEnablementTarget>[0];
		type RowState = Parameters<typeof getEnablementTarget>[1];

		/** An enablement model that actually remembers, so a round trip can be asserted. */
		function createMutableMcpService(initial: ContributionEnablementState): { service: IMcpService; read(): ContributionEnablementState } {
			let state = initial;
			const service = {
				enablementModel: {
					readEnabled: () => state,
					setEnabled: (_key: string, next: ContributionEnablementState) => { state = next; },
				},
			} as unknown as IMcpService;
			return { service, read: () => state };
		}

		function targetFor(element: Element, rowState: RowState, mcpService: IMcpService, agentHost: IAgentHostCustomizationService, live?: AgentHostMcpServer) {
			return getEnablementTarget(element, rowState, mcpService, agentHost, sessionResource, snapshot => live ?? snapshot);
		}

		test('a gallery row has no switch, because nothing is installed to turn on yet', () => {
			const element = { type: 'server-item', server: {} } as unknown as Element;
			assert.strictEqual(
				targetFor(element, { status: undefined }, createMcpService(ContributionEnablementState.EnabledProfile).service, createAgentHostCustomizations().service),
				undefined);
		});

		test('a row held off by its plugin has no switch, because its own enablement cannot free it', () => {
			const server = createAgentHostServer({ enabled: false });
			const element = { type: 'session-server-item', server } as unknown as Element;
			const rowState = {
				status: 'disabled',
				disabledReason: { source: 'plugin', plugin: { id: 'p', name: 'Plugin One', uri: 'file:///p' } },
				activeSessionServer: server,
			} as unknown as RowState;
			assert.strictEqual(
				targetFor(element, rowState, createMcpService(ContributionEnablementState.EnabledProfile).service, createAgentHostCustomizations().service),
				undefined);
		});

		test('a workspace-scoped local choice is answered where it was made, not promoted', () => {
			const mcp = createMutableMcpService(ContributionEnablementState.EnabledWorkspace);
			const element = { type: 'server-item', server: { id: 'mcp-redis', local: {} } } as unknown as Element;
			const target = targetFor(element, { status: undefined } as RowState, mcp.service, createAgentHostCustomizations().service);

			target?.setEnabled(false);
			const afterOff = mcp.read();
			target?.setEnabled(true);

			assert.deepStrictEqual([afterOff, mcp.read()], [
				ContributionEnablementState.DisabledWorkspace,
				ContributionEnablementState.EnabledWorkspace,
			]);
		});

		test('turning on a row held off by both layers settles both, so it cannot stay visibly off', () => {
			const mcp = createMutableMcpService(ContributionEnablementState.DisabledProfile);
			const { service: agentHost, calls } = createAgentHostCustomizations();
			const server = createAgentHostServer({ enabled: false, enablement: [{ kind: CustomizationEnablementKind.Session, enabled: false }] as readonly CustomizationEnablement[] });
			const element = { type: 'server-item', server: { id: 'mcp-redis', local: {} }, activeSessionServer: server } as unknown as Element;
			const target = targetFor(element, { status: 'disabled', activeSessionServer: server } as RowState, mcp.service, agentHost, server);

			assert.strictEqual(target?.isEnabled(), false);
			target?.setEnabled(true);

			assert.deepStrictEqual([mcp.read(), calls.map(call => [call[1], call[3], call[4]])], [
				ContributionEnablementState.EnabledProfile,
				// The deciding layer, so the effective state actually moves.
				[['server-1', CustomizationEnablementKind.Session, true]],
			]);
		});

		test('an agent-host row nothing decides yet is turned off everywhere, not just for the session', () => {
			const { service: agentHost, calls } = createAgentHostCustomizations();
			const server = createAgentHostServer({ enabled: true });
			const element = { type: 'session-server-item', server } as unknown as Element;
			const target = targetFor(element, { status: McpServerStatus.Ready, activeSessionServer: server } as RowState, createMcpService(ContributionEnablementState.EnabledProfile).service, agentHost, server);

			target?.setEnabled(false);

			assert.deepStrictEqual(calls.map(call => [call[1], call[3], call[4]]), [
				['server-1', CustomizationEnablementKind.Global, false],
			]);
		});

		test('an agent-host row answers the layer that already decided it', () => {
			const { service: agentHost, calls } = createAgentHostCustomizations();
			const server = createAgentHostServer({
				enabled: false,
				enablement: [{ kind: CustomizationEnablementKind.Workspace, uri: 'file:///workspace', enabled: false }] as readonly CustomizationEnablement[],
			});
			const element = { type: 'session-server-item', server } as unknown as Element;
			const target = targetFor(element, { status: 'disabled', activeSessionServer: server } as RowState, createMcpService(ContributionEnablementState.EnabledProfile).service, agentHost, server);

			target?.setEnabled(true);

			assert.deepStrictEqual(calls.map(call => [call[1], call[3], call[4]]), [
				['server-1', CustomizationEnablementKind.Workspace, true],
			]);
		});

		test('a workspace decision falls back to global when the session has no working directory', () => {
			const { service: agentHost, calls } = createAgentHostCustomizations(false);
			const server = createAgentHostServer({
				enabled: false,
				enablement: [{ kind: CustomizationEnablementKind.Workspace, uri: 'file:///gone', enabled: false }] as readonly CustomizationEnablement[],
			});
			const element = { type: 'session-server-item', server } as unknown as Element;
			const target = targetFor(element, { status: 'disabled', activeSessionServer: server } as RowState, createMcpService(ContributionEnablementState.EnabledProfile).service, agentHost, server);

			target?.setEnabled(true);

			assert.deepStrictEqual(calls.map(call => [call[1], call[3], call[4]]), [
				['server-1', CustomizationEnablementKind.Global, true],
			]);
		});

		test('the write reads the server live, so a decision changed since render is not resurrected', () => {
			const { service: agentHost, calls } = createAgentHostCustomizations();
			const stale = createAgentHostServer({ enabled: true, enablement: [] as readonly CustomizationEnablement[] });
			const live = createAgentHostServer({
				enabled: false,
				enablement: [{ kind: CustomizationEnablementKind.Session, enabled: false }] as readonly CustomizationEnablement[],
			});
			const element = { type: 'session-server-item', server: stale } as unknown as Element;
			const target = targetFor(element, { status: McpServerStatus.Ready, activeSessionServer: stale } as RowState, createMcpService(ContributionEnablementState.EnabledProfile).service, agentHost, live);

			target?.setEnabled(true);

			assert.deepStrictEqual(calls.map(call => [call[2], call[3]]), [
				[live.enablement, CustomizationEnablementKind.Session],
			]);
		});
	});

	suite('countSessionOnlyMcpServers', () => {

		const installed = [{ id: 'notion', name: 'notion', label: 'Notion' }] as unknown as readonly IWorkbenchMcpServer[];
		const runtime = [{ definition: { id: 'github-mcp', label: 'GitHub' } }] as unknown as readonly IMcpServer[];

		test('a session server the user also installed is not counted twice', () => {
			const servers = [createAgentHostServer({ id: 'session/notion', name: 'notion' })];
			assert.strictEqual(countSessionOnlyMcpServers(servers, installed, runtime), 0);
		});

		test('a server only the session knows about is counted', () => {
			const servers = [createAgentHostServer({ id: 'session/node_repl', name: 'node_repl' })];
			assert.strictEqual(countSessionOnlyMcpServers(servers, installed, runtime), 1);
		});

		test('the count does not depend on what a search would have hidden', () => {
			const servers = [
				createAgentHostServer({ id: 'session/notion', name: 'notion' }),
				createAgentHostServer({ id: 'session/node_repl', name: 'node_repl' }),
			];
			// The same answer whether or not a query would have hidden the installed row that
			// claims one of them. Deriving this from the filtered lists made the badge grow while
			// the user typed, which reads as servers appearing from nowhere.
			assert.deepStrictEqual([
				countSessionOnlyMcpServers(servers, installed, runtime),
				countSessionOnlyMcpServers(servers, [], runtime),
			], [1, 2]);
		});
	});

	suite('getAgentOriginLabel', () => {

		test('uses the agent name, and describes the machinery only when there is none', () => {
			assert.deepStrictEqual(
				[getAgentOriginLabel('Copilot'), getAgentOriginLabel(undefined)],
				['Copilot', 'Agent host']);
		});
	});

	suite('getMcpStatusRenderSignature', () => {
		const base: IMcpStatusRenderInput = {
			rowKey: 'server:mcp.config.workspace/notion:0',
			label: 'notion',
			state: McpServerStatus.Error,
			statusLabel: 'Error',
			statusClassName: 'error',
			activeSessionServerId: 'session-1/notion',
			logOutputChannelId: 'mcp.session-1.notion',
			localServerId: 'mcp.config.workspace/notion',
			activeSessionResource: 'vscode-agent-session:///session-1',
			switchChecked: true,
			errorMessage: 'spawn ENOENT',
			toolCount: 4,
			toolsFromCache: true,
			transport: 'Local',
			description: 'Issue tracking',
			origin: 'Workspace',
			impliedOrigin: 'Built-in',
		};

		// A different, and differently-typed-where-possible, value for every field. The mapped type
		// is what makes this a barrier: a field added to the input fails to compile until it is
		// given a value here, and the test below then proves the signature actually covers it.
		const changed: { [K in keyof IMcpStatusRenderInput]-?: IMcpStatusRenderInput[K] } = {
			rowKey: 'server:mcp.config.user/notion:0',
			label: 'Notion',
			state: McpServerStatus.Ready,
			statusLabel: 'Running',
			statusClassName: 'running',
			activeSessionServerId: 'session-1/other',
			logOutputChannelId: 'mcp.session-1.other',
			localServerId: 'mcp.config.user/notion',
			activeSessionResource: 'vscode-agent-session:///session-2',
			switchChecked: false,
			errorMessage: 'connection refused',
			toolCount: 5,
			toolsFromCache: false,
			transport: 'HTTP',
			description: 'Issue tracking and boards',
			origin: 'User',
			impliedOrigin: 'User',
		};

		const fields = Object.keys(base) as (keyof IMcpStatusRenderInput)[];

		test('the same row state produces the same signature', () => {
			assert.strictEqual(getMcpStatusRenderSignature({ ...base }), getMcpStatusRenderSignature({ ...base }));
		});

		test('changing any covered value changes the signature', () => {
			const baseline = getMcpStatusRenderSignature(base);
			const missed = fields.filter(field => getMcpStatusRenderSignature({ ...base, [field]: changed[field] }) === baseline);

			assert.deepStrictEqual(missed, []);
		});

		test('clearing any optional value changes the signature', () => {
			const baseline = getMcpStatusRenderSignature(base);
			// `rowKey` and `label` are always present; everything else can legitimately go away,
			// e.g. when a server loses its active-session twin.
			const clearable = fields.filter(field => field !== 'rowKey' && field !== 'label');
			const missed = clearable.filter(field => getMcpStatusRenderSignature({ ...base, [field]: undefined }) === baseline);

			assert.deepStrictEqual(missed, []);
		});
	});

	suite('inline actions', () => {
		test('authentication receives the active session and server without opening the row', () => {
			const sessionResource = URI.parse('vscode-agent-session:///session-1');
			const calls: [URI, string][] = [];
			const service = {
				authenticateMcpServer: (resource: URI, serverId: string) => {
					calls.push([resource, serverId]);
					return Promise.resolve(true);
				},
			} as IAgentHostCustomizationService;
			const row = document.createElement('div');
			let rowPointerDowns = 0;
			let rowClicks = 0;
			disposables.add(DOM.addDisposableGenericMouseDownListener(row, () => rowPointerDowns++));
			disposables.add(DOM.addDisposableListener(row, DOM.EventType.CLICK, () => rowClicks++));
			const button = disposables.add(new Button(row, unthemedButtonStyles));
			registerMcpInlineButtonAction(disposables, button, async () => {
				await authenticateMcpServer(service, sessionResource, 'server-1');
			});

			button.element.dispatchEvent(new MouseEvent(DOM.EventType.MOUSE_DOWN, { bubbles: true }));
			button.element.click();

			assert.deepStrictEqual({
				calls,
				rowPointerDowns,
				rowClicks,
			}, {
				calls: [[sessionResource, 'server-1']],
				rowPointerDowns: 0,
				rowClicks: 0,
			});
		});

		test('active-session error registers the channel, closes the editor, then opens output', async () => {
			const shownChannels: string[] = [];
			let localOutputCount = 0;
			const actions: string[] = [];
			const outputHandler = getMcpServerOutputHandler(
				{
					showChannel: async channelId => {
						actions.push('show-output');
						shownChannels.push(channelId);
					}
				},
				{ showOutput: async () => { localOutputCount++; } },
				createAgentHostServer({ logOutputChannelId: 'agent-host-output' }),
				async () => {
					actions.push('close-editor');
				},
				async beforeShow => {
					actions.push('register-agent-host-output');
					await beforeShow?.();
					actions.push('show-agent-host-output');
				},
			);
			assert.ok(outputHandler);

			await outputHandler();

			assert.deepStrictEqual({
				shownChannels,
				localOutputCount,
				actions,
			}, {
				shownChannels: [],
				localOutputCount: 0,
				actions: ['register-agent-host-output', 'close-editor', 'show-agent-host-output'],
			});
		});

		test('local error opens local output when no agent-host output exists', async () => {
			const shownChannels: string[] = [];
			let localOutputCount = 0;
			const outputHandler = getMcpServerOutputHandler(
				{ showChannel: async channelId => { shownChannels.push(channelId); } },
				{ showOutput: async () => { localOutputCount++; } },
				undefined,
			);

			await outputHandler?.();

			assert.deepStrictEqual({
				shownChannels,
				localOutputCount,
			}, {
				shownChannels: [],
				localOutputCount: 1,
			});
		});
	});
});
