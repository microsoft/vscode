/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import './media/chatPetAchievementBadges.css';
import * as DOM from '../../../../base/browser/dom.js';
import { status } from '../../../../base/browser/ui/aria/aria.js';
import { getDefaultHoverDelegate } from '../../../../base/browser/ui/hover/hoverDelegateFactory.js';
import { Button } from '../../../../base/browser/ui/button/button.js';
import { Disposable, DisposableStore } from '../../../../base/common/lifecycle.js';
import { autorun, observableSignalFromEvent } from '../../../../base/common/observable.js';
import { localize } from '../../../../nls.js';
import { IHoverService } from '../../../../platform/hover/browser/hover.js';
import { ILogService } from '../../../../platform/log/common/log.js';
import { defaultButtonStyles } from '../../../../platform/theme/browser/defaultStyles.js';
import { IThemeService } from '../../../../platform/theme/common/themeService.js';
import { CHAT_PET_ACHIEVEMENT_PREVIEW_SIZE, renderChatPetAchievementPreview } from '../../../../workbench/contrib/chat/browser/chatPetAchievementPreview.js';
import { chatPetAchievements, ChatPetAccessoryId, ChatPetAchievementId, IChatPetAchievement } from '../../../../workbench/contrib/chat/browser/chatPetAchievements.js';
import { ChatPetVariant, IChatPetService } from '../../../../workbench/contrib/chat/browser/chatPetService.js';

export interface ISessionsChatPetAchievementBadge {
	readonly achievement: IChatPetAchievement;
	readonly unlocked: boolean;
}

export function getSessionsChatPetAchievementBadges(enabled: boolean, unlockedAchievements: readonly ChatPetAchievementId[]): readonly ISessionsChatPetAchievementBadge[] | undefined {
	if (!enabled) {
		return undefined;
	}
	const unlocked = new Set(unlockedAchievements);
	const badges = chatPetAchievements.map(achievement => ({ achievement, unlocked: unlocked.has(achievement.id) }));
	return [
		...badges.filter(badge => badge.unlocked),
		...badges.filter(badge => !badge.unlocked),
	];
}

export class SessionsChatPetAchievementBadges extends Disposable {

	readonly element: HTMLElement;
	private readonly renderDisposables = this._register(new DisposableStore());

	constructor(
		parent: HTMLElement,
		private readonly onOpenAchievements: () => void,
		@IChatPetService private readonly chatPetService: IChatPetService,
		@IThemeService private readonly themeService: IThemeService,
		@IHoverService private readonly hoverService: IHoverService,
		@ILogService private readonly logService: ILogService,
	) {
		super();
		this.element = DOM.append(parent, DOM.$('section.sessions-chat-pet-achievement-badges'));

		const themeChanged = observableSignalFromEvent(this, this.themeService.onDidColorThemeChange);
		this._register(autorun(reader => {
			const badges = getSessionsChatPetAchievementBadges(
				this.chatPetService.enabled.read(reader),
				this.chatPetService.unlockedAchievements.read(reader),
			);
			const variant = this.chatPetService.variant.read(reader);
			const selectedAccessory = this.chatPetService.selectedAccessory.read(reader);
			themeChanged.read(reader);
			this.render(badges, selectedAccessory, variant);
		}));
	}

	private render(badges: readonly ISessionsChatPetAchievementBadge[] | undefined, selectedAccessory: ChatPetAccessoryId | undefined, variant: ChatPetVariant): void {
		const activeElement = DOM.getActiveElement();
		const focusedAccessoryId = DOM.isHTMLElement(activeElement)
			? activeElement.closest<HTMLElement>('.sessions-chat-pet-achievement-badge')?.dataset.accessoryId
			: undefined;
		const restoreViewAchievementsFocus = DOM.isHTMLElement(activeElement) && activeElement.closest('.sessions-chat-pet-achievement-badges-actions') !== null;
		let focusTarget: HTMLElement | undefined;
		this.renderDisposables.clear();
		DOM.clearNode(this.element);
		this.element.classList.toggle('hidden', badges === undefined);
		if (!badges) {
			return;
		}

		this.element.setAttribute('aria-label', localize('sessionsChatPetBadgesSectionLabel', "Pet achievement badges"));
		const header = DOM.append(this.element, DOM.$('.sessions-chat-pet-achievement-badges-header'));
		DOM.append(header, DOM.$('h2.sessions-chat-pet-achievement-badges-title')).textContent = localize('sessionsChatPetBadgesTitle', "Badges");
		const unlockedCount = badges.filter(badge => badge.unlocked).length;
		DOM.append(header, DOM.$('span.sessions-chat-pet-achievement-badges-count')).textContent = localize('sessionsChatPetBadgesCount', "{0} of {1} unlocked", unlockedCount, badges.length);

		const list = DOM.append(this.element, DOM.$('ul.sessions-chat-pet-achievement-badges-list'));
		list.setAttribute('aria-label', localize('sessionsChatPetBadgesListLabel', "Pet achievement badges, {0} of {1} unlocked", unlockedCount, badges.length));
		for (const badge of badges) {
			const { achievement, unlocked } = badge;
			const accessory = achievement.accessories[0];
			const item = DOM.append(list, DOM.$('li.sessions-chat-pet-achievement-badges-list-item'));
			if (!unlocked) {
				item.setAttribute('aria-label', localize('sessionsChatPetBadgeLockedLabel', "Locked secret achievement badge"));
			}
			const badgeElement = unlocked
				? this.createUnlockedBadgeButton(item, achievement, accessory.id, selectedAccessory === accessory.id)
				: DOM.append(item, DOM.$('span.sessions-chat-pet-achievement-badge.locked', { 'aria-hidden': 'true' }));
			if (accessory.id === focusedAccessoryId) {
				focusTarget = badgeElement;
			}
			const canvas = DOM.append(badgeElement, DOM.$('canvas.sessions-chat-pet-achievement-badge-preview')) as HTMLCanvasElement;
			canvas.width = CHAT_PET_ACHIEVEMENT_PREVIEW_SIZE;
			canvas.height = CHAT_PET_ACHIEVEMENT_PREVIEW_SIZE;
			canvas.setAttribute('aria-hidden', 'true');
			this.renderDisposables.add(renderChatPetAchievementPreview(canvas, accessory, unlocked, variant, this.themeService, this.logService));
			this.renderDisposables.add(this.hoverService.setupManagedHover(getDefaultHoverDelegate('mouse'), badgeElement, unlocked ? accessory.label : localize('sessionsChatPetBadgeLocked', "Locked")));
		}
		const actions = DOM.append(this.element, DOM.$('.sessions-chat-pet-achievement-badges-actions'));
		const viewAchievements = this.renderDisposables.add(new Button(actions, {
			...defaultButtonStyles,
			secondary: true,
			ariaLabel: localize('sessionsChatPetViewAchievementsAriaLabel', "View Pet Achievements"),
		}));
		viewAchievements.label = localize('sessionsChatPetViewAchievements', "View Achievements");
		this.renderDisposables.add(viewAchievements.onDidClick(() => this.onOpenAchievements()));
		if (restoreViewAchievementsFocus) {
			focusTarget = viewAchievements.element;
		}

		if (focusTarget) {
			DOM.getWindow(focusTarget).queueMicrotask(() => {
				if (!this._store.isDisposed && focusTarget?.isConnected) {
					focusTarget.focus();
				}
			});
		}
	}

	private createUnlockedBadgeButton(parent: HTMLElement, achievement: IChatPetAchievement, accessoryId: ChatPetAccessoryId, selected: boolean): HTMLElement {
		const accessory = achievement.accessories[0];
		const button = this.renderDisposables.add(new Button(parent, {
			ariaLabel: selected
				? localize('sessionsChatPetBadgeSelectedLabel', "{0} achievement badge: {1}, wearing", achievement.title, accessory.label)
				: localize('sessionsChatPetBadgeLabel', "{0} achievement badge: wear {1}", achievement.title, accessory.label),
		}));
		button.element.classList.add('sessions-chat-pet-achievement-badge');
		button.element.classList.toggle('wearing', selected);
		button.element.dataset.accessoryId = accessoryId;
		button.element.setAttribute('aria-pressed', String(selected));
		this.renderDisposables.add(button.onDidClick(() => {
			if (this.chatPetService.selectedAccessory.get() === accessoryId) {
				return;
			}
			this.chatPetService.setAccessory(accessoryId);
			status(localize('sessionsChatPetBadgeHatSelected', "VS Code pet is now wearing {0}", accessory.label));
		}));
		return button.element;
	}
}
