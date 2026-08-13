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
import { constObservable } from '../../../../../../base/common/observable.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../../base/test/common/utils.js';
import { McpServerStatus } from '../../../../../../platform/agentHost/common/state/protocol/state.js';
import { ContributionEnablementState } from '../../../common/enablement.js';
import { ICommandService } from '../../../../../../platform/commands/common/commands.js';
import { IAgentHostCustomizationService } from '../../../browser/agentSessions/agentHost/agentHostCustomizationService.js';
import { IMcpService, McpConnectionState, McpServerCacheState } from '../../../../mcp/common/mcpTypes.js';
import {
	AgentHostMcpServer,
	authenticateMcpServer,
	createActiveSessionMcpEntries,
	getActiveSessionServerOptionsActions,
	getAgentHostMcpServerEnablementActions,
	getAgentOriginLabel,
	getLocalMcpServerEnablementActions,
	getMcpServerOutputHandler,
	getMcpEntryAriaLabel,
	getSessionEnablementAction,
	getEnablementTarget,
	countSessionOnlyMcpServers,
	hasKnownMcpTools,
	areMcpToolsFromCache,
	McpEnablementScope,
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

	test('turns active-session-only MCP servers into their own row entries', () => {
		const server = createAgentHostServer({ name: 'node_repl' });
		const [entry] = createActiveSessionMcpEntries([server]);

		assert.deepStrictEqual({ type: entry.type, server: entry.server, enablement: entry.enablement }, {
			type: 'session-server-item',
			server,
			enablement: undefined,
		});
	});

	test('carries the durable choice, so a disabled row can say which layer disabled it', () => {
		// The row used to read `server.enabled` alone, so a server disabled outright from the
		// context menu still reported itself as disabled only for the session.
		const writes: [string, ContributionEnablementState][] = [];
		const server = createAgentHostServer({ name: 'node_repl' });
		const [entry] = createActiveSessionMcpEntries([server], {
			read: () => ContributionEnablementState.DisabledProfile,
			write: (name, state) => { writes.push([name, state]); },
		});
		entry.setDurableEnabled?.(true);

		assert.deepStrictEqual({ enablement: entry.enablement, writes }, {
			enablement: ContributionEnablementState.DisabledProfile,
			writes: [['node_repl', ContributionEnablementState.EnabledProfile]],
		});
	});

	suite('getAgentOriginLabel', () => {
		test('uses the agent name, and describes the machinery only when there is none', () => {
			assert.deepStrictEqual(
				[getAgentOriginLabel('Copilot'), getAgentOriginLabel(undefined)],
				['Copilot', 'Agent host']);
		});
	});

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

	suite('tool cache state', () => {
		// The two refreshing states are easy to miss because their names read like the states
		// they refresh *from*, and getting them wrong is invisible until a server is mid-refresh.
		test('a first refresh is not a known empty result', () => {
			assert.deepStrictEqual(
				[McpServerCacheState.Unknown, McpServerCacheState.RefreshingFromUnknown, McpServerCacheState.Cached, McpServerCacheState.Live].map(hasKnownMcpTools),
				[false, false, true, true]);
		});

		test('a refresh over cached tools is still showing cached tools', () => {
			assert.deepStrictEqual(
				[McpServerCacheState.Cached, McpServerCacheState.Outdated, McpServerCacheState.RefreshingFromCached, McpServerCacheState.Live].map(areMcpToolsFromCache),
				[true, true, true, false]);
		});
	});

	suite('getMcpEntryAriaLabel', () => {
		// The row always renders a status word; these guard the accessible name against drifting
		// away from it, which is invisible until someone is relying on a screen reader.
		function entry(overrides: object) {
			return { type: 'server-item', server: { label: 'Redis', local: {} }, ...overrides } as unknown as Parameters<typeof getMcpEntryAriaLabel>[0];
		}

		test('a healthy server is just its name: idle and running are not news', () => {
			assert.strictEqual(getMcpEntryAriaLabel(entry({})), 'Redis');
		});

		test('a built-in row is likewise unadorned when nothing needs attention', () => {
			const builtin = { type: 'builtin-item', label: 'GitHub Copilot' } as unknown as Parameters<typeof getMcpEntryAriaLabel>[0];
			assert.strictEqual(getMcpEntryAriaLabel(builtin), 'GitHub Copilot');
		});

		test('a failing server says so', () => {
			const failed = entry({
				localServer: {
					enablement: constObservable(ContributionEnablementState.EnabledProfile),
					connectionState: constObservable({ state: McpConnectionState.Kind.Error }),
				},
			});
			assert.strictEqual(getMcpEntryAriaLabel(failed), 'Redis, Failed');
		});

		test('disabled is spoken even though the row leaves it to the switch', () => {
			// The switch is a separate stop in the reading order, so a row label that omitted
			// this would leave a screen reader user with no way to know the server is off.
			const off = entry({ localServer: { enablement: constObservable(ContributionEnablementState.DisabledProfile) } });
			assert.strictEqual(getMcpEntryAriaLabel(off), 'Redis, Disabled');
		});

		test('a gallery row has no status, because nothing is installed to have one', () => {
			assert.strictEqual(getMcpEntryAriaLabel(entry({ server: { label: 'Redis' } })), 'Redis');
		});

		test('a row held off by the workspace says which layer turned it off', () => {
			const held = entry({ localServer: { enablement: constObservable(ContributionEnablementState.DisabledWorkspace) } });
			assert.strictEqual(getMcpEntryAriaLabel(held), 'Redis, Disabled (Workspace)');
		});
	});

	suite('countSessionOnlyMcpServers', () => {
		const local = (id: string, name: string) => ({ id, name, label: name }) as unknown as Parameters<typeof countSessionOnlyMcpServers>[1][number];

		test('a session server the user also installed is not counted twice', () => {
			const session = createAgentHostServer({ id: 's1', name: 'playwright' });
			assert.strictEqual(countSessionOnlyMcpServers([session], [local('playwright', 'playwright')], []), 0);
		});

		test('a server only the session knows about is counted', () => {
			const session = createAgentHostServer({ id: 's1', name: 'node_repl' });
			assert.strictEqual(countSessionOnlyMcpServers([session], [local('playwright', 'playwright')], []), 1);
		});

		test('the count does not depend on what a search would have hidden', () => {
			// The bug this guards: claiming against a query-filtered list left the session twin
			// unclaimed, so the badge grew as the query narrowed.
			const session = createAgentHostServer({ id: 's1', name: 'playwright' });
			const installed = [local('playwright', 'playwright'), local('redis', 'redis')];
			assert.strictEqual(countSessionOnlyMcpServers([session], installed, []), 0);
			assert.strictEqual(countSessionOnlyMcpServers([session], [], []), 1);
		});
	});

	suite('getEnablementTarget', () => {
		function createLocalEntry(overrides: { enabled?: boolean; activeSessionEnabled?: boolean } = {}) {
			const sessionCalls: boolean[] = [];
			const entry = {
				type: 'server-item',
				localServer: { definition: { id: 'mcp-redis' } },
				activeSessionServer: overrides.activeSessionEnabled === undefined
					? undefined
					: createAgentHostServer({
						enabled: overrides.activeSessionEnabled,
						setEnabled: (enabled: boolean) => { sessionCalls.push(enabled); },
					}),
			} as unknown as Parameters<typeof getEnablementTarget>[0];
			return { entry, sessionCalls };
		}

		test('a gallery row has no switch, because there is nothing to turn on yet', () => {
			const entry = { type: 'server-item' } as unknown as Parameters<typeof getEnablementTarget>[0];
			assert.strictEqual(getEnablementTarget(entry, createMcpService(ContributionEnablementState.EnabledProfile).service, undefined), undefined);
		});

		test('a workspace-scoped choice is answered in full, not perpetuated', () => {
			// The switch used to rewrite whichever layer held the choice, so two identical
			// switches could mean "off here" and "off everywhere". It now always means the
			// whole answer; writing the profile state also clears the workspace entry, so the
			// narrower choice cannot survive and mask what the user just asked for.
			const { entry } = createLocalEntry();
			const { service, calls } = createMcpService(ContributionEnablementState.DisabledWorkspace);
			const target = getEnablementTarget(entry, service, ContributionEnablementState.DisabledWorkspace);
			target?.setEnabled(true);

			assert.deepStrictEqual({ scope: target?.scope, isEnabled: target?.isEnabled(), calls }, {
				scope: McpEnablementScope.Global,
				isEnabled: false,
				calls: [['mcp-redis', ContributionEnablementState.EnabledProfile]],
			});
		});

		test('turning on a row held off by both layers aligns both, so it cannot stay visibly off', () => {
			const { entry, sessionCalls } = createLocalEntry({ activeSessionEnabled: false });
			const { service, calls } = createMcpService(ContributionEnablementState.DisabledProfile);
			const target = getEnablementTarget(entry, service, ContributionEnablementState.DisabledProfile);
			target?.setEnabled(true);

			assert.deepStrictEqual({ scope: target?.scope, calls, sessionCalls }, {
				scope: McpEnablementScope.Global,
				calls: [['mcp-redis', ContributionEnablementState.EnabledProfile]],
				sessionCalls: [true],
			});
		});

		test('a session-off row reads as off and turning it on settles every layer', () => {
			const { entry, sessionCalls } = createLocalEntry({ activeSessionEnabled: false });
			const { service, calls } = createMcpService(ContributionEnablementState.EnabledProfile);
			const target = getEnablementTarget(entry, service, ContributionEnablementState.EnabledProfile);
			const wasEnabled = target?.isEnabled();
			target?.setEnabled(true);

			assert.deepStrictEqual({ scope: target?.scope, wasEnabled, calls, sessionCalls }, {
				scope: McpEnablementScope.Global,
				wasEnabled: false,
				calls: [['mcp-redis', ContributionEnablementState.EnabledProfile]],
				sessionCalls: [true],
			});
		});

		test('an agent-host row settles both of its layers, like every other row', () => {
			const sessionCalls: boolean[] = [];
			const durableCalls: boolean[] = [];
			const entry = {
				type: 'session-server-item',
				server: createAgentHostServer({ enabled: true, setEnabled: (enabled: boolean) => { sessionCalls.push(enabled); } }),
				setDurableEnabled: (enabled: boolean) => { durableCalls.push(enabled); },
			} as unknown as Parameters<typeof getEnablementTarget>[0];
			const target = getEnablementTarget(entry, createMcpService(ContributionEnablementState.EnabledProfile).service, undefined);
			target?.setEnabled(false);

			assert.deepStrictEqual({ scope: target?.scope, sessionCalls, durableCalls }, {
				scope: McpEnablementScope.Global,
				sessionCalls: [false],
				durableCalls: [false],
			});
		});

		test('an agent-host row disabled outright reads as off, and the switch can undo it', () => {
			// Without the durable layer the switch wrote only the session, so a row the context
			// menu had disabled could not be turned back on from the row it sat in.
			const sessionCalls: boolean[] = [];
			const durableCalls: boolean[] = [];
			const entry = {
				type: 'session-server-item',
				server: createAgentHostServer({ enabled: true, setEnabled: (enabled: boolean) => { sessionCalls.push(enabled); } }),
				enablement: ContributionEnablementState.DisabledProfile,
				setDurableEnabled: (enabled: boolean) => { durableCalls.push(enabled); },
			} as unknown as Parameters<typeof getEnablementTarget>[0];
			const target = getEnablementTarget(entry, createMcpService(ContributionEnablementState.EnabledProfile).service, undefined);
			const wasEnabled = target?.isEnabled();
			target?.setEnabled(true);

			assert.deepStrictEqual({ wasEnabled, sessionCalls, durableCalls }, {
				wasEnabled: false,
				sessionCalls: [true],
				durableCalls: [true],
			});
		});
	});
});
