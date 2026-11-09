/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { Event } from '../../../../../../../base/common/event.js';
import { hash } from '../../../../../../../base/common/hash.js';
import { IDisposable, toDisposable } from '../../../../../../../base/common/lifecycle.js';
import { constObservable, derived, observableValue } from '../../../../../../../base/common/observable.js';
import { hasKey } from '../../../../../../../base/common/types.js';
import { Schemas } from '../../../../../../../base/common/network.js';
import { URI } from '../../../../../../../base/common/uri.js';
import { mock, upcastPartial } from '../../../../../../../base/test/common/mock.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../../../base/test/common/utils.js';
import { IActionListDelegate, IActionListItem } from '../../../../../../../platform/actionWidget/browser/actionList.js';
import { IActionWidgetService } from '../../../../../../../platform/actionWidget/browser/actionWidget.js';
import { ICommandService } from '../../../../../../../platform/commands/common/commands.js';
import { ExtensionIdentifier } from '../../../../../../../platform/extensions/common/extensions.js';
import { IFileService } from '../../../../../../../platform/files/common/files.js';
import { AGENT_HOST_SCHEME, toAgentHostUri } from '../../../../../../../platform/agentHost/common/agentHostUri.js';
import { TestInstantiationService } from '../../../../../../../platform/instantiation/test/common/instantiationServiceMock.js';
import { TestTelemetryService } from '../../../../../../../platform/telemetry/test/common/testTelemetryService.js';
import { IChatModeService, IChatModes, ChatMode, CustomChatMode } from '../../../../../chat/common/chatModes.js';
import { IChatService } from '../../../../../chat/common/chatService/chatService.js';
import { IChatSessionsService } from '../../../../../chat/common/chatSessionsService.js';
import { MockChatSessionsService } from '../../../../../chat/test/common/mockChatSessionsService.js';
import { IChatModel, IChatRequestModel } from '../../../../../chat/common/model/chatModel.js';
import { IAgentSource, PromptsStorage } from '../../../../../chat/common/promptSyntax/service/promptsService.js';
import { Target } from '../../../../../chat/common/promptSyntax/promptTypes.js';
import { IChat, ISession } from '../../../../../../services/sessions/common/session.js';
import { ModePicker, ModePickerModel, ScopedModePickerModelCache } from '../../browser/modePicker.js';
import { ISessionChatSource } from '../../../../../../services/sessions/browser/sessionHost.js';
import { IEditorService } from '../../../../../../services/editor/common/editorService.js';
import { ITestSessionWithChat, testChatSourceOf } from '../../../../test/browser/sessionHostTestUtils.js';

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
		const session = upcastPartial<ITestSessionWithChat>({ resource, mode, providerId: 'default-copilot' });
		const scope = observableValue<ITestSessionWithChat | undefined>('scope', session);
		// The surface's chat carries the mode of the session it shows.
		const source: ISessionChatSource = { session: scope, chat: derived(reader => { const shown = scope.read(reader); return shown && upcastPartial<IChat>({ mode: shown.mode }); }) };
		return { session, scope, source, mode, customAgent };
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
		const firstReference = store.add(cache.acquire(first.source, instantiationService));
		const secondReference = store.add(cache.acquire(second.source, instantiationService));
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
		const first = store.add(cache.acquire(session.source, instantiationService));
		first.dispose();
		const replacement = store.add(cache.acquire(session.source, instantiationService));
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

	test('discovers the agents of the chat each source shows: two sources of one session object, and a source switching between chats of the session', () => {
		const sessionResource = URI.parse('copilotcli:/shared');
		const agentOf = (name: string) => new CustomChatMode({
			id: name,
			uri: URI.file(`/workspace/${name}.agent.md`),
			name,
			agentInstructions: { content: '', toolReferences: [] },
			source: { storage: PromptsStorage.local },
			target: Target.Undefined,
			visibility: { userInvocable: true, agentInvocable: true },
			enabled: true,
		});
		// Discovery depends on the chat it runs for: chat A discovers agent a, chat B agent b.
		const chats = ['a', 'b'].map(name => {
			const agent = agentOf(name);
			const chat = upcastPartial<IChat>({ resource: sessionResource.with({ fragment: name }), mode: constObservable({ id: agent.id, kind: ChatMode.Agent.kind }) });
			return { chat, agent };
		});
		const [chatA, chatB] = chats.map(entry => entry.chat);
		const requested: string[] = [];
		const disposed: string[] = [];
		const instantiationService = store.add(new TestInstantiationService());
		instantiationService.stub(IChatSessionsService, { getCustomAgentTargetForSessionType: () => Target.Undefined });
		instantiationService.stub(IChatModeService, {
			createModes: resource => {
				const entry = chats.find(candidate => candidate.chat.resource.toString() === resource?.toString());
				assert.ok(entry);
				requested.push(resource.fragment);
				const modes: IChatModes & IDisposable = {
					onDidChange: Event.None,
					builtin: [ChatMode.Agent],
					custom: [entry.agent],
					findModeById: id => id === entry.agent.id ? entry.agent : id === ChatMode.Agent.id ? ChatMode.Agent : undefined,
					findModeByName: () => undefined,
					waitForPendingUpdates: async () => { },
					dispose: () => disposed.push(resource.fragment),
				};
				return modes;
			},
		});
		const cache = store.add(new ScopedModePickerModelCache(() => true));
		// Two surfaces of the same session object, such as a slot and a detached pane, each showing its own chat.
		const session = constObservable(upcastPartial<ITestSessionWithChat>({ resource: sessionResource, providerId: 'default-copilot' }));
		const firstChat = observableValue<IChat | undefined>('firstChat', chatA);
		const first = store.add(cache.acquire({ session, chat: firstChat }, instantiationService));
		const second = store.add(cache.acquire({ session, chat: constObservable(chatB) }, instantiationService));
		const shown = () => [first, second].map(reference => ({
			selected: reference.model.selectedMode.id,
			available: reference.model.getAvailableModes().map(mode => mode.id),
		}));
		const initial = shown();

		firstChat.set(chatB, undefined);
		const afterSwitching = shown();
		firstChat.set(chatA, undefined);

		assert.deepStrictEqual({ initial, afterSwitching, afterSwitchingBack: shown(), requested, disposed }, {
			initial: [{ selected: 'a', available: ['agent', 'a'] }, { selected: 'b', available: ['agent', 'b'] }],
			afterSwitching: [{ selected: 'b', available: ['agent', 'b'] }, { selected: 'b', available: ['agent', 'b'] }],
			afterSwitchingBack: [{ selected: 'a', available: ['agent', 'a'] }, { selected: 'b', available: ['agent', 'b'] }],
			requested: ['a', 'b', 'b', 'a'],
			disposed: ['a', 'b'],
		});
	});

	test('follows scoped retargets and clears discovery for unsupported sessions', () => {
		const first = createSession('first');
		const second = createSession('second');
		const disposed: string[] = [];
		const instantiationService = createInstantiationService([first, second], disposed);
		const cache = store.add(new ScopedModePickerModelCache(session => session.providerId === 'default-copilot'));
		const reference = store.add(cache.acquire(first.source, instantiationService));

		first.scope.set(second.session, undefined);
		const retargeted = {
			selected: reference.model.selectedMode.id,
			available: reference.model.getAvailableModes().map(mode => mode.id),
		};
		first.scope.set(upcastPartial<ITestSessionWithChat>({ providerId: 'another-provider', mode: second.mode }), undefined);

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

	const fileCases: { source: IAgentSource; resource: URI; actionLabel?: string }[] = [
		{ source: { storage: PromptsStorage.local }, resource: URI.file('/workspace/reviewer.agent.md'), actionLabel: 'Edit Reviewer agent' },
		{ source: { storage: PromptsStorage.extension, extensionId: new ExtensionIdentifier('test.agents') }, resource: URI.file('/extensions/reviewer.agent.md'), actionLabel: 'View Reviewer agent' },
		{ source: { storage: PromptsStorage.local }, resource: URI.parse('vscode-agent-host://remote/workspace/reviewer.agent.md'), actionLabel: 'Edit Reviewer agent' },
		{ source: { storage: PromptsStorage.local }, resource: URI.file('/cache/reviewer.agent.md'), actionLabel: 'Edit Reviewer agent' },
		{ source: { storage: PromptsStorage.local }, resource: URI.parse('claude-internal:/agent/Explore') },
		{ source: { storage: PromptsStorage.local }, resource: toAgentHostUri(URI.parse('claude-internal:/agent/Explore'), 'remote') },
		{ source: { storage: PromptsStorage.local }, resource: URI.parse('unregistered:/agent') },
	];
	const fileService = upcastPartial<IFileService>({ hasProvider: resource => resource.scheme === Schemas.file || resource.scheme === AGENT_HOST_SCHEME });
	for (const { source, resource, actionLabel } of fileCases) {
		test(`offers file actions only for openable ${source.storage} agents (${resource.toString()})`, async () => {
			const customAgent = new CustomChatMode({
				id: 'reviewer', uri: resource, name: 'Reviewer',
				source,
				agentInstructions: { content: '', toolReferences: [] }, target: Target.Undefined,
				visibility: { userInvocable: true, agentInvocable: true }, enabled: true,
			});
			const model = upcastPartial<ModePickerModel>({
				onDidChange: Event.None,
				selectedMode: ChatMode.Agent,
				getAvailableModes: () => [ChatMode.Agent, customAgent, ChatMode.Ask],
			});
			let items: readonly Pick<IActionListItem<never>, 'label' | 'toolbarActions'>[] = [];
			let keyboardActions = false;
			const calls: string[] = [];
			const picker = store.add(new ModePicker(
				model, testChatSourceOf(observableValue<ITestSessionWithChat | undefined>('session', undefined)),
				upcastPartial<IActionWidgetService>({
					isVisible: false,
					hide: () => calls.push('hide'),
					show: (_id, _preview, rows, _delegate, _anchor, _container, _actions, _accessibility, options) => {
						items = rows;
						keyboardActions = options?.tabThroughItemActions === true;
					},
				}),
				upcastPartial<ICommandService>({}), new TestTelemetryService(),
				upcastPartial<IChatService>({}), new MockChatSessionsService(),
				upcastPartial<IEditorService>({
					openEditor: async editor => {
						assert.ok(hasKey(editor, { resource: true }));
						calls.push(`open:${editor.resource?.toString()}`);
						return undefined;
					},
				}),
				fileService,
			));
			store.add(picker.onDidSelect(mode => calls.push(`select:${mode.id}`)));
			picker.showPicker(document.createElement('button'));
			const agentAction = items.find(item => item.label === 'Reviewer')?.toolbarActions?.[0];
			await agentAction?.run();

			assert.deepStrictEqual({
				actionLabel: agentAction?.label,
				rowsWithActions: items.filter(item => item.toolbarActions?.length).map(item => item.label),
				keyboardActions,
				calls,
				selected: model.selectedMode.id,
			}, {
				actionLabel,
				rowsWithActions: actionLabel ? ['Reviewer'] : [],
				keyboardActions: true,
				calls: actionLabel ? ['hide', `open:${resource.toString()}`] : [],
				selected: ChatMode.Agent.id,
			});
		});
	}

	test('distinguishes duplicate labels visibly and accessibly without changing selection IDs', () => {
		const custom = ['VS Code', 'Plugin: review-tools', 'VS Code'].map((source, index) => new CustomChatMode({
			id: `client-agent:/${index}`, uri: URI.parse(`client-agent:/${index}`),
			name: index === 2 ? 'Other' : 'Reviewer',
			source: { storage: PromptsStorage.local, label: source },
			agentInstructions: { content: '', toolReferences: [] }, target: Target.Undefined,
			visibility: { userInvocable: true, agentInvocable: true }, enabled: true,
		}));
		const modes = upcastPartial<IChatModes & IDisposable>({
			onDidChange: Event.None, builtin: [ChatMode.Agent], custom,
			findModeById: id => custom.find(mode => mode.id === id),
			waitForPendingUpdates: async () => { }, dispose: () => { },
		});
		const model = store.add(new ModePickerModel(
			upcastPartial<IChatSessionsService>({ getCustomAgentTargetForSessionType: () => Target.Undefined }),
			upcastPartial<IChatModeService>({ createModes: () => modes }),
		));
		model.setSession(upcastPartial<ISession>({ resource: URI.parse('agent-host-copilotcli:/session') }), custom[0].id);
		let rows: { label: string | undefined; source: string | undefined; aria: string | null | undefined }[] = [];
		const picker = store.add(new ModePicker(
			model, testChatSourceOf(observableValue<ITestSessionWithChat | undefined>('session', undefined)),
			upcastPartial<IActionWidgetService>({
				isVisible: false, hide: () => { },
				show: (_id, _preview, items, delegate, _anchor, _container, _actions, accessibilityProvider) => {
					rows = items.filter(item => item.label === 'Reviewer' || item.label === 'Other').map(item => {
						const aria = accessibilityProvider?.getAriaLabel?.(item);
						return {
							label: item.label,
							source: typeof item.description === 'string' ? item.description : undefined,
							aria: typeof aria === 'string' || aria === null || aria === undefined ? aria : aria.get(),
						};
					});
					const selected = items.find(item => item.description === 'Plugin: review-tools');
					assert.ok(selected?.item);
					delegate.onSelect(selected.item);
				},
			}),
			upcastPartial<ICommandService>({}), new TestTelemetryService(),
			upcastPartial<IChatService>({}), new MockChatSessionsService(),
			upcastPartial<IEditorService>({}),
			fileService,
		));
		const container = document.createElement('div');
		document.body.appendChild(container);
		store.add(toDisposable(() => container.remove()));
		picker.render(container);
		picker.showPicker();
		assert.deepStrictEqual({ rows, selected: model.selectedMode.id }, {
			rows: [
				{ label: 'Reviewer', source: 'VS Code', aria: 'Reviewer, VS Code' },
				{ label: 'Reviewer', source: 'Plugin: review-tools', aria: 'Reviewer, Plugin: review-tools' },
				{ label: 'Other', source: undefined, aria: 'Other' },
			],
			selected: custom[1].id,
		});
	});

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
		const scopedSession = observableValue<ITestSessionWithChat | undefined>('session', new class extends mock<ITestSessionWithChat>() {
			override readonly activeChat = observableValue<IChat>('activeChat', activeChat);
			override readonly sessionType = 'agent-host-claude';
		}());

		let selectCustomAgent: (() => void) | undefined;
		let hidePicker: (() => void) | undefined;
		const requestedChatResources: string[] = [];
		const chatSessionsService = new MockChatSessionsService();
		chatSessionsService.setContributions([{ type: 'agent-host-claude', agentHostProviderId: 'claude', name: 'Claude', displayName: 'Claude', description: '' }]);
		const picker = store.add(new ModePicker(
			model,
			testChatSourceOf(scopedSession),
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
			chatSessionsService,
			upcastPartial<IEditorService>({}),
			fileService,
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
		const expandedWhileOpen = trigger?.getAttribute('aria-expanded');
		assert.ok(hidePicker);
		hidePicker();
		const pointerFocusCalls = focusCalls;
		const expandedAfterHide = trigger?.getAttribute('aria-expanded');

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
			expandedWhileOpen,
			expandedAfterHide,
		}, {
			events: [{
				name: 'chat.modeChange',
				data: {
					provider: 'claude',
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
			expandedWhileOpen: 'true',
			expandedAfterHide: 'false',
		});
	});
});
