/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { addDisposableListener, getWindow } from '../../../../../base/browser/dom.js';
import { RunOnceScheduler } from '../../../../../base/common/async.js';
import { CancellationTokenSource } from '../../../../../base/common/cancellation.js';
import { Disposable, DisposableStore, IDisposable, toDisposable } from '../../../../../base/common/lifecycle.js';
import { IConfigurationService } from '../../../../../platform/configuration/common/configuration.js';
import { ILogService } from '../../../../../platform/log/common/log.js';
import { IChatThinkingTitleRequest, IChatThinkingTitleService } from '../../common/chatThinkingTitleService.js';
import { ChatConfiguration } from '../../common/constants.js';

interface IVisibleThinkingTitle {
	readonly header: HTMLElement;
	readonly getRequest: () => IChatThinkingTitleRequest;
	readonly acceptTitle: (title: string) => void;
	intersecting: boolean;
	allowGeneration: boolean;
	cancellation?: CancellationTokenSource;
	finished: boolean;
}

/** Generates only at a visible live completion; revisiting a header may only reuse a cached title. */
export class ChatThinkingTitleController extends Disposable {
	private readonly requests = new Map<Element, IVisibleThinkingTitle>();
	private readonly visible = new Set<IVisibleThinkingTitle>();
	private readonly observerStore = this._register(new DisposableStore());
	private observer: IntersectionObserver | undefined;
	private window: Window | undefined;
	private chatVisible = true;
	private readonly scheduler = this._register(new RunOnceScheduler(() => this.generateVisibleTitles(), 250));

	constructor(
		private readonly container: HTMLElement,
		private readonly topInset: () => number,
		private readonly intersectionObserver: typeof IntersectionObserver | undefined,
		@IChatThinkingTitleService private readonly titleService: IChatThinkingTitleService,
		@IConfigurationService private readonly configurationService: IConfigurationService,
		@ILogService private readonly logService: ILogService,
	) {
		super();
		this._register(configurationService.onDidChangeConfiguration(event => {
			if (event.affectsConfiguration(ChatConfiguration.ThinkingGenerateTitles)) {
				for (const request of this.requests.values()) {
					this.update(request);
				}
			}
		}));
	}

	register(header: HTMLElement, getRequest: () => IChatThinkingTitleRequest, acceptTitle: (title: string) => void, newlyCompleted: boolean): IDisposable {
		const request: IVisibleThinkingTitle = { header, getRequest, acceptTitle, intersecting: false, allowGeneration: false, finished: false };
		request.allowGeneration = newlyCompleted
			&& this.configurationService.getValue<boolean>(ChatConfiguration.ThinkingGenerateTitles) !== false
			&& this.isInViewport(request);
		this.requests.set(header, request);
		queueMicrotask(() => {
			if (this._store.isDisposed || this.requests.get(header) !== request) {
				return;
			}
			this.ensureObserver();
			this.observer?.observe(header);
		});
		return toDisposable(() => {
			this.observer?.unobserve(header);
			this.requests.delete(header);
			this.visible.delete(request);
			request.cancellation?.dispose(true);
		});
	}

	setVisible(visible: boolean): void {
		if (this.chatVisible === visible) {
			return;
		}
		this.chatVisible = visible;
		for (const request of this.requests.values()) {
			request.intersecting = false;
			this.update(request);
			if (visible) {
				this.observer?.unobserve(request.header);
				this.observer?.observe(request.header);
			}
		}
		if (visible && this.requests.size) {
			queueMicrotask(() => {
				if (!this._store.isDisposed && this.chatVisible) {
					this.ensureObserver();
				}
			});
		}
	}

	private ensureObserver(): void {
		const targetWindow = getWindow(this.container);
		if (this.observer && this.window === targetWindow) {
			return;
		}
		this.observerStore.clear();
		this.window = targetWindow;
		const Observer = this.intersectionObserver ?? targetWindow.IntersectionObserver;
		if (typeof Observer !== 'function') {
			this.logService.warn('[ChatThinkingTitle] Viewport observation is unavailable; skipping generated titles');
			return;
		}
		this.observer = new Observer(entries => {
			for (const entry of entries) {
				const request = this.requests.get(entry.target);
				if (request) {
					request.intersecting = entry.isIntersecting && entry.intersectionRect.width > 0 && entry.intersectionRect.height > 0;
					this.update(request);
				}
			}
		}, { root: this.container });
		const observer = this.observer;
		this.observerStore.add(toDisposable(() => observer.disconnect()));
		this.observerStore.add(addDisposableListener(targetWindow.document, 'visibilitychange', () => {
			for (const request of this.requests.values()) {
				this.update(request);
			}
		}));
		for (const request of this.requests.values()) {
			if (!request.finished) {
				request.intersecting = false;
				observer.observe(request.header);
			}
		}
	}

	private isRelevant(request: IVisibleThinkingTitle): boolean {
		return request.intersecting && this.isInViewport(request);
	}

	private isInViewport(request: IVisibleThinkingTitle): boolean {
		const targetWindow = getWindow(this.container);
		if (this._store.isDisposed || !this.chatVisible || targetWindow.document.hidden
			|| !request.header.isConnected || !request.header.checkVisibility({ checkVisibilityCSS: true, checkOpacity: true })) {
			return false;
		}
		const header = request.header.getBoundingClientRect();
		const viewport = this.container.getBoundingClientRect();
		return header.width > 0 && header.height > 0
			&& header.bottom > Math.max(0, viewport.top + this.topInset()) && header.top < Math.min(targetWindow.innerHeight, viewport.bottom)
			&& header.right > Math.max(0, viewport.left) && header.left < Math.min(targetWindow.innerWidth, viewport.right);
	}

	private update(request: IVisibleThinkingTitle): void {
		if (request.finished) {
			return;
		}
		const relevant = this.isRelevant(request);
		if (!relevant || this.configurationService.getValue<boolean>(ChatConfiguration.ThinkingGenerateTitles) === false) {
			request.allowGeneration = false;
			request.cancellation?.dispose(true);
			request.cancellation = undefined;
		}
		if (relevant) {
			this.visible.add(request);
			if (!request.cancellation) {
				this.scheduler.schedule();
			}
		} else {
			this.visible.delete(request);
		}
	}

	private generateVisibleTitles(): void {
		for (const request of this.visible) {
			if (!request.cancellation && !request.finished && this.isRelevant(request)) {
				void this.generate(request);
			}
		}
	}

	private async generate(request: IVisibleThinkingTitle): Promise<void> {
		const cancellation = request.cancellation = new CancellationTokenSource();
		try {
			const input = request.getRequest();
			const title = request.allowGeneration
				? await this.titleService.generateTitle(input, () => request.allowGeneration && this.isRelevant(request), cancellation.token)
				: this.titleService.getCachedTitle(input);
			if (!cancellation.token.isCancellationRequested) {
				request.finished = true;
				this.visible.delete(request);
				this.observer?.unobserve(request.header);
				if (title && this.isRelevant(request)) {
					request.acceptTitle(title);
				}
			}
		} catch (error) {
			if (!cancellation.token.isCancellationRequested) {
				request.finished = true;
				this.visible.delete(request);
				this.logService.warn('[ChatThinkingTitle] Failed to update a visible thinking title', error);
			}
		} finally {
			cancellation.dispose();
			if (request.cancellation === cancellation) {
				request.cancellation = undefined;
			}
		}
	}

	override dispose(): void {
		for (const request of this.requests.values()) {
			request.cancellation?.dispose(true);
		}
		this.requests.clear();
		this.visible.clear();
		super.dispose();
	}
}
