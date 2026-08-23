/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { EventType } from '../../../base/browser/dom.js';
import { mainWindow } from '../../../base/browser/window.js';
import { Event } from '../../../base/common/event.js';
import { DisposableStore } from '../../../base/common/lifecycle.js';
import { constObservable, IObservable } from '../../../base/common/observable.js';
import { URI } from '../../../base/common/uri.js';
import { mock } from '../../../base/test/common/mock.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../base/test/common/utils.js';
import { ThemeIcon } from '../../../base/common/themables.js';
import { IAccessibilityService } from '../../../platform/accessibility/common/accessibility.js';
import { workbenchInstantiationService } from '../../../workbench/test/browser/workbenchTestServices.js';
import { SessionHeader } from '../../browser/parts/sessionHeader.js';
import { ISessionsListModelService } from '../../services/sessions/browser/sessionsListModelService.js';
import { ISessionsService } from '../../services/sessions/browser/sessionsService.js';
import { IChat, ISessionCapabilities, SessionStatus } from '../../services/sessions/common/session.js';
import { IActiveSession, ISessionsManagementService } from '../../services/sessions/common/sessionsManagement.js';

function createHarness(disposables: Pick<DisposableStore, 'add'>) {
	const store = disposables.add(new DisposableStore());
	const instantiationService = workbenchInstantiationService(undefined, store);

	instantiationService.stub(IAccessibilityService, new class extends mock<IAccessibilityService>() {
		override readonly onDidChangeScreenReaderOptimized = Event.None;
		override readonly onDidChangeReducedMotion = Event.None;
		override isScreenReaderOptimized(): boolean { return false; }
	}());
	instantiationService.stub(ISessionsListModelService, new class extends mock<ISessionsListModelService>() {
		override readonly onDidChange = Event.None;
		override isSessionPinned(): boolean { return false; }
		override getStatusIcon(): ThemeIcon { return ThemeIcon.fromId('circle'); }
	}());
	instantiationService.stub(ISessionsManagementService, new class extends mock<ISessionsManagementService>() {
		override readonly onDidChangeSessions = Event.None;
	}());
	instantiationService.stub(ISessionsService, new class extends mock<ISessionsService>() { }());

	const mainChat = new class extends mock<IChat>() {
		override readonly title: IObservable<string> = constObservable('Main Chat');
	}();
	const session = new class extends mock<IActiveSession>() {
		override readonly sessionId = 'session';
		override readonly resource = URI.parse('test-session://session');
		override readonly providerId = 'test';
		override readonly title: IObservable<string> = constObservable('My Session');
		override readonly status: IObservable<SessionStatus> = constObservable(SessionStatus.Completed);
		override readonly isRead: IObservable<boolean> = constObservable(true);
		override readonly isArchived: IObservable<boolean> = constObservable(false);
		override readonly isCreated: IObservable<boolean> = constObservable(true);
		override readonly sticky: IObservable<boolean> = constObservable(false);
		override readonly mainChat: IObservable<IChat> = constObservable(mainChat);
		override readonly activeChat: IObservable<IChat> = constObservable(mainChat);
		override readonly chats: IObservable<readonly IChat[]> = constObservable([mainChat]);
		override readonly openChats: IObservable<readonly IChat[]> = constObservable([mainChat]);
		override readonly closedChats: IObservable<readonly IChat[]> = constObservable([]);
		override readonly visibleChatTabs: IObservable<readonly IChat[]> = constObservable([mainChat]);
		override readonly shouldShowChatTabs: IObservable<boolean> = constObservable(false);
		override readonly capabilities: IObservable<ISessionCapabilities> = constObservable({ supportsMultipleChats: false });
	}();

	const header = store.add(instantiationService.createInstance(SessionHeader));
	header.setSession(session);
	const container = mainWindow.document.createElement('div');
	container.appendChild(header.element);

	return { store, header, session };
}

suite('Sessions - SessionHeader', () => {
	const disposables = ensureNoDisposablesAreLeakedInTestSuite();

	// A native drag always fires dragstart with `target` set to the draggable
	// container itself (not the descendant the gesture began on), so a real
	// mousedown must precede it for the header's exclusion logic to see it.
	function simulateDragFrom(header: SessionHeader, gestureOrigin: HTMLElement): DragEvent {
		gestureOrigin.dispatchEvent(new MouseEvent(EventType.MOUSE_DOWN, { bubbles: true, cancelable: true }));

		const dragEvent = new DragEvent(EventType.DRAG_START, { bubbles: true, cancelable: true, dataTransfer: new DataTransfer() });
		header.element.dispatchEvent(dragEvent);
		return dragEvent;
	}

	test('a small pointer move over the title actions toolbar does not start a session drag', () => {
		const { header } = createHarness(disposables);

		const titleActions = header.element.querySelector<HTMLElement>('.chat-composite-bar-title-actions');
		assert.ok(titleActions, 'title actions should be rendered');

		const dragEvent = simulateDragFrom(header, titleActions);

		assert.strictEqual(dragEvent.defaultPrevented, true);
	});

	test('a drag starting elsewhere in the header still initiates a session drag', () => {
		const { header } = createHarness(disposables);

		const dragEvent = simulateDragFrom(header, header.element);

		assert.strictEqual(dragEvent.defaultPrevented, false);
	});

	test('hides the header while it is replaced by the single-group tabs row', () => {
		const { header } = createHarness(disposables);

		header.setVisible(false);
		const hiddenDisplay = header.element.style.display;
		header.setVisible(true);

		assert.deepStrictEqual({
			hiddenDisplay,
			restoredDisplay: header.element.style.display,
			hasMetadataRow: header.element.querySelector('.chat-composite-bar-meta-row') !== null,
		}, {
			hiddenDisplay: 'none',
			restoredDisplay: '',
			hasMetadataRow: false,
		});
	});
});
