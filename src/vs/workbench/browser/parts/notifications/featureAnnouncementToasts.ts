/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import './media/featureAnnouncement.css';
import { DisposableStore } from '../../../../base/common/lifecycle.js';
import { IThemeService, Themable } from '../../../../platform/theme/common/themeService.js';
import { $, addDisposableListener, EventType, Dimension, scheduleAtNextAnimationFrame, getWindow } from '../../../../base/browser/dom.js';
import { IWorkbenchLayoutService, Parts } from '../../../services/layout/browser/layoutService.js';
import { Emitter } from '../../../../base/common/event.js';
import { IOpenerService } from '../../../../platform/opener/common/opener.js';
import { URI } from '../../../../base/common/uri.js';
import { ThemeIcon } from '../../../../base/common/themables.js';
import { mainWindow } from '../../../../base/browser/window.js';
import { ILifecycleService, LifecyclePhase } from '../../../services/lifecycle/common/lifecycle.js';
import {
	IFeatureAnnouncementService,
	IFeatureAnnouncement,
	IFeatureAnnouncementChangeEvent,
	FeatureAnnouncementChangeType
} from '../../../services/notification/common/featureAnnouncement.js';

interface IFeatureAnnouncementCard {
	readonly announcement: IFeatureAnnouncement;
	readonly container: HTMLElement;
	readonly card: HTMLElement;
}

export class FeatureAnnouncementToasts extends Themable {

	private static readonly MAX_WIDTH = 320;

	private readonly _onDidChangeVisibility = this._register(new Emitter<void>());
	readonly onDidChangeVisibility = this._onDidChangeVisibility.event;

	private _isVisible = false;
	get isVisible(): boolean { return this._isVisible; }

	private featureAnnouncementsContainer: HTMLElement | undefined;
	private workbenchDimensions: Dimension | undefined;

	private readonly mapAnnouncementToCard = new Map<IFeatureAnnouncement, IFeatureAnnouncementCard>();
	private readonly mapAnnouncementToDisposable = new Map<IFeatureAnnouncement, DisposableStore>();

	constructor(
		private readonly container: HTMLElement,
		@IFeatureAnnouncementService private readonly featureAnnouncementService: IFeatureAnnouncementService,
		@IThemeService themeService: IThemeService,
		@IWorkbenchLayoutService private readonly layoutService: IWorkbenchLayoutService,
		@IOpenerService private readonly openerService: IOpenerService,
		@ILifecycleService private readonly lifecycleService: ILifecycleService
	) {
		super(themeService);

		this.registerListeners();
	}

	private registerListeners(): void {
		// Layout
		this._register(this.layoutService.onDidLayoutMainContainer(dimension => this.layout(Dimension.lift(dimension))));

		// Listen for announcement changes immediately
		this._register(this.featureAnnouncementService.onDidChangeAnnouncements(e => {
			this.onDidChangeAnnouncement(e);
		}));

		// Show cards for initial announcements after we have restored
		this.lifecycleService.when(LifecyclePhase.Restored).then(() => {
			// Show cards for initial announcements if any
			this.featureAnnouncementService.announcements.forEach(announcement => this.addCard(announcement));
		});
	}

	private onDidChangeAnnouncement(e: IFeatureAnnouncementChangeEvent): void {
		switch (e.kind) {
			case FeatureAnnouncementChangeType.ADD:
				return this.addCard(e.announcement);
			case FeatureAnnouncementChangeType.REMOVE:
				return this.removeCard(e.announcement);
		}
	}

	private addCard(announcement: IFeatureAnnouncement): void {
		const itemDisposables = new DisposableStore();
		this.mapAnnouncementToDisposable.set(announcement, itemDisposables);
		itemDisposables.add(scheduleAtNextAnimationFrame(getWindow(this.container), () => this.doAddCard(announcement, itemDisposables)));
	}

	private doAddCard(announcement: IFeatureAnnouncement, itemDisposables: DisposableStore): void {
		// Lazily create container
		let featureAnnouncementsContainer = this.featureAnnouncementsContainer;
		if (!featureAnnouncementsContainer) {
			featureAnnouncementsContainer = this.featureAnnouncementsContainer = $('.feature-announcements');
			this.container.appendChild(featureAnnouncementsContainer);
		}

		// Make Visible
		featureAnnouncementsContainer.classList.add('visible');

		// Create card
		const cardContainer = this.createCardElement(announcement, itemDisposables);
		featureAnnouncementsContainer.appendChild(cardContainer);

		const card: IFeatureAnnouncementCard = { announcement, container: cardContainer, card: cardContainer };
		this.mapAnnouncementToCard.set(announcement, card);

		// Layout
		this.layout(this.workbenchDimensions);

		// Animate in
		cardContainer.classList.add('fade-in');

		// Events
		if (!this._isVisible) {
			this._isVisible = true;
			this._onDidChangeVisibility.fire();
		}
	}

	private createCardElement(announcement: IFeatureAnnouncement, disposables: DisposableStore): HTMLElement {
		const card = $('.feature-announcement-card');

		// Header
		const header = $('.announcement-header');
		card.appendChild(header);

		const headerText = $('.announcement-header-text');
		header.appendChild(headerText);

		const category = $('.announcement-category');
		category.textContent = announcement.category;
		headerText.appendChild(category);

		const title = $('.announcement-title');
		title.textContent = announcement.title;
		headerText.appendChild(title);

		// Close button
		const closeButton = $('button.announcement-close');
		closeButton.setAttribute('aria-label', 'Close');
		const closeIcon = $('span.codicon.codicon-close');
		closeButton.appendChild(closeIcon);
		header.appendChild(closeButton);

		disposables.add(addDisposableListener(closeButton, EventType.CLICK, () => {
			this.closeAnnouncement(announcement);
		}));

		// Features list
		const features = $('.announcement-features');
		card.appendChild(features);

		for (const feature of announcement.features) {
			const featureItem = $('.feature-item');
			features.appendChild(featureItem);

			const icon = $('.feature-icon');
			icon.classList.add(...ThemeIcon.asClassNameArray(feature.icon));
			featureItem.appendChild(icon);

			const content = $('.feature-content');
			featureItem.appendChild(content);

			const featureTitle = $('.feature-title');
			featureTitle.textContent = feature.title;
			content.appendChild(featureTitle);

			const description = $('.feature-description');
			description.textContent = feature.description;
			content.appendChild(description);
		}

		// Footer
		if (announcement.learnMoreUrl || announcement.primaryAction) {
			const footer = $('.announcement-footer');
			card.appendChild(footer);

			if (announcement.learnMoreUrl) {
				const learnMore = $('a.announcement-learn-more');
				learnMore.textContent = 'Full Release Notes';
				learnMore.setAttribute('href', announcement.learnMoreUrl);
				footer.appendChild(learnMore);

				disposables.add(addDisposableListener(learnMore, EventType.CLICK, (e) => {
					e.preventDefault();
					this.openerService.open(URI.parse(announcement.learnMoreUrl!));
				}));
			} else {
				// Empty spacer
				footer.appendChild($('span'));
			}

			if (announcement.primaryAction) {
				const primaryButton = $('button.announcement-primary-action');
				primaryButton.textContent = announcement.primaryAction.label;
				footer.appendChild(primaryButton);

				const action = announcement.primaryAction;
				disposables.add(addDisposableListener(primaryButton, EventType.CLICK, () => {
					action.run();
					this.closeAnnouncement(announcement);
				}));
			}
		}

		return card;
	}

	private closeAnnouncement(announcement: IFeatureAnnouncement): void {
		// Close through the service, which will fire the REMOVE event
		// and trigger removeCard
		this.featureAnnouncementService.close(announcement.id);
	}

	private removeCard(announcement: IFeatureAnnouncement): void {
		// UI
		const card = this.mapAnnouncementToCard.get(announcement);
		if (card) {
			card.container.remove();
			this.mapAnnouncementToCard.delete(announcement);
		}

		// Disposables
		const disposables = this.mapAnnouncementToDisposable.get(announcement);
		if (disposables) {
			disposables.dispose();
			this.mapAnnouncementToDisposable.delete(announcement);
		}

		// Hide container if no more cards
		if (this.mapAnnouncementToCard.size === 0) {
			this.doHide();
		}
	}

	private doHide(): void {
		this.featureAnnouncementsContainer?.classList.remove('visible');

		if (this._isVisible) {
			this._isVisible = false;
			this._onDidChangeVisibility.fire();
		}
	}

	layout(dimension: Dimension | undefined): void {
		this.workbenchDimensions = dimension;

		if (!this.featureAnnouncementsContainer) {
			return;
		}

		// Position the container
		let bottom = 34; // 22px status bar + 12px margin
		if (this.workbenchDimensions && !this.layoutService.isVisible(Parts.STATUSBAR_PART, mainWindow)) {
			bottom = 12;
		}

		this.featureAnnouncementsContainer.style.bottom = `${bottom}px`;
		this.featureAnnouncementsContainer.style.right = '12px';
		this.featureAnnouncementsContainer.style.maxWidth = `${FeatureAnnouncementToasts.MAX_WIDTH}px`;
	}
}
