/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import './media/chatResources.css';
import * as dom from '../../../../../base/browser/dom.js';
import { IActionViewItemOptions } from '../../../../../base/browser/ui/actionbar/actionViewItems.js';
import { Action, IAction, Separator, toAction } from '../../../../../base/common/actions.js';
import { Codicon } from '../../../../../base/common/codicons.js';
import { toErrorMessage } from '../../../../../base/common/errorMessage.js';
import { Disposable, DisposableStore, MutableDisposable, toDisposable } from '../../../../../base/common/lifecycle.js';
import { autorun, constObservable, derived, IObservable, IReader, ISettableObservable, mapObservableArrayCached, observableValue } from '../../../../../base/common/observable.js';
import { isEqual } from '../../../../../base/common/resources.js';
import { ThemeIcon } from '../../../../../base/common/themables.js';
import { URI } from '../../../../../base/common/uri.js';
import { localize } from '../../../../../nls.js';
import { IConfigurationService } from '../../../../../platform/configuration/common/configuration.js';
import { IFileService } from '../../../../../platform/files/common/files.js';
import { IInstantiationService } from '../../../../../platform/instantiation/common/instantiation.js';
import { ILogService } from '../../../../../platform/log/common/log.js';
import { INotificationService } from '../../../../../platform/notification/common/notification.js';
import { observableConfigValue } from '../../../../../platform/observable/common/platformObservableUtils.js';
import { IStorageService, StorageScope, StorageTarget } from '../../../../../platform/storage/common/storage.js';
import { ChatPillActionViewItem, IChatPill, withChatPillHoverLabel } from '../../../../browser/chatPills.js';
import { EditorResourceAccessor, SideBySideEditor } from '../../../../common/editor.js';
import { IEditorService } from '../../../../services/editor/common/editorService.js';
import { IChatInputPillSource } from '../chatInputPills.js';
import { createChatResourceContent, getChatResourceContentProvider, IChatResourceContent, IChatResourceTarget } from './chatResourceContent.js';
import { ChatResourceArea, ChatResourceMode, ChatResourceModesSettingId, chatResourceContributions, getConfiguredChatResourceMode, isChatResourceMode, resolveChatResourceTemplate } from './chatResources.js';
import { defaultChatEmbeddedResourceSize, getChatEmbeddedResourceAutomaticHeight, getChatEmbeddedResourceHeight, IChatEmbeddedResourceSize, resizeChatEmbeddedResource } from './chatResourceSizing.js';

/** A resource of a chat: contributed by an extension, or recorded for the chat, for example by its agent. */
export interface IChatResource extends IChatResourceTarget {
	/** Identifies the resource within its chat. */
	readonly id: string;
	readonly icon: ThemeIcon | undefined;
	/** The mode unless the user configured another: from the extension that contributes it, or from whoever recorded it. */
	readonly defaultMode: ChatResourceMode;
}

/** The transcript height that shown resources leave visible. */
const MIN_TRANSCRIPT_HEIGHT = 80;
/** The height a shown resource takes up besides its body: its header, its resize edge at the top of the chat, its border, and spacing. */
const SHOWN_RESOURCE_CHROME_HEIGHT = 36;
/** The height of the pill row below the transcript, which resources at the top of the chat leave room for. */
const PILL_ROW_HEIGHT = 28;
const MODE_OVERRIDES_STORAGE_KEY = 'chat.resources.modeOverrides';

/**
 * Shows a chat's resources as the user, extensions, and agents chose (see {@link ChatResourceMode}): it supplies the pills of
 * resources that have one, and shows the selected resource of each area: above the chat input, and at the top of the chat.
 * The pills of an area's resources act as its tabs: one of them is shown at a time, and clicking the shown one collapses it.
 */
export class ChatResourcesControl extends Disposable {

	readonly pillSources: IObservable<readonly IChatInputPillSource[]>;
	/** The height the resource above the chat input takes up, including its spacing. */
	readonly height: IObservable<number>;
	/** The height the resource at the top of the chat takes up, which the transcript gives up. */
	readonly topHeight: IObservable<number>;

	/** The chat's resources, contributed ones first. */
	readonly resources: IObservable<readonly IChatResource[]>;
	/** Contributed resources the user chose to only list; recorded resources are listed where they were recorded. */
	readonly listedContributions: IObservable<readonly IChatResource[]>;
	/** Modes the user chose for single resources, by chat and resource id. */
	private readonly _modeOverrides: ISettableObservable<Readonly<Record<string, Readonly<Record<string, ChatResourceMode>>>>>;
	/** The shown resource by chat and area; `null` when the user hid the area, absent before the user chose; see {@link getShownChatResource}. */
	private readonly _selection = observableValue<ReadonlyMap<string, string | null>>(this, new Map());
	/** Sizes by chat and resource id, kept while the control lives so that switching resources keeps their sizes. */
	private readonly _sizes = new Map<string, ISettableObservable<IChatEmbeddedResourceSize>>();
	/** The content height each resource last reported, so that showing it again starts at that height rather than jumping to it. */
	private readonly _contentHeights = new Map<string, ISettableObservable<number | undefined>>();
	private readonly _chatKey: IObservable<string | undefined>;
	private readonly _configuredModes: IObservable<Readonly<Record<string, unknown>> | undefined>;
	private readonly _shown: Readonly<Record<ChatResourceArea, IObservable<IChatResource | undefined>>>;

	/**
	 * @param container Receives the resource shown above the chat input as its first child, so it appears above the pills that the container also hosts.
	 * @param topContainer Receives the resource shown at the top of the chat.
	 * @param chatElement The chat widget. Shown resources never grow past the top of the element that clips it, and are clipped to it.
	 * @param recorded Resources recorded for the chat, such as files its agent added as artifacts.
	 */
	constructor(
		container: HTMLElement,
		topContainer: HTMLElement,
		chatElement: HTMLElement,
		sessionResource: IObservable<URI | undefined>,
		recorded: IObservable<readonly IChatResource[]>,
		@IFileService private readonly _fileService: IFileService,
		@IInstantiationService private readonly _instantiationService: IInstantiationService,
		@IConfigurationService configurationService: IConfigurationService,
		@IStorageService private readonly _storageService: IStorageService,
		@IEditorService private readonly _editorService: IEditorService,
		@INotificationService private readonly _notificationService: INotificationService,
	) {
		super();
		const element = dom.$('.chat-embedded-resources');
		container.prepend(element);
		const topElement = dom.append(topContainer, dom.$('.chat-top-resources'));
		this._register(toDisposable(() => {
			element.remove();
			topElement.remove();
		}));

		this._modeOverrides = observableValue(this, this._readModeOverrides());
		this._configuredModes = observableConfigValue<Readonly<Record<string, unknown>> | undefined>(ChatResourceModesSettingId, undefined, configurationService);
		this._chatKey = derived(this, reader => sessionResource.read(reader)?.toString());
		const candidates = derived(this, reader => {
			const session = sessionResource.read(reader);
			if (!session) {
				return [];
			}
			return chatResourceContributions.read(reader).flatMap((contribution): IChatResource[] => {
				const resource = resolveChatResourceTemplate(contribution, session);
				return resource ? [{ id: `contributed:${contribution.extensionId.value}/${contribution.id}`, label: contribution.label, icon: contribution.icon, resource, defaultMode: contribution.mode }] : [];
			});
		});
		const withExistence = mapObservableArrayCached(this, candidates, (resource, store) => ({
			resource,
			exists: this._observeExists(resource.resource, store),
		}), resource => `${resource.id}\u0000${resource.resource.toString()}`);
		const contributed = derived(this, reader => withExistence.read(reader).filter(entry => entry.exists.read(reader)).map(entry => entry.resource));
		this.resources = derived(this, reader => [...contributed.read(reader), ...recorded.read(reader)]);
		this.listedContributions = derived(this, reader => contributed.read(reader).filter(resource => this.getMode(resource, reader) === 'none'));
		const shownIn = (area: ChatResourceArea) => derived(this, reader => {
			const chat = this._chatKey.read(reader);
			const selected = chat === undefined ? undefined : this._selection.read(reader).get(`${chat}\u0000${area}`);
			return getShownChatResource(this.resources.read(reader).filter(resource => this.getMode(resource, reader) === area), selected);
		});
		this._shown = { embedded: shownIn('embedded'), top: shownIn('top') };

		// The resource floats upwards from the pills, over the transcript and whatever else the chat's container shows above the
		// input (such as the sessions list of an empty chat), so that container's top bounds it. It is looked up when measuring,
		// because the chat widget may not be attached yet when this control is created.
		const getBoundary = () => findClippingAncestor(chatElement);
		const availableSpace = observableValue(this, Number.POSITIVE_INFINITY);
		const topAvailableSpace = observableValue(this, Number.POSITIVE_INFINITY);
		const height = observableValue(this, 0);
		const topHeight = observableValue(this, 0);
		const layoutObserver = new (dom.getWindow(container).ResizeObserver)(() => {
			height.set(element.offsetHeight, undefined);
			topHeight.set(topElement.offsetHeight, undefined);
			// The resource at the top takes precedence: it is laid out before the transcript, which leaves its space to it.
			const inputHeight = container.parentElement?.offsetHeight ?? 0;
			topAvailableSpace.set(Math.max(0, chatElement.clientHeight - inputHeight - PILL_ROW_HEIGHT - MIN_TRANSCRIPT_HEIGHT), undefined);
			// While nothing is shown, the element is not laid out; it is measured once it shows a resource.
			if (element.offsetHeight > 0) {
				// The bottom edge stays put when the resource resizes, and moves with the chat input, which resizes then.
				availableSpace.set(Math.max(0, element.getBoundingClientRect().bottom - getBoundary().getBoundingClientRect().top - topElement.offsetHeight - MIN_TRANSCRIPT_HEIGHT), undefined);
			}
		});
		for (const observed of [element, topElement, chatElement, container.parentElement]) {
			if (observed) {
				layoutObserver.observe(observed);
			}
		}
		this._register(toDisposable(() => layoutObserver.disconnect()));
		this.height = height;
		this.topHeight = topHeight;

		const renderArea = (area: ChatResourceArea, areaElement: HTMLElement, space: IObservable<number>) => {
			const availableHeight = derived(this, reader => space.read(reader) - SHOWN_RESOURCE_CHROME_HEIGHT);
			const shownList = derived(this, reader => {
				const shown = this._shown[area].read(reader);
				return shown ? [shown] : [];
			});
			const frames = mapObservableArrayCached(this, shownList, (resource, store) =>
				store.add(this._instantiationService.createInstance(ChatShownResourceFrame, resource, area, this._getSize(resource, area), this._getContentHeight(resource), availableHeight, getBoundary, {
					openInEditor: () => this._openInEditor(resource, true),
					// Closing hides the resource; its pill shows it again, like a tab.
					close: () => this._select(area, null),
				})), resource => `${resource.id}\u0000${resource.resource.toString()}\u0000${resource.originalResource?.toString()}`);
			this._register(autorun(reader => {
				dom.reset(areaElement, ...frames.read(reader).map(frame => frame.element));
			}));
		};
		renderArea('embedded', element, availableSpace);
		renderArea('top', topElement, topAvailableSpace);

		const withPills = derived(this, reader => this.resources.read(reader).filter(resource => this.getMode(resource, reader) !== 'none'));
		this.pillSources = mapObservableArrayCached(this, withPills, (resource, store) => this._createPillSource(resource, store), resource => resource.id);
	}

	/** How the chat shows a resource: as the user chose for it, as configured for resources like it, or by its default. */
	getMode(resource: IChatResource, reader: IReader | undefined): ChatResourceMode {
		const chat = this._chatKey.read(reader);
		const override = chat === undefined ? undefined : this._modeOverrides.read(reader)[chat]?.[resource.id];
		return override ?? getConfiguredChatResourceMode(this._configuredModes.read(reader), resource.resource) ?? resource.defaultMode;
	}

	/** Pins a listed resource: gives it a pill of its own, whose context menu offers to show it in the chat. */
	getPinAction(resource: IChatResource): IAction {
		return withChatPillHoverLabel(toAction({
			id: 'chatResources.pin',
			label: localize('chatResources.pin', "Pin {0}", resource.label),
			class: ThemeIcon.asClassName(Codicon.pin),
			run: () => this._setMode(resource, 'pinned'),
		}), localize('chatResources.pinHoverLabel', "Pin"));
	}

	/** The context menu of a resource's pill: where the chat shows it, as a choice of one, and unpinning it. */
	private _getPillContextMenuActions(resource: IChatResource): IAction[] {
		const mode = this.getMode(resource, undefined);
		const showAction = (target: Exclude<ChatResourceMode, 'none'>, label: string) => toAction({
			id: `chatResources.mode.${target}`,
			label,
			checked: mode === target,
			run: () => {
				this._setMode(resource, target);
				// Choosing the area again shows the resource there, for example while it is hidden or open in an editor.
				if (target === 'embedded' || target === 'top') {
					this._select(target, resource.id);
				}
			},
		});
		return [
			toAction({
				id: 'chatResources.openInEditor',
				label: localize('chatResources.openInEditor', "Open in Editor"),
				run: () => this._openInEditor(resource, true),
			}),
			new Separator(),
			showAction('pinned', localize('chatResources.showAsPill', "Show as Pill")),
			showAction('embedded', localize('chatResources.showAboveInput', "Show Above Chat Input")),
			showAction('top', localize('chatResources.showAtTop', "Show at Top of Chat")),
			new Separator(),
			toAction({
				id: 'chatResources.unpin',
				label: localize('chatResources.unpin', "Unpin"),
				run: () => this._setMode(resource, 'none'),
			}),
		];
	}

	private _setMode(resource: IChatResource, mode: ChatResourceMode): void {
		const chat = this._chatKey.get();
		if (chat === undefined) {
			return;
		}
		const overrides = this._modeOverrides.get();
		this._modeOverrides.set({ ...overrides, [chat]: { ...overrides[chat], [resource.id]: mode } }, undefined);
		this._storageService.store(MODE_OVERRIDES_STORAGE_KEY, JSON.stringify(this._modeOverrides.get()), StorageScope.WORKSPACE, StorageTarget.MACHINE);
	}

	private _readModeOverrides(): Record<string, Record<string, ChatResourceMode>> {
		try {
			const value: unknown = JSON.parse(this._storageService.get(MODE_OVERRIDES_STORAGE_KEY, StorageScope.WORKSPACE, '{}'));
			const result: Record<string, Record<string, ChatResourceMode>> = {};
			for (const [chat, modes] of Object.entries(value && typeof value === 'object' ? value : {})) {
				result[chat] = Object.fromEntries(Object.entries(modes && typeof modes === 'object' ? modes : {}).filter((entry): entry is [string, ChatResourceMode] => isChatResourceMode(entry[1])));
			}
			return result;
		} catch {
			return {};
		}
	}

	private _select(area: ChatResourceArea, id: string | null): void {
		const chat = this._chatKey.get();
		if (chat !== undefined) {
			this._selection.set(new Map(this._selection.get()).set(`${chat}\u0000${area}`, id), undefined);
		}
	}

	/** The area that shows the resource when it is selected, if its mode has one. */
	private _getArea(resource: IChatResource, reader: IReader | undefined): ChatResourceArea | undefined {
		const mode = this.getMode(resource, reader);
		return mode === 'embedded' || mode === 'top' ? mode : undefined;
	}

	private _isShown(resource: IChatResource, reader: IReader | undefined): boolean {
		const area = this._getArea(resource, reader);
		return !!area && this._shown[area].read(reader)?.id === resource.id;
	}

	/** Whether an editor shows the resource, including a diff editor that shows its changes. */
	private _isOpenInEditor(resource: IChatResource): boolean {
		const provider = getChatResourceContentProvider(resource);
		if (provider) {
			return provider.isOpenInEditor(resource, this._instantiationService);
		}
		return this._editorService.editors.some(editor => isEqual(EditorResourceAccessor.getOriginalUri(editor, { supportSideBySide: SideBySideEditor.PRIMARY }), resource.resource));
	}

	/**
	 * Opens the resource in an editor, or reveals the editor that shows it.
	 * @param pinned Whether to keep the editor open rather than letting the next opened editor replace it, as when moving the
	 * embedded resource to an editor.
	 */
	private _openInEditor(resource: IChatResource, pinned = false): void {
		const area = this._getArea(resource, undefined);
		if (area && this._isShown(resource, undefined)) {
			this._select(area, null);
		}
		const provider = getChatResourceContentProvider(resource);
		if (provider) {
			// For example a website moves to an editor of the integrated browser, keeping its page.
			provider.openInEditor(resource, pinned, this._instantiationService).catch(error => this._notificationService.error(error));
			return;
		}
		const options = { pinned };
		const opened = resource.originalResource
			? this._editorService.openEditor({ original: { resource: resource.originalResource }, modified: { resource: resource.resource }, label: resource.label, options })
			: this._editorService.openEditor({ resource: resource.resource, options });
		opened.catch(error => this._notificationService.error(error));
	}

	private _onDidClickPill(resource: IChatResource): void {
		const area = this._getArea(resource, undefined);
		const shown = this._isShown(resource, undefined);
		if (!area || (!shown && this._isOpenInEditor(resource))) {
			// Opening an open resource reveals its editor.
			this._openInEditor(resource);
			return;
		}
		this._select(area, shown ? null : resource.id);
	}

	private _getSize(resource: IChatResource, area: ChatResourceArea): ISettableObservable<IChatEmbeddedResourceSize> {
		const key = `${this._chatKey.get()}\u0000${area}\u0000${resource.id}`;
		let size = this._sizes.get(key);
		if (!size) {
			size = observableValue(this, defaultChatEmbeddedResourceSize);
			this._sizes.set(key, size);
		}
		return size;
	}

	private _getContentHeight(resource: IChatResource): ISettableObservable<number | undefined> {
		const key = `${this._chatKey.get()}\u0000${resource.id}`;
		let contentHeight = this._contentHeights.get(key);
		if (!contentHeight) {
			contentHeight = observableValue<number | undefined>(this, undefined);
			this._contentHeights.set(key, contentHeight);
		}
		return contentHeight;
	}

	private _createPillSource(resource: IChatResource, store: DisposableStore): IChatInputPillSource {
		const action = store.add(new Action(
			`chatResources.pill.${resource.id}`,
			resource.label,
			ThemeIcon.asClassName(resource.icon ?? (resource.originalResource ? Codicon.diff : Codicon.file)),
			true,
			async () => this._onDidClickPill(resource),
		));
		store.add(autorun(reader => {
			const hasArea = !!this._getArea(resource, reader);
			const shown = this._isShown(resource, reader);
			action.checked = shown;
			action.tooltip = !hasArea
				? localize('chatResources.open', "Open {0}", resource.label)
				: shown
					? localize('chatResources.hide', "Hide {0}", resource.label)
					: localize('chatResources.show', "Show {0}", resource.label);
		}));
		const pill: IChatPill = {
			action,
			createActionViewItem: (options: IActionViewItemOptions) => new ChatResourcePillViewItem(undefined, action, options),
		};
		return {
			hasData: constObservable(true),
			pills: constObservable([pill]),
			getContextMenuPrimaryActions: () => this._getPillContextMenuActions(resource),
		};
	}

	private _observeExists(resource: URI, store: DisposableStore): IObservable<boolean> {
		const exists = observableValue(this, false);
		let version = 0;
		const refresh = async () => {
			const current = ++version;
			let result = false;
			try {
				await this._fileService.activateProvider(resource.scheme);
				result = await this._fileService.exists(resource);
			} catch {
				result = false;
			}
			if (current === version && !store.isDisposed) {
				exists.set(result, undefined);
			}
		};
		store.add(this._fileService.onDidFilesChange(e => {
			if (e.affects(resource)) {
				void refresh();
			}
		}));
		store.add(this._fileService.onDidChangeFileSystemProviderRegistrations(e => {
			if (e.scheme === resource.scheme) {
				void refresh();
			}
		}));
		store.add(this._fileService.watch(resource));
		store.add(toDisposable(() => version++));
		void refresh();
		return exists;
	}
}

/**
 * The resource an area of the chat shows, of the resources in that area. Until the user chooses one, the area shows its first
 * resource; afterwards only the chosen one, so the area does not show another one when the chosen one leaves it.
 * @param selected The id of the chosen resource, `null` when the user hid the area, `undefined` before the user chose.
 */
export function getShownChatResource<T extends { readonly id: string }>(resources: readonly T[], selected: string | null | undefined): T | undefined {
	if (selected === undefined) {
		return resources[0];
	}
	return selected === null ? undefined : resources.find(resource => resource.id === selected);
}

/** The element itself or its nearest ancestor that clips its content, which bounds what floats inside it. */
function findClippingAncestor(element: HTMLElement): HTMLElement {
	for (let current: HTMLElement | null = element; current; current = current.parentElement) {
		if (dom.getComputedStyle(current).overflow !== 'visible') {
			return current;
		}
	}
	return element;
}

/** Shows on its pill whether a resource is shown above the chat input. */
class ChatResourcePillViewItem extends ChatPillActionViewItem {
	override render(container: HTMLElement): void {
		super.render(container);
		this.updateChecked();
	}

	protected override updateChecked(): void {
		this.element?.classList.toggle('chat-resource-pill-shown', !!this.action.checked);
		this.buttonElement?.setAttribute('aria-pressed', String(!!this.action.checked));
	}
}

/** How long the content height must stay unchanged after the content is shown before the view follows it. */
const CONTENT_HEIGHT_SETTLE_DELAY = 150;
/** The view follows the content height at the latest this long after the content is shown. */
const CONTENT_HEIGHT_SETTLE_DEADLINE = 600;

interface IChatShownResourceFrameActions {
	openInEditor(): void;
	close(): void;
}

/**
 * A resource shown in an area of the chat: a header that offers to open it in an editor, its content as
 * {@link createChatResourceContent} renders it, sized as {@link IChatEmbeddedResourceSize} describes, and a resize edge.
 * Above the chat input, the resource is anchored to the pills below it, so its top edge, the header, resizes it. At the
 * top of the chat, it is anchored to the top, so a resize edge below it resizes it.
 */
class ChatShownResourceFrame extends Disposable {

	readonly element: HTMLElement;
	private readonly _body: HTMLElement;
	private readonly _content = observableValue<IChatResourceContent | undefined>(this, undefined);
	constructor(
		private readonly _resource: IChatResource,
		area: ChatResourceArea,
		private readonly _size: ISettableObservable<IChatEmbeddedResourceSize>,
		private readonly _contentHeight: ISettableObservable<number | undefined>,
		availableHeight: IObservable<number>,
		private readonly _getClippingContainer: () => HTMLElement,
		actions: IChatShownResourceFrameActions,
		@IInstantiationService private readonly _instantiationService: IInstantiationService,
		@ILogService private readonly _logService: ILogService,
		@INotificationService private readonly _notificationService: INotificationService,
	) {
		super();
		const atTop = area === 'top';
		const elements = dom.h('.chat-embedded-resource@root', [
			dom.h('.chat-embedded-resource-header@header', [
				dom.h('span.chat-embedded-resource-title@title'),
				dom.h('.chat-embedded-resource-actions@actions'),
			]),
			dom.h('.chat-embedded-resource-body@body'),
		]);
		// The resize edge is the edge that moves: the top one above the chat input, the bottom one at the top of the chat.
		const resizeHandle = dom.$('.chat-embedded-resource-sash', { role: 'separator', 'aria-orientation': 'horizontal' });
		if (atTop) {
			elements.root.append(resizeHandle);
		} else {
			elements.root.prepend(resizeHandle);
		}
		this.element = elements.root;
		this.element.classList.toggle('at-top', atTop);
		this._body = elements.body;
		elements.title.textContent = _resource.label;
		this.element.setAttribute('aria-label', _resource.label);
		const buttons: readonly (readonly [string, ThemeIcon, () => void])[] = [
			[localize('chatResources.save', "Save"), Codicon.save, () => void this._save()],
			[localize('chatResources.openInEditorButton', "Open in Editor"), Codicon.goToFile, actions.openInEditor],
			[localize('chatResources.close', "Close"), Codicon.close, actions.close],
		];
		const buttonElements: HTMLElement[] = [];
		for (const [label, icon, run] of buttons) {
			const button = dom.append(elements.actions, dom.$(`a.action-label${ThemeIcon.asCSSSelector(icon)}`, { role: 'button', tabindex: '0', title: label, 'aria-label': label }));
			buttonElements.push(button);
			this._register(dom.addDisposableListener(button, dom.EventType.POINTER_DOWN, e => e.stopPropagation()));
			this._register(dom.addDisposableListener(button, dom.EventType.CLICK, () => run()));
			this._register(dom.addDisposableListener(button, dom.EventType.KEY_DOWN, e => {
				if (e.key === 'Enter' || e.key === ' ') {
					e.preventDefault();
					run();
				}
			}));
		}

		// Like an editor tab, the header shows unsaved changes, and offers to save them.
		this._register(autorun(reader => {
			const dirty = this._content.read(reader)?.isDirty?.read(reader) ?? false;
			this.element.classList.toggle('dirty', dirty);
			elements.title.textContent = dirty ? `● ${_resource.label}` : _resource.label;
			buttonElements[0].style.display = dirty ? '' : 'none';
		}));

		const height = derived(this, reader => getChatEmbeddedResourceHeight(this._size.read(reader), this._contentHeight.read(reader), availableHeight.read(reader)));
		this._register(autorun(reader => {
			const size = this._size.read(reader);
			this._body.style.height = `${height.read(reader)}px`;
			this.element.classList.toggle('automatic-height', size.fixedHeight === undefined);
			resizeHandle.title = size.fixedHeight === undefined
				? localize('chatResources.resizeAutomatic', "Follows its content up to {0}px. Drag to resize, double-click to reset.", size.maxAutomaticHeight)
				: localize('chatResources.resizeFixed', "Fixed at {0}px. Drag to its content height to follow the content again, double-click to reset.", Math.round(size.fixedHeight));
		}));
		// Dragging moves the edge that is not anchored: up grows the resource above the input, down grows it at the top.
		this._register(this._registerResizing(resizeHandle, height, atTop ? 1 : -1));
		void this._render();
	}

	private _registerResizing(handle: HTMLElement, height: IObservable<number>, direction: 1 | -1): DisposableStore {
		const store = new DisposableStore();
		store.add(dom.addDisposableListener(handle, dom.EventType.POINTER_DOWN, (e: PointerEvent) => {
			if (e.button !== 0) {
				return;
			}
			e.preventDefault();
			handle.setPointerCapture(e.pointerId);
			handle.classList.add('active');
			const drag = new DisposableStore();
			// Like the workbench sash: webview iframes would otherwise swallow the pointer while it passes over them.
			// eslint-disable-next-line no-restricted-syntax
			const iframes = [...handle.ownerDocument.getElementsByTagName('iframe')];
			for (const iframe of iframes) {
				iframe.classList.add('pointer-events-disabled');
			}
			drag.add(toDisposable(() => {
				handle.classList.remove('active');
				for (const iframe of iframes) {
					iframe.classList.remove('pointer-events-disabled');
				}
			}));
			const startY = e.clientY;
			const startHeight = height.get();
			const startSize = this._size.get();
			const startAutomaticHeight = getChatEmbeddedResourceAutomaticHeight(startSize, this._contentHeight.get());
			drag.add(dom.addDisposableListener(handle, dom.EventType.POINTER_MOVE, (move: PointerEvent) => {
				this._size.set(resizeChatEmbeddedResource(startSize, startAutomaticHeight, startHeight + direction * (move.clientY - startY), this._contentHeight.get()), undefined);
			}));
			drag.add(dom.addDisposableListener(handle, dom.EventType.POINTER_UP, () => drag.dispose()));
			drag.add(dom.addDisposableListener(handle, 'lostpointercapture', () => drag.dispose()));
			store.add(drag);
		}));
		store.add(dom.addDisposableListener(handle, dom.EventType.DBLCLICK, () => this._size.set(defaultChatEmbeddedResourceSize, undefined)));
		return store;
	}

	/**
	 * Applies the content height as it changes. Content reports several heights while it renders (for example a webview
	 * its empty document first), so until the reports settle the view keeps the height the resource last had.
	 */
	private _followContentHeight(contentHeight: IObservable<number | undefined>): DisposableStore {
		const store = new DisposableStore();
		let settled = false;
		const settle = () => {
			settled = true;
			const height = contentHeight.get();
			if (height !== undefined) {
				this._contentHeight.set(height, undefined);
			}
		};
		const settleTimer = store.add(new MutableDisposable());
		const deadline = setTimeout(settle, CONTENT_HEIGHT_SETTLE_DEADLINE);
		store.add(toDisposable(() => clearTimeout(deadline)));
		store.add(autorun(reader => {
			const height = contentHeight.read(reader);
			if (height === undefined) {
				return;
			}
			if (settled) {
				this._contentHeight.set(height, undefined);
				return;
			}
			const timer = setTimeout(() => {
				clearTimeout(deadline);
				settle();
			}, CONTENT_HEIGHT_SETTLE_DELAY);
			settleTimer.value = toDisposable(() => clearTimeout(timer));
		}));
		return store;
	}

	private async _save(): Promise<void> {
		try {
			await this._content.get()?.save?.();
		} catch (error) {
			this._notificationService.error(error);
		}
	}

	private async _render(): Promise<void> {
		try {
			const content = await createChatResourceContent(this._resource, this._body, this._getClippingContainer, this._instantiationService);
			if (this._store.isDisposed) {
				content.dispose();
				return;
			}
			this._register(content);
			this._content.set(content, undefined);
			this._register(this._followContentHeight(content.contentHeight));
			const layout = () => content.layout(this._body.clientWidth, this._body.clientHeight);
			const resizeObserver = new (dom.getWindow(this._body).ResizeObserver)(layout);
			resizeObserver.observe(this._body);
			this._register(toDisposable(() => resizeObserver.disconnect()));
			layout();
		} catch (error) {
			this._logService.error(`[ChatResources] Could not render ${this._resource.resource.toString()}`, error);
			dom.reset(this._body, dom.$('.chat-embedded-resource-error', undefined, toErrorMessage(error)));
		}
	}
}
