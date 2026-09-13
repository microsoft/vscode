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

function createHarness(disposables: Pick<DisposableStore, 'add'>, capabilities: ISessionCapabilities = { supportsMultipleChats: false }) {
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
		override readonly capabilities: IObservable<ISessionCapabilities> = constObservable(capabilities);
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

	test('uses a full-width backing surface with centered content and no separator', () => {
		const { header } = createHarness(disposables);
		const container = header.element.parentElement!;
		container.classList.add('agent-sessions-workbench', 'session-view');
		container.style.setProperty('--vscode-spacing-size280', '28px');
		container.style.setProperty('--vscode-spacing-size320', '32px');
		container.style.setProperty('--session-view-centered-content-max-width', '950px');
		container.style.setProperty('--session-view-content-horizontal-padding', '32px');
		container.style.width = '1200px';
		mainWindow.document.body.appendChild(container);

		try {
			const headerRow = header.element.querySelector<HTMLElement>('.chat-composite-bar-header')!;
			const getGeometry = () => {
				const barBounds = header.element.getBoundingClientRect();
				const headerBounds = headerRow.getBoundingClientRect();
				return {
					barWidth: barBounds.width,
					headerWidth: headerBounds.width,
					barHeight: mainWindow.getComputedStyle(header.element).height,
					headerHeight: mainWindow.getComputedStyle(headerRow).height,
					headerInset: headerBounds.left - barBounds.left,
					barPaddingInline: mainWindow.getComputedStyle(header.element).paddingInline,
					headerPaddingInline: mainWindow.getComputedStyle(headerRow).paddingInline,
					hasCompactClass: container.classList.contains('editor-tabs-compact-height'),
				};
			};

			const defaultGeometry = getGeometry();
			container.classList.add('editor-tabs-compact-height');
			const compactGeometry = getGeometry();
			container.classList.remove('editor-tabs-compact-height');
			const restoredGeometry = getGeometry();
			container.classList.add('hc-black');
			const highContrastSeparatorStyle = mainWindow.getComputedStyle(headerRow).borderBottomStyle;

			assert.deepStrictEqual({ defaultGeometry, compactGeometry, restoredGeometry, highContrastSeparatorStyle }, {
				defaultGeometry: {
					barWidth: 1200,
					headerWidth: 950,
					barHeight: '32px',
					headerHeight: '32px',
					headerInset: 125,
					barPaddingInline: '0px',
					headerPaddingInline: '32px',
					hasCompactClass: false,
				},
				compactGeometry: {
					barWidth: 1200,
					headerWidth: 950,
					barHeight: '28px',
					headerHeight: '28px',
					headerInset: 125,
					barPaddingInline: '0px',
					headerPaddingInline: '32px',
					hasCompactClass: true,
				},
				restoredGeometry: {
					barWidth: 1200,
					headerWidth: 950,
					barHeight: '32px',
					headerHeight: '32px',
					headerInset: 125,
					barPaddingInline: '0px',
					headerPaddingInline: '32px',
					hasCompactClass: false,
				},
				highContrastSeparatorStyle: 'none',
			});
		} finally {
			container.remove();
		}
	});

	test('lets configured chat backgrounds show through without fading the header content', () => {
		const { header } = createHarness(disposables);
		const workbench = mainWindow.document.createElement('div');
		workbench.classList.add('monaco-workbench', 'agent-sessions-workbench');
		workbench.style.setProperty('--session-view-background', '#202020');
		const part = mainWindow.document.createElement('div');
		part.classList.add('part', 'sessionspart', 'has-chat-background');
		part.appendChild(header.element.parentElement!);
		workbench.appendChild(part);
		mainWindow.document.body.appendChild(workbench);

		try {
			const backgroundStyle = mainWindow.getComputedStyle(header.element);
			const backgroundColor = backgroundStyle.backgroundColor;
			const opacity = backgroundStyle.opacity;
			part.classList.remove('has-chat-background');
			const plainBackgroundColor = mainWindow.getComputedStyle(header.element).backgroundColor;
			part.classList.add('has-chat-background');
			workbench.classList.add('hc-black');
			const highContrastBackgroundColor = mainWindow.getComputedStyle(header.element).backgroundColor;

			assert.deepStrictEqual({
				backgroundColor,
				opacity,
				plainBackgroundColor,
				highContrastBackgroundColor,
			}, {
				backgroundColor: 'color(srgb 0.12549 0.12549 0.12549 / 0.85)',
				opacity: '1',
				plainBackgroundColor: 'rgb(32, 32, 32)',
				highContrastBackgroundColor: 'rgb(32, 32, 32)',
			});
		} finally {
			workbench.remove();
		}
	});

	test('reports whether the inline rename could be started', () => {
		const renameable = createHarness(disposables, { supportsMultipleChats: false, supportsRename: true });
		const notRenameable = createHarness(disposables);

		const startedWhenVisible = renameable.header.startTitleEditing();
		const hasInput = renameable.header.element.querySelector('.chat-composite-bar-session-title-input') !== null;
		// The header is hidden while the single-group tabs row replaces it, so
		// there is no title to rename inline.
		renameable.header.setVisible(false);

		assert.deepStrictEqual({
			startedWhenVisible,
			hasInput,
			startedWhenHidden: renameable.header.startTitleEditing(),
			startedWhenNotRenameable: notRenameable.header.startTitleEditing(),
			hasInputWhenNotRenameable: notRenameable.header.element.querySelector('.chat-composite-bar-session-title-input') !== null,
		}, {
			startedWhenVisible: true,
			hasInput: true,
			startedWhenHidden: false,
			startedWhenNotRenameable: false,
			hasInputWhenNotRenameable: false,
		});
	});
});
