/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { DataTransfers } from '../../../../../../base/browser/dnd.js';
import { $ } from '../../../../../../base/browser/dom.js';
import { timeout } from '../../../../../../base/common/async.js';
import { toDisposable } from '../../../../../../base/common/lifecycle.js';
import { URI } from '../../../../../../base/common/uri.js';
import { mock, upcastDeepPartial, upcastPartial } from '../../../../../../base/test/common/mock.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../../base/test/common/utils.js';
import { IAgentHostConnectionsService } from '../../../../../../platform/agentHost/common/agentHostConnectionsService.js';
import { IExtensionDescription } from '../../../../../../platform/extensions/common/extensions.js';
import { ISharedWebContentExtractorService } from '../../../../../../platform/webContentExtractor/common/webContentExtractor.js';
import { IExtensionService } from '../../../../../services/extensions/common/extensions.js';
import { IChatWidget } from '../../../../chat/browser/chat.js';
import { IChatAttachmentResolveService } from '../../../../chat/browser/attachments/chatAttachmentResolveService.js';
import { ChatDragAndDrop } from '../../../../chat/browser/widget/chatDragAndDrop.js';
import { IChatRequestVariableEntry } from '../../../../chat/common/attachments/chatVariableEntries.js';
import { IChatModel } from '../../../../chat/common/model/chatModel.js';
import { isInputDropTarget } from '../../../../../browser/dnd.js';
import { IEditorGroupsView, IEditorGroupView } from '../../../../../browser/parts/editor/editor.js';
import { EditorDropTarget } from '../../../../../browser/parts/editor/editorDropTarget.js';
import { IEditorGroupsService } from '../../../../../services/editor/common/editorGroupsService.js';
import { workbenchInstantiationService } from '../../../../../test/browser/workbenchTestServices.js';
import { ChatGroupDropTarget } from '../../../browser/parts/chatGroupDropTarget.js';
import { SessionDropTarget } from '../../../browser/parts/sessionDropTarget.js';
import { clearChatReferenceDragData, fillChatReferenceDragData, fillSessionChatDragData, getSessionChatDragData, isSessionChatDrag } from '../../../browser/dnd.js';
import { ISessionsService } from '../../../browser/sessionsService.js';
import { ISessionsManagementService } from '../../../common/sessionsManagement.js';
import '../../../../chat/browser/widget/media/chat.css';

suite('Sessions - Chat Reference Drop Priority', () => {
	const store = ensureNoDisposablesAreLeakedInTestSuite();

	for (const scope of ['session', 'chatGroup'] as const) {
		test(`${scope} placement does not intercept a chat reference dropped into an input`, async () => {
			const services = workbenchInstantiationService(undefined, store);
			const moves: string[] = [];
			services.stub(ISessionsService, new class extends mock<ISessionsService>() {
				override async moveChatToGrid(): Promise<void> { moves.push('session'); }
			}());
			services.stub(ISessionsManagementService, new class extends mock<ISessionsManagementService>() { }());
			services.stub(IExtensionService, new class extends mock<IExtensionService>() { }());
			services.stub(ISharedWebContentExtractorService, new class extends mock<ISharedWebContentExtractorService>() { }());
			services.stub(IChatAttachmentResolveService, new class extends mock<IChatAttachmentResolveService>() { }());
			services.stub(IAgentHostConnectionsService, upcastPartial<IAgentHostConnectionsService>({
				resolveSessionResourceIdentity: () => ({ connectionAuthority: 'local', backendSession: URI.parse('opaque-session:/session') }),
			}));
			const container = $('.session-view');
			container.style.cssText = 'position:fixed;left:0;top:0;width:400px;height:300px;';
			const group = $('.chat-group-view');
			group.style.cssText = 'position:relative;width:100%;height:100%;';
			const widget = $('.interactive-session');
			widget.style.cssText = 'position:relative;width:100%;height:100%;';
			const transcript = $('.test-transcript', undefined, 'Transcript');
			transcript.style.height = '180px';
			const input = $('.test-chat-input');
			input.style.cssText = 'position:absolute;left:20px;bottom:20px;width:360px;height:80px;';
			const inputContent = $('span', undefined, 'Input');
			input.appendChild(inputContent);
			widget.append(transcript, input);
			group.appendChild(widget);
			container.appendChild(group);
			document.body.appendChild(container);
			store.add(toDisposable(() => container.remove()));
			store.add(toDisposable(clearChatReferenceDragData));
			const targetResource = URI.parse('agent-host-copilotcli:/target');
			const sourceResource = URI.parse('agent-host-copilotcli:/source');
			const backendResource = URI.parse('copilotcli-chat://backend/source');
			const attachments: IChatRequestVariableEntry[] = [];
			const inputDnd = store.add(services.createInstance(ChatDragAndDrop,
				() => upcastDeepPartial<IChatWidget>({ viewModel: { model: upcastPartial<IChatModel>({ sessionResource: targetResource }) } }),
				{ attachments, addAttachments: entries => attachments.push(...entries) },
				{ overlayBackground: '', listForeground: '', listBackground: '' },
			));
			inputDnd.addOverlay(widget, widget, input);
			if (scope === 'session') {
				store.add(services.createInstance(SessionDropTarget, container, {
					findTargetView: () => ({ sessionId: 'target', gridSlotId: 'target-slot', element: container }),
				}));
			} else {
				store.add(services.createInstance(ChatGroupDropTarget, group, {
					isChatDrag: event => isSessionChatDrag(event, 'target'),
					getChatDragData: getSessionChatDragData,
					findTargetGroup: () => ({ id: 1, element: group }),
					onChatDrop: () => moves.push('chatGroup'),
				}));
			}
			const drag = new DragEvent('dragstart', { dataTransfer: new DataTransfer() });
			fillSessionChatDragData(drag, scope === 'session' ? 'source' : 'target', sourceResource);
			fillChatReferenceDragData(drag, backendResource, sourceResource, 'Source Chat');
			group.dispatchEvent(new DragEvent('dragenter', { bubbles: true, dataTransfer: drag.dataTransfer }));
			const overlayId = scope === 'session' ? '#monaco-workbench-session-drop-overlay' : '#monaco-workbench-chat-group-drop-overlay';
			const gridOverlay = container.querySelector<HTMLElement>(overlayId)!;
			assert.ok(gridOverlay);
			const bounds = input.getBoundingClientRect();
			const hit = document.elementFromPoint(bounds.left + bounds.width / 2, bounds.top + bounds.height / 2);
			const inputReceivesPointer = !!hit && input.contains(hit);
			inputContent.dispatchEvent(new DragEvent('dragenter', { bubbles: true, dataTransfer: drag.dataTransfer }));
			const removedGridOverlay = !container.querySelector(overlayId);
			inputContent.dispatchEvent(new DragEvent('dragover', { bubbles: true, cancelable: true, dataTransfer: drag.dataTransfer }));
			inputContent.dispatchEvent(new DragEvent('drop', { bubbles: true, cancelable: true, dataTransfer: drag.dataTransfer }));
			await timeout(0);
			const registered = isInputDropTarget(inputContent);
			const inputMoves = [...moves];
			transcript.dispatchEvent(new DragEvent('dragenter', { bubbles: true, dataTransfer: drag.dataTransfer }));
			const placementOverlay = container.querySelector<HTMLElement>(overlayId);
			assert.ok(placementOverlay, 'placement stays available over the transcript despite the whole-widget attachment handler');
			const transcriptBounds = transcript.getBoundingClientRect();
			const clientX = transcriptBounds.left + 10;
			const clientY = transcriptBounds.top + 80;
			const placementHit = document.elementFromPoint(clientX, clientY);
			const placementReceivesPointer = !!placementHit && placementOverlay.contains(placementHit);
			placementOverlay.dispatchEvent(new DragEvent('dragover', { bubbles: true, cancelable: true, dataTransfer: drag.dataTransfer, clientX, clientY }));
			placementOverlay.dispatchEvent(new DragEvent('drop', { bubbles: true, cancelable: true, dataTransfer: drag.dataTransfer, clientX, clientY }));
			await timeout(0);
			const transcriptIsInput = isInputDropTarget(transcript);
			inputDnd.removeOverlay(widget);
			assert.deepStrictEqual({
				inputReceivesPointer, removedGridOverlay, inputMoves, placementReceivesPointer, moves, transcriptIsInput,
				attachments: attachments.map(entry => ({ kind: entry.kind, name: entry.name, value: entry.value?.toString() })),
				registered, removed: !isInputDropTarget(inputContent),
			}, {
				inputReceivesPointer: true, removedGridOverlay: true, inputMoves: [], placementReceivesPointer: true, moves: [scope], transcriptIsInput: false,
				attachments: [{ kind: 'chatReference', name: 'Source Chat', value: backendResource.toString() }],
				registered: true, removed: true,
			});
		});
	}
});

suite('Sessions - Inbox Composer Drop Priority', () => {
	const store = ensureNoDisposablesAreLeakedInTestSuite();

	for (const enterThroughBackground of [false, true]) {
		for (const titleHeight of [0, 30]) {
			test(`attaches an image without opening an editor (background: ${enterThroughBackground}, title height: ${titleHeight})`, async () => {
				const services = workbenchInstantiationService(undefined, store);
				const attachments: IChatRequestVariableEntry[] = [];
				const image: IChatRequestVariableEntry = { kind: 'image', id: 'screenshot', name: 'Screenshot.png', value: new Uint8Array([1]), mimeType: 'image/png' };
				services.stub(IExtensionService, new class extends mock<IExtensionService>() {
					override readonly extensions = [upcastPartial<IExtensionDescription>({ enabledApiProposals: ['chatReferenceBinaryData'] })];
				}());
				services.stub(ISharedWebContentExtractorService, new class extends mock<ISharedWebContentExtractorService>() { }());
				services.stub(IChatAttachmentResolveService, new class extends mock<IChatAttachmentResolveService>() {
					override async resolveEditorAttachContext() { return image; }
				}());
				const container = $('.test-editor-part');
				container.style.cssText = 'position:fixed;left:40px;top:40px;width:400px;height:300px;';
				const group = $('.test-editor-group');
				group.style.cssText = 'position:relative;width:100%;height:100%;';
				const background = $('.test-inbox-content', undefined, 'Inbox');
				background.style.height = '180px';
				const input = $('.test-inbox-composer');
				input.style.cssText = 'position:absolute;left:20px;bottom:20px;width:360px;height:80px;';
				const inputContent = $('span', undefined, 'Input');
				input.appendChild(inputContent);
				group.append(background, input);
				container.appendChild(group);
				document.body.appendChild(container);
				store.add(toDisposable(() => container.remove()));

				const groupsView = upcastDeepPartial<IEditorGroupsView>({
					partOptions: { allowDropIntoGroup: true, showTabs: titleHeight ? 'multiple' : 'none' },
				});
				const groupView = upcastPartial<IEditorGroupView>({
					element: group, groupsView, isEmpty: false, titleHeight: { offset: titleHeight, total: titleHeight },
				});
				services.stub(IEditorGroupsService, new class extends mock<IEditorGroupsService>() {
					override get groups() { return [groupView]; }
				}());
				store.add(services.createInstance(EditorDropTarget, groupsView, container, { supportsSplitting: false }));
				const inputDnd = store.add(services.createInstance(ChatDragAndDrop,
					() => undefined,
					{ attachments, addAttachments: entries => attachments.push(...entries) },
					{ overlayBackground: '', listForeground: '', listBackground: '' },
				));
				inputDnd.addOverlay(input, input);

				const dataTransfer = new DataTransfer();
				dataTransfer.setData(DataTransfers.RESOURCES, JSON.stringify([URI.file('/Screenshot.png').toString()]));
				dataTransfer.items.add(new File(['image'], 'Screenshot.png', { type: 'image/png' }));
				const dispatch = (element: HTMLElement, type: string) => element.dispatchEvent(new DragEvent(type, { bubbles: true, cancelable: true, dataTransfer }));
				if (enterThroughBackground) {
					dispatch(background, 'dragenter');
					assert.ok(group.querySelector('#monaco-workbench-editor-drop-overlay'), 'editor placement is still available outside the input');
				}
				const bounds = input.getBoundingClientRect();
				const hit = document.elementFromPoint(bounds.left + bounds.width / 2, bounds.top + bounds.height / 2);
				const inputReceivesPointer = !!hit && input.contains(hit);
				dispatch(inputContent, 'dragenter');
				const editorOverlayIntercepted = !!group.querySelector('#monaco-workbench-editor-drop-overlay');
				dispatch(inputContent, 'dragover');
				dispatch(inputContent, 'drop');
				await timeout(0);
				dispatch(background, 'dragenter');
				const backgroundReceivesPlacement = !!group.querySelector('#monaco-workbench-editor-drop-overlay');
				dispatch(background, 'dragend');
				assert.deepStrictEqual({
					inputReceivesPointer, editorOverlayIntercepted, backgroundReceivesPlacement,
					attachments: attachments.map(entry => ({ kind: entry.kind, name: entry.name })),
					overlayRemoved: !group.querySelector('#monaco-workbench-editor-drop-overlay'),
					draggedOver: container.classList.contains('dragged-over'),
				}, {
					inputReceivesPointer: true, editorOverlayIntercepted: false, backgroundReceivesPlacement: true,
					attachments: [{ kind: 'image', name: 'Screenshot.png' }], overlayRemoved: true, draggedOver: false,
				});
			});
		}
	}
});
