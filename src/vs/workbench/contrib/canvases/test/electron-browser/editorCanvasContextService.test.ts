/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { mainWindow } from '../../../../../base/browser/window.js';
import { Emitter } from '../../../../../base/common/event.js';
import { Schemas } from '../../../../../base/common/network.js';
import { observableValue } from '../../../../../base/common/observable.js';
import { URI } from '../../../../../base/common/uri.js';
import { upcastPartial } from '../../../../../base/test/common/mock.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { TestConfigurationService } from '../../../../../platform/configuration/test/common/testConfigurationService.js';
import { EditorInput } from '../../../../common/editor/editorInput.js';
import { IEditorGroup, IEditorGroupsService, IEditorPart } from '../../../../services/editor/common/editorGroupsService.js';
import { IEditorService, IVisibleEditorsChangeEvent } from '../../../../services/editor/common/editorService.js';
import { ChatViewId, IChatWidget, IChatWidgetService, IChatWidgetViewModelChangeEvent } from '../../../chat/browser/chat.js';
import { ChatEditor } from '../../../chat/browser/widgetHosts/editor/chatEditor.js';
import { IChatService } from '../../../chat/common/chatService/chatService.js';
import { ChatAgentLocation } from '../../../chat/common/constants.js';
import { IChatModel } from '../../../chat/common/model/chatModel.js';
import { IChatViewModel } from '../../../chat/common/model/chatViewModel.js';
import { CanvasInput, ICanvas, ICanvasContext, ICanvasOwner } from '../../common/canvas.js';
import { EditorCanvasContextService } from '../../electron-browser/editorCanvasContextService.js';

class TestChatInput extends EditorInput {
	constructor(override readonly resource: URI) { super(); }
	override get typeId(): string { return 'test.chat'; }
	override getName(): string { return 'Chat'; }
}

suite('EditorCanvasContextService', () => {
	const store = ensureNoDisposablesAreLeakedInTestSuite();

	function createHarness() {
		const widgets: IChatWidget[] = [];
		const models = observableValue<Iterable<IChatModel>>('models', []);
		const widgetAdded = store.add(new Emitter<IChatWidget>());
		const widgetRemoved = store.add(new Emitter<IChatWidget>());
		const visibilityChanged = store.add(new Emitter<IChatWidget>());
		const editorChanged = store.add(new Emitter<IVisibleEditorsChangeEvent>());
		const sessionRemoved = store.add(new Emitter<{ sessionResources: readonly URI[]; reason: 'cleared' | 'disposed' }>());
		const groups: IEditorGroup[] = [];
		const additions: number[] = [];
		let activeGroup: IEditorGroup;
		function addGroup(id: number): IEditorGroup {
			const group = upcastPartial<IEditorGroup>({ id, windowId: mainWindow.vscodeWindowId, editors: [], activeEditor: undefined, isLocked: false });
			groups.push(group);
			return group;
		}
		const mainPart = upcastPartial<IEditorPart>({
			windowId: mainWindow.vscodeWindowId, groups,
			get activeGroup() { return activeGroup; },
			getGroup: id => groups.find(group => group.id === id),
			findGroup: () => undefined,
			addGroup: source => {
				additions.push(typeof source === 'number' ? source : source.id);
				return addGroup(groups.length + 1);
			},
		});
		activeGroup = addGroup(1);
		const groupsService = upcastPartial<IEditorGroupsService>({ mainPart });
		const service = store.add(new EditorCanvasContextService(
			upcastPartial<IChatWidgetService>({
				getAllWidgets: () => widgets,
				onDidAddWidget: widgetAdded.event,
				onDidRemoveWidget: widgetRemoved.event,
				onDidChangeWidgetVisibility: visibilityChanged.event,
			}),
			upcastPartial<IChatService>({ chatModels: models, onDidDisposeSession: sessionRemoved.event }),
			upcastPartial<IEditorService>({
				onDidVisibleEditorsChange: editorChanged.event,
			}),
			groupsService,
			new TestConfigurationService(),
		));
		function createOwner(id: string, group?: IEditorGroup, editorResource?: URI) {
			const resource = URI.parse(`agent-host-copilotcli:/${id}`);
			const owner: ICanvasOwner = { providerId: 'local/copilotcli', session: URI.parse(`ahp-session:/${id}`), chat: URI.parse(`ahp-session:/${id}/chats/peer`) };
			const canvas: ICanvas = {
				resource: URI.parse('canvas:/preview'), instanceId: 'preview', title: 'Preview', source: URI.parse('https://example.test'),
			};
			const canvases = observableValue<readonly ICanvas[] | undefined>('canvases', [canvas]);
			const context: ICanvasContext = { owner, canvases };
			const canvasContext = observableValue<ICanvasContext | undefined>('context', context);
			const model = upcastPartial<IChatModel>({ sessionResource: resource, canvasContext });
			const viewModel = upcastPartial<IChatViewModel>({ sessionResource: resource, model });
			const changed = store.add(new Emitter<IChatWidgetViewModelChangeEvent>());
			let visible = true;
			const widget = upcastPartial<IChatWidget>({
				domNode: mainWindow.document.createElement('div'), location: ChatAgentLocation.Chat,
				viewContext: group ? {} : { viewId: ChatViewId },
				viewModel, get visible() { return visible; },
				onDidChangeViewModel: changed.event,
			});
			if (group) {
				const chatInput = store.add(new TestChatInput(editorResource ?? resource));
				const chatEditor: ChatEditor = Object.create(ChatEditor.prototype, { widget: { value: widget } });
				Object.assign(group, { activeEditor: chatInput, activeEditorPane: chatEditor, editors: [chatInput] });
			}
			models.set([...models.get(), model], undefined);
			widgets.push(widget);
			widgetAdded.fire(widget);
			const input = store.add(new CanvasInput({ ...owner, canvas: canvas.resource }, canvas, groupsService));
			return {
				owner, input, widget, model, canvases, canvasContext,
				setVisible: (value: boolean) => { visible = value; visibilityChanged.fire(widget); },
				removeWidget: () => { widgets.splice(widgets.indexOf(widget), 1); widgetRemoved.fire(widget); },
			};
		}
		return { service, groups, additions, models, sessionRemoved, createOwner, addGroup, setActiveGroup: (group: IEditorGroup) => activeGroup = group };
	}

	test('keeps split owners eligible independently of focus and isolates visibility changes', () => {
		const harness = createHarness();
		const first = harness.createOwner('first', harness.groups[0]);
		const second = harness.createOwner('second', harness.addGroup(2));
		harness.setActiveGroup(harness.groups[1]);
		const before = [harness.service.isOwnerVisible(first.owner), harness.service.isOwnerVisible(second.owner)];
		first.setVisible(false);
		assert.deepStrictEqual({ before, after: [harness.service.isOwnerVisible(first.owner), harness.service.isOwnerVisible(second.owner)] }, {
			before: [true, true], after: [false, true],
		});
	});

	for (const editorResource of [
		URI.from({ scheme: Schemas.vscodeChatEditor, path: '/chat-1' }),
		URI.parse('agent-host-copilotcli:/untitled-1'),
	]) {
		test(`recognizes a materialized owner whose editor still uses ${editorResource}`, () => {
			const harness = createHarness();
			const owner = harness.createOwner('materialized', harness.groups[0], editorResource);
			assert.deepStrictEqual({
				visible: harness.service.isOwnerVisible(owner.owner),
				target: harness.service.getEditorGroup(owner.owner, owner.input)?.id,
				additions: harness.additions,
			}, { visible: true, target: 2, additions: [1] });
		});
	}

	test('Chat view canvas placement preserves a materialized chat editor', () => {
		const harness = createHarness();
		harness.createOwner('editor', harness.groups[0], URI.from({ scheme: Schemas.vscodeChatEditor, path: '/chat-1' }));
		const owner = harness.createOwner('view');
		assert.deepStrictEqual({
			target: harness.service.getEditorGroup(owner.owner, owner.input)?.id,
			additions: harness.additions,
		}, { target: 2, additions: [1] });
	});

	test('protects every visible editor presentation of the same owner', () => {
		const harness = createHarness();
		const first = harness.createOwner('same', harness.groups[0], URI.from({ scheme: Schemas.vscodeChatEditor, path: '/chat-1' }));
		harness.createOwner('same', harness.addGroup(2), URI.from({ scheme: Schemas.vscodeChatEditor, path: '/chat-2' }));
		assert.deepStrictEqual({
			visible: harness.service.isOwnerVisible(first.owner),
			target: harness.service.getEditorGroup(first.owner, first.input)?.id,
			additions: harness.additions,
		}, { visible: true, target: 3, additions: [1] });
	});

	test('deduplicates multiple widget presentations of the same owner', () => {
		const harness = createHarness();
		const first = harness.createOwner('same');
		const second = harness.createOwner('same');
		first.setVisible(false);
		assert.deepStrictEqual({ contexts: harness.service.contexts.get().length, visible: harness.service.isOwnerVisible(second.owner) }, { contexts: 1, visible: true });
	});

	test('opens beside the originating chat, avoiding all visible owning groups and reusing the result', () => {
		const harness = createHarness();
		const first = harness.createOwner('first', harness.groups[0]);
		const second = harness.createOwner('second', harness.addGroup(2));
		harness.setActiveGroup(harness.groups[1]);
		const target = harness.service.getEditorGroup(first.owner, first.input);
		assert.ok(target);
		Object.assign(target, { activeEditor: first.input, editors: [first.input] });
		const same = harness.service.getEditorGroup(first.owner, first.input);
		const peer = harness.service.getEditorGroup(second.owner, second.input);
		assert.deepStrictEqual({ additions: harness.additions, target: target.id, same: same?.id, peer: peer?.id }, {
			additions: [1], target: 3, same: 3, peer: 3,
		});
	});

	test('Chat view canvases use an existing non-chat group without splitting', () => {
		const harness = createHarness();
		const owner = harness.createOwner('view');
		assert.deepStrictEqual({ group: harness.service.getEditorGroup(owner.owner, owner.input)?.id, additions: harness.additions }, { group: 1, additions: [] });
	});

	test('retains metadata after widget backgrounding but forgets an authoritative deletion', () => {
		const harness = createHarness();
		const owner = harness.createOwner('owner');
		owner.removeWidget();
		const retained = harness.service.contexts.get().length;
		const removed: string[] = [];
		store.add(harness.service.onDidRemoveOwner(owner => removed.push(owner.chat.toString())));
		harness.sessionRemoved.fire({ reason: 'disposed', sessionResources: [owner.model.sessionResource] });
		const afterBackground = harness.service.contexts.get().length;
		const resolvableInBackground = harness.service.getContext(owner.owner)?.canvases === owner.canvases;
		harness.sessionRemoved.fire({ reason: 'cleared', sessionResources: [owner.model.sessionResource] });
		harness.models.set([...harness.models.get()], undefined);
		assert.deepStrictEqual({
			retained, afterBackground, resolvableInBackground, afterDeletion: harness.service.contexts.get().length,
			resolvableAfterDeletion: harness.service.getContext(owner.owner) !== undefined, removed,
		}, {
			retained: 1, afterBackground: 1, resolvableInBackground: true, afterDeletion: 0, resolvableAfterDeletion: false, removed: [owner.owner.chat.toString()],
		});
	});

	test('drops orphan contexts when the provider clears live membership without retaining chat models', () => {
		const harness = createHarness();
		const owner = harness.createOwner('owner');
		owner.removeWidget();
		harness.models.set([], undefined);
		const retained = harness.service.contexts.get().length;
		owner.canvases.set([], undefined);
		assert.deepStrictEqual({ retained, afterClear: harness.service.contexts.get().length }, { retained: 1, afterClear: 0 });
	});
});
