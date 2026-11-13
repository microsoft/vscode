/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import sinon from 'sinon';
import { DeferredPromise } from '../../../../../../base/common/async.js';
import { waitForState } from '../../../../../../base/common/observable.js';
import { URI } from '../../../../../../base/common/uri.js';
import { mock, upcastPartial } from '../../../../../../base/test/common/mock.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../../base/test/common/utils.js';
import { IPermissionsValue } from '../../../../../../platform/agentHost/common/agentHostSchema.js';
import { CommandsRegistry, ICommandService } from '../../../../../../platform/commands/common/commands.js';
import { TestInstantiationService } from '../../../../../../platform/instantiation/test/common/instantiationServiceMock.js';
import { INotificationService } from '../../../../../../platform/notification/common/notification.js';
import { CLOUD_SANDBOX_TASK_SCHEME } from '../../../../../../platform/agentHost/common/agentHostSessionType.js';
import { MANAGE_AGENT_HOST_TOOL_APPROVALS_COMMAND_ID } from '../../../browser/actions/chatActions.js';
import { IAgentHostCustomizationService, NullAgentHostCustomizationService } from '../../../browser/agentSessions/agentHost/agentHostCustomizationService.js';
import { manageAgentHostToolApprovals } from '../../../browser/agentSessions/agentHost/agentHostToolApprovals.js';
import { IChatWidget, IChatWidgetService } from '../../../browser/chat.js';
import { IChatViewModel } from '../../../common/model/chatViewModel.js';
import { InternalFetchWebPageToolId } from '../../../common/tools/builtinTools/tools.js';
import { ILanguageModelToolsConfirmationService, IToolPreApprovalStore } from '../../../common/tools/languageModelToolsConfirmationService.js';
import { ILanguageModelToolsService, IToolData, ToolDataSource } from '../../../common/tools/languageModelToolsService.js';
import { TerminalToolId } from '../../../common/tools/terminalToolIds.js';

type IAgentHostMcpServer = ReturnType<IAgentHostCustomizationService['getMcpServers']>[number];

suite('AgentHostToolApprovals', () => {
	const store = ensureNoDisposablesAreLeakedInTestSuite();
	teardown(() => sinon.restore());

	test('discovers tools and updates exact host grants while preserving other rules', async () => {
		const sessionResource = URI.parse('remote-peer-claude:/opaque-session');
		const runningTools = new DeferredPromise<Awaited<ReturnType<NonNullable<IAgentHostMcpServer['listTools']>>>>();
		const stoppedTools = new DeferredPromise<Awaited<ReturnType<NonNullable<IAgentHostMcpServer['listTools']>>>>();
		const initialPermissions: IPermissionsValue = {
			allow: ['Shell(git *)', 'Mcp(stopped/old)', 'Mcp(stopped/old)', 'Mcp(failed)'],
			deny: ['Mcp(running/denied)'],
			ask: ['Read'],
		};
		let hostPermissions = initialPermissions;
		const writes: { resource: string; permissions: IPermissionsValue }[] = [];
		const customizationService = new class extends NullAgentHostCustomizationService {
			override getHostPermissions(): IPermissionsValue { return hostPermissions; }
			override getMcpServers(): readonly IAgentHostMcpServer[] {
				return [
					upcastPartial<IAgentHostMcpServer>({ name: 'running', enabled: true, listTools: () => runningTools.p }),
					upcastPartial<IAgentHostMcpServer>({ name: 'stopped', enabled: false, listTools: () => stoppedTools.p }),
					upcastPartial<IAgentHostMcpServer>({ name: 'failed', enabled: false, listTools: async () => { throw new Error('Unavailable'); } }),
					upcastPartial<IAgentHostMcpServer>({ name: 'disabled', enabled: false }),
				];
			}
			override setHostPermissions(resource: URI, permissions: IPermissionsValue): void {
				hostPermissions = permissions;
				writes.push({ resource: resource.toString(), permissions });
			}
		};
		const shown: { tools: readonly IToolData[]; store?: IToolPreApprovalStore } = { tools: [] };
		const confirmationService = new class extends mock<ILanguageModelToolsConfirmationService>() {
			override manageConfirmationPreferences(tools: readonly IToolData[], options?: Parameters<ILanguageModelToolsConfirmationService['manageConfirmationPreferences']>[1]): void {
				shown.tools = tools;
				shown.store = options?.preApprovalStore;
			}
		};
		const fetchTool: IToolData = { id: InternalFetchWebPageToolId, source: ToolDataSource.Internal, displayName: 'Fetch', modelDescription: '' };
		const toolsService = new class extends mock<ILanguageModelToolsService>() {
			override getTool(id: string): IToolData | undefined { return id === fetchTool.id ? fetchTool : undefined; }
		};
		const handled = manageAgentHostToolApprovals(sessionResource, customizationService, confirmationService, toolsService, true);
		const preApprovalStore = shown.store!;
		const initial = {
			tools: shown.tools.map(tool => [tool.id, tool.displayName]),
			discoveredTools: preApprovalStore.discoveredTools!.get(),
			isDiscovering: preApprovalStore.isDiscovering!.get(),
		};
		await runningTools.complete([
			{ name: 'raw', title: 'Display Name', annotations: { title: 'Ignored Title' } },
			{ name: 'annotated', annotations: { title: 'Annotated Title' } },
		]);
		await waitForState(preApprovalStore.discoveredTools!, tools => tools.length > 0);
		const partial = {
			tools: preApprovalStore.discoveredTools!.get().map(tool => [tool.id, tool.displayName]),
			isDiscovering: preApprovalStore.isDiscovering!.get(),
		};
		await stoppedTools.complete([{ name: 'old', title: 'Old Tool' }, { name: 'old', title: 'Old Tool' }]);
		await waitForState(preApprovalStore.isDiscovering!, discovering => !discovering);
		const oldTool = shown.tools.find(tool => tool.id === 'agentHostMcp:stopped/old')!;
		const states = [preApprovalStore.isToolApproved(oldTool), preApprovalStore.isServerApproved('running')];
		preApprovalStore.setServerApproved('running', true);
		states.push(preApprovalStore.isServerApproved('running'));
		preApprovalStore.setToolApproved(oldTool, false);
		states.push(preApprovalStore.isToolApproved(oldTool));
		preApprovalStore.setToolApproved(oldTool, true);
		preApprovalStore.setToolApproved(oldTool, true);
		preApprovalStore.setServerApproved('running', false);
		preApprovalStore.setServerApproved('', true);
		preApprovalStore.setToolApproved(fetchTool, true);
		const discoveredTool = preApprovalStore.discoveredTools!.get().find(tool => tool.id === 'agentHostMcp:running/raw')!;
		preApprovalStore.setToolApproved(discoveredTool, true);
		states.push(preApprovalStore.isToolApproved(discoveredTool));
		preApprovalStore.setToolApproved(discoveredTool, false);
		states.push(preApprovalStore.isToolApproved(discoveredTool));

		assert.deepStrictEqual({
			handled,
			initial,
			partial,
			discoveredTools: preApprovalStore.discoveredTools!.get().map(tool => [tool.id, tool.displayName]),
			isDiscovering: preApprovalStore.isDiscovering!.get(),
			servers: preApprovalStore.servers,
			states,
			allowWrites: writes.map(write => write.permissions.allow),
			preserved: writes.every(write => write.permissions.deny === initialPermissions.deny && write.permissions.ask === initialPermissions.ask && write.resource === sessionResource.toString()),
			originalAllow: initialPermissions.allow,
		}, {
			handled: true,
			initial: {
				tools: [['agentHostMcp:stopped/old', 'old']],
				discoveredTools: [],
				isDiscovering: true,
			},
			partial: {
				tools: [['agentHostMcp:running/raw', 'Display Name'], ['agentHostMcp:running/annotated', 'Annotated Title']],
				isDiscovering: true,
			},
			discoveredTools: [['agentHostMcp:running/raw', 'Display Name'], ['agentHostMcp:running/annotated', 'Annotated Title'], ['agentHostMcp:stopped/old', 'Old Tool']],
			isDiscovering: false,
			servers: [{ id: 'running', label: 'running' }, { id: 'stopped', label: 'stopped' }, { id: 'failed', label: 'failed' }],
			states: [true, false, true, false, true, false],
			allowWrites: [
				['Shell(git *)', 'Mcp(stopped/old)', 'Mcp(failed)', 'Mcp(running)'],
				['Shell(git *)', 'Mcp(failed)', 'Mcp(running)'],
				['Shell(git *)', 'Mcp(failed)', 'Mcp(running)', 'Mcp(stopped/old)'],
				['Shell(git *)', 'Mcp(failed)', 'Mcp(running)', 'Mcp(stopped/old)'],
				['Shell(git *)', 'Mcp(failed)', 'Mcp(stopped/old)'],
				['Shell(git *)', 'Mcp(failed)', 'Mcp(stopped/old)', 'Mcp(running/raw)'],
				['Shell(git *)', 'Mcp(failed)', 'Mcp(stopped/old)'],
			],
			preserved: true,
			originalAllow: ['Shell(git *)', 'Mcp(stopped/old)', 'Mcp(stopped/old)', 'Mcp(failed)'],
		});
	});

	test('merges picker overrides with external host changes before writes are acknowledged', () => {
		const sessionResource = URI.parse('remote-peer-claude:/opaque-session');
		let hostPermissions: IPermissionsValue = { allow: ['Mcp(server/tool)'], deny: [] };
		const writes: IPermissionsValue[] = [];
		const customizationService = new class extends NullAgentHostCustomizationService {
			override getHostPermissions(): IPermissionsValue { return hostPermissions; }
			override getMcpServers(): readonly IAgentHostMcpServer[] {
				return [upcastPartial<IAgentHostMcpServer>({ name: 'server', enabled: true })];
			}
			override setHostPermissions(_resource: URI, permissions: IPermissionsValue): void {
				writes.push(permissions);
			}
		};
		const shown: { tools: readonly IToolData[]; store?: IToolPreApprovalStore } = { tools: [] };
		const confirmationService = new class extends mock<ILanguageModelToolsConfirmationService>() {
			override manageConfirmationPreferences(tools: readonly IToolData[], options?: Parameters<ILanguageModelToolsConfirmationService['manageConfirmationPreferences']>[1]): void {
				shown.tools = tools;
				shown.store = options?.preApprovalStore;
			}
		};
		const toolsService = new class extends mock<ILanguageModelToolsService>() { };
		manageAgentHostToolApprovals(sessionResource, customizationService, confirmationService, toolsService, true);
		const preApprovalStore = shown.store!;
		const tool = shown.tools[0];
		preApprovalStore.setServerApproved('server', true);

		hostPermissions = { allow: ['WebFetch(example.com)', 'Mcp(other)'], deny: ['Write'], ask: ['Read'] };
		const states = [preApprovalStore.isServerApproved('server'), preApprovalStore.isServerApproved('other'), preApprovalStore.isToolApproved(tool)];
		preApprovalStore.setToolApproved(tool, true);
		states.push(preApprovalStore.isToolApproved(tool));
		hostPermissions = { ...hostPermissions, allow: [...hostPermissions.allow, 'Mcp(server)'] };
		preApprovalStore.setServerApproved('server', false);
		states.push(preApprovalStore.isServerApproved('server'));

		assert.deepStrictEqual({ states, writes }, {
			states: [true, true, false, true, false],
			writes: [
				{ allow: ['Mcp(server/tool)', 'Mcp(server)'], deny: [] },
				{ allow: ['WebFetch(example.com)', 'Mcp(other)', 'Mcp(server)', 'Mcp(server/tool)'], deny: ['Write'], ask: ['Read'] },
				{ allow: ['WebFetch(example.com)', 'Mcp(other)', 'Mcp(server/tool)'], deny: ['Write'], ask: ['Read'] },
			],
		});
	});

	for (const acknowledgement of ['read', 'write']) {
		test(`drops acknowledged overrides on ${acknowledgement} before external revocations`, () => {
			const sessionResource = URI.parse('remote-peer-claude:/opaque-session');
			let hostPermissions: IPermissionsValue = { allow: [], deny: [] };
			const writes: string[][] = [];
			const customizationService = new class extends NullAgentHostCustomizationService {
				override getHostPermissions(): IPermissionsValue { return hostPermissions; }
				override getMcpServers(): readonly IAgentHostMcpServer[] {
					return ['a', 'b'].map(name => upcastPartial<IAgentHostMcpServer>({ name, enabled: true }));
				}
				override setHostPermissions(_resource: URI, permissions: IPermissionsValue): void {
					writes.push([...permissions.allow]);
				}
			};
			let preApprovalStore: IToolPreApprovalStore | undefined;
			const confirmationService = new class extends mock<ILanguageModelToolsConfirmationService>() {
				override manageConfirmationPreferences(_tools: readonly IToolData[], options?: Parameters<ILanguageModelToolsConfirmationService['manageConfirmationPreferences']>[1]): void {
					preApprovalStore = options?.preApprovalStore;
				}
			};
			const toolsService = new class extends mock<ILanguageModelToolsService>() { };
			manageAgentHostToolApprovals(sessionResource, customizationService, confirmationService, toolsService, false);
			preApprovalStore!.setServerApproved('a', true);
			hostPermissions = { allow: ['Mcp(a)'], deny: [] };
			if (acknowledgement === 'read') {
				preApprovalStore!.isServerApproved('a');
			} else {
				preApprovalStore!.setServerApproved('b', true);
			}
			hostPermissions = { allow: [], deny: [] };
			preApprovalStore!.setServerApproved('b', true);

			assert.deepStrictEqual({ writes, approved: preApprovalStore!.isServerApproved('a') }, {
				writes: [
					['Mcp(a)'],
					...(acknowledgement === 'write' ? [['Mcp(a)', 'Mcp(b)']] : []),
					['Mcp(b)'],
				],
				approved: false,
			});
		});
	}

	test('includes settings-backed URL and terminal tools only when local settings are mirrored', () => {
		const customizationService = new class extends NullAgentHostCustomizationService {
			override getHostPermissions(): IPermissionsValue { return { allow: [], deny: [] }; }
		};
		const shown: (readonly IToolData[])[] = [];
		const confirmationService = new class extends mock<ILanguageModelToolsConfirmationService>() {
			override manageConfirmationPreferences(tools: readonly IToolData[]): void {
				shown.push(tools);
			}
		};
		const fetchTool: IToolData = { id: InternalFetchWebPageToolId, source: ToolDataSource.Internal, displayName: 'Fetch', modelDescription: '' };
		const terminalTool: IToolData = { id: TerminalToolId.RunInTerminal, source: ToolDataSource.Internal, displayName: 'Terminal', modelDescription: '' };
		const availableTools = new Map([fetchTool, terminalTool].map(tool => [tool.id, tool]));
		const toolsService = new class extends mock<ILanguageModelToolsService>() {
			override getTool(id: string): IToolData | undefined { return availableTools.get(id); }
		};
		for (const mirrorsLocalSettings of [true, false]) {
			for (const resource of ['agent-host-copilotcli:/session', 'agent-host-claude:/session', 'remote-peer-claude:/opaque-session', `${CLOUD_SANDBOX_TASK_SCHEME}:/session`]) {
				manageAgentHostToolApprovals(URI.parse(resource), customizationService, confirmationService, toolsService, mirrorsLocalSettings);
			}
		}
		availableTools.delete(terminalTool.id);
		manageAgentHostToolApprovals(URI.parse('agent-host-copilotcli:/session'), customizationService, confirmationService, toolsService, true);
		availableTools.delete(fetchTool.id);
		manageAgentHostToolApprovals(URI.parse('agent-host-copilotcli:/session'), customizationService, confirmationService, toolsService, true);
		assert.deepStrictEqual(shown, [
			[fetchTool, terminalTool],
			[fetchTool, terminalTool],
			[],
			[],
			[],
			[],
			[],
			[],
			[fetchTool],
			[{ id: InternalFetchWebPageToolId, displayName: 'Fetch Web Page', modelDescription: '', source: ToolDataSource.Internal }],
		]);
	});

	test('returns unhandled for non-host sessions or unavailable host root config', () => {
		const customizationService = new NullAgentHostCustomizationService();
		const confirmationService = new class extends mock<ILanguageModelToolsConfirmationService>() { };
		const toolsService = new class extends mock<ILanguageModelToolsService>() { };
		assert.deepStrictEqual([
			manageAgentHostToolApprovals(URI.parse('vscode-chat-session:/session'), customizationService, confirmationService, toolsService, true),
			manageAgentHostToolApprovals(URI.parse('agent-host-claude:/session'), customizationService, confirmationService, toolsService, true),
		], [false, false]);
	});

	for (const registered of [true, false]) {
		test(`reports unavailable host approvals when the command is ${registered ? 'unhandled' : 'missing'}`, async () => {
			const instantiationService = store.add(new TestInstantiationService());
			let localPickers = 0;
			let commandCalls = 0;
			const notifications: string[] = [];
			const sessionResource = URI.parse('agent-host-claude:/session');
			instantiationService.stub(ILanguageModelToolsConfirmationService, {
				manageConfirmationPreferences: () => { localPickers++; },
			});
			instantiationService.stub(ILanguageModelToolsService, { getAllToolsIncludingDisabled: () => [] });
			instantiationService.stub(IChatWidgetService, {
				lastFocusedWidget: upcastPartial<IChatWidget>({ viewModel: upcastPartial<IChatViewModel>({ sessionResource }) }),
			});
			instantiationService.stub(ICommandService, new class extends mock<ICommandService>() {
				override async executeCommand<T>(): Promise<T> {
					commandCalls++;
					await Promise.resolve();
					return false as T;
				}
			}());
			instantiationService.stub(INotificationService, { info: message => { notifications.push(String(message)); } });
			const command = CommandsRegistry.getCommand('workbench.action.chat.editToolApproval')!;
			if (!registered) {
				sinon.stub(CommandsRegistry, 'getCommand').withArgs(MANAGE_AGENT_HOST_TOOL_APPROVALS_COMMAND_ID).returns(undefined);
			}
			await command.handler(instantiationService);

			assert.deepStrictEqual({ localPickers, commandCalls, notifications }, {
				localPickers: 0,
				commandCalls: registered ? 1 : 0,
				notifications: ['Tool approvals for this agent host are not available yet. Try again once it has connected.'],
			});
		});
	}
});
