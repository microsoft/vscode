/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { $, addDisposableListener, append, EventType } from '../../../../base/browser/dom.js';
import { Codicon } from '../../../../base/common/codicons.js';
import { Emitter, Event } from '../../../../base/common/event.js';
import { Disposable } from '../../../../base/common/lifecycle.js';
import { ThemeIcon } from '../../../../base/common/themables.js';
import { localize } from '../../../../nls.js';

/**
 * A flat, opaque header pinned to the top of the chat transcript, modelled on the editor's sticky
 * scroll: it names the prompt currently scrolled off the top and, when activated, opens the prompt
 * picker to jump elsewhere. Purely presentational — the owner drives its content and visibility.
 */
export class PromptTimelineStickyHeader extends Disposable {

	private readonly _domNode: HTMLElement;
	private readonly _button: HTMLButtonElement;
	private readonly _label: HTMLElement;
	private readonly _count: HTMLElement;

	private readonly _onDidActivate = this._register(new Emitter<void>());
	/** Fired when the header is clicked or activated by keyboard (opens the prompt picker). */
	readonly onDidActivate: Event<void> = this._onDidActivate.event;

	get domNode(): HTMLElement { return this._domNode; }

	constructor(container: HTMLElement) {
		super();
		this._domNode = append(container, $('.prompt-timeline-sticky.hidden'));
		this._button = append(this._domNode, $<HTMLButtonElement>('button.prompt-timeline-sticky-button'));
		// The inner content is constrained to the transcript's message column (see promptTimeline.css)
		// so the pinned prompt text lines up with the prompts scrolling underneath.
		const content = append(this._button, $('.prompt-timeline-sticky-content'));
		this._label = append(content, $('span.prompt-timeline-sticky-label'));
		this._count = append(content, $('span.prompt-timeline-sticky-count'));
		append(content, $(`span.prompt-timeline-sticky-chevron${ThemeIcon.asCSSSelector(Codicon.chevronDown)}`));

		// A native <button> already activates on click and on Enter/Space, so no manual key handling.
		this._register(addDisposableListener(this._button, EventType.CLICK, () => this._onDidActivate.fire()));
	}

	/** Names the pinned prompt (1-based index within all prompts). */
	update(text: string, index: number, total: number): void {
		const label = text || localize('promptTimeline.emptyPrompt', "(empty prompt)");
		this._label.textContent = label;
		this._count.textContent = localize('promptTimeline.stickyCount', "{0}/{1}", index, total);
		this._button.title = label;
		this._button.setAttribute('aria-label', localize('promptTimeline.stickyLabel', "Go to prompt {0} of {1}: {2}", index, total, label));
	}

	setVisible(visible: boolean): void {
		this._domNode.classList.toggle('hidden', !visible);
	}

	override dispose(): void {
		this._domNode.remove();
		super.dispose();
	}
}
