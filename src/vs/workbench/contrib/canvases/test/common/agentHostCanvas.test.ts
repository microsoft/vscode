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
import { IAgentConnection } from '../../../../../platform/agentHost/common/agentService.js';
import { IAgentSubscription } from '../../../../../platform/agentHost/common/state/agentSubscription.js';
import { CanvasReference, CanvasState } from '../../../../../platform/agentHost/common/state/protocol/channels-canvas/state.js';
import { CanvasRegistryStatus, CanvasesState } from '../../../../../platform/agentHost/common/state/protocol/channels-canvases/state.js';
import { OpenCanvasParams } from '../../../../../platform/agentHost/common/state/protocol/channels-canvas/commands.js';
import { ActionType } from '../../../../../platform/agentHost/common/state/sessionActions.js';
import { buildChatUri, ChatState, ComponentToState, ResponsePartKind, StateComponents, ToolCallCompletedState, ToolCallConfirmationReason, ToolCallStatus, Turn } from '../../../../../platform/agentHost/common/state/sessionState.js';
import { NullLogService } from '../../../../../platform/log/common/log.js';
import { AgentHostCanvas, AgentHostCanvasCollection, AgentHostCanvases, getAgentHostCanvasDefinitions } from '../../common/agentHostCanvas.js';
import { ICanvas, ICanvasOwner } from '../../common/canvas.js';

suite('AgentHost canvases', () => {
	const store = ensureNoDisposablesAreLeakedInTestSuite();
	const owner: ICanvasOwner = {
		providerId: 'local/copilotcli', session: URI.parse('ahp-session:/owner'), chat: URI.parse(buildChatUri('ahp-session:/owner', 'peer')),
	};
	const resource = URI.parse('ahp-canvas:/host-specific/opaque-reference');
	const state: CanvasState = {
		instanceId: 'preview', extensionId: 'project:preview', extensionName: 'Preview Extension', canvasId: 'preview', url: 'https://example.test/preview',
	};
	const collectionResource = 'ahp-canvases://another-host/opaque/collection?revision=1';
	const ready: CanvasesState = {
		canvases: [],
		registry: {
			status: CanvasRegistryStatus.Ready,
			extensions: [{
				id: state.extensionId,
				label: 'Preview Extension',
				canvases: [{ id: 'preview', label: 'Preview', description: 'A preview canvas.' }],
			}],
		},
	};

	function createConnection(initial: CanvasesState | undefined) {
		const changed = store.add(new Emitter<CanvasesState>());
		let current = initial;
		return new class extends mock<IAgentConnection>() {
			readonly requested: string[] = [];
			readonly released: string[] = [];
			readonly dispatched: { channel: string; action: Parameters<IAgentConnection['dispatch']>[1] }[] = [];
			readonly opened: OpenCanvasParams[] = [];
			override readonly initializeResult = constObservable(undefined);
			override getSubscription<T extends StateComponents>(kind: T, channel: URI): IReference<IAgentSubscription<ComponentToState[T]>> {
				this.requested.push(channel.toString());
				const value = () => (kind === StateComponents.Canvases ? current : state) as ComponentToState[T] | undefined;
				return {
					object: {
						get value() { return value(); },
						get verifiedValue() { return value(); },
						onDidChange: kind === StateComponents.Canvases ? Event.map(changed.event, value => value as ComponentToState[T]) : Event.None,
						onWillApplyAction: Event.None,
						onDidApplyAction: Event.None,
					},
					dispose: () => { this.released.push(channel.toString()); },
				};
			}
			setState(value: CanvasesState): void {
				current = value;
				changed.fire(value);
			}
			override dispatch(channel: string, action: Parameters<IAgentConnection['dispatch']>[1]): void {
				this.dispatched.push({ channel, action });
			}
			override async openCanvas(params: OpenCanvasParams): Promise<void> {
				this.opened.push(params);
			}
		}();
	}

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
		const collection = store.add(new AgentHostCanvasCollection(owner.providerId, connection, undefined, new NullLogService()));
		const references = observableValue<readonly CanvasReference[] | undefined>('references', [{ resource: resource.toString() }]);
		const context = collection.createContext(owner, references.map(canvases => canvases ? upcastPartial<ChatState>({ canvases: [...canvases] }) : undefined));
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

	test('preserves full input schemas and derives the current direct-open UI policy', () => {
		const inputSchema = {
			$schema: 'http://json-schema.org/draft-07/schema#',
			type: 'object',
			properties: {
				issue: { type: 'string', description: 'Issue number or URL.' },
				options: {
					type: 'object',
					properties: { verbose: { type: 'boolean', default: false } },
				},
			},
			required: ['issue'],
			additionalProperties: false,
		};
		const definitions = getAgentHostCanvasDefinitions({
			status: CanvasRegistryStatus.Ready,
			extensions: [{
				id: 'opaque-provider',
				label: 'Provider',
				canvases: [
					{ id: 'plain', label: 'Plain', description: 'No schema.' },
					{ id: 'optional', label: 'Optional', description: 'Optional input.', inputSchema: { type: 'object', properties: inputSchema.properties } },
					{ id: 'issue', label: 'Issue', description: 'Required input.', inputSchema },
				],
			}],
		});

		assert.deepStrictEqual(definitions, [{
			canvasId: 'plain', extensionId: 'opaque-provider', extensionName: 'Provider', extensionSource: 'unknown',
			displayName: 'Plain', description: 'No schema.', requiresInput: false,
		}, {
			canvasId: 'optional', extensionId: 'opaque-provider', extensionName: 'Provider', extensionSource: 'unknown',
			displayName: 'Optional', description: 'Optional input.', inputSchema: { type: 'object', properties: inputSchema.properties }, requiresInput: false,
		}, {
			canvasId: 'issue', extensionId: 'opaque-provider', extensionName: 'Provider', extensionSource: 'unknown',
			displayName: 'Issue', description: 'Required input.', inputSchema, requiresInput: true,
		}]);
	});

	test('bridges registered canvas operations through the advertised collection', async () => {
		const connection = createConnection(ready);
		const collection = store.add(new AgentHostCanvasCollection(owner.providerId, connection, undefined, new NullLogService()));
		const chat = constObservable<ChatState | undefined>(upcastPartial<ChatState>({
			canvasesUri: collectionResource,
		}));
		const context = collection.createContext(owner, chat, true);
		assert.ok(context.definitionProvider);
		store.add(context.definitionProvider.onDidChangeDefinitions(() => { }));

		const definitions = await context.definitionProvider.listCanvases();
		assert.ok(definitions && definitions.length === 1, 'Expected one canvas definition');
		await context.definitionProvider.openCanvas(definitions[0], 'stable-preview');

		const params = connection.opened[0];
		assert.deepStrictEqual({
			callCount: connection.opened.length,
			channelScheme: URI.parse(params.channel).scheme,
			params: { ...params, channel: undefined },
		}, {
			callCount: 1,
			channelScheme: 'ahp-canvas',
			params: {
				channel: undefined,
				canvases: collectionResource,
				canvasId: 'preview',
				extensionId: 'project:preview',
			},
		});
	});

	test('refreshes an unavailable advertised canvas through its existing resource', async () => {
		const calls: unknown[] = [];
		const connection = new class extends mock<IAgentConnection>() {
			override readonly initializeResult = constObservable(undefined);
			override getSubscription<T extends StateComponents>(kind: T, channel: URI): IReference<IAgentSubscription<ComponentToState[T]>> {
				assert.strictEqual(channel.toString(), kind === StateComponents.Canvases ? URI.parse(collectionResource).toString() : resource.toString());
				const value = (kind === StateComponents.Canvases ? { ...ready, canvases: [{ resource: resource.toString() }] } : { ...state, url: undefined }) as ComponentToState[T];
				return {
					object: {
						value,
						verifiedValue: value,
						onDidChange: Event.None,
						onWillApplyAction: Event.None,
						onDidApplyAction: Event.None,
					},
					dispose() { },
				};
			}
			override async openCanvas(params: OpenCanvasParams): Promise<void> {
				calls.push(params);
			}
		}();
		const collection = store.add(new AgentHostCanvasCollection(owner.providerId, connection, undefined, new NullLogService()));
		const chat = constObservable<ChatState | undefined>(upcastPartial<ChatState>({
			canvasesUri: collectionResource,
		}));
		const context = collection.createContext(owner, chat, true);
		const definitions = await context.definitionProvider?.listCanvases();
		assert.ok(definitions && definitions.length === 1);

		await context.definitionProvider?.openCanvas(definitions[0], 'preview');

		assert.deepStrictEqual(calls, [{
			channel: resource.toString(),
			canvases: collectionResource,
			extensionId: state.extensionId,
			canvasId: state.canvasId,
		}]);
	});

	test('requests registry activation once, observes loading and ready changes, and surfaces errors without retrying', async () => {
		const connection = createConnection({ registry: { status: CanvasRegistryStatus.Uninitialized }, canvases: [] });
		const collection = store.add(new AgentHostCanvasCollection(owner.providerId, connection, undefined, new NullLogService()));
		const context = collection.createContext(owner, constObservable(upcastPartial<ChatState>({ canvasesUri: collectionResource })), true);
		const provider = context.definitionProvider!;
		let changes = 0;
		store.add(provider.onDidChangeDefinitions(() => changes++));
		store.add(autorun(reader => context.canvases.read(reader)));
		const passiveRequests = connection.dispatched.length;

		const initial = await provider.listCanvases();
		await provider.listCanvases();
		connection.setState({ registry: { status: CanvasRegistryStatus.Loading }, canvases: [] });
		const loading = await provider.listCanvases();
		connection.setState(ready);
		const definitions = await provider.listCanvases();
		connection.setState({ registry: { status: CanvasRegistryStatus.Error, error: { errorType: 'registry', message: 'Registry unavailable' } }, canvases: [] });
		await assert.rejects(() => provider.listCanvases(), /Registry unavailable/);
		await assert.rejects(() => provider.listCanvases(), /Registry unavailable/);
		const retried = await provider.listCanvases({ retry: true });
		await assert.rejects(() => provider.listCanvases(), /Registry unavailable/);
		assert.deepStrictEqual({ passiveRequests, initial, loading, definitions: definitions?.length, retried, changes, dispatched: connection.dispatched }, {
			passiveRequests: 0, initial: undefined, loading: undefined, definitions: 1, retried: undefined, changes: 3,
			dispatched: [
				{ channel: collectionResource, action: { type: ActionType.CanvasesRegistryRequested } },
				{ channel: collectionResource, action: { type: ActionType.CanvasesRegistryRequested } },
			],
		});
	});

	test('waits for a collection snapshot and coalesces requests by registry-state identity across resets', () => {
		const connection = createConnection(undefined);
		const collection = new AgentHostCanvases(constObservable(connection), constObservable(upcastPartial<ChatState>({ canvasesUri: collectionResource })));
		store.add(autorun(reader => collection.state.read(reader)));
		const missing = collection.listCanvases();
		collection.listCanvases({ retry: true });
		const beforeSnapshot = connection.dispatched.length;
		const initial: CanvasesState = { registry: { status: CanvasRegistryStatus.Uninitialized }, canvases: [] };
		connection.setState(initial);
		collection.listCanvases();
		collection.listCanvases();
		connection.setState({ ...initial, canvases: [{ resource: resource.toString() }] });
		collection.listCanvases();
		const beforeReset = connection.dispatched.length;
		connection.setState({ registry: { status: CanvasRegistryStatus.Uninitialized }, canvases: [] });
		collection.listCanvases();
		collection.listCanvases();
		assert.deepStrictEqual({ missing, beforeSnapshot, beforeReset, dispatched: connection.dispatched }, {
			missing: undefined, beforeSnapshot: 0, beforeReset: 1,
			dispatched: [
				{ channel: collectionResource, action: { type: ActionType.CanvasesRegistryRequested } },
				{ channel: collectionResource, action: { type: ActionType.CanvasesRegistryRequested } },
			],
		});
	});

	test('prefers collection membership over legacy duplicates and releases replaced opaque collection URIs', () => {
		const connection = createConnection(ready);
		const chat = observableValue<ChatState | undefined>('chat', upcastPartial<ChatState>({
			canvasesUri: collectionResource, canvases: [{ resource: 'ahp-canvas:/legacy-duplicate' }],
		}));
		const collection = new AgentHostCanvases(constObservable(connection), chat);
		let references: readonly CanvasReference[] | undefined;
		const observing = store.add(autorun(reader => { references = collection.references.read(reader); }));
		const authoritative = references;
		const replacement = 'ahp-canvases:/different-opaque-collection';
		chat.set(upcastPartial<ChatState>({ canvasesUri: replacement, canvases: [{ resource: 'ahp-canvas:/ignored' }] }), undefined);
		const replaced = references;
		chat.set(upcastPartial<ChatState>({ canvases: [{ resource: resource.toString() }] }), undefined);
		const legacy = references;
		observing.dispose();
		assert.deepStrictEqual({ authoritative, replaced, legacy, requested: connection.requested, released: connection.released, dispatched: connection.dispatched }, {
			authoritative: [], replaced: [], legacy: [{ resource: resource.toString() }],
			requested: [URI.parse(collectionResource).toString(), replacement], released: [URI.parse(collectionResource).toString(), replacement], dispatched: [],
		});
	});

	test('closes canvases by their advertised resource identity', async () => {
		const closed: unknown[] = [];
		const connection = new class extends mock<IAgentConnection>() {
			override readonly initializeResult = constObservable(undefined);
			override async disposeCanvas(canvas: URI): Promise<void> {
				closed.push(canvas.toString());
			}
		}();
		const closing = store.add(new AgentHostCanvasCollection(owner.providerId, connection, undefined, new NullLogService())).createContext(owner, constObservable(upcastPartial<ChatState>({})), true);

		await closing.closeCanvas?.(new AgentHostCanvas(resource, state, new NullLogService()));

		assert.deepStrictEqual(closed, [resource.toString()]);
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
		const chat = observableValue<ChatState | undefined>('chat', upcastPartial<ChatState>({ resource: owner.chat.toString(), canvases: [{ resource: resource.toString() }], turns: [first] }));
		const collection = store.add(new AgentHostCanvasCollection(owner.providerId, connection, undefined, new NullLogService()));
		const context = collection.createContext(owner, chat);
		const initial = context.openRequests?.get().get('preview');
		const running = upcastPartial<Turn>({
			id: 'next', responseParts: [{ kind: ResponsePartKind.ToolCall, toolCall: { ...call, toolCallId: 'running', status: ToolCallStatus.Running } }],
		});
		chat.set(upcastPartial<ChatState>({ resource: owner.chat.toString(), canvases: [{ resource: resource.toString() }], turns: [first, running] }), undefined);
		const pending = context.openRequests?.get().get('preview');
		const failed = upcastPartial<Turn>({
			id: 'next', responseParts: [{ kind: ResponsePartKind.ToolCall, toolCall: { ...call, toolCallId: 'failed', success: false } }],
		});
		chat.set(upcastPartial<ChatState>({ resource: owner.chat.toString(), canvases: [{ resource: resource.toString() }], turns: [first, failed] }), undefined);
		assert.deepStrictEqual({ initial, pending, latest: context.openRequests?.get().get('preview') }, {
			initial: { id: 'turn\u0000first', succeeded: true },
			pending: { id: 'next\u0000running', succeeded: false, pending: true },
			latest: { id: 'next\u0000failed', succeeded: false },
		});
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
