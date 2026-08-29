/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import './media/chatPetAchievementBadges.css';
import * as DOM from '../../../../base/browser/dom.js';
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
import { chatPetAchievements, ChatPetAchievementId, IChatPetAchievement } from '../../../../workbench/contrib/chat/browser/chatPetAchievements.js';
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
	private badgesList: HTMLElement | undefined;

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
			themeChanged.read(reader);
			this.render(badges, variant);
		}));
	}

	private render(badges: readonly ISessionsChatPetAchievementBadge[] | undefined, variant: ChatPetVariant): void {
		const restoreListFocus = this.badgesList === DOM.getActiveElement();
		this.renderDisposables.clear();
		DOM.clearNode(this.element);
		this.badgesList = undefined;
		this.element.classList.toggle('hidden', badges === undefined);
		if (!badges) {
			return;
		}

		this.element.setAttribute('aria-label', localize('sessionsChatPetBadgesSectionLabel', "Pet achievement badges"));
		const header = DOM.append(this.element, DOM.$('.sessions-chat-pet-achievement-badges-header'));
		DOM.append(header, DOM.$('h2.sessions-chat-pet-achievement-badges-title')).textContent = localize('sessionsChatPetBadgesTitle', "Badges");
		const unlockedCount = badges.filter(badge => badge.unlocked).length;
		DOM.append(header, DOM.$('span.sessions-chat-pet-achievement-badges-count')).textContent = localize('sessionsChatPetBadgesCount', "{0} of {1} unlocked", unlockedCount, badges.length);

		const list = this.badgesList = DOM.append(this.element, DOM.$('ul.sessions-chat-pet-achievement-badges-list'));
		list.tabIndex = 0;
		list.setAttribute('aria-label', localize('sessionsChatPetBadgesListLabel', "Pet achievement badges, {0} of {1} unlocked", unlockedCount, badges.length));
		for (const badge of badges) {
			const { achievement, unlocked } = badge;
			const accessory = achievement.accessories[0];
			const item = DOM.append(list, DOM.$('li.sessions-chat-pet-achievement-badge'));
			item.classList.toggle('locked', !unlocked);
			item.setAttribute('aria-label', unlocked
				? localize('sessionsChatPetBadgeLabel', "{0} achievement badge: {1}", achievement.title, accessory.label)
				: localize('sessionsChatPetBadgeLockedLabel', "Locked secret achievement badge"));
			const canvas = DOM.append(item, DOM.$('canvas.sessions-chat-pet-achievement-badge-preview')) as HTMLCanvasElement;
			canvas.width = CHAT_PET_ACHIEVEMENT_PREVIEW_SIZE;
			canvas.height = CHAT_PET_ACHIEVEMENT_PREVIEW_SIZE;
			canvas.setAttribute('aria-hidden', 'true');
			this.renderDisposables.add(renderChatPetAchievementPreview(canvas, accessory, unlocked, variant, this.themeService, this.logService));
			this.renderDisposables.add(this.hoverService.setupManagedHover(getDefaultHoverDelegate('mouse'), item, unlocked ? achievement.title : localize('sessionsChatPetBadgeLocked', "Locked")));
		}
		const actions = DOM.append(this.element, DOM.$('.sessions-chat-pet-achievement-badges-actions'));
		const viewAchievements = this.renderDisposables.add(new Button(actions, {
			...defaultButtonStyles,
			secondary: true,
			ariaLabel: localize('sessionsChatPetViewAchievementsAriaLabel', "View Pet Achievements"),
		}));
		viewAchievements.label = localize('sessionsChatPetViewAchievements', "View Achievements");
		this.renderDisposables.add(viewAchievements.onDidClick(() => this.onOpenAchievements()));

		if (restoreListFocus) {
			queueMicrotask(() => {
				if (!this._store.isDisposed && list.isConnected) {
					list.focus();
				}
			});
		}
	}
}
