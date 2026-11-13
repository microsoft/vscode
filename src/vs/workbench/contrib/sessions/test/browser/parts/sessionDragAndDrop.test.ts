/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { DataTransfers } from '../../../../../../base/browser/dnd.js';
import { $ } from '../../../../../../base/browser/dom.js';
import { timeout } from '../../../../../../base/common/async.js';
import { toDisposable } from '../../../../../../base/common/lifecycle.js';
import { isEqual } from '../../../../../../base/common/resources.js';
import { URI } from '../../../../../../base/common/uri.js';
import { mock, upcastDeepPartial, upcastPartial } from '../../../../../../base/test/common/mock.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../../base/test/common/utils.js';
import { IAgentHostConnectionsService } from '../../../../../../platform/agentHost/common/agentHostConnectionsService.js';
import { IConfigurationService } from '../../../../../../platform/configuration/common/configuration.js';
import { TestConfigurationService } from '../../../../../../platform/configuration/test/common/testConfigurationService.js';
import { clearChatReferenceDragData } from '../../../../../../platform/dnd/browser/dnd.js';
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
import { fillChatReferenceDragData, fillSessionChatDragData, getSessionChatDragData, isSessionChatDrag } from '../../../browser/dnd.js';
import { ISessionsService } from '../../../browser/sessionsService.js';
import { ISessionsManagementService } from '../../../common/sessionsManagement.js';
import '../../../../chat/browser/widget/media/chat.css';

suite('Sessions - Chat Reference Drop Priority', () => {
	const store = ensureNoDisposablesAreLeakedInTestSuite();

	const targetResource = URI.parse('agent-host-copilotcli:/target');
	const sourceResource = URI.parse('agent-host-copilotcli:/source');
	const otherHostResource = URI.parse('agent-host-copilotcli:/other-host');
	const backendResource = URI.parse('copilotcli-chat://backend/source');

	/** A session view whose chat widget has an input at its bottom, under a placement target for the given scope. */
	function setup(scope: 'session' | 'chatGroup') {
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
			resolveSessionResourceIdentity: resource => ({ connectionAuthority: isEqual(resource, otherHostResource) ? 'remote' : 'local', backendSession: URI.parse('opaque-session:/session') }),
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
		input.style.cssText = 'position:absolute;left:20px;bottom:20px;width:360px;height:80px;border-radius:0 0 8px 8px;';
		const inputContent = $('span', undefined, 'Input');
		input.appendChild(inputContent);
		widget.append(transcript, input);
		group.appendChild(widget);
		container.appendChild(group);
		document.body.appendChild(container);
		store.add(toDisposable(() => container.remove()));
		store.add(toDisposable(clearChatReferenceDragData));
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
		const overlayId = scope === 'session' ? '#monaco-workbench-session-drop-overlay' : '#monaco-workbench-chat-group-drop-overlay';
		const inputBounds = input.getBoundingClientRect();
		const inputPoint = { clientX: inputBounds.left + inputBounds.width / 2, clientY: inputBounds.top + inputBounds.height / 2 };
		const transcriptBounds = transcript.getBoundingClientRect();
		const transcriptPoint = { clientX: transcriptBounds.left + 10, clientY: transcriptBounds.top + 80 };
		/** A drag of a chat, of the source session or of the target session as `scope` drags, that references `clientResource`. */
		const drag = (clientResource: URI) => {
			const event = new DragEvent('dragstart', { dataTransfer: new DataTransfer() });
			fillSessionChatDragData(event, scope === 'session' ? 'source' : 'target', clientResource);
			fillChatReferenceDragData(event, backendResource, clientResource, 'Source Chat');
			return event.dataTransfer!;
		};
		const dispatch = (element: HTMLElement, type: string, dataTransfer: DataTransfer, point = inputPoint) => element.dispatchEvent(new DragEvent(type, { bubbles: true, cancelable: true, dataTransfer, ...point }));
		return { container, widget, transcript, input, inputContent, inputDnd, attachments, moves, overlayId, inputPoint, transcriptPoint, drag, dispatch };
	}

	for (const scope of ['session', 'chatGroup'] as const) {
		test(`${scope} placement does not intercept a chat reference dropped into an input`, async () => {
			const { container, widget, transcript, input, inputContent, inputDnd, attachments, moves, overlayId, inputPoint, transcriptPoint, drag, dispatch } = setup(scope);
			const dataTransfer = drag(sourceResource);
			dispatch(transcript, 'dragenter', dataTransfer, transcriptPoint);
			const gridOverlay = container.querySelector<HTMLElement>(overlayId)!;
			assert.ok(gridOverlay);
			const coveringHit = document.elementFromPoint(inputPoint.clientX, inputPoint.clientY);
			const gridCoversInput = !!coveringHit && gridOverlay.contains(coveringHit);
			const inputHints = [...gridOverlay.querySelectorAll<HTMLElement>('.input-drop-target-hint')].map(hint => ({ text: hint.textContent, top: hint.style.top, height: hint.style.height, borderRadius: hint.style.borderRadius }));
			dispatch(gridOverlay, 'dragover', dataTransfer);
			const removedGridOverlay = !container.querySelector(overlayId);
			const hit = document.elementFromPoint(inputPoint.clientX, inputPoint.clientY);
			const inputReceivesPointer = !!hit && input.contains(hit);
			dispatch(inputContent, 'dragenter', dataTransfer);
			const gridOverlayReturned = !!container.querySelector(overlayId);
			dispatch(inputContent, 'dragover', dataTransfer);
			const inputOverlay = widget.querySelector<HTMLElement>('.chat-dnd-overlay')!;
			const inputFeedback = { visible: inputOverlay.classList.contains('visible'), top: inputOverlay.style.top, height: inputOverlay.style.height, borderRadius: inputOverlay.style.borderRadius };
			const registered = isInputDropTarget(inputContent, new DragEvent('dragover', { dataTransfer }));
			dispatch(inputContent, 'drop', dataTransfer);
			await timeout(0);
			const inputMoves = [...moves];
			dispatch(transcript, 'dragenter', dataTransfer, transcriptPoint);
			const placementOverlay = container.querySelector<HTMLElement>(overlayId);
			assert.ok(placementOverlay, 'placement stays available over the transcript despite the whole-widget attachment handler');
			const placementHit = document.elementFromPoint(transcriptPoint.clientX, transcriptPoint.clientY);
			const placementReceivesPointer = !!placementHit && placementOverlay.contains(placementHit);
			dispatch(placementOverlay, 'dragover', dataTransfer, transcriptPoint);
			dispatch(placementOverlay, 'drop', dataTransfer, transcriptPoint);
			await timeout(0);
			const transcriptIsInput = isInputDropTarget(transcript, new DragEvent('dragover', { dataTransfer, ...transcriptPoint }));
			inputDnd.removeOverlay(widget);
			assert.deepStrictEqual({
				gridCoversInput, inputHints, removedGridOverlay, inputReceivesPointer, gridOverlayReturned, inputFeedback, inputMoves, placementReceivesPointer, moves, transcriptIsInput,
				attachments: attachments.map(entry => ({ kind: entry.kind, name: entry.name, value: entry.value?.toString() })),
				registered, removed: !isInputDropTarget(inputContent, new DragEvent('dragover', { dataTransfer })),
			}, {
				// The placement covers the input, and shows where it is, until the drag moves over the input, which then takes it.
				gridCoversInput: true, inputHints: [{ text: 'Drag here to attach to chat', top: '200px', height: '80px', borderRadius: '0px 0px 8px 8px' }],
				removedGridOverlay: true, inputReceivesPointer: true, gridOverlayReturned: false,
				// The feedback covers the input, shaped as it is, which takes the drop, not the transcript, whose drop the placement takes.
				inputFeedback: { visible: true, top: '200px', height: '80px', borderRadius: '0px 0px 8px 8px' },
				inputMoves: [], placementReceivesPointer: true, moves: [scope], transcriptIsInput: false,
				attachments: [{ kind: 'chatReference', name: 'Source Chat', value: backendResource.toString() }],
				registered: true, removed: true,
			});
		});

		test(`${scope} placement covers an input that does not take the drag, such as a chat of another agent host, and takes its drop`, async () => {
			const { container, inputContent, attachments, moves, overlayId, drag, dispatch } = setup(scope);
			const dataTransfer = drag(otherHostResource);
			dispatch(inputContent, 'dragenter', dataTransfer);
			const placementOverlay = container.querySelector<HTMLElement>(overlayId);
			assert.ok(placementOverlay);
			const inputHints = placementOverlay.querySelectorAll('.input-drop-target-hint').length;
			dispatch(placementOverlay, 'dragover', dataTransfer);
			dispatch(placementOverlay, 'drop', dataTransfer);
			await timeout(0);
			assert.deepStrictEqual({ inputHints, moves, attachments }, { inputHints: 0, moves: [scope], attachments: [] });
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
				const bounds = input.getBoundingClientRect();
				const inputPoint = { clientX: bounds.left + bounds.width / 2, clientY: bounds.top + bounds.height / 2 };
				const dispatch = (element: HTMLElement, type: string, point?: { clientX: number; clientY: number }) => element.dispatchEvent(new DragEvent(type, { bubbles: true, cancelable: true, dataTransfer, ...point }));
				if (enterThroughBackground) {
					dispatch(background, 'dragenter');
					const editorOverlay = group.querySelector<HTMLElement>('#monaco-workbench-editor-drop-overlay');
					assert.ok(editorOverlay, 'editor placement is still available outside the input');
					// The placement covers the input until the drag moves over it
					dispatch(editorOverlay, 'dragover', inputPoint);
				}
				const hit = document.elementFromPoint(inputPoint.clientX, inputPoint.clientY);
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

suite('Chat Editor Drop Feedback', () => {
	const store = ensureNoDisposablesAreLeakedInTestSuite();

	test('while the key to drop into the editor lets the drag through, the chat shows its feedback on the input, as with the drag over it', () => {
		const services = workbenchInstantiationService(undefined, store);
		services.stub(IConfigurationService, new TestConfigurationService({ 'editor.dropIntoEditor.enabled': true }));
		services.stub(IExtensionService, new class extends mock<IExtensionService>() { }());
		services.stub(ISharedWebContentExtractorService, new class extends mock<ISharedWebContentExtractorService>() { }());
		services.stub(IChatAttachmentResolveService, new class extends mock<IChatAttachmentResolveService>() { }());

		// An editor area with a chat editor, whose chat widget takes drags anywhere, and has an input at its bottom
		const container = $('.test-editor-part');
		container.style.cssText = 'position:fixed;left:0;top:0;width:400px;height:300px;';
		const widget = $('.interactive-session');
		widget.style.cssText = 'position:relative;width:100%;height:100%;';
		const transcript = $('.test-transcript', undefined, 'Transcript');
		transcript.style.height = '180px';
		const input = $('.test-chat-input');
		input.style.cssText = 'position:absolute;left:20px;bottom:20px;width:360px;height:80px;';
		widget.append(transcript, input);
		container.appendChild(widget);
		document.body.appendChild(container);
		store.add(toDisposable(() => container.remove()));
		store.add(services.createInstance(EditorDropTarget, upcastDeepPartial<IEditorGroupsView>({ partOptions: { allowDropIntoGroup: true } }), container, {}));
		const inputDnd = store.add(services.createInstance(ChatDragAndDrop,
			() => undefined,
			{ attachments: [], addAttachments: () => { } },
			{ overlayBackground: '', listForeground: '', listBackground: '' },
		));
		inputDnd.addOverlay(widget, widget, input);

		const dataTransfer = new DataTransfer();
		dataTransfer.setData(DataTransfers.RESOURCES, JSON.stringify([URI.file('/README.md').toString()]));
		const bounds = transcript.getBoundingClientRect();
		const dispatch = (type: string, shiftKey: boolean) => transcript.dispatchEvent(new DragEvent(type, { bubbles: true, cancelable: true, dataTransfer, clientX: bounds.left + 10, clientY: bounds.top + 80, shiftKey }));
		const dragOverTranscript = (shiftKey: boolean) => {
			dispatch('dragover', shiftKey);
			const overlay = widget.querySelector<HTMLElement>('.chat-dnd-overlay')!;
			return { visible: overlay.classList.contains('visible'), top: overlay.style.top, left: overlay.style.left, width: overlay.style.width, height: overlay.style.height };
		};

		dispatch('dragenter', true);
		const notLetThrough = dragOverTranscript(false);
		const held = dragOverTranscript(true);
		const released = dragOverTranscript(false);
		dispatch('dragleave', false);
		const nextDrag = dragOverTranscript(false);

		const overInput = { visible: true, top: '200px', left: '20px', width: '360px', height: '80px' };
		const overChat = { visible: true, top: '', left: '', width: '', height: '' };
		assert.deepStrictEqual({ notLetThrough, held, released, nextDrag }, {
			// A drag that reaches the chat otherwise, such as one that the editor area does not take, shows over the whole chat
			notLetThrough: overChat,
			// The input takes the drag let through, also once the key is released, until the drag leaves
			held: overInput, released: overInput, nextDrag: overChat,
		});
	});
});
