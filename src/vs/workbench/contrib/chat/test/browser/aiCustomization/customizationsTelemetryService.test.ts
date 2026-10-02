/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { DeferredPromise, timeout } from '../../../../../../base/common/async.js';
import { Codicon } from '../../../../../../base/common/codicons.js';
import { Emitter, Event } from '../../../../../../base/common/event.js';
import { URI } from '../../../../../../base/common/uri.js';
import { mock } from '../../../../../../base/test/common/mock.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../../base/test/common/utils.js';
import { McpServerStatus } from '../../../../../../platform/agentHost/common/state/protocol/state.js';
import { ILogService } from '../../../../../../platform/log/common/log.js';
import { ITelemetryService } from '../../../../../../platform/telemetry/common/telemetry.js';
import { NullTelemetryServiceShape } from '../../../../../../platform/telemetry/common/telemetryUtils.js';
import { IAgentHostCustomizationService } from '../../../browser/agentSessions/agentHost/agentHostCustomizationService.js';
import { AICustomizationSources } from '../../../common/aiCustomizationWorkspaceService.js';
import { IChatRequestAcceptedEvent, IChatService } from '../../../common/chatService/chatService.js';
import { ICustomizationHarnessService, ICustomizationItem, ICustomizationItemProvider } from '../../../common/customizationHarnessService.js';
import { PromptsType } from '../../../common/promptSyntax/promptTypes.js';
import { CustomizationsTelemetryContribution, CustomizationsTelemetryService, ICustomizationsTelemetryService } from '../../../browser/aiCustomization/customizationsTelemetryService.js';

suite('CustomizationsTelemetryService', () => {
	ensureNoDisposablesAreLeakedInTestSuite();

	test('reports source counts once after customization discovery completes', async () => {
		const discovery = new DeferredPromise<boolean>();
		let providerCalls = 0;
		const itemProvider = new class extends mock<ICustomizationItemProvider>() {
			override readonly onDidChange = Event.None;
			override async provideChatSessionCustomizations(): Promise<ICustomizationItem[]> {
				providerCalls++;
				return [
					item(PromptsType.agent, AICustomizationSources.user),
					item(PromptsType.agent, AICustomizationSources.extension),
					item(PromptsType.instructions, AICustomizationSources.local),
					item(PromptsType.prompt, AICustomizationSources.plugin),
					item(PromptsType.skill, AICustomizationSources.builtin),
					item(PromptsType.hook, AICustomizationSources.user),
					item('plugin', AICustomizationSources.plugin),
				];
			}
		}();
		const harnessService = new class extends mock<ICustomizationHarnessService>() {
			override findHarnessById() {
				return { id: 'agent-host-copilotcli', label: 'Copilot', icon: Codicon.copilot, itemProvider };
			}
		}();
		const customizationService = new class extends mock<IAgentHostCustomizationService>() {
			override readonly onDidChangeCustomAgents = Event.None;
			override readonly onDidChangeCustomizations = Event.None;
			override async whenCustomizationsReady(): Promise<boolean> {
				return discovery.p;
			}
			override getClientWorkingDirectoryUris() {
				return [];
			}
			override getMcpServers() {
				return [
					mcpServer('workspace'),
					mcpServer('plugin'),
					mcpServer('builtin'),
					mcpServer('managed'),
					mcpServer(undefined),
				];
			}
		}();
		const events: { eventName: string; data: unknown }[] = [];
		const telemetryService = new class extends NullTelemetryServiceShape {
			override publicLog2(eventName?: string, data?: unknown): void {
				if (eventName) {
					events.push({ eventName, data });
				}
			}
		}();
		const errors: unknown[][] = [];
		const service = new CustomizationsTelemetryService(
			harnessService,
			customizationService,
			telemetryService as ITelemetryService,
			new class extends mock<ILogService>() {
				override error(...args: unknown[]): void {
					errors.push(args);
				}
			}(),
		);
		const sessionResource = URI.from({ scheme: 'agent-host-copilotcli', path: '/session' });

		service.reportNewSession(sessionResource);
		service.reportNewSession(sessionResource);
		assert.deepStrictEqual({ providerCalls, events }, { providerCalls: 0, events: [] });

		await discovery.complete(true);
		await timeout(0);
		assert.deepStrictEqual({
			providerCalls,
			errors,
			events,
		}, {
			providerCalls: 1,
			errors: [],
			events: [
				event('agent', { userCount: 1, extensionCount: 1 }),
				event('instructions', { workspaceCount: 1 }),
				event('prompt', { pluginCount: 1 }),
				event('skill', { builtinCount: 1 }),
				event('hook', { userCount: 1 }),
				event('mcpServer', { userCount: 1, workspaceCount: 1, pluginCount: 1, builtinCount: 2 }),
				event('plugin', { pluginCount: 1 }),
			],
		});
	});

	test('reports the first accepted request for a new session', () => {
		const requests = new Emitter<IChatRequestAcceptedEvent>();
		const reported: string[] = [];
		const contribution = new CustomizationsTelemetryContribution(new class extends mock<IChatService>() {
			override readonly onDidAcceptRequest = requests.event;
		}(), new class extends mock<ICustomizationsTelemetryService>() {
			override reportNewSession(resource: URI): void {
				reported.push(resource.toString());
			}
		}());

		requests.fire({ chatSessionResource: URI.parse('agent-host-copilotcli:/one'), isNewSession: true });
		requests.fire({ chatSessionResource: URI.parse('agent-host-copilotcli:/one'), isNewSession: false });
		requests.fire({ chatSessionResource: URI.parse('agent-host-claude:/two'), isNewSession: true });
		contribution.dispose();
		requests.dispose();

		assert.deepStrictEqual(reported, [
			'agent-host-copilotcli:/one',
			'agent-host-claude:/two',
		]);
	});
});

function item(type: string, source: ICustomizationItem['source']): ICustomizationItem {
	return {
		uri: URI.parse(`file:///${type}-${source}`),
		type,
		name: `${type}-${source}`,
		source,
		extensionId: undefined,
		pluginUri: undefined,
	};
}

function mcpServer(source: 'user' | 'workspace' | 'plugin' | 'builtin' | 'managed' | undefined) {
	return {
		id: `server-${source}`,
		name: `server-${source}`,
		source,
		enabled: true,
		status: McpServerStatus.Ready,
		state: { kind: McpServerStatus.Ready } as const,
		start: async () => { },
		stop: async () => { },
		setEnabled: () => { },
	};
}

function event(customizationType: string, counts: Partial<Record<'userCount' | 'workspaceCount' | 'extensionCount' | 'pluginCount' | 'builtinCount', number>>) {
	return {
		eventName: 'agents/customizationsDefined',
		data: {
			customizationType,
			userCount: 0,
			workspaceCount: 0,
			extensionCount: 0,
			pluginCount: 0,
			builtinCount: 0,
			...counts,
		},
	};
}
