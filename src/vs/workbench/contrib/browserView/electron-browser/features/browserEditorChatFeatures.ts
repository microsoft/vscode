/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { localize, localize2 } from '../../../../../nls.js';
import { $ } from '../../../../../base/browser/dom.js';
import { Event } from '../../../../../base/common/event.js';
import { getErrorMessage } from '../../../../../base/common/errors.js';
import { IContextKey, IContextKeyService, ContextKeyExpr, RawContextKey } from '../../../../../platform/contextkey/common/contextkey.js';
import { Action2, registerAction2, MenuId, MenuRegistry } from '../../../../../platform/actions/common/actions.js';
import { ServicesAccessor, IInstantiationService } from '../../../../../platform/instantiation/common/instantiation.js';
import { KeybindingWeight } from '../../../../../platform/keybinding/common/keybindingsRegistry.js';
import { KeyMod, KeyCode } from '../../../../../base/common/keyCodes.js';
import { IEditorService } from '../../../../services/editor/common/editorService.js';
import { Codicon } from '../../../../../base/common/codicons.js';
import { ThemeIcon } from '../../../../../base/common/themables.js';
import { DisposableMap, DisposableStore } from '../../../../../base/common/lifecycle.js';
import { ILogService } from '../../../../../platform/log/common/log.js';
import { IConfigurationService } from '../../../../../platform/configuration/common/configuration.js';
import { IDialogService } from '../../../../../platform/dialogs/common/dialogs.js';
import { IStorageService, StorageScope, StorageTarget } from '../../../../../platform/storage/common/storage.js';
import { ITelemetryService } from '../../../../../platform/telemetry/common/telemetry.js';
import { IWorkspaceTrustManagementService } from '../../../../../platform/workspace/common/workspaceTrust.js';
import { URI } from '../../../../../base/common/uri.js';
import { IChatWidget, IChatWidgetService } from '../../../chat/browser/chat.js';
import { IChatService } from '../../../chat/common/chatService/chatService.js';
import { IChatRequestVariableEntry } from '../../../chat/common/attachments/chatVariableEntries.js';
import { ChatContextKeys } from '../../../chat/common/actions/chatContextKeys.js';
import { BrowserElementSelectionMode, IBrowserElementSelectionOptions, IElementData, IElementAncestor, BrowserViewCommandId } from '../../../../../platform/browserView/common/browserView.js';
import { IBrowserViewModel, BrowserViewSharingState } from '../../../browserView/common/browserView.js';
import { BrowserEditorInput } from '../../common/browserEditorInput.js';
import { Button } from '../../../../../base/browser/ui/button/button.js';
import { WorkbenchHoverDelegate } from '../../../../../platform/hover/browser/hover.js';
import { HoverPosition } from '../../../../../base/browser/ui/hover/hoverWidget.js';
import { BrowserEditor, BrowserEditorContribution, BrowserWidgetLocation, IBrowserEditorWidget, BrowserActionCategory, CONTEXT_BROWSER_HAS_ERROR, CONTEXT_BROWSER_HAS_URL, BrowserActionGroup } from '../browserEditor.js';
import { IAccessibilityService } from '../../../../../platform/accessibility/common/accessibility.js';
import { IConfigurationRegistry, Extensions as ConfigurationExtensions } from '../../../../../platform/configuration/common/configurationRegistry.js';
import { Registry } from '../../../../../platform/registry/common/platform.js';
import { PolicyCategory } from '../../../../../base/common/policy.js';
import { Extensions as ConfigurationMigrationExtensions, IConfigurationMigrationRegistry, workbenchConfigurationNodeBase } from '../../../../common/configuration.js';
import { safeSetInnerHtml } from '../../../../../base/browser/domSanitize.js';
import { Range } from '../../../../../editor/common/core/range.js';
import { ChatDynamicVariableModel } from '../../../chat/browser/attachments/chatDynamicVariables.js';
import { toAttachedContextDynamicVariable } from '../../../chat/common/attachments/chatVariables.js';
import { isEqual } from '../../../../../base/common/resources.js';
import { AccessibleContentProvider, AccessibleViewProviderId, AccessibleViewType, IAccessibleViewService } from '../../../../../platform/accessibility/browser/accessibleView.js';
import { AccessibleViewRegistry, IAccessibleViewImplementation } from '../../../../../platform/accessibility/browser/accessibleViewRegistry.js';
import { AccessibilityVerbositySettingId } from '../../../accessibility/browser/accessibilityConfiguration.js';
import { ChatPetAchievementIds, shouldUnlockChatPetIntegratedBrowserShare } from '../../../chat/browser/chatPetAchievements.js';
import { IChatPetService } from '../../../chat/browser/chatPetService.js';

// Register tools
import '../tools/browserTools.contribution.js';

/**
 * Setting that controls whether a screenshot of the selected element is attached
 * to the chat when sending elements from the Integrated Browser.
 */
const BrowserSendElementsToChatAttachImagesSettingId = 'workbench.browser.sendElementsToChat.attachImages';

/**
 * Format an array of element ancestors into a CSS-selector-like path string.
 */
function formatElementPath(ancestors: readonly IElementAncestor[] | undefined): string | undefined {
	if (!ancestors || ancestors.length === 0) {
		return undefined;
	}

	return ancestors
		.map(ancestor => {
			const classes = ancestor.classNames?.length ? `.${ancestor.classNames.join('.')}` : '';
			const id = ancestor.id ? `#${ancestor.id}` : '';
			return `${ancestor.tagName}${id}${classes}`;
		})
		.join(' > ');
}

function createElementContextValue(elementData: IElementData, displayName: string): string {
	const sections: string[] = [];
	sections.push('Attached Element Context from Integrated Browser');
	sections.push(`Element: ${displayName}`);

	if (elementData.url) {
		sections.push(`URL: ${elementData.url}`);
	}

	const htmlPath = formatElementPath(elementData.ancestors);
	if (htmlPath) {
		sections.push(`HTML Path: ${htmlPath}`);
	}

	sections.push(`Outer HTML:\n\`\`\`html\n${elementData.outerHTML}\n\`\`\``);

	if (elementData.dimensions) {
		const { top, left, width, height } = elementData.dimensions;
		sections.push(
			`Dimensions:\n- top: ${Math.round(top)}px\n- left: ${Math.round(left)}px\n- width: ${Math.round(width)}px\n- height: ${Math.round(height)}px`
		);
	}

	sections.push(`CSS:\n\`\`\`css\n${elementData.computedStyle}\n\`\`\``);

	return sections.join('\n\n');
}

// Context key expression to check if browser editor is active
const BROWSER_EDITOR_ACTIVE = ContextKeyExpr.equals('activeEditor', BrowserEditorInput.EDITOR_ID);
const BrowserCategory = localize2('browserCategory', "Browser");

const CONTEXT_BROWSER_ELEMENT_SELECTION_MODE = new RawContextKey<BrowserElementSelectionMode | undefined>('browserElementSelectionMode', undefined, localize('browser.elementSelectionMode', "The active element selection mode"));
const CONTEXT_BROWSER_AREA_SELECTION_ACTIVE = new RawContextKey<boolean>('browserAreaSelectionActive', false, localize('browser.areaSelectionActive', "Whether area selection is currently active"));

class BrowserElementCommentingAccessibilityHelp implements IAccessibleViewImplementation {
	readonly type = AccessibleViewType.Help;
	readonly priority = 110;
	readonly name = 'browserElementCommenting';
	readonly when = CONTEXT_BROWSER_ELEMENT_SELECTION_MODE.isEqualTo(BrowserElementSelectionMode.Comment);

	getProvider(accessor: ServicesAccessor): AccessibleContentProvider | undefined {
		const editorPane = accessor.get(IEditorService).activeEditorPane;
		if (!(editorPane instanceof BrowserEditor)) {
			return undefined;
		}
		return new AccessibleContentProvider(
			AccessibleViewProviderId.BrowserElementCommenting,
			{ type: AccessibleViewType.Help },
			() => [
				localize('browser.elementCommentingAccessibilityHelp.overview', "You are in Integrated Browser element commenting mode."),
				localize('browser.elementCommentingAccessibilityHelp.navigation', "Use Tab and Shift+Tab to move through focusable page elements. Press Enter to comment on the focused element."),
				localize('browser.elementCommentingAccessibilityHelp.composer', "In the comment input, press Enter to add the comment or Escape to cancel it."),
				localize('browser.elementCommentingAccessibilityHelp.continuous', "Commenting mode remains active after adding a comment. Press Escape outside the comment input to stop commenting."),
				localize('browser.elementCommentingAccessibilityHelp.pins', "Numbered comment pins are in the page tab order. Focus a pin to preview its comment, then Tab to its Remove Comment button."),
			].join('\n'),
			() => editorPane.focus(),
			AccessibilityVerbositySettingId.BrowserElementCommenting
		);
	}
}

AccessibleViewRegistry.register(new BrowserElementCommentingAccessibilityHelp());

type IntegratedBrowserAddScreenshotToChatAddedEvent = {
	screenshotType: 'viewport' | 'area' | 'fullPage';
};

type IntegratedBrowserAddScreenshotToChatAddedClassification = {
	screenshotType: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; comment: 'What kind of screenshot was captured (viewport, area, or fullPage).' };
	owner: 'jruales';
	comment: 'A screenshot was successfully added to chat from Integrated Browser.';
};


/**
 * Contribution that manages element selection, element attachment to chat,
 * console log attachment to chat, and agent sharing.
 */
export class BrowserEditorChatIntegration extends BrowserEditorContribution {
	private readonly _elementSelectionModeContext: IContextKey<BrowserElementSelectionMode | undefined>;
	private readonly _areaSelectionActiveContext: IContextKey<boolean>;
	private _elementSelectionMode: BrowserElementSelectionMode | undefined;
	private readonly _commentReferences = new Map<string, { elementId: string; attachmentIds: readonly string[]; widget: IChatWidget; browserModel: IBrowserViewModel }>();
	private readonly _commentReferenceListeners = this._register(new DisposableMap<IChatWidget, DisposableStore>());
	private readonly _commentModelListeners = this._register(new DisposableMap<IBrowserViewModel, DisposableStore>());
	private readonly _disposedCommentModels = new WeakSet<IBrowserViewModel>();
	private readonly _commentSessionsWithComments = new Set<IBrowserViewModel>();

	// Share with Agent
	private readonly _shareButtonContainer: HTMLElement;
	private readonly _shareButton: Button;

	constructor(
		editor: BrowserEditor,
		@IContextKeyService contextKeyService: IContextKeyService,
		@IInstantiationService instantiationService: IInstantiationService,
		@ITelemetryService private readonly telemetryService: ITelemetryService,
		@ILogService private readonly logService: ILogService,
		@IChatWidgetService private readonly chatWidgetService: IChatWidgetService,
		@IChatService private readonly chatService: IChatService,
		@IConfigurationService private readonly configurationService: IConfigurationService,
		@IDialogService private readonly dialogService: IDialogService,
		@IStorageService private readonly storageService: IStorageService,
		@IWorkspaceTrustManagementService private readonly workspaceTrustManagementService: IWorkspaceTrustManagementService,
		@IAccessibilityService private readonly accessibilityService: IAccessibilityService,
		@IAccessibleViewService private readonly accessibleViewService: IAccessibleViewService,
		@IChatPetService private readonly chatPetService: IChatPetService,
	) {
		super(editor);
		this._elementSelectionModeContext = CONTEXT_BROWSER_ELEMENT_SELECTION_MODE.bindTo(contextKeyService);
		this._areaSelectionActiveContext = CONTEXT_BROWSER_AREA_SELECTION_ACTIVE.bindTo(contextKeyService);

		// Build share toggle button
		const hoverDelegate = this._register(instantiationService.createInstance(
			WorkbenchHoverDelegate,
			'element',
			undefined,
			{ position: { hoverPosition: HoverPosition.ABOVE } }
		));

		this._shareButtonContainer = $('.browser-share-toggle-container');
		this._shareButton = this._register(new Button(this._shareButtonContainer, {
			supportIcons: true,
			title: localize('browser.shareWithAgent', "Share with Agent"),
			small: true,
			hoverDelegate
		}));
		this._shareButton.element.classList.add('browser-share-toggle');
		this._shareButton.label = '$(share-window)';

		this._register(this._shareButton.onDidClick(() => {
			void this._toggleShareWithAgent();
		}));

		// Auto-disable element selection when the user sends a chat request.
		this._register(this.chatService.onDidSubmitRequest(event => {
			if (this.editor.model?.elementSelectionState.active) {
				void this.editor.model.toggleElementSelection(false);
			}
			const submittedComments = [...this._commentReferences]
				.filter(([, reference]) => reference.widget.viewModel && isEqual(reference.widget.viewModel.sessionResource, event.chatSessionResource));
			if (submittedComments.length > 0) {
				const browserModels = new Set(submittedComments.map(([, reference]) => reference.browserModel));
				const widgets = new Set(submittedComments.map(([, reference]) => reference.widget));
				for (const [attachmentId] of submittedComments) {
					this._commentReferences.delete(attachmentId);
				}
				for (const widget of widgets) {
					this._disposeCommentReferenceListenerIfUnused(widget);
				}
				for (const browserModel of browserModels) {
					this._syncElementComments(browserModel);
					this._disposeCommentModelListenerIfUnused(browserModel);
				}
			}
		}));
	}

	override get widgets(): readonly IBrowserEditorWidget[] {
		return [{ location: BrowserWidgetLocation.PostUrl, element: this._shareButtonContainer, order: 50 }];
	}

	protected override onModelAttached(model: IBrowserViewModel, store: DisposableStore): void {
		// Manage sharing state
		this._updateSharingState(true);
		store.add(model.onDidChangeSharingState(() => {
			this._updateSharingState(false);
		}));
		store.add(model.onDidSelectElement(async data => {
			const tracksComment = data.comment !== undefined && data.elementId !== undefined;
			if (tracksComment) {
				this._ensureCommentModelListeners(model);
			}
			let attached = false;
			try {
				attached = await this._attachElementDataToChat(data, model);
			} catch (error) {
				this.logService.error('BrowserEditor.addElementToChat: Failed to attach element', error);
			}
			if (!attached && data.comment !== undefined && data.elementId && !this._disposedCommentModels.has(model)) {
				this._syncElementComments(model, [data.elementId]);
			}
			if (tracksComment) {
				this._disposeCommentModelListenerIfUnused(model);
			}
		}));

		// Sync context key with model state
		this._elementSelectionMode = model.elementSelectionState.active ? model.elementSelectionState.options.mode : undefined;
		this._elementSelectionModeContext.set(this._elementSelectionMode);
		store.add(model.onDidChangeElementSelectionState(state => {
			const wasCommenting = this._elementSelectionMode === BrowserElementSelectionMode.Comment;
			this._elementSelectionMode = state.active ? state.options.mode : undefined;
			this._elementSelectionModeContext.set(this._elementSelectionMode);
			const isCommenting = this._elementSelectionMode === BrowserElementSelectionMode.Comment;
			const accessibilityHelpHint = isCommenting && state.active
				? this.accessibleViewService.getOpenAriaHint(AccessibilityVerbositySettingId.BrowserElementCommenting)
				: undefined;
			this.accessibilityService.status(isCommenting
				? state.active
					? accessibilityHelpHint
						? localize('browser.elementCommentingEnabledWithAccessibilityHelp', "Element commenting enabled. Press Enter to comment on the focused element. {0}", accessibilityHelpHint)
						: localize('browser.elementCommentingEnabled', "Element commenting enabled. Press Enter to comment on the focused element.")
					: localize('browser.elementCommentingDisabled', "Element commenting disabled.")
				: state.active
					? localize('browser.elementSelectionEnabled', "Element selection enabled. Press Enter to add the focused element to chat.")
					: localize('browser.elementSelectionDisabled', "Element selection disabled."));
			if (isCommenting && !wasCommenting) {
				this._commentSessionsWithComments.delete(model);
			} else if (wasCommenting && !isCommenting && this._commentSessionsWithComments.delete(model)) {
				this._focusChatInputForComments(model);
			}
		}));
		this._areaSelectionActiveContext.set(model.isAreaSelectionActive);
		store.add(model.onDidChangeAreaSelectionActive(active => {
			this._areaSelectionActiveContext.set(active);
		}));
	}

	override onModelDetached(): void {
		if (this.editor.model) {
			this._commentSessionsWithComments.delete(this.editor.model);
		}
		this._elementSelectionModeContext.reset();
		this._elementSelectionMode = undefined;
		this._areaSelectionActiveContext.reset();
	}

	// -- Sharing -------------------------------------------------------

	private async _toggleShareWithAgent(): Promise<void> {
		const model = this.editor.model;
		if (!model) {
			return;
		}
		const shared = model.sharingState !== BrowserViewSharingState.Shared;
		let succeeded: boolean;
		try {
			succeeded = !!await model.setSharedWithAgent(shared);
		} catch (error) {
			this.logService.error('BrowserEditor.toggleShareWithAgent: Failed to update sharing state', error);
			await this.dialogService.error(
				localize('browser.shareWithAgent.failed', "Unable to Share Browser Tab"),
				getErrorMessage(error)
			);
			return;
		}
		if (shouldUnlockChatPetIntegratedBrowserShare(shared, succeeded)) {
			this.chatPetService.unlockAchievement(ChatPetAchievementIds.IntegratedBrowserShared);
		}
	}

	private _updateSharingState(isInitialState: boolean): void {
		const model = this.editor.model;
		const isShared = model?.sharingState === BrowserViewSharingState.Shared;
		const isUnavailable = !model || model.sharingState === BrowserViewSharingState.Unavailable;
		const isBlockedByNetworkPolicy = model?.sharingState === BrowserViewSharingState.BlockedByNetworkPolicy;

		this.editor.browserContainer.classList.toggle('animate', !isInitialState);
		this.editor.browserContainer.classList.toggle('shared', isShared);

		this._shareButtonContainer.style.display = isUnavailable ? 'none' : '';
		this._shareButton.enabled = !isBlockedByNetworkPolicy;
		this._shareButton.checked = isShared;
		this._shareButton.label = isShared
			? localize('browser.sharingWithAgent', "Sharing with Agent") + ' $(share-window)'
			: '$(share-window)';

		const opensShareableCopy = !isShared
			&& !!model
			&& !model.isDirectlyShareable;
		const title = isShared
			? localize('browser.unshareWithAgent', "Stop Sharing with Agent")
			: isBlockedByNetworkPolicy
				? localize('browser.shareWithAgent.blockedByNetworkPolicy', "Cannot share with agents due to network domain policy.")
				: opensShareableCopy
					? localize('browser.shareWithAgent.isolated', "Share with Agent (Opens Isolated Tab)")
					: localize('browser.shareWithAgent', "Share with Agent");
		this._shareButton.setTitle(title);
		this._shareButton.element.setAttribute('aria-label', title);
	}

	private static readonly SHARING_CONTENT_WARNING_DONT_ASK_KEY = 'browserView.agentSharingContentWarning.dontAskAgain';

	/**
	 * Confirm with the user that they understand the risks of sharing content on untrusted pages.
	 *
	 * @returns true if the user confirms (or the page is local / trusted), false if they cancel.
	 */
	private async _confirmContentAttachmentRisk(url: string): Promise<boolean> {
		// If the user previously chose "Don't show again", skip the dialog
		if (this.storageService.getBoolean(BrowserEditorChatIntegration.SHARING_CONTENT_WARNING_DONT_ASK_KEY, StorageScope.PROFILE)) {
			return true;
		}

		try {
			const parsedUrl = new URL(url);
			if (parsedUrl.protocol === 'file:') {
				// Query the workspace trust service for file URLs
				const trustInfo = await this.workspaceTrustManagementService.getUriTrustInfo(URI.file(parsedUrl.pathname));
				if (trustInfo.trusted) {
					return true;
				}
			} else if (parsedUrl.hostname === 'localhost' || parsedUrl.hostname === '127.0.0.1' || parsedUrl.hostname === '::1') {
				// Consider localhost URLs trusted
				return true;
			}
		} catch {
			// Invalid URL - fall through to the warning
		}

		const result = await this.dialogService.confirm({
			type: 'warning',
			message: localize('browser.agentSharingContentWarning.message', "Use caution when attaching content from untrusted sources."),
			detail: localize('browser.agentSharingContentWarning.detail', "Pages may contain hidden prompts that can influence agent behavior. Double-check the attached contents before sending."),
			primaryButton: localize('browser.agentSharingContentWarning.ok', "&&OK"),
			checkbox: { label: localize('browser.agentSharingContentWarning.dontShowAgain', "Don't show again"), checked: false },
		});

		if (result.confirmed && result.checkboxChecked) {
			this.storageService.store(BrowserEditorChatIntegration.SHARING_CONTENT_WARNING_DONT_ASK_KEY, true, StorageScope.PROFILE, StorageTarget.USER);
		}

		return result.confirmed;
	}

	// -- Chat widget helpers --------------------------------------------

	/**
	 * Reveal the chat widget and wait for its viewModel to be bound before
	 * returning. When the chat panel is opened for the first time the session
	 * model loads asynchronously, and once it loads {@link ChatInputPart}'s
	 * `_syncFromModel` clears any attachments that were added before the model
	 * was bound. Callers must use this helper before calling
	 * {@linkcode IChatWidget.attachmentModel.addContext} so the attachment is
	 * not silently discarded.
	 */
	private async _revealChatWidgetForAttachment(preserveFocus = false): Promise<IChatWidget | undefined> {
		const widget = await this.chatWidgetService.revealWidget(preserveFocus) ?? this.chatWidgetService.lastFocusedWidget;
		if (widget && !widget.viewModel) {
			await Event.toPromise(widget.onDidChangeViewModel);
		}
		return widget;
	}

	/**
	 * Reveal the chat widget and attach the given entries. Returns false if no widget was available.
	 * Callers are responsible for running {@link _confirmContentAttachmentRisk} first.
	 */
	private async _attachToChat(entries: readonly IChatRequestVariableEntry[]): Promise<boolean> {
		const widget = await this._revealChatWidgetForAttachment();
		if (!widget?.attachmentModel) {
			return false;
		}
		widget.attachmentModel.addContext(...entries);
		return true;
	}

	// -- Element Selection ----------------------------------------------

	private async _attachElementDataToChat(elementData: IElementData, model: IBrowserViewModel): Promise<boolean> {
		const bounds = elementData.bounds;
		const toAttach: IChatRequestVariableEntry[] = [];

		const container = document.createElement('div');
		safeSetInnerHtml(container, elementData.outerHTML);
		const element = container.firstElementChild;
		const innerText = container.textContent;

		let displayNameShort = element ? `${element.tagName.toLowerCase()}${element.id ? `#${element.id}` : ''}` : '';
		let displayNameFull = element ? `${displayNameShort}${element.classList.length ? `.${[...element.classList].join('.')}` : ''}` : '';
		if (elementData.ancestors && elementData.ancestors.length > 0) {
			let last = elementData.ancestors[elementData.ancestors.length - 1];
			let pseudo = '';
			if (last.tagName.startsWith('::') && elementData.ancestors.length > 1) {
				pseudo = last.tagName;
				last = elementData.ancestors[elementData.ancestors.length - 2];
			}
			displayNameShort = `${last.tagName.toLowerCase()}${last.id ? `#${last.id}` : ''}${pseudo}`;
			displayNameFull = `${last.tagName.toLowerCase()}${last.id ? `#${last.id}` : ''}${last.classNames && last.classNames.length ? `.${last.classNames.join('.')}` : ''}${pseudo}`;
		}

		const value = createElementContextValue(elementData, displayNameFull);
		const attachImages = this.configurationService.getValue<boolean>(BrowserSendElementsToChatAttachImagesSettingId);
		const screenshotBuffer = attachImages
			? await model.captureScreenshot({
				quality: 90,
				pageRect: bounds,
				awaitNextPaint: true
			})
			: undefined;

		const elementEntry: IChatRequestVariableEntry = {
			id: 'element-' + Date.now(),
			name: displayNameShort,
			fullName: displayNameFull,
			value: value,
			modelDescription: 'Structured browser element context with HTML path, outer HTML, dimensions, and computed styles.',
			kind: 'element',
			icon: ThemeIcon.fromId(Codicon.layout.id),
			ancestors: elementData.ancestors,
			attributes: elementData.attributes,
			computedStyles: elementData.computedStyles,
			dimensions: elementData.dimensions,
			innerText,
			imageData: screenshotBuffer?.buffer,
			imageMimeType: screenshotBuffer ? 'image/jpeg' : undefined,
		};
		toAttach.push(elementEntry);

		if (!await this._confirmContentAttachmentRisk(elementData.url ?? model.url)) {
			return false;
		}
		const widget = await this._revealChatWidgetForAttachment(elementData.comment !== undefined);
		if (!widget?.attachmentModel || this._disposedCommentModels.has(model)) {
			return false;
		}
		widget.attachmentModel.addContext(...toAttach);
		if (elementData.comment !== undefined && elementData.elementId) {
			if (!this._insertElementCommentReference(widget, model, elementEntry, toAttach.map(attachment => attachment.id), elementData.elementId, elementData.comment)) {
				widget.attachmentModel.delete(...toAttach.map(attachment => attachment.id));
				return false;
			}
			if (model.elementSelectionState.active) {
				this._commentSessionsWithComments.add(model);
			} else {
				widget.focusInput();
			}
		}

		type IntegratedBrowserAddElementToChatAddedEvent = {
			attachImages: boolean;
		};

		type IntegratedBrowserAddElementToChatAddedClassification = {
			attachImages: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; isMeasurement: true; comment: 'Whether workbench.browser.sendElementsToChat.attachImages was enabled.' };
			owner: 'jruales';
			comment: 'An element was successfully added to chat from Integrated Browser.';
		};

		this.telemetryService.publicLog2<IntegratedBrowserAddElementToChatAddedEvent, IntegratedBrowserAddElementToChatAddedClassification>('integratedBrowser.addElementToChat.added', {
			attachImages
		});
		return true;
	}

	private _insertElementCommentReference(widget: IChatWidget, browserModel: IBrowserViewModel, attachment: IChatRequestVariableEntry, attachmentIds: readonly string[], elementId: string, comment: string): boolean {
		const inputModel = widget.inputEditor.getModel();
		const dynamicVariableModel = widget.getContrib<ChatDynamicVariableModel>(ChatDynamicVariableModel.ID);
		if (!inputModel || !dynamicVariableModel) {
			return false;
		}

		const insertionPosition = widget.inputEditor.getPosition() ?? inputModel.getFullModelRange().getEndPosition();
		const prefix = insertionPosition.column > 1 ? '\n' : '';
		const suffix = insertionPosition.column < inputModel.getLineMaxColumn(insertionPosition.lineNumber) ? '\n' : '';
		const reference = `@${attachment.name}`;
		const commentText = comment ? ` ${comment}` : '';
		const text = `${prefix}${reference}${commentText}${suffix}`;
		if (!widget.inputEditor.executeEdits('browserElementComment', [{ range: Range.fromPositions(insertionPosition), text }])) {
			return false;
		}
		const referenceStart = prefix ? { lineNumber: insertionPosition.lineNumber + 1, column: 1 } : insertionPosition;
		const referenceRange = new Range(referenceStart.lineNumber, referenceStart.column, referenceStart.lineNumber, referenceStart.column + reference.length);
		dynamicVariableModel.addReference(toAttachedContextDynamicVariable(attachment, referenceRange));
		widget.inputEditor.setPosition({
			lineNumber: referenceRange.endLineNumber,
			column: referenceRange.endColumn + commentText.length
		});

		this._commentReferences.set(attachment.id, { elementId, attachmentIds, widget, browserModel });
		this._ensureCommentReferenceListeners(widget, dynamicVariableModel);
		this._ensureCommentModelListeners(browserModel);
		this._syncElementComments(browserModel);
		return true;
	}

	private _ensureCommentReferenceListeners(widget: IChatWidget, dynamicVariableModel: ChatDynamicVariableModel): void {
		if (this._commentReferenceListeners.has(widget)) {
			return;
		}
		const store = new DisposableStore();
		store.add(dynamicVariableModel.onDidChangeReferences(() => this._syncElementCommentsForWidget(widget)));
		store.add(widget.inputEditor.onDidChangeModelContent(() => this._syncElementCommentsForWidget(widget)));
		store.add(widget.attachmentModel.onDidChange(event => {
			for (const [attachmentId, tracked] of this._commentReferences) {
				if (tracked.widget === widget && event.deleted.includes(attachmentId)) {
					this._removeElementCommentReference(tracked.browserModel, tracked.elementId);
				}
			}
		}));
		this._commentReferenceListeners.set(widget, store);
	}

	private _ensureCommentModelListeners(browserModel: IBrowserViewModel): void {
		if (this._commentModelListeners.has(browserModel)) {
			return;
		}
		const store = new DisposableStore();
		store.add(browserModel.onDidRemoveElementComment(elementId => this._removeElementCommentReference(browserModel, elementId)));
		store.add(browserModel.onDidNavigate(() => this._detachElementCommentReferences(browserModel)));
		store.add(browserModel.onWillDispose(() => {
			this._disposedCommentModels.add(browserModel);
			this._detachElementCommentReferences(browserModel, false);
		}));
		this._commentModelListeners.set(browserModel, store);
	}

	private _syncElementCommentsForWidget(widget: IChatWidget): void {
		const browserModels = new Set<IBrowserViewModel>();
		for (const reference of this._commentReferences.values()) {
			if (reference.widget === widget) {
				browserModels.add(reference.browserModel);
			}
		}
		for (const browserModel of browserModels) {
			this._syncElementComments(browserModel);
		}
	}

	private _syncElementComments(browserModel: IBrowserViewModel, pendingCommentIdsToDiscard?: readonly string[]): void {
		const comments: { elementId: string; body: string }[] = [];
		for (const [attachmentId, tracked] of this._commentReferences) {
			if (tracked.browserModel !== browserModel) {
				continue;
			}
			const inputModel = tracked.widget.inputEditor.getModel();
			const dynamicVariableModel = tracked.widget.getContrib<ChatDynamicVariableModel>(ChatDynamicVariableModel.ID);
			if (!inputModel || !dynamicVariableModel) {
				continue;
			}
			const variable = dynamicVariableModel.variables.find(candidate => candidate.id === attachmentId && candidate.isAttachmentReference);
			if (!variable) {
				this._deleteCommentAttachments(attachmentId, tracked);
				continue;
			}
			const line = inputModel.getLineContent(variable.range.endLineNumber);
			comments.push({
				elementId: tracked.elementId,
				body: line.slice(variable.range.endColumn - 1).trimStart()
			});
		}
		void browserModel.setElementComments({ comments, pendingCommentIdsToDiscard });
	}

	private _removeElementCommentReference(browserModel: IBrowserViewModel, elementId: string): void {
		for (const [attachmentId, tracked] of this._commentReferences) {
			if (tracked.browserModel !== browserModel || tracked.elementId !== elementId) {
				continue;
			}
			const dynamicVariableModel = tracked.widget.getContrib<ChatDynamicVariableModel>(ChatDynamicVariableModel.ID);
			const variable = dynamicVariableModel?.variables.find(candidate => candidate.id === attachmentId && candidate.isAttachmentReference);
			const inputModel = tracked.widget.inputEditor.getModel();
			if (variable && inputModel) {
				const lineNumber = variable.range.startLineNumber;
				const lineRange = lineNumber < inputModel.getLineCount()
					? new Range(lineNumber, 1, lineNumber + 1, 1)
					: lineNumber > 1
						? new Range(lineNumber - 1, inputModel.getLineMaxColumn(lineNumber - 1), lineNumber, inputModel.getLineMaxColumn(lineNumber))
						: inputModel.getFullModelRange();
				tracked.widget.inputEditor.executeEdits('browserElementComment', [{
					range: lineRange,
					text: ''
				}]);
			}
			this._deleteCommentAttachments(attachmentId, tracked);
		}
	}

	private _detachElementCommentReferences(browserModel: IBrowserViewModel, syncComments = true): void {
		this._commentSessionsWithComments.delete(browserModel);
		const widgets = new Set<IChatWidget>();
		for (const [attachmentId, reference] of this._commentReferences) {
			if (reference.browserModel === browserModel) {
				widgets.add(reference.widget);
				this._commentReferences.delete(attachmentId);
			}
		}
		for (const widget of widgets) {
			this._disposeCommentReferenceListenerIfUnused(widget);
		}
		this._commentModelListeners.deleteAndDispose(browserModel);
		if (syncComments) {
			void browserModel.setElementComments({ comments: [] });
		}
	}

	private _focusChatInputForComments(browserModel: IBrowserViewModel): void {
		for (const reference of this._commentReferences.values()) {
			if (reference.browserModel === browserModel) {
				reference.widget.focusInput();
				return;
			}
		}
	}

	private _deleteCommentAttachments(elementAttachmentId: string, tracked: { attachmentIds: readonly string[]; widget: IChatWidget; browserModel: IBrowserViewModel }): void {
		this._commentReferences.delete(elementAttachmentId);
		tracked.widget.attachmentModel.delete(...tracked.attachmentIds);
		this._disposeCommentReferenceListenerIfUnused(tracked.widget);
		this._disposeCommentModelListenerIfUnused(tracked.browserModel);
	}

	private _disposeCommentReferenceListenerIfUnused(widget: IChatWidget): void {
		for (const reference of this._commentReferences.values()) {
			if (reference.widget === widget) {
				return;
			}
		}
		this._commentReferenceListeners.deleteAndDispose(widget);
	}

	private _disposeCommentModelListenerIfUnused(browserModel: IBrowserViewModel): void {
		for (const reference of this._commentReferences.values()) {
			if (reference.browserModel === browserModel) {
				return;
			}
		}
		this._commentModelListeners.deleteAndDispose(browserModel);
	}

	// -- Console Logs ---------------------------------------------------

	/**
	 * Grab the current console logs from the active console session and attach them to chat.
	 */
	async addConsoleLogsToChat(): Promise<void> {
		const model = this.editor.model;
		if (!model) {
			return;
		}

		try {
			const logs = await model.getConsoleLogs();
			if (!logs) {
				return;
			}

			if (!await this._confirmContentAttachmentRisk(model.url)) {
				return;
			}

			const toAttach: IChatRequestVariableEntry[] = [];
			toAttach.push({
				id: 'console-logs-' + Date.now(),
				name: localize('consoleLogs', 'Console Logs'),
				fullName: localize('consoleLogs', 'Console Logs'),
				value: logs,
				modelDescription: 'Console logs captured from Integrated Browser.',
				kind: 'element',
				icon: ThemeIcon.fromId(Codicon.terminal.id),
			});

			await this._attachToChat(toAttach);
		} catch (error) {
			this.logService.error('BrowserEditor.addConsoleLogsToChat: Failed to get console logs', error);
		}
	}

	// -- Screenshot ----------------------------------------------------

	/**
	 * Capture a viewport screenshot of the current browser view and attach it to chat.
	 */
	async addScreenshotToChat(): Promise<void> {
		const model = this.editor.model;
		if (!model) {
			return;
		}

		try {
			// Capture the screenshot BEFORE revealing the chat panel or prompting the
			// user so the image reflects what the user saw when they pressed the button,
			// not a reflowed version of the page after the panel opens or a later version
			// after the dialog appears.
			const screenshotBuffer = await model.captureScreenshot({ quality: 80 });

			if (!await this._confirmContentAttachmentRisk(model.url)) {
				return;
			}

			const toAttach: IChatRequestVariableEntry[] = [{
				id: 'browser-screenshot-' + Date.now(),
				name: localize('browserScreenshot', 'Browser Screenshot'),
				fullName: localize('browserScreenshot', 'Browser Screenshot'),
				kind: 'image',
				value: screenshotBuffer.buffer,
				mimeType: 'image/jpeg',
			}];

			if (!await this._attachToChat(toAttach)) {
				return;
			}

			this.telemetryService.publicLog2<IntegratedBrowserAddScreenshotToChatAddedEvent, IntegratedBrowserAddScreenshotToChatAddedClassification>('integratedBrowser.addScreenshotToChat.added', {
				screenshotType: 'viewport'
			});
		} catch (error) {
			this.logService.error('BrowserEditor.addScreenshotToChat: Failed to capture screenshot', error);
		}
	}

	/**
	 * Drive the area-screenshot flow: present the drag-to-select picker, capture the
	 * user-drawn region, and attach the resulting image to chat.
	 */
	async addAreaScreenshotToChat(): Promise<void> {
		const model = this.editor.model;
		if (!model) {
			return;
		}

		// Toggle off if already active — second invocation cancels.
		if (model.isAreaSelectionActive) {
			void model.toggleAreaSelection(false);
			return;
		}

		this.editor.ensureBrowserFocus();

		// `onDidPickArea` fires exactly once per session with the user-drawn rectangle
		// or `undefined` on cancellation, so we don't have to reconcile rect vs.
		// activation-state events across the IPC boundary.
		const pickPromise = Event.toPromise(Event.once(model.onDidPickArea));
		void model.toggleAreaSelection(true);
		const rect = await pickPromise;

		if (!rect) {
			return;
		}

		try {
			// Added awaitNextPaint because the area selection UI (a dashed rectangle) was every so often making its way
			// into the captured screenshot.
			const screenshotBuffer = await model.captureScreenshot({ quality: 80, pageRect: rect, awaitNextPaint: true });

			if (!await this._confirmContentAttachmentRisk(model.url)) {
				return;
			}

			const toAttach: IChatRequestVariableEntry[] = [{
				id: 'browser-area-screenshot-' + Date.now(),
				name: localize('browserAreaScreenshot', 'Browser Area Screenshot'),
				fullName: localize('browserAreaScreenshot', 'Browser Area Screenshot'),
				kind: 'image',
				value: screenshotBuffer.buffer,
				mimeType: 'image/jpeg',
			}];

			if (!await this._attachToChat(toAttach)) {
				return;
			}

			this.telemetryService.publicLog2<IntegratedBrowserAddScreenshotToChatAddedEvent, IntegratedBrowserAddScreenshotToChatAddedClassification>('integratedBrowser.addScreenshotToChat.added', {
				screenshotType: 'area'
			});
		} catch (error) {
			this.logService.error('BrowserEditor.addAreaScreenshotToChat: Failed to capture area screenshot', error);
		}
	}

	/**
	 * Capture a full-page screenshot (including content scrolled off-screen) and attach it to chat.
	 */
	async addFullPageScreenshotToChat(): Promise<void> {
		const model = this.editor.model;
		if (!model) {
			return;
		}

		try {
			const screenshotBuffer = await model.captureScreenshot({ fullPage: true, format: 'png' });

			if (!await this._confirmContentAttachmentRisk(model.url)) {
				return;
			}

			const toAttach: IChatRequestVariableEntry[] = [{
				id: 'browser-fullpage-screenshot-' + Date.now(),
				name: localize('browserFullPageScreenshot', 'Browser Full Page Screenshot'),
				fullName: localize('browserFullPageScreenshot', 'Browser Full Page Screenshot'),
				kind: 'image',
				value: screenshotBuffer.buffer,
				mimeType: 'image/png',
			}];

			if (!await this._attachToChat(toAttach)) {
				return;
			}

			this.telemetryService.publicLog2<IntegratedBrowserAddScreenshotToChatAddedEvent, IntegratedBrowserAddScreenshotToChatAddedClassification>('integratedBrowser.addScreenshotToChat.added', {
				screenshotType: 'fullPage'
			});
		} catch (error) {
			this.logService.error('BrowserEditor.addFullPageScreenshotToChat: Failed to capture full-page screenshot', error);
		}
	}
}

// Register the contribution
BrowserEditor.registerContribution(BrowserEditorChatIntegration);

// -- Actions ------------------------------------------------------------

class AddElementToChatAction extends Action2 {
	static readonly ID = BrowserViewCommandId.AddElementToChat;

	constructor() {
		super({
			id: AddElementToChatAction.ID,
			title: localize2('browser.addElementToChatAction', 'Add Element to Chat'),
			category: BrowserCategory,
			icon: Codicon.inspect,
			f1: true,
			precondition: ContextKeyExpr.and(BROWSER_EDITOR_ACTIVE, CONTEXT_BROWSER_HAS_URL, CONTEXT_BROWSER_HAS_ERROR.negate(), ChatContextKeys.enabled),
			toggled: CONTEXT_BROWSER_ELEMENT_SELECTION_MODE.isEqualTo(BrowserElementSelectionMode.Select),
			menu: {
				id: MenuId.BrowserChatActionsMenu,
				group: '1_element',
				order: 1,
				when: ChatContextKeys.enabled
			},
			keybinding: [{
				weight: KeybindingWeight.WorkbenchContrib + 50, // Priority over terminal
				primary: KeyMod.CtrlCmd | KeyMod.Shift | KeyCode.KeyC,
				args: { highlightFocusedElement: true },
			}]
		});
	}

	run(accessor: ServicesAccessor, argument?: IBrowserElementSelectionOptions | BrowserEditor): void {
		const browserEditor = argument instanceof BrowserEditor ? argument : accessor.get(IEditorService).activeEditorPane;
		if (browserEditor instanceof BrowserEditor) {
			browserEditor.ensureBrowserFocus();
			const model = browserEditor.model;
			if (model) {
				const options = argument instanceof BrowserEditor ? undefined : argument;
				const isActiveMode = model.elementSelectionState.active && model.elementSelectionState.options.mode !== BrowserElementSelectionMode.Comment;
				void model.toggleElementSelection(!isActiveMode, { ...options, continuous: false, mode: BrowserElementSelectionMode.Select });
			}
		}
	}
}

class AddElementCommentToChatAction extends Action2 {
	static readonly ID = BrowserViewCommandId.AddElementCommentToChat;

	constructor() {
		super({
			id: AddElementCommentToChatAction.ID,
			title: localize2('browser.addElementCommentToChatAction', 'Comment on Elements'),
			category: BrowserCategory,
			icon: Codicon.comment,
			f1: true,
			precondition: ContextKeyExpr.and(BROWSER_EDITOR_ACTIVE, CONTEXT_BROWSER_HAS_URL, CONTEXT_BROWSER_HAS_ERROR.negate(), ChatContextKeys.enabled),
			toggled: CONTEXT_BROWSER_ELEMENT_SELECTION_MODE.isEqualTo(BrowserElementSelectionMode.Comment),
			menu: {
				id: MenuId.BrowserChatActionsMenu,
				group: '1_element',
				order: 2,
				when: ChatContextKeys.enabled
			},
			keybinding: [{
				weight: KeybindingWeight.WorkbenchContrib + 50,
				primary: KeyMod.CtrlCmd | KeyMod.Alt | KeyCode.KeyC,
				args: { continuous: true, mode: BrowserElementSelectionMode.Comment, highlightFocusedElement: true }
			}],
		});
	}

	run(accessor: ServicesAccessor, argument?: IBrowserElementSelectionOptions | BrowserEditor): void {
		const browserEditor = argument instanceof BrowserEditor ? argument : accessor.get(IEditorService).activeEditorPane;
		if (browserEditor instanceof BrowserEditor) {
			browserEditor.ensureBrowserFocus();
			const options = argument instanceof BrowserEditor ? undefined : argument;
			const model = browserEditor.model;
			if (model) {
				const isActiveMode = model.elementSelectionState.active && model.elementSelectionState.options.mode === BrowserElementSelectionMode.Comment;
				void model.toggleElementSelection(!isActiveMode, { ...options, continuous: true, mode: BrowserElementSelectionMode.Comment });
			}
		}
	}
}

class StopElementSelectionAction extends Action2 {
	constructor() {
		super({
			id: 'workbench.action.browser.stopElementSelection',
			title: localize2('browser.stopElementSelectionAction', 'Stop Element Selection'),
			precondition: ContextKeyExpr.and(BROWSER_EDITOR_ACTIVE, ContextKeyExpr.has(CONTEXT_BROWSER_ELEMENT_SELECTION_MODE.key)),
			keybinding: {
				when: ContextKeyExpr.has(CONTEXT_BROWSER_ELEMENT_SELECTION_MODE.key),
				weight: KeybindingWeight.WorkbenchContrib,
				primary: KeyCode.Escape
			}
		});
	}

	run(accessor: ServicesAccessor): void {
		const browserEditor = accessor.get(IEditorService).activeEditorPane;
		if (browserEditor instanceof BrowserEditor) {
			void browserEditor.model?.toggleElementSelection(false);
		}
	}
}

class AddConsoleLogsToChatAction extends Action2 {
	static readonly ID = BrowserViewCommandId.AddConsoleLogsToChat;

	constructor() {
		super({
			id: AddConsoleLogsToChatAction.ID,
			title: localize2('browser.addConsoleLogsToChatAction', 'Add Console Logs to Chat'),
			category: BrowserActionCategory,
			icon: Codicon.output,
			f1: true,
			precondition: ContextKeyExpr.and(BROWSER_EDITOR_ACTIVE, CONTEXT_BROWSER_HAS_URL, CONTEXT_BROWSER_HAS_ERROR.negate(), ChatContextKeys.enabled),
			menu: {
				id: MenuId.BrowserChatActionsMenu,
				group: '2_logs',
				order: 1,
				when: ChatContextKeys.enabled
			}
		});
	}

	async run(accessor: ServicesAccessor, browserEditor = accessor.get(IEditorService).activeEditorPane): Promise<void> {
		if (browserEditor instanceof BrowserEditor) {
			await browserEditor.getContribution(BrowserEditorChatIntegration)?.addConsoleLogsToChat();
		}
	}
}

class AddScreenshotToChatAction extends Action2 {
	static readonly ID = BrowserViewCommandId.AddScreenshotToChat;

	constructor() {
		super({
			id: AddScreenshotToChatAction.ID,
			title: localize2('browser.addScreenshotToChatAction', 'Add Screenshot to Chat'),
			category: BrowserActionCategory,
			icon: Codicon.deviceCamera,
			f1: true,
			precondition: ContextKeyExpr.and(BROWSER_EDITOR_ACTIVE, CONTEXT_BROWSER_HAS_URL, CONTEXT_BROWSER_HAS_ERROR.negate(), ChatContextKeys.enabled),
			menu: {
				id: MenuId.BrowserChatActionsMenu,
				group: '3_screenshots',
				order: 1,
				when: ChatContextKeys.enabled
			}
		});
	}

	async run(accessor: ServicesAccessor, browserEditor = accessor.get(IEditorService).activeEditorPane): Promise<void> {
		if (browserEditor instanceof BrowserEditor) {
			await browserEditor.getContribution(BrowserEditorChatIntegration)?.addScreenshotToChat();
		}
	}
}

class AddAreaScreenshotToChatAction extends Action2 {
	static readonly ID = BrowserViewCommandId.AddAreaScreenshotToChat;

	constructor() {
		super({
			id: AddAreaScreenshotToChatAction.ID,
			title: localize2('browser.addAreaScreenshotToChatAction', 'Add Area Screenshot to Chat'),
			category: BrowserActionCategory,
			icon: Codicon.screenFull,
			f1: true,
			precondition: ContextKeyExpr.and(BROWSER_EDITOR_ACTIVE, CONTEXT_BROWSER_HAS_URL, CONTEXT_BROWSER_HAS_ERROR.negate(), ChatContextKeys.enabled),
			toggled: CONTEXT_BROWSER_AREA_SELECTION_ACTIVE,
			menu: {
				id: MenuId.BrowserChatActionsMenu,
				group: '3_screenshots',
				order: 2,
				when: ChatContextKeys.enabled
			}
		});
	}

	async run(accessor: ServicesAccessor, browserEditor = accessor.get(IEditorService).activeEditorPane): Promise<void> {
		if (browserEditor instanceof BrowserEditor) {
			await browserEditor.getContribution(BrowserEditorChatIntegration)?.addAreaScreenshotToChat();
		}
	}
}

class AddFullPageScreenshotToChatAction extends Action2 {
	static readonly ID = BrowserViewCommandId.AddFullPageScreenshotToChat;

	constructor() {
		const enabledSetting = ContextKeyExpr.has('config.workbench.browser.experimentalUserTools.enabled');
		super({
			id: AddFullPageScreenshotToChatAction.ID,
			title: localize2('browser.addFullPageScreenshotToChatAction', 'Add Full Page Screenshot to Chat (Experimental)'),
			category: BrowserActionCategory,
			icon: Codicon.deviceCamera,
			f1: true,
			precondition: ContextKeyExpr.and(BROWSER_EDITOR_ACTIVE, CONTEXT_BROWSER_HAS_URL, CONTEXT_BROWSER_HAS_ERROR.negate(), ChatContextKeys.enabled, enabledSetting),
			menu: {
				id: MenuId.BrowserChatActionsMenu,
				group: '3_screenshots',
				order: 3,
				when: ContextKeyExpr.and(ChatContextKeys.enabled, enabledSetting)
			}
		});
	}

	async run(accessor: ServicesAccessor, browserEditor = accessor.get(IEditorService).activeEditorPane): Promise<void> {
		if (browserEditor instanceof BrowserEditor) {
			await browserEditor.getContribution(BrowserEditorChatIntegration)?.addFullPageScreenshotToChat();
		}
	}
}

registerAction2(AddElementToChatAction);
registerAction2(AddElementCommentToChatAction);
registerAction2(StopElementSelectionAction);
registerAction2(AddConsoleLogsToChatAction);
registerAction2(AddScreenshotToChatAction);
registerAction2(AddAreaScreenshotToChatAction);
registerAction2(AddFullPageScreenshotToChatAction);

// Expose the chat actions submenu (Add Element to Chat, etc.) as a split button in the browser actions toolbar.
// The primary action (chevron's left side) is the first item in the submenu.
MenuRegistry.appendMenuItem(MenuId.BrowserActionsToolbar, {
	submenu: MenuId.BrowserChatActionsMenu,
	title: localize2('browser.chatActionsSubmenu', "Add to Chat"),
	icon: Codicon.inspect,
	group: BrowserActionGroup.Tools,
	order: 1,
	when: ChatContextKeys.enabled,
	isSplitButton: {
		togglePrimaryAction: true,
		primaryActionIds: [AddElementToChatAction.ID, AddElementCommentToChatAction.ID]
	}
});

Registry.as<IConfigurationRegistry>(ConfigurationExtensions.Configuration).registerConfiguration({
	...workbenchConfigurationNodeBase,
	properties: {
		'workbench.browser.enableChatTools': {
			type: 'boolean',
			default: true,
			markdownDescription: localize(
				{ comment: ['This is the description for a setting.'], key: 'browser.enableChatTools' },
				'When enabled, chat agents can use browser tools to open and interact with pages in the Integrated Browser.'
			),
			policy: {
				name: 'BrowserChatTools',
				category: PolicyCategory.InteractiveSession,
				minimumVersion: '1.110',
				localization: {
					description: {
						key: 'browser.enableChatTools',
						value: localize('browser.enableChatTools', 'When enabled, chat agents can use browser tools to open and interact with pages in the Integrated Browser.')
					}
				},
			},
			agentsWindow: { default: true },
		},
		'workbench.browser.experimentalUserTools.enabled': {
			type: 'boolean',
			default: false,
			experiment: { mode: 'startup' },
			tags: ['experimental'],
			markdownDescription: localize(
				{ comment: ['This is the description for a setting.'], key: 'browser.experimentalUserTools.enabled' },
				"When enabled, experimental user-facing tools are available in the Integrated Browser's Add to Chat menu."
			),
		},
		[BrowserSendElementsToChatAttachImagesSettingId]: {
			type: 'boolean',
			default: true,
			markdownDescription: localize('workbench.browser.sendElementsToChat.attachImages', "Controls whether a screenshot of the selected element will be added to the chat."),
		}
	}
});

Registry.as<IConfigurationMigrationRegistry>(ConfigurationMigrationExtensions.ConfigurationMigration).registerConfigurationMigrations([
	{
		key: 'chat.sendElementsToChat.attachImages',
		migrateFn: value => {
			const result: [string, { value: unknown | undefined }][] = [
				['chat.sendElementsToChat.attachImages', { value: undefined }],
			];
			if (typeof value === 'boolean') {
				result.push([BrowserSendElementsToChatAttachImagesSettingId, { value }]);
			}
			return result;
		}
	}
]);
