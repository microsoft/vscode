/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { addDisposableListener, getWindow } from '../../../base/browser/dom.js';
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
import { IActionListDelegate, IActionListItem, IActionListOptions } from '../../../platform/actionWidget/browser/actionList.js';
import { IActionWidgetService } from '../../../platform/actionWidget/browser/actionWidget.js';
import { IFileContent, IFileService } from '../../../platform/files/common/files.js';
import { ChatDropdownPillActionViewItem, ChatPillSingleEntry, createChatSectionPill } from '../../browser/chatDropdownPill.js';
import { ChatResourcePillActionViewItem } from '../../browser/chatResourcePill.js';
import { createChatImageHoverContent } from '../../browser/chatImagePreview.js';
import { ChatPillHoverCache, createChatPillHover, type IChatPillHoverContent } from '../../browser/chatPillHover.js';
import { ChatPillsRow, ChatPillsWidget, createChatPillImagePreview, getChatPillLocationHover, getChatReferencePillPresentation, type ChatPillsCompactMode, type IChatPill, type IChatPillEntry, type IChatPillSection, withChatPillHoverLabel } from '../../browser/chatPills.js';
import { DEFAULT_LABELS_CONTAINER, ResourceLabels } from '../../browser/labels.js';
import { workbenchInstantiationService } from './workbenchTestServices.js';

const getDropdownPillHoverContents = Reflect.get(ChatDropdownPillActionViewItem.prototype, 'getHoverContents') as (this: ChatDropdownPillActionViewItem) => IManagedHoverContent;
const getDropdownPillHoverOptions = Reflect.get(ChatDropdownPillActionViewItem.prototype, 'getHoverOptions') as (this: ChatDropdownPillActionViewItem) => IManagedHoverOptions | undefined;
const getDropdownPillItems = Reflect.get(ChatDropdownPillActionViewItem.prototype, '_getDropdownItems') as (this: ChatDropdownPillActionViewItem) => IActionListItem<IChatPillEntry>[];
const getResourcePillHoverOptions = Reflect.get(ChatResourcePillActionViewItem.prototype, 'getHoverOptions') as (this: ChatResourcePillActionViewItem) => IManagedHoverOptions | undefined;

suite('ChatPills', () => {
	const store = ensureNoDisposablesAreLeakedInTestSuite();

	for (const kind of ['pullRequest', 'issue'] as const) {
		const typeLabel = kind === 'pullRequest' ? 'Pull Request' : 'Issue';
		for (const title of [undefined, '', 'Live title']) {
			test(`${kind} keeps identity separate from ${title === undefined ? 'missing' : title === '' ? 'empty' : 'resolved'} titles`, () => {
				const result = getChatReferencePillPresentation(kind, '#123', title);
				assert.deepStrictEqual(result, {
					resourceLabel: `${typeLabel} #123${title ? ': Live title' : ''}`,
					entry: {
						label: title || typeLabel,
						badge: '#123',
						badgeBeforeLabel: true,
						pillLabel: '#123',
						className: 'chat-pill-reference',
						preserveLabelOnRefresh: title !== undefined,
						ariaLabel: `Open ${typeLabel} #123${title ? ': Live title' : ''}`,
						dropdownAriaLabel: `#123, Open ${typeLabel}${title ? ': Live title' : ''}`,
					},
				});
			});
		}

		test(`${kind} enriches a recorded title without changing identity`, () => {
			const initial = getChatReferencePillPresentation(kind, '#123', undefined, 'Recorded title').entry;
			const resolved = getChatReferencePillPresentation(kind, '#123', 'Live title', 'Recorded title').entry;
			assert.deepStrictEqual({
				labels: [initial.label, resolved.label],
				identity: [initial, resolved].map(entry => ({ badge: entry.badge, badgeBeforeLabel: entry.badgeBeforeLabel, pillLabel: entry.pillLabel })),
				preserveLabelOnRefresh: [initial.preserveLabelOnRefresh, resolved.preserveLabelOnRefresh],
			}, {
				labels: ['Recorded title', 'Live title'],
				identity: Array.from({ length: 2 }, () => ({ badge: '#123', badgeBeforeLabel: true, pillLabel: '#123' })),
				preserveLabelOnRefresh: [false, true],
			});
		});
	}

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

	test('prefetches at most five entries on open and exposes deferred prefetch for virtualized rows', () => {
		const instantiationService = workbenchInstantiationService(undefined, store);
		const prefetched: string[] = [];
		let items: readonly IActionListItem<IChatPillEntry>[] = [];
		instantiationService.stub(IActionWidgetService, {
			isVisible: false,
			show: (_user, _preview, shownItems) => { items = shownItems as readonly IActionListItem<IChatPillEntry>[]; },
			hide: () => { },
		});
		const action = store.add(new Action('references', 'References'));
		const entries = Array.from({ length: 8 }, (_, index): IChatPillEntry => ({
			id: `reference-${index}`,
			label: `Reference ${index}`,
			prefetch: () => prefetched.push(`reference-${index}`),
			open: () => { },
		}));
		const viewItem = store.add(instantiationService.createInstance(ChatDropdownPillActionViewItem, action, {}, constObservable([{
			title: 'References',
			entries,
		}]), {
			widgetId: 'references',
			icon: Codicon.references,
			title: 'References',
			summaryLabel: count => `${count} References`,
			summaryAriaLabel: count => `Show ${count} references`,
			singleEntry: ChatPillSingleEntry.Summary,
		}));
		const container = mainWindow.document.createElement('div');
		mainWindow.document.body.appendChild(container);
		store.add(toDisposable(() => container.remove()));
		viewItem.render(container);
		container.querySelector<HTMLElement>('.chat-dropdown-pill-button')!.click();
		const initial = [...prefetched];
		for (let scroll = 0; scroll < 2; scroll++) {
			for (const item of items) {
				item.onDidBecomeVisible?.();
			}
		}

		assert.deepStrictEqual({ initial, prefetched }, {
			initial: [
				'reference-0',
				'reference-1',
				'reference-2',
				'reference-3',
				'reference-4',
			], prefetched: entries.map(entry => entry.id)
		});
	});

	test('fills missing reference titles and refreshes status icons while keeping resolved labels stable until reopening', () => {
		const instantiationService = workbenchInstantiationService(undefined, store);
		let items: readonly IActionListItem<IChatPillEntry>[] = [];
		let accessibleLabel: string | undefined;
		let onHide = () => { };
		let visible = false;
		instantiationService.stub(IActionWidgetService, upcastPartial<IActionWidgetService>({
			get isVisible() { return visible; },
			show: (_user, _preview, shownItems, delegate, _anchor, _container, _actions, accessibility) => {
				visible = true;
				items = shownItems as readonly IActionListItem<IChatPillEntry>[];
				onHide = delegate.onHide;
				const label = accessibility?.getAriaLabel?.(shownItems[1]);
				accessibleLabel = typeof label === 'string' ? label : undefined;
			},
			updateItems: shownItems => { items = shownItems as readonly IActionListItem<IChatPillEntry>[]; },
			hide: () => { visible = false; onHide(); },
		}));
		const sections = observableValue<readonly IChatPillSection[]>('references', []);
		const update = (label: string, resolved: boolean, icon = Codicon.gitPullRequest) => sections.set([{
			title: 'References', entries: [{
				id: 'reference', label, icon, ariaLabel: `Open ${label}`, badge: '#123', badgeBeforeLabel: true, preserveLabelOnRefresh: resolved, open: () => { },
			}],
		}], undefined);
		update('Pull Request', false);
		const action = store.add(new Action('references', 'References'));
		const viewItem = store.add(instantiationService.createInstance(ChatDropdownPillActionViewItem, action, {}, sections, {
			widgetId: 'references', icon: Codicon.references, title: 'References',
			summaryLabel: count => `${count} References`, summaryAriaLabel: count => `Show ${count} references`,
			singleEntry: ChatPillSingleEntry.Summary,
		}));
		const container = mainWindow.document.createElement('div');
		mainWindow.document.body.appendChild(container);
		store.add(toDisposable(() => container.remove()));
		viewItem.render(container);
		const button = container.querySelector<HTMLElement>('.chat-dropdown-pill-button')!;
		button.click();
		const initial = items[1].label;
		update('Resolved title', true);
		const resolved = items[1].label;
		update('Renamed title', true, Codicon.gitPullRequestDone);
		const refreshed = items[1].label;
		const refreshedIcon = items[1].group?.icon?.id;
		const accessibleWhileOpen = items[1].item?.ariaLabel;
		instantiationService.get(IActionWidgetService).hide();
		button.click();
		const reopened = items[1].label;
		const reopenedIcon = items[1].group?.icon?.id;
		update('Pull Request', false);
		update('Recovered title', true);
		assert.deepStrictEqual({ initial, resolved, refreshed, refreshedIcon, accessibleWhileOpen, reopened, reopenedIcon, accessibleLabel, recovered: items[1].label }, {
			initial: 'Pull Request', resolved: 'Resolved title', refreshed: 'Resolved title',
			refreshedIcon: 'git-pull-request-done',
			accessibleWhileOpen: 'Open Resolved title',
			reopened: 'Renamed title', reopenedIcon: 'git-pull-request-done', accessibleLabel: '#123, Open Renamed title',
			recovered: 'Recovered title',
		});
	});

	test('shell-style dropdowns prefer opening upward and route row activation to live details', () => {
		const instantiationService = workbenchInstantiationService(undefined, store);
		let options: IActionListOptions | undefined;
		let opensDetails: boolean | undefined;
		instantiationService.stub(IActionWidgetService, new class extends mock<IActionWidgetService>() {
			override get isVisible(): boolean { return false; }
			override show<T>(_user: string, _preview: boolean, items: readonly IActionListItem<T>[], _delegate: IActionListDelegate<T>, _anchor: HTMLElement | StandardMouseEvent | IAnchor, _container: HTMLElement | undefined, _actions?: readonly IAction[], _accessibility?: Partial<IListAccessibilityProvider<IActionListItem<T>>>, listOptions?: IActionListOptions): void {
				options = listOptions;
				opensDetails = items[1].openSubmenuOnClick;
			}
			override hide(): void { }
		}());
		const action = store.add(new Action('shells', 'Background Shells'));
		const view = store.add(instantiationService.createInstance(ChatDropdownPillActionViewItem, action, {}, constObservable([{
			title: 'Active background shells',
			entries: [{ id: 'shell', label: 'Run tests', hover: { content: 'details', expandable: true }, open: () => { } }],
		}]), {
			widgetId: 'shells',
			icon: Codicon.terminal,
			title: 'Background Shells',
			summaryLabel: count => `${count} Background Shells`,
			summaryAriaLabel: count => `Show ${count} background shells`,
			singleEntry: ChatPillSingleEntry.Summary,
			preferredAnchorPosition: AnchorPosition.ABOVE,
			openHoverOnSelect: true,
		}));
		const container = mainWindow.document.createElement('div');
		mainWindow.document.body.appendChild(container);
		store.add(toDisposable(() => container.remove()));
		view.render(container);
		container.querySelector<HTMLElement>('.chat-pill-button')!.click();

		assert.deepStrictEqual({ preferred: options?.preferredAnchorPosition, fixed: options?.anchorPosition, opensDetails }, {
			preferred: AnchorPosition.ABOVE,
			fixed: undefined,
			opensDetails: true,
		});
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

	test('preserves image content through metadata updates and disposes changed or removed resources', () => {
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

		const preserved = { sameContent: replacementContent === firstContent, reads: tokens.length, canceled: tokens[0]?.isCancellationRequested };
		const nextResource = URI.file('/repo/updated.png');
		sections.set([{ title: 'Images', entries: [{ ...createEntry(), imagePreview: { resource: nextResource, mimeType: 'image/png' } }] }], undefined);
		const nextHover = getDropdownPillItems.call(viewItem)[1].hover!;
		const nextContent = typeof nextHover.content === 'function' ? nextHover.content() : undefined;
		const changed = { sameContent: nextContent === firstContent, reads: tokens.length, canceled: tokens.map(token => token.isCancellationRequested) };
		const container = mainWindow.document.createElement('div');
		viewItem.render(container);
		sections.set([], undefined);
		assert.deepStrictEqual({ preserved, changed, removed: tokens.map(token => token.isCancellationRequested) }, {
			preserved: { sameContent: true, reads: 1, canceled: false },
			changed: { sameContent: false, reads: 2, canceled: [true, false] },
			removed: [true, true],
		});
	});

	for (const replacement of ['controller', 'scope'] as const) {
		test(`keeps rich content, keyboard controls and callbacks together after a ${replacement} replacement`, () => {
			const instantiationService = workbenchInstantiationService(undefined, store);
			const cache = store.add(new ChatPillHoverCache());
			const calls: string[] = [];
			const content = (value: string): IChatPillHoverContent => {
				const element = mainWindow.document.createElement('div');
				const controls = ['Repository', 'Commit'].map(label => {
					const button = mainWindow.document.createElement('button');
					button.textContent = label;
					element.appendChild(button);
					store.add(addDisposableListener(button, 'click', () => calls.push(value)));
					return button;
				});
				return { element, tabbableElements: controls };
			};
			const entry = (value: string): IChatPillEntry => {
				const base: IChatPillEntry = { id: 'commit', label: 'Commit title', open: () => { } };
				return {
					...base,
					...(replacement === 'scope'
						? cache.get(base.id, base, () => content(value))
						: createChatPillHover({ fallback: base.label, createContent: () => content(value) })),
				};
			};
			cache.retain(new Set(['commit']), 'session-1');
			const sections = observableValue<readonly IChatPillSection[]>('richHoverReplacement', [{ title: 'Commits', entries: [entry('old')] }]);
			const viewItem = store.add(instantiationService.createInstance(ChatDropdownPillActionViewItem, store.add(new Action('references', 'References')), {}, sections, {
				widgetId: 'references', icon: Codicon.references, title: 'References',
				summaryLabel: count => `${count} References`, summaryAriaLabel: count => `Show ${count} references`,
				singleEntry: ChatPillSingleEntry.Summary,
			}));
			const render = () => {
				const hover = getDropdownPillItems.call(viewItem)[1].hover!;
				const element = typeof hover.content === 'function' ? hover.content() : undefined;
				assert.ok(element instanceof HTMLElement);
				return { element, hover };
			};
			const initial = render();
			mainWindow.document.body.appendChild(initial.element);
			store.add(toDisposable(() => initial.element.remove()));
			if (replacement === 'scope') {
				cache.retain(new Set(['commit']), 'session-2');
			}
			sections.set([{ title: 'Commits', entries: [entry('new')] }], undefined);
			const updated = render();
			const rebuilt = { visibleControls: updated.element.querySelectorAll('button').length, keyboardControls: updated.hover.getTabbableElements?.().length };
			initial.element.remove();
			const reopened = render();
			reopened.hover.getTabbableElements?.()[0].click();
			assert.deepStrictEqual({ rebuilt, reopenedControls: reopened.hover.getTabbableElements?.().length, calls }, {
				rebuilt: { visibleControls: 2, keyboardControls: 2 }, reopenedControls: 2, calls: ['new'],
			});
		});
	}

	test('preserves location content but refreshes actions and changed paths', async () => {
		const instantiationService = workbenchInstantiationService(undefined, store);
		const copied: string[] = [];
		const entry = (path: string, value: string): IChatPillEntry => ({
			id: 'file', label: 'plan.md', ariaDescription: path, hover: getChatPillLocationHover(path),
			hoverActions: [store.add(new Action('copy', 'Copy Path', undefined, true, () => { copied.push(value); }))],
			open: () => { },
		});
		const sections = observableValue<readonly IChatPillSection[]>('locations', [{ title: 'Files', entries: [entry('/repo/plan.md', 'old')] }]);
		const viewItem = store.add(instantiationService.createInstance(ChatDropdownPillActionViewItem, store.add(new Action('references', 'References')), {}, sections, {
			widgetId: 'references', icon: Codicon.references, title: 'References',
			summaryLabel: count => `${count} References`, summaryAriaLabel: count => `Show ${count} references`,
			singleEntry: ChatPillSingleEntry.Summary,
		}));
		const first = getDropdownPillItems.call(viewItem)[1].hover!;
		sections.set([{ title: 'Files', entries: [entry('/repo/plan.md', 'new')] }], undefined);
		const replacement = getDropdownPillItems.call(viewItem)[1].hover!;
		await replacement.actions?.[0].run(mainWindow.document.createElement('div'));
		sections.set([{ title: 'Files', entries: [entry('/elsewhere/plan.md', 'changed')] }], undefined);
		const changed = getDropdownPillItems.call(viewItem)[1].hover!;
		assert.deepStrictEqual({
			preserved: first.content === replacement.content,
			changed: first.content !== changed.content,
			copied,
		}, { preserved: true, changed: true, copied: ['new'] });
	});

	test('keeps hover content an updated entry still owns and releases it when the entry is removed', () => {
		const instantiationService = workbenchInstantiationService(undefined, store);
		let released = 0;
		// The entry's source keeps this content alive across updates, like the live output of a background shell.
		const release = { dispose: () => { released++; } };
		const entry = (elapsed: string): IChatPillEntry => ({
			id: 'shell', label: 'Run tests', ariaDescription: elapsed,
			hover: { ...getChatPillLocationHover('npm test'), disposable: release },
			open: () => { },
		});
		const sections = observableValue<readonly IChatPillSection[]>('shells', [{ title: 'Shells', entries: [entry('1s')] }]);
		const viewItem = store.add(instantiationService.createInstance(ChatDropdownPillActionViewItem, store.add(new Action('shells', 'Background Shells')), {}, sections, {
			widgetId: 'shells', icon: Codicon.terminal, title: 'Background Shells',
			summaryLabel: count => `${count} Background Shells`, summaryAriaLabel: count => `Show ${count} background shells`,
			singleEntry: ChatPillSingleEntry.Summary,
		}));
		viewItem.render(mainWindow.document.createElement('div'));
		getDropdownPillItems.call(viewItem);
		sections.set([{ title: 'Shells', entries: [entry('2s')] }], undefined);
		getDropdownPillItems.call(viewItem);
		// Nothing rebuilds the dropdown's items after this update, as when the dropdown is closed.
		sections.set([{ title: 'Shells', entries: [entry('3s')] }], undefined);
		const afterUpdates = released;
		sections.set([], undefined);
		assert.deepStrictEqual({ afterUpdates, afterRemoval: released }, { afterUpdates: 0, afterRemoval: 1 });
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

	for (const scope of ['row', 'pill'] as const) {
		test(`compact ${scope}s collapse pill details while retaining icons`, () => {
			const disposables = store.add(new DisposableStore());
			const row = disposables.add(new ChatPillsRow('ChatPills.compactTest', { compact: scope === 'row' }));
			mainWindow.document.body.appendChild(row.element);
			disposables.add(toDisposable(() => row.element.remove()));

			const button = mainWindow.document.createElement('button');
			button.className = 'monaco-button chat-pill-button chat-resource-pill-button';
			const item = mainWindow.document.createElement('div');
			item.className = 'chat-pill-item';
			button.classList.toggle('compact', scope === 'pill');
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
			button.classList.remove('compact');

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
	}

	function createResponsiveRow(compact: ChatPillsCompactMode = 'auto') {
		const disposables = store.add(new DisposableStore());
		const instantiationService = workbenchInstantiationService(undefined, disposables);
		const container = mainWindow.document.createElement('div');
		container.className = 'monaco-workbench';
		container.style.position = 'relative';
		container.style.width = '1000px';
		container.style.setProperty('--vscode-spacing-size20', '2px');
		container.style.setProperty('--vscode-spacing-size40', '4px');
		container.style.setProperty('--vscode-spacing-size60', '6px');
		mainWindow.document.body.appendChild(container);
		disposables.add(toDisposable(() => container.remove()));
		const row = disposables.add(new ChatPillsRow('ChatPills.responsiveTest', { compact }));
		container.appendChild(row.element);
		const actions = ['Changes to Files', 'Pull Requests', 'Recorded Artifacts', 'Active Subagents'].map((label, index) =>
			disposables.add(new Action(`pill-${index}`, label, 'codicon codicon-file')));
		const initialPills: readonly IChatPill[] = actions.map(action => ({ action }));
		const pills = observableValue('ChatPills.responsive.pills', initialPills);
		const widget = disposables.add(instantiationService.createInstance(ChatPillsWidget, { pills }, undefined));
		row.content.appendChild(widget.element);
		row.observe(widget.element, () => widget.getPillElements());
		const items = () => widget.getPillElements();
		const collapsed = () => items().flatMap((item, index) => item.classList.contains('compact') ? [index] : []);
		const labelsVisible = () => [...widget.element.querySelectorAll('.chat-pill-label')].map(label => mainWindow.getComputedStyle(label).display !== 'none');
		const resize = (width: number) => {
			container.style.width = `${width}px`;
			row.layout();
			return collapsed();
		};
		const widthWithCollapsed = (count: number) => {
			const allItems = items();
			for (let index = 0; index < allItems.length; index++) {
				allItems[index].classList.toggle('compact', index >= allItems.length - count);
			}
			// Keep the below-threshold probes outside the row's one-pixel overflow tolerance.
			return Math.floor(widget.element.getBoundingClientRect().width);
		};
		return { row, widget, actions, pills, initialPills, collapsed, labelsVisible, resize, widthWithCollapsed };
	}

	test('automatic compact mode collapses only the necessary trailing pills and restores them as space returns', () => {
		const harness = createResponsiveRow();
		const widths = [0, 1, 2, 3, 4].map(count => harness.widthWithCollapsed(count));
		const buttons = harness.widget.getPillElements();
		buttons[2].focus();
		const ariaLabels = buttons.map(button => button.getAttribute('aria-label'));
		const shrinking = widths.flatMap((width, count) => count < 4
			? [harness.resize(width), harness.resize(width - 2)]
			: [harness.resize(width)]);
		const growing = [...widths].reverse().map(width => harness.resize(width));
		harness.row.layout();

		assert.deepStrictEqual({
			shrinking,
			growing,
			restored: harness.collapsed(),
			labelsVisible: harness.labelsVisible(),
			buttonsPreserved: buttons.every((button, index) => button === harness.widget.getPillElements()[index]),
			focusPreserved: mainWindow.document.activeElement === buttons[2],
			ariaLabels,
			ariaLabelsPreserved: buttons.every((button, index) => button.getAttribute('aria-label') === ariaLabels[index]),
		}, {
			shrinking: [[], [3], [3], [2, 3], [2, 3], [1, 2, 3], [1, 2, 3], [0, 1, 2, 3], [0, 1, 2, 3]],
			growing: [[0, 1, 2, 3], [1, 2, 3], [2, 3], [3], []],
			restored: [],
			labelsVisible: [true, true, true, true],
			buttonsPreserved: true,
			focusPreserved: true,
			ariaLabels: harness.actions.map(action => action.label),
			ariaLabelsPreserved: true,
		});
	});

	test('automatic compact mode recomputes on label and membership changes', async () => {
		const harness = createResponsiveRow();
		const width = harness.widthWithCollapsed(1);
		harness.resize(width);
		const initial = harness.collapsed();
		const originalLabel = harness.actions[0].label;
		harness.actions[0].label = 'A much longer changes label that cannot fit even when all the other pills are collapsed to their icons';
		await timeout(0);
		const longLabel = harness.collapsed();
		harness.actions[0].label = originalLabel;
		harness.row.layout();
		const shortLabel = harness.collapsed();
		harness.pills.set(harness.initialPills.slice(0, 3), undefined);
		await timeout(0);
		const removed = harness.collapsed();
		harness.pills.set(harness.initialPills, undefined);
		harness.row.layout();
		const added = harness.collapsed();
		harness.pills.set([], undefined);
		harness.row.layout();

		assert.deepStrictEqual({
			initial,
			longLabel,
			shortLabel,
			removed,
			added,
			empty: harness.collapsed(),
		}, {
			initial: [3],
			longLabel: [0, 1, 2, 3],
			shortLabel: [3],
			removed: [],
			added: [3],
			empty: [],
		});
	});

	test('automatic compact mode scrolls only after every pill has collapsed', () => {
		const harness = createResponsiveRow();
		const compactWidth = harness.widthWithCollapsed(4);
		harness.resize(compactWidth);
		const fits = harness.row.content.scrollWidth <= harness.row.content.clientWidth + 1;
		harness.resize(compactWidth - 20);
		const overflow = harness.row.content.scrollWidth > harness.row.content.clientWidth + 1;
		const labelsVisible = harness.labelsVisible();
		const buttons = harness.widget.getPillElements();
		const lastButton = buttons.at(-1)!;
		lastButton.focus();
		const scrollLeft = harness.row.content.scrollLeft;
		const focusedLastPill = mainWindow.document.activeElement === lastButton;
		const lastPillVisible = lastButton.getBoundingClientRect().right <= harness.row.content.getBoundingClientRect().right + 1;
		harness.row.layout();
		const scrollPreserved = harness.row.content.scrollLeft === scrollLeft;
		buttons[0].focus();

		assert.deepStrictEqual({
			fits,
			overflow,
			collapsed: harness.collapsed(),
			labelsVisible,
			focusedLastPill,
			lastPillVisible,
			scrolledToLastPill: scrollLeft > 0,
			scrollPreserved,
			scrolledBackToFirstPill: harness.row.content.scrollLeft === 0 && mainWindow.document.activeElement === buttons[0],
		}, {
			fits: true,
			overflow: true,
			collapsed: [0, 1, 2, 3],
			labelsVisible: [false, false, false, false],
			focusedLastPill: true,
			lastPillVisible: true,
			scrolledToLastPill: true,
			scrollPreserved: true,
			scrolledBackToFirstPill: true,
		});
	});

	for (const compact of [false, true]) {
		test(`fixed compact mode ${compact} is unaffected by available width`, () => {
			const harness = createResponsiveRow(compact);
			const narrow = harness.resize(40);
			const narrowLabels = harness.labelsVisible();
			const wide = harness.resize(1000);

			assert.deepStrictEqual({
				narrow,
				narrowLabels,
				wide,
				wideLabels: harness.labelsVisible(),
			}, {
				narrow: [],
				narrowLabels: Array(4).fill(!compact),
				wide: [],
				wideLabels: Array(4).fill(!compact),
			});
		});
	}

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
				badgeBeforeLabel: true,
				className: 'chat-pill-reference',
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
				badgeBeforeLabel: mappedEntry.badgeBeforeLabel,
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
				badgeBeforeLabel: true,
				className: 'chat-pill-reference',
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
		let updatePreserveScrollPosition: boolean | undefined;
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
			override updateItems<T>(items: readonly IActionListItem<T>[], _focusItemId?: string, options?: { readonly preserveHover?: boolean; readonly preserveScrollPosition?: boolean }): void {
				updatedLabels = items.map(item => item.label);
				updatePreserveHover = options?.preserveHover;
				updatePreserveScrollPosition = options?.preserveScrollPosition;
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
		const focusPreservedOnRefresh = { updatePreserveHover, updatePreserveScrollPosition };
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
			focusPreservedOnRefresh: { updatePreserveHover: true, updatePreserveScrollPosition: true },
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
