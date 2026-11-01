/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import './media/chatDockedViews.css';
import * as dom from '../../../../../base/browser/dom.js';
import { IActionViewItemOptions } from '../../../../../base/browser/ui/actionbar/actionViewItems.js';
import { Action } from '../../../../../base/common/actions.js';
import { Codicon } from '../../../../../base/common/codicons.js';
import { toErrorMessage } from '../../../../../base/common/errorMessage.js';
import { Disposable, DisposableStore, toDisposable } from '../../../../../base/common/lifecycle.js';
import { autorun, constObservable, derived, IObservable, ISettableObservable, mapObservableArrayCached, observableValue } from '../../../../../base/common/observable.js';
import { ThemeIcon } from '../../../../../base/common/themables.js';
import { URI } from '../../../../../base/common/uri.js';
import { localize } from '../../../../../nls.js';
import { IConfigurationService } from '../../../../../platform/configuration/common/configuration.js';
import { IFileService } from '../../../../../platform/files/common/files.js';
import { IInstantiationService } from '../../../../../platform/instantiation/common/instantiation.js';
import { ILogService } from '../../../../../platform/log/common/log.js';
import { observableConfigValue } from '../../../../../platform/observable/common/platformObservableUtils.js';
import { ChatPillActionViewItem, IChatPill } from '../../../../browser/chatPills.js';
import { DEFAULT_EDITOR_ASSOCIATION } from '../../../../common/editor.js';
import { IEditorResolverService } from '../../../../services/editor/common/editorResolverService.js';
import { IExtensionService } from '../../../../services/extensions/common/extensions.js';
import { CustomEditorInput } from '../../../customEditor/browser/customEditorInput.js';
import { IChatInputPillSource } from '../chatInputPills.js';
import { chatDockedViewContributions, ChatDockedViewsLayout, ChatDockedViewsLayoutSettingId, IChatDockedViewContribution, resolveChatDockedViewResource } from './chatDockedViews.js';
import { defaultChatDockedViewSize, getChatDockedViewAutomaticHeight, getChatDockedViewHeight, IChatDockedViewSize, resizeChatDockedView } from './chatDockedViewSizing.js';

/** A contributed docked view resolved for one chat. */
interface IChatDockedView {
	/** Identifies the view across chats; stable across re-renders. */
	readonly key: string;
	readonly contribution: IChatDockedViewContribution;
	readonly resource: URI;
}

/** The transcript height that docked views leave visible above them. */
const MIN_TRANSCRIPT_HEIGHT = 80;
/** The height a docked view takes up besides its body: its resize edge, its border, and the gap to the next view. */
const VIEW_CHROME_HEIGHT = 12;

/**
 * Docks extension-contributed views above a chat input and supplies the pills
 * that toggle them. A view is offered while its per-chat resource exists and is
 * rendered, readonly, by the resource's custom editor.
 */
export class ChatDockedViewsControl extends Disposable {

	readonly pillSources: IObservable<readonly IChatInputPillSource[]>;
	/** The height the docked views take up, including their spacing. */
	readonly height: IObservable<number>;

	/** In the stack layout: keys of views the user closed; views open when their resource appears. */
	private readonly _closed = observableValue<ReadonlySet<string>>(this, new Set());
	/** In the tabs layout: the selected view key per chat, or `null` when the user collapsed the views; absent selects the first view. */
	private readonly _tabSelection = observableValue<ReadonlyMap<string, string | null>>(this, new Map());
	/** Sizes by view key, kept while the control lives so that hiding and showing a view keeps its size. */
	private readonly _sizes = new Map<string, ISettableObservable<IChatDockedViewSize>>();
	private readonly _shown: IObservable<readonly IChatDockedView[]>;
	private readonly _sessionKey: IObservable<string | undefined>;
	private readonly _layout: IObservable<ChatDockedViewsLayout>;

	/**
	 * @param container Receives the docked views as its first child, so they appear above the pills that the container also hosts.
	 * @param chatElement The chat widget. The views never grow past the top of the element that clips it, and are clipped to that element.
	 */
	constructor(
		container: HTMLElement,
		chatElement: HTMLElement,
		sessionResource: IObservable<URI | undefined>,
		@IFileService private readonly _fileService: IFileService,
		@IInstantiationService instantiationService: IInstantiationService,
		@IConfigurationService configurationService: IConfigurationService,
	) {
		super();
		const element = dom.$('.chat-docked-views');
		container.prepend(element);
		this._register(toDisposable(() => element.remove()));

		this._layout = observableConfigValue<ChatDockedViewsLayout>(ChatDockedViewsLayoutSettingId, 'stack', configurationService);
		this._sessionKey = derived(this, reader => sessionResource.read(reader)?.toString());
		const candidates = derived(this, reader => {
			const session = sessionResource.read(reader);
			if (!session) {
				return [];
			}
			return chatDockedViewContributions.read(reader).flatMap(contribution => {
				const resource = resolveChatDockedViewResource(contribution, session);
				return resource ? [{ key: `${session.toString()}\u0000${contribution.extensionId.value}\u0000${contribution.id}`, contribution, resource }] : [];
			});
		});
		const withExistence = mapObservableArrayCached(this, candidates, (view, store) => ({
			view,
			exists: this._observeExists(view.resource, store),
		}), view => view.key);
		const available = derived(this, reader => withExistence.read(reader).filter(entry => entry.exists.read(reader)).map(entry => entry.view));
		this._shown = derived(this, reader => {
			const views = available.read(reader);
			if (this._layout.read(reader) === 'tabs') {
				const session = this._sessionKey.read(reader);
				const selected = session === undefined ? undefined : this._tabSelection.read(reader).get(session);
				if (selected === null) {
					return [];
				}
				const view = views.find(view => view.key === selected) ?? views[0];
				return view ? [view] : [];
			}
			const closed = this._closed.read(reader);
			return views.filter(view => !closed.has(view.key));
		});

		// The views float upwards from the pills, over the transcript and whatever else the chat's container shows above the input
		// (such as the sessions list of an empty chat), so that container's top bounds them. It is looked up when measuring, because
		// the chat widget may not be attached yet when this control is created.
		const getBoundary = () => findClippingAncestor(chatElement);
		const availableSpace = observableValue(this, Number.POSITIVE_INFINITY);
		const height = observableValue(this, 0);
		const layoutObserver = new (dom.getWindow(container).ResizeObserver)(() => {
			height.set(element.offsetHeight, undefined);
			// While no view shows, the element is not laid out; it is measured once it shows a view.
			if (element.offsetHeight > 0) {
				// The bottom edge stays put when the views resize, and moves with the chat input, which resizes then.
				availableSpace.set(Math.max(0, element.getBoundingClientRect().bottom - getBoundary().getBoundingClientRect().top - MIN_TRANSCRIPT_HEIGHT), undefined);
			}
		});
		for (const observed of [element, chatElement, container.parentElement]) {
			if (observed) {
				layoutObserver.observe(observed);
			}
		}
		this._register(toDisposable(() => layoutObserver.disconnect()));
		this.height = height;
		const availableHeightPerView = derived(this, reader => {
			const shown = this._shown.read(reader).length;
			return shown === 0 ? 0 : availableSpace.read(reader) / shown - VIEW_CHROME_HEIGHT;
		});

		const frames = mapObservableArrayCached(this, this._shown, (view, store) =>
			store.add(instantiationService.createInstance(ChatDockedViewFrame, view, this._getSize(view.key), availableHeightPerView, getBoundary)), view => view.key);
		this._register(autorun(reader => {
			dom.reset(element, ...frames.read(reader).map(frame => frame.element));
		}));

		this.pillSources = mapObservableArrayCached(this, available, (view, store) => this._createPillSource(view, store), view => view.key);
	}

	private _getSize(key: string): ISettableObservable<IChatDockedViewSize> {
		let size = this._sizes.get(key);
		if (!size) {
			size = observableValue(this, defaultChatDockedViewSize);
			this._sizes.set(key, size);
		}
		return size;
	}

	private _toggle(key: string): void {
		const isShown = this._shown.get().some(view => view.key === key);
		if (this._layout.get() === 'tabs') {
			const session = this._sessionKey.get();
			if (session !== undefined) {
				const selection = new Map(this._tabSelection.get());
				selection.set(session, isShown ? null : key);
				this._tabSelection.set(selection, undefined);
			}
			return;
		}
		const closed = new Set(this._closed.get());
		if (isShown) {
			closed.add(key);
		} else {
			closed.delete(key);
		}
		this._closed.set(closed, undefined);
	}

	private _createPillSource(view: IChatDockedView, store: DisposableStore): IChatInputPillSource {
		const isShown = derived(reader => this._shown.read(reader).some(shown => shown.key === view.key));
		const label = view.contribution.label;
		const action = store.add(new Action(
			`chatDockedViews.toggle.${view.contribution.extensionId.value}.${view.contribution.id}`,
			label,
			ThemeIcon.asClassName(view.contribution.icon ?? Codicon.layoutPanel),
			true,
			async () => this._toggle(view.key),
		));
		store.add(autorun(reader => {
			const shown = isShown.read(reader);
			action.checked = shown;
			action.tooltip = shown
				? localize('chatDockedViews.hide', "Hide {0}", label)
				: localize('chatDockedViews.show', "Show {0}", label);
		}));
		const pill: IChatPill = {
			action,
			createActionViewItem: (options: IActionViewItemOptions) => new ChatDockedViewPillViewItem(undefined, action, options),
		};
		return { hasData: constObservable(true), pills: constObservable([pill]) };
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

/** The element itself or its nearest ancestor that clips its content, which bounds what floats inside it. */
function findClippingAncestor(element: HTMLElement): HTMLElement {
	for (let current: HTMLElement | null = element; current; current = current.parentElement) {
		if (dom.getComputedStyle(current).overflow !== 'visible') {
			return current;
		}
	}
	return element;
}

/** Shows on its pill whether a docked view is shown. */
class ChatDockedViewPillViewItem extends ChatPillActionViewItem {
	override render(container: HTMLElement): void {
		super.render(container);
		this.updateChecked();
	}

	protected override updateChecked(): void {
		this.element?.classList.toggle('chat-docked-view-pill-open', !!this.action.checked);
		this.buttonElement?.setAttribute('aria-pressed', String(!!this.action.checked));
	}
}

/**
 * One docked view: the resource's custom editor in an overlay webview, sized
 * as {@link IChatDockedViewSize} describes, with a resize edge on top.
 */
class ChatDockedViewFrame extends Disposable {

	readonly element: HTMLElement;
	private readonly _body: HTMLElement;
	private readonly _contentHeight = observableValue<number | undefined>(this, undefined);

	constructor(
		private readonly _view: IChatDockedView,
		private readonly _size: ISettableObservable<IChatDockedViewSize>,
		availableHeight: IObservable<number>,
		private readonly _getClippingContainer: () => HTMLElement,
		@IInstantiationService private readonly _instantiationService: IInstantiationService,
		@IEditorResolverService private readonly _editorResolverService: IEditorResolverService,
		@IExtensionService private readonly _extensionService: IExtensionService,
		@ILogService private readonly _logService: ILogService,
	) {
		super();
		// The view is anchored to the pills below it, so its top edge is the one that moves.
		const elements = dom.h('.chat-docked-view@root', [
			dom.h('.chat-docked-view-sash@sash', { role: 'separator', 'aria-orientation': 'horizontal' }),
			dom.h('.chat-docked-view-body@body'),
		]);
		this.element = elements.root;
		this._body = elements.body;
		this.element.setAttribute('aria-label', _view.contribution.label);

		const height = derived(this, reader => getChatDockedViewHeight(this._size.read(reader), this._contentHeight.read(reader), availableHeight.read(reader)));
		this._register(autorun(reader => {
			const size = this._size.read(reader);
			this._body.style.height = `${height.read(reader)}px`;
			this.element.classList.toggle('automatic-height', size.fixedHeight === undefined);
			elements.sash.title = size.fixedHeight === undefined
				? localize('chatDockedViews.resizeAutomatic', "Follows its content up to {0}px. Drag to resize, double-click to reset.", size.maxAutomaticHeight)
				: localize('chatDockedViews.resizeFixed', "Fixed at {0}px. Drag to its content height to follow the content again, double-click to reset.", Math.round(size.fixedHeight));
		}));
		this._register(this._registerSash(elements.sash, height));
		void this._render();
	}

	private _registerSash(sash: HTMLElement, height: IObservable<number>): DisposableStore {
		const store = new DisposableStore();
		store.add(dom.addDisposableListener(sash, dom.EventType.POINTER_DOWN, (e: PointerEvent) => {
			if (e.button !== 0) {
				return;
			}
			e.preventDefault();
			sash.setPointerCapture(e.pointerId);
			sash.classList.add('active');
			const drag = new DisposableStore();
			// Like the workbench sash: webview iframes would otherwise swallow the pointer while it passes over them.
			// eslint-disable-next-line no-restricted-syntax
			const iframes = [...sash.ownerDocument.getElementsByTagName('iframe')];
			for (const iframe of iframes) {
				iframe.classList.add('pointer-events-disabled');
			}
			drag.add(toDisposable(() => {
				sash.classList.remove('active');
				for (const iframe of iframes) {
					iframe.classList.remove('pointer-events-disabled');
				}
			}));
			const startY = e.clientY;
			const startHeight = height.get();
			const startSize = this._size.get();
			const startAutomaticHeight = getChatDockedViewAutomaticHeight(startSize, this._contentHeight.get());
			drag.add(dom.addDisposableListener(sash, dom.EventType.POINTER_MOVE, (move: PointerEvent) => {
				this._size.set(resizeChatDockedView(startSize, startAutomaticHeight, startHeight + startY - move.clientY, this._contentHeight.get()), undefined);
			}));
			drag.add(dom.addDisposableListener(sash, dom.EventType.POINTER_UP, () => drag.dispose()));
			drag.add(dom.addDisposableListener(sash, 'lostpointercapture', () => drag.dispose()));
			store.add(drag);
		}));
		store.add(dom.addDisposableListener(sash, dom.EventType.DBLCLICK, () => this._size.set(defaultChatDockedViewSize, undefined)));
		return store;
	}

	private async _render(): Promise<void> {
		const { resource, contribution } = this._view;
		try {
			const viewType = this._editorResolverService.getEditors(resource).find(editor => editor.id !== DEFAULT_EDITOR_ASSOCIATION.id)?.id;
			if (!viewType) {
				throw new Error(localize('chatDockedViews.noEditor', "No custom editor is registered for {0}.", resource.toString()));
			}
			await this._extensionService.activateByEvent(`onCustomEditor:${viewType}`);
			if (this._store.isDisposed) {
				return;
			}
			const input = CustomEditorInput.create(this._instantiationService, {
				resource,
				viewType,
				webviewTitle: contribution.label,
				preferredName: contribution.label,
				iconPath: undefined,
			}, undefined);
			if (!(input instanceof CustomEditorInput)) {
				input.dispose();
				return;
			}
			this._register(input);
			await input.resolve();
			if (this._store.isDisposed) {
				return;
			}
			this._attach(input);
		} catch (error) {
			this._logService.error(`[ChatDockedViews] Could not render ${resource.toString()}`, error);
			dom.reset(this._body, dom.$('.chat-docked-view-error', undefined, toErrorMessage(error)));
		}
	}

	private _attach(input: CustomEditorInput): void {
		const webview = input.webview;
		const targetWindow = dom.getWindow(this.element);
		// Webviews report the height of their document, which is the content height.
		this._register(autorun(reader => {
			const size = webview.intrinsicContentSize.read(reader);
			if (size) {
				this._contentHeight.set(size.height, undefined);
			}
		}));

		// Like MCP apps in chat, claim the overlay only while its anchor is visible.
		let claimed = false;
		const release = () => {
			if (claimed) {
				claimed = false;
				webview.release(this);
			}
		};
		const observer = new targetWindow.IntersectionObserver(entries => {
			if (entries.some(entry => entry.isIntersecting) && this._body.isConnected) {
				webview.claim(this, targetWindow, undefined);
				claimed = true;
				webview.setAnchorElement(this._body, this._getClippingContainer());
			} else {
				release();
			}
		});
		observer.observe(this._body);
		this._register(toDisposable(() => {
			observer.disconnect();
			release();
		}));
	}
}
