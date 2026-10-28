/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { KeybindingLabel } from '../../../../base/browser/ui/keybindingLabel/keybindingLabel.js';
import { ResolvedKeybinding } from '../../../../base/common/keybindings.js';
import { OS } from '../../../../base/common/platform.js';
import './media/issueReporterOverlay.css';
import { $, addDisposableListener, append, disposableWindowInterval, EventType, getWindow, isHTMLElement } from '../../../../base/browser/dom.js';
import { StandardKeyboardEvent } from '../../../../base/browser/keyboardEvent.js';
import { status } from '../../../../base/browser/ui/aria/aria.js';
import { Button } from '../../../../base/browser/ui/button/button.js';
import { IContextMenuProvider } from '../../../../base/browser/contextmenu.js';
import { renderIcon } from '../../../../base/browser/ui/iconLabel/iconLabels.js';
import { InputBox } from '../../../../base/browser/ui/inputbox/inputBox.js';
import { ISelectOptionItem, SelectBox } from '../../../../base/browser/ui/selectBox/selectBox.js';
import { Checkbox } from '../../../../base/browser/ui/toggle/toggle.js';
import { Action, Separator } from '../../../../base/common/actions.js';
import { Codicon } from '../../../../base/common/codicons.js';
import { Emitter, Event } from '../../../../base/common/event.js';
import { toErrorMessage } from '../../../../base/common/errorMessage.js';
import { MarkdownString } from '../../../../base/common/htmlContent.js';
import { KeyCode } from '../../../../base/common/keyCodes.js';
import { DisposableStore, MutableDisposable, toDisposable } from '../../../../base/common/lifecycle.js';
import { generateUuid } from '../../../../base/common/uuid.js';
import { localize } from '../../../../nls.js';
import { IClipboardService } from '../../../../platform/clipboard/common/clipboardService.js';
import { IHoverService } from '../../../../platform/hover/browser/hover.js';
import { IMarkdownRendererService } from '../../../../platform/markdown/browser/markdownRenderer.js';
import { IContextViewService } from '../../../../platform/contextview/browser/contextView.js';
import { ILogService } from '../../../../platform/log/common/log.js';
import { INotificationService } from '../../../../platform/notification/common/notification.js';
import { isRemoteDiagnosticError } from '../../../../platform/diagnostics/common/diagnostics.js';
import { defaultButtonStyles, defaultCheckboxStyles, defaultInputBoxStyles, defaultKeybindingLabelStyles, defaultSelectBoxStyles } from '../../../../platform/theme/browser/defaultStyles.js';
import product from '../../../../platform/product/common/product.js';
import { IIssueReporterAttachmentUpload, IIssueReporterFileAttachment, IIssueReporterScreenshot, IssueReporterAttachment, IssueReporterData, IssueReporterExtensionData, IssueSource, IssueType } from '../common/issue.js';
import { resolveIssueReporterTarget } from '../common/issueReporterTarget.js';
import { renderIssueReporterRepositoryPicker } from './issueReporterRepositoryPicker.js';
import { IssueReporterModel } from './issueReporterModel.js';
import { IssueReporterEditorInput } from './issueReporterEditorInput.js';
import { getIssueReporterScreenshotFile, MAX_ISSUE_ATTACHMENTS as MAX_ATTACHMENTS, validateIssueReporterMediaFile } from './issueReporterMedia.js';
import { RecordingState } from './recordingService.js';
import { IAnnotationEditorState, ScreenshotAnnotationEditor } from './screenshotAnnotation.js';

export interface IScreenshot extends IIssueReporterScreenshot {
	readonly width: number;
	readonly height: number;
	annotatedDataUrl?: string;
	annotationState?: IAnnotationEditorState;
}

export interface IIssueReporterAttachmentImport {
	readonly id: string;
	readonly file: File;
}

type PendingAttachment = { readonly id: string; readonly kind: 'pending'; readonly source: 'import' | 'screenshot' | 'recording' };

type DiagnosticOption = 'includeSystemInfo' | 'includeProcessInfo' | 'includeWorkspaceInfo' | 'includeExtensions' | 'includeExperiments' | 'includeExtensionData';

export interface IIssueReporterDiagnosticsState {
	readonly included: Partial<Record<DiagnosticOption, boolean>>;
	readonly expanded: Set<DiagnosticOption>;
}

export class IssueReporterOverlay {

	private readonly disposables = new DisposableStore();
	private readonly screenshotDisposables = this.disposables.add(new DisposableStore());
	private readonly _onDidClose = new Emitter<void>();
	readonly onDidClose: Event<void> = this._onDidClose.event;
	private readonly _onDidSubmit = new Emitter<{ title: string; body: string }>();
	readonly onDidSubmit: Event<{ title: string; body: string }> = this._onDidSubmit.event;
	private readonly _onDidRequestScreenshot = new Emitter<string>();
	readonly onDidRequestScreenshot: Event<string> = this._onDidRequestScreenshot.event;
	private readonly _onDidRequestStartRecording = new Emitter<void>();
	readonly onDidRequestStartRecording: Event<void> = this._onDidRequestStartRecording.event;
	private readonly _onDidRequestStopRecording = new Emitter<void>();
	readonly onDidRequestStopRecording: Event<void> = this._onDidRequestStopRecording.event;
	private readonly _onDidRequestOpenFile = new Emitter<string>();
	readonly onDidRequestOpenFile: Event<string> = this._onDidRequestOpenFile.event;
	private readonly _onDidChangeAttachments = new Emitter<void>();
	/** Fires when attachments change so their input can retain ownership. */
	readonly onDidChangeAttachments: Event<void> = this._onDidChangeAttachments.event;
	private readonly _onDidRequestAddAttachments = this.disposables.add(new Emitter<readonly IIssueReporterAttachmentImport[]>());
	readonly onDidRequestAddAttachments = this._onDidRequestAddAttachments.event;

	private wizardPanel!: HTMLElement;
	private updateBanner!: HTMLElement;
	private formContent!: HTMLElement;

	private readonly issueTypeButtons: Button[] = [];
	private readonly issueSourceButtons: Button[] = [];
	private selectedIssueType: IssueType | undefined;
	private selectedIssueSource: IssueSource | undefined;
	private selectedExtension: IssueReporterExtensionData | undefined;
	private sourceButtonGroup!: HTMLElement;
	private sourceError!: HTMLElement;
	private targetStatus!: HTMLElement;
	private readonly repositoryPicker = this.disposables.add(new MutableDisposable());
	private extensionField!: HTMLElement;
	private extensionSelect!: SelectBox;
	private extensionOptions: { label: string; value: string | undefined; hidden?: boolean }[] = [];
	private extensionError!: HTMLElement;
	private extensionStatus!: HTMLElement;
	private didAttemptSubmit = false;
	private diagnosticsContainer!: HTMLElement;
	private extensionDataRequest = 0;
	private typeButtonGroup!: HTMLElement;
	private typeError!: HTMLElement;
	private descriptionContainer!: HTMLElement;
	private descriptionPreview!: HTMLElement;
	private descriptionWriteTab!: Button;
	private descriptionPreviewTab!: Button;
	private previewingDescription = false;
	private readonly descriptionPreviewDisposables = this.disposables.add(new DisposableStore());
	private descriptionGuidance!: HTMLElement;
	private descriptionError!: HTMLElement;
	private titleInput!: InputBox;
	private titleError!: HTMLElement;
	private generateTitleBtn!: Button;
	private readonly _onDidRequestGenerateTitle = new Emitter<string>();
	readonly onDidRequestGenerateTitle: Event<string> = this._onDidRequestGenerateTitle.event;

	private screenshotContainer!: HTMLElement;
	private screenshotAddCard: HTMLElement | undefined;
	private addFilesButton!: Button;
	private attachmentStatus!: HTMLElement;
	private attachmentErrorDetails!: HTMLDetailsElement;
	private attachmentErrorDetailText!: HTMLElement;
	private readonly attachmentErrors = new Set<string>();
	private attachmentUploadError: string | undefined;
	private disposed = false;
	private screenshotDelay = 0;
	private recordingElapsedTimer: number | undefined;
	private recordingStartTime = 0;
	private currentRecordingState = RecordingState.Idle;
	private delayedScreenshotPending = false;
	private screenshotCapturePending = false;
	private readonly attachments: (IssueReporterAttachment<IScreenshot> | PendingAttachment)[] = [];

	private readonly attachmentCards = new Map<string, HTMLElement>();
	private readonly diagnosticsDisposables = this.disposables.add(new DisposableStore());
	private readonly diagnosticControls = new Map<DiagnosticOption, { include: HTMLElement; details: HTMLElement }>();
	private readonly descriptionGuidanceDisposables = new DisposableStore();
	private uploading = false;
	private performanceInfoLoaded = false;
	private performanceInfoRefreshing = false;

	private previewButton!: Button;
	private previewConsent!: HTMLElement;
	private readonly model: IssueReporterModel;
	private visible = false;
	private floatingBar: HTMLElement | undefined;
	private previewOpened = false;
	private previewedDraftKey: string | undefined;
	private submittedDraftKey: string | undefined;
	private closeButton: Button | undefined;
	private _hideToolbarInScreenshots = true;

	private get descriptionInput(): HTMLTextAreaElement {
		return this.input.descriptionInput;
	}

	constructor(
		private data: IssueReporterData,
		private readonly input: IssueReporterEditorInput,
		private readonly recordingSupported: boolean = false,
		private readonly container: HTMLElement,
		private readonly contextViewService: IContextViewService,
		private readonly contextMenuProvider: IContextMenuProvider | undefined = undefined,
		initialHideToolbar: boolean = true,
		private readonly resolveExtensionIssueData: ((extensionId: string) => Promise<IssueReporterData | undefined>) | undefined = undefined,
		private readonly openExternalLink: ((url: string) => Promise<void>) | undefined = undefined,
		private showUpdateBanner = false,
		private readonly refreshPerformanceInfo: (() => Promise<void>) | undefined = undefined,
		/** Returns the user's currently-bound keybinding for the given command id, or undefined when unbound. */
		private readonly resolveKeybinding: ((commandId: string) => ResolvedKeybinding | undefined) | undefined = undefined,
		private readonly diagnosticsState: IIssueReporterDiagnosticsState = { included: {}, expanded: new Set() },
		private readonly captureContainer: HTMLElement = container,
		@ILogService private readonly logService: ILogService,
		@IMarkdownRendererService private readonly markdownRendererService: IMarkdownRendererService,
		@IHoverService private readonly hoverService: IHoverService,
		@IClipboardService private readonly clipboardService: IClipboardService,
		@INotificationService private readonly notificationService: INotificationService,
	) {
		this._hideToolbarInScreenshots = initialHideToolbar;
		const hasStandaloneExtensionData = !!data.data && !data.extensionId;
		this.model = this.disposables.add(new IssueReporterModel({
			...data,
			issueDescription: this.descriptionInput.value,
			issueType: data.issueType || IssueType.Bug,
			allExtensions: data.enabledExtensions,
			extensionData: hasStandaloneExtensionData ? data.data : undefined,
			includeSystemInfo: true,
			includeWorkspaceInfo: true,
			includeProcessInfo: true,
			includeExtensions: true,
			includeExperiments: true,
			includeExtensionData: hasStandaloneExtensionData,
		}));
		this.selectedIssueType = data.issueType;
		this.selectedIssueSource = data.issueSource ?? (data.extensionId ? IssueSource.Extension : undefined);
		this.model.update(this.getDiagnosticOptions());

		this.createForm();
	}

	private createForm(): void {
		this.wizardPanel = append(this.container, $('div.issue-reporter-wizard'));
		this.wizardPanel.setAttribute('role', 'dialog');
		this.wizardPanel.setAttribute('aria-label', localize('reportIssue', "Report Issue"));
		this.wizardPanel.setAttribute('tabindex', '-1');

		this.updateBanner = append(this.wizardPanel, $('div.wizard-update-banner'));
		this.updateBanner.setAttribute('role', 'status');
		this.updateBanner.setAttribute('aria-live', 'polite');
		this.updateBanner.textContent = localize('updateAvailable', "A new version of {0} is available.", product.nameLong);
		this.setUpdateAvailable(this.showUpdateBanner);

		this.formContent = append(this.wizardPanel, $('div.issue-reporter-form'));
		this.createReportFields(this.formContent);
		this.createAttachmentsSection(this.formContent);

		const diagnostics = append(this.formContent, $('section.wizard-diagnostics'));
		append(diagnostics, $('h2.wizard-heading')).textContent = localize('optionalDiagnostics', "Diagnostics (optional)");
		append(diagnostics, $('p.wizard-subtitle')).textContent = localize('diagnosticChoices', "Choose which diagnostic information to include. Expand a section to review its details.");
		this.diagnosticsContainer = append(diagnostics, $('div.review-diagnostics'));
		this.updateDiagnostics();

		const actions = append(this.formContent, $('div.wizard-actions'));
		this.previewButton = this.disposables.add(new Button(actions, { ...defaultButtonStyles, supportIcons: true }));
		this.previewButton.element.classList.add('wizard-preview');
		this.disposables.add(this.previewButton.onDidClick(() => this.submit()));
		this.previewConsent = append(this.formContent, $('p.wizard-subtitle'));

		this.registerAttachmentInput();
		if (this.data.extensionId) {
			void this.updateSelectedExtension(this.data.extensionId, false);
		}
		this.updatePreviewButton();
		this.createFloatingCaptureBar();
	}

	private createAttachmentsSection(parent: HTMLElement): void {
		const page = append(parent, $('section.wizard-attachments'));

		const heading = append(page, $('h2.wizard-heading'));
		heading.textContent = localize('attachmentsHeading', "Attachments");

		const importHint = append(page, $('p.wizard-subtitle.wizard-attachment-hint'));
		importHint.textContent = localize('attachmentImportHint', "Drop or paste up to {0} files. Images: 10 MB. Videos: 100 MB. Other files: 25 MB. Files stay local until you preview on GitHub.", MAX_ATTACHMENTS);
		const fileInput = append(page, $<HTMLInputElement>('input'));
		fileInput.type = 'file';
		fileInput.multiple = true;
		fileInput.hidden = true;
		this.addFilesButton = this.disposables.add(new Button(page, { ...defaultButtonStyles, secondary: true }));
		this.addFilesButton.label = localize('addFiles', "Add Files...");
		this.disposables.add(this.addFilesButton.onDidClick(() => fileInput.click()));
		this.disposables.add(addDisposableListener(fileInput, EventType.CHANGE, () => {
			this.requestAddAttachments(Array.from(fileInput.files ?? []));
			fileInput.value = '';
		}));

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
		this.screenshotContainer.tabIndex = 0;
		this.screenshotContainer.setAttribute('role', 'group');
		this.screenshotContainer.setAttribute('aria-label', localize('attachmentArea', "Attachments. Paste or drop files here."));
		this.attachmentStatus = append(page, $('p.wizard-subtitle.wizard-attachment-status'));
		this.attachmentStatus.setAttribute('role', 'status');
		this.attachmentStatus.setAttribute('aria-live', 'polite');
		this.attachmentStatus.setAttribute('aria-atomic', 'true');
		this.attachmentStatus.hidden = true;
		this.attachmentErrorDetails = append(page, $('details.wizard-attachment-error-details'));
		this.attachmentErrorDetails.hidden = true;
		append(this.attachmentErrorDetails, $('summary')).textContent = localize('attachmentErrorDetails', "Technical details");
		const copyDetailsButton = this.disposables.add(new Button(this.attachmentErrorDetails, { ...defaultButtonStyles, secondary: true }));
		copyDetailsButton.element.classList.add('wizard-copy-error-details');
		copyDetailsButton.element.setAttribute('aria-label', localize('copyAttachmentErrorDetails', "Copy technical details"));
		copyDetailsButton.label = localize('copy', "Copy");
		this.attachmentErrorDetailText = append(this.attachmentErrorDetails, $('pre'));
		this.disposables.add(copyDetailsButton.onDidClick(async () => {
			try {
				await this.clipboardService.writeText(this.attachmentErrorDetailText.textContent ?? '');
				if (!this.disposed) {
					status(localize('attachmentErrorDetailsCopied', "Technical details copied."));
				}
			} catch (error) {
				this.logService.error('[IssueReporter] Failed to copy technical details:', error);
				this.notificationService.error(localize('copyAttachmentErrorDetailsFailed', "Could not copy technical details: {0}", toErrorMessage(error)));
			}
		}));
		this.updateScreenshotThumbnails();
	}

	private captureStripCaptureBtn: Button | undefined;
	private captureStripDelayBtn: Button | undefined;
	private captureStripRecordBtn: Button | undefined;

	private createFloatingCaptureBar(): void {
		const targetWindow = getWindow(this.captureContainer);
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
				const reservation = this.reserveAttachment('screenshot');
				if (!reservation) {
					return;
				}
				// Lock width so button doesn't shrink during countdown
				captureBtn.element.style.minWidth = `${captureBtn.element.offsetWidth}px`;
				captureBtn.enabled = false;
				this.delayedScreenshotPending = true;
				this.updateScreenshotThumbnails();
				this.updateAttachmentButtons();
				let remaining = this.screenshotDelay;
				captureBtn.label = `${remaining}...`;
				const targetWindow = getWindow(this.captureContainer);
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
						this.requestScreenshot(reservation);
					}
				}, 1000));
			} else {
				this.requestScreenshot();
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

	private createReportFields(page: HTMLElement): void {
		const heading = append(page, $('h2.wizard-heading'));
		heading.textContent = localize('describeHeading', "Describe your feedback");

		// Issue guidance link — keep the same wording as the classic reporter.
		if (this.markdownRendererService) {
			const guidanceContainer = append(page, $('div.wizard-issue-guidance'));
			const guidanceMd = new MarkdownString(localize(
				{
					key: 'reviewGuidanceLabelWizard',
					comment: ['{Locked="https://github.com/microsoft/vscode/wiki/Submitting-Bugs-and-Suggestions"}']
				},
				'Before you report an issue here please [review the guidance we provide](https://github.com/microsoft/vscode/wiki/Submitting-Bugs-and-Suggestions). Please complete the form in English.'
			), { isTrusted: true });
			const rendered = this.markdownRendererService.render(guidanceMd, {
				actionHandler: async (link: string) => {
					await this.openExternalLink?.(link);
					return true;
				},
			});
			guidanceContainer.appendChild(rendered.element);
			this.disposables.add(rendered);
		}

		// Issue source selection + extension dropdown share a row when both are visible
		const targetRow = append(page, $('div.wizard-target-row'));
		const sourceField = append(targetRow, $('div.wizard-field.wizard-source-field'));
		const sourceLabel = append(sourceField, $('label.wizard-field-label'));
		sourceLabel.textContent = localize('target', "Target");
		this.appendRequiredMarker(sourceLabel);
		this.sourceButtonGroup = append(sourceField, $('div.wizard-type-buttons.wizard-source-buttons'));
		// Create a button for every source up front so async-loaded extensions can
		// reveal the Extension target later; updateIssueSourceButtons() controls
		// which buttons are visible.
		for (const option of this.getAllSourceOptions()) {
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
		this.targetStatus.setAttribute('role', 'status');

		this.extensionField = append(targetRow, $('div.wizard-field.wizard-extension-field'));
		const extensionLabel = append(this.extensionField, $('label.wizard-field-label'));
		extensionLabel.textContent = localize('extension', "Extension");
		this.appendRequiredMarker(extensionLabel);
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

		// Default the target to the most likely option when the reporter opens.
		// In the Agents Window we preselect Agents Window; otherwise default to
		// VS Code (the most common target). Extension is preselected only when an
		// extension id was already provided. The user can always override.
		if (!this.selectedIssueSource) {
			if (this.data.extensionId) {
				this.selectedIssueSource = IssueSource.Extension;
			} else if (this.data.isSessionsWindow) {
				this.selectedIssueSource = IssueSource.AgentsWindow;
			} else {
				this.selectedIssueSource = IssueSource.VSCode;
			}
			this.updateIssueSourceFlags();
		}
		this.updateIssueSourceButtons();

		// Category selection
		const catLabel = append(page, $('label.wizard-field-label'));
		catLabel.textContent = localize('feedbackCategory', "Category");
		this.appendRequiredMarker(catLabel);

		this.typeButtonGroup = append(page, $('div.wizard-type-buttons'));

		const selectType = (type: IssueType) => {
			this.selectedIssueType = type;
			this.updateIssueTypeButtons();
			this.setFieldError(this.typeButtonGroup, this.typeError, false);
			this.updateDescriptionGuidance();
			this.updateIssueSourceButtons();
			this.updateDiagnostics();
			this.updatePreviewButton();
		};

		for (const { type, label, icon } of this.getAllIssueTypeOptions()) {
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
		this.appendRequiredMarker(titleLabel);

		const aiBtn = this.disposables.add(new Button(titleLabelRow, { ...defaultButtonStyles, secondary: true, supportIcons: true }));
		aiBtn.label = `$(sparkle) ${localize('generateTitleBtn', "Generate from description")}`;
		aiBtn.element.classList.add('wizard-ai-title-btn');
		aiBtn.element.title = localize('generateTitle', "Generate title from description");
		aiBtn.enabled = !!this.data.issueBody?.trim();
		this.disposables.add(aiBtn.onDidClick(() => {
			const desc = this.descriptionInput.value.trim();
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
			ariaLabel: localize('issueTitle', "Title"),
			placeholder: localize('issueTitlePlaceholder', "Brief summary of the issue"),
			inputBoxStyles: defaultInputBoxStyles,
		}));
		this.updateTitlePlaceholder();
		if (this.data.issueTitle) {
			this.titleInput.value = this.data.issueTitle;
		}
		this.disposables.add(this.titleInput.onDidChange(() => {
			this.data.issueTitle = this.titleInput.value;
			this.model.update({ issueTitle: this.titleInput.value });
			if (this.titleInput.value.trim()) {
				this.setFieldError(this.titleInput.element, this.titleError, false);
			}
			this.updatePreviewButton();
		}));
		this.titleError = this.createFieldError(titleGroup, localize('titleRequired', "Enter a title to continue."));

		const descriptionGroup = append(page, $('div.wizard-field'));
		const descLabel = append(descriptionGroup, $<HTMLLabelElement>('label.wizard-field-label'));
		descLabel.textContent = localize('description', "Description");
		this.appendRequiredMarker(descLabel);

		this.descriptionGuidance = append(descriptionGroup, $('p.wizard-subtitle.wizard-description-guidance'));
		this.updateDescriptionGuidance();

		const tabs = append(descriptionGroup, $('div.wizard-description-tabs'));
		tabs.setAttribute('role', 'tablist');
		tabs.setAttribute('aria-label', localize('descriptionMode', "Description mode"));
		this.descriptionWriteTab = this.disposables.add(new Button(tabs, { ...defaultButtonStyles, secondary: true }));
		this.descriptionWriteTab.label = localize('writeDescription', "Write");
		this.descriptionPreviewTab = this.disposables.add(new Button(tabs, { ...defaultButtonStyles, secondary: true }));
		this.descriptionPreviewTab.label = localize('previewDescription', "Preview");
		for (const [button, preview] of [[this.descriptionWriteTab, false], [this.descriptionPreviewTab, true]] as const) {
			button.element.setAttribute('role', 'tab');
			this.disposables.add(button.onDidClick(() => this.setDescriptionPreview(preview)));
		}
		this.disposables.add(addDisposableListener(tabs, EventType.KEY_DOWN, event => {
			const keyboardEvent = new StandardKeyboardEvent(event);
			if (keyboardEvent.keyCode === KeyCode.LeftArrow || keyboardEvent.keyCode === KeyCode.RightArrow || keyboardEvent.keyCode === KeyCode.Home || keyboardEvent.keyCode === KeyCode.End) {
				keyboardEvent.preventDefault();
				keyboardEvent.stopPropagation();
				const preview = keyboardEvent.keyCode === KeyCode.End || keyboardEvent.keyCode !== KeyCode.Home && !this.previewingDescription;
				this.setDescriptionPreview(preview);
				(preview ? this.descriptionPreviewTab : this.descriptionWriteTab).element.focus();
			}
		}));
		this.descriptionContainer = append(descriptionGroup, $('div.wizard-description-editor'));
		this.descriptionInput.classList.add('wizard-description-input');
		this.descriptionInput.setAttribute('aria-label', localize('descriptionInputLabel', "Description, Markdown. Paste or drop files to attach them."));
		this.descriptionInput.rows = 10;
		this.descriptionInput.required = true;
		this.restoreDescriptionInput();
		const descriptionId = `issue-description-${generateUuid()}`;
		this.descriptionInput.id ||= descriptionId;
		descLabel.htmlFor = this.descriptionInput.id;
		this.descriptionGuidance.id = `${descriptionId}-guidance`;
		this.descriptionInput.setAttribute('aria-describedby', this.descriptionGuidance.id);
		this.descriptionPreview = append(descriptionGroup, $('div.wizard-description-preview'));
		this.descriptionPreview.tabIndex = 0;
		for (const [button, panel, suffix] of [[this.descriptionWriteTab, this.descriptionContainer, 'write'], [this.descriptionPreviewTab, this.descriptionPreview, 'preview']] as const) {
			const id = `${descriptionId}-${suffix}`;
			button.element.id = `${id}-tab`;
			button.element.setAttribute('aria-controls', id);
			panel.id = id;
			panel.setAttribute('role', 'tabpanel');
			panel.setAttribute('aria-labelledby', button.element.id);
		}
		this.setDescriptionPreview(false);
		this.disposables.add(addDisposableListener(this.descriptionInput, EventType.INPUT, () => {
			if (!this.descriptionContainer.contains(this.descriptionInput)) {
				return;
			}
			this.data.issueBody = this.descriptionInput.value;
			this.model.update({ issueDescription: this.data.issueBody });
			if (this.hasDescriptionContent()) {
				this.setFieldError(this.descriptionContainer, this.descriptionError, false);
			}
			this.updateGenerateTitleButtonState();
			this.updatePreviewButton();
			if (this.previewingDescription) {
				this.renderDescriptionPreview();
			}
		}));
		this.descriptionError = this.createFieldError(descriptionGroup, localize('descriptionRequired', "Enter a description to continue."));
		this.descriptionError.id = `${descriptionId}-error`;
		this.disposables.add(addDisposableListener(this.descriptionContainer, EventType.PASTE, (event: ClipboardEvent) => {
			const files = this.getAttachmentFiles(event.clipboardData);
			if (!files.length || event.defaultPrevented) {
				return;
			}
			if (!event.clipboardData?.getData('text/plain')) {
				event.preventDefault();
				event.stopPropagation();
			}
			this.requestAddAttachments(files);
		}, true));

		this.updateIssueSourceFlags();
		this.updateTargetStatus();

		// Default the category to Bug (most common). Must run after
		// descriptionGuidance is initialized because selectType ->
		// updateDescriptionGuidance touches it.
		if (this.selectedIssueType === undefined) {
			selectType(IssueType.Bug);
		} else {
			selectType(this.selectedIssueType);
		}
	}

	private setDescriptionPreview(preview: boolean): void {
		this.previewingDescription = preview;
		this.descriptionContainer.hidden = preview;
		this.descriptionPreview.hidden = !preview;
		this.descriptionWriteTab.element.setAttribute('aria-selected', String(!preview));
		this.descriptionPreviewTab.element.setAttribute('aria-selected', String(preview));
		this.descriptionWriteTab.element.tabIndex = preview ? -1 : 0;
		this.descriptionPreviewTab.element.tabIndex = preview ? 0 : -1;
		if (preview) {
			this.renderDescriptionPreview();
		} else {
			this.descriptionPreviewDisposables.clear();
			this.descriptionPreview.replaceChildren();
		}
	}

	private renderDescriptionPreview(): void {
		this.descriptionPreviewDisposables.clear();
		this.descriptionPreview.replaceChildren();
		const text = this.descriptionInput.value;
		if (!text.trim()) {
			this.descriptionPreview.textContent = localize('emptyDescriptionPreview', "Nothing to preview.");
			return;
		}
		const rendered = this.descriptionPreviewDisposables.add(this.markdownRendererService.render(new MarkdownString(text)));
		this.descriptionPreview.appendChild(rendered.element);
	}

	restoreDescriptionInput(): void {
		this.input.attachDescriptionInput(this.descriptionContainer);
		if (this.descriptionError) {
			this.setFieldError(this.descriptionContainer, this.descriptionError, this.descriptionContainer.classList.contains('invalid-input'));
		}
		if (this.previewingDescription) {
			this.renderDescriptionPreview();
		}
	}

	private insertDescriptionText(text: string, atEnd = false): void {
		const input = this.descriptionInput;
		const targetWindow = getWindow(input);
		const activeElement = targetWindow.document.activeElement;
		const { selectionStart, selectionEnd, selectionDirection } = input;
		this.descriptionContainer.hidden = false;
		if (atEnd) {
			input.setSelectionRange(input.value.length, input.value.length);
		}
		// Native insertion preserves undo without focusing a background reporter window.
		if (!atEnd || targetWindow.document.hasFocus()) {
			input.focus({ preventScroll: true });
		}
		if (targetWindow.document.activeElement !== input || !targetWindow.document.execCommand('insertText', false, text)) {
			input.setRangeText(text, input.selectionStart, input.selectionEnd, 'end');
			input.dispatchEvent(new InputEvent('input', { bubbles: true }));
		}
		if (atEnd) {
			input.setSelectionRange(selectionStart, selectionEnd, selectionDirection);
		}
		if (targetWindow.document.hasFocus() && isHTMLElement(activeElement)) {
			activeElement.focus({ preventScroll: true });
		}
		this.descriptionContainer.hidden = this.previewingDescription;
	}

	private appendRequiredMarker(label: HTMLElement): void {
		const marker = append(label, $('span.wizard-required-marker'));
		marker.textContent = '*';
		marker.setAttribute('aria-hidden', 'true');
	}

	private getAllIssueTypeOptions(): { type: IssueType; label: string; icon: { id: string } }[] {
		return [
			{ type: IssueType.Bug, label: localize('bug', "Bug"), icon: Codicon.bug },
			{ type: IssueType.FeatureRequest, label: localize('featureRequest', "Feature Request"), icon: Codicon.lightbulb },
			{ type: IssueType.PerformanceIssue, label: localize('performanceIssue', "Performance Issue"), icon: Codicon.dashboard },
		];
	}

	private getIssueTypeOptions(): { type: IssueType; label: string; icon: { id: string } }[] {
		const options = this.getAllIssueTypeOptions();
		// The Marketplace target is for issues with the marketplace site/service
		// itself, where performance metrics from a single VS Code instance aren't useful.
		if (this.selectedIssueSource === IssueSource.Marketplace) {
			return options.filter(o => o.type !== IssueType.PerformanceIssue);
		}
		return options;
	}

	private getAllSourceOptions(): { label: string; value: IssueSource }[] {
		return [
			{ label: product.nameLong || localize('vscode', "Visual Studio Code"), value: IssueSource.VSCode },
			{ label: localize('agentsWindow', "Agents Window"), value: IssueSource.AgentsWindow },
			{ label: localize('extensionSource', "A VS Code extension"), value: IssueSource.Extension },
			{ label: localize('marketplace', "Extensions Marketplace"), value: IssueSource.Marketplace },
		];
	}

	private getSourceOptions(): { label: string; value: IssueSource }[] {
		const options = this.getAllSourceOptions();
		// The Extension target only applies when there are non-builtin, non-theme
		// extensions to report against, which never happens in the Agents Window.
		if (this.data.isSessionsWindow || !this.hasReportableExtensions()) {
			return options.filter(o => o.value !== IssueSource.Extension);
		}
		return options;
	}

	private hasReportableExtensions(): boolean {
		const modelData = this.model.getData();
		const sourceExtensions = modelData.enabledNonThemeExtesions ?? modelData.allExtensions ?? [];
		return sourceExtensions.some(extension => !extension.isTheme && !extension.isBuiltin);
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
		this.setFieldError(this.sourceButtonGroup, this.sourceError, this.didAttemptSubmit && !source);
		this.updateIssueSourceFlags();
		this.updateIssueSourceButtons();
		this.updateIssueTypeButtons();
		this.updateExtensionValidation();
		this.updateTitlePlaceholder();
		this.updateTargetStatus();
		this.updateDescriptionGuidance();
		this.updateDiagnostics();
		this.updatePreviewButton();
	}

	private setIssueRepository(repository: string): void {
		this.data.issueRepository = repository;
		this.updateTargetStatus();
		this.updatePreviewButton();
	}

	private updateIssueTypeButtons(): void {
		if (!this.issueTypeButtons.length) {
			return;
		}
		const allowedTypes = new Set(this.getIssueTypeOptions().map(option => String(option.type)));
		if (!allowedTypes.has(String(this.selectedIssueType))) {
			this.selectedIssueType = IssueType.Bug;
		}
		this.data.issueType = this.selectedIssueType;
		this.model.update({ issueType: this.selectedIssueType });
		for (const button of this.issueTypeButtons) {
			const buttonType = button.element.getAttribute('data-type');
			const isAvailable = !!buttonType && allowedTypes.has(buttonType);
			button.element.classList.toggle('hidden', !isAvailable);
			const isSelected = isAvailable && buttonType === String(this.selectedIssueType);
			button.element.classList.toggle('selected', isSelected);
			button.element.setAttribute('aria-pressed', String(isSelected));
		}
	}

	private updateIssueSourceFlags(): void {
		const fileOnExtension = this.selectedIssueSource === IssueSource.Extension;
		const fileOnMarketplace = this.selectedIssueSource === IssueSource.Marketplace;
		const fileOnProduct = this.selectedIssueSource === IssueSource.VSCode || this.selectedIssueSource === IssueSource.AgentsWindow || this.selectedIssueSource === IssueSource.Unknown;
		const fileOnAgentsWindow = this.selectedIssueSource === IssueSource.AgentsWindow;
		this.model.update({
			issueSource: this.selectedIssueSource,
			fileOnExtension,
			fileOnMarketplace,
			fileOnProduct,
			isSessionsWindow: fileOnAgentsWindow ? true : this.data.isSessionsWindow,
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
			case IssueSource.AgentsWindow:
				this.titleInput.setPlaceHolder(localize('agentsWindowPlaceholder', "E.g. Sessions list does not refresh after creating a new session"));
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
		this.setFieldError(this.extensionField, this.extensionError, this.didAttemptSubmit && (!hasExtension || !hasExtensionIssueUrl));
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
			return;
		}

		// Apply preset data before the built-in source switch can return.
		const hasPresetData = this.model.getData().extensionData === undefined && (this.data.data !== undefined || this.data.uri !== undefined || this.data.privateUri !== undefined);
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
	}

	private applyExtensionIssueData(extension: IssueReporterExtensionData, issueData: IssueReporterData): void {
		extension.data = issueData.data;
		extension.uri = issueData.uri;
		extension.privateUri = issueData.privateUri;
		this.data.data = issueData.data;
		this.input.updateDefaultContent(() => {
			if (issueData.issueTitle && !this.titleInput.value.trim()) {
				this.titleInput.value = issueData.issueTitle;
			}
			if (issueData.issueBody && !this.descriptionInput.value.includes(issueData.issueBody)) {
				this.insertDescriptionText(`${this.descriptionInput.value ? '\n' : ''}${issueData.issueBody}`, true);
			}
		});
		if (issueData.data) {
			extension.extensionData = issueData.data;
			this.model.update({ extensionData: issueData.data });
			this.model.update(this.getDiagnosticOptions());
		}
		this.updateDiagnostics();
		this.updatePreviewButton();
	}

	private updateTargetStatus(): void {
		this.updatePreviewButton();
		this.repositoryPicker.clear();
		this.targetStatus.textContent = '';
		this.extensionStatus.textContent = '';
		if (!this.selectedIssueSource) {
			return;
		}

		if (this.selectedIssueSource !== IssueSource.Extension) {
			this.repositoryPicker.value = renderIssueReporterRepositoryPicker(this.targetStatus, this.data, product, this.contextMenuProvider, repository => this.setIssueRepository(repository));
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
			this.extensionStatus.textContent = this.getIssueRepositoryLabel();
		}
	}

	private getIssueRepositoryLabel(): string {
		const target = resolveIssueReporterTarget(this.data, product);
		if (!target) {
			return localize('invalidIssueRepository', "Invalid issue destination");
		}
		const repository = target.repository;
		const label = repository ? `${repository.owner}/${repository.repositoryName}` : target.url;
		return label;
	}

	private getSelectedExtensionIssueUrl(): string | undefined {
		return resolveIssueReporterTarget({ ...this.data, issueSource: IssueSource.Extension }, product)?.url;
	}

	private getIssueSourceLabel(): string {
		switch (this.selectedIssueSource) {
			case IssueSource.VSCode:
				return product.nameLong || localize('vscode', "Visual Studio Code");
			case IssueSource.AgentsWindow:
				return localize('agentsWindow', "Agents Window");
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
		return resolveIssueReporterTarget(this.data, product)?.url;
	}

	private isGitHubUrl(url: string): boolean {
		return /^https?:\/\/github\.com\//i.test(url);
	}

	/** Update the guidance text above the description based on selected category */
	private updateDescriptionGuidance(): void {
		const markdownHint = localize('markdownSupported', "Markdown formatting is supported.");
		const perfWikiUrl = 'https://github.com/microsoft/vscode/wiki/Performance-Issues';

		// Reset before updating
		this.descriptionGuidanceDisposables.clear();
		this.descriptionGuidance.textContent = '';
		this.descriptionGuidance.classList.remove('wizard-description-guidance-with-link');

		const appendText = (text: string) => {
			const targetDocument = getWindow(this.container).document;
			this.descriptionGuidance.appendChild(targetDocument.createTextNode(text));
		};

		switch (this.selectedIssueType) {
			case IssueType.Bug:
				appendText(`${localize('bugGuidance', "Describe what happened, the steps to reproduce, what you expected, and what you observed instead.")}\n${markdownHint}`);
				break;
			case IssueType.FeatureRequest:
				appendText(`${localize('featureGuidance', "Describe the feature you'd like to see, what problem it would solve, and any alternatives you've considered.")}\n${markdownHint}`);
				break;
			case IssueType.PerformanceIssue: {
				appendText(`${localize('perfGuidance', "Describe what is slow, when it happens, whether it's consistent or intermittent, and any patterns you've noticed.")} `);
				const link = $('a.wizard-description-guidance-link') as HTMLAnchorElement;
				link.href = perfWikiUrl;
				link.textContent = localize('perfWikiLink', "See the performance issue reporting guide.");
				this.descriptionGuidanceDisposables.add(addDisposableListener(link, EventType.CLICK, e => {
					e.preventDefault();
					this.openExternalLink?.(perfWikiUrl);
				}));
				this.descriptionGuidance.appendChild(link);
				appendText(`\n${markdownHint}`);
				this.descriptionGuidance.classList.add('wizard-description-guidance-with-link');
				break;
			}
			default:
				appendText(`${localize('defaultGuidance', "Select a category above, then describe your feedback in detail.")}\n${markdownHint}`);
				break;
		}
	}

	private hasDescriptionContent(): boolean {
		return !!this.descriptionInput.value.trim();
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
		field.setAttribute('aria-invalid', String(hasError));
		if (field === this.descriptionContainer) {
			this.descriptionInput.setAttribute('aria-invalid', String(hasError));
			this.descriptionInput.setAttribute('aria-describedby', hasError ? `${this.descriptionGuidance.id} ${error.id}` : this.descriptionGuidance.id);
		}
		error.classList.toggle('hidden', !hasError);
	}

	private canSubmit(): boolean {
		return !this.hasPendingOperations()
			&& (this.selectedIssueType !== IssueType.PerformanceIssue || this.performanceInfoLoaded && !this.performanceInfoRefreshing);
	}

	private updatePreviewButton(): void {
		this.clearStaleAttachmentUploads();
		if (!this.previewButton) {
			return;
		}
		const waitingForData = this.selectedIssueType === IssueType.PerformanceIssue && (!this.performanceInfoLoaded || this.performanceInfoRefreshing);
		const external = resolveIssueReporterTarget(this.data, product)?.external;
		this.previewButton.label = this.uploading ? localize('uploading', "Uploading...")
			: waitingForData ? `$(loading~spin) ${localize('loadingDiagnostics', "Loading diagnostics...")}`
				: external ? localize('openExternalIssueReporter', "Open External Issue Reporter")
					: localize('previewOnGitHub', "Preview on GitHub");
		this.previewConsent.textContent = external
			? localize('externalReporterConsent', "Opens the extension's issue reporter without sending this report or its attachments.")
			: localize('previewConsent', "Preview uploads attachments and opens your report on GitHub. You can review it there before submitting.");
		this.previewButton.enabled = this.canSubmit();
		this.previewButton.element.title = this.previewButton.enabled ? this.previewButton.label
			: waitingForData ? localize('waitingForDiagnostics', "Waiting for performance diagnostics to finish loading")
				: localize('waitingForAttachments', "Wait for attachments and captures to finish.");
		if (this.closeButton) {
			this.closeButton.element.style.display = this.previewOpened && this.previewedDraftKey === this.getDraftKey() && this.canSubmit() ? '' : 'none';
		}
	}

	private getDiagnosticOptions(): Record<DiagnosticOption, boolean> {
		return {
			includeSystemInfo: true,
			includeProcessInfo: true,
			includeWorkspaceInfo: true,
			includeExtensions: true,
			includeExperiments: true,
			includeExtensionData: !!this.model.getData().extensionData || this.selectedIssueSource === IssueSource.Extension || !!this.data.extensionId,
			...this.diagnosticsState.included,
		};
	}

	private updateDiagnostics(): void {
		const diagContainer = this.diagnosticsContainer;
		if (!diagContainer || this.disposed) {
			return;
		}
		const activeElement = getWindow(diagContainer).document.activeElement;
		let focusedControl: { option: DiagnosticOption; control: 'include' | 'details' } | undefined;
		for (const [option, controls] of this.diagnosticControls) {
			if (activeElement === controls.include || activeElement === controls.details) {
				focusedControl = { option, control: activeElement === controls.include ? 'include' : 'details' };
				break;
			}
		}
		this.diagnosticsDisposables.clear();
		this.diagnosticControls.clear();
		diagContainer.textContent = '';

		const modelData = this.model.getData();

		this.createDiagSection(diagContainer, {
			option: 'includeSystemInfo',
			label: localize('systemInformation', "System Information"),
			renderContent: container => {
				if (modelData.versionInfo || modelData.systemInfo) {
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
				} else {
					append(container, $('div.review-diag-loading')).textContent = localize('loadingSystemInfo', "Loading system information...");
				}
			},
		});

		if (modelData.extensionData || this.selectedIssueSource === IssueSource.Extension || this.data.extensionId) {
			this.createDiagSection(diagContainer, {
				option: 'includeExtensionData',
				label: localize('extensionData', "Extension Data"),
				renderContent: (container) => {
					const pre = append(container, $('pre.review-diag-pre'));
					pre.textContent = modelData.extensionData ?? localize('extensionDataUnavailable', "No extension data is available yet.");
				},
			});
		}

		// Extensions (non-theme only)
		const nonThemeExtensions = (modelData.allExtensions ?? []).filter(e => !e.isTheme && !e.isBuiltin);
		if (!modelData.fileOnExtension && !modelData.fileOnMarketplace) {
			this.createDiagSection(diagContainer, {
				option: 'includeExtensions',
				label: localize('extensions', "Extensions ({0})", nonThemeExtensions.length),
				renderContent: (container) => {
					if (nonThemeExtensions.length === 0) {
						append(container, $('div.review-diag-loading')).textContent = localize('noDiagnosticExtensions', "No extensions are currently listed.");
						return;
					}
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

		this.createDiagSection(diagContainer, {
			option: 'includeExperiments',
			label: localize('abExperiments', "A/B Experiments"),
			renderContent: container => {
				const pre = append(container, $('pre.review-diag-pre'));
				pre.textContent = modelData.experimentInfo ?? localize('experimentDataUnavailable', "No experiment data is available yet.");
			},
		});

		if (this.selectedIssueType === IssueType.PerformanceIssue && !modelData.fileOnMarketplace) {
			const performanceContainer = append(diagContainer, $('div.review-performance-data'));
			if (this.performanceInfoRefreshing) {
				performanceContainer.classList.add('refreshing');
			}
			const performanceTitleRow = append(performanceContainer, $('div.review-performance-title-row'));
			const performanceTitle = append(performanceTitleRow, $('div.review-performance-title'));
			performanceTitle.textContent = localize('additionalPerformanceData', "Additional Performance Data");
			if (this.refreshPerformanceInfo) {
				const refreshBtn = this.diagnosticsDisposables.add(new Button(performanceTitleRow, { ...defaultButtonStyles, secondary: true, supportIcons: true }));
				refreshBtn.element.classList.add('review-performance-refresh');
				refreshBtn.label = `$(refresh) ${localize('refresh', "Refresh")}`;
				refreshBtn.element.title = localize('refreshPerformanceData', "Reload running processes and workspace metadata");
				refreshBtn.enabled = !this.performanceInfoRefreshing;
				this.diagnosticsDisposables.add(refreshBtn.onDidClick(async () => {
					if (!this.refreshPerformanceInfo || this.performanceInfoRefreshing) {
						return;
					}
					this.performanceInfoRefreshing = true;
					refreshBtn.enabled = false;
					performanceContainer.classList.add('refreshing');
					this.updatePreviewButton();
					try {
						await this.refreshPerformanceInfo();
					} finally {
						this.performanceInfoRefreshing = false;
						this.updateDiagnostics();
						this.updatePreviewButton();
					}
				}));
			}
			const performanceDescription = append(performanceContainer, $('div.review-performance-description'));
			performanceDescription.textContent = localize('additionalPerformanceDataDescription', "Optionally include currently running processes and workspace metadata to help diagnose performance issues.");

			this.createDiagSection(performanceContainer, {
				option: 'includeProcessInfo',
				label: localize('runningProcesses', "Running Processes"),
				renderContent: container => {
					const pre = append(container, $('pre.review-diag-pre'));
					pre.textContent = modelData.processInfo ?? (this.performanceInfoLoaded
						? localize('processDataUnavailable', "No process information is available.")
						: localize('loadingProcessInfo', "Loading currently running processes..."));
				},
			});
			this.createDiagSection(performanceContainer, {
				option: 'includeWorkspaceInfo',
				label: localize('workspaceMetadata', "Workspace Metadata"),
				renderContent: container => {
					const pre = append(container, $('pre.review-diag-pre'));
					pre.textContent = modelData.workspaceInfo ?? (this.performanceInfoLoaded
						? localize('workspaceDataUnavailable', "No workspace metadata is available.")
						: localize('loadingWorkspaceInfo', "Loading workspace metadata..."));
				},
			});
		}

		if (focusedControl) {
			this.diagnosticControls.get(focusedControl.option)?.[focusedControl.control].focus();
		}
	}

	private createDiagSection(parent: HTMLElement, opts: {
		option: DiagnosticOption;
		label: string;
		renderContent: (container: HTMLElement) => void;
	}): void {
		const included = this.getDiagnosticOptions()[opts.option];
		const group = append(parent, $('div.review-diag-group'));
		group.dataset.diagnosticOption = opts.option;
		group.classList.toggle('excluded', !included);

		const header = append(group, $('div.review-diag-header'));

		const checkWrap = append(header, $('div.review-diag-check-wrap'));
		const checkbox = this.diagnosticsDisposables.add(new Checkbox(localize('includeDiagnostic', "Include {0}", opts.label), included, defaultCheckboxStyles));
		checkbox.domNode.classList.add('review-diag-checkbox');
		checkWrap.appendChild(checkbox.domNode);

		const toggleArea = append(header, $('div.review-diag-toggle-area'));
		toggleArea.setAttribute('role', 'button');
		toggleArea.setAttribute('tabindex', '0');
		toggleArea.setAttribute('aria-label', opts.label);

		const chevron = append(toggleArea, $('span.review-diag-chevron'));
		chevron.setAttribute('aria-hidden', 'true');

		const title = append(toggleArea, $('span.review-diag-title'));
		title.textContent = opts.label;

		const content = append(group, $('div.review-diag-content'));
		content.id = generateUuid();
		toggleArea.setAttribute('aria-controls', content.id);
		opts.renderContent(content);

		let expanded = this.diagnosticsState.expanded.has(opts.option);
		const setExpanded = (next: boolean) => {
			expanded = next;
			if (expanded) {
				this.diagnosticsState.expanded.add(opts.option);
			} else {
				this.diagnosticsState.expanded.delete(opts.option);
			}
			content.hidden = !expanded;
			toggleArea.setAttribute('aria-expanded', String(expanded));
			chevron.textContent = '';
			chevron.appendChild(renderIcon(expanded ? Codicon.chevronDown : Codicon.chevronRight));
		};
		setExpanded(expanded);
		this.diagnosticControls.set(opts.option, { include: checkbox.domNode, details: toggleArea });

		this.diagnosticsDisposables.add(addDisposableListener(toggleArea, EventType.CLICK, () => setExpanded(!expanded)));
		this.diagnosticsDisposables.add(addDisposableListener(toggleArea, EventType.KEY_DOWN, e => {
			const event = new StandardKeyboardEvent(e);
			if (event.equals(KeyCode.Enter) || event.equals(KeyCode.Space)) {
				e.preventDefault();
				setExpanded(!expanded);
			}
		}));

		this.diagnosticsDisposables.add(checkbox.onChange(() => {
			this.diagnosticsState.included[opts.option] = checkbox.checked;
			this.model.update({ [opts.option]: checkbox.checked });
			group.classList.toggle('excluded', !checkbox.checked);
			this.updatePreviewButton();
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
		if (this.disposed) {
			return;
		}
		this.uploading = uploading;
		this.wizardPanel.classList.toggle('uploading', uploading);
		this.updateAttachmentButtons();
	}

	setAttachmentUploadError(message: string | undefined, details?: string): void {
		if (this.disposed) {
			return;
		}
		this.attachmentUploadError = message;
		this.attachmentErrorDetails.hidden = !message || !details;
		this.attachmentErrorDetails.open = false;
		this.attachmentErrorDetailText.textContent = message ? details ?? '' : '';
		this.updateAttachmentImportStatus();
		if (message && this.visible && !this.disposed) {
			this.attachmentStatus.scrollIntoView({ block: 'nearest' });
		}
	}

	setAttachmentUploadState(attachment: IssueReporterAttachment, upload: IIssueReporterAttachmentUpload): void {
		const current = this.attachments.find(item => item.id === attachment.id);
		if (this.disposed || current !== attachment || upload.destination !== this.getIssueTargetUrl()) {
			return;
		}
		attachment.upload = upload;
		this.renderAttachmentUploadState(attachment);
		this._onDidChangeAttachments.fire();
	}

	private clearStaleAttachmentUploads(): void {
		const destination = this.getIssueTargetUrl();
		let changed = false;
		for (const attachment of this.getAttachments()) {
			if (attachment.upload && attachment.upload.destination !== destination) {
				attachment.upload = undefined;
				this.renderAttachmentUploadState(attachment);
				changed = true;
			}
		}
		if (changed) {
			this._onDidChangeAttachments.fire();
		}
	}

	private renderAttachmentUploadState(attachment: IssueReporterAttachment): void {
		const card = this.attachmentCards.get(attachment.id);
		if (!card) {
			return;
		}
		const state = attachment.upload && attachment.upload.destination === this.getIssueTargetUrl() ? attachment.upload.state : undefined;
		card.classList.remove('upload-pending', 'upload-uploading', 'upload-done');
		if (state) {
			card.classList.add(`upload-${state}`);
		}
		// eslint-disable-next-line no-restricted-syntax
		const overlay = card.querySelector('.review-progress-overlay') as HTMLElement | null;
		if (!overlay) {
			return;
		}

		overlay.textContent = '';
		overlay.setAttribute('role', 'img');
		overlay.setAttribute('aria-label', state === 'done' ? localize('attachmentUploaded', "Uploaded")
			: state === 'uploading' ? localize('attachmentUploading', "Uploading")
				: localize('attachmentPending', "Waiting to upload"));
		if (state === 'done') {
			const check = $('span.review-progress-check');
			check.appendChild(renderIcon(Codicon.check)).setAttribute('aria-hidden', 'true');
			overlay.appendChild(check);
		} else if (state) {
			append(overlay, $('div.review-progress-ring'));
		}
	}

	private submit(): void {
		if (!this.canSubmit()) {
			return;
		}
		this.didAttemptSubmit = true;
		const hasIssueSource = this.selectedIssueSource !== undefined;
		const hasExtension = this.selectedIssueSource !== IssueSource.Extension || !!this.selectedExtension && !!this.getSelectedExtensionIssueUrl();
		const hasIssueType = this.getIssueTypeOptions().some(option => option.type === this.selectedIssueType);
		const hasDescription = this.hasDescriptionContent();
		const title = this.titleInput.value.trim();
		this.setFieldError(this.sourceButtonGroup, this.sourceError, !hasIssueSource);
		this.setFieldError(this.extensionField, this.extensionError, !hasExtension);
		this.setFieldError(this.typeButtonGroup, this.typeError, !hasIssueType);
		this.setFieldError(this.descriptionContainer, this.descriptionError, !hasDescription);
		this.setFieldError(this.titleInput.element, this.titleError, !title);
		if (!hasIssueSource || !hasExtension || !hasIssueType || !title || !hasDescription) {
			if (!hasIssueSource) {
				this.issueSourceButtons.find(button => !button.element.classList.contains('hidden'))?.element.focus();
			} else if (!hasExtension) {
				this.extensionSelect.focus();
			} else if (!hasIssueType) {
				this.issueTypeButtons[0]?.element.focus();
			} else if (!title) {
				this.titleInput.focus();
			} else {
				this.setDescriptionPreview(false);
				this.descriptionInput.focus();
			}
			return;
		}

		const description = this.descriptionInput.value.trim();
		this.updateIssueSourceFlags();
		this.model.update({ issueDescription: description, issueTitle: title, ...(this.selectedIssueType !== undefined ? { issueType: this.selectedIssueType } : {}) });

		const body = this.buildIssueBody();
		this.submittedDraftKey = this.getDraftKey();
		this._onDidSubmit.fire({ title, body });
	}

	show(): void {
		if (this.visible) {
			return;
		}
		this.visible = true;

		this.wizardPanel.classList.add('open', 'wizard-embedded');
		this.wizardPanel.style.maxHeight = 'none';
		this.wizardPanel.focus();
	}

	private getTotalAttachments(): number {
		return this.getAttachments().length;
	}

	private getOccupiedAttachmentSlots(): number {
		return this.attachments.length;
	}

	private get pendingAttachmentImports(): number {
		return this.attachments.filter(attachment => attachment.kind === 'pending' && attachment.source === 'import').length;
	}

	private get recordingSlotReserved(): boolean {
		return !!this.getPendingAttachment('recording');
	}

	private getPendingAttachment(source: PendingAttachment['source']): PendingAttachment | undefined {
		return this.attachments.find((attachment): attachment is PendingAttachment => attachment.kind === 'pending' && attachment.source === source);
	}

	private reserveAttachment(source: PendingAttachment['source']): PendingAttachment | undefined {
		if (this.disposed || this.uploading || this.getOccupiedAttachmentSlots() >= MAX_ATTACHMENTS) {
			return undefined;
		}
		const reservation: PendingAttachment = { id: generateUuid(), kind: 'pending', source };
		this.attachments.push(reservation);
		return reservation;
	}

	private getAttachmentFiles(transfer: DataTransfer | null): File[] {
		if (!transfer) {
			return [];
		}
		if (transfer.files.length) {
			return Array.from(transfer.files);
		}
		return Array.from(transfer.items).filter(item => item.kind === 'file').map(item => item.getAsFile()).filter((file): file is File => !!file);
	}

	private hasAttachmentFiles(transfer: DataTransfer | null): boolean {
		return !!transfer && (transfer.types.includes('Files') || transfer.files.length > 0 || Array.from(transfer.items).some(item => item.kind === 'file'));
	}

	private isTextInputTarget(target: EventTarget | null): boolean {
		return isHTMLElement(target) && (target.isContentEditable || !!target.closest('input, textarea, [role="textbox"]'));
	}

	private registerAttachmentInput(): void {
		for (const target of [this.wizardPanel, this.descriptionContainer]) {
			for (const type of [EventType.DRAG_ENTER, EventType.DRAG_OVER, EventType.DROP]) {
				this.disposables.add(addDisposableListener(target, type, (event: DragEvent) => {
					if (event.defaultPrevented) {
						return;
					}
					const inDescription = isHTMLElement(event.target) && this.descriptionContainer.contains(event.target);
					const hasText = event.dataTransfer?.types.includes('text/plain');
					if (event.target === this.descriptionInput && hasText) {
						event.stopPropagation();
						if (type === EventType.DROP) {
							this.screenshotContainer.classList.remove('drag-over');
							const files = this.getAttachmentFiles(event.dataTransfer);
							if (files.length) {
								this.requestAddAttachments(files);
							}
						}
						return;
					}
					if (!this.hasAttachmentFiles(event.dataTransfer)) {
						return;
					}
					if (!inDescription && this.isTextInputTarget(event.target) && hasText) {
						event.stopPropagation();
						return;
					}
					event.preventDefault();
					event.stopPropagation();
					if (event.dataTransfer) {
						event.dataTransfer.dropEffect = this.getOccupiedAttachmentSlots() < MAX_ATTACHMENTS && !this.uploading ? 'copy' : 'none';
					}
					this.screenshotContainer.classList.toggle('drag-over', type !== EventType.DROP);
					if (type === EventType.DROP) {
						this.requestAddAttachments(this.getAttachmentFiles(event.dataTransfer), event.dataTransfer?.getData('text/plain'));
					}
				}, target === this.descriptionContainer));
			}
		}
		this.disposables.add(addDisposableListener(this.wizardPanel, EventType.PASTE, (event: ClipboardEvent) => {
			if (event.defaultPrevented || this.isTextInputTarget(event.target)) {
				return;
			}
			const files = this.getAttachmentFiles(event.clipboardData);
			if (files.length) {
				event.preventDefault();
				event.stopPropagation();
				this.requestAddAttachments(files, event.clipboardData?.getData('text/plain'));
			}
		}));
		this.disposables.add(addDisposableListener(this.wizardPanel, EventType.DRAG_LEAVE, (event: DragEvent) => {
			this.screenshotContainer.classList.remove('drag-over');
			if (this.hasAttachmentFiles(event.dataTransfer)) {
				event.stopPropagation();
			}
		}));
		this.disposables.add(addDisposableListener(this.wizardPanel, EventType.DRAG_END, () => this.screenshotContainer.classList.remove('drag-over')));
	}

	private requestAddAttachments(files: readonly File[], text?: string): void {
		if (this.disposed) {
			return;
		}
		if (this.pendingAttachmentImports === 0) {
			this.attachmentErrors.clear();
		}
		if (this.uploading) {
			this.updateAttachmentImportStatus();
			return;
		}
		if (text) {
			this.insertDescriptionText(text);
			status(localize('attachmentTextAdded', "Text added to the description."));
		}
		const accepted: IIssueReporterAttachmentImport[] = [];
		for (const file of files) {
			if (this.getOccupiedAttachmentSlots() >= MAX_ATTACHMENTS) {
				break;
			}
			try {
				validateIssueReporterMediaFile(file);
				const reservation = this.reserveAttachment('import');
				if (reservation) {
					accepted.push({ id: reservation.id, file });
				}
			} catch (error) {
				this.attachmentErrors.add(toErrorMessage(error));
			}
		}
		this.updateAttachmentButtons();
		this.updateAttachmentImportStatus();
		if (accepted.length) {
			this._onDidRequestAddAttachments.fire(accepted);
		}
	}

	completeAttachmentImport(id: string, attachment?: IIssueReporterFileAttachment, error?: string): boolean {
		const index = this.attachments.findIndex(item => item.id === id && item.kind === 'pending' && item.source === 'import');
		if (this.disposed || index === -1) {
			return false;
		}
		if (attachment) {
			this.attachments[index] = { id, kind: 'file', file: attachment };
		} else {
			this.attachments.splice(index, 1);
		}
		if (error) {
			this.attachmentErrors.add(error);
		}
		if (attachment) {
			this.attachmentsChanged();
			status(localize('attachmentImported', "Attachment added."));
		} else {
			this.updateAttachmentButtons();
		}
		return !!attachment;
	}

	private updateAttachmentImportStatus(): void {
		const messages: string[] = [];
		if (this.pendingAttachmentImports) {
			messages.push(localize('attachmentsImporting', "Importing {0} file(s)...", this.pendingAttachmentImports));
		}
		if (this.getOccupiedAttachmentSlots() >= MAX_ATTACHMENTS) {
			messages.push(localize('attachmentImportLimit', "Attachment limit reached. Remove a file to add another."));
		}
		if (this.uploading) {
			messages.push(localize('attachmentsUploading', "Uploading attachments..."));
		}
		if (this.attachmentUploadError) {
			messages.push(this.attachmentUploadError);
		}
		messages.push(...this.attachmentErrors);
		this.attachmentStatus.textContent = messages.join('\n');
		this.attachmentStatus.hidden = messages.length === 0;
		this.attachmentStatus.classList.toggle('has-errors', this.attachmentErrors.size > 0 || !!this.attachmentUploadError);
		this.screenshotContainer.setAttribute('aria-busy', String(this.pendingAttachmentImports > 0));
	}

	private requestScreenshot(reservation?: PendingAttachment): void {
		if (this.uploading || this.screenshotCapturePending || this.delayedScreenshotPending) {
			return;
		}
		reservation ??= this.reserveAttachment('screenshot');
		if (!reservation || !this.attachments.includes(reservation)) {
			return;
		}
		this.screenshotCapturePending = true;
		this.updateAttachmentButtons();
		this._onDidRequestScreenshot.fire(reservation.id);
	}

	completeScreenshotCapture(id = this.getPendingAttachment('screenshot')?.id): void {
		const reservation = this.getPendingAttachment('screenshot');
		if (reservation && reservation.id !== id) {
			return;
		}
		if (reservation) {
			this.attachments.splice(this.attachments.indexOf(reservation), 1);
		}
		this.screenshotCapturePending = false;
		if (!this.disposed) {
			this.updateAttachmentButtons();
		}
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
		const containerStyles = targetWindow.getComputedStyle(this.captureContainer);
		const cssVar = (name: string, fallback: string): string => containerStyles.getPropertyValue(name).trim() || fallback;
		return {
			...defaultButtonStyles,
			buttonForeground: cssVar('--vscode-button-foreground', '#fff'),
			buttonBackground: cssVar('--vscode-button-background', '#0e639c'),
			buttonHoverBackground: cssVar('--vscode-button-hoverBackground', '#1177bb'),
			buttonBorder: cssVar('--vscode-button-border', 'transparent'),
		};
	}

	addScreenshot(screenshot: IScreenshot, id = this.getPendingAttachment('screenshot')?.id): void {
		const reservation = id ? this.attachments.find(item => item.id === id && item.kind === 'pending' && item.source === 'screenshot') : this.reserveAttachment('screenshot');
		if (this.disposed || !reservation) {
			return;
		}
		const attachment: IssueReporterAttachment<IScreenshot> = { id: reservation.id, kind: 'screenshot', screenshot };
		this.attachments[this.attachments.indexOf(reservation)] = attachment;
		this.attachmentsChanged();
		this.openAnnotationEditor(attachment.id);
	}

	private updateAttachmentButtons(): void {
		const atMax = this.getOccupiedAttachmentSlots() >= MAX_ATTACHMENTS || this.uploading;
		const maxMsg = localize('maxAttachmentsReached', "Max attachments reached");
		const screenshotDisabled = atMax || this.delayedScreenshotPending || this.screenshotCapturePending;
		const recordDisabled = atMax || this.recordingSlotReserved;

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
				this.captureStripRecordBtn.element.title = this.recordingSlotReserved
					? localize('recordingPending', "Recording in progress")
					: recordDisabled ? maxMsg : localize('recordVideo', "Record video");
			} else {
				this.captureStripRecordBtn.enabled = true;
			}
		}
		this.screenshotAddCard?.classList.toggle('disabled', screenshotDisabled);
		this.screenshotAddCard?.setAttribute('aria-disabled', String(screenshotDisabled));

		this.addFilesButton.enabled = !this.uploading && this.getOccupiedAttachmentSlots() < MAX_ATTACHMENTS;
		this.updatePreviewButton();
		this.updateAttachmentImportStatus();
	}

	private renderAttachmentCard(parent: HTMLElement, name: string, thumbnailDataUrl: string | undefined, isVideo: boolean, durationMs?: number): HTMLElement {
		const card = append(parent, $('div.wizard-screenshot-card'));
		const preview = append(card, $('div.wizard-attachment-preview'));
		const fallback = append(preview, $('div.wizard-file-fallback'));
		fallback.appendChild(renderIcon(isVideo ? Codicon.play : Codicon.file)).setAttribute('aria-hidden', 'true');
		if (thumbnailDataUrl) {
			const thumbImg = append(preview, $('img.wizard-screenshot-img')) as HTMLImageElement;
			thumbImg.setAttribute('src', thumbnailDataUrl);
			thumbImg.alt = '';
			thumbImg.setAttribute('draggable', 'false');
			fallback.hidden = true;
			this.screenshotDisposables.add(addDisposableListener(thumbImg, 'error', () => {
				thumbImg.remove();
				fallback.hidden = false;
				append(fallback, $('span')).textContent = localize('attachmentPreviewUnavailable', "Preview unavailable");
				this.logService.warn('[IssueReporter] Attachment preview unavailable:', name);
			}, { once: true }));
		}
		const filename = append(card, $('div.wizard-file-name'));
		filename.textContent = name;
		this.screenshotDisposables.add(this.hoverService.setupDelayedHover(filename, { content: name }));
		if (durationMs !== undefined) {
			const durLabel = append(preview, $('div.wizard-recording-duration'));
			const durSec = Math.floor(durationMs / 1000);
			durLabel.textContent = `${Math.floor(durSec / 60)}:${(durSec % 60).toString().padStart(2, '0')}`;
		}

		return card;
	}

	private registerAttachmentAction(element: HTMLElement, label: string, action: () => void, disposables: DisposableStore): void {
		element.setAttribute('role', 'button');
		element.setAttribute('aria-label', label);
		element.tabIndex = 0;
		disposables.add(addDisposableListener(element, EventType.CLICK, event => {
			event.stopPropagation();
			if (!this.uploading) {
				action();
			}
		}));
		disposables.add(addDisposableListener(element, EventType.KEY_DOWN, event => {
			if (event.target !== element) {
				return;
			}
			const key = new StandardKeyboardEvent(event);
			if (key.equals(KeyCode.Enter) || key.equals(KeyCode.Space)) {
				event.preventDefault();
				event.stopPropagation();
				if (!this.uploading) {
					action();
				}
			}
		}));
	}

	private updateScreenshotThumbnails(): void {
		this.screenshotDisposables.clear();
		this.screenshotContainer.textContent = '';
		this.screenshotAddCard = undefined;
		this.attachmentCards.clear();
		let screenshotNumber = 0;
		for (const attachment of this.getAttachments()) {
			let card: HTMLElement;
			let name: string;
			if (attachment.kind === 'screenshot') {
				screenshotNumber++;
				const screenshot = getIssueReporterScreenshotFile(attachment.screenshot, screenshotNumber);
				name = screenshot.name;
				card = this.renderAttachmentCard(this.screenshotContainer, name, screenshot.dataUrl, false);
				this.registerAttachmentAction(card, localize('editScreenshotLabel', "Edit {0}", name), () => this.openAnnotationEditor(attachment.id), this.screenshotDisposables);
			} else {
				name = attachment.file.name;
				card = this.renderAttachmentCard(this.screenshotContainer, name, attachment.file.thumbnailDataUrl, attachment.file.mimeType.startsWith('video/'), attachment.file.durationMs);
				card.classList.add('wizard-file-card');
				this.registerAttachmentAction(card, localize('openAttachment', "Open {0}", name), () => {
					this._onDidRequestOpenFile.fire(attachment.file.filePath);
				}, this.screenshotDisposables);
			}
			this.attachmentCards.set(attachment.id, card);

			const deleteBtn = append(card, $('div.wizard-screenshot-delete'));
			deleteBtn.appendChild(renderIcon(Codicon.close));
			this.registerAttachmentAction(deleteBtn, localize('removeAttachment', "Remove {0}", name), () => {
				this.attachments.splice(this.attachments.indexOf(attachment), 1);
				this.attachmentsChanged();
				this.screenshotContainer.focus();
			}, this.screenshotDisposables);
			append(card, $('div.review-progress-overlay'));
			this.renderAttachmentUploadState(attachment);
		}

		if (this.getTotalAttachments() < MAX_ATTACHMENTS) {
			const addDisabled = this.uploading || this.screenshotCapturePending || this.getOccupiedAttachmentSlots() >= MAX_ATTACHMENTS;
			const addCard = append(this.screenshotContainer, $('div.wizard-screenshot-card.wizard-screenshot-add'));
			this.screenshotAddCard = addCard;
			addCard.setAttribute('aria-disabled', String(addDisabled));
			if (addDisabled) {
				addCard.classList.add('disabled');
				addCard.title = localize('maxAttachmentsReached', "Max attachments reached");
			}
			const plus = append(addCard, $('div.wizard-screenshot-plus'));
			plus.appendChild(renderIcon(Codicon.add));
			plus.setAttribute('aria-hidden', 'true');
			append(addCard, $('span')).textContent = localize('screenshot', "Screenshot");
			this.registerAttachmentAction(addCard, localize('captureScreenshot', "Capture Screenshot"), () => {
				if (!addCard.classList.contains('disabled')) {
					this.requestScreenshot();
				}
			}, this.screenshotDisposables);
		}
	}

	private openAnnotationEditor(id: string): void {
		const attachment = this.attachments.find(item => item.id === id);
		if (attachment?.kind !== 'screenshot') {
			return;
		}

		// Per-editor lifecycle: each call creates a new editor that mounts an
		// absolutely-positioned overlay on top of any previously-open editor and
		// disposes itself on save/cancel. This gives us the stacking behavior the
		// user expects when taking multiple screenshots in a row — the topmost
		// editor handles save/cancel, then the previous one becomes visible
		// again.
		const screenshot = attachment.screenshot;
		const editorDisposables = this.disposables.add(new DisposableStore());
		const editor = editorDisposables.add(new ScreenshotAnnotationEditor(screenshot, this.wizardPanel, screenshot.annotationState));

		editorDisposables.add(editor.onDidSave(({ dataUrl, state }) => {
			const index = this.attachments.findIndex(item => item.id === id);
			if (index !== -1) {
				this.attachments[index] = { id, kind: 'screenshot', screenshot: { ...screenshot, annotatedDataUrl: dataUrl, annotationState: state } };
				this.attachmentsChanged();
			}
			this.disposables.delete(editorDisposables);
		}));

		editorDisposables.add(editor.onDidCancel(() => {
			this.disposables.delete(editorDisposables);
		}));
	}

	getAttachments(): readonly IssueReporterAttachment<IScreenshot>[] {
		return this.attachments.filter((attachment): attachment is IssueReporterAttachment<IScreenshot> => attachment.kind !== 'pending');
	}

	getScreenshots(): readonly IScreenshot[] {
		return this.getAttachments().flatMap(attachment => attachment.kind === 'screenshot' ? [attachment.screenshot] : []);
	}

	getFileAttachments(): readonly IIssueReporterFileAttachment[] {
		return this.getAttachments().flatMap(attachment => attachment.kind === 'file' ? [attachment.file] : []);
	}

	/** Restore input-owned attachments without reporting a new change to their owner. */
	restoreAttachments(attachments: readonly IssueReporterAttachment<IScreenshot>[]): void {
		const restored = attachments.slice(0, MAX_ATTACHMENTS);
		const current = this.getAttachments();
		if (current.length !== restored.length || current.some((attachment, index) => attachment !== restored[index])) {
			this.attachments.length = 0;
			for (const attachment of restored) {
				if (attachment.upload && attachment.upload.state !== 'done') {
					attachment.upload = undefined;
				}
				this.attachments.push(attachment);
			}
		}
		this.updateAttachmentViews();
		this.updateAttachmentButtons();
		this.updatePreviewButton();
	}

	private buildIssueBody(): string {
		const description = this.descriptionInput.value.trim();
		const diagnosticOptions = this.getDiagnosticOptions();
		this.model.update({
			issueDescription: description,
			issueType: this.selectedIssueType ?? IssueType.Bug,
			...diagnosticOptions,
		});

		const modelData = this.model.getData();
		const sections: string[] = [
			`### Description\n\n${description}`,
			this.generateIssueDetailsMd(),
		];

		if (diagnosticOptions.includeExtensionData && modelData.extensionData) {
			sections.push(this.createDetails('Extension Data', modelData.extensionData));
		}

		if (diagnosticOptions.includeSystemInfo && (modelData.versionInfo || modelData.systemInfo || modelData.systemInfoWeb)) {
			sections.push(this.generateSystemInfoMd());
		}

		if (!modelData.fileOnExtension && !modelData.fileOnMarketplace && diagnosticOptions.includeExtensions) {
			sections.push(this.generateExtensionsMd());
		}

		if (diagnosticOptions.includeExperiments && modelData.experimentInfo) {
			sections.push(this.createDetails('A/B Experiments', this.createCodeBlock(modelData.experimentInfo)));
		}

		if (this.selectedIssueType === IssueType.PerformanceIssue && !modelData.fileOnMarketplace) {
			if (diagnosticOptions.includeProcessInfo && modelData.processInfo) {
				sections.push(this.createDetails('Running Processes', this.createCodeBlock(modelData.processInfo)));
			}
			if (diagnosticOptions.includeWorkspaceInfo && modelData.workspaceInfo) {
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
			['Repository', this.getIssueRepositoryLabel()],
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
		return value.replace(/[\\|]/g, '\\$&').replace(/\r?\n/g, '<br>');
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

	/** Keep capture controls in the originating workbench window. */
	reparentFloatingBar(): void {
		if (!this.floatingBar) {
			return;
		}
		const targetWindow = getWindow(this.captureContainer);
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
			this.updateIssueSourceButtons();
		}
		this.updateDiagnostics();
		this.updatePreviewButton();
	}

	/** Called once performance info has resolved; suppresses "Loading…" placeholders. */
	markPerformanceInfoLoaded(): void {
		this.performanceInfoLoaded = true;
		this.updateDiagnostics();
		this.updatePreviewButton();
	}

	hasUnsavedChanges(): boolean {
		if (!this.hasUserInput()) {
			return false;
		}
		if (this.hasPendingOperations()) {
			return true;
		}
		if (this.previewOpened && this.previewedDraftKey === this.getDraftKey()) {
			return false;
		}
		return true;
	}

	hasPendingOperations(): boolean {
		return this.uploading || this.pendingAttachmentImports > 0 || this.screenshotCapturePending || this.delayedScreenshotPending
			|| this.recordingSlotReserved || this.currentRecordingState === RecordingState.Recording;
	}

	private hasUserInput(): boolean {
		return this.input.hasContentChanges || this.getOccupiedAttachmentSlots() > 0;
	}

	markPreviewOpened(): void {
		this.previewOpened = true;
		this.previewedDraftKey = this.submittedDraftKey ?? this.getDraftKey();
		this.updatePreviewButton();
	}

	private getDraftKey(): string {
		return JSON.stringify({
			title: this.titleInput.value.trim(),
			description: this.descriptionInput.value.trim(),
			issueType: this.selectedIssueType,
			issueSource: this.selectedIssueSource,
			issueTarget: this.getIssueTargetUrl(),
			extensionId: this.selectedExtension?.id,
			...this.getDiagnosticOptions(),
			attachments: this.getAttachments().map(attachment => attachment.kind === 'screenshot'
				? attachment.screenshot.annotatedDataUrl ?? attachment.screenshot.dataUrl
				: attachment.file.filePath),
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
		const nav = this.previewButton.element.parentElement;
		// eslint-disable-next-line no-restricted-syntax
		if (nav && !nav.querySelector('.wizard-close-btn')) {
			this.closeButton = this.disposables.add(new Button(nav, { ...defaultButtonStyles, secondary: true }));
			this.closeButton.label = localize('closeTab', "Close");
			this.closeButton.element.classList.add('wizard-close-btn');
			this.disposables.add(this.closeButton.onDidClick(() => {
				this._onDidClose.fire();
			}));
		}
		this.updatePreviewButton();
	}

	reserveRecordingSlot(): boolean {
		if (this.disposed || this.uploading || this.recordingSlotReserved || this.currentRecordingState === RecordingState.Recording || this.getOccupiedAttachmentSlots() >= MAX_ATTACHMENTS) {
			return false;
		}
		if (!this.reserveAttachment('recording')) {
			return false;
		}
		this.updateAttachmentButtons();
		return true;
	}

	setRecordingState(state: RecordingState): void {
		this.currentRecordingState = state;
		if (state === RecordingState.Recording && !this.recordingSlotReserved) {
			this.reserveAttachment('recording');
		} else if (state === RecordingState.Idle) {
			const reservation = this.getPendingAttachment('recording');
			if (reservation) {
				this.attachments.splice(this.attachments.indexOf(reservation), 1);
			}
		}

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

			this.recordingElapsedTimer = getWindow(this.captureContainer).setInterval(() => {
				if (this.captureStripRecordBtn) {
					this.captureStripRecordBtn.label = makeLabel();
				}
			}, 1000);
		} else {
			// Back to idle
			if (this.recordingElapsedTimer !== undefined) {
				getWindow(this.captureContainer).clearInterval(this.recordingElapsedTimer);
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

	addRecording(attachment: IIssueReporterFileAttachment): boolean {
		const reservation = this.getPendingAttachment('recording') ?? this.reserveAttachment('recording');
		if (this.disposed || !reservation) {
			return false;
		}
		this.attachments[this.attachments.indexOf(reservation)] = { id: reservation.id, kind: 'file', file: attachment };
		this.attachmentsChanged();
		return true;
	}

	private attachmentsChanged(): void {
		this.setAttachmentUploadError(undefined);
		this.updateAttachmentViews();
		this.updateAttachmentButtons();
		this.updatePreviewButton();
		this._onDidChangeAttachments.fire();
	}

	private updateAttachmentViews(): void {
		this.updateScreenshotThumbnails();
	}

	/** Capture and annotate a screenshot when a slot is available. */
	triggerCaptureScreenshot(): void {
		const btn = this.captureStripCaptureBtn;
		if (!btn?.enabled) {
			return;
		}
		btn.element.click();
	}

	/** Toggle recording when supported and a slot is available. */
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
		this.disposed = true;
		this.input.saveDescriptionScrollPosition(this.descriptionContainer);
		this.attachments.splice(0, this.attachments.length, ...this.getAttachments());
		this.attachmentCards.clear();
		this.diagnosticControls.clear();
		if (this.recordingElapsedTimer !== undefined) {
			getWindow(this.captureContainer).clearInterval(this.recordingElapsedTimer);
		}
		this.descriptionGuidanceDisposables.dispose();
		this.disposables.dispose();
		this._onDidClose.dispose();
		this._onDidSubmit.dispose();
		this._onDidRequestScreenshot.dispose();
		this._onDidRequestStartRecording.dispose();
		this._onDidRequestStopRecording.dispose();
		this._onDidRequestOpenFile.dispose();
		this._onDidChangeAttachments.dispose();
		this._onDidRequestGenerateTitle.dispose();
	}
}
