/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { Codicon } from '../../../../../base/common/codicons.js';
import { errorHandler } from '../../../../../base/common/errors.js';
import { constObservable } from '../../../../../base/common/observable.js';
import { URI } from '../../../../../base/common/uri.js';
import { mock } from '../../../../../base/test/common/mock.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { ActionListItemKind, IActionListDelegate, IActionListItem } from '../../../../../platform/actionWidget/browser/actionList.js';
import { IActionWidgetService } from '../../../../../platform/actionWidget/browser/actionWidget.js';
import { ISessionsService } from '../../../../services/sessions/browser/sessionsService.js';
import { ChatOriginKind, IChat, ISession, SessionStatus } from '../../../../services/sessions/common/session.js';
import { IActiveSession } from '../../../../services/sessions/common/sessionsManagement.js';
import { SessionBackgroundActivitiesControl } from '../../browser/sessionBackgroundActivitiesControl.js';
import { isNonNegativeIntegerInput, weightedRandomDebugIncrement } from '../../browser/sessionChatInputToolbarDebug.js';

interface IControlSpec {
	readonly subagents?: readonly string[];
	readonly subagentStatus?: SessionStatus;
	readonly enabled?: boolean;
	/** Make `openChat` reject, to check the failure reaches the error handler. */
	readonly openChatError?: Error;
}

interface IControlHarness {
	readonly control: SessionBackgroundActivitiesControl;
	readonly getPickerItems: () => readonly ICapturedPickerItem[];
	readonly getOpenedChat: () => URI | undefined;
	readonly hidePicker: () => void;
}

interface ICapturedPickerItem {
	readonly kind: ActionListItemKind;
	readonly label: string;
	readonly category: string;
	readonly icon: string;
}

function createControl(spec: IControlSpec, store: ReturnType<typeof ensureNoDisposablesAreLeakedInTestSuite>): IControlHarness {
	const mainChat = new class extends mock<IChat>() {
		override readonly resource = URI.parse('chat:main');
		override readonly title = constObservable('Main');
		override readonly status = constObservable(SessionStatus.InProgress);
	}();
	const subagents = (spec.subagents ?? []).map((title, index) => new class extends mock<IChat>() {
		override readonly resource = URI.parse(`chat:subagent-${index}`);
		override readonly title = constObservable(title);
		override readonly status = constObservable(spec.subagentStatus ?? SessionStatus.InProgress);
		override readonly origin = { kind: ChatOriginKind.Tool, parentChat: mainChat.resource };
	}());
	const session = new class extends mock<IActiveSession>() {
		override readonly resource = URI.parse('session:main');
		override readonly chats = constObservable([mainChat, ...subagents]);
	}();

	let pickerItems: ICapturedPickerItem[] = [];
	let hidePicker = () => { };
	const actionWidgetService = new class extends mock<IActionWidgetService>() {
		override get isVisible() { return false; }
		override hide(): void { }
		override show<T>(_user: string, _supportsPreview: boolean, items: readonly IActionListItem<T>[], delegate: IActionListDelegate<T>): void {
			pickerItems = items.map(item => ({
				kind: item.kind,
				label: item.label ?? '',
				category: item.group?.title ?? '',
				icon: item.group?.icon?.id ?? '',
			}));
			hidePicker = () => delegate.onHide(false);
		}
	}();

	let openedChat: URI | undefined;
	const sessionsService = new class extends mock<ISessionsService>() {
		override async openChat(_session: ISession, chatUri: URI): Promise<void> {
			openedChat = chatUri;
			if (spec.openChatError) {
				throw spec.openChatError;
			}
		}
	}();

	const control = store.add(new SessionBackgroundActivitiesControl(
		constObservable(session),
		constObservable(mainChat),
		constObservable(spec.enabled ?? true),
		actionWidgetService,
		sessionsService,
	));

	return {
		control,
		getPickerItems: () => pickerItems,
		getOpenedChat: () => openedChat,
		hidePicker: () => hidePicker(),
	};
}

function summarize(control: SessionBackgroundActivitiesControl): { readonly text: string; readonly ariaLabel: string | null; readonly icons: readonly string[] } {
	const button = control.element.querySelector<HTMLElement>('.session-activity-pill-button')!;
	const knownIcons = [Codicon.globe, Codicon.agent, Codicon.sessionInProgress, Codicon.chevronDown];
	return {
		text: button.textContent ?? '',
		ariaLabel: button.getAttribute('aria-label'),
		icons: [...button.querySelectorAll<HTMLElement>('.codicon')]
			.map(element => knownIcons.find(icon => element.classList.contains(`codicon-${icon.id}`))?.id ?? 'unknown'),
	};
}

function click(control: SessionBackgroundActivitiesControl): void {
	control.element.querySelector<HTMLElement>('.session-activity-pill-button')!.click();
}

suite('SessionBackgroundActivitiesControl', () => {

	const store = ensureNoDisposablesAreLeakedInTestSuite();

	test('weights smaller random change increments more heavily', () => {
		const frequencies = Array.from({ length: 16 }, () => 0);
		for (let first = 0; first < 16; first++) {
			for (let second = 0; second < 16; second++) {
				frequencies[weightedRandomDebugIncrement((first + 0.5) / 16, (second + 0.5) / 16)]++;
			}
		}

		assert.deepStrictEqual(frequencies, [31, 29, 27, 25, 23, 21, 19, 17, 15, 13, 11, 9, 7, 5, 3, 1]);
	});

	test('rejects empty and invalid numeric debug fields', () => {
		assert.deepStrictEqual({
			empty: isNonNegativeIntegerInput(''),
			whitespace: isNonNegativeIntegerInput('  '),
			zero: isNonNegativeIntegerInput('0'),
			integer: isNonNegativeIntegerInput('12'),
			negative: isNonNegativeIntegerInput('-1'),
			decimal: isNonNegativeIntegerInput('1.5'),
			text: isNonNegativeIntegerInput('one'),
		}, {
			empty: false,
			whitespace: false,
			zero: true,
			integer: true,
			negative: false,
			decimal: false,
			text: false,
		});
	});

	test('renders single and aggregate labels, icons, and subagent truncation', () => {
		const cases: IControlSpec[] = [
			{ subagents: ['Research'] },
			{ subagents: ['Investigate the authentication failure in production'] },
			{ subagents: ['Research', 'Review'] },
		];
		const disabled = createControl({ subagents: ['Research'], enabled: false }, store);

		assert.deepStrictEqual({
			enabled: cases.map(spec => summarize(createControl(spec, store).control)),
			disabledVisible: disabled.control.isVisible.get(),
		}, {
			enabled: [
				{ text: 'Research', ariaLabel: 'Open Research', icons: ['agent'] },
				{ text: 'Investigate the authentication...', ariaLabel: 'Open Investigate the authentication...', icons: ['agent'] },
				{ text: '2 Active Subagents', ariaLabel: 'Show 2 background activities', icons: ['agent', 'chevron-down'] },
			],
			disabledVisible: false,
		});
	});

	test('keeps subagents visible while they need input', () => {
		const harness = createControl({ subagents: ['Waiting'], subagentStatus: SessionStatus.NeedsInput }, store);

		assert.deepStrictEqual({
			visible: harness.control.isVisible.get(),
			summary: summarize(harness.control),
		}, {
			visible: true,
			summary: { text: 'Waiting', ariaLabel: 'Open Waiting', icons: ['agent'] },
		});
	});

	test('ignores browsers from debug data and shows only fake subagents', () => {
		const harness = createControl({ enabled: false }, store);
		harness.control.setDebugData({
			stats: { files: 2, insertions: 10, deletions: 3 },
			markdownFiles: ['README.md'],
			browsers: ['Debug Browser'],
			subagents: ['Debug Subagent'],
			ciFailed: 2,
			ciPending: 1,
			prFeedback: 3,
			agentFeedback: 4,
			autoIncrementChanges: false,
		});
		const forced = summarize(harness.control);
		harness.control.setDebugData(undefined);

		assert.deepStrictEqual({ forced, visibleAfterClear: harness.control.isVisible.get() }, {
			forced: { text: 'Debug Subagent', ariaLabel: 'Open Debug Subagent', icons: ['agent'] },
			visibleAfterClear: false,
		});
	});

	test('lists subagents in a picker under a category header', () => {
		const harness = createControl({ subagents: ['Research', 'Review'] }, store);

		click(harness.control);

		assert.deepStrictEqual(harness.getPickerItems(), [
			{ kind: ActionListItemKind.Header, label: 'Subagents', category: 'Subagents', icon: '' },
			{ kind: ActionListItemKind.Action, label: 'Research', category: '', icon: Codicon.agent.id },
			{ kind: ActionListItemKind.Action, label: 'Review', category: '', icon: Codicon.agent.id },
		]);
	});

	test('opens a single subagent directly', () => {
		const harness = createControl({ subagents: ['Research'] }, store);

		click(harness.control);

		assert.deepStrictEqual(harness.getOpenedChat()?.toString(), 'chat:subagent-0');
	});

	test('reports a failed subagent open instead of dropping the rejection', async () => {
		const error = new Error('could not open chat');
		const reported: unknown[] = [];
		const previousHandler = errorHandler.getUnexpectedErrorHandler();
		errorHandler.setUnexpectedErrorHandler(e => reported.push(e));
		try {
			const harness = createControl({ subagents: ['Research'], openChatError: error }, store);
			click(harness.control);
			await new Promise(resolve => setTimeout(resolve, 0));
		} finally {
			errorHandler.setUnexpectedErrorHandler(previousHandler);
		}

		assert.deepStrictEqual(reported, [error]);
	});

	test('marks only a multi-activity pill as a popup trigger and tracks its open state', () => {
		const single = createControl({ subagents: ['Research'] }, store);
		const multiple = createControl({ subagents: ['Research', 'Review'] }, store);
		const popupState = (harness: IControlHarness) => {
			const button = harness.control.element.querySelector<HTMLElement>('.session-activity-pill-button')!;
			return { hasPopup: button.getAttribute('aria-haspopup'), expanded: button.getAttribute('aria-expanded') };
		};

		const closed = popupState(multiple);
		click(multiple.control);
		const open = popupState(multiple);
		multiple.hidePicker();

		assert.deepStrictEqual({
			single: popupState(single),
			multipleClosed: closed,
			multipleOpen: open,
			multipleAfterHide: popupState(multiple),
		}, {
			single: { hasPopup: null, expanded: null },
			multipleClosed: { hasPopup: 'listbox', expanded: 'false' },
			multipleOpen: { hasPopup: 'listbox', expanded: 'true' },
			multipleAfterHide: { hasPopup: 'listbox', expanded: 'false' },
		});
	});
});
