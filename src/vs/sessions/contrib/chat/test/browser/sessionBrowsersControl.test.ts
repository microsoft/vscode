/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { Event } from '../../../../../base/common/event.js';
import { constObservable, observableValue } from '../../../../../base/common/observable.js';
import { URI } from '../../../../../base/common/uri.js';
import { mock } from '../../../../../base/test/common/mock.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
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
	/** Whether the user keeps the browsers pill visible. */
	readonly visible?: boolean;
	/** Start with only the main chat, so the subagent can be added later. */
	readonly withoutSubagent?: boolean;
}

interface IControlHarness {
	readonly control: SessionBrowsersControl;
	readonly getBrowserOpenCount: () => number;
	readonly getOpenedBrowserId: () => string | undefined;
	readonly addSubagent: () => void;
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
			override readonly owner = ownerId ? { type: 'agent' as const, sessionId: ownerId } : { type: 'user' as const };
			override readonly sharingState = browser.sharingState ?? BrowserViewSharingState.Available;
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
		constObservable(spec.visible ?? true),
		browserViewService,
		editorService,
	));

	return {
		control,
		getBrowserOpenCount: () => browserOpenCount,
		getOpenedBrowserId: () => openedBrowserId,
		addSubagent: () => chats.set([mainChat, subagent], undefined),
	};
}

/** The sections the control publishes, reduced to what the pill renders from. */
function sections(control: SessionBrowsersControl): readonly { readonly title: string; readonly entries: readonly { readonly label: string; readonly icon: string }[] }[] {
	return control.sections.get().map(section => ({
		title: section.title,
		entries: section.entries.map(entry => ({ label: entry.label, icon: entry.icon?.id ?? '' })),
	}));
}

/** Opens an entry, as the pill does on click or on selecting a dropdown row. */
function openEntry(control: SessionBrowsersControl, label?: string): void {
	const entries = control.sections.get().flatMap(section => section.entries);
	const entry = label ? entries.find(candidate => candidate.label === label) : entries[0];
	if (!entry) {
		throw new Error(`Browser entry '${label ?? '<first>'}' not found`);
	}
	entry.open();
}

suite('SessionBrowsersControl', () => {

	const store = ensureNoDisposablesAreLeakedInTestSuite();

	test('publishes browser entries with a fallback label', () => {
		const cases: IControlSpec[] = [
			{ browsers: [{ title: 'Visual Studio Code' }] },
			{ browsers: [{}] },
			{ browsers: [{ title: 'Docs' }, { title: 'Preview' }] },
		];

		assert.deepStrictEqual({
			enabled: cases.map(spec => sections(createControl(spec, store).control)),
			disabled: sections(createControl({ browsers: [{ title: 'Hidden browser' }], enabled: false }, store).control),
		}, {
			enabled: [
				[{ title: 'Browsers', entries: [{ label: 'Visual Studio Code', icon: 'globe' }] }],
				[{ title: 'Browsers', entries: [{ label: 'Browser', icon: 'globe' }] }],
				[{ title: 'Browsers', entries: [{ label: 'Preview', icon: 'globe' }, { label: 'Docs', icon: 'globe' }] }],
			],
			disabled: [],
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
		const forced = sections(harness.control);
		harness.control.setDebugData(undefined);

		assert.deepStrictEqual({ forced, afterClear: sections(harness.control) }, {
			forced: [{ title: 'Browsers', entries: [{ label: 'Debug Browser', icon: 'globe' }] }],
			afterClear: [],
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

		openEntry(harness.control, 'Subagent Preview');
		await Promise.resolve();

		assert.deepStrictEqual({
			sections: sections(harness.control),
			openedBrowser: harness.getOpenedBrowserId(),
		}, {
			sections: [{
				title: 'Browsers',
				entries: [{ label: 'Subagent Preview', icon: 'globe' }, { label: 'Docs', icon: 'globe' }],
			}],
			openedBrowser: 'browser-1',
		});
	});

	test('shows a subagent browser registered before the subagent joins the session', () => {
		const harness = createControl({ browsers: [{ title: 'Subagent Preview', owner: 'subagent' }], withoutSubagent: true }, store);
		const beforeJoin = sections(harness.control);
		harness.addSubagent();

		assert.deepStrictEqual({ beforeJoin, afterJoin: sections(harness.control) }, {
			beforeJoin: [],
			afterJoin: [{ title: 'Browsers', entries: [{ label: 'Subagent Preview', icon: 'globe' }] }],
		});
	});

	test('opens a single browser directly', async () => {
		const harness = createControl({ browsers: [{ title: 'Preview' }] }, store);
		openEntry(harness.control);
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
		openEntry(sharedHost.control, 'Normal');
		await Promise.resolve();

		const sharedExact = createControl({
			browsers: [
				{ title: 'Normal', url: 'https://example.com/start' },
				{ title: 'Shared Host', url: 'https://example.com/live', owner: 'unowned', sharingState: BrowserViewSharingState.Shared },
				{ title: 'Shared Exact', url: 'https://example.com/start', owner: 'unowned', sharingState: BrowserViewSharingState.Shared },
			],
		}, store);
		openEntry(sharedExact.control, 'Normal');
		await Promise.resolve();

		const fallback = createControl({
			browsers: [
				{ title: 'Normal', url: 'https://example.com/start' },
				{ title: 'Unrelated Shared', url: 'https://other.test/live', owner: 'unowned', sharingState: BrowserViewSharingState.Shared },
			],
		}, store);
		openEntry(fallback.control, 'Normal');
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

	test('publishes the listed browser URLs only while the pill is visible', () => {
		const browsers = [
			{ title: 'Docs', url: 'https://example.com/docs' },
			{ title: 'Subagent Preview', url: 'https://preview.test/', owner: 'subagent' as const },
			{ title: 'Other Session', url: 'https://other.test/', owner: 'other' as const },
			{ title: 'Blank' },
		];

		assert.deepStrictEqual({
			visible: [...createControl({ browsers }, store).control.urls.get()],
			hidden: {
				urls: [...createControl({ browsers, visible: false }, store).control.urls.get()],
				sections: sections(createControl({ browsers, visible: false }, store).control),
			},
			disabled: [...createControl({ browsers, enabled: false }, store).control.urls.get()],
		}, {
			visible: ['https://preview.test/', 'https://example.com/docs'],
			hidden: {
				urls: [],
				sections: [{
					title: 'Browsers',
					entries: [
						{ label: 'Blank', icon: 'globe' },
						{ label: 'Subagent Preview', icon: 'globe' },
						{ label: 'Docs', icon: 'globe' },
					],
				}],
			},
			disabled: [],
		});
	});
});
