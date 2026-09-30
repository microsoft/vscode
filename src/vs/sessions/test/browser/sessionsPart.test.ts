/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { EventType } from '../../../base/browser/dom.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../base/test/common/utils.js';
import { SessionsPart } from '../../browser/parts/sessionsPart.js';
import { SessionHarnessPickerVisibleContext, SessionIsolationPickerVisibleContext, SessionWorkspacePickerVisibleContext } from '../../common/contextkeys.js';
import { noSessionPickerVisibility } from '../../services/sessions/common/sessionPickerVisibility.js';
import { createSessionsPartTestHarness, createTestActiveSession, getSessionPickerVisibility } from './sessionViewTestUtils.js';
import { Direction } from '../../../base/browser/ui/grid/grid.js';

interface ICodiconActivationTestHarness {
	readonly accessibilityService: {
		isMotionReduced(): boolean;
		status(message: string): void;
	};
	readonly telemetryService: {
		publicLog2(eventName: string, data: object): void;
	};
}

suite('Sessions - Sessions Part', () => {
	const store = ensureNoDisposablesAreLeakedInTestSuite();
	const pickerKeys = new Set([SessionWorkspacePickerVisibleContext.key, SessionHarnessPickerVisibleContext.key, SessionIsolationPickerVisibleContext.key]);

	const activateCodicon = Reflect.get(SessionsPart.prototype, 'activateCodicon') as (this: ICodiconActivationTestHarness, element: HTMLElement) => void;

	function assertActivation(eventFactory: () => Event): void {
		const { part } = createSessionsPartTestHarness(store);
		const first = createTestActiveSession('minimized');
		const second = createTestActiveSession('wider');
		part.updateVisibleSessions([first, second, undefined], first);
		part.layout(1202, 802, 0, 0);
		part.resizeSession('minimized', Direction.Left, 1000);
		const minimizedView = part.getSessionView('minimized')!;
		const widerView = part.getSessionView('wider')!;
		const emptyView = part.getSessionView(undefined)!;
		const focused: (string | undefined)[] = [];
		store.add(part.onDidFocusSession(id => focused.push(id)));
		const minimum = minimizedView.element.style.width;
		minimizedView.element.dispatchEvent(eventFactory());
		const expanded = Number.parseFloat(minimizedView.element.style.width) > Number.parseFloat(minimum);
		widerView.element.dispatchEvent(eventFactory());
		emptyView.element.dispatchEvent(eventFactory());

		assert.deepStrictEqual({ expanded, focused }, {
			expanded: true,
			focused: ['minimized', 'wider', undefined],
		});
	}

	test('focus activation expands only a minimum-width session', () => {
		assertActivation(() => new FocusEvent(EventType.FOCUS_IN, { bubbles: true }));
	});

	test('pointer activation expands only a minimum-width session', () => {
		assertActivation(() => new MouseEvent(EventType.MOUSE_DOWN, { bubbles: true, button: 0 }));
	});

	test('reorders and removes created sessions without rebinding surviving chat views', () => {
		const { part, chatViews } = createSessionsPartTestHarness(store);
		const [a, b, c] = ['a', 'b', 'c'].map(id => createTestActiveSession(id));
		part.updateVisibleSessions([a, b, c], b);
		part.layout(1202, 802, 0, 0);
		const views = [a, b, c].map(session => part.getSessionView(session.sessionId));
		const chats = chatViews.filter(view => view.kind === 'chat');
		chats[1].input.value = 'Keep this draft';
		part.updateVisibleSessions([c, a, b], b);
		const reordered = [a, b, c].map((session, index) => part.getSessionView(session.sessionId) === views[index]);
		part.updateVisibleSessions([c, b], b);
		part.updateVisibleSessions([c, b], b, undefined, { type: 'arrange' });
		assert.deepStrictEqual({
			reordered,
			retained: [part.getSessionView('c') === views[2], part.getSessionView('b') === views[1]],
			kinds: chats.map(chat => chat.kind),
			resources: chats.map(chat => chat.chat?.resource.toString()),
			disposals: chats.map(chat => chat.disposeCount),
			created: chatViews.filter(view => view.kind === 'chat').length,
			draft: chats[1].input.value,
		}, {
			reordered: [true, true, true], retained: [true, true], kinds: ['chat', 'chat', 'chat'],
			resources: [a, b, c].map(session => session.mainChat.get().resource.toString()),
			disposals: [1, 0, 0], created: 3, draft: 'Keep this draft',
		});
	});

	for (const maximized of [false, true]) {
		test(`removing and disposing a ${maximized ? 'maximized' : 'phone'} projection detaches its outgoing views`, () => {
			const { part, container, chatViews } = createSessionsPartTestHarness(store);
			const [a, b] = ['a', 'b'].map(id => createTestActiveSession(id));
			part.updateVisibleSessions([a, b], b);
			part.layout(1202, 802, 0, 0);
			if (maximized) {
				part.toggleMaximizeSession('b');
			} else {
				container.classList.add('phone-layout');
				part.layout(390, 780, 0, 0);
			}
			const outgoing = part.getSessionView('b')!.element;
			const surviving = part.getSessionView('a')!.element;
			part.updateVisibleSessions([a], a);
			const afterRemoval = {
				outgoingConnected: outgoing.isConnected,
				visibleSessions: container.querySelectorAll('.session-view').length,
				height: surviving.getBoundingClientRect().height,
				disposed: chatViews.filter(view => view.kind === 'chat').map(view => view.disposed),
			};
			part.dispose();
			assert.deepStrictEqual({ afterRemoval, connectedAfterDispose: [outgoing, surviving].map(element => element.isConnected) }, {
				afterRemoval: { outgoingConnected: false, visibleSessions: 1, height: maximized ? 800 : 780, disposed: [false, true] },
				connectedAfterDispose: [false, false],
			});
		});
	}

	for (const mobile of [false, true]) {
		test(`${mobile ? 'phone' : 'desktop'}-born part restores its desktop arrangement across viewport changes`, () => {
			const { part, container, chatViews } = createSessionsPartTestHarness(store, mobile);
			const a = createTestActiveSession('a');
			const b = createTestActiveSession('b');
			const slots = [{ id: 'a' }, { id: 'b', placement: { reference: 'a', direction: Direction.Down } }];
			part.updateVisibleSessions([a, b], a, slots);
			container.classList.remove('phone-layout');
			part.layout(1202, 802, 0, 0);
			part.resizeSession('a', Direction.Down, 40);
			const desktop = part.getGridLayout();
			container.classList.add('phone-layout');
			part.layout(390, 780, 0, 0);
			const phone = part.getGridLayout();
			part.updateVisibleSessions([a, b], b, slots);
			const phoneSize = part.getSessionView('b')!.element.style.width;
			container.classList.remove('phone-layout');
			part.layout(1202, 802, 0, 0);
			assert.deepStrictEqual({
				phone, restored: part.getGridLayout(), phoneSize, created: chatViews.filter(view => view.kind === 'chat').length, disposed: chatViews.filter(view => view.kind === 'chat').map(view => view.disposed),
			}, { phone: desktop, restored: desktop, phoneSize: '390px', created: 2, disposed: [false, false] });
		});
	}

	test('projects only the active view while retaining explicit, independent scoped picker values', () => {
		const { part, chatViews } = createSessionsPartTestHarness(store);
		const contextKeyService = part.scopedContextKeyService;
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
			part: getSessionPickerVisibility(contextKeyService),
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
				part: { workspace: true, harness: false, isolation: false },
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

	test('inactive picker updates and disposal never reset the selected view in the part', () => {
		const { part, chatViews } = createSessionsPartTestHarness(store);
		const contextKeyService = part.scopedContextKeyService;
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
			part: getSessionPickerVisibility(contextKeyService),
			pickerSnapshots: changes,
		}, {
			disposed: true,
			part: { workspace: true, harness: true, isolation: false },
			pickerSnapshots: [],
		});
	});

	for (const emptyFirst of [true, false]) {
		test(`the active empty composer owns visibility beside an existing session (empty ${emptyFirst ? 'first' : 'last'})`, () => {
			const { part, chatViews } = createSessionsPartTestHarness(store);
			const contextKeyService = part.scopedContextKeyService;
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
				part: getSessionPickerVisibility(contextKeyService),
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
					part: { workspace: true, harness: false, isolation: false },
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
		const { part, chatViews } = createSessionsPartTestHarness(store);
		const contextKeyService = part.scopedContextKeyService;
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
			disposed: { workspace: undefined, harness: undefined, isolation: undefined },
		});
	});

	test('combines content and grid visibility for mounted session views', () => {
		const { part, chatViews } = createSessionsPartTestHarness(store);
		const session = createTestActiveSession('visible');
		part.updateVisibleSessions([session], session);
		const chat = chatViews.find(view => view.kind === 'chat')!;
		const partVisibilityEvents: boolean[] = [];
		store.add(part.onDidVisibilityChange(visible => partVisibilityEvents.push(visible)));
		const visibility: boolean[] = [];

		part.setVisible(false);
		visibility.push(chat.visible);
		part.setContentVisible(false);
		visibility.push(chat.visible);
		part.setContentVisible(true);
		visibility.push(chat.visible);
		part.setVisible(true);
		visibility.push(chat.visible);

		assert.deepStrictEqual({
			sessionView: visibility,
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
});
