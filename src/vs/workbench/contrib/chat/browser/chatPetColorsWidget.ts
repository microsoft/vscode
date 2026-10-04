/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import './media/chatPetAchievements.css';
import * as DOM from '../../../../base/browser/dom.js';
import { StandardKeyboardEvent } from '../../../../base/browser/keyboardEvent.js';
import { Button } from '../../../../base/browser/ui/button/button.js';
import { InputBox, MessageType } from '../../../../base/browser/ui/inputbox/inputBox.js';
import { DomScrollableElement } from '../../../../base/browser/ui/scrollbar/scrollableElement.js';
import { KeyCode } from '../../../../base/common/keyCodes.js';
import { Disposable, IDisposable, MutableDisposable } from '../../../../base/common/lifecycle.js';
import { autorun } from '../../../../base/common/observable.js';
import { ScrollbarVisibility } from '../../../../base/common/scrollable.js';
import { generateUuid } from '../../../../base/common/uuid.js';
import { localize } from '../../../../nls.js';
import { ILogService } from '../../../../platform/log/common/log.js';
import { defaultButtonStyles, defaultInputBoxStyles } from '../../../../platform/theme/browser/defaultStyles.js';
import { IThemeService } from '../../../../platform/theme/common/themeService.js';
import { CHAT_PET_ACHIEVEMENT_PREVIEW_SIZE, renderChatPetAchievementPreview } from './chatPetAchievementPreview.js';
import { ChatPetAchievementIds } from './chatPetAchievements.js';
import { ChatPetColor, chatPetColorPresets, getChatPetBodyColor, isDefaultChatPetColor, parseChatPetColor } from './chatPetColors.js';
import { IChatPetService } from './chatPetService.js';

export class ChatPetColorsWidget extends Disposable {

	private readonly container: HTMLElement;
	private readonly content: HTMLElement;
	private readonly scrollable: DomScrollableElement;
	private readonly cards = new Map<ChatPetColor, { readonly button: Button; readonly state: HTMLElement; readonly label: string }>();
	private readonly hexInput: InputBox;
	private readonly colorInput: HTMLInputElement;
	private readonly applyButton: Button;
	private readonly validationMessage: HTMLElement;
	private readonly customPreview: HTMLCanvasElement;
	private readonly previewDisposable = this._register(new MutableDisposable<IDisposable>());
	private customizationUnlocked = false;
	private selectedColor: ChatPetColor | undefined;
	private previewColor: ChatPetColor | undefined;

	constructor(
		parent: HTMLElement,
		onDidRequestClose: () => void,
		@IChatPetService private readonly chatPetService: IChatPetService,
		@IThemeService private readonly themeService: IThemeService,
		@ILogService private readonly logService: ILogService,
	) {
		super();
		this.container = DOM.append(parent, DOM.$('.chat-pet-colors-widget'));
		this.content = DOM.$('.chat-pet-achievements-content');
		this.scrollable = this._register(new DomScrollableElement(this.content, {
			horizontal: ScrollbarVisibility.Hidden,
			vertical: ScrollbarVisibility.Auto,
		}));
		this.container.appendChild(this.scrollable.getDomNode());
		this._register(DOM.addDisposableListener(this.content, DOM.EventType.SCROLL, () => {
			this.scrollable.setScrollPosition({ scrollTop: this.content.scrollTop });
		}, { passive: true }));
		this._register(DOM.addDisposableListener(this.container, DOM.EventType.KEY_DOWN, e => {
			if (new StandardKeyboardEvent(e).equals(KeyCode.Escape)) {
				DOM.EventHelper.stop(e, true);
				onDidRequestClose();
			}
		}));

		const inner = DOM.append(this.content, DOM.$('.chat-pet-achievements-inner'));
		DOM.append(inner, DOM.$('h1')).textContent = localize('chatPet.colors.title', "Color");
		DOM.append(inner, DOM.$('p.chat-pet-achievements-intro')).textContent = localize('chatPet.colors.intro', "A little more you. Pick a classic look or give Blobby a color of its own.");
		const list = DOM.append(inner, DOM.$('ul.chat-pet-colors-list', {
			'aria-label': localize('chatPet.colors.presets', "Blobby color presets"),
		}));
		for (const preset of chatPetColorPresets) {
			const item = DOM.append(list, DOM.$('li'));
			const button = this._register(new Button(item, { secondary: true }));
			button.element.classList.add('chat-pet-color-card');
			button.element.dataset.color = preset.color;
			const preview = DOM.append(button.element, DOM.$<HTMLCanvasElement>('canvas.chat-pet-color-preview'));
			preview.width = CHAT_PET_ACHIEVEMENT_PREVIEW_SIZE;
			preview.height = CHAT_PET_ACHIEVEMENT_PREVIEW_SIZE;
			preview.setAttribute('aria-hidden', 'true');
			this._register(renderChatPetAchievementPreview(preview, undefined, true, preset.color, themeService, logService));
			DOM.append(button.element, DOM.$('span.chat-pet-color-label')).textContent = preset.label;
			const state = DOM.append(button.element, DOM.$('span.chat-pet-color-state'));
			this.cards.set(preset.color, { button, state, label: preset.label });
			this._register(button.onDidClick(() => this.selectColor(preset.color)));
			this._register(button.onDidEscape(onDidRequestClose));
		}

		const unlockHint = DOM.append(inner, DOM.$('p.chat-pet-colors-unlock-hint'));
		unlockHint.textContent = localize('chatPet.colors.unlockHint', "Discover Blobby's True Name to unlock solid colors and custom colors.");
		const custom = DOM.append(inner, DOM.$('section.chat-pet-custom-color'));
		DOM.append(custom, DOM.$('h2')).textContent = localize('chatPet.colors.custom', "Custom color");
		DOM.append(custom, DOM.$('p')).textContent = localize('chatPet.colors.customDescription', "Choose any color or enter a hex value. Apply it when it feels right.");
		const customBody = DOM.append(custom, DOM.$('.chat-pet-custom-color-body'));
		this.customPreview = DOM.append(customBody, DOM.$<HTMLCanvasElement>('canvas.chat-pet-color-preview.custom-preview'));
		this.customPreview.width = CHAT_PET_ACHIEVEMENT_PREVIEW_SIZE;
		this.customPreview.height = CHAT_PET_ACHIEVEMENT_PREVIEW_SIZE;
		this.customPreview.setAttribute('aria-hidden', 'true');
		const controls = DOM.append(customBody, DOM.$('.chat-pet-custom-color-controls'));
		const row = DOM.append(controls, DOM.$('.chat-pet-custom-color-inputs'));
		this.colorInput = DOM.append(row, DOM.$<HTMLInputElement>('input.chat-pet-color-picker', {
			type: 'color',
			'aria-label': localize('chatPet.colors.chooseCustom', "Choose Blobby's custom color"),
		}));
		this.hexInput = this._register(new InputBox(row, undefined, {
			inputBoxStyles: defaultInputBoxStyles,
			ariaLabel: localize('chatPet.colors.hex', "Custom hex color"),
			placeholder: '#ff8800',
			validationOptions: {
				validation: value => {
					const color = parseChatPetColor(value);
					return color && !isDefaultChatPetColor(color) ? null : {
						type: MessageType.ERROR,
						content: localize('chatPet.color.invalid', "Enter a hex color such as #ff8800 or #f80."),
					};
				},
			},
		}));
		this.applyButton = this._register(new Button(row, defaultButtonStyles));
		this.applyButton.label = localize('chatPet.colors.apply', "Apply Color");
		this._register(this.applyButton.onDidEscape(onDidRequestClose));
		this.validationMessage = DOM.append(controls, DOM.$('.chat-pet-color-validation', { role: 'status', id: generateUuid() }));
		this.hexInput.inputElement.setAttribute('aria-describedby', this.validationMessage.id);

		this._register(DOM.addDisposableListener(this.colorInput, DOM.EventType.INPUT, () => {
			this.hexInput.value = this.colorInput.value;
		}));
		this._register(this.hexInput.onDidChange(() => this.updateDraft()));
		this._register(this.applyButton.onDidClick(() => this.applyCustomColor()));
		this._register(DOM.addDisposableListener(this.hexInput.inputElement, DOM.EventType.KEY_DOWN, e => {
			if (new StandardKeyboardEvent(e).equals(KeyCode.Enter) && this.applyButton.enabled) {
				DOM.EventHelper.stop(e, true);
				this.applyCustomColor();
			}
		}));
		this._register(autorun(reader => {
			const wasUnlocked = this.customizationUnlocked;
			this.customizationUnlocked = chatPetService.unlockedAchievements.read(reader).includes(ChatPetAchievementIds.Blobby);
			const selectedColor = chatPetService.color.read(reader);
			for (const [color, card] of this.cards) {
				const enabled = isDefaultChatPetColor(color) || this.customizationUnlocked;
				const selected = color === selectedColor;
				card.button.enabled = enabled;
				card.button.element.classList.toggle('selected', selected);
				card.button.element.setAttribute('aria-pressed', String(selected));
				card.state.textContent = selected
					? localize('chatPet.colors.selected', "Selected")
					: enabled ? '\u00a0' : localize('chatPet.colors.locked', "Locked");
				card.button.setAriaLabel(selected
					? localize('chatPet.colors.selectedLabel', "{0}, selected", card.label)
					: enabled ? card.label : localize('chatPet.colors.lockedLabel', "{0}, locked. Discover Blobby's True Name to unlock.", card.label));
			}
			unlockHint.hidden = this.customizationUnlocked;
			this.colorInput.disabled = !this.customizationUnlocked;
			this.hexInput.setEnabled(this.customizationUnlocked);
			if (this.selectedColor !== selectedColor || wasUnlocked !== this.customizationUnlocked) {
				this.selectedColor = selectedColor;
				this.hexInput.value = getChatPetBodyColor(selectedColor);
			}
			this.updateDraft();
		}));
	}

	private updateDraft(): void {
		const color = parseChatPetColor(this.hexInput.value);
		const validColor = color && !isDefaultChatPetColor(color) ? color : undefined;
		const selectedColor = this.chatPetService.color.get();
		const draftColor = validColor === getChatPetBodyColor(selectedColor) ? selectedColor : validColor;
		this.validationMessage.textContent = validColor ? '' : localize('chatPet.color.invalid', "Enter a hex color such as #ff8800 or #f80.");
		this.applyButton.enabled = this.customizationUnlocked && draftColor !== undefined && draftColor !== selectedColor;
		if (validColor) {
			this.colorInput.value = validColor;
		}
		if (draftColor && draftColor !== this.previewColor) {
			this.previewColor = draftColor;
			this.previewDisposable.value = renderChatPetAchievementPreview(this.customPreview, undefined, true, draftColor, this.themeService, this.logService);
		}
		this.scrollable.scanDomNode();
	}

	private applyCustomColor(): void {
		this.updateDraft();
		const color = parseChatPetColor(this.hexInput.value);
		if (!color || isDefaultChatPetColor(color)) {
			this.hexInput.focus();
			return;
		}
		if (this.applyButton.enabled) {
			this.selectColor(color);
		}
	}

	private selectColor(color: ChatPetColor): void {
		this.chatPetService.setColor(color);
		if (!isDefaultChatPetColor(color)) {
			this.chatPetService.markAchievementSeen(ChatPetAchievementIds.Blobby);
		}
	}

	layout(dimension: DOM.Dimension): void {
		this.container.classList.toggle('narrow', dimension.width < 560);
		this.content.style.width = `${dimension.width}px`;
		this.content.style.height = `${dimension.height}px`;
		this.scrollable.getDomNode().style.height = `${dimension.height}px`;
		this.scrollable.scanDomNode();
	}

	focus(): void {
		(this.cards.get(this.chatPetService.color.get())?.button ?? this.cards.get('stable')?.button)?.focus();
	}
}
