/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { DataTransfers } from '../../../../../../base/browser/dnd.js';
import { $ } from '../../../../../../base/browser/dom.js';
import { mainWindow } from '../../../../../../base/browser/window.js';
import { timeout } from '../../../../../../base/common/async.js';
import { toDisposable } from '../../../../../../base/common/lifecycle.js';
import { constObservable } from '../../../../../../base/common/observable.js';
import { isMacintosh } from '../../../../../../base/common/platform.js';
import { isEqual } from '../../../../../../base/common/resources.js';
import { URI } from '../../../../../../base/common/uri.js';
import { mock, upcastDeepPartial, upcastPartial } from '../../../../../../base/test/common/mock.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../../base/test/common/utils.js';
import { IAgentHostConnectionsService } from '../../../../../../platform/agentHost/common/agentHostConnectionsService.js';
import { IConfigurationService } from '../../../../../../platform/configuration/common/configuration.js';
import { TestConfigurationService } from '../../../../../../platform/configuration/test/common/testConfigurationService.js';
import { clearChatReferenceDragData, LocalSelectionTransfer } from '../../../../../../platform/dnd/browser/dnd.js';
import { IExtensionDescription } from '../../../../../../platform/extensions/common/extensions.js';
import { ISharedWebContentExtractorService } from '../../../../../../platform/webContentExtractor/common/webContentExtractor.js';
import { IExtensionService } from '../../../../../services/extensions/common/extensions.js';
import { IChatWidget } from '../../../../chat/browser/chat.js';
import { IChatAttachmentResolveService } from '../../../../chat/browser/attachments/chatAttachmentResolveService.js';
import { ChatDragAndDrop } from '../../../../chat/browser/widget/chatDragAndDrop.js';
import { IChatRequestVariableEntry } from '../../../../chat/common/attachments/chatVariableEntries.js';
import { IChatModel } from '../../../../chat/common/model/chatModel.js';
import { DraggedEditorIdentifier, isInputDropTarget } from '../../../../../browser/dnd.js';
import { IEditorGroupsView, IEditorGroupView } from '../../../../../browser/parts/editor/editor.js';
import { EditorDropTarget } from '../../../../../browser/parts/editor/editorDropTarget.js';
import { IEditorGroup, IEditorGroupsService } from '../../../../../services/editor/common/editorGroupsService.js';
import { EditorInput } from '../../../../../common/editor/editorInput.js';
import { GroupIdentifier } from '../../../../../common/editor.js';
import { IChat, ISession, SessionStatus } from '../../../../../services/sessions/common/session.js';
import { ISessionGridPane, SessionGridPaneKind } from '../../../../../services/sessions/browser/sessionGridPane.js';
import { workbenchInstantiationService } from '../../../../../test/browser/workbenchTestServices.js';
import { ChatGroupDropTarget } from '../../../browser/parts/chatGroupDropTarget.js';
import { SessionDropTarget } from '../../../browser/parts/sessionDropTarget.js';
import { SessionChatDropTarget } from '../../../browser/parts/sessionChatDropTarget.js';
import { DraggedSessionIdentifier, fillChatReferenceDragData, fillSessionChatDragData, getSessionChatDragData, isSessionChatDrag } from '../../../browser/dnd.js';
import { ISessionsService, SessionGridDirection } from '../../../browser/sessionsService.js';
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
		// The size of the body type, which the window sets, and a chat type size, which the chat sets from `chat.fontSize`, that differ
		container.style.cssText = 'position:fixed;left:0;top:0;width:400px;height:300px;--vscode-fontSize-body1:13px;';
		const group = $('.chat-group-view');
		group.style.cssText = 'position:relative;width:100%;height:100%;';
		const widget = $('.interactive-session');
		widget.style.cssText = 'position:relative;width:100%;height:100%;font-size:20px;';
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
		const dispatch = (element: HTMLElement, type: string, dataTransfer: DataTransfer, init: DragEventInit = inputPoint) => element.dispatchEvent(new DragEvent(type, { bubbles: true, cancelable: true, dataTransfer, ...init }));
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
			const labelFontSize = (element: HTMLElement) => mainWindow.getComputedStyle(element.querySelector<HTMLElement>('.drop-overlay-label')!).fontSize;
			const inputHints = [...gridOverlay.querySelectorAll<HTMLElement>('.input-drop-target-hint')].map(hint => ({ text: hint.textContent, fontSize: labelFontSize(hint), top: hint.style.top, height: hint.style.height, borderRadius: hint.style.borderRadius }));
			dispatch(gridOverlay, 'dragover', dataTransfer);
			const removedGridOverlay = !container.querySelector(overlayId);
			const hit = document.elementFromPoint(inputPoint.clientX, inputPoint.clientY);
			const inputReceivesPointer = !!hit && input.contains(hit);
			dispatch(inputContent, 'dragenter', dataTransfer);
			const gridOverlayReturned = !!container.querySelector(overlayId);
			dispatch(inputContent, 'dragover', dataTransfer);
			const inputOverlay = widget.querySelector<HTMLElement>('.chat-dnd-overlay')!;
			const inputFeedback = { visible: inputOverlay.classList.contains('visible'), text: inputOverlay.textContent, fontSize: labelFontSize(inputOverlay), top: inputOverlay.style.top, height: inputOverlay.style.height, borderRadius: inputOverlay.style.borderRadius };
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
				// The placement covers the input, and shows where it is, until the drag moves over the input, which then takes it;
				// the drag is over the chat, which the key held lets it through to.
				gridCoversInput: true, inputHints: [{ text: `Drag here or hold ${isMacintosh ? '⇧' : 'Shift'} to attach to chat`, fontSize: '13px', top: '200px', height: '80px', borderRadius: '0px 0px 8px 8px' }],
				removedGridOverlay: true, inputReceivesPointer: true, gridOverlayReturned: false,
				// The feedback covers the input, shaped as it is, which takes the drop, not the transcript, whose drop the placement takes;
				// it says what the hint over the input said, at its size, though the chat's type is larger.
				inputFeedback: { visible: true, text: `Drag here or hold ${isMacintosh ? '⇧' : 'Shift'} to attach to chat`, fontSize: '13px', top: '200px', height: '80px', borderRadius: '0px 0px 8px 8px' },
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

		test(`${scope} placement lets the drag through to the chat while the key is held over it, whose input attaches it, as in a chat editor`, async () => {
			const { container, widget, transcript, attachments, moves, overlayId, transcriptPoint, drag, dispatch } = setup(scope);
			const dataTransfer = drag(sourceResource);
			const held = { ...transcriptPoint, shiftKey: true };
			dispatch(transcript, 'dragenter', dataTransfer, transcriptPoint);
			const placementOverlay = container.querySelector<HTMLElement>(overlayId)!;
			const inputHints = [...placementOverlay.querySelectorAll<HTMLElement>('.input-drop-target-hint')].map(hint => hint.textContent);
			dispatch(placementOverlay, 'dragover', dataTransfer, held);
			const overlayWhileHeld = !!container.querySelector(overlayId);
			dispatch(transcript, 'dragenter', dataTransfer, held);
			const overlayOnEnterWhileHeld = !!container.querySelector(overlayId);
			dispatch(transcript, 'dragover', dataTransfer, held);
			const inputOverlay = widget.querySelector<HTMLElement>('.chat-dnd-overlay')!;
			const inputFeedback = { visible: inputOverlay.classList.contains('visible'), text: inputOverlay.textContent, top: inputOverlay.style.top, height: inputOverlay.style.height };
			dispatch(transcript, 'drop', dataTransfer, held);
			await timeout(0);
			assert.deepStrictEqual({
				inputHints, overlayWhileHeld, overlayOnEnterWhileHeld, inputFeedback, moves,
				attachments: attachments.map(entry => ({ kind: entry.kind, value: entry.value?.toString() })),
			}, {
				inputHints: [`Drag here or hold ${isMacintosh ? '⇧' : 'Shift'} to attach to chat`],
				overlayWhileHeld: false, overlayOnEnterWhileHeld: false,
				// The chat fits its feedback to the input, which takes the drop, as the drag is let through to it, and says what the hint said
				inputFeedback: { visible: true, text: `Drag here or hold ${isMacintosh ? '⇧' : 'Shift'} to attach to chat`, top: '200px', height: '80px' },
				moves: [], attachments: [{ kind: 'chatReference', value: backendResource.toString() }],
			});
		});

		test(`${scope} placement takes the drag once the input moves away under it, rather than the chat covering itself`, () => {
			const { container, widget, input, inputContent, overlayId, inputPoint, drag, dispatch } = setup(scope);
			const dataTransfer = drag(sourceResource);
			dispatch(inputContent, 'dragenter', dataTransfer);
			dispatch(inputContent, 'dragover', dataTransfer);
			const inputOverlay = widget.querySelector<HTMLElement>('.chat-dnd-overlay')!;
			const feedback = () => ({ visible: inputOverlay.classList.contains('visible'), hint: inputOverlay.classList.contains('chat-dnd-overlay-input-hint'), top: inputOverlay.style.top });
			const overInput = feedback();
			// The input moves up, as when what is docked on it changes, while the drag rests on the feedback where the input was
			input.style.bottom = '120px';
			dispatch(inputOverlay, 'dragover', dataTransfer);
			const inputMovedAway = feedback();
			// The drag is over what the feedback covered then
			dispatch(widget, 'dragenter', dataTransfer);
			assert.deepStrictEqual({ overInput, inputMovedAway, dragOffInput: inputPoint.clientY > input.getBoundingClientRect().bottom, placement: !!container.querySelector(overlayId) }, {
				overInput: { visible: true, hint: false, top: '200px' },
				// The feedback moves with the input, where it only shows that the input takes the drag, off the drag
				inputMovedAway: { visible: true, hint: true, top: '100px' },
				dragOffInput: true, placement: true,
			});
		});
	}

	test('a chat that takes drops on its whole view, such as the Chat view\'s, attaches a dragged session on its input only, or anywhere on the chat while the key is held, and leaves it to what is beside the chat, such as a sessions list; a file anywhere while its input shows', async () => {
		const services = workbenchInstantiationService(undefined, store);
		services.stub(IExtensionService, new class extends mock<IExtensionService>() { }());
		services.stub(ISharedWebContentExtractorService, new class extends mock<ISharedWebContentExtractorService>() { }());
		services.stub(IChatAttachmentResolveService, new class extends mock<IChatAttachmentResolveService>() {
			override async resolveEditorAttachContext(): Promise<IChatRequestVariableEntry> {
				return { kind: 'file', id: 'file', name: 'notes.md', value: URI.file('/notes.md') };
			}
		}());
		services.stub(IAgentHostConnectionsService, upcastPartial<IAgentHostConnectionsService>({
			resolveSessionResourceIdentity: () => ({ connectionAuthority: 'local', backendSession: URI.parse('opaque-session:/session') }),
		}));
		// A view with a chat, whose input is at its bottom, and a sessions list beside it
		const view = $('.test-chat-view');
		view.style.cssText = 'position:fixed;left:0;top:0;width:600px;height:300px;';
		const chat = $('.test-chat');
		chat.style.cssText = 'position:absolute;left:0;top:0;width:400px;height:300px;';
		const background = $('.test-transcript', undefined, 'Transcript');
		background.style.height = '180px';
		const input = $('.test-chat-input');
		input.style.cssText = 'position:absolute;left:20px;bottom:20px;width:360px;height:80px;';
		chat.append(background, input);
		const list = $('.test-sessions-list', undefined, 'Sessions');
		list.style.cssText = 'position:absolute;left:400px;top:0;width:200px;height:300px;';
		view.append(chat, list);
		document.body.appendChild(view);
		store.add(toDisposable(() => view.remove()));
		store.add(toDisposable(clearChatReferenceDragData));
		const attachments: IChatRequestVariableEntry[] = [];
		const inputDnd = store.add(services.createInstance(ChatDragAndDrop,
			() => upcastDeepPartial<IChatWidget>({ viewModel: { model: upcastPartial<IChatModel>({ sessionResource: targetResource }) } }),
			{ attachments, addAttachments: entries => attachments.push(...entries) },
			{ overlayBackground: '', listForeground: '', listBackground: '' },
		));
		inputDnd.addOverlay(view, view, input, chat);

		const inputBounds = input.getBoundingClientRect();
		const inputPoint = { clientX: inputBounds.left + inputBounds.width / 2, clientY: inputBounds.top + inputBounds.height / 2 };
		const backgroundPoint = { clientX: 200, clientY: 80 };
		const listPoint = { clientX: 500, clientY: 80 };
		const overlay = view.querySelector<HTMLElement>('.chat-dnd-overlay')!;
		const dispatch = (element: HTMLElement, type: string, dataTransfer: DataTransfer, point: { clientX: number; clientY: number; shiftKey?: boolean }) => element.dispatchEvent(new DragEvent(type, { bubbles: true, cancelable: true, dataTransfer, ...point }));
		const feedback = () => ({
			visible: overlay.classList.contains('visible'),
			outlined: overlay.classList.contains('input-drop-target-outline'),
			hint: overlay.classList.contains('chat-dnd-overlay-input-hint'),
			text: overlay.textContent,
		});
		const dragOver = (element: HTMLElement, dataTransfer: DataTransfer, point: { clientX: number; clientY: number; shiftKey?: boolean }) => {
			dispatch(element, 'dragover', dataTransfer, point);
			return feedback();
		};

		const hint = `Drag here or hold ${isMacintosh ? '⇧' : 'Shift'} to attach to chat`;
		// A session dragged from the sessions list of another window, which nothing around the chat places
		const sessionDrag = new DragEvent('dragstart', { dataTransfer: new DataTransfer() });
		fillChatReferenceDragData(sessionDrag, backendResource, sourceResource, 'Source Chat');
		const session = sessionDrag.dataTransfer!;
		const sessionOverBackground = dragOver(background, session, backgroundPoint);
		// What is under the drag as it moves onto the input: the input, not the hint, which the input's feedback replaces then
		const hit = document.elementFromPoint(inputPoint.clientX, inputPoint.clientY);
		const inputUnderHint = !!hit && input.contains(hit);
		const sessionOverInput = dragOver(input, session, inputPoint);
		const sessionBackOnBackground = dragOver(background, session, backgroundPoint);
		// Dropped off the input, which a window does not do as the drag shows it takes no drop there
		dispatch(background, 'drop', session, backgroundPoint);
		await timeout(0);
		const sessionDroppedOnBackground = feedback();
		dispatch(background, 'dragleave', session, backgroundPoint);
		// Over the sessions list beside the chat, which takes the drag itself
		dragOver(background, session, backgroundPoint);
		const sessionOverList = dragOver(list, session, listPoint);
		dispatch(list, 'dragleave', session, listPoint);
		// With the key held over the chat away from the input, which then takes it, also once the key is released
		const sessionHeldOnBackground = dragOver(background, session, { ...backgroundPoint, shiftKey: true });
		const sessionReleasedOnBackground = dragOver(background, session, backgroundPoint);
		dispatch(background, 'drop', session, backgroundPoint);
		await timeout(0);
		clearChatReferenceDragData();

		const file = new DataTransfer();
		file.setData(DataTransfers.RESOURCES, JSON.stringify([URI.file('/notes.md').toString()]));
		const fileOverBackground = dragOver(background, file, backgroundPoint);
		dispatch(background, 'drop', file, backgroundPoint);
		await timeout(0);

		// The input does not show, such as while an empty state replaces it
		input.style.display = 'none';
		const fileWhileInputHidden = dragOver(background, file, backgroundPoint);

		assert.deepStrictEqual({
			sessionOverBackground, inputUnderHint, sessionOverInput, sessionBackOnBackground, sessionDroppedOnBackground, sessionOverList, sessionHeldOnBackground, sessionReleasedOnBackground, fileOverBackground, fileWhileInputHidden,
			attachments: attachments.map(entry => ({ kind: entry.kind, name: entry.name })),
		}, {
			// The session is not taken off the input, which shows there that it takes it, and says the same once it does
			sessionOverBackground: { visible: true, outlined: true, hint: true, text: hint },
			inputUnderHint: true,
			sessionOverInput: { visible: true, outlined: true, hint: false, text: hint },
			sessionBackOnBackground: { visible: true, outlined: true, hint: true, text: hint },
			sessionDroppedOnBackground: { visible: false, outlined: true, hint: false, text: '' },
			sessionOverList: { visible: false, outlined: true, hint: false, text: '' },
			// The key held lets the drag through to the input, as a pane around the chat would
			sessionHeldOnBackground: { visible: true, outlined: true, hint: false, text: ' Attach Chat as Context' },
			sessionReleasedOnBackground: { visible: true, outlined: true, hint: false, text: ' Attach Chat as Context' },
			// The file is taken anywhere on the view, while the input shows
			fileOverBackground: { visible: true, outlined: false, hint: false, text: ' Attach Folder as Context' },
			fileWhileInputHidden: { visible: false, outlined: false, hint: false, text: '' },
			attachments: [{ kind: 'chatReference', name: 'Source Chat' }, { kind: 'file', name: 'notes.md' }],
		});
	});
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

suite('Sessions - Session Drop Zones', () => {
	const store = ensureNoDisposablesAreLeakedInTestSuite();

	/**
	 * Drags the sessions `dragged` over a 400x300 view of the session `target`, and drops them at `x`, `y`. The grid shows
	 * the sessions `inGrid` in slots of their own, the target's included when it is listed, and those of them in `drafts` as drafts.
	 */
	function dropAt(dragged: readonly string[], x: number, y: number, inGrid: readonly string[] = [], drafts: readonly string[] = []) {
		const services = workbenchInstantiationService(undefined, store);
		const opened: string[] = [];
		const slotPanes = inGrid.map(id => upcastPartial<ISessionGridPane>({ id: `${id}-slot`, kind: SessionGridPaneKind.Slot, session: constObservable(upcastPartial<ISession>({ sessionId: id, status: constObservable(drafts.includes(id) ? SessionStatus.Untitled : SessionStatus.Completed) })) }));
		services.stub(ISessionsService, new class extends mock<ISessionsService>() {
			override readonly slotPanes: ISessionsService['slotPanes'] = constObservable(slotPanes);
			override async openSessionInSlot(session: ISession, targetSessionId: string | undefined): Promise<void> {
				opened.push(`${session.sessionId} in ${targetSessionId}`);
			}
			override async openSessionsAt(sessions: readonly ISession[], referenceSessionId: string | undefined, direction: SessionGridDirection): Promise<void> {
				opened.push(`${sessions.map(session => session.sessionId).join(',')} ${direction} of ${referenceSessionId}`);
			}
			override swapPanes(first: ISessionGridPane, second: ISessionGridPane): void {
				opened.push(`${first.session.get()?.sessionId} swaps with ${second.session.get()?.sessionId}`);
			}
			override focusActiveSession(): void { opened.push('focus'); }
		}());
		services.stub(ISessionsManagementService, new class extends mock<ISessionsManagementService>() {
			override getSession(resource: URI): ISession {
				return upcastPartial<ISession>({ sessionId: resource.path.slice(1), resource });
			}
		}());
		const container = $('.session-view');
		container.style.cssText = 'position:fixed;left:0;top:0;width:400px;height:300px;';
		document.body.appendChild(container);
		store.add(toDisposable(() => container.remove()));
		store.add(services.createInstance(SessionDropTarget, container, {
			findTargetView: () => ({ sessionId: 'target', gridSlotId: 'target-slot', element: container }),
		}));
		const transfer = LocalSelectionTransfer.getInstance<DraggedSessionIdentifier>();
		transfer.setData(dragged.map(id => new DraggedSessionIdentifier(id, URI.parse(`test-session:/${id}`))), DraggedSessionIdentifier.prototype);
		store.add(toDisposable(() => transfer.clearData(DraggedSessionIdentifier.prototype)));

		const init: DragEventInit = { bubbles: true, cancelable: true, dataTransfer: new DataTransfer(), clientX: x, clientY: y };
		container.dispatchEvent(new DragEvent('dragenter', init));
		const overlay = container.querySelector<HTMLElement>('#monaco-workbench-session-drop-overlay')!;
		overlay.dispatchEvent(new DragEvent('dragover', init));
		const indicator = overlay.querySelector<HTMLElement>('.session-drop-overlay-indicator')!;
		const shown = { left: indicator.style.left, top: indicator.style.top, width: indicator.style.width, height: indicator.style.height };
		overlay.dispatchEvent(new DragEvent('drop', init));
		return { shown, opened };
	}

	test('one session dropped in the middle of a view opens in it, in place of what it shows, or swaps places with it when another slot shows it, a draft too; near an edge it opens beside it; several only open beside it', () => {
		const whole = { left: '0px', top: '0px', width: '100%', height: '100%' };
		const leftHalf = { left: '0px', top: '0px', width: '50%', height: '100%' };
		assert.deepStrictEqual({
			middle: dropAt(['dragged'], 200, 150),
			nearEdge: dropAt(['dragged'], 60, 150),
			several: dropAt(['a', 'b'], 200, 150),
			shownMiddle: dropAt(['dragged'], 200, 150, ['dragged', 'target']),
			shownNearEdge: dropAt(['dragged'], 60, 150, ['dragged', 'target']),
			draftMiddle: dropAt(['dragged'], 200, 150, ['dragged', 'target'], ['dragged']),
			targetOnlyMiddle: dropAt(['dragged'], 200, 150, ['target']),
		}, {
			middle: { shown: whole, opened: ['dragged in target'] },
			nearEdge: { shown: leftHalf, opened: ['dragged left of target'] },
			several: { shown: leftHalf, opened: ['a,b left of target'] },
			shownMiddle: { shown: whole, opened: ['dragged swaps with target', 'focus'] },
			shownNearEdge: { shown: leftHalf, opened: ['dragged left of target'] },
			draftMiddle: { shown: whole, opened: ['dragged swaps with target', 'focus'] },
			targetOnlyMiddle: { shown: whole, opened: ['dragged in target'] },
		});
	});
});

suite('Sessions - Session Chat Drop Target', () => {
	const store = ensureNoDisposablesAreLeakedInTestSuite();

	test('a session dropped on a chat opens its chat where the delegate says, and the session of the chat shown is not offered; nor is a chat whose editor moves within the window, such as one dragged by its header, which the editor part moves', () => {
		const services = workbenchInstantiationService(undefined, store);
		// Group 1 shows in the window of the chat, group 2 in another
		services.stub(IEditorGroupsService, new class extends mock<IEditorGroupsService>() {
			override getGroup(group: GroupIdentifier) {
				return upcastPartial<IEditorGroup>({ id: group, windowId: group === 1 ? mainWindow.vscodeWindowId : mainWindow.vscodeWindowId + 1 });
			}
		}());
		services.stub(ISessionsManagementService, new class extends mock<ISessionsManagementService>() {
			override getSession(resource: URI): ISession {
				const chat = upcastPartial<IChat>({ resource: URI.parse(`test-chat:${resource.path}`), isArchived: constObservable(false) });
				return upcastPartial<ISession>({ sessionId: resource.path.slice(1), resource, loading: constObservable(false), chats: constObservable([chat]), mainChat: constObservable(chat) });
			}
			override getSessionForChatResource(resource: URI) {
				const session = this.getSession(URI.parse(`test-session:${resource.path}`));
				return { session, chat: session.mainChat.get() };
			}
		}());
		const element = $('.test-chat');
		element.style.cssText = 'position:fixed;left:0;top:0;width:400px;height:300px;';
		document.body.appendChild(element);
		store.add(toDisposable(() => element.remove()));
		const opened: string[] = [];
		store.add(services.createInstance(SessionChatDropTarget, element, {
			chat: () => URI.parse('test-chat:/shown'),
			open: chats => opened.push(...chats.map(chat => chat.toString())),
		}));
		const transfer = LocalSelectionTransfer.getInstance<DraggedSessionIdentifier>();
		store.add(toDisposable(() => transfer.clearData(DraggedSessionIdentifier.prototype)));
		const editorTransfer = LocalSelectionTransfer.getInstance<DraggedEditorIdentifier>();
		store.add(toDisposable(() => editorTransfer.clearData(DraggedEditorIdentifier.prototype)));
		const dropSession = (id: string, editorGroup?: GroupIdentifier) => {
			const init: DragEventInit = { bubbles: true, cancelable: true, dataTransfer: new DataTransfer(), clientX: 200, clientY: 150 };
			if (editorGroup === undefined) {
				transfer.setData([new DraggedSessionIdentifier(id, URI.parse(`test-session:/${id}`))], DraggedSessionIdentifier.prototype);
			} else {
				// A chat dragged by its header, which drags its editor in the group too
				editorTransfer.setData([new DraggedEditorIdentifier({ editor: upcastPartial<EditorInput>({}), groupId: editorGroup })], DraggedEditorIdentifier.prototype);
				fillSessionChatDragData(new DragEvent('dragstart', { dataTransfer: init.dataTransfer }), id, URI.parse(`test-chat:/${id}`));
			}
			element.dispatchEvent(new DragEvent('dragenter', init));
			const overlay = element.querySelector<HTMLElement>('.session-chat-drop-overlay');
			overlay?.dispatchEvent(new DragEvent('drop', init));
			return !!overlay;
		};
		assert.deepStrictEqual({ other: dropSession('other'), shown: dropSession('shown'), headerOfWindow: dropSession('header', 1), fromOtherWindow: dropSession('moved', 2), opened }, {
			other: true, shown: false, headerOfWindow: false, fromOtherWindow: true, opened: ['test-chat:/other', 'test-chat:/moved'],
		});
	});

	test('in a chat whose drop area holds it, such as the Chat view\'s, the drag that moves from the overlay onto the input keeps what the hint said, and leaves the chat as it enters it', () => {
		const targetResource = URI.parse('agent-host-copilotcli:/target');
		const sourceResource = URI.parse('agent-host-copilotcli:/source');
		const backendResource = URI.parse('copilotcli-chat://backend/source');
		const services = workbenchInstantiationService(undefined, store);
		services.stub(ISessionsManagementService, new class extends mock<ISessionsManagementService>() {
			override getSession(resource: URI): ISession {
				const chat = upcastPartial<IChat>({ resource: sourceResource, isArchived: constObservable(false) });
				return upcastPartial<ISession>({ sessionId: 'source', resource, loading: constObservable(false), chats: constObservable([chat]), mainChat: constObservable(chat) });
			}
		}());
		services.stub(IExtensionService, new class extends mock<IExtensionService>() { }());
		services.stub(ISharedWebContentExtractorService, new class extends mock<ISharedWebContentExtractorService>() { }());
		services.stub(IChatAttachmentResolveService, new class extends mock<IChatAttachmentResolveService>() { }());
		services.stub(IAgentHostConnectionsService, upcastPartial<IAgentHostConnectionsService>({
			resolveSessionResourceIdentity: () => ({ connectionAuthority: 'local', backendSession: URI.parse('opaque-session:/session') }),
		}));
		// A window whose Chat view takes attachments anywhere, and whose chat, beside a sessions list, opens dropped sessions
		const workbench = $('.monaco-workbench');
		workbench.style.cssText = 'position:fixed;left:0;top:0;width:600px;height:300px;';
		const view = $('.test-chat-view');
		view.style.cssText = 'position:absolute;inset:0;';
		const chat = $('.test-chat');
		chat.style.cssText = 'position:absolute;left:0;top:0;width:400px;height:300px;';
		const transcript = $('.test-transcript', undefined, 'Transcript');
		transcript.style.height = '180px';
		const input = $('.test-chat-input');
		input.style.cssText = 'position:absolute;left:20px;bottom:20px;width:360px;height:80px;';
		chat.append(transcript, input);
		view.append(chat, $('.test-sessions-list'));
		workbench.appendChild(view);
		document.body.appendChild(workbench);
		store.add(toDisposable(() => workbench.remove()));
		store.add(toDisposable(clearChatReferenceDragData));
		const inputDnd = store.add(services.createInstance(ChatDragAndDrop,
			() => upcastDeepPartial<IChatWidget>({ viewModel: { model: upcastPartial<IChatModel>({ sessionResource: targetResource }) } }),
			{ attachments: [], addAttachments: () => { } },
			{ overlayBackground: '', listForeground: '', listBackground: '' },
		));
		inputDnd.addOverlay(view, view, input, chat);
		store.add(services.createInstance(SessionChatDropTarget, chat, { chat: () => targetResource, open: () => { } }));
		const transfer = LocalSelectionTransfer.getInstance<DraggedSessionIdentifier>();
		transfer.setData([new DraggedSessionIdentifier('source', URI.parse('test-session:/source'))], DraggedSessionIdentifier.prototype);
		store.add(toDisposable(() => transfer.clearData(DraggedSessionIdentifier.prototype)));
		const sessionDrag = new DragEvent('dragstart', { dataTransfer: new DataTransfer() });
		fillChatReferenceDragData(sessionDrag, backendResource, sourceResource, 'Source Chat');
		const dataTransfer = sessionDrag.dataTransfer!;
		const inputBounds = input.getBoundingClientRect();
		const inputPoint = { clientX: inputBounds.left + inputBounds.width / 2, clientY: inputBounds.top + inputBounds.height / 2 };
		const transcriptPoint = { clientX: 200, clientY: 80 };
		const dispatch = (element: HTMLElement, type: string, point: { clientX: number; clientY: number }) => element.dispatchEvent(new DragEvent(type, { bubbles: true, cancelable: true, dataTransfer, ...point }));
		const inputFeedback = () => {
			const feedback = view.querySelector<HTMLElement>('.chat-dnd-overlay')!;
			return feedback.classList.contains('visible') ? feedback.textContent : undefined;
		};

		dispatch(transcript, 'dragenter', transcriptPoint);
		dispatch(transcript, 'dragover', transcriptPoint);
		const overlay = workbench.querySelector<HTMLElement>('.session-chat-drop-overlay')!;
		// As the browser does: the transcript under the overlay that shows over it is left, and the overlay entered
		dispatch(transcript, 'dragleave', transcriptPoint);
		dispatch(overlay, 'dragenter', transcriptPoint);
		dispatch(overlay, 'dragover', transcriptPoint);
		const overChat = { overlay: !!overlay.isConnected, feedback: inputFeedback() };
		// The overlay goes away as the drag moves over the input, which takes it then
		dispatch(overlay, 'dragover', inputPoint);
		dispatch(input, 'dragenter', inputPoint);
		dispatch(input, 'dragover', inputPoint);
		// As the browser does: the drag is over the feedback that shows over the input then
		const feedbackElement = view.querySelector<HTMLElement>('.chat-dnd-overlay')!;
		dispatch(feedbackElement, 'dragenter', inputPoint);
		dispatch(input, 'dragleave', inputPoint);
		dispatch(feedbackElement, 'dragover', inputPoint);
		const overInput = { overlay: overlay.isConnected, feedback: inputFeedback() };
		// The drag leaves the chat
		dispatch(feedbackElement, 'dragleave', inputPoint);
		const left = { feedback: inputFeedback() };

		const hint = `Drag here or hold ${isMacintosh ? '⇧' : 'Shift'} to attach to chat`;
		assert.deepStrictEqual({ overChat, overInput, left }, {
			overChat: { overlay: true, feedback: undefined },
			overInput: { overlay: false, feedback: hint },
			left: { feedback: undefined },
		});
	});
});
