/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import './media/chatStatus.css';
import { safeIntl } from '../../../../base/common/date.js';
import { Disposable, DisposableStore, MutableDisposable } from '../../../../base/common/lifecycle.js';
import { language } from '../../../../base/common/platform.js';
import { localize } from '../../../../nls.js';
import { IWorkbenchContribution } from '../../../common/contributions.js';
import { IStatusbarEntry, IStatusbarEntryAccessor, IStatusbarService, ShowTooltipCommand, StatusbarAlignment, StatusbarEntryKind } from '../../../services/statusbar/browser/statusbar.js';
import { $, addDisposableListener, append, clearNode, EventHelper, EventType } from '../../../../base/browser/dom.js';
import { ChatEntitlement, ChatEntitlementService, ChatSentiment, IChatEntitlementService } from '../common/chatEntitlementService.js';
import { CancellationToken } from '../../../../base/common/cancellation.js';
import { defaultButtonStyles, defaultCheckboxStyles } from '../../../../platform/theme/browser/defaultStyles.js';
import { Checkbox } from '../../../../base/browser/ui/toggle/toggle.js';
import { IConfigurationService } from '../../../../platform/configuration/common/configuration.js';
import { ICommandService } from '../../../../platform/commands/common/commands.js';
import { Lazy } from '../../../../base/common/lazy.js';
import { contrastBorder, inputValidationErrorBorder, inputValidationInfoBorder, inputValidationWarningBorder, registerColor, transparent } from '../../../../platform/theme/common/colorRegistry.js';
import { IHoverService } from '../../../../platform/hover/browser/hover.js';
import { Color } from '../../../../base/common/color.js';
import { Gesture, EventType as TouchEventType } from '../../../../base/browser/touch.js';
import { IEditorService } from '../../../services/editor/common/editorService.js';
import product from '../../../../platform/product/common/product.js';
import { isObject } from '../../../../base/common/types.js';
import { ILanguageService } from '../../../../editor/common/languages/language.js';
import { IInstantiationService } from '../../../../platform/instantiation/common/instantiation.js';
import { Button } from '../../../../base/browser/ui/button/button.js';
import { renderLabelWithIcons } from '../../../../base/browser/ui/iconLabel/iconLabels.js';
import { WorkbenchActionExecutedEvent, WorkbenchActionExecutedClassification } from '../../../../base/common/actions.js';
import { parseLinkedText } from '../../../../base/common/linkedText.js';
import { Link } from '../../../../platform/opener/browser/link.js';
import { IOpenerService } from '../../../../platform/opener/common/opener.js';
import { ITelemetryService } from '../../../../platform/telemetry/common/telemetry.js';
import { IChatStatusItemService, ChatStatusEntry } from './chatStatusItemService.js';
import { ITextResourceConfigurationService } from '../../../../editor/common/services/textResourceConfiguration.js';
import { EditorResourceAccessor, SideBySideEditor } from '../../../common/editor.js';
import { getCodeEditor } from '../../../../editor/browser/editorBrowser.js';

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

const defaultChat = {
	extensionId: product.defaultChatAgent?.extensionId ?? '',
	completionsEnablementSetting: product.defaultChatAgent?.completionsEnablementSetting ?? '',
	nextEditSuggestionsSetting: product.defaultChatAgent?.nextEditSuggestionsSetting ?? ''
};

export class ChatStatusBarEntry extends Disposable implements IWorkbenchContribution {

	static readonly ID = 'workbench.contrib.chatStatusBarEntry';

	private entry: IStatusbarEntryAccessor | undefined = undefined;

	private dashboard = new Lazy<ChatStatusDashboard>(() => this.instantiationService.createInstance(ChatStatusDashboard));

	private readonly activeCodeEditorListener = this._register(new MutableDisposable());

	constructor(
		@IChatEntitlementService private readonly chatEntitlementService: ChatEntitlementService,
		@IInstantiationService private readonly instantiationService: IInstantiationService,
		@IStatusbarService private readonly statusbarService: IStatusbarService,
		@IEditorService private readonly editorService: IEditorService,
		@IConfigurationService private readonly configurationService: IConfigurationService,
	) {
		super();

		this.create();
		this.registerListeners();
	}

	private async create(): Promise<void> {
		const hidden = this.chatEntitlementService.sentiment === ChatSentiment.Disabled;

		if (!hidden) {
			this.entry ||= this.statusbarService.addEntry(this.getEntryProps(), 'chat.statusBarEntry', StatusbarAlignment.RIGHT, { location: { id: 'status.editor.mode', priority: 100.1 }, alignment: StatusbarAlignment.RIGHT });

			// TODO@bpasero: remove this eventually
			const completionsStatusId = `${defaultChat.extensionId}.status`;
			this.statusbarService.updateEntryVisibility(completionsStatusId, false);
			this.statusbarService.overrideEntry(completionsStatusId, { name: localize('codeCompletionsStatus', "Copilot Code Completions"), text: localize('codeCompletionsStatusText', "$(copilot) Completions") });
		} else {
			this.entry?.dispose();
			this.entry = undefined;
		}
	}

	private registerListeners(): void {
		this._register(this.chatEntitlementService.onDidChangeQuotaExceeded(() => this.entry?.update(this.getEntryProps())));
		this._register(this.chatEntitlementService.onDidChangeSentiment(() => this.entry?.update(this.getEntryProps())));
		this._register(this.chatEntitlementService.onDidChangeEntitlement(() => this.entry?.update(this.getEntryProps())));

		this._register(this.editorService.onDidActiveEditorChange(() => this.onDidActiveEditorChange()));

		this._register(this.configurationService.onDidChangeConfiguration(e => {
			if (e.affectsConfiguration(defaultChat.completionsEnablementSetting)) {
				this.entry?.update(this.getEntryProps());
			}
		}));
	}

	private onDidActiveEditorChange(): void {
		this.entry?.update(this.getEntryProps());

		this.activeCodeEditorListener.clear();

		// Listen to language changes in the active code editor
		const activeCodeEditor = getCodeEditor(this.editorService.activeTextEditorControl);
		if (activeCodeEditor) {
			this.activeCodeEditorListener.value = activeCodeEditor.onDidChangeModelLanguage(() => {
				this.entry?.update(this.getEntryProps());
			});
		}
	}

	private getEntryProps(): IStatusbarEntry {
		let text = '$(copilot)';
		let ariaLabel = localize('chatStatus', "Copilot Status");
		let kind: StatusbarEntryKind | undefined;

		if (!isNewUser(this.chatEntitlementService)) {
			const { chatQuotaExceeded, completionsQuotaExceeded } = this.chatEntitlementService.quotas;

			// Signed out
			if (this.chatEntitlementService.entitlement === ChatEntitlement.Unknown) {
				const signedOutWarning = localize('notSignedIntoCopilot', "Signed out");

				text = `$(copilot-not-connected) ${signedOutWarning}`;
				ariaLabel = signedOutWarning;
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
				kind = 'prominent';
			}

			// Completions Disabled
			else if (this.editorService.activeTextEditorLanguageId && !isCompletionsEnabled(this.configurationService, this.editorService.activeTextEditorLanguageId)) {
				text = `$(copilot-not-connected)`;
				ariaLabel = localize('completionsDisabledStatus', "Code Completions Disabled");
			}
		}

		return {
			name: localize('chatStatus', "Copilot Status"),
			text,
			ariaLabel,
			command: ShowTooltipCommand,
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

function isNewUser(chatEntitlementService: IChatEntitlementService): boolean {
	return chatEntitlementService.sentiment !== ChatSentiment.Installed ||	// copilot not installed
		chatEntitlementService.entitlement === ChatEntitlement.Available;	// not yet signed up to copilot
}

function canUseCopilot(chatEntitlementService: IChatEntitlementService): boolean {
	const newUser = isNewUser(chatEntitlementService);
	const signedOut = chatEntitlementService.entitlement === ChatEntitlement.Unknown;
	const allQuotaReached = chatEntitlementService.quotas.chatQuotaExceeded && chatEntitlementService.quotas.completionsQuotaExceeded;

	return !newUser && !signedOut && !allQuotaReached;
}

function isCompletionsEnabled(configurationService: IConfigurationService, modeId: string = '*'): boolean {
	const result = configurationService.getValue<Record<string, boolean>>(defaultChat.completionsEnablementSetting);
	if (!isObject(result)) {
		return false;
	}

	if (typeof result[modeId] !== 'undefined') {
		return Boolean(result[modeId]); // go with setting if explicitly defined
	}

	return Boolean(result['*']); // fallback to global setting otherwise
}

interface ISettingsAccessor {
	readSetting: () => boolean;
	writeSetting: (value: boolean) => Promise<void>;
}

class ChatStatusDashboard extends Disposable {

	private readonly element = $('div.chat-status-bar-entry-tooltip');

	private dateFormatter = new Lazy(() => safeIntl.DateTimeFormat(language, { year: 'numeric', month: 'long', day: 'numeric' }));
	private readonly entryDisposables = this._register(new MutableDisposable());

	constructor(
		@IChatEntitlementService private readonly chatEntitlementService: ChatEntitlementService,
		@IChatStatusItemService private readonly chatStatusItemService: IChatStatusItemService,
		@ICommandService private readonly commandService: ICommandService,
		@IConfigurationService private readonly configurationService: IConfigurationService,
		@IEditorService private readonly editorService: IEditorService,
		@IHoverService private readonly hoverService: IHoverService,
		@ILanguageService private readonly languageService: ILanguageService,
		@IOpenerService private readonly openerService: IOpenerService,
		@ITelemetryService private readonly telemetryService: ITelemetryService,
		@ITextResourceConfigurationService private readonly textResourceConfigurationService: ITextResourceConfigurationService,
	) {
		super();
	}

	show(token: CancellationToken): HTMLElement {
		clearNode(this.element);

		const disposables = this.entryDisposables.value = new DisposableStore();
		disposables.add(token.onCancellationRequested(() => disposables.dispose()));

		let needsSeparator = false;
		const addSeparator = (label: string | undefined) => {
			if (needsSeparator) {
				this.element.appendChild($('hr'));
				needsSeparator = false;
			}

			if (label) {
				this.element.appendChild($('div.header', undefined, label));
			}

			needsSeparator = true;
		};

		// Quota Indicator
		if (this.chatEntitlementService.entitlement === ChatEntitlement.Limited) {
			const { chatTotal, chatRemaining, completionsTotal, completionsRemaining, quotaResetDate, chatQuotaExceeded, completionsQuotaExceeded } = this.chatEntitlementService.quotas;

			addSeparator(localize('usageTitle', "Copilot Free Plan Usage"));

			const chatQuotaIndicator = this.createQuotaIndicator(this.element, chatTotal, chatRemaining, localize('chatsLabel', "Chat messages"));
			const completionsQuotaIndicator = this.createQuotaIndicator(this.element, completionsTotal, completionsRemaining, localize('completionsLabel', "Code completions"));

			this.element.appendChild($('div.description', undefined, localize('limitQuota', "Limits will reset on {0}.", this.dateFormatter.value.format(quotaResetDate))));

			if (chatQuotaExceeded || completionsQuotaExceeded) {
				const upgradePlanButton = disposables.add(new Button(this.element, { ...defaultButtonStyles, secondary: canUseCopilot(this.chatEntitlementService) /* use secondary color when copilot can still be used */ }));
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
		}

		// Contributions
		{
			for (const item of this.chatStatusItemService.getEntries()) {
				addSeparator(undefined);
				const chatItemDisposables = disposables.add(new MutableDisposable());

				let rendered = this.renderContributedChatStatusItem(item);
				chatItemDisposables.value = rendered.disposables;
				this.element.appendChild(rendered.element);

				disposables.add(this.chatStatusItemService.onDidChange(e => {
					if (e.entry.id === item.id) {
						const oldEl = rendered.element;

						rendered = this.renderContributedChatStatusItem(e.entry);
						chatItemDisposables.value = rendered.disposables;

						oldEl.replaceWith(rendered.element);
					}
				}));
			}
		}

		// Settings
		{
			addSeparator(localize('settingsTitle', "Settings"));

			this.createSettings(this.element, disposables);
		}

		// New to Copilot / Signed out
		{
			const newUser = isNewUser(this.chatEntitlementService);
			const signedOut = this.chatEntitlementService.entitlement === ChatEntitlement.Unknown;
			if (newUser || signedOut) {
				addSeparator(undefined);

				this.element.appendChild($('div.description', undefined, newUser ? localize('activateDescription', "Set up Copilot to use AI features.") : localize('signInDescription', "Sign in to use Copilot AI features.")));

				const button = disposables.add(new Button(this.element, { ...defaultButtonStyles }));
				button.label = newUser ? localize('activateCopilotButton', "Set up Copilot") : localize('signInToUseCopilotButton', "Sign in to use Copilot");
				disposables.add(button.onDidClick(() => this.runCommandAndClose(newUser ? 'workbench.action.chat.triggerSetup' : () => this.chatEntitlementService.requests?.value.signIn())));
			}
		}

		return this.element;
	}

	private renderContributedChatStatusItem(item: ChatStatusEntry): { element: HTMLElement; disposables: DisposableStore } {
		const disposables = new DisposableStore();

		const entryEl = $('div.contribution');

		entryEl.appendChild($('div.header', undefined, item.label));

		const bodyEl = entryEl.appendChild($('div.body'));

		const descriptionEl = bodyEl.appendChild($('span.description'));
		this.renderTextPlus(descriptionEl, item.description, disposables);

		if (item.detail) {
			const itemElement = bodyEl.appendChild($('div.detail-item'));
			this.renderTextPlus(itemElement, item.detail, disposables);
		}

		return { element: entryEl, disposables };
	}

	private renderTextPlus(target: HTMLElement, text: string, store: DisposableStore): void {
		for (const node of parseLinkedText(text).nodes) {
			if (typeof node === 'string') {
				const parts = renderLabelWithIcons(node);
				target.append(...parts);
			} else {
				store.add(new Link(target, node, undefined, this.hoverService, this.openerService));
			}
		}
	}

	private runCommandAndClose(commandOrFn: string | Function): void {
		if (typeof commandOrFn === 'function') {
			commandOrFn();
		} else {
			this.telemetryService.publicLog2<WorkbenchActionExecutedEvent, WorkbenchActionExecutedClassification>('workbenchActionExecuted', { id: commandOrFn, from: 'chat-status' });
			this.commandService.executeCommand(commandOrFn);
		}

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
		const modeId = this.editorService.activeTextEditorLanguageId;
		const settings = container.appendChild($('div.settings'));

		// --- Code Completions
		{
			const globalSetting = append(settings, $('div.setting'));
			this.createCodeCompletionsSetting(globalSetting, localize('settings.codeCompletions', "Code Completions (all files)"), '*', disposables);

			if (modeId) {
				const languageSetting = append(settings, $('div.setting'));
				this.createCodeCompletionsSetting(languageSetting, localize('settings.codeCompletionsLanguage', "Code Completions ({0})", this.languageService.getLanguageName(modeId) ?? modeId), modeId, disposables);
			}
		}

		// --- Next Edit Suggestions
		{
			const setting = append(settings, $('div.setting'));
			this.createNextEditSuggestionsSetting(setting, localize('settings.nextEditSuggestions', "Next Edit Suggestions"), modeId, this.getCompletionsSettingAccessor(modeId), disposables);
		}

		return settings;
	}

	private createSetting(container: HTMLElement, settingId: string, label: string, accessor: ISettingsAccessor, disposables: DisposableStore): Checkbox {
		const checkbox = disposables.add(new Checkbox(label, Boolean(accessor.readSetting()), defaultCheckboxStyles));
		container.appendChild(checkbox.domNode);

		const settingLabel = append(container, $('span.setting-label', undefined, label));
		disposables.add(Gesture.addTarget(settingLabel));
		[EventType.CLICK, TouchEventType.Tap].forEach(eventType => {
			disposables.add(addDisposableListener(settingLabel, eventType, e => {
				if (checkbox?.enabled) {
					EventHelper.stop(e, true);

					checkbox.checked = !checkbox.checked;
					accessor.writeSetting(checkbox.checked);
					checkbox.focus();
				}
			}));
		});

		disposables.add(checkbox.onChange(() => {
			accessor.writeSetting(checkbox.checked);
		}));

		disposables.add(this.configurationService.onDidChangeConfiguration(e => {
			if (e.affectsConfiguration(settingId)) {
				checkbox.checked = Boolean(accessor.readSetting());
			}
		}));

		if (!canUseCopilot(this.chatEntitlementService)) {
			container.classList.add('disabled');
			checkbox.disable();
		}

		return checkbox;
	}

	private createCodeCompletionsSetting(container: HTMLElement, label: string, modeId: string | undefined, disposables: DisposableStore): void {
		this.createSetting(container, defaultChat.completionsEnablementSetting, label, this.getCompletionsSettingAccessor(modeId), disposables);
	}

	private getCompletionsSettingAccessor(modeId = '*'): ISettingsAccessor {
		const settingId = defaultChat.completionsEnablementSetting;

		return {
			readSetting: () => isCompletionsEnabled(this.configurationService, modeId),
			writeSetting: (value: boolean) => {
				let result = this.configurationService.getValue<Record<string, boolean>>(settingId);
				if (!isObject(result)) {
					result = Object.create(null);
				}

				return this.configurationService.updateValue(settingId, { ...result, [modeId]: value });
			}
		};
	}

	private createNextEditSuggestionsSetting(container: HTMLElement, label: string, modeId: string | undefined, completionsSettingAccessor: ISettingsAccessor, disposables: DisposableStore): void {
		const nesSettingId = defaultChat.nextEditSuggestionsSetting;
		const completionsSettingId = defaultChat.completionsEnablementSetting;
		const resource = EditorResourceAccessor.getOriginalUri(this.editorService.activeEditor, { supportSideBySide: SideBySideEditor.PRIMARY });

		const checkbox = this.createSetting(container, nesSettingId, label, {
			readSetting: () => this.textResourceConfigurationService.getValue<boolean>(resource, nesSettingId),
			writeSetting: (value: boolean) => this.textResourceConfigurationService.updateValue(resource, nesSettingId, value)
		}, disposables);

		// enablement of NES depends on completions setting
		// so we have to update our checkbox state accordingly

		if (!completionsSettingAccessor.readSetting()) {
			container.classList.add('disabled');
			checkbox.disable();
		}

		disposables.add(this.configurationService.onDidChangeConfiguration(e => {
			if (e.affectsConfiguration(completionsSettingId)) {
				if (completionsSettingAccessor.readSetting() && canUseCopilot(this.chatEntitlementService)) {
					checkbox.enable();
					container.classList.remove('disabled');
				} else {
					checkbox.disable();
					container.classList.add('disabled');
				}
			}
		}));
	}
}
