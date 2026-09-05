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
import { autorun, observableSignalFromEvent } from '../../../../base/common/observable.js';
import { ScrollbarVisibility } from '../../../../base/common/scrollable.js';
import { localize } from '../../../../nls.js';
import { ILogService } from '../../../../platform/log/common/log.js';
import { IThemeService } from '../../../../platform/theme/common/themeService.js';
import { renderChatPetAchievementPreview, CHAT_PET_ACHIEVEMENT_PREVIEW_SIZE } from './chatPetAchievementPreview.js';
import { chatPetAchievements, ChatPetAccessoryId, ChatPetAchievementId, getChatPetAccessory, getChatPetAchievementPresentation } from './chatPetAchievements.js';
import { ChatPetVariant, IChatPetService } from './chatPetService.js';

export class ChatPetAchievementsWidget extends Disposable {

	private readonly container: HTMLElement;
	private readonly content: HTMLElement;
	private readonly scrollable: DomScrollableElement;
	private readonly renderDisposables = this._register(new DisposableStore());
	private readonly accessoryCards = new Map<string, {
		readonly button: Button;
		readonly state: HTMLElement;
		readonly defaultState: string;
		readonly selectedAriaLabel: string;
		readonly defaultAriaLabel: string;
		readonly achievementId?: ChatPetAchievementId;
		readonly newBadge?: HTMLElement;
	}>();
	private unseenAchievementIds = new Set<ChatPetAchievementId>();
	private focusTarget: (() => void) | undefined;
	private lastDimension: DOM.Dimension | undefined;

	constructor(
		parent: HTMLElement,
		private readonly onDidRequestClose: () => void,
		@IChatPetService private readonly chatPetService: IChatPetService,
		@IThemeService private readonly themeService: IThemeService,
		@ILogService private readonly logService: ILogService,
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

		const themeChanged = observableSignalFromEvent(this, this.themeService.onDidColorThemeChange);
		this._register(autorun(reader => {
			const unlockedAchievements = this.chatPetService.unlockedAchievements.read(reader);
			const variant = this.chatPetService.variant.read(reader);
			themeChanged.read(reader);
			this.render(unlockedAchievements, this.chatPetService.selectedAccessory.read(undefined), variant);
		}));
		this._register(autorun(reader => {
			this.updateSelectedAccessory(this.chatPetService.selectedAccessory.read(reader));
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
		this.container.classList.toggle('narrow', width < 560);
		this.scrollable.scanDomNode();
	}

	focus(): void {
		this.focusTarget?.();
	}

	private render(unlockedAchievements: readonly ChatPetAchievementId[], selectedAccessory: ChatPetAccessoryId | undefined, variant: ChatPetVariant): void {
		const activeElement = DOM.getActiveElement();
		const restoreFocusId = DOM.isHTMLElement(activeElement) ? activeElement.closest<HTMLElement>('.chat-pet-achievement-card')?.dataset.accessoryId : undefined;
		this.renderDisposables.clear();
		DOM.clearNode(this.content);
		this.accessoryCards.clear();
		this.focusTarget = undefined;

		const inner = DOM.append(this.content, DOM.$('.chat-pet-achievements-inner'));
		DOM.append(inner, DOM.$('h1')).textContent = localize('chatPet.achievements.title', "Achievements");
		DOM.append(inner, DOM.$('p.chat-pet-achievements-intro')).textContent = localize('chatPet.achievements.intro', "Unlock hats as you explore agent features, then choose what your pet wears by selecting an unlocked card.");
		const unlockedSet = new Set(unlockedAchievements);
		const collection = DOM.append(inner, DOM.$('section.chat-pet-achievements-collection'));
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
		const noHatId = 'none';
		const noHatItem = DOM.append(list, DOM.$('li.chat-pet-achievements-list-item'));
		const noHatSelected = selectedAccessory === undefined;
		const noHatCard = this.renderDisposables.add(new Button(noHatItem, {
			secondary: true,
			ariaLabel: noHatSelected
				? localize('chatPet.achievement.noHatSelected', "No Hat, selected")
				: localize('chatPet.achievement.noHat', "No Hat"),
		}));
		noHatCard.element.classList.add('chat-pet-achievement-card', 'no-hat');
		noHatCard.element.dataset.accessoryId = noHatId;
		noHatCard.element.setAttribute('aria-pressed', String(noHatSelected));
		noHatCard.element.classList.toggle('wearing', noHatSelected);
		const noHatPreviews = DOM.append(noHatCard.element, DOM.$('.chat-pet-achievement-previews'));
		this.renderCardPreview(noHatPreviews, undefined, true, variant);
		const noHatContent = DOM.append(noHatCard.element, DOM.$('.chat-pet-achievement-card-content'));
		DOM.append(noHatContent, DOM.$('h3')).textContent = localize('chatPet.achievements.noHat', "No Hat");
		const noHatState = DOM.append(noHatContent, DOM.$('span.chat-pet-achievement-state'));
		noHatState.textContent = noHatSelected
			? localize('chatPet.achievement.wearing', "Wearing")
			: localize('chatPet.achievement.select', "Select");
		this.renderDisposables.add(noHatCard.onDidClick(() => this.selectAccessory(undefined)));
		this.renderDisposables.add(noHatCard.onDidEscape(() => this.onDidRequestClose()));
		this.accessoryCards.set(noHatId, {
			button: noHatCard,
			state: noHatState,
			defaultState: localize('chatPet.achievement.select', "Select"),
			selectedAriaLabel: localize('chatPet.achievement.noHatSelected', "No Hat, selected"),
			defaultAriaLabel: localize('chatPet.achievement.noHat', "No Hat"),
		});
		cards.set(noHatId, noHatCard);

		for (const achievement of chatPetAchievements) {
			const unlocked = unlockedSet.has(achievement.id);
			const presentation = getChatPetAchievementPresentation(achievement, unlocked);
			const wearing = unlocked && achievement.accessories.some(accessory => selectedAccessory === accessory.id);
			const item = DOM.append(list, DOM.$('li.chat-pet-achievements-list-item'));
			const accessoryId = achievement.accessories[0].id;
			const card = this.renderDisposables.add(new Button(item, {
				secondary: true,
				ariaLabel: presentation.locked
					? localize('chatPet.achievement.lockedAriaLabel', "Locked. Hint: {0} Rewards: {1}.", presentation.hint, presentation.rewardLabels.join(', '))
					: localize('chatPet.achievement.cardAriaLabel', "{0}. Reward: {1}. {2}", presentation.title, presentation.accessories[0].label, wearing ? localize('chatPet.achievement.wearing', "Wearing") : localize('chatPet.achievement.unlocked', "Unlocked")),
			}));
			card.element.classList.add('chat-pet-achievement-card');
			card.element.dataset.accessoryId = accessoryId;
			card.element.classList.toggle('locked', !unlocked);
			card.element.classList.toggle('wearing', wearing);
			card.element.setAttribute('aria-pressed', String(wearing));
			card.enabled = unlocked;
			const newBadge = DOM.append(card.element, DOM.$('span.chat-pet-achievement-new-badge.hidden'));
			newBadge.textContent = localize('chatPet.achievement.new', "New");
			newBadge.setAttribute('aria-hidden', 'true');
			const previews = DOM.append(card.element, DOM.$('.chat-pet-achievement-previews'));
			const previewAccessories = unlocked ? achievement.accessories : [achievement.accessories[0]];
			for (const accessory of previewAccessories) {
				this.renderCardPreview(previews, accessory, unlocked, variant);
			}

			const cardContent = DOM.append(card.element, DOM.$('.chat-pet-achievement-card-content'));
			if (!presentation.locked) {
				DOM.append(cardContent, DOM.$('h3')).textContent = presentation.title;
				const state = DOM.append(cardContent, DOM.$('span.chat-pet-achievement-state'));
				state.textContent = wearing
					? localize('chatPet.achievement.wearing', "Wearing")
					: localize('chatPet.achievement.unlocked', "Unlocked");
				DOM.append(cardContent, DOM.$('p.chat-pet-achievement-description')).textContent = presentation.description;
				DOM.append(cardContent, DOM.$('p.chat-pet-achievement-reward')).textContent = localize('chatPet.achievement.rewards', "Rewards: {0}", presentation.accessories.map(accessory => accessory.label).join(', '));
				this.accessoryCards.set(accessoryId, {
					button: card,
					state,
					defaultState: localize('chatPet.achievement.unlocked', "Unlocked"),
					selectedAriaLabel: localize('chatPet.achievement.cardAriaLabel', "{0}. Reward: {1}. {2}", achievement.title, achievement.accessories[0].label, localize('chatPet.achievement.wearing', "Wearing")),
					defaultAriaLabel: localize('chatPet.achievement.cardAriaLabel', "{0}. Reward: {1}. {2}", achievement.title, achievement.accessories[0].label, localize('chatPet.achievement.unlocked', "Unlocked")),
					achievementId: achievement.id,
					newBadge,
				});
			} else {
				DOM.append(cardContent, DOM.$('h3')).textContent = localize('chatPet.achievement.locked', "Locked");
				DOM.append(cardContent, DOM.$('span.chat-pet-achievement-state')).textContent = localize('chatPet.achievement.hint', "Hint");
				DOM.append(cardContent, DOM.$('p.chat-pet-achievement-description')).textContent = presentation.hint;
				DOM.append(cardContent, DOM.$('p.chat-pet-achievement-reward')).textContent = localize('chatPet.achievement.rewards', "Rewards: {0}", presentation.rewardLabels.join(', '));
			}
			this.renderDisposables.add(card.onDidClick(() => this.selectAccessory(accessoryId, achievement.id)));
			this.renderDisposables.add(card.onDidEscape(() => this.onDidRequestClose()));
			cards.set(accessoryId, card);
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
			localize('chatPet.achievements.roadmap.namingCompetition', "A naming competition"),
			localize('chatPet.achievements.roadmap.moreAchievements', "More achievements and built-in hats"),
			localize('chatPet.achievements.roadmap.customHats', "Customizable hats that you can upload"),
		]) {
			DOM.append(roadmapList, DOM.$('li')).textContent = item;
		}

		const experimentalNote = DOM.append(inner, DOM.$('p.chat-pet-achievements-experimental'));
		experimentalNote.textContent = localize('chatPet.achievements.experimental', "The VS Code pet and achievements are experimental. Features and rewards may change.");

		this.scrollable.scanDomNode();
		this.layout(this.lastDimension);
		this.updateNewAchievements(this.chatPetService.unseenAchievements.read(undefined));
		const selectedCardId = selectedAccessory ?? noHatId;
		this.focusTarget = () => cards.get(selectedCardId)?.focus();
		if (restoreFocusId) {
			queueMicrotask(() => {
				if (!this._store.isDisposed) {
					cards.get(restoreFocusId)?.focus();
				}
			});
		}
	}

	private renderCardPreview(previews: HTMLElement, accessory: Parameters<typeof renderChatPetAchievementPreview>[1], unlocked: boolean, variant: ChatPetVariant): void {
		const preview = DOM.append(previews, DOM.$('canvas.chat-pet-achievement-preview')) as HTMLCanvasElement;
		preview.width = CHAT_PET_ACHIEVEMENT_PREVIEW_SIZE;
		preview.height = CHAT_PET_ACHIEVEMENT_PREVIEW_SIZE;
		preview.setAttribute('aria-hidden', 'true');
		this.renderDisposables.add(renderChatPetAchievementPreview(preview, accessory, unlocked, variant, this.themeService, this.logService));
	}

	private selectAccessory(accessoryId: ChatPetAccessoryId | undefined, achievementId?: ChatPetAchievementId): void {
		if (achievementId) {
			this.chatPetService.markAchievementSeen(achievementId);
		}
		if (accessoryId === this.chatPetService.selectedAccessory.get()) {
			return;
		}
		this.chatPetService.setAccessory(accessoryId);
		status(accessoryId === undefined
			? localize('chatPet.achievements.hatRemoved', "VS Code pet hat removed")
			: localize('chatPet.achievements.hatSelected', "VS Code pet is now wearing {0}", getChatPetAccessory(accessoryId).label));
	}

	private updateSelectedAccessory(accessoryId: ChatPetAccessoryId | undefined): void {
		const selectedId = accessoryId ?? 'none';
		for (const [id, card] of this.accessoryCards) {
			const wearing = id === selectedId;
			card.button.element.classList.toggle('wearing', wearing);
			card.button.element.setAttribute('aria-pressed', String(wearing));
			const baseAriaLabel = wearing ? card.selectedAriaLabel : card.defaultAriaLabel;
			card.button.setAriaLabel(card.achievementId && this.unseenAchievementIds.has(card.achievementId)
				? localize('chatPet.achievement.cardNewAriaLabel', "{0}. New", baseAriaLabel)
				: baseAriaLabel);
			card.state.textContent = wearing ? localize('chatPet.achievement.wearing', "Wearing") : card.defaultState;
		}
		this.focusTarget = () => this.accessoryCards.get(selectedId)?.button.focus();
	}

	private updateNewAchievements(achievementIds: readonly ChatPetAchievementId[]): void {
		this.unseenAchievementIds = new Set(achievementIds);
		for (const card of this.accessoryCards.values()) {
			card.newBadge?.classList.toggle('hidden', !card.achievementId || !this.unseenAchievementIds.has(card.achievementId));
		}
		this.updateSelectedAccessory(this.chatPetService.selectedAccessory.read(undefined));
	}
}
