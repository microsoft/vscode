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
import { Event } from '../../../base/common/event.js';
import { DisposableStore, toDisposable } from '../../../base/common/lifecycle.js';
import { constObservable, derived, observableValue } from '../../../base/common/observable.js';
import { ThemeIcon } from '../../../base/common/themables.js';
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

	test('compact rows and individual pills collapse details while retaining icons', () => {
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

		const getPresentation = () => ({
			iconVisible: mainWindow.getComputedStyle(icon).display !== 'none',
			labelVisible: mainWindow.getComputedStyle(label).display !== 'none',
			counterVisible: mainWindow.getComputedStyle(counter).display !== 'none',
			chevronVisible: mainWindow.getComputedStyle(chevron).display !== 'none',
			resourceIconVisible: mainWindow.getComputedStyle(resourceIcon).display !== 'none',
			resourceNameVisible: mainWindow.getComputedStyle(resourceName).display !== 'none',
		});
		const compactRow = getPresentation();
		row.element.classList.remove('compact');
		button.classList.add('compact');
		const compactPill = getPresentation();
		button.classList.remove('compact');
		const expectedCompact = {
			iconVisible: true,
			labelVisible: false,
			counterVisible: false,
			chevronVisible: false,
			resourceIconVisible: true,
			resourceNameVisible: false,
		};

		assert.deepStrictEqual({
			compactRow,
			compactPill,
			expandedResourceIconVisible: mainWindow.getComputedStyle(resourceIcon).display !== 'none',
		}, {
			compactRow: expectedCompact,
			compactPill: expectedCompact,
			expandedResourceIconVisible: false,
		});

		disposables.dispose();
	});

	suite('automatic compact mode', () => {
		function createRow() {
			const instantiationService = workbenchInstantiationService(undefined, store);
			const row = store.add(new ChatPillsRow('ChatPills.responsiveTest', { compact: 'auto' }));
			row.element.style.width = '1000px';
			mainWindow.document.body.appendChild(row.element);
			store.add(toDisposable(() => row.element.remove()));

			const pills = observableValue<readonly IChatPill[]>('chatPills.responsive', [
				{ action: store.add(new Action('pullRequests', '2 Pull Requests', ThemeIcon.asClassName(Codicon.gitPullRequest))) },
				{ action: store.add(new Action('artifacts', '4 Artifacts', ThemeIcon.asClassName(Codicon.package))) },
				{ action: store.add(new Action('references', '4 References', ThemeIcon.asClassName(Codicon.bookmark))) },
			]);
			const widget = store.add(instantiationService.createInstance(ChatPillsWidget, { pills }, undefined));
			row.content.appendChild(widget.element);
			row.observe(widget);

			const getCollapsed = () => widget.getPillElements().map(button =>
				mainWindow.getComputedStyle(button.querySelector('.chat-pill-label')!).display === 'none');
			const resize = (width: number) => {
				row.element.style.width = `${width}px`;
				row.layout();
				return getCollapsed();
			};
			return { row, widget, pills, getCollapsed, resize };
		}

		test('collapses right to left only when needed and restores labels as space becomes available', () => {
			const { row, widget, resize } = createRow();
			const buttons = widget.getPillElements();
			const ariaLabels = buttons.map(button => button.getAttribute('aria-label'));
			buttons[2].focus();

			const allExpandedWidth = widget.element.scrollWidth;
			const exactFit = resize(allExpandedWidth);
			const referencesCollapsed = resize(allExpandedWidth - 1);
			const twoExpandedWidth = widget.element.scrollWidth;
			const artifactsCollapsed = resize(twoExpandedWidth - 1);
			const oneExpandedWidth = widget.element.scrollWidth;
			const allCollapsed = resize(oneExpandedWidth - 1);
			const contentFits = row.content.scrollWidth <= row.content.clientWidth;
			const firstRestored = resize(oneExpandedWidth);
			const secondRestored = resize(twoExpandedWidth);
			const allRestored = resize(allExpandedWidth);

			assert.deepStrictEqual({
				exactFit,
				referencesCollapsed,
				artifactsCollapsed,
				allCollapsed,
				contentFits,
				firstRestored,
				secondRestored,
				allRestored,
				focusPreserved: mainWindow.document.activeElement === buttons[2],
				labelsPreserved: buttons.every((button, index) => button.getAttribute('aria-label') === ariaLabels[index]),
			}, {
				exactFit: [false, false, false],
				referencesCollapsed: [false, false, true],
				artifactsCollapsed: [false, true, true],
				allCollapsed: [true, true, true],
				contentFits: true,
				firstRestored: [false, true, true],
				secondRestored: [false, false, true],
				allRestored: [false, false, false],
				focusPreserved: true,
				labelsPreserved: true,
			});
		});

		test('remeasures changed labels and added or removed pills', async () => {
			const { widget, pills, getCollapsed, resize } = createRow();
			const originalPills = pills.get();
			const referenceAction = originalPills[2].action;
			const originalLabel = referenceAction.label;
			const allExpandedWidth = widget.element.scrollWidth;
			resize(allExpandedWidth);

			referenceAction.label = 'A much longer reference label that no longer fits';
			await timeout(0);
			const longerLabel = getCollapsed();
			referenceAction.label = originalLabel;
			await timeout(0);
			const shorterLabel = getCollapsed();

			resize(allExpandedWidth - 1);
			pills.set(originalPills.slice(0, 2), undefined);
			await timeout(0);
			const removed = getCollapsed();
			pills.set(originalPills, undefined);
			await timeout(0);
			const added = getCollapsed();

			assert.deepStrictEqual({ longerLabel, shorterLabel, removed, added }, {
				longerLabel: [false, false, true],
				shorterLabel: [false, false, false],
				removed: [false, false],
				added: [false, false, true],
			});
		});

		test('responds to container resizing without an explicit layout call', async () => {
			const { row, widget, getCollapsed } = createRow();
			const allExpandedWidth = widget.element.scrollWidth;
			const resizeOnNextFrame = (width: number) => new Promise<void>(resolve => {
				mainWindow.requestAnimationFrame(() => {
					store.add(Event.once(row.onDidChangeLayout)(() => resolve()));
					row.element.style.width = `${width}px`;
				});
			});
			await resizeOnNextFrame(allExpandedWidth - 1);
			const narrower = getCollapsed();
			await resizeOnNextFrame(allExpandedWidth);

			assert.deepStrictEqual({ narrower, wider: getCollapsed() }, {
				narrower: [false, false, true],
				wider: [false, false, false],
			});
		});

		test('keeps compact pills scrollable when even their icons do not fit', () => {
			const { row, widget, getCollapsed, resize } = createRow();
			const allExpandedWidth = widget.element.scrollWidth;
			resize(20);
			row.content.scrollLeft = row.content.scrollWidth;
			row.layout();
			const narrow = {
				collapsed: getCollapsed(),
				overflowing: row.content.scrollWidth > row.content.clientWidth,
				scrolled: row.content.scrollLeft > 0,
			};
			const expanded = resize(allExpandedWidth);

			assert.deepStrictEqual({ narrow, expanded, scrollLeft: row.content.scrollLeft }, {
				narrow: { collapsed: [true, true, true], overflowing: true, scrolled: true },
				expanded: [false, false, false],
				scrollLeft: 0,
			});
		});
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
