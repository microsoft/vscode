/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { Event } from '../../../../../../base/common/event.js';
import { hash } from '../../../../../../base/common/hash.js';
import { IDisposable, toDisposable } from '../../../../../../base/common/lifecycle.js';
import { observableValue } from '../../../../../../base/common/observable.js';
import { URI } from '../../../../../../base/common/uri.js';
import { mock, upcastPartial } from '../../../../../../base/test/common/mock.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../../base/test/common/utils.js';
import { IActionListDelegate, IActionListItem } from '../../../../../../platform/actionWidget/browser/actionList.js';
import { IActionWidgetService } from '../../../../../../platform/actionWidget/browser/actionWidget.js';
import { ICommandService } from '../../../../../../platform/commands/common/commands.js';
import { TestInstantiationService } from '../../../../../../platform/instantiation/test/common/instantiationServiceMock.js';
import { NullTelemetryServiceShape } from '../../../../../../platform/telemetry/common/telemetryUtils.js';
import { IChatModeService, IChatModes, ChatMode, CustomChatMode } from '../../../../../../workbench/contrib/chat/common/chatModes.js';
import { IChatService } from '../../../../../../workbench/contrib/chat/common/chatService/chatService.js';
import { IChatSessionsService } from '../../../../../../workbench/contrib/chat/common/chatSessionsService.js';
import { IChatModel, IChatRequestModel } from '../../../../../../workbench/contrib/chat/common/model/chatModel.js';
import { PromptsStorage } from '../../../../../../workbench/contrib/chat/common/promptSyntax/service/promptsService.js';
import { Target } from '../../../../../../workbench/contrib/chat/common/promptSyntax/promptTypes.js';
import { IChat, ISession } from '../../../../../services/sessions/common/session.js';
import { IActiveSession } from '../../../../../services/sessions/common/sessionsManagement.js';
import { ModePicker, ModePickerModel, ScopedModePickerModelCache } from '../../browser/modePicker.js';

class TestTelemetryService extends NullTelemetryServiceShape {
	readonly events: { readonly name: string; readonly data: unknown }[] = [];

	override publicLog2(eventName?: string, data?: unknown): void {
		if (eventName) {
			this.events.push({ name: eventName, data });
		}
	}
}

suite('ScopedModePickerModelCache', () => {
	const store = ensureNoDisposablesAreLeakedInTestSuite();

	function createSession(name: string) {
		const resource = URI.parse(`copilotcli:/${name}`);
		const customAgent = new CustomChatMode({
			id: name,
			uri: URI.file(`/workspace/${name}.agent.md`),
			name,
			agentInstructions: { content: '', toolReferences: [] },
			source: { storage: PromptsStorage.local },
			target: Target.Undefined,
			visibility: { userInvocable: true, agentInvocable: true },
			enabled: true,
		});
		const mode = observableValue<{ readonly id: string; readonly kind: string } | undefined>('mode', { id: customAgent.id, kind: ChatMode.Agent.kind });
		const session = upcastPartial<IActiveSession>({ resource, mode, providerId: 'default-copilot' });
		const scope = observableValue<IActiveSession | undefined>('scope', session);
		return { session, scope, mode, customAgent };
	}

	function createInstantiationService(sessions: readonly ReturnType<typeof createSession>[], disposed: string[]) {
		const instantiationService = store.add(new TestInstantiationService());
		instantiationService.stub(IChatSessionsService, {
			getCustomAgentTargetForSessionType: () => Target.Undefined,
		});
		instantiationService.stub(IChatModeService, {
			createModes: resource => {
				const entry = sessions.find(entry => entry.session.resource.toString() === resource?.toString());
				assert.ok(entry);
				const modes: IChatModes & IDisposable = {
					onDidChange: Event.None,
					builtin: [ChatMode.Agent],
					custom: [entry.customAgent],
					findModeById: id => id === entry.customAgent.id ? entry.customAgent : id === ChatMode.Agent.id ? ChatMode.Agent : undefined,
					findModeByName: name => name === entry.customAgent.name.get() ? entry.customAgent : undefined,
					waitForPendingUpdates: async () => { },
					dispose: () => disposed.push(entry.customAgent.name.get()),
				};
				return modes;
			},
		});
		return instantiationService;
	}

	test('keeps selected agents and discovery scoped to independent session surfaces', () => {
		const first = createSession('first');
		const second = createSession('second');
		const disposed: string[] = [];
		const instantiationService = createInstantiationService([first, second], disposed);
		const cache = store.add(new ScopedModePickerModelCache(() => true));
		const firstReference = store.add(cache.acquire(first.scope, instantiationService));
		const secondReference = store.add(cache.acquire(second.scope, instantiationService));
		const initial = [firstReference, secondReference].map(reference => ({
			selected: reference.model.selectedMode.id,
			available: reference.model.getAvailableModes().map(mode => mode.id),
		}));

		first.mode.set({ id: ChatMode.Agent.id, kind: ChatMode.Agent.kind }, undefined);
		const afterChangingFirst = [firstReference.model.selectedMode.id, secondReference.model.selectedMode.id];
		first.scope.set(undefined, undefined);

		assert.deepStrictEqual({
			initial,
			afterChangingFirst,
			firstModesAfterClosing: firstReference.model.getAvailableModes().map(mode => mode.id),
			secondSelection: secondReference.model.selectedMode.id,
			disposed,
		}, {
			initial: [
				{ selected: first.customAgent.id, available: ['agent', first.customAgent.id] },
				{ selected: second.customAgent.id, available: ['agent', second.customAgent.id] },
			],
			afterChangingFirst: ['agent', second.customAgent.id],
			firstModesAfterClosing: ['agent'],
			secondSelection: second.customAgent.id,
			disposed: ['first'],
		});
	});

	test('retains models across synchronous rebuilds and disposes them after the last release', async () => {
		const session = createSession('reviewer');
		const disposed: string[] = [];
		const instantiationService = createInstantiationService([session], disposed);
		const cache = store.add(new ScopedModePickerModelCache(() => true));
		const first = store.add(cache.acquire(session.scope, instantiationService));
		first.dispose();
		const replacement = store.add(cache.acquire(session.scope, instantiationService));
		await Promise.resolve();
		const afterRebuild = { reused: first.model === replacement.model, disposed: [...disposed] };

		replacement.dispose();
		replacement.dispose();
		await Promise.resolve();

		assert.deepStrictEqual({ afterRebuild, disposed }, {
			afterRebuild: { reused: true, disposed: [] },
			disposed: ['reviewer'],
		});
	});

	test('follows scoped retargets and clears discovery for unsupported sessions', () => {
		const first = createSession('first');
		const second = createSession('second');
		const disposed: string[] = [];
		const instantiationService = createInstantiationService([first, second], disposed);
		const cache = store.add(new ScopedModePickerModelCache(session => session.providerId === 'default-copilot'));
		const reference = store.add(cache.acquire(first.scope, instantiationService));

		first.scope.set(second.session, undefined);
		const retargeted = {
			selected: reference.model.selectedMode.id,
			available: reference.model.getAvailableModes().map(mode => mode.id),
		};
		first.scope.set(upcastPartial<IActiveSession>({ providerId: 'another-provider', mode: second.mode }), undefined);

		assert.deepStrictEqual({
			retargeted,
			selectedAfterSwitchingProvider: reference.model.selectedMode.id,
			availableAfterSwitchingProvider: reference.model.getAvailableModes().map(mode => mode.id),
			disposed,
		}, {
			retargeted: { selected: second.customAgent.id, available: ['agent', second.customAgent.id] },
			selectedAfterSwitchingProvider: 'agent',
			availableAfterSwitchingProvider: ['agent'],
			disposed: ['first', 'second'],
		});
	});
});

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
		let hidePicker: (() => void) | undefined;
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
					hidePicker = () => delegate.onHide();
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
		document.body.appendChild(container);
		store.add(toDisposable(() => container.remove()));
		picker.render(container);
		const trigger = container.querySelector<HTMLElement>('a.action-label');
		let focusCalls = 0;
		if (trigger) {
			trigger.focus = () => focusCalls++;
		}
		trigger?.click();
		assert.ok(hidePicker);
		hidePicker();
		const pointerFocusCalls = focusCalls;

		trigger?.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
		assert.ok(hidePicker);
		hidePicker();
		const keyboardFocusCalls = focusCalls;

		trigger?.click();
		assert.ok(selectCustomAgent);
		selectCustomAgent();

		assert.deepStrictEqual({
			events: telemetryService.events.filter(event => event.name === 'chat.modeChange'),
			requestedChatResources,
			pointerFocusCalls,
			keyboardFocusCalls,
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
			pointerFocusCalls: 1,
			keyboardFocusCalls: 2,
		});
	});
});
