/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { Emitter, Event } from '../../../../../../base/common/event.js';
import { URI } from '../../../../../../base/common/uri.js';
import { mock } from '../../../../../../base/test/common/mock.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../../base/test/common/utils.js';
import { CustomizationType, McpServerStatus, type ChildCustomization, type Customization } from '../../../../../../platform/agentHost/common/state/protocol/state.js';
import { ILogService } from '../../../../../../platform/log/common/log.js';
import { ITelemetryService } from '../../../../../../platform/telemetry/common/telemetry.js';
import { NullTelemetryServiceShape } from '../../../../../../platform/telemetry/common/telemetryUtils.js';
import { IAgentHostActiveClientService } from '../../../browser/agentSessions/agentHost/agentHostActiveClientService.js';
import { IAgentHostCustomizationService } from '../../../browser/agentSessions/agentHost/agentHostCustomizationService.js';
import { AICustomizationSources } from '../../../common/aiCustomizationWorkspaceService.js';
import { IChatRequestAcceptedEvent, IChatService } from '../../../common/chatService/chatService.js';
import { IChatChangeEvent, IChatModel, IChatRequestModel } from '../../../common/model/chatModel.js';
import { CustomizationsTelemetryContribution, CustomizationsTelemetryService, ICustomizationsTelemetryService } from '../../../browser/aiCustomization/customizationsTelemetryService.js';

suite('CustomizationsTelemetryService', () => {
	ensureNoDisposablesAreLeakedInTestSuite();

	test('reports source counts once from the completed session snapshot', () => {
		const customizationService = new class extends mock<IAgentHostCustomizationService>() {
			override readonly onDidChangeCustomAgents = Event.None;
			override readonly onDidChangeCustomizations = Event.None;
			override getClientWorkingDirectoryUris() {
				return [];
			}
			override getWorkingDirectories() {
				return ['file:///workspace'];
			}
			override getCustomizations(): readonly Customization[] {
				return [
					plugin('file:///plugin', [
						child(CustomizationType.Prompt, 'file:///plugin/commands/prompt.md'),
					]),
					plugin('vscode-synced-customization:/bundle', [
						child(CustomizationType.Agent, 'file:///host/agents/extension.agent.md'),
						child(CustomizationType.Skill, 'file:///host/skills/builtin/SKILL.md'),
					]),
					directory([
						child(CustomizationType.Rule, 'file:///workspace/.github/instructions/workspace.instructions.md'),
						child(CustomizationType.Hook, 'file:///user/hooks/hooks.json'),
					]),
				];
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
		const activeClientService = new class extends mock<IAgentHostActiveClientService>() {
			override getOrigin(resource: URI) {
				if (resource.path.endsWith('/agents/extension.agent.md')) {
					return { uri: URI.file('/extension.agent.md'), source: AICustomizationSources.extension };
				}
				if (resource.path.endsWith('/skills/builtin/SKILL.md')) {
					return { uri: URI.file('/builtin/SKILL.md'), source: AICustomizationSources.builtin };
				}
				return undefined;
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
			customizationService,
			activeClientService,
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
		assert.deepStrictEqual({
			errors,
			events,
		}, {
			errors: [],
			events: [
				event('agent', { extensionCount: 1 }),
				event('instructions', { workspaceCount: 1 }),
				event('prompt', { pluginCount: 1 }),
				event('skill', { builtinCount: 1 }),
				event('hook', { userCount: 1 }),
				event('mcpServer', { userCount: 1, workspaceCount: 1, pluginCount: 1, builtinCount: 2 }),
				event('plugin', { pluginCount: 1 }),
			],
		});
	});

	test('reports after the first accepted request for a new session completes', () => {
		const requests = new Emitter<IChatRequestAcceptedEvent>();
		const reported: string[] = [];
		const firstRequest = new class extends mock<IChatRequestModel>() { override readonly id = 'first'; }();
		const secondRequest = new class extends mock<IChatRequestModel>() { override readonly id = 'second'; }();
		const firstModelChanges = new Emitter<IChatChangeEvent>();
		const secondModelChanges = new Emitter<IChatChangeEvent>();
		const models = new Map<string, IChatModel>([
			['agent-host-copilotcli:/one', new class extends mock<IChatModel>() {
				override readonly onDidChange = firstModelChanges.event;
				override readonly lastRequest = firstRequest;
			}()],
			['agent-host-claude:/two', new class extends mock<IChatModel>() {
				override readonly onDidChange = secondModelChanges.event;
				override readonly lastRequest = secondRequest;
			}()],
		]);
		const contribution = new CustomizationsTelemetryContribution(new class extends mock<IChatService>() {
			override readonly onDidAcceptRequest = requests.event;
			override getSession(resource: URI): IChatModel | undefined {
				return models.get(resource.toString());
			}
		}(), new class extends mock<ICustomizationsTelemetryService>() {
			override reportNewSession(resource: URI): void {
				reported.push(resource.toString());
			}
		}());

		requests.fire({ chatSessionResource: URI.parse('agent-host-copilotcli:/one'), isNewSession: true });
		requests.fire({ chatSessionResource: URI.parse('agent-host-copilotcli:/one'), isNewSession: false });
		requests.fire({ chatSessionResource: URI.parse('agent-host-claude:/two'), isNewSession: true });
		assert.deepStrictEqual(reported, []);

		firstModelChanges.fire({ kind: 'completedRequest', request: firstRequest });
		secondModelChanges.fire({ kind: 'completedRequest', request: secondRequest });
		contribution.dispose();
		requests.dispose();
		firstModelChanges.dispose();
		secondModelChanges.dispose();

		assert.deepStrictEqual(reported, [
			'agent-host-copilotcli:/one',
			'agent-host-claude:/two',
		]);
	});
});

function child(type: ChildCustomization['type'], uri: string): ChildCustomization {
	return {
		id: uri,
		uri,
		type,
		name: uri,
	} as ChildCustomization;
}

function plugin(uri: string, children: ChildCustomization[]): Customization {
	return {
		id: uri,
		uri,
		type: CustomizationType.Plugin,
		name: uri,
		children,
	};
}

function directory(children: ChildCustomization[]): Customization {
	return {
		id: 'directory',
		uri: 'file:///user',
		type: CustomizationType.Directory,
		name: 'directory',
		enabled: true,
		contents: CustomizationType.Rule,
		writable: true,
		children,
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
