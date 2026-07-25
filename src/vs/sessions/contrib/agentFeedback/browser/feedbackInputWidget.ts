/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import './media/agentFeedbackEditorInput.css';
import { addStandardDisposableListener, ModifierKeyEmitter } from '../../../../base/browser/dom.js';
import { status as announceStatus } from '../../../../base/browser/ui/aria/aria.js';
import { ActionBar } from '../../../../base/browser/ui/actionbar/actionbar.js';
import { Action } from '../../../../base/common/actions.js';
import { Codicon } from '../../../../base/common/codicons.js';
import { ThemeIcon } from '../../../../base/common/themables.js';
import { Emitter, Event } from '../../../../base/common/event.js';
import { Disposable } from '../../../../base/common/lifecycle.js';

export interface IFeedbackInputWidgetAction {
	readonly label: string;
	readonly icon: ThemeIcon;
	readonly keybindingLabel: string;
}

export interface IFeedbackInputWidgetOptions {
	readonly placeholder: string;
	readonly ariaLabel?: string;
	/** Returns the available content width (e.g. editor content width, or a host container's width) to clamp against. */
	readonly getMaxContentWidth: () => number;
	readonly primaryAction: IFeedbackInputWidgetAction;
	/** When provided, holding Alt swaps the visible action to this one. */
	readonly secondaryAction?: IFeedbackInputWidgetAction;
}

/**
 * Reusable auto-sizing textarea + action bar shared by the editor "Add
 * Feedback" overlay and the Agents-window response-selection "Ask Question"
 * affordance. Positioning and hosting (overlay widget vs. absolute DOM child)
 * are left to the caller; this only owns the DOM structure, sizing and input.
 */
export class FeedbackInputWidget extends Disposable {

	private static readonly _MIN_WIDTH = 150;
	private static readonly _MAX_WIDTH = 400;
	// The input should never be wider than its host. Cap it to this fraction of
	// the available width so it doesn't render past the host bounds when narrow.
	private static readonly _MAX_WIDTH_HOST_FRACTION = 0.9;

	private static readonly _LINE_HEIGHT = 22;

	readonly domNode: HTMLElement;
	readonly inputElement: HTMLTextAreaElement;
	private readonly _measureElement: HTMLElement;
	private readonly _actionsContainer: HTMLElement;
	private readonly _busyIndicator: HTMLElement;
	private readonly _actionBar: ActionBar;
	private readonly _primaryAction: Action;
	private readonly _secondaryAction: Action | undefined;
	private _isShowingSecondary = false;
	private _busy = false;
	private readonly _hasExplicitAriaLabel: boolean;

	/** Whether {@link setBusy} is currently active; callers must not submit again while true. */
	get isBusy(): boolean {
		return this._busy;
	}

	private readonly _onDidTriggerPrimary = this._register(new Emitter<void>());
	readonly onDidTriggerPrimary: Event<void> = this._onDidTriggerPrimary.event;

	private readonly _onDidTriggerSecondary = this._register(new Emitter<void>());
	readonly onDidTriggerSecondary: Event<void> = this._onDidTriggerSecondary.event;

	constructor(private readonly _options: IFeedbackInputWidgetOptions) {
		super();
		this._hasExplicitAriaLabel = _options.ariaLabel !== undefined;
		this.domNode = document.createElement('div');
		this.domNode.classList.add('agent-feedback-input-widget');
		this.domNode.style.display = 'none';

		this.inputElement = document.createElement('textarea');
		this.inputElement.rows = 1;
		this.inputElement.placeholder = _options.placeholder;
		this.inputElement.setAttribute('aria-label', _options.ariaLabel ?? _options.placeholder);
		this.inputElement.style.lineHeight = `${FeedbackInputWidget._LINE_HEIGHT}px`;
		this.domNode.appendChild(this.inputElement);

		// Hidden element used to measure text width for auto-growing
		this._measureElement = document.createElement('span');
		this._measureElement.classList.add('agent-feedback-input-measure');
		this.domNode.appendChild(this._measureElement);

		const actionsContainer = document.createElement('div');
		actionsContainer.classList.add('agent-feedback-input-actions');
		actionsContainer.style.height = `${FeedbackInputWidget._LINE_HEIGHT}px`;
		this.domNode.appendChild(actionsContainer);
		this._actionsContainer = actionsContainer;

		this._busyIndicator = document.createElement('div');
		this._busyIndicator.classList.add('agent-feedback-input-busy-indicator', ...ThemeIcon.asClassNameArray(Codicon.loading), 'codicon-modifier-spin');
		this._busyIndicator.setAttribute('aria-hidden', 'true');
		this._busyIndicator.style.display = 'none';
		this._busyIndicator.style.height = `${FeedbackInputWidget._LINE_HEIGHT}px`;
		this.domNode.appendChild(this._busyIndicator);

		this._primaryAction = this._register(new Action(
			'feedbackInput.primary',
			_options.primaryAction.label,
			ThemeIcon.asClassName(_options.primaryAction.icon),
			false,
			() => { this._onDidTriggerPrimary.fire(); return Promise.resolve(); }
		));

		this._secondaryAction = _options.secondaryAction ? this._register(new Action(
			'feedbackInput.secondary',
			_options.secondaryAction.label,
			ThemeIcon.asClassName(_options.secondaryAction.icon),
			false,
			() => { this._onDidTriggerSecondary.fire(); return Promise.resolve(); }
		)) : undefined;

		this._actionBar = this._register(new ActionBar(actionsContainer));
		this._actionBar.push(this._primaryAction, { icon: true, label: false, keybinding: _options.primaryAction.keybindingLabel });

		if (this._secondaryAction) {
			const modifierKeyEmitter = ModifierKeyEmitter.getInstance();
			this._register(modifierKeyEmitter.event(status => this._updateActionForAlt(status.altKey)));
		}

		// Focus the input when clicking anywhere on the widget that isn't the
		// textarea itself or the action bar (e.g. padding around the textarea).
		this._register(addStandardDisposableListener(this.domNode, 'mousedown', e => {
			const target = e.target as Node | null;
			if (target === this.inputElement || actionsContainer.contains(target)) {
				return;
			}
			e.preventDefault();
			this.inputElement.focus();
		}));
	}

	private _updateActionForAlt(altKey: boolean): void {
		if (!this._secondaryAction) {
			return;
		}
		if (altKey && !this._isShowingSecondary) {
			this._isShowingSecondary = true;
			this._actionBar.clear();
			this._actionBar.push(this._secondaryAction, { icon: true, label: false, keybinding: this._options.secondaryAction!.keybindingLabel });
		} else if (!altKey && this._isShowingSecondary) {
			this._isShowingSecondary = false;
			this._actionBar.clear();
			this._actionBar.push(this._primaryAction, { icon: true, label: false, keybinding: this._options.primaryAction.keybindingLabel });
		}
	}

	show(): void {
		this.domNode.style.display = '';
	}

	hide(): void {
		this.domNode.style.display = 'none';
	}

	clearInput(): void {
		this.inputElement.value = '';
		this.updateActionEnabled();
		this.autoSize();
	}

	setPlaceholder(placeholder: string): void {
		if (this.inputElement.placeholder === placeholder) {
			return;
		}
		this.inputElement.placeholder = placeholder;
		if (!this._hasExplicitAriaLabel) {
			this.inputElement.setAttribute('aria-label', placeholder);
		}
		this.autoSize();
	}

	updateActionEnabled(): void {
		const hasText = this.inputElement.value.trim().length > 0 && !this._busy;
		this._primaryAction.enabled = hasText;
		if (this._secondaryAction) {
			this._secondaryAction.enabled = hasText;
		}
	}

	/**
	 * Toggles an accessible busy state: disables the input/actions, swaps the
	 * action bar for a spinning loading codicon, and (when turning busy on)
	 * announces `statusLabel` to screen readers via `aria-busy` + a status
	 * announcement. Idempotent; a no-op call does not re-announce.
	 */
	setBusy(busy: boolean, statusLabel?: string): void {
		if (this._busy === busy) {
			return;
		}
		this._busy = busy;
		this.inputElement.disabled = busy;
		this.inputElement.setAttribute('aria-busy', busy ? 'true' : 'false');
		this._actionsContainer.style.display = busy ? 'none' : '';
		this._busyIndicator.style.display = busy ? '' : 'none';
		this.updateActionEnabled();
		if (busy && statusLabel) {
			announceStatus(statusLabel);
		}
	}

	autoSize(): void {
		const text = this.inputElement.value || this.inputElement.placeholder;

		// Measure the text width using the hidden span
		this._measureElement.textContent = text;
		const textWidth = this._measureElement.scrollWidth;

		// Clamp width between min and a max that never exceeds the host width.
		// On very narrow hosts the max can drop below the nominal minimum, so
		// derive an effective minimum that never exceeds the max and apply it
		// inline to override the CSS `min-width` (otherwise the textarea would be
		// forced back up to its CSS minimum and overflow the host).
		const maxWidth = this._computeMaxWidth();
		const minWidth = Math.min(FeedbackInputWidget._MIN_WIDTH, maxWidth);
		const desiredWidth = Math.max(minWidth, textWidth + 10);
		const width = Math.min(desiredWidth, maxWidth);
		this.inputElement.style.minWidth = `${minWidth}px`;
		this.inputElement.style.width = `${width}px`;

		// Reset height to auto then expand to fit all content, with a minimum of 1 line
		this.inputElement.style.height = 'auto';
		const newHeight = Math.max(this.inputElement.scrollHeight, FeedbackInputWidget._LINE_HEIGHT);
		this.inputElement.style.height = `${newHeight}px`;
	}

	private _computeMaxWidth(): number {
		return Math.min(FeedbackInputWidget._MAX_WIDTH, this._options.getMaxContentWidth() * FeedbackInputWidget._MAX_WIDTH_HOST_FRACTION);
	}
}
