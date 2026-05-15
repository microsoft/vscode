/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import './media/chatStatus.css';
import { Disposable, DisposableStore, MutableDisposable } from '../../../../../base/common/lifecycle.js';
import { localize } from '../../../../../nls.js';
import { IWorkbenchContribution } from '../../../../common/contributions.js';
import { IStatusbarEntry, IStatusbarEntryAccessor, IStatusbarService, ShowTooltipCommand, StatusbarAlignment, StatusbarEntryKind } from '../../../../services/statusbar/browser/statusbar.js';
import { ChatEntitlement, ChatEntitlementContextKeys, ChatEntitlementService, IChatEntitlementService, isProUser } from '../../../../services/chat/common/chatEntitlementService.js';
import { CancellationToken } from '../../../../../base/common/cancellation.js';
import { IConfigurationService } from '../../../../../platform/configuration/common/configuration.js';
import { IEditorService } from '../../../../services/editor/common/editorService.js';
import { IInstantiationService } from '../../../../../platform/instantiation/common/instantiation.js';
import { getCodeEditor } from '../../../../../editor/browser/editorBrowser.js';
import { IInlineCompletionsService } from '../../../../../editor/browser/services/inlineCompletionsService.js';
import { IChatSessionsService } from '../../common/chatSessionsService.js';
import { ChatStatusDashboard } from './chatStatusDashboard.js';
import { mainWindow } from '../../../../../base/browser/window.js';
import { $ as h, disposableWindowInterval } from '../../../../../base/browser/dom.js';
import { isNewUser } from './chatStatus.js';
import product from '../../../../../platform/product/common/product.js';
import { isCompletionsEnabled } from '../../../../../editor/common/services/completionsEnablement.js';
import { CHAT_SETUP_ACTION_ID } from '../actions/chatActions.js';
import { IContextKeyService } from '../../../../../platform/contextkey/common/contextkey.js';
import { isWeb } from '../../../../../base/common/platform.js';
import { InEditorZenModeContext } from '../../../../common/contextkeys.js';
import { ChatConfiguration } from '../../common/constants.js';

export class ChatStatusBarEntry extends Disposable implements IWorkbenchContribution {

	static readonly ID = 'workbench.contrib.chatStatusBarEntry';

	private static readonly TITLE_BAR_CONTEXT_KEYS = new Set(['updateTitleBar', InEditorZenModeContext.key, ChatEntitlementContextKeys.hasByokModels.key]);

	private entry: IStatusbarEntryAccessor | undefined = undefined;

	private readonly activeCodeEditorListener = this._register(new MutableDisposable());
	private readonly entryAnchor = h('span');

	private runningSessionsCount: number;

	constructor(
		@IChatEntitlementService private readonly chatEntitlementService: ChatEntitlementService,
		@IInstantiationService private readonly instantiationService: IInstantiationService,
		@IStatusbarService private readonly statusbarService: IStatusbarService,
		@IEditorService private readonly editorService: IEditorService,
		@IConfigurationService private readonly configurationService: IConfigurationService,
		@IInlineCompletionsService private readonly completionsService: IInlineCompletionsService,
		@IChatSessionsService private readonly chatSessionsService: IChatSessionsService,
		@IContextKeyService private readonly contextKeyService: IContextKeyService,
	) {
		super();

		this.runningSessionsCount = this.chatSessionsService.getInProgress().reduce((total, item) => total + item.count, 0);

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
		this._register(this.contextKeyService.onDidChangeContext(e => {
			if (e.affectsSome(ChatStatusBarEntry.TITLE_BAR_CONTEXT_KEYS)) {
				this.update();
			}
		}));

		this._register(this.completionsService.onDidChangeIsSnoozing(() => this.update()));

		this._register(this.chatSessionsService.onDidChangeInProgress(() => {
			const oldSessionsCount = this.runningSessionsCount;
			this.runningSessionsCount = this.chatSessionsService.getInProgress().reduce((total, item) => total + item.count, 0);
			if (this.runningSessionsCount !== oldSessionsCount) {
				this.update();
			}
		}));

		this._register(this.editorService.onDidActiveEditorChange(() => this.onDidActiveEditorChange()));

		this._register(this.configurationService.onDidChangeConfiguration(e => {
			if (e.affectsConfiguration(product.defaultChatAgent?.completionsEnablementSetting) || e.affectsConfiguration(ChatConfiguration.TitleBarSignInEnabled)) {
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

			// Sign In
			if (
				this.chatEntitlementService.sentiment.later ||	// user skipped setup
				entitlement === ChatEntitlement.Available ||	// user is entitled
				isProUser(entitlement) ||						// user is already pro
				entitlement === ChatEntitlement.Free			// user is already free
			) {
				return this.getSetupEntryProps();
			}
		} else {
			const quotas = this.chatEntitlementService.quotas;
			const chatQuotaExceeded = quotas.chat?.percentRemaining === 0;
			const completionsQuotaExceeded = quotas.completions?.percentRemaining === 0;
			const isPooledQuotaDepleted = quotas.premiumChat?.unlimited && quotas.premiumChat.hasQuota === false && !(quotas.additionalUsageEnabled ?? false);

			// Disabled
			if (this.chatEntitlementService.sentiment.disabled || this.chatEntitlementService.sentiment.untrusted) {
				text = '$(copilot-unavailable)';
				ariaLabel = localize('copilotDisabledStatus', "Copilot disabled");
			}

			// Sessions in progress
			else if (this.runningSessionsCount > 0) {
				text = '$(copilot-in-progress)';
				if (this.runningSessionsCount > 1) {
					ariaLabel = localize('chatSessionsInProgressStatus', "{0} agent sessions in progress", this.runningSessionsCount);
				} else {
					ariaLabel = localize('chatSessionInProgressStatus', "1 agent session in progress");
				}
			}

			// Signed out
			else if (this.chatEntitlementService.entitlement === ChatEntitlement.Unknown && !this.chatEntitlementService.hasByokModels) {
				return this.getSetupEntryProps();
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

			// Pooled Entitlement Exhausted (Business/Enterprise)
			else if ((this.chatEntitlementService.entitlement === ChatEntitlement.Business || this.chatEntitlementService.entitlement === ChatEntitlement.Enterprise) && isPooledQuotaDepleted) {
				const quotaWarning = localize('chatAndCompletionsQuotaExceededStatus', "Quota reached");
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
			content: this.entryAnchor,
			tooltip: {
				element: (token: CancellationToken) => {
					const store = new DisposableStore();
					store.add(token.onCancellationRequested(() => {
						store.dispose();
					}));
					const elem = ChatStatusDashboard.instantiateInContents(this.instantiationService, store, undefined);

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

	private getSetupEntryProps(): IStatusbarEntry {
		const showSignInLabel = !this.isSignInTitleBarAffordanceVisible();
		const signInLabel = localize('signIn', "Sign In");
		return {
			name: localize('chatStatus', "Copilot Status"),
			text: showSignInLabel ? `$(copilot) ${signInLabel}` : '$(copilot)',
			ariaLabel: showSignInLabel ? signInLabel : localize('chatStatusAria', "Copilot status"),
			command: CHAT_SETUP_ACTION_ID,
			showInAllWindows: true,
			kind: undefined,
			content: this.entryAnchor,
		};
	}

	private isSignInTitleBarAffordanceVisible(): boolean {
		if (isWeb) {
			return false;
		}

		// Title bar sign-in button only shows when user is signed out
		if (this.chatEntitlementService.entitlement !== ChatEntitlement.Unknown) {
			return false;
		}

		if (this.chatEntitlementService.sentiment.hidden || this.chatEntitlementService.sentiment.disabledInWorkspace) {
			return false;
		}

		const hasTitleBarUpdate = Boolean(this.contextKeyService.getContextKeyValue('updateTitleBar'));
		if (hasTitleBarUpdate) {
			return false;
		}

		const inZenMode = Boolean(this.contextKeyService.getContextKeyValue(InEditorZenModeContext.key));
		if (inZenMode) {
			return false;
		}

		const signInTitleBarEnabled = this.configurationService.getValue<boolean>(ChatConfiguration.TitleBarSignInEnabled) !== false;
		return signInTitleBarEnabled;
	}

	override dispose(): void {
		super.dispose();

		this.entry?.dispose();
		this.entry = undefined;
	}
}
