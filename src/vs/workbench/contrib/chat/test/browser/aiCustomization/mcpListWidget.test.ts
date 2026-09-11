/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import sinon from 'sinon';
import * as DOM from '../../../../../../base/browser/dom.js';
import { Button, unthemedButtonStyles } from '../../../../../../base/browser/ui/button/button.js';
import { URI } from '../../../../../../base/common/uri.js';
import { Action, IAction, Separator } from '../../../../../../base/common/actions.js';
import { Emitter } from '../../../../../../base/common/event.js';
import { Disposable, DisposableStore, isDisposable, MutableDisposable } from '../../../../../../base/common/lifecycle.js';
import { autorun, derived, IObservable, observableSignalFromEvent, observableValue } from '../../../../../../base/common/observable.js';
import { mock } from '../../../../../../base/test/common/mock.js';
import { IManagedHoverContent } from '../../../../../../base/browser/ui/hover/hover.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../../base/test/common/utils.js';
import { CustomizationEnablementKind, McpServerStatus, type CustomizationEnablement } from '../../../../../../platform/agentHost/common/state/protocol/state.js';
import { IConfigurationService } from '../../../../../../platform/configuration/common/configuration.js';
import { ContributionEnablementState } from '../../../common/enablement.js';
import { ICommandService } from '../../../../../../platform/commands/common/commands.js';
import { IHoverService } from '../../../../../../platform/hover/browser/hover.js';
import { IListService, ListService, WorkbenchList } from '../../../../../../platform/list/browser/listService.js';
import { workbenchInstantiationService } from '../../../../../test/browser/workbenchTestServices.js';
import { mcpAccessConfig, McpAccessValue } from '../../../../../../platform/mcp/common/mcpManagement.js';
import { IOutputService } from '../../../../../services/output/common/output.js';
import { IAuthenticationQueryService } from '../../../../../services/authentication/common/authenticationQuery.js';
import { IAuthenticationService } from '../../../../../services/authentication/common/authentication.js';
import { IWorkbenchLocalMcpServer } from '../../../../../services/mcp/common/mcpWorkbenchManagementService.js';
import { IMcpRegistry } from '../../../../mcp/common/mcpRegistryTypes.js';
import { IAICustomizationWorkspaceService } from '../../../common/aiCustomizationWorkspaceService.js';
import { ICustomizationHarnessService } from '../../../common/customizationHarnessService.js';
import { IAgentHostCustomizationService } from '../../../browser/agentSessions/agentHost/agentHostCustomizationService.js';
import { IAgentPluginService } from '../../../common/plugins/agentPluginService.js';
import { IMcpServer, IMcpService, IMcpWorkbenchService, IMcpSamplingService, IWorkbenchMcpServer, MCP_PLUGIN_COLLECTION_ID_PREFIX, McpConnectionState, McpServerInstallState, McpServerTransportType } from '../../../../mcp/common/mcpTypes.js';
import { DisableMcpServerForWorkspaceAction, DisableMcpServerGloballyAction, EnableMcpServerForWorkspaceAction, EnableMcpServerGloballyAction } from '../../../../mcp/browser/mcpServerActions.js';
import {
	AgentHostMcpServer,
	authenticateMcpServer,
	createBuiltinActiveSessionMcpEntries,
	createInstalledMcpServerDetailInput,
	getActiveSessionServerLifecycleAction,
	getActiveSessionServerPresentation,
	getBuiltinMcpServerEnablementActions,
	getActiveSessionServerOptionsActions,
	getAgentHostMcpServerEnablementActions,
	getLocalMcpServerEnablementActions,
	getMcpServerOutputHandler,
	getMcpStatusPresentation,
	getMcpErrorPreview,
	MCP_ERROR_PREVIEW_LENGTH,
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

function createMcpDetailTestServer(definitionOrigin?: URI, collectionOrigin?: URI): IMcpServer {
	const definitions = observableValue('definitions', {
		server: {
			id: 'server-1',
			label: 'Server One',
			launch: {
				type: McpServerTransportType.Stdio,
				command: 'server',
				args: [],
				env: {},
			},
			cacheNonce: 'server-1',
			presentation: definitionOrigin ? { origin: { uri: definitionOrigin } } : undefined,
		},
		collection: {
			presentation: collectionOrigin ? { origin: collectionOrigin } : undefined,
		},
	});
	return {
		readDefinitions: () => definitions,
	} as unknown as IMcpServer;
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

	test('uses collection origin as the installed MCP detail fallback', () => {
		const definitionOrigin = URI.file('/definition/mcp.json');
		const collectionOrigin = URI.file('/collection/mcp-config.json');
		const collectionFallback = createInstalledMcpServerDetailInput({
			type: 'builtin-item',
			id: 'collection-origin',
			label: 'Collection Origin',
			description: '',
			localServer: createMcpDetailTestServer(undefined, collectionOrigin),
		});
		const definitionPrecedence = createInstalledMcpServerDetailInput({
			type: 'builtin-item',
			id: 'definition-origin',
			label: 'Definition Origin',
			description: '',
			localServer: createMcpDetailTestServer(definitionOrigin, collectionOrigin),
		});

		assert.deepStrictEqual({
			collectionFallback: collectionFallback.source,
			definitionPrecedence: definitionPrecedence.source,
		}, {
			collectionFallback: { uri: collectionOrigin },
			definitionPrecedence: { uri: definitionOrigin },
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

	suite('row diagnostics and action stability', () => {
		// The signature tests above only cover the pure helper, so they would still pass if the
		// early return in `updateStatus` or the row guard in `renderElement` were removed. These
		// drive the renderer itself, which is the only place the reported failure is observable:
		// an erroring server re-runs the status update about twice a second, and a button node
		// replaced between mousedown and mouseup never receives the click.
		type Entry = Parameters<McpServerItemRenderer['renderElement']>[0];

		function createRenderer(server: AgentHostMcpServer, isSessionsWindow = true, useRealManagementActions = false) {
			const store = new DisposableStore();
			const onDidChangeCustomizations = store.add(new Emitter<void>());
			const sessionResource = URI.parse('vscode-agent-session:///session-1');
			const activeSessionResource = observableValue('activeSessionResource', sessionResource);
			let servers: AgentHostMcpServer[] = [server];
			const shownLogs: string[] = [];
			const shownLogSessions: string[] = [];
			const managementClicks: string[] = [];
			const hostEnablementCalls: Parameters<IAgentHostCustomizationService['setCustomizationEnablement']>[] = [];
			let localEnablementCalls: [string, ContributionEnablementState][] = [];
			let menuActions: IAction[] = [];
			const hoverContents = new Map<HTMLElement, IManagedHoverContent>();

			const agentHostCustomizationService = {
				getMcpServers: () => servers,
				onDidChangeCustomizations: onDidChangeCustomizations.event,
				showMcpServerLog: async (resource: URI, serverId: string) => { shownLogs.push(serverId); shownLogSessions.push(resource.toString()); },
				getWorkingDirectories: () => [],
				setCustomizationEnablement: (...args: Parameters<IAgentHostCustomizationService['setCustomizationEnablement']>) => { hostEnablementCalls.push(args); },
			} as unknown as IAgentHostCustomizationService;
			const customizationHarnessService = {
				activeSessionResource,
			} as unknown as ICustomizationHarnessService;
			const hoverService = new class extends mock<IHoverService>() {
				override setupManagedHover(_delegate: Parameters<IHoverService['setupManagedHover']>[0], target: HTMLElement) {
					return {
						show() { },
						hide() { },
						update: (content: IManagedHoverContent) => { hoverContents.set(target, content); },
						dispose: () => { hoverContents.delete(target); },
					};
				}
				override setupDelayedHover() { return Disposable.None; }
			}();
			const agentPluginService = { plugins: observableValue<readonly never[]>('plugins', []) } as unknown as IAgentPluginService;
			const renderManagementActions = (getEntry: () => Entry | undefined, actions: HTMLElement, disposables: DisposableStore, updateTabbability: () => void) => {
				if (useRealManagementActions) {
					widget.renderMcpListActions(getEntry, actions, disposables, updateTabbability);
					return;
				}
				const button = disposables.add(new Button(actions, unthemedButtonStyles));
				button.element.classList.add('test-management-action');
				button.element.style.width = 'auto';
				button.label = 'More Actions';
				registerMcpInlineButtonAction(disposables, button, () => { managementClicks.push('more'); });
			};
			const renderer = store.add(new McpServerItemRenderer(
				renderManagementActions,
				{ isSessionsWindow } as IAICustomizationWorkspaceService,
				agentPluginService,
				hoverService,
				agentHostCustomizationService,
				customizationHarnessService,
			));

			const container = document.createElement('div');
			container.style.cssText = 'width: 600px; --vscode-fontSize-body1: 13px; --vscode-fontSize-body2: 11px;';
			const templateData = renderer.renderTemplate(container);
			store.add({ dispose: () => renderer.disposeTemplate(templateData) });
			const widget = Object.create(McpListWidget.prototype) as {
				getMcpEntryAriaLabel(entry: Entry, renderer?: McpServerItemRenderer): IObservable<string>;
				getMcpServerActions(entry: Entry, store: DisposableStore): IAction[];
				renderMcpListActions(getEntry: () => Entry | undefined, actions: HTMLElement, store: DisposableStore, updateTabbability: () => void): void;
				createMcpSectionList(container: HTMLElement, label: string, entries: readonly Entry[]): void;
				layoutMcpSectionLists(): void;
				sectionLists: { list: WorkbenchList<Entry>; container: HTMLElement }[];
			};
			Object.assign(widget, {
				agentHostCustomizationService,
				customizationHarnessService,
				workspaceService: { isSessionsWindow },
				agentHostCustomizationsChanged: observableSignalFromEvent('customizationsChanged', onDidChangeCustomizations.event),
				showMcpServerActions: (entry: Entry) => { menuActions = widget.getMcpServerActions(entry, store); },
			});
			const ariaSubscription = store.add(new MutableDisposable());
			let ariaLabel = '';

			return {
				store,
				templateData,
				shownLogs,
				shownLogSessions,
				managementClicks,
				hostEnablementCalls,
				localEnablementCalls: () => localEnablementCalls,
				menuActions: () => menuActions,
				activeSessionResource,
				setAriaProvider: (provider: (entry: Entry) => IObservable<string>) => { widget.getMcpEntryAriaLabel = provider; },
				menu: (entry: Entry, localServer?: IMcpServer) => {
					const instantiationService = workbenchInstantiationService({}, store);
					const enablement = createMcpService(ContributionEnablementState.EnabledProfile);
					localEnablementCalls = enablement.calls;
					const mcpService = new class extends mock<IMcpService>() {
						override readonly servers = observableValue<readonly IMcpServer[]>('servers', localServer ? [localServer] : []);
						override readonly enablementModel = enablement.service.enablementModel;
					}();
					const mcpWorkbenchService = new class extends mock<IMcpWorkbenchService>() {
						override readonly local = [];
					}();
					instantiationService.stub(IMcpService, mcpService);
					instantiationService.stub(IMcpWorkbenchService, mcpWorkbenchService);
					instantiationService.stub(IMcpRegistry, { collections: observableValue('collections', []) });
					instantiationService.stub(IMcpSamplingService, { hasLogs: () => false });
					instantiationService.stub(IAuthenticationService, {});
					instantiationService.stub(IAuthenticationQueryService, {
						mcpServer: () => new class extends mock<ReturnType<IAuthenticationQueryService['mcpServer']>>() {
							override getAllAccountPreferences() { return new Map(); }
						}(),
					});
					Object.assign(widget, {
						instantiationService, mcpService, mcpWorkbenchService, agentPluginService,
						commandService: { executeCommand: async () => undefined },
						workspaceService: { isSessionsWindow, getActiveProjectRoot: () => undefined },
						outputService: { showChannel: async () => { } },
					});
					return widget.getMcpServerActions(entry, store);
				},
				createSection: (entries: readonly Entry[], width = 500, height = 300) => {
					const root = DOM.append(document.body, DOM.$('.plugin-list-widget'));
					root.style.cssText = `width: ${width}px; height: ${height}px; --vscode-spacing-size120: 12px; --vscode-spacing-size80: 8px; --vscode-fontSize-body1: 13px; --vscode-fontSize-body2: 11px;`;
					store.add({ dispose: () => root.remove() });
					const instantiationService = workbenchInstantiationService({}, store);
					instantiationService.stub(IListService, store.add(new ListService()));
					instantiationService.stub(IAICustomizationWorkspaceService, { isSessionsWindow });
					instantiationService.stub(IAgentHostCustomizationService, agentHostCustomizationService);
					instantiationService.stub(ICustomizationHarnessService, customizationHarnessService);
					instantiationService.stub(IAgentPluginService, agentPluginService);
					instantiationService.stub(IHoverService, hoverService);
					instantiationService.stub(IOutputService, { showChannel: async () => { } });
					Object.assign(widget, {
						instantiationService,
						cardDisposables: store,
						cardListControllers: new Map(),
						sectionScrollPositions: new Map(),
						sectionLists: [],
						sectionLayoutContainer: root,
						element: root,
						pendingSectionLayout: store.add(new MutableDisposable()),
						cardScrollable: { scanDomNode() { } },
						renderMcpListActions: renderManagementActions,
					});
					const container = DOM.append(root, DOM.$('div'));
					widget.createMcpSectionList(container, 'Installed MCP Servers', entries);
					widget.layoutMcpSectionLists();
					const list = widget.sectionLists[0].list;
					return {
						list,
						root,
						container,
						resize: (width: number) => {
							root.style.width = `${width}px`;
							widget.layoutMcpSectionLists();
						},
						settle: async () => {
							for (let frame = 0; frame < 4; frame++) {
								await new Promise<void>(resolve => store.add(DOM.scheduleAtNextAnimationFrame(DOM.getWindow(root), () => resolve())));
							}
						},
					};
				},
				render: (entry: Entry = createBuiltinActiveSessionMcpEntries([server])[0]) => {
					renderer.renderElement(entry, 0, templateData);
					renderer.setFocusedIndex(0);
					const label = widget.getMcpEntryAriaLabel(entry, renderer);
					ariaSubscription.value = autorun(reader => { ariaLabel = label.read(reader); });
				},
				read: () => ({
					text: templateData.description.textContent,
					error: templateData.description.classList.contains('error'),
					display: templateData.description.style.display,
					hover: hoverContents.get(templateData.description),
					ariaLabel,
				}),
				notifyUnchanged: () => onDidChangeCustomizations.fire(),
				setServers: (next: AgentHostMcpServer[]) => { servers = next; },
				actionNode: () => templateData.actions.firstElementChild,
			};
		}

		const erroring = () => createAgentHostServer({ id: 'server-1', status: McpServerStatus.Error, state: { kind: McpServerStatus.Error, error: { errorType: 'spawn', message: 'failed to start' } } });

		function nativeServer() {
			const outputCalls: string[] = [];
			const connectionState = observableValue<McpConnectionState>('connectionState', { state: McpConnectionState.Kind.Error, message: 'Native connection failed' });
			const enablement = observableValue('enablement', ContributionEnablementState.EnabledProfile);
			const server = new class extends mock<IMcpServer>() {
				override readonly definition = { ...createMcpDetailTestServer().readDefinitions().get().server, id: 'native', label: 'Native' };
				override readonly connectionState = connectionState;
				override readonly enablement = enablement;
				override readonly capabilities = observableValue('capabilities', undefined);
				override async showOutput() { outputCalls.push('native'); }
			}();
			const workbenchServer = new class extends mock<IWorkbenchMcpServer>() {
				override readonly id = 'native';
				override readonly label = 'Native';
				override readonly description = 'Ordinary description';
				override readonly name = 'Native';
				override readonly installState = McpServerInstallState.Installed;
				override readonly local = new class extends mock<IWorkbenchLocalMcpServer>() { }();
			}();
			return { server, workbenchServer, connectionState, enablement, outputCalls };
		}

		for (const kind of ['native', 'matched', 'builtin', 'plugin', 'matched-builtin', 'session-only', 'host-builtin-no-local'] as const) {
			test(`${kind} errors omit the trailing indicator and retain menu output routing`, async () => {
				const ctx = createRenderer(erroring(), false);
				disposables.add(ctx.store);
				const native = nativeServer();
				const entry: Entry = kind === 'session-only'
					? { type: 'session-server-item', server: erroring() }
					: kind === 'native' || kind === 'matched'
						? { type: 'server-item', server: native.workbenchServer, localServer: native.server, activeSessionServer: kind === 'matched' ? erroring() : undefined }
						: { type: 'builtin-item', id: 'builtin', label: 'Builtin', description: '', localServer: kind === 'host-builtin-no-local' ? undefined : native.server, activeSessionServer: kind === 'matched-builtin' || kind === 'host-builtin-no-local' ? erroring() : undefined, collectionId: kind === 'plugin' ? `${MCP_PLUGIN_COLLECTION_ID_PREFIX}file:///plugin` : undefined };
				ctx.render(entry);
				ctx.activeSessionResource.set(URI.parse('vscode-agent-session:///session-2'), undefined);
				const actions = ctx.menu(entry, native.server);
				const output = actions.filter(action => action.label === 'Show Output');
				assert.strictEqual(output.length, 1, 'exactly one accessible output action');
				await output[0].run();
				const hostOwned = !['native', 'builtin', 'plugin'].includes(kind);
				assert.deepStrictEqual({
					badge: ctx.templateData.statusBadge.textContent,
					trailingStatus: ctx.templateData.actions.querySelectorAll('.mcp-server-status').length,
					managementButtons: ctx.templateData.actions.querySelectorAll('.test-management-action').length,
					enabledOutput: output[0].enabled,
					nativeCalls: native.outputCalls,
					hostCalls: ctx.shownLogs,
					hostSessions: ctx.shownLogSessions,
				}, {
					badge: 'Error', trailingStatus: 0, managementButtons: 1, enabledOutput: true,
					nativeCalls: hostOwned ? [] : ['native'],
					hostCalls: hostOwned ? ['server-1'] : [],
					hostSessions: hostOwned ? ['vscode-agent-session:/session-2'] : [],
				});
			});
		}

		test('a removed active-session server cannot fall back to native output', () => {
			const ctx = createRenderer(erroring());
			disposables.add(ctx.store);
			const native = nativeServer();
			ctx.setServers([]);
			const actions = ctx.menu({ type: 'server-item', server: native.workbenchServer, localServer: native.server, activeSessionServer: erroring() }, native.server);
			assert.deepStrictEqual(actions, []);
		});

		for (const kind of ['matched', 'builtin', 'plugin', 'session-only'] as const) {
			test(`${kind} actions follow current host enablement without replacing the row or message-only buttons`, async () => {
				const server = createAgentHostServer({ ...erroring(), isPluginProvided: true, isClientBundled: false });
				const ctx = createRenderer(server, true, true);
				disposables.add(ctx.store);
				const native = nativeServer();
				const entry: Entry = kind === 'session-only'
					? { type: 'session-server-item', server }
					: kind === 'matched'
						? { type: 'server-item', server: native.workbenchServer, localServer: native.server, activeSessionServer: server }
						: { type: 'builtin-item', id: 'builtin', label: 'Builtin', description: 'Description', localServer: native.server, activeSessionServer: server, collectionId: kind === 'plugin' ? `${MCP_PLUGIN_COLLECTION_ID_PREFIX}file:///plugin` : undefined };
				ctx.menu(entry, native.server);
				document.body.appendChild(ctx.templateData.container);
				disposables.add({ dispose: () => ctx.templateData.container.remove() });
				ctx.render(entry);
				const toggle = ctx.templateData.actions.querySelector<HTMLButtonElement>('[role="switch"]')!;
				const more = ctx.templateData.actions.querySelector<HTMLElement>('.plugin-card-icon-button')!;
				more.focus();
				more.dispatchEvent(new MouseEvent(DOM.EventType.MOUSE_DOWN, { bubbles: true }));
				const starts: string[] = [];
				const enablement: CustomizationEnablement[] = [
					{ kind: CustomizationEnablementKind.Session, enabled: true },
					{ kind: CustomizationEnablementKind.Global, enabled: false },
				];
				ctx.setServers([{ ...server, enablement, start: async () => { starts.push('current'); } }]);
				ctx.notifyUnchanged();
				const checkedAfterSnapshot = toggle.getAttribute('aria-checked');
				ctx.setServers([{ ...server, enablement, start: async () => { starts.push('latest'); }, state: { kind: McpServerStatus.Error, error: { errorType: 'fixture', message: 'New detail' } } }]);
				ctx.notifyUnchanged();
				more.dispatchEvent(new MouseEvent(DOM.EventType.MOUSE_UP, { bubbles: true }));
				more.click();
				const latestActions = ctx.menuActions();
				await latestActions.find(action => action.label === 'Start Server')!.run();
				await latestActions.find(action => action.label === 'Show Output')!.run();
				const focused = document.activeElement === more;
				toggle.click();
				assert.deepStrictEqual({
					checkedAfterSnapshot,
					currentToggle: ctx.templateData.actions.querySelector('[role="switch"]') === toggle,
					currentMore: ctx.templateData.actions.querySelector('.plugin-card-icon-button') === more,
					focused,
					scopeLabels: latestActions.filter(action => action.id.startsWith('mcpServer.agentHost.')).map(action => action.label),
					starts,
					hostEnablement: ctx.hostEnablementCalls,
					localEnablement: ctx.localEnablementCalls(),
					logs: ctx.shownLogs,
					logSessions: ctx.shownLogSessions,
				}, {
					checkedAfterSnapshot: 'false', currentToggle: true, currentMore: true, focused: true,
					scopeLabels: kind === 'matched' ? ['Disable (Session)'] : ['Enable', 'Disable (Session)'],
					starts: ['latest'],
					hostEnablement: [[ctx.activeSessionResource.get(), server.id, enablement, CustomizationEnablementKind.Global, true]],
					localEnablement: [], logs: [server.id], logSessions: [ctx.activeSessionResource.get().toString()],
				});
				ctx.setServers([]);
				ctx.notifyUnchanged();
				toggle.click();
				more.click();
				assert.deepStrictEqual({
					badge: ctx.templateData.statusBadge.textContent,
					controls: ctx.templateData.actions.childElementCount,
					menu: ctx.menu(entry, native.server),
					hostEnablementCount: ctx.hostEnablementCalls.length,
				}, { badge: '', controls: 0, menu: [], hostEnablementCount: 1 });

				ctx.setServers([{ ...server, enablement }]);
				const replacementSession = URI.parse('vscode-agent-session:///replacement');
				ctx.activeSessionResource.set(replacementSession, undefined);
				ctx.templateData.actions.querySelector<HTMLButtonElement>('[role="switch"]')!.click();
				ctx.templateData.actions.querySelector<HTMLElement>('.plugin-card-icon-button')!.click();
				await ctx.menuActions().find(action => action.label === 'Show Output')!.run();
				assert.deepStrictEqual({
					enablement: ctx.hostEnablementCalls.at(-1),
					outputSession: ctx.shownLogSessions.at(-1),
				}, {
					enablement: [replacementSession, server.id, enablement, CustomizationEnablementKind.Global, true],
					outputSession: replacementSession.toString(),
				});
			});
		}

		test('a fresh disabled reason locks the existing switch even when status remains disabled', () => {
			const server = createAgentHostServer({ ...erroring(), enabled: false, enablement: [{ kind: CustomizationEnablementKind.Global, enabled: false }] });
			const ctx = createRenderer(server, true, true);
			disposables.add(ctx.store);
			const entry: Entry = { type: 'session-server-item', server };
			ctx.menu(entry);
			ctx.render(entry);
			ctx.setServers([{ ...server, disabledReason: { source: 'plugin', plugin: { id: 'plugin', name: 'Plugin', uri: 'file:///plugin', enablement: [{ kind: CustomizationEnablementKind.Global, enabled: false }] } } }]);
			ctx.notifyUnchanged();
			const toggle = ctx.templateData.actions.querySelector<HTMLButtonElement>('[role="switch"]')!;
			assert.deepStrictEqual({
				disabled: toggle.disabled,
				label: toggle.getAttribute('aria-label'),
				calls: ctx.hostEnablementCalls,
			}, { disabled: true, label: 'Server One is disabled by its plugin', calls: [] });
		});

		test('native management controls keep their durable local target', () => {
			const ctx = createRenderer(erroring(), false, true);
			disposables.add(ctx.store);
			const native = nativeServer();
			const entry: Entry = { type: 'server-item', server: native.workbenchServer, localServer: native.server };
			ctx.menu(entry, native.server);
			ctx.render(entry);
			ctx.setServers([]);
			ctx.notifyUnchanged();
			ctx.templateData.actions.querySelector<HTMLButtonElement>('[role="switch"]')!.click();
			assert.deepStrictEqual({ local: ctx.localEnablementCalls(), host: ctx.hostEnablementCalls }, {
				local: [['native', ContributionEnablementState.DisabledProfile]], host: [],
			});
		});

		test('explicitly expanded errors show every line and unbroken token, resize and preserve actions', async () => {
			const server = erroring();
			const ctx = createRenderer(server);
			disposables.add(ctx.store);
			const section = ctx.createSection([
				{ type: 'session-server-item', server },
				{ type: 'builtin-item', id: 'healthy', label: 'Healthy', description: 'Ordinary description' },
			], 600, 800);
			await section.settle();
			section.list.setFocus([0]);
			const row = section.container.querySelector<HTMLElement>('.mcp-server-item')!;
			const button = row.querySelector<HTMLElement>('.test-management-action')!;
			button.focus();
			const shortHeight = section.list.getElementHeight(0);
			const message = `First line\nhttps://example.test/${'unbroken'.repeat(65)}\nFINAL CHARACTERS`;
			ctx.setServers([{ ...server, state: { kind: McpServerStatus.Error, error: { errorType: 'fixture', message } } }]);
			ctx.notifyUnchanged();
			await section.settle();
			assert.ok(section.list.getElementHeight(0) <= 120);
			row.querySelector<HTMLElement>('.mcp-server-error-toggle')!.click();
			await section.settle();
			const wideHeight = section.list.getElementHeight(0);
			section.resize(280);
			await section.settle();
			const narrowHeight = section.list.getElementHeight(0);
			const description = row.querySelector<HTMLElement>('.mcp-server-description')!;
			const range = document.createRange();
			range.selectNodeContents(description);
			const textBounds = range.getBoundingClientRect();
			const rowBounds = row.getBoundingClientRect();
			const followingRow = section.container.querySelectorAll<HTMLElement>('.mcp-server-item')[1];
			assert.deepStrictEqual({
				grew: wideHeight > shortHeight,
				narrowGrew: narrowHeight > wideHeight,
				text: description.textContent,
				textFitsVertically: textBounds.bottom <= rowBounds.bottom,
				textFitsHorizontally: textBounds.right <= rowBounds.right,
				nextRowBelow: followingRow.getBoundingClientRect().top >= rowBounds.bottom,
				healthyHeight: section.list.getElementHeight(1),
				contentHeight: section.list.contentHeight,
				minimumAllocation: section.container.clientHeight,
				stableAction: row.querySelector('.test-management-action') === button,
				focus: document.activeElement === button,
				whiteSpace: DOM.getWindow(description).getComputedStyle(description).whiteSpace,
				wrap: DOM.getWindow(description).getComputedStyle(description).overflowWrap,
				padding: DOM.getWindow(row).getComputedStyle(row).paddingBottom,
			}, {
				grew: true, narrowGrew: true, text: message, textFitsVertically: true, textFitsHorizontally: true, nextRowBelow: true,
				healthyHeight: 66, contentHeight: narrowHeight + 66, minimumAllocation: narrowHeight + 66,
				stableAction: true, focus: true, whiteSpace: 'pre-wrap', wrap: 'anywhere', padding: '12px',
			});
			button.click();
			assert.deepStrictEqual(ctx.managementClicks, ['more']);
			section.resize(600);
			await section.settle();
			assert.strictEqual(section.list.getElementHeight(0), wideHeight);
			ctx.setServers([server]);
			ctx.notifyUnchanged();
			await section.settle();
			assert.strictEqual(section.list.getElementHeight(0), shortHeight);
			ctx.setServers([createAgentHostServer()]);
			ctx.notifyUnchanged();
			await section.settle();
			assert.deepStrictEqual([section.list.getElementHeight(0), section.list.contentHeight, section.container.clientHeight, row.classList.contains('has-error')], [66, 132, 132, false]);
		});

		test('offscreen errors are remeasured on recycling without losing the visible scroll anchor', async () => {
			const server = erroring();
			const ctx = createRenderer(server);
			disposables.add(ctx.store);
			const entries: Entry[] = Array.from({ length: 20 }, (_, index) => ({
				type: 'builtin-item', id: `healthy-${index}`, label: `Healthy ${index}`, description: 'Ordinary description',
			}));
			entries[15] = { type: 'session-server-item', server };
			const section = ctx.createSection(entries, 350, 264);
			await section.settle();
			section.list.reveal(15);
			await section.settle();
			section.list.reveal(0);
			await section.settle();
			const scrollTop = section.list.scrollTop;
			ctx.setServers([{ ...server, state: { kind: McpServerStatus.Error, error: { errorType: 'fixture', message: 'Long error\n'.repeat(20) + 'FINAL' } } }]);
			ctx.notifyUnchanged();
			await section.settle();
			assert.strictEqual(section.list.scrollTop, scrollTop);
			section.list.reveal(15);
			await section.settle();
			assert.ok(section.list.getElementHeight(15) <= 120);
			section.container.querySelector<HTMLElement>('[data-index="15"] .mcp-server-error-toggle')!.click();
			await section.settle();
			assert.ok(section.list.getElementHeight(15) > 280);
			section.list.reveal(0);
			await section.settle();
			section.list.reveal(15);
			await section.settle();
			assert.ok(section.list.getElementHeight(15) > 280, 'the same error stays expanded across recycling');
			section.list.reveal(0);
			await section.settle();
			ctx.setServers([{ ...server, enabled: false }]);
			ctx.notifyUnchanged();
			await section.settle();
			section.resize(260);
			section.list.reveal(15);
			await section.settle();
			assert.deepStrictEqual({
				height: section.list.getElementHeight(15),
				diagnostics: section.container.querySelectorAll('.mcp-server-description.error').length,
				renderedRows: section.container.querySelectorAll('.mcp-server-item').length < entries.length,
			}, { height: 66, diagnostics: 0, renderedRows: true });
		});

		test('native errors resize while visible and after a collapsed section changes', async () => {
			const ctx = createRenderer(erroring(), false);
			disposables.add(ctx.store);
			const native = nativeServer();
			const section = ctx.createSection([{ type: 'server-item', server: native.workbenchServer, localServer: native.server }], 320);
			await section.settle();
			const button = section.container.querySelector('.test-management-action');
			const longError = 'Transport failure\n'.repeat(12) + 'END';
			native.connectionState.set({ state: McpConnectionState.Kind.Error, message: longError }, undefined);
			await section.settle();
			const longHeight = section.list.getElementHeight(0);
			assert.ok(longHeight > 66);
			assert.strictEqual(section.container.querySelector('.test-management-action'), button);
			native.enablement.set(ContributionEnablementState.DisabledProfile, undefined);
			await section.settle();
			assert.strictEqual(section.list.getElementHeight(0), 66);
			section.container.hidden = true;
			section.container.style.display = 'none';
			native.enablement.set(ContributionEnablementState.EnabledProfile, undefined);
			await section.settle();
			section.container.hidden = false;
			section.container.style.display = '';
			section.resize(320);
			await section.settle();
			assert.deepStrictEqual({
				height: section.list.getElementHeight(0),
				allocatedHeight: section.container.clientHeight,
				text: section.container.querySelector('.mcp-server-description')?.textContent,
			}, { height: longHeight, allocatedHeight: longHeight, text: longError });
			native.connectionState.set({ state: McpConnectionState.Kind.Stopped }, undefined);
			await section.settle();
			assert.strictEqual(section.list.getElementHeight(0), 66);
		});

		test('switching sessions clears a tall diagnostic and shrinks its section', async () => {
			const server = { ...erroring(), state: { kind: McpServerStatus.Error, error: { errorType: 'fixture', message: 'Session error\n'.repeat(15) } } } satisfies AgentHostMcpServer;
			const ctx = createRenderer(server);
			disposables.add(ctx.store);
			const section = ctx.createSection([{ type: 'session-server-item', server }], 320);
			await section.settle();
			section.container.querySelector<HTMLElement>('.mcp-server-error-toggle')!.click();
			await section.settle();
			assert.ok(section.list.getElementHeight(0) > 200);
			ctx.setServers([]);
			ctx.activeSessionResource.set(URI.parse('vscode-agent-session:///replacement'), undefined);
			await section.settle();
			assert.deepStrictEqual({
				height: section.list.getElementHeight(0),
				allocatedHeight: section.container.clientHeight,
				ariaLabel: section.container.querySelector('.mcp-server-item')?.getAttribute('aria-label'),
				text: section.container.querySelector('.mcp-server-description')?.textContent,
			}, { height: 66, allocatedHeight: 66, ariaLabel: 'Server One', text: '' });
		});

		for (const message of ['Connection refused', '', ' \t\r\n ', 'First line\nSecond line\r\nThird line', 'Long diagnostic '.repeat(100), '<b>not HTML</b> [not a link](command:test) $(error)']) {
			test(`shows bounded plain-text error and accessible hover: ${JSON.stringify(message.slice(0, 40))}`, () => {
				const ctx = createRenderer(createAgentHostServer({ status: McpServerStatus.Error, state: { kind: McpServerStatus.Error, error: { errorType: 'fixture', message } } }));
				disposables.add(ctx.store);
				ctx.render();
				const expected = message.trim() ? message : 'The server reported an error without additional details.';
				const preview = getMcpErrorPreview(expected);
				assert.deepStrictEqual({ ...ctx.read(), childCount: ctx.templateData.description.childElementCount }, {
					text: preview.text, error: true, display: '', hover: preview.text,
					ariaLabel: `Server One, Error, ${preview.text}${preview.truncated ? '. Use Show More to read the full error.' : ''}`, childCount: 0,
				});
			});
		}

		test('uses a neutral fallback when full error details are absent', () => {
			const ctx = createRenderer(createAgentHostServer({ status: McpServerStatus.Error, state: undefined }));
			disposables.add(ctx.store);
			ctx.render();
			assert.deepStrictEqual(ctx.read(), {
				text: 'The server reported an error without additional details.', error: true, display: '',
				hover: 'The server reported an error without additional details.',
				ariaLabel: 'Server One, Error, The server reported an error without additional details.',
			});
		});

		for (const character of ['a', '\u{1F600}']) {
			for (const length of [299, 300, 301]) {
				test(`preview boundary ${length} code points (${character.length} UTF-16 units each)`, () => {
					const message = character.repeat(length);
					const ctx = createRenderer(createAgentHostServer({ ...erroring(), state: { kind: McpServerStatus.Error, error: { errorType: 'fixture', message } } }));
					disposables.add(ctx.store);
					ctx.render();
					const expected = character.repeat(Math.min(length, MCP_ERROR_PREVIEW_LENGTH)) + (length > MCP_ERROR_PREVIEW_LENGTH ? '\u2026' : '');
					assert.deepStrictEqual({
						preview: getMcpErrorPreview(message), domText: ctx.read().text, hover: ctx.read().hover,
						expansionDisplay: ctx.templateData.expandButton.element.style.display,
					}, {
						preview: { text: expected, truncated: length > MCP_ERROR_PREVIEW_LENGTH },
						domText: expected, hover: expected, expansionDisplay: length > MCP_ERROR_PREVIEW_LENGTH ? '' : 'none',
					});
				});
			}
		}

		test('huge errors never enter collapsed DOM hover or ARIA, and expansion is explicit', () => {
			const message = '<error>\n' + 'Verbose server output '.repeat(50_000) + '\nFINAL';
			const server = createAgentHostServer({ ...erroring(), state: { kind: McpServerStatus.Error, error: { errorType: 'fixture', message } } });
			const ctx = createRenderer(server);
			disposables.add(ctx.store);
			ctx.render();
			const { description, expandButton } = ctx.templateData;
			assert.deepStrictEqual({
				text: description.textContent,
				hover: ctx.read().hover,
				ariaBounded: ctx.read().ariaLabel.length < MCP_ERROR_PREVIEW_LENGTH + 100,
				totalDomBounded: ctx.templateData.container.textContent!.length < MCP_ERROR_PREVIEW_LENGTH + 100,
				controls: expandButton.element.getAttribute('aria-controls'),
				expanded: expandButton.element.getAttribute('aria-expanded'),
				plain: description.childElementCount,
			}, {
				text: getMcpErrorPreview(message).text, hover: getMcpErrorPreview(message).text,
				ariaBounded: true, totalDomBounded: true, controls: description.id, expanded: 'false', plain: 0,
			});
			expandButton.element.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', keyCode: 13, bubbles: true }));
			assert.deepStrictEqual({
				text: description.textContent, hover: ctx.read().hover,
				aria: ctx.read().ariaLabel, expanded: expandButton.element.getAttribute('aria-expanded'), label: expandButton.element.textContent,
			}, { text: message, hover: message, aria: `Server One, Error, ${message}`, expanded: 'true', label: 'Show Less' });
			expandButton.element.dispatchEvent(new KeyboardEvent('keydown', { key: ' ', keyCode: 32, bubbles: true }));
			assert.strictEqual(description.textContent, getMcpErrorPreview(message).text);
			ctx.setServers([{ ...server, state: { kind: McpServerStatus.Error, error: { errorType: 'fixture', message: ' \n'.repeat(50_000) } } }]);
			ctx.notifyUnchanged();
			assert.strictEqual(description.textContent, 'The server reported an error without additional details.');
		});

		for (const message of ['one\ntwo\nthree\nfour', 'short URL '.repeat(20)]) {
			test(`line or width clipping under 300 characters offers expansion: ${message.slice(0, 15)}`, async () => {
				const server = createAgentHostServer({ ...erroring(), state: { kind: McpServerStatus.Error, error: { errorType: 'fixture', message } } });
				const ctx = createRenderer(server);
				disposables.add(ctx.store);
				const section = ctx.createSection([{ type: 'session-server-item', server }], 240, 700);
				await section.settle();
				section.list.setFocus([0]);
				const description = section.container.querySelector<HTMLElement>('.mcp-server-description')!;
				const button = section.container.querySelector<HTMLElement>('.mcp-server-error-toggle')!;
				assert.ok(message.length < MCP_ERROR_PREVIEW_LENGTH);
				assert.deepStrictEqual({
					visible: button.style.display, height: description.clientHeight, boundedRow: section.list.getElementHeight(0) <= 120,
					clipped: description.scrollHeight > description.clientHeight, tabIndex: button.tabIndex,
				}, { visible: '', height: 42, boundedRow: true, clipped: true, tabIndex: 0 });
				button.focus();
				button.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', keyCode: 13, bubbles: true }));
				await section.settle();
				assert.deepStrictEqual({
					expanded: button.getAttribute('aria-expanded'),
					focus: document.activeElement === button,
					fullHeight: description.clientHeight === description.scrollHeight,
					stable: section.container.querySelector('.mcp-server-error-toggle') === button,
				}, { expanded: 'true', focus: true, fullHeight: true, stable: true });
				button.dispatchEvent(new KeyboardEvent('keydown', { key: ' ', keyCode: 32, bubbles: true }));
				await section.settle();
				assert.deepStrictEqual({ expanded: button.getAttribute('aria-expanded'), focus: document.activeElement === button, height: description.clientHeight },
					{ expanded: 'false', focus: true, height: 42 });
			});
		}

		test('short visible errors do not add an expansion control', async () => {
			const ctx = createRenderer(erroring());
			disposables.add(ctx.store);
			const section = ctx.createSection([{ type: 'session-server-item', server: erroring() }], 600);
			await section.settle();
			assert.strictEqual(section.container.querySelector<HTMLElement>('.mcp-server-error-toggle')!.style.display, 'none');
		});

		test('width-only clipping reveals Show More, and widening removes the unnecessary control', async () => {
			const message = 'The connection failed. '.repeat(8);
			const server = createAgentHostServer({ ...erroring(), state: { kind: McpServerStatus.Error, error: { errorType: 'fixture', message } } });
			const ctx = createRenderer(server);
			disposables.add(ctx.store);
			const section = ctx.createSection([{ type: 'session-server-item', server }], 1200);
			await section.settle();
			const button = section.container.querySelector<HTMLElement>('.mcp-server-error-toggle')!;
			assert.strictEqual(button.style.display, 'none');
			section.resize(240);
			await section.settle();
			assert.strictEqual(button.style.display, '');
			section.resize(1200);
			await section.settle();
			assert.strictEqual(button.style.display, 'none');
		});

		test('native expansion is cleared by disablement even when the same error returns', async () => {
			const ctx = createRenderer(erroring(), false);
			disposables.add(ctx.store);
			const native = nativeServer();
			native.connectionState.set({ state: McpConnectionState.Kind.Error, message: 'Native details\n'.repeat(40) }, undefined);
			const section = ctx.createSection([{ type: 'server-item', server: native.workbenchServer, localServer: native.server }], 600);
			await section.settle();
			section.container.querySelector<HTMLElement>('.mcp-server-error-toggle')!.click();
			await section.settle();
			assert.ok(section.list.getElementHeight(0) > 400);
			native.enablement.set(ContributionEnablementState.DisabledProfile, undefined);
			await section.settle();
			native.enablement.set(ContributionEnablementState.EnabledProfile, undefined);
			await section.settle();
			assert.deepStrictEqual({
				expanded: section.container.querySelector('.mcp-server-error-toggle')!.getAttribute('aria-expanded'),
				boundedHeight: section.list.getElementHeight(0) <= 120,
			}, { expanded: 'false', boundedHeight: true });
		});

		test('only changed error rows are measured; offscreen ARIA and identical collapsed previews stay idle', async () => {
			const servers = Array.from({ length: 500 }, (_, index) => createAgentHostServer({ id: `server-${index}`, name: `Server ${index}` }));
			const ctx = createRenderer(servers[0]);
			disposables.add(ctx.store);
			ctx.setServers(servers);
			const entries: Entry[] = servers.map(server => ({ type: 'session-server-item', server }));
			const ariaReads = new Set<Entry>();
			ctx.setAriaProvider(entry => derived(ctx, () => { ariaReads.add(entry); return entry.type === 'session-server-item' ? entry.server.name : ''; }));
			const section = ctx.createSection(entries, 600, 264);
			await section.settle();
			const updateHeight = sinon.spy(section.list, 'updateElementHeight');
			const rerender = sinon.spy(section.list, 'rerender');
			const untouched = section.container.querySelector<HTMLElement>('[data-index="0"]')!;
			const measured = sinon.spy(untouched, 'offsetHeight', ['get']);
			disposables.add({ dispose: () => { updateHeight.restore(); rerender.restore(); measured.get.restore(); } });
			const action = untouched.querySelector('.test-management-action');
			const replaceError = (index: number, message: string) => {
				servers[index] = { ...servers[index], status: McpServerStatus.Error, state: { kind: McpServerStatus.Error, error: { errorType: 'fixture', message } } };
				ctx.setServers([...servers]);
				ctx.notifyUnchanged();
			};
			replaceError(1, 'Changed failure');
			await section.settle();
			assert.deepStrictEqual({
				measuredIndexes: updateHeight.args.map(args => args[0]), wholeListRerenders: rerender.callCount,
				untouchedMeasurements: measured.get.callCount, offscreenAria: ariaReads.has(entries[450]), ariaReads: ariaReads.size <= 5,
				sameAction: untouched.querySelector('.test-management-action') === action, scroll: section.list.scrollTop,
			}, { measuredIndexes: [1], wholeListRerenders: 0, untouchedMeasurements: 0, offscreenAria: false, ariaReads: true, sameAction: true, scroll: 0 });
			updateHeight.resetHistory();
			servers[1] = { ...servers[1], logOutputChannelId: 'changed-metadata' };
			ctx.setServers([...servers]);
			ctx.notifyUnchanged();
			await section.settle();
			assert.strictEqual(updateHeight.callCount, 0);
			replaceError(1, 'X'.repeat(300) + 'first tail');
			await section.settle();
			updateHeight.resetHistory();
			replaceError(1, 'X'.repeat(300) + 'second tail');
			await section.settle();
			assert.strictEqual(updateHeight.callCount, 0, 'a changed hidden tail does not remeasure the collapsed preview');
			section.container.querySelector<HTMLElement>('[data-index="1"] .mcp-server-error-toggle')!.click();
			await section.settle();
			assert.strictEqual(section.container.querySelector('[data-index="1"] .mcp-server-description')!.textContent, 'X'.repeat(300) + 'second tail');
			replaceError(1, 'X'.repeat(300) + 'third tail');
			await section.settle();
			assert.strictEqual(section.container.querySelector('[data-index="1"] .mcp-server-error-toggle')!.getAttribute('aria-expanded'), 'false');
			updateHeight.resetHistory();
			replaceError(450, 'Offscreen failure');
			await section.settle();
			assert.deepStrictEqual({ updates: updateHeight.args, offscreenAria: ariaReads.has(entries[450]), wholeList: rerender.callCount },
				{ updates: [[450, 66]], offscreenAria: false, wholeList: 0 });
			section.list.reveal(450);
			await section.settle();
			assert.ok(ariaReads.has(entries[450]), 'ARIA subscribes once the row is rendered');
			const anchor = section.list.firstVisibleIndex;
			const anchorTop = section.container.querySelector(`[data-index="${anchor}"]`)!.getBoundingClientRect().top;
			servers[1] = createAgentHostServer({ id: 'server-1', name: 'Server 1' });
			ctx.setServers([...servers]);
			ctx.notifyUnchanged();
			await section.settle();
			assert.deepStrictEqual({
				anchor: section.list.firstVisibleIndex,
				top: section.container.querySelector(`[data-index="${anchor}"]`)!.getBoundingClientRect().top,
			}, { anchor, top: anchorTop });
		});

		test('message-only changes preserve management action identity, keyboard focus and clicks', () => {
			const ctx = createRenderer(erroring());
			disposables.add(ctx.store);
			document.body.appendChild(ctx.templateData.container);
			disposables.add({ dispose: () => ctx.templateData.container.remove() });
			ctx.render();
			const button = ctx.templateData.actions.querySelector<HTMLElement>('.test-management-action')!;
			button.focus();
			button.dispatchEvent(new MouseEvent(DOM.EventType.MOUSE_DOWN, { bubbles: true }));
			ctx.setServers([createAgentHostServer({ ...erroring(), state: { kind: McpServerStatus.Error, error: { errorType: 'spawn', message: 'Updated error' } } })]);
			ctx.notifyUnchanged();
			button.dispatchEvent(new MouseEvent(DOM.EventType.MOUSE_UP, { bubbles: true }));
			button.click();
			assert.deepStrictEqual({
				...ctx.read(),
				sameButton: ctx.actionNode() === button,
				focused: document.activeElement === button,
				clicks: ctx.managementClicks,
			}, {
				text: 'Updated error', error: true, display: '', hover: 'Updated error', ariaLabel: 'Server One, Error, Updated error',
				sameButton: true, focused: true, clicks: ['more'],
			});
		});

		test('native message updates retain management buttons and local errors do not leak into sessions', () => {
			const native = nativeServer();
			const entry: Entry = { type: 'server-item', server: native.workbenchServer, localServer: native.server };
			const ctx = createRenderer(erroring(), false);
			disposables.add(ctx.store);
			ctx.render(entry);
			const button = ctx.actionNode();
			native.connectionState.set({ state: McpConnectionState.Kind.Error, message: 'Second native error' }, undefined);
			const sessions = createRenderer(erroring());
			disposables.add(sessions.store);
			sessions.render(entry);
			assert.deepStrictEqual({ local: ctx.read(), sameButton: ctx.actionNode() === button, sessions: sessions.read() }, {
				local: { text: 'Second native error', error: true, display: '', hover: 'Second native error', ariaLabel: 'Native, Error, Second native error' },
				sameButton: true,
				sessions: { text: 'Ordinary description', error: false, display: '', hover: 'Ordinary description', ariaLabel: 'Native' },
			});
		});

		test('starting, stopped and authentication states clear errors without adding explanations', () => {
			const ctx = createRenderer(erroring());
			disposables.add(ctx.store);
			ctx.render();
			const results = [];
			for (const status of [McpServerStatus.Starting, McpServerStatus.Stopped, McpServerStatus.AuthRequired]) {
				ctx.setServers([createAgentHostServer({ ...erroring(), status })]);
				ctx.notifyUnchanged();
				results.push({ ...ctx.read(), signIn: !!ctx.templateData.actions.querySelector('.mcp-server-sign-in') });
			}
			assert.deepStrictEqual(results, [
				{ text: '', error: false, display: 'none', hover: '', ariaLabel: 'Server One, Starting', signIn: false },
				{ text: '', error: false, display: 'none', hover: '', ariaLabel: 'Server One, Stopped', signIn: false },
				{ text: '', error: false, display: 'none', hover: '', ariaLabel: 'Server One, Authentication required', signIn: true },
			]);
		});

		test('recycling an error row for a healthy row clears the diagnostic and hover', () => {
			const ctx = createRenderer(erroring(), false);
			disposables.add(ctx.store);
			ctx.render();
			const native = nativeServer();
			native.connectionState.set({ state: McpConnectionState.Kind.Running }, undefined);
			ctx.render({ type: 'server-item', server: native.workbenchServer, localServer: native.server });
			ctx.notifyUnchanged();
			assert.deepStrictEqual(ctx.read(), {
				text: 'Ordinary description', error: false, display: '', hover: 'Ordinary description', ariaLabel: 'Native, Running',
			});
		});

		for (const kind of ['server-item', 'builtin-item', 'plugin-item'] as const) {
			test(`${kind} reads native errors and restores descriptions on recovery and disablement`, () => {
				const ctx = createRenderer(erroring(), false);
				disposables.add(ctx.store);
				const native = nativeServer();
				const entry: Entry = kind === 'server-item'
					? { type: kind, server: native.workbenchServer, localServer: native.server }
					: { type: 'builtin-item', id: 'native', label: 'Native', description: 'Ordinary description', localServer: native.server, collectionId: kind === 'plugin-item' ? `${MCP_PLUGIN_COLLECTION_ID_PREFIX}file:///plugin` : undefined };
				ctx.render(entry);
				const before = ctx.read();
				native.connectionState.set({ state: McpConnectionState.Kind.Error, message: '' }, undefined);
				const empty = ctx.read();
				native.enablement.set(ContributionEnablementState.DisabledProfile, undefined);
				const disabled = ctx.read();
				native.connectionState.set({ state: McpConnectionState.Kind.Running }, undefined);
				native.enablement.set(ContributionEnablementState.EnabledProfile, undefined);
				assert.deepStrictEqual({ before, empty, disabled, recovered: ctx.read() }, {
					before: { text: 'Native connection failed', error: true, display: '', hover: 'Native connection failed', ariaLabel: 'Native, Error, Native connection failed' },
					empty: { text: 'The server reported an error without additional details.', error: true, display: '', hover: 'The server reported an error without additional details.', ariaLabel: 'Native, Error, The server reported an error without additional details.' },
					disabled: { text: 'Ordinary description', error: false, display: '', hover: 'Ordinary description', ariaLabel: 'Native, Disabled' },
					recovered: { text: 'Ordinary description', error: false, display: '', hover: 'Ordinary description', ariaLabel: kind === 'server-item' ? 'Native, Running' : 'Native' },
				});
			});
		}

		for (const kind of ['server-item', 'builtin-item', 'session-server-item'] as const) {
			test(`${kind} uses current session errors, clears removed servers and survives recycling`, () => {
				const ctx = createRenderer(erroring());
				disposables.add(ctx.store);
				const native = nativeServer();
				native.enablement.set(ContributionEnablementState.DisabledProfile, undefined);
				const entry: Entry = kind === 'server-item'
					? { type: kind, server: native.workbenchServer, localServer: native.server, activeSessionServer: erroring() }
					: kind === 'builtin-item'
						? { type: kind, id: 'native', label: 'Native', description: 'Ordinary description', localServer: native.server, activeSessionServer: erroring() }
						: { type: kind, server: erroring() };
				ctx.render(entry);
				const error = ctx.read();
				const action = ctx.actionNode();
				ctx.setServers([createAgentHostServer({ ...erroring(), state: { kind: McpServerStatus.Error, error: { errorType: 'fixture', message: 'Changed session error' } } })]);
				ctx.notifyUnchanged();
				const updated = { ...ctx.read(), sameAction: ctx.actionNode() === action };
				ctx.setServers([createAgentHostServer({ ...erroring(), enabled: false })]);
				ctx.notifyUnchanged();
				const disabled = ctx.read();
				ctx.setServers([createAgentHostServer()]);
				ctx.notifyUnchanged();
				const recovered = ctx.read();
				ctx.setServers([]);
				ctx.activeSessionResource.set(URI.parse('vscode-agent-session:///session-2'), undefined);
				const removed = ctx.read();
				ctx.setServers([createAgentHostServer({ ...erroring(), id: 'server-2', name: 'Server Two' })]);
				ctx.render({ type: 'session-server-item', server: createAgentHostServer({ id: 'server-2', name: 'Server Two' }) });
				const recycled = ctx.read();
				native.connectionState.set({ state: McpConnectionState.Kind.Error, message: 'Obsolete native error' }, undefined);
				ctx.notifyUnchanged();
				const name = kind === 'session-server-item' ? 'Server One' : 'Native';
				const description = kind === 'session-server-item' ? '' : 'Ordinary description';
				const ordinary = { text: description, error: false, display: description ? '' : 'none', hover: description };
				assert.deepStrictEqual({ error, updated, disabled, recovered, removed, recycled, afterOldUpdate: ctx.read() }, {
					error: { text: 'failed to start', error: true, display: '', hover: 'failed to start', ariaLabel: `${name}, Error, failed to start` },
					updated: { text: 'Changed session error', error: true, display: '', hover: 'Changed session error', ariaLabel: `${name}, Error, Changed session error`, sameAction: true },
					disabled: { ...ordinary, ariaLabel: `${name}, Disabled` },
					recovered: { ...ordinary, ariaLabel: `${name}, Running` },
					removed: { ...ordinary, ariaLabel: name },
					recycled: { text: 'failed to start', error: true, display: '', hover: 'failed to start', ariaLabel: 'Server Two, Error, failed to start' },
					afterOldUpdate: { text: 'failed to start', error: true, display: '', hover: 'failed to start', ariaLabel: 'Server Two, Error, failed to start' },
				});
			});
		}

		test('management buttons stay the same clickable nodes across repeated identical updates', () => {
			const ctx = createRenderer(erroring());
			disposables.add(ctx.store);
			ctx.render();

			const button = ctx.actionNode();
			assert.ok(button, 'expected an action for an erroring server');
			assert.deepStrictEqual({
				text: ctx.templateData.statusBadge.textContent,
				className: ctx.templateData.statusBadge.className,
			}, {
				text: 'Error',
				className: 'plugin-list-item-status mcp-runtime-status-badge error',
			});

			// What the autorun does in production while a server sits in error.
			for (let i = 0; i < 10; i++) {
				ctx.notifyUnchanged();
			}

			assert.strictEqual(ctx.actionNode(), button, 'the button was replaced by an update that changed nothing');
			assert.strictEqual(button.parentElement, ctx.templateData.actions, 'the button was detached from the row');

			(button as HTMLElement).click();

			assert.deepStrictEqual(ctx.managementClicks, ['more']);
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

			// Recovering from error restores the non-error status indicator.
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
