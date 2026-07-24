/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { $, addDisposableListener, append, EventType } from '../../../../base/browser/dom.js';
import { Action } from '../../../../base/common/actions.js';
import { Codicon } from '../../../../base/common/codicons.js';
import { Emitter, Event } from '../../../../base/common/event.js';
import { Disposable } from '../../../../base/common/lifecycle.js';
import { ThemeIcon } from '../../../../base/common/themables.js';
import { localize } from '../../../../nls.js';
import { WorkbenchToolBar } from '../../../../platform/actions/browser/toolbar.js';
import { IInstantiationService } from '../../../../platform/instantiation/common/instantiation.js';

const PREVIOUS_ACTION_ID = 'promptTimeline.sticky.previous';
const NEXT_ACTION_ID = 'promptTimeline.sticky.next';

/**
 * A flat, opaque header pinned to the top of the chat transcript, modelled on the editor's sticky
 * scroll: it names the prompt currently scrolled off the top and offers previous/next actions to
 * step through prompts. Activating the label opens the prompt picker to jump elsewhere. Purely
 * presentational — the owner drives its content and visibility.
 */
export class PromptTimelineStickyHeader extends Disposable {

	private readonly _domNode: HTMLElement;
	private readonly _labelButton: HTMLButtonElement;
	private readonly _label: HTMLElement;
	private readonly _count: HTMLElement;
	private readonly _previousAction: Action;
	private readonly _nextAction: Action;

	private readonly _onDidActivate = this._register(new Emitter<void>());
	/** Fired when the label is clicked or activated by keyboard (opens the prompt picker). */
	readonly onDidActivate: Event<void> = this._onDidActivate.event;

	private readonly _onDidNavigate = this._register(new Emitter<number>());
	/** Fired with `-1` (previous prompt) or `+1` (next prompt) when a navigation action is run. */
	readonly onDidNavigate: Event<number> = this._onDidNavigate.event;

	get domNode(): HTMLElement { return this._domNode; }

	constructor(
		container: HTMLElement,
		@IInstantiationService instantiationService: IInstantiationService,
	) {
		super();
		this._domNode = append(container, $('.prompt-timeline-sticky'));
		// The inner content is constrained to the transcript's message column (see promptTimeline.css)
		// so the pinned prompt text lines up with the prompts scrolling underneath.
		const content = append(this._domNode, $('.prompt-timeline-sticky-content'));

		this._labelButton = append(content, $<HTMLButtonElement>('button.prompt-timeline-sticky-label-button'));
		this._label = append(this._labelButton, $('span.prompt-timeline-sticky-label'));
		this._count = append(this._labelButton, $('span.prompt-timeline-sticky-count'));
		// A native <button> already activates on click and on Enter/Space, so no manual key handling.
		this._register(addDisposableListener(this._labelButton, EventType.CLICK, () => this._onDidActivate.fire()));

		// Previous/Next are actions in a standard toolbar so they inherit theming, keyboard behaviour and
		// action lifecycle instead of a bespoke button implementation.
		this._previousAction = this._register(new Action(PREVIOUS_ACTION_ID, localize('promptTimeline.previousPrompt', "Go to Previous Prompt"), ThemeIcon.asClassName(Codicon.chevronUp), true, async () => this._onDidNavigate.fire(-1)));
		this._nextAction = this._register(new Action(NEXT_ACTION_ID, localize('promptTimeline.nextPrompt', "Go to Next Prompt"), ThemeIcon.asClassName(Codicon.chevronDown), true, async () => this._onDidNavigate.fire(1)));
		const toolbarContainer = append(content, $('.prompt-timeline-sticky-nav'));
		const toolbar = this._register(instantiationService.createInstance(WorkbenchToolBar, toolbarContainer, {
			ariaLabel: localize('promptTimeline.stickyNavAriaLabel', "Prompt navigation"),
		}));
		toolbar.setActions([this._previousAction, this._nextAction]);

		// Start hidden and out of the tab order until a prompt is pinned (see setVisible).
		this._setVisible(false);
	}

	/** Names the pinned prompt (1-based index within all prompts). */
	update(text: string, index: number, total: number): void {
		const label = text || localize('promptTimeline.emptyPrompt', "(empty prompt)");
		this._label.textContent = label;
		this._count.textContent = localize('promptTimeline.stickyCount', "{0}/{1}", index, total);
		this._labelButton.title = label;
		this._labelButton.setAttribute('aria-label', localize('promptTimeline.stickyLabel', "Go to prompt {0} of {1}: {2}", index, total, label));

		// The ends of the prompt list have nowhere to step to, so disable the matching action.
		this._previousAction.enabled = index > 1;
		this._nextAction.enabled = index < total;
	}

	setVisible(visible: boolean): void {
		this._setVisible(visible);
	}

	private _setVisible(visible: boolean): void {
		this._domNode.classList.toggle('hidden', !visible);
		// `.hidden` only drops opacity/pointer-events, which does not remove the label and toolbar from the
		// tab order; mark the header inert while hidden so it contributes no invisible tab stops.
		this._domNode.toggleAttribute('inert', !visible);
	}

	override dispose(): void {
		this._domNode.remove();
		super.dispose();
	}
}
