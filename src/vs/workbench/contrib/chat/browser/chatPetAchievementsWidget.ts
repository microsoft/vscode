/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import './media/chatPetAchievements.css';
import * as DOM from '../../../../base/browser/dom.js';
import { status } from '../../../../base/browser/ui/aria/aria.js';
import { Button } from '../../../../base/browser/ui/button/button.js';
import { DomScrollableElement } from '../../../../base/browser/ui/scrollbar/scrollableElement.js';
import { Disposable, DisposableStore } from '../../../../base/common/lifecycle.js';
import { autorun, derived, IReader, ISettableObservable, observableSignalFromEvent } from '../../../../base/common/observable.js';
import { ScrollbarVisibility } from '../../../../base/common/scrollable.js';
import { localize } from '../../../../nls.js';
import { ICommandService } from '../../../../platform/commands/common/commands.js';
import { ILogService } from '../../../../platform/log/common/log.js';
import { IThemeService } from '../../../../platform/theme/common/themeService.js';
import { renderChatPetAchievementPreview, CHAT_PET_ACHIEVEMENT_PREVIEW_SIZE } from './chatPetAchievementPreview.js';
import { chatPetAchievements, ChatPetAccessoryId, ChatPetAchievementId, getChatPetAccessory, getChatPetAchievementPresentation } from './chatPetAchievements.js';
import { ChatPetAppearanceSelection, getChatPetAppearanceSelection, getChatPetAppearanceSelectionPressedState, getChatPetTargetAccessory, getChatPetTargetColor, renderChatPetAppearanceTargetPicker } from './chatPetAppearanceTarget.js';
import { ChatPetAppearanceTarget, getChatPetAppearanceTargetWindows, IChatPetService } from './chatPetService.js';
import { CHAT_PET_CHANGE_COLOR_COMMAND_ID, ChatPetColor } from './chatPetColors.js';

const NO_HAT_CARD_ID = 'none';

export class ChatPetAchievementsWidget extends Disposable {

	private readonly container: HTMLElement;
	private readonly content: HTMLElement;
	private readonly collectionContainer: HTMLElement;
	private readonly scrollable: DomScrollableElement;
	private readonly renderDisposables = this._register(new DisposableStore());
	private readonly accessoryCards = new Map<string, {
		readonly button: Button;
		readonly state: HTMLElement;
		readonly defaultState: string;
		readonly getAriaLabel: (selection: ChatPetAppearanceSelection, state: string) => string;
		readonly achievementId?: ChatPetAchievementId;
		readonly newBadge?: HTMLElement;
		readonly colorCustomization?: boolean;
	}>();
	private unseenAchievementIds = new Set<ChatPetAchievementId>();
	private focusTarget: (() => void) | undefined;
	private lastDimension: DOM.Dimension | undefined;

	constructor(
		parent: HTMLElement,
		private readonly onDidRequestClose: () => void,
		private readonly appearanceTarget: ISettableObservable<ChatPetAppearanceTarget>,
		@IChatPetService private readonly chatPetService: IChatPetService,
		@IThemeService private readonly themeService: IThemeService,
		@ILogService private readonly logService: ILogService,
		@ICommandService private readonly commandService: ICommandService,
	) {
		super();

		this.container = DOM.append(parent, DOM.$('.chat-pet-achievements-widget'));
		this.content = DOM.$('.chat-pet-achievements-content');
		this.scrollable = this._register(new DomScrollableElement(this.content, {
			horizontal: ScrollbarVisibility.Hidden,
			vertical: ScrollbarVisibility.Auto,
		}));
		this.container.appendChild(this.scrollable.getDomNode());
		this._register(DOM.addDisposableListener(this.content, DOM.EventType.SCROLL, () => {
			const scrollTop = this.content.scrollTop;
			if (scrollTop !== this.scrollable.getScrollPosition().scrollTop) {
				this.scrollable.setScrollPosition({ scrollTop });
			}
		}, { passive: true }));

		// The header persists across renders, so changing the target keeps focus on the picker.
		const inner = DOM.append(this.content, DOM.$('.chat-pet-achievements-inner'));
		DOM.append(inner, DOM.$('h1')).textContent = localize('chatPet.achievements.title', "Achievements");
		DOM.append(inner, DOM.$('p.chat-pet-achievements-intro')).textContent = localize('chatPet.achievements.intro', "Unlock hats and colors as you explore agent features, then customize Blobby by selecting an unlocked card.");
		this._register(renderChatPetAppearanceTargetPicker(inner, appearanceTarget, onDidRequestClose));
		this.collectionContainer = DOM.append(inner, DOM.$('.chat-pet-achievements-collection-container'));

		const themeChanged = observableSignalFromEvent(this, this.themeService.onDidColorThemeChange);
		const previewColor = derived(this, reader => getChatPetTargetColor(this.chatPetService, this.appearanceTarget.read(reader)).read(reader));
		this._register(autorun(reader => {
			const unlockedAchievements = this.chatPetService.unlockedAchievements.read(reader);
			const color = previewColor.read(reader);
			themeChanged.read(reader);
			this.render(unlockedAchievements, color);
		}));
		this._register(autorun(reader => {
			this.updateSelectedAccessories(reader);
		}));
		this._register(autorun(reader => {
			this.updateNewAchievements(this.chatPetService.unseenAchievements.read(reader));
		}));
	}

	layout(dimension?: DOM.Dimension): void {
		if (dimension) {
			this.lastDimension = dimension;
			this.container.style.width = `${dimension.width}px`;
			this.container.style.height = `${dimension.height}px`;
		}
		const width = dimension?.width ?? this.container.clientWidth;
		const height = dimension?.height ?? this.container.clientHeight;
		this.container.classList.toggle('narrow', width < 560);
		this.content.style.width = `${width}px`;
		this.content.style.height = `${height}px`;
		const scrollableNode = this.scrollable.getDomNode();
		scrollableNode.style.width = `${width}px`;
		scrollableNode.style.height = `${height}px`;
		this.scrollable.scanDomNode();
	}

	focus(): void {
		this.focusTarget?.();
	}

	private render(unlockedAchievements: readonly ChatPetAchievementId[], color: ChatPetColor): void {
		const activeElement = DOM.getActiveElement();
		const focusedCard = DOM.isHTMLElement(activeElement) ? activeElement.closest<HTMLElement>('.chat-pet-achievement-card') : undefined;
		const restoreFocusId = focusedCard?.dataset.accessoryId ?? focusedCard?.dataset.achievementId;
		this.renderDisposables.clear();
		DOM.clearNode(this.collectionContainer);
		this.accessoryCards.clear();
		this.focusTarget = undefined;

		const unlockedSet = new Set(unlockedAchievements);
		const collection = DOM.append(this.collectionContainer, DOM.$('section.chat-pet-achievements-collection'));
		collection.setAttribute('role', 'region');
		collection.setAttribute('aria-label', localize(
			'chatPet.achievements.collectionAriaLabel',
			"Achievement collection, {0} of {1} unlocked",
			unlockedAchievements.length,
			chatPetAchievements.length
		));
		const collectionHeader = DOM.append(collection, DOM.$('.chat-pet-achievements-collection-header'));
		DOM.append(collectionHeader, DOM.$('h2')).textContent = localize('chatPet.achievements.collection', "Collection");
		DOM.append(collectionHeader, DOM.$('span.chat-pet-achievements-count')).textContent = localize(
			'chatPet.achievements.count',
			"{0} of {1} unlocked",
			unlockedAchievements.length,
			chatPetAchievements.length
		);

		const list = DOM.append(collection, DOM.$('ul.chat-pet-achievements-list'));
		const cards = new Map<string, Button>();
		const noHatItem = DOM.append(list, DOM.$('li.chat-pet-achievements-list-item'));
		const noHatCard = this.renderDisposables.add(new Button(noHatItem, {
			secondary: true,
			ariaLabel: localize('chatPet.achievement.noHat', "No Hat"),
		}));
		noHatCard.element.classList.add('chat-pet-achievement-card', 'no-hat');
		noHatCard.element.dataset.accessoryId = NO_HAT_CARD_ID;
		const noHatPreviews = DOM.append(noHatCard.element, DOM.$('.chat-pet-achievement-previews'));
		this.renderCardPreview(noHatPreviews, undefined, true, color);
		const noHatContent = DOM.append(noHatCard.element, DOM.$('.chat-pet-achievement-card-content'));
		DOM.append(noHatContent, DOM.$('h3')).textContent = localize('chatPet.achievements.noHat', "No Hat");
		const noHatState = DOM.append(noHatContent, DOM.$('span.chat-pet-achievement-state'));
		this.renderDisposables.add(noHatCard.onDidClick(() => this.selectAccessory(undefined)));
		this.renderDisposables.add(noHatCard.onDidEscape(() => this.onDidRequestClose()));
		this.accessoryCards.set(NO_HAT_CARD_ID, {
			button: noHatCard,
			state: noHatState,
			defaultState: localize('chatPet.achievement.select', "Select"),
			getAriaLabel: getNoHatCardAriaLabel,
		});
		cards.set(NO_HAT_CARD_ID, noHatCard);

		for (const achievement of chatPetAchievements) {
			const unlocked = unlockedSet.has(achievement.id);
			const presentation = getChatPetAchievementPresentation(achievement, unlocked);
			const item = DOM.append(list, DOM.$('li.chat-pet-achievements-list-item'));
			const accessory = achievement.accessories[0];
			const cardId = accessory?.id ?? achievement.id;
			const rewardLabel = presentation.rewardLabels.join(', ');
			const defaultState = achievement.colorCustomization
				? localize('chatPet.achievement.changeColor', "Change Color")
				: localize('chatPet.achievement.unlocked', "Unlocked");
			const card = this.renderDisposables.add(new Button(item, {
				secondary: true,
				ariaLabel: presentation.locked
					? localize('chatPet.achievement.lockedAriaLabel', "Locked. Hint: {0} Rewards: {1}.", presentation.hint, presentation.rewardLabels.join(', '))
					: localize('chatPet.achievement.cardAriaLabel', "{0}. Reward: {1}. {2}", presentation.title, rewardLabel, defaultState),
			}));
			card.element.classList.add('chat-pet-achievement-card');
			card.element.dataset.achievementId = achievement.id;
			if (accessory) {
				card.element.dataset.accessoryId = accessory.id;
				card.element.setAttribute('aria-pressed', 'false');
			}
			card.element.classList.toggle('locked', !unlocked);
			card.enabled = unlocked;
			const newBadge = DOM.append(card.element, DOM.$('span.chat-pet-achievement-new-badge.hidden'));
			newBadge.textContent = localize('chatPet.achievement.new', "New");
			newBadge.setAttribute('aria-hidden', 'true');
			const previews = DOM.append(card.element, DOM.$('.chat-pet-achievement-previews'));
			this.renderCardPreview(previews, accessory, unlocked, color);

			const cardContent = DOM.append(card.element, DOM.$('.chat-pet-achievement-card-content'));
			if (!presentation.locked) {
				DOM.append(cardContent, DOM.$('h3')).textContent = presentation.title;
				const state = DOM.append(cardContent, DOM.$('span.chat-pet-achievement-state'));
				state.textContent = defaultState;
				DOM.append(cardContent, DOM.$('p.chat-pet-achievement-description')).textContent = presentation.description;
				DOM.append(cardContent, DOM.$('p.chat-pet-achievement-reward')).textContent = localize('chatPet.achievement.rewards', "Rewards: {0}", rewardLabel);
				this.accessoryCards.set(cardId, {
					button: card,
					state,
					defaultState,
					getAriaLabel: (_selection, cardState) => localize('chatPet.achievement.cardAriaLabel', "{0}. Reward: {1}. {2}", achievement.title, rewardLabel, cardState),
					achievementId: achievement.id,
					newBadge,
					colorCustomization: achievement.colorCustomization,
				});
			} else {
				DOM.append(cardContent, DOM.$('h3')).textContent = localize('chatPet.achievement.locked', "Locked");
				DOM.append(cardContent, DOM.$('span.chat-pet-achievement-state')).textContent = localize('chatPet.achievement.hint', "Hint");
				DOM.append(cardContent, DOM.$('p.chat-pet-achievement-description')).textContent = presentation.hint;
				DOM.append(cardContent, DOM.$('p.chat-pet-achievement-reward')).textContent = localize('chatPet.achievement.rewards', "Rewards: {0}", presentation.rewardLabels.join(', '));
			}
			this.renderDisposables.add(card.onDidClick(async () => {
				if (achievement.colorCustomization) {
					this.chatPetService.markAchievementSeen(achievement.id);
					await this.commandService.executeCommand(CHAT_PET_CHANGE_COLOR_COMMAND_ID);
				} else {
					this.selectAccessory(accessory?.id, achievement.id);
				}
			}));
			this.renderDisposables.add(card.onDidEscape(() => this.onDidRequestClose()));
			cards.set(cardId, card);
		}

		const roadmapItem = DOM.append(list, DOM.$('li.chat-pet-achievements-list-item'));
		const roadmapCard = DOM.append(roadmapItem, DOM.$('article.chat-pet-achievement-card.chat-pet-achievement-roadmap'));
		const roadmapPreview = DOM.append(roadmapCard, DOM.$('.chat-pet-achievement-roadmap-preview'));
		roadmapPreview.textContent = localize('chatPet.achievements.roadmap.preview', "TBD");
		const roadmapContent = DOM.append(roadmapCard, DOM.$('.chat-pet-achievement-card-content'));
		DOM.append(roadmapContent, DOM.$('h3')).textContent = localize('chatPet.achievements.roadmap.title', "TBD");
		DOM.append(roadmapContent, DOM.$('span.chat-pet-achievement-state')).textContent = localize('chatPet.achievements.roadmap.state', "Coming soon");
		const roadmapIntro = DOM.append(roadmapContent, DOM.$('p.chat-pet-achievement-description'));
		roadmapIntro.textContent = localize('chatPet.achievements.roadmap.intro', "Upcoming pet features:");
		const roadmapList = DOM.append(roadmapContent, DOM.$('ul.chat-pet-achievement-roadmap-list'));
		for (const item of [
			localize('chatPet.achievements.roadmap.moreAchievements', "More achievements and built-in hats"),
			localize('chatPet.achievements.roadmap.customHats', "Customizable hats that you can upload"),
		]) {
			DOM.append(roadmapList, DOM.$('li')).textContent = item;
		}

		const experimentalNote = DOM.append(this.collectionContainer, DOM.$('p.chat-pet-achievements-experimental'));
		experimentalNote.textContent = localize('chatPet.achievements.experimental', "The VS Code pet and achievements are experimental. Features and rewards may change.");

		this.scrollable.scanDomNode();
		this.layout(this.lastDimension);
		this.updateNewAchievements(this.chatPetService.unseenAchievements.read(undefined));
		if (restoreFocusId) {
			queueMicrotask(() => {
				if (!this._store.isDisposed) {
					cards.get(restoreFocusId)?.focus();
				}
			});
		}
	}

	private renderCardPreview(previews: HTMLElement, accessory: Parameters<typeof renderChatPetAchievementPreview>[1], unlocked: boolean, color: ChatPetColor): void {
		const preview = DOM.append(previews, DOM.$('canvas.chat-pet-achievement-preview')) as HTMLCanvasElement;
		preview.width = CHAT_PET_ACHIEVEMENT_PREVIEW_SIZE;
		preview.height = CHAT_PET_ACHIEVEMENT_PREVIEW_SIZE;
		preview.setAttribute('aria-hidden', 'true');
		this.renderDisposables.add(renderChatPetAchievementPreview(preview, accessory, unlocked, color, this.themeService, this.logService));
	}

	private selectAccessory(accessoryId: ChatPetAccessoryId | undefined, achievementId?: ChatPetAchievementId): void {
		if (achievementId) {
			this.chatPetService.markAchievementSeen(achievementId);
		}
		const target = this.appearanceTarget.get();
		if (getChatPetAppearanceTargetWindows(target).every(windowKind => this.chatPetService.getWindowAccessory(windowKind).get() === accessoryId)) {
			return;
		}
		this.chatPetService.setAccessory(accessoryId, target);
		status(getHatChangedStatus(target, accessoryId && getChatPetAccessory(accessoryId).label));
	}

	private updateSelectedAccessories(reader: IReader | undefined): void {
		const target = this.appearanceTarget.read(reader);
		const editorCardId = this.chatPetService.getWindowAccessory('editor').read(reader) ?? NO_HAT_CARD_ID;
		const agentsCardId = this.chatPetService.getWindowAccessory('agents').read(reader) ?? NO_HAT_CARD_ID;
		for (const [id, card] of this.accessoryCards) {
			const selection = card.colorCustomization ? undefined : getChatPetAppearanceSelection(target, windowKind => windowKind === 'editor' ? editorCardId : agentsCardId, id);
			card.button.element.classList.toggle('wearing', selection !== undefined);
			if (!card.colorCustomization) {
				card.button.element.setAttribute('aria-pressed', getChatPetAppearanceSelectionPressedState(selection));
			}
			const state = getHatCardState(selection) ?? card.defaultState;
			const ariaLabel = card.getAriaLabel(selection, state);
			card.button.setAriaLabel(card.achievementId && this.unseenAchievementIds.has(card.achievementId)
				? localize('chatPet.achievement.cardNewAriaLabel', "{0}. New", ariaLabel)
				: ariaLabel);
			card.state.textContent = state;
		}
		const targetCardId = getChatPetTargetAccessory(this.chatPetService, target).read(reader) ?? NO_HAT_CARD_ID;
		this.focusTarget = () => this.accessoryCards.get(targetCardId)?.button.focus();
	}

	private updateNewAchievements(achievementIds: readonly ChatPetAchievementId[]): void {
		this.unseenAchievementIds = new Set(achievementIds);
		for (const card of this.accessoryCards.values()) {
			card.newBadge?.classList.toggle('hidden', !card.achievementId || !this.unseenAchievementIds.has(card.achievementId));
		}
		this.updateSelectedAccessories(undefined);
	}
}

function getHatCardState(selection: ChatPetAppearanceSelection): string | undefined {
	switch (selection) {
		case 'all':
			return localize('chatPet.achievement.wearing', "Wearing");
		case 'editor':
			return localize('chatPet.achievement.wearingInEditor', "Wearing in Editor Window");
		case 'agents':
			return localize('chatPet.achievement.wearingInAgents', "Wearing in Agents Window");
		default:
			return undefined;
	}
}

function getNoHatCardAriaLabel(selection: ChatPetAppearanceSelection): string {
	switch (selection) {
		case 'all':
			return localize('chatPet.achievement.noHatSelected', "No Hat, selected");
		case 'editor':
			return localize('chatPet.achievement.noHatSelectedInEditor', "No Hat, selected in editor windows");
		case 'agents':
			return localize('chatPet.achievement.noHatSelectedInAgents', "No Hat, selected in the Agents window");
		default:
			return localize('chatPet.achievement.noHat', "No Hat");
	}
}

function getHatChangedStatus(target: ChatPetAppearanceTarget, hat: string | undefined): string {
	switch (target) {
		case 'editor':
			return hat
				? localize('chatPet.achievements.hatSelectedInEditor', "VS Code pet is now wearing {0} in editor windows", hat)
				: localize('chatPet.achievements.hatRemovedInEditor', "VS Code pet hat removed in editor windows");
		case 'agents':
			return hat
				? localize('chatPet.achievements.hatSelectedInAgents', "VS Code pet is now wearing {0} in the Agents window", hat)
				: localize('chatPet.achievements.hatRemovedInAgents', "VS Code pet hat removed in the Agents window");
		default:
			return hat
				? localize('chatPet.achievements.hatSelected', "VS Code pet is now wearing {0}", hat)
				: localize('chatPet.achievements.hatRemoved', "VS Code pet hat removed");
	}
}
