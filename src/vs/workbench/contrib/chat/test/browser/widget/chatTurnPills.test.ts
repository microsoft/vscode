/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { Action } from '../../../../../../base/common/actions.js';
import { mainWindow } from '../../../../../../base/browser/window.js';
import { toDisposable } from '../../../../../../base/common/lifecycle.js';
import { constObservable, observableValue } from '../../../../../../base/common/observable.js';
import { URI } from '../../../../../../base/common/uri.js';
import { mock } from '../../../../../../base/test/common/mock.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../../base/test/common/utils.js';
import { ActionListItemKind, IActionListItem } from '../../../../../../platform/actionWidget/browser/actionList.js';
import { IActionWidgetService } from '../../../../../../platform/actionWidget/browser/actionWidget.js';
import { TestConfigurationService } from '../../../../../../platform/configuration/test/common/testConfigurationService.js';
import { IOpenerService, OpenExternalOptions, OpenInternalOptions } from '../../../../../../platform/opener/common/opener.js';
import { BrowserViewEditorId } from '../../../../browserView/common/browserView.js';
import { chatArtifactPillOptions, ChatTurnPillsWidget, EMPTY_DIFF_STATS, openChatTurnFile, previewKind } from '../../../browser/widget/chatTurnPills.js';
import { Codicon } from '../../../../../../base/common/codicons.js';
import { ChatPillActionViewItem, ChatPillsWidget, IChatPill, type IChatPillEntry, type IChatPillSection } from '../../../../../browser/chatPills.js';
import { ChatChangesPillActionViewItem, EMPTY_CHAT_CHANGES_STATS } from '../../../../../browser/chatChangesPill.js';
import { ChatDropdownPillActionViewItem } from '../../../../../browser/chatDropdownPill.js';
import { ChatResourcePillActionViewItem } from '../../../../../browser/chatResourcePill.js';
import { DEFAULT_LABELS_CONTAINER, ResourceLabels } from '../../../../../browser/labels.js';
import type { IActionViewItem } from '../../../../../../base/browser/ui/actionbar/actionbar.js';
import { ChatConfiguration } from '../../../common/constants.js';
import { workbenchInstantiationService } from '../../../../../test/browser/workbenchTestServices.js';

suite('ChatTurnPills', () => {
	const disposables = ensureNoDisposablesAreLeakedInTestSuite();

	test('renders an observable set of generic chat pills', () => {
		const instantiationService = workbenchInstantiationService(undefined, disposables);
		const action = disposables.add(new Action('test.chatPill', 'Session Changes'));
		const pills = observableValue<readonly IChatPill[]>(disposables, []);
		const widget = disposables.add(instantiationService.createInstance(ChatPillsWidget, { pills }, undefined));
		let pillChangeCount = 0;
		disposables.add(widget.onDidChangePills(() => pillChangeCount++));

		pills.set([{ action }], undefined);
		const visible = {
			hidden: widget.element.classList.contains('hidden'),
			labels: [...widget.element.querySelectorAll<HTMLElement>('.chat-pill-label')].map(element => element.textContent),
			platformElementCount: widget.getPillElements().length,
		};
		pills.set([], undefined);

		assert.deepStrictEqual({
			visible,
			hiddenAfterClear: widget.element.classList.contains('hidden'),
			platformElementCountAfterClear: widget.getPillElements().length,
			pillChangeCount,
		}, {
			visible: {
				hidden: false,
				labels: ['Session Changes'],
				platformElementCount: 1,
			},
			hiddenAfterClear: true,
			platformElementCountAfterClear: 0,
			pillChangeCount: 2,
		});
	});

	test('every pill implementation renders with the shared and its own classes', () => {
		const instantiationService = workbenchInstantiationService(undefined, disposables);
		const action = disposables.add(new Action('test.pill', 'Pill'));
		const resourceLabels = disposables.add(instantiationService.createInstance(ResourceLabels, DEFAULT_LABELS_CONTAINER));
		const entry: IChatPillEntry = { id: 'plan', label: 'plan.md', resource: URI.file('/repo/plan.md'), open: () => { } };

		const items: readonly [string, IActionViewItem][] = [
			['icon+label', disposables.add(new ChatPillActionViewItem(undefined, action, {}))],
			['changes', disposables.add(new ChatChangesPillActionViewItem(action, {}, constObservable(EMPTY_CHAT_CHANGES_STATS), instantiationService))],
			['resource', disposables.add(new ChatResourcePillActionViewItem(action, {}, constObservable(entry), resourceLabels))],
			['dropdown', disposables.add(instantiationService.createInstance(ChatDropdownPillActionViewItem, action, {}, constObservable<readonly IChatPillSection[]>([{ title: 'Files', entries: [entry] }]), chatArtifactPillOptions))],
		];

		// Rendering is what caught a `classList.add` crash from a space-separated
		// class name, so exercise every implementation's render path.
		const rendered = items.map(([name, item]) => {
			const container = document.createElement('div');
			mainWindow.document.body.appendChild(container);
			disposables.add(toDisposable(() => container.remove()));
			item.render(container);
			return [name, [...container.classList].join(' '), [...container.querySelector('.monaco-button')!.classList].filter(c => c.startsWith('chat-')).join(' ')];
		});

		assert.deepStrictEqual(rendered, [
			['icon+label', 'chat-pill-item', 'chat-pill-button'],
			['changes', 'chat-pill-item chat-changes-pill', 'chat-pill-button chat-changes-pill-button'],
			['resource', 'chat-pill-item chat-resource-pill', 'chat-pill-button chat-resource-pill-button'],
			['dropdown', 'chat-pill-item chat-dropdown-pill', 'chat-pill-button chat-dropdown-pill-button'],
		]);
	});

	test('keeps an actionable accessible name when a single entry has a location tooltip', () => {
		const instantiationService = workbenchInstantiationService(undefined, disposables);
		const action = disposables.add(new Action('test.pill', 'Artifact'));
		const resourceLabels = disposables.add(instantiationService.createInstance(ResourceLabels, DEFAULT_LABELS_CONTAINER));
		const entry: IChatPillEntry = {
			id: 'plan',
			label: 'plan.md',
			resource: URI.file('/repo/plan.md'),
			ariaLabel: 'Open plan.md',
			tooltip: 'file:///repo/plan.md',
			open: () => { },
		};
		const items: readonly IActionViewItem[] = [
			disposables.add(new ChatResourcePillActionViewItem(action, {}, constObservable(entry), resourceLabels)),
			disposables.add(instantiationService.createInstance(ChatDropdownPillActionViewItem, action, {}, constObservable<readonly IChatPillSection[]>([{ title: 'Files', entries: [entry] }]), chatArtifactPillOptions)),
		];

		const ariaLabels = items.map(item => {
			const container = document.createElement('div');
			mainWindow.document.body.appendChild(container);
			disposables.add(toDisposable(() => container.remove()));
			item.render(container);
			return container.querySelector('.monaco-button')?.getAttribute('aria-label');
		});

		assert.deepStrictEqual(ariaLabels, ['Open plan.md', 'Open plan.md']);
	});

	test('focusing a pill restores its tab stop, so the row stays reachable by Tab', () => {
		const action = disposables.add(new Action('test.pill', 'Pull Requests'));
		const item = disposables.add(new ChatPillActionViewItem(undefined, action, {}));
		const container = document.createElement('div');
		mainWindow.document.body.appendChild(container);
		disposables.add(toDisposable(() => container.remove()));
		item.render(container);
		const button = container.querySelector<HTMLElement>('.chat-pill-button')!;

		// The toolbar makes every non-first item unfocusable, then moves focus with
		// blur/focus as the arrow keys travel. The item taking focus has to become
		// the row's tab stop, or Shift+Tab can never return to it.
		item.setFocusable(false);
		const afterSetFocusable = button.tabIndex;
		item.focus();
		const afterFocus = button.tabIndex;
		item.blur();

		assert.deepStrictEqual({ afterSetFocusable, afterFocus, afterBlur: button.tabIndex }, {
			afterSetFocusable: -1,
			afterFocus: 0,
			afterBlur: -1,
		});
	});

	test('resolves the pill under a right-click, and nothing outside the pills', () => {
		const instantiationService = workbenchInstantiationService(undefined, disposables);
		const first = disposables.add(new Action('test.pill.first', 'First'));
		const second = disposables.add(new Action('test.pill.second', 'Second'));
		const widget = disposables.add(instantiationService.createInstance(ChatPillsWidget, { pills: constObservable([{ action: first }, { action: second }]) }, undefined));
		mainWindow.document.body.appendChild(widget.element);
		disposables.add(toDisposable(() => widget.element.remove()));

		const labels = [...widget.element.querySelectorAll<HTMLElement>('.chat-pill-label')];
		assert.strictEqual(labels.length, 2);

		assert.deepStrictEqual({
			// Resolves from a descendant of the pill, not just the item root.
			firstLabel: widget.getPill(labels[0])?.action.id,
			secondLabel: widget.getPill(labels[1])?.action.id,
			outside: widget.getPill(widget.element)?.action.id,
			nothing: widget.getPill(undefined)?.action.id,
		}, {
			firstLabel: 'test.pill.first',
			secondLabel: 'test.pill.second',
			outside: undefined,
			nothing: undefined,
		});
	});

	test('lets a right-click on a pill escape the toolbar only when context menus are allowed', () => {
		const instantiationService = workbenchInstantiationService(undefined, disposables);

		const dispatchOnPill = (allowContextMenu: boolean): boolean => {
			const action = disposables.add(new Action('test.chatPill', 'Session Changes'));
			const widget = disposables.add(instantiationService.createInstance(ChatPillsWidget, { pills: constObservable([{ action }]) }, { allowContextMenu }));
			mainWindow.document.body.appendChild(widget.element);
			disposables.add(toDisposable(() => widget.element.remove()));

			// The row's visibility menu listens on an ancestor, so the event has to
			// bubble past the toolbar item to be seen at all.
			let escaped = false;
			const host = widget.element.parentElement!;
			const probe = () => { escaped = true; };
			host.addEventListener('contextmenu', probe);
			widget.element.querySelector<HTMLElement>('.chat-pill-button')!
				.dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, cancelable: true }));
			host.removeEventListener('contextmenu', probe);
			return escaped;
		};

		assert.deepStrictEqual({
			allowed: dispatchOnPill(true),
			swallowed: dispatchOnPill(false),
		}, {
			allowed: true,
			swallowed: false,
		});
	});

	test('summarizes multiple artifacts and groups the dropdown by section', () => {
		const instantiationService = workbenchInstantiationService(undefined, disposables);
		let shownItems: readonly { readonly kind: ActionListItemKind; readonly label: string | undefined; readonly ariaDescription: string | undefined; readonly hover: string | undefined }[] = [];
		instantiationService.stub(IActionWidgetService, new class extends mock<IActionWidgetService>() {
			override get isVisible(): boolean { return false; }
			override show<T>(_user: string, _supportsPreview: boolean, items: readonly IActionListItem<T>[]): void {
				shownItems = items.map(item => ({ kind: item.kind, label: item.label, ariaDescription: item.ariaDescription, hover: typeof item.hover?.content === 'string' ? item.hover.content : undefined }));
			}
		});
		const opened: string[] = [];
		const widget = disposables.add(instantiationService.createInstance(ChatTurnPillsWidget, {
			stats: constObservable(EMPTY_DIFF_STATS),
			artifacts: constObservable<readonly IChatPillSection[]>([
				{ title: 'Pull Requests', entries: [{ id: 'pr', label: '#12', icon: Codicon.gitPullRequest, ariaDescription: 'Pull request URL', hover: { content: 'https://github.com/microsoft/vscode/pull/12' }, open: () => opened.push('pr') }] },
				{ title: 'Files', entries: [{ id: 'file', label: 'plan.md', resource: URI.file('/artifacts/plan.md'), open: () => opened.push('file') }] },
			]),
			changesEnabled: constObservable(false),
			artifactsEnabled: constObservable(true),
			openChanges() { },
		}));
		mainWindow.document.body.appendChild(widget.element);
		disposables.add(toDisposable(() => widget.element.remove()));

		// The dropdown pill renders through the shared pill button now.
		const button = widget.element.querySelector<HTMLElement>('.chat-pill-button');
		assert.ok(button);
		button.click();

		assert.deepStrictEqual({
			label: button.querySelector<HTMLElement>('.chat-pill-label')?.textContent,
			ariaLabel: button.getAttribute('aria-label'),
			dropdownItems: shownItems.map(item => ({
				kind: item.kind,
				label: item.label,
				ariaDescription: item.ariaDescription,
				hover: item.hover,
			})),
		}, {
			label: '2 Artifacts',
			ariaLabel: 'Show 2 artifacts',
			dropdownItems: [
				{ kind: ActionListItemKind.Header, label: 'Pull Requests', ariaDescription: undefined, hover: undefined },
				{ kind: ActionListItemKind.Action, label: '#12', ariaDescription: 'Pull request URL', hover: 'https://github.com/microsoft/vscode/pull/12' },
				{ kind: ActionListItemKind.Separator, label: '', ariaDescription: undefined, hover: undefined },
				{ kind: ActionListItemKind.Header, label: 'Files', ariaDescription: undefined, hover: undefined },
				{ kind: ActionListItemKind.Action, label: 'plan.md', ariaDescription: undefined, hover: undefined },
			],
		});
	});

	test('opens a markdown resource with its configured chat editor association', async () => {
		const resource = URI.file('/workspace/README.md');
		let opened: { resource: string; options: OpenInternalOptions | OpenExternalOptions | undefined } | undefined;
		const openerService = new class extends mock<IOpenerService>() {
			override async open(resource: string | URI, options?: OpenInternalOptions | OpenExternalOptions): Promise<boolean> {
				opened = { resource: resource.toString(), options };
				return true;
			}
		};
		const configurationService = new TestConfigurationService({
			[ChatConfiguration.EditorAssociations]: {
				'*.md': 'vscode.markdown.editor',
			},
		});

		await openChatTurnFile({ uri: resource, kind: 'markdown', created: true }, openerService, configurationService);

		assert.deepStrictEqual(opened, {
			resource: resource.toString(),
			options: {
				fromUserGesture: true,
				editorOptions: {
					override: 'vscode.markdown.editor',
				},
			},
		});
	});

	test('classifies supported preview resources', () => {
		assert.deepStrictEqual([
			previewKind(URI.file('/workspace/README.md'), true),
			previewKind(URI.file('/workspace/index.html'), true),
			previewKind(URI.file('/workspace/index.HTM'), true),
			previewKind(URI.parse('vscode-remote://authority/workspace/index.html'), true),
			previewKind(URI.file('/workspace/index.ts'), true),
		], [
			'markdown',
			'html',
			'html',
			undefined,
			undefined,
		]);
	});

	test('does not classify HTML when its preview is unavailable', () => {
		assert.strictEqual(previewKind(URI.file('/workspace/index.html'), false), undefined);
	});

	test('opens an HTML resource in the Integrated Browser', async () => {
		const resource = URI.file('/workspace/index.html');
		let opened: { resource: string; options: OpenInternalOptions | OpenExternalOptions | undefined } | undefined;
		const openerService = new class extends mock<IOpenerService>() {
			override async open(resource: string | URI, options?: OpenInternalOptions | OpenExternalOptions): Promise<boolean> {
				opened = { resource: resource.toString(), options };
				return true;
			}
		};

		await openChatTurnFile({ uri: resource, kind: 'html', created: true }, openerService, new TestConfigurationService());

		assert.deepStrictEqual(opened, {
			resource: resource.toString(),
			options: {
				fromUserGesture: true,
				editorOptions: {
					override: BrowserViewEditorId,
				},
			},
		});
	});

	test('prefers a configured chat editor association over the Integrated Browser', async () => {
		const resource = URI.file('/workspace/index.html');
		let opened: { resource: string; options: OpenInternalOptions | OpenExternalOptions | undefined } | undefined;
		const openerService = new class extends mock<IOpenerService>() {
			override async open(resource: string | URI, options?: OpenInternalOptions | OpenExternalOptions): Promise<boolean> {
				opened = { resource: resource.toString(), options };
				return true;
			}
		};
		const configurationService = new TestConfigurationService({
			[ChatConfiguration.EditorAssociations]: {
				'*.html': 'default',
			},
		});

		await openChatTurnFile({ uri: resource, kind: 'html', created: true }, openerService, configurationService);

		assert.deepStrictEqual(opened, {
			resource: resource.toString(),
			options: {
				fromUserGesture: true,
				editorOptions: {
					override: 'default',
				},
			},
		});
	});
});
