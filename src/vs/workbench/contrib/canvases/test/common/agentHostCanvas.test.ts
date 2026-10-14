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
import { ChatState, ComponentToState, ResponsePartKind, StateComponents, ToolCallCompletedState, ToolCallConfirmationReason, ToolCallStatus, Turn } from '../../../../../platform/agentHost/common/state/sessionState.js';
import { NullLogService } from '../../../../../platform/log/common/log.js';
import { AgentHostCanvas, AgentHostCanvasCollection } from '../../common/agentHostCanvas.js';
import { ICanvas, ICanvasOwner } from '../../common/canvas.js';

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

	test('tracks explicit opens by tool identity, including failed requests, rather than source changes', () => {
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
		const failed = upcastPartial<Turn>({
			id: 'next', responseParts: [{ kind: ResponsePartKind.ToolCall, toolCall: { ...call, toolCallId: 'failed', success: false } }],
		});
		chat.set(upcastPartial<ChatState>({ resource: owner.chat.toString(), turns: [first, failed] }), undefined);
		assert.deepStrictEqual({ initial, latest: context.openRequests?.get().get('preview') }, {
			initial: { id: 'turn\u0000first', succeeded: true }, latest: { id: 'next\u0000failed', succeeded: false },
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
