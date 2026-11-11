/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { Emitter, Event } from '../../../../../base/common/event.js';
import { IReference } from '../../../../../base/common/lifecycle.js';
import { autorun, constObservable, observableValue } from '../../../../../base/common/observable.js';
import { URI } from '../../../../../base/common/uri.js';
import { mock, upcastPartial } from '../../../../../base/test/common/mock.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { IAgentCanvasCloseRequest, IAgentCanvasInfo, IAgentCanvasOpenRequest, IAgentConnection } from '../../../../../platform/agentHost/common/agentService.js';
import { IAgentSubscription } from '../../../../../platform/agentHost/common/state/agentSubscription.js';
import { CanvasReference, CanvasState } from '../../../../../platform/agentHost/common/state/protocol/channels-canvas/state.js';
import { ActionType, type ActionEnvelope } from '../../../../../platform/agentHost/common/state/sessionActions.js';
import { ChatState, ComponentToState, ResponsePartKind, StateComponents, ToolCallCompletedState, ToolCallConfirmationReason, ToolCallStatus, Turn, type ActiveTurn, type ResponsePart } from '../../../../../platform/agentHost/common/state/sessionState.js';
import { NullLogService } from '../../../../../platform/log/common/log.js';
import { AgentHostCanvas, AgentHostCanvasCollection, getAgentHostCanvasDefinitionsChangedEvent } from '../../common/agentHostCanvas.js';
import { ICanvas, ICanvasOwner } from '../../../../common/canvasReference.js';

suite('AgentHost canvases', () => {
	const store = ensureNoDisposablesAreLeakedInTestSuite();
	const owner: ICanvasOwner = {
		providerId: 'local/copilotcli', session: URI.parse('ahp-session:/owner'), chat: URI.parse('ahp-session:/owner/chats/peer'),
	};
	const resource = URI.parse('ahp-canvas:/host-specific/opaque-reference');
	const state: CanvasState = {
		instanceId: 'preview', extensionId: 'project:preview', extensionName: 'Preview Extension', canvasId: 'preview', url: 'https://example.test/preview',
	};

	test('subscribes to advertised resources, updates source state and releases removed channels', () => {
		const changed = store.add(new Emitter<CanvasState>());
		let current = state;
		let active = 0;
		const requested: string[] = [];
		const connection = new class extends mock<IAgentConnection>() {
			override readonly initializeResult = constObservable(undefined);
			override getSubscription<T extends StateComponents>(kind: T, channel: URI): IReference<IAgentSubscription<ComponentToState[T]>> {
				assert.strictEqual(kind, StateComponents.Canvas);
				requested.push(channel.toString());
				active++;
				return {
					object: {
						get value() { return current as ComponentToState[T]; },
						get verifiedValue() { return current as ComponentToState[T]; },
						onDidChange: Event.map(changed.event, value => value as ComponentToState[T]),
						onWillApplyAction: Event.None,
						onDidApplyAction: Event.None,
					},
					dispose: () => active--,
				};
			}
		}();
		const collection = store.add(new AgentHostCanvasCollection(owner.providerId, connection, new NullLogService()));
		const references = observableValue<readonly CanvasReference[] | undefined>('references', [{ resource: resource.toString() }]);
		const context = collection.createContext(owner, references);
		let canvases: readonly ICanvas[] | undefined;
		store.add(autorun(reader => { canvases = context.canvases.read(reader); }));
		const initial = canvases?.[0].source?.toString();
		current = { ...state, url: undefined };
		changed.fire(current);
		const unavailable = canvases?.[0].source;
		references.set(undefined, undefined);
		const unknown = canvases;
		references.set([], undefined);
		assert.deepStrictEqual({ requested, initial, unavailable, unknown, empty: canvases, active }, {
			requested: [resource.toString()], initial: 'https://example.test/preview', unavailable: undefined, unknown: undefined, empty: [], active: 0,
		});
	});

	test('retains pending identity without inventing a source or instance ID', () => {
		const canvas = new AgentHostCanvas(resource, undefined, new NullLogService());
		assert.deepStrictEqual({ resource: canvas.resource.toString(), instanceId: canvas.instanceId, source: canvas.source }, {
			resource: resource.toString(), instanceId: undefined, source: undefined,
		});
	});

	test('bridges registered canvas operations through the owning chat context', async () => {
		const calls: unknown[] = [];
		const definitionsChanged = store.add(new Emitter<void>());
		let changeCount = 0;
		const definition: IAgentCanvasInfo = {
			canvasId: 'preview',
			extensionId: 'project:preview',
			extensionSource: 'project',
			extensionName: 'Preview Extension',
			displayName: 'Preview',
			description: 'A preview canvas.',
			requiresInput: false,
			actionCount: 0,
		};
		const connection = new class extends mock<IAgentConnection>() {
			override async listSessionCanvases(session: URI, chat: URI): Promise<readonly IAgentCanvasInfo[]> {
				calls.push(['list', session.toString(), chat.toString()]);
				return [definition];
			}
			override async openSessionCanvas(session: URI, request: IAgentCanvasOpenRequest, chat: URI): Promise<void> {
				calls.push(['open', session.toString(), chat.toString(), request]);
			}
		}();
		const collection = store.add(new AgentHostCanvasCollection(owner.providerId, connection, new NullLogService()));
		const context = collection.createContext(owner, constObservable([]), undefined, definitionsChanged.event);
		assert.ok(context.definitionProvider);
		store.add(context.definitionProvider.onDidChangeDefinitions(() => changeCount++));

		const definitions = await context.definitionProvider.listCanvases();
		assert.ok(definitions && definitions.length === 1, 'Expected one canvas definition');
		await context.definitionProvider.openCanvas(definitions[0], 'stable-preview');
		definitionsChanged.fire();

		assert.deepStrictEqual({ calls, changeCount }, {
			calls: [
				['list', owner.session.toString(), owner.chat.toString()],
				['open', owner.session.toString(), owner.chat.toString(), {
					canvasId: 'preview',
					extensionId: 'project:preview',
					instanceId: 'stable-preview',
				}],
			],
			changeCount: 1,
		});
	});

	test('invalidates definitions for registry actions and snapshots only', () => {
		const appliedAction = store.add(new Emitter<ActionEnvelope>());
		const appliedSnapshot = store.add(new Emitter<ChatState>());
		const cancelledRefresh = store.add(new Emitter<readonly ActionEnvelope[]>());
		const subscription = upcastPartial<IAgentSubscription<ChatState>>({
			onDidApplyAction: appliedAction.event,
			onDidApplySnapshot: appliedSnapshot.event,
			onDidCancelSnapshotRefresh: cancelledRefresh.event,
		});
		let changes = 0;
		store.add(getAgentHostCanvasDefinitionsChangedEvent(subscription)(() => changes++));

		appliedAction.fire(upcastPartial<ActionEnvelope>({ action: { type: ActionType.ChatDraftChanged } }));
		appliedAction.fire(upcastPartial<ActionEnvelope>({ action: { type: ActionType.ChatCanvasesChanged, canvases: undefined } }));
		appliedSnapshot.fire(upcastPartial<ChatState>({}));
		cancelledRefresh.fire([
			upcastPartial<ActionEnvelope>({ action: { type: ActionType.ChatDraftChanged } }),
			upcastPartial<ActionEnvelope>({ action: { type: ActionType.ChatCanvasesChanged, canvases: undefined } }),
		]);

		assert.strictEqual(changes, 3);
	});

	test('closes canvases through the owner\'s host-supplied session and chat only when the host can', async () => {
		const closed: unknown[] = [];
		const createConnection = (canClose: boolean) => new class extends mock<IAgentConnection>() {
			override readonly initializeResult = constObservable(undefined);
			override readonly closeSessionCanvas = canClose ? async (session: URI, request: IAgentCanvasCloseRequest, chat: URI) => {
				closed.push({ session: session.toString(), resource: request.resource.toString(), chat: chat.toString() });
			} : undefined;
		}();
		const references = constObservable<readonly CanvasReference[] | undefined>([]);
		const closing = store.add(new AgentHostCanvasCollection(owner.providerId, createConnection(true), new NullLogService())).createContext(owner, references);
		const unsupported = store.add(new AgentHostCanvasCollection(owner.providerId, createConnection(false), new NullLogService())).createContext(owner, references);

		await closing.closeCanvas?.(new AgentHostCanvas(resource, state, new NullLogService()));

		assert.deepStrictEqual({ closed, unsupported: unsupported.closeCanvas }, {
			closed: [{ session: owner.session.toString(), resource: resource.toString(), chat: owner.chat.toString() }],
			unsupported: undefined,
		});
	});

	test('tracks explicit opens by tool identity and request state rather than source changes', () => {
		const connection = new class extends mock<IAgentConnection>() {
			override readonly initializeResult = constObservable(undefined);
			override getSubscription<T extends StateComponents>(): IReference<IAgentSubscription<ComponentToState[T]>> {
				return {
					object: {
						value: state as ComponentToState[T], verifiedValue: state as ComponentToState[T],
						onDidChange: Event.None, onWillApplyAction: Event.None, onDidApplyAction: Event.None,
					},
					dispose: () => { },
				};
			}
		}();
		const call: ToolCallCompletedState = {
			toolCallId: 'first', toolName: 'open_canvas', displayName: 'Open Canvas',
			invocationMessage: 'Opening canvas', pastTenseMessage: 'Opened canvas',
			status: ToolCallStatus.Completed, success: true, confirmed: ToolCallConfirmationReason.NotNeeded, toolInput: '{"instanceId":"preview"}',
		};
		const first = upcastPartial<Turn>({ id: 'turn', responseParts: [{ kind: ResponsePartKind.ToolCall, toolCall: call }] });
		const chat = observableValue<ChatState | undefined>('chat', upcastPartial<ChatState>({ resource: owner.chat.toString(), turns: [first] }));
		const collection = store.add(new AgentHostCanvasCollection(owner.providerId, connection, new NullLogService()));
		const context = collection.createContext(owner, constObservable([{ resource: resource.toString() }]), chat);
		const initial = context.openRequests?.get().get('preview');
		const running = upcastPartial<Turn>({
			id: 'next', responseParts: [{ kind: ResponsePartKind.ToolCall, toolCall: { ...call, toolCallId: 'running', status: ToolCallStatus.Running } }],
		});
		chat.set(upcastPartial<ChatState>({ resource: owner.chat.toString(), turns: [first, running] }), undefined);
		const pending = context.openRequests?.get().get('preview');
		const failed = upcastPartial<Turn>({
			id: 'next', responseParts: [{ kind: ResponsePartKind.ToolCall, toolCall: { ...call, toolCallId: 'failed', success: false } }],
		});
		chat.set(upcastPartial<ChatState>({ resource: owner.chat.toString(), turns: [first, failed] }), undefined);
		assert.deepStrictEqual({ initial, pending, latest: context.openRequests?.get().get('preview') }, {
			initial: { id: 'turn\u0000first', succeeded: true },
			pending: { id: 'next\u0000running', succeeded: false, pending: true },
			latest: { id: 'next\u0000failed', succeeded: false },
		});
	});

	test('does not rescan completed history while the active turn streams', () => {
		const uiState: CanvasState = { ...state, instanceId: 'ui-opened' };
		const uiResource = URI.parse('ahp-canvas:/host-specific/ui-opened');
		const connection = new class extends mock<IAgentConnection>() {
			override readonly initializeResult = constObservable(undefined);
			override getSubscription<T extends StateComponents>(_kind: T, channel: URI): IReference<IAgentSubscription<ComponentToState[T]>> {
				const value = (channel.toString() === uiResource.toString() ? uiState : state) as ComponentToState[T];
				return {
					object: { value, verifiedValue: value, onDidChange: Event.None, onWillApplyAction: Event.None, onDidApplyAction: Event.None },
					dispose: () => { },
				};
			}
		}();
		const createCall = (toolCallId: string, instanceId: string, status: ToolCallStatus.Running | ToolCallStatus.Completed) => ({
			toolCallId, toolName: 'open_canvas', displayName: 'Open Canvas',
			invocationMessage: 'Opening canvas', pastTenseMessage: 'Opened canvas',
			status, success: true, confirmed: ToolCallConfirmationReason.NotNeeded, toolInput: JSON.stringify({ instanceId }),
		} as ToolCallCompletedState);
		let completedReads = 0;
		const completedParts: ResponsePart[] = [{ kind: ResponsePartKind.ToolCall, toolCall: createCall('first', 'preview', ToolCallStatus.Completed) }];
		let olderReads = 0;
		const older = upcastPartial<Turn>({
			id: 'older', get responseParts() {
				olderReads++;
				return [];
			},
		});
		const completed = upcastPartial<Turn>({
			id: 'turn', get responseParts() {
				completedReads++;
				return completedParts;
			},
		});
		const turns = [older, completed];
		const createChat = (activeTurn?: ActiveTurn) => upcastPartial<ChatState>({ resource: owner.chat.toString(), turns, activeTurn });
		const chat = observableValue<ChatState | undefined>('chat', createChat());
		const references = constObservable([{ resource: resource.toString() }, { resource: uiResource.toString() }]);
		const context = store.add(new AgentHostCanvasCollection(owner.providerId, connection, new NullLogService())).createContext(owner, references, chat);
		const requests: unknown[] = [];
		store.add(autorun(reader => {
			const current = context.openRequests?.read(reader);
			requests.push([current?.get('preview')?.id, current?.get('ui-opened')?.id, current?.get('ui-opened')?.pending]);
		}));
		const streaming = (text: string) => upcastPartial<ActiveTurn>({ id: 'active', responseParts: [{ kind: ResponsePartKind.Markdown, id: 'text', content: text }] });
		chat.set(createChat(streaming('a')), undefined);
		chat.set(createChat(streaming('ab')), undefined);
		chat.set(createChat(upcastPartial<ActiveTurn>({ id: 'active', responseParts: [{ kind: ResponsePartKind.ToolCall, toolCall: createCall('second', 'ui-opened', ToolCallStatus.Running) }] })), undefined);

		assert.deepStrictEqual({ requests, completedReads, olderReads }, {
			requests: [
				['turn\u0000first', undefined, undefined],
				['turn\u0000first', 'active\u0000second', true],
			],
			completedReads: 1,
			olderReads: 1,
		});
	});

	test('stops scanning completed history once the requested instances are resolved', () => {
		let olderReads = 0;
		const older = upcastPartial<Turn>({
			id: 'older', get responseParts() {
				olderReads++;
				return [];
			},
		});
		const newest = upcastPartial<Turn>({
			id: 'newest', responseParts: [{
				kind: ResponsePartKind.ToolCall, toolCall: {
					toolCallId: 'open', toolName: 'open_canvas', status: ToolCallStatus.Completed, success: true, toolInput: JSON.stringify({ instanceId: 'preview' }),
				} as ToolCallCompletedState,
			}],
		});
		const connection = new class extends mock<IAgentConnection>() {
			override readonly initializeResult = constObservable(undefined);
			override getSubscription<T extends StateComponents>(_kind: T, _channel: URI): IReference<IAgentSubscription<ComponentToState[T]>> {
				const value = state as ComponentToState[T];
				return {
					object: { value, verifiedValue: value, onDidChange: Event.None, onWillApplyAction: Event.None, onDidApplyAction: Event.None },
					dispose: () => { },
				};
			}
		}();
		const chat = constObservable<ChatState | undefined>(upcastPartial<ChatState>({ resource: owner.chat.toString(), turns: [older, newest] }));
		const context = store.add(new AgentHostCanvasCollection(owner.providerId, connection, new NullLogService())).createContext(owner, constObservable([{ resource: resource.toString() }]), chat);

		assert.deepStrictEqual({ id: context.openRequests?.get().get('preview')?.id, olderReads }, { id: 'newest\u0000open', olderReads: 0 });
	});

	test('projects live metadata while leaving transient sources out of channel identity', () => {
		const canvas = new AgentHostCanvas(resource, state, new NullLogService());
		assert.deepStrictEqual({ resource: canvas.resource.toString(), title: canvas.title, source: canvas.source?.toString() }, {
			resource: resource.toString(), title: 'Preview Extension', source: 'https://example.test/preview',
		});
	});

	test('rejects unsupported sources without logging their contents', () => {
		const warnings: string[] = [];
		const log = new class extends NullLogService {
			override warn(message: string): void { warnings.push(message); }
		}();
		const invalid = new AgentHostCanvas(resource, { ...state, url: 'file:///private/token=secret' }, log);
		const emptyAuthority = new AgentHostCanvas(resource, { ...state, url: 'http:/private/token=secret' }, log);
		assert.deepStrictEqual({ invalid: invalid.source, emptyAuthority: emptyAuthority.source, warnings }, {
			invalid: undefined, emptyAuthority: undefined, warnings: ['[AgentHostCanvas] Unsupported canvas source', '[AgentHostCanvas] Unsupported canvas source'],
		});
	});
});
