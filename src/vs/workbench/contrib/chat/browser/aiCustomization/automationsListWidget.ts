/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import './media/aiCustomizationManagement.css';
import * as DOM from '../../../../../base/browser/dom.js';
import { Emitter } from '../../../../../base/common/event.js';
import { Disposable } from '../../../../../base/common/lifecycle.js';
import { localize } from '../../../../../nls.js';

const $ = DOM.$;

/**
 * Widget that renders the Automations section of the AI Customization editor.
 *
 * Phase 1: empty-state placeholder. The list rendering, create dialog, and
 * actions land in later phases together with the scheduler and service.
 */
export class AutomationsListWidget extends Disposable {

	readonly element: HTMLElement;

	private readonly _onDidChangeItemCount = this._register(new Emitter<number>());
	readonly onDidChangeItemCount = this._onDidChangeItemCount.event;

	constructor() {
		super();

		this.element = $('.automations-list-widget');
		this.renderEmptyState();
	}

	private renderEmptyState(): void {
		const empty = DOM.append(this.element, $('.automations-empty-state'));
		const title = DOM.append(empty, $('h3.automations-empty-title'));
		title.textContent = localize('automationsEmptyTitle', "No automations yet");
		const message = DOM.append(empty, $('p.automations-empty-message'));
		message.textContent = localize('automationsEmptyMessage', "Create an automation to schedule an agent session to run on a cadence you choose.");
	}

	/**
	 * Re-emits the current count. Called by the editor after wiring the
	 * count listener so the sidebar badge initializes correctly.
	 */
	fireItemCount(): void {
		this._onDidChangeItemCount.fire(0);
	}

	focusSearch(): void {
		// No-op for Phase 1; there is no search input until the list lands.
	}
}
