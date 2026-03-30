/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { localize, localize2 } from '../../../../../nls.js';
import { $ } from '../../../../../base/browser/dom.js';
import { CancellationTokenSource } from '../../../../../base/common/cancellation.js';
import { IContextKey, IContextKeyService, ContextKeyExpr, RawContextKey } from '../../../../../platform/contextkey/common/contextkey.js';
import { Action2, registerAction2, MenuId } from '../../../../../platform/actions/common/actions.js';
import { ServicesAccessor, IInstantiationService } from '../../../../../platform/instantiation/common/instantiation.js';
import { KeybindingWeight } from '../../../../../platform/keybinding/common/keybindingsRegistry.js';
import { KeyMod, KeyCode } from '../../../../../base/common/keyCodes.js';
import { IEditorService } from '../../../../services/editor/common/editorService.js';
import { Codicon } from '../../../../../base/common/codicons.js';
import { ThemeIcon } from '../../../../../base/common/themables.js';
import { DisposableStore } from '../../../../../base/common/lifecycle.js';
import { Event } from '../../../../../base/common/event.js';
import { ILogService } from '../../../../../platform/log/common/log.js';
import { IConfigurationService } from '../../../../../platform/configuration/common/configuration.js';
import { ITelemetryService } from '../../../../../platform/telemetry/common/telemetry.js';
import { IChatWidgetService } from '../../../chat/browser/chat.js';
import { IChatRequestVariableEntry } from '../../../chat/common/attachments/chatVariableEntries.js';
import { ChatContextKeys } from '../../../chat/common/actions/chatContextKeys.js';
import { ChatConfiguration } from '../../../chat/common/constants.js';
import { IElementData, createElementContextValue } from '../../../../../platform/browserElements/common/browserElements.js';
import { BrowserViewCommandId } from '../../../../../platform/browserView/common/browserView.js';
import { IBrowserViewModel } from '../../../browserView/common/browserView.js';
import { BrowserEditorInput } from '../../common/browserEditorInput.js';
import { Button } from '../../../../../base/browser/ui/button/button.js';
import { WorkbenchHoverDelegate } from '../../../../../platform/hover/browser/hover.js';
import { HoverPosition } from '../../../../../base/browser/ui/hover/hoverWidget.js';
import { BrowserEditor, BrowserEditorContribution, IBrowserEditorWidgetContribution, CONTEXT_BROWSER_HAS_ERROR, CONTEXT_BROWSER_HAS_URL, CONTEXT_BROWSER_FOCUSED } from '../browserEditor.js';
import { IConfigurationRegistry, Extensions as ConfigurationExtensions } from '../../../../../platform/configuration/common/configurationRegistry.js';
import { Registry } from '../../../../../platform/registry/common/platform.js';
import { PolicyCategory } from '../../../../../base/common/policy.js';
import { workbenchConfigurationNodeBase } from '../../../../common/configuration.js';
import { safeSetInnerHtml } from '../../../../../base/browser/domSanitize.js';
import { BrowserActionCategory } from '../browserViewActions.js';

// Register tools
import '../tools/browserTools.contribution.js';

// Context key expression to check if browser editor is active
const BROWSER_EDITOR_ACTIVE = ContextKeyExpr.equals('activeEditor', BrowserEditorInput.EDITOR_ID);
const BrowserCategory = localize2('browserCategory', "Browser");

const CONTEXT_BROWSER_ELEMENT_SELECTION_ACTIVE = new RawContextKey<boolean>('browserElementSelectionActive', false, localize('browser.elementSelectionActive', "Whether element selection is currently active"));

const canShareBrowserWithAgentContext = ContextKeyExpr.and(
	ChatContextKeys.enabled,
	ContextKeyExpr.has(`config.${ChatConfiguration.AgentEnabled}`),
	ContextKeyExpr.has(`config.workbench.browser.enableChatTools`),
)!;


/**
 * Contribution that manages element selection, element attachment to chat,
 * console log attachment to chat, and agent sharing.
 */
export class BrowserEditorChatIntegration extends BrowserEditorContribution {
	private _elementSelectionCts: CancellationTokenSource | undefined;
	private readonly _elementSelectionActiveContext: IContextKey<boolean>;

	// Share with Agent
	private readonly _shareButtonContainer: HTMLElement;
	private readonly _shareButton: Button;

	constructor(
		editor: BrowserEditor,
		@IContextKeyService private readonly contextKeyService: IContextKeyService,
		@IInstantiationService instantiationService: IInstantiationService,
		@ITelemetryService private readonly telemetryService: ITelemetryService,
		@ILogService private readonly logService: ILogService,
		@IChatWidgetService private readonly chatWidgetService: IChatWidgetService,
		@IConfigurationService private readonly configurationService: IConfigurationService,
	) {
		super(editor);
		this._elementSelectionActiveContext = CONTEXT_BROWSER_ELEMENT_SELECTION_ACTIVE.bindTo(contextKeyService);

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
		this._shareButton.label = '$(agent)';

		this._register(this._shareButton.onDidClick(() => {
			this._toggleShareWithAgent();
		}));

		// Show share button only when chat is enabled and browser tools are enabled
		const updateShareButtonVisibility = () => {
			this._shareButtonContainer.style.display = contextKeyService.contextMatchesRules(canShareBrowserWithAgentContext) ? '' : 'none';
		};
		updateShareButtonVisibility();
		const agentSharingKeys = new Set(canShareBrowserWithAgentContext.keys());
		this._register(Event.filter(contextKeyService.onDidChangeContext, e => e.affectsSome(agentSharingKeys))(() => {
			updateShareButtonVisibility();
		}));
	}

	override get urlBarWidgets(): readonly IBrowserEditorWidgetContribution[] {
		return [{ element: this._shareButtonContainer, order: 100 }];
	}

	protected override subscribeToModel(model: IBrowserViewModel, store: DisposableStore): void {
		// Manage sharing state
		this._updateSharingState(true);
		store.add(model.onDidChangeSharedWithAgent(() => {
			this._updateSharingState(false);
		}));
		store.add(Event.filter(this.contextKeyService.onDidChangeContext, e => e.affectsSome(new Set(canShareBrowserWithAgentContext.keys())))(() => {
			this._updateSharingState(false);
		}));
	}

	override clear(): void {
		if (this._elementSelectionCts) {
			this._elementSelectionCts.dispose(true);
			this._elementSelectionCts = undefined;
		}
		this._elementSelectionActiveContext.reset();
	}

	// -- Sharing -------------------------------------------------------

	private _toggleShareWithAgent(): void {
		const model = this.editor.model;
		if (!model) {
			return;
		}
		model.setSharedWithAgent(!model.sharedWithAgent);
	}

	private _updateSharingState(isInitialState: boolean): void {
		const model = this.editor.model;
		const sharingEnabled = this.contextKeyService.contextMatchesRules(canShareBrowserWithAgentContext);
		const isShared = sharingEnabled && !!model && model.sharedWithAgent;

		this.editor.browserContainer.classList.toggle('animate', !isInitialState);
		this.editor.browserContainer.classList.toggle('shared', isShared);

		this._shareButton.checked = isShared;
		this._shareButton.label = isShared
			? localize('browser.sharingWithAgent', "Sharing with Agent") + ' $(agent)'
			: '$(agent)';
		this._shareButton.setTitle(isShared
			? localize('browser.unshareWithAgent', "Stop Sharing with Agent")
			: localize('browser.shareWithAgent', "Share with Agent"));
	}

	// -- Element Selection ----------------------------------------------

	/**
	 * Start element selection in the browser view, wait for a user selection, and add it to chat.
	 */
	async addElementToChat(): Promise<void> {
		// If selection is already active, cancel it
		if (this._elementSelectionCts) {
			this._elementSelectionCts.dispose(true);
			this._elementSelectionCts = undefined;
			this._elementSelectionActiveContext.set(false);
			return;
		}

		// Start new selection
		const cts = new CancellationTokenSource();
		this._elementSelectionCts = cts;
		this._elementSelectionActiveContext.set(true);

		type IntegratedBrowserAddElementToChatStartEvent = {};

		type IntegratedBrowserAddElementToChatStartClassification = {
			owner: 'jruales';
			comment: 'The user initiated an Add Element to Chat action in Integrated Browser.';
		};

		this.telemetryService.publicLog2<IntegratedBrowserAddElementToChatStartEvent, IntegratedBrowserAddElementToChatStartClassification>('integratedBrowser.addElementToChat.start', {});

		try {
			const model = this.editor.model;
			if (!model) {
				throw new Error('No browser view model found');
			}

			// Make the browser the focused view
			this.editor.ensureBrowserFocus();

			// Get element data from user selection
			const elementData = await model.getElementData(cts.token);
			if (!elementData) {
				throw new Error('Element data not found');
			}

			const { attachCss, attachImages } = await this._attachElementDataToChat(elementData);

			type IntegratedBrowserAddElementToChatAddedEvent = {
				attachCss: boolean;
				attachImages: boolean;
			};

			type IntegratedBrowserAddElementToChatAddedClassification = {
				attachCss: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; isMeasurement: true; comment: 'Whether chat.sendElementsToChat.attachCSS was enabled.' };
				attachImages: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; isMeasurement: true; comment: 'Whether chat.sendElementsToChat.attachImages was enabled.' };
				owner: 'jruales';
				comment: 'An element was successfully added to chat from Integrated Browser.';
			};

			this.telemetryService.publicLog2<IntegratedBrowserAddElementToChatAddedEvent, IntegratedBrowserAddElementToChatAddedClassification>('integratedBrowser.addElementToChat.added', {
				attachCss,
				attachImages
			});

		} catch (error) {
			if (!cts.token.isCancellationRequested) {
				this.logService.error('BrowserEditor.addElementToChat: Failed to select element', error);
			}
		} finally {
			cts.dispose(true);
			if (this._elementSelectionCts === cts) {
				this._elementSelectionCts = undefined;
				this._elementSelectionActiveContext.set(false);
			}
		}
	}

	/**
	 * Accept the currently focused element during element selection and attach it to chat.
	 */
	async addFocusedElementToChat(): Promise<void> {
		if (!this._elementSelectionCts) {
			return;
		}

		const cts = this._elementSelectionCts;
		const model = this.editor.model;
		if (!model) {
			return;
		}

		const elementData = await model.getFocusedElementData();
		if (!elementData) {
			return;
		}

		await this._attachElementDataToChat(elementData);
		cts.dispose(true);
		if (this._elementSelectionCts === cts) {
			this._elementSelectionCts = undefined;
			this._elementSelectionActiveContext.set(false);
		}
	}

	private async _attachElementDataToChat(elementData: IElementData): Promise<{ attachCss: boolean; attachImages: boolean }> {
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

		const attachCss = this.configurationService.getValue<boolean>('chat.sendElementsToChat.attachCSS');
		const value = createElementContextValue(elementData, displayNameFull, attachCss);

		toAttach.push({
			id: 'element-' + Date.now(),
			name: displayNameShort,
			fullName: displayNameFull,
			value: value,
			modelDescription: attachCss
				? 'Structured browser element context with HTML path, attributes, and computed styles.'
				: 'Structured browser element context with HTML path and attributes.',
			kind: 'element',
			icon: ThemeIcon.fromId(Codicon.layout.id),
			ancestors: elementData.ancestors,
			attributes: elementData.attributes,
			computedStyles: attachCss ? elementData.computedStyles : undefined,
			dimensions: elementData.dimensions,
			innerText,
		});

		const attachImages = this.configurationService.getValue<boolean>('chat.sendElementsToChat.attachImages');
		const model = this.editor.model;
		if (attachImages && model) {
			const screenshotBuffer = await model.captureScreenshot({
				quality: 90,
				pageRect: bounds
			});

			toAttach.push({
				id: 'element-screenshot-' + Date.now(),
				name: 'Element Screenshot',
				fullName: 'Element Screenshot',
				kind: 'image',
				value: screenshotBuffer.buffer
			});
		}

		const widget = await this.chatWidgetService.revealWidget() ?? this.chatWidgetService.lastFocusedWidget;
		widget?.attachmentModel?.addContext(...toAttach);

		return { attachCss, attachImages };
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

			const widget = await this.chatWidgetService.revealWidget() ?? this.chatWidgetService.lastFocusedWidget;
			widget?.attachmentModel?.addContext(...toAttach);
		} catch (error) {
			this.logService.error('BrowserEditor.addConsoleLogsToChat: Failed to get console logs', error);
		}
	}
}

// Register the contribution
BrowserEditor.registerContribution(BrowserEditorChatIntegration);

// -- Actions ------------------------------------------------------------

class AddElementToChatAction extends Action2 {
	static readonly ID = BrowserViewCommandId.AddElementToChat;

	constructor() {
		const enabled = ContextKeyExpr.and(ChatContextKeys.enabled, ContextKeyExpr.equals('config.chat.sendElementsToChat.enabled', true));
		super({
			id: AddElementToChatAction.ID,
			title: localize2('browser.addElementToChatAction', 'Add Element to Chat'),
			category: BrowserCategory,
			icon: Codicon.inspect,
			f1: true,
			precondition: ContextKeyExpr.and(BROWSER_EDITOR_ACTIVE, CONTEXT_BROWSER_HAS_URL, CONTEXT_BROWSER_HAS_ERROR.negate(), enabled),
			toggled: CONTEXT_BROWSER_ELEMENT_SELECTION_ACTIVE,
			menu: {
				id: MenuId.BrowserActionsToolbar,
				group: 'actions',
				order: 1,
				when: enabled
			},
			keybinding: [{
				weight: KeybindingWeight.WorkbenchContrib + 50, // Priority over terminal
				primary: KeyMod.CtrlCmd | KeyMod.Shift | KeyCode.KeyC,
			}, {
				when: CONTEXT_BROWSER_ELEMENT_SELECTION_ACTIVE,
				weight: KeybindingWeight.WorkbenchContrib,
				primary: KeyCode.Escape
			}]
		});
	}

	async run(accessor: ServicesAccessor, browserEditor = accessor.get(IEditorService).activeEditorPane): Promise<void> {
		if (browserEditor instanceof BrowserEditor) {
			await browserEditor.getContribution(BrowserEditorChatIntegration)?.addElementToChat();
		}
	}
}

class AddConsoleLogsToChatAction extends Action2 {
	static readonly ID = BrowserViewCommandId.AddConsoleLogsToChat;

	constructor() {
		const enabled = ContextKeyExpr.and(ChatContextKeys.enabled, ContextKeyExpr.equals('config.chat.sendElementsToChat.enabled', true));
		super({
			id: AddConsoleLogsToChatAction.ID,
			title: localize2('browser.addConsoleLogsToChatAction', 'Add Console Logs to Chat'),
			category: BrowserActionCategory,
			icon: Codicon.output,
			f1: true,
			precondition: ContextKeyExpr.and(BROWSER_EDITOR_ACTIVE, CONTEXT_BROWSER_HAS_URL, CONTEXT_BROWSER_HAS_ERROR.negate(), enabled),
			menu: {
				id: MenuId.BrowserActionsToolbar,
				group: 'actions',
				order: 2,
				when: enabled
			}
		});
	}

	async run(accessor: ServicesAccessor, browserEditor = accessor.get(IEditorService).activeEditorPane): Promise<void> {
		if (browserEditor instanceof BrowserEditor) {
			await browserEditor.getContribution(BrowserEditorChatIntegration)?.addConsoleLogsToChat();
		}
	}
}

class AddFocusedElementToChatAction extends Action2 {
	constructor() {
		super({
			id: 'workbench.action.browser.addFocusedElementToChat',
			title: localize2('browser.addFocusedElementToChat', 'Add Focused Element to Chat'),
			category: BrowserActionCategory,
			f1: false,
			precondition: CONTEXT_BROWSER_FOCUSED,
			keybinding: {
				weight: KeybindingWeight.WorkbenchContrib + 50,
				primary: KeyMod.CtrlCmd | KeyCode.Enter,
				when: CONTEXT_BROWSER_ELEMENT_SELECTION_ACTIVE
			}
		});
	}

	async run(accessor: ServicesAccessor): Promise<void> {
		const browserEditor = accessor.get(IEditorService).activeEditorPane;
		if (browserEditor instanceof BrowserEditor) {
			await browserEditor.getContribution(BrowserEditorChatIntegration)?.addFocusedElementToChat();
		}
	}
}

registerAction2(AddElementToChatAction);
registerAction2(AddConsoleLogsToChatAction);
registerAction2(AddFocusedElementToChatAction);

Registry.as<IConfigurationRegistry>(ConfigurationExtensions.Configuration).registerConfiguration({
	...workbenchConfigurationNodeBase,
	properties: {
		'workbench.browser.enableChatTools': {
			type: 'boolean',
			default: false,
			experiment: { mode: 'startup' },
			tags: ['experimental'],
			markdownDescription: localize(
				{ comment: ['This is the description for a setting.'], key: 'browser.enableChatTools' },
				'When enabled, chat agents can use browser tools to open and interact with pages in the Integrated Browser.'
			),
			policy: {
				name: 'BrowserChatTools',
				category: PolicyCategory.InteractiveSession,
				minimumVersion: '1.110',
				value: (policyData) => policyData.chat_preview_features_enabled === false ? false : undefined,
				localization: {
					description: {
						key: 'browser.enableChatTools',
						value: localize('browser.enableChatTools', 'When enabled, chat agents can use browser tools to open and interact with pages in the Integrated Browser.')
					}
				},
			}
		}
	}
});
