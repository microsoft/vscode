/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { EventType } from '../../../base/browser/dom.js';
import { mainWindow } from '../../../base/browser/window.js';
import { IDisposable } from '../../../base/common/lifecycle.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../base/test/common/utils.js';
import { SessionsPart } from '../../browser/parts/sessionsPart.js';
import { SessionHarnessPickerVisibleContext, SessionIsolationPickerVisibleContext, SessionWorkspacePickerVisibleContext } from '../../common/contextkeys.js';
import { noSessionPickerVisibility } from '../../services/sessions/common/sessionPickerVisibility.js';
import { createSessionsPartTestHarness, createTestActiveSession, getSessionPickerVisibility } from './sessionViewTestUtils.js';

interface IViewSize {
	readonly width: number;
	readonly height: number;
}

interface ITestGridSlot {
	readonly view: TestSessionView;
	readonly disposables: IDisposable;
	boundSessionId: string | undefined;
}

interface ISessionsPartTestHarness {
	readonly _isPartVisible: boolean;
	readonly instantiationService: {
		createInstance(): TestSessionView;
	};
	readonly _gridWidget: {
		getViewSize(view: object): IViewSize;
		expandView(view: object): void;
	};
	readonly _onDidFocusSession: {
		fire(sessionId: string | undefined): void;
	};
}

interface ICodiconActivationTestHarness {
	readonly accessibilityService: {
		isMotionReduced(): boolean;
		status(message: string): void;
	};
	readonly telemetryService: {
		publicLog2(eventName: string, data: object): void;
	};
}

interface IContextKeyHarness {
	readonly element: HTMLElement;
	readonly _multipleSessionsVisibleKey: {
		set(value: boolean): void;
	};
}

class TestSessionView implements IDisposable {
	readonly element = document.createElement('div');
	readonly minimumWidth = 200;
	readonly partVisibility: boolean[] = [];

	setPartVisible(visible: boolean): void {
		this.partVisibility.push(visible);
	}
	dispose(): void { }
}

suite('Sessions - Sessions Part', () => {
	const store = ensureNoDisposablesAreLeakedInTestSuite();
	const pickerKeys = new Set([SessionWorkspacePickerVisibleContext.key, SessionHarnessPickerVisibleContext.key, SessionIsolationPickerVisibleContext.key]);

	const createSlot = Reflect.get(SessionsPart.prototype, '_createSlot') as (this: ISessionsPartTestHarness) => ITestGridSlot;
	const activateCodicon = Reflect.get(SessionsPart.prototype, 'activateCodicon') as (this: ICodiconActivationTestHarness, element: HTMLElement) => void;
	const updateContextKeys = Reflect.get(SessionsPart.prototype, '_updateContextKeys') as (this: IContextKeyHarness, visible: readonly object[]) => void;

	function assertActivation(eventFactory: () => Event): void {
		const minimizedView = new TestSessionView();
		const widerView = new TestSessionView();
		const emptyView = new TestSessionView();
		const widths = new Map<object, number>([
			[minimizedView, minimizedView.minimumWidth],
			[widerView, widerView.minimumWidth + 1],
			[emptyView, emptyView.minimumWidth + 1],
		]);
		const expanded: object[] = [];
		const focused: (string | undefined)[] = [];
		let viewToCreate = minimizedView;
		const host = {
			_isPartVisible: true,
			_contentVisible: true,
			instantiationService: {
				createInstance: () => viewToCreate,
			},
			_gridWidget: {
				getViewSize: (view: object) => ({ width: widths.get(view)!, height: 600 }),
				expandView: (view: object) => expanded.push(view),
			},
			_onDidFocusSession: {
				fire: (sessionId: string | undefined) => focused.push(sessionId),
			},
		};
		Object.setPrototypeOf(host, SessionsPart.prototype);

		const minimizedSlot = createSlot.call(host);
		minimizedSlot.boundSessionId = 'minimized';
		store.add(minimizedSlot.disposables);

		viewToCreate = widerView;
		const widerSlot = createSlot.call(host);
		widerSlot.boundSessionId = 'wider';
		store.add(widerSlot.disposables);

		viewToCreate = emptyView;
		const emptySlot = createSlot.call(host);
		store.add(emptySlot.disposables);

		minimizedView.element.dispatchEvent(eventFactory());
		widerView.element.dispatchEvent(eventFactory());
		emptyView.element.dispatchEvent(eventFactory());

		assert.deepStrictEqual({ expanded, focused }, {
			expanded: [minimizedView],
			focused: ['minimized', 'wider', undefined],
		});
	}

	test('focus activation expands only a minimum-width session', () => {
		assertActivation(() => new FocusEvent(EventType.FOCUS_IN, { bubbles: true }));
	});

	test('pointer activation expands only a minimum-width session', () => {
		assertActivation(() => new MouseEvent(EventType.MOUSE_DOWN, { bubbles: true, button: 0 }));
	});

	test('projects only the active view while retaining explicit, independent scoped picker values', () => {
		const { part, chatViews, contextKeyService } = createSessionsPartTestHarness(store);
		const first = createTestActiveSession('first', false);
		const second = createTestActiveSession('second', false);
		part.updateVisibleSessions([first, second], first);
		const firstView = part.getSessionView(first.sessionId)!;
		const secondView = part.getSessionView(second.sessionId)!;
		const [firstChat, secondChat] = chatViews;
		const initial = [getSessionPickerVisibility(contextKeyService), getSessionPickerVisibility(contextKeyService, secondView.element)];

		secondChat.inputPickerVisibility.setVisible('harness', true);
		secondChat.inputPickerVisibility.setVisible('isolation', true);
		const afterInactiveRender = getSessionPickerVisibility(contextKeyService);
		firstChat.inputPickerVisibility.setVisible('workspace', true);
		const afterActiveRender = {
			global: getSessionPickerVisibility(contextKeyService),
			first: getSessionPickerVisibility(contextKeyService, firstView.element),
			second: getSessionPickerVisibility(contextKeyService, secondView.element),
		};

		const changes: ReturnType<typeof getSessionPickerVisibility>[] = [];
		store.add(contextKeyService.onDidChangeContext(event => {
			if (event.affectsSome(pickerKeys)) {
				changes.push(getSessionPickerVisibility(contextKeyService));
			}
		}));
		part.updateVisibleSessions([first, second], second);
		firstChat.inputPickerVisibility.setVisible('harness', true);
		const afterSwitch = getSessionPickerVisibility(contextKeyService);
		part.updateVisibleSessions([first, second], first);

		assert.deepStrictEqual({
			initial, afterInactiveRender, afterActiveRender, afterSwitch,
			afterSwitchBack: getSessionPickerVisibility(contextKeyService),
			changes,
		}, {
			initial: [noSessionPickerVisibility, noSessionPickerVisibility],
			afterInactiveRender: noSessionPickerVisibility,
			afterActiveRender: {
				global: { workspace: true, harness: false, isolation: false },
				first: { workspace: true, harness: false, isolation: false },
				second: { workspace: false, harness: true, isolation: true },
			},
			afterSwitch: { workspace: false, harness: true, isolation: true },
			afterSwitchBack: { workspace: true, harness: true, isolation: false },
			changes: [
				{ workspace: false, harness: true, isolation: true },
				{ workspace: true, harness: true, isolation: false },
			],
		});
	});

	test('inactive picker updates and disposal never reset the active view globally', () => {
		const { part, chatViews, contextKeyService } = createSessionsPartTestHarness(store);
		const first = createTestActiveSession('first', false);
		const second = createTestActiveSession('second', false);
		part.updateVisibleSessions([first, second], first);
		const [firstChat, secondChat] = chatViews;
		firstChat.inputPickerVisibility.setVisible('workspace', true);
		firstChat.inputPickerVisibility.setVisible('harness', true);
		const changes: ReturnType<typeof getSessionPickerVisibility>[] = [];
		store.add(contextKeyService.onDidChangeContext(event => {
			if (event.affectsSome(pickerKeys)) {
				changes.push(getSessionPickerVisibility(contextKeyService));
			}
		}));

		secondChat.inputPickerVisibility.setVisible('isolation', true);
		secondChat.inputPickerVisibility.setVisible('isolation', false);
		part.updateVisibleSessions([first], first);

		assert.deepStrictEqual({
			disposed: secondChat.disposed,
			global: getSessionPickerVisibility(contextKeyService),
			pickerSnapshots: changes,
		}, {
			disposed: true,
			global: { workspace: true, harness: true, isolation: false },
			pickerSnapshots: [],
		});
	});

	for (const emptyFirst of [true, false]) {
		test(`the active empty composer owns visibility beside an existing session (empty ${emptyFirst ? 'first' : 'last'})`, () => {
			const { part, chatViews, contextKeyService } = createSessionsPartTestHarness(store);
			const existing = createTestActiveSession('existing');
			const visible = emptyFirst ? [undefined, existing] : [existing, undefined];
			part.updateVisibleSessions(visible, existing);
			const emptyView = part.getSessionView(undefined)!;
			const existingView = part.getSessionView(existing.sessionId)!;
			const composer = chatViews.find(view => view.kind === 'newSession')!;
			composer.inputPickerVisibility.setVisible('workspace', true);
			const beforeActivation = getSessionPickerVisibility(contextKeyService);

			part.updateVisibleSessions(visible, undefined);
			const active = {
				global: getSessionPickerVisibility(contextKeyService),
				empty: emptyView.element.classList.contains('is-active'),
				existing: existingView.element.classList.contains('is-active'),
				existingScope: getSessionPickerVisibility(contextKeyService, existingView.element),
			};
			part.setContentVisible(false);
			composer.inputPickerVisibility.setVisible('harness', true);
			composer.inputPickerVisibility.setVisible('isolation', true);
			const hidden = [getSessionPickerVisibility(contextKeyService), getSessionPickerVisibility(contextKeyService, emptyView.element)];
			part.setContentVisible(true);
			const shown = getSessionPickerVisibility(contextKeyService);
			emptyView.setVisible(false);
			const hiddenLeaf = getSessionPickerVisibility(contextKeyService);
			emptyView.setVisible(true);
			emptyView.dispose();

			assert.deepStrictEqual({
				beforeActivation, active, hidden, shown, hiddenLeaf,
				disposed: getSessionPickerVisibility(contextKeyService),
			}, {
				beforeActivation: noSessionPickerVisibility,
				active: {
					global: { workspace: true, harness: false, isolation: false },
					empty: true,
					existing: false,
					existingScope: noSessionPickerVisibility,
				},
				hidden: [noSessionPickerVisibility, noSessionPickerVisibility],
				shown: { workspace: true, harness: true, isolation: true },
				hiddenLeaf: noSessionPickerVisibility,
				disposed: noSessionPickerVisibility,
			});
		});
	}

	test('resets picker scopes when a draft is sent or its active slot is rebound', () => {
		const { part, chatViews, contextKeyService } = createSessionsPartTestHarness(store);
		const draft = createTestActiveSession('draft', false);
		part.updateVisibleSessions([draft], draft);
		const sessionView = part.getSessionView(draft.sessionId)!;
		chatViews[0].inputPickerVisibility.setVisible('workspace', true);
		chatViews[0].inputPickerVisibility.setVisible('harness', true);
		chatViews[0].inputPickerVisibility.setVisible('isolation', true);

		draft.isCreated.set(true, undefined);
		const sent = [getSessionPickerVisibility(contextKeyService), getSessionPickerVisibility(contextKeyService, sessionView.element)];
		part.updateVisibleSessions([undefined], undefined);
		const rebound = getSessionPickerVisibility(contextKeyService);
		chatViews.at(-1)!.inputPickerVisibility.setVisible('workspace', true);
		const rendered = getSessionPickerVisibility(contextKeyService);
		part.dispose();

		assert.deepStrictEqual({
			sent, rebound, rendered,
			disposed: getSessionPickerVisibility(contextKeyService),
		}, {
			sent: [noSessionPickerVisibility, noSessionPickerVisibility],
			rebound: noSessionPickerVisibility,
			rendered: { workspace: true, harness: false, isolation: false },
			disposed: noSessionPickerVisibility,
		});
	});

	test('combines content and grid visibility for mounted session views', () => {
		const view = new TestSessionView();
		const partVisibilityEvents: boolean[] = [];
		const part: SessionsPart = Object.assign(Object.create(SessionsPart.prototype), {
			_isPartVisible: true,
			_contentVisible: true,
			_slots: [{ view }],
			_onDidVisibilityChange: { fire: (visible: boolean) => partVisibilityEvents.push(visible) },
		});

		part.setVisible(false);
		part.setContentVisible(false);
		part.setContentVisible(true);
		part.setVisible(true);

		assert.deepStrictEqual({
			sessionView: view.partVisibility,
			part: partVisibilityEvents,
		}, {
			sessionView: [false, false, false, true],
			part: [false, true],
		});
	});

	test('announces and logs Codicon confetti activation', () => {
		const statuses: string[] = [];
		const telemetryEvents: { name: string; data: object }[] = [];
		const host: ICodiconActivationTestHarness = {
			accessibilityService: {
				isMotionReduced: () => true,
				status: message => statuses.push(message),
			},
			telemetryService: {
				publicLog2: (name, data) => telemetryEvents.push({ name, data }),
			},
		};

		activateCodicon.call(host, document.createElement('span'));

		assert.deepStrictEqual({
			statuses,
			telemetryEvents,
		}, {
			statuses: ['Confetti!'],
			telemetryEvents: [{ name: 'vscodeAgents.codiconBackground/confetti', data: {} }],
		});
	});

	test('marks the part when multiple session panes are visible', () => {
		const values: boolean[] = [];
		const element = document.createElement('div');
		const harness: IContextKeyHarness = {
			element,
			_multipleSessionsVisibleKey: {
				set: value => values.push(value),
			},
		};

		updateContextKeys.call(harness, [{}]);
		const single = element.classList.contains('multiple-sessions-visible');
		updateContextKeys.call(harness, [{}, {}]);
		const multiple = element.classList.contains('multiple-sessions-visible');

		assert.deepStrictEqual({ values, single, multiple }, {
			values: [false, true],
			single: false,
			multiple: true,
		});
	});

	test('preserves ordinary inactive styling and outlines only comparison grids', () => {
		const workbench = document.createElement('div');
		workbench.className = 'monaco-workbench';
		workbench.style.setProperty('--vscode-strokeThickness', '1px');
		workbench.style.setProperty('--vscode-focusBorder', 'rgb(0, 122, 204)');
		workbench.style.setProperty('--vscode-contrastActiveBorder', 'rgb(255, 255, 0)');
		const part = document.createElement('div');
		part.className = 'part sessionspart multiple-sessions-visible';
		workbench.appendChild(part);

		const active = document.createElement('div');
		active.className = 'session-view is-active';
		const inactive = document.createElement('div');
		inactive.className = 'session-view';
		const header = document.createElement('div');
		header.className = 'chat-composite-bar session-header-bar';
		const interactiveSession = document.createElement('div');
		interactiveSession.className = 'interactive-session';
		const transcript = document.createElement('div');
		transcript.className = 'interactive-list';
		const toolInvocation = document.createElement('div');
		toolInvocation.className = 'chat-tool-invocation-part';
		transcript.appendChild(toolInvocation);
		const inputToolbars = document.createElement('div');
		inputToolbars.className = 'chat-input-toolbars';
		const inputToolbar = document.createElement('div');
		inputToolbar.className = 'chat-input-toolbar';
		const executeToolbar = document.createElement('div');
		executeToolbar.className = 'chat-execute-toolbar';
		inputToolbars.append(inputToolbar, executeToolbar);
		const editor = document.createElement('div');
		editor.className = 'chat-editor-container';
		interactiveSession.append(transcript, inputToolbars, editor);
		inactive.append(header, interactiveSession);
		part.append(active, inactive);
		mainWindow.document.body.appendChild(workbench);

		try {
			const ordinaryInactiveStyles = {
				headerOpacity: mainWindow.getComputedStyle(header).opacity,
				transcriptOpacity: mainWindow.getComputedStyle(transcript).opacity,
				toolInvocationOpacity: mainWindow.getComputedStyle(toolInvocation).opacity,
				inputToolbarOpacity: mainWindow.getComputedStyle(inputToolbar).opacity,
				inputToolbarPointerEvents: mainWindow.getComputedStyle(inputToolbar).pointerEvents,
				inputToolbarVisibility: mainWindow.getComputedStyle(inputToolbar).visibility,
				editorOpacity: mainWindow.getComputedStyle(editor).opacity,
				executeToolbarOpacity: mainWindow.getComputedStyle(executeToolbar).opacity,
				executeToolbarFilter: mainWindow.getComputedStyle(executeToolbar).filter,
			};
			workbench.classList.add('session-comparison-grid-active');
			const selectedIndicatorStyle = mainWindow.getComputedStyle(active, '::after');
			const selectedBorder = {
				top: `${selectedIndicatorStyle.borderTopWidth} ${selectedIndicatorStyle.borderTopStyle} ${selectedIndicatorStyle.borderTopColor}`,
				right: `${selectedIndicatorStyle.borderRightWidth} ${selectedIndicatorStyle.borderRightStyle} ${selectedIndicatorStyle.borderRightColor}`,
				bottom: `${selectedIndicatorStyle.borderBottomWidth} ${selectedIndicatorStyle.borderBottomStyle} ${selectedIndicatorStyle.borderBottomColor}`,
				left: `${selectedIndicatorStyle.borderLeftWidth} ${selectedIndicatorStyle.borderLeftStyle} ${selectedIndicatorStyle.borderLeftColor}`,
				zIndex: selectedIndicatorStyle.zIndex,
			};
			const comparisonInactiveStyles = {
				headerOpacity: mainWindow.getComputedStyle(header).opacity,
				transcriptOpacity: mainWindow.getComputedStyle(transcript).opacity,
				toolInvocationOpacity: mainWindow.getComputedStyle(toolInvocation).opacity,
				inputToolbarOpacity: mainWindow.getComputedStyle(inputToolbar).opacity,
				inputToolbarPointerEvents: mainWindow.getComputedStyle(inputToolbar).pointerEvents,
				inputToolbarVisibility: mainWindow.getComputedStyle(inputToolbar).visibility,
				editorOpacity: mainWindow.getComputedStyle(editor).opacity,
				executeToolbarOpacity: mainWindow.getComputedStyle(executeToolbar).opacity,
				executeToolbarFilter: mainWindow.getComputedStyle(executeToolbar).filter,
			};
			workbench.classList.add('hc-black');
			const highContrastBorderColor = mainWindow.getComputedStyle(active, '::after').borderTopColor;
			part.classList.remove('multiple-sessions-visible');
			const singlePaneBorderWidth = mainWindow.getComputedStyle(active, '::after').borderTopWidth;

			assert.deepStrictEqual({
				selectedBorder,
				highContrastBorderColor,
				singlePaneBorderWidth,
				ordinaryInactiveStyles,
				comparisonInactiveStyles,
			}, {
				selectedBorder: {
					top: '1px solid rgb(0, 122, 204)',
					right: '1px solid rgb(0, 122, 204)',
					bottom: '1px solid rgb(0, 122, 204)',
					left: '1px solid rgb(0, 122, 204)',
					zIndex: '101',
				},
				highContrastBorderColor: 'rgb(255, 255, 0)',
				singlePaneBorderWidth: '0px',
				ordinaryInactiveStyles: {
					headerOpacity: '0.6',
					transcriptOpacity: '0.9',
					toolInvocationOpacity: '0.6',
					inputToolbarOpacity: '0',
					inputToolbarPointerEvents: 'none',
					inputToolbarVisibility: 'hidden',
					editorOpacity: '0.6',
					executeToolbarOpacity: '0.6',
					executeToolbarFilter: 'grayscale(1)',
				},
				comparisonInactiveStyles: {
					headerOpacity: '1',
					transcriptOpacity: '1',
					toolInvocationOpacity: '1',
					inputToolbarOpacity: '1',
					inputToolbarPointerEvents: 'auto',
					inputToolbarVisibility: 'visible',
					editorOpacity: '1',
					executeToolbarOpacity: '1',
					executeToolbarFilter: 'none',
				},
			});
		} finally {
			workbench.remove();
		}
	});

	test('hides only inactive comparison inputs when the experiment is active', () => {
		const workbench = document.createElement('div');
		workbench.className = 'monaco-workbench session-comparison-hide-inactive-inputs';
		const part = document.createElement('div');
		part.className = 'part sessionspart multiple-sessions-visible';
		workbench.appendChild(part);

		const createSessionView = (active: boolean) => {
			const view = document.createElement('div');
			view.className = `session-view${active ? ' is-active' : ''}`;
			const interactiveSession = document.createElement('div');
			interactiveSession.className = 'interactive-session';
			const input = document.createElement('div');
			input.className = 'interactive-input-part';
			interactiveSession.appendChild(input);
			view.appendChild(interactiveSession);
			part.appendChild(view);
			return input;
		};
		const activeInput = createSessionView(true);
		const inactiveInput = createSessionView(false);
		mainWindow.document.body.appendChild(workbench);

		try {
			const activeDisplay = mainWindow.getComputedStyle(activeInput).display;
			const inactiveDisplay = mainWindow.getComputedStyle(inactiveInput).display;
			workbench.classList.remove('session-comparison-hide-inactive-inputs');
			const restoredDisplay = mainWindow.getComputedStyle(inactiveInput).display;

			assert.deepStrictEqual({
				activeDisplay,
				inactiveDisplay,
				restoredDisplay,
			}, {
				activeDisplay: 'block',
				inactiveDisplay: 'none',
				restoredDisplay: 'block',
			});
		} finally {
			workbench.remove();
		}
	});
});
