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
	/** Part to spotlight. Undefined = no spotlight (full-screen scrim). */
	part?: Parts;
	/** Arrow direction on the floating card relative to the spotlight. */
	arrow?: 'up' | 'down' | 'left' | 'right';
	/** Whether this step waits for user to send a chat message before auto-advancing. */
	interactive?: boolean;
}

const CARD_PADDING = 16; // gap between spotlight rect and card edge

/**
 * Spotlight-style interactive product tour for the Sessions window.
 *
 * Steps:
 *  1. Introduction – centered card, no spotlight
 *  2. Chat Bar – spotlight on the chat bar input
 *  3. Sidebar – spotlight on the sessions sidebar
 *  4. Changes panel – spotlight on the auxiliary bar
 *  5. Send your first message – interactive; auto-advances when user sends a prompt
 */
export class SessionsTourOverlay extends Disposable {

	private readonly overlay: HTMLElement;
	private readonly spotlight: HTMLElement;
	private readonly card: HTMLElement;

	private currentStep = 0;
	private readonly stepStore = this._register(new MutableDisposable<DisposableStore>());

	private _resolveFinished!: () => void;
	/** Resolves when the tour is finished or dismissed. */
	readonly finished: Promise<void> = new Promise(resolve => { this._resolveFinished = resolve; });

	private readonly steps: ITourStepConfig[] = [
		{
			title: localize('tour.step1.title', "Welcome to Sessions"),
			body: localize('tour.step1.body', "This quick tour will show you the key parts of the Sessions window. You can skip at any time."),
		},
		{
			title: localize('tour.step2.title', "The Chat Bar"),
			body: localize('tour.step2.body', "This is your main interface. Type a question, generate code, or run a task — all through natural language."),
			part: Parts.CHATBAR_PART,
			arrow: 'down',
		},
		{
			title: localize('tour.step3.title', "Your Sessions"),
			body: localize('tour.step3.body', "The sidebar lists all your active sessions. Create new ones, switch between them, or archive completed work."),
			part: Parts.SIDEBAR_PART,
			arrow: 'right',
		},
		{
			title: localize('tour.step4.title', "Review Changes"),
			body: localize('tour.step4.body', "The Changes panel shows every file your agent has modified. Review diffs and approve or discard before merging."),
			part: Parts.AUXILIARYBAR_PART,
			arrow: 'left',
		},
		{
			title: localize('tour.step5.title', "Send Your First Message"),
			body: localize('tour.step5.body', "Now it's your turn! Type anything in the Chat Bar below and press Enter to start your first session."),
			part: Parts.CHATBAR_PART,
			arrow: 'down',
			interactive: true,
		},
	];

	constructor(
		private readonly container: HTMLElement,
		@IWorkbenchLayoutService private readonly layoutService: IWorkbenchLayoutService,
		@IChatService private readonly chatService: IChatService,
		@IContextKeyService private readonly contextKeyService: IContextKeyService,
	) {
		super();

		// Overlay container
		this.overlay = append(container, $('.sessions-tour-overlay'));
		this._register(toDisposable(() => this.overlay.remove()));

		// Set context key
		const tourVisibleKey = SessionsTourVisibleContext.bindTo(this.contextKeyService);
		tourVisibleKey.set(true);
		this._register(toDisposable(() => tourVisibleKey.reset()));

		// Spotlight element
		this.spotlight = append(this.overlay, $('.sessions-tour-spotlight hidden'));

		// Floating card
		this.card = append(this.overlay, $('.sessions-tour-card sessions-tour-card-centered'));

		this._renderStep();
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

		clearNode(this.card);
		this.card.className = 'sessions-tour-card';

		// Header (title + close button)
		const header = append(this.card, $('.sessions-tour-card-header'));
		append(header, $('span.sessions-tour-card-title', undefined, step.title));
		const closeBtn = append(header, $('button.sessions-tour-close'));
		closeBtn.setAttribute('aria-label', localize('tour.close', "Close tour"));
		closeBtn.appendChild(renderIcon(Codicon.close));
		store.add(addDisposableListener(closeBtn, EventType.CLICK, () => this._finishTour()));

		// Body
		const bodyEl = append(this.card, $('div.sessions-tour-card-body'));
		if (step.interactive) {
			// Body text
			append(bodyEl, $('span', undefined, step.body));

			// Hint box
			const hint = append(bodyEl, $('div.sessions-tour-prompt-hint'));
			hint.style.marginTop = '10px';
			hint.appendChild(renderIcon(Codicon.send));
			append(hint, $('span', undefined, localize('tour.step5.hint', "Type anything and press Enter ↵")));

			// Wait for user to send a message
			const waiting = append(bodyEl, $('div.sessions-tour-waiting'));
			waiting.style.display = 'none';
			waiting.style.marginTop = '8px';
			waiting.appendChild(renderIcon(Codicon.loading));
			append(waiting, $('span', undefined, localize('tour.step5.waiting', "Waiting for your message…")));

			// Mark overlay as interactive so the spotlight passes pointer events
			this.overlay.classList.add('sessions-tour-interactive');

			store.add(this.chatService.onDidSubmitRequest(() => {
				waiting.style.display = 'flex';
				hint.style.display = 'none';
				// Short delay then close tour
				const handle = setTimeout(() => this._finishTour(), 1500);
				store.add(toDisposable(() => clearTimeout(handle)));
			}));
		} else {
			bodyEl.textContent = step.body;
		}

		// Progress + navigation row
		const progress = append(this.card, $('.sessions-tour-progress'));

		const dots = append(progress, $('.sessions-tour-progress-dots'));
		for (let i = 0; i < this.steps.length; i++) {
			const dot = append(dots, $('span.sessions-tour-progress-dot'));
			if (i === this.currentStep) {
				dot.classList.add('active');
			}
		}

		if (!step.interactive) {
			const nav = append(progress, $('.sessions-tour-nav'));

			if (this.currentStep > 0) {
				const prevBtn = store.add(new Button(nav, { ...defaultButtonStyles, secondary: true }));
				prevBtn.label = localize('tour.prev', "Back");
				store.add(prevBtn.onDidClick(() => { this.currentStep--; this._renderStep(); }));
			}

			const isLast = this.currentStep === this.steps.length - 1;
			const nextBtn = store.add(new Button(nav, { ...defaultButtonStyles }));
			nextBtn.label = isLast ? localize('tour.finish', "Finish") : localize('tour.next', "Next");
			store.add(nextBtn.onDidClick(() => {
				this.currentStep++;
				this._renderStep();
			}));
		}

		// Position spotlight and card
		this._positionForStep(step, store);
	}

	// ------------------------------------------------------------------
	// Spotlight + card positioning

	private _positionForStep(step: ITourStepConfig, store: DisposableStore): void {
		if (!step.part) {
			// No spotlight — full-screen scrim via CSS class
			this.overlay.classList.add('sessions-tour-no-spotlight');
			this.spotlight.classList.add('hidden');
			this.card.classList.add('sessions-tour-card-centered');
			return;
		}

		this.overlay.classList.remove('sessions-tour-no-spotlight');
		this.spotlight.classList.remove('hidden');
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

			// Spotlight
			this.spotlight.style.top = `${top}px`;
			this.spotlight.style.left = `${left}px`;
			this.spotlight.style.width = `${width}px`;
			this.spotlight.style.height = `${height}px`;

			// Card position based on arrow direction
			this._placeCard(step.arrow, top, left, width, height, containerRect);
		};

		place();

		// Reposition on window resize
		store.add(addDisposableListener(mainWindow, EventType.RESIZE, place));
	}

	private _placeCard(
		arrow: ITourStepConfig['arrow'],
		spotTop: number,
		spotLeft: number,
		spotWidth: number,
		spotHeight: number,
		containerRect: DOMRect,
	): void {
		const cardWidth = 340;
		const containerWidth = containerRect.width;
		const containerHeight = containerRect.height;

		// Remove previous arrow classes
		this.card.classList.remove('arrow-up', 'arrow-down', 'arrow-left', 'arrow-right');

		switch (arrow) {
			case 'down': {
				// Card sits above the spotlight
				const cardTop = Math.max(CARD_PADDING, spotTop - this.card.offsetHeight - CARD_PADDING);
				const cardLeft = Math.min(
					containerWidth - cardWidth - CARD_PADDING,
					Math.max(CARD_PADDING, spotLeft)
				);
				this.card.style.top = `${cardTop}px`;
				this.card.style.left = `${cardLeft}px`;
				this.card.style.bottom = '';
				this.card.style.right = '';
				this.card.style.transform = '';
				this.card.classList.add('arrow-down');
				break;
			}
			case 'up': {
				// Card sits below the spotlight
				const cardTop = spotTop + spotHeight + CARD_PADDING;
				const cardLeft = Math.min(
					containerWidth - cardWidth - CARD_PADDING,
					Math.max(CARD_PADDING, spotLeft)
				);
				this.card.style.top = `${cardTop}px`;
				this.card.style.left = `${cardLeft}px`;
				this.card.style.bottom = '';
				this.card.style.right = '';
				this.card.style.transform = '';
				this.card.classList.add('arrow-up');
				break;
			}
			case 'right': {
				// Card sits to the right of the spotlight
				const cardLeft = spotLeft + spotWidth + CARD_PADDING;
				const cardTop = Math.min(
					containerHeight - 200,
					Math.max(CARD_PADDING, spotTop + spotHeight / 2 - 100)
				);
				this.card.style.top = `${cardTop}px`;
				this.card.style.left = `${cardLeft}px`;
				this.card.style.bottom = '';
				this.card.style.right = '';
				this.card.style.transform = '';
				this.card.classList.add('arrow-left');
				break;
			}
			case 'left': {
				// Card sits to the left of the spotlight
				const cardRight = containerWidth - spotLeft + CARD_PADDING;
				const cardTop = Math.min(
					containerHeight - 200,
					Math.max(CARD_PADDING, spotTop + spotHeight / 2 - 100)
				);
				this.card.style.top = `${cardTop}px`;
				this.card.style.left = '';
				this.card.style.bottom = '';
				this.card.style.right = `${cardRight}px`;
				this.card.style.transform = '';
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

	// ------------------------------------------------------------------
	// Finish

	private _finishTour(): void {
		this.overlay.classList.add('sessions-tour-dismissed');
		const handle = setTimeout(() => this.dispose(), 250);
		this._register(toDisposable(() => clearTimeout(handle)));
		this._resolveFinished();
	}
}
