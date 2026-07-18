/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import * as DOM from '../../../../../../base/browser/dom.js';
import { Button, unthemedButtonStyles } from '../../../../../../base/browser/ui/button/button.js';
import { URI } from '../../../../../../base/common/uri.js';
import { IAction, Separator } from '../../../../../../base/common/actions.js';
import { DisposableStore, isDisposable } from '../../../../../../base/common/lifecycle.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../../base/test/common/utils.js';
import { McpServerStatus } from '../../../../../../platform/agentHost/common/state/protocol/state.js';
import { ContributionEnablementState } from '../../../common/enablement.js';
import { ICommandService } from '../../../../../../platform/commands/common/commands.js';
import { IAgentHostCustomizationService } from '../../../browser/agentSessions/agentHost/agentHostCustomizationService.js';
import { IMcpService } from '../../../../mcp/common/mcpTypes.js';
import {
	AgentHostMcpServer,
	authenticateMcpServer,
	getActiveSessionServerOptionsActions,
	getAgentHostMcpServerEnablementActions,
	getLocalMcpServerEnablementActions,
	getMcpServerOutputHandler,
	getSessionEnablementAction,
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

function createAgentHostCustomizations(enablement: ContributionEnablementState): { service: IAgentHostCustomizationService; calls: [URI, string, ContributionEnablementState][] } {
	const calls: [URI, string, ContributionEnablementState][] = [];
	const service = {
		getMcpServerEnablement: () => enablement,
		setMcpServerEnablement: (sessionResource: URI, serverName: string, state: ContributionEnablementState) => {
			calls.push([sessionResource, serverName, state]);
		},
	} as unknown as IAgentHostCustomizationService;
	return { service, calls };
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

	suite('getSessionEnablementAction', () => {
		test('labels as Disable (Session) when the server is enabled and toggles it off', () => {
			let toggledTo: boolean | undefined;
			const server = createAgentHostServer({ enabled: true, setEnabled: (v: boolean) => { toggledTo = v; } });
			const [action] = trackActions(disposables, [getSessionEnablementAction(server)]);
			assert.strictEqual(action.label, 'Disable (Session)');
			runAction(action);
			assert.strictEqual(toggledTo, false);
		});

		test('labels as Enable (Session) when the server is disabled and toggles it on', () => {
			let toggledTo: boolean | undefined;
			const server = createAgentHostServer({ enabled: false, setEnabled: (v: boolean) => { toggledTo = v; } });
			const [action] = trackActions(disposables, [getSessionEnablementAction(server)]);
			assert.strictEqual(action.label, 'Enable (Session)');
			runAction(action);
			assert.strictEqual(toggledTo, true);
		});
	});

	suite('getAgentHostMcpServerEnablementActions', () => {
		const sessionResource = URI.parse('vscode-agent-session:///session-1');

		test('offers Enable + Enable (Workspace) when disabled and workbench has a workspace', () => {
			const { service, calls } = createAgentHostCustomizations(ContributionEnablementState.DisabledProfile);
			const server = createAgentHostServer();
			const actions = trackActions(disposables, getAgentHostMcpServerEnablementActions(service, sessionResource, server, false));
			assert.deepStrictEqual(actions.map(a => a.label), ['Enable', 'Enable (Workspace)']);
			runAction(actions[1]);
			assert.deepStrictEqual(calls, [[sessionResource, server.name, ContributionEnablementState.EnabledWorkspace]]);
		});

		test('offers only Disable when enabled and workbench is empty', () => {
			const { service } = createAgentHostCustomizations(ContributionEnablementState.EnabledProfile);
			const server = createAgentHostServer();
			const actions = trackActions(disposables, getAgentHostMcpServerEnablementActions(service, sessionResource, server, true));
			assert.deepStrictEqual(actions.map(a => a.label), ['Disable']);
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

		test('omits the workspace variant in an empty workbench', () => {
			const { service } = createMcpService(ContributionEnablementState.DisabledProfile);
			const actions = trackActions(disposables, getLocalMcpServerEnablementActions(service, 'server-def-id', true));
			assert.deepStrictEqual(actions.map(a => a.label), ['Enable']);
		});
	});

	suite('getActiveSessionServerOptionsActions', () => {
		test('composes lifecycle, durable, session, and options actions without duplicating groups', () => {
			const { service } = createAgentHostCustomizations(ContributionEnablementState.EnabledProfile);
			const server = createAgentHostServer({ enabled: true, status: McpServerStatus.Ready });
			const sessionResource = URI.parse('vscode-agent-session:///session-1');
			const commandService = { executeCommand: async () => undefined } as unknown as ICommandService;
			const actions = trackActions(disposables, getActiveSessionServerOptionsActions(
				commandService,
				service,
				false,
				sessionResource,
				server,
			));

			const labels = actions.map(a => a instanceof Separator ? '(separator)' : a.label);
			// Stop Server (lifecycle) -> separator -> profile/workspace/session enablement -> separator -> Server Options
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

		test('active-session error opens the agent-host output without opening the row', () => {
			const shownChannels: string[] = [];
			let localOutputCount = 0;
			const outputHandler = getMcpServerOutputHandler(
				{ showChannel: async channelId => { shownChannels.push(channelId); } },
				{ showOutput: async () => { localOutputCount++; } },
				createAgentHostServer({ logOutputChannelId: 'agent-host-output' }),
			);
			assert.ok(outputHandler);
			const row = document.createElement('div');
			let rowClicks = 0;
			disposables.add(DOM.addDisposableListener(row, DOM.EventType.CLICK, () => rowClicks++));
			const button = disposables.add(new Button(row, unthemedButtonStyles));
			registerMcpInlineButtonAction(disposables, button, outputHandler);

			button.element.click();

			assert.deepStrictEqual({
				shownChannels,
				localOutputCount,
				rowClicks,
			}, {
				shownChannels: ['agent-host-output'],
				localOutputCount: 0,
				rowClicks: 0,
			});
		});

		test('local error opens local output when no agent-host output exists', () => {
			const shownChannels: string[] = [];
			let localOutputCount = 0;
			const outputHandler = getMcpServerOutputHandler(
				{ showChannel: async channelId => { shownChannels.push(channelId); } },
				{ showOutput: async () => { localOutputCount++; } },
				undefined,
			);

			outputHandler?.();

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
