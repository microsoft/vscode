/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { KeybindingLabel } from '../../../../base/browser/ui/keybindingLabel/keybindingLabel.js';
import { ResolvedKeybinding } from '../../../../base/common/keybindings.js';
import { OS } from '../../../../base/common/platform.js';
import './media/issueReporterOverlay.css';
import { $, addDisposableListener, append, disposableWindowInterval, EventType, getWindow } from '../../../../base/browser/dom.js';
import { StandardKeyboardEvent } from '../../../../base/browser/keyboardEvent.js';
import { Button } from '../../../../base/browser/ui/button/button.js';
import { IContextMenuProvider } from '../../../../base/browser/contextmenu.js';
import { renderIcon } from '../../../../base/browser/ui/iconLabel/iconLabels.js';
import { InputBox } from '../../../../base/browser/ui/inputbox/inputBox.js';
import { ISelectOptionItem, SelectBox } from '../../../../base/browser/ui/selectBox/selectBox.js';
import { Checkbox } from '../../../../base/browser/ui/toggle/toggle.js';
import { Action, Separator } from '../../../../base/common/actions.js';
import { Codicon } from '../../../../base/common/codicons.js';
import { Emitter, Event } from '../../../../base/common/event.js';
import { MarkdownString } from '../../../../base/common/htmlContent.js';
import { KeyCode } from '../../../../base/common/keyCodes.js';
import { DisposableStore, toDisposable } from '../../../../base/common/lifecycle.js';
import { localize } from '../../../../nls.js';
import { IMarkdownRendererService } from '../../../../platform/markdown/browser/markdownRenderer.js';
import { IContextViewService } from '../../../../platform/contextview/browser/contextView.js';
import { isRemoteDiagnosticError } from '../../../../platform/diagnostics/common/diagnostics.js';
import { defaultButtonStyles, defaultCheckboxStyles, defaultInputBoxStyles, defaultKeybindingLabelStyles, defaultSelectBoxStyles } from '../../../../platform/theme/browser/defaultStyles.js';
import product from '../../../../platform/product/common/product.js';
import { URI } from '../../../../base/common/uri.js';
import { normalizeGitHubUrl } from '../common/issueReporterUtil.js';
import { IssueReporterData, IssueReporterExtensionData, IssueSource, IssueType } from '../common/issue.js';
import { IssueReporterModel } from './issueReporterModel.js';
import { RecordingState } from './recordingService.js';
import { IAnnotationEditorState, ScreenshotAnnotationEditor } from './screenshotAnnotation.js';

const MAX_ATTACHMENTS = 5;
const MAX_SIMILAR_ISSUES = 5;

interface ISimilarIssue {
	readonly html_url: string;
	readonly title: string;
	readonly state?: string;
}

const enum WizardStep {
	Attachments = 0,
	Describe = 1,
	Review = 2,
}

const STEP_COUNT = 3;

export interface IScreenshot {
	readonly dataUrl: string;
	readonly width: number;
	readonly height: number;
	annotatedDataUrl?: string;
	annotationState?: IAnnotationEditorState;
}

export class IssueReporterOverlay {

	private readonly disposables = new DisposableStore();
	private readonly _onDidClose = new Emitter<void>();
	readonly onDidClose: Event<void> = this._onDidClose.event;
	private readonly _onDidSubmit = new Emitter<{ title: string; body: string }>();
	readonly onDidSubmit: Event<{ title: string; body: string }> = this._onDidSubmit.event;
	private readonly _onDidRequestScreenshot = new Emitter<void>();
	readonly onDidRequestScreenshot: Event<void> = this._onDidRequestScreenshot.event;
	private readonly _onDidRequestStartRecording = new Emitter<void>();
	readonly onDidRequestStartRecording: Event<void> = this._onDidRequestStartRecording.event;
	private readonly _onDidRequestStopRecording = new Emitter<void>();
	readonly onDidRequestStopRecording: Event<void> = this._onDidRequestStopRecording.event;
	private readonly _onDidRequestOpenRecording = new Emitter<string>();
	readonly onDidRequestOpenRecording: Event<string> = this._onDidRequestOpenRecording.event;
	private readonly _onDidRequestOpenScreenshot = new Emitter<IScreenshot>();
	readonly onDidRequestOpenScreenshot: Event<IScreenshot> = this._onDidRequestOpenScreenshot.event;

	private wizardPanel!: HTMLElement;
	private updateBanner!: HTMLElement;
	private stepContainer!: HTMLElement;
	private readonly stepPages: HTMLElement[] = [];

	// Step 1: Describe (category + description + title)
	private readonly issueTypeButtons: Button[] = [];
	private readonly issueSourceButtons: Button[] = [];
	private selectedIssueType: IssueType | undefined;
	private selectedIssueSource: IssueSource | undefined;
	private selectedExtension: IssueReporterExtensionData | undefined;
	private sourceButtonGroup!: HTMLElement;
	private sourceError!: HTMLElement;
	private targetStatus!: HTMLElement;
	private extensionField!: HTMLElement;
	private extensionSelect!: SelectBox;
	private extensionOptions: { label: string; value: string | undefined; hidden?: boolean }[] = [];
	private extensionError!: HTMLElement;
	private extensionStatus!: HTMLElement;
	private didAttemptDescribeSubmit = false;
	private similarIssuesContainer!: HTMLElement;
	private similarIssuesRequest = 0;
	private extensionDataRequest = 0;
	private similarIssuesHandle: ReturnType<typeof setTimeout> | undefined;
	private typeButtonGroup!: HTMLElement;
	private typeError!: HTMLElement;
	private descriptionTextarea!: HTMLTextAreaElement;
	private descriptionGuidance!: HTMLElement;
	private descriptionError!: HTMLElement;
	private titleInput!: InputBox;
	private titleError!: HTMLElement;
	private generateTitleBtn!: Button;
	private readonly _onDidRequestGenerateTitle = new Emitter<string>();
	readonly onDidRequestGenerateTitle: Event<string> = this._onDidRequestGenerateTitle.event;

	// Step 0: Screenshots & Recording
	private screenshotContainer!: HTMLElement;
	private screenshotDelay = 0;
	private recordingElapsedTimer: number | undefined;
	private recordingStartTime = 0;
	private currentRecordingState = RecordingState.Idle;
	private delayedScreenshotPending = false;
	private readonly recordings: { filePath: string; durationMs: number; thumbnailDataUrl?: string }[] = [];

	// Step 2: Review
	private reviewThumbCards: HTMLElement[] = [];
	private readonly reviewRenderDisposables = new DisposableStore();
	private readonly similarIssuesDisposables = new DisposableStore();
	private uploading = false;
	private includeSystemInfo = true;
	private includeProcessInfo = true;
	private includeWorkspaceInfo = true;
	private includeExtensions = true;
	private includeExperiments = true;
	private includeExtensionData = false;
	private diagnosticBulkToggleButton: Button | undefined;
	private diagnosticSectionStates: (() => boolean)[] = [];
	private performanceInfoLoaded = false;
	private performanceInfoRefreshing = false;

	// Navigation
	private stepIndicator!: HTMLElement;
	private stepLabel!: HTMLElement;
	private backButton!: Button;
	private nextButton!: Button;

	// Progress dots
	private readonly progressDots: HTMLElement[] = [];

	private currentStep: WizardStep = WizardStep.Attachments;
	private readonly screenshots: IScreenshot[] = [];
	private readonly model: IssueReporterModel;
	private visible = false;
	private floatingBar: HTMLElement | undefined;
	private previewOpened = false;
	private previewedDraftKey: string | undefined;
	private closeButton: Button | undefined;
	private _hideToolbarInScreenshots = true;

	constructor(
		private data: IssueReporterData,
		private readonly recordingSupported: boolean = false,
		private readonly container: HTMLElement,
		private readonly contextViewService: IContextViewService,
		private readonly contextMenuProvider?: IContextMenuProvider,
		private readonly markdownRendererService?: IMarkdownRendererService,
		initialHideToolbar: boolean = true,
		private readonly resolveExtensionIssueData?: (extensionId: string) => Promise<IssueReporterData | undefined>,
		private readonly openExternalLink?: (url: string) => Promise<void>,
		private showUpdateBanner = false,
		private readonly refreshPerformanceInfo?: () => Promise<void>,
		/** Returns the user's currently-bound keybinding for the given command id, or undefined when unbound. */
		private readonly resolveKeybinding?: (commandId: string) => ResolvedKeybinding | undefined,
	) {
		this._hideToolbarInScreenshots = initialHideToolbar;
		this.model = new IssueReporterModel({
			...data,
			issueType: data.issueType || IssueType.Bug,
			allExtensions: data.enabledExtensions,
			includeSystemInfo: true,
			includeWorkspaceInfo: true,
			includeProcessInfo: true,
			includeExtensions: true,
			includeExperiments: true,
			includeExtensionData: false,
		});
		this.selectedIssueType = data.issueType;
		this.selectedIssueSource = data.issueSource ?? (data.extensionId ? IssueSource.Extension : undefined);

		this.createWizard();
	}

	private createWizard(): void {
		this.wizardPanel = $('div.issue-reporter-wizard');
		this.wizardPanel.setAttribute('role', 'dialog');
		this.wizardPanel.setAttribute('aria-label', localize('reportIssue', "Report Issue"));
		this.wizardPanel.setAttribute('tabindex', '-1');

		// Toolbar (drag region + step indicator + discard)
		const toolbar = append(this.wizardPanel, $('div.wizard-toolbar'));

		// Progress indicator area
		const progressArea = append(toolbar, $('div.wizard-progress-area'));
		const progressDotsContainer = append(progressArea, $('div.wizard-progress-dots'));
		for (let i = 0; i < STEP_COUNT; i++) {
			const dot = append(progressDotsContainer, $('div.wizard-progress-dot'));
			this.progressDots.push(dot);
		}
		this.stepIndicator = append(progressArea, $('span.wizard-step-indicator'));
		append(progressArea, $('span.wizard-step-separator'));
		this.stepLabel = append(progressArea, $('span.wizard-step-label'));

		append(toolbar, $('div.wizard-toolbar-spacer'));

		this.updateBanner = append(this.wizardPanel, $('div.wizard-update-banner'));
		this.updateBanner.setAttribute('role', 'status');
		this.updateBanner.setAttribute('aria-live', 'polite');
		this.updateBanner.textContent = localize('updateAvailable', "A new version of {0} is available.", product.nameLong);
		this.setUpdateAvailable(this.showUpdateBanner);

		// Step content area
		this.stepContainer = append(this.wizardPanel, $('div.wizard-step-container'));
		this.createStep0Attachments();
		this.createStep1Describe();
		this.createStep2Review();

		// Bottom navigation
		const nav = append(this.wizardPanel, $('div.wizard-nav'));

		this.backButton = this.disposables.add(new Button(nav, { ...defaultButtonStyles, secondary: true }));
		this.backButton.label = localize('back', "Back");
		this.backButton.element.classList.add('wizard-back');
		this.backButton.element.title = localize('back', "Back");

		this.nextButton = this.disposables.add(new Button(nav, { ...defaultButtonStyles, supportIcons: true }));
		this.nextButton.label = localize('next', "Next");
		this.nextButton.element.classList.add('wizard-next');
		this.nextButton.element.title = localize('next', "Next");

		this.registerEventHandlers();
		if (this.data.extensionId) {
			void this.updateSelectedExtension(this.data.extensionId, false);
		}
		this.updateStepUI();
	}

	// Step 0: Attachments
	private createStep0Attachments(): void {
		const page = append(this.stepContainer, $('div.wizard-step'));
		this.stepPages.push(page);

		const heading = append(page, $('h2.wizard-heading'));
		heading.textContent = localize('screenshotsHeading', "Add attachments for better context");

		const subtitle = append(page, $('p.wizard-subtitle'));
		subtitle.textContent = localize('screenshotsSubtitle', "You can add up to {0} screenshots or videos. Navigate VS Code and choose when to capture.", MAX_ATTACHMENTS);

		const captureShortcut = this.resolveKeybinding?.('workbench.action.issueReporter.captureScreenshot');
		const recordShortcut = this.recordingSupported ? this.resolveKeybinding?.('workbench.action.issueReporter.toggleRecording') : undefined;
		if (captureShortcut || recordShortcut) {
			const targetDocument = getWindow(this.container).document;
			const hint = append(page, $('p.wizard-subtitle.wizard-shortcut-hint'));
			const intro = localize('shortcutHintIntro', "Use the floating capture bar, or press");
			hint.appendChild(targetDocument.createTextNode(`${intro} `));
			if (captureShortcut) {
				this.renderShortcutKeycap(hint, captureShortcut);
				hint.appendChild(targetDocument.createTextNode(` ${localize('toCapture', "to capture a screenshot")}`));
			}
			if (captureShortcut && recordShortcut) {
				hint.appendChild(targetDocument.createTextNode(` ${localize('or', "or")} `));
			}
			if (recordShortcut) {
				this.renderShortcutKeycap(hint, recordShortcut);
				hint.appendChild(targetDocument.createTextNode(` ${localize('toRecord', "to start or stop recording")}`));
			}
			hint.appendChild(targetDocument.createTextNode('.'));
		}

		this.screenshotContainer = append(page, $('div.wizard-screenshots'));
		this.updateScreenshotThumbnails();

		this.createFloatingCaptureBar();
	}

	private captureStripCaptureBtn: Button | undefined;
	private captureStripDelayBtn: Button | undefined;
	private captureStripRecordBtn: Button | undefined;

	private createFloatingCaptureBar(): void {
		const targetWindow = getWindow(this.container);
		// Mount inside .monaco-workbench so VS Code's color theme CSS vars
		// (--vscode-debugToolBar-background, etc.) cascade and the bar matches the
		// active theme. body is outside that scope and the vars wouldn't resolve.
		// eslint-disable-next-line no-restricted-syntax
		const workbench = targetWindow.document.querySelector('.monaco-workbench') as HTMLElement | null;
		const mountTarget = workbench ?? targetWindow.document.body;

		this.floatingBar = $('div.issue-reporter-floating-bar');

		// Drag handle
		const dragArea = append(this.floatingBar, $('div.wizard-floating-drag'));
		dragArea.appendChild(renderIcon(Codicon.gripper));

		// Segmented screenshot button: [Screenshot | options]
		const segmented = append(this.floatingBar, $('div.wizard-segmented-btn'));
		const floatingButtonStyles = this.getFloatingBarButtonStyles(targetWindow);

		const captureBtn = this.disposables.add(new Button(segmented, { ...floatingButtonStyles, supportIcons: true }));
		captureBtn.element.classList.add('wizard-segmented-main');
		captureBtn.label = `$(device-camera) ${localize('screenshot', "Screenshot")}`;
		this.captureStripCaptureBtn = captureBtn;

		// Delay/options dropdown using VS Code's context menu
		const delayOptions = this.getScreenshotDelayOptions();
		const delayDropdownButton = this.disposables.add(new Button(segmented, { ...floatingButtonStyles, supportIcons: true }));
		delayDropdownButton.element.classList.add('wizard-segmented-dropdown');
		delayDropdownButton.element.title = localize('captureOptions', "Capture options");
		delayDropdownButton.element.setAttribute('aria-label', localize('captureOptions', "Capture options"));
		delayDropdownButton.label = '$(chevron-down)';
		this.captureStripDelayBtn = delayDropdownButton;

		if (this.contextMenuProvider) {
			let menuOpen = false;
			this.disposables.add(delayDropdownButton.onDidClick(() => {
				if (!delayDropdownButton.enabled || menuOpen) {
					return;
				}
				// Hide-toolbar-in-screenshots toggle (first)
				const hideAction = new Action(
					'hide-toolbar',
					localize('hideToolbarInScreenshots', "Hide Toolbar in Screenshots"),
					undefined,
					true,
					async () => {
						this._hideToolbarInScreenshots = !this._hideToolbarInScreenshots;
					}
				);
				hideAction.checked = this._hideToolbarInScreenshots;

				const actions = delayOptions.map(opt => {
					const action = new Action(
						`delay-${opt.value}`,
						opt.label,
						undefined,
						true,
						async () => { this.screenshotDelay = opt.value; }
					);
					action.checked = opt.value === this.screenshotDelay;
					return action;
				});

				const allActions = [hideAction, new Separator(), ...actions];
				menuOpen = true;
				this.contextMenuProvider!.showContextMenu({
					getAnchor: () => this.floatingBar!,
					getActions: () => allActions,
					skipTelemetry: true,
					onHide: () => {
						menuOpen = false;
						hideAction.dispose();
						for (const a of actions) { a.dispose(); }
					},
				});
			}));

			// Close the delay menu when drag starts.
			// The drag handler calls e.preventDefault() on pointerdown which
			// suppresses the mousedown event that the context menu uses for
			// outside-click detection, so we dispatch a synthetic one.
			this.disposables.add(addDisposableListener(dragArea, EventType.POINTER_DOWN, () => {
				dragArea.dispatchEvent(new MouseEvent('mousedown', { bubbles: true }));
			}));
		}

		this.disposables.add(captureBtn.onDidClick(() => {
			if (this.getTotalAttachments() >= MAX_ATTACHMENTS || !captureBtn.enabled) {
				return;
			}
			if (this.screenshotDelay > 0) {
				// Lock width so button doesn't shrink during countdown
				captureBtn.element.style.minWidth = `${captureBtn.element.offsetWidth}px`;
				captureBtn.enabled = false;
				this.delayedScreenshotPending = true;
				this.updateScreenshotThumbnails();
				this.updateAttachmentButtons();
				let remaining = this.screenshotDelay;
				captureBtn.label = `${remaining}...`;
				const targetWindow = getWindow(this.container);
				const intervalDisposable = this.disposables.add(disposableWindowInterval(targetWindow, () => {
					remaining--;
					if (remaining > 0) {
						captureBtn.label = `${remaining}...`;
					} else {
						this.disposables.delete(intervalDisposable);
						captureBtn.label = `$(device-camera) ${localize('screenshot', "Screenshot")}`;
						captureBtn.element.style.minWidth = '';
						captureBtn.enabled = true;
						this.delayedScreenshotPending = false;
						this.updateScreenshotThumbnails();
						this.updateAttachmentButtons();
						this._onDidRequestScreenshot.fire();
					}
				}, 1000));
			} else {
				this._onDidRequestScreenshot.fire();
			}
		}));

		// Record button
		if (this.recordingSupported) {
			this.captureStripRecordBtn = this.disposables.add(new Button(this.floatingBar, { ...defaultButtonStyles, secondary: true, supportIcons: true }));
			this.captureStripRecordBtn.label = `$(record) ${localize('recordVideo', "Record video")}`;
			this.captureStripRecordBtn.element.classList.add('wizard-record-btn');
			this.disposables.add(this.captureStripRecordBtn.onDidClick(() => {
				if (this.currentRecordingState === RecordingState.Recording) {
					this._onDidRequestStopRecording.fire();
				} else if (this.currentRecordingState === RecordingState.Idle && this.getTotalAttachments() < MAX_ATTACHMENTS) {
					this._onDidRequestStartRecording.fire();
				}
			}));
		}

		mountTarget.appendChild(this.floatingBar);

		// Dragging (clamped to window bounds)
		let dragStartX = 0;
		let dragStartY = 0;
		let barStartX = 0;
		let barStartY = 0;

		const onPointerMove = (e: PointerEvent) => {
			const dx = e.clientX - dragStartX;
			const dy = e.clientY - dragStartY;
			const barW = this.floatingBar!.offsetWidth;
			const barH = this.floatingBar!.offsetHeight;
			const maxX = targetWindow.innerWidth - barW;
			const maxY = targetWindow.innerHeight - barH;
			const newX = Math.max(0, Math.min(barStartX + dx, maxX));
			const newY = Math.max(0, Math.min(barStartY + dy, maxY));
			this.floatingBar!.style.left = `${newX}px`;
			this.floatingBar!.style.top = `${newY}px`;
			this.floatingBar!.style.right = 'auto';
		};

		const onPointerUp = () => {
			dragArea.classList.remove('dragged');
			targetWindow.document.removeEventListener('pointermove', onPointerMove);
			targetWindow.document.removeEventListener('pointerup', onPointerUp);
		};

		this.disposables.add(addDisposableListener(dragArea, EventType.POINTER_DOWN, (e: PointerEvent) => {
			e.preventDefault();
			dragArea.classList.add('dragged');
			dragStartX = e.clientX;
			dragStartY = e.clientY;
			const rect = this.floatingBar!.getBoundingClientRect();
			barStartX = rect.left;
			barStartY = rect.top;
			targetWindow.document.addEventListener('pointermove', onPointerMove);
			targetWindow.document.addEventListener('pointerup', onPointerUp);
		}));

		// Keep the bar fully within the visible viewport when the window is
		// resized. Without this, narrowing the window can clip the bar off the
		// right edge — see screenshot in issue. The bar stays in its current
		// relative position; we only nudge it inward when it would otherwise
		// fall off-screen.
		const clampIntoView = () => {
			if (!this.floatingBar) {
				return;
			}
			const rect = this.floatingBar.getBoundingClientRect();
			const winW = targetWindow.innerWidth;
			const winH = targetWindow.innerHeight;
			const margin = 8;
			let needsClamp = false;
			let nextLeft = rect.left;
			let nextTop = rect.top;
			if (rect.right > winW - margin) {
				nextLeft = Math.max(margin, winW - margin - rect.width);
				needsClamp = true;
			}
			if (rect.left < margin) {
				nextLeft = margin;
				needsClamp = true;
			}
			if (rect.bottom > winH - margin) {
				nextTop = Math.max(margin, winH - margin - rect.height);
				needsClamp = true;
			}
			if (rect.top < margin) {
				nextTop = margin;
				needsClamp = true;
			}
			if (needsClamp) {
				this.floatingBar.style.left = `${nextLeft}px`;
				this.floatingBar.style.top = `${nextTop}px`;
				this.floatingBar.style.right = 'auto';
			}
		};
		this.disposables.add(addDisposableListener(targetWindow, 'resize', clampIntoView));

		this.disposables.add(toDisposable(() => {
			this.floatingBar?.remove();
		}));
	}

	private updateCaptureStripVisibility(): void {
		if (!this.floatingBar) {
			return;
		}
		// Show on all steps so the user can capture screenshots of the wizard itself
		this.floatingBar.style.display = '';
	}

	// Step 1: Describe (category + description + title)
	private createStep1Describe(): void {
		const page = append(this.stepContainer, $('div.wizard-step'));
		this.stepPages.push(page);

		const heading = append(page, $('h2.wizard-heading'));
		heading.textContent = localize('describeHeading', "Describe your feedback");

		// Issue source selection + extension dropdown share a row when both are visible
		const targetRow = append(page, $('div.wizard-target-row'));
		const sourceField = append(targetRow, $('div.wizard-field.wizard-source-field'));
		const sourceLabel = append(sourceField, $('label.wizard-field-label'));
		sourceLabel.textContent = localize('target', "Target");
		this.sourceButtonGroup = append(sourceField, $('div.wizard-type-buttons.wizard-source-buttons'));
		for (const option of this.getSourceOptions()) {
			const btn = this.disposables.add(new Button(this.sourceButtonGroup, { ...defaultButtonStyles, secondary: true }));
			btn.element.classList.add('wizard-type-btn', 'wizard-source-btn');
			btn.element.setAttribute('data-source', option.value);
			btn.element.setAttribute('aria-pressed', 'false');
			btn.label = option.label;
			this.issueSourceButtons.push(btn);
			this.disposables.add(btn.onDidClick(() => {
				this.setIssueSource(option.value);
				if (option.value === IssueSource.Extension && this.selectedExtension) {
					void this.updateSelectedExtension(this.selectedExtension.id);
				}
			}));
		}
		this.sourceError = this.createFieldError(sourceField, localize('targetRequired', "Select a target to continue."));
		this.targetStatus = append(sourceField, $('div.wizard-target-status'));

		this.extensionField = append(targetRow, $('div.wizard-field.wizard-extension-field'));
		const extensionLabel = append(this.extensionField, $('label.wizard-field-label'));
		extensionLabel.textContent = localize('extension', "Extension");
		const extensionSelectContainer = append(this.extensionField, $('div.wizard-extension-select'));
		this.extensionOptions = this.getExtensionOptions();
		this.extensionSelect = this.disposables.add(new SelectBox(
			this.getExtensionSelectItems(),
			this.getSelectedExtensionIndex(),
			this.contextViewService,
			defaultSelectBoxStyles,
			{ ariaLabel: localize('extension', "Extension"), useCustomDrawn: true, optionsAsChildren: true }
		));
		this.extensionSelect.render(extensionSelectContainer);
		this.disposables.add(this.extensionSelect.onDidSelect(e => {
			void this.updateSelectedExtension(this.extensionOptions[e.index]?.value);
		}));
		this.extensionError = this.createFieldError(this.extensionField, localize('extensionRequired', "Select an extension to continue."));
		this.extensionStatus = append(this.extensionField, $('div.wizard-extension-status'));
		this.updateExtensionOptions();
		this.updateExtensionFieldVisibility();
		this.updateIssueSourceButtons();

		// Category selection
		const catLabel = append(page, $('label.wizard-field-label'));
		catLabel.textContent = localize('feedbackCategory', "Category");

		this.typeButtonGroup = append(page, $('div.wizard-type-buttons'));
		const types = [
			{ type: IssueType.Bug, label: localize('bug', "Bug"), icon: Codicon.bug },
			{ type: IssueType.FeatureRequest, label: localize('featureRequest', "Feature Request"), icon: Codicon.lightbulb },
			{ type: IssueType.PerformanceIssue, label: localize('performanceIssue', "Performance Issue"), icon: Codicon.dashboard },
		];

		const selectType = (type: IssueType) => {
			this.selectedIssueType = type;
			this.model.update({ issueType: type });
			this.setFieldError(this.typeButtonGroup, this.typeError, false);
			for (const b of this.issueTypeButtons) {
				const isSelected = b.element.getAttribute('data-type') === String(type);
				b.element.classList.toggle('selected', isSelected);
				b.element.setAttribute('aria-pressed', String(isSelected));
			}
			this.updateDescriptionGuidance();
			this.updateIssueSourceButtons();
			if (this.currentStep === WizardStep.Review) {
				this.updateReviewDetails();
			}
			this.searchSimilarIssues();
		};

		for (const { type, label, icon } of types) {
			const btn = this.disposables.add(new Button(this.typeButtonGroup, { ...defaultButtonStyles, secondary: true, supportIcons: true }));
			btn.element.classList.add('wizard-type-btn');
			btn.element.setAttribute('data-type', String(type));
			btn.element.setAttribute('aria-pressed', 'false');
			btn.label = `$(${icon.id}) ${label}`;
			this.issueTypeButtons.push(btn);
			this.disposables.add(btn.onDidClick(() => selectType(type)));
		}
		this.typeError = this.createFieldError(page, localize('categoryRequired', "Select a category to continue."));

		// Title field with AI generate button next to label
		const titleGroup = append(page, $('div.wizard-field.wizard-title-field'));
		const titleLabelRow = append(titleGroup, $('div.wizard-title-label-row'));
		const titleLabel = append(titleLabelRow, $('label.wizard-field-label'));
		titleLabel.textContent = localize('issueTitle', "Title");

		const aiBtn = this.disposables.add(new Button(titleLabelRow, { ...defaultButtonStyles, secondary: true, supportIcons: true }));
		aiBtn.label = `$(sparkle) ${localize('generateTitleBtn', "Generate from description")}`;
		aiBtn.element.classList.add('wizard-ai-title-btn');
		aiBtn.element.title = localize('generateTitle', "Generate title from description");
		aiBtn.enabled = !!this.data.issueBody?.trim();
		this.disposables.add(aiBtn.onDidClick(() => {
			const desc = this.descriptionTextarea.value.trim();
			if (desc && !aiBtn.element.classList.contains('loading')) {
				// Lock width to prevent layout shift during loading
				aiBtn.element.style.minWidth = `${aiBtn.element.offsetWidth}px`;
				aiBtn.enabled = false;
				aiBtn.label = `$(loading~spin) ${localize('generatingTitle', "Generating...")}`;
				aiBtn.element.classList.add('loading');
				this._onDidRequestGenerateTitle.fire(desc);
			}
		}));
		this.generateTitleBtn = aiBtn;

		this.titleInput = this.disposables.add(new InputBox(titleGroup, undefined, {
			placeholder: localize('issueTitlePlaceholder', "Brief summary of the issue"),
			inputBoxStyles: defaultInputBoxStyles,
		}));
		this.updateTitlePlaceholder();
		if (this.data.issueTitle) {
			this.titleInput.value = this.data.issueTitle;
		}
		this.disposables.add(this.titleInput.onDidChange(() => {
			if (this.titleInput.value.trim()) {
				this.setFieldError(this.titleInput.element, this.titleError, false);
			}
			this.searchSimilarIssues();
		}));
		this.titleError = this.createFieldError(titleGroup, localize('titleRequired', "Enter a title to continue."));

		// Description field with guidance and auto-growing textarea
		const descriptionGroup = append(page, $('div.wizard-field'));
		const descLabel = append(descriptionGroup, $('label.wizard-field-label'));
		descLabel.textContent = localize('description', "Description");

		this.descriptionGuidance = append(descriptionGroup, $('p.wizard-subtitle.wizard-description-guidance'));
		this.updateDescriptionGuidance();

		this.descriptionTextarea = append(descriptionGroup, $('textarea.wizard-textarea')) as HTMLTextAreaElement;
		this.descriptionTextarea.placeholder = localize('descriptionPlaceholder', "Describe the issue in detail...");
		this.descriptionTextarea.rows = 6;
		if (this.data.issueBody) {
			this.descriptionTextarea.value = this.data.issueBody;
		}
		const autoGrowTextarea = () => {
			this.descriptionTextarea.style.height = '0';
			const newHeight = Math.max(this.descriptionTextarea.scrollHeight, 120);
			this.descriptionTextarea.style.height = `${newHeight}px`;
		};
		autoGrowTextarea();
		this.disposables.add(addDisposableListener(this.descriptionTextarea, EventType.INPUT, () => {
			if (this.descriptionTextarea.value.trim()) {
				this.setFieldError(this.descriptionTextarea, this.descriptionError, false);
			}
			autoGrowTextarea();
			this.searchSimilarIssues();
			this.updateGenerateTitleButtonState();
		}));
		this.descriptionError = this.createFieldError(descriptionGroup, localize('descriptionRequired', "Enter a description to continue."));

		this.updateIssueSourceFlags();
		this.updateTargetStatus();
	}

	private getSourceOptions(): { label: string; value: IssueSource }[] {
		const options: { label: string; value: IssueSource }[] = [
			{ label: product.nameLong || localize('vscode', "Visual Studio Code"), value: IssueSource.VSCode },
			{ label: localize('extensionSource', "A VS Code extension"), value: IssueSource.Extension },
			{ label: localize('marketplace', "Extensions Marketplace"), value: IssueSource.Marketplace },
		];
		return options;
	}

	private updateIssueSourceButtons(): void {
		const availableSources = new Set(this.getSourceOptions().map(option => option.value));
		if (this.selectedIssueSource && !availableSources.has(this.selectedIssueSource)) {
			this.selectedIssueSource = undefined;
			this.updateIssueSourceFlags();
			this.updateExtensionValidation();
		}

		for (const button of this.issueSourceButtons) {
			const source = button.element.getAttribute('data-source') as IssueSource;
			const isAvailable = availableSources.has(source);
			const isSelected = source === this.selectedIssueSource;
			button.element.classList.toggle('hidden', !isAvailable);
			button.element.classList.toggle('selected', isSelected);
			button.element.setAttribute('aria-pressed', String(isSelected));
		}

		this.updateExtensionFieldVisibility();
	}

	private setIssueSource(source: IssueSource | undefined): void {
		this.selectedIssueSource = source;
		this.setFieldError(this.sourceButtonGroup, this.sourceError, this.didAttemptDescribeSubmit && !source);
		this.updateIssueSourceFlags();
		this.updateIssueSourceButtons();
		this.updateExtensionValidation();
		this.updateTitlePlaceholder();
		this.updateTargetStatus();
		this.searchSimilarIssues();
	}

	private updateIssueSourceFlags(): void {
		const fileOnExtension = this.selectedIssueSource === IssueSource.Extension;
		const fileOnMarketplace = this.selectedIssueSource === IssueSource.Marketplace;
		const fileOnProduct = this.selectedIssueSource === IssueSource.VSCode || this.selectedIssueSource === IssueSource.Unknown;
		this.model.update({
			issueSource: this.selectedIssueSource,
			fileOnExtension,
			fileOnMarketplace,
			fileOnProduct,
			selectedExtension: this.selectedExtension,
		});
		this.data.issueSource = this.selectedIssueSource;
		// Preserve a preset `extensionId` while the extension list is still loading:
		// `selectedExtension` may be undefined here even though the caller asked
		// for a specific extension, and overwriting with `undefined` would prevent
		// the catch-up retry in `updateExtensionOptions` from re-resolving it.
		this.data.extensionId = fileOnExtension
			? (this.selectedExtension?.id ?? this.data.extensionId)
			: undefined;
	}

	private updateTitlePlaceholder(): void {
		switch (this.selectedIssueSource) {
			case IssueSource.Extension:
				this.titleInput.setPlaceHolder(localize('extensionPlaceholder', "E.g. Missing alt text on extension readme image"));
				break;
			case IssueSource.Marketplace:
				this.titleInput.setPlaceHolder(localize('marketplacePlaceholder', "E.g. Cannot disable installed extension"));
				break;
			case IssueSource.VSCode:
				this.titleInput.setPlaceHolder(localize('vscodePlaceholder', "E.g. Workbench is missing problems panel"));
				break;
			default:
				this.titleInput.setPlaceHolder(localize('issueTitlePlaceholder', "Brief summary of the issue"));
				break;
		}
	}

	private getExtensionOptions(): { label: string; value: string | undefined; hidden?: boolean }[] {
		const modelData = this.model.getData();
		const sourceExtensions = modelData.enabledNonThemeExtesions ?? modelData.allExtensions ?? [];
		const extensions = [...sourceExtensions]
			.filter(extension => !extension.isTheme && !extension.isBuiltin)
			.sort((a, b) => (a.displayName || a.name || a.id).localeCompare(b.displayName || b.name || b.id));
		return [
			{ label: localize('selectExtension', "Select extension"), value: undefined, hidden: true },
			...extensions.map(extension => ({ label: extension.displayName || extension.name || extension.id, value: extension.id })),
		];
	}

	private getExtensionSelectItems(): ISelectOptionItem[] {
		return this.extensionOptions.map(option => ({ text: option.label, isDisabled: option.hidden }));
	}

	private getSelectedExtensionIndex(): number {
		return Math.max(0, this.extensionOptions.findIndex(option => option.value === this.selectedExtension?.id || option.value === this.data.extensionId));
	}

	private updateExtensionOptions(): void {
		this.extensionOptions = this.getExtensionOptions();
		this.extensionSelect.setOptions(this.getExtensionSelectItems(), this.getSelectedExtensionIndex());
		if (!this.selectedExtension && this.data.extensionId) {
			void this.updateSelectedExtension(this.data.extensionId, false);
		}
	}

	private updateExtensionFieldVisibility(): void {
		this.extensionField.classList.toggle('hidden', this.selectedIssueSource !== IssueSource.Extension);
	}

	private updateExtensionValidation(): void {
		const hasExtension = this.selectedIssueSource !== IssueSource.Extension || !!this.selectedExtension;
		const hasExtensionIssueUrl = this.selectedIssueSource !== IssueSource.Extension || !this.selectedExtension || !!this.getSelectedExtensionIssueUrl();
		this.setFieldError(this.extensionField, this.extensionError, this.didAttemptDescribeSubmit && (!hasExtension || !hasExtensionIssueUrl));
	}

	private async updateSelectedExtension(extensionId: string | undefined, loadExtensionData = true): Promise<void> {
		const extension = extensionId
			? this.model.getData().allExtensions.find(candidate => candidate.id.toLowerCase() === extensionId.toLowerCase())
			: undefined;
		this.selectedExtension = extension;
		// Preserve the requested extensionId even when the extension list hasn't
		// been populated yet (typical wizard flow: the constructor runs before
		// `populateReporterDataAsync` finishes filling `allExtensions`). Without
		// this preservation, the later catch-up retry in `updateExtensionOptions`
		// sees `this.data.extensionId === undefined` and never re-resolves,
		// dropping any preset extension data with it.
		if (extensionId === undefined || extension) {
			this.data.extensionId = extension?.id;
		}
		this.extensionSelect.select(this.getSelectedExtensionIndex());
		this.updateExtensionValidation();
		this.updateIssueSourceFlags();

		if (!extension) {
			this.updateTargetStatus();
			this.searchSimilarIssues();
			return;
		}

		// Apply any preset extension data BEFORE the built-in source-switch below.
		// When the reporter is opened programmatically (e.g. via the
		// `workbench.action.openIssueReporter` command) with a preset `extensionId`
		// plus extension `data`/`uri`, propagate that data onto the selected
		// extension and the model so it shows up in the issue body. Doing this
		// before the built-in early-return is important: extensions bundled with
		// the dev build (Copilot, etc.) are flagged `isBuiltin`, which triggers
		// the source switch to VSCode and returns — otherwise the preset data
		// would be silently lost for every built-in caller. We guard on
		// `!this.includeExtensionData` (rather than `!extension.data`) because
		// `issueService` pre-populates `extension.data` on every enabled
		// extension, so that field is not a reliable "already applied" signal —
		// `includeExtensionData` is only flipped to `true` by
		// `applyExtensionIssueData`.
		const hasPresetData = !this.includeExtensionData && (this.data.data !== undefined || this.data.uri !== undefined || this.data.privateUri !== undefined);
		if (!loadExtensionData && hasPresetData) {
			this.applyExtensionIssueData(extension, this.data);
		}

		if (extension.isBuiltin && this.selectedIssueSource === IssueSource.Extension && !this.data.issueSource) {
			this.setIssueSource(IssueSource.VSCode);
			return;
		}

		if (loadExtensionData && this.resolveExtensionIssueData) {
			const request = ++this.extensionDataRequest;
			this.extensionStatus.textContent = localize('loadingExtensionData', "Loading extension issue data...");
			const issueData = await this.resolveExtensionIssueData(extension.id);
			if (request !== this.extensionDataRequest) {
				return;
			}
			if (issueData) {
				this.applyExtensionIssueData(extension, issueData);
			}
		}

		this.updateTargetStatus();
		this.searchSimilarIssues();
	}

	private applyExtensionIssueData(extension: IssueReporterExtensionData, issueData: IssueReporterData): void {
		extension.data = issueData.data;
		extension.uri = issueData.uri;
		extension.privateUri = issueData.privateUri;
		this.data.data = issueData.data;
		this.data.uri = issueData.uri;
		this.data.privateUri = issueData.privateUri;
		this.data.issueBody = issueData.issueBody ?? this.data.issueBody;
		this.data.issueTitle = issueData.issueTitle ?? this.data.issueTitle;
		if (issueData.issueTitle && !this.titleInput.value.trim()) {
			this.titleInput.value = issueData.issueTitle;
		}
		if (issueData.issueBody && !this.descriptionTextarea.value.includes(issueData.issueBody)) {
			this.descriptionTextarea.value = this.descriptionTextarea.value
				? `${this.descriptionTextarea.value}\n${issueData.issueBody}`
				: issueData.issueBody;
		}
		if (issueData.data) {
			extension.extensionData = issueData.data;
			this.model.update({ extensionData: issueData.data, includeExtensionData: true });
			this.includeExtensionData = true;
		}
	}

	private updateTargetStatus(): void {
		this.targetStatus.textContent = '';
		this.extensionStatus.textContent = '';
		if (!this.selectedIssueSource) {
			return;
		}

		if (this.selectedIssueSource !== IssueSource.Extension) {
			const repo = this.getIssueTargetRepo();
			this.targetStatus.textContent = repo
				? localize('issueTargetRepo', "Issue will be created in {0}/{1}.", repo.owner, repo.repositoryName)
				: '';
			return;
		}

		if (!this.selectedExtension) {
			return;
		}

		const issueUrl = this.getSelectedExtensionIssueUrl();
		if (!issueUrl) {
			this.extensionStatus.textContent = localize('extensionNoIssueUrl', "This extension does not provide an issue reporting URL.");
		} else if (!this.isGitHubUrl(issueUrl)) {
			this.extensionStatus.textContent = localize('extensionExternalIssueUrl', "This extension uses an external issue reporter. Preview will open that issue reporter.");
		} else {
			const repo = this.getIssueTargetRepo();
			this.extensionStatus.textContent = repo
				? localize('issueTargetRepo', "Issue will be created in {0}/{1}.", repo.owner, repo.repositoryName)
				: '';
		}
	}

	private getIssueTargetRepo(): { owner: string; repositoryName: string } | undefined {
		const targetUrl = this.getIssueTargetUrl();
		return targetUrl ? this.parseGitHubUrl(targetUrl) : undefined;
	}

	private getSelectedExtensionIssueUrl(): string | undefined {
		const extension = this.selectedExtension;
		if (!extension) {
			return undefined;
		}
		if (extension.uri) {
			return URI.revive(extension.uri).toString();
		}
		if (extension.bugsUrl && /^https?:\/\/github\.com\/([^\/]*)\/([^\/]*)\/?(\/issues)?\/?$/.test(extension.bugsUrl)) {
			return `${normalizeGitHubUrl(extension.bugsUrl)}/issues/new`;
		}
		if (extension.repositoryUrl && /^https?:\/\/github\.com\/([^\/]*)\/([^\/]*)\/?$/.test(extension.repositoryUrl)) {
			return `${normalizeGitHubUrl(extension.repositoryUrl)}/issues/new`;
		}
		return extension.bugsUrl || extension.repositoryUrl;
	}

	private getIssueSourceLabel(): string {
		switch (this.selectedIssueSource) {
			case IssueSource.VSCode:
				return product.nameLong || localize('vscode', "Visual Studio Code");
			case IssueSource.Extension:
				return this.selectedExtension?.displayName || this.selectedExtension?.name || localize('extensionSource', "A VS Code extension");
			case IssueSource.Marketplace:
				return localize('marketplace', "Extensions Marketplace");
			case IssueSource.Unknown:
				return localize('unknownSource', "Don't know");
			default:
				return localize('unknown', "Unknown");
		}
	}

	private getIssueTargetUrl(): string | undefined {
		if (this.selectedIssueSource === IssueSource.Extension) {
			return this.getSelectedExtensionIssueUrl();
		}
		if (this.selectedIssueSource === IssueSource.Marketplace) {
			return product.reportMarketplaceIssueUrl ?? product.reportIssueUrl;
		}
		if (this.data.uri) {
			return URI.revive(this.data.uri).toString();
		}
		if (this.data.privateUri) {
			return URI.revive(this.data.privateUri).toString();
		}
		return product.reportIssueUrl;
	}

	private isGitHubUrl(url: string): boolean {
		return /^https?:\/\/github\.com\//i.test(url);
	}

	private parseGitHubUrl(url: string): { owner: string; repositoryName: string } | undefined {
		const match = /^https?:\/\/github\.com\/([^\/?#]+)\/([^\/?#]+).*/i.exec(url);
		if (!match) {
			return undefined;
		}
		return { owner: match[1], repositoryName: match[2] };
	}

	private searchSimilarIssues(): void {
		if (this.currentStep !== WizardStep.Review || !this.similarIssuesContainer) {
			return;
		}
		if (this.similarIssuesHandle) {
			clearTimeout(this.similarIssuesHandle);
		}
		this.renderSimilarIssuesMessage(localize('searchingSimilarIssues', "Searching similar issues..."));
		this.similarIssuesHandle = setTimeout(() => this.doSearchSimilarIssues(), 300);
	}

	private async doSearchSimilarIssues(): Promise<void> {
		const title = this.titleInput.value.trim();
		const request = ++this.similarIssuesRequest;
		if (!title || !this.selectedIssueSource) {
			this.renderSimilarIssuesMessage(localize('similarIssuesNeedsTitle', "Enter a title to search for similar issues."));
			return;
		}

		this.renderSimilarIssuesMessage(localize('searchingSimilarIssues', "Searching similar issues..."));
		try {
			let results: ISimilarIssue[] = [];
			if (this.selectedIssueSource === IssueSource.Extension) {
				const extensionIssueUrl = this.getSelectedExtensionIssueUrl();
				const repo = extensionIssueUrl && this.parseGitHubUrl(extensionIssueUrl);
				results = repo ? await this.searchGitHubIssues(`${repo.owner}/${repo.repositoryName}`, title) : [];
			} else if (this.selectedIssueSource === IssueSource.Marketplace) {
				const marketplaceIssueUrl = product.reportMarketplaceIssueUrl ?? product.reportIssueUrl;
				const repo = marketplaceIssueUrl && this.parseGitHubUrl(marketplaceIssueUrl);
				results = repo ? await this.searchGitHubIssues(`${repo.owner}/${repo.repositoryName}`, title) : [];
			} else {
				results = await this.searchVSCodeSimilarIssues(title, this.descriptionTextarea.value.trim());
			}
			if (request === this.similarIssuesRequest) {
				this.renderSimilarIssues(results);
			}
		} catch {
			if (request === this.similarIssuesRequest) {
				this.renderSimilarIssuesMessage(localize('similarIssuesSearchFailed', "Unable to search for similar issues."));
			}
		}
	}

	private async searchGitHubIssues(repo: string, title: string): Promise<ISimilarIssue[]> {
		const query = `is:issue repo:${repo} ${title}`;
		const response = await fetch(`https://api.github.com/search/issues?q=${encodeURIComponent(query)}`);
		const result = await response.json();
		return Array.isArray(result?.items) ? result.items : [];
	}

	private async searchVSCodeDuplicates(title: string, body: string): Promise<ISimilarIssue[]> {
		const response = await fetch('https://vscode-probot.westus.cloudapp.azure.com:7890/duplicate_candidates', {
			method: 'POST',
			body: JSON.stringify({ title, body }),
			headers: new Headers({ 'Content-Type': 'application/json' }),
		});
		const result = await response.json();
		return Array.isArray(result?.candidates) ? result.candidates : [];
	}

	private async searchVSCodeSimilarIssues(title: string, body: string): Promise<ISimilarIssue[]> {
		try {
			const duplicates = await this.searchVSCodeDuplicates(title, body);
			if (duplicates.length) {
				return duplicates;
			}
		} catch {
			// Fall back to GitHub search below.
		}

		const repo = this.getIssueTargetRepo();
		return repo ? this.searchGitHubIssues(`${repo.owner}/${repo.repositoryName}`, title) : [];
	}

	private renderSimilarIssuesMessage(message: string): void {
		this.resetSimilarIssuesContainer();
		const status = append(this.similarIssuesContainer, $('div.wizard-similar-status'));
		status.textContent = message;
	}

	private renderSimilarIssues(results: ISimilarIssue[]): void {
		if (!results.length) {
			this.renderSimilarIssuesMessage(localize('noSimilarIssues', "No similar issues found."));
			return;
		}

		this.resetSimilarIssuesContainer();
		const list = append(this.similarIssuesContainer, $('ul.wizard-similar-list'));
		for (const issue of results.slice(0, MAX_SIMILAR_ISSUES)) {
			const item = append(list, $('li.wizard-similar-item'));
			const link = append(item, $('a.wizard-similar-link')) as HTMLAnchorElement;
			link.href = issue.html_url;
			link.textContent = issue.title;
			link.title = issue.title;
			this.similarIssuesDisposables.add(addDisposableListener(link, EventType.CLICK, e => {
				e.preventDefault();
				this.openExternalLink?.(issue.html_url);
			}));
			if (issue.state) {
				const state = append(item, $('span.wizard-similar-state'));
				state.textContent = issue.state;
			}
		}
	}

	/** Clear the similar-issues container and re-render the section heading. */
	private resetSimilarIssuesContainer(): void {
		this.similarIssuesDisposables.clear();
		this.similarIssuesContainer.textContent = '';
		const heading = append(this.similarIssuesContainer, $('div.wizard-similar-heading'));
		heading.textContent = localize('similarIssues', "Similar Issues");
	}

	/** Update the guidance text above the description based on selected category */
	private updateDescriptionGuidance(): void {
		const markdownHint = localize('markdownSupported', "Markdown formatting is supported.");
		switch (this.selectedIssueType) {
			case IssueType.Bug:
				this.descriptionGuidance.textContent = `${localize('bugGuidance',
					"Describe what happened, the steps to reproduce, what you expected, and what you observed instead.")}\n${markdownHint}`;
				break;
			case IssueType.FeatureRequest:
				this.descriptionGuidance.textContent = `${localize('featureGuidance',
					"Describe the feature you'd like to see, what problem it would solve, and any alternatives you've considered.")}\n${markdownHint}`;
				break;
			case IssueType.PerformanceIssue:
				this.descriptionGuidance.textContent = `${localize('perfGuidance',
					"Describe what is slow, when it happens, whether it's consistent or intermittent, and any patterns you've noticed.")}\n${markdownHint}`;
				break;
			default:
				this.descriptionGuidance.textContent = `${localize('defaultGuidance',
					"Select a category above, then describe your feedback in detail.")}\n${markdownHint}`;
				break;
		}
	}

	private hasDescriptionContent(): boolean {
		return !!this.descriptionTextarea.value.trim();
	}

	private updateGenerateTitleButtonState(): void {
		if (!this.generateTitleBtn || this.generateTitleBtn.element.classList.contains('loading')) {
			return;
		}
		this.generateTitleBtn.enabled = this.hasDescriptionContent();
	}

	private createFieldError(parent: HTMLElement, message: string): HTMLElement {
		const error = append(parent, $('div.wizard-field-error.hidden'));
		error.textContent = message;
		error.setAttribute('role', 'alert');
		return error;
	}

	private setFieldError(field: HTMLElement, error: HTMLElement, hasError: boolean): void {
		field.classList.toggle('invalid-input', hasError);
		error.classList.toggle('hidden', !hasError);
	}

	// Step 2: Review & Submit
	private createStep2Review(): void {
		const page = append(this.stepContainer, $('div.wizard-step.wizard-step-review'));
		this.stepPages.push(page);

		const heading = append(page, $('h2.wizard-heading'));
		heading.textContent = localize('reviewSubmit', "Review and submit");

		// Review details (filled dynamically) with compact horizontal layout
		append(page, $('div.wizard-review-details'));
	}

	private registerEventHandlers(): void {
		// Back
		this.disposables.add(this.backButton.onDidClick(() => this.goBack()));

		// Next
		this.disposables.add(this.nextButton.onDidClick(() => this.goNext()));
	}

	private goBack(): void {
		if (this.currentStep > WizardStep.Attachments) {
			this.setStep(this.currentStep - 1);
		}
	}

	private goNext(): void {
		if (this.currentStep === WizardStep.Describe) {
			this.didAttemptDescribeSubmit = true;
			const hasIssueSource = this.selectedIssueSource !== undefined;
			const hasExtension = this.selectedIssueSource !== IssueSource.Extension || !!this.selectedExtension;
			const hasExtensionIssueUrl = this.selectedIssueSource !== IssueSource.Extension || !this.selectedExtension || !!this.getSelectedExtensionIssueUrl();
			const hasIssueType = this.selectedIssueType !== undefined;
			const hasDescription = this.hasDescriptionContent();
			const title = this.titleInput.value.trim();

			this.setFieldError(this.sourceButtonGroup, this.sourceError, !hasIssueSource);
			this.setFieldError(this.extensionField, this.extensionError, !hasExtension || !hasExtensionIssueUrl);
			this.setFieldError(this.typeButtonGroup, this.typeError, !hasIssueType);
			this.setFieldError(this.descriptionTextarea, this.descriptionError, !hasDescription);
			this.setFieldError(this.titleInput.element, this.titleError, !title);

			if (!hasIssueSource || !hasExtension || !hasExtensionIssueUrl || !hasIssueType || !hasDescription || !title) {
				if (!hasIssueSource) {
					this.issueSourceButtons.find(button => !button.element.classList.contains('hidden'))?.element.focus();
				} else if (!hasExtension || !hasExtensionIssueUrl) {
					this.extensionSelect.focus();
				} else if (!hasIssueType) {
					this.issueTypeButtons[0]?.element.focus();
				} else if (!hasDescription) {
					this.descriptionTextarea.focus();
				} else {
					this.titleInput.focus();
				}
				return;
			}
			this.updateIssueSourceFlags();
			this.model.update({ issueDescription: this.descriptionTextarea.value.trim() });
		}

		if (this.currentStep === WizardStep.Review) {
			// Defensive: if user managed to invoke goNext while diagnostics are
			// still loading (e.g. via Cmd/Ctrl+Enter), block the submit. The
			// Preview button is also visually disabled in this state.
			if (this.selectedIssueType === IssueType.PerformanceIssue && (!this.performanceInfoLoaded || this.performanceInfoRefreshing)) {
				return;
			}
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

		const oldPage = this.stepPages[oldStep];
		const newPage = this.stepPages[step];

		// Immediate transition with no animation
		oldPage.style.display = 'none';
		newPage.style.display = 'flex';

		this.updateStepUI();

		if (step === WizardStep.Describe) {
			this.descriptionTextarea.focus();
		} else if (step === WizardStep.Review) {
			this.updateReviewDetails();
			this.searchSimilarIssues();
			this.wizardPanel.focus();
		} else {
			// Attachments: focus the panel so keyboard shortcuts work
			this.wizardPanel.focus();
		}
	}

	private updateStepUI(): void {
		const stepNum = this.currentStep + 1;
		this.stepIndicator.textContent = localize('stepOf', "Step {0} of {1}", stepNum, STEP_COUNT);

		const stepNames = [
			localize('screenshots', "Attachments"),
			localize('composeMessage', "Describe"),
			localize('submit', "Review"),
		];
		this.stepLabel.textContent = stepNames[this.currentStep];

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
		this.backButton.element.style.display = this.currentStep === WizardStep.Attachments ? 'none' : '';
		if (this.closeButton) {
			const currentDraftPreviewed = this.previewedDraftKey === this.getDraftKey();
			this.closeButton.element.style.display = this.previewOpened && currentDraftPreviewed && this.currentStep === WizardStep.Review ? '' : 'none';
		}

		// Next button label
		if (this.currentStep === WizardStep.Review) {
			const externalExtensionUrl = this.selectedIssueSource === IssueSource.Extension && this.getIssueTargetUrl() && !this.isGitHubUrl(this.getIssueTargetUrl()!);
			const waitingForData = this.selectedIssueType === IssueType.PerformanceIssue && (!this.performanceInfoLoaded || this.performanceInfoRefreshing);
			if (waitingForData) {
				this.nextButton.label = `$(loading~spin) ${localize('loadingDiagnostics', "Loading diagnostics...")}`;
				this.nextButton.element.title = localize('waitingForDiagnostics', "Waiting for performance diagnostics to finish loading");
				this.nextButton.enabled = false;
			} else {
				this.nextButton.label = externalExtensionUrl
					? localize('openExternalIssueReporter', "Open External Issue Reporter")
					: localize('previewOnGitHub', "Preview on GitHub");
				this.nextButton.element.title = this.nextButton.label;
				this.nextButton.enabled = true;
			}
		} else if (this.currentStep === WizardStep.Attachments) {
			this.nextButton.label = this.getTotalAttachments() === 0
				? localize('skip', "Skip")
				: localize('next', "Next");
			this.nextButton.element.title = this.nextButton.label;
		} else {
			this.nextButton.label = localize('next', "Next");
			this.nextButton.element.title = localize('next', "Next");
		}

		// Show/hide capture strip (only on attachments step)
		this.updateCaptureStripVisibility();
		// Reflect recording state on next button
		this.updateNextButtonForRecording();
	}

	private updateReviewDetails(): void {
		const page = this.stepPages[WizardStep.Review];
		// eslint-disable-next-line no-restricted-syntax
		const details = page.querySelector('.wizard-review-details');
		if (!details) {
			return;
		}
		this.reviewRenderDisposables.clear();
		details.textContent = '';

		const similarSection = append(details as HTMLElement, $('div.review-section.wizard-review-similar-section'));
		this.similarIssuesContainer = append(similarSection, $('div.wizard-similar-issues'));
		this.similarIssuesContainer.setAttribute('aria-live', 'polite');
		this.renderSimilarIssuesMessage(localize('searchingSimilarIssues', "Searching similar issues..."));

		const sourceSection = append(details as HTMLElement, $('div.review-section'));
		const sourceLabel = append(sourceSection, $('div.review-label'));
		sourceLabel.textContent = localize('target', "Target");
		const sourceValue = append(sourceSection, $('div.review-value'));
		sourceValue.textContent = this.getIssueSourceLabel();

		const catSection = append(details as HTMLElement, $('div.review-section'));
		const catLabel = append(catSection, $('div.review-label'));
		catLabel.textContent = localize('category', "Category");
		const catValue = append(catSection, $('div.review-value'));
		const typeLabels: Record<number, string> = {
			[IssueType.Bug]: localize('bug', "Bug"),
			[IssueType.FeatureRequest]: localize('featureRequest', "Feature Request"),
			[IssueType.PerformanceIssue]: localize('performanceIssue', "Performance Issue"),
		};
		catValue.textContent = (this.selectedIssueType !== undefined ? typeLabels[this.selectedIssueType] : undefined) ?? localize('unknown', "Unknown");

		const titleSection = append(details as HTMLElement, $('div.review-section'));
		const titleLabel = append(titleSection, $('div.review-label'));
		titleLabel.textContent = localize('issueTitle', "Title");
		const titleValue = append(titleSection, $('div.review-value'));
		titleValue.textContent = this.titleInput.value.trim() || localize('noTitle', "(no title)");

		const descSection = append(details as HTMLElement, $('div.review-section'));
		const descLabel = append(descSection, $('div.review-label'));
		descLabel.textContent = localize('description', "Description");
		const descValue = append(descSection, $('div.review-value.review-description'));
		const description = this.descriptionTextarea.value.trim();
		if (description && this.markdownRendererService) {
			const renderedMarkdown = this.markdownRendererService.render(
				new MarkdownString(description),
				{ markedOptions: { breaks: true } },
			);
			append(descValue, renderedMarkdown.element);
			this.reviewRenderDisposables.add(renderedMarkdown);
		} else {
			descValue.textContent = description || localize('noDescription', "(no description)");
		}

		// Attachments row with full-size clickable thumbnails
		const totalAttachments = this.screenshots.length + this.recordings.length;
		if (totalAttachments > 0) {
			const attachSection = append(details as HTMLElement, $('div.review-section'));
			const attachLabel = append(attachSection, $('div.review-label'));
			attachLabel.textContent = localize('attachments', "Attachments ({0})", totalAttachments);
			const thumbRow = append(attachSection, $('div.review-thumbnails'));
			this.reviewThumbCards = [];

			for (let i = 0; i < this.screenshots.length; i++) {
				const s = this.screenshots[i];
				const card = append(thumbRow, $('div.wizard-screenshot-card.review-attachment-card'));
				const img = append(card, $('img')) as HTMLImageElement;
				img.src = s.annotatedDataUrl ?? s.dataUrl;
				img.alt = localize('screenshotAlt', "Screenshot {0}", i + 1);

				// Progress overlay (hidden initially)
				const progressOverlay = append(card, $('div.review-progress-overlay'));
				append(progressOverlay, $('div.review-progress-ring'));

				this.disposables.add(addDisposableListener(card, EventType.CLICK, () => {
					if (!this.uploading) {
						this._onDidRequestOpenScreenshot.fire(s);
					}
				}));
				this.reviewThumbCards.push(card);
			}

			for (let i = 0; i < this.recordings.length; i++) {
				const rec = this.recordings[i];
				const card = this.renderRecordingCard(thumbRow, rec, i);
				card.classList.add('review-attachment-card');

				const progressOverlay = append(card, $('div.review-progress-overlay'));
				append(progressOverlay, $('div.review-progress-ring'));

				this.disposables.add(addDisposableListener(card, EventType.CLICK, () => {
					if (!this.uploading) {
						this._onDidRequestOpenRecording.fire(rec.filePath);
					}
				}));
				this.reviewThumbCards.push(card);
			}
		}

		// Diagnostic data sections with checkboxes and collapsible details
		const diagContainer = append(details as HTMLElement, $('div.review-diagnostics'));

		const modelData = this.model.getData();
		let diagnosticSectionCount = 0;
		const diagnosticSectionStates: (() => boolean)[] = [];
		this.diagnosticBulkToggleButton = undefined;
		this.diagnosticSectionStates = diagnosticSectionStates;

		// System Info
		if (modelData.versionInfo || modelData.systemInfo) {
			diagnosticSectionCount++;
			diagnosticSectionStates.push(() => this.includeSystemInfo);
			this.createDiagSection(diagContainer, {
				id: 'system-info',
				label: localize('systemInformation', "System Information"),
				checked: this.includeSystemInfo,
				onToggle: (checked) => {
					this.includeSystemInfo = checked;
					this.model.update({ includeSystemInfo: checked });
				},
				renderContent: (container) => {
					const sysTable = append(container, $('table.review-diag-table'));
					if (modelData.versionInfo) {
						this.addDiagRow(sysTable, 'VS Code', modelData.versionInfo.vscodeVersion);
						this.addDiagRow(sysTable, 'OS', modelData.versionInfo.os);
					}
					if (modelData.systemInfo) {
						this.addDiagRow(sysTable, 'CPUs', modelData.systemInfo.cpus ?? '');
						this.addDiagRow(sysTable, 'Memory', modelData.systemInfo.memory);
						this.addDiagRow(sysTable, 'VM', modelData.systemInfo.vmHint);
						this.addDiagRow(sysTable, 'Screen Reader', modelData.systemInfo.screenReader);
					}
					this.addDiagRow(sysTable, 'User Agent', navigator.userAgent);
					this.addDiagRow(sysTable, 'Installation pure', String(modelData.isInstallationPure ?? true));
					if (modelData.restrictedMode) {
						this.addDiagRow(sysTable, 'Mode', 'Restricted');
					}
				},
			});
		} else {
			const loading = append(diagContainer, $('div.review-diag-loading'));
			loading.textContent = localize('loadingSystemInfo', "Loading system information...");
		}

		if (modelData.extensionData) {
			// Match `buildIssueBody`, which only gates on `extensionData`. Gating
			// here on `fileOnExtension` as well would hide the section in the
			// review UI whenever the issue source was auto-switched away from
			// Extension (e.g. built-in extensions are filed against VS Code),
			// even though the extension data still ends up in the submitted body.
			diagnosticSectionCount++;
			diagnosticSectionStates.push(() => this.includeExtensionData);
			this.createDiagSection(diagContainer, {
				id: 'extension-data',
				label: localize('extensionData', "Extension Data"),
				checked: this.includeExtensionData,
				onToggle: (checked) => {
					this.includeExtensionData = checked;
					this.model.update({ includeExtensionData: checked });
				},
				renderContent: (container) => {
					const pre = append(container, $('pre.review-diag-pre'));
					pre.textContent = modelData.extensionData!;
				},
			});
		}

		// Extensions (non-theme only)
		const nonThemeExtensions = (modelData.allExtensions ?? []).filter(e => !e.isTheme && !e.isBuiltin);
		if (!modelData.fileOnExtension && !modelData.fileOnMarketplace && nonThemeExtensions.length > 0) {
			diagnosticSectionCount++;
			diagnosticSectionStates.push(() => this.includeExtensions);
			this.createDiagSection(diagContainer, {
				id: 'extensions',
				label: localize('extensions', "Extensions ({0})", nonThemeExtensions.length),
				checked: this.includeExtensions,
				onToggle: (checked) => {
					this.includeExtensions = checked;
					this.model.update({ includeExtensions: checked });
				},
				renderContent: (container) => {
					const extTable = append(container, $('table.review-diag-table.review-ext-table'));
					const header = append(extTable, $('tr'));
					for (const h of ['Name', 'Identifier', 'Author', 'Version']) {
						const th = append(header, $('th.review-ext-th'));
						th.textContent = h;
					}
					for (const ext of nonThemeExtensions) {
						const row = append(extTable, $('tr'));
						append(row, $('td')).textContent = ext.displayName || ext.name;
						append(row, $('td')).textContent = ext.id;
						append(row, $('td')).textContent = ext.publisher ?? '';
						append(row, $('td')).textContent = ext.version;
					}
				},
			});
		}

		// Experiments
		if (modelData.experimentInfo) {
			diagnosticSectionCount++;
			diagnosticSectionStates.push(() => this.includeExperiments);
			this.createDiagSection(diagContainer, {
				id: 'experiments',
				label: localize('abExperiments', "A/B Experiments"),
				checked: this.includeExperiments,
				onToggle: (checked) => {
					this.includeExperiments = checked;
					this.model.update({ includeExperiments: checked });
				},
				renderContent: (container) => {
					const pre = append(container, $('pre.review-diag-pre'));
					pre.textContent = modelData.experimentInfo!;
				},
			});
		}

		if (this.selectedIssueType === IssueType.PerformanceIssue && !modelData.fileOnMarketplace) {
			const performanceContainer = append(diagContainer, $('div.review-performance-data'));
			if (this.performanceInfoRefreshing) {
				performanceContainer.classList.add('refreshing');
			}
			const performanceTitleRow = append(performanceContainer, $('div.review-performance-title-row'));
			const performanceTitle = append(performanceTitleRow, $('div.review-performance-title'));
			performanceTitle.textContent = localize('additionalPerformanceData', "Additional Performance Data");
			if (this.refreshPerformanceInfo) {
				const refreshBtn = this.disposables.add(new Button(performanceTitleRow, { ...defaultButtonStyles, secondary: true, supportIcons: true }));
				refreshBtn.element.classList.add('review-performance-refresh');
				refreshBtn.label = `$(refresh) ${localize('refresh', "Refresh")}`;
				refreshBtn.element.title = localize('refreshPerformanceData', "Reload running processes and workspace metadata");
				refreshBtn.enabled = !this.performanceInfoRefreshing;
				this.disposables.add(refreshBtn.onDidClick(async () => {
					if (!this.refreshPerformanceInfo || this.performanceInfoRefreshing) {
						return;
					}
					this.performanceInfoRefreshing = true;
					refreshBtn.enabled = false;
					performanceContainer.classList.add('refreshing');
					this.updateStepUI();
					try {
						await this.refreshPerformanceInfo();
					} finally {
						this.performanceInfoRefreshing = false;
						// updateModel inside refreshPerformanceInfo already re-renders the
						// review step, so the previous performanceContainer/refreshBtn may
						// be stale by now. Re-rendering once more here ensures the
						// "refreshing" class is cleared and the button is re-enabled even
						// if the model didn't update (e.g. error path).
						if (this.currentStep === WizardStep.Review) {
							this.updateReviewDetails();
						}
						this.updateStepUI();
					}
				}));
			}
			const performanceDescription = append(performanceContainer, $('div.review-performance-description'));
			performanceDescription.textContent = localize('additionalPerformanceDataDescription', "Optionally include currently running processes and workspace metadata to help diagnose performance issues.");

			if (modelData.processInfo) {
				diagnosticSectionCount++;
				diagnosticSectionStates.push(() => this.includeProcessInfo);
				this.createDiagSection(performanceContainer, {
					id: 'process-info',
					label: localize('runningProcesses', "Running Processes"),
					checked: this.includeProcessInfo,
					onToggle: (checked) => {
						this.includeProcessInfo = checked;
						this.model.update({ includeProcessInfo: checked });
					},
					renderContent: (container) => {
						const pre = append(container, $('pre.review-diag-pre'));
						pre.textContent = modelData.processInfo!;
					},
				});
			} else if (!this.performanceInfoLoaded) {
				const loading = append(performanceContainer, $('div.review-diag-loading'));
				loading.textContent = localize('loadingProcessInfo', "Loading currently running processes...");
			}

			if (modelData.workspaceInfo) {
				diagnosticSectionCount++;
				diagnosticSectionStates.push(() => this.includeWorkspaceInfo);
				this.createDiagSection(performanceContainer, {
					id: 'workspace-info',
					label: localize('workspaceMetadata', "Workspace Metadata"),
					checked: this.includeWorkspaceInfo,
					onToggle: (checked) => {
						this.includeWorkspaceInfo = checked;
						this.model.update({ includeWorkspaceInfo: checked });
					},
					renderContent: (container) => {
						const pre = append(container, $('pre.review-diag-pre'));
						pre.textContent = modelData.workspaceInfo!;
					},
				});
			} else if (!this.performanceInfoLoaded) {
				const loading = append(performanceContainer, $('div.review-diag-loading'));
				loading.textContent = localize('loadingWorkspaceInfo', "Loading workspace metadata...");
			}
		}

		if (diagnosticSectionCount > 0) {
			const heading = document.createElement('div');
			heading.className = 'review-diag-heading';
			const title = append(heading, $('h3.review-diag-heading-title'));
			title.textContent = localize('additionalInformation', "Additional Information");
			if (diagnosticSectionCount > 1) {
				const bulkActions = append(heading, $('div.review-diag-bulk-actions'));
				const toggleAllButton = this.disposables.add(new Button(bulkActions, { ...defaultButtonStyles, secondary: true }));
				toggleAllButton.element.classList.add('review-diag-toggle-all');
				this.diagnosticBulkToggleButton = toggleAllButton;
				this.updateDiagnosticBulkToggleButton();
				this.disposables.add(toggleAllButton.onDidClick(() => {
					this.setAllDiagnosticSectionsIncluded(!this.areAllVisibleDiagnosticSectionsIncluded());
				}));
			}
			diagContainer.prepend(heading);
		}

		// Align all title widths dynamically to the widest title
		// eslint-disable-next-line no-restricted-syntax
		const titles = diagContainer.querySelectorAll('.review-diag-title');
		let maxWidth = 0;
		for (const t of titles) {
			(t as HTMLElement).style.minWidth = '';
		}
		for (const t of titles) {
			maxWidth = Math.max(maxWidth, (t as HTMLElement).offsetWidth);
		}
		if (maxWidth > 0) {
			for (const t of titles) {
				(t as HTMLElement).style.minWidth = `${maxWidth}px`;
			}
		}

		// Align all toggle button widths to the widest
		// eslint-disable-next-line no-restricted-syntax
		const toggles = diagContainer.querySelectorAll('.review-diag-toggle');
		let maxToggleWidth = 0;
		for (const t of toggles) {
			(t as HTMLElement).style.minWidth = '';
		}
		for (const t of toggles) {
			maxToggleWidth = Math.max(maxToggleWidth, (t as HTMLElement).offsetWidth);
		}
		if (maxToggleWidth > 0) {
			for (const t of toggles) {
				(t as HTMLElement).style.minWidth = `${maxToggleWidth}px`;
			}
		}
	}

	private areAllVisibleDiagnosticSectionsIncluded(): boolean {
		return this.diagnosticSectionStates.length > 0 && this.diagnosticSectionStates.every(getState => getState());
	}

	private updateDiagnosticBulkToggleButton(): void {
		if (!this.diagnosticBulkToggleButton) {
			return;
		}
		const allChecked = this.areAllVisibleDiagnosticSectionsIncluded();
		this.diagnosticBulkToggleButton.label = allChecked
			? localize('excludeAllExtraAttachments', "Exclude All")
			: localize('includeAllExtraAttachments', "Include All");
		this.diagnosticBulkToggleButton.element.setAttribute('aria-label', allChecked
			? localize('excludeAllExtraAttachmentsAria', "Exclude all additional issue data from this issue")
			: localize('includeAllExtraAttachmentsAria', "Include all additional issue data in this issue"));
	}

	private setAllDiagnosticSectionsIncluded(included: boolean): void {
		this.includeSystemInfo = included;
		this.includeExtensionData = included;
		this.includeExtensions = included;
		this.includeExperiments = included;
		this.includeProcessInfo = included;
		this.includeWorkspaceInfo = included;
		this.model.update({
			includeSystemInfo: included,
			includeExtensionData: included,
			includeExtensions: included,
			includeExperiments: included,
			includeProcessInfo: included,
			includeWorkspaceInfo: included,
		});
		this.updateReviewDetails();
	}

	private createDiagSection(parent: HTMLElement, opts: {
		id: string;
		label: string;
		checked: boolean;
		onToggle: (checked: boolean) => void;
		renderContent: (container: HTMLElement) => void;
	}): void {
		const group = append(parent, $('div.review-diag-group'));

		// Header: title | "Include in issue" checkbox | Minimize/Expand button
		const header = append(group, $('div.review-diag-header'));

		const title = append(header, $('span.review-diag-title'));
		title.textContent = opts.label;

		const checkWrap = append(header, $('div.review-diag-check-wrap'));
		const checkbox = this.disposables.add(new Checkbox(localize('includeInIssue', "Include in issue"), opts.checked, defaultCheckboxStyles));
		checkWrap.appendChild(checkbox.domNode);
		const checkLabel = append(checkWrap, $('label.review-diag-check-label'));
		checkLabel.textContent = localize('includeInIssue', "Include in issue");
		this.disposables.add(checkbox.onChange(() => {
			opts.onToggle(checkbox.checked);
			this.updateDiagnosticBulkToggleButton();
			this.updateStepUI();
		}));

		const toggleBtn = this.disposables.add(new Button(header, { ...defaultButtonStyles, secondary: true, supportIcons: true }));
		toggleBtn.label = `$(chevron-up) ${localize('minimize', "Minimize")}`;
		toggleBtn.element.classList.add('review-diag-toggle');

		// Content
		const content = append(group, $('div.review-diag-content'));
		opts.renderContent(content);

		let expanded = true;
		this.disposables.add(toggleBtn.onDidClick(() => {
			expanded = !expanded;
			content.style.display = expanded ? '' : 'none';
			toggleBtn.label = expanded
				? `$(chevron-up) ${localize('minimize', "Minimize")}`
				: `$(chevron-down) ${localize('expand', "Expand")}`;
		}));
	}

	private addDiagRow(table: HTMLElement, label: string, value: string): void {
		const row = append(table, $('tr'));
		const th = append(row, $('td.review-diag-key'));
		th.textContent = label;
		const td = append(row, $('td.review-diag-val'));
		td.textContent = value;
	}

	/** Called by the form service to show upload progress */
	setUploading(uploading: boolean): void {
		this.uploading = uploading;

		if (uploading) {
			this.nextButton.element.classList.add('uploading');
			this.nextButton.label = localize('uploading', "Uploading...");
			this.nextButton.enabled = false;
			this.backButton.element.style.display = 'none';
		} else {
			this.nextButton.element.classList.remove('uploading');
			this.nextButton.enabled = true;
			this.updateStepUI();
		}
	}

	/** Mark a specific attachment as uploading / done */
	setAttachmentUploadState(index: number, state: 'pending' | 'uploading' | 'done'): void {
		if (index < 0 || index >= this.reviewThumbCards.length) {
			return;
		}
		const card = this.reviewThumbCards[index];
		card.classList.remove('upload-pending', 'upload-uploading', 'upload-done');
		card.classList.add(`upload-${state}`);

		// eslint-disable-next-line no-restricted-syntax
		const overlay = card.querySelector('.review-progress-overlay') as HTMLElement | null;
		if (!overlay) {
			return;
		}

		if (state === 'done') {
			// Replace ring with checkmark
			overlay.textContent = '';
			const check = $('span.review-progress-check');
			check.appendChild(renderIcon(Codicon.check));
			overlay.appendChild(check);
		}
	}

	private submit(): void {
		const title = this.titleInput.value.trim();
		if (!title) {
			// Should not happen: validated in goNext() on Describe step
			return;
		}

		const description = this.descriptionTextarea.value.trim();
		this.updateIssueSourceFlags();
		this.model.update({ issueDescription: description, issueTitle: title, ...(this.selectedIssueType !== undefined ? { issueType: this.selectedIssueType } : {}) });

		const body = this.buildIssueBody();
		this._onDidSubmit.fire({ title, body });
	}

	show(): void {
		if (this.visible) {
			return;
		}
		this.visible = true;

		this.wizardPanel.classList.add('open', 'wizard-embedded');
		this.wizardPanel.style.maxHeight = 'none';
		append(this.container, this.wizardPanel);
		this.wizardPanel.focus();
	}

	private getTotalAttachments(): number {
		return this.screenshots.length + this.recordings.length;
	}

	private getScreenshotDelayOptions(): { label: string; value: number }[] {
		return [
			{ label: localize('noDelay', "No delay"), value: 0 },
			{ label: localize('threeSeconds', "3 seconds"), value: 3 },
			{ label: localize('fiveSeconds', "5 seconds"), value: 5 },
			{ label: localize('tenSeconds', "10 seconds"), value: 10 },
		];
	}

	private getFloatingBarButtonStyles(targetWindow: Window): typeof defaultButtonStyles {
		const containerStyles = targetWindow.getComputedStyle(this.container);
		const cssVar = (name: string, fallback: string): string => containerStyles.getPropertyValue(name).trim() || fallback;
		return {
			...defaultButtonStyles,
			buttonForeground: cssVar('--vscode-button-foreground', '#fff'),
			buttonBackground: cssVar('--vscode-button-background', '#0e639c'),
			buttonHoverBackground: cssVar('--vscode-button-hoverBackground', '#1177bb'),
			buttonBorder: cssVar('--vscode-button-border', 'transparent'),
		};
	}

	addScreenshot(screenshot: IScreenshot): void {
		if (this.getTotalAttachments() >= MAX_ATTACHMENTS) {
			return;
		}
		this.screenshots.push(screenshot);
		this.updateAttachmentViews();
		this.updateAttachmentButtons();
		this.updateStepUI();

		// Immediately open the annotation editor for the new screenshot
		this.openAnnotationEditor(this.screenshots.length - 1);
	}

	private updateAttachmentButtons(): void {
		const atMax = this.getTotalAttachments() >= MAX_ATTACHMENTS;
		const maxMsg = localize('maxAttachmentsReached', "Max attachments reached");
		const wouldReachMax = this.getTotalAttachments() >= MAX_ATTACHMENTS - 1;

		// Screenshot disabled when: at max, OR recording will fill the last slot, OR delayed screenshot pending
		const screenshotDisabled = atMax || (wouldReachMax && this.currentRecordingState === RecordingState.Recording) || this.delayedScreenshotPending;
		// Record disabled when: at max, OR delayed screenshot will fill the last slot
		const recordDisabled = atMax || (wouldReachMax && this.delayedScreenshotPending);

		if (this.captureStripCaptureBtn) {
			this.captureStripCaptureBtn.enabled = !screenshotDisabled;
			this.captureStripCaptureBtn.element.title = screenshotDisabled ? maxMsg : localize('screenshot', "Screenshot");
		}
		if (this.captureStripDelayBtn) {
			// Delay dropdown also disabled while countdown is running
			this.captureStripDelayBtn.enabled = !screenshotDisabled;
			this.captureStripDelayBtn.element.title = screenshotDisabled ? maxMsg : localize('captureOptions', "Capture options");
		}
		if (this.captureStripRecordBtn) {
			if (this.currentRecordingState !== RecordingState.Recording) {
				this.captureStripRecordBtn.enabled = !recordDisabled;
				this.captureStripRecordBtn.element.title = recordDisabled ? maxMsg : localize('recordVideo', "Record video");
			}
		}

		// Disable "Preview on GitHub" while recording
		this.updateNextButtonForRecording();
	}

	private updateNextButtonForRecording(): void {
		if (this.currentStep !== WizardStep.Review) {
			return;
		}
		const recording = this.currentRecordingState === RecordingState.Recording;
		this.nextButton.enabled = !recording;
		this.nextButton.element.title = recording
			? localize('recordingActive', "Recording active")
			: localize('previewOnGitHub', "Preview on GitHub");
	}

	private renderRecordingCard(parent: HTMLElement, rec: { filePath: string; durationMs: number; thumbnailDataUrl?: string }, index: number): HTMLElement {
		const card = append(parent, $('div.wizard-screenshot-card.wizard-recording-card'));

		if (rec.thumbnailDataUrl) {
			const thumbImg = append(card, $('img.wizard-screenshot-img')) as HTMLImageElement;
			thumbImg.setAttribute('src', rec.thumbnailDataUrl);
			thumbImg.alt = localize('recordingThumbnailAlt', "Recording {0}", index + 1);
			thumbImg.setAttribute('draggable', 'false');
		}

		const playOverlay = append(card, $('div.wizard-recording-play'));
		playOverlay.appendChild(renderIcon(Codicon.play));

		const durSec = Math.floor(rec.durationMs / 1000);
		const durLabel = append(card, $('div.wizard-recording-duration'));
		durLabel.textContent = `${Math.floor(durSec / 60)}:${(durSec % 60).toString().padStart(2, '0')}`;

		return card;
	}

	private updateScreenshotThumbnails(): void {
		this.screenshotContainer.textContent = '';

		for (let i = 0; i < this.screenshots.length; i++) {
			const screenshot = this.screenshots[i];
			const card = append(this.screenshotContainer, $('div.wizard-screenshot-card'));

			const img = append(card, $('img')) as HTMLImageElement;
			img.src = screenshot.annotatedDataUrl ?? screenshot.dataUrl;
			img.alt = localize('screenshotAlt', "Screenshot {0}", i + 1);

			card.setAttribute('role', 'button');
			card.setAttribute('tabindex', '0');
			card.title = localize('editScreenshot', "Click to edit screenshot");
			const openEditor = () => this.openAnnotationEditor(i);
			this.disposables.add(addDisposableListener(card, EventType.CLICK, openEditor));
			this.disposables.add(addDisposableListener(card, EventType.KEY_DOWN, e => {
				const event = new StandardKeyboardEvent(e);
				if (event.equals(KeyCode.Enter) || event.equals(KeyCode.Space)) {
					e.preventDefault();
					openEditor();
				}
			}));

			const deleteBtn = append(card, $('div.wizard-screenshot-delete'));
			deleteBtn.setAttribute('role', 'button');
			deleteBtn.setAttribute('aria-label', localize('deleteScreenshot', "Delete screenshot"));
			deleteBtn.appendChild(renderIcon(Codicon.close));
			this.disposables.add(addDisposableListener(deleteBtn, EventType.CLICK, e => {
				e.stopPropagation();
				this.screenshots.splice(i, 1);
				this.updateScreenshotThumbnails();
				this.updateAttachmentButtons();
				this.updateStepUI();
			}));
		}

		// Recording thumbnails
		for (let i = 0; i < this.recordings.length; i++) {
			const rec = this.recordings[i];
			const card = this.renderRecordingCard(this.screenshotContainer, rec, i);

			// Click to open from OS
			this.disposables.add(addDisposableListener(card, EventType.CLICK, () => {
				this._onDidRequestOpenRecording.fire(rec.filePath);
			}));

			const deleteBtn = append(card, $('div.wizard-screenshot-delete'));
			deleteBtn.setAttribute('role', 'button');
			deleteBtn.setAttribute('aria-label', localize('deleteRecording', "Remove recording"));
			deleteBtn.appendChild(renderIcon(Codicon.close));
			this.disposables.add(addDisposableListener(deleteBtn, EventType.CLICK, e => {
				e.stopPropagation();
				this.recordings.splice(i, 1);
				this.updateScreenshotThumbnails();
				this.updateAttachmentButtons();
				this.updateStepUI();
			}));
		}

		if (this.getTotalAttachments() < MAX_ATTACHMENTS) {
			const wouldReachMax = this.getTotalAttachments() >= MAX_ATTACHMENTS - 1;
			const addDisabled = wouldReachMax && (this.currentRecordingState === RecordingState.Recording || this.delayedScreenshotPending);
			const addCard = append(this.screenshotContainer, $('div.wizard-screenshot-card.wizard-screenshot-add'));
			if (addDisabled) {
				addCard.classList.add('disabled');
				addCard.title = localize('maxAttachmentsReached', "Max attachments reached");
			}
			const plus = append(addCard, $('div.wizard-screenshot-plus'));
			plus.appendChild(renderIcon(Codicon.add));
			this.disposables.add(addDisposableListener(addCard, EventType.CLICK, () => {
				if (!addCard.classList.contains('disabled')) {
					this._onDidRequestScreenshot.fire();
				}
			}));
		}
	}

	private openAnnotationEditor(index: number): void {
		if (index < 0 || index >= this.screenshots.length) {
			return;
		}

		// Per-editor lifecycle: each call creates a new editor that mounts an
		// absolutely-positioned overlay on top of any previously-open editor and
		// disposes itself on save/cancel. This gives us the stacking behavior the
		// user expects when taking multiple screenshots in a row — the topmost
		// editor handles save/cancel, then the previous one becomes visible
		// again.
		const screenshot = this.screenshots[index];
		const editor = new ScreenshotAnnotationEditor(screenshot, this.wizardPanel, screenshot.annotationState);
		this.disposables.add(editor);

		this.disposables.add(editor.onDidSave(({ dataUrl, state }) => {
			screenshot.annotatedDataUrl = dataUrl;
			screenshot.annotationState = state;
			this.updateAttachmentViews();
		}));

		this.disposables.add(editor.onDidCancel(() => {
			// nothing to do, editor disposes itself
		}));
	}

	getScreenshots(): readonly IScreenshot[] {
		return this.screenshots;
	}

	getRecordings(): readonly { filePath: string; durationMs: number; thumbnailDataUrl?: string }[] {
		return this.recordings;
	}

	private buildIssueBody(): string {
		const description = this.descriptionTextarea.value.trim();
		this.model.update({
			issueDescription: description,
			issueType: this.selectedIssueType ?? IssueType.Bug,
			includeSystemInfo: this.includeSystemInfo,
			includeProcessInfo: this.includeProcessInfo,
			includeWorkspaceInfo: this.includeWorkspaceInfo,
			includeExtensions: this.includeExtensions,
			includeExperiments: this.includeExperiments,
			includeExtensionData: this.includeExtensionData,
		});

		const modelData = this.model.getData();
		const sections: string[] = [
			`### Description\n\n${description}`,
			this.generateIssueDetailsMd(),
		];

		if (this.includeExtensionData && modelData.extensionData) {
			sections.push(this.createDetails('Extension Data', this.createCodeBlock(modelData.extensionData)));
		}

		if (this.includeSystemInfo && (modelData.versionInfo || modelData.systemInfo || modelData.systemInfoWeb)) {
			sections.push(this.generateSystemInfoMd());
		}

		if (!modelData.fileOnExtension && !modelData.fileOnMarketplace && this.includeExtensions) {
			sections.push(this.generateExtensionsMd());
		}

		if (this.includeExperiments && modelData.experimentInfo) {
			sections.push(this.createDetails('A/B Experiments', this.createCodeBlock(modelData.experimentInfo)));
		}

		if (this.selectedIssueType === IssueType.PerformanceIssue && !modelData.fileOnMarketplace) {
			if (this.includeProcessInfo && modelData.processInfo) {
				sections.push(this.createDetails('Running Processes', this.createCodeBlock(modelData.processInfo)));
			}
			if (this.includeWorkspaceInfo && modelData.workspaceInfo) {
				sections.push(this.createDetails('Workspace Metadata', this.createCodeBlock(modelData.workspaceInfo)));
			}
		}

		sections.push('<!-- generated by issue reporter -->');

		return sections.join('\n\n');
	}

	private generateIssueDetailsMd(): string {
		const modelData = this.model.getData();
		const rows: [string, string | undefined][] = [
			['Issue Category', this.getIssueTypeTitle(this.selectedIssueType ?? IssueType.Bug)],
			['Target', this.getIssueSourceLabel()],
			['VS Code Version', modelData.versionInfo?.vscodeVersion ?? product.version],
			['OS Version', modelData.versionInfo?.os ?? modelData.systemInfo?.os],
		];

		if (this.selectedIssueSource === IssueSource.Extension && this.selectedExtension) {
			rows.push(
				['Extension Identifier', this.selectedExtension.id],
				['Extension Version', this.selectedExtension.version],
				['Extension Publisher', this.selectedExtension.publisher],
			);
		}

		return `### Issue Details\n\n${this.createMarkdownTable(rows)}`;
	}

	private generateSystemInfoMd(): string {
		const modelData = this.model.getData();
		const rows: [string, string | undefined][] = [];

		if (modelData.versionInfo) {
			rows.push(
				['VS Code Version', modelData.versionInfo.vscodeVersion],
				['OS Version', modelData.versionInfo.os],
			);
		}

		if (modelData.systemInfo) {
			rows.push(
				['CPUs', modelData.systemInfo.cpus],
				['GPU Status', Object.keys(modelData.systemInfo.gpuStatus).map(key => `${key}: ${modelData.systemInfo!.gpuStatus[key]}`).join('<br>')],
				['Load (avg)', modelData.systemInfo.load],
				['Memory (System)', modelData.systemInfo.memory],
				['Process Argv', modelData.systemInfo.processArgs],
				['Screen Reader', modelData.systemInfo.screenReader],
				['VM', modelData.systemInfo.vmHint],
			);

			if (modelData.systemInfo.linuxEnv) {
				rows.push(
					['DESKTOP_SESSION', modelData.systemInfo.linuxEnv.desktopSession],
					['XDG_CURRENT_DESKTOP', modelData.systemInfo.linuxEnv.xdgCurrentDesktop],
					['XDG_SESSION_DESKTOP', modelData.systemInfo.linuxEnv.xdgSessionDesktop],
					['XDG_SESSION_TYPE', modelData.systemInfo.linuxEnv.xdgSessionType],
				);
			}

			for (const remote of modelData.systemInfo.remoteData) {
				if (isRemoteDiagnosticError(remote)) {
					rows.push(['Remote Error', remote.errorMessage]);
				} else {
					rows.push(
						['Remote', remote.latency ? `${remote.hostName} (latency: ${remote.latency.current.toFixed(2)}ms last, ${remote.latency.average.toFixed(2)}ms average)` : remote.hostName],
						['Remote OS', remote.machineInfo.os],
						['Remote CPUs', remote.machineInfo.cpus],
						['Remote Memory (System)', remote.machineInfo.memory],
						['Remote VM', remote.machineInfo.vmHint],
					);
				}
			}
		}

		if (modelData.systemInfoWeb) {
			rows.push(['User Agent', modelData.systemInfoWeb]);
		}
		rows.push(['Installation pure', String(modelData.isInstallationPure ?? true)]);

		return this.createDetails('System Info', this.createMarkdownTable(rows));
	}

	private generateExtensionsMd(): string {
		const modelData = this.model.getData();
		const nonThemeExtensions = (modelData.enabledNonThemeExtesions ?? modelData.allExtensions.filter(extension => !extension.isTheme && !extension.isBuiltin));
		if (modelData.extensionsDisabled) {
			return '### Extensions\n\nExtensions disabled.';
		}

		if (!nonThemeExtensions.length && !modelData.numberOfThemeExtesions) {
			return '### Extensions\n\nExtensions: none';
		}

		const rows = nonThemeExtensions.map(extension => [
			extension.displayName || extension.name,
			extension.id,
			extension.publisher ?? 'N/A',
			extension.version,
		] as [string, string, string, string]);
		const details: string[] = [];
		if (rows.length) {
			details.push(this.createMarkdownTable(rows, ['Name', 'Identifier', 'Author', 'Version']));
		}
		if (modelData.numberOfThemeExtesions) {
			details.push(`Theme extensions: ${modelData.numberOfThemeExtesions}`);
		}

		return this.createDetails(`Extensions (${nonThemeExtensions.length})`, details.join('\n\n'));
	}

	private getIssueTypeTitle(issueType: IssueType): string {
		switch (issueType) {
			case IssueType.Bug:
				return 'Bug';
			case IssueType.PerformanceIssue:
				return 'Performance Issue';
			case IssueType.FeatureRequest:
				return 'Feature Request';
		}
	}

	private createDetails(summary: string, content: string): string {
		return `<details>
<summary>${summary}</summary>

${content}

</details>`;
	}

	private createCodeBlock(content: string, language = ''): string {
		return `\`\`\`${language}
${content.trimEnd()}
\`\`\``;
	}

	private createMarkdownTable(rows: readonly (readonly (string | undefined)[])[], headers: readonly string[] = ['Item', 'Value']): string {
		return `${headers.map(header => this.escapeMarkdownTableCell(header)).join('|')}
${headers.map(() => '---').join('|')}
${rows.map(row => row.map(value => this.escapeMarkdownTableCell(value ?? '')).join('|')).join('\n')}`;
	}

	private escapeMarkdownTableCell(value: string): string {
		return value.replace(/\r?\n/g, '<br>').replace(/\|/g, '\\|');
	}

	setUpdateAvailable(showUpdateBanner: boolean): void {
		this.showUpdateBanner = showUpdateBanner;
		this.updateBanner.style.display = showUpdateBanner ? '' : 'none';
	}

	focus(): void {
		this.wizardPanel.focus();
	}

	getPanel(): HTMLElement {
		return this.wizardPanel;
	}

	get recordingState(): RecordingState {
		return this.currentRecordingState;
	}

	hideFloatingBar(): void {
		if (this.floatingBar) {
			this.floatingBar.style.display = 'none';
		}
	}

	showFloatingBar(): void {
		if (this.floatingBar) {
			this.floatingBar.style.display = '';
		}
	}

	get shouldHideToolbarForCapture(): boolean {
		return this._hideToolbarInScreenshots;
	}

	/** Re-parent the floating bar into the wizard's current window. */
	reparentFloatingBar(): void {
		if (!this.floatingBar) {
			return;
		}
		const targetWindow = getWindow(this.container);
		// Mount inside .monaco-workbench so theme CSS vars cascade. Fall back to
		// document.body when no workbench root is present (shouldn't happen in
		// practice but keeps the bar visible regardless).
		// eslint-disable-next-line no-restricted-syntax
		const workbench = targetWindow.document.querySelector('.monaco-workbench') as HTMLElement | null;
		const mountTarget = workbench ?? targetWindow.document.body;
		if (this.floatingBar.parentElement !== mountTarget) {
			this.floatingBar.remove();
			mountTarget.appendChild(this.floatingBar);
			// Reset position so it appears in the new window
			this.floatingBar.style.left = '';
			this.floatingBar.style.top = '';
			this.floatingBar.style.right = '30%';
		}
	}

	/** Update the internal model with additional data loaded asynchronously */
	updateModel(newData: Record<string, unknown>): void {
		this.model.update(newData);
		if (Array.isArray(newData.allExtensions)) {
			this.data.enabledExtensions = newData.allExtensions as IssueReporterExtensionData[];
			this.updateExtensionOptions();
			this.updateIssueSourceFlags();
		}
		// Refresh review details if we're on the review step (async data may have arrived)
		if (this.currentStep === WizardStep.Review) {
			this.updateReviewDetails();
		}
	}

	/** Called once performance info has resolved; suppresses "Loading…" placeholders. */
	markPerformanceInfoLoaded(): void {
		this.performanceInfoLoaded = true;
		if (this.currentStep === WizardStep.Review) {
			this.updateReviewDetails();
			// Re-enable the Preview button now that diagnostics are ready.
			this.updateStepUI();
		}
	}

	hasUnsavedChanges(): boolean {
		if (this.previewOpened && this.previewedDraftKey === this.getDraftKey()) {
			return false;
		}
		return this.hasUserInput();
	}

	private hasUserInput(): boolean {
		return !!(
			this.hasDescriptionContent() ||
			this.titleInput.value.trim() ||
			this.selectedIssueType !== undefined ||
			this.screenshots.length > 0 ||
			this.recordings.length > 0
		);
	}

	markPreviewOpened(): void {
		this.previewOpened = true;
		this.previewedDraftKey = this.getDraftKey();
		this.updateStepUI();
	}

	private getDraftKey(): string {
		return JSON.stringify({
			title: this.titleInput.value.trim(),
			description: this.descriptionTextarea.value.trim(),
			issueType: this.selectedIssueType,
			issueSource: this.selectedIssueSource,
			extensionId: this.selectedExtension?.id,
			includeSystemInfo: this.includeSystemInfo,
			includeProcessInfo: this.includeProcessInfo,
			includeWorkspaceInfo: this.includeWorkspaceInfo,
			includeExtensions: this.includeExtensions,
			includeExperiments: this.includeExperiments,
			includeExtensionData: this.includeExtensionData,
			screenshots: this.screenshots.map(screenshot => screenshot.annotatedDataUrl ?? screenshot.dataUrl),
			recordings: this.recordings.map(recording => recording.filePath),
		});
	}

	/** Set the title input value (e.g., from AI generation) */
	setGeneratedTitle(title: string): void {
		this.titleInput.value = title;
		if (title.trim()) {
			this.setFieldError(this.titleInput.element, this.titleError, false);
		}
		this.resetGenerateButton();
	}

	resetGenerateButton(): void {
		this.generateTitleBtn.label = `$(sparkle) ${localize('generateTitleBtn', "Generate from description")}`;
		this.generateTitleBtn.element.classList.remove('loading');
		this.generateTitleBtn.element.style.minWidth = '';
		this.generateTitleBtn.enabled = this.hasDescriptionContent();
	}

	/** Show a "Close" button next to the submit button after successful submission */
	showCloseButton(): void {
		// Add close button next to the existing preview button
		const nav = this.nextButton.element.parentElement;
		// eslint-disable-next-line no-restricted-syntax
		if (nav && !nav.querySelector('.wizard-close-btn')) {
			this.closeButton = this.disposables.add(new Button(nav, { ...defaultButtonStyles, secondary: true }));
			this.closeButton.label = localize('closeTab', "Close");
			this.closeButton.element.classList.add('wizard-close-btn');
			this.disposables.add(this.closeButton.onDidClick(() => {
				this._onDidClose.fire();
			}));
		}
		this.updateStepUI();
	}

	setRecordingState(state: RecordingState): void {
		this.currentRecordingState = state;

		if (state === RecordingState.Recording) {
			this.recordingStartTime = Date.now();

			const formatTime = () => {
				const elapsed = Math.floor((Date.now() - this.recordingStartTime) / 1000);
				const mins = Math.floor(elapsed / 60).toString().padStart(2, '0');
				const secs = (elapsed % 60).toString().padStart(2, '0');
				return `${mins}:${secs}`;
			};

			const stopLabel = localize('stopRecording', "Stop recording");
			const makeLabel = () => `$(stop-circle) ${stopLabel} ${formatTime()}`;

			if (this.captureStripRecordBtn) {
				this.captureStripRecordBtn.element.classList.add('recording');
				this.captureStripRecordBtn.element.title = stopLabel;
				this.captureStripRecordBtn.label = makeLabel();
			}

			this.recordingElapsedTimer = getWindow(this.container).setInterval(() => {
				if (this.captureStripRecordBtn) {
					this.captureStripRecordBtn.label = makeLabel();
				}
			}, 1000);
		} else {
			// Back to idle
			if (this.recordingElapsedTimer !== undefined) {
				getWindow(this.container).clearInterval(this.recordingElapsedTimer);
				this.recordingElapsedTimer = undefined;
			}

			if (this.captureStripRecordBtn) {
				this.captureStripRecordBtn.element.classList.remove('recording');
				this.captureStripRecordBtn.element.title = localize('recordVideo', "Record video");
				this.captureStripRecordBtn.label = `$(record) ${localize('recordVideo', "Record video")}`;
			}
		}

		this.updateScreenshotThumbnails();
		this.updateAttachmentButtons();
	}

	addRecording(filePath: string, durationMs: number, thumbnailDataUrl?: string): void {
		this.recordings.push({ filePath, durationMs, thumbnailDataUrl });
		this.updateAttachmentViews();
		this.updateAttachmentButtons();
		this.updateStepUI();
	}

	private updateAttachmentViews(): void {
		this.updateScreenshotThumbnails();
		if (this.currentStep === WizardStep.Review) {
			this.updateReviewDetails();
		}
	}

	/**
	 * Trigger a screenshot capture as if the user clicked the screenshot button
	 * on the floating capture bar. The floating bar is mounted at the workbench
	 * root and the button is enabled regardless of the current wizard step, so
	 * the shortcut works from any step without changing it. The existing
	 * capture flow opens the annotation editor and re-activates the issue
	 * reporter editor when the screenshot is added.
	 *
	 * No-op when the capture button is disabled (e.g. at the attachment limit).
	 */
	triggerCaptureScreenshot(): void {
		const btn = this.captureStripCaptureBtn;
		if (!btn?.enabled) {
			return;
		}
		btn.element.click();
	}

	/**
	 * Toggle screen recording on/off as if the user clicked the record button.
	 * Works from any step without changing it. No-op when recording isn't
	 * supported or the record button is disabled.
	 */
	triggerToggleRecording(): void {
		if (!this.recordingSupported) {
			return;
		}
		const btn = this.captureStripRecordBtn;
		if (!btn?.enabled) {
			return;
		}
		btn.element.click();
	}

	private renderShortcutKeycap(parent: HTMLElement, keybinding: ResolvedKeybinding): void {
		const label = this.disposables.add(new KeybindingLabel(parent, OS, { ...defaultKeybindingLabelStyles }));
		label.set(keybinding);
		label.element.classList.add('wizard-shortcut');
	}

	dispose(): void {
		if (this.recordingElapsedTimer !== undefined) {
			getWindow(this.container).clearInterval(this.recordingElapsedTimer);
		}
		this.reviewRenderDisposables.dispose();
		this.similarIssuesDisposables.dispose();
		this.disposables.dispose();
		this._onDidClose.dispose();
		this._onDidSubmit.dispose();
		this._onDidRequestScreenshot.dispose();
		this._onDidRequestStartRecording.dispose();
		this._onDidRequestStopRecording.dispose();
		this._onDidRequestOpenRecording.dispose();
		this._onDidRequestOpenScreenshot.dispose();
		this._onDidRequestGenerateTitle.dispose();
	}
}
