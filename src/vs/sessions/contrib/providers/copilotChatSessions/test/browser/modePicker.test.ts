/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { Event } from '../../../../../../base/common/event.js';
import { hash } from '../../../../../../base/common/hash.js';
import { IDisposable } from '../../../../../../base/common/lifecycle.js';
import { observableValue } from '../../../../../../base/common/observable.js';
import { URI } from '../../../../../../base/common/uri.js';
import { mock } from '../../../../../../base/test/common/mock.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../../base/test/common/utils.js';
import { IActionListDelegate, IActionListItem } from '../../../../../../platform/actionWidget/browser/actionList.js';
import { IActionWidgetService } from '../../../../../../platform/actionWidget/browser/actionWidget.js';
import { ICommandService } from '../../../../../../platform/commands/common/commands.js';
import { NullTelemetryServiceShape } from '../../../../../../platform/telemetry/common/telemetryUtils.js';
import { IChatModeService, IChatModes, ChatMode, CustomChatMode } from '../../../../../../workbench/contrib/chat/common/chatModes.js';
import { IChatService } from '../../../../../../workbench/contrib/chat/common/chatService/chatService.js';
import { IChatSessionsService } from '../../../../../../workbench/contrib/chat/common/chatSessionsService.js';
import { IChatModel, IChatRequestModel } from '../../../../../../workbench/contrib/chat/common/model/chatModel.js';
import { PromptsStorage } from '../../../../../../workbench/contrib/chat/common/promptSyntax/service/promptsService.js';
import { Target } from '../../../../../../workbench/contrib/chat/common/promptSyntax/promptTypes.js';
import { IChat, ISession } from '../../../../../services/sessions/common/session.js';
import { IActiveSession } from '../../../../../services/sessions/common/sessionsManagement.js';
import { ModePicker, ModePickerModel } from '../../browser/modePicker.js';

class TestTelemetryService extends NullTelemetryServiceShape {
	readonly events: { readonly name: string; readonly data: unknown }[] = [];

	override publicLog2(eventName?: string, data?: unknown): void {
		if (eventName) {
			this.events.push({ name: eventName, data });
		}
	}
}

suite('ModePicker', () => {
	const store = ensureNoDisposablesAreLeakedInTestSuite();

	test('reports chat.modeChange for the scoped active chat', () => {
		const telemetryService = new TestTelemetryService();
		const sessionResource = URI.parse('agent-host-copilotcli:/session-1');
		const chatResource = sessionResource.with({ fragment: 'peer-chat' });
		const customAgent = new CustomChatMode({
			id: 'reviewer',
			uri: URI.parse('file:///workspace/.github/agents/reviewer.agent.md'),
			name: 'Reviewer',
			agentInstructions: { content: '', toolReferences: [] },
			source: { storage: PromptsStorage.local },
			target: Target.Undefined,
			visibility: { userInvocable: true, agentInvocable: true },
			enabled: true,
			tools: ['read'],
		});
		const modes: IChatModes & IDisposable = {
			onDidChange: Event.None,
			builtin: [ChatMode.Agent],
			custom: [customAgent],
			findModeById: id => id === customAgent.id ? customAgent : ChatMode.Agent.id === id ? ChatMode.Agent : undefined,
			findModeByName: name => name === customAgent.name.get() ? customAgent : undefined,
			waitForPendingUpdates: async () => { },
			dispose: () => { },
		};
		const model = store.add(new ModePickerModel(
			new class extends mock<IChatSessionsService>() {
				override getCustomAgentTargetForSessionType(): Target {
					return Target.Undefined;
				}
			}(),
			new class extends mock<IChatModeService>() {
				override createModes(): IChatModes & IDisposable {
					return modes;
				}
			}(),
		));
		model.setSession(new class extends mock<ISession>() {
			override readonly resource = sessionResource;
		}(), customAgent.id);
		const activeChat = new class extends mock<IChat>() {
			override readonly resource = chatResource;
			override readonly mode = observableValue<{ readonly id: string; readonly kind: string } | undefined>('mode', { id: ChatMode.Agent.id, kind: ChatMode.Agent.kind });
		}();
		const scopedSession = observableValue<IActiveSession | undefined>('session', new class extends mock<IActiveSession>() {
			override readonly activeChat = observableValue<IChat>('activeChat', activeChat);
		}());

		let selectCustomAgent: (() => void) | undefined;
		const requestedChatResources: string[] = [];
		const picker = store.add(new ModePicker(
			model,
			scopedSession,
			new class extends mock<IActionWidgetService>() {
				override readonly isVisible = false;
				override show<T>(_user: string, _supportsPreview: boolean, items: readonly IActionListItem<T>[], delegate: IActionListDelegate<T>): void {
					const item = items.find(item => {
						if (!item.item) {
							return false;
						}
						const value = item.item as { readonly kind?: string; readonly mode?: { readonly id: string } };
						return value.kind === 'mode' && value.mode?.id === customAgent.id;
					});
					assert.ok(item?.item);
					const modeItem = item.item;
					selectCustomAgent = () => delegate.onSelect(modeItem);
				}
				override hide(): void { }
			}(),
			new class extends mock<ICommandService>() { }(),
			telemetryService,
			new class extends mock<IChatService>() {
				override getSession(resource: URI): IChatModel {
					requestedChatResources.push(resource.toString());
					return new class extends mock<IChatModel>() {
						override getRequests(): IChatRequestModel[] {
							return [
								new class extends mock<IChatRequestModel>() { }(),
								new class extends mock<IChatRequestModel>() { }(),
								new class extends mock<IChatRequestModel>() { }(),
							];
						}
					}();
				}
			}(),
		));
		const container = document.createElement('div');
		picker.render(container);
		container.querySelector<HTMLElement>('a.action-label')?.click();
		assert.ok(selectCustomAgent);
		selectCustomAgent();

		assert.deepStrictEqual({
			events: telemetryService.events.filter(event => event.name === 'chat.modeChange'),
			requestedChatResources,
		}, {
			events: [{
				name: 'chat.modeChange',
				data: {
					fromMode: 'agent',
					mode: String(hash(customAgent.name.get())),
					requestCount: 3,
					storage: 'local',
					extensionId: undefined,
					toolsCount: 1,
					handoffsCount: 0,
					isClaudeAgent: false,
				},
			}],
			requestedChatResources: [chatResource.toString()],
		});
	});
});
