/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import * as DOM from '../../../../../../base/browser/dom.js';
import { Button, unthemedButtonStyles } from '../../../../../../base/browser/ui/button/button.js';
import { URI } from '../../../../../../base/common/uri.js';
import { Action, IAction, Separator } from '../../../../../../base/common/actions.js';
import { Emitter } from '../../../../../../base/common/event.js';
import { Disposable, DisposableStore, isDisposable, MutableDisposable } from '../../../../../../base/common/lifecycle.js';
import { observableValue } from '../../../../../../base/common/observable.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../../base/test/common/utils.js';
import { CustomizationEnablementKind, McpServerStatus, type CustomizationEnablement } from '../../../../../../platform/agentHost/common/state/protocol/state.js';
import { IConfigurationService } from '../../../../../../platform/configuration/common/configuration.js';
import { ContributionEnablementState } from '../../../common/enablement.js';
import { ICommandService } from '../../../../../../platform/commands/common/commands.js';
import { IHoverService } from '../../../../../../platform/hover/browser/hover.js';
import { mcpAccessConfig, McpAccessValue } from '../../../../../../platform/mcp/common/mcpManagement.js';
import { IOutputService } from '../../../../../services/output/common/output.js';
import { IAICustomizationWorkspaceService } from '../../../common/aiCustomizationWorkspaceService.js';
import { ICustomizationHarnessService } from '../../../common/customizationHarnessService.js';
import { IAgentHostCustomizationService } from '../../../browser/agentSessions/agentHost/agentHostCustomizationService.js';
import { IAgentPluginService } from '../../../common/plugins/agentPluginService.js';
import { IMcpService, McpConnectionState } from '../../../../mcp/common/mcpTypes.js';
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
	isMcpServerCollectionVisible,
	isPrimaryMcpServerEnabled,
	getMcpStatusRenderSignature,
	getServerItemContextMenuActions,
	getToggledMcpEnablementState,
	McpListWidget,
	McpServerItemRenderer,
	registerMcpInlineButtonAction,
	type IMcpStatusRenderInput,
	updateMcpCardRuntimePresentation,
	hasSameMcpMembership,
	setPrimaryMcpServerEnablement,
	shouldLoadMcpGallerySnapshot,
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

type McpAccessTestWidget = {
	element: HTMLElement;
	mcpAccessEnabled: boolean;
	visible: boolean;
	searchQuery: string;
	access: McpAccessValue;
	policyAccess: McpAccessValue | undefined;
	configurationService: IConfigurationService;
	delayedGallerySearch: { cancel(): void };
	delayedCancelCount: number;
	galleryCts: { dispose(cancel?: boolean): void } | undefined;
	requestCancelCount: number;
	gallerySnapshotLoading: boolean;
	gallerySearchLoading: boolean;
	searchInput: { hideMessage(): void };
	disabledIcon: HTMLElement;
	disabledMessage: HTMLElement;
	disabledLinkListener: MutableDisposable<{ dispose(): void }>;
	commandService: ICommandService;
	queryCount: number;
	refreshCount: number;
	queryMcpSearch(): Promise<void>;
	refresh(): Promise<void>;
	updateAccessState(): void;
};

function createMcpAccessTestWidget(access: McpAccessValue, policyAccess: McpAccessValue | undefined, store: Pick<DisposableStore, 'add'>): McpAccessTestWidget {
	const widget = Object.create(McpListWidget.prototype) as McpAccessTestWidget;
	widget.element = document.createElement('div');
	widget.mcpAccessEnabled = false;
	widget.visible = false;
	widget.searchQuery = '';
	widget.access = access;
	widget.policyAccess = policyAccess;
	widget.configurationService = {
		inspect: (key: string) => key === mcpAccessConfig ? {
			value: widget.access,
			defaultValue: McpAccessValue.All,
			policyValue: widget.policyAccess,
		} : undefined,
	} as unknown as IConfigurationService;
	widget.delayedCancelCount = 0;
	widget.delayedGallerySearch = { cancel: () => widget.delayedCancelCount++ };
	widget.galleryCts = undefined;
	widget.requestCancelCount = 0;
	widget.gallerySnapshotLoading = false;
	widget.gallerySearchLoading = false;
	widget.searchInput = { hideMessage() { } };
	widget.disabledIcon = document.createElement('div');
	widget.disabledMessage = document.createElement('div');
	widget.disabledLinkListener = store.add(new MutableDisposable());
	widget.commandService = { executeCommand: async () => undefined } as unknown as ICommandService;
	widget.queryCount = 0;
	widget.refreshCount = 0;
	widget.queryMcpSearch = async () => { widget.queryCount++; };
	widget.refresh = async () => { widget.refreshCount++; };
	return widget;
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

	test('filters local MCP collections hidden by the active harness', () => {
		assert.deepStrictEqual({
			defaultVisible: isMcpServerCollectionVisible('extension/github', undefined),
			visible: isMcpServerCollectionVisible('extension/context7', ['extension/github']),
			hidden: isMcpServerCollectionVisible('extension/github', ['extension/github']),
		}, {
			defaultVisible: true,
			visible: true,
			hidden: false,
		});
	});

	test('toggles MCP enablement without changing its scope', () => {
		assert.deepStrictEqual([
			getToggledMcpEnablementState(ContributionEnablementState.EnabledProfile),
			getToggledMcpEnablementState(ContributionEnablementState.DisabledProfile),
			getToggledMcpEnablementState(ContributionEnablementState.EnabledWorkspace),
			getToggledMcpEnablementState(ContributionEnablementState.DisabledWorkspace),
		], [
			ContributionEnablementState.DisabledProfile,
			ContributionEnablementState.EnabledProfile,
			ContributionEnablementState.DisabledWorkspace,
			ContributionEnablementState.EnabledWorkspace,
		]);
	});

	test('updates card runtime status without replacing live nodes', () => {
		const row = document.createElement('div');
		const primaryAction = document.createElement('button');
		const statusBadge = document.createElement('span');
		const description = document.createElement('span');
		row.append(primaryAction, statusBadge, description);

		updateMcpCardRuntimePresentation(statusBadge, primaryAction, description, McpConnectionState.Kind.Starting, undefined, 'Server, Starting', 'First description');
		const initialNodes = [...row.childNodes];
		updateMcpCardRuntimePresentation(statusBadge, primaryAction, description, McpConnectionState.Kind.Error, undefined, 'Server, Error', 'Updated description');

		assert.deepStrictEqual({
			nodesPreserved: initialNodes.every((node, index) => row.childNodes[index] === node),
			statusClass: statusBadge.className,
			statusText: statusBadge.textContent,
			ariaLabel: primaryAction.getAttribute('aria-label'),
			description: description.textContent,
		}, {
			nodesPreserved: true,
			statusClass: 'plugin-list-item-status mcp-runtime-status-badge error',
			statusText: 'Error',
			ariaLabel: 'Server, Error',
			description: 'Updated description',
		});
	});

	test('loads gallery snapshots only for visible MCP sections', () => {
		assert.deepStrictEqual([
			shouldLoadMcpGallerySnapshot(false, '', 0, false, false, true),
			shouldLoadMcpGallerySnapshot(true, '', 0, false, false, true),
			shouldLoadMcpGallerySnapshot(true, 'search', 0, false, false, true),
			shouldLoadMcpGallerySnapshot(true, '', 1, false, false, true),
			shouldLoadMcpGallerySnapshot(true, '', 0, false, false, false),
		], [false, true, false, false, false]);
	});

	test('shows access-disabled UI before gallery work starts', () => {
		const widget = createMcpAccessTestWidget(McpAccessValue.None, McpAccessValue.None, disposables);

		widget.updateAccessState();

		assert.deepStrictEqual({
			accessEnabled: widget.mcpAccessEnabled,
			disabledClass: widget.element.classList.contains('access-disabled'),
			message: widget.disabledMessage.textContent,
		}, {
			accessEnabled: false,
			disabledClass: true,
			message: 'Access to MCP servers is disabled by your organization. Contact your organization administrator for more information.',
		});
	});

	test('cancels delayed and in-flight gallery work when access is revoked', () => {
		const widget = createMcpAccessTestWidget(McpAccessValue.All, undefined, disposables);
		widget.updateAccessState();
		widget.galleryCts = { dispose: cancel => widget.requestCancelCount += cancel ? 1 : 0 };
		widget.gallerySnapshotLoading = true;
		widget.gallerySearchLoading = true;

		widget.access = McpAccessValue.None;
		widget.updateAccessState();

		assert.deepStrictEqual({
			accessEnabled: widget.mcpAccessEnabled,
			delayedCancelCount: widget.delayedCancelCount,
			requestCancelCount: widget.requestCancelCount,
			gallerySnapshotLoading: widget.gallerySnapshotLoading,
			gallerySearchLoading: widget.gallerySearchLoading,
		}, {
			accessEnabled: false,
			delayedCancelCount: 1,
			requestCancelCount: 1,
			gallerySnapshotLoading: false,
			gallerySearchLoading: false,
		});
	});

	test('restarts a retained marketplace search when access is restored', () => {
		const widget = createMcpAccessTestWidget(McpAccessValue.None, undefined, disposables);
		widget.searchQuery = 'github';
		widget.visible = true;
		widget.updateAccessState();

		widget.access = McpAccessValue.All;
		widget.updateAccessState();

		assert.deepStrictEqual({
			queryCount: widget.queryCount,
			refreshCount: widget.refreshCount,
		}, {
			queryCount: 1,
			refreshCount: 0,
		});
	});

	test('uses durable enablement for the primary MCP switch', () => {
		const sessionResource = URI.parse('vscode-agent-session:///session-1');
		const activeSessionServer = createAgentHostServer({
			enabled: false,
			enablement: [{ kind: CustomizationEnablementKind.Session, enabled: false }],
		});
		const { service: mcpService, calls: localCalls } = createMcpService(ContributionEnablementState.DisabledProfile);
		const { service: agentHostService, calls: agentHostCalls } = createAgentHostCustomizations();

		const localEnabled = isPrimaryMcpServerEnabled(mcpService, 'server-1', activeSessionServer);
		const hostEnabled = isPrimaryMcpServerEnabled(mcpService, undefined, activeSessionServer);
		setPrimaryMcpServerEnablement(mcpService, agentHostService, sessionResource, 'server-1', activeSessionServer, true);
		setPrimaryMcpServerEnablement(mcpService, agentHostService, sessionResource, undefined, activeSessionServer, false);

		assert.deepStrictEqual({
			localEnabled,
			hostEnabled,
			localCalls,
			agentHostCalls,
		}, {
			localEnabled: false,
			hostEnabled: true,
			localCalls: [['server-1', ContributionEnablementState.EnabledProfile]],
			agentHostCalls: [[sessionResource, activeSessionServer.id, activeSessionServer.enablement, CustomizationEnablementKind.Global, false]],
		});
	});

	test('uses host enablement for host-owned plugin MCP rows with local counterparts', () => {
		const sessionResource = URI.parse('vscode-agent-session:///session-1');
		const activeSessionServer = createAgentHostServer({
			isPluginProvided: true,
			isClientBundled: false,
			enablement: [{ kind: CustomizationEnablementKind.Global, enabled: false }],
		});
		const { service: mcpService, calls: localCalls } = createMcpService(ContributionEnablementState.EnabledProfile);
		const { service: agentHostService, calls: agentHostCalls } = createAgentHostCustomizations();

		const enabled = isPrimaryMcpServerEnabled(mcpService, 'server-1', activeSessionServer);
		setPrimaryMcpServerEnablement(mcpService, agentHostService, sessionResource, 'server-1', activeSessionServer, true);

		assert.deepStrictEqual({
			enabled,
			localCalls,
			agentHostCalls,
		}, {
			enabled: false,
			localCalls: [],
			agentHostCalls: [[sessionResource, activeSessionServer.id, activeSessionServer.enablement, CustomizationEnablementKind.Global, true]],
		});
	});

	test('distinguishes membership changes from state-only changes', () => {
		assert.deepStrictEqual([
			hasSameMcpMembership('server:one:session', 'server:one:session'),
			hasSameMcpMembership('server:one:session', 'server:one:session|server:two:session'),
		], [true, false]);
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

	suite('getMcpStatusRenderSignature', () => {
		const base: IMcpStatusRenderInput = {
			rowKey: 'server:mcp.config.workspace/notion:0',
			label: 'notion',
			state: McpServerStatus.Error,
			statusLabel: 'Error',
			statusClassName: 'error',
			statusIconId: 'error',
			activeSessionServerId: 'session-1/notion',
			logOutputChannelId: 'mcp.session-1.notion',
			localServerId: 'mcp.config.workspace/notion',
			activeSessionResource: 'vscode-agent-session:///session-1',
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
			statusIconId: 'check',
			activeSessionServerId: 'session-1/other',
			logOutputChannelId: 'mcp.session-1.other',
			localServerId: 'mcp.config.user/notion',
			activeSessionResource: 'vscode-agent-session:///session-2',
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

	suite('row actions survive no-op updates', () => {
		// The signature tests above only cover the pure helper, so they would still pass if the
		// early return in `updateStatus` or the row guard in `renderElement` were removed. These
		// drive the renderer itself, which is the only place the reported failure is observable:
		// an erroring server re-runs the status update about twice a second, and a button node
		// replaced between mousedown and mouseup never receives the click.
		function createRenderer(server: AgentHostMcpServer) {
			const store = new DisposableStore();
			const onDidChangeCustomizations = store.add(new Emitter<void>());
			const sessionResource = URI.parse('vscode-agent-session:///session-1');
			let servers: AgentHostMcpServer[] = [server];
			const shownLogs: string[] = [];

			const agentHostCustomizationService = {
				getMcpServers: () => servers,
				onDidChangeCustomizations: onDidChangeCustomizations.event,
				showMcpServerLog: async (_resource: URI, serverId: string) => { shownLogs.push(serverId); },
			} as unknown as IAgentHostCustomizationService;
			const customizationHarnessService = {
				activeSessionResource: observableValue<URI>('activeSessionResource', sessionResource),
			} as unknown as ICustomizationHarnessService;
			const renderer = new McpServerItemRenderer(
				async () => { },
				{ isSessionsWindow: true } as IAICustomizationWorkspaceService,
				{ plugins: observableValue<readonly never[]>('plugins', []) } as unknown as IAgentPluginService,
				{ setupManagedHover: () => Disposable.None } as unknown as IHoverService,
				agentHostCustomizationService,
				customizationHarnessService,
				{ showChannel: async () => { } } as unknown as IOutputService,
			);

			const container = document.createElement('div');
			const templateData = renderer.renderTemplate(container);
			store.add({ dispose: () => renderer.disposeTemplate(templateData) });

			return {
				store,
				templateData,
				shownLogs,
				render: () => renderer.renderElement(createBuiltinActiveSessionMcpEntries([server])[0], 0, templateData),
				notifyUnchanged: () => onDidChangeCustomizations.fire(),
				setServers: (next: AgentHostMcpServer[]) => { servers = next; },
				actionNode: () => templateData.actions.firstElementChild,
			};
		}

		const erroring = () => createAgentHostServer({ id: 'server-1', status: McpServerStatus.Error, state: { kind: McpServerStatus.Error, error: { errorType: 'spawn', message: 'failed to start' } } });

		test('the Show Output button stays the same clickable node across repeated identical updates', () => {
			const ctx = createRenderer(erroring());
			disposables.add(ctx.store);
			ctx.render();

			const button = ctx.actionNode();
			assert.ok(button, 'expected an action for an erroring server');

			// What the autorun does in production while a server sits in error.
			for (let i = 0; i < 10; i++) {
				ctx.notifyUnchanged();
			}

			assert.strictEqual(ctx.actionNode(), button, 'the button was replaced by an update that changed nothing');
			assert.strictEqual(button.parentElement, ctx.templateData.actions, 'the button was detached from the row');

			(button as HTMLElement).click();

			assert.deepStrictEqual(ctx.shownLogs, ['server-1']);
		});

		test('re-rendering the same row keeps its actions, so a list refresh cannot swallow a click', () => {
			// Entries are recreated on every refresh, and the list re-splices every visible row on
			// any customizations change, so the guard has to key on content rather than identity.
			const ctx = createRenderer(erroring());
			disposables.add(ctx.store);
			ctx.render();
			const button = ctx.actionNode();

			ctx.render();

			assert.strictEqual(ctx.actionNode(), button, 'a re-render of the same row rebuilt its actions');
		});

		test('a real status change still rebuilds the actions', () => {
			const ctx = createRenderer(erroring());
			disposables.add(ctx.store);
			ctx.render();
			const button = ctx.actionNode();

			// Recovering from error drops the Show Output action entirely.
			ctx.setServers([createAgentHostServer({ id: 'server-1', status: McpServerStatus.Ready, state: { kind: McpServerStatus.Ready } })]);
			ctx.notifyUnchanged();

			assert.notStrictEqual(ctx.actionNode(), button, 'the actions were not rebuilt for a changed status');
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
