/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import '../media/browserAnnotationToolbar.css';

import { localize, localize2 } from '../../../../../nls.js';
import { DisposableStore, MutableDisposable } from '../../../../../base/common/lifecycle.js';
import { CancellationTokenSource } from '../../../../../base/common/cancellation.js';
import * as dom from '../../../../../base/browser/dom.js';
import { IContextKey, IContextKeyService, RawContextKey, ContextKeyExpr } from '../../../../../platform/contextkey/common/contextkey.js';
import { Action2, registerAction2 } from '../../../../../platform/actions/common/actions.js';
import { ServicesAccessor } from '../../../../../platform/instantiation/common/instantiation.js';
import { KeybindingWeight } from '../../../../../platform/keybinding/common/keybindingsRegistry.js';
import { KeyCode } from '../../../../../base/common/keyCodes.js';
import { IEditorService } from '../../../../services/editor/common/editorService.js';
import { Codicon } from '../../../../../base/common/codicons.js';
import { ILogService } from '../../../../../platform/log/common/log.js';
import { IQuickInputService } from '../../../../../platform/quickinput/common/quickInput.js';
import { IClipboardService } from '../../../../../platform/clipboard/common/clipboardService.js';
import { IChatWidgetService } from '../../../chat/browser/chat.js';
import { IChatRequestVariableEntry } from '../../../chat/common/attachments/chatVariableEntries.js';
import { ThemeIcon } from '../../../../../base/common/themables.js';
import { INotificationService, Severity } from '../../../../../platform/notification/common/notification.js';
import { IConfigurationService } from '../../../../../platform/configuration/common/configuration.js';
import { IStorageService, StorageScope, StorageTarget } from '../../../../../platform/storage/common/storage.js';
import { ChatContextKeys } from '../../../chat/common/actions/chatContextKeys.js';

import { BrowserEditor, BrowserEditorContribution, CONTEXT_BROWSER_HAS_URL, CONTEXT_BROWSER_HAS_ERROR } from '../browserEditor.js';
import { BROWSER_EDITOR_ACTIVE, BrowserActionCategory } from '../browserViewActions.js';
import { IBrowserViewModel } from '../../common/browserView.js';
import { IBrowserAnnotation, BrowserAnnotationDetailLevel, createBrowserAnnotation } from '../../common/browserAnnotation.js';
import { generateAnnotationOutput } from '../browserAnnotationOutput.js';
import { BrowserAnnotationMarkers, IAnnotationThemeColors, IAnnotationEditRequest, IAnnotationClickResult } from '../browserAnnotationMarkers.js';
import { IPlaywrightService } from '../../../../../platform/browserView/common/playwrightService.js';
import { IElementData } from '../../../../../platform/browserView/common/browserView.js';
import { IThemeService } from '../../../../../platform/theme/common/themeService.js';
import { editorBackground, foreground, descriptionForeground, inputBackground, inputBorder, focusBorder, buttonBackground, buttonForeground, editorWidgetBorder } from '../../../../../platform/theme/common/colorRegistry.js';

// -- Context Keys ----------------------------------------------------------

const CONTEXT_BROWSER_ANNOTATION_MODE_ACTIVE = new RawContextKey<boolean>(
	'browserAnnotationModeActive', false,
	localize('browser.annotationModeActive', "Whether browser annotation mode is active")
);

const CONTEXT_BROWSER_HAS_ANNOTATIONS = new RawContextKey<boolean>(
	'browserHasAnnotations', false,
	localize('browser.hasAnnotations', "Whether the browser has any annotations")
);

const STORAGE_KEY_PREFIX = 'browserAnnotations.';

const BROWSER_SELECT_ENABLED_SETTING = 'workbench.browser.enableSelect';

const BROWSER_SELECT_ENABLED = ContextKeyExpr.equals(`config.${BROWSER_SELECT_ENABLED_SETTING}`, true);

// -- Annotation Feature Contribution --------------------------------------

/**
 * BrowserEditorContribution that adds multi-element annotation mode to the
 * agentic browser. Users can click multiple elements, add comments, and
 * generate structured markdown output for AI coding agents.
 */
export class BrowserAnnotationFeature extends BrowserEditorContribution {

	private readonly _annotations: IBrowserAnnotation[] = [];
	private _currentUrl: string = '';
	private _annotationModeActive = false;
	private _currentCts: CancellationTokenSource | undefined;
	private _markerListenerCts: CancellationTokenSource | undefined;
	private _detailLevel: BrowserAnnotationDetailLevel = 'standard';

	private readonly _annotationModeContext: IContextKey<boolean>;
	private readonly _hasAnnotationsContext: IContextKey<boolean>;
	private readonly _markers = this._register(new MutableDisposable<BrowserAnnotationMarkers>());
	private _markersVisible = true;

	// Floating toolbar DOM
	private readonly _toolbarElement: HTMLElement;
	private readonly _toggleBtn: HTMLButtonElement;
	private readonly _copyBtn: HTMLButtonElement;
	private readonly _sendToChatBtn: HTMLButtonElement;
	private readonly _clearBtn: HTMLButtonElement;
	private readonly _hideBtn: HTMLButtonElement;
	private readonly _hideIcon: HTMLSpanElement;

	constructor(
		editor: BrowserEditor,
		@IContextKeyService contextKeyService: IContextKeyService,
		@ILogService private readonly logService: ILogService,
		@IQuickInputService private readonly quickInputService: IQuickInputService,
		@IClipboardService private readonly clipboardService: IClipboardService,
		@IChatWidgetService private readonly chatWidgetService: IChatWidgetService,
		@INotificationService private readonly notificationService: INotificationService,
		@IPlaywrightService private readonly playwrightService: IPlaywrightService,
		@IConfigurationService private readonly configurationService: IConfigurationService,
		@IStorageService private readonly storageService: IStorageService,
		@IThemeService private readonly themeService: IThemeService,
	) {
		super(editor);
		this._annotationModeContext = CONTEXT_BROWSER_ANNOTATION_MODE_ACTIVE.bindTo(contextKeyService);
		this._hasAnnotationsContext = CONTEXT_BROWSER_HAS_ANNOTATIONS.bindTo(contextKeyService);

		// Build floating toolbar
		this._toolbarElement = dom.$('.browser-annotation-toolbar');

		// Drag handle
		const dragHandle = document.createElement('div');
		dragHandle.className = 'browser-annotation-toolbar-drag';
		const gripIcon = document.createElement('span');
		gripIcon.className = 'codicon codicon-gripper';
		dragHandle.appendChild(gripIcon);
		this._toolbarElement.appendChild(dragHandle);
		this._setupDrag(dragHandle);

		this._toggleBtn = this._createButton('codicon-checklist', localize('browser.annotateToggle', "Toggle Annotation Mode"));
		this._toolbarElement.appendChild(this._toggleBtn);
		this._register(dom.addDisposableListener(this._toggleBtn, 'click', () => this.toggleAnnotationMode()));

		this._toolbarElement.appendChild(this._createSeparator());

		this._copyBtn = this._createButton('codicon-copy', localize('browser.annotateCopy', "Copy Annotations"));
		this._copyBtn.disabled = true;
		this._toolbarElement.appendChild(this._copyBtn);
		this._register(dom.addDisposableListener(this._copyBtn, 'click', () => this.copyAnnotations()));

		this._sendToChatBtn = this._createButton('codicon-comment-discussion', localize('browser.annotateSendToChat', "Send to Chat"));
		this._sendToChatBtn.disabled = true;
		this._toolbarElement.appendChild(this._sendToChatBtn);
		this._register(dom.addDisposableListener(this._sendToChatBtn, 'click', () => this.sendAnnotationsToChat()));

		this._toolbarElement.appendChild(this._createSeparator());

		this._hideBtn = this._createButton('codicon-eye-closed', localize('browser.annotateHide', "Hide Annotations"));
		this._hideIcon = this._hideBtn.firstElementChild as HTMLSpanElement;
		this._hideBtn.disabled = true;
		this._toolbarElement.appendChild(this._hideBtn);
		this._register(dom.addDisposableListener(this._hideBtn, 'click', () => this.toggleMarkersVisibility()));

		this._clearBtn = this._createButton('codicon-trash', localize('browser.annotateClear', "Clear All"));
		this._clearBtn.disabled = true;
		this._toolbarElement.appendChild(this._clearBtn);
		this._register(dom.addDisposableListener(this._clearBtn, 'click', () => this.clearAnnotations()));
	}

	override get toolbarElements(): readonly HTMLElement[] {
		return [this._toolbarElement];
	}

	private _isFeatureEnabled(): boolean {
		return this.configurationService.getValue<boolean>(BROWSER_SELECT_ENABLED_SETTING) === true;
	}

	protected override subscribeToModel(model: IBrowserViewModel, store: DisposableStore): void {
		this._toolbarElement.classList.toggle('disabled', !this._isFeatureEnabled());
		store.add(this.configurationService.onDidChangeConfiguration(e => {
			if (e.affectsConfiguration(BROWSER_SELECT_ENABLED_SETTING)) {
				const enabled = this._isFeatureEnabled();
				this._toolbarElement.classList.toggle('disabled', !enabled);
				if (!enabled && this._annotationModeActive) {
					this._stopAnnotationMode();
				}
			}
		}));
		if (!this._isFeatureEnabled()) {
			return;
		}
		// Create markers instance for this browser view
		const markers = new BrowserAnnotationMarkers(model.id, this.playwrightService, this.logService);
		this._markers.value = markers;
		store.add(markers);

		// Pass theme colors to injected scripts
		const updateThemeColors = () => {
			const theme = this.themeService.getColorTheme();
			const colors: IAnnotationThemeColors = {
				accentColor: theme.getColor(buttonBackground)?.toString() ?? '#0078d4',
				accentForeground: theme.getColor(buttonForeground)?.toString() ?? '#ffffff',
				editorBackground: theme.getColor(editorBackground)?.toString() ?? '#1e1e1e',
				foreground: theme.getColor(foreground)?.toString() ?? '#cccccc',
				descriptionForeground: theme.getColor(descriptionForeground)?.toString() ?? 'rgba(204,204,204,0.6)',
				inputBackground: theme.getColor(inputBackground)?.toString() ?? '#3c3c3c',
				inputBorder: theme.getColor(inputBorder)?.toString() ?? '#3c3c3c',
				focusBorder: theme.getColor(focusBorder)?.toString() ?? '#007acc',
				widgetBorder: theme.getColor(editorWidgetBorder)?.toString() ?? '#454545',
				buttonBackground: theme.getColor(buttonBackground)?.toString() ?? '#0078d4',
				buttonForeground: theme.getColor(buttonForeground)?.toString() ?? '#ffffff',
				fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
				monoFontFamily: 'Consolas, "Courier New", monospace',
			};
			markers.setThemeColors(colors);
		};
		updateThemeColors();
		store.add(this.themeService.onDidColorThemeChange(updateThemeColors));

		// Load persisted annotations for the current URL
		this._currentUrl = model.url;
		this._loadAnnotationsFromStorage();
		this._updateToolbarUI();
		if (this._annotations.length > 0) {
			this._syncMarkers();
		}

		// When the page navigates, save current, then load for new URL
		store.add(model.onDidNavigate(() => {
			markers.resetInjectionState();
			if (this._annotationModeActive) {
				this._stopAnnotationMode();
			}
			// Load annotations for the new URL (may be empty)
			this._currentUrl = model.url;
			this._loadAnnotationsFromStorage();
			this._updateToolbarUI();
			if (this._annotations.length > 0) {
				this._syncMarkers();
			}
		}));

		// Listen for marker clicks when not in annotation mode
		this._startMarkerClickListener(store);
	}

	override clear(): void {
		this._stopAnnotationMode();
		this._clearAnnotations();
		// Hide toolbar when model is cleared
		this._toolbarElement.classList.remove('visible');
	}

	// -- Public API (called from actions) ----------------------------------

	/**
	 * Toggle annotation mode on/off.
	 */
	async toggleAnnotationMode(): Promise<void> {
		if (this._annotationModeActive) {
			this._stopAnnotationMode();
		} else {
			await this._startAnnotationMode();
		}
	}

	/**
	 * Copy the current annotations as structured markdown to the clipboard.
	 */
	async copyAnnotations(): Promise<void> {
		if (this._annotations.length === 0) {
			return;
		}

		const url = this.editor.model?.url ?? '';
		const output = generateAnnotationOutput(this._annotations, url, this._detailLevel);
		await this.clipboardService.writeText(output);

		this.notificationService.notify({
			severity: Severity.Info,
			message: localize('browser.annotationsCopied', "Copied {0} annotation(s) to clipboard", this._annotations.length),
		});
	}

	/**
	 * Send annotations to chat as a single structured attachment using the
	 * same concise format as copyAnnotations (annotation output markdown).
	 * Screenshots are attached separately if enabled.
	 */
	async sendAnnotationsToChat(): Promise<void> {
		if (this._annotations.length === 0) {
			return;
		}

		const attachImages = this.configurationService.getValue<boolean>('chat.sendElementsToChat.attachImages');
		const toAttach: IChatRequestVariableEntry[] = [];

		const url = this.editor.model?.url ?? '';
		const output = generateAnnotationOutput(this._annotations, url, this._detailLevel);

		toAttach.push({
			id: 'browser-annotations',
			name: localize('browser.annotationsAttachment', "Page Annotations ({0})", this._annotations.length),
			fullName: localize('browser.annotationsAttachmentFull', "Browser Page Annotations for {0}", url),
			value: output,
			modelDescription: `${this._annotations.length} browser element annotation(s) with user feedback`,
			kind: 'element',
			icon: ThemeIcon.fromId(Codicon.checklist.id),
		});

		// Attach stored screenshots
		if (attachImages) {
			for (const annotation of this._annotations) {
				if (annotation.screenshotBase64) {
					const binary = atob(annotation.screenshotBase64);
					const bytes = new Uint8Array(binary.length);
					for (let i = 0; i < binary.length; i++) {
						bytes[i] = binary.charCodeAt(i);
					}
					toAttach.push({
						id: `annotation-screenshot-${annotation.id}`,
						name: `#${annotation.index} Screenshot`,
						fullName: `Element Screenshot for ${annotation.displayName}`,
						kind: 'image',
						value: bytes.buffer,
					});
				}
			}
		}

		const widget = await this.chatWidgetService.revealWidget() ?? this.chatWidgetService.lastFocusedWidget;
		widget?.attachmentModel?.addContext(...toAttach);
	}

	/**
	 * Clear all annotations.
	 */
	clearAnnotations(): void {
		this._clearAnnotations();
	}

	/**
	 * Toggle visibility of annotation markers in the page.
	 */
	toggleMarkersVisibility(): void {
		if (this._annotations.length === 0) {
			return;
		}
		this._markersVisible = !this._markersVisible;
		if (this._markersVisible) {
			this._syncMarkers();
		} else {
			this._markers.value?.clearMarkers();
		}
		this._updateToolbarUI();
	}

	/**
	 * Programmatically create an annotation from element data and a comment.
	 * Used by the browser annotation tool for agent-driven annotations.
	 */
	async annotateBySelector(elementData: IElementData, comment: string): Promise<IBrowserAnnotation | undefined> {
		const model = this.editor.model;
		if (!model) {
			return undefined;
		}

		// Capture element screenshot
		let screenshotBase64: string | undefined;
		try {
			const screenshotBuffer = await model.captureScreenshot({
				quality: 90,
				pageRect: elementData.bounds,
			});
			screenshotBase64 = btoa(String.fromCharCode(...screenshotBuffer.buffer));
		} catch {
			// Screenshot may fail for off-screen elements
		}

		const annotation = createBrowserAnnotation(
			elementData,
			comment,
			this._annotations.length + 1,
			model.url,
			screenshotBase64,
		);
		this._annotations.push(annotation);
		this._markersVisible = true;
		this._updateHasAnnotationsContext();
		this._syncMarkers();
		this._saveAnnotationsToStorage();

		this.logService.debug(`BrowserAnnotationFeature: Agent added annotation #${annotation.index} for ${annotation.displayName}`);
		return annotation;
	}

	/**
	 * Delete a single annotation by ID.
	 */
	deleteAnnotation(annotationId: string): void {
		const idx = this._annotations.findIndex(a => a.id === annotationId);
		if (idx !== -1) {
			this._annotations.splice(idx, 1);
			// Re-index remaining annotations
			for (let i = 0; i < this._annotations.length; i++) {
				(this._annotations[i] as { index: number }).index = i + 1;
			}
			this._updateHasAnnotationsContext();
			this._syncMarkers();
			this._saveAnnotationsToStorage();
		}
	}

	/**
	 * Show a quick pick to manage annotations (edit comment, delete, or clear all).
	 */
	async manageAnnotations(): Promise<void> {
		if (this._annotations.length === 0) {
			return;
		}

		interface IAnnotationQuickPickItem {
			label: string;
			description: string;
			annotationId?: string;
			action: 'edit' | 'delete' | 'clearAll';
		}

		const items: (IAnnotationQuickPickItem | { type: 'separator'; label?: string })[] = this._annotations.map(a => ({
			label: `$(list-ordered) #${a.index} ${a.displayName}`,
			description: a.comment.length > 60 ? a.comment.slice(0, 60) + '...' : a.comment,
			annotationId: a.id,
			action: 'edit' as const,
		}));

		items.push(
			{ type: 'separator' },
			{ label: `$(trash) ${localize('browser.clearAllAnnotations', "Clear All Annotations")}`, description: '', action: 'clearAll' },
		);

		const picked = await this.quickInputService.pick(items, {
			title: localize('browser.manageAnnotationsTitle', "Manage Annotations"),
			placeHolder: localize('browser.manageAnnotationsPlaceholder', "Select an annotation to edit or delete"),
		}) as IAnnotationQuickPickItem | undefined;

		if (!picked) {
			return;
		}

		if (picked.action === 'clearAll') {
			this._clearAnnotations();
			return;
		}

		if (picked.annotationId) {
			await this._editOrDeleteAnnotation(picked.annotationId);
		}
	}

	private async _editOrDeleteAnnotation(annotationId: string): Promise<void> {
		const annotation = this._annotations.find(a => a.id === annotationId);
		if (!annotation) {
			return;
		}

		const editLabel = localize('browser.editAnnotationComment', "Edit Comment");
		const deleteLabel = localize('browser.deleteAnnotation', "Delete Annotation");

		const action = await this.quickInputService.pick([
			{ label: `$(edit) ${editLabel}`, action: 'edit' },
			{ label: `$(trash) ${deleteLabel}`, action: 'delete' },
		] as Array<{ label: string; action: string }>, {
			title: localize('browser.annotationAction', "#{0} {1}", annotation.index, annotation.displayName),
		}) as { label: string; action: string } | undefined;

		if (!action) {
			return;
		}

		if (action.action === 'delete') {
			this.deleteAnnotation(annotationId);
			return;
		}

		if (action.action === 'edit') {
			const newComment = await this.quickInputService.input({
				title: localize('browser.editAnnotation', "Edit Annotation #{0}", annotation.index),
				value: annotation.comment,
				validateInput: async (value) => {
					if (!value.trim()) {
						return localize('browser.annotationCommentRequired', "A comment is required");
					}
					return undefined;
				}
			});

			if (newComment !== undefined && newComment.trim()) {
				const idx = this._annotations.findIndex(a => a.id === annotationId);
				if (idx !== -1) {
					(this._annotations[idx] as { comment: string }).comment = newComment;
					this._syncMarkers();
					this._saveAnnotationsToStorage();
				}
			}
		}
	}

	/**
	 * Get the current annotations.
	 */
	getAnnotations(): readonly IBrowserAnnotation[] {
		return this._annotations;
	}

	// -- Private -----------------------------------------------------------

	private async _startAnnotationMode(): Promise<void> {
		const model = this.editor.model;
		if (!model) {
			return;
		}

		// Cancel background marker click listener (annotation loop handles marker clicks)
		if (this._markerListenerCts) {
			this._markerListenerCts.dispose(true);
			this._markerListenerCts = undefined;
		}

		this._annotationModeActive = true;
		this._annotationModeContext.set(true);
		this._updateToolbarUI();
		this.editor.ensureBrowserFocus();

		this.logService.debug('BrowserAnnotationFeature: Annotation mode started');

		// Enter the annotation loop — stays active until mode is toggled off
		this._runAnnotationLoop();
	}

	private _stopAnnotationMode(): void {
		this._annotationModeActive = false;
		this._annotationModeContext.set(false);
		this._updateToolbarUI();

		if (this._currentCts) {
			this._currentCts.dispose(true);
			this._currentCts = undefined;
		}

		this.logService.debug('BrowserAnnotationFeature: Annotation mode stopped');
	}

	/**
	 * Continuously select elements and collect annotations until mode is deactivated.
	 * Uses injected in-page hover overlay + popup for the full interaction.
	 */
	private async _runAnnotationLoop(): Promise<void> {
		const markers = this._markers.value;
		if (!markers) {
			this._stopAnnotationMode();
			return;
		}

		// Activate the in-page hover overlay
		await markers.activateHoverOverlay();

		while (this._annotationModeActive) {
			const model = this.editor.model;
			if (!model) {
				this._stopAnnotationMode();
				return;
			}

			const cts = new CancellationTokenSource();
			this._currentCts = cts;

			try {
				// Wait for user to click element + submit comment via in-page popup
				const result = await markers.waitForAnnotation(cts.token);

				if (cts.token.isCancellationRequested || !this._annotationModeActive) {
					break;
				}

				if (!result) {
					// User cancelled the popup — stay in annotation mode
					if (!this._annotationModeActive) {
						break;
					}
					// Re-activate hover overlay for next selection
					await markers.activateHoverOverlay();
					continue;
				}

				// Handle marker click → edit existing annotation
				const editReq = result as Partial<IAnnotationEditRequest>;
				if (editReq.isEdit === true && typeof editReq.editAnnotationIndex === 'number') {
					await this._handleMarkerEdit(editReq.editAnnotationIndex);
					if (!this._annotationModeActive) {
						break;
					}
					await markers.activateHoverOverlay();
					continue;
				}

				const clickResult = result as IAnnotationClickResult;

				// Capture element screenshot
				let screenshotBase64: string | undefined;
				try {
					const screenshotBuffer = await model.captureScreenshot({
						quality: 90,
						pageRect: clickResult.elementData.bounds,
					});
					screenshotBase64 = btoa(String.fromCharCode(...screenshotBuffer.buffer));
				} catch {
					// Screenshot may fail for off-screen elements
				}

				const isMulti = clickResult.mode === 'group' || clickResult.mode === 'area';

				// Create and store the annotation
				const annotation = createBrowserAnnotation(
					clickResult.elementData,
					clickResult.comment,
					this._annotations.length + 1,
					model.url,
					screenshotBase64,
					clickResult.selectedText,
					isMulti,
				);
				this._annotations.push(annotation);
				this._updateHasAnnotationsContext();
				this._syncMarkers();
				this._saveAnnotationsToStorage();

				this.logService.debug(`BrowserAnnotationFeature: Added annotation #${annotation.index} for ${annotation.displayName}`);

				// Re-focus the browser and re-activate hover for next selection
				this.editor.ensureBrowserFocus();

			} catch (error) {
				if (!cts.token.isCancellationRequested) {
					this.logService.error('BrowserAnnotationFeature: Error during annotation', error);
				}
				break;
			} finally {
				cts.dispose();
				if (this._currentCts === cts) {
					this._currentCts = undefined;
				}
			}
		}

		// Deactivate hover overlay when exiting annotation mode
		await markers.deactivateHoverOverlay();
	}

	private _syncMarkers(): void {
		if (this._markersVisible) {
			this._markers.value?.updateMarkers(this._annotations);
		}
	}

	/**
	 * Handle editing an existing annotation via its in-page marker.
	 * Shows the edit popup and processes save/delete/cancel.
	 */
	private async _handleMarkerEdit(annotationIndex: number): Promise<void> {
		const annotation = this._annotations.find(a => a.index === annotationIndex);
		if (!annotation) {
			return;
		}

		const markers = this._markers.value;
		if (!markers) {
			return;
		}

		// Show edit popup in the page
		await markers.showEditPopup({
			index: annotation.index,
			comment: annotation.comment,
			elementName: annotation.displayName,
			bounds: annotation.bounds,
			ancestors: annotation.ancestors ? [...annotation.ancestors] : undefined,
			attributes: annotation.attributes ? { ...annotation.attributes } : undefined,
		});

		// Wait for user action (save, delete, or cancel)
		const editCts = new CancellationTokenSource();
		try {
			const editResult = await markers.waitForEditResult(editCts.token);

			if (!editResult || editResult.action === 'cancel') {
				return;
			}

			if (editResult.action === 'delete') {
				this.deleteAnnotation(annotation.id);
				return;
			}

			if (editResult.action === 'save' && editResult.comment) {
				const idx = this._annotations.findIndex(a => a.id === annotation.id);
				if (idx !== -1) {
					(this._annotations[idx] as { comment: string }).comment = editResult.comment;
					this._syncMarkers();
					this._saveAnnotationsToStorage();
					this.logService.debug(`BrowserAnnotationFeature: Updated annotation #${annotation.index}`);
				}
			}
		} finally {
			editCts.dispose();
		}
	}

	/**
	 * Background listener for marker clicks when annotation mode is off.
	 * This allows users to click markers to edit/delete annotations
	 * without being in annotation mode.
	 */
	private _startMarkerClickListener(store: DisposableStore): void {
		let disposed = false;
		store.add({ dispose: () => { disposed = true; } });

		const run = async () => {
			while (!disposed) {
				// Only listen when annotation mode is OFF and there are annotations
				if (this._annotationModeActive || this._annotations.length === 0) {
					await new Promise<void>(r => setTimeout(r, 300));
					continue;
				}

				const markers = this._markers.value;
				if (!markers) {
					break;
				}

				this._markerListenerCts = new CancellationTokenSource();
				try {
					const index = await markers.waitForMarkerClick(this._markerListenerCts.token);
					if (index && !this._annotationModeActive && !disposed) {
						await this._handleMarkerEdit(index);
					}
				} catch {
					// Marker click listener error — will retry
				} finally {
					this._markerListenerCts.dispose();
					this._markerListenerCts = undefined;
				}
			}
		};
		run().catch(e => this.logService.warn('BrowserAnnotationFeature: Marker click listener error', e));
	}

	private _clearAnnotations(): void {
		this._annotations.length = 0;
		this._markersVisible = true;
		this._updateHasAnnotationsContext();
		this._markers.value?.clearMarkers();
		this._saveAnnotationsToStorage();
	}

	// -- Storage -----------------------------------------------------------

	private _storageKey(): string {
		return `${STORAGE_KEY_PREFIX}${this._currentUrl}`;
	}

	private _saveAnnotationsToStorage(): void {
		if (!this._currentUrl) {
			return;
		}
		if (this._annotations.length === 0) {
			this.storageService.remove(this._storageKey(), StorageScope.WORKSPACE);
		} else {
			this.storageService.store(
				this._storageKey(),
				JSON.stringify(this._annotations),
				StorageScope.WORKSPACE,
				StorageTarget.MACHINE,
			);
		}
	}

	private _loadAnnotationsFromStorage(): void {
		this._annotations.length = 0;
		if (!this._currentUrl) {
			return;
		}
		const raw = this.storageService.get(this._storageKey(), StorageScope.WORKSPACE);
		if (raw) {
			try {
				const parsed = JSON.parse(raw) as IBrowserAnnotation[];
				this._annotations.push(...parsed);
			} catch (e) {
				this.logService.warn('BrowserAnnotationFeature: Failed to parse stored annotations', e);
			}
		}
		this._updateHasAnnotationsContext();
	}

	private _updateHasAnnotationsContext(): void {
		const hasAnnotations = this._annotations.length > 0;
		this._hasAnnotationsContext.set(hasAnnotations);
		this._updateToolbarUI();
	}

	private _updateToolbarUI(): void {
		const hasModel = !!this.editor.model?.url;
		const hasAnnotations = this._annotations.length > 0;

		// Always show the toolbar when a page is loaded
		this._toolbarElement.classList.toggle('visible', hasModel);
		this._toggleBtn.classList.toggle('active', this._annotationModeActive);
		this._toggleBtn.setAttribute('aria-pressed', String(this._annotationModeActive));

		// Disable (not hide) buttons when no annotations
		this._copyBtn.disabled = !hasAnnotations;
		this._sendToChatBtn.disabled = !hasAnnotations;
		this._clearBtn.disabled = !hasAnnotations;
		this._hideBtn.disabled = !hasAnnotations;

		// Update hide/show button icon and label
		if (this._markersVisible) {
			this._hideIcon.className = 'codicon codicon-eye-closed';
			this._hideBtn.title = localize('browser.annotateHide', "Hide Annotations");
			this._hideBtn.setAttribute('aria-label', localize('browser.annotateHide', "Hide Annotations"));
		} else {
			this._hideIcon.className = 'codicon codicon-eye';
			this._hideBtn.title = localize('browser.annotateShow', "Show Annotations");
			this._hideBtn.setAttribute('aria-label', localize('browser.annotateShow', "Show Annotations"));
		}
	}

	private _createButton(iconClass: string, title: string): HTMLButtonElement {
		const btn = document.createElement('button');
		btn.className = 'browser-annotation-toolbar-button';
		btn.title = title;
		const icon = document.createElement('span');
		icon.className = `codicon ${iconClass}`;
		btn.appendChild(icon);
		return btn;
	}

	private _createSeparator(): HTMLElement {
		const sep = document.createElement('div');
		sep.className = 'browser-annotation-toolbar-separator';
		return sep;
	}

	private _setupDrag(dragHandle: HTMLElement): void {
		const onMouseDown = (e: MouseEvent) => {
			e.preventDefault();
			const win = dom.getWindow(this._toolbarElement);
			const toolbarRect = this._toolbarElement.getBoundingClientRect();
			const offsetX = e.clientX - toolbarRect.left;

			// Convert from CSS centered positioning to explicit left
			this._toolbarElement.style.left = this._toolbarElement.offsetLeft + 'px';
			this._toolbarElement.style.transform = 'none';

			dragHandle.style.cursor = 'grabbing';

			const onMouseMove = (e: MouseEvent) => {
				e.preventDefault();
				const parentRect = this._toolbarElement.parentElement?.getBoundingClientRect();
				if (!parentRect) {
					return;
				}
				const tw = this._toolbarElement.offsetWidth;
				const newLeft = Math.max(0, Math.min(e.clientX - parentRect.left - offsetX, parentRect.width - tw));
				this._toolbarElement.style.left = newLeft + 'px';
			};

			const onMouseUp = () => {
				dragHandle.style.cursor = '';
				win.document.removeEventListener('mousemove', onMouseMove);
				win.document.removeEventListener('mouseup', onMouseUp);
			};

			win.document.addEventListener('mousemove', onMouseMove);
			win.document.addEventListener('mouseup', onMouseUp);
		};

		this._register(dom.addDisposableListener(dragHandle, 'mousedown', onMouseDown));
	}
}

// Register the contribution
BrowserEditor.registerContribution(BrowserAnnotationFeature);

// -- Actions ---------------------------------------------------------------

class ToggleAnnotationModeAction extends Action2 {
	static readonly ID = 'workbench.action.browser.toggleAnnotationMode';

	constructor() {
		const enabled = ContextKeyExpr.and(
			BROWSER_SELECT_ENABLED,
			ChatContextKeys.enabled,
			ContextKeyExpr.equals('config.chat.sendElementsToChat.enabled', true),
		);
		super({
			id: ToggleAnnotationModeAction.ID,
			title: localize2('browser.toggleAnnotationMode', 'Toggle Annotation Mode'),
			category: BrowserActionCategory,
			icon: Codicon.checklist,
			f1: true,
			precondition: ContextKeyExpr.and(BROWSER_EDITOR_ACTIVE, CONTEXT_BROWSER_HAS_URL, CONTEXT_BROWSER_HAS_ERROR.negate(), enabled),
			toggled: CONTEXT_BROWSER_ANNOTATION_MODE_ACTIVE,
		});
	}

	async run(accessor: ServicesAccessor): Promise<void> {
		const browserEditor = accessor.get(IEditorService).activeEditorPane;
		if (browserEditor instanceof BrowserEditor) {
			await browserEditor.getContribution(BrowserAnnotationFeature)?.toggleAnnotationMode();
		}
	}
}

class CopyAnnotationsAction extends Action2 {
	static readonly ID = 'workbench.action.browser.copyAnnotations';

	constructor() {
		super({
			id: CopyAnnotationsAction.ID,
			title: localize2('browser.copyAnnotations', 'Copy Annotations'),
			category: BrowserActionCategory,
			icon: Codicon.copy,
			f1: true,
			precondition: ContextKeyExpr.and(BROWSER_SELECT_ENABLED, BROWSER_EDITOR_ACTIVE, CONTEXT_BROWSER_HAS_ANNOTATIONS),
		});
	}

	async run(accessor: ServicesAccessor): Promise<void> {
		const browserEditor = accessor.get(IEditorService).activeEditorPane;
		if (browserEditor instanceof BrowserEditor) {
			await browserEditor.getContribution(BrowserAnnotationFeature)?.copyAnnotations();
		}
	}
}

class SendAnnotationsToChatAction extends Action2 {
	static readonly ID = 'workbench.action.browser.sendAnnotationsToChat';

	constructor() {
		super({
			id: SendAnnotationsToChatAction.ID,
			title: localize2('browser.sendAnnotationsToChat', 'Send Annotations to Chat'),
			category: BrowserActionCategory,
			icon: Codicon.commentDiscussion,
			f1: true,
			precondition: ContextKeyExpr.and(BROWSER_SELECT_ENABLED, BROWSER_EDITOR_ACTIVE, CONTEXT_BROWSER_HAS_ANNOTATIONS, ChatContextKeys.enabled),
		});
	}

	async run(accessor: ServicesAccessor): Promise<void> {
		const browserEditor = accessor.get(IEditorService).activeEditorPane;
		if (browserEditor instanceof BrowserEditor) {
			await browserEditor.getContribution(BrowserAnnotationFeature)?.sendAnnotationsToChat();
		}
	}
}

class ClearAnnotationsAction extends Action2 {
	static readonly ID = 'workbench.action.browser.clearAnnotations';

	constructor() {
		super({
			id: ClearAnnotationsAction.ID,
			title: localize2('browser.clearAnnotations', 'Clear Annotations'),
			category: BrowserActionCategory,
			icon: Codicon.clearAll,
			f1: true,
			precondition: ContextKeyExpr.and(BROWSER_SELECT_ENABLED, BROWSER_EDITOR_ACTIVE, CONTEXT_BROWSER_HAS_ANNOTATIONS),
		});
	}

	async run(accessor: ServicesAccessor): Promise<void> {
		const browserEditor = accessor.get(IEditorService).activeEditorPane;
		if (browserEditor instanceof BrowserEditor) {
			browserEditor.getContribution(BrowserAnnotationFeature)?.clearAnnotations();
		}
	}
}

class ExitAnnotationModeAction extends Action2 {
	static readonly ID = 'workbench.action.browser.exitAnnotationMode';

	constructor() {
		super({
			id: ExitAnnotationModeAction.ID,
			title: localize2('browser.exitAnnotationMode', 'Exit Annotation Mode'),
			category: BrowserActionCategory,
			f1: false,
			precondition: CONTEXT_BROWSER_ANNOTATION_MODE_ACTIVE,
			keybinding: {
				weight: KeybindingWeight.WorkbenchContrib,
				primary: KeyCode.Escape,
				when: CONTEXT_BROWSER_ANNOTATION_MODE_ACTIVE,
			},
		});
	}

	async run(accessor: ServicesAccessor): Promise<void> {
		const browserEditor = accessor.get(IEditorService).activeEditorPane;
		if (browserEditor instanceof BrowserEditor) {
			await browserEditor.getContribution(BrowserAnnotationFeature)?.toggleAnnotationMode();
		}
	}
}

registerAction2(ToggleAnnotationModeAction);
registerAction2(CopyAnnotationsAction);
registerAction2(SendAnnotationsToChatAction);
registerAction2(ClearAnnotationsAction);
registerAction2(ExitAnnotationModeAction);

class ManageAnnotationsAction extends Action2 {
	static readonly ID = 'workbench.action.browser.manageAnnotations';

	constructor() {
		super({
			id: ManageAnnotationsAction.ID,
			title: localize2('browser.manageAnnotationsAction', 'Manage Annotations'),
			category: BrowserActionCategory,
			icon: Codicon.listOrdered,
			f1: true,
			precondition: ContextKeyExpr.and(BROWSER_SELECT_ENABLED, BROWSER_EDITOR_ACTIVE, CONTEXT_BROWSER_HAS_ANNOTATIONS),
		});
	}

	async run(accessor: ServicesAccessor): Promise<void> {
		const browserEditor = accessor.get(IEditorService).activeEditorPane;
		if (browserEditor instanceof BrowserEditor) {
			await browserEditor.getContribution(BrowserAnnotationFeature)?.manageAnnotations();
		}
	}
}

registerAction2(ManageAnnotationsAction);
