/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { getZoomFactor, onDidChangeZoomLevel } from '../../../../base/browser/browser.js';
import { $, addDisposableListener, getWindow } from '../../../../base/browser/dom.js';
import { hash } from '../../../../base/common/hash.js';
import { Disposable, toDisposable } from '../../../../base/common/lifecycle.js';
import { Schemas } from '../../../../base/common/network.js';
import { constObservable, IObservable } from '../../../../base/common/observable.js';
import { localize } from '../../../../nls.js';
import { IInstantiationService } from '../../../../platform/instantiation/common/instantiation.js';
import { ILogService } from '../../../../platform/log/common/log.js';
import { IEditorGroupsService } from '../../../services/editor/common/editorGroupsService.js';
import { IEditorService } from '../../../services/editor/common/editorService.js';
import { BrowserEditorInput } from '../../browserView/common/browserEditorInput.js';
import { IBrowserViewModel, IBrowserViewWorkbenchService } from '../../browserView/common/browserView.js';
import { focusWebContentsViewContainer, WebContentsViewHost } from '../../browserView/electron-browser/webContentsViewHost.js';
import { IChatResourceContent, IChatResourceTarget, registerChatResourceContentProvider } from '../browser/chatResources/chatResourceContent.js';

/** Websites have no content height; a chat resource that shows one starts at this height (up to its maximum). */
const WEBSITE_HEIGHT = 480;

/**
 * The integrated browser page that shows a website in the chat. It is an ordinary page of the integrated browser: the chat
 * reuses a page an editor already shows for the website, and moving the website to an editor opens this very page there.
 * Pages are kept per website while the window lives, so hiding and showing the website keeps its page and its state.
 */
const pages = new Map<string, BrowserEditorInput>();

/** Pages outlive window reloads, so a stable id lets the reloaded window reuse its page rather than leaking it. */
function getPageId(url: string): string {
	return `chat-resource-${(hash(url) >>> 0).toString(16)}`;
}

function getPage(target: IChatResourceTarget, browserViewService: IBrowserViewWorkbenchService): BrowserEditorInput {
	const url = target.resource.toString(true);
	const known = pages.get(url);
	if (known && !known.isDisposed()) {
		return known;
	}
	const open = [...browserViewService.getKnownBrowserViews().values()].find(input => !input.isDisposed() && input.url === url);
	const page = open ?? browserViewService.getOrCreateLazy({ id: getPageId(url), url });
	pages.set(url, page);
	return page;
}

/** A website shown as a chat resource, in the native view of its integrated browser page, following the view's body. */
class ChatResourceBrowserContent extends Disposable implements IChatResourceContent {

	readonly contentHeight: IObservable<number | undefined> = constObservable(WEBSITE_HEIGHT);

	private readonly _container: HTMLElement;
	private readonly _message: HTMLElement;
	private readonly _host: WebContentsViewHost;
	private _model: IBrowserViewModel | undefined;
	private _layoutSequence = 0;
	private _visible = false;

	constructor(
		private readonly _target: IChatResourceTarget,
		body: HTMLElement,
		private readonly _getClippingContainer: () => HTMLElement,
		@IInstantiationService instantiationService: IInstantiationService,
		@IBrowserViewWorkbenchService private readonly _browserViewService: IBrowserViewWorkbenchService,
		@IEditorService private readonly _editorService: IEditorService,
		@IEditorGroupsService private readonly _editorGroupsService: IEditorGroupsService,
		@ILogService private readonly _logService: ILogService,
	) {
		super();
		// The integrated browser's styles for its placeholder screenshot and overlays apply within a browser root.
		const root = body.appendChild($('.browser-root.chat-resource-browser-root'));
		root.style.height = '100%';
		this._container = root.appendChild($('.browser-container.chat-resource-browser', {
			tabindex: '0',
			role: 'group',
			'aria-label': localize('chatResources.website', "Website: {0}", _target.label),
		}));
		this._container.style.position = 'relative';
		this._container.style.height = '100%';
		const placeholder = this._container.appendChild($('.browser-placeholder-contents'));
		this._message = placeholder.appendChild($('.chat-embedded-resource-error', { role: 'status' }));
		const targetWindow = getWindow(body);
		this._host = this._register(instantiationService.createInstance(WebContentsViewHost, targetWindow, () => focusWebContentsViewContainer(this._container)));
		placeholder.append(this._host.screenshotElement, this._host.pauseElement);
		this._host.onContainerCreated(this._container);
		this._register(toDisposable(() => root.remove()));

		// The native view follows the body: when it moves with the chat's layout, scrolls, or leaves the screen.
		this._register(addDisposableListener(targetWindow, 'resize', () => this._layout()));
		this._register(addDisposableListener(targetWindow.document, 'visibilitychange', () => this._layout()));
		this._register(onDidChangeZoomLevel(() => this._layout()));
		const intersection = new targetWindow.IntersectionObserver(entries => {
			this._visible = entries.some(entry => entry.isIntersecting);
			this._layout();
		});
		intersection.observe(this._container);
		this._register(toDisposable(() => intersection.disconnect()));
		// A page has one native view: while an editor shows it, the chat leaves it to the editor.
		this._register(this._editorService.onDidVisibleEditorsChange(() => this._layout()));
	}

	async ready(): Promise<this> {
		this._message.textContent = localize('chatResources.websiteLoading', "Loading {0}…", this._target.label);
		try {
			const page = getPage(this._target, this._browserViewService);
			await this._takeFromEditors(page);
			const model = await page.resolve();
			if (this._store.isDisposed) {
				return this;
			}
			this._model = model;
			this._host.setVisible(false);
			this._host.setModel(model);
			this._register(model.onDidChangeFocus(event => {
				if (event.focused && !this._isShownInEditor()) {
					focusWebContentsViewContainer(this._container);
				}
			}));
			this._register(model.onDidChangeLoadingState(event => {
				this._message.textContent = event.error ? localize('chatResources.websiteError', "{0} could not load.", this._target.label) : '';
				this._layout();
			}));
			this._message.textContent = '';
			this._layout();
		} catch (error) {
			this._logService.error('[ChatResources] Could not create a browser page', error);
			this._message.textContent = localize('chatResources.websiteError', "{0} could not load.", this._target.label);
		}
		return this;
	}

	layout(): void {
		this._layout();
	}

	/** A page shows in one place: showing it in the chat moves it out of the editors that have it open, keeping its state. */
	private async _takeFromEditors(page: BrowserEditorInput): Promise<void> {
		const groups = this._editorGroupsService.groups.filter(group => group.contains(page));
		if (!groups.length) {
			return;
		}
		const keepPage = page.onBeforeDispose(event => event.veto());
		try {
			for (const group of groups) {
				await group.closeEditor(page, { preserveFocus: true });
			}
		} finally {
			keepPage.dispose();
		}
	}

	override dispose(): void {
		if (this._isShownInEditor()) {
			// The editor presents the page now: leave it visible.
			this._host.releaseModel();
		}
		super.dispose();
	}

	private _isShownInEditor(): boolean {
		const page = pages.get(this._target.resource.toString(true));
		return !!page && this._editorService.visibleEditors.includes(page);
	}

	private _layout(): void {
		const model = this._model;
		const sequence = ++this._layoutSequence;
		if (model && this._isShownInEditor()) {
			// Detaching would hide the page the editor shows; only stop drawing it here.
			this._message.textContent = localize('chatResources.websiteInEditor', "{0} is open in an editor.", this._target.label);
			return;
		}
		const bounds = this._measure();
		if (!model || !bounds) {
			this._host.setVisible(false);
			return;
		}
		void model.layout(bounds).then(() => {
			if (sequence === this._layoutSequence && this._model === model && this._measure()) {
				this._host.layout();
				this._host.setVisible(true);
			}
		}, error => this._logService.error('[ChatResources] Could not position a browser page', error));
	}

	/** The bounds of the native view, or `undefined` while the body is hidden or not entirely within the chat. */
	private _measure() {
		const targetWindow = getWindow(this._container);
		const rect = this._container.getBoundingClientRect();
		const clip = this._getClippingContainer().getBoundingClientRect();
		if (!this._visible || !this._container.isConnected || !this._container.checkVisibility() || targetWindow.document.hidden || rect.width <= 0 || rect.height <= 0
			|| rect.top < clip.top - 1 || rect.bottom > clip.bottom + 1 || rect.left < clip.left - 1 || rect.right > clip.right + 1) {
			return undefined;
		}
		const zoomFactor = getZoomFactor(targetWindow);
		const snap = (value: number) => Math.floor(value * zoomFactor) / zoomFactor;
		return { x: snap(rect.left), y: snap(rect.top), width: snap(rect.width), height: snap(rect.height), windowId: targetWindow.vscodeWindowId, zoomFactor, cornerRadius: 0 };
	}
}

registerChatResourceContentProvider({
	canRender: target => target.resource.scheme === Schemas.http || target.resource.scheme === Schemas.https,
	create: (target, body, getClippingContainer, instantiationService) => instantiationService.createInstance(ChatResourceBrowserContent, target, body, getClippingContainer).ready(),
	isOpenInEditor: (target, instantiationService) => instantiationService.invokeFunction(accessor => {
		const page = pages.get(target.resource.toString(true));
		return !!page && accessor.get(IEditorService).editors.includes(page);
	}),
	openInEditor: (target, pinned, instantiationService) => instantiationService.invokeFunction(async accessor => {
		const page = getPage(target, accessor.get(IBrowserViewWorkbenchService));
		await accessor.get(IEditorService).openEditor(page, { pinned });
	}),
});
