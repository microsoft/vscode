/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { getWindow } from '../../../base/browser/dom.js';
import { ensureCodeWindow, mainWindow } from '../../../base/browser/window.js';
import type { IManagedHoverContent } from '../../../base/browser/ui/hover/hover.js';
import { timeout } from '../../../base/common/async.js';
import { Action } from '../../../base/common/actions.js';
import { Codicon } from '../../../base/common/codicons.js';
import { DisposableStore, toDisposable } from '../../../base/common/lifecycle.js';
import { constObservable, derived, observableValue } from '../../../base/common/observable.js';
import { URI } from '../../../base/common/uri.js';
import { mock } from '../../../base/test/common/mock.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../base/test/common/utils.js';
import { IActionListDelegate, IActionListItem } from '../../../platform/actionWidget/browser/actionList.js';
import { IActionWidgetService } from '../../../platform/actionWidget/browser/actionWidget.js';
import { ChatDropdownPillActionViewItem, ChatPillSingleEntry, createChatSectionPill } from '../../browser/chatDropdownPill.js';
import { ChatPillsRow, ChatPillsWidget, type IChatPill, type IChatPillEntry, type IChatPillSection } from '../../browser/chatPills.js';
import { DEFAULT_LABELS_CONTAINER, ResourceLabels } from '../../browser/labels.js';
import { workbenchInstantiationService } from './workbenchTestServices.js';

const getDropdownPillHoverContents = Reflect.get(ChatDropdownPillActionViewItem.prototype, 'getHoverContents') as (this: ChatDropdownPillActionViewItem) => IManagedHoverContent;

suite('ChatPills', () => {
	const store = ensureNoDisposablesAreLeakedInTestSuite();

	test('keeps an empty compact pill row keyboard-accessible', async () => {
		const disposables = store.add(new DisposableStore());
		const row = disposables.add(new ChatPillsRow('ChatPills.test', { compact: true }));
		mainWindow.document.body.appendChild(row.element);
		disposables.add(toDisposable(() => row.element.remove()));
		let contextMenuRequests = 0;
		let contextMenuTarget: HTMLElement | undefined;
		disposables.add(row.onDidRequestContextMenu(target => {
			contextMenuRequests++;
			contextMenuTarget = target;
		}));

		row.setEmpty(true, 'Configure Session Status Pills');
		const event = new mainWindow.KeyboardEvent('keydown', { bubbles: true });
		Object.defineProperty(event, 'keyCode', { value: 13 });
		row.content.dispatchEvent(event);
		row.restoreFocus(() => []);
		await timeout(0);
		const emptyState = {
			compact: row.element.classList.contains('compact'),
			role: row.content.getAttribute('role'),
			ariaLabel: row.content.getAttribute('aria-label'),
			ariaHasPopup: row.content.getAttribute('aria-haspopup'),
			tabIndex: row.content.tabIndex,
			contextMenuRequests,
			focused: mainWindow.document.activeElement === row.content,
			contextTarget: contextMenuTarget === row.content,
		};
		const pill = mainWindow.document.createElement('button');
		row.content.appendChild(pill);
		row.setEmpty(false, '');
		row.restoreFocus(() => [pill]);
		await timeout(0);

		assert.deepStrictEqual({
			emptyState,
			restored: {
				role: row.content.getAttribute('role'),
				ariaLabel: row.content.getAttribute('aria-label'),
				ariaHasPopup: row.content.getAttribute('aria-haspopup'),
				tabIndex: row.content.getAttribute('tabindex'),
				pillFocused: mainWindow.document.activeElement === pill,
			},
		}, {
			emptyState: {
				compact: true,
				role: 'button',
				ariaLabel: 'Configure Session Status Pills',
				ariaHasPopup: 'menu',
				tabIndex: 0,
				contextMenuRequests: 1,
				focused: true,
				contextTarget: true,
			},
			restored: {
				role: null,
				ariaLabel: null,
				ariaHasPopup: null,
				tabIndex: null,
				pillFocused: true,
			},
		});

		disposables.dispose();
	});

	test('uses the main DOM realm and target auxiliary window', () => {
		const disposables = store.add(new DisposableStore());
		const iframe = mainWindow.document.createElement('iframe');
		mainWindow.document.body.appendChild(iframe);
		disposables.add(toDisposable(() => iframe.remove()));
		const auxiliaryWindow = iframe.contentWindow!;
		ensureCodeWindow(auxiliaryWindow, 999);

		const row = disposables.add(new ChatPillsRow('ChatPills.auxiliaryWindowTest', { targetWindow: auxiliaryWindow }));
		auxiliaryWindow.document.body.appendChild(row.element);

		assert.deepStrictEqual({
			contentDocument: row.content.ownerDocument === auxiliaryWindow.document,
			elementDocument: row.element.ownerDocument === auxiliaryWindow.document,
			contentUsesMainPrototype: Object.getPrototypeOf(row.content) === mainWindow.HTMLDivElement.prototype,
			elementUsesMainPrototype: Object.getPrototypeOf(row.element) === mainWindow.HTMLDivElement.prototype,
			windowId: getWindow(row.content).vscodeWindowId,
		}, {
			contentDocument: true,
			elementDocument: true,
			contentUsesMainPrototype: true,
			elementUsesMainPrototype: true,
			windowId: 999,
		});

		disposables.dispose();
	});

	test('compact rows collapse pill details while retaining icons', () => {
		const disposables = store.add(new DisposableStore());
		const row = disposables.add(new ChatPillsRow('ChatPills.compactTest', { compact: true }));
		mainWindow.document.body.appendChild(row.element);
		disposables.add(toDisposable(() => row.element.remove()));

		const button = mainWindow.document.createElement('button');
		button.className = 'monaco-button chat-pill-button chat-resource-pill-button';
		const item = mainWindow.document.createElement('div');
		item.className = 'chat-pill-item';
		const icon = mainWindow.document.createElement('span');
		icon.className = 'chat-pill-icon';
		const label = mainWindow.document.createElement('span');
		label.className = 'chat-pill-label';
		const counter = mainWindow.document.createElement('div');
		counter.className = 'monaco-animated-counter';
		const chevron = mainWindow.document.createElement('span');
		chevron.className = 'chat-pill-chevron';
		const resourceIcon = mainWindow.document.createElement('span');
		resourceIcon.className = 'chat-resource-pill-compact-icon';
		const resourceName = mainWindow.document.createElement('span');
		resourceName.className = 'monaco-icon-label';
		button.append(icon, label, counter, chevron, resourceIcon, resourceName);
		item.appendChild(button);
		row.content.appendChild(item);

		const compactState = {
			iconVisible: mainWindow.getComputedStyle(icon).display !== 'none',
			labelVisible: mainWindow.getComputedStyle(label).display !== 'none',
			counterVisible: mainWindow.getComputedStyle(counter).display !== 'none',
			chevronVisible: mainWindow.getComputedStyle(chevron).display !== 'none',
			resourceIconVisible: mainWindow.getComputedStyle(resourceIcon).display !== 'none',
			resourceNameVisible: mainWindow.getComputedStyle(resourceName).display !== 'none',
		};
		row.element.classList.remove('compact');

		assert.deepStrictEqual({
			compactState,
			expandedResourceIconVisible: mainWindow.getComputedStyle(resourceIcon).display !== 'none',
		}, {
			compactState: {
				iconVisible: true,
				labelVisible: false,
				counterVisible: false,
				chevronVisible: false,
				resourceIconVisible: true,
				resourceNameVisible: false,
			},
			expandedResourceIconVisible: false,
		});

		disposables.dispose();
	});

	test('automatic compact mode follows available width', () => {
		const disposables = store.add(new DisposableStore());
		const row = disposables.add(new ChatPillsRow('ChatPills.responsiveTest', { compact: 'auto' }));
		row.element.style.width = '600px';
		mainWindow.document.body.appendChild(row.element);
		disposables.add(toDisposable(() => row.element.remove()));

		const item = mainWindow.document.createElement('div');
		item.className = 'chat-pill-item';
		const button = mainWindow.document.createElement('button');
		button.className = 'monaco-button chat-pill-button';
		const icon = mainWindow.document.createElement('span');
		icon.className = 'chat-pill-icon';
		const label = mainWindow.document.createElement('span');
		label.className = 'chat-pill-label';
		label.textContent = 'A detailed pill label that needs room';
		button.append(icon, label);
		item.appendChild(button);
		row.content.appendChild(item);

		row.layout();
		const wideCompact = row.element.classList.contains('compact');
		row.element.style.width = '500px';
		row.layout();
		const mediumCompact = row.element.classList.contains('compact');
		row.element.style.width = '40px';
		row.layout();
		const narrowCompact = row.element.classList.contains('compact');
		row.element.style.width = '600px';
		row.layout();

		assert.deepStrictEqual({
			wideCompact,
			mediumCompact,
			narrowCompact,
			expandedAgain: !row.element.classList.contains('compact'),
		}, {
			wideCompact: false,
			mediumCompact: false,
			narrowCompact: true,
			expandedAgain: true,
		});

		disposables.dispose();
	});

	test('preserves existing pill DOM when membership changes', () => {
		const disposables = store.add(new DisposableStore());
		const instantiationService = workbenchInstantiationService(undefined, disposables);
		const firstPill: IChatPill = { action: disposables.add(new Action('first', 'First')) };
		const secondPill: IChatPill = { action: disposables.add(new Action('second', 'Second')) };
		const pills = observableValue<readonly IChatPill[]>('chatPills.membership', [firstPill]);
		const widget = disposables.add(instantiationService.createInstance(ChatPillsWidget, { pills }, undefined));
		mainWindow.document.body.appendChild(widget.element);
		disposables.add(toDisposable(() => widget.element.remove()));
		const firstButton = widget.getPillElements()[0];
		firstButton.focus();

		pills.set([firstPill, secondPill], undefined);
		const afterAdd = widget.getPillElements();
		const focusPreservedAfterAdd = mainWindow.document.activeElement === firstButton;
		pills.set([secondPill], undefined);
		const afterRemove = widget.getPillElements();

		assert.deepStrictEqual({
			afterAddCount: afterAdd.length,
			firstPreservedAfterAdd: afterAdd[0] === firstButton,
			focusPreservedAfterAdd,
			afterRemoveCount: afterRemove.length,
			remainingTabIndex: afterRemove[0].tabIndex,
			focusMovedAfterRemove: mainWindow.document.activeElement === afterRemove[0],
		}, {
			afterAddCount: 2,
			firstPreservedAfterAdd: true,
			focusPreservedAfterAdd: true,
			afterRemoveCount: 1,
			remainingTabIndex: 0,
			focusMovedAfterRemove: true,
		});

		disposables.dispose();
	});

	test('keeps a section pill stable while its visible presentation is unchanged', () => {
		const disposables = store.add(new DisposableStore());
		const instantiationService = workbenchInstantiationService(undefined, disposables);
		const resourceLabels = disposables.add(instantiationService.createInstance(ResourceLabels, DEFAULT_LABELS_CONTAINER));
		const action = disposables.add(new Action('pullRequests', 'Pull Requests'));
		const entry = (id: string): IChatPillEntry => ({
			id,
			label: `Pull Request #${id}`,
			open: () => { },
		});
		const sections = observableValue<readonly IChatPillSection[]>('chatPills.sections', [{
			title: 'Pull Requests',
			entries: [entry('1'), entry('2')],
		}]);
		const pill = createChatSectionPill(action, sections, {
			widgetId: 'pullRequests',
			icon: Codicon.gitPullRequest,
			title: 'Pull Requests',
			summaryLabel: count => `${count} Pull Requests`,
			summaryAriaLabel: count => `Show ${count} pull requests`,
			singleEntry: ChatPillSingleEntry.InlineResource,
		}, resourceLabels, instantiationService);
		const widget = disposables.add(instantiationService.createInstance(ChatPillsWidget, { pills: pill.map(value => [value]) }, undefined));
		mainWindow.document.body.appendChild(widget.element);
		disposables.add(toDisposable(() => widget.element.remove()));
		const descriptor = pill.get();
		const button = widget.getPillElements()[0];
		const label = button.querySelector('.chat-pill-label');

		sections.set([{
			title: 'Pull Requests',
			entries: [
				{ ...entry('1'), resource: URI.parse('https://github.com/microsoft/vscode/pull/1') },
				entry('2'),
			],
		}], undefined);

		assert.deepStrictEqual({
			descriptorPreserved: pill.get() === descriptor,
			buttonPreserved: widget.getPillElements()[0] === button,
			labelPreserved: button.querySelector('.chat-pill-label') === label,
			labelText: label?.textContent,
		}, {
			descriptorPreserved: true,
			buttonPreserved: true,
			labelPreserved: true,
			labelText: '2 Pull Requests',
		});

		disposables.dispose();
	});

	test('uses optional rich hover content only for an inline entry', () => {
		const disposables = store.add(new DisposableStore());
		const instantiationService = workbenchInstantiationService(undefined, disposables);
		const action = disposables.add(new Action('pullRequests', 'Pull Requests'));
		const richHover: IManagedHoverContent = { element: () => mainWindow.document.createElement('div') };
		const entry = (id: string, pillHover?: IManagedHoverContent): IChatPillEntry => ({
			id,
			label: `Pull Request #${id}`,
			tooltip: `https://github.com/microsoft/vscode/pull/${id}`,
			...(pillHover !== undefined ? { pillHover } : {}),
			open: () => { },
		});
		const sections = observableValue<readonly IChatPillSection[]>('chatPills.hoverSections', [{
			title: 'Pull Requests',
			entries: [entry('1')],
		}]);
		const viewItem = disposables.add(instantiationService.createInstance(ChatDropdownPillActionViewItem, action, {}, sections, {
			widgetId: 'pullRequests',
			icon: Codicon.gitPullRequest,
			title: 'Pull Requests',
			summaryLabel: count => `${count} Pull Requests`,
			summaryAriaLabel: count => `Show ${count} pull requests`,
		}));
		const container = mainWindow.document.createElement('div');
		mainWindow.document.body.appendChild(container);
		disposables.add(toDisposable(() => container.remove()));
		viewItem.render(container);

		const fallbackHover = getDropdownPillHoverContents.call(viewItem);
		sections.set([{ title: 'Pull Requests', entries: [entry('1', richHover)] }], undefined);
		const enrichedHover = getDropdownPillHoverContents.call(viewItem);
		sections.set([{ title: 'Pull Requests', entries: [entry('1', richHover), entry('2')] }], undefined);
		const summaryHover = getDropdownPillHoverContents.call(viewItem);

		assert.deepStrictEqual({
			fallbackHover,
			usesRichHover: enrichedHover === richHover,
			summaryHover,
		}, {
			fallbackHover: 'https://github.com/microsoft/vscode/pull/1',
			usesRichHover: true,
			summaryHover: 'Show 2 pull requests',
		});

		disposables.dispose();
	});

	test('updates and closes an open section dropdown when entries change', () => {
		const disposables = store.add(new DisposableStore());
		const instantiationService = workbenchInstantiationService(undefined, disposables);
		let visible = false;
		let onHide: ((didCancel?: boolean) => void) | undefined;
		let shownLabels: readonly (string | undefined)[] = [];
		let updatedLabels: readonly (string | undefined)[] = [];
		let hideCount = 0;
		const dropdownFocus = mainWindow.document.createElement('button');
		mainWindow.document.body.appendChild(dropdownFocus);
		disposables.add(toDisposable(() => dropdownFocus.remove()));
		const actionWidgetService = new class extends mock<IActionWidgetService>() {
			override get isVisible(): boolean { return visible; }
			override show<T>(_user: string, _supportsPreview: boolean, items: readonly IActionListItem<T>[], delegate: IActionListDelegate<T>): void {
				visible = true;
				shownLabels = items.map(item => item.label);
				onHide = delegate.onHide;
				dropdownFocus.focus();
			}
			override updateItems<T>(items: readonly IActionListItem<T>[]): void {
				updatedLabels = items.map(item => item.label);
			}
			override hide(didCancel?: boolean): void {
				hideCount++;
				visible = false;
				onHide?.(didCancel);
			}
		}();
		instantiationService.stub(IActionWidgetService, actionWidgetService);
		const resourceLabels = disposables.add(instantiationService.createInstance(ResourceLabels, DEFAULT_LABELS_CONTAINER));
		const action = disposables.add(new Action('pullRequests', 'Pull Requests'));
		const entry = (id: string): IChatPillEntry => ({
			id,
			label: `Pull Request #${id}`,
			open: () => { },
		});
		const sections = observableValue<readonly IChatPillSection[]>('chatPills.openSections', [{
			title: 'Pull Requests',
			entries: [entry('1'), entry('2')],
		}]);
		const pill = createChatSectionPill(action, sections, {
			widgetId: 'pullRequests',
			icon: Codicon.gitPullRequest,
			title: 'Pull Requests',
			summaryLabel: count => `${count} Pull Requests`,
			summaryAriaLabel: count => `Show ${count} pull requests`,
		}, resourceLabels, instantiationService);
		const siblingPill: IChatPill = { action: disposables.add(new Action('issues', 'Issues')) };
		const includeSibling = observableValue('chatPills.includeSibling', false);
		const widget = disposables.add(instantiationService.createInstance(ChatPillsWidget, {
			pills: derived(reader => [pill.read(reader), ...(includeSibling.read(reader) ? [siblingPill] : [])]),
		}, undefined));
		mainWindow.document.body.appendChild(widget.element);
		disposables.add(toDisposable(() => widget.element.remove()));
		const button = widget.getPillElements()[0];

		button.click();
		sections.set([{
			title: 'Pull Requests',
			entries: [entry('2'), entry('3')],
		}], undefined);
		includeSibling.set(true, undefined);
		const expandedAfterUpdate = button.getAttribute('aria-expanded');
		const dropdownFocusPreserved = mainWindow.document.activeElement === dropdownFocus;
		sections.set([], undefined);

		assert.deepStrictEqual({
			shownLabels,
			updatedLabels,
			expandedAfterUpdate,
			dropdownFocusPreserved,
			hideCount,
			expandedAfterEmpty: button.getAttribute('aria-expanded'),
		}, {
			shownLabels: ['Pull Requests', 'Pull Request #1', 'Pull Request #2'],
			updatedLabels: ['Pull Requests', 'Pull Request #2', 'Pull Request #3'],
			expandedAfterUpdate: 'true',
			dropdownFocusPreserved: true,
			hideCount: 1,
			expandedAfterEmpty: null,
		});

		disposables.dispose();
	});

	test('exposes the description of an inline section entry', () => {
		const disposables = store.add(new DisposableStore());
		const instantiationService = workbenchInstantiationService(undefined, disposables);
		const resourceLabels = disposables.add(instantiationService.createInstance(ResourceLabels, DEFAULT_LABELS_CONTAINER));
		const action = disposables.add(new Action('pullRequest', 'Pull Request'));
		const sections = constObservable<readonly IChatPillSection[]>([{
			title: 'Pull Requests',
			entries: [{
				id: '1',
				label: 'Pull Request #1',
				ariaLabel: 'Open Pull Request #1',
				ariaDescription: 'merged. https://github.com/microsoft/vscode/pull/1',
				open: () => { },
			}],
		}]);
		const pill = createChatSectionPill(action, sections, {
			widgetId: 'pullRequests',
			icon: Codicon.gitPullRequest,
			title: 'Pull Requests',
			summaryLabel: count => `${count} Pull Requests`,
			summaryAriaLabel: count => `Show ${count} pull requests`,
		}, resourceLabels, instantiationService);
		const widget = disposables.add(instantiationService.createInstance(ChatPillsWidget, { pills: pill.map(value => [value]) }, undefined));
		mainWindow.document.body.appendChild(widget.element);
		disposables.add(toDisposable(() => widget.element.remove()));
		const button = widget.getPillElements()[0];

		assert.deepStrictEqual({
			ariaLabel: button.getAttribute('aria-label'),
			ariaDescription: button.getAttribute('aria-description'),
		}, {
			ariaLabel: 'Open Pull Request #1',
			ariaDescription: 'merged. https://github.com/microsoft/vscode/pull/1',
		});

		disposables.dispose();
	});
});
