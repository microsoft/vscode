/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as dom from '../../../../base/browser/dom.js';
import { Codicon } from '../../../../base/common/codicons.js';
import { Disposable, DisposableStore } from '../../../../base/common/lifecycle.js';
import { Emitter, Event } from '../../../../base/common/event.js';
import { localize } from '../../../../nls.js';
import { IStorageService, StorageScope, StorageTarget } from '../../../../platform/storage/common/storage.js';

import '../../chat/browser/media/workspacePickerCallout.css';

const STORAGE_KEY_DISMISSED = 'sessions.newSessionCallout.dismissed';
const STORAGE_KEY_SNOOZED = 'sessions.newSessionCallout.snoozed';
const STORAGE_KEY_SNOOZE_UNTIL = 'sessions.newSessionCallout.snoozeUntil';
const SNOOZE_DURATION_MS = 24 * 60 * 60 * 1000; // 24 hours

/**
 * A floating callout widget that appears near the "New Session" button to guide
 * users after their first agent session. Shows how to start new sessions,
 * expandable FAQ items, and dismiss/snooze controls.
 */
export class NewSessionCallout extends Disposable {

	private readonly _onDidDismiss = this._register(new Emitter<void>());
	readonly onDidDismiss: Event<void> = this._onDidDismiss.event;

	private _container: HTMLElement | undefined;
	private _anchorElement: HTMLElement | undefined;
	private readonly _renderDisposables = this._register(new DisposableStore());

	constructor(
		@IStorageService private readonly storageService: IStorageService,
	) {
		super();
	}

	/**
	 * Whether this callout should be shown (not dismissed and not snoozed).
	 */
	get shouldShow(): boolean {
		if (this.storageService.getBoolean(STORAGE_KEY_DISMISSED, StorageScope.PROFILE, false)) {
			return false;
		}
		if (this.storageService.getBoolean(STORAGE_KEY_SNOOZED, StorageScope.PROFILE, false)) {
			const snoozeUntil = this.storageService.getNumber(STORAGE_KEY_SNOOZE_UNTIL, StorageScope.PROFILE, 0);
			if (Date.now() < snoozeUntil) {
				return false;
			}
			// Snooze expired — clear the flag
			this.storageService.remove(STORAGE_KEY_SNOOZED, StorageScope.PROFILE);
			this.storageService.remove(STORAGE_KEY_SNOOZE_UNTIL, StorageScope.PROFILE);
		}
		return true;
	}

	/**
	 * Renders the callout widget. The callout uses fixed positioning anchored
	 * to the given container element so it can break out of overflow: hidden
	 * parent chains (e.g. the sidebar).
	 */
	render(anchorElement: HTMLElement): HTMLElement {
		this._renderDisposables.clear();
		this._container?.remove();
		this._anchorElement = anchorElement;

		// Append to body so it's not clipped by sidebar overflow
		const callout = dom.append(anchorElement.ownerDocument.body, dom.$('.workspace-picker-callout.callout-new-session'));
		callout.style.display = 'none'; // Start hidden
		this._container = callout;
		this._renderDisposables.add({ dispose: () => callout.remove() });

		// Prevent mousedown on the callout from stealing focus.
		this._renderDisposables.add(dom.addDisposableListener(callout, dom.EventType.MOUSE_DOWN, e => {
			e.preventDefault();
		}));

		// Left-pointing pointer arrow
		dom.append(callout, dom.$('.workspace-picker-callout-pointer'));

		// Header bar (dismiss + snooze)
		const headerBar = dom.append(callout, dom.$('.workspace-picker-callout-header'));

		const dismissButton = dom.append(headerBar, dom.$('button.workspace-picker-callout-dismiss'));
		dismissButton.title = localize('dismiss', "Dismiss");
		dismissButton.setAttribute('aria-label', localize('dismiss', "Dismiss"));
		dismissButton.appendChild(dom.$(`.codicon.codicon-${Codicon.check.id}`));
		this._renderDisposables.add(dom.addDisposableListener(dismissButton, dom.EventType.CLICK, (e) => {
			dom.EventHelper.stop(e, true);
			this._dismiss();
		}));

		const snoozeButton = dom.append(headerBar, dom.$('button.workspace-picker-callout-snooze'));
		snoozeButton.title = localize('snoozeTutorials', "Snooze tutorials for 24 hours");
		snoozeButton.setAttribute('aria-label', localize('snoozeTutorials', "Snooze tutorials for 24 hours"));
		snoozeButton.appendChild(dom.$(`.codicon.codicon-${Codicon.bellSlash.id}`));
		this._renderDisposables.add(dom.addDisposableListener(snoozeButton, dom.EventType.CLICK, (e) => {
			dom.EventHelper.stop(e, true);
			this._snooze();
		}));

		// Body
		const body = dom.append(callout, dom.$('.workspace-picker-callout-body'));

		// Description paragraph
		const desc = dom.append(body, dom.$('.workspace-picker-callout-description'));
		desc.textContent = localize('newSessionCalloutDescription', "To start an agent session in another repo or another agent session in this repo, click new session.");

		// Expandable FAQ
		const faq = dom.append(body, dom.$('.workspace-picker-callout-faq'));

		this._renderFaqItem(faq,
			localize('faqSelectBranchQ', "How do I select another branch in this repo?"),
			localize('faqSelectBranchA', "Open a new session, pick the same repo, then use the branch picker to choose a different starting branch."),
		);
		this._renderFaqItem(faq,
			localize('faqAgentWorkingQ', "How do I know if an agent is working or not?"),
			localize('faqAgentWorkingA', "Check the session list on the left. Active sessions show a progress indicator, and you'll see status updates in real time."),
		);

		// Accessibility: escape to dismiss
		this._renderDisposables.add(dom.addDisposableListener(callout, dom.EventType.KEY_DOWN, (e) => {
			if (e.key === 'Escape') {
				dom.EventHelper.stop(e, true);
				this._dismiss();
			}
		}));

		return callout;
	}

	/**
	 * Shows the callout, positioning it relative to the anchor element.
	 */
	show(): void {
		if (this._container && this._anchorElement) {
			const rect = this._anchorElement.getBoundingClientRect();
			this._container.style.position = 'fixed';
			this._container.style.top = `${rect.top}px`;
			this._container.style.left = `${rect.right + 10}px`;
			this._container.style.display = '';
			this._container.classList.remove('hiding');
		}
	}

	/**
	 * Hides the callout without dismissing.
	 */
	hide(): void {
		if (this._container) {
			this._container.style.display = 'none';
		}
	}

	private _renderFaqItem(container: HTMLElement, question: string, answer: string): void {
		const details = dom.append(container, dom.$('details.workspace-picker-callout-faq-item'));
		const summary = dom.append(details, dom.$('summary.workspace-picker-callout-faq-question'));
		summary.textContent = question;
		const answerEl = dom.append(details, dom.$('div.workspace-picker-callout-faq-answer'));
		answerEl.textContent = answer;
	}

	private _dismiss(): void {
		this.storageService.store(STORAGE_KEY_DISMISSED, true, StorageScope.PROFILE, StorageTarget.USER);
		this._animateOut();
		this._onDidDismiss.fire();
	}

	private _snooze(): void {
		this.storageService.store(STORAGE_KEY_SNOOZED, true, StorageScope.PROFILE, StorageTarget.USER);
		this.storageService.store(STORAGE_KEY_SNOOZE_UNTIL, Date.now() + SNOOZE_DURATION_MS, StorageScope.PROFILE, StorageTarget.USER);
		this._animateOut();
		this._onDidDismiss.fire();
	}

	private _animateOut(): void {
		if (this._container) {
			this._container.classList.add('hiding');
			const onEnd = () => {
				if (this._container) {
					this._container.style.display = 'none';
					this._container.classList.remove('hiding');
				}
			};
			this._container.addEventListener('animationend', onEnd, { once: true });
			setTimeout(onEnd, 200);
		}
	}
}
