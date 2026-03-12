/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Disposable, DisposableStore } from '../../../../base/common/lifecycle.js';
import { Emitter, Event } from '../../../../base/common/event.js';
import { $, append, addDisposableListener, EventType, getActiveWindow } from '../../../../base/browser/dom.js';
import { ILayoutService } from '../../../../platform/layout/browser/layoutService.js';
import { KeyCode } from '../../../../base/common/keyCodes.js';
import { StandardKeyboardEvent } from '../../../../base/browser/keyboardEvent.js';
import { localize } from '../../../../nls.js';
import { ICommandService } from '../../../../platform/commands/common/commands.js';

/**
 * Where to position the popover relative to the spotlight target.
 */
const enum PopoverPosition {
	Right = 'right',
	Left = 'left',
	Below = 'below',
	Above = 'above',
}

/**
 * A single step in the UI tour.
 */
interface ITourStep {
	/** CSS selector to find the target element, or 'viewport' for full-screen steps */
	readonly target: string;
	/** Title shown in the popover */
	readonly title: string;
	/** Description text */
	readonly description: string;
	/** Preferred popover position relative to the target */
	readonly position: PopoverPosition;
	/** Optional keyboard shortcut to display */
	readonly shortcut?: string;
	/** Optional command to execute when reaching this step (e.g. open a panel) */
	readonly command?: string;
	/** Padding around the spotlight in pixels */
	readonly padding?: number;
}

/**
 * The 10-step tour of the VS Code UI.
 */
const TOUR_STEPS: readonly ITourStep[] = [
	{
		target: 'viewport',
		title: localize('tour.welcome.title', "Welcome to Visual Studio Code"),
		description: localize('tour.welcome.desc', "Let's take a quick tour of your new editor. We'll walk through the key areas of the interface so you feel right at home."),
		position: PopoverPosition.Below,
	},
	{
		target: '.part.activitybar',
		title: localize('tour.activityBar.title', "Activity Bar"),
		description: localize('tour.activityBar.desc', "This is your navigation hub. Switch between Explorer, Search, Source Control, Debug, and Extensions. Each icon opens a different view in the sidebar."),
		position: PopoverPosition.Right,
	},
	{
		target: '.part.sidebar',
		title: localize('tour.sidebar.title', "Sidebar"),
		description: localize('tour.sidebar.desc', "The sidebar shows the content for the active view. Right now it is the Explorer — your file tree. You can drag and drop files, create folders, and manage your project here."),
		position: PopoverPosition.Right,
		command: 'workbench.view.explorer',
	},
	{
		target: '.part.editor',
		title: localize('tour.editor.title', "Editor Area"),
		description: localize('tour.editor.desc', "This is where you write code. Open multiple files in tabs, split the editor side by side, and use mini-map navigation on the right edge."),
		position: PopoverPosition.Left,
	},
	{
		target: '.part.titlebar',
		title: localize('tour.commandCenter.title', "Command Center"),
		description: localize('tour.commandCenter.desc', "Click here or press the shortcut to quickly search files, run commands, and navigate your workspace. It is the fastest way to do anything in VS Code."),
		position: PopoverPosition.Below,
		shortcut: '\u2318P',
	},
	{
		target: '.part.panel',
		title: localize('tour.panel.title', "Panel"),
		description: localize('tour.panel.desc', "The panel hosts the integrated terminal, output logs, problems list, and debug console. Toggle it anytime to see errors, run commands, or check build output."),
		position: PopoverPosition.Above,
		command: 'workbench.action.togglePanel',
		shortcut: '\u2318J',
	},
	{
		target: '.part.statusbar',
		title: localize('tour.statusBar.title', "Status Bar"),
		description: localize('tour.statusBar.desc', "The status bar shows context about your workspace — Git branch, language mode, encoding, line/column, and notifications. Click items to change settings."),
		position: PopoverPosition.Above,
	},
	{
		target: '.part.sidebar',
		title: localize('tour.extensions.title', "Extensions Marketplace"),
		description: localize('tour.extensions.desc', "Browse thousands of extensions to add languages, themes, debuggers, and tools. VS Code's extensions are what make it endlessly customizable."),
		position: PopoverPosition.Right,
		command: 'workbench.view.extensions',
		shortcut: '\u2318\u21E7X',
	},
	{
		target: '.part.sidebar',
		title: localize('tour.sourceControl.title', "Source Control"),
		description: localize('tour.sourceControl.desc', "Built-in Git support lets you stage changes, commit, push, pull, and resolve merge conflicts — all without leaving the editor."),
		position: PopoverPosition.Right,
		command: 'workbench.view.scm',
		shortcut: '\u2303\u21E7G',
	},
	{
		target: 'viewport',
		title: localize('tour.copilot.title', "Copilot & Agent Sessions"),
		description: localize('tour.copilot.desc', "AI is built right in. Ask Copilot questions, get code suggestions inline, and launch agent sessions that code in the background — locally or in the cloud. You are ready to go!"),
		position: PopoverPosition.Below,
	},
];

/**
 * Variation E — In-Context UI Tour
 *
 * A spotlight overlay that walks the user through the VS Code interface.
 * Each step highlights a part of the UI with a darkened backdrop and a
 * cutout, plus a popover with title, description, and navigation.
 *
 * Steps can trigger commands (e.g. open explorer, open extensions) so
 * the real UI is visible behind the spotlight.
 */
export class OnboardingVariationE extends Disposable {

	private readonly _onDidComplete = this._register(new Emitter<void>());
	readonly onDidComplete: Event<void> = this._onDidComplete.event;

	private backdrop: HTMLElement | undefined;
	private svgEl: SVGSVGElement | undefined;
	private popover: HTMLElement | undefined;
	private currentStep = 0;

	private readonly disposables = this._register(new DisposableStore());
	private readonly stepDisposables = this._register(new DisposableStore());

	constructor(
		@ILayoutService private readonly layoutService: ILayoutService,
		@ICommandService private readonly commandService: ICommandService,
	) {
		super();
	}

	show(): void {
		if (this.backdrop) {
			return;
		}

		const container = this.layoutService.activeContainer;

		// Backdrop with SVG mask
		this.backdrop = append(container, $('div.onboarding-e-backdrop'));

		// Create SVG for the spotlight mask
		const svg = getActiveWindow().document.createElementNS('http://www.w3.org/2000/svg', 'svg');
		this.svgEl = svg;
		this.backdrop.appendChild(svg);

		// Keyboard handler
		this.disposables.add(addDisposableListener(this.backdrop, EventType.KEY_DOWN, (e: KeyboardEvent) => {
			const event = new StandardKeyboardEvent(e);
			if (event.keyCode === KeyCode.Escape) {
				e.preventDefault();
				e.stopPropagation();
				this._dismiss();
			}
			if (event.keyCode === KeyCode.RightArrow || event.keyCode === KeyCode.Enter) {
				e.preventDefault();
				this._next();
			}
			if (event.keyCode === KeyCode.LeftArrow) {
				e.preventDefault();
				this._prev();
			}
		}));

		// Click on backdrop advances
		this.disposables.add(addDisposableListener(this.backdrop, EventType.CLICK, (e: MouseEvent) => {
			if (e.target === this.backdrop || e.target === this.svgEl) {
				this._next();
			}
		}));

		// Make backdrop focusable
		this.backdrop.setAttribute('tabindex', '0');
		this.backdrop.setAttribute('role', 'dialog');
		this.backdrop.setAttribute('aria-modal', 'true');
		this.backdrop.setAttribute('aria-label', localize('tour.aria', "VS Code UI Tour"));
		this.backdrop.focus();

		// Start
		this._renderStep();
	}

	private _next(): void {
		if (this.currentStep < TOUR_STEPS.length - 1) {
			this.currentStep++;
			this._renderStep();
		} else {
			this._dismiss();
		}
	}

	private _prev(): void {
		if (this.currentStep > 0) {
			this.currentStep--;
			this._renderStep();
		}
	}

	private async _renderStep(): Promise<void> {
		this.stepDisposables.clear();

		const step = TOUR_STEPS[this.currentStep];

		// Execute command if specified (open a panel/view)
		if (step.command) {
			try {
				await this.commandService.executeCommand(step.command);
			} catch {
				// Command may not exist, that's ok
			}
			// Small delay for UI to render
			await new Promise(resolve => setTimeout(resolve, 150));
		}

		// Find target element
		const targetRect = this._getTargetRect(step);

		// Update spotlight mask
		this._updateSpotlight(targetRect);

		// Show popover
		this._showPopover(step, targetRect);
	}

	private _getTargetRect(step: ITourStep): DOMRect {
		if (step.target === 'viewport') {
			const win = getActiveWindow();
			const w = win.innerWidth;
			const h = win.innerHeight;
			return new DOMRect(w / 2 - 200, h / 2 - 60, 400, 120);
		}

		// Find the target part by walking the DOM tree manually
		const container = this.layoutService.activeContainer;
		const partClasses = step.target.replace('.', '').split('.');

		const found = this._findElementWithClasses(container, partClasses, 3);
		if (found) {
			return found.getBoundingClientRect();
		}

		// Fallback: center of screen
		const win = getActiveWindow();
		return new DOMRect(win.innerWidth / 2 - 200, win.innerHeight / 2 - 60, 400, 120);
	}

	/**
	 * Recursively search for an element that has all the given CSS classes,
	 * up to a maximum depth to avoid deep traversals.
	 */
	private _findElementWithClasses(parent: Element, classes: string[], maxDepth: number): HTMLElement | undefined {
		if (maxDepth <= 0) {
			return undefined;
		}
		const children = parent.children;
		for (let i = 0; i < children.length; i++) {
			const el = children[i] as HTMLElement;
			if (classes.every(cls => el.classList.contains(cls))) {
				return el;
			}
			const found = this._findElementWithClasses(el, classes, maxDepth - 1);
			if (found) {
				return found;
			}
		}
		return undefined;
	}

	private _updateSpotlight(rect: DOMRect): void {
		if (!this.svgEl) {
			return;
		}

		const win = getActiveWindow();
		const w = win.innerWidth;
		const h = win.innerHeight;
		const pad = 6;
		const r = 8; // border radius for spotlight

		// Clear existing SVG content
		while (this.svgEl.firstChild) {
			this.svgEl.removeChild(this.svgEl.firstChild);
		}

		this.svgEl.setAttribute('viewBox', `0 0 ${w} ${h}`);
		this.svgEl.setAttribute('width', `${w}`);
		this.svgEl.setAttribute('height', `${h}`);

		const defs = getActiveWindow().document.createElementNS('http://www.w3.org/2000/svg', 'defs');
		const mask = getActiveWindow().document.createElementNS('http://www.w3.org/2000/svg', 'mask');
		mask.setAttribute('id', 'onboarding-e-mask');

		// White rect = visible (dark)
		const white = getActiveWindow().document.createElementNS('http://www.w3.org/2000/svg', 'rect');
		white.setAttribute('x', '0');
		white.setAttribute('y', '0');
		white.setAttribute('width', `${w}`);
		white.setAttribute('height', `${h}`);
		white.setAttribute('fill', 'white');

		// Black rect = cutout (transparent)
		const black = getActiveWindow().document.createElementNS('http://www.w3.org/2000/svg', 'rect');
		black.setAttribute('x', `${rect.x - pad}`);
		black.setAttribute('y', `${rect.y - pad}`);
		black.setAttribute('width', `${rect.width + pad * 2}`);
		black.setAttribute('height', `${rect.height + pad * 2}`);
		black.setAttribute('rx', `${r}`);
		black.setAttribute('ry', `${r}`);
		black.setAttribute('fill', 'black');

		mask.appendChild(white);
		mask.appendChild(black);
		defs.appendChild(mask);
		this.svgEl.appendChild(defs);

		// Dark overlay using the mask
		const overlay = getActiveWindow().document.createElementNS('http://www.w3.org/2000/svg', 'rect');
		overlay.setAttribute('x', '0');
		overlay.setAttribute('y', '0');
		overlay.setAttribute('width', `${w}`);
		overlay.setAttribute('height', `${h}`);
		overlay.setAttribute('fill', 'rgba(0,0,0,0.55)');
		overlay.setAttribute('mask', 'url(#onboarding-e-mask)');
		this.svgEl.appendChild(overlay);

		// Spotlight border (subtle ring around cutout)
		const ring = getActiveWindow().document.createElementNS('http://www.w3.org/2000/svg', 'rect');
		ring.setAttribute('x', `${rect.x - pad}`);
		ring.setAttribute('y', `${rect.y - pad}`);
		ring.setAttribute('width', `${rect.width + pad * 2}`);
		ring.setAttribute('height', `${rect.height + pad * 2}`);
		ring.setAttribute('rx', `${r}`);
		ring.setAttribute('ry', `${r}`);
		ring.setAttribute('fill', 'none');
		ring.setAttribute('stroke', 'rgba(255,255,255,0.15)');
		ring.setAttribute('stroke-width', '1');
		this.svgEl.appendChild(ring);
	}

	private _showPopover(step: ITourStep, targetRect: DOMRect): void {
		// Remove old popover
		if (this.popover) {
			this.popover.remove();
			this.popover = undefined;
		}

		const container = this.layoutService.activeContainer;
		const popover = append(container, $('div.onboarding-e-popover'));
		this.popover = popover;

		// Arrow
		const arrowClass = step.position === PopoverPosition.Right ? 'arrow-left'
			: step.position === PopoverPosition.Left ? 'arrow-right'
				: step.position === PopoverPosition.Below ? 'arrow-top'
					: 'arrow-bottom';
		append(popover, $(`div.onboarding-e-popover-arrow.${arrowClass}`));

		// Step indicator
		const stepLabel = append(popover, $('div.onboarding-e-popover-step'));
		stepLabel.textContent = localize('tour.stepOf', "Step {0} of {1}", this.currentStep + 1, TOUR_STEPS.length);

		// Title
		const title = append(popover, $('h3.onboarding-e-popover-title'));
		title.textContent = step.title;

		// Description
		const desc = append(popover, $('p.onboarding-e-popover-desc'));
		desc.textContent = step.description;

		// Shortcut badge
		if (step.shortcut) {
			const kbd = append(desc, $('span.onboarding-e-kbd'));
			kbd.textContent = step.shortcut;
		}

		// Footer
		const footer = append(popover, $('div.onboarding-e-popover-footer'));

		// Progress dots
		const progress = append(footer, $('div.onboarding-e-popover-progress'));
		for (let i = 0; i < TOUR_STEPS.length; i++) {
			const dot = append(progress, $('span.onboarding-e-popover-dot'));
			if (i === this.currentStep) {
				dot.classList.add('active');
			} else if (i < this.currentStep) {
				dot.classList.add('completed');
			}
		}

		// Buttons
		const buttons = append(footer, $('div.onboarding-e-popover-buttons'));

		if (this.currentStep > 0) {
			const backBtn = append(buttons, $<HTMLButtonElement>('button.onboarding-e-btn.onboarding-e-btn-secondary'));
			backBtn.type = 'button';
			backBtn.textContent = localize('tour.back', "Back");
			this.stepDisposables.add(addDisposableListener(backBtn, EventType.CLICK, () => this._prev()));
		} else {
			const skipBtn = append(buttons, $<HTMLButtonElement>('button.onboarding-e-btn.onboarding-e-btn-ghost'));
			skipBtn.type = 'button';
			skipBtn.textContent = localize('tour.skip', "Skip Tour");
			this.stepDisposables.add(addDisposableListener(skipBtn, EventType.CLICK, () => this._dismiss()));
		}

		const isLast = this.currentStep === TOUR_STEPS.length - 1;
		const nextBtn = append(buttons, $<HTMLButtonElement>('button.onboarding-e-btn.onboarding-e-btn-primary'));
		nextBtn.type = 'button';
		nextBtn.textContent = isLast
			? localize('tour.finish', "Start Coding")
			: localize('tour.next', "Next");
		this.stepDisposables.add(addDisposableListener(nextBtn, EventType.CLICK, () => {
			if (isLast) {
				this._dismiss();
			} else {
				this._next();
			}
		}));

		// Position popover relative to target
		this._positionPopover(popover, targetRect, step.position);

		// Focus next button
		nextBtn.focus();
	}

	private _positionPopover(popover: HTMLElement, targetRect: DOMRect, position: PopoverPosition): void {
		const win = getActiveWindow();
		const margin = 16;

		// Let the browser lay out the popover so we can get its size
		popover.style.visibility = 'hidden';
		popover.style.left = '0';
		popover.style.top = '0';

		getActiveWindow().requestAnimationFrame(() => {
			const popRect = popover.getBoundingClientRect();
			let x: number;
			let y: number;

			switch (position) {
				case PopoverPosition.Right:
					x = targetRect.right + margin;
					y = targetRect.top;
					break;
				case PopoverPosition.Left:
					x = targetRect.left - popRect.width - margin;
					y = targetRect.top;
					break;
				case PopoverPosition.Below:
					x = targetRect.left + targetRect.width / 2 - popRect.width / 2;
					y = targetRect.bottom + margin;
					break;
				case PopoverPosition.Above:
					x = targetRect.left + targetRect.width / 2 - popRect.width / 2;
					y = targetRect.top - popRect.height - margin;
					break;
			}

			// Clamp to viewport
			x = Math.max(margin, Math.min(x, win.innerWidth - popRect.width - margin));
			y = Math.max(margin, Math.min(y, win.innerHeight - popRect.height - margin));

			popover.style.left = `${x}px`;
			popover.style.top = `${y}px`;
			popover.style.visibility = 'visible';
		});
	}

	private _dismiss(): void {
		if (this.backdrop) {
			this.backdrop.remove();
			this.backdrop = undefined;
		}
		if (this.popover) {
			this.popover.remove();
			this.popover = undefined;
		}
		this.svgEl = undefined;
		this.disposables.clear();
		this.stepDisposables.clear();
		this.currentStep = 0;
		this._onDidComplete.fire();
	}

	override dispose(): void {
		this._dismiss();
		super.dispose();
	}
}
