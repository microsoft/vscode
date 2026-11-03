/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { $ } from '../../../../../base/browser/dom.js';
import { timeout } from '../../../../../base/common/async.js';
import { toDisposable } from '../../../../../base/common/lifecycle.js';
import { URI } from '../../../../../base/common/uri.js';
import { mock, upcastDeepPartial, upcastPartial } from '../../../../../base/test/common/mock.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { ISharedWebContentExtractorService } from '../../../../../platform/webContentExtractor/common/webContentExtractor.js';
import { IExtensionService } from '../../../../../workbench/services/extensions/common/extensions.js';
import { IChatWidget } from '../../../../../workbench/contrib/chat/browser/chat.js';
import { IChatAttachmentResolveService } from '../../../../../workbench/contrib/chat/browser/attachments/chatAttachmentResolveService.js';
import { ChatDragAndDrop } from '../../../../../workbench/contrib/chat/browser/widget/chatDragAndDrop.js';
import { IChatRequestVariableEntry } from '../../../../../workbench/contrib/chat/common/attachments/chatVariableEntries.js';
import { IChatModel } from '../../../../../workbench/contrib/chat/common/model/chatModel.js';
import { isInputDropTarget } from '../../../../../workbench/browser/dnd.js';
import { workbenchInstantiationService } from '../../../../../workbench/test/browser/workbenchTestServices.js';
import { ChatGroupDropTarget } from '../../../../browser/parts/chatGroupDropTarget.js';
import { SessionDropTarget } from '../../../../browser/parts/sessionDropTarget.js';
import { clearChatReferenceDragData, fillChatReferenceDragData, fillSessionChatDragData, getSessionChatDragData, isSessionChatDrag } from '../../../../browser/dnd.js';
import { ISessionsService } from '../../../../services/sessions/browser/sessionsService.js';
import { ISessionsManagementService } from '../../../../services/sessions/common/sessionsManagement.js';
import '../../../../../workbench/contrib/chat/browser/widget/media/chat.css';

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
