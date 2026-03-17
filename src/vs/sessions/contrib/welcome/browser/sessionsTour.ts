/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import './media/sessionsTour.css';
import { Disposable, DisposableStore, MutableDisposable, toDisposable } from '../../../../base/common/lifecycle.js';
import { $, append, EventType, addDisposableListener, clearNode } from '../../../../base/browser/dom.js';
import { renderIcon } from '../../../../base/browser/ui/iconLabel/iconLabels.js';
import { Codicon } from '../../../../base/common/codicons.js';
import { Button } from '../../../../base/browser/ui/button/button.js';
import { defaultButtonStyles } from '../../../../platform/theme/browser/defaultStyles.js';
import { localize } from '../../../../nls.js';
import { Parts, IWorkbenchLayoutService } from '../../../../workbench/services/layout/browser/layoutService.js';
import { IChatService } from '../../../../workbench/contrib/chat/common/chatService/chatService.js';
import { IContextKeyService } from '../../../../platform/contextkey/common/contextkey.js';
import { SessionsTourVisibleContext } from '../../../common/contextkeys.js';
import { mainWindow } from '../../../../base/browser/window.js';

interface ITourStepConfig {
	title: string;
	body: string;
	/** Short instruction telling the user what to do. */
	action?: string;
	/** Part to spotlight. Undefined = no spotlight (full-screen scrim). */
	part?: Parts;
	/** Arrow direction on the floating card relative to the spotlight. */
	arrow?: 'up' | 'down' | 'left' | 'right';
	/** If true, the step auto-advances when a chat message is sent. */
	waitForChat?: boolean;
	/** Action to run when this step becomes active (e.g. show/hide panels). */
	onEnter?: () => void;
}

const CARD_PADDING = 16; // gap between spotlight rect and card edge

/**
 * Guided product tour for the Sessions window.
 *
 * Walks new users through the core concepts and UI areas — session types,
 * worktrees vs. folders, branches, the changes panel, and the sidebar —
 * so they understand the workflow before sending their first message.
 */
export class SessionsTourOverlay extends Disposable {

	private readonly overlay: HTMLElement;
	private readonly scrimTop: HTMLElement;
	private readonly scrimBottom: HTMLElement;
	private readonly scrimLeft: HTMLElement;
	private readonly scrimRight: HTMLElement;
	private readonly card: HTMLElement;

	private currentStep = 0;
	private readonly stepStore = this._register(new MutableDisposable<DisposableStore>());

	private _resolveFinished!: () => void;
	/** Resolves when the tour is finished or dismissed. */
	readonly finished: Promise<void> = new Promise(resolve => { this._resolveFinished = resolve; });

	private readonly steps: ITourStepConfig[];

	constructor(
		private readonly container: HTMLElement,
		@IWorkbenchLayoutService private readonly layoutService: IWorkbenchLayoutService,
		@IChatService private readonly chatService: IChatService,
		@IContextKeyService private readonly contextKeyService: IContextKeyService,
	) {
		super();

		this.steps = this._buildSteps();

		// Overlay container (pointer-events: none so clicks pass through)
		this.overlay = append(container, $('.sessions-tour-overlay'));
		this._register(toDisposable(() => this.overlay.remove()));

		// Set context key
		const tourVisibleKey = SessionsTourVisibleContext.bindTo(this.contextKeyService);
		tourVisibleKey.set(true);
		this._register(toDisposable(() => tourVisibleKey.reset()));

		// Four scrim panels around the spotlight cutout (these block clicks outside the spotlight)
		this.scrimTop = append(this.overlay, $('.sessions-tour-scrim.scrim-top'));
		this.scrimBottom = append(this.overlay, $('.sessions-tour-scrim.scrim-bottom'));
		this.scrimLeft = append(this.overlay, $('.sessions-tour-scrim.scrim-left'));
		this.scrimRight = append(this.overlay, $('.sessions-tour-scrim.scrim-right'));

		// Floating card
		this.card = append(this.overlay, $('.sessions-tour-card sessions-tour-card-centered'));

		this._renderStep();
	}

	// ------------------------------------------------------------------
	// Step definitions

	private _buildSteps(): ITourStepConfig[] {
		return [
			// 1. Choose Local or Cloud
			{
				title: localize('tour.provider.title', "Choose Local or Cloud"),
				body: localize('tour.provider.body', "Start by selecting where your session runs. Local runs the agent on your machine with direct file access. Cloud runs it on a remote server."),
				action: localize('tour.provider.action', "Select Local or Cloud above."),
				part: Parts.CHATBAR_PART,
				arrow: 'up',
				onEnter: () => {
					this.layoutService.setPartHidden(false, Parts.SIDEBAR_PART);
					this.layoutService.setPartHidden(false, Parts.AUXILIARYBAR_PART);
				},
			},

			// 2. Pick a folder
			{
				title: localize('tour.folder.title', "Pick a Folder"),
				body: localize('tour.folder.body', "Select the project folder the agent will work in. This is the repository or workspace where changes will be made."),
				action: localize('tour.folder.action', "Click \u201CPick Folder\u201D to select your project."),
				part: Parts.CHATBAR_PART,
				arrow: 'up',
			},

			// 3. Worktree or Folder mode
			{
				title: localize('tour.isolation.title', "Choose Isolation Mode"),
				body: localize('tour.isolation.body', "Worktree creates an isolated copy with its own branch \u2014 your main code stays untouched. Folder mode works directly in place."),
				action: localize('tour.isolation.action', "Select Worktree or Folder, then pick a branch if needed."),
				part: Parts.CHATBAR_PART,
				arrow: 'up',
			},

			// 4. Send your first message
			{
				title: localize('tour.send.title', "Send Your First Message"),
				body: localize('tour.send.body', "Describe what you want to build. The agent will analyze your project and start working."),
				action: localize('tour.send.action', "Try: \u201CCreate a hello world script\u201D"),
				part: Parts.CHATBAR_PART,
				arrow: 'up',
				waitForChat: true,
			},

			// 5. Sidebar — session list
			{
				title: localize('tour.sidebar.title', "Your Session Is Running"),
				body: localize('tour.sidebar.body', "Your session is listed here. You can run multiple sessions at the same time, switch between them, or archive completed work."),
				part: Parts.SIDEBAR_PART,
				arrow: 'right',
			},

			// 6. Changes panel
			{
				title: localize('tour.changes.title', "Review Changes"),
				body: localize('tour.changes.body', "Every file the agent modifies appears here. Click one to see a diff. When done, create a pull request, merge, or discard."),
				part: Parts.AUXILIARYBAR_PART,
				arrow: 'left',
			},

			// 7. Done
			{
				title: localize('tour.done.title', "You\u2019re All Set"),
				body: localize('tour.done.body', "You\u2019ve set up a session, sent a message, and know where to review changes. Start building."),
			},
		];
	}

	// ------------------------------------------------------------------
	// Step rendering

	private _renderStep(): void {
		const step = this.steps[this.currentStep];
		if (!step) {
			this._finishTour();
			return;
		}

		const store = new DisposableStore();
		this.stepStore.value = store;

		// Run step enter action (e.g. show/hide panels)
		step.onEnter?.();

		clearNode(this.card);
		this.card.className = 'sessions-tour-card';

		// Header (step counter + close button)
		const header = append(this.card, $('.sessions-tour-card-header'));
		const titleRow = append(header, $('.sessions-tour-card-title-row'));
		append(titleRow, $('span.sessions-tour-card-step-number', undefined,
			localize('tour.stepCounter', "{0} of {1}", this.currentStep + 1, this.steps.length)));
		append(titleRow, $('span.sessions-tour-card-title', undefined, step.title));
		const closeBtn = append(header, $('button.sessions-tour-close'));
		closeBtn.setAttribute('aria-label', localize('tour.close', "Close tour"));
		closeBtn.appendChild(renderIcon(Codicon.close));
		store.add(addDisposableListener(closeBtn, EventType.CLICK, () => this._finishTour()));

		// Body
		const bodyEl = append(this.card, $('div.sessions-tour-card-body'));
		append(bodyEl, $('p', undefined, step.body));

		// Action hint (if present)
		let hintEl: HTMLElement | undefined;
		if (step.action) {
			hintEl = append(bodyEl, $('div.sessions-tour-prompt-hint'));
			hintEl.appendChild(renderIcon(step.waitForChat ? Codicon.arrowRight : Codicon.lightbulb));
			append(hintEl, $('span', undefined, step.action));
		}

		// Waiting indicator for chat steps
		if (step.waitForChat) {
			const waiting = append(bodyEl, $('div.sessions-tour-waiting'));
			waiting.style.display = 'none';
			waiting.appendChild(renderIcon(Codicon.loading));
			append(waiting, $('span', undefined, localize('tour.send.waiting', "Starting session\u2026")));

			store.add(this.chatService.onDidSubmitRequest(() => {
				waiting.style.display = 'flex';
				if (hintEl) {
					hintEl.style.display = 'none';
				}
				const handle = setTimeout(() => {
					this.currentStep++;
					this._renderStep();
				}, 1500);
				store.add(toDisposable(() => clearTimeout(handle)));
			}));
		}

		// Navigation — always show so there's a next arrow on every step
		const progress = append(this.card, $('.sessions-tour-progress'));
		const nav = append(progress, $('.sessions-tour-nav'));

		if (this.currentStep > 0) {
			const prevBtn = store.add(new Button(nav, { ...defaultButtonStyles, secondary: true }));
			prevBtn.label = localize('tour.prev', "Back");
			store.add(prevBtn.onDidClick(() => { this.currentStep--; this._renderStep(); }));
		}

		const isLast = this.currentStep === this.steps.length - 1;
		const nextBtn = store.add(new Button(nav, { ...defaultButtonStyles }));
		nextBtn.label = isLast ? localize('tour.done.btn', "Done") : localize('tour.continue', "Continue");
		store.add(nextBtn.onDidClick(() => {
			this.currentStep++;
			this._renderStep();
		}));

		// Position spotlight and card
		this._positionForStep(step, store);
	}

	// ------------------------------------------------------------------
	// Scrim + card positioning

	private _positionForStep(step: ITourStepConfig, store: DisposableStore): void {
		if (!step.part) {
			// No spotlight — full-screen scrim
			this._setScrimFullScreen();
			this.card.classList.add('sessions-tour-card-centered');
			return;
		}

		this.card.classList.remove('sessions-tour-card-centered');

		const place = () => {
			const partEl = this.layoutService.getContainer(mainWindow, step.part!);
			if (!partEl) {
				return;
			}

			const containerRect = this.container.getBoundingClientRect();
			const partRect = partEl.getBoundingClientRect();

			// Convert to container-relative coordinates
			const top = partRect.top - containerRect.top;
			const left = partRect.left - containerRect.left;
			const width = partRect.width;
			const height = partRect.height;

			// Position the four scrim panels around the spotlight cutout
			this._setScrimCutout(top, left, width, height, containerRect.width, containerRect.height);

			// Card position based on arrow direction
			this._placeCard(step.arrow, top, left, width, height, containerRect);
		};

		place();

		// Reposition on window resize
		store.add(addDisposableListener(mainWindow, EventType.RESIZE, place));
	}

	/** Covers the entire container with scrim (no cutout). */
	private _setScrimFullScreen(): void {
		this.scrimTop.style.cssText = 'top:0;left:0;width:100%;height:100%';
		this.scrimBottom.style.cssText = 'display:none';
		this.scrimLeft.style.cssText = 'display:none';
		this.scrimRight.style.cssText = 'display:none';
	}

	/** Positions four panels around a rectangular cutout, leaving the cutout area click-through. */
	private _setScrimCutout(top: number, left: number, width: number, height: number, containerWidth: number, containerHeight: number): void {
		// Top: full width, from 0 to spotlight top
		this.scrimTop.style.cssText = `display:block;top:0;left:0;width:${containerWidth}px;height:${top}px`;
		// Bottom: full width, from spotlight bottom to container bottom
		this.scrimBottom.style.cssText = `display:block;top:${top + height}px;left:0;width:${containerWidth}px;height:${containerHeight - top - height}px`;
		// Left: spotlight height, from 0 to spotlight left
		this.scrimLeft.style.cssText = `display:block;top:${top}px;left:0;width:${left}px;height:${height}px`;
		// Right: spotlight height, from spotlight right to container right
		this.scrimRight.style.cssText = `display:block;top:${top}px;left:${left + width}px;width:${containerWidth - left - width}px;height:${height}px`;
	}

	private _placeCard(
		arrow: ITourStepConfig['arrow'],
		spotTop: number,
		spotLeft: number,
		spotWidth: number,
		spotHeight: number,
		containerRect: DOMRect,
	): void {
		const cardWidth = 380;
		const containerWidth = containerRect.width;
		const containerHeight = containerRect.height;

		// Remove previous arrow classes
		this.card.classList.remove('arrow-up', 'arrow-down', 'arrow-left', 'arrow-right');

		// Reset inline styles
		this.card.style.top = '';
		this.card.style.left = '';
		this.card.style.bottom = '';
		this.card.style.right = '';
		this.card.style.transform = '';

		switch (arrow) {
			case 'down': {
				// Card sits above the spotlight
				const cardTop = Math.max(CARD_PADDING, spotTop - this.card.offsetHeight - CARD_PADDING);
				const cardLeft = this._clampHorizontal(spotLeft + spotWidth / 2 - cardWidth / 2, cardWidth, containerWidth);
				this.card.style.top = `${cardTop}px`;
				this.card.style.left = `${cardLeft}px`;
				this.card.classList.add('arrow-down');
				break;
			}
			case 'up': {
				// Card sits below the spotlight
				const cardTop = Math.min(containerHeight - 280, spotTop + spotHeight + CARD_PADDING);
				const cardLeft = this._clampHorizontal(spotLeft + spotWidth / 2 - cardWidth / 2, cardWidth, containerWidth);
				this.card.style.top = `${cardTop}px`;
				this.card.style.left = `${cardLeft}px`;
				this.card.classList.add('arrow-up');
				break;
			}
			case 'right': {
				// Card sits to the right of the spotlight
				const cardLeft = Math.min(containerWidth - cardWidth - CARD_PADDING, spotLeft + spotWidth + CARD_PADDING);
				const cardTop = this._clampVertical(spotTop + spotHeight / 2 - 120, containerHeight);
				this.card.style.top = `${cardTop}px`;
				this.card.style.left = `${cardLeft}px`;
				this.card.classList.add('arrow-left');
				break;
			}
			case 'left': {
				// Card sits to the left of the spotlight
				const cardLeft = Math.max(CARD_PADDING, spotLeft - cardWidth - CARD_PADDING);
				const cardTop = this._clampVertical(spotTop + spotHeight / 2 - 120, containerHeight);
				this.card.style.top = `${cardTop}px`;
				this.card.style.left = `${cardLeft}px`;
				this.card.classList.add('arrow-right');
				break;
			}
			default: {
				// Centered
				this.card.classList.add('sessions-tour-card-centered');
				this.card.style.top = '50%';
				this.card.style.left = '50%';
				this.card.style.transform = 'translate(-50%, -50%)';
				break;
			}
		}
	}

	private _clampHorizontal(left: number, cardWidth: number, containerWidth: number): number {
		return Math.max(CARD_PADDING, Math.min(left, containerWidth - cardWidth - CARD_PADDING));
	}

	private _clampVertical(top: number, containerHeight: number): number {
		return Math.max(CARD_PADDING, Math.min(top, containerHeight - 280));
	}

	// ------------------------------------------------------------------
	// Finish

	private _finishTour(): void {
		this.overlay.classList.add('sessions-tour-dismissed');
		const handle = setTimeout(() => this.dispose(), 250);
		this._register(toDisposable(() => clearTimeout(handle)));
		this._resolveFinished();
	}
}
