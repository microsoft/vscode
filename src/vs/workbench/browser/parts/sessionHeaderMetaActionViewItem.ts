/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import './media/sessionHeaderMetaActionViewItem.css';
import { $, reset } from '../../../base/browser/dom.js';
import { BaseActionViewItem, IActionViewItemOptions } from '../../../base/browser/ui/actionbar/actionViewItems.js';
import { Button } from '../../../base/browser/ui/button/button.js';
import { IAction } from '../../../base/common/actions.js';
import { structuralEquals } from '../../../base/common/equals.js';
import { autorun, derived, derivedOpts, IObservable, IReader } from '../../../base/common/observable.js';
import { localize } from '../../../nls.js';
import { IInstantiationService } from '../../../platform/instantiation/common/instantiation.js';
import { defaultButtonStyles } from '../../../platform/theme/browser/defaultStyles.js';
import { AnimatedCounterWidget } from '../animatedCounterWidget.js';

/**
 * Renders a session header meta action as a compact secondary button pill.
 */
export class SessionHeaderMetaActionViewItem extends BaseActionViewItem {

	protected button: Button | undefined;

	constructor(context: unknown, action: IAction, options: IActionViewItemOptions) {
		super(context, action, options);
	}

	override render(container: HTMLElement): void {
		this.element = container;
		container.classList.add('chat-composite-bar-meta-item');

		const button = this.button = this._register(new Button(container, { secondary: true, small: true, ...defaultButtonStyles }));
		button.element.classList.add('monaco-text-button', 'chat-composite-bar-meta-item-button');
		this._register(button.onDidClick(event => {
			event?.stopPropagation();
			if (this._action.enabled) {
				this.onDidClickButton();
			}
		}));

		this.updateLabel();
		this.updateEnabled();
		this.updateTooltip();
	}

	protected onDidClickButton(): void {
		this.actionRunner.run(this._action, this._context);
	}

	override focus(): void {
		this.button?.focus();
	}

	override blur(): void {
		if (this.button) {
			this.button.element.tabIndex = -1;
			this.button.element.blur();
		}
	}

	override setFocusable(focusable: boolean): void {
		if (this.button) {
			this.button.element.tabIndex = focusable ? 0 : -1;
		}
	}

	override isFocused(): boolean {
		return !!this.button?.hasFocus();
	}

	protected override updateClass(): void {
		this.updateLabel();
	}

	protected override updateEnabled(): void {
		if (this.button) {
			this.button.enabled = this._action.enabled;
		}
	}

	protected override updateLabel(): void {
		if (!this.button) {
			return;
		}
		reset(this.button.element, ...this.getLabelContent());
	}

	protected override updateAriaLabel(): void {
		const ariaLabel = this.getAriaLabel();
		if (ariaLabel) {
			this.button?.element.setAttribute('aria-label', ariaLabel);
		} else {
			this.button?.element.removeAttribute('aria-label');
		}
	}

	protected getAriaLabel(): string | undefined {
		return this.getTooltip();
	}

	protected override getTooltip(): string | undefined {
		return this._action.tooltip || this._action.label || undefined;
	}

	private getLabelContent(): Array<HTMLElement | string> {
		const content: Array<HTMLElement | string> = [];

		const iconElement = this.getIconElement();
		if (iconElement) {
			content.push(iconElement);
		}

		const labelText = this.getLabelText();
		if (labelText) {
			content.push($('span.chat-composite-bar-meta-item-label', undefined, labelText));
		}

		return content;
	}

	protected getIconElement(): HTMLElement | undefined {
		const iconClasses = this._action.class?.split(' ').filter(cssClass => !!cssClass);
		if (!iconClasses?.length) {
			return undefined;
		}
		return $(`span.chat-composite-bar-meta-item-icon${iconClasses.map(cssClass => `.${cssClass}`).join('')}`);
	}

	protected getLabelText(): string {
		return this._action.label;
	}

}

/** Aggregate file-change stats displayed by a session metadata pill. */
export interface ISessionDiffStats {
	readonly branch: string | undefined;
	readonly files: number;
	readonly insertions: number;
	readonly deletions: number;
}

/** Renders live session file-change counts using the shared metadata pill. */
export class SessionChangesMetaActionViewItem extends SessionHeaderMetaActionViewItem {

	private readonly diffStats: IObservable<ISessionDiffStats>;
	private filesLabel: HTMLElement | undefined;

	constructor(
		context: unknown,
		action: IAction,
		options: IActionViewItemOptions,
		computeDiffStats: (reader: IReader) => ISessionDiffStats,
		@IInstantiationService private readonly instantiationService: IInstantiationService,
	) {
		super(context, action, options);
		this.diffStats = derivedOpts({ owner: this, equalsFn: structuralEquals }, computeDiffStats);
		this._register(autorun(reader => {
			this.diffStats.read(reader);
			this.updateLabel();
			this.updateTooltip();
			this.updateAriaLabel();
		}));
	}

	override render(container: HTMLElement): void {
		container.classList.add('session-changes-meta-action');
		super.render(container);
	}

	protected override updateLabel(): void {
		if (!this.button) {
			return;
		}

		if (!this.filesLabel) {
			const content: HTMLElement[] = [];
			const iconElement = this.getIconElement();
			if (iconElement) {
				content.push(iconElement);
			}

			this.filesLabel = $('span.chat-composite-bar-meta-item-label');
			content.push(this.filesLabel);
			reset(this.button.element, ...content);

			this._register(this.instantiationService.createInstance(AnimatedCounterWidget, this.button.element, {
				prefix: '+',
				direction: 'topToBottom',
				cssClassName: 'chat-composite-bar-meta-added',
				count: derived(this, reader => this.diffStats.read(reader).insertions),
			}));
			this._register(this.instantiationService.createInstance(AnimatedCounterWidget, this.button.element, {
				prefix: '-',
				direction: 'bottomToTop',
				cssClassName: 'chat-composite-bar-meta-removed',
				count: derived(this, reader => this.diffStats.read(reader).deletions),
			}));
		}

		this.filesLabel.textContent = this.getLabelText();
	}

	protected override getLabelText(): string {
		const { files } = this.diffStats.get();
		return files === 1
			? localize('sessionChanges.file', "{0} file", files)
			: localize('sessionChanges.files', "{0} files", files);
	}

	protected override getTooltip(): string {
		const { branch } = this.diffStats.get();
		return branch
			? localize('sessionChanges.viewAll.tooltip.branch', "View All Changes ({0})", branch)
			: localize('sessionChanges.viewAll.tooltip', "View All Changes");
	}

	protected override getAriaLabel(): string {
		const { files, insertions, deletions } = this.diffStats.get();
		const filesLabel = files === 1
			? localize('sessionChanges.file', "{0} file", files)
			: localize('sessionChanges.files', "{0} files", files);
		return localize('sessionChanges.viewAll.ariaLabel', "{0}: {1}, +{2}, -{3}", this.getTooltip(), filesLabel, insertions, deletions);
	}
}
