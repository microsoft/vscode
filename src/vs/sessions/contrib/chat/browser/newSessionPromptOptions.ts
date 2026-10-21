/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import './media/newSessionPromptOptions.css';
import * as dom from '../../../../base/browser/dom.js';
import * as aria from '../../../../base/browser/ui/aria/aria.js';
import { ActionBar } from '../../../../base/browser/ui/actionbar/actionbar.js';
import { Button, IButtonStyles } from '../../../../base/browser/ui/button/button.js';
import { HoverStyle } from '../../../../base/browser/ui/hover/hover.js';
import { HoverPosition } from '../../../../base/browser/ui/hover/hoverWidget.js';
import { renderIcon } from '../../../../base/browser/ui/iconLabel/iconLabels.js';
import { Action } from '../../../../base/common/actions.js';
import { CancellationToken, CancellationTokenSource } from '../../../../base/common/cancellation.js';
import { Codicon } from '../../../../base/common/codicons.js';
import { MarkdownString } from '../../../../base/common/htmlContent.js';
import { Disposable, DisposableStore, MutableDisposable } from '../../../../base/common/lifecycle.js';
import { ThemeIcon } from '../../../../base/common/themables.js';
import { ICodeEditor } from '../../../../editor/browser/editorBrowser.js';
import { localize } from '../../../../nls.js';
import { IAccessibilityService } from '../../../../platform/accessibility/common/accessibility.js';
import { IHoverService } from '../../../../platform/hover/browser/hover.js';
import { IInstantiationService } from '../../../../platform/instantiation/common/instantiation.js';
import { asCssVariable } from '../../../../platform/theme/common/colorUtils.js';
import { ChatInputStackSlot, setChatInputStackSlot } from '../../../../workbench/contrib/chat/browser/widget/input/chatInputStack.js';
import { INewSessionPromptOption, INewSessionPromptOptionsController, NEW_SESSION_PROMPT_TYPING_DURATION_MS, NewSessionPromptOptionsState } from './newSessionComposerService.js';
import { PromptTemplatePlaceholderController } from './promptTemplatePlaceholder.js';
import { animatePromptTyping, IPromptTypingAnimation } from './promptTypingAnimation.js';

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

interface INewSessionPromptOptionsWidgetOptions {
	readonly selectOption: (option: INewSessionPromptOption, expectedInput: string, animate: boolean) => Promise<boolean>;
	readonly onDidSelectOption: (option: INewSessionPromptOption) => void;
	readonly onDidClose: () => void;
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
		private readonly _container: HTMLElement,
		private readonly _options: INewSessionPromptOptionsWidgetOptions,
		@IHoverService private readonly _hoverService: IHoverService,
	) {
		super();

		const title = localize('newSessionPromptOptions.title', "Send your first prompt");
		this.element = dom.append(this._container, dom.$('.new-session-prompt-options'));
		this.element.role = 'group';
		this.element.ariaLabel = title;
		const header = dom.append(this.element, dom.$('.new-session-prompt-options-header'));
		dom.append(header, dom.$('h2.new-session-prompt-options-title')).textContent = title;
		const actionBar = this._register(new ActionBar(header));
		actionBar.getContainer().classList.add('new-session-prompt-options-actions');
		const closeAction = this._register(new Action(
			'newSessionPromptOptions.close',
			localize('newSessionPromptOptions.close', "Close"),
			ThemeIcon.asClassName(Codicon.close),
			true,
			() => this._options.onDidClose(),
		));
		actionBar.push(closeAction, { icon: true, label: false });
		this._optionsContainer = dom.append(this.element, dom.$('.new-session-prompt-options-list'));
		this._setVisible(false);
	}

	/**
	 * Show or hide the options, and report to the stack. Standalone, so a tip
	 * above joins the options rather than the input.
	 */
	private _setVisible(visible: boolean): void {
		dom.setVisibility(visible, this.element);
		setChatInputStackSlot(this.element, visible ? ChatInputStackSlot.Standalone : ChatInputStackSlot.Empty);
	}

	setState(state: NewSessionPromptOptionsState | undefined): void {
		this._renderDisposables.clear();
		this._buttons = [];
		this._selectedOptionId = undefined;
		this._selecting = false;
		dom.clearNode(this._optionsContainer);

		if (!state) {
			this.element.removeAttribute('aria-busy');
			this._setVisible(false);
			return;
		}

		this._setVisible(true);
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
		if (value.length === 0) {
			this._selectedOptionId = undefined;
		}
		this._updateButtons();
	}

	/** Whether focus is inside the rendered options, where re-rendering would move focus to the body. */
	hasFocusedOption(): boolean {
		return dom.isAncestorOfActiveElement(this._optionsContainer);
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
			button.element.classList.toggle('has-title-detail', !!option.titleDetail);
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
				const actionIcon = dom.append(title, renderIcon(Codicon.arrowRight));
				actionIcon.classList.add('new-session-prompt-option-action-icon');
				actionIcon.ariaHidden = 'true';
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
			if (!await this._options.selectOption(option, expectedInput, animate)) {
				this._selectedOptionId = previousSelectedOptionId;
			} else {
				this._options.onDidSelectOption(option);
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

/**
 * Prompt options above a new-session composer's input: shows the options,
 * inserts the picked prompt into the input editor (typed out, with its editable
 * placeholder), and refreshes them through the host's controller. Shared by the
 * composer inputs so they present prompt options identically.
 */
export class NewSessionPromptOptionsPresenter extends Disposable {

	private _editor: ICodeEditor | undefined;
	private readonly _promptTemplatePlaceholder = this._register(new MutableDisposable<PromptTemplatePlaceholderController>());
	private readonly _promptOptionsWidget = this._register(new MutableDisposable<NewSessionPromptOptionsWidget>());
	private readonly _promptOptionsRefresh = this._register(new MutableDisposable<CancellationTokenSource>());
	private readonly _promptTypingAnimation = this._register(new MutableDisposable<IPromptTypingAnimation>());
	private _promptOptionsState: NewSessionPromptOptionsState | undefined;
	private _promptOptionsController: INewSessionPromptOptionsController | undefined;
	private _promptOptionsDismissed = false;
	private _promptOptionsSelected = false;

	constructor(
		private readonly _focusInput: () => void,
		@IInstantiationService private readonly _instantiationService: IInstantiationService,
		@IAccessibilityService private readonly _accessibilityService: IAccessibilityService,
	) {
		super();
	}

	/**
	 * Binds the input editor and renders the options into `container`, before
	 * `insertBefore` when given. State set before this is shown once attached.
	 */
	attach(editor: ICodeEditor, container: HTMLElement, insertBefore?: HTMLElement): void {
		this._editor = editor;
		this._promptTemplatePlaceholder.value = new PromptTemplatePlaceholderController(editor, () => this._promptTypingAnimation.value?.complete());
		const widget = this._promptOptionsWidget.value = this._instantiationService.createInstance(NewSessionPromptOptionsWidget, container, {
			selectOption: async (option, expectedInput, animate) => {
				// Mark the selection as it begins: the widget only reports it once the prompt
				// animation completes, and a streamed update in between would clear it.
				this._promptOptionsSelected = true;
				this._focusInput();
				const inserted = animate
					? await this.animatePrompt(option.prompt, NEW_SESSION_PROMPT_TYPING_DURATION_MS, option.placeholder, CancellationToken.None, expectedInput)
					: this._replacePrompt(option.prompt, option.placeholder, expectedInput);
				const generatedValue = option.placeholder ? option.prompt.replace(option.placeholder, '') : option.prompt;
				if (inserted && (editor.getValue() === option.prompt || editor.getValue() === generatedValue)) {
					aria.status(localize('newSessionPromptOptions.inserted', "Inserted prompt: {0}", option.title));
				}
				return inserted;
			},
			onDidSelectOption: option => this._promptOptionsController?.onDidSelectOption(option),
			onDidClose: () => this._dismissPromptOptions(),
		});
		insertBefore?.before(widget.element);
		widget.setState(this._promptOptionsState);
		widget.setInputValue(editor.getValue());
		this._register(editor.onDidChangeModelContent(() => this._promptOptionsWidget.value?.setInputValue(editor.getValue())));
	}

	/** Replaces the editable placeholder at the cursor, returning whether one was there. */
	replacePlaceholderAtCursor(): boolean {
		return this._promptTemplatePlaceholder.value?.replaceAtCursor() ?? false;
	}

	async animatePrompt(text: string, durationMs: number, placeholder: string, token: CancellationToken, expectedValue = ''): Promise<boolean> {
		const editor = this._editor;
		const model = editor?.getModel();
		if (!editor || !model || !text || model.getValue() !== expectedValue || token.isCancellationRequested) {
			return false;
		}

		this._promptTypingAnimation.clear();
		if (expectedValue) {
			model.setValue('');
		}
		this._promptTemplatePlaceholder.value?.setPlaceholder(placeholder);
		const targetWindow = dom.getWindow(editor.getDomNode());
		const effectiveDuration = this._accessibilityService.isMotionReduced() || this._accessibilityService.isScreenReaderOptimized() ? 0 : durationMs;
		const animation = animatePromptTyping({
			getValue: () => model.getValue(),
			setValue: value => {
				model.setValue(value);
				const lastLine = model.getLineCount();
				editor.setPosition({ lineNumber: lastLine, column: model.getLineMaxColumn(lastLine) });
			},
			onDidChange: listener => model.onDidChangeContent(() => listener()),
		}, text, effectiveDuration, {
			now: () => targetWindow.performance.now(),
			schedule: callback => dom.scheduleAtNextAnimationFrame(targetWindow, callback),
		});
		this._promptTypingAnimation.value = animation;
		const cancellationListener = token.onCancellationRequested(() => {
			if (this._promptTypingAnimation.value === animation) {
				this._promptTypingAnimation.clear();
			} else {
				animation.dispose();
			}
		});
		try {
			return (await animation.result).didWrite;
		} finally {
			cancellationListener.dispose();
			if (this._promptTypingAnimation.value === animation) {
				this._promptTypingAnimation.clear();
			}
		}
	}

	private _replacePrompt(text: string, placeholder: string, expectedValue: string): boolean {
		const editor = this._editor;
		const model = editor?.getModel();
		if (!editor || !model || model.getValue() !== expectedValue) {
			return false;
		}
		this._promptTypingAnimation.clear();
		this._promptTemplatePlaceholder.value?.setPlaceholder(placeholder);
		editor.pushUndoStop();
		const edited = editor.executeEdits('sessions.promptOption', [{ range: model.getFullModelRange(), text }]);
		if (!edited) {
			return false;
		}
		editor.pushUndoStop();
		const lastLine = model.getLineCount();
		editor.setPosition({ lineNumber: lastLine, column: model.getLineMaxColumn(lastLine) });
		return true;
	}

	showPromptOptions(state: NewSessionPromptOptionsState | undefined): boolean {
		if (state && this._promptOptionsDismissed) {
			return false;
		}
		this._promptOptionsState = state;
		const widget = this._promptOptionsWidget.value;
		if (!widget) {
			return false;
		}
		widget.setState(state);
		widget.setInputValue(this._editor?.getValue() ?? '');
		return true;
	}

	setPromptOptionsController(controller: INewSessionPromptOptionsController): void {
		this._cancelPromptOptionsRefresh(false);
		this._promptOptionsController = controller;
		this._promptOptionsDismissed = false;
		this._promptOptionsSelected = false;
	}

	preparePromptOptionsRefresh(): boolean {
		if (!this._promptOptionsController || this._promptOptionsDismissed) {
			return false;
		}
		this._cancelPromptOptionsRefresh();
		this._promptOptionsSelected = false;
		this.showPromptOptions({ kind: 'loading' });
		return true;
	}

	clearPromptOptions(): void {
		this._cancelPromptOptionsRefresh();
		this.showPromptOptions(undefined);
	}

	private _dismissPromptOptions(): void {
		if (this._promptOptionsDismissed) {
			return;
		}
		const controller = this._promptOptionsController;
		this._promptOptionsDismissed = true;
		this._cancelPromptOptionsRefresh(false);
		this.showPromptOptions(undefined);
		this._focusInput();
		aria.status(localize('newSessionPromptOptions.closed', "Prompt options closed"));
		controller?.onDidClose();
	}

	private _cancelPromptOptionsRefresh(clearGeneratedInput = true): void {
		const shouldClearInput = this._promptOptionsWidget.value?.shouldClearInputForRefresh() ?? false;
		this._promptTypingAnimation.clear();
		this._promptOptionsRefresh.value?.cancel();
		this._promptOptionsRefresh.clear();
		if (clearGeneratedInput && shouldClearInput) {
			this._promptTemplatePlaceholder.value?.setPlaceholder(undefined);
			this._editor?.getModel()?.setValue('');
		}
	}

	async refreshPromptOptions(token: CancellationToken = CancellationToken.None): Promise<boolean> {
		const controller = this._promptOptionsController;
		if (!controller || !this.preparePromptOptionsRefresh()) {
			return false;
		}
		const cts = new CancellationTokenSource(token);
		this._promptOptionsRefresh.value = cts;
		// Options resolved after a first paint must not replace ones the user is already working with:
		// re-rendering clears the selection and moves focus out of the options.
		const canRerender = () => !this._promptOptionsSelected && !this._promptOptionsWidget.value?.hasFocusedOption();
		let state: NewSessionPromptOptionsState;
		try {
			state = await controller.resolve(cts.token, progressState => {
				if (this._promptOptionsRefresh.value !== cts || cts.token.isCancellationRequested || !canRerender()) {
					return false;
				}
				return this.showPromptOptions(progressState);
			});
		} catch (error) {
			if (this._promptOptionsRefresh.value === cts) {
				this._promptOptionsRefresh.clear();
				if (cts.token.isCancellationRequested) {
					this.showPromptOptions(undefined);
					return false;
				}
			}
			throw error;
		}
		if (this._promptOptionsRefresh.value !== cts) {
			return false;
		}
		if (cts.token.isCancellationRequested) {
			this._promptOptionsRefresh.clear();
			this.showPromptOptions(undefined);
			return false;
		}
		this._promptOptionsRefresh.clear();
		if (!canRerender()) {
			return true;
		}
		return this.showPromptOptions(state);
	}

	override dispose(): void {
		this._cancelPromptOptionsRefresh();
		super.dispose();
	}
}
