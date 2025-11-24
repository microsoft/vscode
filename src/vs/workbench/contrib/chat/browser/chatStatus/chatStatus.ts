/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import './media/chatStatus.css';
import { Disposable, DisposableStore, MutableDisposable } from '../../../../../base/common/lifecycle.js';
import { localize } from '../../../../../nls.js';
import { IWorkbenchContribution } from '../../../../common/contributions.js';
import { IStatusbarEntry, IStatusbarEntryAccessor, IStatusbarService, ShowTooltipCommand, StatusbarAlignment, StatusbarEntryKind } from '../../../../services/statusbar/browser/statusbar.js';
import { ChatEntitlement, ChatEntitlementService, IChatEntitlementService, isProUser } from '../../../../services/chat/common/chatEntitlementService.js';
import { CancellationToken } from '../../../../../base/common/cancellation.js';
import { IConfigurationService } from '../../../../../platform/configuration/common/configuration.js';
import { contrastBorder, inputValidationErrorBorder, inputValidationInfoBorder, inputValidationWarningBorder, registerColor, transparent } from '../../../../../platform/theme/common/colorRegistry.js';
import { Color } from '../../../../../base/common/color.js';
import { IEditorService } from '../../../../services/editor/common/editorService.js';
import product from '../../../../../platform/product/common/product.js';
import { isObject } from '../../../../../base/common/types.js';
import { IInstantiationService } from '../../../../../platform/instantiation/common/instantiation.js';
import { getCodeEditor } from '../../../../../editor/browser/editorBrowser.js';
import { IInlineCompletionsService } from '../../../../../editor/browser/services/inlineCompletionsService.js';
import { IChatSessionsService } from '../../common/chatSessionsService.js';
import { ChatStatusDashboard } from './chatStatusDashboard.js';
import { mainWindow } from '../../../../../base/browser/window.js';
import { disposableWindowInterval } from '../../../../../base/browser/dom.js';

const gaugeForeground = registerColor('gauge.foreground', {
	dark: inputValidationInfoBorder,
	light: inputValidationInfoBorder,
	hcDark: contrastBorder,
	hcLight: contrastBorder
}, localize('gaugeForeground', "Gauge foreground color."));

registerColor('gauge.background', {
	dark: transparent(gaugeForeground, 0.3),
	light: transparent(gaugeForeground, 0.3),
	hcDark: Color.white,
	hcLight: Color.white
}, localize('gaugeBackground', "Gauge background color."));

registerColor('gauge.border', {
	dark: null,
	light: null,
	hcDark: contrastBorder,
	hcLight: contrastBorder
}, localize('gaugeBorder', "Gauge border color."));

const gaugeWarningForeground = registerColor('gauge.warningForeground', {
	dark: inputValidationWarningBorder,
	light: inputValidationWarningBorder,
	hcDark: contrastBorder,
	hcLight: contrastBorder
}, localize('gaugeWarningForeground', "Gauge warning foreground color."));

registerColor('gauge.warningBackground', {
	dark: transparent(gaugeWarningForeground, 0.3),
	light: transparent(gaugeWarningForeground, 0.3),
	hcDark: Color.white,
	hcLight: Color.white
}, localize('gaugeWarningBackground', "Gauge warning background color."));

const gaugeErrorForeground = registerColor('gauge.errorForeground', {
	dark: inputValidationErrorBorder,
	light: inputValidationErrorBorder,
	hcDark: contrastBorder,
	hcLight: contrastBorder
}, localize('gaugeErrorForeground', "Gauge error foreground color."));

registerColor('gauge.errorBackground', {
	dark: transparent(gaugeErrorForeground, 0.3),
	light: transparent(gaugeErrorForeground, 0.3),
	hcDark: Color.white,
	hcLight: Color.white
}, localize('gaugeErrorBackground', "Gauge error background color."));

//#endregion

export const defaultChat = {
	completionsEnablementSetting: product.defaultChatAgent?.completionsEnablementSetting ?? '',
	nextEditSuggestionsSetting: product.defaultChatAgent?.nextEditSuggestionsSetting ?? '',
	manageSettingsUrl: product.defaultChatAgent?.manageSettingsUrl ?? '',
	manageOverageUrl: product.defaultChatAgent?.manageOverageUrl ?? '',
	provider: product.defaultChatAgent?.provider ?? { default: { id: '', name: '' }, enterprise: { id: '', name: '' }, apple: { id: '', name: '' }, google: { id: '', name: '' } },
	termsStatementUrl: product.defaultChatAgent?.termsStatementUrl ?? '',
	privacyStatementUrl: product.defaultChatAgent?.privacyStatementUrl ?? ''
};

export class ChatStatusBarEntry extends Disposable implements IWorkbenchContribution {

	static readonly ID = 'workbench.contrib.chatStatusBarEntry';

	private entry: IStatusbarEntryAccessor | undefined = undefined;

	private readonly activeCodeEditorListener = this._register(new MutableDisposable());

	constructor(
		@IChatEntitlementService private readonly chatEntitlementService: ChatEntitlementService,
		@IInstantiationService private readonly instantiationService: IInstantiationService,
		@IStatusbarService private readonly statusbarService: IStatusbarService,
		@IEditorService private readonly editorService: IEditorService,
		@IConfigurationService private readonly configurationService: IConfigurationService,
		@IInlineCompletionsService private readonly completionsService: IInlineCompletionsService,
		@IChatSessionsService private readonly chatSessionsService: IChatSessionsService,
	) {
		super();

		this.update();
		this.registerListeners();
	}

	private update(): void {
		const sentiment = this.chatEntitlementService.sentiment;
		if (!sentiment.hidden) {
			const props = this.getEntryProps();
			if (this.entry) {
				this.entry.update(props);
			} else {
				this.entry = this.statusbarService.addEntry(props, 'chat.statusBarEntry', StatusbarAlignment.RIGHT, { location: { id: 'status.editor.mode', priority: 100.1 }, alignment: StatusbarAlignment.RIGHT });
			}
		} else {
			this.entry?.dispose();
			this.entry = undefined;
		}
	}

	private registerListeners(): void {
		this._register(this.chatEntitlementService.onDidChangeQuotaExceeded(() => this.update()));
		this._register(this.chatEntitlementService.onDidChangeSentiment(() => this.update()));
		this._register(this.chatEntitlementService.onDidChangeEntitlement(() => this.update()));
		this._register(this.completionsService.onDidChangeIsSnoozing(() => this.update()));
		this._register(this.chatSessionsService.onDidChangeInProgress(() => this.update()));

		this._register(this.editorService.onDidActiveEditorChange(() => this.onDidActiveEditorChange()));

		this._register(this.configurationService.onDidChangeConfiguration(e => {
			if (e.affectsConfiguration(defaultChat.completionsEnablementSetting)) {
				this.update();
			}
		}));
	}

	private onDidActiveEditorChange(): void {
		this.update();

		this.activeCodeEditorListener.clear();

		// Listen to language changes in the active code editor
		const activeCodeEditor = getCodeEditor(this.editorService.activeTextEditorControl);
		if (activeCodeEditor) {
			this.activeCodeEditorListener.value = activeCodeEditor.onDidChangeModelLanguage(() => {
				this.update();
			});
		}
	}

	private getEntryProps(): IStatusbarEntry {
		let text = '$(copilot)';
		let ariaLabel = localize('chatStatusAria', "Copilot status");
		let kind: StatusbarEntryKind | undefined;

		if (isNewUser(this.chatEntitlementService)) {
			const entitlement = this.chatEntitlementService.entitlement;

			// Finish Setup
			if (
				this.chatEntitlementService.sentiment.later ||	// user skipped setup
				entitlement === ChatEntitlement.Available ||	// user is entitled
				isProUser(entitlement) ||						// user is already pro
				entitlement === ChatEntitlement.Free			// user is already free
			) {
				const finishSetup = localize('finishSetup', "Finish Setup");

				text = `$(copilot) ${finishSetup}`;
				ariaLabel = finishSetup;
				kind = 'prominent';
			}
		} else {
			const chatQuotaExceeded = this.chatEntitlementService.quotas.chat?.percentRemaining === 0;
			const completionsQuotaExceeded = this.chatEntitlementService.quotas.completions?.percentRemaining === 0;
			const chatSessionsInProgressCount = this.chatSessionsService.getInProgress().reduce((total, item) => total + item.count, 0);

			// Disabled
			if (this.chatEntitlementService.sentiment.disabled || this.chatEntitlementService.sentiment.untrusted) {
				text = '$(copilot-unavailable)';
				ariaLabel = localize('copilotDisabledStatus', "Copilot disabled");
			}

			// Sessions in progress
			else if (chatSessionsInProgressCount > 0) {
				text = '$(copilot-in-progress)';
				if (chatSessionsInProgressCount > 1) {
					ariaLabel = localize('chatSessionsInProgressStatus', "{0} agent sessions in progress", chatSessionsInProgressCount);
				} else {
					ariaLabel = localize('chatSessionInProgressStatus', "1 agent session in progress");
				}
			}

			// Signed out
			else if (this.chatEntitlementService.entitlement === ChatEntitlement.Unknown) {
				const signedOutWarning = localize('notSignedIn', "Signed out");

				text = `${this.chatEntitlementService.anonymous ? '$(copilot)' : '$(copilot-not-connected)'} ${signedOutWarning}`;
				ariaLabel = signedOutWarning;
				kind = 'prominent';
			}

			// Free Quota Exceeded
			else if (this.chatEntitlementService.entitlement === ChatEntitlement.Free && (chatQuotaExceeded || completionsQuotaExceeded)) {
				let quotaWarning: string;
				if (chatQuotaExceeded && !completionsQuotaExceeded) {
					quotaWarning = localize('chatQuotaExceededStatus', "Chat quota reached");
				} else if (completionsQuotaExceeded && !chatQuotaExceeded) {
					quotaWarning = localize('completionsQuotaExceededStatus', "Inline suggestions quota reached");
				} else {
					quotaWarning = localize('chatAndCompletionsQuotaExceededStatus', "Quota reached");
				}

				text = `$(copilot-warning) ${quotaWarning}`;
				ariaLabel = quotaWarning;
				kind = 'prominent';
			}

			// Completions Disabled
			else if (this.editorService.activeTextEditorLanguageId && !isCompletionsEnabled(this.configurationService, this.editorService.activeTextEditorLanguageId)) {
				text = '$(copilot-unavailable)';
				ariaLabel = localize('completionsDisabledStatus', "Inline suggestions disabled");
			}

			// Completions Snoozed
			else if (this.completionsService.isSnoozing()) {
				text = '$(copilot-snooze)';
				ariaLabel = localize('completionsSnoozedStatus', "Inline suggestions snoozed");
			}
		}

		const baseResult = {
			name: localize('chatStatus', "Copilot Status"),
			text,
			ariaLabel,
			command: ShowTooltipCommand,
			showInAllWindows: true,
			kind,
			tooltip: {
				element: (token: CancellationToken) => {
					const store = new DisposableStore();
					store.add(token.onCancellationRequested(() => {
						store.dispose();
					}));
					const elem = ChatStatusDashboard.instantiateInContents(this.instantiationService, store);

					// todo@connor4312/@benibenj: workaround for #257923
					store.add(disposableWindowInterval(mainWindow, () => {
						if (!elem.isConnected) {
							store.dispose();
						}
					}, 2000));

					return elem;
				}
			}
		} satisfies IStatusbarEntry;

		return baseResult;
	}

	override dispose(): void {
		super.dispose();

		this.entry?.dispose();
		this.entry = undefined;
	}
}

export function isNewUser(chatEntitlementService: IChatEntitlementService): boolean {
	return !chatEntitlementService.sentiment.installed ||					// chat not installed
		chatEntitlementService.entitlement === ChatEntitlement.Available;	// not yet signed up to chat
}

export function canUseChat(chatEntitlementService: IChatEntitlementService): boolean {
	if (!chatEntitlementService.sentiment.installed || chatEntitlementService.sentiment.disabled || chatEntitlementService.sentiment.untrusted) {
		return false; // chat not installed or not enabled
	}

	if (chatEntitlementService.entitlement === ChatEntitlement.Unknown || chatEntitlementService.entitlement === ChatEntitlement.Available) {
		return chatEntitlementService.anonymous; // signed out or not-yet-signed-up users can only use Chat if anonymous access is allowed
	}

	if (chatEntitlementService.entitlement === ChatEntitlement.Free && chatEntitlementService.quotas.chat?.percentRemaining === 0 && chatEntitlementService.quotas.completions?.percentRemaining === 0) {
		return false; // free user with no quota left
	}

	return true;
}

export function isCompletionsEnabled(configurationService: IConfigurationService, modeId: string = '*'): boolean {
	const result = configurationService.getValue<Record<string, boolean>>(defaultChat.completionsEnablementSetting);
	if (!isObject(result)) {
		return false;
	}

	if (typeof result[modeId] !== 'undefined') {
		return Boolean(result[modeId]); // go with setting if explicitly defined
	}

	return Boolean(result['*']); // fallback to global setting otherwise
}
