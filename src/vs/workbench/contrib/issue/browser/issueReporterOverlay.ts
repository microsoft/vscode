/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import './media/issueReporterOverlay.css';
import { $, addDisposableListener, append, EventType, getWindow } from '../../../../base/browser/dom.js';
import { Button, unthemedButtonStyles } from '../../../../base/browser/ui/button/button.js';
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

	private overlayContainer!: HTMLElement;
	private titleInput!: HTMLInputElement;
	private descriptionTextarea!: HTMLTextAreaElement;
	private issueTypeSelect!: HTMLSelectElement;
	private issueSourceSelect!: HTMLSelectElement;
	private screenshotContainer!: HTMLElement;
	private screenshotButton!: Button;
	private submitButton!: Button;
	private cancelButton!: Button;

	private readonly screenshots: IScreenshot[] = [];
	private readonly model: IssueReporterModel;
	private visible = false;

	constructor(
		private readonly data: IssueReporterData,
		private readonly layoutService: IWorkbenchLayoutService,
	) {
		this.model = new IssueReporterModel({
			...data,
			issueType: data.issueType || IssueType.Bug,
			allExtensions: data.enabledExtensions,
		});

		this.createOverlay();
	}

	private createOverlay(): void {
		// Bottom sheet design — all UI at bottom, workbench stays 100% unblocked
		this.overlayContainer = $('div.issue-reporter-overlay');
		this.overlayContainer.setAttribute('role', 'dialog');
		this.overlayContainer.setAttribute('aria-label', localize('issueReporter', "Issue Reporter"));

		// Bottom sheet panel
		const sheet = append(this.overlayContainer, $('div.issue-reporter-sheet'));

		// Row 1: type, source, title, close
		const topRow = append(sheet, $('div.issue-reporter-row'));

		const titleLabel = append(topRow, $('span.issue-reporter-label'));
		titleLabel.textContent = localize('reportIssue', "Report Issue");

		this.issueTypeSelect = append(topRow, $('select')) as HTMLSelectElement;
		this.addOption(this.issueTypeSelect, localize('bugReport', "Bug Report"), String(IssueType.Bug));
		this.addOption(this.issueTypeSelect, localize('featureRequest', "Feature Request"), String(IssueType.FeatureRequest));
		this.addOption(this.issueTypeSelect, localize('performanceIssue', "Performance Issue"), String(IssueType.PerformanceIssue));
		if (this.data.issueType !== undefined) {
			this.issueTypeSelect.value = String(this.data.issueType);
		}

		this.issueSourceSelect = append(topRow, $('select')) as HTMLSelectElement;
		this.addOption(this.issueSourceSelect, localize('selectSource', "Source"), '');
		this.addOption(this.issueSourceSelect, localize('vscode', "VS Code"), 'vscode');
		this.addOption(this.issueSourceSelect, localize('extension', "Extension"), 'extension');
		this.addOption(this.issueSourceSelect, localize('marketplace', "Marketplace"), 'marketplace');

		this.titleInput = append(topRow, $('input.issue-title-input')) as HTMLInputElement;
		this.titleInput.type = 'text';
		this.titleInput.placeholder = localize('issueTitlePlaceholder', "Issue title");
		if (this.data.issueTitle) {
			this.titleInput.value = this.data.issueTitle;
		}

		const closeBtn = append(topRow, $('div.issue-close-btn'));
		closeBtn.setAttribute('role', 'button');
		closeBtn.setAttribute('aria-label', localize('close', "Close"));
		closeBtn.setAttribute('tabindex', '0');
		closeBtn.appendChild(renderIcon(Codicon.close));

		// Row 2: description
		this.descriptionTextarea = append(sheet, $('textarea.description-input')) as HTMLTextAreaElement;
		this.descriptionTextarea.placeholder = localize('descriptionPlaceholder', "Describe the issue. What did you expect, and what happened instead?");
		this.descriptionTextarea.rows = 3;
		if (this.data.issueBody) {
			this.descriptionTextarea.value = this.data.issueBody;
		}

		// Row 3: screenshots + actions
		const bottomRow = append(sheet, $('div.issue-reporter-row'));

		this.screenshotContainer = append(bottomRow, $('div.screenshot-thumbnails'));

		this.screenshotButton = this.disposables.add(new Button(bottomRow, unthemedButtonStyles));
		this.screenshotButton.label = localize('takeScreenshot', "Screenshot");

		// spacer
		append(bottomRow, $('div.spacer'));

		this.cancelButton = this.disposables.add(new Button(bottomRow, unthemedButtonStyles));
		this.cancelButton.label = localize('cancel', "Cancel");

		this.submitButton = this.disposables.add(new Button(bottomRow, unthemedButtonStyles));
		this.submitButton.label = this.data.githubAccessToken
			? localize('createOnGitHub', "Create on GitHub")
			: localize('previewOnGitHub', "Preview on GitHub");

		this.registerEventHandlers(closeBtn);
	}

	private addOption(select: HTMLSelectElement, label: string, value: string): void {
		const option = select.ownerDocument.createElement('option');
		option.value = value;
		option.textContent = label;
		select.appendChild(option);
	}

	private registerEventHandlers(closeBtn: HTMLElement): void {
		// Close button
		this.disposables.add(addDisposableListener(closeBtn, EventType.CLICK, () => this.close()));
		this.disposables.add(addDisposableListener(closeBtn, EventType.KEY_DOWN, (e: KeyboardEvent) => {
			if (e.key === 'Enter' || e.key === ' ') {
				e.preventDefault();
				this.close();
			}
		}));

		// Escape to close
		this.disposables.add(addDisposableListener(this.overlayContainer, EventType.KEY_DOWN, (e: KeyboardEvent) => {
			if (e.key === 'Escape') {
				e.preventDefault();
				e.stopPropagation();
				this.close();
			}
		}));

		// Issue type change
		this.disposables.add(addDisposableListener(this.issueTypeSelect, EventType.CHANGE, () => {
			this.model.update({ issueType: parseInt(this.issueTypeSelect.value) });
		}));

		// Issue source change
		this.disposables.add(addDisposableListener(this.issueSourceSelect, EventType.CHANGE, () => {
			const value = this.issueSourceSelect.value;
			this.model.update({
				fileOnExtension: value === 'extension',
				fileOnMarketplace: value === 'marketplace',
				fileOnProduct: value === 'vscode',
			});
		}));

		// Title input
		this.disposables.add(addDisposableListener(this.titleInput, EventType.INPUT, () => {
			this.model.update({ issueTitle: this.titleInput.value });
		}));

		// Description input
		this.disposables.add(addDisposableListener(this.descriptionTextarea, EventType.INPUT, () => {
			this.model.update({ issueDescription: this.descriptionTextarea.value });
		}));

		// Screenshot button
		this.disposables.add(this.screenshotButton.onDidClick(() => {
			if (this.screenshots.length < MAX_SCREENSHOTS) {
				this._onDidRequestScreenshot.fire();
			}
		}));

		// Cancel button
		this.disposables.add(this.cancelButton.onDidClick(() => this.close()));

		// Submit button
		this.disposables.add(this.submitButton.onDidClick(() => {
			const title = this.titleInput.value.trim();
			const body = this.buildIssueBody();
			if (!title) {
				this.titleInput.classList.add('invalid-input');
				this.titleInput.focus();
				return;
			}
			this._onDidSubmit.fire({
				title,
				body,
				shouldCreate: !!this.data.githubAccessToken,
				isPrivate: false,
			});
		}));
	}

	show(): void {
		if (this.visible) {
			return;
		}
		this.visible = true;

		const workbenchContainer = this.layoutService.mainContainer;
		const targetWindow = getWindow(workbenchContainer);
		// Append overlay to body — it's position:fixed so location doesn't matter
		targetWindow.document.body.appendChild(this.overlayContainer);

		// Trigger fade-in
		targetWindow.requestAnimationFrame(() => {
			this.overlayContainer.classList.add('visible');
		});

		this.titleInput.focus();

		// Cleanup on dispose
		this.disposables.add(toDisposable(() => {
			this.overlayContainer.classList.remove('visible');
			this.overlayContainer.remove();
			this.visible = false;
		}));
	}

	close(): void {
		if (!this.visible) {
			return;
		}

		// Animate out
		this.overlayContainer.classList.remove('visible');

		// Wait for transition to complete before removing
		const onTransitionEnd = () => {
			this.overlayContainer.removeEventListener('transitionend', onTransitionEnd);
			this.overlayContainer.remove();
			this.visible = false;
			this._onDidClose.fire();
		};
		this.overlayContainer.addEventListener('transitionend', onTransitionEnd);

		// Fallback in case transitionend doesn't fire
		setTimeout(onTransitionEnd, 400);
	}

	addScreenshot(screenshot: IScreenshot): void {
		if (this.screenshots.length >= MAX_SCREENSHOTS) {
			return;
		}
		this.screenshots.push(screenshot);
		this.updateScreenshotThumbnails();
		this.updateScreenshotButton();
	}

	private updateScreenshotThumbnails(): void {
		this.screenshotContainer.textContent = '';
		for (let i = 0; i < this.screenshots.length; i++) {
			const screenshot = this.screenshots[i];
			const thumb = append(this.screenshotContainer, $('div.screenshot-thumbnail'));
			thumb.title = localize('editScreenshot', "Click to annotate");

			const img = append(thumb, $('img')) as HTMLImageElement;
			img.src = screenshot.annotatedDataUrl ?? screenshot.dataUrl;
			img.alt = localize('screenshotAlt', "Screenshot {0}", i + 1);

			// Click thumbnail to open annotation editor
			thumb.addEventListener('click', () => {
				this.openAnnotationEditor(i);
			});

			const deleteBtn = append(thumb, $('div.screenshot-delete'));
			deleteBtn.setAttribute('role', 'button');
			deleteBtn.setAttribute('aria-label', localize('deleteScreenshot', "Delete screenshot"));
			deleteBtn.textContent = '\u00D7'; // ×
			deleteBtn.addEventListener('click', e => {
				e.stopPropagation();
				this.screenshots.splice(i, 1);
				this.updateScreenshotThumbnails();
				this.updateScreenshotButton();
			});
		}
	}

	private openAnnotationEditor(index: number): void {
		if (index < 0 || index >= this.screenshots.length) {
			return;
		}

		const screenshot = this.screenshots[index];

		const targetWindow = getWindow(this.overlayContainer);
		const editor = new ScreenshotAnnotationEditor(screenshot, targetWindow.document.body);

		editor.onDidSave(annotatedDataUrl => {
			screenshot.annotatedDataUrl = annotatedDataUrl;
			this.updateScreenshotThumbnails();
		});

		editor.onDidCancel(() => {
			// nothing to do, editor disposes itself
		});
	}

	private updateScreenshotButton(): void {
		this.screenshotButton.enabled = this.screenshots.length < MAX_SCREENSHOTS;
		if (this.screenshots.length >= MAX_SCREENSHOTS) {
			this.screenshotButton.element.title = localize('maxScreenshots', "Maximum of {0} screenshots reached", MAX_SCREENSHOTS);
		} else {
			this.screenshotButton.element.title = localize('takeScreenshotTooltip', "Capture a screenshot of the current state");
		}
	}

	getScreenshots(): readonly IScreenshot[] {
		return this.screenshots;
	}

	private buildIssueBody(): string {
		const description = this.descriptionTextarea.value;
		this.model.update({ issueDescription: description });

		let body = this.model.serialize();

		// Append screenshot placeholders
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

	/** Hide the overlay temporarily so screenshots only capture the workbench */
	hideForCapture(): void {
		this.overlayContainer.style.display = 'none';
	}

	/** Restore the overlay after screenshot capture */
	showAfterCapture(): void {
		this.overlayContainer.style.display = '';
	}

	dispose(): void {
		this.disposables.dispose();
		this._onDidClose.dispose();
		this._onDidSubmit.dispose();
		this._onDidRequestScreenshot.dispose();
	}
}
