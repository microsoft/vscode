/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { getWindow } from '../../../base/browser/dom.js';
import { StandardMouseEvent } from '../../../base/browser/mouseEvent.js';
import { IAnchor } from '../../../base/browser/ui/contextview/contextview.js';
import { ensureCodeWindow, mainWindow } from '../../../base/browser/window.js';
import type { IManagedHoverContent, IManagedHoverOptions } from '../../../base/browser/ui/hover/hover.js';
import { IListAccessibilityProvider } from '../../../base/browser/ui/list/listWidget.js';
import { timeout } from '../../../base/common/async.js';
import { Action, IAction } from '../../../base/common/actions.js';
import { CancellationToken, CancellationTokenSource } from '../../../base/common/cancellation.js';
import { VSBuffer } from '../../../base/common/buffer.js';
import { Codicon } from '../../../base/common/codicons.js';
import { AnchorPosition } from '../../../base/common/layout.js';
import { DisposableStore, toDisposable } from '../../../base/common/lifecycle.js';
import { constObservable, derived, observableValue } from '../../../base/common/observable.js';
import { URI } from '../../../base/common/uri.js';
import { mock, upcastPartial } from '../../../base/test/common/mock.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../base/test/common/utils.js';
import { IActionListDelegate, IActionListItem } from '../../../platform/actionWidget/browser/actionList.js';
import { IActionWidgetService } from '../../../platform/actionWidget/browser/actionWidget.js';
import { IFileContent, IFileService } from '../../../platform/files/common/files.js';
import { ChatDropdownPillActionViewItem, ChatPillSingleEntry, createChatSectionPill } from '../../browser/chatDropdownPill.js';
import { ChatResourcePillActionViewItem } from '../../browser/chatResourcePill.js';
import { createChatImageHoverContent } from '../../browser/chatImagePreview.js';
import { ChatPillsRow, ChatPillsWidget, createChatPillImagePreview, type IChatPill, type IChatPillEntry, type IChatPillSection, withChatPillHoverLabel } from '../../browser/chatPills.js';
import { DEFAULT_LABELS_CONTAINER, ResourceLabels } from '../../browser/labels.js';
import { workbenchInstantiationService } from './workbenchTestServices.js';

const getDropdownPillHoverContents = Reflect.get(ChatDropdownPillActionViewItem.prototype, 'getHoverContents') as (this: ChatDropdownPillActionViewItem) => IManagedHoverContent;
const getDropdownPillHoverOptions = Reflect.get(ChatDropdownPillActionViewItem.prototype, 'getHoverOptions') as (this: ChatDropdownPillActionViewItem) => IManagedHoverOptions | undefined;
const getDropdownPillItems = Reflect.get(ChatDropdownPillActionViewItem.prototype, '_getDropdownItems') as (this: ChatDropdownPillActionViewItem) => IActionListItem<IChatPillEntry>[];
const getResourcePillHoverOptions = Reflect.get(ChatResourcePillActionViewItem.prototype, 'getHoverOptions') as (this: ChatResourcePillActionViewItem) => IManagedHoverOptions | undefined;

suite('ChatPills', () => {
	const store = ensureNoDisposablesAreLeakedInTestSuite();

	test('forwards optional dropdown placement without forcing a side', () => {
		const actual = [undefined, AnchorPosition.ABOVE, AnchorPosition.BELOW].map(preferredAnchorPosition => {
			const instantiationService = workbenchInstantiationService(undefined, store);
			let placement: { preferred: AnchorPosition | undefined; fixed: AnchorPosition | undefined } | undefined;
			instantiationService.stub(IActionWidgetService, {
				isVisible: false,
				show: (_user, _preview, _items, _delegate, _anchor, _container, _actions, _accessibility, options) => {
					placement = { preferred: options?.preferredAnchorPosition, fixed: options?.anchorPosition };
				},
				hide: () => { },
			});
			const action = store.add(new Action('references', 'References'));
			const sections = constObservable<readonly IChatPillSection[]>([{
				title: 'References',
				entries: [{ id: 'reference', label: 'Reference', open: () => { } }],
			}]);
			const viewItem = store.add(instantiationService.createInstance(ChatDropdownPillActionViewItem, action, {}, sections, {
				widgetId: 'references',
				icon: Codicon.references,
				title: 'References',
				summaryLabel: count => `${count} References`,
				summaryAriaLabel: count => `Show ${count} references`,
				singleEntry: ChatPillSingleEntry.Summary,
				preferredAnchorPosition,
			}));
			const container = mainWindow.document.createElement('div');
			mainWindow.document.body.appendChild(container);
			store.add(toDisposable(() => container.remove()));
			viewItem.render(container);
			container.querySelector<HTMLElement>('.chat-dropdown-pill-button')!.click();
			return placement;
		});

		assert.deepStrictEqual(actual, [
			{ preferred: undefined, fixed: undefined },
			{ preferred: AnchorPosition.ABOVE, fixed: undefined },
			{ preferred: AnchorPosition.BELOW, fixed: undefined },
		]);
	});

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

	test('shared image previews preserve intrinsic aspect ratio without a fixed-height surface', () => {
		const preview = createChatImageHoverContent(URI.file('/repo/design.png'), '/repo/design.png', new Uint8Array(), 'test-preview', undefined, () => { }, undefined, 'Preview');
		store.add(preview.disposable);
		mainWindow.document.body.appendChild(preview.element);
		store.add(toDisposable(() => preview.element.remove()));
		const imageContainer = preview.element.querySelector<HTMLElement>('.chat-image-hover-image-container')!;
		const image = preview.element.querySelector<HTMLImageElement>('.chat-image-hover-image')!;
		const caption = preview.element.querySelector<HTMLElement>('.chat-image-hover-location')!;
		const containerStyle = mainWindow.getComputedStyle(imageContainer);
		const imageStyle = mainWindow.getComputedStyle(image);
		const captionStyle = mainWindow.getComputedStyle(caption);
		const hoverStyle = mainWindow.getComputedStyle(preview.element);

		assert.deepStrictEqual({
			contentDrivenHeight: containerStyle.height === imageStyle.height,
			fixedHeightRemoved: containerStyle.height !== '240px',
			captionElement: caption.tagName,
			captionUsesHoverForeground: captionStyle.color === hoverStyle.color,
			captionWraps: captionStyle.whiteSpace === 'normal' && captionStyle.overflowWrap === 'anywhere',
			imageMaxHeight: imageStyle.maxHeight,
			imageMinHeight: imageStyle.minHeight,
			imageObjectFit: imageStyle.objectFit,
		}, {
			contentDrivenHeight: true,
			fixedHeightRemoved: true,
			captionElement: 'DIV',
			captionUsesHoverForeground: true,
			captionWraps: true,
			imageMaxHeight: '350px',
			imageMinHeight: '0px',
			imageObjectFit: 'contain',
		});
	});

	test('maps image previews to rich row and inline hover content', () => {
		const disposables = store.add(new DisposableStore());
		const instantiationService = workbenchInstantiationService(undefined, disposables);
		const action = disposables.add(new Action('references', 'References'));
		const resource = URI.file('/repo/design.png');
		const entry: IChatPillEntry = {
			id: 'design',
			label: 'design.png',
			resource,
			imagePreview: { resource, mimeType: 'image/png' },
			ariaDescription: 'design.png',
			hoverActions: [disposables.add(new Action('copyRelativePath', 'Copy Relative Path'))],
			open: () => { },
		};
		const sections = constObservable<readonly IChatPillSection[]>([{ title: 'Images', entries: [entry] }]);
		const viewItem = disposables.add(instantiationService.createInstance(ChatDropdownPillActionViewItem, action, {}, sections, {
			widgetId: 'references',
			icon: Codicon.references,
			title: 'References',
			summaryLabel: count => `${count} References`,
			summaryAriaLabel: count => `Show ${count} references`,
			singleEntry: ChatPillSingleEntry.Summary,
		}));
		const mappedEntry = getDropdownPillItems.call(viewItem)[1];
		const firstContent = typeof mappedEntry.hover?.content === 'function' ? mappedEntry.hover.content() : undefined;
		const refreshedMappedEntry = getDropdownPillItems.call(viewItem)[1];
		const refreshedContent = typeof refreshedMappedEntry.hover?.content === 'function' ? refreshedMappedEntry.hover.content() : undefined;

		assert.deepStrictEqual({
			sameHover: mappedEntry.hover === refreshedMappedEntry.hover,
			sameContent: firstContent === refreshedContent,
			contentType: typeof mappedEntry.hover?.content,
			contentOwnsPadding: mappedEntry.hover?.contentOwnsPadding,
			hasDisposable: !!mappedEntry.hover?.disposable,
			hasCandidateDisposer: !!mappedEntry.hover?.disposeContent,
			expandable: mappedEntry.hover?.expandable,
			showIndicator: mappedEntry.hover?.showIndicator,
			tabThroughPanel: mappedEntry.hover?.tabThroughPanel,
			alignToAnchorTop: mappedEntry.hover?.alignToAnchorTop,
			preserveVerticalPosition: mappedEntry.hover?.preserveVerticalPosition,
		}, {
			sameHover: true,
			sameContent: true,
			contentType: 'function',
			contentOwnsPadding: true,
			hasDisposable: true,
			hasCandidateDisposer: true,
			expandable: true,
			showIndicator: false,
			tabThroughPanel: true,
			alignToAnchorTop: true,
			preserveVerticalPosition: true,
		});
		mappedEntry.hover?.disposable?.dispose();

		disposables.dispose();
	});

	test('single resource pills retain hover-only actions and concise footer labels', () => {
		const instantiationService = workbenchInstantiationService(undefined, store);
		const resourceLabels = store.add(instantiationService.createInstance(ResourceLabels, DEFAULT_LABELS_CONTAINER));
		const runs: string[] = [];
		const copy = store.add(new Action('copy', 'Copy Path', undefined, true, async () => { runs.push('copy'); }));
		const relative = store.add(new Action('relative', 'Copy Relative Path', undefined, true, async () => { runs.push('relative'); }));
		const remove = withChatPillHoverLabel(store.add(new Action('remove', 'Remove design.png from Session', undefined, true, async () => { runs.push('remove'); })), 'Remove Reference');
		const entry: IChatPillEntry = {
			id: 'design',
			label: 'design.png',
			resource: URI.file('/repo/design.png'),
			toolbarActions: [copy],
			hoverActions: [relative],
			promotedAction: remove,
			open: () => { },
		};
		const action = store.add(new Action('references', 'References'));
		const viewItem = store.add(instantiationService.createInstance(ChatResourcePillActionViewItem, action, {}, constObservable(entry), resourceLabels));
		const options = getResourcePillHoverOptions.call(viewItem);
		for (const action of options?.actions ?? []) {
			action.run(mainWindow.document.body);
		}

		assert.deepStrictEqual({
			labels: options?.actions?.map(action => action.label),
			trapFocus: options?.trapFocus,
			runs,
		}, {
			labels: ['Copy Path', 'Copy Relative Path', 'Remove Reference'],
			trapFocus: true,
			runs: ['copy', 'relative', 'remove'],
		});
	});

	test('cancels image reads when their hover closes or is cancelled', async () => {
		const tokens: (CancellationToken | undefined)[] = [];
		const resource = URI.file('/repo/design.png');
		const fileService = upcastPartial<IFileService>({
			readFile: (_resource, _options, token) => {
				tokens.push(token);
				return new Promise(() => { });
			},
		});
		const entry = {
			id: 'design',
			label: 'design.png',
			imagePreview: { resource, mimeType: 'image/png' },
			open: () => { },
		};
		const preview = createChatPillImagePreview(entry, fileService);
		store.add(preview.disposable).dispose();
		const cancellation = store.add(new CancellationTokenSource());
		store.add(createChatPillImagePreview(entry, fileService, cancellation.token).disposable);
		cancellation.cancel();
		store.add(createChatPillImagePreview(entry, fileService, CancellationToken.Cancelled).disposable);
		let completedToken: CancellationToken | undefined;
		const completedPreview = createChatPillImagePreview(entry, upcastPartial<IFileService>({
			readFile: async (_resource, _options, token): Promise<IFileContent> => {
				completedToken = token;
				return {
					resource,
					name: 'design.png',
					value: VSBuffer.fromString('image'),
					etag: 'image-etag',
					mtime: 0,
					ctime: 0,
					size: 5,
					readonly: false,
					locked: false,
					executable: false,
				};
			},
		}));
		await timeout(0);
		const completedBeforeClose = completedToken?.isCancellationRequested;
		store.add(completedPreview.disposable).dispose();

		assert.deepStrictEqual({
			pendingReads: tokens.map(token => token?.isCancellationRequested),
			completedBeforeClose,
			completedAfterClose: completedToken?.isCancellationRequested,
		}, {
			pendingReads: [true, true],
			completedBeforeClose: false,
			completedAfterClose: true,
		});
	});

	test('disposes a rebuilt image preview candidate with the same entry id', () => {
		const tokens: CancellationToken[] = [];
		const fileService = upcastPartial<IFileService>({
			readFile: (_resource, _options, token) => {
				if (token) {
					tokens.push(token);
				}
				return new Promise(() => { });
			},
		});
		const instantiationService = workbenchInstantiationService(undefined, store);
		instantiationService.stub(IFileService, fileService);
		const action = store.add(new Action('references', 'References'));
		const resource = URI.file('/repo/design.png');
		const createEntry = (): IChatPillEntry => ({
			id: 'design',
			label: 'design.png',
			resource,
			imagePreview: { resource, mimeType: 'image/png' },
			open: () => { },
		});
		const sections = observableValue<readonly IChatPillSection[]>('chatPills.rebuiltImage', [{ title: 'Images', entries: [createEntry()] }]);
		const viewItem = store.add(instantiationService.createInstance(ChatDropdownPillActionViewItem, action, {}, sections, {
			widgetId: 'references',
			icon: Codicon.references,
			title: 'References',
			summaryLabel: count => `${count} References`,
			summaryAriaLabel: count => `Show ${count} references`,
			singleEntry: ChatPillSingleEntry.Summary,
		}));
		const firstHover = getDropdownPillItems.call(viewItem)[1].hover!;
		const firstContent = typeof firstHover.content === 'function' ? firstHover.content() : undefined;
		sections.set([{ title: 'Images', entries: [createEntry()] }], undefined);
		const replacementHover = getDropdownPillItems.call(viewItem)[1].hover!;
		const replacementContent = typeof replacementHover.content === 'function' ? replacementHover.content() : undefined;

		if (replacementContent instanceof HTMLElement) {
			replacementHover.disposeContent?.(replacementContent);
		}

		assert.deepStrictEqual({
			contentRebuilt: replacementContent !== firstContent,
			firstCancelled: tokens[0]?.isCancellationRequested,
			replacementCancelled: tokens[1]?.isCancellationRequested,
		}, {
			contentRebuilt: true,
			firstCancelled: false,
			replacementCancelled: true,
		});
		firstHover.disposable?.dispose();
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
		const copyAction = withChatPillHoverLabel(disposables.add(new Action('copy', 'Copy Pull Request URL')), 'Copy URL');
		const copyHashAction = withChatPillHoverLabel(disposables.add(new Action('copyHash', 'Copy Commit Hash')), 'Copy Hash');
		const removeAction = withChatPillHoverLabel(disposables.add(new Action('remove', 'Remove Pull Request Reference from Session')), 'Remove Reference');
		sections.set([{
			title: 'Pull Requests', entries: [{
				...entry('1', richHover),
				badge: '#1',
				className: 'chat-pill-github-reference',
				hover: { content: mainWindow.document.createElement('div') },
				toolbarActions: [copyAction],
				hoverActions: [copyHashAction],
				promotedAction: removeAction,
			}]
		}], undefined);
		const enrichedHover = getDropdownPillHoverContents.call(viewItem);
		const singularFooterActions = getDropdownPillHoverOptions.call(viewItem)?.actions?.map(action => action.label);
		const mappedEntry = getDropdownPillItems.call(viewItem)[1];
		sections.set([{ title: 'Pull Requests', entries: [entry('1', richHover), entry('2')] }], undefined);
		const summaryHover = getDropdownPillHoverContents.call(viewItem);

		assert.deepStrictEqual({
			fallbackHover,
			usesRichHover: enrichedHover === richHover,
			singularFooterActions,
			mappedEntry: {
				label: mappedEntry.label,
				badge: mappedEntry.badge,
				className: mappedEntry.className,
				rowActions: mappedEntry.toolbarActions?.map(action => action.label),
				footerActions: mappedEntry.hover?.actions?.map(action => action.label),
			},
			summaryHover,
		}, {
			fallbackHover: 'https://github.com/microsoft/vscode/pull/1',
			usesRichHover: true,
			singularFooterActions: ['Copy URL', 'Copy Hash', 'Remove Reference'],
			mappedEntry: {
				label: 'Pull Request #1',
				badge: '#1',
				className: 'chat-pill-github-reference',
				rowActions: ['Copy Pull Request URL', 'Remove Pull Request Reference from Session'],
				footerActions: ['Copy Hash'],
			},
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
		let shownAriaLabels: readonly (string | null)[] = [];
		let updatedLabels: readonly (string | undefined)[] = [];
		let updatePreserveHover: boolean | undefined;
		let hideCount = 0;
		const dropdownFocus = mainWindow.document.createElement('button');
		mainWindow.document.body.appendChild(dropdownFocus);
		disposables.add(toDisposable(() => dropdownFocus.remove()));
		const actionWidgetService = new class extends mock<IActionWidgetService>() {
			override get isVisible(): boolean { return visible; }
			override show<T>(_user: string, _supportsPreview: boolean, items: readonly IActionListItem<T>[], delegate: IActionListDelegate<T>, _anchor: HTMLElement | StandardMouseEvent | IAnchor, _container: HTMLElement | undefined, _actionBarActions?: readonly IAction[], accessibilityProvider?: Partial<IListAccessibilityProvider<IActionListItem<T>>>): void {
				visible = true;
				shownLabels = items.map(item => item.label);
				shownAriaLabels = items.map(item => {
					const ariaLabel = accessibilityProvider?.getAriaLabel?.(item);
					return typeof ariaLabel === 'string' ? ariaLabel : null;
				});
				onHide = delegate.onHide;
				dropdownFocus.focus();
			}
			override updateItems<T>(items: readonly IActionListItem<T>[], _focusItemId?: string, options?: { readonly preserveHover?: boolean }): void {
				updatedLabels = items.map(item => item.label);
				updatePreserveHover = options?.preserveHover;
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
			ariaLabel: `Open Pull Request #${id}`,
			ariaDescription: `open. Checks passed. https://github.com/microsoft/vscode/pull/${id}`,
			open: () => { },
		});
		const sections = observableValue<readonly IChatPillSection[]>('chatPills.openSections', [{
			title: 'Pull Requests',
			entries: [entry('1'), entry('2'), entry('3')],
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
		const focusPreservedOnRefresh = { updatePreserveHover };
		includeSibling.set(true, undefined);
		const expandedAfterUpdate = button.getAttribute('aria-expanded');
		const dropdownFocusPreserved = mainWindow.document.activeElement === dropdownFocus;
		sections.set([{ title: 'Pull Requests', entries: [entry('3')] }], undefined);
		const single = {
			visible,
			focused: mainWindow.document.activeElement === button,
			expanded: button.getAttribute('aria-expanded'),
		};
		sections.set([], undefined);

		assert.deepStrictEqual({
			shownLabels,
			shownAriaLabels,
			updatedLabels,
			focusPreservedOnRefresh,
			expandedAfterUpdate,
			dropdownFocusPreserved,
			single,
			hideCount,
			expandedAfterEmpty: button.getAttribute('aria-expanded'),
		}, {
			shownLabels: ['Pull Requests', 'Pull Request #1', 'Pull Request #2', 'Pull Request #3'],
			shownAriaLabels: [
				'Pull Requests',
				'Open Pull Request #1, open. Checks passed. https://github.com/microsoft/vscode/pull/1',
				'Open Pull Request #2, open. Checks passed. https://github.com/microsoft/vscode/pull/2',
				'Open Pull Request #3, open. Checks passed. https://github.com/microsoft/vscode/pull/3',
			],
			focusPreservedOnRefresh: { updatePreserveHover: true },
			updatedLabels: ['Pull Requests', 'Pull Request #2', 'Pull Request #3'],
			expandedAfterUpdate: 'true',
			dropdownFocusPreserved: true,
			single: { visible: false, focused: true, expanded: null },
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
