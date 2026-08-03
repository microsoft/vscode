/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { Codicon } from '../../../../../base/common/codicons.js';
import { Event } from '../../../../../base/common/event.js';
import { constObservable, observableValue } from '../../../../../base/common/observable.js';
import { URI } from '../../../../../base/common/uri.js';
import { mock } from '../../../../../base/test/common/mock.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { ActionListItemKind, IActionListDelegate, IActionListItem } from '../../../../../platform/actionWidget/browser/actionList.js';
import { IActionWidgetService } from '../../../../../platform/actionWidget/browser/actionWidget.js';
import { BrowserEditorInput } from '../../../../../workbench/contrib/browserView/common/browserEditorInput.js';
import { BrowserViewSharingState, IBrowserViewModel, IBrowserViewWorkbenchService } from '../../../../../workbench/contrib/browserView/common/browserView.js';
import { IEditorService } from '../../../../../workbench/services/editor/common/editorService.js';
import { ChatOriginKind, IChat, SessionStatus } from '../../../../services/sessions/common/session.js';
import { IActiveSession } from '../../../../services/sessions/common/sessionsManagement.js';
import { SessionBrowsersControl } from '../../browser/sessionBrowsersControl.js';

interface IControlSpec {
	readonly browsers?: readonly {
		readonly title?: string;
		readonly url?: string;
		readonly owner?: 'main' | 'subagent' | 'other' | 'unowned';
		readonly sharingState?: BrowserViewSharingState;
	}[];
	readonly enabled?: boolean;
	/** Start with only the main chat, so the subagent can be added later. */
	readonly withoutSubagent?: boolean;
}

interface IControlHarness {
	readonly control: SessionBrowsersControl;
	readonly getPickerItems: () => readonly ICapturedPickerItem[];
	readonly selectPickerItem: (label: string) => void;
	readonly getBrowserOpenCount: () => number;
	readonly getOpenedBrowserId: () => string | undefined;
	readonly addSubagent: () => void;
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
	const subagent = new class extends mock<IChat>() {
		override readonly resource = URI.parse('chat:subagent-0');
		override readonly title = constObservable('Research');
		override readonly status = constObservable(SessionStatus.InProgress);
		override readonly origin = { kind: ChatOriginKind.Tool, parentChat: mainChat.resource };
	}();
	const chats = observableValue<readonly IChat[]>('chats', spec.withoutSubagent ? [mainChat] : [mainChat, subagent]);
	const session = new class extends mock<IActiveSession>() {
		override readonly resource = URI.parse('session:main');
		override readonly chats = chats;
	}();

	const inputs = (spec.browsers ?? []).map((browser, index) => {
		const ownerId = browser.owner === 'subagent'
			? subagent.resource.toString()
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

	const control = store.add(new SessionBrowsersControl(
		constObservable(session),
		constObservable(mainChat),
		constObservable(spec.enabled ?? true),
		browserViewService,
		actionWidgetService,
		editorService,
	));

	return {
		control,
		getPickerItems: () => pickerItems,
		selectPickerItem,
		getBrowserOpenCount: () => browserOpenCount,
		getOpenedBrowserId: () => openedBrowserId,
		addSubagent: () => chats.set([mainChat, subagent], undefined),
	};
}

function summarize(control: SessionBrowsersControl): { readonly text: string; readonly ariaLabel: string | null; readonly icons: readonly string[] } {
	const button = control.element.querySelector<HTMLElement>('.session-activity-pill-button')!;
	const knownIcons = [Codicon.globe, Codicon.agent, Codicon.sessionInProgress, Codicon.chevronDown];
	return {
		text: button.textContent ?? '',
		ariaLabel: button.getAttribute('aria-label'),
		icons: [...button.querySelectorAll<HTMLElement>('.codicon')]
			.map(element => knownIcons.find(icon => element.classList.contains(`codicon-${icon.id}`))?.id ?? 'unknown'),
	};
}

function click(control: SessionBrowsersControl): void {
	control.element.querySelector<HTMLElement>('.session-activity-pill-button')!.click();
}

suite('SessionBrowsersControl', () => {

	const store = ensureNoDisposablesAreLeakedInTestSuite();

	test('renders single and aggregate labels, icons, and fallback', () => {
		const cases: IControlSpec[] = [
			{ browsers: [{ title: 'Visual Studio Code' }] },
			{ browsers: [{}] },
			{ browsers: [{ title: 'Docs' }, { title: 'Preview' }] },
		];
		const disabled = createControl({ browsers: [{ title: 'Hidden browser' }], enabled: false }, store);

		assert.deepStrictEqual({
			enabled: cases.map(spec => summarize(createControl(spec, store).control)),
			disabledVisible: disabled.control.isVisible.get(),
		}, {
			enabled: [
				{ text: 'Visual Studio Code', ariaLabel: 'Open Visual Studio Code', icons: ['globe'] },
				{ text: 'Browser', ariaLabel: 'Open Browser', icons: ['globe'] },
				{ text: '2 Active Browsers', ariaLabel: 'Show 2 browsers', icons: ['globe', 'chevron-down'] },
			],
			disabledVisible: false,
		});
	});

	test('debug data forces browsers while disabled and clears cleanly', () => {
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
			forced: { text: 'Debug Browser', ariaLabel: 'Open Debug Browser', icons: ['globe'] },
			visibleAfterClear: false,
		});
	});

	test('lists browsers of the chat and its subagents, but not of other chats', async () => {
		const harness = createControl({
			browsers: [
				{ title: 'Docs' },
				{ title: 'Subagent Preview', owner: 'subagent' },
				{ title: 'Other Session', owner: 'other' },
			],
		}, store);

		click(harness.control);
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
			],
			openedBrowser: 'browser-1',
		});
	});

	test('shows a subagent browser registered before the subagent joins the session', () => {
		const harness = createControl({ browsers: [{ title: 'Subagent Preview', owner: 'subagent' }], withoutSubagent: true }, store);
		const beforeJoin = harness.control.isVisible.get();
		harness.addSubagent();

		assert.deepStrictEqual({ beforeJoin, afterJoin: summarize(harness.control) }, {
			beforeJoin: false,
			afterJoin: { text: 'Subagent Preview', ariaLabel: 'Open Subagent Preview', icons: ['globe'] },
		});
	});

	test('opens a single browser directly', async () => {
		const harness = createControl({ browsers: [{ title: 'Preview' }] }, store);
		click(harness.control);
		await Promise.resolve();

		assert.deepStrictEqual({
			openCount: harness.getBrowserOpenCount(),
			openedBrowser: harness.getOpenedBrowserId(),
		}, {
			openCount: 1,
			openedBrowser: 'browser-0',
		});
	});

	test('prefers a shared browser for the same destination and otherwise opens the normal browser', async () => {
		const sharedHost = createControl({
			browsers: [
				{ title: 'Normal', url: 'https://example.com/start' },
				{ title: 'Shared Host', url: 'https://example.com/live', owner: 'unowned', sharingState: BrowserViewSharingState.Shared },
			],
		}, store);
		click(sharedHost.control);
		await Promise.resolve();

		const sharedExact = createControl({
			browsers: [
				{ title: 'Normal', url: 'https://example.com/start' },
				{ title: 'Shared Host', url: 'https://example.com/live', owner: 'unowned', sharingState: BrowserViewSharingState.Shared },
				{ title: 'Shared Exact', url: 'https://example.com/start', owner: 'unowned', sharingState: BrowserViewSharingState.Shared },
			],
		}, store);
		click(sharedExact.control);
		await Promise.resolve();

		const fallback = createControl({
			browsers: [
				{ title: 'Normal', url: 'https://example.com/start' },
				{ title: 'Unrelated Shared', url: 'https://other.test/live', owner: 'unowned', sharingState: BrowserViewSharingState.Shared },
			],
		}, store);
		click(fallback.control);
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
