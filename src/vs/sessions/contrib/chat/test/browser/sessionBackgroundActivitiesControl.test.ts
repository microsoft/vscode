/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { Codicon } from '../../../../../base/common/codicons.js';
import { Event } from '../../../../../base/common/event.js';
import { constObservable } from '../../../../../base/common/observable.js';
import { URI } from '../../../../../base/common/uri.js';
import { mock } from '../../../../../base/test/common/mock.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { ActionListItemKind, IActionListDelegate, IActionListItem } from '../../../../../platform/actionWidget/browser/actionList.js';
import { IActionWidgetService } from '../../../../../platform/actionWidget/browser/actionWidget.js';
import { BrowserEditorInput } from '../../../../../workbench/contrib/browserView/common/browserEditorInput.js';
import { BrowserViewSharingState, IBrowserViewModel, IBrowserViewWorkbenchService } from '../../../../../workbench/contrib/browserView/common/browserView.js';
import { IEditorService } from '../../../../../workbench/services/editor/common/editorService.js';
import { ISessionsService } from '../../../../services/sessions/browser/sessionsService.js';
import { ChatOriginKind, IChat, ISession, SessionStatus } from '../../../../services/sessions/common/session.js';
import { IActiveSession } from '../../../../services/sessions/common/sessionsManagement.js';
import { SessionBackgroundActivitiesControl } from '../../browser/sessionBackgroundActivitiesControl.js';
import { isNonNegativeIntegerInput, weightedRandomDebugIncrement } from '../../browser/sessionChatInputToolbarDebug.js';

interface IControlSpec {
	readonly browsers?: readonly {
		readonly title?: string;
		readonly url?: string;
		readonly owner?: 'main' | 'subagent' | 'other' | 'unowned';
		readonly sharingState?: BrowserViewSharingState;
	}[];
	readonly subagents?: readonly string[];
	readonly subagentStatus?: SessionStatus;
	readonly enabled?: boolean;
}

interface IControlHarness {
	readonly control: SessionBackgroundActivitiesControl;
	readonly getPickerItems: () => readonly ICapturedPickerItem[];
	readonly selectPickerItem: (label: string) => void;
	readonly getBrowserOpenCount: () => number;
	readonly getOpenedBrowserId: () => string | undefined;
	readonly getOpenedChat: () => URI | undefined;
}

interface ICapturedPickerItem {
	readonly kind: ActionListItemKind;
	readonly label: string;
	readonly category: string;
	readonly icon: string;
	readonly select?: () => void;
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

	const inputs = (spec.browsers ?? []).map((browser, index) => {
		const ownerId = browser.owner === 'subagent'
			? subagents[0]?.resource.toString()
			: browser.owner === 'other' ? 'chat:other' : browser.owner === 'unowned' ? undefined : mainChat.resource.toString();
		const model = new class extends mock<IBrowserViewModel>() {
			override readonly owner = ownerId ? { mainWindowId: 1, sessionId: ownerId } : { mainWindowId: 1 };
			override readonly sharingState = browser.sharingState ?? BrowserViewSharingState.NotShared;
		}();
		return new class extends mock<BrowserEditorInput>() {
			override get id(): string { return `browser-${index}`; }
			override get model(): IBrowserViewModel { return model; }
			override get title(): string | undefined { return browser.title; }
			override get url(): string | undefined { return browser.url; }
			override readonly onDidChangeLabel = Event.None;
		}();
	});
	const knownBrowsers = new Map(inputs.map(input => [input.id, input]));
	const browserViewService = new class extends mock<IBrowserViewWorkbenchService>() {
		override readonly onDidChangeBrowserViews = Event.None;
		override getKnownBrowserViews() { return knownBrowsers; }
		override getContextualBrowserViews() { return knownBrowsers; }
		override async getPreferredGroup() { return undefined; }
	}();

	let pickerItems: ICapturedPickerItem[] = [];
	const actionWidgetService = new class extends mock<IActionWidgetService>() {
		override get isVisible() { return false; }
		override hide(): void { }
		override show<T>(_user: string, _supportsPreview: boolean, items: readonly IActionListItem<T>[], delegate: IActionListDelegate<T>): void {
			pickerItems = items.map(item => {
				const value = item.item;
				return {
					kind: item.kind,
					label: item.label ?? '',
					category: item.group?.title ?? '',
					icon: item.group?.icon?.id ?? '',
					select: value === undefined ? undefined : () => delegate.onSelect(value),
				};
			});
		}
	}();
	const selectPickerItem = (label: string) => {
		const item = pickerItems.find(item => item.label === label && item.select);
		if (!item?.select) {
			throw new Error(`Picker item '${label}' not found`);
		}
		item.select();
	};

	let browserOpenCount = 0;
	let openedBrowserId: string | undefined;
	const browserIds = new Map<object, string>(inputs.map(input => [input, input.id]));
	const editorService = new class extends mock<IEditorService>() {
		override findEditors() { return []; }
		override async openEditor(editor: object) {
			browserOpenCount++;
			openedBrowserId = browserIds.get(editor);
			return undefined;
		}
	}();
	let openedChat: URI | undefined;
	const sessionsService = new class extends mock<ISessionsService>() {
		override async openChat(_session: ISession, chatUri: URI): Promise<void> {
			openedChat = chatUri;
		}
	}();

	const control = store.add(new SessionBackgroundActivitiesControl(
		constObservable(session),
		constObservable(mainChat),
		constObservable(spec.enabled ?? true),
		browserViewService,
		actionWidgetService,
		editorService,
		sessionsService,
	));

	return {
		control,
		getPickerItems: () => pickerItems,
		selectPickerItem,
		getBrowserOpenCount: () => browserOpenCount,
		getOpenedBrowserId: () => openedBrowserId,
		getOpenedChat: () => openedChat,
	};
}

function summarize(control: SessionBackgroundActivitiesControl): { readonly text: string; readonly ariaLabel: string | null; readonly icons: readonly string[] } {
	const button = control.element.querySelector<HTMLElement>('.session-background-activities-button')!;
	const knownIcons = [Codicon.globe, Codicon.agent, Codicon.sessionInProgress, Codicon.chevronDown];
	return {
		text: button.textContent ?? '',
		ariaLabel: button.getAttribute('aria-label'),
		icons: [...button.querySelectorAll<HTMLElement>('.codicon')]
			.map(element => knownIcons.find(icon => element.classList.contains(`codicon-${icon.id}`))?.id ?? 'unknown'),
	};
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

	test('renders single and aggregate labels, icons, fallback, and subagent truncation', () => {
		const cases: IControlSpec[] = [
			{ browsers: [{ title: 'Visual Studio Code' }] },
			{ browsers: [{}] },
			{ subagents: ['Investigate the authentication failure in production'] },
			{ browsers: [{ title: 'Docs' }, { title: 'Preview' }] },
			{ subagents: ['Research', 'Review'] },
			{ browsers: [{ title: 'Preview' }], subagents: ['Research'] },
		];
		const disabled = createControl({ browsers: [{ title: 'Hidden browser' }], subagents: ['Research'], enabled: false }, store);

		assert.deepStrictEqual({
			enabled: cases.map(spec => summarize(createControl(spec, store).control)),
			disabledVisible: disabled.control.isVisible.get(),
		}, {
			enabled: [
				{ text: 'Visual Studio Code', ariaLabel: 'Open Visual Studio Code', icons: ['globe'] },
				{ text: 'Browser', ariaLabel: 'Open Browser', icons: ['globe'] },
				{ text: 'Investigate the authentication...', ariaLabel: 'Open Investigate the authentication...', icons: ['agent'] },
				{ text: '2 Active Browsers', ariaLabel: 'Show 2 background activities', icons: ['globe', 'chevron-down'] },
				{ text: '2 Active Subagents', ariaLabel: 'Show 2 background activities', icons: ['agent', 'chevron-down'] },
				{ text: '2 Background Activities', ariaLabel: 'Show 2 background activities', icons: ['session-in-progress', 'chevron-down'] },
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

	test('debug data forces activities while disabled and clears cleanly', () => {
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
			forced: {
				text: '2 Background Activities',
				ariaLabel: 'Show 2 background activities',
				icons: ['session-in-progress', 'chevron-down'],
			},
			visibleAfterClear: false,
		});
	});

	test('groups browsers before subagents with category headers, icons, and labels', async () => {
		const harness = createControl({
			browsers: [
				{ title: 'Docs' },
				{ title: 'Subagent Preview', owner: 'subagent' },
				{ title: 'Other Session', owner: 'other' },
			],
			subagents: ['Research', 'Review'],
		}, store);

		harness.control.element.querySelector<HTMLElement>('.session-background-activities-button')!.click();
		harness.selectPickerItem('Subagent Preview');
		await Promise.resolve();

		assert.deepStrictEqual({
			items: harness.getPickerItems().map(({ select: _select, ...item }) => item),
			openedBrowser: harness.getOpenedBrowserId(),
		}, {
			items: [
				{ kind: ActionListItemKind.Header, label: 'Browsers', category: 'Browsers', icon: '' },
				{ kind: ActionListItemKind.Action, label: 'Docs', category: '', icon: Codicon.globe.id },
				{ kind: ActionListItemKind.Action, label: 'Subagent Preview', category: '', icon: Codicon.globe.id },
				{ kind: ActionListItemKind.Separator, label: '', category: '', icon: '' },
				{ kind: ActionListItemKind.Header, label: 'Subagents', category: 'Subagents', icon: '' },
				{ kind: ActionListItemKind.Action, label: 'Research', category: '', icon: Codicon.agent.id },
				{ kind: ActionListItemKind.Action, label: 'Review', category: '', icon: Codicon.agent.id },
			],
			openedBrowser: 'browser-1',
		});
	});

	test('opens a single browser or subagent directly', async () => {
		const browser = createControl({ browsers: [{ title: 'Preview' }] }, store);
		browser.control.element.querySelector<HTMLElement>('.session-background-activities-button')!.click();
		await Promise.resolve();

		const subagent = createControl({ subagents: ['Research'] }, store);
		subagent.control.element.querySelector<HTMLElement>('.session-background-activities-button')!.click();

		assert.deepStrictEqual({
			browserOpenCount: browser.getBrowserOpenCount(),
			browserOpenedChat: browser.getOpenedChat()?.toString(),
			subagentBrowserOpenCount: subagent.getBrowserOpenCount(),
			subagentOpenedChat: subagent.getOpenedChat()?.toString(),
		}, {
			browserOpenCount: 1,
			browserOpenedChat: undefined,
			subagentBrowserOpenCount: 0,
			subagentOpenedChat: 'chat:subagent-0',
		});
	});

	test('prefers a shared browser for the same destination and otherwise opens the normal browser', async () => {
		const sharedHost = createControl({
			browsers: [
				{ title: 'Normal', url: 'https://example.com/start' },
				{ title: 'Shared Host', url: 'https://example.com/live', owner: 'unowned', sharingState: BrowserViewSharingState.Shared },
			],
		}, store);
		sharedHost.control.element.querySelector<HTMLElement>('.session-background-activities-button')!.click();
		await Promise.resolve();

		const sharedExact = createControl({
			browsers: [
				{ title: 'Normal', url: 'https://example.com/start' },
				{ title: 'Shared Host', url: 'https://example.com/live', owner: 'unowned', sharingState: BrowserViewSharingState.Shared },
				{ title: 'Shared Exact', url: 'https://example.com/start', owner: 'unowned', sharingState: BrowserViewSharingState.Shared },
			],
		}, store);
		sharedExact.control.element.querySelector<HTMLElement>('.session-background-activities-button')!.click();
		await Promise.resolve();

		const fallback = createControl({
			browsers: [
				{ title: 'Normal', url: 'https://example.com/start' },
				{ title: 'Unrelated Shared', url: 'https://other.test/live', owner: 'unowned', sharingState: BrowserViewSharingState.Shared },
			],
		}, store);
		fallback.control.element.querySelector<HTMLElement>('.session-background-activities-button')!.click();
		await Promise.resolve();

		assert.deepStrictEqual({
			sharedHost: sharedHost.getOpenedBrowserId(),
			sharedExact: sharedExact.getOpenedBrowserId(),
			fallback: fallback.getOpenedBrowserId(),
		}, {
			sharedHost: 'browser-1',
			sharedExact: 'browser-2',
			fallback: 'browser-0',
		});
	});
});
