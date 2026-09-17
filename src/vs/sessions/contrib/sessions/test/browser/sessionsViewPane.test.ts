/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { mainWindow } from '../../../../../base/browser/window.js';
import { SplitView, Sizing } from '../../../../../base/browser/ui/splitview/splitview.js';
import { Emitter, Event } from '../../../../../base/common/event.js';
import { DisposableStore, IDisposable, MutableDisposable } from '../../../../../base/common/lifecycle.js';
import { URI } from '../../../../../base/common/uri.js';
import { upcastPartial } from '../../../../../base/test/common/mock.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { TestInstantiationService } from '../../../../../platform/instantiation/test/common/instantiationServiceMock.js';
import { Workbench } from '../../../../browser/workbench.js';
import { ISession } from '../../../../services/sessions/common/session.js';
import { ISessionComparison, SessionComparisonParticipantRole } from '../../../../services/sessions/common/sessionComparison.js';
import { AICustomizationShortcutsWidget } from '../../browser/aiCustomizationShortcutsWidget.js';
import { SessionsView } from '../../browser/views/sessionsView.js';
import '../../browser/media/sessionsViewPane.css';

const registerEditorTabHeightClass = Reflect.get(Workbench.prototype, 'registerEditorTabHeightClass') as (this: {
	readonly mainContainer: HTMLElement;
	readonly editorGroupService: {
		readonly partOptions: { readonly tabHeight: 'default' | 'compact' };
		readonly onDidChangeEditorPartOptions: Event<void>;
	};
	_register<T extends IDisposable>(disposable: T): T;
}) => void;
const handleSessionOpened = Reflect.get(SessionsView.prototype, '_handleSessionOpened') as (this: {
	readonly sessionComparisonService: { getComparisonForSession(resource: URI): ISessionComparison | undefined };
	readonly layoutService: { hideSidePane(): void; mainContainer: HTMLElement; setPartHidden(hidden: boolean, part: string): void };
}, session: ISession) => void;

suite('Sessions - SessionsViewPane', () => {
	const disposables = ensureNoDisposablesAreLeakedInTestSuite();

	test('does not reserve customization space on phones and restores the pane on desktop', () => {
		const mainContainer = mainWindow.document.createElement('div');
		mainContainer.classList.add('phone-layout');
		const container = mainWindow.document.createElement('div');
		const instantiationService = disposables.add(new TestInstantiationService());
		const customizationsPaneDisposables = disposables.add(new MutableDisposable<DisposableStore>());
		const splitView = disposables.add(new SplitView(container));
		splitView.addView({
			element: mainWindow.document.createElement('div'),
			minimumSize: 120,
			maximumSize: Number.POSITIVE_INFINITY,
			onDidChange: Event.None,
			layout: () => { },
		}, Sizing.Distribute);
		splitView.layout(600);
		let disposedWidgets = 0;
		let focusCalls = 0;
		instantiationService.stubInstance(AICustomizationShortcutsWidget, {
			collapsed: false,
			collapsedHeight: 30,
			desiredHeight: 200,
			onDidChangeHeight: Event.None,
			onDidToggleCollapsed: Event.None,
			layout: () => { },
			focus: () => focusCalls++,
			dispose: () => disposedWidgets++,
		});
		const host = {
			layoutService: { mainContainer },
			instantiationService,
			sidebarSplitViewContainer: container,
			sidebarSplitView: splitView,
			customizationsPaneDisposables,
			_customizationsWidget: undefined as AICustomizationShortcutsWidget | undefined,
			currentBodyWidth: 300,
			currentBodyHeight: 600,
			didInitializePaneSizes: false,
			getCustomizationsPaneHeight: () => 200,
			layoutSidebarSplitView: (): void => layoutPane.call(host),
		};
		const updatePane = Reflect.get(SessionsView.prototype, 'updateCustomizationsPane') as (this: typeof host) => void;
		const layoutPane = Reflect.get(SessionsView.prototype, 'layoutSidebarSplitView') as (this: typeof host) => void;
		const focusCustomizations = SessionsView.prototype.focusCustomizations as (this: typeof host) => void;
		const snapshot = () => ({
			panes: splitView.length,
			sessionsHeight: splitView.getViewSize(0),
			customizations: container.querySelectorAll('.agent-sessions-customizations-section').length,
			hasWidget: !!host._customizationsWidget,
			disposedWidgets,
			focusCalls,
		});

		updatePane.call(host);
		host.layoutSidebarSplitView();
		focusCustomizations.call(host);
		const phone = snapshot();
		mainContainer.classList.remove('phone-layout');
		updatePane.call(host);
		updatePane.call(host);
		host.layoutSidebarSplitView();
		focusCustomizations.call(host);
		const desktop = snapshot();
		mainContainer.classList.add('phone-layout');
		focusCustomizations.call(host);
		updatePane.call(host);
		host.layoutSidebarSplitView();
		const phoneAgain = snapshot();
		mainContainer.classList.remove('phone-layout');
		updatePane.call(host);
		host.layoutSidebarSplitView();
		focusCustomizations.call(host);

		assert.deepStrictEqual({ phone, desktop, phoneAgain, desktopAgain: snapshot() }, {
			phone: { panes: 1, sessionsHeight: 600, customizations: 0, hasWidget: false, disposedWidgets: 0, focusCalls: 0 },
			desktop: { panes: 2, sessionsHeight: 400, customizations: 1, hasWidget: true, disposedWidgets: 0, focusCalls: 1 },
			phoneAgain: { panes: 1, sessionsHeight: 600, customizations: 0, hasWidget: false, disposedWidgets: 1, focusCalls: 1 },
			desktopAgain: { panes: 2, sessionsHeight: 400, customizations: 1, hasWidget: true, disposedWidgets: 1, focusCalls: 2 },
		});
	});

	test('matches the default and compact editor tab heights', () => {
		const editorPartOptionsChanged = disposables.add(new Emitter<void>());
		let tabHeight: 'default' | 'compact' = 'default';
		const workbench = mainWindow.document.createElement('div');
		workbench.className = 'agent-sessions-workbench';
		workbench.style.setProperty('--vscode-spacing-size280', '28px');
		workbench.style.setProperty('--vscode-spacing-size320', '32px');
		const viewPane = mainWindow.document.createElement('div');
		viewPane.className = 'agent-sessions-viewpane';
		const headerRow = mainWindow.document.createElement('div');
		headerRow.className = 'agent-sessions-header-row';
		viewPane.appendChild(headerRow);
		workbench.appendChild(viewPane);
		mainWindow.document.body.appendChild(workbench);

		const host = {
			mainContainer: workbench,
			editorGroupService: {
				get partOptions() { return { tabHeight }; },
				onDidChangeEditorPartOptions: editorPartOptionsChanged.event,
			},
			_register: <T extends IDisposable>(disposable: T) => disposables.add(disposable),
		};

		try {
			registerEditorTabHeightClass.call(host);
			const defaultHeight = mainWindow.getComputedStyle(headerRow).height;

			tabHeight = 'compact';
			editorPartOptionsChanged.fire();
			const compactHeight = mainWindow.getComputedStyle(headerRow).height;

			tabHeight = 'default';
			editorPartOptionsChanged.fire();
			const restoredHeight = mainWindow.getComputedStyle(headerRow).height;

			assert.deepStrictEqual({
				defaultHeight,
				compactHeight,
				restoredHeight,
				hasCompactClass: workbench.classList.contains('editor-tabs-compact-height'),
			}, {
				defaultHeight: '32px',
				compactHeight: '28px',
				restoredHeight: '32px',
				hasCompactClass: false,
			});
		} finally {
			workbench.remove();
		}
	});

	test('hides session details when a comparison participant is opened', () => {
		const attempt = upcastPartial<ISession>({ resource: URI.parse('test:/attempt') });
		const judge = upcastPartial<ISession>({ resource: URI.parse('test:/judge') });
		const comparison: ISessionComparison = {
			id: 'comparison',
			groupId: 'group',
			title: 'Compare',
			createdAt: 1,
			workspace: URI.file('/workspace'),
			prompt: 'Implement',
			participants: [
				{
					id: 'attempt',
					role: SessionComparisonParticipantRole.Attempt,
					harness: { providerId: 'test', sessionTypeId: 'test', label: 'Test' },
					sessionResource: attempt.resource,
				},
				{
					id: 'judge',
					role: SessionComparisonParticipantRole.Judge,
					harness: { providerId: 'test', sessionTypeId: 'test', label: 'Test' },
					sessionResource: judge.resource,
				},
			],
		};
		let hideSidePaneCalls = 0;
		const host = {
			sessionComparisonService: {
				getComparisonForSession: () => comparison,
			},
			layoutService: {
				hideSidePane: () => hideSidePaneCalls++,
				mainContainer: mainWindow.document.createElement('div'),
				setPartHidden: () => { },
			},
		};

		handleSessionOpened.call(host, attempt);
		handleSessionOpened.call(host, judge);

		assert.strictEqual(hideSidePaneCalls, 2);
	});
});
