/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as dom from '../../../../base/browser/dom.js';
import { Codicon } from '../../../../base/common/codicons.js';
import { Disposable, DisposableStore } from '../../../../base/common/lifecycle.js';
import { Emitter, Event } from '../../../../base/common/event.js';
import { renderIcon } from '../../../../base/browser/ui/iconLabel/iconLabels.js';
import { localize } from '../../../../nls.js';
import { IStorageService, StorageScope, StorageTarget } from '../../../../platform/storage/common/storage.js';

import './media/workspacePickerCallout.css';

const STORAGE_KEY_DISMISSED = 'sessions.workspaceCallout.dismissed';
const STORAGE_KEY_SNOOZED = 'sessions.workspaceCallout.snoozed';
const STORAGE_KEY_SNOOZE_UNTIL = 'sessions.workspaceCallout.snoozeUntil';
const SNOOZE_DURATION_MS = 24 * 60 * 60 * 1000; // 24 hours

/**
 * A floating callout widget that appears near the workspace picker to guide
 * first-time users. Shows a brief explanation of folder vs. repo options,
 * expandable FAQ items, and dismiss/snooze controls.
 */
export class WorkspacePickerCallout extends Disposable {

	private readonly _onDidDismiss = this._register(new Emitter<void>());
	readonly onDidDismiss: Event<void> = this._onDidDismiss.event;

	private _container: HTMLElement | undefined;
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
	 * Renders the callout widget into the given container, floating to the
	 * right of the workspace picker with a left-pointing pointer arrow.
	 */
	render(container: HTMLElement): HTMLElement {
		this._renderDisposables.clear();
		this._container?.remove();

		const callout = dom.append(container, dom.$('.workspace-picker-callout'));
		callout.style.display = 'none'; // Start hidden, shown on dropdown open
		this._container = callout;
		this._renderDisposables.add({ dispose: () => callout.remove() });

		// Prevent mousedown on the callout from stealing focus away from the action widget.
		// Without this, clicking <details> summaries or buttons would blur the action widget
		// and trigger its focusout → hide() handler before the click could register.
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
		dismissButton.appendChild(renderIcon(Codicon.check));
		this._renderDisposables.add(dom.addDisposableListener(dismissButton, dom.EventType.CLICK, (e) => {
			dom.EventHelper.stop(e, true);
			this._dismiss();
		}));

		const snoozeButton = dom.append(headerBar, dom.$('button.workspace-picker-callout-snooze'));
		snoozeButton.title = localize('snoozeTutorials', "Snooze tutorials for 24 hours");
		snoozeButton.setAttribute('aria-label', localize('snoozeTutorials', "Snooze tutorials for 24 hours"));
		snoozeButton.appendChild(renderIcon(Codicon.bellSlash));
		this._renderDisposables.add(dom.addDisposableListener(snoozeButton, dom.EventType.CLICK, (e) => {
			dom.EventHelper.stop(e, true);
			this._snooze();
		}));

		// Body
		const body = dom.append(callout, dom.$('.workspace-picker-callout-body'));

		// Description lines
		const desc = dom.append(body, dom.$('.workspace-picker-callout-description'));
		const line1 = dom.append(desc, dom.$('.workspace-picker-callout-line'));
		const folder = dom.append(line1, dom.$('span.workspace-picker-callout-icon'));
		folder.appendChild(renderIcon(Codicon.folderOpened));
		dom.append(line1, document.createTextNode(localize('calloutFolder', "Open a local folder you've already cloned")));

		const line2 = dom.append(desc, dom.$('.workspace-picker-callout-line'));
		const repo = dom.append(line2, dom.$('span.workspace-picker-callout-icon'));
		repo.appendChild(renderIcon(Codicon.repo));
		dom.append(line2, document.createTextNode(localize('calloutRepo', "Or pick a GitHub repo to edit without cloning")));

		// Expandable FAQ
		const faq = dom.append(body, dom.$('.workspace-picker-callout-faq'));

		this._renderFaqItem(faq,
			localize('faqCloneQ', "How do I clone a repo?"),
			localize('faqCloneA', "Use the command palette ({0}) and run \"Git: Clone\", then paste a repository URL. The cloned folder will appear in your file explorer and can be opened here.", 'Cmd+Shift+P'),
		);
		this._renderFaqItem(faq,
			localize('faqWorkspaceQ', "What is a workspace?"),
			localize('faqWorkspaceA', "A workspace is a folder (or set of folders) that the agent works against. It determines which files the agent can read and modify. Pick a folder for local projects, or a GitHub repo for remote ones."),
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
	 * Shows the callout (used when the dropdown opens).
	 */
	show(): void {
		if (this._container) {
			this._container.style.display = '';
			this._container.classList.remove('hiding');
		}
	}

	/**
	 * Hides the callout without dismissing (used when the dropdown closes).
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
