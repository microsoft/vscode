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
import { IMcpService } from '../../../../mcp/common/mcpTypes.js';
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
	getServerItemContextMenuActions,
	registerMcpInlineButtonAction,
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
