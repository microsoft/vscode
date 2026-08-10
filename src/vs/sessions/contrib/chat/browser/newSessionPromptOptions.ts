/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import './media/newSessionPromptOptions.css';
import * as dom from '../../../../base/browser/dom.js';
import { Button, IButtonStyles } from '../../../../base/browser/ui/button/button.js';
import { HoverStyle } from '../../../../base/browser/ui/hover/hover.js';
import { HoverPosition } from '../../../../base/browser/ui/hover/hoverWidget.js';
import { renderIcon } from '../../../../base/browser/ui/iconLabel/iconLabels.js';
import { MarkdownString } from '../../../../base/common/htmlContent.js';
import { Disposable, DisposableStore, MutableDisposable } from '../../../../base/common/lifecycle.js';
import { localize } from '../../../../nls.js';
import { IHoverService } from '../../../../platform/hover/browser/hover.js';
import { asCssVariable } from '../../../../platform/theme/common/colorUtils.js';
import { INewSessionPromptOption, NewSessionPromptOptionsState } from './newSessionComposerService.js';

const promptOptionButtonStyles: IButtonStyles = {
	buttonBackground: undefined,
	buttonHoverBackground: undefined,
	buttonForeground: undefined,
	buttonSeparator: undefined,
	buttonSecondaryBackground: undefined,
	buttonSecondaryHoverBackground: undefined,
	buttonSecondaryForeground: undefined,
	buttonSecondaryBorder: undefined,
	buttonBorder: undefined,
};

interface IPromptOptionButton {
	readonly option: INewSessionPromptOption;
	readonly button: Button;
}

export class NewSessionPromptOptionsWidget extends Disposable {
	readonly element: HTMLElement;

	private readonly _optionsContainer: HTMLElement;
	private readonly _renderDisposables = this._register(new MutableDisposable<DisposableStore>());
	private _buttons: readonly IPromptOptionButton[] = [];
	private _inputValue = '';
	private _selectedOptionId: string | undefined;
	private _selecting = false;

	constructor(
		container: HTMLElement,
		private readonly _selectOption: (option: INewSessionPromptOption, expectedInput: string, animate: boolean) => Promise<boolean>,
		@IHoverService private readonly _hoverService: IHoverService,
	) {
		super();

		const title = localize('newSessionPromptOptions.title', "Send your first prompt");
		this.element = dom.append(container, dom.$('.new-session-prompt-options'));
		this.element.role = 'group';
		this.element.ariaLabel = title;
		dom.append(this.element, dom.$('h2.new-session-prompt-options-title')).textContent = title;
		this._optionsContainer = dom.append(this.element, dom.$('.new-session-prompt-options-list'));
		dom.setVisibility(false, this.element);
	}

	setState(state: NewSessionPromptOptionsState | undefined): void {
		this._renderDisposables.clear();
		this._buttons = [];
		this._selectedOptionId = undefined;
		this._selecting = false;
		dom.clearNode(this._optionsContainer);

		if (!state) {
			this.element.removeAttribute('aria-busy');
			dom.setVisibility(false, this.element);
			return;
		}

		dom.setVisibility(true, this.element);
		if (state.kind === 'loading') {
			this.element.setAttribute('aria-busy', 'true');
			this._renderLoading();
			return;
		}

		this.element.setAttribute('aria-busy', 'false');
		this._renderOptions(state.options);
	}

	setInputValue(value: string): void {
		this._inputValue = value;
		this._updateButtons();
	}

	shouldClearInputForRefresh(): boolean {
		const selectedOption = this._buttons.find(candidate => candidate.option.id === this._selectedOptionId)?.option;
		return this._selecting || this._inputValue.length === 0 || matchesGeneratedPrompt(selectedOption, this._inputValue);
	}

	private _renderLoading(): void {
		const store = new DisposableStore();
		this._renderDisposables.value = store;
		for (let index = 0; index < 3; index++) {
			const skeleton = dom.append(this._optionsContainer, dom.$('.new-session-prompt-option.new-session-prompt-option-skeleton'));
			skeleton.ariaHidden = 'true';
			dom.append(skeleton, dom.$('.new-session-prompt-option-skeleton-icon'));
			dom.append(skeleton, dom.$('.new-session-prompt-option-skeleton-line.title'));
			dom.append(skeleton, dom.$('.new-session-prompt-option-skeleton-line.description'));
		}
	}

	private _renderOptions(options: readonly INewSessionPromptOption[]): void {
		const store = new DisposableStore();
		this._renderDisposables.value = store;
		const buttons: IPromptOptionButton[] = [];
		for (const option of options) {
			const fullTitle = getFullTitle(option);
			const ariaLabel = localize('newSessionPromptOptions.optionAriaLabel', "{0}: {1}", fullTitle, option.description);
			const button = store.add(new Button(this._optionsContainer, {
				...promptOptionButtonStyles,
				ariaLabel,
			}));
			const hoverContent = new MarkdownString()
				.appendMarkdown('**')
				.appendText(fullTitle)
				.appendMarkdown('**\n\n')
				.appendText(option.description);
			store.add(this._hoverService.setupDelayedHover(button.element, {
				content: hoverContent,
				style: HoverStyle.Pointer,
				position: { hoverPosition: HoverPosition.BELOW },
			}));
			button.element.classList.add('new-session-prompt-option');
			button.checked = false;
			if (option.icon) {
				const icon = dom.append(button.element, renderIcon(option.icon));
				icon.classList.add('new-session-prompt-option-icon');
				icon.ariaHidden = 'true';
				if (option.icon.color) {
					icon.style.color = asCssVariable(option.icon.color.id);
				}
			} else {
				button.element.classList.add('no-icon');
			}
			const title = dom.append(button.element, dom.$('.new-session-prompt-option-title'));
			dom.append(title, dom.$('.new-session-prompt-option-title-label')).textContent = option.title;
			if (option.titleDetail) {
				dom.append(title, dom.$('.new-session-prompt-option-title-detail')).textContent = option.titleDetail;
			}
			dom.append(button.element, dom.$('.new-session-prompt-option-description')).textContent = option.description;
			store.add(button.onDidClick(() => {
				void this._select(option);
			}));
			buttons.push({ option, button });
		}
		this._buttons = buttons;
		this._updateButtons();
	}

	private async _select(option: INewSessionPromptOption): Promise<void> {
		const selectedOption = this._buttons.find(candidate => candidate.option.id === this._selectedOptionId)?.option;
		const canSelect = !this._selecting && (this._inputValue.length === 0 || matchesGeneratedPrompt(selectedOption, this._inputValue));
		if (!canSelect || (selectedOption?.id === option.id && matchesGeneratedPrompt(option, this._inputValue))) {
			return;
		}

		const previousSelectedOptionId = this._selectedOptionId;
		const expectedInput = this._inputValue;
		const animate = previousSelectedOptionId === undefined;
		this._selectedOptionId = option.id;
		this._selecting = true;
		this._updateButtons();
		try {
			if (!await this._selectOption(option, expectedInput, animate)) {
				this._selectedOptionId = previousSelectedOptionId;
			}
		} finally {
			this._selecting = false;
			this._updateButtons();
		}
	}

	private _updateButtons(): void {
		const selectedOption = this._buttons.find(candidate => candidate.option.id === this._selectedOptionId)?.option;
		const enabled = !this._selecting && (this._inputValue.length === 0 || matchesGeneratedPrompt(selectedOption, this._inputValue));
		for (const { option, button } of this._buttons) {
			button.checked = option.id === this._selectedOptionId;
			button.element.classList.toggle('option-disabled', !enabled);
			button.element.setAttribute('aria-disabled', String(!enabled));
			button.element.tabIndex = 0;
		}
	}
}

function matchesGeneratedPrompt(option: INewSessionPromptOption | undefined, value: string): boolean {
	if (!option) {
		return false;
	}
	if (value === option.prompt) {
		return true;
	}
	return !!option.placeholder && option.prompt.includes(option.placeholder) && value === option.prompt.replace(option.placeholder, '');
}

function getFullTitle(option: INewSessionPromptOption): string {
	return option.titleDetail ? `${option.title} ${option.titleDetail}` : option.title;
}
