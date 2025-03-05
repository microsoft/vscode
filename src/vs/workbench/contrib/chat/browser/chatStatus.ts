/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import './media/chatStatus.css';
import { safeIntl } from '../../../../base/common/date.js';
import { Disposable, DisposableStore, MutableDisposable } from '../../../../base/common/lifecycle.js';
import { language } from '../../../../base/common/platform.js';
import { localize } from '../../../../nls.js';
import { ContextKeyExpr, IContextKeyService } from '../../../../platform/contextkey/common/contextkey.js';
import { IKeybindingService } from '../../../../platform/keybinding/common/keybinding.js';
import { IWorkbenchContribution } from '../../../common/contributions.js';
import { IStatusbarEntry, IStatusbarEntryAccessor, IStatusbarService, ShowTooltipCommand, StatusbarAlignment, StatusbarEntryKind } from '../../../services/statusbar/browser/statusbar.js';
import { ChatContextKeys } from '../common/chatContextKeys.js';
import { OPEN_CHAT_QUOTA_EXCEEDED_DIALOG, CHAT_SETUP_ACTION_LABEL, CHAT_OPEN_ACTION_ID } from './actions/chatActions.js';
import { $, addDisposableListener, append, clearNode, EventHelper, EventLike, EventType } from '../../../../base/browser/dom.js';
import { ChatEntitlement, ChatEntitlementService, IChatEntitlementService } from '../common/chatEntitlementService.js';
import { CancellationToken } from '../../../../base/common/cancellation.js';
import { defaultButtonStyles, defaultCheckboxStyles } from '../../../../platform/theme/browser/defaultStyles.js';
import { Checkbox } from '../../../../base/browser/ui/toggle/toggle.js';
import { IConfigurationService } from '../../../../platform/configuration/common/configuration.js';
import { Command } from '../../../../editor/common/languages.js';
import { CommandsRegistry, ICommandService } from '../../../../platform/commands/common/commands.js';
import { Lazy } from '../../../../base/common/lazy.js';
import { contrastBorder, inputValidationErrorBorder, inputValidationInfoBorder, inputValidationWarningBorder, registerColor, transparent } from '../../../../platform/theme/common/colorRegistry.js';
import { IHoverService } from '../../../../platform/hover/browser/hover.js';
import { coalesce } from '../../../../base/common/arrays.js';
import { CTX_INLINE_CHAT_POSSIBLE } from '../../inlineChat/common/inlineChat.js';
import { EditorContextKeys } from '../../../../editor/common/editorContextKeys.js';
import { Color } from '../../../../base/common/color.js';
import { StandardKeyboardEvent } from '../../../../base/browser/keyboardEvent.js';
import { KeyCode } from '../../../../base/common/keyCodes.js';
import { Gesture, EventType as TouchEventType } from '../../../../base/browser/touch.js';
import { IEditorService } from '../../../services/editor/common/editorService.js';
import { IProductService } from '../../../../platform/product/common/productService.js';
import { isObject } from '../../../../base/common/types.js';
import { ILanguageService } from '../../../../editor/common/languages/language.js';
import { IInstantiationService } from '../../../../platform/instantiation/common/instantiation.js';
import { Button } from '../../../../base/browser/ui/button/button.js';
import { renderIcon } from '../../../../base/browser/ui/iconLabel/iconLabels.js';
import { Codicon } from '../../../../base/common/codicons.js';

//#region --- colors

const gaugeBackground = registerColor('gauge.background', {
	dark: inputValidationInfoBorder,
	light: inputValidationInfoBorder,
	hcDark: contrastBorder,
	hcLight: contrastBorder
}, localize('gaugeBackground', "Gauge background color."));

registerColor('gauge.foreground', {
	dark: transparent(gaugeBackground, 0.3),
	light: transparent(gaugeBackground, 0.3),
	hcDark: Color.white,
	hcLight: Color.white
}, localize('gaugeForeground', "Gauge foreground color."));

registerColor('gauge.border', {
	dark: null,
	light: null,
	hcDark: contrastBorder,
	hcLight: contrastBorder
}, localize('gaugeBorder', "Gauge border color."));

const gaugeWarningBackground = registerColor('gauge.warningBackground', {
	dark: inputValidationWarningBorder,
	light: inputValidationWarningBorder,
	hcDark: contrastBorder,
	hcLight: contrastBorder
}, localize('gaugeWarningBackground', "Gauge warning background color."));

registerColor('gauge.warningForeground', {
	dark: transparent(gaugeWarningBackground, 0.3),
	light: transparent(gaugeWarningBackground, 0.3),
	hcDark: Color.white,
	hcLight: Color.white
}, localize('gaugeWarningForeground', "Gauge warning foreground color."));

const gaugeErrorBackground = registerColor('gauge.errorBackground', {
	dark: inputValidationErrorBorder,
	light: inputValidationErrorBorder,
	hcDark: contrastBorder,
	hcLight: contrastBorder
}, localize('gaugeErrorBackground', "Gauge error background color."));

registerColor('gauge.errorForeground', {
	dark: transparent(gaugeErrorBackground, 0.3),
	light: transparent(gaugeErrorBackground, 0.3),
	hcDark: Color.white,
	hcLight: Color.white
}, localize('gaugeErrorForeground', "Gauge error foreground color."));

//#endregion

export class ChatStatusBarEntry extends Disposable implements IWorkbenchContribution {

	static readonly ID = 'chat.statusBarEntry';

	private static readonly SETTING = 'chat.experimental.statusIndicator.enabled';

	private static readonly SIGN_IN_COMMAND_ID = 'workbench.action.chat.signIn';

	private entry: IStatusbarEntryAccessor | undefined = undefined;

	private dashboard = new Lazy<ChatStatusDashboard>(() => this.instantiationService.createInstance(ChatStatusDashboard));

	constructor(
		@IStatusbarService private readonly statusbarService: IStatusbarService,
		@IChatEntitlementService private readonly chatEntitlementService: ChatEntitlementService,
		@IContextKeyService private readonly contextKeyService: IContextKeyService,
		@IConfigurationService private readonly configurationService: IConfigurationService,
		@IProductService private readonly productService: IProductService,
		@IInstantiationService private readonly instantiationService: IInstantiationService
	) {
		super();

		this.create();
		this.registerListeners();
		this.registerCommands();
	}

	private async create(): Promise<void> {
		if (this.configurationService.getValue<boolean>(ChatStatusBarEntry.SETTING) === true) {
			this.entry ||= this.statusbarService.addEntry(this.getEntryProps(), ChatStatusBarEntry.ID, StatusbarAlignment.RIGHT, { location: { id: 'status.editor.mode', priority: 100.1 }, alignment: StatusbarAlignment.RIGHT });
			this.statusbarService.updateEntryVisibility(`${this.productService.defaultChatAgent?.extensionId}.status`, false); // TODO@bpasero: remove this eventually
		} else {
			this.entry?.dispose();
			this.entry = undefined;
		}
	}

	private registerListeners(): void {
		this._register(this.configurationService.onDidChangeConfiguration(e => {
			if (e.affectsConfiguration(ChatStatusBarEntry.SETTING)) {
				this.create();
			}
		}));

		const contextKeysSet = new Set([ChatContextKeys.Setup.installed.key]);
		this._register(this.contextKeyService.onDidChangeContext(e => {
			if (!this.entry) {
				return;
			}

			if (e.affectsSome(contextKeysSet)) {
				this.entry.update(this.getEntryProps());
			}
		}));

		this._register(this.chatEntitlementService.onDidChangeQuotaExceeded(() => this.entry?.update(this.getEntryProps())));
		this._register(this.chatEntitlementService.onDidChangeEntitlement(() => this.entry?.update(this.getEntryProps())));
	}

	private registerCommands(): void {
		CommandsRegistry.registerCommand(ChatStatusBarEntry.SIGN_IN_COMMAND_ID, () => {
			this.chatEntitlementService.requests?.value.signIn();
		});
	}

	private getEntryProps(): IStatusbarEntry {
		let text = '$(copilot)';
		let ariaLabel = localize('chatStatus', "Copilot Status");
		let command: string | Command = ShowTooltipCommand;
		let kind: StatusbarEntryKind | undefined;

		const { chatQuotaExceeded, completionsQuotaExceeded } = this.chatEntitlementService.quotas;

		// New User
		if (isNewUser(this.contextKeyService, this.chatEntitlementService)) {
			ariaLabel = CHAT_SETUP_ACTION_LABEL.value;
		}

		// Signed out
		else if (this.chatEntitlementService.entitlement === ChatEntitlement.Unknown) {
			const signInWarning = localize('signInToUseCopilot', "Sign in to Use Copilot...");
			text = `$(copilot-warning) ${signInWarning}`;
			ariaLabel = signInWarning;
			command = ChatStatusBarEntry.SIGN_IN_COMMAND_ID;
			kind = 'prominent';
		}

		// Quota Exceeded
		else if (chatQuotaExceeded || completionsQuotaExceeded) {
			let quotaWarning: string;
			if (chatQuotaExceeded && !completionsQuotaExceeded) {
				quotaWarning = localize('chatQuotaExceededStatus', "Chat limit reached");
			} else if (completionsQuotaExceeded && !chatQuotaExceeded) {
				quotaWarning = localize('completionsQuotaExceededStatus', "Completions limit reached");
			} else {
				quotaWarning = localize('chatAndCompletionsQuotaExceededStatus', "Limit reached");
			}

			text = `$(copilot-warning) ${quotaWarning}`;
			ariaLabel = quotaWarning;
			command = OPEN_CHAT_QUOTA_EXCEEDED_DIALOG;
			kind = 'prominent';
		}

		return {
			name: localize('chatStatus', "Copilot Status"),
			text,
			ariaLabel,
			command,
			showInAllWindows: true,
			kind,
			tooltip: { element: token => this.dashboard.value.show(token) }
		};
	}

	override dispose(): void {
		super.dispose();

		this.entry?.dispose();
		this.entry = undefined;
	}
}

function isNewUser(contextKeyService: IContextKeyService, chatEntitlementService: IChatEntitlementService): boolean {
	return contextKeyService.getContextKeyValue<boolean>(ChatContextKeys.Setup.installed.key) === false ||	// copilot not installed
		chatEntitlementService.entitlement === ChatEntitlement.Available;								// not yet signed up to copilot
}

class ChatStatusDashboard extends Disposable {

	private readonly element = $('div.chat-status-bar-entry-tooltip');

	private dateFormatter = new Lazy(() => safeIntl.DateTimeFormat(language, { year: 'numeric', month: 'long', day: 'numeric' }));
	private readonly entryDisposables = this._register(new MutableDisposable());

	constructor(
		@IContextKeyService private readonly contextKeyService: IContextKeyService,
		@IChatEntitlementService private readonly chatEntitlementService: IChatEntitlementService,
		@IConfigurationService private readonly configurationService: IConfigurationService,
		@IHoverService private readonly hoverService: IHoverService,
		@IEditorService private readonly editorService: IEditorService,
		@ILanguageService private readonly languageService: ILanguageService,
		@IKeybindingService private readonly keybindingService: IKeybindingService,
		@ICommandService private readonly commandService: ICommandService,
	) {
		super();
	}

	show(token: CancellationToken): HTMLElement {
		clearNode(this.element);

		const disposables = this.entryDisposables.value = new DisposableStore();
		disposables.add(token.onCancellationRequested(() => disposables.dispose()));

		// New to Copilot
		if (isNewUser(this.contextKeyService, this.chatEntitlementService)) {
			this.element.appendChild($('div.header', undefined, localize('setupCopilotForFreeHeader', "Use AI Features with Copilot for Free")));

			this.element.appendChild(
				$('div', undefined,
					$('div.chat-feature-container', undefined,
						renderIcon(Codicon.code),
						$('span', undefined, localize('featureChat', "Code faster with Completions"))
					),
					$('div.chat-feature-container', undefined,
						renderIcon(Codicon.editSession),
						$('span', undefined, localize('featureEdits', "Build features with Copilot Edits"))
					),
					$('div.chat-feature-container', undefined,
						renderIcon(Codicon.commentDiscussion),
						$('span', undefined, localize('featureExplore', "Explore your codebase with Chat"))
					)
				)
			);

			const setupCopilotButton = disposables.add(new Button(this.element, { ...defaultButtonStyles }));
			setupCopilotButton.label = localize('setupCopilotForFreeButton', "Setup Copilot for Free");
			disposables.add(setupCopilotButton.onDidClick(() => this.runCommandAndClose('workbench.action.chat.triggerSetup')));

			this.element.appendChild($('hr'));
		}

		// Quota Indicator
		else if (this.chatEntitlementService.entitlement === ChatEntitlement.Limited) {
			const { chatTotal, chatRemaining, completionsTotal, completionsRemaining, quotaResetDate, chatQuotaExceeded, completionsQuotaExceeded } = this.chatEntitlementService.quotas;

			this.element.appendChild($('div.header', undefined, localize('usageTitle', "Copilot Free Usage")));

			const chatQuotaIndicator = this.createQuotaIndicator(this.element, chatTotal, chatRemaining, localize('chatsLabel', "Chat messages"));
			const completionsQuotaIndicator = this.createQuotaIndicator(this.element, completionsTotal, completionsRemaining, localize('completionsLabel', "Code completions"));

			this.element.appendChild($('div.description', undefined, localize('limitQuota', "Limits will reset on {0}.", this.dateFormatter.value.format(quotaResetDate))));

			if (chatQuotaExceeded || completionsQuotaExceeded) {
				const upgradePlanButton = disposables.add(new Button(this.element, { ...defaultButtonStyles }));
				upgradePlanButton.label = localize('upgradeToCopilotPro', "Upgrade to Copilot Pro");
				disposables.add(upgradePlanButton.onDidClick(() => this.runCommandAndClose('workbench.action.chat.upgradePlan')));
			}

			(async () => {
				await this.chatEntitlementService.update(token);
				if (token.isCancellationRequested) {
					return;
				}

				const { chatTotal, chatRemaining, completionsTotal, completionsRemaining } = this.chatEntitlementService.quotas;

				chatQuotaIndicator(chatTotal, chatRemaining);
				completionsQuotaIndicator(completionsTotal, completionsRemaining);
			})();

			this.element.appendChild($('hr'));
		}

		// Settings
		if (!isNewUser(this.contextKeyService, this.chatEntitlementService)) {
			this.element.appendChild($('div.header', undefined, localize('settingsTitle', "Settings")));
			this.createSettings(this.element, disposables);
			this.element.appendChild($('hr'));
		}

		// Shortcuts
		{
			this.element.appendChild($('div.header', undefined, localize('keybindingsTitle', "Keybindings")));
			this.createShortcuts(this.element, disposables);
		}

		return this.element;
	}

	private runCommandAndClose(commandId: string): void {
		this.commandService.executeCommand(commandId);
		this.hoverService.hideHover(true);
	}

	private createQuotaIndicator(container: HTMLElement, total: number | undefined, remaining: number | undefined, label: string): (total: number | undefined, remaining: number | undefined) => void {
		const quotaText = $('span');
		const quotaBit = $('div.quota-bit');

		const quotaIndicator = container.appendChild($('div.quota-indicator', undefined,
			$('div.quota-label', undefined,
				$('span', undefined, label),
				quotaText
			),
			$('div.quota-bar', undefined,
				quotaBit
			)
		));

		const update = (total: number | undefined, remaining: number | undefined) => {
			quotaIndicator.classList.remove('error');
			quotaIndicator.classList.remove('warning');

			if (typeof total === 'number' && typeof remaining === 'number') {
				let usedPercentage = Math.round(((total - remaining) / total) * 100);
				if (total !== remaining && usedPercentage === 0) {
					usedPercentage = 1; // indicate minimal usage as 1%
				}

				quotaText.textContent = localize('quotaDisplay', "{0}%", usedPercentage);
				quotaBit.style.width = `${usedPercentage}%`;

				if (usedPercentage >= 90) {
					quotaIndicator.classList.add('error');
				} else if (usedPercentage >= 75) {
					quotaIndicator.classList.add('warning');
				}
			}
		};

		update(total, remaining);

		return update;
	}

	private createSettings(container: HTMLElement, disposables: DisposableStore): HTMLElement {
		const language = this.editorService.activeTextEditorLanguageId;
		const settings = container.appendChild($('div.settings'));

		// --- Code Completions
		{
			const globalSetting = append(settings, $('div.setting'));
			this.createCodeCompletionsSetting(globalSetting, localize('settings.codeCompletions', "Code completions (all files)"), '*', disposables);

			if (language) {
				const languageSetting = append(settings, $('div.setting'));
				this.createCodeCompletionsSetting(languageSetting, localize('settings.codeCompletionsLanguage', "Code completions ({0})", this.languageService.getLanguageName(language) ?? language), language, disposables);
			}
		}

		return settings;
	}

	private createCodeCompletionsSetting(container: HTMLElement, label: string, language: string | '*', disposables: DisposableStore): void {
		const settingId = 'github.copilot.enable';

		const readSetting = () => {
			const result = this.configurationService.getValue<Record<string, boolean>>(settingId);
			if (!isObject(result)) {
				return false;
			}

			if (typeof result[language] !== 'undefined') {
				return Boolean(result[language]); // go with setting if explicitly defined
			}

			return Boolean(result['*']); // fallback to global setting otherwise
		};
		const writeSetting = (checkbox: Checkbox) => {
			let result = this.configurationService.getValue<Record<string, boolean>>(settingId);
			if (!isObject(result)) {
				result = Object.create(null);
			}

			return this.configurationService.updateValue(settingId, { ...result, [language]: checkbox.checked });
		};

		const settingCheckbox = disposables.add(new Checkbox(label, readSetting(), defaultCheckboxStyles));
		container.appendChild(settingCheckbox.domNode);

		const settingLabel = append(container, $('span.setting-label', undefined, label));
		disposables.add(Gesture.addTarget(settingLabel));
		[EventType.CLICK, TouchEventType.Tap].forEach(eventType => {
			disposables.add(addDisposableListener(settingLabel, eventType, e => {
				if (settingCheckbox?.enabled) {
					EventHelper.stop(e, true);

					settingCheckbox.checked = !settingCheckbox.checked;
					writeSetting(settingCheckbox);
					settingCheckbox.focus();
				}
			}));
		});

		disposables.add(settingCheckbox.onChange(() => {
			writeSetting(settingCheckbox);
		}));

		disposables.add(this.configurationService.onDidChangeConfiguration(e => {
			if (e.affectsConfiguration(settingId)) {
				settingCheckbox.checked = readSetting();
			}
		}));
	}

	private createShortcuts(container: HTMLElement, disposables: DisposableStore): HTMLElement {
		const shortcuts = container.appendChild($('div.shortcuts'));

		const entries = coalesce([
			{ text: localize('shortcuts.chat', "Chat"), id: CHAT_OPEN_ACTION_ID },
			{ text: localize('shortcuts.copilotEdits', "Copilot Edits"), id: 'workbench.action.chat.openEditSession' },
			this.contextKeyService.contextMatchesRules(ContextKeyExpr.and(
				CTX_INLINE_CHAT_POSSIBLE,
				EditorContextKeys.writable,
				EditorContextKeys.editorSimpleInput.negate()
			)) ? { text: localize('shortcuts.inlineChat', "Inline Chat"), id: 'inlineChat.start' } : undefined,
			!isNewUser(this.contextKeyService, this.chatEntitlementService) ? { text: localize('shortcuts.quickChat', "Quick Chat"), id: 'workbench.action.quickchat.toggle' } : undefined,
		]);

		const onTrigger = (commandId: string, e: EventLike) => {
			EventHelper.stop(e, true);

			this.runCommandAndClose(commandId);
		};

		for (const entry of entries) {
			const shortcut = append(shortcuts, $('div.shortcut', { tabIndex: 0, role: 'button', 'aria-label': entry.text },
				$('span.shortcut-label', undefined, entry.text),
				$('span.shortcut-value', undefined, this.keybindingService.lookupKeybinding(entry.id)?.getLabel() ?? '')
			));

			disposables.add(Gesture.addTarget(shortcut));
			[EventType.CLICK, TouchEventType.Tap].forEach(eventType => {
				disposables.add(addDisposableListener(shortcut, eventType, e => onTrigger(entry.id, e)));
			});

			disposables.add(addDisposableListener(shortcut, EventType.KEY_DOWN, e => {
				const event = new StandardKeyboardEvent(e);
				if ((event.equals(KeyCode.Enter) || event.equals(KeyCode.Space))) {
					onTrigger(entry.id, e);
				}
			}));
		}

		return shortcuts;
	}
}
