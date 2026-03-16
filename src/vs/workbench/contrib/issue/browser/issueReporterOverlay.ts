/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import './media/issueReporterOverlay.css';
import { $, addDisposableListener, append, EventType, getWindow } from '../../../../base/browser/dom.js';
import { renderIcon } from '../../../../base/browser/ui/iconLabel/iconLabels.js';
import { Codicon } from '../../../../base/common/codicons.js';
import { Emitter, Event } from '../../../../base/common/event.js';
import { DisposableStore, toDisposable } from '../../../../base/common/lifecycle.js';
import { localize } from '../../../../nls.js';
import { IWorkbenchLayoutService } from '../../../services/layout/browser/layoutService.js';
import { IssueReporterData, IssueType } from '../common/issue.js';
import { IssueReporterModel } from './issueReporterModel.js';
import { ScreenshotAnnotationEditor } from './screenshotAnnotation.js';

const MAX_SCREENSHOTS = 3;

const enum WizardStep {
	Describe = 0,
	Categorize = 1,
	Screenshots = 2,
	Review = 3,
}

const STEP_COUNT = 4;

export interface IScreenshot {
	readonly dataUrl: string;
	readonly width: number;
	readonly height: number;
	annotatedDataUrl?: string;
}

export class IssueReporterOverlay {

	private readonly disposables = new DisposableStore();
	private readonly _onDidClose = new Emitter<void>();
	readonly onDidClose: Event<void> = this._onDidClose.event;
	private readonly _onDidSubmit = new Emitter<{ title: string; body: string; shouldCreate: boolean; isPrivate: boolean }>();
	readonly onDidSubmit: Event<{ title: string; body: string; shouldCreate: boolean; isPrivate: boolean }> = this._onDidSubmit.event;
	private readonly _onDidRequestScreenshot = new Emitter<void>();
	readonly onDidRequestScreenshot: Event<void> = this._onDidRequestScreenshot.event;

	private wizardPanel!: HTMLElement;
	private stepContainer!: HTMLElement;
	private readonly stepPages: HTMLElement[] = [];

	// Step 1: Describe
	private descriptionTextarea!: HTMLTextAreaElement;

	// Step 2: Categorize
	private readonly issueTypeButtons: HTMLElement[] = [];
	private selectedIssueType: IssueType = IssueType.Bug;

	// Step 3: Screenshots
	private screenshotContainer!: HTMLElement;
	private screenshotDelay = 0;

	// Step 4: Review
	private titleInput!: HTMLInputElement;

	// Navigation
	private stepIndicator!: HTMLElement;
	private stepLabel!: HTMLElement;
	private backButton!: HTMLElement;
	private nextButton!: HTMLElement;
	private discardButton!: HTMLElement;

	// Progress dots
	private readonly progressDots: HTMLElement[] = [];

	private currentStep: WizardStep = WizardStep.Describe;
	private readonly screenshots: IScreenshot[] = [];
	private readonly model: IssueReporterModel;
	private visible = false;
	private animating = false;

	constructor(
		private readonly data: IssueReporterData,
		private readonly layoutService: IWorkbenchLayoutService,
	) {
		this.model = new IssueReporterModel({
			...data,
			issueType: data.issueType || IssueType.Bug,
			allExtensions: data.enabledExtensions,
		});
		this.selectedIssueType = data.issueType || IssueType.Bug;

		this.createWizard();
	}

	private createWizard(): void {
		this.wizardPanel = $('div.issue-reporter-wizard');
		this.wizardPanel.setAttribute('role', 'dialog');
		this.wizardPanel.setAttribute('aria-label', localize('reportIssue', "Report Issue"));

		// ── Toolbar (drag region + step indicator + discard) ──
		const toolbar = append(this.wizardPanel, $('div.wizard-toolbar'));

		// Progress indicator area
		const progressArea = append(toolbar, $('div.wizard-progress-area'));
		const progressDotsContainer = append(progressArea, $('div.wizard-progress-dots'));
		for (let i = 0; i < STEP_COUNT; i++) {
			const dot = append(progressDotsContainer, $('div.wizard-progress-dot'));
			this.progressDots.push(dot);
		}
		this.stepIndicator = append(progressArea, $('span.wizard-step-indicator'));
		this.stepLabel = append(progressArea, $('span.wizard-step-label'));

		append(toolbar, $('div.spacer'));

		this.discardButton = append(toolbar, $('div.wizard-discard'));
		this.discardButton.textContent = localize('discardFeedback', "Discard feedback");
		this.discardButton.setAttribute('role', 'button');
		this.discardButton.setAttribute('tabindex', '0');

		// ── Step content area ──
		this.stepContainer = append(this.wizardPanel, $('div.wizard-step-container'));
		this.createStep1Describe();
		this.createStep2Categorize();
		this.createStep3Screenshots();
		this.createStep4Review();

		// ── Bottom navigation ──
		const nav = append(this.wizardPanel, $('div.wizard-nav'));

		this.backButton = append(nav, $('div.wizard-nav-btn.wizard-back'));
		const backArrow = append(this.backButton, $('span'));
		backArrow.textContent = '\u2190'; // ←
		const backLabel = append(this.backButton, $('span'));
		backLabel.textContent = localize('back', "Back");
		this.backButton.setAttribute('role', 'button');
		this.backButton.setAttribute('tabindex', '0');

		append(nav, $('div.spacer'));

		this.nextButton = append(nav, $('div.wizard-nav-btn.wizard-next.primary'));
		const nextLabel = append(this.nextButton, $('span.wizard-next-label'));
		nextLabel.textContent = localize('next', "Next");
		const nextArrow = append(this.nextButton, $('span.wizard-next-arrow'));
		nextArrow.textContent = ' \u2192'; // →
		this.nextButton.setAttribute('role', 'button');
		this.nextButton.setAttribute('tabindex', '0');

		this.registerEventHandlers();
		this.updateStepUI();
	}

	// ── Step 1: Describe ──
	private createStep1Describe(): void {
		const page = append(this.stepContainer, $('div.wizard-step'));
		this.stepPages.push(page);

		const heading = append(page, $('h2.wizard-heading'));
		heading.textContent = localize('sendFeedback', "Send us your feedback");

		const subtitle = append(page, $('p.wizard-subtitle'));
		subtitle.textContent = localize('describeSubtitle', "Add a short description of what you encountered");

		this.descriptionTextarea = append(page, $('textarea.wizard-textarea')) as HTMLTextAreaElement;
		this.descriptionTextarea.placeholder = localize('descriptionPlaceholder', "Describe the issue. What did you expect, and what happened instead?");
		this.descriptionTextarea.rows = 5;
		if (this.data.issueBody) {
			this.descriptionTextarea.value = this.data.issueBody;
		}

		this.disposables.add(addDisposableListener(this.descriptionTextarea, EventType.INPUT, () => {
			this.descriptionTextarea.classList.remove('invalid-input');
		}));
	}

	// ── Step 2: Categorize ──
	private createStep2Categorize(): void {
		const page = append(this.stepContainer, $('div.wizard-step'));
		this.stepPages.push(page);

		const heading = append(page, $('h2.wizard-heading'));
		heading.textContent = localize('categorize', "What kind of feedback is this?");

		const subtitle = append(page, $('p.wizard-subtitle'));
		subtitle.textContent = localize('categorizeSubtitle', "Selecting the right category helps us identify and route your feedback to the correct team");

		const buttonGroup = append(page, $('div.wizard-type-buttons'));
		const types = [
			{ type: IssueType.Bug, label: localize('bug', "Bug"), icon: Codicon.bug },
			{ type: IssueType.FeatureRequest, label: localize('featureRequest', "Feature Request"), icon: Codicon.lightbulb },
			{ type: IssueType.PerformanceIssue, label: localize('performanceIssue', "Performance Issue"), icon: Codicon.dashboard },
		];

		for (const { type, label, icon } of types) {
			const btn = append(buttonGroup, $('div.wizard-type-btn'));
			btn.setAttribute('role', 'button');
			btn.setAttribute('tabindex', '0');
			btn.setAttribute('data-type', String(type));

			const iconEl = append(btn, $('span.wizard-type-icon'));
			iconEl.appendChild(renderIcon(icon));
			const labelEl = append(btn, $('span'));
			labelEl.textContent = label;

			if (type === this.selectedIssueType) {
				btn.classList.add('selected');
			}

			this.issueTypeButtons.push(btn);

			this.disposables.add(addDisposableListener(btn, EventType.CLICK, () => {
				this.selectedIssueType = type;
				this.model.update({ issueType: type });
				for (const b of this.issueTypeButtons) {
					b.classList.toggle('selected', b.getAttribute('data-type') === String(type));
				}
			}));

			this.disposables.add(addDisposableListener(btn, EventType.KEY_DOWN, (e: KeyboardEvent) => {
				if (e.key === 'Enter' || e.key === ' ') {
					e.preventDefault();
					btn.click();
				}
			}));
		}
	}

	// ── Step 3: Screenshots ──
	private createStep3Screenshots(): void {
		const page = append(this.stepContainer, $('div.wizard-step'));
		this.stepPages.push(page);

		const heading = append(page, $('h2.wizard-heading'));
		heading.textContent = localize('screenshotsHeading', "Add screenshots for better context?");

		const subtitle = append(page, $('p.wizard-subtitle'));
		subtitle.textContent = localize('screenshotsSubtitle', "You'll be able to navigate VS Code and choose when to take a screenshot");

		this.screenshotContainer = append(page, $('div.wizard-screenshots'));

		const actions = append(page, $('div.wizard-screenshot-actions'));

		// Delay dropdown
		const delayGroup = append(actions, $('div.wizard-delay-group'));
		const delaySelectLabel = append(delayGroup, $('label.wizard-delay-label'));
		delaySelectLabel.textContent = localize('delayLabel', "Capture delay:");
		const delaySelect = append(delayGroup, $('select.wizard-delay-select')) as HTMLSelectElement;
		const delayOptions = [
			{ label: localize('noDelay', "No delay"), value: 0 },
			{ label: localize('threeSeconds', "3 seconds"), value: 3 },
			{ label: localize('fiveSeconds', "5 seconds"), value: 5 },
			{ label: localize('tenSeconds', "10 seconds"), value: 10 },
		];
		for (const opt of delayOptions) {
			const option = delaySelect.ownerDocument.createElement('option');
			option.value = String(opt.value);
			option.textContent = opt.label;
			delaySelect.appendChild(option);
		}
		this.disposables.add(addDisposableListener(delaySelect, EventType.CHANGE, () => {
			this.screenshotDelay = parseInt(delaySelect.value);
		}));

		const captureBtn = append(actions, $('div.wizard-nav-btn.wizard-capture-btn.primary'));
		captureBtn.setAttribute('role', 'button');
		captureBtn.setAttribute('tabindex', '0');
		const cameraIcon = append(captureBtn, $('span.wizard-capture-icon'));
		cameraIcon.appendChild(renderIcon(Codicon.deviceCamera));
		const captureLabel = append(captureBtn, $('span.wizard-capture-label'));
		captureLabel.textContent = localize('addScreenshot', "Add screenshot");

		this.disposables.add(addDisposableListener(captureBtn, EventType.CLICK, () => {
			if (this.screenshots.length >= MAX_SCREENSHOTS) {
				return;
			}
			if (captureBtn.classList.contains('disabled')) {
				return;
			}
			if (this.screenshotDelay > 0) {
				captureBtn.classList.add('disabled');
				const origText = captureLabel.textContent;
				let remaining = this.screenshotDelay;
				captureLabel.textContent = `${remaining}...`;
				const interval = setInterval(() => {
					remaining--;
					if (remaining > 0) {
						captureLabel.textContent = `${remaining}...`;
					} else {
						clearInterval(interval);
						captureLabel.textContent = origText;
						captureBtn.classList.remove('disabled');
						this._onDidRequestScreenshot.fire();
					}
				}, 1000);
			} else {
				this._onDidRequestScreenshot.fire();
			}
		}));
	}

	// ── Step 4: Review & Submit ──
	private createStep4Review(): void {
		const page = append(this.stepContainer, $('div.wizard-step'));
		this.stepPages.push(page);

		const heading = append(page, $('h2.wizard-heading'));
		heading.textContent = localize('reviewSubmit', "Review and submit");

		const subtitle = append(page, $('p.wizard-subtitle'));
		subtitle.textContent = localize('reviewSubtitle', "Please review all info before submission. You can navigate back to adjust your feedback any time.");

		// Title input
		const titleGroup = append(page, $('div.wizard-field'));
		const titleLabel = append(titleGroup, $('label.wizard-field-label'));
		titleLabel.textContent = localize('issueTitle', "Issue title");
		this.titleInput = append(titleGroup, $('input.wizard-title-input')) as HTMLInputElement;
		this.titleInput.type = 'text';
		this.titleInput.placeholder = localize('issueTitlePlaceholder', "Brief summary of the issue");
		if (this.data.issueTitle) {
			this.titleInput.value = this.data.issueTitle;
		}

		this.disposables.add(addDisposableListener(this.titleInput, EventType.INPUT, () => {
			this.titleInput.classList.remove('invalid-input');
		}));

		// Review details (filled dynamically)
		append(page, $('div.wizard-review-details'));
	}

	private registerEventHandlers(): void {
		// Discard
		this.disposables.add(addDisposableListener(this.discardButton, EventType.CLICK, () => this.close()));
		this.disposables.add(addDisposableListener(this.discardButton, EventType.KEY_DOWN, (e: KeyboardEvent) => {
			if (e.key === 'Enter' || e.key === ' ') {
				e.preventDefault();
				this.close();
			}
		}));

		// Back
		this.disposables.add(addDisposableListener(this.backButton, EventType.CLICK, () => this.goBack()));
		this.disposables.add(addDisposableListener(this.backButton, EventType.KEY_DOWN, (e: KeyboardEvent) => {
			if (e.key === 'Enter' || e.key === ' ') {
				e.preventDefault();
				this.goBack();
			}
		}));

		// Next
		this.disposables.add(addDisposableListener(this.nextButton, EventType.CLICK, () => this.goNext()));
		this.disposables.add(addDisposableListener(this.nextButton, EventType.KEY_DOWN, (e: KeyboardEvent) => {
			if (e.key === 'Enter' || e.key === ' ') {
				e.preventDefault();
				this.goNext();
			}
		}));

		// Escape to close
		this.disposables.add(addDisposableListener(this.wizardPanel, EventType.KEY_DOWN, (e: KeyboardEvent) => {
			if (e.key === 'Escape') {
				e.preventDefault();
				e.stopPropagation();
				this.close();
			}
		}));
	}

	private goBack(): void {
		if (this.currentStep > WizardStep.Describe) {
			this.setStep(this.currentStep - 1);
		}
	}

	private goNext(): void {
		if (this.currentStep === WizardStep.Describe) {
			const desc = this.descriptionTextarea.value.trim();
			if (!desc) {
				this.descriptionTextarea.classList.add('invalid-input');
				this.descriptionTextarea.focus();
				return;
			}
			this.descriptionTextarea.classList.remove('invalid-input');
			this.model.update({ issueDescription: desc });
		}

		if (this.currentStep === WizardStep.Review) {
			this.submit();
			return;
		}

		if (this.currentStep < WizardStep.Review) {
			this.setStep(this.currentStep + 1);
		}
	}

	private setStep(step: WizardStep): void {
		const oldStep = this.currentStep;
		this.currentStep = step;

		const direction = step > oldStep ? 1 : -1;
		const oldPage = this.stepPages[oldStep];
		const newPage = this.stepPages[step];

		oldPage.classList.add(direction > 0 ? 'slide-out-left' : 'slide-out-right');
		newPage.classList.remove('slide-out-left', 'slide-out-right', 'slide-in-left', 'slide-in-right');
		newPage.classList.add(direction > 0 ? 'slide-in-right' : 'slide-in-left');
		newPage.style.display = 'flex';

		setTimeout(() => {
			oldPage.style.display = 'none';
			oldPage.classList.remove('slide-out-left', 'slide-out-right');
			newPage.classList.remove('slide-in-left', 'slide-in-right');
		}, 250);

		this.updateStepUI();

		if (step === WizardStep.Describe) {
			this.descriptionTextarea.focus();
		} else if (step === WizardStep.Review) {
			this.updateReviewDetails();
			this.titleInput.focus();
		}
	}

	private updateStepUI(): void {
		const stepNum = this.currentStep + 1;
		this.stepIndicator.textContent = localize('stepOf', "Step {0} of {1}", stepNum, STEP_COUNT);

		const stepNames = [
			localize('composeMessage', "Compose message"),
			localize('labels', "Category"),
			localize('screenshots', "Screenshots"),
			localize('submit', "Submit"),
		];
		this.stepLabel.textContent = `| ${stepNames[this.currentStep]}`;

		// Update progress dots
		for (let i = 0; i < this.progressDots.length; i++) {
			this.progressDots[i].classList.toggle('active', i === this.currentStep);
			this.progressDots[i].classList.toggle('completed', i < this.currentStep);
		}

		// Show/hide pages
		for (let i = 0; i < this.stepPages.length; i++) {
			if (i === this.currentStep) {
				this.stepPages[i].style.display = 'flex';
			} else if (!this.stepPages[i].classList.contains('slide-out-left') && !this.stepPages[i].classList.contains('slide-out-right')) {
				this.stepPages[i].style.display = 'none';
			}
		}

		// Back button visibility
		this.backButton.style.display = this.currentStep === WizardStep.Describe ? 'none' : '';

		// Next button label
		const nextLabel = this.nextButton.querySelector('.wizard-next-label');
		const nextArrow = this.nextButton.querySelector('.wizard-next-arrow');
		if (this.currentStep === WizardStep.Review) {
			if (nextLabel) {
				nextLabel.textContent = this.data.githubAccessToken
					? localize('submitIssue', "Submit")
					: localize('previewOnGitHub', "Preview on GitHub");
			}
			if (nextArrow) {
				nextArrow.textContent = ' \u2713'; // ✓
			}
			this.nextButton.classList.add('submit');
		} else if (this.currentStep === WizardStep.Screenshots) {
			if (nextLabel) {
				nextLabel.textContent = this.screenshots.length === 0
					? localize('skip', "Skip")
					: localize('next', "Next");
			}
			if (nextArrow) {
				nextArrow.textContent = ' \u00BB'; // »
			}
			this.nextButton.classList.remove('submit');
		} else {
			if (nextLabel) {
				nextLabel.textContent = localize('next', "Next");
			}
			if (nextArrow) {
				nextArrow.textContent = ' \u2192'; // →
			}
			this.nextButton.classList.remove('submit');
		}
	}

	private updateReviewDetails(): void {
		const page = this.stepPages[WizardStep.Review];
		const details = page.querySelector('.wizard-review-details');
		if (!details) {
			return;
		}
		details.textContent = '';

		const descSection = append(details as HTMLElement, $('div.review-section'));
		const descLabel = append(descSection, $('div.review-label'));
		descLabel.textContent = localize('description', "Description");
		const descValue = append(descSection, $('div.review-value'));
		descValue.textContent = this.descriptionTextarea.value.trim() || localize('noDescription', "(no description)");

		const catSection = append(details as HTMLElement, $('div.review-section'));
		const catLabel = append(catSection, $('div.review-label'));
		catLabel.textContent = localize('category', "Category");
		const catValue = append(catSection, $('div.review-value'));
		const typeLabels: Record<number, string> = {
			[IssueType.Bug]: localize('bug', "Bug"),
			[IssueType.FeatureRequest]: localize('featureRequest', "Feature Request"),
			[IssueType.PerformanceIssue]: localize('performanceIssue', "Performance Issue"),
		};
		catValue.textContent = typeLabels[this.selectedIssueType] ?? localize('unknown', "Unknown");

		if (this.screenshots.length > 0) {
			const ssSection = append(details as HTMLElement, $('div.review-section'));
			const ssLabel = append(ssSection, $('div.review-label'));
			ssLabel.textContent = localize('screenshots', "Screenshots");
			const ssValue = append(ssSection, $('div.review-value'));
			ssValue.textContent = this.screenshots.length === 1
				? localize('oneScreenshot', "1 screenshot")
				: localize('nScreenshots', "{0} screenshots", this.screenshots.length);
		}
	}

	private submit(): void {
		const title = this.titleInput.value.trim();
		if (!title) {
			this.titleInput.classList.add('invalid-input');
			this.titleInput.focus();
			return;
		}

		const description = this.descriptionTextarea.value.trim();
		this.model.update({ issueDescription: description, issueTitle: title, issueType: this.selectedIssueType });

		const body = this.buildIssueBody();
		this._onDidSubmit.fire({
			title,
			body,
			shouldCreate: !!this.data.githubAccessToken,
			isPrivate: false,
		});
	}

	show(): void {
		if (this.visible) {
			return;
		}
		this.visible = true;

		const workbenchContainer = this.layoutService.mainContainer;
		const targetWindow = getWindow(workbenchContainer);
		const body = targetWindow.document.body;

		body.classList.add('issue-reporter-active');

		// Insert wizard panel BEFORE the workbench
		body.insertBefore(this.wizardPanel, workbenchContainer);

		// Animate open: panel starts collapsed, then expands
		this.animating = true;
		requestAnimationFrame(() => {
			this.wizardPanel.classList.add('open');
			this.layoutService.layout();

			const onTransitionEnd = () => {
				this.wizardPanel.removeEventListener('transitionend', onTransitionEnd);
				this.animating = false;
				this.layoutService.layout();
			};
			this.wizardPanel.addEventListener('transitionend', onTransitionEnd);
		});

		this.descriptionTextarea.focus();

		this.disposables.add(toDisposable(() => {
			this.wizardPanel.remove();
			body.classList.remove('issue-reporter-active');
			this.layoutService.layout();
			this.visible = false;
		}));
	}

	close(): void {
		if (!this.visible || this.animating) {
			return;
		}

		this.animating = true;
		this.wizardPanel.classList.remove('open');

		const onTransitionEnd = () => {
			this.wizardPanel.removeEventListener('transitionend', onTransitionEnd);
			this.wizardPanel.remove();
			const targetWindow = getWindow(this.layoutService.mainContainer);
			targetWindow.document.body.classList.remove('issue-reporter-active');
			this.layoutService.layout();
			this.visible = false;
			this.animating = false;
			this._onDidClose.fire();
		};
		this.wizardPanel.addEventListener('transitionend', onTransitionEnd);
		this.layoutService.layout();
	}

	addScreenshot(screenshot: IScreenshot): void {
		if (this.screenshots.length >= MAX_SCREENSHOTS) {
			return;
		}
		this.screenshots.push(screenshot);
		this.updateScreenshotThumbnails();
		this.updateStepUI();
	}

	private updateScreenshotThumbnails(): void {
		this.screenshotContainer.textContent = '';

		if (this.screenshots.length === 0) {
			const empty = append(this.screenshotContainer, $('div.wizard-screenshots-empty'));
			empty.textContent = localize('noScreenshots', "No screenshots added yet");
			return;
		}

		for (let i = 0; i < this.screenshots.length; i++) {
			const screenshot = this.screenshots[i];
			const card = append(this.screenshotContainer, $('div.wizard-screenshot-card'));

			const img = append(card, $('img')) as HTMLImageElement;
			img.src = screenshot.annotatedDataUrl ?? screenshot.dataUrl;
			img.alt = localize('screenshotAlt', "Screenshot {0}", i + 1);

			this.disposables.add(addDisposableListener(card, EventType.CLICK, () => {
				this.openAnnotationEditor(i);
			}));

			const deleteBtn = append(card, $('div.wizard-screenshot-delete'));
			deleteBtn.setAttribute('role', 'button');
			deleteBtn.setAttribute('aria-label', localize('deleteScreenshot', "Delete screenshot"));
			deleteBtn.appendChild(renderIcon(Codicon.close));
			this.disposables.add(addDisposableListener(deleteBtn, EventType.CLICK, e => {
				e.stopPropagation();
				this.screenshots.splice(i, 1);
				this.updateScreenshotThumbnails();
				this.updateStepUI();
			}));
		}

		if (this.screenshots.length < MAX_SCREENSHOTS) {
			const addCard = append(this.screenshotContainer, $('div.wizard-screenshot-card.wizard-screenshot-add'));
			const plus = append(addCard, $('div.wizard-screenshot-plus'));
			plus.appendChild(renderIcon(Codicon.add));
			this.disposables.add(addDisposableListener(addCard, EventType.CLICK, () => {
				this._onDidRequestScreenshot.fire();
			}));
		}
	}

	private openAnnotationEditor(index: number): void {
		if (index < 0 || index >= this.screenshots.length) {
			return;
		}

		const screenshot = this.screenshots[index];
		const targetWindow = getWindow(this.wizardPanel);
		const editor = new ScreenshotAnnotationEditor(screenshot, targetWindow.document.body);

		editor.onDidSave(annotatedDataUrl => {
			screenshot.annotatedDataUrl = annotatedDataUrl;
			this.updateScreenshotThumbnails();
		});

		editor.onDidCancel(() => {
			// nothing to do, editor disposes itself
		});
	}

	getScreenshots(): readonly IScreenshot[] {
		return this.screenshots;
	}

	private buildIssueBody(): string {
		const description = this.descriptionTextarea.value;
		this.model.update({ issueDescription: description });

		let body = this.model.serialize();

		if (this.screenshots.length > 0) {
			body += '\n\n### Screenshots\n\n';
			for (let i = 0; i < this.screenshots.length; i++) {
				body += `<!-- Screenshot ${i + 1} will be uploaded -->\n`;
			}
		}

		return body;
	}

	isVisible(): boolean {
		return this.visible;
	}

	hideForCapture(): void {
		this.wizardPanel.style.visibility = 'hidden';
	}

	showAfterCapture(): void {
		this.wizardPanel.style.visibility = '';
	}

	dispose(): void {
		this.disposables.dispose();
		this._onDidClose.dispose();
		this._onDidSubmit.dispose();
		this._onDidRequestScreenshot.dispose();
	}
}
