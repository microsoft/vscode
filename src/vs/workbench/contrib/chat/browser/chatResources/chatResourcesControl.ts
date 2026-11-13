/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import './media/chatResources.css';
import * as dom from '../../../../../base/browser/dom.js';
import { toAction } from '../../../../../base/common/actions.js';
import { Codicon } from '../../../../../base/common/codicons.js';
import { toErrorMessage } from '../../../../../base/common/errorMessage.js';
import { isCancellationError } from '../../../../../base/common/errors.js';
import { Disposable, DisposableStore, MutableDisposable, toDisposable } from '../../../../../base/common/lifecycle.js';
import { autorun, derived, IObservable, IReader, ISettableObservable, mapObservableArrayCached, observableFromEvent, observableValue } from '../../../../../base/common/observable.js';
import { ThemeIcon } from '../../../../../base/common/themables.js';
import { URI } from '../../../../../base/common/uri.js';
import { localize } from '../../../../../nls.js';
import { SessionArtifactMode } from '../../../../../platform/agentHost/common/sessionArtifacts.js';
import { IFileService } from '../../../../../platform/files/common/files.js';
import { IInstantiationService } from '../../../../../platform/instantiation/common/instantiation.js';
import { ILogService } from '../../../../../platform/log/common/log.js';
import { INotificationService } from '../../../../../platform/notification/common/notification.js';
import { IStorageService, StorageScope, StorageTarget } from '../../../../../platform/storage/common/storage.js';
import { IChatPillEntry, withChatPillHoverLabel } from '../../../../browser/chatPills.js';
import { IEditorService } from '../../../../services/editor/common/editorService.js';
import { IChatInputOwnPillContext } from '../chatInputPills.js';
import { createChatResourceContent, IChatResourceTarget } from './chatResourceContent.js';
import { observeChatResourceExists } from './chatResourceExistence.js';
import { defaultChatEmbeddedResourceSize, getChatEmbeddedResourceAutomaticHeight, getChatEmbeddedResourceHeight, IChatEmbeddedResourceSize, resizeChatEmbeddedResource } from './chatResourceSizing.js';

/** A file the chat can show above its input, such as one its agent recorded as an artifact. */
export interface IChatResource extends IChatResourceTarget {
	/** The ID of the pill entry that stands for the resource. */
	readonly id: string;
	/**
	 * How whoever recorded the file asked the chat to show it, and how often that request changed; see
	 * {@link ChatResourcesControl}.
	 */
	readonly requested?: { readonly mode: SessionArtifactMode; readonly revision: number };
}

/** The transcript height that shown resources leave visible. */
const MIN_TRANSCRIPT_HEIGHT = 80;
/** The height a shown resource takes up besides its body: its header, its resize edge, its border, and spacing. */
const SHOWN_RESOURCE_CHROME_HEIGHT = 36;
const OPENS_IN_CHAT_STORAGE_KEY = 'chat.resources.opensInChat';
const APPLIED_REQUESTS_STORAGE_KEY = 'chat.resources.appliedRequests';

/**
 * Lets the pinned pills of a chat's files open them above the chat input instead of in an editor.
 *
 * Pinning is the pills' own: any entry can be pinned into a pill of its own. On top of that, the user chooses for each
 * pinned file where its pill opens it (see {@link presentOwnPill}). The pills of the files that open in the chat act as
 * tabs: one of them is shown at a time, and clicking the shown one hides it.
 *
 * Whoever recorded a file can ask for it to be pinned or shown above the input ({@link IChatResource.requested}). The
 * control does that once per request, as the user would, and remembers it: the user's later changes stick until the file
 * is recorded with another request.
 */
export class ChatResourcesControl extends Disposable {

	/** The height the resource above the chat input takes up, including its spacing. */
	readonly height: IObservable<number>;

	/** The chat's files that exist, by the ID of their pill entry. */
	private readonly _resources: IObservable<ReadonlyMap<string, IChatResource>>;
	/** The IDs of the entries that open in the chat rather than in an editor, by chat. */
	private readonly _opensInChat: IObservable<Readonly<Record<string, readonly string[]>>>;
	/** The ID of the shown resource by chat; `null` when the user hid it, absent before the user chose; see {@link getShownChatResource}. */
	private readonly _selection = observableValue<ReadonlyMap<string, string | null>>(this, new Map());
	/** Sizes by chat and resource ID, kept while the control lives so that switching resources keeps their sizes. */
	private readonly _sizes = new Map<string, ISettableObservable<IChatEmbeddedResourceSize>>();
	/** The content height each resource last reported, so that showing it again starts at that height rather than jumping to it. */
	private readonly _contentHeights = new Map<string, ISettableObservable<number | undefined>>();
	private readonly _chatKey: IObservable<string | undefined>;
	private readonly _shown: IObservable<IChatResource | undefined>;

	/**
	 * @param container Receives the resource shown above the chat input as its first child, so it appears above the pills that the container also hosts.
	 * @param chatElement The chat widget. Shown resources never grow past the top of the element that clips it, and are clipped to it.
	 * @param recorded Files recorded for the chat, such as files its agent added as artifacts.
	 * @param isPinned Whether the user pinned the entry of a resource into a pill of its own; only pinned resources open in the chat.
	 * @param pin Pins the entry of a resource, as its pin action does. Returns whether it could.
	 */
	constructor(
		container: HTMLElement,
		chatElement: HTMLElement,
		sessionResource: IObservable<URI | undefined>,
		recorded: IObservable<readonly IChatResource[]>,
		isPinned: (id: string, reader: IReader) => boolean,
		private readonly _pin: (resource: IChatResource) => boolean,
		@IFileService private readonly _fileService: IFileService,
		@IInstantiationService private readonly _instantiationService: IInstantiationService,
		@IStorageService private readonly _storageService: IStorageService,
		@IEditorService private readonly _editorService: IEditorService,
		@INotificationService private readonly _notificationService: INotificationService,
	) {
		super();
		const element = dom.$('.chat-embedded-resources');
		container.prepend(element);
		this._register(toDisposable(() => element.remove()));

		// Every chat widget stores its choices under the same key, so each follows the stored value rather than its own copy.
		this._opensInChat = observableFromEvent(this, this._storageService.onDidChangeValue(StorageScope.WORKSPACE, OPENS_IN_CHAT_STORAGE_KEY, this._store), () => this._readOpensInChat());
		this._chatKey = derived(this, reader => sessionResource.read(reader)?.toString());
		// A recorded file can be missing: the agent can record it before writing it, or delete it later.
		const recordedTargets = derived(this, reader => [...new Set(recorded.read(reader).map(resource => resource.resource.toString()))]);
		const recordedExistence = mapObservableArrayCached(this, recordedTargets, (target, store) => [target, /* Resources that no file system provides, such as settings, count as existing: nothing can tell. */ observeChatResourceExists(this._fileService, URI.parse(target), store, true)] as const);
		this._resources = derived(this, reader => {
			if (this._chatKey.read(reader) === undefined) {
				return new Map();
			}
			const existence = new Map(recordedExistence.read(reader));
			return new Map(recorded.read(reader)
				.filter(resource => existence.get(resource.resource.toString())?.read(reader) ?? false)
				.map(resource => [resource.id, resource]));
		});
		this._shown = derived(this, reader => {
			const chat = this._chatKey.read(reader);
			const inChat = [...this._resources.read(reader).values()].filter(resource => isPinned(resource.id, reader) && this._opensInChatFor(resource.id, reader));
			return getShownChatResource(inChat, chat === undefined ? undefined : this._selection.read(reader).get(chat));
		});
		this._register(autorun(reader => {
			const chat = this._chatKey.read(reader);
			if (chat === undefined) {
				return;
			}
			const resources = [...this._resources.read(reader).values()];
			// Pinning can become possible only later, such as once the chat's pills exist: reading the pins runs this again then.
			resources.forEach(resource => resource.requested && isPinned(resource.id, reader));
			this._applyRequests(chat, resources);
		}));

		// The resource floats upwards from the pills, over the transcript and whatever else the chat's container shows above the
		// input (such as the sessions list of an empty chat), so that container's top bounds it. It is looked up when measuring,
		// because the chat widget may not be attached yet when this control is created.
		const getBoundary = () => findClippingAncestor(chatElement);
		const availableSpace = observableValue(this, Number.POSITIVE_INFINITY);
		const height = observableValue(this, 0);
		const measure = () => {
			height.set(element.offsetHeight, undefined);
			// While nothing is shown, the element is not laid out; it is measured once it shows a resource.
			if (element.offsetHeight > 0) {
				// The bottom edge stays put when the resource resizes, and moves with the chat input, which resizes then.
				availableSpace.set(Math.max(0, element.getBoundingClientRect().bottom - getBoundary().getBoundingClientRect().top - MIN_TRANSCRIPT_HEIGHT), undefined);
			}
		};
		// The measured height resizes the chat, which resizes the observed elements: measuring in the next frame keeps
		// that from looping within one frame.
		const scheduledMeasure = this._register(new MutableDisposable());
		const layoutObserver = new (dom.getWindow(container).ResizeObserver)(() => {
			scheduledMeasure.value ??= dom.scheduleAtNextAnimationFrame(dom.getWindow(container), () => {
				scheduledMeasure.clear();
				measure();
			});
		});
		for (const observed of [element, chatElement, container.parentElement]) {
			if (observed) {
				layoutObserver.observe(observed);
			}
		}
		this._register(toDisposable(() => layoutObserver.disconnect()));
		this.height = height;

		const availableHeight = derived(this, reader => availableSpace.read(reader) - SHOWN_RESOURCE_CHROME_HEIGHT);
		const shownList = derived(this, reader => {
			const shown = this._shown.read(reader);
			return shown ? [shown] : [];
		});
		const frames = mapObservableArrayCached(this, shownList, (resource, store) =>
			store.add(this._instantiationService.createInstance(ChatShownResourceFrame, resource, this._getSize(resource), this._getContentHeight(resource), availableHeight, getBoundary, {
				openInEditor: () => this._openInEditor(resource),
				// Closing hides the resource; its pill shows it again, like a tab.
				close: () => this._select(null),
			})), resource => `${resource.id}\u0000${resource.resource.toString()}`);
		this._register(autorun(reader => {
			dom.reset(element, ...frames.read(reader).map(frame => frame.element));
		}));
	}

	/**
	 * Decorates the entry of a pill of its own (see {@link IStandardChatInputPillSections.presentOwnPill}) that stands for one
	 * of the chat's files: its context menu offers whether the pill shows the file in the chat rather than in an editor; a pill that shows it there shows
	 * and hides it there.
	 */
	presentOwnPill(entry: IChatPillEntry, context: IChatInputOwnPillContext, reader: IReader): IChatPillEntry {
		const resource = this._resources.read(reader).get(entry.id);
		if (!resource) {
			return entry;
		}
		const inChat = context.pinned && this._opensInChatFor(entry.id, reader);
		const shown = inChat && this._shown.read(reader)?.id === entry.id;
		const actions = [
			withChatPillHoverLabel(toAction({
				id: 'chatResources.showAboveInput',
				label: localize('chatResources.showAboveInput', "Show Above Chat Input"),
				class: ThemeIcon.asClassName(Codicon.layoutPanel),
				checked: inChat,
				run: () => {
					if (inChat) {
						// Unchecking it lets the pill open the file in an editor again.
						this._setOpensInChat(entry.id, false);
						return;
					}
					// Only pinned entries open in the chat, so that the file keeps its pill when the chat records more.
					context.pin();
					this._setOpensInChat(entry.id, true);
					this._select(entry.id);
				},
			}), localize('chatResources.showAboveInputHoverLabel', "Chat")),
		];
		return {
			...entry,
			hoverActions: [...entry.hoverActions ?? [], ...actions],
			...(inChat ? {
				checked: shown,
				tooltip: shown ? localize('chatResources.hide', "Hide {0}", resource.label) : localize('chatResources.show', "Show {0}", resource.label),
				open: () => this._select(this._shown.get()?.id === entry.id ? null : entry.id),
			} : {}),
		};
	}

	private _opensInChatFor(id: string, reader: IReader | undefined): boolean {
		const chat = this._chatKey.read(reader);
		return chat !== undefined && (this._opensInChat.read(reader)[chat]?.includes(id) ?? false);
	}

	private _setOpensInChat(id: string, opensInChat: boolean): void {
		const chat = this._chatKey.get();
		if (chat === undefined) {
			return;
		}
		const all = this._readOpensInChat();
		const ids = (all[chat] ?? []).filter(candidate => candidate !== id);
		const next: Record<string, readonly string[]> = { ...all, [chat]: opensInChat ? [...ids, id] : ids };
		if (next[chat].length === 0) {
			delete next[chat];
		}
		if (Object.keys(next).length > 0) {
			this._storageService.store(OPENS_IN_CHAT_STORAGE_KEY, JSON.stringify(next), StorageScope.WORKSPACE, StorageTarget.MACHINE);
		} else {
			this._storageService.remove(OPENS_IN_CHAT_STORAGE_KEY, StorageScope.WORKSPACE);
		}
	}

	private _readOpensInChat(): Record<string, readonly string[]> {
		try {
			const value: unknown = JSON.parse(this._storageService.get(OPENS_IN_CHAT_STORAGE_KEY, StorageScope.WORKSPACE, '{}'));
			const result: Record<string, readonly string[]> = {};
			for (const [chat, ids] of Object.entries(value && typeof value === 'object' ? value : {})) {
				if (Array.isArray(ids)) {
					result[chat] = ids.filter((id): id is string => typeof id === 'string');
				}
			}
			return result;
		} catch {
			return {};
		}
	}

	private _select(id: string | null): void {
		const chat = this._chatKey.get();
		if (chat !== undefined) {
			this._selection.set(new Map(this._selection.get()).set(chat, id), undefined);
		}
	}

	/** Does what each resource's request asks once, as the user would; see {@link IChatResource.requested}. */
	private _applyRequests(chat: string, resources: readonly IChatResource[]): void {
		const all = this._readAppliedRequests();
		const applied = { ...all[chat] };
		let changed = false;
		for (const resource of resources) {
			if (!resource.requested) {
				continue;
			}
			// The revision tells a new request from the applied one even if the chat missed the requests in between.
			const request = `${resource.requested.mode}#${resource.requested.revision}`;
			if (applied[resource.id] === request || !this._pin(resource)) {
				continue;
			}
			// A pinned file opens in an editor; one shown above the input opens there.
			this._setOpensInChat(resource.id, resource.requested.mode === 'aboveInput');
			if (resource.requested.mode === 'aboveInput') {
				this._select(resource.id);
			}
			applied[resource.id] = request;
			changed = true;
		}
		if (changed) {
			this._storageService.store(APPLIED_REQUESTS_STORAGE_KEY, JSON.stringify({ ...all, [chat]: applied }), StorageScope.WORKSPACE, StorageTarget.MACHINE);
		}
	}

	private _readAppliedRequests(): Record<string, Record<string, string>> {
		try {
			const value: unknown = JSON.parse(this._storageService.get(APPLIED_REQUESTS_STORAGE_KEY, StorageScope.WORKSPACE, '{}'));
			const result: Record<string, Record<string, string>> = {};
			for (const [chat, requests] of Object.entries(value && typeof value === 'object' ? value : {})) {
				result[chat] = Object.fromEntries(Object.entries(requests && typeof requests === 'object' ? requests : {}).filter((entry): entry is [string, string] => typeof entry[1] === 'string'));
			}
			return result;
		} catch {
			return {};
		}
	}

	/** Opens the resource in an editor, or reveals the editor that shows it, and hides it in the chat. */
	private _openInEditor(resource: IChatResource): void {
		if (this._shown.get()?.id === resource.id) {
			this._select(null);
		}
		this._editorService.openEditor({ resource: resource.resource, options: { pinned: true } }).catch(error => this._notificationService.error(error));
	}

	private _getSize(resource: IChatResource): ISettableObservable<IChatEmbeddedResourceSize> {
		const key = `${this._chatKey.get()}\u0000${resource.id}`;
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

}

/**
 * The resource the chat shows, of the resources that open in the chat. Until the user chooses one, the chat shows the first
 * one; afterwards only the chosen one, so the chat does not show another one when the chosen one stops opening in the chat.
 * @param selected The ID of the chosen resource, `null` when the user hid it, `undefined` before the user chose.
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

/** How far the arrow keys move the resize edge. */
const KEYBOARD_RESIZE_STEP = 20;
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
 * The resource is anchored to the pills below it, so its top edge resizes it.
 */
class ChatShownResourceFrame extends Disposable {

	readonly element: HTMLElement;
	private readonly _body: HTMLElement;
	constructor(
		private readonly _resource: IChatResource,
		private readonly _size: ISettableObservable<IChatEmbeddedResourceSize>,
		private readonly _contentHeight: ISettableObservable<number | undefined>,
		availableHeight: IObservable<number>,
		private readonly _getClippingContainer: () => HTMLElement,
		actions: IChatShownResourceFrameActions,
		@IInstantiationService private readonly _instantiationService: IInstantiationService,
		@ILogService private readonly _logService: ILogService,
	) {
		super();
		const elements = dom.h('.chat-embedded-resource@root', [
			dom.h('.chat-embedded-resource-header@header', [
				dom.h('span.chat-embedded-resource-title@title'),
				dom.h('.chat-embedded-resource-actions@actions'),
			]),
			dom.h('.chat-embedded-resource-body@body'),
		]);
		// The resize edge is the edge that moves: the top one.
		const resizeHandle = dom.$('.chat-embedded-resource-sash', {
			role: 'separator',
			tabindex: '0',
			'aria-orientation': 'horizontal',
			'aria-label': localize('chatResources.resizeLabel', "Resize {0}", _resource.label),
		});
		elements.root.prepend(resizeHandle);
		this.element = elements.root;
		this._body = elements.body;
		elements.title.textContent = _resource.label;
		this.element.setAttribute('aria-label', _resource.label);
		const addButton = (label: string, icon: ThemeIcon, run: () => void) => {
			const button = dom.append(elements.actions, dom.$(`a.action-label${ThemeIcon.asCSSSelector(icon)}`, { role: 'button', tabindex: '0', title: label, 'aria-label': label }));
			this._register(dom.addDisposableListener(button, dom.EventType.POINTER_DOWN, e => e.stopPropagation()));
			this._register(dom.addDisposableListener(button, dom.EventType.CLICK, () => run()));
			this._register(dom.addDisposableListener(button, dom.EventType.KEY_DOWN, e => {
				if (e.key === 'Enter' || e.key === ' ') {
					e.preventDefault();
					run();
				}
			}));
			return button;
		};
		addButton(localize('chatResources.openInEditorButton', "Open in Editor"), Codicon.goToFile, actions.openInEditor);
		addButton(localize('chatResources.close', "Close"), Codicon.close, actions.close);


		const height = derived(this, reader => getChatEmbeddedResourceHeight(this._size.read(reader), this._contentHeight.read(reader), availableHeight.read(reader)));
		this._register(autorun(reader => {
			const size = this._size.read(reader);
			this._body.style.height = `${height.read(reader)}px`;
			this.element.classList.toggle('automatic-height', size.fixedHeight === undefined);
			resizeHandle.setAttribute('aria-valuenow', String(Math.round(height.read(reader))));
			resizeHandle.setAttribute('aria-valuetext', size.fixedHeight === undefined
				? localize('chatResources.resizeValueAutomatic', "Follows its content, {0} pixels", Math.round(height.read(reader)))
				: localize('chatResources.resizeValueFixed', "{0} pixels", Math.round(height.read(reader))));
			resizeHandle.title = size.fixedHeight === undefined
				? localize('chatResources.resizeAutomatic', "Follows its content up to {0}px. Drag or use the Up and Down Arrow keys to resize, double-click or press Home to reset.", size.maxAutomaticHeight)
				: localize('chatResources.resizeFixed', "Fixed at {0}px. Resize to its content height to follow the content again; double-click or press Home to reset.", Math.round(size.fixedHeight));
		}));
		// Dragging the top edge up grows the resource.
		this._register(this._registerResizing(resizeHandle, height, -1));
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
			// eslint-disable-next-line eslint-js/no-restricted-syntax
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
		store.add(dom.addDisposableListener(handle, dom.EventType.KEY_DOWN, (e: KeyboardEvent) => {
			if (e.key === 'Home') {
				e.preventDefault();
				this._size.set(defaultChatEmbeddedResourceSize, undefined);
				return;
			}
			// The arrow moves the handle, like dragging it.
			const movement = e.key === 'ArrowUp' ? -KEYBOARD_RESIZE_STEP : e.key === 'ArrowDown' ? KEYBOARD_RESIZE_STEP : 0;
			if (movement) {
				e.preventDefault();
				const size = this._size.get();
				const contentHeight = this._contentHeight.get();
				this._size.set(resizeChatEmbeddedResource(size, getChatEmbeddedResourceAutomaticHeight(size, contentHeight), height.get() + direction * movement, contentHeight), undefined);
			}
		}));
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

	private async _render(): Promise<void> {
		try {
			// The frame owns the content while it loads, so closing the frame disposes content that is still loading.
			const content = await createChatResourceContent(this._resource, this._body, this._getClippingContainer, this._instantiationService, this._store);
			if (this._store.isDisposed) {
				return;
			}
			this._register(this._followContentHeight(content.contentHeight));
			const layout = () => content.layout(this._body.clientWidth, this._body.clientHeight);
			const resizeObserver = new (dom.getWindow(this._body).ResizeObserver)(layout);
			resizeObserver.observe(this._body);
			this._register(toDisposable(() => resizeObserver.disconnect()));
			layout();
		} catch (error) {
			if (this._store.isDisposed || isCancellationError(error)) {
				return;
			}
			this._logService.error(`[ChatResources] Could not render ${this._resource.resource.toString()}`, error);
			dom.reset(this._body, dom.$('.chat-embedded-resource-error', undefined, toErrorMessage(error)));
		}
	}
}
