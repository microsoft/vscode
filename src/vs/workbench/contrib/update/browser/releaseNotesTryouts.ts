/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { $ } from '../../../../base/browser/dom.js';
import { CancellationTokenSource } from '../../../../base/common/cancellation.js';
import { isCancellationError } from '../../../../base/common/errors.js';
import { Event } from '../../../../base/common/event.js';
import { Disposable, MutableDisposable, toDisposable } from '../../../../base/common/lifecycle.js';
import { Schemas } from '../../../../base/common/network.js';
import { equals } from '../../../../base/common/objects.js';
import { URI } from '../../../../base/common/uri.js';
import { generateUuid } from '../../../../base/common/uuid.js';
import { localize } from '../../../../nls.js';
import { ICommandService } from '../../../../platform/commands/common/commands.js';
import { ILogService } from '../../../../platform/log/common/log.js';
import { INotificationService } from '../../../../platform/notification/common/notification.js';
import { createOnboardingTryoutUri, IOnboardingTryoutService, isOnboardingTryoutId, OnboardingTryoutAvailability, parseOnboardingTryoutUri, RUN_ONBOARDING_TRYOUT_COMMAND_ID } from '../../onboarding/common/onboardingTryout.js';
import { IWebview } from '../../webview/browser/webview.js';

interface IReleaseNotesTryoutState {
	readonly id: string;
	readonly kind: 'ready' | 'hidden' | 'unavailable';
	readonly label: string;
	readonly ariaLabel: string;
	readonly href: string;
	readonly message: string;
	readonly setupLabel: string;
	readonly setupAriaLabel: string;
}

interface IReleaseNotesTryoutRequest {
	readonly type: 'releaseNotesTryout';
	readonly documentId: string;
	readonly id: string;
	readonly index: number;
	readonly action: 'run' | 'setup';
}

type ReleaseNotesTryoutMessage = IReleaseNotesTryoutRequest | { readonly type: 'releaseNotesTryoutsReady'; readonly documentId: string };

function parseTryoutLink(uri: URI): string | undefined {
	if (uri.scheme !== Schemas.command || uri.path !== RUN_ONBOARDING_TRYOUT_COMMAND_ID) {
		return undefined;
	}
	if (uri.authority || uri.fragment) {
		throw new Error(localize('releaseNotes.tryout.invalidLink', "This feature example link is invalid."));
	}
	return parseOnboardingTryoutUri(uri);
}

/**
 * Owns the locally resolved links and interactions for one release notes document.
 */
export class ReleaseNotesTryouts extends Disposable {
	readonly documentId = generateUuid();

	private readonly _states = new Map<string, IReleaseNotesTryoutState>();
	private readonly _links = new Map<number, string>();
	private readonly _interaction = this._register(new MutableDisposable());
	private readonly _availabilityListener = this._register(new MutableDisposable());
	private _interactionTarget: { id: string; action: 'run' | 'setup' } | undefined;
	private _webview: IWebview | undefined;
	private _canRestoreFocus: (() => boolean) | undefined;
	private _ready = false;

	constructor(
		@IOnboardingTryoutService private readonly _tryoutService: IOnboardingTryoutService,
		@ICommandService private readonly _commandService: ICommandService,
		@INotificationService private readonly _notificationService: INotificationService,
		@ILogService private readonly _logService: ILogService,
	) {
		super();
	}

	needsRender(content: TrustedHTML): boolean {
		const html = content.toString();
		if (/\bdata-release-notes-tryout-(?:id|index)\s*=/i.test(html)) {
			return true;
		}
		for (const match of html.matchAll(/\bhref="(?<href>[^"]*)"/gi)) {
			try {
				if (parseTryoutLink(URI.parse(match.groups!.href)) !== undefined) {
					return true;
				}
			} catch {
				return true;
			}
		}
		return false;
	}

	render(container: HTMLElement): void {
		// eslint-disable-next-line no-restricted-syntax -- Fetched HTML does not have workbench element references.
		for (const element of container.querySelectorAll('[data-release-notes-tryout-id], [data-release-notes-tryout-index]')) {
			element.removeAttribute('data-release-notes-tryout-id');
			element.removeAttribute('data-release-notes-tryout-index');
		}

		// eslint-disable-next-line no-restricted-syntax
		for (const link of container.querySelectorAll<HTMLAnchorElement>('a[href]')) {
			let id: string | undefined;
			try {
				id = parseTryoutLink(URI.parse(link.getAttribute('href')!));
			} catch {
				this.replaceInvalidLink(link, localize('releaseNotes.tryout.invalidLink', "This feature example link is invalid."));
				continue;
			}
			if (id === undefined) {
				continue;
			}
			if (!this._tryoutService.getTryout(id)) {
				this.replaceInvalidLink(link, localize('releaseNotes.tryout.unknown', "This example is not available in this version of JustRide."));
				continue;
			}

			this._availabilityListener.value ??= this._tryoutService.onDidChange(() => this.update());
			const state = this.getState(id);
			const index = this._links.size;
			this._links.set(index, id);
			this._states.set(id, state);
			const element = $('span.release-notes-tryout', {
				'data-release-notes-tryout-id': id,
				'data-release-notes-tryout-index': index,
			}, $('a.release-notes-tryout-link', { role: 'link', tabindex: '0' }),
				$('span.release-notes-tryout-message'),
				$('button.release-notes-tryout-setup', { type: 'button' }));
			applyReleaseNotesTryoutState(element, state);
			link.replaceWith(element);
		}
	}

	private replaceInvalidLink(link: HTMLAnchorElement, message: string): void {
		const fallback = $('span');
		fallback.textContent = localize('releaseNotes.tryout.fallback', "{0} ({1})", link.textContent || localize('releaseNotes.tryout.label', "Try This"), message);
		link.replaceWith(fallback);
	}

	private getState(id: string): IReleaseNotesTryoutState {
		const metadata = this._tryoutService.getTryout(id)?.tryout;
		const availability = metadata ? this.getAvailability(id) : {
			kind: 'unavailable' as const,
			message: localize('releaseNotes.tryout.unknown', "This example is not available in this version of JustRide."),
		};
		const empty = { id, label: '', ariaLabel: '', href: '', message: '', setupLabel: '', setupAriaLabel: '' };
		if (availability.kind === 'hidden') {
			return { ...empty, kind: 'hidden' };
		}
		const label = metadata ? localize('releaseNotes.tryout.contextualLabel', "Try This: {0}", metadata.title) : localize('releaseNotes.tryout.label', "Try This");
		const message = availability.kind === 'unavailable' ? availability.message : '';
		const setupLabel = availability.kind === 'unavailable' ? availability.action?.label ?? '' : '';
		return {
			id,
			kind: availability.kind,
			label,
			ariaLabel: [
				label,
				metadata?.description,
				metadata?.targetWindow === 'agents' ? localize('releaseNotes.tryout.anotherWindow', "Opens in the Agents window.") : '',
				metadata?.isAI ? localize('releaseNotes.tryout.noAutoSend', "Chat examples are prepared for review and are not sent automatically.") : '',
				message,
			].filter(Boolean).join(' '),
			href: availability.kind === 'ready' ? createOnboardingTryoutUri(id).toString() : '',
			message,
			setupLabel,
			setupAriaLabel: setupLabel ? localize('releaseNotes.tryout.setupLabel', "{0} for {1}", setupLabel, metadata!.title) : '',
		};
	}

	attach(webview: IWebview, canRestoreFocus: () => boolean): void {
		this._webview = webview;
		this._canRestoreFocus = canRestoreFocus;
		this._register(Event.once(webview.onDidDispose)(() => this.dispose()));
		this._register(webview.onMessage(e => this.onMessage(e.message)));
	}

	private getAvailability(id: string): OnboardingTryoutAvailability {
		try {
			return this._tryoutService.getAvailability(id);
		} catch (error) {
			this._logService.error(`[ReleaseNotesTryouts] Could not resolve '${id}'`, error);
			return {
				kind: 'unavailable',
				message: localize('releaseNotes.tryout.failed', "This feature example could not be loaded."),
			};
		}
	}

	private onMessage(message: unknown): void {
		if (!message || typeof message !== 'object') {
			return;
		}
		const request = message as Partial<ReleaseNotesTryoutMessage>;
		if (request.documentId !== this.documentId) {
			return;
		}
		if (request.type === 'releaseNotesTryoutsReady') {
			this._ready = true;
			this.update(true);
		} else if (request.type === 'releaseNotesTryout') {
			if (!isOnboardingTryoutId(request.id)
				|| typeof request.index !== 'number' || this._links.get(request.index) !== request.id
				|| (request.action !== 'run' && request.action !== 'setup')
				|| Object.keys(request).some(key => !['type', 'documentId', 'id', 'index', 'action'].includes(key))) {
				this._notificationService.error(localize('releaseNotes.tryout.invalidLink', "This feature example link is invalid."));
				return;
			}
			void this.interact(request.id, request.index, request.action);
		}
	}

	async openLink(uri: URI): Promise<void> {
		try {
			const id = parseTryoutLink(uri);
			const link = [...this._links].find(([, value]) => value === id);
			if (!id || !link) {
				throw new Error(localize('releaseNotes.tryout.invalidLink', "This feature example link is invalid."));
			}
			await this.interact(id, link[0], 'run');
		} catch (error) {
			if (!this._store.isDisposed) {
				this._notificationService.error(error);
			}
		}
	}

	private async interact(id: string, index: number, action: 'run' | 'setup'): Promise<void> {
		if (this._store.isDisposed || this._interactionTarget?.id === id && this._interactionTarget.action === action) {
			return;
		}
		this._interactionTarget = { id, action };
		const tokenSource = new CancellationTokenSource();
		const interaction = toDisposable(() => tokenSource.dispose(true));
		this._interaction.value = interaction;
		try {
			const availability = this._tryoutService.getTryout(id) ? this.getAvailability(id) : undefined;
			if (!availability || availability.kind !== 'ready' && (action !== 'setup' || availability.kind !== 'unavailable' || !availability.action)) {
				this.update();
				if (availability?.kind !== 'hidden') {
					this._notificationService.warn(availability?.kind === 'unavailable' ? availability.message : localize('releaseNotes.tryout.unknown', "This example is not available in this version of JustRide."));
				}
				this.restoreFocus(index, action);
				return;
			}
			if (action === 'setup') {
				if (availability.kind === 'unavailable' && availability.action) {
					const command = availability.action.command;
					await this._commandService.executeCommand(command.id, ...(command.arguments ?? []));
				} else {
					this._notificationService.info(localize('releaseNotes.tryout.nowReady', "This example is ready. Choose Try This to continue."));
					this.restoreFocus(index, 'run');
				}
			} else {
				const result = await this._tryoutService.run(id, tokenSource.token);
				if (tokenSource.token.isCancellationRequested || this._store.isDisposed) {
					return;
				}
				if (result.kind === 'unavailable') {
					this._notificationService.warn(result.message);
				}
				if (result.kind === 'cancelled' || result.kind === 'unavailable') {
					this.restoreFocus(index, action);
				}
			}
			if (!tokenSource.token.isCancellationRequested) {
				this.update();
			}
		} catch (error) {
			if (!tokenSource.token.isCancellationRequested && !this._store.isDisposed) {
				if (!isCancellationError(error)) {
					this._notificationService.error(error);
				}
				this.restoreFocus(index, action);
				this.update();
			}
		} finally {
			if (this._interaction.value === interaction) {
				this._interactionTarget = undefined;
				this._interaction.clear();
			}
		}
	}

	private restoreFocus(index: number, action: 'run' | 'setup'): void {
		if (!this._store.isDisposed && this._canRestoreFocus?.()) {
			this._webview?.focus();
			void this._webview?.postMessage({ type: 'releaseNotesTryoutFocus', documentId: this.documentId, index, action });
		}
	}

	private update(force = false): void {
		if (!this._ready || !this._webview || this._store.isDisposed) {
			return;
		}
		const states: IReleaseNotesTryoutState[] = [];
		for (const [id, previous] of this._states) {
			const state = this.getState(id);
			if (force || !equals(previous, state)) {
				this._states.set(id, state);
				states.push(state);
			}
		}
		if (states.length) {
			void this._webview.postMessage({ type: 'releaseNotesTryouts', documentId: this.documentId, states });
		}
	}

	getScript(): string {
		return `(${initializeReleaseNotesTryouts.toString()})(document, ${JSON.stringify(this.documentId)}, vscode, ${applyReleaseNotesTryoutState.toString()});`;
	}

	override dispose(): void {
		this._interactionTarget = undefined;
		this._webview = undefined;
		this._canRestoreFocus = undefined;
		super.dispose();
	}
}

/* eslint-disable no-restricted-syntax -- These functions inspect an isolated, serialized webview document. */
function applyReleaseNotesTryoutState(element: HTMLElement, state: IReleaseNotesTryoutState): void {
	const link = element.querySelector<HTMLAnchorElement>('.release-notes-tryout-link')!;
	const message = element.querySelector<HTMLElement>('.release-notes-tryout-message')!;
	const setup = element.querySelector<HTMLButtonElement>('.release-notes-tryout-setup')!;
	const focused = element.ownerDocument.activeElement;
	element.hidden = state.kind === 'hidden';
	link.textContent = state.label;
	link.setAttribute('aria-label', state.ariaLabel);
	link.setAttribute('aria-disabled', String(state.kind !== 'ready'));
	if (state.href) {
		link.setAttribute('href', state.href);
	} else {
		link.removeAttribute('href');
	}
	message.textContent = state.message;
	message.hidden = !state.message;
	setup.textContent = state.setupLabel;
	setup.setAttribute('aria-label', state.setupAriaLabel);
	setup.hidden = !state.setupLabel;
	if (focused && element.contains(focused)) {
		if (element.hidden && element.parentElement) {
			const parent = element.parentElement;
			const tabIndex = parent.getAttribute('tabindex');
			parent.tabIndex = -1;
			parent.focus({ preventScroll: true });
			if (tabIndex === null) {
				parent.removeAttribute('tabindex');
			} else {
				parent.setAttribute('tabindex', tabIndex);
			}
		} else if (focused === setup && setup.hidden) {
			link.focus({ preventScroll: true });
		}
	}
}

export function initializeReleaseNotesTryouts(
	targetDocument: Document,
	documentId: string,
	vscode: { postMessage(message: ReleaseNotesTryoutMessage): void },
	applyState = applyReleaseNotesTryoutState,
): () => void {
	const controller = new AbortController();
	const options = { signal: controller.signal };
	const elementsById = new Map<string, HTMLElement[]>();
	const elementsByIndex = new Map<number, HTMLElement>();
	for (const element of targetDocument.querySelectorAll<HTMLElement>('[data-release-notes-tryout-id]')) {
		const id = element.dataset.releaseNotesTryoutId!;
		const elements = elementsById.get(id) ?? [];
		elements.push(element);
		elementsById.set(id, elements);
		elementsByIndex.set(Number(element.dataset.releaseNotesTryoutIndex), element);
	}
	targetDocument.addEventListener('click', event => {
		const control = event.target instanceof Element ? event.target.closest('a, button') : null;
		const element = control?.closest<HTMLElement>('[data-release-notes-tryout-id]');
		if (!element || !control) {
			return;
		}
		event.preventDefault();
		event.stopImmediatePropagation();
		if (element.hidden || control.getAttribute('aria-disabled') === 'true') {
			return;
		}
		vscode.postMessage({
			type: 'releaseNotesTryout',
			documentId,
			id: element.dataset.releaseNotesTryoutId!,
			index: Number(element.dataset.releaseNotesTryoutIndex),
			action: control.tagName === 'BUTTON' ? 'setup' : 'run',
		});
	}, { ...options, capture: true });
	targetDocument.defaultView?.addEventListener('message', event => {
		const message = event.data;
		if (message?.documentId !== documentId) {
			return;
		}
		if (message.type === 'releaseNotesTryouts') {
			for (const state of message.states as IReleaseNotesTryoutState[]) {
				for (const element of elementsById.get(state.id) ?? []) {
					applyState(element, state);
				}
			}
		} else if (message.type === 'releaseNotesTryoutFocus') {
			const element = elementsByIndex.get(message.index);
			const setup = element?.querySelector<HTMLButtonElement>('.release-notes-tryout-setup');
			if (element && !element.hidden) {
				(message.action === 'setup' && setup && !setup.hidden ? setup : element.querySelector<HTMLAnchorElement>('a'))?.focus({ preventScroll: true });
			}
		}
	}, options);
	targetDocument.defaultView?.addEventListener('pagehide', () => controller.abort(), { ...options, once: true });
	vscode.postMessage({ type: 'releaseNotesTryoutsReady', documentId });
	return () => controller.abort();
}
/* eslint-enable no-restricted-syntax */
